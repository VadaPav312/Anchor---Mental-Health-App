// ===========================================================================
// hub.js — the "You" tab. Replaces the old flat "More" sheet with a warm,
// grouped home for everything that isn't a primary tab. Features are organized
// by intent (Reflect / Grow / Steady yourself) so the app feels coherent rather
// than like a pile of screens, and several cards carry a live stat so the hub
// itself reflects the user back to them.
// ===========================================================================
(function () {
  const E = UI.el;

  // intent → [ {id, statFn} ] referencing registered feature views
  const GROUPS = [
    { key: 'reflect', icon: 'mirror', items: [
      { id: 'journal', stat: () => Store.journal.count() + ' ' + (Store.journal.count() === 1 ? t('jour.entries', { count: 1 }).replace(/^\d+\s*/, '') : t('jour.entries', { count: 2 }).replace(/^\d+\s*/, '')) },
      { id: 'mirror' },
      { id: 'timeline' },
      { id: 'checkin', stat: () => Store.derive.dayMood(Store.today()) ? '✓' : '' },
    ] },
    { key: 'grow', icon: 'leaf', items: [
      { id: 'experiments', stat: () => { const a = Store.derive.activeExperiment(); return a ? '●' : ''; } },
      { id: 'review' },
      { id: 'garden', stat: () => Store.streak() > 1 ? '🔥' + Store.streak() : '' },
      { id: 'values' },
    ] },
    { key: 'resource', icon: 'wind', items: [
      { id: 'toolkit' },
      { id: 'energy', stat: () => { const e = Store.derive.energyToday(); return e.count ? UI.fmt.signed(e.net) : ''; } },
      { id: 'sleep', stat: () => { const s = Store.derive.lastSleep(); return s ? s.score : ''; } },
      { id: 'monitor', stat: () => (Bridge && Bridge.state && Bridge.state.connected) ? '●' : '' },
    ] },
  ];

  function header() {
    const acct = window.Auth && Auth.account();
    const created = Store.get('profile.createdAt');
    const days = created ? Math.max(1, Math.round((Date.now() - created) / 86400000)) : 1;
    return E('div', { class: 'glass-card card', style: { background: 'linear-gradient(135deg, rgba(124,156,255,0.2), rgba(157,124,255,0.1) 60%, rgba(95,224,200,0.12))' } }, [
      E('div', { class: 'row between' }, [
        E('div', {}, [
          E('div', { class: 'eyebrow' }, t('hub.title')),
          E('div', { class: 'serif', style: { fontSize: '1.6rem', marginTop: '2px' } }, Store.profile.name()),
        ]),
        E('div', { class: 'row gap2 wrap', style: { justifyContent: 'flex-end' } }, [
          window.Gamify ? E('span', { class: 'pill-stat' }, '✨ ' + t('gam.lvlShort', { n: Gamify.progress().level })) : null,
          Store.streak() > 1 ? E('span', { class: 'pill-stat' }, '🔥 ' + Store.streak()) : null,
          E('span', { class: 'pill-stat' }, '⚓ ' + t('hub.daysWith', { n: days })),
        ]),
      ]),
    ]);
  }

  function tileFor(item) {
    const v = Anchor.byId(item.id);
    if (!v) return null;
    let stat = '';
    try { stat = item.stat ? item.stat() : ''; } catch { stat = ''; }
    return E('button', { class: 'glass-card card-tight hub-tile', style: {
      display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left',
      borderRadius: 'var(--r-lg)', minHeight: '92px', justifyContent: 'space-between',
    }, onclick: () => { UI.haptic('light'); Anchor.go(item.id); } }, [
      E('div', { class: 'row between', style: { alignItems: 'flex-start' } }, [
        UI.frag(`<span style="width:24px;height:24px;color:var(--a1)">${Icons.get(v.icon)}</span>`),
        stat ? E('span', { class: 'tiny b', style: { color: 'var(--ink-soft)' } }, String(stat)) : null,
      ]),
      E('span', { class: 'b small' }, t(v.labelKey)),
    ]);
  }

  function group(g) {
    const tiles = g.items.map(tileFor).filter(Boolean);
    if (!tiles.length) return null;
    return E('div', {}, [
      E('div', { class: 'sect', style: { margin: '6px 4px 4px' } }, [
        E('h3', { style: { fontSize: '0.98rem' } }, t('hub.' + g.key)),
      ]),
      E('div', { class: 'small muted', style: { margin: '0 4px 10px' } }, t('hub.' + g.key + 'Sub')),
      E('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s3)' } }, tiles),
    ]);
  }

  function render(root) {
    root.appendChild(E('div', { class: 'page-head' }, [
      E('div', { class: 'eyebrow' }, t('hub.sub')),
      E('h1', { class: 'page-title serif' }, t('hub.title')),
    ]));

    const col = E('div', { class: 'col gap5 stagger' });
    root.appendChild(col);

    col.appendChild(header());
    GROUPS.forEach(g => { const el = group(g); if (el) col.appendChild(el); });

    // account & settings row
    col.appendChild(E('div', { class: 'col gap2', style: { marginTop: '6px' } }, [
      E('div', { class: 'eyebrow', style: { margin: '0 4px 4px' } }, t('hub.account')),
      window.Guide ? E('button', { class: 'lrow tap glass-card', style: { width: '100%', padding: '12px 16px' }, onclick: () => Guide.start() }, [
        UI.frag(`<span class="lr-ico">${Icons.get('spark')}</span>`),
        E('div', { class: 'lr-body' }, [E('div', { class: 'lr-title' }, t('tour.again'))]),
        UI.frag(`<span class="lr-meta" style="width:18px">${Icons.get('chevron')}</span>`),
      ]) : null,
      E('button', { class: 'lrow tap glass-card', style: { width: '100%', padding: '12px 16px' }, onclick: () => Anchor.go('settings') }, [
        UI.frag(`<span class="lr-ico">${Icons.get('settings')}</span>`),
        E('div', { class: 'lr-body' }, [E('div', { class: 'lr-title' }, t('set.title'))]),
        UI.frag(`<span class="lr-meta" style="width:18px">${Icons.get('chevron')}</span>`),
      ]),
      window.Auth ? E('button', { class: 'lrow tap glass-card', style: { width: '100%', padding: '12px 16px' }, onclick: () => Auth.signOut() }, [
        UI.frag(`<span class="lr-ico">${Icons.get('lock')}</span>`),
        E('div', { class: 'lr-body' }, [E('div', { class: 'lr-title' }, t('auth.signOut'))]),
      ]) : null,
    ]));
  }

  Anchor.register({ id: 'hub', labelKey: 'hub.title', icon: 'grid', order: 90, tab: false, render });
})();
