import {SubscriberArgs, SubscriberConfig} from "@medusajs/framework"

import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  PaymentCollectionStatus,
} from "@medusajs/framework/utils"
import {cancelOrderWorkflow} from "@medusajs/core-flows"
import {PaymentProviderKeys} from "../providers/pay/types"
import getPayPaymentSession from "../utils/getPayPaymentSession"
import {IPaymentModuleService} from "@medusajs/types"

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

    const payPaymentSession = getPayPaymentSession(order)

    if (
      payPaymentSession?.provider_id.includes(PaymentProviderKeys.DIRECTDEBIT)
    ) {
      const paymentModuleService = container.resolve<IPaymentModuleService>(
        Modules.PAYMENT
      )

      await paymentModuleService.updatePaymentCollections(
        payPaymentSession.payment_collection_id as string,
        {
          status: PaymentCollectionStatus.FAILED,
        }
      )
    } else {
      // A cancel exchange can arrive after the order was paid through another
      // attempt, never cancel an order that has a captured payment.
      const hasCapturedPayment = (order.payment_collections ?? []).some(
        (pc) =>
          pc.status === PaymentCollectionStatus.COMPLETED ||
          (pc.payments ?? []).some((payment) => !!payment.captured_at)
      )

      if (hasCapturedPayment) {
        logger.info(
          `Skipping cancel for order ${order.id}, a captured payment exists`
        )
        return
      }

      await cancelOrderWorkflow(container).run({
        input: {
          order_id: order.id,
        },
      })
    }
  } catch (e) {
    logger.error(e)
    throw e
  }
}

export const config: SubscriberConfig = {
  event: "pay_payment.canceled",
}
