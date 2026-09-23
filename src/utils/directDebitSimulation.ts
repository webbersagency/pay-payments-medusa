import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {IStoreModuleService, MedusaContainer} from "@medusajs/types"
import getPayPaymentSession from "./getPayPaymentSession"
import {isSimulatedDirectDebitMandate} from "./directDebitExchange"
import {PaymentProviderKeys, ProviderOptions} from "../providers/pay/types"
import {PayDirectDebitStatusCode} from "../providers/pay/core/constants"

/**
 * The exchanges a test server can simulate for a direct debit that only exists
 * locally (see README "Testing direct debits locally"). Each preset is the body
 * Pay. would send, minus the mandate and order reference that are filled in
 * from the order.
 */
export const SIMULATED_EXCHANGE_PRESETS = {
  pending: {
    label: "Pending",
    description: "The debit is scheduled, the collection stays awaiting.",
    payload: {action: "incassopending"},
  },
  sent: {
    label: "Sent to bank",
    description: "The debit was sent to the bank, the collection stays awaiting.",
    payload: {action: "incassosend"},
  },
  collected: {
    label: "Collected",
    description: "The bank collected the money: the payment is captured.",
    payload: {action: "incassocollected"},
  },
  storno: {
    label: "Storno",
    description:
      "The customer reversed the debit after collection: the payment is refunded in Medusa and the order becomes payable again.",
    payload: {action: "incassostorno"},
  },
  failed: {
    label: "Failed",
    description: "The bank rejected the debit: the collection fails.",
    payload: {
      action: "incassosend",
      status: {code: PayDirectDebitStatusCode.FAILED},
    },
  },
  declined: {
    label: "Declined",
    description: "The debit was declined: the collection fails.",
    payload: {action: "incassosend", declined: true},
  },
} as const

export type SimulatedExchangeKey = keyof typeof SIMULATED_EXCHANGE_PRESETS

export const isSimulatedExchangeKey = (
  value: unknown
): value is SimulatedExchangeKey =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(SIMULATED_EXCHANGE_PRESETS, value)

export type DirectDebitSimulationState = {
  /** Whether exchanges can be simulated for this order */
  available: boolean
  /** Why not, when unavailable */
  reason?:
    | "sepa_testing_off"
    | "test_mode_off"
    | "no_direct_debit"
    | "not_simulated"
  testMode: boolean
  /** The "SEPA testing" switch on the Pay. settings page */
  sepaTesting: boolean
  orderId: string
  displayId: string
  mandateCode: string | null
  paymentCollectionId: string | null
  paymentCollectionStatus: string | null
  captured: boolean
  presets: Record<
    SimulatedExchangeKey,
    {label: string; description: string}
  >
}

export const getPayProviderOptions = (
  container: MedusaContainer
): ProviderOptions | null => {
  const configModule = container.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE
  )

  const payModuleConfig = (configModule.modules?.payment as any)?.options
    ?.providers?.find((p) => p.id === "pay")

  return (payModuleConfig?.options as ProviderOptions | undefined) ?? null
}

/**
 * The "SEPA testing" switch on the Pay. settings page lives in the store's
 * metadata, so it is shared by every admin user and needs no migration. Off by
 * default: it is meant for staging servers only.
 */
export const SEPA_TESTING_METADATA_KEY = "pay_sepa_testing"

const getStore = async (container: MedusaContainer) => {
  const storeModuleService = container.resolve<IStoreModuleService>(
    Modules.STORE
  )
  const [store] = await storeModuleService.listStores(
    {},
    {select: ["id", "metadata"], take: 1}
  )

  return store ?? null
}

export async function isSepaTestingEnabled(
  container: MedusaContainer
): Promise<boolean> {
  const store = await getStore(container)

  return store?.metadata?.[SEPA_TESTING_METADATA_KEY] === true
}

export async function setSepaTestingEnabled(
  container: MedusaContainer,
  enabled: boolean
): Promise<boolean> {
  const store = await getStore(container)

  if (!store) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "No store found")
  }

  const storeModuleService = container.resolve<IStoreModuleService>(
    Modules.STORE
  )

  await storeModuleService.updateStores(store.id, {
    metadata: {...(store.metadata ?? {}), [SEPA_TESTING_METADATA_KEY]: enabled},
  })

  return enabled
}

const presetSummaries = () =>
  Object.fromEntries(
    Object.entries(SIMULATED_EXCHANGE_PRESETS).map(([key, preset]) => [
      key,
      {label: preset.label, description: preset.description},
    ])
  ) as DirectDebitSimulationState["presets"]

export async function getDirectDebitSimulationState(
  container: MedusaContainer,
  orderId: string
): Promise<DirectDebitSimulationState | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const options = getPayProviderOptions(container)
  // Same default as the HTTP client: an unset testMode means test mode
  const testMode = options?.testMode ?? true
  const sepaTesting = await isSepaTestingEnabled(container)

  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.payment_sessions.*",
      "payment_collections.payment_sessions.payment.id",
      "payment_collections.payment_sessions.payment.captured_at",
    ],
    filters: {id: orderId},
  })

  if (!order) {
    return null
  }

  const base = {
    testMode,
    sepaTesting,
    orderId: order.id,
    displayId: String(order.display_id),
    presets: presetSummaries(),
  }

  const payPaymentSession = getPayPaymentSession(order as any)

  if (
    !payPaymentSession?.provider_id.includes(PaymentProviderKeys.DIRECTDEBIT)
  ) {
    return {
      ...base,
      available: false,
      reason: "no_direct_debit",
      mandateCode: null,
      paymentCollectionId: null,
      paymentCollectionStatus: null,
      captured: false,
    }
  }

  const sessionData = (payPaymentSession.data ?? {}) as Record<string, any>
  const mandateCode =
    typeof sessionData.code === "string" ? sessionData.code : null
  const simulated =
    sessionData.testMode === true && isSimulatedDirectDebitMandate(mandateCode)
  const collection = (order.payment_collections ?? []).find(
    (pc) => pc?.id === payPaymentSession.payment_collection_id
  )

  const reason = !sepaTesting
    ? "sepa_testing_off"
    : !testMode
      ? "test_mode_off"
      : !simulated
        ? "not_simulated"
        : undefined

  return {
    ...base,
    available: !reason,
    reason,
    mandateCode,
    paymentCollectionId: (payPaymentSession.payment_collection_id as string) ?? null,
    paymentCollectionStatus: collection?.status ?? null,
    captured: !!(payPaymentSession as any).payment?.captured_at,
  }
}

/**
 * Builds the exchange body for a preset, as Pay. would send it for the order's
 * simulated mandate.
 */
export function buildSimulatedExchangePayload(
  key: SimulatedExchangeKey,
  state: Pick<DirectDebitSimulationState, "mandateCode" | "displayId">
): Record<string, unknown> {
  return {
    ...SIMULATED_EXCHANGE_PRESETS[key].payload,
    mandateId: state.mandateCode,
    reference: state.displayId,
  }
}
