// ===========================================================================
// mirror.js — The Mirror. Patterns in HOW you write, gently, never clinical.
//
// Analyses linguistic signals across journal entries: word count, absolutist
// language, self-reference density, positivity ratio, and emotional vocabulary
// breadth. Surfaces gentle observations as questions, never diagnoses.
//
// Exports window.Mirror = { analyze } for reuse by other features.
// ===========================================================================
(function () {

  // ---- word lists -----------------------------------------------------------

  const ABSOLUTE_WORDS = new Set([
    'always', 'never', 'everyone', 'everybody', 'nobody', 'no one',
    'nothing', 'everything', 'all', 'none', 'completely', 'totally',
    'absolutely', 'forever', 'impossible', 'certain', 'definitely',
    'every', 'any', 'entire', 'whole',
  ]);

  const POSITIVE_WORDS = new Set([
    'happy', 'happiness', 'joy', 'joyful', 'good', 'great', 'wonderful',
    'amazing', 'love', 'loved', 'loving', 'grateful', 'gratitude',
    'thankful', 'calm', 'peaceful', 'peace', 'content', 'satisfied',
    'hopeful', 'hope', 'excited', 'excite', 'enthusiasm', 'enthusiastic',
    'proud', 'pride', 'confident', 'confidence', 'inspired', 'inspiration',
    'energised', 'energized', 'glad', 'cheerful', 'warm', 'bright',
    'light', 'free', 'relief', 'relieved', 'safe', 'secure', 'strong',
    'empowered', 'okay', 'fine', 'better', 'improved', 'progress',
    'accomplished', 'success', 'successful', 'courage', 'courageous',
    'kind', 'caring', 'compassion', 'compassionate', 'playful', 'fun',
    'enjoying', 'enjoy', 'enjoyable', 'pleasant', 'pleasure', 'delight',
    'delightful', 'appreciate', 'appreciation', 'blessed', 'fortunate',
    'lucky', 'meaningful', 'meaning', 'purpose', 'fulfil', 'fulfilled',
    'fulfilment', 'fulfillment', 'connected', 'belonging', 'supported',
    'nourished', 'restored', 'refreshed', 'rested', 'clear', 'clarity',
    'optimistic', 'positive', 'uplifted', 'motivated', 'flow',
  ]);

  const NEGATIVE_WORDS = new Set([
    'sad', 'sadness', 'unhappy', 'miserable', 'depressed', 'depression',
    'anxious', 'anxiety', 'worried', 'worry', 'fear', 'afraid', 'scared',
    'stress', 'stressed', 'overwhelmed', 'exhausted', 'exhaustion',
    'tired', 'drained', 'empty', 'numb', 'hopeless', 'helpless',
    'worthless', 'useless', 'failure', 'failed', 'wrong', 'bad',
    'terrible', 'awful', 'horrible', 'misery', 'pain', 'painful',
    'hurt', 'broken', 'lost', 'alone', 'lonely', 'isolated', 'trapped',
    'stuck', 'frustrated', 'frustration', 'anger', 'angry', 'rage',
    'furious', 'resentful', 'resentment', 'bitter', 'jealous',
    'jealousy', 'envy', 'guilty', 'guilt', 'ashamed', 'shame',
    'embarrassed', 'embarrassment', 'regret', 'regretful', 'disappointed',
    'disappointment', 'disgusted', 'disgust', 'hate', 'hated',
    'confused', 'confusion', 'uncertain', 'doubt', 'doubtful',
    'insecure', 'insecurity', 'vulnerable', 'weak', 'powerless',
    'rejected', 'rejection', 'abandoned', 'neglected', 'judged',
    'criticized', 'failure', 'defeated', 'hopelessness', 'dread',
    'dreading', 'nervous', 'uneasy', 'troubled', 'burden',
  ]);

  const EMOTION_WORDS = new Set([
    ...Array.from(POSITIVE_WORDS),
    ...Array.from(NEGATIVE_WORDS),
    // additional nuanced feeling words not cleanly pos/neg
    'ambivalent', 'ambiguous', 'conflicted', 'mixed', 'uncertain',
    'nostalgic', 'nostalgia', 'melancholy', 'longing', 'yearning',
    'bittersweet', 'moved', 'touched', 'tender', 'overwhelm',
    'flooded', 'stirred', 'grief', 'grieving', 'mourning', 'loss',
    'heartache', 'ache', 'aching', 'homesick', 'wistful', 'curious',
    'curiosity', 'surprised', 'surprise', 'shock', 'awe', 'wonder',
    'bewildered', 'puzzled', 'irritable', 'irritated', 'impatient',
    'restless', 'agitated', 'tense', 'rigid', 'numb', 'dissociated',
    'detached', 'withdrawn', 'pensive', 'reflective', 'contemplative',
    'introspective', 'sensitive', 'raw', 'fragile', 'delicate',
    'weary', 'depleted', 'burnt', 'burned', 'flat', 'heavy', 'light',
    'buoyant', 'sinking', 'floating', 'grounded', 'unmoored',
    'scattered', 'focused', 'present', 'absent', 'distant', 'close',
    'open', 'closed', 'guarded', 'defensive', 'seen', 'invisible',
    'heard', 'misunderstood', 'cherished', 'valued', 'dismissed',
  ]);

  // ---- core analyzer -------------------------------------------------------

  /**
   * analyze(text) -> { wordCount, absolutes, selfRefs, posWords, negWords,
   *                    emotionWords, ratio }
   *
   * Exported as window.Mirror.analyze for reuse by other features.
   */
  function analyze(text) {
    if (!text || typeof text !== 'string') {
      return { wordCount: 0, absolutes: 0, selfRefs: 0, posWords: 0, negWords: 0, emotionWords: 0, ratio: 0 };
    }

    const raw = text.toLowerCase();
    // split on whitespace/punctuation boundaries
    const tokens = raw.match(/\b[a-z']+\b/g) || [];
    const wordCount = tokens.length || 1; // avoid div/0

    let absolutes = 0;
    let selfRefs = 0;
    let posWords = 0;
    let negWords = 0;
    let emotionWordCount = 0;

    const SELF_TOKENS = new Set(['i', 'me', 'my', 'myself', 'mine']);

    for (const tok of tokens) {
      const base = tok.replace(/'/g, ''); // strip apostrophes for matching
      if (SELF_TOKENS.has(tok)) selfRefs++;
      if (ABSOLUTE_WORDS.has(tok) || ABSOLUTE_WORDS.has(base)) absolutes++;
      if (POSITIVE_WORDS.has(tok) || POSITIVE_WORDS.has(base)) posWords++;
      if (NEGATIVE_WORDS.has(tok) || NEGATIVE_WORDS.has(base)) negWords++;
      if (EMOTION_WORDS.has(tok) || EMOTION_WORDS.has(base)) emotionWordCount++;
    }

    const ratio = (posWords - negWords) / wordCount;

    return { wordCount, absolutes, selfRefs, posWords, negWords, emotionWords: emotionWordCount, ratio };
  }

  // ---- helpers --------------------------------------------------------------

  /** Pull linguistics for an entry, falling back to local analysis. */
  function ling(entry) {
    if (entry.linguistics &&
        typeof entry.linguistics.wordCount === 'number') {
      return entry.linguistics;
    }
    return analyze(entry.text || '');
  }

  /** Return up to N most recent journal entries sorted oldest-first. */
  function recentEntries(n) {
    const all = Store.journal.all().slice(); // defensive copy
    all.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    return n ? all.slice(-n) : all;
  }

  /**
   * Collect unique emotion words across a set of entries.
   * Returns a Set of string tokens.
   */
  function collectEmotionTokens(entries) {
    const found = new Set();
    for (const e of entries) {
      const raw = (e.text || '').toLowerCase();
      const tokens = raw.match(/\b[a-z']+\b/g) || [];
      for (const tok of tokens) {
        if (EMOTION_WORDS.has(tok)) found.add(tok);
      }
    }
    return found;
  }

  // ---- dismissal state (in-memory; deliberately not persisted) --------------
  const _dismissed = new Set(); // keys: "<kind>-<entryId>"

  // ---- segmented view state -------------------------------------------------
  let _currentView = 'trend'; // 'trend' | 'thisEntry'

  // ---- render ---------------------------------------------------------------

  function render(root) {
    // ---- page head ----
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('h1', { class: 'page-title serif' }, t('mir.title')),
      UI.el('div', { class: 'eyebrow mt1' }, t('mir.sub')),
      UI.el('div', { class: 'small soft mt2', style: { lineHeight: '1.5' } }, t('mir.intro')),
    ]));
    renderBody(root);
  }

  // Header-less body — so The Mirror can be embedded as a tab inside Journal.
  function renderBody(root) {
    const entries = recentEntries(0); // all entries

    // ---- empty state ----
    if (Store.journal.count() < 2) {
      root.appendChild(UI.el('div', { style: { marginTop: '32px' } }, [
        UI.empty('🪞', t('mir.needJournal')),
        UI.el('div', { style: { marginTop: '16px', textAlign: 'center' } }, [
          UI.btn(t('nav.journal'), { class: 'btn-primary', onClick: () => Anchor.go('journal') }),
        ]),
      ]));
      appendNonClinical(root);
      return;
    }

    // ---- segmented toggle ----
    const contentWrap = UI.el('div', { class: 'col gap4 stagger', style: { marginTop: '20px' } });

    const seg = UI.segmented(
      [
        { value: 'trend', label: t('mir.trend') },
        { value: 'thisEntry', label: t('mir.thisEntry') },
      ],
      _currentView,
      (val) => {
        _currentView = val;
        Anchor.refresh();
      }
    );
    root.appendChild(UI.el('div', { style: { marginTop: '16px' } }, [seg]));
    root.appendChild(contentWrap);

    if (_currentView === 'trend') {
      renderTrend(contentWrap, entries);
    } else {
      renderThisEntry(contentWrap, entries);
    }

    appendNonClinical(root);
  }

  // ---- TREND view -----------------------------------------------------------

  function renderTrend(container, entries) {
    const window21 = recentEntries(21);

    // Metrics sparklines section
    container.appendChild(metricsSection(window21));

    // Gentle observations
    const obsEl = observationsSection(entries);
    if (obsEl) container.appendChild(obsEl);

    // Emotional vocabulary growth
    container.appendChild(vocabSection(entries));
  }

  // ---- METRICS section -------------------------------------------------------

  function metricsSection(entries) {
    const card = UI.card([
      UI.el('div', { class: 'row between' }, [
        UI.el('div', { class: 'b' }, t('mir.metrics')),
        UI.frag(`<span style="width:18px;color:var(--ink-ghost)">${Icons.get('trend')}</span>`),
      ]),
    ]);

    const metrics = [
      {
        key: 'mWordCount',
        values: entries.map(e => ling(e).wordCount),
        color: 'var(--a1)',
      },
      {
        key: 'mPositivity',
        values: entries.map(e => ling(e).ratio),
        color: 'var(--good)',
      },
      {
        key: 'mAbsolutes',
        values: entries.map(e => ling(e).absolutes),
        color: 'var(--warn)',
      },
      {
        key: 'mSelfFocus',
        // selfRefs per 100 words
        values: entries.map(e => {
          const l = ling(e);
          return l.wordCount > 0 ? (l.selfRefs / l.wordCount) * 100 : 0;
        }),
        color: 'var(--a2)',
      },
      {
        key: 'mEmotionWords',
        values: entries.map(e => ling(e).emotionWords),
        color: 'var(--a3)',
      },
    ];

    for (const m of metrics) {
      const smoothed = Stats.smooth(m.values, 3);
      const row = UI.el('div', { style: { marginTop: '16px' } }, [
        UI.el('div', { class: 'small b', style: { marginBottom: '4px', color: 'var(--ink-2)' } }, t('mir.' + m.key)),
        UI.frag(UI.sparkline(smoothed, { color: m.color, height: 40, width: 260 })),
      ]);
      card.appendChild(row);
    }

    return card;
  }

  // ---- GENTLE OBSERVATIONS --------------------------------------------------

  function observationsSection(entries) {
    if (entries.length < 5) return null;

    const recent5 = entries.slice(-5);
    const prior = entries.slice(-21, -5);
    if (prior.length < 3) return null;

    const avgRecent = (fn) => {
      const vals = recent5.map(fn).filter(v => v != null && !isNaN(v));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    const avgPrior = (fn) => {
      const vals = prior.map(fn).filter(v => v != null && !isNaN(v));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    const recAbsolutes = avgRecent(e => ling(e).absolutes);
    const baseAbsolutes = avgPrior(e => ling(e).absolutes);

    const recSelf = avgRecent(e => { const l = ling(e); return l.wordCount > 0 ? (l.selfRefs / l.wordCount) * 100 : 0; });
    const baseSelf = avgPrior(e => { const l = ling(e); return l.wordCount > 0 ? (l.selfRefs / l.wordCount) * 100 : 0; });

    const recWords = avgRecent(e => ling(e).wordCount);
    const baseWords = avgPrior(e => ling(e).wordCount);

    const recEmotion = avgRecent(e => ling(e).emotionWords);
    const baseEmotion = avgPrior(e => ling(e).emotionWords);

    const obs = [];

    // absoluteHigh: >25% more absolutes than usual
    if (recAbsolutes > baseAbsolutes * 1.25 && recAbsolutes > 1) {
      obs.push({ kind: 'absoluteHigh', key: 'mir.absoluteHigh' });
    }

    // selfHigh: >20% more self-focus
    if (recSelf > baseSelf * 1.20 && recSelf > 2) {
      obs.push({ kind: 'selfHigh', key: 'mir.selfHigh' });
    }

    // shorter: writing shorter than usual by >20%
    if (recWords < baseWords * 0.80 && baseWords > 20) {
      obs.push({ kind: 'shorter', key: 'mir.shorter' });
    }

    // richer: emotion words getting richer by >20%
    if (recEmotion > baseEmotion * 1.20 && recEmotion > 1) {
      obs.push({ kind: 'richer', key: 'mir.richer' });
    }

    // limit to 3
    const visible = obs.filter(o => !_dismissed.has(o.kind)).slice(0, 3);
    if (!visible.length) return null;

    const wrap = UI.el('div', { class: 'col gap3' });

    for (const ob of visible) {
      const cardEl = observationCard(ob);
      wrap.appendChild(cardEl);
    }

    return wrap;
  }

  function observationCard(ob) {
    const card = UI.card([
      UI.el('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, t('mir.observation')),
      UI.el('div', { class: 'b', style: { lineHeight: '1.5' } }, t(ob.key)),
      UI.el('div', { class: 'row gap2', style: { marginTop: '12px' } }, [
        UI.btn(t('mir.confirm'), {
          class: 'btn-ghost btn-sm',
          onClick: () => {
            UI.haptic('light');
            UI.toast(t('mir.confirm'));
            card.style.opacity = '0.4';
            card.style.pointerEvents = 'none';
          },
        }),
        UI.btn(t('mir.dismiss'), {
          class: 'btn-ghost btn-sm',
          onClick: () => {
            UI.haptic('light');
            _dismissed.add(ob.kind);
            card.style.animation = 'fade 0.2s reverse both';
            setTimeout(() => card.remove(), 220);
          },
        }),
      ]),
    ]);
    return card;
  }

  // ---- EMOTIONAL VOCABULARY GROWTH ------------------------------------------

  function vocabSection(entries) {
    // Build cumulative unique emotion word count over time
    const cumulative = [];
    const seen = new Set();

    const sorted = entries.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));

    for (const e of sorted) {
      const tokens = collectEmotionTokens([e]);
      tokens.forEach(tok => seen.add(tok));
      cumulative.push(seen.size);
    }

    // Determine new words from the last 5 entries not seen in the ones before
    const recent5 = sorted.slice(-5);
    const priorSet = collectEmotionTokens(sorted.slice(0, -5));
    const newWords = [];
    for (const e of recent5) {
      const tokens = collectEmotionTokens([e]);
      tokens.forEach(tok => { if (!priorSet.has(tok)) newWords.push(tok); });
    }
    const uniqueNew = [...new Set(newWords)];

    const smoothed = Stats.smooth(cumulative, 3);

    const wrap = UI.card([
      UI.el('div', { class: 'row between' }, [
        UI.el('div', {}, [
          UI.el('div', { class: 'b' }, t('mir.vocabGrowth')),
          UI.el('div', { class: 'small soft mt1' }, t('mir.vocabSub')),
        ]),
        UI.frag(`<span style="width:18px;color:var(--ink-ghost)">${Icons.get('book')}</span>`),
      ]),
      UI.el('div', { style: { marginTop: '12px' } }, [
        UI.frag(UI.sparkline(smoothed, { color: 'var(--a1)', height: 48, width: 260 })),
      ]),
    ]);

    if (uniqueNew.length > 0) {
      const newLabel = UI.el('div', { style: { marginTop: '12px' } }, [
        UI.el('div', { class: 'small b', style: { marginBottom: '6px', color: 'var(--ink-2)' } }, t('mir.newWords')),
        UI.el('div', { class: 'row wrap gap2' }, uniqueNew.slice(0, 12).map(w =>
          UI.el('span', { class: 'chip', style: { fontSize: '0.78rem' } }, w)
        )),
      ]);
      wrap.appendChild(newLabel);
    }

    return wrap;
  }

  // ---- THIS ENTRY view ------------------------------------------------------

  function renderThisEntry(container, entries) {
    const latest = entries[entries.length - 1];
    if (!latest) return;

    const l = ling(latest);

    // Entry excerpt
    const excerpt = (latest.text || '').slice(0, 120).trim();
    const hasMore = (latest.text || '').length > 120;

    container.appendChild(UI.card([
      UI.el('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, UI.fmt.rel(latest.date || Store.today())),
      UI.el('div', { class: 'soft small', style: { lineHeight: '1.6', fontStyle: 'italic' } },
        excerpt + (hasMore ? '…' : '')
      ),
    ]));

    // Metric tiles
    const tiles = UI.el('div', { class: 'tiles', style: { marginTop: '4px' } }, [
      metricTile(String(l.wordCount), t('mir.mWordCount'), 'var(--a1)'),
      metricTile(l.ratio >= 0 ? '+' + l.ratio.toFixed(2) : l.ratio.toFixed(2), t('mir.mPositivity'), l.ratio >= 0 ? 'var(--good)' : 'var(--bad)'),
    ]);
    container.appendChild(tiles);

    const tiles2 = UI.el('div', { class: 'tiles', style: { marginTop: '8px' } }, [
      metricTile(String(l.absolutes), t('mir.mAbsolutes'), 'var(--warn)'),
      metricTile(
        (l.wordCount > 0 ? ((l.selfRefs / l.wordCount) * 100).toFixed(1) : '0') + '%',
        t('mir.mSelfFocus'), 'var(--a2)'
      ),
    ]);
    container.appendChild(tiles2);

    const tiles3 = UI.el('div', { class: 'tiles', style: { marginTop: '8px' } }, [
      metricTile(String(l.emotionWords), t('mir.mEmotionWords'), 'var(--a3)'),
      UI.el('div', { class: 'tile glass-card' }, []), // spacer
    ]);
    container.appendChild(tiles3);

    // Feeling words found in this entry
    const emotionToks = collectEmotionTokens([latest]);
    if (emotionToks.size > 0) {
      container.appendChild(UI.card([
        UI.el('div', { class: 'small b', style: { marginBottom: '8px', color: 'var(--ink-2)' } }, t('mir.mEmotionWords')),
        UI.el('div', { class: 'row wrap gap2' }, [...emotionToks].slice(0, 20).map(w =>
          UI.el('span', { class: 'chip', style: { fontSize: '0.78rem' } }, w)
        )),
      ]));
    }

    // Mini sparklines for context: this entry vs recent trend
    container.appendChild(contextSparkCard(entries, latest, l));
  }

  function metricTile(val, label, color) {
    return UI.el('div', { class: 'tile glass-card' }, [
      UI.el('div', { class: 'tile-lbl' }, label),
      UI.el('div', { class: 'tile-val b', style: { color, fontSize: '1.4rem' } }, val),
    ]);
  }

  function contextSparkCard(entries, latest, latestLing) {
    const window21 = entries.slice(-21);
    const positivityVals = window21.map(e => ling(e).ratio);
    const emotionVals = window21.map(e => ling(e).emotionWords);

    // mark the latest entry position
    const lastIdx = positivityVals.length - 1;

    const smoothedPos = Stats.smooth(positivityVals, 3);
    const smoothedEmo = Stats.smooth(emotionVals, 3);

    return UI.card([
      UI.el('div', { class: 'b', style: { marginBottom: '12px' } }, t('mir.trend')),
      UI.el('div', { class: 'small soft', style: { marginBottom: '4px' } }, t('mir.mPositivity')),
      UI.frag(UI.sparkline(smoothedPos, { color: latestLing.ratio >= 0 ? 'var(--good)' : 'var(--bad)', height: 40, width: 260 })),
      UI.el('div', { class: 'small soft', style: { marginTop: '12px', marginBottom: '4px' } }, t('mir.mEmotionWords')),
      UI.frag(UI.sparkline(smoothedEmo, { color: 'var(--a3)', height: 40, width: 260 })),
    ]);
  }

  // ---- end reassurance -------------------------------------------------------

  function appendNonClinical(root) {
    root.appendChild(UI.el('div', {
      class: 'small soft',
      style: { textAlign: 'center', padding: '24px 16px 8px', lineHeight: '1.5', color: 'var(--ink-ghost)' },
    }, t('mir.nonClinical')));
  }

  // ---- public API -----------------------------------------------------------

  window.Mirror = { analyze, renderBody };

  // ---- register -------------------------------------------------------------

  Anchor.register({
    id: 'mirror',
    labelKey: 'nav.mirror',
    icon: 'mirror',
    order: 50,
    tab: false,
    render,
  });

})();
