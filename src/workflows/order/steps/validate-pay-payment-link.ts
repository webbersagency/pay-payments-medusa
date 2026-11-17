import {MedusaError} from "@medusajs/framework/utils"
import {createStep, StepResponse} from "@medusajs/framework/workflows-sdk"
import {
  checkManualPayPaymentLink,
  LinkPayPaymentInput,
  ManualLinkCheck,
} from "../../../utils/manualPayPaymentLink"

export const validatePayPaymentLinkStepId = "validate-pay-payment-link"

/**
 * Re-checks the Pay. payment and the order right before linking: only
 * superadmins, only paid / authorized payments that are not linked anywhere
 * yet and fit in what the order still owes. Throws with every reason the link
 * is refused.
 */
export const validatePayPaymentLinkStep = createStep(
  validatePayPaymentLinkStepId,
  async (input: LinkPayPaymentInput, {container}) => {
    const check = await checkManualPayPaymentLink(container, input)

    if (check.problems.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        check.problems.join(" ")
      )
    }

    return new StepResponse<ManualLinkCheck>(check)
  }
)
