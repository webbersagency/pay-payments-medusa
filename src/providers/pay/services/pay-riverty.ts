import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayRivertyService extends PayBase {
  static identifier = PaymentProviderKeys.RIVERTY

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 2561,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.RIVERTY +
        "_pay",
    }
  }
}

export default PayRivertyService
