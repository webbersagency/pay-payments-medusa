import {SubscriberArgs, SubscriberConfig} from "@medusajs/framework"

import {ContainerRegistrationKeys} from "@medusajs/framework/utils"

export default async function paymentCapturedHandler({
  event: {data},
  container,
}: SubscriberArgs<{id: string}>) {
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  logger.info("Process canceled Pay. payment")

  try {
    const {data: orderData} = await query.graph(
      {
        entity: "order",
        fields: ["id"],
        filters: {
          id: data.id,
        },
      },
      {
        throwIfKeyNotFound: true,
      }
    )

    const order = orderData[0]

    if (!order) {
      throw new Error(`No associated order found for ID: ${data.id}`)
    }

    // TODO cancel order here

    // await sendOrderConfirmationWorkflow(container).run({
    //   input: {
    //     id: orderId,
    //   },
    // })
  } catch (e) {
    logger.error(e)
    throw e
  }
}

export const config: SubscriberConfig = {
  event: "pay_payment.canceled",
}
