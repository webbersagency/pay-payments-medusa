import {
  createWorkflow,
  WorkflowData,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {MedusaError, Modules, PromotionActions} from "@medusajs/framework/utils"
import {
  addShippingMethodToCartWorkflow,
  addToCartWorkflow,
  createCartWorkflow,
  updateCartPromotionsWorkflow,
  updateCartWorkflow,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import {validateCartCompletedStep} from "./steps/validate-cart-completed"
import {CartDTO} from "@medusajs/types"

export const duplicateCartWorkflowId = "duplicate-cart"

const THREE_DAYS = 60 * 60 * 24 * 3

export type DuplicateCartWorkflowInput = {
  /**
   * The ID of the cart to duplicate.
   */
  id: string
}

export const duplicateCartWorkflow = createWorkflow(
  {
    name: duplicateCartWorkflowId,
    idempotent: true,
    store: true,
    retentionTime: THREE_DAYS,
  },
  (input: WorkflowData<DuplicateCartWorkflowInput>) => {
    const {data: carts} = useQueryGraphStep({
      entity: Modules.CART,
      filters: {
        id: input.id,
      },
      fields: [
        "id",
        "email",
        "customer.id",
        "type",
        "metadata",
        "sales_channel_id",
        "completed_at",
        "billing_address.*",
        "shipping_address.*",
        "items.*",
        "items.adjustments.promotion.*",
        "promotions.*",
        "region.id",
        "shipping_methods.*",
      ],
    })

    const cart = transform({carts}, (data) => {
      return data.carts?.[0]
    })

    validateCartCompletedStep({
      cart: cart as unknown as CartDTO,
    })

    const billing_address = transform({cart}, (data) => {
      return data.cart?.billing_address
    })

    const shipping_address = transform({cart}, (data) => {
      return data.cart?.shipping_address
    })

    const newCart = createCartWorkflow.runAsStep({
      input: {
        region_id: cart?.region_id ?? "",
        email: cart?.email ?? "",
        billing_address: {
          first_name: billing_address?.first_name ?? undefined,
          last_name: billing_address?.last_name ?? undefined,
          phone: billing_address?.phone ?? undefined,
          company: billing_address?.company ?? undefined,
          address_1: billing_address?.address_1 ?? undefined,
          address_2: billing_address?.address_2 ?? undefined,
          city: billing_address?.city ?? undefined,
          country_code: billing_address?.country_code ?? undefined,
          province: billing_address?.province ?? undefined,
          postal_code: billing_address?.postal_code ?? undefined,
          metadata: billing_address?.metadata ?? undefined,
        },
        shipping_address: {
          first_name: shipping_address?.first_name ?? undefined,
          last_name: shipping_address?.last_name ?? undefined,
          phone: shipping_address?.phone ?? undefined,
          company: shipping_address?.company ?? undefined,
          address_1: shipping_address?.address_1 ?? undefined,
          address_2: shipping_address?.address_2 ?? undefined,
          city: shipping_address?.city ?? undefined,
          country_code: shipping_address?.country_code ?? undefined,
          province: shipping_address?.province ?? undefined,
          postal_code: shipping_address?.postal_code ?? undefined,
          metadata: shipping_address?.metadata ?? undefined,
        },
        customer_id: cart?.customer_id ?? undefined,
        metadata: cart?.metadata ?? undefined,
        sales_channel_id: cart.sales_channel_id ?? undefined,
      },
    })

    const options = transform({cart}, (data) => {
      return data.cart?.shipping_methods?.map((sm) => ({
        id: sm?.shipping_option_id ?? "",
        data: {
          ...sm?.data,
        },
      }))
    })

    addShippingMethodToCartWorkflow.runAsStep({
      input: {
        cart_id: newCart.id,
        options,
      },
    })

    const promoCodes = transform({cart}, (data) => {
      return data.cart?.promotions?.map((promotion) => promotion?.code ?? "")
    })

    const items = transform({cart}, (data) => {
      return data.cart?.items?.map((item) => ({
        variant_id: item?.variant_id ?? undefined,
        quantity: item?.quantity ?? 0,
      }))
    })

    // Add the line items
    addToCartWorkflow.runAsStep({
      input: {
        cart_id: newCart.id,
        items,
      },
    })

    updateCartWorkflow.runAsStep({
      input: {
        id: newCart.id,
        region_id: cart?.region_id ?? "",
      },
    })

    updateCartPromotionsWorkflow.runAsStep({
      input: {
        cart_id: newCart.id,
        promo_codes: promoCodes,
        action: PromotionActions.ADD,
      },
    })

    const {data: duplicatedCart} = useQueryGraphStep({
      entity: Modules.CART,
      filters: {
        id: newCart.id,
      },
      fields: [
        "id",
        "email",
        "customer.id",
        "type",
        "metadata",
        "sales_channel_id",
        "completed_at",
        "billing_address.*",
        "shipping_address.*",
        "items.*",
        "items.adjustments.promotion.*",
        "promotions.*",
        "region.*",
        "shipping_methods.*",
        "payment_collection.*",
        "currency_code",
        "total",
        "subtotal",
        "tax_total",
        "discount_total",
        "discount_subtotal",
        "discount_tax_total",
        "original_total",
        "original_tax_total",
        "item_total",
        "item_subtotal",
        "item_tax_total",
        "original_item_total",
        "original_item_subtotal",
        "original_item_tax_total",
        "shipping_total",
        "shipping_subtotal",
        "shipping_tax_total",
        "original_shipping_tax_total",
        "original_shipping_subtotal",
        "original_shipping_total",
        "credit_line_subtotal",
        "credit_line_tax_total",
        "credit_line_total",
      ],
    }).config({name: "retrieve-duplicated-cart"})

    return new WorkflowResponse(duplicatedCart?.[0])
  }
)
