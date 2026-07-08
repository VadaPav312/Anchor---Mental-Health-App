// ===========================================================================
// intro.js — the "simulation": a glossy cinematic that introduces Anchor right
// after the user signs in (first time only). It plays fully on its OWN — scene
// to scene automatically, no taps to continue — walking through what Anchor
// does (inner weather → a private morning briefing → connected patterns → a
// calm toolkit → private-by-design). All the while, ambient "pop-ups" drawn
// from a pool of 1000+ gentle, feature-flavored lines drift in at the edges at
// random moments (never over the words being spoken). When it ends it crossfades
// smoothly into the privacy screen. Skippable; shown once ('settings.introSeen').
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

  function reduceMotion() {
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch { return false; }
  }

  // Two independent timer sets: per-scene animations (cleared on every scene
  // change) and the ambient pop-up spawner (lives for the whole intro).
  let _timers = [];
  let _ambient = [];
  let _finishing = false;
  function clearTimers()  { _timers.forEach(id => { clearTimeout(id); clearInterval(id); }); _timers = []; }
  function clearAmbient() { _ambient.forEach(id => { clearTimeout(id); clearInterval(id); }); _ambient = []; }

  // ---- ambient phrase pool: 1000+ gentle, feature-flavored lines -----------
  // Built once, combinatorially, so nothing feels canned or repetitive. No
  // clinical numbers (no "62 bpm", no "7h 42m") — just calm, human lines and
  // the things Anchor can do for you.
  let _pool = null;
  function pool() {
    if (_pool) return _pool;
    const out = [];
    const push = (e, l) => out.push({ e, l });

    // 1 — named features
    [
      ['🌤️', 'Inner weather'], ['🔗', 'Connected patterns'], ['📓', 'Private journal'],
      ['☀️', 'A morning briefing'], ['🌙', 'Sleep trends'], ['🧘', 'A calm toolkit'],
      ['🧭', 'Your values compass'], ['🔋', 'Energy balance'], ['🔔', 'Gentle reminders'],
      ['🔒', 'On-device & private'], ['💬', 'Someone to talk to'], ['📈', 'Progress reflections'],
      ['🌬️', 'Breathing space'], ['🪞', 'An honest mirror'], ['✅', 'Tiny daily wins'],
      ['🎯', "Today's focus"], ['📊', 'Mood trends'], ['🌱', 'Growth over time'],
      ['🕊️', 'A calmer mind'], ['💡', 'Pattern insights'], ['🗺️', 'Your weather map'],
      ['🧩', 'See what connects'], ['📝', 'Say it in your words'], ['🌗', 'Wind-down mode'],
    ].forEach(([e, l]) => push(e, l));

    // 2 — affirmations
    [
      ['💗', 'You showed up today'], ['✨', 'This is your space'], ['🌿', 'One breath at a time'],
      ['🤍', 'Be kind to yourself'], ['🌈', 'Feelings pass'], ['⭐', 'Small steps count'],
      ['🫶', "You're not alone in this"], ['🌊', 'Ride the wave'], ['☁️', 'Let it be light'],
      ['🌅', 'A fresh start, always'], ['🧡', 'Progress, not perfect'], ['💛', 'Rest is productive too'],
      ['🌻', 'Grow at your own pace'], ['🍃', 'Just notice — no judgment'], ['🌟', 'Your feelings are valid'],
      ['🕯️', 'Slow is okay'], ['🤗', 'You are enough'], ['💫', 'Be where your feet are'],
      ['🪴', 'Tend to yourself'], ['🌙', 'Rest is not falling behind'], ['🧭', 'Come back to what matters'],
      ['💧', 'Let the hard part move through'], ['🌸', 'Gentle is strong'], ['🌤️', 'Softer days are coming'],
    ].forEach(([e, l]) => push(e, l));

    // 3 — "verb + object" (≈350)
    const V = ['Notice', 'Name', 'Welcome', 'Honor', 'Track', 'Observe', 'Tend', 'Cherish',
      'Sit with', 'Make room for', 'Befriend', 'Untangle', 'Revisit', 'Celebrate', 'Soften around', 'Breathe through'];
    const O = ['how you feel', 'your inner weather', "today's mood", 'the quiet wins', 'what drained you',
      'what lifted you', 'your energy', "tonight's rest", 'this moment', 'the small stuff', 'a passing thought',
      'the whole week', 'your own pace', 'a gentle reset', 'one true feeling', 'the day ahead',
      "last night's sleep", 'a hard hour', 'the good moments', 'your next breath', 'what matters most', 'a quiet victory'];
    const EV = ['🌿', '✨', '🍃', '💭', '🕊️', '🌙', '☁️', '🌊', '🌱', '🤍'];
    let n = 0;
    V.forEach(v => O.forEach(o => { push(EV[n % EV.length], v + ' ' + o); n++; }));

    // 4 — "adjective + noun" (≈675)
    const A = ['Quiet', 'Gentle', 'Steady', 'Honest', 'Small', 'Kind', 'Calm', 'Clear', 'Softer',
      'Brighter', 'Slower', 'Grounded', 'Warm', 'Restful', 'Present', 'Mindful', 'Patient', 'Tender',
      'Open', 'Curious', 'Hopeful', 'Rooted', 'Easeful', 'Balanced', 'Renewed', 'Peaceful'];
    const N = ['mornings', 'evenings', 'check-ins', 'moments', 'breaths', 'reflections', 'resets',
      'patterns', 'insights', 'nights of rest', 'days', 'wins', 'feelings', 'spaces', 'rhythms',
      'intentions', 'notes to self', 'pauses', 'beginnings', 'streaks', 'weather within', 'journeys',
      'habits', 'values', 'hours', 'weeks'];
    const EA = ['🌤️', '🌱', '🍃', '🕊️', '☀️', '🌙', '🌊', '✨', '🌿', '💫'];
    n = 0;
    A.forEach(a => N.forEach(nn => { push(EA[n % EA.length], a + ' ' + nn); n++; }));

    _pool = out;    // ≈1100 unique lines
    return _pool;
  }

  function play(done) {
    const prev = document.getElementById('intro-sim'); if (prev) prev.remove();
    clearTimers(); clearAmbient();
    _finishing = false;

    const stage = E('div', { class: 'intro-stage' });
    const dotsRow = E('div', { class: 'intro-dots' });
    const ambient = E('div', { class: 'intro-ambient', 'aria-hidden': 'true' });
    const skip = E('button', { class: 'intro-skip', 'aria-label': t('sim.skip'),
      onclick: (e) => { e.stopPropagation(); UI.haptic('light'); finish(done); } }, t('sim.skip'));

    // .intro-frame is a full-bleed backdrop; the inner .intro-stage keeps a
    // readable centered content column. .intro-sim is the fixed backdrop.
    const frame = E('div', { class: 'intro-frame' }, [
      E('div', { class: 'intro-orb intro-orb-a' }),
      E('div', { class: 'intro-orb intro-orb-b' }),
      E('div', { class: 'intro-orb intro-orb-c' }),
      E('div', { class: 'intro-grain' }),
      ambient,
      skip,
      stage,
      dotsRow,
    ]);
    const root = E('div', { id: 'intro-sim', class: 'intro-sim' }, [frame]);
    document.body.appendChild(root);

    // ---- ambient pop-ups: random line, random time, edges only ------------
    function spawnAmbient() {
      // never crowd the screen; keep at most a few floating at once
      if (ambient.childElementCount < 5) {
        const p = pool();
        const it = p[Math.floor(Math.random() * p.length)];
        const chip = E('div', { class: 'intro-float' }, [
          E('span', { class: 'intro-float-e' }, it.e),
          E('span', { class: 'intro-float-l' }, it.l),
        ]);
        // Anchor to the LEFT or RIGHT edge, and to the TOP or BOTTOM band —
        // so pop-ups live in the corners and never cross the middle third,
        // where the words being spoken sit.
        const side = Math.random() < 0.5 ? 'left' : 'right';
        chip.style[side] = (3 + Math.random() * 23).toFixed(1) + '%';
        const topBand = Math.random() < 0.5;
        chip.style.top = (topBand ? 6 + Math.random() * 18 : 65 + Math.random() * 19).toFixed(1) + '%';
        const life = 5200 + Math.random() * 2800;
        chip.style.animationDuration = Math.round(life) + 'ms';
        ambient.appendChild(chip);
        _ambient.push(setTimeout(() => { if (chip.parentNode) chip.remove(); }, life + 80));
      }
      _ambient.push(setTimeout(spawnAmbient, 820 + Math.random() * 1500));
    }
    if (!reduceMotion()) {
      _ambient.push(setTimeout(spawnAmbient, 480));
      _ambient.push(setTimeout(spawnAmbient, 1300));
      _ambient.push(setTimeout(spawnAmbient, 2200));
    }

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
    function sceneCalm() { return featureScene('🧘', 'sim.s5Title', 'sim.s5Sub'); }
    function scenePrivate() {
      return E('div', { class: 'intro-scene' }, [
        E('div', { class: 'intro-lock' }, '🔒'),
        E('h2', { class: 'serif intro-h' }, t('sim.s3Title')),
        E('p', { class: 'soft intro-p' }, t('sim.s3Sub')),
        UI.btn(t('sim.cta'), { class: 'btn-primary btn-lg', block: true,
          onClick: (e) => { e && e.stopPropagation && e.stopPropagation(); finish(done); } }),
      ]);
    }

    const SCENES = [sceneBrand, sceneWeather, sceneBrief, sceneInsight, sceneCalm, scenePrivate];
    // How long each scene lingers before it plays itself forward (ms).
    const DWELL  = [3600,      4200,        4400,       4800,         4400,      6000];
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
    clearTimers(); clearAmbient();
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
