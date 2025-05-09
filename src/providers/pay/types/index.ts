import {PayPaymentStatus} from "../core/constants"
import {PayPaymentMethod} from "./order"

/**
 * Configuration options for the Pay. payment provider
 */
export type ProviderOptions = {
  atCode: string
  apiToken: string
  slCode: string
  slSecret: string
  otherSlCodes?: Record<string, string>
  exchangeUrl?: string
  testMode?: boolean
  debugMode?: boolean
  paymentDescription?: Record<"default" | string, string>
  /**
   * The delay in milliseconds before processing the webhook event.
   * @defaultValue 5000
   */
  webhookDelay?: number
  /**
   * The number of times to retry the webhook event processing in case of an error.
   * @defaultValue 3
   */
  webhookRetries?: number
  /**
   * Set custom URL for the Pay. TGU endpoint or REST API
   */
  restApiUrl?: string
  tguApiUrl?: string
  captureMode?: "automatic" | "manual"
}

export type PaymentOptions = PayPaymentMethod

export const PaymentProviderKeys = {
  IDEAL: "pay-ideal",
}

export type PayWebhookParams = {
  id: string
  event: string
  reference: string
  status_code: (typeof PayPaymentStatus)[keyof typeof PayPaymentStatus]
}

export * from "./common"
export * from "./order"
export * from "./transaction"
