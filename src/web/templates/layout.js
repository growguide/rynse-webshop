// Page shell: head (SEO/social), nav, footer, cart drawer, sticky bar, consent, scripts.
import { brand, product, site, copy, subscription, placeholders } from '../../config/commerce.js';
import { esc, logo, svgDefs, sachetSvg, payBadges, isDev } from './components.js';

const navLinks = [
  ['/', 'Shop'],
  ['/why-rynse', 'Why RYNSE'],
  ['/subscription', 'Subscription'],
  ['/faq', 'FAQ'],
];

export function layout({ path: pathname, title, description, bodyClass = '', main, scripts = [], jsonLd = [], ogImage = '/assets/img/og.jpg', noindex = false, canonical, assets }) {
  const fullTitle = pathname === '/' ? `${brand.name} — Stay fresh. Anywhere. | ${product.wipesPerPack} cleansing wipes` : `${title} | ${brand.name}`;
  const url = `${site.baseUrl}${canonical || pathname}`;
  const devBanner = isDev && placeholders.length ? `<div class="dev-banner" title="${esc(placeholders.map((p) => p.key).join(', '))}">Development build · ${placeholders.length} placeholder value(s) · payment emulator</div>` : '';
  const ld = jsonLd.length ? `<script type="application/ld+json">${JSON.stringify(jsonLd.length === 1 ? jsonLd[0] : jsonLd).replace(/</g, '\\u003c')}</script>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta name="theme-color" content="#070d1c">
<meta property="og:type" content="${pathname === '/' ? 'product' : 'website'}">
<meta property="og:site_name" content="${esc(brand.name)}">
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
<link rel="preload" href="/assets/fonts/instrument-serif-italic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets.css}">
${ld}
<script>window.__RYNSE__=${JSON.stringify({ env: isDev ? 'development' : 'production', currency: product.currency, priceCents: product.priceCents, interval: subscription.interval, analytics: site.analytics }).replace(/</g, '\\u003c')};</script>
</head>
<body class="${esc(bodyClass)}" data-path="${esc(pathname)}">
${devBanner}
<a class="skip" href="#main">Skip to content</a>
${svgDefs()}
<header class="nav" id="nav">
  <div class="wrap">
    <a class="nav-logo" href="/" aria-label="${esc(brand.name)} home">${logo()}</a>
    <nav class="nav-links" aria-label="Main">${navLinks.map(([href, label]) => `<a href="${href}"${href === pathname ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
    <div class="nav-actions">
      <a class="icon-btn" href="/account" aria-label="Account"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg></a>
      <button class="icon-btn" type="button" data-cart-open aria-label="Open cart" aria-haspopup="dialog"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg><span class="cart-count" data-cart-count>0</span></button>
      <a class="btn btn-primary nav-cta" href="/#buy">${esc(copy.ctaPrimary)}</a>
      <button class="icon-btn nav-burger" type="button" data-menu-open aria-label="Open menu" aria-expanded="false" aria-controls="menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    </div>
  </div>
</header>
<div class="menu" id="menu" role="dialog" aria-modal="true" aria-label="Menu">
  <button class="icon-btn menu-close" type="button" data-menu-close aria-label="Close menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  ${navLinks.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}<a href="/account">Account</a>
  <div class="menu-foot"><a class="btn btn-primary btn-block" href="/#buy">${esc(copy.ctaPrimary)}</a><p class="small muted">${esc(brand.tagline)}</p></div>
</div>
<main id="main">
${main}
</main>
<footer class="footer">
  <div class="wrap">
    <div class="footer-grid">
      <div><a class="footer-logo" href="/" aria-label="${esc(brand.name)}">${logo()}</a><p style="margin-top:14px;max-width:32ch">${esc(brand.tagline)} ${product.wipesPerPack} individually wrapped, water-based cleansing wipes. pH-balanced. Alcohol-free.</p></div>
      <div><h4>Shop</h4><ul><li><a href="/#buy">Get RYNSE</a></li><li><a href="/subscription">Subscribe &amp; Save</a></li><li><a href="/why-rynse">Why RYNSE</a></li><li><a href="/faq">FAQ</a></li></ul></div>
      <div><h4>Help</h4><ul><li><a href="/shipping-returns">Shipping &amp; Returns</a></li><li><a href="/contact">Contact</a></li><li><a href="/account">Account</a></li></ul></div>
      <div><h4>Legal</h4><ul><li><a href="/privacy">Privacy Policy</a></li><li><a href="/cookies">Cookie Policy</a></li><li><a href="/terms">Terms &amp; Conditions</a></li></ul></div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getUTCFullYear()} ${esc(brand.legalName)}</span>
      <div class="footer-social"><a href="${esc(brand.social.instagram.url)}" rel="noopener" target="_blank">Instagram ${esc(brand.social.instagram.handle)}</a><a href="${esc(brand.social.tiktok.url)}" rel="noopener" target="_blank">TikTok ${esc(brand.social.tiktok.handle)}</a></div>
      ${payBadges({ label: false })}
    </div>
  </div>
</footer>
<div class="sticky-bar" data-sticky aria-hidden="true"><div><div class="sb-title">${esc(product.shortName)}</div><div class="sb-price" data-sticky-price></div></div><button class="btn btn-primary" type="button" data-sticky-cta>${esc(copy.ctaPrimary)}</button></div>
<div class="drawer-backdrop" data-cart-backdrop></div>
<aside class="drawer" data-cart role="dialog" aria-modal="true" aria-label="Your cart" aria-hidden="true">
  <div class="drawer-head"><h2>Your cart</h2><button class="icon-btn" type="button" data-cart-close aria-label="Close cart"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
  <div class="drawer-body" data-cart-body></div>
  <div class="drawer-foot" data-cart-foot hidden>
    <div class="totals" data-cart-totals></div>
    <a class="btn btn-primary btn-block" href="/checkout" data-cart-checkout>${esc(copy.ctaCheckout)}</a>
    ${payBadges({ label: false })}
  </div>
</aside>
<template id="tpl-cart-sachet">${sachetSvg({ title: '' })}</template>
<div class="consent-banner" data-consent role="region" aria-label="Cookie preferences">
  <div>We use cookies for analytics and ads measurement only if you allow it. Essential cookies (cart, checkout) are always on. <a class="link" href="/cookies">Cookie policy</a></div>
  <div class="cb-actions"><button class="btn btn-ghost" type="button" data-consent-reject>Decline</button><button class="btn btn-primary" type="button" data-consent-accept>Allow</button></div>
</div>
<script src="${assets.js}" defer></script>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>`;
}

export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: brand.name,
    url: site.baseUrl,
    logo: `${site.baseUrl}/assets/brand/logo-512.png`,
    sameAs: [brand.social.instagram.url, brand.social.tiktok.url],
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: brand.supportEmail, availableLanguage: ['en', 'nl'] }],
  };
}

export function websiteLd() {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: brand.name, url: site.baseUrl };
}

export function breadcrumbLd(items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${site.baseUrl}${path}` })) };
}

export function productLd() {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    brand: { '@type': 'Brand', name: brand.name },
    description: brand.description,
    image: [`${site.baseUrl}/assets/img/product-hero.jpg`],
    url: `${site.baseUrl}/`,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Wipes per pack', value: String(product.wipesPerPack) },
      { '@type': 'PropertyValue', name: 'Individually wrapped', value: 'Yes' },
      { '@type': 'PropertyValue', name: 'Water-based', value: 'Yes' },
      { '@type': 'PropertyValue', name: 'pH-balanced', value: 'Yes' },
      { '@type': 'PropertyValue', name: 'Alcohol-free', value: 'Yes' },
    ],
  };
  // Offer data only once the price is final (no invented prices in structured data).
  if (product.structuredData.includeOffer) {
    ld.offers = { '@type': 'Offer', price: (product.priceCents / 100).toFixed(2), priceCurrency: product.currency, availability: product.structuredData.availability, url: `${site.baseUrl}/#buy`, seller: { '@type': 'Organization', name: brand.name } };
  }
  return ld;
}

export function faqLd(items) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
}
