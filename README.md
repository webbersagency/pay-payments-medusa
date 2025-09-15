<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/59018053/229103275-b5e482bb-4601-46e6-8142-244f531cebdb.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    <img alt="Medusa logo" src="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    </picture>
</p>

<h1 align="center">
  Pay. payments for Medusa V2
</h1>

<p align="center">
  Get access to 50+ payment options for online and in-store payments.
</p>

<p align="center">
  <a href="#">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs welcome!" />
  </a>
  <br />
  <a href="https://www.pay.nl/en/">
    <img src="https://img.shields.io/badge/www-pay.nl-blue.svg?style=flat" alt="Website" />
  </a>
  <a href="https://webbers.com">
    <img src="https://img.shields.io/badge/www-webbers.com-blue.svg?style=flat" alt="Website" />
  </a>
</p>

## Getting Started

Don’t have an account with Pay. yet? [Register now!](https://signup.pay.nl/welcome?id=M-1030-9252)

## Table of Contents

- [Demo store](#demo-store)
- [Pay. Payment Methods](#pay-payment-methods)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
  - [Configuration Options](#configuration-options)
  - [Environment Variables](#environment-variables)
- [Usage](#usage)
  - [Supported Payment Methods](#supported-payment-methods)
  - [Client-Side Integration](#client-side-integration)
  - [Adding payment method icons](#adding-payment-method-icons)
- [Extending the Plugin](#extending-the-plugin)
- [Medusa v1 Support](#medusa-v1-support)

## Demo store

Visit the demo store here: https://pay-demo.webbers.com

## Pay. payment methods

### Card payment methods

- Mastercard
- VISA
- American Express
- Carte Bancaire
- Maestro
- PostePay
- DanKort
- Nexi
- Visa Mastercard

### Digital wallets

- Apple Pay
- Google Pay

### Afterpay methods / Buy now pay later

- iDEAL IN3
- Billink
- SprayPay
- Riverty
- Mondu
- AlmaPAY
- Klarna

### Other

- PayPal

### Recurring payments

- SEPA Direct Debit
- Card-on-file / recurring card payments (tokenisation) [Coming soon]

### Region specific payment methods

<div style="display: flex; gap: 30px;">
  <div>

| <div style="width:200px">Payment Method</div> | <div style="width:200px">Region(s)</div>                                                        |
|-----------------------------------------------|-------------------------------------------------------------------------------------------------|
| iDEAL                                         | 🇳🇱 Netherlands                                                                                |
| Bancontact                                    | 🇧🇪 Belgium                                                                                    |
| Vipps                                         | 🇳🇴 Norway<br>🇸🇪 Sweden                                                                      |
| Bizum                                         | 🇪🇸 Spain                                                                                      |
| Payconiq                                      | 🇧🇪 Belgium<br>🇱🇺 Luxembourg                                                                 |
| Twint                                         | 🇨🇭 Switzerland                                                                                |
| MB Way                                        | 🇵🇹 Portugal                                                                                   |
| Pay By Bank                                   | 🇧🇪 Belgium<br>🇩🇪 Germany<br>🇮🇹 Italy<br>🇱🇺 Luxembourg<br>🇳🇱 Netherlands<br>🇪🇸 Spain |
| WeChat Pay                                    | 🇨🇳 China                                                                                      |

  </div>
  <div>

| <div style="width:200px">Payment Method</div> | <div style="width:200px">Region(s)</div> |
|-----------------------------------------------|------------------------------------------|
| Alipay Plus                                   | 🇨🇳 China<br>🇭🇰 Hong Kong             |
| MultiBanco                                    | 🇵🇹 Portugal                            |
| Swish                                         | 🇸🇪 Sweden                              |
| Satispay                                      | 🇮🇹 Italy                               |
| Blik                                          | 🇵🇱 Poland                              |
| EPS                                           | 🇦🇹 Austria                             |
| Przelewy24                                    | 🇵🇱 Poland                              |
| MobilePay                                     | 🇩🇰 Denmark<br>🇫🇮 Finland             |

  </div>
</div>

### InStore / SoftPOS payments

Would you like to integrate Pay. (Soft)P0S? [Get in touch!](mailto:hi@webbers.com)

## Features

- **Easily Extendable**: The modular architecture makes it easy to add support for additional Pay payment methods.
- **Webhook Support**: Full support for Pay webhooks for real-time payment status updates.
- **Automatic Capture**: Configurable automatic capture of payments.

## Prerequisites

- Medusa server v2.20.1 or later
- Node.js v20 or later
- A [Pay](https://signup.pay.nl/welcome?id=M-1030-9252) account and token & secret with payment methods enabled.

> [!NOTE]
> _You can get the API token & secret from your Pay dashboard: click Settings > Click sales channel > Copy api tokens_

## Installation

```bash
pnpm add @webbers/pay-payments-medusa
```

## Configuration

Add the provider to the `@medusajs/payment` module in your `medusa-config.ts` file & add it as plugin:

```typescript
module.exports = defineConfig({
  projectConfig: {
    // ...
  },
  plugins: [
    // ... other plugins
    '@webbers/pay-payments-medusa'
  ],
  modules: [
    // ... other modules
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "@webbers/pay-payments-medusa/providers/pay",
            id: "pay",
            options: {
              paymentDescription: "Your description", // optional
              atCode: process.env.PAY_AT_CODE,
              apiToken: process.env.PAY_API_TOKEN,
              slCode: process.env.PAY_SL_CODE,
              slSecret: process.env.PAY_SL_SECRET,
              returnUrl: process.env.PAY_RETURN_URL,
              testMode: process.env.PAY_TEST_MODE === 'true',
              tguApiUrl: process.env.PAY_TGU_API_URL, // defaults to https://connect.pay.nl/v1
              otherSlCodes: process.env.PAY_OTHER_SL_CODE ? JSON.parse(process.env.PAY_OTHER_SL_CODE) : undefined,
            },
          },
        ]
      }
    }
  ]
})
```

## Configuration Options

| Option         | Description                                   | Default                                                                                                                                               |
|----------------|-----------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| `atCode`       | Your Pay AT code                              | Required                                                                                                                                              |
| `apiToken`     | Your Pay API token                            | Required                                                                                                                                              |
| `slCode`       | Your Pay sales channel code                   | Required                                                                                                                                              |
| `slSecret`     | Your Pay sales channel secret                 | Required                                                                                                                                              |
| `returnUrl`    | The URL to return to after payment            | Required                                                                                                                                              |
| `medusaUrl`    | The URL of your Medusa server                 | Required                                                                                                                                              |
| `testMode`     | Whether to enable test payments               | Optional                                                                                                                                              |
| `tguApiUrl`    | Pay TGU API Url                               | Optional, use if you want to use a specific or private TGU, see [here](https://developer.pay.nl/docs/transaction-gateway-unit#multi-cores-more-tgus). |
| `otherSlCodes` | Your other Pay sales channel code and secrets | Optional, used for webhook signature validation when using multiple Pay. sales channels. Format `'{"SL-CODE-X":"secretX","SL-CODE-Y":"secretY"}'`     |

## Environment Variables

Create or update your `.env` file with the following variables:

```bash
PAY_AT_CODE="<your-pay-at-code>"
PAY_API_TOKEN="<your-pay-api-token>"
PAY_SL_CODE="<your-pay-sl-code>"
PAY_SL_SECRET="<your-pay-sl-secret>"
#PAY_TEST_MODE="true"
PAY_EXCHANGE_URL="https://your-store.com/checkout/payment"
```

## Usage

Once installed and configured, the Pay payment methods will be available in your Medusa admin. To enable them, log in to
you Medusa Admin, browse to Settings > Regions, add or edit a region and select the desired Pay providers from the
dropdown.

![Screenshot 2025-03-10 at 14 14 43](https://github.com/user-attachments/assets/6aad3edb-7370-4aa8-9bc1-1cf35572d2e0)

Make sure that the selected payment methods are enabled in your Pay origanization settings as well.

## Supported Payment Methods

The plugin currently supports the following Pay payment methods:

| <div style="width: 400px">Payment Method</div>                                                                                       | Provider ID                           |
|--------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------|
| **Pay. hosted checkout**                                                                                                             | `pp_pay-hosted-checkout_pay`          |
| **Creditcards**<br>Mastercard / VISA / American Express/ Carte Bancaire / <br> Maestro / PostePay / DanKort / Nexi / Visa Mastercard | `pp_pay-creditcard-group_pay`         |
| **Card-on-file / recurring card payments (tokenisation)**                                                                            | Coming soon                           |
| **Apple Pay**                                                                                                                        | `pp_pay-apple-pay_pay`                |
| **Google Pay**                                                                                                                       | `pp_pay-google-pay_pay`               |
| **iDEAL IN3**                                                                                                                        | `pp_pay-ideal-in3_pay`                |
| **Billink**                                                                                                                          | `pp_pay-billink_pay`                  |
| **SprayPay**                                                                                                                         | `pp_pay-spraypay_pay`                 |
| **Riverty**                                                                                                                          | `pp_pay-riverty_pay`                  |
| **Mondu**                                                                                                                            | `pp_pay-mondu_pay`                    |
| **AlmaPAY**                                                                                                                          | `pp_pay-almapay_pay`                  |
| **Klarna**                                                                                                                           | `pp_pay-klarna_pay`                   |
| **PayPal**                                                                                                                           | `pp_pay-paypal_pay`                   |
| **SEPA Direct Debit**                                                                                                                | `pp_pay-direct-debit_pay`             |
| **iDEAL**                                                                                                                            | `pp_pay-ideal_pay`                    |
| **Bancontact**                                                                                                                       | `pp_pay-bancontact_pay`               |
| **Vipps**                                                                                                                            | [Get in touch](mailto:hi@webbers.com) |
| **Bizum**                                                                                                                            | [Get in touch](mailto:hi@webbers.com) |
| **Payconiq**                                                                                                                         | `pp_pay-payconiq_pay`                 |
| **Twint**                                                                                                                            | `pp_pay-twint_pay`                    |
| **MB Way**                                                                                                                           | [Get in touch](mailto:hi@webbers.com) |
| **Pay by Bank**                                                                                                                      | `pp_pay-paybybank_pay`                |
| **WeChat Pay**                                                                                                                       | `pay-wechatpay`                       |
| **AliPay Plus**                                                                                                                      | [Get in touch](mailto:hi@webbers.com) |
| **MultiBanco**                                                                                                                       | [Get in touch](mailto:hi@webbers.com) |
| **Swish**                                                                                                                            | [Get in touch](mailto:hi@webbers.com) |
| **Satispay**                                                                                                                         | [Get in touch](mailto:hi@webbers.com) |
| **Blik**                                                                                                                             | `pp_pay-blik_pay`                     |
| **EPS**                                                                                                                              | `pp_pay-eps_pay`                      |
| **Przelewy24**                                                                                                                       | `pp_przelewy24_pay`                   |
| **MobilePAY**                                                                                                                        | `pp_pay-mobilepay_pay`                |
| **SoftPOS**                                                                                                                          | `pp_pay-softpos_pay`                  |
| **Gift Card**                                                                                                                        | `pp_pay-giftcard_pay`                 |

## Client-Side Integration

To integrate with your storefront, you'll need to implement the payment flow according to Pay's and Medusa's
documentation. Here's a basic example:

1. Create a payment session in your checkout flow
2. Redirect the customer to the Pay payment page
3. Handle the webhook notifications to update the payment status

_Example integration using the [Medusa Next.js Starter](https://github.com/medusajs/nextjs-starter-medusa):_

https://github.com/user-attachments/assets/742ee261-5e41-4e33-9a72-faf1a424fc52

## Adding payment method icons

1. Download the latest payment images from here: https://github.com/paynl/payment-images
2. Add these to your storefront public assets
3. In your checkout, create the mapping from the provider id to the icon.
1. You can also utilize the exported `payPaymentMethods` from this plugin to find the corresponding ID.
2. I.e. ```const paymentMethodData = payPaymentMethods.find(method => `pp_${method.value}_pay` === provider_id)```

## Extending the Plugin

To add one of the missing Pay payment methods, create a new service in `src/providers/Pay/services` that extends the
`PayBase` class:

```typescript
import {PaymentMethod} from "@Pay/api-client";
import PayBase from "../core/Pay-base";
import {PaymentOptions, PaymentProviderKeys} from "../types";

class PayNewMethodService extends PayBase {
  static identifier = "Pay-new-method";

  get paymentCreateOptions(): PaymentOptions {
    return {
      method: PaymentMethod.newMethod,
    };
  }
}

export default PayNewMethodService;
```

Make sure to replace `new method` with the actual Pay payment method ID.

Export your new service from `src/providers/Pay/services/index.ts`. Then add your new service to the list of services in
`src/providers/Pay/index.ts`.

We will be working on providing all the available Pay. options in the near future.

## Medusa v1 Support

Searching for support for Medusa v1, we have a legacy plugin available. [Get in touch](mailto:hi@webbers.com)
