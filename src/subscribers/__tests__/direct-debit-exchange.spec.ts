import {
  ContainerRegistrationKeys,
  Modules,
  PaymentCollectionStatus,
} from "@medusajs/framework/utils"
import {capturePaymentWorkflow} from "@medusajs/core-flows"
import {PayClient} from "../../providers/pay/core/pay-client"
import {reverseCapturedPayment} from "../../utils/reverseCapturedPayment"
import directDebitExchangeHandler from "../direct-debit-exchange"

jest.mock("@medusajs/core-flows", () => ({
  capturePaymentWorkflow: jest.fn(),
}))

jest.mock("../../utils/reverseCapturedPayment", () => ({
  reverseCapturedPayment: jest.fn(async () => undefined),
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

function makeContainer(
  order: Record<string, any> | undefined,
  {
    testMode,
    sessionOrderDisplayId,
  }: {testMode?: boolean; sessionOrderDisplayId?: string} = {}
) {
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
      graph: jest.fn(async ({entity}: {entity: string}) => {
        if (entity === "payment_session") {
          return {
            data: sessionOrderDisplayId
              ? [
                  {
                    id: "payses_1",
                    payment_collection: {
                      order: {display_id: sessionOrderDisplayId},
                    },
                  },
                ]
              : [],
          }
        }

        return {data: order ? [order] : []}
      }),
    },
    [ContainerRegistrationKeys.CONFIG_MODULE]: {
      modules: {
        payment: {
          options: {
            providers: [
              {
                id: "pay",
                options: {
                  slCode: "SL-TEST-0001",
                  ...(testMode === undefined ? {} : {testMode}),
                },
              },
            ],
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

  it("reverses the captured payment on a storno so the order becomes payable again", async () => {
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

    expect(reverseCapturedPayment).toHaveBeenCalledWith(container, {
      orderId: "order_1",
      paymentId: "pay_1",
      paymentCollectionId: "paycol_1",
      reason: "Pay. direct debit storno (status 127)",
    })
    // The reversal marks the collection failed itself
    expect(updatePaymentCollections).not.toHaveBeenCalled()
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

    expect(reverseCapturedPayment).not.toHaveBeenCalled()
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

describe("direct-debit-exchange subscriber - simulated mandates in test mode", () => {
  beforeEach(() => jest.clearAllMocks())

  const SIMULATED_CODE = "TEST-payses_1"

  function makeSimulatedOrder(overrides: Record<string, any> = {}) {
    const order = makeOrder(overrides)
    order.payment_collections[0].payment_sessions[0].data = {
      code: SIMULATED_CODE,
      testMode: true,
    } as any
    return order
  }

  it("captures a simulated collection without contacting Pay.", async () => {
    const {container, run, getDirectDebitInfoByMandate, getDirectDebitInfo} =
      makeContainer(makeSimulatedOrder(), {sessionOrderDisplayId: "1001"})

    await runHandler(container, {
      action: "incassocollected",
      mandateId: SIMULATED_CODE,
    })

    expect(getDirectDebitInfo).not.toHaveBeenCalled()
    expect(getDirectDebitInfoByMandate).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledWith({input: {payment_id: "pay_1"}})
  })

  it("reverses a captured simulated payment on a storno", async () => {
    const order = makeSimulatedOrder({status: PaymentCollectionStatus.COMPLETED})
    order.payment_collections[0].payment_sessions[0].payment.captured_at =
      "2026-07-01T10:00:00Z" as any
    const {container, emit, getDirectDebitInfoByMandate} = makeContainer(order, {
      sessionOrderDisplayId: "1001",
    })

    await runHandler(container, {
      action: "incassostorno",
      mandateId: SIMULATED_CODE,
    })

    expect(getDirectDebitInfoByMandate).not.toHaveBeenCalled()
    expect(reverseCapturedPayment).toHaveBeenCalledWith(container, {
      orderId: "order_1",
      paymentId: "pay_1",
      paymentCollectionId: "paycol_1",
      reason: "Pay. direct debit storno (status 127)",
    })
    expect(emit).toHaveBeenCalledWith(
      {name: "pay_payment.failed", data: {id: "1001", statusCode: 127}},
      {}
    )
  })

  it("takes the order reference from the body when given", async () => {
    const {container, run} = makeContainer(makeSimulatedOrder())

    await runHandler(container, {
      action: "incassocollected",
      mandateId: SIMULATED_CODE,
      reference: "1001",
    })

    expect(run).toHaveBeenCalledWith({input: {payment_id: "pay_1"}})
  })

  it("honours an explicit status code in the body", async () => {
    const {container, updatePaymentCollections} = makeContainer(
      makeSimulatedOrder(),
      {sessionOrderDisplayId: "1001"}
    )

    await runHandler(container, {
      action: "incassosend",
      mandateId: SIMULATED_CODE,
      status: {code: 106},
    })

    expect(updatePaymentCollections).toHaveBeenCalledWith("paycol_1", {
      status: PaymentCollectionStatus.FAILED,
    })
  })

  it("ignores a simulated mandate that belongs to another order", async () => {
    const order = makeSimulatedOrder()
    order.payment_collections[0].payment_sessions[0].data = {
      code: "TEST-payses_other",
      testMode: true,
    } as any
    const {container, run, updatePaymentCollections, logger} = makeContainer(
      order,
      {sessionOrderDisplayId: "1001"}
    )

    await runHandler(container, {
      action: "incassocollected",
      mandateId: SIMULATED_CODE,
    })

    expect(run).not.toHaveBeenCalled()
    expect(updatePaymentCollections).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("does not belong to this order")
    )
  })

  it("does not simulate when test mode is off", async () => {
    const {container, run, getDirectDebitInfoByMandate, logger} = makeContainer(
      makeSimulatedOrder(),
      {testMode: false, sessionOrderDisplayId: "1001"}
    )
    getDirectDebitInfoByMandate.mockResolvedValue({directdebits: []})

    await runHandler(container, {
      action: "incassocollected",
      mandateId: SIMULATED_CODE,
    })

    // Treated like any real mandate: re-fetched from Pay., which knows nothing about it
    expect(getDirectDebitInfoByMandate).toHaveBeenCalledWith(SIMULATED_CODE)
    expect(run).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("direct debit not found")
    )
  })
})
