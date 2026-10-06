// Shared HTML components (string templates, zero dependencies). Every component takes
// a translator `t` (src/web/i18n) so each locale builds its own pages.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { product, shipping, subscription, loyalty, payments, formatMoney, placeholders } from '../../config/commerce.js';
import { intervalLabel as i18nInterval } from '../i18n/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(here, '..', 'assets');

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const isDev = process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production';
export const split = (s) => String(s).split('|');

const wordmarkSvg = readFileSync(path.join(assetsDir, 'brand', 'rynse-wordmark.svg'), 'utf8');
const wordmarkPath = /d="([^"]+)"/.exec(wordmarkSvg)[1];
const wordmarkViewBox = /viewBox="([^"]+)"/.exec(wordmarkSvg)[1];

/** Inline logo (real vector wordmark). Colour via currentColor. */
export function logo({ className = '', label = 'RYNSE' } = {}) {
  return `<svg class="${className}" viewBox="${wordmarkViewBox}" role="img" aria-label="${esc(label)}" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${wordmarkPath}"/></svg>`;
}

/** Symbol definitions used by <use> (wordmark + sachet gradients). Include once per page. */
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

/** Procedural vector sachet with the real gold wordmark (hero depth layer, cart thumbnail, placeholders). */
export function sachetSvg({ className = '', title = 'RYNSE cleansing wipe sachet' } = {}) {
  const W = 700, H = 600, edge = 26, tooth = 14;
  let top = `M0 ${edge}`;
  for (let x = 0; x <= W; x += tooth) top += ` L${x + tooth / 2} ${edge - 9} L${x + tooth} ${edge}`;
  let bottom = ``;
  for (let x = W; x >= 0; x -= tooth) bottom += ` L${x - tooth / 2} ${H - edge + 9} L${x - tooth} ${H - edge}`;
  const outline = `${top} L${W} ${H - edge}${bottom} Z`;
  return `<svg class="${className}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" focusable="false"${title ? '' : ' aria-hidden="true"'}>
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

/** Responsive <picture> with AVIF + WebP sources from the images manifest. */
export function picture(img, { sizes = '100vw', className = '', loading = 'lazy', fetchpriority, alt } = {}) {
  const a = alt ?? img.alt ?? '';
  const attrs = `alt="${esc(a)}" width="${img.width || ''}" height="${img.height || ''}" loading="${loading}" decoding="async"${fetchpriority ? ` fetchpriority="${fetchpriority}"` : ''}${className ? ` class="${className}"` : ''}`;
  if (!img.srcset) return `<img src="${esc(img.src)}" ${attrs}>`;
  return `<picture>${img.srcsetAvif ? `<source type="image/avif" srcset="${esc(img.srcsetAvif)}" sizes="${sizes}">` : ''}<source type="image/webp" srcset="${esc(img.srcset)}" sizes="${sizes}"><img src="${esc(img.src)}" srcset="${esc(img.srcset)}" sizes="${sizes}" ${attrs}></picture>`;
}

export function payBadges(t, { label = true, className = '' } = {}) {
  const items = [
    { src: '/assets/payment/ideal.svg', alt: 'iDEAL' },
    { src: '/assets/payment/applepay.svg', alt: 'Apple Pay' },
    { src: '/assets/payment/visa.svg', alt: 'Visa' },
    { src: '/assets/payment/mastercard.svg', alt: 'Mastercard' },
  ];
  return `<div class="pay-badges ${className}" aria-label="${esc(t('payBadges.aria'))}">${label ? `<span class="pay-label">${esc(t('payBadges.label'))}</span>` : ''}${items.map((i) => `<img src="${i.src}" alt="${i.alt}" width="32" height="24" loading="lazy" decoding="async">`).join('')}</div>`;
}

export const priceFmt = (cents, t) => formatMoney(cents, product.currency, t ? t.meta.numberLocale : 'nl-NL').replace(/ /g, ' ');

export function placeholderFlag(key) {
  if (!isDev) return '';
  return placeholders.some((p) => p.key === key) ? `<span class="placeholder-flag" title="Placeholder value — set ${esc(key)}">placeholder</span>` : '';
}

/** Purchase panel: selector + CTA + facts + badges. */
export function purchasePanel(t, { id = 'hero', compact = false } = {}) {
  const subPct = subscription.discountPct;
  const subPrice = subPct ? priceFmt(Math.round(product.priceCents * (1 - subPct / 100)), t) : null;
  const facts = ['facts.1', 'facts.2', 'facts.3', 'facts.4'].map((k) => t(k));
  return `<div class="panel" data-purchase="${id}">
  <div class="panel-head">
    <div><div class="panel-title">${esc(t('product.shortName'))}</div><div class="small muted">${esc(t('product.wipes', { n: product.wipesPerPack }))}</div></div>
    <div class="panel-price"><span data-price>${priceFmt(product.priceCents, t)}</span>${placeholderFlag('RYNSE_PRICE_CENTS')}<div class="small muted" style="text-align:right">${esc(t('product.inclVat'))}</div></div>
  </div>
  <fieldset class="options" style="border:0;padding:0;margin:0">
    <legend class="sr-only">${esc(t('panel.choose'))}</legend>
    <label class="option"><input type="radio" name="mode-${id}" value="one_time" checked><div class="option-title">${esc(t('panel.oneTime'))}</div><div class="option-sub">${esc(t('panel.oneTimeSub'))}</div></label>
    <label class="option"><input type="radio" name="mode-${id}" value="subscription"><div class="option-title">${esc(t('panel.subscribe'))}<span class="tag">${subPct ? `−${subPct}%` : esc(t('panel.loyaltyTag'))}</span></div><div class="option-sub">${esc(t('panel.every', { interval: intervalLabel(t) }))}${subPrice ? ` · ${subPrice}` : ''}. ${esc(t('panel.subscribeSub'))}</div></label>
  </fieldset>
  <div class="panel-row">
    <div class="qty" role="group" aria-label="${esc(t('panel.qty'))}"><button type="button" data-qty="-1" aria-label="${esc(t('panel.decrease'))}">−</button><output data-qty-out aria-live="polite">1</output><button type="button" data-qty="1" aria-label="${esc(t('panel.increase'))}">+</button></div>
    <button class="btn btn-primary" type="button" data-add><span class="spinner" aria-hidden="true"></span><span>${esc(t('cta.get'))}</span></button>
  </div>
  ${compact ? '' : `<ul class="facts">${facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`}
  <p class="sub-note" data-sub-note hidden>${esc(t('panel.subNote', { interval: intervalLabel(t) }))}</p>
  ${payBadges(t)}
</div>`;
}

export const intervalLabel = (t) => i18nInterval(t.locale, subscription.interval);

export function faqItems(t) {
  const n = product.wipesPerPack;
  const interval = intervalLabel(t);
  const vars = { n, interval, estimate: shipping.deliveryEstimate, cost: priceFmt(shipping.costCents, t), threshold: priceFmt(shipping.freeShippingThresholdCents, t), subFree: shipping.subscriptionShipsFree ? t('faq.a8.subFree') : '', countries: shipping.countries.join(', '), days: shipping.returnWindowDays };
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => [t(`faq.q${i}`, vars), t(`faq.a${i}`, vars)]);
}

export function faqHtml(items, { open = 0 } = {}) {
  return `<div class="faq">${items.map(([q, a], i) => `<details${i === open ? ' open' : ''}><summary>${esc(q)}</summary><div class="answer">${esc(a)}</div></details>`).join('')}</div>`;
}

export function loyaltyLadder(t) {
  const tiers = split(t('loyalty.tiers'));
  return `<ol class="ladder">${loyalty.levels.map((l, i) => `<li><span class="lvl">${l.year}</span><div><div class="lvl-name">${esc(i === loyalty.levels.length - 1 ? t('loyalty.year4') : t('loyalty.year', { n: l.year }))}</div><div class="lvl-sub">${esc(tiers[i] || '')}</div></div><span class="lvl-pct ${l.discountPct == null ? 'tbd' : ''}">${l.discountPct == null ? esc(t('loyalty.tbd')) : `−${l.discountPct}%`}</span></li>`).join('')}</ol>`;
}

export const paymentMethodsConfig = payments.methods;
