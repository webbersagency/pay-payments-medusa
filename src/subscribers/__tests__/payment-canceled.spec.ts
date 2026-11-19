import {
  ContainerRegistrationKeys,
  Modules,
  PaymentCollectionStatus,
} from "@medusajs/framework/utils"
import {cancelOrderWorkflow} from "@medusajs/core-flows"
import paymentCanceledHandler from "../payment-canceled"
import {
  isCheckoutPaymentCollection,
  releaseCanceledPayPayment,
} from "../../utils/releaseCanceledPayPayment"

jest.mock("@medusajs/core-flows", () => ({
  cancelOrderWorkflow: jest.fn(),
}))

jest.mock("../../utils/releaseCanceledPayPayment", () => ({
  releaseCanceledPayPayment: jest.fn(),
  isCheckoutPaymentCollection: jest.fn(),
}))

const release = releaseCanceledPayPayment as unknown as jest.Mock
const isCheckout = isCheckoutPaymentCollection as unknown as jest.Mock

function makeContainer(order: Record<string, any> | undefined) {
  const run = jest.fn(async () => undefined)
  ;(cancelOrderWorkflow as unknown as jest.Mock).mockReturnValue({run})

  const updatePaymentCollections = jest.fn(async () => undefined)

  const registry: Record<string | symbol, any> = {
    logger: {info: jest.fn(), warn: jest.fn(), error: jest.fn()},
    [ContainerRegistrationKeys.QUERY]: {
      graph: jest.fn(async () => ({data: order ? [order] : []})),
    },
    [Modules.PAYMENT]: {updatePaymentCollections},
  }

  const container: any = {resolve: (key: string) => registry[key]}

  return {container, run, updatePaymentCollections}
}

const runHandler = (container: any) =>
  paymentCanceledHandler({
    event: {data: {id: "1001"}},
    container,
  } as any)

describe("payment-canceled subscriber", () => {
  beforeEach(() => jest.clearAllMocks())

  it("cancels the order when no payment was captured", async () => {
    const {container, run} = makeContainer({
      id: "order_1",
      payment_collections: [
        {
          status: PaymentCollectionStatus.AWAITING,
          payments: [{captured_at: null}],
          payment_sessions: [{provider_id: "pp_pay-ideal_pay"}],
        },
      ],
    })

    await runHandler(container)

    expect(run).toHaveBeenCalledWith({input: {order_id: "order_1"}})
  })

  it("skips the cancel when a payment was captured", async () => {
    const {container, run} = makeContainer({
      id: "order_1",
      payment_collections: [
        {
          status: PaymentCollectionStatus.AWAITING,
          payments: [{captured_at: "2026-07-02T19:36:00Z"}],
          payment_sessions: [{provider_id: "pp_pay-ideal_pay"}],
        },
      ],
    })

    await runHandler(container)

    expect(run).not.toHaveBeenCalled()
  })

  it("skips the cancel when the payment collection is completed", async () => {
    const {container, run} = makeContainer({
      id: "order_1",
      payment_collections: [
        {
          status: PaymentCollectionStatus.COMPLETED,
          payments: [],
          payment_sessions: [{provider_id: "pp_pay-ideal_pay"}],
        },
      ],
    })

    await runHandler(container)

    expect(run).not.toHaveBeenCalled()
  })

  it("marks the payment collection failed for direct debit without cancelling", async () => {
    const {container, run, updatePaymentCollections} = makeContainer({
      id: "order_1",
      payment_collections: [
        {
          status: PaymentCollectionStatus.AWAITING,
          payments: [],
          payment_sessions: [
            {
              provider_id: "pp_pay-direct-debit_pay",
              payment_collection_id: "paycol_1",
            },
          ],
        },
      ],
    })

    await runHandler(container)

    expect(updatePaymentCollections).toHaveBeenCalledWith("paycol_1", {
      status: PaymentCollectionStatus.FAILED,
    })
    expect(run).not.toHaveBeenCalled()
  })

  it("only releases a canceled retry payment and keeps the order", async () => {
    const {container, run} = makeContainer({
      id: "order_1",
      payment_collections: [],
    })
    release.mockResolvedValueOnce({
      payment_collection_ids: ["paycol_retry"],
      released: [],
    })
    isCheckout.mockResolvedValueOnce(false)

    await paymentCanceledHandler({
      event: {data: {id: "1001", pay_order_ids: ["3682804866Xf84b3"]}},
      container,
    } as any)

    expect(release).toHaveBeenCalledWith(container, ["3682804866Xf84b3"])
    expect(run).not.toHaveBeenCalled()
  })

  it("releases and cancels the order for a canceled checkout payment", async () => {
    const {container, run} = makeContainer({
      id: "order_1",
      payment_collections: [
        {
          status: PaymentCollectionStatus.NOT_PAID,
          payments: [{captured_at: null}],
          payment_sessions: [{provider_id: "pp_pay-ideal_pay"}],
        },
      ],
    })
    release.mockResolvedValueOnce({
      payment_collection_ids: ["paycol_1"],
      released: [],
    })
    isCheckout.mockResolvedValueOnce(true)

    await paymentCanceledHandler({
      event: {data: {id: "1001", pay_order_ids: ["51234567890X1a2b"]}},
      container,
    } as any)

    expect(release).toHaveBeenCalled()
    expect(run).toHaveBeenCalledWith({input: {order_id: "order_1"}})
  })

  it("throws when no order matches the reference", async () => {
    const {container, run} = makeContainer(undefined)

    await expect(runHandler(container)).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
  })
})
