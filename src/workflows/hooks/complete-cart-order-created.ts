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
    const logger = container.resolve("logger")

    try {
      await createPayOrder({order_id, container})
    } catch (error) {
      logger.error(
        `Failed to create pay order for order_id=${order_id}, cart_id=${cart_id}: ${
          (error as Error)?.message
        }`
      )
    }
  }
)
