// ===========================================================================
// night.js — "Goodnight mode". After the wind-down ritual completes (or when
// the monitor sees you're in bed), Anchor settles into a calm full-screen
// goodnight state and STAYS there until your set wake time, so the phone
// doesn't pull you back into the day. In the morning it greets you and offers a
// "how did you sleep?" check.
//
//   Night.start()      begin goodnight now → until next wake time
//   Night.isActive()   are we currently in goodnight mode?
//   Night.check()      on boot/resume: show overlay if still night, else clear
//   Night.end()        "I'm awake" — dismiss and go to the morning check
//   Night.schedule()   { bedHour,bedMin,wakeHour,wakeMin } from settings
// ===========================================================================
(function () {
  const E = UI.el;

  function schedule() {
    const s = Store.get('settings.sleepSchedule', null) || {};
    return { bedHour: s.bedHour != null ? s.bedHour : 22, bedMin: s.bedMin != null ? s.bedMin : 30,
             wakeHour: s.wakeHour != null ? s.wakeHour : 7, wakeMin: s.wakeMin != null ? s.wakeMin : 0 };
  }

  // first wakeHour:wakeMin strictly after `since` (handles crossing midnight)
  function nextWake(since) {
    const sch = schedule();
    const d = new Date(since);
    const cand = new Date(d.getFullYear(), d.getMonth(), d.getDate(), sch.wakeHour, sch.wakeMin, 0, 0);
    if (cand.getTime() <= since) cand.setDate(cand.getDate() + 1);
    return cand.getTime();
  }

  function state() { return Store.get('session.goodnight', null); }

  function isActive() {
    const g = state();
    if (!g) return false;
    return Date.now() < g.wakeAt;
  }

  function start() {
    const since = Date.now();
    Store.set('session.goodnight', { since, wakeAt: nextWake(since) });
    UI.haptic('success');
    showOverlay();
  }

  function check() {
    const g = state();
    if (!g) return;
    if (Date.now() < g.wakeAt) showOverlay();
    else { Store.set('session.goodnight', null); } // morning already — clear quietly
  }

  function end(toMorning) {
    Store.set('session.goodnight', null);
    removeOverlay();
    UI.haptic('light');
    if (toMorning && window.Anchor) {
      // morning check: a gentle mood check-in
      Anchor.go('checkin');
    }
  }

  // ---- overlay ----
  let overlay = null;
  let ticker = null;

  function stars(n) {
    const wrap = E('div', { class: 'night-stars', 'aria-hidden': 'true' });
    for (let i = 0; i < n; i++) {
      const seed = (i * 9301 + 49297) % 233280 / 233280;
      const seed2 = (i * 4099 + 7919) % 233280 / 233280;
      wrap.appendChild(E('i', { style: {
        position: 'absolute', width: '2px', height: '2px', borderRadius: '50%', background: '#fff',
        left: (seed * 100).toFixed(1) + '%', top: (seed2 * 70).toFixed(1) + '%',
        opacity: (0.2 + seed * 0.7).toFixed(2),
        animation: 'twinkle ' + (2 + seed2 * 4).toFixed(1) + 's ease-in-out infinite',
      } }));
    }
    return wrap;
  }

  function showOverlay() {
    if (overlay) return;
    const g = state();
    const morning = !g || Date.now() >= g.wakeAt;
    const name = Store.profile.name();
    const wakeAt = g ? g.wakeAt : Date.now();

    const title = E('div', { class: 'serif', style: { fontSize: '2.2rem', textAlign: 'center' } },
      morning ? t('night.wake') : t('night.goodnight', { name }));
    const sub = E('div', { class: 'soft tac', style: { maxWidth: '300px', lineHeight: '1.55', marginTop: '8px' } },
      morning ? t('night.wakeSub') : t('night.goodnightSub'));
    const clock = E('div', { class: 'huge grad-text', style: { margin: '18px 0 6px' } }, timeStr());
    const tucked = E('div', { class: 'tiny muted' }, morning ? '' : t('night.stayQuiet', { time: UI.fmt.time(wakeAt) }));

    overlay = E('div', { class: 'night-overlay', style: {
      position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '32px',
      background: 'radial-gradient(120% 90% at 50% 20%, #0e1430, #060814 70%, #03040a)',
      animation: 'fade .6s ease both',
    } }, [
      stars(46),
      E('div', { style: { fontSize: '3rem', marginBottom: '6px', animation: 'float-y 5s ease-in-out infinite' } }, morning ? '🌅' : '🌙'),
      title, clock, sub, tucked,
    ]);

    // The bottom controls. At night, "Close" doesn't yank you out of goodnight —
    // it quietly clears the buttons and leaves only a small ✕ in the corner, so
    // the screen stays a calm goodnight you can rest with and exit when ready.
    const controls = E('div', { style: { position: 'absolute', bottom: 'calc(var(--safe-b) + 28px)', left: 0, right: 0, padding: '0 32px' } }, [
      UI.btn(morning ? t('night.morningCheck') : t('night.endNow'), {
        class: morning ? 'btn-primary btn-lg' : 'btn-ghost', block: true,
        onClick: () => end(morning),
      }),
      morning ? null : E('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '10px', opacity: 0.6 }, onclick: () => minimize() }, t('app.close')),
    ]);
    overlay.appendChild(controls);

    // the discreet corner exit, revealed once the goodnight is "minimized"
    function minimize() {
      UI.haptic('light');
      if (controls.parentNode) controls.parentNode.removeChild(controls);
      if (overlay.querySelector('.night-x')) return;
      const x = E('button', { class: 'night-x', 'aria-label': t('app.close'), style: {
        position: 'absolute', top: 'calc(var(--safe-t) + 18px)', right: '20px',
        width: '38px', height: '38px', borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)',
        color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem', opacity: '0', transition: 'opacity .5s ease',
      }, onclick: () => end(false) }, UI.frag('<span style="display:inline-flex;width:15px;height:15px">' + Icons.get('x') + '</span>'));
      overlay.appendChild(x);
      requestAnimationFrame(() => requestAnimationFrame(() => { x.style.opacity = '1'; }));
    }

    document.body.appendChild(overlay);

    function timeStr() { try { return new Date().toLocaleTimeString(I18N.lang, { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } }
    ticker = setInterval(() => {
      clock.textContent = timeStr();
      // flip to morning automatically when wake time arrives
      if (g && Date.now() >= g.wakeAt && !morning) { removeOverlay(); showOverlay(); }
    }, 30000);
  }

  function removeOverlay() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (overlay) { overlay.style.animation = 'fade .4s reverse both'; const o = overlay; overlay = null; setTimeout(() => o.remove(), 380); }
  }

  window.Night = { start, isActive, check, end, schedule, showOverlay };
})();
