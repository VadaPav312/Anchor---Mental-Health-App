// ===========================================================================
// crisis.js — the lifeline. Support & safety, always one tap away (the ♥ in
// the top bar). Clearly frames Anchor as a companion, not a clinician, and
// routes to real human help. Includes a 60-second breathing reset.
//
// Helplines are intentionally broad/international — Anchor can't know every
// locale, so it points to directories that do, plus a few major lines.
// ===========================================================================
(function () {
  const RESOURCES = [
    { region: 'International', name: 'Find A Helpline', detail: 'Free, confidential lines in 130+ countries', url: 'https://findahelpline.com' },
    { region: 'International', name: 'Befrienders Worldwide', detail: 'Emotional support centers globally', url: 'https://www.befrienders.org' },
    { region: 'US & Canada', name: '988 Suicide & Crisis Lifeline', detail: 'Call or text 988', url: 'tel:988' },
    { region: 'UK & ROI', name: 'Samaritans', detail: 'Call 116 123, free anytime', url: 'tel:116123' },
    { region: 'EU', name: 'European emergency line', detail: 'Call 112', url: 'tel:112' },
    { region: 'Crisis Text', name: 'Crisis Text Line', detail: 'Text HOME to 741741 (US/CA/UK/IE)', url: 'sms:741741' },
  ];

  function open() {
    UI.haptic('light');
    const body = UI.el('div', { class: 'col gap3' }, [
      UI.el('p', { class: 'soft', style: { lineHeight: '1.55' } }, t('care.sub')),

      // immediate danger
      UI.el('div', { class: 'glass-card card-tight', style: { borderColor: 'rgba(255,138,156,0.4)' } }, [
        UI.el('div', { class: 'b', style: { color: 'var(--bad)' } }, t('care.crisisNow')),
        UI.el('div', { class: 'small soft mt1' }, t('care.crisisNowSub')),
        UI.el('a', { class: 'btn btn-primary btn-block mt3', href: 'tel:112', style: { background: 'linear-gradient(120deg,#ff8a9c,#ff6f8c)' } }, '⛑  ' + t('care.talkNow')),
      ]),

      // breathing reset
      UI.el('button', { class: 'btn btn-ghost btn-block', onclick: () => { sheet.close(); breathing(); } }, '🫁  ' + t('care.breathe')),

      // resources
      UI.el('div', { class: 'eyebrow mt2' }, t('care.resources')),
      UI.el('div', { class: 'glass-card', style: { padding: '6px 14px' } },
        RESOURCES.map(r => UI.el('a', { class: 'lrow tap', href: r.url, target: '_blank', rel: 'noopener' }, [
          UI.el('div', { class: 'lr-ico' }, '☎'),
          UI.el('div', { class: 'lr-body' }, [
            UI.el('div', { class: 'lr-title' }, r.name),
            UI.el('div', { class: 'lr-sub' }, r.detail),
          ]),
          UI.el('div', { class: 'lr-meta tiny' }, r.region),
        ]))
      ),
      UI.el('a', { class: 'btn btn-block mt1', href: 'https://findahelpline.com', target: '_blank', rel: 'noopener' }, t('care.findHelp')),

      UI.el('p', { class: 'tiny muted tac', style: { lineHeight: '1.5', marginTop: '6px' } }, t('care.reminder')),
      UI.el('p', { class: 'tiny muted tac' }, t('care.disclaimer')),
    ]);

    const sheet = UI.sheet({ title: '♥  ' + t('care.title'), body });
  }

  // A calm box-breathing animation: inhale 4 / hold 4 / exhale 4 / hold 4.
  function breathing() {
    const orb = UI.el('div', { class: 'breath-orb', style: {
      width: '160px', height: '160px', borderRadius: '50%', margin: '20px auto',
      background: 'radial-gradient(circle at 40% 35%, var(--a3), var(--a1) 70%)',
      boxShadow: '0 0 60px -6px var(--a1)', transition: 'transform 4s var(--ease-in-out)',
    } });
    const phase = UI.el('div', { class: 'b big tac', style: { minHeight: '32px' } }, t('care.breathe'));
    const sub = UI.el('div', { class: 'small muted tac' }, '');
    const steps = [['Breathe in', 1.35], ['Hold', 1.35], ['Breathe out', 0.7], ['Hold', 0.7]];
    let i = 0, timer = null;
    function run() {
      const [label, scale] = steps[i % 4];
      phase.textContent = label;
      orb.style.transform = 'scale(' + scale + ')';
      i++;
      timer = setTimeout(run, 4000);
    }
    const m = UI.modal({
      title: null,
      body: UI.el('div', { class: 'col center' }, [orb, phase, sub, UI.el('div', { class: 'tiny muted mt3 tac' }, t('care.reminder'))]),
      actions: [UI.el('button', { class: 'btn btn-primary btn-sm', onclick: () => { clearTimeout(timer); m.close(); } }, t('app.done'))],
      onClose: () => clearTimeout(timer),
    });
    run();
  }

  window.Crisis = { open, breathing, RESOURCES };
})();
