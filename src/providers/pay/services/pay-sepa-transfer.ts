import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PaySepaTransferService extends PayBase {
  static identifier = PaymentProviderKeys.SEPA_TRANSFER

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 136,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.SEPA_TRANSFER +
        "_pay",
    }
  }
}

export default PaySepaTransferService
