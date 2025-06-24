import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayPaypalService extends PayBase {
  static identifier = PaymentProviderKeys.PAYPAL

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 138,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.PAYPAL +
        "_pay",
    }
  }
}

export default PayPaypalService
