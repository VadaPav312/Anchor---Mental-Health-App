// ===========================================================================
// progress.js — AI progress tracking. Aggregates your data over a Week / Month
// / Year and asks the live AI to reflect back how you're trending, what's
// improving, and one thing to focus on. Surfaced as a tab inside "Journey".
// ===========================================================================
(function () {
  const PERIODS = [
    { id: 'week',  days: 7,   labelKey: 'prog.week' },
    { id: 'month', days: 30,  labelKey: 'prog.month' },
    { id: 'year',  days: 365, labelKey: 'prog.year' },
  ];
  let _period = 'week';
  let _inFlight = false;

  function avg(arr) { const v = arr.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }

  function aggregate(days) {
    const sleep = Store.derive.series('sleepScore', days).map(p => p.value);
    const mood = Store.derive.series('valence', days).map(p => p.value);
    const energyNet = Store.derive.series('energyNet', days).map(p => p.value);
    const checkins = Store.moods.all().filter(m => Store.diffDays(Store.today(), m.date) < days).length;
    const journals = Store.journal.all().filter(j => Store.diffDays(Store.today(), j.date) < days).length;
    const nights = Store.sleep.all().filter(s => Store.diffDays(Store.today(), s.date) < days).length;
    const vit = Store.derive.vitality();
    // first vs second half trend on mood
    const half = Math.floor(mood.length / 2);
    const early = avg(mood.slice(0, half)), late = avg(mood.slice(half));
    const trend = (early == null || late == null) ? 0 : late - early;
    return {
      avgSleep: avg(sleep), avgMood: avg(mood), avgEnergy: avg(energyNet),
      checkins, journals, nights, streak: Store.streak(), vitality: vit.score, trend,
    };
  }

  function render(root) {
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('h1', { class: 'page-title serif' }, t('prog.title')),
      UI.el('div', { class: 'eyebrow', style: { marginTop: '4px' } }, t('prog.sub')),
    ]));

    const col = UI.el('div', { class: 'col gap4 stagger' });
    root.appendChild(col);

    col.appendChild(UI.el('div', {}, [
      UI.segmented(PERIODS.map(p => ({ value: p.id, label: t(p.labelKey) })), _period, (v) => { _period = v; Anchor.refresh(); }),
    ]));

    const period = PERIODS.find(p => p.id === _period) || PERIODS[0];
    const stats = aggregate(period.days);

    // headline numbers
    col.appendChild(UI.el('div', { class: 'tiles three' }, [
      UI.tile(stats.avgSleep != null ? Math.round(stats.avgSleep) : '—', t('prog.avgSleep'), null, { grad: true }),
      UI.tile(stats.checkins, t('prog.checkins')),
      UI.tile(stats.vitality, t('prog.vitality')),
    ]));

    // trend chip
    const tr = stats.trend;
    const trendBadge = UI.el('span', { class: 'badge ' + (tr > 0.15 ? 'good' : tr < -0.15 ? 'warn' : 'calm') },
      (tr > 0.15 ? '↗ ' + t('prog.improving') : tr < -0.15 ? '↘ ' + t('prog.dipping') : '→ ' + t('prog.steady')));
    col.appendChild(UI.el('div', { class: 'row', style: { gap: 'var(--s2)', justifyContent: 'center' } }, [trendBadge]));

    // AI narrative card
    const aiCard = UI.card([]);
    col.appendChild(aiCard);
    const cacheKey = 'session.progress.' + _period;
    const cache = Store.get(cacheKey, null);
    if (cache && cache.date === Store.today() && cache.data) paintNarrative(aiCard, cache.data, stats);
    else if (window.LLM && LLM.configured() && (stats.checkins > 0 || stats.nights > 0)) generate(aiCard, period, stats, cacheKey);
    else paintEmpty(aiCard, stats);
  }

  function header(right) {
    return UI.el('div', { class: 'row between', style: { alignItems: 'center' } }, [
      UI.el('div', { class: 'row', style: { gap: '7px', alignItems: 'center', color: 'var(--a1)', fontWeight: '700', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.1em' } }, [
        UI.frag('<span style="width:15px;height:15px;display:inline-flex">' + Icons.get('spark') + '</span>'),
        UI.el('span', {}, t('prog.aiTitle')),
        UI.el('span', { class: 'badge calm', style: { marginLeft: '4px' } }, t('brief.tag')),
      ]),
      right || null,
    ]);
  }

  function paintEmpty(card, stats) {
    UI.clear(card);
    card.appendChild(header());
    card.appendChild(UI.el('p', { class: 'small soft', style: { marginTop: 'var(--s3)', lineHeight: '1.5' } },
      (window.LLM && LLM.configured()) ? t('prog.needData') : t('prog.needKey')));
  }

  async function generate(card, period, stats, cacheKey) {
    if (_inFlight) return; _inFlight = true;
    UI.clear(card);
    card.appendChild(header());
    card.appendChild(UI.el('div', { class: 'row', style: { gap: 'var(--s2)', alignItems: 'center', marginTop: 'var(--s3)' } }, [UI.thinking(), UI.el('span', { class: 'small soft' }, t('prog.thinking'))]));
    if (UI.startHum) UI.startHum();
    try {
      const data = await LLM.json(prompt(period, stats), { lang: Store.get('settings.lang'), temperature: 0.6 });
      Store.set(cacheKey, { date: Store.today(), data });
      paintNarrative(card, data, stats);
    } catch (e) {
      UI.clear(card); card.appendChild(header());
      card.appendChild(UI.el('button', { class: 'small', style: { color: 'var(--a1)', marginTop: 'var(--s3)' }, onclick: () => { _inFlight = false; generate(card, period, stats, cacheKey); } }, t('brief.failed')));
    } finally { _inFlight = false; if (UI.stopHum) UI.stopHum(); }
  }

  function paintNarrative(card, data, stats) {
    UI.clear(card);
    const refresh = UI.el('button', { class: 'icon-btn', style: { width: '34px', height: '34px', fontSize: '1.05rem', lineHeight: '1' }, 'aria-label': t('brief.refresh'),
      onclick: () => { Store.set('session.progress.' + _period, null); Anchor.refresh(); } }, '⟳');
    card.appendChild(header(refresh));
    card.appendChild(UI.el('p', { class: 'soft', style: { marginTop: 'var(--s3)', lineHeight: '1.6' } }, data.summary || ''));
    if (data.win) {
      card.appendChild(UI.el('div', { style: { marginTop: 'var(--s4)', padding: 'var(--s3) var(--s4)', borderRadius: 'var(--r-md)', background: 'rgba(var(--a3-rgb),0.12)', border: '1px solid rgba(var(--a3-rgb),0.28)' } }, [
        UI.el('div', { class: 'tiny b', style: { color: 'var(--good)', textTransform: 'uppercase', letterSpacing: '0.08em' } }, t('prog.win')),
        UI.el('div', { class: 'small', style: { marginTop: '4px', lineHeight: '1.45' } }, data.win),
      ]));
    }
    if (data.focus) {
      card.appendChild(UI.el('div', { style: { marginTop: 'var(--s3)', padding: 'var(--s3) var(--s4)', borderRadius: 'var(--r-md)', background: 'var(--glass-bg-faint)', border: '1px solid var(--glass-stroke-soft)' } }, [
        UI.el('div', { class: 'tiny b', style: { color: 'var(--a1)', textTransform: 'uppercase', letterSpacing: '0.08em' } }, t('prog.focus')),
        UI.el('div', { class: 'small', style: { marginTop: '4px', lineHeight: '1.45' } }, data.focus),
      ]));
    }
    const row = UI.el('div', { class: 'row', style: { gap: 'var(--s2)', marginTop: 'var(--s4)', alignItems: 'center' } }, [
      UI.el('div', { class: 'tiny muted', style: { flex: '1 1 auto' } }, '✨ ' + t('brief.poweredBy')),
    ]);
    if (window.Speech && Speech.ttsSupported()) {
      const rb = Speech.readButton(() => [data.summary, data.win, data.focus].filter(Boolean).join('. '));
      if (rb) row.appendChild(rb);
    }
    card.appendChild(UI.el('div', { style: { marginTop: 'var(--s2)', paddingTop: 'var(--s3)', borderTop: '1px solid var(--glass-stroke-soft)' } }, [row]));
  }

  function prompt(period, s) {
    const n = (x, d) => (x == null ? 'no data' : (+x).toFixed(d == null ? 1 : d));
    return 'You are reflecting back ' + Store.profile.name() + "'s progress over the last " + period.id + '. Aggregated data:\n' +
      '- Avg sleep score: ' + n(s.avgSleep, 0) + '/100\n' +
      '- Avg mood (−2..+2): ' + n(s.avgMood) + '\n' +
      '- Mood trend (later vs earlier in period): ' + (s.trend > 0 ? '+' : '') + n(s.trend) + '\n' +
      '- Avg daily energy balance: ' + n(s.avgEnergy) + '\n' +
      '- Check-ins: ' + s.checkins + ', journal entries: ' + s.journals + ', nights logged: ' + s.nights + '\n' +
      '- Current streak: ' + s.streak + ' days, vitality now: ' + s.vitality + '/100\n\n' +
      'Write a warm, honest, NON-clinical progress reflection as JSON ONLY:\n' +
      '{ "summary": "<3-4 sentences on how this ' + period.id + ' went and the trend>",\n' +
      '  "win": "<one genuine win to celebrate, grounded in the data>",\n' +
      '  "focus": "<one concrete, gentle thing to focus on next>" }';
  }

  Anchor.register({ id: 'progress', labelKey: 'prog.title', icon: 'trend', order: 64, tab: false, render });
})();
