import {AuthenticatedMedusaRequest, MedusaResponse} from "@medusajs/framework/http"
import {getDirectDebitSimulationState} from "../../../../../../utils/directDebitSimulation"

/**
 * The direct debit simulation state of an order, for the order detail widget.
 * `visible` is only true while "SEPA testing" is switched on in the Pay.
 * settings, the server runs in test mode and the order holds a simulated
 * mandate, so the widget stays hidden everywhere else.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const state = await getDirectDebitSimulationState(req.scope, req.params.id)

  if (!state) {
    return res.status(404).json({message: "Order not found"})
  }

  return res.json({visible: state.available, ...state})
}
