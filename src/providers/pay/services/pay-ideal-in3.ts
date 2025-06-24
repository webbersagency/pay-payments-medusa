import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayIdealIn3Service extends PayBase {
  static identifier = PaymentProviderKeys.IDEAL_IN3

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 1813,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.IDEAL_IN3 +
        "_pay",
    }
  }
}

export default PayIdealIn3Service
