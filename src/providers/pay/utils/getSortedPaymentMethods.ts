import {GetConfigResponse, PayCheckoutOption} from "../types"

function getSortedPaymentMethods(
  data: Pick<
    GetConfigResponse,
    "checkoutOptions" | "checkoutSequence" | "checkoutTexts"
  >
): PayCheckoutOption["paymentMethods"] {
  const {checkoutOptions, checkoutSequence} = data
  const {primary} = checkoutSequence.default

  // Create a map of tag -> checkoutOption for quick lookup
  const optionsMap = new Map<string, PayCheckoutOption>()
  checkoutOptions.forEach((option) => optionsMap.set(option.tag, option))

  // Flatten paymentMethods in the order of `primary`
  const sortedPaymentMethods: PayCheckoutOption["paymentMethods"] = []

  for (const tag of primary) {
    const option = optionsMap.get(tag)
    if (option && option.paymentMethods) {
      sortedPaymentMethods.push(...option.paymentMethods)
    }
  }

  return sortedPaymentMethods
}

export default getSortedPaymentMethods
