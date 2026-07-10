import {
  ContainerRegistrationKeys,
  Modules,
  PaymentCollectionStatus,
} from "@medusajs/framework/utils"
import {capturePaymentWorkflow} from "@medusajs/core-flows"
import {PayClient} from "../../providers/pay/core/pay-client"
import directDebitExchangeHandler from "../direct-debit-exchange"

jest.mock("@medusajs/core-flows", () => ({
  capturePaymentWorkflow: jest.fn(),
}))

jest.mock("../../providers/pay/core/pay-client", () => ({
  PayClient: jest.fn(),
}))

const MANDATE_CODE = "IO-1234-5678-9012"
const PAY_TRANSACTION_ID = "52801234567X1001"

function directDebitInfo(
  statusCode: number,
  overrides: Record<string, any> = {}
) {
  return {
    total: 1,
    count: 1,
    pages: 1,
    directdebits: [
      {
        id: "IL-1000-0000-0001",
        orderId: PAY_TRANSACTION_ID,
        amount: {value: 4050, currency: "EUR"},
        status: {code: statusCode, action: "", phase: ""},
        declined: false,
        mandate: {code: MANDATE_CODE, reference: "1001", description: ""},
        ...overrides,
      },
    ],
  }
}

function makeOrder(overrides: Record<string, any> = {}) {
  return {
    id: "order_1",
    payment_collections: [
      {
        id: "paycol_1",
        status: PaymentCollectionStatus.AWAITING,
        payment_sessions: [
          {
            provider_id: "pp_pay-direct-debit_pay",
            payment_collection_id: "paycol_1",
            data: {code: MANDATE_CODE},
            payment: {id: "pay_1", captured_at: null},
          },
        ],
        ...overrides,
      },
    ],
  }
}

function makeContainer(order: Record<string, any> | undefined) {
  const run = jest.fn(async () => undefined)
  ;(capturePaymentWorkflow as unknown as jest.Mock).mockReturnValue({run})

  const getDirectDebitInfo = jest.fn()
  const getDirectDebitInfoByMandate = jest.fn()
  ;(PayClient as unknown as jest.Mock).mockImplementation(() => ({
    getDirectDebitInfo,
    getDirectDebitInfoByMandate,
  }))

  const updatePaymentCollections = jest.fn(async () => undefined)
  const emit = jest.fn(async () => undefined)
  const logger = {info: jest.fn(), warn: jest.fn(), error: jest.fn()}

  const registry: Record<string | symbol, any> = {
    logger,
    [ContainerRegistrationKeys.QUERY]: {
      graph: jest.fn(async () => ({data: order ? [order] : []})),
    },
    [ContainerRegistrationKeys.CONFIG_MODULE]: {
      modules: {
        payment: {
          options: {
            providers: [{id: "pay", options: {slCode: "SL-TEST-0001"}}],
          },
        },
      },
    },
    [Modules.PAYMENT]: {updatePaymentCollections},
    [Modules.EVENT_BUS]: {emit},
  }

  const container: any = {resolve: (key: string) => registry[key]}

  return {
    container,
    run,
    logger,
    emit,
    getDirectDebitInfo,
    getDirectDebitInfoByMandate,
    updatePaymentCollections,
  }
}

const runHandler = (container: any, payload: Record<string, any>) =>
  directDebitExchangeHandler({
    event: {data: {payload}},
    container,
  } as any)

describe("direct-debit-exchange subscriber", () => {
  beforeEach(() => jest.clearAllMocks())

  it("captures the payment when a legacy exchange reports collected", async () => {
    const {container, run, emit, getDirectDebitInfoByMandate} = makeContainer(
      makeOrder()
    )
    getDirectDebitInfoByMandate.mockResolvedValue(directDebitInfo(100))

    await runHandler(container, {
      action: "incassocollected",
      mandateId: MANDATE_CODE,
    })

    expect(getDirectDebitInfoByMandate).toHaveBeenCalledWith(MANDATE_CODE)
    expect(run).toHaveBeenCalledWith({input: {payment_id: "pay_1"}})
    expect(emit).not.toHaveBeenCalled()
  })

  it("resolves a legacy exchange through the referenceId first", async () => {
    const {container, run, getDirectDebitInfo, getDirectDebitInfoByMandate} =
      makeContainer(makeOrder())
    getDirectDebitInfo.mockResolvedValue(directDebitInfo(100))

    await runHandler(container, {
      action: "incassocollected",
      referenceId: "IL-1000-0000-0001",
      mandateId: MANDATE_CODE,
    })

    expect(getDirectDebitInfo).toHaveBeenCalledWith("IL-1000-0000-0001")
    expect(getDirectDebitInfoByMandate).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledWith({input: {payment_id: "pay_1"}})
  })

  it("skips the capture when the payment was already captured", async () => {
    const order = makeOrder()
    order.payment_collections[0].payment_sessions[0].payment.captured_at =
      "2026-07-01T10:00:00Z" as any

    const {container, run, getDirectDebitInfoByMandate} = makeContainer(order)
    getDirectDebitInfoByMandate.mockResolvedValue(directDebitInfo(100))

    await runHandler(container, {
      action: "incassocollected",
      mandateId: MANDATE_CODE,
    })

    expect(run).not.toHaveBeenCalled()
  })

  it("marks the collection failed on a storno, even when captured", async () => {
    const order = makeOrder({status: PaymentCollectionStatus.COMPLETED})
    order.payment_collections[0].payment_sessions[0].payment.captured_at =
      "2026-07-01T10:00:00Z" as any

    const {container, run, emit, updatePaymentCollections, getDirectDebitInfoByMandate} =
      makeContainer(order)
    getDirectDebitInfoByMandate.mockResolvedValue(directDebitInfo(127))

    await runHandler(container, {
      action: "incassostorno",
      mandateId: MANDATE_CODE,
    })

    expect(updatePaymentCollections).toHaveBeenCalledWith("paycol_1", {
      status: PaymentCollectionStatus.FAILED,
    })
    expect(emit).toHaveBeenCalledWith(
      {
        name: "pay_payment.failed",
        data: {id: "1001", statusCode: 127},
      },
      {}
    )
    expect(run).not.toHaveBeenCalled()
  })

  it("marks the collection failed when the direct debit was declined", async () => {
    const {container, emit, updatePaymentCollections, getDirectDebitInfoByMandate} =
      makeContainer(makeOrder())
    getDirectDebitInfoByMandate.mockResolvedValue(
      directDebitInfo(94, {declined: true})
    )

    await runHandler(container, {
      action: "incassosend",
      mandateId: MANDATE_CODE,
    })

    expect(updatePaymentCollections).toHaveBeenCalledWith("paycol_1", {
      status: PaymentCollectionStatus.FAILED,
    })
    expect(emit).toHaveBeenCalledWith(
      {
        name: "pay_payment.failed",
        data: {id: "1001", statusCode: 94},
      },
      {}
    )
  })

  it("handles the flat Incasso transaction exchange through the stored mandate", async () => {
    const {container, updatePaymentCollections, getDirectDebitInfoByMandate} =
      makeContainer(makeOrder())
    getDirectDebitInfoByMandate.mockResolvedValue(directDebitInfo(91))

    await runHandler(container, {
      paymentMethod: {id: 137, name: "Incasso"},
      status: {code: 100},
      description: "Bold Shop - #1001",
    })

    // The body claims collected, the re-fetched state is pending, so the
    // collection only moves to awaiting
    expect(getDirectDebitInfoByMandate).toHaveBeenCalledWith(MANDATE_CODE)
    expect(updatePaymentCollections).toHaveBeenCalledWith("paycol_1", {
      status: PaymentCollectionStatus.AWAITING,
    })
  })

  it("does not downgrade a completed collection to awaiting", async () => {
    const order = makeOrder({status: PaymentCollectionStatus.COMPLETED})

    const {container, updatePaymentCollections, getDirectDebitInfoByMandate} =
      makeContainer(order)
    getDirectDebitInfoByMandate.mockResolvedValue(directDebitInfo(94))

    await runHandler(container, {
      action: "incassosend",
      mandateId: MANDATE_CODE,
    })

    expect(updatePaymentCollections).not.toHaveBeenCalled()
  })

  it("ignores an exchange when the mandate code is missing on the payment", async () => {
    const order = makeOrder()
    order.payment_collections[0].payment_sessions[0].data = {} as any

    const {container, run, updatePaymentCollections, logger} =
      makeContainer(order)

    await runHandler(container, {
      paymentMethod: {id: 137},
      status: {code: 100},
      description: "Bold Shop - #1001",
    })

    expect(run).not.toHaveBeenCalled()
    expect(updatePaymentCollections).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  it("ignores an exchange when no order matches the reference", async () => {
    const {container, run, updatePaymentCollections, getDirectDebitInfoByMandate} =
      makeContainer(undefined)
    getDirectDebitInfoByMandate.mockResolvedValue(directDebitInfo(100))

    await runHandler(container, {
      action: "incassocollected",
      mandateId: MANDATE_CODE,
    })

    expect(run).not.toHaveBeenCalled()
    expect(updatePaymentCollections).not.toHaveBeenCalled()
  })

  it("ignores unsupported statuses", async () => {
    const {container, run, updatePaymentCollections, getDirectDebitInfoByMandate, logger} =
      makeContainer(makeOrder())
    getDirectDebitInfoByMandate.mockResolvedValue(
      directDebitInfo(999, {status: {code: 999, action: "PLANNED", phase: ""}})
    )

    await runHandler(container, {
      action: "incassosend",
      mandateId: MANDATE_CODE,
    })

    expect(run).not.toHaveBeenCalled()
    expect(updatePaymentCollections).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })
})
