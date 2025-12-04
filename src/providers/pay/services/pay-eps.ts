import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayEpsService extends PayBase {
  static identifier = PaymentProviderKeys.EPS

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 2062,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.EPS +
        "_pay",
    }
  }
}

export default PayEpsService
