import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayBillinkService extends PayBase {
  static identifier = PaymentProviderKeys.BILLINK

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 1672,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.BILLINK +
        "_pay",
    }
  }
}

export default PayBillinkService
