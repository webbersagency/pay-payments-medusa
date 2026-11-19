import {
  ContainerRegistrationKeys,
  Modules,
  PaymentCollectionStatus,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import {
  isCheckoutPaymentCollection,
  releaseCanceledPayPayment,
} from "../releaseCanceledPayPayment"
import {PAY_MANUAL_LINK_KEY} from "../../providers/pay/core/constants"

const PAY_ID = "3682804866Xf84b3"

type Session = Record<string, any>

function makeContainer({
  sessions,
  collection,
  cartLinks = [],
}: {
  sessions: Session[]
  collection?: Record<string, any>
  cartLinks?: Record<string, any>[]
}) {
  const knexRows = sessions.map((session) => ({
    id: session.id,
    payment_collection_id: session.payment_collection_id,
  }))

  const knexQuery: any = {
    select: () => knexQuery,
    whereNull: () => knexQuery,
    whereRaw: async () => knexRows,
  }

  const paymentModule = {
    listPaymentSessions: jest.fn(async () => sessions),
    cancelPayment: jest.fn(async () => undefined),
    updatePaymentSession: jest.fn(async () => undefined),
    retrievePaymentCollection: jest.fn(async () => collection),
    updatePaymentCollections: jest.fn(async () => undefined),
  }

  const graph = jest.fn(async () => ({data: cartLinks}))

  const registry: Record<string, any> = {
    [ContainerRegistrationKeys.LOGGER]: {info: jest.fn(), warn: jest.fn()},
    [ContainerRegistrationKeys.PG_CONNECTION]: () => knexQuery,
    [ContainerRegistrationKeys.QUERY]: {graph},
    [Modules.PAYMENT]: paymentModule,
  }

  return {
    container: {resolve: (key: string) => registry[key]} as any,
    paymentModule,
    graph,
  }
}

const hostedSession = (overrides: Session = {}): Session => ({
  id: "payses_retry",
  provider_id: "pp_pay-hosted-checkout_pay",
  payment_collection_id: "paycol_retry",
  status: PaymentSessionStatus.AUTHORIZED,
  amount: 80.75,
  currency_code: "eur",
  data: {orderId: PAY_ID, links: {checkout: "https://pay.test/x"}},
  payment: {id: "pay_retry", canceled_at: null, captured_at: null, captures: []},
  ...overrides,
})

describe("releaseCanceledPayPayment", () => {
  it("cancels the payment, marks the session canceled and reopens the collection", async () => {
    const {container, paymentModule} = makeContainer({
      sessions: [hostedSession()],
      collection: {
        id: "paycol_retry",
        status: PaymentCollectionStatus.AUTHORIZED,
        payment_sessions: [{status: PaymentSessionStatus.CANCELED}],
        payments: [{captured_at: null, captures: []}],
      },
    })

    const result = await releaseCanceledPayPayment(container, [PAY_ID])

    expect(paymentModule.cancelPayment).toHaveBeenCalledWith("pay_retry")
    expect(paymentModule.updatePaymentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "payses_retry",
        status: PaymentSessionStatus.CANCELED,
        data: {orderId: PAY_ID, links: {checkout: "https://pay.test/x"}},
      })
    )
    expect(paymentModule.updatePaymentCollections).toHaveBeenCalledWith(
      "paycol_retry",
      {status: PaymentCollectionStatus.NOT_PAID}
    )
    expect(result).toEqual({
      payment_collection_ids: ["paycol_retry"],
      released: [
        {
          payment_session_id: "payses_retry",
          payment_collection_id: "paycol_retry",
          payment_id: "pay_retry",
          direct_debit: false,
        },
      ],
    })
  })

  it("releases a direct debit only when asked to", async () => {
    const directDebit = hostedSession({
      id: "payses_dd",
      provider_id: "pp_pay-direct-debit_pay",
      status: PaymentSessionStatus.AUTHORIZED,
      payment: {id: "pay_dd", canceled_at: null, captured_at: null, captures: []},
    })
    const collection = {
      id: "paycol_retry",
      status: PaymentCollectionStatus.AWAITING,
      payment_sessions: [{status: PaymentSessionStatus.CANCELED}],
      payments: [{captured_at: null, captures: []}],
    }

    const skipped = makeContainer({sessions: [directDebit], collection})
    await expect(
      releaseCanceledPayPayment(skipped.container, [PAY_ID])
    ).resolves.toMatchObject({released: []})
    expect(skipped.paymentModule.cancelPayment).not.toHaveBeenCalled()

    const released = makeContainer({sessions: [directDebit], collection})
    const result = await releaseCanceledPayPayment(released.container, [PAY_ID], {
      includeDirectDebit: true,
    })

    expect(released.paymentModule.cancelPayment).toHaveBeenCalledWith("pay_dd")
    expect(released.paymentModule.updatePaymentCollections).toHaveBeenCalledWith(
      "paycol_retry",
      {status: PaymentCollectionStatus.NOT_PAID}
    )
    expect(result.released).toEqual([
      {
        payment_session_id: "payses_dd",
        payment_collection_id: "paycol_retry",
        payment_id: "pay_dd",
        direct_debit: true,
      },
    ])
  })

  it("is idempotent for an already released payment", async () => {
    const {container, paymentModule} = makeContainer({
      sessions: [
        hostedSession({
          status: PaymentSessionStatus.CANCELED,
          payment: {id: "pay_retry", canceled_at: "2026-11-19", captures: []},
        }),
      ],
      collection: {
        id: "paycol_retry",
        status: PaymentCollectionStatus.NOT_PAID,
        payment_sessions: [{status: PaymentSessionStatus.CANCELED}],
        payments: [],
      },
    })

    await releaseCanceledPayPayment(container, [PAY_ID])

    expect(paymentModule.cancelPayment).not.toHaveBeenCalled()
    expect(paymentModule.updatePaymentSession).not.toHaveBeenCalled()
    expect(paymentModule.updatePaymentCollections).not.toHaveBeenCalled()
  })

  it("keeps the collection status when another session is still authorized", async () => {
    const {container, paymentModule} = makeContainer({
      sessions: [hostedSession()],
      collection: {
        id: "paycol_retry",
        status: PaymentCollectionStatus.AUTHORIZED,
        payment_sessions: [
          {status: PaymentSessionStatus.CANCELED},
          {status: PaymentSessionStatus.AUTHORIZED},
        ],
        payments: [],
      },
    })

    await releaseCanceledPayPayment(container, [PAY_ID])

    expect(paymentModule.cancelPayment).toHaveBeenCalled()
    expect(paymentModule.updatePaymentCollections).not.toHaveBeenCalled()
  })

  it.each([
    ["captured", {payment: {id: "pay_1", captured_at: "2026-11-01", captures: [{id: "capt_1"}]}}],
    ["direct debit", {provider_id: "pp_pay-direct-debit_pay"}],
    ["manually linked", {data: {orderId: PAY_ID, [PAY_MANUAL_LINK_KEY]: {linked_by: "user_1"}}}],
  ])("leaves a %s payment alone", async (_label, overrides) => {
    const {container, paymentModule} = makeContainer({
      sessions: [hostedSession(overrides)],
    })

    const result = await releaseCanceledPayPayment(container, [PAY_ID])

    expect(result.released).toEqual([])
    expect(result.payment_collection_ids).toEqual(["paycol_retry"])
    expect(paymentModule.cancelPayment).not.toHaveBeenCalled()
    expect(paymentModule.updatePaymentSession).not.toHaveBeenCalled()
  })

  it("does nothing when no session holds the Pay. payment", async () => {
    const {container, paymentModule} = makeContainer({sessions: []})

    const result = await releaseCanceledPayPayment(container, [PAY_ID])

    expect(result).toEqual({payment_collection_ids: [], released: []})
    expect(paymentModule.listPaymentSessions).not.toHaveBeenCalled()
  })
})

describe("isCheckoutPaymentCollection", () => {
  it("is true for the cart's payment collection", async () => {
    const {container} = makeContainer({
      sessions: [],
      cartLinks: [{cart_id: "cart_1"}],
    })

    await expect(
      isCheckoutPaymentCollection(container, ["paycol_1"])
    ).resolves.toBe(true)
  })

  it("is false for an order-level retry collection", async () => {
    const {container} = makeContainer({sessions: []})

    await expect(
      isCheckoutPaymentCollection(container, ["paycol_retry"])
    ).resolves.toBe(false)
  })
})
