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
  // 16 levels now (was 9) — more frequent, more imaginative milestones.
  const LEVELS = [0, 80, 200, 380, 640, 1000, 1500, 2200, 3200, 4600, 6500, 9000, 12500, 17000, 23000, 31000];
  const XP = { moods: 15, journal: 25, decompress: 30, energy: 8, activity: 10, valuesChecks: 12, sleep: 20, expLogs: 20, insights: 10 };

  function names() { return t('gam.names').split('|'); }
  function gobj() { return Store.raw.gamification; }
  function ensure() { const x = gobj(); if (x.xp == null) x.xp = 0; if (x.level == null) x.level = 1; if (!x.counts) x.counts = {}; }

  function currentCounts() {
    return {
      moods: Store.moods.count(), journal: Store.journal.count(),
      decompress: Store.decompress.count(), energy: Store.energy.count(),
      activity: Store.activity ? Store.activity.count() : 0,
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
    const oldLevel = g.level || 1;
    const newLevel = levelForXp(g.xp);
    const leveled = newLevel > oldLevel;
    g.level = newLevel;
    Store.persist();
    if (gained > 0) Store.emit('gamify', { gained, xp: g.xp, level: g.level, leveled });
    if (leveled) celebrate(newLevel, newLevel - oldLevel);
    return { gained, leveled };
  }

  function celebrate(level, jump) {
    // debounce so bulk imports / demo seeding don't spam celebrations
    if (_celebrateLock) return; _celebrateLock = setTimeout(() => { _celebrateLock = null; }, 1300);
    (UI.hapticSuccess || UI.haptic)('success');
    confettiBurst(jump > 1 ? 18 : 40);
    // big single-step level-ups get a full celebratory modal; bulk jumps (seed /
    // import) just get a toast so they don't stack.
    if (jump > 1 || typeof UI.modal !== 'function') {
      UI.toast('✨ ' + t('gam.levelUp') + ' — ' + t('gam.reached', { name: levelName(level) }), 'good');
      return;
    }
    try {
      const m = UI.modal({
        title: null,
        body: UI.el('div', { class: 'col center', style: { textAlign: 'center', padding: '6px 4px' } }, [
          UI.el('div', { style: { fontSize: '3rem', animation: 'pop .5s var(--ease-spring)' } }, '✨'),
          UI.el('div', { class: 'eyebrow' }, t('gam.levelUp')),
          UI.el('div', { class: 'serif grad-text', style: { fontSize: '2.2rem', margin: '4px 0 2px' } }, t('gam.lvN', { n: level })),
          UI.el('div', { class: 'big b' }, levelName(level)),
          UI.el('div', { class: 'small soft', style: { marginTop: '10px', lineHeight: '1.5', maxWidth: '300px' } }, t('gam.levelUpSub')),
        ]),
        actions: [UI.el('button', { class: 'btn btn-primary', onclick: () => m.close() }, t('app.continue'))],
      });
    } catch (e) { UI.toast('✨ ' + t('gam.levelUp'), 'good'); }
  }
  function confettiBurst(count) {
    if (typeof document === 'undefined') return;
    const colors = ['var(--a1)', 'var(--a2)', 'var(--a3)', 'var(--a5)', 'var(--a4)'];
    const n = count || 30;
    for (let i = 0; i < n; i++) {
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
    return UI.el('div', { class: 'glass-card card-tight', onclick: () => Anchor.go('journey', { tab: 'garden' }) }, [
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
    ensure(); const g = gobj(); const old = g.level || 1; g.xp = (g.xp || 0) + (n || 0);
    const nl = levelForXp(g.xp); const leveled = nl > old; g.level = nl;
    Store.persist(); Store.emit('gamify', { gained: n, xp: g.xp, level: g.level, leveled });
    if (leveled) celebrate(nl, nl - old);
  }

  // auto-award whenever stored data grows
  Store.on('change', () => { try { sync(); } catch (e) { /* never block the app */ } });

  window.Gamify = { sync, progress, hud, award, levelName, names, LEVELS, confettiBurst };
})();
