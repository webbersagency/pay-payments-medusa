import PayBancontactService from "./pay-bancontact"
import PayCreditcardService from "./pay-creditcard"
import PayIdealService from "./pay-ideal"
import PayProviderService from "./pay-provider"
import PaySoftposService from "./pay-softpos"

const serviceClasses = [
  PayBancontactService,
  PayCreditcardService,
  PayIdealService,
  PayProviderService,
  PaySoftposService,
]

// Build registry once
const serviceRegistry: Record<string, any> = {}

for (const ServiceClass of serviceClasses) {
  serviceRegistry[ServiceClass.identifier] = ServiceClass
}

export const getPayServiceByProviderId = (providerId: string) =>
  serviceRegistry[providerId] || null

export default serviceRegistry
