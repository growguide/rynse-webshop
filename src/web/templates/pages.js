import { brand, product, shipping, loyalty } from '../../config/commerce.js';
import { esc, sachetSvg, purchasePanel, faqItems, faqHtml, loyaltyLadder, payBadges, priceFmt, picture, split, intervalLabel } from './components.js';
import { layout, organizationLd, breadcrumbLd, faqLd } from './layout.js';

const head = (eyebrow, title, lead) => `<div class="wrap page-head"><p class="eyebrow">${esc(eyebrow)}</p><h1 class="h2" style="margin-top:12px">${title}</h1>${lead ? `<p class="lead" style="margin-top:16px">${lead}</p>` : ''}</div>`;
const ph = (text) => `<span class="ph">${esc(text)}</span>`;
const titleAB = (t, a, b) => `${esc(t(a))} <span class="serif gold">${esc(t(b))}</span>`;

export function renderWhy({ t, assets, images }) {
  const n = product.wipesPerPack;
  const items = split(t('whyPage.box.items', { n }));
  const when = split(t('whyPage.when.items')).map((s) => s.split('~'));
  const main = `
${head(t('whyPage.eyebrow'), titleAB(t, 'whyPage.titleA', 'whyPage.titleB'), esc(t('whyPage.lead')))}
<section class="section-tight"><div class="wrap why-grid">
  ${[1, 2, 3].map((i) => `<div class="why-item reveal"><span class="num">0${i}</span><h3>${esc(t(`why.${i}.title`))}</h3><p>${esc(t(`whyPage.${i}.text`, { n }))}</p></div>`).join('')}
</div></section>
<section class="section"><div class="wrap final-grid">
  <div class="final-visual reveal">${picture({ ...images.heroPosterSquare, alt: t('many.alt') }, { sizes: '(min-width: 900px) 45vw, 100vw' })}</div>
  <div class="reveal">
    <p class="eyebrow">${esc(t('whyPage.box.eyebrow'))}</p>
    <h2 class="h2" style="margin:14px 0 18px">${esc(t('whyPage.box.titleA', { n }))} <span class="serif gold">${esc(t('whyPage.box.titleB'))}</span></h2>
    <ul class="loyalty-rules">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    <div style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn-primary" href="${t.href('/')}#buy">${esc(t('cta.get'))}</a><a class="btn btn-ghost" href="${t.href('/subscription')}">${esc(t('cta.subscribe'))}</a></div>
  </div>
</div></section>
<section class="section-tight"><div class="wrap"><div class="section-head reveal"><p class="eyebrow">${esc(t('whyPage.when.eyebrow'))}</p><h2 class="h2">${titleAB(t, 'whyPage.when.titleA', 'whyPage.when.titleB')}</h2></div>
  <div class="why-grid">${when.map(([title, text]) => `<div class="why-item reveal"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`).join('')}</div></div></section>`;
  return layout({ t, path: '/why-rynse', title: t('meta.why.title'), description: t('meta.why.description', { n }), main, assets, jsonLd: [organizationLd(t), breadcrumbLd(t, [[t('nav.shop'), '/'], [t('nav.why'), '/why-rynse']])] });
}

export function renderFaq({ t, assets }) {
  const items = faqItems(t);
  const main = `${head(t('meta.faq.title'), titleAB(t, 'faq.titleA', 'faq.titleB'))}<section class="section-tight"><div class="wrap" style="max-width:860px">${faqHtml(items, { open: 0 })}<p style="margin-top:28px" class="muted">${esc(t('faq.else'))} <a class="link" href="${t.href('/contact')}">${esc(t('faq.contact'))}</a>.</p></div></section>`;
  return layout({ t, path: '/faq', title: t('meta.faq.title'), description: t('meta.faq.description'), main, assets, jsonLd: [faqLd(items), breadcrumbLd(t, [[t('nav.shop'), '/'], [t('nav.faq'), '/faq']])] });
}

export function renderSubscription({ t, assets }) {
  const n = product.wipesPerPack;
  const interval = intervalLabel(t);
  const how = [1, 2, 3, 4, 5, 6].map((i) => t(`subPage.how.${i}`, { interval, subFree: shipping.subscriptionShipsFree ? t('subPage.how.2.subFree') : '', account: t.href('/account') }));
  const main = `
${head(t('subPage.eyebrow'), titleAB(t, 'loyalty.titleA', 'loyalty.titleB'), esc(t('subPage.lead', { n, interval })))}
<section class="section-tight"><div class="wrap loyalty-grid">
  <div class="reveal">
    <h2 class="h3" style="margin-bottom:14px">${esc(t('subPage.how'))}</h2>
    <ul class="loyalty-rules">${how.map((h) => `<li><span>${h}</span></li>`).join('')}</ul>
    <div style="margin-top:28px"><a class="btn btn-primary" href="${t.href('/')}#buy">${esc(t('cta.subscribe'))}</a></div>
  </div>
  <div class="reveal">${loyaltyLadder(t)}${loyalty.levels.every((l) => l.discountPct == null) ? `<p class="small muted" style="margin-top:12px">${esc(t('loyalty.pctNote'))}</p>` : ''}</div>
</div></section>
<section class="section-tight"><div class="wrap" style="max-width:860px"><h2 class="h3" style="margin-bottom:18px">${esc(t('subPage.questions'))}</h2>${faqHtml(faqItems(t).filter((_, i) => [4, 5, 6].includes(i)), { open: 0 })}</div></section>`;
  return layout({ t, path: '/subscription', title: t('meta.subscription.title'), description: t('meta.subscription.description', { n, interval }), main, assets, jsonLd: [breadcrumbLd(t, [[t('nav.shop'), '/'], [t('nav.subscription'), '/subscription']])] });
}

export function renderContact({ t, assets }) {
  const main = `${head(t('contact.eyebrow'), titleAB(t, 'contact.titleA', 'contact.titleB'), esc(t('contact.lead')))}
<section class="section-tight"><div class="wrap checkout-grid">
  <form class="fields" data-contact-form novalidate>
    <div class="fields-2"><div class="field"><label for="c-name">${esc(t('contact.name'))}</label><input id="c-name" name="name" autocomplete="name" maxlength="120"></div><div class="field"><label for="c-email">${esc(t('contact.email'))}</label><input id="c-email" name="email" type="email" autocomplete="email" required maxlength="254"><span class="err">${esc(t('contact.errEmail'))}</span></div></div>
    <div class="field"><label for="c-msg">${esc(t('contact.message'))}</label><textarea id="c-msg" name="message" required minlength="10" maxlength="4000"></textarea><span class="err">${esc(t('contact.errMessage'))}</span></div>
    <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
    <div class="alert alert-error" data-form-error hidden role="alert"></div><div class="alert alert-ok" data-form-ok hidden role="status">${esc(t('contact.ok'))}</div>
    <div><button class="btn btn-primary" type="submit"><span class="spinner" aria-hidden="true"></span><span>${esc(t('contact.send'))}</span></button></div>
  </form>
  <aside class="summary-card"><div><p class="eyebrow">${esc(t('contact.email'))}</p><p style="margin-top:6px"><a class="link" href="mailto:${esc(brand.supportEmail)}">${esc(brand.supportEmail)}</a></p></div><div><p class="eyebrow">${esc(t('contact.social'))}</p><p style="margin-top:6px">Instagram <a class="link" href="${esc(brand.social.instagram.url)}" rel="noopener" target="_blank">${esc(brand.social.instagram.handle)}</a><br>TikTok <a class="link" href="${esc(brand.social.tiktok.url)}" rel="noopener" target="_blank">${esc(brand.social.tiktok.handle)}</a></p></div><div><p class="eyebrow">${esc(t('contact.company'))}</p><p class="small muted" style="margin-top:6px">${esc(brand.legalName)}<br>${esc(brand.legal.address)}<br>KvK ${esc(brand.legal.kvk)} · VAT ${esc(brand.legal.vat)}</p></div></aside>
</div></section>`;
  return layout({ t, path: '/contact', title: t('meta.contact.title'), description: t('meta.contact.description', { email: brand.supportEmail }), main, assets, scripts: [assets.formsJs], jsonLd: [organizationLd(t)] });
}

export function renderCheckout({ t, assets }) {
  const interval = intervalLabel(t);
  const subTerms = `<div class="sub-terms" data-sub-terms hidden>${t('checkout.subTerms', { product: esc(t('product.shortName')), interval: esc(interval), subFree: shipping.subscriptionShipsFree ? t('checkout.subTerms.subFree') : '' })}</div>`;
  const main = `${head(t('checkout.eyebrow'), titleAB(t, 'checkout.titleA', 'checkout.titleB'))}
<section class="section-tight"><div class="wrap checkout-grid">
  <form class="fields" data-checkout-form novalidate>
    <div class="alert alert-info" data-cart-empty hidden>${esc(t('checkout.empty'))} <a class="link" href="${t.href('/')}#buy">${esc(t('cta.get'))}</a></div>
    <div class="alert alert-error" data-retry-note hidden>${esc(t('checkout.retry'))}</div>
    <div class="form-section" style="border-top:0;padding-top:0"><h2 class="form-title">${esc(t('checkout.contact'))}</h2>
      <div class="field"><label for="f-email">${esc(t('checkout.email'))}</label><input id="f-email" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="254"><span class="err">${esc(t('checkout.errEmail'))}</span></div>
    </div>
    <div class="form-section"><h2 class="form-title">${esc(t('checkout.delivery'))}</h2>
      <div class="field"><label for="f-name">${esc(t('checkout.name'))}</label><input id="f-name" name="name" autocomplete="name" required minlength="2" maxlength="120"><span class="err">${esc(t('checkout.errName'))}</span></div>
      <div class="field"><label for="f-street">${esc(t('checkout.street'))}</label><input id="f-street" name="street" autocomplete="street-address" required minlength="3" maxlength="160"><span class="err">${esc(t('checkout.errStreet'))}</span></div>
      <div class="fields-2"><div class="field"><label for="f-postal">${esc(t('checkout.postal'))}</label><input id="f-postal" name="postalCode" autocomplete="postal-code" required minlength="4" maxlength="12"><span class="err">${esc(t('checkout.required'))}</span></div><div class="field"><label for="f-city">${esc(t('checkout.city'))}</label><input id="f-city" name="city" autocomplete="address-level2" required minlength="2" maxlength="80"><span class="err">${esc(t('checkout.required'))}</span></div></div>
      <div class="field"><label for="f-country">${esc(t('checkout.country'))}</label><select id="f-country" name="country" autocomplete="country">${shipping.countries.map((c) => `<option value="${c}"${c === shipping.defaultCountry ? ' selected' : ''}>${esc(t(`checkout.country.${c}`))}</option>`).join('')}</select></div>
    </div>
    <div class="form-section"><h2 class="form-title">${esc(t('checkout.payment'))}</h2>
      <div class="methods" role="radiogroup" aria-label="${esc(t('checkout.methodAria'))}">
        <label class="method"><input type="radio" name="method" value="ideal" checked><img src="/assets/payment/ideal.svg" alt="" width="32" height="24"><span class="m-name">${esc(t('checkout.method.ideal'))}</span></label>
        <label class="method" data-method-applepay><input type="radio" name="method" value="applepay"><img src="/assets/payment/applepay.svg" alt="" width="32" height="24"><span class="m-name">${esc(t('checkout.method.applepay'))}</span></label>
        <label class="method"><input type="radio" name="method" value="creditcard"><img src="/assets/payment/visa.svg" alt="" width="38" height="24"><span class="m-name">${esc(t('checkout.method.card'))}</span><span class="m-brands"><img src="/assets/payment/mastercard.svg" alt="Mastercard" width="38" height="24"></span></label>
      </div>
      <p class="small muted">${esc(t('checkout.mollieNote'))}</p>
    </div>
    <div class="form-section">
      <label class="consent"><input type="checkbox" name="marketingConsent"><span>${esc(t('checkout.marketing'))}</span></label>
      <label class="consent"><input type="checkbox" name="terms" required><span>${t('checkout.terms', { terms: t.href('/terms'), privacy: t.href('/privacy') })}<span class="err" style="display:block">${esc(t('checkout.errTerms'))}</span></span></label>
      <p class="sub-confirm" data-sub-confirm hidden>${esc(t('checkout.subConfirm', { interval: esc(interval) }))}</p>
      <div class="alert alert-error" data-form-error hidden role="alert" aria-live="assertive"></div>
      <button class="btn btn-primary btn-block" type="submit" data-pay><span class="spinner" aria-hidden="true"></span><span data-pay-label>${esc(t('checkout.pay'))}</span></button>
      ${payBadges(t, { label: false })}
    </div>
  </form>
  <aside class="checkout-summary">
    <div class="summary-card">
      <div class="cart-item"><div class="thumb">${sachetSvg({ title: '' })}</div><div><div class="ci-title">${esc(t('product.shortName'))}</div><div class="ci-mode" data-sum-mode></div><div class="ci-sub" data-sum-qty></div></div></div>
      <div class="mode-switch" role="group" aria-label="${esc(t('checkout.modeAria'))}"><button type="button" data-mode-btn="one_time">${esc(t('panel.oneTime'))}</button><button type="button" data-mode-btn="subscription">${esc(t('panel.subscribe'))}</button></div>
      <div class="totals" data-sum-totals></div>
      ${subTerms}
      <p class="small muted">${esc(t('checkout.prices', { estimate: shipping.deliveryEstimate }))}</p>
    </div>
  </aside>
</div></section>`;
  return layout({ t, path: '/checkout', title: t('meta.checkout.title'), description: t('meta.checkout.description'), main, assets, scripts: [assets.checkoutJs], noindex: true });
}

export function renderOrder({ t, assets }) {
  const main = `${head(t('order.eyebrow'), `<span data-order-title>${esc(t('order.wait'))}</span>`)}
<section class="section-tight"><div class="wrap" style="max-width:720px">
  <div class="status-card" data-order-card>
    <div class="status-icon pending" data-status-icon><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
    <p class="lead" data-order-message>${esc(t('order.checking'))}</p>
    <dl class="kv" data-order-details></dl>
    <div data-order-actions style="display:flex;gap:12px;flex-wrap:wrap"></div>
  </div>
</div></section>`;
  return layout({ t, path: '/order', title: t('meta.order.title'), description: t('meta.order.title'), main, assets, scripts: [assets.orderJs], noindex: true });
}

export function renderAccount({ t, assets }) {
  const th = split(t('account.th'));
  const main = `${head(t('account.eyebrow'), titleAB(t, 'account.titleA', 'account.titleB'))}
<section class="section-tight"><div class="wrap" style="max-width:860px">
  <div data-acc-signin hidden>
    <div class="summary-card" style="max-width:480px">
      <p>${esc(t('account.signinText'))}</p>
      <form class="fields" data-signin-form novalidate>
        <div class="field"><label for="a-email">${esc(t('account.email'))}</label><input id="a-email" name="email" type="email" autocomplete="email" required><span class="err">${esc(t('account.errEmail'))}</span></div>
        <div class="alert alert-error" data-form-error hidden role="alert"></div><div class="alert alert-ok" data-form-ok hidden role="status">${esc(t('account.linkSent'))}</div>
        <button class="btn btn-primary" type="submit"><span class="spinner" aria-hidden="true"></span><span>${esc(t('account.send'))}</span></button>
      </form>
    </div>
  </div>
  <div data-acc-content hidden class="stack">
    <div class="summary-card" data-acc-sub></div>
    <div><h2 class="h3" style="margin-bottom:14px">${esc(t('account.orders'))}</h2><div style="overflow:auto"><table class="table"><thead><tr>${th.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody data-acc-orders></tbody></table></div></div>
    <div><button class="btn btn-ghost" type="button" data-logout>${esc(t('account.signOut'))}</button></div>
  </div>
</div></section>`;
  return layout({ t, path: '/account', title: t('meta.account.title'), description: t('meta.account.description'), main, assets, scripts: [assets.accountJs], noindex: true });
}

export function renderLegal({ t, assets }) {
  const company = `${esc(brand.legalName)}, ${ph(brand.legal.address)}, KvK ${ph(brand.legal.kvk)}, VAT ${ph(brand.legal.vat)}, ${esc(brand.supportEmail)}`;
  const note = `<p class="alert alert-info">${t('legal.draft')}</p>`;
  const vars = {
    company, date: ph(t('legal.ph.date')), cookies: t.href('/cookies'), carrier: ph(t('legal.ph.carrier')), emailProvider: ph(t('legal.ph.emailProvider')), hosting: ph(t('legal.ph.hosting')),
    email: esc(brand.supportEmail), vendors: ph(t('legal.ph.vendors')), interval: esc(intervalLabel(t)), countries: esc(shipping.countries.join(', ')), estimate: ph(shipping.deliveryEstimate),
    days: String(shipping.returnWindowDays), shipping: t.href('/shipping-returns'), localLaw: ph(t('legal.ph.localLaw')), cost: esc(priceFmt(shipping.costCents, t)),
    threshold: esc(priceFmt(shipping.freeShippingThresholdCents, t)), subFree: shipping.subscriptionShipsFree ? t('legal.shipping.subFree') : '', returnCost: ph(t('legal.ph.returnCost')),
  };
  const page = (pathname, key, metaKey) => layout({ t, path: pathname, title: t(`meta.${metaKey}.title`), description: t(`meta.${metaKey}.description`), main: `${head(t('legal.eyebrow'), esc(t(`meta.${metaKey}.title`)))}<section><div class="wrap"><div class="prose">${note}${t(key, vars)}</div></div></section>`, assets, jsonLd: [breadcrumbLd(t, [[t('nav.shop'), '/'], [t(`meta.${metaKey}.title`), pathname]])] });
  return {
    privacy: page('/privacy', 'legal.privacy', 'privacy'),
    cookies: page('/cookies', 'legal.cookies', 'cookies'),
    terms: page('/terms', 'legal.terms', 'terms'),
    shipping: page('/shipping-returns', 'legal.shipping', 'shipping'),
  };
}

export function renderNotFound({ t, assets }) {
  return layout({ t, path: '/404', title: t('meta.404.title'), description: t('meta.404.title'), main: `${head('404', titleAB(t, 'nf.titleA', 'nf.titleB'), esc(t('nf.lead')))}<section class="section-tight"><div class="wrap"><a class="btn btn-primary" href="${t.href('/')}">${esc(t('cta.back'))}</a></div></section>`, assets, noindex: true });
}

/** Admin stays English (internal tool). */
export function renderAdmin({ t, assets }) {
  const main = `${head('Admin', 'Orders &amp; <span class="serif gold">subscriptions</span>')}
<section class="section-tight"><div class="wrap">
  <div data-admin-login class="summary-card" style="max-width:480px"><p class="small muted">Enter the admin token (ADMIN_TOKEN). It is kept in this tab only.</p><div class="field"><label for="adm-token">Admin token</label><input id="adm-token" type="password" autocomplete="off"></div><button class="btn btn-primary" type="button" data-admin-signin>Open admin</button><div class="alert alert-error" data-admin-error hidden></div></div>
  <div data-admin-app hidden class="stack">
    <div class="why-grid" data-admin-stats></div>
    <div><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px"><h2 class="h3">Orders</h2><input data-admin-search placeholder="Search order / e-mail" style="margin-left:auto;min-height:40px;padding:8px 12px;background:rgba(16,29,58,.55);border:1px solid var(--line-soft);border-radius:6px;color:var(--cream)"><select data-admin-filter style="min-height:40px;padding:8px;background:rgba(16,29,58,.55);border:1px solid var(--line-soft);border-radius:6px;color:var(--cream)"><option value="">All</option><option value="paid">Paid</option><option value="unfulfilled">To ship</option><option value="shipped">Shipped</option><option value="failed">Failed</option><option value="refunded">Refunded</option></select></div><div style="overflow:auto"><table class="table"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Type</th><th>Total</th><th>Payment</th><th>Fulfilment</th><th>Actions</th></tr></thead><tbody data-admin-orders></tbody></table></div></div>
    <div><h2 class="h3" style="margin-bottom:12px">Subscriptions</h2><div style="overflow:auto"><table class="table"><thead><tr><th>Customer</th><th>Status</th><th>Interval</th><th>Next payment</th><th>Loyalty</th><th>Failed</th><th>Actions</th></tr></thead><tbody data-admin-subs></tbody></table></div></div>
  </div>
</div></section>`;
  return layout({ t, path: '/admin', title: 'Admin', description: 'Admin', main, assets, scripts: [assets.adminJs], noindex: true });
}
