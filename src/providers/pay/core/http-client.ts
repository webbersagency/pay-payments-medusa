import {Logger} from "@medusajs/medusa"
import {PayEnvironmentPaths} from "./constants"
import {ProviderOptions} from "../types"
import {MedusaError} from "@medusajs/framework/utils"

export class HttpClient {
  protected readonly options_: ProviderOptions
  protected readonly logger: Logger
  public readonly debugMode: boolean
  public readonly testMode: boolean
  protected readonly restApiUrl: string
  protected readonly tguApiUrl: string

  constructor({options, logger}: {options: ProviderOptions; logger: Logger}) {
    this.options_ = options
    this.logger = logger
    this.testMode = options.testMode ?? true
    this.debugMode = options.debugMode ?? options.testMode ?? true
    this.restApiUrl = PayEnvironmentPaths.REST_API
    this.tguApiUrl = options.tguApiUrl ?? PayEnvironmentPaths.TGU_API
  }

  async apiRequest<T, TResponse>({
    endpoint,
    data,
    method,
  }: {
    endpoint: string
    data?: T
    method?: RequestInit["method"]
  }): Promise<TResponse> {
    return this.request_({url: `${this.restApiUrl}${endpoint}`, data, method})
  }

  async tguRequest<T, TResponse>({
    endpoint,
    data,
    method,
  }: {
    endpoint: string
    data?: T
    method?: RequestInit["method"]
  }): Promise<TResponse> {
    return this.request_({url: `${this.tguApiUrl}${endpoint}`, data, method})
  }

  /**
   * Run a request and return the result
   * @param url
   * @param data
   * @param method
   * @protected
   */
  async request_<T, TResponse>({
    url,
    data,
    method,
    headers,
  }: {
    url: string
    data?: T
    method?: RequestInit["method"]
    headers?: Record<string, string>
  }): Promise<TResponse> {
    const fetchHeaders = {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(
        `${this.options_.atCode}:${this.options_.apiToken}`
      ).toString("base64")}`,
      ...headers,
    }

    const response = (await fetch(url, {
      method: method ?? "POST",
      headers: fetchHeaders,
      ...(data
        ? {
            body:
              fetchHeaders["Content-Type"] !== "application/json"
                ? (data as string)
                : JSON.stringify({
                    ...data,
                    integration: {
                      test: this.testMode,
                    },
                  }),
          }
        : {}),
    }).then(async (resp) => {
      const result = resp.headers
        .get("content-type")
        ?.includes("application/json")
        ? await resp.json()
        : await resp.text()

      if (!resp.ok) {
        if (this.debugMode) {
          try {
            this.logger.error(
              JSON.stringify({
                url,
                method,
                body: JSON.stringify({
                  ...data,
                  integration: {
                    test: this.testMode,
                  },
                }),
              })
            )

            this.logger.error(JSON.stringify(result))
          } catch (e) {}
        }

        this.throwError(result, resp.status, resp.statusText)
      }

      return result
    })) as TResponse

    return response
  }

  protected throwError(error: any, status?: number, statusText?: string) {
    const httpInfo = status
      ? `HTTP ${status}${statusText ? ` ${statusText}` : ""}`
      : ""

    this.logger.error(
      `Pay. API error${httpInfo ? ` (${httpInfo})` : ""}: ${JSON.stringify(error)}`
    )

    const message =
      error?.message ??
      error?.detail ??
      error?.violations?.[0]?.message ??
      error?.title ??
      (httpInfo
        ? `Pay. responded with ${httpInfo} and no error details`
        : "There was an error in the Pay. response")

    const code = error?.violations?.[0]?.code ?? error?.code

    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `${code ? `[${code}]: ` : ""}${message}`,
      code
    )
  }
}
