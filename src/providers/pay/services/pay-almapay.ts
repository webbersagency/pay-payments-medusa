import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayAlmapayService extends PayBase {
  static identifier = PaymentProviderKeys.ALMAPAY

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 3552,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.ALMAPAY +
        "_pay",
    }
  }
}

export default PayAlmapayService
