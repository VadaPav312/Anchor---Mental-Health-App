// ===========================================================================
// sounds.js — a colored-noise player for focus, calm and sleep.
// Generates white / pink / brown(red) / blue / violet / green noise with the
// Web Audio API (no audio files), loops it, with volume + a sleep timer.
// Registered as view 'sounds' and surfaced as a tab inside "Calm".
// ===========================================================================
(function () {
  // Every swatch is a tinted dot rendered the same way (no mismatched emoji —
  // there's no "pink circle" glyph, which is why pink used to be a lone flower).
  const COLORS = [
    { id: 'white',  tint: '#e8ecff' },
    { id: 'pink',   tint: '#ffb6d4' },
    { id: 'brown',  tint: '#c9a47a' },
    { id: 'blue',   tint: '#7cc0ff' },
    { id: 'violet', tint: '#c89dff' },
    { id: 'green',  tint: '#7fe0a8' },
  ];

  let ctx = null, srcNode = null, gainNode = null, current = null, vol = 0.5, timer = null, timerEndsAt = 0;

  function ensureCtx() {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    return ctx;
  }

  function buildBuffer(ac, type) {
    const len = 4 * ac.sampleRate;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let i;
    if (type === 'white') {
      for (i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else if (type === 'brown') {
      let last = 0;
      for (i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.4; }
    } else if (type === 'blue') {
      let last = 0;
      for (i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = (w - last) * 0.6; last = w; }
    } else if (type === 'violet') {
      let last = 0;
      for (i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = (w - last); last = w; }
    } else { // green — soft mid-band hush
      let last = 0;
      for (i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = 0.86 * last + 0.14 * w; d[i] = last * 1.9; }
    }
    // Normalize each colour to the same peak so the brighter, differentiated
    // noises (blue/violet) aren't near-silent next to white/brown — every colour
    // comes out clearly audible AND keeps its own character.
    let peak = 0;
    for (i = 0; i < len; i++) { const a = d[i] < 0 ? -d[i] : d[i]; if (a > peak) peak = a; }
    if (peak > 0.0001) { const norm = 0.85 / peak; for (i = 0; i < len; i++) d[i] *= norm; }
    return buf;
  }

  function play(type) {
    const ac = ensureCtx();
    if (!ac) { UI.toast(t('snd.unsupported'), 'bad'); return; }
    if (ac.state === 'suspended') { try { ac.resume(); } catch {} }
    stop(true);
    const src = ac.createBufferSource();
    src.buffer = buildBuffer(ac, type);
    src.loop = true;
    gainNode = ac.createGain(); gainNode.gain.value = vol;
    src.connect(gainNode); gainNode.connect(ac.destination);
    try { src.start(0); } catch {}
    srcNode = src; current = type;
    UI.haptic('light');
    paint();
  }
  function stop(keepUI) {
    if (srcNode) { try { srcNode.stop(); } catch {} try { srcNode.disconnect(); } catch {} srcNode = null; }
    if (gainNode) { try { gainNode.disconnect(); } catch {} gainNode = null; }
    current = null;
    if (timer) { clearTimeout(timer); timer = null; timerEndsAt = 0; }
    if (!keepUI) paint();
  }
  function setVol(v) { vol = Math.max(0, Math.min(1, v)); if (gainNode) gainNode.gain.value = vol; }
  function setTimer(mins) {
    if (timer) { clearTimeout(timer); timer = null; timerEndsAt = 0; }
    if (mins > 0) { timerEndsAt = Date.now() + mins * 60000; timer = setTimeout(() => { stop(); UI.toast(t('snd.timerDone'), 'good'); }, mins * 60000); }
    paint();
  }

  let _root = null;
  function paint() {
    if (!_root || !document.body.contains(_root)) return;
    _root.querySelectorAll('.snd-card').forEach(c => c.classList.toggle('on', c.dataset.snd === current));
    const status = _root.querySelector('#sndStatus');
    if (status) status.textContent = current ? t('snd.playing', { name: t('snd.' + current) }) : t('snd.tapToPlay');
    const tl = _root.querySelector('#sndTimerLabel');
    if (tl) tl.textContent = timerEndsAt ? t('snd.timerOn', { n: Math.max(1, Math.round((timerEndsAt - Date.now()) / 60000)) }) : '';
  }

  function render(root) {
    _root = root;
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('h1', { class: 'page-title serif' }, t('snd.title')),
      UI.el('div', { class: 'eyebrow', style: { marginTop: '4px' } }, t('snd.sub')),
    ]));

    const col = UI.el('div', { class: 'col gap4 stagger' });
    root.appendChild(col);

    col.appendChild(UI.el('div', { class: 'small soft tac', id: 'sndStatus', style: { marginBottom: '2px' } }, current ? t('snd.playing', { name: t('snd.' + current) }) : t('snd.tapToPlay')));

    const grid = UI.el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--s3)' } });
    COLORS.forEach(c => {
      const card = UI.el('button', { class: 'snd-card glass-card' + (current === c.id ? ' on' : ''), dataset: { snd: c.id }, style: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: 'var(--s4) var(--s2)',
        borderRadius: 'var(--r-lg)', minHeight: '94px', justifyContent: 'center',
        '--snd-tint': c.tint,
      }, onclick: () => { current === c.id ? stop() : play(c.id); } }, [
        UI.el('div', { class: 'snd-dot', style: {
          width: '34px', height: '34px', borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, #fff, ' + c.tint + ' 62%, ' + c.tint + ')',
          boxShadow: '0 4px 14px -4px ' + c.tint + ', inset 0 1px 0 rgba(255,255,255,0.6)',
        } }),
        UI.el('div', { class: 'tiny b' }, t('snd.' + c.id)),
      ]);
      grid.appendChild(card);
    });
    col.appendChild(grid);

    // volume
    const volSlider = UI.el('input', { class: 'range', type: 'range', min: 0, max: 100, value: Math.round(vol * 100),
      oninput: (e) => setVol(+e.target.value / 100) });
    col.appendChild(UI.el('div', { class: 'glass-card card' }, [
      UI.el('div', { class: 'row between', style: { marginBottom: '8px' } }, [
        UI.el('div', { class: 'b' }, t('snd.volume')),
        UI.frag('<span style="width:18px;height:18px;display:inline-flex;color:var(--a1)">' + Icons.get('sound') + '</span>'),
      ]),
      volSlider,
    ]));

    // sleep timer
    const timerRow = UI.el('div', { class: 'row wrap gap2' });
    [0, 15, 30, 60].forEach(m => {
      timerRow.appendChild(UI.el('button', { class: 'chip', onclick: (e) => {
        timerRow.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
        e.currentTarget.classList.add('active'); setTimer(m); UI.haptic('light');
      } }, m === 0 ? t('snd.timerOff') : t('snd.mins', { n: m })));
    });
    col.appendChild(UI.el('div', { class: 'glass-card card' }, [
      UI.el('div', { class: 'row between', style: { marginBottom: '10px' } }, [
        UI.el('div', { class: 'b' }, t('snd.sleepTimer')),
        UI.el('div', { class: 'tiny soft', id: 'sndTimerLabel' }, timerEndsAt ? t('snd.timerOn', { n: Math.max(1, Math.round((timerEndsAt - Date.now()) / 60000)) }) : ''),
      ]),
      timerRow,
    ]));

    if (current) col.appendChild(UI.btn(t('snd.stop'), { class: 'btn-ghost btn-block', icon: 'x', onClick: () => stop() }));
    col.appendChild(UI.el('div', { class: 'tiny muted tac', style: { marginTop: '4px', lineHeight: '1.5' } }, t('snd.note')));
  }

  Anchor.register({ id: 'sounds', labelKey: 'snd.title', icon: 'sound', order: 46, tab: false, render });
  window.Sounds = { play, stop, current: () => current };
})();
