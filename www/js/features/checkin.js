// ===========================================================================
// checkin.js — "Check-in" feature. A beautiful, fast mood check-in with a
// valence/energy/arousal scale, live weather preview, tag chips, optional
// note, and a warm confirmation screen.
//
// Registers as: Anchor.register({ id:'checkin', … })
// ===========================================================================
(function () {

  // ---- helpers --------------------------------------------------------------

  // Map valence integer (-2..2) → label key
  function valenceLabelKey(v) {
    if (v <= -2) return 'chk.veryLow';
    if (v <= -1) return 'chk.low';
    if (v <= 0)  return 'chk.ok';
    if (v <= 1)  return 'chk.good';
    return 'chk.great';
  }

  // Big animated emoji face matching valence
  function valenceEmoji(v) {
    if (v <= -2) return '😞';
    if (v <= -1) return '😔';
    if (v <= 0)  return '😐';
    if (v <= 1)  return '🙂';
    return '😄';
  }

  // Gradient class names per level (reused for label colour)
  function valenceColorStyle(v) {
    if (v <= -2) return 'color:var(--bad)';
    if (v <= -1) return 'color:var(--warn)';
    if (v <= 0)  return 'color:var(--ink-soft)';
    if (v <= 1)  return 'color:var(--a1)';
    return 'color:var(--good)';
  }

  // Turn the 0-10 energy value into a coloured label
  function energyLabel(val) {
    if (val <= 2) return { text: '⚡ ' + val, style: 'color:var(--bad)' };
    if (val <= 4) return { text: '⚡ ' + val, style: 'color:var(--warn)' };
    if (val <= 7) return { text: '⚡ ' + val, style: 'color:var(--a1)' };
    return { text: '⚡ ' + val, style: 'color:var(--good)' };
  }

  // Turn 0-10 arousal into a coloured label
  function arousalLabel(val) {
    if (val <= 3) return { text: '〰 ' + val, style: 'color:var(--ink-soft)' };
    if (val <= 6) return { text: '〰 ' + val, style: 'color:var(--a1)' };
    return { text: '〰 ' + val, style: 'color:var(--warn)' };
  }

  // Parse the pipe-separated tag list from i18n
  function tagList() {
    const raw = t('chk.tagList') || '';
    return raw.split('|').map(s => s.trim()).filter(Boolean);
  }

  // ---- main render ----------------------------------------------------------

  function render(root) {
    const E = UI.el;

    // State
    let valence = 0;   // -2..2  (integer steps on slider)
    let energy  = 5;   // 0-10
    let arousal = 5;   // 0-10
    let selectedTags = [];
    let note = '';

    // Check if there are already check-ins today
    const todayKey = Store.today();
    const existingToday = Store.moods.byDate(todayKey);
    const hasToday = existingToday && existingToday.length > 0;

    // ---- page header --------------------------------------------------------
    root.appendChild(E('div', { class: 'page-head' }, [
      E('div', { class: 'eyebrow' }, UI.fmt.date(todayKey, { weekday: 'long', month: 'long', day: 'numeric' })),
      E('h1', { class: 'page-title serif' }, t('chk.title')),
      E('div', { class: 'soft small mt1' }, t('chk.how')),
    ]));

    // Gentle "already checked in today" banner (non-blocking)
    if (hasToday) {
      const count = existingToday.length;
      const banner = E('div', {
        class: 'glass-card card',
        style: { borderColor: 'rgba(var(--a1-rgb,100,160,255),0.35)', display: 'flex', gap: '10px', alignItems: 'center' },
      }, [
        UI.frag(`<span style="font-size:1.3rem">🌤</span>`),
        E('div', { class: 'grow' }, [
          E('div', { class: 'small b' }, count === 1
            ? t('app.today') + ' · 1 ' + t('chk.title').toLowerCase()
            : t('app.today') + ' · ' + count + ' check-ins'),
          E('div', { class: 'tiny soft' }, t('chk.streakKeep')),
        ]),
      ]);
      root.appendChild(banner);
    }

    const form = E('div', { class: 'col gap4 stagger' });
    root.appendChild(form);

    // ---- LIVE WEATHER PREVIEW -----------------------------------------------
    const previewEmoji = E('span', { style: { fontSize: '2rem', lineHeight: 1 } }, UI.weatherEmoji(Store.weatherFor(valence, energy)));
    const previewName  = E('span', { class: 'b', style: { fontSize: '1rem' } }, UI.weatherName(Store.weatherFor(valence, energy)));

    const weatherPreviewCard = UI.card([
      E('div', { class: 'row between', style: { alignItems: 'center' } }, [
        E('div', { class: 'eyebrow' }, t('dash.todayWeather')),
        E('div', { class: 'row gap2', style: { alignItems: 'center' } }, [previewEmoji, previewName]),
      ]),
    ], { sheen: true });

    form.appendChild(weatherPreviewCard);

    // ---- helper: update live weather preview --------------------------------
    function updateWeatherPreview() {
      const code = Store.weatherFor(valence, energy);
      previewEmoji.textContent = UI.weatherEmoji(code);
      previewName.textContent  = UI.weatherName(code);
    }

    // =========================================================================
    // 1. VALENCE CONTROL
    // =========================================================================
    const faceEl  = E('div', {
      class: 'checkin-face',
      style: {
        fontSize: '4rem',
        textAlign: 'center',
        lineHeight: 1,
        transition: 'transform 0.25s cubic-bezier(.34,1.56,.64,1)',
        display: 'block',
        userSelect: 'none',
      },
    }, valenceEmoji(valence));

    const valenceLabelEl = E('div', {
      class: 'b',
      style: {
        textAlign: 'center',
        fontSize: '1.1rem',
        marginTop: '6px',
        transition: 'color 0.3s ease',
        ...parseStyleString(valenceColorStyle(valence)),
      },
    }, t(valenceLabelKey(valence)));

    const valenceSlider = E('input', {
      type: 'range',
      class: 'range',
      min: '-2',
      max: '2',
      step: '1',
      value: String(valence),
      style: { width: '100%', marginTop: '14px' },
    });

    valenceSlider.addEventListener('input', function () {
      valence = parseInt(this.value, 10);
      faceEl.textContent = valenceEmoji(valence);
      // Bounce animation
      faceEl.style.transform = 'scale(1.25)';
      setTimeout(() => { faceEl.style.transform = 'scale(1)'; }, 180);
      valenceLabelEl.textContent = t(valenceLabelKey(valence));
      Object.assign(valenceLabelEl.style, parseStyleString(valenceColorStyle(valence)));
      updateWeatherPreview();
    });

    // Tick marks for the valence slider (-2 -1 0 1 2)
    const ticks = E('div', {
      style: { display: 'flex', justifyContent: 'space-between', padding: '0 2px', marginTop: '2px' },
    }, ['-2', '-1', '0', '1', '2'].map(l => E('span', { class: 'tiny soft', style: { width: '20px', textAlign: 'center' } }, l)));

    const valenceCard = UI.card([
      E('div', { class: 'eyebrow', style: { marginBottom: '10px' } }, t('chk.valence')),
      E('div', { style: { padding: '4px 0 8px' } }, [faceEl, valenceLabelEl]),
      valenceSlider,
      ticks,
    ]);

    form.appendChild(valenceCard);

    // =========================================================================
    // 2. ENERGY
    // =========================================================================
    const energyValEl = E('span', {
      class: 'b',
      style: { ...parseStyleString(energyLabel(energy).style), transition: 'color 0.2s' },
    }, energyLabel(energy).text);

    const energySlider = E('input', {
      type: 'range',
      class: 'range',
      min: '0',
      max: '10',
      step: '1',
      value: String(energy),
      style: { width: '100%', marginTop: '10px' },
    });

    energySlider.addEventListener('input', function () {
      energy = parseInt(this.value, 10);
      const lbl = energyLabel(energy);
      energyValEl.textContent = lbl.text;
      Object.assign(energyValEl.style, parseStyleString(lbl.style));
      updateWeatherPreview();
    });

    const energyCard = UI.card([
      E('div', { class: 'row between', style: { alignItems: 'center' } }, [
        E('div', { class: 'eyebrow' }, t('chk.energy')),
        energyValEl,
      ]),
      energySlider,
      E('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '0 2px', marginTop: '2px' } }, [
        E('span', { class: 'tiny soft' }, '0'),
        E('span', { class: 'tiny soft' }, '5'),
        E('span', { class: 'tiny soft' }, '10'),
      ]),
    ]);

    form.appendChild(energyCard);

    // =========================================================================
    // 3. AROUSAL / ACTIVATION
    // =========================================================================
    const arousalValEl = E('span', {
      class: 'b',
      style: { ...parseStyleString(arousalLabel(arousal).style), transition: 'color 0.2s' },
    }, arousalLabel(arousal).text);

    const arousalSlider = E('input', {
      type: 'range',
      class: 'range',
      min: '0',
      max: '10',
      step: '1',
      value: String(arousal),
      style: { width: '100%', marginTop: '10px' },
    });

    arousalSlider.addEventListener('input', function () {
      arousal = parseInt(this.value, 10);
      const lbl = arousalLabel(arousal);
      arousalValEl.textContent = lbl.text;
      Object.assign(arousalValEl.style, parseStyleString(lbl.style));
    });

    const arousalCard = UI.card([
      E('div', { class: 'row between', style: { alignItems: 'center' } }, [
        E('div', { class: 'eyebrow' }, t('chk.arousal')),
        arousalValEl,
      ]),
      arousalSlider,
      E('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '0 2px', marginTop: '2px' } }, [
        E('span', { class: 'tiny soft' }, '0'),
        E('span', { class: 'tiny soft' }, '5'),
        E('span', { class: 'tiny soft' }, '10'),
      ]),
    ]);

    form.appendChild(arousalCard);

    // =========================================================================
    // 4. TAGS
    // =========================================================================
    const tags = tagList();
    const tagChips = UI.chips(tags, selectedTags, function (newSelected) {
      selectedTags = newSelected;
    });

    const tagsCard = UI.card([
      E('div', { class: 'eyebrow', style: { marginBottom: '10px' } }, t('chk.tags')),
      tagChips,
    ]);

    form.appendChild(tagsCard);

    // =========================================================================
    // 5. NOTE (optional)
    // =========================================================================
    const noteArea = E('textarea', {
      class: 'field-input',
      placeholder: t('chk.notePlaceholder'),
      rows: '3',
      style: {
        width: '100%',
        resize: 'vertical',
        fontFamily: 'inherit',
        fontSize: '0.95rem',
        padding: '10px 12px',
        borderRadius: 'var(--r-md)',
        background: 'var(--glass-bg)',
        border: '1px solid var(--border)',
        color: 'var(--ink)',
        outline: 'none',
        boxSizing: 'border-box',
      },
    });
    noteArea.addEventListener('input', function () { note = this.value; });

    const noteCard = UI.card([
      E('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('chk.addNote')),
      noteArea,
    ]);

    form.appendChild(noteCard);

    // =========================================================================
    // 6. SAVE BUTTON
    // =========================================================================
    const saveBtn = UI.btn(t('chk.save'), {
      class: 'btn-primary btn-block',
      block: true,
      icon: 'check',
      onClick: handleSave,
    });

    form.appendChild(E('div', { style: { paddingBottom: '32px' } }, [saveBtn]));

    // ---- save handler -------------------------------------------------------
    function handleSave() {
      (UI.hapticCommit || UI.haptic)('success');

      // Persist
      Store.moods.add({
        valence: valence,
        energy: energy,
        arousal: arousal,
        note: note.trim(),
        tags: selectedTags.slice(),
      });

      // Replace the form with a confirmation screen
      UI.clear(root);
      showConfirmation(root);
    }
  }

  // =========================================================================
  // CONFIRMATION SCREEN
  // =========================================================================
  function showConfirmation(root) {
    const E = UI.el;
    const todayKey = Store.today();
    const dayMood  = Store.derive.dayMood(todayKey);
    const wxCode   = dayMood ? dayMood.weather : 'cloud';

    // Page head with a celebratory feel
    root.appendChild(E('div', { class: 'page-head' }, [
      E('div', { class: 'eyebrow' }, UI.fmt.date(todayKey, { weekday: 'long', month: 'long', day: 'numeric' })),
      E('h1', { class: 'page-title serif' }, t('chk.title')),
    ]));

    const body = E('div', { class: 'col gap4 stagger' });
    root.appendChild(body);

    // ---- saved message card -------------------------------------------------
    const savedCard = UI.card([
      E('div', { style: { textAlign: 'center', padding: '8px 0 4px' } }, [
        E('div', { style: { fontSize: '3rem', marginBottom: '8px' } }, '✓'),
        E('div', { class: 'b', style: { fontSize: '1.1rem' } }, t('chk.saved')),
      ]),
    ], { sheen: true });

    body.appendChild(savedCard);

    // ---- today's resulting weather ------------------------------------------
    const weatherCard = UI.card([
      E('div', { class: 'eyebrow', style: { marginBottom: '8px' } }, t('dash.todayWeather')),
      E('div', { class: 'row gap3', style: { alignItems: 'center' } }, [
        E('div', { style: { fontSize: '3rem', lineHeight: 1 } }, UI.weatherEmoji(wxCode)),
        E('div', {}, [
          E('div', { class: 'big b' }, UI.weatherName(wxCode)),
          dayMood && dayMood.count > 1
            ? E('div', { class: 'tiny soft', style: { marginTop: '3px' } }, dayMood.count + ' check-ins today')
            : null,
        ]),
      ]),
    ]);

    body.appendChild(weatherCard);

    // ---- mood summary tile row -----------------------------------------------
    if (dayMood) {
      const valLabel = valenceKeyFromValue(dayMood.valence);
      const tiles = E('div', { class: 'tiles' }, [
        UI.tile(
          valLabel,
          t('chk.valence'),
          null,
          { color: valenceColorFromFloat(dayMood.valence) }
        ),
        UI.tile(
          '⚡ ' + dayMood.energy.toFixed(1),
          t('chk.energy'),
          null,
          {}
        ),
      ]);
      body.appendChild(tiles);
    }

    // ---- navigation buttons -------------------------------------------------
    const btnRow = E('div', { class: 'col gap2', style: { paddingBottom: '32px' } }, [
      UI.btn(t('nav.home'), {
        class: 'btn-primary btn-block',
        block: true,
        icon: 'home',
        onClick: () => Anchor.go('home'),
      }),
      UI.btn(t('nav.weather'), {
        class: 'btn-ghost btn-block',
        block: true,
        icon: 'weather',
        onClick: () => Anchor.go('weather'),
      }),
    ]);

    body.appendChild(btnRow);
  }

  // =========================================================================
  // SMALL UTILITIES (module-private)
  // =========================================================================

  // Turn a css-style "key:value" string into a plain object for Object.assign(el.style,...)
  function parseStyleString(str) {
    const obj = {};
    if (!str) return obj;
    str.split(';').forEach(function (pair) {
      const idx = pair.indexOf(':');
      if (idx < 0) return;
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      if (k) {
        // convert kebab-case to camelCase
        const camel = k.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
        obj[camel] = v;
      }
    });
    return obj;
  }

  // Convert averaged float valence back to a readable label (for confirmation screen)
  function valenceKeyFromValue(v) {
    if (v <= -1.5) return t('chk.veryLow');
    if (v <= -0.5) return t('chk.low');
    if (v <= 0.5)  return t('chk.ok');
    if (v <= 1.5)  return t('chk.good');
    return t('chk.great');
  }

  function valenceColorFromFloat(v) {
    if (v <= -1.5) return 'var(--bad)';
    if (v <= -0.5) return 'var(--warn)';
    if (v <= 0.5)  return 'var(--ink-soft)';
    if (v <= 1.5)  return 'var(--a1)';
    return 'var(--good)';
  }

  // =========================================================================
  // REGISTER
  // =========================================================================
  Anchor.register({
    id: 'checkin',
    labelKey: 'nav.checkin',
    icon: 'checkin',
    order: 5,
    tab: false,
    render,
  });

})();
