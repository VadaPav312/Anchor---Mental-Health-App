// ===========================================================================
// sleep.js — Sleep journal. Manual nightly logging, nightly scores, 7-night
// trends, and night detail sheets. Pure software — no hardware required.
// ===========================================================================
(function () {

  // ---- module state --------------------------------------------------------
  let _activeMetric = 'sleepScore';

  // ---- helpers -------------------------------------------------------------
  function scoreColor(v) {
    if (v == null) return 'var(--ink-ghost)';
    if (v >= 75) return 'var(--good)';
    if (v >= 50) return 'var(--warn)';
    return 'var(--bad)';
  }

  function metricLabel(metric) {
    const map = {
      sleepScore: t('dash.sleepScore'),
      sleepTempF: t('sleep.temp'),
      noise: t('sleep.noise'),
      sleepDur: t('sleep.duration'),
    };
    return map[metric] || metric;
  }

  // ---- page head -----------------------------------------------------------
  function buildHead(root) {
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('div', { class: 'eyebrow' }, t('nav.sleep')),
      UI.el('h1', { class: 'page-title serif' }, t('sleep.title')),
      UI.el('div', { class: 'small soft mt1' }, t('sleep.sub')),
    ]));
  }

  // ---- scores ring row (last night) ----------------------------------------
  function buildScoreRings(root) {
    const s = Store.derive.lastSleep();
    if (!s) return;

    const section = UI.el('div', { class: 'col gap3' });
    root.appendChild(section);

    section.appendChild(UI.el('div', { class: 'eyebrow', style: { margin: '0 4px 2px' } }, t('dash.lastNight')));

    const row = UI.el('div', { class: 'row gap3 wrap' });
    section.appendChild(row);

    // sleep score ring
    const sleepRingCard = UI.card([
      UI.el('div', { class: 'col center gap2', style: { padding: '8px 0' } }, [
        UI.frag(UI.ring(s.score != null ? s.score : 0, 100, {
          size: 96, stroke: 9,
          label: t('dash.sleepScore'),
          color: ['var(--a1)', 'var(--a2)'],
        })),
      ]),
    ], { class: 'grow' });
    row.appendChild(sleepRingCard);

    // env score ring
    if (s.envScore != null) {
      const envRingCard = UI.card([
        UI.el('div', { class: 'col center gap2', style: { padding: '8px 0' } }, [
          UI.frag(UI.ring(s.envScore, 100, {
            size: 96, stroke: 9,
            label: t('sleep.envScore'),
            color: ['var(--a3)', 'var(--a1)'],
          })),
        ]),
      ], { class: 'grow' });
      row.appendChild(envRingCard);
    }

    // duration / restful tiles row
    const tiles = UI.el('div', { class: 'tiles' });
    section.appendChild(tiles);

    tiles.appendChild(UI.tile(
      UI.fmt.dur(s.durationMin),
      t('sleep.duration'),
      s.inBedAt ? UI.fmt.time(s.inBedAt) + ' → ' + (s.outAt ? UI.fmt.time(s.outAt) : '?') : null
    ));

    if (s.restful != null) {
      tiles.appendChild(UI.tile(
        String(s.restful) + '/10',
        t('sleep.quality'),
        null,
        { color: s.restful >= 7 ? 'var(--good)' : s.restful >= 4 ? 'var(--warn)' : 'var(--bad)' }
      ));
    }

    if (s.awakenings != null) {
      tiles.appendChild(UI.tile(
        String(s.awakenings),
        t('sleep.awakenings'),
        null
      ));
    }
  }

  // ---- 7-night trend -------------------------------------------------------
  function buildTrend(root) {
    const section = UI.el('div', { class: 'col gap3' });
    root.appendChild(section);

    section.appendChild(UI.el('div', { class: 'eyebrow', style: { margin: '0 4px 2px' } }, t('sleep.trend7')));

    const trendCard = UI.card([
      buildSegmentedMetric(),
      UI.el('div', { id: 'sleep-trend-chart', style: { marginTop: '10px', overflow: 'hidden' } }),
    ]);
    section.appendChild(trendCard);

    renderTrendChart(trendCard.querySelector('#sleep-trend-chart'));
  }

  function buildSegmentedMetric() {
    const items = [
      { label: t('dash.sleepScore'), value: 'sleepScore' },
      { label: t('sleep.temp'), value: 'sleepTempF' },
      { label: t('sleep.noise'), value: 'noise' },
      { label: t('sleep.duration'), value: 'sleepDur' },
    ];
    return UI.segmented(items, _activeMetric, (val) => {
      _activeMetric = val;
      const chart = document.getElementById('sleep-trend-chart');
      if (chart) renderTrendChart(chart);
    });
  }

  function renderTrendChart(chartEl) {
    if (!chartEl) return;
    UI.clear(chartEl);

    const series = Store.derive.series(_activeMetric, 14);
    const values = series.map(p => p.v != null ? p.v : p.value);

    const sparkColor = _activeMetric === 'sleepScore' ? 'var(--a1)'
      : _activeMetric === 'noise' ? 'var(--warn)'
      : 'var(--a3)';

    chartEl.appendChild(UI.frag(UI.sparkline(values, { width: 300, height: 52, color: sparkColor })));

    // day labels: show Mon/Wed/Fri
    const labels = UI.el('div', { class: 'row between', style: { marginTop: '2px' } });
    series.forEach((p, i) => {
      if (i % 4 === 0 || i === series.length - 1) {
        labels.appendChild(UI.el('span', { class: 'tiny muted' }, UI.fmt.weekday(p.date)));
      }
    });
    chartEl.appendChild(labels);

    // metric label
    chartEl.appendChild(UI.el('div', { class: 'tiny soft', style: { textAlign: 'center', marginTop: '4px' } },
      metricLabel(_activeMetric)
    ));
  }

  // ---- nights list ---------------------------------------------------------
  function buildNightsList(root) {
    const all = Store.sleep.all().slice().reverse();

    const header = UI.el('div', { class: 'row between', style: { margin: '0 4px 8px' } }, [
      UI.el('div', { class: 'eyebrow' }, t('sleep.lastNights')),
      UI.btn(t('sleep.addManual'), {
        class: 'btn-ghost btn-sm',
        icon: 'plus',
        onClick: () => showAddSheet(),
      }),
    ]);
    root.appendChild(header);

    if (!all.length) {
      root.appendChild(UI.empty('🌙', t('sleep.noData'), t('sleep.setupHint')));
      return;
    }

    const list = UI.card([
      UI.el('div', { class: 'col', style: { gap: '0' } }, all.map((s, idx) => buildNightRow(s, idx, all.length))),
    ]);
    root.appendChild(list);
  }

  function buildNightRow(s, idx, total) {
    const isLast = idx === total - 1;
    const row = UI.el('div', {
      class: 'row between gap3',
      style: {
        padding: '12px 4px',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.06)',
        cursor: 'pointer',
      },
      onclick: () => showNightDetail(s),
    }, [
      // left: date + duration
      UI.el('div', { class: 'col', style: { gap: '2px' } }, [
        UI.el('div', { class: 'b small' }, UI.fmt.rel(s.date)),
        UI.el('div', { class: 'tiny soft' }, UI.fmt.dur(s.durationMin) + (s.tempF != null ? ' · ' + UI.fmt.temp(s.tempF) : '')),
      ]),
      // right: score badge + chevron
      UI.el('div', { class: 'row gap2', style: { alignItems: 'center' } }, [
        s.score != null ? UI.el('span', {
          class: 'chip',
          style: {
            background: scoreColor(s.score) + '22',
            color: scoreColor(s.score),
            borderColor: scoreColor(s.score) + '44',
            fontSize: '0.75rem',
            padding: '2px 8px',
          },
        }, String(Math.round(s.score))) : null,
        UI.frag('<span style="width:16px;color:var(--ink-ghost)">' + Icons.get('chevron') + '</span>'),
      ]),
    ]);
    return row;
  }

  // ---- night detail sheet --------------------------------------------------
  function showNightDetail(s) {
    UI.haptic('light');

    const rows = (pairs) => UI.el('div', { class: 'col', style: { gap: '8px', marginTop: '8px' } },
      pairs.filter(Boolean).map(([label, val]) =>
        UI.el('div', { class: 'row between gap3' }, [
          UI.el('span', { class: 'small soft' }, label),
          UI.el('span', { class: 'small b' }, String(val != null ? val : '—')),
        ])
      )
    );

    const body = UI.el('div', { class: 'col gap4', style: { padding: '4px 0 20px' } }, [
      // scores
      s.score != null || s.envScore != null ? UI.el('div', { class: 'row gap3' }, [
        s.score != null ? UI.el('div', { class: 'col center grow', style: { gap: '4px' } }, [
          UI.frag(UI.ring(s.score, 100, { size: 72, stroke: 7, label: t('dash.sleepScore'), color: ['var(--a1)', 'var(--a2)'] })),
        ]) : null,
        s.envScore != null ? UI.el('div', { class: 'col center grow', style: { gap: '4px' } }, [
          UI.frag(UI.ring(s.envScore, 100, { size: 72, stroke: 7, label: t('sleep.envScore'), color: ['var(--a3)', 'var(--a1)'] })),
        ]) : null,
      ]) : null,

      // timing
      rows([
        [t('sleep.bedtime'), s.inBedAt ? UI.fmt.time(s.inBedAt) : null],
        [t('sleep.waketime'), s.outAt ? UI.fmt.time(s.outAt) : null],
        [t('sleep.duration'), UI.fmt.dur(s.durationMin)],
        s.awakenings != null ? [t('sleep.awakenings'), s.awakenings] : null,
        s.restful != null ? [t('sleep.howSlept'), s.restful + '/10'] : null,
      ]),

      // environment
      s.tempF != null || s.humidity != null || s.lightLux != null || s.noiseDb != null
        ? UI.el('div', {}, [
          UI.el('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, t('sleep.environment')),
          rows([
            s.tempF != null ? [t('sleep.temp'), UI.fmt.temp(s.tempF)] : null,
            s.humidity != null ? [t('sleep.humidity'), Math.round(s.humidity) + '%'] : null,
            s.lightLux != null ? [t('sleep.light'), UI.fmt.num(s.lightLux, 1) + ' lux'] : null,
            s.noiseDb != null ? [t('sleep.noise'), Math.round(s.noiseDb) + ' dB'] : null,
          ]),
        ])
        : null,

      // delete button
      UI.btn(t('app.delete'), {
        class: 'btn-ghost btn-sm',
        icon: 'trash',
        block: true,
        onClick: async () => {
          const ok = await UI.confirm(t('app.confirmDelete'), { danger: true });
          if (ok) {
            Store.sleep.remove(s.id);
            UI.toast(t('app.saved'), 'good');
            Anchor.refresh();
          }
        },
      }),
    ]);

    UI.sheet({ title: t('sleep.detail'), body });
  }

  // ---- add manual night sheet ----------------------------------------------
  function showAddSheet() {
    UI.haptic('light');
    const unit = Store.get('settings.tempUnit', 'F');

    // form state
    const form = {
      date: Store.today(),
      durationMin: 420,
      tempF: unit === 'C' ? 20 : 68,   // stored always in F; display converts
      humidity: 45,
      lightLux: null,
      noiseDb: null,
      restful: 7,
      awakenings: 0,
    };

    // helpers to build labeled range inputs
    function sliderField(labelStr, key, min, max, step, display) {
      const valNode = UI.el('span', { class: 'b small' }, display(form[key]));
      const input = UI.el('input', {
        type: 'range', min, max, step,
        value: form[key] != null ? form[key] : min,
        style: { width: '100%', marginTop: '6px' },
        oninput: (e) => {
          form[key] = Number(e.target.value);
          valNode.textContent = display(form[key]);
        },
      });
      return UI.field(
        UI.el('div', { class: 'row between' }, [UI.el('span', {}, labelStr), valNode]),
        input
      );
    }

    // duration display
    function durDisplay(min) { return UI.fmt.dur(min); }

    // temp display (stored F, show in user unit)
    function tempDisplay(f) {
      if (unit === 'C') return Math.round((f - 32) * 5 / 9) + '°C';
      return Math.round(f) + '°F';
    }
    // temp slider min/max in F
    const tempMin = unit === 'C' ? (50 - 32) * 5 / 9 : 50;    // ~10C / 50F
    const tempMax = unit === 'C' ? (90 - 32) * 5 / 9 : 90;    // ~32C / 90F

    const dateInput = UI.el('input', {
      type: 'date',
      value: form.date,
      style: { width: '100%' },
      oninput: (e) => { form.date = e.target.value; },
    });

    const body = UI.el('div', { class: 'col gap4', style: { padding: '4px 0 24px' } }, [
      UI.field(t('sleep.date'), dateInput),

      sliderField(
        t('sleep.duration'), 'durationMin', 60, 720, 15, durDisplay
      ),

      sliderField(
        t('sleep.temp') + ' (' + (unit === 'C' ? '°C' : '°F') + ')',
        'tempF',
        Math.round(unit === 'C' ? 10 : 50),
        Math.round(unit === 'C' ? 32 : 90),
        1,
        tempDisplay
      ),

      sliderField(t('sleep.humidity') + ' (%)', 'humidity', 10, 80, 1, (v) => v + '%'),

      sliderField(t('sleep.howSlept'), 'restful', 0, 10, 1, (v) => v + '/10'),

      sliderField(t('sleep.awakenings'), 'awakenings', 0, 10, 1, (v) => String(v)),

      // optional light / noise
      UI.el('div', { class: 'row gap3' }, [
        UI.field(
          t('sleep.light') + ' (lux, ' + t('app.optional') + ')',
          UI.el('input', {
            type: 'number', min: 0, max: 500, step: 1,
            placeholder: '—',
            style: { width: '100%' },
            oninput: (e) => { form.lightLux = e.target.value ? Number(e.target.value) : null; },
          })
        ),
        UI.field(
          t('sleep.noise') + ' (dB, ' + t('app.optional') + ')',
          UI.el('input', {
            type: 'number', min: 0, max: 120, step: 1,
            placeholder: '—',
            style: { width: '100%' },
            oninput: (e) => { form.noiseDb = e.target.value ? Number(e.target.value) : null; },
          })
        ),
      ]),

      UI.btn(t('app.save'), {
        class: 'btn-primary',
        icon: 'check',
        block: true,
        onClick: () => {
          try {
            // convert displayed temp back to F if needed
            let storedTempF = form.tempF;
            if (unit === 'C') {
              storedTempF = form.tempF * 9 / 5 + 32;
            }

            const envScore = SleepScore.environment({
              tempF: storedTempF,
              humidity: form.humidity,
              lightLux: form.lightLux,
              noiseDb: form.noiseDb,
            });
            const score = SleepScore.sleep({
              durationMin: form.durationMin,
              envScore,
              awakenings: form.awakenings,
              motion: null,
            });

            Store.sleep.add({
              date: form.date,
              durationMin: form.durationMin,
              tempF: storedTempF,
              humidity: form.humidity,
              lightLux: form.lightLux,
              noiseDb: form.noiseDb,
              restful: form.restful,
              awakenings: form.awakenings,
              motion: null,
              envScore,
              score,
              source: 'manual',
            });

            UI.toast(t('app.saved'), 'good');
            if (sheet && sheet.close) sheet.close();   // auto-dismiss the popup
            Anchor.refresh();
          } catch (e) {
            console.warn('sleep add failed', e);
            UI.toast(t('app.cancel'), 'bad');
          }
        },
      }),
    ]);

    const sheet = UI.sheet({ title: t('sleep.addManual'), body });
  }

  // ---- render --------------------------------------------------------------
  function render(container) {
    UI.clear(container);

    const root = UI.el('div', { class: 'col gap4 stagger' });
    container.appendChild(root);

    // 1. page head
    buildHead(root);

    // 2. score rings for last night
    buildScoreRings(root);

    // 3. 7-night trend
    const hasSleep = Store.sleep.all().length > 0;
    if (hasSleep) {
      buildTrend(root);
    }

    // 4. nights list + add manual
    buildNightsList(root);

    // bottom padding
    root.appendChild(UI.el('div', { style: { height: '40px' } }));
  }

  // ---- register ------------------------------------------------------------
  Anchor.register({
    id: 'sleep',
    labelKey: 'nav.sleep',
    icon: 'sleep',
    order: 15,
    tab: false,
    render,
  });

})();
