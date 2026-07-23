// ===========================================================================
// i18n.js — Anchor's localization engine. 20 languages, RTL-aware.
//
// Each language file (lang/xx.js) calls I18N.register('xx', { ...dict }).
// English (en.js) is the source of truth and the fallback for any missing key.
//
// Usage:
//   t('dash.greeting', { name: 'Vihaan' })  -> "Good evening, Vihaan"
//   I18N.setLang('es')                      -> re-renders the app in Spanish
//   I18N.dir                                -> 'rtl' for Arabic, else 'ltr'
//
// Keys use dot-paths. Values may contain {placeholders} replaced from vars.
// Pluralization: a value may be an object { one, other } resolved by count.
// ===========================================================================
(function () {
  const dicts = {};               // code -> flat map of key -> string
  const meta = {};                // code -> { name, native, dir, flag }

  // The 20 shipped languages. `native` is shown in the language picker.
  const LANGUAGES = [
    { code: 'en', name: 'English',    native: 'English',     dir: 'ltr', flag: '🇬🇧' },
    { code: 'es', name: 'Spanish',    native: 'Español',     dir: 'ltr', flag: '🇪🇸' },
    { code: 'fr', name: 'French',     native: 'Français',    dir: 'ltr', flag: '🇫🇷' },
    { code: 'de', name: 'German',     native: 'Deutsch',     dir: 'ltr', flag: '🇩🇪' },
    { code: 'pt', name: 'Portuguese', native: 'Português',   dir: 'ltr', flag: '🇧🇷' },
    { code: 'it', name: 'Italian',    native: 'Italiano',    dir: 'ltr', flag: '🇮🇹' },
    { code: 'nl', name: 'Dutch',      native: 'Nederlands',  dir: 'ltr', flag: '🇳🇱' },
    { code: 'sv', name: 'Swedish',    native: 'Svenska',     dir: 'ltr', flag: '🇸🇪' },
    { code: 'pl', name: 'Polish',     native: 'Polski',      dir: 'ltr', flag: '🇵🇱' },
    { code: 'uk', name: 'Ukrainian',  native: 'Українська',  dir: 'ltr', flag: '🇺🇦' },
    { code: 'ru', name: 'Russian',    native: 'Русский',     dir: 'ltr', flag: '🇷🇺' },
    { code: 'tr', name: 'Turkish',    native: 'Türkçe',      dir: 'ltr', flag: '🇹🇷' },
    { code: 'ar', name: 'Arabic',     native: 'العربية',     dir: 'rtl', flag: '🇸🇦' },
    { code: 'hi', name: 'Hindi',      native: 'हिन्दी',      dir: 'ltr', flag: '🇮🇳' },
    { code: 'zh', name: 'Chinese',    native: '中文',         dir: 'ltr', flag: '🇨🇳' },
    { code: 'ja', name: 'Japanese',   native: '日本語',       dir: 'ltr', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean',     native: '한국어',       dir: 'ltr', flag: '🇰🇷' },
    { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', dir: 'ltr', flag: '🇮🇩' },
    { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt',  dir: 'ltr', flag: '🇻🇳' },
    { code: 'th', name: 'Thai',       native: 'ไทย',         dir: 'ltr', flag: '🇹🇭' },
    // ---- additional languages (UI completed on-device by AI) ----
    { code: 'bn', name: 'Bengali',    native: 'বাংলা',        dir: 'ltr', flag: '🇧🇩', ai: true },
    { code: 'fa', name: 'Persian',    native: 'فارسی',        dir: 'rtl', flag: '🇮🇷', ai: true },
    { code: 'he', name: 'Hebrew',     native: 'עברית',        dir: 'rtl', flag: '🇮🇱', ai: true },
    { code: 'ur', name: 'Urdu',       native: 'اردو',         dir: 'rtl', flag: '🇵🇰', ai: true },
    { code: 'el', name: 'Greek',      native: 'Ελληνικά',     dir: 'ltr', flag: '🇬🇷', ai: true },
    { code: 'ro', name: 'Romanian',   native: 'Română',       dir: 'ltr', flag: '🇷🇴', ai: true },
    { code: 'cs', name: 'Czech',      native: 'Čeština',      dir: 'ltr', flag: '🇨🇿', ai: true },
    { code: 'hu', name: 'Hungarian',  native: 'Magyar',       dir: 'ltr', flag: '🇭🇺', ai: true },
    { code: 'fil', name: 'Filipino',  native: 'Filipino',     dir: 'ltr', flag: '🇵🇭', ai: true },
    { code: 'ms', name: 'Malay',      native: 'Bahasa Melayu', dir: 'ltr', flag: '🇲🇾', ai: true },
    { code: 'sw', name: 'Swahili',    native: 'Kiswahili',    dir: 'ltr', flag: '🇰🇪', ai: true },
    { code: 'ta', name: 'Tamil',      native: 'தமிழ்',        dir: 'ltr', flag: '🇮🇳', ai: true },
  ];
  LANGUAGES.forEach(l => { meta[l.code] = l; });

  // The model is told to write free-text LLM output in this language. Keeps
  // AI-generated insights/journal analysis localized too.
  const MODEL_NAME = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
    it: 'Italian', nl: 'Dutch', sv: 'Swedish', pl: 'Polish', uk: 'Ukrainian',
    ru: 'Russian', tr: 'Turkish', ar: 'Arabic', hi: 'Hindi', zh: 'Chinese (Simplified)',
    ja: 'Japanese', ko: 'Korean', id: 'Indonesian', vi: 'Vietnamese', th: 'Thai',
    bn: 'Bengali', fa: 'Persian (Farsi)', he: 'Hebrew', ur: 'Urdu', el: 'Greek',
    ro: 'Romanian', cs: 'Czech', hu: 'Hungarian', fil: 'Filipino (Tagalog)', ms: 'Malay',
    sw: 'Swahili', ta: 'Tamil',
  };

  // Flatten a nested dict { a: { b: 'x' } } -> { 'a.b': 'x' } so language files
  // can be authored as readable nested objects.
  function flatten(obj, prefix, out) {
    out = out || {};
    for (const k in obj) {
      const v = obj[k];
      const key = prefix ? prefix + '.' + k : k;
      if (v && typeof v === 'object' && !('one' in v && 'other' in v)) flatten(v, key, out);
      else out[key] = v;
    }
    return out;
  }

  let current = 'en';
  const listeners = new Set();

  function detectInitial() {
    const saved = (() => { try { return localStorage.getItem('anchor_lang'); } catch { return null; } })();
    if (saved && meta[saved]) return saved;
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return meta[nav] ? nav : 'en';
  }

  // A shipped language has its own lang/<code>.js file (the non-"ai" entries).
  // The "ai" languages have no file — they build on the English fallback plus
  // any on-device AI translations. English is always loaded up front.
  function hasFile(code) { return !!meta[code] && !meta[code].ai; }

  // Lazily fetch a shipped language file only when it's actually needed, instead
  // of loading all ~20 on every boot. Each file self-registers via I18N.register.
  // Multiple callers for the same code share one network request.
  const loadingLang = {};
  function ensureLang(code, cb) {
    if (!hasFile(code) || code === 'en' || dicts[code]) { if (cb) cb(); return; }
    if (loadingLang[code]) { loadingLang[code].push(cb); return; }
    loadingLang[code] = [cb];
    const done = () => {
      const cbs = loadingLang[code] || []; delete loadingLang[code];
      cbs.forEach(f => { try { if (f) f(); } catch (e) { console.warn(e); } });
    };
    const s = document.createElement('script');
    s.src = 'js/lang/' + code + '.js'; s.async = true;
    s.onload = done;
    s.onerror = () => { console.warn('lang load failed: ' + code); done(); };   // fall back to English
    (document.head || document.documentElement).appendChild(s);
  }

  const I18N = {
    LANGUAGES,
    get lang() { return current; },
    get dir() { return (meta[current] && meta[current].dir) || 'ltr'; },
    get languages() { return LANGUAGES; },
    metaFor(code) { return meta[code] || meta.en; },
    modelLanguageName(code) { return MODEL_NAME[code || current] || 'English'; },

    register(code, dict) { dicts[code] = Object.assign(flatten(dict), dicts[code] || {}); },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // Load any AI-completed translations cached on-device for a language.
    loadCachedAI(code) {
      try {
        const raw = localStorage.getItem('anchor_i18n_' + code);
        if (raw) dicts[code] = Object.assign(dicts[code] || {}, JSON.parse(raw));
      } catch {}
    },

    // What fraction of the English keys exist in this language (1 = complete).
    coverage(code) {
      const en = dicts.en || {}, d = dicts[code] || {};
      const keys = Object.keys(en); if (!keys.length) return 1;
      let have = 0; for (const k of keys) if (d[k] != null) have++;
      return have / keys.length;
    },

    // Translate every missing UI string into `code` using the on-device AI, in
    // batches, caching the result so any language can be made complete.
    async aiTranslate(code, onProgress) {
      if (!(window.LLM && LLM.json)) throw new Error('no-ai');
      const en = dicts.en || {};
      const have = dicts[code] || {};
      const missing = Object.keys(en).filter(k => typeof en[k] === 'string' && have[k] == null);
      const langName = MODEL_NAME[code] || (meta[code] && meta[code].name) || code;
      const out = Object.assign({}, have);
      const CHUNK = 36;
      for (let i = 0; i < missing.length; i += CHUNK) {
        const batch = missing.slice(i, i + CHUNK);
        const src = {}; batch.forEach(k => { src[k] = en[k]; });
        const prompt = 'Translate the VALUES of this JSON into ' + langName +
          ' for a calm mental-wellness app. Keep every KEY exactly the same. Preserve placeholders like {name}, {n}, {value}, {temp} unchanged. Keep "|" separators if present. Return ONLY a JSON object, no prose.\n\n' + JSON.stringify(src);
        try {
          const res = await LLM.json(prompt, { temperature: 0.2 });
          if (res) batch.forEach(k => { if (typeof res[k] === 'string') out[k] = res[k]; });
        } catch (e) { /* leave English for this batch */ }
        if (onProgress) onProgress(Math.min(missing.length, i + CHUNK), missing.length);
      }
      dicts[code] = out;
      try { localStorage.setItem('anchor_i18n_' + code, JSON.stringify(out)); } catch {}
      return out;
    },

    ensureLang,

    setLang(code) {
      if (!meta[code]) code = 'en';
      current = code;
      I18N.loadCachedAI(code);
      try { localStorage.setItem('anchor_lang', code); } catch {}
      document.documentElement.lang = code;
      document.documentElement.dir = I18N.dir;
      document.body && document.body.setAttribute('dir', I18N.dir);
      const fire = () => listeners.forEach(fn => { try { fn(code); } catch (e) { console.warn(e); } });
      // Render now with whatever's loaded (English fallback if the file hasn't
      // arrived yet), then re-render the moment the real translations land. For
      // English and already-loaded languages this fires exactly once.
      fire();
      if (hasFile(code) && !dicts[code]) ensureLang(code, () => { if (current === code) fire(); });
    },

    // Look up a key; fall back to English; finally show the key itself so a
    // missing translation is visible but never blank.
    has(key) { return !!(dicts[current] && dicts[current][key]) || !!(dicts.en && dicts.en[key]); },

    t(key, vars) {
      let val = (dicts[current] && dicts[current][key]);
      if (val == null) val = (dicts.en && dicts.en[key]);
      if (val == null) return key;
      // plural object
      if (val && typeof val === 'object') {
        const n = vars && (vars.count != null ? vars.count : vars.n);
        val = (n === 1 || n === '1') ? val.one : val.other;
      }
      if (vars) {
        val = String(val).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
      }
      return val;
    },

    // For the LLM: instruction appended to prompts so generated text is localized.
    modelLangLine(code) {
      const c = code || current;
      if (c === 'en') return '';
      return `\n\nIMPORTANT: Write ALL human-readable text in ${MODEL_NAME[c] || 'English'}. Keep any JSON keys exactly in English.`;
    },

    init() { I18N.setLang(detectInitial()); },
  };

  window.I18N = I18N;
  window.t = (k, v) => I18N.t(k, v);
})();
