'use strict';
/* ---------------------------------------------------------------------
   Maison Lunar — HTTP server.

   Run:   node server.js
   Then:  http://localhost:3000

   Zero npm dependencies. Everything is Node's standard library.
   ------------------------------------------------------------------ */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const { applySecurityHeaders, rateLimit, clientIp, PROD } = require('./lib/security');
const { parseCookies, serializeCookie, randomToken, safeEqual } = require('./lib/auth');
const { routes, HttpError, getSession } = require('./lib/routes');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const COOKIE = {
  session: 'ml_session',
  csrf: 'ml_csrf',
  cart: 'ml_cart',
  recent: 'ml_recent'
};

const baseCookieOpts = { path: '/', sameSite: 'Lax', secure: PROD };

/* -------------------------- static files ---------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

const staticCache = new Map();

async function readStatic(rel) {
  // Resolve, then verify the result is still inside PUBLIC_DIR. This is what
  // stops "../../etc/passwd" style path traversal.
  const full = path.resolve(PUBLIC_DIR, '.' + path.posix.normalize('/' + rel));
  if (full !== PUBLIC_DIR && !full.startsWith(PUBLIC_DIR + path.sep)) return null;

  const cached = staticCache.get(full);
  try {
    const stat = await fsp.stat(full);
    if (!stat.isFile()) return null;
    const etag = `W/"${stat.size}-${stat.mtimeMs.toString(36)}"`;
    if (cached && cached.etag === etag) return cached;
    const body = await fsp.readFile(full);
    const entry = { body, etag, type: MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' };
    staticCache.set(full, entry);
    return entry;
  } catch {
    return null;
  }
}

/* ---------------------------- responses ----------------------------- */

function sendJson(res, status, obj, cookies) {
  const body = Buffer.from(JSON.stringify(obj));
  if (cookies && cookies.length) res.setHeader('Set-Cookie', cookies);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendText(res, status, text) {
  const body = Buffer.from(text);
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length });
  res.end(body);
}

/* --------------------------- body parsing --------------------------- */

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let over = false;
    req.on('data', (c) => {
      if (over) return;
      size += c.length;
      if (size > limitBytes) {
        over = true;
        chunks.length = 0;
        // Stop buffering but keep draining, so we can still send a clean
        // 413 instead of hanging up mid-upload.
        req.resume();
        reject(new HttpError(413, 'That request was too large.'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* ----------------------------- request ------------------------------ */

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  applySecurityHeaders(res);

  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return sendText(res, 400, 'Bad request');
  }
  const pathname = decodeURIComponent(url.pathname);
  const method = req.method.toUpperCase();
  const ip = clientIp(req);
  const cookies = parseCookies(req.headers.cookie);
  const outCookies = [];

  // Blanket rate limit — cheap protection against floods.
  const flood = rateLimit(`all:${ip}`, 600, 60 * 1000);
  if (!flood.ok) {
    res.setHeader('Retry-After', String(flood.retryAfter));
    return sendJson(res, 429, { error: 'Too many requests. Slow down a moment.' });
  }

  if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  /* -------- session + cart identity -------- */
  const sessionToken = cookies[COOKIE.session] || null;
  const session = getSession(sessionToken);
  if (sessionToken && !session) {
    outCookies.push(serializeCookie(COOKIE.session, '', { ...baseCookieOpts, httpOnly: true, maxAge: 0 }));
  }

  let cartCookie = cookies[COOKIE.cart];
  if (!cartCookie || !/^g:[A-Za-z0-9_-]{16,64}$/.test(cartCookie)) {
    cartCookie = 'g:' + randomToken(16);
    outCookies.push(serializeCookie(COOKIE.cart, cartCookie, {
      ...baseCookieOpts, httpOnly: true, maxAge: 60 * 60 * 24 * 30
    }));
  }
  const cartKey = session ? `u:${session.user_id}` : cartCookie;

  /* -------- CSRF token -------- */
  let csrf = cookies[COOKIE.csrf];
  if (!csrf || csrf.length < 20) {
    csrf = randomToken(24);
    // Readable by JS on purpose: the client echoes it back in a header.
    // An attacker's site cannot read it (different origin) and cannot set
    // the header on a cross-site form post.
    outCookies.push(serializeCookie(COOKIE.csrf, csrf, {
      ...baseCookieOpts, httpOnly: false, maxAge: 60 * 60 * 24 * 7
    }));
  }

  /* -------- static + pages -------- */
  if (method === 'GET' || method === 'HEAD') {
    if (pathname === '/admin.js') {
      // The admin interface is never sent to a browser that is not signed in
      // as an admin. Not hidden — actually withheld.
      if (!session || !session.is_admin) {
        if (outCookies.length) res.setHeader('Set-Cookie', outCookies);
        return sendText(res, 404, 'Not found');
      }
    }

    if (!pathname.startsWith('/api/')) {
      const rel = pathname === '/' ? '/index.html' : pathname;
      let file = await readStatic(rel);
      // Single-page app: unknown non-asset paths fall back to index.html.
      if (!file && !path.extname(rel)) file = await readStatic('/index.html');
      if (file) {
        if (outCookies.length) res.setHeader('Set-Cookie', outCookies);
        res.setHeader('ETag', file.etag);
        res.setHeader('Cache-Control', rel.endsWith('.html') ? 'no-cache' : 'public, max-age=300');
        if (req.headers['if-none-match'] === file.etag) { res.writeHead(304); return res.end(); }
        res.writeHead(200, { 'Content-Type': file.type, 'Content-Length': file.body.length });
        return res.end(method === 'HEAD' ? undefined : file.body);
      }
      if (outCookies.length) res.setHeader('Set-Cookie', outCookies);
      return sendText(res, 404, 'Not found');
    }
  }

  /* -------- API -------- */
  const routeKey = `${method} ${pathname}`;
  const handler = routes[routeKey];

  if (!handler) {
    if (outCookies.length) res.setHeader('Set-Cookie', outCookies);
    return sendJson(res, 404, { error: 'Unknown endpoint.' });
  }

  let body = {};
  if (method === 'POST') {
    /* ---- CSRF: same-origin check + double-submit token ---- */
    const origin = req.headers.origin;
    if (origin) {
      let originHost = null;
      try { originHost = new URL(origin).host; } catch {}
      if (originHost !== req.headers.host) {
        return sendJson(res, 403, { error: 'Cross-site request blocked.' });
      }
    }
    const sent = req.headers['x-csrf-token'];
    if (!sent || !cookies[COOKIE.csrf] || !safeEqual(sent, cookies[COOKIE.csrf])) {
      if (outCookies.length) res.setHeader('Set-Cookie', outCookies);
      return sendJson(res, 403, { error: 'Your session expired. Refresh the page and try again.' });
    }

    const limit = pathname.startsWith('/api/admin/') ? 8 * 1024 * 1024 : 256 * 1024;
    try {
      const raw = await readBody(req, limit);
      if (raw.length) {
        const ctype = String(req.headers['content-type'] || '');
        if (!ctype.includes('application/json')) {
          return sendJson(res, 415, { error: 'Send JSON.' });
        }
        body = JSON.parse(raw.toString('utf8'));
        if (body === null || typeof body !== 'object' || Array.isArray(body)) body = {};
      }
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 400;
      if (status === 413) res.setHeader('Connection', 'close');
      return sendJson(res, status, { error: e instanceof HttpError ? e.message : 'Could not read that request.' });
    }
  }

  /* ---- recent guest orders (lets a guest see the receipt they just made) ---- */
  let recentOrders = [];
  try {
    recentOrders = JSON.parse(cookies[COOKIE.recent] || '[]');
    if (!Array.isArray(recentOrders)) recentOrders = [];
    recentOrders = recentOrders.filter(x => typeof x === 'string').slice(0, 10);
  } catch { recentOrders = []; }

  const ctx = {
    req, res, url, body, ip,
    query: Object.fromEntries(url.searchParams),
    session, sessionToken, cartKey, csrf, recentOrders,
    setSession(token) {
      outCookies.push(serializeCookie(COOKIE.session, token, {
        ...baseCookieOpts, httpOnly: true, maxAge: 60 * 60 * 24 * 30
      }));
    },
    clearSession() {
      outCookies.push(serializeCookie(COOKIE.session, '', { ...baseCookieOpts, httpOnly: true, maxAge: 0 }));
    },
    rememberOrder(orderNumber) {
      const next = [orderNumber, ...recentOrders.filter(n => n !== orderNumber)].slice(0, 10);
      outCookies.push(serializeCookie(COOKIE.recent, JSON.stringify(next), {
        ...baseCookieOpts, httpOnly: true, maxAge: 60 * 60 * 24 * 30
      }));
    }
  };

  try {
    const result = await handler(ctx);
    if (routeKey === 'POST /api/checkout' && result && result.order_number) {
      ctx.rememberOrder(result.order_number);
    }
    return sendJson(res, 200, result ?? { ok: true }, outCookies);
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 429) res.setHeader('Retry-After', '60');
      return sendJson(res, e.status, { error: e.message, field: e.field }, outCookies);
    }
    // Unexpected: log the detail server-side, tell the client nothing useful.
    const ref = crypto.randomBytes(4).toString('hex');
    console.error(`[${new Date().toISOString()}] ${ref} ${routeKey}`, e);
    return sendJson(res, 500, { error: `Something went wrong on our side. Reference ${ref}.` }, outCookies);
  } finally {
    if (process.env.ML_LOG === '1') {
      console.log(`${method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  }
});

server.headersTimeout = 20000;
server.requestTimeout = 30000;
server.keepAliveTimeout = 10000;

server.listen(PORT, HOST, () => {
  console.log(`\n  Maison Lunar running at http://localhost:${PORT}`);
  console.log(`  Mode: ${PROD ? 'production' : 'development'}`);
  console.log(`  Admin: http://localhost:${PORT}/#/admin\n`);
});

process.on('SIGINT', () => { console.log('\nShutting down.'); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => server.close(() => process.exit(0)));
