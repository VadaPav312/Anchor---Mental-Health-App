# ⚓ Anchor — Full Project Overview

> A detailed, end-to-end explanation of what Anchor is, why it exists, how every
> layer is built, and how the pieces fit together. If you are new to the codebase,
> read this top-to-bottom; if you are looking for credentials, see
> [`API_KEYS.md`](./API_KEYS.md); if you are deploying, see [`DEPLOY.md`](./DEPLOY.md).

---

## 1. What Anchor is

Anchor is a **mental-wellness companion** that connects your **sleep, mood,
energy, movement, values, and written words** into a single, evolving picture of
your wellbeing — and becomes more *yours*, and more useful, every day you use it.
The central bet of the product is **compounding, deeply personal insight**: the
longer you use Anchor, the more it can see patterns that no generic app (and often
no person) could spot, and the more irreplaceable it becomes.

Anchor is intentionally **not** a clinical tool. It never diagnoses, never labels,
and never pretends to be a therapist or a crisis service. Instead it offers
*reflections*, *gentle questions*, and *observed patterns*, and it keeps real
human help exactly one tap (and one long-press) away. This is a companion that
sits beside you, not a system that judges you.

Technically, Anchor is a **single vanilla-JavaScript application with no build
step**. There is no framework, no bundler, no transpiler — just plain ES-modules-
free scripts loaded in a deliberate order from one `www/` folder. That decision is
core to the project's character: it makes the app trivially auditable, instantly
runnable (open `index.html`), and portable between the web and a native iPhone
build without a toolchain in the way. The entire client is small enough that a
motivated person can read every line and understand exactly what happens to their
data.

The app runs two ways from the same code:

- **Web / Vercel** — a static site served from `www/`, plus one tiny serverless
  function (`api/chat.js`) that acts as a secure AI proxy. Fast to demo, shareable
  by link.
- **iPhone via Capacitor + Xcode** — the same web assets wrapped in a native
  shell, fully on-device, with native haptics, notifications, share sheets,
  status-bar theming, an optional home-screen widget, and native Google sign-in.

---

## 2. The three convictions behind the design

Everything in Anchor traces back to three product convictions. They are worth
understanding because they explain *why* features exist and why some obvious
"engagement" mechanics were deliberately avoided.

1. **Cause beats symptom.** How you feel *today* is usually an echo of something
   from one to three days ago — a warm bedroom, a short night, a value you let
   slide, a draining week. Most apps show you today's number. Anchor's core job is
   to surface the **delayed causes** you would never correlate yourself, using a
   lagged-correlation engine that looks across multiple time offsets.

2. **Meaning beats mood.** Chasing "feeling good" is fragile; living in line with
   what you value is durable. Anchor lets you name the values your days should
   point toward, set weekly targets for them, and then honestly tells you how close
   you are getting — using your own values as the yardstick, not a generic
   happiness score.

3. **It should be yours, and it should be private.** Every piece of data lives on
   your device by default. The *only* thing that ever leaves it is text you
   explicitly choose to send for an AI reflection, and only at the moment you
   trigger it. No account is required to use the app; you can export or delete
   everything at any time.

These convictions also shape the tone: warm but honest, specific rather than
saccharine, and never manipulative. When data is thin, Anchor says so instead of
inventing certainty.

---

## 3. How it runs (no build step)

```bash
# Web (fastest) — just serve the static folder
npx serve www            # or literally open www/index.html
# On the last onboarding step, pick "Explore with demo data" to see it fully alive.

# With AI + the proxy locally
vercel dev               # serves www/ AND the /api/chat serverless function

# Deploy to Vercel (static, no build)
vercel                   # outputDirectory is www/ (see vercel.json)

# iPhone (Capacitor + Xcode)
npm run ios              # npx cap sync ios && npx cap open ios, then press ▶
# After any web change:  npx cap copy ios   then ⌘R in Xcode.
```

A headless integration test, `smoketest.js`, boots the real app, seeds demo data,
and renders every screen in multiple languages to catch runtime regressions:

```bash
node smoketest.js
```

Because there is no build, "deploying" the web app is just uploading `www/` plus
the `api/` function; Vercel's `vercel.json` sets `outputDirectory: www`, disables
the build/install commands, enables clean URLs, and attaches a strict set of
security headers (see §12).

---

## 4. Repository map

```
pushup-server/
  api/
    chat.js              Serverless AI proxy — the ONLY place the Cerebras key is used
  www/
    index.html           App shell + CSP meta + strict script load order
    css/
      glass.css          "Liquid glass" design system: tokens, primitives, forms
      anchor.css         Layout, chrome, shared components (rings, tiles, cause-thread)
      weather.css        Inner-weather scenes (sun/cloud/rain/storm/fog/snow)
      refresh.css        Redesign layer: bloom nav, density, motion, doodles, intro sim
      liquid.css         "Living glass" reactive specular chrome
    js/
      config.js          Non-secret integration IDs (Google client IDs, proxy URL)
      i18n.js + lang/*   20-language engine (RTL-aware), English is the source of truth
      store.js           Single reactive on-device source of truth (+ derive selectors)
      stats.js           Lagged-correlation / statistics engine
      sleepscore.js      Pure sleep + environment scoring helpers
      ui.js              DOM helpers, sheets/modals, rings, sparklines, toasts, haptics
      icons.js           Inline SVG icon set
      gamify.js          XP, 16 levels, confetti + success haptic
      native.js          Capacitor bridge: haptics, notifications, share, status bar
      speech.js          Text-to-Speech + Speech-to-Text
      llm.js             On-device AI client (talks to the proxy or a user's own key)
      crisis.js          Region-aware emergency numbers + resources
      auth.js            On-device account gate + Google sign-in + hashed passcode
      night.js           "Goodnight" / night-mode handling
      weather.js         Open-Meteo local forecast (no key)
      registry.js        The view/plugin contract (Anchor.register / Anchor.go)
      intro.js           First-launch cinematic "simulation" (after sign-in)
      onboarding.js      First-run flow (name, values, baseline, reminders, session)
      app.js             Boot, gate, privacy, navigation, theming, density, font scale
      liquid.js          Loads after boot to animate the reactive chrome
      features/*.js      Every screen; each self-registers a view
  ios/
    App/                 Capacitor iOS project (Info.plist, GoogleService-Info.plist)
    AnchorWidget/        WidgetKit home-screen widget scaffold
  scripts/wire-google.js Helper to wire the iOS Google client into the plist/config
  vercel.json            Static hosting + security headers
  capacitor.config.json  Native config (CapacitorHttp, splash)
  smoketest.js           Headless render test
  README.md  DEPLOY.md  SECURITY.md  API_KEYS.md  PROJECT_OVERVIEW.md
```

The **script load order in `index.html` matters**: config and i18n first, then
core services (`store`, `stats`, `ui`, `llm`, `auth`, …), then feature modules
(each of which calls `Anchor.register(...)` at load time), then `onboarding` and
`app` (which boots everything), and finally `liquid.js` for the reactive chrome.

---

## 5. The data layer — `store.js`

`store.js` is the heart of the app: a **single, reactive, on-device source of
truth**. It holds a plain JavaScript state object, persists it to `localStorage`,
and notifies subscribers when things change.

- **Shape.** `blank()` defines the full state: `settings` (theme, accent, density,
  language, region, reminders, session persistence, privacy acceptance, …),
  `profile` (name, account, onboarding flags), and a set of **data streams**:
  `sleep`, `moods`, `journal`, `energy`, `activity`, `decompress`, `experiments`,
  `valuesChecks`, `insights`, `investigations`, `profileWins`, plus `values` and a
  `gamification` block (streak, longest, XP/level, grace days).

- **Streams.** Each stream (e.g. `Store.moods`) exposes `add`, `all`, `byDate`,
  `remove`, etc. Adding a record stamps an id/date and emits a `change` event.

- **Derived selectors — `Store.derive`.** This is where raw records become the
  numbers the UI shows: `lastSleep()`, `dayMood(date)`, `energyToday()`,
  `series(metric, days)`, `vitality()`, `historyDays()`, and more. Keeping these
  centralized means every screen computes the same value the same way.

- **Persistence + migration.** `load()` reads `localStorage`, then *re-merges*
  nested settings defaults (`settings`, `settings.session`, `settings.reminders`)
  so older/partial saves can't leave required keys undefined. `import()` applies
  the identical merges, and `export()` serializes the whole state for the user's
  own backup. `reset()` wipes everything.

- **Reactivity.** `Store.on('change', …)` and `Store.on('settings', …)` let the
  shell re-render, re-theme, and refresh the widget snapshot whenever data or
  preferences change.

Because the store *is* the app's memory, the privacy promise is enforceable by
construction: there is no server-side database, no user table, nothing to breach
remotely. The trade-off (discussed in §12) is that on-device data is only as
private as the device itself.

---

## 6. Rendering & navigation

Anchor has a tiny custom "framework" made of three files:

- **`registry.js`** defines the contract. A screen calls
  `Anchor.register({ id, labelKey, icon, order, tab, render })`. `Anchor.go(id,
  params)` navigates to a screen; `Anchor.refresh()` re-renders the current one;
  `Anchor.setHandler(fn)` lets `app.js` own the actual navigation/transition.

- **`ui.js`** is the DOM toolkit. `UI.el(tag, attrs, children)` builds elements
  (setting text via `textContent`, which keeps the app XSS-safe); `UI.frag(html)`
  parses trusted static SVG/markup; and there are higher-level primitives:
  `card`, `tile`, `tiles`, `ring` (an SVG progress ring whose centered number now
  scales with its diameter), `sparkline`, `bars`, `segmented`, `chips`, `sheet`
  (bottom sheet), `modal`, `confirm`, `toast`, `empty`, plus a haptics layer
  (`haptic`, `hapticTick`, `hapticSuccess`, and a subtle "hum" while the AI
  thinks).

- **`app.js`** is the boot + shell controller. It runs `boot()` →
  applies theme/accent/density/doodles/font-scale/time-wash → `gate()`. The
  **gate** is the flow spine: not signed in → `Auth.start`; then `afterAuth` →
  the first-launch **intro simulation** (once) → the **privacy** gate → the
  **onboarding** flow (if not onboarded) → `startApp()`. `startApp` wires the
  chrome, builds the navigation dock, enables swipe navigation, and lands on Home.

The **navigation dock** is a floating glass bar with the four primary areas and a
raised center **"bloom orb."** Tapping the orb fans out the second-tier features
in a radial menu; the four tabs get a stateful pill highlight; you can swipe
left/right between the main areas. `combined.js` composes several existing views
under one roof — **Journey** = Progress · Timeline · Review, and **Calm** =
Wind-down · Grounding · Sounds — so the app reads as a coherent set of places
rather than a long list of screens.

---

## 7. The design system

Anchor's look is a **"liquid glass"** aesthetic: translucent, blurred, layered
panels over a living gradient background. It is built entirely with CSS custom
properties so the whole app can re-skin at once.

- **`glass.css`** owns the **tokens** — a spacing scale (`--s1…--s9`), radii,
  blur, easing curves, the accent palette variables (`--a1…--a5` and their
  `-rgb` forms), ink/text colors, and glass surface variables — plus the base
  primitives (buttons, inputs, chips, fields).

- **`anchor.css`** owns **layout and shared components**: the app shell, the
  centered content column (`.page`, `max-width: 680px`), tiles/rings, the
  cause→effect "thread," the topbar, empty states, and toasts.

- **`refresh.css`** is the **redesign layer**, loaded last so it can refine
  anything: the bloom navigation dock and center orb, the **spacing density**
  system (`compact` / `cozy` / `spacious`, applied as a body class), the subtle
  **background line-art doodles** (a masked, low-opacity SVG that fades away from
  the central content column so nothing busy sits behind your reading area), the
  branded **"Continue with Google"** button, and the **intro simulation** styles
  (a phone-width frame that stays phone-like even on a desktop screen).

- **`weather.css`** paints the **inner-weather scenes** (sun, clouds, rain, storm,
  fog, snow) that visualize mood.

- **`liquid.css` + `liquid.js`** add a reactive specular highlight to the chrome
  after boot.

**Personalization is deep and live:** the user's chosen **accent color becomes
the app's entire background palette** (the ambient orbs, rings, buttons, and
highlights all derive from `--a1…--a5`); a **time-of-day wash** subtly warms or
cools the UI with the clock; the **inner weather** can optionally tint the whole
background; **density** rescales every gap and card at once; and the doodles and
background style are individually toggleable. Reduced-motion preferences are
respected throughout.

---

## 8. Internationalization

Anchor ships **20 languages**, RTL-aware, with English (`lang/en.js`) as the
source of truth and the fallback for any missing key. `i18n.js` flattens each
nested dictionary into dot-paths (`chk.tags`, `sim.s1Title`, …), picks the
language from the device or the user's setting, exposes the global `t(key, vars)`
helper with `{var}` interpolation and basic pluralization, and re-renders the app
on language change. Crucially, **AI replies are localized too** — the model is
instructed to answer in the user's language, and a live translation helper
(`LLM.translate`) can translate journal text or AI output on demand. This makes
the whole experience, including the generated reflections, feel native in each
language rather than an English app with translated buttons.

---

## 9. The AI pipeline

AI is an **optional enhancement**, not a dependency — the app is fully usable with
it off. When on, it powers the morning briefing, weekly/monthly/yearly progress
reflections, value "compass checks," and journaling-pattern summaries.

There are **two paths**, chosen automatically:

1. **Server proxy (default).** The browser posts a conversation to your own
   `/api/chat` endpoint. That serverless function
   ([`api/chat.js`](./api/chat.js)) holds the real **Cerebras key** in a server
   environment variable, validates and rate-limits the request, attaches the key,
   calls Cerebras, and returns **only** the assistant text. No secret ever reaches
   the browser or app binary.

2. **Bring-your-own-key.** If a user pastes their own Cerebras key in
   **Settings → AI & Device**, the client calls Cerebras directly with it. That
   key lives only in their on-device storage.

**`llm.js`** is the client. It exposes `configured()`, `chat()`, `ask()`,
`json()` (asks for and robustly extracts a JSON object), and `translate()`. It was
hardened to be *foolproof about connectivity*: it normalizes a scheme-less proxy
URL to `https://`, tries the **same-origin `/api/chat` first** on the web and the
configured absolute URL as a fallback (and vice-versa), applies a **35-second
timeout**, and **retries once** on a transient network failure before surfacing a
clear error. The system prompt hard-codes Anchor's voice and guardrails: warm,
concise, non-clinical, honest about thin data, and safety-first (it gently directs
anyone in distress to real human help and never provides means of harm).

**`api/chat.js` — defense in depth.** Every request must pass all of: a **method
allowlist** (POST + CORS preflight only), an **Origin/CSRF check** (same-site,
localhost, `capacitor://localhost`, or an env allowlist), a **JSON content-type**
requirement (blocks form-based CSRF), **payload size caps** (declared and parsed),
**schema + content validation** (roles, per-message and total length, message
count), a **model allowlist** (no arbitrary/expensive models), **rate limiting**
(per-IP and a global ceiling per warm instance), an **upstream timeout**, and
**error sanitization** (it never forwards the upstream body, key, or stack). The
prompts themselves are built in the feature modules — e.g. the dashboard's
`briefingPrompt` folds in last night's sleep, recent mood, the energy balance, the
streak, the top detected pattern, the user's values, tasks they set down at
wind-down, and even a short quote from their most recent journal entry, so the
briefing feels like it was written by something that actually read their day.

---

## 10. Feature-by-feature

**Home dashboard (`dashboard.js`).** A living, **re-orderable** set of widgets
(long-press → jiggle → drag): the AI morning briefing (cached per day, with a
retry affordance), today's inner weather, the energy/vitality bar, a check-in CTA,
last night's sleep, the top detected pattern, quick-log shortcuts, and value
progress. It also builds a shareable "today at a glance" image card on a canvas.

**Check-in (`checkin.js`).** A fast, expressive mood log: a **valence** face+slider
(-2…+2), **energy** (0–10), **activation/arousal** (0–10), a **uniform grid of tag
boxes** ("What's in the mix?"), and an optional note. A **live weather preview**
updates as you move the sliders, and saving shows a warm confirmation with the
resulting inner weather. Everything here feeds the rest of the app.

**Inner Weather (`weatherMap.js`).** Your emotional history rendered as a
**landscape you can walk back through** — each day a weather scene derived from its
mood; tap any day to peel its layers; a gentle forecast.

**Pattern Detective (`patternDetective.js`) + `stats.js`.** Computes **lagged
Pearson correlations** across sleep, mood, energy, journaling, and more, ranks them
by confidence, and presents the strongest as a cause→effect "thread" with the time
lag (e.g. a warm room tonight dragging mood down two days later). You can launch a
**hypothesis investigation** on any hunch.

**Energy (`energyBudget.js`) and vitality.** A 0–100 **vitality** score from rest
+ physical activity + an energy ledger, tied to mental health in plain language
with one concrete lever when it's low. Quick-log light/moderate/intense movement
or rest. **Energy Budget** tracks what drains and restores you so Anchor can learn
your personal "economy." (Energy widgets stay hidden until there's data to base
them on.)

**Journal + The Mirror (`journal.js`, `mirror.js`).** Write freely, with **voice
dictation**. A "Write / The Mirror" tab reveals gentle, **non-clinical** patterns
in *how* you write — self-reference density, positivity ratio, emotional
vocabulary, new words appearing over time — always framed as reflection, never
diagnosis.

**Values Compass (`valuesCompass.js`).** Choose the values your days should point
toward, set a **weekly target per value** (e.g. live "Health" 4×/week), and watch
Anchor track progress with a ring on each uniform value box, flag what's drifting,
and offer an AI **"compass check"** that reflects your own values back on a
decision.

**Personal Experiments (`experiments.js`).** Design a protocol from data you
already collect (the AI can draft it), run it for a set number of days, and get an
**honest verdict** — building a "what works for me" profile over time.

**Calm (`decompression.js`, `toolkit.js`, `sounds.js`).** A merged space:
a nightly **Wind-down ritual** (empty your head, set each thing in its place, drift
into goodnight mode), **grounding exercises** (paced/box breathing and more), and
**soundscapes** — white/pink/red/blue/violet/green noise generated **on-device**
with volume and a sleep timer.

**Sleep (`sleep.js`, `sleepscore.js`).** A manual sleep journal plus a daily "How
did you sleep?" morning prompt. Nightly and environment **scores** are computed by
pure helpers (duration, restfulness, awakenings, room temp/humidity/light/noise),
shown as rings and a 7-night trend; you can add nights manually, and the add-sheet
now auto-closes on save.

**Journey (`progress.js`, `timeline.js`, `review.js` via `combined.js`).**
Looking back: **AI Progress** (Weekly/Monthly/Yearly) aggregates your data and the
live model reflects your trend, a real win, and one focus; plus a **Timeline** and
a **Weekly Review**.

**Gamification (`gamify.js`).** 16 imaginative levels (First light → Boundless),
XP for showing up, and a celebratory level-up (modal + confetti + a layered
"success" haptic) — encouragement without turning wellbeing into a grind.

**Care & safety (`crisis.js`).** The ♥ opens a **region-aware** support panel with
a one-tap emergency call; **long-press the ♥ for an instant SOS** (emergency
services + crisis line + text), with numbers set by the user's region chosen at the
privacy gate. A breathing reset is always available.

---

## 11. Onboarding and the intro simulation

**Onboarding (`onboarding.js`)** is a calm first-run flow that captures just
enough to make Anchor feel personal from minute one: **name**, an **accent color**
(applied live), the **values** that matter (a uniform grid plus custom entries),
a **mood baseline**, **reminders** (opt-in), and a **stay-signed-in vs. log-out-
on-close** choice. It includes an auto-playing preview montage that introduces
the app before the user starts with their own real data.

**The intro "simulation" (`intro.js`)** is a separate, glossy cinematic that plays
**once, right after sign-in**. It runs **fully on its own** (no taps to continue),
walking through what Anchor does across many auto-advancing scenes — brand, "your
inner weather," a private morning briefing, "patterns, connected," a private
journal, "rest, understood," "someone to talk to," "steered by your values,"
"watch yourself grow," a calm toolkit, and "entirely yours" — on the user's chosen
accent palette so it matches the app's color look. It is fully skippable,
remembered so it only shows once (`settings.introSeen`), and **crossfades smoothly
into the privacy screen** when it ends.

---

## 12. Authentication, accounts, and the security model

**Accounts (`auth.js`).** Anchor's account is a **local identity + lock**, not
cloud auth — consistent with the no-server promise. A user provides a name, an
optional email, and an optional passcode; a signed-in flag lives in either
`localStorage` (stay signed in) or `sessionStorage` (log out when the app closes),
per their choice. "Sign out" keeps data; "erase data" keeps the account; "delete
account" removes both.

**Passcode at rest.** The passcode is **never stored in plaintext.** It is hashed
with **PBKDF2-SHA256 (210,000 iterations)** and a **per-account random salt** via
the Web Crypto API; only `{pinHash, pinSalt, pinAlgo}` are persisted, and
verification re-derives and compares in **constant time**. Any legacy plaintext
passcode is transparently upgraded to a hash on the next successful sign-in, and if
Web Crypto is unavailable the code falls back gracefully.

**Google sign-in.** Optional, on both web (Google Identity Services token flow
with `prompt: 'select_account'`, so it always shows the account chooser and never
leaks a previous user's name on a shared device) and native (the
`@capgo/capacitor-social-login` plugin). A successful Google token now **always**
completes sign-in — the profile lookup is best-effort with a fallback name, so a
failed lookup can't bounce the user back to the login screen — and errors surface
as a toast plus a console warning instead of failing silently.

**Transport & headers.** `vercel.json` attaches a strict **Content-Security-
Policy** (scripts `'self'` + Google only, tight connect/img/style/frame sources),
HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, a locked-down
`Permissions-Policy`, and `Cross-Origin-Opener-Policy: same-origin-allow-popups`
(the setting that lets the Google OAuth popup callback actually fire while still
isolating cross-origin windows). Because the native iOS webview receives none of
those response headers, `index.html` also carries an **in-app CSP `<meta>`** so the
app is locked down inside the phone too, plus the proxy origin it needs.

**Native transport security.** `Info.plist` **enforces App Transport Security** —
`NSAllowsArbitraryLoads` is off, so all remote traffic must use HTTPS + modern TLS;
only local-network access (for an optional bedside monitor) is permitted, without
weakening remote TLS.

**Client safety.** All user-authored text (names, journal, notes, tags) is rendered
via `textContent`; the only `innerHTML`/`frag` sinks interpolate trusted static
SVG icons or CSS literals — so the client has no reflected-XSS surface.

**Honest limits.** This is a **local-first** app with no backend account system, so
data on the device is only as private as the device. Anyone with your *unlocked*
phone and developer tools could read `localStorage` (journal, settings, a
bring-your-own API key). Real protection there would require a passphrase-derived
encryption layer or a backend — a deliberate future trade-off, not a claim the app
currently makes. See [`SECURITY.md`](./SECURITY.md) for the reporting policy.

---

## 13. Native / iOS specifics

The iPhone build is Capacitor-based. `native.js` is the bridge: it detects the
native platform, and wraps **haptics**, **local notifications** (general "we miss
you" nudges that fire even when signed out, plus user-specific nudges gated on
sign-in), the **share sheet** (with a web `navigator.share`/clipboard fallback),
**status-bar** theming, **splash-screen** hide, and **network** status (an offline
banner). `capacitor.config.json` enables **CapacitorHttp** (so native AI requests
avoid a browser CORS preflight) and configures the splash screen. `AnchorWidget/`
holds a **WidgetKit** scaffold that surfaces streak, energy, and level at a glance
(it needs a one-time target + App Group setup to go live). Native Google sign-in
requires an iOS OAuth client and the reversed-client-ID URL scheme (see
[`API_KEYS.md`](./API_KEYS.md) §3).

---

## 14. Accessibility

Accessibility is treated as a first-class concern: an adjustable **text size**
(font scale applied to the root), **read-aloud (Text-to-Speech)** on AI text with a
natural-voice picker, **dictation (Speech-to-Text)** for journaling
(`speech.js`), a **spacing/density** control that rescales the whole UI, full
**RTL** support for right-to-left languages, and **reduced-motion** handling that
disables the more energetic animations (the ambient orbs, the intro pulses, the
level-up flourish) when the user prefers it.

---

## 15. Testing, quality, and extending the app

`smoketest.js` boots the real app in a headless environment, seeds demo data, and
renders every registered screen across multiple languages — a fast guard against
runtime regressions (undefined helpers, missing i18n keys, broken renders).

**Adding a feature is deliberately simple:** create `www/js/features/yourThing.js`,
call `Anchor.register({ id, labelKey, icon, order, tab, render })`, build your DOM
with `UI.el`/`UI.card`/`UI.tile`/`UI.sheet`, read and write through `Store` streams
and `Store.derive`, pull any user-visible strings from `t('your.key')` (add them to
`lang/en.js`), and add your `<script>` to `index.html` in the feature block. If it
needs AI, call `LLM.json(...)` or `LLM.ask(...)`. If it needs a new number, add a
selector to `Store.derive` so every screen computes it identically.

---

## 16. Deployment summary

- **Web:** push to a Vercel project whose **Root Directory is empty** and
  **Framework Preset is "Other."** `vercel.json` handles the rest (static `www/`,
  security headers, the `api/chat` function). Set **`CEREBRAS_API_KEY`** (and
  optionally `ALLOWED_ORIGINS`) in the project's environment variables, then
  redeploy.
- **Google web sign-in:** authorize your exact domain in the Web OAuth client's
  **Authorized JavaScript origins** and publish the consent screen — see
  [`DEPLOY.md`](./DEPLOY.md) and [`API_KEYS.md`](./API_KEYS.md) §2.
- **iPhone:** `npm run ios`, set the iOS OAuth client + `GoogleService-Info.plist`
  + reversed URL scheme for native Google sign-in, then build in Xcode.

---

## 17. The one non-negotiable

> Anchor offers reflections and patterns, **never diagnoses.** Always consult a
> qualified professional for medical or mental-health concerns. If you are in
> crisis, the ♥ button (tap, or long-press for SOS) puts real human help one tap
> away. Everything in the product — the tone, the safety guardrails in the AI
> prompt, the region-aware crisis panel — exists to keep that promise.

---

*For credentials and setup, see [`API_KEYS.md`](./API_KEYS.md). For the Google
sign-in checklist, see [`DEPLOY.md`](./DEPLOY.md). For the high-level plan, see
[`README.md`](./README.md).*
