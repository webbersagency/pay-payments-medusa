import {
  PayAddress,
  PayCustomer,
  PayErrorResponse,
  PayMoneyAmount,
  PayProduct,
  PayTransactionStatus,
} from "./common"

export type GiftCardPaymentMethod = {
  cardNumber: string
  pincode?: string
}

export type IdealPaymentMethod = {
  issuerId?: string | null
}

export type PinPaymentMethod = {
  terminalCode: string
}

export type DirectDebitPaymentMethod = {
  firstName: string | null
  lastName: string | null
  email: string | null
  city: string | null
  iban: string | null
  bic: string | null
  permissionGiven?: boolean
}

export type KlarnaPaymentMethod = {
  countryCode: string
}

export type PayPaymentMethod = {
  id: number
  input?:
    | GiftCardPaymentMethod
    | PinPaymentMethod
    | DirectDebitPaymentMethod
    | KlarnaPaymentMethod
}

export interface PayOrder {
  countryCode: string
  deliveryDate: Date
  invoiceDate: Date
  deliveryAddress: PayAddress
  invoiceAddress: PayAddress
  products: PayProduct[]
}

export interface CreateOrder {
  serviceId: string
  description?: string
  reference?: string
  expire?: Date | string
  returnUrl?: string
  exchangeUrl?: string
  amount: PayMoneyAmount
  paymentMethod?: PayPaymentMethod
  integration?: {
    test?: boolean
  }
  customer?: PayCustomer
  order?: {
    countryCode?: string | null
    deliveryDate?: string
    invoiceDate?: string
    deliveryAddress?: PayAddress
    invoiceAddress?: PayAddress
    products?: PayProduct[]
  }
  transferData?: Record<string, string>
}

export interface UpdateOrder {
  description?: string
  reference?: string
}

export interface DirectDebitInfoRequest {
  mandateId: string
  referenceId?: string
}

export interface DirectDebitInfoResponse {
  request: {
    result: "0" | "1" // "1" indicates success
    errorId: string // Error code, if any
    errorMessage: string // Error message, if any
  }
  result: {
    mandate: Mandate
    directDebit: DirectDebit[]
  }
}

interface Mandate {
  mandateId: string // Mandate ID
  type: MandateType // Type of mandate, e.g., "single"
  bankaccountNumber: string // Customer's IBAN
  bankaccounOwner: string // Customer's name (note: typo in key)
  bankaccountBic: string // Customer's BIC code
  amount: string // Amount in cents (e.g., "995" for €9.95)
  description: string // Description of the mandate
  intervalValue: string // Interval value (e.g., "0")
  intervalPeriod: string // Interval period (e.g., "0")
  intervalQuantity: string // Interval quantity (e.g., "1")
  state: MandateState // State of the mandate, e.g., "single"
  ipAddress: string // Customer's IP address
  email: string // Customer's email address
  promotorId: string // Promotor ID
  tool: string // Tool variable
  info: string // Info variable
  extra1: string // Additional info 1
  extra2: string // Additional info 2
  extra3: string // Additional info 3
}

interface DirectDebit {
  referenceId: string // Unique reference ID for the direct debit
  bankaccountNumber: string // IBAN of the customer
  bankaccountHolder: string // Name of the account holder
  bankaccountBic: string // BIC code of the account
  paymentSessionId: string // Payment session ID
  amount: string // Amount in cents
  description: string // Description of the direct debit
  sendDate: string // Date the direct debit was sent
  receiveDate: string // Date the funds were received
  statusCode: string // Status code of the transaction
  statusName: string // Status name of the transaction
  declineCode: string // Decline reason code
  declineName: string // Decline reason name
  declineDate: string // Decline date, if applicable
}

type MandateType = "single" | "recurring"
type MandateState = "first" | "active" | "last" | "single"

export interface CreateDirectDebitRequest {
  reference: string // Reference
  serviceId: string // SL-code
  amount: number // Amount in cents
  bankaccountHolder: string // Name of the customer
  bankaccountNumber: string // IBAN number of the customer
  processDate?: string // The date on which the direct debit should be processed (dd-mm-yyyy)
  description?: string // Description of the direct debit instruction
  currency?: string // Currency according to ISO 4217 (three-letter code). If empty, EUR will be used. See https://admin.pay.nl/data/currencies for a list.
  exchangeUrl?: string // The exchange URL to be used for this direct debit
  ipAddress?: string // IP address of the customer
  email?: string // Email address of the customer
  promotorId?: number // The ID of the promoter (webmaster)
  tool?: string // 'Tool' variable that can be traced in statistics
  info?: string // 'Info' variable that can be traced in statistics
  object?: string // 'Object' variable that can be traced in statistics
  extra1?: string // 'Extra1' variable that can be traced in statistics
  extra2?: string // 'Extra2' variable that can be traced in statistics
  extra3?: string // 'Extra3' variable that can be traced in statistics
}

export interface CreateDirectDebitResponse {
  request: {
    result: "0" | "1"
    errorId: string
    errorMessage: string
  }
  result: string
}

export interface OrderResponse extends PayErrorResponse {
  id: string
  serviceId: string
  description: string
  reference: string
  manualTransferCode: string
  orderId: string
  uuid: string
  customerKey: string | null
  status: PayTransactionStatus
  receipt: string | null
  integration: {
    test: boolean
  }
  amount: PayMoneyAmount
  authorizedAmount: PayMoneyAmount
  capturedAmount: PayMoneyAmount
  checkoutData: {
    customer: PayCustomer
    billingAddress: PayAddress
    shippingAddress: PayAddress
  }
  payments: PayOrderPayment[]
  createdAt: Date
  createdBy: string
  modifiedAt: Date | null
  modifiedBy: string | null
  expiresAt: Date
  completedAt: Date
  links: Record<string, string>
  transferData: Record<string, string>
}

export interface PayOrderPayment {
  id: string
  paymentMethod: PayPaymentMethod
  customerType: string | null
  customerKey: string | null
  customerId: string | null
  customerName: string | null
  ipAddress: string | null
  secureStatus: boolean
  paymentVerificationMethod: number | null
  status: PayTransactionStatus
  currencyAmount: PayMoneyAmount
  amount: PayMoneyAmount
  authorizedAmount: PayMoneyAmount
  capturedAmount: PayMoneyAmount
  supplierData: string[] | null
}
