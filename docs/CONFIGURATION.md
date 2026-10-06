# Configuration & launch checklist

Everything commercial is centralised in `src/config/commerce.js` and overridable
with environment variables — no hunting through templates. The production build
(`npm run build` on Vercel with `VERCEL_ENV=production`) **refuses to deploy**
while a required value is still a placeholder (`tools/check-config.js`).
Preview deployments build with placeholders and show a yellow dev banner.

## 1. Values that are still open (from the brief, §43)

| Decision | Env variable | Placeholder now | Where it shows |
|---|---|---|---|
| Retail price | `RYNSE_PRICE_CENTS` | 1500 (€15,00) | hero, panel, cart, checkout, e-mails |
| Price is final → publish in structured data | `RYNSE_PRICE_IS_FINAL=true` | false (no `offers` in JSON-LD) | Google rich results |
| Subscription frequency | `RYNSE_SUBSCRIPTION_INTERVAL` | `1 month` (Mollie syntax: `2 weeks`, `30 days`, …) | panel, checkout terms, Mollie subscription |
| Subscription discount | `RYNSE_SUBSCRIPTION_DISCOUNT_PCT` | unset → no % shown | panel tag, pricing |
| Loyalty % per year | `LOYALTY_YEAR_1_DISCOUNT` … `LOYALTY_YEAR_4_DISCOUNT` | unset → "Benefit announced at launch" | loyalty ladder, renewal pricing |
| Shipping cost | `RYNSE_SHIPPING_CENTS` | 395 | cart, checkout, FAQ, legal |
| Free-shipping threshold | `RYNSE_FREE_SHIPPING_THRESHOLD_CENTS` | 3000 | pricing |
| Subscriptions ship free | `RYNSE_SUBSCRIPTION_SHIPS_FREE` | true | pricing |
| Delivery time | `RYNSE_DELIVERY_ESTIMATE` | `[delivery time TBD]` | checkout, FAQ, legal |
| Return window | `RYNSE_RETURN_WINDOW_DAYS` | 14 | FAQ, legal |
| Legal entity / address / KvK / VAT | `RYNSE_LEGAL_NAME`, `RYNSE_LEGAL_ADDRESS`, `RYNSE_KVK`, `RYNSE_VAT` | `[… TBD]` | footer, legal pages, contact |
| Support e-mail | `RYNSE_SUPPORT_EMAIL` | hello@getrynse.example | footer, e-mails, contact |
| Ship-to countries | worldwide by default; exclude with `RYNSE_EXCLUDED_COUNTRIES=XX,YY` | all countries | checkout |
| Shipping rate Europe (ex-NL) | `RYNSE_SHIPPING_EU_CENTS` / `RYNSE_FREE_SHIPPING_EU_THRESHOLD_CENTS` | €7.95 / free from €50 | checkout, FAQ, legal |
| Shipping rate rest of world | `RYNSE_SHIPPING_WORLD_CENTS` / `RYNSE_FREE_SHIPPING_WORLD_THRESHOLD_CENTS` | €14.95 / free from €75 | checkout, FAQ, legal |

Loyalty rule (implemented in `src/server/loyalty.js`, tested in `tests/payments.test.js`):
level = full uninterrupted years + 1; exists only while the subscription is active;
cancellation (by customer, admin or Mollie after failed retries) resets to year 1;
a new subscription starts again at year 1. Base subscription discount and loyalty
discount do not stack — the higher one applies.

## 2. Infrastructure

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (Neon, Vercel Postgres, Supabase…). Run `npm run db:migrate` once (locally with the production URL, or from a one-off script). Pooled connection strings work (`prepare` is off by default). |
| `SESSION_SECRET` | ≥ 32 random chars; signs account sessions. |
| `ADMIN_TOKEN` | Random token for `/admin`. |
| `CRON_SECRET` | Vercel sets the header for `/api/cron/daily` (daily subscription reconciliation). |
| `SITE_URL` | Public https origin — used for Mollie redirect/webhook URLs, sitemap, canonicals, e-mails. |
| `EMAIL_PROVIDER` | `resend` + `RESEND_API_KEY` + `EMAIL_FROM` (verified domain). `log` only prints. |
| `GA4_MEASUREMENT_ID`, `GOOGLE_ADS_ID`, `META_PIXEL_ID`, `TIKTOK_PIXEL_ID` | Optional; loaded only after cookie consent. |

## 3. Mollie go-live

1. Dashboard → create the website profile, enable **iDEAL**, **Credit card**, **Apple Pay** and **SEPA Direct Debit** (iDEAL first payments create direct-debit mandates for subscriptions).
2. Apple Pay via the hosted checkout needs no domain file. (Direct integration — Apple Pay button inside our checkout — is prepared: `requestApplePaySession()` in `src/server/payments/mollie.js`, domain file goes in `src/web/assets/well-known/`; only enable when a live key is active.)
3. Set `PAYMENT_PROVIDER=mollie`, `MOLLIE_API_KEY=test_…` on a **preview** deployment, run the scenarios (section 5) with Mollie's test checkout.
4. Set `MOLLIE_API_KEY=live_…` on production. Webhook URL is `SITE_URL/api/webhooks/mollie` (Mollie calls it with `id=tr_…`; we always fetch the payment, so forged webhooks are harmless).
5. Watch the first live orders in `/admin`.

## 4. Vercel

- Import the GitHub repo. Framework preset: **Other**. Build command / output dir are read from `vercel.json` (`npm run build` → `dist`). No install step needed (zero dependencies).
- Region `fra1` is set for the function (EU data). Cron: daily 04:17 UTC.
- Add the environment variables above (Production + Preview). Previews can keep the emulator (`PAYMENT_PROVIDER=emulator`) for demos: the fake checkout lives at `/api/emulator/checkout`.
- Custom domain → set `SITE_URL` to it.
- **First deploy / demo mode.** The Vercel project `rynse-webshop` is linked to the GitHub repo; every push to `main` deploys. While commercial values are placeholders, `RYNSE_DEMO=true` keeps the build from refusing (dev banner + payment emulator stay on). Remove `RYNSE_DEMO` to enforce the production guard.
- **Database.** Add a Postgres connection string as `DATABASE_URL` (Supabase → Project settings → Database → connection string, *Transaction pooler* URI; Neon/Vercel Postgres also work). Then apply the schema once from the deployed function: `curl -X POST -H "authorization: Bearer $ADMIN_TOKEN" https://<site>/api/admin/migrate`. `GET /api/health` tells you what is still missing.
- `cleanUrls: true` serves `/faq`, `/checkout`, `/nl/faq` … from the built `.html` files; `/order/:number` (and the `/nl/`, `/es/` variants) are rewritten to the order page, which reads the number and its access token (`?t=`) client-side.
- Language by IP: `middleware.js` (Vercel Edge) redirects first visits based on `x-vercel-ip-country` — NL → `/nl/`, Spanish-speaking countries → `/es/`, everything else stays English. A manual choice (footer/nav switcher) sets the `rynse_lang` cookie, which always wins; bots are never redirected and every locale has its own canonical + hreflang.
- Order and account links are per order: `/order/RY-…?t=<token>` (token stored in `orders.access_token`, also used for the retry/cancel flow). Magic-link sign-in opens a page that posts the token once (scanner-safe).

## 5. Test scenarios (brief §44)

Automated against the emulator: `npm test` (27 tests, incl. i18n and the QA-fix regression suite: paid/canceled/failed/pending/expired iDEAL & card & Apple Pay, duplicate webhooks, refunds, first & recurring subscription payments, failed renewals, cancellation, loyalty reset, re-subscribe at year 1, late webhook, page refresh, forged webhook, CSRF, rate limits, frontend-amount tampering).

Against Mollie test mode (manual, once per release): run the same list through the hosted test checkout; recurring test payments are finalised via Mollie's `changePaymentState` link; test subscriptions auto-cancel after 10 payments.

Browser e2e: `npm run test:e2e` (Playwright, 156 checks; purchase flows in EN/NL/ES, 7 viewports, language switching + geo suggestion, links, SEO).

## 6. Replacing assets

- Logo: `src/web/assets/brand/rynse-wordmark.svg` (vector, traced from the supplied PDF) — the nav, footer and sachet component read it; `rynse-logo-full.svg` includes the tagline.
- Product / lifestyle images & hero frames: see `docs/HIGGSFIELD.md` (manifest-driven, no code changes).
- Payment icons: `src/web/assets/payment/` (official files from Mollie's open-source plugin; see `SOURCES.md` there).

## 7. Known limitations / decisions still open

- **Worldwide shipping.** Three zones (`nl`, `europe` = EU + EEA/CH/UK/Balkans, `world`) with their own rate and free-shipping threshold, all placeholders until logistics are final. Prices are in EUR everywhere (Mollie settles in EUR; cards convert). Outside the EU the checkout, FAQ and legal pages state that import duties/taxes are payable by the recipient (DDU); switch to DDP only if the carrier contract supports it. Exclude destinations you cannot serve (sanctions, carrier limits) with `RYNSE_EXCLUDED_COUNTRIES`. iDEAL is only offered when shipping to NL; card is the default elsewhere. The checkout pre-selects the visitor's IP country.
- **Session revocation.** Account sessions are short-lived signed cookies; there is no server-side revocation list. Rotate `SESSION_SECRET` to invalidate all sessions at once.
- **Mollie test mode.** Recurring test payments and subscription charges are finalised through Mollie's dashboard/`changePaymentState`; the emulator covers these automatically.
