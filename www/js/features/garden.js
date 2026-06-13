// ===========================================================================
// garden.js — "Your Garden": a growth visualization of everything tended.
// A nighttime garden / constellation canvas that grows with usage, stats grid,
// milestones, and a footer. Registers as a non-tab extra view.
// ===========================================================================
(function () {

  // ---- session-new milestone tracking (simple flag set per page-load) ------
  var _justUnlocked = new Set();

  // ---- data helpers --------------------------------------------------------

  function countCheckins() {
    return Store.moods.count();
  }

  function countNights() {
    return Store.sleep.count();
  }

  function countWords() {
    var entries = Store.journal.all();
    var total = 0;
    for (var i = 0; i < entries.length; i++) {
      var text = entries[i].text;
      if (text && typeof text === 'string') {
        var words = text.trim().split(/\s+/);
        if (words.length > 0 && words[0] !== '') total += words.length;
      }
    }
    return total;
  }

  function countExperimentsDone() {
    var exps = Store.experiments.all();
    var n = 0;
    for (var i = 0; i < exps.length; i++) {
      var e = exps[i];
      if (e.status === 'done' || e.status === 'completed' || e.status === 'running' || (e.logs && e.logs.length > 0)) {
        n++;
      }
    }
    return n;
  }

  function countStormDays() {
    // Walk every distinct date in moods, compute dayMood, count rain/storm
    var dates = new Set();
    var moods = Store.moods.all();
    for (var i = 0; i < moods.length; i++) {
      if (moods[i].date) dates.add(moods[i].date);
    }
    var n = 0;
    dates.forEach(function (dk) {
      var m = Store.derive.dayMood(dk);
      if (m && (m.weather === 'storm' || m.weather === 'rain')) n++;
    });
    return n;
  }

  function countValuesLived() {
    var checks = Store.valuesChecks.all();
    var total = 0;
    for (var i = 0; i < checks.length; i++) {
      var lived = checks[i].lived;
      if (Array.isArray(lived)) total += lived.length;
    }
    return total;
  }

  function longestStreak() {
    return Store.get('gamification.longest', 0);
  }

  function daysSinceStart() {
    var profile = Store.profile.get();
    if (!profile || !profile.createdAt) return 0;
    var created = new Date(profile.createdAt);
    var now = new Date();
    var diff = Math.floor((now - created) / 86400000);
    return Math.max(0, diff);
  }

  function totalEngagement() {
    return countCheckins() + countNights() + Store.journal.count();
  }

  // ---- deterministic PRNG (seeded per-index so plants are stable) ----------

  function seededRand(seed) {
    // xorshift32 — cheap, no imports
    var x = (seed >>> 0) || 0xcafebabe;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return ((x >>> 0) / 4294967296);
  }

  function rand2(seed, a) {
    // second pull from same seed block
    return seededRand(seededRand(seed) * 0xffffffff + a);
  }

  // ---- canvas drawing ------------------------------------------------------

  var _resizeHandler = null;

  function drawGarden(canvas, plantCount) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Size canvas to its CSS size for crisp rendering
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = rect.width || canvas.parentElement.offsetWidth || 320;
    var h = rect.height || canvas.parentElement.offsetHeight || 280;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    // --- background: deep night gradient (CSS handles base, we add stars) ---

    // Distant tiny stars (background layer)
    var starCount = Math.max(40, plantCount * 3 + 60);
    for (var s = 0; s < starCount; s++) {
      var sx = seededRand(s * 7 + 1) * w;
      var sy = seededRand(s * 7 + 2) * h * 0.75; // stars in upper 75%
      var sr = seededRand(s * 7 + 3) * 1.2 + 0.2;
      var sa = seededRand(s * 7 + 4) * 0.5 + 0.3;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200,220,255,' + sa + ')';
      ctx.fill();
    }

    // Ground silhouette
    var groundY = h * 0.72;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    // gentle undulating horizon
    var step = w / 6;
    for (var gx = 0; gx <= w; gx += step) {
      var gy = groundY + seededRand(gx + 999) * 12 - 6;
      ctx.lineTo(gx, gy);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    var groundGrad = ctx.createLinearGradient(0, groundY, 0, h);
    groundGrad.addColorStop(0, 'rgba(10,28,60,0.92)');
    groundGrad.addColorStop(1, 'rgba(5,14,35,1)');
    ctx.fillStyle = groundGrad;
    ctx.fill();

    if (plantCount === 0) {
      // empty state: a single small seedling silhouette
      _drawSeedling(ctx, w / 2, groundY, 0.5);
      return;
    }

    // --- constellation lines (connect nearby "plants" as star links) --------
    var plants = [];
    var spread = plantCount;
    for (var i = 0; i < spread; i++) {
      var px = seededRand(i * 13 + 3) * w * 0.88 + w * 0.06;
      var py = seededRand(i * 13 + 7) * h * 0.60 + h * 0.04;
      var psize = seededRand(i * 13 + 11) * 2.2 + 0.8;
      var phue = Math.floor(seededRand(i * 13 + 5) * 80 + 190); // blue-violet range
      var psat = Math.floor(seededRand(i * 13 + 9) * 40 + 60);
      plants.push({ x: px, y: py, r: psize, hue: phue, sat: psat });
    }

    // Draw constellation lines (light, subtle)
    ctx.save();
    ctx.lineWidth = 0.6;
    for (var a = 0; a < plants.length; a++) {
      for (var b = a + 1; b < plants.length; b++) {
        var dx = plants[a].x - plants[b].x;
        var dy = plants[a].y - plants[b].y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < w * 0.22) {
          var alpha = (1 - dist / (w * 0.22)) * 0.18;
          ctx.beginPath();
          ctx.moveTo(plants[a].x, plants[a].y);
          ctx.lineTo(plants[b].x, plants[b].y);
          ctx.strokeStyle = 'rgba(160,190,255,' + alpha + ')';
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // Draw bloom/star for each plant
    for (var p = 0; p < plants.length; p++) {
      var plant = plants[p];
      _drawStar(ctx, plant.x, plant.y, plant.r, plant.hue, plant.sat, p);
    }

    // --- ground plants (stems + blooms) grow from the horizon ---------------
    var groundPlants = Math.min(plantCount, 12);
    for (var g = 0; g < groundPlants; g++) {
      var gpx = (0.07 + (g / Math.max(groundPlants - 1, 1)) * 0.86) * w;
      // slight random offset so they don't look perfectly evenly-spaced
      gpx += (seededRand(g * 31 + 1) - 0.5) * (w / (groundPlants + 1)) * 0.5;
      var gpy = groundY - 2;
      var height = seededRand(g * 31 + 2) * 30 + 18;
      var variety = Math.floor(seededRand(g * 31 + 3) * 3); // 0=stem+bloom, 1=grass, 2=shrub
      _drawGroundPlant(ctx, gpx, gpy, height, variety, g);
    }

    // Soft glow overlay at the horizon
    var glowGrad = ctx.createLinearGradient(0, groundY - 20, 0, groundY + 30);
    glowGrad.addColorStop(0, 'rgba(80,120,200,0.10)');
    glowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, groundY - 20, w, 50);
  }

  function _drawStar(ctx, x, y, r, hue, sat, idx) {
    // A 6-pointed sparkle
    ctx.save();
    ctx.translate(x, y);

    // Glow
    var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 5);
    glow.addColorStop(0, 'hsla(' + hue + ',' + sat + '%,80%,0.4)');
    glow.addColorStop(1, 'hsla(' + hue + ',' + sat + '%,80%,0)');
    ctx.beginPath();
    ctx.arc(0, 0, r * 5, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Core dot
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = 'hsla(' + hue + ',' + sat + '%,92%,0.95)';
    ctx.fill();

    // Cross sparkle lines
    var sp = r * 2.6;
    ctx.lineWidth = r * 0.55;
    ctx.strokeStyle = 'hsla(' + hue + ',' + sat + '%,95%,0.7)';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-sp, 0); ctx.lineTo(sp, 0);
    ctx.moveTo(0, -sp); ctx.lineTo(0, sp);
    ctx.stroke();

    // Diagonal smaller lines
    var sd = sp * 0.55;
    ctx.lineWidth = r * 0.3;
    ctx.strokeStyle = 'hsla(' + hue + ',' + sat + '%,95%,0.4)';
    ctx.beginPath();
    ctx.moveTo(-sd, -sd); ctx.lineTo(sd, sd);
    ctx.moveTo(sd, -sd); ctx.lineTo(-sd, sd);
    ctx.stroke();

    ctx.restore();
  }

  function _drawSeedling(ctx, x, y, scale) {
    scale = scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(95,200,160,0.5)';
    ctx.lineWidth = 1.5 * scale;
    ctx.lineCap = 'round';
    // stem
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -22 * scale);
    ctx.stroke();
    // two small leaves
    ctx.beginPath();
    ctx.moveTo(0, -14 * scale);
    ctx.quadraticCurveTo(-10 * scale, -18 * scale, -8 * scale, -22 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -14 * scale);
    ctx.quadraticCurveTo(10 * scale, -18 * scale, 8 * scale, -22 * scale);
    ctx.stroke();
    ctx.restore();
  }

  function _drawGroundPlant(ctx, x, y, height, variety, seed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'round';

    if (variety === 0) {
      // Flowering stem
      var hue = Math.floor(seededRand(seed * 17 + 4) * 120 + 150); // teal to purple
      ctx.strokeStyle = 'rgba(80,160,100,0.8)';
      ctx.lineWidth = 1.8;
      // slight curve via quadratic
      ctx.beginPath();
      var ctrlX = (seededRand(seed * 17 + 6) - 0.5) * 10;
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(ctrlX, -height * 0.5, 0, -height);
      ctx.stroke();
      // bloom petals
      ctx.save();
      ctx.translate(0, -height);
      var petals = 5;
      for (var k = 0; k < petals; k++) {
        var angle = (k / petals) * Math.PI * 2;
        var px2 = Math.cos(angle) * 5;
        var py2 = Math.sin(angle) * 5;
        ctx.beginPath();
        ctx.arc(px2, py2, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = 'hsla(' + hue + ',70%,75%,0.85)';
        ctx.fill();
      }
      // center
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,240,150,0.9)';
      ctx.fill();
      ctx.restore();

    } else if (variety === 1) {
      // Grass blade cluster
      ctx.strokeStyle = 'rgba(70,140,90,0.65)';
      for (var blade = -1; blade <= 1; blade++) {
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(blade * 4, 0);
        ctx.quadraticCurveTo(blade * 8 + (seededRand(seed * 17 + blade + 8) - 0.5) * 6, -height * 0.6, blade * 5, -height);
        ctx.stroke();
      }

    } else {
      // Small shrub
      ctx.strokeStyle = 'rgba(60,120,80,0.7)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -height * 0.55);
      ctx.stroke();
      // rounded canopy
      var shrubHue = Math.floor(seededRand(seed * 17 + 12) * 60 + 120);
      var canopyGrad = ctx.createRadialGradient(0, -height * 0.72, 2, 0, -height * 0.72, height * 0.55);
      canopyGrad.addColorStop(0, 'hsla(' + shrubHue + ',55%,50%,0.75)');
      canopyGrad.addColorStop(1, 'hsla(' + shrubHue + ',45%,35%,0.3)');
      ctx.beginPath();
      ctx.ellipse(0, -height * 0.72, height * 0.38, height * 0.42, 0, 0, Math.PI * 2);
      ctx.fillStyle = canopyGrad;
      ctx.fill();
    }

    ctx.restore();
  }

  // ---- confetti burst -------------------------------------------------------

  function confettiBurst(anchor) {
    var colors = ['#7c9cff', '#9d7cff', '#5fe0c8', '#ffd97d', '#ff8fa3'];
    var rect = anchor ? anchor.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 3, width: 0 };
    var ox = rect.left + rect.width / 2;
    var oy = rect.top;
    for (var i = 0; i < 18; i++) {
      var piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = (ox + (Math.random() - 0.5) * 120) + 'px';
      piece.style.top = oy + 'px';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      piece.style.animationDuration = (1.4 + Math.random() * 1.0) + 's';
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      document.body.appendChild(piece);
      (function (el) {
        setTimeout(function () { el.remove(); }, 2600);
      })(piece);
    }
  }

  // ---- milestone definitions -----------------------------------------------

  function getMilestones(stats) {
    return [
      {
        key: 'mFirstStep',
        badge: '🌱',
        name: t('grd.mFirstStep'),
        sub: t('grd.mFirstStepSub'),
        unlocked: stats.checkins >= 1,
      },
      {
        key: 'mWeek',
        badge: '🔥',
        name: t('grd.mWeek'),
        sub: t('grd.mWeekSub'),
        unlocked: stats.longest >= 7,
      },
      {
        key: 'mScientist',
        badge: '🔬',
        name: t('grd.mScientist'),
        sub: t('grd.mScientistSub'),
        unlocked: stats.experiments >= 1,
      },
      {
        key: 'mWeathered',
        badge: '⛈️',
        name: t('grd.mWeathered'),
        sub: t('grd.mWeatheredSub'),
        unlocked: stats.storms >= 1,
      },
      {
        key: 'mWordsmith',
        badge: '✍️',
        name: t('grd.mWordsmith'),
        sub: t('grd.mWordsmithSub'),
        unlocked: stats.words >= 1000,
      },
      {
        key: 'mAnchored',
        badge: '⚓',
        name: t('grd.mAnchored'),
        sub: t('grd.mAnchoredSub'),
        unlocked: stats.days >= 30,
      },
    ];
  }

  // ---- render --------------------------------------------------------------

  function render(root) {
    var stats = {
      checkins:    countCheckins(),
      nights:      countNights(),
      words:       countWords(),
      experiments: countExperimentsDone(),
      storms:      countStormDays(),
      values:      countValuesLived(),
      longest:     longestStreak(),
      days:        daysSinceStart(),
    };

    var engagement = stats.checkins + stats.nights + Store.journal.count();
    var plantCount = engagement; // 1 plant per engagement unit, kept natural

    // ---- page head ----------------------------------------------------------
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('h1', { class: 'page-title serif' }, t('grd.title')),
      UI.el('div', { class: 'eyebrow mt1' }, t('grd.sub')),
    ]));

    // ---- intro --------------------------------------------------------------
    root.appendChild(UI.el('p', { class: 'soft small', style: { lineHeight: '1.6', marginBottom: 'var(--s4)' } }, t('grd.intro')));

    // ---- empty state --------------------------------------------------------
    if (engagement === 0) {
      root.appendChild(UI.empty('🌱', null, t('grd.empty')));
      root.appendChild(UI.el('div', { class: 'small soft center mt4' }, t('grd.keepGrowing')));
      Anchor.register({ id: 'garden', labelKey: 'grd.title', icon: 'spark', order: 70, tab: false, render: render, onShow: onShow });
      return;
    }

    // ---- garden scene (canvas) ----------------------------------------------
    var scene = UI.el('div', { class: 'garden-scene', style: { height: '280px' } });
    var canvas = UI.el('canvas', { class: 'garden-canvas' });
    scene.appendChild(canvas);

    // Caption
    var plantLabel = plantCount === 1 ? t('grd.plant') : t('grd.plants');
    var caption = UI.el('div', { class: 'garden-caption' }, [
      UI.el('div', { class: 'gc-count' }, String(plantCount)),
      UI.el('div', { class: 'gc-lbl' }, plantLabel),
    ]);
    scene.appendChild(caption);
    root.appendChild(scene);

    // Store canvas ref for onShow
    root._gardenCanvas = canvas;
    root._gardenPlantCount = plantCount;

    // ---- stats grid ---------------------------------------------------------
    root.appendChild(UI.el('div', { class: 'grd-stats mt4' }, [
      statTile('🌀', stats.checkins,    t('grd.statCheckins')),
      statTile('🌙', stats.nights,      t('grd.statNights')),
      statTile('✍️', stats.words,       t('grd.statWords')),
      statTile('🔬', stats.experiments, t('grd.statExperiments')),
      statTile('⛈️', stats.storms,     t('grd.statStorms')),
      statTile('🧭', stats.values,      t('grd.statValues')),
      statTile('🔥', stats.longest,     t('grd.statStreak')),
      statTile('📅', stats.days,        t('grd.statDays')),
    ]));

    // ---- milestones ---------------------------------------------------------
    var milestones = getMilestones(stats);
    var msSection = UI.el('div', { class: 'col gap3 mt4' }, [
      UI.el('div', { class: 'eyebrow', style: { marginBottom: 'var(--s2)' } }, t('grd.milestones')),
    ]);

    milestones.forEach(function (ms) {
      var isJust = ms.unlocked && !_justUnlocked.has(ms.key);
      if (ms.unlocked && isJust) {
        // Mark as seen this session so we don't re-animate
        _justUnlocked.add(ms.key);
      }

      var row = UI.el('div', {
        class: 'milestone ' + (ms.unlocked ? 'unlocked' : 'locked') + (ms.unlocked && isJust ? ' just' : ''),
      }, [
        UI.el('div', { class: 'ms-badge' }, ms.badge),
        UI.el('div', { class: 'ms-body' }, [
          UI.el('div', { class: 'ms-name' }, ms.name),
          UI.el('div', { class: 'ms-sub' }, ms.sub),
        ]),
        UI.el('div', { class: 'ms-state ' + (ms.unlocked ? 'good' : 'soft') },
          ms.unlocked ? t('grd.unlocked') : t('grd.locked')
        ),
      ]);

      // Confetti for newly unlocked milestones
      if (ms.unlocked && isJust) {
        setTimeout(function (el) {
          return function () { confettiBurst(el); };
        }(row), 200 + milestones.indexOf(ms) * 80);
      }

      msSection.appendChild(row);
    });

    root.appendChild(msSection);

    // ---- footer -------------------------------------------------------------
    root.appendChild(UI.el('div', { class: 'small soft center mt5 mb4' }, t('grd.keepGrowing')));
  }

  // ---- stat tile helper ----------------------------------------------------

  function statTile(emoji, num, label) {
    return UI.el('div', { class: 'grd-stat glass-card' }, [
      UI.el('div', { class: 'gs-emoji' }, emoji),
      UI.el('div', {}, [
        UI.el('div', { class: 'gs-num' }, String(num)),
        UI.el('div', { class: 'gs-lbl' }, label),
      ]),
    ]);
  }

  // ---- onShow: draw canvas + bind resize -----------------------------------

  function onShow() {
    // Remove any stale resize handler
    if (_resizeHandler) {
      window.removeEventListener('resize', _resizeHandler);
      _resizeHandler = null;
    }

    // Find the active view's root container
    var root = document.querySelector('.view-active') || document.querySelector('[data-view="garden"]');
    if (!root) return;

    var canvas = root._gardenCanvas;
    var plantCount = root._gardenPlantCount;

    if (!canvas) {
      // Try to locate canvas by class inside root as fallback
      canvas = root.querySelector('.garden-canvas');
      plantCount = plantCount || totalEngagement();
    }

    if (!canvas) return;

    // Initial draw
    drawGarden(canvas, plantCount || 0);

    // Bind resize with cleanup
    _resizeHandler = function () {
      drawGarden(canvas, plantCount || 0);
    };
    window.addEventListener('resize', _resizeHandler);
  }

  // ---- register ------------------------------------------------------------

  Anchor.register({
    id: 'garden',
    labelKey: 'grd.title',
    icon: 'spark',
    order: 70,
    tab: false,
    render: render,
    onShow: onShow,
  });

})();
