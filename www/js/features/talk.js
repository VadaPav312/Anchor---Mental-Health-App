// ===========================================================================
// talk.js — "Talk to Anchor": a hands-free voice conversation. The person taps
// the mic and speaks; the browser transcribes it (Web Speech STT), the AI
// replies (LLM.chat), and the reply is read back aloud (Web Speech TTS). A text
// box is always available as a fallback where the mic isn't supported.
//
// Reuses Speech (speech.js) for STT/TTS and LLM (llm.js) for the reply.
// Registers as Anchor.register({ id:'talk', ... }).
// ===========================================================================
(function () {
  const E = UI.el;

  // Conversation + UI state persist across re-renders within a session.
  let convo = [];            // [{ role:'user'|'assistant', content }]
  let state = 'idle';        // 'idle' | 'listening' | 'thinking' | 'speaking'
  let rec = null;            // active SpeechRecognition handle
  let scratch = null;        // hidden textarea used as the STT sink
  let speakReplies = null;   // read replies aloud? (null → follow settings.tts)

  // live DOM refs (re-bound each render)
  let logEl = null, captionEl = null, micBtn = null, micLabel = null, textInput = null;

  function sttOK() { return !!(window.Speech && Speech.sttSupported()); }
  function ttsOK() { return !!(window.Speech && Speech.ttsSupported()); }
  function wantsSpeak() {
    if (speakReplies == null) speakReplies = Store.get('settings.tts', true) !== false;
    return speakReplies && ttsOK();
  }

  // ---- conversation rendering ----------------------------------------------
  function bubble(role, content) {
    return E('div', { class: 'talk-bubble ' + (role === 'user' ? 'me' : 'ai') }, [
      role === 'assistant'
        ? E('div', { class: 'talk-who' }, [
            UI.frag('<span style="width:14px;height:14px;display:inline-flex;color:var(--a1)">' + Icons.get('spark') + '</span>'),
            E('span', {}, 'Anchor'),
          ])
        : null,
      E('div', { class: 'talk-text' }, content),
    ]);
  }

  function paintLog() {
    if (!logEl) return;
    UI.clear(logEl);
    if (!convo.length) {
      logEl.appendChild(E('div', { class: 'talk-empty soft' }, [
        E('div', { style: { fontSize: '2.4rem', marginBottom: '10px' } }, '🎙️'),
        E('div', { class: 'small', style: { lineHeight: '1.6', maxWidth: '320px', margin: '0 auto' } }, t('talk.empty')),
      ]));
    } else {
      convo.forEach(m => logEl.appendChild(bubble(m.role, m.content)));
    }
    scrollLog();
  }

  function scrollLog() { if (logEl) requestAnimationFrame(() => { logEl.scrollTop = logEl.scrollHeight; }); }

  function addMsg(role, content) {
    convo.push({ role, content });
    if (logEl) {
      if (convo.length === 1) UI.clear(logEl);   // drop the empty-state
      logEl.appendChild(bubble(role, content));
      scrollLog();
    }
  }

  // ---- mic button state ----------------------------------------------------
  function setState(s) { state = s; paintMic(); }

  function paintMic() {
    if (!micBtn) return;
    micBtn.classList.toggle('listening', state === 'listening');
    micBtn.classList.toggle('busy', state === 'thinking' || state === 'speaking');
    micBtn.disabled = state === 'thinking';
    const ico = micBtn.querySelector('.talk-mic-ico');
    if (state === 'thinking') { UI.clear(ico); ico.appendChild(UI.thinking()); }
    else {
      const name = state === 'speaking' ? 'sound' : 'mic';
      ico.innerHTML = '<span style="width:30px;height:30px;display:inline-flex">' + Icons.get(name) + '</span>';
    }
    if (micLabel) {
      micLabel.textContent =
        state === 'listening' ? t('talk.listening') :
        state === 'thinking' ? t('talk.thinking') :
        state === 'speaking' ? t('talk.tapToStop') :
        t('talk.tapToTalk');
    }
    if (captionEl && state !== 'listening') captionEl.textContent = '';
  }

  // ---- speech-to-text turn --------------------------------------------------
  function startListen() {
    if (!sttOK()) { UI.toast(t('talk.noMic'), 'bad'); return; }
    Speech.stop();                                   // stop any read-aloud first
    if (!scratch) scratch = E('textarea', { style: { position: 'absolute', left: '-9999px', width: '1px', height: '1px' } });
    scratch.value = '';
    setState('listening');
    UI.haptic('light');
    rec = Speech.listen(scratch, {
      onInput: () => { if (captionEl) captionEl.textContent = scratch.value; },
      onEnd: () => {
        rec = null;
        const said = (scratch.value || '').trim();
        if (captionEl) captionEl.textContent = '';
        if (said) submit(said);
        else setState('idle');
      },
    });
    if (!rec) { setState('idle'); UI.toast(t('talk.noMic'), 'bad'); }
  }

  function stopListen() { if (rec) { try { rec.stop(); } catch {} rec = null; } }

  // ---- send a turn to the AI -----------------------------------------------
  async function submit(text) {
    if (!text || state === 'thinking') return;
    if (!(window.LLM && LLM.configured && LLM.configured())) {
      addMsg('user', text);
      addMsg('assistant', t('talk.needsAI'));
      setState('idle');
      return;
    }
    addMsg('user', text);
    setState('thinking');
    if (UI.startHum) UI.startHum();

    // keep the last several turns for context, plus a light situational note
    const history = convo.slice(-12).map(m => ({ role: m.role, content: m.content }));
    const wx = (window.Store && Store.derive && Store.derive.todayWeather && Store.derive.todayWeather());
    const name = (Store.profile && Store.profile.name && Store.profile.name()) || '';
    const extra = t('talk.system')
      + (name && name !== 'friend' ? ('\n\nThe person\'s name is ' + name + '.') : '')
      + (wx ? ('\n\nTheir logged inner-weather today reads "' + wx + '" — only reference it if relevant.') : '');

    try {
      const reply = (await LLM.chat(history, { systemExtra: extra, temperature: 0.75, lang: Store.get('settings.lang') })) || '';
      const clean = reply.trim();
      addMsg('assistant', clean);
      if (wantsSpeak() && clean) {
        setState('speaking');
        Speech.speak(clean, { onEnd: () => { if (state === 'speaking') setState('idle'); } });
      } else {
        setState('idle');
      }
    } catch (err) {
      addMsg('assistant', t('app.offline'));
      setState('idle');
    } finally {
      if (UI.stopHum) UI.stopHum();
    }
  }

  function onMicTap() {
    if (state === 'listening') { stopListen(); return; }        // stop → onEnd submits
    if (state === 'speaking') { Speech.stop(); setState('idle'); return; }
    if (state === 'thinking') return;
    startListen();
  }

  function sendTyped() {
    if (!textInput) return;
    const v = (textInput.value || '').trim();
    if (!v) return;
    textInput.value = '';
    submit(v);
  }

  // ---- teardown when navigating away ---------------------------------------
  function cleanup() { stopListen(); if (window.Speech) Speech.stop(); if (UI.stopHum) UI.stopHum(); state = 'idle'; }

  // ---- render ---------------------------------------------------------------
  function render(root) {
    // if we return to the view mid-speech, reset transient state
    if (state === 'listening' || state === 'thinking') state = 'idle';

    root.appendChild(E('div', { class: 'page-head' }, [
      E('h1', { class: 'page-title serif' }, t('talk.title')),
      E('div', { class: 'eyebrow', style: { marginTop: '4px' } }, t('talk.sub')),
    ]));

    const wrap = E('div', { class: 'talk-wrap' });
    root.appendChild(wrap);

    logEl = E('div', { class: 'talk-log' });
    wrap.appendChild(logEl);
    paintLog();

    captionEl = E('div', { class: 'talk-caption soft small' }, '');
    wrap.appendChild(captionEl);

    // ---- controls ----
    const controls = E('div', { class: 'talk-controls' });

    if (sttOK()) {
      micBtn = E('button', { class: 'talk-mic', 'aria-label': t('talk.tapToTalk'), onclick: onMicTap }, [
        E('span', { class: 'talk-mic-ico' }),
      ]);
      micLabel = E('div', { class: 'talk-mic-label small soft' }, '');
      controls.appendChild(micBtn);
      controls.appendChild(micLabel);
      paintMic();

      // read-aloud toggle (only meaningful when TTS exists). A plain div — the
      // switch itself is a <label>, so nesting another <label> would be invalid.
      if (ttsOK()) {
        controls.appendChild(E('div', { class: 'row center gap2 talk-tts-toggle small soft' }, [
          UI.switchToggle(wantsSpeak(), (on) => { speakReplies = on; if (!on) Speech.stop(); }),
          E('span', {}, t('talk.readAloud')),
        ]));
      }
    } else {
      controls.appendChild(E('div', { class: 'glass-card card small soft', style: { lineHeight: '1.6' } }, t('talk.noMicHint')));
    }

    // text fallback — always available (typing works everywhere)
    textInput = E('input', { class: 'input talk-input', type: 'text', placeholder: t('talk.typePlaceholder'),
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); sendTyped(); } } });
    const sendBtn = UI.btn(t('talk.send'), { class: 'btn-primary', icon: 'arrow', onClick: sendTyped });
    controls.appendChild(E('div', { class: 'talk-typerow row gap2' }, [
      E('div', { class: 'grow' }, [textInput]),
      sendBtn,
    ]));

    if (convo.length) {
      controls.appendChild(E('button', { class: 'btn btn-ghost btn-sm', style: { alignSelf: 'center', marginTop: '4px' },
        onclick: () => { cleanup(); convo = []; UI.haptic('light'); Anchor.refresh(); } }, t('talk.clear')));
    }

    wrap.appendChild(controls);
  }

  Anchor.register({
    id: 'talk',
    labelKey: 'nav.talk',
    icon: 'sound',
    order: 34,
    tab: false,
    render,
    onHide: cleanup,
  });
})();
