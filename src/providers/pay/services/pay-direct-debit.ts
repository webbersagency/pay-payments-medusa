import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayCreditcardService extends PayBase {
  static identifier = PaymentProviderKeys.DIRECTDEBIT

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 137,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.DIRECTDEBIT +
        "_pay",
    }
  }
}

export default PayCreditcardService
