/**
 * All available payment methods for Pay.
 * See: https://developer.pay.nl/docs/payment-option-ids-subids
 */

/**
 * Country or region specific payment methods
 */
export const regionalPaymentMethods: Record<number, string> = {
  10: "iDEAL", // For NL. Only EUR. See below for SubID's
  436: "Bancontact", // For BE. Only EUR
  2970: "Pay By Bank", // Pay By Bank, Based on PSD2 Payment Initiation Servies
  559: "SOFORT Banking", // E-commerce. For DE, AT, CH, PL, BE and ES. Only EUR.
  577: "SOFORT Banking", // Digital Services. For DE, AT, CH, PL, BE and ES. Only EUR.
  595: "SOFORT Banking", // High Risk. For DE, AT, CH, PL, BE and ES. Only EUR.
  694: "Giropay", // For DE. Not all local banks support Giropay. (Depricated)
  1978: "WeChat Pay e-commerce", // For CN.
  2074: "WeChat Quickpay", // For CN.
  2062: "EPS Überweisung", // For AT. Only EUR.
  2080: "Alipay", // For CN.
  2151: "Przelewy24", // For PL. Only PLN.
  2271: "Multibanco", // For PT. Only EUR.
  2379: "Payconiq", // For BE and LU. Only EUR.
  2718: "Trustly", // For SE, FI, DE, NL, UK, EE, LV, LT, DK, PL, NO, ES, CZ, BE, AT and SK. Local currencies.
  2856: "Blik", // For PL.
  3558: "MobilePay", // For DK & FI
  2907: "AliPay PLUS", // For CN.
}

/**
 * Card Not Present payments
 */
export const cnpPaymentMethods: Record<number, string> = {
  706: "Visa / Mastercard",
  709: "Visa / Mastercard", // High risk
  3141: "Visa",
  3138: "Mastercard",
  707: "PostePay",
  708: "PostePay", // High risk
  2268: "Carte Bancaire",
  712: "Maestro",
  715: "Maestro", // High risk
  1705: "American Express",
  1939: "Dankort",
  1945: "Nexi",
  2277: "Apple Pay",
  2558: "Google Pay",
}

/**
 * In-Person Payments (Card Present)
 */
export const inPersonPaymentMethods: Record<number, string> = {
  1013: "Bancontact",
  1002: "Visa Electron",
  1003: "V Pay",
  1009: "Maestro",
  1052: "Visa Debit",
  1053: "Mastercard Debit",
  2002: "Visa",
  2003: "Mastercard",
  2004: "American Express",
  2005: "Diners/Discover",
  2007: "JCB",
  2008: "UnionPay",
  2009: "Monizze",
  2012: "CMFC",
  2014: "Basic Card",
  3003: "Sodexo Card",
  3004: "Edenred",
  3013: "CCV Card",
  3014: "Travelcard",
  3020: "Company cards",
  3021: "Wordline WL",
  3100: "Equens WL",
  3200: "Yourgift",
  3300: "Giftcard",
}

/**
 * BNPL & Installments
 */
export const bnplPaymentMethods: Record<number, string> = {
  2561: "Riverty",
  1672: "Billink", // For NL.
  1717: "Klarna", // For NL, BE, DE, SE, NO, FI, DK, AT, UK & US
  1813: "iDEAL In3", // For NL. Only EUR.
  3192: "In3 Business", // For NL businesses
  1987: "SprayPay", // For NL. Only EUR.
  2107: "CreditClick",
  2931: "NOTYD", // For NL businesses
  3552: "AlmaPAY", // For NL, BE, DE, AT, LU, FR, ES, IT, PT & IE
}

/**
 * Alternative payment methods
 */
export const alternativePaymentMethods: Record<number, string> = {
  136: "Bank Transfer (SCT)", // Only SEPA countries.
  137: "SEPA Direct Debit", // Only SEPA countries.
  138: "PayPal", // Not collecting funds
  1903: "Amazon Pay", //
  553: "Paysafecard", // For NL, BE, DE, AR, AU, BG, CA, CY, DK, FI, FR, GR, HU, EI, IT, KW, HR, LV, LT, LU, MT, MX, NO, AT, PE, PL, PT, RO, SL, SK, ES, CZ, TR, UR, US, UK, SE, CH.
  1600: "Telephone payments", // For NL. Only EUR.
}

/**
 * Combined all payment methods
 */
export const paymentMethodMap: Record<number, string> = {
  ...regionalPaymentMethods,
  ...cnpPaymentMethods,
  ...inPersonPaymentMethods,
  ...bnplPaymentMethods,
  ...alternativePaymentMethods,
}

/**
 * SubID's of iDEAL banks
 */
export const subIdsIdealBanks: Record<number, string> = {
  1: "ABN AMRO", // ABNANL2A
  2: "Rabobank", // RABONL2U
  4: "ING Bank", // INGBNL2A
  8: "ASN Bank", // ASNBNL21
  5: "SNS Bank", // SNSBNL2A
  9: "RegioBank", // RBRBNL21
  10: "Triodos Bank", // TRIONL2U
  11: "Van Lanschot Bankiers", // FVLBNL22
  12: "Knab", // KNABNL2H
  5080: "bunq", // BUNQNL2A
  5084: "Revolut", // REVONL2A
  23355: "N26", // NTSBDEB1
  23358: "yoursafe", // BITSNL2A
  23361: "Nationale Nederlanden", // NNBANL2G
}
