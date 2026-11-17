import {ContainerRegistrationKeys, Modules} from "@medusajs/framework/utils"
import {getPayClient} from "../getPayClient"
import {
  buildManualLinkSessionData,
  checkManualPayPaymentLink,
  listManuallyLinkedPayments,
  normalizePayId,
  PAY_MANUAL_LINK_KEY,
  summarizePayPayment,
} from "../manualPayPaymentLink"

jest.mock("../getPayClient", () => ({getPayClient: jest.fn()}))

const PAY_ORDER_ID = "51234567890X1a2b"

const restTransaction = (overrides: Record<string, any> = {}) => ({
  id: "EX-1234-5678-9012",
  orderId: PAY_ORDER_ID,
  reference: "INV-77",
  description: "Payment link",
  amount: {value: 2500, currency: "EUR"},
  amountPaid: {value: 2500, currency: "EUR"},
  amountRefunded: {value: 0, currency: "EUR"},
  status: {code: 100, action: "PAID", phase: "COMPLETED"},
  paymentMethod: {id: 10},
  integration: {testMode: false},
  createdAt: "2026-11-10T10:00:00.000Z",
  ...overrides,
})

const makeOrder = (overrides: Record<string, any> = {}) => ({
  id: "order_1",
  display_id: 1001,
  status: "pending",
  currency_code: "eur",
  summary: {pending_difference: 30},
  payment_collections: [
    {id: "paycol_old", status: "not_paid", created_at: "2026-11-01"},
    {id: "paycol_new", status: "not_paid", created_at: "2026-11-05"},
    {id: "paycol_failed", status: "failed", created_at: "2026-11-06"},
  ],
  ...overrides,
})

function makeContainer({
  order = makeOrder(),
  transaction = restTransaction(),
  user = {email: "dev@shop.test", metadata: {superadmin: true}},
  existingSessions = [] as {id: string; payment_collection_id: string}[],
  testMode = false,
}: {
  order?: Record<string, any> | null
  transaction?: Record<string, any> | null
  user?: Record<string, any> | null
  existingSessions?: {id: string; payment_collection_id: string}[]
  testMode?: boolean
} = {}) {
  const getTransaction = jest.fn(async () => {
    if (!transaction) {
      throw new Error("404")
    }
    return transaction
  })
  const getOrder = jest.fn(async () => {
    throw new Error("404")
  })

  ;(getPayClient as jest.Mock).mockReturnValue({
    client: {getTransaction, getOrder},
    options: {testMode},
  })

  const whereRaw = jest.fn(async () => existingSessions)
  const builder: any = {
    select: () => builder,
    whereNull: () => builder,
    whereRaw,
  }

  const graph = jest.fn(async ({entity}: {entity: string}) => {
    if (entity === "order") {
      return {data: order ? [order] : []}
    }
    if (entity === "payment_collection") {
      return {data: [{id: "paycol_other", order: {display_id: 998}}]}
    }
    return {data: []}
  })

  const registry: Record<string | symbol, any> = {
    [ContainerRegistrationKeys.LOGGER]: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    [ContainerRegistrationKeys.QUERY]: {graph},
    [ContainerRegistrationKeys.PG_CONNECTION]: jest.fn(() => builder),
    [Modules.USER]: {
      retrieveUser: jest.fn(async () => {
        if (!user) {
          throw new Error("not found")
        }
        return user
      }),
    },
  }

  const container: any = {resolve: (key: string) => registry[key]}

  return {container, getTransaction, getOrder, whereRaw, graph}
}

const INPUT = {order_id: "order_1", pay_id: ` ${PAY_ORDER_ID} `, actor_id: "user_1"}

describe("normalizePayId", () => {
  it("trims Pay. ids and rejects anything else", () => {
    expect(normalizePayId("  EX-1234-5678-9012 ")).toBe("EX-1234-5678-9012")
    expect(normalizePayId(PAY_ORDER_ID)).toBe(PAY_ORDER_ID)
    expect(normalizePayId("../orders")).toBeNull()
    expect(normalizePayId("a b")).toBeNull()
    expect(normalizePayId(42)).toBeNull()
  })
})

describe("summarizePayPayment", () => {
  it("reads a REST transaction", () => {
    expect(summarizePayPayment(restTransaction())).toEqual({
      pay_order_id: PAY_ORDER_ID,
      status_code: 100,
      status_label: "paid",
      amount: 25,
      paid: 25,
      refunded: 0,
      currency_code: "eur",
      method_id: 10,
      method_name: "iDEAL",
      reference: "INV-77",
      description: "Payment link",
      created_at: "2026-11-10T10:00:00.000Z",
      test_mode: false,
    })
  })

  it("reads a TGU order", () => {
    const summary = summarizePayPayment({
      id: "tgu-uuid",
      orderId: PAY_ORDER_ID,
      amount: {value: 1999, currency: "EUR"},
      capturedAmount: {value: 1999, currency: "EUR"},
      status: {code: 100},
      payments: [{paymentMethod: {id: 706}}],
      integration: {test: true},
    })

    expect(summary).toMatchObject({
      pay_order_id: PAY_ORDER_ID,
      amount: 19.99,
      paid: 19.99,
      method_id: 706,
      test_mode: true,
    })
  })
})

describe("checkManualPayPaymentLink", () => {
  beforeEach(() => jest.clearAllMocks())

  it("refuses admins without superadmin metadata", async () => {
    const {container} = makeContainer({
      user: {email: "shop@shop.test", metadata: {}},
    })

    await expect(checkManualPayPaymentLink(container, INPUT)).rejects.toThrow(
      "Only superadmins can link Pay. payments to orders"
    )
  })

  it("refuses API key actors", async () => {
    const {container} = makeContainer()

    await expect(
      checkManualPayPaymentLink(container, {...INPUT, actor_type: "api-key"})
    ).rejects.toThrow("Only superadmins")
  })

  it("accepts a paid payment that fits and picks the newest open collection", async () => {
    const {container, getTransaction} = makeContainer()

    const check = await checkManualPayPaymentLink(container, INPUT)

    expect(getTransaction).toHaveBeenCalledWith(PAY_ORDER_ID)
    expect(check.problems).toEqual([])
    expect(check.amount).toBe(25)
    expect(check.payment_collection_id).toBe("paycol_new")
    expect(check.order.outstanding).toBe(30)
    expect(check.linked_by_email).toBe("dev@shop.test")
  })

  it("falls back to the TGU when the REST API does not know the id", async () => {
    const {container, getOrder} = makeContainer({transaction: null})
    getOrder.mockResolvedValueOnce(restTransaction() as never)

    const check = await checkManualPayPaymentLink(container, INPUT)

    expect(getOrder).toHaveBeenCalledWith(PAY_ORDER_ID)
    expect(check.problems).toEqual([])
  })

  it("reports a payment Pay. does not know", async () => {
    const {container} = makeContainer({transaction: null})

    await expect(checkManualPayPaymentLink(container, INPUT)).rejects.toThrow(
      `Pay. payment ${PAY_ORDER_ID} was not found`
    )
  })

  it("creates a new collection when the order has no open one", async () => {
    const {container} = makeContainer({
      order: makeOrder({
        payment_collections: [{id: "paycol_failed", status: "failed"}],
      }),
    })

    const check = await checkManualPayPaymentLink(container, INPUT)

    expect(check.problems).toEqual([])
    expect(check.payment_collection_id).toBeNull()
  })

  it("refuses canceled orders", async () => {
    const {container} = makeContainer({
      order: makeOrder({status: "canceled"}),
    })

    const check = await checkManualPayPaymentLink(container, INPUT)

    expect(check.problems).toContain(
      "The order is canceled, a payment cannot be linked to it."
    )
  })

  it("refuses payments that are not paid, refunded or in another currency", async () => {
    const {container} = makeContainer({
      transaction: restTransaction({
        status: {code: -82},
        amount: {value: 2500, currency: "USD"},
        amountRefunded: {value: 500, currency: "USD"},
      }),
    })

    const {problems} = await checkManualPayPaymentLink(container, INPUT)

    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("partially refunded (status -82)"),
        "The Pay. payment has already been (partly) refunded.",
        "The Pay. payment is in USD, the order in EUR.",
      ])
    )
  })

  it("allows less than outstanding but refuses more", async () => {
    const {container} = makeContainer({
      order: makeOrder({summary: {pending_difference: 20}}),
    })

    const {problems} = await checkManualPayPaymentLink(container, INPUT)

    expect(problems).toEqual([
      "The Pay. payment (25.00) is more than the 20.00 still outstanding on this order.",
    ])
  })

  it("refuses when nothing is outstanding", async () => {
    const {container} = makeContainer({
      order: makeOrder({summary: {pending_difference: 0.004}}),
    })

    const {problems} = await checkManualPayPaymentLink(container, INPUT)

    expect(problems).toEqual(["Nothing is outstanding on this order."])
  })

  it("refuses when another payment is in progress", async () => {
    const {container} = makeContainer({
      order: makeOrder({
        payment_collections: [{id: "paycol_dd", status: "awaiting"}],
      }),
    })

    const {problems} = await checkManualPayPaymentLink(container, INPUT)

    expect(problems).toEqual([
      "The order has a payment in progress (payment collection awaiting), settle or cancel it first.",
    ])
  })

  it("refuses a payment that already belongs to an order", async () => {
    const {container, whereRaw} = makeContainer({
      existingSessions: [{id: "payses_1", payment_collection_id: "paycol_other"}],
    })

    const {problems} = await checkManualPayPaymentLink(container, INPUT)

    expect(whereRaw).toHaveBeenCalledWith(expect.any(String), [
      [PAY_ORDER_ID],
      [PAY_ORDER_ID],
    ])
    expect(problems).toEqual([
      "This Pay. payment already belongs to order #998.",
    ])
  })

  it("refuses test payments on a live shop", async () => {
    const {container} = makeContainer({
      transaction: restTransaction({integration: {testMode: true}}),
    })

    const {problems} = await checkManualPayPaymentLink(container, INPUT)

    expect(problems).toEqual([
      "The Pay. payment is a test payment, it cannot be linked on a live shop.",
    ])
  })
})

describe("buildManualLinkSessionData", () => {
  it("keys the data by Pay.'s order id and records who linked it", async () => {
    const {container} = makeContainer()
    const check = await checkManualPayPaymentLink(container, INPUT)

    const data = buildManualLinkSessionData(
      check,
      INPUT,
      new Date("2026-11-16T12:00:00.000Z")
    )

    expect(data).toMatchObject({
      id: PAY_ORDER_ID,
      orderId: PAY_ORDER_ID,
      pay_id: "EX-1234-5678-9012",
      amount: {value: 2500, currency: "EUR"},
      [PAY_MANUAL_LINK_KEY]: {
        pay_id: PAY_ORDER_ID,
        pay_order_id: PAY_ORDER_ID,
        amount: 25,
        currency_code: "eur",
        method_name: "iDEAL",
        reference: "INV-77",
        linked_by: "user_1",
        linked_by_email: "dev@shop.test",
        linked_at: "2026-11-16T12:00:00.000Z",
      },
    })
  })
})

describe("listManuallyLinkedPayments", () => {
  beforeEach(() => jest.clearAllMocks())

  const orderWithLink = makeOrder({
    payment_collections: [
      {
        payment_sessions: [
          {id: "payses_checkout", data: {orderId: "other"}},
          {
            id: "payses_link",
            data: {
              orderId: PAY_ORDER_ID,
              [PAY_MANUAL_LINK_KEY]: {
                pay_order_id: PAY_ORDER_ID,
                linked_at: "2026-11-16T12:00:00.000Z",
              },
            },
            payment: {
              id: "pay_1",
              captures: [{amount: 25}],
              refunds: [],
            },
          },
        ],
      },
    ],
  })

  it("lists only manually linked payments", async () => {
    const {container, getTransaction} = makeContainer({order: orderWithLink})

    const result = await listManuallyLinkedPayments(container, "order_1", {
      actorId: "user_1",
    })

    expect(getTransaction).not.toHaveBeenCalled()
    expect(result?.can_link).toBe(true)
    expect(result?.payments).toEqual([
      expect.objectContaining({
        payment_session_id: "payses_link",
        payment_id: "pay_1",
        captured: 25,
        refunded: 0,
      }),
    ])
  })

  it("flags a chargeback and refunds Medusa does not know about", async () => {
    const {container} = makeContainer({
      order: orderWithLink,
      transaction: restTransaction({
        status: {code: -71},
        amountRefunded: {value: 2500, currency: "EUR"},
      }),
    })

    const result = await listManuallyLinkedPayments(container, "order_1", {
      live: true,
    })

    expect(result?.can_link).toBe(false)
    expect(result?.payments[0].live?.warnings).toEqual([
      "Pay. reports a chargeback on this payment.",
      "Pay. reports 25.00 refunded, Medusa 0.00.",
    ])
  })

  it("reports no warnings when Pay. and Medusa match", async () => {
    const {container} = makeContainer({order: orderWithLink})

    const result = await listManuallyLinkedPayments(container, "order_1", {
      live: true,
    })

    expect(result?.payments[0].live).toEqual(
      expect.objectContaining({error: null, warnings: []})
    )
  })
})
