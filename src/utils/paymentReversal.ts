import {ContainerRegistrationKeys, MathBN} from "@medusajs/framework/utils"
import {MedusaContainer} from "@medusajs/types"
import {
  parsePayReversalNote,
  PaymentReversalKind,
} from "./reverseCapturedPayment"

export type PaymentReversal = {
  /** Whether a Pay. chargeback / storno reversed a captured payment */
  reversed: boolean
  kind: PaymentReversalKind | null
  statusCode: number | null
  /** When the (latest) reversal was recorded */
  at: string | null
  /** Total amount that went back to the customer */
  amount: number
  currency_code: string | null
  /** What the customer still owes on the order */
  outstanding: number
  /** Whether a not_paid payment collection exists to collect it with */
  payable: boolean
}

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined || value === "") {
    return 0
  }

  const numeric = Number(value)

  return Number.isFinite(numeric) ? numeric : 0
}

/**
 * Finds the reversal reverseCapturedPayment recorded on an order, recognised
 * by the note on the refund. Used by the "payment reversed" order banner,
 * since Medusa's own payment status can only say "refunded" for it.
 */
export async function getPaymentReversal(
  container: MedusaContainer,
  orderId: string
): Promise<PaymentReversal | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "currency_code",
      "summary",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.payments.id",
      "payment_collections.payments.refunds.id",
      "payment_collections.payments.refunds.amount",
      "payment_collections.payments.refunds.note",
      "payment_collections.payments.refunds.created_at",
    ],
    filters: {id: orderId},
  })

  if (!order) {
    return null
  }

  const collections = ((order as any).payment_collections ?? []) as Record<
    string,
    any
  >[]

  const reversals = collections
    .flatMap((collection) => collection?.payments ?? [])
    .flatMap((payment: Record<string, any>) => payment?.refunds ?? [])
    .map((refund: Record<string, any>) => ({
      refund,
      parsed: parsePayReversalNote(refund?.note),
    }))
    .filter((entry) => entry.parsed !== null)
    .sort(
      (a, b) =>
        new Date(b.refund.created_at ?? 0).getTime() -
        new Date(a.refund.created_at ?? 0).getTime()
    )

  const summary = ((order as any).summary ?? {}) as Record<string, any>
  const outstanding = toNumber(summary.pending_difference)
  const payable = collections.some(
    (collection) => collection?.status === "not_paid"
  )

  if (!reversals.length) {
    return {
      reversed: false,
      kind: null,
      statusCode: null,
      at: null,
      amount: 0,
      currency_code: (order as any).currency_code ?? null,
      outstanding,
      payable,
    }
  }

  const latest = reversals[0]
  const amount = reversals.reduce(
    (total, entry) => MathBN.add(total, entry.refund.amount ?? 0),
    MathBN.convert(0)
  )

  return {
    reversed: true,
    kind: latest.parsed!.kind,
    statusCode: latest.parsed!.statusCode,
    at: latest.refund.created_at
      ? new Date(latest.refund.created_at).toISOString()
      : null,
    amount: toNumber(amount.toString()),
    currency_code: (order as any).currency_code ?? null,
    outstanding,
    payable,
  }
}
