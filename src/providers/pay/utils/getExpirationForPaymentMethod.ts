import {PayPaymentMethod} from "../types"
import {bnplPaymentMethods, regionalPaymentMethods} from "./paymentMethodMap"

function getExpirationForPaymentMethod(paymentMethod: PayPaymentMethod) {
  if (regionalPaymentMethods[paymentMethod?.id]) {
    return "+15 minutes"
  }

  if (
    bnplPaymentMethods[paymentMethod?.id] &&
    // Exclude SprayPay
    paymentMethod.id !== 1987
  ) {
    return "+30 minutes"
  }

  return "+4 hours"
}

export default getExpirationForPaymentMethod
