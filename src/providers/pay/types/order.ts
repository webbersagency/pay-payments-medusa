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
  firstName?: string | null
  lastName?: string | null
  accountHolder?: string | null
  email: string | null
  city: string | null
  iban: string | null
  bic?: string | null
  permissionGiven?: boolean
}

export type KlarnaPaymentMethod = {
  countryCode: string
}

// map the ids that *do* require an input to the exact input type
export type PayIdPaymentMethodMap = {
  10: IdealPaymentMethod
  137: DirectDebitPaymentMethod
  1717: KlarnaPaymentMethod
}

// union of the mapped cases + a fallback case
export type PayPaymentMethod =
  | {
      [K in keyof PayIdPaymentMethodMap]: {
        id: K
        input: PayIdPaymentMethodMap[K]
      }
    }[keyof PayIdPaymentMethodMap]
  | {id: number; input?: never} // for all other ids, input must not be provided

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

export interface DirectDebitInfoResponse {
  total: number
  count: number
  pages: number
  directdebits: DirectDebit[]
  _links?: Record<string, {href: string; rel?: string; type?: string}>
}

export interface DirectDebit {
  id: string
  description: string
  url: string
  processDate: string
  orderId: string // The Pay. transaction id of the collection, used for refunds
  paymentSessionId: string
  type: "SINGLE" | "RECURRING" | "FLEXIBLE"
  amount: {
    value: number
    currency: string
  }
  status: {
    code: number
    action: string
    phase: string
  }
  declined: boolean
  decline: {
    code: string
    reason: string
    date: string
  } | null
  bankAccount: {
    iban: string
    bic: string
    owner: string
  }
  mandate: {
    code: string
    description: string
    reference: string
  }
  service: {
    code: string
    name: string
  }
  merchant: {
    code: string
    name: string
    status: "ACTIVE" | "INACTIVE"
    incorporationCountry: string
  }
  stats: DirectDebitStats
  createdAt: string
  createdBy: string
  modifiedAt: string
  modifiedBy: string
  deletedAt: string | null
  deletedBy: string | null
}

interface DirectDebitStats {
  info?: string | null
  tool?: string | null
  object?: string | null
  extra1?: string | null
  extra2?: string | null
  extra3?: string | null
  domainId?: string | null
}

export interface CreateDirectDebitRequest {
  serviceId: string // SL-code
  reference: string // Reference
  description?: string // Description of the direct debit instruction
  processDate?: string // The date on which the direct debit should be processed (dd-mm-yyyy)
  exchangeUrl?: string // The exchange URL to be used for this direct debit
  type?: "SINGLE" | "RECURRING" | "FLEXIBLE"
  interval?: {
    period?: "day" | "week" | "month" | "trimester" | "halfyear" | "year"
    quantity?: number
    value?: number
  }
  amount: {
    value: number // Amount in cents
    currency?: string
  }
  customer: {
    ipAddress?: string
    email: string
    bankAccount: {
      iban: string
      bic?: string
      owner: string
    }
  }
  stats?: DirectDebitStats
}

export interface CreateDirectDebitResponse {
  code: string // The mandate code, used to retrieve the direct debit later
  serviceId: string
  reference: string
  description: string
  processDate: string
  exchangeUrl: string | null
  type: "SINGLE" | "RECURRING" | "FLEXIBLE"
  interval: {
    value: number
    quantity: number
    period: string
  }
  amount: {
    value: number
    currency: string
  }
  customer: {
    email: string
    ipAddress: string
    bankAccount: {
      iban: string
      bic: string
      owner: string
    }
  }
  service: {
    code: string
    name: string
  }
  merchant: {
    code: string
    name: string
    status: string
    incorporationCountry: string
  }
  stats: DirectDebitStats
  lastDirectDebitDate: string | null
  nextDirectDebitDate: string | null
  actualDirectDebitDate: string | null
  createdAt: string
  createdBy: string
  modifiedAt: string
  modifiedBy: string
  deletedAt: string | null
  deletedBy: string | null
  _links?: {
    href: string
    rel: string
    type: string
  }[]
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
