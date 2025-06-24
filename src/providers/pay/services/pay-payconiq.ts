import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayPayconiqService extends PayBase {
  static identifier = PaymentProviderKeys.PAYCONIQ

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 2379,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.PAYCONIQ +
        "_pay",
    }
  }
}

export default PayPayconiqService
