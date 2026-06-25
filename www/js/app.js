// ===========================================================================
// app.js — the shell. Boots Anchor, wires chrome (top bar, tab bar, lifeline,
// settings), owns navigation + view transitions, and gates first-run onboarding.
// Loads LAST so every feature has already registered its view.
// ===========================================================================
(function () {
  const viewEl = () => document.getElementById('view');
  const tabbarEl = () => document.getElementById('tabbar');
  const topbarEl = () => document.getElementById('topbar');

  // ---- navigation handler (installed into the registry) -------------------
  function navigate(id, params, isRefresh) {
    const view = Anchor.byId(id);
    if (!view) { console.warn('no view', id); return; }
    Anchor._state.current = id;
    Anchor._state.params = params || null;

    const host = viewEl();
    const paint = () => {
      UI.clear(host);
      const page = UI.el('div', { class: 'page page-enter' + (isRefresh ? '' : ' rise') });
      host.appendChild(page);
      try { view.render(page, params || {}); } catch (e) { console.error(e); page.appendChild(errorCard(e)); }
      // every feature ends with the gentle care note
      page.appendChild(careFooter());
      host.scrollTop = 0;
      // let children settle, then flip to the settled state for a smooth glide-in
      requestAnimationFrame(() => page.classList.add('page-in'));
      if (view.onShow) { try { view.onShow(params || {}); } catch (e) { console.warn(e); } }
    };

    paint();
    updateTabs(id);
    updateTopbar(view, id);
    wireCondense();
    UI.haptic('light');
  }

  // condensing header / breadcrumb: as the view scrolls, the big page title
  // shrinks and the current section name surfaces compactly in the top bar.
  let _condenseBound = false;
  function wireCondense() {
    const host = viewEl(); if (!host || _condenseBound) { syncCondense(); return; }
    _condenseBound = true;
    host.addEventListener('scroll', syncCondense, { passive: true });
  }
  function syncCondense() {
    const host = viewEl(); if (!host) return;
    document.body.classList.toggle('scrolled', host.scrollTop > 64);
    const crumb = document.getElementById('navCrumb');
    if (crumb) {
      const v = Anchor.byId(Anchor.current);
      crumb.textContent = (v && Anchor.current !== 'home') ? t(v.labelKey) : '';
    }
  }

  // ---- swipe between the main tabs (left/right) ----------------------------
  let _swipeBound = false, _sx = 0, _sy = 0, _st = 0;
  function wireSwipe() {
    if (_swipeBound) return; _swipeBound = true;
    const host = viewEl();
    host.addEventListener('touchstart', (e) => { const t0 = e.touches[0]; _sx = t0.clientX; _sy = t0.clientY; _st = Date.now(); }, { passive: true });
    host.addEventListener('touchend', (e) => {
      if (document.body.classList.contains('arrange-mode')) return;
      const idx = MAIN_TABS.indexOf(Anchor.current);
      if (idx < 0) return;                       // only swipe between main tabs
      const t1 = e.changedTouches[0];
      const dx = t1.clientX - _sx, dy = t1.clientY - _sy;
      if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - _st > 600) return;
      const next = dx < 0 ? idx + 1 : idx - 1;
      if (next < 0 || next >= MAIN_TABS.length) return;
      const target = Anchor.byId(MAIN_TABS[next]); if (!target) return;
      const h = viewEl();
      h.classList.add(dx < 0 ? 'swipe-left' : 'swipe-right');
      UI.haptic('light');
      Anchor.go(MAIN_TABS[next]);
      setTimeout(() => h.classList.remove('swipe-left', 'swipe-right'), 360);
    }, { passive: true });
  }

  function errorCard(e) {
    return UI.card([
      UI.el('div', { class: 'b', style: { color: 'var(--bad)' } }, 'Something hiccuped'),
      UI.el('div', { class: 'small soft mt2' }, String(e && e.message || e)),
      UI.btn(t('app.retry'), { class: 'btn-ghost btn-sm', onClick: () => Anchor.refresh() }),
    ]);
  }

  function careFooter() {
    return UI.el('div', { class: 'care-note' }, [
      UI.el('span', {}, t('care.note') + ' '),
      UI.el('a', { class: 'care-link', onclick: (e) => { e.preventDefault(); Crisis.open(); }, href: '#' }, t('care.getSupport')),
    ]);
  }

  // ---- navigation: bottom bar (4 main tabs) + a center "bloom" orb ---------
  // The bar keeps the primary features (2 on each side). The raised center orb
  // opens a radial bloom of every SECONDARY feature (the plant garden, journal,
  // toolkit, …). Only the focused item is labelled, so labels never overlap; on
  // web a scroll-wheel rolls the focus around the ring (Minecraft-hotbar style).
  // Main bar: Home · Weather · [orb] · Wind-down · Check-in.
  // (Patterns moved into Journey in the bloom; the Decompression Chamber is back
  //  on the main bar as its own immersive screen.)
  const MAIN_TABS = ['home', 'weather', 'decompress', 'checkin'];
  // The orb opens the key SECOND-TIER features only. Settings lives in the top
  // bar (⋯); the long tail (Values, Experiments, Grounding, Timeline, Review)
  // lives inside "You". Keeping this short means every item gets a clear label.
  const BLOOM = [
    ['journal', 'nav.journal'],
    ['sleep', 'nav.sleep'],
    ['energy', 'nav.energy'],
    ['calm', 'nav.calm'],
    ['journey', 'nav.journey'],
    ['hub', 'hub.title'],
  ];
  let bloomFocus = 0;

  function bloomItems() {
    return BLOOM.map(([id, lk]) => { const v = Anchor.byId(id); return v ? { id, icon: v.icon, labelKey: lk } : null; }).filter(Boolean);
  }
  function navMenuHost() { return document.getElementById('navmenu-host'); }
  function iconHTML(name, size) { size = size || 26; return `<span style="width:${size}px;height:${size}px;display:inline-flex">${Icons.get(name)}</span>`; }

  function buildTabbar() {
    const bar = tabbarEl(); UI.clear(bar);
    const main = MAIN_TABS.map(id => Anchor.byId(id)).filter(Boolean);
    const left = main.slice(0, 2), right = main.slice(2, 4);
    left.forEach(v => bar.appendChild(tabButton(v)));
    bar.appendChild(orbButton());
    right.forEach(v => bar.appendChild(tabButton(v)));
    updateTabs(Anchor.current);
    magnetize(document.getElementById('navorb'), 0.22);
  }

  function tabButton(v) {
    return UI.el('button', { class: 'tab', dataset: { tab: v.id }, onclick: () => { UI.haptic('light'); Anchor.go(v.id); } }, [
      UI.frag(`<span class="tab-ico">${Icons.get(v.icon)}</span>`),
      UI.el('span', { class: 'tab-lbl' }, t(v.labelKey)),
    ]);
  }
  function orbButton() {
    return UI.el('button', { class: 'navorb', id: 'navorb', 'aria-label': t('nav.menu'),
      onclick: (e) => { e.stopPropagation(); toggleNav(); } }, [
      UI.el('span', { class: 'navorb-ico', id: 'navorbIco' }, UI.frag(iconHTML('grid'))),
    ]);
  }
  function updateOrbIcon(open) {
    const ico = document.getElementById('navorbIco'); if (!ico) return;
    ico.innerHTML = iconHTML(open ? 'x' : 'grid');
  }

  function toggleNav() {
    const host = navMenuHost();
    if (host.classList.contains('mounted')) closeNav(); else openNav();
  }

  function openNav() {
    const host = navMenuHost(); UI.clear(host);
    const items = bloomItems(); host._items = items;
    const N = items.length;
    const ci = items.findIndex(v => v.id === Anchor.current);
    // only pre-highlight the item you're already on; otherwise leave every box
    // identical (no odd "one box is a different colour" on open).
    bloomFocus = ci >= 0 ? ci : -1;

    host.appendChild(UI.el('div', { class: 'navmenu-scrim', onclick: closeNav }));
    const bloom = UI.el('div', { class: 'navbloom' });
    // fan items across an upper arc, centered on straight-up (90°). Wider gaps +
    // smaller boxes so adjacent labels/icons never overlap.
    const span = Math.min(156, 40 + N * 22);   // ≤156° so side items stay on-screen
    const a0 = 90 + span / 2, a1 = 90 - span / 2;
    const stepRad = (span / Math.max(N - 1, 1)) * Math.PI / 360;
    const R = Math.max(118, Math.min(144, Math.round(86 / (2 * Math.sin(stepRad || 0.3)))));
    items.forEach((v, i) => {
      const ang = (N === 1 ? 90 : a0 + (a1 - a0) * (i / (N - 1))) * Math.PI / 180;
      const bx = Math.cos(ang) * R, by = -Math.sin(ang) * R;
      bloom.appendChild(UI.el('button', {
        class: 'navbloom-item', dataset: { idx: i },
        style: { '--bx': bx.toFixed(1) + 'px', '--by': by.toFixed(1) + 'px', transitionDelay: (0.02 + i * 0.03) + 's' },
        onclick: () => { closeNav(); Anchor.go(v.id); },
        onmouseenter: () => { bloomFocus = i; applyBloomFocus(); },
      }, [
        UI.el('span', { class: 'nb-ico' }, UI.frag(iconHTML(v.icon, 24))),
        UI.el('span', { class: 'nb-lbl' }, t(v.labelKey)),
      ]));
    });
    host.appendChild(bloom);
    host.appendChild(UI.el('div', { class: 'bloom-hint tiny', id: 'bloomHint' }, isWeb() ? t('nav.scrollHint') : t('nav.tapHint')));

    host.classList.add('mounted');
    const orb = document.getElementById('navorb'); if (orb) { orb.classList.add('open'); orb.style.transform = ''; }
    updateOrbIcon(true);
    applyBloomFocus();
    UI.haptic('light');
    requestAnimationFrame(() => requestAnimationFrame(() => host.classList.add('open')));

    // web: roll the focus with the scroll wheel; arrows + enter also work
    host._wheel = (e) => { e.preventDefault(); rollFocus(e.deltaY > 0 ? 1 : -1); };
    host.addEventListener('wheel', host._wheel, { passive: false });
    host._key = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { rollFocus(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { rollFocus(-1); e.preventDefault(); }
      else if (e.key === 'Enter') { const v = host._items[bloomFocus]; closeNav(); if (v) Anchor.go(v.id); }
      else if (e.key === 'Escape') { closeNav(); }
    };
    window.addEventListener('keydown', host._key);
  }

  function rollFocus(dir) {
    const host = navMenuHost(); const N = (host._items || []).length; if (!N) return;
    bloomFocus = (bloomFocus + dir + N) % N;
    applyBloomFocus();
    UI.haptic('light');
  }
  function applyBloomFocus() {
    const host = navMenuHost();
    host.querySelectorAll('.navbloom-item').forEach((el, i) => el.classList.toggle('focus', i === bloomFocus));
  }

  function closeNav() {
    const host = navMenuHost();
    if (host._wheel) { host.removeEventListener('wheel', host._wheel); host._wheel = null; }
    if (host._key) { window.removeEventListener('keydown', host._key); host._key = null; }
    host.classList.remove('open');
    const orb = document.getElementById('navorb'); if (orb) orb.classList.remove('open');
    updateOrbIcon(false);
    setTimeout(() => { if (!host.classList.contains('open')) { host.classList.remove('mounted'); UI.clear(host); } }, 300);
  }

  function updateTabs(currentId) {
    if (navMenuHost() && navMenuHost().classList.contains('mounted')) closeNav();
    document.querySelectorAll('.tab').forEach(tb => tb.classList.toggle('active', tb.dataset.tab === currentId));
    updateOrbIcon(false);
  }

  // platform helper + magnetic-pull for pointer (web) devices
  function isWeb() { return !(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }
  function magnetize(el, strength) {
    if (!el || !isWeb()) return;
    el.addEventListener('mousemove', (e) => {
      if (el.classList.contains('open')) { el.style.transform = ''; return; }
      const r = el.getBoundingClientRect();
      const mx = e.clientX - (r.left + r.width / 2), my = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${(mx * strength).toFixed(1)}px, ${(my * strength).toFixed(1)}px)`;
    });
    el.addEventListener('mouseleave', () => { el.style.transform = ''; });
  }
  window.Magnetize = magnetize;

  // ---- top bar ------------------------------------------------------------
  function updateTopbar(view, id) {
    const back = document.getElementById('navBack');
    const isHome = id === 'home';
    if (back) {
      back.hidden = isHome;
      back.onclick = () => Anchor.go('home');
    }
    const crumb = document.getElementById('navCrumb');
    if (crumb) crumb.textContent = isHome ? '' : t(view.labelKey);
    document.body.classList.remove('scrolled');
  }

  function wireChrome() {
    document.getElementById('settingsBtn').onclick = () => Anchor.go('settings');
    const life = document.getElementById('lifelineBtn');
    life.onclick = () => Crisis.open();
    // long-press the ♥ for an instant region-aware SOS panel
    if (UI.longPress && window.Crisis && Crisis.sos) UI.longPress(life, () => Crisis.sos(), 450);
    document.getElementById('brand').onclick = () => Anchor.go('home');
  }

  // ---- accent gradients (user-customizable color) ------------------------
  // Each preset is the 5 stops that the whole UI's gradients are built from.
  const ACCENTS = {
    aurora:   ['#7c9cff', '#9d7cff', '#5fe0c8', '#ffa9d4', '#ffd27a'],
    sunset:   ['#ff8a5c', '#ff5c8a', '#ffb24c', '#c86bff', '#ffd27a'],
    forest:   ['#5fe0a8', '#7cd0ff', '#a8e05f', '#5fb0e0', '#d8ff7a'],
    ocean:    ['#4cc9ff', '#5c8aff', '#5fe0e0', '#7c9cff', '#a9f0ff'],
    rose:     ['#ff9ec4', '#ff7ca8', '#c89dff', '#ffb6d4', '#ffd6e6'],
    gold:     ['#ffd27a', '#ffb24c', '#ffe39a', '#ff9d6e', '#fff0c2'],
    mono:     ['#aab4d8', '#c4ccec', '#8f9ac4', '#d4daf0', '#9aa6c8'],
    lavender: ['#c4a6ff', '#9d7cff', '#e0a6ff', '#b6c4ff', '#efd6ff'],
    ember:    ['#ff7a5c', '#ff5c5c', '#ffae6b', '#ff8a9c', '#ffce8a'],
    teal:     ['#3fe0d0', '#4cc9a8', '#6fe0b6', '#4cb6c9', '#a9f0e6'],
    sky:      ['#6bb6ff', '#7c9cff', '#8fd0ff', '#9db6ff', '#c2e6ff'],
    berry:    ['#ff6ba8', '#c84c9c', '#ff8ac4', '#a86bff', '#ffb6d8'],
    sand:     ['#e0c89a', '#d4b06b', '#efd6a8', '#c9a47a', '#fff0cc'],
    mint:     ['#7fe0a8', '#5fe0c8', '#a8e0b6', '#6fd0a0', '#d8ffe0'],
    slate:    ['#8fa0c4', '#7c8ab0', '#a6b6d8', '#9aa6c4', '#c4d0e6'],
  };
  function hexToRgb(hex) {
    const m = hex.replace('#', '');
    const n = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function applyAccent() {
    const id = Store.get('settings.accent', 'aurora');
    const a = ACCENTS[id] || ACCENTS.aurora;
    const root = document.documentElement.style;
    a.forEach((c, i) => {
      root.setProperty('--a' + (i + 1), c);
      // RGB channels so every translucent glow/active state follows the accent
      root.setProperty('--a' + (i + 1) + '-rgb', hexToRgb(c).join(','));
    });
    // The chosen color now OWNS the background — it's no longer a near-black base
    // with a faint tint, it's a deep, clearly-coloured version of the picked hue.
    // Accents (--a1..) stay vibrant for buttons/text so contrast holds.
    const [r, g, b] = hexToRgb(a[0]);
    const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
    if (Store.get('settings.theme') !== 'daylight') {
      // deep, saturated tint of the chosen colour
      root.setProperty('--bg-0', `rgb(${clamp(r * 0.11 + 5)},${clamp(g * 0.11 + 6)},${clamp(b * 0.12 + 9)})`);
      root.setProperty('--bg-1', `rgb(${clamp(r * 0.16 + 7)},${clamp(g * 0.15 + 9)},${clamp(b * 0.17 + 14)})`);
      root.setProperty('--bg-2', `rgb(${clamp(r * 0.24 + 10)},${clamp(g * 0.22 + 13)},${clamp(b * 0.26 + 20)})`);
    } else {
      // light theme: a pale wash of the chosen colour
      root.setProperty('--bg-0', `rgb(${clamp(r * 0.10 + 222)},${clamp(g * 0.10 + 224)},${clamp(b * 0.10 + 230)})`);
      root.setProperty('--bg-1', `rgb(${clamp(r * 0.12 + 214)},${clamp(g * 0.12 + 218)},${clamp(b * 0.12 + 226)})`);
      root.setProperty('--bg-2', `rgb(${clamp(r * 0.14 + 206)},${clamp(g * 0.14 + 212)},${clamp(b * 0.14 + 222)})`);
    }
  }

  // ---- spacing density (user-customizable widget spacing) ------------------
  function applyDensity() {
    const d = Store.get('settings.density', 'spacious');
    document.body.classList.remove('density-compact', 'density-cozy', 'density-spacious');
    document.body.classList.add('density-' + (['compact', 'cozy', 'spacious'].indexOf(d) >= 0 ? d : 'spacious'));
  }

  // ---- subtle background line-art ------------------------------------------
  function applyDoodles() {
    const on = Store.get('settings.doodles', true);
    document.body.classList.toggle('doodles-off', !on);
  }

  // ---- background style: animated gradient vs. clean plain color -----------
  function applyBgStyle() {
    const plain = Store.get('settings.bgStyle', 'gradient') === 'plain';
    document.body.classList.toggle('bg-plain', plain);
  }

  // ---- font scale (eyesight / accessibility) -------------------------------
  function applyFontScale() {
    const s = +Store.get('settings.fontScale', 1) || 1;
    const clamped = Math.max(0.85, Math.min(1.4, s));
    document.documentElement.style.fontSize = Math.round(16 * clamped) + 'px';
  }

  // ---- contextual dark mode: a warm/cool wash that follows the clock --------
  // Deep warm ambers late at night, cooler energetic blues through the day.
  function applyTimeWash() {
    const h = new Date().getHours();
    const tod = (h >= 22 || h < 5) ? 'night' : (h < 8 ? 'dawn' : (h < 18 ? 'day' : 'dusk'));
    document.body.setAttribute('data-tod', tod);
  }

  // ---- theme + weather tint ----------------------------------------------
  function applyTheme() {
    const theme = Store.get('settings.theme', 'aurora');
    // toggle ONLY the theme classes — don't nuke density/doodles/arrange-mode
    document.body.classList.remove('theme-aurora', 'theme-daylight');
    document.body.classList.add('theme-' + (theme === 'daylight' ? 'daylight' : 'aurora'));
    document.body.setAttribute('dir', I18N.dir);
    applyAccent();
    applyDensity();
    applyDoodles();
    applyBgStyle();
    applyFontScale();
    applyTimeWash();
    Native.applyStatusBar && Native.applyStatusBar();
  }
  function applyWeatherTint() {
    const wx = Store.derive.todayWeather();
    if (wx) document.body.setAttribute('data-weather', wx); else document.body.removeAttribute('data-weather');
    applyWeatherBg();
  }

  // ---- INNER-WEATHER BACKGROUND (opt-in) -----------------------------------
  // The whole app can quietly *become* today's inner weather — drifting clouds
  // on an overcast day, soft rain when it's low, a warm glow when it's bright.
  // It's intentionally faint so glass + text stay perfectly readable, and it's
  // off by default (Settings → Personalize). This fuses two systems Anchor
  // already had — the emotional-weather model and the living background — into
  // one ambient surface that breathes with how you actually feel.
  let _wxBgKey = null;
  function applyWeatherBg() {
    const host = document.getElementById('wxbg'); if (!host) return;
    const on = Store.get('settings.weatherBg', false);
    const wx = on ? (Store.derive.todayWeather() || 'cloud') : null;
    const key = on ? wx : 'off';
    if (key === _wxBgKey) return;   // nothing changed — don't rebuild the scene
    _wxBgKey = key;
    document.body.classList.toggle('wxbg-on', !!on);
    UI.clear(host);
    if (!on || !wx) return;
    host.setAttribute('data-wx', wx);

    const add = (cls, n, build) => { for (let i = 0; i < n; i++) host.appendChild(build(i, UI.el('div', { class: cls }))); };
    const rnd = (a, b) => a + Math.random() * (b - a);

    if (wx === 'sun' || wx === 'clear') {
      const glow = UI.el('div', { class: 'wxb-glow' }); host.appendChild(glow);
      add('wxb-mote', wx === 'sun' ? 14 : 9, (i, el) => {
        el.style.left = rnd(0, 100) + '%'; el.style.top = rnd(0, 100) + '%';
        el.style.animationDuration = rnd(7, 16) + 's'; el.style.animationDelay = (-rnd(0, 12)) + 's';
        return el;
      });
    }
    if (wx === 'cloud' || wx === 'fog' || wx === 'rain' || wx === 'storm') {
      add('wxb-cloud', wx === 'fog' ? 6 : 4, (i, el) => {
        const w = rnd(220, 460);
        el.style.width = w + 'px'; el.style.height = (w * 0.5) + 'px';
        el.style.top = rnd(2, 64) + '%';
        el.style.animationDuration = rnd(46, 96) + 's'; el.style.animationDelay = (-rnd(0, 60)) + 's';
        el.style.opacity = (wx === 'fog' ? 0.5 : 0.34);
        return el;
      });
    }
    if (wx === 'rain' || wx === 'storm') {
      add('wxb-drop', wx === 'storm' ? 70 : 46, (i, el) => {
        el.style.left = rnd(0, 100) + '%';
        el.style.animationDuration = rnd(0.5, 0.95) + 's'; el.style.animationDelay = (-rnd(0, 2)) + 's';
        return el;
      });
    }
    if (wx === 'storm') host.appendChild(UI.el('div', { class: 'wxb-flash' }));
  }

  // ---- boot ---------------------------------------------------------------
  function boot() {
    I18N.init();
    Store.load();
    if (Store.get('settings.lang')) I18N.setLang(Store.get('settings.lang'));
    else Store.set('settings.lang', I18N.lang);

    // one-time: roomy spacing is the new default — bump existing installs once
    if (!Store.get('settings._spaceV2')) {
      Store.settings.update({ density: 'spacious', _spaceV2: true });
    }

    // keep the time-of-day wash fresh while the app stays open
    setInterval(applyTimeWash, 5 * 60 * 1000);

    // publish a compact snapshot for the (optional) iOS home-screen widget.
    // The native widget reads this via an App Group — see ios/AnchorWidget/.
    publishWidget();
    Store.on('change', () => { clearTimeout(_widgetT); _widgetT = setTimeout(publishWidget, 800); });

    applyTheme();
    applyWeatherTint();
    Native.init();
    // Keep general "we miss you" nudges scheduled even before/without sign-in.
    // (User-specific reminders are gated inside syncReminders by sign-in state.)
    Native.syncReminders && Native.syncReminders();
    Anchor.setHandler(navigate);

    // re-render the whole app when language or data changes meaningfully
    I18N.onChange(() => { applyTheme(); if (Store.get('profile.onboarded')) { buildTabbar(); Anchor.refresh(); } });
    Store.on('change', () => applyWeatherTint());
    Store.on('settings', () => applyTheme());

    gate();
    hideLoader();
  }

  // Fade out the branded loading screen once the first real screen has painted.
  function hideLoader() {
    const el = document.getElementById('app-loader');
    if (!el) return;
    // let the first frame settle so we cross-fade into content, not a flash
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('app-loader-out');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 600);
    }));
  }

  // Sign-in gate → onboarding → app.
  function gate() {
    if (window.Auth && !Auth.isSignedIn()) {
      hideChrome(true);
      Auth.start(() => afterAuth());
    } else {
      afterAuth();
    }
  }
  function afterAuth() {
    if (!Store.get('settings.privacyAccepted')) { hideChrome(true); showPrivacy(afterPrivacy); return; }
    afterPrivacy();
  }
  function afterPrivacy() {
    if (!Store.get('profile.onboarded')) {
      hideChrome(true);
      Onboarding.start(() => { hideChrome(false); startApp(); });
    } else {
      startApp();
    }
  }

  // Privacy & terms gate — must be accepted once before using Anchor.
  function showPrivacy(done) {
    const host = viewEl(); UI.clear(host);
    const check = UI.el('input', { type: 'checkbox', style: { flex: '0 0 auto' } });
    const agree = UI.el('label', { class: 'row center', style: { gap: 'var(--s2)', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', margin: 'var(--s4) 0', textAlign: 'center' } }, [
      check, UI.el('span', { class: 'small' }, t('privacy.agree')),
    ]);
    const body = (t('privacy.body') || '').split('\n').filter(Boolean).map(p =>
      UI.el('p', { class: 'small soft', style: { lineHeight: '1.6', marginBottom: 'var(--s3)' } }, p));

    // region picker → sets the right emergency numbers from the start
    const regions = (window.Crisis && Crisis.REGIONS) || { US: { label: 'United States' } };
    const regionSel = UI.el('select', { class: 'select', onchange: (e) => {
      const code = e.target.value; const r = regions[code];
      // emergency numbers + temperature unit follow where you live
      Store.settings.update({ region: code, emergency: { services: r.services, crisis: r.crisis, crisisText: r.crisisText }, tempUnit: code === 'US' ? 'F' : 'C' });
    } }, Object.keys(regions).map(code => UI.el('option', { value: code, selected: code === Store.get('settings.region', 'US') }, regions[code].label)));
    const regionField = UI.el('div', { class: 'field', style: { marginTop: 'var(--s4)' } }, [
      UI.el('label', { class: 'field-label' }, t('sos.region')),
      regionSel,
      UI.el('div', { class: 'tiny muted', style: { marginTop: '5px', marginLeft: '4px' } }, t('sos.regionSub')),
    ]);
    const cta = UI.btn(t('privacy.cta'), { class: 'btn-primary btn-lg', block: true, onClick: () => {
      if (!check.checked) { UI.toast(t('privacy.mustAgree'), 'bad'); UI.haptic('error'); return; }
      Store.settings.update({ privacyAccepted: true, privacyAcceptedAt: Date.now() });
      UI.haptic('success'); done && done();
    } });
    host.appendChild(UI.el('div', { class: 'rise', style: {
      minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: 'calc(var(--safe-t) + 28px) 22px calc(var(--safe-b) + 28px)', maxWidth: '560px', margin: '0 auto',
    } }, [
      UI.el('div', { class: 'eyebrow tac' }, t('privacy.title')),
      UI.el('h1', { class: 'serif tac', style: { fontSize: '2rem', margin: '6px 0 18px' } }, t('privacy.heading')),
      UI.el('div', { class: 'glass-card card', style: { maxHeight: '40dvh', overflowY: 'auto' } }, body),
      regionField,
      agree,
      cta,
    ]));
    host.scrollTop = 0;
  }

  function startApp() {
    hideChrome(false);
    wireChrome();
    buildTabbar();
    wireSwipe();
    Native.syncReminders && Native.syncReminders();
    if (window.Night && Night.isActive()) { Night.check(); Anchor.go('home'); return; }
    // first run after onboarding: introduce every feature (once)
    if (window.Guide && Guide.maybeAutoShow()) return;
    Anchor.go('home');
  }

  // snapshot for the iOS widget (and any future glanceable surface)
  let _widgetT = null;
  function publishWidget() {
    try {
      const v = Store.derive.vitality();
      const p = (window.Gamify && Gamify.progress()) || { level: 1, name: '' };
      const wx = Store.derive.todayWeather();
      const snap = {
        name: Store.profile.name(), streak: Store.streak(),
        vitality: v.score, vitalityBand: v.band,
        level: p.level, levelName: p.name, weather: wx || 'cloud',
        updated: Date.now(),
      };
      localStorage.setItem('anchor_widget', JSON.stringify(snap));
      // if a native bridge exists, hand it over so it can write the App Group
      if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.AnchorWidget && Capacitor.Plugins.AnchorWidget.publish) {
        try { Capacitor.Plugins.AnchorWidget.publish(snap); } catch {}
      }
    } catch (e) { /* widget is best-effort, never block */ }
  }

  function hideChrome(hidden) {
    topbarEl().style.display = hidden ? 'none' : '';
    tabbarEl().style.display = hidden ? 'none' : '';
    if (hidden) { const h = navMenuHost(); if (h && h.classList.contains('mounted')) { h.classList.remove('mounted', 'open'); UI.clear(h); } }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.App = { boot, gate, startApp, applyTheme, applyAccent, applyDensity, applyDoodles, applyBgStyle, applyFontScale, applyTimeWash, applyWeatherTint, applyWeatherBg, buildTabbar, hideChrome, hideLoader, ACCENTS };
})();
