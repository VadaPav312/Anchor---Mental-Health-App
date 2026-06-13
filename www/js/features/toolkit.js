// ===========================================================================
// toolkit.js — Grounding toolkit. A library of five guided calming exercises.
//
// Exercises:
//   1. Box breathing      – inhale 4 s / hold 4 s / exhale 4 s / hold 4 s
//   2. Slow exhale        – inhale 4 s, exhale 7 s (parasympathetic)
//   3. 5-4-3-2-1 senses  – step through the five senses interactively
//   4. Muscle release     – progressive muscle relaxation (PMR), timed
//   5. Self-compassion    – slow-fade kind phrases one at a time
//
// All sessions are fully self-contained: they mount into `root`, manage their
// own timers, and return to the grid cleanly via the stop button or on
// natural completion. No global state leaks between sessions.
//
// prefers-reduced-motion: CSS already suppresses the orb transition; we drive
// all logic via setInterval / setTimeout, never animation-event callbacks,
// so reduced-motion users get correct timing without visual jank.
// ===========================================================================
(function () {

  // ---- timer management -------------------------------------------------------
  // All handles are tracked so _clearAllTimers() can be called on any transition
  // (user taps Stop, page changes, new session starts) to prevent phantom ticks.
  const _timers = { intervals: [], timeouts: [] };

  function _addInterval(fn, ms) {
    const id = setInterval(fn, ms);
    _timers.intervals.push(id);
    return id;
  }

  function _addTimeout(fn, ms) {
    const id = setTimeout(fn, ms);
    _timers.timeouts.push(id);
    return id;
  }

  function _clearAllTimers() {
    _timers.intervals.forEach(clearInterval);
    _timers.timeouts.forEach(clearTimeout);
    _timers.intervals = [];
    _timers.timeouts = [];
  }

  // ---- exercise catalogue -------------------------------------------------------
  const EXERCISES = [
    {
      id: 'box',
      ico: '🫁',
      nameKey: 'tk.box',
      subKey: 'tk.boxSub',
      durationLabel: '4 + 4 + 4 + 4',
    },
    {
      id: 'paced',
      ico: '🌊',
      nameKey: 'tk.paced',
      subKey: 'tk.pacedSub',
      durationLabel: '4 + 7',
    },
    {
      id: 'senses',
      ico: '🌿',
      nameKey: 'tk.senses',
      subKey: 'tk.sensesSub',
      durationLabel: '5 steps',
    },
    {
      id: 'pmr',
      ico: '🧘',
      nameKey: 'tk.pmr',
      subKey: 'tk.pmrSub',
      durationLabel: '~5 min',
    },
    {
      id: 'compassion',
      ico: '🤍',
      nameKey: 'tk.compassion',
      subKey: 'tk.compassionSub',
      durationLabel: '~1 min',
    },
  ];

  // ---- short alias so callsites stay readable ----------------------------------
  function el(tag, attrs, children) { return UI.el(tag, attrs, children); }

  /** Clear `container` and mount a new child node, resetting scroll. */
  function swap(container, node) {
    UI.clear(container);
    container.appendChild(node);
    if (container.scrollTop !== undefined) container.scrollTop = 0;
  }

  // ---- entry point ------------------------------------------------------------
  function render(root) {
    _clearAllTimers();
    showGrid(root);
  }

  // =============================================================================
  // GRID — landing page
  // =============================================================================
  function showGrid(root) {
    _clearAllTimers();
    UI.clear(root);

    // page header
    root.appendChild(
      el('div', { class: 'page-head' }, [
        el('div', { class: 'eyebrow' }, t('tk.sub')),
        el('h1', { class: 'page-title serif' }, t('tk.title')),
        el('p', {
          class: 'small soft mt2',
          style: { lineHeight: '1.6', maxWidth: '340px' },
        }, t('tk.intro')),
      ])
    );

    // 2-column grid of exercise cards
    const grid = el('div', { class: 'tk-grid mt4' });
    EXERCISES.forEach(ex => {
      grid.appendChild(_buildCard(ex, root));
    });
    root.appendChild(grid);

    // breathing reminder at the bottom
    root.appendChild(
      el('p', {
        class: 'tiny muted tac',
        style: { marginTop: 'var(--s6)', lineHeight: '1.5' },
      }, t('care.reminder'))
    );
  }

  function _buildCard(ex, root) {
    return el('button', {
      class: 'tk-card glass-card',
      onclick: () => {
        UI.haptic('light');
        openSession(ex.id, root);
      },
    }, [
      el('div', { class: 'tk-ico' }, ex.ico),
      el('div', { class: 'tk-name' }, t(ex.nameKey)),
      el('div', { class: 'tk-sub' }, t(ex.subKey)),
      el('div', { class: 'tk-shine' }),
    ]);
  }

  // =============================================================================
  // SESSION ROUTER
  // =============================================================================
  function openSession(id, root) {
    _clearAllTimers();
    switch (id) {
      case 'box':        sessionBox(root);        break;
      case 'paced':      sessionPaced(root);      break;
      case 'senses':     sessionSenses(root);     break;
      case 'pmr':        sessionPmr(root);        break;
      case 'compassion': sessionCompassion(root); break;
      default:           showGrid(root);          break;
    }
  }

  // =============================================================================
  // SHARED STAGE BUILDER
  // =============================================================================
  /**
   * Mounts a full-screen session stage into `root`.
   *
   * opts:
   *   showOrb  {boolean}  – default true; set false for non-breathing sessions
   *   onStop   {function} – called BEFORE returning to grid (record stats, etc.)
   *
   * Returns: { stage, orb, phaseEl, countEl, bodyEl }
   *   stage   – the .tk-stage flex column
   *   orb     – the .tk-orb breathing circle (toggle .in / .out to animate)
   *   phaseEl – the .tk-phase label (instruction text)
   *   countEl – the .tk-count label inside the orb (countdown number)
   *   bodyEl  – a col-center area below phaseEl for extra session content
   */
  function buildStage(root, opts) {
    opts = opts || {};

    const stage = el('div', { class: 'tk-stage' });

    // stop button — pinned top-left, above the safe-area inset
    const topBar = el('div', {
      style: {
        position: 'absolute',
        top: 'calc(var(--s4) + env(safe-area-inset-top, 0px))',
        left: 'var(--s4)',
        zIndex: '10',
      },
    }, [
      el('button', {
        class: 'btn btn-ghost btn-sm',
        onclick: () => {
          _clearAllTimers();
          if (opts.onStop) opts.onStop();
          showGrid(root);
        },
      }, t('tk.stop')),
    ]);

    // position:relative wrapper so topBar absolute-positions against it
    const wrap = el('div', {
      style: { position: 'relative', width: '100%', minHeight: '60dvh' },
    }, [topBar, stage]);

    // breathing orb with countdown inside
    const countEl = el('div', { class: 'tk-count' }, '');
    const orb     = el('div', { class: 'tk-orb' }, [countEl]);
    if (opts.showOrb !== false) stage.appendChild(orb);

    // big phase / instruction label
    const phaseEl = el('div', { class: 'tk-phase' }, '');
    stage.appendChild(phaseEl);

    // extra content area (senses steps, compassion lines, etc.)
    const bodyEl = el('div', {
      class: 'col center gap4',
      style: { width: '100%', maxWidth: '360px' },
    });
    stage.appendChild(bodyEl);

    swap(root, wrap);

    return { stage, orb, phaseEl, countEl, bodyEl };
  }

  // =============================================================================
  // SESSION 1 — BOX BREATHING
  // Breathe in 4 s (orb.in) → hold 4 s → breathe out 4 s (orb.out) → hold 4 s
  // Count full cycles; show after-screen with cycle count on stop.
  // =============================================================================
  function sessionBox(root) {
    let cycles    = 0;
    let running   = true;
    let phaseIdx  = 0;
    let secsLeft  = 0;

    const { orb, phaseEl, countEl, bodyEl } = buildStage(root, {
      onStop: () => {
        running = false;
        if (cycles > 0) _showAfter(root, cycles);
      },
    });

    // soft guidance line below the phase label
    const hintEl = el('div', {
      class: 'small soft tac',
      style: { maxWidth: '260px', lineHeight: '1.5', marginTop: '-8px' },
    }, '');
    bodyEl.appendChild(hintEl);

    // Each phase: i18n key, orb CSS class, duration seconds, optional hint
    // Holds keep the SAME orb size as the phase before them, so the circle
    // grows → holds big → shrinks → holds small (not pumping back to normal).
    const PHASES = [
      { key: 'tk.breatheIn',  cls: 'in',  dur: 4 },
      { key: 'tk.hold',       cls: 'in',  dur: 4 },
      { key: 'tk.breatheOut', cls: 'out', dur: 4 },
      { key: 'tk.hold',       cls: 'out', dur: 4 },
    ];

    function advancePhase() {
      if (!running) return;
      const p = PHASES[phaseIdx % PHASES.length];

      orb.classList.remove('in', 'out');
      if (p.cls) orb.classList.add(p.cls);

      phaseEl.textContent = t(p.key);
      secsLeft = p.dur;
      countEl.textContent = String(secsLeft);

      // a cycle completes when we finish the 4th phase (second hold)
      if (phaseIdx > 0 && phaseIdx % 4 === 3) {
        cycles++;
        UI.haptic('light');
        hintEl.textContent = t('tk.cycles', { n: cycles });
      }

      phaseIdx++;
    }

    advancePhase();

    _addInterval(() => {
      if (!running) return;
      secsLeft--;
      if (secsLeft <= 0) {
        advancePhase();
      } else {
        countEl.textContent = String(secsLeft);
      }
    }, 1000);
  }

  // =============================================================================
  // SESSION 2 — SLOW EXHALE (PACED BREATHING)
  // Longer exhale activates the parasympathetic nervous system.
  // Inhale 4 s → exhale 7 s, repeat.
  // =============================================================================
  function sessionPaced(root) {
    let running  = true;
    let phaseIdx = 0;
    let cycles   = 0;
    let secsLeft = 0;

    const { orb, phaseEl, countEl, bodyEl } = buildStage(root, {
      onStop: () => {
        running = false;
        if (cycles > 0) _showAfter(root, cycles);
      },
    });

    const hintEl = el('div', {
      class: 'small soft tac',
      style: { maxWidth: '260px', lineHeight: '1.5', marginTop: '-8px' },
    }, '');
    bodyEl.appendChild(hintEl);

    // 4 in, 7 out — the out-breath is 75 % longer, which is key to the effect
    const PHASES = [
      { key: 'tk.breatheIn',  cls: 'in',  dur: 4 },
      { key: 'tk.breatheOut', cls: 'out', dur: 7 },
    ];

    function advancePhase() {
      if (!running) return;
      const p = PHASES[phaseIdx % PHASES.length];

      orb.classList.remove('in', 'out');
      if (p.cls) orb.classList.add(p.cls);

      phaseEl.textContent = t(p.key);
      secsLeft = p.dur;
      countEl.textContent = String(secsLeft);

      // one full cycle = one inhale + one exhale
      if (phaseIdx > 0 && phaseIdx % 2 === 0) {
        cycles++;
        UI.haptic('light');
        hintEl.textContent = t('tk.cycles', { n: cycles });
      }

      phaseIdx++;
    }

    advancePhase();

    _addInterval(() => {
      if (!running) return;
      secsLeft--;
      if (secsLeft <= 0) {
        advancePhase();
      } else {
        countEl.textContent = String(secsLeft);
      }
    }, 1000);
  }

  // =============================================================================
  // SESSION 3 — 5-4-3-2-1 SENSES
  // Tap Next to step through each sense. Progress shown as numbered pills.
  // Ends with tk.done and a haptic success pulse.
  // =============================================================================
  function sessionSenses(root) {
    const STEPS = [
      t('tk.sensesSee'),
      t('tk.sensesTouch'),
      t('tk.sensesHear'),
      t('tk.sensesSmell'),
      t('tk.sensesTaste'),
    ];
    let stepIdx  = 0;
    let finished = false;

    const { phaseEl, bodyEl } = buildStage(root, { showOrb: false });
    phaseEl.textContent = '';

    // numbered progress pills: 5 → 4 → 3 → 2 → 1 (countdown aesthetic)
    const pillRow = el('div', { class: 'tk-pill-row' });
    STEPS.forEach((_, i) => {
      pillRow.appendChild(el('div', {
        class: 'pill-stat',
        id: 'tk-sense-pip-' + i,
        style: {
          width: '36px',
          justifyContent: 'center',
          opacity: i === 0 ? '1' : '0.28',
          transition: 'opacity 0.4s ease',
        },
      }, String(STEPS.length - i)));
    });

    // the main instruction text
    const stepEl = el('div', {
      class: 'tk-senses-step',
      style: {
        opacity: '0',
        transition: 'opacity 0.5s ease',
        maxWidth: '300px',
        textAlign: 'center',
      },
    }, STEPS[0]);

    // fade step in
    _addTimeout(() => { stepEl.style.opacity = '1'; }, 60);

    const nextBtn = el('button', {
      class: 'btn btn-primary',
      style: { marginTop: 'var(--s4)', minWidth: '160px' },
      onclick: () => {
        if (finished) return;
        UI.haptic('light');
        stepIdx++;

        if (stepIdx >= STEPS.length) {
          finished = true;
          stepEl.style.opacity = '0';
          _addTimeout(() => {
            stepEl.textContent = t('tk.done');
            stepEl.style.opacity = '1';
          }, 500);
          nextBtn.disabled = true;
          nextBtn.style.transition = 'opacity 0.4s';
          nextBtn.style.opacity = '0';
          _confettiHaptic();
          // update all pips to lit
          STEPS.forEach((_, i) => {
            const pip = document.getElementById('tk-sense-pip-' + i);
            if (pip) pip.style.opacity = '0.7';
          });
        } else {
          // cross-fade to next step text
          stepEl.style.opacity = '0';
          _addTimeout(() => {
            stepEl.textContent = STEPS[stepIdx];
            stepEl.style.opacity = '1';
          }, 500);
          // update pill highlights
          STEPS.forEach((_, i) => {
            const pip = document.getElementById('tk-sense-pip-' + i);
            if (!pip) return;
            pip.style.opacity = i === stepIdx ? '1' : i < stepIdx ? '0.55' : '0.28';
          });
        }
      },
    }, t('app.next'));

    bodyEl.appendChild(pillRow);
    bodyEl.appendChild(stepEl);
    bodyEl.appendChild(nextBtn);
  }

  // =============================================================================
  // SESSION 4 — MUSCLE RELEASE (PMR)
  // Walk through each body part: tense 5 s → release 5 s, then move on.
  // The orb is used as a compact visual pulsing indicator (small, dimmed).
  // =============================================================================
  function sessionPmr(root) {
    const parts    = t('tk.parts').split('|');
    let partIdx    = 0;
    let running    = true;
    let tensePhase = true; // true = tense, false = release
    let secsLeft   = 5;

    const { phaseEl, countEl, orb, bodyEl } = buildStage(root, {
      showOrb: true,
      onStop: () => { running = false; },
    });

    // size the orb down and dim it — PMR is a body-scan, not a breathing cue
    orb.style.width   = '96px';
    orb.style.height  = '96px';
    orb.style.opacity = '0.65';

    // the "tense your {part}… and release" instruction
    const pmrInstruction = el('div', {
      class: 'tk-senses-step',
      style: { maxWidth: '300px', textAlign: 'center', lineHeight: '1.5' },
    }, '');

    // a small indicator telling the user which phase of the 2-step they're in
    const pmrPhaseHint = el('div', {
      class: 'small soft tac',
      style: { marginTop: '-8px' },
    }, '');

    bodyEl.appendChild(pmrInstruction);
    bodyEl.appendChild(pmrPhaseHint);

    // progress counter: "part 1 of 7"
    const progressEl = el('div', {
      class: 'tiny muted tac',
      style: { marginTop: 'var(--s2)' },
    }, '');
    bodyEl.appendChild(progressEl);

    function updateDisplay() {
      if (!running) return;

      if (partIdx >= parts.length) {
        // all done
        phaseEl.textContent   = t('tk.done');
        pmrInstruction.textContent = '';
        pmrPhaseHint.textContent   = '';
        progressEl.textContent     = '';
        countEl.textContent        = '';
        orb.classList.remove('in', 'out');
        _confettiHaptic();
        return;
      }

      const part = parts[partIdx];
      pmrInstruction.textContent = t('tk.pmrStep', { part });
      progressEl.textContent = (partIdx + 1) + ' / ' + parts.length;

      if (tensePhase) {
        phaseEl.textContent = '↑';
        pmrPhaseHint.textContent = part;
        orb.classList.remove('out');
        orb.classList.add('in');
        countEl.textContent = String(secsLeft);
      } else {
        phaseEl.textContent = '↓';
        pmrPhaseHint.textContent = part;
        orb.classList.remove('in');
        orb.classList.add('out');
        countEl.textContent = String(secsLeft);
      }
    }

    updateDisplay();

    _addInterval(() => {
      if (!running || partIdx >= parts.length) return;
      secsLeft--;
      if (secsLeft <= 0) {
        secsLeft = 5;
        if (tensePhase) {
          tensePhase = false;
          UI.haptic('light'); // gentle nudge: "now release"
        } else {
          tensePhase = true;
          partIdx++;
        }
        updateDisplay();
      } else {
        countEl.textContent = String(secsLeft);
      }
    }, 1000);
  }

  // =============================================================================
  // SESSION 5 — SELF-COMPASSION
  // Display each phrase with a slow cross-fade, ~3.8 s each. No buttons needed
  // — the session runs at its own pace and ends with tk.done.
  // =============================================================================
  function sessionCompassion(root) {
    const lines   = t('tk.compassionLines').split('|');
    let lineIdx   = 0;
    let finished  = false;
    const SHOW_MS = 3800; // how long each line stays visible
    const FADE_MS = 900;  // cross-fade duration (must match CSS transition)

    const { phaseEl, bodyEl } = buildStage(root, { showOrb: false });
    phaseEl.textContent = '';

    // the flowing compassion phrase
    const lineEl = el('div', {
      class: 'tk-senses-step',
      style: {
        fontStyle: 'italic',
        opacity: '0',
        transition: 'opacity ' + (FADE_MS / 1000) + 's ease',
        maxWidth: '300px',
        textAlign: 'center',
        lineHeight: '1.65',
        letterSpacing: '0.01em',
      },
    }, lines[0]);

    // small progress indicator so the user knows more is coming
    const progressEl = el('div', {
      class: 'tiny muted tac',
      style: { marginTop: 'var(--s2)', transition: 'opacity 0.4s' },
    }, (lineIdx + 1) + ' / ' + lines.length);

    bodyEl.appendChild(lineEl);
    bodyEl.appendChild(progressEl);

    // fade the first line in after a brief settle
    _addTimeout(() => { lineEl.style.opacity = '1'; }, 80);

    function crossFadeTo(text, opts) {
      opts = opts || {};
      lineEl.style.opacity = '0';
      _addTimeout(() => {
        lineEl.textContent = text;
        if (opts.normal) lineEl.style.fontStyle = 'normal';
        lineEl.style.opacity = '1';
        if (opts.onVisible) opts.onVisible();
      }, FADE_MS);
    }

    function showNextLine() {
      if (finished) return;
      lineIdx++;

      if (lineIdx >= lines.length) {
        finished = true;
        progressEl.style.opacity = '0';
        crossFadeTo(t('tk.done'), {
          normal: true,
          onVisible: _confettiHaptic,
        });
        return;
      }

      progressEl.textContent = (lineIdx + 1) + ' / ' + lines.length;
      crossFadeTo(lines[lineIdx], {
        onVisible: () => {
          _addTimeout(showNextLine, SHOW_MS);
        },
      });
    }

    _addTimeout(showNextLine, SHOW_MS);
  }

  // =============================================================================
  // AFTER-SESSION SUMMARY
  // Shown after the user taps Stop on a breathing session that ran at least one
  // full cycle. Acknowledges the work without being over-the-top.
  // =============================================================================
  function _showAfter(root, cycles) {
    _clearAllTimers();
    UI.clear(root);

    const wrap = el('div', { class: 'tk-stage' }, [
      el('div', { style: { fontSize: '3rem', lineHeight: '1' } }, '🌿'),

      el('div', { class: 'tk-phase' }, t('tk.after')),

      el('div', {
        class: 'glass-card card',
        style: {
          textAlign: 'center',
          maxWidth: '280px',
          marginTop: 'var(--s2)',
        },
      }, [
        el('div', { class: 'b', style: { fontSize: '1.6rem', letterSpacing: '-0.03em' } },
          t('tk.cycles', { n: cycles })
        ),
        el('div', { class: 'small soft mt2' }, t('tk.logged')),
      ]),

      el('button', {
        class: 'btn btn-primary',
        style: { marginTop: 'var(--s5)', minWidth: '180px' },
        onclick: () => showGrid(root),
      }, t('app.done')),

      el('p', {
        class: 'tiny muted tac',
        style: { maxWidth: '260px', lineHeight: '1.5', marginTop: 'var(--s3)' },
      }, t('care.reminder')),
    ]);

    root.appendChild(wrap);
  }

  // =============================================================================
  // UTILITIES
  // =============================================================================

  /**
   * Haptic success pulse on session completion.
   * We deliberately avoid visual confetti here — the sessions are calm spaces
   * and a brief tactile reward is enough.
   */
  function _confettiHaptic() {
    UI.haptic('success');
  }

  // =============================================================================
  // REGISTER
  // =============================================================================
  Anchor.register({
    id:       'toolkit',
    labelKey: 'tk.title',
    icon:     'leaf',
    order:    42,
    tab:      false,
    render,
  });

})();
