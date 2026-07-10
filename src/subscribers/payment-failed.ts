import {SubscriberArgs, SubscriberConfig} from "@medusajs/framework"

import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  PaymentCollectionStatus,
} from "@medusajs/framework/utils"
import {IPaymentModuleService} from "@medusajs/types"
import getPayPaymentSession from "../utils/getPayPaymentSession"
import {PayPaymentStatus} from "../providers/pay/core/constants"

export default async function payPaymentFailedHandler({
  event: {data},
  container,
}: SubscriberArgs<{id: string; statusCode?: number}>) {
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const paymentModuleService = container.resolve<IPaymentModuleService>(
    Modules.PAYMENT
  )

  logger.info("Process failed Pay. payment")

  try {
    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "payment_collections.*",
        "payment_collections.payments.captured_at",
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

    // A failure exchange for a stale attempt must not flip a paid collection.
    // A chargeback is the exception, it legitimately reverses a captured payment.
    const hasCapturedPayment = (order.payment_collections ?? []).some(
      (pc) =>
        pc.status === PaymentCollectionStatus.COMPLETED ||
        (pc.payments ?? []).some((payment) => !!payment.captured_at)
    )

    if (hasCapturedPayment && data.statusCode !== PayPaymentStatus.CHARGEBACK) {
      logger.info(
        `Skipping failed status for order ${order.id}, a captured payment exists`
      )
      return
    }

    const payPaymentSession = getPayPaymentSession(order)

    if (payPaymentSession) {
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
