import PayBase from "../core/pay-base"
import {PaymentOptions, PAY_PROVIDER_ID} from "../types"

class PayProviderService extends PayBase {
  static identifier = PAY_PROVIDER_ID

  get paymentCreateOptions(): PaymentOptions {
    return {
      webhookUrl:
        this.options_.medusaUrl + "/hooks/payment/" + PAY_PROVIDER_ID + "_pay",
    }
  }
}

export default PayProviderService
