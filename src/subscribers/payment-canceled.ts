import {SubscriberArgs, SubscriberConfig} from "@medusajs/framework"

import {ContainerRegistrationKeys, MedusaError} from "@medusajs/framework/utils"
import {cancelUnpaidOrder} from "../utils/cancelUnpaidOrder"

export default async function paymentCanceledHandler({
  event: {data},
  container,
}: SubscriberArgs<{id: string}>) {
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  logger.info("Process canceled Pay. payment")

  try {
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
