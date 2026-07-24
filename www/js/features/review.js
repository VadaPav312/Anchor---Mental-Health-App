// ===========================================================================
// review.js — Weekly Review. Gathers the selected week's sleep, mood, energy,
// and values data and reflects it back as a warm, honest narrative. Users can
// pick this week, last week, or an earlier week via a date picker. The LLM
// writes a short narrative reflection; stats are shown as tiles and a mood arc.
// ===========================================================================
(function () {

  // ---- week window helpers -------------------------------------------------

  // Return the Monday of the ISO week containing the given Date.
  function mondayOf(d) {
    const day = d.getDay(); // 0=Sun
    const delta = (day === 0) ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + delta);
    mon.setHours(0, 0, 0, 0);
    return mon;
  }

  // Given a Monday date, return an array of 7 Store dateKeys (Mon..Sun).
  function weekKeys(monday) {
    const keys = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      keys.push(Store.dateKey(d));
    }
    return keys;
  }

  // thisWeek's Monday date
  function thisMonday() { return mondayOf(new Date()); }

  // lastWeek's Monday date
  function lastMonday() {
    const m = mondayOf(new Date());
    m.setDate(m.getDate() - 7);
    return m;
  }

  // ---- mood valence helpers ------------------------------------------------

  function valenceName(v) {
    if (v >= 1.4) return t('chk.great');
    if (v >= 0.4) return t('chk.good');
    if (v >= -0.3) return t('chk.ok');
    if (v >= -1.0) return t('chk.low');
    return t('chk.veryLow');
  }

  // ---- energy aggregation --------------------------------------------------

  function aggregateEnergy(keys) {
    // Returns { drains: {label -> total}, restores: {label -> total} }
    const drains = {};
    const restores = {};
    const allEnergy = Store.energy.all();
    allEnergy.forEach(e => {
      if (!keys.includes(e.date)) return;
      const bucket = e.kind === 'spend' ? drains : restores;
      const lbl = e.label || t('app.none');
      bucket[lbl] = (bucket[lbl] || 0) + (e.amount || 1);
    });
    return { drains, restores };
  }

  function topEntry(obj) {
    // Returns { label, total } for the highest-total key in obj, or null.
    const entries = Object.entries(obj);
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return { label: entries[0][0], total: entries[0][1] };
  }

  // ---- sleep helpers -------------------------------------------------------

  function sleepInWindow(keys) {
    return Store.sleep.all().filter(s => keys.includes(s.date));
  }

  // ---- values helpers ------------------------------------------------------

  function mostHonoredValue(keys) {
    const checks = Store.valuesChecks.all().filter(c => keys.includes(c.date));
    if (!checks.length) return null;
    const tally = {};
    checks.forEach(c => {
      (c.lived || []).forEach(vid => { tally[vid] = (tally[vid] || 0) + 1; });
    });
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    const valObj = Store.values.byId(top[0]);
    return valObj ? valObj.name : null;
  }

  // ---- storms weathered ----------------------------------------------------

  function stormsInWindow(keys) {
    return keys.filter(dk => {
      const m = Store.derive.dayMood(dk);
      if (!m) return false;
      return m.weather === 'rain' || m.weather === 'storm';
    }).length;
  }

  // ---- stat builders -------------------------------------------------------

  function buildStats(keys) {
    const nights = sleepInWindow(keys);
    const moodDays = keys.map(dk => ({ dk, m: Store.derive.dayMood(dk) })).filter(x => x.m);
    const energy = aggregateEnergy(keys);

    // avg sleep
    const avgSleepMin = nights.length
      ? nights.reduce((s, n) => s + (n.durationMin || 0), 0) / nights.length
      : null;

    // best / roughest night by score
    let bestNight = null;
    let roughestNight = null;
    if (nights.length) {
      const sorted = nights.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
      bestNight = sorted[0];
      roughestNight = sorted[sorted.length - 1];
    }

    // mood range
    let moodLow = null;
    let moodHigh = null;
    moodDays.forEach(({ m }) => {
      if (moodLow === null || m.valence < moodLow) moodLow = m.valence;
      if (moodHigh === null || m.valence > moodHigh) moodHigh = m.valence;
    });

    // top drain / restore
    const topDrain = topEntry(energy.drains);
    const topRestore = topEntry(energy.restores);

    // most honored value
    const valueOfWeek = mostHonoredValue(keys);

    // storms weathered
    const storms = stormsInWindow(keys);

    // pattern of the week
    let patternText = null;
    if (window.PatternDetective) {
      try {
        const insight = PatternDetective.topInsight();
        if (insight && insight.text) patternText = insight.text;
      } catch (e) { /* ignore */ }
    }

    return {
      nights,
      moodDays,
      avgSleepMin,
      bestNight,
      roughestNight,
      moodLow,
      moodHigh,
      topDrain,
      topRestore,
      valueOfWeek,
      storms,
      patternText,
    };
  }

  // ---- hero mood arc -------------------------------------------------------

  function buildArc(keys) {
    const arc = UI.el('div', { class: 'rev-arc' });
    keys.forEach(dk => {
      const m = Store.derive.dayMood(dk);
      const valence = m ? m.valence : null;
      const pct = valence != null
        ? Math.round(((valence + 2) / 4) * 100)  // -2..2 -> 0..100
        : 8;
      const bar = UI.el('div', { class: 'ra' + (valence != null && valence < 0 ? ' low' : '') });
      bar.style.height = Math.max(8, pct) + '%';
      bar.title = UI.fmt.weekday(dk) + (valence != null ? ': ' + valenceName(valence) : '');
      arc.appendChild(bar);
    });
    return arc;
  }

  // ---- narrative -----------------------------------------------------------

  function buildNarrativePrompt(keys, stats) {
    const { avgSleepMin, moodLow, moodHigh, topDrain, topRestore, valueOfWeek, storms, nights, moodDays } = stats;
    const parts = [];

    parts.push('Here is a weekly summary for the user named "' + Store.profile.name() + '".');
    parts.push('Week: ' + UI.fmt.date(keys[0]) + ' – ' + UI.fmt.date(keys[6]) + '.');

    if (moodDays.length) {
      const avgValence = moodDays.reduce((s, x) => s + x.m.valence, 0) / moodDays.length;
      parts.push('Mood: ' + moodDays.length + ' check-in days. Avg valence ' + avgValence.toFixed(2) + ' (range −2 to 2).');
      if (moodLow != null && moodHigh != null) {
        parts.push('Mood ranged from ' + valenceName(moodLow) + ' to ' + valenceName(moodHigh) + '.');
      }
    } else {
      parts.push('Mood: no check-ins this week.');
    }

    if (avgSleepMin != null) {
      parts.push('Sleep: avg ' + UI.fmt.dur(avgSleepMin) + ' per night across ' + nights.length + ' logged nights.');
    } else {
      parts.push('Sleep: no nights logged this week.');
    }

    if (topDrain) parts.push('Biggest energy drain: "' + topDrain.label + '".');
    if (topRestore) parts.push('Biggest energy restore: "' + topRestore.label + '".');
    if (valueOfWeek) parts.push('Most-honored value: "' + valueOfWeek + '".');
    if (storms > 0) parts.push('Storm/rain days this week: ' + storms + '.');

    parts.push('');
    parts.push("Please write a short (4–5 sentence) warm, honest, non-clinical weekly reflection from Anchor's perspective. Name one gentle win this person can keep. Stay curious, not prescriptive. No therapy-speak. Do not start with \"This week\" or a day name. Speak to them directly as \"you\".");

    return parts.join(' ');
  }

  function fallbackNarrative(keys, stats) {
    const { avgSleepMin, moodDays, moodHigh, valueOfWeek, storms } = stats;
    const parts = [];

    if (moodDays.length) {
      const avgVal = moodDays.reduce((s, x) => s + x.m.valence, 0) / moodDays.length;
      parts.push(t('rev.moodArc') + ': ' + valenceName(avgVal) + ' ' + t('app.days') + '.');
    }
    if (avgSleepMin != null) {
      parts.push(t('rev.avgSleep') + ': ' + UI.fmt.dur(avgSleepMin) + '.');
    }
    if (valueOfWeek) {
      parts.push(t('rev.valueOfWeek') + ': ' + valueOfWeek + '.');
    }
    if (moodHigh != null && moodHigh >= 1) {
      parts.push(t('rev.gentleWin') + ': ' + valenceName(moodHigh) + ' ' + t('app.day') + '.');
    }
    if (storms > 0) {
      parts.push(t('rev.weatheredStorms') + ': ' + storms + '.');
    }

    return parts.join(' ') || t('rev.noData');
  }

  // ---- share ---------------------------------------------------------------

  function buildShareText(keys, stats) {
    const { avgSleepMin, moodDays, valueOfWeek, storms, topDrain, topRestore } = stats;
    const lines = [t('app.name') + ' — ' + t('rev.title')];
    lines.push(UI.fmt.date(keys[0]) + ' – ' + UI.fmt.date(keys[6]));
    lines.push('');
    if (moodDays.length) {
      const avgVal = moodDays.reduce((s, x) => s + x.m.valence, 0) / moodDays.length;
      lines.push(t('rev.moodArc') + ': ' + valenceName(avgVal));
    }
    if (avgSleepMin != null) lines.push(t('rev.avgSleep') + ': ' + UI.fmt.dur(avgSleepMin));
    if (topDrain) lines.push(t('rev.topDrain') + ': ' + topDrain.label);
    if (topRestore) lines.push(t('rev.topRestore') + ': ' + topRestore.label);
    if (valueOfWeek) lines.push(t('rev.valueOfWeek') + ': ' + valueOfWeek);
    if (storms > 0) lines.push(t('rev.weatheredStorms') + ': ' + storms);
    return lines.join('\n');
  }

  // ---- main render ---------------------------------------------------------

  function render(root) {
    // State
    let selectedWeek = 'this';   // 'this' | 'last' | 'pick'
    let pickDate = null;         // ISO string for custom week (Monday)

    function getMonday() {
      if (selectedWeek === 'this') return thisMonday();
      if (selectedWeek === 'last') return lastMonday();
      if (pickDate) {
        const d = new Date(pickDate);
        if (!isNaN(d.getTime())) return mondayOf(d);
      }
      return thisMonday();
    }

    // Page head
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('div', { class: 'eyebrow' }, t('rev.title')),
      UI.el('h1', { class: 'page-title serif' }, t('rev.sub')),
      UI.el('p', { class: 'small soft mt1' }, t('rev.intro')),
    ]));

    // Week selector
    const weekPickRow = UI.el('div', { class: 'col gap3' });

    const segItems = [
      { value: 'this', label: t('rev.thisWeek') },
      { value: 'last', label: t('rev.lastWeek') },
      { value: 'pick', label: t('rev.pickWeek') },
    ];

    let datePicker = null;

    const seg = UI.segmented(segItems, selectedWeek, (val) => {
      selectedWeek = val;
      if (val === 'pick') {
        // Show date input
        if (!datePicker) {
          const today = new Date();
          const fmt = (n) => n < 10 ? '0' + n : '' + n;
          const defaultVal = today.getFullYear() + '-' + fmt(today.getMonth() + 1) + '-' + fmt(today.getDate());
          datePicker = UI.el('input', {
            type: 'date',
            class: 'field-input',
            value: defaultVal,
            style: { marginTop: '8px', background: 'var(--glass-bg)', border: '1px solid var(--glass-stroke)', color: 'var(--ink)', borderRadius: 'var(--r-md)', padding: '8px 12px', fontSize: '0.9rem', width: '100%' },
          });
          datePicker.addEventListener('change', (e) => {
            pickDate = e.target.value;
            rerenderContent();
          });
          weekPickRow.appendChild(datePicker);
        }
      } else {
        if (datePicker) { datePicker.remove(); datePicker = null; }
      }
      rerenderContent();
    });

    weekPickRow.appendChild(seg);
    root.appendChild(weekPickRow);

    // Scrollable content area that re-renders when the week changes
    const contentArea = UI.el('div', { class: 'col gap4 stagger', style: { marginTop: 'var(--s5)' } });
    root.appendChild(contentArea);

    function rerenderContent() {
      UI.clear(contentArea);

      const monday = getMonday();
      const keys = weekKeys(monday);
      const stats = buildStats(keys);

      // Empty state: fewer than 2 mood days
      if (stats.moodDays.length < 2) {
        contentArea.appendChild(
          UI.empty('📋', t('rev.noData'), t('rev.noDataSub'))
        );
        return;
      }

      // ---- HERO ----
      const hero = UI.el('div', { class: 'rev-hero glass-card' });

      // Date range label
      const rangeLabel = UI.fmt.date(keys[0], { month: 'short', day: 'numeric' })
        + ' – '
        + UI.fmt.date(keys[6], { month: 'short', day: 'numeric', year: 'numeric' });
      hero.appendChild(UI.el('div', { class: 'rev-range' }, rangeLabel));

      // Weekday labels row above arc
      const dayRow = UI.el('div', { class: 'row', style: { gap: '4px', marginTop: '12px', marginBottom: '4px' } });
      keys.forEach(dk => {
        dayRow.appendChild(UI.el('div', {
          style: { flex: '1 1 0', textAlign: 'center', fontSize: '0.65rem', color: 'var(--ink-ghost)', textTransform: 'uppercase', letterSpacing: '0.04em' },
        }, UI.fmt.weekday(dk)));
      });
      hero.appendChild(dayRow);

      // Mood arc
      hero.appendChild(buildArc(keys));

      // Week headline: avg mood
      const avgValence = stats.moodDays.reduce((s, x) => s + x.m.valence, 0) / stats.moodDays.length;
      hero.appendChild(UI.el('div', {
        class: 'b',
        style: { marginTop: '14px', fontSize: '1.1rem' },
      }, valenceName(avgValence)));

      contentArea.appendChild(hero);

      // ---- STAT TILES ----
      const tilesGrid = UI.el('div', { class: 'col gap3' });

      // Row 1: avg sleep + mood range
      const row1 = UI.el('div', { class: 'tiles' });

      if (stats.avgSleepMin != null) {
        row1.appendChild(UI.tile(
          UI.fmt.dur(stats.avgSleepMin),
          t('rev.avgSleep'),
          stats.nights.length + ' ' + t('app.days').toLowerCase(),
          { grad: true }
        ));
      }

      if (stats.moodLow != null && stats.moodHigh != null) {
        row1.appendChild(UI.tile(
          valenceName(stats.moodHigh),
          t('rev.moodRange', { low: valenceName(stats.moodLow), high: valenceName(stats.moodHigh) }),
          null,
          {}
        ));
      }
      tilesGrid.appendChild(row1);

      // Row 2: best night + roughest night
      if (stats.bestNight || stats.roughestNight) {
        const row2 = UI.el('div', { class: 'tiles' });
        if (stats.bestNight) {
          row2.appendChild(UI.tile(
            UI.fmt.dur(stats.bestNight.durationMin),
            t('rev.bestNight'),
            UI.fmt.date(stats.bestNight.date),
            { color: 'var(--good)' }
          ));
        }
        if (stats.roughestNight && stats.roughestNight !== stats.bestNight) {
          row2.appendChild(UI.tile(
            UI.fmt.dur(stats.roughestNight.durationMin),
            t('rev.roughestNight'),
            UI.fmt.date(stats.roughestNight.date),
            { color: 'var(--bad)' }
          ));
        }
        tilesGrid.appendChild(row2);
      }

      contentArea.appendChild(tilesGrid);

      // ---- HIGHLIGHTS (pill-stats) ----
      const hlWrap = UI.card([
        UI.el('div', { class: 'eyebrow', style: { marginBottom: 'var(--s3)' } }, t('rev.highlights')),
        buildHighlights(stats),
      ]);
      contentArea.appendChild(hlWrap);

      // ---- NARRATIVE ----
      const narrativeCard = UI.el('div', { class: 'glass-card card' });
      narrativeCard.appendChild(UI.el('div', { class: 'row gap2', style: { marginBottom: 'var(--s3)' } }, [
        UI.frag(`<span style="width:18px;height:18px;color:var(--a1)">${Icons.get('spark')}</span>`),
        UI.el('div', { class: 'eyebrow' }, t('rev.narrative')),
      ]));
      const narrativeBody = UI.el('div', { class: 'rev-narrative' }, t('rev.writing'));
      narrativeCard.appendChild(narrativeBody);
      contentArea.appendChild(narrativeCard);

      // Fetch narrative async
      (async () => {
        try {
          const prompt = buildNarrativePrompt(keys, stats);
          const lang = Store.get('settings.lang');
          const text = await LLM.ask(prompt, { lang });
          UI.reveal(narrativeBody, text || fallbackNarrative(keys, stats));
        } catch (e) {
          UI.reveal(narrativeBody, fallbackNarrative(keys, stats));
        }
      })();

      // ---- SHARE BUTTON ----
      if (window.Native && typeof Native.share === 'function') {
        const shareText = buildShareText(keys, stats);
        contentArea.appendChild(
          UI.btn(t('rev.share'), {
            class: 'btn-ghost btn-block',
            icon: 'globe',
            block: true,
            onClick: () => {
              UI.haptic('light');
              Native.share(shareText);
            },
          })
        );
      }
    }

    // Initial render
    rerenderContent();
  }

  // ---- highlights row ------------------------------------------------------

  function buildHighlights(stats) {
    const { topDrain, topRestore, valueOfWeek, storms, patternText } = stats;
    const wrap = UI.el('div', { class: 'col gap2' });

    function hl(emoji, text) {
      if (!text) return null;
      const row = UI.el('div', { class: 'rev-highlight' });
      row.appendChild(UI.el('span', { class: 'rh-emoji' }, emoji));
      row.appendChild(UI.el('span', { class: 'small' }, text));
      return row;
    }

    const items = [
      hl('⚡', topDrain ? t('rev.topDrain') + ': ' + topDrain.label : null),
      hl('🌱', topRestore ? t('rev.topRestore') + ': ' + topRestore.label : null),
      hl('🧭', valueOfWeek ? t('rev.valueOfWeek') + ': ' + valueOfWeek : null),
      hl('⛈️', storms > 0 ? t('rev.weatheredStorms') + ': ' + storms : null),
      hl('🔍', patternText ? t('rev.patternOfWeek') + ': ' + patternText : null),
    ];

    let any = false;
    items.forEach(item => {
      if (item) { wrap.appendChild(item); any = true; }
    });

    if (!any) {
      wrap.appendChild(UI.el('div', { class: 'small soft' }, t('rev.noData')));
    }

    return wrap;
  }

  // ---- register ------------------------------------------------------------

  Anchor.register({
    id: 'review',
    labelKey: 'rev.title',
    icon: 'book',
    order: 65,
    tab: false,
    render,
  });
})();
