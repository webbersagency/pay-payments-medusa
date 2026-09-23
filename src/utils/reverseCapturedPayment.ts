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

export type PaymentReversalKind = "chargeback" | "storno" | "failure"

export type ReverseCapturedPaymentInput = {
  orderId: string
  paymentId: string
  paymentCollectionId: string
  /** What reversed the payment, becomes the refund note */
  kind: PaymentReversalKind
  /** The Pay. status code that reported it, when known */
  statusCode?: number | string
}

const REVERSAL_NOTE_PATTERN =
  /^Pay\. (chargeback|direct debit (?:storno|failure)) \(status (-?\d+|unknown)\)$/

/**
 * The refund note that marks a reversal, e.g. "Pay. chargeback (status -71)"
 * or "Pay. direct debit storno (status 127)". Medusa 2.11 refunds carry no
 * metadata, so the note is what the admin banner recognises a reversal by.
 */
export function formatPayReversalNote(
  kind: PaymentReversalKind,
  statusCode?: number | string
): string {
  const what = kind === "chargeback" ? "chargeback" : `direct debit ${kind}`
  const status =
    statusCode === undefined || statusCode === null || statusCode === ""
      ? "unknown"
      : String(statusCode)

  return `Pay. ${what} (status ${status})`
}

export function parsePayReversalNote(
  note: unknown
): {kind: PaymentReversalKind; statusCode: number | null} | null {
  if (typeof note !== "string") {
    return null
  }

  const match = note.trim().match(REVERSAL_NOTE_PATTERN)

  if (!match) {
    return null
  }

  const kind = match[1].replace("direct debit ", "") as PaymentReversalKind
  const statusCode = match[2] === "unknown" ? null : Number(match[2])

  return {kind, statusCode}
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

  const note = formatPayReversalNote(input.kind, input.statusCode)

  if (MathBN.gt(outstanding, 0)) {
    const amount = new BigNumber(outstanding).numeric

    payment = await paymentModuleService.refundPayment({
      payment_id: payment.id,
      amount,
      note,
    })

    logger.info(
      `Pay. - Recorded reversal of ${payment.currency_code} ${amount} on payment ${payment.id} for order ${input.orderId}: ${note}`
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
