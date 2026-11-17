import {AuthenticatedMedusaRequest, MedusaResponse} from "@medusajs/framework/http"
import {listManuallyLinkedPayments} from "../../../../../../utils/manualPayPaymentLink"

/**
 * The Pay. payments linked to this order by hand, for the order page widget.
 * `?live=true` also looks each one up at Pay. and reports differences, since
 * Pay. may not send exchanges for them.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const linked = await listManuallyLinkedPayments(req.scope, req.params.id, {
    live: req.query.live === "true",
    actorId: req.auth_context.actor_id,
    actorType: req.auth_context.actor_type,
  })

  if (!linked) {
    return res.status(404).json({message: "Order not found"})
  }

  return res.json(linked)
}
