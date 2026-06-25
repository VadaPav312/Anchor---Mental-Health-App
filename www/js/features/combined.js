// ===========================================================================
// combined.js — merges related features under one roof so the app feels
// coherent instead of like a pile of separate screens.
//
//   Journey = Timeline · Weekly Review           (looking back / growth)
//   Calm    = Wind-down · Grounding               (regulating, day or night)
//
// Each combined view renders ONE header + a segmented switcher, then delegates
// to the existing sub-view's render() into a sub-container. The sub-views stay
// registered (so the coach tour / deep-links still work) but their own redundant
// page-heads are stripped — a MutationObserver keeps it clean even when a sub
// re-renders itself (e.g. the wind-down ritual stepping forward).
// ===========================================================================
(function () {
  function makeCombined(cfg) {
    let active = cfg.tabs[0].value;
    let _obs = null;

    function render(root, params) {
      if (params && params.tab && cfg.tabs.some(x => x.value === params.tab)) active = params.tab;
      root.appendChild(UI.el('div', { class: 'page-head' }, [
        UI.el('h1', { class: 'page-title serif' }, t(cfg.titleKey)),
        cfg.subKey ? UI.el('div', { class: 'eyebrow', style: { marginTop: '4px' } }, t(cfg.subKey)) : null,
      ]));

      root.appendChild(UI.el('div', { style: { margin: '0 var(--s1) var(--s4)' } }, [
        UI.segmented(cfg.tabs.map(tb => ({ value: tb.value, label: tb.label() })), active, (v) => {
          active = v; UI.haptic('light'); Anchor.refresh();
        }),
      ]));

      const sub = UI.el('div', { class: 'combined-sub' });
      root.appendChild(sub);

      const tab = cfg.tabs.find(x => x.value === active) || cfg.tabs[0];
      const view = Anchor.byId(tab.viewId);
      if (view) { try { view.render(sub, {}); } catch (e) { console.warn('combined render', cfg.id, e); } }

      const strip = () => sub.querySelectorAll('.page-head').forEach(ph => ph.remove());
      strip();
      if (_obs) { _obs.disconnect(); _obs = null; }
      if (window.MutationObserver) { _obs = new MutationObserver(strip); _obs.observe(sub, { childList: true, subtree: true }); }
    }

    function onShow(params) {
      const tab = cfg.tabs.find(x => x.value === active) || cfg.tabs[0];
      const view = Anchor.byId(tab.viewId);
      if (view && view.onShow) { try { view.onShow(params || {}); } catch (e) {} }
    }

    Anchor.register({ id: cfg.id, labelKey: cfg.labelKey, icon: cfg.icon, order: cfg.order, tab: false, render, onShow });
  }

  // ---- Journey: everything retrospective, in one place ----------------------
  makeCombined({
    id: 'journey', labelKey: 'nav.journey', icon: 'trend', order: 65,
    titleKey: 'nav.journey', subKey: 'journey.sub',
    tabs: [
      { value: 'patterns', viewId: 'patterns', label: () => t('nav.patterns') },
      { value: 'progress', viewId: 'progress', label: () => t('prog.tab') },
      { value: 'timeline', viewId: 'timeline', label: () => t('tl.title') },
      { value: 'review',   viewId: 'review',   label: () => t('rev.tab') },
    ],
  });

  // ---- Calm: regulate your system (Wind-down now lives on the main bar) ------
  makeCombined({
    id: 'calm', labelKey: 'nav.calm', icon: 'leaf', order: 45,
    titleKey: 'nav.calm', subKey: 'calm.sub',
    tabs: [
      { value: 'ground',   viewId: 'toolkit',    label: () => t('tk.title') },
      { value: 'sounds',   viewId: 'sounds',     label: () => t('snd.tab') },
    ],
  });
})();
