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
  firebaseClientId: '96377719286-nrt9cit2cemlvp5q6sqjse65k9n8d6lv.apps.googleusercontent.com',
  // Google iOS client id — REQUIRED for native Google sign-in inside the iPhone
  // app. Create an "iOS" OAuth client in Firebase/Google Cloud and paste it here
  // (looks like 627695329462-XXXX.apps.googleusercontent.com). Also add its
  // REVERSED form as a URL scheme in ios/App/App/Info.plist (see the placeholder
  // there). Until both are set, native Google sign-in stays hidden/graceful.
  googleIOSClientId: '96377719286-kh4grmomh50nhlt3eirc0r0gqp73s6q5.apps.googleusercontent.com',
};
