// ===========================================================================
// decompression.js — "The Decompression Chamber"
// A guided nightly offload: brain dump → sort → tomorrow list → close the day.
// Registers as tab id:'decompress' via Anchor.register at the bottom.
// ===========================================================================
(function () {

  // ---- helpers --------------------------------------------------------------

  // Infer the most disruptive thought category from history.
  // Heuristic: for each wind-down session, look at the sleep record the
  // *following* date. If that sleep score is below 55 (poor), tally the
  // buckets that had items. The bucket with the most tallies wins.
  function inferMostDisruptive() {
    const sessions = Store.decompress.all();
    if (!sessions.length) return null;

    const tally = { act: 0, release: 0, feel: 0 };
    let counted = 0;

    sessions.forEach(function (s) {
      // find sleep record for the night of the session (same date or next date)
      const nextDate = (function () {
        const d = Store.keyToDate(s.date);
        d.setDate(d.getDate() + 1);
        const m = d.getMonth() + 1;
        const dy = d.getDate();
        return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dy < 10 ? '0' : '') + dy;
      }());
      const sleepRec = Store.sleep.all().find(function (sl) {
        return sl.date === s.date || sl.date === nextDate;
      });
      const score = sleepRec ? sleepRec.score : null;
      if (score !== null && score < 55) {
        const b = s.buckets || {};
        if (b.act && b.act.length) tally.act += b.act.length;
        if (b.release && b.release.length) tally.release += b.release.length;
        if (b.feel && b.feel.length) tally.feel += b.feel.length;
        counted++;
      }
    });

    if (!counted) {
      // Fallback: most common feel/release theme across all sessions
      const allFeel = [];
      sessions.forEach(function (s) {
        const b = s.buckets || {};
        if (b.feel) allFeel.push.apply(allFeel, b.feel);
        if (b.release) allFeel.push.apply(allFeel, b.release);
      });
      return allFeel.length ? 'feel' : null;
    }

    // Return the bucket key with the highest tally
    const keys = ['act', 'release', 'feel'];
    let best = null, bestVal = 0;
    keys.forEach(function (k) {
      if (tally[k] > bestVal) { bestVal = tally[k]; best = k; }
    });
    return best;
  }

  // ---- AI summary helpers ---------------------------------------------------

  // Build a graceful local fallback summary when LLM is unavailable.
  function localFallbackSummary(buckets) {
    const actCount     = (buckets.act     || []).length;
    const releaseCount = (buckets.release || []).length;
    const feelCount    = (buckets.feel    || []).length;
    const total        = actCount + releaseCount + feelCount;

    const parts = [];
    if (total) parts.push('You set down ' + total + ' thing' + (total !== 1 ? 's' : '') + ' tonight.');
    if (actCount)     parts.push(actCount     + ' to carry lightly into tomorrow.');
    if (releaseCount) parts.push(releaseCount + ' set down and released.');
    if (feelCount)    parts.push(feelCount    + ' just felt and acknowledged.');
    const summary = parts.join(' ') || 'You took the time to wind down tonight.';

    return {
      summary:   summary,
      moodRead:  'settling in',
      valence:   0,
      feedback:  t('dec.sleepWell'),
    };
  }

  // Record tonight's inferred mood into Store.moods (dedup by today + note).
  function recordWindDownMood(valence) {
    const today = Store.today();
    const already = Store.moods.all().find(function (m) {
      return m.date === today && m.note === 'wind-down';
    });
    if (already) return;
    const clamped = Math.max(-2, Math.min(2, typeof valence === 'number' && !isNaN(valence) ? valence : 0));
    Store.moods.add({ valence: clamped, energy: 4, arousal: 3, note: 'wind-down', tags: [] });
  }

  // ---- main render ----------------------------------------------------------

  function render(root) {
    // Local flow state — all mutable, re-render reads from here
    const state = {
      screen: 'intro',   // 'intro' | 'step1' | 'step2' | 'step3' | 'finish' | 'history'
      items: [],         // [{ text, bucket: null|'act'|'release'|'feel' }]
      draftText: '',
      sortIndex: 0,      // which item we are currently sorting in step2
      dimming: false,
      dimOverlay: null,
      // AI summary data populated during finishSession
      aiSummary: null,   // { summary, moodRead, valence, feedback } | null
      aiLoading: false,
    };

    function rerender() {
      UI.clear(root);
      root.appendChild(buildView(state, rerender));
    }

    rerender();
  }

  // ---- view dispatcher ------------------------------------------------------

  function buildView(state, rerender) {
    switch (state.screen) {
      case 'intro':   return buildIntro(state, rerender);
      case 'step1':   return buildStep1(state, rerender);
      case 'step2':   return buildStep2(state, rerender);
      case 'step3':   return buildStep3(state, rerender);
      case 'finish':  return buildFinish(state, rerender);
      case 'history': return buildHistory(state, rerender);
      default:        return buildIntro(state, rerender);
    }
  }

  // ---- SCREEN: Intro --------------------------------------------------------

  function buildIntro(state, rerender) {
    const wrap = UI.el('div', { class: 'col gap4' });

    // Page header
    wrap.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('div', { class: 'eyebrow' }, t('dec.subtitle')),
      UI.el('h1', { class: 'page-title serif' }, t('dec.title')),
      UI.el('div', { class: 'small soft mt1' }, t('dec.sub')),
    ]));


    // Intro card
    wrap.appendChild(
      UI.card([
        UI.el('div', { class: 'col gap3' }, [
          UI.frag('<span style="font-size:2.4rem; display:block; text-align:center">🧠</span>'),
          UI.el('div', { class: 'soft', style: { lineHeight: '1.6', textAlign: 'center' } }, t('dec.intro')),
          UI.btn(t('dec.begin'), {
            class: 'btn-primary',
            block: true,
            onClick: function () {
              UI.haptic('light');
              state.screen = 'step1';
              rerender();
            },
          }),
        ]),
      ], { sheen: true })
    );

    // History link
    const history = Store.decompress.all();
    if (history.length) {
      wrap.appendChild(
        UI.el('div', { class: 'col gap2' }, [
          UI.el('div', { class: 'eyebrow', style: { margin: '0 4px 6px' } }, t('dec.historyTitle')),
          UI.btn(t('dec.historyTitle'), {
            class: 'btn-ghost btn-block',
            onClick: function () {
              state.screen = 'history';
              rerender();
            },
          }),
        ])
      );
    }

    return wrap;
  }

  // ---- SCREEN: Step 1 — Brain dump ------------------------------------------

  // Prompt: hand the whole brain dump to the AI, which splits it into the
  // distinct thoughts and sorts each into a bucket (act / release / feel).
  function sortPrompt(raw) {
    return 'Someone is winding down for the night and dumped everything on their mind below. ' +
      'Break it into the distinct thoughts they actually wrote, and sort EACH into exactly one bucket:\n' +
      '- "act": a concrete task, to-do, or worry they could act on tomorrow\n' +
      '- "release": something outside their control that they should set down and let go of\n' +
      '- "feel": an emotion or feeling to simply acknowledge — no fixing needed\n\n' +
      'Their brain dump:\n"""\n' + raw + '\n"""\n\n' +
      'Return JSON ONLY, no prose:\n' +
      '{ "items": [ { "text": "<one short thought, in their own words>", "bucket": "act" } ] }\n' +
      'Rules: keep each text short and faithful to what they wrote; do NOT invent thoughts; split run-on dumps into separate items.';
  }

  // Local, offline split — one thought per line, else per sentence.
  function splitDump(raw) {
    let parts = raw.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length <= 1) parts = raw.split(/(?:[.!?]+|;)\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
    return parts.length ? parts : [raw];
  }

  function buildStep1(state, rerender) {
    const wrap = UI.el('div', { class: 'col gap4' });

    // Step header
    wrap.appendChild(stepHeader(1, t('dec.step1Title'), t('dec.step1Sub'), state, rerender));

    const aiOn = !!(window.LLM && LLM.configured && LLM.configured());

    // One big box — dump it all at once. Extra top padding so the placeholder
    // and the text you type sit lower in the box, not jammed against the top.
    const textarea = UI.el('textarea', {
      class: 'field-input',
      placeholder: t('dec.dumpPlaceholder'),
      rows: 6,
      style: { width: '100%', resize: 'none', fontFamily: 'inherit', fontSize: '1rem',
        lineHeight: '1.6', padding: '18px 16px', minHeight: '164px' },
    });
    textarea.value = state.draftText || '';
    textarea.addEventListener('input', function () { state.draftText = textarea.value; });

    const sortBtn = UI.btn(t('dec.nextSort'), { class: 'btn-primary btn-block' });
    let busy = false;
    sortBtn.onclick = async function () {
      const raw = textarea.value.trim();
      if (!raw || busy) return;
      busy = true;
      UI.haptic('light');
      state.draftText = raw;

      if (aiOn) {
        sortBtn.disabled = true;
        sortBtn.textContent = t('dec.sorting');
        try {
          const data = await LLM.json(sortPrompt(raw), { lang: Store.get('settings.lang'), temperature: 0.2 });
          const valid = { act: 1, release: 1, feel: 1 };
          let items = (data && Array.isArray(data.items) ? data.items : [])
            .map(function (it) {
              return { text: String((it && it.text) || '').trim(), bucket: valid[it && it.bucket] ? it.bucket : 'act' };
            })
            .filter(function (it) { return it.text; });
          if (!items.length) items = splitDump(raw).map(function (tx) { return { text: tx, bucket: null }; });
          state.items = items;
        } catch (e) {
          state.items = splitDump(raw).map(function (tx) { return { text: tx, bucket: null }; });
        }
      } else {
        state.items = splitDump(raw).map(function (tx) { return { text: tx, bucket: null }; });
      }

      state.draftText = '';
      state.sortIndex = 0;
      state.screen = 'step2';
      rerender();
    };

    wrap.appendChild(
      UI.card([
        UI.el('div', { class: 'col gap3' }, [
          UI.el('div', { class: 'field' }, [textarea]),
          aiOn ? UI.el('div', { class: 'tiny muted', style: { textAlign: 'center', lineHeight: '1.45' } }, t('dec.sortHint')) : null,
        ]),
      ])
    );
    wrap.appendChild(sortBtn);

    return wrap;
  }

  // ---- SCREEN: Step 2 — Sort ------------------------------------------------

  function buildStep2(state, rerender) {
    const wrap = UI.el('div', { class: 'col gap4' });

    const unsorted = state.items.filter(function (it) { return !it.bucket; });
    const sorted = state.items.filter(function (it) { return !!it.bucket; });

    // When the AI has already sorted everything, the header reflects that
    // instead of asking the user to tap-sort each one.
    const sub = unsorted.length ? t('dec.step2Sub') : t('dec.step2SubSorted');
    wrap.appendChild(stepHeader(2, t('dec.step2Title'), sub, state, rerender));

    // Unsorted items — show top one for sorting
    if (unsorted.length) {
      const current = unsorted[0];
      const currentGlobal = state.items.indexOf(current);

      wrap.appendChild(
        UI.el('div', { class: 'col gap3' }, [
          // Progress
          UI.el('div', { class: 'small soft', style: { textAlign: 'center' } },
            (sorted.length + 1) + ' / ' + state.items.length
          ),

          // Thought bubble
          UI.el('div', {
            class: 'glass-card card',
            style: {
              textAlign: 'center',
              fontSize: '1.05rem',
              lineHeight: '1.6',
              borderColor: 'rgba(124,156,255,0.3)',
              minHeight: '80px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
          }, [
            UI.el('div', { style: { padding: '4px 8px' } }, current.text),
          ]),

          // Bucket taps
          UI.el('div', { class: 'col gap2' }, [
            bucketBtn('act', t('dec.bucketAct'), t('dec.bucketActSub'), '✅', function () {
              state.items[currentGlobal].bucket = 'act';
              UI.haptic('light');
              rerender();
            }),
            bucketBtn('release', t('dec.bucketRelease'), t('dec.bucketReleaseSub'), '🌬️', function () {
              state.items[currentGlobal].bucket = 'release';
              UI.haptic('light');
              rerender();
            }),
            bucketBtn('feel', t('dec.bucketFeel'), t('dec.bucketFeelSub'), '💙', function () {
              state.items[currentGlobal].bucket = 'feel';
              UI.haptic('light');
              rerender();
            }),
          ]),
        ])
      );
    }

    // Sorted items — grouped by bucket
    if (sorted.length) {
      const groups = [
        { key: 'act',     emoji: '✅', label: t('dec.bucketAct') },
        { key: 'release', emoji: '🌬️', label: t('dec.bucketRelease') },
        { key: 'feel',    emoji: '💙', label: t('dec.bucketFeel') },
      ];

      const hasSortedBucket = function (key) {
        return sorted.filter(function (it) { return it.bucket === key; }).length > 0;
      };

      const groupEls = groups
        .filter(function (g) { return hasSortedBucket(g.key); })
        .map(function (g) {
          const items = sorted.filter(function (it) { return it.bucket === g.key; });
          return UI.el('div', { class: 'col gap2' }, [
            UI.el('div', { class: 'row gap2', style: { alignItems: 'center' } }, [
              UI.frag('<span style="font-size:1rem">' + g.emoji + '</span>'),
              UI.el('div', { class: 'small b soft' }, g.label),
            ]),
            UI.el('div', { class: 'col gap1' },
              items.map(function (it) {
                return UI.el('div', {
                  class: 'glass-card card-tight',
                  style: { padding: '8px 12px', borderRadius: 'var(--r-md)', fontSize: '0.875rem' },
                }, it.text);
              })
            ),
          ]);
        });

      if (groupEls.length) {
        wrap.appendChild(UI.card(
          [UI.el('div', { class: 'col gap4' }, groupEls)],
          { class: 'mt2' }
        ));
      }

      // Acceptance prompts for release / feel buckets
      const releaseItems = sorted.filter(function (it) { return it.bucket === 'release'; });
      const feelItems    = sorted.filter(function (it) { return it.bucket === 'feel'; });

      if (releaseItems.length) {
        wrap.appendChild(acceptanceCard(t('dec.releasePrompt'), '🌬️'));
      }
      if (feelItems.length) {
        wrap.appendChild(acceptanceCard(t('dec.feelPrompt'), '💙'));
      }
    }

    // When all items are sorted, show next button
    if (unsorted.length === 0 && state.items.length > 0) {
      wrap.appendChild(
        UI.btn(t('app.next'), {
          class: 'btn-primary btn-block',
          onClick: function () {
            UI.haptic('light');
            state.screen = 'step3';
            rerender();
          },
        })
      );
    }

    return wrap;
  }

  // ---- SCREEN: Step 3 — Tomorrow --------------------------------------------

  function buildStep3(state, rerender) {
    const wrap = UI.el('div', { class: 'col gap4' });

    wrap.appendChild(stepHeader(3, t('dec.step3Title'), t('dec.step3Sub'), state, rerender));

    const actItems = state.items.filter(function (it) { return it.bucket === 'act'; });

    if (!actItems.length) {
      wrap.appendChild(
        UI.card([
          UI.el('div', { class: 'col center gap3', style: { textAlign: 'center', padding: '16px' } }, [
            UI.frag('<span style="font-size:2rem">✨</span>'),
            UI.el('div', { class: 'soft small' }, t('dec.noLoops')),
          ]),
        ])
      );
    } else {
      wrap.appendChild(
        UI.card([
          UI.el('div', { class: 'col gap3' }, [
            UI.el('div', { class: 'eyebrow' }, t('dec.step3Sub')),
            UI.el('div', { class: 'col gap2' },
              actItems.map(function (it) {
                return UI.el('div', {
                  class: 'row gap3 glass-card card-tight',
                  style: { padding: '10px 14px', borderRadius: 'var(--r-md)', alignItems: 'center' },
                }, [
                  UI.frag('<span style="width:18px;height:18px;display:inline-flex;color:var(--a1);flex-shrink:0">' + Icons.get('check') + '</span>'),
                  UI.el('div', { class: 'small grow', style: { lineHeight: '1.5' } }, it.text),
                ]);
              })
            ),
          ]),
        ])
      );
    }

    wrap.appendChild(
      UI.btn(t('app.finish'), {
        class: 'btn-primary btn-block',
        onClick: function () {
          finishSession(state, rerender);
        },
      })
    );

    return wrap;
  }

  // ---- SCREEN: Finish / dim --------------------------------------------------

  function buildFinish(state, rerender) {
    const wrap = UI.el('div', { class: 'col gap4' });

    // Closing card
    wrap.appendChild(
      UI.card([
        UI.el('div', { class: 'col gap3', style: { textAlign: 'center', padding: '8px 0' } }, [
          UI.frag('<span style="font-size:2.6rem; display:block">🌑</span>'),
          UI.el('div', { class: 'b big' }, t('dec.finishTitle')),
          UI.el('div', { class: 'soft small mt1', style: { lineHeight: '1.6' } }, t('dec.finishSub')),
          UI.el('div', { class: 'soft small mt2' }, t('dec.goodnight', { name: Store.profile.name() })),
        ]),
      ], { sheen: true })
    );

    // AI Summary card — loading state, result, or fallback
    if (state.aiLoading) {
      wrap.appendChild(
        UI.card([
          UI.el('div', { class: 'col center gap3', style: { padding: '20px 0', textAlign: 'center' } }, [
            UI.thinking(),
            UI.el('div', { class: 'small soft' }, t('dec.summarizing')),
          ]),
        ])
      );
    } else if (state.aiSummary) {
      wrap.appendChild(buildSummaryCard(state.aiSummary, state));
    }

    // Done / Goodnight button — now this is where the screen dims down and
    // drifts into goodnight, AFTER the summary above has been read.
    wrap.appendChild(
      UI.btn(t('dec.driftGoodnight'), {
        class: 'btn-ghost btn-block',
        icon: 'moon',
        onClick: function () {
          UI.haptic('success');
          dimAndGoodnight();
        },
      })
    );

    return wrap;
  }

  // ---- AI Summary card -------------------------------------------------------

  function buildSummaryCard(summary, state) {
    const buckets = state._savedBuckets || { act: [], release: [], feel: [] };

    // Stream the summary in the first time it arrives (like the chat); on any
    // later rerender of this screen show it instantly so it doesn't re-animate.
    const summaryTextEl = UI.el('div', { class: 'soft small', style: { lineHeight: '1.65' } });
    if (state.aiJustArrived) { state.aiJustArrived = false; UI.reveal(summaryTextEl, summary.summary); }
    else summaryTextEl.textContent = summary.summary;
    const children = [
      // Title + summary text
      UI.el('div', { class: 'eyebrow mb1' }, t('dec.summaryTitle')),
      summaryTextEl,
    ];

    // Mood read phrase
    if (summary.moodRead) {
      children.push(
        UI.el('div', {
          class: 'row gap2 mt3',
          style: { alignItems: 'center' },
        }, [
          UI.frag('<span style="font-size:1.1rem">🌙</span>'),
          UI.el('div', { class: 'col gap1' }, [
            UI.el('div', { class: 'tiny soft' }, t('dec.moodRead')),
            UI.el('div', { class: 'small b' }, summary.moodRead),
          ]),
        ])
      );
    }

    // Grouped lists (to carry / to release / to feel)
    const actItems     = buckets.act     || [];
    const releaseItems = buckets.release || [];
    const feelItems    = buckets.feel    || [];

    function miniGroup(labelKey, emoji, items) {
      if (!items.length) return null;
      return UI.el('div', { class: 'col gap1' }, [
        UI.el('div', { class: 'row gap2', style: { alignItems: 'center', marginBottom: '4px' } }, [
          UI.frag('<span style="font-size:0.95rem">' + emoji + '</span>'),
          UI.el('div', { class: 'tiny soft b' }, t(labelKey)),
        ]),
        UI.el('div', { class: 'col gap1' },
          items.map(function (text) {
            return UI.el('div', {
              class: 'glass-card card-tight',
              style: { padding: '6px 10px', borderRadius: 'var(--r-md)', fontSize: '0.8rem', opacity: '0.85' },
            }, text);
          })
        ),
      ]);
    }

    const hasGroups = actItems.length || releaseItems.length || feelItems.length;
    if (hasGroups) {
      const groupSection = UI.el('div', { class: 'col gap3 mt3' }, [
        miniGroup('dec.toCarry',   '✅', actItems),
        miniGroup('dec.toRelease', '🌬️', releaseItems),
        miniGroup('dec.toFeel',    '💙', feelItems),
      ].filter(Boolean));
      children.push(groupSection);
    }

    // Feedback line
    if (summary.feedback) {
      children.push(
        UI.el('div', {
          class: 'small mt3',
          style: {
            lineHeight: '1.6',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: '12px',
            fontStyle: 'italic',
            opacity: '0.8',
          },
        }, [
          UI.el('div', { class: 'tiny soft', style: { fontStyle: 'normal', marginBottom: '4px' } }, t('dec.feedback')),
          summary.feedback,
        ])
      );
    }

    // UI.card ignores opts.style, so apply the tint directly to the returned node.
    const summaryCard = UI.card(children, { class: 'mt1' });
    summaryCard.style.borderColor = 'rgba(124,156,255,0.3)';
    summaryCard.style.background = 'rgba(124,156,255,0.06)';
    return summaryCard;
  }

  // ---- SCREEN: History -------------------------------------------------------

  function buildHistory(state, rerender) {
    const wrap = UI.el('div', { class: 'col gap4' });

    wrap.appendChild(
      UI.el('div', { class: 'page-head' }, [
        UI.el('button', {
          class: 'btn btn-ghost btn-sm',
          style: { marginBottom: '8px', alignSelf: 'flex-start' },
          onclick: function () { state.screen = 'intro'; rerender(); },
        }, [
          UI.frag('<span style="width:16px;height:16px;display:inline-flex">' + Icons.get('arrow') + '</span>'),
          ' ' + t('app.back'),
        ]),
        UI.el('h2', { class: 'page-title serif' }, t('dec.historyTitle')),
      ])
    );

    const sessions = Store.decompress.all().slice().reverse();

    if (!sessions.length) {
      wrap.appendChild(
        UI.empty('🌙', t('dec.noLoops'), null)
      );
      return wrap;
    }

    // Most disruptive insight
    const disruptive = inferMostDisruptive();
    if (disruptive) {
      const catLabel = disruptive === 'act'
        ? t('dec.bucketAct')
        : disruptive === 'release'
          ? t('dec.bucketRelease')
          : t('dec.bucketFeel');

      wrap.appendChild(
        UI.el('div', {
          class: 'glass-card card',
          style: { borderColor: 'rgba(255,180,100,0.35)', background: 'rgba(255,180,100,0.07)' },
        }, [
          UI.el('div', { class: 'row gap2', style: { alignItems: 'flex-start' } }, [
            UI.frag('<span style="width:18px;height:18px;display:inline-flex;color:var(--warn);flex-shrink:0;margin-top:2px">' + Icons.get('spark') + '</span>'),
            UI.el('div', { class: 'small', style: { lineHeight: '1.5' } },
              t('dec.mostDisruptive', { cat: catLabel })
            ),
          ]),
        ])
      );
    }

    // Session list
    sessions.forEach(function (s) {
      const b = s.buckets || {};
      const actCount     = (b.act     || []).length;
      const releaseCount = (b.release || []).length;
      const feelCount    = (b.feel    || []).length;
      const total        = (s.dump || []).length || (actCount + releaseCount + feelCount);

      const card = UI.el('div', {
        class: 'glass-card card',
        style: { cursor: 'pointer' },
        onclick: function () { showDetail(s); },
      }, [
        UI.el('div', { class: 'row between gap3' }, [
          UI.el('div', { class: 'col gap1' }, [
            UI.el('div', { class: 'b small' }, UI.fmt.rel(s.date)),
            UI.el('div', { class: 'tiny soft' }, UI.fmt.date(s.date)),
          ]),
          UI.el('div', { class: 'row gap3' }, [
            bucketCountChip('✅', actCount),
            bucketCountChip('🌬️', releaseCount),
            bucketCountChip('💙', feelCount),
          ]),
        ]),
        total > 0
          ? UI.el('div', { class: 'tiny soft mt1' },
              total + ' ' + t('dec.step1Sub').split(' ')[0].toLowerCase()
            )
          : null,
      ]);

      wrap.appendChild(card);
    });

    return wrap;
  }

  // ---- finish session logic --------------------------------------------------

  function finishSession(state, rerender) {
    // Save to store
    const buckets = {
      act:     state.items.filter(function (it) { return it.bucket === 'act'; }).map(function (it) { return it.text; }),
      release: state.items.filter(function (it) { return it.bucket === 'release'; }).map(function (it) { return it.text; }),
      feel:    state.items.filter(function (it) { return it.bucket === 'feel'; }).map(function (it) { return it.text; }),
    };
    const dump = state.items.map(function (it) { return it.text; });

    Store.decompress.add({
      dump: dump,
      buckets: buckets,
      completedAt: Date.now(),
    });

    // Stash buckets so the finish screen can display grouped lists
    state._savedBuckets = buckets;

    // Haptic: session saved
    UI.haptic('success');

    // Go straight to the finish/summary screen so the person FIRST sees what
    // they set down tonight. The "dimming your light" transition now happens
    // afterward — only once they choose to drift into goodnight (see
    // dimAndGoodnight, wired to the Done button).
    state.screen = 'finish';
    state.aiLoading = true;
    state.aiSummary = null;
    rerender();

    // Kick off the AI summary asynchronously
    generateAiSummary(dump, buckets, state, rerender);
  }

  // ---- dim the screen, then drift into Goodnight ----------------------------
  // Called from the finish screen AFTER the summary has been shown.
  function dimAndGoodnight() {
    const overlay = UI.el('div', { style: {
      position: 'fixed', inset: '0', background: '#000', opacity: '0',
      zIndex: '9000', pointerEvents: 'none', transition: 'opacity 3s ease',
    } });
    const dimLabel = UI.el('div', { style: {
      position: 'fixed', inset: '0', zIndex: '9001', display: 'flex',
      alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)',
      fontSize: '1rem', letterSpacing: '0.05em', opacity: '0',
      transition: 'opacity 1.5s ease 0.5s', pointerEvents: 'none',
    } }, t('dec.dimLight'));
    document.body.appendChild(overlay);
    document.body.appendChild(dimLabel);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.style.opacity = '0.92';
        dimLabel.style.opacity = '1';
      });
    });

    // after the dim completes, enter Goodnight, then lift the dim to reveal it
    setTimeout(function () {
      if (dimLabel.parentNode) dimLabel.parentNode.removeChild(dimLabel);
      if (window.Night && typeof Night.start === 'function') Night.start();
      else if (window.Anchor) Anchor.go('home');
      overlay.style.transition = 'opacity 1s ease';
      overlay.style.opacity = '0';
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 1000);
    }, 3200);
  }

  // ---- AI summary generation ------------------------------------------------

  function generateAiSummary(dump, buckets, state, rerender) {
    if (!LLM || !LLM.configured || !LLM.configured()) {
      state.aiLoading = false;
      state.aiSummary = localFallbackSummary(buckets);
      recordWindDownMood(state.aiSummary.valence);
      rerender();
      return;
    }

    const actList     = (buckets.act     || []).map(function (t) { return '- ' + t; }).join('\n');
    const releaseList = (buckets.release || []).map(function (t) { return '- ' + t; }).join('\n');
    const feelList    = (buckets.feel    || []).map(function (t) { return '- ' + t; }).join('\n');

    const prompt = [
      'The user just completed their nightly wind-down. Here is what they off-loaded:',
      '',
      'Brain-dump (' + dump.length + ' thoughts total):',
      dump.map(function (d) { return '- ' + d; }).join('\n'),
      '',
      'Sorted into buckets:',
      actList     ? 'ACT ON TOMORROW:\n' + actList     : 'ACT ON TOMORROW: (none)',
      releaseList ? 'RELEASE / OUT OF CONTROL:\n' + releaseList : 'RELEASE: (none)',
      feelList    ? 'JUST A FEELING:\n' + feelList    : 'JUST A FEELING: (none)',
      '',
      'Please respond ONLY with valid JSON (no markdown, no extra text) in this exact shape:',
      '{',
      '  "summary": "<2-3 warm, non-clinical sentences reflecting what they set down tonight>",',
      '  "moodRead": "<one short phrase: where they seem to be landing emotionally tonight>",',
      '  "valence": <a number from -2 to 2 estimating their emotional valence right now>,',
      '  "feedback": "<one gentle, encouraging sentence to carry into sleep>"',
      '}',
    ].join('\n');

    LLM.json(prompt, { lang: Store.get('settings.lang') })
      .then(function (result) {
        state.aiLoading = false;
        state.aiSummary = {
          summary:  (typeof result.summary  === 'string' && result.summary)  ? result.summary  : localFallbackSummary(buckets).summary,
          moodRead: (typeof result.moodRead === 'string' && result.moodRead) ? result.moodRead : 'settling in',
          valence:  (typeof result.valence  === 'number')                    ? result.valence  : 0,
          feedback: (typeof result.feedback === 'string' && result.feedback) ? result.feedback : t('dec.sleepWell'),
        };
        state.aiJustArrived = true;   // reveal the summary once, gently, on arrival
        recordWindDownMood(state.aiSummary.valence);
        rerender();
      })
      .catch(function () {
        // Graceful local fallback on any error (offline, key issues, etc.)
        state.aiLoading = false;
        state.aiSummary = localFallbackSummary(buckets);
        recordWindDownMood(state.aiSummary.valence);
        rerender();
      });
  }

  // ---- detail sheet for a history session ------------------------------------

  function showDetail(session) {
    const b = session.buckets || {};
    const rows = [];

    function addBucketRows(key, emoji, label) {
      const items = b[key] || [];
      if (!items.length) return;
      rows.push(UI.el('div', { class: 'row gap2 mt3', style: { alignItems: 'center' } }, [
        UI.frag('<span>' + emoji + '</span>'),
        UI.el('div', { class: 'small b' }, label),
      ]));
      items.forEach(function (text) {
        rows.push(UI.el('div', {
          class: 'glass-card card-tight',
          style: { padding: '8px 12px', borderRadius: 'var(--r-md)', fontSize: '0.875rem', marginTop: '4px' },
        }, text));
      });
    }

    addBucketRows('act',     '✅', t('dec.bucketAct'));
    addBucketRows('release', '🌬️', t('dec.bucketRelease'));
    addBucketRows('feel',    '💙', t('dec.bucketFeel'));

    if (!rows.length) {
      rows.push(UI.el('div', { class: 'soft small', style: { padding: '16px 0', textAlign: 'center' } }, t('dec.noLoops')));
    }

    const body = UI.el('div', { class: 'col gap1' }, [
      UI.el('div', { class: 'tiny soft', style: { marginBottom: '4px' } }, UI.fmt.date(session.date, { weekday: 'long', month: 'long', day: 'numeric' })),
    ].concat(rows));

    UI.sheet({ title: t('dec.subtitle'), body: body });
  }

  // ---- small shared building blocks -----------------------------------------

  function stepHeader(num, title, sub, state, rerender) {
    return UI.el('div', { class: 'col gap2' }, [
      UI.el('div', { class: 'row between', style: { alignItems: 'center' } }, [
        UI.el('button', {
          class: 'btn btn-ghost btn-sm',
          onclick: function () {
            UI.haptic('light');
            if (num === 1) { state.screen = 'intro'; }
            else if (num === 2) { state.screen = 'step1'; }
            else if (num === 3) { state.screen = 'step2'; }
            rerender();
          },
        }, [
          UI.frag('<span style="width:15px;height:15px;display:inline-flex">' + Icons.get('arrow') + '</span>'),
        ]),
        UI.el('div', { class: 'eyebrow' }, t('dec.subtitle') + ' · ' + num + '/3'),
        UI.el('div', { style: { width: '32px' } }),
      ]),
      UI.el('h2', { class: 'page-title serif' }, title),
      UI.el('div', { class: 'small soft' }, sub),
    ]);
  }

  function bucketBtn(key, label, sub, emoji, onClick) {
    return UI.el('button', {
      class: 'glass-card card-tight row gap3',
      style: {
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        padding: '12px 16px',
        borderRadius: 'var(--r-md)',
        border: 'none',
        alignItems: 'center',
        background: 'none',
      },
      onclick: onClick,
    }, [
      UI.frag('<span style="font-size:1.4rem;flex-shrink:0">' + emoji + '</span>'),
      UI.el('div', { class: 'col gap1 grow' }, [
        UI.el('div', { class: 'b small' }, label),
        UI.el('div', { class: 'tiny soft' }, sub),
      ]),
      UI.frag('<span style="width:16px;height:16px;display:inline-flex;color:var(--ink-ghost);flex-shrink:0">' + Icons.get('chevron') + '</span>'),
    ]);
  }

  function acceptanceCard(prompt, emoji) {
    return UI.el('div', {
      class: 'glass-card card',
      style: {
        borderColor: 'rgba(124,156,255,0.25)',
        background: 'rgba(124,156,255,0.06)',
      },
    }, [
      UI.el('div', { class: 'row gap3', style: { alignItems: 'flex-start' } }, [
        UI.frag('<span style="font-size:1.2rem;flex-shrink:0;margin-top:2px">' + emoji + '</span>'),
        UI.el('div', { class: 'small soft', style: { lineHeight: '1.6' } }, prompt),
      ]),
    ]);
  }

  function bucketCountChip(emoji, count) {
    return UI.el('div', {
      class: 'row gap1',
      style: { alignItems: 'center', opacity: count ? '1' : '0.25' },
    }, [
      UI.frag('<span style="font-size:0.85rem">' + emoji + '</span>'),
      UI.el('span', { class: 'tiny b' }, String(count)),
    ]);
  }

  // ---- register -------------------------------------------------------------

  Anchor.register({
    id: 'decompress',
    labelKey: 'nav.decompress',
    icon: 'decompress',
    order: 40,
    // Not a bottom-dock tab anymore (the center FAB took that slot). Reached
    // from the dashboard wind-down card + the You hub; gets a Back button.
    tab: false,
    render: render,
  });

}());
