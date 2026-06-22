// ===========================================================================
// auth.js — a lightweight, ON-DEVICE account gate. Anchor has no servers, so
// this is a local identity + lock, not cloud auth: a name, an optional email,
// and an optional 4-digit passcode. It satisfies "you have to sign in and can
// sign out" while keeping the privacy promise (nothing leaves the device).
//
//   Auth.isSignedIn()  Auth.hasAccount()  Auth.account()
//   Auth.start(onDone) — renders the sign-in / sign-up screen into #view
//   Auth.signOut()     — locks the app (data is kept) and returns to sign-in
// ===========================================================================
(function () {
  function account() { return Store.get('profile.account', null); }
  function hasAccount() { return !!(account() && account().name); }

  // Whether to keep the user signed in across app closes. Asked once on first
  // run and changeable later in Settings. Default: stay signed in.
  function persistSession() { return Store.get('settings.session.persist', true) !== false; }

  // The signed-in flag lives in ONE of two web-storage backends depending on
  // that preference:
  //   • localStorage   — survives app close → "stay signed in"
  //   • sessionStorage — cleared when the app/webview is closed → "log out on close"
  // (We deliberately do NOT mirror this into the persisted Store, or the
  //  "log out on close" choice could never actually take effect.)
  const SK = 'anchor_signed_in';
  function isSignedIn() {
    try { if (sessionStorage.getItem(SK) === '1') return true; } catch {}
    try { if (localStorage.getItem(SK) === '1') return true; } catch {}
    return false;
  }
  function setSignedIn(v) {
    try {
      if (!v) { localStorage.removeItem(SK); sessionStorage.removeItem(SK); return; }
      if (persistSession()) { localStorage.setItem(SK, '1'); sessionStorage.removeItem(SK); }
      else { sessionStorage.setItem(SK, '1'); localStorage.removeItem(SK); }
    } catch {}
  }

  // Change the "stay signed in / log out on close" preference. Re-homes the
  // current session into the correct backend so the choice applies immediately,
  // and re-syncs reminders (general vs. user-specific) just in case.
  function setPersist(v) {
    Store.set('settings.session.persist', !!v);
    if (isSignedIn()) setSignedIn(true);   // move flag to the right backend
    if (window.Native && Native.syncReminders) Native.syncReminders();
  }
  function isPersist() { return persistSession(); }

  let onDone = null;

  function start(done) { onDone = done; render(hasAccount() ? 'signin' : 'signup'); }

  function host() { return document.getElementById('view'); }
  const E = UI.el;

  function frame(children) {
    const h = host(); UI.clear(h);
    h.appendChild(E('div', { class: 'rise', style: {
      minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: 'calc(var(--safe-t) + 32px) 24px calc(var(--safe-b) + 32px)', maxWidth: '480px', margin: '0 auto',
    } }, children));
    h.scrollTop = 0;
  }

  function logo() {
    return E('div', { class: 'col center', style: { marginBottom: '26px' } }, [
      E('div', { class: 'brand-mark', style: { width: '60px', height: '60px', borderRadius: '19px', animation: 'float-y 4s ease-in-out infinite' } }),
    ]);
  }

  // ---- sign up (first run) ----
  function renderSignUp() {
    const name = E('input', { class: 'input', placeholder: t('auth.namePlaceholder'), autocapitalize: 'words', maxlength: 40 });
    const email = E('input', { class: 'input', type: 'email', placeholder: t('auth.emailPlaceholder'), autocapitalize: 'none', autocomplete: 'email' });
    const pin = E('input', { class: 'input', type: 'password', autocomplete: 'new-password', maxlength: 64, placeholder: t('auth.pwPlaceholder'), oninput: () => UI.hapticTick() });
    frame([
      logo(),
      E('h1', { class: 'serif tac', style: { fontSize: '2.2rem', marginBottom: '6px' } }, t('auth.welcome')),
      E('p', { class: 'soft tac', style: { marginBottom: '22px', lineHeight: '1.5' } }, t('app.tagline')),
      UI.card([
        UI.field(t('set.name'), name),
        UI.field(null, email),
        UI.field(t('auth.pwLabel'), pin, t('auth.pwHint')),
      ]),
      UI.el('div', { style: { height: '16px' } }),
      UI.btn(t('auth.createCta'), { class: 'btn-primary btn-lg', block: true, onClick: () => {
        const nm = (name.value || '').trim();
        if (!nm) { name.focus(); UI.haptic('error'); return; }
        Store.profile.update({ account: { name: nm, email: (email.value || '').trim(), pin: (pin.value || '') } });
        Store.profile.update({ name: nm });
        setSignedIn(true); UI.haptic('success'); finish();
      } }),
      orRow(), googleSlot(),
      E('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '10px' }, onclick: () => render('signin') }, t('auth.switchToSignIn')),
      E('p', { class: 'tiny muted tac', style: { marginTop: '14px', lineHeight: '1.5' } }, t('auth.onDevice')),
    ]);
    setTimeout(() => name.focus(), 250);
  }

  // ---- sign in (returning) ----
  function renderSignIn() {
    const acct = account();
    if (!acct) return render('signup');
    const hasPw = !!(acct.pin && acct.pin.length);
    const pin = E('input', { class: 'input', type: 'password', autocomplete: 'current-password', maxlength: 64, placeholder: t('auth.pwEnter'), oninput: () => UI.hapticTick() });
    const err = E('div', { class: 'tiny tac', style: { color: 'var(--bad)', minHeight: '16px', marginTop: '8px' } });
    function attempt() {
      if (hasPw && (pin.value || '') !== acct.pin) { err.textContent = t('auth.pwWrong'); UI.haptic('error'); pin.value = ''; return; }
      setSignedIn(true); UI.haptic('success'); finish();
    }
    frame([
      logo(),
      E('h1', { class: 'serif tac', style: { fontSize: '2.1rem', marginBottom: '4px' } }, t('auth.welcomeBack')),
      E('p', { class: 'soft tac', style: { marginBottom: '24px' } }, acct.name),
      hasPw ? UI.card([
        E('div', { class: 'field-label tac', style: { marginBottom: '10px' } }, t('auth.pwEnter')),
        pin, err,
      ]) : E('div', { class: 'col center', style: { marginBottom: '8px' } }, [
        E('div', { class: 'lr-ico', style: { width: '56px', height: '56px', fontSize: '1.6rem' } }, '👋'),
      ]),
      UI.btn(t('auth.signInCta'), { class: 'btn-primary btn-lg', block: true, onClick: attempt }),
      orRow(), googleSlot(),
      E('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '10px' }, onclick: () => render('signup') }, t('auth.switchToSignUp')),
      E('p', { class: 'tiny muted tac', style: { marginTop: '14px' } }, '🔒 ' + t('auth.onDevice')),
    ]);
    if (hasPw) { setTimeout(() => pin.focus(), 250); pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); }); }
  }

  function render(mode) { if (mode === 'signin') renderSignIn(); else renderSignUp(); }

  // Always move the user forward after a successful sign-in. Previously, if the
  // onDone callback had already been consumed (e.g. signing out and back in
  // within one session), the button would silently do nothing — which read as
  // "login is broken." Now we fall back to booting the app directly.
  function finish() {
    const cb = onDone; onDone = null;
    if (cb) { try { cb(); return; } catch (e) { console.warn('auth: onDone failed', e); } }
    if (window.App && App.startApp) { App.hideChrome(false); App.startApp(); }
  }

  // ---- "Continue with Google" via Google Identity Services ----
  // Works on web origins authorized in the Google/Firebase console; on other
  // origins (e.g. a raw Capacitor webview) it simply doesn't render — the
  // on-device account flow above is always available as the primary path.
  function loadGIS() {
    return new Promise((res, rej) => {
      if (window.google && google.accounts && google.accounts.id) return res();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
      s.onload = () => res(); s.onerror = () => rej(new Error('gis'));
      document.head.appendChild(s);
    });
  }
  function decodeJwt(tok) {
    try { const b = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(b)))); }
    catch { return null; }
  }
  function onGoogleCred(resp) {
    const p = decodeJwt(resp && resp.credential);
    if (!p) return;
    const nm = p.name || p.given_name || 'You';
    Store.profile.update({ account: { name: nm, email: p.email || '', pin: '', google: true }, name: nm });
    setSignedIn(true); UI.haptic('success'); finish();
  }
  function isNative() { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }
  function socialPlugin() { return window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.SocialLogin; }

  // Native (iPhone app) Google sign-in via @capgo/capacitor-social-login.
  async function nativeGoogle(btn) {
    const SL = socialPlugin();
    if (!SL || !(window.CONFIG && CONFIG.googleIOSClientId)) { UI.toast(t('google.failed'), 'bad'); return; }
    const old = btn && btn.textContent; if (btn) { btn.disabled = true; btn.textContent = t('google.signingIn'); }
    try {
      await SL.initialize({ google: { iOSClientId: CONFIG.googleIOSClientId, webClientId: CONFIG.firebaseClientId } });
      const r = await SL.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
      const p = (r && r.result && (r.result.profile || r.result)) || {};
      const nm = p.name || p.displayName || p.givenName || p.given_name || 'You';
      Store.profile.update({ account: { name: nm, email: p.email || '', pin: '', google: true }, name: nm });
      setSignedIn(true); UI.haptic('success'); finish();
    } catch (e) { UI.toast(t('google.failed'), 'bad'); if (btn) { btn.disabled = false; btn.textContent = old; } }
  }

  function googleSlot() {
    const c = UI.el('div', { class: 'row center', style: { minHeight: '44px', marginTop: '4px' } });
    if (!window.CONFIG) return c;
    if (isNative()) {
      // native build: only show the button if the iOS client id + plugin exist
      if (!socialPlugin() || !CONFIG.googleIOSClientId) return c;
      const btn = UI.btn(t('google.signIn'), { class: 'btn-ghost btn-block', icon: 'user', onClick: () => nativeGoogle(btn) });
      c.appendChild(btn);
      return c;
    }
    // web build: official Google Identity Services button (needs an authorized origin)
    if (!CONFIG.firebaseClientId) return c;
    loadGIS().then(() => {
      try {
        google.accounts.id.initialize({ client_id: CONFIG.firebaseClientId, callback: onGoogleCred });
        google.accounts.id.renderButton(c, { theme: 'filled_black', shape: 'pill', size: 'large', text: 'continue_with' });
      } catch (e) { /* unauthorized origin — leave the slot empty */ }
    }).catch(() => {});
    return c;
  }
  function orRow() {
    const line = () => UI.el('span', { style: { flex: 1, height: '1px', background: 'var(--glass-stroke-soft)' } });
    return UI.el('div', { class: 'row center gap2', style: { margin: '14px 0 4px', color: 'var(--ink-ghost)', fontSize: '0.78rem' } }, [line(), 'or', line()]);
  }

  async function signOut() {
    const ok = await UI.confirm(t('auth.signOutConfirm'), { confirmLabel: t('auth.signOut') });
    if (!ok) return;
    setSignedIn(false);
    // Drop user-specific reminders; general "we miss you" nudges keep going.
    if (window.Native && Native.syncReminders) Native.syncReminders();
    UI.toast(t('auth.signedOut'), 'good');
    if (window.App && App.gate) { App.hideChrome(true); App.gate(); }
  }

  // Permanently delete the account AND all on-device data, then return to the
  // sign-up screen. Distinct from "sign out" (keeps data) and "erase data"
  // (keeps the account).
  async function deleteAccount() {
    const ok = await UI.confirm(t('auth.deleteConfirm'), { danger: true, confirmLabel: t('auth.deleteAccount') });
    if (!ok) return;
    setSignedIn(false);
    Store.reset();
    try { localStorage.removeItem('anchor_lang'); } catch {}
    UI.toast(t('auth.deleted'), 'good');
    location.reload();
  }

  window.Auth = { isSignedIn, hasAccount, account, start, signOut, deleteAccount, setPersist, isPersist };
})();
