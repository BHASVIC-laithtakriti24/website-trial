# Maison Lunar

Small-batch fragrance storefront: shop, accounts, cart, checkout, verified-purchase
reviews, and a studio dashboard.

Node's standard library only. **No npm install. No dependencies.**

---

## Run it

Requires **Node 22.5 or newer** (`node --version`).

```bash
cd maison-lunar
npm start
```

Open <http://localhost:3000>.

On the very first run the server creates an admin account and prints the password
to the terminal **once**. Save it. To choose your own instead:

```bash
ML_ADMIN_PASSWORD='your-long-random-password' npm start
```

### Run the tests

```bash
npm test
```

182 tests: 125 against the API (including attack attempts) and 57 that render
every page. All should pass before you deploy.

---

## Try it end to end

1. **Browse** — home page, then Shop, then click into a perfume.
2. **Sign up** — Login / Sign Up → Sign Up tab. Password needs 8+ characters
   with a letter and a number.
3. **Refresh the page.** You are still signed in. That is the session cookie
   working; it lasts 30 days.
4. **Buy something** — add to cart, Checkout. Use test card `4111 1111 1111 1111`,
   any future expiry, any 3 digits. No money moves (see *Payments* below).
5. **Review it** — go to My Account. The perfume you just bought appears under
   *Awaiting your review*. Click through, pick a star rating, write a few words,
   publish. It appears on the product page with a **Verified purchase** badge.
6. **Try to cheat** — open a perfume you have *not* bought. There is no review
   form, only an explanation. That check is enforced on the server, not just hidden.
7. **Sign in as admin** — same Login form, using the admin email and the password
   from step 1. You land on the dashboard. Browse back to the site and you will
   see a `+` beside anything editable.

---

## Project layout

```
server.js            HTTP server: routing, static files, cookies, CSRF
lib/db.js            SQLite schema, seed data, housekeeping
lib/auth.js          Password hashing (scrypt), tokens, cookies
lib/security.js      Security headers, rate limiting, input validation
lib/routes.js        Every API endpoint and all business logic
public/index.html    Page shell
public/app.js        Storefront: shop, cart, checkout, account, reviews
public/admin.js      Studio dashboard (served only to signed-in admins)
public/styles.css    All styling
data/                SQLite database — never commit this
test.js              API and security tests
test-client.js       Page render tests
```

---

## Security: what is and is not true

**You cannot hide HTML, CSS or JavaScript from a browser.** The browser has to
receive that code in order to display the page, so anyone can read it with View
Source or devtools. Nothing changes that. Tools that claim to "protect" your
source only obfuscate it, which slows a curious person down and stops a
determined one for exactly zero seconds.

What protects a site is making the client code **worthless to read**. That is how
this is built:

- `public/app.js` holds no data and no authority. Prices, stock, sessions,
  orders and permissions all live on the server.
- Every permission is re-checked server-side on **every** request. Nothing is
  trusted because the page said so.
- `public/admin.js` returns **404** unless the request carries an admin session
  cookie, so an ordinary visitor never receives the dashboard code at all. That
  is a convenience, not the boundary — the endpoints it calls enforce admin
  rights independently.

Reading this source tells an attacker nothing they could not learn by using the
site normally. That is the goal.

### What is actually enforced

| Threat | Defence | Tested |
|---|---|---|
| Stolen database | Passwords stored as scrypt hashes with per-user salts | ✓ |
| SQL injection | Every query is a prepared statement with bound parameters | ✓ |
| Cross-site request forgery | Double-submit token + same-origin check on all writes | ✓ |
| Cross-site scripting | Strict CSP (no inline scripts), all output escaped | ✓ |
| Session theft via JS | Session cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production | ✓ |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | ✓ |
| Price tampering | Prices are re-read from the database at add-to-cart and at checkout | ✓ |
| Privilege escalation | Admin rights re-checked on every admin endpoint | ✓ |
| Editing others' data | Carts, orders and reviews scoped to their owner | ✓ |
| Path traversal | Resolved paths verified to stay inside `public/` | ✓ |
| Password brute force | Rate limited per account and per IP | ✓ |
| User enumeration | Identical error and timing for unknown vs. wrong password | ✓ |
| Card data exposure | Only brand + last 4 stored; full number and CVC never written | ✓ |
| Request flooding | Global per-IP rate limit; request and body size caps | ✓ |

### Payments

Cards are validated (Luhn check, expiry, CVC format) and then discarded. Only the
brand and last four digits are kept, which is what a receipt shows. **No money
moves.** Taking real payments needs a processor — use Stripe Checkout and do not
hand-roll it. `routes['POST /api/checkout']` in `lib/routes.js` is where it plugs in.

### Email

The contact form saves to the dashboard inbox but does not send email yet. Add an
SMTP provider (Postmark, Resend, SES) when you want notifications.

---

## Going live on your domain

### 1. Get a server

Any small VPS works (Hetzner, DigitalOcean, Fly.io). Install Node 22+, copy the
folder up, run `npm test` to confirm it is healthy.

### 2. HTTPS is not optional

`Secure` cookies and HSTS only switch on with `NODE_ENV=production`, and they
require HTTPS. Setting production mode without HTTPS will break logins.

The simplest path is Caddy, which gets and renews certificates automatically.
`/etc/caddy/Caddyfile`:

```
yourdomain.com, www.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Point your domain's A record at the server's IP, then `systemctl reload caddy`.

### 3. Environment

Copy `.env.example` and fill it in:

```bash
NODE_ENV=production
PORT=3000
ML_ADMIN_EMAIL=you@yourdomain.com
ML_ADMIN_PASSWORD=<long random string>
ML_TRUST_PROXY=1          # only because Caddy sits in front
ML_DATA_DIR=/var/lib/maison-lunar
```

`ML_TRUST_PROXY=1` makes rate limiting read `X-Forwarded-For`. Only set it when a
proxy you control is in front — otherwise anyone can spoof their IP and dodge
the limits.

### 4. Keep it running

`/etc/systemd/system/maison-lunar.service`:

```ini
[Unit]
Description=Maison Lunar
After=network.target

[Service]
Type=simple
User=maisonlunar
WorkingDirectory=/opt/maison-lunar
EnvironmentFile=/opt/maison-lunar/.env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/maison-lunar

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now maison-lunar
```

### 5. Back up the database

`data/maison-lunar.db` is your entire business — customers, orders, reviews.
`npm run backup` makes a dated copy. Put it on a cron job and copy it off the
server:

```
0 3 * * * cd /opt/maison-lunar && npm run backup
```

### Go-live checklist

- [ ] `npm test` passes on the server
- [ ] HTTPS working, `http://` redirects to `https://`
- [ ] `NODE_ENV=production` set
- [ ] Admin password is long, random, and stored in a password manager
- [ ] `ML_TRUST_PROXY` set only if a proxy is in front
- [ ] `data/` is not in version control (`.gitignore` covers it)
- [ ] Backups running and restore tested at least once
- [ ] Real products, prices and stock entered via the dashboard
- [ ] Contact email set under Website Settings
- [ ] Privacy policy and terms written — you are storing customer data now

---

## Dashboard

Sign in as admin, then use the sidebar.

| Page | What it does |
|---|---|
| Dashboard | Revenue, orders, customers, reviews, low stock, recent orders |
| Perfumes | Add, edit, hide, delete; sizes and prices |
| Stock | Bulk stock update, low-stock threshold |
| Orders | Every order with items; change status |
| Reviews | All reviews; hide one without deleting it |
| Customers | Accounts, spend, disable an account (signs them out immediately) |
| Categories | Add, rename, delete (blocked while in use) |
| Homepage & Content | Hero copy, about text, promo banner, footer |
| Website Settings | Site name, contact details, social links, colours |
| Messages | Contact form inbox |

You can also edit copy directly on the live site: as an admin, a `+` appears
beside anything editable.

---

## Troubleshooting

**"The site could not reach its server"** — the server is not running. `npm start`.

**`SyntaxError` or "sqlite is not defined"** — Node is older than 22.5. Upgrade.

**Signed out on every refresh in production** — `NODE_ENV=production` is set but
the site is not on HTTPS. `Secure` cookies are dropped over plain HTTP. Fix HTTPS,
or unset the variable while testing.

**Lost the admin password** — stop the server, delete `data/maison-lunar.db`
(this erases everything), and start again with `ML_ADMIN_PASSWORD` set. If you have
real orders, restore from a backup instead and reset the password from the account
page.

**Port already in use** — `PORT=4000 npm start`.
