# Mollie Payments API v2 — integration reference

Scope: one-time payments (iDEAL / Apple Pay / credit card), recurring (mandates, on-demand recurring payments, Subscriptions API), webhooks, refunds, methods, testing, errors.

Provenance tags used throughout:

- **[docs]** — confirmed on docs.mollie.com (fetched 2026-10-06; the `.md` variants of the reference pages, e.g. `https://docs.mollie.com/reference/get-payment.md`, carry the full schemas; the HTML pages lazy-load them).
- **[client]** — confirmed in the official Node client source (`@mollie/api-client` v4.6.0, `src/data/*`, `src/binders/*`, `src/communication/*`).
- **[both]** — confirmed in both.
- **[unverified]** — not confirmed from either source; treat as an assumption to test.

---

## 1. Basics: base URL, auth, idempotency, test mode

| Item | Value | Source |
|---|---|---|
| Base URL | `https://api.mollie.com/v2/` (client uses `https://api.mollie.com:443/v2/`) | [client] (`NetworkClient.ts`), curl examples in docs use `https://api.mollie.com/v2/...` [docs] |
| Auth header | `Authorization: Bearer <api key>` | [both] |
| API key prefixes | test keys start with `test_`, live keys with `live_`; "API keys come in pairs" | [docs] authentication |
| Test mode with API keys | Using a `test_` key puts every request in test mode. "Any payments or other resources you create in test mode are completely isolated from your live mode data." | [docs] testing |
| `testmode` parameter | Only for organization-level credentials (OAuth / Advanced access tokens): `testmode=true` as a query param (GET) or body field (POST). Not needed with `test_`/`live_` API keys ("unnecessary with mode-specific credentials"). The client sends `testmode` on practically every call as an optional parameter. | [both] |
| Response format | HAL+JSON (`_links`, `_embedded`), `type: "application/hal+json"` on links | [both] |
| Request body format | Docs curl examples use both form-encoded (`-d "amount[currency]=EUR"`) and JSON (`-H "Content-Type: application/json"`). The Node client posts JSON. | [both] |
| Booleans | JSON boolean in bodies; in query strings only the strings `true`/`false` | [docs] common-data-types |
| Dates | `YYYY-MM-DD` for dates; ISO 8601 for datetimes (e.g. `2024-03-20T09:13:37+00:00`) | [both] |
| Amount object | `{ "currency": "EUR", "value": "10.00" }` — `currency` is an ISO 4217 code, `value` is "a string containing the exact amount in the given currency" with the currency's number of decimals (EUR: 2 decimals, e.g. `"10.00"`; JPY has 0). Always a string, never a number. | [both] (`Amount { currency: string; value: string }`) |
| Locale format | `xx_XX` (ISO 15897). Allowed on create-payment: `ca_ES, cs_CZ, da_DK, de_AT, de_CH, de_DE, de_LU, el_GR, en_BE, en_GB, en_NL, en_US, es_ES, fi_FI, fr_BE, fr_FR, fr_LU, hu_HU, is_IS, it_IT, lt_LT, lv_LV, nb_NO, nl_BE, nl_NL, pl_PL, pt_PT, sk_SK, sl_SI, sv_SE, tr_TR`. The client's `Locale` enum is an older, shorter subset (24 values incl. `nl_NL`, `nl_BE`, `en_US`, `en_GB`, `de_DE`, `fr_FR`, ...). | [docs] (full list), [client] (subset) |
| Metadata | `metadata`: "Provide any data you like, for example a string or a JSON object. We will save the data alongside the entity." ~1 kB max. Returned as given (string/number/object/array/null). | [both] |

### Idempotency-Key [docs] api-idempotency, [client] makeRetrying.ts

- Header name: `Idempotency-Key`. [both]
- "All POST endpoints accept idempotency keys." GET/PATCH/DELETE do not need them (they are naturally repeatable). [docs]
- Recommended key: UUID4. No documented length limit. [docs]
- Retention: "Keys older than 1 hour will be removed from our cache." After that the same key is treated as a new request. [docs]
- Replay within window: cached original response is returned with header `Idempotent-Replayed: true`. [docs]
- `400 Bad Request` when the same key is reused for a different endpoint/parameters; `409 Conflict` when a second request with the same key arrives while the first is still processing. [docs]
- Client behaviour: the Node client auto-generates a random `Idempotency-Key` for every POST **and DELETE** request if you don't supply `idempotencyKey`, and retries 5xx responses up to 3 attempts (honouring `Retry-After`, default 2 s). It accepts `idempotencyKey` on `payments.create`, `payments.cancel`, `customers.create`, `customers.delete`, `mandates.create/revoke`, `subscriptions.create/cancel`, `refunds.create/cancel`, `applePay.requestPaymentSession`. [client]
- Mollie docs explicitly recommend idempotency keys for recurring payments to avoid double charging. [docs]

---

## 2. Payments

### 2.1 Create payment — `POST /v2/payments` [both]

Response: `201 Created` with the payment object. [docs]

Request fields (top-level):

| Field | Type | Required | Notes | Source |
|---|---|---|---|---|
| `amount` | `{currency, value}` | yes | value = string, 2 decimals for EUR, e.g. `"100.00"` | [both] |
| `description` | string | yes | max 255 chars; shown on card/bank statement when possible | [both] |
| `redirectUrl` | string\|null | normally yes | "The parameter is normally required, but can be omitted for recurring payments (`sequenceType: recurring`) and for Apple Pay payments with an `applePayPaymentToken`." Payment response has `redirectUrl` `null` for recurring payments. | [both] |
| `cancelUrl` | string\|null | no | "The URL your customer will be redirected to when the customer explicitly cancels the payment. If this URL is not provided, the customer will be redirected to the redirectUrl instead." | [both] |
| `webhookUrl` | string\|null | no (strongly recommended) | "The webhookUrl must be reachable from Mollie's point of view, so you cannot use `localhost`." | [both] |
| `method` | string \| string[] \| null | no | Omit to let the customer choose in the hosted checkout; a single id forces that method; an array restricts the selection. Values: see §7. | [both] (client: `MaybeArray<PaymentMethod>`) |
| `issuer` | string | no | iDEAL/KBC/gift card/voucher issuer id; skips issuer selection | [both] |
| `locale` | string | no | presets hosted-page language | [both] |
| `metadata` | any | no | ~1 kB | [both] |
| `customerId` | string (`cst_…`) | required for `first`/`recurring` | "used primarily for recurring payments, but can also be used on regular payments to enable single-click payments" | [both] |
| `sequenceType` | `oneoff` \| `first` \| `recurring` | no (default `oneoff`) | see §4 | [both] |
| `mandateId` | string (`mdt_…`) | optional on `recurring` | "the ID of a specific mandate can be supplied to indicate which of the customer's accounts should be debited" | [both] |
| `billingAddress` | Address | required for alma/in3/klarna/billie/billink/riverty; optional otherwise | | [both] |
| `shippingAddress` | Address | no | | [both] |
| `lines` | PaymentLine[] | required for billie/billink/in3/klarna/riverty/voucher; optional otherwise | "All lines must have the same currency as the payment." | [both] |
| `captureMode` | `automatic` \| `manual` | no | manual capture → status `authorized` | [both] |
| `captureDelay` | string | no | `^\d+ (hours?\|days?)$`, max 7 days | [both] |
| `restrictPaymentMethodsToCountry` | ISO 3166-1 alpha-2 | no | | [both] |
| `storeCredentials` | boolean | no | "Whether the card details should be stored for the customer after a successful payment." (creates a card mandate) | [both] |
| `dueDate` | `YYYY-MM-DD` | no | bank transfer only; min tomorrow, max tomorrow+100 days | [both] |
| `applicationFee`, `routing`, `profileId` | | no | Mollie Connect / OAuth only | [both] |
| `testmode` | boolean | no | org-level credentials only | [both] |

Method-specific request parameters (docs: `/reference/extra-payment-parameters`):

| Field | Method | Description | Source |
|---|---|---|---|
| `applePayPaymentToken` | Apple Pay (direct integration) | "The Apple Pay Payment token object (encoded as JSON) that is part of the result of authorizing a payment request." A JSON *string* (the docs example is `"{\"paymentData\": {\"version\": \"EC_v1\", ...}}"`). | [both] |
| `cardToken` | credit card (Mollie Components) | token from the card component | [both] |
| `billingEmail` | bank transfer | deprecated; use `billingAddress.email` | [both] |
| `sessionId`, `digitalGoods` | PayPal | | [both] |
| `consumerName`, `consumerAccount` | (client lists them as create params; docs do not list them as SEPA DD request params) | | [client] only |

`Address` object (`src/data/global.ts`): `title?, givenName?, familyName?, organizationName?, streetAndNumber (required), streetAdditional?, postalCode?, email?, city (required), region?, country (required, ISO 3166-1 alpha-2)`. [client] (docs confirm `billingAddress.email` exists)

`PaymentLine` (`src/data/payments/data.ts`): required `description, quantity (int), unitPrice (Amount), totalAmount (Amount)`; optional `type` (`physical|digital|shipping_fee|discount|store_credit|gift_card|surcharge|tip`), `quantityUnit, discountAmount, vatRate (string), vatAmount, sku, categories, imageUrl, productUrl, recurring {interval, amount?, times?, startDate?, description?}`. [both] (docs confirm the four required fields)

Minimal one-off example (docs recurring-payments page style):

```json
{
  "amount": { "currency": "EUR", "value": "10.00" },
  "description": "Order #12345",
  "redirectUrl": "https://webshop.example.org/order/12345/",
  "webhookUrl": "https://webshop.example.org/payments/webhook/",
  "metadata": { "order_id": "12345" }
}
```

### 2.2 Payment object (response of create/get) [both]

| Field | Notes |
|---|---|
| `resource` | `"payment"` |
| `id` | prefix `tr_` (e.g. `tr_5B8cwPMGnU6qLbRvo7qEZo`) |
| `mode` | `live` \| `test` |
| `createdAt` | ISO 8601 |
| `status` | see §3 |
| `statusReason` | `{code, message}` — currently only for point-of-sale payments |
| `isCancelable` | boolean — "Whether the payment can be canceled. This parameter is omitted if the payment reaches a final state." |
| `authorizedAt`, `paidAt`, `canceledAt`, `expiredAt`, `failedAt` | ISO 8601; each "omitted if the payment is not <state> (yet)" |
| `expiresAt` | when the payment will expire; "omitted if the payment can no longer expire" |
| `amount` | Amount |
| `amountRefunded` | "The total amount that is already refunded. Only available when refunds are available for this payment." (may exceed amount for some methods) |
| `amountRemaining` | "The remaining amount that can be refunded. Only available when refunds are available for this payment." |
| `amountCaptured`, `amountChargedBack` | only when applicable |
| `description`, `redirectUrl`, `cancelUrl`, `webhookUrl` | as given; `redirectUrl`/`cancelUrl` are `null` for recurring payments |
| `method` | the method used, or absent/null while the customer has not chosen yet |
| `locale`, `countryCode`, `profileId`, `settlementAmount`, `settlementId` | |
| `metadata` | as given |
| `customerId` | present if a customer was specified (`cst_…`) |
| `sequenceType` | `oneoff` \| `first` \| `recurring` |
| `mandateId` | "If the payment is a first or recurring payment, this field will hold the ID of the mandate." |
| `subscriptionId` | "If the payment was automatically created via a subscription, the ID of the subscription will be added to the response." (`sub_…`) |
| `details` | method-specific object, see below |
| `_links.self`, `_links.documentation` | always |
| `_links.checkout` | `{href, type: "text/html"}` — "The URL your customer should visit to make the payment. This is where you should redirect the customer to." Present while the payment is `open` and needs customer interaction; absent for recurring payments. |
| `_links.changePaymentState` | test mode only: hosted screen to set the final state of a recurring test payment, or to create a refund/chargeback for a paid test payment |
| `_links.dashboard` | link to the Mollie Dashboard |
| `_links.refunds`, `_links.chargebacks`, `_links.captures`, `_links.settlement`, `_links.mandate`, `_links.subscription`, `_links.customer`, `_links.order`, `_links.mobileAppCheckout`, `_links.terminal` | when applicable |
| `_embedded.refunds` / `.chargebacks` / `.captures` | only with `embed=` |

`details` for the relevant methods [client] (docs confirm the card fields):

- iDEAL (`IdealDetails`): `consumerName`, `consumerAccount` (IBAN), `consumerBic`.
- Credit card / Apple Pay (`CreditCardDetails`): `cardHolder`, `cardNumber` (last 4), `cardFingerprint`, `cardAudience` (`consumer|business|null`), `cardLabel` (`Visa|Mastercard|American Express|Maestro|…|null`), `cardCountryCode`, `cardSecurity` (`normal|3dsecure`), `feeRegion`, `failureReason` (`authentication_abandoned|authentication_failed|authentication_required|authentication_unavailable_acs|card_declined|card_expired|inactive_card|insufficient_funds|invalid_cvv|invalid_card_holder_name|invalid_card_number|invalid_card_type|possible_fraud|refused_by_issuer|unknown_reason`), `failureMessage`, `wallet?: 'applepay'`. The `wallet: "applepay"` field is how you recognise an Apple Pay payment that was processed as a card payment.
- SEPA Direct Debit (`SepaDirectDebitDetails`): `transferReference`, `creditorIdentifier`, `consumerName`, `consumerAccount`, `consumerBic`, `dueDate`, `signatureDate`, `bankReasonCode`, `bankReason`, `endToEndIdentifier`, `mandateReference`, `batchReference`, `fileReference`.

### 2.3 Get payment — `GET /v2/payments/{paymentId}` [both]

Query: `include` (`details.qrCode`, `details.remainderDetails`), `embed` (`refunds`, `chargebacks`, `captures`), `testmode`. Returns `200` with the payment object. [both]

### 2.4 List payments — `GET /v2/payments` [both]

Query: `from` (`tr_…` cursor), `limit` (1–250, default 50), `sort` (`asc|desc`, default desc), `profileId` (OAuth), `testmode`. Response: `{ count, _embedded: { payments: [...] }, _links: { self, previous, next, documentation } }`. [both] (client `page()` / `iterate()`; also `GET /v2/customers/{customerId}/payments` exists in the client, `CustomerPaymentsBinder`.)

### 2.5 Update payment — `PATCH /v2/payments/{paymentId}` [client]

Updatable: `description, redirectUrl, cancelUrl, webhookUrl, metadata, locale, method, issuer, billingAddress, shippingAddress, restrictPaymentMethodsToCountry, dueDate, billingEmail`. [client] (only while the payment is still open — [unverified])

### 2.6 Cancel payment — `DELETE /v2/payments/{paymentId}` [both]

- Response `200` with the payment object in status `canceled`; `404` unknown id; `422` "payment no longer cancelable". [docs]
- "Depending on the payment method, you may be able to cancel a payment for a certain amount of time — usually until the next business day or as long as the payment status is open." "The isCancelable property on the Payment object will indicate if the payment can be canceled." [docs]
- Per-method list of cancelable methods: **not found** in the current docs page. Practical rule: check `isCancelable` on the fetched payment. For an iDEAL/card/Apple Pay payment in the hosted checkout the customer either pays, cancels, or it expires; merchant-side cancel is mainly relevant for bank transfer / direct debit / pay-later methods. [unverified beyond the `isCancelable` rule]
- Client also exposes `POST /v2/payments/{id}/release-authorization` for authorized (manual capture) payments. [client]

---

## 3. Payment statuses [docs] handling-payment-status, [client] `PaymentStatus` enum

Exact values: `open`, `canceled`, `pending`, `authorized`, `expired`, `failed`, `paid`. [both]

| Status | Docs definition (verbatim) | Final? | Webhook? |
|---|---|---|---|
| `open` | "The payment has been created and can still be completed by your customer." | no | no (initial state) |
| `canceled` | "Your customer has canceled the payment. This is a definitive status." | yes | yes |
| `pending` | "This is a temporary status that can occur when the actual payment process has been started, but it's not complete yet." | no | yes |
| `authorized` | "If the payment method supports captures, the payment will have this status for as long as new captures can be created." (manual capture, cards) | no | yes |
| `expired` | "The payment has expired, e.g. your customer has abandoned the payment. This is a definitive status." | yes | yes |
| `failed` | "The payment has failed. This is a definitive status." | yes | yes |
| `paid` | "Your customer successfully completed the payment. This is a definitive status." | yes | yes |

- Final (definitive) statuses: `canceled`, `expired`, `failed`, `paid`. [docs] `isCancelable` is omitted once a final state is reached. [both]
- Statuses that trigger the webhook: `canceled`, `pending`, `authorized`, `expired`, `failed`, `paid` — only `open` does not. [docs]
- Timestamps: `paidAt`, `canceledAt`, `expiredAt`, `failedAt`, `authorizedAt` are set when the corresponding state is reached and omitted otherwise; `expiresAt` is the scheduled expiry of an open payment. [both]
- Expiry times of an `open` payment per method (docs table): iDEAL, paysafecard 15 min; creditcard 30 min; mybank, twint 45 min; bancontact, belfius, kbc, eps, przelewy24 1 h; vouchers 2 h; paypal 6 h; klarna, in3 48 h; banktransfer 12(+2) days. Apple Pay is not listed separately (it is processed as a card payment). [docs]
- Advice (verbatim): "It is not a good idea to predict payment expiry. Best wait until your webhook is called and fetch the status as usual. This is the most reliable way to keep your system in sync with Mollie." [docs]
- Transitions: the docs show a diagram but do not enumerate transitions textually. Observed structure: `open` → (`pending`) → `paid` | `failed` | `canceled` | `expired`; with manual capture `open` → `authorized` → `paid` (after capture). Whether `pending` can become `expired`/`canceled` is **not stated** on the page. [docs partially / unverified]
- A `canceled` or `expired` payment never becomes `paid` (they are definitive). [docs]
- Refunds and chargebacks do **not** change `status` (it stays `paid`); they show up in `amountRefunded`/`amountRemaining`/`amountChargedBack` and `_embedded.refunds`. [both — docs say refund triggers the payment webhook; client fields] (the "status stays paid" part is implied by the definitive-status definition, not stated verbatim — [unverified wording])

---

## 4. Webhooks (classic, per-resource `webhookUrl`) [docs] /reference/webhooks, /docs/accepting-payments

- Mollie sends an HTTP **POST** to the `webhookUrl` with `Content-Type: application/x-www-form-urlencoded` and "a single POST-parameter called `id` and a value of for example `tr_d0b0E3EA3v`". Body is literally `id=tr_d0b0E3EA3v`. [docs]
- The status is **not** in the webhook: "Since the status is not transmitted in the webhook, fake calls to your webhook will never result in orders being processed without being actually paid." You must call `GET /v2/payments/{id}` with your API key and act on the fetched status. [docs]
- Response: "you only have to return the HTTP status `200 OK`". Calls "time out after 15 seconds". "In case you return a different status – let's say because there's a temporary problem with your hosting service – we will keep trying." [docs]
- Retry schedule: 10 attempts in total — immediately, then after 1, 2, 4, 8, 16, 29 minutes, 1 hour, 2 hours and 22 hours (last attempt ~26 h after the status change). [docs]
- Reachability: "Your webhook URL needs to be accessible from Mollie's point of view. This means that URL's like `localhost` will not be accepted." Use a tunnel such as ngrok for local development. [docs]
- IP allow-listing is discouraged: "IP addresses used by our webhook systems will likely change over time"; authenticate by fetching the resource instead. [docs]
- Ordering vs redirect: normally the webhook is delivered before the customer lands on `redirectUrl`, but not guaranteed — "Make sure that you have received our webhook before rendering a payment status to the customer, since it happens sometimes that the webhook arrives later than the customer redirection." Safe pattern: on the redirect page, fetch the payment yourself (or poll your own DB) rather than assume. [docs]
- Edge case: "The webhook is not called if you have specified a `method` and the consumer cancels the payment on the payment page." (i.e. a forced-method payment that the customer backs out of may go to `canceled`/`expired` without a webhook — handle via `expiresAt` + periodic reconciliation). [docs]
- Webhooks are also fired for the payment when: a refund on it reaches `processing`, `refunded` or `failed`; a chargeback is received. The body still carries the **payment** id (`id=tr_…`), not the refund id. [docs]
- Test mode: "Apart from the hosted payment pages and the fact that test mode payments are created instead of real ones, the Mollie API behaves identical in both environments. This includes calling your webhook." [docs]
- Handle webhooks idempotently (same id may be posted several times). [unverified as a verbatim doc statement; implied by retries]
- Subscriptions: "The webhook URL specified when creating a subscription is used for each payment that is created by this subscription." Subscription `webhookUrl`: "We will call this URL for any payment status changes of payments resulting from this subscription. This webhook will receive **all** events for the subscription's payments." The body is `id=tr_…` of the new payment; the payment carries `subscriptionId`. [docs]
- There is **no** classic webhook for subscription status changes or mandate status changes themselves (only payment-driven calls). The "Next-gen Webhooks" (Webhooks API / Dashboard-configured, HMAC-signed `X-Mollie-Signature`, full-entity JSON payload, event types `payment.paid`, `payment.failed`, `payment.canceled`, `payment.expired`, `payment.pending`, `payment.authorized`, refunds (beta) …) also list **no** `subscription.*` or `mandate.*` events. To detect subscription cancellation/suspension, fetch the subscription (e.g. after every subscription payment webhook or on a schedule). [docs]

Minimal handler contract: `POST` → parse `id` from form body → `GET /v2/payments/{id}` → update order by `payment.metadata` / `payment.id` → respond `200` quickly (do heavy work async).

---

## 5. Customers [both]

- `POST /v2/customers` → `201` customer. Fields: `name` (string|null), `email` (string|null), `locale` (string|null), `metadata`, `testmode`. All optional. [both]
- Response: `resource: "customer"`, `id` (prefix `cst_`, e.g. `cst_tKt44u85MM`), `mode`, `name`, `email`, `locale`, `metadata`, `createdAt`, `recentlyUsedMethods` [client], `_links` (`self`, `dashboard`, `documentation`, and `payments`, `mandates`, `subscriptions`). [both]
- Also in the client: `GET /v2/customers/{id}`, `GET /v2/customers` (page), `PATCH /v2/customers/{id}` (same four fields), `DELETE /v2/customers/{id}`. [client]

---

## 6. Recurring: mandates, first/recurring payments, subscriptions

### 6.1 Sequence types [both]

`sequenceType` on a payment: `oneoff` (default), `first`, `recurring`.

Docs (verbatim): "Only relevant for recurring payments. Indicate which part of a recurring sequence this payment is for. Recurring payments can only take place if a mandate is available. A common way to establish such a mandate is through a first payment. With a first payment, the customer agrees to automatic recurring charges taking place on their account in the future. If set to recurring, the customer's card is charged automatically. Defaults to oneoff, which is a regular non-recurring payment."

### 6.2 First payment → mandate created implicitly [docs] recurring-payments

- A `first` payment **requires** `customerId`. The customer goes through the normal hosted checkout (needs `redirectUrl`, `webhookUrl`). "After the first payment is completed successfully, the customer's account or card will immediately be chargeable on-demand, or periodically through subscriptions." [docs]
- Docs example first payment (verbatim):

```json
{
  "amount": { "currency": "EUR", "value": "0.01" },
  "customerId": "cst_Ok2DlrJe5",
  "sequenceType": "first",
  "description": "First payment",
  "redirectUrl": "https://webshop.example.org/order/12345/",
  "webhookUrl": "https://webshop.example.org/payments/webhook/"
}
```

- Which methods can do a `first` payment and which mandate results (docs table, verbatim method labels):

| Payment method for the first payment | Resulting mandate `method` |
|---|---|
| `creditcard` "(incl Apple Pay and Google Pay)" | `creditcard` |
| `paypal` | `paypal` |
| `ideal` | `directdebit` |
| `bancontact` | `directdebit` |
| `belfius` | `directdebit` |
| `eps` | `directdebit` |
| `kbc` | `directdebit` |
| `paybybank` | `directdebit` |
| `bacs` | `bacs` (first payment must be €0.00) |

  So: **an iDEAL first payment creates a SEPA Direct Debit (`directdebit`) mandate** using the IBAN from the iDEAL transaction. "If you want to use a payment method that creates a `directdebit` mandate, make sure to also enable the SEPA Direct Debit payment method in your Mollie profile." [docs]
- **Apple Pay and first payments:** the docs list Apple Pay under credit card as a valid first-payment method (hosted checkout), yielding a `creditcard` mandate — contrary to the assumption that it cannot. What is *not* documented is whether the direct integration (`applePayPaymentToken` + `method: creditcard`) can be combined with `sequenceType: first`; the direct-integration guide never mentions `sequenceType`/`customerId`. Verify with `GET /v2/methods?sequenceType=first&includeWallets=applepay` and a test payment. [docs for hosted; unverified for direct]
- Discover the methods that support `first` at runtime: `GET /v2/methods?sequenceType=first` (and `sequenceType=recurring` for methods usable for recurring charges). [both]
- The resulting mandate is linked to the payment: `payment.mandateId` is set on first/recurring payments and `_links.mandate` is present. [both]
- The mandate can also be created explicitly via `POST /v2/customers/{customerId}/mandates` with `method` (`directdebit` | `creditcard` | `paypal`), `consumerName`, `consumerAccount` (IBAN), `consumerBic`, `consumerEmail`, `signatureDate`, `mandateReference`, `paypalBillingAgreementId` — for importing existing mandates; not needed for a first-payment flow. [client] (docs: importing-card-mandates page exists)

### 6.3 Mandates [both]

- `GET /v2/customers/{customerId}/mandates` — query `from` (`mdt_…`), `limit` (1–250, default 50), `sort`, `scopes` (`customer-present` | `customer-not-present`), `testmode`. Response `{ count, _embedded: { mandates: [...] }, _links: { self, previous, next, documentation } }`. [both]
- `GET /v2/customers/{customerId}/mandates/{mandateId}`; `DELETE …/mandates/{mandateId}` revokes (client: `revoke`, returns `204`/true). [both]
- Mandate object: `resource: "mandate"`, `id` (`mdt_…`), `mode`, `status`, `method`, `details`, `mandateReference`, `signatureDate` (`YYYY-MM-DD`), `customerId`, `scopes` (docs example), `createdAt`, `_links.customer`. [both]
- `status` values: `valid`, `pending`, `invalid`. Docs: "A status can be `pending` for mandates when the first payment is not yet finalized, or when we did not received the IBAN yet from the first payment." A `pending` mandate is already usable for subscriptions: "Continue if there's a mandate with its `status` being either `pending` or `valid`, otherwise set up a first payment for the customer first." [both]
- `method` values: `directdebit`, `creditcard`, `paypal` (client enum and get-mandate docs). The recurring guide additionally mentions `bacs` for UK BACS mandates. [both; `bacs` docs only]
- `details` — directdebit/paypal: `consumerName`, `consumerAccount` (IBAN, or email for PayPal), `consumerBic` (DD only); creditcard: `cardHolder`, `cardNumber` (last four), `cardLabel`, `cardFingerprint`, `cardExpiryDate` (`YYYY-MM-DD`). [both]
- When a mandate becomes `invalid`: not described in detail; the recurring guide says that when a subscription with a fixed `mandateId` is cancelled by Mollie because of certain failure reasons, "cancelling the subscription based on the reasons above will also revoke the mandate itself." [docs]

### 6.4 Merchant-managed recurring charges (on-demand) [both]

`POST /v2/payments` with `sequenceType: "recurring"` and `customerId`; `mandateId` optional (if omitted Mollie picks one of the customer's valid mandates — client doc: "any of the customer's valid mandates may be used"; docs do not spell out the selection rule — [unverified]). No `redirectUrl` ("a recurring payment happens in the background without a browser session"). Docs example (verbatim):

```json
{
  "amount": { "currency": "EUR", "value": "10.00" },
  "customerId": "cst_Ok2DlrJe5",
  "mandateId": "mdt_h7Id8SjfJ",
  "sequenceType": "recurring",
  "description": "Background payment",
  "webhookUrl": "https://webshop.example.org/payments/webhook/"
}
```

- The response has no `_links.checkout`; status will be `pending` (SEPA DD, takes days) or quickly `paid`/`failed` (cards). Final status arrives via `webhookUrl`. [docs for the test-mode behaviour; live timing unverified]
- Use an `Idempotency-Key` on these POSTs so a retry cannot charge twice. [docs]

### 6.5 Subscriptions API (Mollie-managed) [both]

**Create** — `POST /v2/customers/{customerId}/subscriptions` → `201`. [both]

| Field | Required | Notes |
|---|---|---|
| `amount` | yes | per charge |
| `interval` | yes | `^\d+ (days?|weeks?|months?)$`, e.g. `"1 month"`, `"3 months"`, `"14 days"`, `"2 weeks"`. "The maximum interval is one year (`12 months`, `52 weeks`, or `365 days`)." Monthly charge on a non-existent day (e.g. 31 Feb) is charged on the last day of the month. |
| `description` | yes | "The subscription's description will be used as the description of the resulting individual payments." |
| `startDate` | no | `YYYY-MM-DD`; default: today [client/docs example "starting today"] |
| `times` | no | integer; omit (null) for an endless subscription. "Test mode subscriptions will get canceled automatically after 10 payments." |
| `method` | no | `creditcard` \| `directdebit` \| `paypal` \| null; "If omitted, any of the customer's valid mandates may be used." |
| `mandateId` | no | pin a specific mandate (`mdt_…`) |
| `webhookUrl` | no (recommended) | called for every payment created by the subscription |
| `metadata` | no | "automatically forwarded to the payments generated" |
| `applicationFee`, `profileId`, `testmode` | no | Connect/OAuth only |

**Subscription object** [both]: `resource: "subscription"`, `id` (`sub_…`), `mode`, `status`, `amount`, `times`, `timesRemaining`, `interval`, `startDate`, `nextPaymentDate` (`YYYY-MM-DD`; "If the subscription has been completed or canceled, this parameter will not be returned."), `description`, `method` (string|null), `mandateId?`, `customerId`, `webhookUrl`, `metadata`, `createdAt`, `canceledAt?` (ISO 8601, omitted unless canceled), `_links` (`self`, `customer`, `mandate?`, `profile?`, `payments?` — "Omitted if no such payments exist (yet)", `documentation`).

**Statuses** [both]: `pending`, `active`, `canceled`, `suspended`, `completed`. Docs: "The subscription's current status is directly related to the status of the underlying customer or mandate that is enabling the subscription." Client: "depends on whether the customer has a pending, valid or invalid mandate." Interpretation (pending mandate → `pending` subscription; valid → `active`; invalid → `suspended`; `times` reached → `completed`; cancelled by you or by Mollie → `canceled`) is consistent with those sentences but not spelled out per status in the docs — [partially unverified].

**Get** — `GET /v2/customers/{customerId}/subscriptions/{subscriptionId}` → `200`. **List** — `GET /v2/customers/{customerId}/subscriptions` (`from`, `limit`, `sort`); client also has `GET /v2/subscriptions` (all) and `GET /v2/customers/{customerId}/subscriptions/{id}/payments`. [both]

**Update** — `PATCH /v2/customers/{customerId}/subscriptions/{subscriptionId}` → `200`. Updatable: `amount`, `description`, `interval`, `startDate`, `times`, `metadata`, `webhookUrl`, `mandateId`. "Canceled subscriptions cannot be updated." [both]

**Cancel** — `DELETE /v2/customers/{customerId}/subscriptions/{subscriptionId}` → `200` with the subscription (`status: "canceled"`, `canceledAt`). "Canceling a subscription has no effect on the mandates of the customer." [both]

**How each charge is reported** [docs]: Mollie creates a payment per interval; it POSTs `id=tr_…` to the subscription's `webhookUrl` on every status change of that payment. "With subscriptions you do not know the payment ID in advance." "The payment object will, however, contain a `subscriptionId` field that contains the subscription ID you received when the subscription was created." Also `payment.customerId`, `payment.mandateId`, `payment.metadata` (copied from the subscription), `_links.subscription`.

**Failed subscription charges** [docs, verbatim]:
- "Mollie will retry the failed payment up to 5 times. If your subscription payment does not succeed, Mollie may attempt it again up to 5 times (once a day), depending on the failure reason."
- "In case of a successful retry, the next charge date will be updated according to the latest successful payment and the normal interval set by you."
- "After all retries have been exhausted, the subscription will be cancelled."
- "The retry behaviour may differ per payment method and failure reason."
- "Some chargeback/failure reasons will cancel your subscription." Immediately: AC01 "Account identifier incorrect (i.e. invalid IBAN)", AC04 "Account closed", AC06 "Account blocked for Direct Debit", MD07 "Debtor deceased", "Consumer account disabled (only for PayPal)", "Payment method inactive for customer". After three occurrences: MD01 (no mandate), MD06 (refund requested by debtor), MS02 (debtor refusal), MS03 (reason not specified), SL01 (specific bank service).
- "If your subscription has a fixed mandate set (`mandateId` field), cancelling the subscription based on the reasons above will also revoke the mandate itself."
- The docs page does **not** use the word "suspended" anywhere; the status exists in the enum (client + get-subscription docs). Whether a failed charge sets `suspended` vs. `canceled` beyond the quoted rules is therefore [unverified]. The client comment that the status "depends on whether the customer has a pending, valid or invalid mandate" suggests `suspended` = mandate invalid.
- Whether a retry is a new `tr_` payment or the same payment id is not stated — [unverified]; handle both (key on `subscriptionId` + `paidAt`, not on payment count).

---

## 7. Methods [both]

- `GET /v2/methods` (not paginated). Query: `sequenceType` (`oneoff` default | `first` | `recurring`), `locale`, `amount[value]` + `amount[currency]`, `billingCountry`, `includeWallets` (comma-separated: `applepay`, `googlepay`), `include` (`issuers`, `pricing`), `profileId`, `testmode`, `resource` (deprecated). Only online methods; "Test mode returns all pending/enabled methods; live mode returns only fully enabled"; default lists EUR methods only. [both]
- `GET /v2/methods/{id}` and `GET /v2/methods/all` also exist. [both]
- Response: `{ count, _embedded: { methods: [ { resource: "method", id, description, minimumAmount, maximumAmount|null, image: {size1x,size2x,svg}, status: activated|pending-boarding|pending-review|pending-external|rejected|null, issuers?, pricing? } ] }, _links }`. [both]
- Method ids (docs list): `alma, applepay, bacs, bancomatpay, bancontact, banktransfer, belfius, billie, billink, bizum, blik, creditcard, directdebit, eps, giftcard, googlepay, ideal, in3, kbc, klarna, mbway, mobilepay, multibanco, mybank, paybybank, paypal, paysafecard, przelewy24, riverty, satispay, swish, trustly, twint, vipps, voucher, wero`. Client enum additionally has `klarnapaylater, klarnapaynow, klarnasliceit, pointofsale` and historic `bitcoin, inghomepay, giropay, sofort`. The three you need: **`ideal`**, **`applepay`**, **`creditcard`**. [both]
- `applepay` only appears in the list when you pass `includeWallets=applepay` ("First, you must indicate to the List methods endpoint on the Methods API which wallets you support in your checkout by adding the `includeWallets=applepay` parameter."). [docs]

### Apple Pay [docs] apple-pay, direct-integration-of-apple-pay, request-apple-pay-payment-session; [client] ApplePayBinder

**Option A — hosted Mollie Checkout (no Apple domain work):**
- Enable both **credit card** and **Apple Pay** on the website profile in the Mollie Dashboard ("you need to enable both credit card and Apple Pay on your website profile"). [docs]
- Create the payment without `method` (Apple Pay button is shown during method selection to shoppers on a capable Apple device) or with `method: "applepay"`. Redirect to `_links.checkout`. [docs]
- The resulting payment is a card payment: `method` comes back as `applepay` [unverified exact value in response] with `details.wallet: "applepay"` [client]. A `first` Apple Pay payment yields a `creditcard` mandate (recurring guide). [docs]

**Option B — direct integration (Apple Pay button in your own checkout):**
1. Domain validation with **Apple** (not a Mollie dashboard setting): download `http://www.mollie.com/.well-known/apple-developer-merchantid-domain-association` and host it at `https://[your-domain]/.well-known/apple-developer-merchantid-domain-association`. "Before requesting an Apple Pay Payment Session, you must place the domain validation file on your server". [docs]
2. In the browser, feature-detect: `if (window.ApplePaySession && window.ApplePaySession.canMakePayments())`. [docs]
3. On `onvalidatemerchant`, your **server** calls `POST /v2/wallets/applepay/sessions` with `validationUrl` (from the ApplePayValidateMerchant event) and `domain` ("The domain of your web shop, that is visible in the browser's location bar"), optional `profileId`. "Payment sessions cannot be requested directly from the browser." Response `201`: opaque session `{ epochTimestamp, expiresAt, merchantSessionIdentifier, nonce, merchantIdentifier, domainName, displayName, signature }` — pass it unchanged to `session.completeMerchantValidation(...)`. Sessions expire after five minutes; request a new one per transaction. [both]
4. On `onpaymentauthorized`, send `event.payment.token` to your server and create the payment with `method: "creditcard"` (docs example — note: *not* `"applepay"*) and `applePayPaymentToken: JSON.stringify(token)`, plus `amount`, `description`, `webhookUrl`; `redirectUrl` may be omitted. Docs example (verbatim):

```json
{
  "method": "creditcard",
  "amount": { "currency": "EUR", "value": "100.00" },
  "description": "Order #1337",
  "applePayPaymentToken": "{\"paymentData\": {\"version\": \"EC_v1\", \"data\": \"vK3Bbr...lg==\"}}",
  "webhookUrl": "https://example.org/webhook"
}
```
5. Test mode: "You will need to do the Request Apple Pay Session API call in live mode, and only use test mode for the subsequent Create Payment API call." (i.e. the sessions endpoint needs a `live_` key and a validated live domain). [docs]

---

## 8. Refunds [both]

- `POST /v2/payments/{paymentId}/refunds` → `201` refund. Fields: `amount` (**required** in the docs schema — "The amount is allowed to be lower than the original payment amount"; the client also types it as required), `description` (max 255, may be shown to the customer), `metadata`, `reverseRouting` / `routingReversals` (Connect only), `testmode`. Partial refunds: send a smaller `amount`; multiple partial refunds allowed up to `amountRemaining`. [both]
- Duplicate protection: `409` if identical refund requests are submitted in quick succession; `422` on validation errors (e.g. missing amount). [docs]
- Refund object: `resource: "refund"`, `id` (`re_…`), `mode`, `amount`, `settlementId?`, `settlementAmount?`, `description`, `metadata`, `status`, `paymentId`, `createdAt`, `_links` (`self`, `payment`, `settlement?`, `documentation`). [both]
- Statuses (docs verbatim): `queued` "The refund is queued due to a lack of balance." (no webhook, cancelable); `pending` "The refund is ready to be picked up for processing." (no webhook, cancelable); `processing` "The refund is being processed." (webhook); `refunded` "The refund has been completed and your customer has either received the funds or the funds are on their way." (webhook); `failed` "The refund has failed after processing." (webhook, funds return to your balance); `canceled` "The refund was canceled and will no longer be processed." (no webhook). Client enum has the same six values. [both]
- Webhook: the **payment's** `webhookUrl` is called (with the payment id) when the refund reaches `processing`, `refunded` or `failed`; then `GET` the payment and read `amountRefunded` / `_embedded.refunds` (use `embed=refunds`), or `GET /v2/payments/{paymentId}/refunds`. [docs]
- `GET /v2/payments/{paymentId}/refunds/{refundId}`, `GET /v2/payments/{paymentId}/refunds`, `DELETE /v2/payments/{paymentId}/refunds/{refundId}` (cancel; only while `queued`/`pending`), `GET /v2/refunds` (all). [both]
- "Refunds are not available for some payment methods, however, such as paysafecard and gift cards." iDEAL, cards and Apple Pay (card) are refundable. [docs for the exclusion; the positive statement is [unverified] wording]
- In test mode, a paid test payment's `_links.changePaymentState` page lets you create a refund/chargeback to exercise the webhook. [docs]

---

## 9. Testing [docs] /reference/testing, recurring-payments

- Use the `test_` API key; everything else is identical to live, including webhook calls. [docs]
- Hosted checkout in test mode: "When creating payments or orders in test mode, the regular checkout hosted payment pages will be replaced by a test mode checkout screen", where you pick the resulting state instead of paying. The docs show it as a screenshot; the list of selectable states (paid / failed / canceled / expired / open / pending / authorized) is **not** enumerated in the text — [unverified list; the selector itself is confirmed]. "Most test mode payment resources will feature a `checkout` URL just like in live mode, which then allows you to walk through the payment process without spending actual money."
- Recurring in test mode (verbatim): "For test mode recurring payments, the resource will not contain a `checkout` URL, because these payments are executed without any interaction of your customer. Instead, a `changePaymentState` URL is added, which allows you to set the final payment state for these payments. For paid test mode payments the resource will also include the `changePaymentState` URL which allows you to create a refund or chargeback for that payment directly from our hosted payment page." Also: "When creating a recurring payment in test-mode, use the `changePaymentState` url to transition the payment to a final state."
- Test subscriptions: "Test mode subscriptions will get canceled automatically after 10 payments." [both]
- Test cards: Amex `3782 822463 10005`, Mastercard `2223 0000 1047 9399`, Visa `4543 4740 0224 9996`; failure simulation by magic amounts €1,001.00 (`invalid_card_number`) … €1,010.00 (`authentication_failed`), €1,011.00 (`card_declined`). [docs]
- Apple Pay in test mode: hosted checkout — not described; direct integration — session call must be live, payment call can be test (see §7). [docs]
- iDEAL in test mode: handled by the generic test checkout status selector (no special test issuer documented on the page). [unverified beyond the generic selector]

---

## 10. Errors and rate limits [both]

Error body (all 4xx/5xx), docs verbatim shape:

```json
{
  "status": 422,
  "title": "Unprocessable Entity",
  "detail": "The amount is required.",
  "field": "amount",
  "_links": { "documentation": { "href": "...", "type": "text/html" } }
}
```

`field` is optional (present for validation errors). The client maps this to `ApiError { message = detail, title, statusCode = status, field, links, idempotencyKey }`. [both]

HTTP codes (docs verbatim): 200 OK; 201 Created; 204 No Content ("The requested entity was canceled / deleted successfully"); 400 Bad Request; 401 Unauthorized ("failed authentication"); 403 Forbidden; 404 Not Found; 405 Method Not Allowed; 415 Unsupported Media Type; 422 Unprocessable Entity ("We could not process your request"); 429 Too Many Requests; 500 Internal Server Error; 503 Service Unavailable.

Rate limiting [docs] /reference/rate-limiting: "Rate limits are scoped per merchant and calculated dynamically based on observed traffic patterns" — no fixed published number. Headers: `RateLimit-Policy` and `RateLimit` on every response (e.g. `"get-v2-payments";q=20;w=3;mollie-burst=60`), `Retry-After` (seconds) on `429`. Guidance: back off and retry; contact Mollie in advance for traffic spikes. The Node client retries only 5xx (3 attempts), not 429.

---

## 11. Suggested flows (derived; endpoints above are confirmed, the orchestration is ours)

**One-off (iDEAL / card / Apple Pay via hosted checkout)**
1. `POST /v2/payments` {amount, description, redirectUrl (with order id), cancelUrl, webhookUrl, metadata:{orderId}, optional method:"ideal"|"creditcard"|"applepay", locale:"nl_NL"} — with `Idempotency-Key`.
2. Store `payment.id`; HTTP 303 to `_links.checkout.href`.
3. Webhook: `id=tr_…` → `GET /v2/payments/tr_…` → act on `status` (`paid` → fulfil; `failed|canceled|expired` → release stock); return 200.
4. Redirect page: read order state from your DB; if still open, fetch the payment once (the webhook may be late).

**Subscription**
1. `POST /v2/customers` → `cst_…`.
2. `POST /v2/payments` {sequenceType:"first", customerId, amount (can be the first period's price or €0.01), redirectUrl, webhookUrl}; customer pays via iDEAL/card/Apple Pay in checkout.
3. Webhook → payment `paid` and `mandateId` set → `GET /v2/customers/{cst}/mandates` (status `valid` or `pending` is fine).
4. `POST /v2/customers/{cst}/subscriptions` {amount, interval:"1 month", description, startDate (next period), webhookUrl, metadata, optional mandateId}.
5. Every period: webhook with a new `tr_…`; fetch it; `subscriptionId` links it back; `paid` → extend access, `failed` → Mollie retries (SEPA) / may cancel the subscription — re-fetch the subscription and check `status`.
6. Cancel: `DELETE /v2/customers/{cst}/subscriptions/{sub}`.

---

## Open questions (could not be confirmed from docs or client source)

1. **Apple Pay + `sequenceType: first` via direct integration** (`applePayPaymentToken` + `method: "creditcard"` + `customerId`): hosted-checkout Apple Pay is documented as creating a `creditcard` mandate; the direct-integration guide is silent on `sequenceType`. Test it, or ask Mollie support.
2. **Exact selectable states on the test-mode checkout screen** (docs only show a screenshot). Expected: paid / failed / canceled / expired / open(pending), plus authorized for manual capture — unverified list.
3. **Per-method cancelability** (`DELETE /v2/payments/{id}`): the docs page only says "usually until the next business day or as long as the payment status is open" and to check `isCancelable`; no per-method table was found on the current page.
4. **Subscription `suspended` semantics**: the recurring guide never uses the word; only the enum and the sentence "status is directly related to the status of the underlying customer or mandate" exist. Whether exhausted retries yield `canceled` (docs say "cancelled") and invalid mandate yields `suspended` is inferred.
5. **Whether a subscription retry reuses the same `tr_` id or creates a new payment**, and how many days before `nextPaymentDate` SEPA payments are created — not stated.
6. **Mandate selection rule when `mandateId` is omitted** on `recurring` payments/subscriptions (which valid mandate wins if the customer has several) — only "any of the customer's valid mandates may be used".
7. **Response `method` value for Apple Pay payments** (`"applepay"` vs `"creditcard"` + `details.wallet: "applepay"`): the client types `wallet?: 'applepay'` inside `CreditCardDetails`; the docs excerpts did not show an Apple Pay payment response.
8. **Update-payment constraints** (`PATCH /v2/payments/{id}`): fields confirmed from the client, lifecycle constraints not fetched.
9. **Numeric rate limits**: intentionally undocumented by Mollie ("calculated dynamically"); rely on `RateLimit`/`Retry-After` headers.
10. **Webhook in test mode for `first` payments and mandate creation timing** (does the mandate exist at the moment the `paid` webhook fires?): the guide says the account is "immediately chargeable" after the first payment succeeds, but does not state ordering relative to the webhook.
