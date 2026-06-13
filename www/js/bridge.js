// ===========================================================================
// bridge.js — talks to the bedside sleep monitor over Wi-Fi.
//
// Path: Arduino (sensors) --USB--> your computer (server.js bridge) --Wi-Fi-->
// this phone. Set the computer's LAN address in Settings → "Sleep monitor
// address" (e.g. http://192.168.1.20:3000). A bare Wi-Fi sensor that serves
// JSON at "/" also works.
//
// Live shape from server.js  GET /api/sleep :
//   { connected, inBed, temperatureF, humidity, lightLux, noiseDb, motion,
//     since, sampleCount, raw }
//
// The bridge also lets you "capture" the night: it reads the accumulated
// overnight summary from the server (GET /api/sleep/summary) and writes a
// nightly record into the Store. If no hardware is present, the user can add a
// night manually (sleep.js) — every feature degrades gracefully without it.
// ===========================================================================
(function () {
  // Normalize the user-entered address: add http:// if they omitted the scheme
  // (a very common reason "it won't connect"), and drop any trailing slash.
  function base() {
    // user override (Settings) → baked-in default (config.js) → nothing
    let u = (Store.get('settings.bridgeUrl', '') || '').trim();
    if (!u) u = (window.CONFIG && CONFIG.bridgeUrl) || '';
    u = u.trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    return u.replace(/\/+$/, '');
  }

  // Parse a bare "label:value,label:value" or plain-number sensor line.
  function parseLoose(txt) {
    txt = String(txt || '').trim();
    if (!txt) return null;
    const out = {};
    txt.split(',').forEach(tok => {
      const m = tok.match(/([A-Za-z]+)\s*[:=]\s*(-?\d+(?:\.\d+)?)/);
      if (m) {
        const k = m[1].toLowerCase(), v = parseFloat(m[2]);
        if (k.startsWith('temp')) out.temperatureF = v * 9 / 5 + 32;
        else if (k.startsWith('hum')) out.humidity = v;
        else if (k.startsWith('light')) out.lightLux = Math.round(((1023 - v) / 1023) ** 2 * 320); // dark=high raw -> low lux
        else if (k.startsWith('sound') || k.startsWith('nois')) out.noiseDb = Math.round(30 + (v / 1023) * 48);
        else if (k.startsWith('mot')) out.motion = v;
        else if (k.startsWith('dist')) out.inBed = v >= 0 && v < 120;
      }
    });
    if (Object.keys(out).length) { out.connected = true; return out; }
    const n = txt.match(/-?\d+(?:\.\d+)?/);
    return n ? { connected: true, raw: txt } : null;
  }

  let pollTimer = null;
  const subs = new Set();

  const Bridge = {
    state: { connected: false, inBed: false, live: null, ageMs: null, lastError: null },
    onUpdate(cb) { subs.add(cb); return () => subs.delete(cb); },
    _emit() { subs.forEach(cb => { try { cb(Bridge.state); } catch (e) { console.warn(e); } }); },

    configured() { return !!base(); },

    async fetchJson(path, timeoutMs) {
      const url = base() + path;
      timeoutMs = timeoutMs || 4000;
      // Prefer the native HTTP plugin in the installed app: it bypasses browser
      // CORS *and* iOS App Transport Security, so plain-http LAN calls work.
      const CH = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
      if (CH) {
        try {
          const r = await CH.get({ url, connectTimeout: timeoutMs, readTimeout: timeoutMs, headers: {} });
          if (r.status < 200 || r.status >= 300) return null;
          const d = r.data;
          if (d == null) return null;
          if (typeof d === 'object') return d;
          const s = String(d).trim();
          try { return JSON.parse(s); } catch { return parseLoose(s); }
        } catch (e) { return null; }
      }
      // Web fallback (browser / Vercel). NOTE: an https page can't read an http
      // LAN address (mixed content) — that case is reported by diagnose().
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
        if (!r.ok) return null;
        const txt = (await r.text()).trim();
        try { return JSON.parse(txt); } catch { return parseLoose(txt); }
      } catch (e) { return null; } finally { clearTimeout(tm); }
    },

    // Rich connectivity check for Settings → "Save & test". Distinguishes
    // "couldn't reach it at all" from "reached, but the sketch isn't streaming".
    async diagnose() {
      if (!base()) return { ok: false, code: 'no-address', message: t('set.testFail') };
      const mixed = (location.protocol === 'https:' && /^http:\/\//i.test(base()) && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));
      const j = await Bridge.fetchJson('/api/sleep') || await Bridge.fetchJson('/');
      if (!j) {
        return { ok: false, code: mixed ? 'mixed-content' : 'unreachable',
          message: mixed ? 'Open the installed app (not a browser) to reach a local http address.' : t('set.testFail') };
      }
      const hasData = j.temperatureF != null || j.lightLux != null || j.raw;
      await Bridge.live();
      return { ok: true, code: hasData ? 'live' : 'reached-no-data',
        source: j.source, connected: j.connected !== false,
        message: hasData ? t('set.testOk') : 'Reached the bridge — flash the Arduino sketch to see live data.' };
    },

    async live() {
      if (!base()) { Bridge.state = { connected: false, inBed: false, live: null, ageMs: null, lastError: 'no-address' }; Bridge._emit(); return Bridge.state; }
      const j = await Bridge.fetchJson('/api/sleep') || await Bridge.fetchJson('/');
      if (!j) { Bridge.state = { connected: false, inBed: false, live: null, ageMs: null, lastError: 'unreachable' }; Bridge._emit(); return Bridge.state; }
      Bridge.state = {
        connected: j.connected !== false,
        inBed: !!j.inBed,
        ageMs: j.since != null ? j.since : 0,
        live: {
          temperatureF: num(j.temperatureF != null ? j.temperatureF : j.tempF),
          humidity: num(j.humidity),
          lightLux: num(j.lightLux != null ? j.lightLux : j.light),
          noiseDb: num(j.noiseDb != null ? j.noiseDb : j.noise),
          motion: num(j.motion),
          distanceCm: num(j.distanceCm),
          fan: num(j.fan),
          sampleCount: num(j.sampleCount),
        },
        lastError: null,
      };
      Bridge._emit();
      return Bridge.state;
    },

    async reconnect() {
      if (!base()) return { connected: false };
      try { await fetch(base() + '/api/sleep/reconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch {}
      return Bridge.live();
    },

    // Pull the overnight summary the server accumulated and store it as a night.
    async captureNight() {
      const j = await Bridge.fetchJson('/api/sleep/summary', 3000);
      if (!j) { UI.toast(t('sleep.disconnected'), 'bad'); return null; }
      const night = summaryToNight(j);
      const existing = Store.sleep.all().find(s => s.date === night.date);
      if (existing) Store.sleep.update(existing.id, night); else Store.sleep.add(night);
      UI.toast(t('app.saved'), 'good');
      return night;
    },

    poll(intervalMs) {
      Bridge.stopPoll();
      const tick = () => Bridge.live();
      tick();
      pollTimer = setInterval(tick, intervalMs || 4000);
    },
    stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } },
  };

  function num(v) { const n = Number(v); return isNaN(n) ? null : n; }

  // Turn a server overnight summary into a Store night record (+ derived scores).
  function summaryToNight(j) {
    const durationMin = j.durationMin != null ? j.durationMin : (j.inBedMin || 0);
    const tempF = num(j.avgTempF != null ? j.avgTempF : j.tempF);
    const humidity = num(j.avgHumidity);
    const lightLux = num(j.avgLightLux);
    const noiseDb = num(j.avgNoiseDb);
    const motion = num(j.motionEvents != null ? j.motionEvents : j.motion);
    const awakenings = num(j.awakenings) || 0;
    const envScore = environmentScore({ tempF, humidity, lightLux, noiseDb });
    const score = sleepScore({ durationMin, envScore, awakenings, motion });
    return {
      date: j.date || Store.today(),
      inBedAt: j.inBedAt || null, outAt: j.outAt || null,
      durationMin, tempF, humidity, lightLux, noiseDb, motion, awakenings,
      restful: null, envScore, score, source: 'monitor',
    };
  }

  // 0-100 environment quality from how close conditions sit to restful ranges.
  function environmentScore(e) {
    let pts = 0, n = 0;
    function band(v, lo, hi, soft) { if (v == null) return; n++; if (v >= lo && v <= hi) pts += 1; else { const d = v < lo ? lo - v : v - hi; pts += Math.max(0, 1 - d / soft); } }
    band(e.tempF, 64, 70, 8);
    band(e.humidity, 35, 55, 20);
    band(e.lightLux, 0, 8, 20);
    band(e.noiseDb, 0, 35, 25);
    return n ? Math.round((pts / n) * 100) : null;
  }
  function sleepScore(s) {
    const durPts = Math.min(1, (s.durationMin || 0) / 480) * 45;        // up to 8h
    const envPts = ((s.envScore != null ? s.envScore : 60) / 100) * 35;
    const wakePen = Math.min(15, (s.awakenings || 0) * 4);
    const motionPen = Math.min(5, (s.motion || 0) / 40);
    return Math.max(0, Math.min(100, Math.round(durPts + envPts + (20 - wakePen) - motionPen)));
  }

  Bridge.environmentScore = environmentScore;
  Bridge.sleepScore = sleepScore;
  window.Bridge = Bridge;
})();
