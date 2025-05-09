import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class MollieIdealService extends PayBase {
  static identifier = PaymentProviderKeys.IDEAL

  get paymentCreateOptions(): PaymentOptions {
    return {
      id: 10,
      //webhookUrl: this.options_.medusaUrl + "/hooks/payment/ideal_pay",
    }
  }
}

export default MollieIdealService
