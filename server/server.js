// server/server.js
// Entry point. Run with:  node server/server.js
// Zero external dependencies — uses Node 22's built-in http server and
// built-in SQLite (node:sqlite). See README.md for full setup notes.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from './router.js';
import { registerApiRoutes } from './routes/api.js';
import { registerAdminRoutes } from './routes/admin.js';
import { parseCookies, serializeCookie, clearCookie, readJsonBody, sendJson, serveStatic } from './utils.js';
import { getUserBySession } from './auth.js';

// This server uses Node's built-in node:sqlite module, only available in
// Node 22.5.0+. On an older Node, importing it throws a cryptic
// ERR_UNKNOWN_BUILTIN_MODULE and the process exits before it ever binds to
// a port — every /api/* call (including admin login) then fails, with no
// obvious clue why. Check the version explicitly and fail loudly instead.
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 5)) {
  console.error('------------------------------------------------------------');
  console.error(`  Maison Lunar needs Node.js 22.5.0 or newer — you have ${process.version}.`);
  console.error('  This server uses the built-in "node:sqlite" module, which');
  console.error('  does not exist in older Node versions.');
  console.error('');
  console.error('  Install a newer Node and try again, e.g. with nvm:');
  console.error('    nvm install 22');
  console.error('    nvm use 22');
  console.error('------------------------------------------------------------');
  process.exit(1);
}

// Imported dynamically, after the version check above, so an old Node
// prints the message above instead of crashing on the node:sqlite import.
const { db } = await import('./db.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');
const PORT = process.env.PORT || 3000;

const router = new Router();
registerApiRoutes(router, db);
registerAdminRoutes(router, db);

const SESSION_COOKIE = 'lunar_session';
const ADMIN_COOKIE = 'lunar_admin_session';

// Cross-origin support. Only needed if you host the frontend separately
// (e.g. GitHub Pages) from this backend. Set ALLOWED_ORIGINS to a
// comma-separated list, e.g.
//   ALLOWED_ORIGINS=https://yourname.github.io
// Left empty (the default), no cross-origin requests are permitted at all,
// which is the safe choice when the server serves its own frontend.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  // Credentials must be allowed so the session cookie travels cross-origin.
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

// Very small, safe security headers applied to every response.
function securityHeaders(res) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  applyCors(req, res);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Health check endpoint for deployment platforms (Render, Fly, Railway,
  // Docker healthchecks). Returns 200 as soon as the server can respond.
  if (pathname === '/healthz') {
    return sendJson(res, 200, { status: 'ok', uptime: Math.round(process.uptime()) });
  }

  // Serve uploaded product images.
  if (pathname.startsWith('/uploads/')) {
    return serveStatic(UPLOADS_DIR, pathname.replace('/uploads', ''), res);
  }

  // API requests
  if (pathname.startsWith('/api/')) {
    const match = router.match(req.method, pathname);
    if (!match) return sendJson(res, 404, { error: 'Not found' });

    const cookies = parseCookies(req);
    const cookiesToSet = [];

    let body = {};
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return sendJson(res, 400, { error: 'Invalid or oversized request body.' });
      }
    }

    const query = Object.fromEntries(url.searchParams.entries());

    const ctx = {
      params: match.params,
      query,
      body,
      cookies,
      origin: `${url.protocol}//${url.host}`,
      user: getUserBySession(db, cookies[SESSION_COOKIE]),
      admin: null,
      setCookie(name, value, opts = {}) {
        // For split hosting (frontend on GitHub Pages, backend elsewhere) the
        // session cookie is cross-site, which browsers only accept with
        // SameSite=None AND Secure. Enable by setting CROSS_SITE_COOKIES=true
        // — this requires HTTPS on the backend.
        const crossSite = process.env.CROSS_SITE_COOKIES === 'true';
        cookiesToSet.push(serializeCookie(name, value, {
          secure: crossSite || process.env.NODE_ENV === 'production',
          sameSite: crossSite ? 'None' : 'Lax',
          ...opts
        }));
      },
      clearCookie(name) {
        cookiesToSet.push(clearCookie(name));
      }
    };

    // Resolve admin session (separate cookie from the customer session).
    const adminUser = getUserBySession(db, cookies[ADMIN_COOKIE]);
    if (adminUser && adminUser.is_admin && adminUser.is_active) ctx.admin = adminUser;

    // Server-side authorization gate for every /api/admin/* route except
    // login and the "am I logged in?" check (which must work when logged out).
    const isAdminRoute = pathname.startsWith('/api/admin/') && pathname !== '/api/admin/login' && pathname !== '/api/admin/me';
    if (isAdminRoute && !ctx.admin) {
      return sendJson(res, 401, { error: 'Admin authentication required.' });
    }

    const finalize = () => {
      if (cookiesToSet.length) res.setHeader('Set-Cookie', cookiesToSet);
    };

    try {
      const originalWriteHead = res.writeHead.bind(res);
      res.writeHead = (code, headers) => {
        finalize();
        res.writeHead = originalWriteHead;
        return res.writeHead(code, headers);
      };
      await match.handler(req, res, ctx);
    } catch (err) {
      console.error('Route error:', err);
      if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error.' });
    }
    return;
  }

  // Static frontend files
  serveStatic(PUBLIC_DIR, pathname, res);
});

server.listen(PORT, () => {
  console.log(`Maison Lunar server running at http://localhost:${PORT}`);
});
