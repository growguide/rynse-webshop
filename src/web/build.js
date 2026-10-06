#!/usr/bin/env node
// Static site build: templates → dist/*.html, assets → dist/assets (content-hashed CSS/JS).
// Zero dependencies; runs on Vercel's build step and locally.
import { mkdir, rm, readFile, writeFile, cp, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brand, product, site, shipping, subscription } from '../config/commerce.js';
import { renderHome } from './templates/home.js';
import { renderWhy, renderFaq, renderSubscription, renderContact, renderCheckout, renderOrder, renderAccount, renderLegal, renderNotFound, renderAdmin } from './templates/pages.js';
import { sachetSvg, svgDefs } from './templates/components.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(here, 'assets');

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);
const minifyCss = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').replace(/\s+/g, ' ').trim();

async function main() {
  const t0 = Date.now();
  await rm(DIST, { recursive: true, force: true });
  await mkdir(path.join(DIST, 'assets', 'css'), { recursive: true });
  await mkdir(path.join(DIST, 'assets', 'js'), { recursive: true });

  // --- static assets ---
  for (const dir of ['fonts', 'brand', 'payment', 'img', 'hero']) {
    const src = path.join(ASSETS, dir);
    if (existsSync(src)) await cp(src, path.join(DIST, 'assets', dir), { recursive: true });
  }

  // --- css ---
  const css = minifyCss(await readFile(path.join(here, 'styles', 'main.css'), 'utf8'));
  const cssName = `main.${hash(css)}.css`;
  await writeFile(path.join(DIST, 'assets', 'css', cssName), css);

  // --- js (not minified: small files, served with brotli by the CDN) ---
  const assets = { css: `/assets/css/${cssName}` };
  for (const [key, file] of Object.entries({ js: 'site.js', heroJs: 'hero.js', checkoutJs: 'checkout.js', orderJs: 'order.js', accountJs: 'account.js', formsJs: 'forms.js', adminJs: 'admin.js' })) {
    const body = await readFile(path.join(here, 'scripts', file), 'utf8');
    const name = `${file.replace('.js', '')}.${hash(body)}.js`;
    await writeFile(path.join(DIST, 'assets', 'js', name), body);
    assets[key] = `/assets/js/${name}`;
  }

  // --- images (optimized set from tools/optimize-images.py, placeholders otherwise) ---
  const images = await resolveImages();

  // --- pages ---
  const pages = {
    'index.html': renderHome({ assets, images }),
    'why-rynse.html': renderWhy({ assets, images }),
    'faq.html': renderFaq({ assets }),
    'subscription.html': renderSubscription({ assets }),
    'contact.html': renderContact({ assets }),
    'checkout.html': renderCheckout({ assets }),
    'order/index.html': renderOrder({ assets }),
    'account.html': renderAccount({ assets }),
    'admin/index.html': renderAdmin({ assets }),
    '404.html': renderNotFound({ assets }),
  };
  const legal = renderLegal({ assets });
  pages['privacy.html'] = legal.privacy; pages['cookies.html'] = legal.cookies; pages['terms.html'] = legal.terms; pages['shipping-returns.html'] = legal.shipping;
  for (const [file, html] of Object.entries(pages)) {
    const out = path.join(DIST, file);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, html);
  }

  // --- SEO / discovery files ---
  const publicPaths = ['/', '/why-rynse', '/subscription', '/faq', '/contact', '/privacy', '/cookies', '/terms', '/shipping-returns'];
  const today = new Date().toISOString().slice(0, 10);
  await writeFile(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicPaths.map((p) => `  <url><loc>${site.baseUrl}${p}</loc><lastmod>${today}</lastmod><changefreq>${p === '/' ? 'weekly' : 'monthly'}</changefreq><priority>${p === '/' ? '1.0' : '0.6'}</priority></url>`).join('\n')}\n</urlset>\n`);
  await writeFile(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /checkout\nDisallow: /order/\nDisallow: /account\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${site.baseUrl}/sitemap.xml\n`);
  await writeFile(path.join(DIST, 'llms.txt'), llmsTxt());
  await writeFile(path.join(DIST, 'site.webmanifest'), JSON.stringify({ name: brand.name, short_name: brand.name, start_url: '/', display: 'standalone', background_color: '#070d1c', theme_color: '#070d1c', icons: [{ src: '/assets/brand/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' }] }, null, 2));
  await writeFile(path.join(DIST, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0a1428"/><text x="32" y="43" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="34" fill="#e2c272">R</text></svg>`);
  // Apple Pay domain association placeholder location (direct integration only): dist/.well-known/
  await mkdir(path.join(DIST, '.well-known'), { recursive: true });
  const assoc = path.join(ASSETS, 'well-known', 'apple-developer-merchantid-domain-association');
  if (existsSync(assoc)) await cp(assoc, path.join(DIST, '.well-known', 'apple-developer-merchantid-domain-association'));

  console.log(`Built ${Object.keys(pages).length} pages → dist in ${Date.now() - t0} ms`);
}

/** Map of image slots → {src, srcset, width, height, alt}. Reads src/web/assets/img/images.json if present. */
async function resolveImages() {
  const manifestPath = path.join(ASSETS, 'img', 'images.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};
  const pick = (slot, alt, fallback) => {
    const m = manifest[slot];
    if (!m) return { ...fallback, alt, placeholder: true };
    return { src: m.src, srcset: m.srcset, srcsetAvif: m.srcsetAvif || null, width: m.width, height: m.height, alt: m.alt || alt };
  };
  // Vector placeholder poster (navy studio + sachet) so the hero never ships empty.
  await mkdir(path.join(DIST, 'assets', 'img'), { recursive: true });
  const poster = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs><radialGradient id="bg" cx="55%" cy="45%" r="75%"><stop offset="0" stop-color="#182b54"/><stop offset="0.5" stop-color="#0a1428"/><stop offset="1" stop-color="#070d1c"/></radialGradient><radialGradient id="glow" cx="50%" cy="100%" r="50%"><stop offset="0" stop-color="#e2c272" stop-opacity="0.35"/><stop offset="1" stop-color="#e2c272" stop-opacity="0"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#bg)"/><rect width="${w}" height="${h}" fill="url(#glow)"/>${svgDefs().replace('width="0" height="0" style="position:absolute"', 'width="0" height="0"')}<g transform="translate(${(w > h ? w * 0.66 : w * 0.5) - 210} ${(w > h ? h * 0.5 : h * 0.42) - 180}) scale(0.6)">${sachetSvg({ title: '' }).replace('<svg', '<svg width="700" height="600"')}</g></svg>`;
  await writeFile(path.join(DIST, 'assets', 'img', 'placeholder-hero-16x9.svg'), poster(1600, 900));
  await writeFile(path.join(DIST, 'assets', 'img', 'placeholder-hero-9x16.svg'), poster(900, 1600));
  await writeFile(path.join(DIST, 'assets', 'img', 'placeholder-4x5.svg'), poster(800, 1000));
  const ph169 = '/assets/img/placeholder-hero-16x9.svg', ph916 = '/assets/img/placeholder-hero-9x16.svg', ph45 = '/assets/img/placeholder-4x5.svg';
  const lifeAlts = [
    'Man cooling down after a run on an Amsterdam canal bridge, holding a RYNSE sachet',
    'Woman at Amsterdam Centraal station taking a RYNSE sachet from her coat pocket',
    'Friends at a night festival on the Amsterdam waterfront, one holding a RYNSE sachet',
    'Man on a bicycle along an Amsterdam canal at night with a RYNSE sachet in hand',
    'Man on a cobbled Jordaan street at night before a date, holding a RYNSE sachet',
    'Flat lay of pocket essentials with a RYNSE sachet as the centrepiece',
  ];
  const heroPoster = pick('hero-poster', 'RYNSE navy cleansing wipe sachet with gold wordmark floating in a dark studio', { src: ph169, width: 1600, height: 900 });
  const heroPosterMobile = pick('hero-poster-mobile', heroPoster.alt, { src: ph916, width: 900, height: 1600 });
  return {
    heroPoster,
    heroPosterMobile,
    heroPosterSquare: pick('hero-many', 'A dozen RYNSE sachets floating in a dark navy studio', { src: ph45, width: 800, height: 1000 }),
    heroManifest: existsSync(path.join(ASSETS, 'hero', 'manifest.json')) ? '/assets/hero/manifest.json' : '',
    packshot: pick('packshot', 'RYNSE box of 40 cleansing wipes with loose navy sachets', { src: ph45, width: 800, height: 1000 }),
    life: lifeAlts.map((alt, i) => pick(`life-${i + 1}`, alt, { src: ph45, width: 800, height: 1000 })),
  };
}

function llmsTxt() {
  return `# ${brand.name}

> ${brand.tagline} ${brand.description}

${brand.name} is a direct-to-consumer personal-care brand. It sells one product: a pack of ${product.wipesPerPack} individually wrapped, water-based cleansing wipes.

## Product facts
- Product: ${product.name} (SKU ${product.sku})
- Contents: ${product.wipesPerPack} individually wrapped cleansing wipes per pack
- Formula: water-based, pH-balanced, alcohol-free
- Format: compact, discreet single-use sachets
- Audience: unisex; designed for people who are often on the move (sports, travel, festivals, students, young professionals)
- Use cases: after the gym, while travelling, at festivals, going out, long working days, in the car, on holiday, before or after a date, after a flight, whenever no shower or running water is available

## Buying options
- One-time purchase of a single pack
- Subscription: automatic delivery every ${subscription.interval}, cancel anytime; subscribers build a loyalty benefit for every uninterrupted year — the benefit resets when the subscription is cancelled and a new subscription starts again at year 1
- Payment methods: iDEAL, Apple Pay, Visa, Mastercard (processed by Mollie)
- Shipping to: ${shipping.countries.join(', ')}

## Pages
- [Shop / home](${site.baseUrl}/)
- [Why RYNSE](${site.baseUrl}/why-rynse)
- [Subscription & loyalty](${site.baseUrl}/subscription)
- [FAQ](${site.baseUrl}/faq)
- [Shipping & Returns](${site.baseUrl}/shipping-returns)
- [Contact](${site.baseUrl}/contact)

## Social
- Instagram: ${brand.social.instagram.handle}
- TikTok: ${brand.social.tiktok.handle}
`;
}

main().catch((e) => { console.error(e); process.exit(1); });
