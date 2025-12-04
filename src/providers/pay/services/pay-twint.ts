import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayTwintService extends PayBase {
  static identifier = PaymentProviderKeys.TWINT

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 3840,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.TWINT +
        "_pay",
    }
  }
}

export default PayTwintService
