// Localization: English (default), Dutch, Spanish.
// Static pages are built once per locale (/, /nl/, /es/). Detection by IP country happens
// in middleware.js (Vercel) with a client-side fallback; a manual choice is stored in the
// `rynse_lang` cookie and always wins.
import en from './en.js';
import nl from './nl.js';
import es from './es.js';

export const LOCALES = ['en', 'nl', 'es'];
export const DEFAULT_LOCALE = 'en';
export const DICTS = { en, nl, es };

export const LOCALE_META = {
  en: { name: 'English', short: 'EN', lang: 'en', ogLocale: 'en_GB', mollie: 'en_GB', numberLocale: 'en-GB' },
  nl: { name: 'Nederlands', short: 'NL', lang: 'nl', ogLocale: 'nl_NL', mollie: 'nl_NL', numberLocale: 'nl-NL' },
  es: { name: 'Español', short: 'ES', lang: 'es', ogLocale: 'es_ES', mollie: 'es_ES', numberLocale: 'es-ES' },
};

/** Countries that get Dutch or Spanish by default; everyone else gets English. */
export const COUNTRY_LOCALE = {
  NL: 'nl',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es', GT: 'es', CU: 'es', BO: 'es',
  DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es', PR: 'es', GQ: 'es',
};

export function localeForCountry(country) {
  return COUNTRY_LOCALE[String(country || '').toUpperCase()] || DEFAULT_LOCALE;
}

/** URL prefix for a locale ('' for English). */
export const prefix = (locale) => (locale === DEFAULT_LOCALE ? '' : `/${locale}`);

/** Localized path: href('/faq', 'nl') → '/nl/faq'; href('/', 'nl') → '/nl/'. */
export function href(path, locale) {
  const p = prefix(locale);
  if (!p) return path;
  if (path === '/') return `${p}/`;
  if (path.startsWith('#')) return path;
  return `${p}${path}`;
}

/** Translator with {var} interpolation; falls back to English, then to the key. */
export function translator(locale) {
  const d = DICTS[locale] || DICTS.en;
  const t = (key, vars) => {
    let s = d[key] ?? DICTS.en[key];
    if (s === undefined) return key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    return s;
  };
  t.locale = locale;
  t.meta = LOCALE_META[locale] || LOCALE_META.en;
  t.href = (path) => href(path, locale);
  t.raw = (key) => d[key] ?? DICTS.en[key];
  return t;
}

/** Strings the browser scripts need (cart drawer, checkout, order page, account). */
export function clientStrings(locale) {
  const d = DICTS[locale] || DICTS.en;
  const out = {};
  for (const k of Object.keys(DICTS.en)) if (k.startsWith('js.')) out[k.slice(3)] = d[k] ?? DICTS.en[k];
  return out;
}

export function pickLocale(value) {
  return LOCALES.includes(value) ? value : null;
}

/** Human interval label for a Mollie interval string ("1 month" → "month" / "maand" / "mes"). */
export function intervalLabel(locale, interval) {
  const m = /^(\d+) (day|week|month)s?$/.exec(interval || '');
  if (!m) return interval;
  const n = Number.parseInt(m[1], 10);
  const words = {
    en: { day: ['day', 'days'], week: ['week', 'weeks'], month: ['month', 'months'] },
    nl: { day: ['dag', 'dagen'], week: ['week', 'weken'], month: ['maand', 'maanden'] },
    es: { day: ['día', 'días'], week: ['semana', 'semanas'], month: ['mes', 'meses'] },
  }[locale] || { day: ['day', 'days'], week: ['week', 'weeks'], month: ['month', 'months'] };
  return n === 1 ? words[m[2]][0] : `${n} ${words[m[2]][1]}`;
}
