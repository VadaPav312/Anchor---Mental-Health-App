// ===========================================================================
// settings.js — Anchor Settings view.
// Groups: Profile · Language · Appearance · AI & Device · Reminders ·
//         Your Data · About.
// Pattern: see dashboard.js. IIFE, self-registers with Anchor.register().
// ===========================================================================
(function () {

  // ---- helpers --------------------------------------------------------------

  function sectionHead(labelKey) {
    return UI.el('div', { class: 'eyebrow', style: { margin: '24px 4px 8px', letterSpacing: '0.06em' } }, t(labelKey));
  }

  function rowItem(label, control, sub) {
    const inner = [
      UI.el('div', { class: 'row between gap3', style: { alignItems: 'center' } }, [
        UI.el('div', { class: 'grow' }, [
          UI.el('div', { class: 'b' }, label),
          sub ? UI.el('div', { class: 'small soft', style: { marginTop: '2px' } }, sub) : null,
        ]),
        control,
      ]),
    ];
    return UI.el('div', { class: 'col gap0' }, inner);
  }

  function divider() {
    return UI.el('hr', { style: { border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '2px 0' } });
  }

  function glassSection(children) {
    const items = [];
    for (let i = 0; i < children.length; i++) {
      if (children[i]) items.push(children[i]);
      if (i < children.length - 1 && children[i] && children[i + 1]) items.push(divider());
    }
    return UI.el('div', { class: 'glass-card card col gap0', style: { padding: '4px 0' } }, items);
  }

  function iconSpan(name) {
    return UI.frag(`<span style="display:inline-flex;width:20px;height:20px;flex-shrink:0;color:var(--a1)">${Icons.get(name)}</span>`);
  }

  function iconRow(iconName, label, sub, control) {
    return UI.el('div', { class: 'row between gap3', style: { alignItems: 'center', padding: '10px 16px' } }, [
      UI.el('div', { class: 'row gap3 grow', style: { alignItems: 'center' } }, [
        iconSpan(iconName),
        UI.el('div', { class: 'col gap0 grow' }, [
          UI.el('div', { class: 'b' }, label),
          sub ? UI.el('div', { class: 'small soft', style: { marginTop: '2px' } }, sub) : null,
        ]),
      ]),
      control || null,
    ]);
  }

  function settingsRow(label, control, sub) {
    return UI.el('div', { style: { padding: '10px 16px' } }, [
      rowItem(label, control, sub),
    ]);
  }

  // ---- 1. PROFILE -----------------------------------------------------------

  function profileSection() {
    const s = Store.profile.get();
    const nameInput = UI.el('input', {
      type: 'text',
      class: 'field-input',
      value: s.name || '',
      placeholder: t('set.name'),
      style: { width: '140px', textAlign: 'right', background: 'transparent', border: 'none', color: 'var(--ink)', fontSize: '1rem' },
    });

    nameInput.addEventListener('blur', function () {
      const v = nameInput.value.trim();
      if (v) Store.profile.update({ name: v });
    });
    nameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { nameInput.blur(); }
    });

    return [
      sectionHead('set.profile'),
      glassSection([
        iconRow('mirror', t('set.name'), null, nameInput),
      ]),
    ];
  }

  // ---- 2. LANGUAGE ----------------------------------------------------------

  function languageSection(root) {
    const settings = Store.settings.get();

    // Build language picker grid
    function buildPicker() {
      const currentCode = (settings.lang || I18N.lang);
      const grid = UI.el('div', {
        style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '4px 0 8px' },
      });

      I18N.LANGUAGES.forEach(function (lang) {
        const isActive = lang.code === currentCode;
        const btn = UI.el('button', {
          class: 'glass-card card-tight row gap2' + (isActive ? ' active' : ''),
          style: {
            alignItems: 'center',
            padding: '10px 12px',
            border: isActive ? '1.5px solid var(--a1)' : '1.5px solid transparent',
            borderRadius: 'var(--r-md)',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'border-color var(--dur)',
          },
        }, [
          UI.el('span', { style: { fontSize: '1.3rem', flexShrink: '0' } }, lang.flag),
          UI.el('div', { class: 'col gap0' }, [
            UI.el('div', { class: 'b small' }, lang.native),
            UI.el('div', { class: 'tiny soft' }, lang.name),
          ]),
        ]);

        btn.addEventListener('click', function () {
          UI.haptic('light');
          I18N.setLang(lang.code);
          Store.settings.update({ lang: lang.code });
          Anchor.refresh();
        });

        grid.appendChild(btn);
      });

      return grid;
    }

    // Live translate toggle
    const settings2 = Store.settings.get();
    const liveTransToggle = UI.switchToggle(!!settings2.liveTranslate, function (val) {
      Store.settings.update({ liveTranslate: val });
    });

    return [
      sectionHead('set.language'),
      UI.el('div', { class: 'glass-card card col gap3' }, [
        UI.el('div', { class: 'small soft', style: { marginBottom: '4px' } }, t('set.languageSub')),
        buildPicker(),
        divider(),
        UI.el('div', { style: { padding: '4px 0' } }, [
          rowItem(t('set.liveTranslate'), liveTransToggle, null),
        ]),
      ]),
    ];
  }

  // ---- 3. APPEARANCE --------------------------------------------------------

  function appearanceSection() {
    const settings = Store.settings.get();

    const themeSeg = UI.segmented([
      { value: 'aurora', label: t('set.themeAurora') },
      { value: 'daylight', label: t('set.themeDaylight') },
    ], settings.theme || 'aurora', function (val) {
      Store.settings.update({ theme: val });
      if (window.App && App.applyTheme) App.applyTheme();
      if (window.Native) Native.applyStatusBar();
    });

    const tempSeg = UI.segmented([
      { value: 'C', label: t('set.celsius') },
      { value: 'F', label: t('set.fahrenheit') },
    ], settings.tempUnit || 'F', function (val) {
      Store.settings.update({ tempUnit: val });
      UI.toast(val === 'C' ? '°C' : '°F', 'good');
      // refresh so any temperature shown elsewhere re-converts immediately
      if (window.Anchor) Anchor.refresh();
    });

    return [
      sectionHead('set.appearance'),
      glassSection([
        iconRow('sun', t('set.theme'), null,
          UI.el('div', { style: { flexShrink: '0' } }, [themeSeg])),
        iconRow('thermo', t('set.tempUnit'), null,
          UI.el('div', { style: { flexShrink: '0' } }, [tempSeg])),
      ]),
    ];
  }

  // ---- 4. AI & DEVICE -------------------------------------------------------

  function deviceSection(root) {
    const settings = Store.settings.get();

    // API key field
    const keyInput = UI.el('input', {
      type: 'password',
      class: 'field-input',
      value: settings.llmKey || '',
      placeholder: t('set.aiKey'),
      autocomplete: 'off',
      style: { width: '100%', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-sm)', padding: '8px 10px', color: 'var(--ink)', fontSize: '0.9rem' },
    });
    keyInput.addEventListener('change', function () {
      Store.settings.update({ llmKey: keyInput.value.trim() });
    });

    // Model field
    const modelInput = UI.el('input', {
      type: 'text',
      class: 'field-input',
      value: settings.llmModel || '',
      placeholder: LLM.DEFAULTS.model,
      style: { width: '100%', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-sm)', padding: '8px 10px', color: 'var(--ink)', fontSize: '0.9rem' },
    });
    modelInput.addEventListener('change', function () {
      Store.settings.update({ llmModel: modelInput.value.trim() });
    });

    // Bridge URL field
    const bridgeInput = UI.el('input', {
      type: 'url',
      class: 'field-input',
      value: settings.bridgeUrl || '',
      placeholder: 'http://192.168.1.20:3000',
      style: { width: '100%', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-sm)', padding: '8px 10px', color: 'var(--ink)', fontSize: '0.9rem' },
    });
    bridgeInput.addEventListener('change', function () {
      Store.settings.update({ bridgeUrl: bridgeInput.value.trim() });
    });

    // Test connection button + status
    const statusEl = UI.el('div', { class: 'small soft', style: { marginTop: '6px', minHeight: '18px' } });

    const testBtn = UI.btn(t('set.testConnection'), {
      class: 'btn-ghost btn-sm',
      onClick: async function () {
        Store.settings.update({
          llmKey: keyInput.value.trim(),
          llmModel: modelInput.value.trim(),
          bridgeUrl: bridgeInput.value.trim(),
        });
        statusEl.textContent = t('set.testing');
        statusEl.style.color = 'var(--ink-ghost)';
        testBtn.disabled = true;
        try {
          const d = await Bridge.diagnose();
          statusEl.textContent = (d.ok ? '✅ ' : '⚠️ ') + d.message;
          statusEl.style.color = d.ok ? (d.code === 'live' ? 'var(--good)' : 'var(--warn)') : 'var(--bad)';
          UI.haptic(d.ok ? 'success' : 'error');
        } catch (_e) {
          statusEl.textContent = '⚠️ ' + t('set.testFail');
          statusEl.style.color = 'var(--bad)';
        } finally {
          testBtn.disabled = false;
        }
      },
    });

    return [
      sectionHead('set.device'),
      UI.el('div', { class: 'glass-card card col gap4' }, [
        UI.field(
          t('set.aiKey'),
          keyInput,
          t('set.aiKeySub')
        ),
        UI.field(
          t('set.aiModel'),
          modelInput,
          null
        ),
        UI.field(
          t('set.bridgeUrl'),
          bridgeInput,
          t('set.bridgeUrlSub')
        ),
        UI.el('div', { class: 'col gap1' }, [
          testBtn,
          statusEl,
        ]),
      ]),
    ];
  }

  // ---- 5. REMINDERS ---------------------------------------------------------

  function remindersSection() {
    const settings = Store.settings.get();
    const reminders = settings.reminders || {};
    const windDown = Object.assign({ on: false, hour: 21, minute: 30 }, reminders.windDown);
    const checkin = Object.assign({ on: false, hour: 19, minute: 0 }, reminders.checkin);

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    function timeInput(val, onChangeFn) {
      const inp = UI.el('input', {
        type: 'time',
        value: pad2(val.hour) + ':' + pad2(val.minute),
        style: { background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--r-sm)', padding: '4px 8px', color: 'var(--ink)', fontSize: '0.9rem', width: '100px' },
      });
      inp.addEventListener('change', function () {
        const parts = inp.value.split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        onChangeFn(h, m);
      });
      return inp;
    }

    // Wind-down
    const wdTimeInp = timeInput(windDown, function (h, m) {
      const rem = Store.settings.get().reminders || {};
      rem.windDown = Object.assign({}, rem.windDown, { hour: h, minute: m });
      Store.settings.update({ reminders: rem });
      Native.syncReminders();
    });
    wdTimeInp.disabled = !windDown.on;

    const wdToggle = UI.switchToggle(windDown.on, async function (val) {
      if (val) {
        const perm = await Native.notifPermission();
        if (perm === 'denied') {
          UI.toast(t('set.remWindDown') + ' — ' + t('set.testFail'), 'bad');
          wdToggle.querySelector('input').checked = false;
          return;
        }
      }
      const rem = Store.settings.get().reminders || {};
      rem.windDown = Object.assign({}, rem.windDown, { on: val });
      Store.settings.update({ reminders: rem });
      wdTimeInp.disabled = !val;
      Native.syncReminders();
    });

    // Checkin
    const ciTimeInp = timeInput(checkin, function (h, m) {
      const rem = Store.settings.get().reminders || {};
      rem.checkin = Object.assign({}, rem.checkin, { hour: h, minute: m });
      Store.settings.update({ reminders: rem });
      Native.syncReminders();
    });
    ciTimeInp.disabled = !checkin.on;

    const ciToggle = UI.switchToggle(checkin.on, async function (val) {
      if (val) {
        const perm = await Native.notifPermission();
        if (perm === 'denied') {
          UI.toast(t('set.remCheckin') + ' — ' + t('set.testFail'), 'bad');
          ciToggle.querySelector('input').checked = false;
          return;
        }
      }
      const rem = Store.settings.get().reminders || {};
      rem.checkin = Object.assign({}, rem.checkin, { on: val });
      Store.settings.update({ reminders: rem });
      ciTimeInp.disabled = !val;
      Native.syncReminders();
    });

    function reminderRow(label, toggle, timeInp) {
      return UI.el('div', { style: { padding: '10px 16px' } }, [
        UI.el('div', { class: 'row between gap3', style: { alignItems: 'center' } }, [
          UI.el('div', { class: 'b grow' }, label),
          toggle,
        ]),
        UI.el('div', { class: 'row gap2', style: { marginTop: '8px', alignItems: 'center' } }, [
          UI.el('div', { class: 'small soft' }, t('set.remTime')),
          timeInp,
        ]),
      ]);
    }

    return [
      sectionHead('set.reminders'),
      glassSection([
        reminderRow(t('set.remWindDown'), wdToggle, wdTimeInp),
        reminderRow(t('set.remCheckin'), ciToggle, ciTimeInp),
      ]),
    ];
  }

  // ---- 6. YOUR DATA ---------------------------------------------------------

  function dataSection() {

    // Export
    function doExport() {
      try {
        const json = Store.export();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const ts = new Date().toISOString().slice(0, 10);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'anchor-data-' + ts + '.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
        UI.toast(t('app.saved'), 'good');
        // Also offer native share
        Native.share(json, t('app.name'));
      } catch (e) {
        UI.toast(t('set.testFail'), 'bad');
      }
    }

    const exportBtn = UI.btn(t('set.export'), {
      class: 'btn-ghost btn-sm',
      icon: 'download',
      onClick: doExport,
    });

    // Import
    const fileInput = UI.el('input', {
      type: 'file',
      accept: '.json,application/json',
      style: { display: 'none' },
    });
    fileInput.addEventListener('change', function () {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        const ok = Store.import(e.target.result);
        if (ok) {
          UI.toast(t('app.saved'), 'good');
          Anchor.refresh();
        } else {
          UI.toast(t('set.testFail'), 'bad');
        }
        fileInput.value = '';
      };
      reader.readAsText(file);
    });

    const importBtn = UI.btn(t('set.import'), {
      class: 'btn-ghost btn-sm',
      icon: 'book',
      onClick: function () { fileInput.click(); },
    });

    // Demo data
    const demoBtn = UI.btn(t('app.start'), {
      class: 'btn-ghost btn-sm',
      icon: 'spark',
      onClick: async function () {
        const yes = await UI.confirm(t('app.confirm'), { title: t('app.name') });
        if (!yes) return;
        if (window.Seed && Seed.apply) {
          Seed.apply();
          UI.toast(t('app.saved'), 'good');
          Anchor.refresh();
        }
      },
    });

    // Erase
    const eraseBtn = UI.btn(t('set.erase'), {
      class: 'btn-ghost btn-sm',
      icon: 'trash',
      onClick: async function () {
        const yes = await UI.confirm(t('set.eraseConfirm'), { danger: true, confirmLabel: t('set.erase') });
        if (!yes) return;
        Store.reset();
        location.reload();
      },
    });

    function dataRow(label, sub, control) {
      return UI.el('div', { style: { padding: '10px 16px' } }, [
        UI.el('div', { class: 'row between gap3', style: { alignItems: 'center' } }, [
          UI.el('div', { class: 'grow' }, [
            UI.el('div', { class: 'b' }, label),
            sub ? UI.el('div', { class: 'small soft', style: { marginTop: '2px' } }, sub) : null,
          ]),
          control,
        ]),
      ]);
    }

    return [
      sectionHead('set.data'),
      glassSection([
        dataRow(t('set.export'), t('set.exportSub'), exportBtn),
        dataRow(t('set.import'), null, importBtn),
        dataRow(t('app.start'), null, demoBtn),
        dataRow(t('set.erase'), t('set.eraseSub'),
          UI.el('div', { style: { color: 'var(--bad)' } }, [eraseBtn])),
      ]),
      fileInput,
    ];
  }

  // ---- 7. ABOUT -------------------------------------------------------------

  function aboutSection() {

    const supportBtn = UI.btn(t('set.care'), {
      class: 'btn-ghost btn-sm',
      icon: 'heart',
      onClick: function () {
        if (window.Crisis && Crisis.open) Crisis.open();
      },
    });

    const resetOnbBtn = UI.btn(t('set.signOutData'), {
      class: 'btn-ghost btn-sm',
      icon: 'arrow',
      onClick: function () {
        Store.profile.update({ onboarded: false });
        location.reload();
      },
    });

    function aboutRow(label, right, sub) {
      return UI.el('div', { style: { padding: '10px 16px' } }, [
        UI.el('div', { class: 'row between gap3', style: { alignItems: 'center' } }, [
          UI.el('div', { class: 'grow' }, [
            UI.el('div', { class: 'b' }, label),
            sub ? UI.el('div', { class: 'small soft', style: { marginTop: '2px' } }, sub) : null,
          ]),
          right || null,
        ]),
      ]);
    }

    return [
      sectionHead('set.about'),
      glassSection([
        aboutRow(t('set.version'), UI.el('div', { class: 'small soft' }, '1.0.0'), null),
        aboutRow(t('set.care'), supportBtn, null),
        aboutRow(t('set.privacy'), null, t('set.privacyText')),
        aboutRow(t('set.signOutData'), resetOnbBtn, null),
      ]),
      // Care note from care.* keys
      UI.el('div', { class: 'small soft', style: { marginTop: '12px', padding: '0 4px', lineHeight: '1.5', textAlign: 'center' } }, t('care.disclaimer')),
    ];
  }

  // ---- main render ----------------------------------------------------------

  // ---- accent / color gradient picker --------------------------------------
  function accentSection() {
    const ACCENTS = (window.App && App.ACCENTS) || {};
    const order = ['aurora', 'sunset', 'forest', 'ocean', 'rose', 'gold', 'mono'];
    const current = Store.get('settings.accent', 'aurora');
    const swatches = UI.el('div', { class: 'row wrap gap3', style: { padding: '12px 16px' } },
      order.filter(id => ACCENTS[id]).map(id => {
        const stops = ACCENTS[id];
        const sel = id === current;
        const sw = UI.el('button', { 'aria-label': id, onclick: () => {
          Store.settings.update({ accent: id });
          if (window.App && App.applyAccent) App.applyAccent();
          UI.haptic('light'); Anchor.refresh();
        }, style: {
          width: '46px', height: '46px', borderRadius: '14px', flex: '0 0 auto',
          background: 'linear-gradient(135deg,' + stops[0] + ',' + stops[1] + ' 45%,' + stops[2] + ')',
          border: sel ? '2px solid #fff' : '2px solid transparent',
          boxShadow: sel ? '0 0 0 3px rgba(124,156,255,0.4), 0 6px 16px -6px ' + stops[0] : '0 4px 12px -6px rgba(0,0,0,0.4)',
          transition: 'transform .15s var(--ease-spring)',
        } });
        return UI.el('div', { class: 'col center gap1' }, [sw, UI.el('span', { class: 'tiny muted' }, t('set.accent' + id[0].toUpperCase() + id.slice(1)))]);
      })
    );
    return [
      sectionHead('set.accent'),
      glassSection([
        UI.el('div', { class: 'small soft', style: { padding: '12px 16px 0' } }, t('set.accentSub')),
        swatches,
      ]),
    ];
  }

  // ---- sleep schedule (bedtime / wake) -------------------------------------
  function scheduleSection() {
    const sch = (window.Night && Night.schedule()) || { bedHour: 22, bedMin: 30, wakeHour: 7, wakeMin: 0 };
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function timeInput(h, m, onChange) {
      const inp = UI.el('input', { type: 'time', class: 'input', value: pad(h) + ':' + pad(m), style: { width: '120px' } });
      inp.addEventListener('change', () => { const [hh, mm] = inp.value.split(':').map(Number); onChange(hh || 0, mm || 0); });
      return inp;
    }
    function save(patch) {
      const cur = Store.get('settings.sleepSchedule', {}) || {};
      Store.settings.update({ sleepSchedule: Object.assign({ bedHour: sch.bedHour, bedMin: sch.bedMin, wakeHour: sch.wakeHour, wakeMin: sch.wakeMin }, cur, patch) });
    }
    return [
      sectionHead('set.sleepSchedule'),
      glassSection([
        iconRow('moon', t('set.bedtime'), null, timeInput(sch.bedHour, sch.bedMin, (h, m) => save({ bedHour: h, bedMin: m }))),
        iconRow('sunrise', t('set.wakeTime'), null, timeInput(sch.wakeHour, sch.wakeMin, (h, m) => save({ wakeHour: h, wakeMin: m }))),
        UI.el('div', { class: 'small soft', style: { padding: '4px 16px 12px' } }, t('set.bedtimeSub')),
      ]),
    ];
  }

  // ---- account (sign out) --------------------------------------------------
  function accountSection() {
    if (!window.Auth) return [];
    const acct = Auth.account();
    return [
      sectionHead('set.account'),
      glassSection([
        acct ? iconRow('user', t('set.signedInAs', { name: acct.name }), acct.email || t('auth.onDevice'), null) : null,
        UI.el('div', { style: { padding: '12px 16px 14px' } }, [
          UI.btn(t('auth.signOut'), { class: 'btn-block', icon: 'lock', onClick: () => Auth.signOut() }),
        ]),
      ]),
    ];
  }

  // ---- email & digests (Resend) -------------------------------------------
  function emailSummaryLines() {
    const lines = [];
    const s = Store.derive.lastSleep && Store.derive.lastSleep();
    if (s) lines.push('Last night: ' + UI.fmt.dur(s.durationMin) + ' in bed, sleep score ' + s.score + '.');
    const m = Store.derive.dayMood && Store.derive.dayMood(Store.today());
    if (m) lines.push('Today’s inner weather: ' + UI.weatherName(m.weather) + '.');
    if (Store.streak() > 1) lines.push('You’re on a ' + Store.streak() + '-day streak. 🔥');
    const top = window.PatternDetective && PatternDetective.topInsight && PatternDetective.topInsight();
    if (top) lines.push('Anchor noticed: ' + top.text);
    if (!lines.length) lines.push('Keep checking in — your first patterns are on their way.');
    return lines;
  }

  async function postEmail(pathName, body) {
    const base = (Store.get('settings.bridgeUrl', '') || '').trim().replace(/\/+$/, '');
    const urls = [];
    if (base) urls.push((/^https?:\/\//i.test(base) ? base : 'http://' + base) + pathName);
    urls.push(pathName); // relative — works when the page is served by the bridge
    let lastErr = { error: t('email.noBridge') };
    for (const u of urls) {
      try {
        const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (r.ok) return { ok: true, j };
        lastErr = j.code === 'no-key' ? { error: t('email.noKey') } : j;
      } catch (e) { /* try next */ }
    }
    return { ok: false, error: lastErr.error || t('email.failed') };
  }

  function emailSection() {
    const acct = (window.Auth && Auth.account && Auth.account()) || {};
    const emailInput = UI.el('input', { type: 'email', class: 'input', value: acct.email || Store.get('profile.account.email', '') || '',
      placeholder: t('email.addressPlaceholder'), autocapitalize: 'none', autocomplete: 'email', style: { margin: '0 16px', width: 'calc(100% - 32px)' } });
    emailInput.addEventListener('blur', () => {
      const v = emailInput.value.trim();
      const a = Store.get('profile.account', null);
      if (a) { a.email = v; Store.profile.update({ account: a }); }
    });
    const status = UI.el('div', { class: 'small', style: { padding: '6px 16px 0', minHeight: '18px', color: 'var(--ink-faint)' } });

    const testBtn = UI.btn(t('email.test'), { class: 'btn-primary btn-sm', icon: 'bell', onClick: async () => {
      const to = emailInput.value.trim();
      if (!/.+@.+\..+/.test(to)) { status.textContent = '⚠️ ' + t('email.noAddress'); status.style.color = 'var(--bad)'; UI.haptic('error'); return; }
      status.textContent = t('email.sending'); status.style.color = 'var(--ink-faint)'; testBtn.disabled = true;
      const r = await postEmail('/api/email/test', { to, name: Store.profile.name(), lines: emailSummaryLines(), subject: t('email.subject') });
      status.textContent = (r.ok ? '✅ ' + t('email.sent') : '⚠️ ' + r.error);
      status.style.color = r.ok ? 'var(--good)' : 'var(--bad)';
      UI.haptic(r.ok ? 'success' : 'error'); testBtn.disabled = false;
    } });

    function broadcastBtn(kind, labelKey) {
      const id = (window.CONFIG && CONFIG.resend && CONFIG.resend[kind]) || '';
      return UI.btn(t(labelKey), { class: 'btn-ghost btn-sm', onClick: async () => {
        status.textContent = t('email.sending'); testBtn.disabled = true;
        const r = await postEmail('/api/email/broadcast', { kind, broadcastId: id });
        status.textContent = (r.ok ? '✅ ' + t('email.sent') : '⚠️ ' + r.error);
        status.style.color = r.ok ? 'var(--good)' : 'var(--bad)';
        UI.haptic(r.ok ? 'success' : 'error'); testBtn.disabled = false;
      } });
    }

    return [
      sectionHead('email.section'),
      glassSection([
        UI.el('div', { class: 'small soft', style: { padding: '12px 16px 0' } }, t('email.sub')),
        emailInput,
        UI.el('div', { style: { padding: '12px 16px 6px' } }, [testBtn]),
        status,
        UI.el('div', { class: 'row wrap gap2', style: { padding: '8px 16px 14px' } }, [
          broadcastBtn('daily', 'email.daily'), broadcastBtn('weekly', 'email.weekly'), broadcastBtn('monthly', 'email.monthly'),
        ]),
        UI.el('div', { class: 'tiny muted', style: { padding: '0 16px 12px' } }, t('email.digestNote')),
      ]),
    ];
  }

  // ---- location weather ----------------------------------------------------
  function locationSection() {
    if (!window.Weather) return [];
    const w = Weather.get();
    const status = UI.el('div', { class: 'small soft', style: { padding: '4px 16px 0' } },
      w && !w.denied && w.tempC != null ? '📍 ' + Math.round(w.tempC) + '°C · ' + t('outside.' + (w.cond || 'clear')) : t('set.locationSub'));
    return [
      sectionHead('set.location'),
      glassSection([
        status,
        UI.el('div', { style: { padding: '10px 16px 12px' } }, [
          UI.btn(t('outside.enable'), { class: 'btn-ghost btn-sm', icon: 'globe', onClick: async () => { await Weather.requestLocation(); UI.haptic('light'); Anchor.refresh(); } }),
        ]),
      ]),
    ];
  }

  function render(root) {
    // Page header
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('h1', { class: 'page-title' }, t('set.title')),
    ]));

    const col = UI.el('div', { class: 'col gap0 stagger', style: { paddingBottom: '48px' } });
    root.appendChild(col);

    function appendItems(items) {
      items.forEach(function (item) { if (item) col.appendChild(item); });
    }

    appendItems(profileSection());
    appendItems(accountSection());
    appendItems(languageSection(root));
    appendItems(appearanceSection());
    appendItems(accentSection());
    appendItems(scheduleSection());
    appendItems(deviceSection(root));
    appendItems(locationSection());
    appendItems(emailSection());
    appendItems(remindersSection());
    appendItems(dataSection());
    appendItems(aboutSection());
  }

  Anchor.register({
    id: 'settings',
    labelKey: 'nav.settings',
    icon: 'settings',
    order: 100,
    tab: false,
    render,
  });

})();
