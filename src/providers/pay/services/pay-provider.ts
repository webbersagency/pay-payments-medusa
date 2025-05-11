import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayProviderService extends PayBase {
  static identifier = PaymentProviderKeys.PAY

  constructor(_, options) {
    super(_, options)
  }

  get paymentCreateOptions(): PaymentOptions {
    return {
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.PAY +
        "_pay",
    }
  }
}

export default PayProviderService
