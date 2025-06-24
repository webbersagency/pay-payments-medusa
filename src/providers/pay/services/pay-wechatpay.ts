import PayBase from "../core/pay-base"
import {PaymentOptions, PaymentProviderKeys} from "../types"

class PayWechatpayService extends PayBase {
  static identifier = PaymentProviderKeys.WECHATPAY

  get paymentCreateOptions(): PaymentOptions {
    return {
      methodId: 1978,
      webhookUrl:
        this.options_.medusaUrl +
        "/hooks/payment/" +
        PaymentProviderKeys.WECHATPAY +
        "_pay",
    }
  }
}

export default PayWechatpayService
