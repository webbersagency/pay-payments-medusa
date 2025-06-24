import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayMonduService extends PayBase {
  static identifier = PaymentProviderKeys.MONDU

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 3192,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.MONDU +
        "_pay",
    }
  }
}

export default PayMonduService
