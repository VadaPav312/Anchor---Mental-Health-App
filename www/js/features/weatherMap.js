// ===========================================================================
// weatherMap.js — Emotional Weather Map. The showpiece screen.
//
// A living landscape built from 42 days of valence history. A hero canvas
// draws generative terrain shaped by your mood series with a sky matching
// today's emotional weather. Below it: the climate strip (tapable day cells),
// peel-back layers panel, forecast, seasons summary, and legend.
// ===========================================================================
(function () {
  // ---- module state --------------------------------------------------------
  let _resizeHandler = null;
  let _animFrame = null;
  let _selectedDk = null;
  let _peelRoot = null;
  let _stripEl = null;

  // ---- constants -----------------------------------------------------------
  const WX_CODES = ['sun', 'clear', 'cloud', 'fog', 'rain', 'storm'];
  const HISTORY_DAYS = 42;
  const FORECAST_DAYS = 3;
  const TREND_DAYS = 10;
  const STAR_COUNT = 60;
  const CLOUD_COUNT = 4;
  const RAIN_STREAK_COUNT = 60;

  // ---- helpers -------------------------------------------------------------
  function dkWeekday(dk) {
    try {
      return Store.keyToDate(dk).toLocaleDateString(
        (window.I18N && I18N.lang) || 'en',
        { weekday: 'short' }
      );
    } catch { return ''; }
  }

  function dkDayNum(dk) {
    try { return String(Store.keyToDate(dk).getDate()); } catch { return ''; }
  }

  function valenceLabel(v) {
    if (v == null) return t('wx.noEntry');
    if (v <= -1.4) return t('chk.veryLow');
    if (v <= -0.5) return t('chk.low');
    if (v < 0.5) return t('chk.ok');
    if (v < 1.4) return t('chk.good');
    return t('chk.great');
  }

  // Linear regression slope over an array of {value} objects (nulls skipped).
  function linearSlope(points) {
    const pts = points.filter(p => p.value != null && !isNaN(p.value));
    if (pts.length < 2) return 0;
    const n = pts.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    pts.forEach((p, i) => {
      sumX += i; sumY += p.value; sumXY += i * p.value; sumXX += i * i;
    });
    const denom = n * sumXX - sumX * sumX;
    return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  }

  function avg(pts) {
    const vs = pts.filter(p => p.value != null && !isNaN(p.value)).map(p => p.value);
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Sky gradient stops per weather code.
  function skyGradient(wx) {
    const h = new Date().getHours();
    const night = h < 6 || h >= 21;
    const dusk  = (h >= 18 && h < 21) || (h >= 5 && h < 7);
    switch (wx) {
      case 'sun':
        if (night) return ['#0d0a2e', '#1a1050'];
        if (dusk)  return ['#ff6b35', '#ff9e5e', '#ffcc88'];
        return ['#87CEEB', '#ffd780', '#ffe9b0'];
      case 'clear':
        if (night) return ['#0a0e2a', '#1c2860'];
        if (dusk)  return ['#ff8c5a', '#ffb88c', '#ffe0c0'];
        return ['#4a90d9', '#6eb3f7', '#b8daff'];
      case 'cloud':
        if (night) return ['#0c0f1e', '#1a1e33'];
        return ['#5a6a88', '#8a9bb8', '#b8c8d8'];
      case 'fog':
        return night ? ['#111520', '#1e2333'] : ['#8a96aa', '#b4bccb', '#d0d8e4'];
      case 'rain':
        return night ? ['#0a0f20', '#141e38'] : ['#2e3d5a', '#4a5d80', '#6a80a8'];
      case 'storm':
        return ['#0d0a1e', '#1a143c', '#2a1e50'];
      default:
        return night ? ['#0a0e22', '#14183a'] : ['#4466aa', '#6688cc'];
    }
  }

  // Terrain tint per average climate code.
  function climateTint(wx) {
    switch (wx) {
      case 'sun':   return { r: 255, g: 200, b: 80,  a: 0.25 };
      case 'clear': return { r: 80,  g: 160, b: 255, a: 0.20 };
      case 'cloud': return { r: 110, g: 125, b: 160, a: 0.20 };
      case 'fog':   return { r: 160, g: 170, b: 190, a: 0.18 };
      case 'rain':  return { r: 60,  g: 90,  b: 160, a: 0.22 };
      case 'storm': return { r: 60,  g: 50,  b: 130, a: 0.25 };
      default:      return { r: 100, g: 120, b: 160, a: 0.18 };
    }
  }

  // ---- CANVAS: generative landscape ----------------------------------------
  function drawLandscape(canvas, series, todayWx) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Sky gradient
    const stops = skyGradient(todayWx);
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.72);
    stops.forEach((c, i) => skyGrad.addColorStop(i / (stops.length - 1), c));
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Build height map from valence series (fill gaps with last known value).
    const vals = series.map(p => p.value);
    let lastKnown = 0;
    const filled = vals.map(v => {
      if (v != null && !isNaN(v)) { lastKnown = v; return v; }
      return lastKnown;
    });

    // Smooth with a simple 5-point moving average for organic feel.
    const smoothed = filled.map((_, i) => {
      let sum = 0, cnt = 0;
      for (let k = -2; k <= 2; k++) {
        const idx = i + k;
        if (idx >= 0 && idx < filled.length) { sum += filled[idx]; cnt++; }
      }
      return sum / cnt;
    });

    // Convert valence (-2..2) to terrain height (0..1, higher=better mood).
    const toH = v => clamp((v + 2) / 4, 0, 1);
    const terrainH = smoothed.map(toH);

    // Draw back range (distant mountains — muted).
    drawTerrain(ctx, W, H, terrainH, {
      yBase: H,
      yAmpFactor: 0.38,
      yOffset: H * 0.52,
      simplify: 2,
      colorTop: 'rgba(30,40,80,0.55)',
      colorBot: 'rgba(15,20,50,0.85)',
    });

    // Draw mid range.
    drawTerrain(ctx, W, H, terrainH, {
      yBase: H,
      yAmpFactor: 0.30,
      yOffset: H * 0.62,
      simplify: 1,
      colorTop: 'rgba(20,35,70,0.72)',
      colorBot: 'rgba(10,18,45,0.95)',
    });

    // Draw foreground hills (most expressive — tallest for happiest days).
    const tint = climateTint(todayWx);
    const fgTop = `rgba(${tint.r},${tint.g},${tint.b},${tint.a + 0.18})`;
    const fgBot = `rgba(${Math.round(tint.r * 0.3)},${Math.round(tint.g * 0.3)},${Math.round(tint.b * 0.35)},0.98)`;
    drawTerrain(ctx, W, H, terrainH, {
      yBase: H,
      yAmpFactor: 0.24,
      yOffset: H * 0.73,
      simplify: 0,
      colorTop: fgTop,
      colorBot: fgBot,
    });

    // Atmospheric haze at horizon.
    const haze = ctx.createLinearGradient(0, H * 0.48, 0, H * 0.68);
    haze.addColorStop(0, 'rgba(180,200,255,0.0)');
    haze.addColorStop(0.5, 'rgba(140,180,255,0.07)');
    haze.addColorStop(1, 'rgba(100,140,220,0.0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, H * 0.48, W, H * 0.20);
  }

  function drawTerrain(ctx, W, H, heightMap, opts) {
    const { yBase, yAmpFactor, yOffset, simplify, colorTop, colorBot } = opts;
    const amp = H * yAmpFactor;
    const n = heightMap.length;
    const step = simplify > 0 ? Math.max(1, simplify) : 1;

    // Build spline control points across the width.
    const pts = [];
    for (let i = 0; i < n; i += step) {
      const x = (i / (n - 1)) * W;
      const y = yOffset - heightMap[i] * amp;
      pts.push({ x, y });
    }
    if (!pts.length) return;

    // Draw filled silhouette.
    ctx.beginPath();
    ctx.moveTo(0, yBase);
    ctx.lineTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur  = pts[i];
      const mx   = (prev.x + cur.x) / 2;
      ctx.bezierCurveTo(mx, prev.y, mx, cur.y, cur.x, cur.y);
    }

    ctx.lineTo(W, yBase);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, yOffset - amp, 0, yBase);
    grad.addColorStop(0, colorTop);
    grad.addColorStop(1, colorBot);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // ---- HERO SCENE ----------------------------------------------------------
  function buildScene(todayMood, series) {
    const wx = todayMood ? todayMood.weather : 'cloud';
    const h  = new Date().getHours();
    const isNight = h < 6 || h >= 21;

    const scene = UI.el('div', { class: 'weather-scene', 'data-wx': wx });

    // Canvas for generative landscape.
    const canvas = UI.el('canvas', { class: 'weather-canvas' });
    scene.appendChild(canvas);

    // Sky overlay div (subtle gradient on top of canvas).
    const sky = UI.el('div', { class: 'weather-sky' });
    scene.appendChild(sky);

    // Celestial body: sun or moon + stars.
    if (isNight) {
      const moon = UI.el('div', { class: 'wx-moon' });
      moon.style.cssText = 'top:12%;right:15%;position:absolute;z-index:2';
      scene.appendChild(moon);

      const starsEl = UI.el('div', { class: 'wx-stars', style: { position: 'absolute', inset: '0', zIndex: '1', pointerEvents: 'none' } });
      for (let i = 0; i < STAR_COUNT; i++) {
        const s = UI.el('i');
        s.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 65}%;animation-duration:${2 + Math.random() * 3}s;animation-delay:${Math.random() * 4}s`;
        starsEl.appendChild(s);
      }
      scene.appendChild(starsEl);
    } else {
      const sun = UI.el('div', { class: 'wx-sun' });
      const pct = clamp(((h - 6) / 14) * 100, 5, 92);
      // Arc: peak at noon, use parabola for vertical position.
      const arc = 1 - Math.pow((pct / 100 - 0.5) * 2, 2);
      sun.style.cssText = `left:${pct}%;top:${clamp(8 - arc * 10, 4, 22)}%;transform:translateX(-50%);position:absolute;z-index:2`;
      scene.appendChild(sun);
    }

    // Cloud layer.
    if (wx === 'cloud' || wx === 'fog' || wx === 'rain' || wx === 'storm') {
      const cloudsEl = UI.el('div', { class: 'wx-clouds' });
      const count = wx === 'storm' ? CLOUD_COUNT + 2 : wx === 'rain' ? CLOUD_COUNT + 1 : CLOUD_COUNT;
      for (let i = 0; i < count; i++) {
        const c = UI.el('div', { class: 'wx-cloud' });
        const w = 100 + Math.random() * 180;
        const opacity = wx === 'fog' ? 0.55 + Math.random() * 0.3 : 0.28 + Math.random() * 0.32;
        const top = 8 + Math.random() * 35;
        const dur = 28 + Math.random() * 40;
        const delay = -Math.random() * dur;
        c.style.cssText = `width:${w}px;height:${Math.round(w * 0.38)}px;top:${top}%;animation-duration:${dur}s;animation-delay:${delay}s;opacity:${opacity};z-index:2`;
        cloudsEl.appendChild(c);
      }
      scene.appendChild(cloudsEl);
    }

    // Rain streaks.
    if (wx === 'rain' || wx === 'storm') {
      const rainEl = UI.el('div', { class: 'wx-rain' });
      for (let i = 0; i < RAIN_STREAK_COUNT; i++) {
        const r = UI.el('i');
        r.style.cssText = `left:${Math.random() * 100}%;animation-duration:${0.6 + Math.random() * 0.6}s;animation-delay:${-Math.random() * 1.2}s;height:${12 + Math.random() * 10}px`;
        rainEl.appendChild(r);
      }
      scene.appendChild(rainEl);
    }

    // Lightning bolt overlay for storm.
    if (wx === 'storm') {
      scene.appendChild(UI.el('div', { class: 'wx-bolt' }));
    }

    // Scene caption.
    const dk = Store.today();
    let dateStr = '';
    try {
      dateStr = Store.keyToDate(dk).toLocaleDateString(
        (window.I18N && I18N.lang) || 'en',
        { weekday: 'long', month: 'long', day: 'numeric' }
      );
    } catch { dateStr = dk; }

    const caption = UI.el('div', { class: 'scene-caption', style: { zIndex: '4' } }, [
      UI.el('div', { class: 'sc-weather' },
        UI.weatherEmoji(wx) + ' ' + UI.weatherName(wx)
      ),
      UI.el('div', { class: 'sc-date' }, t('wx.todayIs') + ' · ' + dateStr),
    ]);
    scene.appendChild(caption);

    // Schedule canvas resize/draw (needs to be in DOM first).
    requestAnimationFrame(() => {
      sizeCanvas(canvas);
      drawLandscape(canvas, series, wx);
    });

    return { scene, canvas, wx };
  }

  function sizeCanvas(canvas) {
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    canvas.width  = Math.round(rect.width  || parent.offsetWidth  || 360);
    canvas.height = Math.round(rect.height || parent.offsetHeight || 320);
  }

  // ---- CLIMATE STRIP -------------------------------------------------------
  function buildStrip(days, onSelect) {
    const strip = UI.el('div', { class: 'wx-strip' });

    days.forEach(({ dk, mood }) => {
      const wx = mood ? mood.weather : null;
      const isEmpty = !mood;

      const fill = UI.el('div', { class: 'wc-fill' });
      const emoji = UI.el('div', { class: 'wc-emoji' }, wx ? UI.weatherEmoji(wx) : '·');
      const dayEl = UI.el('div', { class: 'wc-day' },
        dkWeekday(dk) + ' ' + dkDayNum(dk)
      );

      const cell = UI.el('div', {
        class: 'wx-cell' + (isEmpty ? '' : ''),
        'data-wx': wx || 'cloud',
        'data-dk': dk,
        style: isEmpty ? { opacity: '0.32' } : null,
        onclick: () => {
          // Deselect previous.
          if (_stripEl) {
            _stripEl.querySelectorAll('.wx-cell.sel').forEach(c => c.classList.remove('sel'));
          }
          cell.classList.add('sel');
          UI.haptic('light');
          onSelect(dk, mood);
        },
      }, [fill, emoji, dayEl]);

      strip.appendChild(cell);
    });

    return strip;
  }

  // ---- PEEL-BACK LAYERS PANEL ----------------------------------------------
  function buildPeel(dk, mood) {
    const peel = UI.el('div', { class: 'peel' });

    // Header.
    let dateLabel = '';
    const diff = Store.diffDays(Store.today(), dk);
    if (diff === 0) dateLabel = t('app.today');
    else if (diff === 1) dateLabel = t('app.yesterday');
    else {
      try {
        dateLabel = Store.keyToDate(dk).toLocaleDateString(
          (window.I18N && I18N.lang) || 'en',
          { weekday: 'long', month: 'long', day: 'numeric' }
        );
      } catch { dateLabel = dk; }
    }

    peel.appendChild(UI.el('div', { class: 'eyebrow', style: { padding: '0 4px 6px' } },
      t('wx.layers') + ' · ' + dateLabel
    ));

    // Weather layer.
    const wx = mood ? mood.weather : null;
    peel.appendChild(peelLayer('🌤️', t('wx.layerWeather'),
      wx ? UI.weatherEmoji(wx) + ' ' + UI.weatherName(wx) : t('wx.noEntry')
    ));

    // Mood layer.
    const valLbl = mood ? valenceLabel(mood.valence) : null;
    const tagsStr = mood && mood.tags && mood.tags.length
      ? mood.tags.slice(0, 5).join(', ')
      : null;
    peel.appendChild(peelLayer('💭', t('wx.layerMood'),
      valLbl ? valLbl + (tagsStr ? ' · ' + tagsStr : '') : t('wx.noEntry')
    ));

    // Sleep layer.
    const sleepRec = Store.sleep.all().find(s => s.date === dk);
    let sleepStr = t('wx.noEntry');
    if (sleepRec) {
      const parts = [];
      if (sleepRec.score != null) parts.push(Math.round(sleepRec.score) + ' ' + t('dash.sleepScore').toLowerCase());
      if (sleepRec.durationMin) parts.push(UI.fmt.dur(sleepRec.durationMin));
      if (sleepRec.tempF != null) parts.push(UI.fmt.temp(sleepRec.tempF));
      sleepStr = parts.join(' · ') || t('wx.noEntry');
    }
    peel.appendChild(peelLayer('🌙', t('wx.layerSleep'), sleepStr));

    // Energy layer.
    const energyNet = Store.derive.metricValue('energyNet', dk);
    peel.appendChild(peelLayer('⚡', t('wx.layerEnergy'),
      energyNet != null ? UI.fmt.signed(energyNet) + ' ' + t('en.net').toLowerCase() : t('wx.noEntry')
    ));

    // Journal layer.
    const journalEntries = Store.journal.all().filter(j => j.date === dk);
    let journalSnip = t('wx.noEntry');
    if (journalEntries.length) {
      const text = journalEntries[journalEntries.length - 1].text || '';
      journalSnip = text.length > 120 ? text.slice(0, 118) + '…' : (text || t('wx.noEntry'));
    }
    peel.appendChild(peelLayer('📖', t('wx.layerJournal'), journalSnip));

    // Values layer.
    const check = Store.valuesChecks.all().find(c => c.date === dk);
    let valuesStr = t('wx.noEntry');
    if (check && check.lived && check.lived.length) {
      const allVals = Store.values.all();
      const names = check.lived
        .map(id => { const v = allVals.find(x => x.id === id); return v ? v.name : null; })
        .filter(Boolean);
      valuesStr = names.length ? names.join(', ') : t('wx.noEntry');
    }
    peel.appendChild(peelLayer('🧭', t('wx.layerValues'), valuesStr));

    // Insights layer (optional).
    const insight = Store.insights.all().find(ins => {
      if (ins.dismissed) return false;
      // Match by approximate date (within 3 days of dk).
      if (!ins.ts) return false;
      const insDate = Store.dateKey(new Date(ins.ts));
      return Math.abs(Store.diffDays(dk, insDate)) <= 3;
    });
    if (insight) {
      peel.appendChild(peelLayer('✨', t('wx.layerNote'),
        insight.text || t('wx.noEntry')
      ));
    }

    return peel;
  }

  function peelLayer(icon, label, value) {
    return UI.el('div', { class: 'peel-layer' }, [
      UI.el('div', { class: 'pl-ico' }, icon),
      UI.el('div', { class: 'col gap1', style: { flex: '1', minWidth: '0' } }, [
        UI.el('div', { class: 'pl-k' }, label),
        UI.el('div', { class: 'pl-v' }, value),
      ]),
    ]);
  }

  // ---- FORECAST ------------------------------------------------------------
  function buildForecast(series) {
    const wrap = UI.el('div', {}, [
      UI.el('div', { class: 'eyebrow mb2' }, t('wx.forecast')),
    ]);

    const recent = series.slice(-TREND_DAYS);
    const slope = linearSlope(recent);
    const meanValence = avg(recent);
    const baseValence = meanValence != null ? meanValence : 0;

    const fcStrip = UI.el('div', { class: 'forecast' });

    for (let i = 1; i <= FORECAST_DAYS; i++) {
      const dk = Store.daysAgoKey(-i); // future key
      let weekday = '';
      try {
        weekday = Store.keyToDate(dk).toLocaleDateString(
          (window.I18N && I18N.lang) || 'en',
          { weekday: 'short' }
        );
      } catch { weekday = '+' + i; }

      // Project valence: base + slope * i, clamped to [-2, 2].
      const projected = clamp(baseValence + slope * i, -2, 2);
      const wx = Store.weatherFor(projected, 5);

      // Confidence decays with distance and is tempered by data sparsity.
      const hasDataRatio = recent.filter(p => p.value != null).length / TREND_DAYS;
      const confidence = Math.round(clamp((80 - i * 14) * hasDataRatio, 20, 80));

      const cell = UI.el('div', { class: 'fc-day', 'data-wx': wx }, [
        UI.el('div', { class: 'fc-emoji' }, UI.weatherEmoji(wx)),
        UI.el('div', { class: 'fc-lbl' }, weekday),
        UI.el('div', { class: 'fc-conf' }, confidence + '%'),
      ]);
      fcStrip.appendChild(cell);
    }

    wrap.appendChild(fcStrip);
    wrap.appendChild(UI.el('div', { class: 'small soft mt2', style: { lineHeight: '1.5', fontStyle: 'italic' } },
      t('wx.forecastNote')
    ));

    return wrap;
  }

  // ---- SEASONS SUMMARY -----------------------------------------------------
  function buildSeasons(days) {
    const hasMood = days.filter(d => d.mood);
    if (hasMood.length < 2) return null;

    // Count codes.
    const codeCounts = {};
    WX_CODES.forEach(c => { codeCounts[c] = 0; });
    hasMood.forEach(d => { if (d.mood) codeCounts[d.mood.weather]++; });

    // Longest clear streak (sun + clear).
    let maxStreak = 0, curStreak = 0;
    days.forEach(d => {
      if (d.mood && (d.mood.weather === 'sun' || d.mood.weather === 'clear')) {
        curStreak++;
        if (curStreak > maxStreak) maxStreak = curStreak;
      } else {
        curStreak = 0;
      }
    });

    // Dominant code.
    let dominant = 'cloud', dominantCount = 0;
    WX_CODES.forEach(c => { if (codeCounts[c] > dominantCount) { dominantCount = codeCounts[c]; dominant = c; } });

    const stormRain = (codeCounts['storm'] || 0) + (codeCounts['rain'] || 0);
    const brightClear = (codeCounts['sun'] || 0) + (codeCounts['clear'] || 0);

    const lines = [];
    if (maxStreak >= 3) {
      lines.push(UI.el('div', { class: 'small soft' },
        UI.weatherEmoji('sun') + ' ' +
        t('wx.seasonsTitle') + ' · ' +
        brightClear + ' ' + t('wx.weatherClear').toLowerCase() + ', ' +
        stormRain + ' ' + t('wx.weatherStorm').toLowerCase()
      ));
    } else {
      lines.push(UI.el('div', { class: 'small soft' },
        UI.weatherEmoji(dominant) + ' ' +
        t('wx.seasonsTitle') + ' · ' + UI.weatherName(dominant)
      ));
    }

    if (maxStreak >= 3) {
      lines.push(UI.el('div', { class: 'small soft mt1', style: { color: 'var(--a1)' } },
        '☀️ ' + maxStreak + '-' + t('app.day') + ' ' + t('wx.weatherClear').toLowerCase() + ' ' + t('app.days').toLowerCase()
      ));
    }

    const card = UI.el('div', { class: 'glass-card card-tight col gap1' }, lines);
    return card;
  }

  // ---- STORM RESILIENCE LINE -----------------------------------------------
  function buildResilienceLine(days) {
    const stormCount = days.filter(d => d.mood &&
      (d.mood.weather === 'storm' || d.mood.weather === 'rain')
    ).length;

    if (stormCount === 0) return null;

    return UI.el('div', {
      class: 'glass-card card',
      style: {
        background: 'linear-gradient(135deg,rgba(80,60,160,0.22),rgba(40,40,100,0.15))',
        borderColor: 'rgba(120,100,220,0.35)',
        textAlign: 'center',
        padding: 'var(--s4)',
      },
    }, [
      UI.el('div', { style: { fontSize: '1.8rem', marginBottom: '6px' } }, '⛈️'),
      UI.el('div', { class: 'b', style: { fontSize: '1.05rem', lineHeight: '1.5' } },
        t('wx.survived', { n: stormCount })
      ),
    ]);
  }

  // ---- LEGEND --------------------------------------------------------------
  function buildLegend() {
    const legend = UI.el('div', { class: 'wx-legend mt2' });
    const dotColors = {
      sun:   '#ffcf6e',
      clear: '#6f8bff',
      cloud: '#9aa6c8',
      fog:   '#b9c0d4',
      rain:  '#6f88c9',
      storm: '#5b5f9a',
    };
    WX_CODES.forEach(code => {
      const item = UI.el('div', { class: 'lg' }, [
        UI.el('b', { style: { background: dotColors[code] } }),
        UI.el('span', {}, UI.weatherEmoji(code) + ' ' + UI.weatherName(code)),
      ]);
      legend.appendChild(item);
    });
    return legend;
  }

  // ---- EMPTY STATE ---------------------------------------------------------
  function buildEmpty(root) {
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('div', { class: 'eyebrow' }, t('nav.weather')),
      UI.el('h1', { class: 'page-title serif' }, t('wx.title')),
      UI.el('div', { class: 'small soft mt1' }, t('wx.sub')),
    ]));
    root.appendChild(UI.empty('🌱', t('wx.noHistory'), t('wx.noHistorySub')));
  }

  // ---- MAIN RENDER ---------------------------------------------------------
  function render(root) {
    // Gather history.
    const historyDays = Store.derive.historyDays();
    if (historyDays < 2) {
      buildEmpty(root);
      return;
    }

    const todayDk   = Store.today();
    const todayMood = Store.derive.dayMood(todayDk);

    // Build 42-day series for canvas.
    const valSeries = Store.derive.series('valence', HISTORY_DAYS);

    // Build per-day array for the strip.
    const days = valSeries.map(p => ({
      dk:   p.date,
      mood: Store.derive.dayMood(p.date),
    }));

    // Page header.
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('div', { class: 'eyebrow' }, t('nav.weather')),
      UI.el('h1', { class: 'page-title serif' }, t('wx.title')),
      UI.el('div', { class: 'small soft mt1' }, t('wx.sub')),
    ]));

    const col = UI.el('div', { class: 'col gap4 stagger' });
    root.appendChild(col);

    // 1. Hero scene.
    const { scene, canvas, wx: todayWx } = buildScene(todayMood, valSeries);
    scene.style.minHeight = '280px';
    // Set body ambient tint.
    document.body.setAttribute('data-weather', todayWx);
    col.appendChild(scene);

    // Store canvas ref for onShow redraws.
    root._wxCanvas  = canvas;
    root._wxSeries  = valSeries;
    root._wxTodayWx = todayWx;

    // 2. Resilience line.
    const resLine = buildResilienceLine(days);
    if (resLine) col.appendChild(resLine);

    // 3. Climate strip.
    const stripSection = UI.el('div', { class: 'col gap2' }, [
      UI.el('div', { class: 'eyebrow' }, t('wx.climate')),
      UI.el('div', { class: 'small soft' }, t('wx.explore')),
    ]);

    _peelRoot = UI.el('div', { class: 'col gap2', style: { marginTop: 'var(--s2)' } });
    _peelRoot.style.display = 'none';

    const strip = buildStrip(days, (dk, mood) => {
      _selectedDk = dk;
      // Re-render peel panel.
      UI.clear(_peelRoot);
      _peelRoot.style.display = '';
      _peelRoot.appendChild(buildPeel(dk, mood));
      _peelRoot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    _stripEl = strip;

    stripSection.appendChild(strip);
    col.appendChild(stripSection);

    // Scroll to today (rightmost).
    requestAnimationFrame(() => {
      strip.scrollLeft = strip.scrollWidth;
    });

    // 4. Peel panel (hidden until a day is selected).
    col.appendChild(_peelRoot);

    // 5. Forecast.
    col.appendChild(buildForecast(valSeries));

    // 6. Seasons.
    const seasons = buildSeasons(days);
    if (seasons) {
      const seasonsWrap = UI.el('div', { class: 'col gap2' }, [
        seasons,
      ]);
      col.appendChild(seasonsWrap);
    }

    // 7. Legend.
    col.appendChild(UI.el('div', { class: 'col gap2' }, [
      UI.el('div', { class: 'eyebrow' }, t('wx.climate') + ' · Legend'),
      buildLegend(),
    ]));
  }

  // ---- onShow --------------------------------------------------------------
  function onShow() {
    // Find the active view container (whatever has the canvas).
    const canvas = document.querySelector('.weather-canvas');
    if (!canvas) return;

    // Resize + redraw.
    const doRedraw = () => {
      sizeCanvas(canvas);
      const series = canvas.closest('[data-weather]') && window._wxCachedSeries
        ? window._wxCachedSeries
        : Store.derive.series('valence', HISTORY_DAYS);
      const wx = document.body.getAttribute('data-weather') || 'cloud';
      drawLandscape(canvas, series, wx);
    };

    doRedraw();

    // Remove any previous resize listener.
    if (_resizeHandler) {
      window.removeEventListener('resize', _resizeHandler);
      _resizeHandler = null;
    }

    // Register fresh resize listener.
    _resizeHandler = () => {
      if (_animFrame) cancelAnimationFrame(_animFrame);
      _animFrame = requestAnimationFrame(doRedraw);
    };
    window.addEventListener('resize', _resizeHandler);
  }

  // ---- cleanup on navigate away (best-effort) -----------------------------
  // We piggyback on Anchor's handler — if onHide is ever supported we'd use it.
  // For now, the resize listener is cleaned on the next onShow call.

  Anchor.register({
    id:       'weather',
    labelKey: 'nav.weather',
    icon:     'weather',
    order:    20,
    tab:      true,
    render,
    onShow,
  });
})();
