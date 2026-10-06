/* RYNSE hero — calm product stage: packshot with a soft gold glow, two vector sachets for depth,
 * gentle pointer parallax on desktop and a slow float (CSS). No scroll-jacking, no frame streaming.
 * The scroll-driven frame sequence lives in docs/archive/hero-sequence.js if it is wanted again. */
(() => {
  'use strict';
  const stage = document.querySelector('[data-hero-stage]');
  if (!stage) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  if (reduce || !fine) return;
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
