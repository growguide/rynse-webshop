/* RYNSE hero — scroll-driven cinematic sequence.
 * Frames come from the Higgsfield render (see docs/HIGGSFIELD.md); the poster shows instantly,
 * frames stream in progressively, and the vector sachet layer adds depth. Falls back gracefully:
 * no frames / reduced motion / save-data → poster + a calm static composition. */
(() => {
  'use strict';
  const hero = document.querySelector('[data-hero]');
  if (!hero) return;
  const visual = hero.querySelector('[data-hero-visual]');
  const canvas = hero.querySelector('[data-hero-canvas]');
  const floatLayer = hero.querySelector('[data-hero-float]');
  const sachets = Array.from(hero.querySelectorAll('.hero-float .sachet'));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  const manifestUrl = hero.dataset.frames;

  // ---------- scroll progress ----------
  let progress = 0;
  const computeProgress = () => {
    const rect = hero.getBoundingClientRect();
    const range = hero.offsetHeight - window.innerHeight;
    progress = range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 0;
  };

  // ---------- floating vector sachets (choreography by progress) ----------
  // Each sachet: start (off-screen), mid (in frame, drifting), end (gone / behind hero). Values in vw/vh.
  const paths = [
    { s: [-30, 110, -40], m: [12, 62, 10], e: [8, 40, 24], scale: 0.55 },
    { s: [120, -20, 60], m: [78, 18, 35], e: [86, 10, 75], scale: 0.42 },
    { s: [50, 130, 0], m: [60, 78, -18], e: [64, 96, 2], scale: 0.7 },
    { s: [-20, 10, 20], m: [6, 14, -30], e: [-10, 8, -40], scale: 0.38 },
    { s: [130, 70, -10], m: [92, 52, 22], e: [120, 60, 40], scale: 0.5 },
    { s: [40, -30, 50], m: [36, 6, -12], e: [30, -20, -6], scale: 0.34 },
  ];
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const isDesktop = () => window.innerWidth >= 900;
  const layoutSachets = () => {
    const hasFrames = visual.classList.contains('has-frames');
    sachets.forEach((el, i) => {
      const p = paths[i % paths.length];
      const depth = Number(el.dataset.depth) || 0.5;
      let x, y, r, o;
      if (reduce) { x = p.m[0]; y = p.m[1]; r = p.m[2]; o = hasFrames ? 0 : 0.9; }
      else if (progress < 0.5) { const t = ease(progress / 0.5); x = lerp(p.s[0], p.m[0], t); y = lerp(p.s[1], p.m[1], t); r = lerp(p.s[2], p.m[2], t); o = Math.min(1, t * 1.6); }
      else { const t = ease((progress - 0.5) / 0.5); x = lerp(p.m[0], p.e[0], t); y = lerp(p.m[1], p.e[1], t); r = lerp(p.m[2], p.e[2], t); o = 1 - t; }
      // On the frame-driven hero the vector layer is a subtle depth accent; without frames it is the show.
      const alpha = hasFrames ? o * 0.55 : o;
      const scale = (isDesktop() ? 1 : 0.7) * p.scale * (0.8 + depth * 0.5);
      el.style.transform = `translate3d(${x}vw, ${y}vh, 0) rotate(${r}deg) scale(${scale})`;
      el.style.opacity = alpha.toFixed(3);
    });
  };

  // ---------- frame sequence ----------
  let frames = null; // {set, images: Array<ImageBitmap|HTMLImageElement|null>, loaded:Set}
  let ctx = null;
  let lastDrawn = -1;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const sizeCanvas = () => {
    const w = visual.clientWidth, h = visual.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    lastDrawn = -1;
  };
  const drawFrame = (i) => {
    if (!frames || !ctx) return;
    // nearest loaded frame at or before i, else nearest after
    let j = i; while (j >= 0 && !frames.images[j]) j -= 1;
    if (j < 0) { j = i; while (j < frames.images.length && !frames.images[j]) j += 1; }
    if (j >= frames.images.length || j === lastDrawn) return;
    const img = frames.images[j];
    const cw = canvas.width, ch = canvas.height, iw = img.width, ih = img.height;
    // Desktop: zoom slightly and anchor left so the hero sachet sits right of the copy column (matches the poster CSS).
    const zoom = isDesktop() ? 1.15 : 1;
    const s = Math.max(cw / iw, ch / ih) * zoom;
    const dw = iw * s, dh = ih * s;
    const fx = isDesktop() ? 0.1 : 0.5, fy = isDesktop() ? 0.5 : 0.42; // focal point matches CSS object-position
    const dx = (cw - dw) * fx, dy = (ch - dh) * fy;
    ctx.drawImage(img, dx, dy, dw, dh);
    lastDrawn = j;
  };
  const frameIndex = () => Math.round(progress * (frames.images.length - 1));

  async function loadFrames() {
    if (!manifestUrl || !canvas || reduce || saveData) return;
    let manifest;
    try { const r = await fetch(manifestUrl); if (!r.ok) return; manifest = await r.json(); } catch { return; }
    const set = (!isDesktop() && manifest.mobile) ? manifest.mobile : manifest.desktop;
    if (!set || !set.count) return;
    const count = lowEnd ? Math.min(set.count, Math.ceil(set.count / 2)) : set.count;
    const step = set.count / count;
    const urls = Array.from({ length: count }, (_, i) => `${set.path}${String(Math.round(i * step) + 1).padStart(3, '0')}.${set.ext || 'webp'}`);
    frames = { set, images: new Array(count).fill(null) };
    ctx = canvas.getContext('2d', { alpha: false });
    sizeCanvas();
    const load = (i) => new Promise((resolve) => {
      const img = new Image(); img.decoding = 'async';
      img.onload = () => { frames.images[i] = img; resolve(true); };
      img.onerror = () => resolve(false);
      img.src = urls[i];
    });
    // First frame → swap poster for canvas; then coarse keyframes; then fill.
    if (!(await load(0))) { frames = null; return; }
    drawFrame(0); visual.classList.add('has-frames'); layoutSachets();
    const order = [];
    for (const stride of [8, 4, 2, 1]) for (let i = 0; i < count; i += stride) if (!order.includes(i)) order.push(i);
    const concurrency = 4;
    let cursor = 0;
    const worker = async () => { while (cursor < order.length) { const i = order[cursor++]; if (!frames.images[i]) await load(i); if (Math.abs(i - frameIndex()) < 3) requestDraw(); } };
    await Promise.all(Array.from({ length: concurrency }, worker));
    requestDraw();
  }

  // ---------- render loop (rAF, only on change) ----------
  let raf = 0;
  const requestDraw = () => { if (!raf) raf = requestAnimationFrame(render); };
  const content = hero.querySelector('.hero-content');
  const render = () => {
    raf = 0;
    computeProgress();
    layoutSachets();
    if (content && !reduce) { const f = Math.min(1, Math.max(0, (progress - 0.55) / 0.3)); content.style.opacity = (1 - f).toFixed(3); content.style.transform = `translate3d(0, ${(-f * 40).toFixed(1)}px, 0)`; content.style.pointerEvents = f > 0.8 ? 'none' : ''; }
    if (frames) drawFrame(frameIndex());
  };
  window.addEventListener('scroll', requestDraw, { passive: true });
  window.addEventListener('resize', () => { if (frames) sizeCanvas(); requestDraw(); }, { passive: true });
  render();
  if ('requestIdleCallback' in window) requestIdleCallback(loadFrames, { timeout: 1500 }); else setTimeout(loadFrames, 300);

  // Parallax tilt on pointer (desktop only, subtle)
  if (!reduce && matchMedia('(hover: hover)').matches && floatLayer) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 2, y = ((e.clientY - r.top) / window.innerHeight - 0.5) * 2;
      floatLayer.style.transform = `translate3d(${x * -10}px, ${y * -6}px, 0)`;
    }, { passive: true });
  }
})();
