# ⚓ Anchor

**A mental-wellness companion that reflects you back to yourself.**
Anchor connects your sleep, mood and energy to your wider wellbeing — and it
gets more *yours* every day you use it. The longer you use it, the more
irreplaceable it becomes. That compounding personalization is the whole point.

Built as a single vanilla-JS web app (no build step) that runs two ways from the
same `www/` folder:

- **On the web / Vercel** — static site + serverless email (the primary target).
- **On your iPhone** via Capacitor (Xcode) — fully on-device AI.

---

## The seven features (plus a unifying data layer)

1. **Pattern Detective** — finds the *delayed* causes behind how you feel.
   It cross-references sleep, mood, energy, journaling and more across day-lags
   (today, 1, 2, 3 days prior) using real lagged Pearson correlations, ranks by
   confidence, and lets you launch a "hypothesis investigation" on any hunch.
2. **Emotional Weather Map** — your history rendered as a living landscape you
   can walk back through. Tap any day to peel back its layers; project a gentle
   forecast ("a forecast, not a fate").
3. **Personal Experiments** — be the scientist of your own wellbeing. Anchor
   designs a protocol from data you already collect and gives an honest verdict,
   building a "what works for me" profile over time.
4. **The Decompression Chamber** — a guided nightly offload. Brain-dump, sort
   each thought (act / release / feel), and ease into a goodnight wind-down.
5. **Values Compass** — live truer, not just feel better. Where the app's name
   earns its meaning.
6. **The Mirror** — gentle, non-clinical patterns in *how* you write.
7. **Energy Budget** — manage the resource behind your mood.

Plus a **Sleep journal** — log each night by hand and watch your rest,
environment and 7-night trends compound over time (no hardware needed).

A **care layer** is woven throughout: Anchor is framed as a companion, never a
clinician, with crisis & professional support always one tap away (the ♥).

**20 languages.** Full UI localization (`www/js/lang/`), RTL-aware, and AI
reflections are localized too.

---

## 1 · Run locally (fastest)

```
npx serve www      # or any static server; or just open www/index.html
```

Pick **"Explore with demo data"** on the last onboarding step to see a fully
alive app (six weeks of correlated history → Pattern Detective finds real
patterns, the Weather Map is populated).

## 2 · Deploy to Vercel (web + Google sign-in)

```
vercel            # static www/, no build step
```

See [`DEPLOY.md`](./DEPLOY.md) for the **exact** click-by-click steps to make
**Google sign-in** work on your live `*.vercel.app` domain (the Google Cloud
authorized-origins setup).

## 3 · Run on your iPhone (Capacitor + Xcode)

```
npm run ios        # = npx cap sync ios && npx cap open ios
```

Press ▶ in Xcode. The AI runs **on the phone** (Cerebras, key stored on-device
in Settings → AI & Device — a default key is baked in).

---

## Architecture

```
www/
  index.html              app shell + script load order
  css/  glass.css          liquid-glass design system (tokens, primitives)
        anchor.css         layout, chrome, shared components
        weather.css        the Emotional Weather Map scene
  js/   i18n.js            20-language engine (RTL-aware)
        lang/*.js          en + 19 translations
        store.js           single source of truth (on-device, reactive)
        stats.js           lagged-correlation engine
        sleepscore.js      pure sleep/environment scoring for the journal
        llm.js             on-device Cerebras client (CapacitorHttp)
        registry.js        the view/plugin contract
        ui.js / icons.js / native.js / crisis.js / seed.js
        features/*.js      the screens (dashboard is the reference)
        onboarding.js / app.js
```

Everything you log lives **on your device**. The only thing that ever leaves it
is text you explicitly send for AI reflection. Export or erase anytime in
Settings.

> Anchor offers reflections and patterns, never diagnoses. Always consult a
> qualified professional for medical or mental-health concerns. If you’re in
> crisis, the ♥ button has real human help, one tap away.

---

## License

Anchor is **open source** under the [MIT License](./LICENSE) — fork it, learn
from it, build on it.
