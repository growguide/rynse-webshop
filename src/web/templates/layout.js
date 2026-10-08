// Page shell: head (SEO/social/hreflang), nav, language switcher, footer, cart drawer, sticky bar, consent, scripts.
import { brand, product, site, subscription, placeholders } from '../../config/commerce.js';
import { esc, logo, svgDefs, sachetSvg, payBadges, isDev, intervalLabel } from './components.js';
import { LOCALES, LOCALE_META, DEFAULT_LOCALE, href, clientStrings } from '../i18n/index.js';

const navLinks = (t) => [
  ['/product', t('nav.shop')],
  ['/why-rynse', t('nav.why')],
  ['/subscription', t('nav.subscription')],
  ['/faq', t('nav.faq')],
];

/**
 * @param {object} o
 * @param {Function} o.t translator for this page's locale
 * @param {string} o.path locale-less path ('/faq'); localized with t.href()
 */
export function layout({ t, path: pathname, title, description, bodyClass = '', main, scripts = [], jsonLd = [], ogImage = '/assets/img/og.jpg', noindex = false, assets }) {
  const locale = t.locale;
  const meta = t.meta;
  const fullTitle = pathname === '/' ? `${brand.name} — ${t('meta.home.title', { n: product.wipesPerPack })}` : `${title} | ${brand.name}`;
  const url = `${site.baseUrl}${href(pathname, locale)}`;
  const devBanner = isDev && placeholders.length ? `<div class="dev-banner" title="${esc(placeholders.map((p) => p.key).join(', '))}">Development build · ${placeholders.length} placeholder value(s) · payment emulator</div>` : '';
  const ld = jsonLd.length ? `<script type="application/ld+json">${JSON.stringify(jsonLd.length === 1 ? jsonLd[0] : jsonLd).replace(/</g, '\\u003c')}</script>` : '';
  const alternates = noindex ? '' : LOCALES.map((l) => `<link rel="alternate" hreflang="${LOCALE_META[l].lang}" href="${esc(site.baseUrl + href(pathname, l))}">`).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${esc(site.baseUrl + href(pathname, DEFAULT_LOCALE))}">`;
  const links = navLinks(t);
  const clientCfg = {
    env: isDev ? 'development' : 'production', locale, currency: product.currency, priceCents: product.priceCents, maxQuantity: product.maxQuantity,
    interval: intervalLabel(t), numberLocale: meta.numberLocale, analytics: site.analytics, prefix: href('/', locale).replace(/\/$/, ''),
    path: pathname, i18n: clientStrings(locale), languages: Object.fromEntries(LOCALES.map((l) => [l, LOCALE_META[l].name])),
  };
  const langSwitcher = (cls) => `<div class="lang ${cls}" data-lang><label class="sr-only" for="lang-${cls}">${esc(t('lang.label'))}</label><select id="lang-${cls}" data-lang-select aria-label="${esc(t('lang.label'))}">${LOCALES.map((l) => `<option value="${l}"${l === locale ? ' selected' : ''}>${LOCALE_META[l].short} · ${LOCALE_META[l].name}</option>`).join('')}</select></div>`;

  return `<!doctype html>
<html lang="${meta.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
${alternates}
${noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta name="theme-color" content="#070d1c">
<meta property="og:type" content="${pathname === '/' ? 'product' : 'website'}">
<meta property="og:site_name" content="${esc(brand.name)}">
<meta property="og:locale" content="${meta.ogLocale}">
${LOCALES.filter((l) => l !== locale).map((l) => `<meta property="og:locale:alternate" content="${LOCALE_META[l].ogLocale}">`).join('\n')}
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(site.baseUrl + ogImage)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(site.baseUrl + ogImage)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/assets/fonts/outfit-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets.css}">
${ld}
<script>window.__RYNSE__=${JSON.stringify(clientCfg).replace(/</g, '\\u003c')};</script>
</head>
<body class="${esc(bodyClass)}" data-path="${esc(pathname)}" data-locale="${locale}">
${devBanner}
<a class="skip" href="#main">${esc(t('skip'))}</a>
${svgDefs()}
<header class="nav" id="nav">
  <div class="wrap">
    <a class="nav-logo" href="${t.href('/')}" aria-label="${esc(t('nav.home'))}">${logo()}</a>
    <nav class="nav-links" aria-label="Main">${links.map(([p, label]) => `<a href="${t.href(p)}"${p === pathname ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('')}</nav>
    <div class="nav-actions">
      ${langSwitcher('nav-lang')}
      <a class="icon-btn" href="${t.href('/account')}" aria-label="${esc(t('nav.account'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg></a>
      <button class="icon-btn" type="button" data-cart-open aria-label="${esc(t('nav.cart'))}" aria-haspopup="dialog"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg><span class="cart-count" data-cart-count>0</span></button>
      <a class="btn btn-primary nav-cta" href="${t.href('/product')}#buy">${esc(t('cta.get'))}</a>
      <button class="icon-btn nav-burger" type="button" data-menu-open aria-label="${esc(t('nav.menu'))}" aria-expanded="false" aria-controls="menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    </div>
  </div>
</header>
<div class="menu" id="menu" role="dialog" aria-modal="true" aria-label="Menu">
  <button class="icon-btn menu-close" type="button" data-menu-close aria-label="${esc(t('nav.close'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  ${links.map(([p, label]) => `<a href="${t.href(p)}">${esc(label)}</a>`).join('')}<a href="${t.href('/account')}">${esc(t('nav.account'))}</a>
  <div class="menu-foot">${langSwitcher('menu-lang')}<a class="btn btn-primary btn-block" href="${t.href('/product')}#buy">${esc(t('cta.get'))}</a><p class="small muted">${esc(t('brand.tagline'))}</p></div>
</div>
<main id="main">
${main}
</main>
<footer class="footer">
  <div class="wrap">
    <div class="footer-grid">
      <div><a class="footer-logo" href="${t.href('/')}" aria-label="${esc(brand.name)}">${logo()}</a><p style="margin-top:14px;max-width:32ch">${esc(t('brand.tagline'))} ${esc(t('footer.blurb', { n: product.wipesPerPack }))}</p></div>
      <div><h4>${esc(t('footer.shop'))}</h4><ul><li><a href="${t.href('/product')}#buy">${esc(t('cta.get'))}</a></li><li><a href="${t.href('/subscription')}">${esc(t('footer.subscribe'))}</a></li><li><a href="${t.href('/why-rynse')}">${esc(t('nav.why'))}</a></li><li><a href="${t.href('/faq')}">${esc(t('nav.faq'))}</a></li></ul></div>
      <div><h4>${esc(t('footer.help'))}</h4><ul><li><a href="${t.href('/shipping-returns')}">${esc(t('footer.shippingReturns'))}</a></li><li><a href="${t.href('/contact')}">${esc(t('footer.contact'))}</a></li><li><a href="${t.href('/account')}">${esc(t('nav.account'))}</a></li></ul></div>
      <div><h4>${esc(t('footer.legal'))}</h4><ul><li><a href="${t.href('/privacy')}">${esc(t('footer.privacy'))}</a></li><li><a href="${t.href('/cookies')}">${esc(t('footer.cookies'))}</a></li><li><a href="${t.href('/terms')}">${esc(t('footer.terms'))}</a></li></ul></div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getUTCFullYear()} ${esc(brand.legalName)}</span>
      <div class="footer-social"><a href="${esc(brand.social.instagram.url)}" rel="noopener" target="_blank">Instagram ${esc(brand.social.instagram.handle)}</a><a href="${esc(brand.social.tiktok.url)}" rel="noopener" target="_blank">TikTok ${esc(brand.social.tiktok.handle)}</a></div>
      ${langSwitcher('footer-lang')}
      ${payBadges(t, { label: false })}
    </div>
  </div>
</footer>
<div class="sticky-bar" data-sticky aria-hidden="true"><div><div class="sb-title">${esc(t('product.shortName'))}</div><div class="sb-price" data-sticky-price></div></div><button class="btn btn-primary" type="button" data-sticky-cta>${esc(t('cta.get'))}</button></div>
<div class="drawer-backdrop" data-cart-backdrop></div>
<aside class="drawer" data-cart role="dialog" aria-modal="true" aria-label="${esc(t('drawer.title'))}" aria-hidden="true">
  <div class="drawer-head"><h2>${esc(t('drawer.title'))}</h2><button class="icon-btn" type="button" data-cart-close aria-label="${esc(t('drawer.close'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
  <div class="drawer-body" data-cart-body></div>
  <div class="drawer-foot" data-cart-foot hidden>
    <div class="totals" data-cart-totals></div>
    <a class="btn btn-primary btn-block" href="${t.href('/checkout')}" data-cart-checkout>${esc(t('cta.checkout'))}</a>
    ${payBadges(t, { label: false })}
  </div>
</aside>
<template id="tpl-cart-sachet">${sachetSvg({ title: '' })}</template>
<div class="consent-banner" data-consent role="region" aria-label="${esc(t('consent.aria'))}">
  <div>${esc(t('consent.text'))} <a class="link" href="${t.href('/cookies')}">${esc(t('consent.policy'))}</a></div>
  <div class="cb-actions"><button class="btn btn-ghost" type="button" data-consent-reject>${esc(t('consent.decline'))}</button><button class="btn btn-primary" type="button" data-consent-accept>${esc(t('consent.allow'))}</button></div>
</div>
<div class="lang-suggest" data-lang-suggest hidden><span data-lang-suggest-text></span><button class="btn btn-primary" type="button" data-lang-suggest-switch></button><button class="btn btn-ghost" type="button" data-lang-suggest-dismiss></button></div>
<script src="${assets.js}" defer></script>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>`;
}

export function organizationLd(t) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: brand.name,
    url: site.baseUrl,
    logo: `${site.baseUrl}/assets/brand/logo-512.png`,
    sameAs: [brand.social.instagram.url, brand.social.tiktok.url],
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: brand.supportEmail, availableLanguage: ['en', 'nl', 'es'] }],
  };
}

export function websiteLd(t) {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: brand.name, url: site.baseUrl, inLanguage: t.meta.lang };
}

export function breadcrumbLd(t, items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${site.baseUrl}${t.href(path)}` })) };
}

export function productLd(t) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    brand: { '@type': 'Brand', name: brand.name },
    description: t('brand.description', { n: product.wipesPerPack }),
    image: [`${site.baseUrl}/assets/img/product-hero.jpg`],
    url: `${site.baseUrl}${t.href('/')}`,
    inLanguage: t.meta.lang,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Wipes per pack', value: String(product.wipesPerPack) },
      { '@type': 'PropertyValue', name: 'Individually wrapped', value: 'Yes' },
      { '@type': 'PropertyValue', name: 'Water-based', value: 'Yes' },
      { '@type': 'PropertyValue', name: 'pH-balanced', value: 'Yes' },
      { '@type': 'PropertyValue', name: 'Alcohol-free', value: 'Yes' },
    ],
  };
  if (product.structuredData.includeOffer) {
    ld.offers = { '@type': 'Offer', price: (product.priceCents / 100).toFixed(2), priceCurrency: product.currency, availability: product.structuredData.availability, url: `${site.baseUrl}${t.href('/product')}#buy`, seller: { '@type': 'Organization', name: brand.name } };
  }
  return ld;
}

export function faqLd(items) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
}
