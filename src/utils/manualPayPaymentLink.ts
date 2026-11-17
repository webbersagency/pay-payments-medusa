import {
  ContainerRegistrationKeys,
  MathBN,
  MedusaError,
  Modules,
  PaymentCollectionStatus,
} from "@medusajs/framework/utils"
import {IUserModuleService, Logger, MedusaContainer} from "@medusajs/types"
import {
  PAY_MANUAL_LINK_KEY,
  PayPaymentStatus,
} from "../providers/pay/core/constants"
import {PaymentProviderKeys} from "../providers/pay/types"
import {payPaymentMethods} from "../constants"
import {getPayClient} from "./getPayClient"

export {PAY_MANUAL_LINK_KEY}

/**
 * Manually linked payments get a session with the hosted checkout provider:
 * it accepts any Pay. payment method and has no method specific behaviour
 * (unlike e.g. direct debit) that would not fit a payment made elsewhere.
 */
export const PAY_MANUAL_LINK_PROVIDER_ID = `pp_${PaymentProviderKeys.PAY_HOSTED_CHECKOUT}_pay`

/** Statuses a Pay. payment must have to be linked to an order */
const LINKABLE_STATUSES: number[] = [
  PayPaymentStatus.PAID,
  PayPaymentStatus.AUTHORIZE,
]

/** Payment collection statuses that mean another payment is in progress */
const IN_PROGRESS_COLLECTION_STATUSES: string[] = [
  PaymentCollectionStatus.AWAITING,
  PaymentCollectionStatus.AUTHORIZED,
  PaymentCollectionStatus.PARTIALLY_AUTHORIZED,
]

const STATUS_LABELS: Record<number, string> = {
  [PayPaymentStatus.INIT]: "pending",
  [PayPaymentStatus.PENDING_50]: "pending",
  [PayPaymentStatus.PENDING_90]: "pending",
  [PayPaymentStatus.PENDING_98]: "pending",
  [PayPaymentStatus.CANCEL]: "canceled",
  [PayPaymentStatus.EXPIRED]: "expired",
  [PayPaymentStatus.DENIED_64]: "denied",
  [PayPaymentStatus.DENIED_63]: "denied",
  [PayPaymentStatus.CANCEL_61]: "canceled",
  [PayPaymentStatus.FAILURE]: "failed",
  [PayPaymentStatus.PAID_CHECKAMOUNT]: "paid, amount differs",
  [PayPaymentStatus.PARTIAL_PAYMENT]: "partially paid",
  [PayPaymentStatus.VERIFY]: "verify",
  [PayPaymentStatus.AUTHORIZE]: "authorized",
  [PayPaymentStatus.PARTLY_CAPTURED]: "partly captured",
  [PayPaymentStatus.PAID]: "paid",
  [PayPaymentStatus.CHARGEBACK]: "charged back",
  [PayPaymentStatus.REFUNDING]: "refunding",
  [PayPaymentStatus.REFUND]: "refunded",
  [PayPaymentStatus.PARTIAL_REFUND]: "partially refunded",
}

/** Who linked a Pay. payment, stored on the session / payment data */
export type PayManualLink = {
  /** The id as the admin entered it */
  pay_id: string
  /** Pay.'s order id, what the provider uses for capture / refund */
  pay_order_id: string
  amount: number
  currency_code: string
  method_id: number | null
  method_name: string | null
  reference: string | null
  linked_by: string
  linked_by_email: string | null
  linked_at: string
}

/** A Pay. payment in the shape the admin works with, amounts in major units */
export type PayPaymentSummary = {
  pay_order_id: string
  status_code: number | null
  status_label: string | null
  amount: number
  paid: number
  refunded: number
  currency_code: string | null
  method_id: number | null
  method_name: string | null
  reference: string | null
  description: string | null
  created_at: string | null
  test_mode: boolean | null
}

export type ManualLinkCheck = {
  order: {
    id: string
    display_id: number | null
    status: string | null
    currency_code: string | null
    /** What the customer still owes, rounded to cents */
    outstanding: number
  }
  payment: PayPaymentSummary
  /** Raw Pay. response, becomes the payment session data */
  raw: Record<string, any>
  /** What will be recorded as captured on the order */
  amount: number
  /** Existing not_paid collection to link to, null creates a new one */
  payment_collection_id: string | null
  /** Reasons the payment cannot be linked, empty when it can */
  problems: string[]
  linked_by_email: string | null
}

export type LinkPayPaymentInput = {
  order_id: string
  pay_id: string
  actor_id: string
  actor_type?: string
}

const PAY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{2,63}$/

/** Trims the entered id and rejects anything that is not a Pay. id */
export function normalizePayId(input: unknown): string | null {
  if (typeof input !== "string") {
    return null
  }

  const trimmed = input.trim()

  return PAY_ID_PATTERN.test(trimmed) ? trimmed : null
}

const toNumber = (value: unknown): number => {
  const numeric = Number(value)

  return Number.isFinite(numeric) ? numeric : 0
}

const roundToCents = (amount: number): number =>
  Math.round(amount * 100) / 100 || 0

const fromMinorUnits = (value: unknown): number =>
  roundToCents(toNumber(value) / 100)

/**
 * Pay. answers with a REST v2 transaction (amountPaid / amountRefunded /
 * paymentMethod) or a TGU order (capturedAmount / payments[]), depending on
 * which endpoint knew the id. Both become the same summary.
 */
export function summarizePayPayment(
  raw: Record<string, any>
): PayPaymentSummary {
  const statusCode =
    raw?.status?.code === undefined || raw?.status?.code === null
      ? null
      : Number(raw.status.code)
  const amount = fromMinorUnits(raw?.amount?.value)
  const paidValue = raw?.amountPaid?.value ?? raw?.capturedAmount?.value
  let paid = fromMinorUnits(paidValue)

  if (!paid && statusCode === PayPaymentStatus.PAID) {
    paid = amount
  }

  const methodId =
    raw?.paymentMethod?.id ?? raw?.payments?.[0]?.paymentMethod?.id ?? null
  const currency =
    raw?.amount?.currency ?? raw?.amountPaid?.currency ?? null
  const testMode = raw?.integration?.testMode ?? raw?.integration?.test

  return {
    pay_order_id: String(raw?.orderId ?? raw?.id ?? ""),
    status_code: statusCode,
    status_label:
      statusCode === null ? null : (STATUS_LABELS[statusCode] ?? null),
    amount,
    paid,
    refunded: fromMinorUnits(raw?.amountRefunded?.value),
    currency_code: currency ? String(currency).toLowerCase() : null,
    method_id: methodId === null ? null : Number(methodId),
    method_name:
      methodId === null
        ? null
        : (payPaymentMethods.find((method) => method.id === Number(methodId))
            ?.name ?? null),
    reference: raw?.reference ? String(raw.reference) : null,
    description: raw?.description ? String(raw.description) : null,
    created_at: raw?.createdAt ? new Date(raw.createdAt).toISOString() : null,
    test_mode: typeof testMode === "boolean" ? testMode : null,
  }
}

/**
 * Looks a payment up at Pay. by transaction / order id, through the REST API
 * first and the TGU (orders created through the order API) second.
 */
export async function fetchPayPayment(
  container: MedusaContainer,
  payId: string
): Promise<Record<string, any>> {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const pay = getPayClient(container, logger)

  if (!pay) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The Pay. payment provider is not configured"
    )
  }

  try {
    return (await pay.client.getTransaction(payId)) as Record<string, any>
  } catch (transactionError) {
    try {
      return (await pay.client.getOrder(payId)) as Record<string, any>
    } catch (orderError) {
      logger.warn(
        `Pay. - Could not find payment ${payId}: ${transactionError.message} / ${orderError.message}`
      )
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Pay. payment ${payId} was not found`
      )
    }
  }
}

/**
 * Linking a Pay. payment by hand is limited to admin users with
 * `superadmin: true` in their metadata.
 */
export async function getPayLinkAdmin(
  container: MedusaContainer,
  actorId: string | undefined,
  actorType?: string
): Promise<{allowed: boolean; email: string | null}> {
  if (!actorId || (actorType && actorType !== "user")) {
    return {allowed: false, email: null}
  }

  const userModule = container.resolve<IUserModuleService>(Modules.USER)
  const user = await userModule.retrieveUser(actorId).catch(() => null)
  const superadmin = user?.metadata?.superadmin

  return {
    allowed: superadmin === true || superadmin === "true",
    email: user?.email ?? null,
  }
}

async function assertPayLinkAdmin(
  container: MedusaContainer,
  actorId: string,
  actorType?: string
): Promise<string | null> {
  const admin = await getPayLinkAdmin(container, actorId, actorType)

  if (!admin.allowed) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Only superadmins can link Pay. payments to orders"
    )
  }

  return admin.email
}

/**
 * Payment sessions (of any order) that already hold this Pay. payment, either
 * from the regular checkout flow or from an earlier manual link.
 */
export async function findSessionsForPayPayment(
  container: MedusaContainer,
  payIds: string[]
): Promise<{id: string; payment_collection_id: string}[]> {
  const ids = [...new Set(payIds.filter(Boolean))]

  if (!ids.length) {
    return []
  }

  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  return knex("payment_session")
    .select("id", "payment_collection_id")
    .whereNull("deleted_at")
    .whereRaw(
      "(data->>'orderId' = ANY(?::text[]) OR data->>'id' = ANY(?::text[]))",
      [ids, ids]
    )
}

async function describeLinkedOrders(
  container: MedusaContainer,
  collectionIds: string[]
): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const {data: collections} = await query
    .graph({
      entity: "payment_collection",
      fields: ["id", "order.id", "order.display_id"],
      filters: {id: [...new Set(collectionIds.filter(Boolean))]},
    })
    .catch(() => ({data: [] as any[]}))

  const orders = [
    ...new Set(
      (collections as any[])
        .map((collection) => collection?.order?.display_id)
        .filter((displayId) => displayId !== undefined && displayId !== null)
        .map((displayId) => `#${displayId}`)
    ),
  ]

  return orders.length ? `order ${orders.join(", ")}` : "another payment"
}

/**
 * Everything the admin needs to decide on a manual link, and the reasons it
 * would be refused. Read-only: used for the preview and, again, inside the
 * link workflow right before anything is written.
 */
export async function checkManualPayPaymentLink(
  container: MedusaContainer,
  input: LinkPayPaymentInput
): Promise<ManualLinkCheck> {
  const linkedByEmail = await assertPayLinkAdmin(
    container,
    input.actor_id,
    input.actor_type
  )

  const payId = normalizePayId(input.pay_id)

  if (!payId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Enter a valid Pay. transaction or order id"
    )
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "currency_code",
      "summary",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.created_at",
    ],
    filters: {id: input.order_id},
  })

  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
  }

  const raw = await fetchPayPayment(container, payId)
  const payment = summarizePayPayment(raw)

  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const testMode = getPayClient(container, logger)?.options.testMode ?? false

  const summary = ((order as any).summary ?? {}) as Record<string, any>
  const outstanding = roundToCents(toNumber(summary.pending_difference))
  const orderCurrency = ((order as any).currency_code ?? "").toLowerCase()
  const amount =
    payment.status_code === PayPaymentStatus.AUTHORIZE
      ? payment.amount
      : payment.paid || payment.amount

  const collections = ((order as any).payment_collections ?? []) as Record<
    string,
    any
  >[]

  const problems: string[] = []

  if ((order as any).status === "canceled") {
    problems.push("The order is canceled, a payment cannot be linked to it.")
  }

  if (
    payment.status_code === null ||
    !LINKABLE_STATUSES.includes(payment.status_code)
  ) {
    problems.push(
      `The Pay. payment is ${payment.status_label ?? "in an unknown state"} (status ${
        payment.status_code ?? "unknown"
      }), only paid or authorized payments can be linked.`
    )
  }

  if (payment.refunded > 0) {
    problems.push("The Pay. payment has already been (partly) refunded.")
  }

  if (payment.currency_code && payment.currency_code !== orderCurrency) {
    problems.push(
      `The Pay. payment is in ${payment.currency_code.toUpperCase()}, the order in ${orderCurrency.toUpperCase()}.`
    )
  }

  if (payment.test_mode === true && !testMode) {
    problems.push(
      "The Pay. payment is a test payment, it cannot be linked on a live shop."
    )
  }

  if (amount <= 0) {
    problems.push("The Pay. payment has no amount to link.")
  }

  if (outstanding <= 0) {
    problems.push("Nothing is outstanding on this order.")
  } else if (MathBN.gt(amount, outstanding)) {
    problems.push(
      `The Pay. payment (${amount.toFixed(2)}) is more than the ${outstanding.toFixed(2)} still outstanding on this order.`
    )
  }

  const inProgress = collections.find((collection) =>
    IN_PROGRESS_COLLECTION_STATUSES.includes(collection?.status)
  )

  if (inProgress) {
    problems.push(
      `The order has a payment in progress (payment collection ${inProgress.status}), settle or cancel it first.`
    )
  }

  const existing = await findSessionsForPayPayment(container, [
    payId,
    payment.pay_order_id,
  ])

  if (existing.length) {
    const where = await describeLinkedOrders(
      container,
      existing.map((session) => session.payment_collection_id)
    )

    problems.push(`This Pay. payment already belongs to ${where}.`)
  }

  const openCollection = collections
    .filter((collection) => collection?.status === PaymentCollectionStatus.NOT_PAID)
    .sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime()
    )[0]

  return {
    order: {
      id: (order as any).id,
      display_id: (order as any).display_id ?? null,
      status: (order as any).status ?? null,
      currency_code: orderCurrency || null,
      outstanding,
    },
    payment,
    raw,
    amount,
    payment_collection_id: openCollection?.id ?? null,
    problems,
    linked_by_email: linkedByEmail,
  }
}

/**
 * The payment session data for a manually linked payment: the Pay. response
 * (refunds read the currency from it), keyed by Pay.'s order id the way the
 * provider expects it, plus who linked it.
 */
export function buildManualLinkSessionData(
  check: ManualLinkCheck,
  input: LinkPayPaymentInput,
  linkedAt: Date = new Date()
): Record<string, unknown> {
  const currency = (
    check.raw?.amount?.currency ??
    check.payment.currency_code ??
    check.order.currency_code ??
    ""
  ).toUpperCase()

  const link: PayManualLink = {
    pay_id: normalizePayId(input.pay_id) ?? input.pay_id,
    pay_order_id: check.payment.pay_order_id,
    amount: check.amount,
    currency_code: (check.payment.currency_code ??
      check.order.currency_code ??
      "") as string,
    method_id: check.payment.method_id,
    method_name: check.payment.method_name,
    reference: check.payment.reference,
    linked_by: input.actor_id,
    linked_by_email: check.linked_by_email,
    linked_at: linkedAt.toISOString(),
  }

  return {
    ...check.raw,
    pay_id: check.raw?.id ?? null,
    // getPaymentStatus reads data.id, capture / refund data.orderId
    id: check.payment.pay_order_id,
    orderId: check.payment.pay_order_id,
    amount: {...(check.raw?.amount ?? {}), currency},
    [PAY_MANUAL_LINK_KEY]: link,
  }
}

export type LinkedPayPayment = {
  payment_session_id: string
  payment_id: string | null
  link: PayManualLink
  /** What Medusa recorded, major units */
  captured: number
  refunded: number
  /** Present when the live state was requested */
  live?: {
    payment: PayPaymentSummary | null
    error: string | null
    /** Differences between Pay. and Medusa that need attention */
    warnings: string[]
  }
}

export type LinkedPayPayments = {
  /** Whether the current admin may link payments */
  can_link: boolean
  order_status: string | null
  currency_code: string | null
  outstanding: number
  payments: LinkedPayPayment[]
}

const sumAmounts = (items: {amount?: unknown}[] | undefined) =>
  roundToCents(
    (items ?? []).reduce((total, item) => total + toNumber(item?.amount), 0)
  )

function compareWithPay(
  linked: LinkedPayPayment,
  payment: PayPaymentSummary
): string[] {
  const warnings: string[] = []

  if (payment.status_code === PayPaymentStatus.CHARGEBACK) {
    warnings.push("Pay. reports a chargeback on this payment.")
  } else if (
    payment.status_code !== null &&
    !LINKABLE_STATUSES.includes(payment.status_code) &&
    payment.status_code !== PayPaymentStatus.REFUND &&
    payment.status_code !== PayPaymentStatus.PARTIAL_REFUND &&
    payment.status_code !== PayPaymentStatus.REFUNDING
  ) {
    warnings.push(
      `Pay. reports the payment as ${payment.status_label ?? "unknown"} (status ${payment.status_code}).`
    )
  }

  if (Math.abs(payment.refunded - linked.refunded) >= 0.01) {
    warnings.push(
      `Pay. reports ${payment.refunded.toFixed(2)} refunded, Medusa ${linked.refunded.toFixed(2)}.`
    )
  }

  return warnings
}

/**
 * The manually linked Pay. payments of an order, for the order page widget.
 * With `live`, each one is looked up at Pay. again so differences (refunds or
 * a chargeback done at Pay.) show up, since Pay. may not report them.
 */
export async function listManuallyLinkedPayments(
  container: MedusaContainer,
  orderId: string,
  {
    live = false,
    actorId,
    actorType,
  }: {live?: boolean; actorId?: string; actorType?: string} = {}
): Promise<LinkedPayPayments | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "currency_code",
      "summary",
      "payment_collections.payment_sessions.id",
      "payment_collections.payment_sessions.data",
      "payment_collections.payment_sessions.payment.id",
      "payment_collections.payment_sessions.payment.captures.amount",
      "payment_collections.payment_sessions.payment.refunds.amount",
    ],
    filters: {id: orderId},
  })

  if (!order) {
    return null
  }

  const sessions = ((order as any).payment_collections ?? []).flatMap(
    (collection: Record<string, any>) => collection?.payment_sessions ?? []
  ) as Record<string, any>[]

  const payments: LinkedPayPayment[] = sessions
    .filter((session) => session?.data?.[PAY_MANUAL_LINK_KEY])
    .map((session) => ({
      payment_session_id: session.id,
      payment_id: session.payment?.id ?? null,
      link: session.data[PAY_MANUAL_LINK_KEY] as PayManualLink,
      captured: sumAmounts(session.payment?.captures),
      refunded: sumAmounts(session.payment?.refunds),
    }))
    .sort(
      (a, b) =>
        new Date(b.link.linked_at).getTime() -
        new Date(a.link.linked_at).getTime()
    )

  if (live) {
    await Promise.all(
      payments.map(async (linked) => {
        try {
          const payment = summarizePayPayment(
            await fetchPayPayment(container, linked.link.pay_order_id)
          )

          linked.live = {
            payment,
            error: null,
            warnings: compareWithPay(linked, payment),
          }
        } catch (error) {
          linked.live = {payment: null, error: error.message, warnings: []}
        }
      })
    )
  }

  const admin = await getPayLinkAdmin(container, actorId, actorType)
  const summary = ((order as any).summary ?? {}) as Record<string, any>

  return {
    can_link: admin.allowed,
    order_status: (order as any).status ?? null,
    currency_code: (order as any).currency_code ?? null,
    outstanding: roundToCents(toNumber(summary.pending_difference)),
    payments,
  }
}
