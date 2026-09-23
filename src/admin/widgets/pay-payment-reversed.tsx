import {defineWidgetConfig} from "@medusajs/admin-sdk"
import {DetailWidgetProps, HttpTypes} from "@medusajs/framework/types"
import {Alert, Badge, Text} from "@medusajs/ui"
import {useQuery} from "@tanstack/react-query"
import {sdk} from "../lib/sdk.ts"

type PaymentReversal = {
  reversed: boolean
  kind: "chargeback" | "storno" | "failure" | null
  statusCode: number | null
  at: string | null
  amount: number
  currency_code: string | null
  outstanding: number
  payable: boolean
}

const KIND_LABELS: Record<NonNullable<PaymentReversal["kind"]>, string> = {
  chargeback: "Chargeback",
  storno: "Storno",
  failure: "Failed collection",
}

const formatAmount = (amount: number, currency: string | null) => {
  if (!currency) {
    return amount.toFixed(2)
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`
  }
}

const formatDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso))
    : null

/**
 * Medusa can only describe a charged-back or stornoed payment as "refunded",
 * which reads as if the shop refunded the customer. This banner sits above
 * the order and says what actually happened and what is still owed.
 */
const PayPaymentReversedWidget = ({
  data: order,
}: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const {data: reversal} = useQuery<PaymentReversal>({
    queryKey: ["pay-payment-reversal", order.id],
    queryFn: () => sdk.client.fetch(`/admin/pay/orders/${order.id}/reversal`),
  })

  if (!reversal?.reversed) {
    return null
  }

  const kindLabel = reversal.kind ? KIND_LABELS[reversal.kind] : "Reversal"
  const when = formatDate(reversal.at)
  const returned = formatAmount(reversal.amount, reversal.currency_code)
  const outstanding = formatAmount(reversal.outstanding, reversal.currency_code)
  const stillOwed = reversal.outstanding > 0

  return (
    <Alert variant="warning" className="items-start">
      <div className="flex flex-col gap-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Text size="small" leading="compact" weight="plus">
            Payment reversed, action required
          </Text>
          <Badge size="2xsmall" color="orange">
            {kindLabel}
          </Badge>
          {reversal.statusCode !== null && (
            <Badge size="2xsmall" color="grey">
              Pay. status {reversal.statusCode}
            </Badge>
          )}
        </div>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {reversal.kind === "chargeback"
            ? `The customer charged back the Pay. payment${when ? ` on ${when}` : ""}: ${returned} went back to them.`
            : reversal.kind === "storno"
              ? `The customer reversed the direct debit${when ? ` on ${when}` : ""}: ${returned} went back to them.`
              : `The bank did not collect the direct debit${when ? ` (${when})` : ""}: ${returned} was never received.`}{" "}
          {stillOwed
            ? `This order is not paid, ${outstanding} is still outstanding.${
                reversal.payable
                  ? ' Use "Copy payment link" in the summary to let the customer pay again, or mark it as paid once the money arrived another way.'
                  : ""
              }`
            : "The outstanding amount has since been settled."}{" "}
          The "Refunded" payment status is Medusa's wording for the reversal,
          no refund was sent by the shop.
        </Text>
      </div>
    </Alert>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.before",
})

export default PayPaymentReversedWidget
