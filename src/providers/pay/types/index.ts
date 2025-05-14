import {PayPaymentStatus} from "../core/constants"
import {PayPaymentMethod} from "./order"

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
  methodId?: number
  webhookUrl?: string
}

export const PaymentProviderKeys = {
  PAY_HOSTED_CHECKOUT: "pay-hosted-checkout",
  BAN_CONTACT: "pay-bancontact",
  CREDITCARD: "pay-creditcard-group",
  IDEAL: "pay-ideal",
  SOFTPOS: "pay-softpos",
}

export type PaymentProviderValue =
  (typeof PaymentProviderKeys)[keyof typeof PaymentProviderKeys]

export * from "./common"
export * from "./order"
export * from "./transaction"
