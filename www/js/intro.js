// ===========================================================================
// intro.js — the first-launch "simulation": a short, glossy cinematic that
// introduces Anchor before the sign-in gate. Auto-plays a handful of scenes
// (brand → inner weather → connected patterns → private-by-design), each on the
// user's chosen accent palette so it matches the app's color look. Fully
// skippable, shown once (Store 'settings.introSeen').
//
//   Intro.shouldShow()  -> bool   (first ever launch, not yet onboarded)
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
  function clearTimers() { _timers.forEach(id => { clearTimeout(id); clearInterval(id); }); _timers = []; }

  function finish(done) {
    clearTimers();
    try { Store.set(SEEN_KEY, true); } catch {}
    const el = document.getElementById('intro-sim');
    if (el) { el.classList.add('intro-out'); setTimeout(() => { if (el.parentNode) el.remove(); }, 480); }
    if (done) setTimeout(done, 120);
  }

  function play(done) {
    const prev = document.getElementById('intro-sim'); if (prev) prev.remove();
    clearTimers();

    const stage = E('div', { class: 'intro-stage' });
    const dotsRow = E('div', { class: 'intro-dots' });
    const skip = E('button', { class: 'intro-skip', 'aria-label': t('intro.skip'), onclick: () => { UI.haptic('light'); finish(done); } }, t('intro.skip'));

    const root = E('div', { id: 'intro-sim', class: 'intro-sim' }, [
      E('div', { class: 'intro-orb intro-orb-a' }),
      E('div', { class: 'intro-orb intro-orb-b' }),
      E('div', { class: 'intro-orb intro-orb-c' }),
      E('div', { class: 'intro-grain' }),
      skip,
      stage,
      dotsRow,
    ]);
    document.body.appendChild(root);

    // ---- scene builders (each returns a mounted-ready node) ----------------
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
      // cycle the emoji while this scene is on screen (timer cleared on advance)
      let k = 0;
      _timers.push(setInterval(() => { k = (k + 1) % moods.length; wx.textContent = moods[k]; }, 620));
      return E('div', { class: 'intro-scene' }, [
        E('div', { class: 'intro-wx-ring' }, [wx]),
        E('h2', { class: 'serif intro-h' }, t('intro.s1Title')),
        E('p', { class: 'soft intro-p' }, t('intro.s1Sub')),
      ]);
    }
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
        E('h2', { class: 'serif intro-h', style: { marginTop: '18px' } }, t('intro.s2Title')),
        E('p', { class: 'soft intro-p' }, t('intro.s2Sub')),
      ]);
    }
    function scenePrivate() {
      return E('div', { class: 'intro-scene' }, [
        E('div', { class: 'intro-lock' }, '🔒'),
        E('h2', { class: 'serif intro-h' }, t('intro.s3Title')),
        E('p', { class: 'soft intro-p' }, t('intro.s3Sub')),
        UI.btn(t('intro.cta'), { class: 'btn-primary btn-lg', block: true, onClick: () => finish(done) }),
      ]);
    }

    const SCENES = [
      { ms: 2800, build: sceneBrand },
      { ms: 3000, build: sceneWeather },
      { ms: 3200, build: sceneInsight },
      { ms: 0,    build: scenePrivate },   // last scene holds on its CTA
    ];
    const dots = SCENES.map(() => E('span', { class: 'intro-dot' }));
    dots.forEach(d => dotsRow.appendChild(d));

    let i = -1;
    function show(k) {
      clearTimers();                       // stop the previous scene's timers
      i = k;
      UI.clear(stage);
      const node = SCENES[k].build();
      node.classList.add('intro-enter');
      stage.appendChild(node);
      dots.forEach((d, n) => { d.classList.toggle('done', n < k); d.classList.toggle('active', n === k); });
      UI.haptic('light');
      if (SCENES[k].ms > 0 && k < SCENES.length - 1) _timers.push(setTimeout(() => show(k + 1), SCENES[k].ms));
    }

    // tap anywhere on the stage to jump forward (until the final CTA scene)
    stage.addEventListener('click', () => { if (i < SCENES.length - 1) show(i + 1); });

    show(0);
  }

  window.Intro = { shouldShow, play };
})();
