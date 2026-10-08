// Tiny deterministic timeline for frame-by-frame video rendering.
// Every visual state is a pure function of t (seconds), so render.mjs can seek to any frame.
//
//   const tl = Timeline({ width: 1080, height: 1920, fps: 30, duration: 12 });
//   tl.to('#title', { start: 0.2, dur: 0.6, from: { opacity: 0, y: 40, scale: 0.96 }, to: { opacity: 1, y: 0, scale: 1 }, ease: 'out' });
//   tl.text('#counter', { start: 1, dur: 1.2, from: 0, to: 42000, format: n => Math.round(n).toLocaleString('uk-UA') });
//   tl.call(t => { ... });      // anything custom, drawn from t
//   tl.mount();                 // exposes window.VIDEO and window.seek, and plays live in a normal browser
//
// Animatable keys: opacity, x, y (px), scale, rotate (deg), blur (px), clip (0..1 reveal from left).

(function () {
  // Curves are named by intent, not by look. See references/motion.md for when to use which.
  const bezier = (x1, y1, x2, y2) => {
    const sample = (a, b, t) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 30; i++) {
        t = (lo + hi) / 2;
        if (sample(x1, x2, t) < x) lo = t; else hi = t;
      }
      return sample(y1, y2, t);
    };
  };
  const EASE = {
    linear: (x) => x,
    out: bezier(0.23, 1, 0.32, 1),        // entrances and exits
    inOut: bezier(0.77, 0, 0.175, 1),     // something moving across the screen
    soft: bezier(0.25, 0.1, 0.25, 1),     // color / glow changes
    drawer: bezier(0.32, 0.72, 0, 1),     // panels and sheets sliding in
    spring: (x) => {                      // light overshoot, bounce ≈ 0.15
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      return 1 - Math.exp(-6 * x) * Math.cos(10 * x);
    },
  };

  const DEFAULTS = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, blur: 0, clip: 1 };
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function Timeline(video) {
    const tweens = new Map(); // selector -> [tween]
    const texts = [];
    const calls = [];

    const api = {
      VIDEO: video,
      ease: EASE,
      to(selector, { start = 0, dur = 0.5, from = {}, to = {}, ease = 'out' }) {
        if (!tweens.has(selector)) tweens.set(selector, []);
        tweens.get(selector).push({ start, dur, from, to, ease: typeof ease === 'function' ? ease : EASE[ease] });
        return api;
      },
      // Enter, hold, exit the same way it came in.
      show(selector, { start, end, from = { opacity: 0, y: 30, scale: 0.97 }, dur = 0.5, exitDur = 0.35 }) {
        api.to(selector, { start, dur, from, to: {}, ease: 'out' });
        if (end !== undefined) api.to(selector, { start: end - exitDur, dur: exitDur, from: {}, to: from, ease: 'out' });
        return api;
      },
      // Children appear one after another.
      stagger(selector, { start = 0, each = 0.06, ...rest }) {
        document.querySelectorAll(selector).forEach((el, i) => {
          el.dataset.tlId ||= `tl${Math.random().toString(36).slice(2, 8)}`;
          api.to(`[data-tl-id="${el.dataset.tlId}"]`, { start: start + i * each, ...rest });
        });
        return api;
      },
      text(selector, { start = 0, dur = 1, from = 0, to = 1, ease = 'out', format = (n) => Math.round(n) }) {
        texts.push({ selector, start, dur, from, to, ease: EASE[ease] || ease, format });
        return api;
      },
      call(fn) { calls.push(fn); return api; },

      seek(t) {
        for (const [selector, list] of tweens) {
          const state = { ...DEFAULTS };
          // Before its first tween starts an element sits at that tween's "from" state.
          const sorted = [...list].sort((a, b) => a.start - b.start);
          Object.assign(state, sorted[0].from);
          for (const tw of sorted) {
            if (t < tw.start) break;
            const k = tw.ease(clamp01((t - tw.start) / tw.dur));
            const keys = new Set([...Object.keys(tw.from), ...Object.keys(tw.to)]);
            for (const key of keys) {
              const a = key in tw.from ? tw.from[key] : DEFAULTS[key];
              const b = key in tw.to ? tw.to[key] : DEFAULTS[key];
              state[key] = lerp(a, b, k);
            }
          }
          document.querySelectorAll(selector).forEach((el) => {
            el.style.opacity = state.opacity;
            el.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale}) rotate(${state.rotate}deg)`;
            el.style.filter = state.blur ? `blur(${state.blur}px)` : '';
            el.style.clipPath = state.clip < 1 ? `inset(0 ${(1 - state.clip) * 100}% 0 0)` : '';
          });
        }
        for (const tx of texts) {
          const k = tx.ease(clamp01((t - tx.start) / tx.dur));
          document.querySelectorAll(tx.selector).forEach((el) => { el.textContent = tx.format(lerp(tx.from, tx.to, k)); });
        }
        for (const fn of calls) fn(t);
      },

      mount() {
        window.VIDEO = video;
        window.seek = api.seek;
        api.seek(0);
        // Live preview when opened in a normal browser; under Playwright (navigator.webdriver) only seek() draws.
        if (!navigator.webdriver) {
          const t0 = performance.now();
          const loop = (now) => {
            api.seek(((now - t0) / 1000) % video.duration);
            requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        }
        return api;
      },
    };
    return api;
  }

  window.Timeline = Timeline;
})();
