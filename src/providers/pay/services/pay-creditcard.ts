import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayCreditcardService extends PayBase {
  static identifier = PaymentProviderKeys.CREDITCARD

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 706,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.CREDITCARD +
        "_pay",
    }
  }
}

export default PayCreditcardService
