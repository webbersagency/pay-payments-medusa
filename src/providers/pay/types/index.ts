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
  /**
   * Which Pay. API creates direct debits. "v2" (default) uses the mandate
   * API (rest.pay.nl/v2/directdebits/mandates), which reports
   * refunds/chargebacks but requires the account to have access to the v2
   * directdebits endpoints (403 otherwise); set "v3" to use the
   * rest-api.pay.nl/v3 DirectDebit/debitAdd endpoint instead. The created
   * debit is stored in the same shape either way, so switching requires no
   * data migration.
   */
  directDebitApiVersion?: "v2" | "v3"
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
  SWISH: "pay-swish",
  SATISPAY: "pay-satispay",
  GIVACARD: "pay-givacard",
  BANCOMAT: "pay-bancomat",
  FLOA: "pay-floa",
  PIX: "pay-pix",
}

export type PaymentProviderValue =
  (typeof PaymentProviderKeys)[keyof typeof PaymentProviderKeys]

export * from "./common"
export * from "./order"
export * from "./transaction"
