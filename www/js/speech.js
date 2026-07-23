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

  const _voiceCache = {};                 // langCode -> chosen SpeechSynthesisVoice
  function loadVoices() {
    try { _voices = (synth && synth.getVoices()) || []; } catch { _voices = []; }
    for (const k in _voiceCache) delete _voiceCache[k];   // re-pick once real voices arrive
  }
  if (synth) { loadVoices(); try { synth.onvoiceschanged = loadVoices; } catch {} }

  // The single biggest cause of "robotic" TTS is the engine defaulting to a
  // low-fidelity *compact* system voice. So instead of taking the first match
  // we SCORE every candidate and pick the most human one: Siri / Enhanced /
  // Premium / Neural and known-natural named voices win; the compact voices and
  // the old novelty voices (Albert, Zarvox, Fred…) are actively penalised.
  const QUALITY_RX = /(enhanced|premium|neural|natural|online)/;
  const GOOD_NAMES = ['samantha', 'ava', 'allison', 'susan', 'zoe', 'nicky', 'aaron', 'evan', 'joelle',
    'serena', 'moira', 'tessa', 'karen', 'daniel', 'google us english', 'google uk english female'];
  const NOVELTY = ['albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'wobble', 'deranged',
    'good news', 'jester', 'organ', 'superstar', 'trinoids', 'whisper', 'zarvox', 'fred', 'junior',
    'ralph', 'kathy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley', 'eddy', 'rishi'];

  function scoreVoice(v, lc, base) {
    const name = (v.name || '').toLowerCase();
    const uri = (v.voiceURI || '').toLowerCase();
    const vlang = (v.lang || '').toLowerCase();
    let score = 0;
    if (vlang === lc) score += 40; else if (vlang.startsWith(base)) score += 22; else score -= 30;
    if (/siri/.test(name) || /siri/.test(uri)) score += 45;             // Apple's best
    if (QUALITY_RX.test(name) || QUALITY_RX.test(uri)) score += 32;     // enhanced/premium/neural
    if (name.includes('google')) score += 26;                          // Chrome/Android natural
    if (/microsoft/.test(name) && QUALITY_RX.test(name)) score += 24;
    if (GOOD_NAMES.some(g => name.includes(g))) score += 16;
    if (uri.includes('compact') || name.includes('compact')) score -= 30;  // the robotic ones
    if (NOVELTY.some(n => name.includes(n))) score -= 60;
    if (v.localService) score += 2;                                    // small reliability nudge
    return score;
  }

  function pickVoice(langCode) {
    if (!_voices.length) loadVoices();
    const lc = (langCode || 'en-US').toLowerCase();
    if (_voiceCache[lc]) return _voiceCache[lc];
    const base = lc.split('-')[0];
    let pool = _voices.filter(v => (v.lang || '').toLowerCase().startsWith(base));
    if (!pool.length) pool = _voices.slice();
    if (!pool.length) return null;
    let best = null, bestScore = -Infinity;
    for (const v of pool) { const s = scoreVoice(v, lc, base); if (s > bestScore) { bestScore = s; best = v; } }
    _voiceCache[lc] = best;
    return best;
  }

  // Split long text into sentence-sized chunks. Speaking one giant utterance is
  // what makes read-aloud sound flat and monotone (and iOS/Chrome will cut it
  // off mid-way); chunk-by-sentence gives natural breath-pauses and reliability.
  function chunkText(text) {
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (clean.length <= 170) return [clean];
    const parts = clean.match(/[^.!?…]+[.!?…]+["'”’)]*|\S[^.!?…]*$/g) || [clean];
    const chunks = []; let cur = '';
    for (const p of parts) {
      const piece = p.trim();
      if (cur && (cur + ' ' + piece).length > 170) { chunks.push(cur); cur = piece; }
      else cur = cur ? cur + ' ' + piece : piece;
    }
    if (cur) chunks.push(cur);
    return chunks;
  }

  function ttsSupported() { return !!synth && typeof SpeechSynthesisUtterance !== 'undefined'; }
  function sttSupported() { return !!SR; }

  function lang() {
    const code = (window.I18N && I18N.lang) || 'en';
    // a few region hints so voices sound right
    const map = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', it: 'it-IT', nl: 'nl-NL', sv: 'sv-SE', pl: 'pl-PL', uk: 'uk-UA', ru: 'ru-RU', tr: 'tr-TR', ar: 'ar-SA', hi: 'hi-IN', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', id: 'id-ID', vi: 'vi-VN', th: 'th-TH' };
    return map[code] || 'en-US';
  }

  let _token = 0;                          // cancels a stale queue if speak() re-fires
  function speak(text, opts) {
    opts = opts || {};
    if (!ttsSupported() || !text) return false;
    try { synth.cancel(); } catch {}
    const useLang = opts.lang || lang();
    const voice = pickVoice(useLang);
    const chunks = chunkText(text);
    // Gentle, human prosody: a touch under natural speed, near-neutral pitch.
    const rate = opts.rate || 0.96;
    const pitch = opts.pitch == null ? 1.03 : opts.pitch;
    const vol = opts.volume == null ? 1 : opts.volume;
    const myToken = ++_token;
    _speaking = true;
    let i = 0;
    const next = () => {
      if (myToken !== _token) return;                 // superseded by a newer speak()/stop()
      if (i >= chunks.length) { _speaking = false; opts.onEnd && opts.onEnd(); return; }
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      u.lang = useLang;
      if (voice) u.voice = voice;
      u.rate = rate; u.pitch = pitch; u.volume = vol;
      u.onend = () => next();
      u.onerror = () => { if (myToken === _token) { _speaking = false; opts.onEnd && opts.onEnd(); } };
      try { synth.speak(u); } catch { _speaking = false; opts.onEnd && opts.onEnd(); }
    };
    // Small defer: iOS/Safari can drop a speak() issued in the same tick as cancel().
    setTimeout(next, 45);
    return true;
  }
  function stop() { _token++; if (synth) { try { synth.cancel(); } catch {} } _speaking = false; }
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
