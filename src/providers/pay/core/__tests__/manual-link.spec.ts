import PayProviderService from "../../services/pay-provider"
import {PAY_MANUAL_LINK_KEY} from "../constants"

const PAY_ORDER_ID = "51234567890X1a2b"
const LINK = {pay_order_id: PAY_ORDER_ID, linked_by: "user_1"}

function makeService() {
  const service = new PayProviderService(
    {
      logger: {info: jest.fn(), warn: jest.fn(), error: jest.fn()},
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
    status: {code: 100},
    amount: {value: 2500, currency: "EUR"},
  }

  const client = {
    getOrder: jest.fn(async () => paid),
    getTransaction: jest.fn(async () => paid),
    abortOrder: jest.fn(async () => ({orderId: PAY_ORDER_ID})),
    captureOrder: jest.fn(),
  }
  ;(service as any).client_ = client

  return {service, client}
}

describe("manually linked Pay. payments", () => {
  it("are never aborted at Pay. when canceled in Medusa", async () => {
    const {service, client} = makeService()

    const result = await service.cancelPayment({
      data: {orderId: PAY_ORDER_ID, [PAY_MANUAL_LINK_KEY]: LINK},
    } as any)

    expect(client.getOrder).not.toHaveBeenCalled()
    expect(client.abortOrder).not.toHaveBeenCalled()
    expect(result.data?.[PAY_MANUAL_LINK_KEY]).toEqual(LINK)
  })

  it("keep their marker through capture", async () => {
    const {service, client} = makeService()

    const result = await service.capturePayment({
      data: {
        id: PAY_ORDER_ID,
        orderId: PAY_ORDER_ID,
        [PAY_MANUAL_LINK_KEY]: LINK,
      },
    } as any)

    expect(client.captureOrder).not.toHaveBeenCalled()
    expect(result.data).toMatchObject({
      orderId: PAY_ORDER_ID,
      [PAY_MANUAL_LINK_KEY]: LINK,
    })
  })

  it("still abort regular payments", async () => {
    const {service, client} = makeService()
    client.getOrder.mockResolvedValueOnce({
      orderId: PAY_ORDER_ID,
      status: {code: 20},
    } as any)

    await service.cancelPayment({data: {orderId: PAY_ORDER_ID}} as any)

    expect(client.abortOrder).toHaveBeenCalledWith(PAY_ORDER_ID)
  })

  it("release a payment Pay. canceled instead of capturing it", async () => {
    const {service, client} = makeService()
    const expired = {
      id: "tgu-uuid-1",
      orderId: PAY_ORDER_ID,
      reference: "200192131",
      status: {code: -80},
    }
    client.getOrder.mockResolvedValue(expired as any)
    const emit = (service as any).eventBusService_.emit as jest.Mock

    await expect(
      service.capturePayment({data: {orderId: PAY_ORDER_ID}} as any)
    ).rejects.toThrow(/canceled or has expired/)

    expect(client.captureOrder).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith(
      {
        name: "pay_payment.canceled",
        data: {
          id: "200192131",
          pay_order_ids: [PAY_ORDER_ID, "tgu-uuid-1", PAY_ORDER_ID],
        },
      },
      {}
    )
  })

  it("keep the session data on an update without payload", async () => {
    const {service, client} = makeService()
    ;(client as any).createOrder = jest.fn()

    const result = await service.updatePayment({
      data: {orderId: PAY_ORDER_ID},
    } as any)

    expect((client as any).createOrder).not.toHaveBeenCalled()
    expect(result.data).toEqual({orderId: PAY_ORDER_ID})
  })
})
