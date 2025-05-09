import {PayPaymentStatus} from "../core/constants"

export type PayLanguage = "EN" | "NL" | "DE" | "FR" | "ES" | "IT"

export type PayStatus = "ACTIVE" | "INACTIVE"

export type PayStats = {
  info: string
  tool: string
  object: string
  extra1: string
  extra2: string
  extra3: string
  domainId: string | null
}

export type PayTransferData = {
  name: string
  value: string
}

export type PayTransactionStatus = {
  code: (typeof PayPaymentStatus)[keyof typeof PayPaymentStatus]
  action: string
  phase: string
}

export type PayTransaction = {
  status: PayTransactionStatus
  id: string
}

export type PayTranslations = {
  name: {[key: string]: string}
}

export type PayMoneyAmount = {
  value: number
  currency?: string | null
}

export interface PayAddress {
  firstName?: string | null
  lastName?: string | null
  street?: string | null
  streetNumber?: string | null
  streetNumberExtension?: string
  zipCode?: string | null
  city?: string | null
  country?: string | null
  region?: string
}

export interface PayProduct {
  id?: string
  description?: string
  type?: string
  price?: PayMoneyAmount
  quantity?: number
  vatPercentage?: number
}

export interface PayMerchant {
  code: string
  name: string
  status: PayStatus
}

export interface PayCategory {
  code: string
  name: string
}

export interface PayTgu {
  ID: number
  share: number
  domain: string
  status: PayStatus
}

export interface PayCheckoutOption {
  tag: string
  name: string
  translations: PayTranslations
  image: string
  paymentMethods: {
    id: number
    name: string
    translations: PayTranslations
    image: string
    options: {
      id: string
      name: string
      image: string
    }[]
    settings: object[] | null
  }[]
  requiredFields: {
    fieldName: string
    mandatory: string
  }[]
}

export interface PayCheckoutSequence {
  primary: string[]
  secondary: string[]
}

export interface PayErrorResponse {
  type: string
  title: string
  detail: string
  violations: {
    propertyPath: string
    message: string
    code: string
  }[]
}

export interface PayResponse extends PayErrorResponse {}

export interface PayPaymentData {
  method: string
  customerKey: string
  customerId: string
  customerName: string
  ipAddress: string
  secureStatus: boolean
  paymentVerificationMethod: number
  iban?: {
    iban: string
    bic: string
    owner: string
  }
}

export interface PayCustomer {
  email?: string
  firstName?: string | null
  lastName?: string | null
  birthDate?: Date
  gender?: "M" | "F"
  phone?: string | null
  locale?: string | null
  ipAddress?: string
  trust?: number
  reference?: string
  gaClientId?: string | null
  company?: {
    name?: string
    cocNumber?: string
    vatNumber?: string
    country?: string
  }
}
