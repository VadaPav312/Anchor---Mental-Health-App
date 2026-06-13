// ===========================================================================
// monitor.js — Live Monitor screen. Real-time graphs of the bedside Arduino
// (Elegoo) sensor stream. Displays temperature, humidity, light, noise,
// motion, distance (bed presence), and fan speed — each with a live sparkline
// from a ring buffer of the last 60 samples.
//
// Bridge.state shape (after Bridge.live()):
//   { connected, inBed, ageMs,
//     live: { temperatureF, humidity, lightLux, noiseDb, motion, distanceCm, fan, sampleCount },
//     lastError }
// ===========================================================================
(function () {

  // ---- module-level state (stable across re-renders) -----------------------
  let _unsubBridge = null;   // cleanup fn from Bridge.onUpdate
  let _pollTimer   = null;   // from setInterval via Bridge.poll — we track the
                             // interval ourselves so we can cancel if needed,
                             // but Bridge.stopPoll() is the canonical cleanup

  // Ring buffer: last BUFFER_SIZE samples per metric
  const BUFFER_SIZE = 60;
  const _buf = {
    temperatureF: [],
    humidity:     [],
    lightLux:     [],
    noiseDb:      [],
    motion:       [],
    distanceCm:   [],
    fan:          [],
  };

  function pushBuf(key, value) {
    if (value == null) return;
    _buf[key].push(value);
    if (_buf[key].length > BUFFER_SIZE) _buf[key].shift();
  }

  function resetBufs() {
    Object.keys(_buf).forEach(k => { _buf[k] = []; });
  }

  // ---- cleanup helpers ------------------------------------------------------
  function cleanupSubs() {
    if (_unsubBridge) { try { _unsubBridge(); } catch (e) {} _unsubBridge = null; }
    try { Bridge.stopPoll(); } catch (e) {}
  }

  // ---- color helpers (mirrors sleep.js conventions) -------------------------
  function tempColor(f) {
    if (f == null) return 'var(--ink-ghost)';
    // ideal 60-67 °F
    if (f >= 60 && f <= 67) return 'var(--good)';
    if (f > 67 && f <= 72)  return 'var(--warn)';
    return 'var(--bad)';
  }

  function humidityColor(h) {
    if (h == null) return 'var(--ink-ghost)';
    if (h >= 40 && h <= 55) return 'var(--good)';
    if ((h >= 30 && h < 40) || (h > 55 && h <= 65)) return 'var(--warn)';
    return 'var(--bad)';
  }

  function lightColor(lux) {
    if (lux == null) return 'var(--ink-ghost)';
    if (lux < 8)   return 'var(--good)';
    if (lux < 30)  return 'var(--warn)';
    return 'var(--bad)';
  }

  function noiseColor(db) {
    if (db == null) return 'var(--ink-ghost)';
    if (db <= 35)  return 'var(--good)';
    if (db <= 50)  return 'var(--warn)';
    return 'var(--bad)';
  }

  function motionColor(m) {
    if (m == null) return 'var(--ink-ghost)';
    if (m <= 5)   return 'var(--good)';
    if (m <= 20)  return 'var(--warn)';
    return 'var(--bad)';
  }

  function distColor(cm) {
    if (cm == null) return 'var(--ink-ghost)';
    // <120 cm typically means in-bed
    return cm < 120 ? 'var(--good)' : 'var(--ink-ghost)';
  }

  function fanColor(pct) {
    if (pct == null) return 'var(--ink-ghost)';
    if (pct === 0)   return 'var(--ink-ghost)';
    if (pct < 50)    return 'var(--a3)';
    return 'var(--warn)';
  }

  // ---- status chip logic ----------------------------------------------------
  function statusForMetric(key, value) {
    if (value == null) return null;
    switch (key) {
      case 'temperatureF':
        if (value >= 60 && value <= 67) return 'good';
        if (value > 67 && value <= 72)  return 'ok';
        return 'poor';
      case 'humidity':
        if (value >= 40 && value <= 55) return 'good';
        if ((value >= 30 && value < 40) || (value > 55 && value <= 65)) return 'ok';
        return 'poor';
      case 'lightLux':
        if (value < 8)  return 'good';
        if (value < 30) return 'ok';
        return 'poor';
      case 'noiseDb':
        if (value <= 35) return 'good';
        if (value <= 50) return 'ok';
        return 'poor';
      default:
        return null;
    }
  }

  function statusLabel(status) {
    if (status === 'good') return t('mon.statusGood');
    if (status === 'ok')   return t('mon.statusOk');
    if (status === 'poor') return t('mon.statusPoor');
    return null;
  }

  function statusColor(status) {
    if (status === 'good') return 'var(--good)';
    if (status === 'ok')   return 'var(--warn)';
    if (status === 'poor') return 'var(--bad)';
    return 'var(--ink-ghost)';
  }

  // ---- value formatters per metric ------------------------------------------
  function formatValue(key, value) {
    if (value == null) return '—';
    switch (key) {
      case 'temperatureF':
        return UI.fmt.temp(value);        // handles °C / °F via Store.settings.tempUnit
      case 'humidity':
        return Math.round(value) + '%';
      case 'lightLux':
        return UI.fmt.num(value, 1) + ' lux';
      case 'noiseDb':
        return Math.round(value) + ' dB';
      case 'motion':
        // PIR is binary — show it as Low / High rather than 0 / 1
        return value >= 1 ? t('mon.motionHigh') : t('mon.motionLow');
      case 'distanceCm':
        return UI.fmt.num(value, 0) + ' cm';
      case 'fan':
        return Math.round(value) + '%';
      default:
        return UI.fmt.num(value, 1);
    }
  }

  // ---- metric definitions (order, keys, i18n, icon, color fn) ---------------
  const METRICS = [
    {
      key: 'temperatureF',
      labelKey: 'mon.mTemp',
      infoKey:  'mon.mTempInfo',
      icon: 'thermo',
      colorFn: tempColor,
      sparkColor: 'var(--a1)',
    },
    {
      key: 'humidity',
      labelKey: 'mon.mHum',
      infoKey:  'mon.mHumInfo',
      icon: 'droplet',
      colorFn: humidityColor,
      sparkColor: 'var(--a3)',
    },
    {
      key: 'lightLux',
      labelKey: 'mon.mLight',
      infoKey:  'mon.mLightInfo',
      icon: 'sun',
      colorFn: lightColor,
      sparkColor: 'var(--warn)',
    },
    {
      key: 'noiseDb',
      labelKey: 'mon.mNoise',
      infoKey:  'mon.mNoiseInfo',
      icon: 'sound',
      colorFn: noiseColor,
      sparkColor: 'var(--bad)',
    },
    {
      key: 'motion',
      labelKey: 'mon.mMotion',
      infoKey:  'mon.mMotionInfo',
      icon: 'wind',
      colorFn: motionColor,
      sparkColor: 'var(--a2)',
    },
    {
      key: 'distanceCm',
      labelKey: 'mon.mDist',
      infoKey:  'mon.mDistInfo',
      icon: 'target',
      colorFn: distColor,
      sparkColor: 'var(--a3)',
    },
    {
      key: 'fan',
      labelKey: 'mon.mFan',
      infoKey:  'mon.mFanInfo',
      icon: 'leaf',
      colorFn: fanColor,
      sparkColor: 'var(--a1)',
    },
  ];

  // ---- stable element IDs ---------------------------------------------------
  function statusDotId()    { return 'mon-status-dot'; }
  function statusTextId()   { return 'mon-status-text'; }
  function inBedPillId()    { return 'mon-inbed-pill'; }
  function metricValId(key) { return 'mon-val-' + key; }
  function metricSpkId(key) { return 'mon-spk-' + key; }
  function metricChpId(key) { return 'mon-chp-' + key; }
  function metricColId(key) { return 'mon-col-' + key; }

  // ---- connection status badge (initial build) ------------------------------
  function buildStatusRow() {
    const bs = Bridge.state;
    const connected = bs.connected;

    let text, color;
    if (connected) {
      text  = t('mon.connected');
      color = 'var(--good)';
    } else if (bs.lastError === 'no-address') {
      text  = t('mon.offline');
      color = 'var(--ink-ghost)';
    } else if (bs.live === null) {
      text  = t('mon.connecting');
      color = 'var(--warn)';
    } else {
      text  = t('mon.offline');
      color = 'var(--warn)';
    }

    const inBedText  = bs.inBed ? t('mon.inBedYes') : t('mon.inBedNo');
    const inBedColor = bs.inBed ? 'var(--good)' : 'var(--ink-ghost)';

    return UI.el('div', { class: 'row gap3', style: { alignItems: 'center', flexWrap: 'wrap' } }, [
      // colored dot + label
      UI.el('span', {
        id: statusDotId(),
        style: {
          display: 'inline-block',
          width: '9px', height: '9px',
          borderRadius: '50%',
          background: color,
          flexShrink: '0',
          boxShadow: connected ? '0 0 7px ' + color : 'none',
          transition: 'background 0.3s, box-shadow 0.3s',
        },
      }),
      UI.el('span', {
        id: statusTextId(),
        class: 'small',
        style: { color, transition: 'color 0.3s', marginRight: '8px' },
      }, text),

      // in-bed pill
      UI.el('span', {
        id: inBedPillId(),
        class: 'chip',
        style: {
          background: inBedColor + '22',
          color: inBedColor,
          borderColor: inBedColor + '44',
          fontSize: '0.75rem',
          padding: '2px 10px',
          transition: 'all 0.3s',
        },
      }, inBedText),
    ]);
  }

  // ---- surgically update status row (no full re-render) ---------------------
  function updateStatusRow() {
    const bs = Bridge.state;
    const connected = bs.connected;

    let text, color;
    if (connected) {
      text  = t('mon.connected');
      color = 'var(--good)';
    } else if (bs.lastError === 'no-address') {
      text  = t('mon.offline');
      color = 'var(--ink-ghost)';
    } else if (bs.live === null) {
      text  = t('mon.connecting');
      color = 'var(--warn)';
    } else {
      text  = t('mon.offline');
      color = 'var(--warn)';
    }

    const dot  = document.getElementById(statusDotId());
    const txt  = document.getElementById(statusTextId());
    const pill = document.getElementById(inBedPillId());

    if (dot) {
      dot.style.background  = color;
      dot.style.boxShadow   = connected ? '0 0 7px ' + color : 'none';
    }
    if (txt) {
      txt.style.color   = color;
      txt.textContent   = text;
    }
    if (pill) {
      const inBedText  = bs.inBed ? t('mon.inBedYes') : t('mon.inBedNo');
      const inBedColor = bs.inBed ? 'var(--good)' : 'var(--ink-ghost)';
      pill.style.background   = inBedColor + '22';
      pill.style.color        = inBedColor;
      pill.style.borderColor  = inBedColor + '44';
      pill.textContent        = inBedText;
    }
  }

  // ---- temp unit segmented control ------------------------------------------
  function buildTempUnitToggle() {
    const unit = Store.get('settings.tempUnit', 'F');
    const items = [
      { label: t('set.fahrenheit'), value: 'F' },
      { label: t('set.celsius'),    value: 'C' },
    ];
    return UI.el('div', { class: 'row gap3', style: { alignItems: 'center' } }, [
      UI.el('span', { class: 'small soft', style: { flexShrink: '0' } }, t('mon.tempUnitToggle')),
      UI.segmented(items, unit, (val) => {
        try { Store.settings.update({ tempUnit: val }); } catch (e) {
          // fallback: patch state directly if update method differs
          try { const s = Store.get('settings', {}); Store.set('settings', Object.assign({}, s, { tempUnit: val })); } catch (e2) {}
        }
        // Re-render only the temperature value readout in the card
        refreshMetricValue('temperatureF');
      }),
    ]);
  }

  // ---- re-render just the value display for one metric ----------------------
  function refreshMetricValue(key) {
    const live = Bridge.state.live;
    const value = live ? live[key] : null;
    const valEl = document.getElementById(metricValId(key));
    if (valEl) valEl.textContent = formatValue(key, value);
  }

  // ---- single metric card (initial build) -----------------------------------
  function buildMetricCard(metric) {
    const { key, labelKey, infoKey, icon, colorFn, sparkColor } = metric;
    const live  = Bridge.state.live;
    const value = live ? live[key] : null;
    const color = colorFn(value);

    const status     = statusForMetric(key, value);
    const statusTxt  = statusLabel(status);
    const statusClr  = statusColor(status);

    const sparkValues = _buf[key].slice();   // current buffer snapshot
    const sparkSvg    = sparkValues.length >= 2
      ? UI.sparkline(sparkValues, { width: 280, height: 40, color: sparkColor })
      : `<svg class="spark" viewBox="0 0 280 40"></svg>`;

    // status chip (only for metrics with range logic)
    const chipNode = status
      ? UI.el('span', {
          id: metricChpId(key),
          class: 'chip',
          style: {
            background: statusClr + '22',
            color: statusClr,
            borderColor: statusClr + '44',
            fontSize: '0.72rem',
            padding: '2px 8px',
          },
        }, statusTxt)
      : UI.el('span', { id: metricChpId(key) });   // empty placeholder

    return UI.el('div', {
      id: metricColId(key),
      class: 'glass-card card',
    }, [
      // header: icon + metric name
      UI.el('div', { class: 'row between', style: { marginBottom: '6px' } }, [
        UI.el('div', { class: 'row gap2', style: { alignItems: 'center' } }, [
          UI.frag('<span style="width:18px;height:18px;color:' + color + ';transition:color 0.3s" id="mon-icon-' + key + '">' + Icons.get(icon) + '</span>'),
          UI.el('span', { class: 'small b' }, t(labelKey)),
        ]),
        chipNode,
      ]),

      // current value — big
      UI.el('div', {
        id: metricValId(key),
        class: 'tile-val',
        style: {
          color: color,
          fontSize: '2rem',
          fontWeight: '600',
          lineHeight: '1',
          marginBottom: '4px',
          transition: 'color 0.3s',
        },
      }, value != null ? formatValue(key, value) : (Bridge.state.live === null ? '—' : '—')),

      // one-line info blurb
      UI.el('div', { class: 'tiny soft', style: { marginBottom: '10px', lineHeight: '1.4' } }, t(infoKey)),

      // sparkline
      UI.el('div', {
        id: metricSpkId(key),
        style: { overflow: 'hidden', borderRadius: '4px' },
      }, [UI.frag(sparkSvg)]),
    ]);
  }

  // ---- surgically update one metric card's dynamic bits --------------------
  function updateMetricCard(metric) {
    const { key, colorFn, sparkColor } = metric;
    const live  = Bridge.state.live;
    const value = live ? live[key] : null;
    const color = colorFn(value);

    // value text
    const valEl = document.getElementById(metricValId(key));
    if (valEl) {
      valEl.textContent  = value != null ? formatValue(key, value) : '—';
      valEl.style.color  = color;
    }

    // icon color
    const iconEl = document.getElementById('mon-icon-' + key);
    if (iconEl) iconEl.style.color = color;

    // status chip
    const status    = statusForMetric(key, value);
    const statusTxt = statusLabel(status);
    const statusClr = statusColor(status);
    const chipEl    = document.getElementById(metricChpId(key));
    if (chipEl && status) {
      chipEl.style.background  = statusClr + '22';
      chipEl.style.color       = statusClr;
      chipEl.style.borderColor = statusClr + '44';
      chipEl.textContent       = statusTxt;
    } else if (chipEl) {
      chipEl.textContent = '';
    }

    // sparkline
    const sparkEl = document.getElementById(metricSpkId(key));
    if (sparkEl) {
      const buf = _buf[key].slice();
      const svg = buf.length >= 2
        ? UI.sparkline(buf, { width: 280, height: 40, color: sparkColor })
        : `<svg class="spark" viewBox="0 0 280 40"></svg>`;
      UI.clear(sparkEl);
      sparkEl.appendChild(UI.frag(svg));
    }
  }

  // ---- the "not configured" setup card --------------------------------------
  function buildSetupCard() {
    return UI.card([
      UI.el('div', { class: 'row gap3', style: { alignItems: 'flex-start' } }, [
        UI.frag('<span style="font-size:2rem;flex-shrink:0">' + Icons.get('spark') + '</span>'),
        UI.el('div', { class: 'grow' }, [
          UI.el('div', { class: 'b' }, t('mon.offline')),
          UI.el('div', { class: 'small soft mt1' }, t('sleep.setupHint')),
          UI.el('div', { style: { marginTop: '12px' } }, [
            UI.btn(t('mon.connect'), {
              class: 'btn-primary btn-sm',
              icon: 'settings',
              onClick: () => Anchor.go('settings'),
            }),
          ]),
        ]),
      ]),
    ]);
  }

  // ---- no-data placeholder (configured but no readings yet) -----------------
  function buildNoDataCard() {
    return UI.empty('spark', t('mon.noData'), t('mon.connecting'));
  }

  // ---- full page render -----------------------------------------------------
  function render(container) {
    // Clean up any lingering subscriptions from a previous render
    cleanupSubs();
    // Do NOT reset ring buffers on re-render — keep accumulated history
    // (buffers are only reset when the module first loads)

    UI.clear(container);

    const root = UI.el('div', { class: 'col gap4 stagger' });
    container.appendChild(root);

    // 1. Page head
    root.appendChild(UI.el('div', { class: 'page-head' }, [
      UI.el('div', { class: 'eyebrow' }, t('mon.sub')),
      UI.el('h1', { class: 'page-title serif' }, t('mon.title')),
      UI.el('div', { class: 'small soft mt1' }, t('mon.intro')),
    ]));

    // 2. If bridge not configured — show setup card and stop
    if (!Bridge.configured()) {
      root.appendChild(buildSetupCard());
      // bottom pad
      root.appendChild(UI.el('div', { style: { height: '40px' } }));
      return;
    }

    // 3. Connection status row + in-bed pill
    const statusCard = UI.card([
      UI.el('div', { class: 'row between gap3', style: { flexWrap: 'wrap', gap: '10px' } }, [
        buildStatusRow(),
        buildTempUnitToggle(),
      ]),
    ], { sheen: true });
    root.appendChild(statusCard);

    // 4. No data yet?
    const bs = Bridge.state;
    if (bs.live === null) {
      root.appendChild(buildNoDataCard());
      root.appendChild(UI.el('div', { style: { height: '40px' } }));
      return;
    }

    // 5. Metric cards — each in a glass-card
    const grid = UI.el('div', { class: 'col gap3' });
    root.appendChild(grid);

    METRICS.forEach(metric => {
      grid.appendChild(buildMetricCard(metric));
    });

    // Bottom padding
    root.appendChild(UI.el('div', { style: { height: '40px' } }));
  }

  // ---- onUpdate callback: push to ring buffers + surgical DOM update --------
  function handleBridgeUpdate(state) {
    const live = state.live;

    // Push new samples into ring buffers
    if (live) {
      pushBuf('temperatureF', live.temperatureF);
      pushBuf('humidity',     live.humidity);
      pushBuf('lightLux',     live.lightLux);
      pushBuf('noiseDb',      live.noiseDb);
      pushBuf('motion',       live.motion);
      pushBuf('distanceCm',   live.distanceCm);
      pushBuf('fan',          live.fan);
    }

    // Surgically update connection status row
    updateStatusRow();

    // If we don't have metric cards in the DOM yet (page showed "no data" before
    // first reading arrived), do a full re-render now
    const firstMetricKey = METRICS[0].key;
    const firstValEl = document.getElementById(metricValId(firstMetricKey));
    if (!firstValEl) {
      // We need to find the container and re-render; use the page root
      const pageRoot = document.querySelector('.page-root');
      if (pageRoot) render(pageRoot);
      return;
    }

    // Otherwise, update each metric card's dynamic bits in place
    METRICS.forEach(metric => updateMetricCard(metric));
  }

  // ---- onShow: start live polling and subscribe to Bridge updates -----------
  function onShow() {
    // Always clean up before re-subscribing so we don't stack callbacks
    cleanupSubs();

    // Subscribe to Bridge state updates
    _unsubBridge = Bridge.onUpdate(handleBridgeUpdate);

    // Start polling every 2.5 seconds if the bridge is configured
    if (Bridge.configured()) {
      try {
        Bridge.poll(2500);
      } catch (e) {
        console.warn('[monitor] Bridge.poll failed:', e);
        // fall back to a single live() call
        try { Bridge.live(); } catch (e2) {}
      }
    } else {
      // Not configured — fire one live() so Bridge.state is fresh
      try { Bridge.live(); } catch (e) {}
    }
  }

  // ---- register -------------------------------------------------------------
  Anchor.register({
    id:       'monitor',
    labelKey: 'mon.title',
    icon:     'spark',
    order:    18,
    tab:      false,
    render,
    onShow,
  });

})();
