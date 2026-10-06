/* RYNSE — site runtime: nav, menu, cart drawer, purchase selector, sticky CTA, consent + analytics, reveals. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const CFG = window.__RYNSE__ || {};
  const I18N = CFG.i18n || {};
  const T = (key, vars) => { let s = I18N[key] ?? key; if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)); return s; };
  const P = CFG.prefix || ''; // locale URL prefix ('' | '/nl' | '/es')
  const fmt = (cents) => new Intl.NumberFormat(CFG.numberLocale || 'nl-NL', { style: 'currency', currency: CFG.currency || 'EUR' }).format(cents / 100).replace(/\u00a0/g, ' ');

  // ---------- config (public, cached) ----------
  let config = null;
  let csrf = null;
  const loadConfig = async () => {
    if (config) return config;
    try {
      const r = await fetch('/api/config', { credentials: 'same-origin' });
      config = await r.json();
      csrf = config.csrfToken;
    } catch { config = null; }
    return config;
  };
  const api = async (path, body, method = 'POST') => {
    if (!csrf) await loadConfig();
    const r = await fetch(path, { method, credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf || '' }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || 'Request failed'); e.status = r.status; e.data = data; throw e; }
    return data;
  };
  window.RYNSE = { api, loadConfig, fmt, T, P, locale: CFG.locale || 'en' };

  // ---------- analytics (consent-aware, GA4-style event names) ----------
  const CONSENT_KEY = 'rynse:consent';
  const getConsent = () => { try { return localStorage.getItem(CONSENT_KEY); } catch { return null; } };
  const setConsent = (v) => { try { localStorage.setItem(CONSENT_KEY, v); } catch {} };
  window.dataLayer = window.dataLayer || [];
  const track = (name, params = {}) => {
    window.dataLayer.push({ event: name, ...params });
    if (getConsent() === 'granted') {
      if (window.gtag) window.gtag('event', name, params);
      if (window.fbq) window.fbq('trackCustom', name, params);
      if (window.ttq && window.ttq.track) window.ttq.track(name, params);
    }
    // Server-side copy for first-party reporting (no cookies, no PII).
    if (['add_to_cart', 'begin_checkout', 'purchase', 'subscription_selection'].includes(name)) {
      navigator.sendBeacon?.('/api/events', new Blob([JSON.stringify({ name, params })], { type: 'application/json' }));
    }
  };
  window.RYNSE.track = track;
  const loadVendors = () => {
    const a = CFG.analytics || {};
    if (a.ga4MeasurementId && !window.gtag) {
      const s = document.createElement('script'); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(a.ga4MeasurementId)}`; document.head.appendChild(s);
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date()); window.gtag('config', a.ga4MeasurementId, { anonymize_ip: true });
      if (a.googleAdsId) window.gtag('config', a.googleAdsId);
    }
    if (a.metaPixelId && !window.fbq) {
      /* Meta Pixel standard loader */
      !(function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', a.metaPixelId); window.fbq('track', 'PageView');
    }
    if (a.tiktokPixelId && !window.ttq) {
      const s = document.createElement('script'); s.async = true; s.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(a.tiktokPixelId)}&lib=ttq`; document.head.appendChild(s);
    }
  };
  const banner = $('[data-consent]');
  const hasVendors = Object.values(CFG.analytics || {}).some(Boolean);
  if (banner) {
    const c = getConsent();
    if (c === 'granted') loadVendors();
    else if (!c && hasVendors) banner.classList.add('is-visible');
    $('[data-consent-accept]')?.addEventListener('click', () => { setConsent('granted'); banner.classList.remove('is-visible'); loadVendors(); });
    $('[data-consent-reject]')?.addEventListener('click', () => { setConsent('denied'); banner.classList.remove('is-visible'); });
  }

  // ---------- nav ----------
  const nav = $('#nav');
  const onScroll = () => nav && nav.classList.toggle('is-scrolled', window.scrollY > 24);
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  const menu = $('#menu');
  const menuBtn = $('[data-menu-open]');
  const openMenu = (open) => { menu.classList.toggle('is-open', open); menuBtn.setAttribute('aria-expanded', String(open)); document.body.style.overflow = open ? 'hidden' : ''; if (open) $('a', menu)?.focus(); else menuBtn.focus(); };
  menuBtn?.addEventListener('click', () => openMenu(true));
  $('[data-menu-close]')?.addEventListener('click', () => openMenu(false));
  $$('a', menu || document.createElement('div')).forEach((a) => a.addEventListener('click', () => openMenu(false)));

  // ---------- cart (single product, stored locally; server re-prices everything) ----------
  const CART_KEY = 'rynse:cart';
  const readCart = () => { try { const c = JSON.parse(localStorage.getItem(CART_KEY) || 'null'); return c && c.quantity > 0 ? c : null; } catch { return null; } };
  const writeCart = (c) => { try { c ? localStorage.setItem(CART_KEY, JSON.stringify(c)) : localStorage.removeItem(CART_KEY); } catch {} renderCart(); };
  window.RYNSE.readCart = readCart; window.RYNSE.writeCart = writeCart;

  const drawer = $('[data-cart]');
  const backdrop = $('[data-cart-backdrop]');
  let lastFocus = null;
  const openCart = (open) => {
    if (!drawer) return;
    drawer.classList.toggle('is-open', open); backdrop.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open)); document.body.style.overflow = open ? 'hidden' : '';
    if (open) { lastFocus = document.activeElement; renderCart(); $('[data-cart-close]', drawer)?.focus(); track('view_cart', cartParams()); } else lastFocus?.focus?.();
  };
  $$('[data-cart-open]').forEach((b) => b.addEventListener('click', () => openCart(true)));
  $('[data-cart-close]')?.addEventListener('click', () => openCart(false));
  backdrop?.addEventListener('click', () => openCart(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { openCart(false); if (menu?.classList.contains('is-open')) openMenu(false); } });

  const quoteCache = new Map();
  const getQuote = async (mode, quantity) => {
    const key = `${mode}:${quantity}`;
    if (quoteCache.has(key)) return quoteCache.get(key);
    const p = fetch('/api/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, quantity }) }).then((r) => r.json());
    quoteCache.set(key, p);
    return p;
  };
  const cartParams = () => { const c = readCart(); return c ? { currency: CFG.currency, value: (CFG.priceCents * c.quantity) / 100, items: [{ item_id: 'RYNSE-40', item_name: 'RYNSE — 40 Wipes', quantity: c.quantity, price: CFG.priceCents / 100, item_variant: c.mode }] } : {}; };

  async function renderCart() {
    if (!drawer) return;
    const body = $('[data-cart-body]'); const foot = $('[data-cart-foot]'); const count = $('[data-cart-count]');
    const cart = readCart();
    count.textContent = cart ? cart.quantity : 0; count.classList.toggle('is-visible', !!cart);
    if (!cart) { body.innerHTML = `<div class="cart-empty"><p>${T('cart.empty')}</p><p style="margin-top:14px"><a class="btn btn-primary" href="${P}/#buy" data-cart-close-link>${T('cart.get')}</a></p></div>`; foot.hidden = true; $('[data-cart-close-link]', body)?.addEventListener('click', () => openCart(false)); return; }
    const sachet = $('#tpl-cart-sachet')?.innerHTML || '';
    body.innerHTML = `
      <div class="cart-item"><div class="thumb">${sachet}</div><div><div class="ci-title">${T('cart.product')}</div><div class="ci-mode">${cart.mode === 'subscription' ? T('cart.subscription', { interval: CFG.interval }) : T('cart.oneTime')}</div><div class="ci-sub">${T('cart.wipes')}</div></div></div>
      <div class="panel-row" style="margin-top:0"><div class="qty" role="group" aria-label="${T('cart.qty')}"><button type="button" data-cart-qty="-1" aria-label="${T('cart.decrease')}">−</button><output>${cart.quantity}</output><button type="button" data-cart-qty="1" aria-label="${T('cart.increase')}">+</button></div><button class="btn btn-ghost" type="button" data-cart-remove style="min-height:46px;padding:0 16px">${T('cart.remove')}</button></div>
      <div class="mode-switch" role="group" aria-label="${T('cart.modeAria')}"><button type="button" data-cart-mode="one_time" aria-pressed="${cart.mode === 'one_time'}">${T('cart.oneTimeBtn')}</button><button type="button" data-cart-mode="subscription" aria-pressed="${cart.mode === 'subscription'}">${T('cart.subscribeBtn')}</button></div>
      ${cart.mode === 'subscription' ? `<p class="small muted">${T('cart.subNote', { interval: CFG.interval })}</p>` : ''}`;
    foot.hidden = false;
    $$('[data-cart-qty]', body).forEach((b) => b.addEventListener('click', () => { const q = Math.max(1, Math.min(10, cart.quantity + Number(b.dataset.cartQty))); writeCart({ ...cart, quantity: q }); }));
    $('[data-cart-remove]', body)?.addEventListener('click', () => { track('remove_from_cart', cartParams()); writeCart(null); });
    $$('[data-cart-mode]', body).forEach((b) => b.addEventListener('click', () => { if (b.dataset.cartMode !== cart.mode) { writeCart({ ...cart, mode: b.dataset.cartMode }); if (b.dataset.cartMode === 'subscription') track('subscription_selection', { quantity: cart.quantity }); } }));
    try {
      const q = await getQuote(cart.mode, cart.quantity);
      $('[data-cart-totals]').innerHTML = `<div><span>${T('cart.line', { n: cart.quantity })}</span><span>${fmt(q.subtotalCents)}</span></div>${q.discountCents ? `<div><span>${q.discountLabel}</span><span>− ${fmt(q.discountCents)}</span></div>` : ''}<div><span>${T('cart.shipping')}</span><span>${q.shippingCents ? fmt(q.shippingCents) : T('cart.free')}</span></div><div class="grand"><span>${T('cart.total')}</span><span>${fmt(q.totalCents)}</span></div>`;
    } catch { $('[data-cart-totals]').innerHTML = ''; }
  }

  // ---------- purchase panels ----------
  $$('[data-purchase]').forEach((panel) => {
    let qty = 1;
    const out = $('[data-qty-out]', panel);
    const note = $('[data-sub-note]', panel);
    const mode = () => $('input[type=radio]:checked', panel)?.value || 'one_time';
    const refresh = async () => {
      out.textContent = qty; if (note) note.hidden = mode() !== 'subscription';
      try { const q = await getQuote(mode(), qty); const price = $('[data-price]', panel); if (price) price.textContent = fmt(q.subtotalCents - q.discountCents); } catch {}
    };
    $$('[data-qty]', panel).forEach((b) => b.addEventListener('click', () => { qty = Math.max(1, Math.min(10, qty + Number(b.dataset.qty))); refresh(); }));
    $$('input[type=radio]', panel).forEach((r) => r.addEventListener('change', () => { refresh(); if (mode() === 'subscription') track('subscription_selection', { quantity: qty }); track('select_item', { item_variant: mode() }); }));
    $('[data-add]', panel)?.addEventListener('click', () => {
      const cart = { mode: mode(), quantity: qty };
      writeCart(cart);
      track('add_to_cart', cartParams());
      openCart(true);
    });
    refresh();
  });
  track('view_item', { items: [{ item_id: 'RYNSE-40', item_name: 'RYNSE — 40 Wipes', price: CFG.priceCents / 100 }] });

  // ---------- sticky mobile CTA ----------
  const sticky = $('[data-sticky]');
  const buy = $('#buy');
  if (sticky && buy) {
    $('[data-sticky-price]').textContent = fmt(CFG.priceCents);
    $('[data-sticky-cta]').addEventListener('click', () => { const cart = readCart() || { mode: 'one_time', quantity: 1 }; writeCart(cart); track('add_to_cart', cartParams()); openCart(true); });
    const io = new IntersectionObserver(([e]) => { const below = e.boundingClientRect.top < 0 && !e.isIntersecting; sticky.classList.toggle('is-visible', below); sticky.setAttribute('aria-hidden', String(!below)); }, { threshold: 0 });
    io.observe(buy);
  }

  // ---------- smooth "Get RYNSE" scroll on home ----------
  $('[data-scroll-buy]')?.addEventListener('click', (e) => { e.preventDefault(); buy?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  // ---------- reveals ----------
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reveals = $$('.reveal');
  if (reduce || !('IntersectionObserver' in window)) reveals.forEach((el) => el.classList.add('is-in'));
  else { const ro = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); ro.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }); reveals.forEach((el) => ro.observe(el)); }

  // ---------- language: manual switcher (cookie wins) + IP-based suggestion fallback ----------
  const LANG_COOKIE = 'rynse_lang';
  const setLang = (l) => { document.cookie = `${LANG_COOKIE}=${l}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; };
  const pathFor = (l) => { const base = l === 'en' ? '' : `/${l}`; const p = CFG.path || '/'; const tail = location.pathname.replace(/^\/(nl|es)(?=\/|$)/, ''); const rest = p === '/order' ? tail : p; return `${base}${rest === '/' ? '/' : rest}${location.search}${location.hash}`; };
  $$('[data-lang-select]').forEach((sel) => sel.addEventListener('change', () => { setLang(sel.value); location.assign(pathFor(sel.value)); }));
  const hasLangCookie = /(^|; )rynse_lang=/.test(document.cookie);
  const suggest = $('[data-lang-suggest]');
  if (suggest && !hasLangCookie && (CFG.locale || 'en') === 'en' && !sessionStorage.getItem('rynse:lang-suggest')) {
    // Vercel's middleware normally redirects before the page loads; this is the fallback when it did not run.
    fetch('/api/geo').then((r) => r.json()).then((g) => {
      if (!g.locale || g.locale === 'en') return;
      $('[data-lang-suggest-text]').textContent = T('lang.suggest', { language: (CFG.languages || {})[g.locale] || g.locale });
      const sw = $('[data-lang-suggest-switch]'); sw.textContent = T('lang.switch'); sw.addEventListener('click', () => { setLang(g.locale); location.assign(pathFor(g.locale)); });
      const no = $('[data-lang-suggest-dismiss]'); no.textContent = T('lang.dismiss'); no.addEventListener('click', () => { setLang('en'); suggest.hidden = true; });
      suggest.hidden = false;
      sessionStorage.setItem('rynse:lang-suggest', '1');
    }).catch(() => {});
  }

  renderCart();
})();
