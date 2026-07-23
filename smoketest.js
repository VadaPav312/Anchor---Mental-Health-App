// Headless runtime smoke test: boot the real Anchor app in jsdom, seed a few
// weeks of data via the Store API, then render EVERY registered view and assert
// no runtime errors.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'www/index.html'), 'utf8');

// Pull the script srcs in load order from index.html (scripts carry `defer`).
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)].map(m => m[1]);

const dom = new JSDOM(html.replace(/<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g, ''), {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
const { window } = dom;

// Minimal shims for browser APIs the app touches.
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
window.scrollTo = () => {};
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
window.cancelAnimationFrame = (id) => clearTimeout(id);
window.fetch = () => Promise.reject(new Error('offline-in-test'));
window.HTMLCanvasElement.prototype.getContext = function () {
  // a no-op 2D context so canvas-drawing features don't throw
  return new Proxy({}, { get: (t, p) => (p === 'canvas' ? this : (p === 'measureText' ? (() => ({ width: 10 })) : (p === 'createLinearGradient' || p === 'createRadialGradient' ? (() => ({ addColorStop() {} })) : (typeof p === 'string' ? () => {} : undefined)))) });
};

const errors = [];
window.addEventListener('error', e => errors.push('window.error: ' + (e.error && e.error.stack || e.message)));
const origError = console.error;
console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ')); };

// Execute each script in the window context, in order.
const vm = require('vm');
const ctx = dom.getInternalVMContext();
for (const src of scripts) {
  const file = path.join(__dirname, 'www', src);
  const code = fs.readFileSync(file, 'utf8');
  try { vm.runInContext(code, ctx, { filename: src }); }
  catch (e) { errors.push('LOAD ' + src + ': ' + (e.stack || e.message)); }
}

// Language files (except English) are now lazy-loaded in the browser via
// i18n.ensureLang, which injects a <script> jsdom won't execute. Load them all
// directly here so the multi-language render checks below still have real dicts.
const langDir = path.join(__dirname, 'www/js/lang');
for (const f of fs.readdirSync(langDir)) {
  if (!f.endsWith('.js') || f === 'en.js') continue;   // en.js already ran via index.html
  try { vm.runInContext(fs.readFileSync(path.join(langDir, f), 'utf8'), ctx, { filename: 'lang/' + f }); }
  catch (e) { errors.push('LOAD lang/' + f + ': ' + (e.stack || e.message)); }
}

// Let DOMContentLoaded-driven boot run.
setTimeout(() => {
  try {
    const w = window;
    const out = [];
    out.push('languages registered: ' + w.I18N.LANGUAGES.length);
    out.push('views registered: ' + w.Anchor.views.length + ' -> ' + w.Anchor.views.map(v => v.id).join(','));

    // Force-complete onboarding, then seed ~3 weeks of correlated data via the
    // real Store API (the standalone Seed demo module was removed).
    w.Store.profile.update({ name: 'Test', onboarded: true, createdAt: Date.now() });
    w.Store.values.set([{ id: 'presence', name: 'Being present', why: '' }, { id: 'connection', name: 'Connection', why: '' }]);
    const DAY = 86400000, NOW = Date.now();
    for (let i = 20; i >= 0; i--) {
      const date = new Date(NOW - i * DAY).toISOString().slice(0, 10);
      // sleep drives mood/energy so Pattern Detective has a real correlation to find
      const dur = 360 + (i % 6) * 30;                 // 6h–8.5h
      const good = dur > 450;
      const valence = good ? 1 + (i % 2) : -1 + (i % 2);
      w.Store.sleep.add({ date, durationMin: dur, score: 45 + (dur - 360) / 3, tempF: 66 + (i % 3), humidity: 45, lightLux: 2, noiseDb: 30, awakenings: good ? 0 : 2, restful: good ? 8 : 4, envScore: 70, source: 'manual' });
      w.Store.moods.add({ date, valence, energy: 5 + valence, arousal: 5, note: i % 4 ? '' : 'reflecting', tags: [], weather: 'clear' });
      w.Store.journal.add({ date, text: i % 2 ? 'A few honest lines about the day.' : '' });
      w.Store.energy.add({ date, net: valence, gain: 3, drain: 3 - valence });
    }
    out.push('after seed -> moods:' + w.Store.moods.count() + ' sleep:' + w.Store.sleep.count() + ' journal:' + w.Store.journal.count() + ' energy:' + w.Store.energy.count());

    // Pattern Detective should find correlations in the seeded data.
    if (w.PatternDetective) {
      w.PatternDetective.scan();
      const top = w.PatternDetective.topInsight();
      out.push('pattern insights: ' + w.Store.insights.count() + (top ? ' | top: "' + top.text.slice(0, 80) + '..."' : ' | none'));
    }

    // Render EVERY view into the #view container; capture per-view failures.
    const view = w.document.getElementById('view');
    const perView = [];
    for (const v of w.Anchor.views) {
      try {
        view.innerHTML = '';
        const page = w.document.createElement('div');
        view.appendChild(page);
        v.render(page, {});
        if (v.onShow) v.onShow({});
        perView.push('✅ ' + v.id + ' (' + page.innerHTML.length + ' chars)');
      } catch (e) {
        perView.push('❌ ' + v.id + ': ' + (e.message));
        errors.push('RENDER ' + v.id + ': ' + (e.stack || e.message));
      }
    }
    out.push('--- view renders ---');
    out.push(...perView);

    // Switch language to a few and re-render home to test i18n + RTL.
    for (const lang of ['es', 'ar', 'ja', 'hi']) {
      try { w.I18N.setLang(lang); view.innerHTML = ''; const p = w.document.createElement('div'); view.appendChild(p); w.Anchor.byId('home').render(p, {}); out.push('lang ' + lang + ' (dir=' + w.I18N.dir + '): home ' + p.innerHTML.length + ' chars'); }
      catch (e) { errors.push('LANG ' + lang + ': ' + e.message); }
    }

    console.log = origError; // restore for final report
    origError('\n' + out.join('\n'));
    origError('\n=== ERRORS (' + errors.length + ') ===');
    errors.slice(0, 40).forEach(e => origError('• ' + e.split('\n')[0]));
    origError(errors.length === 0 ? '\n🎉 NO RUNTIME ERRORS — app boots, seeds, finds patterns, renders all views in multiple languages.' : '\n⚠️  ' + errors.length + ' issue(s) above.');
    process.exit(errors.length ? 1 : 0);
  } catch (e) {
    origError('FATAL: ' + (e.stack || e.message));
    process.exit(2);
  }
}, 400);
