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
      const page = UI.el('div', { class: 'page rise' });
      host.appendChild(page);
      try { view.render(page, params || {}); } catch (e) { console.error(e); page.appendChild(errorCard(e)); }
      // every feature ends with the gentle care note
      page.appendChild(careFooter());
      host.scrollTop = 0;
      if (view.onShow) { try { view.onShow(params || {}); } catch (e) { console.warn(e); } }
    };

    if (isRefresh) { paint(); }
    else {
      host.style.animation = 'none';
      paint();
    }
    updateTabs(id);
    updateTopbar(view);
    UI.haptic('light');
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

  // ---- tab bar ------------------------------------------------------------
  function buildTabbar() {
    const bar = tabbarEl(); UI.clear(bar);
    const tabs = Anchor.tabs().slice(0, 4);
    tabs.forEach(v => bar.appendChild(tabButton(v.id, v.labelKey, v.icon, () => Anchor.go(v.id))));
    // The "You" hub replaces the old flat More sheet: a grouped home for every
    // other feature. Falls back to the sheet only if the hub view isn't loaded.
    if (Anchor.byId('hub')) bar.appendChild(tabButton('hub', 'hub.title', 'grid', () => Anchor.go('hub')));
    else if (Anchor.extras().length) bar.appendChild(tabButton('__more', 'nav.more', 'more', openMoreSheet));
  }
  function tabButton(id, labelKey, icon, onClick) {
    const b = UI.el('button', { class: 'tab', dataset: { tab: id }, onclick: onClick }, [
      UI.frag(`<span class="tab-ico">${Icons.get(icon)}</span>`),
      UI.el('span', {}, t(labelKey)),
    ]);
    return b;
  }
  function updateTabs(currentId) {
    const isExtra = Anchor.extras().some(v => v.id === currentId) && currentId !== 'hub';
    document.querySelectorAll('.tab').forEach(tb => {
      const id = tb.dataset.tab;
      const active = id === currentId
        || (id === '__more' && isExtra)
        || (id === 'hub' && (currentId === 'hub' || isExtra)); // hub stays lit while in any nested feature
      tb.classList.toggle('active', active);
    });
  }
  function openMoreSheet() {
    UI.haptic('light');
    const items = Anchor.extras().concat([Anchor.byId('settings')].filter(Boolean));
    const seen = new Set();
    const body = UI.el('div', { class: 'glass-card', style: { padding: '6px 12px' } },
      items.filter(v => v && !seen.has(v.id) && seen.add(v.id)).map(v =>
        UI.el('button', { class: 'lrow tap', style: { width: '100%', textAlign: 'left' }, onclick: () => { s.close(); Anchor.go(v.id); } }, [
          UI.frag(`<span class="lr-ico">${Icons.get(v.icon)}</span>`),
          UI.el('div', { class: 'lr-body' }, [UI.el('div', { class: 'lr-title' }, t(v.labelKey))]),
          UI.frag(`<span class="lr-meta" style="width:18px">${Icons.get('chevron')}</span>`),
        ])
      )
    );
    const s = UI.sheet({ title: t('nav.more'), body });
  }

  // ---- top bar ------------------------------------------------------------
  function updateTopbar(view) {
    const back = document.getElementById('navBack');
    const isTab = !!view.tab;
    if (back) {
      back.hidden = isTab;
      back.onclick = () => Anchor.go('home');
    }
  }

  function wireChrome() {
    document.getElementById('settingsBtn').onclick = () => Anchor.go('settings');
    document.getElementById('lifelineBtn').onclick = () => Crisis.open();
    document.getElementById('brand').onclick = () => Anchor.go('home');
  }

  // ---- accent gradients (user-customizable color) ------------------------
  // Each preset is the 5 stops that the whole UI's gradients are built from.
  const ACCENTS = {
    aurora: ['#7c9cff', '#9d7cff', '#5fe0c8', '#ffa9d4', '#ffd27a'],
    sunset: ['#ff8a5c', '#ff5c8a', '#ffb24c', '#c86bff', '#ffd27a'],
    forest: ['#5fe0a8', '#7cd0ff', '#a8e05f', '#5fb0e0', '#d8ff7a'],
    ocean:  ['#4cc9ff', '#5c8aff', '#5fe0e0', '#7c9cff', '#a9f0ff'],
    rose:   ['#ff9ec4', '#ff7ca8', '#c89dff', '#ffb6d4', '#ffd6e6'],
    gold:   ['#ffd27a', '#ffb24c', '#ffe39a', '#ff9d6e', '#fff0c2'],
    mono:   ['#aab4d8', '#c4ccec', '#8f9ac4', '#d4daf0', '#9aa6c8'],
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
    // gently pull the dark background base toward the chosen gradient so the
    // whole scene harmonizes (not just the cards/orbs)
    if (Store.get('settings.theme') !== 'daylight') {
      const [r, g, b] = hexToRgb(a[1]);
      root.setProperty('--bg-0', `rgb(${Math.round(r * 0.05 + 4)},${Math.round(g * 0.05 + 5)},${Math.round(b * 0.06 + 12)})`);
      root.setProperty('--bg-2', `rgb(${Math.round(r * 0.09 + 10)},${Math.round(g * 0.08 + 13)},${Math.round(b * 0.1 + 26)})`);
    } else {
      root.removeProperty('--bg-0'); root.removeProperty('--bg-2');
    }
  }

  // ---- theme + weather tint ----------------------------------------------
  function applyTheme() {
    const theme = Store.get('settings.theme', 'aurora');
    document.body.className = 'theme-' + (theme === 'daylight' ? 'daylight' : 'aurora');
    document.body.setAttribute('dir', I18N.dir);
    applyAccent();
    Native.applyStatusBar && Native.applyStatusBar();
  }
  function applyWeatherTint() {
    const wx = Store.derive.todayWeather();
    if (wx) document.body.setAttribute('data-weather', wx); else document.body.removeAttribute('data-weather');
  }

  // ---- boot ---------------------------------------------------------------
  function boot() {
    I18N.init();
    Store.load();
    if (Store.get('settings.lang')) I18N.setLang(Store.get('settings.lang'));
    else Store.set('settings.lang', I18N.lang);

    applyTheme();
    applyWeatherTint();
    Native.init();
    Anchor.setHandler(navigate);

    // re-render the whole app when language or data changes meaningfully
    I18N.onChange(() => { applyTheme(); if (Store.get('profile.onboarded')) { buildTabbar(); Anchor.refresh(); } });
    Store.on('change', () => applyWeatherTint());
    Store.on('settings', () => applyTheme());

    gate();
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
    if (!Store.get('profile.onboarded')) {
      hideChrome(true);
      Onboarding.start(() => { hideChrome(false); startApp(); });
    } else {
      startApp();
    }
  }

  function startApp() {
    hideChrome(false);
    wireChrome();
    buildTabbar();
    Native.syncReminders && Native.syncReminders();
    if (Bridge.configured()) Bridge.poll(6000);
    if (window.Night && Night.isActive()) { Night.check(); Anchor.go('home'); return; }
    // first run after onboarding: introduce every feature (once)
    if (window.Guide && Guide.maybeAutoShow()) return;
    Anchor.go('home');
  }

  function hideChrome(hidden) {
    topbarEl().style.display = hidden ? 'none' : '';
    tabbarEl().style.display = hidden ? 'none' : '';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.App = { boot, gate, startApp, applyTheme, applyAccent, applyWeatherTint, buildTabbar, hideChrome, ACCENTS };
})();
