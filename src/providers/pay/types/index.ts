import {PayPaymentStatus} from "../core/constants"

/**
 * Configuration options for the Pay. payment provider
 */
export type ProviderOptions = {
  paymentDescription?: Record<"default" | string, string>
  atCode: string
  apiToken: string
  slCode: string
  slSecret: string
  returnUrl: string
  medusaUrl: string
  testMode?: boolean
  tguApiUrl?: string
  otherSlCodes?: Record<string, string>
}

export type PaymentOptions = {
  webhookUrl?: string
}

export const PAY_PROVIDER_ID = "pay"
export const PAY_SOFTPOS_PROVIDER_ID = "pay-softpos"

export type PayWebhookParams = {
  id: string
  event: string
  reference: string
  status_code: (typeof PayPaymentStatus)[keyof typeof PayPaymentStatus]
}

export * from "./common"
export * from "./order"
export * from "./transaction"
