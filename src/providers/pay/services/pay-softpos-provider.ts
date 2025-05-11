import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PaySoftposProviderService extends PayBase {
  static identifier = PaymentProviderKeys.SOFTPOS

  get paymentCreateOptions(): PaymentOptions {
    return {
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.SOFTPOS +
        "_pay",
    }
  }
}

export default PaySoftposProviderService
