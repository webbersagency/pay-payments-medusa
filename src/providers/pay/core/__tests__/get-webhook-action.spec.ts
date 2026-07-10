import crypto from "crypto"
import {PaymentActions} from "@medusajs/framework/utils"
import PayBase from "../pay-base"
import {PayPaymentStatus} from "../constants"
import {PaymentOptions} from "../../types"

const AT_CODE = "AT-TEST-0001"
const AT_SECRET = "test-at-secret"
const PAY_ORDER_ID = "6a46b5e3-4115-822f-168d-758283631540"
const LEGACY_ORDER_ID = "41811671034X1540"
const REFERENCE = "1001"

class TestPayProvider extends PayBase {
  static identifier = "pay-test"

  get paymentCreateOptions(): PaymentOptions {
    return {} as PaymentOptions
  }
}

function makeProvider() {
  const emit = jest.fn(async () => undefined)
  const logger = {info: jest.fn(), warn: jest.fn(), error: jest.fn()}

  const provider = new TestPayProvider(
    {logger, event_bus: {emit}},
    {
      atCode: AT_CODE,
      apiToken: AT_SECRET,
      slCode: "SL-TEST-0001",
      slSecret: "test-sl-secret",
      returnUrl: "https://shop.test/return",
      medusaUrl: "https://shop.test",
    } as any
  )

  const getOrder = jest.fn()
  const getTransaction = jest.fn()
  ;(provider as any).client_ = {getOrder, getTransaction}

  return {provider, emit, logger, getOrder, getTransaction}
}

function payOrderObject(statusCode: number, paymentMethodId = 706) {
  return {
    id: PAY_ORDER_ID,
    orderId: LEGACY_ORDER_ID,
    reference: REFERENCE,
    amount: {value: 40500, currency: "EUR"},
    status: {code: statusCode, name: "status", action: "STATUS"},
    transferData: {session_id: "payses_1"},
    payments: [{paymentMethod: {id: paymentMethodId}}],
  }
}

function signedPayload(
  object: Record<string, any>,
  headerOverrides: Record<string, string> = {}
) {
  const body = {type: "order", id: object.id, event: "status_changed", object}
  const rawData = JSON.stringify(body)

  return {
    data: body as any,
    rawData,
    headers: {
      "signature-method": "HMAC",
      "signature-keyid": AT_CODE,
      "signature-algorithm": "sha256",
      signature: crypto
        .createHmac("sha256", AT_SECRET)
        .update(rawData)
        .digest("hex"),
      ...headerOverrides,
    },
  }
}

describe("PayBase.getWebhookActionAndData", () => {
  it("maps PAID to SUCCESSFUL without emitting events", async () => {
    const {provider, emit} = makeProvider()

    const result = await provider.getWebhookActionAndData(
      signedPayload(payOrderObject(PayPaymentStatus.PAID))
    )

    expect(result.action).toBe(PaymentActions.SUCCESSFUL)
    expect((result as any).data.session_id).toBe("payses_1")
    expect(emit).not.toHaveBeenCalled()
  })

  it("maps INIT to PENDING", async () => {
    const {provider} = makeProvider()

    const result = await provider.getWebhookActionAndData(
      signedPayload(payOrderObject(PayPaymentStatus.INIT))
    )

    expect(result.action).toBe(PaymentActions.PENDING)
  })

  it("ignores an EXPIRED exchange when the Pay. order is live paid", async () => {
    const {provider, emit, getOrder} = makeProvider()
    getOrder.mockResolvedValue({status: {code: PayPaymentStatus.PAID}})

    const result = await provider.getWebhookActionAndData(
      signedPayload(payOrderObject(PayPaymentStatus.EXPIRED))
    )

    expect(getOrder).toHaveBeenCalledWith(PAY_ORDER_ID)
    expect(result.action).toBe(PaymentActions.SUCCESSFUL)
    expect(emit).not.toHaveBeenCalled()
  })

  it("cancels on an EXPIRED exchange when the Pay. order is live dead", async () => {
    const {provider, emit, getOrder} = makeProvider()
    getOrder.mockResolvedValue({status: {code: PayPaymentStatus.EXPIRED}})

    const result = await provider.getWebhookActionAndData(
      signedPayload(payOrderObject(PayPaymentStatus.EXPIRED))
    )

    expect(result.action).toBe(PaymentActions.CANCELED)
    expect(emit).toHaveBeenCalledWith(
      {name: "pay_payment.canceled", data: {id: REFERENCE}},
      {}
    )
  })

  it("falls back to getTransaction for the live status check", async () => {
    const {provider, getOrder, getTransaction} = makeProvider()
    getOrder.mockRejectedValue(new Error("404"))
    getTransaction.mockResolvedValue({status: {code: PayPaymentStatus.PAID}})

    const result = await provider.getWebhookActionAndData(
      signedPayload(payOrderObject(PayPaymentStatus.CANCEL))
    )

    expect(getTransaction).toHaveBeenCalledWith(LEGACY_ORDER_ID)
    expect(result.action).toBe(PaymentActions.SUCCESSFUL)
  })

  it("keeps the cancel flow when the live status cannot be verified", async () => {
    const {provider, emit, getOrder, getTransaction} = makeProvider()
    getOrder.mockRejectedValue(new Error("down"))
    getTransaction.mockRejectedValue(new Error("down"))

    const result = await provider.getWebhookActionAndData(
      signedPayload(payOrderObject(PayPaymentStatus.EXPIRED))
    )

    expect(result.action).toBe(PaymentActions.CANCELED)
    expect(emit).toHaveBeenCalled()
  })

  it("returns FAILED for a direct debit failure without emitting the cancel event", async () => {
    const {provider, emit, getOrder} = makeProvider()

    const result = await provider.getWebhookActionAndData(
      signedPayload(payOrderObject(PayPaymentStatus.EXPIRED, 137))
    )

    expect(result.action).toBe(PaymentActions.FAILED)
    expect(emit).not.toHaveBeenCalled()
    expect(getOrder).not.toHaveBeenCalled()
  })

  it("ignores a FAILURE exchange when the Pay. order is live paid", async () => {
    const {provider, emit, getOrder} = makeProvider()
    getOrder.mockResolvedValue({status: {code: PayPaymentStatus.PAID}})

    const result = await provider.getWebhookActionAndData(
      signedPayload(payOrderObject(PayPaymentStatus.FAILURE))
    )

    expect(result.action).toBe(PaymentActions.SUCCESSFUL)
    expect(emit).not.toHaveBeenCalled()
  })

  it("treats a CHARGEBACK as FAILED even when the Pay. order is live paid", async () => {
    const {provider, emit, getOrder} = makeProvider()
    getOrder.mockResolvedValue({status: {code: PayPaymentStatus.PAID}})

    const result = await provider.getWebhookActionAndData(
      signedPayload(payOrderObject(PayPaymentStatus.CHARGEBACK))
    )

    expect(result.action).toBe(PaymentActions.FAILED)
    expect(getOrder).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith(
      {
        name: "pay_payment.failed",
        data: {id: REFERENCE, statusCode: PayPaymentStatus.CHARGEBACK},
      },
      {}
    )
  })

  it("re-fetches the payment for a legacy webhook without signature verification", async () => {
    const {provider, getOrder, getTransaction} = makeProvider()
    getOrder.mockRejectedValue(new Error("404"))
    getTransaction.mockResolvedValue(payOrderObject(PayPaymentStatus.PAID))

    const result = await provider.getWebhookActionAndData({
      data: {action: "new_ppt", order_id: LEGACY_ORDER_ID},
      rawData: "",
      headers: {},
    } as any)

    expect(getTransaction).toHaveBeenCalledWith(LEGACY_ORDER_ID)
    expect(result.action).toBe(PaymentActions.SUCCESSFUL)
  })

  it("rejects a tampered signature", async () => {
    const {provider, emit} = makeProvider()

    await expect(
      provider.getWebhookActionAndData(
        signedPayload(payOrderObject(PayPaymentStatus.PAID), {
          signature: "deadbeef".repeat(8),
        })
      )
    ).rejects.toThrow()
    expect(emit).not.toHaveBeenCalled()
  })
})
