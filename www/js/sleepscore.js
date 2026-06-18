// ===========================================================================
// sleepscore.js — pure scoring helpers for the sleep journal.
//
// They take plain numbers and return 0–100 scores, so the manual "add a night"
// form and the demo seed data compute consistent scores with no hardware.
//   SleepScore.environment({ tempF, humidity, lightLux, noiseDb }) -> 0..100|null
//   SleepScore.sleep({ durationMin, envScore, awakenings, motion }) -> 0..100
// ===========================================================================
(function () {
  // 0-100 environment quality from how close conditions sit to restful ranges.
  function environment(e) {
    let pts = 0, n = 0;
    function band(v, lo, hi, soft) {
      if (v == null) return;
      n++;
      if (v >= lo && v <= hi) pts += 1;
      else { const d = v < lo ? lo - v : v - hi; pts += Math.max(0, 1 - d / soft); }
    }
    band(e.tempF, 64, 70, 8);
    band(e.humidity, 35, 55, 20);
    band(e.lightLux, 0, 8, 20);
    band(e.noiseDb, 0, 35, 25);
    return n ? Math.round((pts / n) * 100) : null;
  }

  function sleep(s) {
    const durPts = Math.min(1, (s.durationMin || 0) / 480) * 45;        // up to 8h
    const envPts = ((s.envScore != null ? s.envScore : 60) / 100) * 35;
    const wakePen = Math.min(15, (s.awakenings || 0) * 4);
    const motionPen = Math.min(5, (s.motion || 0) / 40);
    return Math.max(0, Math.min(100, Math.round(durPts + envPts + (20 - wakePen) - motionPen)));
  }

  window.SleepScore = { environment, sleep };
})();
