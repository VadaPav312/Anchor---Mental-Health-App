// ===========================================================================
// registry.js — the view/plugin registry. Loaded BEFORE feature modules so each
// feature can self-register at parse time:
//
//   Anchor.register({
//     id: 'patterns',
//     labelKey: 'nav.patterns',     // i18n key for the tab/menu label
//     icon: 'patterns',             // Icons.get(name)
//     order: 30,                    // sort order in tab bar / more menu
//     tab: true,                    // show in the bottom tab bar (else "More")
//     render(container, params) {}, // paint the view into `container`
//     onShow() {},                  // optional: called after render
//   });
//
// app.js installs the navigation handler via Anchor.setHandler() and owns the
// actual rendering + transitions. Keeping the registry separate lets feature
// files load in any order and lets app.js boot last.
// ===========================================================================
window.Anchor = {
  views: [],
  _handler: null,
  _state: { current: null, params: null },

  register(v) {
    if (!v || !v.id) return;
    if (this.views.some(x => x.id === v.id)) return;
    v.order = v.order == null ? 50 : v.order;
    this.views.push(v);
    this.views.sort((a, b) => a.order - b.order);
  },

  byId(id) { return this.views.find(v => v.id === id); },
  tabs() { return this.views.filter(v => v.tab); },
  extras() { return this.views.filter(v => !v.tab); },

  get current() { return this._state.current; },
  get params() { return this._state.params; },

  go(id, params) { if (this._handler) this._handler(id, params, false); },
  refresh() { if (this._handler && this._state.current) this._handler(this._state.current, this._state.params, true); },

  setHandler(fn) { this._handler = fn; },
};
