import {createStep, StepResponse} from "@medusajs/framework/workflows-sdk"
import {MedusaError} from "@medusajs/framework/utils"
import {CartDTO} from "@medusajs/framework/types"

export type ValidateCartCompletedStepInput = {
  cart: CartDTO
}

export const validateCartCompletedStep = createStep(
  "validate-cart-completed-step",
  async (input: ValidateCartCompletedStepInput, {container}) => {
    if (!input.cart.completed_at) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Cannot duplicate uncompleted cart."
      )
    }

    return new StepResponse("", "")
  }
)
