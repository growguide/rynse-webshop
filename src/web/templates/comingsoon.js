// Coming soon page: full-screen product clip with an overlay card (short story + early-access sign-up).
// Standalone on purpose: no nav, cart or footer, so nothing links into the closed shop.
// Shown for every page URL while COMING_SOON=true (see middleware.js).
import { brand, site } from '../../config/commerce.js';
import { esc, logo } from './components.js';
import { LOCALES, LOCALE_META, DEFAULT_LOCALE, href } from '../i18n/index.js';

export function renderComingSoon({ t, assets, images }) {
  const locale = t.locale;
  const meta = t.meta;
  const clip = images.heroClip;
  const still = images.heroLight;
  const title = `${brand.name} — ${t('cs.metaTitle')}`;
  const description = t('cs.metaDescription');
  const url = `${site.baseUrl}${href('/', locale)}`;
  const strings = { invalid: t('cs.invalid'), error: t('cs.error'), busy: t('cs.busy') };
  const langs = LOCALES.map((l) => `<a href="${href('/', l)}" data-lang-link="${l}"${l === locale ? ' aria-current="true"' : ''} hreflang="${LOCALE_META[l].lang}">${LOCALE_META[l].short}</a>`).join('<span aria-hidden="true">·</span>');

  return `<!doctype html>
<html lang="${meta.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
${LOCALES.map((l) => `<link rel="alternate" hreflang="${LOCALE_META[l].lang}" href="${esc(site.baseUrl + href('/', l))}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${esc(site.baseUrl + href('/', DEFAULT_LOCALE))}">
<meta name="theme-color" content="#f6f4ef">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(brand.name)}">
<meta property="og:locale" content="${meta.ogLocale}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(site.baseUrl + '/assets/img/og.jpg')}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/outfit-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets.css}">
</head>
<body class="cs-body">
<main class="cs" data-cs>
  <div class="cs-media" aria-hidden="true">
    ${clip
      ? `<video class="cs-video" data-cs-video autoplay muted playsinline webkit-playsinline preload="auto" disablepictureinpicture${clip.poster ? ` poster="${esc(clip.poster)}"` : ''} width="${clip.width}" height="${clip.height}"><source src="${esc(clip.mp4)}" type="video/mp4">${clip.webm ? `<source src="${esc(clip.webm)}" type="video/webm">` : ''}</video>`
      : `<img class="cs-video" src="${esc(still.src)}" alt="" width="${still.width}" height="${still.height}">`}
    <div class="cs-scrim"></div>
  </div>

  <header class="cs-top">
    ${logo({ className: 'cs-logo', label: brand.name })}
    <nav class="cs-lang" aria-label="${esc(t('lang.label'))}">${langs}</nav>
  </header>

  <section class="cs-card" aria-labelledby="cs-title">
    <p class="eyebrow cs-eyebrow"><span class="cs-dot" aria-hidden="true"></span>${esc(t('cs.eyebrow'))}</p>
    <h1 id="cs-title" class="cs-title">${esc(t('cs.title'))}</h1>
    <p class="cs-sub">${esc(t('cs.sub'))}</p>
    <div class="cs-lead">${t('cs.lead').split('|').map((x) => `<p>${esc(x)}</p>`).join('')}</div>
    <ul class="cs-facts">${['cs.fact1', 'cs.fact2', 'cs.fact3'].map((k) => `<li>${esc(t(k))}</li>`).join('')}</ul>

    <form class="cs-form" data-cs-form novalidate>
      <label class="sr-only" for="cs-email">${esc(t('cs.emailLabel'))}</label>
      <div class="cs-field">
        <input id="cs-email" name="email" type="email" inputmode="email" autocomplete="email" required placeholder="${esc(t('cs.emailPlaceholder'))}">
        <button class="btn btn-primary" type="submit">${esc(t('cs.cta'))}</button>
      </div>
      <input type="text" name="website" tabindex="-1" autocomplete="off" class="cs-hp" aria-hidden="true">
      <p class="cs-note small">${esc(t('cs.note'))} <a href="${t.href('/privacy')}">${esc(t('cs.privacy'))}</a></p>
      <p class="cs-msg cs-msg-error" data-cs-error role="alert" hidden></p>
    </form>
    <div class="cs-done" data-cs-done hidden>
      <p class="cs-done-title">${esc(t('cs.doneTitle'))}</p>
      <p class="cs-done-text">${esc(t('cs.doneText'))}</p>
    </div>

    <p class="cs-social small">${esc(t('cs.follow'))} <a href="${esc(brand.social.instagram.url)}" rel="noopener" target="_blank">Instagram</a> · <a href="${esc(brand.social.tiktok.url)}" rel="noopener" target="_blank">TikTok</a></p>
  </section>

  <p class="cs-tagline">${esc(t('brand.tagline'))}</p>
</main>
<script>
(() => {
  'use strict';
  const S = ${JSON.stringify(strings).replace(/</g, '\\u003c')};
  const LOCALE = ${JSON.stringify(locale)};
  // The clip plays once and rests on its last frame; reduced motion shows the poster only.
  const vid = document.querySelector('[data-cs-video]');
  if (vid && vid.tagName === 'VIDEO' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { vid.removeAttribute('autoplay'); vid.pause(); }
  // Language links set the same cookie as the shop's language switcher.
  for (const a of document.querySelectorAll('[data-lang-link]')) a.addEventListener('click', () => { document.cookie = 'rynse_lang=' + a.dataset.langLink + '; path=/; max-age=31536000; samesite=lax'; });

  const form = document.querySelector('[data-cs-form]');
  const err = document.querySelector('[data-cs-error]');
  const done = document.querySelector('[data-cs-done]');
  let csrf = null;
  const getCsrf = async () => { if (csrf) return csrf; const r = await fetch('/api/config', { credentials: 'same-origin' }); const j = await r.json(); csrf = j.csrfToken; return csrf; };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const input = form.elements.email;
    if (!input.checkValidity() || !input.value.trim()) { err.textContent = S.invalid; err.hidden = false; input.focus(); return; }
    const btn = form.querySelector('button[type=submit]');
    const label = btn.textContent; btn.disabled = true; btn.textContent = S.busy;
    try {
      const token = await getCsrf();
      const r = await fetch('/api/waitlist', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': token || '' }, body: JSON.stringify({ email: input.value, locale: LOCALE, website: form.elements.website.value }) });
      if (!r.ok) { if (r.status === 400) throw new Error(S.invalid); throw new Error(S.error); }
      form.hidden = true; done.hidden = false;
    } catch (ex) { err.textContent = ex.message || S.error; err.hidden = false; }
    finally { btn.disabled = false; btn.textContent = label; }
  });
})();
</script>
</body>
</html>`;
}
