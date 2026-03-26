import {MedusaRequest, MedusaResponse} from "@medusajs/framework/http"
import {MedusaError, Modules} from "@medusajs/framework/utils"
import {duplicateCartWorkflowId} from "../../../../../workflows/cart/duplicate-cart"
import {refetchCart} from "@medusajs/medusa/api/store/carts/helpers"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const we = req.scope.resolve(Modules.WORKFLOW_ENGINE)

  const {result: newCartId} = await we.run(duplicateCartWorkflowId, {
    input: {
      id: req.params.id,
    },
    transactionId: "cart-duplicate-" + req.params.id,
  })

  if (!newCartId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Duplicate cart workflow for cart "${req.params.id}" did not return a cart ID`
    )
  }

  const cart = await refetchCart(newCartId, req.scope, req.queryConfig.fields)

  res.status(200).json({cart})
}
