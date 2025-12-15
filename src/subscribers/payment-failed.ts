import {SubscriberArgs, SubscriberConfig} from "@medusajs/framework"

import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  PaymentCollectionStatus,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import {IPaymentModuleService} from "@medusajs/types"
import getPayPaymentSession from "../utils/getPayPaymentSession"

export default async function payPaymentFailedHandler({
  event: {data},
  container,
}: SubscriberArgs<{id: string}>) {
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const paymentModuleService = container.resolve<IPaymentModuleService>(
    Modules.PAYMENT
  )

  logger.info("Process canceled Pay. payment")

  try {
    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "payment_collections.*",
        "payment_collections.payment_sessions.*",
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

    const payPaymentSession = getPayPaymentSession(order)

    if (!!payPaymentSession) {
      await paymentModuleService.updatePaymentCollections(
        payPaymentSession.payment_collection_id as string,
        {
          status: PaymentCollectionStatus.FAILED,
        }
      )
    }
  } catch (e) {
    logger.error(e)
    throw e
  }
}

export const config: SubscriberConfig = {
  event: ["pay_payment.failed"],
}
