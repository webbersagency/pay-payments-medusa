import {defineWidgetConfig} from "@medusajs/admin-sdk"
import {DetailWidgetProps, HttpTypes} from "@medusajs/framework/types"
import {
  Alert,
  Badge,
  Button,
  Container,
  Drawer,
  Input,
  Label,
  Text,
  toast,
} from "@medusajs/ui"
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query"
import {useState} from "react"
import {sdk} from "../lib/sdk.ts"

type PayPaymentSummary = {
  pay_order_id: string
  status_code: number | null
  status_label: string | null
  amount: number
  paid: number
  refunded: number
  currency_code: string | null
  method_name: string | null
  reference: string | null
  description: string | null
  created_at: string | null
  test_mode: boolean | null
}

type LinkedPayment = {
  payment_session_id: string
  payment_id: string | null
  link: {
    pay_id: string
    pay_order_id: string
    amount: number
    currency_code: string
    method_name: string | null
    reference: string | null
    linked_by: string
    linked_by_email: string | null
    linked_at: string
  }
  captured: number
  refunded: number
  live?: {
    payment: PayPaymentSummary | null
    error: string | null
    warnings: string[]
  }
}

type LinkedPayments = {
  can_link: boolean
  order_status: string | null
  currency_code: string | null
  outstanding: number
  payments: LinkedPayment[]
}

type LinkPreview = {
  order: {display_id: number | null; outstanding: number; currency_code: string | null}
  payment: PayPaymentSummary
  amount: number
  problems: string[]
  linkable: boolean
}

const WARNING =
  "This payment came from a Pay. payment link and was linked by hand. Pay. does not report changes to it automatically, so a chargeback or a refund made in the Pay. dashboard will not show up here. Check with Pay. when in doubt."

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
    : "-"

const errorMessage = (error: unknown) =>
  (error as {message?: string})?.message ?? "Something went wrong"

const Row = ({label, value}: {label: string; value: React.ReactNode}) => (
  <div className="flex items-center justify-between gap-x-4">
    <Text size="small" leading="compact" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="small" leading="compact" className="truncate text-right">
      {value}
    </Text>
  </div>
)

const queryKey = (orderId: string) => ["pay-linked-payments", orderId]

/**
 * Shows the Pay. payments that were linked to the order by hand (e.g. paid
 * through a Pay. payment link) with a clear note that Pay. does not keep them
 * in sync, and lets superadmins link one by its Pay. id.
 */
const PayLinkedPaymentsWidget = ({
  data: order,
}: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [payId, setPayId] = useState("")
  const [live, setLive] = useState<Record<string, LinkedPayment["live"]>>({})

  const {data, isLoading} = useQuery<LinkedPayments>({
    queryKey: queryKey(order.id),
    queryFn: () =>
      sdk.client.fetch(`/admin/pay/orders/${order.id}/linked-payments`),
  })

  const checkWithPay = useMutation({
    mutationFn: () =>
      sdk.client.fetch<LinkedPayments>(
        `/admin/pay/orders/${order.id}/linked-payments`,
        {query: {live: "true"}}
      ),
    onSuccess: (result) => {
      setLive(
        Object.fromEntries(
          result.payments.map((payment) => [
            payment.payment_session_id,
            payment.live,
          ])
        )
      )
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const preview = useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch<LinkPreview>(
        `/admin/pay/orders/${order.id}/link-payment`,
        {query: {pay_id: id}}
      ),
  })

  const link = useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/pay/orders/${order.id}/link-payment`, {
        method: "POST",
        body: {pay_id: id},
      }),
    onSuccess: async () => {
      toast.success("Pay. payment linked to the order")
      setOpen(false)
      setPayId("")
      preview.reset()
      setLive({})
      await Promise.all([
        queryClient.invalidateQueries({queryKey: queryKey(order.id)}),
        // The dashboard's order detail, summary and payments
        queryClient.invalidateQueries({queryKey: ["orders"]}),
        queryClient.invalidateQueries({queryKey: ["payment_collections"]}),
        queryClient.invalidateQueries({
          queryKey: ["pay-payment-reversal", order.id],
        }),
      ])
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (isLoading || !data) {
    return null
  }

  const canLinkHere =
    data.can_link && data.order_status !== "canceled" && data.outstanding > 0

  if (!data.payments.length && !canLinkHere) {
    return null
  }

  const previewed = preview.data
  const previewMatches = previewed && payId.trim() === preview.variables

  return (
    <Container className="divide-y p-0">
      <div className="flex items-start justify-between gap-x-4 px-6 py-4">
        <div className="flex flex-col gap-y-1">
          <Text size="small" leading="compact" weight="plus">
            Pay. payment links
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {data.payments.length
              ? "Pay. payments linked to this order by hand."
              : "Link a payment made through a Pay. payment link to this order."}
          </Text>
        </div>
        {canLinkHere && (
          <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
            Link payment
          </Button>
        )}
      </div>

      {data.payments.length > 0 && (
        <div className="flex flex-col gap-y-3 px-6 py-4">
          <Alert variant="warning">{WARNING}</Alert>

          {data.payments.map((payment) => {
            const state = live[payment.payment_session_id]
            const currency = payment.link.currency_code || data.currency_code

            return (
              <div
                key={payment.payment_session_id}
                className="flex flex-col gap-y-2 rounded-md border border-ui-border-base p-3"
              >
                <div className="flex items-center justify-between gap-x-2">
                  <Text size="small" leading="compact" className="truncate font-mono">
                    {payment.link.pay_order_id}
                  </Text>
                  <Badge size="2xsmall" color="orange">
                    Linked manually
                  </Badge>
                </div>
                <Row
                  label="Amount"
                  value={formatAmount(payment.link.amount, currency)}
                />
                <Row label="Method" value={payment.link.method_name ?? "-"} />
                {payment.link.reference && (
                  <Row label="Pay. reference" value={payment.link.reference} />
                )}
                <Row
                  label="Linked by"
                  value={payment.link.linked_by_email ?? payment.link.linked_by}
                />
                <Row label="Linked at" value={formatDate(payment.link.linked_at)} />
                {payment.refunded > 0 && (
                  <Row
                    label="Refunded in Medusa"
                    value={formatAmount(payment.refunded, currency)}
                  />
                )}

                {state && (
                  <div className="flex flex-col gap-y-2 border-t border-ui-border-base pt-2">
                    {state.error ? (
                      <Alert variant="error">
                        Could not reach Pay.: {state.error}
                      </Alert>
                    ) : (
                      state.payment && (
                        <>
                          <Row
                            label="Status at Pay."
                            value={`${state.payment.status_label ?? "unknown"} (${state.payment.status_code ?? "-"})`}
                          />
                          <Row
                            label="Refunded at Pay."
                            value={formatAmount(state.payment.refunded, currency)}
                          />
                          {state.warnings.length ? (
                            <Alert variant="error">
                              {state.warnings.join(" ")}
                            </Alert>
                          ) : (
                            <Alert variant="success">
                              Pay. and Medusa match.
                            </Alert>
                          )}
                        </>
                      )
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <div className="flex justify-end">
            <Button
              size="small"
              variant="secondary"
              isLoading={checkWithPay.isPending}
              disabled={checkWithPay.isPending}
              onClick={() => checkWithPay.mutate()}
            >
              Check with Pay.
            </Button>
          </div>
        </div>
      )}

      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            preview.reset()
          }
        }}
      >
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Link Pay. payment</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4 overflow-auto p-4">
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Enter the transaction or order id of a payment made through a Pay.
              payment link. It is checked with Pay. before anything is changed.{" "}
              {formatAmount(data.outstanding, data.currency_code)} is
              outstanding on this order.
            </Text>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="pay-link-id" size="small">
                Pay. id
              </Label>
              <div className="flex gap-x-2">
                <Input
                  id="pay-link-id"
                  size="small"
                  placeholder="e.g. 51234567890X1a2b"
                  value={payId}
                  onChange={(event) => setPayId(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && payId.trim()) {
                      preview.mutate(payId.trim())
                    }
                  }}
                />
                <Button
                  size="small"
                  variant="secondary"
                  disabled={!payId.trim() || preview.isPending}
                  isLoading={preview.isPending}
                  onClick={() => preview.mutate(payId.trim())}
                >
                  Look up
                </Button>
              </div>
            </div>

            {preview.isError && (
              <Alert variant="error">{errorMessage(preview.error)}</Alert>
            )}

            {previewed && previewMatches && (
              <div className="flex flex-col gap-y-3">
                <div className="flex flex-col gap-y-2 rounded-md border border-ui-border-base p-3">
                  <Row
                    label="Pay. order id"
                    value={
                      <span className="font-mono">
                        {previewed.payment.pay_order_id}
                      </span>
                    }
                  />
                  <Row
                    label="Status"
                    value={`${previewed.payment.status_label ?? "unknown"} (${previewed.payment.status_code ?? "-"})`}
                  />
                  <Row
                    label="Amount"
                    value={formatAmount(
                      previewed.amount,
                      previewed.payment.currency_code
                    )}
                  />
                  <Row
                    label="Method"
                    value={previewed.payment.method_name ?? "-"}
                  />
                  <Row
                    label="Reference"
                    value={previewed.payment.reference ?? "-"}
                  />
                  <Row
                    label="Description"
                    value={previewed.payment.description ?? "-"}
                  />
                  <Row
                    label="Created"
                    value={formatDate(previewed.payment.created_at)}
                  />
                  {previewed.payment.test_mode && (
                    <Row label="Mode" value="Test payment" />
                  )}
                </div>

                {previewed.linkable ? (
                  <Alert variant="warning">{WARNING}</Alert>
                ) : (
                  <Alert variant="error">
                    <div className="flex flex-col gap-y-1">
                      <Text size="small" leading="compact" weight="plus">
                        This payment cannot be linked
                      </Text>
                      {previewed.problems.map((problem) => (
                        <Text key={problem} size="small" leading="compact">
                          {problem}
                        </Text>
                      ))}
                    </div>
                  </Alert>
                )}
              </div>
            )}
          </Drawer.Body>
          <Drawer.Footer>
            <div className="flex items-center justify-end gap-x-2">
              <Drawer.Close asChild>
                <Button size="small" variant="secondary">
                  Cancel
                </Button>
              </Drawer.Close>
              <Button
                size="small"
                disabled={
                  !previewed?.linkable || !previewMatches || link.isPending
                }
                isLoading={link.isPending}
                onClick={() => link.mutate(payId.trim())}
              >
                Link payment
              </Button>
            </div>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default PayLinkedPaymentsWidget
