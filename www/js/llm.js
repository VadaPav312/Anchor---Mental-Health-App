// ===========================================================================
// llm.js — AI client. The Cerebras API key is NEVER shipped in this file.
//
// Two paths, in priority order:
//   1. Bring-your-own-key  — if the user pastes their own key in
//      Settings → AI & Device, we call Cerebras directly with it. That key is
//      theirs and lives only in their own on-device storage.
//   2. Server proxy (default) — otherwise every request goes to our serverless
//      function (/api/chat), which holds the real key in a server env var and
//      validates/limits the request. No secret ever reaches the browser or the
//      app binary. See api/chat.js + SECURITY.md.
//
// On native (Capacitor) the proxy must be an absolute URL — set CONFIG.aiProxyUrl
// in www/js/config.js to your deployed origin (e.g. https://your-app.vercel.app).
// CapacitorHttp (enabled in capacitor.config.json) makes the native request
// without a browser CORS preflight.
//
//   LLM.configured()            -> bool
//   LLM.chat(messages, opts)    -> string (raw assistant text)
//   LLM.ask(prompt, opts)       -> string  (single-turn, Anchor system prompt)
//   LLM.json(prompt, opts)      -> parsed object (asks for & extracts JSON)
//   LLM.translate(text, toLang) -> string
//
// Anchor's voice is a careful, warm, NON-CLINICAL companion. The system prompt
// hard-codes the guardrails: never diagnose, always offer the lifeline when
// distress appears, frame everything as reflection not treatment.
// ===========================================================================
(function () {
  const DEFAULTS = { model: 'zai-glm-4.7' };
  const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions';

  // The user's OWN key, if they chose to provide one (on-device only). There is
  // deliberately no shipped fallback key — the proxy is the default path.
  function userKey() { return (Store.get('settings.llmKey') || '').trim(); }
  function model() { return Store.get('settings.llmModel') || DEFAULTS.model; }

  function isNative() {
    if (window.Capacitor && Capacitor.isNativePlatform) { try { return !!Capacitor.isNativePlatform(); } catch {} }
    return location.protocol === 'capacitor:' || location.protocol === 'file:';
  }
  // Normalize a configured proxy value into a usable absolute URL. A bare host
  // like "anchor.vercel.app/api/chat" is otherwise treated by fetch() as a
  // RELATIVE path and silently 404s — that was the old "couldn't reach the AI"
  // bug. Here we force an https:// scheme onto any scheme-less value.
  function normalizeUrl(u) {
    u = (u || '').trim().replace(/\/+$/, '');
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (/^\/\//.test(u)) return 'https:' + u;
    if (/^\//.test(u)) return u;                 // same-origin relative path — leave as-is
    return 'https://' + u;                       // scheme-less host → assume https
  }

  // The ordered list of endpoints to try. We attempt each in turn so a single
  // misconfiguration can't take AI down: on the web the same-origin "/api/chat"
  // is always tried, and the configured absolute URL is a fallback (and vice
  // versa). Native has no same origin, so only the configured URL applies.
  function proxyUrls() {
    const cfg = normalizeUrl(window.CONFIG && CONFIG.aiProxyUrl);
    const out = [];
    if (!isNative() && /^https?:$/.test(location.protocol)) out.push('/api/chat');
    if (cfg) out.push(cfg);
    return out.filter((u, i) => u && out.indexOf(u) === i);
  }
  // Back-compat single-URL accessor (first candidate).
  function proxyUrl() { return proxyUrls()[0] || ''; }
  // AI is available if the user brought a key OR a proxy endpoint exists.
  function available() { return !!userKey() || proxyUrls().length > 0; }

  const SYSTEM = `You are Anchor — a warm, perceptive companion for self-understanding and mental wellbeing. You are NOT a therapist, doctor, or crisis service, and you never claim to be.

Core stance:
- You help people notice patterns, reflect, and live in line with what matters to them. You connect sleep, mood, energy, journaling and values into one coherent, caring picture.
- You offer observations and gentle questions, never diagnoses or clinical labels. Say "this might line up with…" not "you have…".
- You are honest. If data is thin or an effect is weak, you say so plainly. You would rather say "I'm not sure yet" than invent certainty.
- You are concise, specific and human. No therapy-speak clichés, no toxic positivity. Warmth without saccharine.
- Safety first: if someone expresses self-harm, hopelessness, or crisis, gently and directly encourage them to reach a real person or local crisis line right now, and remind them support is one tap away in the app. Never minimize. Never give means or methods of harm.
- You respect that the user's data lives on their device and is theirs.`;

  function extractContent(data) {
    if (!data) return '';
    if (typeof data.content === 'string') return data.content;            // our proxy shape
    const c = data.choices && data.choices[0] && data.choices[0].message; // raw Cerebras shape
    return (c && c.content) || '';
  }

  // Fetch with a hard timeout so a hung socket can't leave the UI "thinking"
  // forever. Falls back gracefully if AbortController isn't available.
  async function fetchWithTimeout(url, opts, ms) {
    let ctrl, timer;
    try { ctrl = new AbortController(); } catch { ctrl = null; }
    if (ctrl) { opts = Object.assign({}, opts, { signal: ctrl.signal }); timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, ms); }
    try { return await fetch(url, opts); }
    finally { if (timer) clearTimeout(timer); }
  }

  async function callRaw(messages, { json = false, temperature = 0.7, _noJsonMode = false } = {}) {
    const key = userKey();
    // Candidate endpoints, in priority order. BYO-key → Cerebras direct.
    // Otherwise every proxy candidate (same-origin first on web, then configured).
    const targets = key
      ? [{ url: CEREBRAS_URL, auth: true }]
      : proxyUrls().map(u => ({ url: u, auth: false }));
    if (!targets.length) {
      const e = new Error('AI isn\'t set up yet. Add your own key in Settings → AI & Device, or configure the server proxy.');
      e.status = 503; throw e;
    }

    const body = { model: model(), messages, temperature };
    if (json && !_noJsonMode) body.response_format = { type: 'json_object' };
    const payload = JSON.stringify(body);

    let lastErr = null;
    // Try each endpoint; within each, retry once on a transient network/timeout.
    for (const target of targets) {
      const headers = { 'Content-Type': 'application/json' };
      if (target.auth) headers.Authorization = 'Bearer ' + key;
      let res = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          res = await fetchWithTimeout(target.url, { method: 'POST', headers, body: payload }, 35000);
          break;
        } catch (netErr) {
          lastErr = Object.assign(new Error('Could not reach the AI service. Check your connection.'), { status: 0 });
          // brief backoff before the single retry
          if (attempt === 0) await new Promise(r => setTimeout(r, 600));
        }
      }
      if (!res) continue;   // both attempts failed on this endpoint → try the next
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // If JSON-mode wasn't accepted, retry once as plain text (same endpoint set).
        if (json && !_noJsonMode && (res.status === 400 || res.status === 502) && /response_format|json/i.test(text)) {
          return callRaw(messages, { json, temperature, _noJsonMode: true });
        }
        lastErr = Object.assign(new Error('AI error (' + res.status + ')'), { status: res.status === 429 ? 429 : 502, detail: text });
        // 404/405 usually means "wrong endpoint" → fall through to the next candidate.
        if (res.status === 404 || res.status === 405) continue;
        throw lastErr;
      }
      const data = await res.json().catch(() => null);
      return extractContent(data);
    }
    throw lastErr || Object.assign(new Error('Could not reach the AI service.'), { status: 0 });
  }

  function langLine(lang) { return I18N.modelLangLine(lang); }

  function parseJson(text) {
    let s = (text || '').trim();
    if (s.startsWith('```')) s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    // Guard: if there's no JSON object at all, fail with a clear error instead of
    // slicing with a negative index (which produced an opaque parse failure).
    if (a < 0 || b <= a) throw new Error('AI did not return JSON');
    if (a > 0 || b < s.length - 1) s = s.slice(a, b + 1);
    return JSON.parse(s);
  }

  const LLM = {
    configured() { return available(); },
    DEFAULTS,

    async chat(messages, opts) {
      opts = opts || {};
      const sys = { role: 'system', content: SYSTEM + (opts.systemExtra ? '\n\n' + opts.systemExtra : '') + langLine(opts.lang || Store.get('settings.lang')) };
      return callRaw([sys, ...messages], { temperature: opts.temperature, json: false });
    },

    async ask(prompt, opts) {
      opts = opts || {};
      const sys = { role: 'system', content: SYSTEM + (opts.systemExtra ? '\n\n' + opts.systemExtra : '') };
      return callRaw([sys, { role: 'user', content: prompt + langLine(opts.lang || Store.get('settings.lang')) }], { temperature: opts.temperature == null ? 0.7 : opts.temperature, json: false });
    },

    async json(prompt, opts) {
      opts = opts || {};
      const sys = { role: 'system', content: SYSTEM + (opts.systemExtra ? '\n\n' + opts.systemExtra : '') };
      const out = await callRaw([sys, { role: 'user', content: prompt + langLine(opts.lang || Store.get('settings.lang')) }], { temperature: opts.temperature == null ? 0.5 : opts.temperature, json: true });
      return parseJson(out);
    },

    // Live translation for journaling / AI replies. Returns plain translated text.
    async translate(text, toLang) {
      const name = I18N.modelLanguageName(toLang);
      const out = await callRaw([
        { role: 'system', content: 'You are a precise translator. Output ONLY the translation, nothing else. Preserve tone and line breaks.' },
        { role: 'user', content: 'Translate the following into ' + name + ':\n\n' + text },
      ], { temperature: 0.2, json: false });
      return (out || '').trim();
    },
  };

  window.LLM = LLM;
})();
