import {AuthenticatedMedusaRequest, MedusaResponse} from "@medusajs/framework"
import {ContainerRegistrationKeys, Modules} from "@medusajs/framework/utils"
import {PAY_CACHE_KEY} from "../../../../providers/pay/core/constants"
import {ProviderOptions} from "../../../../providers/pay/types"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const cacheModuleService = req.scope.resolve(Modules.CACHE)
  const configModule = req.scope.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE
  )

  try {
    const payProviderOptions = (configModule.modules!
      .payment as any)!.options!.providers!.find((p) => p.id === "pay")
      .options as ProviderOptions

    const slCode = payProviderOptions.slCode
    const key = `${PAY_CACHE_KEY.CONFIG}:${slCode}`

    await cacheModuleService.invalidate(key)

    return res.status(200).send("Successfully cleared cache")
  } catch (err) {
    return res.status(500).send(err)
  }
}
