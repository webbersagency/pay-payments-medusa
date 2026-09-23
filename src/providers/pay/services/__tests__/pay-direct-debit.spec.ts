import PayDirectDebitService from "../pay-direct-debit"

const MANDATE_CODE = "IO-1234-5678-9012"
const PAY_TRANSACTION_ID = "52801234567X1001"

function makeService() {
  const logger = {info: jest.fn(), warn: jest.fn(), error: jest.fn()}
  const sessionRetrieve = jest.fn().mockRejectedValue(new Error("no session"))

  const service = new PayDirectDebitService(
    {
      logger,
      event_bus: {emit: jest.fn()},
      paymentSessionService: {retrieve: sessionRetrieve},
    },
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
  const createDirectDebitV3 = jest.fn()
  const getDirectDebitInfoByMandate = jest.fn()
  const getOrder = jest.fn()
  const getTransaction = jest.fn()
  const refundPayment = jest.fn()
  const abortOrder = jest.fn()
  const deleteDirectDebitMandate = jest.fn()
  ;(service as any).client_ = {
    createDirectDebit,
    createDirectDebitV3,
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
    sessionRetrieve,
    createDirectDebit,
    createDirectDebitV3,
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

  it("records the refund without contacting Pay. when the direct debit was stornoed", async () => {
    const {service, logger, refundPayment, getTransaction, getDirectDebitInfoByMandate} =
      makeService()
    getDirectDebitInfoByMandate.mockResolvedValue(directDebitInfo(127))
    const data = {
      code: MANDATE_CODE,
      orderId: PAY_TRANSACTION_ID,
      amount: {value: 4050, currency: "EUR"},
    }

    const result = await service.refundPayment({amount: 40.5, data} as any)

    expect(getDirectDebitInfoByMandate).toHaveBeenCalledWith(MANDATE_CODE)
    expect(getTransaction).not.toHaveBeenCalled()
    expect(refundPayment).not.toHaveBeenCalled()
    expect(result.data).toEqual(data)
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("was reversed (status 127)")
    )
  })

  it("records the refund without contacting Pay. when the direct debit was declined", async () => {
    const {service, refundPayment, getDirectDebitInfoByMandate} = makeService()
    getDirectDebitInfoByMandate.mockResolvedValue(
      directDebitInfo(94, {declined: true})
    )

    await service.refundPayment({
      amount: 40.5,
      data: {code: MANDATE_CODE},
    } as any)

    expect(refundPayment).not.toHaveBeenCalled()
  })

  it("records the refund without contacting Pay. when the transaction was charged back", async () => {
    const {service, refundPayment, getTransaction} = makeService()
    getTransaction.mockResolvedValue({status: {code: -71, action: "CHARGEBACK"}})

    const result = await service.refundPayment({
      amount: 10,
      data: {
        orderId: PAY_TRANSACTION_ID,
        amount: {value: 4050, currency: "EUR"},
      },
    } as any)

    expect(getTransaction).toHaveBeenCalledWith(PAY_TRANSACTION_ID)
    expect(refundPayment).not.toHaveBeenCalled()
    expect(result.data).toEqual({
      orderId: PAY_TRANSACTION_ID,
      amount: {value: 4050, currency: "EUR"},
    })
  })

  it("still refunds when the chargeback check itself fails", async () => {
    const {service, logger, refundPayment, getTransaction} = makeService()
    getTransaction.mockRejectedValue(new Error("timeout"))
    refundPayment.mockResolvedValue({})

    await service.refundPayment({
      amount: 10,
      data: {
        orderId: PAY_TRANSACTION_ID,
        amount: {value: 4050, currency: "EUR"},
      },
    } as any)

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not verify whether Pay. payment")
    )
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

describe("PayDirectDebitService session data fallback", () => {
  const SNAPSHOT = {
    session_id: "payses_1",
    paymentMethodInput: {iban: "NL02ABNA0123456789"},
  }

  it("captures via the mandate stored on the session when the payment only holds the authorize snapshot", async () => {
    const {service, sessionRetrieve, getDirectDebitInfoByMandate} =
      makeService()
    sessionRetrieve.mockResolvedValue({
      id: "payses_1",
      data: {code: MANDATE_CODE},
    })
    getDirectDebitInfoByMandate.mockResolvedValue(directDebitInfo(100))

    const result = await service.capturePayment({data: SNAPSHOT} as any)

    expect(sessionRetrieve).toHaveBeenCalledWith("payses_1", {
      select: ["id", "data"],
    })
    expect(getDirectDebitInfoByMandate).toHaveBeenCalledWith(MANDATE_CODE)
    expect((result.data as any).orderId).toBe(PAY_TRANSACTION_ID)
    expect((result.data as any).code).toBe(MANDATE_CODE)
  })

  it("simulates the capture when the simulated mandate lives on the session", async () => {
    const {service, sessionRetrieve, getDirectDebitInfoByMandate} =
      makeService()
    sessionRetrieve.mockResolvedValue({
      id: "payses_1",
      data: {code: "TEST-payses_1", testMode: true},
    })

    const result = await service.capturePayment({data: SNAPSHOT} as any)

    expect(getDirectDebitInfoByMandate).not.toHaveBeenCalled()
    expect((result.data as any).status.code).toBe(100)
    expect((result.data as any).testMode).toBe(true)
  })

  it("keeps the original error when the session cannot be resolved", async () => {
    const {service, logger} = makeService()

    await expect(
      service.capturePayment({data: SNAPSHOT} as any)
    ).rejects.toThrow("No mandate code found on the payment data")

    expect(logger.warn).toHaveBeenCalled()
  })

  it("revokes the mandate stored on the session when canceling", async () => {
    const {service, sessionRetrieve, deleteDirectDebitMandate} = makeService()
    sessionRetrieve.mockResolvedValue({
      id: "payses_1",
      data: {code: MANDATE_CODE},
    })
    deleteDirectDebitMandate.mockResolvedValue(undefined)

    await service.cancelPayment({data: SNAPSHOT} as any)

    expect(deleteDirectDebitMandate).toHaveBeenCalledWith(MANDATE_CODE)
  })

  it("does not look up the session when the payment data already holds a mandate", async () => {
    const {service, sessionRetrieve, deleteDirectDebitMandate} = makeService()
    deleteDirectDebitMandate.mockResolvedValue(undefined)

    await service.cancelPayment({data: {code: MANDATE_CODE}} as any)

    expect(sessionRetrieve).not.toHaveBeenCalled()
  })
})

describe("PayDirectDebitService v3 opt-in", () => {
  const PAYLOAD = {
    reference: "1001",
    description: "Shop - #1001",
    type: "SINGLE",
    exchangeUrl: "https://shop.test/hooks/pay/pay-direct-debit_pay",
    amount: {value: 4050, currency: "EUR"},
    customer: {
      email: "customer@shop.test",
      bankAccount: {iban: "NL02ABNA0123456789", owner: "John Doe"},
    },
  }

  it("creates the direct debit through the v3 API when directDebitApiVersion is v3 and stores the v2 mandate shape", async () => {
    const {service, createDirectDebit, createDirectDebitV3} = makeService()
    ;(service as any).options_.directDebitApiVersion = "v3"
    createDirectDebitV3.mockResolvedValue({
      request: {result: "1", errorId: "", errorMessage: ""},
      result: MANDATE_CODE,
    })

    const result = await service.updatePayment({
      data: {session_id: "payses_1", payload: PAYLOAD},
    } as any)

    expect(createDirectDebit).not.toHaveBeenCalled()
    expect(createDirectDebitV3).toHaveBeenCalledWith({
      reference: "1001",
      amount: 4050,
      currency: "EUR",
      bankaccountHolder: "John Doe",
      bankaccountNumber: "NL02ABNA0123456789",
      description: "Shop - #1001",
      exchangeUrl: "https://shop.test/hooks/pay/pay-direct-debit_pay",
      email: "customer@shop.test",
    })
    expect(result.data).toEqual({
      code: MANDATE_CODE,
      reference: "1001",
      amount: {value: 4050, currency: "EUR"},
      apiVersion: "v3",
    })
  })

  it("stores the simulated mandate when v3 test mode skips creation", async () => {
    const {service, createDirectDebitV3} = makeService()
    ;(service as any).options_.directDebitApiVersion = "v3"
    createDirectDebitV3.mockResolvedValue(undefined)

    const result = await service.updatePayment({
      data: {session_id: "payses_1", payload: PAYLOAD},
    } as any)

    expect((result.data as any).code).toBe("TEST-payses_1")
    expect((result.data as any).testMode).toBe(true)
  })

  it("uses the v2 mandate API by default", async () => {
    const {service, createDirectDebit, createDirectDebitV3} = makeService()
    createDirectDebit.mockResolvedValue({code: MANDATE_CODE})

    await service.updatePayment({
      data: {session_id: "payses_1", payload: PAYLOAD},
    } as any)

    expect(createDirectDebit).toHaveBeenCalled()
    expect(createDirectDebitV3).not.toHaveBeenCalled()
  })
})
