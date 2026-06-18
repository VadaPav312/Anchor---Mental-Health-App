// ===========================================================================
// native.js — Capacitor/iOS niceties with graceful browser fallbacks:
// status-bar theming, local-notification reminders (wind-down + check-in),
// share sheet, splash hide, network banner, app-resume hooks, keyboard.
// Everything no-ops cleanly in a plain browser / on Vercel.
// ===========================================================================
(function () {
  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const P = (n) => (Cap && Cap.Plugins && Cap.Plugins[n]) || null;
  const Native = { isNative };

  Native.applyStatusBar = () => {
    const SB = P('StatusBar'); if (!SB) return;
    const light = (Store.get('settings.theme') === 'daylight');
    try { SB.setStyle({ style: light ? 'LIGHT' : 'DARK' }); SB.setOverlaysWebView && SB.setOverlaysWebView({ overlay: true }); } catch {}
  };

  const REMINDERS = {
    windDown: { id: 2001, titleKey: 'set.remWindDown', bodyKey: 'dec.sub' },
    checkin: { id: 2002, titleKey: 'set.remCheckin', bodyKey: 'chk.streakKeep' },
  };
  Native.REMINDERS = REMINDERS;

  Native.notifPermission = async () => {
    const LN = P('LocalNotifications'); if (!LN) return 'unsupported';
    try { const r = await LN.requestPermissions(); return r.display; } catch { return 'denied'; }
  };
  Native.scheduleReminder = async (key, hour, minute) => {
    const LN = P('LocalNotifications'); const r = REMINDERS[key]; if (!LN || !r) return false;
    try {
      await LN.cancel({ notifications: [{ id: r.id }] }).catch(() => {});
      await LN.schedule({ notifications: [{ id: r.id, title: t(r.titleKey), body: t(r.bodyKey), schedule: { on: { hour, minute }, repeats: true } }] });
      return true;
    } catch (e) { console.warn('schedule failed', e); return false; }
  };
  Native.cancelReminder = async (key) => {
    const LN = P('LocalNotifications'); const r = REMINDERS[key]; if (!LN || !r) return;
    try { await LN.cancel({ notifications: [{ id: r.id }] }); } catch {}
  };

  Native.syncReminders = async () => {
    const rem = Store.get('settings.reminders', {});
    for (const key of Object.keys(REMINDERS)) {
      const cfg = rem[key]; if (!cfg) continue;
      if (cfg.on) await Native.scheduleReminder(key, cfg.hour, cfg.minute);
      else await Native.cancelReminder(key);
    }
  };

  Native.share = async (text, title) => {
    const SH = P('Share');
    if (SH) { try { await SH.share({ title: title || 'Anchor', text, dialogTitle: t('app.share') }); return true; } catch { return false; } }
    if (navigator.share) { try { await navigator.share({ title: title || 'Anchor', text }); return true; } catch { return false; } }
    try { await navigator.clipboard.writeText(text); UI.toast(t('app.copied'), 'good'); return true; }
    catch { return false; }
  };

  Native.init = () => {
    const SP = P('SplashScreen'); if (SP) { try { setTimeout(() => SP.hide(), 400); } catch {} }
    Native.applyStatusBar();

    const banner = () => document.getElementById('banner');
    const offline = (isOff) => {
      const b = banner(); if (!b) return;
      if (isOff) { b.className = 'banner bad'; b.textContent = t('app.offline'); }
      else { b.className = 'banner hidden'; }
    };
    const NW = P('Network');
    if (NW) {
      try { NW.getStatus().then(s => { if (!s.connected) offline(true); }); NW.addListener('networkStatusChange', s => offline(!s.connected)); } catch {}
    } else {
      window.addEventListener('offline', () => offline(true));
      window.addEventListener('online', () => offline(false));
    }

    const KB = P('Keyboard');
    if (KB) { try { KB.setResizeMode && KB.setResizeMode({ mode: 'native' }); } catch {} }
  };

  window.Native = Native;
})();
