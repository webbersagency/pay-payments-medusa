import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PaySoftposService extends PayBase {
  static identifier = PaymentProviderKeys.SOFTPOS

  get paymentCreateOptions(): PaymentOptions {
    return {
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.SOFTPOS +
        "_pay",
    }
  }
}

export default PaySoftposService
