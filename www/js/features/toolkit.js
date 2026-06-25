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
      id: 'ai',
      ico: '✨',
      nameKey: 'tk.ai',
      subKey: 'tk.aiSub',
      durationLabel: 'made for you',
      featured: true,
    },
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
      class: 'tk-card glass-card' + (ex.featured ? ' tk-card-ai' : ''),
      onclick: () => {
        UI.haptic('light');
        openSession(ex.id, root);
      },
    }, [
      ex.featured ? el('div', { class: 'tk-ai-badge' }, '✦ ' + t('tk.aiTag')) : null,
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
      case 'ai':         sessionAI(root);         break;
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
  // AI GROUNDING — a live, made-for-you calming sequence.
  // The user picks (once) what tends to calm them; Anchor's AI then composes a
  // short, personalized grounding session in the moment, shaped by those
  // preferences AND how they're doing right now (mood / energy / time of day),
  // and guides them through it step-by-step (with optional read-aloud). It's a
  // companion ritual, never clinical. Falls back to a built-in personalized
  // sequence when AI isn't reachable, so it always works.
  // =============================================================================
  const CALM_PREFS = [
    { id: 'nature',   key: 'tk.prefNature',   emoji: '🌿' },
    { id: 'breath',   key: 'tk.prefBreath',   emoji: '🫁' },
    { id: 'body',     key: 'tk.prefBody',     emoji: '🧘' },
    { id: 'words',    key: 'tk.prefWords',    emoji: '💬' },
    { id: 'senses',   key: 'tk.prefSenses',   emoji: '✋' },
    { id: 'imagine',  key: 'tk.prefImagine',  emoji: '🌅' },
    { id: 'stillness',key: 'tk.prefStill',    emoji: '🕊️' },
    { id: 'sound',    key: 'tk.prefSound',    emoji: '🎧' },
  ];

  function getPrefs() { return Store.get('settings.calmPrefs', null); }
  function savePrefs(p) { Store.set('settings.calmPrefs', p); }

  function sessionAI(root) {
    _clearAllTimers();
    const prefs = getPrefs();
    if (!prefs || !prefs.likes || !prefs.likes.length) prefsForm(root);
    else generateAndPlay(root, prefs);
  }

  // ---- one-time (editable) preference picker ---------------------------------
  function prefsForm(root) {
    _clearAllTimers();
    UI.clear(root);
    const existing = getPrefs() || { likes: [], note: '' };
    const likes = new Set(existing.likes || []);
    let note = existing.note || '';

    const chips = el('div', { class: 'row wrap gap2' }, CALM_PREFS.map(p => {
      const c = el('button', { class: 'chip' + (likes.has(p.id) ? ' active' : ''), onclick: () => {
        UI.haptic('light');
        if (likes.has(p.id)) { likes.delete(p.id); c.classList.remove('active'); }
        else { likes.add(p.id); c.classList.add('active'); }
      } }, p.emoji + ' ' + t(p.key));
      return c;
    }));

    const noteInput = el('textarea', { class: 'textarea', placeholder: t('tk.aiPrefsPlaceholder'), rows: 2, style: { minHeight: '64px' } });
    noteInput.value = note;
    noteInput.addEventListener('input', () => { note = noteInput.value; });

    root.appendChild(el('div', { class: 'page-head' }, [
      el('div', { class: 'eyebrow' }, '✦ ' + t('tk.aiTag')),
      el('h1', { class: 'page-title serif' }, t('tk.aiPrefsTitle')),
      el('p', { class: 'small soft mt2', style: { lineHeight: '1.6' } }, t('tk.aiPrefsSub')),
    ]));
    root.appendChild(el('div', { class: 'glass-card card col gap4' }, [
      el('div', { class: 'small soft' }, t('tk.aiPrefsPick')),
      chips,
      el('div', { class: 'small soft', style: { marginTop: '4px' } }, t('tk.aiPrefsNote')),
      noteInput,
    ]));
    root.appendChild(el('div', { class: 'row gap2', style: { marginTop: 'var(--s4)' } }, [
      UI.btn(t('app.back'), { class: 'btn-ghost', onClick: () => showGrid(root) }),
      UI.btn(t('tk.aiBegin'), { class: 'btn-primary grow', icon: 'spark', onClick: () => {
        const p = { likes: Array.from(likes), note: (note || '').trim() };
        if (!p.likes.length && !p.note) { UI.toast(t('tk.aiPickOne'), 'bad'); UI.haptic('error'); return; }
        savePrefs(p);
        generateAndPlay(root, p);
      } }),
    ]));
  }

  // ---- generate (AI, with a graceful local fallback) -------------------------
  function calmContext(prefs) {
    const m = Store.derive.dayMood(Store.today()) || Store.derive.dayMood(Store.daysAgoKey(1));
    const v = Store.derive.vitality ? Store.derive.vitality() : null;
    const h = new Date().getHours();
    const tod = h < 5 ? 'late night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
    const likeNames = (prefs.likes || []).map(id => { const p = CALM_PREFS.find(x => x.id === id); return p ? t(p.key) : id; });
    return {
      likes: likeNames, note: prefs.note || '',
      weather: m ? m.weather : null, valence: m ? m.valence : null,
      energyBand: v ? v.band : null, tod,
    };
  }
  function calmPrompt(c) {
    return 'Create a SHORT, personalized grounding / calming exercise to do right now.\n' +
      'What tends to calm this person: ' + (c.likes.join(', ') || 'unspecified') + '.\n' +
      (c.note ? 'In their words, what helps: "' + c.note + '".\n' : '') +
      'Right now — time: ' + c.tod + (c.weather ? ', inner weather: ' + c.weather : '') + (c.energyBand ? ', energy: ' + c.energyBand : '') + '.\n\n' +
      'Compose a gentle, NON-clinical guided sequence that leans into their preferences. Return JSON ONLY:\n' +
      '{ "title": "<short, calming title>",\n' +
      '  "intro": "<one warm sentence to settle in>",\n' +
      '  "steps": [ { "text": "<one short spoken instruction in second person, present tense, 1-2 sentences>", "seconds": <whole number 15-45> } ],\n' +
      '  "closing": "<one short, kind closing line>" }\n' +
      'Give 4 to 6 steps. Simple, sensory, present-tense language. No medical claims, no diagnosis.';
  }
  function sanitizePlan(plan) {
    if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) return null;
    const steps = plan.steps.slice(0, 6).map(s => ({
      text: String((s && s.text) || '').trim(),
      seconds: Math.max(8, Math.min(60, Math.round((s && s.seconds) || 25))),
    })).filter(s => s.text);
    if (!steps.length) return null;
    return { title: String(plan.title || t('tk.ai')).trim(), intro: String(plan.intro || '').trim(), steps, closing: String(plan.closing || '').trim() };
  }
  function fallbackPlan(c) {
    // a sensible, preference-aware sequence so the feature always works offline
    const steps = [];
    steps.push({ text: t('tk.fbSettle'), seconds: 20 });
    if (c.likes.indexOf(t('tk.prefBreath')) !== -1 || !c.likes.length) steps.push({ text: t('tk.fbBreath'), seconds: 30 });
    if (c.likes.indexOf(t('tk.prefSenses')) !== -1 || c.likes.indexOf(t('tk.prefNature')) !== -1) steps.push({ text: t('tk.fbSenses'), seconds: 30 });
    if (c.likes.indexOf(t('tk.prefBody')) !== -1) steps.push({ text: t('tk.fbBody'), seconds: 25 });
    if (c.likes.indexOf(t('tk.prefImagine')) !== -1 || c.likes.indexOf(t('tk.prefNature')) !== -1) steps.push({ text: t('tk.fbImagine'), seconds: 30 });
    if (c.likes.indexOf(t('tk.prefWords')) !== -1) steps.push({ text: t('tk.fbWords'), seconds: 25 });
    steps.push({ text: t('tk.fbClose'), seconds: 20 });
    return { title: t('tk.aiYours'), intro: t('tk.fbIntro'), steps: steps.slice(0, 6), closing: t('tk.fbClosing') };
  }

  function generateAndPlay(root, prefs) {
    _clearAllTimers();
    UI.clear(root);
    const c = calmContext(prefs);
    // loading stage
    const wrap = el('div', { class: 'tk-stage' }, [
      el('div', { class: 'tk-orb in' }, [el('div', { class: 'tk-count' }, '✦')]),
      el('div', { class: 'tk-phase' }, t('tk.aiGenerating')),
      el('div', { class: 'small soft tac', style: { maxWidth: '260px', lineHeight: '1.5' } }, t('tk.aiGeneratingSub')),
      el('button', { class: 'btn btn-ghost btn-sm', style: { marginTop: 'var(--s5)' }, onclick: () => showGrid(root) }, t('app.cancel')),
    ]);
    root.appendChild(wrap);
    if (UI.startHum) UI.startHum();

    const done = (plan) => { if (UI.stopHum) UI.stopHum(); playPlan(root, plan); };

    if (window.LLM && LLM.configured()) {
      LLM.json(calmPrompt(c), { temperature: 0.7 })
        .then(raw => { const p = sanitizePlan(raw); done(p || fallbackPlan(c)); })
        .catch(() => { done(fallbackPlan(c)); });
    } else {
      // no AI configured — still deliver a personalized sequence locally
      setTimeout(() => done(fallbackPlan(c)), 500);
    }
  }

  // ---- guided playback -------------------------------------------------------
  function playPlan(root, plan) {
    _clearAllTimers();
    let running = true, idx = 0, secsLeft = 0;
    const total = plan.steps.length;
    const ttsOn = window.Speech && Speech.ttsSupported() && Store.get('settings.tts', true) !== false;

    const { orb, phaseEl, countEl, bodyEl } = buildStage(root, {
      onStop: () => { running = false; if (window.Speech && Speech.stop) Speech.stop(); },
    });

    const progress = el('div', { class: 'tk-ai-progress' }, [el('i', { style: { width: '0%' } })]);
    bodyEl.appendChild(progress);
    const skip = el('button', { class: 'btn btn-ghost btn-sm', style: { marginTop: 'var(--s3)' }, onclick: () => nextStep() }, t('tk.aiSkip'));
    bodyEl.appendChild(skip);

    if (plan.intro) UI.toast(plan.intro, 'good');

    let ticker = null;
    function showStep() {
      if (!running) return;
      const s = plan.steps[idx];
      orb.classList.remove('in', 'out');
      orb.classList.add(idx % 2 === 0 ? 'in' : 'out');   // gentle breathing motion across steps
      phaseEl.textContent = s.text;
      secsLeft = s.seconds;
      countEl.textContent = String(secsLeft);
      progress.firstChild.style.width = Math.round((idx / total) * 100) + '%';
      UI.haptic('light');
      if (ttsOn) { try { Speech.speak(s.text); } catch (e) {} }
    }
    function nextStep() {
      if (!running) return;
      if (window.Speech && Speech.stop) Speech.stop();
      idx++;
      if (idx >= total) { finishAI(root, plan); return; }
      showStep();
    }

    showStep();
    ticker = _addInterval(() => {
      if (!running) return;
      secsLeft--;
      if (secsLeft <= 0) nextStep();
      else countEl.textContent = String(secsLeft);
    }, 1000);
  }

  function finishAI(root, plan) {
    _clearAllTimers();
    if (window.Speech && Speech.stop) Speech.stop();
    UI.clear(root);
    (UI.hapticSuccess || UI.haptic)('success');
    const card = el('div', { class: 'glass-card card', style: { textAlign: 'center', maxWidth: '300px', marginTop: 'var(--s2)' } }, [
      el('div', { class: 'b', style: { fontSize: '1.2rem', lineHeight: '1.4' } }, plan.closing || t('tk.fbClosing')),
    ]);
    if (window.Speech && Speech.ttsSupported() && Store.get('settings.tts', true) !== false) {
      const rb = Speech.readButton(() => plan.closing || t('tk.fbClosing'));
      if (rb) card.appendChild(el('div', { style: { marginTop: 'var(--s2)' } }, [rb]));
    }
    root.appendChild(el('div', { class: 'tk-stage' }, [
      el('div', { style: { fontSize: '3rem', lineHeight: '1' } }, '🤍'),
      el('div', { class: 'tk-phase' }, t('tk.after')),
      card,
      el('div', { class: 'row gap2', style: { marginTop: 'var(--s5)' } }, [
        UI.btn(t('tk.aiAgain'), { class: 'btn-ghost', onClick: () => { const p = getPrefs(); generateAndPlay(root, p || { likes: [], note: '' }); } }),
        UI.btn(t('app.done'), { class: 'btn-primary', onClick: () => showGrid(root) }),
      ]),
      el('button', { class: 'tiny muted', style: { marginTop: 'var(--s3)', textDecoration: 'underline' }, onclick: () => prefsForm(root) }, t('tk.aiEditPrefs')),
    ]));
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
