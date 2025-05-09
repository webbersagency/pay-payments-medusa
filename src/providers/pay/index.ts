import {ModuleProvider, Modules} from "@medusajs/framework/utils"

import {PayIdealService} from "./services"

const services = [PayIdealService]

export default ModuleProvider(Modules.PAYMENT, {
  services,
})
