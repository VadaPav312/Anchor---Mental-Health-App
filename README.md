# ⚓ Anchor

**A mental-wellness companion paired with a bedside Arduino sleep monitor.**
Anchor connects your sleep to your wider wellbeing and reflects you back to
yourself — and it gets more *yours* every day you use it. The longer you use it,
the more irreplaceable it becomes. That compounding personalization is the whole
point.

Built as a single vanilla-JS web app (no build step) that runs three ways from
the same `www/` folder:

- **On your iPhone** via Capacitor (Xcode) — fully on-device AI.
- **On the web / Vercel** — static deploy, instant.
- **On your Mac** at `http://localhost:3000` via the bridge server.

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
   each thought (act / release / feel), and the room's RGB lamp dims to darkness
   as you finish.
5. **Values Compass** — live truer, not just feel better. Where the app's name
   earns its meaning.
6. **The Mirror** — gentle, non-clinical patterns in *how* you write.
7. **Energy Budget** — manage the resource behind your mood.

A **care layer** is woven throughout: Anchor is framed as a companion, never a
clinician, with crisis & professional support always one tap away (the ♥).

**20 languages.** Full UI localization (`www/js/lang/`), RTL-aware, and AI
reflections are localized too.

---

## 1 · Run on the web (fastest)

```
npx serve www      # or any static server; or just open www/index.html
```

Pick **"Explore with demo data"** on the last onboarding step to see a fully
alive app (six weeks of correlated history → Pattern Detective finds real
patterns, the Weather Map is populated).

## 2 · Run the bedside-monitor bridge (Mac)

```
npm install
npm start          # = node server.js   → http://localhost:3000
```

The bridge reads the Arduino over USB and re-serves it to your phone over Wi-Fi.
**No hardware?** It auto-simulates plausible sleep data so everything still
demos end-to-end (disable with `ANCHOR_SIMULATE=0`).

## 3 · Run on your iPhone (Capacitor + Xcode)

```
npm run ios        # = npx cap sync ios && npx cap open ios
```

Press ▶ in Xcode. The AI runs **on the phone** (Cerebras, key stored on-device
in Settings → AI & Device — a default key is baked in). For live sleep data,
put your Mac's LAN address (e.g. `http://192.168.1.20:3000`) in
**Settings → Sleep monitor address**; phone and Mac must share Wi-Fi.

## 4 · Deploy to Vercel

```
vercel            # uses vercel.json; serves www/ as a static site
```

---

## Hardware (Elegoo Mega 2560 kit)

`arduino/anchor_sleep_monitor.ino` senses your room overnight and streams CSV
over USB. Wiring is documented at the top of the sketch:

| Sensor | Reads | Pin |
|---|---|---|
| DHT11 | temperature, humidity | D7 |
| Photoresistor | light | A0 |
| Sound sensor | noise | A1 |
| PIR | movement | D8 |
| HC-SR04 | in-bed presence | D5/D6 |
| RGB LED | the lamp the wind-down ritual dims | D9/D10/D11 |

The phone never talks to the Arduino directly — the Mac bridge does, then serves
the data over Wi-Fi. The app degrades gracefully without any hardware (add
nights manually, or use demo data).

---

## Architecture

```
www/
  index.html              app shell + script load order
  css/  glass.css          liquid-glass design system (tokens, primitives)
        anchor.css         layout, chrome, shared components
        weather.css        the Emotional Weather Map scene
  js/   i18n.js            20-language engine (RTL-aware)
        lang/*.js          en + 19 translations (451 keys each)
        store.js           single source of truth (on-device, reactive)
        stats.js           lagged-correlation engine
        llm.js             on-device Cerebras client (CapacitorHttp)
        bridge.js          sleep-monitor client over Wi-Fi
        registry.js        the view/plugin contract
        ui.js / icons.js / native.js / crisis.js / seed.js
        features/*.js      the 12 screens (dashboard is the reference)
        onboarding.js / app.js
server.js                 the Mac bridge (USB serial → Wi-Fi)
arduino/                  the sleep-monitor sketch
```

Everything you log lives **on your device**. The only thing that ever leaves the
phone is text you explicitly send for AI reflection. Export or erase anytime in
Settings.

> Anchor offers reflections and patterns, never diagnoses. Always consult a
> qualified professional for medical or mental-health concerns. If you’re in
> crisis, the ♥ button has real human help, one tap away.
