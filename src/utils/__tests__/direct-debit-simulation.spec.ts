import {Modules} from "@medusajs/framework/utils"
import {
  buildSimulatedExchangePayload,
  getDirectDebitSimulationState,
  isSimulatedExchangeKey,
  SEPA_TESTING_METADATA_KEY,
  setSepaTestingEnabled,
} from "../directDebitSimulation"

const STATE = {mandateCode: "TEST-payses_1", displayId: "1001"}

describe("buildSimulatedExchangePayload", () => {
  it("fills the mandate and order reference into the preset", () => {
    expect(buildSimulatedExchangePayload("collected", STATE)).toEqual({
      action: "incassocollected",
      mandateId: "TEST-payses_1",
      reference: "1001",
    })
  })

  it("carries an explicit status code for a failed collection", () => {
    expect(buildSimulatedExchangePayload("failed", STATE)).toEqual({
      action: "incassosend",
      status: {code: 106},
      mandateId: "TEST-payses_1",
      reference: "1001",
    })
  })

  it("marks a declined debit", () => {
    expect(buildSimulatedExchangePayload("declined", STATE)).toMatchObject({
      declined: true,
    })
  })

  it("only accepts known presets", () => {
    expect(isSimulatedExchangeKey("storno")).toBe(true)
    expect(isSimulatedExchangeKey("constructor")).toBe(false)
    expect(isSimulatedExchangeKey("refund")).toBe(false)
    expect(isSimulatedExchangeKey(undefined)).toBe(false)
  })
})

describe("getDirectDebitSimulationState", () => {
  function makeContainer(
    order: Record<string, any> | undefined,
    testMode?: boolean,
    // null: the switch was never set (no metadata at all)
    sepaTesting: boolean | null = true
  ) {
    const registry: Record<string | symbol, any> = {
      query: {graph: jest.fn(async () => ({data: order ? [order] : []}))},
      [Modules.STORE]: {
        listStores: jest.fn(async () => [
          {
            id: "store_1",
            metadata:
              sepaTesting === null
                ? null
                : {[SEPA_TESTING_METADATA_KEY]: sepaTesting},
          },
        ]),
      },
      configModule: {
        modules: {
          payment: {
            options: {
              providers: [
                {
                  id: "pay",
                  options: testMode === undefined ? {} : {testMode},
                },
              ],
            },
          },
        },
      },
    }

    return {resolve: (key: string) => registry[key]} as any
  }

  const order = (sessionData: Record<string, any>, captured = false) => ({
    id: "order_1",
    display_id: 1001,
    payment_collections: [
      {
        id: "paycol_1",
        status: "awaiting",
        payment_sessions: [
          {
            provider_id: "pp_pay-direct-debit_pay",
            payment_collection_id: "paycol_1",
            data: sessionData,
            payment: {id: "pay_1", captured_at: captured ? "2026-07-01" : null},
          },
        ],
      },
    ],
  })

  it("is available for a simulated mandate on a test server", async () => {
    const state = await getDirectDebitSimulationState(
      makeContainer(order({code: "TEST-payses_1", testMode: true})),
      "order_1"
    )

    expect(state).toMatchObject({
      available: true,
      testMode: true,
      sepaTesting: true,
      displayId: "1001",
      mandateCode: "TEST-payses_1",
      paymentCollectionId: "paycol_1",
      paymentCollectionStatus: "awaiting",
      captured: false,
    })
    expect(Object.keys(state!.presets)).toEqual([
      "pending",
      "sent",
      "collected",
      "storno",
      "failed",
      "declined",
    ])
  })

  it("is unavailable for a real mandate", async () => {
    const state = await getDirectDebitSimulationState(
      makeContainer(order({code: "IO-1234-5678-9012"}, true)),
      "order_1"
    )

    expect(state).toMatchObject({
      available: false,
      reason: "not_simulated",
      captured: true,
    })
  })

  it("is unavailable when test mode is off", async () => {
    const state = await getDirectDebitSimulationState(
      makeContainer(order({code: "TEST-payses_1", testMode: true}), false),
      "order_1"
    )

    expect(state).toMatchObject({available: false, reason: "test_mode_off"})
  })

  it("is unavailable while SEPA testing is switched off, which is the default", async () => {
    const off = await getDirectDebitSimulationState(
      makeContainer(order({code: "TEST-payses_1", testMode: true}), true, false),
      "order_1"
    )
    const unset = await getDirectDebitSimulationState(
      makeContainer(order({code: "TEST-payses_1", testMode: true}), true, null),
      "order_1"
    )

    expect(off).toMatchObject({
      available: false,
      sepaTesting: false,
      reason: "sepa_testing_off",
      mandateCode: "TEST-payses_1",
    })
    expect(unset).toMatchObject({available: false, reason: "sepa_testing_off"})
  })

  it("is unavailable for orders paid another way", async () => {
    const state = await getDirectDebitSimulationState(
      makeContainer({
        id: "order_1",
        display_id: 1001,
        payment_collections: [
          {
            id: "paycol_1",
            status: "completed",
            payment_sessions: [
              {provider_id: "pp_pay-ideal_pay", payment_collection_id: "paycol_1"},
            ],
          },
        ],
      }),
      "order_1"
    )

    expect(state).toMatchObject({available: false, reason: "no_direct_debit"})
  })

  it("returns null for an unknown order", async () => {
    expect(
      await getDirectDebitSimulationState(makeContainer(undefined), "order_x")
    ).toBeNull()
  })
})

describe("setSepaTestingEnabled", () => {
  it("stores the switch in the store metadata without dropping other keys", async () => {
    const updateStores = jest.fn(async () => undefined)
    const container = {
      resolve: (key: string) =>
        key === Modules.STORE
          ? {
              listStores: jest.fn(async () => [
                {id: "store_1", metadata: {other: "kept"}},
              ]),
              updateStores,
            }
          : undefined,
    } as any

    await expect(setSepaTestingEnabled(container, true)).resolves.toBe(true)

    expect(updateStores).toHaveBeenCalledWith("store_1", {
      metadata: {other: "kept", [SEPA_TESTING_METADATA_KEY]: true},
    })
  })

  it("throws when there is no store", async () => {
    const container = {
      resolve: () => ({listStores: jest.fn(async () => [])}),
    } as any

    await expect(setSepaTestingEnabled(container, true)).rejects.toThrow(
      "No store found"
    )
  })
})
