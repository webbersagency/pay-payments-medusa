import {PayPaymentMethod} from "../types"
import {bnplPaymentMethods, regionalPaymentMethods} from "./paymentMethodMap"

const getExpirationForPaymentMethod = (paymentMethod: PayPaymentMethod) => {
  if (regionalPaymentMethods[paymentMethod?.id]) {
    return "+15 minutes"
  }

  if (
    bnplPaymentMethods[paymentMethod?.id] &&
    // Exclude SprayPay from here
    paymentMethod.id !== 1987
  ) {
    return "+30 minutes"
  }

  return "+4 hours"
}

export default getExpirationForPaymentMethod
