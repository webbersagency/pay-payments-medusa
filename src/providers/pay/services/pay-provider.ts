import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayProviderService extends PayBase {
  static identifier = PaymentProviderKeys.PAY_HOSTED_CHECKOUT

  constructor(_, options) {
    super(_, options)
  }

  get paymentCreateOptions(): PaymentOptions {
    return {
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.PAY_HOSTED_CHECKOUT +
        "_pay",
    }
  }
}

export default PayProviderService
