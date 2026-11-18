import {PaymentSessionStatus} from "@medusajs/framework/utils"
import PayProviderService from "../../services/pay-provider"
import {PayPaymentStatus} from "../constants"

const PAY_ORDER_ID = "51234567890X1a2b"

function makeService() {
  const logger = {info: jest.fn(), warn: jest.fn(), error: jest.fn()}
  const service = new PayProviderService(
    {
      logger,
      event_bus: {emit: jest.fn()},
      paymentSessionService: {retrieve: jest.fn()},
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

  const paid = {
    orderId: PAY_ORDER_ID,
    status: {code: PayPaymentStatus.PAID},
    amount: {value: 2500, currency: "EUR"},
  }

  const client = {
    getOrder: jest.fn(async () => paid),
    getTransaction: jest.fn(async () => paid),
    captureOrder: jest.fn(),
  }
  ;(service as any).client_ = client

  return {service, client, logger}
}

describe("payment status lookup", () => {
  it("reads the status from the Pay. order", async () => {
    const {service, client} = makeService()

    const result = await service.getPaymentStatus({
      data: {id: PAY_ORDER_ID},
    } as any)

    expect(result.status).toBe(PaymentSessionStatus.CAPTURED)
    expect(client.getOrder).toHaveBeenCalledWith(PAY_ORDER_ID)
    expect(client.getTransaction).not.toHaveBeenCalled()
  })

  it("falls back to the REST transaction when the order is unknown", async () => {
    const {service, client} = makeService()
    client.getOrder.mockRejectedValue(new Error("404"))
    client.getTransaction.mockResolvedValue({
      status: {code: PayPaymentStatus.AUTHORIZE},
    } as any)

    const result = await service.getPaymentStatus({
      data: {id: PAY_ORDER_ID},
    } as any)

    expect(result.status).toBe(PaymentSessionStatus.AUTHORIZED)
    expect(client.getTransaction).toHaveBeenCalledWith(PAY_ORDER_ID)
  })

  it("throws when Pay. knows the payment on neither API", async () => {
    const {service, client, logger} = makeService()
    client.getOrder.mockRejectedValue(new Error("404"))
    client.getTransaction.mockRejectedValue(new Error("403"))

    await expect(
      service.getPaymentStatus({data: {id: PAY_ORDER_ID}} as any)
    ).rejects.toThrow("403")
    expect(logger.error).toHaveBeenCalled()
  })

  it("captures a paid payment the REST API refuses to return", async () => {
    const {service, client} = makeService()
    client.getTransaction.mockRejectedValue(new Error("403"))

    const result = await service.capturePayment({
      data: {id: PAY_ORDER_ID, orderId: PAY_ORDER_ID},
    } as any)

    expect(result.data).toMatchObject({orderId: PAY_ORDER_ID})
    expect(client.captureOrder).not.toHaveBeenCalled()
    expect(client.getTransaction).not.toHaveBeenCalled()
  })
})
