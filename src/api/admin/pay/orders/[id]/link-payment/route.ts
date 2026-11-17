import {AuthenticatedMedusaRequest, MedusaResponse} from "@medusajs/framework/http"
import {MedusaError} from "@medusajs/framework/utils"
import {
  checkManualPayPaymentLink,
  listManuallyLinkedPayments,
  normalizePayId,
} from "../../../../../../utils/manualPayPaymentLink"
import {linkPayPaymentToOrderWorkflow} from "../../../../../../workflows/order/link-pay-payment"

const readPayId = (value: unknown): string => {
  const payId = normalizePayId(value)

  if (!payId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Enter a valid Pay. transaction or order id"
    )
  }

  return payId
}

/**
 * Preview of linking a Pay. payment to this order: what Pay. reports for it
 * and every reason the link would be refused. Superadmins only.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const check = await checkManualPayPaymentLink(req.scope, {
    order_id: req.params.id,
    pay_id: readPayId(req.query.pay_id),
    actor_id: req.auth_context.actor_id,
    actor_type: req.auth_context.actor_type,
  })

  const {raw: _raw, ...preview} = check

  res.json({...preview, linkable: check.problems.length === 0})
}

/**
 * Links a Pay. payment (e.g. paid through a Pay. payment link) to this order
 * as a captured payment. Superadmins only.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<{pay_id?: unknown}>,
  res: MedusaResponse
) => {
  const body = (req.body ?? {}) as {pay_id?: unknown}

  const {result: payment} = await linkPayPaymentToOrderWorkflow(req.scope).run({
    input: {
      order_id: req.params.id,
      pay_id: readPayId(body.pay_id),
      actor_id: req.auth_context.actor_id,
      actor_type: req.auth_context.actor_type,
    },
  })

  const linked = await listManuallyLinkedPayments(req.scope, req.params.id, {
    actorId: req.auth_context.actor_id,
    actorType: req.auth_context.actor_type,
  })

  res.json({payment_id: payment.id, ...linked})
}
