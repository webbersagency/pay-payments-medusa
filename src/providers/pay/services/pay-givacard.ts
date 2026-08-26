import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayGivacardService extends PayBase {
  static identifier = PaymentProviderKeys.GIVACARD

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 1657,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.GIVACARD +
        "_pay",
    }
  }
}

export default PayGivacardService
