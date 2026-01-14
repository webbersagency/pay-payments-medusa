import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayWeroService extends PayBase {
  static identifier = PaymentProviderKeys.WERO

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 3762,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.WERO +
        "_pay",
    }
  }
}

export default PayWeroService
