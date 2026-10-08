import { brand, product } from '../../config/commerce.js';
import { esc, picture, split, lineIcon } from './components.js';
import { layout, organizationLd, websiteLd, productLd, faqLd } from './layout.js';

export function renderHome({ t, assets, images }) {
  const n = product.wipesPerPack;
  const moments = split(t('moments.labels'));
  const heroAlt = t('hero.alt');
  const hero = images.heroLight; const clip = images.heroClip;
  const main = `
<section class="hero" id="top" data-hero>
  <div class="hero-media" data-hero-stage>
    <div class="hero-pack${clip ? ' has-video' : ''}">
      ${clip ? `<video class="hero-video" data-hero-video muted playsinline preload="auto"${clip.poster ? ` poster="${esc(clip.poster)}"` : ''} width="${clip.width}" height="${clip.height}" aria-hidden="true">${clip.webm ? `<source src="${esc(clip.webm)}" type="video/webm">` : ''}<source src="${esc(clip.mp4)}" type="video/mp4"></video>` : ''}
      ${clip && clip.last
        ? `<img class="hero-still" src="${esc(clip.last)}" width="${clip.width}" height="${clip.height}" alt="${esc(hero.alt)}" decoding="async">`
        : `<picture>${images.heroLightPortrait.srcsetAvif ? `<source media="(max-width: 699px)" type="image/avif" srcset="${esc(images.heroLightPortrait.srcsetAvif)}" sizes="100vw">` : ''}${images.heroLightPortrait.srcset ? `<source media="(max-width: 699px)" type="image/webp" srcset="${esc(images.heroLightPortrait.srcset)}" sizes="100vw">` : ''}${hero.srcsetAvif ? `<source type="image/avif" srcset="${esc(hero.srcsetAvif)}" sizes="100vw">` : ''}<img class="hero-still" src="${esc(hero.src)}" ${hero.srcset ? `srcset="${esc(hero.srcset)}" sizes="100vw"` : ''} width="${hero.width}" height="${hero.height}" alt="${esc(hero.alt)}" fetchpriority="high" decoding="async"></picture>`}
    </div>
  </div>
  <div class="wrap hero-copy">
    <p class="eyebrow">${esc(t('hero.eyebrow2'))}</p>
    <h1 class="display hero-title">${esc(t('hero.title'))}</h1>
    <p class="hero-sub">${esc(t('hero.sub2'))}</p>
    <p class="hero-tagline">${esc(t('brand.tagline'))}</p>
    <div><a class="btn btn-primary btn-lg" href="${t.href('/product')}">${esc(t('hero.cta'))}</a></div>
    <ul class="features" aria-label="${esc(t('hero.facts'))}">
      ${[['drop', 'feat.1'], ['leaf', 'feat.2'], ['pack', 'feat.3'], ['bag', 'feat.4']].map(([icon, key]) => `<li>${lineIcon(icon)}<span>${esc(t(key))}</span></li>`).join('')}
    </ul>
  </div>
</section>

<section class="banner" aria-labelledby="banner-title">
  ${picture(images.banner, { sizes: '100vw', className: 'banner-img' })}
  <div class="wrap banner-copy reveal">
    <h2 id="banner-title" class="h2">${esc(t('banner.title'))}</h2>
    <a class="banner-link" href="${t.href('/why-rynse')}">${esc(t('banner.cta'))}</a>
  </div>
</section>

<section class="section-tight moments" aria-labelledby="moments-title">
  <div class="wrap">
    <h2 id="moments-title" class="eyebrow">${esc(t('moments.eyebrow'))}</h2>
    <div class="moments-grid">
      ${moments.map((label, i) => `<figure class="moment reveal" style="margin:0">${picture(images.moments[i], { sizes: '(min-width: 900px) 280px, 45vw' })}<figcaption>${esc(label)}</figcaption></figure>`).join('')}
    </div>
  </div>
</section>

<section class="section routine" aria-labelledby="routine-title">
  <div class="wrap routine-grid">
    <div class="routine-visual reveal">${picture(images.routine, { sizes: '(min-width: 900px) 45vw, 100vw' })}</div>
    <div class="routine-copy reveal">
      <p class="eyebrow routine-eyebrow">${esc(t('routine.eyebrow'))}</p>
      <h2 id="routine-title" class="h2">${esc(t('routine.title'))}</h2>
      <p class="lead">${esc(t('routine.body'))}</p>
      <ul class="routine-points">${split(t('routine.points')).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="routine-actions"><a class="btn btn-primary" href="${t.href('/product')}">${esc(t('routine.cta'))}</a><a class="btn btn-ghost" href="${t.href('/subscription')}">${esc(t('routine.cta2'))}</a></div>
    </div>
  </div>
</section>`;

  return layout({
    t,
    path: '/',
    title: t('brand.tagline'),
    description: t('meta.home.description', { n }),
    bodyClass: 'page-home',
    main,
    assets,
    scripts: [assets.heroJs],
    jsonLd: [organizationLd(t), websiteLd(t), productLd(t)],
  });
}
