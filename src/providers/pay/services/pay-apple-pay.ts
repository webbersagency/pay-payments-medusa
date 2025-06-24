import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayApplePayService extends PayBase {
  static identifier = PaymentProviderKeys.APPLE_PAY

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 2277,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.APPLE_PAY +
        "_pay",
    }
  }
}

export default PayApplePayService
