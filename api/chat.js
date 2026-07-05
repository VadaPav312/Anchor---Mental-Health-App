// ===========================================================================
// api/chat.js — SERVER-SIDE AI PROXY (Vercel Serverless Function).
//
// This is the single place the Cerebras API key is ever used. It lives only in
// a server environment variable (CEREBRAS_API_KEY) and is NEVER shipped to any
// browser or app binary. The client (www/js/llm.js) posts a conversation here;
// this function authenticates the request, validates/limits it, attaches the
// secret key, calls Cerebras, and returns only the assistant text.
//
// Defense in depth — every request must pass ALL of these:
//   1. Method allowlist            (POST + CORS preflight only)
//   2. Origin / CSRF check         (same-site, localhost, capacitor, or env allowlist)
//   3. Payload size cap            (Content-Length + parsed-size)
//   4. Schema + content validation (roles, lengths, counts)
//   5. Model allowlist             (no arbitrary/expensive models)
//   6. Rate limiting               (per-IP + global ceiling, best-effort)
//   7. Upstream timeout            (no hung sockets)
//   8. Error sanitisation          (never leak the key, upstream body, or stack)
// ===========================================================================

const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions';

// Only these models may be requested through the proxy. Keeps cost predictable
// and stops a stolen client from pivoting to arbitrary/expensive models.
const ALLOWED_MODELS = new Set([
  'zai-glm-4.7',
  'llama3.1-8b',
  'llama-3.3-70b',
  'llama3.1-70b',
  'qwen-3-32b',
]);
const DEFAULT_MODEL = 'zai-glm-4.7';

// Request limits.
const MAX_BODY_BYTES = 64 * 1024;      // 64 KB hard cap on the whole request
const MAX_MESSAGES = 48;               // turns in one conversation
const MAX_CONTENT_CHARS = 16000;       // per single message
const MAX_TOTAL_CHARS = 40000;         // summed across the conversation
const MAX_TEMPERATURE = 2;
const UPSTREAM_TIMEOUT_MS = 30000;

// ---- Rate limiting (best-effort, per warm instance) -----------------------
// NOTE: serverless instances are ephemeral and may scale horizontally, so this
// is a guard rail, not a hard quota. For a hard quota put a shared store (Vercel
// KV / Upstash) behind RL_* below. It still meaningfully throttles abuse from a
// single source hitting a warm instance.
const RL_WINDOW_MS = 60 * 1000;
const RL_MAX_PER_IP = 20;              // 20 requests / IP / minute
const RL_GLOBAL_MAX = 600;             // safety ceiling / instance / minute
const _ipHits = new Map();             // ip -> { count, resetAt }
let _global = { count: 0, resetAt: 0 };

function rateLimited(ip, now) {
  if (now > _global.resetAt) _global = { count: 0, resetAt: now + RL_WINDOW_MS };
  _global.count++;
  if (_global.count > RL_GLOBAL_MAX) return true;

  let rec = _ipHits.get(ip);
  if (!rec || now > rec.resetAt) { rec = { count: 0, resetAt: now + RL_WINDOW_MS }; _ipHits.set(ip, rec); }
  rec.count++;
  // opportunistic cleanup so the map can't grow unbounded
  if (_ipHits.size > 5000) for (const [k, v] of _ipHits) if (now > v.resetAt) _ipHits.delete(k);
  return rec.count > RL_MAX_PER_IP;
}

// ---- Origin / CSRF ---------------------------------------------------------
function envAllowlist() {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}
function originAllowed(origin, host) {
  // No Origin header → not a browser cross-site request (native app, server,
  // curl). Ambient-credential CSRF doesn't apply here; the other layers still do.
  if (!origin) return true;
  const allow = envAllowlist();
  if (allow.length && allow.includes(origin)) return true;
  if (/^capacitor:\/\/localhost$/.test(origin)) return true;     // iOS/Android webview
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true; // local dev
  // Same-site: the request's Origin host equals the host serving this function.
  try { if (host && new URL(origin).host === host) return true; } catch {}
  return false;
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function setSecurityHeaders(res, origin) {
  // Echo the (already-validated) origin so native/cross-origin clients work.
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function fail(res, status, message) {
  res.status(status).json({ error: message });
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 'messages must be a non-empty array';
  if (messages.length > MAX_MESSAGES) return 'too many messages';
  let total = 0;
  for (const m of messages) {
    if (!m || typeof m !== 'object') return 'invalid message';
    if (m.role !== 'system' && m.role !== 'user' && m.role !== 'assistant') return 'invalid message role';
    if (typeof m.content !== 'string') return 'message content must be a string';
    if (m.content.length > MAX_CONTENT_CHARS) return 'message too long';
    total += m.content.length;
  }
  if (total > MAX_TOTAL_CHARS) return 'conversation too long';
  return null;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const host = req.headers.host || '';

  // 2. Origin / CSRF — decided first so even preflight is honest.
  const allowed = originAllowed(origin, host);

  // 1. Method allowlist.
  if (req.method === 'OPTIONS') {
    if (origin && allowed) setSecurityHeaders(res, origin);
    return res.status(allowed ? 204 : 403).end();
  }
  if (req.method !== 'POST') {
    setSecurityHeaders(res, allowed ? origin : '');
    return fail(res, 405, 'method not allowed');
  }
  if (!allowed) {
    setSecurityHeaders(res, '');
    return fail(res, 403, 'origin not allowed');
  }
  setSecurityHeaders(res, origin);

  // Content-Type must be JSON. Blocks "simple" form/navigation CSRF posts (which
  // cannot set an application/json content-type) as an extra layer beyond Origin.
  const ctype = String(req.headers['content-type'] || '').toLowerCase();
  if (!ctype.includes('application/json')) return fail(res, 415, 'unsupported media type');

  // Secret must exist (configured in Vercel env, never in the repo).
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) return fail(res, 503, 'AI is not configured on the server');

  // 3. Size cap (cheap pre-check on the declared length).
  const declared = Number(req.headers['content-length'] || 0);
  if (declared && declared > MAX_BODY_BYTES) return fail(res, 413, 'payload too large');

  // 6. Rate limit.
  if (rateLimited(clientIp(req), Date.now())) {
    res.setHeader('Retry-After', '60');
    return fail(res, 429, 'too many requests — slow down a moment');
  }

  // Parse body (Vercel usually pre-parses JSON; handle string/buffer too).
  let body = req.body;
  try {
    if (typeof body === 'string') body = JSON.parse(body);
    else if (Buffer.isBuffer(body)) body = JSON.parse(body.toString('utf8'));
  } catch { return fail(res, 400, 'invalid JSON'); }
  if (!body || typeof body !== 'object') return fail(res, 400, 'invalid request body');

  // 3b. Size cap on the actual parsed payload (covers chunked/unspecified length).
  try { if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) return fail(res, 413, 'payload too large'); } catch {}

  // 4. Schema validation.
  const msgErr = validateMessages(body.messages);
  if (msgErr) return fail(res, 400, msgErr);

  // 5. Model allowlist.
  const model = typeof body.model === 'string' && ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;

  let temperature = Number(body.temperature);
  if (!Number.isFinite(temperature)) temperature = 0.7;
  temperature = Math.max(0, Math.min(MAX_TEMPERATURE, temperature));

  const upstreamBody = { model, messages: body.messages, temperature };
  if (body.response_format && body.response_format.type === 'json_object') {
    upstreamBody.response_format = { type: 'json_object' };
  }

  // 7. Upstream call with a hard timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(CEREBRAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify(upstreamBody),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = e && e.name === 'AbortError';
    return fail(res, aborted ? 504 : 502, aborted ? 'AI request timed out' : 'could not reach the AI service');
  }
  clearTimeout(timer);

  // 8. Error sanitisation — map upstream status to a safe client status, never
  // forward the upstream body (could echo prompts/keys/internal detail).
  if (!upstream.ok) {
    if (upstream.status === 429) { res.setHeader('Retry-After', '30'); return fail(res, 429, 'the AI service is busy — try again shortly'); }
    if (upstream.status === 401 || upstream.status === 403) return fail(res, 502, 'AI service rejected the request');
    return fail(res, 502, 'AI service error');
  }

  let data;
  try { data = await upstream.json(); } catch { return fail(res, 502, 'invalid response from AI service'); }
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;

  return res.status(200).json({ content: content || '' });
};
