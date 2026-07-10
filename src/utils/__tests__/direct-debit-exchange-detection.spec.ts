import {
  extractDirectDebit,
  extractDirectDebitReference,
  isDirectDebitTransactionExchange,
  isLegacyDirectDebitAction,
  normalizeDirectDebitStatusAction,
  parseDirectDebitDisplayId,
  readDirectDebitMandateId,
  readDirectDebitReferenceId,
} from "../directDebitExchange"

describe("isLegacyDirectDebitAction", () => {
  it.each(["incassopending", "incassosend", "incassocollected", "incassostorno"])(
    "matches %s",
    (action) => {
      expect(isLegacyDirectDebitAction(action)).toBe(true)
    }
  )

  it("normalizes casing and whitespace", () => {
    expect(isLegacyDirectDebitAction(" IncassoStorno ")).toBe(true)
  })

  it("does not match other actions", () => {
    expect(isLegacyDirectDebitAction("new_ppt")).toBe(false)
    expect(isLegacyDirectDebitAction(undefined)).toBe(false)
    expect(isLegacyDirectDebitAction("")).toBe(false)
  })
})

describe("isDirectDebitTransactionExchange", () => {
  it("matches a flat Incasso payload by payment method name", () => {
    expect(
      isDirectDebitTransactionExchange({
        paymentMethod: {name: "Incasso"},
        status: {code: 94},
      })
    ).toBe(true)
  })

  it("matches a flat Incasso payload by payment method id", () => {
    expect(
      isDirectDebitTransactionExchange({
        paymentMethod: {id: 137},
        status: {code: 100},
      })
    ).toBe(true)
  })

  it("excludes signed order exchanges", () => {
    expect(
      isDirectDebitTransactionExchange({
        type: "order",
        paymentMethod: {id: 137},
        status: {code: 100},
      })
    ).toBe(false)
  })

  it("excludes payloads with an action", () => {
    expect(
      isDirectDebitTransactionExchange({
        action: "incassocollected",
        paymentMethod: {id: 137},
        status: {code: 100},
      })
    ).toBe(false)
  })

  it("requires a status code", () => {
    expect(
      isDirectDebitTransactionExchange({paymentMethod: {id: 137}, status: {}})
    ).toBe(false)
  })

  it("does not match other payment methods or invalid payloads", () => {
    expect(
      isDirectDebitTransactionExchange({
        paymentMethod: {id: 10},
        status: {code: 100},
      })
    ).toBe(false)
    expect(isDirectDebitTransactionExchange(null)).toBe(false)
    expect(isDirectDebitTransactionExchange("payload")).toBe(false)
  })
})

describe("parseDirectDebitDisplayId", () => {
  it("prefers the reference field", () => {
    expect(parseDirectDebitDisplayId({reference: "1001"})).toBe("1001")
  })

  it("falls back to the display id inside the description", () => {
    expect(
      parseDirectDebitDisplayId({description: "Bold Shop - #123"})
    ).toBe("123")
  })

  it("returns null when nothing can be resolved", () => {
    expect(parseDirectDebitDisplayId({})).toBeNull()
    expect(parseDirectDebitDisplayId({description: "no id here"})).toBeNull()
  })
})

describe("payload field variants", () => {
  it("reads referenceId variants", () => {
    expect(readDirectDebitReferenceId({referenceId: "IL-1"})).toBe("IL-1")
    expect(readDirectDebitReferenceId({reference_id: "IL-2"})).toBe("IL-2")
    expect(readDirectDebitReferenceId({referenceid: "IL-3"})).toBe("IL-3")
    expect(readDirectDebitReferenceId({})).toBeNull()
  })

  it("reads mandateId variants", () => {
    expect(readDirectDebitMandateId({mandateId: "IO-1"})).toBe("IO-1")
    expect(readDirectDebitMandateId({mandate_id: "IO-2"})).toBe("IO-2")
    expect(readDirectDebitMandateId({mandateid: "IO-3"})).toBe("IO-3")
    expect(readDirectDebitMandateId({mandateId: "  "})).toBeNull()
  })
})

describe("extractDirectDebit", () => {
  it("returns the first direct debit from an info response", () => {
    const directDebit = {id: "IL-1", status: {code: 100}}

    expect(extractDirectDebit({directdebits: [directDebit]} as any)).toBe(
      directDebit
    )
  })

  it("returns the object itself when it looks like a direct debit", () => {
    const directDebit = {id: "IL-1"}

    expect(extractDirectDebit(directDebit)).toBe(directDebit)
  })

  it("returns null for empty input", () => {
    expect(extractDirectDebit(null)).toBeNull()
    expect(extractDirectDebit({directdebits: []} as any)).toBeNull()
    expect(extractDirectDebit({})).toBeNull()
  })
})

describe("extractDirectDebitReference", () => {
  it("reads the reference from the mandate", () => {
    expect(
      extractDirectDebitReference({}, {mandate: {reference: "1001"}} as any)
    ).toBe("1001")
  })

  it("prefers the direct debit reference", () => {
    expect(
      extractDirectDebitReference({reference: "2"}, {
        reference: "1",
        mandate: {reference: "3"},
      } as any)
    ).toBe("1")
  })
})

describe("normalizeDirectDebitStatusAction", () => {
  it("uses the status action when present", () => {
    expect(normalizeDirectDebitStatusAction("incassostorno", "COLLECTED")).toBe(
      "collected"
    )
  })

  it("strips the incasso prefix from the payload action", () => {
    expect(normalizeDirectDebitStatusAction("incassostorno", undefined)).toBe(
      "storno"
    )
    expect(normalizeDirectDebitStatusAction("incassopending", "")).toBe(
      "pending"
    )
  })
})
