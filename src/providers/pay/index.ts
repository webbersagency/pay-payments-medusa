import {ModuleProvider, Modules} from "@medusajs/framework/utils"

import PayBancontactService from "./services/pay-bancontact"
import PayCreditcardService from "./services/pay-creditcard"
import PayIdealService from "./services/pay-ideal"
import PayProviderService from "./services/pay-provider"
import PaySoftposService from "./services/pay-softpos"

const services = [
  PayBancontactService,
  PayCreditcardService,
  PayIdealService,
  PayProviderService,
  PaySoftposService,
]

export default ModuleProvider(Modules.PAYMENT, {
  services,
})
