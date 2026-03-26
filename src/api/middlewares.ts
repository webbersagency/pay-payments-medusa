import {defineMiddlewares} from "@medusajs/framework/http"
import {hooksRoutesMiddlewares} from "./hooks/middlewares"
import {storeCartRoutesMiddlewares} from "./store/carts/middlewares"

export default defineMiddlewares({
  routes: [...hooksRoutesMiddlewares, ...storeCartRoutesMiddlewares],
})
