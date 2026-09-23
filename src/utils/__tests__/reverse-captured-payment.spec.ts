import {
  ContainerRegistrationKeys,
  Modules,
  PaymentCollectionStatus,
} from "@medusajs/framework/utils"
import {createOrUpdateOrderPaymentCollectionWorkflow} from "@medusajs/core-flows"
import {
  formatPayReversalNote,
  parsePayReversalNote,
  reverseCapturedPayment,
} from "../reverseCapturedPayment"

jest.mock("@medusajs/core-flows", () => ({
  createOrUpdateOrderPaymentCollectionWorkflow: jest.fn(),
}))

const INPUT = {
  orderId: "order_1",
  paymentId: "pay_1",
  paymentCollectionId: "paycol_1",
  kind: "chargeback" as const,
  statusCode: -71,
}

describe("reversal notes", () => {
  it("formats and parses a chargeback note", () => {
    const note = formatPayReversalNote("chargeback", -71)

    expect(note).toBe("Pay. chargeback (status -71)")
    expect(parsePayReversalNote(note)).toEqual({
      kind: "chargeback",
      statusCode: -71,
    })
  })

  it("formats and parses direct debit notes, also without a status", () => {
    expect(parsePayReversalNote(formatPayReversalNote("storno", 127))).toEqual({
      kind: "storno",
      statusCode: 127,
    })
    expect(parsePayReversalNote(formatPayReversalNote("failure", "unknown"))).toEqual({
      kind: "failure",
      statusCode: null,
    })
    expect(formatPayReversalNote("failure")).toBe(
      "Pay. direct debit failure (status unknown)"
    )
  })

  it("does not mistake other refund notes for reversals", () => {
    expect(parsePayReversalNote("Customer asked for a refund")).toBeNull()
    expect(parsePayReversalNote("Pay. refund (status -81)")).toBeNull()
    expect(parsePayReversalNote(null)).toBeNull()
  })
})

function makeContainer({
  payment,
  refundedPayment,
  transactions = [],
}: {
  payment: Record<string, any>
  refundedPayment?: Record<string, any>
  transactions?: Record<string, any>[]
}) {
  const run = jest.fn(async () => ({
    result: [{id: "paycol_2", status: PaymentCollectionStatus.NOT_PAID}],
  }))
  ;(
    createOrUpdateOrderPaymentCollectionWorkflow as unknown as jest.Mock
  ).mockReturnValue({run})

  const retrievePayment = jest.fn(async () => payment)
  const refundPayment = jest.fn(async () => refundedPayment ?? payment)
  const updatePaymentCollections = jest.fn(async () => undefined)
  const listOrderTransactions = jest.fn(async () => transactions)
  const addOrderTransactions = jest.fn(async () => [])
  const logger = {info: jest.fn(), warn: jest.fn(), error: jest.fn()}

  const registry: Record<string | symbol, any> = {
    [ContainerRegistrationKeys.LOGGER]: logger,
    [Modules.PAYMENT]: {
      retrievePayment,
      refundPayment,
      updatePaymentCollections,
    },
    [Modules.ORDER]: {listOrderTransactions, addOrderTransactions},
  }

  const container: any = {resolve: (key: string) => registry[key]}

  return {
    container,
    run,
    retrievePayment,
    refundPayment,
    updatePaymentCollections,
    listOrderTransactions,
    addOrderTransactions,
    logger,
  }
}

describe("reverseCapturedPayment", () => {
  beforeEach(() => jest.clearAllMocks())

  it("records the reversal as a refund, books it on the order and opens a new payment collection", async () => {
    const mocks = makeContainer({
      payment: {
        id: "pay_1",
        currency_code: "eur",
        captures: [{amount: 40.5}],
        refunds: [],
      },
      refundedPayment: {
        id: "pay_1",
        currency_code: "eur",
        captures: [{amount: 40.5}],
        refunds: [{id: "ref_1", amount: 40.5}],
      },
    })

    await reverseCapturedPayment(mocks.container, INPUT)

    expect(mocks.retrievePayment).toHaveBeenCalledWith("pay_1", {
      relations: ["captures", "refunds"],
    })
    expect(mocks.refundPayment).toHaveBeenCalledWith({
      payment_id: "pay_1",
      amount: 40.5,
      note: "Pay. chargeback (status -71)",
    })
    expect(mocks.addOrderTransactions).toHaveBeenCalledWith([
      {
        order_id: "order_1",
        amount: -40.5,
        currency_code: "eur",
        reference: "refund",
        reference_id: "ref_1",
      },
    ])
    expect(mocks.updatePaymentCollections).toHaveBeenCalledWith("paycol_1", {
      status: PaymentCollectionStatus.FAILED,
    })
    expect(mocks.run).toHaveBeenCalledWith({input: {order_id: "order_1"}})

    // Recording the refund resets the collection to completed, so the failure
    // must be applied after it
    const refundOrder = mocks.refundPayment.mock.invocationCallOrder[0]
    const failOrder = mocks.updatePaymentCollections.mock.invocationCallOrder[0]
    const collectionOrder = mocks.run.mock.invocationCallOrder[0]
    expect(refundOrder).toBeLessThan(failOrder)
    expect(failOrder).toBeLessThan(collectionOrder)
  })

  it("only reverses what is still captured after an earlier partial refund", async () => {
    const mocks = makeContainer({
      payment: {
        id: "pay_1",
        currency_code: "eur",
        captures: [{amount: 40.5}],
        refunds: [{id: "ref_0", amount: 10}],
      },
      refundedPayment: {
        id: "pay_1",
        currency_code: "eur",
        captures: [{amount: 40.5}],
        refunds: [
          {id: "ref_0", amount: 10},
          {id: "ref_1", amount: 30.5},
        ],
      },
      transactions: [{reference: "refund", reference_id: "ref_0"}],
    })

    await reverseCapturedPayment(mocks.container, INPUT)

    expect(mocks.refundPayment).toHaveBeenCalledWith({
      payment_id: "pay_1",
      amount: 30.5,
      note: "Pay. chargeback (status -71)",
    })
    // The earlier admin refund already has its transaction
    expect(mocks.addOrderTransactions).toHaveBeenCalledWith([
      expect.objectContaining({amount: -30.5, reference_id: "ref_1"}),
    ])
  })

  it("does not refund again when the payment is already fully reversed, but completes the remaining steps", async () => {
    const mocks = makeContainer({
      payment: {
        id: "pay_1",
        currency_code: "eur",
        captures: [{amount: 40.5}],
        refunds: [{id: "ref_1", amount: 40.5}],
      },
      transactions: [{reference: "refund", reference_id: "ref_1"}],
    })

    await reverseCapturedPayment(mocks.container, INPUT)

    expect(mocks.refundPayment).not.toHaveBeenCalled()
    expect(mocks.addOrderTransactions).not.toHaveBeenCalled()
    expect(mocks.updatePaymentCollections).toHaveBeenCalledWith("paycol_1", {
      status: PaymentCollectionStatus.FAILED,
    })
    expect(mocks.run).toHaveBeenCalledWith({input: {order_id: "order_1"}})
  })

  it("adds the missing order transaction when a previous run stopped after the refund", async () => {
    const mocks = makeContainer({
      payment: {
        id: "pay_1",
        currency_code: "eur",
        captures: [{amount: 40.5}],
        refunds: [{id: "ref_1", amount: 40.5}],
      },
      transactions: [{reference: "capture", reference_id: "capt_1"}],
    })

    await reverseCapturedPayment(mocks.container, INPUT)

    expect(mocks.refundPayment).not.toHaveBeenCalled()
    expect(mocks.addOrderTransactions).toHaveBeenCalledWith([
      {
        order_id: "order_1",
        amount: -40.5,
        currency_code: "eur",
        reference: "refund",
        reference_id: "ref_1",
      },
    ])
  })
})
