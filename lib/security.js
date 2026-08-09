'use strict';
/* ---------------------------------------------------------------------
   Security middleware: response headers, rate limiting, validation.
   ------------------------------------------------------------------ */

const PROD = process.env.NODE_ENV === 'production';

/* --------------------------- headers -------------------------------- */

const CSP = [
  "default-src 'self'",
  "script-src 'self'",                                  // no inline JS anywhere
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",                        // product images may be hosted anywhere
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",                             // cannot be iframed → no clickjacking
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests"
].join('; ');

function applySecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.removeHeader('X-Powered-By');
  if (PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
}

/* ------------------------- rate limiting ---------------------------- */
/* Sliding window, in memory. Survives a single-process deploy, which is
   what this is. Behind multiple processes you'd move this to the DB. */

const buckets = new Map();

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let hits = buckets.get(key);
  if (!hits) { hits = []; buckets.set(key, hits); }
  while (hits.length && hits[0] <= now - windowMs) hits.shift();
  if (hits.length >= limit) {
    return { ok: false, retryAfter: Math.ceil((hits[0] + windowMs - now) / 1000) };
  }
  hits.push(now);
  return { ok: true, remaining: limit - hits.length };
}

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, hits] of buckets) {
    while (hits.length && hits[0] <= cutoff) hits.shift();
    if (!hits.length) buckets.delete(k);
  }
}, 10 * 60 * 1000).unref();

function clientIp(req) {
  // Behind a reverse proxy set ML_TRUST_PROXY=1 so the real IP is used
  // for rate limiting. Without it we never trust a client-supplied header.
  if (process.env.ML_TRUST_PROXY === '1') {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/* --------------------------- validation ------------------------------ */

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const V = {
  str(v, { min = 0, max = 5000, trim = true } = {}) {
    if (typeof v !== 'string') return null;
    const s = trim ? v.trim() : v;
    if (s.length < min || s.length > max) return null;
    return s;
  },
  email(v) {
    const s = V.str(v, { min: 3, max: 254 });
    if (!s || !EMAIL_RE.test(s)) return null;
    return s.toLowerCase();
  },
  password(v) {
    if (typeof v !== 'string') return null;
    if (v.length < 8 || v.length > 200) return null;
    if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return null;
    return v;
  },
  int(v, { min = -2147483648, max = 2147483647 } = {}) {
    const n = typeof v === 'number' ? v : parseInt(v, 10);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    if (n < min || n > max) return null;
    return n;
  },
  bool(v) { return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0; },
  oneOf(v, allowed) { return allowed.includes(v) ? v : null; }
};

/** Escape for safe embedding in HTML. Used server-side for the few places
 *  we render user content into markup (email templates, admin exports). */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = { applySecurityHeaders, rateLimit, clientIp, V, escapeHtml, PROD };
