import {
  Button,
  Container,
  createDataTableColumnHelper,
  DataTable,
  Heading,
  Text,
  toast,
  useDataTable,
} from "@medusajs/ui"
import {defineRouteConfig} from "@medusajs/admin-sdk"
import PayLogo from "../../../shared/icons/pay-logo.tsx"
import {sdk} from "../../../lib/sdk.ts"
import {useQuery} from "@tanstack/react-query"
import {displayName, version} from "../../../../../package.json"
import {useMemo} from "react"
import {GetConfigResponse} from "../../../../providers/pay/types"
import getSortedPaymentMethods from "../../../../providers/pay/utils/getSortedPaymentMethods.ts"

type PaymentMethod = {
  id: string
  name: string
  minAmount: string
  maxAmount: string
}

const formatter = new Intl.NumberFormat([], {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const columnHelper = createDataTableColumnHelper<PaymentMethod>()

const columns = [
  columnHelper.accessor("id", {
    header: "ID",
    enableSorting: true,
  }),
  columnHelper.accessor("name", {
    header: "Name",
    enableSorting: true,
  }),
  columnHelper.accessor("minAmount", {
    header: "Min. amount",
    enableSorting: false,
  }),
  columnHelper.accessor("maxAmount", {
    header: "Max. amount",
    enableSorting: false,
  }),
]

const PaySettingPage = () => {
  const {data: config, refetch: refetchConfig} = useQuery<
    Pick<
      GetConfigResponse,
      "checkoutOptions" | "checkoutSequence" | "checkoutTexts"
    >
  >({
    queryFn: () => sdk.client.fetch("/admin/pay/payment-methods"),
    queryKey: ["pay-payment-methods"],
  })

  const paymentMethods = useMemo(() => {
    if (!config || !config.checkoutOptions) {
      return []
    }

    const result = getSortedPaymentMethods(config)

    return result.map((pm) => ({
      id: pm.id.toString(),
      name: pm.name,
      minAmount: pm.minAmount ? formatter.format(pm.minAmount / 100) : "-",
      maxAmount: pm.maxAmount ? formatter.format(pm.maxAmount / 100) : "-",
    }))
  }, [config])

  const {refetch, isLoading} = useQuery({
    queryFn: () => sdk.client.fetch("/admin/pay/clear-cache"),
    queryKey: ["pay-clear-cache"],
    refetchOnWindowFocus: false,
    enabled: false,
  })

  const getErrorMessage = (error: any) => {
    if (error?.response?.statusText) {
      return `${error.response.statusText}: ${error.response.data}`
    }

    return "Something went wrong, Please try again."
  }

  const handleClearCache = async () => {
    refetch()
      .then(({status}) => {
        if (status !== "success") {
          throw new Error("Something went wrong")
        }

        refetchConfig()
        toast.success("Success", {description: "Successfully cleared cache"})
      })
      .catch((error: Error) => {
        console.log("error", error)

        toast.error("Error", {description: getErrorMessage(error)})
      })
  }

  const table = useDataTable({
    columns,
    data: paymentMethods,
    getRowId: (paymentMethod) => paymentMethod.id,
    rowCount: paymentMethods.length,
    isLoading: false,
  })

  return (
    <div className="flex w-full flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading>
              <PayLogo />
            </Heading>
            <Text className="text-ui-fg-subtle mt-2" size="small">
              Manage your Pay. settings
            </Text>
          </div>
        </div>
        <div className="text-ui-fg-subtle grid grid-cols-2 items-center px-6 py-4">
          <Text size="small" leading="compact" weight="plus">
            Version installed
          </Text>
          <Text size="small" leading="compact">
            {displayName} - {version}
          </Text>
        </div>
        <div className="text-ui-fg-subtle grid grid-cols-2 items-center px-6 py-4">
          <Text size="small" leading="compact" weight="plus">
            Clear cache, checkout options & payment methods are cached for max.
            1 day
          </Text>
          <Text size="small" leading="compact">
            <Button
              isLoading={isLoading}
              onClick={handleClearCache}
              variant="primary"
            >
              Clear Cache
            </Button>
          </Text>
        </div>
      </Container>
      <Container className="divide-y p-0 overflow-hidden">
        <DataTable instance={table}>
          <DataTable.Toolbar className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
            <div>
              <Heading>Available payment methods</Heading>
              <Text className="text-ui-fg-subtle mt-2" size="small">
                Activate payment methods in your{" "}
                <a
                  href="https://my.pay.nl/"
                  target="_blank"
                  className="underline"
                >
                  Pay. dashboard
                </a>
                .
              </Text>
            </div>
          </DataTable.Toolbar>
          <DataTable.Table />
        </DataTable>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Pay",
})

export default PaySettingPage
