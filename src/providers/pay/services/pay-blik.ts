import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayBlikService extends PayBase {
  static identifier = PaymentProviderKeys.BLIK

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 2856,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.BLIK +
        "_pay",
    }
  }
}

export default PayBlikService
