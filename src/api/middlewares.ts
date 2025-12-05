import {defineMiddlewares} from "@medusajs/framework/http"
import {hooksRoutesMiddlewares} from "./hooks/middlewares"

export default defineMiddlewares({
  routes: [...hooksRoutesMiddlewares],
})
