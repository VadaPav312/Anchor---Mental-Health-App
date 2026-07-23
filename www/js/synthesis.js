// ===========================================================================
// synthesis.js — the COGNITIVE-AFFECTIVE STATE SYNTHESIS ENGINE.
//
// The problem this solves: Anchor's AI advice used to be handed a thin, raw
// snapshot ("valence 0.4, slept 7h") and asked to be wise about it. Language
// models are warm and articulate but genuinely bad at the quantitative work
// that actually matters here — reading a trend out of noise, telling volatility
// from a bad day, weighing several drifting signals at once, or knowing which
// lever has real evidence behind it. So the model improvised, and the advice
// came out generic.
//
// This engine does that quantitative reasoning ON-DEVICE, deterministically,
// from the user's own streams, and hands the model a compact, structured STATE
// MODEL instead of raw numbers. The division of labour is deliberate:
//
//     algorithm  →  what is true, and how sure we are        (this file)
//     the API    →  how to say it warmly, humanly, in context (llm.js)
//
// Together the advice is grounded, specific, and irreplaceably theirs — far
// better than either half alone. It's consumed by talk.js (the chat companion)
// and dashboard.js (the morning briefing) via Synthesis.briefing().
//
// The pipeline (each stage is a pure function; no DOM, no storage writes):
//   1. Feature extraction  — per stream, over 7/14/30-day windows: level,
//                            robust baseline, volatility, momentum, anomaly.
//   2. Circadian rhythm    — the shape of a typical day (when they dip / peak).
//   3. Weekly rhythm       — which weekdays run low.
//   4. Sleep architecture  — decaying sleep debt + bedtime regularity.
//   5. Allostatic load     — a composite "cumulative strain" index (0–100).
//   6. Convergence watch   — early warning when several signals fall together.
//   7. Values alignment    — how lived-out their chosen values have been.
//   8. Lever ranking       — cross-references Pattern Detective's lagged
//                            correlations with today's deficits to rank the
//                            interventions with the most expected payoff.
//   9. Synthesis           — folds it all into a token-efficient briefing.
//
// Public API:
//   Synthesis.compute()          -> full state model (memoised per data change)
//   Synthesis.briefing(opts)     -> compact English context block for the LLM
//   Synthesis.headline()         -> one short human line (UI use)
//   Synthesis.levers()           -> ranked actionable levers
// ===========================================================================
(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Small, dependency-free numerics. We lean on window.Stats where it already
  // has a good implementation, but keep robust variants (median/MAD/Theil–Sen)
  // here because they're the backbone of "don't overreact to one bad day".
  // -------------------------------------------------------------------------
  var S = null; // resolved lazily so load order never matters
  function stats() { return S || (S = window.Stats || null); }

  function nums(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (v != null && !isNaN(v) && isFinite(v)) out.push(+v);
    }
    return out;
  }
  function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : null; }
  function std(a) {
    if (a.length < 2) return 0;
    var m = mean(a);
    return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / (a.length - 1));
  }
  function median(a) {
    if (!a.length) return null;
    var b = a.slice().sort(function (x, y) { return x - y; });
    var h = Math.floor(b.length / 2);
    return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2;
  }
  // Median absolute deviation — a robust spread that a single outlier can't move.
  function mad(a) {
    if (a.length < 2) return 0;
    var m = median(a);
    var dev = a.map(function (v) { return Math.abs(v - m); });
    return median(dev) * 1.4826; // scaled to be ~comparable to std for normal data
  }
  // Ordinary-least-squares slope of value vs. day index (per-day change).
  function olsSlope(series) {
    var pts = [];
    for (var i = 0; i < series.length; i++) {
      var v = series[i].value;
      if (v != null && !isNaN(v) && isFinite(v)) pts.push([i, +v]);
    }
    if (pts.length < 3) return 0;
    var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (var j = 0; j < n; j++) { sx += pts[j][0]; sy += pts[j][1]; sxx += pts[j][0] * pts[j][0]; sxy += pts[j][0] * pts[j][1]; }
    var den = n * sxx - sx * sx;
    return den === 0 ? 0 : (n * sxy - sx * sy) / den;
  }
  // Theil–Sen slope — median of all pairwise slopes. Robust to outliers, so a
  // single wild day doesn't fake a "trend". Used to corroborate the OLS slope.
  function theilSen(series) {
    var pts = [];
    for (var i = 0; i < series.length; i++) {
      var v = series[i].value;
      if (v != null && !isNaN(v) && isFinite(v)) pts.push([i, +v]);
    }
    if (pts.length < 3) return 0;
    var slopes = [];
    for (var a = 0; a < pts.length; a++) {
      for (var b = a + 1; b < pts.length; b++) {
        var dx = pts[b][0] - pts[a][0];
        if (dx !== 0) slopes.push((pts[b][1] - pts[a][1]) / dx);
      }
    }
    return median(slopes) || 0;
  }
  // Exponentially-weighted moving average — the "felt" recent level, where the
  // last few days weigh most. Returns the final smoothed value.
  function ewma(series, alpha) {
    alpha = alpha == null ? 0.35 : alpha;
    var acc = null;
    for (var i = 0; i < series.length; i++) {
      var v = series[i].value;
      if (v == null || isNaN(v)) continue;
      acc = acc == null ? +v : alpha * v + (1 - alpha) * acc;
    }
    return acc;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function round1(v) { return Math.round(v * 10) / 10; }
  // Map a raw value into 0..1 given a [lo,hi] range (saturating).
  function norm(v, lo, hi) { if (hi === lo) return 0; return clamp((v - lo) / (hi - lo), 0, 1); }

  // -------------------------------------------------------------------------
  // STAGE 1 — per-stream feature extraction.
  // For a metric we pull a 30-day daily series (via Store.derive.series) and
  // characterise it four ways the model can't compute itself: where it sits
  // now vs. its own baseline, how much it swings, which way it's moving, and
  // how unusual today is. `span` is the value's plausible full range, used to
  // turn volatility into a low/moderate/high label that means the same thing
  // across metrics.
  // -------------------------------------------------------------------------
  function extract(metric, span) {
    var series = (window.Store && Store.derive && Store.derive.series) ? Store.derive.series(metric, 30) : [];
    var vals = nums(series.map(function (d) { return d.value; }));
    if (vals.length < 3) return { ok: false, n: vals.length };

    var last14 = series.slice(-14);
    var last7 = nums(series.slice(-7).map(function (d) { return d.value; }));
    var recentVals = nums(last14.map(function (d) { return d.value; }));

    var base = median(vals);                    // robust 30-day baseline
    var spread = mad(vals) || std(vals);        // robust spread
    var level = ewma(series, 0.4);              // the "felt" current level
    var mostRecent = vals[vals.length - 1];

    // Momentum: agreement between OLS and robust Theil–Sen guards against a
    // single outlier faking a trend. Scaled to change-per-week for legibility.
    var slopeOls = olsSlope(series);
    var slopeRobust = theilSen(series);
    var slopePerWeek = ((Math.abs(slopeOls) < Math.abs(slopeRobust) ? slopeOls : slopeRobust)) * 7;
    // Only call it a trend if both agree in sign AND it's material vs. the span.
    var agree = (slopeOls > 0) === (slopeRobust > 0);
    var material = span ? Math.abs(slopePerWeek) > span * 0.06 : Math.abs(slopePerWeek) > 0.15;
    var trend = (agree && material) ? (slopePerWeek > 0 ? 'rising' : 'falling') : 'steady';

    // Anomaly: how far today sits from baseline, in robust-spread units.
    var z = (spread > 0 && mostRecent != null) ? (mostRecent - base) / spread : 0;

    // Volatility label, normalised against the metric's own plausible span.
    var volFrac = span ? spread / span : spread;
    var volatility = volFrac >= 0.28 ? 'high' : volFrac >= 0.14 ? 'moderate' : 'low';

    return {
      ok: true, n: vals.length,
      level: level, base: base, base7: mean(last7), recent: mean(recentVals),
      spread: spread, volatility: volatility, volFrac: volFrac,
      slopePerWeek: slopePerWeek, trend: trend, z: z, latest: mostRecent, span: span,
    };
  }

  // -------------------------------------------------------------------------
  // STAGE 2 — circadian rhythm. Bin every mood check-in by the hour it was
  // logged into four parts of day and average valence in each. The trough
  // (lowest part) and peak (highest) tell the model WHEN, in a typical day,
  // this person is most fragile or most resourced — so advice can be timed.
  // -------------------------------------------------------------------------
  function circadian() {
    var moods = (window.Store && Store.moods) ? Store.moods.all() : [];
    if (moods.length < 8) return { ok: false };
    var parts = { night: [], morning: [], afternoon: [], evening: [] };
    moods.forEach(function (m) {
      if (m.valence == null || !m.ts) return;
      var h = new Date(m.ts).getHours();
      var key = h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
      parts[key].push(m.valence);
    });
    var avgs = {};
    var order = ['morning', 'afternoon', 'evening', 'night'];
    var have = [];
    order.forEach(function (k) {
      if (parts[k].length >= 2) { avgs[k] = mean(parts[k]); have.push(k); }
    });
    if (have.length < 2) return { ok: false };
    var trough = have.reduce(function (lo, k) { return avgs[k] < avgs[lo] ? k : lo; }, have[0]);
    var peak = have.reduce(function (hi, k) { return avgs[k] > avgs[hi] ? k : hi; }, have[0]);
    // Only meaningful if the swing across the day is more than noise.
    var swing = avgs[peak] - avgs[trough];
    return { ok: swing >= 0.5, avgs: avgs, trough: trough, peak: peak, swing: swing };
  }

  // -------------------------------------------------------------------------
  // STAGE 3 — weekly rhythm. Same idea across days of the week: does a
  // particular weekday reliably run low (the "Sunday scaries", a hard Monday)?
  // -------------------------------------------------------------------------
  function weekly() {
    var moods = (window.Store && Store.moods) ? Store.moods.all() : [];
    if (moods.length < 14) return { ok: false };
    var byDow = [[], [], [], [], [], [], []];
    moods.forEach(function (m) {
      if (m.valence == null) return;
      var d = m.ts ? new Date(m.ts) : (Store.keyToDate ? Store.keyToDate(m.date) : null);
      if (!d) return;
      byDow[d.getDay()].push(m.valence);
    });
    var names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var scored = [];
    for (var i = 0; i < 7; i++) if (byDow[i].length >= 2) scored.push({ dow: i, name: names[i], avg: mean(byDow[i]) });
    if (scored.length < 4) return { ok: false };
    scored.sort(function (a, b) { return a.avg - b.avg; });
    var lowest = scored[0], highest = scored[scored.length - 1];
    var overall = mean(scored.map(function (s) { return s.avg; }));
    // Surface a low day only if it's a clear dip below the week's average.
    var notable = (overall - lowest.avg) >= 0.6;
    return { ok: notable, lowDay: lowest.name, lowAvg: lowest.avg, highDay: highest.name, overall: overall };
  }

  // -------------------------------------------------------------------------
  // STAGE 4 — sleep architecture. Two things raw duration can't say on its own:
  //   • Debt: a decaying sum of shortfalls under a personal target. Recent
  //     short nights hurt more than a rough night a week ago (0.82/day decay).
  //   • Regularity: the spread of bed times. Irregular timing is one of the
  //     most robust predictors of poor next-day mood, independent of duration.
  // -------------------------------------------------------------------------
  function sleepArchitecture() {
    var sleep = (window.Store && Store.sleep) ? Store.sleep.all() : [];
    if (!sleep.length) return { ok: false };
    var recent = sleep.slice(-14);
    var TARGET_MIN = 465; // ~7.75h — a defensible general target, not a prescription

    var debt = 0, wDecay = 1, decaySum = 0;
    for (var i = recent.length - 1; i >= 0; i--) {
      var dur = recent[i].durationMin;
      if (dur != null && !isNaN(dur)) {
        debt += wDecay * Math.max(0, TARGET_MIN - dur);
        decaySum += wDecay;
        wDecay *= 0.82;
      }
    }
    var debtHours = decaySum > 0 ? round1((debt / decaySum) * Math.min(7, decaySum) / 60) : null;

    // Bedtime regularity: std of the clock-minute of `inBedAt`, if recorded.
    var beds = [];
    recent.forEach(function (s) {
      if (s.inBedAt) {
        var d = new Date(s.inBedAt);
        if (!isNaN(d)) { var min = d.getHours() * 60 + d.getMinutes(); beds.push(min > 720 ? min - 1440 : min); }
      }
    });
    var regularityMin = beds.length >= 4 ? Math.round(std(beds)) : null;
    var lastDur = recent[recent.length - 1] && recent[recent.length - 1].durationMin;

    return {
      ok: true,
      lastHours: lastDur != null ? round1(lastDur / 60) : null,
      debtHours: debtHours,
      regularityMin: regularityMin,
      irregular: regularityMin != null && regularityMin >= 60,
    };
  }

  // -------------------------------------------------------------------------
  // STAGE 5 — allostatic load: a composite index of cumulative "wear and tear".
  // Borrowed from stress physiology: strain is rarely one dimension; it's the
  // sum of several systems each carrying a little too much. We normalise five
  // drivers to 0..1, weight them, and scale to 0..100. This is the single
  // number that best answers "how much is this person carrying right now?"
  // -------------------------------------------------------------------------
  function allostaticLoad(streams, sleep) {
    var drivers = [];
    function add(label, value01, weight) {
      if (value01 == null || isNaN(value01)) return;
      drivers.push({ label: label, load: clamp(value01, 0, 1), weight: weight });
    }

    // Sleep debt (0 at none, 1 at ~10h decayed debt).
    if (sleep && sleep.ok && sleep.debtHours != null) add('sleep debt', norm(sleep.debtHours, 0.5, 10), 1.15);
    if (sleep && sleep.ok && sleep.irregular) add('irregular sleep timing', norm(sleep.regularityMin, 45, 150), 0.7);

    // Mood strain: below-baseline level + volatility + falling momentum.
    if (streams.mood && streams.mood.ok) {
      var mo = streams.mood;
      add('low mood', norm(-mo.z, 0.3, 2.2), 1.0);                                  // sitting below own norm
      add('mood instability', norm(mo.volFrac, 0.14, 0.4), 0.85);
      if (mo.trend === 'falling') add('mood trending down', norm(-mo.slopePerWeek, 0.15, 1.2), 0.9);
    }
    // Energy deficit + its trend.
    if (streams.energy && streams.energy.ok) {
      var en = streams.energy;
      add('low energy', norm(-en.z, 0.3, 2.2), 0.8);
      if (en.trend === 'falling') add('energy trending down', norm(-en.slopePerWeek, 0.15, 1.5), 0.6);
    }
    // Journal tone drifting negative.
    if (streams.journal && streams.journal.ok && streams.journal.trend === 'falling') {
      add('writing turning heavier', 0.6, 0.6);
    }
    // Net energy ledger running in deficit.
    if (streams.energyNet && streams.energyNet.ok && streams.energyNet.level != null && streams.energyNet.level < 0) {
      add('more drain than restore', norm(-streams.energyNet.level, 0.3, 3), 0.7);
    }

    if (!drivers.length) return { ok: false };
    var wsum = drivers.reduce(function (s, d) { return s + d.weight; }, 0);
    var raw = drivers.reduce(function (s, d) { return s + d.load * d.weight; }, 0) / wsum;
    var score = Math.round(raw * 100);
    var band = score >= 66 ? 'high' : score >= 38 ? 'moderate' : 'low';
    // Report the biggest contributors so the model can name what's actually heavy.
    var top = drivers.slice().sort(function (a, b) { return (b.load * b.weight) - (a.load * a.weight); })
      .filter(function (d) { return d.load >= 0.25; }).slice(0, 3).map(function (d) { return d.label; });
    return { ok: true, score: score, band: band, drivers: top };
  }

  // -------------------------------------------------------------------------
  // STAGE 6 — convergence watch. The genuinely worrying pattern isn't one low
  // reading; it's several independent systems drifting down at once. We count
  // signals that are BOTH below baseline AND falling, and raise a gentle,
  // non-clinical warning when they stack up — so the model can lead with
  // warmth, rest and connection (and the app's safety guardrails stay primed).
  // -------------------------------------------------------------------------
  function convergence(streams) {
    var down = [];
    ['mood', 'energy', 'sleep', 'journal', 'energyNet'].forEach(function (k) {
      var s = streams[k];
      if (!s || !s.ok) return;
      var below = s.z != null && s.z <= -0.5;
      var falling = s.trend === 'falling';
      if (below && falling) down.push(k);
      else if (below || falling) down.push(k + '?'); // half-signal, tracked but weaker
    });
    var strong = down.filter(function (d) { return d.indexOf('?') === -1; });
    return {
      ok: true,
      downSignals: strong,
      count: strong.length,
      warning: strong.length >= 3,        // several systems, same direction
      watch: strong.length === 2,
    };
  }

  // -------------------------------------------------------------------------
  // STAGE 7 — values alignment. From the user's own values check-ins, how much
  // of recent life has been lived in line with what they said matters, vs.
  // crowded out. Silent (ok:false) when they haven't logged enough to say.
  // -------------------------------------------------------------------------
  function valuesAlignment() {
    var checks = (window.Store && Store.valuesChecks) ? Store.valuesChecks.all().slice(-10) : [];
    if (checks.length < 2) return { ok: false };
    var lived = 0, crowded = 0, crowdedNames = {};
    checks.forEach(function (c) {
      (c.lived || []).forEach(function () { lived++; });
      (c.crowded || []).forEach(function (name) { crowded++; crowdedNames[name] = (crowdedNames[name] || 0) + 1; });
    });
    if (lived + crowded < 3) return { ok: false };
    var score = Math.round(100 * lived / (lived + crowded));
    var mostCrowded = Object.keys(crowdedNames).sort(function (a, b) { return crowdedNames[b] - crowdedNames[a]; })[0] || null;
    return { ok: true, score: score, aligned: score >= 60, crowded: mostCrowded };
  }

  // -------------------------------------------------------------------------
  // STAGE 8 — lever ranking. Pattern Detective has already mined the user's
  // streams for lagged cause→effect correlations. Here we turn those into a
  // ranked action list by asking a sharper question than "what correlates?":
  //   expected payoff  =  evidence (|r|·confidence) · actionability · how far
  //                       the cause currently sits from its healthy range.
  // A strong lever you're already doing well on ranks low; a strong lever
  // you're currently off on ranks high. That last factor is what makes this
  // about THIS week, not a static fact sheet.
  // -------------------------------------------------------------------------
  var LEVERS = {
    sleepTempF: { label: 'keep the bedroom cooler at night', better: 'low', good: [63, 68] },
    sleepDur: { label: 'protect a fuller night of sleep', better: 'high', good: [7, 9] },
    noise: { label: 'quiet the sleep environment', better: 'low', good: [0, 35] },
    light: { label: 'cut light exposure before bed', better: 'low', good: [0, 8] },
    energyNet: { label: 'end the day with more restore than drain', better: 'high', good: [0, 4] },
    journalSentiment: { label: 'keep writing — its tone tracks their mood', better: 'high', good: [0, 1] },
    sleepScore: { label: 'protect sleep quality', better: 'high', good: [70, 100] },
    humidity: { label: 'steady the bedroom humidity', better: 'mid', good: [35, 55] },
  };
  function currentDeviation(metric, good) {
    var series = (window.Store && Store.derive) ? Store.derive.series(metric, 14) : [];
    var v = ewma(series, 0.4);
    if (v == null || !good) return 0.4; // unknown → mild weight
    if (v >= good[0] && v <= good[1]) return 0.1;             // already in range → low priority
    var d = v < good[0] ? good[0] - v : v - good[1];
    var scale = (good[1] - good[0]) || 1;
    return clamp(0.25 + d / (scale * 2), 0, 1);
  }
  // Which network node each controllable cause ultimately acts through, so a
  // lever that moves a systemically CENTRAL hub is weighted up: changing a
  // central node propagates through the whole partial-correlation network.
  var CAUSE_TO_NODE = {
    sleepTempF: 'sleep', noise: 'sleep', light: 'sleep', sleepScore: 'sleep', humidity: 'sleep',
    sleepDur: 'sleep length', energyNet: 'energy balance', journalSentiment: 'writing tone',
  };
  function centralityMap(deep) {
    var map = {};
    if (deep && deep.network && deep.network.ok && deep.network.nodes && deep.network.nodes.length) {
      var maxS = deep.network.nodes[0].strength || 1;
      deep.network.nodes.forEach(function (n) { map[n.label] = maxS ? (n.strength / maxS) : 0; });
    }
    return map;
  }
  function rankLevers(deep) {
    var insights = (window.Store && Store.insights) ? Store.insights.all() : [];
    var cmap = centralityMap(deep);
    var out = [];
    insights.forEach(function (ins) {
      if (ins.dismissed) return;
      var meta = LEVERS[ins.cause];
      if (!meta) return; // only causes the user can actually act on
      var evidence = Math.min(1, Math.abs(ins.r || 0)) * (ins.confidence || 0);
      if (evidence < 0.1) return;
      var dev = currentDeviation(ins.cause, meta.good);
      // systemic-centrality multiplier: 1.0 (peripheral) .. ~1.6 (hub)
      var central = cmap[CAUSE_TO_NODE[ins.cause]] || 0;
      var systemic = 1 + 0.6 * central;
      var payoff = evidence * (ins.actionability || 0.5) * (0.5 + dev) * systemic;
      out.push({
        id: ins.id, metric: ins.cause, effect: ins.effect,
        label: meta.label, payoff: payoff, r: ins.r, lag: ins.lag,
        confidence: ins.confidence, deviation: dev, central: central,
        strength: stats() && stats().strengthLabel ? stats().strengthLabel(ins.r || 0) : '',
      });
    });
    out.sort(function (a, b) { return b.payoff - a.payoff; });
    // De-dupe by lever (a cause can appear against multiple effects) — keep best.
    var seen = {}, dedup = [];
    out.forEach(function (l) { if (!seen[l.metric]) { seen[l.metric] = 1; dedup.push(l); } });
    return dedup.slice(0, 4);
  }

  // -------------------------------------------------------------------------
  // STAGE 8.5 — the DEEP layer. Build one aligned, standardised multivariate
  // matrix from every stream and run the advanced suite in synthlab.js
  // (Kalman, change-point, critical-slowing-down, partial-correlation network,
  // Mahalanobis, entropy, Lomb–Scargle, Rayleigh). This is where the analysis
  // stops being per-stream and becomes genuinely systemic.
  // -------------------------------------------------------------------------
  var DEEP_STREAMS = [
    { metric: 'valence', label: 'mood' },
    { metric: 'energyMood', label: 'energy' },
    { metric: 'sleepScore', label: 'sleep' },
    { metric: 'sleepDur', label: 'sleep length' },
    { metric: 'energyNet', label: 'energy balance' },
    { metric: 'journalSentiment', label: 'writing tone' },
  ];

  // Assemble a day-aligned matrix over `days`, keep only columns with enough
  // coverage, standardise each column, then take complete-case rows for the
  // covariance-based methods. Returns { X, labels, dates } or null.
  function buildMatrix(days) {
    if (!(window.Store && Store.derive && Store.derive.series)) return null;
    var cols = [], labels = [], dates = null;
    DEEP_STREAMS.forEach(function (spec) {
      var series = Store.derive.series(spec.metric, days);
      if (!dates) dates = series.map(function (d) { return d.date; });
      var vals = series.map(function (d) { return (d.value != null && !isNaN(d.value)) ? +d.value : null; });
      var present = nums(vals);
      if (present.length < Math.max(8, days * 0.35)) return; // too sparse → drop the column
      var mu = mean(present), sig = std(present) || 1;
      cols.push(vals.map(function (v) { return v == null ? null : (v - mu) / sig; }));
      labels.push(spec.label);
    });
    if (cols.length < 3 || !dates) return null;
    // complete-case rows (every kept column present that day)
    var X = [], keptDates = [];
    for (var r = 0; r < dates.length; r++) {
      var row = [], ok = true;
      for (var c = 0; c < cols.length; c++) { if (cols[c][r] == null) { ok = false; break; } row.push(cols[c][r]); }
      if (ok) { X.push(row); keptDates.push(dates[r]); }
    }
    return { X: X, labels: labels, dates: keptDates, cols: cols };
  }

  function deepAnalysis() {
    var lab = window.SynthLab;
    if (!lab) return { ok: false };
    var out = { ok: true };
    try {
      var moodSeries = Store.derive.series('valence', 30);
      out.kalman = lab.kalmanTrend(moodSeries);
      out.changePoint = lab.changePoint(moodSeries);
      out.csd = lab.criticalSlowing(moodSeries, 7);
      out.entropy = lab.sampleEntropy(moodSeries);
      out.periodicity = lab.lombScargle(moodSeries);

      // circular time-of-day of LOW-mood check-ins (below personal median)
      var moods = Store.moods.all().filter(function (m) { return m.valence != null && m.ts; });
      if (moods.length >= 8) {
        var med = median(nums(moods.map(function (m) { return m.valence; })));
        var lowHours = moods.filter(function (m) { return m.valence <= med; }).map(function (m) { return new Date(m.ts).getHours(); });
        out.rayleigh = lab.rayleigh(lowHours);
      }

      var mat = buildMatrix(30);
      if (mat) {
        out.network = lab.ggmCentrality(mat.X, mat.labels);
        out.anomaly = lab.mahalanobis(mat.X, mat.labels, mat.dates);
      }
    } catch (e) { out.ok = true; out.error = String(e && e.message || e); }
    return out;
  }

  // -------------------------------------------------------------------------
  // STAGE 9 — synthesis. Assemble the full model. Memoised on a cheap signature
  // (stream counts + today) so repeated renders in one session don't recompute.
  // -------------------------------------------------------------------------
  var _cache = null, _sig = null;
  function signature() {
    if (!window.Store) return 'x';
    function c(n) { try { return Store[n] && Store[n].count ? Store[n].count() : 0; } catch (e) { return 0; } }
    return [Store.today ? Store.today() : '', c('moods'), c('sleep'), c('journal'), c('energy'),
      c('insights'), c('valuesChecks')].join('|');
  }

  function compute() {
    var sig = signature();
    if (_cache && _sig === sig) return _cache;

    var days = (window.Store && Store.derive && Store.derive.historyDays) ? Store.derive.historyDays() : 0;
    if (days < 3) { _cache = { ok: false, days: days }; _sig = sig; return _cache; }

    // Stage 1 — streams (span = plausible full range, for scale-free labels).
    var streams = {
      mood: extract('valence', 4),        // -2..2
      energy: extract('energyMood', 10),  // 0..10
      sleep: extract('sleepScore', 100),  // 0..100
      sleepDur: extract('sleepDur', 6),   // hours-ish
      journal: extract('journalSentiment', 2),
      energyNet: extract('energyNet', 8),
    };

    var circ = circadian();
    var week = weekly();
    var sleepArch = sleepArchitecture();
    var load = allostaticLoad(streams, sleepArch);
    var conv = convergence(streams);
    var values = valuesAlignment();
    var deep = deepAnalysis();
    var levers = rankLevers(deep);

    var model = {
      ok: true, days: days,
      streams: streams,
      circadian: circ,
      weekly: week,
      sleep: sleepArch,
      allostaticLoad: load,
      convergence: conv,
      values: values,
      deep: deep,
      levers: levers,
      vitality: (window.Store && Store.derive && Store.derive.vitality) ? Store.derive.vitality() : null,
    };
    model.headline = buildHeadline(model);
    _cache = model; _sig = sig;
    return model;
  }

  // -------------------------------------------------------------------------
  // Human-facing one-liner (UI). Deterministic, non-clinical, no numbers.
  // -------------------------------------------------------------------------
  function buildHeadline(m) {
    if (!m.ok) return '';
    if (m.convergence && m.convergence.warning) return 'A few things are pulling on you at once — be gentle with yourself today.';
    if (m.deep && m.deep.ok) {
      if (m.deep.csd && m.deep.csd.rising) return 'Your system looks a little less steady lately — worth leaning on your routines.';
      if (m.deep.changePoint && m.deep.changePoint.found && m.deep.changePoint.daysAgo <= 14) {
        return m.deep.changePoint.direction === 'up' ? 'Something shifted for the better recently — worth noticing what.' : 'Something shifted a couple of weeks back — worth a kind look at what changed.';
      }
    }
    var mo = m.streams.mood;
    if (mo && mo.ok) {
      if (mo.trend === 'rising') return 'Your mood has been climbing — something is working.';
      if (mo.trend === 'falling') return 'Mood has softened lately — worth a kind eye on it.';
    }
    if (m.allostaticLoad && m.allostaticLoad.band === 'low') return 'Your system looks steady and well-resourced right now.';
    if (m.allostaticLoad && m.allostaticLoad.band === 'high') return "You're carrying a fair bit right now — rest is not optional this week.";
    return 'Things look fairly level right now.';
  }

  // -------------------------------------------------------------------------
  // briefing() — the payload for the API. A compact, labelled English block the
  // model treats as trusted context. Written to be READ BY a model, not a
  // person: it front-loads the facts and ends with explicit guidance so the
  // model uses the analysis without reciting it like a dashboard.
  // -------------------------------------------------------------------------
  function trendWord(s) {
    if (!s || !s.ok) return null;
    return s.trend === 'rising' ? 'rising' : s.trend === 'falling' ? 'drifting down' : 'holding steady';
  }
  function zWord(z) {
    if (z == null) return '';
    if (z >= 1.2) return 'well above their usual';
    if (z >= 0.5) return 'a bit above their usual';
    if (z <= -1.2) return 'well below their usual';
    if (z <= -0.5) return 'a bit below their usual';
    return 'about their usual';
  }

  function briefing(opts) {
    opts = opts || {};
    var m = compute();
    if (!m.ok) return ''; // not enough data — let the API work unassisted

    var L = [];
    L.push('[ANCHOR STATE ENGINE — computed on-device from ' + m.days + ' days of the user\'s own data. Trusted context. Do NOT read these figures out loud or sound like a report; let them make your reply specific and grounded.]');

    var mo = m.streams.mood, en = m.streams.energy;
    if (mo && mo.ok) {
      L.push('Mood: ' + trendWord(mo) + ' over the past two weeks; today sits ' + zWord(mo.z) + '. Swing/volatility is ' + mo.volatility + '.');
    }
    if (en && en.ok) {
      L.push('Energy: ' + trendWord(en) + '; ' + zWord(en.z) + ' today.');
    }
    if (m.sleep && m.sleep.ok) {
      var sp = [];
      if (m.sleep.lastHours != null) sp.push('last night ~' + m.sleep.lastHours + 'h');
      if (m.sleep.debtHours != null && m.sleep.debtHours >= 1) sp.push('a running sleep debt of about ' + m.sleep.debtHours + 'h');
      if (m.sleep.irregular) sp.push('bed times have been irregular');
      if (sp.length) L.push('Sleep: ' + sp.join('; ') + '.');
    }
    if (m.allostaticLoad && m.allostaticLoad.ok) {
      var ld = 'Cumulative strain (allostatic load): ' + m.allostaticLoad.band + ' (' + m.allostaticLoad.score + '/100)';
      if (m.allostaticLoad.drivers && m.allostaticLoad.drivers.length) ld += ' — mostly from ' + m.allostaticLoad.drivers.join(', ');
      L.push(ld + '.');
    }
    if (m.convergence && m.convergence.warning) {
      L.push('⚠ CONVERGENCE: several signals (' + m.convergence.downSignals.join(', ') + ') are low AND falling together. Lead with warmth, rest and human connection; keep it gentle and non-clinical; if any distress, hopelessness or self-harm surfaces, encourage reaching a real person or crisis line and note support is one tap away.');
    } else if (m.convergence && m.convergence.watch) {
      L.push('Note: a couple of signals are softening together — worth a caring, low-key check-in, no alarm.');
    }
    if (m.circadian && m.circadian.ok) {
      L.push('Daily rhythm: they typically dip in the ' + m.circadian.trough + ' and feel strongest in the ' + m.circadian.peak + ' — time suggestions accordingly when it fits.');
    }
    if (m.weekly && m.weekly.ok) {
      L.push('Weekly rhythm: ' + m.weekly.lowDay + 's tend to run low for them.');
    }
    if (m.values && m.values.ok) {
      L.push('Values: living about ' + m.values.score + '% in line with what they chose' + (m.values.crowded ? ('; "' + m.values.crowded + '" keeps getting crowded out') : '') + '.');
    }
    if (m.levers && m.levers.length) {
      var top = m.levers.slice(0, 3).map(function (l, i) {
        return (i + 1) + ') ' + l.label + ' (their own data: ' + (l.strength || 'a') + ' link' + (l.lag ? ', effect shows up ' + (l.lag === 1 ? 'the next day' : 'after ~' + l.lag + ' days') : '') + (l.central >= 0.85 ? '; this sits at the CENTRE of their system, so it has outsized ripple effects' : '') + ')';
      });
      L.push('Highest-leverage moves, ranked by evidence, how off-track each lever is right now, AND how central it is in their partial-correlation network:\n   ' + top.join('\n   '));
    }

    // ---- advanced signals: only surface what cleared a significance bar ----
    var d = m.deep, adv = [];
    if (d && d.ok) {
      if (d.changePoint && d.changePoint.found && d.changePoint.daysAgo != null && d.changePoint.daysAgo <= 21) {
        adv.push('A genuine turning point was detected ~' + d.changePoint.daysAgo + ' days ago: their baseline shifted ' + (d.changePoint.direction === 'up' ? 'UPWARD' : 'DOWNWARD') + '. Something changed around then — worth gently understanding what.');
      }
      if (d.csd && d.csd.ok && d.csd.rising) {
        adv.push('EARLY-WARNING (critical slowing down): rising autocorrelation and variance together suggest their emotional system is losing resilience — a subtle sign it may be destabilising before any obvious dip. Lean toward steadying routines (sleep, rhythm, connection); stay warm, never alarming.');
      }
      if (d.kalman && d.kalman.ok && Math.abs(d.kalman.velocity) > 0.04) {
        adv.push('Latent-state estimate (Kalman-filtered, noise removed): true mood is ' + (d.kalman.velocity > 0 ? 'genuinely trending up' : 'genuinely trending down') + ', not just noise.');
      }
      if (d.network && d.network.ok && d.network.central) {
        adv.push('Systemically, "' + d.network.central.label + '" is the most connected hub in their life-network — moving it tends to move everything else.');
      }
      if (d.anomaly && d.anomaly.ok && d.anomaly.outlier && d.anomaly.date) {
        adv.push('One recent day (' + d.anomaly.date + ') stands out as a multivariate outlier, driven most by ' + (d.anomaly.driver || 'several factors') + ' — may be worth a gentle look at what happened.');
      }
      if (d.periodicity && d.periodicity.ok && d.periodicity.significant) {
        adv.push('A repeating ~' + Math.round(d.periodicity.period) + '-day cycle shows up in their mood — there may be a rhythm worth planning around.');
      }
      if (d.rayleigh && d.rayleigh.ok && d.rayleigh.concentrated) {
        var hr = Math.round(d.rayleigh.peakHour);
        adv.push('Their lower moods cluster around ' + (hr % 12 || 12) + (hr < 12 ? 'am' : 'pm') + ' — a reliably tender time of day to plan care for.');
      }
      if (d.entropy && d.entropy.ok && d.entropy.entropy != null) {
        if (d.entropy.erratic) adv.push('Their emotional dynamics are unusually erratic/unpredictable right now (high sample entropy) — predictability and gentle structure may help more than big changes.');
        else if (d.entropy.veryRegular) adv.push('Their emotional dynamics are very regular/stable right now (low sample entropy).');
      }
    }
    if (adv.length) L.push('Advanced signals (computed on-device; use to deepen understanding, never to diagnose):\n   • ' + adv.join('\n   • '));

    L.push('Guidance: weave in at most one or two of these naturally. If they ask what to do, prioritise the top lever. Never recite the numbers; be warm, specific and human.');

    var text = L.join('\n');
    if (opts.maxLen && text.length > opts.maxLen) text = text.slice(0, opts.maxLen);
    return text;
  }

  function headline() { var m = compute(); return m.ok ? m.headline : ''; }
  function levers() { var m = compute(); return m.ok ? m.levers : []; }

  window.Synthesis = {
    compute: compute,
    briefing: briefing,
    headline: headline,
    levers: levers,
    // exposed for tests / future UI
    _internals: { extract: extract, allostaticLoad: allostaticLoad, rankLevers: rankLevers },
  };
})();
