/* RYNSE hero — calm product stage: packshot with a soft gold glow, two vector sachets for depth,
 * gentle pointer parallax on desktop and a slow float (CSS). No scroll-jacking, no frame streaming.
 * The scroll-driven frame sequence lives in docs/archive/hero-sequence.js if it is wanted again. */
(() => {
  'use strict';
  const stage = document.querySelector('[data-hero-stage]');
  if (!stage) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Drop-in clip: plays exactly once when the hero is on screen, then simply stays paused on its last
  // frame (no swap, no fade). The still image is only shown when the clip cannot play.
  const video = stage.querySelector('[data-hero-video]');
  const pack = stage.querySelector('.hero-pack');
  if (video && pack) {
    const settle = () => pack.classList.add('is-settled');
    const fail = () => pack.classList.add('no-video');
    // Phones can refuse muted autoplay (iOS Low Power Mode, Android data saver): show the still, and
    // play the clip after all on the visitor's first tap, which always counts as permission.
    const retryOnTap = () => {
      fail();
      const again = () => {
        removeEventListener('touchend', again); removeEventListener('click', again);
        const p = video.play();
        if (p && p.then) p.then(() => pack.classList.remove('no-video'), () => {});
      };
      addEventListener('touchend', again, { passive: true }); addEventListener('click', again);
    };
    video.muted = true; // the attribute alone is not always reflected before play() on older WebKit
    if (reduce) fail();
    else {
      video.addEventListener('ended', settle, { once: true });
      video.addEventListener('error', fail, { once: true });
      // With <source> children a failed file reports on the last <source>, not on the <video>.
      const lastSource = video.querySelector('source:last-of-type');
      if (lastSource) lastSource.addEventListener('error', fail, { once: true });
      let started = false;
      const start = () => {
        if (started) return; started = true;
        if (navigator.connection && navigator.connection.saveData) { retryOnTap(); return; }
        const p = video.play();
        if (p && p.catch) p.catch((e) => (e && e.name === 'NotAllowedError' ? retryOnTap() : fail()));
        // Safety net: if the clip never finishes (stalled network), show the still after 12 s.
        setTimeout(() => { if (!pack.classList.contains('is-settled')) settle(); }, 12000);
      };
      if ('IntersectionObserver' in window) new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { start(); o.disconnect(); } }, { threshold: 0.3 }).observe(stage);
      else start();
    }
  }
  const fine = matchMedia('(pointer: fine)').matches;
  if (reduce || !fine) return;
  if (stage.querySelector('[data-hero-video]')) return; // video stage: no parallax, the product stays put
  const layers = Array.from(stage.querySelectorAll('[data-depth]'));
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
  const tick = () => {
    cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
    layers.forEach((el) => { const d = parseFloat(el.dataset.depth) || 1; el.style.translate = `${(cx * 14 * d).toFixed(1)}px ${(cy * 10 * d).toFixed(1)}px`; });
    if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) raf = requestAnimationFrame(tick); else raf = 0;
  };
  const onMove = (e) => {
    const r = stage.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const hero = stage.closest('[data-hero]') || stage;
  hero.addEventListener('pointermove', onMove, { passive: true });
  hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); });
})();
