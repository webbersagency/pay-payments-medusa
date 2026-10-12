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

  describe("once the reversal was paid again", () => {
    const settledOrder = (pendingDifference: number | string) =>
      makeContainer({
        id: "order_1",
        currency_code: "eur",
        summary: {pending_difference: pendingDifference},
        payment_collections: [
          {
            id: "paycol_1",
            status: "failed",
            payments: [
              {
                id: "pay_1",
                refunds: [
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
          {id: "paycol_2", status: "completed", payments: [{id: "pay_2", refunds: []}]},
        ],
      })

    it("reports nothing outstanding after an exact capture (mark as paid)", async () => {
      expect(await getPaymentReversal(settledOrder(0), "order_1")).toMatchObject({
        reversed: true,
        kind: "storno",
        amount: 30.5,
        outstanding: 0,
        payable: false,
      })
    })

    it("ignores the sub-cent remainder a whole-cent Pay. capture leaves behind", async () => {
      // Pay. charged 30.50 on a 30.5042 collection, or 30.50 on a 30.4958 one
      const under = await getPaymentReversal(settledOrder("0.0042"), "order_1")
      const over = await getPaymentReversal(settledOrder(-0.0042), "order_1")

      expect(under!.outstanding).toBe(0)
      expect(over!.outstanding).toBe(0)
    })

    it("keeps an overpayment negative, which still counts as settled", async () => {
      expect(
        (await getPaymentReversal(settledOrder(-5.25), "order_1"))!.outstanding
      ).toBe(-5.25)
    })

    it("still reports a remainder of a cent or more as outstanding", async () => {
      expect(
        (await getPaymentReversal(settledOrder(0.01), "order_1"))!.outstanding
      ).toBe(0.01)
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
