// ===========================================================================
// config.js — non-secret integration IDs (a Google *web client id* is public
// and safe to ship in the client). NO secrets belong in this file.
// ===========================================================================
window.CONFIG = {
  // AI proxy endpoint (api/chat.js). On the web this is left blank and the app
  // uses the same-origin path "/api/chat" automatically. For the NATIVE iPhone
  // app there is no same-origin server, so set this to your deployed origin,
  // e.g. 'https://your-app.vercel.app/api/chat'. The real Cerebras key lives in
  // that server's CEREBRAS_API_KEY env var and is never shipped to the device.
  // MUST be an absolute https:// URL (a bare host is treated as a relative path
  // by the browser and silently 404s — that was the old "couldn't reach the AI"
  // bug). On the web build the app also falls back to the same-origin /api/chat.
  aiProxyUrl: 'https://anchor-lac.vercel.app/api/chat',

  // Google WEB client id (Firebase) — used by the web "Sign in with Google" button.
  firebaseClientId: '627695329462-im66fvcj0up28brbj2kohj8ao3gkh325.apps.googleusercontent.com',
  // Google iOS client id — REQUIRED for native Google sign-in inside the iPhone
  // app. Create an "iOS" OAuth client in Firebase/Google Cloud and paste it here
  // (looks like 627695329462-XXXX.apps.googleusercontent.com). Also add its
  // REVERSED form as a URL scheme in ios/App/App/Info.plist (see the placeholder
  // there). Until both are set, native Google sign-in stays hidden/graceful.
  googleIOSClientId: '627695329462-t142vqaambtmekorfrbon4k016kifgsf.apps.googleusercontent.com',

  // ---- OPTIONAL: serverless cross-device account sync (Firebase) -----------
  // Fill this in to make "Sign in with Google" carry your data across every
  // computer/phone that signs into the same Google account. Leave it blank and
  // the app stays 100% on-device exactly as before. These values are NOT secret
  // — a Firebase web config (apiKey included) is designed to ship in the client;
  // your data is protected by Firestore security rules, not by hiding this.
  //
  // Where to get it: Firebase console → Project settings → General → "Your apps"
  // → the Web app → "SDK setup and configuration" → Config. See CLOUD_SYNC.md
  // for the full one-time setup (enable Google sign-in + Firestore + rules).
  firebaseConfig: {
    apiKey: "AIzaSyAHN76yNHapBYAZYY3gz-31Y79-TmMb81g",
    authDomain: "milpitas-hacks-f628f.firebaseapp.com",
    projectId: "milpitas-hacks-f628f",
    storageBucket: "milpitas-hacks-f628f.firebasestorage.app",
    messagingSenderId: "627695329462",
    appId: "1:627695329462:web:5b32ccf8a6eb9b556d0617",
    measurementId: "G-5DTBMH3S6R"
  },
};
