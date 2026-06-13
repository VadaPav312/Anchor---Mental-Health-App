// ===========================================================================
// stats.js — the analytical engine behind Pattern Detective & Experiments.
//
// The headline idea: mental-health causes are rarely same-day. Poor sleep
// tonight may not hit your mood for two days. So we compute LAGGED Pearson
// correlations between data streams across lags 0..3 days, keep the strongest,
// and estimate how much to trust it (n, |r|, an approximate two-tailed p).
//
// Pure functions, no DOM, no storage — fed series from Store.derive.series().
// ===========================================================================
(function () {
  function clean(xs, ys) {
    // pairwise-complete: keep only indices where both are finite numbers
    const X = [], Y = [];
    for (let i = 0; i < xs.length && i < ys.length; i++) {
      const a = xs[i], b = ys[i];
      if (a != null && b != null && !isNaN(a) && !isNaN(b)) { X.push(+a); Y.push(+b); }
    }
    return [X, Y];
  }
  function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
  function std(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1)); }
  function zscores(a) { const m = mean(a), s = std(a) || 1; return a.map(v => (v - m) / s); }

  function pearson(xs, ys) {
    const [X, Y] = clean(xs, ys);
    const n = X.length;
    if (n < 4) return { r: 0, n, p: 1 };
    const mx = mean(X), my = mean(Y);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) { const a = X[i] - mx, b = Y[i] - my; num += a * b; dx += a * a; dy += b * b; }
    const den = Math.sqrt(dx * dy);
    const r = den === 0 ? 0 : num / den;
    return { r, n, p: pValue(r, n) };
  }

  // Two-tailed p from the t-distribution, via a normal approximation good
  // enough for ranking/labeling (we're not publishing a paper, just deciding
  // whether to surface a pattern). t = r*sqrt((n-2)/(1-r^2)).
  function pValue(r, n) {
    if (n < 4 || Math.abs(r) >= 1) return n < 4 ? 1 : 0;
    const t = r * Math.sqrt((n - 2) / (1 - r * r));
    // Welch–Satterthwaite-ish: approximate t with df>~8 as normal
    const z = Math.abs(t);
    // survival function of standard normal (Abramowitz & Stegun 7.1.26)
    const p = 0.5 * erfc(z / Math.SQRT2);
    return Math.max(0, Math.min(1, 2 * p));
  }
  function erfc(x) {
    const z = Math.abs(x);
    const tt = 1 / (1 + 0.5 * z);
    const r = tt * Math.exp(-z * z - 1.26551223 + tt * (1.00002368 + tt * (0.37409196 + tt * (0.09678418 +
      tt * (-0.18628806 + tt * (0.27886807 + tt * (-1.13520398 + tt * (1.48851587 +
      tt * (-0.82215223 + tt * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }

  // x LEADS y by `lag` days: correlate x[t] with y[t+lag].
  function laggedPearson(xSeries, ySeries, lag) {
    const xs = xSeries.map(d => d.value);
    const ys = ySeries.map(d => d.value);
    if (lag === 0) return pearson(xs, ys);
    const x2 = xs.slice(0, xs.length - lag);
    const y2 = ys.slice(lag);
    return pearson(x2, y2);
  }

  // Search lags 0..maxLag, return the strongest (by |r| with enough n).
  function bestLag(xSeries, ySeries, maxLag) {
    maxLag = maxLag == null ? 3 : maxLag;
    let best = { lag: 0, r: 0, n: 0, p: 1 };
    for (let lag = 0; lag <= maxLag; lag++) {
      const res = laggedPearson(xSeries, ySeries, lag);
      if (res.n >= 5 && Math.abs(res.r) > Math.abs(best.r)) best = { lag, r: res.r, n: res.n, p: res.p };
    }
    return best;
  }

  function strengthLabel(r) {
    const a = Math.abs(r);
    if (a >= 0.6) return 'strong';
    if (a >= 0.4) return 'clear';
    if (a >= 0.25) return 'mild';
    return 'faint';
  }
  // Confidence 0..1 blends effect size, sample size and significance.
  function confidence(r, n, p) {
    const eff = Math.min(1, Math.abs(r) / 0.7);
    const samp = Math.min(1, (n - 4) / 24);
    const sig = 1 - Math.min(1, p / 0.2);
    return Math.max(0, Math.min(1, 0.45 * eff + 0.25 * samp + 0.30 * sig));
  }

  // ---- A/B experiment analysis: compare metric on "did it" vs "control" days
  function compareGroups(aValues, bValues) {
    const A = aValues.filter(v => v != null && !isNaN(v));
    const B = bValues.filter(v => v != null && !isNaN(v));
    if (A.length < 2 || B.length < 2) return { ok: false, nA: A.length, nB: B.length };
    const mA = mean(A), mB = mean(B);
    const sp = Math.sqrt(((A.length - 1) * std(A) ** 2 + (B.length - 1) * std(B) ** 2) / (A.length + B.length - 2)) || 1;
    const cohenD = (mA - mB) / sp;
    // Welch t for difference of means
    const se = Math.sqrt(std(A) ** 2 / A.length + std(B) ** 2 / B.length) || 1;
    const t = (mA - mB) / se;
    const p = 0.5 * erfc(Math.abs(t) / Math.SQRT2) * 2;
    return { ok: true, meanA: mA, meanB: mB, diff: mA - mB, cohenD, p, nA: A.length, nB: B.length };
  }

  // simple moving average for smoothing chart series
  function smooth(values, win) {
    win = win || 3;
    return values.map((_, i) => {
      const a = Math.max(0, i - Math.floor(win / 2));
      const b = Math.min(values.length, i + Math.ceil(win / 2));
      const slice = values.slice(a, b).filter(v => v != null && !isNaN(v));
      return slice.length ? slice.reduce((s, v) => s + v, 0) / slice.length : null;
    });
  }

  window.Stats = {
    mean, std, zscores, pearson, pValue, laggedPearson, bestLag,
    strengthLabel, confidence, compareGroups, smooth, erfc,
  };
})();
