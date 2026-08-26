import PayDirectDebitService from "../pay-direct-debit"

const MANDATE_CODE = "IO-1234-5678-9012"
const PAY_TRANSACTION_ID = "52801234567X1001"

function makeService() {
  const logger = {info: jest.fn(), warn: jest.fn(), error: jest.fn()}

  const service = new PayDirectDebitService(
    {logger, event_bus: {emit: jest.fn()}},
    {
      atCode: "AT-TEST-0001",
      apiToken: "test-at-secret",
      slCode: "SL-TEST-0001",
      slSecret: "test-sl-secret",
      returnUrl: "https://shop.test/return",
      medusaUrl: "https://shop.test",
    } as any
  )

  const createDirectDebit = jest.fn()
  const getDirectDebitInfoByMandate = jest.fn()
  const getOrder = jest.fn()
  const getTransaction = jest.fn()
  const refundPayment = jest.fn()
  const abortOrder = jest.fn()
  const deleteDirectDebitMandate = jest.fn()
  ;(service as any).client_ = {
    createDirectDebit,
    getDirectDebitInfoByMandate,
    getOrder,
    getTransaction,
    refundPayment,
    abortOrder,
    deleteDirectDebitMandate,
  }

  return {
    service,
    logger,
    createDirectDebit,
    getDirectDebitInfoByMandate,
    getOrder,
    getTransaction,
    refundPayment,
    abortOrder,
    deleteDirectDebitMandate,
  }
}

function makeOrder(overrides: Record<string, any> = {}) {
  return {
    display_id: 1001,
    currency_code: "eur",
    email: "customer@shop.test",
    metadata: {},
    billing_address: {
      first_name: "John",
      last_name: "Doe",
    },
    sales_channel: {name: "Bold Shop"},
    ...overrides,
  } as any
}

function makeSession(paymentMethodInput: Record<string, any> | undefined) {
  return {
    amount: 40.5,
    data: {paymentMethodInput},
  } as any
}

function directDebitInfo(statusCode: number, overrides: Record<string, any> = {}) {
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

describe("PayDirectDebitService.createPayOrderPayload", () => {
  it("builds the mandate request from the order and payment method input", () => {
    const {service} = makeService()

    const payload = service.createPayOrderPayload(
      makeOrder(),
      makeSession({
        iban: "NL02 ABNA 0123 4567 89",
        accountHolder: "Test Holder",
        email: "input@shop.test",
      })
    )

    expect(payload).toEqual({
      reference: "1001",
      description: "Bold Shop - #1001",
      type: "SINGLE",
      exchangeUrl: "https://shop.test/hooks/pay/pay-direct-debit_pay",
      amount: {value: 4050, currency: "EUR"},
      customer: {
        email: "input@shop.test",
        bankAccount: {
          iban: "NL02ABNA0123456789",
          owner: "Test Holder",
        },
      },
    })
  })

  it("falls back to the company and full name for the owner", () => {
    const {service} = makeService()

    const withCompany = service.createPayOrderPayload(
      makeOrder({
        billing_address: {
          first_name: "John",
          last_name: "Doe",
          company: "ACME B.V.",
        },
      }),
      makeSession({iban: "NL02ABNA0123456789"})
    ) as any

    expect(withCompany.customer.bankAccount.owner).toBe("ACME B.V.")
    expect(withCompany.customer.email).toBe("customer@shop.test")

    const withName = service.createPayOrderPayload(
      makeOrder(),
      makeSession({iban: "NL02ABNA0123456789"})
    ) as any

    expect(withName.customer.bankAccount.owner).toBe("John Doe")
  })

  it("throws when the iban is missing", () => {
    const {service} = makeService()

    expect(() =>
      service.createPayOrderPayload(makeOrder(), makeSession({iban: null}))
    ).toThrow("Bank account number is missing.")

    expect(() =>
      service.createPayOrderPayload(makeOrder(), makeSession(undefined))
    ).toThrow("Bank account number is missing.")
  })
})

describe("PayDirectDebitService.updatePayment", () => {
  it("creates the mandate and stores the response without the payload", async () => {
    const {service, createDirectDebit} = makeService()
    const response = {code: MANDATE_CODE, reference: "1001"}
    createDirectDebit.mockResolvedValue(response)

    const payload = {
      reference: "1001",
      amount: {value: 4050, currency: "EUR"},
    }

    const result = await service.updatePayment({
      data: {session_id: "payses_1", payload},
    } as any)

    expect(createDirectDebit).toHaveBeenCalledWith(payload)
    expect(result.data).toEqual(response)
  })

  it("does not create a second mandate when one already exists", async () => {
    const {service, createDirectDebit} = makeService()

    const result = await service.updatePayment({
      data: {code: MANDATE_CODE, payload: {reference: "1001"}},
    } as any)

    expect(createDirectDebit).not.toHaveBeenCalled()
    expect(result.data).toEqual({code: MANDATE_CODE})
  })

  it("stores a simulated mandate when test mode skips the mandate creation", async () => {
    const {service, createDirectDebit} = makeService()
    createDirectDebit.mockResolvedValue(undefined)

    const result = await service.updatePayment({
      data: {session_id: "payses_1", payload: {reference: "1001"}},
    } as any)

    expect(result.data).toEqual({
      session_id: "payses_1",
      code: "TEST-payses_1",
      testMode: true,
    })
  })

  it("passes data through when no payload is present", async () => {
    const {service, createDirectDebit} = makeService()

    const result = await service.updatePayment({
      data: {code: MANDATE_CODE},
    } as any)

    expect(createDirectDebit).not.toHaveBeenCalled()
    expect(result.data).toEqual({code: MANDATE_CODE})
  })
})

describe("PayDirectDebitService.retrievePayment", () => {
  it("resolves mandate based payments through the mandate code", async () => {
    const {service, getDirectDebitInfoByMandate} = makeService()
    const info = directDebitInfo(91)
    getDirectDebitInfoByMandate.mockResolvedValue(info)

    const result = await service.retrievePayment({
      data: {code: MANDATE_CODE},
    } as any)

    expect(getDirectDebitInfoByMandate).toHaveBeenCalledWith(MANDATE_CODE)
    expect(result.data).toEqual(info)
  })

  it("resolves payments with a Pay. id through the base implementation", async () => {
    const {service, getOrder} = makeService()
    const order = {id: "pay_order_1", status: {code: 100}}
    getOrder.mockResolvedValue(order)

    const result = await service.retrievePayment({
      data: {id: "pay_order_1"},
    } as any)

    expect(getOrder).toHaveBeenCalledWith("pay_order_1")
    expect(result.data).toEqual(order)
  })

  it("returns the data as-is when no id or mandate code is present", async () => {
    const {service} = makeService()

    const result = await service.retrievePayment({
      data: {orderId: undefined, refunded: true},
    } as any)

    expect(result.data).toEqual({orderId: undefined, refunded: true})
  })
})

describe("PayDirectDebitService.capturePayment", () => {
  it("captures when the direct debit is collected", async () => {
    const {service, getDirectDebitInfoByMandate} = makeService()
    const info = directDebitInfo(100)
    getDirectDebitInfoByMandate.mockResolvedValue(info)

    const result = await service.capturePayment({
      data: {code: MANDATE_CODE},
    } as any)

    expect(result.data).toEqual({
      code: MANDATE_CODE,
      orderId: PAY_TRANSACTION_ID,
      amount: {value: 4050, currency: "EUR"},
      status: {code: 100, action: "", phase: ""},
      directdebits: info.directdebits,
    })
  })

  it("throws when the direct debit is not collected", async () => {
    const {service, getDirectDebitInfoByMandate} = makeService()
    getDirectDebitInfoByMandate.mockResolvedValue(directDebitInfo(91))

    await expect(
      service.capturePayment({data: {code: MANDATE_CODE}} as any)
    ).rejects.toThrow("The payment could not be captured.")
  })

  it("throws when no mandate code is present", async () => {
    const {service} = makeService()

    await expect(service.capturePayment({data: {}} as any)).rejects.toThrow(
      "No mandate code found on the payment data"
    )
  })
})

describe("PayDirectDebitService.refundPayment", () => {
  it("refunds through the stored transaction id", async () => {
    const {service, refundPayment, getDirectDebitInfoByMandate} = makeService()
    const refund = {orderId: PAY_TRANSACTION_ID, amount: {value: 1000}}
    refundPayment.mockResolvedValue(refund)

    const result = await service.refundPayment({
      amount: 10,
      data: {
        orderId: PAY_TRANSACTION_ID,
        amount: {value: 4050, currency: "EUR"},
      },
    } as any)

    expect(getDirectDebitInfoByMandate).not.toHaveBeenCalled()
    expect(refundPayment).toHaveBeenCalledWith(PAY_TRANSACTION_ID, {
      amount: {value: 1000, currency: "EUR"},
    })
    expect(result.data).toEqual(refund)
  })

  it("resolves the transaction id from the stored direct debits", async () => {
    const {service, refundPayment} = makeService()
    refundPayment.mockResolvedValue({})

    await service.refundPayment({
      amount: 10,
      data: directDebitInfo(100),
    } as any)

    expect(refundPayment).toHaveBeenCalledWith(PAY_TRANSACTION_ID, {
      amount: {value: 1000, currency: "EUR"},
    })
  })

  it("re-fetches the mandate when no transaction id is stored", async () => {
    const {service, refundPayment, getDirectDebitInfoByMandate} = makeService()
    getDirectDebitInfoByMandate.mockResolvedValue(directDebitInfo(100))
    refundPayment.mockResolvedValue({})

    await service.refundPayment({
      amount: 10,
      data: {code: MANDATE_CODE},
    } as any)

    expect(getDirectDebitInfoByMandate).toHaveBeenCalledWith(MANDATE_CODE)
    expect(refundPayment).toHaveBeenCalledWith(PAY_TRANSACTION_ID, {
      amount: {value: 1000, currency: "EUR"},
    })
  })

  it("throws when no transaction can be resolved", async () => {
    const {service, refundPayment, getDirectDebitInfoByMandate} = makeService()
    getDirectDebitInfoByMandate.mockResolvedValue({directdebits: []})

    await expect(
      service.refundPayment({amount: 10, data: {code: MANDATE_CODE}} as any)
    ).rejects.toThrow(
      "No Pay. transaction found for this direct debit, cannot refund."
    )
    expect(refundPayment).not.toHaveBeenCalled()
  })
})

describe("PayDirectDebitService.cancelPayment", () => {
  it("deletes the mandate at Pay. when the payment holds a mandate code", async () => {
    const {service, deleteDirectDebitMandate} = makeService()
    deleteDirectDebitMandate.mockResolvedValue(undefined)

    const result = await service.cancelPayment({
      data: {code: MANDATE_CODE},
    } as any)

    expect(deleteDirectDebitMandate).toHaveBeenCalledWith(MANDATE_CODE)
    expect(result).toEqual({data: {code: MANDATE_CODE}})
  })

  it("delegates to the order API abort when the payment holds a Pay. order id", async () => {
    const {service, getOrder, abortOrder, deleteDirectDebitMandate} =
      makeService()
    getOrder.mockResolvedValue({status: {code: 20}})
    abortOrder.mockResolvedValue({
      orderId: PAY_TRANSACTION_ID,
      status: {code: 90},
    })

    const result = await service.cancelPayment({
      data: {orderId: PAY_TRANSACTION_ID},
    } as any)

    expect(abortOrder).toHaveBeenCalledWith(PAY_TRANSACTION_ID)
    expect(deleteDirectDebitMandate).not.toHaveBeenCalled()
    expect(result.data).toEqual({
      orderId: PAY_TRANSACTION_ID,
      status: {code: 90},
    })
  })

  it("does not contact Pay. when the payment holds no mandate code", async () => {
    const {service, deleteDirectDebitMandate} = makeService()

    const result = await service.cancelPayment({data: {}} as any)

    expect(deleteDirectDebitMandate).not.toHaveBeenCalled()
    expect(result).toEqual({data: {}})
  })

  it("rethrows when the mandate cannot be deleted, so the cancel is not silently lost", async () => {
    const {service, logger, deleteDirectDebitMandate} = makeService()
    deleteDirectDebitMandate.mockRejectedValue(new Error("mandate not found"))

    await expect(
      service.cancelPayment({data: {code: MANDATE_CODE}} as any)
    ).rejects.toThrow("mandate not found")

    expect(logger.error).toHaveBeenCalled()
  })
})

describe("PayDirectDebitService test mode simulation", () => {
  it("simulates the capture for a test created payment while in test mode", async () => {
    const {service, getDirectDebitInfoByMandate} = makeService()

    const result = await service.capturePayment({
      data: {code: "TEST-payses_1", testMode: true},
    } as any)

    expect(getDirectDebitInfoByMandate).not.toHaveBeenCalled()
    expect((result.data as any).status.code).toBe(100)
  })

  it("fails closed when a test created payment is captured on a production server", async () => {
    const {service, getDirectDebitInfoByMandate} = makeService()
    ;(service as any).options_.testMode = false
    getDirectDebitInfoByMandate.mockResolvedValue({directdebits: []})

    await expect(
      service.capturePayment({
        data: {code: "TEST-payses_1", testMode: true},
      } as any)
    ).rejects.toThrow()
  })

  it("does not query Pay. when retrieving a test created payment", async () => {
    const {service, getDirectDebitInfoByMandate} = makeService()

    const result = await service.retrievePayment({
      data: {code: "TEST-payses_1", testMode: true},
    } as any)

    expect(getDirectDebitInfoByMandate).not.toHaveBeenCalled()
    expect(result.data).toEqual({code: "TEST-payses_1", testMode: true})
  })

  it("does not delete anything at Pay. when canceling a test created payment", async () => {
    const {service, deleteDirectDebitMandate} = makeService()

    const result = await service.cancelPayment({
      data: {code: "TEST-payses_1", testMode: true},
    } as any)

    expect(deleteDirectDebitMandate).not.toHaveBeenCalled()
    expect(result.data).toEqual({code: "TEST-payses_1", testMode: true})
  })

  it("simulates the refund for a test created payment while in test mode", async () => {
    const {service, refundPayment, getDirectDebitInfoByMandate} = makeService()

    const result = await service.refundPayment({
      data: {code: "TEST-payses_1", testMode: true},
      amount: 40.5,
    } as any)

    expect(refundPayment).not.toHaveBeenCalled()
    expect(getDirectDebitInfoByMandate).not.toHaveBeenCalled()
    expect(result.data).toEqual({code: "TEST-payses_1", testMode: true})
  })
})
