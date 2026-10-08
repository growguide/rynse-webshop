import { brand, product, loyalty } from '../../config/commerce.js';
import { esc, sachetSvg, purchasePanel, faqItems, faqHtml, loyaltyLadder, placeholderFlag, priceFmt, picture, split, intervalLabel, payBadges } from './components.js';
import { layout, organizationLd, websiteLd, productLd, faqLd } from './layout.js';

export function renderHome({ t, assets, images }) {
  const n = product.wipesPerPack;
  const faqs = faqItems(t).slice(0, 5);
  const labels = split(t('life.labels'));
  const life = labels.map((label, i) => [label, { ...images.life[i], alt: t(`life.alt.${i + 1}`) }]);
  const heroAlt = t('hero.alt');
  const main = `
<section class="hero" id="top" data-hero>
  <div class="wrap hero-grid">
    <div class="hero-content">
      <h1 class="display hero-title">${esc(t('hero.title'))}</h1>
      <p class="hero-sub">${esc(t('hero.sub2'))}</p>
      <p class="hero-facts">${esc(t('hero.facts'))}</p>
      <p class="hero-tagline">${esc(t('brand.tagline'))}</p>
      <div class="hero-buy" id="buy">
        <h2 id="buy-title" class="sr-only">${esc(t('buy.title'))}</h2>
        ${purchasePanel(t, { id: 'hero', compact: true })}
      </div>
    </div>
    <div class="hero-stage" data-hero-stage>
      <div class="hero-pack${images.heroClip ? ' has-video' : ''}">
        ${images.heroClip ? `<video class="hero-video" data-hero-video muted playsinline preload="auto" poster="${esc(images.heroClip.poster)}" width="${images.heroClip.width}" height="${images.heroClip.height}" aria-hidden="true"><source src="${esc(images.heroClip.webm)}" type="video/webm"><source src="${esc(images.heroClip.mp4)}" type="video/mp4"></video>` : ''}
        ${images.heroClip && images.heroClip.last
          ? `<img class="hero-still" src="${esc(images.heroClip.last)}" width="${images.heroClip.width}" height="${images.heroClip.height}" alt="${esc(t('packshot.alt'))}" decoding="async">`
          : picture({ ...images.packshot, alt: t('packshot.alt') }, { sizes: '(min-width: 900px) 48vw, 92vw', loading: 'eager', fetchpriority: 'high', className: 'hero-still' })}
      </div>
    </div>
  </div>
</section>



<section class="section section-alt" id="why" aria-labelledby="why-title">
  <div class="wrap">
    <div class="section-head reveal">
      <p class="eyebrow">${esc(t('why.eyebrow'))}</p>
      <h2 id="why-title" class="h2">${esc(t('why.titleA'))} <span class="serif gold">${esc(t('why.titleB'))}</span></h2>
    </div>
    <div class="why-grid">
      ${[1, 2, 3].map((i) => `<div class="why-item reveal"><h3>${esc(t(`why.${i}.title`))}</h3><p>${esc(t(`why.${i}.text`))}</p></div>`).join('')}
    </div>
  </div>
</section>

<section class="section life" aria-labelledby="life-title">
  <div class="wrap">
    <div class="section-head reveal life-head">
      <p class="eyebrow">${esc(t('life.eyebrow'))}</p>
      <h2 id="life-title" class="h2">${esc(t('life.titleA'))} <span class="serif gold">${esc(t('life.titleB'))}</span></h2>
    </div>
    <div class="life-grid" data-life>
      ${life.map(([label, img], i) => `<figure class="life-card reveal" style="margin:0">${picture(img, { sizes: '(min-width: 1200px) 380px, (min-width: 700px) 31vw, 84vw' })}<figcaption><span class="label">${esc(label)}</span></figcaption></figure>`).join('')}
    </div>
  </div>
</section>

<section class="section section-navy loyalty" id="loyalty" aria-labelledby="loyalty-title">
  <div class="wrap loyalty-grid">
    <div class="reveal">
      <p class="eyebrow">${esc(t('loyalty.eyebrow'))}</p>
      <h2 id="loyalty-title" class="h2" style="margin:14px 0 18px">${esc(t('loyalty.titleA'))}<br><span class="serif gold">${esc(t('loyalty.titleB'))}</span></h2>
      <p class="lead">${esc(t('loyalty.lead', { interval: intervalLabel(t) }))}</p>
      <ul class="loyalty-rules">
        <li>${esc(t('loyalty.rule1'))}</li>
        <li>${esc(t('loyalty.rule2'))}</li>
        <li>${esc(t('loyalty.rule3'))}</li>
      </ul>
      <div style="margin-top:28px"><a class="btn btn-ghost" href="${t.href('/subscription')}">${esc(t('cta.howItWorks'))}</a></div>
    </div>
    <div class="reveal">${loyaltyLadder(t)}${loyalty.levels.every((l) => l.discountPct == null) ? `<p class="small muted" style="margin-top:12px">${esc(t('loyalty.pctNote'))}</p>` : ''}</div>
  </div>
</section>

<section class="section section-alt final" id="get" aria-labelledby="final-title">
  <div class="wrap final-grid">
    <div class="final-visual reveal">
      ${picture({ ...(images.packshotLight.placeholder ? images.heroPosterSquare : images.packshotLight), alt: images.packshotLight.placeholder ? t('hero.alt') : t('packshot.alt') }, { sizes: '(min-width: 900px) 45vw, 100vw' })}
    </div>
    <div class="reveal stack" style="gap:18px">
      <h2 id="final-title" class="h2">${esc(t('final.titleA'))} ${esc(t('final.titleB'))}</h2>
      <p class="lead">${esc(t('final.lead', { n }))}</p>
      <div><a class="btn btn-primary" href="#buy" data-scroll-buy>${esc(t('cta.get'))}</a></div>
    </div>
  </div>
</section>

<section class="section section-tight" aria-labelledby="faq-title">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow">${esc(t('faq.eyebrow'))}</p><h2 id="faq-title" class="h2">${esc(t('faq.titleA'))} <span class="serif gold">${esc(t('faq.titleB'))}</span></h2></div>
    ${faqHtml(faqs, { open: -1 })}
    <p style="margin-top:22px"><a class="link" href="${t.href('/faq')}">${esc(t('faq.all'))}</a></p>
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
