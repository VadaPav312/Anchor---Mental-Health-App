# 🔑 API Keys & Credentials — how to get every one of them

This is the complete, step-by-step guide to obtaining and installing **every
external credential Anchor can use.** Anchor is deliberately light on external
services — most of the app works with **zero keys** (all your data is generated
and stored on-device). Keys only unlock two optional things:

1. **AI features** (the morning briefing, progress reflections, value "compass
   checks", journaling patterns) → one **Cerebras API key** on the server.
2. **"Continue with Google" sign-in** → **Google OAuth client IDs** (web +,
   optionally, iOS).

Everything else (weather, crisis resources, on-device analytics) needs **no key
at all**.

> TL;DR — if you only do one thing: get a **Cerebras API key** and set it as the
> `CEREBRAS_API_KEY` environment variable in Vercel. That turns the AI on. Google
> sign-in is optional; the app always has its own on-device account flow.

---

## At a glance

| Credential | Required? | Secret? | Where you get it | Where it goes |
|---|---|---|---|---|
| **Cerebras API key** | For AI features | **YES — server only** | cloud.cerebras.ai | `CEREBRAS_API_KEY` env var (Vercel + local `.env`) |
| **Google Web client ID** | For web Google sign-in | No (public) | Google Cloud Console | `www/js/config.js → firebaseClientId` |
| **Google iOS client ID** | For iPhone Google sign-in | No (public) | Google Cloud Console / Firebase | `www/js/config.js → googleIOSClientId` + `ios/App/App/Info.plist` |
| **GoogleService-Info.plist** | For iPhone Google sign-in | No | Firebase console | `ios/App/App/GoogleService-Info.plist` |
| **Open-Meteo (weather)** | Optional weather | **No key needed** | — | Nothing to configure |
| **Google Identity Services JS** | Loaded for web sign-in | **No key needed** | — | Loaded from `accounts.google.com` |

---

## 1 · Cerebras API key (the only real secret)

Anchor's AI runs through **Cerebras** (fast open-weight models such as
`zai-glm-4.7` and Llama variants). The key is used in **exactly one place** —
the serverless proxy at [`api/chat.js`](./api/chat.js) — and is **never** shipped
to the browser or the app binary. The browser talks to your own `/api/chat`
endpoint; that endpoint attaches the secret key and forwards the request.

### 1a. Create the key
1. Go to **<https://cloud.cerebras.ai/>** and sign in (or create a free account).
2. Open **API Keys** in the dashboard.
3. Click **Create API Key**, give it a name (e.g. `anchor-prod`), and **copy it
   now** — you usually can't see it again. It looks like `csk-...`.

### 1b. Install it for local development
Copy the example env file and paste your key:

```bash
cp .env.example .env
```

Then edit `.env`:

```bash
CEREBRAS_API_KEY=csk-your-real-key-here
# OPTIONAL: comma-separated browser origins allowed to call /api/chat.
# Leave empty to use the built-in same-site + localhost + capacitor allowance.
ALLOWED_ORIGINS=
```

Run the app locally with the serverless function active:

```bash
vercel dev        # serves the static site AND the /api/chat function
```

`.env` is **git-ignored** — never commit a real key. Only `.env.example`
(placeholder values) is tracked.

### 1c. Install it in production (Vercel)
1. Vercel dashboard → **your project → Settings → Environment Variables**.
2. Add **`CEREBRAS_API_KEY`** = your key, for the **Production** (and Preview, if
   you want AI on preview deploys) environment.
3. *(Optional)* Add **`ALLOWED_ORIGINS`** = a comma-separated list of the exact
   origins allowed to call the proxy, e.g.
   `https://anchor-lac.vercel.app,https://anchor.example.com`. Leave it unset to
   use the built-in same-site + localhost + `capacitor://localhost` allowance.
4. **Redeploy** so the new env var is picked up.

> ⚠️ If the AI briefing says *"couldn't reach the AI,"* the #1 cause is a missing
> or misspelled `CEREBRAS_API_KEY` in Vercel (the server returns `503 AI is not
> configured`). The #2 cause is a wrong proxy URL — see `www/js/config.js →
> aiProxyUrl`, which **must** be a full `https://…/api/chat` URL for the native
> app.

### 1d. Which models are allowed
The proxy only forwards an **allowlist** of models (so a stolen client can't
pivot to arbitrary/expensive ones). See `ALLOWED_MODELS` in `api/chat.js`:
`zai-glm-4.7` (default), `llama3.1-8b`, `llama-3.3-70b`, `llama3.1-70b`,
`qwen-3-32b`. Users can also paste **their own** Cerebras key in
**Settings → AI & Device** — that key lives only in their on-device storage and
calls Cerebras directly, bypassing your proxy.

---

## 2 · Google Web sign-in client ID ("Continue with Google" on the web)

This is a **public** OAuth **client ID** (not a secret — it's safe to ship in the
client). Google only lets the button work on **origins you have explicitly
authorized**, which is why sign-in "doesn't work" on a fresh deploy.

The app currently ships this Web client ID in
[`www/js/config.js`](./www/js/config.js) → `firebaseClientId`:

```
96377719286-nrt9cit2cemlvp5q6sqjse65k9n8d6lv.apps.googleusercontent.com
```

### 2a. If you own that Google project (number `96377719286`)
1. Go to **Google Cloud Console → APIs & Services → Credentials**:
   <https://console.cloud.google.com/apis/credentials>
2. Under **OAuth 2.0 Client IDs**, click the **Web client** matching the ID above.
3. Under **Authorized JavaScript origins → + Add URI**, add **each** origin you
   serve the app from — scheme + host only, **no path, no trailing slash**:
   - `https://YOUR-APP.vercel.app`
   - your custom domain, if any (`https://anchor.example.com`)
   - `http://localhost:3000` (for local testing)
4. **Save.** Propagation can take a few minutes.
5. **APIs & Services → OAuth consent screen** → if **Publishing status** is
   *Testing*, either **Publish app** or add your Google account under **Test
   users**, or sign-in is blocked for everyone else.

### 2b. If you do NOT own that project — create your own Web client
1. Google Cloud Console → **create or select a project**.
2. **OAuth consent screen** → configure it (**External**, add an app name + your
   support email), then Publish or add test users.
3. **Credentials → + Create Credentials → OAuth client ID → Web application.**
4. Add the **Authorized JavaScript origins** from step 2a.
5. **Create**, copy the new **Client ID**, and paste it into
   `www/js/config.js → firebaseClientId: '…'`. Commit and redeploy.

✅ **Verify:** open the live site in an incognito window. The sign-in screen
should show a **"Continue with Google"** button with the colored Google "G". If a
tap bounces you back to the login screen, the browser console now prints a
`Google sign-in error: …` — an unauthorized origin or an unpublished consent
screen is almost always the cause.

---

## 3 · Google iOS sign-in (only for the native iPhone app)

Native Google sign-in uses the `@capgo/capacitor-social-login` plugin and a
separate **iOS OAuth client ID**. It is **not needed for the web app** and is
completely independent of Section 2.

The app ships this iOS client ID in `www/js/config.js → googleIOSClientId`:

```
96377719286-kh4grmomh50nhlt3eirc0r0gqp73s6q5.apps.googleusercontent.com
```

### 3a. Create the iOS OAuth client
1. In **Firebase console** (<https://console.firebase.google.com/>) add an
   **iOS app** to your project with your bundle id **`com.flowstate.anchor`**
   (or your own). *(You can also do this purely in Google Cloud Console →
   Credentials → Create OAuth client ID → iOS.)*
2. Download the generated **`GoogleService-Info.plist`** and place it at
   **`ios/App/App/GoogleService-Info.plist`** (replace the existing one).
3. Copy the **iOS client ID** and paste it into
   `www/js/config.js → googleIOSClientId: '…'`.

### 3b. Register the reversed-client-ID URL scheme
iOS needs the **reversed** client ID registered as a URL scheme so Google can
call back into the app. In **`ios/App/App/Info.plist`**, under
`CFBundleURLTypes → CFBundleURLSchemes`, add the reversed form:

```
com.googleusercontent.apps.96377719286-kh4grmomh50nhlt3eirc0r0gqp73s6q5
```

(That is the client ID with its two halves swapped: `com.googleusercontent.apps.`
+ the numeric/hash part.) The plist also needs the `GIDClientID` key set to the
plain iOS client ID (already present).

### 3c. The helper script
A convenience script wires the plist + config from your `GoogleService-Info.plist`
automatically:

```bash
npm run wire-google        # = node scripts/wire-google.js
```

Then sync and open Xcode:

```bash
npm run ios                # = npx cap sync ios && npx cap open ios
```

Until **both** the iOS client ID and its reversed URL scheme are set, native
Google sign-in stays hidden/graceful — the on-device account flow always works.

---

## 4 · Services that need NO key

- **Weather — Open-Meteo** (`api.open-meteo.com`). Free, **no API key, no
  sign-up**. Used by `www/js/weather.js` to fetch a local forecast from the
  device's geolocation (with the user's permission). If the call fails, weather
  features simply hide — nothing breaks.
- **Google Identity Services script** (`accounts.google.com/gsi/client`). Loaded
  at runtime for the web sign-in button. It uses the **client ID** from Section 2,
  not a key.
- **Crisis resources** (`findahelpline.com`, `befrienders.org`). Static outbound
  links in the safety panel. No key.
- **All analytics, correlations, scores, and journaling insights** run
  **on-device** in plain JavaScript (`stats.js`, `sleepscore.js`, the feature
  modules). No third party, no key.

---

## 5 · Where each value lives (quick reference)

```
.env                              CEREBRAS_API_KEY, ALLOWED_ORIGINS   (local dev)
Vercel → Settings → Env Vars      CEREBRAS_API_KEY, ALLOWED_ORIGINS   (production)
www/js/config.js                  aiProxyUrl, firebaseClientId, googleIOSClientId
ios/App/App/Info.plist            reversed-client-ID URL scheme, GIDClientID
ios/App/App/GoogleService-Info.plist   Firebase iOS config
```

- **Secrets** (Cerebras key) → **environment variables only**, never in the repo.
- **Public IDs** (Google client IDs) → safe to commit in `config.js`.
- `.env` is git-ignored; only `.env.example` is tracked.

---

## 6 · Fast troubleshooting

| Symptom | Likely cause & fix |
|---|---|
| AI briefing: "couldn't reach the AI" | `CEREBRAS_API_KEY` not set in Vercel → add it and redeploy. Or `aiProxyUrl` missing `https://` in `config.js`. |
| AI works locally but not in production | Env var set for the wrong Vercel environment (set it for **Production**), or not redeployed after adding it. |
| No "Continue with Google" button (web) | Current origin not in the Web client's **Authorized JavaScript origins** (exact scheme+host, no trailing slash); wait for propagation. |
| Google "access blocked / app not verified" | Publish the OAuth **consent screen**, or add yourself as a **Test user**. |
| Google tap bounces back to login | Unauthorized origin, unpublished consent screen, or the COOP header — all now surfaced via a toast + `console.warn`. Re-check Section 2a. |
| Native Google button missing on iPhone | iOS client ID and/or reversed URL scheme not set (Section 3). The on-device account flow still works. |
| Rate-limited (`429`) from the proxy | Built-in per-IP/global rate limit in `api/chat.js`; wait a minute, or raise `RL_*` there / add Vercel KV for a hard quota. |

For the whole picture of how the app is built and why, see
[`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md).
