# Serverless cross-device account sync (Firebase)

By default Anchor is **100% on-device** — nothing leaves the phone/computer.
This optional feature makes **"Continue with Google"** carry your data across
every device that signs in with the *same Google account*, with **no server of
your own to run**. It uses Firebase (Google's serverless backend): Firebase
**Auth** for identity + Firestore for the synced data.

If you leave `CONFIG.firebaseConfig` blank, none of this turns on and the app
behaves exactly as before.

---

## What you need to do (one time, ~10 minutes)

You already have a Google Cloud / Firebase project (project number
`627695329462`). These steps just switch on Auth + Firestore and paste the
public web config into the app.

### 1. Open the Firebase console
Go to <https://console.firebase.google.com/> and open the project that owns
client id `627695329462-…`. (If it only exists in Google Cloud, click
**"Add Firebase"** to that existing Google Cloud project — it keeps the same
OAuth clients you already configured.)

### 2. Enable Google sign-in
**Build → Authentication → Get started → Sign-in method →** enable **Google →
Save.** This lets Firebase accept the Google token the app already gets.

### 3. Enable Cloud Firestore
**Build → Firestore Database → Create database.** Pick a region, start in
**production mode** (we set proper rules next).

### 4. Paste in the security rules
**Firestore → Rules**, replace with the following, then **Publish**. This makes
each account able to read/write **only its own** document:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

### 5. Get the web config
**Project settings (gear icon) → General → Your apps.** If there's no Web app,
click the **`</>`** icon to add one (any nickname; you do NOT need Hosting).
Copy the `firebaseConfig` values shown.

### 6. Paste it into the app
Open `www/js/config.js` and fill in the `firebaseConfig` block:

```js
firebaseConfig: {
  apiKey: 'AIzaSy...',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '627695329462',
  appId: '1:627695329462:web:....',
},
```

> These values are **public and safe to commit** — a Firebase web config is
> designed to ship in the browser. Your data is protected by the Firestore
> rules in step 4, not by hiding this config.

### 7. Authorize your web origins (for the web build)
**Firestore/Auth won't need this, but the existing Google button does:** in
**Google Cloud Console → APIs & Services → Credentials →** your **Web** OAuth
client → **Authorized JavaScript origins**, make sure every URL you serve the
app from is listed (e.g. `http://localhost:PORT`, your Vercel URL). This is the
usual "the Google button does nothing on a new URL" fix.

### 8. Deploy
- **Web:** `git push` (Vercel redeploys automatically).
- **iOS:** `npm run ios` (runs `npx cap sync ios` and opens Xcode), then build.

---

## How it behaves

- Sign in with Google on computer A → your on-device data is pushed to the
  cloud (document `users/<your-uid>`).
- Sign in with Google on computer B with the **same account** → the app pulls
  that data down. The very first time a device links, both sides are **merged**
  (union of all records) so nothing is lost.
- While the app is open on multiple devices, edits sync **live** (last write
  wins at the whole-account level).
- **Sign out** detaches sync and ends the Firebase session. **Delete account**
  stops sync *before* wiping local data, so it doesn't erase your cloud copy on
  other devices.

## Privacy note

Turning this on means your Anchor data (profile, journal, moods, sleep, etc.)
**leaves the device** and is stored in your Firebase project. That is the
trade-off for cross-device sync. The app's default "nothing leaves the device"
promise only holds while `firebaseConfig` is blank — update your in-app privacy
copy if you ship this on.

## No CSP changes were needed

All Firebase network calls go to `*.googleapis.com` (already in the app's
`connect-src`) and the SDK loads from `*.gstatic.com` (already in `script-src`),
so `vercel.json`'s Content-Security-Policy did not have to change.
