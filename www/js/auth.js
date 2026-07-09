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

  // ---- passcode security ---------------------------------------------------
  // The 4-digit passcode is NEVER stored in plaintext. We derive a PBKDF2-
  // SHA256 hash with a per-account random salt; only {pinHash,pinSalt,pinAlgo}
  // are persisted. Verification re-derives and compares in constant time. If
  // Web Crypto is unavailable we fall back to plaintext (rare; keeps the gate
  // working), and any legacy plaintext pin is upgraded to a hash on next login.
  const PIN_ITER = 210000;
  function _b64(bytes) { let s = ''; bytes.forEach(b => s += String.fromCharCode(b)); return btoa(s); }
  function _unb64(str) { const bin = atob(str); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function _hasSubtle() { return !!(window.crypto && crypto.subtle && crypto.getRandomValues); }
  async function derivePin(pin, saltB64) {
    const enc = new TextEncoder();
    const salt = saltB64 ? _unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
    const km = await crypto.subtle.importKey('raw', enc.encode(String(pin)), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PIN_ITER, hash: 'SHA-256' }, km, 256);
    return { hash: _b64(new Uint8Array(bits)), salt: _b64(salt) };
  }
  function _safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
  }
  // Build the account fields for a (possibly empty) passcode.
  async function makePasscode(pin) {
    pin = pin || '';
    if (!pin) return { pin: '', pinHash: '', pinSalt: '', pinAlgo: '' };
    if (_hasSubtle()) {
      try { const d = await derivePin(pin); return { pin: '', pinHash: d.hash, pinSalt: d.salt, pinAlgo: 'pbkdf2-sha256-' + PIN_ITER }; } catch {}
    }
    return { pin, pinHash: '', pinSalt: '', pinAlgo: '' };   // fallback: no WebCrypto
  }
  function hasPasscode(acct) { return !!(acct && (acct.pinHash || (acct.pin && acct.pin.length))); }
  // Verify an entered passcode; transparently upgrades a legacy plaintext pin.
  async function verifyPasscode(acct, input) {
    input = input || '';
    if (acct.pinHash && acct.pinSalt) {
      try { const d = await derivePin(input, acct.pinSalt); return _safeEqual(d.hash, acct.pinHash); } catch { return false; }
    }
    if (acct.pin != null && acct.pin !== '') {
      const ok = input === acct.pin;
      if (ok) { try { const f = await makePasscode(input); Store.profile.update({ account: Object.assign({}, acct, f) }); } catch {} }
      return ok;
    }
    return true;   // no passcode set
  }

  // ---- brute-force guard -----------------------------------------------------
  // A 4-digit PIN is only 10k combinations, and PBKDF2 verification is fast, so
  // an on-device lockout is what actually raises the bar against someone picking
  // up the phone and guessing. After a few free misses, each further wrong try
  // triggers an exponentially growing lockout. Persisted so a reload can't reset
  // it, and cleared on any successful unlock.
  const PIN_GUARD_KEY = 'anchor_pin_guard';
  const PIN_FREE_TRIES = 4;            // misses allowed before lockouts begin
  const PIN_BASE_LOCK  = 15000;        // first lockout: 15s, doubling each miss
  const PIN_MAX_LOCK   = 15 * 60000;   // capped at 15 minutes
  function _guardGet() { try { return JSON.parse(localStorage.getItem(PIN_GUARD_KEY)) || {}; } catch { return {}; } }
  function _guardSet(g) { try { localStorage.setItem(PIN_GUARD_KEY, JSON.stringify(g)); } catch {} }
  function _guardClear() { try { localStorage.removeItem(PIN_GUARD_KEY); } catch {} }
  function pinLockRemaining() { const g = _guardGet(); return Math.max(0, (g.lockUntil || 0) - Date.now()); }
  function registerPinFail() {
    const g = _guardGet();
    g.fails = (g.fails || 0) + 1;
    if (g.fails > PIN_FREE_TRIES) {
      const over = g.fails - PIN_FREE_TRIES;   // 1, 2, 3, …
      g.lockUntil = Date.now() + Math.min(PIN_BASE_LOCK * Math.pow(2, over - 1), PIN_MAX_LOCK);
    }
    _guardSet(g);
  }
  function fmtLock(ms) { const s = Math.ceil(ms / 1000); return s < 60 ? s + 's' : Math.ceil(s / 60) + 'm'; }

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
      UI.btn(t('auth.createCta'), { class: 'btn-primary btn-lg', block: true, onClick: async (e) => {
        const nm = (name.value || '').trim();
        if (!nm) { name.focus(); UI.haptic('error'); return; }
        const btn = e && e.currentTarget; if (btn) btn.disabled = true;
        const pinFields = await makePasscode(pin.value || '');
        Store.profile.update({ account: Object.assign({ name: nm, email: (email.value || '').trim() }, pinFields) });
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
    const hasPw = hasPasscode(acct);
    const pin = E('input', { class: 'input', type: 'password', autocomplete: 'current-password', maxlength: 64, placeholder: t('auth.pwEnter'), oninput: () => UI.hapticTick() });
    const err = E('div', { class: 'tiny tac', style: { color: 'var(--bad)', minHeight: '16px', marginTop: '8px' } });
    let _busy = false;
    const signBtn = UI.btn(t('auth.signInCta'), { class: 'btn-primary btn-lg', block: true, onClick: () => attempt() });
    let _lockTicker = null;
    // While locked out, disable sign-in and count the lock down live.
    function refreshLock() {
      if (!document.body.contains(signBtn)) { if (_lockTicker) { clearInterval(_lockTicker); _lockTicker = null; } return; }
      const rem = hasPw ? pinLockRemaining() : 0;
      if (rem > 0) {
        signBtn.disabled = true;
        err.textContent = t('auth.pwLocked', { time: fmtLock(rem) });
        if (!_lockTicker) _lockTicker = setInterval(refreshLock, 500);
      } else {
        signBtn.disabled = false;
        if (_lockTicker) { clearInterval(_lockTicker); _lockTicker = null; }
      }
    }
    async function attempt() {
      if (_busy) return;
      if (hasPw) {
        if (pinLockRemaining() > 0) { UI.haptic('error'); refreshLock(); return; }
        _busy = true;
        const ok = await verifyPasscode(acct, pin.value || '');
        _busy = false;
        if (!ok) {
          registerPinFail();
          pin.value = ''; UI.haptic('error');
          if (pinLockRemaining() > 0) refreshLock();
          else err.textContent = t('auth.pwWrong');
          return;
        }
        _guardClear();
        if (_lockTicker) { clearInterval(_lockTicker); _lockTicker = null; }
      }
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
      signBtn,
      orRow(), googleSlot(),
      E('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '10px' }, onclick: () => render('signup') }, t('auth.switchToSignUp')),
      E('p', { class: 'tiny muted tac', style: { marginTop: '14px' } }, '🔒 ' + t('auth.onDevice')),
    ]);
    if (hasPw) { setTimeout(() => pin.focus(), 250); pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); }); refreshLock(); }
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
  // Web Google sign-in uses the OAuth token flow with prompt:'select_account', so
  // it ALWAYS shows the account chooser and never personalizes the button with a
  // previous user's name — important on shared devices. We exchange the access
  // token for basic profile info (name/email) via the userinfo endpoint.
  let _tokenClient = null;
  // Multicolor Google "G" mark (official geometry), sized for a button.
  const GOOGLE_LOGO = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">' +
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
    '</svg>';
  // A branded "Continue with Google" button: white logo chip + label. Returns the
  // <button> with a ._label span so callers can flip the text without wiping the logo.
  function googleButton(label, onClick) {
    const labelEl = E('span', {}, label);
    const b = E('button', { class: 'btn btn-ghost btn-block google-btn', onclick: onClick }, [
      UI.frag('<span class="g-logo">' + GOOGLE_LOGO + '</span>'),
      labelEl,
    ]);
    b._label = labelEl;
    return b;
  }
  async function onGoogleToken(resp) {
    // Google popup returned an error (cancelled, popup blocked, or — most often on
    // a fresh deploy — the origin isn't in the OAuth client's Authorized origins).
    if (resp && resp.error) {
      UI.toast(t('google.failed'), 'bad');
      console.warn('Google token error:', resp.error, resp.error_description || '');
      return;
    }
    if (!resp || !resp.access_token) { UI.toast(t('google.failed'), 'bad'); return; }
    // Google has already authenticated the user at this point, so sign-in MUST
    // succeed. The profile lookup is best-effort: if it fails (network/CSP), we
    // still sign in with a fallback name instead of bouncing back to the login
    // screen — that silent bounce was the reported bug.
    let nm = 'You', email = '';
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + resp.access_token } });
      if (r.ok) { const p = await r.json(); nm = p.name || p.given_name || nm; email = p.email || ''; }
    } catch (e) { console.warn('userinfo lookup failed; signing in anyway', e); }
    Store.profile.update({ account: { name: nm, email, pin: '', google: true }, name: nm });
    setSignedIn(true); UI.haptic('success'); finish();
  }
  function isNative() { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }
  function socialPlugin() { return window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.SocialLogin; }

  // Native (iPhone app) Google sign-in via @capgo/capacitor-social-login.
  async function nativeGoogle(btn) {
    const SL = socialPlugin();
    if (!SL || !(window.CONFIG && CONFIG.googleIOSClientId)) { UI.toast(t('google.failed'), 'bad'); return; }
    const labelNode = btn && (btn._label || btn);
    const old = labelNode && labelNode.textContent;
    if (btn) { btn.disabled = true; if (labelNode) labelNode.textContent = t('google.signingIn'); }
    try {
      await SL.initialize({ google: { iOSClientId: CONFIG.googleIOSClientId, webClientId: CONFIG.firebaseClientId } });
      const r = await SL.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
      const p = (r && r.result && (r.result.profile || r.result)) || {};
      const nm = p.name || p.displayName || p.givenName || p.given_name || 'You';
      Store.profile.update({ account: { name: nm, email: p.email || '', pin: '', google: true }, name: nm });
      setSignedIn(true); UI.haptic('success'); finish();
    } catch (e) { UI.toast(t('google.failed'), 'bad'); if (btn) { btn.disabled = false; if (labelNode) labelNode.textContent = old; } }
  }

  function googleSlot() {
    const c = UI.el('div', { class: 'row center', style: { minHeight: '44px', marginTop: '4px' } });
    if (!window.CONFIG) return c;
    if (isNative()) {
      // native build: only show the button if the iOS client id + plugin exist
      if (!socialPlugin() || !CONFIG.googleIOSClientId) return c;
      const btn = googleButton(t('google.signIn'), () => nativeGoogle(btn));
      c.appendChild(btn);
      return c;
    }
    // web build: a neutral "Continue with Google" button. We deliberately do NOT
    // use GIS's personalized renderButton — it shows "Continue as <name>" of the
    // previous user whenever a Google session exists in the browser, which leaks
    // that person on a shared device. The token flow below forces account choice.
    if (!CONFIG.firebaseClientId) return c;
    const gbtn = googleButton(t('google.signIn'), () => {
      if (!_tokenClient) { UI.toast(t('google.failed'), 'bad'); return; }
      try { _tokenClient.requestAccessToken(); } catch (e) { UI.toast(t('google.failed'), 'bad'); }
    });
    gbtn.disabled = true;
    c.appendChild(gbtn);
    // Prepare the token client ahead of the click so requestAccessToken() runs
    // directly inside the user gesture (avoids popup blockers).
    loadGIS().then(() => {
      try {
        _tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CONFIG.firebaseClientId,
          scope: 'openid email profile',
          prompt: 'select_account',
          callback: onGoogleToken,
          // Surfaces popup-closed / origin-not-allowed instead of failing silently
          // (which looked like "it just sends me back to the login page").
          error_callback: (err) => {
            console.warn('Google sign-in error:', err && (err.type || err.message));
            UI.toast(t('google.failed'), 'bad');
          },
        });
        gbtn.disabled = false;
      } catch (e) { console.warn('GIS init failed (origin not authorized?)', e); }
    }).catch(() => { console.warn('GIS script failed to load'); });
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
    // Make sure Google won't silently re-link the previous account next time.
    try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch {}
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

  // Whether there's a passcode to lock behind (auto-lock only engages if so).
  function hasLock() { return hasPasscode(account()); }
  // Re-lock silently (no confirm dialog) — keeps ALL data, just clears the
  // signed-in flag so the passcode gate returns. Used by the app's auto-lock.
  // Returns true only if there was actually a passcode to lock behind.
  function lock() {
    if (!hasLock() || !isSignedIn()) return false;
    setSignedIn(false);
    return true;
  }

  window.Auth = { isSignedIn, hasAccount, account, start, signOut, deleteAccount, setPersist, isPersist, hasLock, lock };
})();
