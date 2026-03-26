import {validateAndTransformQuery} from "@medusajs/framework"
import {MiddlewareRoute} from "@medusajs/framework/http"
import {StoreGetCartsCart} from "@medusajs/medusa/api/store/carts/validators"
import {defaultStoreCartFields} from "@medusajs/medusa/api/store/carts/query-config"

export const storeCartRoutesMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/store/carts/:id/duplicate",
    middlewares: [
      validateAndTransformQuery(StoreGetCartsCart, {
        defaults: defaultStoreCartFields,
        isList: false,
      }),
    ],
  },
]
