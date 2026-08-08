# Maison Lunar — Full-Stack Perfume Store

A complete, working e-commerce system for a luxury perfume brand: customer
accounts, a shop with cart and checkout, and an admin dashboard that controls
the entire public site.

Built with **zero npm dependencies** — it runs on Node's built-in HTTP server
and Node's built-in SQLite (`node:sqlite`), so there is nothing to
`npm install`.

![Node](https://img.shields.io/badge/node-%3E%3D22.5-3F9142)
![License](https://img.shields.io/badge/license-MIT-CBB88B)

---

## Quick start (local)

```bash
node server/server.js
```

Open **http://localhost:3000**.

On first run it creates `data/lunar.db`, seeds six sample perfumes, and
creates a default admin account:

| | |
|---|---|
| **Admin URL** | http://localhost:3000/admin/login.html |
| **Email** | `admin@maisonlunar.com` |
| **Password** | `LunarAdmin!2026` |

**Change that password before deploying anywhere public.** Run:

```bash
node server/create-admin.js "Your Name" you@example.com "YourStrongPass1"
```

Requires **Node 22.5+** (for built-in SQLite). Check with `node -v`.

---

## Publishing to GitHub

```bash
cd maison-lunar
git init
git add .
git commit -m "Initial commit: Maison Lunar perfume store"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/maison-lunar.git
git push -u origin main
```

Create the empty repo on github.com first (don't tick "add a README" —
this project already has one).

`.gitignore` already excludes the database, uploaded images, and `.env`, so
no customer data or secrets get committed.

### GitHub Pages: read this first

GitHub Pages only serves static files — it cannot run a Node server. So
there are two ways to publish, and they give you different things:

| | **Option A — Pages demo** | **Option B — Pages + real backend** |
|---|---|---|
| Cost | Free | Free tier available |
| Real database | No (browser localStorage) | Yes (SQLite) |
| Real authentication | **No** | Yes |
| Admin area | UI preview only | Genuinely protected |
| Emails send | No | Yes |
| Data shared between visitors | No | Yes |
| Good for | Showing the design off | An actual store |

**Both are included and both are tested.** Pick based on what you need.

---

## Option A — publish the demo to GitHub Pages

```bash
npm run build:static     # or: node build-static.js
git add docs && git commit -m "Build static demo" && git push
```

Then either:
- **Settings → Pages → Source: "GitHub Actions"** — the included
  `.github/workflows/pages.yml` rebuilds and publishes on every push, or
- **Settings → Pages → Source: main branch, /docs folder** — serves the
  committed `docs/` directory directly.

Your site appears at `https://YOUR-USERNAME.github.io/maison-lunar/`.

### Be clear on what the demo is not

The build injects `public/js/demo-api.js`, which intercepts `fetch()` and
answers from `localStorage` so the identical frontend runs with no server.
That means:

- **It is not real authentication.** Everything runs in the visitor's own
  browser, so anyone can read or edit the "database" from devtools. The
  admin login there is a UI preview, not a security boundary. Don't put
  anything private in it, and don't reuse a real password.
- **Data is per-visitor** and vanishes when they clear browser storage.
  Nothing is shared between people.
- **No emails are sent.**

The demo shows a permanent banner saying so, plus a "Reset demo data" link,
so nobody mistakes it for a live store.

---

## Option B — Pages frontend + real backend (recommended for a real store)

Keep GitHub Pages for the frontend, run the Node backend on a host that can
actually execute it:

1. Deploy the backend (see the table below) and note its URL, e.g.
   `https://maison-lunar.onrender.com`.
2. On the backend, set these environment variables:
   ```
   ALLOWED_ORIGINS=https://YOUR-USERNAME.github.io
   CROSS_SITE_COOKIES=true
   NODE_ENV=production
   ```
   (`CROSS_SITE_COOKIES` makes the session cookie `SameSite=None; Secure`,
   which browsers require for cross-site logins. Your backend must be
   HTTPS — Render and Fly both are by default.)
3. In `public/js/config.js`, point the frontend at it:
   ```js
   window.LUNAR_API_BASE = 'https://maison-lunar.onrender.com';
   ```
4. Rebuild without demo mode and push:
   ```bash
   node build-static.js
   ```
   then delete the `window.LUNAR_DEMO = true;` line the build injects, or
   simply serve `public/` from the backend instead.

Simplest variant: skip Pages entirely and let the backend serve its own
frontend (it already does) — one URL, no CORS, nothing to configure.

---

## Deploying the backend


| Host | Free tier | Config included | Notes |
|---|---|---|---|
| **Render** | Yes | `render.yaml` | Easiest. Free tier sleeps after inactivity and has **no persistent disk** (see below). |
| **Fly.io** | Small free allowance | `fly.toml` + `Dockerfile` | Supports a persistent volume on free/cheap plans. Best for keeping data. |
| **Railway** | Trial credit | `Procfile` | Very simple; add a volume mounted at `/app/data`. |
| **Any VPS / Docker** | — | `Dockerfile` | Full control. |

### Render (quickest)

1. Push to GitHub (above).
2. Go to Render → **New → Blueprint** → select your repo.
3. Render reads `render.yaml` and deploys.
4. In the service's **Environment** tab, add `RESEND_API_KEY` if you want
   emails to send (see below).

### Fly.io (best if you want data to persist on a budget)

```bash
fly launch --no-deploy          # edit the app name in fly.toml if taken
fly volumes create lunar_data --size 1
fly secrets set RESEND_API_KEY=your_key_here
fly deploy
```

### ⚠️ About data persistence

The database is a file (`data/lunar.db`). On hosts with an **ephemeral
filesystem** (Render free tier, most serverless platforms), that file is
wiped on every restart or redeploy — meaning **customer accounts, orders,
and uploaded images will disappear**, and the sample data re-seeds.

That's fine for a demo. For anything real, either:

- attach a persistent disk/volume mounted at the app's `data/` directory
  (the `render.yaml` and `fly.toml` here both show how), **or**
- swap SQLite for a hosted Postgres. `server/db.js` is the only file with
  SQL in it, so this is a contained change.

---

## Making emails actually send

The app works fully without this — contact messages save to the database and
all account flows succeed — but no real email leaves the server until you
connect a provider.

1. Create a free account at [resend.com](https://resend.com).
2. Verify a sending domain, or use their `onboarding@resend.dev` test sender
   while developing.
3. Create an API key.
4. Set it as an environment variable on your host (**never commit it**):
   - Render: Environment tab → `RESEND_API_KEY`
   - Fly: `fly secrets set RESEND_API_KEY=...`
   - Locally: copy `.env.example` → `.env`, fill it in, then
     `export $(cat .env | xargs) && node server/server.js`

The key is read only in `server/utils.js` on the server and is never sent to
the browser. With no key set, the UI honestly says the message was saved but
not emailed, rather than faking a success.

Emails sent: contact form → business inbox, welcome on signup, password
reset link, order confirmation.

---

## What's included

**Customer site**
- Homepage with hero, about, services, why-us, gallery, testimonials, contact
- Shop with search + filters (Men's / Women's / Unisex / Best Sellers / New)
- Product pages with fragrance-note pyramid, size selector, quantity, related items
- Cart: add, remove, change quantity, live totals
- Checkout creating a real order and decrementing stock
- Signup / login (show-hide password, remember me, forgot password), account
  dashboard with order history

**Admin dashboard** (`/admin/login.html`)
- Stats: products, customers, orders, revenue, recent activity
- Products: full CRUD, image upload, sizes & prices, notes, stock,
  Featured / Best Seller / New Arrival flags
- Orders: view details, search, filter, update status
- Customers: view profiles + order history, enable/disable accounts
- Website Content: edit homepage headline/description, about, contact,
  footer, testimonials, promo banner — changes appear on the live site
  immediately
- Appearance: accent colour, secondary green, background, logo text,
  favicon, hero image, site title
- Messages: inbox for contact submissions, read/unread, delete

---

## Security (what's actually implemented)

- Passwords hashed with **scrypt** + a per-user random salt, verified with a
  constant-time comparison. Nothing stored in plain text.
- Sessions are random 32-byte tokens stored **server-side** in a `sessions`
  table (not JWTs), so logout genuinely revokes access. Cookies are
  `HttpOnly` + `SameSite=Lax`, and `Secure` when `NODE_ENV=production`.
- **Customer and admin sessions use separate cookies.** A customer session is
  never accepted on any `/api/admin/*` route — enforced centrally in
  `server/server.js`, not per-page, and not by hiding buttons.
- Login rate-limited per IP+email (8 attempts / 15 min) on both customer and
  admin logins.
- Forgot-password never reveals whether an email exists. Reset tokens expire
  in 30 minutes, are single-use, and resetting invalidates all that user's
  sessions.
- Uploaded images validated by content type and capped at 3MB.
- Server-side validation on every write endpoint.
- Honeypot field silently drops contact-form spam bots.

---

## Verified working

Every flow below was tested end-to-end in a real browser (Playwright), not
just written and assumed — 43/43 passing with zero JavaScript errors:

signup · signup validation · duplicate-email rejection · login · remember me ·
logout · all 6 shop filters · shop search · product page · size switching ·
related products · invalid-slug handling · add to cart · cart increment ·
cart decrement · cart removal · empty-cart checkout blocked · checkout ·
order in account history · contact form validation · honeypot spam drop ·
forgot password · reset-token handling · admin wrong-password rejection ·
**customer credentials rejected at admin login** · admin login · all 7 admin
pages · order appears in admin · order status update · customer list ·
customer detail · disable customer · **disabled customer cannot log in** ·
re-enable · appearance change applied to public site · content change applied
to public site · product create / edit price / delete · messages inbox ·
mark read / unread · delete message · admin logout · **all 8 admin API
routes return 401 when logged out**

The static Pages demo was tested separately and independently — served from
a subpath (`/maison-lunar/`) exactly as GitHub Pages does — with **33/33
passing and zero JavaScript errors**, covering browsing, filters, search,
cart, checkout, signup, contact, and the full admin CRUD round trip
including changes appearing on the public pages.

Run the CI smoke test yourself — `.github/workflows/ci.yml` boots the server
on every push and fails the build if the admin API isn't returning 401.

---

## Project structure

```
server/
  server.js          entry point — HTTP, sessions, static files, /healthz
  db.js              SQLite schema + seed data  (only file containing SQL)
  auth.js            password hashing, sessions, rate limiting
  router.js          tiny dependency-free router
  utils.js           cookies, body parsing, static files, email sending
  create-admin.js    CLI to create/promote admin accounts
  routes/api.js      customer API (auth, shop, cart, contact)
  routes/admin.js    admin-only API
build-static.js      generates the static GitHub Pages demo into docs/
docs/                the built static demo (committed, served by Pages)
public/
  css/theme.css      the green/gold design system
  js/config.js       API base + site base URL (edit for split hosting)
  js/demo-api.js     browser-side mock API — DEMO BUILD ONLY
  js/api.js, nav.js  shared frontend helpers
  index, shop, product, cart, login, reset-password, account .html
  admin/             login, dashboard, products, orders, customers,
                     content, appearance, messages
data/                created at runtime (gitignored): lunar.db, uploads/
```

---

## Known limitations

- **No payment processor.** Checkout creates a real order and decrements
  stock, but doesn't charge a card — that needs your own Stripe/PayPal
  account and keys. Adding Stripe Checkout on top of this is a small change.
- `node:sqlite` is still marked **experimental** in Node. It's been reliable
  in testing, but pin your Node version in production.
- Uploads go to local disk — see the persistence note above.
- No HTTPS termination built in; put it behind a reverse proxy or use a host
  that terminates TLS for you (Render, Fly, and Railway all do).

## License

MIT — see [LICENSE](LICENSE).
