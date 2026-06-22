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
    const wrap = UI.el('div', { class: 'onb-wrap rise', style: Object.assign({
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: 'calc(var(--safe-t) + 24px) 22px calc(var(--safe-b) + 24px)', maxWidth: '560px', margin: '0 auto',
    }, opts.fit
      ? { height: '100dvh', overflow: 'hidden' }     // never scrolls (welcome)
      : { minHeight: '100dvh' }) }, children);
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

  const STEPS = [welcome, name, color, values, baseline, reminders, session, ready];
  const NDOTS = 6;   // middle steps: name, color, values, baseline, reminders, session

  function render() { STEPS[step](); }
  function go(n) { step = Math.max(0, Math.min(STEPS.length - 1, n)); render(); UI.haptic('light'); }

  // 0 — welcome (compact, never scrolls)
  function welcome() {
    frame([
      UI.el('div', { class: 'brand-mark', style: { width: '56px', height: '56px', borderRadius: '18px', margin: '0 auto 18px', animation: 'float-y 4s ease-in-out infinite' } }),
      UI.el('h1', { class: 'serif', style: { fontSize: '2.2rem', textAlign: 'center', lineHeight: '1.06', marginBottom: '10px' } }, t('onb.welcome')),
      UI.el('p', { class: 'soft tac', style: { lineHeight: '1.5', fontSize: '1rem' } }, t('onb.welcomeSub')),
      UI.el('div', { class: 'col gap2', style: { margin: '20px 0' } }, [
        valueRow('🔎', t('onb.valueProp1')),
        valueRow('🗺️', t('onb.valueProp2')),
        valueRow('📒', t('onb.valueProp3')),
      ]),
      UI.btn(t('onb.begin'), { class: 'btn-primary btn-lg', block: true, onClick: () => go(1) }),
      UI.el('p', { class: 'tiny muted tac', style: { marginTop: '12px', lineHeight: '1.4' } }, t('care.disclaimer')),
    ], { fit: true });
  }
  function valueRow(emoji, text) {
    return UI.el('div', { class: 'row gap3 glass-card card-tight' }, [
      UI.el('div', { style: { fontSize: '1.35rem' } }, emoji),
      UI.el('div', { class: 'small soft', style: { lineHeight: '1.35' } }, text),
    ]);
  }

  // 1 — name
  function name() {
    const input = UI.el('input', { class: 'input', placeholder: t('onb.namePlaceholder'), value: draft.name, maxlength: 40,
      oninput: e => draft.name = e.target.value });
    frame([
      dots(NDOTS, 0),
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

  // 2 — color scheme (sets the background tone of the whole app, live)
  function color() {
    const ACCENTS = (window.App && App.ACCENTS) || {};
    const order = ['aurora', 'sunset', 'forest', 'ocean', 'rose', 'gold', 'mono', 'lavender', 'ember', 'teal', 'sky', 'berry', 'sand', 'mint', 'slate'];
    const current = Store.get('settings.accent', 'aurora');
    const grid = UI.el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--s3)' } });
    order.filter(id => ACCENTS[id]).forEach(id => {
      const stops = ACCENTS[id];
      const sel = id === (Store.get('settings.accent', 'aurora'));
      const sw = UI.el('button', { class: 'onb-swatch' + (sel ? ' sel' : ''), 'aria-label': id, style: {
        height: '70px', borderRadius: 'var(--r-lg)',
        background: 'linear-gradient(135deg,' + stops[0] + ',' + stops[1] + ' 50%,' + stops[2] + ')',
        border: sel ? '2.5px solid #fff' : '2.5px solid transparent',
        boxShadow: sel ? '0 0 0 3px rgba(255,255,255,0.25), 0 8px 20px -8px ' + stops[0] : '0 6px 16px -8px rgba(0,0,0,0.5)',
      }, onclick: () => {
        Store.settings.update({ accent: id });
        if (window.App && App.applyAccent) App.applyAccent();
        UI.haptic('light');
        grid.querySelectorAll('.onb-swatch').forEach(s => { s.classList.remove('sel'); s.style.border = '2.5px solid transparent'; });
        sw.classList.add('sel'); sw.style.border = '2.5px solid #fff';
      } });
      grid.appendChild(sw);
    });
    frame([
      dots(NDOTS, 1),
      UI.el('h2', { class: 'serif', style: { fontSize: '1.9rem', marginBottom: '8px' } }, t('onb.colorTitle')),
      UI.el('p', { class: 'soft', style: { marginBottom: '20px', lineHeight: '1.5' } }, t('onb.colorSub')),
      UI.el('div', { class: 'glass-card card' }, [grid]),
      UI.el('div', { class: 'row between gap3', style: { marginTop: '24px' } }, [
        UI.btn(t('app.back'), { class: 'btn-ghost', onClick: () => go(1) }),
        UI.btn(t('app.next'), { class: 'btn-primary grow', onClick: () => go(3) }),
      ]),
    ]);
  }

  // 3 — values (uniform grid of equal-size, selectable boxes)
  function values() {
    const selected = new Set(draft.values.map(v => v.id));
    const grid = UI.el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--s2)' } });
    function syncDraft() {
      draft.values = VALUE_SUGGESTIONS.filter(x => selected.has(x.id)).map(x => ({ id: x.id, name: x.name, why: '', target: 4 }))
        .concat(draft.values.filter(v => String(v.id).startsWith('c')));
    }
    function box(v, custom) {
      const b = UI.el('button', { class: 'onb-val' + (selected.has(v.id) ? ' active' : ''), onclick: () => {
        UI.haptic('light');
        if (selected.has(v.id)) { selected.delete(v.id); b.classList.remove('active'); }
        else { selected.add(v.id); b.classList.add('active'); }
        if (!custom) syncDraft();
      } }, [
        UI.el('div', { style: { fontSize: '1.5rem', lineHeight: '1' } }, v.emoji),
        UI.el('div', { class: 'tiny b', style: { lineHeight: '1.15' } }, v.name),
      ]);
      return b;
    }
    VALUE_SUGGESTIONS.forEach(v => grid.appendChild(box(v)));
    const custom = UI.el('input', { class: 'input', placeholder: t('onb.valuesCustom'), style: { marginTop: '12px' },
      onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) {
        const nm = e.target.value.trim(); const id = 'c' + Date.now();
        const v = { id, name: nm, emoji: '✨' }; selected.add(id);
        draft.values.push({ id, name: nm, why: '', target: 4 });
        const b = box(v, true); b.classList.add('active'); grid.appendChild(b); e.target.value = '';
      } } });
    frame([
      dots(NDOTS, 2),
      UI.el('h2', { class: 'serif', style: { fontSize: '1.9rem', marginBottom: '8px' } }, t('onb.valuesTitle')),
      UI.el('p', { class: 'soft', style: { marginBottom: '20px', lineHeight: '1.5' } }, t('onb.valuesSub')),
      UI.el('div', { class: 'glass-card card' }, [grid, custom]),
      UI.el('div', { class: 'row between gap3', style: { marginTop: '24px' } }, [
        UI.btn(t('app.back'), { class: 'btn-ghost', onClick: () => go(2) }),
        UI.btn(t('app.next'), { class: 'btn-primary grow', onClick: () => go(4) }),
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
      dots(NDOTS, 3),
      UI.el('h2', { class: 'serif', style: { fontSize: '1.9rem', marginBottom: '8px' } }, t('onb.baselineTitle')),
      UI.el('p', { class: 'soft', style: { marginBottom: '20px', lineHeight: '1.5' } }, t('onb.baselineSub')),
      UI.el('div', { class: 'glass-card card' }, [out, slider]),
      UI.el('div', { class: 'row between gap3', style: { marginTop: '24px' } }, [
        UI.btn(t('app.back'), { class: 'btn-ghost', onClick: () => go(3) }),
        UI.btn(t('app.next'), { class: 'btn-primary grow', onClick: () => go(5) }),
      ]),
    ]);
  }

  // 5 — reminders
  function reminders() {
    frame([
      dots(NDOTS, 4),
      UI.el('div', { class: 'tac', style: { fontSize: '3rem', marginBottom: '6px' } }, '🔔'),
      UI.el('h2', { class: 'serif', style: { fontSize: '1.9rem', marginBottom: '8px' } }, t('onb.notifTitle')),
      UI.el('p', { class: 'soft', style: { marginBottom: '22px', lineHeight: '1.5' } }, t('onb.notifSub')),
      UI.btn(t('onb.notifAllow'), { class: 'btn-primary btn-lg', block: true, icon: 'bell', onClick: async () => {
        const perm = await Native.notifPermission();
        if (perm === 'granted') {
          Store.set('settings.reminders.miss.on', true);      // general "we miss you"
          Store.set('settings.reminders.windDown.on', true);
          Store.set('settings.reminders.checkin.on', true);
          UI.toast(t('app.saved'), 'good');
        }
        go(6);
      } }),
      UI.el('button', { class: 'btn btn-ghost btn-sm', style: { marginTop: '12px', alignSelf: 'center' }, onclick: () => go(6) }, t('onb.notifLater')),
    ]);
  }

  // 6 — stay signed in vs. log out when the app closes (changeable in Settings)
  function session() {
    function pick(persist) {
      if (window.Auth && Auth.setPersist) Auth.setPersist(persist);
      else Store.set('settings.session.persist', persist);
      UI.haptic('success');
      go(7);
    }
    function choice(emoji, title, sub, persist) {
      return UI.el('button', { class: 'glass-card card', style: { textAlign: 'left', cursor: 'pointer', width: '100%' },
        onclick: () => pick(persist) }, [
        UI.el('div', { class: 'row gap3', style: { alignItems: 'center' } }, [
          UI.el('div', { style: { fontSize: '1.8rem' } }, emoji),
          UI.el('div', { class: 'col gap0 grow' }, [
            UI.el('div', { class: 'b' }, title),
            UI.el('div', { class: 'small soft', style: { marginTop: '2px', lineHeight: '1.4' } }, sub),
          ]),
        ]),
      ]);
    }
    frame([
      dots(NDOTS, 5),
      UI.el('div', { class: 'tac', style: { fontSize: '3rem', marginBottom: '6px' } }, '🔐'),
      UI.el('h2', { class: 'serif', style: { fontSize: '1.9rem', marginBottom: '8px' } }, t('onb.sessionTitle')),
      UI.el('p', { class: 'soft', style: { marginBottom: '22px', lineHeight: '1.5' } }, t('onb.sessionSub')),
      UI.el('div', { class: 'col gap3' }, [
        choice('🏠', t('onb.sessionStay'), t('onb.sessionStaySub'), true),
        choice('🚪', t('onb.sessionLogout'), t('onb.sessionLogoutSub'), false),
      ]),
      UI.el('div', { class: 'row', style: { marginTop: '20px' } }, [
        UI.btn(t('app.back'), { class: 'btn-ghost', onClick: () => go(5) }),
      ]),
      UI.el('p', { class: 'tiny muted tac', style: { marginTop: '14px', lineHeight: '1.45' } }, t('onb.sessionNote')),
    ]);
  }

  // 7 — ready (with demo-data offer)
  function ready() {
    frame([
      UI.el('div', { class: 'tac', style: { fontSize: '3.4rem', marginBottom: '10px', animation: 'pop .5s var(--ease-spring)' } }, '⚓'),
      UI.el('h1', { class: 'serif', style: { fontSize: '2.3rem', textAlign: 'center', marginBottom: '12px' } }, t('onb.ready')),
      UI.el('p', { class: 'soft tac', style: { lineHeight: '1.55', marginBottom: '26px' } }, t('onb.readySub')),
      UI.btn(t('onb.enter'), { class: 'btn-primary btn-lg', block: true, onClick: () => finish(false) }),
      UI.el('p', { class: 'tiny muted tac', style: { marginTop: '14px', lineHeight: '1.5' } }, t('onb.privacySub')),
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
