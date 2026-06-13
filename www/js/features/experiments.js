// ===========================================================================
// experiments.js — Personal Experiments: be the scientist of your own wellbeing.
//
// Lets users run structured A/B-style self-experiments over 14 days (default).
// LLM designs the protocol; Stats.compareGroups() gives an honest verdict.
// Real effects go into Store.profileWins — your evidence-backed instruction
// manual for your own mind.
// ===========================================================================
(function () {

  // --------------------------------------------------------------------------
  // Preset experiment library (~8 hypotheses)
  // --------------------------------------------------------------------------
  function presets() {
    return [
      {
        key: 'sunlight',
        icon: 'sun',
        metric: 'valence',
        total: 14,
        hypothesisPrompt: 'Does morning sunlight improve my mood?',
      },
      {
        key: 'screens',
        icon: 'moon',
        metric: 'sleepScore',
        total: 14,
        hypothesisPrompt: 'Do screens before bed hurt my sleep quality?',
      },
      {
        key: 'coffee',
        icon: 'bolt',
        metric: 'restful',
        total: 14,
        hypothesisPrompt: 'Does coffee after 2pm wreck my sleep restfulness?',
      },
      {
        key: 'journaling',
        icon: 'journal',
        metric: 'valence',
        total: 14,
        hypothesisPrompt: 'Does journaling actually help my mood?',
      },
      {
        key: 'coolerRoom',
        icon: 'thermo',
        metric: 'sleepScore',
        total: 14,
        hypothesisPrompt: 'Does sleeping in a cooler room improve my sleep score?',
      },
      {
        key: 'dailyWalk',
        icon: 'leaf',
        metric: 'energyMood',
        total: 14,
        hypothesisPrompt: 'Does a daily walk lift my energy levels?',
      },
      {
        key: 'sleepDur',
        icon: 'sleep',
        metric: 'sleepDur',
        total: 14,
        hypothesisPrompt: 'Does going to bed 30 minutes earlier increase my sleep duration?',
      },
      {
        key: 'noAlcohol',
        icon: 'droplet',
        metric: 'restful',
        total: 14,
        hypothesisPrompt: 'Does cutting out alcohol improve my sleep restfulness?',
      },
    ];
  }

  // --------------------------------------------------------------------------
  // Metric display helpers
  // --------------------------------------------------------------------------
  const METRIC_LABELS = {
    valence: 'Mood (valence)',
    energyMood: 'Energy level',
    sleepScore: 'Sleep score',
    sleepDur: 'Sleep duration (hrs)',
    restful: 'Restfulness',
    energyNet: 'Energy net',
  };

  const METRIC_OPTIONS = [
    { value: 'valence', label: 'Mood (valence)' },
    { value: 'energyMood', label: 'Energy level' },
    { value: 'sleepScore', label: 'Sleep score' },
    { value: 'sleepDur', label: 'Sleep duration' },
    { value: 'restful', label: 'Restfulness' },
    { value: 'energyNet', label: 'Energy net' },
  ];

  // --------------------------------------------------------------------------
  // Local fallback protocol designer (if LLM fails)
  // --------------------------------------------------------------------------
  function localFallback(hypothesis, metric, total) {
    const m = METRIC_LABELS[metric] || metric;
    return {
      title: hypothesis,
      hypothesis: hypothesis,
      metric: metric,
      measureMetric: metric,
      total: total || 14,
      protocolSteps: [
        'On active days, do the behaviour described in your hypothesis.',
        'On control days, skip it — act as you normally would.',
        'Anchor alternates for you automatically (even days = do it, odd days = skip).',
        'Try to keep everything else the same so we can isolate the effect.',
        t('exp.measure') + ': ' + m + ' (read automatically from your existing logs).',
      ],
    };
  }

  // --------------------------------------------------------------------------
  // LLM protocol designer
  // --------------------------------------------------------------------------
  async function designProtocol(hypothesis, metric, total) {
    const prompt = `Design a 14-day personal self-experiment for the following hypothesis:

Hypothesis: "${hypothesis}"
Metric to measure: ${METRIC_LABELS[metric] || metric} (this is tracked automatically)
Duration: ${total} days

Return a JSON object with exactly these keys:
{
  "title": "Short, engaging experiment title (max 8 words)",
  "hypothesis": "One clear sentence stating what we expect to find",
  "metric": "${metric}",
  "measureMetric": "${metric}",
  "total": ${total},
  "protocolSteps": ["Step 1: ...", "Step 2: ...", "Step 3: ...", "Step 4: ..."]
}

protocolSteps should have 3-5 practical, specific steps for how to do the experiment on active days. Keep it tight and honest.`;

    try {
      const design = await LLM.json(prompt, { temperature: 0.5 });
      // Enforce the metric we were asked for regardless of LLM response
      design.metric = metric;
      design.measureMetric = metric;
      design.total = total || 14;
      return design;
    } catch (e) {
      console.warn('LLM protocol design failed, using fallback:', e);
      return localFallback(hypothesis, metric, total);
    }
  }

  // --------------------------------------------------------------------------
  // Verdict computation
  // --------------------------------------------------------------------------
  function computeVerdict(exp) {
    const logs = exp.logs || [];
    const didLogs = logs.filter(l => l.did);
    const controlLogs = logs.filter(l => !l.did);

    const didVals = didLogs.map(l => l.metricValue).filter(v => v != null && !isNaN(v));
    const ctrlVals = controlLogs.map(l => l.metricValue).filter(v => v != null && !isNaN(v));

    const result = Stats.compareGroups(didVals, ctrlVals);
    result.didVals = didVals;
    result.ctrlVals = ctrlVals;

    let verdictKey;
    if (!result.ok || didVals.length < 2 || ctrlVals.length < 2) {
      verdictKey = 'verdictNone';
    } else {
      const d = Math.abs(result.cohenD);
      if (d >= 0.5) {
        verdictKey = 'verdictReal';
      } else if (d >= 0.2) {
        verdictKey = 'verdictWeak';
      } else {
        verdictKey = 'verdictNone';
      }
    }

    result.verdictKey = verdictKey;
    return result;
  }

  // --------------------------------------------------------------------------
  // Whether today has already been logged
  // --------------------------------------------------------------------------
  function alreadyLoggedToday(exp) {
    const today = Store.today();
    return (exp.logs || []).some(l => l.date === today);
  }

  // --------------------------------------------------------------------------
  // A/B schedule: even log-index = do it, odd = control
  // --------------------------------------------------------------------------
  function todayIsActiveDay(exp) {
    const n = (exp.logs || []).length;
    return (n % 2 === 0);
  }

  // --------------------------------------------------------------------------
  // Finish an experiment (compute + save verdict, maybe add to profileWins)
  // --------------------------------------------------------------------------
  function finishExperiment(exp) {
    const result = computeVerdict(exp);
    Store.experiments.update(exp.id, { status: 'done', result });

    if (result.verdictKey === 'verdictReal') {
      Store.profileWins.add({
        title: exp.title,
        evidence: t('exp.confidenceData', { n: (exp.logs || []).length }),
        ts: Date.now(),
      });
      UI.toast(t('exp.addedToProfile'), 'good');
    }

    UI.haptic('success');
    Anchor.refresh();
  }

  // --------------------------------------------------------------------------
  // Render helpers
  // --------------------------------------------------------------------------

  function verdictColor(key) {
    if (key === 'verdictReal') return 'var(--good)';
    if (key === 'verdictWeak') return 'var(--warn)';
    return 'var(--ink-ghost)';
  }

  function verdictEmoji(key) {
    if (key === 'verdictReal') return '✓';
    if (key === 'verdictWeak') return '~';
    return '—';
  }

  // --------------------------------------------------------------------------
  // "What works for me" section
  // --------------------------------------------------------------------------
  function renderWhatWorks(root) {
    const wins = Store.profileWins.all();

    const section = UI.el('div', { class: 'col gap3' });

    section.appendChild(UI.el('div', { class: 'col gap1' }, [
      UI.el('div', { class: 'eyebrow' }, t('exp.whatWorks')),
      UI.el('div', { class: 'small soft' }, t('exp.whatWorksSub')),
    ]));

    if (!wins.length) {
      section.appendChild(UI.empty(
        UI.frag(`<span style="width:28px;height:28px;color:var(--ink-ghost)">${Icons.get('target')}</span>`),
        t('exp.noActive'),
        t('exp.verdictHonest')
      ));
    } else {
      const list = UI.el('div', { class: 'col gap2' });
      wins.slice().reverse().forEach(w => {
        list.appendChild(UI.card([
          UI.el('div', { class: 'row gap2', style: { alignItems: 'flex-start' } }, [
            UI.frag(`<span style="width:18px;height:18px;color:var(--good);flex-shrink:0;margin-top:2px">${Icons.get('check')}</span>`),
            UI.el('div', { class: 'col gap1 grow' }, [
              UI.el('div', { class: 'b small' }, w.title),
              UI.el('div', { class: 'tiny soft' }, w.evidence),
            ]),
          ]),
        ]));
      });
      section.appendChild(list);
    }

    root.appendChild(section);
  }

  // --------------------------------------------------------------------------
  // Past experiments list
  // --------------------------------------------------------------------------
  function renderPastExperiments(root) {
    const done = Store.experiments.all().filter(e => e.status === 'done');
    if (!done.length) return;

    const section = UI.el('div', { class: 'col gap3' });
    section.appendChild(UI.el('div', { class: 'eyebrow' }, t('exp.past')));

    const list = UI.el('div', { class: 'col gap2' });
    done.slice().reverse().forEach(exp => {
      const res = exp.result || {};
      const vKey = res.verdictKey || 'verdictNone';
      const badge = UI.el('span', {
        class: 'chip',
        style: { color: verdictColor(vKey), borderColor: verdictColor(vKey), fontSize: '0.72rem' },
      }, verdictEmoji(vKey) + ' ' + t('exp.' + vKey));

      const card = UI.card([
        UI.el('div', { class: 'row between gap2' }, [
          UI.el('div', { class: 'col gap1 grow' }, [
            UI.el('div', { class: 'b small' }, exp.title),
            UI.el('div', { class: 'tiny soft' }, t('exp.dayN', { n: (exp.logs || []).length, total: exp.total || 14 })),
          ]),
          badge,
        ]),
      ], { onClick: () => showDetailSheet(exp) });

      list.appendChild(card);
    });

    section.appendChild(list);
    root.appendChild(section);
  }

  // --------------------------------------------------------------------------
  // Detail sheet for a completed experiment
  // --------------------------------------------------------------------------
  function showDetailSheet(exp) {
    const res = exp.result || {};
    const vKey = res.verdictKey || 'verdictNone';

    const body = UI.el('div', { class: 'col gap4', style: { padding: '0 4px 16px' } });

    // Hypothesis
    body.appendChild(UI.el('div', { class: 'col gap1' }, [
      UI.el('div', { class: 'eyebrow' }, t('exp.hypothesis')),
      UI.el('div', { class: 'small', style: { lineHeight: '1.5' } }, exp.hypothesis || exp.title),
    ]));

    // Verdict
    body.appendChild(UI.el('div', { class: 'glass-card card col gap1' }, [
      UI.el('div', { class: 'eyebrow' }, t('exp.verdict')),
      UI.el('div', { class: 'b', style: { color: verdictColor(vKey) } }, t('exp.' + vKey)),
      UI.el('div', { class: 'tiny soft', style: { marginTop: '4px' } }, t('exp.verdictHonest')),
    ]));

    // Stats
    if (res.ok) {
      const metLabel = METRIC_LABELS[exp.measureMetric] || exp.measureMetric || '';
      body.appendChild(UI.el('div', { class: 'col gap2' }, [
        UI.el('div', { class: 'eyebrow' }, t('exp.result')),
        UI.el('div', { class: 'tiles' }, [
          UI.tile(
            UI.fmt.num(res.meanA, 2),
            t('exp.didIt'),
            metLabel,
          ),
          UI.tile(
            UI.fmt.num(res.meanB, 2),
            t('exp.didntDo'),
            metLabel,
          ),
        ]),
        UI.el('div', { class: 'row between gap2 small soft' }, [
          UI.el('span', {}, t('exp.confidenceData', { n: (exp.logs || []).length })),
          UI.el('span', {}, 'n=' + res.nA + '/' + res.nB),
        ]),
      ]));
    }

    // Protocol steps
    if (exp.protocolSteps && exp.protocolSteps.length) {
      const stepList = UI.el('div', { class: 'col gap2' });
      exp.protocolSteps.forEach((step, i) => {
        stepList.appendChild(UI.el('div', { class: 'row gap2', style: { alignItems: 'flex-start' } }, [
          UI.el('span', { class: 'tiny soft', style: { minWidth: '18px', marginTop: '2px' } }, (i + 1) + '.'),
          UI.el('span', { class: 'small', style: { lineHeight: '1.5' } }, step),
        ]));
      });
      body.appendChild(UI.el('div', { class: 'col gap2' }, [
        UI.el('div', { class: 'eyebrow' }, t('exp.protocol')),
        stepList,
      ]));
    }

    UI.sheet({ title: exp.title, body });
  }

  // --------------------------------------------------------------------------
  // Active experiment card
  // --------------------------------------------------------------------------
  function renderActiveExperiment(root, exp) {
    const section = UI.el('div', { class: 'col gap3' });
    section.appendChild(UI.el('div', { class: 'eyebrow' }, t('exp.active')));

    const logs = exp.logs || [];
    const done = logs.length;
    const total = exp.total || 14;
    const pct = Math.min(100, (done / total) * 100);

    const isActive = todayIsActiveDay(exp);
    const logged = alreadyLoggedToday(exp);
    const autoFinish = done >= total;

    const card = UI.el('div', { class: 'glass-card card col gap3' });

    // Title row
    card.appendChild(UI.el('div', { class: 'col gap1' }, [
      UI.el('div', { class: 'b' }, exp.title),
      UI.el('div', { class: 'small soft', style: { lineHeight: '1.5' } }, exp.hypothesis),
    ]));

    // Progress bar
    card.appendChild(UI.el('div', { class: 'col gap1' }, [
      UI.el('div', { class: 'row between' }, [
        UI.el('div', { class: 'tiny soft' }, t('exp.progress')),
        UI.el('div', { class: 'tiny soft' }, t('exp.dayN', { n: done, total })),
      ]),
      UI.el('div', { class: 'confbar', style: { marginTop: '4px' } }, [
        UI.el('i', { style: { width: pct + '%' } }),
      ]),
    ]));

    // Today's log control
    if (!autoFinish) {
      const todaySection = UI.el('div', { class: 'col gap2' });

      const label = isActive ? t('exp.doToday') : t('exp.skipToday');
      todaySection.appendChild(UI.el('div', { class: 'row gap2', style: { alignItems: 'center' } }, [
        UI.frag(`<span style="width:16px;height:16px;color:${isActive ? 'var(--a1)' : 'var(--ink-ghost)'}">${Icons.get(isActive ? 'bolt' : 'moon')}</span>`),
        UI.el('div', { class: 'small b' }, label),
      ]));

      if (logged) {
        const lastLog = logs[logs.length - 1];
        todaySection.appendChild(UI.el('div', { class: 'row gap2', style: { alignItems: 'center' } }, [
          UI.frag(`<span style="width:16px;height:16px;color:var(--good)">${Icons.get('check')}</span>`),
          UI.el('div', { class: 'small soft' }, lastLog.did ? t('exp.didIt') : t('exp.didntDo')),
        ]));
      } else {
        const btnRow = UI.el('div', { class: 'row gap2' });

        const didBtn = UI.btn(t('exp.didIt'), {
          class: 'btn-primary',
          icon: 'check',
          onClick: () => logDay(exp, true, btnRow),
        });
        const didntBtn = UI.btn(t('exp.didntDo'), {
          class: 'btn-ghost',
          onClick: () => logDay(exp, false, btnRow),
        });

        btnRow.appendChild(didBtn);
        btnRow.appendChild(didntBtn);
        todaySection.appendChild(btnRow);
      }

      card.appendChild(todaySection);
    }

    // Protocol steps (collapsed)
    if (exp.protocolSteps && exp.protocolSteps.length) {
      const toggle = UI.el('button', { class: 'tiny care-link', style: { textAlign: 'left' } }, t('exp.protocol') + ' ▾');
      const stepList = UI.el('div', { class: 'col gap1', style: { display: 'none' } });
      exp.protocolSteps.forEach((step, i) => {
        stepList.appendChild(UI.el('div', { class: 'row gap2', style: { alignItems: 'flex-start' } }, [
          UI.el('span', { class: 'tiny soft', style: { minWidth: '16px' } }, (i + 1) + '.'),
          UI.el('span', { class: 'tiny soft', style: { lineHeight: '1.5' } }, step),
        ]));
      });
      toggle.addEventListener('click', () => {
        const hidden = stepList.style.display === 'none';
        stepList.style.display = hidden ? 'flex' : 'none';
        toggle.textContent = t('exp.protocol') + (hidden ? ' ▴' : ' ▾');
      });
      card.appendChild(toggle);
      card.appendChild(stepList);
    }

    // Finish / end early
    const finishRow = UI.el('div', { class: 'row gap2', style: { marginTop: '4px' } });

    if (autoFinish) {
      finishRow.appendChild(UI.btn(t('app.finish'), {
        class: 'btn-primary',
        icon: 'flag',
        block: true,
        onClick: () => finishExperiment(exp),
      }));
    } else {
      finishRow.appendChild(UI.btn(t('exp.finishEarly'), {
        class: 'btn-ghost',
        onClick: async () => {
          const yes = await UI.confirm(t('exp.finishEarly') + '?', { confirmLabel: t('app.finish') });
          if (yes) finishExperiment(exp);
        },
      }));
    }

    card.appendChild(finishRow);
    section.appendChild(card);
    root.appendChild(section);
  }

  // --------------------------------------------------------------------------
  // Log a day
  // --------------------------------------------------------------------------
  function logDay(exp, did, btnRow) {
    const today = Store.today();
    const metricValue = Store.derive.metricValue(exp.measureMetric || exp.metric, today);

    const logs = exp.logs || [];
    logs.push({ date: today, did, metricValue });

    Store.experiments.update(exp.id, { logs });

    UI.haptic('light');
    UI.toast(did ? t('exp.didIt') : t('exp.didntDo'));

    // Refresh view
    Anchor.refresh();
  }

  // --------------------------------------------------------------------------
  // "Write your own" sheet
  // --------------------------------------------------------------------------
  function showCustomSheet(onStart) {
    const body = UI.el('div', { class: 'col gap3', style: { padding: '0 4px 16px' } });

    // Title input
    const titleInput = UI.el('input', {
      class: 'input',
      type: 'text',
      placeholder: t('exp.customTitle'),
    });
    body.appendChild(UI.field(t('exp.customTitle'), titleInput));

    // Hypothesis input
    const hypInput = UI.el('textarea', {
      class: 'input',
      rows: 3,
      placeholder: t('exp.customHypothesis'),
      style: { resize: 'vertical', minHeight: '72px' },
    });
    body.appendChild(UI.field(t('exp.hypothesis'), hypInput));

    // Metric select
    const metricSel = UI.el('select', { class: 'input' });
    METRIC_OPTIONS.forEach(opt => {
      metricSel.appendChild(UI.el('option', { value: opt.value }, opt.label));
    });
    body.appendChild(UI.field(t('exp.measure'), metricSel));

    // Duration
    const durSel = UI.el('select', { class: 'input' });
    [7, 14, 21].forEach(d => {
      durSel.appendChild(UI.el('option', { value: d, selected: d === 14 }, d + ' ' + t('app.days')));
    });
    body.appendChild(UI.field(t('exp.duration'), durSel));

    // Status/error area
    const status = UI.el('div', { class: 'small soft', style: { minHeight: '20px' } });
    body.appendChild(status);

    // Start button
    const startBtn = UI.btn(t('exp.startExp'), {
      class: 'btn-primary btn-block',
      icon: 'lab',
      onClick: async () => {
        const title = (titleInput.value || '').trim();
        const hyp = (hypInput.value || '').trim();
        if (!title || !hyp) {
          status.textContent = '⚠ ' + t('app.required');
          return;
        }
        const metric = metricSel.value;
        const total = parseInt(durSel.value, 10) || 14;

        startBtn.disabled = true;
        status.textContent = t('exp.design');

        try {
          const design = await designProtocol(hyp, metric, total);
          design.title = design.title || title;
          onStart(design);
        } catch (e) {
          status.textContent = e.message || t('app.retry');
          startBtn.disabled = false;
        }
      },
    });
    body.appendChild(startBtn);

    const s = UI.sheet({ title: t('exp.writeOwn'), body });
    return s;
  }

  // --------------------------------------------------------------------------
  // Preset library card
  // --------------------------------------------------------------------------
  function renderLibrary(root, hasActive) {
    const section = UI.el('div', { class: 'col gap3' });
    section.appendChild(UI.el('div', { class: 'eyebrow' }, t('exp.library')));

    if (hasActive) {
      section.appendChild(UI.el('div', { class: 'small soft glass-card card' },
        t('exp.active') + ' — ' + t('exp.finishEarly').toLowerCase() + ' ' + t('app.done').toLowerCase() + ' ' + t('app.continue').toLowerCase() + '.'
      ));
    }

    const grid = UI.el('div', { class: 'col gap2' });

    // Custom "write your own" option
    const customCard = UI.card([
      UI.el('div', { class: 'row gap3', style: { alignItems: 'center' } }, [
        UI.el('div', { class: 'col gap1 grow' }, [
          UI.el('div', { class: 'b small' }, t('exp.writeOwn')),
          UI.el('div', { class: 'tiny soft' }, t('exp.customHypothesis')),
        ]),
        UI.frag(`<span style="width:20px;height:20px;color:var(--a1)">${Icons.get('plus')}</span>`),
      ]),
    ], {
      onClick: hasActive ? null : () => {
        showCustomSheet((design) => startExperiment(design));
      },
      class: hasActive ? 'muted' : '',
    });
    grid.appendChild(customCard);

    presets().forEach(p => {
      const presetCard = UI.card([
        UI.el('div', { class: 'row gap3', style: { alignItems: 'center' } }, [
          UI.frag(`<span style="width:22px;height:22px;color:var(--a1);flex-shrink:0">${Icons.get(p.icon)}</span>`),
          UI.el('div', { class: 'col gap1 grow' }, [
            UI.el('div', { class: 'b small' }, p.hypothesisPrompt),
            UI.el('div', { class: 'tiny soft' }, (METRIC_LABELS[p.metric] || p.metric) + ' · ' + p.total + ' ' + t('app.days')),
          ]),
          UI.frag(`<span style="width:16px;height:16px;color:var(--ink-ghost)">${Icons.get('chevron')}</span>`),
        ]),
      ], {
        onClick: hasActive ? null : () => startFromPreset(p),
        class: hasActive ? 'muted' : '',
      });
      grid.appendChild(presetCard);
    });

    section.appendChild(grid);
    root.appendChild(section);
  }

  // --------------------------------------------------------------------------
  // Start from a preset
  // --------------------------------------------------------------------------
  async function startFromPreset(p) {
    // Show a confirmation/design sheet
    const body = UI.el('div', { class: 'col gap3', style: { padding: '0 4px 16px' } });

    body.appendChild(UI.el('div', { class: 'small', style: { lineHeight: '1.6' } }, p.hypothesisPrompt));

    const metLabel = UI.el('div', { class: 'row between small' }, [
      UI.el('span', { class: 'soft' }, t('exp.measure')),
      UI.el('span', { class: 'b' }, METRIC_LABELS[p.metric] || p.metric),
    ]);
    body.appendChild(metLabel);

    const durLabel = UI.el('div', { class: 'row between small' }, [
      UI.el('span', { class: 'soft' }, t('exp.duration')),
      UI.el('span', { class: 'b' }, p.total + ' ' + t('app.days')),
    ]);
    body.appendChild(durLabel);

    const status = UI.el('div', { class: 'small soft', style: { minHeight: '20px' } });
    body.appendChild(status);

    let sheetRef = null;

    const startBtn = UI.btn(t('exp.startExp'), {
      class: 'btn-primary btn-block',
      icon: 'lab',
      onClick: async () => {
        startBtn.disabled = true;
        status.textContent = t('exp.design');
        try {
          const design = await designProtocol(p.hypothesisPrompt, p.metric, p.total);
          if (sheetRef) sheetRef.close();
          startExperiment(design);
        } catch (e) {
          status.textContent = e.message || t('app.retry');
          startBtn.disabled = false;
        }
      },
    });
    body.appendChild(startBtn);

    sheetRef = UI.sheet({ title: p.hypothesisPrompt, body });
  }

  // --------------------------------------------------------------------------
  // Save and activate an experiment
  // --------------------------------------------------------------------------
  function startExperiment(design) {
    const today = Store.today();
    Store.experiments.add({
      title: design.title,
      hypothesis: design.hypothesis,
      metric: design.metric || design.measureMetric,
      measureMetric: design.measureMetric || design.metric,
      protocolSteps: design.protocolSteps || [],
      total: design.total || 14,
      startDate: today,
      status: 'running',
      logs: [],
    });
    UI.toast(t('exp.startExp'));
    UI.haptic('success');
    Anchor.refresh();
  }

  // --------------------------------------------------------------------------
  // Empty state when no active and no past experiments
  // --------------------------------------------------------------------------
  function renderEmptyState(root) {
    root.appendChild(UI.empty(
      UI.frag(`<span style="width:32px;height:32px;color:var(--ink-ghost)">${Icons.get('lab')}</span>`),
      t('exp.noActive'),
      t('exp.intro')
    ));
  }

  // --------------------------------------------------------------------------
  // Main render
  // --------------------------------------------------------------------------
  function render(root) {
    // ---- Page head ----
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('h1', { class: 'page-title serif' }, t('exp.title')),
      UI.el('div', { class: 'small soft mt1' }, t('exp.sub')),
    ]));

    const grid = UI.el('div', { class: 'col gap4 stagger' });
    root.appendChild(grid);

    // ---- Intro card ----
    grid.appendChild(UI.card([
      UI.el('div', { class: 'row gap3', style: { alignItems: 'flex-start' } }, [
        UI.frag(`<span style="width:22px;height:22px;color:var(--a1);flex-shrink:0;margin-top:2px">${Icons.get('lab')}</span>`),
        UI.el('div', { class: 'small', style: { lineHeight: '1.6' } }, t('exp.intro')),
      ]),
    ]));

    // ---- Gather state ----
    const activeExp = Store.derive.activeExperiment();
    const allExps = Store.experiments.all();
    const hasDone = allExps.some(e => e.status === 'done');
    const hasAny = allExps.length > 0;

    // ---- Active experiment ----
    if (activeExp) {
      renderActiveExperiment(grid, activeExp);
    } else if (!hasAny) {
      renderEmptyState(grid);
    }

    // ---- Experiment library (preset hypotheses) ----
    renderLibrary(grid, !!activeExp);

    // ---- Past experiments ----
    if (hasDone) {
      renderPastExperiments(grid);
    }

    // ---- "What works for me" profile ----
    const winsSection = UI.el('div', { class: 'col gap3' });
    renderWhatWorks(winsSection);
    grid.appendChild(winsSection);
  }

  // --------------------------------------------------------------------------
  // Register
  // --------------------------------------------------------------------------
  Anchor.register({
    id: 'experiments',
    labelKey: 'nav.experiments',
    icon: 'lab',
    order: 55,
    tab: false,
    render,
  });

})();
