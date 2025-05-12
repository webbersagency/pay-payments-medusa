import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayIdealService extends PayBase {
  static identifier = PaymentProviderKeys.IDEAL

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 10,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.IDEAL +
        "_pay",
    }
  }
}

export default PayIdealService
