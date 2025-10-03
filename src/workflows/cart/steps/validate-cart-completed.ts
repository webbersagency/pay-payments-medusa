import {createStep} from "@medusajs/framework/workflows-sdk"
import {MedusaError} from "@medusajs/framework/utils"
import {CartDTO} from "@medusajs/framework/types"

export type ValidateCartCompletedStepInput = {
  cart: CartDTO
}

export const validateCartCompletedStep = createStep(
  "validate-cart-completed",
  async (data: ValidateCartCompletedStepInput) => {
    const {cart} = data

    if (!cart.completed_at) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Cannot duplicate uncompleted cart."
      )
    }
  }
)
