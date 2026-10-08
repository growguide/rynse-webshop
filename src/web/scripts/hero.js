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
    if (reduce || (navigator.connection && navigator.connection.saveData)) fail();
    else {
      video.addEventListener('ended', settle, { once: true });
      video.addEventListener('error', fail, { once: true });
      let started = false;
      // iOS/Android only autoplay muted inline video; set the properties too (attributes alone are not
      // always enough on iOS), and if the first play() is refused (Low Power Mode, data saver), retry on the
      // visitor's first touch/scroll, which counts as a user gesture. Only then fall back to the still.
      video.muted = true; video.defaultMuted = true; video.setAttribute('muted', ''); video.playsInline = true;
      const retryOnGesture = () => {
        const once = () => { ['touchstart', 'touchend', 'click', 'scroll', 'keydown'].forEach((ev) => window.removeEventListener(ev, once)); const p = video.play(); if (p && p.catch) p.catch(fail); };
        ['touchstart', 'touchend', 'click', 'scroll', 'keydown'].forEach((ev) => window.addEventListener(ev, once, { passive: true, once: true }));
        setTimeout(() => { if (video.paused && video.currentTime === 0) fail(); }, 8000);
      };
      const start = () => {
        if (started) return; started = true;
        const p = video.play();
        if (p && p.catch) p.catch(retryOnGesture);
        // Safety net: if the clip never finishes (stalled network), show the still after 15 s.
        setTimeout(() => { if (video.paused && video.currentTime === 0 && !pack.classList.contains('no-video')) fail(); else if (!video.ended) settle(); }, 15000);
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
