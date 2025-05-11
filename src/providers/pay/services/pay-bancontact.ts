import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayBancontactService extends PayBase {
  static identifier = PaymentProviderKeys.BAN_CONTACT

  get paymentCreateOptions(): PaymentOptions {
    return {
      method_id: 436,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.BAN_CONTACT +
        "_pay",
    }
  }
}

export default PayBancontactService
