import {getPaymentReversal} from "../paymentReversal"

const makeContainer = (order: Record<string, any> | undefined) =>
  ({
    resolve: () => ({graph: jest.fn(async () => ({data: order ? [order] : []}))}),
  }) as any

describe("getPaymentReversal", () => {
  it("reports the latest reversal, the returned total and what is still owed", async () => {
    const reversal = await getPaymentReversal(
      makeContainer({
        id: "order_1",
        currency_code: "eur",
        summary: {pending_difference: 40.5},
        payment_collections: [
          {
            id: "paycol_1",
            status: "failed",
            payments: [
              {
                id: "pay_1",
                refunds: [
                  {
                    id: "ref_0",
                    amount: 10,
                    note: "Goodwill",
                    created_at: "2026-09-01T10:00:00Z",
                  },
                  {
                    id: "ref_1",
                    amount: 30.5,
                    note: "Pay. direct debit storno (status 127)",
                    created_at: "2026-09-20T10:00:00Z",
                  },
                ],
              },
            ],
          },
          {id: "paycol_2", status: "not_paid", payments: []},
        ],
      }),
      "order_1"
    )

    expect(reversal).toEqual({
      reversed: true,
      kind: "storno",
      statusCode: 127,
      at: "2026-09-20T10:00:00.000Z",
      amount: 30.5,
      currency_code: "eur",
      outstanding: 40.5,
      payable: true,
    })
  })

  it("is not a reversal when the refunds are ordinary ones", async () => {
    const reversal = await getPaymentReversal(
      makeContainer({
        id: "order_1",
        currency_code: "eur",
        summary: {pending_difference: 0},
        payment_collections: [
          {
            id: "paycol_1",
            status: "completed",
            payments: [{id: "pay_1", refunds: [{id: "ref_0", amount: 10, note: "Goodwill"}]}],
          },
        ],
      }),
      "order_1"
    )

    expect(reversal).toMatchObject({reversed: false, kind: null, amount: 0, payable: false})
  })

  it("handles orders without payments and unknown orders", async () => {
    expect(
      await getPaymentReversal(
        makeContainer({id: "order_1", currency_code: "eur", payment_collections: []}),
        "order_1"
      )
    ).toMatchObject({reversed: false, outstanding: 0})
    expect(await getPaymentReversal(makeContainer(undefined), "order_x")).toBeNull()
  })
})
