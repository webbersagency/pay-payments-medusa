import {
  PayAddress,
  PayCategory,
  PayCheckoutOption,
  PayCheckoutSequence,
  PayCustomer,
  PayErrorResponse,
  PayMerchant,
  PayMoneyAmount,
  PayPaymentData,
  PayProduct,
  PayStats,
  PayStatus,
  PayTgu,
  PayTransactionStatus,
  PayTransferData,
  PayTranslations,
} from "./common"
import {PayOrder, PayPaymentMethod} from "./order"

export interface GetConfigResponse {
  code: string
  secret: string
  testMode: boolean
  name: string
  translations: PayTranslations | null
  status: PayStatus
  merchant: PayMerchant | null
  category: PayCategory
  mcc: number | null
  turnoverGroup: null
  layout: {
    code: string
    name: string
    cssUrl: string
    icon: string | null
    supportingColor: string
    headerTextColor: string
    buttonColor: string
    buttonTextColor: string
  }
  tradeName: {
    code: string
    name: string
  }
  createdAt: Date | null
  createdBy: string | null
  modifiedAt: Date | null
  modifiedBy: string | null
  deletedAt: Date | null
  deletedBy: string | null
  checkoutOptions: PayCheckoutOption[]
  checkoutSequence: {
    default: PayCheckoutSequence
    [key: string]: PayCheckoutSequence
  }
  checkoutTexts: object | null
  tguList: PayTgu[]
}

export interface GetTransactionStatusResponse {
  id: string
  orderId: string
  serviceCode: string
  description: string
  reference: string
  ipAddress: string
  amount: PayMoneyAmount
  amountConverted: PayMoneyAmount
  amountPaid: PayMoneyAmount
  amountRefunded: PayMoneyAmount
  status: PayTransactionStatus
  paymentData: PayPaymentData
  paymentMethod: PayPaymentMethod
  integration: {
    testMode: boolean
  }
  expiresAt: Date
  createdAt: Date
  createdBy: string
  modifiedAt: Date
  modifiedBy: string | null
  deletedAt: Date | null
  deletedBy: string | null
}

export interface GetTransactionFullResponse
  extends GetTransactionStatusResponse {
  customer: PayCustomer
  order: PayOrder
  stats: PayStats
  transferData: PayTransferData[]
  payments: any[]
}

export interface refundTransaction {
  amountRefunded: PayMoneyAmount
  refund: {
    id: string
  }
  createdAt: string
  createdBy: string
}

export interface Link {
  href: string
  rel: string
  type: string
}

export interface CapturesRefundResponse {
  orderId: string
  transactionId: string
  description: string
  processDate: string
  amount: PayMoneyAmount
  amountRefunded: PayMoneyAmount
  refundedTransactions: refundTransaction[]
  createdAt: string
  createdBy: string
  _links: Link[]
}

export interface RefundTransaction {
  amount: PayMoneyAmount
  products?: PayProduct[]
  description?: string
  processDate?: Date
  vatPercentage?: number
  exchangeUrl: string
}
