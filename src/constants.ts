/**
 * All available payment methods for Pay.
 * See: https://developer.pay.nl/docs/payment-option-ids-subids
 */
import {PaymentProviderKeys, PaymentProviderValue} from "./providers/pay/types"

export type PaymentMethodType =
  | "regional" // Country or region specific payment methods
  | "card_not_present" // Card Not Present payments
  | "in_person" // In-Person Payments (Card Present)
  | "buy_now_pay_later" // BNPL & Installments
  | "alternative" // Alternative payment methods

export type PaymentMethod = {
  id: number
  name: string
  value?: PaymentProviderValue
  type: PaymentMethodType
}

/**
 * Combined all payment methods
 */
export const payPaymentMethods: PaymentMethod[] = [
  /**
   * Country or region specific payment methods
   */
  {id: 10, value: PaymentProviderKeys.IDEAL, name: "iDEAL", type: "regional"}, // For NL. Only EUR. See below for SubID's
  {
    id: 436,
    value: PaymentProviderKeys.BAN_CONTACT,
    name: "Bancontact",
    type: "regional",
  }, // For BE. Only EUR
  {
    id: 2970,
    value: PaymentProviderKeys.PAYBYBANK,
    name: "Pay By Bank",
    type: "regional",
  }, // Pay By Bank }, Based on PSD2 Payment Initiation Servies
  {id: 559, name: "SOFORT Banking", type: "regional"}, // E-commerce. For DE, AT, CH, PL }, BE and ES. Only EUR.
  {id: 577, name: "SOFORT Banking", type: "regional"}, // Digital Services. For DE, AT, CH, PL }, BE and ES. Only EUR.
  {id: 595, name: "SOFORT Banking", type: "regional"}, // High Risk. For DE, AT, CH, PL }, BE and ES. Only EUR.
  {id: 694, name: "Giropay", type: "regional"}, // For DE. Not all local banks support Giropay. (Depricated)
  {
    id: 1978,
    name: "WeChat Pay e-commerce",
    value: PaymentProviderKeys.WECHATPAY,
    type: "regional",
  }, // For CN.
  {id: 2074, name: "WeChat Quickpay", type: "regional"}, // For CN.
  {
    id: 2062,
    name: "EPS Überweisung",
    value: PaymentProviderKeys.EPS,
    type: "regional",
  }, // For AT. Only EUR.
  {id: 2080, name: "Alipay", type: "regional"}, // For CN.
  {
    id: 2151,
    name: "Przelewy24",
    value: PaymentProviderKeys.PRZELEWY24,
    type: "regional",
  }, // For PL. Only PLN.
  {id: 2271, name: "Multibanco", type: "regional"}, // For PT. Only EUR.
  {id: 2718, name: "Trustly", type: "regional"}, // For SE, FI, DE, NL, UK, EE, LV, LT, DK, PL, NO, ES, CZ, BE }, AT and SK. Local currencies.
  {id: 2856, name: "Blik", value: PaymentProviderKeys.BLIK, type: "regional"}, // For PL.
  {
    id: 3558,
    name: "MobilePay",
    value: PaymentProviderKeys.MOBILEPAY,
    type: "regional",
  }, // For DK & FI
  {id: 2907, name: "AliPay PLUS", type: "regional"}, // For CN.
  {id: 3840, name: "Twint", value: PaymentProviderKeys.TWINT, type: "regional"}, // For CN.
  /**
   * Card Not Present payments
   */
  {id: 706, name: "Visa / Mastercard", type: "card_not_present"},
  {id: 709, name: "Visa / Mastercard", type: "card_not_present"}, // High risk
  {id: 3141, name: "Visa", type: "card_not_present"},
  {id: 3138, name: "Mastercard", type: "card_not_present"},
  {id: 707, name: "PostePay", type: "card_not_present"},
  {id: 708, name: "PostePay", type: "card_not_present"}, // High risk
  {id: 2268, name: "Carte Bancaire", type: "card_not_present"},
  {id: 712, name: "Maestro", type: "card_not_present"},
  {id: 715, name: "Maestro", type: "card_not_present"}, // High risk
  {id: 1705, name: "American Express", type: "card_not_present"},
  {id: 1939, name: "Dankort", type: "card_not_present"},
  {id: 1945, name: "Nexi", type: "card_not_present"},
  {id: 2277, name: PaymentProviderKeys.APPLE_PAY, type: "card_not_present"},
  {id: 2558, name: PaymentProviderKeys.GOOGLE_PAY, type: "card_not_present"},
  /**
   * BNPL & Installments
   */
  {
    id: 2561,
    value: PaymentProviderKeys.RIVERTY,
    name: "Riverty",
    type: "buy_now_pay_later",
  },
  {
    id: 1672,
    value: PaymentProviderKeys.BILLINK,
    name: "Billink",
    type: "buy_now_pay_later",
  }, // For NL.
  {
    id: 1717,
    name: "Klarna",
    value: PaymentProviderKeys.KLARNA,
    type: "buy_now_pay_later",
  }, // For NL, BE, DE, SE, NO, FI, DK, AT }, UK & US
  {
    id: 1813,
    name: "iDEAL In3",
    value: PaymentProviderKeys.IDEAL_IN3,
    type: "buy_now_pay_later",
  }, // For NL. Only EUR.
  {
    id: 1987,
    name: "SprayPay",
    value: PaymentProviderKeys.SPRAYPAY,
    type: "buy_now_pay_later",
  }, // For NL. Only EUR.
  {id: 2107, name: "CreditClick", type: "buy_now_pay_later"},
  {id: 2931, name: "NOTYD", type: "buy_now_pay_later"}, // For NL businesses
  {
    id: 3552,
    name: "AlmaPAY",
    value: PaymentProviderKeys.ALMAPAY,
    type: "buy_now_pay_later",
  }, // For NL, BE, DE, AT, LU, FR, ES, IT }, PT & IE
  {
    id: 3192,
    name: "Mondu",
    value: PaymentProviderKeys.MONDU,
    type: "buy_now_pay_later",
  }, // For NL businesses
  /**
   * In-Person Payments (Card Present)
   */
  {id: 1013, name: "Bancontact", type: "in_person"},
  {id: 1002, name: "Visa Electron", type: "in_person"},
  {id: 1003, name: "V Pay", type: "in_person"},
  {id: 1009, name: "Maestro", type: "in_person"},
  {id: 1052, name: "Visa Debit", type: "in_person"},
  {id: 1053, name: "Mastercard Debit", type: "in_person"},
  {id: 2002, name: "Visa", type: "in_person"},
  {id: 2003, name: "Mastercard", type: "in_person"},
  {id: 2004, name: "American Express", type: "in_person"},
  {id: 2005, name: "Diners/Discover", type: "in_person"},
  {id: 2007, name: "JCB", type: "in_person"},
  {id: 2008, name: "UnionPay", type: "in_person"},
  {id: 2009, name: "Monizze", type: "in_person"},
  {id: 2012, name: "CMFC", type: "in_person"},
  {id: 2014, name: "Basic Card", type: "in_person"},
  {id: 3003, name: "Sodexo Card", type: "in_person"},
  {id: 3004, name: "Edenred", type: "in_person"},
  {id: 3013, name: "CCV Card", type: "in_person"},
  {id: 3014, name: "Travelcard", type: "in_person"},
  {id: 3020, name: "Company cards", type: "in_person"},
  {id: 3021, name: "Wordline WL", type: "in_person"},
  {id: 3100, name: "Equens WL", type: "in_person"},
  {id: 3200, name: "Yourgift", type: "in_person"},
  {id: 3300, name: "Giftcard", type: "in_person"},
  /**
   * Alternative payment methods
   */
  {id: 136, name: "Bank Transfer (SCT)", type: "alternative"}, // Only SEPA countries.
  {id: 137, name: "SEPA Direct Debit", type: "alternative"}, // Only SEPA countries.
  {
    id: 138,
    name: "PayPal",
    value: PaymentProviderKeys.PAYPAL,
    type: "alternative",
  }, // Not collecting funds
  {id: 1903, name: "Amazon Pay", type: "alternative"}, //
  {id: 553, name: "Paysafecard", type: "alternative"}, // For NL, BE, DE, AR, AU, BG, CA, CY, DK, FI, FR, GR, HU, EI, IT, KW, HR, LV, LT, LU, MT, MX, NO, AT, PE, PL, PT, RO, SL, SK, ES, CZ, TR, UR, US, UK, SE }, CH.
  {id: 1600, name: "Telephone payments", type: "alternative"}, // For NL. Only EUR.
  {id: 3762, name: "WERO", type: "regional"},
  {id: 4287, name: "Brite Payments", type: "regional"},
  {id: 3834, name: "Vipps", type: "regional"},
]
