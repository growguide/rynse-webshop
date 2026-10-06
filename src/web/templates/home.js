import { brand, product, copy, subscription, loyalty } from '../../config/commerce.js';
import { esc, sachetSvg, purchasePanel, faqItems, faqHtml, loyaltyLadder, placeholderFlag, priceFmt } from './components.js';
import { layout, organizationLd, websiteLd, productLd, faqLd } from './layout.js';

export function renderHome({ assets, images }) {
  const faqs = faqItems().slice(0, 5);
  const life = [
    ['Gym', images.life[0]], ['Travel', images.life[1]], ['Festival', images.life[2]],
    ['Work', images.life[3]], ['Date', images.life[4]], ['Everywhere', images.life[5]],
  ];
  const main = `
<section class="hero" id="top" data-hero data-frames="${esc(images.heroManifest || '')}">
  <div class="hero-sticky">
    <div class="hero-visual" data-hero-visual>
      <picture>
        <source media="(max-width: 899px)" srcset="${esc(images.heroPosterMobile)}">
        <img class="hero-poster" src="${esc(images.heroPoster)}" alt="RYNSE navy cleansing wipe sachet with gold wordmark floating in a dark studio" fetchpriority="high" decoding="async" width="1600" height="900">
      </picture>
      <canvas data-hero-canvas aria-hidden="true"></canvas>
      <div class="hero-float" data-hero-float aria-hidden="true">
        ${[0, 1, 2, 3, 4, 5].map((i) => `<div class="sachet s${i}" data-depth="${(0.3 + i * 0.14).toFixed(2)}">${sachetSvg({ title: '' })}</div>`).join('')}
      </div>
    </div>
    <div class="wrap hero-content">
      <p class="eyebrow reveal is-in">${product.wipesPerPack} individually wrapped cleansing wipes</p>
      <h1 class="display hero-title">Stay fresh.<br><span class="serif">Anywhere.</span></h1>
      <p class="hero-sub">${esc(copy.heroSub)}</p>
      <div class="hero-cta-row">
        <a class="btn btn-primary" href="#buy" data-scroll-buy>${esc(copy.ctaPrimary)}</a>
        <div class="hero-price">${priceFmt(product.priceCents)}<small>incl. VAT</small>${placeholderFlag('RYNSE_PRICE_CENTS')}</div>
      </div>
    </div>
    <div class="hero-scroll-hint">Scroll</div>
  </div>
</section>

<section class="purchase wrap" id="buy" aria-labelledby="buy-title">
  <h2 id="buy-title" class="sr-only">Buy RYNSE</h2>
  ${purchasePanel({ id: 'hero' })}
</section>

<section class="section section-tight" id="why" aria-labelledby="why-title">
  <div class="wrap">
    <div class="section-head reveal">
      <p class="eyebrow">Why RYNSE</p>
      <h2 id="why-title" class="h2">Freshness that fits <span class="serif gold">in your pocket.</span></h2>
    </div>
    <div class="why-grid">
      <div class="why-item reveal"><span class="num">01</span><h3>Fresh anywhere</h3><p>A quick, clean, fresh feeling when there's no shower or running water around.</p></div>
      <div class="why-item reveal"><span class="num">02</span><h3>Individually wrapped</h3><p>Compact, discreet sachets. Pocket, gym bag, hand luggage — RYNSE goes where you go.</p></div>
      <div class="why-item reveal"><span class="num">03</span><h3>Made for everyday life</h3><p>Water-based, pH-balanced and alcohol-free. Built for every day, not just the big days.</p></div>
    </div>
  </div>
</section>

<section class="section life" aria-labelledby="life-title">
  <div class="wrap section-head reveal">
    <p class="eyebrow">Wherever life takes you</p>
    <h2 id="life-title" class="h2">No shower. <span class="serif gold">No problem.</span></h2>
  </div>
  <div class="life-track" data-life>
    ${life.map(([label, img]) => `<figure class="life-card reveal" style="margin:0"><img src="${esc(img.src)}" ${img.srcset ? `srcset="${esc(img.srcset)}" sizes="(min-width: 1200px) 190px, (min-width: 768px) 30vw, 78vw"` : ''} alt="${esc(img.alt || label)}" loading="lazy" decoding="async" width="${img.width || 800}" height="${img.height || 1000}"><figcaption class="label">${esc(label)}</figcaption></figure>`).join('')}
  </div>
  <p class="life-words" aria-hidden="true"><span>Gym</span><span>Flight</span><span>Festival</span><span>Date</span><span class="serif">RYNSE.</span></p>
</section>

<section class="section loyalty" id="loyalty" aria-labelledby="loyalty-title">
  <div class="wrap loyalty-grid">
    <div class="reveal">
      <p class="eyebrow">Subscription &amp; loyalty</p>
      <h2 id="loyalty-title" class="h2" style="margin:14px 0 18px">Stay fresh.<br><span class="serif gold">Stay rewarded.</span></h2>
      <p class="lead">Subscribe and RYNSE arrives every ${esc(subscription.interval)}, automatically. Every full year your subscription runs, your loyalty benefit grows.</p>
      <ul class="loyalty-rules">
        <li>Benefits grow with every uninterrupted year as a subscriber.</li>
        <li>They exist only while your subscription is active — cancel, and the status resets.</li>
        <li>Come back later? A new subscription starts again at year 1. Cancel anytime, no questions asked.</li>
      </ul>
      <div style="margin-top:28px"><a class="btn btn-ghost" href="/subscription">How it works</a></div>
    </div>
    <div class="reveal">${loyaltyLadder()}${loyalty.levels.every((l) => l.discountPct == null) ? '<p class="small muted" style="margin-top:12px">Exact loyalty percentages are announced at launch.</p>' : ''}</div>
  </div>
</section>

<section class="section final" id="get" aria-labelledby="final-title">
  <div class="wrap final-grid">
    <div class="final-visual reveal">
      <img src="${esc(images.packshot.src)}" ${images.packshot.srcset ? `srcset="${esc(images.packshot.srcset)}" sizes="(min-width: 900px) 45vw, 100vw"` : ''} alt="${esc(images.packshot.alt)}" loading="lazy" decoding="async" width="${images.packshot.width || 800}" height="${images.packshot.height || 1000}">
    </div>
    <div class="reveal">
      <p class="eyebrow">Get RYNSE</p>
      <h2 id="final-title" class="h2" style="margin:14px 0 18px">Wherever you go, <span class="serif gold">RYNSE goes.</span></h2>
      <p class="lead" style="margin-bottom:26px">${product.wipesPerPack} wipes. One pack. Yours in a few taps.</p>
      ${purchasePanel({ id: 'final', compact: true })}
    </div>
  </div>
</section>

<section class="section section-tight" aria-labelledby="faq-title">
  <div class="wrap">
    <div class="section-head reveal"><p class="eyebrow">Good to know</p><h2 id="faq-title" class="h2">Questions, <span class="serif gold">answered.</span></h2></div>
    ${faqHtml(faqs, { open: -1 })}
    <p style="margin-top:22px"><a class="link" href="/faq">All questions →</a></p>
  </div>
</section>`;

  return layout({
    path: '/',
    title: 'Stay fresh. Anywhere.',
    description: `${brand.description} Order a single pack or subscribe and save — pay with iDEAL, Apple Pay or card.`,
    bodyClass: 'page-home',
    main,
    assets,
    scripts: [assets.heroJs],
    jsonLd: [organizationLd(), websiteLd(), productLd(), faqLd(faqs)],
  });
}
