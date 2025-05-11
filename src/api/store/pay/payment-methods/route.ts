import {PAY_CACHE_KEY} from "../../../../providers/pay/core/constants"
import {MedusaRequest, MedusaResponse} from "@medusajs/framework"
import {ContainerRegistrationKeys, Modules} from "@medusajs/framework/utils"
import {ProviderOptions} from "../../../../providers/pay/types"
import {PayClient} from "../../../../providers/pay/core/pay-client"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const cacheModuleService = req.scope.resolve(Modules.CACHE)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const configModule = req.scope.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE
  )

  const payProviderOptions = (configModule.modules!
    .payment as any)!.options!.providers!.find((p) => p.id === "pay")
    .options as ProviderOptions

  const payClient = new PayClient(payProviderOptions, logger)

  const cacheTtl = 86400 // Day in seconds
  const slCode = payProviderOptions.slCode
  const key = `${PAY_CACHE_KEY.CONFIG}:${slCode}`

  let checkoutOptions = await cacheModuleService.get(key)

  if (!checkoutOptions) {
    try {
      const config = await payClient.getConfig()

      checkoutOptions = {
        checkoutOptions: config.checkoutOptions,
        checkoutSequence: config.checkoutSequence,
        checkoutTexts: config.checkoutTexts,
      }
    } catch (e) {
      logger.error("Error retrieving Pay checkout options", e.message)
    }

    await cacheModuleService.set(key, checkoutOptions, cacheTtl)
  }

  res.json(checkoutOptions)
}
