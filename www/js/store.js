// ===========================================================================
// store.js — Anchor's single source of truth. All features read & write here.
//
// Everything lives on-device in localStorage under one key. The store is
// reactive: mutators emit events; views subscribe via Store.on(evt, cb).
//
// Data streams (all arrays of records unless noted):
//   profile        { name, createdAt, onboarded, timezone }
//   settings       { lang, theme, tempUnit, llmKey, llmModel, liveTranslate, reminders }
//   values         [{ id, name, why }]
//   sleep          [{ id, date, inBedAt, outAt, durationMin, tempF, humidity, lightLux, noiseDb, motion, awakenings, restful(0-10), envScore, score, source }]
//   moods          [{ id, ts, date, valence(-2..2), energy(0-10), arousal(0-10), note, tags[] }]
//   journal        [{ id, ts, date, text, lang, sentiment, linguistics, themes[] }]
//   energy         [{ id, ts, date, kind:'spend'|'restore', amount(1-3), label, category }]
//   decompress     [{ id, date, ts, dump[], buckets:{act[],release[],feel[]}, completedAt }]
//   experiments    [{ id, title, hypothesis, metric, protocol[], total, startDate, status, logs[], result }]
//   valuesChecks   [{ id, date, lived[], crowded[], note }]
//   insights       [{ id, ts, kind, text, confidence, actionability, lagDays, vars, dismissed }]
//   investigations [{ id, question, startDate, status, verdict }]
//   profileWins    [{ id, title, evidence, ts }]   // "what works for me"
// ===========================================================================
(function () {
  const KEY = 'anchor_state_v1';
  const listeners = {};          // event -> Set(cb)

  function blank() {
    return {
      profile: { name: '', createdAt: null, onboarded: false, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local' },
      settings: {
        lang: null, theme: 'aurora', tempUnit: 'F',
        accent: 'aurora', density: 'spacious', doodles: true,
        fontScale: 1,                 // eyesight: 0.9 | 1 | 1.15 | 1.3
        tts: true,                    // read-aloud available
        sleepTracking: 'ask',         // 'ask' (prompt each morning) | 'accessory'
        region: 'US',                 // for emergency numbers
        emergency: { services: '911', crisis: '988', crisisText: '741741' },
        privacyAccepted: false,
        llmKey: '', llmModel: '',
        liveTranslate: false,
        dashHidden: [],               // hidden home widgets
        // session.persist: true = stay signed in across app closes (default);
        // false = sign out automatically when the app is closed.
        session: { persist: true },
        // Reminders carry a scope: 'general' nudges (miss / windDown) fire even
        // when signed out; 'user' nudges (checkin) only fire while signed in.
        reminders: {
          miss: { on: false, hour: 11, minute: 0 },
          windDown: { on: false, hour: 21, minute: 30 },
          checkin: { on: false, hour: 19, minute: 0 },
        },
      },
      activity: [],                   // [{ id, ts, date, kind:'move'|'rest', level(1-3), label }]
      values: [],
      sleep: [], moods: [], journal: [], energy: [],
      decompress: [], experiments: [], valuesChecks: [],
      insights: [], investigations: [], profileWins: [],
      gamification: { streak: 0, lastActive: null, longest: 0, grace: 0 },
      meta: { version: 1, seeded: false },
    };
  }

  let state = blank();

  // ---- persistence --------------------------------------------------------
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = Object.assign(blank(), JSON.parse(raw));
      // merge nested defaults that may be missing from older saves
      state.settings = Object.assign(blank().settings, state.settings || {});
      state.settings.session = Object.assign(blank().settings.session, state.settings.session || {});
      state.settings.reminders = Object.assign(blank().settings.reminders, state.settings.reminders || {});
    } catch (e) { console.warn('store load failed', e); state = blank(); }
    return state;
  }
  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('store persist failed', e); }
    }, 60);
  }

  // ---- events -------------------------------------------------------------
  function on(evt, cb) { (listeners[evt] = listeners[evt] || new Set()).add(cb); return () => listeners[evt].delete(cb); }
  function emit(evt, payload) {
    (listeners[evt] || []).forEach(cb => { try { cb(payload); } catch (e) { console.warn(e); } });
    (listeners['*'] || []).forEach(cb => { try { cb(evt, payload); } catch (e) { console.warn(e); } });
  }
  function touch(evt, payload) { persist(); emit(evt || 'change', payload); emit('change', payload); }

  // ---- date helpers -------------------------------------------------------
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dateKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return dateKey(new Date()); }
  function daysAgoKey(n) { const d = new Date(); d.setDate(d.getDate() - n); return dateKey(d); }
  function keyToDate(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
  function diffDays(a, b) { return Math.round((keyToDate(a) - keyToDate(b)) / 86400000); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ---- generic accessors --------------------------------------------------
  const Store = {
    state,
    load, persist, on, emit,
    dateKey, today, daysAgoKey, keyToDate, diffDays, uid,
    get raw() { return state; },

    get(path, fallback) {
      const parts = path.split('.');
      let cur = state;
      for (const p of parts) { if (cur == null) return fallback; cur = cur[p]; }
      return cur === undefined ? fallback : cur;
    },
    set(path, val) {
      const parts = path.split('.');
      let cur = state;
      for (let i = 0; i < parts.length - 1; i++) { if (cur[parts[i]] == null) cur[parts[i]] = {}; cur = cur[parts[i]]; }
      cur[parts[parts.length - 1]] = val;
      touch('set:' + parts[0], val);
      return val;
    },

    // ---- profile / settings ----
    profile: {
      get() { return state.profile; },
      update(patch) { Object.assign(state.profile, patch); touch('profile'); return state.profile; },
      name() { return state.profile.name || 'friend'; },
    },
    settings: {
      get() { return state.settings; },
      update(patch) { Object.assign(state.settings, patch); touch('settings'); return state.settings; },
    },

    // ---- values ----
    values: {
      all() { return state.values; },
      add(name, why, target) { const v = { id: uid(), name, why: why || '', target: target || 4 }; state.values.push(v); touch('values'); return v; },
      update(id, patch) { const v = state.values.find(x => x.id === id); if (v) Object.assign(v, patch); touch('values'); return v; },
      remove(id) { state.values = state.values.filter(x => x.id !== id); touch('values'); },
      set(list) { state.values = list; touch('values'); },
      byId(id) { return state.values.find(x => x.id === id); },
    },

    // ---- generic stream factory ----
    _stream(name) {
      return {
        all() { return state[name]; },
        recent(n) { return state[name].slice(-n); },
        byDate(dk) { return state[name].filter(r => r.date === dk); },
        byId(id) { return state[name].find(r => r.id === id); },
        add(rec) { rec.id = rec.id || uid(); if (!rec.date) rec.date = today(); if (!rec.ts) rec.ts = Date.now(); state[name].push(rec); markActive(); touch(name, rec); return rec; },
        update(id, patch) { const r = state[name].find(x => x.id === id); if (r) Object.assign(r, patch); touch(name, r); return r; },
        remove(id) { state[name] = state[name].filter(x => x.id !== id); touch(name); },
        clear() { state[name] = []; touch(name); },
        count() { return state[name].length; },
      };
    },

    // ---- gamification / streak ----
    streak() { return state.gamification.streak; },

    // ---- derived selectors (used widely) ----
    derive: {},

    // ---- import / export / reset ----
    export() { return JSON.stringify(state, null, 2); },
    import(json) {
      try {
        const obj = JSON.parse(json);
        state = Object.assign(blank(), obj);
        // Re-merge nested settings defaults exactly like load(), so a partial or
        // older export can't leave settings.session/reminders undefined (which
        // would break Auth.persistSession() / Native.syncReminders()).
        state.settings = Object.assign(blank().settings, state.settings || {});
        state.settings.session = Object.assign(blank().settings.session, state.settings.session || {});
        state.settings.reminders = Object.assign(blank().settings.reminders, state.settings.reminders || {});
        Store.state = state; touch('change'); return true;
      } catch { return false; }
    },
    reset() { state = blank(); Store.state = state; try { localStorage.removeItem(KEY); } catch {} touch('change'); },
  };

  // attach streams
  ['sleep', 'moods', 'journal', 'energy', 'activity', 'decompress', 'experiments', 'valuesChecks', 'insights', 'investigations', 'profileWins'].forEach(n => {
    Store[n] = Store._stream(n);
  });

  // ---- streak bookkeeping -------------------------------------------------
  // Anchor is non-punitive: missing a single day shouldn't nuke a streak you've
  // worked to build. You bank a "grace day" every few days you show up (capped at
  // one in reserve). If you skip exactly one day and have a grace day, the streak
  // survives — quietly forgiven. Skip two days, or skip with no grace, and it
  // resets. lastGraceUsed lets the UI surface a gentle "streak saved" beat once.
  function markActive() {
    const g = state.gamification;
    const tk = today();
    if (g.lastActive === tk) return;
    if (g.grace == null) g.grace = 0;
    g.graceJustUsed = false;
    const gap = g.lastActive ? diffDays(tk, g.lastActive) : null;
    if (gap === 1) {
      g.streak = (g.streak || 0) + 1;
    } else if (gap === 2 && (g.streak || 0) >= 3 && g.grace > 0) {
      // one missed day, forgiven — the streak lives on
      g.streak = g.streak + 1;
      g.grace -= 1;
      g.graceJustUsed = true;
    } else {
      g.streak = 1;
    }
    g.lastActive = tk;
    g.longest = Math.max(g.longest || 0, g.streak);
    // earn a grace day every 5 lived days, keeping at most one in reserve
    if (g.streak > 0 && g.streak % 5 === 0) g.grace = Math.min(1, (g.grace || 0) + 1);
  }
  Store.markActive = markActive;
  // Does the user currently have a streak-saving grace day banked?
  Store.graceAvailable = function () { return (state.gamification.grace || 0) > 0 && (state.gamification.streak || 0) >= 3; };

  // ===========================================================================
  // DERIVED SELECTORS
  // ===========================================================================

  // Map a mood valence/energy to an emotional-weather code.
  function weatherFor(valence, energy) {
    if (valence == null) return 'cloud';
    if (valence <= -1.4) return 'storm';
    if (valence <= -0.6) return 'rain';
    if (valence < 0.2) return (energy != null && energy < 4) ? 'fog' : 'cloud';
    if (valence < 1.2) return 'clear';
    return 'sun';
  }
  Store.weatherFor = weatherFor;

  // The day's representative mood = average of that day's check-ins.
  Store.derive.dayMood = function (dk) {
    const ms = state.moods.filter(m => m.date === dk);
    if (!ms.length) return null;
    const valence = ms.reduce((s, m) => s + (m.valence || 0), 0) / ms.length;
    const energy = ms.reduce((s, m) => s + (m.energy || 0), 0) / ms.length;
    const tags = [].concat(...ms.map(m => m.tags || []));
    return { valence, energy, tags, count: ms.length, weather: weatherFor(valence, energy) };
  };

  Store.derive.todayWeather = function () {
    const m = Store.derive.dayMood(today());
    return m ? m.weather : null;
  };

  // A continuous series for a given metric, indexed by day key, for the last N days.
  // metric ∈ 'valence','energyMood','sleepScore','sleepTempF','sleepDur','noise',
  //          'light','journalSentiment','energyNet','restful'
  Store.derive.series = function (metric, days) {
    days = days || 42;
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const dk = daysAgoKey(i);
      out.push({ date: dk, value: metricValue(metric, dk) });
    }
    return out;
  };

  function avg(arr, f) { const v = arr.map(f).filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }

  function metricValue(metric, dk) {
    switch (metric) {
      case 'valence': { const m = Store.derive.dayMood(dk); return m ? m.valence : null; }
      case 'energyMood': { const m = Store.derive.dayMood(dk); return m ? m.energy : null; }
      case 'sleepScore': { const s = state.sleep.find(x => x.date === dk); return s ? s.score : null; }
      case 'restful': { const s = state.sleep.find(x => x.date === dk); return s ? s.restful : null; }
      case 'sleepTempF': { const s = state.sleep.find(x => x.date === dk); return s ? s.tempF : null; }
      case 'sleepDur': { const s = state.sleep.find(x => x.date === dk); return s ? s.durationMin / 60 : null; }
      case 'noise': { const s = state.sleep.find(x => x.date === dk); return s ? s.noiseDb : null; }
      case 'light': { const s = state.sleep.find(x => x.date === dk); return s ? s.lightLux : null; }
      case 'humidity': { const s = state.sleep.find(x => x.date === dk); return s ? s.humidity : null; }
      case 'journalSentiment': { const js = state.journal.filter(x => x.date === dk && x.sentiment); return avg(js, j => j.sentiment && j.sentiment.score); }
      case 'energyNet': {
        const es = state.energy.filter(x => x.date === dk);
        if (!es.length) return null;
        return es.reduce((s, e) => s + (e.kind === 'restore' ? e.amount : -e.amount), 0);
      }
      default: return null;
    }
  }
  Store.derive.metricValue = metricValue;

  Store.derive.energyToday = function () {
    const es = state.energy.filter(x => x.date === today());
    const spent = es.filter(e => e.kind === 'spend').reduce((s, e) => s + e.amount, 0);
    const restored = es.filter(e => e.kind === 'restore').reduce((s, e) => s + e.amount, 0);
    return { spent, restored, net: restored - spent, count: es.length };
  };

  Store.derive.lastSleep = function () { return state.sleep.length ? state.sleep[state.sleep.length - 1] : null; };

  // ---- VITALITY: an energy bar from rest + physical activity, tied to mind ---
  // Combines last night's rest, today's movement, and the energy ledger into a
  // single 0-100 "energy" reading, plus a plain-language read on what it means
  // for mood and one concrete lever to raise it.
  Store.derive.vitality = function () {
    const s = Store.derive.lastSleep();
    // rest component (0-45): sleep score + duration sweet-spot bonus
    let rest = 0;
    if (s) {
      rest = Math.round((s.score || 0) * 0.32);                 // up to ~32
      const h = (s.durationMin || 0) / 60;
      rest += (h >= 7 && h <= 9) ? 13 : (h >= 6 && h <= 9.5 ? 8 : 3); // up to 45
    } else { rest = 16; }                                        // unknown → neutral-low
    // movement component (0-35): today's logged physical activity
    const act = state.activity.filter(a => a.date === today());
    const move = act.filter(a => a.kind === 'move').reduce((n, a) => n + (a.level || 1), 0);
    const restLog = act.filter(a => a.kind === 'rest').reduce((n, a) => n + (a.level || 1), 0);
    let movement = Math.min(28, move * 7);                       // light=7, moderate=14, intense=21+
    if (move >= 6) movement = Math.min(30, movement - (move - 6) * 3); // overtraining dampener
    movement += Math.min(7, restLog * 3);                        // intentional rest helps too
    // ledger component (0-20): net restores vs drains today
    const e = Store.derive.energyToday();
    const ledger = Math.max(0, Math.min(20, 10 + (e.net || 0) * 2));
    let score = Math.round(rest + Math.min(35, movement) + ledger);
    score = Math.max(2, Math.min(100, score));

    const band = score >= 75 ? 'high' : score >= 45 ? 'steady' : 'low';
    // tie to mental health + one lever
    let read, lever;
    if (band === 'high') { read = 'mindHigh'; lever = 'leverHigh'; }
    else if (band === 'steady') { read = 'mindSteady'; lever = 'leverSteady'; }
    else { read = 'mindLow'; lever = (!s || (s && s.score < 60)) ? 'leverSleep' : (move < 1 ? 'leverMove' : 'leverRest'); }
    return { score, band, rest, movement: Math.min(35, movement), ledger, read, lever, hasSleep: !!s, movedToday: move > 0 };
  };

  Store.derive.activeExperiment = function () { return state.experiments.find(e => e.status === 'running') || null; };

  // How many days of usable history exist (max across streams) — gates features.
  Store.derive.historyDays = function () {
    const dates = new Set();
    ['moods', 'sleep', 'journal', 'energy'].forEach(n => state[n].forEach(r => dates.add(r.date)));
    return dates.size;
  };

  load();
  window.Store = Store;
})();
