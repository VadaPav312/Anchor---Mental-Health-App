// ===========================================================================
// seed.js — optional demo data. Generates ~6 weeks of realistic, *correlated*
// history so the app is alive on first open and Pattern Detective actually has
// something true to find. Triggered from onboarding ("Explore with demo data")
// and Settings. Clearly labeled; never overwrites real data without confirm.
//
// Baked-in ground truths (with noise, so detection is non-trivial):
//   • Warm room (>71°F) at night  ->  lower mood ~2 days later
//   • Short sleep (<6.5h)         ->  lower energy ~1 day later
//   • Social restore days         ->  higher mood ~2 days later
//   • Days where the value "presence" got crowded out -> lower mood same/next day
// ===========================================================================
(function () {
  // tiny seeded PRNG so the demo is stable within a session
  let _s = 1234567;
  function rnd() { _s = (_s * 16807) % 2147483647; return (_s - 1) / 2147483646; }
  function rang(a, b) { return a + rnd() * (b - a); }
  function chance(p) { return rnd() < p; }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  const DAYS = 42;
  const tagPool = ['calm', 'anxious', 'tired', 'hopeful', 'content', 'overwhelmed', 'grateful', 'focused', 'lonely', 'loved'];
  const journalSnippets = [
    'Long day. Tried to keep my head above it. Small wins count, I think.',
    'Felt genuinely okay today — went for a walk and the light helped.',
    'Everything feels like too much right now. I never seem to catch up.',
    'Good talk with a friend. Forgot how much that resets me.',
    'Couldn’t sleep, mind kept looping on work. Wired and tired.',
    'Quiet, steady day. Nothing dramatic, and that was nice.',
    'Snapped at someone I love and felt awful after. Tired, I think.',
    'Sat outside with coffee this morning. Felt like myself for a bit.',
  ];

  function build() {
    const sleep = [], moods = [], journal = [], energy = [], valuesChecks = [];
    const tempArr = [], shortArr = [], socialArr = [], crowdedArr = [];

    // pass 1: generate nightly sleep + note the "cause" signals per day index
    for (let i = 0; i < DAYS; i++) {
      const warm = chance(0.4);
      const tempF = warm ? rang(71.5, 76) : rang(64, 70.5);
      const durationMin = chance(0.3) ? rang(330, 388) : rang(400, 510);   // some short nights
      const humidity = rang(38, 60), lightLux = rang(0, 14), noiseDb = rang(26, 46);
      const motion = Math.round(rang(20, 120)), awakenings = Math.round(rang(0, 3));
      const envScore = SleepScore.environment({ tempF, humidity, lightLux, noiseDb });
      const score = SleepScore.sleep({ durationMin, envScore, awakenings, motion });
      tempArr[i] = tempF; shortArr[i] = durationMin < 390 ? 1 : 0;
      sleep.push({ date: dk(i), durationMin: Math.round(durationMin), tempF: +tempF.toFixed(1), humidity: +humidity.toFixed(0), lightLux: +lightLux.toFixed(0), noiseDb: +noiseDb.toFixed(0), motion, awakenings, restful: clamp(Math.round(score / 12), 1, 10), envScore, score, source: 'demo' });
    }

    // pass 2: energy + decide social/crowded signals
    for (let i = 0; i < DAYS; i++) {
      const social = chance(0.45); socialArr[i] = social ? 1 : 0;
      const crowded = chance(0.5); crowdedArr[i] = crowded ? 1 : 0;
      const drains = Math.round(rang(1, 3)), restores = Math.round(rang(0, 2)) + (social ? 1 : 0);
      for (let d = 0; d < drains; d++) energy.push({ date: dk(i), ts: tsOf(i, 10 + d * 3), kind: 'spend', amount: Math.round(rang(1, 3)), label: pick(['Back-to-back meetings', 'Difficult conversation', 'Commute', 'Doomscrolling', 'Skipped lunch']), category: pick(['work', 'social', 'mind', 'body']) });
      for (let r = 0; r < restores; r++) energy.push({ date: dk(i), ts: tsOf(i, 12 + r * 4), kind: 'restore', amount: Math.round(rang(1, 3)), label: social && r === 0 ? pick(['Coffee with a friend', 'Called my sister', 'Dinner with friends']) : pick(['Walk outside', 'Nap', 'Music', 'Sunlight', 'Stretching']), category: social && r === 0 ? 'social' : pick(['body', 'mind']) });
    }

    // pass 3: mood = base + lagged effects of the causes + noise
    for (let i = 0; i < DAYS; i++) {
      let v = rang(-0.3, 0.6);
      if (i >= 2 && tempArr[i - 2] > 71) v -= rang(0.7, 1.3);        // warm night -> low mood 2d later
      if (i >= 2 && socialArr[i - 2]) v += rang(0.4, 0.9);          // social -> lift 2d later
      if (crowdedArr[i]) v -= rang(0.3, 0.7);                       // value crowded out -> dip
      v = clamp(v, -2, 2);
      let eMood = rang(4.5, 7.5);
      if (i >= 1 && shortArr[i - 1]) eMood -= rang(1.8, 3);         // short sleep -> low energy next day
      eMood = clamp(eMood, 0, 10);
      const nTags = 1 + Math.floor(rnd() * 2);
      const tags = []; for (let k = 0; k < nTags; k++) tags.push(pick(v < -0.4 ? ['anxious', 'tired', 'overwhelmed', 'lonely'] : v > 0.6 ? ['calm', 'hopeful', 'content', 'grateful'] : tagPool));
      moods.push({ date: dk(i), ts: tsOf(i, 19), valence: +v.toFixed(2), energy: +eMood.toFixed(1), arousal: +rang(2, 8).toFixed(1), note: '', tags });

      if (chance(0.5)) {
        const text = v < -0.4 ? pick([journalSnippets[2], journalSnippets[4], journalSnippets[6]]) : v > 0.6 ? pick([journalSnippets[1], journalSnippets[3], journalSnippets[7]]) : pick(journalSnippets);
        journal.push({ date: dk(i), ts: tsOf(i, 21), text, lang: 'en', sentiment: { score: +clamp(v / 2 + rang(-0.1, 0.1), -1, 1).toFixed(2), label: v < -0.3 ? 'low' : v > 0.4 ? 'warm' : 'mixed' }, linguistics: linguistics(text), themes: [] });
      }
      // a values check most days
      if (chance(0.7)) {
        const vals = Store.values.all();
        if (vals.length) {
          const lived = vals.filter(() => chance(0.55)).map(x => x.id);
          const crowdedIds = crowdedArr[i] && vals[0] ? [vals[0].id] : vals.filter(x => !lived.includes(x.id) && chance(0.3)).map(x => x.id);
          valuesChecks.push({ date: dk(i), lived, crowded: crowdedIds, note: '' });
        }
      }
    }

    return { sleep, moods, journal, energy, valuesChecks };
  }

  function linguistics(text) {
    const words = text.toLowerCase().match(/[a-z’']+/g) || [];
    const wc = words.length;
    const abs = (text.match(/\b(always|never|everyone|nothing|everything|nobody|completely|totally)\b/gi) || []).length;
    const self = (text.match(/\b(i|me|my|myself|mine)\b/gi) || []).length;
    const pos = (text.match(/\b(good|okay|nice|hope|grateful|calm|love|better|won|win|light)\b/gi) || []).length;
    const neg = (text.match(/\b(too much|awful|tired|can’t|cant|never|loop|wired|overwhelm|behind)\b/gi) || []).length;
    return { wordCount: wc, absolutes: abs, selfRefs: self, posWords: pos, negWords: neg, ratio: wc ? +((pos - neg) / wc).toFixed(3) : 0 };
  }

  function dk(i) { const d = new Date(); d.setDate(d.getDate() - (DAYS - 1 - i)); return Store.dateKey(d); }
  function tsOf(i, hour) { const d = new Date(); d.setDate(d.getDate() - (DAYS - 1 - i)); d.setHours(hour, Math.floor(rnd() * 59), 0, 0); return d.getTime(); }

  function apply() {
    _s = 1234567;
    const data = build();
    const s = Store.raw;
    s.sleep = data.sleep; s.moods = data.moods; s.journal = data.journal; s.energy = data.energy; s.valuesChecks = data.valuesChecks;
    s.meta.seeded = true;
    Store.persist(); Store.emit('change');
  }

  window.Seed = { apply, build };
})();
