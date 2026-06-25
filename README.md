# ⚓ Anchor — the detailed plan

**A mental-wellness companion that reflects you back to yourself.**

Anchor connects your **sleep, mood, energy, movement, values and words** into one
picture of your wellbeing — and gets more *yours* every day you use it. The
longer you use it, the more irreplaceable it becomes. That **compounding,
deeply-personal insight** is the whole point.

It runs as a single vanilla-JS app (no build step) from one `www/` folder, two ways:

- **Web / Vercel** — static site (fast to demo, shareable link).
- **iPhone** via Capacitor + Xcode — fully on-device, with an optional home-screen widget.

---

## 1 · Our purpose

Most wellness apps chase a number — a streak, a mood score, a "10% happier."
Anchor is built on three convictions instead:

1. **Cause beats symptom.** How you *feel* today is usually an echo of something
   from one to three days ago — a warm room, a short night, a value you let slide.
   Anchor's job is to surface those *delayed* causes you'd never spot yourself.
2. **Meaning beats mood.** Feeling good is fragile; living in line with what you
   value is durable. Anchor helps you point your days at your own values and tells
   you, honestly, how close you're getting.
3. **It should be yours, and it should be private.** Everything lives on your
   device. The only thing that ever leaves it is text you explicitly send for AI
   reflection. No accounts required, export or delete anytime.

Anchor is a **companion, never a clinician.** It offers reflections and patterns,
never diagnoses — and real human help is always one tap (and one long-press) away.

---

## 2 · The full feature set

### Core daily loop
- **Home dashboard** — a living, **re-orderable** set of widgets (long-press → jiggle → drag). The AI morning briefing, your inner weather, the energy bar, a check-in CTA, last night's sleep, the top pattern, quick-log shortcuts and value progress.
- **Check-in** — a fast, expressive mood log (feeling / energy / activation / tags) that feeds everything.
- **Inner Weather** — your emotional history as a landscape you can walk back through; tap any day to peel its layers; a gentle forecast.
- **Pattern Detective** — lagged Pearson correlations across sleep, mood, energy, journaling and more; ranks by confidence; launch a "hypothesis investigation" on any hunch.

### The "energy → mind" link
- **Energy bar (vitality)** — a 0–100 score computed from **rest + physical activity + the energy ledger**, tied to mental health in plain language with one concrete lever when it's low. Quick-log light/moderate/intense movement or rest. *(Hidden until there's data to base it on — a fresh user only sees the questions.)*
- **Energy Budget** — track what drains and restores you and learn your personal economy.

### Reflect & grow (merged for clarity)
- **Journal** *(now also contains **The Mirror**)* — write freely (with **voice dictation**); a "Write / The Mirror" tab reveals gentle, non-clinical patterns in *how* you write.
- **Values Compass** — pick the values your days should point toward, then set a **weekly target per value** (e.g. live "Health" 4×/week). Anchor tracks your progress with a ring on each uniform value box, flags what's drifting, and an AI "compass check" reflects your own values back on any decision.
- **Personal Experiments** — design a protocol from data you already collect; get an honest verdict; build a "what works for me" profile.

### Calm (merged) & sleep
- **Calm** = **Wind-down ritual** + **Grounding exercises** + **Soundscapes** (white / pink / red / blue / violet / green noise generated on-device, with volume + a sleep timer).
- **Sleep** — a manual sleep journal **plus** a daily "How did you sleep?" morning prompt (restfulness + hours). Toggle: ask each morning, or sync from Apple Health (native).

### Journey (merged) — looking back
- **AI Progress (Weekly / Monthly / Yearly)** — aggregates your data and the live AI reflects your trend, a real win, and one focus.
- **Timeline** · **Weekly Review**

### Throughout
- **Gamification** — 16 imaginative levels (First light → Boundless), XP for showing up, and a celebratory level-up (modal + confetti + a multi-layered "success" haptic).
- **Care & safety** — the ♥ opens a region-aware support panel with a one-tap emergency call; **long-press the ♥ for an instant SOS** (emergency services + crisis line + text), numbers set by your region. A breathing reset is always there.
- **Accessibility** — adjustable **text size**, **read-aloud (Text-to-Speech)** on AI text with a natural voice, **dictation (Speech-to-Text)**, and a **spacing/density** control.
- **Personalization** — your chosen **color becomes the app's background**; subtle background line-art; a time-of-day warm/cool wash; **20 languages** (RTL-aware, AI replies localized too).
- **Navigation** — a floating bottom bar of the 4 main areas with a center **bloom orb** that fans out the second-tier features; swipe left/right between main areas.
- **iOS home-screen Widget** — streak, energy and level at a glance *(WidgetKit scaffold in `ios/AnchorWidget/`; needs a one-time target + App Group setup)*.
- **Privacy** — a terms-and-privacy gate at first launch (data-stays-on-device, not medical care, liability waiver), re-viewable in Settings.

---

## 3 · Run it

```bash
# Web (fastest)
npx serve www          # or just open www/index.html
# Pick "Explore with demo data" on the last onboarding step to see it fully alive.

# Deploy to Vercel (static, no build step)
vercel                 # see DEPLOY.md for Google sign-in origins

# iPhone (Capacitor + Xcode)
npm run ios            # = npx cap sync ios && npx cap open ios, then press ▶
# After any web change:  npx cap copy ios   then ⌘R in Xcode.
```

A headless integration test boots the real app, seeds demo data and renders every
screen in multiple languages:

```bash
node smoketest.js
```

---

## 4 · Architecture

```
www/
  index.html              app shell + script load order
  css/  glass.css          liquid-glass design system (tokens, primitives)
        anchor.css         layout, chrome, shared components
        weather.css        weather scenes (sun / clouds / rain / storm / snow)
        refresh.css        redesign layer (bloom nav, density, motion, voice, value boxes)
  js/   i18n.js + lang/*    20-language engine (RTL-aware)
        store.js           single on-device source of truth (reactive); streams:
                           sleep, moods, journal, energy, activity, decompress,
                           experiments, valuesChecks, insights …  + derive.vitality()
        stats.js           lagged-correlation engine
        speech.js          Text-to-Speech + Speech-to-Text (natural-voice picker)
        llm.js             on-device AI client
        registry.js        the view/plugin contract  (Anchor.register / Anchor.go)
        ui.js icons.js native.js crisis.js seed.js gamify.js
        features/*.js      every screen; combined.js merges Journey & Calm
        onboarding.js  app.js   (boot, gate, privacy, navigation, theming)
ios/
  App/                    Capacitor iOS project
  AnchorWidget/           WidgetKit widget scaffold + README-WIDGET.md
```

**How features compose:** each screen self-registers a view (`Anchor.register`)
and is painted into `#view`. `combined.js` hosts several existing views under one
roof (Journey = Progress · Timeline · Review; Calm = Wind-down · Grounding
· Sounds) so the app reads as coherent rather than a pile of screens.

---

## 5 · Roadmap (next)

- Wire the iOS widget plugin (App Group bridge) end-to-end.
- Apple Health sleep + step import for the "From my devices" mode.
- Per-value AI suggestions ("you're behind on Health — here's a 10-minute way to live it today").

---

> Anchor offers reflections and patterns, never diagnoses. Always consult a
> qualified professional for medical or mental-health concerns. If you're in
> crisis, the ♥ button (tap, or long-press for SOS) has real human help, one tap away.

## License
Open source under the [MIT License](./LICENSE).
