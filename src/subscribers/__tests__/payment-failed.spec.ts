import {
  ContainerRegistrationKeys,
  Modules,
  PaymentCollectionStatus,
} from "@medusajs/framework/utils"
import {PayPaymentStatus} from "../../providers/pay/core/constants"
import paymentFailedHandler from "../payment-failed"

function makeContainer(order: Record<string, any> | undefined) {
  const updatePaymentCollections = jest.fn(async () => undefined)

  const registry: Record<string | symbol, any> = {
    logger: {info: jest.fn(), warn: jest.fn(), error: jest.fn()},
    [ContainerRegistrationKeys.QUERY]: {
      graph: jest.fn(async () => ({data: order ? [order] : []})),
    },
    [Modules.PAYMENT]: {updatePaymentCollections},
  }

  const container: any = {resolve: (key: string) => registry[key]}

  return {container, updatePaymentCollections}
}

const runHandler = (container: any, statusCode?: number) =>
  paymentFailedHandler({
    event: {data: {id: "1001", statusCode}},
    container,
  } as any)

describe("payment-failed subscriber", () => {
  beforeEach(() => jest.clearAllMocks())

  it("marks the payment collection failed when no payment was captured", async () => {
    const {container, updatePaymentCollections} = makeContainer({
      id: "order_1",
      payment_collections: [
        {
          status: PaymentCollectionStatus.AWAITING,
          payments: [{captured_at: null}],
          payment_sessions: [
            {
              provider_id: "pp_pay-ideal_pay",
              payment_collection_id: "paycol_1",
            },
          ],
        },
      ],
    })

    await runHandler(container, PayPaymentStatus.FAILURE)

    expect(updatePaymentCollections).toHaveBeenCalledWith("paycol_1", {
      status: PaymentCollectionStatus.FAILED,
    })
  })

  it("skips a failure exchange when a payment was captured", async () => {
    const {container, updatePaymentCollections} = makeContainer({
      id: "order_1",
      payment_collections: [
        {
          status: PaymentCollectionStatus.COMPLETED,
          payments: [{captured_at: "2026-07-02T19:36:00Z"}],
          payment_sessions: [
            {
              provider_id: "pp_pay-ideal_pay",
              payment_collection_id: "paycol_1",
            },
          ],
        },
      ],
    })

    await runHandler(container, PayPaymentStatus.FAILURE)

    expect(updatePaymentCollections).not.toHaveBeenCalled()
  })

  it("marks a captured collection failed on a chargeback", async () => {
    const {container, updatePaymentCollections} = makeContainer({
      id: "order_1",
      payment_collections: [
        {
          status: PaymentCollectionStatus.COMPLETED,
          payments: [{captured_at: "2026-07-02T19:36:00Z"}],
          payment_sessions: [
            {
              provider_id: "pp_pay-direct-debit_pay",
              payment_collection_id: "paycol_1",
            },
          ],
        },
      ],
    })

    await runHandler(container, PayPaymentStatus.CHARGEBACK)

    expect(updatePaymentCollections).toHaveBeenCalledWith("paycol_1", {
      status: PaymentCollectionStatus.FAILED,
    })
  })

  it("throws when no order matches the reference", async () => {
    const {container, updatePaymentCollections} = makeContainer(undefined)

    await expect(
      runHandler(container, PayPaymentStatus.FAILURE)
    ).rejects.toThrow()
    expect(updatePaymentCollections).not.toHaveBeenCalled()
  })
})
