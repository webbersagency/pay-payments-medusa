import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayVippsService extends PayBase {
  static identifier = PaymentProviderKeys.VIPPS

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 3834,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.VIPPS +
        "_pay",
    }
  }
}

export default PayVippsService
