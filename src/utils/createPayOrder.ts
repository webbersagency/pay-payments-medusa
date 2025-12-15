import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  PaymentCollectionStatus,
} from "@medusajs/framework/utils"
import {PaymentProviderKeys, ProviderOptions} from "../providers/pay/types"
import {
  AddressDTO,
  IPaymentModuleService,
  MedusaContainer,
  PaymentCollectionDTO,
  PaymentSessionDTO,
} from "@medusajs/types"
import {CustomerDTO, OrderDTO, SalesChannelDTO} from "@medusajs/framework/types"
import {getPayServiceByProviderId} from "../providers/pay/services"
import getPayPaymentSession from "./getPayPaymentSession"

export const defaultCreatePayOrderFields = [
  "id",
  "display_id",
  "metadata",
  "email",
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
]

export type OrderQueryResult = OrderDTO & {
  customer: CustomerDTO
  shipping_address: AddressDTO
  billing_address: AddressDTO
  sales_channel: SalesChannelDTO
  payment_collections: PaymentCollectionDTO[]
}

export const createPayOrder = async ({
  container,
  order_id,
}: {
  container: MedusaContainer
  order_id: string
}) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const paymentModuleService = container.resolve<IPaymentModuleService>(
    Modules.PAYMENT
  )
  const configModule = container.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE
  )

  const payModuleConfig = (configModule.modules!
    .payment as any)!.options!.providers!.find((p) => p.id === "pay")
  const payProviderId = payModuleConfig.id as string
  const payProviderOptions = payModuleConfig.options as ProviderOptions

  const {
    data: [order],
  }: {data: OrderQueryResult[]} = await query.graph(
    {
      entity: "order",
      fields: defaultCreatePayOrderFields,
      filters: {id: order_id},
    },
    {
      throwIfKeyNotFound: true,
    }
  )

  if (!order) {
    throw new Error(`Order with id ${order_id} not found`)
  }

  // Check if there is a Pay. payment pending, if so update payment status to
  // pending and update the Pay. order information
  const payPaymentSession = getPayPaymentSession(order)

  if (!!payPaymentSession) {
    const ServiceClass = getPayServiceByProviderId(
      // Remove the default pp_ prefix & remove the id suffix from config
      payPaymentSession.provider_id
        .replace("pp_", "")
        .replace(`_${payProviderId}`, "")
    )

    if (!ServiceClass) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `No valid Pay. provider service class found`
      )
    }

    if (![PaymentProviderKeys.DIRECTDEBIT].includes(ServiceClass.identifier)) {
      await paymentModuleService.updatePaymentCollections(
        payPaymentSession.payment_collection_id as string,
        {
          status: PaymentCollectionStatus.NOT_PAID,
        }
      )
    }

    const payProviderService = new ServiceClass(container, payProviderOptions)

    const updatedPaymentSession =
      await paymentModuleService.updatePaymentSession({
        id: payPaymentSession.id,
        data: {
          ...(payPaymentSession.data ?? {}),
          payload: payProviderService.createPayOrderPayload(
            order,
            payPaymentSession
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
