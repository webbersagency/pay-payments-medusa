import {createOrUpdateOrderPaymentCollectionWorkflow} from "@medusajs/core-flows"
import {
  BigNumber,
  ContainerRegistrationKeys,
  MathBN,
  Modules,
  PaymentCollectionStatus,
} from "@medusajs/framework/utils"
import {
  BigNumberValue,
  IOrderModuleService,
  IPaymentModuleService,
  Logger,
  MedusaContainer,
} from "@medusajs/types"

export type ReverseCapturedPaymentInput = {
  orderId: string
  paymentId: string
  paymentCollectionId: string
  /** Stored as the refund note, e.g. "Pay. chargeback (status -71)" */
  reason: string
}

const sumAmounts = (items: {amount: BigNumberValue}[] | undefined) =>
  (items ?? []).reduce(
    (total, item) => MathBN.add(total, item.amount),
    MathBN.convert(0)
  )

/**
 * A chargeback or direct debit storno reverses a payment Medusa already
 * captured. Reflect that on the order so it shows as unpaid and can be paid
 * again:
 *
 * 1. record a refund for the still-captured amount on the payment. The Pay.
 *    provider recognises a reversed payment and records it without asking Pay.
 *    for a refund, the money is already back with the customer;
 * 2. add the matching negative order transaction, so the order summary shows
 *    the amount as outstanding again (refundPaymentWorkflow is not used
 *    because it would also credit the order for the refund);
 * 3. mark the payment collection failed;
 * 4. create a fresh not_paid payment collection for the outstanding amount,
 *    which is what the admin's "Copy payment link" / "Mark as paid" buttons and
 *    the storefront payment-collection route work with.
 *
 * Safe to run more than once: a payment that is already fully reversed only
 * gets whatever step is still missing.
 */
export async function reverseCapturedPayment(
  container: MedusaContainer,
  input: ReverseCapturedPaymentInput
): Promise<void> {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const paymentModuleService = container.resolve<IPaymentModuleService>(
    Modules.PAYMENT
  )
  const orderModuleService = container.resolve<IOrderModuleService>(
    Modules.ORDER
  )

  let payment = await paymentModuleService.retrievePayment(input.paymentId, {
    relations: ["captures", "refunds"],
  })

  const outstanding = MathBN.sub(
    sumAmounts(payment.captures),
    sumAmounts(payment.refunds)
  )

  if (MathBN.gt(outstanding, 0)) {
    const amount = new BigNumber(outstanding).numeric

    payment = await paymentModuleService.refundPayment({
      payment_id: payment.id,
      amount,
      note: input.reason,
    })

    logger.info(
      `Pay. - Recorded reversal of ${payment.currency_code} ${amount} on payment ${payment.id} for order ${input.orderId}: ${input.reason}`
    )
  } else {
    logger.info(
      `Pay. - Payment ${payment.id} for order ${input.orderId} is already fully reversed`
    )
  }

  // Same bookkeeping as refundPaymentWorkflow: one negative transaction per
  // refund. Refunds made earlier through the admin already have theirs.
  const existingTransactions = await orderModuleService.listOrderTransactions(
    {order_id: input.orderId},
    {select: ["reference", "reference_id"]}
  )
  const knownRefundIds = new Set(
    existingTransactions
      .filter((transaction) => transaction.reference === "refund")
      .map((transaction) => transaction.reference_id)
  )
  const missingTransactions = (payment.refunds ?? [])
    .filter((refund) => !knownRefundIds.has(refund.id))
    .map((refund) => ({
      order_id: input.orderId,
      amount: new BigNumber(MathBN.mult(refund.amount, -1)).numeric,
      currency_code: payment.currency_code,
      reference: "refund",
      reference_id: refund.id,
    }))

  if (missingTransactions.length) {
    await orderModuleService.addOrderTransactions(missingTransactions)
  }

  // Recording the refund recomputes the collection status from the captured
  // amount (back to completed), so the failure is applied afterwards
  await paymentModuleService.updatePaymentCollections(
    input.paymentCollectionId,
    {status: PaymentCollectionStatus.FAILED}
  )

  const {result} = await createOrUpdateOrderPaymentCollectionWorkflow(
    container
  ).run({input: {order_id: input.orderId}})

  const collections = Array.isArray(result) ? result : result ? [result] : []

  logger.info(
    `Pay. - Order ${input.orderId} is payable again through payment collection ${
      collections.map((collection) => collection.id).join(", ") || "(none)"
    }`
  )
}

export default reverseCapturedPayment
