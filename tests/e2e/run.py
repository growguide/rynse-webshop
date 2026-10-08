#!/usr/bin/env python3
"""Browser e2e: full purchase flow + responsive checks against the local dev server (emulator).
Usage: python3 tests/e2e/run.py [base_url]   (default http://localhost:3000)"""
import asyncio, sys, json, os, time
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'
SHOTS = os.path.join(os.path.dirname(__file__), 'shots'); os.makedirs(SHOTS, exist_ok=True)
VIEWPORTS = [('small-phone', 320, 568), ('phone', 390, 844), ('large-phone', 430, 932), ('tablet', 820, 1180), ('laptop', 1280, 800), ('desktop', 1440, 900), ('wide', 1920, 1080)]
results = []

def ok(name, cond, detail=''):
    results.append((name, bool(cond), detail)); print(('PASS ' if cond else 'FAIL ') + name + (f' — {detail}' if detail and not cond else ''))

async def purchase_flow(p, mode, w, h, label, prefix=''):
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 600, has_touch=w < 600)
    pg = await ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    await pg.goto(BASE + prefix + '/product', wait_until='networkidle')
    panel = pg.locator('[data-purchase="hero"]')
    if mode == 'subscription':
        await panel.locator('input[value="subscription"]').check(force=True)
        await pg.wait_for_timeout(300)
        ok(f'{label}: subscription note visible', await panel.locator('[data-sub-note]').is_visible())
    await panel.locator('[data-qty="1"]').click()
    await panel.locator('[data-add]').click()
    await pg.wait_for_selector('[data-cart].is-open', timeout=5000)
    ok(f'{label}: cart drawer opens', True)
    await pg.wait_for_timeout(500)
    totals = await pg.locator('[data-cart-totals]').inner_text()
    ok(f'{label}: cart shows totals', '€' in totals, totals)
    await pg.locator('[data-cart-checkout]').click()
    await pg.wait_for_url(f'**{prefix}/checkout', timeout=5000)
    ok(f'{label}: checkout stays in locale', prefix in pg.url if prefix else '/nl/' not in pg.url)
    await pg.wait_for_timeout(600)
    mode_text = (await pg.locator('[data-sum-mode]').inner_text()).strip()
    ok(f'{label}: checkout summary mode', bool(mode_text) and (('·' in mode_text) == (mode == 'subscription')), mode_text)
    if mode == 'subscription':
        ok(f'{label}: subscription terms shown before payment', await pg.locator('[data-sub-terms]').is_visible())
    await pg.fill('#f-email', f'e2e-{int(time.time())}-{label}@example.com'); await pg.fill('#f-name', 'E2E Tester'); await pg.fill('#f-street', 'Herengracht 10'); await pg.fill('#f-postal', '1015 BK'); await pg.fill('#f-city', 'Amsterdam')
    # submit without terms → validation
    await pg.locator('[data-pay]').click(); await pg.wait_for_timeout(300)
    ok(f'{label}: terms validation blocks submit', '/checkout' in pg.url)
    await pg.check('input[name="terms"]', force=True)
    await pg.locator('[data-pay]').click()
    await pg.wait_for_url('**/api/emulator/checkout**', timeout=10000)
    ok(f'{label}: redirected to hosted checkout', True)
    await pg.select_option('select[name="status"]', 'paid')
    await pg.select_option('select[name="webhookDelay"]', '4000')  # late webhook
    await pg.click('button[type=submit]')
    await pg.wait_for_url('**/order/**', timeout=10000)
    ok(f'{label}: order page in locale', (prefix + '/order/') in pg.url)
    await pg.wait_for_function("(() => { const i = document.querySelector('[data-status-icon]'); return i && !i.classList.contains('pending') && !i.classList.contains('failed'); })()", timeout=15000)
    ok(f'{label}: order page confirms payment (late webhook handled)', True)
    await pg.screenshot(path=f'{SHOTS}/order-{label}.png')
    cart = await pg.evaluate("localStorage.getItem('rynse:cart')")
    ok(f'{label}: cart cleared after purchase', cart in (None, 'null'))
    ok(f'{label}: no console/page errors', not errors, '; '.join(errors)[:300])
    await b.close()

async def responsive(p):
    for name, w, h in VIEWPORTS:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=w < 600, has_touch=w < 600); pg = await ctx.new_page()
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        for path in ['/', '/product', '/checkout', '/faq', '/subscription', '/nl/', '/es/subscription']:
            await pg.goto(BASE + path, wait_until='networkidle')
            overflow = await pg.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1')
            ok(f'{name} {path}: no horizontal overflow', not overflow)
            if path in ('/', '/nl/'):
                await pg.screenshot(path=f'{SHOTS}/home-{name}.png')
                h1 = await pg.locator('h1').bounding_box()
                ok(f'{name}: headline inside viewport width', h1 and h1['x'] >= 0 and h1['x'] + h1['width'] <= w + 1)
            if path == '/product':
                # sticky CTA appears after scrolling past the purchase panel on phones (on tablets the panel may still be in view at the bottom)
                if w < 700:
                    await pg.evaluate('window.scrollTo(0, document.body.scrollHeight)'); await pg.wait_for_timeout(500)
                    ok(f'{name}: sticky mobile CTA visible', await pg.locator('[data-sticky]').evaluate("el => el.classList.contains('is-visible')"))
                # tap targets ≥ 44px for primary CTA
                box = await pg.locator('[data-purchase="hero"] [data-add]').bounding_box()
                ok(f'{name}: primary CTA ≥ 44px tall', box and box['height'] >= 44)
        ok(f'{name}: no page errors', not errors, '; '.join(errors)[:200])
        await b.close()

async def links(p):
    b = await p.chromium.launch(); pg = await (await b.new_context()).new_page()
    seen = set(); broken = []
    for path in ['/', '/product', '/why-rynse', '/faq', '/subscription', '/contact', '/checkout', '/account', '/privacy', '/cookies', '/terms', '/shipping-returns', '/nl/', '/nl/faq', '/nl/privacy', '/es/', '/es/subscription', '/es/terms']:
        await pg.goto(BASE + path)
        hrefs = await pg.evaluate("Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href'))")
        for h in hrefs:
            if not h or h.startswith(('http', 'mailto:', '#', 'tel:')): continue
            u = h.split('#')[0].split('?')[0]
            if u in seen or not u: continue
            seen.add(u)
            r = await pg.request.get(BASE + u)
            if r.status >= 400: broken.append(f'{u} ({r.status}) on {path}')
    ok('no broken internal links', not broken, ', '.join(broken))
    for u in ['/sitemap.xml', '/robots.txt', '/llms.txt', '/favicon.svg', '/site.webmanifest', '/assets/payment/ideal.svg']:
        r = await pg.request.get(BASE + u); ok(f'{u} served', r.status == 200)
    r = await pg.request.get(BASE + '/does-not-exist'); ok('404 page', r.status == 404 and 'Nothing' in await r.text())
    await b.close()

async def language(p):
    b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1280, 'height': 800}); pg = await ctx.new_page()
    await pg.goto(BASE + '/', wait_until='networkidle')
    ok('EN page lang attribute', await pg.get_attribute('html', 'lang') == 'en')
    await pg.select_option('#lang-nav-lang', 'nl'); await pg.wait_for_url('**/nl/', timeout=5000)
    ok('switcher navigates to /nl/', pg.url.endswith('/nl/'))
    cookies = {c['name']: c['value'] for c in await ctx.cookies()}
    ok('language cookie set', cookies.get('rynse_lang') == 'nl')
    ok('NL page lang attribute', await pg.get_attribute('html', 'lang') == 'nl')
    ok('NL copy rendered', 'Piemel' in await pg.locator('h1').inner_text())
    await pg.goto(BASE + '/nl/faq', wait_until='networkidle')
    await pg.select_option('#lang-nav-lang', 'es'); await pg.wait_for_url('**/es/faq', timeout=5000)
    ok('switcher keeps the current page (faq → /es/faq)', pg.url.endswith('/es/faq'))
    # geo suggestion fallback (no cookie): simulate Dutch visitor on the English page
    ctx2 = await b.new_context(viewport={'width': 390, 'height': 844}, extra_http_headers={'x-vercel-ip-country': 'NL'}); pg2 = await ctx2.new_page()
    await pg2.goto(BASE + '/', wait_until='networkidle'); await pg2.wait_for_timeout(600)
    ok('geo suggestion shown to NL visitor without cookie', await pg2.locator('[data-lang-suggest]').is_visible())
    await pg2.locator('[data-lang-suggest-switch]').click(); await pg2.wait_for_url('**/nl/', timeout=5000)
    ok('geo suggestion switches to /nl/', pg2.url.endswith('/nl/'))
    ctx3 = await b.new_context(viewport={'width': 390, 'height': 844}, extra_http_headers={'x-vercel-ip-country': 'DE'}); pg3 = await ctx3.new_page()
    await pg3.goto(BASE + '/', wait_until='networkidle'); await pg3.wait_for_timeout(600)
    ok('no suggestion for German visitor (English default)', not await pg3.locator('[data-lang-suggest]').is_visible())
    r = await pg3.request.get(BASE + '/api/geo', headers={'x-vercel-ip-country': 'MX'})
    ok('/api/geo maps Mexico to es', (await r.json())['locale'] == 'es')
    await b.close()

async def seo(p):
    b = await p.chromium.launch(); pg = await (await b.new_context()).new_page()
    await pg.goto(BASE + '/')
    ld = await pg.evaluate("Array.from(document.querySelectorAll('script[type=\"application/ld+json\"]')).map(s => JSON.parse(s.textContent))")
    types = [t.get('@type') for x in ld for t in (x if isinstance(x, list) else [x])]
    ok('JSON-LD Organization/WebSite/Product present on home', all(t in types for t in ['Organization', 'WebSite', 'Product']), str(types))
    ok('home has no FAQPage schema (FAQPage lives on /faq only)', 'FAQPage' not in types, str(types))
    await pg.goto(BASE + '/faq')
    fld = await pg.evaluate("Array.from(document.querySelectorAll('script[type=\"application/ld+json\"]')).map(s => JSON.parse(s.textContent))")
    ftypes = [t.get('@type') for x in fld for t in (x if isinstance(x, list) else [x])]
    ok('/faq has FAQPage schema', 'FAQPage' in ftypes, str(ftypes))
    await pg.goto(BASE + '/')
    prod = [t for x in ld for t in (x if isinstance(x, list) else [x]) if t.get('@type') == 'Product'][0]
    ok('Product JSON-LD has no price while price is not final', 'offers' not in prod)
    ok('single H1', await pg.locator('h1').count() == 1)
    ok('meta description', len(await pg.get_attribute('meta[name=description]', 'content') or '') > 50)
    ok('canonical', bool(await pg.get_attribute('link[rel=canonical]', 'href')))
    ok('og:image', bool(await pg.get_attribute('meta[property="og:image"]', 'content')))
    imgs = await pg.evaluate("Array.from(document.images).filter(i => !i.alt && !i.closest('[aria-hidden=true]')).length")
    ok('all images have alt', imgs == 0, f'{imgs} without alt')
    await b.close()

async def main():
    async with async_playwright() as p:
        await purchase_flow(p, 'one_time', 390, 844, 'mobile-onetime')
        await purchase_flow(p, 'subscription', 1440, 900, 'desktop-subscription')
        await purchase_flow(p, 'one_time', 390, 844, 'mobile-nl', prefix='/nl')
        await purchase_flow(p, 'subscription', 1280, 800, 'desktop-es', prefix='/es')
        await language(p)
        await responsive(p)
        await links(p)
        await seo(p)
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)

asyncio.run(main())
