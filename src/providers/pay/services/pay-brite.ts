import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayBriteService extends PayBase {
  static identifier = PaymentProviderKeys.BRITE

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 4287,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.BRITE +
        "_pay",
    }
  }
}

export default PayBriteService
