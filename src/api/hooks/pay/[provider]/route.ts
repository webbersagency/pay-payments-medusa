import {MedusaRequest, MedusaResponse} from "@medusajs/framework"
import {PaymentModuleOptions} from "@medusajs/types"
import {Modules, PaymentWebhookEvents} from "@medusajs/framework/utils"
import {
  isDirectDebitTransactionExchange,
  isLegacyDirectDebitAction,
  PAY_DIRECT_DEBIT_EXCHANGE_EVENT,
  readDirectDebitMandateId,
  readDirectDebitReferenceId,
} from "../../../../utils/directDebitExchange"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const {provider} = req.params

    const options: PaymentModuleOptions =
      // @ts-expect-error "Not sure if .options exists on a module"
      req.scope.resolve(Modules.PAYMENT).options || {}

    const eventBus = req.scope.resolve(Modules.EVENT_BUS)

    const body = (req.body ?? {}) as Record<string, any>

    // Direct debit (Incasso) exchanges are not signed and carry no session
    // reference, they are handled by a dedicated subscriber that re-fetches
    // the mandate state from Pay. A legacy incassostorno with only an order_id
    // belongs to a payment created through the order API and falls through to
    // the regular webhook flow.
    const isDirectDebitExchange =
      (isLegacyDirectDebitAction(body.action) &&
        !!(readDirectDebitReferenceId(body) ||
          readDirectDebitMandateId(body))) ||
      isDirectDebitTransactionExchange(body)

    const event: {name: string; data: Record<string, unknown>} =
      isDirectDebitExchange
        ? {
            name: PAY_DIRECT_DEBIT_EXCHANGE_EVENT,
            data: {payload: body},
          }
        : {
            name: PaymentWebhookEvents.WebhookReceived,
            data: {
              provider,
              payload: {
                data: req.body,
                rawData: req.rawBody,
                headers: req.headers,
              },
            },
          }

    // we delay the processing of the event to avoid a conflict caused by a race condition
    await eventBus.emit(event, {
      delay: options.webhook_delay || 5000,
      attempts: options.webhook_retries || 3,
    })
  } catch (err) {
    res.status(400).send("FALSE")
    return
  }

  res.status(200).send("TRUE")
}
