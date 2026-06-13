// ===========================================================================
// config.js — non-secret integration IDs. These are safe to ship in the client
// (a Google *web client id* and Resend *broadcast/template ids* are public).
//
// The SECRET Resend API key is NEVER here — it lives only on the server side
// (.env RESEND_API_KEY on the Mac bridge, or a Vercel env var). The app asks a
// server to send mail; it never sends mail itself.
// ===========================================================================
window.CONFIG = {
  // Baked-in default address of the Mac bridge (USB Arduino -> Wi-Fi -> phone).
  // Since the Wi-Fi/IP is stable, the app auto-connects to this with no setup.
  // If the IP ever changes, update it here (or override in Settings).
  bridgeUrl: 'http://172.20.74.171:3000',

  // Google WEB client id (Firebase) — used by the web "Sign in with Google" button.
  firebaseClientId: '627695329462-im66fvcj0up28brbj2kohj8ao3gkh325.apps.googleusercontent.com',
  // Google iOS client id — REQUIRED for native Google sign-in inside the iPhone
  // app. Create an "iOS" OAuth client in Firebase/Google Cloud and paste it here
  // (looks like 627695329462-XXXX.apps.googleusercontent.com). Also add its
  // REVERSED form as a URL scheme in ios/App/App/Info.plist (see the placeholder
  // there). Until both are set, native Google sign-in stays hidden/graceful.
  googleIOSClientId: '627695329462-t142vqaambtmekorfrbon4k016kifgsf.apps.googleusercontent.com',
  resend: {
    daily:   '77d4a111-6792-4815-afe1-d019aa7f0d2c',
    weekly:  '06f58679-349a-45f1-aa29-aad9e5b5bb13',
    monthly: '3af0d657-6494-4374-ae9a-f25f9c5da4a7',
  },
};
