import {MedusaRequest, MedusaResponse} from "@medusajs/framework/http"
import {MedusaError, Modules} from "@medusajs/framework/utils"
import {duplicateCartWorkflowId} from "../../../../../workflows/cart/duplicate-cart"
import {refetchCart} from "@medusajs/medusa/api/store/carts/helpers"

const POLL_INTERVAL_MS = 1_000
const MAX_WAIT_MS = 20_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const we = req.scope.resolve(Modules.WORKFLOW_ENGINE)
  const transactionId = "cart-duplicate-" + req.params.id

  const runDuplicate = async () => {
    const {result, transaction} = await we.run(duplicateCartWorkflowId, {
      input: {id: req.params.id},
      transactionId,
    })
    return {result, transaction}
  }

  let {result: newCartId, transaction} = await runDuplicate()

  // Two concurrent callers (e.g. Pay.nl exchange + return URL) hit this
  // endpoint with the same source cart id. The workflow engine de-duplicates
  // on transactionId, so the losing caller gets an empty result while the
  // winning workflow is still running. Poll until the winning transaction
  // completes — re-running with the same transactionId returns its cached
  // result, so both callers walk away with the same duplicated cart id
  // (no orphan carts).
  // A linear 2s poll choosen based on real world examples of this workflow.
  // Timeout of retry is 20 seconds.
  const deadline = Date.now() + MAX_WAIT_MS
  while (!newCartId && !transaction.hasFinished() && Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    ;({result: newCartId, transaction} = await runDuplicate())
  }

  if (!newCartId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Duplicate cart workflow for cart "${req.params.id}" did not return a cart ID`
    )
  }

  const cart = await refetchCart(newCartId, req.scope, req.queryConfig.fields)

  res.status(200).json({cart})
}
