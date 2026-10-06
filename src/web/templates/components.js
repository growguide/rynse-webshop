// Shared HTML components (string templates, zero dependencies).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { product, shipping, subscription, loyalty, copy, payments, formatMoney, placeholders } from '../../config/commerce.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(here, '..', 'assets');

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const isDev = process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production';

const wordmarkSvg = readFileSync(path.join(assetsDir, 'brand', 'rynse-wordmark.svg'), 'utf8');
const wordmarkPath = /d="([^"]+)"/.exec(wordmarkSvg)[1];
const wordmarkViewBox = /viewBox="([^"]+)"/.exec(wordmarkSvg)[1];
const taglineSvg = readFileSync(path.join(assetsDir, 'brand', 'rynse-tagline.svg'), 'utf8');

/** Inline logo (real vector wordmark). Colour via currentColor. */
export function logo({ className = '', label = 'RYNSE' } = {}) {
  return `<svg class="${className}" viewBox="${wordmarkViewBox}" role="img" aria-label="${esc(label)}" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${wordmarkPath}"/></svg>`;
}
export function tagline({ className = '' } = {}) {
  return taglineSvg.replace('<svg ', `<svg class="${className}" `);
}

/** Symbol definitions used by <use> (wordmark + sachet). Include once per page. */
export function svgDefs() {
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <symbol id="rynse-wm" viewBox="${wordmarkViewBox}"><path fill="currentColor" fill-rule="evenodd" d="${wordmarkPath}"/></symbol>
    <linearGradient id="sachet-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c2f5c"/><stop offset="0.45" stop-color="#0f1d3a"/><stop offset="1" stop-color="#0a1428"/></linearGradient>
    <linearGradient id="sachet-sheen" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="0.35" stop-color="#ffffff" stop-opacity="0.02"/><stop offset="0.6" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#e2c272" stop-opacity="0.12"/></linearGradient>
    <linearGradient id="sachet-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1dca6"/><stop offset="0.5" stop-color="#e2c272"/><stop offset="1" stop-color="#b8953f"/></linearGradient>
    <linearGradient id="sachet-edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3f70"/><stop offset="1" stop-color="#101d3a"/></linearGradient>
  </defs></svg>`;
}

/**
 * Procedural sachet (vector): navy foil packet with crimped edges and the real
 * gold wordmark. Used for floating hero layers, cart thumbnail, placeholders.
 * Aspect ~ 7:6.
 */
export function sachetSvg({ className = '', title = 'RYNSE cleansing wipe sachet' } = {}) {
  const W = 700, H = 600, edge = 26, tooth = 14;
  // zig-zag crimp along top and bottom edges
  let top = `M0 ${edge}`;
  for (let x = 0; x <= W; x += tooth) top += ` L${x + tooth / 2} ${edge - 9} L${x + tooth} ${edge}`;
  let bottom = ``;
  for (let x = W; x >= 0; x -= tooth) bottom += ` L${x - tooth / 2} ${H - edge + 9} L${x - tooth} ${H - edge}`;
  const outline = `${top} L${W} ${H - edge}${bottom} Z`;
  return `<svg class="${className}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" focusable="false">
  <path d="${outline}" fill="url(#sachet-body)"/>
  <rect x="0" y="${edge}" width="${W}" height="${edge * 2.2}" fill="url(#sachet-edge)" opacity="0.9"/>
  <rect x="0" y="${H - edge * 3.2}" width="${W}" height="${edge * 2.2}" fill="url(#sachet-edge)" opacity="0.9"/>
  <path d="${outline}" fill="url(#sachet-sheen)"/>
  <path d="M40 ${edge * 3.4} Q ${W / 2} ${edge * 3.0} ${W - 40} ${edge * 3.4}" stroke="#ffffff" stroke-opacity="0.08" fill="none"/>
  <g transform="translate(${W / 2 - 240} ${H / 2 - 48})"><use href="#rynse-wm" width="480" height="68" fill="url(#sachet-gold)" style="color:#e2c272"/></g>
  <text x="${W / 2}" y="${H / 2 + 64}" text-anchor="middle" font-family="Outfit, system-ui, sans-serif" font-weight="600" font-size="22" letter-spacing="5" fill="#e2c272" opacity="0.9">CLEANSING WIPE</text>
  <text x="${W / 2}" y="${H - edge * 3.6}" text-anchor="middle" font-family="Outfit, system-ui, sans-serif" font-weight="500" font-size="15" letter-spacing="3" fill="#b9a56e" opacity="0.8">WATER-BASED · pH-BALANCED · ALCOHOL-FREE</text>
</svg>`;
}

export function payBadges({ label = true, className = '' } = {}) {
  const items = [
    { src: '/assets/payment/ideal.svg', alt: 'iDEAL' },
    { src: '/assets/payment/applepay.svg', alt: 'Apple Pay' },
    { src: '/assets/payment/visa.svg', alt: 'Visa' },
    { src: '/assets/payment/mastercard.svg', alt: 'Mastercard' },
  ];
  return `<div class="pay-badges ${className}" aria-label="Accepted payment methods">${label ? '<span class="pay-label">Pay with</span>' : ''}${items.map((i) => `<img src="${i.src}" alt="${i.alt}" width="32" height="24" loading="lazy" decoding="async">`).join('')}</div>`;
}

export const priceFmt = (cents) => formatMoney(cents, product.currency, 'nl-NL').replace(/ /g, ' ');

export function placeholderFlag(key) {
  if (!isDev) return '';
  return placeholders.some((p) => p.key === key) ? `<span class="placeholder-flag" title="Placeholder value — set ${esc(key)}">placeholder</span>` : '';
}

/** Purchase panel: selector + CTA + facts + badges. `id` suffix allows two instances (hero + final). */
export function purchasePanel({ id = 'hero', compact = false } = {}) {
  const subPct = subscription.discountPct;
  const subPrice = subPct ? priceFmt(Math.round(product.priceCents * (1 - subPct / 100))) : null;
  return `<div class="panel" data-purchase="${id}">
  <div class="panel-head">
    <div><div class="panel-title">${esc(product.shortName)}</div><div class="small muted">${product.wipesPerPack} individually wrapped wipes</div></div>
    <div class="panel-price"><span data-price>${priceFmt(product.priceCents)}</span>${placeholderFlag('RYNSE_PRICE_CENTS')}<div class="small muted" style="text-align:right">incl. VAT</div></div>
  </div>
  <fieldset class="options" style="border:0;padding:0;margin:0">
    <legend class="sr-only">Choose how you want to buy</legend>
    <label class="option"><input type="radio" name="mode-${id}" value="one_time" checked><div class="option-title">${esc(copy.oneTime.title)}</div><div class="option-sub">${esc(copy.oneTime.sub)}</div></label>
    <label class="option"><input type="radio" name="mode-${id}" value="subscription"><div class="option-title">${esc(copy.subscribe.title)}<span class="tag">${subPct ? `−${subPct}%` : 'Loyalty'}</span></div><div class="option-sub">Every ${esc(subscription.interval)}${subPrice ? ` · ${subPrice}` : ''}. ${esc(copy.subscribe.sub)}</div></label>
  </fieldset>
  <div class="panel-row">
    <div class="qty" role="group" aria-label="Quantity"><button type="button" data-qty="-1" aria-label="Decrease quantity">−</button><output data-qty-out aria-live="polite">1</output><button type="button" data-qty="1" aria-label="Increase quantity">+</button></div>
    <button class="btn btn-primary" type="button" data-add><span class="spinner" aria-hidden="true"></span><span>${esc(copy.ctaPrimary)}</span></button>
  </div>
  ${compact ? '' : `<ul class="facts">${product.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`}
  <p class="sub-note" data-sub-note hidden>Subscription: delivered and billed every ${esc(subscription.interval)}${subscription.cancelAnytime ? ', cancel anytime from your account' : ''}. Loyalty benefits apply only while your subscription runs; cancelling resets them.</p>
  ${payBadges()}
</div>`;
}

export function faqItems() {
  return [
    ['What is RYNSE?', `RYNSE is a pack of ${product.wipesPerPack} individually wrapped, water-based cleansing wipes. They give you a fresh, clean feeling when water isn't available — after the gym, on the road, at a festival, after a flight or on a long working day.`],
    ['What are the wipes made of?', 'RYNSE wipes are water-based, pH-balanced and alcohol-free. Each wipe is individually wrapped, so it stays fresh until you open it.'],
    ['How many wipes are in a pack?', `${product.wipesPerPack}. Every wipe is individually wrapped in a compact, discreet sachet you can carry anywhere — pocket, gym bag or hand luggage.`],
    ['Is RYNSE for men or women?', 'RYNSE is unisex. The product and the sachet are designed for anyone who wants to stay fresh anywhere.'],
    ['Can I buy once, or do I need a subscription?', `Both. Choose a one-time purchase for a single pack, or Subscribe & Save for automatic deliveries every ${subscription.interval}. You can cancel a subscription at any time from your account.`],
    ['How do loyalty benefits work?', 'Subscribers build up a loyalty benefit for every full year their subscription runs without interruption. The benefit only exists while the subscription is active: if you cancel, it resets. A new subscription later starts again at year 1.'],
    ['How can I pay?', 'With iDEAL, Apple Pay and credit card (Visa, Mastercard). Payments are processed securely by Mollie.'],
    ['How fast do you deliver and what does shipping cost?', `Delivery: ${shipping.deliveryEstimate}. Shipping costs ${priceFmt(shipping.costCents)} and is free from ${priceFmt(shipping.freeShippingThresholdCents)}${shipping.subscriptionShipsFree ? ' — subscriptions always ship free' : ''}. We currently ship to ${shipping.countries.join(', ')}.`],
    ['Can I return my order?', `You can return an unopened pack within ${shipping.returnWindowDays} days of delivery. See Shipping & Returns for the details.`],
  ];
}

export function faqHtml(items = faqItems(), { open = 0 } = {}) {
  return `<div class="faq">${items.map(([q, a], i) => `<details${i === open ? ' open' : ''}><summary>${esc(q)}</summary><div class="answer">${esc(a)}</div></details>`).join('')}</div>`;
}

export function loyaltyLadder() {
  const names = ['Welcome tier', 'Second year', 'Third year', 'Fourth year and beyond'];
  return `<ol class="ladder">${loyalty.levels.map((l, i) => `<li><span class="lvl">${l.year}</span><div><div class="lvl-name">${esc(l.label)}</div><div class="lvl-sub">${esc(names[i] || '')}</div></div><span class="lvl-pct ${l.discountPct == null ? 'tbd' : ''}">${l.discountPct == null ? 'Benefit announced at launch' : `−${l.discountPct}%`}</span></li>`).join('')}</ol>`;
}

export const paymentMethodsConfig = payments.methods;
