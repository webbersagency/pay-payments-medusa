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
  debugMode?: boolean
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
  SOFTPOS: "pay-softpos",
  BAN_CONTACT: "pay-bancontact",
  CREDITCARD: "pay-creditcard-group",
  IDEAL: "pay-ideal",
  APPLE_PAY: "pay-apple-pay",
  GOOGLE_PAY: "pay-google-pay",
  PAYPAL: "pay-paypal",
  IDEAL_IN3: "pay-ideal-in3",
  BILLINK: "pay-billink",
  SPRAYPAY: "pay-spraypay",
  RIVERTY: "pay-riverty",
  MONDU: "pay-mondu",
  ALMAPAY: "pay-almapay",
  KLARNA: "pay-klarna",
  PAYCONIQ: "pay-payconiq",
  BLIK: "pay-blik",
  TWINT: "pay-twint",
  EPS: "pay-eps",
  PRZELEWY24: "pay-przelewy24",
  PAYBYBANK: "pay-paybybank",
  MOBILEPAY: "pay-mobilepay",
  WECHATPAY: "pay-wechatpay",
  DIRECTDEBIT: "pay-direct-debit",
  SEPA_TRANSFER: "pay-sepa-transfer",
  WERO: "pay-wero",
  VIPPS: "pay-vipps",
  BRITE: "pay-brite",
}

export type PaymentProviderValue =
  (typeof PaymentProviderKeys)[keyof typeof PaymentProviderKeys]

export * from "./common"
export * from "./order"
export * from "./transaction"
