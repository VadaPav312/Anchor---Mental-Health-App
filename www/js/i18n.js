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
  ];
  LANGUAGES.forEach(l => { meta[l.code] = l; });

  // The model is told to write free-text LLM output in this language. Keeps
  // AI-generated insights/journal analysis localized too.
  const MODEL_NAME = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
    it: 'Italian', nl: 'Dutch', sv: 'Swedish', pl: 'Polish', uk: 'Ukrainian',
    ru: 'Russian', tr: 'Turkish', ar: 'Arabic', hi: 'Hindi', zh: 'Chinese (Simplified)',
    ja: 'Japanese', ko: 'Korean', id: 'Indonesian', vi: 'Vietnamese', th: 'Thai',
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

  const I18N = {
    LANGUAGES,
    get lang() { return current; },
    get dir() { return (meta[current] && meta[current].dir) || 'ltr'; },
    get languages() { return LANGUAGES; },
    metaFor(code) { return meta[code] || meta.en; },
    modelLanguageName(code) { return MODEL_NAME[code || current] || 'English'; },

    register(code, dict) { dicts[code] = flatten(dict); },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    setLang(code) {
      if (!meta[code]) code = 'en';
      current = code;
      try { localStorage.setItem('anchor_lang', code); } catch {}
      document.documentElement.lang = code;
      document.documentElement.dir = I18N.dir;
      document.body && document.body.setAttribute('dir', I18N.dir);
      listeners.forEach(fn => { try { fn(code); } catch (e) { console.warn(e); } });
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
