import {
  ContainerRegistrationKeys,
  Modules,
  PaymentCollectionStatus,
} from "@medusajs/framework/utils"
import {completeCartWorkflow} from "@medusajs/medusa/core-flows"
import {
  AddressDTO,
  IPaymentModuleService,
  MedusaContainer,
  PaymentCollectionDTO,
  PaymentSessionDTO,
} from "@medusajs/types"
import {CustomerDTO, OrderDTO, SalesChannelDTO} from "@medusajs/framework/types"
import PayProviderService from "../../providers/pay/services/pay-provider"
import {PayPaymentMethod, ProviderOptions} from "../../providers/pay/types"

type OrderQueryResult = OrderDTO & {
  customer: CustomerDTO
  shipping_address: AddressDTO
  billing_address: AddressDTO
  sales_channel: SalesChannelDTO
  payment_collections: PaymentCollectionDTO[]
}

/**
 * Pay. needs order information to validate and/or verify with after pay payment
 * solutions. Therefore, Medusa payment sessions are ignored, but then we need to
 * create the Pay. order payment here in the order created flow.
 */
// @ts-ignore
completeCartWorkflow.hooks.orderCreated(
  async ({order_id, cart_id}, {container}: {container: MedusaContainer}) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const paymentModuleService = container.resolve<IPaymentModuleService>(
      Modules.PAYMENT
    )
    const configModule = container.resolve(
      ContainerRegistrationKeys.CONFIG_MODULE
    )

    const payProviderOptions = (configModule.modules!
      .payment as any)!.options!.providers!.find((p) => p.id === "pay")
      .options as ProviderOptions

    const {
      data: [order],
    }: {data: OrderQueryResult[]} = await query.graph(
      {
        entity: "order",
        fields: [
          "id",
          "display_id",
          "total",
          "currency_code",
          "subtotal",
          "tax_total",
          "discount_total",
          "discount_subtotal",
          "discount_tax_total",
          "gift_card_total",
          "gift_card_tax_total",
          "shipping_total",
          "shipping_subtotal",
          "shipping_tax_total",
          "original_total",
          "original_subtotal",
          "original_tax_total",
          "item_total",
          "item_subtotal",
          "item_tax_total",
          "original_item_total",
          "original_item_subtotal",
          "original_item_tax_total",
          "items.*",
          "customer.*",
          "shipping_address.*",
          "billing_address.*",
          "sales_channel.*",
          "payment_collections.*",
          "payment_collections.payment_sessions.*",
        ],
        filters: {id: order_id},
      },
      {
        throwIfKeyNotFound: true,
      }
    )

    // Check if there is a Pay. payment pending, if so update payment status to
    // pending and update the Pay. order information
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

    if (!!payPaymentSession) {
      await paymentModuleService.updatePaymentCollections(
        payPaymentSession.payment_collection_id as string,
        {
          status: PaymentCollectionStatus.NOT_PAID,
        }
      )

      const payProviderService = new PayProviderService(
        container,
        payProviderOptions
      )

      const updatedPaymentSession =
        await paymentModuleService.updatePaymentSession({
          id: payPaymentSession.id,
          data: {
            ...(payPaymentSession.data ?? {}),
            payload: payProviderService.createPayOrderPayload(
              order,
              payPaymentSession.data?.session_id as string,
              payPaymentSession.data?.paymentMethod as PayPaymentMethod
            ),
          },
          currency_code: payPaymentSession.currency_code,
          amount: payPaymentSession.amount,
        })

      if (updatedPaymentSession.payment?.id) {
        await paymentModuleService.updatePayment({
          id: updatedPaymentSession.payment.id,
          // @ts-ignore
          data: updatedPaymentSession.data,
        })
      }
    }
  }
)
