import {MedusaRequest, MedusaResponse} from "@medusajs/framework/http"
import {Modules} from "@medusajs/framework/utils"
import {duplicateCartWorkflowId} from "../../../../../workflows/cart/duplicate-cart"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const we = req.scope.resolve(Modules.WORKFLOW_ENGINE)

  const response = await we.run(duplicateCartWorkflowId, {
    input: {
      id: req.params.id,
    },
    transactionId: "cart-duplicate-" + req.params.id,
  })

  res.status(200).json({cart: response.result})
}
