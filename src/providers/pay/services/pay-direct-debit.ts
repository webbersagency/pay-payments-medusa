import {CustomerDTO, OrderDTO, SalesChannelDTO} from "@medusajs/framework/types"
import {
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  PaymentSessionDTO,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
} from "@medusajs/types"
import {MedusaError} from "@medusajs/framework/utils"
import PayBase from "../core/pay-base"
import {
  CreateDirectDebitRequest,
  DirectDebit,
  DirectDebitPaymentMethod,
  PaymentOptions,
  PaymentProviderKeys,
} from "../types"
import {PayDirectDebitStatusCode} from "../core/constants"

/**
 * Direct debits are not created through the Pay. order API but through the
 * mandate API (POST /directdebits/mandates). The mandate response is stored on
 * the payment session data, its `code` is used to retrieve the authoritative
 * direct debit state later. Collection status changes arrive through incasso
 * exchanges handled by the direct-debit-exchange subscriber.
 */
class PayDirectDebitService extends PayBase {
  static identifier = PaymentProviderKeys.DIRECTDEBIT

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 137,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.DIRECTDEBIT +
        "_pay",
    }
  }

  createPayOrderPayload(
    order: OrderDTO & {customer: CustomerDTO; sales_channel: SalesChannelDTO},
    paymentSession: PaymentSessionDTO
  ): Omit<CreateDirectDebitRequest, "serviceId"> {
    const paymentMethodInput = (paymentSession.data?.paymentMethodInput ??
      {}) as DirectDebitPaymentMethod

    const iban = paymentMethodInput.iban?.replace(/\s/g, "")

    if (!iban) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Bank account number is missing."
      )
    }

    const fullName = [
      order.billing_address?.first_name?.trim(),
      order.billing_address?.last_name?.trim(),
    ]
      .filter(Boolean)
      .join(" ")

    const owner = (
      paymentMethodInput.accountHolder?.trim() ||
      order.billing_address?.company?.trim() ||
      fullName
    ).substring(0, 64)

    const payload: Omit<CreateDirectDebitRequest, "serviceId"> = {
      reference: order.display_id.toString(),
      description: this.getPaymentDescription(order),
      type: "SINGLE",
      exchangeUrl: this.paymentCreateOptions.webhookUrl,
      amount: {
        value: Math.round((paymentSession.amount.valueOf() as number) * 100),
        currency: order.currency_code.toUpperCase(),
      },
      customer: {
        email: paymentMethodInput.email || order.email || "",
        bankAccount: {
          iban,
          owner,
        },
      },
    }

    if (this.options_.debugMode) {
      try {
        this.logger_.info(JSON.stringify(payload))
      } catch (e) {}
    }

    return payload
  }

  /**
   * Creates the direct debit mandate when the payload is passed from the order
   * created hook. The returned data replaces the session data wholesale, so the
   * payload key is always stripped, persisting it back would create a second
   * mandate on a later update.
   */
  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const {payload, ...data} = (input.data ?? {}) as Record<string, unknown> & {
      payload?: Omit<CreateDirectDebitRequest, "serviceId">
    }

    if (!payload) {
      return {data}
    }

    // A retried order created hook must not create a second mandate
    if (data.code) {
      this.logger_.info(
        `Pay. direct debit mandate ${data.code} already exists, skipping creation`
      )
      return {data}
    }

    try {
      const response =
        this.options_.directDebitApiVersion === "v3"
          ? await this.createDirectDebitViaV3(payload)
          : await this.client_.createDirectDebit(payload)

      if (!response) {
        // Test mode does not create a mandate at Pay., store a clearly marked
        // fake one so the Medusa side of the flow (capture, refund) stays
        // testable. capturePayment only honors it while testMode is active.
        const testCode = `TEST-${data.session_id ?? payload.reference}`

        this.logger_.info(
          `Pay. direct debit test mode: storing simulated mandate ${testCode}`
        )

        return {data: {...data, code: testCode, testMode: true}}
      }

      this.logger_.info(
        `Pay. direct debit mandate ${response.code} created for reference ${payload.reference} with amount ${payload.amount.currency} ${payload.amount.value}`
      )

      return {data: response as unknown as Record<string, unknown>}
    } catch (error) {
      this.logger_.error(
        `Error creating Pay. direct debit: ${error.message}`
      )
      throw error
    }
  }

  /**
   * Retrieves payment details. Payments that hold a Pay. order or transaction
   * id (created through the order API, or refunded) resolve through the base
   * implementation, mandate based payments resolve through the mandate code.
   */
  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    const data = await this.withSessionData(
      (input.data ?? {}) as Record<string, unknown>
    )

    if (data.id || data.orderId) {
      return await super.retrievePayment({
        ...input,
        data: {...data, id: data.id ?? data.orderId},
      })
    }

    const mandateId = this.readMandateId(data)

    if (!mandateId || data.testMode === true) {
      return {data}
    }

    const info = await this.client_.getDirectDebitInfoByMandate(mandateId)

    return {data: info as unknown as Record<string, unknown>}
  }

  /**
   * A mandate based direct debit is revoked by deleting the mandate at Pay.,
   * so a pending collection is never executed for a canceled payment. The
   * order API abort only applies to payments that hold a Pay. order id.
   */
  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    const data = await this.withSessionData(
      (input.data ?? {}) as Record<string, unknown>
    )

    if (data.orderId) {
      return await super.cancelPayment({...input, data})
    }

    const mandateId = this.readMandateId(data)

    if (!mandateId || data.testMode === true) {
      // Nothing was created at Pay. (e.g. test mode), nothing to revoke
      return {data}
    }

    try {
      await this.client_.deleteDirectDebitMandate(mandateId)

      this.logger_.info(
        `Pay. direct debit mandate ${mandateId} deleted, no further collections will be executed`
      )

      return {data}
    } catch (error) {
      this.logger_.error(
        `Error deleting Pay. direct debit mandate ${mandateId}: ${error.message}`
      )
      throw error
    }
  }

  /**
   * A mandate based direct debit only counts as captured when Pay. reports the
   * direct debit as collected. The state is always re-fetched from Pay., so a
   * spoofed exchange cannot capture an uncollected payment.
   */
  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const data = await this.withSessionData(
      (input.data ?? {}) as Record<string, unknown>
    )

    if (data.orderId) {
      return await super.capturePayment({...input, data})
    }

    // A payment created in test mode has no mandate at Pay., the capture is
    // simulated so test servers can run the full flow. It only succeeds while
    // the server still runs in test mode, a production server fails closed.
    if (data.testMode === true && (this.options_.testMode ?? true)) {
      this.logger_.info(
        `Pay. direct debit test mode: simulating capture for ${data.code}`
      )

      return {
        data: {
          ...data,
          status: {code: PayDirectDebitStatusCode.COLLECTED},
        },
      }
    }

    const mandateId = this.readMandateId(data)

    if (!mandateId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No mandate code found on the payment data"
      )
    }

    const info = await this.client_.getDirectDebitInfoByMandate(mandateId)
    const directDebit = info.directdebits[0]

    if (directDebit?.status.code === PayDirectDebitStatusCode.COLLECTED) {
      return {
        data: {
          ...data,
          orderId: directDebit.orderId,
          amount: directDebit.amount,
          status: directDebit.status,
          directdebits: info.directdebits,
        } as unknown as Record<string, unknown>,
      }
    }

    throw new MedusaError(
      MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
      "The payment could not be captured."
    )
  }

  /**
   * Refunds go through the regular transaction refund endpoint, using the Pay.
   * transaction id of the collection. That id lives on the collected direct
   * debit, not necessarily on the stored payment data, so it is resolved from
   * the mandate when missing.
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = (await this.withSessionData(
      (input.data ?? {}) as Record<string, unknown>
    )) as Record<string, any>

    if (data.testMode === true && (this.options_.testMode ?? true)) {
      this.logger_.info(
        `Pay. direct debit test mode: simulating refund for ${data.code}`
      )

      return {data}
    }

    let directDebit: DirectDebit | undefined = data.directdebits?.[0]
    let orderId: string | undefined = data.orderId ?? directDebit?.orderId
    const mandateId = this.readMandateId(data)

    // The stored direct debit is a snapshot from the capture, the live state
    // decides whether the collection was reversed in the meantime
    if (mandateId) {
      try {
        const info = await this.client_.getDirectDebitInfoByMandate(mandateId)
        const live = info?.directdebits?.[0]

        if (live) {
          directDebit = live
          orderId = orderId ?? live.orderId
        }
      } catch (error) {
        this.logger_.warn(
          `Could not retrieve direct debit mandate ${mandateId}: ${error.message}`
        )
      }
    }

    if (directDebit && this.isDirectDebitReversed(directDebit)) {
      // The bank returned the money (storno / failed collection), the refund
      // only needs to be recorded on the Medusa side (see reverseCapturedPayment)
      this.logger_.info(
        `Pay. direct debit ${directDebit.id} was reversed (status ${directDebit.status?.code}), recording the refund without contacting Pay.`
      )

      return {data}
    }

    if (!orderId) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "No Pay. transaction found for this direct debit, cannot refund."
      )
    }

    return await super.refundPayment({
      ...input,
      data: {
        ...data,
        orderId,
        amount: data.amount ?? directDebit?.amount,
      },
    })
  }

  /**
   * Create the debit through the v3 API and normalize the response to the
   * v2 mandate shape (`code` = mandate id), so every downstream consumer
   * (exchange subscriber, capture verification) works the same for both
   * API versions.
   */
  protected async createDirectDebitViaV3(
    payload: Omit<CreateDirectDebitRequest, "serviceId">
  ): Promise<Record<string, unknown> | void> {
    const response = await this.client_.createDirectDebitV3({
      reference: payload.reference,
      amount: payload.amount.value,
      currency: payload.amount.currency,
      bankaccountHolder: payload.customer.bankAccount.owner,
      bankaccountNumber: payload.customer.bankAccount.iban,
      description: payload.description,
      exchangeUrl: payload.exchangeUrl,
      email: payload.customer.email,
      ...(payload.customer.ipAddress
        ? {ipAddress: payload.customer.ipAddress}
        : {}),
    })

    if (!response) {
      return
    }

    return {
      code: response.result,
      reference: payload.reference,
      amount: payload.amount,
      apiVersion: "v3",
    }
  }

  /**
   * A storno, a failed collection or a declined debit means the money never
   * stayed with (or went back to) the merchant.
   */
  protected isDirectDebitReversed(directDebit: DirectDebit): boolean {
    const code = Number(directDebit.status?.code)

    return (
      directDebit.declined === true ||
      code === PayDirectDebitStatusCode.STORNO ||
      code === PayDirectDebitStatusCode.FAILED
    )
  }

  protected readMandateId(data: Record<string, any>): string | undefined {
    const mandateId = data.code ?? data.directdebits?.[0]?.mandate.code

    return typeof mandateId === "string" && mandateId.trim()
      ? mandateId.trim()
      : undefined
  }
}

export default PayDirectDebitService
