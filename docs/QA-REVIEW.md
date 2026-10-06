# RYNSE — Independent QA review (code-only)

Scope: static review of the codebase against the brief (sections 6–14, 18–28, 31–35, 39–42, 46) and `docs/mollie-api-reference.md`. No servers were run; nothing was modified except this file. Line numbers refer to the files as reviewed on 2026-10-06.

---

## Verdicts per role

**1. Security-minded developer.** The fundamentals are right: prices are never taken from the browser (`src/server/pricing.js`, `src/server/orders.js:59`), the webhook never trusts its payload and always re-fetches the payment (`src/server/webhooks.js:33`), the tagged-template driver prevents SQL injection, server templates escape consistently, secrets never reach `publicConfig()`, sessions are HMAC-signed and HttpOnly, and CSRF uses double-submit + Origin check. Real gaps remain: the magic-link login is a GET with side effects (link scanners burn the one-time token), `/api/events` is an unauthenticated, unlimited write path into Postgres, an unauthenticated checkout can overwrite another customer's name/locale and flip their marketing consent, the order-status endpoint is guessable (sequential number + e-mail that travels in URLs), and a handful of smaller items (non-constant-time cron compare, no CSP, no session revocation). Nothing is a "pay without paying" hole.

**2. Backend / e-commerce architect.** The state machine (payment vs. fulfilment, `webhook_events` idempotency gate, `email_log` dedupe, `FOR UPDATE` locking, re-subscribe = new row = year 1) is thoughtfully built and the loyalty rules match the brief. Three design flaws will bite in production: (a) orders/subscriptions whose hosted payment is cancelled never get a webhook when `method` is forced (Mollie docs §4) and nothing reconciles `open` payments, so they stay `open`/`pending` forever; (b) renewal pricing after a loyalty anniversary is wrong for one cycle — Mollie charges the old amount while the local order records the new, lower total; (c) `createSubscription` runs inside a DB transaction that can roll back, and the idempotency key only protects for one hour while Mollie retries for 26 h, so a duplicate Mollie subscription (double charging) is possible. Latency risks: synchronous e-mail sends and Mollie calls while holding row locks; the daily cron can exceed `maxDuration`.

**3. Senior frontend developer.** The scripts are compact, dependency-free and mostly correct: cart/quote/checkout/order polling work as designed, the language switcher maps `/order/:number` correctly, reduced-motion is honoured everywhere, and contrast of gold (#e2c272, ≈11:1) and muted text (#8d93a8, ≈6.3:1) on navy passes AA. Weak spots: no focus trap in the cart drawer/menu, validation errors are not programmatically associated with their inputs and the form-level error box is not a live region, the quote cache memoises rejected promises, `maxQuantity` is hard-coded in the client, and the retry path (`?retry=`) silently turns an abandoned subscription into a one-time order when the cart is empty.

**4. Mobile e-commerce / CRO specialist.** Purchase path is short (hero → panel → drawer → one-page checkout → Mollie), one-time is pre-selected (no pre-checked paid upsell), Apple Pay is only offered when `ApplePaySession.canMakePayments()` is true, and the subscription note/terms copy is clear. Two significant misses against the brief: on mobile the subscription terms box renders *below* the "Pay & subscribe" button (summary aside comes after the form), so the user can pay before reading them; and the product selector is not above the fold — the hero is 200svh tall, so price/one-time/subscribe/CTA are reached after ~1.6 viewports of scrolling (the hero itself only has a "Get RYNSE" anchor and the price).

**5. SEO / GEO-AEO specialist.** Per-locale canonical, hreflang incl. x-default, OG/Twitter, Organization/WebSite/Product (no invented offers or reviews)/FAQPage/BreadcrumbList, localized sitemap, robots, `llms.txt`, and crawlable product facts in plain HTML are all present and correct; the middleware exempts bots. One likely blocker: `vercel.json` has no `cleanUrls`, so extension-less page URLs (`/faq`, `/why-rynse`, `/checkout`, …) will 404 on Vercel while `/faq.html` works — the dev server masks this. Minor: home `<title>` is not localized (identical EN string on `/nl/` and `/es/`), FAQPage is duplicated on home and `/faq`, `lastmod` is always the build date, heading levels skip h1→h3 on checkout/account.

**6. Performance specialist.** Critical path is lean (two preloaded woff2 ≈55 KB, single hashed CSS, small unminified JS, AVIF/WebP `<picture>` with `sizes`, `fetchpriority=high` poster with explicit dimensions, lazy lifestyle images, immutable asset caching). The hero frame sequence is the risk: `hero.js` downloads *all* 96 desktop (3.5 MB) or 64 mobile (1.6 MB) frames on every homepage visit — triggered by an idle callback with a 1.5 s timeout, i.e. before LCP finishes on slow networks — and retains them as decoded `Image` objects (up to several hundred MB on mobile), regardless of whether the visitor scrolls. The client-side `/api/geo` fallback also costs a function invocation on every English page view without a language cookie.

**7. Brand / art director + copywriter.** The copy is on-brief: hero headline exact, "No shower. No problem.", "Freshness that fits in your pocket", "Wherever you go, RYNSE goes." are used; no reviews, no countdowns, no certifications, no percentages (ladder shows "Benefit announced at launch"); only Instagram and TikTok are shown; payment logos are official files (`SOURCES.md`). Translations read as native, confident copy rather than literal (NL "Nul gedoe.", ES "Si no hay grifo, hay RYNSE."). Issues: the confirmation e-mail promises a "pause" feature that does not exist; "enough for a month of real life" is an unsupported usage claim; brand-term handling is inconsistent across languages (NL keeps "water-based / pH-balanced / cleansing wipes" in English, ES translates them; NL keeps "Get RYNSE", ES uses "Consigue RYNSE"); NL "Je bent klaar." reads like "you're finished".

---

## Ranked findings

### Blockers

**1. Extension-less page URLs will 404 on Vercel (no `cleanUrls`).**
Role: SEO / frontend. `vercel.json:1-26`, `src/web/build.js:57-70`, `src/server/dev.js:21`.
The build writes `why-rynse.html`, `faq.html`, `checkout.html`, … and every link points to `/why-rynse`, `/faq`, `/checkout`. `vercel.json` sets neither `cleanUrls` nor `trailingSlash`; Vercel only strips `.html` when `cleanUrls: true`. The local dev server hides this because `resolveStatic` tries `${p}.html` (`dev.js:21`). Only `/`, `/nl/`, `/es/`, `/order/:n` and `/admin` (explicit rewrites) would work in production; nav, footer, checkout, account and all legal pages would 404, and Mollie's `cancelUrl` (`/checkout?canceled=…`) too.
Fix: add `"cleanUrls": true, "trailingSlash": false` to `vercel.json` (this also 308-redirects `/faq.html` → `/faq`, removing duplicate URLs), and verify on the first preview deploy.

**2. Subscription terms are shown *after* the Pay button on mobile.**
Role: CRO / legal. `src/web/templates/pages.js:76-112`, `src/web/styles/main.css:310-311`, `src/web/i18n/en.js:239`.
`[data-sub-terms]` ("This is a subscription… charged every month at €X… cancel anytime") lives in `<aside class="checkout-summary">`, which comes after the `<form>` in the DOM. `.checkout-grid` is a single column below 960 px, so on every phone the terms box (and the "Total to pay now") are below `[data-pay]`. Brief §25 requires that before payment it is "glashelder" that it is a subscription, how often is billed and for what amount; EU consumer rules require this immediately before the order button.
Fix: on mobile render the summary (mode, totals, sub-terms) above the payment section (CSS `order` on the grid, or move `[data-sub-terms]` into the form directly above `[data-pay]`), and keep the amount in the button label as now.

### Major

**3. Cancelled hosted payments never reach a final state; nothing reconciles `open` payments.**
Role: backend. `src/server/orders.js:55,105` (method always forced), `src/server/webhooks.js`, `src/server/subscriptions.js:159-186`, `src/server/app.js:200-207`.
Checkout always sends `method` (`checkout.js:71`, iDEAL pre-selected). Per `docs/mollie-api-reference.md:197`: "The webhook is not called if you have specified a `method` and the consumer cancels the payment on the payment page." Mollie sends the customer to `cancelUrl` (`/checkout?canceled=…`), which never calls `/api/orders/:number`, so the order stays `open` and — for subscriptions — the `subscriptions` row stays `pending` forever. The daily cron only reconciles `active/past_due/suspended` subscriptions; there is no sweep of `open`/`pending` orders past `expiresAt`.
Fix: cron step that fetches every payment with `payment_status IN ('open','pending')` older than ~1 h via `getPayment` and runs `applyPayment`; have the `?canceled=` landing call the status endpoint; consider omitting `method` for hosted checkout (customer picks on Mollie's page, webhook always fires).

**4. Renewal pricing is wrong for one cycle after a loyalty level change (customer overcharged, order under-recorded).**
Role: backend / loyalty. `src/server/subscriptions.js:62-70, 83-100`, `src/server/webhooks.js:144-160, 100-102`.
The Mollie subscription is created with the level-1 amount (`subscriptions.js:61-63`). When the anniversary passes, Mollie still charges the old amount; the webhook creates the renewal order with `quote(... loyaltyLevel: levelFor(sub))` (`webhooks.js:151`), i.e. the *new, lower* total. Result: `orders.total_cents` < amount actually paid, the amount-mismatch note fires (`webhooks.js:100`), the confirmation e-mail shows the lower total, and only afterwards `recordRenewalPayment` PATCHes the Mollie amount (`subscriptions.js:94-96`). The same happens whenever `RYNSE_PRICE_CENTS`, shipping or discount config changes. The brief's "backend bepaalt wat een order kost" is violated in the other direction: Mollie decides.
Fix: in the daily cron, compute `quote(levelFor(sub))` for every active subscription and `updateSubscription` when it differs *before* `next_payment_date`; record renewal orders with the amount Mollie actually charged and flag (don't silently accept) a mismatch; cover with a test (loyalty year-2 renewal).

**5. Duplicate Mollie subscription possible after a rolled-back activation.**
Role: backend. `src/server/subscriptions.js:62-78`, `src/server/webhooks.js:49-57`, `docs/mollie-api-reference.md:36`.
`createSubscription` is called inside the webhook transaction, and the Mollie id is only persisted at the end. If anything after it throws (e.g. the `UPDATE subscriptions` or `appendHistory`), the transaction rolls back, the `webhook_events` gate row is deleted, and Mollie's retry (up to 26 h later) sees `mollie_subscription_id IS NULL` and creates again. The idempotency key `sub-${sub.id}` only dedupes for 1 hour at Mollie — after that the customer has two active subscriptions and is charged twice per interval.
Fix: before creating, list the customer's Mollie subscriptions and reuse one whose `metadata.subscriptionId` matches; or persist `mollie_subscription_id` in its own committed statement immediately after the create, outside the main transaction.

**6. Magic-link sign-in is a GET with side effects — e-mail link scanners consume the token.**
Role: security / UX. `src/server/app.js:134-143`, `src/server/email/templates.js:84-89`.
`GET /api/auth/verify?token=…` marks the token used and sets the session. Corporate/consumer mail security (Outlook SafeLinks, Gmail pre-fetch, antivirus) follows links before the user does; the user then lands on `/account?error=link`. The token also ends up in Vercel request logs. Login-CSRF is also possible (a victim can be logged into an attacker-chosen account by visiting the link).
Fix: the link opens a tiny page with a "Sign in" button that POSTs the token (CSRF-protected), or verify on GET but only *consume* on a subsequent POST; never log the query string.

**7. `/api/events` is an unauthenticated, unlimited write path; contact messages (PII) go into the analytics table.**
Role: security. `src/server/app.js:190-197`, `app.js:183-184`.
No CSRF, no rate limit, no size cap other than 8 KB per call, `payload` stored verbatim → anyone can fill Postgres (Neon/Vercel Postgres bills storage) with a one-line loop. `/api/contact` additionally inserts `{email, name, message}` into `analytics_events`, mixing personal data into an analytics table with no retention policy (privacy page says nothing about it).
Fix: `rateLimit(req, 'events', {limit: 60, windowSec: 60})`, whitelist event names and payload keys, cap `payload` to a few hundred bytes; store contact messages in their own table (or don't store them) and mention it in the privacy policy.

**8. Hero frame sequence downloads 1.6–3.5 MB on every home visit and holds every frame decoded.**
Role: performance. `src/web/scripts/hero.js:86-114, 130`, `src/web/assets/hero/manifest.json`.
`loadFrames` runs via `requestIdleCallback(…, {timeout: 1500})` on every homepage load, fetches all 64 (mobile, 1.6 MB) or 96 (desktop, 3.5 MB) WebP frames with 4 parallel connections, and keeps them as `HTMLImageElement`s in `frames.images` (64 × 720×1274 ≈ 235 MB if the browser keeps them decoded). It happens whether or not the visitor scrolls, and on slow networks it starts before LCP completes, competing with the poster/fonts. `saveData`/`lowEnd` halving helps only a minority of devices. Brief §11: "preload alleen voor kritieke hero-assets", "lichtere mobiele variant".
Fix: load only frame 0 until the first scroll event (or until `progress > 0`), fetch frames in scroll-proximity order with a small window, free `img.src` of frames far from the current index, consider 32–48 frames on mobile, and prefer `createImageBitmap` so memory is explicit and releasable (`bitmap.close()`).

**9. A stale `pending` subscription row shadows the real one and never expires.**
Role: backend. `src/server/subscriptions.js:189-194`, `src/server/orders.js:71-72`, `src/server/subscriptions.js:161`.
`subscriptionSummary` takes `ORDER BY created_at DESC LIMIT 1`. A customer with an active subscription who later starts (and abandons) a second subscription checkout gets a `pending` row (allowed by `orders.js:72`) that becomes the "current" subscription in their account: status "pending", no cancel button, loyalty "not active", while the real one keeps charging. Pending rows are never cleaned (see finding 3). `suspended` is also missing from the duplicate check at `orders.js:71`, so a suspended subscriber can open a second one.
Fix: summary prefers `active/past_due/suspended` over `pending`; expire `pending` rows whose first payment is final/expired; include `suspended` in the duplicate check.

**10. Order status is guessable (sequential number + e-mail) and the e-mail travels in URLs.**
Role: security / privacy. `src/server/app.js:60-74`, `src/server/orders.js:12, 92, 130`, `src/server/email/templates.js:42`, `src/web/scripts/account.js:100`.
Order numbers are `RY-2026-00NNNN` from a global sequence; the only secret is the e-mail, which is appended as `?e=` to Mollie's `redirectUrl`, the confirmation e-mail link and the account page links — so it sits in Mollie's logs, browser history, Vercel logs and any `Referer` to third parties (Referrer-Policy is strict-origin-when-cross-origin, which helps). Anyone who knows a customer's e-mail can enumerate their orders (name, street address, status) at 60 requests/min/IP.
Fix: add a per-order random `access_token` (or an HMAC of number+email) to the order and use `/order/RY-…?t=<token>`; keep the rate limit.

**11. Unauthenticated checkout can rewrite another customer's profile and opt them into marketing.**
Role: security / GDPR. `src/server/orders.js:28-34, 63`.
`upsertCustomer` does `ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, locale = EXCLUDED.locale, marketing_consent = customers.marketing_consent OR EXCLUDED.marketing_consent` for *any* e-mail typed into checkout, before any payment. Anyone can change the stored name and e-mail language of an existing customer, and set `marketing_consent = true` for any address (consent that was never given by the address owner).
Fix: only apply `name/locale/marketing_consent` from a checkout once that order is paid (move the update into `applyPayment` on `becamePaid`), or store them on the order and copy to the customer on payment.

**12. Product selector is not above the fold on mobile.**
Role: CRO / mobile. `src/web/styles/main.css:128-129, 157`, `src/web/templates/home.js:13-43`.
`.hero { height: 200svh; min-height: 1300px }` with a sticky 100svh stage; `#buy` starts at `-40svh` from the hero's end, i.e. ~1.6 viewports down. The first screen shows headline, sub, "Get RYNSE" (an anchor that scrolls) and the price, but not the one-time/subscribe choice, quantity or payment badges the brief puts *in* the hero (§12, §15 "De gebruiker moet hier al kunnen converteren", §28 "product direct boven de fold"). The sticky bar only appears after `#buy` has been scrolled past, so during the cinematic there is no persistent CTA either.
Fix: on mobile render a compact one-time/subscribe + "Get RYNSE" row inside `.hero-content` (reuse `purchasePanel(t, {compact: true})`) or shorten the hero to ~130svh on phones; alternatively show the sticky bar as soon as the hero CTA leaves the viewport.

**13. Webhook does network I/O (e-mail, Mollie) while holding row locks; cron can exceed `maxDuration`.**
Role: backend. `src/server/webhooks.js:50, 117, 130, 136`, `src/server/subscriptions.js:48, 62, 110, 117, 159-186`, `vercel.json:8`.
Inside `transaction(applyPayment)` the code holds `FOR UPDATE` on `payments`, `orders` and `subscriptions` while calling Resend (`sendOnce` → HTTP), `listMandates`, `createSubscription`, `getSubscription`. Mollie times out webhooks after 15 s and then retries; a slow Resend call makes the webhook fail *after* the e-mail was sent (e-mail log uses a connection outside the transaction, `email/index.js:35`), so a retried webhook re-runs everything except the mail. `reconcileSubscriptions` makes up to 200 serial Mollie calls per run (≥ 30 s at 150 ms each) against `maxDuration: 30`.
Fix: commit the state change first, then run side effects (mail, Mollie subscription creation) with their own dedupe keys outside the transaction; batch the cron (e.g. 50 per run, or parallelise with `Promise.allSettled` in chunks) or raise `maxDuration` for the cron path.

**14. Checkout holds a DB transaction (pool max 3) across the Mollie `createPayment` call with retries.**
Role: backend. `src/server/orders.js:62-118`, `src/server/payments/mollie.js:37-53`, `src/server/db.js:14`.
`transaction(async (sql) => { … await pp.createPayment(…) … })` keeps one of only three pooled connections open while Mollie answers (plus up to 2 retries × 5 s back-off). Three concurrent checkouts during a Mollie slowdown starve every other query (webhooks, order status, rate limiting) in that function instance.
Fix: insert order/subscription + commit, call Mollie, then update `payments`/`orders` in a second short transaction; mark the order `failed` if the Mollie call fails.

**15. Retry / cancel flows lose context.**
Role: frontend / CRO. `src/web/scripts/checkout.js:11-13`, `src/server/app.js:71`, `src/web/scripts/order.js:27`.
`retryUrl` is `/checkout?retry=<number>`, but checkout.js ignores the number: with an empty cart it silently builds `{mode: 'one_time', quantity: 1}` — a failed *subscription* retry becomes a one-time order of one pack. `?canceled=` only shows a note and does not refresh the order status (see finding 3).
Fix: have `/api/orders/:number` return `mode` and `quantity` and let checkout.js pre-fill the cart from them when `retry`/`canceled` is present.

### Minor

**16. Apple Pay is forced as `method: 'applepay'` without checking the Mollie profile.**
Role: backend / CRO. `src/web/scripts/checkout.js:15-18`, `src/server/orders.js:105`, `docs/mollie-api-reference.md:335-342`.
`canMakePayments()` only proves the device can; if Apple Pay is not (yet) enabled on the Mollie website profile, `createPayment` returns 422 and the shopper sees "The payment provider rejected the request". Fix: check `GET /v2/methods?includeWallets=applepay` once (cached) and hide the radio otherwise, or omit `method` so Mollie's hosted page offers Apple Pay only when enabled.

**17. Form errors are not announced; no focus trap in drawer/menu.**
Role: frontend / a11y. `src/web/scripts/checkout.js:46-58`, `src/web/templates/pages.js:80-99`, `src/web/scripts/site.js:84, 98-103`.
`.err` spans are shown via CSS only (no `id` + `aria-describedby`, no `aria-live`), `[data-form-error]` has no `role="alert"`. The cart drawer and menu set `aria-modal="true"` but Tab leaves them; the rest of the page is not `inert`. Fix: `aria-describedby` on inputs, `role="alert"` on the error boxes, `inert` on `#main`/`header` while a dialog is open (or a small focus-trap loop).

**18. Home `<title>` is not localized; FAQPage duplicated; `lastmod` always "today".**
Role: SEO. `src/web/i18n/nl.js:3`, `src/web/i18n/es.js:3`, `src/web/templates/home.js:116`, `src/web/templates/pages.js:35`, `src/web/build.js:81-83`.
`meta.home.title` is the same English string in all three dictionaries, so `/`, `/nl/` and `/es/` share one title ("| 40 cleansing wipes" in Dutch pages). Identical Q&As carry `FAQPage` JSON-LD on both the home page and `/faq` per locale (Google: one FAQPage per Q&A set). Sitemap `lastmod` is the build date for every URL. Fix: translate the title suffix, emit FAQPage only on `/faq`, derive `lastmod` from content hash or git date.

**19. `/api/geo` fallback runs on every English page view without a language cookie.**
Role: performance. `src/web/scripts/site.js:187-199`.
On Vercel the middleware already decided; the client still calls `/api/geo` (a function invocation) for every EN visitor until `sessionStorage` is set. Fix: skip when a `x-middleware-ran`-style header/cookie is present (set `rynse_lang=en` cookie in middleware when it decides EN), or only call it when `CFG.env === 'development'`.

**20. Copy claims a "pause" feature and a usage claim that is not in the brief.**
Role: brand / copy. `src/web/i18n/en.js:304` ("pause or cancel any time"), `nl.js:291`, `es.js` equivalent; `en.js:168` ("enough for a month of real life"), `nl.js:163`, `es.js`.
There is no pause functionality anywhere (`/api/account/subscription/cancel` only). "Enough for a month" is an invented consumption claim (brief §1: no product properties that were not supplied). Fix: drop "pause"; replace the month claim with a neutral line ("{n} wipes, one per moment that needs it").

**21. Brand-term and CTA consistency across languages.**
Role: brand / copy. `src/web/i18n/nl.js:4, 39-42, 31`, `src/web/i18n/es.js:31, 36, 39-42, 125`, `nl.js:341`.
NL keeps "cleansing wipes / water-based / pH-balanced / Get RYNSE" in English; ES translates all of them ("toallitas limpiadoras / a base de agua / pH equilibrado / Consigue RYNSE") and even the product name ("RYNSE — 40 toallitas"). Both are defensible, but they are different strategies; a premium brand should pick one (recommended: keep "RYNSE — 40 Wipes", "Get RYNSE" and "Stay fresh. Anywhere." untranslated everywhere, translate descriptive facts everywhere). NL `js.order.thanksB` "Je bent klaar." reads as "you're finished"; "Geregeld." or "Helemaal goed." is stronger. "Subscribe & save / Abonneer & bespaar / Suscríbete y ahorra" promises a saving while `RYNSE_SUBSCRIPTION_DISCOUNT_PCT` is null; with free shipping as the only benefit, "Subscribe" + free-shipping tag would be more honest until the percentage is set.

**22. Spanish locale targets Latin America while shipping only to NL/BE/DE; iDEAL pre-selected for everyone.**
Role: CRO / SEO. `middleware.js:12-16`, `src/config/commerce.js:110`, `src/web/templates/pages.js:90`.
Visitors from MX/AR/CO/… are redirected to `/es/`, told "We currently ship to NL, BE, DE" only in the FAQ, and get iDEAL (NL-only) pre-checked at checkout. Fix: limit `COUNTRY_LOCALE` to ES (and keep ES pages reachable by hreflang), or make the country list and default payment method follow the locale; show the shipping-country note in the checkout header.

**23. Small security hygiene items.**
Role: security. `src/server/security.js:115-120` (`requireCron` uses `!==`, not `timingSafeEqual`); `src/server/http.js:65-70` (`clientIp` trusts `x-real-ip` from the client — fine behind Vercel, spoofable on the dev server, so rate limits are bypassable locally); `src/server/app.js:145-148` (logout only clears the cookie; a stolen session stays valid 30 days — no server-side revocation or `iat`-based cut-off); `vercel.json:17-23` (no `Content-Security-Policy`; the inline `window.__RYNSE__` script would need a nonce or a hash); `src/server/app.js:24-28` (`/api/health` leaks provider/mode to anyone). Fix: constant-time compare, derive IP only from Vercel's header set, add a `sessions`/`session_version` column for revocation, add a CSP with `script-src 'self' 'nonce-…'` (build-time hash for the inline config).

**24. `addInterval` month arithmetic overflows.**
Role: backend. `src/server/subscriptions.js:21-30`.
`setUTCMonth(+1)` on 31 Jan yields 3 Mar, so `startDate`/`next_payment_date` drift by days each month-end; Mollie itself clamps to the last day of the month (reference §6.5). Fix: clamp the day to the target month's length.

**25. Admin endpoints: non-UUID ids → 500, unescaped ILIKE wildcards.**
Role: security / backend. `src/server/admin.js:24, 32, 45, 60, 87`.
`WHERE id = ${params.id}` with a non-UUID string throws a Postgres cast error → generic 500 instead of 404; `q` is not escaped for `%`/`_` (harmless but makes the search fuzzy). Fix: validate `params.id` with a UUID regex; escape wildcards or use `position()`.

**26. Heading hierarchy skips a level on checkout/account/contact.**
Role: SEO / a11y. `src/web/templates/pages.js:79, 82, 88, 146`.
Pages use `<h1>` then `<h3>` ("Contact", "Delivery", "Payment") with no `<h2>`. Fix: make the section titles `<h2 class="h3-style">`.

**27. Client quote cache memoises failures; quantity cap duplicated.**
Role: frontend. `src/web/scripts/site.js:109-116, 132, 151`.
`quoteCache.set(key, p)` stores the promise before it settles; a transient 5xx/offline response is cached as a permanent rejection until reload (panel price and cart totals stay stale). `Math.min(10, …)` hard-codes `maxQuantity` (config value is already shipped in `/api/config`). Fix: `p.catch(() => quoteCache.delete(key))`; read `config.product.maxQuantity`.

**28. Refunding a `subscription_first` order leaves the subscription active; renewal retries create extra orders.**
Role: backend. `src/server/admin.js:56-75`, `src/server/webhooks.js:70-77`.
A full refund of the first subscription payment does not cancel or flag the Mollie subscription, so the next charge still happens. Each Mollie retry of a failed renewal (new `tr_`) creates a new `subscription_renewal` order, so admin shows several failed "orders" for one period. Fix: on full refund of a `subscription_first` order prompt/auto-cancel the subscription; key renewal orders on `(subscription_id, period)` and attach retry payments to the same order.

---

### What is solid (no action)
- Amounts computed server-side and snapshotted (`pricing.js`, `orders.js:84`); frontend-supplied `totalCents` is ignored (covered by `tests/payments.test.js:229`).
- Webhook trust model and idempotency gate (`webhooks.js:41-57`), e-mail dedupe (`email/index.js:51-64`), late-webhook handling on the order page (`app.js:65-69`, test 20).
- Loyalty engine matches the brief: level from uninterrupted `loyalty_start_date`, reset on cancel (`subscriptions.js:132`), new row = year 1 (`orders.js:74-77`), percentages configurable and hidden while null.
- Mollie client matches the reference: `Idempotency-Key` on POST/DELETE, HAL accept, `first`/`recurring`, mandate `pending|valid` accepted, subscription create/patch/delete endpoints, refunds via `amountRefunded`, 429/5xx retry with `Retry-After`.
- No invented reviews/ratings/discounts/certifications; only existing social channels; official payment marks; placeholders flagged and refused in production builds (`tools/check-config.js`).
- Reduced-motion, keyboard-visible focus, label/for pairs, skip link, AA contrast for gold and muted text on navy.

---

## Resolution status (fix round, 2026-10-06)

All findings were implemented after the review and verified by `npm test` (27 scenarios, incl. a new "review fixes" and a "magic link" test) and `tests/e2e/run.py` (156 checks, 7 viewports, EN/NL/ES).

| # | Finding | Status | Where |
|---|---------|--------|-------|
| 1 | `cleanUrls` | Fixed | `vercel.json` (`cleanUrls: true`, locale order rewrites) |
| 2 | Terms below Pay button (mobile) | Fixed | summary aside first on mobile (`.checkout-summary` order), confirmation line `[data-sub-confirm]` directly above the button |
| 3 | Open payments never reconciled | Fixed | `/api/orders` refreshes via provider while open; cron sweeps open/pending payments > 1 h (`reconcileSubscriptions`) |
| 4 | Renewal pricing after level change | Fixed | `subscriptions.mollie_amount_cents` + daily `syncProviderAmount`; renewal order records the charged amount |
| 5 | Duplicate Mollie subscription | Fixed | provider subscription created *after* commit; adopts an existing Mollie sub via `metadata.subscriptionId` |
| 6 | Magic link GET consumes token | Fixed | `GET /api/auth/verify` shows a page that auto-POSTs to `/api/auth/consume` |
| 7 | `/api/events` open write path | Fixed | event whitelist + rate limit + CSRF; contact form → `contact_messages` |
| 8 | Hero downloads all frames | Fixed | intent-driven loading (scroll/pointer), prioritised frames, mobile cap, desktop idle fallback after 6 s |
| 9 | Stale pending subscription | Fixed | new checkout supersedes pending subs; cron expires pending > 3 h; 409 when an active one exists |
| 10 | Guessable order URLs | Fixed | `orders.access_token` (random 36 hex) in `?t=`; e-mail no longer accepted |
| 11 | Profile overwrite by unauthenticated checkout | Fixed | `findOrCreateCustomer` never overwrites; profile applied only when the order is paid |
| 12 | Selector below the fold on mobile | Mitigated | hero 165svh on mobile, hero CTA adds to cart + opens drawer, "choose one-time or subscription" link |
| 13 | I/O under row locks; cron duration | Fixed | side effects run after commit; cron has budget (`budgetMs`) and limits |
| 14 | DB transaction across Mollie call | Fixed | tx1 (order) → Mollie → persist payment outside the lock |
| 15 | Retry/cancel context loss | Fixed | `?retry=NUM&t=TOKEN` / `?canceled=` rebuild cart, mode, e-mail and address from `/api/orders` |
| 16 | Apple Pay forced method | Fixed | `method` omitted for Apple Pay (Mollie method selection) |
| 17 | Form errors / focus trap | Fixed | `aria-describedby` per field, `role=alert`, focus trap + `inert` for drawer/menu |
| 18 | Title/FAQPage/lastmod | Fixed | localized titles, FAQPage only on `/faq` |
| 19 | `/api/geo` on every page view | Fixed | suggestion only outside production (Vercel middleware handles it there) |
| 20 | "Pause" / usage claims | Fixed | copy removed in all three languages |
| 21 | Brand-term consistency | Fixed | "Get RYNSE" and "RYNSE — 40 Wipes" kept verbatim in NL/ES; NL "Je bent klaar." replaced |
| 22 | ES locale vs shipping; iDEAL default | Partly | card is the default method unless locale is `nl`; shipping countries remain a config decision (see `docs/CONFIGURATION.md`) |
| 23 | Security hygiene | Fixed | constant-time cron/admin compare, CSP header, `[hidden]` hardening; session revocation still a known limitation (short-lived HMAC sessions) |
| 24 | `addInterval` overflow | Fixed | month clamp |
| 25 | Admin id/ILIKE | Fixed | uuid validation, escaped ILIKE |
| 26 | Heading hierarchy | Fixed | `.form-title` h2s |
| 27 | Quote cache / quantity cap | Fixed | failures not memoised; `maxQuantity` from `window.__RYNSE__` |
| 28 | Refund of first order; renewal retries | Fixed | full refund of `subscription_first` cancels the subscription; failed+retried renewal reuses the open renewal order |
