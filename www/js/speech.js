// ===========================================================================
// speech.js — accessibility voice layer.
//   Speech.speak(text)      — Text-to-Speech (read aloud) via Web Speech API
//   Speech.stop()           — stop speaking
//   Speech.toggle(text)     — speak, or stop if already reading
//   Speech.listen(el, opts) — Speech-to-Text dictation into an input/textarea
//   Speech.ttsSupported() / Speech.sttSupported()
// Degrades silently where the platform lacks support (e.g. some webviews).
// ===========================================================================
(function () {
  const synth = window.speechSynthesis || null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let _speaking = false;
  let _voices = [];

  function loadVoices() { try { _voices = (synth && synth.getVoices()) || []; } catch { _voices = []; } }
  if (synth) { loadVoices(); try { synth.onvoiceschanged = loadVoices; } catch {} }

  // Pick the most natural-sounding installed voice for the language. Apple's
  // "Samantha" + the Enhanced/Premium/Neural variants are far less robotic than
  // the default compact voice.
  function pickVoice(langCode) {
    if (!_voices.length) loadVoices();
    const lc = (langCode || 'en-US').toLowerCase();
    const base = lc.split('-')[0];
    const inLang = _voices.filter(v => (v.lang || '').toLowerCase().startsWith(base));
    const pool = inLang.length ? inLang : _voices;
    const prefer = ['premium', 'enhanced', 'neural', 'natural', 'siri', 'samantha', 'ava', 'allison', 'zoe', 'serena', 'google', 'aaron'];
    for (const p of prefer) { const m = pool.find(v => (v.name || '').toLowerCase().includes(p)); if (m) return m; }
    return pool.find(v => (v.lang || '').toLowerCase() === lc) || pool[0] || null;
  }

  function ttsSupported() { return !!synth && typeof SpeechSynthesisUtterance !== 'undefined'; }
  function sttSupported() { return !!SR; }

  function lang() {
    const code = (window.I18N && I18N.lang) || 'en';
    // a few region hints so voices sound right
    const map = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', it: 'it-IT', nl: 'nl-NL', sv: 'sv-SE', pl: 'pl-PL', uk: 'uk-UA', ru: 'ru-RU', tr: 'tr-TR', ar: 'ar-SA', hi: 'hi-IN', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', id: 'id-ID', vi: 'vi-VN', th: 'th-TH' };
    return map[code] || 'en-US';
  }

  function speak(text, opts) {
    opts = opts || {};
    if (!ttsSupported() || !text) return false;
    try { synth.cancel(); } catch {}
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = opts.lang || lang();
    const voice = pickVoice(u.lang);
    if (voice) u.voice = voice;
    // a touch slower + a hair higher pitch reads warmer / less robotic
    u.rate = opts.rate || 0.92;
    u.pitch = opts.pitch || 1.05;
    u.onend = () => { _speaking = false; opts.onEnd && opts.onEnd(); };
    u.onerror = () => { _speaking = false; opts.onEnd && opts.onEnd(); };
    _speaking = true;
    try { synth.speak(u); } catch { _speaking = false; return false; }
    return true;
  }
  function stop() { if (synth) { try { synth.cancel(); } catch {} } _speaking = false; }
  function speaking() { return _speaking || (synth && synth.speaking); }
  function toggle(text, opts) { if (speaking()) { stop(); return false; } return speak(text, opts); }

  // A small reusable "read aloud" button. Pass a function returning the text.
  function readButton(getText, opts) {
    opts = opts || {};
    if (!ttsSupported()) return null;
    const btn = UI.el('button', { class: 'icon-btn tts-btn', 'aria-label': 'Read aloud', title: 'Read aloud' },
      UI.frag('<span style="width:18px;height:18px;display:inline-flex">' + Icons.get('sound') + '</span>'));
    btn.onclick = (e) => {
      e.stopPropagation();
      if (speaking()) { stop(); btn.classList.remove('on'); return; }
      const ok = speak(typeof getText === 'function' ? getText() : getText, { onEnd: () => btn.classList.remove('on') });
      if (ok) { btn.classList.add('on'); UI.haptic('light'); }
    };
    return btn;
  }

  // Dictation: streams recognized words into a target <input>/<textarea>.
  function listen(target, opts) {
    opts = opts || {};
    if (!sttSupported()) { UI.toast(opts.unsupportedMsg || 'Voice input not available here', 'bad'); return null; }
    const rec = new SR();
    rec.lang = opts.lang || lang();
    rec.interimResults = true;
    rec.continuous = false;
    const base = (target.value || '');
    let finalText = '';
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      const sep = base && !/\s$/.test(base) ? ' ' : '';
      target.value = base + sep + finalText + interim;
      if (opts.onInput) opts.onInput();
    };
    rec.onerror = () => { opts.onEnd && opts.onEnd(); };
    rec.onend = () => { opts.onEnd && opts.onEnd(); };
    try { rec.start(); } catch { return null; }
    return rec;
  }

  // Mic button that toggles dictation into `target`.
  function micButton(target, opts) {
    opts = opts || {};
    if (!sttSupported()) return null;
    let rec = null;
    const btn = UI.el('button', { class: 'icon-btn mic-btn', 'aria-label': 'Dictate', title: 'Dictate' },
      UI.frag('<span style="width:18px;height:18px;display:inline-flex">' + Icons.get('sound') + '</span>'));
    btn.onclick = (e) => {
      e.stopPropagation();
      if (rec) { try { rec.stop(); } catch {} rec = null; btn.classList.remove('on'); return; }
      rec = listen(target, { onInput: opts.onInput, onEnd: () => { rec = null; btn.classList.remove('on'); } });
      if (rec) { btn.classList.add('on'); UI.haptic('light'); }
    };
    return btn;
  }

  window.Speech = { speak, stop, toggle, speaking, ttsSupported, sttSupported, readButton, listen, micButton };
})();
