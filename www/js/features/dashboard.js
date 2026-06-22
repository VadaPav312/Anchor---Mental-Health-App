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
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('div', { class: 'eyebrow' }, UI.fmt.date(Store.today(), { weekday: 'long', month: 'long', day: 'numeric' })),
      UI.el('h1', { class: 'page-title serif' }, greeting()),
      Store.streak() > 1 ? UI.el('div', { class: 'small soft mt1' }, '🔥 ' + t('dash.streak', { n: Store.streak() })) : null,
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
          UI.el('div', { class: 'tiny soft' }, UI.fmt.temp(s.tempF) + ' · ' + (s.noiseDb != null ? Math.round(s.noiseDb) + 'dB' : '')),
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

  function insightCard() {
    const wrap = UI.el('div', { class: 'insight glass-card' }, [
      UI.el('div', { class: 'ins-glow' }),
      UI.el('div', { class: 'ins-kicker' }, [UI.frag(`<span style="width:15px">${Icons.get('spark')}</span>`), t('dash.topInsight')]),
      UI.el('div', { class: 'ins-text', id: 'dashInsight' }, t('app.thinking')),
    ]);
    // compute (sync, cheap) after mount
    setTimeout(() => {
      const node = wrap.querySelector('#dashInsight');
      if (!node) return;
      const top = window.PatternDetective ? PatternDetective.topInsight() : null;
      if (top) {
        node.textContent = top.text;
        wrap.style.cursor = 'pointer';
        wrap.onclick = () => Anchor.go('patterns');
      } else {
        node.textContent = t('dash.noInsightsYet');
      }
    }, 30);
    return wrap;
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
    return {
      name: Store.profile.name(), sleep: s, mood: m, energy: e,
      insight: top && top.text, tasks: (dec && dec.buckets && dec.buckets.act) || [],
      values: Store.values.all().map(v => v.name), streak: Store.streak(),
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
      '- Tasks they set down last night to act on: ' + (c.tasks.length ? c.tasks.join('; ') : 'none') + '\n\n' +
      'Write a warm, concise, NON-clinical morning briefing as JSON ONLY:\n' +
      '{ "summary": "<2-3 sentences reflecting how they are doing and what today might hold, grounded in the data>",\n' +
      '  "focus": ["<up to 3 small concrete focuses/tasks for today — fold in their set-down tasks and values>"],\n' +
      '  "closing": "<one short encouraging line>" }';
  }

  Anchor.register({ id: 'home', labelKey: 'nav.home', icon: 'home', order: 10, tab: true, render });
})();
