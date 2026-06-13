// ===========================================================================
// server.js — Anchor's bedside-monitor BRIDGE.
//
//   Arduino (sleep sensors) --USB serial--> THIS computer (bridge) --Wi-Fi-->
//   Anchor iPhone app.
//
// The Arduino is wired to this machine over USB and streams CSV lines (see
// arduino/anchor_sleep_monitor.ino). This bridge parses them, keeps a live
// snapshot + an overnight summary, converts raw sensor values into meaningful
// units (°F, an estimated lux, an estimated dB), and serves them to the phone
// over the LAN. It also forwards the app's wind-down "dim the lamp" command
// back to the Arduino.
//
// The app's INTELLIGENCE (Cerebras AI) runs on the phone itself — this bridge
// only relays hardware. No API key required here.
//
// Endpoints:
//   GET  /api/sleep            live snapshot the phone polls
//   GET  /api/sleep/summary    overnight aggregate -> the phone saves a "night"
//   POST /api/sleep/reconnect  re-resolve the USB serial port
//   POST /api/light            { brightness, r,g,b } -> forwarded to Arduino
//   POST /api/sleep/reset      start a fresh night's accumulation
//   GET  /api/health
//   /                          serves the Anchor web app (www/) for the browser
// ===========================================================================
const path = require("path");
const express = require("express");

let SerialPort, ReadlineParser;
try {
  ({ SerialPort } = require("serialport"));
  ({ ReadlineParser } = require("@serialport/parser-readline"));
} catch (e) {
  console.warn("serialport not installed — running in simulate-only mode.");
}

try { process.loadEnvFile(path.join(__dirname, ".env")); } catch (e) { /* optional */ }

const app = express();
const PORT = process.env.PORT || 3000;
const ARDUINO_PATH = process.env.ARDUINO_PORT || "/dev/cu.usbmodem1101";
const ARDUINO_BAUD = +(process.env.ARDUINO_BAUD || 9600);
// If the Arduino isn't found, synthesize gentle, plausible readings so the app
// demos end-to-end without the breadboard. Set ANCHOR_SIMULATE=0 to disable.
const SIMULATE = process.env.ANCHOR_SIMULATE !== "0";
// The firmware reports ultrasonic Distance (cm). Something closer than this in
// front of the sensor = the bed is occupied. Tune to your nightstand setup.
const IN_BED_CM = +(process.env.ANCHOR_IN_BED_CM || 120);

// ---------------------------------------------------------------------------
// LIVE STATE + OVERNIGHT SUMMARY
// ---------------------------------------------------------------------------
const live = {
  connected: false,
  source: "none",            // 'serial' | 'simulated' | 'none'
  inBed: false,
  tempC: null, humidity: null, lightRaw: null, noiseRaw: null, motion: 0,
  distanceCm: null, fan: null,
  lastUpdate: 0, raw: "",
};

function newNight() {
  return {
    startedAt: Date.now(), date: dateKey(new Date()),
    inBedAt: null, outAt: null, lastInBed: false, inBedMs: 0, lastTickInBed: 0,
    samples: 0,
    tSum: 0, tN: 0, hSum: 0, hN: 0, lSum: 0, lN: 0, nSum: 0, nN: 0,
    motionEvents: 0, lastMotion: 0, awakenings: 0,
    peakNoise: 0,
  };
}
let nightState = newNight();

function dateKey(d) {
  const p = n => (n < 10 ? "0" + n : "" + n);
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

// ---- unit conversions (rough but stable for ranking/feedback) ----
function cToF(c) { return c == null ? null : c * 9 / 5 + 32; }
// photoresistor raw 0..1023 -> estimated lux. With this wiring a COVERED (dark)
// sensor reads a HIGH raw value, so we INVERT: dark -> low lux, bright -> high
// lux (which is what a person expects). Curve keeps a dark room near 0.
function rawToLux(raw) { if (raw == null) return null; const x = Math.max(0, Math.min(1023, 1023 - raw)) / 1023; return Math.round(x * x * 320); }
// mic peak-to-peak raw 0..1023 -> estimated dB SPL (~30 quiet .. ~78 loud)
function rawToDb(raw) { if (raw == null) return null; return Math.round(30 + (Math.max(0, raw) / 1023) * 48); }

// fold a parsed sample into both live state and the overnight summary
function ingest(s) {
  live.connected = true;
  // In-bed comes either from an explicit B flag (old firmware) or is derived
  // from the ultrasonic Distance (current firmware): something close = occupied.
  const inBed = (s.B != null) ? !!s.B
    : (s.D != null ? (s.D >= 0 && s.D < IN_BED_CM) : live.inBed);
  live.inBed = inBed;
  if (s.T != null) live.tempC = s.T;
  if (s.H != null) live.humidity = s.H;
  if (s.L != null) live.lightRaw = s.L;
  if (s.N != null) live.noiseRaw = s.N;
  if (s.D != null) live.distanceCm = s.D;
  if (s.F != null) live.fan = s.F;
  live.motion = s.M ? 1 : 0;
  live.lastUpdate = Date.now();

  const ns = nightState;
  ns.samples++;
  const now = Date.now();
  if (inBed) {
    if (!ns.lastInBed) { if (!ns.inBedAt) ns.inBedAt = now; ns.lastTickInBed = now; }
    else if (ns.lastTickInBed) { ns.inBedMs += now - ns.lastTickInBed; ns.lastTickInBed = now; }
    ns.lastInBed = true; ns.outAt = null;
    if (s.T != null) { ns.tSum += s.T; ns.tN++; }
    if (s.H != null) { ns.hSum += s.H; ns.hN++; }
    if (s.L != null) { ns.lSum += s.L; ns.lN++; }
    if (s.N != null) { ns.nSum += s.N; ns.nN++; ns.peakNoise = Math.max(ns.peakNoise, s.N); }
    if (s.M) {
      ns.motionEvents++;
      if (now - ns.lastMotion > 90000) ns.awakenings++; // a fresh burst after 90s quiet
      ns.lastMotion = now;
    }
  } else {
    if (ns.lastInBed) ns.outAt = now;
    ns.lastInBed = false; ns.lastTickInBed = 0;
  }
}

function summary() {
  const ns = nightState;
  const avg = (s, n) => (n ? s / n : null);
  return {
    date: dateKey(new Date()),
    inBedAt: ns.inBedAt ? new Date(ns.inBedAt).toISOString() : null,
    outAt: ns.outAt ? new Date(ns.outAt).toISOString() : null,
    durationMin: Math.round(ns.inBedMs / 60000),
    avgTempF: round1(cToF(avg(ns.tSum, ns.tN))),
    avgHumidity: roundN(avg(ns.hSum, ns.hN)),
    avgLightLux: rawToLux(avg(ns.lSum, ns.lN)),
    avgNoiseDb: rawToDb(avg(ns.nSum, ns.nN)),
    peakNoiseDb: rawToDb(ns.peakNoise || null),
    motionEvents: ns.motionEvents,
    awakenings: ns.awakenings,
    samples: ns.samples,
    source: live.source,
  };
}
function round1(v) { return v == null ? null : Math.round(v * 10) / 10; }
function roundN(v) { return v == null ? null : Math.round(v); }

// ---------------------------------------------------------------------------
// SERIAL
// ---------------------------------------------------------------------------
let arduinoPort = null;

function parseLine(line) {
  // Current firmware (Serial-Plotter style, comma-separated label:value):
  //   "Temp:22.4,Humidity:46,Light:512,Sound:300,Motion:1,Distance:80,Fan:0"
  // Also accepts the older "ANCHOR,T=..,H=..,L=..,N=..,M=..,B=.." format.
  // Internal keys: T temp°C, H humidity%, L lightRaw, N noiseRaw(sound),
  //                M motion0/1, D distanceCm, F fan%, B inBed0/1.
  const LABELS = { temp: "T", humidity: "H", light: "L", sound: "N", noise: "N", motion: "M", distance: "D", fan: "F", inbed: "B" };
  const out = {};
  line.split(",").forEach(tok => {
    const m = tok.match(/^\s*([A-Za-z]+)\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) return;
    const name = m[1].toLowerCase();
    const key = LABELS[name] || (/^[thlnmbdf]$/.test(name) ? name.toUpperCase() : null);
    if (key) out[key] = parseFloat(m[2]);
  });
  return Object.keys(out).length ? out : null;
}

async function resolveArduinoPath() {
  if (!SerialPort) return null;
  try {
    const ports = await SerialPort.list();
    if (ports.some(p => p.path === ARDUINO_PATH)) return ARDUINO_PATH;
    const match = ports.find(p => /usbmodem|usbserial|wchusb|SLAB|ttyUSB|ttyACM/i.test(p.path));
    if (match) { console.log(`Arduino: ${ARDUINO_PATH} not found, using ${match.path}`); return match.path; }
  } catch (e) { /* fall through */ }
  return null;
}

let reconnectTimer = null;
function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log("Anchor monitor: link lost — will keep retrying every 3s…");
  reconnectTimer = setInterval(async () => {
    if (arduinoPort && arduinoPort.isOpen) { clearInterval(reconnectTimer); reconnectTimer = null; return; }
    try { const ok = await initArduino(); if (ok) { clearInterval(reconnectTimer); reconnectTimer = null; console.log("Anchor monitor: reconnected."); } } catch {}
  }, 3000);
}

async function initArduino() {
  if (!SerialPort) return false;
  if (arduinoPort && arduinoPort.isOpen) return true; // already connected
  const portPath = await resolveArduinoPath();
  if (!portPath) return false;
  try {
    // make sure any half-dead handle is gone before opening a new one
    if (arduinoPort) { try { arduinoPort.removeAllListeners(); arduinoPort.close(() => {}); } catch {} arduinoPort = null; }
    arduinoPort = new SerialPort({ path: portPath, baudRate: ARDUINO_BAUD });
    const parser = arduinoPort.pipe(new ReadlineParser({ delimiter: "\n" }));
    arduinoPort.on("open", () => { live.source = "serial"; live.connected = true; console.log(`Anchor monitor connected on ${portPath}`); });
    // auto-recover from a dropped link (brownout reset, re-upload, unplug/replug)
    arduinoPort.on("close", () => { live.connected = false; scheduleReconnect(); });
    arduinoPort.on("error", () => { live.connected = false; scheduleReconnect(); });
    parser.on("data", d => {
      const line = String(d).trim();
      live.raw = line;
      const s = parseLine(line);
      if (s) { live.source = "serial"; ingest(s); }
    });
    return true;
  } catch (e) {
    console.warn(`Could not open ${portPath}: ${e.message}`);
    scheduleReconnect();
    return false;
  }
}

function sendLight(brightness, r, g, b) {
  if (!arduinoPort || !arduinoPort.isOpen) return false;
  const cmd = (r != null && g != null && b != null)
    ? `LIGHT ${r} ${g} ${b} ${brightness}\n`
    : `LIGHT ${brightness}\n`;
  try { arduinoPort.write(cmd); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------
// SIMULATION (when no hardware is attached) — gentle, plausible night values
// ---------------------------------------------------------------------------
function startSimulation() {
  if (live.source === "serial") return;
  live.source = "simulated";
  let t = 0;
  setInterval(() => {
    if (live.source === "serial") return; // real hardware took over
    t += 1;
    const hour = new Date().getHours();
    const nightTime = hour >= 22 || hour < 7;
    const wobble = Math.sin(t / 9) * 0.6 + (Math.random() - 0.5) * 0.4;
    ingest({
      T: 20.5 + wobble,                                  // ~20–21°C
      H: 46 + Math.round(Math.sin(t / 13) * 4),
      // raw is HIGH in the dark (inverted by rawToLux): night = high raw (dark), day = low raw (bright)
      L: nightTime ? 880 + Math.round(Math.random() * 130) : 60 + Math.round(Math.random() * 160),
      N: 70 + Math.round(Math.abs(Math.sin(t / 5)) * 90 + Math.random() * 30),
      M: Math.random() < 0.08 ? 1 : 0,
      B: nightTime ? 1 : 0,
    });
  }, 2000);
  console.log("Anchor monitor: no Arduino found — simulating sleep data (set ANCHOR_SIMULATE=0 to disable).");
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/api/health", (req, res) => res.json({ ok: true, app: "anchor-bridge", source: live.source, connected: live.connected }));

app.get("/api/sleep", (req, res) => {
  // The firmware streams every ~10s now, so allow a generous gap before we call
  // it stale — otherwise it would flicker "connected/disconnected" between reads.
  const stale = Date.now() - live.lastUpdate > 30000;
  res.json({
    connected: live.connected && !stale,
    source: live.source,
    inBed: live.inBed,
    temperatureF: round1(cToF(live.tempC)),
    humidity: roundN(live.humidity),
    lightLux: rawToLux(live.lightRaw),
    noiseDb: rawToDb(live.noiseRaw),
    motion: live.motion,
    distanceCm: live.distanceCm,
    fan: live.fan,
    sampleCount: nightState.samples,
    since: live.lastUpdate ? Date.now() - live.lastUpdate : null,
    raw: live.raw,
  });
});

app.get("/api/sleep/summary", (req, res) => res.json(summary()));

app.post("/api/sleep/reset", (req, res) => { nightState = newNight(); res.json({ ok: true }); });

app.post("/api/sleep/reconnect", async (req, res) => {
  const ok = await initArduino();
  res.json({ connected: ok || live.source === "simulated", source: live.source });
});

app.post("/api/light", (req, res) => {
  const { brightness = 0, r, g, b } = req.body || {};
  const sent = sendLight(Math.max(0, Math.min(255, +brightness || 0)), r, g, b);
  res.json({ ok: true, forwarded: sent, simulated: !sent && live.source === "simulated" });
});

// ---------------------------------------------------------------------------
// EMAIL via Resend (transactional digest + a "send test email" for demos).
// The SECRET key lives here in .env (RESEND_API_KEY), never in the phone app.
// Broadcast IDs (daily/weekly/monthly) come from the client config.
// ---------------------------------------------------------------------------
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "Anchor <onboarding@resend.dev>";

function digestHtml(name, lines) {
  const items = (lines && lines.length ? lines : ["You showed up today — that counts."])
    .map(l => `<tr><td style="padding:10px 0;border-bottom:1px solid #1c2138;color:#c9cffb;font-size:15px;line-height:1.5">${escapeHtml(l)}</td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#05060f;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05060f;padding:28px 0">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:92%;background:linear-gradient(180deg,#0e1430,#0a1024);border:1px solid #1c2138;border-radius:22px;overflow:hidden">
        <tr><td style="padding:30px 30px 8px">
          <div style="font-size:13px;letter-spacing:2px;color:#7c9cff;text-transform:uppercase">⚓ Anchor</div>
          <div style="font-size:24px;font-weight:700;color:#f3f5ff;margin-top:6px">Hi ${escapeHtml(name || "friend")}, here’s your check-in</div>
        </td></tr>
        <tr><td style="padding:6px 30px 0"><table role="presentation" width="100%">${items}</table></td></tr>
        <tr><td style="padding:22px 30px 30px">
          <div style="font-size:12px;color:#5a6088;line-height:1.6">Anchor offers reflections and patterns, never diagnoses. If things feel heavy, support is always one tap away in the app.</div>
        </td></tr>
      </table>
      <div style="font-size:11px;color:#3a3f60;margin-top:16px">Sent by your Anchor bridge · this is a demo digest</div>
    </td></tr>
  </table></body></html>`;
}
function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

async function resendSend(to, subject, html) {
  if (!RESEND_API_KEY) { const e = new Error("RESEND_API_KEY is not set on the bridge."); e.code = "no-key"; throw e; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + RESEND_API_KEY },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.message || ("Resend error " + r.status)); e.status = r.status; throw e; }
  return j;
}

app.post("/api/email/test", async (req, res) => {
  const { to, name, lines, subject } = req.body || {};
  if (!to || !/.+@.+\..+/.test(to)) return res.status(400).json({ error: "no-address" });
  try {
    const j = await resendSend(to, subject || "Your Anchor check-in 🌙", digestHtml(name, lines));
    res.json({ ok: true, id: j.id });
  } catch (e) {
    res.status(e.code === "no-key" ? 503 : (e.status || 502)).json({ error: e.message, code: e.code || null });
  }
});

// Trigger one of the configured Resend broadcasts (daily/weekly/monthly).
app.post("/api/email/broadcast", async (req, res) => {
  const { broadcastId, kind } = req.body || {};
  if (!RESEND_API_KEY) return res.status(503).json({ error: "RESEND_API_KEY is not set on the bridge.", code: "no-key" });
  if (!broadcastId) return res.status(400).json({ error: "missing broadcastId" });
  try {
    const r = await fetch("https://api.resend.com/broadcasts/" + broadcastId + "/send", {
      method: "POST", headers: { Authorization: "Bearer " + RESEND_API_KEY },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: j.message || ("broadcast failed " + r.status) });
    res.json({ ok: true, kind: kind || null, id: j.id || broadcastId });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// serve the web app so http://<this-computer-ip>:3000 works in a browser too
app.use(express.static(path.join(__dirname, "www")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "www", "index.html")));

// ---------------------------------------------------------------------------
async function boot() {
  const ok = await initArduino();
  if (!ok && SIMULATE) startSimulation();
  app.listen(PORT, () => {
    console.log(`\n⚓  Anchor bridge running on http://localhost:${PORT}`);
    console.log(`   Sleep monitor source: ${live.source}`);
    console.log(`   On your phone (same Wi-Fi), set the monitor address to: http://<this-computer-ip>:${PORT}\n`);
  });
}

// Boot only when run directly (node server.js); stay quiet when required by a test.
if (require.main === module) boot();

module.exports = { parseLine, ingest, summary, live, rawToLux, rawToDb, cToF, IN_BED_CM };
