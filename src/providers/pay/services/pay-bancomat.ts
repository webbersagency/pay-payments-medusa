import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayBancomatService extends PayBase {
  static identifier = PaymentProviderKeys.BANCOMAT

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 4809,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.BANCOMAT +
        "_pay",
    }
  }
}

export default PayBancomatService
