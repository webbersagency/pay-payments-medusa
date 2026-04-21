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
  /**
   * Lowercase ISO 3166-1 alpha-2 country codes where this method is available.
   * Omitted when the method is globally available or location-independent.
   */
  countries?: string[]
}

/**
 * SEPA member countries — used by Bank Transfer (SCT) and SEPA Direct Debit.
 */
const SEPA_COUNTRIES = [
  "at",
  "be",
  "bg",
  "cy",
  "cz",
  "de",
  "dk",
  "ee",
  "es",
  "fi",
  "fr",
  "gb",
  "gr",
  "hr",
  "hu",
  "ie",
  "it",
  "lv",
  "lt",
  "lu",
  "mt",
  "nl",
  "pl",
  "pt",
  "ro",
  "sk",
  "si",
  "se",
]

/**
 * Combined all payment methods
 */
export const payPaymentMethods: PaymentMethod[] = [
  /**
   * Country or region specific payment methods
   */
  {
    id: 10,
    value: PaymentProviderKeys.IDEAL,
    name: "iDEAL",
    type: "regional",
    countries: ["nl"],
  },
  {
    id: 436,
    value: PaymentProviderKeys.BAN_CONTACT,
    name: "Bancontact",
    type: "regional",
    countries: ["be"],
  },
  {
    id: 2970,
    value: PaymentProviderKeys.PAYBYBANK,
    name: "Pay By Bank",
    type: "regional",
  }, // PSD2-based — available across multiple PSD2-enabled regions
  {
    id: 559,
    name: "SOFORT Banking",
    type: "regional",
    countries: ["de", "at", "ch", "pl", "be", "es"],
  }, // E-commerce
  {
    id: 577,
    name: "SOFORT Banking",
    type: "regional",
    countries: ["de", "at", "ch", "pl", "be", "es"],
  }, // Digital Services
  {
    id: 595,
    name: "SOFORT Banking",
    type: "regional",
    countries: ["de", "at", "ch", "pl", "be", "es"],
  }, // High Risk
  {id: 694, name: "Giropay", type: "regional", countries: ["de"]}, // Deprecated
  {
    id: 1978,
    name: "WeChat Pay e-commerce",
    value: PaymentProviderKeys.WECHATPAY,
    type: "regional",
    countries: ["cn"],
  },
  {id: 2074, name: "WeChat Quickpay", type: "regional", countries: ["cn"]},
  {
    id: 2062,
    name: "EPS Überweisung",
    value: PaymentProviderKeys.EPS,
    type: "regional",
    countries: ["at"],
  },
  {id: 2080, name: "Alipay", type: "regional", countries: ["cn"]},
  {
    id: 2151,
    name: "Przelewy24",
    value: PaymentProviderKeys.PRZELEWY24,
    type: "regional",
    countries: ["pl"],
  },
  {id: 2271, name: "Multibanco", type: "regional", countries: ["pt"]},
  {
    id: 2718,
    name: "Trustly",
    type: "regional",
    countries: [
      "se",
      "fi",
      "de",
      "nl",
      "uk",
      "ee",
      "lv",
      "lt",
      "dk",
      "pl",
      "no",
      "es",
      "cz",
      "be",
      "at",
      "sk",
    ],
  },
  {
    id: 2856,
    name: "Blik",
    value: PaymentProviderKeys.BLIK,
    type: "regional",
    countries: ["pl"],
  },
  {
    id: 3558,
    name: "MobilePay",
    value: PaymentProviderKeys.MOBILEPAY,
    type: "regional",
    countries: ["dk", "fi"],
  },
  {id: 2907, name: "AliPay PLUS", type: "regional", countries: ["cn"]},
  {
    id: 3840,
    name: "Twint",
    value: PaymentProviderKeys.TWINT,
    type: "regional",
    countries: ["ch"],
  },
  /**
   * Card Not Present payments
   */
  {
    id: 706,
    value: PaymentProviderKeys.CREDITCARD,
    name: "Visa / Mastercard",
    type: "card_not_present",
  },
  {id: 709, name: "Visa / Mastercard", type: "card_not_present"}, // High risk
  {id: 3141, name: "Visa", type: "card_not_present"},
  {id: 3138, name: "Mastercard", type: "card_not_present"},
  {id: 707, name: "PostePay", type: "card_not_present"},
  {id: 708, name: "PostePay", type: "card_not_present"}, // High risk
  {
    id: 2268,
    name: "Carte Bancaire",
    type: "card_not_present",
    countries: ["fr"],
  },
  {id: 712, name: "Maestro", type: "card_not_present"},
  {id: 715, name: "Maestro", type: "card_not_present"}, // High risk
  {id: 1705, name: "American Express", type: "card_not_present"},
  {id: 1939, name: "Dankort", type: "card_not_present", countries: ["dk"]},
  {id: 1945, name: "Nexi", type: "card_not_present", countries: ["it"]},
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
    countries: ["nl", "be", "de", "at"],
  },
  {
    id: 1672,
    value: PaymentProviderKeys.BILLINK,
    name: "Billink",
    type: "buy_now_pay_later",
    countries: ["nl", "be"],
  },
  {
    id: 1717,
    name: "Klarna",
    value: PaymentProviderKeys.KLARNA,
    type: "buy_now_pay_later",
    countries: [
      "nl",
      "be",
      "de",
      "se",
      "no",
      "fi",
      "dk",
      "it",
      "es",
      "fr",
      "at",
      "uk",
      "us",
    ],
  },
  {
    id: 1813,
    name: "iDEAL In3",
    value: PaymentProviderKeys.IDEAL_IN3,
    type: "buy_now_pay_later",
    countries: ["nl"],
  },
  {
    id: 1987,
    name: "SprayPay",
    value: PaymentProviderKeys.SPRAYPAY,
    type: "buy_now_pay_later",
    countries: ["nl"],
  },
  {id: 2107, name: "CreditClick", type: "buy_now_pay_later"},
  {id: 2931, name: "NOTYD", type: "buy_now_pay_later", countries: ["nl"]}, // NL businesses
  {
    id: 3552,
    name: "AlmaPAY",
    value: PaymentProviderKeys.ALMAPAY,
    type: "buy_now_pay_later",
    countries: ["nl", "be", "de", "at", "lu", "fr", "es", "it", "pt", "ie"],
  },
  {
    id: 3192,
    name: "Mondu",
    value: PaymentProviderKeys.MONDU,
    type: "buy_now_pay_later",
    countries: ["nl"],
  }, // NL businesses
  /**
   * In-Person Payments (Card Present)
   */
  {id: 1013, name: "Bancontact", type: "in_person", countries: ["be"]},
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
  {
    id: 136,
    value: PaymentProviderKeys.SEPA_TRANSFER,
    name: "Bank Transfer (SCT)",
    type: "alternative",
    countries: SEPA_COUNTRIES,
  },
  {
    id: 137,
    value: PaymentProviderKeys.DIRECTDEBIT,
    name: "SEPA Direct Debit",
    type: "alternative",
    countries: SEPA_COUNTRIES,
  },
  {
    id: 138,
    name: "PayPal",
    value: PaymentProviderKeys.PAYPAL,
    type: "alternative",
  }, // Not collecting funds
  {id: 1903, name: "Amazon Pay", type: "alternative"},
  {
    id: 553,
    name: "Paysafecard",
    type: "alternative",
    countries: [
      "nl",
      "be",
      "de",
      "ar",
      "au",
      "bg",
      "ca",
      "cy",
      "dk",
      "fi",
      "fr",
      "gr",
      "hu",
      "ie",
      "it",
      "kw",
      "hr",
      "lv",
      "lt",
      "lu",
      "mt",
      "mx",
      "no",
      "at",
      "pe",
      "pl",
      "pt",
      "ro",
      "sk",
      "es",
      "cz",
      "tr",
      "us",
      "uk",
      "se",
      "ch",
    ],
  },
  {
    id: 1600,
    name: "Telephone payments",
    type: "alternative",
    countries: ["nl"],
  },
  {id: 3762, value: PaymentProviderKeys.WERO, name: "WERO", type: "regional"},
  {
    id: 4287,
    value: PaymentProviderKeys.BRITE,
    name: "Brite Payments",
    type: "regional",
    countries: ["se", "fi", "nl", "ee", "lv", "lt", "de", "be", "dk", "fr"],
  },
  {
    id: 3834,
    value: PaymentProviderKeys.VIPPS,
    name: "Vipps",
    type: "regional",
    countries: ["no"],
  },
  {
    id: 4146,
    name: "Satispay",
    value: PaymentProviderKeys.SATISPAY,
    type: "regional",
    countries: ["it", "fr", "lu", "de"],
  },
  {
    id: 3837,
    name: "Swish",
    value: PaymentProviderKeys.SWISH,
    type: "regional",
    countries: ["se"],
  },
  {
    id: 4809,
    name: "Bancomat",
    value: PaymentProviderKeys.BANCOMAT,
    type: "regional",
    countries: ["it"],
  },
  {
    id: 4815,
    name: "FLOA",
    value: PaymentProviderKeys.FLOA,
    type: "regional",
    countries: ["fr"],
  },
  {
    id: 4803,
    name: "PIX",
    value: PaymentProviderKeys.PIX,
    type: "regional",
    countries: ["br"],
  },
]
