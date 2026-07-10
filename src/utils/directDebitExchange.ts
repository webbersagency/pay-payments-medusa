import {DirectDebit, DirectDebitInfoResponse} from "../providers/pay/types"
import {PayDirectDebitStatusCode} from "../providers/pay/core/constants"

export const PAY_DIRECT_DEBIT_EXCHANGE_EVENT =
  "pay_payment.direct_debit_exchange"

const LEGACY_DIRECT_DEBIT_ACTIONS = new Set([
  "incassopending",
  "incassosend",
  "incassocollected",
  "incassostorno",
])

export const DIRECT_DEBIT_FAILED_CODES = new Set<number>([
  PayDirectDebitStatusCode.FAILED,
  PayDirectDebitStatusCode.STORNO,
])

export const DIRECT_DEBIT_AWAITING_CODES = new Set<number>([
  PayDirectDebitStatusCode.PENDING,
  PayDirectDebitStatusCode.SENT,
  PayDirectDebitStatusCode.PROCESSING,
])

export function normalizeAction(action: unknown): string {
  return typeof action === "string" ? action.trim().toLowerCase() : ""
}

export function readPayloadString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function isLegacyDirectDebitAction(action: unknown): boolean {
  return LEGACY_DIRECT_DEBIT_ACTIONS.has(normalizeAction(action))
}

export function readDirectDebitReferenceId(
  payload: Record<string, any>
): string | null {
  return readPayloadString(
    payload?.referenceId ?? payload?.reference_id ?? payload?.referenceid
  )
}

export function readDirectDebitMandateId(
  payload: Record<string, any>
): string | null {
  return readPayloadString(
    payload?.mandateId ?? payload?.mandate_id ?? payload?.mandateid
  )
}

/**
 * Detects the one-off direct debit (Incasso) transaction exchange that Pay.
 * sends for mandates created via /directdebits/mandates. Unlike the
 * interactive checkout exchange it has no top-level type "order" and no
 * action, it is a flat transaction payload with paymentMethod.name "Incasso"
 * (method id 137) and the order display id only inside description
 * ("Shop - #123"). The interactive type "order" exchange is handled by the
 * regular webhook flow, so it is explicitly excluded here.
 */
export function isDirectDebitTransactionExchange(payload: any): boolean {
  if (!payload || typeof payload !== "object") {
    return false
  }

  if (payload.type === "order" || payload.action) {
    return false
  }

  const paymentMethod = payload.paymentMethod
  const isIncasso =
    paymentMethod?.name === "Incasso" || paymentMethod?.id === 137
  const hasStatusCode =
    payload.status?.code !== undefined && payload.status?.code !== null

  return isIncasso && hasStatusCode
}

export function parseDirectDebitDisplayId(
  payload: Record<string, any>
): string | null {
  const fromReference = readPayloadString(payload?.reference)

  if (fromReference) {
    return fromReference
  }

  const description =
    typeof payload?.description === "string" ? payload.description : ""
  const match = description.match(/#\s*(\d+)/)

  return match ? match[1] : null
}

/**
 * GET /directdebits/{id} returns a bare direct debit object while the mandate
 * query returns a paginated envelope, this normalizes both to one direct debit.
 */
export function extractDirectDebit(
  info?: DirectDebitInfoResponse | DirectDebit | Record<string, any> | null
): DirectDebit | null {
  if (!info) {
    return null
  }

  const data = info as Record<string, any>

  if (Array.isArray(data.directdebits)) {
    return data.directdebits[0] ?? null
  }

  if (data.id || data.reference) {
    return data as DirectDebit
  }

  return null
}

export function extractDirectDebitReference(
  info: DirectDebitInfoResponse | DirectDebit | Record<string, any> | null,
  directDebit: DirectDebit | Record<string, any> | null
): string | null {
  const data = (info ?? {}) as Record<string, any>
  const reference =
    (directDebit as Record<string, any>)?.reference ??
    directDebit?.mandate?.reference ??
    data.reference ??
    data.mandate?.reference

  return readPayloadString(reference)
}

export function normalizeDirectDebitStatusAction(
  payloadAction: string,
  statusAction?: string
): string {
  const normalizedStatusAction = normalizeAction(statusAction)

  if (normalizedStatusAction) {
    return normalizedStatusAction
  }

  return payloadAction.replace(/^incasso/, "")
}
