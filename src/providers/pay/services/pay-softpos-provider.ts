import PayBase from "../core/pay-base"
import {PaymentOptions, PAY_SOFTPOS_PROVIDER_ID} from "../types"

class PaySoftposProviderService extends PayBase {
  static identifier = PAY_SOFTPOS_PROVIDER_ID

  get paymentCreateOptions(): PaymentOptions {
    return {
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PAY_SOFTPOS_PROVIDER_ID +
        "_pay",
    }
  }
}

export default PaySoftposProviderService
