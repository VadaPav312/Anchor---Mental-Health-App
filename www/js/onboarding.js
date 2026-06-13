// ===========================================================================
// onboarding.js — first-run flow. Sets the tone (calm, on-device, caring) and
// captures just enough to make Anchor feel personal from minute one: name,
// values (the compass), optional sleep-monitor pairing, a mood baseline, and
// reminders. Offers an "explore with demo data" path so judges/new users see a
// fully alive app immediately.
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

  const STEPS = [welcome, name, values, sleep, baseline, reminders, emailStep, ready];

  // ---- email capture + "send a test now" ----
  function saveEmail(v) {
    const a = Store.get('profile.account', null);
    if (a) { a.email = v; Store.profile.update({ account: a }); }
    else if (v) { Store.profile.update({ account: { name: Store.profile.name(), email: v, pin: '' } }); }
  }
  async function sendTestEmail(to) {
    const base = (Store.get('settings.bridgeUrl', '') || '').trim().replace(/\/+$/, '');
    const urls = [];
    if (base) urls.push((/^https?:\/\//i.test(base) ? base : 'http://' + base) + '/api/email/test');
    urls.push('/api/email/test');
    const body = { to, name: Store.profile.name(), subject: t('email.subject'),
      lines: ['Welcome to Anchor 🌙', 'This is your test digest — your real check-ins will look like this.'] };
    let err = { error: t('email.noBridge') };
    for (const u of urls) {
      try {
        const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (r.ok) return { ok: true };
        err = j.code === 'no-key' ? { error: t('email.noKey') } : j;
      } catch (e) { /* try next */ }
    }
    return { ok: false, error: err.error || t('email.failed') };
  }

  function emailStep() {
    const acct = (window.Auth && Auth.account && Auth.account()) || {};
    const input = UI.el('input', { class: 'input', type: 'email', placeholder: t('email.addressPlaceholder'), value: acct.email || '', autocapitalize: 'none', autocomplete: 'email' });
    const status = UI.el('div', { class: 'small tac', style: { minHeight: '18px', marginTop: '8px', color: 'var(--ink-faint)' } });
    const sendBtn = UI.btn(t('email.test'), { class: 'btn-ghost btn-block', icon: 'bell', onClick: async () => {
      const to = (input.value || '').trim();
      if (!/.+@.+\..+/.test(to)) { status.textContent = '⚠️ ' + t('email.noAddress'); status.style.color = 'var(--bad)'; UI.haptic('error'); return; }
      saveEmail(to);
      status.textContent = t('email.sending'); status.style.color = 'var(--ink-faint)'; sendBtn.disabled = true;
      const r = await sendTestEmail(to);
      status.textContent = (r.ok ? '✅ ' + t('email.sent') : '⚠️ ' + r.error); status.style.color = r.ok ? 'var(--good)' : 'var(--bad)';
      UI.haptic(r.ok ? 'success' : 'error'); sendBtn.disabled = false;
    } });
    frame([
      dots(6, 5),
      UI.el('div', { class: 'tac', style: { fontSize: '3rem', marginBottom: '6px' } }, '📬'),
      UI.el('h2', { class: 'serif', style: { fontSize: '1.9rem', marginBottom: '8px' } }, t('onb.emailTitle')),
      UI.el('p', { class: 'soft', style: { marginBottom: '20px', lineHeight: '1.5' } }, t('onb.emailSub')),
      UI.el('div', { class: 'glass-card card' }, [UI.field(t('email.addressLabel'), input), sendBtn, status]),
      UI.el('div', { class: 'row between gap3', style: { marginTop: '24px' } }, [
        UI.btn(t('app.back'), { class: 'btn-ghost', onClick: () => go(5) }),
        UI.btn(t('app.next'), { class: 'btn-primary grow', onClick: () => { saveEmail((input.value || '').trim()); go(7); } }),
      ]),
      UI.el('button', { class: 'btn btn-ghost btn-sm', style: { marginTop: '10px', alignSelf: 'center' }, onclick: () => go(7) }, t('onb.emailSkip')),
    ]);
  }
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
      dots(6, 0),
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
      dots(6, 1),
      UI.el('h2', { class: 'serif', style: { fontSize: '1.9rem', marginBottom: '8px' } }, t('onb.valuesTitle')),
      UI.el('p', { class: 'soft', style: { marginBottom: '20px', lineHeight: '1.5' } }, t('onb.valuesSub')),
      UI.el('div', { class: 'glass-card card' }, [grid, custom]),
      UI.el('div', { class: 'row between gap3', style: { marginTop: '24px' } }, [
        UI.btn(t('app.back'), { class: 'btn-ghost', onClick: () => go(1) }),
        UI.btn(t('app.next'), { class: 'btn-primary grow', onClick: () => go(3) }),
      ]),
    ]);
  }

  // 3 — sleep monitor (optional)
  function sleep() {
    // The bridge address is baked into config.js, so no typing — we just show
    // whether the bedside monitor is reachable, and auto-check on load.
    const effectiveUrl = (Store.get('settings.bridgeUrl', '') || (window.CONFIG && CONFIG.bridgeUrl) || '').trim();

    const dot = UI.el('span', { style: { width: '12px', height: '12px', borderRadius: '50%', flex: '0 0 auto', background: 'var(--ink-ghost)', boxShadow: '0 0 0 4px rgba(255,255,255,0.06)' } });
    const statusText = UI.el('div', { class: 'b' }, t('onb.sleepChecking'));
    const statusSub = UI.el('div', { class: 'small soft', style: { marginTop: '4px', lineHeight: '1.45' } }, '');
    const recheckBtn = UI.btn(t('onb.recheck'), { class: 'btn-ghost btn-sm', icon: 'wind', onClick: () => check() });

    async function check() {
      dot.style.background = 'var(--warn)';
      statusText.textContent = t('onb.sleepChecking');
      statusSub.textContent = '';
      const r = await Bridge.live();
      if (r && r.connected) {
        dot.style.background = 'var(--good)';
        dot.style.boxShadow = '0 0 0 4px rgba(var(--a3-rgb),0.18)';
        statusText.textContent = '✅ ' + t('onb.sleepConnectedMsg');
        statusSub.textContent = r.live && r.live.temperatureF != null ? (UI.fmt.temp(r.live.temperatureF) + ' · ' + (r.inBed ? t('mon.inBedYes') : t('mon.inBedNo'))) : '';
      } else {
        dot.style.background = 'var(--bad)';
        statusText.textContent = '⚠️ ' + t('onb.sleepNotFound');
        statusSub.textContent = t('onb.sleepNotFoundSub');
      }
    }

    // advanced: change the baked address if ever needed
    const urlInput = UI.el('input', { class: 'input', placeholder: 'http://192.168.1.20:3000', value: Store.get('settings.bridgeUrl', ''),
      oninput: e => Store.set('settings.bridgeUrl', e.target.value.trim()), style: { marginTop: '10px' } });
    urlInput.style.display = 'none';
    const changeLink = UI.el('button', { class: 'tiny care-link', style: { background: 'none', marginTop: '10px' },
      onclick: () => { const show = urlInput.style.display === 'none'; urlInput.style.display = show ? 'block' : 'none'; if (show) urlInput.focus(); } }, t('onb.changeAddress'));

    frame([
      dots(6, 2),
      UI.el('div', { class: 'tac', style: { fontSize: '3rem', marginBottom: '6px' } }, '🛌'),
      UI.el('h2', { class: 'serif', style: { fontSize: '1.9rem', marginBottom: '8px' } }, t('onb.sleepTitle')),
      UI.el('p', { class: 'soft', style: { marginBottom: '20px', lineHeight: '1.5' } }, t('onb.sleepAuto')),
      UI.el('div', { class: 'glass-card card' }, [
        UI.el('div', { class: 'row gap3', style: { alignItems: 'center' } }, [dot, UI.el('div', { class: 'grow' }, [statusText, statusSub])]),
        UI.el('div', { class: 'row gap2', style: { marginTop: '14px', alignItems: 'center' } }, [recheckBtn, changeLink]),
        urlInput,
        UI.el('div', { class: 'tiny muted', style: { marginTop: '10px' } }, t('onb.usingAddress', { url: effectiveUrl || '—' })),
      ]),
      UI.el('div', { class: 'row between gap3', style: { marginTop: '24px' } }, [
        UI.btn(t('app.back'), { class: 'btn-ghost', onClick: () => go(2) }),
        UI.btn(t('app.next'), { class: 'btn-primary grow', onClick: () => go(4) }),
      ]),
      UI.el('button', { class: 'btn btn-ghost btn-sm', style: { marginTop: '10px', alignSelf: 'center', opacity: 0.7 }, onclick: () => go(4) }, t('onb.sleepSkip')),
    ]);
    setTimeout(check, 300); // auto-check on entering the screen
  }

  // 4 — baseline mood
  function baseline() {
    const labels = [t('chk.veryLow'), t('chk.low'), t('chk.ok'), t('chk.good'), t('chk.great')];
    let val = draft.baseline + 2;
    const out = UI.el('div', { class: 'huge grad-text tac', style: { margin: '10px 0' } }, labels[val]);
    const slider = UI.el('input', { class: 'range', type: 'range', min: 0, max: 4, step: 1, value: val,
      oninput: e => { val = +e.target.value; draft.baseline = val - 2; out.textContent = labels[val]; UI.haptic('light'); } });
    frame([
      dots(6, 3),
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
      dots(6, 4),
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
        go(6);
      } }),
      UI.el('button', { class: 'btn btn-ghost btn-sm', style: { marginTop: '12px', alignSelf: 'center' }, onclick: () => go(6) }, t('onb.notifLater')),
    ]);
  }

  // 6 — ready (with demo-data offer)
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
