// ===========================================================================
// journal.js — Journal: your own words, kept and understood.
//
// Features:
//   - New entry textarea with reflection prompt chips
//   - Word count, save with LLM sentiment/themes analysis (local fallback)
//   - Reverse-chronological entry list with sentiment tone chips
//   - Entry detail sheet: full text, mood read, themes, delete
//   - Live translate toggle using Store settings + LLM.translate
//   - Mirror.analyze integration when available
//   - Empty state
// ===========================================================================
(function () {

  // -------------------------------------------------------------------------
  // Local sentiment heuristic (offline fallback)
  // -------------------------------------------------------------------------
  const POS_WORDS = new Set([
    'good','great','happy','joy','joyful','grateful','thankful','love','loved',
    'amazing','wonderful','beautiful','peace','peaceful','calm','hope','hopeful',
    'excited','energized','proud','accomplished','kind','bright','clear','free',
    'laugh','smile','connect','connection','alive','strong','inspired','grateful',
    'better','best','perfect','enjoy','enjoyed','content','warmth','warm','light',
    'relief','relieved','progress','win','won','success','succeeded','positive',
  ]);
  const NEG_WORDS = new Set([
    'bad','sad','angry','upset','anxious','anxiety','stress','stressed','fear',
    'afraid','worried','worry','tired','exhausted','drained','lost','alone',
    'lonely','dark','heavy','hurt','pain','cry','cried','hate','awful','terrible',
    'empty','numb','overwhelmed','hopeless','broken','stuck','failed','fail',
    'shame','guilty','guilt','regret','bitter','difficult','hard','worse','worst',
    'depressed','depression','scared','doubt','helpless','nothing','never','always',
  ]);

  function localSentiment(text) {
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    let pos = 0, neg = 0;
    words.forEach(w => {
      if (POS_WORDS.has(w)) pos++;
      if (NEG_WORDS.has(w)) neg++;
    });
    const total = pos + neg;
    const score = total === 0 ? 0 : ((pos - neg) / Math.max(total, 1));
    const clamped = Math.max(-1, Math.min(1, score));
    let label, moodRead;
    if (clamped > 0.4) { label = 'positive'; moodRead = 'uplifted'; }
    else if (clamped > 0.1) { label = 'positive'; moodRead = 'settled'; }
    else if (clamped < -0.4) { label = 'negative'; moodRead = 'heavy'; }
    else if (clamped < -0.1) { label = 'negative'; moodRead = 'uneasy'; }
    else { label = 'neutral'; moodRead = 'steady'; }
    return { score: clamped, label, moodRead };
  }

  function localThemes(text) {
    const lower = text.toLowerCase();
    const candidates = [
      ['work', ['work','job','project','meeting','boss','colleague','task','career','deadline']],
      ['relationships', ['friend','family','partner','loved','together','alone','lonely','connect']],
      ['health', ['sleep','tired','energy','body','exercise','sick','pain','rest','eat']],
      ['emotions', ['feel','feeling','emotion','mood','happy','sad','angry','anxious','calm']],
      ['growth', ['learn','grow','change','goal','progress','improve','better','reflect']],
      ['gratitude', ['grateful','thankful','appreciate','lucky','blessed','gift']],
      ['stress', ['stress','overwhelm','pressure','worry','anxious','anxiety','burden']],
    ];
    const found = [];
    for (const [theme, kws] of candidates) {
      if (kws.some(kw => lower.includes(kw))) found.push(theme);
      if (found.length >= 3) break;
    }
    return found;
  }

  // -------------------------------------------------------------------------
  // Sentiment tone color
  // -------------------------------------------------------------------------
  function toneColor(score) {
    if (score == null) return 'var(--ink-ghost)';
    if (score > 0.25) return 'var(--good)';
    if (score < -0.25) return 'var(--bad)';
    return 'var(--warn)';
  }

  function toneClass(score) {
    if (score == null) return '';
    if (score > 0.25) return ' good';
    if (score < -0.25) return ' bad';
    return ' warn';
  }

  // -------------------------------------------------------------------------
  // Word count helper
  // -------------------------------------------------------------------------
  function wordCount(text) {
    if (!text || !text.trim()) return 0;
    return (text.trim().match(/\S+/g) || []).length;
  }

  // -------------------------------------------------------------------------
  // Excerpt helper
  // -------------------------------------------------------------------------
  function excerpt(text, maxChars) {
    maxChars = maxChars || 90;
    if (!text) return '';
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length <= maxChars ? flat : flat.slice(0, maxChars).replace(/\s+\S*$/, '') + '…';
  }

  // -------------------------------------------------------------------------
  // Entry detail sheet
  // -------------------------------------------------------------------------
  function openEntryDetail(entry) {
    // Offer to translate an entry only when the app is in a non-English language
    // (the "translate AI replies" setting was removed — translation is automatic).
    const liveTranslate = (window.I18N && I18N.lang && I18N.lang !== 'en');
    const sentiment = entry.sentiment || {};
    const themes = Array.isArray(entry.themes) ? entry.themes : [];
    const score = sentiment.score != null ? sentiment.score : null;

    const body = UI.el('div', { class: 'col gap4', style: { padding: '4px 0 12px' } });

    // Date + word count subline
    const wc = wordCount(entry.text || '');
    body.appendChild(
      UI.el('div', { class: 'row between small soft', style: { marginBottom: '2px' } }, [
        UI.el('span', {}, UI.fmt.date(entry.date, { weekday: 'long', month: 'long', day: 'numeric' })),
        UI.el('span', {}, t('jour.wordCount', { n: wc })),
      ])
    );

    // Full text
    const textBlock = UI.el('div', {
      class: 'glass-card card',
      style: { whiteSpace: 'pre-wrap', lineHeight: '1.65', fontSize: '0.97rem', maxHeight: '38vh', overflowY: 'auto' },
    }, entry.text || '');
    body.appendChild(textBlock);

    // Sentiment + mood row
    if (score != null) {
      const sentChip = UI.el('span', {
        class: 'chip' + toneClass(score),
        style: { color: toneColor(score) },
      }, t('jour.sentiment') + ': ' + (sentiment.label || ''));

      const moodRow = UI.el('div', { class: 'col gap2' }, [
        UI.el('div', { class: 'row wrap gap2' }, [sentChip]),
        sentiment.moodRead
          ? UI.el('div', { class: 'small soft', style: { marginTop: '2px' } }, [
              UI.el('span', { class: 'b' }, t('jour.mood') + ': '),
              sentiment.moodRead,
            ])
          : null,
      ]);
      body.appendChild(moodRow);
    }

    // Themes chips
    if (themes.length) {
      const themesRow = UI.el('div', { class: 'col gap2' });
      themesRow.appendChild(UI.el('div', { class: 'eyebrow' }, t('jour.themes')));
      const chipRow = UI.el('div', { class: 'row wrap gap2' });
      themes.forEach(th => chipRow.appendChild(UI.el('span', { class: 'chip' }, th)));
      themesRow.appendChild(chipRow);
      body.appendChild(themesRow);
    }

    // Live translate section
    if (liveTranslate) {
      const translateSection = UI.el('div', { class: 'col gap2' });
      const translateBtn = UI.btn(t('jour.translateToggle'), {
        class: 'btn-ghost',
        icon: 'globe',
        onClick: async () => {
          const outputEl = translateSection.querySelector('.translate-output');
          if (outputEl && outputEl.dataset.done === '1') {
            outputEl.style.display = outputEl.style.display === 'none' ? '' : 'none';
            return;
          }
          translateBtn.disabled = true;
          translateBtn.textContent = t('app.thinking');
          try {
            const translated = await LLM.translate(entry.text || '', I18N.lang);
            let outputNode = translateSection.querySelector('.translate-output');
            if (!outputNode) {
              outputNode = UI.el('div', { class: 'translate-output glass-card card', style: { marginTop: '6px' } });
              translateSection.appendChild(outputNode);
            }
            outputNode.dataset.done = '1';
            outputNode.style.display = '';
            const sourceMeta = I18N.metaFor ? I18N.metaFor(entry.lang) : null;
            const nativeName = (sourceMeta && sourceMeta.native) ? sourceMeta.native : (entry.lang || '');
            UI.clear(outputNode);
            if (nativeName && entry.lang && entry.lang !== I18N.lang) {
              outputNode.appendChild(
                UI.el('div', { class: 'tiny soft', style: { marginBottom: '6px' } },
                  t('jour.translatedFrom', { lang: nativeName }))
              );
            }
            outputNode.appendChild(
              UI.el('div', { style: { whiteSpace: 'pre-wrap', lineHeight: '1.65', fontSize: '0.95rem' } }, translated)
            );
          } catch (err) {
            const errEl = translateSection.querySelector('.translate-output') || UI.el('div', { class: 'translate-output' });
            UI.clear(errEl);
            errEl.appendChild(UI.el('div', { class: 'small bad' }, err && err.message ? err.message : t('app.retry')));
            if (!translateSection.contains(errEl)) translateSection.appendChild(errEl);
          } finally {
            translateBtn.disabled = false;
            translateBtn.textContent = t('jour.translateToggle');
          }
        },
      });
      translateSection.appendChild(translateBtn);
      body.appendChild(translateSection);
    }

    // Delete button
    const deleteBtn = UI.btn(t('app.delete'), {
      class: 'btn-ghost',
      icon: 'trash',
      onClick: async () => {
        const ok = await UI.confirm(t('app.confirmDelete'), { danger: true, confirmLabel: t('app.delete') });
        if (!ok) return;
        Store.journal.remove(entry.id);
        UI.haptic('light');
        if (sheetHandle) sheetHandle.close();
        Anchor.refresh();
      },
    });
    deleteBtn.style.color = 'var(--bad)';
    deleteBtn.style.marginTop = '4px';
    body.appendChild(deleteBtn);

    const sheetHandle = UI.sheet({
      title: UI.fmt.rel(entry.date),
      body,
    });
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------
  let _jourTab = 'write'; // 'write' | 'mirror' — Journal now absorbs The Mirror

  function render(root) {
    // ---- page header ----
    root.appendChild(
      UI.el('div', { class: 'page-head' }, [
        UI.el('h1', { class: 'page-title serif' }, t('jour.title')),
        UI.el('div', { class: 'eyebrow', style: { marginTop: '4px' } }, t('jour.sub')),
      ])
    );

    // Write your entries, or step into The Mirror (language patterns) — one place.
    if (window.Mirror) {
      root.appendChild(UI.el('div', { style: { marginBottom: 'var(--s4)' } }, [
        UI.segmented([
          { value: 'write', label: t('jour.tabWrite') },
          { value: 'mirror', label: t('mir.title') },
        ], _jourTab, (v) => { _jourTab = v; Anchor.refresh(); }),
      ]));
    }

    const col = UI.el('div', { class: 'col gap4 stagger' });
    root.appendChild(col);

    if (_jourTab === 'mirror' && window.Mirror) {
      Mirror.renderBody(col);
    } else {
      col.appendChild(newEntryCard());
      col.appendChild(entriesSection());
    }
  }

  // -------------------------------------------------------------------------
  // New entry card
  // -------------------------------------------------------------------------
  function newEntryCard() {
    const card = UI.el('div', { class: 'glass-card card col gap3' });

    const header = UI.el('div', { class: 'row between', style: { alignItems: 'center' } }, [
      UI.el('div', { class: 'b big' }, t('jour.newEntry')),
    ]);
    card.appendChild(header);

    // Textarea
    const textarea = UI.el('textarea', {
      class: 'field-input',
      placeholder: t('jour.placeholder'),
      rows: 5,
      style: {
        width: '100%',
        resize: 'vertical',
        fontFamily: 'inherit',
        fontSize: '1rem',
        lineHeight: '1.6',
        padding: '12px',
        borderRadius: 'var(--r-sm)',
        background: 'var(--glass)',
        border: '1px solid var(--border)',
        color: 'var(--ink)',
        outline: 'none',
        boxSizing: 'border-box',
      },
    });
    card.appendChild(textarea);

    // Word count + dictation (speech-to-text) where supported
    const wcEl = UI.el('div', { class: 'tiny soft' }, '');
    function updateWc() {
      const n = wordCount(textarea.value);
      wcEl.textContent = n > 0 ? t('jour.wordCount', { n }) : '';
    }
    textarea.addEventListener('input', updateWc);
    const wcRow = UI.el('div', { class: 'row between', style: { alignItems: 'center', minHeight: '20px' } }, [wcEl]);
    if (window.Speech && Speech.sttSupported()) {
      const mic = Speech.micButton(textarea, { onInput: updateWc });
      if (mic) wcRow.appendChild(mic);
    }
    card.appendChild(wcRow);

    // Prompt section (initially hidden)
    const promptsWrap = UI.el('div', { class: 'col gap2', style: { display: 'none' } });
    promptsWrap.appendChild(UI.el('div', { class: 'eyebrow' }, t('jour.prompts')));
    const promptChips = UI.el('div', { class: 'row wrap gap2' });
    const rawList = t('jour.promptList') || '';
    const prompts = rawList.split('|').map(s => s.trim()).filter(Boolean);
    prompts.forEach(p => {
      const chip = UI.el('button', { class: 'chip', style: { textAlign: 'left', whiteSpace: 'normal', height: 'auto' } }, p);
      chip.addEventListener('click', () => {
        UI.haptic('light');
        const cur = textarea.value.trim();
        textarea.value = cur ? cur + '\n\n' + p + ' ' : p + ' ';
        textarea.focus();
        updateWc();
        // mark chip active
        promptChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
      promptChips.appendChild(chip);
    });
    promptsWrap.appendChild(promptChips);
    card.appendChild(promptsWrap);

    // "Need a prompt?" toggle button
    const promptToggleBtn = UI.btn(t('jour.prompt'), {
      class: 'btn-ghost',
      icon: 'spark',
      onClick: () => {
        const showing = promptsWrap.style.display !== 'none';
        promptsWrap.style.display = showing ? 'none' : '';
        UI.haptic('light');
      },
    });
    card.appendChild(promptToggleBtn);

    // Save button + analyzing state container
    const saveRow = UI.el('div', { class: 'row between gap3', style: { marginTop: '4px' } });
    const statusEl = UI.el('div', { class: 'small soft', style: { minHeight: '20px' } }, '');
    const saveBtn = UI.btn(t('jour.saveEntry'), {
      class: 'btn-primary',
      icon: 'journal',
      onClick: () => handleSave(textarea, saveBtn, statusEl, promptsWrap, promptChips, wcEl),
    });
    saveRow.appendChild(statusEl);
    saveRow.appendChild(saveBtn);
    card.appendChild(saveRow);

    return card;
  }

  // -------------------------------------------------------------------------
  // Save handler
  // -------------------------------------------------------------------------
  async function handleSave(textarea, saveBtn, statusEl, promptsWrap, promptChips, wcEl) {
    const text = (textarea.value || '').trim();
    if (!text) return;

    saveBtn.disabled = true;
    statusEl.textContent = t('jour.analyzing');

    // 1. Compute linguistics
    let linguistics = null;
    if (window.Mirror && typeof Mirror.analyze === 'function') {
      try { linguistics = Mirror.analyze(text); } catch (e) { linguistics = null; }
    }
    if (!linguistics) {
      // minimal local linguistics
      const words = text.match(/\b\w+\b/g) || [];
      const unique = new Set(words.map(w => w.toLowerCase()));
      linguistics = {
        wordCount: words.length,
        uniqueWords: unique.size,
        sentences: (text.match(/[.!?]+/g) || []).length || 1,
        avgWordLen: words.length ? Math.round(words.reduce((s, w) => s + w.length, 0) / words.length * 10) / 10 : 0,
      };
    }

    // 2. Sentiment + themes via LLM, with local fallback
    let sentiment = null;
    let themes = [];
    try {
      const prompt = `Analyze this personal journal entry and return JSON only.
Return: {"score": <float -1 to 1>, "label": <"positive"|"neutral"|"negative">, "moodRead": <short evocative 2-3 word phrase>, "themes": [<up to 3 concise theme strings>]}

Journal entry:
"""
${text}
"""`;
      const result = await LLM.json(prompt, { temperature: 0.4 });
      if (result && typeof result.score === 'number') {
        sentiment = {
          score: Math.max(-1, Math.min(1, result.score)),
          label: result.label || 'neutral',
          moodRead: result.moodRead || '',
        };
        themes = Array.isArray(result.themes) ? result.themes.slice(0, 3) : [];
      } else {
        throw new Error('bad response shape');
      }
    } catch (_err) {
      // Local fallback
      sentiment = localSentiment(text);
      themes = localThemes(text);
    }

    // 3. Store
    Store.journal.add({
      text,
      lang: (I18N && I18N.lang) ? I18N.lang : 'en',
      sentiment,
      linguistics,
      themes,
    });

    // 4. Reset UI
    saveBtn.disabled = false;
    statusEl.textContent = '';
    textarea.value = '';
    wcEl.textContent = '';
    promptsWrap.style.display = 'none';
    promptChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));

    UI.toast(t('app.saved'), 'good');
    UI.haptic('success');

    // Refresh entries list in place
    Anchor.refresh();
  }

  // -------------------------------------------------------------------------
  // Entries section
  // -------------------------------------------------------------------------
  function entriesSection() {
    const entries = Store.journal.all().slice().reverse();
    const section = UI.el('div', { class: 'col gap3' });

    if (!entries.length) {
      section.appendChild(UI.empty(
        UI.frag(`<span style="width:36px;height:36px;color:var(--a1);display:inline-block">${Icons.get('journal')}</span>`),
        t('jour.noEntries'),
        t('jour.writeFirst')
      ));
      return section;
    }

    // Count header
    const count = entries.length;
    const countKey = count === 1 ? 'jour.entries.one' : 'jour.entries.other';
    const countStr = t(countKey, { count }) || t('jour.entries', { count });
    section.appendChild(
      UI.el('div', { class: 'eyebrow', style: { margin: '4px 2px 2px' } }, countStr)
    );

    // Entry rows
    entries.forEach(entry => {
      section.appendChild(entryRow(entry));
    });

    return section;
  }

  // -------------------------------------------------------------------------
  // Single entry row
  // -------------------------------------------------------------------------
  function entryRow(entry) {
    const sentiment = entry.sentiment || {};
    const score = sentiment.score != null ? sentiment.score : null;
    const wc = wordCount(entry.text || '');
    const exc = excerpt(entry.text || '');

    const row = UI.el('div', {
      class: 'glass-card card',
      style: { cursor: 'pointer' },
      onclick: () => { UI.haptic('light'); openEntryDetail(entry); },
    });

    // Top row: date + sentiment chip
    const topRow = UI.el('div', { class: 'row between gap3', style: { marginBottom: '6px' } });
    topRow.appendChild(UI.el('div', { class: 'b small' }, UI.fmt.rel(entry.date)));

    const rightMeta = UI.el('div', { class: 'row gap2', style: { alignItems: 'center' } });
    if (score !== null) {
      const chip = UI.el('span', {
        class: 'chip tiny' + toneClass(score),
        style: { color: toneColor(score), fontSize: '0.72rem', padding: '2px 8px' },
      }, sentiment.label || '');
      rightMeta.appendChild(chip);
    }
    rightMeta.appendChild(UI.el('span', { class: 'tiny soft' }, t('jour.wordCount', { n: wc })));
    topRow.appendChild(rightMeta);
    row.appendChild(topRow);

    // Excerpt
    if (exc) {
      row.appendChild(UI.el('div', { class: 'small soft', style: { lineHeight: '1.55', overflow: 'hidden' } }, exc));
    }

    // Themes chips (up to 3, small)
    const themes = Array.isArray(entry.themes) ? entry.themes : [];
    if (themes.length) {
      const themesRow = UI.el('div', { class: 'row wrap gap2', style: { marginTop: '6px' } });
      themes.slice(0, 3).forEach(th => {
        themesRow.appendChild(UI.el('span', { class: 'chip', style: { fontSize: '0.72rem', padding: '2px 8px' } }, th));
      });
      row.appendChild(themesRow);
    }

    return row;
  }

  // -------------------------------------------------------------------------
  // Register
  // -------------------------------------------------------------------------
  Anchor.register({
    id: 'journal',
    labelKey: 'nav.journal',
    icon: 'journal',
    order: 60,
    tab: false,
    render,
  });
})();
