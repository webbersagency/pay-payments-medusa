import {ModuleProvider, Modules} from "@medusajs/framework/utils"

import PayProviderService from "./services/pay-provider"
import PaySoftposProviderService from "./services/pay-softpos-provider"

const services = [PayProviderService, PaySoftposProviderService]

export default ModuleProvider(Modules.PAYMENT, {
  services,
})
