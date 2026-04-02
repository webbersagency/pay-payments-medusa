import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayFLOAService extends PayBase {
  static identifier = PaymentProviderKeys.FLOA

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 4815,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.FLOA +
        "_pay",
    }
  }
}

export default PayFLOAService
