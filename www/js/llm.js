// ===========================================================================
// llm.js — ON-DEVICE AI. Calls Cerebras directly from the phone so Anchor needs
// no backend for its intelligence. In the installed app, CapacitorHttp (enabled
// in capacitor.config.json) makes the request natively, so there is no browser
// CORS preflight to fail. On the web/Vercel it uses normal fetch.
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
  // Defaults carried over from the proven APEX setup; user can override in
  // Settings → AI & Device (stored on-device only).
  const DEFAULTS = {
    key: 'csk-c3rnpx6jmhxnnkjc8wwhwfnr5cj3fhx5p2vm42v59vjv5kk3',
    model: 'zai-glm-4.7',
  };
  const URL = 'https://api.cerebras.ai/v1/chat/completions';

  function key() { return Store.get('settings.llmKey') || DEFAULTS.key; }
  function model() { return Store.get('settings.llmModel') || DEFAULTS.model; }

  const SYSTEM = `You are Anchor — a warm, perceptive companion for self-understanding and mental wellbeing. You are NOT a therapist, doctor, or crisis service, and you never claim to be.

Core stance:
- You help people notice patterns, reflect, and live in line with what matters to them. You connect sleep, mood, energy, journaling and values into one coherent, caring picture.
- You offer observations and gentle questions, never diagnoses or clinical labels. Say "this might line up with…" not "you have…".
- You are honest. If data is thin or an effect is weak, you say so plainly. You would rather say "I'm not sure yet" than invent certainty.
- You are concise, specific and human. No therapy-speak clichés, no toxic positivity. Warmth without saccharine.
- Safety first: if someone expresses self-harm, hopelessness, or crisis, gently and directly encourage them to reach a real person or local crisis line right now, and remind them support is one tap away in the app. Never minimize. Never give means or methods of harm.
- You respect that the user's data lives on their device and is theirs.`;

  async function callRaw(messages, { json = false, temperature = 0.7, _noJsonMode = false } = {}) {
    const k = key();
    if (!k) { const e = new Error('No AI key set. Add one in Settings → AI & Device.'); e.status = 503; throw e; }
    const body = { model: model(), messages, temperature };
    if (json && !_noJsonMode) body.response_format = { type: 'json_object' };
    let res;
    try {
      res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k }, body: JSON.stringify(body) });
    } catch (netErr) {
      const e = new Error('Could not reach the AI service. Check your connection.'); e.status = 0; throw e;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 400 && json && !_noJsonMode && /response_format|json/i.test(text)) {
        return callRaw(messages, { json, temperature, _noJsonMode: true });
      }
      const e = new Error('AI error (' + res.status + ')'); e.status = res.status === 429 ? 429 : 502; e.detail = text; throw e;
    }
    const data = await res.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  }

  function langLine(lang) { return I18N.modelLangLine(lang); }

  function parseJson(text) {
    let s = (text || '').trim();
    if (s.startsWith('```')) s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a > 0 || b < s.length - 1) s = s.slice(a, b + 1);
    return JSON.parse(s);
  }

  const LLM = {
    configured() { return !!key(); },
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
