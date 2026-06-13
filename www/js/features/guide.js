// ===========================================================================
// guide.js — Guided introduction / tour. A swipeable card carousel that walks
// the user through every Anchor feature. Self-registers as a view (tab:false,
// order:8) and exposes window.Guide = { start, maybeAutoShow }.
//
// Usage:
//   Guide.start()          — navigate to the tour at step 0
//   Guide.maybeAutoShow()  — navigate + return true if tour not yet seen
// ===========================================================================
(function () {

  // ---- Tour step definitions -----------------------------------------------
  const STEPS = [
    { id: 'home',        t: 'tour.home_t',        d: 'tour.home_d'        },
    { id: 'weather',     t: 'tour.weather_t',     d: 'tour.weather_d'     },
    { id: 'patterns',    t: 'tour.patterns_t',    d: 'tour.patterns_d'    },
    { id: 'decompress',  t: 'tour.decompress_t',  d: 'tour.decompress_d'  },
    { id: 'sleep',       t: 'tour.sleep_t',       d: 'tour.sleep_d'       },
    { id: 'monitor',     t: 'tour.monitor_t',     d: 'tour.monitor_d'     },
    { id: 'checkin',     t: 'tour.checkin_t',     d: 'tour.checkin_d'     },
    { id: 'journal',     t: 'tour.journal_t',     d: 'tour.journal_d'     },
    { id: 'experiments', t: 'tour.experiments_t', d: 'tour.experiments_d' },
    { id: 'values',      t: 'tour.values_t',      d: 'tour.values_d'      },
    { id: 'energy',      t: 'tour.energy_t',      d: 'tour.energy_d'      },
    { id: 'toolkit',     t: 'tour.toolkit_t',     d: 'tour.toolkit_d'     },
    { id: 'garden',      t: 'tour.garden_t',      d: 'tour.garden_d'      },
    { id: null,          t: 'tour.care_t',        d: 'tour.care_d'        },
  ];

  // Fallback icons when Anchor.byId can't supply one
  const FALLBACK_ICONS = {
    home:        'home',
    weather:     'weather',
    patterns:    'patterns',
    decompress:  'decompress',
    sleep:       'sleep',
    monitor:     'thermo',
    checkin:     'checkin',
    journal:     'journal',
    experiments: 'lab',
    values:      'compass',
    energy:      'energy',
    toolkit:     'wind',
    garden:      'leaf',
  };

  // ---- Module state ---------------------------------------------------------
  let currentStep = 0;

  // ---- Helpers --------------------------------------------------------------

  function host() {
    return document.getElementById('view');
  }

  /** Replicate onboarding.js's centered full-screen frame pattern. */
  function frame(children) {
    const h = host();
    UI.clear(h);
    const wrap = UI.el('div', {
      class: 'onb-wrap rise',
      style: {
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 'calc(var(--safe-t) + 28px) 22px calc(var(--safe-b) + 28px)',
        maxWidth: '560px',
        margin: '0 auto',
      },
    }, children);
    h.appendChild(wrap);
    h.scrollTop = 0;
  }

  /** Dots stepper — matches onboarding.js exactly. */
  function dots(total, active) {
    return UI.el('div', {
      class: 'row center gap2',
      style: { margin: '0 0 22px' },
    }, Array.from({ length: total }, function (_, i) {
      return UI.el('span', {
        style: {
          width:        i === active ? '22px' : '7px',
          height:       '7px',
          borderRadius: '999px',
          background:   i === active
            ? 'linear-gradient(90deg,var(--a1),var(--a2))'
            : 'var(--ink-ghost)',
          transition:   'all .3s var(--ease-spring)',
        },
      });
    }));
  }

  /** Resolve the icon name for a step. */
  function stepIcon(step) {
    if (!step.id) return 'heart';
    var view = Anchor.byId(step.id);
    if (view && view.icon) return view.icon;
    return FALLBACK_ICONS[step.id] || 'spark';
  }

  /** Large glass icon badge — the focal visual on each card. */
  function iconBadge(iconName) {
    return UI.el('div', {
      class: 'glass-card',
      style: {
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        width:          '96px',
        height:         '96px',
        borderRadius:   '28px',
        margin:         '0 auto 24px',
        background:     'linear-gradient(135deg,rgba(var(--a1-rgb,120,80,255),0.18),rgba(var(--a2-rgb,80,160,255),0.10))',
        boxShadow:      '0 4px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12)',
        color:          'var(--a1)',
        flexShrink:     '0',
      },
    }, [
      UI.frag('<span style="display:inline-flex;width:44px;height:44px">' +
        Icons.get(iconName) + '</span>'),
    ]);
  }

  /** Navigate to a step with haptic feedback. */
  function goStep(n) {
    currentStep = Math.max(0, Math.min(STEPS.length - 1, n));
    UI.haptic('light');
    renderStep();
  }

  /** Finish the tour (done or skip), mark seen, navigate home. */
  function finish() {
    Store.set('flags.tourSeen', true);
    UI.haptic('success');
    Anchor.go('home');
  }

  // ---- First card: intro splash (step 0) -----------------------------------

  function renderIntro() {
    frame([
      // Brand anchor mark
      UI.el('div', {
        class: 'brand-mark',
        style: {
          width:         '72px',
          height:        '72px',
          borderRadius:  '22px',
          margin:        '0 auto 28px',
          animation:     'float-y 4s ease-in-out infinite',
        },
      }),

      // Title + sub
      UI.el('h1', {
        class: 'serif',
        style: {
          fontSize:     '2.4rem',
          textAlign:    'center',
          lineHeight:   '1.05',
          marginBottom: '12px',
        },
      }, t('tour.title')),

      UI.el('p', {
        class: 'soft tac',
        style: { lineHeight: '1.55', fontSize: '1.05rem', marginBottom: '32px' },
      }, t('tour.sub')),

      // Dots: show full count, first position active
      dots(STEPS.length, 0),

      // Primary CTA
      UI.btn(t('tour.start'), {
        class:   'btn-primary btn-lg',
        block:   true,
        icon:    'spark',
        onClick: function () { goStep(0); },
      }),

      // Skip link
      UI.el('button', {
        class:   'btn btn-ghost btn-sm',
        style:   { marginTop: '14px', alignSelf: 'center', opacity: '0.7' },
        onclick: finish,
      }, t('tour.skip')),
    ]);
  }

  // ---- Feature step cards --------------------------------------------------

  function renderStep() {
    var step  = STEPS[currentStep];
    var total = STEPS.length;
    var n     = currentStep + 1;
    var isLast = currentStep === STEPS.length - 1;
    var icon  = stepIcon(step);

    frame([
      // ---- dots stepper ----
      dots(total, currentStep),

      // ---- large glass icon badge ----
      iconBadge(icon),

      // ---- feature name (serif heading) ----
      UI.el('h2', {
        class: 'serif',
        style: {
          fontSize:     '1.9rem',
          textAlign:    'center',
          marginBottom: '10px',
          lineHeight:   '1.1',
        },
      }, t(step.t)),

      // ---- feature description ----
      UI.el('p', {
        class: 'soft tac',
        style: { lineHeight: '1.55', fontSize: '1.0rem', marginBottom: '18px' },
      }, t(step.d)),

      // ---- step counter ----
      UI.el('div', {
        class: 'tiny muted tac',
        style: { marginBottom: '24px', letterSpacing: '0.04em' },
      }, t('tour.step', { n: n, total: total })),

      // ---- Open feature button (not on care card or last card) ----
      (step.id ? UI.btn(t('tour.open'), {
        class:   'btn-ghost btn-sm',
        block:   true,
        icon:    icon,
        onClick: function () { Anchor.go(step.id); },
      }) : null),

      // ---- nav row: Back / Next (or Done on last) ----
      UI.el('div', {
        class: 'row between gap3',
        style: { marginTop: step.id ? '12px' : '0' },
      }, [
        // Back button (hidden on first step)
        (currentStep > 0
          ? UI.btn(t('tour.back'), {
              class:   'btn-ghost',
              onClick: function () { goStep(currentStep - 1); },
            })
          : UI.el('span')   // empty spacer so flex-between works
        ),

        // Next or Done
        (isLast
          ? UI.btn(t('tour.done'), {
              class:   'btn-primary grow',
              onClick: finish,
            })
          : UI.btn(t('tour.next'), {
              class:   'btn-primary grow',
              onClick: function () { goStep(currentStep + 1); },
            })
        ),
      ]),

      // ---- Skip link (on every non-last step) ----
      (!isLast
        ? UI.el('button', {
            class:   'btn btn-ghost btn-sm',
            style:   { marginTop: '12px', alignSelf: 'center', opacity: '0.7' },
            onclick: finish,
          }, t('tour.skip'))
        : null
      ),
    ]);
  }

  // ---- Touch / swipe support -----------------------------------------------

  var _touchStartX = 0;
  var _touchStartY = 0;

  function onTouchStart(e) {
    _touchStartX = e.touches[0].clientX;
    _touchStartY = e.touches[0].clientY;
  }

  function onTouchEnd(e) {
    var dx = e.changedTouches[0].clientX - _touchStartX;
    var dy = e.changedTouches[0].clientY - _touchStartY;
    // Only handle horizontal swipes larger than 44px that aren't more vertical
    if (Math.abs(dx) < 44 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0 && currentStep < STEPS.length - 1) {
      // Swipe left → next
      goStep(currentStep + 1);
    } else if (dx > 0 && currentStep > 0) {
      // Swipe right → back
      goStep(currentStep - 1);
    }
  }

  // ---- Main render (view entry point) --------------------------------------

  function render(container) {
    // Reset to beginning each time the view is shown
    currentStep = 0;

    // Attach swipe listeners to the host view element
    var h = host();
    h.removeEventListener('touchstart', onTouchStart);
    h.removeEventListener('touchend',   onTouchEnd);
    h.addEventListener('touchstart', onTouchStart, { passive: true });
    h.addEventListener('touchend',   onTouchEnd,   { passive: true });

    // Show the intro splash first (step -1 conceptually); pressing Start enters step 0
    renderIntro();
  }

  // ---- Public API ----------------------------------------------------------

  /**
   * start() — navigate to the guide view at step 0.
   * render() will be called by the Anchor router, which resets currentStep.
   */
  function start() {
    Anchor.go('guide');
  }

  /**
   * maybeAutoShow() — if the tour has never been completed or skipped,
   * navigate to it and return true. Otherwise return false.
   */
  function maybeAutoShow() {
    if (Store.get('flags.tourSeen')) return false;
    Anchor.go('guide');
    return true;
  }

  // ---- Register with Anchor ------------------------------------------------

  Anchor.register({
    id:       'guide',
    labelKey: 'tour.title',
    icon:     'spark',
    order:    8,
    tab:      false,
    render:   render,
  });

  // ---- Expose public surface -----------------------------------------------

  window.Guide = { start: start, maybeAutoShow: maybeAutoShow };

})();
