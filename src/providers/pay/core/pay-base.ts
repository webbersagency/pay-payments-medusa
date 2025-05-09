import {
  Logger,
  ProviderWebhookPayload,
  WebhookActionResult,
} from "@medusajs/framework/types"
import {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  BigNumberRawValue,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
} from "@medusajs/types"
import {
  AbstractPaymentProvider,
  MedusaError,
  MedusaErrorTypes,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import {
  CreateOrder,
  OrderResponse,
  PaymentOptions,
  ProviderOptions,
} from "../types"
import {PayClient} from "./pay-client"
import crypto from "crypto"
import {PayPaymentStatus} from "./constants"
import getExpirationForPaymentMethod from "../utils/getExpirationForPaymentMethod"
import {PaymentProviderContext} from "@medusajs/types/dist/payment/provider"

/**
 * Dependencies injected into the service
 */
type InjectedDependencies = {
  logger: Logger
}

/**
 * Implementation of Pay. Payment Provider for Medusa
 */
abstract class PayBase extends AbstractPaymentProvider<ProviderOptions> {
  protected readonly options_: ProviderOptions
  protected logger_: Logger
  protected client_: PayClient
  protected debug_: boolean

  /**
   * Validates that the required options are provided
   * @param options - The options to validate
   * @throws {MedusaError} If API key is missing
   */
  static validateOptions(options: ProviderOptions): void {
    if (
      !options.atCode ||
      !options.apiToken ||
      !options.slCode ||
      !options.slSecret
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "AT Code, API Token, SL Code, SL Secret are required in the provider's options."
      )
    }
  }

  /**
   * Creates a new instance of the Pay. payment provider
   * @param container - The dependency container
   * @param options - Configuration options
   */
  constructor(container: InjectedDependencies, options: ProviderOptions) {
    super(container, options)

    this.logger_ = container.logger
    this.options_ = options
    this.debug_ =
      options.debugMode ||
      process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV === "test" ||
      false

    this.client_ = new PayClient(options, this.logger_)
  }

  abstract get paymentCreateOptions(): PaymentOptions

  normalizePaymentCreateParams(
    data?: Record<string, unknown>,
    context?: PaymentProviderContext
  ): Partial<CreateOrder> {
    const res = {} as Partial<CreateOrder>

    res.description = (data?.payment_description ??
      this.options_?.paymentDescription) as string

    res.paymentMethod = this.paymentCreateOptions

    res.returnUrl = data?.return_url as string | undefined

    res.expire = getExpirationForPaymentMethod(res.paymentMethod)

    if (context?.idempotency_key) {
      res.transferData = {
        idempotency_key: context.idempotency_key,
      }
    }

    return res
  }

  /**
   * Initiates a new payment with Pay.
   * @param input - The payment initiation input
   * @returns The initiated payment details
   */
  async initiatePayment({
    context,
    amount,
    data,
    currency_code,
  }: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const normalizedParams = this.normalizePaymentCreateParams(data, context)

    console.log("initiatePayment")
    console.log("data", data)
    console.log("context", context)

    try {
      const data = await this.client_
        .createOrder({
          ...normalizedParams,
          amount: {
            value: parseInt(amount.toString()),
            currency: currency_code.toUpperCase(),
          },

          customer: {
            firstName: context?.customer?.first_name,
            lastName: context?.customer?.last_name,
            // ipAddress: data?.context?.ip as string,
            phone:
              context?.customer?.phone ||
              context?.customer?.billing_address?.phone,
            email: context?.customer?.email,
            // locale: language.toUpperCase(),
            reference: context?.customer?.id,
          },
          order: {
            countryCode:
              context?.customer?.billing_address?.country_code?.toUpperCase(),
            invoiceAddress: {
              firstName: context?.customer?.first_name,
              lastName: context?.customer?.last_name,
              street: context?.customer?.billing_address?.address_1,
              streetNumber: context?.customer?.billing_address?.address_2,
              zipCode: context?.customer?.billing_address?.postal_code,
              city: context?.customer?.billing_address?.city,
              country:
                context?.customer?.billing_address?.country_code?.toUpperCase(),
            },
            // deliveryAddress: {
            //   firstName: order.shipping_address?.first_name,
            //   lastName: order.shipping_address?.last_name,
            //   street: order.shipping_address?.address_1,
            //   streetNumber: order.shipping_address?.address_2,
            //   zipCode: order.shipping_address?.postal_code,
            //   city: order.shipping_address?.city,
            //   country: order.shipping_address?.country_code?.toUpperCase()
            // },
            // products
          },

          // billingAddress: {
          //   streetAndNumber: context?.customer?.billing_address?.address_1 || "",
          //   postalCode: context?.customer?.billing_address?.postal_code || "",
          //   city: context?.customer?.billing_address?.city || "",
          //   country: context?.customer?.billing_address?.country_code || "",
          // },
          // billingEmail: context?.customer?.email || "",
        })
        .then((payment) => {
          return payment as Record<string, any>
        })
        .catch((error) => {
          this.logger_.error(`Pay. payment creation failed: ${error.message}`)
          throw new MedusaError(MedusaError.Types.INVALID_DATA, error.message)
        })

      this.debug_ &&
        this.logger_.info(
          `Pay. payment ${data.id} successfully created with amount ${amount}`
        )

      return {
        id: data.id,
        data: data,
      }
    } catch (error) {
      this.logger_.error(`Error initiating Pay. payment: ${error.message}`)
      throw error
    }
  }

  /**
   * Checks if a payment is authorized with Pay.
   * @param input - The payment authorization input
   * @returns The authorization result
   */
  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const id = input.data?.id

    if (!id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Payment ID is required"
      )
    }

    try {
      const {status} = await this.getPaymentStatus({
        data: {
          id,
        },
      })

      if (!["captured", "authorized", "paid"].includes(status)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Payment is not authorized: current status is ${status}`
        )
      }

      this.debug_ &&
        this.logger_.info(
          `Pay. payment ${id} successfully authorized with status ${status}`
        )

      return {
        data: input.data,
        status,
      }
    } catch (error) {
      this.logger_.error(`Error authorizing payment ${id}: ${error.message}`)
      throw error
    }
  }

  /**
   * Captures an authorized payment if autoCapture is disabled
   * @param input - The payment capture input
   * @returns The capture result
   */
  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const id = input.data?.id as string

    if (!id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Payment ID is required"
      )
    }

    try {
      const {data} = (await this.retrievePayment({
        data: {
          id,
        },
      })) as unknown as {data: OrderResponse}

      // If the Pay order is set to authorize we need to capture the order in Pay.
      if (
        data?.status?.code === PayPaymentStatus.AUTHORIZE &&
        this.options_.captureMode === "manual"
      ) {
        await this.client_.captureOrder(id)
      }

      const status = await this.getPaymentStatus({
        data: {
          id,
        },
      }).then((res) => res.status as PaymentSessionStatus)

      if (status !== PaymentSessionStatus.CAPTURED) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Payment is not captured: current status is ${status}`
        )
      }

      this.debug_ &&
        this.logger_.info(
          `Pay. payment ${id} captured with amount ${
            (input.data?.amount as BigNumberRawValue).currency_code
          } ${(input.data?.amount as BigNumberRawValue).value}`
        )

      const payment = await this.retrievePayment({
        data: {
          id,
        },
      })

      return {
        data: payment.data,
      }
    } catch (error) {
      this.logger_.error(`Error capturing payment ${id}: ${error.message}`)
      throw error
    }
  }

  /**
   * Refunds a payment
   * @param input - The payment refund input
   * @returns The refund result
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const id = input.data?.id as string

    if (!id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Payment ID is required"
      )
    }

    try {
      const payment = await this.retrievePayment({
        data: {
          id,
        },
      })

      const value = (input.data?.amount as BigNumberRawValue).value
      const currency: string = (payment.data as Record<string, any>)?.amount
        ?.currency as string

      if (!currency) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Currency information is missing from payment data"
        )
      }

      const refund = await this.client_.refundPayment(id, {
        amount: {
          value: parseInt(value.toString()),
          currency: currency.toUpperCase(),
        },
      })

      this.debug_ &&
        this.logger_.info(
          `Refund for Pay. payment ${id} created with amount ${currency.toUpperCase()} ${parseFloat(
            value.toString()
          ).toFixed(2)}`
        )

      return {
        data: {...refund},
      }
    } catch (error) {
      this.logger_.error(`Error refunding payment ${id}: ${error.message}`)
      throw error
    }
  }

  /**
   * Cancels a payment
   * @param input - The payment cancellation input
   * @returns The cancellation result
   */
  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const {id} = input.data as Record<string, any>

    try {
      const payment = await this.client_.getOrder(id)

      if (payment.status.code === PayPaymentStatus.EXPIRED) {
        this.debug_ &&
          this.logger_.info(
            `Pay. payment ${id} is already expired, no need to cancel`
          )
        return {
          data: {
            id,
          },
        }
      }

      const newPayment = await this.client_.abortOrder(id).catch((error) => {
        this.logger_.warn(
          `Could not cancel Pay. payment ${id}: ${error.message}`
        )
        return {data: payment as Record<string, any>}
      })

      this.debug_ &&
        this.logger_.info(`Pay. payment ${id} cancelled successfully`)

      return {
        data: newPayment as Record<string, any>,
      }
    } catch (error) {
      this.logger_.error(`Error cancelling payment ${id}: ${error.message}`)
      throw error
    }
  }

  /**
   * Deletes a payment (equivalent to cancellation as Pay. does not support deletion)
   * @param input - The payment deletion input
   * @returns The deletion result
   */
  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return this.cancelPayment(input)
  }

  /**
   * Gets the status of a payment by mapping Pay. statuses to Medusa statuses
   * @param input - The payment status input
   * @returns The payment status
   */
  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const id = input.data?.id as string

    try {
      const {status} = await this.client_.getTransaction(id)

      // Also see Pay. status codes: https://developer.pay.nl/docs/transaction-statuses#after-processing-statuses
      const statusMap = {
        // Pending Statuses
        [PayPaymentStatus.INIT]: PaymentSessionStatus.REQUIRES_MORE,
        //[PayPaymentStatus.PENDING_20]: PaymentSessionStatus.REQUIRES_MORE,
        [PayPaymentStatus.PENDING_50]: PaymentSessionStatus.PENDING,
        [PayPaymentStatus.PENDING_90]: PaymentSessionStatus.PENDING,
        [PayPaymentStatus.PENDING_98]: PaymentSessionStatus.PENDING,
        [PayPaymentStatus.CANCEL]: PaymentSessionStatus.CANCELED,
        [PayPaymentStatus.EXPIRED]: PaymentSessionStatus.CANCELED,
        [PayPaymentStatus.DENIED_64]: PaymentSessionStatus.CANCELED,
        [PayPaymentStatus.DENIED_63]: PaymentSessionStatus.CANCELED,
        [PayPaymentStatus.CANCEL_61]: PaymentSessionStatus.CANCELED,
        [PayPaymentStatus.FAILURE]: PaymentSessionStatus.ERROR,
        [PayPaymentStatus.PAID_CHECKAMOUNT]: PaymentSessionStatus.ERROR,
        [PayPaymentStatus.PARTIAL_PAYMENT]: PaymentSessionStatus.REQUIRES_MORE,
        [PayPaymentStatus.VERIFY]: PaymentSessionStatus.PENDING,
        [PayPaymentStatus.AUTHORIZE]: PaymentSessionStatus.AUTHORIZED,
        [PayPaymentStatus.PARTLY_CAPTURED]: PaymentSessionStatus.REQUIRES_MORE,
        [PayPaymentStatus.PAID]: PaymentSessionStatus.CAPTURED,
        [PayPaymentStatus.CHARGEBACK]: PaymentSessionStatus.CANCELED,
      }

      const mappedStatus = statusMap[status.code] as PaymentSessionStatus

      this.debug_ &&
        this.logger_.debug(
          `Pay. payment ${id} status: ${status} (mapped to: ${mappedStatus})`
        )

      return {
        status: mappedStatus,
      }
    } catch (error) {
      this.logger_.error(
        `Error retrieving payment status for ${id}: ${error.message}`
      )
      throw error
    }
  }

  /**
   * Retrieves payment details
   * @param input - The payment retrieval input
   * @returns The payment details
   */
  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    const id = input.data?.id as string

    try {
      let data

      // Check if the order ID starts with a 2, in that case we will need to use the legacy Pay API.
      if (id.startsWith("2")) {
        data = await this.client_.getTransaction(id)
      } else {
        data = await this.client_.getOrder(id)
      }

      return {
        data: data as Record<string, any>,
      }
    } catch (error) {
      this.logger_.error(
        `Error retrieving Pay. payment ${id}: ${error.message}`
      )
      throw error
    }
  }

  /**
   * Updates the Pay. order object
   * @param input - The payment update input
   * @returns The updated payment details
   */
  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    this.debug_ &&
      this.logger_.info(
        "Note: Pay. does not allow updating amounts on an existing payment. \n" +
          "Check https://developer.pay.nl/reference/api_update_order-1 for allowed updates."
      )

    const {id, reference, description} = input.data as {
      id: string
      reference?: string
      description?: string
    }

    try {
      const data = await this.client_.updateOrder(id, {
        reference,
        description,
      })

      this.debug_ &&
        this.logger_.info(`Pay. payment ${id} successfully updated`)

      return {
        data: data as Record<string, any>,
      }
    } catch (error) {
      this.logger_.error(`Error updating Pay. payment ${id}: ${error.message}`)
      throw error
    }
  }

  get keyMap(): Record<string, string> {
    return {
      [this.options_.atCode]: this.options_.apiToken,
      [this.options_.slCode]: this.options_.slSecret,
      ...(this.options_.otherSlCodes ? this.options_.otherSlCodes : {}),
    }
  }

  /**
   * Processes webhook data from Pay.
   * @param payload - The webhook payload
   * @returns The action and data to be processed
   */
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const {data, rawData, headers} = payload

    console.log("payload", payload)

    try {
      let orderId: string | null = null

      if (data.action === "new_ppt") {
        orderId = data.order_id as string
      } else {
        const signatureMethod = headers["signature-method"] as string
        const signatureKeyId = headers["signature-keyid"] as string
        const signatureAlgorithm =
          (headers["signature-algorithm"] as string) ?? "sha256"
        const signature = headers["signature"] as string

        const secret = this.keyMap[signatureKeyId]

        if (signatureMethod !== "HMAC") {
          throw new MedusaError(
            MedusaErrorTypes.INVALID_DATA,
            "Invalid signature method"
          )
        }

        if (!secret) {
          throw new MedusaError(
            MedusaErrorTypes.INVALID_DATA,
            `No secret key not found for ${signatureKeyId}`
          )
        }

        const hmac = crypto.createHmac(signatureAlgorithm, secret)
        const calculatedSignature = hmac.update(rawData).digest("hex")

        if (calculatedSignature !== signature) {
          throw new MedusaError(
            MedusaErrorTypes.INVALID_DATA,
            "Invalid signature"
          )
        }

        if (this.debug_) {
          try {
            this.logger_.debug(JSON.stringify(data))
          } catch (e) {}
        }

        if (data.type === "order") {
          orderId = (data.object as any).reference
        }
      }

      if (!orderId) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "Payment not found")
      }

      const {data: payment} = (await this.retrievePayment({
        data: {
          id: orderId,
        },
      }).catch((e) => {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, e.message)
      })) as unknown as {data: OrderResponse}

      if (!payment) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "Payment not found")
      }

      const baseData = {
        session_id: (payment?.transferData as Record<string, any>)
          ?.idempotency_key,
        amount: new BigNumber(payment?.amount?.value),
      }

      switch (payment?.status?.code) {
        case PayPaymentStatus.AUTHORIZE:
          return {
            action: PaymentActions.AUTHORIZED,
            data: baseData,
          }
        case PayPaymentStatus.PAID:
          return {
            action: PaymentActions.SUCCESSFUL,
            data: baseData,
          }
        case PayPaymentStatus.EXPIRED:
        case PayPaymentStatus.FAILURE:
          return {
            action: PaymentActions.FAILED,
            data: baseData,
          }
        case PayPaymentStatus.CANCEL:
          return {
            action: PaymentActions.CANCELED,
            data: baseData,
          }
        case PayPaymentStatus.PENDING_90:
          return {
            action: PaymentActions.PENDING,
            data: baseData,
          }
        case PayPaymentStatus.INIT:
          return {
            action: PaymentActions.REQUIRES_MORE,
            data: baseData,
          }
        default:
          return {
            action: PaymentActions.NOT_SUPPORTED,
            data: baseData,
          }
      }
    } catch (error) {
      this.logger_.error(
        `Error processing webhook for payment ${data.id}: ${error.message}`
      )

      // Even with errors, try to construct a valid response if we have the payment
      const {data: payment} = await this.retrievePayment({
        data: {id: data.id},
      }).catch(() => ({data: null}))

      if (payment) {
        return {
          action: "failed",
          data: {
            session_id: (payment?.metadata as Record<string, any>)?.session_id,
            amount: new BigNumber(payment?.amount as number),
            ...payment,
          },
        }
      }

      throw error
    }
  }
}

export default PayBase
