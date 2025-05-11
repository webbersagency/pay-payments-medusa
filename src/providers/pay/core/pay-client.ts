import {HttpClient} from "./http-client"
import {
  CapturesRefundResponse,
  CreateDirectDebitRequest,
  CreateDirectDebitResponse,
  CreateOrder,
  DirectDebitInfoRequest,
  DirectDebitInfoResponse,
  GetConfigResponse,
  GetTransactionFullResponse,
  OrderResponse,
  ProviderOptions,
  RefundTransaction,
  UpdateOrder,
} from "../types"
import {PayApiPath} from "../core/constants"
import {displayName, version} from "../../../../package.json"
import {Logger} from "@medusajs/medusa"

export class PayClient {
  protected readonly httpClient_: HttpClient
  protected readonly serviceId_: string

  constructor(options: ProviderOptions, logger: Logger) {
    this.httpClient_ = new HttpClient({options, logger})
    this.serviceId_ = options.slCode
  }

  /**
   * Create a new order.
   * @param data
   * @param returnPath
   */
  async createOrder(
    data: Omit<CreateOrder, "serviceId">
  ): Promise<OrderResponse> {
    return await this.httpClient_.tguRequest({
      endpoint: PayApiPath.ORDER_CREATE,
      data: {
        ...data,
        serviceId: this.serviceId_,
        stats: {
          object: `${displayName}|version ${version}`,
        },
      },
    })
  }

  async updateOrder(
    orderId: string,
    data: UpdateOrder
  ): Promise<OrderResponse> {
    return await this.httpClient_.tguRequest({
      endpoint: PayApiPath.ORDER_UPDATE.replace("{id}", orderId),
      data,
    })
  }

  async getOrder(orderId: string): Promise<GetTransactionFullResponse> {
    return await this.httpClient_.tguRequest({
      endpoint: PayApiPath.ORDER_STATUS.replace("{id}", orderId),
      method: "GET",
    })
  }

  async captureOrder(orderId: string): Promise<OrderResponse> {
    return await this.httpClient_.tguRequest({
      endpoint: PayApiPath.ORDER_CAPTURE.replace("{id}", orderId),
      method: "PATCH",
    })
  }

  async abortOrder(orderId: string): Promise<OrderResponse> {
    return await this.httpClient_.tguRequest({
      endpoint: PayApiPath.ORDER_ABORT.replace("{id}", orderId),
      method: "PATCH",
    })
  }

  /**
   * Get service location config.
   */
  async getConfig(): Promise<GetConfigResponse> {
    return await this.httpClient_.apiRequest({
      endpoint: PayApiPath.GET_CONFIG.replace("{id}", this.serviceId_),
      method: "GET",
    })
  }

  /**
   * Retrieve transaction status.
   * @param orderId
   */
  async getTransaction(orderId: string): Promise<GetTransactionFullResponse> {
    return await this.httpClient_.apiRequest({
      endpoint: PayApiPath.GET_TRANSACTION.replace("{id}", orderId),
      method: "GET",
    })
  }

  /**
   * Refunds a captured payment, by ID. For a full refund, include an empty
   * payload in the JSON request body. For a partial refund, include an amount
   * object in the JSON request body.
   * @param paymentId
   * @param data
   */
  async refundPayment(
    paymentId: string,
    data: Omit<RefundTransaction, "exchangeUrl">
  ): Promise<CapturesRefundResponse> {
    return await this.httpClient_.apiRequest({
      endpoint: PayApiPath.TRANSACTION_REFUND.replace("{id}", paymentId),
      data,
      method: "PATCH",
    })
  }

  /**
   * Create the one-off direct debit
   * @param data
   */
  async createDirectDebit(
    data: Omit<CreateDirectDebitRequest, "serviceId">
  ): Promise<CreateDirectDebitResponse | void> {
    if (this.httpClient_.testMode) {
      console.log("createDirectDebit", data)
    } else {
      return await this.httpClient_.restApiV3Request<
        CreateDirectDebitRequest,
        CreateDirectDebitResponse
      >({
        endpoint: PayApiPath.DIRECT_DEBIT,
        data: {
          ...data,
          serviceId: this.serviceId_,
        },
      })
    }
  }

  /**
   * Create the one-off direct debit
   * @param data
   */
  async getDirectDebitInfo(
    mandateId: string
  ): Promise<DirectDebitInfoResponse> {
    return await this.httpClient_.restApiV3Request<
      DirectDebitInfoRequest,
      DirectDebitInfoResponse
    >({
      endpoint: PayApiPath.DIRECT_DEBIT_INFO,
      data: {
        mandateId,
      },
    })
  }
}
