// ===========================================================================
// liquid.js — the behaviour half of the "Living Glass" overhaul.
//
//   1. Scroll-reactive chrome — while the view is actively scrolling, the
//      floating dock recedes (CSS: body.nav-recede); it surfaces again the
//      instant scrolling stops. Lightweight: one passive scroll listener that
//      toggles a class, debounced.
//   2. Pointer specular — a soft light that follows your finger/cursor across
//      any .glass-card, blooming under a press. Pure CSS-variable updates
//      (--mx/--my) throttled to one rAF per frame; the highlight itself is an
//      interaction-only ::after (see liquid.css), never an idle animation, so
//      it stays clear of the backdrop-filter tap-lag that killed the old sheen.
//
// Everything degrades silently: no #view, no listeners; reduced-motion users
// skip the cursor-follow entirely and keep only the gentle press bloom.
// ===========================================================================
(function () {
  const reduce = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || false;
  const finePointer = (window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches) || false;

  function setLight(card, x, y) {
    const r = card.getBoundingClientRect();
    if (!r.width || !r.height) return;
    card.style.setProperty('--mx', (((x - r.left) / r.width) * 100).toFixed(1) + '%');
    card.style.setProperty('--my', (((y - r.top) / r.height) * 100).toFixed(1) + '%');
  }

  function wire() {
    const view = document.getElementById('view');
    if (!view) { setTimeout(wire, 200); return; }

    // ---- 1 · scroll-reactive dock --------------------------------------
    let recedeTimer = null;
    view.addEventListener('scroll', function () {
      if (!document.body.classList.contains('nav-recede')) document.body.classList.add('nav-recede');
      clearTimeout(recedeTimer);
      recedeTimer = setTimeout(function () { document.body.classList.remove('nav-recede'); }, 240);
    }, { passive: true });

    // ---- 2 · pointer specular ------------------------------------------
    let raf = null, pending = null, hoverCard = null;

    function flush() {
      raf = null;
      if (!pending) return;
      const p = pending; pending = null;
      setLight(p.card, p.x, p.y);
    }
    function queue(card, x, y) {
      pending = { card: card, x: x, y: y };
      if (!raf) raf = requestAnimationFrame(flush);
    }

    // press bloom on every device — the light appears under the touch/click
    document.addEventListener('pointerdown', function (e) {
      const card = e.target.closest && e.target.closest('.glass-card');
      if (!card) return;
      setLight(card, e.clientX, e.clientY);
      card.classList.add('lit');
    }, { passive: true });

    const release = function (e) {
      const card = e.target.closest && e.target.closest('.glass-card');
      if (card && card !== hoverCard) setTimeout(function () { if (card !== hoverCard) card.classList.remove('lit'); }, 200);
    };
    document.addEventListener('pointerup', release, { passive: true });
    document.addEventListener('pointercancel', release, { passive: true });

    // cursor-follow glow only where a real hovering pointer exists
    if (finePointer && !reduce) {
      document.addEventListener('pointermove', function (e) {
        const card = e.target.closest && e.target.closest('.glass-card');
        if (card !== hoverCard) {
          if (hoverCard) hoverCard.classList.remove('lit');
          hoverCard = card || null;
          if (hoverCard) hoverCard.classList.add('lit');
        }
        if (card) queue(card, e.clientX, e.clientY);
      }, { passive: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
