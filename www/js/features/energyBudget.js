// ===========================================================================
// energyBudget.js — Energy Budget feature for Anchor.
// Lets users log energy drains and restores, visualise today's balance, and
// see analytical breakdowns across their full history.
//
// Registration: Anchor.register({ id:'energy', ... })
// ===========================================================================
(function () {

  // ---- helpers ---------------------------------------------------------------

  const CATS = ['work', 'social', 'body', 'mind', 'home', 'other'];

  function catLabel(cat) {
    return t('en.cats.' + cat);
  }

  function kindColor(kind) {
    return kind === 'spend' ? 'var(--bad)' : 'var(--good)';
  }

  function kindSign(kind) {
    return kind === 'spend' ? '−' : '+';
  }

  function netColor(net) {
    if (net >= 2) return 'var(--good)';
    if (net <= -2) return 'var(--bad)';
    return 'var(--warn)';
  }

  function stateLabel(net) {
    if (net >= 2) return t('en.charged');
    if (net <= -2) return t('en.runningLow');
    return t('en.steady');
  }

  // Normalise label for grouping (lower-case trim)
  function normLabel(lbl) {
    return (lbl || '').toLowerCase().trim();
  }

  // ---- analysis helpers ------------------------------------------------------

  // Returns { byLabel: Map<normLabel, {label, spent, restored, net, count}>,
  //           byCat:   Map<cat, {cat, spent, restored, net, count}> }
  function buildAggregates() {
    const all = Store.energy.all();
    const byLabel = new Map();
    const byCat = new Map();

    all.forEach(function (rec) {
      const norm = normLabel(rec.label);
      const sign = rec.kind === 'restore' ? 1 : -1;
      const amt = (rec.amount || 1) * sign;

      // by label
      if (norm) {
        if (!byLabel.has(norm)) {
          byLabel.set(norm, { label: rec.label || norm, spent: 0, restored: 0, net: 0, count: 0 });
        }
        const lb = byLabel.get(norm);
        lb.net += amt;
        lb.count += 1;
        if (rec.kind === 'spend') lb.spent += rec.amount || 1;
        else lb.restored += rec.amount || 1;
      }

      // by category
      const cat = rec.category || 'other';
      if (!byCat.has(cat)) {
        byCat.set(cat, { cat, spent: 0, restored: 0, net: 0, count: 0 });
      }
      const cb = byCat.get(cat);
      cb.net += amt;
      cb.count += 1;
      if (rec.kind === 'spend') cb.spent += rec.amount || 1;
      else cb.restored += rec.amount || 1;
    });

    return { byLabel, byCat };
  }

  // Surprise check: a label the user primarily logs as 'restore' but whose
  // net is <= -1. Likely reflects a coping behaviour that doesn't actually help.
  function findSurprises(byLabel) {
    const surprises = [];
    byLabel.forEach(function (data) {
      if (data.restored > data.spent && data.net <= -1) {
        surprises.push(data);
      }
    });
    return surprises;
  }

  // Top N items sorted by ascending net (drainers) or descending net (restorers)
  function topDrainers(byLabel, n) {
    return Array.from(byLabel.values())
      .filter(function (d) { return d.net < 0; })
      .sort(function (a, b) { return a.net - b.net; })
      .slice(0, n || 5);
  }

  function topRestorers(byLabel, n) {
    return Array.from(byLabel.values())
      .filter(function (d) { return d.net > 0; })
      .sort(function (a, b) { return b.net - a.net; })
      .slice(0, n || 5);
  }

  // ---- LOG SHEET ------------------------------------------------------------

  function openLogSheet(kind, onSave) {
    const title = kind === 'spend' ? t('en.logSpend') : t('en.logRestore');
    const placeholder = kind === 'spend' ? t('en.spendPlaceholder') : t('en.restorePlaceholder');

    let chosenAmount = 2;
    let chosenCat = 'other';
    let labelVal = '';

    const labelInput = UI.el('input', {
      type: 'text',
      class: 'input',
      placeholder: placeholder,
      maxlength: '80',
      oninput: function (e) { labelVal = e.target.value; },
    });

    // Amount segmented control (re-rendered on change)
    const amountWrap = UI.el('div');

    function renderAmount() {
      UI.clear(amountWrap);
      amountWrap.appendChild(
        UI.segmented(
          [
            { label: t('en.little'), value: 1 },
            { label: t('en.some'), value: 2 },
            { label: t('en.a_lot'), value: 3 },
          ],
          chosenAmount,
          function (v) { chosenAmount = v; renderAmount(); }
        )
      );
    }
    renderAmount();

    // Category chips (re-rendered on change)
    const catWrap = UI.el('div');

    function renderCats() {
      UI.clear(catWrap);
      catWrap.appendChild(
        UI.chips(
          CATS.map(function (c) { return { value: c, label: catLabel(c) }; }),
          chosenCat,
          function (v) { chosenCat = v; renderCats(); },
          { single: true }
        )
      );
    }
    renderCats();

    const saveBtn = UI.btn(t('app.save'), {
      class: 'btn-primary btn-block',
      onClick: function () {
        const lbl = labelVal.trim();
        if (!lbl) { UI.haptic('error'); labelInput.focus(); return; }
        Store.energy.add({ kind: kind, amount: chosenAmount, label: lbl, category: chosenCat });
        UI.haptic('success');
        UI.toast(t('app.saved'), 'good');
        s.close();
        if (onSave) onSave();
      },
    });

    const body = UI.el('div', { class: 'col gap4', style: { padding: '4px 0 16px' } }, [
      UI.field(null, labelInput),
      UI.field(t('en.amount'), amountWrap),
      UI.field(t('en.category'), catWrap),
      saveBtn,
    ]);

    const s = UI.sheet({ title: title, body: body });
    // Focus label after sheet animates in
    setTimeout(function () { labelInput.focus(); }, 260);
    return s;
  }

  // ---- TODAY'S LOG LIST -----------------------------------------------------

  function todayLogList(onRefresh) {
    const today = Store.today();
    const entries = Store.energy.byDate(today).slice().sort(function (a, b) { return a.ts - b.ts; });

    if (!entries.length) return null;

    const rows = entries.map(function (rec) {
      const color = kindColor(rec.kind);
      const sign = kindSign(rec.kind);

      const deleteBtn = UI.el('button', {
        class: 'btn btn-ghost btn-sm',
        style: { padding: '4px 8px', color: 'var(--ink-ghost)', flexShrink: '0' },
        onclick: async function () {
          const ok = await UI.confirm(t('app.confirmDelete'), { danger: true, confirmLabel: t('app.delete') });
          if (!ok) return;
          Store.energy.remove(rec.id);
          UI.haptic('light');
          if (onRefresh) onRefresh();
        },
      }, UI.frag('<span style="width:16px;height:16px;display:inline-flex">' + Icons.get('trash') + '</span>'));

      return UI.el('div', {
        class: 'glass-card card-tight row between gap3',
        style: { marginBottom: '6px', alignItems: 'center' },
      }, [
        UI.el('div', {
          style: { width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: color, flexShrink: '0' },
        }, UI.frag('<span style="width:20px;height:20px;display:inline-flex">' + Icons.get('energy') + '</span>')),
        UI.el('div', { class: 'grow', style: { minWidth: '0' } }, [
          UI.el('div', { class: 'b small', style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, rec.label || ''),
          UI.el('div', { class: 'tiny soft' }, [
            catLabel(rec.category || 'other'),
            UI.el('span', { style: { margin: '0 4px', opacity: '0.4' } }, '·'),
            UI.fmt ? '' : '',
            UI.el('span', {}, UI.fmt.time(rec.ts)),
          ]),
        ]),
        UI.el('div', { class: 'b', style: { color: color, flexShrink: '0', fontSize: '1.1rem' } }, sign + (rec.amount || 1)),
        deleteBtn,
      ]);
    });

    return UI.el('div', {}, rows);
  }

  // ---- GAUGE CARD -----------------------------------------------------------

  function gaugeCard() {
    const e = Store.derive.energyToday();
    const maxVal = Math.max(e.spent, e.restored, 3);
    const spentPct = Math.round((e.spent / maxVal) * 100);
    const restoredPct = Math.round((e.restored / maxVal) * 100);
    const net = e.net;
    const color = netColor(net);
    const state = stateLabel(net);

    const spentBar = UI.el('div', { style: { marginBottom: '8px' } }, [
      UI.el('div', { class: 'row between tiny soft', style: { marginBottom: '3px' } }, [
        UI.el('span', {}, t('en.spent')),
        UI.el('span', { style: { color: 'var(--bad)' } }, '−' + e.spent),
      ]),
      UI.el('div', { style: { background: 'rgba(255,255,255,0.08)', borderRadius: '6px', height: '8px', overflow: 'hidden' } }, [
        UI.el('div', { style: { width: spentPct + '%', height: '100%', background: 'var(--bad)', borderRadius: '6px', transition: 'width 0.5s ease' } }),
      ]),
    ]);

    const restoredBar = UI.el('div', { style: { marginBottom: '12px' } }, [
      UI.el('div', { class: 'row between tiny soft', style: { marginBottom: '3px' } }, [
        UI.el('span', {}, t('en.restored')),
        UI.el('span', { style: { color: 'var(--good)' } }, '+' + e.restored),
      ]),
      UI.el('div', { style: { background: 'rgba(255,255,255,0.08)', borderRadius: '6px', height: '8px', overflow: 'hidden' } }, [
        UI.el('div', { style: { width: restoredPct + '%', height: '100%', background: 'var(--good)', borderRadius: '6px', transition: 'width 0.5s ease' } }),
      ]),
    ]);

    const netRow = UI.el('div', { class: 'row between', style: { alignItems: 'baseline' } }, [
      UI.el('div', { class: 'col gap1' }, [
        UI.el('div', { class: 'eyebrow' }, t('en.net')),
        UI.el('div', { style: { fontSize: '2.2rem', fontWeight: '700', color: color, letterSpacing: '-0.02em' } }, UI.fmt.signed(net)),
      ]),
      UI.el('div', { class: 'col', style: { alignItems: 'flex-end', gap: '2px' } }, [
        UI.el('div', { class: 'b', style: { color: color } }, state),
        UI.el('div', { class: 'tiny soft' }, e.count + (e.count === 1 ? ' entry' : ' entries')),
      ]),
    ]);

    return UI.card([
      UI.el('div', { class: 'row between', style: { marginBottom: '12px' } }, [
        UI.el('div', { class: 'eyebrow' }, t('en.todayBudget')),
        UI.frag('<span style="width:20px;height:20px;color:var(--ink-ghost);display:inline-flex">' + Icons.get('energy') + '</span>'),
      ]),
      spentBar,
      restoredBar,
      netRow,
    ], { sheen: true });
  }

  // ---- FORECAST WARNING CARD ------------------------------------------------

  function forecastWarningCard(net) {
    if (net > -2) return null;
    return UI.el('div', {
      class: 'glass-card card',
      style: { borderColor: 'rgba(255,100,80,0.45)', background: 'rgba(255,60,40,0.07)' },
    }, [
      UI.el('div', { class: 'row gap3', style: { alignItems: 'flex-start' } }, [
        UI.el('span', { style: { fontSize: '1.4rem', flexShrink: '0', marginTop: '2px' } }, '⚠️'),
        UI.el('div', { class: 'small', style: { lineHeight: '1.55' } }, t('en.forecastLow')),
      ]),
    ]);
  }

  // ---- DRAINERS / RESTORERS LIST --------------------------------------------

  function rankedList(items, isRestorer) {
    if (!items.length) return UI.el('div', { class: 'tiny soft' }, t('en.noData'));
    const absMax = Math.max(1, ...items.map(function (d) { return Math.abs(d.net); }));
    const color = isRestorer ? 'var(--good)' : 'var(--bad)';

    return UI.el('div', { class: 'col gap2' }, items.map(function (item, idx) {
      const pct = Math.round((Math.abs(item.net) / absMax) * 100);
      return UI.el('div', {}, [
        UI.el('div', { class: 'row between tiny', style: { marginBottom: '3px' } }, [
          UI.el('span', { class: 'b', style: { maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            (idx + 1) + '. ' + item.label),
          UI.el('span', { style: { color: color } }, (isRestorer ? '+' : '−') + Math.abs(item.net)),
        ]),
        UI.el('div', { style: { background: 'rgba(255,255,255,0.08)', borderRadius: '4px', height: '5px', overflow: 'hidden' } }, [
          UI.el('div', { style: { width: pct + '%', height: '100%', background: color, borderRadius: '4px' } }),
        ]),
      ]);
    }));
  }

  // ---- SURPRISE SECTION -----------------------------------------------------

  function surpriseSection(surprises) {
    if (!surprises.length) return null;
    return UI.card([
      UI.el('div', { class: 'row gap2', style: { alignItems: 'flex-start', marginBottom: '10px' } }, [
        UI.el('span', { style: { fontSize: '1.2rem', flexShrink: '0' } }, '🔍'),
        UI.el('div', { class: 'b small' }, t('en.surprise')),
      ]),
      UI.el('div', { class: 'col gap2' }, surprises.slice(0, 3).map(function (s) {
        return UI.el('div', { class: 'tiny', style: { padding: '6px 10px', background: 'rgba(255,200,50,0.1)', borderRadius: '8px', borderLeft: '3px solid var(--warn)' } },
          '"' + s.label + '" — ' + t('en.net').toLowerCase() + ': ' + UI.fmt.signed(s.net));
      })),
    ]);
  }

  // ---- RECHARGE RATE CARD ---------------------------------------------------

  function rechargeCard(restorers) {
    const best = restorers[0];

    return UI.card([
      UI.el('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('en.rechargeRate')),
      UI.el('div', { class: 'row between gap3', style: { alignItems: 'flex-start' } }, [
        UI.el('div', { class: 'grow' }, [
          UI.el('div', { class: 'small soft', style: { marginBottom: '4px' } }, t('en.bestRestore')),
          best
            ? UI.el('div', { class: 'b', style: { color: 'var(--good)' } }, best.label)
            : UI.el('div', { class: 'soft small' }, t('en.noData')),
        ]),
        best
          ? UI.el('div', { class: 'b', style: { fontSize: '1.4rem', color: 'var(--good)', flexShrink: '0' } }, '+' + best.net)
          : null,
      ]),
    ]);
  }

  // ---- 14-DAY SPARKLINE CARD ------------------------------------------------

  function trendCard() {
    const series = Store.derive.series('energyNet', 14);
    const values = series.map(function (pt) { return pt.value; });
    const hasData = values.some(function (v) { return v != null; });

    if (!hasData) return null;

    const svgHtml = UI.sparkline(values, {
      width: 280,
      height: 52,
      color: 'var(--a1)',
      min: null,
      max: null,
    });

    const labels = UI.el('div', {
      class: 'row between',
      style: { marginTop: '4px' },
    }, [
      UI.el('div', { class: 'tiny soft' }, UI.fmt.rel(series[0].date)),
      UI.el('div', { class: 'tiny soft' }, t('app.today')),
    ]);

    return UI.card([
      UI.el('div', { class: 'eyebrow', style: { marginBottom: '10px' } }, '14-day ' + t('en.net').toLowerCase() + ' trend'),
      UI.frag('<div style="width:100%;overflow:hidden">' + svgHtml + '</div>'),
      labels,
    ]);
  }

  // ---- ANALYSIS SECTION -----------------------------------------------------

  function analysisSection() {
    const { byLabel, byCat } = buildAggregates();
    const drainers = topDrainers(byLabel, 5);
    const restorers = topRestorers(byLabel, 5);
    const surprises = findSurprises(byLabel);

    const hasHistory = Store.energy.all().length > 0;
    if (!hasHistory) return null;

    const nodes = [];

    // Net drainers
    nodes.push(UI.card([
      UI.el('div', { class: 'eyebrow', style: { marginBottom: '10px' } }, t('en.netDrainers')),
      rankedList(drainers, false),
    ]));

    // Net restorers
    nodes.push(UI.card([
      UI.el('div', { class: 'eyebrow', style: { marginBottom: '10px' } }, t('en.netRestorers')),
      rankedList(restorers, true),
    ]));

    // Surprise
    const surpriseEl = surpriseSection(surprises);
    if (surpriseEl) nodes.push(surpriseEl);

    // Recharge card
    nodes.push(rechargeCard(restorers));

    // Category breakdown
    if (byCat.size > 0) {
      const catItems = Array.from(byCat.values()).sort(function (a, b) { return a.net - b.net; });
      nodes.push(UI.card([
        UI.el('div', { class: 'eyebrow', style: { marginBottom: '10px' } }, t('en.category')),
        UI.el('div', { class: 'col gap2' }, catItems.map(function (c) {
          const color = c.net >= 0 ? 'var(--good)' : 'var(--bad)';
          return UI.el('div', { class: 'row between gap3 small', style: { padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' } }, [
            UI.el('span', {}, catLabel(c.cat)),
            UI.el('span', { class: 'b', style: { color: color } }, UI.fmt.signed(c.net)),
          ]);
        })),
      ]));
    }

    return UI.el('div', { class: 'col gap4' }, nodes);
  }

  // ---- MAIN RENDER ----------------------------------------------------------

  function render(root) {

    // Page header
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('h1', { class: 'page-title' }, t('en.title')),
      UI.el('div', { class: 'small soft mt1' }, t('en.sub')),
    ]));

    const grid = UI.el('div', { class: 'col gap4 stagger' });
    root.appendChild(grid);

    // Intro card
    grid.appendChild(UI.card([
      UI.el('div', { class: 'small', style: { lineHeight: '1.6' } }, t('en.intro')),
    ]));

    function refresh() {
      Anchor.refresh();
    }

    // --- Today's balance gauge ---
    const e = Store.derive.energyToday();
    grid.appendChild(gaugeCard());

    // --- Forecast warning (if running low) ---
    const warningEl = forecastWarningCard(e.net);
    if (warningEl) grid.appendChild(warningEl);

    // --- Log controls ---
    const logRow = UI.el('div', { class: 'row gap2' }, [
      UI.btn(t('en.logSpend'), {
        class: 'btn-primary grow',
        icon: 'energy',
        onClick: function () {
          UI.haptic('light');
          openLogSheet('spend', refresh);
        },
      }),
      UI.btn(t('en.logRestore'), {
        class: 'btn-ghost grow',
        icon: 'spark',
        onClick: function () {
          UI.haptic('light');
          openLogSheet('restore', refresh);
        },
      }),
    ]);
    grid.appendChild(logRow);

    // --- Today's log list ---
    const todayEntries = Store.energy.byDate(Store.today());
    if (todayEntries.length > 0) {
      const listEl = todayLogList(refresh);
      if (listEl) {
        grid.appendChild(UI.el('div', {}, [
          UI.el('div', { class: 'eyebrow', style: { margin: '0 4px 8px' } }, t('app.today')),
          listEl,
        ]));
      }
    } else {
      // Empty state if no entries at all
      const allEntries = Store.energy.all();
      if (!allEntries.length) {
        grid.appendChild(UI.empty('⚡', null, t('en.noData')));
      }
    }

    // --- 14-day trend sparkline ---
    const trend = trendCard();
    if (trend) grid.appendChild(trend);

    // --- Analysis section (history-gated) ---
    const analysis = analysisSection();
    if (analysis) grid.appendChild(analysis);
  }

  Anchor.register({
    id: 'energy',
    labelKey: 'nav.energy',
    icon: 'energy',
    order: 35,
    tab: false,
    render: render,
  });

})();
