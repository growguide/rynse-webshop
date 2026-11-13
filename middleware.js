/**
 * Vercel Routing Middleware (Edge) — language by IP country.
 *
 * English is the default. Visitors from the Netherlands get Dutch, visitors from
 * Spanish-speaking countries get Spanish. A manual choice (cookie `rynse_lang`,
 * set by the language switcher) always wins. Crawlers are never redirected, so
 * every language version stays indexable via hreflang.
 *
 * Only unprefixed page URLs are considered: /nl/... and /es/... are explicit.
 * No dependencies: returning nothing lets the request continue to the static page.
 */
const COUNTRY_LOCALE = {
  NL: 'nl',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es', GT: 'es', CU: 'es', BO: 'es',
  DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es', PR: 'es', GQ: 'es',
};
const LOCALES = ['en', 'nl', 'es'];
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|quora|pinterest|preview|lighthouse|pagespeed|headless/i;

export const config = {
  // Everything except API, static assets and files with an extension.
  matcher: ['/((?!api/|assets/|_vercel|.*\\..*).*)'],
};

export default function middleware(request) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return next();
  if (process.env.COMING_SOON === 'true') {
    const gated = comingSoon(request, url);
    if (gated !== undefined) return gated;
  }
  const first = url.pathname.split('/')[1];
  if (LOCALES.includes(first) && first !== 'en') return next(); // explicit localized URL
  if (first === 'admin') return next();
  if (BOT.test(request.headers.get('user-agent') || '')) return next();

  const cookie = readCookie(request.headers.get('cookie') || '', 'rynse_lang');
  let target = null;
  if (cookie && LOCALES.includes(cookie)) target = cookie;
  else {
    const country = (request.headers.get('x-vercel-ip-country') || '').toUpperCase();
    target = COUNTRY_LOCALE[country] || 'en';
  }
  if (target === 'en') return next();

  const dest = new URL(url);
  dest.pathname = `/${target}${url.pathname === '/' ? '/' : url.pathname}`;
  return new Response(null, { status: 302, headers: { location: dest.toString(), vary: 'cookie, x-vercel-ip-country', 'cache-control': 'no-store' } });
}

/**
 * Coming soon gate (env COMING_SOON=true): every page URL shows the coming soon page in the
 * visitor's language, without changing the address. Legal pages and /admin stay reachable.
 * The team can still see the real shop: open any URL with ?preview=<COMING_SOON_KEY> once
 * (sets a cookie for 30 days); ?preview=off removes it again.
 */
const OPEN_PAGES = new Set(['coming-soon', 'privacy', 'cookies', 'terms', 'shipping-returns', 'admin']);
function comingSoon(request, url) {
  const key = process.env.COMING_SOON_KEY || '';
  const cookieHeader = request.headers.get('cookie') || '';
  const preview = url.searchParams.get('preview');
  if (preview !== null) {
    const clean = new URL(url); clean.searchParams.delete('preview');
    const headers = { location: clean.toString(), 'cache-control': 'no-store' };
    if (key && preview === key) headers['set-cookie'] = `rynse_preview=${encodeURIComponent(key)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`;
    else if (preview === 'off') headers['set-cookie'] = 'rynse_preview=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
    return new Response(null, { status: 302, headers });
  }
  if (key && readCookie(cookieHeader, 'rynse_preview') === key) return undefined; // team preview: normal shop

  const parts = url.pathname.split('/').filter(Boolean);
  let locale = LOCALES.includes(parts[0]) ? parts.shift() : null;
  if (OPEN_PAGES.has(parts[0])) return undefined;
  if (!locale) {
    const cookie = readCookie(cookieHeader, 'rynse_lang');
    const country = (request.headers.get('x-vercel-ip-country') || '').toUpperCase();
    locale = cookie && LOCALES.includes(cookie) ? cookie : (BOT.test(request.headers.get('user-agent') || '') ? 'en' : COUNTRY_LOCALE[country] || 'en');
  }
  const dest = new URL(locale === 'en' ? '/coming-soon' : `/${locale}/coming-soon`, url);
  return new Response(null, { headers: { 'x-middleware-rewrite': dest.toString(), 'cache-control': 'no-store', vary: 'cookie, x-vercel-ip-country' } });
}

function next() {
  return undefined; // continue to the static file / function
}

function readCookie(header, name) {
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
