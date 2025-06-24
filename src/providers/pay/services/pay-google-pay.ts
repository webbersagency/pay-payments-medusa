import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayGooglePayService extends PayBase {
  static identifier = PaymentProviderKeys.GOOGLE_PAY

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 2558,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.GOOGLE_PAY +
        "_pay",
    }
  }
}

export default PayGooglePayService
