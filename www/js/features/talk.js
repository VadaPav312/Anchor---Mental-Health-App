// ===========================================================================
// talk.js — "Talk to Anchor": a calm AI companion for stressful moments. It's a
// full chat, like any modern AI — type or speak, and Anchor replies. Replies
// stream in word-by-word (a soft fade) so nothing pops in all at once.
//
// Multiple conversations are supported and persisted on-device (Store.talkChats):
// start a new chat, switch between past chats, rename or delete them — just like
// a normal AI app. Everything stays local.
//
// Reuses Speech (speech.js) for optional voice STT/TTS and LLM (llm.js) for the
// reply. Registers as Anchor.register({ id:'talk', ... }).
// ===========================================================================
(function () {
  const E = UI.el;

  // ---- persistent multi-chat store ----------------------------------------
  // chats: [{ id, title, ts, updated, messages:[{role,content}] }] — newest first.
  let chats = null;
  let activeId = null;

  function blankChat() {
    const now = Date.now();
    return { id: Store.uid(), title: '', ts: now, updated: now, messages: [] };
  }
  function ensureLoaded() {
    if (chats) return;
    chats = Store.get('talkChats', null);
    if (!Array.isArray(chats)) chats = [];
    activeId = Store.get('talkActiveId', null);
    if (!chats.length) { const c = blankChat(); chats.unshift(c); activeId = c.id; }
    if (!chats.find(c => c.id === activeId)) activeId = chats[0].id;
    persist();
  }
  function persist() {
    Store.set('talkChats', chats);
    Store.set('talkActiveId', activeId);
  }
  function activeChat() { ensureLoaded(); return chats.find(c => c.id === activeId) || chats[0]; }
  function msgs() { return activeChat().messages; }
  function chatTitle(c) { return (c && c.title) || t('talk.untitled'); }
  function makeTitle(text) {
    const flat = (text || '').replace(/\s+/g, ' ').trim();
    return flat.length > 42 ? flat.slice(0, 42).replace(/\s+\S*$/, '') + '…' : flat;
  }
  function relTime(ts) {
    const d = Math.max(0, Date.now() - (ts || 0));
    const min = Math.round(d / 60000);
    if (min < 1) return t('talk.now');
    if (min < 60) return t('talk.minAgo', { n: min });
    const hr = Math.round(min / 60);
    if (hr < 24) return t('talk.hrAgo', { n: hr });
    const day = Math.round(hr / 24);
    return t('talk.dayAgo', { n: day });
  }

  // ---- transient UI state --------------------------------------------------
  let state = 'idle';        // 'idle' | 'listening' | 'thinking' | 'speaking'
  let rec = null;            // active SpeechRecognition handle
  let scratch = null;        // hidden textarea used as the STT sink
  let speakReplies = null;   // read replies aloud? (null → follow settings.tts)
  let revealTimers = [];     // word-reveal timers, cleared on teardown/switch

  // live DOM refs (re-bound each render)
  let logEl = null, captionEl = null, micBtn = null, micLabel = null, textInput = null, sendBtn = null;
  let switcherLbl = null, thinkEl = null;

  function sttOK() { return !!(window.Speech && Speech.sttSupported()); }
  function ttsOK() { return !!(window.Speech && Speech.ttsSupported()); }
  function wantsSpeak() {
    if (speakReplies == null) speakReplies = Store.get('settings.tts', true) !== false;
    return speakReplies && ttsOK();
  }
  function reduceMotion() {
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
  }

  // ---- conversation rendering ----------------------------------------------
  function whoRow() {
    return E('div', { class: 'talk-who' }, [
      UI.frag('<span style="width:14px;height:14px;display:inline-flex;color:var(--a1)">' + Icons.get('spark') + '</span>'),
      E('span', {}, 'Anchor'),
    ]);
  }
  function bubble(role, content, opts) {
    opts = opts || {};
    const textEl = E('div', { class: 'talk-text' });
    if (opts.reveal) revealInto(textEl, content, opts.onDone);
    else textEl.textContent = content;
    return E('div', { class: 'talk-bubble ' + (role === 'user' ? 'me' : 'ai') }, [
      role === 'assistant' ? whoRow() : null,
      textEl,
    ]);
  }

  // Reveal text one word at a time with a soft blur-fade — "streaming" the reply
  // in gently instead of dropping the whole block at once.
  function clearReveals() { revealTimers.forEach(id => clearTimeout(id)); revealTimers = []; }
  function revealInto(textEl, text, done) {
    const full = (text || '').trim();
    if (reduceMotion()) { textEl.textContent = full; if (done) done(); return; }
    const tokens = full.split(/(\s+)/);   // keep whitespace tokens
    textEl.textContent = '';
    let i = 0;
    const step = () => {
      if (i >= tokens.length) { if (done) done(); return; }
      const tok = tokens[i]; i++;
      if (/^\s+$/.test(tok)) { textEl.appendChild(document.createTextNode(tok)); step(); return; }
      const span = E('span', { class: 'talk-word' }, tok);
      textEl.appendChild(span);
      requestAnimationFrame(() => span.classList.add('in'));
      scrollLog();
      const delay = Math.min(95, 32 + tok.length * 4);
      revealTimers.push(setTimeout(step, delay));
    };
    step();
  }

  function paintLog() {
    if (!logEl) return;
    clearReveals();
    UI.clear(logEl);
    const list = msgs();
    if (!list.length) {
      logEl.appendChild(emptyState());
    } else {
      list.forEach(m => logEl.appendChild(bubble(m.role, m.content)));
    }
    scrollLog();
  }

  function emptyState() {
    const chip = (key) => E('button', {
      class: 'talk-suggest', onclick: () => { UI.haptic('light'); submit(t(key)); },
    }, t(key));
    return E('div', { class: 'talk-empty soft' }, [
      E('div', { class: 'talk-empty-orb' }, UI.frag('<span style="width:30px;height:30px;display:inline-flex">' + Icons.get('spark') + '</span>')),
      E('div', { class: 'talk-empty-title b' }, t('talk.emptyTitle')),
      E('div', { class: 'small', style: { lineHeight: '1.6', maxWidth: '300px', margin: '0 auto' } }, t('talk.empty')),
      E('div', { class: 'talk-suggests' }, [chip('talk.suggest1'), chip('talk.suggest2'), chip('talk.suggest3')]),
    ]);
  }

  function scrollLog() { if (logEl) requestAnimationFrame(() => { logEl.scrollTop = logEl.scrollHeight; }); }

  function addMsg(role, content, opts) {
    const chat = activeChat();
    const first = chat.messages.length === 0;
    chat.messages.push({ role, content });
    if (role === 'user' && !chat.title) { chat.title = makeTitle(content); refreshTitle(); }
    chat.updated = Date.now();
    persist();
    if (logEl) {
      if (first) UI.clear(logEl);   // drop the empty-state
      logEl.appendChild(bubble(role, content, opts));
      scrollLog();
    }
  }

  // AI "typing" indicator bubble, shown while we wait for the reply.
  function addThinking() {
    removeThinking();
    if (!logEl) return;
    thinkEl = E('div', { class: 'talk-bubble ai talk-typing-bubble' }, [
      whoRow(), E('div', { class: 'talk-typing' }, UI.thinking()),
    ]);
    logEl.appendChild(thinkEl);
    scrollLog();
  }
  function removeThinking() { if (thinkEl && thinkEl.parentNode) thinkEl.remove(); thinkEl = null; }

  // ---- mic button state ----------------------------------------------------
  function setState(s) { state = s; paintMic(); }

  function paintMic() {
    if (!micBtn) return;
    micBtn.classList.toggle('listening', state === 'listening');
    micBtn.classList.toggle('busy', state === 'thinking' || state === 'speaking');
    micBtn.disabled = state === 'thinking';
    const ico = micBtn.querySelector('.talk-mic-ico');
    if (ico) {
      if (state === 'thinking') { UI.clear(ico); ico.appendChild(UI.thinking()); }
      else {
        const name = state === 'speaking' ? 'sound' : 'mic';
        ico.innerHTML = '<span style="width:22px;height:22px;display:inline-flex">' + Icons.get(name) + '</span>';
      }
    }
    if (micLabel) {
      micLabel.textContent =
        state === 'listening' ? t('talk.listening') :
        state === 'thinking' ? t('talk.thinking') :
        state === 'speaking' ? t('talk.tapToStop') :
        '';
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
    text = (text || '').trim();
    if (!text || state === 'thinking') return;
    if (!(window.LLM && LLM.configured && LLM.configured())) {
      addMsg('user', text);
      addMsg('assistant', t('talk.needsAI'), { reveal: true });
      setState('idle');
      return;
    }
    addMsg('user', text);
    setState('thinking');
    addThinking();
    if (UI.startHum) UI.startHum();

    // keep the last several turns for context, plus a light situational note
    const history = msgs().slice(-12).map(m => ({ role: m.role, content: m.content }));
    const wx = (window.Store && Store.derive && Store.derive.todayWeather && Store.derive.todayWeather());
    const name = (Store.profile && Store.profile.name && Store.profile.name()) || '';
    const values = (window.Store && Store.values && Store.values.all) ? Store.values.all().map(v => v && v.name).filter(Boolean) : [];
    // The on-device Synthesis engine turns the user's raw streams into a
    // computed state model (trends, volatility, cumulative strain, evidence-
    // ranked levers). Injecting it here is what lets Anchor's replies be
    // grounded in who this person actually is right now, not generic.
    let stateBriefing = '';
    try { if (window.Synthesis && Synthesis.briefing) stateBriefing = Synthesis.briefing({ maxLen: 3600 }); } catch (e) { stateBriefing = ''; }
    const extra = t('talk.system')
      + (name && name !== 'friend' ? ('\n\nThe person\'s name is ' + name + '.') : '')
      + (values.length ? ('\n\nThe values they chose to steer their life by are: ' + values.join(', ') + '. Keep these gently in mind — when it fits naturally, help them move toward what they value, but never force it or lecture.') : '')
      + (wx ? ('\n\nTheir logged inner-weather today reads "' + wx + '" — only reference it if relevant.') : '')
      + (stateBriefing ? ('\n\n' + stateBriefing) : '');

    try {
      const reply = (await LLM.chat(history, { systemExtra: extra, temperature: 0.75, lang: Store.get('settings.lang') })) || '';
      const clean = reply.trim();
      removeThinking();
      const speak = wantsSpeak() && clean;
      if (speak) setState('speaking');
      addMsg('assistant', clean, {
        reveal: true,
        onDone: () => { if (!speak && state !== 'listening') setState('idle'); },
      });
      if (speak) {
        Speech.speak(clean, { onEnd: () => { if (state === 'speaking') setState('idle'); } });
      } else if (reduceMotion()) {
        setState('idle');
      }
    } catch (err) {
      removeThinking();
      addMsg('assistant', t('app.offline'), { reveal: true });
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
    autoGrow();
    submit(v);
  }
  function autoGrow() {
    if (!textInput) return;
    textInput.style.height = 'auto';
    textInput.style.height = Math.min(120, textInput.scrollHeight) + 'px';
  }

  // ---- multi-chat controls -------------------------------------------------
  function refreshTitle() { if (switcherLbl) switcherLbl.textContent = chatTitle(activeChat()); }

  function newChat() {
    ensureLoaded();
    cleanup();
    const cur = activeChat();
    // reuse the current chat if it's already empty (no point stacking blanks)
    if (cur && cur.messages.length === 0) { UI.haptic('light'); if (textInput) textInput.focus(); return; }
    const c = blankChat();
    chats.unshift(c);
    activeId = c.id;
    persist();
    UI.haptic('light');
    Anchor.refresh();
  }

  function openChat(id) {
    ensureLoaded();
    if (id === activeId) return;
    cleanup();
    activeId = id;
    persist();
    UI.haptic('light');
    Anchor.refresh();
  }

  function deleteChat(id) {
    ensureLoaded();
    chats = chats.filter(c => c.id !== id);
    if (!chats.length) { const c = blankChat(); chats.unshift(c); }
    if (id === activeId) activeId = chats[0].id;
    persist();
  }

  function renameChat(chat) {
    const input = E('input', { class: 'input', type: 'text', value: chat.title || '', placeholder: t('talk.untitled'), maxlength: '60' });
    const m = UI.modal({
      title: t('talk.rename'),
      body: E('div', { class: 'col gap2', style: { padding: '4px 0' } }, [input]),
      actions: [
        E('button', { class: 'btn btn-ghost btn-sm', onclick: () => m.close() }, t('app.cancel')),
        E('button', { class: 'btn btn-primary btn-sm', onclick: () => {
          chat.title = (input.value || '').trim();
          chat.updated = Date.now();
          persist(); refreshTitle(); m.close();
          UI.haptic('light');
        } }, t('app.save')),
      ],
    });
    setTimeout(() => input.focus(), 60);
  }

  // A sheet listing every conversation — open one, start a new one, rename or
  // delete. This is the "make more chats like a normal AI" surface.
  function openChatList() {
    ensureLoaded();
    UI.haptic('light');
    const body = E('div', { class: 'col gap3' });

    body.appendChild(E('button', {
      class: 'btn btn-primary btn-block', onclick: () => { sheet.close(); newChat(); },
    }, [UI.frag('<span style="display:inline-flex;width:18px;height:18px">' + Icons.get('plus') + '</span>'), '  ' + t('talk.newChat')]));

    const list = E('div', { class: 'talk-chatlist' });
    const ordered = chats.slice().sort((a, b) => (b.updated || b.ts) - (a.updated || a.ts));
    ordered.forEach(chat => {
      const last = chat.messages[chat.messages.length - 1];
      const snippet = last ? (last.role === 'assistant' ? '' : '') + (last.content || '') : t('talk.emptyChat');
      const item = E('div', { class: 'talk-chat-item glass-card card-tight' + (chat.id === activeId ? ' active' : '') }, [
        E('button', { class: 'talk-chat-main', onclick: () => { sheet.close(); openChat(chat.id); } }, [
          E('div', { class: 'talk-chat-title b' }, chatTitle(chat)),
          E('div', { class: 'talk-chat-snip tiny soft' }, snippet.length > 64 ? snippet.slice(0, 64) + '…' : snippet),
          E('div', { class: 'talk-chat-time tiny muted' }, relTime(chat.updated || chat.ts)),
        ]),
        E('div', { class: 'talk-chat-actions' }, [
          iconBtn('spark', t('talk.rename'), (e) => { e.stopPropagation(); sheet.close(); setTimeout(() => renameChat(chat), 260); }),
          iconBtn('trash', t('talk.delete'), async (e) => {
            e.stopPropagation();
            const ok = await UI.confirm(t('talk.deleteConfirm'), { danger: true, confirmLabel: t('talk.delete') });
            if (!ok) return;
            deleteChat(chat.id);
            sheet.close();
            Anchor.refresh();
          }),
        ]),
      ]);
      list.appendChild(item);
    });
    body.appendChild(list);
    const sheet = UI.sheet({ title: t('talk.yourChats'), body });
  }

  function iconBtn(icon, label, onClick) {
    return E('button', { class: 'talk-icon-btn', 'aria-label': label, onclick: onClick },
      UI.frag('<span style="display:inline-flex;width:17px;height:17px">' + Icons.get(icon) + '</span>'));
  }

  // ---- teardown when navigating away ---------------------------------------
  function cleanup() {
    stopListen();
    if (window.Speech) Speech.stop();
    if (UI.stopHum) UI.stopHum();
    clearReveals();
    removeThinking();
    state = 'idle';
  }

  // ---- render ---------------------------------------------------------------
  function render(root) {
    ensureLoaded();
    if (state === 'listening' || state === 'thinking') state = 'idle';

    root.appendChild(E('div', { class: 'page-head' }, [
      E('h1', { class: 'page-title serif' }, t('talk.title')),
      E('div', { class: 'eyebrow', style: { marginTop: '4px' } }, t('talk.sub')),
    ]));

    const wrap = E('div', { class: 'talk-wrap' });
    root.appendChild(wrap);

    // ---- top bar: chat switcher + new chat ----
    switcherLbl = E('span', { class: 'talk-chip-lbl' }, chatTitle(activeChat()));
    const switcher = E('button', { class: 'talk-chip', onclick: openChatList }, [
      UI.frag('<span class="talk-chip-ico">' + Icons.get('book') + '</span>'),
      switcherLbl,
      UI.frag('<span class="talk-chip-chev">' + Icons.get('chevron') + '</span>'),
    ]);
    const newBtn = E('button', { class: 'talk-newbtn', 'aria-label': t('talk.newChat'), onclick: newChat },
      UI.frag('<span style="display:inline-flex;width:18px;height:18px">' + Icons.get('plus') + '</span>'));
    wrap.appendChild(E('div', { class: 'talk-topbar' }, [switcher, newBtn]));

    // ---- conversation log ----
    logEl = E('div', { class: 'talk-log' });
    wrap.appendChild(logEl);
    paintLog();

    // ---- voice caption (live transcript while listening) ----
    captionEl = E('div', { class: 'talk-caption soft small' }, '');
    wrap.appendChild(captionEl);

    // ---- composer: a single liquid-glass bar (mic · input · send) ----
    const composer = E('div', { class: 'talk-composer' });
    if (sttOK()) {
      micBtn = E('button', { class: 'talk-mic', 'aria-label': t('talk.tapToTalk'), onclick: onMicTap }, [
        E('span', { class: 'talk-mic-ico' }),
      ]);
      composer.appendChild(micBtn);
    }
    textInput = E('textarea', { class: 'talk-input', rows: '1', placeholder: t('talk.typePlaceholder'),
      oninput: autoGrow,
      onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTyped(); } } });
    composer.appendChild(E('div', { class: 'talk-input-wrap' }, [textInput]));
    sendBtn = E('button', { class: 'talk-send', 'aria-label': t('talk.send'), onclick: sendTyped },
      UI.frag('<span style="display:inline-flex;width:20px;height:20px">' + Icons.get('arrow') + '</span>'));
    composer.appendChild(sendBtn);
    wrap.appendChild(composer);
    paintMic();

    // ---- footer controls: mic hint + read-aloud toggle ----
    const footer = E('div', { class: 'talk-footer' });
    micLabel = E('div', { class: 'talk-mic-label tiny soft' }, '');
    footer.appendChild(micLabel);
    if (ttsOK()) {
      // plain div — UI.switchToggle is itself a <label>, so a wrapping <label> would nest invalidly
      footer.appendChild(E('div', { class: 'talk-tts-toggle tiny soft' }, [
        UI.switchToggle(wantsSpeak(), (on) => { speakReplies = on; if (!on) Speech.stop(); }),
        E('span', {}, t('talk.readAloud')),
      ]));
    }
    if (!sttOK()) {
      footer.appendChild(E('div', { class: 'tiny soft', style: { lineHeight: '1.5', textAlign: 'center' } }, t('talk.noMicHint')));
    }
    wrap.appendChild(footer);

    requestAnimationFrame(() => autoGrow());
  }

  Anchor.register({
    id: 'talk',
    labelKey: 'nav.talk',
    icon: 'spark',
    order: 34,
    tab: false,
    render,
    onHide: cleanup,
  });
})();
