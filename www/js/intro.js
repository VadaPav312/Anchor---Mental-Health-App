// ===========================================================================
// intro.js — the "simulation": a glossy cinematic that introduces Anchor right
// after the user signs in (first time only). It plays fully on its OWN — scene
// to scene automatically, no taps to continue — walking through what Anchor
// does across many scenes (inner weather → a private morning briefing →
// connected patterns → private journal → sleep, understood → someone to talk
// to → steered by your values → a calm toolkit → private-by-design). When it
// ends it crossfades smoothly into the privacy screen. Skippable; shown once
// ('settings.introSeen').
//
//   Intro.shouldShow()  -> bool   (first launch, not yet seen, not onboarded)
//   Intro.play(done)    -> plays the cinematic, then calls done()
// ===========================================================================
(function () {
  const E = UI.el;
  const SEEN_KEY = 'settings.introSeen';

  function shouldShow() {
    try { if (Store.get('profile.onboarded')) return false; } catch {}
    return Store.get(SEEN_KEY, false) !== true;
  }

  let _timers = [];
  let _finishing = false;
  function clearTimers() { _timers.forEach(id => { clearTimeout(id); clearInterval(id); }); _timers = []; }

  function play(done) {
    const prev = document.getElementById('intro-sim'); if (prev) prev.remove();
    clearTimers();
    _finishing = false;

    const stage = E('div', { class: 'intro-stage' });
    const dotsRow = E('div', { class: 'intro-dots' });
    const skip = E('button', { class: 'intro-skip', 'aria-label': t('sim.skip'),
      onclick: (e) => { e.stopPropagation(); UI.haptic('light'); finish(done); } }, t('sim.skip'));

    // .intro-frame is a full-bleed backdrop; the inner .intro-stage keeps a
    // readable centered content column. .intro-sim is the fixed backdrop.
    const frame = E('div', { class: 'intro-frame' }, [
      E('div', { class: 'intro-orb intro-orb-a' }),
      E('div', { class: 'intro-orb intro-orb-b' }),
      E('div', { class: 'intro-orb intro-orb-c' }),
      E('div', { class: 'intro-grain' }),
      skip,
      stage,
      dotsRow,
    ]);
    const root = E('div', { id: 'intro-sim', class: 'intro-sim' }, [frame]);
    document.body.appendChild(root);

    // ---- scene builders ---------------------------------------------------
    function featureScene(mark, titleKey, subKey) {
      return E('div', { class: 'intro-scene' }, [
        E('div', { class: 'intro-featmark' }, mark),
        E('h2', { class: 'serif intro-h' }, t(titleKey)),
        E('p', { class: 'soft intro-p' }, t(subKey)),
      ]);
    }
    function sceneBrand() {
      return E('div', { class: 'intro-scene' }, [
        E('div', { class: 'intro-mark brand-mark' }),
        E('h1', { class: 'serif intro-word' }, 'Anchor'),
        E('p', { class: 'intro-tag soft' }, t('app.tagline')),
      ]);
    }
    function sceneWeather() {
      const moods = ['☀️', '🌤️', '☁️', '🌧️', '⛈️', '🌫️', '🌈'];
      const wx = E('div', { class: 'intro-wx' }, moods[0]);
      let k = 0;
      _timers.push(setInterval(() => { k = (k + 1) % moods.length; wx.textContent = moods[k]; }, 620));
      return E('div', { class: 'intro-scene' }, [
        E('div', { class: 'intro-wx-ring' }, [wx]),
        E('h2', { class: 'serif intro-h' }, t('sim.s1Title')),
        E('p', { class: 'soft intro-p' }, t('sim.s1Sub')),
      ]);
    }
    function sceneBrief() { return featureScene('☀️', 'sim.s4Title', 'sim.s4Sub'); }
    function sceneInsight() {
      const chip = (emoji, label, delay) => E('div', { class: 'ce-node', style: { animationDelay: delay } }, [
        E('div', { class: 'ce-emoji' }, emoji),
        E('div', { class: 'ce-lbl' }, label),
      ]);
      const thread = E('div', { class: 'cause-thread', style: { justifyContent: 'center' } }, [
        chip('🛏️', t('metric.sleepDur'), '.05s'),
        E('div', { class: 'ce-link' }, [
          E('div', { class: 'ce-flow' }),
          UI.frag('<span class="ce-arrow">' + Icons.get('chevron') + '</span>'),
        ]),
        chip('⚡', t('metric.energyMood'), '.35s'),
      ]);
      return E('div', { class: 'intro-scene' }, [
        E('div', { class: 'eyebrow intro-eye' }, '✦ ' + t('dash.topInsight')),
        thread,
        E('h2', { class: 'serif intro-h', style: { marginTop: '18px' } }, t('sim.s2Title')),
        E('p', { class: 'soft intro-p' }, t('sim.s2Sub')),
      ]);
    }
    function sceneJournal() { return featureScene('📓', 'sim.s6Title', 'sim.s6Sub'); }
    function sceneSleep()   { return featureScene('🌙', 'sim.s7Title', 'sim.s7Sub'); }
    function sceneTalk()    { return featureScene('💬', 'sim.s8Title', 'sim.s8Sub'); }
    function sceneValues()  { return featureScene('🧭', 'sim.s9Title', 'sim.s9Sub'); }
    function sceneGrowth()  { return featureScene('🌱', 'sim.s10Title', 'sim.s10Sub'); }
    function sceneCalm()    { return featureScene('🧘', 'sim.s5Title', 'sim.s5Sub'); }
    function scenePrivate() {
      return E('div', { class: 'intro-scene' }, [
        E('div', { class: 'intro-lock' }, '🔒'),
        E('h2', { class: 'serif intro-h' }, t('sim.s3Title')),
        E('p', { class: 'soft intro-p' }, t('sim.s3Sub')),
        UI.btn(t('sim.cta'), { class: 'btn-primary btn-lg', block: true,
          onClick: (e) => { e && e.stopPropagation && e.stopPropagation(); finish(done); } }),
      ]);
    }

    const SCENES = [
      sceneBrand, sceneWeather, sceneBrief, sceneInsight, sceneJournal,
      sceneSleep, sceneTalk, sceneValues, sceneGrowth, sceneCalm, scenePrivate,
    ];
    // How long each scene lingers before it plays itself forward (ms).
    const DWELL = [3600, 4200, 4400, 4800, 4200, 4200, 4200, 4200, 4200, 4200, 6000];
    const dots = SCENES.map(() => E('span', { class: 'intro-dot' }));
    dots.forEach(d => dotsRow.appendChild(d));

    let i = -1;
    function show(k) {
      clearTimers();                       // stop the previous scene's animations
      i = k;
      const isLast = k === SCENES.length - 1;
      UI.clear(stage);
      const node = SCENES[k]();
      node.classList.add('intro-enter');
      stage.appendChild(node);
      dots.forEach((d, m) => { d.classList.toggle('done', m < k); d.classList.toggle('active', m === k); });
      UI.haptic('light');
      // The cinematic runs on its own — no taps. Each scene auto-advances; the
      // last one lingers on its CTA, then quietly hands off to what's next.
      _timers.push(setTimeout(() => {
        if (i !== k) return;
        if (isLast) finish(done);
        else show(k + 1);
      }, DWELL[k] || 4200));
    }

    show(0);
  }

  function finish(done) {
    if (_finishing) return;                // guard: skip + CTA + auto-timer race
    _finishing = true;
    clearTimers();
    try { Store.set(SEEN_KEY, true); } catch {}
    const el = document.getElementById('intro-sim');
    // Render whatever comes next (the privacy screen) UNDERNEATH first, then
    // fade the cinematic away over it — a clean crossfade with no blank flash.
    if (done) done();
    if (el) {
      requestAnimationFrame(() => {
        el.classList.add('intro-out');
        setTimeout(() => { if (el.parentNode) el.remove(); }, 620);
      });
    }
  }

  window.Intro = { shouldShow, play };
})();
