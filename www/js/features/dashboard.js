// ===========================================================================
// dashboard.js — Home. The hub that ties every feature together: greeting,
// today's inner weather, a check-in CTA, last night's sleep, energy now, the
// single most important thing Pattern Detective noticed, a wind-down nudge,
// quick-log shortcuts, the active experiment, and values-of-the-day.
//
// This file doubles as the REFERENCE implementation for the feature contract:
//   Anchor.register({ id, labelKey, icon, order, tab, render(container, params) })
//   build UI with UI.el / UI.card / UI.tile / UI.btn, read Store.*, navigate
//   with Anchor.go(id). Keep everything localized via t().
// ===========================================================================
(function () {
  function greeting() {
    const h = new Date().getHours();
    const name = Store.profile.name();
    if (h < 5) return t('dash.greetingNight', { name });
    if (h < 12) return t('dash.greetingMorning', { name });
    if (h < 18) return t('dash.greetingAfternoon', { name });
    return t('dash.greetingEvening', { name });
  }

  function render(root) {
    // ---- header ----
    // a one-time "your streak was saved" beat when a grace day quietly caught a miss
    if (Store.raw.gamification && Store.raw.gamification.graceJustUsed && !Store.get('session.graceSeen')) {
      Store.set('session.graceSeen', Store.today());
      setTimeout(() => { UI.toast('🛟 ' + t('dash.streakSaved'), 'good'); if (UI.hapticPop) UI.hapticPop(); }, 600);
    }

    root.appendChild(UI.el('div', { class: 'page-head', style: { position: 'relative' } }, [
      UI.el('button', { class: 'icon-btn dash-share-btn', 'aria-label': t('dash.shareToday'),
        title: t('dash.shareToday'), onclick: (e) => { e.stopPropagation(); shareToday(); },
        style: { position: 'absolute', top: '2px', right: '0' } },
        UI.frag(`<span style="width:20px;height:20px;display:inline-flex">${Icons.get('download')}</span>`)),
      UI.el('div', { class: 'eyebrow' }, UI.fmt.date(Store.today(), { weekday: 'long', month: 'long', day: 'numeric' })),
      UI.el('h1', { class: 'page-title serif' }, greeting()),
      Store.streak() > 1 ? UI.el('div', { class: 'row gap2 mt1', style: { alignItems: 'center' } }, [
        UI.el('span', { class: 'small soft' }, '🔥 ' + t('dash.streak', { n: Store.streak() })),
        Store.graceAvailable() ? UI.el('span', { class: 'badge calm', title: t('dash.graceHint') }, '🛟 ' + t('dash.graceDay')) : null,
      ]) : null,
    ]));

    const grid = UI.el('div', { class: 'col gap4 stagger dash-grid' });
    root.appendChild(grid);

    // Each home widget is a self-contained, REORDERABLE block. Long-press any
    // of them to enter "arrange" mode (iOS-style jiggle) and drag to reorder;
    // the order is remembered. Conditional widgets simply drop out when N/A.
    const WIDGETS = [
      { key: 'hud',        build: () => window.Gamify ? Gamify.hud() : null },
      { key: 'vitality',   build: () => vitalityCard() },
      { key: 'sleepprompt', build: () => sleepPromptCard() },
      { key: 'briefing',   build: () => aiBriefingCard() },
      { key: 'weather',    build: () => weatherCard() },
      { key: 'outside',    build: () => window.Weather ? Weather.outsideCard() : null },
      { key: 'checkin',    build: () => Store.derive.dayMood(Store.today()) ? null : checkInCard() },
      { key: 'tiles',      build: () => UI.el('div', { class: 'tiles' }, [sleepTile(), energyTile()]) },
      { key: 'insight',    build: () => insightCard() },
      { key: 'winddown',   build: () => windDownCard() },
      { key: 'valuedrift', build: () => valueDriftCard() },
      { key: 'experiment', build: () => { const e = Store.derive.activeExperiment(); return e ? experimentCard(e) : null; } },
      { key: 'quicklog',   build: () => quickLogCard() },
      { key: 'values',     build: () => valuesCard() },
    ];
    const byKey = {}; WIDGETS.forEach(w => byKey[w.key] = w);
    const saved = Store.get('settings.dashOrder', null);
    const order = (Array.isArray(saved) ? saved.filter(k => byKey[k]) : []);
    WIDGETS.forEach(w => { if (order.indexOf(w.key) === -1) order.push(w.key); });

    order.forEach(key => {
      const w = byKey[key]; if (!w) return;
      let node; try { node = w.build(); } catch (e) { node = null; }
      if (!node) return;
      const wrap = UI.el('div', { class: 'dash-widget', dataset: { wkey: key } }, [node]);
      attachArrange(wrap, grid);
      grid.appendChild(wrap);
    });
  }

  // ---- widget arrange / reorder (long-press → jiggle → drag) ---------------
  let _arranging = false, _dragEl = null;

  function attachArrange(wrap, grid) {
    UI.longPress(wrap, () => enterArrange(grid), 480);
    wrap.addEventListener('pointerdown', (e) => {
      if (!_arranging) return;
      e.preventDefault();
      _dragEl = wrap; wrap.classList.add('dragging');
      try { wrap.setPointerCapture(e.pointerId); } catch {}
      UI.haptic('medium');
      const move = (ev) => onArrangeMove(ev, grid);
      const up = () => {
        document.removeEventListener('pointermove', move);
        if (_dragEl) { _dragEl.classList.remove('dragging'); _dragEl = null; }
        persistOrder(grid); UI.haptic('light');
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up, { once: true });
    });
  }

  function onArrangeMove(ev, grid) {
    if (!_dragEl) return;
    const sibs = Array.prototype.filter.call(grid.children, c => c !== _dragEl && c.classList.contains('dash-widget'));
    let target = null;
    for (const s of sibs) { const r = s.getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { target = s; break; } }
    if (target) {
      if (_dragEl.nextElementSibling !== target) { grid.insertBefore(_dragEl, target); UI.haptic('tick'); }
    } else if (grid.lastElementChild !== _dragEl) {
      grid.appendChild(_dragEl); UI.haptic('tick');
    }
  }

  function enterArrange(grid) {
    if (_arranging) return;
    _arranging = true;
    grid.classList.add('arranging');
    document.body.classList.add('arrange-mode');
    UI.hapticSeq([{ style: 'medium', delay: 0 }, { style: 'light', delay: 90 }]);
    // a floating "Done" bar
    if (!document.getElementById('arrangeBar')) {
      const bar = UI.el('div', { class: 'arrange-bar glass-strong', id: 'arrangeBar' }, [
        UI.el('span', { class: 'small' }, t('dash.arrangeHint')),
        UI.btn(t('app.done'), { class: 'btn-primary btn-sm', onClick: () => exitArrange(grid) }),
      ]);
      document.body.appendChild(bar);
    }
  }
  function exitArrange(grid) {
    _arranging = false;
    if (grid) grid.classList.remove('arranging');
    document.body.classList.remove('arrange-mode');
    const bar = document.getElementById('arrangeBar'); if (bar) bar.remove();
    persistOrder(grid);
    UI.haptic('success');
  }
  function persistOrder(grid) {
    if (!grid) return;
    const keys = Array.prototype.map.call(grid.querySelectorAll('.dash-widget'), el => el.dataset.wkey);
    if (keys.length) Store.settings.update({ dashOrder: keys });
  }

  function weatherCard() {
    const wx = Store.derive.todayWeather();
    const card = UI.card([
      UI.el('div', { class: 'row between' }, [
        UI.el('div', {}, [
          UI.el('div', { class: 'eyebrow' }, t('dash.todayWeather')),
          UI.el('div', { class: 'row gap2', style: { alignItems: 'baseline', marginTop: '4px' } }, [
            UI.el('div', { style: { fontSize: '2.4rem' } }, UI.weatherEmoji(wx || 'cloud')),
            UI.el('div', { class: 'big b' }, wx ? UI.weatherName(wx) : t('wx.noEntry')),
          ]),
        ]),
        UI.frag(`<span style="width:22px;color:var(--ink-ghost)">${Icons.get('chevron')}</span>`),
      ]),
    ], { sheen: true, onClick: () => Anchor.go('weather') });
    return card;
  }

  function checkInCard() {
    return UI.card([
      UI.el('div', { class: 'row between gap3' }, [
        UI.el('div', { class: 'grow' }, [
          UI.el('div', { class: 'b big' }, t('dash.howAreYou')),
          UI.el('div', { class: 'small soft mt1' }, t('chk.streakKeep')),
        ]),
        UI.btn(t('dash.checkInNow'), { class: 'btn-primary', onClick: () => Anchor.go('checkin') }),
      ]),
    ]);
  }

  function sleepTile() {
    const s = Store.derive.lastSleep();
    if (!s) {
      return UI.el('div', { class: 'tile glass-card', onclick: () => Anchor.go('sleep') }, [
        UI.el('div', { class: 'tile-lbl' }, t('dash.lastNight')),
        UI.el('div', { class: 'tile-val muted', style: { fontSize: '1.1rem' } }, t('dash.noSleepYet')),
        UI.el('div', { class: 'tile-sub' }, t('dash.connectToSee')),
      ]);
    }
    const el = UI.el('div', { class: 'tile glass-card', onclick: () => Anchor.go('sleep') }, [
      UI.el('div', { class: 'row between' }, [
        UI.el('div', { class: 'tile-lbl' }, t('dash.lastNight')),
        UI.frag(`<span style="width:20px;color:var(--ink-ghost)">${Icons.get('moon')}</span>`),
      ]),
      UI.el('div', { class: 'row gap3', style: { alignItems: 'center', marginTop: '4px' } }, [
        UI.frag(UI.ring(s.score, 100, { size: 64, stroke: 7, label: '', color: ['var(--a3)', 'var(--a1)'] })),
        UI.el('div', {}, [
          UI.el('div', { class: 'b' }, UI.fmt.dur(s.durationMin)),
          UI.el('div', { class: 'tiny soft' }, UI.fmt.temp(s.tempF) + (s.noiseDb != null ? ' · ' + Math.round(s.noiseDb) + 'dB' : '')),
        ]),
      ]),
    ]);
    return el;
  }

  function energyTile() {
    const e = Store.derive.energyToday();
    const net = e.net;
    const state = net >= 2 ? t('en.charged') : net <= -2 ? t('en.runningLow') : t('en.steady');
    const color = net >= 2 ? 'var(--good)' : net <= -2 ? 'var(--bad)' : 'var(--warn)';
    return UI.el('div', { class: 'tile glass-card', onclick: () => Anchor.go('energy') }, [
      UI.el('div', { class: 'row between' }, [
        UI.el('div', { class: 'tile-lbl' }, t('dash.energyNow')),
        UI.frag(`<span style="width:20px;color:var(--ink-ghost)">${Icons.get('energy')}</span>`),
      ]),
      UI.el('div', { class: 'tile-val', style: { color, fontSize: '1.4rem', marginTop: '6px' } }, state),
      UI.el('div', { class: 'tile-sub' }, e.count ? (UI.fmt.signed(net) + ' ' + t('en.net').toLowerCase()) : t('en.noData')),
    ]);
  }

  // Friendly, human label for a raw metric key used in Pattern Detective.
  function metricLabel(key) {
    const m = {
      sleepTempF: t('metric.sleepTempF'), sleepDur: t('metric.sleepDur'),
      noise: t('metric.noise'), sleepScore: t('metric.sleepScore'),
      energyNet: t('metric.energyNet'), valence: t('metric.valence'),
      energyMood: t('metric.energyMood'), light: t('metric.light'),
      journalSentiment: t('metric.journalSentiment'), restful: t('metric.restful'), humidity: t('metric.humidity'),
    };
    return m[key] || key;
  }
  function metricEmoji(key) {
    const m = { sleepTempF: '🌡️', sleepDur: '🛏️', noise: '🔊', sleepScore: '😴', energyNet: '🔋',
      valence: '🌤️', energyMood: '⚡', light: '💡', journalSentiment: '✍️', restful: '🌙', humidity: '💧' };
    return m[key] || '•';
  }
  function lagLabel(lag) {
    if (lag === 0) return t('pat.lagSame');
    if (lag === 1) return t('pat.lag1');
    if (lag === 2) return t('pat.lag2');
    return t('pat.lag3');
  }

  // The flagship insight, rendered as an animated CAUSE → EFFECT thread: two
  // nodes joined by a flowing connector, with the delay called out on the line.
  // It turns an abstract correlation into something you can see, which is the
  // single most novel thing Anchor does. Falls back gracefully while computing.
  function insightCard() {
    const wrap = UI.el('div', { class: 'insight glass-card' }, [
      UI.el('div', { class: 'ins-glow' }),
      UI.el('div', { class: 'ins-kicker' }, [UI.frag(`<span style="width:15px">${Icons.get('spark')}</span>`), t('dash.topInsight')]),
      UI.el('div', { class: 'ins-body', id: 'dashInsight' }, [UI.el('div', { class: 'ins-text' }, t('app.thinking'))]),
    ]);
    setTimeout(() => {
      const body = wrap.querySelector('#dashInsight');
      if (!body) return;
      const top = window.PatternDetective ? PatternDetective.topInsight() : null;
      UI.clear(body);
      if (top && top.cause && top.effect) {
        body.appendChild(causeEffectThread(top));
        body.appendChild(UI.el('div', { class: 'ins-text', style: { marginTop: '12px' } }, top.text));
        wrap.style.cursor = 'pointer';
        wrap.onclick = () => { UI.haptic('light'); Anchor.go('patterns'); };
      } else if (top) {
        body.appendChild(UI.el('div', { class: 'ins-text' }, top.text));
        wrap.style.cursor = 'pointer';
        wrap.onclick = () => Anchor.go('patterns');
      } else {
        body.appendChild(UI.el('div', { class: 'ins-text' }, t('dash.noInsightsYet')));
      }
    }, 30);
    return wrap;
  }

  function causeEffectThread(ins) {
    const node = (key) => UI.el('div', { class: 'ce-node' }, [
      UI.el('div', { class: 'ce-emoji' }, metricEmoji(key)),
      UI.el('div', { class: 'ce-lbl' }, metricLabel(key)),
    ]);
    const connector = UI.el('div', { class: 'ce-link' }, [
      UI.el('div', { class: 'ce-flow' }),
      UI.el('div', { class: 'ce-lag' }, lagLabel(ins.lag)),
      UI.frag(`<span class="ce-arrow">${Icons.get('chevron')}</span>`),
    ]);
    return UI.el('div', { class: 'cause-thread' }, [node(ins.cause), connector, node(ins.effect)]);
  }

  function windDownCard() {
    const h = new Date().getHours();
    const evening = h >= 20 || h < 4;
    return UI.el('div', { class: 'glass-card card', style: evening ? { borderColor: 'rgba(124,156,255,0.35)' } : null }, [
      UI.el('div', { class: 'row between gap3' }, [
        UI.el('div', { class: 'grow' }, [
          UI.el('div', { class: 'b big' }, t('dash.windDownReady')),
          UI.el('div', { class: 'small soft mt1' }, t('dash.windDownSub')),
        ]),
        UI.frag(`<span style="font-size:1.6rem">🌙</span>`),
      ]),
      UI.btn(t('dash.startWindDown'), { class: evening ? 'btn-primary' : 'btn-ghost', block: true, icon: 'decompress', onClick: () => Anchor.go('decompress') }),
    ]);
  }

  function experimentCard(exp) {
    const done = exp.logs ? exp.logs.length : 0;
    return UI.card([
      UI.el('div', { class: 'eyebrow' }, t('dash.continueExp')),
      UI.el('div', { class: 'b', style: { marginTop: '4px' } }, exp.title),
      UI.el('div', { class: 'row between gap3 mt2' }, [
        UI.el('div', { class: 'confbar' }, [UI.el('i', { style: { width: Math.min(100, (done / (exp.total || 14)) * 100) + '%' } })]),
        UI.el('div', { class: 'tiny soft nowrap' }, t('exp.dayN', { n: done, total: exp.total || 14 })),
      ]),
    ], { onClick: () => Anchor.go('experiments') });
  }

  function quickLogCard() {
    const item = (icon, label, id) => UI.el('button', { class: 'col center gap2 glass-card card-tight', style: { flex: '1', borderRadius: 'var(--r-md)' }, onclick: () => Anchor.go(id) }, [
      UI.frag(`<span style="width:24px;height:24px;color:var(--a1)">${Icons.get(icon)}</span>`),
      UI.el('span', { class: 'tiny b' }, label),
    ]);
    return UI.el('div', {}, [
      UI.el('div', { class: 'eyebrow', style: { margin: '0 4px 8px' } }, t('dash.quickLog')),
      UI.el('div', { class: 'row gap2' }, [
        item('checkin', t('dash.logMood'), 'checkin'),
        item('energy', t('dash.logEnergy'), 'energy'),
        item('journal', t('dash.logJournal'), 'journal'),
        item('lab', t('dash.logExperiment'), 'experiments'),
      ]),
    ]);
  }

  function valuesCard() {
    const vals = Store.values.all();
    if (!vals.length) return UI.el('div');
    const todayCheck = Store.valuesChecks.all().find(c => c.date === Store.today());
    const lived = todayCheck ? new Set(todayCheck.lived) : new Set();
    return UI.card([
      UI.el('div', { class: 'row between' }, [
        UI.el('div', { class: 'eyebrow' }, t('dash.valuesToday')),
        UI.el('button', { class: 'tiny care-link', onclick: () => Anchor.go('values') }, t('app.seeAll')),
      ]),
      UI.el('div', { class: 'row wrap gap2 mt2' }, vals.slice(0, 6).map(v =>
        UI.el('span', { class: 'chip' + (lived.has(v.id) ? ' active' : ''), style: { fontSize: '0.8rem' } }, (lived.has(v.id) ? '✓ ' : '') + v.name)
      )),
    ], { onClick: () => Anchor.go('values') });
  }

  // ---- VALUES DRIFT NUDGE: catch a value falling behind its weekly target ---
  // Anchor's whole second conviction is "meaning beats mood" — so when one of
  // your chosen values is quietly slipping behind the pace YOU set for it, the
  // home screen says so, kindly, with one concrete way to live it today. Only
  // shows the single value furthest behind, and only once the week is underway,
  // so it nudges without nagging.
  function weeklyLivedCount(vid) {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const dk = Store.daysAgoKey(i);
      const c = Store.valuesChecks.all().find(x => x.date === dk);
      if (c && c.lived && c.lived.indexOf(vid) !== -1) n++;
    }
    return n;
  }
  function valueDriftCard() {
    const vals = Store.values.all();
    if (!vals.length) return null;
    // need at least a couple of compass-check days before judging "behind"
    if (Store.valuesChecks.count() < 2) return null;
    const dow = new Date().getDay();                 // 0 Sun … 6 Sat
    const weekFrac = (dow === 0 ? 7 : dow) / 7;       // how far into the week we are
    let worst = null;
    vals.forEach(v => {
      const target = v.target || 4;
      const lived = weeklyLivedCount(v.id);
      const expected = target * weekFrac;             // pace you'd be at if on track
      const gap = expected - lived;
      if (lived < target && gap >= 1 && (!worst || gap > worst.gap)) worst = { v, target, lived, gap };
    });
    if (!worst) return null;
    return UI.el('div', { class: 'glass-card card', style: { borderColor: 'rgba(255,210,122,0.32)' } }, [
      UI.el('div', { class: 'row between gap3' }, [
        UI.el('div', { class: 'grow' }, [
          UI.el('div', { class: 'eyebrow', style: { color: 'var(--a5)' } }, '🧭 ' + t('dash.driftEyebrow')),
          UI.el('div', { class: 'b', style: { marginTop: '2px' } }, t('dash.driftTitle', { value: worst.v.name })),
          UI.el('div', { class: 'small soft mt1', style: { lineHeight: '1.45' } },
            t('dash.driftSub', { lived: worst.lived, target: worst.target, value: worst.v.name })),
        ]),
        UI.el('div', { style: { flexShrink: '0' } }, [
          UI.frag(UI.ring(worst.lived, worst.target, { size: 52, stroke: 6, text: worst.lived + '/' + worst.target, textSize: '0.78rem', color: ['var(--a5)', 'var(--a1)'] })),
        ]),
      ]),
      UI.el('div', { class: 'row gap2 mt3' }, [
        UI.btn(t('dash.driftCta'), { class: 'btn-primary btn-sm grow', onClick: () => { UI.haptic('light'); Anchor.go('values'); } }),
      ]),
    ]);
  }

  // ---- ENERGY BAR (vitality from rest + movement, tied to mental health) ---
  function vitalityCard() {
    // Don't show a (misleading) energy reading until there's something to base
    // it on — a fresh user should only see the questions, not a fake "low".
    const hasBasis = Store.sleep.count() > 0 || (Store.activity && Store.activity.count() > 0) || Store.energy.count() > 0;
    if (!hasBasis) return null;
    const v = Store.derive.vitality();
    const color = v.band === 'high' ? 'var(--good)' : v.band === 'low' ? 'var(--bad)' : 'var(--warn)';
    const stateLabel = t('vit.' + v.band);

    const bar = UI.el('div', { style: { height: '14px', borderRadius: '999px', background: 'rgba(255,255,255,0.10)', overflow: 'hidden', marginTop: '10px' } }, [
      UI.el('div', { style: {
        width: v.score + '%', height: '100%', borderRadius: '999px',
        background: 'linear-gradient(90deg, var(--a4), ' + color + ')',
        boxShadow: '0 0 12px -2px ' + color, transition: 'width 0.8s var(--ease-out)',
      } }),
    ]);

    const advice = UI.el('div', { class: 'small soft', style: { marginTop: '12px', lineHeight: '1.5' } }, [
      UI.el('span', {}, t('vit.' + v.read) + ' '),
      v.band !== 'high' ? UI.el('span', { class: 'b', style: { color: 'var(--ink)' } }, t('vit.' + v.lever)) : null,
    ]);
    // optional read-aloud, inline at the end of the advice (no circle, no overlap)
    if (window.Speech && Speech.ttsSupported() && Store.get('settings.tts', true) !== false && v.band !== 'high') {
      const rb = Speech.readButton(() => t('vit.' + v.read) + ' ' + t('vit.' + v.lever));
      if (rb) { rb.style.verticalAlign = 'middle'; rb.style.marginLeft = '2px'; advice.appendChild(rb); }
    }

    // activity quick-log
    const logRow = UI.el('div', { class: 'row wrap gap2', style: { marginTop: '12px' } });
    [['light', 1], ['moderate', 2], ['intense', 3]].forEach(([lvl, n]) => {
      logRow.appendChild(UI.el('button', { class: 'chip', onclick: () => {
        Store.activity.add({ kind: 'move', level: n, label: t('vit.' + lvl) });
        UI.haptic('success'); UI.toast(t('vit.loggedMove'), 'good'); Anchor.refresh();
      } }, '🏃 ' + t('vit.' + lvl)));
    });
    logRow.appendChild(UI.el('button', { class: 'chip', onclick: () => {
      Store.activity.add({ kind: 'rest', level: 2, label: t('vit.rest') });
      UI.haptic('light'); UI.toast(t('vit.loggedRest'), 'good'); Anchor.refresh();
    } }, '🧘 ' + t('vit.rest')));

    const head = UI.el('div', { class: 'row between', style: { alignItems: 'center' } }, [
      UI.el('div', {}, [
        UI.el('div', { class: 'eyebrow' }, t('vit.title')),
        UI.el('div', { class: 'row gap2', style: { alignItems: 'baseline', marginTop: '2px' } }, [
          UI.el('div', { class: 'big b', style: { color } }, v.score),
          UI.el('div', { class: 'small', style: { color } }, stateLabel),
        ]),
      ]),
      UI.frag('<span style="width:22px;height:22px;display:inline-flex;color:' + color + '">' + Icons.get('energy') + '</span>'),
    ]);

    return UI.card([head, bar, advice, logRow]);
  }

  // ---- DAILY SLEEP PROMPT (when tracking = "ask" and no night logged today) -
  function sleepPromptCard() {
    if (Store.get('settings.sleepTracking', 'ask') !== 'ask') return null;
    const today = Store.today();
    if (Store.sleep.all().some(s => s.date === today)) return null;
    if (Store.get('session.sleepPromptSkipped') === today) return null;
    const h = new Date().getHours();
    if (h >= 14) return null;   // only nudge in the morning/early afternoon

    let quality = 3, hours = 7.5;
    const qLabels = [t('slp.rough'), t('slp.okay'), t('slp.solid'), t('slp.great')];
    const qOut = UI.el('div', { class: 'b', style: { color: 'var(--a1)' } }, qLabels[quality - 1]);
    const qSlider = UI.el('input', { class: 'range', type: 'range', min: 1, max: 4, step: 1, value: quality,
      oninput: (e) => { quality = +e.target.value; qOut.textContent = qLabels[quality - 1]; UI.haptic('light'); } });
    const hOut = UI.el('div', { class: 'b' }, hours + 'h');
    const hSlider = UI.el('input', { class: 'range', type: 'range', min: 3, max: 12, step: 0.5, value: hours,
      oninput: (e) => { hours = +e.target.value; hOut.textContent = hours + 'h'; } });

    return UI.card([
      UI.el('div', { class: 'row between', style: { alignItems: 'center' } }, [
        UI.el('div', {}, [UI.el('div', { class: 'b big' }, t('slp.morningTitle')), UI.el('div', { class: 'small soft mt1' }, t('slp.morningSub'))]),
        UI.frag('<span style="font-size:1.6rem">🌙</span>'),
      ]),
      UI.el('div', { class: 'row between', style: { marginTop: '14px', marginBottom: '4px' } }, [UI.el('div', { class: 'small soft' }, t('slp.quality')), qOut]),
      qSlider,
      UI.el('div', { class: 'row between', style: { marginTop: '12px', marginBottom: '4px' } }, [UI.el('div', { class: 'small soft' }, t('slp.hours')), hOut]),
      hSlider,
      UI.el('div', { class: 'row gap2', style: { marginTop: '16px' } }, [
        UI.btn(t('slp.save'), { class: 'btn-primary grow', onClick: () => {
          const score = Math.round(40 + quality * 12 + Math.max(0, 9 - Math.abs(hours - 8)) * 2);
          Store.sleep.add({ date: today, durationMin: Math.round(hours * 60), restful: quality * 2.5, score: Math.min(100, score), source: 'manual' });
          UI.haptic('success'); UI.toast(t('app.saved'), 'good'); Anchor.refresh();
        } }),
        UI.btn(t('slp.skip'), { class: 'btn-ghost', onClick: () => { Store.set('session.sleepPromptSkipped', today); Anchor.refresh(); } }),
      ]),
    ]);
  }

  // =========================================================================
  // AI BRIEFING — the API, visibly at work. Summarizes the user's sleep, mood,
  // energy, the latest pattern, their values and the tasks they set down at
  // wind-down into a short morning briefing + today's focus. Cached per day.
  // =========================================================================
  let _briefingInFlight = false;

  function aiBriefingCard() {
    const card = UI.card([]);
    const cache = Store.get('session.briefing', null);
    if (cache && cache.date === Store.today() && cache.data) paintBriefing(card, cache.data);
    else if (Store.derive.historyDays() >= 1 && window.LLM && LLM.configured()) generateBriefing(card);
    else paintBriefingEmpty(card);
    return card;
  }

  // The whole briefing uses ONE consistent vertical rhythm: blocks are separated
  // by var(--s4), the focus list rows by var(--s2). No mixed mt2/mt3 stacking.
  function briefHeader(rightEl) {
    // NOTE: .ins-kicker is CSS-scoped to .insight; this card isn't one, so the
    // kicker is styled inline here (row, gap, accent, uppercase eyebrow).
    return UI.el('div', { class: 'row between', style: { alignItems: 'center', gap: 'var(--s2)' } }, [
      UI.el('div', { class: 'row', style: {
        gap: '7px', alignItems: 'center', minWidth: '0',
        color: 'var(--a1)', fontWeight: '700', fontSize: '0.74rem',
        textTransform: 'uppercase', letterSpacing: '0.1em',
      } }, [
        UI.frag('<span style="width:15px;height:15px;display:inline-flex;flex:0 0 auto">' + Icons.get('spark') + '</span>'),
        UI.el('span', {}, t('brief.title')),
        UI.el('span', { class: 'badge calm', style: { marginLeft: '4px', flex: '0 0 auto' } }, t('brief.tag')),
      ]),
      rightEl || null,
    ]);
  }

  function briefRefreshBtn(card) {
    return UI.el('button', { class: 'icon-btn', style: { width: '34px', height: '34px', fontSize: '1.05rem', lineHeight: '1', flex: '0 0 auto' }, 'aria-label': t('brief.refresh'),
      onclick: (e) => { e.stopPropagation(); Store.set('session.briefing', null); generateBriefing(card); } }, '⟳');
  }

  function paintBriefingEmpty(card) {
    UI.clear(card);
    card.appendChild(briefHeader());
    card.appendChild(UI.el('p', { class: 'small soft', style: { marginTop: 'var(--s3)', lineHeight: '1.5' } }, t('brief.empty')));
  }

  async function generateBriefing(card) {
    if (_briefingInFlight) return;
    _briefingInFlight = true;
    UI.clear(card);
    card.appendChild(briefHeader());
    card.appendChild(UI.el('div', { class: 'row', style: { gap: 'var(--s2)', alignItems: 'center', marginTop: 'var(--s3)' } }, [UI.thinking(), UI.el('span', { class: 'small soft' }, t('brief.generating'))]));
    if (UI.startHum) UI.startHum();   // faint haptic "hum" while the AI thinks
    try {
      const data = await LLM.json(briefingPrompt(briefingContext()), { lang: Store.get('settings.lang'), temperature: 0.6 });
      Store.set('session.briefing', { date: Store.today(), data });
      paintBriefing(card, data);
    } catch (e) {
      UI.clear(card);
      card.appendChild(briefHeader());
      card.appendChild(UI.el('button', { class: 'small', style: { color: 'var(--a1)', marginTop: 'var(--s3)' }, onclick: () => generateBriefing(card) }, t('brief.failed')));
    } finally { _briefingInFlight = false; if (UI.stopHum) UI.stopHum(); }
  }

  function paintBriefing(card, data) {
    UI.clear(card);
    card.appendChild(briefHeader(briefRefreshBtn(card)));
    card.appendChild(UI.el('p', { class: 'soft', style: { marginTop: 'var(--s3)', lineHeight: '1.6' } }, data.summary || ''));
    const focus = (data.focus || []).slice(0, 3);
    if (focus.length) {
      card.appendChild(UI.el('div', { class: 'eyebrow', style: { marginTop: 'var(--s4)', marginBottom: 'var(--s2)' } }, t('brief.focus')));
      const list = UI.el('div', { class: 'col', style: { gap: 'var(--s2)' } });
      focus.forEach(f => list.appendChild(focusRow(String(f))));
      card.appendChild(list);
    }
    if (data.closing) card.appendChild(UI.el('p', { class: 'small soft', style: { marginTop: 'var(--s4)', lineHeight: '1.5', fontStyle: 'italic' } }, data.closing));
    const footRow = UI.el('div', { class: 'row', style: { alignItems: 'center', gap: 'var(--s2)' } }, [
      UI.el('div', { class: 'tiny muted', style: { flex: '1 1 auto' } }, '✨ ' + t('brief.poweredBy')),
    ]);
    if (window.Speech && Speech.ttsSupported() && Store.get('settings.tts', true) !== false) {
      const rb = Speech.readButton(() => [data.summary].concat(data.focus || [], data.closing || []).filter(Boolean).join('. '));
      if (rb) footRow.appendChild(rb);
    }
    card.appendChild(UI.el('div', { style: { marginTop: 'var(--s4)', paddingTop: 'var(--s3)', borderTop: '1px solid var(--glass-stroke-soft)' } }, [footRow]));
  }

  function focusRow(text) {
    const row = UI.el('button', { class: 'tap', style: {
      display: 'flex', alignItems: 'center', gap: 'var(--s3)', width: '100%', textAlign: 'left',
      padding: '11px 13px', borderRadius: 'var(--r-md)',
      background: 'var(--glass-bg-faint)', border: '1px solid var(--glass-stroke-soft)',
    } }, [
      UI.frag('<span style="width:22px;height:22px;display:inline-flex;flex:0 0 auto;color:var(--a1)">' + Icons.get('target') + '</span>'),
      UI.el('div', { class: 'small', style: { flex: '1 1 auto', lineHeight: '1.4', minWidth: '0' } }, text),
      UI.frag('<span style="width:18px;height:18px;display:inline-flex;flex:0 0 auto;color:var(--ink-ghost)">' + Icons.get('check') + '</span>'),
    ]);
    row.onclick = () => { row.style.opacity = '0.5'; row.style.textDecoration = 'line-through'; UI.haptic('success'); UI.toast(t('brief.doneTask'), 'good'); };
    return row;
  }

  function briefingContext() {
    const s = Store.derive.lastSleep();
    const m = Store.derive.dayMood(Store.today()) || Store.derive.dayMood(Store.daysAgoKey(1));
    const e = Store.derive.energyToday();
    const top = window.PatternDetective ? PatternDetective.topInsight() : null;
    const dec = Store.decompress.all().slice(-1)[0];
    // the most recent thing they actually wrote — so the briefing can reflect
    // their OWN words back, which is what makes it feel irreplaceably theirs.
    const lastJ = Store.journal.all().filter(j => j.text && j.text.trim()).slice(-1)[0];
    let lastJournal = null;
    if (lastJ) {
      const txt = lastJ.text.trim().replace(/\s+/g, ' ');
      lastJournal = { when: UI.fmt.rel(lastJ.date), text: txt.length > 240 ? txt.slice(0, 240) + '…' : txt };
    }
    return {
      name: Store.profile.name(), sleep: s, mood: m, energy: e,
      insight: top && top.text, tasks: (dec && dec.buckets && dec.buckets.act) || [],
      values: Store.values.all().map(v => v.name), streak: Store.streak(),
      lastJournal,
    };
  }

  function briefingPrompt(c) {
    return 'You are giving ' + c.name + ' a short morning briefing. Recent data:\n' +
      '- Last night sleep: ' + (c.sleep ? (Math.round((c.sleep.durationMin || 0) / 60) + 'h, score ' + c.sleep.score + ', room ' + Math.round(c.sleep.tempF) + '°F') : 'no data') + '\n' +
      '- Recent mood: ' + (c.mood ? ('valence ' + c.mood.valence.toFixed(1) + ' (' + c.mood.weather + ')') : 'no data') + '\n' +
      '- Energy balance today: ' + (c.energy.count ? ((c.energy.net > 0 ? '+' : '') + c.energy.net) : 'not logged') + '\n' +
      '- Streak: ' + c.streak + ' days\n' +
      '- Pattern Anchor noticed: ' + (c.insight || 'none yet') + '\n' +
      '- Their values: ' + (c.values.join(', ') || 'unset') + '\n' +
      '- Tasks they set down last night to act on: ' + (c.tasks.length ? c.tasks.join('; ') : 'none') + '\n' +
      (c.lastJournal ? '- The last thing they journaled (' + c.lastJournal.when + '): "' + c.lastJournal.text + '"\n' : '') +
      '\n' +
      'Write a warm, concise, NON-clinical morning briefing as JSON ONLY. ' +
      (c.lastJournal ? 'In the summary, gently echo back ONE short phrase or theme from what they journaled (quote 2-5 of their own words) and connect it to today — this should feel personal, like you actually read it. Never be clinical about it.\n' : '\n') +
      '{ "summary": "<2-3 sentences reflecting how they are doing and what today might hold, grounded in the data>",\n' +
      '  "focus": ["<up to 3 small concrete focuses/tasks for today — fold in their set-down tasks and values>"],\n' +
      '  "closing": "<one short encouraging line>" }';
  }

  // =========================================================================
  // SHARE CARD — "today at a glance". Renders a beautiful, on-brand image card
  // (weather + vitality ring + streak + one AI line) entirely on a canvas, then
  // offers the native share sheet (with a graceful download fallback on web).
  // Reuses data Anchor already has — no new tracking, just a shareable moment.
  // =========================================================================
  function cssVar(name, fallback) {
    try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; }
    catch (e) { return fallback; }
  }
  function shareLine() {
    const brief = Store.get('session.briefing', null);
    if (brief && brief.data && brief.data.closing) return brief.data.closing;
    if (brief && brief.data && brief.data.summary) return brief.data.summary;
    const top = window.PatternDetective ? PatternDetective.topInsight() : null;
    if (top && top.text) return top.text;
    return t('share.defaultLine');
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function wrapText(ctx, text, maxW) {
    const words = String(text).split(/\s+/); const lines = []; let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function buildShareCanvas() {
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const a1 = cssVar('--a1', '#7c9cff'), a2 = cssVar('--a2', '#9d7cff'), a3 = cssVar('--a3', '#5fe0c8');
    const bg0 = cssVar('--bg-0', '#05060f'), bg1 = cssVar('--bg-1', '#0b0e1d');

    // background
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, bg1); g.addColorStop(1, bg0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // accent glow top-right
    const glow = ctx.createRadialGradient(W * 0.85, H * 0.08, 0, W * 0.85, H * 0.08, W * 0.8);
    glow.addColorStop(0, a1 + '55'); glow.addColorStop(1, a1 + '00');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

    const M = 96;
    // wordmark + date
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff'; ctx.font = '700 46px ui-serif, Georgia, serif';
    ctx.fillText('⚓ Anchor', M, 150);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '500 32px system-ui, sans-serif';
    ctx.fillText(UI.fmt.date(Store.today(), { weekday: 'long', month: 'long', day: 'numeric' }), M, 200);

    // weather
    const wx = Store.derive.todayWeather() || 'cloud';
    ctx.font = '160px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(UI.weatherEmoji(wx), W / 2, 470);
    ctx.fillStyle = '#fff'; ctx.font = '600 52px system-ui, sans-serif';
    ctx.fillText(UI.weatherName(wx), W / 2, 560);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '500 30px system-ui, sans-serif';
    ctx.fillText(t('dash.todayWeather'), W / 2, 605);

    // vitality ring
    const v = Store.derive.vitality();
    const cx = W / 2, cy = 800, R = 130, sw = 22;
    ctx.lineWidth = sw; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    const grd = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    grd.addColorStop(0, a3); grd.addColorStop(1, a1);
    ctx.strokeStyle = grd;
    ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, v.score / 100)); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '700 86px system-ui, sans-serif';
    ctx.fillText(String(v.score), cx, cy + 14);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '600 28px system-ui, sans-serif';
    ctx.fillText(t('vit.title').toUpperCase(), cx, cy + 64);

    // streak + level chips
    const lvl = (window.Gamify && Gamify.progress()) || { level: 1, name: '' };
    ctx.font = '600 34px system-ui, sans-serif';
    const chips = [];
    if (Store.streak() > 0) chips.push('🔥 ' + t('dash.streak', { n: Store.streak() }));
    if (lvl.name) chips.push('✨ ' + lvl.name);
    let chipY = 1010;
    ctx.textAlign = 'center';
    // draw chips as a centered row of pills
    const gap = 28; const padX = 34, chH = 64;
    const widths = chips.map(s => ctx.measureText(s).width + padX * 2);
    let totalW = widths.reduce((s, w) => s + w, 0) + gap * (chips.length - 1);
    let cxr = W / 2 - totalW / 2;
    chips.forEach((s, i) => {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      roundRect(ctx, cxr, chipY - chH + 14, widths[i], chH, 32); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
      ctx.fillText(s, cxr + padX, chipY);
      cxr += widths[i] + gap;
      ctx.textAlign = 'center';
    });

    // the one line
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.font = 'italic 500 40px ui-serif, Georgia, serif';
    ctx.textAlign = 'center';
    const lines = wrapText(ctx, '“' + shareLine() + '”', W - M * 2).slice(0, 3);
    let ly = 1150;
    lines.forEach(ln => { ctx.fillText(ln, W / 2, ly); ly += 56; });

    // footer
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '500 28px system-ui, sans-serif';
    ctx.fillText(t('share.footer'), W / 2, H - 70);
    ctx.textAlign = 'left';
    return c;
  }

  async function doShareImage(canvas) {
    const text = t('share.text', { line: shareLine() });
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png', 0.95));
    if (!blob) { Native.share && Native.share(text); return; }
    try {
      const file = new File([blob], 'anchor-today.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, title: 'Anchor' });
        UI.haptic('success'); return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    // fallback: download the PNG so the moment is still saved/shareable
    try {
      const url = URL.createObjectURL(blob);
      const a = UI.el('a', { href: url, download: 'anchor-today.png' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      UI.toast(t('share.saved'), 'good'); UI.haptic('success');
    } catch (e) { Native.share && Native.share(text); }
  }

  function shareToday() {
    UI.haptic('light');
    let canvas;
    try { canvas = buildShareCanvas(); } catch (e) { Native.share && Native.share(t('share.text', { line: shareLine() })); return; }
    const img = UI.el('img', { class: 'share-preview', src: canvas.toDataURL('image/png'), alt: 'Anchor — today' });
    let m;
    const closeBtn = UI.el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { if (m) m.close(); } }, t('app.close'));
    const shareBtn = UI.el('button', { class: 'btn btn-primary btn-sm', onclick: () => { if (m) m.close(); doShareImage(canvas); } }, t('app.share'));
    m = UI.modal({
      title: null,
      body: UI.el('div', { class: 'col gap3', style: { textAlign: 'center' } }, [
        UI.el('div', { class: 'eyebrow' }, t('dash.shareToday')),
        img,
      ]),
      actions: [closeBtn, shareBtn],
    });
  }

  Anchor.register({ id: 'home', labelKey: 'nav.home', icon: 'home', order: 10, tab: true, render });
})();
