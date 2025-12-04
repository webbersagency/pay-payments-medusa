import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayDirectDebitService extends PayBase {
  static identifier = PaymentProviderKeys.DIRECTDEBIT

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 137,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.DIRECTDEBIT +
        "_pay",
    }
  }
}

export default PayDirectDebitService
