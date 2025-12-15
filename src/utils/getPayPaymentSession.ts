import {PaymentCollectionDTO, PaymentSessionDTO} from "@medusajs/types"
import {OrderDTO} from "@medusajs/framework/types"

const getPayPaymentSession = (
  order: OrderDTO & {payment_collections: PaymentCollectionDTO[]}
) => {
  let payPaymentSession: PaymentSessionDTO | undefined

  for (const pc of order.payment_collections ?? []) {
    if (!pc?.payment_sessions) continue

    const paymentSession = pc.payment_sessions.find((p) =>
      p.provider_id.startsWith("pp_pay")
    )

    if (paymentSession) {
      payPaymentSession = paymentSession
      break
    }
  }

  return payPaymentSession
}

export default getPayPaymentSession
