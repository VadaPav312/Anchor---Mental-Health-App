// ===========================================================================
// onboarding.js — first-run flow. Sets the tone (calm, on-device, caring) and
// captures just enough to make Anchor feel personal from minute one: name,
// values (the compass), a mood baseline, and reminders. Offers an "explore with
// demo data" path so judges/new users see a fully alive app immediately.
// ===========================================================================
(function () {
  let onDone = null;
  let step = 0;
  const draft = { name: '', values: [], baseline: 0, demo: false };

  const VALUE_SUGGESTIONS = [
    { id: 'presence', name: 'Being present', emoji: '🌿' },
    { id: 'connection', name: 'Connection', emoji: '🤝' },
    { id: 'health', name: 'Physical health', emoji: '💪' },
    { id: 'creativity', name: 'Creativity', emoji: '🎨' },
    { id: 'honesty', name: 'Honesty', emoji: '🪞' },
    { id: 'growth', name: 'Growth', emoji: '🌱' },
    { id: 'calm', name: 'Calm', emoji: '🕊️' },
    { id: 'adventure', name: 'Adventure', emoji: '🧭' },
    { id: 'family', name: 'Family', emoji: '🏡' },
    { id: 'kindness', name: 'Kindness', emoji: '💗' },
    { id: 'craft', name: 'Doing good work', emoji: '🛠️' },
    { id: 'freedom', name: 'Freedom', emoji: '🪁' },
  ];

  function start(done) {
    onDone = done; step = 0;
    render();
  }

  function host() { return document.getElementById('view'); }

  function frame(children, opts) {
    opts = opts || {};
    const h = host();
    UI.clear(h);
    const wrap = UI.el('div', { class: 'onb-wrap rise', style: {
      minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: 'calc(var(--safe-t) + 28px) 22px calc(var(--safe-b) + 28px)', maxWidth: '560px', margin: '0 auto',
    } }, children);
    h.appendChild(wrap);
    h.scrollTop = 0;
  }

  function dots(n, active) {
    return UI.el('div', { class: 'row center gap2', style: { margin: '0 0 22px' } },
      Array.from({ length: n }, (_, i) => UI.el('span', { style: {
        width: i === active ? '22px' : '7px', height: '7px', borderRadius: '999px',
        background: i === active ? 'linear-gradient(90deg,var(--a1),var(--a2))' : 'var(--ink-ghost)',
        transition: 'all .3s var(--ease-spring)',
      } })));
  }

  const STEPS = [welcome, name, values, baseline, reminders, ready];

  function render() { STEPS[step](); }
  function go(n) { step = Math.max(0, Math.min(STEPS.length - 1, n)); render(); UI.haptic('light'); }

  // 0 — welcome
  function welcome() {
    frame([
      UI.el('div', { class: 'brand-mark', style: { width: '64px', height: '64px', borderRadius: '20px', margin: '0 auto 26px', animation: 'float-y 4s ease-in-out infinite' } }),
      UI.el('h1', { class: 'serif', style: { fontSize: '2.6rem', textAlign: 'center', lineHeight: '1.05', marginBottom: '14px' } }, t('onb.welcome')),
      UI.el('p', { class: 'soft tac', style: { lineHeight: '1.55', fontSize: '1.05rem' } }, t('onb.welcomeSub')),
      UI.el('div', { class: 'col gap3', style: { margin: '30px 0' } }, [
        valueRow('🔎', t('onb.valueProp1')),
        valueRow('🗺️', t('onb.valueProp2')),
        valueRow('📒', t('onb.valueProp3')),
      ]),
      UI.btn(t('onb.begin'), { class: 'btn-primary btn-lg', block: true, onClick: () => go(1) }),
      UI.el('p', { class: 'tiny muted tac', style: { marginTop: '14px', lineHeight: '1.5' } }, t('care.disclaimer')),
    ]);
  }
  function valueRow(emoji, text) {
    return UI.el('div', { class: 'row gap3 glass-card card-tight' }, [
      UI.el('div', { style: { fontSize: '1.5rem' } }, emoji),
      UI.el('div', { class: 'small soft', style: { lineHeight: '1.4' } }, text),
    ]);
  }

  // 1 — name
  function name() {
    const input = UI.el('input', { class: 'input', placeholder: t('onb.namePlaceholder'), value: draft.name, maxlength: 40,
      oninput: e => draft.name = e.target.value });
    frame([
      dots(4, 0),
      UI.el('h2', { class: 'serif', style: { fontSize: '1.9rem', marginBottom: '8px' } }, t('onb.nameTitle')),
      UI.el('p', { class: 'soft', style: { marginBottom: '22px', lineHeight: '1.5' } }, t('onb.nameSub')),
      UI.el('div', { class: 'glass-card card' }, [input]),
      UI.el('div', { class: 'row between gap3', style: { marginTop: '24px' } }, [
        UI.btn(t('app.back'), { class: 'btn-ghost', onClick: () => go(0) }),
        UI.btn(t('app.next'), { class: 'btn-primary grow', onClick: () => { draft.name = (draft.name || '').trim(); go(2); } }),
      ]),
    ]);
    setTimeout(() => input.focus(), 250);
  }

  // 2 — values
  function values() {
    const selected = new Set(draft.values.map(v => v.id));
    const grid = UI.el('div', { class: 'row wrap gap2' });
    VALUE_SUGGESTIONS.forEach(v => {
      const chip = UI.el('button', { class: 'chip' + (selected.has(v.id) ? ' active' : ''), style: { fontSize: '0.9rem', padding: '10px 14px' },
        onclick: () => { UI.haptic('light');
          if (selected.has(v.id)) { selected.delete(v.id); chip.classList.remove('active'); }
          else { selected.add(v.id); chip.classList.add('active'); }
          draft.values = VALUE_SUGGESTIONS.filter(x => selected.has(x.id)).map(x => ({ id: x.id, name: x.name, why: '' }));
        } }, v.emoji + '  ' + v.name);
      grid.appendChild(chip);
    });
    const custom = UI.el('input', { class: 'input', placeholder: t('onb.valuesCustom'), style: { marginTop: '12px' },
      onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { const nm = e.target.value.trim(); const id = 'c' + Date.now(); draft.values.push({ id, name: nm, why: '' });
        const chip = UI.el('button', { class: 'chip active', style: { fontSize: '0.9rem', padding: '10px 14px' } }, '✨  ' + nm); grid.appendChild(chip); e.target.value = ''; } } });
    frame([
      dots(4, 1),
      UI.el('h2', { class: 'serif', style: { fontSize: '1.9rem', marginBottom: '8px' } }, t('onb.valuesTitle')),
      UI.el('p', { class: 'soft', style: { marginBottom: '20px', lineHeight: '1.5' } }, t('onb.valuesSub')),
      UI.el('div', { class: 'glass-card card' }, [grid, custom]),
      UI.el('div', { class: 'row between gap3', style: { marginTop: '24px' } }, [
        UI.btn(t('app.back'), { class: 'btn-ghost', onClick: () => go(1) }),
        UI.btn(t('app.next'), { class: 'btn-primary grow', onClick: () => go(3) }),
      ]),
    ]);
  }

  // 3 — baseline mood
  function baseline() {
    const labels = [t('chk.veryLow'), t('chk.low'), t('chk.ok'), t('chk.good'), t('chk.great')];
    let val = draft.baseline + 2;
    const out = UI.el('div', { class: 'huge grad-text tac', style: { margin: '10px 0' } }, labels[val]);
    const slider = UI.el('input', { class: 'range', type: 'range', min: 0, max: 4, step: 1, value: val,
      oninput: e => { val = +e.target.value; draft.baseline = val - 2; out.textContent = labels[val]; UI.haptic('light'); } });
    frame([
      dots(4, 2),
      UI.el('h2', { class: 'serif', style: { fontSize: '1.9rem', marginBottom: '8px' } }, t('onb.baselineTitle')),
      UI.el('p', { class: 'soft', style: { marginBottom: '20px', lineHeight: '1.5' } }, t('onb.baselineSub')),
      UI.el('div', { class: 'glass-card card' }, [out, slider]),
      UI.el('div', { class: 'row between gap3', style: { marginTop: '24px' } }, [
        UI.btn(t('app.back'), { class: 'btn-ghost', onClick: () => go(2) }),
        UI.btn(t('app.next'), { class: 'btn-primary grow', onClick: () => go(4) }),
      ]),
    ]);
  }

  // 4 — reminders
  function reminders() {
    frame([
      dots(4, 3),
      UI.el('div', { class: 'tac', style: { fontSize: '3rem', marginBottom: '6px' } }, '🔔'),
      UI.el('h2', { class: 'serif', style: { fontSize: '1.9rem', marginBottom: '8px' } }, t('onb.notifTitle')),
      UI.el('p', { class: 'soft', style: { marginBottom: '22px', lineHeight: '1.5' } }, t('onb.notifSub')),
      UI.btn(t('onb.notifAllow'), { class: 'btn-primary btn-lg', block: true, icon: 'bell', onClick: async () => {
        const perm = await Native.notifPermission();
        if (perm === 'granted') {
          Store.set('settings.reminders.windDown.on', true);
          Store.set('settings.reminders.checkin.on', true);
          UI.toast(t('app.saved'), 'good');
        }
        go(5);
      } }),
      UI.el('button', { class: 'btn btn-ghost btn-sm', style: { marginTop: '12px', alignSelf: 'center' }, onclick: () => go(5) }, t('onb.notifLater')),
    ]);
  }

  // 5 — ready (with demo-data offer)
  function ready() {
    frame([
      UI.el('div', { class: 'tac', style: { fontSize: '3.4rem', marginBottom: '10px', animation: 'pop .5s var(--ease-spring)' } }, '⚓'),
      UI.el('h1', { class: 'serif', style: { fontSize: '2.3rem', textAlign: 'center', marginBottom: '12px' } }, t('onb.ready')),
      UI.el('p', { class: 'soft tac', style: { lineHeight: '1.55', marginBottom: '26px' } }, t('onb.readySub')),
      UI.btn(t('onb.enter'), { class: 'btn-primary btn-lg', block: true, onClick: () => finish(false) }),
      UI.el('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '12px' }, onclick: () => finish(true) }, '✨  Explore with demo data'),
      UI.el('p', { class: 'tiny muted tac', style: { marginTop: '12px', lineHeight: '1.5' } }, t('onb.privacySub')),
    ]);
  }

  function finish(useDemo) {
    Store.profile.update({ name: draft.name, onboarded: true, createdAt: Date.now() });
    Store.values.set(draft.values.length ? draft.values : [{ id: 'presence', name: 'Being present', why: '' }, { id: 'connection', name: 'Connection', why: '' }]);
    if (useDemo) { Seed.apply(); }
    else if (draft.baseline != null) {
      Store.moods.add({ valence: draft.baseline, energy: 5 + draft.baseline, arousal: 5, note: '', tags: [] });
    }
    Store.set('settings.lang', I18N.lang);
    UI.haptic('success');
    onDone && onDone();
  }

  window.Onboarding = { start };
})();
