// ===========================================================================
// patternDetective.js — Pattern Detective: the cross-referencing engine that
// spots the hidden, delayed causes behind how you feel. Surfaces ranked insight
// cards, a confidence bar, a lag chip, and an "investigate a hunch" section.
//
// Exposes:
//   window.PatternDetective = { scan, topInsight }
//   Anchor.register({ id:'patterns', ... })
// ===========================================================================
(function () {

  // ---- Candidate cause→effect pairs --------------------------------------
  var PAIRS = [
    { cause: 'sleepTempF',       effect: 'valence' },
    { cause: 'sleepDur',         effect: 'energyMood' },
    { cause: 'noise',            effect: 'restful' },
    { cause: 'sleepScore',       effect: 'valence' },
    { cause: 'energyNet',        effect: 'valence' },
    { cause: 'valence',          effect: 'energyMood' },
    { cause: 'light',            effect: 'sleepScore' },
    { cause: 'journalSentiment', effect: 'valence' },
    { cause: 'sleepScore',       effect: 'energyMood' },
  ];

  // Causes you can actually control → higher actionability score
  var CONTROLLABLE = new Set(['sleepTempF', 'noise', 'light', 'sleepDur', 'energyNet', 'journalSentiment']);

  // Stable id per (cause, effect) pair
  function pairId(cause, effect) {
    return 'pd_' + cause + '_' + effect;
  }

  // Human-readable lag phrase
  function lagPhrase(lag) {
    if (lag === 0) return t('pat.lagSame');
    if (lag === 1) return t('pat.lag1');
    if (lag === 2) return t('pat.lag2');
    return t('pat.lag3');
  }

  // Actionability heuristic 0..1
  function actionability(cause) {
    return CONTROLLABLE.has(cause) ? 0.75 + Math.random() * 0.25 : 0.15 + Math.random() * 0.35;
  }

  // Build a natural plain-language description for a (cause, effect) pair
  function describeInsight(cause, effect, r, lag, n, xSeries, ySeries) {
    var lagStr = lagPhrase(lag);
    var dir = r > 0 ? 'higher' : 'lower';
    var invDir = r > 0 ? 'lower' : 'higher';

    // Compute rough mean of x to embed concrete numbers
    var xVals = xSeries.map(function (d) { return d.value; }).filter(function (v) { return v != null && !isNaN(v); });
    var xMean = xVals.length ? xVals.reduce(function (a, b) { return a + b; }, 0) / xVals.length : null;

    if (cause === 'sleepTempF' && effect === 'valence') {
      var tempStr = xMean != null ? Math.round(xMean) : '—';
      return t('insight.sleepWarm', { temp: tempStr, lag: lagStr });
    }
    if (cause === 'sleepDur' && effect === 'energyMood') {
      var hrsStr = xMean != null ? xMean.toFixed(1) : '—';
      return t('insight.sleepShort', { hrs: hrsStr, lag: lagStr });
    }
    if (cause === 'noise' && effect === 'restful') {
      return t('insight.noiseMood');
    }
    if (cause === 'sleepScore' && effect === 'valence') {
      return 'Over the last ' + n + ' days, ' + (r > 0 ? 'higher sleep scores' : 'lower sleep scores') + ' link to ' + dir + ' mood — the shift shows up ' + lagStr + '.';
    }
    if (cause === 'energyNet' && effect === 'valence') {
      return 'Days where your energy budget ends ' + (r > 0 ? 'positive' : 'negative') + ' tend to track with ' + dir + ' mood ' + lagStr + '.';
    }
    if (cause === 'valence' && effect === 'energyMood') {
      return 'Your mood today carries forward into your energy level ' + lagStr + ' — the two are linked more than you might expect.';
    }
    if (cause === 'light' && effect === 'sleepScore') {
      return 'Nights with ' + (r < 0 ? 'more' : 'less') + ' light exposure tend to be followed by ' + invDir + ' sleep scores ' + lagStr + '.';
    }
    if (cause === 'journalSentiment' && effect === 'valence') {
      return 'The tone of your writing tracks your mood closely — ' + (r > 0 ? 'more positive entries' : 'more negative entries') + ' tend to pair with ' + dir + ' mood ' + lagStr + '.';
    }
    if (cause === 'sleepScore' && effect === 'energyMood') {
      return 'Sleep quality and next-day energy are clearly connected for you — better sleep scores link to higher energy ' + lagStr + '.';
    }
    // Fallback
    return 'Over ' + n + ' days, your ' + cause + ' and ' + effect + ' show a ' + Stats.strengthLabel(r) + ' link (' + lagStr + ').';
  }

  // ---- scan() — the analytical heart -------------------------------------
  function scan() {
    var days = 42;
    var findings = [];

    PAIRS.forEach(function (pair) {
      var xSeries = Store.derive.series(pair.cause, days);
      var ySeries = Store.derive.series(pair.effect, days);
      var best = Stats.bestLag(xSeries, ySeries, 3);

      if (best.n < 7 || Math.abs(best.r) < 0.25) return;

      var conf = Stats.confidence(best.r, best.n, best.p);
      var id = pairId(pair.cause, pair.effect);
      var act = actionability(pair.cause);
      var text = describeInsight(pair.cause, pair.effect, best.r, best.lag, best.n, xSeries, ySeries);

      findings.push({
        id: id,
        kind: pair.cause + '_' + pair.effect,
        cause: pair.cause,
        effect: pair.effect,
        r: best.r,
        lag: best.lag,
        n: best.n,
        confidence: conf,
        actionability: act,
        text: text,
        p: best.p,
      });
    });

    // Persist into Store.insights (dedupe by id; preserve dismissed flag)
    var existing = Store.insights.all();
    findings.forEach(function (f) {
      var match = existing.find(function (e) { return e.id === f.id; });
      if (match) {
        Store.insights.update(match.id, {
          r: f.r,
          lag: f.lag,
          n: f.n,
          confidence: f.confidence,
          actionability: f.actionability,
          text: f.text,
          ts: Date.now(),
        });
      } else {
        Store.insights.add({
          id: f.id,
          kind: f.kind,
          cause: f.cause,
          effect: f.effect,
          r: f.r,
          lag: f.lag,
          n: f.n,
          confidence: f.confidence,
          actionability: f.actionability,
          text: f.text,
          dismissed: false,
          ts: Date.now(),
        });
      }
    });

    return findings;
  }

  // ---- topInsight() — called by dashboard.js -----------------------------
  function topInsight() {
    if (Store.derive.historyDays() < 7) return null;
    var all = Store.insights.all();
    var active = all.filter(function (i) { return !i.dismissed && i.confidence > 0; });
    if (!active.length) return null;
    active.sort(function (a, b) { return (b.confidence || 0) - (a.confidence || 0); });
    return active[0];
  }

  // Expose globally — dashboard.js calls PatternDetective.topInsight()
  window.PatternDetective = { scan: scan, topInsight: topInsight };

  // ========================================================================
  // RENDER
  // ========================================================================
  function render(root) {
    // Run scan to keep Store.insights fresh
    scan();

    var histDays = Store.derive.historyDays();
    var hasEnough = histDays >= 7;

    // ---- Page header -------------------------------------------------------
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('div', { class: 'eyebrow' }, t('nav.patterns')),
      UI.el('h1', { class: 'page-title serif' }, t('pat.title')),
      UI.el('div', { class: 'small soft mt1' }, t('pat.sub')),
    ]));

    var col = UI.el('div', { class: 'col gap4 stagger' });
    root.appendChild(col);

    // Intro card
    col.appendChild(UI.card([
      UI.el('div', { class: 'row gap2', style: { alignItems: 'flex-start' } }, [
        UI.frag('<span style="width:20px;color:var(--a1);flex-shrink:0">' + Icons.get('patterns') + '</span>'),
        UI.el('div', { class: 'small soft', style: { lineHeight: '1.55' } }, t('pat.intro')),
      ]),
    ]));

    // ---- Data gate ---------------------------------------------------------
    if (!hasEnough) {
      col.appendChild(UI.empty(
        UI.frag('<span style="width:40px;color:var(--a1)">' + Icons.get('patterns') + '</span>'),
        t('pat.needMore'),
        t('pat.needMoreSub')
      ));
    } else {
      col.appendChild(insightList());
    }

    // ---- Dismissed section (always rendered) --------------------------------
    col.appendChild(dismissedSection());

    // ---- Investigate a hunch (always shown) --------------------------------
    col.appendChild(investigateSection());
  }

  // ---- Insight list -------------------------------------------------------
  function insightList() {
    var all = Store.insights.all();
    var active = all.filter(function (i) { return !i.dismissed; });
    active.sort(function (a, b) { return (b.confidence || 0) - (a.confidence || 0); });

    var wrap = UI.el('div', { class: 'col gap3' });

    if (!active.length) {
      wrap.appendChild(UI.el('div', { class: 'small soft', style: { textAlign: 'center', padding: '24px 0' } },
        t('dash.noInsightsYet')
      ));
      return wrap;
    }

    // Count label
    var count = active.length;
    var countKey = count === 1 ? 'pat.foundN.one' : 'pat.foundN.other';
    wrap.appendChild(UI.el('div', { class: 'eyebrow', style: { marginBottom: '2px' } }, t(countKey, { count: count })));

    active.forEach(function (ins) {
      wrap.appendChild(insightCard(ins));
    });

    return wrap;
  }

  // ---- Single insight card ------------------------------------------------
  function insightCard(ins) {
    var strengthStr = Stats.strengthLabel(ins.r || 0);
    var confPct = Math.round((ins.confidence || 0) * 100);
    var lagStr = lagPhrase(ins.lag || 0);

    var card = UI.el('div', { class: 'insight glass-card' }, [
      UI.el('div', { class: 'ins-glow' }),
      // Kicker row
      UI.el('div', { class: 'ins-kicker', style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
        UI.frag('<span style="width:14px;flex-shrink:0;color:var(--a1)">' + Icons.get('spark') + '</span>'),
        UI.el('span', {}, t('dash.topInsight')),
        // Lag chip
        UI.el('span', { class: 'chip', style: { marginLeft: 'auto', fontSize: '0.72rem', padding: '2px 8px' } }, [
          UI.el('span', { class: 'tiny soft' }, t('pat.lag') || t('pat.confidence').slice(0, 0) || ''),
          lagStr,
        ]),
      ]),
      // Insight text
      UI.el('div', { class: 'ins-text', style: { marginTop: '8px', lineHeight: '1.55' } }, ins.text || ''),
      // Confidence bar
      UI.el('div', { class: 'col gap1', style: { marginTop: '12px' } }, [
        UI.el('div', { class: 'row between' }, [
          UI.el('div', { class: 'tiny soft' }, t('pat.confidence') + ' · ' + t('pat.strength') + ': ' + strengthStr),
          UI.el('div', { class: 'tiny soft' }, confPct + '%'),
        ]),
        UI.el('div', { class: 'confbar' }, [
          UI.el('i', { style: { width: confPct + '%' } }),
        ]),
      ]),
      // "Based on N days"
      UI.el('div', { class: 'tiny soft', style: { marginTop: '6px' } }, t('pat.basedOn', { n: ins.n || 0 })),
      // Action buttons
      UI.el('div', { class: 'row gap2', style: { marginTop: '14px', flexWrap: 'wrap' } }, [
        UI.btn(t('pat.helpful'), {
          class: 'btn-ghost btn-sm',
          onClick: function () {
            UI.haptic('light');
            UI.toast(t('app.saved'), 'good');
          },
        }),
        UI.btn(t('pat.dismiss'), {
          class: 'btn-ghost btn-sm',
          onClick: function () {
            UI.haptic('light');
            Store.insights.update(ins.id, { dismissed: true });
            Anchor.refresh();
          },
        }),
        shareBtn(ins),
      ]),
    ]);

    return card;
  }

  function shareBtn(ins) {
    var Native = window.Native;
    if (!Native || !Native.share) return UI.el('span');
    return UI.btn(t('pat.shareInsight'), {
      class: 'btn-ghost btn-sm',
      icon: 'arrow',
      onClick: function () {
        UI.haptic('light');
        try { Native.share(ins.text || ''); } catch (e) { /* silent */ }
      },
    });
  }

  // ---- Dismissed section --------------------------------------------------
  function dismissedSection() {
    var dismissed = Store.insights.all().filter(function (i) { return i.dismissed; });
    if (!dismissed.length) return UI.el('div');

    var open = false;
    var wrap = UI.el('div', { class: 'col gap2' });

    var toggleBtn = UI.btn(t('pat.dismissed') + ' (' + dismissed.length + ')', {
      class: 'btn-ghost btn-sm',
      onClick: function () {
        open = !open;
        list.style.display = open ? 'flex' : 'none';
        toggleBtn.textContent = (open ? '▾ ' : '▸ ') + t('pat.dismissed') + ' (' + dismissed.length + ')';
      },
    });
    toggleBtn.textContent = '▸ ' + t('pat.dismissed') + ' (' + dismissed.length + ')';
    wrap.appendChild(toggleBtn);

    var list = UI.el('div', { class: 'col gap2', style: { display: 'none' } });
    dismissed.forEach(function (ins) {
      var row = UI.el('div', { class: 'glass-card card-tight row between gap3', style: { alignItems: 'center' } }, [
        UI.el('div', { class: 'small soft grow', style: { lineHeight: '1.45' } }, ins.text || ''),
        UI.btn(t('pat.restore'), {
          class: 'btn-ghost btn-sm',
          onClick: function () {
            UI.haptic('light');
            Store.insights.update(ins.id, { dismissed: false });
            Anchor.refresh();
          },
        }),
      ]);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  // ---- Investigate a hunch -----------------------------------------------
  function investigateSection() {
    var wrap = UI.el('div', { class: 'col gap3' });

    wrap.appendChild(UI.card([
      UI.el('div', { class: 'row gap2', style: { alignItems: 'flex-start', marginBottom: '10px' } }, [
        UI.frag('<span style="width:20px;flex-shrink:0;color:var(--a1)">' + Icons.get('target') + '</span>'),
        UI.el('div', {}, [
          UI.el('div', { class: 'b' }, t('pat.investigate')),
          UI.el('div', { class: 'small soft mt1' }, t('pat.investigateSub')),
        ]),
      ]),

      UI.el('div', { class: 'col gap2', id: 'inv-form-wrap' }, [
        buildInvestigateForm(),
      ]),
    ]));

    // Active investigations list
    var invs = Store.investigations.all();
    if (invs.length) {
      wrap.appendChild(investigationsList(invs));
    }

    return wrap;
  }

  function buildInvestigateForm() {
    var input = UI.el('input', {
      type: 'text',
      class: 'text-input',
      placeholder: t('pat.hypothesisPlaceholder'),
      style: { width: '100%', marginBottom: '8px' },
    });

    var statusEl = UI.el('div', { class: 'small soft', style: { minHeight: '18px', marginBottom: '4px' } }, '');

    var submitBtn = UI.btn(t('pat.runInvestigation'), {
      class: 'btn-primary btn-block',
      onClick: function () {
        var q = input.value.trim();
        if (!q) { UI.toast(t('app.required'), 'warn'); return; }
        submitBtn.disabled = true;
        statusEl.textContent = t('app.thinking');
        runInvestigation(q, statusEl, submitBtn, input);
      },
    });

    return UI.el('div', { class: 'col gap2' }, [input, statusEl, submitBtn]);
  }

  function runInvestigation(question, statusEl, submitBtn, input) {
    // Create the investigation record immediately (watching)
    var rec = Store.investigations.add({
      question: question,
      startDate: Store.today(),
      status: 'watching',
      verdict: null,
    });

    // Try LLM to interpret + map to a metric verdict
    if (LLM.configured()) {
      var prompt = 'A user is investigating this personal wellness hunch: "' + question + '"\n\n' +
        'Anchor has these data streams: valence (mood), energyMood, sleepScore, sleepTempF, sleepDur, noise, light, journalSentiment, energyNet, restful.\n\n' +
        'If this hunch maps to one of those metric pairs, return JSON:\n' +
        '{ "mapped": true, "cause": "<metric>", "effect": "<metric>", "summary": "<one warm sentence acknowledging the hunch>" }\n' +
        'Otherwise return:\n' +
        '{ "mapped": false, "summary": "<one warm sentence acknowledging the hunch and saying Anchor will keep watching>" }\n\n' +
        'Return only valid JSON.';

      LLM.json(prompt, { temperature: 0.3 })
        .then(function (parsed) {
          var verdict = null;
          var verdictText = null;

          if (parsed && parsed.mapped && parsed.cause && parsed.effect) {
            // Try to compute a real verdict from data
            var xSeries = Store.derive.series(parsed.cause, 42);
            var ySeries = Store.derive.series(parsed.effect, 42);
            var best = Stats.bestLag(xSeries, ySeries, 3);
            if (best.n >= 7 && Math.abs(best.r) >= 0.25) {
              verdict = 'real';
              verdictText = t('pat.verdictReal');
            } else if (best.n >= 5) {
              verdict = 'none';
              verdictText = t('pat.verdictNone');
            } else {
              verdict = 'more';
              verdictText = t('pat.verdictMore');
            }
          } else {
            verdict = 'watching';
            verdictText = null;
          }

          Store.investigations.update(rec.id, {
            status: verdict === 'watching' ? 'watching' : 'complete',
            verdict: verdict,
            verdictText: verdictText,
            llmSummary: parsed && parsed.summary ? parsed.summary : null,
          });

          statusEl.textContent = parsed && parsed.summary ? parsed.summary : t('pat.watching');
          submitBtn.disabled = false;
          input.value = '';
          Anchor.refresh();
        })
        .catch(function () {
          // Graceful fallback — record stays "watching"
          Store.investigations.update(rec.id, { status: 'watching' });
          statusEl.textContent = t('pat.watching');
          submitBtn.disabled = false;
          input.value = '';
          Anchor.refresh();
        });
    } else {
      statusEl.textContent = t('pat.watching');
      submitBtn.disabled = false;
      input.value = '';
      Anchor.refresh();
    }
  }

  function investigationsList(invs) {
    var wrap = UI.el('div', { class: 'col gap2' });

    wrap.appendChild(UI.el('div', { class: 'eyebrow', style: { marginBottom: '2px' } },
      t('pat.watchingN', { n: invs.length })
    ));

    invs.slice().reverse().forEach(function (inv) {
      var verdictEl = null;
      if (inv.verdict === 'real') {
        verdictEl = UI.el('div', { class: 'small', style: { color: 'var(--good)', marginTop: '6px' } },
          t('pat.verdict') + ': ' + t('pat.verdictReal')
        );
      } else if (inv.verdict === 'none') {
        verdictEl = UI.el('div', { class: 'small soft', style: { marginTop: '6px' } },
          t('pat.verdict') + ': ' + t('pat.verdictNone')
        );
      } else if (inv.verdict === 'more') {
        verdictEl = UI.el('div', { class: 'small soft', style: { marginTop: '6px' } },
          t('pat.verdict') + ': ' + t('pat.verdictMore')
        );
      } else {
        verdictEl = UI.el('div', { class: 'small soft', style: { marginTop: '6px' } },
          t('pat.watching')
        );
      }

      var llmNote = (inv.llmSummary)
        ? UI.el('div', { class: 'tiny soft', style: { marginTop: '4px', lineHeight: '1.45' } }, inv.llmSummary)
        : null;

      var card = UI.el('div', { class: 'glass-card card-tight col gap1' }, [
        UI.el('div', { class: 'small b', style: { lineHeight: '1.4' } }, '"' + inv.question + '"'),
        UI.el('div', { class: 'tiny soft' }, t('app.today') === inv.startDate ? t('app.today') : UI.fmt.date(inv.startDate)),
        verdictEl,
        llmNote,
      ]);

      wrap.appendChild(card);
    });

    return wrap;
  }

  // ---- Register -----------------------------------------------------------
  Anchor.register({
    id: 'patterns',
    labelKey: 'nav.patterns',
    icon: 'patterns',
    order: 30,
    tab: true,
    render: render,
  });

})();
