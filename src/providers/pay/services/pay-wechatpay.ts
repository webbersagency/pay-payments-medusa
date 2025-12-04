import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayWechatpayService extends PayBase {
  static identifier = PaymentProviderKeys.WECHATPAY

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 1978,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/pay/" +
        PaymentProviderKeys.WECHATPAY +
        "_pay",
    }
  }
}

export default PayWechatpayService
