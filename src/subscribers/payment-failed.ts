import {SubscriberArgs, SubscriberConfig} from "@medusajs/framework"

import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  PaymentCollectionStatus,
} from "@medusajs/framework/utils"
import {IPaymentModuleService} from "@medusajs/types"
import getPayPaymentSession from "../utils/getPayPaymentSession"
import {reverseCapturedPayment} from "../utils/reverseCapturedPayment"
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
        "payment_collections.payment_sessions.payment.id",
        "payment_collections.payment_sessions.payment.captured_at",
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

    if (!payPaymentSession) {
      logger.warn(
        `No Pay. payment session found for order ${order.id}, ignoring failed payment`
      )
      return
    }

    const paymentCollectionId =
      payPaymentSession.payment_collection_id as string
    const capturedPayment = payPaymentSession.payment?.captured_at
      ? payPaymentSession.payment
      : undefined

    if (data.statusCode === PayPaymentStatus.CHARGEBACK && capturedPayment) {
      // The money went back to the customer, make the order payable again
      await reverseCapturedPayment(container, {
        orderId: order.id,
        paymentId: capturedPayment.id,
        paymentCollectionId,
        kind: "chargeback",
        statusCode: data.statusCode,
      })
      return
    }

    await paymentModuleService.updatePaymentCollections(paymentCollectionId, {
      status: PaymentCollectionStatus.FAILED,
    })
  } catch (e) {
    logger.error(e)
    throw e
  }
}

export const config: SubscriberConfig = {
  event: ["pay_payment.failed"],
}
