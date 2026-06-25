// ===========================================================================
// guide.js — first-run INTRODUCTION + a hands-on coached TOUR.
//
// Two phases, in order:
//   1. Intro  — a short full-screen splash that explains how the app is laid
//               out (the dock, the You tab, the lifeline). New users only.
//   2. Coach  — a tiny docked card at the bottom of the screen. The REAL app
//               is live above it; pressing Next navigates the app to the next
//               feature so you actually see where everything is and what it
//               does, instead of reading a list of cards.
//
// Public API:
//   Guide.start()          — replay the coached tour (skips the intro)
//   Guide.maybeAutoShow()  — first run: intro → coach. Returns true if shown.
// ===========================================================================
(function () {

  // ---- Coached tour steps: each points at a real, navigable feature ---------
  const STEPS = [
    { id: 'home',        t: 'tour.home_t',        d: 'tour.home_d'        },
    { id: 'weather',     t: 'tour.weather_t',     d: 'tour.weather_d'     },
    { id: 'checkin',     t: 'tour.checkin_t',     d: 'tour.checkin_d'     },
    { id: 'decompress',  t: 'tour.decompress_t',  d: 'tour.decompress_d'  },
    { id: 'patterns',    t: 'tour.patterns_t',    d: 'tour.patterns_d'    },
    { id: 'journal',     t: 'tour.journal_t',     d: 'tour.journal_d'     },
    { id: 'mirror',      t: 'tour.mirror_t',      d: 'tour.mirror_d'      },
    { id: 'sleep',       t: 'tour.sleep_t',       d: 'tour.sleep_d'       },
    { id: 'energy',      t: 'tour.energy_t',      d: 'tour.energy_d'      },
    { id: 'calm',        t: 'tour.calm_t',        d: 'tour.calm_d'        },
    { id: 'toolkit',     t: 'tour.toolkit_t',     d: 'tour.toolkit_d'     },
    { id: 'sounds',      t: 'tour.sounds_t',      d: 'tour.sounds_d'      },
    { id: 'experiments', t: 'tour.experiments_t', d: 'tour.experiments_d' },
    { id: 'values',      t: 'tour.values_t',      d: 'tour.values_d'      },
    { id: 'journey',     t: 'tour.journey_t',     d: 'tour.journey_d'     },
    { id: 'hub',         t: 'hub.title',          d: 'intro.hubDesc'      },
    { id: 'home',        t: 'tour.care_t',        d: 'tour.care_d'        },
  ];

  const FALLBACK_ICONS = {
    home: 'home', weather: 'weather', checkin: 'checkin', patterns: 'patterns',
    journal: 'journal', mirror: 'mirror', sleep: 'sleep', energy: 'energy', calm: 'leaf',
    toolkit: 'leaf', sounds: 'sound', decompress: 'decompress',
    experiments: 'lab', values: 'compass', journey: 'trend', hub: 'grid',
  };

  let currentStep = 0;
  // When the tour auto-shows on first account setup it is FORCED: no skip, no X,
  // so a brand-new user actually meets every feature once. Replaying it later
  // (from Settings/You) is optional and keeps its exits.
  let forced = false;

  function coachHost() { return document.getElementById('coach-host'); }

  function stepIcon(step) {
    if (step.t === 'tour.care_t') return 'heart';
    const v = step.id && Anchor.byId(step.id);
    if (v && v.icon) return v.icon;
    return FALLBACK_ICONS[step.id] || 'spark';
  }

  // =========================================================================
  // PHASE 1 — full-screen introduction (new users only)
  // =========================================================================
  const INTRO = [
    { kind: 'welcome' },
    { icon: 'grid',    t: 'intro.navTitle',  d: 'intro.navDesc'  },
    { icon: 'user',    t: 'intro.hubTitle',  d: 'intro.hubDesc'  },
    { icon: 'heart',   t: 'intro.careTitle', d: 'intro.careDesc' },
  ];
  let introStep = 0;

  function dots(total, active) {
    return UI.el('div', { class: 'row center gap2', style: { margin: '4px 0 0' } },
      Array.from({ length: total }, function (_, i) {
        return UI.el('span', { style: {
          width: i === active ? '22px' : '7px', height: '7px', borderRadius: '999px',
          background: i === active ? 'linear-gradient(90deg,var(--a1),var(--a2))' : 'var(--ink-ghost)',
          transition: 'all .3s var(--ease-spring)',
        } });
      }));
  }

  function renderIntro() {
    const host = coachHost();
    UI.clear(host); host.className = 'coach-host intro-open';
    const slide = INTRO[introStep];
    const isWelcome = slide.kind === 'welcome';
    const last = introStep === INTRO.length - 1;

    const panel = UI.el('div', { class: 'intro-panel glass-strong rise' }, [
      isWelcome
        ? UI.el('div', { class: 'brand-mark', style: { width: '64px', height: '64px', borderRadius: '20px', margin: '0 auto 22px', animation: 'float-y 4s ease-in-out infinite' } })
        : UI.el('div', { class: 'intro-badge' }, [UI.frag('<span style="display:inline-flex;width:40px;height:40px">' + Icons.get(slide.icon) + '</span>')]),
      UI.el('h1', { class: 'serif tac', style: { fontSize: isWelcome ? '2.3rem' : '1.8rem', lineHeight: '1.1', marginBottom: '12px' } },
        isWelcome ? t('intro.title', { name: Store.profile.name() }) : t(slide.t)),
      UI.el('p', { class: 'soft tac', style: { lineHeight: '1.55', fontSize: '1.02rem', maxWidth: '420px', margin: '0 auto' } },
        isWelcome ? t('intro.sub') : t(slide.d)),
      UI.el('div', { class: 'col gap3', style: { marginTop: '28px' } }, [
        UI.btn(last ? t('intro.cta') : t('app.next'), { class: 'btn-primary btn-lg', block: true, icon: last ? 'spark' : null,
          onClick: function () { if (last) startCoach(); else { introStep++; renderIntro(); UI.haptic('light'); } } }),
        // first-run is forced (no skip) so new users actually see the app; a
        // replay from Settings keeps the escape hatch.
        forced ? null : UI.el('button', { class: 'btn btn-ghost btn-sm', style: { alignSelf: 'center', opacity: '0.75' }, onclick: finish }, t('intro.skip')),
      ]),
      dots(INTRO.length, introStep),
    ]);
    host.appendChild(UI.el('div', { class: 'intro-scrim' }));
    host.appendChild(panel);
  }

  // =========================================================================
  // PHASE 2 — the docked coach. The real app is live above this little card.
  // =========================================================================
  function navigateTo(step) {
    if (step.id && Anchor.byId(step.id) && Anchor.current !== step.id) {
      Anchor.go(step.id);
    } else if (step.id && Anchor.current !== step.id) {
      Anchor.go('home');
    }
  }

  function renderCoach() {
    const host = coachHost();
    const step = STEPS[currentStep];
    const total = STEPS.length;
    const isLast = currentStep === total - 1;
    const icon = stepIcon(step);

    // drive the real app to the feature this step is describing
    navigateTo(step);

    UI.clear(host); host.className = 'coach-host coach-open';
    const card = UI.el('div', { class: 'coach glass-strong' }, [
      UI.el('div', { class: 'coach-progress' }, [UI.el('i', { style: { width: ((currentStep + 1) / total * 100) + '%' } })]),
      UI.el('div', { class: 'coach-row' }, [
        UI.el('div', { class: 'coach-badge' }, [UI.frag('<span style="display:inline-flex;width:22px;height:22px">' + Icons.get(icon) + '</span>')]),
        UI.el('div', { class: 'coach-body' }, [
          UI.el('div', { class: 'coach-eyebrow' }, t('tour.step', { n: currentStep + 1, total: total })),
          UI.el('div', { class: 'coach-title serif' }, t(step.t)),
        ]),
        // no close (X) on the forced first-run tour — only on optional replays
        forced ? null : UI.el('button', { class: 'coach-close', 'aria-label': t('tour.skip'), onclick: finish }, UI.frag('<span style="display:inline-flex;width:16px;height:16px">' + Icons.get('x') + '</span>')),
      ]),
      UI.el('p', { class: 'coach-desc' }, t(step.d)),
      UI.el('div', { class: 'coach-nav' }, [
        currentStep > 0
          ? UI.btn(t('tour.back'), { class: 'btn-ghost btn-sm', onClick: function () { goStep(currentStep - 1); } })
          : UI.el('span', { class: 'coach-hint tiny muted' }, t('tour.coachHint')),
        isLast
          ? UI.btn(t('tour.done'), { class: 'btn-primary btn-sm', onClick: finish })
          : UI.btn(t('tour.next'), { class: 'btn-primary btn-sm', icon: 'arrow', onClick: function () { goStep(currentStep + 1); } }),
      ]),
    ]);
    host.appendChild(card);

    // swipe the card to move through the tour (very interactive)
    var sx = 0;
    card.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    card.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) < 48) return;
      if (dx < 0 && currentStep < total - 1) goStep(currentStep + 1);
      else if (dx > 0 && currentStep > 0) goStep(currentStep - 1);
    }, { passive: true });

    // a pulsing spotlight that POINTS at where this feature lives in the nav,
    // so the tour teaches "where" + "what", not just a wall of text.
    setTimeout(function () { placeSpotlight(step); }, 60);
  }

  function spotTarget(step) {
    if (step.t === 'tour.care_t') return '#lifelineBtn';
    var MAIN = ['home', 'weather', 'decompress', 'checkin'];
    if (step.id && MAIN.indexOf(step.id) !== -1) return '.tab[data-tab="' + step.id + '"]';
    return '#navorb';   // second-tier features live in the bloom orb
  }
  function placeSpotlight(step) {
    var host = coachHost(); if (!host || !host.classList.contains('coach-open')) return;
    var old = host.querySelector('.coach-spot'); if (old) old.remove();
    var el = document.querySelector(spotTarget(step)); if (!el) return;
    var r = el.getBoundingClientRect(); if (!r.width) return;
    var spot = UI.el('div', { class: 'coach-spot' });
    spot.style.left = (r.left + r.width / 2) + 'px';
    spot.style.top = (r.top + r.height / 2) + 'px';
    host.appendChild(spot);
  }

  function goStep(n) {
    currentStep = Math.max(0, Math.min(STEPS.length - 1, n));
    UI.haptic('light');
    renderCoach();
  }

  function startCoach() {
    currentStep = 0;
    UI.haptic('light');
    renderCoach();
  }

  function finish() {
    Store.set('flags.tourSeen', true);
    const host = coachHost();
    if (host) { UI.clear(host); host.className = 'coach-host'; }
    (UI.hapticSuccess || UI.haptic)('success');
    Anchor.go('home');
  }

  // ---- Public API ----------------------------------------------------------

  // Replay (from the hub / settings): straight into the coached tour. Optional,
  // so it keeps its exits (skip + X).
  function start() {
    forced = false;
    introStep = 0;
    if (Anchor.current !== 'home') Anchor.go('home');
    startCoach();
  }

  // First run after a brand-new account is created and signed in for the first
  // time: a FORCED intro splash → coached tour (no skip, no X), shown exactly
  // once (gated by flags.tourSeen, which only a fresh account lacks).
  function maybeAutoShow() {
    if (Store.get('flags.tourSeen')) return false;
    forced = true;
    Anchor.go('home');
    introStep = 0;
    renderIntro();
    return true;
  }

  // Keep a lightweight registered view so Anchor.go('guide') still works
  // (older links / deep-links) — it simply launches the coached tour.
  Anchor.register({
    id: 'guide', labelKey: 'tour.title', icon: 'spark', order: 8, tab: false,
    render: function (container) {
      container.appendChild(UI.empty('spark', t('tour.title'), t('tour.sub')));
      setTimeout(start, 50);
    },
  });

  window.Guide = { start: start, maybeAutoShow: maybeAutoShow };

})();
