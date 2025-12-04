import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayMobilepayService extends PayBase {
  static identifier = PaymentProviderKeys.MOBILEPAY

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 3558,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.MOBILEPAY +
        "_pay",
    }
  }
}

export default PayMobilepayService
