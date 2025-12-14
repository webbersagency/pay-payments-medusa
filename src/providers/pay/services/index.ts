import PayBancontactService from "./pay-bancontact"
import PayAlmapayService from "./pay-almapay"
import PayApplePayService from "./pay-apple-pay"
import PayBillinkService from "./pay-billink"
import PayBlikService from "./pay-blik"
import PayCreditcardService from "./pay-creditcard"
import PayEpsService from "./pay-eps"
import PayGooglePayService from "./pay-google-pay"
import PayIdealService from "./pay-ideal"
import PayIdealIn3Service from "./pay-ideal-in3"
import PayKlarnaService from "./pay-klarna"
import PayMobilepayService from "./pay-mobilepay"
import PayMonduService from "./pay-mondu"
import PayPaybybankService from "./pay-paybybank"
import PayPayconiqService from "./pay-payconiq"
import PayPaypalService from "./pay-paypal"
import PayProviderService from "./pay-provider"
import PayPrzelewy24Service from "./pay-przelewy24"
import PayRivertyService from "./pay-riverty"
import PaySoftposService from "./pay-softpos"
import PaySpraypayService from "./pay-spraypay"
import PayTwintService from "./pay-twint"
import PayWechatpayService from "./pay-wechatpay"
import PayDirectDebitService from "./pay-direct-debit"
import type {ProviderOptions} from "../types"
import PayBase from "../core/pay-base"

export type PayServiceClass = {
  readonly identifier: string
  new (container: unknown, options: ProviderOptions): PayBase
}

export const serviceClasses = [
  PayAlmapayService,
  PayApplePayService,
  PayBancontactService,
  PayBillinkService,
  PayBlikService,
  PayCreditcardService,
  PayDirectDebitService,
  PayEpsService,
  PayGooglePayService,
  PayIdealService,
  PayIdealIn3Service,
  PayKlarnaService,
  PayMobilepayService,
  PayMonduService,
  PayPaybybankService,
  PayPayconiqService,
  PayPaypalService,
  PayProviderService,
  PayPrzelewy24Service,
  PayRivertyService,
  PaySoftposService,
  PaySpraypayService,
  PayTwintService,
  PayWechatpayService,
] as PayServiceClass[]

// Build registry once
const serviceRegistry: Record<string, PayServiceClass> = {}

for (const ServiceClass of serviceClasses) {
  serviceRegistry[ServiceClass.identifier] = ServiceClass
}

export const getPayServiceByProviderId = (
  providerId: string
): PayServiceClass | null => serviceRegistry[providerId] ?? null

export default serviceRegistry
