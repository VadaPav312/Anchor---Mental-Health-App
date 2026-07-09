// ===========================================================================
// ui.js — shared UI toolkit every feature builds on.
//
//   UI.el('div', { class:'card', onclick: fn }, [child, 'text'])  -> element
//   UI.toast('Saved', 'good')
//   UI.sheet({ title, body })  /  UI.modal({ title, body })  /  UI.confirm(msg)
//   UI.ring(value,max,{size,label})  UI.sparkline(values)  UI.bars(values)
//   UI.segmented(items, current, onChange)   UI.haptic('light')
//   UI.fmt.date(...) / .rel(...) / .num(...)
// ===========================================================================
(function () {
  // ---- DOM builder --------------------------------------------------------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class' || k === 'className') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style' && typeof v === 'object') {
          // Object.assign can't set CSS custom properties (--var); route those
          // through setProperty so things like radial-menu positions actually apply.
          for (const sk in v) {
            if (v[sk] == null) continue;
            if (sk.charCodeAt(0) === 45 && sk.charCodeAt(1) === 45) node.style.setProperty(sk, v[sk]);
            else node.style[sk] = v[sk];
          }
        }
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k in node && k !== 'list') { try { node[k] = v; } catch { node.setAttribute(k, v); } }
        else node.setAttribute(k, v);
      }
    }
    append(node, children);
    return node;
  }
  function append(node, children) {
    if (children == null) return;
    if (Array.isArray(children)) children.forEach(c => append(node, c));
    else if (children instanceof Node) node.appendChild(children);
    else node.appendChild(document.createTextNode(String(children)));
  }
  function frag(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
  function mount(container, node) { clear(container); append(container, node); return container; }

  // ---- haptics (Capacitor, with silent web fallback) ----------------------
  function haptic(style) {
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H) { try { (style === 'success' || style === 'warning' || style === 'error') ? H.notification({ type: style.toUpperCase() }) : H.impact({ style: (style || 'light').toUpperCase() }); } catch {} }
    else if (navigator.vibrate) { try { navigator.vibrate(style === 'heavy' ? 18 : style === 'medium' ? 12 : style === 'tick' ? 4 : 8); } catch {} }
  }
  // play a timed cadence of impacts — e.g. a "ta-da" on a real win
  function hapticSeq(steps) {
    let t = 0;
    (steps || []).forEach(s => { t += s.delay || 0; setTimeout(() => haptic(s.style || 'light'), t); });
  }
  // a rhythmic, multi-layered success cadence for finishing something big
  function hapticSuccess() {
    hapticSeq([{ style: 'light', delay: 0 }, { style: 'medium', delay: 80 }, { style: 'heavy', delay: 90 }, { style: 'success', delay: 120 }]);
  }
  // ultra-light "key" feedback for custom inputs (PIN/password), mechanical feel
  function hapticTick() { haptic('tick'); }
  // a satisfying "click-thunk" for COMMITTING a meaningful entry (check-in saved,
  // a value lived, a ring completed) — lighter than the big success cadence, but
  // unmistakably a "that landed" beat. Used to give the app a consistent, premium
  // tactile language across every primary action.
  function hapticCommit() { hapticSeq([{ style: 'medium', delay: 0 }, { style: 'light', delay: 70 }]); }
  // a bright, ascending "ding" when something is newly completed/unlocked
  function hapticPop() { hapticSeq([{ style: 'light', delay: 0 }, { style: 'medium', delay: 55 }]); }
  // a faint repeating pulse that "hums" along with a loading shimmer
  let _hum = null;
  function startHum() { if (_hum) return; _hum = setInterval(() => haptic('tick'), 680); }
  function stopHum() { if (_hum) { clearInterval(_hum); _hum = null; } }
  // long-press helper: fires a snappy "pop" and the callback when held
  function longPress(el, onLong, ms) {
    ms = ms || 500; let timer = null, fired = false;
    const start = () => { fired = false; timer = setTimeout(() => { fired = true; haptic('medium'); onLong(); }, ms); };
    const cancel = () => { clearTimeout(timer); };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('mousedown', start);
    ['touchend', 'touchmove', 'mouseup', 'mouseleave'].forEach(ev => el.addEventListener(ev, cancel, { passive: true }));
    return () => cancel();
  }

  // ---- toast --------------------------------------------------------------
  function toast(msg, type) {
    const host = document.getElementById('toast-host'); if (!host) return;
    const node = el('div', { class: 'toast glass-strong ' + (type || ''), text: msg });
    host.appendChild(node);
    haptic(type === 'bad' ? 'error' : 'light');
    setTimeout(() => { node.classList.add('out'); setTimeout(() => node.remove(), 280); }, 2200);
  }

  // ---- sheet (bottom) -----------------------------------------------------
  function sheet(opts) {
    const host = document.getElementById('sheet-host'); if (!host) return null;
    clear(host);
    const panel = el('div', { class: 'sheet glass-strong' }, [
      el('div', { class: 'sheet-grip' }),
      opts.title ? el('div', { class: 'modal-title' }, opts.title) : null,
      opts.body || null,
    ]);
    const scrim = el('div', { class: 'scrim', onclick: () => close() });
    host.append(scrim, panel);
    host.classList.add('open');
    function close() { panel.style.animation = 'sheet-up var(--dur) reverse both'; scrim.style.animation = 'fade var(--dur) reverse both'; setTimeout(() => { host.classList.remove('open'); clear(host); }, 240); opts.onClose && opts.onClose(); }
    return { close, panel };
  }

  // ---- modal (center) -----------------------------------------------------
  function modal(opts) {
    const host = document.getElementById('modal-host'); if (!host) return null;
    clear(host);
    const panel = el('div', { class: 'modal glass-strong' }, [
      opts.title ? el('div', { class: 'modal-title' }, opts.title) : null,
      opts.body || null,
      opts.actions ? el('div', { class: 'row gap2 mt4', style: { justifyContent: opts.actionsAlign || 'flex-end' } }, opts.actions) : null,
    ]);
    const scrim = el('div', { class: 'scrim', onclick: () => opts.dismissable === false ? null : close() });
    host.append(scrim, panel);
    host.classList.add('open');
    function close() { host.classList.remove('open'); clear(host); opts.onClose && opts.onClose(); }
    return { close, panel };
  }

  function confirm(message, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const m = modal({
        title: opts.title || null,
        actionsAlign: 'center',
        body: el('p', { class: 'soft', style: { lineHeight: '1.5', textAlign: 'center' } }, message),
        actions: [
          el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { m.close(); resolve(false); } }, t('app.cancel')),
          el('button', { class: 'btn btn-sm ' + (opts.danger ? 'btn-danger' : 'btn-primary'), onclick: () => { m.close(); resolve(true); } }, opts.confirmLabel || t('app.confirm')),
        ],
      });
    });
  }

  // ---- progress ring (svg string) ----------------------------------------
  function ring(value, max, opts) {
    opts = opts || {};
    const size = opts.size || 120, sw = opts.stroke || 11;
    const r = (size - sw) / 2, c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(1, (value || 0) / (max || 100)));
    const off = c * (1 - pct);
    const grad = opts.gradId || 'rg' + Math.random().toString(36).slice(2, 7);
    const col = opts.color || ['var(--a1)', 'var(--a2)'];
    // Scale the centered number with the ring's diameter so it always fits INSIDE
    // the stroke instead of overflowing across / being clipped by the circle. The
    // fixed 2rem in CSS was fine for a 120px ring but overflowed the 72–96px ones
    // used on the sleep screen. An explicit opts.textSize still wins.
    const numSize = opts.textSize || Math.max(13, Math.round(size * 0.26)) + 'px';
    // Keep the label + number within the clear inner diameter (2r − 2·stroke).
    const inner = Math.max(0, 2 * r - 2 * sw);
    return `<div class="ring-wrap" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}">
        <defs><linearGradient id="${grad}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${col[0]}"/><stop offset="1" stop-color="${col[1] || col[0]}"/></linearGradient></defs>
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${sw}"/>
        <circle class="ring-val" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${grad})" stroke-width="${sw}"
          stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
      </svg>
      <div class="ring-center" style="max-width:${inner}px">
        <div class="rc-num" style="font-size:${numSize};letter-spacing:-0.02em;line-height:1">${opts.text != null ? opts.text : Math.round(value)}</div>
        ${opts.label ? `<div class="rc-lbl">${opts.label}</div>` : ''}
      </div></div>`;
  }

  // ---- sparkline (svg string) --------------------------------------------
  function sparkline(values, opts) {
    opts = opts || {};
    const w = opts.width || 280, h = opts.height || 44, pad = 3;
    const pts = values.map((v, i) => ({ v, i })).filter(p => p.v != null && !isNaN(p.v));
    if (pts.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}"></svg>`;
    const xs = values.length - 1;
    let min = Math.min(...pts.map(p => p.v)), max = Math.max(...pts.map(p => p.v));
    if (opts.min != null) min = opts.min; if (opts.max != null) max = opts.max;
    const rng = (max - min) || 1;
    const X = i => pad + (i / xs) * (w - 2 * pad);
    const Y = v => h - pad - ((v - min) / rng) * (h - 2 * pad);
    let d = '', area = '';
    pts.forEach((p, k) => { const cmd = k === 0 ? 'M' : 'L'; d += `${cmd}${X(p.i).toFixed(1)} ${Y(p.v).toFixed(1)} `; });
    area = d + `L${X(pts[pts.length - 1].i).toFixed(1)} ${h} L${X(pts[0].i).toFixed(1)} ${h} Z`;
    const id = 'sp' + Math.random().toString(36).slice(2, 7);
    const col = opts.color || 'var(--a1)';
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity="0.32"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#${id})"/>
      <path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  function bars(values, opts) {
    opts = opts || {};
    const max = opts.max || Math.max(1, ...values.filter(v => v != null));
    const wrap = el('div', { class: 'bars' });
    values.forEach(v => {
      const h = v == null ? 0 : Math.max(3, (v / max) * 100);
      wrap.appendChild(el('div', { class: 'bar', style: { height: h + '%', opacity: v == null ? 0.18 : 1, background: opts.color || '' } }));
    });
    return wrap;
  }

  // ---- segmented control --------------------------------------------------
  function segmented(items, current, onChange) {
    const wrap = el('div', { class: 'seg' });
    const btns = [];
    items.forEach(it => {
      const b = el('button', {
        class: it.value === current ? 'active' : '',
        onclick: () => {
          haptic('light');
          // move the highlight immediately so the control visibly responds
          btns.forEach(x => x.classList.toggle('active', x === b));
          onChange(it.value);
        },
      }, it.label);
      btns.push(b);
      wrap.appendChild(b);
    });
    return wrap;
  }

  // ---- chips group --------------------------------------------------------
  function chips(items, selected, onToggle, opts) {
    opts = opts || {};
    const set = new Set(Array.isArray(selected) ? selected : [selected]);
    const wrap = el('div', { class: 'row wrap gap2' });
    items.forEach(it => {
      const val = typeof it === 'string' ? it : it.value;
      const label = typeof it === 'string' ? it : it.label;
      const chip = el('button', {
        class: 'chip' + (set.has(val) ? ' active' : ''),
        onclick: () => {
          haptic('light');
          if (opts.single) { wrap.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); chip.classList.add('active'); set.clear(); set.add(val); }
          else { chip.classList.toggle('active'); set.has(val) ? set.delete(val) : set.add(val); }
          onToggle(opts.single ? val : Array.from(set), val);
        },
      }, label);
      wrap.appendChild(chip);
    });
    return wrap;
  }

  // ---- small building blocks ---------------------------------------------
  function spinner() { return el('div', { class: 'spinner' }); }
  function thinking() { return el('div', { class: 'thinking' }, [el('i'), el('i'), el('i')]); }
  // icon can be: an Icons name ('journal'), an emoji/glyph ('🌙'), or null.
  function empty(icon, title, sub) {
    let inner;
    if (icon && Icons.names.indexOf(icon) !== -1) inner = frag(`<span style="display:inline-flex;width:30px;height:30px;color:var(--a1)">${Icons.get(icon)}</span>`);
    else inner = el('span', { style: { fontSize: '1.9rem', lineHeight: '1' } }, icon || '✶');
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty-badge' }, inner),
      title ? el('div', { class: 'empty-title' }, title) : null,
      sub ? el('div', { class: 'small' }, sub) : null,
    ]);
  }
  function card(children, opts) {
    opts = opts || {};
    return el('div', { class: 'glass-card ' + (opts.tight ? 'card-tight ' : 'card ') + (opts.sheen ? 'sheen ' : '') + (opts.class || ''), onclick: opts.onClick }, children);
  }
  function tile(val, label, sub, opts) {
    opts = opts || {};
    return el('div', { class: 'tile glass-card' }, [
      el('div', { class: 'tile-lbl' }, label),
      el('div', { class: 'tile-val' + (opts.grad ? ' grad-text' : ''), style: opts.color ? { color: opts.color } : null }, val),
      sub ? el('div', { class: 'tile-sub' }, sub) : null,
    ]);
  }
  function btn(label, opts) {
    opts = opts || {};
    const b = el('button', { class: 'btn ' + (opts.class || '') + (opts.block ? ' btn-block' : ''), onclick: opts.onClick, disabled: opts.disabled }, [
      opts.icon ? frag(`<span style="display:inline-flex;width:18px;height:18px">${Icons.get(opts.icon)}</span>`) : null,
      label,
    ]);
    return b;
  }
  function field(label, control, sub) {
    return el('div', { class: 'field' }, [
      label ? el('label', { class: 'field-label' }, label) : null,
      control,
      sub ? el('div', { class: 'tiny muted', style: { marginTop: '5px', marginLeft: '4px' } }, sub) : null,
    ]);
  }
  function row(left, right, opts) {
    return el('div', { class: 'row between gap3 ' + ((opts && opts.class) || '') }, [left, right]);
  }
  function switchToggle(checked, onChange) {
    const input = el('input', { type: 'checkbox', checked: !!checked, onchange: (e) => { haptic('light'); onChange(e.target.checked); } });
    return el('label', { class: 'switch' }, [input, el('span', { class: 'track' }), el('span', { class: 'knob' })]);
  }

  // run an async op while showing a spinner inside `target`; restore on done
  async function withLoading(target, fn, opts) {
    opts = opts || {};
    const prev = target.innerHTML;
    target.innerHTML = '';
    target.appendChild(el('div', { class: 'row center gap2', style: { padding: '20px' } }, [spinner(), el('span', { class: 'soft small' }, opts.label || t('app.thinking'))]));
    try { return await fn(); }
    catch (e) { target.innerHTML = prev; throw e; }
  }

  // ---- formatters ---------------------------------------------------------
  const fmt = {
    num(n, d) { if (n == null || isNaN(n)) return '—'; return (+n).toFixed(d == null ? 0 : d); },
    signed(n, d) { const s = fmt.num(Math.abs(n), d); return (n > 0 ? '+' : n < 0 ? '−' : '') + s; },
    date(dk, opts) {
      const d = typeof dk === 'string' ? Store.keyToDate(dk) : dk;
      try { return d.toLocaleDateString(I18N.lang, opts || { month: 'short', day: 'numeric' }); } catch { return dk; }
    },
    weekday(dk) { const d = typeof dk === 'string' ? Store.keyToDate(dk) : dk; try { return d.toLocaleDateString(I18N.lang, { weekday: 'short' }); } catch { return ''; } },
    time(ts) { try { return new Date(ts).toLocaleTimeString(I18N.lang, { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } },
    rel(dk) {
      const diff = Store.diffDays(Store.today(), dk);
      if (diff === 0) return t('app.today');
      if (diff === 1) return t('app.yesterday');
      if (diff < 7) return diff + ' ' + t('app.days');
      return fmt.date(dk);
    },
    temp(f) {
      if (f == null) return '—';
      const unit = Store.get('settings.tempUnit', 'F');
      return unit === 'C' ? Math.round((f - 32) * 5 / 9) + '°' : Math.round(f) + '°';
    },
    dur(min) { if (min == null) return '—'; const h = Math.floor(min / 60), m = Math.round(min % 60); return h + 'h ' + (m ? m + 'm' : ''); },
  };

  // weather emoji + names
  const WX = {
    sun: '☀️', clear: '🌤️', cloud: '☁️', fog: '🌫️', rain: '🌧️', storm: '⛈️',
  };
  function weatherEmoji(code) { return WX[code] || '☁️'; }
  function weatherName(code) { return t('wx.weather' + (code ? code[0].toUpperCase() + code.slice(1) : 'Cloud')); }

  window.UI = {
    el, frag, clear, mount, append, haptic, hapticSeq, hapticSuccess, hapticTick, hapticCommit, hapticPop, startHum, stopHum, longPress,
    toast, sheet, modal, confirm,
    ring, sparkline, bars, segmented, chips, spinner, thinking, empty,
    card, tile, btn, field, row, switchToggle, withLoading, fmt,
    weatherEmoji, weatherName, WX,
  };
})();
