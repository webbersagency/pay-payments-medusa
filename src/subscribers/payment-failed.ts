import {SubscriberArgs, SubscriberConfig} from "@medusajs/framework"

import {ContainerRegistrationKeys, MedusaError} from "@medusajs/framework/utils"
import {cancelOrderWorkflow} from "@medusajs/core-flows"

export default async function paymentCapturedHandler({
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
      fields: ["id"],
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

    await cancelOrderWorkflow(container).run({
      input: {
        order_id: order.id,
      },
    })
  } catch (e) {
    logger.error(e)
    throw e
  }
}

export const config: SubscriberConfig = {
  event: "pay_payment.canceled",
}
