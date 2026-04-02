import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayPixService extends PayBase {
  static identifier = PaymentProviderKeys.PIX

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 4803,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.PIX +
        "_pay",
    }
  }
}

export default PayPixService
