import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayPrzelewy24Service extends PayBase {
  static identifier = PaymentProviderKeys.PRZELEWY24

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 2151,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.PRZELEWY24 +
        "_pay",
    }
  }
}

export default PayPrzelewy24Service
