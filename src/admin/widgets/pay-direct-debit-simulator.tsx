import {defineWidgetConfig} from "@medusajs/admin-sdk"
import {DetailWidgetProps, HttpTypes} from "@medusajs/framework/types"
import {Badge, Button, Container, Text, toast} from "@medusajs/ui"
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query"
import {sdk} from "../lib/sdk.ts"

type PresetKey =
  | "pending"
  | "sent"
  | "collected"
  | "storno"
  | "failed"
  | "declined"

type SimulationState = {
  visible: boolean
  available?: boolean
  testMode?: boolean
  mandateCode?: string | null
  paymentCollectionStatus?: string | null
  captured?: boolean
  presets?: Record<PresetKey, {label: string; description: string}>
}

const PRESET_ORDER: PresetKey[] = [
  "pending",
  "sent",
  "collected",
  "storno",
  "failed",
  "declined",
]

const statusColor = (
  status?: string | null
): "green" | "red" | "orange" | "grey" => {
  switch (status) {
    case "completed":
    case "authorized":
      return "green"
    case "failed":
    case "canceled":
      return "red"
    case "awaiting":
      return "orange"
    default:
      return "grey"
  }
}

const queryKey = (orderId: string) => ["pay-direct-debit-simulation", orderId]

/**
 * Lets superadmins walk a test mode direct debit through the exchanges Pay.
 * would send (collected, storno, ...), see README "Testing direct debits
 * locally". Rendered only when the server says the order qualifies.
 */
const PayDirectDebitSimulatorWidget = ({
  data: order,
}: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const queryClient = useQueryClient()

  const {data: state, isLoading} = useQuery<SimulationState>({
    queryKey: queryKey(order.id),
    queryFn: () =>
      sdk.client.fetch(`/admin/pay/orders/${order.id}/direct-debit`),
  })

  const simulate = useMutation({
    mutationFn: (action: PresetKey) =>
      sdk.client.fetch<SimulationState>(
        `/admin/pay/orders/${order.id}/direct-debit/exchange`,
        {method: "POST", body: {action}}
      ),
    onSuccess: async (_result, action) => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: queryKey(order.id)}),
        // The dashboard's order detail, summary and payments
        queryClient.invalidateQueries({queryKey: ["orders"]}),
        queryClient.invalidateQueries({queryKey: ["payment_collections"]}),
      ])
      toast.success(`Simulated "${state?.presets?.[action].label ?? action}"`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  if (isLoading || !state?.visible) {
    return null
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-start justify-between gap-x-4 px-6 py-4">
        <div className="flex flex-col gap-y-1">
          <Text size="small" leading="compact" weight="plus">
            Pay. direct debit simulator
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Test mode. This mandate only exists on this server, pick the
            exchange Pay. would send for it.
          </Text>
        </div>
        <Badge size="2xsmall" color={statusColor(state.paymentCollectionStatus)}>
          {state.paymentCollectionStatus ?? "unknown"}
        </Badge>
      </div>

      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div className="flex items-center justify-between gap-x-4">
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Mandate
          </Text>
          <Text size="small" leading="compact" className="truncate font-mono">
            {state.mandateCode}
          </Text>
        </div>
        <div className="flex items-center justify-between gap-x-4">
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Payment
          </Text>
          <Text size="small" leading="compact">
            {state.captured ? "Captured" : "Not captured"}
          </Text>
        </div>
      </div>

      <div className="flex flex-col gap-y-2 px-6 py-4">
        {PRESET_ORDER.map((key) => {
          const preset = state.presets?.[key]

          if (!preset) {
            return null
          }

          return (
            <div
              key={key}
              className="flex items-center justify-between gap-x-4"
            >
              <Text
                size="small"
                leading="compact"
                className="text-ui-fg-subtle"
              >
                {preset.description}
              </Text>
              <Button
                size="small"
                variant="secondary"
                className="shrink-0"
                disabled={simulate.isPending}
                isLoading={simulate.isPending && simulate.variables === key}
                onClick={() => simulate.mutate(key)}
              >
                {preset.label}
              </Button>
            </div>
          )
        })}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default PayDirectDebitSimulatorWidget
