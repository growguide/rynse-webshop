// Localization: middleware (geo + cookie), translations completeness, localized build output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import middleware from '../middleware.js';
import en from '../src/web/i18n/en.js';
import nl from '../src/web/i18n/nl.js';
import es from '../src/web/i18n/es.js';
import { localeForCountry, href, intervalLabel } from '../src/web/i18n/index.js';

const req = (path, headers = {}) => new Request(`https://www.example.com${path}`, { headers });

test('middleware: Netherlands → /nl/, Spanish-speaking → /es/, others stay English', () => {
  const nlRes = middleware(req('/', { 'x-vercel-ip-country': 'NL' }));
  assert.equal(nlRes.status, 302); assert.equal(new URL(nlRes.headers.get('location')).pathname, '/nl/');
  for (const c of ['ES', 'MX', 'AR', 'CO', 'CL', 'PE']) {
    const r = middleware(req('/faq', { 'x-vercel-ip-country': c }));
    assert.equal(r.status, 302, c); assert.equal(new URL(r.headers.get('location')).pathname, '/es/faq');
  }
  for (const c of ['US', 'DE', 'BE', 'GB', 'FR', 'BR', 'PT', '']) assert.equal(middleware(req('/', { 'x-vercel-ip-country': c })), undefined, c);
});

test('middleware: manual language cookie wins over IP, explicit /nl /es URLs untouched, bots never redirected', () => {
  assert.equal(middleware(req('/', { 'x-vercel-ip-country': 'NL', cookie: 'rynse_lang=en' })), undefined);
  const r = middleware(req('/subscription', { 'x-vercel-ip-country': 'US', cookie: 'rynse_csrf=x; rynse_lang=es' }));
  assert.equal(new URL(r.headers.get('location')).pathname, '/es/subscription');
  assert.equal(middleware(req('/nl/faq', { 'x-vercel-ip-country': 'ES' })), undefined);
  assert.equal(middleware(req('/es/', { 'x-vercel-ip-country': 'NL' })), undefined);
  assert.equal(middleware(req('/', { 'x-vercel-ip-country': 'NL', 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' })), undefined);
  assert.equal(middleware(new Request('https://www.example.com/', { method: 'POST', headers: { 'x-vercel-ip-country': 'NL' } })), undefined);
  assert.equal(middleware(req('/admin', { 'x-vercel-ip-country': 'NL' })), undefined);
});

test('dictionaries: nl and es cover every English key; placeholders match', () => {
  for (const [name, d] of [['nl', nl], ['es', es]]) {
    const missing = Object.keys(en).filter((k) => !(k in d));
    assert.deepEqual(missing, [], `${name} missing ${missing.length} keys`);
    for (const k of Object.keys(en)) {
      const vars = (s) => (String(s).match(/\{[a-zA-Z]+\}/g) || []).sort();
      assert.deepEqual(vars(d[k]), vars(en[k]), `${name}.${k} placeholders differ`);
    }
  }
  assert.equal(localeForCountry('nl'), 'nl'); assert.equal(localeForCountry('MX'), 'es'); assert.equal(localeForCountry('DE'), 'en');
  assert.equal(href('/', 'nl'), '/nl/'); assert.equal(href('/faq', 'es'), '/es/faq'); assert.equal(href('/faq', 'en'), '/faq');
  assert.equal(intervalLabel('nl', '1 month'), 'maand'); assert.equal(intervalLabel('es', '2 weeks'), '2 semanas'); assert.equal(intervalLabel('en', '30 days'), '30 days');
});

test('build output: three language trees with hreflang, lang attribute and localized sitemap', () => {
  if (!existsSync('dist/nl/index.html')) return; // build not run
  const nlHome = readFileSync('dist/nl/index.html', 'utf8');
  const esFaq = readFileSync('dist/es/faq.html', 'utf8');
  const enHome = readFileSync('dist/index.html', 'utf8');
  assert.match(nlHome, /<html lang="nl">/); assert.match(esFaq, /<html lang="es">/); assert.match(enHome, /<html lang="en">/);
  assert.match(nlHome, /hreflang="es" href="[^"]+\/es\/"/); assert.match(nlHome, /hreflang="x-default" href="[^"]+\/"/);
  assert.match(esFaq, /<link rel="canonical" href="[^"]+\/es\/faq">/);
  assert.match(nlHome, /Abonneer & bespaar|Abonneer &amp; bespaar/); assert.match(esFaq, /Preguntas/);
  const sitemap = readFileSync('dist/sitemap.xml', 'utf8');
  assert.match(sitemap, /\/nl\/subscription<\/loc>/); assert.match(sitemap, /\/es\/faq<\/loc>/); assert.match(sitemap, /hreflang="x-default"/);
  assert.ok(!existsSync('dist/nl/admin/index.html'), 'admin is English only');
});
