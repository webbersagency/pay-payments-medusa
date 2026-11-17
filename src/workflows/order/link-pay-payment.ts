import {
  acquireLockStep,
  addOrderTransactionStep,
  createOrderPaymentCollectionWorkflow,
  emitEventStep,
  releaseLockStep,
} from "@medusajs/core-flows"
import {PaymentEvents} from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {LinkPayPaymentInput} from "../../utils/manualPayPaymentLink"
import {validatePayPaymentLinkStep} from "./steps/validate-pay-payment-link"
import {linkPayPaymentSessionStep} from "./steps/link-pay-payment-session"

export const linkPayPaymentToOrderWorkflowId = "link-pay-payment-to-order"

/**
 * Links a Pay. payment that was made outside the checkout (e.g. through a Pay.
 * payment link) to an order, as a captured payment on its open payment
 * collection. Refunds then go through Pay. as usual; Pay. may not send
 * exchanges for such a payment, the admin widget lets the admin compare it
 * with Pay. instead.
 */
export const linkPayPaymentToOrderWorkflow = createWorkflow(
  linkPayPaymentToOrderWorkflowId,
  function (input: LinkPayPaymentInput) {
    // Two admins (or a double click) must not link the same payment twice
    const lockKeys = transform({input}, ({input}) => [
      `pay-manual-link:order:${input.order_id}`,
      `pay-manual-link:pay:${String(input.pay_id).trim().toUpperCase()}`,
    ])

    acquireLockStep({key: lockKeys, timeout: 5, ttl: 60})

    const check = validatePayPaymentLinkStep(input)

    const createCollectionInput = transform({check}, ({check}) => ({
      order_id: check.order.id,
      amount: check.order.outstanding,
    }))

    const createdCollections = when({check}, ({check}) => {
      return !check.payment_collection_id
    }).then(() => {
      return createOrderPaymentCollectionWorkflow.runAsStep({
        input: createCollectionInput,
      })
    })

    const paymentCollectionId = transform(
      {check, createdCollections},
      ({check, createdCollections}) =>
        check.payment_collection_id ?? createdCollections?.[0]?.id
    )

    const linkInput = transform(
      {input, check, paymentCollectionId},
      ({input, check, paymentCollectionId}) => ({
        input,
        check,
        payment_collection_id: paymentCollectionId as string,
      })
    )

    const payment = linkPayPaymentSessionStep(linkInput)

    // Same bookkeeping as capturePaymentWorkflow, Medusa's capture during
    // authorization does not add the order transaction itself
    const orderTransactions = transform(
      {check, payment},
      ({check, payment}) =>
        (payment.captures ?? []).map((capture) => ({
          order_id: check.order.id,
          amount: capture.raw_amount ?? capture.amount,
          currency_code: payment.currency_code,
          reference: "capture",
          reference_id: capture.id,
        }))
    )

    addOrderTransactionStep(orderTransactions as any)

    const capturedEvent = transform({payment}, ({payment}) => ({
      id: payment.id,
    }))

    emitEventStep({
      eventName: PaymentEvents.CAPTURED,
      data: capturedEvent,
    })

    releaseLockStep({key: lockKeys})

    return new WorkflowResponse(payment)
  }
)

export default linkPayPaymentToOrderWorkflow
