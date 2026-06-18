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

    const grid = UI.el('div', { class: 'col gap4 stagger' });
    root.appendChild(grid);

    // ---- gamification HUD (level + light/XP) ----
    if (window.Gamify) grid.appendChild(Gamify.hud());

    // ---- AI briefing (visibly AI: summarizes your day + wind-down tasks) ----
    grid.appendChild(aiBriefingCard());

    // ---- today's inner weather (tap -> weather map) ----
    grid.appendChild(weatherCard());

    // ---- "go outside" nudge when the real local weather is nice ----
    if (window.Weather) { const oc = Weather.outsideCard(); if (oc) grid.appendChild(oc); }

    // ---- check-in CTA if not yet today ----
    const todayMood = Store.derive.dayMood(Store.today());
    if (!todayMood) grid.appendChild(checkInCard());

    // ---- two-up: last night + energy now ----
    grid.appendChild(UI.el('div', { class: 'tiles' }, [sleepTile(), energyTile()]));

    // ---- top insight from Pattern Detective ----
    grid.appendChild(insightCard());

    // ---- wind-down nudge (stronger in the evening / when in bed) ----
    grid.appendChild(windDownCard());

    // ---- active experiment ----
    const exp = Store.derive.activeExperiment();
    if (exp) grid.appendChild(experimentCard(exp));

    // ---- quick log row ----
    grid.appendChild(quickLogCard());

    // ---- values of the day ----
    grid.appendChild(valuesCard());
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

  function briefHeader(rightEl) {
    return UI.el('div', { class: 'row between', style: { alignItems: 'center' } }, [
      UI.el('div', { class: 'ins-kicker', style: { margin: 0 } }, [
        UI.frag('<span style="width:15px">' + Icons.get('spark') + '</span>'),
        t('brief.title'),
        UI.el('span', { class: 'badge calm', style: { marginLeft: '6px' } }, t('brief.tag')),
      ]),
      rightEl || null,
    ]);
  }

  function paintBriefingEmpty(card) {
    UI.clear(card);
    card.appendChild(briefHeader());
    card.appendChild(UI.el('div', { class: 'small soft mt2' }, t('brief.empty')));
  }

  async function generateBriefing(card) {
    if (_briefingInFlight) return;
    _briefingInFlight = true;
    UI.clear(card);
    card.appendChild(briefHeader());
    card.appendChild(UI.el('div', { class: 'row gap2 mt3', style: { alignItems: 'center' } }, [UI.thinking(), UI.el('span', { class: 'small soft' }, t('brief.generating'))]));
    try {
      const data = await LLM.json(briefingPrompt(briefingContext()), { lang: Store.get('settings.lang'), temperature: 0.6 });
      Store.set('session.briefing', { date: Store.today(), data });
      paintBriefing(card, data);
    } catch (e) {
      UI.clear(card);
      card.appendChild(briefHeader());
      card.appendChild(UI.el('button', { class: 'small', style: { color: 'var(--a1)', marginTop: '10px' }, onclick: () => generateBriefing(card) }, t('brief.failed')));
    } finally { _briefingInFlight = false; }
  }

  function paintBriefing(card, data) {
    UI.clear(card);
    card.appendChild(briefHeader(UI.el('button', { class: 'icon-btn', style: { width: '32px', height: '32px', fontSize: '1rem' }, onclick: (e) => { e.stopPropagation(); Store.set('session.briefing', null); generateBriefing(card); } }, '⟳')));
    card.appendChild(UI.el('div', { class: 'mt2', style: { lineHeight: '1.55' } }, data.summary || ''));
    const focus = (data.focus || []).slice(0, 3);
    if (focus.length) {
      card.appendChild(UI.el('div', { class: 'eyebrow mt3' }, t('brief.focus')));
      const list = UI.el('div', { class: 'col gap2 mt2' });
      focus.forEach(f => list.appendChild(focusRow(String(f))));
      card.appendChild(list);
    }
    if (data.closing) card.appendChild(UI.el('div', { class: 'small soft mt3', style: { fontStyle: 'italic' } }, data.closing));
    card.appendChild(UI.el('div', { class: 'tiny muted mt2' }, '✨ ' + t('brief.poweredBy')));
  }

  function focusRow(text) {
    const row = UI.el('button', { class: 'lrow tap', style: { width: '100%', textAlign: 'left', borderRadius: 'var(--r-sm)' } }, [
      UI.frag('<span class="lr-ico" style="width:30px;height:30px;font-size:0.9rem">' + Icons.get('target') + '</span>'),
      UI.el('div', { class: 'lr-body' }, [UI.el('div', { class: 'small' }, text)]),
      UI.frag('<span style="width:18px;color:var(--ink-ghost)">' + Icons.get('check') + '</span>'),
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
