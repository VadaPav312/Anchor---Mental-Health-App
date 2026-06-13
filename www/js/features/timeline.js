// ===========================================================================
// timeline.js — "Timeline": one chronological thread through everything.
//
// Shows a unified, filterable, paginated view of all user activity: mood
// check-ins, sleep nights, journal entries, energy logs, and Anchor's
// insights. Events are grouped by day and rendered as a vertical track with
// colour-coded dots and glass-card detail cards.
//
// Registered as a non-tab feature (order 62, tab:false).
// ===========================================================================
(function () {

  // ---- constants -----------------------------------------------------------
  const PAGE_SIZE = 40;

  // Valence number (-2..2) → human-readable label using chk.* keys.
  function valenceLabel(v) {
    if (v == null) return t('chk.ok');
    if (v <= -1.5) return t('chk.veryLow');
    if (v <= -0.5) return t('chk.low');
    if (v < 0.5)   return t('chk.ok');
    if (v < 1.5)   return t('chk.good');
    return t('chk.great');
  }

  // Amount number (1-3) → short label.
  function amountLabel(n) {
    if (n <= 1) return t('en.little');
    if (n <= 2) return t('en.some');
    return t('en.a_lot');
  }

  // Truncate a string to max characters, appending ellipsis if needed.
  function truncate(str, max) {
    if (!str) return '';
    str = str.trim();
    return str.length > max ? str.slice(0, max).trimEnd() + '…' : str;
  }

  // ---- event builders ------------------------------------------------------

  // Build unified event list from all data streams.
  function buildEvents() {
    const events = [];

    // ---- moods ----
    const moods = Store.moods.all();
    moods.forEach(function (m) {
      const valence = m.valence != null ? m.valence : 0;
      const energy  = m.energy  != null ? m.energy  : 5;
      const wxCode  = Store.weatherFor(valence, energy);
      const mood    = valenceLabel(valence);
      const tags    = (m.tags && m.tags.length) ? m.tags.join(', ') : '';
      events.push({
        ts:    m.ts || 0,
        date:  m.date || '',
        type:  'mood',
        title: t('tl.moodEvent', { mood: mood }),
        sub:   tags,
        emoji: UI.weatherEmoji(wxCode),
      });
    });

    // ---- sleep ----
    const sleepRecs = Store.sleep.all();
    sleepRecs.forEach(function (s) {
      // Sleep records use inBedAt for ts; fall back to a derived ts from date.
      const ts = s.ts || (s.inBedAt ? new Date(s.inBedAt).getTime() : 0);
      const dur  = UI.fmt.dur(s.durationMin);
      const score = s.score != null ? Math.round(s.score) : null;
      const temp  = UI.fmt.temp(s.tempF);
      let sub = '';
      if (score != null) sub += t('sleep.quality') + ' ' + score;
      if (s.tempF != null) sub += (sub ? ' · ' : '') + temp;
      events.push({
        ts:    ts,
        date:  s.date || '',
        type:  'sleep',
        title: t('tl.sleepEvent', { dur: dur }),
        sub:   sub,
        emoji: '🌙',
      });
    });

    // ---- journal ----
    const journals = Store.journal.all();
    journals.forEach(function (j) {
      const wordCount = j.text ? j.text.trim().split(/\s+/).filter(Boolean).length : 0;
      const excerpt   = truncate(j.text, 80);
      events.push({
        ts:    j.ts || 0,
        date:  j.date || '',
        type:  'journal',
        title: t('tl.journalEvent', { n: wordCount }),
        sub:   excerpt,
        emoji: '📓',
      });
    });

    // ---- energy ----
    const energyRecs = Store.energy.all();
    energyRecs.forEach(function (e) {
      const isSpend   = e.kind === 'spend';
      const titleKey  = isSpend ? 'tl.energySpend' : 'tl.energyRestore';
      const label     = e.label || amountLabel(e.amount);
      const catLabel  = e.category ? t('en.cats.' + e.category, {}) || e.category : '';
      const amtLabel  = amountLabel(e.amount);
      let sub = catLabel;
      if (amtLabel) sub += (sub ? ' · ' : '') + amtLabel;
      events.push({
        ts:    e.ts || 0,
        date:  e.date || '',
        type:  'energy',
        title: t(titleKey, { label: label }),
        sub:   sub,
        emoji: isSpend ? '🔋' : '⚡',
      });
    });

    // ---- insights (non-dismissed only) ----
    const insights = Store.insights.all();
    insights.forEach(function (ins) {
      if (ins.dismissed) return;
      const sub = truncate(ins.text, 100);
      events.push({
        ts:    ins.ts || 0,
        date:  ins.date || Store.dateKey(new Date(ins.ts || Date.now())),
        type:  'insight',
        title: t('tl.insightEvent'),
        sub:   sub,
        emoji: '✦',
      });
    });

    // Sort descending by timestamp.
    events.sort(function (a, b) { return b.ts - a.ts; });

    return events;
  }

  // ---- rendering -----------------------------------------------------------

  // Render a single timeline item (.tl-item.<type>).
  function renderItem(ev) {
    const timeStr = ev.ts ? UI.fmt.time(ev.ts) : '';

    const dot  = UI.el('div', { class: 'tl-dot' });

    const timeEl = UI.el('div', { class: 'tl-time' }, timeStr);

    const titleRow = UI.el('div', { class: 'row gap2', style: { alignItems: 'center', marginTop: '2px' } }, [
      UI.el('span', { style: { fontSize: '1.1rem', lineHeight: '1', flexShrink: '0' } }, ev.emoji),
      UI.el('div', { class: 'b', style: { fontSize: '0.92rem' } }, ev.title),
    ]);

    const cardChildren = [timeEl, titleRow];
    if (ev.sub) {
      cardChildren.push(
        UI.el('div', { class: 'small soft', style: { marginTop: '3px', lineHeight: '1.4' } }, ev.sub)
      );
    }

    const card = UI.el('div', { class: 'tl-card glass-card' }, cardChildren);

    const item = UI.el('div', { class: 'tl-item ' + ev.type }, [dot, card]);
    return item;
  }

  // Group a flat event list into [{date, label, events}] in descending order.
  function groupByDay(events) {
    const groups = [];
    const seen   = {};
    events.forEach(function (ev) {
      const dk = ev.date || 'unknown';
      if (!seen[dk]) {
        seen[dk] = { date: dk, label: UI.fmt.rel(dk), events: [] };
        groups.push(seen[dk]);
      }
      seen[dk].events.push(ev);
    });
    return groups;
  }

  // Render the day-grouped track DOM for a given slice of events.
  function renderTrack(events) {
    const track = UI.el('div', { class: 'tl-track' });

    if (!events.length) {
      track.appendChild(
        UI.empty('📋', t('tl.noEvents'), null)
      );
      return track;
    }

    const groups = groupByDay(events);
    groups.forEach(function (grp) {
      // Day header.
      track.appendChild(
        UI.el('div', { class: 'tl-daygroup' }, grp.label)
      );
      // Items within that day.
      grp.events.forEach(function (ev) {
        track.appendChild(renderItem(ev));
      });
    });

    return track;
  }

  // ---- main render ---------------------------------------------------------

  function render(root) {
    // State held in closure for this render instance.
    let activeFilter = 'all';
    let page         = 1;          // how many PAGE_SIZE pages are visible
    let allEvents    = [];
    let trackWrap    = null;
    let loadMoreBtn  = null;

    // ---- page head ----
    root.appendChild(
      UI.el('div', { class: 'page-head' }, [
        UI.el('h1', { class: 'page-title serif' }, t('tl.title')),
        UI.el('div', { class: 'eyebrow', style: { marginTop: '2px' } }, t('tl.sub')),
      ])
    );

    // ---- intro ----
    root.appendChild(
      UI.el('p', { class: 'soft small', style: { margin: '0 0 var(--s4)' } }, t('tl.intro'))
    );

    // ---- filter chips ----
    const filterDefs = [
      { value: 'all',     label: t('tl.filterAll')     },
      { value: 'mood',    label: t('tl.filterMood')    },
      { value: 'sleep',   label: t('tl.filterSleep')   },
      { value: 'journal', label: t('tl.filterJournal') },
      { value: 'energy',  label: t('tl.filterEnergy')  },
      { value: 'insight', label: t('tl.filterInsight') },
    ];

    const chipsEl = UI.chips(
      filterDefs,
      'all',
      function (val) {
        activeFilter = val;
        page = 1;
        refreshList();
      },
      { single: true }
    );
    root.appendChild(
      UI.el('div', { style: { margin: '0 0 var(--s4)' } }, [chipsEl])
    );

    // ---- scrollable content area ----
    const contentWrap = UI.el('div', { class: 'col gap4' });
    root.appendChild(contentWrap);

    // ---- load-more button ----
    loadMoreBtn = UI.btn(t('tl.loadMore'), {
      class: 'btn-ghost btn-block',
      onClick: function () {
        page++;
        refreshList();
      },
    });
    loadMoreBtn.style.display = 'none';
    loadMoreBtn.style.marginTop = 'var(--s4)';

    // ---- build + display events ----
    function refreshList() {
      // Rebuild full event list each time (cheap — all in memory).
      allEvents = buildEvents();

      // Apply filter.
      const filtered = activeFilter === 'all'
        ? allEvents
        : allEvents.filter(function (ev) { return ev.type === activeFilter; });

      // Paginate.
      const visible  = filtered.slice(0, page * PAGE_SIZE);
      const hasMore  = filtered.length > visible.length;

      // Re-render the track.
      UI.clear(contentWrap);
      if (visible.length === 0) {
        contentWrap.appendChild(
          UI.empty('📋', t('tl.noEvents'), null)
        );
      } else {
        trackWrap = renderTrack(visible);
        contentWrap.appendChild(trackWrap);
      }

      // Show / hide the load-more button.
      if (hasMore) {
        contentWrap.appendChild(loadMoreBtn);
        loadMoreBtn.style.display = '';
      } else {
        loadMoreBtn.style.display = 'none';
      }
    }

    // Initial render.
    refreshList();
  }

  Anchor.register({
    id:       'timeline',
    labelKey: 'tl.title',
    icon:     'journal',
    order:    62,
    tab:      false,
    render,
  });

})();
