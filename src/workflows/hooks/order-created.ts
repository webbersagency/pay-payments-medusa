import {MedusaContainer} from "@medusajs/types"
import createPayOrder from "../../utils/createPayOrder"
import {createOrderWorkflow} from "@medusajs/core-flows"

/**
 * Pay. needs order information to validate and/or verify with after pay payment
 * solutions. Therefore, Medusa payment sessions are ignored, but then we need to
 * create the Pay. order payment here in the order created flow.
 */
createOrderWorkflow.hooks.orderCreated(
  async (
    {order, additional_data},
    {container}: {container: MedusaContainer}
  ) => {
    await createPayOrder({order_id: order.id, container})
  }
)
