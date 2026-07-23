// ===========================================================================
// cloud.js — OPTIONAL serverless account sync via Firebase.
//
// Anchor is on-device by default. When you fill in CONFIG.firebaseConfig,
// signing in with Google also signs you into Firebase Auth and mirrors your
// entire Store state to a single Firestore document keyed by your Google
// account (users/<uid>). Sign in on any computer with the same Google account
// and your data follows you — no server of your own to run.
//
//   Cloud.enabled()                         — is Firebase configured?
//   Cloud.signInWithGoogleToken(tokens)     — {idToken?, accessToken?} → Firebase user
//   Cloud.linkAndSync(fallbackProfile)      — pull/merge/push + start live sync
//   Cloud.resume()                          — reattach sync on app boot (persisted session)
//   Cloud.signOut()                         — stop sync + sign out of Firebase
//   Cloud.isSyncing()                       — whether a live sync is active
//
// Everything is best-effort: any Firebase failure is caught and the on-device
// app keeps working exactly as before. Nothing here can block sign-in.
// ===========================================================================
(function () {
  // Pin a known-good modular SDK build. These load from gstatic, already
  // allowed by the app's CSP (script-src https://*.gstatic.com), and all
  // Firebase network calls go to *.googleapis.com (already in connect-src).
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.0';
  const PUSHED_KEY = 'anchor_cloud_pushed_at';   // ms timestamp of our last successful push
  const PUSH_DEBOUNCE = 1500;                    // coalesce rapid local edits before writing

  function cfg() { return (window.CONFIG && CONFIG.firebaseConfig) || null; }
  function enabled() { const c = cfg(); return !!(c && c.apiKey && c.projectId && c.appId); }

  // ---- lazy Firebase bootstrap --------------------------------------------
  let _fb = null;        // resolved { app, auth, db, api:{...} }
  let _fbPromise = null;
  function ensure() {
    if (_fb) return Promise.resolve(_fb);
    if (_fbPromise) return _fbPromise;
    if (!enabled()) return Promise.reject(new Error('firebase-not-configured'));
    _fbPromise = (async () => {
      const [appMod, authMod, fsMod] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
      const app = appMod.initializeApp(cfg());
      const auth = authMod.getAuth(app);
      const db = fsMod.getFirestore(app);
      // Keep the auth session across app restarts so users don't re-consent.
      try { await authMod.setPersistence(auth, authMod.indexedDBLocalPersistence); } catch {}
      _fb = {
        app, auth, db,
        api: {
          GoogleAuthProvider: authMod.GoogleAuthProvider,
          signInWithCredential: authMod.signInWithCredential,
          onAuthStateChanged: authMod.onAuthStateChanged,
          fbSignOut: authMod.signOut,
          doc: fsMod.doc, getDoc: fsMod.getDoc, setDoc: fsMod.setDoc, onSnapshot: fsMod.onSnapshot,
        },
      };
      return _fb;
    })();
    _fbPromise.catch(() => { _fbPromise = null; });   // allow retry on next attempt
    return _fbPromise;
  }

  // ---- sign in ------------------------------------------------------------
  // Reuse the Google token the app already obtained (web = OAuth access token
  // from GIS; native = idToken from @capgo/capacitor-social-login) and exchange
  // it for a Firebase session — no extra popup, no extra consent screen.
  async function signInWithGoogleToken(tokens) {
    const { auth, api } = await ensure();
    const cred = api.GoogleAuthProvider.credential(tokens.idToken || null, tokens.accessToken || null);
    const res = await api.signInWithCredential(auth, cred);
    return res.user;
  }

  // ---- Firestore document for the current user ----------------------------
  function userDoc(fb, uid) { return fb.api.doc(fb.db, 'users', uid); }
  function pushedAt() { try { return Number(localStorage.getItem(PUSHED_KEY)) || 0; } catch { return 0; } }
  function setPushedAt(ms) { try { localStorage.setItem(PUSHED_KEY, String(ms)); } catch {} }

  // ---- merge helpers ------------------------------------------------------
  const ARRAY_STREAMS = ['values', 'sleep', 'moods', 'journal', 'energy', 'activity',
    'decompress', 'experiments', 'valuesChecks', 'insights', 'investigations', 'profileWins'];

  // Union two record arrays by id. On an id collision keep the record with the
  // later `ts` (creation/last-touch marker); records without ids are appended.
  function mergeArray(a, b) {
    const out = new Map();
    let anon = 0;
    (a || []).concat(b || []).forEach(r => {
      if (!r || typeof r !== 'object') return;
      const key = r.id != null ? String(r.id) : `__anon_${anon++}`;
      const prev = out.get(key);
      if (!prev || (Number(r.ts) || 0) >= (Number(prev.ts) || 0)) out.set(key, r);
    });
    return Array.from(out.values());
  }

  // First-ever link on THIS device: never lose data on either side. Union all
  // record streams; for the singleton objects prefer the remote account's copy
  // when it carries real content, otherwise keep local.
  function unionMerge(local, remote) {
    const merged = Object.assign({}, local);
    ARRAY_STREAMS.forEach(k => { merged[k] = mergeArray(local[k], remote[k]); });
    if (remote.profile && (remote.profile.name || remote.profile.onboarded)) {
      merged.profile = Object.assign({}, local.profile, remote.profile);
    }
    if (remote.settings) merged.settings = Object.assign({}, local.settings, remote.settings);
    if (remote.gamification) {
      const l = local.gamification || {}, r = remote.gamification || {};
      merged.gamification = {
        streak: Math.max(l.streak || 0, r.streak || 0),
        longest: Math.max(l.longest || 0, r.longest || 0),
        lastActive: [l.lastActive, r.lastActive].filter(Boolean).sort().pop() || null,
        grace: Math.max(l.grace || 0, r.grace || 0),
      };
    }
    return merged;
  }

  // ---- live sync state ----------------------------------------------------
  let _uid = null;
  let _unsubSnap = null;      // Firestore onSnapshot unsubscribe
  let _unsubStore = null;     // Store.on('change') unsubscribe
  let _applyingRemote = false;
  let _pushTimer = null;

  function snapshot() { try { return JSON.parse(Store.export()); } catch { return Store.raw; } }

  async function push(state) {
    const fb = await ensure();
    if (!_uid) return;
    const now = Date.now();
    await fb.api.setDoc(userDoc(fb, _uid), {
      state: JSON.stringify(state || snapshot()),
      updatedAt: now,
      // lightweight, human-readable metadata alongside the blob
      email: Store.get('profile.account.email', '') || '',
      name: Store.get('profile.name', '') || '',
      schema: 1,
    });
    setPushedAt(now);
  }

  function schedulePush() {
    if (_applyingRemote || !_uid) return;
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => { push().catch(e => console.warn('cloud push failed', e)); }, PUSH_DEBOUNCE);
  }

  // Apply a remote state onto the device without echoing it straight back up.
  function applyRemote(remoteState, updatedAt) {
    _applyingRemote = true;
    try {
      Store.import(JSON.stringify(remoteState));
      setPushedAt(updatedAt || Date.now());
      if (window.Anchor && Anchor.refresh) { try { Anchor.refresh(); } catch {} }
    } finally {
      // release on the next tick so the import's 'change' emit doesn't re-push
      setTimeout(() => { _applyingRemote = false; }, 0);
    }
  }

  function startLiveSync(fb) {
    if (_unsubStore) _unsubStore();
    _unsubStore = Store.on('change', schedulePush);
    if (_unsubSnap) _unsubSnap();
    _unsubSnap = fb.api.onSnapshot(userDoc(fb, _uid), (snap) => {
      // Ignore the local echo of our own pending write.
      if (!snap.exists() || (snap.metadata && snap.metadata.hasPendingWrites)) return;
      const d = snap.data() || {};
      if ((d.updatedAt || 0) > pushedAt()) {
        try { applyRemote(JSON.parse(d.state), d.updatedAt); } catch (e) { console.warn('cloud apply failed', e); }
      }
    }, (err) => console.warn('cloud snapshot error', err));
  }

  // ---- link + first reconciliation ----------------------------------------
  // Call right after signInWithGoogleToken succeeds. Reconciles this device
  // with the account document, then keeps them in sync live.
  async function linkAndSync(user) {
    const fb = await ensure();
    _uid = (user && user.uid) || (fb.auth.currentUser && fb.auth.currentUser.uid);
    if (!_uid) throw new Error('no-uid');
    // Stamp the account with its cloud identity for later boots.
    try { Store.profile.update({ account: Object.assign({}, Store.get('profile.account', {}), { google: true, uid: _uid }) }); } catch {}

    const ref = userDoc(fb, _uid);
    const remoteSnap = await fb.api.getDoc(ref);
    const local = snapshot();

    if (!remoteSnap.exists()) {
      // First device on this account → seed the cloud with what we have.
      await push(local);
    } else {
      const d = remoteSnap.data() || {};
      let remoteState = null;
      try { remoteState = JSON.parse(d.state); } catch {}
      const remoteUpdatedAt = d.updatedAt || 0;
      if (!remoteState) {
        await push(local);
      } else if (pushedAt() === 0) {
        // This device has never synced to this account → non-destructive union.
        const merged = unionMerge(local, remoteState);
        applyRemote(merged, remoteUpdatedAt);   // adopt merged locally
        await push(merged);                      // and write it back (bumps updatedAt)
      } else if (remoteUpdatedAt > pushedAt()) {
        // The account changed on another device since we last pushed → adopt it.
        applyRemote(remoteState, remoteUpdatedAt);
      } else {
        // Our local copy is at least as fresh → push it.
        await push(local);
      }
    }
    startLiveSync(fb);
    return _uid;
  }

  function isSyncing() { return !!_uid; }

  // ---- boot: reattach a persisted Firebase session ------------------------
  // Firebase remembers the signed-in user across app restarts (IndexedDB). On
  // boot, if we already have a Google-linked local account, wait for Firebase
  // to restore that session and resume syncing automatically.
  let _resumed = false;
  function resume() {
    if (_resumed || !enabled()) return;
    _resumed = true;
    ensure().then((fb) => {
      fb.api.onAuthStateChanged(fb.auth, (user) => {
        if (user && !_uid) { linkAndSync(user).catch(e => console.warn('cloud resume failed', e)); }
      });
    }).catch(() => { _resumed = false; });
  }

  // ---- sign out -----------------------------------------------------------
  async function signOut() {
    clearTimeout(_pushTimer);
    if (_unsubSnap) { try { _unsubSnap(); } catch {} _unsubSnap = null; }
    if (_unsubStore) { try { _unsubStore(); } catch {} _unsubStore = null; }
    _uid = null;
    setPushedAt(0);
    if (!_fb) return;
    try { await _fb.api.fbSignOut(_fb.auth); } catch (e) { console.warn('cloud signOut failed', e); }
  }

  window.Cloud = { enabled, signInWithGoogleToken, linkAndSync, resume, signOut, isSyncing };
})();
