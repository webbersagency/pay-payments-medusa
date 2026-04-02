import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PaySwishService extends PayBase {
  static identifier = PaymentProviderKeys.SWISH

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 3837,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.SWISH +
        "_pay",
    }
  }
}

export default PaySwishService
