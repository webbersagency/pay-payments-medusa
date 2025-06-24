import {ModuleProvider, Modules} from "@medusajs/framework/utils"
import {serviceClasses} from "./services"

export default ModuleProvider(Modules.PAYMENT, {
  services: serviceClasses,
})
