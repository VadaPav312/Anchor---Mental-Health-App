// ===========================================================================
// weather.js — REAL local weather for outdoor nudges. Uses the device location
// + Open-Meteo (free, no API key). When it's genuinely nice out, Anchor gently
// suggests stepping outside — sunlight is one of the most reliable mood/sleep
// levers, and Pattern Detective can later confirm it for the user personally.
//
// Privacy: coordinates are used for one weather lookup and cached on-device;
// nothing is stored remotely. If location is unavailable, the nudge simply
// hides — every screen works without it.
//
//   Weather.refresh(force)  Weather.get()  Weather.requestLocation()
//   Weather.outsideCard()   -> element for the dashboard, or null
// ===========================================================================
(function () {
  const CACHE_MS = 30 * 60 * 1000;

  function get() { return Store.get('session.weather', null); }

  function condFromCode(code) {
    if (code === 0) return 'clear';
    if (code === 1 || code === 2) return 'sunny';
    if (code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'foggy';
    if (code >= 51 && code <= 67) return 'rainy';
    if (code >= 71 && code <= 77) return 'snowy';
    if (code >= 80 && code <= 82) return 'rainy';
    if (code >= 85 && code <= 86) return 'snowy';
    if (code >= 95) return 'stormy';
    return 'cloudy';
  }
  const EMOJI = { clear: '☀️', sunny: '🌤️', cloudy: '☁️', foggy: '🌫️', rainy: '🌧️', snowy: '🌨️', stormy: '⛈️', windy: '💨' };

  function isNice(tempC, cond, isDay) {
    return isDay && (cond === 'clear' || cond === 'sunny') && tempC >= 8 && tempC <= 30;
  }

  function position() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('no-geo'));
      navigator.geolocation.getCurrentPosition(
        p => resolve(p.coords),
        err => reject(err),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 }
      );
    });
  }

  async function refresh(force) {
    const cached = get();
    if (!force && cached && Date.now() - cached.ts < CACHE_MS) return cached;
    let coords;
    try { coords = await position(); }
    catch (e) { Store.set('session.weather', { ts: Date.now(), denied: true }); return get(); }
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + coords.latitude.toFixed(3) +
        '&longitude=' + coords.longitude.toFixed(3) + '&current=temperature_2m,weather_code,is_day';
      const r = await fetch(url, { cache: 'no-store' });
      const j = await r.json();
      const c = j.current || {};
      const cond = condFromCode(c.weather_code);
      const data = { ts: Date.now(), tempC: c.temperature_2m, code: c.weather_code, cond,
        isDay: c.is_day === 1, nice: isNice(c.temperature_2m, cond, c.is_day === 1), denied: false };
      Store.set('session.weather', data);
      return data;
    } catch (e) { return cached || null; }
  }

  function requestLocation() { return refresh(true); }

  function tempLabel(tempC) {
    if (tempC == null) return '';
    const unit = Store.get('settings.tempUnit', 'F');
    return unit === 'C' ? Math.round(tempC) : Math.round(tempC * 9 / 5 + 32);
  }

  // Card for the dashboard. Returns null when there's nothing worth saying.
  function outsideCard() {
    const w = get();
    // kick off a background refresh; dashboard re-renders cheaply on next visit
    refresh(false).then(d => { if (d && d.nice && !document.getElementById('outsideCard')) { /* will show next render */ } });

    if (!w) return null;
    if (w.denied) {
      if (Store.get('session.locNudgeDismissed')) return null;
      return UI.el('div', { class: 'glass-card card-tight', id: 'outsideCard' }, [
        UI.el('div', { class: 'row between gap3' }, [
          UI.el('div', { class: 'grow' }, [
            UI.el('div', { class: 'small soft' }, '🌤️ ' + t('outside.denied')),
          ]),
          UI.btn(t('outside.enable'), { class: 'btn-ghost btn-sm', onClick: () => requestLocation().then(() => Anchor.refresh()) }),
        ]),
      ]);
    }
    if (!w.nice) return null;
    return UI.el('div', { class: 'glass-card card', id: 'outsideCard', style: { borderColor: 'rgba(255,210,122,0.35)' } }, [
      UI.el('div', { class: 'row between gap3' }, [
        UI.el('div', { class: 'grow' }, [
          UI.el('div', { class: 'eyebrow', style: { color: 'var(--a5)' } }, '☀️ ' + t('outside.eyebrow')),
          UI.el('div', { class: 'b', style: { marginTop: '2px' } }, t('outside.title')),
          UI.el('div', { class: 'small soft mt1', style: { lineHeight: '1.45' } },
            t('outside.suggestion', { temp: tempLabel(w.tempC), cond: t('outside.' + w.cond) })),
        ]),
        UI.el('div', { style: { fontSize: '2rem' } }, EMOJI[w.cond] || '🌤️'),
      ]),
      UI.el('div', { class: 'row gap2 mt3' }, [
        UI.btn(t('outside.cta'), { class: 'btn-primary btn-sm grow', onClick: () => {
          Store.energy.add({ kind: 'restore', amount: 2, label: t('outside.cta'), category: 'body' });
          UI.toast(t('outside.logged'), 'good'); UI.haptic('success'); Anchor.refresh();
        } }),
        UI.btn(t('outside.later'), { class: 'btn-ghost btn-sm', onClick: () => { Store.set('session.locNudgeDismissed', true); Anchor.refresh(); } }),
      ]),
    ]);
  }

  window.Weather = { get, refresh, requestLocation, outsideCard, condFromCode, EMOJI };
})();
