import {ContainerRegistrationKeys} from "@medusajs/framework/utils"
import {Logger, MedusaContainer} from "@medusajs/types"
import {PayClient} from "../providers/pay/core/pay-client"
import {ProviderOptions} from "../providers/pay/types"

/**
 * Builds a Pay. API client from the options of the payment provider with id
 * `pay` in medusa-config. Returns null when that provider is not configured.
 */
export const getPayClient = (
  container: MedusaContainer,
  logger: Logger
): {client: PayClient; options: ProviderOptions} | null => {
  const configModule = container.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE
  )

  const payModuleConfig = (
    configModule.modules?.payment as any
  )?.options?.providers?.find((p) => p.id === "pay")

  if (!payModuleConfig?.options) {
    return null
  }

  const options = payModuleConfig.options as ProviderOptions

  return {client: new PayClient(options, logger), options}
}
