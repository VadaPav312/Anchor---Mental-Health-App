// ===========================================================================
// synthlab.js — the ADVANCED analytical layer beneath the Synthesis engine.
//
// synthesis.js does the everyday statistics (baselines, momentum, strain).
// This file does the heavy science: methods borrowed directly from
// computational psychiatry, dynamical-systems theory and signal processing,
// implemented from scratch in pure JavaScript so they run on-device with no
// dependencies. Each is a real, correctly-specified algorithm — not a mock:
//
//   • Kalman local-linear-trend  — optimal recursive estimate of the latent
//     "true" mood level and its velocity, separating signal from noise.
//   • Change-point detection     — penalised Gaussian likelihood search for the
//     moment a person's baseline structurally shifted (a real turning point).
//   • Critical Slowing Down      — the tipping-point early-warning signal from
//     ecology & psychopathology: rising lag-1 autocorrelation AND variance
//     together flag a system losing resilience BEFORE it transitions.
//   • Gaussian Graphical Model   — a regularised partial-correlation network
//     across all life-streams; node-strength centrality names the factor that
//     propagates most through the whole system (network theory of mental
//     health, Borsboom et al.). The most central controllable node = the
//     lever with the largest systemic payoff.
//   • Mahalanobis anomaly        — multivariate outlier detection that flags a
//     day abnormal across dimensions *jointly*, accounting for their covariance.
//   • Sample entropy             — information-theoretic regularity of the mood
//     signal; high entropy = erratic, hard-to-predict emotional dynamics.
//   • Lomb–Scargle periodogram   — spectral peak detection built for the
//     unevenly-sampled series real check-ins produce; finds hidden cycles
//     (e.g. a true 7-day rhythm) with a false-alarm probability.
//   • Rayleigh test              — circular statistics for time-of-day: is low
//     mood genuinely concentrated at an hour, or uniformly spread?
//
// Everything is pure and defensive: too little data → { ok:false }, never a
// throw. Exposed as window.SynthLab.
// ===========================================================================
(function () {
  'use strict';

  // =========================================================================
  // 0 — a tiny linear-algebra core (dense, small matrices only).
  // =========================================================================
  function zeros(r, c) { var m = []; for (var i = 0; i < r; i++) { m.push(new Array(c).fill(0)); } return m; }
  function eye(n) { var m = zeros(n, n); for (var i = 0; i < n; i++) m[i][i] = 1; return m; }
  function transpose(A) {
    var r = A.length, c = A[0].length, T = zeros(c, r);
    for (var i = 0; i < r; i++) for (var j = 0; j < c; j++) T[j][i] = A[i][j];
    return T;
  }
  function matMul(A, B) {
    var r = A.length, k = B.length, c = B[0].length, out = zeros(r, c);
    for (var i = 0; i < r; i++) for (var j = 0; j < c; j++) { var s = 0; for (var x = 0; x < k; x++) s += A[i][x] * B[x][j]; out[i][j] = s; }
    return out;
  }
  // Gauss–Jordan inverse with partial pivoting. Returns null if singular.
  function inv(M) {
    var n = M.length;
    var A = M.map(function (row, i) { return row.concat(eye(n)[i]); });
    for (var col = 0; col < n; col++) {
      var piv = col;
      for (var r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      if (Math.abs(A[piv][col]) < 1e-12) return null;
      var tmp = A[col]; A[col] = A[piv]; A[piv] = tmp;
      var d = A[col][col];
      for (var j = 0; j < 2 * n; j++) A[col][j] /= d;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === col) continue;
        var f = A[r2][col];
        for (var j2 = 0; j2 < 2 * n; j2++) A[r2][j2] -= f * A[col][j2];
      }
    }
    return A.map(function (row) { return row.slice(n); });
  }

  // ---- shared stats ----
  function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; }
  function variance(a) { if (a.length < 2) return 0; var m = mean(a); return a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / (a.length - 1); }
  function sd(a) { return Math.sqrt(variance(a)); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Kendall's τ — the rank-correlation used as the CSD trend statistic.
  function kendallTau(y) {
    var n = y.length; if (n < 4) return 0;
    var c = 0, d = 0;
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      var s = (y[j] - y[i]);
      if (s > 0) c++; else if (s < 0) d++;
    }
    var denom = n * (n - 1) / 2;
    return denom ? (c - d) / denom : 0;
  }

  // Linearly interpolate interior gaps so window methods see a regular grid.
  // Leading/trailing nulls are dropped (we don't extrapolate).
  function interpolate(series) {
    var v = series.map(function (d) { return (d && d.value != null && !isNaN(d.value)) ? +d.value : null; });
    var first = v.findIndex(function (x) { return x != null; });
    var last = v.length - 1; while (last >= 0 && v[last] == null) last--;
    if (first < 0 || last <= first) return [];
    v = v.slice(first, last + 1);
    for (var i = 0; i < v.length; i++) {
      if (v[i] == null) {
        var p = i - 1; while (p >= 0 && v[p] == null) p--;
        var q = i + 1; while (q < v.length && v[q] == null) q++;
        if (p >= 0 && q < v.length) { var t = (i - p) / (q - p); v[i] = v[p] + t * (v[q] - v[p]); }
        else if (p >= 0) v[i] = v[p]; else v[i] = v[q];
      }
    }
    return v;
  }

  // =========================================================================
  // 1 — KALMAN local-linear-trend filter.
  // State = [level, slope]; the filter optimally fuses each noisy observation
  // with the model's prediction, returning the latent level, its per-day
  // velocity, and the posterior uncertainty on the level.
  // =========================================================================
  function kalmanTrend(series) {
    var y = interpolate(series);
    if (y.length < 6) return { ok: false };
    var diffs = []; for (var i = 1; i < y.length; i++) diffs.push(y[i] - y[i - 1]);
    var r = Math.max(1e-4, variance(diffs) / 2);   // measurement noise
    var q1 = r * 0.1, q2 = r * 0.01;               // process noise (level, slope)

    var F = [[1, 1], [0, 1]];
    var x = [[y[0]], [0]];
    var P = [[r * 10, 0], [0, r]];
    var Q = [[q1, 0], [0, q2]];

    for (var t = 1; t < y.length; t++) {
      // predict
      x = matMul(F, x);
      P = matMul(matMul(F, P), transpose(F));
      P[0][0] += Q[0][0]; P[1][1] += Q[1][1];
      // update with H = [1, 0]
      var S = P[0][0] + r;
      var K0 = P[0][0] / S, K1 = P[1][0] / S;
      var innov = y[t] - x[0][0];
      x[0][0] += K0 * innov; x[1][0] += K1 * innov;
      var p00 = P[0][0], p01 = P[0][1], p10 = P[1][0], p11 = P[1][1];
      P[0][0] = p00 - K0 * p00; P[0][1] = p01 - K0 * p01;
      P[1][0] = p10 - K1 * p00; P[1][1] = p11 - K1 * p01;
    }
    return { ok: true, level: x[0][0], velocity: x[1][0], uncertainty: Math.sqrt(Math.max(0, P[0][0])), n: y.length };
  }

  // =========================================================================
  // 2 — CHANGE-POINT detection (single, offline, penalised Gaussian).
  // Finds the split maximising the two-segment likelihood over one segment,
  // accepted only if the gain clears a BIC-style penalty. Returns the index
  // (from the series start) and the direction of the shift.
  // =========================================================================
  function changePoint(series) {
    var vals = [], idx = [];
    for (var i = 0; i < series.length; i++) { var v = series[i] && series[i].value; if (v != null && !isNaN(v)) { vals.push(+v); idx.push(i); } }
    var n = vals.length; if (n < 10) return { ok: false };
    function segCost(a, b) { var s = vals.slice(a, b); var vr = variance(s); return s.length * Math.log(vr + 1e-6); }
    var full = segCost(0, n);
    var minSeg = 3, best = null;
    for (var k = minSeg; k <= n - minSeg; k++) {
      var cost = segCost(0, k) + segCost(k, n);
      var gain = full - cost;
      if (!best || gain > best.gain) best = { k: k, gain: gain };
    }
    var penalty = 2 * Math.log(n);                       // BIC-ish
    if (!best || best.gain < penalty) return { ok: true, found: false };
    var mL = mean(vals.slice(0, best.k)), mR = mean(vals.slice(best.k));
    return {
      ok: true, found: true,
      atIndex: idx[best.k],                              // index in the ORIGINAL series
      daysAgo: series.length - 1 - idx[best.k],
      direction: mR > mL ? 'up' : 'down',
      magnitude: Math.abs(mR - mL), gain: best.gain,
    };
  }

  // =========================================================================
  // 3 — CRITICAL SLOWING DOWN early-warning indicators.
  // Rolling windows of lag-1 autocorrelation and variance; a rising trend in
  // BOTH (Kendall τ > 0) is the hallmark of a system losing resilience and
  // approaching a critical transition. destab ∈ [0,1] blends the two.
  // =========================================================================
  function criticalSlowing(series, win) {
    win = win || 7;
    var y = interpolate(series);
    if (y.length < win + 6) return { ok: false };
    var ar1 = [], vars = [];
    for (var s = 0; s + win <= y.length; s++) {
      var w = y.slice(s, s + win);
      vars.push(variance(w));
      // lag-1 autocorrelation within the window
      var a = w.slice(0, -1), b = w.slice(1);
      var ma = mean(a), mb = mean(b), num = 0, da = 0, db = 0;
      for (var i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) * (a[i] - ma); db += (b[i] - mb) * (b[i] - mb); }
      ar1.push((da && db) ? num / Math.sqrt(da * db) : 0);
    }
    if (ar1.length < 4) return { ok: false };
    var tauAr = kendallTau(ar1), tauVar = kendallTau(vars);
    // Both must be rising to count as destabilisation; clamp negatives to 0.
    var destab = clamp((Math.max(0, tauAr) + Math.max(0, tauVar)) / 2, 0, 1);
    return {
      ok: true,
      tauAutocorr: tauAr, tauVariance: tauVar,
      destabilization: destab,
      rising: tauAr > 0.3 && tauVar > 0.3,               // both clearly up
      ar1Now: ar1[ar1.length - 1],
    };
  }

  // =========================================================================
  // 4 — GAUSSIAN GRAPHICAL MODEL: regularised partial-correlation network.
  // Input: an m×k matrix of complete-case, standardised columns + labels.
  // Precision = (Σ + λI)⁻¹; partial corr pᵢⱼ = −Pᵢⱼ/√(PᵢᵢPⱼⱼ); node strength =
  // Σⱼ|pᵢⱼ|. The most central node is the most systemically connected factor.
  // =========================================================================
  function ggmCentrality(X, labels) {
    var m = X.length; if (!m) return { ok: false };
    var k = X[0].length; if (k < 3 || m < k + 2) return { ok: false };
    // covariance of standardised columns
    var Xt = transpose(X);
    var cov = zeros(k, k);
    for (var i = 0; i < k; i++) for (var j = i; j < k; j++) {
      var s = 0; for (var r = 0; r < m; r++) s += Xt[i][r] * Xt[j][r];
      cov[i][j] = cov[j][i] = s / (m - 1);
    }
    for (var d = 0; d < k; d++) cov[d][d] += 0.1;        // ridge → invertible & stable
    var P = inv(cov); if (!P) return { ok: false };
    var strength = new Array(k).fill(0);
    var edges = [];
    for (var a = 0; a < k; a++) for (var b = a + 1; b < k; b++) {
      var pc = -P[a][b] / Math.sqrt(P[a][a] * P[b][b]);
      strength[a] += Math.abs(pc); strength[b] += Math.abs(pc);
      if (Math.abs(pc) >= 0.12) edges.push({ from: labels[a], to: labels[b], weight: pc });
    }
    var nodes = labels.map(function (l, i2) { return { label: l, strength: strength[i2] }; })
      .sort(function (p, q) { return q.strength - p.strength; });
    return { ok: true, nodes: nodes, edges: edges, central: nodes[0] };
  }

  // =========================================================================
  // 5 — MAHALANOBIS multivariate anomaly. d² = xᵀΣ⁻¹x for each standardised
  // row; flags days abnormal across streams jointly. χ²(k) tail → outlier.
  // =========================================================================
  var CHI2_975 = { 3: 9.35, 4: 11.14, 5: 12.83, 6: 14.45, 7: 16.01, 8: 17.53 };
  function mahalanobis(X, labels, dates) {
    var m = X.length; if (!m) return { ok: false };
    var k = X[0].length; if (k < 3 || m < k + 3) return { ok: false };
    var Xt = transpose(X);
    var cov = zeros(k, k);
    for (var i = 0; i < k; i++) for (var j = i; j < k; j++) {
      var s = 0; for (var r = 0; r < m; r++) s += Xt[i][r] * Xt[j][r];
      cov[i][j] = cov[j][i] = s / (m - 1);
    }
    for (var d = 0; d < k; d++) cov[d][d] += 1e-3;
    var Si = inv(cov); if (!Si) return { ok: false };
    var thr = CHI2_975[k] || (k * 2.5);
    var worst = null;
    for (var row = 0; row < m; row++) {
      var x = X[row], d2 = 0;
      for (var a = 0; a < k; a++) { var acc = 0; for (var b = 0; b < k; b++) acc += Si[a][b] * x[b]; d2 += x[a] * acc; }
      if (!worst || d2 > worst.d2) {
        // which dimension contributed most to the distance
        var contrib = x.map(function (v, ci) { return { label: labels[ci], v: Math.abs(v) }; }).sort(function (p, q) { return q.v - p.v; });
        worst = { d2: d2, row: row, date: dates ? dates[row] : null, driver: contrib[0] && contrib[0].label };
      }
    }
    return { ok: true, maxD2: worst.d2, threshold: thr, outlier: worst.d2 > thr, date: worst.date, driver: worst.driver };
  }

  // =========================================================================
  // 6 — SAMPLE ENTROPY (m=2). Regularity of a signal: lower = more
  // self-similar/predictable, higher = more erratic. r = 0.2·SD.
  // =========================================================================
  function sampleEntropy(series, m, r) {
    var y = interpolate(series);
    var N = y.length; if (N < 12) return { ok: false };
    m = m || 2; r = r || 0.2 * (sd(y) || 1);
    function count(mm) {
      var c = 0;
      for (var i = 0; i + mm <= N; i++) {
        for (var j = i + 1; j + mm <= N; j++) {
          var ok = true;
          for (var p = 0; p < mm; p++) { if (Math.abs(y[i + p] - y[j + p]) > r) { ok = false; break; } }
          if (ok) c++;
        }
      }
      return c;
    }
    var B = count(m), A = count(m + 1);
    if (B === 0 || A === 0) return { ok: true, entropy: null, note: 'degenerate' };
    var e = -Math.log(A / B);
    return { ok: true, entropy: e, erratic: e > 1.6, veryRegular: e < 0.7 };
  }

  // =========================================================================
  // 7 — LOMB–SCARGLE periodogram for unevenly-sampled data. Scans candidate
  // periods (2–14 days), returns the dominant one with a false-alarm prob.
  // =========================================================================
  function lombScargle(series) {
    var t = [], y = [];
    for (var i = 0; i < series.length; i++) { var v = series[i] && series[i].value; if (v != null && !isNaN(v)) { t.push(i); y.push(+v); } }
    var n = y.length; if (n < 10) return { ok: false };
    var my = mean(y), vy = variance(y); if (vy < 1e-9) return { ok: false };
    var yc = y.map(function (v) { return v - my; });
    var periods = []; for (var P = 2; P <= 14; P += 0.5) periods.push(P);
    var best = null;
    periods.forEach(function (P) {
      var w = 2 * Math.PI / P;
      var s2 = 0, c2 = 0;
      for (var i2 = 0; i2 < n; i2++) { s2 += Math.sin(2 * w * t[i2]); c2 += Math.cos(2 * w * t[i2]); }
      var tau = Math.atan2(s2, c2) / (2 * w);
      var num1 = 0, den1 = 0, num2 = 0, den2 = 0;
      for (var j = 0; j < n; j++) {
        var co = Math.cos(w * (t[j] - tau)), si = Math.sin(w * (t[j] - tau));
        num1 += yc[j] * co; den1 += co * co;
        num2 += yc[j] * si; den2 += si * si;
      }
      var power = 0.5 * ((den1 ? num1 * num1 / den1 : 0) + (den2 ? num2 * num2 / den2 : 0)) / vy;
      if (!best || power > best.power) best = { period: P, power: power };
    });
    // false-alarm probability across M independent frequencies
    var M = periods.length;
    var fap = 1 - Math.pow(1 - Math.exp(-best.power), M);
    return { ok: true, period: best.period, power: best.power, fap: fap, significant: fap < 0.1 };
  }

  // =========================================================================
  // 8 — RAYLEIGH test (circular statistics). Given event hours (0–23), is the
  // timing concentrated at a preferred hour, or uniform around the clock?
  // =========================================================================
  function rayleigh(hours) {
    var n = hours.length; if (n < 6) return { ok: false };
    var C = 0, Sm = 0;
    hours.forEach(function (h) { var a = 2 * Math.PI * (h % 24) / 24; C += Math.cos(a); Sm += Math.sin(a); });
    C /= n; Sm /= n;
    var R = Math.sqrt(C * C + Sm * Sm);                  // resultant length 0..1
    var Z = n * R * R;
    // Zar's approximation to the Rayleigh p-value
    var p = Math.exp(-Z) * (1 + (2 * Z - Z * Z) / (4 * n) - (24 * Z - 132 * Z * Z + 76 * Z * Z * Z - 9 * Z * Z * Z * Z) / (288 * n * n));
    p = clamp(p, 0, 1);
    var ang = Math.atan2(Sm, C); if (ang < 0) ang += 2 * Math.PI;
    var hour = ang / (2 * Math.PI) * 24;
    return { ok: true, R: R, p: p, concentrated: p < 0.05 && R > 0.35, peakHour: hour };
  }

  window.SynthLab = {
    // linear algebra (exposed for reuse/tests)
    inv: inv, matMul: matMul, transpose: transpose, kendallTau: kendallTau, interpolate: interpolate,
    // analyses
    kalmanTrend: kalmanTrend,
    changePoint: changePoint,
    criticalSlowing: criticalSlowing,
    ggmCentrality: ggmCentrality,
    mahalanobis: mahalanobis,
    sampleEntropy: sampleEntropy,
    lombScargle: lombScargle,
    rayleigh: rayleigh,
  };
})();
