import {SubscriberArgs, SubscriberConfig} from "@medusajs/framework"

import {
  ContainerRegistrationKeys,
  Modules,
  PaymentCollectionStatus,
} from "@medusajs/framework/utils"
import {capturePaymentWorkflow} from "@medusajs/core-flows"
import {
  IEventBusModuleService,
  IPaymentModuleService,
  Logger,
  MedusaContainer,
} from "@medusajs/types"
import getPayPaymentSession from "../utils/getPayPaymentSession"
import {reverseCapturedPayment} from "../utils/reverseCapturedPayment"
import {
  DirectDebitInfoResponse,
  PaymentProviderKeys,
  ProviderOptions,
} from "../providers/pay/types"
import {PayClient} from "../providers/pay/core/pay-client"
import {DirectDebit} from "../providers/pay/types"
import {PayDirectDebitStatusCode} from "../providers/pay/core/constants"
import {
  buildSimulatedDirectDebit,
  DIRECT_DEBIT_AWAITING_CODES,
  DIRECT_DEBIT_FAILED_CODES,
  extractDirectDebit,
  extractDirectDebitReference,
  isLegacyDirectDebitAction,
  normalizeAction,
  normalizeDirectDebitStatusAction,
  PAY_DIRECT_DEBIT_EXCHANGE_EVENT,
  parseDirectDebitDisplayId,
  readDirectDebitMandateId,
  readDirectDebitReferenceId,
  readPayloadString,
  readSimulatedMandateSessionId,
  isSimulatedDirectDebitMandate,
} from "../utils/directDebitExchange"

const getPayClient = (
  container: MedusaContainer,
  logger: Logger
): {client: PayClient; options: ProviderOptions} | null => {
  const configModule = container.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE
  )

  const payModuleConfig = (configModule.modules?.payment as any)?.options
    ?.providers?.find((p) => p.id === "pay")

  if (!payModuleConfig?.options) {
    logger.warn(
      "Pay. - Ignoring direct debit exchange: no Pay. provider options found"
    )
    return null
  }

  const options = payModuleConfig.options as ProviderOptions

  return {client: new PayClient(options, logger), options}
}

/**
 * The order display id a simulated exchange belongs to: the body's
 * `reference`, or the order behind the payment session encoded in the
 * simulated mandate code.
 */
const resolveSimulatedDisplayId = async (
  container: MedusaContainer,
  payload: Record<string, any>,
  mandateId: string
): Promise<string | null> => {
  const fromPayload = readPayloadString(payload.reference)

  if (fromPayload) {
    return fromPayload
  }

  const sessionId = readSimulatedMandateSessionId(mandateId)

  if (!sessionId) {
    return null
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [session],
  } = await query.graph({
    entity: "payment_session",
    fields: ["id", "payment_collection.order.display_id"],
    filters: {id: sessionId},
  })

  const displayId = (session as any)?.payment_collection?.order?.display_id

  return displayId !== undefined && displayId !== null
    ? String(displayId)
    : null
}

/**
 * Handles the incasso exchanges Pay. sends for direct debits created via the
 * mandate API, both the legacy incasso* actions and the flat Incasso
 * transaction exchange. The exchange body is never trusted, the authoritative
 * direct debit state is always re-fetched from Pay. before anything changes.
 */
export default async function payDirectDebitExchangeHandler({
  event: {data},
  container,
}: SubscriberArgs<{payload: Record<string, any>}>) {
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const payload = data.payload ?? {}
  const action = normalizeAction(payload.action)

  const pay = getPayClient(container, logger)

  if (!pay) {
    return
  }

  const {client, options} = pay
  // Same default as the HTTP client: an unset testMode means test mode
  const testMode = options.testMode ?? true

  let info: DirectDebitInfoResponse | DirectDebit | null = null
  let displayId: string | null = null
  // Set when the exchange describes a mandate that only exists on this test
  // server, the body is then the only source of the direct debit state
  let simulatedMandateId: string | null = null

  if (isLegacyDirectDebitAction(action)) {
    const referenceId = readDirectDebitReferenceId(payload)
    const mandateId = readDirectDebitMandateId(payload)

    if (testMode && isSimulatedDirectDebitMandate(mandateId)) {
      simulatedMandateId = mandateId
      displayId = await resolveSimulatedDisplayId(container, payload, mandateId)

      if (!displayId) {
        logger.warn(
          `Pay. - Ignoring simulated direct debit exchange ${action} for ${mandateId}: order reference missing`
        )
        return
      }
    }

    if (!simulatedMandateId && referenceId) {
      info = await client.getDirectDebitInfo(referenceId).catch((err) => {
        logger.warn(
          `Pay. - Could not retrieve direct debit ${referenceId}: ${err.message ?? err}`
        )
        return null
      })
    }

    if (!simulatedMandateId && !extractDirectDebit(info) && mandateId) {
      info = await client.getDirectDebitInfoByMandate(mandateId).catch((err) => {
        logger.warn(
          `Pay. - Could not retrieve direct debit mandate ${mandateId}: ${err.message ?? err}`
        )
        return null
      })
    }

    if (!simulatedMandateId) {
      const directDebit = extractDirectDebit(info)

      if (!directDebit) {
        logger.warn(
          `Pay. - Ignoring direct debit exchange ${action}: direct debit not found`
        )
        return
      }

      displayId = extractDirectDebitReference(info, directDebit)

      if (!displayId) {
        logger.warn(
          `Pay. - Ignoring direct debit exchange ${action}: order reference missing`
        )
        return
      }
    }
  } else {
    displayId = parseDirectDebitDisplayId(payload)

    if (!displayId) {
      logger.warn(
        `Pay. - Ignoring direct debit exchange ${payload.id ?? ""}: could not determine order reference`
      )
      return
    }
  }

  if (!displayId) {
    logger.warn(
      `Pay. - Ignoring direct debit exchange ${action}: order reference missing`
    )
    return
  }

  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.payment_sessions.*",
      "payment_collections.payment_sessions.payment.id",
      "payment_collections.payment_sessions.payment.captured_at",
      "payment_collections.payment_sessions.payment.data",
    ],
    filters: {
      display_id: displayId,
    },
  })

  if (!order) {
    logger.warn(
      `Pay. - Ignoring direct debit exchange for #${displayId}: order not found`
    )
    return
  }

  const payPaymentSession = getPayPaymentSession(order)

  if (
    !payPaymentSession?.provider_id.includes(PaymentProviderKeys.DIRECTDEBIT)
  ) {
    logger.warn(
      `Pay. - Ignoring direct debit exchange for #${displayId}: no direct debit payment session found`
    )
    return
  }

  // The flat transaction exchange is resolved through the mandate stored on
  // the order's own payment session, not through anything in the body
  if (!info) {
    const sessionData = (payPaymentSession.data ?? {}) as Record<string, any>
    const paymentData = (payPaymentSession.payment?.data ?? {}) as Record<
      string,
      any
    >
    const mandateId =
      readPayloadString(sessionData.code) ?? readPayloadString(paymentData.code)

    if (!mandateId) {
      logger.warn(
        `Pay. - Ignoring direct debit exchange for #${displayId}: mandate code missing on payment`
      )
      return
    }

    if (simulatedMandateId && mandateId !== simulatedMandateId) {
      logger.warn(
        `Pay. - Ignoring simulated direct debit exchange for #${displayId}: mandate ${simulatedMandateId} does not belong to this order`
      )
      return
    }

    if (
      testMode &&
      sessionData.testMode === true &&
      isSimulatedDirectDebitMandate(mandateId)
    ) {
      // Nothing to re-fetch, the mandate only exists on this test server
      logger.info(
        `Pay. - Simulating direct debit exchange for #${displayId} with mandate ${mandateId}`
      )
      info = {directdebits: [buildSimulatedDirectDebit(payload, mandateId, displayId)]} as DirectDebitInfoResponse
    } else {
      info = await client.getDirectDebitInfoByMandate(mandateId).catch((err) => {
        logger.warn(
          `Pay. - Could not retrieve direct debit mandate ${mandateId} for #${displayId}: ${err.message ?? err}`
        )
        return null
      })
    }
  }

  const directDebit = extractDirectDebit(info)

  if (!directDebit) {
    logger.warn(
      `Pay. - Ignoring direct debit exchange for #${displayId}: no direct debit found`
    )
    return
  }

  const statusCode = Number(directDebit.status?.code)
  const statusAction = normalizeDirectDebitStatusAction(
    action,
    directDebit.status?.action
  )
  const declined = directDebit.declined === true
  const statusLabel = Number.isNaN(statusCode) ? "unknown" : statusCode

  logger.info(
    `Pay. - Process direct debit exchange for order ${order.id} - #${displayId} with status ${statusLabel}`
  )

  const paymentModuleService = container.resolve<IPaymentModuleService>(
    Modules.PAYMENT
  )
  const paymentCollectionId = payPaymentSession.payment_collection_id as string
  const payment = payPaymentSession.payment

  if (
    statusCode === PayDirectDebitStatusCode.COLLECTED ||
    statusAction === "collected"
  ) {
    if (payment?.captured_at) {
      logger.info(
        `Pay. - Direct debit for order ${order.id} is already captured, skipping`
      )
      return
    }

    if (!payment?.id) {
      logger.warn(
        `Pay. - Cannot capture direct debit for #${displayId}: no payment found on the session`
      )
      return
    }

    // The capture invokes the provider's capturePayment, which re-verifies
    // with Pay. that the direct debit is collected
    await capturePaymentWorkflow(container).run({
      input: {
        payment_id: payment.id,
      },
    })

    return
  }

  if (
    DIRECT_DEBIT_FAILED_CODES.has(statusCode) ||
    declined ||
    statusAction === "storno"
  ) {
    if (payment?.captured_at && payment.id) {
      // A storno reverses a collected payment: the money went back to the
      // customer, so the order is made payable again
      await reverseCapturedPayment(container, {
        orderId: order.id,
        paymentId: payment.id,
        paymentCollectionId,
        kind:
          statusCode === PayDirectDebitStatusCode.STORNO ||
          statusAction === "storno"
            ? "storno"
            : "failure",
        statusCode: statusLabel,
      })
    } else {
      await paymentModuleService.updatePaymentCollections(
        paymentCollectionId,
        {status: PaymentCollectionStatus.FAILED}
      )
    }

    // Same signal the order API chargeback path emits, so consuming projects
    // can follow up on the order and subscription
    const eventBusService = container.resolve<IEventBusModuleService>(
      Modules.EVENT_BUS
    )

    await eventBusService.emit(
      {
        name: "pay_payment.failed",
        data: {
          id: displayId,
          ...(Number.isNaN(statusCode) ? {} : {statusCode}),
        },
      },
      {}
    )

    return
  }

  if (
    DIRECT_DEBIT_AWAITING_CODES.has(statusCode) ||
    statusAction === "pending" ||
    statusAction === "send"
  ) {
    const collection = order.payment_collections.find(
      (pc) => pc.id === paymentCollectionId
    )

    if (
      collection?.status === PaymentCollectionStatus.COMPLETED ||
      collection?.status === PaymentCollectionStatus.FAILED
    ) {
      return
    }

    await paymentModuleService.updatePaymentCollections(paymentCollectionId, {
      status: PaymentCollectionStatus.AWAITING,
    })

    return
  }

  logger.warn(
    `Pay. - Ignoring direct debit exchange for #${displayId}: unsupported status ${statusLabel}`
  )
}

export const config: SubscriberConfig = {
  event: PAY_DIRECT_DEBIT_EXCHANGE_EVENT,
}
