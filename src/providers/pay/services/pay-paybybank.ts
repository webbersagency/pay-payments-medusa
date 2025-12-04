import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayPaybybankService extends PayBase {
  static identifier = PaymentProviderKeys.PAYBYBANK

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 2970,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.PAYBYBANK +
        "_pay",
    }
  }
}

export default PayPaybybankService
