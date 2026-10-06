# RYNSE — webshop

**Stay fresh. Anywhere.** Premium direct-to-consumer shop for RYNSE cleansing wipes:
one product, one page that is brand site + landing page + product page, direct purchase
from the hero, one-time or subscription, Mollie-ready payments (iDEAL, Apple Pay, cards),
loyalty engine for uninterrupted subscribers.

## Stack (zero npm dependencies)

- **Front-end:** static HTML generated at build time from JS templates (`src/web`), one CSS file, small vanilla JS per page. Mobile-first, navy + gold design system, real vector logo, scroll-driven Higgsfield hero (frame sequence on `<canvas>`, poster + reduced-motion fallbacks).
- **API:** one Vercel Function (`api/index.js` → `src/server/app.js`, Web-standard `fetch` handler) that also runs locally via `src/server/dev.js`.
- **Database:** PostgreSQL (`db/migrations`), driver vendored in `vendor/postgres` (public domain).
- **Payments:** `src/server/payments/mollie.js` (thin client over the Mollie v2 API, verified against the official docs — see `docs/mollie-api-reference.md`) and an **emulator** with the same interface for development and tests.
- **Subscriptions & loyalty:** `src/server/subscriptions.js`, `src/server/loyalty.js` (real backend rules, not copy).
- **Webhooks:** idempotent per (payment, status, refunded amount); never trusts the redirect; handles late/duplicate/forged webhooks (`src/server/webhooks.js`).
- **E-mail:** Resend via REST (or log), every transactional mail sent at most once (`email_log`).
- **Accounts:** passwordless magic links; cancel subscription, see orders and loyalty level.
- **Admin:** `/admin` — orders, fulfilment (ship + tracking), refunds, subscriptions.
- **SEO/GEO:** semantic HTML, unique titles/descriptions, canonicals, Open Graph, JSON-LD (Organization, WebSite, Product, FAQPage, BreadcrumbList — no invented prices/reviews), sitemap, robots, `llms.txt`.
- **Analytics:** GA4-style e-commerce events (`view_item`, `select_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `add_payment_info`, `purchase`, `subscription_selection`, `subscription_purchase`) via `dataLayer`; GA4 / Google Ads / Meta / TikTok load only after consent.

## Run locally

```bash
cp .env.example .env            # fill in DATABASE_URL (local Postgres is fine)
npm run db:migrate
npm run build                   # → dist/
npm run dev                     # http://localhost:3000 (payment emulator)
```

Tests: `npm test` (payment scenarios, needs `rynse_test` database) · `npm run test:e2e` (Playwright, needs the dev server running).

## Deploy

See `docs/CONFIGURATION.md` — environment variables, Mollie go-live, Vercel setup, the open commercial decisions and how to swap assets (`docs/HIGGSFIELD.md`).

## Layout

```
api/index.js              Vercel Function entry
src/config/commerce.js    ALL commercial values (price, shipping, subscription, loyalty, copy, socials, Mollie)
src/server/               app router, security, pricing, orders, webhooks, subscriptions, loyalty, email, admin, payments/
src/web/                  build.js, templates/, styles/, scripts/, assets/ (brand, payment, fonts, img, hero)
db/migrations/            SQL schema
tests/                    node:test scenarios + Playwright e2e
tools/                    migrate, config check, asset pipeline, dev helpers
assets-src/manifest.json  source URLs for generated media
docs/                     configuration, Higgsfield, Mollie reference, QA report
```
