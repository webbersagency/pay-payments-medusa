import {PaymentProviderKeys, PayPaymentMethod} from "../types"
import {payPaymentMethods} from "../../../constants"

function getExpirationForPaymentMethod(paymentMethod: PayPaymentMethod) {
  const payPaymentMethod = payPaymentMethods.find(
    ({id}) => id === paymentMethod?.id
  )

  // Return undefined for payment methods that don't require an expiration
  if (
    [
      136, // Bank Transfer (SCT)
      137, // SEPA Direct Debit
    ].includes(paymentMethod.id)
  ) {
    return
  }

  if (payPaymentMethod?.type === "regional") {
    return "+15 minutes"
  }

  if (
    payPaymentMethod?.type === "buy_now_pay_later" &&
    // Exclude SprayPay
    payPaymentMethod?.value !== PaymentProviderKeys.SPRAYPAY
  ) {
    return "+30 minutes"
  }

  return "+4 hours"
}

export default getExpirationForPaymentMethod
