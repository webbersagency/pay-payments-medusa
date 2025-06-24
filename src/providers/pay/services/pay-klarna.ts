import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayKlarnaService extends PayBase {
  static identifier = PaymentProviderKeys.KLARNA

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 1717,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.KLARNA +
        "_pay",
    }
  }
}

export default PayKlarnaService
