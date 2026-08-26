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
      const response = await this.client_.createDirectDebit(payload)

      if (!response) {
        // Test mode does not create a mandate, keep the existing session data
        return {data}
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
    const data = (input.data ?? {}) as Record<string, unknown>

    if (data.id || data.orderId) {
      return await super.retrievePayment({
        ...input,
        data: {...data, id: data.id ?? data.orderId},
      })
    }

    const mandateId = this.readMandateId(data)

    if (!mandateId) {
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
    const data = (input.data ?? {}) as Record<string, unknown>

    if (data.orderId) {
      return await super.cancelPayment(input)
    }

    const mandateId = this.readMandateId(data)

    if (!mandateId) {
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
    const data = (input.data ?? {}) as Record<string, unknown>

    if (data.orderId) {
      return await super.capturePayment(input)
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
    const data = (input.data ?? {}) as Record<string, any>

    let directDebit: DirectDebit | undefined = data.directdebits?.[0]
    let orderId: string | undefined = data.orderId ?? directDebit?.orderId

    if (!orderId) {
      const mandateId = this.readMandateId(data)

      if (mandateId) {
        const info = await this.client_
          .getDirectDebitInfoByMandate(mandateId)
          .catch((error) => {
            this.logger_.warn(
              `Could not retrieve direct debit mandate ${mandateId}: ${error.message}`
            )
            return undefined
          })

        directDebit = info?.directdebits[0]
        orderId = directDebit?.orderId
      }
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

  protected readMandateId(data: Record<string, any>): string | undefined {
    const mandateId = data.code ?? data.directdebits?.[0]?.mandate.code

    return typeof mandateId === "string" && mandateId.trim()
      ? mandateId.trim()
      : undefined
  }
}

export default PayDirectDebitService
