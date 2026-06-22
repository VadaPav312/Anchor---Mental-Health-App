// ===========================================================================
// config.js — non-secret integration IDs (a Google *web client id* is public
// and safe to ship in the client).
// ===========================================================================
window.CONFIG = {
  // Google WEB client id (Firebase) — used by the web "Sign in with Google" button.
  firebaseClientId: '96377719286-nrt9cit2cemlvp5q6sqjse65k9n8d6lv.apps.googleusercontent.com',
  // Google iOS client id — REQUIRED for native Google sign-in inside the iPhone
  // app. Create an "iOS" OAuth client in Firebase/Google Cloud and paste it here
  // (looks like 627695329462-XXXX.apps.googleusercontent.com). Also add its
  // REVERSED form as a URL scheme in ios/App/App/Info.plist (see the placeholder
  // there). Until both are set, native Google sign-in stays hidden/graceful.
  googleIOSClientId: '96377719286-kh4grmomh50nhlt3eirc0r0gqp73s6q5.apps.googleusercontent.com',
};
