import {ContainerRegistrationKeys, Modules} from "@medusajs/framework/utils"
import {createStep, StepResponse} from "@medusajs/framework/workflows-sdk"
import {
  IPaymentModuleService,
  Logger,
  MedusaContainer,
  PaymentDTO,
} from "@medusajs/types"
import {
  buildManualLinkSessionData,
  LinkPayPaymentInput,
  ManualLinkCheck,
  PAY_MANUAL_LINK_PROVIDER_ID,
} from "../../../utils/manualPayPaymentLink"

export type LinkPayPaymentSessionStepInput = {
  input: LinkPayPaymentInput
  check: ManualLinkCheck
  payment_collection_id: string
}

type Compensation = {
  payment_collection_id: string
  previous_status: string | null
  payment_session_id: string
  payment_id: string | null
  capture_ids: string[]
}

export const linkPayPaymentSessionStepId = "link-pay-payment-session"

/**
 * Undo a (partial) link. Medusa has no public way to delete a payment, so it
 * is canceled instead (the provider never aborts a manually linked payment at
 * Pay.) and the session data is cleared, which also frees the Pay. payment to
 * be linked again.
 */
async function unlink(container: MedusaContainer, data: Compensation) {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const paymentModule = container.resolve<IPaymentModuleService>(
    Modules.PAYMENT
  )

  const attempt = async (what: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (error) {
      logger.warn(
        `Pay. - Could not ${what} while undoing manual link of session ${data.payment_session_id}: ${error.message}`
      )
    }
  }

  if (data.capture_ids.length) {
    await attempt("delete captures", () =>
      paymentModule.deleteCaptures(data.capture_ids)
    )
  }

  if (data.payment_id) {
    await attempt("cancel payment", () =>
      paymentModule.cancelPayment(data.payment_id!)
    )
  }

  await attempt("clear session", async () => {
    const session = await paymentModule.retrievePaymentSession(
      data.payment_session_id,
      {select: ["id", "amount", "currency_code"]}
    )

    await paymentModule.updatePaymentSession({
      id: session.id,
      data: {},
      amount: session.amount,
      currency_code: session.currency_code,
    })
  })

  if (data.previous_status) {
    await attempt("restore payment collection status", () =>
      paymentModule.updatePaymentCollections(data.payment_collection_id, {
        status: data.previous_status as any,
      })
    )
  }
}

/**
 * Records the Pay. payment on the order's payment collection: a session with
 * the Pay. data, authorized through the provider (which asks Pay. for the
 * status) and captured. A paid Pay. payment is captured by Medusa while
 * authorizing, an authorized one is captured at Pay. here.
 */
export const linkPayPaymentSessionStep = createStep(
  linkPayPaymentSessionStepId,
  async (
    {input, check, payment_collection_id}: LinkPayPaymentSessionStepInput,
    {container}
  ) => {
    const paymentModule = container.resolve<IPaymentModuleService>(
      Modules.PAYMENT
    )
    const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)

    const collection = await paymentModule.retrievePaymentCollection(
      payment_collection_id,
      {select: ["id", "status"]}
    )

    const session = await paymentModule.createPaymentSession(
      payment_collection_id,
      {
        provider_id: PAY_MANUAL_LINK_PROVIDER_ID,
        amount: check.amount,
        currency_code: check.order.currency_code ?? "",
        data: buildManualLinkSessionData(check, input),
      }
    )

    const compensation: Compensation = {
      payment_collection_id,
      previous_status: collection.status ?? null,
      payment_session_id: session.id,
      payment_id: null,
      capture_ids: [],
    }

    let payment: PaymentDTO

    try {
      const authorized = await paymentModule.authorizePaymentSession(
        session.id,
        {}
      )
      compensation.payment_id = authorized.id

      payment = await paymentModule.retrievePayment(authorized.id, {
        relations: ["captures"],
      })

      if (!payment.captures?.length) {
        await paymentModule.capturePayment({
          payment_id: payment.id,
          amount: check.amount,
          captured_by: input.actor_id,
        })

        payment = await paymentModule.retrievePayment(payment.id, {
          relations: ["captures"],
        })
      }

      compensation.capture_ids = (payment.captures ?? []).map(
        (capture) => capture.id
      )
    } catch (error) {
      await unlink(container, compensation)
      throw error
    }

    logger.info(
      `Pay. - ${check.linked_by_email ?? input.actor_id} linked Pay. payment ${check.payment.pay_order_id} (${payment.currency_code} ${check.amount}) to order ${check.order.id} as payment ${payment.id}`
    )

    return new StepResponse(payment, compensation)
  },
  async (compensation, {container}) => {
    if (!compensation) {
      return
    }

    await unlink(container, compensation)
  }
)
