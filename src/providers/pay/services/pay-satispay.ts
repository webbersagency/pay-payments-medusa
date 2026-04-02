import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PaySatispayService extends PayBase {
  static identifier = PaymentProviderKeys.SATISPAY

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 4146,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.SATISPAY +
        "_pay",
    }
  }
}

export default PaySatispayService
