import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PaySpraypayService extends PayBase {
  static identifier = PaymentProviderKeys.SPRAYPAY

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 1987,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.SPRAYPAY +
        "_pay",
    }
  }
}

export default PaySpraypayService
