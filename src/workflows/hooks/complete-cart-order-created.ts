import {completeCartWorkflow} from "@medusajs/medusa/core-flows"
import {MedusaContainer} from "@medusajs/types"
import {createPayOrder} from "../../utils"

/**
 * Pay. needs order information to validate and/or verify with after pay payment
 * solutions. Therefore, Medusa payment sessions are ignored, but then we need to
 * create the Pay. order payment here in the order created flow.
 */
// @ts-ignore
completeCartWorkflow.hooks.orderCreated(
  async ({order_id, cart_id}, {container}: {container: MedusaContainer}) => {
    await createPayOrder({order_id, container})
  }
)
