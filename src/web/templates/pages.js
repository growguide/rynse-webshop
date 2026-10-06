import { brand, product, shipping, subscription, loyalty, copy, payments } from '../../config/commerce.js';
import { esc, sachetSvg, purchasePanel, faqItems, faqHtml, loyaltyLadder, payBadges, priceFmt } from './components.js';
import { layout, organizationLd, breadcrumbLd, faqLd } from './layout.js';

const head = (eyebrow, title, lead) => `<div class="wrap page-head"><p class="eyebrow">${esc(eyebrow)}</p><h1 class="h2" style="margin-top:12px">${title}</h1>${lead ? `<p class="lead" style="margin-top:16px">${lead}</p>` : ''}</div>`;
const ph = (text) => `<span class="ph">${esc(text)}</span>`;

export function renderWhy({ assets, images }) {
  const main = `
${head('Why RYNSE', 'Built for the moments <span class="serif gold">between.</span>', 'Between the gym and the office. Between the flight and the meeting. Between the last song and the night bus. RYNSE is a fresh start you can carry.')}
<section class="section-tight"><div class="wrap why-grid">
  <div class="why-item reveal"><span class="num">01</span><h3>Fresh anywhere</h3><p>A water-based cleansing wipe for a quick, clean, fresh feeling when water is not available.</p></div>
  <div class="why-item reveal"><span class="num">02</span><h3>Individually wrapped</h3><p>Every wipe has its own compact, discreet sachet. Open one when you need it; the rest stay sealed and fresh.</p></div>
  <div class="why-item reveal"><span class="num">03</span><h3>Made for everyday life</h3><p>pH-balanced and alcohol-free. ${product.wipesPerPack} wipes per pack — enough for a month of real life.</p></div>
</div></section>
<section class="section"><div class="wrap final-grid">
  <div class="final-visual reveal"><img src="${esc(images.heroPosterSquare.src)}" alt="${esc(images.heroPosterSquare.alt)}" loading="lazy" width="${images.heroPosterSquare.width || 1000}" height="${images.heroPosterSquare.height || 1250}"></div>
  <div class="reveal">
    <p class="eyebrow">What's in the pack</p>
    <h2 class="h2" style="margin:14px 0 18px">${product.wipesPerPack} wipes. <span class="serif gold">Zero fuss.</span></h2>
    <ul class="loyalty-rules">
      <li>${product.wipesPerPack} individually wrapped cleansing wipes</li>
      <li>Water-based formula</li>
      <li>pH-balanced</li>
      <li>Alcohol-free</li>
      <li>Compact, discreet sachet — pocket-sized</li>
      <li>Unisex: made for everyone who moves</li>
    </ul>
    <div style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn-primary" href="/#buy">${esc(copy.ctaPrimary)}</a><a class="btn btn-ghost" href="/subscription">Subscribe &amp; save</a></div>
  </div>
</div></section>
<section class="section-tight"><div class="wrap"><div class="section-head reveal"><p class="eyebrow">When to reach for RYNSE</p><h2 class="h2">Gym. Flight. Festival. <span class="serif gold">Date.</span></h2></div>
  <div class="why-grid">
    ${[['After the gym', 'Fresh before you leave the locker room — no shower queue required.'], ['On the road', 'Long drives, trains, flights. A reset at 30,000 feet or on the A2.'], ['Festivals & nights out', 'Three days in a field or one long night out. Stay yourself.'], ['Long working days', 'From an early call to a late dinner without going home in between.'], ['Before or after a date', 'Confidence in your pocket. Discreet enough to carry anywhere.'], ['Wherever there is no water', 'Camping, sports fields, road trips. If there is no tap, there is RYNSE.']].map(([t, p]) => `<div class="why-item reveal"><h3>${esc(t)}</h3><p>${esc(p)}</p></div>`).join('')}
  </div></div></section>`;
  return layout({ path: '/why-rynse', title: 'Why RYNSE', description: `Why RYNSE: ${product.wipesPerPack} individually wrapped, water-based, pH-balanced, alcohol-free cleansing wipes for a fresh feeling anywhere — gym, travel, festival, work, dates.`, main, assets, jsonLd: [organizationLd(), breadcrumbLd([['Home', '/'], ['Why RYNSE', '/why-rynse']])] });
}

export function renderFaq({ assets }) {
  const items = faqItems();
  const main = `${head('FAQ', 'Questions, <span class="serif gold">answered.</span>')}<section class="section-tight"><div class="wrap" style="max-width:860px">${faqHtml(items, { open: 0 })}<p style="margin-top:28px" class="muted">Something else? <a class="link" href="/contact">Contact us</a>.</p></div></section>`;
  return layout({ path: '/faq', title: 'FAQ', description: `Answers about RYNSE cleansing wipes: ingredients, what's in a pack, one-time purchase vs subscription, loyalty benefits, payment (iDEAL, Apple Pay, cards), shipping and returns.`, main, assets, jsonLd: [faqLd(items), breadcrumbLd([['Home', '/'], ['FAQ', '/faq']])] });
}

export function renderSubscription({ assets }) {
  const main = `
${head('Subscription', 'Stay fresh. <span class="serif gold">Stay rewarded.</span>', `Subscribe and a fresh pack of ${product.wipesPerPack} arrives every ${esc(subscription.interval)}. The longer you stay, the better it gets.`)}
<section class="section-tight"><div class="wrap loyalty-grid">
  <div class="reveal">
    <h2 class="h3" style="margin-bottom:14px">How it works</h2>
    <ul class="loyalty-rules">
      <li>Choose <strong>Subscribe &amp; save</strong> when you order. Your first pack is paid right away via iDEAL, Apple Pay or card.</li>
      <li>After that, RYNSE is delivered and billed automatically every ${esc(subscription.interval)}. ${shipping.subscriptionShipsFree ? 'Shipping is always free for subscribers.' : ''}</li>
      <li>For every full year your subscription runs without interruption, you move up a loyalty level.</li>
      <li>Loyalty benefits exist only while the subscription is active. If you cancel, your loyalty status resets.</li>
      <li>Start a new subscription later? You begin again at year 1.</li>
      <li>Cancel anytime from <a class="link" href="/account">your account</a> — no minimum term, no phone calls, no questions asked.</li>
    </ul>
    <div style="margin-top:28px"><a class="btn btn-primary" href="/#buy">Subscribe &amp; save</a></div>
  </div>
  <div class="reveal">${loyaltyLadder()}${loyalty.levels.every((l) => l.discountPct == null) ? '<p class="small muted" style="margin-top:12px">Exact loyalty percentages are announced at launch.</p>' : ''}</div>
</div></section>
<section class="section-tight"><div class="wrap" style="max-width:860px"><h2 class="h3" style="margin-bottom:18px">Subscription questions</h2>${faqHtml(faqItems().filter(([q]) => /subscription|loyalty|pay/i.test(q)), { open: 0 })}</div></section>`;
  return layout({ path: '/subscription', title: 'Subscribe & Save — loyalty benefits', description: `RYNSE subscription: ${product.wipesPerPack} cleansing wipes delivered every ${subscription.interval}, growing loyalty benefits for every uninterrupted year, cancel anytime.`, main, assets, jsonLd: [breadcrumbLd([['Home', '/'], ['Subscription', '/subscription']])] });
}

export function renderContact({ assets }) {
  const main = `${head('Contact', 'Say <span class="serif gold">hello.</span>', 'Questions about an order, your subscription or RYNSE itself? We reply by e-mail.')}
<section class="section-tight"><div class="wrap checkout-grid">
  <form class="fields" data-contact-form novalidate>
    <div class="fields-2"><div class="field"><label for="c-name">Name</label><input id="c-name" name="name" autocomplete="name" maxlength="120"></div><div class="field"><label for="c-email">E-mail</label><input id="c-email" name="email" type="email" autocomplete="email" required maxlength="254"><span class="err">Please enter a valid e-mail address.</span></div></div>
    <div class="field"><label for="c-msg">Message</label><textarea id="c-msg" name="message" required minlength="10" maxlength="4000"></textarea><span class="err">Tell us a little more (at least 10 characters).</span></div>
    <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
    <div class="alert alert-error" data-form-error hidden></div><div class="alert alert-ok" data-form-ok hidden>Thanks — your message is in. We'll get back to you by e-mail.</div>
    <div><button class="btn btn-primary" type="submit"><span class="spinner" aria-hidden="true"></span><span>Send message</span></button></div>
  </form>
  <aside class="summary-card"><div><p class="eyebrow">E-mail</p><p style="margin-top:6px"><a class="link" href="mailto:${esc(brand.supportEmail)}">${esc(brand.supportEmail)}</a></p></div><div><p class="eyebrow">Social</p><p style="margin-top:6px">Instagram <a class="link" href="${esc(brand.social.instagram.url)}" rel="noopener" target="_blank">${esc(brand.social.instagram.handle)}</a><br>TikTok <a class="link" href="${esc(brand.social.tiktok.url)}" rel="noopener" target="_blank">${esc(brand.social.tiktok.handle)}</a></p></div><div><p class="eyebrow">Company</p><p class="small muted" style="margin-top:6px">${esc(brand.legalName)}<br>${esc(brand.legal.address)}<br>KvK ${esc(brand.legal.kvk)} · VAT ${esc(brand.legal.vat)}</p></div></aside>
</div></section>`;
  return layout({ path: '/contact', title: 'Contact', description: `Contact RYNSE about orders, subscriptions or the product. E-mail ${brand.supportEmail}.`, main, assets, scripts: [assets.formsJs], jsonLd: [organizationLd()] });
}

export function renderCheckout({ assets }) {
  const subTerms = `<div class="sub-terms" data-sub-terms hidden><strong>This is a subscription.</strong> You pay for the first pack now. After that, ${product.shortName} is delivered and charged automatically every <strong data-interval>${esc(subscription.interval)}</strong> at <strong data-sub-amount></strong> per delivery (incl. VAT${shipping.subscriptionShipsFree ? ', free shipping' : ''}), via the payment method you choose now (iDEAL and cards set up a mandate with Mollie). Cancel anytime from your account; no minimum term. Loyalty benefits only apply while the subscription runs.</div>`;
  const main = `${head('Checkout', 'Almost <span class="serif gold">there.</span>')}
<section class="section-tight"><div class="wrap checkout-grid">
  <form class="fields" data-checkout-form novalidate>
    <div class="alert alert-info" data-cart-empty hidden>Your cart is empty. <a class="link" href="/#buy">Get RYNSE</a></div>
    <div class="alert alert-error" data-retry-note hidden>Your previous payment did not complete. No worries — nothing was charged. Try again below.</div>
    <div class="form-section" style="border-top:0;padding-top:0"><h3>Contact</h3>
      <div class="field"><label for="f-email">E-mail</label><input id="f-email" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="254"><span class="err">Please enter a valid e-mail address.</span></div>
    </div>
    <div class="form-section"><h3>Delivery</h3>
      <div class="field"><label for="f-name">Full name</label><input id="f-name" name="name" autocomplete="name" required minlength="2" maxlength="120"><span class="err">Please enter your name.</span></div>
      <div class="field"><label for="f-street">Street and house number</label><input id="f-street" name="street" autocomplete="street-address" required minlength="3" maxlength="160"><span class="err">Please enter your street and number.</span></div>
      <div class="fields-2"><div class="field"><label for="f-postal">Postal code</label><input id="f-postal" name="postalCode" autocomplete="postal-code" required minlength="4" maxlength="12"><span class="err">Required.</span></div><div class="field"><label for="f-city">City</label><input id="f-city" name="city" autocomplete="address-level2" required minlength="2" maxlength="80"><span class="err">Required.</span></div></div>
      <div class="field"><label for="f-country">Country</label><select id="f-country" name="country" autocomplete="country">${shipping.countries.map((c) => `<option value="${c}"${c === shipping.defaultCountry ? ' selected' : ''}>${{ NL: 'Netherlands', BE: 'Belgium', DE: 'Germany' }[c] || c}</option>`).join('')}</select></div>
    </div>
    <div class="form-section"><h3>Payment</h3>
      <div class="methods" role="radiogroup" aria-label="Payment method">
        <label class="method"><input type="radio" name="method" value="ideal" checked><img src="/assets/payment/ideal.svg" alt="" width="32" height="24"><span class="m-name">iDEAL</span></label>
        <label class="method" data-method-applepay><input type="radio" name="method" value="applepay"><img src="/assets/payment/applepay.svg" alt="" width="32" height="24"><span class="m-name">Apple Pay</span></label>
        <label class="method"><input type="radio" name="method" value="creditcard"><img src="/assets/payment/visa.svg" alt="" width="38" height="24"><span class="m-name">Card</span><span class="m-brands"><img src="/assets/payment/mastercard.svg" alt="Mastercard" width="38" height="24"></span></label>
      </div>
      <p class="small muted">You'll complete the payment on Mollie's secure page and return here automatically.</p>
    </div>
    <div class="form-section">
      <label class="consent"><input type="checkbox" name="marketingConsent"><span>Keep me posted about RYNSE (occasional e-mails, unsubscribe anytime).</span></label>
      <label class="consent"><input type="checkbox" name="terms" required><span>I agree to the <a class="link" href="/terms" target="_blank">Terms &amp; Conditions</a> and have read the <a class="link" href="/privacy" target="_blank">Privacy Policy</a>.<span class="err" style="display:block">Please accept the terms to continue.</span></span></label>
      <div class="alert alert-error" data-form-error hidden></div>
      <button class="btn btn-primary btn-block" type="submit" data-pay><span class="spinner" aria-hidden="true"></span><span data-pay-label>Pay now</span></button>
      ${payBadges({ label: false })}
    </div>
  </form>
  <aside class="checkout-summary">
    <div class="summary-card">
      <div class="cart-item"><div class="thumb">${sachetSvg({ title: '' })}</div><div><div class="ci-title">${esc(product.shortName)}</div><div class="ci-mode" data-sum-mode></div><div class="ci-sub" data-sum-qty></div></div></div>
      <div class="mode-switch" role="group" aria-label="Purchase type"><button type="button" data-mode-btn="one_time">One-time</button><button type="button" data-mode-btn="subscription">Subscribe &amp; save</button></div>
      <div class="totals" data-sum-totals></div>
      ${subTerms}
      <p class="small muted">Prices include VAT. Delivery: ${esc(shipping.deliveryEstimate)}.</p>
    </div>
  </aside>
</div></section>`;
  return layout({ path: '/checkout', title: 'Checkout', description: 'Secure checkout — iDEAL, Apple Pay, Visa and Mastercard via Mollie.', main, assets, scripts: [assets.checkoutJs], noindex: true });
}

export function renderOrder({ assets }) {
  const main = `${head('Your order', '<span data-order-title>One moment…</span>')}
<section class="section-tight"><div class="wrap" style="max-width:720px">
  <div class="status-card" data-order-card>
    <div class="status-icon pending" data-status-icon><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
    <p class="lead" data-order-message>Checking your payment status…</p>
    <dl class="kv" data-order-details></dl>
    <div data-order-actions style="display:flex;gap:12px;flex-wrap:wrap"></div>
  </div>
</div></section>`;
  return layout({ path: '/order', title: 'Order status', description: 'Order status', main, assets, scripts: [assets.orderJs], noindex: true, canonical: '/order' });
}

export function renderAccount({ assets }) {
  const main = `${head('Account', 'Your <span class="serif gold">RYNSE.</span>')}
<section class="section-tight"><div class="wrap" style="max-width:860px">
  <div data-acc-signin hidden>
    <div class="summary-card" style="max-width:480px">
      <p>Sign in with a magic link — no password needed. Use the e-mail address from your order.</p>
      <form class="fields" data-signin-form novalidate>
        <div class="field"><label for="a-email">E-mail</label><input id="a-email" name="email" type="email" autocomplete="email" required><span class="err">Please enter a valid e-mail address.</span></div>
        <div class="alert alert-error" data-form-error hidden></div><div class="alert alert-ok" data-form-ok hidden>If an account exists for this e-mail, a sign-in link is on its way. Check your inbox.</div>
        <button class="btn btn-primary" type="submit"><span class="spinner" aria-hidden="true"></span><span>E-mail me a sign-in link</span></button>
      </form>
    </div>
  </div>
  <div data-acc-content hidden class="stack">
    <div class="summary-card" data-acc-sub></div>
    <div><h2 class="h3" style="margin-bottom:14px">Orders</h2><div style="overflow:auto"><table class="table"><thead><tr><th>Order</th><th>Date</th><th>Type</th><th>Total</th><th>Payment</th><th>Fulfilment</th></tr></thead><tbody data-acc-orders></tbody></table></div></div>
    <div><button class="btn btn-ghost" type="button" data-logout>Sign out</button></div>
  </div>
</div></section>`;
  return layout({ path: '/account', title: 'Account', description: 'Manage your RYNSE orders and subscription.', main, assets, scripts: [assets.accountJs], noindex: true });
}

const legalLayout = (pathname, title, description, body) => layout({ path: pathname, title, description, main: `${head('Legal', title)}<section><div class="wrap"><div class="prose">${body}</div></div></section>`, assets: legalAssets, jsonLd: [breadcrumbLd([['Home', '/'], [title, pathname]])] });
let legalAssets = null;

export function renderLegal({ assets }) {
  legalAssets = assets;
  const company = `${esc(brand.legalName)}, ${ph(brand.legal.address)}, KvK ${ph(brand.legal.kvk)}, VAT ${ph(brand.legal.vat)}, ${esc(brand.supportEmail)}`;
  const note = `<p class="alert alert-info"><strong>Draft.</strong> Highlighted fields are placeholders that must be completed and the text reviewed by a legal advisor before launch.</p>`;
  return {
    privacy: legalLayout('/privacy', 'Privacy Policy', 'How RYNSE handles your personal data.', `${note}
<p>This Privacy Policy explains how ${company} ("RYNSE", "we") processes personal data when you visit this website or place an order. Last updated: ${ph('[date]')}.</p>
<h2>What we collect</h2><ul><li><strong>Order data:</strong> name, e-mail address, delivery address, what you bought, payment status and method (we never receive or store card numbers or bank details — these are handled by Mollie).</li><li><strong>Account data:</strong> e-mail address and sign-in links for your account.</li><li><strong>Subscription data:</strong> subscription status, delivery schedule and loyalty level.</li><li><strong>Technical data:</strong> IP address and browser information in server logs, used for security and to prevent abuse.</li><li><strong>Analytics and advertising cookies:</strong> only with your consent (see our <a href="/cookies">Cookie Policy</a>).</li></ul>
<h2>Why we process it</h2><ul><li>To fulfil your order and deliver it (performance of a contract).</li><li>To process payments and recurring subscription payments via Mollie (performance of a contract).</li><li>To send order confirmations, shipping updates and service e-mails (performance of a contract).</li><li>To send marketing e-mails only when you opted in (consent; unsubscribe anytime).</li><li>To keep the shop secure and prevent fraud (legitimate interest).</li><li>To comply with tax and accounting law (legal obligation).</li></ul>
<h2>Who we share it with</h2><ul><li><strong>Mollie B.V.</strong> (payment service provider) — payment processing and mandates for subscriptions.</li><li><strong>${ph('[Shipping carrier]')}</strong> — delivery.</li><li><strong>${ph('[E-mail provider]')}</strong> — transactional e-mails.</li><li><strong>${ph('[Hosting provider, e.g. Vercel; database provider]')}</strong> — hosting and storage, in the EU where possible.</li><li>Analytics/advertising partners (Google, Meta, TikTok) only with your consent.</li></ul>
<h2>Retention</h2><p>Order and invoice data is kept for 7 years (Dutch tax law). Account data is kept while your account exists. Analytics data is kept according to the partner's settings. You can ask us to delete your account at any time.</p>
<h2>Your rights</h2><p>You can access, correct, delete or export your data, object to processing and withdraw consent by e-mailing ${esc(brand.supportEmail)}. You can also complain to the Dutch Data Protection Authority (Autoriteit Persoonsgegevens).</p>
<h2>Contact</h2><p>${company}</p>`),
    cookies: legalLayout('/cookies', 'Cookie Policy', 'Which cookies RYNSE uses and how to control them.', `${note}
<p>This website uses the following cookies and similar technologies.</p>
<h2>Essential (always on)</h2><ul><li><strong>rynse_session</strong> — keeps you signed in to your account (30 days).</li><li><strong>rynse_csrf</strong> — protects forms against cross-site request forgery (30 days).</li><li><strong>Local storage: cart, consent</strong> — remembers your cart and your cookie choice on this device.</li><li>Mollie sets cookies on its own payment pages; see <a href="https://www.mollie.com/privacy" rel="noopener" target="_blank">Mollie's privacy statement</a>.</li></ul>
<h2>Analytics &amp; advertising (only with consent)</h2><p>If you click "Allow" in the cookie banner we load ${ph('[Google Analytics 4 / Google Ads / Meta Pixel / TikTok Pixel — list the ones actually configured]')} to measure how the shop is used and how our ads perform. If you decline, none of these are loaded and no advertising cookies are set.</p>
<h2>Changing your choice</h2><p>Clear this site's data in your browser to see the banner again, or e-mail ${esc(brand.supportEmail)}.</p>`),
    terms: legalLayout('/terms', 'Terms & Conditions', 'General terms and conditions of RYNSE.', `${note}
<h2>1. Company</h2><p>${company}</p>
<h2>2. Products</h2><p>RYNSE sells cleansing wipes for personal hygiene. Product descriptions on this website are accurate to the best of our knowledge; images may differ slightly from the delivered product.</p>
<h2>3. Prices and payment</h2><p>All prices are in euros and include VAT. Shipping costs are shown before you pay. Payment is made in advance via iDEAL, Apple Pay or credit card, processed by Mollie. An order is only final after payment has been confirmed.</p>
<h2>4. Subscriptions</h2><p>With a subscription you authorise us (via a Mollie mandate) to charge the subscription price every ${esc(subscription.interval)} and to ship a pack after each successful payment. The price, frequency and amount are shown before you confirm. You can cancel at any time from your account; cancellation takes effect immediately for all future deliveries and payments. Loyalty benefits apply only while a subscription is active; after cancellation the loyalty status resets and a new subscription starts again at year 1. If a recurring payment fails, Mollie may retry it; after repeated failure the subscription ends.</p>
<h2>5. Delivery</h2><p>We deliver to ${esc(shipping.countries.join(', '))}. Estimated delivery time: ${ph(shipping.deliveryEstimate)}. Risk passes to you on delivery.</p>
<h2>6. Right of withdrawal</h2><p>As a consumer you may cancel your order within ${esc(String(shipping.returnWindowDays))} days after receiving it, without giving a reason, provided the pack is unopened (for hygiene reasons opened packs are excluded, in line with EU consumer law). See <a href="/shipping-returns">Shipping &amp; Returns</a>.</p>
<h2>7. Complaints</h2><p>Contact ${esc(brand.supportEmail)}. We respond within 14 days. EU consumers can also use the <a href="https://ec.europa.eu/consumers/odr" rel="noopener" target="_blank">European ODR platform</a>.</p>
<h2>8. Applicable law</h2><p>Dutch law applies. ${ph('[Add any mandatory local provisions for BE/DE customers]')}</p>`),
    shipping: legalLayout('/shipping-returns', 'Shipping & Returns', 'RYNSE shipping costs, delivery times and returns.', `${note}
<h2>Shipping</h2><ul><li>Countries: ${esc(shipping.countries.join(', '))}.</li><li>Cost: ${esc(priceFmt(shipping.costCents))} per order; free from ${esc(priceFmt(shipping.freeShippingThresholdCents))}.${shipping.subscriptionShipsFree ? ' Subscriptions always ship free.' : ''}</li><li>Delivery time: ${ph(shipping.deliveryEstimate)}.</li><li>Carrier: ${ph('[carrier]')}. You receive a tracking code by e-mail when your order ships.</li></ul>
<h2>Returns</h2><ul><li>You can return an unopened pack within ${esc(String(shipping.returnWindowDays))} days of delivery.</li><li>Opened packs cannot be returned for hygiene reasons.</li><li>E-mail ${esc(brand.supportEmail)} with your order number; we'll send return instructions. ${ph('[Who pays return shipping?]')}</li><li>Refunds are issued to the original payment method within 14 days after we receive the return.</li></ul>
<h2>Damaged or wrong delivery</h2><p>Send a photo to ${esc(brand.supportEmail)} within 7 days and we'll replace the pack free of charge.</p>`),
  };
}

export function renderNotFound({ assets }) {
  return layout({ path: '/404', title: 'Page not found', description: 'Page not found', main: `${head('404', 'Nothing <span class="serif gold">here.</span>', 'The page moved or never existed. Freshness, however, is one click away.')}<section class="section-tight"><div class="wrap"><a class="btn btn-primary" href="/">Back to RYNSE</a></div></section>`, assets, noindex: true });
}

export function renderAdmin({ assets }) {
  const main = `${head('Admin', 'Orders &amp; <span class="serif gold">subscriptions</span>')}
<section class="section-tight"><div class="wrap">
  <div data-admin-login class="summary-card" style="max-width:480px"><p class="small muted">Enter the admin token (ADMIN_TOKEN). It is kept in this tab only.</p><div class="field"><label for="adm-token">Admin token</label><input id="adm-token" type="password" autocomplete="off"></div><button class="btn btn-primary" type="button" data-admin-signin>Open admin</button><div class="alert alert-error" data-admin-error hidden></div></div>
  <div data-admin-app hidden class="stack">
    <div class="why-grid" data-admin-stats></div>
    <div><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px"><h2 class="h3">Orders</h2><input data-admin-search placeholder="Search order / e-mail" style="margin-left:auto;min-height:40px;padding:8px 12px;background:rgba(16,29,58,.55);border:1px solid var(--line-soft);border-radius:6px;color:var(--cream)"><select data-admin-filter style="min-height:40px;padding:8px;background:rgba(16,29,58,.55);border:1px solid var(--line-soft);border-radius:6px;color:var(--cream)"><option value="">All</option><option value="paid">Paid</option><option value="unfulfilled">To ship</option><option value="shipped">Shipped</option><option value="failed">Failed</option><option value="refunded">Refunded</option></select></div><div style="overflow:auto"><table class="table"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Type</th><th>Total</th><th>Payment</th><th>Fulfilment</th><th>Actions</th></tr></thead><tbody data-admin-orders></tbody></table></div></div>
    <div><h2 class="h3" style="margin-bottom:12px">Subscriptions</h2><div style="overflow:auto"><table class="table"><thead><tr><th>Customer</th><th>Status</th><th>Interval</th><th>Next payment</th><th>Loyalty</th><th>Failed</th><th>Actions</th></tr></thead><tbody data-admin-subs></tbody></table></div></div>
  </div>
</div></section>`;
  return layout({ path: '/admin', title: 'Admin', description: 'Admin', main, assets, scripts: [assets.adminJs], noindex: true });
}
