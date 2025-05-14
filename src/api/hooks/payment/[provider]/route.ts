import {MedusaRequest, MedusaResponse} from "@medusajs/framework"
import {PaymentModuleOptions} from "@medusajs/types"
import {Modules, PaymentWebhookEvents} from "@medusajs/framework/utils"
import {
  PaymentProviderKeys,
  PaymentProviderValue,
} from "../../../../providers/pay/types"

const isPayProvider = (providerId: string) =>
  Object.values(PaymentProviderKeys).some((key: PaymentProviderValue) =>
    providerId.startsWith(key)
  )

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const {provider} = req.params

  const isPay = isPayProvider(provider)

  try {
    const options: PaymentModuleOptions =
      // @ts-expect-error "Not sure if .options exists on a module"
      req.scope.resolve(Modules.PAYMENT).options || {}

    const event = {
      provider,
      payload: {data: req.body, rawData: req.rawBody, headers: req.headers},
    }

    const eventBus = req.scope.resolve(Modules.EVENT_BUS)

    // we delay the processing of the event to avoid a conflict caused by a race condition
    await eventBus.emit(
      {
        name: PaymentWebhookEvents.WebhookReceived,
        data: event,
      },
      {
        delay: options.webhook_delay || 5000,
        attempts: options.webhook_retries || 3,
      }
    )
  } catch (err) {
    if (isPay) {
      res.status(400).send("FALSE")
    } else {
      res.status(400).send(`Webhook Error: ${err.message}`)
    }

    return
  }

  if (isPay) {
    res.status(200).send("TRUE")
  } else {
    res.sendStatus(200)
  }
}
