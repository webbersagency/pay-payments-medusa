import {AuthenticatedMedusaRequest, MedusaResponse} from "@medusajs/framework/http"
import {MedusaError} from "@medusajs/framework/utils"
import {
  getPayProviderOptions,
  isSepaTestingEnabled,
  setSepaTestingEnabled,
} from "../../../../utils/directDebitSimulation"

export type PayAdminSettings = {
  /** Whether the provider runs against Pay.'s test environment */
  testMode: boolean
  /** The "SEPA testing" switch: allows simulating direct debit exchanges */
  sepaTesting: boolean
}

const readSettings = async (
  req: AuthenticatedMedusaRequest
): Promise<PayAdminSettings> => ({
  testMode: getPayProviderOptions(req.scope)?.testMode ?? true,
  sepaTesting: await isSepaTestingEnabled(req.scope),
})

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  res.json(await readSettings(req))
}

export const POST = async (
  req: AuthenticatedMedusaRequest<{sepaTesting?: unknown}>,
  res: MedusaResponse
) => {
  const sepaTesting = (req.body as {sepaTesting?: unknown} | undefined)
    ?.sepaTesting

  if (typeof sepaTesting !== "boolean") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "sepaTesting must be a boolean"
    )
  }

  await setSepaTestingEnabled(req.scope, sepaTesting)

  res.json(await readSettings(req))
}
