// ===========================================================================
// gamify.js — a gentle game layer. Anchor rewards *showing up* (not stre
// pressure): you earn "light" (XP) for check-ins, journaling, winding down,
// tending your values, logging sleep, and surfacing patterns. Light fills a
// level bar; leveling up gets a little confetti + a calm new title.
//
// It's wired to auto-award from data growth — no feature has to call it — by
// snapshotting per-stream counts and granting XP for genuinely new records.
//
//   Gamify.progress() -> { xp, level, name, pct, toNext, nextName, max }
//   Gamify.hud()      -> a dashboard HUD element
//   Gamify.award(n)   -> manually grant XP
// ===========================================================================
(function () {
  const LEVELS = [0, 100, 250, 500, 900, 1500, 2400, 3800, 6000];
  const XP = { moods: 15, journal: 25, decompress: 30, energy: 8, valuesChecks: 12, sleep: 20, expLogs: 20, insights: 10 };

  function names() { return t('gam.names').split('|'); }
  function gobj() { return Store.raw.gamification; }
  function ensure() { const x = gobj(); if (x.xp == null) x.xp = 0; if (x.level == null) x.level = 1; if (!x.counts) x.counts = {}; }

  function currentCounts() {
    return {
      moods: Store.moods.count(), journal: Store.journal.count(),
      decompress: Store.decompress.count(), energy: Store.energy.count(),
      valuesChecks: Store.valuesChecks.count(), sleep: Store.sleep.count(),
      expLogs: Store.experiments.all().reduce((s, e) => s + ((e.logs && e.logs.length) || 0), 0),
      insights: Store.insights.all().filter(i => !i.dismissed).length,
    };
  }
  function levelForXp(xp) { let lv = 1; for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) lv = i + 1; return lv; }
  function levelName(lv) { const ns = names(); return ns[Math.min((lv || 1) - 1, ns.length - 1)] || ''; }

  let _celebrateLock = null;
  function sync() {
    ensure(); const g = gobj();
    const cur = currentCounts(); let gained = 0;
    for (const k in XP) { const prev = g.counts[k] || 0; const now = cur[k] || 0; if (now > prev) gained += (now - prev) * XP[k]; g.counts[k] = now; }
    if (gained > 0) g.xp = (g.xp || 0) + gained;
    const newLevel = levelForXp(g.xp);
    const leveled = newLevel > (g.level || 1);
    g.level = newLevel;
    Store.persist();
    if (gained > 0) Store.emit('gamify', { gained, xp: g.xp, level: g.level, leveled });
    if (leveled) celebrate(newLevel);
    return { gained, leveled };
  }

  function celebrate(level) {
    // debounce so bulk imports / demo seeding don't spam toasts
    if (_celebrateLock) return; _celebrateLock = setTimeout(() => { _celebrateLock = null; }, 1500);
    UI.haptic('success');
    UI.toast('✨ ' + t('gam.levelUp') + ' — ' + t('gam.reached', { name: levelName(level) }), 'good');
    confettiBurst();
  }
  function confettiBurst() {
    if (typeof document === 'undefined') return;
    const colors = ['var(--a1)', 'var(--a2)', 'var(--a3)', 'var(--a5)'];
    for (let i = 0; i < 26; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left = (Math.random() * 100) + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (1.4 + Math.random() * 1.3) + 's';
      p.style.animationDelay = (Math.random() * 0.3) + 's';
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 3200);
    }
  }

  function progress() {
    ensure(); const g = gobj(); const x = g.xp, lv = g.level;
    const floor = LEVELS[lv - 1] || 0, ceil = LEVELS[lv] != null ? LEVELS[lv] : null;
    return {
      xp: x, level: lv, name: levelName(lv), floor, ceil,
      pct: ceil ? Math.max(2, Math.min(100, Math.round((x - floor) / (ceil - floor) * 100))) : 100,
      toNext: ceil ? ceil - x : 0, nextName: ceil ? levelName(lv + 1) : null, max: !ceil,
    };
  }

  // ---- dashboard HUD ----
  function hud(opts) {
    opts = opts || {};
    const p = progress();
    return UI.el('div', { class: 'glass-card card-tight', onclick: () => Anchor.go('garden') }, [
      UI.el('div', { class: 'row between', style: { alignItems: 'center' } }, [
        UI.el('div', { class: 'row gap3', style: { alignItems: 'center' } }, [
          UI.el('div', { class: 'xp-badge' }, t('gam.lvlShort', { n: p.level })),
          UI.el('div', {}, [
            UI.el('div', { class: 'b small' }, p.name),
            UI.el('div', { class: 'tiny muted' }, p.max ? t('gam.maxLevel') : t('gam.toNext', { n: p.toNext, name: p.nextName })),
          ]),
        ]),
        UI.el('div', { class: 'tiny soft' }, t('gam.xp', { n: p.xp })),
      ]),
      UI.el('div', { class: 'xp-bar mt2' }, [UI.el('i', { style: { width: p.pct + '%' } })]),
    ]);
  }

  function award(n, reason) {
    ensure(); const g = gobj(); g.xp = (g.xp || 0) + (n || 0);
    const nl = levelForXp(g.xp); const leveled = nl > g.level; g.level = nl;
    Store.persist(); Store.emit('gamify', { gained: n, xp: g.xp, level: g.level, leveled });
    if (leveled) celebrate(nl);
  }

  // auto-award whenever stored data grows
  Store.on('change', () => { try { sync(); } catch (e) { /* never block the app */ } });

  window.Gamify = { sync, progress, hud, award, levelName, names, LEVELS, confettiBurst };
})();
