# Security

Anchor is a privacy-first, on-device wellness app. This document describes its
threat model, the protections in place, and how to operate it safely.

## ⚠️ One-time action required: rotate the leaked key

A Cerebras API key was previously hard-coded in the client (`www/js/llm.js`) and
is therefore present in git history. **It must be treated as compromised:**

1. Revoke/rotate it in the Cerebras dashboard. The old value is now dead.
2. Put the **new** key only in server env vars — never in the repo:
   - Local: copy `.env.example` → `.env` and set `CEREBRAS_API_KEY`.
   - Production: Vercel → Project → Settings → Environment Variables.

The client no longer contains any key.

## Architecture

```
Browser / iPhone app  ──HTTPS──▶  /api/chat (serverless)  ──HTTPS──▶  Cerebras
   (no secret)                      (holds CEREBRAS_API_KEY)
```

The API key lives **only** in the server function's environment. The client
posts a conversation; the server authenticates, validates, attaches the key, and
returns only the assistant text. Users may optionally supply *their own* key in
Settings (stored on-device), in which case their browser calls Cerebras directly
with their key — the app's shared key is never involved.

## Protections

### Secrets
- No API key shipped in any client file or app binary.
- `.env`, `.env.*`, and `.vercel/` are gitignored; only `.env.example` is tracked.

### Server proxy (`api/chat.js`) — defense in depth
Every request must pass all of:
1. **Method allowlist** — only `POST` (+ CORS preflight).
2. **Origin / CSRF check** — same-site, `localhost`, `capacitor://localhost`, or
   an explicit `ALLOWED_ORIGINS` list. Cross-site browser requests are rejected.
3. **Payload cap** — 64 KB (checked on both `Content-Length` and parsed size).
4. **Schema + content validation** — roles, per-message and total length, count.
5. **Model allowlist** — arbitrary/expensive models are rejected.
6. **Rate limiting** — per-IP (20/min) and a global ceiling, best-effort.
7. **Upstream timeout** — 30 s, no hung sockets.
8. **Error sanitisation** — upstream bodies, keys, and stacks are never returned.

> The rate limiter is in-memory and therefore per warm instance. For a hard
> quota, back it with Vercel KV / Upstash (see the `RL_*` constants).

### HTTP headers (`vercel.json`)
- **Content-Security-Policy** — `default-src 'self'`; scripts limited to self +
  Google Identity; `object-src 'none'`; `frame-ancestors 'none'`;
  `upgrade-insecure-requests`.
- **Strict-Transport-Security** — 2 years, `includeSubDomains; preload`.
- **X-Frame-Options: DENY** + CSP `frame-ancestors 'none'` — clickjacking.
- **X-Content-Type-Options: nosniff**, **Referrer-Policy**,
  hardened **Permissions-Policy**, **COOP**, **CORP**.
- `/api/*` responses are `no-store`.

### Client
- DOM is built with `textContent` / `createElement`; user and AI text is never
  injected as HTML. The only `innerHTML` use is trusted static icon markup, so
  there is no DOM-XSS sink for untrusted data.
- All external links use `rel="noopener noreferrer"`.

### Passcode lock (`www/js/auth.js`)
- **PBKDF2-SHA256**, 210 000 iterations, per-account random salt; only the hash
  and salt are stored, and verification compares in constant time.
- **Brute-force lockout** — after a few wrong tries, each further miss triggers
  an exponentially growing lockout (15 s → 30 s → … capped at 15 min). The
  counter is persisted, so reloading the page can't reset it, and it clears on
  the next correct unlock. This is what makes guessing a 4-digit PIN impractical.
- **Auto-lock** (`www/js/app.js`) — the app re-requires the passcode after it
  has been backgrounded for more than ~45 s, or after ~5 min of inactivity while
  open. Only engages when a passcode is set; data is never touched, only the UI
  is re-gated.

## On-device data & known considerations
- All wellness data stays in the device's `localStorage`. Nothing is uploaded
  except the text a user explicitly sends for AI reflection.
- The optional 4-digit passcode is a lightweight local lock, not encryption.
  Anyone with unlocked physical access + dev tools can read `localStorage`; this
  is inherent to on-device storage and is by design (no cloud to breach).

## No system is unbreakable
These layers eliminate the realistic remote attack surface (secret exposure,
CSRF, XSS, clickjacking, transport downgrade, model/cost abuse, request
flooding). Security is ongoing: rotate keys periodically, keep dependencies
patched (`npm audit`), and review `ALLOWED_ORIGINS` for your domains.

## Reporting
Report vulnerabilities privately to the maintainer rather than opening a public
issue.
