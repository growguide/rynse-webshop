/**
 * RYNSE — central commerce configuration.
 *
 * Every commercial value the shop uses lives here. Nothing in the templates,
 * the client scripts or the server computes a price, a discount or a loyalty
 * level without going through this file.
 *
 * Values marked PLACEHOLDER are not final business decisions. They can be
 * overridden with environment variables (see docs/CONFIGURATION.md) and the
 * production build refuses to ship while any of them is still a placeholder
 * (tools/check-config.js).
 *
 * Money is handled in integer cents to avoid floating point errors.
 */

import { ALL_COUNTRIES, EU, EUROPE_OTHER } from './countries.js';

const env = (name, fallback) => {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
};
const envInt = (name, fallback) => {
  const v = env(name, undefined);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} must be an integer, got "${v}"`);
  return n;
};
const envPct = (name) => {
  // Percentages are optional: null means "not decided yet".
  const v = env(name, undefined);
  if (v === undefined || v === 'null') return null;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`Environment variable ${name} must be a percentage between 0 and 100, got "${v}"`);
  return n;
};
const envList = (name) => env(name, '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
const envBool = (name, fallback) => {
  const v = env(name, undefined);
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

/** Tracks which values are still placeholders so the build can warn/refuse. */
export const placeholders = [];
const placeholder = (key, value, note) => {
  placeholders.push({ key, value, note });
  return value;
};

// ---------------------------------------------------------------------------
// Brand & product
// ---------------------------------------------------------------------------
export const brand = {
  name: 'RYNSE',
  legalName: env('RYNSE_LEGAL_NAME', placeholder('RYNSE_LEGAL_NAME', 'RYNSE [legal entity name TBD]', 'Legal company name for terms, privacy and invoices')),
  tagline: 'Stay fresh. Anywhere.',
  description: 'RYNSE makes individually wrapped, water-based cleansing wipes for a fresh, clean feeling wherever water is not available. 40 wipes per pack. pH-balanced, alcohol-free, compact and discreet.',
  supportEmail: env('RYNSE_SUPPORT_EMAIL', placeholder('RYNSE_SUPPORT_EMAIL', 'hello@getrynse.example', 'Customer support e-mail address')),
  // Only existing social channels are shown. Facebook / LinkedIn are not available yet.
  social: {
    instagram: { handle: '@GetRynse', url: 'https://www.instagram.com/GetRynse' },
    tiktok: { handle: '@GetRynse', url: 'https://www.tiktok.com/@GetRynse' },
  },
  // Legal details that must be filled in before launch (shown as placeholders in legal pages).
  legal: {
    address: env('RYNSE_LEGAL_ADDRESS', placeholder('RYNSE_LEGAL_ADDRESS', '[Street + number, postal code, city, country — TBD]', 'Registered business address')),
    kvk: env('RYNSE_KVK', placeholder('RYNSE_KVK', '[KvK number TBD]', 'Chamber of Commerce number')),
    vat: env('RYNSE_VAT', placeholder('RYNSE_VAT', '[VAT number TBD]', 'VAT identification number')),
  },
};

export const product = {
  sku: env('RYNSE_SKU', 'RYNSE-40'),
  slug: 'rynse-40-cleansing-wipes',
  name: 'RYNSE Cleansing Wipes',
  shortName: 'RYNSE — 40 Wipes',
  wipesPerPack: 40,
  currency: 'EUR',
  // Expected retail range €13–€20. Final price not decided: PLACEHOLDER.
  priceCents: envInt('RYNSE_PRICE_CENTS', placeholder('RYNSE_PRICE_CENTS', 1500, 'Final retail price in cents (expected range 1300–2000)')),
  // VAT rate used to show the "incl. VAT" note and to split totals on invoices.
  vatRatePct: envInt('RYNSE_VAT_RATE_PCT', 21),
  // Max quantity per order (keeps the one-product checkout simple and limits abuse).
  maxQuantity: 10,
  // Claims below are the only product facts we are allowed to state.
  facts: [
    '40 individually wrapped wipes',
    'Water-based',
    'pH-balanced',
    'Alcohol-free',
  ],
  attributes: {
    individuallyWrapped: true,
    waterBased: true,
    phBalanced: true,
    alcoholFree: true,
    compact: true,
    discreet: true,
  },
  useCases: ['Gym', 'Travel', 'Festival', 'Work', 'Date', 'Everywhere'],
  // Structured-data switches: never publish price/availability as facts until they are final.
  structuredData: {
    includeOffer: envBool('RYNSE_PRICE_IS_FINAL', false),
    availability: env('RYNSE_AVAILABILITY', 'https://schema.org/PreOrder'),
  },
};

// ---------------------------------------------------------------------------
// Shipping — PLACEHOLDERS until logistics are final
// ---------------------------------------------------------------------------
export const shipping = {
  // Worldwide shipping. Every country in ALL_COUNTRIES can be chosen at checkout, minus RYNSE_EXCLUDED_COUNTRIES (comma-separated ISO codes, e.g. sanctioned destinations).
  countries: ALL_COUNTRIES.filter((c) => !envList('RYNSE_EXCLUDED_COUNTRIES').includes(c)),
  // Default country in the checkout per locale (visitors can change it; the checkout also pre-selects the IP country when known).
  defaultCountry: 'NL',
  defaultCountryByLocale: { en: 'NL', nl: 'NL', es: 'ES' },
  // Shipping zones — the first zone whose country list matches wins; 'world' catches everything else.
  // Each zone has its own rate and free-shipping threshold (PLACEHOLDERS until logistics are final).
  zones: [
    { id: 'nl', countries: ['NL'], costCents: envInt('RYNSE_SHIPPING_CENTS', placeholder('RYNSE_SHIPPING_CENTS', 395, 'Shipping cost in cents — Netherlands')), freeFromCents: envInt('RYNSE_FREE_SHIPPING_THRESHOLD_CENTS', placeholder('RYNSE_FREE_SHIPPING_THRESHOLD_CENTS', 3000, 'Free shipping threshold in cents — Netherlands')) },
    { id: 'europe', countries: [...EU, ...EUROPE_OTHER].filter((c) => c !== 'NL'), costCents: envInt('RYNSE_SHIPPING_EU_CENTS', placeholder('RYNSE_SHIPPING_EU_CENTS', 795, 'Shipping cost in cents — Europe')), freeFromCents: envInt('RYNSE_FREE_SHIPPING_EU_THRESHOLD_CENTS', placeholder('RYNSE_FREE_SHIPPING_EU_THRESHOLD_CENTS', 5000, 'Free shipping threshold in cents — Europe')) },
    { id: 'world', countries: '*', costCents: envInt('RYNSE_SHIPPING_WORLD_CENTS', placeholder('RYNSE_SHIPPING_WORLD_CENTS', 1495, 'Shipping cost in cents — rest of world')), freeFromCents: envInt('RYNSE_FREE_SHIPPING_WORLD_THRESHOLD_CENTS', placeholder('RYNSE_FREE_SHIPPING_WORLD_THRESHOLD_CENTS', 7500, 'Free shipping threshold in cents — rest of world')) },
  ],
  // Subscriptions ship free by default (configurable). Applies in every zone.
  subscriptionShipsFree: envBool('RYNSE_SUBSCRIPTION_SHIPS_FREE', true),
  deliveryEstimate: env('RYNSE_DELIVERY_ESTIMATE', placeholder('RYNSE_DELIVERY_ESTIMATE', '[delivery time TBD]', 'Delivery time shown in checkout and FAQ, e.g. "NL 1–3 working days, EU 3–7, worldwide 7–14"')),
  returnWindowDays: envInt('RYNSE_RETURN_WINDOW_DAYS', placeholder('RYNSE_RETURN_WINDOW_DAYS', 14, 'Return window in days (EU minimum 14)')),
  // Customs: orders outside the EU may be subject to import duties/taxes payable by the recipient (shown at checkout + legal pages).
  dutiesNoteOutsideEu: true,
};

/** Shipping zone for an ISO country code (never undefined: 'world' catches all). */
export function zoneFor(country) {
  return shipping.zones.find((z) => z.countries === '*' || z.countries.includes(country)) || shipping.zones[shipping.zones.length - 1];
}
export const isEu = (country) => EU.includes(country);
// Backwards-compatible aliases (NL rate) used in copy that quotes "from" prices.
Object.defineProperty(shipping, 'costCents', { get: () => shipping.zones[0].costCents });
Object.defineProperty(shipping, 'freeShippingThresholdCents', { get: () => shipping.zones[0].freeFromCents });

// ---------------------------------------------------------------------------
// Subscription — PLACEHOLDERS: frequency and discount not final
// ---------------------------------------------------------------------------
export const subscription = {
  enabled: true,
  // Mollie interval syntax: "1 month", "2 months", "6 weeks", "30 days" …
  interval: env('RYNSE_SUBSCRIPTION_INTERVAL', placeholder('RYNSE_SUBSCRIPTION_INTERVAL', '1 month', 'Delivery/billing frequency (Mollie interval syntax)')),
  // Base subscription discount versus one-time price. null = not decided → UI shows no percentage.
  discountPct: envPct('RYNSE_SUBSCRIPTION_DISCOUNT_PCT'),
  // Minimum commitment: none — customers can cancel any time (no dark patterns).
  cancelAnytime: true,
};

// ---------------------------------------------------------------------------
// Loyalty — yearly increasing benefit for uninterrupted subscribers.
// Business rule: the loyalty level exists only while the subscription is active.
// Cancellation resets it; a new subscription starts again at year 1.
// Percentages per year are PLACEHOLDERS (null = not decided yet).
// ---------------------------------------------------------------------------
export const loyalty = {
  enabled: true,
  // Level N applies after N-1 full years of uninterrupted active subscription.
  levels: [
    { year: 1, label: 'Year 1', discountPct: envPct('LOYALTY_YEAR_1_DISCOUNT') },
    { year: 2, label: 'Year 2', discountPct: envPct('LOYALTY_YEAR_2_DISCOUNT') },
    { year: 3, label: 'Year 3', discountPct: envPct('LOYALTY_YEAR_3_DISCOUNT') },
    { year: 4, label: 'Year 4+', discountPct: envPct('LOYALTY_YEAR_4_DISCOUNT') },
  ],
  // Grace period: a failed recurring payment does not break "uninterrupted" while
  // Mollie is retrying (max 5 daily retries) — the subscription is only reset once it is canceled.
  resetOn: ['canceled'],
};
if (loyalty.levels.every((l) => l.discountPct === null)) {
  placeholder('LOYALTY_YEAR_n_DISCOUNT', null, 'Loyalty discount percentages per year are not set');
}
if (subscription.discountPct === null) {
  placeholder('RYNSE_SUBSCRIPTION_DISCOUNT_PCT', null, 'Subscription discount percentage is not set');
}

// ---------------------------------------------------------------------------
// Copy that is reused in several places (hero, final CTA, cart, emails)
// ---------------------------------------------------------------------------
export const copy = {
  ctaPrimary: 'Get RYNSE',
  ctaAddToCart: 'Add to cart',
  ctaCheckout: 'Checkout',
  heroHeadline: 'Stay fresh. Anywhere.',
  heroSub: '40 individually wrapped cleansing wipes. For the moments between a long day and a shower.',
  oneTime: { title: 'One-time', sub: 'Single pack, no strings attached.' },
  subscribe: { title: 'Subscribe & save', sub: 'Delivered automatically. Loyalty benefits grow every year. Cancel anytime.' },
  loyaltyHeadline: 'Stay fresh. Stay rewarded.',
};

// ---------------------------------------------------------------------------
// Payments — Mollie
// ---------------------------------------------------------------------------
export const payments = {
  provider: env('PAYMENT_PROVIDER', 'emulator'), // 'mollie' | 'emulator'
  // Methods shown as trust badges and offered in checkout (Mollie method ids).
  methods: ['ideal', 'applepay', 'creditcard'],
  cardBrands: ['visa', 'mastercard'],
  locale: 'nl_NL',
  mollie: {
    apiKey: env('MOLLIE_API_KEY', ''),
    profileId: env('MOLLIE_PROFILE_ID', ''),
    // Apple Pay direct integration (optional, hosted checkout works without it).
    applePayDirect: envBool('MOLLIE_APPLEPAY_DIRECT', false),
  },
};

// ---------------------------------------------------------------------------
// Site / infrastructure
// ---------------------------------------------------------------------------
export const site = {
  // Public base URL (no trailing slash). Mollie needs a public webhook URL.
  baseUrl: (env('SITE_URL', process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')).replace(/\/$/, ''),
  defaultLocale: 'en',
  analytics: {
    ga4MeasurementId: env('GA4_MEASUREMENT_ID', ''),
    googleAdsId: env('GOOGLE_ADS_ID', ''),
    metaPixelId: env('META_PIXEL_ID', ''),
    tiktokPixelId: env('TIKTOK_PIXEL_ID', ''),
  },
};

// ---------------------------------------------------------------------------
// Derived helpers (pure functions — used by server, build and tests)
// ---------------------------------------------------------------------------
export function formatMoney(cents, currency = product.currency, locale = 'nl-NL') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(cents / 100);
}

export function applyPct(cents, pct) {
  if (!pct) return cents;
  return Math.round(cents * (1 - pct / 100));
}

/** Public, serialisable subset of the config for the browser (never secrets). */
export function publicConfig() {
  return {
    product: {
      sku: product.sku,
      name: product.name,
      shortName: product.shortName,
      wipesPerPack: product.wipesPerPack,
      currency: product.currency,
      priceCents: product.priceCents,
      maxQuantity: product.maxQuantity,
      facts: product.facts,
    },
    shipping: {
      zones: shipping.zones.map((z) => ({ id: z.id, costCents: z.costCents, freeFromCents: z.freeFromCents })),
      subscriptionShipsFree: shipping.subscriptionShipsFree,
      worldwide: true,
      countryCount: shipping.countries.length,
      defaultCountry: shipping.defaultCountry,
      defaultCountryByLocale: shipping.defaultCountryByLocale,
      deliveryEstimate: shipping.deliveryEstimate,
      dutiesNoteOutsideEu: shipping.dutiesNoteOutsideEu,
    },
    subscription: { enabled: subscription.enabled, interval: subscription.interval, discountPct: subscription.discountPct, cancelAnytime: subscription.cancelAnytime },
    loyalty: { enabled: loyalty.enabled, levels: loyalty.levels },
    payments: { methods: payments.methods, cardBrands: payments.cardBrands, provider: payments.provider },
    copy,
    analytics: site.analytics,
    placeholders: process.env.NODE_ENV === 'production' ? [] : placeholders.map((p) => p.key),
  };
}

export const config = { brand, product, shipping, subscription, loyalty, copy, payments, site, placeholders };
export default config;
