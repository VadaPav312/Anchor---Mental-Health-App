// ===========================================================================
// intro.js — the "simulation": a glossy cinematic that introduces Anchor right
// after the user signs in (first time only). The reader taps to move through the
// scenes (brand → inner weather → connected patterns → private-by-design), each
// on the user's chosen accent palette so it matches the app's color look. Fully
// skippable, shown once (Store 'settings.introSeen').
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
    const hint = E('div', { class: 'intro-hint' }, [
      E('span', {}, t('sim.tapHint')),
      UI.frag('<span class="intro-hint-chev">' + Icons.get('chevron') + '</span>'),
    ]);
    const skip = E('button', { class: 'intro-skip', 'aria-label': t('sim.skip'), onclick: (e) => { e.stopPropagation(); UI.haptic('light'); finish(done); } }, t('sim.skip'));

    // Everything lives inside a phone-width .intro-frame so that on a wide
    // desktop screen it reads like the phone version (a centered column) rather
    // than sprawling across the whole display. .intro-sim is just the backdrop.
    const frame = E('div', { class: 'intro-frame' }, [
      E('div', { class: 'intro-orb intro-orb-a' }),
      E('div', { class: 'intro-orb intro-orb-b' }),
      E('div', { class: 'intro-orb intro-orb-c' }),
      E('div', { class: 'intro-grain' }),
      skip,
      stage,
      hint,
      dotsRow,
    ]);
    const root = E('div', { id: 'intro-sim', class: 'intro-sim' }, [frame]);
    document.body.appendChild(root);

    // ---- scene builders ----------------------------------------------------
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
    function scenePrivate() {
      return E('div', { class: 'intro-scene' }, [
        E('div', { class: 'intro-lock' }, '🔒'),
        E('h2', { class: 'serif intro-h' }, t('sim.s3Title')),
        E('p', { class: 'soft intro-p' }, t('sim.s3Sub')),
        UI.btn(t('sim.cta'), { class: 'btn-primary btn-lg', block: true, onClick: (e) => { e && e.stopPropagation && e.stopPropagation(); finish(done); } }),
      ]);
    }

    const SCENES = [sceneBrand, sceneWeather, sceneInsight, scenePrivate];
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
      dots.forEach((d, n) => { d.classList.toggle('done', n < k); d.classList.toggle('active', n === k); });
      hint.classList.toggle('hidden', isLast);   // last scene uses its CTA instead
      UI.haptic('light');
    }

    function advance() { if (i < SCENES.length - 1) show(i + 1); }

    // The reader clicks ahead. Tapping the stage or the hint advances; the Skip
    // button and the final CTA stop propagation so they don't also advance.
    stage.addEventListener('click', advance);
    hint.addEventListener('click', advance);

    show(0);
  }

  window.Intro = { shouldShow, play };
})();
