# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Medusa v2 plugin (`@webbers/pay-payments-medusa`) that integrates the Pay. (pay.nl) payment gateway. It registers a payment provider module with ~30 payment-method services (iDEAL, Creditcard, Klarna, etc.) and ships storefront/admin API routes plus an admin settings page.

Package manager: **pnpm** (10.9.0). Node >= 20.

## Commands

- `pnpm dev` — runs `medusa plugin:develop`; watches and publishes the compiled plugin locally (via yalc) so a consuming Medusa server can link it.
- `pnpm build` — runs `medusa plugin:build`; emits to `.medusa/server/` (this is what gets published — see `files` / `exports` in `package.json`).
- `pnpm prepublishOnly` — build hook that runs before `pnpm publish`.

There are no tests, no lint, no typecheck scripts. TypeScript is validated implicitly during `medusa plugin:build`.

## Architecture

### Payment provider registration
`src/providers/pay/index.ts` calls `ModuleProvider(Modules.PAYMENT, { services })`. Every class in `src/providers/pay/services/index.ts` (array `serviceClasses`) becomes a Medusa payment provider. Medusa prefixes identifiers with `pp_` and suffixes with `_<providerId>` (the `id: "pay"` from the host's `medusa-config.ts`), so `PayIdealService` (identifier `pay-ideal`) is addressable as `pp_pay-ideal_pay`.

**Adding a new payment method**: create `src/providers/pay/services/pay-<name>.ts` that extends `PayBase`, set `static identifier = PaymentProviderKeys.X`, implement `paymentCreateOptions` (with `methodId` from Pay. and a `webhookUrl` pointing at `/hooks/pay/<identifier>_pay`). Then add the key to `PaymentProviderKeys` in `src/providers/pay/types/index.ts`, import and add the class to `serviceClasses` in `src/providers/pay/services/index.ts`, and — if you want it listed in the README/metadata — add the method to `payPaymentMethods` in `src/constants.ts`.

### Core payment flow (non-standard)
This plugin **bypasses Medusa's normal "create payment session → authorize → create order" sequence**. Instead:

1. `initiatePayment` is a no-op that just returns a session_id.
2. The real Pay. order is created in `src/workflows/hooks/complete-cart-order-created.ts`, which hooks `completeCartWorkflow.hooks.orderCreated` and calls `createPayOrder` (`src/utils/createPayOrder.ts`). This is because Pay.'s BNPL / after-pay methods need real order data (line items, addresses) before they can be initiated.
3. `createPayOrder` looks up the order's payment session (via `getPayPaymentSession`), instantiates the matching service class, builds the Pay. payload, and stores it via `updatePaymentSession` — which triggers `PayBase.updatePayment`, which calls `PayClient.createOrder` against Pay.'s TGU.
4. Direct Debit (`PaymentProviderKeys.DIRECTDEBIT`) is special: payment collection is set to `AWAITING` (other methods go to `NOT_PAID`) and the session is marked `captured` synchronously.

Consequence: **orders are created in Medusa before payment is captured**. If the Pay. payment expires/cancels, the order is cancelled via the `pay_payment.canceled` subscriber. Storefront subscribers should listen to `payment.captured`, not `order.placed`.

### Webhooks
`POST /hooks/pay/:provider` (`src/api/hooks/pay/[provider]/route.ts`) receives Pay. webhooks, emits `PaymentWebhookEvents.WebhookReceived` with a delay (default 5s) so Medusa processes asynchronously. Medusa then resolves the provider and calls `PayBase.getWebhookActionAndData`, which:
- Verifies the HMAC signature using `keyMap` (built from `slCode`/`slSecret` + `otherSlCodes`). Legacy webhooks (`incassostorno`, `new_ppt`) skip signature verification and re-fetch by order_id.
- Maps Pay. status codes (`PayPaymentStatus` in `src/providers/pay/core/constants.ts`) to Medusa `PaymentActions`.
- Emits internal events `pay_payment.canceled` / `pay_payment.failed` consumed by `src/subscribers/`. These events carry `payment.reference`, which is the order's `display_id`.

The hooks route must preserve the raw body for HMAC verification — see `src/api/hooks/middlewares.ts` (`bodyParser: { preserveRawBody: true }`).

### Pay. HTTP clients
`PayClient` (`src/providers/pay/core/pay-client.ts`) wraps three Pay. API surfaces handled by `HttpClient`:
- `tguRequest` — order lifecycle (`/orders`, `/orders/{id}/capture|abort|status`) at the TGU host (configurable via `options.tguApiUrl`).
- `apiRequest` — config + transaction status + refunds at REST API v2.
- `restApiV3Request` — legacy REST v3 for Direct Debit (form-encoded).

All requests use HTTP Basic auth with `atCode:apiToken`. In test mode, `integration.test = true` is merged into JSON bodies.

### Store & admin routes
- `GET /store/carts/:id/duplicate` (`src/api/store/carts/[id]/duplicate/route.ts` → `duplicateCartWorkflow`) — idempotent cart duplication for when a customer cancels on Pay.'s hosted page. Transaction id is deterministic (`cart-duplicate-<id>`).
- `GET /store/pay/payment-collections/:id` — creates a hosted-checkout payment session on an existing collection (used to retry payment) and returns `checkout_url`.
- `GET /store/pay/payment-methods` — returns Pay. checkout config (cached 1 day under `pay_config_cache:<slCode>` in `Modules.CACHE`).
- `GET /admin/pay/payment-methods` and `GET /admin/pay/clear-cache` back the admin settings page at `src/admin/routes/settings/pay/page.tsx`.

### Provider options
`ProviderOptions` is resolved from `medusa-config.ts` and includes `atCode`, `apiToken`, `slCode`, `slSecret`, `returnUrl`, `medusaUrl`, optional `tguApiUrl`, `testMode`, `debugMode`, `paymentDescription` (locale map), and `otherSlCodes` (map of extra sales-channel code → secret for multi-channel webhook verification). `validateOptions` (static on `PayBase`) enforces the required ones. A per-sales-channel override for `returnUrl` is read from `sales_channel.metadata.pay_return_url`.

## Conventions

- TypeScript `strictNullChecks: true`, `module: Node16`. Package uses ESM-style `exports` map — consumers import from `@webbers/pay-payments-medusa/providers/pay`, `/workflows`, `/modules/*`, `/utils`, `/admin`.
- Indentation 2 spaces, double quotes, no semicolons in most new code (Prettier + `.editorconfig`).
- Don't edit anything under `.medusa/` — it's build output.
- When logging, gate verbose output behind `this.debug_` (set from `options.debugMode` or `NODE_ENV`).
- Monetary amounts sent to Pay. are **integer minor units** (`value * 100`, rounded). `PayBase.createPayOrderPayload` is the reference for formatting.
