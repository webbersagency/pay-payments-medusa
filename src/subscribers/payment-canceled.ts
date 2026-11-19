import {SubscriberArgs, SubscriberConfig} from "@medusajs/framework"

import {ContainerRegistrationKeys, MedusaError} from "@medusajs/framework/utils"
import {cancelUnpaidOrder} from "../utils/cancelUnpaidOrder"
import {
  isCheckoutPaymentCollection,
  releaseCanceledPayPayment,
} from "../utils/releaseCanceledPayPayment"

export default async function paymentCanceledHandler({
  event: {data},
  container,
}: SubscriberArgs<{
  id?: string
  pay_order_ids?: string[]
  /** Pay. confirmed the canceled status live (emitted on capture) */
  verified?: boolean
}>) {
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  logger.info("Process canceled Pay. payment")

  try {
    // Void the canceled payment itself, so the order can be paid again
    const release = data.pay_order_ids?.length
      ? await releaseCanceledPayPayment(container, data.pay_order_ids, {
          includeDirectDebit: data.verified === true,
        })
      : null

    // A released direct debit is done: the order stays, a new payment can be
    // made on the reopened collection
    if (release?.released.some((released) => released.direct_debit)) {
      logger.info(
        `Canceled Pay. direct debit ${data.pay_order_ids!.join(" / ")} released, keeping order #${data.id}`
      )
      return
    }

    // Only the checkout payment the order was placed with ends the order. A
    // canceled retry (e.g. an expired payment link) just frees its collection.
    if (
      release?.payment_collection_ids.length &&
      !(await isCheckoutPaymentCollection(
        container,
        release.payment_collection_ids
      ))
    ) {
      logger.info(
        `Canceled Pay. payment ${data.pay_order_ids!.join(" / ")} was not the checkout payment of order #${data.id}, keeping the order`
      )
      return
    }

    if (!data.id) {
      logger.warn("Canceled Pay. payment carries no order reference, ignoring")
      return
    }

    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "payment_collections.status",
        "payment_collections.payments.captured_at",
        "payment_collections.payment_sessions.provider_id",
        "payment_collections.payment_sessions.payment_collection_id",
      ],
      filters: {
        display_id: data.id,
      },
    })

    if (!order) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `No associated order found for ID: ${data.id}`
      )
    }

    await cancelUnpaidOrder(container, order, "canceled")
  } catch (e) {
    logger.error(e)
    throw e
  }
}

export const config: SubscriberConfig = {
  event: "pay_payment.canceled",
}
