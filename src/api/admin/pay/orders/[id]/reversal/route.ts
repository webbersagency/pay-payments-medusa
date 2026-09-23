import {AuthenticatedMedusaRequest, MedusaResponse} from "@medusajs/framework/http"
import {getPaymentReversal} from "../../../../../../utils/paymentReversal"

/**
 * Whether a Pay. chargeback / storno reversed this order's payment, for the
 * "payment reversed" banner on the order detail page.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const reversal = await getPaymentReversal(req.scope, req.params.id)

  if (!reversal) {
    return res.status(404).json({message: "Order not found"})
  }

  return res.json(reversal)
}
