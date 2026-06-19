// ===========================================================================
// valuesCompass.js — Values Compass. Live truer, not just feel better.
//
// Sections:
//   1. Page head + intro
//   2. My Values — list, add, edit, remove
//   3. Today's Compass Check — lived/crowded chips per value, optional note, save
//   4. Alignment over time — bars, honored most, sacrificed most, drift
//   5. Compass Check decision helper — LLM.ask with values context
//   6. Low-mood nudge (dayMood valence < -0.4)
//   7. Per-value streak (N consecutive days lived)
// ===========================================================================
(function () {

  // ---- helpers --------------------------------------------------------------

  function today() { return Store.today(); }

  // Returns all valuesChecks sorted oldest first (checks array is append-only).
  function allChecks() { return Store.valuesChecks.all().slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); }

  // True if a check for today already exists.
  function todayCheck() { return Store.valuesChecks.all().find(c => c.date === today()) || null; }

  // Compute streak for a single value id: how many consecutive days ending today
  // (or the most recent check day) was it lived?
  function valueStreak(valueId) {
    const checks = allChecks();
    if (!checks.length) return 0;
    // Walk backwards from the most recent check day
    let streak = 0;
    for (let i = checks.length - 1; i >= 0; i--) {
      const c = checks[i];
      if (c.lived && c.lived.includes(valueId)) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  // How many of the last 7 days this value was lived (progress toward its target).
  function weeklyLived(valueId) {
    let n = 0;
    allChecks().forEach(c => {
      if (Store.diffDays(today(), c.date) < 7 && c.lived && c.lived.includes(valueId)) n++;
    });
    return n;
  }
  function valueTarget(v) { return (v && v.target) || 4; }

  // Compute alignment stats per value over all check history.
  // Returns { id, name, livedDays, crowdedDays, totalDays, livedPct, crowdedPct }
  function alignmentStats() {
    const checks = allChecks();
    const vals = Store.values.all();
    const total = checks.length;
    return vals.map(v => {
      const livedDays = checks.filter(c => c.lived && c.lived.includes(v.id)).length;
      const crowdedDays = checks.filter(c => c.crowded && c.crowded.includes(v.id)).length;
      return {
        id: v.id,
        name: v.name,
        why: v.why || '',
        livedDays,
        crowdedDays,
        totalDays: total,
        livedPct: total ? Math.round((livedDays / total) * 100) : 0,
        crowdedPct: total ? Math.round((crowdedDays / total) * 100) : 0,
      };
    });
  }

  // ---- 1. Page head ---------------------------------------------------------

  function renderHead(root) {
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('div', { class: 'eyebrow' }, t('nav.values')),
      UI.el('h1', { class: 'page-title serif' }, t('val.title')),
      UI.el('div', { class: 'small soft mt1' }, t('val.sub')),
    ]));
    root.appendChild(UI.card([
      UI.el('div', { class: 'small', style: { lineHeight: '1.6' } }, t('val.intro')),
    ], { class: 'soft-card' }));
  }

  // ---- 2. My Values ---------------------------------------------------------

  function renderMyValues(root) {
    const section = UI.el('div', { class: 'col gap3' });
    root.appendChild(section);
    rebuildMyValues(section);
  }

  function rebuildMyValues(section) {
    UI.clear(section);
    const vals = Store.values.all();

    const hdr = UI.el('div', { class: 'row between gap3', style: { alignItems: 'center' } }, [
      UI.el('div', {}, [
        UI.el('div', { class: 'section-label b' }, t('val.myValues')),
        vals.length ? UI.el('div', { class: 'tiny soft mt1' }, t('val.targetsSub')) : null,
      ]),
      vals.length
        ? UI.btn(t('val.editValues'), { class: 'btn-ghost btn-sm', icon: 'spark', onClick: () => openEditSheet(section) })
        : null,
    ]);
    section.appendChild(hdr);

    if (!vals.length) {
      section.appendChild(UI.empty('🧭', null, t('val.noChecks')));
    } else {
      // uniform 2-column grid — every value box is exactly the same size
      const grid = UI.el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s3)' } });
      vals.forEach(v => grid.appendChild(valueBox(v, section)));
      section.appendChild(grid);
    }

    // Add value input
    section.appendChild(addValueRow(section));
  }

  // A fixed-size value "box": name, a ring of weekly progress toward its target,
  // and an on-track / keep-going status. Tap to edit (rename, why, target).
  function valueBox(v, section) {
    const target = valueTarget(v);
    const lived = weeklyLived(v.id);
    const onTrack = lived >= target;
    const streak = valueStreak(v.id);
    const ring = UI.frag(UI.ring(lived, target, {
      size: 62, stroke: 7, text: lived + '/' + target,
      color: onTrack ? ['var(--a3)', 'var(--a1)'] : ['var(--a1)', 'var(--a2)'],
    }));
    return UI.el('button', { class: 'glass-card val-box', onclick: () => openEditSheet(section) }, [
      UI.el('div', { class: 'val-box-name b' }, v.name),
      ring,
      UI.el('div', { class: 'tiny', style: { color: onTrack ? 'var(--good)' : 'var(--ink-faint)', fontWeight: '600' } },
        onTrack ? '✓ ' + t('val.onTrack') : t('val.weekGoal', { n: target })),
      streak >= 2 ? UI.el('div', { class: 'tiny', style: { color: 'var(--a1)' } }, (streak >= 7 ? '🏅 ' : '🔥 ') + streak) : null,
    ]);
  }

  function addValueRow(section) {
    const input = UI.el('input', {
      type: 'text',
      class: 'field-input',
      placeholder: t('val.addValue'),
      style: { width: '100%' },
    });
    const addBtn = UI.btn(t('app.add'), {
      class: 'btn-primary btn-sm',
      onClick: () => {
        const name = input.value.trim();
        if (!name) return;
        Store.values.add(name, '');
        UI.haptic('light');
        UI.toast(t('app.saved'), 'good');
        input.value = '';
        rebuildMyValues(section);
      },
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') addBtn.click(); });
    return UI.el('div', { class: 'row gap2 mt2' }, [input, addBtn]);
  }

  // Edit sheet — full list with rename, why, remove
  function openEditSheet(section) {
    const vals = Store.values.all().slice(); // shallow copy for editing
    const rows = UI.el('div', { class: 'col gap3' });

    function buildRows() {
      UI.clear(rows);
      Store.values.all().forEach(v => {
        const nameInput = UI.el('input', {
          type: 'text',
          class: 'field-input',
          value: v.name,
          placeholder: t('val.addValue'),
        });
        const whyInput = UI.el('textarea', {
          class: 'field-input',
          placeholder: t('val.valueWhyPlaceholder'),
          rows: 2,
          style: { resize: 'vertical', fontSize: '0.85rem' },
        });
        whyInput.value = v.why || '';

        const removeBtn = UI.el('button', {
          class: 'btn btn-ghost btn-sm',
          style: { color: 'var(--bad)', flexShrink: 0 },
          onclick: async () => {
            const ok = await UI.confirm(t('app.confirmDelete'), { danger: true, confirmLabel: t('app.delete') });
            if (!ok) return;
            Store.values.remove(v.id);
            UI.haptic('medium');
            buildRows();
            rebuildMyValues(section);
          },
        }, [UI.frag(`<span style="width:18px;height:18px;display:inline-flex">${Icons.get('trash')}</span>`)]);

        // Inline save on blur
        function saveField() {
          const newName = nameInput.value.trim();
          if (!newName) return;
          Store.values.update(v.id, { name: newName, why: whyInput.value.trim() });
        }
        nameInput.addEventListener('blur', saveField);
        whyInput.addEventListener('blur', saveField);

        // weekly target — how many days a week the user wants to live this value
        const targetSeg = UI.segmented(
          [2, 3, 4, 5, 7].map(n => ({ value: String(n), label: String(n) })),
          String(valueTarget(v)),
          (val) => { Store.values.update(v.id, { target: +val }); UI.haptic('light'); }
        );

        rows.appendChild(UI.el('div', { class: 'glass-card card col gap2' }, [
          UI.el('div', { class: 'row gap2', style: { alignItems: 'center' } }, [
            nameInput,
            removeBtn,
          ]),
          whyInput,
          UI.el('div', { class: 'row between gap2', style: { alignItems: 'center', marginTop: '2px' } }, [
            UI.el('div', { class: 'tiny soft' }, t('val.targetLabel')),
            targetSeg,
          ]),
        ]));
      });
    }

    buildRows();

    const s = UI.sheet({
      title: t('val.editValues'),
      body: UI.el('div', { class: 'col gap3', style: { padding: '0 0 40px' } }, [
        rows,
      ]),
      onClose: () => rebuildMyValues(section),
    });
    return s;
  }

  // ---- 3. Today's Compass Check ---------------------------------------------

  function renderCompassCheck(root) {
    const vals = Store.values.all();
    const section = UI.el('div', { class: 'col gap3' });
    root.appendChild(section);

    if (!vals.length) return; // nothing to check without values

    const existing = todayCheck();
    const livedSet = new Set(existing ? existing.lived : []);
    const crowdedSet = new Set(existing ? existing.crowded : []);
    let noteVal = existing ? (existing.note || '') : '';

    section.appendChild(UI.el('div', { class: 'row between gap3', style: { alignItems: 'center' } }, [
      UI.el('div', {}, [
        UI.el('div', { class: 'section-label b' }, t('val.checkTitle')),
        UI.el('div', { class: 'tiny soft mt1' }, t('val.checkSub')),
      ]),
    ]));

    const valueRows = UI.el('div', { class: 'col gap2' });
    section.appendChild(valueRows);

    vals.forEach(v => {
      const livedBtn = UI.el('button', {
        class: 'chip' + (livedSet.has(v.id) ? ' active' : ''),
        onclick: () => {
          UI.haptic('light');
          if (livedSet.has(v.id)) {
            livedSet.delete(v.id);
            livedBtn.classList.remove('active');
          } else {
            livedSet.add(v.id);
            livedBtn.classList.add('active');
            // mutually exclusive: can't be both lived and crowded
            if (crowdedSet.has(v.id)) {
              crowdedSet.delete(v.id);
              crowdedBtn.classList.remove('active');
            }
          }
        },
      }, t('val.livedOut'));

      const crowdedBtn = UI.el('button', {
        class: 'chip' + (crowdedSet.has(v.id) ? ' active' : ''),
        style: { '--chip-color': 'var(--warn)' },
        onclick: () => {
          UI.haptic('light');
          if (crowdedSet.has(v.id)) {
            crowdedSet.delete(v.id);
            crowdedBtn.classList.remove('active');
          } else {
            crowdedSet.add(v.id);
            crowdedBtn.classList.add('active');
            if (livedSet.has(v.id)) {
              livedSet.delete(v.id);
              livedBtn.classList.remove('active');
            }
          }
        },
      }, t('val.crowdedOut'));

      valueRows.appendChild(UI.el('div', { class: 'glass-card card col gap2' }, [
        UI.el('div', { class: 'b small' }, v.name),
        UI.el('div', { class: 'row wrap gap2' }, [livedBtn, crowdedBtn]),
      ]));
    });

    const noteInput = UI.el('textarea', {
      class: 'field-input',
      placeholder: t('val.whyCrowded'),
      rows: 2,
      style: { resize: 'vertical', width: '100%' },
    });
    noteInput.value = noteVal;
    noteInput.addEventListener('input', () => { noteVal = noteInput.value; });
    section.appendChild(UI.el('div', { class: 'col gap1 mt2' }, [noteInput]));

    const saveBtn = UI.btn(t('val.saveCheck'), {
      class: 'btn-primary btn-block mt3',
      icon: 'check',
      onClick: () => {
        const rec = {
          date: today(),
          lived: Array.from(livedSet),
          crowded: Array.from(crowdedSet),
          note: noteInput.value.trim(),
        };
        const ex = todayCheck();
        if (ex) {
          Store.valuesChecks.update(ex.id, rec);
        } else {
          Store.valuesChecks.add(rec);
        }
        UI.haptic('success');
        UI.toast(t('app.saved'), 'good');
      },
    });
    section.appendChild(saveBtn);
  }

  // ---- 4. Alignment over time -----------------------------------------------

  function renderAlignment(root) {
    const checks = allChecks();
    const section = UI.el('div', { class: 'col gap3' });
    root.appendChild(section);

    section.appendChild(UI.el('div', { class: 'section-label b' }, t('val.alignment')));

    if (!checks.length) {
      section.appendChild(UI.el('div', { class: 'small soft' }, t('val.noChecks')));
      return;
    }

    const stats = alignmentStats();
    if (!stats.length) {
      section.appendChild(UI.el('div', { class: 'small soft' }, t('val.noChecks')));
      return;
    }

    // Bar chart for each value
    const barList = UI.el('div', { class: 'col gap3' });
    stats.forEach(s => {
      const livedBar = UI.el('div', {
        class: 'confbar',
        style: { background: 'rgba(var(--a1-rgb,100,180,255),0.15)', borderRadius: '6px', overflow: 'hidden', height: '8px' },
      }, [
        UI.el('i', {
          style: {
            display: 'block',
            height: '100%',
            width: s.livedPct + '%',
            background: 'var(--a1)',
            borderRadius: '6px',
            transition: 'width 0.4s ease',
          },
        }),
      ]);
      const crowdedBar = UI.el('div', {
        class: 'confbar',
        style: { background: 'rgba(255,200,100,0.12)', borderRadius: '6px', overflow: 'hidden', height: '8px' },
      }, [
        UI.el('i', {
          style: {
            display: 'block',
            height: '100%',
            width: s.crowdedPct + '%',
            background: 'var(--warn)',
            borderRadius: '6px',
            transition: 'width 0.4s ease',
          },
        }),
      ]);

      barList.appendChild(UI.el('div', { class: 'glass-card card col gap2' }, [
        UI.el('div', { class: 'row between' }, [
          UI.el('div', { class: 'b small' }, s.name),
          UI.el('div', { class: 'tiny soft' }, s.livedPct + '% ' + t('val.livedOut').toLowerCase()),
        ]),
        livedBar,
        UI.el('div', { class: 'row between mt1' }, [
          UI.el('div', { class: 'tiny soft' }, t('val.crowdedOut').toLowerCase()),
          UI.el('div', { class: 'tiny soft' }, s.crowdedPct + '%'),
        ]),
        crowdedBar,
        UI.el('div', { class: 'tiny soft mt1' }, s.totalDays + ' ' + t('app.days')),
      ]));
    });
    section.appendChild(barList);

    // Honored most / sacrificed most summary
    if (stats.length >= 2) {
      const honored = stats.slice().sort((a, b) => b.livedPct - a.livedPct)[0];
      const sacrificed = stats.slice().sort((a, b) => b.crowdedPct - a.crowdedPct)[0];

      section.appendChild(UI.el('div', { class: 'col gap2 mt2' }, [
        UI.el('div', { class: 'glass-card card row gap3', style: { alignItems: 'center' } }, [
          UI.frag(`<span style="font-size:1.4rem">✦</span>`),
          UI.el('div', {}, [
            UI.el('div', { class: 'tiny soft' }, t('val.honoredMost')),
            UI.el('div', { class: 'b' }, honored.name + ' (' + honored.livedPct + '%)'),
          ]),
        ]),
        UI.el('div', { class: 'glass-card card row gap3', style: { alignItems: 'center' } }, [
          UI.frag(`<span style="font-size:1.4rem">↘</span>`),
          UI.el('div', {}, [
            UI.el('div', { class: 'tiny soft' }, t('val.sacrificedMost')),
            UI.el('div', { class: 'b' }, sacrificed.name + ' (' + sacrificed.crowdedPct + '%)'),
          ]),
        ]),
      ]));
    }

    // Drift section — values where crowded > lived
    const drifting = stats.filter(s => s.crowdedPct > s.livedPct && s.totalDays >= 3);
    if (drifting.length) {
      const driftSection = UI.el('div', { class: 'col gap2 mt3' }, [
        UI.el('div', { class: 'small b' }, t('val.driftTitle')),
      ]);
      drifting.forEach(s => {
        driftSection.appendChild(UI.el('div', { class: 'glass-card card row gap3', style: { alignItems: 'center' } }, [
          UI.frag(`<span style="width:18px;height:18px;color:var(--warn);display:inline-flex">${Icons.get('trend')}</span>`),
          UI.el('div', {}, [
            UI.el('div', { class: 'b small' }, s.name),
            UI.el('div', { class: 'tiny soft' }, s.crowdedPct + '% ' + t('val.crowdedOut').toLowerCase() + ' · ' + s.livedPct + '% ' + t('val.livedOut').toLowerCase()),
          ]),
        ]));
      });
      section.appendChild(driftSection);
    }
  }

  // ---- 5. Compass Check decision helper (LLM) --------------------------------

  function renderDecisionHelper(root) {
    const section = UI.el('div', { class: 'col gap3' });
    root.appendChild(section);

    section.appendChild(UI.el('div', {}, [
      UI.el('div', { class: 'section-label b' }, t('val.compassCheck')),
      UI.el('div', { class: 'tiny soft mt1' }, t('val.compassCheckSub')),
    ]));

    const textarea = UI.el('textarea', {
      class: 'field-input',
      placeholder: t('val.decisionPlaceholder'),
      rows: 3,
      style: { resize: 'vertical', width: '100%' },
    });
    section.appendChild(textarea);

    const resultCard = UI.el('div', { class: 'col gap2', style: { display: 'none' } });
    section.appendChild(resultCard);

    const reflectBtn = UI.btn(t('val.reflectDecision'), {
      class: 'btn-primary btn-block',
      icon: 'compass',
      onClick: async () => {
        const decision = textarea.value.trim();
        if (!decision) return;

        const vals = Store.values.all();
        if (!vals.length) {
          UI.toast(t('val.myValues'), 'warn');
          return;
        }

        resultCard.style.display = '';
        UI.clear(resultCard);
        resultCard.appendChild(UI.el('div', { class: 'row center gap2', style: { padding: '16px' } }, [
          UI.thinking(),
          UI.el('span', { class: 'soft small' }, t('app.thinking')),
        ]));
        reflectBtn.disabled = true;

        const valList = vals.map(v => '- ' + v.name + (v.why ? ': ' + v.why : '')).join('\n');
        const prompt = `The person's stated values are:\n${valList}\n\nThey are weighing this decision or situation:\n${decision}\n\nReflect their own values back to them — gently and concisely. Don't decide for them. Don't moralize. Ask one clarifying question if it would genuinely help. Keep it warm, specific, and under 120 words.`;

        try {
          const reply = await LLM.ask(prompt, { temperature: 0.7 });
          UI.clear(resultCard);
          resultCard.appendChild(UI.el('div', { class: 'glass-card card col gap2' }, [
            UI.el('div', { class: 'row gap2', style: { alignItems: 'center', marginBottom: '6px' } }, [
              UI.frag(`<span style="width:18px;height:18px;color:var(--a1);display:inline-flex">${Icons.get('compass')}</span>`),
              UI.el('div', { class: 'eyebrow' }, t('val.compassCheck')),
            ]),
            UI.el('div', { class: 'small', style: { lineHeight: '1.7' } }, reply),
          ]));
        } catch (err) {
          UI.clear(resultCard);
          resultCard.appendChild(UI.el('div', { class: 'glass-card card small soft', style: { lineHeight: '1.6' } }, t('app.offline')));
        } finally {
          reflectBtn.disabled = false;
        }
      },
    });
    section.appendChild(reflectBtn);
  }

  // ---- AI value nudge — a concrete small way to live a value you're behind on
  function renderValueNudge(root) {
    const vals = Store.values.all();
    if (!vals.length || !(window.LLM && LLM.configured && LLM.configured())) return;
    // pick the value furthest behind its weekly target
    const behind = vals
      .map(v => ({ v, deficit: valueTarget(v) - weeklyLived(v.id) }))
      .filter(x => x.deficit > 0)
      .sort((a, b) => b.deficit - a.deficit)[0];
    if (!behind) return;
    const v = behind.v;

    const card = UI.el('div', { class: 'glass-card card', style: { borderColor: 'rgba(var(--a1-rgb),0.35)' } });
    root.appendChild(card);

    function paintIdle() {
      UI.clear(card);
      card.appendChild(UI.el('div', { class: 'row', style: { gap: '7px', alignItems: 'center', color: 'var(--a1)', fontWeight: '700', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.1em' } }, [
        UI.frag('<span style="width:15px;height:15px;display:inline-flex">' + Icons.get('spark') + '</span>'),
        UI.el('span', {}, t('val.nudgeTitle')),
      ]));
      card.appendChild(UI.el('div', { class: 'small soft', style: { marginTop: 'var(--s2)', lineHeight: '1.5' } }, t('val.nudgeBehind', { value: v.name, n: behind.deficit })));
      card.appendChild(UI.btn(t('val.nudgeCta', { value: v.name }), { class: 'btn-primary btn-block', icon: 'spark', onClick: gen, style: {} }));
    }
    const cacheKey = 'session.valueNudge.' + v.id;
    const cached = Store.get(cacheKey, null);

    async function gen() {
      UI.clear(card);
      card.appendChild(UI.el('div', { class: 'row', style: { gap: 'var(--s2)', alignItems: 'center' } }, [UI.thinking(), UI.el('span', { class: 'small soft' }, t('val.nudgeThinking'))]));
      if (UI.startHum) UI.startHum();
      try {
        const reply = await LLM.ask(prompt(), { temperature: 0.85 });
        Store.set(cacheKey, { date: today(), value: v.name, text: reply });
        paintIdea(reply);
      } catch (e) { paintIdle(); UI.toast(t('app.offline'), 'bad'); }
      finally { if (UI.stopHum) UI.stopHum(); }
    }
    function prompt() {
      return Store.profile.name() + ' values "' + v.name + '"' + (v.why ? ' (because: ' + v.why + ')' : '') +
        ' but has lived it only ' + weeklyLived(v.id) + ' of their target ' + valueTarget(v) + ' days this week. ' +
        'Suggest ONE small, concrete, ~10-minute thing they could actually do TODAY to live this value. ' +
        'One warm sentence, specific and doable, written as a gentle invitation. No preamble, no quotes.';
    }
    function paintIdea(text) {
      UI.clear(card);
      card.appendChild(UI.el('div', { class: 'row between', style: { alignItems: 'center' } }, [
        UI.el('div', { class: 'eyebrow' }, t('val.nudgeFor', { value: v.name })),
        UI.frag('<span style="width:18px;height:18px;display:inline-flex;color:var(--a1)">' + Icons.get('compass') + '</span>'),
      ]));
      card.appendChild(UI.el('div', { style: { marginTop: 'var(--s2)', lineHeight: '1.6' } }, text));
      const row = UI.el('div', { class: 'row', style: { gap: 'var(--s2)', marginTop: 'var(--s3)', alignItems: 'center' } }, [
        UI.el('button', { class: 'btn btn-ghost btn-sm', onclick: gen }, t('val.nudgeAnother')),
      ]);
      if (window.Speech && Speech.ttsSupported() && Store.get('settings.tts', true) !== false) {
        const rb = Speech.readButton(() => text); if (rb) row.appendChild(rb);
      }
      card.appendChild(row);
    }

    if (cached && cached.date === today() && cached.value === v.name) paintIdea(cached.text);
    else paintIdle();
  }

  // ---- 6. Low-mood nudge ----------------------------------------------------

  function renderLowMoodNudge(root) {
    const mood = Store.derive.dayMood(today());
    if (!mood || mood.valence >= -0.4) return;

    const nudge = UI.el('div', { class: 'glass-card card row gap3', style: { alignItems: 'center', borderColor: 'rgba(124,156,255,0.35)', cursor: 'pointer' } }, [
      UI.frag(`<span style="font-size:1.4rem">🧭</span>`),
      UI.el('div', { class: 'grow small', style: { lineHeight: '1.55' } }, t('val.lowMoodNudge')),
    ]);
    nudge.addEventListener('click', () => {
      // Scroll to today's check section — already visible on same page
      const checkEl = root.querySelector('[data-section="check"]');
      if (checkEl) checkEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    root.appendChild(nudge);
  }

  // ---- 7. Streak highlights -------------------------------------------------

  function renderStreaks(root) {
    const vals = Store.values.all();
    if (!vals.length) return;

    const active = vals
      .map(v => ({ v, n: valueStreak(v.id) }))
      .filter(x => x.n >= 2)
      .sort((a, b) => b.n - a.n);

    if (!active.length) return;

    const section = UI.el('div', { class: 'col gap2' });
    section.appendChild(UI.el('div', { class: 'section-label b' }, '🔥 Streaks'));

    active.forEach(({ v, n }) => {
      section.appendChild(UI.el('div', { class: 'glass-card card row gap3', style: { alignItems: 'center' } }, [
        UI.el('div', { style: { fontSize: '1.3rem', lineHeight: 1 } }, n >= 7 ? '🏅' : '🔥'),
        UI.el('div', { class: 'small' }, t('val.streak', { n, value: v.name })),
      ]));
    });
    root.appendChild(section);
  }

  // ---- Main render ----------------------------------------------------------

  function render(root) {
    const grid = UI.el('div', { class: 'col gap4 stagger' });
    root.appendChild(grid);

    // 1. Page head
    renderHead(grid);

    // 6. Low-mood nudge (show early so user notices it)
    renderLowMoodNudge(grid);

    // 2. My Values
    const myValuesSection = UI.el('div', { 'data-section': 'values' });
    grid.appendChild(myValuesSection);
    renderMyValues(myValuesSection);

    // AI nudge — a concrete way to live a value you're behind on
    renderValueNudge(grid);

    // 7. Streaks
    renderStreaks(grid);

    // 3. Today's Compass Check
    const checkSection = UI.el('div', { 'data-section': 'check' });
    grid.appendChild(checkSection);
    renderCompassCheck(checkSection);

    // 4. Alignment over time
    const alignSection = UI.el('div', { 'data-section': 'alignment' });
    grid.appendChild(alignSection);
    renderAlignment(alignSection);

    // 5. Decision helper (LLM)
    const decisionSection = UI.el('div', { 'data-section': 'decision' });
    grid.appendChild(decisionSection);
    renderDecisionHelper(decisionSection);
  }

  // ---- Register -------------------------------------------------------------

  Anchor.register({
    id: 'values',
    labelKey: 'nav.values',
    icon: 'compass',
    order: 45,
    tab: false,
    render,
  });
})();
