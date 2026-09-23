import {AuthenticatedMedusaRequest, MedusaResponse} from "@medusajs/framework/http"
import {MedusaError} from "@medusajs/framework/utils"
import {
  buildSimulatedExchangePayload,
  getDirectDebitSimulationState,
  isSimulatedExchangeKey,
} from "../../../../../../../utils/directDebitSimulation"
import {PAY_DIRECT_DEBIT_EXCHANGE_EVENT} from "../../../../../../../utils/directDebitExchange"
import payDirectDebitExchangeHandler from "../../../../../../../subscribers/direct-debit-exchange"

/**
 * Simulates the exchange Pay. would send for the order's test mode direct
 * debit. Only allowed while "SEPA testing" is switched on in the Pay. settings
 * (see getDirectDebitSimulationState). The exchange is processed synchronously
 * through the same subscriber that handles real exchanges, so the response
 * carries the resulting state.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<{action?: unknown}>,
  res: MedusaResponse
) => {
  const action = (req.body as {action?: unknown} | undefined)?.action

  if (!isSimulatedExchangeKey(action)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Unknown exchange "${String(action)}"`
    )
  }

  const state = await getDirectDebitSimulationState(req.scope, req.params.id)

  if (!state) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
  }

  if (!state.available) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Direct debit exchanges cannot be simulated for this order (${state.reason})`
    )
  }

  await payDirectDebitExchangeHandler({
    event: {
      name: PAY_DIRECT_DEBIT_EXCHANGE_EVENT,
      data: {payload: buildSimulatedExchangePayload(action, state)},
    },
    container: req.scope,
    pluginOptions: {},
  })

  const updated = await getDirectDebitSimulationState(req.scope, req.params.id)

  return res.json({visible: updated?.available ?? false, ...updated})
}
