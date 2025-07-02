import {
  CustomerDTO,
  Logger,
  OrderDTO,
  ProviderWebhookPayload,
  SalesChannelDTO,
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
  PaymentSessionDTO,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
} from "@medusajs/types"
import {
  AbstractEventBusModuleService,
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
  PayPaymentMethod,
  PayProduct,
  PayStatusCode,
  PayTransactionStatus,
  ProviderOptions,
} from "../types"
import {PayClient} from "./pay-client"
import crypto from "crypto"
import {PayPaymentStatus} from "./constants"
import getExpirationForPaymentMethod from "../utils/getExpirationForPaymentMethod"

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
  protected eventBusService_: AbstractEventBusModuleService

  /**
   * Validates that the required options are provided
   * @param options - The options to validate
   * @throws {MedusaError} If required config is missing
   */
  static validateOptions(options: ProviderOptions): void {
    if (
      !options.atCode ||
      !options.apiToken ||
      !options.slCode ||
      !options.slSecret ||
      !options.returnUrl ||
      !options.medusaUrl
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "AT Code, API Token, SL Code, SL Secret, Return URL & Medusa URL are required in the provider's options."
      )
    }
  }

  /**
   * Creates a new instance of the Pay. payment provider
   * @param container - The dependency container
   * @param options - Configuration options
   */
  constructor(container, options: ProviderOptions) {
    super(container, options)

    this.logger_ = container.logger
    this.options_ = options
    this.debug_ =
      options.testMode ||
      process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV === "test" ||
      false

    this.client_ = new PayClient(options, this.logger_)
    this.eventBusService_ = container.event_bus
  }

  abstract get paymentCreateOptions(): PaymentOptions

  getPaymentDescription = (
    order: OrderDTO & {sales_channel: SalesChannelDTO}
  ) => {
    const language = order.metadata?.locale as string
    const paymentDescriptions = this.options_?.paymentDescription

    const displayId = order.display_id.toString()
    let description = order.sales_channel?.name
      ? `${order.sales_channel.name} - #${displayId}`
      : `#${displayId}`

    if (paymentDescriptions) {
      description =
        language && paymentDescriptions?.[language]
          ? paymentDescriptions[language]
          : (paymentDescriptions?.default ?? "[display_id]")
      description = description.replace("[display_id]", displayId)
    }

    return description
  }

  createPayOrderPayload(
    order: OrderDTO & {customer: CustomerDTO; sales_channel: SalesChannelDTO},
    paymentSession: PaymentSessionDTO
  ): Omit<CreateOrder, "serviceId"> {
    const session_id = paymentSession.data?.session_id as string
    const paymentMethodInput = paymentSession.data
      ?.paymentMethodInput as PayPaymentMethod["input"]
    const currency = order.currency_code.toUpperCase()

    const products: PayProduct[] = order.items!.map((item) => ({
      id: item.variant_sku || item.variant_id || item.id,
      description: `${item.product_title} - ${item.variant_title}`,
      type: "ARTICLE",
      price: {
        value: Math.round(
          ((item.original_total.valueOf() as number) / item.quantity) * 100
        ),
        currency,
      },
      quantity: item.quantity,
      vatPercentage: item.tax_lines?.[0]?.rate,
    }))

    const discount = (order.discount_total.valueOf() as number) * 100

    if (discount > 0) {
      products.push({
        type: "DISCOUNT",
        id: "DISCOUNT",
        description: "Discount",
        price: {
          value: discount * -1,
          currency,
        },
        quantity: 1,
      })
    }

    const shippingTotal = (order.shipping_total.valueOf() as number) * 100

    if (shippingTotal > 0) {
      products.push({
        type: "SHIPPING",
        id: "SHIPPING",
        description: "Shipping",
        price: {
          value: shippingTotal,
          currency,
        },
        quantity: 1,
      })
    }

    let paymentMethod: PayPaymentMethod | undefined

    if (typeof this.paymentCreateOptions.methodId !== "undefined") {
      paymentMethod = {
        id: this.paymentCreateOptions.methodId,
        input: paymentMethodInput,
      }
    }

    const payload = {
      reference: order.display_id.toString(),
      description: this.getPaymentDescription(order),
      paymentMethod,
      returnUrl: `${this.options_.returnUrl}?locale=${order.metadata?.locale?.toString()?.toLowerCase()}&orderId=${order.id}`,
      expire: paymentMethod
        ? getExpirationForPaymentMethod(paymentMethod)
        : undefined,
      exchangeUrl: this.paymentCreateOptions.webhookUrl,
      transferData: {
        session_id,
      },
      amount: {
        value: Math.round((paymentSession.amount.valueOf() as number) * 100),
        currency,
      },
      customer: {
        firstname:
          order.customer?.first_name || order.billing_address?.first_name,
        lastname: order.customer?.last_name || order.billing_address?.last_name,
        ipAddress: order.metadata?.ip as string,
        phone: order.customer?.phone || order.billing_address?.phone,
        email: order.email,
        locale: order.metadata?.locale?.toString()?.toUpperCase() ?? "EN",
        reference: order.customer?.id,
      },
      order: {
        countryCode: order.billing_address?.country_code?.toUpperCase(),
        invoiceAddress: {
          firstName: order.billing_address?.first_name,
          lastName: order.billing_address?.last_name,
          street: order.billing_address?.address_1,
          streetNumber: order.billing_address?.address_2,
          zipCode: order.billing_address?.postal_code,
          city: order.billing_address?.city,
          country: order.billing_address?.country_code?.toUpperCase(),
        },
        deliveryAddress: {
          firstName: order.shipping_address?.first_name,
          lastName: order.shipping_address?.last_name,
          street: order.shipping_address?.address_1,
          streetNumber: order.shipping_address?.address_2,
          zipCode: order.shipping_address?.postal_code,
          city: order.shipping_address?.city,
          country: order.shipping_address?.country_code?.toUpperCase(),
        },
        products,
      },
    }

    if (this.options_.testMode) {
      try {
        this.logger_.debug(JSON.stringify(payload))
      } catch (e) {}
    }

    return payload
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
    return {
      data: {session_id: data?.session_id as string},
      id: crypto.randomUUID(),
    }
  }

  /**
   * Authorize the Pay. payment
   * @param input - The payment authorization input
   * @returns The authorization result
   */
  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    if (input.data?.orderId) {
      const {status} = await this.getPaymentStatus(input)

      return {data: input.data, status}
    }

    return {data: input.data, status: PaymentSessionStatus.AUTHORIZED}
  }

  /**
   * Captures an authorized payment if autoCapture is disabled
   * @param input - The payment capture input
   * @returns The capture result
   */
  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const id = input.data?.orderId as string

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
      if (data?.status?.code === PayPaymentStatus.AUTHORIZE) {
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
    const id = input.data?.orderId as string

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
          value: parseInt(value.toString()) * 100,
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
    const id = input.data?.orderId as string

    if (!id) {
      return {}
    }

    try {
      const payment = await this.client_.getOrder(id)

      const cancelledStatusses: PayStatusCode[] = [
        PayPaymentStatus.CANCEL,
        PayPaymentStatus.EXPIRED,
        PayPaymentStatus.DENIED_64,
        PayPaymentStatus.DENIED_63,
        PayPaymentStatus.CANCEL_61,
        PayPaymentStatus.CHARGEBACK,
      ]

      if (cancelledStatusses.includes(payment.status.code)) {
        this.debug_ &&
          this.logger_.info(
            `Pay. payment ${id} is already canceled or expired, no need to cancel`
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

      /**
       * Also see Pay. status codes: https://developer.pay.nl/docs/transaction-statuses#after-processing-statuses
       * Pay. payments should always go to authorized, so we can continue creating the order.
       * This is required for Buy-now-pay-later options, where it can take some time before
       * a paid status is reached.
       */
      const statusMap = {
        [PayPaymentStatus.INIT]: PaymentSessionStatus.PENDING,
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

    if (!id) {
      throw new MedusaError(
        MedusaErrorTypes.INVALID_DATA,
        "Payment id not present"
      )
    }

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
    // If the Pay data is passed from the order created hook, only then we update
    // the session data.
    const payload = input.data?.payload as Omit<
      CreateOrder,
      "serviceId" | "returnUrl"
    >

    if (payload) {
      try {
        const data = await this.client_.createOrder(payload).catch((error) => {
          this.logger_.error(`Pay. payment creation failed: ${error.message}`)
          throw new MedusaError(MedusaError.Types.INVALID_DATA, error.message)
        })

        this.debug_ &&
          this.logger_.info(
            `Pay. payment ${data.id} successfully created with amount ${payload.amount.currency} ${payload.amount.value}`
          )

        return {data: data as Record<string, any>}
      } catch (error) {
        this.logger_.error(`Error initiating Pay. payment: ${error.message}`)
        throw error
      }
    }

    return {data: {}}
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

    try {
      let payment: OrderResponse | null = null

      // For the legacy Pay. webhooks no header signature can be done and only
      // order_id should be used to retrieve the payment.
      if (data.action === "new_ppt") {
        const {data: paymentData} = (await this.retrievePayment({
          data: {
            id: data.order_id,
          },
        }).catch((e) => {
          throw new MedusaError(MedusaError.Types.NOT_FOUND, e.message)
        })) as unknown as {data: OrderResponse}

        if (!payment) {
          throw new MedusaError(
            MedusaError.Types.NOT_FOUND,
            "Payment not found"
          )
        }

        payment = paymentData
      } else {
        // For new webhooks from Pay., check the signature. If valid, the payload
        // will already contain the payment object, so no additional retrieval
        // of the payment is required.
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
          payment = data.object as OrderResponse
        }
      }

      if (!payment) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "Payment not found")
      }

      const baseData = {
        session_id: payment.transferData.session_id,
        amount: payment.amount.value / 100,
      }

      if (this.debug_) {
        this.logger_.debug(`PayPaymentStatus: ${payment.status.code}`)
        this.logger_.debug(JSON.stringify(baseData))
      }

      switch (payment.status.code) {
        case PayPaymentStatus.PAID:
          return {
            action: PaymentActions.SUCCESSFUL,
            data: baseData,
          }
        case PayPaymentStatus.INIT:
        case PayPaymentStatus.PENDING_20:
        case PayPaymentStatus.PENDING_50:
        case PayPaymentStatus.PENDING_90:
        case PayPaymentStatus.PENDING_98:
        case PayPaymentStatus.VERIFY:
          return {
            action: PaymentActions.PENDING,
            data: baseData,
          }
        case PayPaymentStatus.CANCEL:
        case PayPaymentStatus.EXPIRED:
        case PayPaymentStatus.DENIED_64:
        case PayPaymentStatus.DENIED_63:
        case PayPaymentStatus.CANCEL_61:
        case PayPaymentStatus.CHARGEBACK:
          await this.eventBusService_.emit(
            {
              name: "pay_payment.canceled",
              data: {
                // This will be the Order ID that has been set during the creation of the payment
                id: payment.reference,
              },
            },
            {}
          )

          return {
            action: PaymentActions.CANCELED,
            data: baseData,
          }
        case PayPaymentStatus.FAILURE:
        case PayPaymentStatus.PAID_CHECKAMOUNT:
          return {
            action: PaymentActions.FAILED,
            data: baseData,
          }
        case PayPaymentStatus.PARTIAL_PAYMENT:
        case PayPaymentStatus.PARTLY_CAPTURED:
          return {
            action: PaymentActions.REQUIRES_MORE,
            data: baseData,
          }
        case PayPaymentStatus.AUTHORIZE:
          return {
            action: PaymentActions.AUTHORIZED,
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
        data: {id: data.orderId},
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
