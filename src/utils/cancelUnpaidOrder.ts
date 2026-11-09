import {Modules, PaymentCollectionStatus} from "@medusajs/framework/utils"
import {cancelOrderWorkflow} from "@medusajs/core-flows"
import {IPaymentModuleService, MedusaContainer} from "@medusajs/types"
import {PaymentProviderKeys} from "../providers/pay/types"
import getPayPaymentSession from "./getPayPaymentSession"

type UnpaidOrder = Parameters<typeof getPayPaymentSession>[0]

/**
 * Ends an order whose Pay. payment was cancelled or failed. A failed payment
 * marks its collection FAILED. A direct debit stops there, its collection is
 * followed up through the direct debit exchanges. Any other payment cancels
 * the order, unless a captured payment exists on it: a cancel or failure
 * exchange can arrive after the order was paid through another attempt.
 */
export const cancelUnpaidOrder = async (
  container: MedusaContainer,
  order: UnpaidOrder,
  outcome: "canceled" | "failed"
): Promise<void> => {
  const logger = container.resolve("logger")
  const payPaymentSession = getPayPaymentSession(order)
  const isDirectDebit = !!payPaymentSession?.provider_id.includes(
    PaymentProviderKeys.DIRECTDEBIT
  )

  if (payPaymentSession && (outcome === "failed" || isDirectDebit)) {
    const paymentModuleService = container.resolve<IPaymentModuleService>(
      Modules.PAYMENT
    )

    await paymentModuleService.updatePaymentCollections(
      payPaymentSession.payment_collection_id as string,
      {
        status: PaymentCollectionStatus.FAILED,
      }
    )
  }

  if (isDirectDebit) {
    return
  }

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
