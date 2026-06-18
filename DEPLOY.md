# Make Google sign-in work on a live Vercel app — exact steps

This is the complete checklist to get **Google sign-in** working on your live
`*.vercel.app` site. The code is already done — these are the dashboard /
console steps only **you** can do.

(Anchor has **no backend** anymore — it's a pure static site. There's no email/
newsletter and no `/api` functions.)

---

## Part 0 — Deploy the static site

The repo is a static site served from `www/` (configured by the root
`vercel.json`, which sets `outputDirectory: www`).

In the **Vercel dashboard → your project → Settings → General**:

1. **Root Directory** → leave it **EMPTY** (the repo root).
2. **Framework Preset** → `Other`. Build/Install commands are already no-ops in
   `vercel.json`.
3. Deploy. Your app is live at `https://YOUR-APP.vercel.app`.

---

## Part 1 — Google sign-in (the "Firebase" button)

Google's sign-in button **only renders on web origins you have authorized**.
That's the #1 reason it "doesn't work" on a fresh deploy.

The app uses this **Web client ID** (in `www/js/config.js` → `firebaseClientId`):

```
627695329462-im66fvcj0up28brbj2kohj8ao3gkh325.apps.googleusercontent.com
```

### 1a. Authorize your Vercel domain
1. Go to **Google Cloud Console → APIs & Services → Credentials**:
   <https://console.cloud.google.com/apis/credentials>
   (make sure you're in the **project that owns the client ID above** —
   project number `627695329462`. If you don't have access to it, do **1c**
   to create your own instead.)
2. Under **OAuth 2.0 Client IDs**, click the **Web client** whose ID matches
   the one above.
3. Under **Authorized JavaScript origins** → **+ Add URI** and add **both**:
   - `https://YOUR-APP.vercel.app`
   - your custom domain too, if you have one (e.g. `https://anchor.com`)
   - *(for local testing you can also add `http://localhost:3000`)*
   ⚠️ Origins are scheme + host only — **no path, no trailing slash**.
4. **Save.** Changes can take a few minutes (sometimes longer) to propagate.

### 1b. Make sure the consent screen is usable
1. **APIs & Services → OAuth consent screen.**
2. If **Publishing status** is *Testing*, either click **Publish app**, or add
   your Google account under **Test users**. Otherwise sign-in is blocked for
   everyone but listed testers.

### 1c. (Only if you can't access that project) Create your own Web client
1. Google Cloud Console → create/select a project.
2. **OAuth consent screen** → set it up (External, add app name + your email).
3. **Credentials → + Create Credentials → OAuth client ID → Web application.**
4. Add the **Authorized JavaScript origins** from step **1a**.
5. **Create**, copy the new **Client ID**, and paste it into
   `www/js/config.js` → `firebaseClientId: '...'`. Commit & redeploy.

✅ **Verify:** open the live site in an incognito window → the sign-in screen
should show the **"Continue with Google"** button. If the button is missing, the
current origin isn't authorized (re-check 1a — exact domain, no trailing slash)
or the change hasn't propagated yet.

> Note on iPhone: native Google sign-in is a separate setup (an **iOS** OAuth
> client + `GoogleService-Info.plist`, wired with `npm run wire-google`). It is
> not needed for the live web app and is independent of the steps above.

---

## Quick troubleshooting

| Symptom | Fix |
|---|---|
| No "Continue with Google" button | Add your exact `https://…vercel.app` origin to the Web client's **Authorized JavaScript origins**; wait for propagation. |
| Google: "access blocked / app not verified" | Publish the OAuth consent screen, or add yourself as a Test user. |
| Sign-in button shows but errors on click | Make sure you clicked the correct **Web** client (not iOS/Android), and the origin matches exactly (scheme + host, no trailing slash). |
