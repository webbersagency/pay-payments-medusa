export const PayEnvironmentPaths = {
  REST_API: "https://rest.pay.nl/v2",
  TGU_API: "https://connect.pay.nl/v1",
  REST_API_v3: "https://rest-api.pay.nl/v3",
}

export const PayApiPath = {
  GET_CONFIG: "/services/config?serviceId={id}",
  ORDER_CREATE: "/orders",
  ORDER_UPDATE: "/orders/{id}",
  ORDER_STATUS: "/orders/{id}/status",
  ORDER_CAPTURE: "/orders/{id}/capture",
  ORDER_ABORT: "/orders/{id}/abort",
  GET_TRANSACTION: "/transactions/{id}",
  TRANSACTION_REFUND: "/transactions/{id}/refund",
  DIRECT_DEBIT: "/DirectDebit/debitAdd/json",
  DIRECT_DEBIT_INFO: "/DirectDebit/info/json",
}

// Transaction Statuses: https://developer.pay.nl/docs/transaction-statuses#after-processing-statuses
export const PayPaymentStatus = {
  // Pending Statuses
  INIT: 20,
  PENDING_20: 20,
  PENDING_50: 50,
  PENDING_90: 90,
  PENDING_98: 98,
  // Processing statuses
  CANCEL: -90,
  EXPIRED: -80,
  DENIED_64: -64,
  DENIED_63: -63,
  CANCEL_61: -61,
  FAILURE: -60,
  PAID_CHECKAMOUNT: -51,
  PARTIAL_PAYMENT: 80,
  VERIFY: 85,
  AUTHORIZE: 95,
  PARTLY_CAPTURED: 97,
  PAID: 100,
  // After processing statuses
  CHARGEBACK: -71,
  REFUNDING: -72,
  REFUND: -81,
  PARTIAL_REFUND: -82,
} as const
