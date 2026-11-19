import {
  ContainerRegistrationKeys,
  Modules,
  PaymentCollectionStatus,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import {IPaymentModuleService, Logger, MedusaContainer} from "@medusajs/types"
import {PAY_MANUAL_LINK_KEY} from "../providers/pay/core/constants"
import {PaymentProviderKeys} from "../providers/pay/types"
import {findSessionsForPayPayment} from "./manualPayPaymentLink"

/** Event the provider and webhook emit for a canceled / expired Pay. payment */
export const PAY_PAYMENT_CANCELED_EVENT = "pay_payment.canceled"

/** A payment collection that is only waiting for this payment to settle */
const IN_PROGRESS_STATUSES: string[] = [
  PaymentCollectionStatus.AWAITING,
  PaymentCollectionStatus.AUTHORIZED,
  PaymentCollectionStatus.PARTIALLY_AUTHORIZED,
]

export type ReleasedPayPayment = {
  payment_session_id: string
  payment_collection_id: string
  payment_id: string | null
}

export type ReleaseCanceledPayPaymentResult = {
  /** Payment collections the Pay. payment belongs to */
  payment_collection_ids: string[]
  /** Sessions whose payment was voided because Pay. canceled it */
  released: ReleasedPayPayment[]
}

/**
 * Pay. canceled or expired a payment (e.g. a hosted checkout that was never
 * finished). Medusa ignores a canceled webhook, so the authorized payment
 * would stay "ready to be captured" forever and block the payment collection.
 * This cancels the Medusa payment, marks its session canceled and, when
 * nothing else is authorized on the collection, reopens it as `not_paid`, so
 * a new payment (link, mark as paid, manual link) can be made. Captured,
 * direct debit and manually linked payments are left alone. Idempotent.
 */
export async function releaseCanceledPayPayment(
  container: MedusaContainer,
  payIds: string[]
): Promise<ReleaseCanceledPayPaymentResult> {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const paymentModule = container.resolve<IPaymentModuleService>(
    Modules.PAYMENT
  )

  const found = await findSessionsForPayPayment(container, payIds)

  const result: ReleaseCanceledPayPaymentResult = {
    payment_collection_ids: [
      ...new Set(found.map((session) => session.payment_collection_id)),
    ],
    released: [],
  }

  if (!found.length) {
    return result
  }

  const sessions = await paymentModule.listPaymentSessions(
    {id: found.map((session) => session.id)},
    {relations: ["payment", "payment.captures"]}
  )

  for (const session of sessions) {
    const data = (session.data ?? {}) as Record<string, unknown>
    const payment = session.payment

    if (
      session.provider_id.includes(PaymentProviderKeys.DIRECTDEBIT) ||
      data[PAY_MANUAL_LINK_KEY] ||
      payment?.captured_at ||
      payment?.captures?.length
    ) {
      continue
    }

    if (payment && !payment.canceled_at) {
      // The provider sees the Pay. order is already canceled and does not
      // abort it again
      await paymentModule.cancelPayment(payment.id)
    }

    if (session.status !== PaymentSessionStatus.CANCELED) {
      const {payload: _payload, ...sessionData} = data

      await paymentModule.updatePaymentSession({
        id: session.id,
        data: sessionData,
        amount: session.amount,
        currency_code: session.currency_code,
        status: PaymentSessionStatus.CANCELED,
      })
    }

    result.released.push({
      payment_session_id: session.id,
      payment_collection_id: session.payment_collection_id,
      payment_id: payment?.id ?? null,
    })
  }

  for (const collectionId of new Set(
    result.released.map((released) => released.payment_collection_id)
  )) {
    const collection = await paymentModule.retrievePaymentCollection(
      collectionId,
      {
        select: ["id", "status"],
        relations: ["payment_sessions", "payments", "payments.captures"],
      }
    )

    const stillAuthorized = (collection.payment_sessions ?? []).some(
      (session) => session.status === PaymentSessionStatus.AUTHORIZED
    )
    const captured = (collection.payments ?? []).some(
      (payment) => !!payment.captured_at || !!payment.captures?.length
    )

    if (
      !stillAuthorized &&
      !captured &&
      IN_PROGRESS_STATUSES.includes(collection.status as string)
    ) {
      await paymentModule.updatePaymentCollections(collectionId, {
        status: PaymentCollectionStatus.NOT_PAID,
      })
    }
  }

  if (result.released.length) {
    logger.info(
      `Pay. - Canceled Pay. payment ${payIds.filter(Boolean).join(" / ")} released in Medusa: ${result.released
        .map((released) => released.payment_id ?? released.payment_session_id)
        .join(", ")}`
    )
  }

  return result
}

/**
 * Whether one of these payment collections was created for the cart, i.e.
 * holds the checkout payment the order was placed with. A canceled retry
 * (payment link on an order-level collection) must not cancel the order.
 */
export async function isCheckoutPaymentCollection(
  container: MedusaContainer,
  paymentCollectionIds: string[]
): Promise<boolean> {
  if (!paymentCollectionIds.length) {
    return false
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const {data} = await query.graph({
    entity: "cart_payment_collection",
    fields: ["cart_id"],
    filters: {payment_collection_id: paymentCollectionIds},
  })

  return data.length > 0
}
