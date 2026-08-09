'use strict';
/* ---------------------------------------------------------------------
   End-to-end tests. Starts a real server, drives it over real HTTP.

   Run:  node test.js
   ------------------------------------------------------------------ */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = path.join(__dirname, 'data', '_test');

let passed = 0, failed = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { failed++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail ? ' — ' + detail : ''}`); }
}
function section(t) { console.log(`\n\x1b[1m${t}\x1b[0m`); }

/* ------------------------- tiny cookie jar -------------------------- */

class Client {
  constructor() { this.jar = new Map(); }
  cookieHeader() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  store(res) {
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      const maxAge = attrs.find(a => a.trim().toLowerCase().startsWith('max-age='));
      if (maxAge && maxAge.split('=')[1].trim() === '0') this.jar.delete(k);
      else this.jar.set(k, v);
      this.lastSetCookie = this.lastSetCookie || {};
      this.lastSetCookie[k] = c;
    }
  }
  csrf() { return decodeURIComponent(this.jar.get('ml_csrf') || ''); }

  async raw(pathname, opts = {}) {
    const headers = Object.assign({}, opts.headers);
    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(BASE + pathname, { ...opts, headers, redirect: 'manual' });
    this.store(res);
    return res;
  }
  async get(pathname) {
    const res = await this.raw(pathname);
    let body = null;
    try { body = await res.json(); } catch {}
    return { status: res.status, body, res };
  }
  async post(pathname, data, override = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'X-CSRF-Token': override.csrf !== undefined ? override.csrf : this.csrf(),
      ...(override.headers || {})
    };
    if (override.noCsrf) delete headers['X-CSRF-Token'];
    const res = await this.raw(pathname, { method: 'POST', headers, body: JSON.stringify(data ?? {}) });
    let body = null;
    try { body = await res.json(); } catch {}
    return { status: res.status, body, res };
  }
}

/* ------------------------------ runner ------------------------------ */

(async function run() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  const child = spawn(process.execPath, ['--no-warnings', 'server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), ML_DATA_DIR: TMP, ML_ADMIN_PASSWORD: 'StudioPass123', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  child.stdout.on('data', d => { serverLog += d; });
  child.stderr.on('data', d => { serverLog += d; });

  // wait for listen
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + '/api/bootstrap'); break; }
    catch { await new Promise(r => setTimeout(r, 150)); }
  }

  try {
    await tests();
  } catch (e) {
    failed++; failures.push('SUITE CRASH: ' + e.message);
    console.error('\n\x1b[31mSuite crashed:\x1b[0m', e);
  } finally {
    child.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n${'─'.repeat(56)}`);
  console.log(`  \x1b[32m${passed} passed\x1b[0m   ${failed ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed'}`);
  if (failures.length) {
    console.log('\n  Failures:');
    failures.forEach(f => console.log('   · ' + f));
    console.log('\n  Server log:\n' + serverLog.split('\n').slice(-25).map(l => '   ' + l).join('\n'));
  }
  console.log(`${'─'.repeat(56)}\n`);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();

/* ------------------------------ tests ------------------------------- */

async function tests() {
  const guest = new Client();

  /* =============== static + headers =============== */
  section('Site loads');
  {
    const res = await guest.raw('/');
    const html = await res.text();
    ok('GET / serves the page', res.status === 200 && html.includes('<div id="app">'));
    ok('no inline <script> in the shell', !/<script(?![^>]*src=)/i.test(html));
    ok('Content-Security-Policy set', /script-src 'self'/.test(res.headers.get('content-security-policy') || ''));
    ok('X-Frame-Options DENY', res.headers.get('x-frame-options') === 'DENY');
    ok('X-Content-Type-Options nosniff', res.headers.get('x-content-type-options') === 'nosniff');

    const css = await guest.raw('/styles.css');
    ok('stylesheet served', css.status === 200);
    const js = await guest.raw('/app.js');
    ok('app.js served', js.status === 200);
    const spa = await guest.raw('/some/deep/link');
    ok('unknown route falls back to the app', spa.status === 200);
  }

  /* =============== bootstrap =============== */
  section('Bootstrap');
  let boot;
  {
    const r = await guest.get('/api/bootstrap');
    boot = r.body;
    ok('bootstrap returns 200', r.status === 200);
    ok('6 seeded perfumes', boot.products.length === 6, `got ${boot.products && boot.products.length}`);
    ok('3 categories', boot.categories.length === 3);
    ok('settings present', !!boot.settings.hero_headline);
    ok('no user for a guest', boot.user === null);
    ok('csrf token issued', typeof boot.csrf === 'string' && boot.csrf.length > 16);
    ok('no password hashes leak in products', !JSON.stringify(boot).includes('scrypt$'));
  }

  /* =============== registration + persistence =============== */
  section('Accounts and sessions');
  const alice = new Client();
  await alice.get('/api/bootstrap');
  {
    let r = await alice.post('/api/auth/register', { full_name: 'Alice Moreau', email: 'alice@example.com', password: 'test' });
    ok('weak password rejected', r.status === 400, JSON.stringify(r.body));

    r = await alice.post('/api/auth/register', { full_name: 'Alice Moreau', email: 'not-an-email', password: 'Lavender88' });
    ok('bad email rejected', r.status === 400);

    r = await alice.post('/api/auth/register', { full_name: 'Alice Moreau', email: 'alice@example.com', password: 'Lavender88' });
    ok('registration succeeds', r.status === 200 && r.body.user.email === 'alice@example.com');
    ok('new account is not admin', r.body.user.is_admin === 0);

    const sessionCookie = alice.lastSetCookie && alice.lastSetCookie['ml_session'];
    ok('session cookie is HttpOnly', /HttpOnly/i.test(sessionCookie || ''));
    ok('session cookie is SameSite=Lax', /SameSite=Lax/i.test(sessionCookie || ''));

    r = await alice.post('/api/auth/register', { full_name: 'Someone Else', email: 'ALICE@example.com', password: 'Lavender88' });
    ok('duplicate email rejected (case-insensitive)', r.status === 400);

    // The refresh test: a brand new client using only the stored cookie.
    const refreshed = new Client();
    refreshed.jar = new Map(alice.jar);
    r = await refreshed.get('/api/bootstrap');
    ok('session survives a refresh', r.body.user && r.body.user.email === 'alice@example.com');

    r = await alice.get('/api/auth/me');
    ok('/api/auth/me returns the user', r.body.user.full_name === 'Alice Moreau');
  }

  /* =============== login =============== */
  {
    const c = new Client();
    await c.get('/api/bootstrap');
    let r = await c.post('/api/auth/login', { email: 'alice@example.com', password: 'wrongpass1' });
    ok('wrong password rejected', r.status === 400);
    ok('error does not reveal whether the account exists', /incorrect/i.test(r.body.error));

    r = await c.post('/api/auth/login', { email: 'nobody@example.com', password: 'whatever1' });
    ok('unknown account gives the same message', /incorrect/i.test(r.body.error));

    r = await c.post('/api/auth/login', { email: 'alice@example.com', password: 'Lavender88' });
    ok('correct password signs in', r.status === 200 && r.body.user.email === 'alice@example.com');
  }

  /* =============== cart =============== */
  section('Cart');
  const lunar = boot.products.find(p => p.slug === 'lunar-no-12');
  {
    let r = await alice.post('/api/cart/add', { product_id: lunar.id, size_label: '50ml', qty: 2 });
    ok('add to cart works', r.status === 200 && r.body.cart.length === 1);
    ok('quantity stored', r.body.cart[0].qty === 2);

    // Price tampering
    r = await alice.post('/api/cart/add', { product_id: lunar.id, size_label: '30ml', unit_price_cents: 1 });
    const injected = r.body.cart.find(i => i.size_label === '30ml');
    ok('client-supplied price is ignored', injected.unit_price_cents === 8900, `got ${injected.unit_price_cents}`);

    r = await alice.post('/api/cart/add', { product_id: lunar.id, size_label: '<script>alert(1)</script>' });
    const fallback = r.body.cart.filter(i => i.size_label === '<script>alert(1)</script>');
    ok('unknown size falls back to a real size', fallback.length === 0);

    r = await alice.post('/api/cart/update', { id: injected.id, qty: 0 });
    ok('setting qty to 0 removes the line', !r.body.cart.some(i => i.id === injected.id));

    // Cross-cart tampering
    const mallory = new Client();
    await mallory.get('/api/bootstrap');
    const aliceItemId = r.body.cart[0].id;
    const t = await mallory.post('/api/cart/update', { id: aliceItemId, qty: 99 });
    ok('cannot edit another person\'s cart', t.status === 200 && t.body.cart.length === 0);
    const check = await alice.get('/api/cart');
    ok('victim cart unchanged', check.body.cart[0].qty === 2);

    // Cart persists across refresh
    const refreshed = new Client();
    refreshed.jar = new Map(alice.jar);
    const rr = await refreshed.get('/api/bootstrap');
    ok('cart survives a refresh', rr.body.cart.length === 1 && rr.body.cart[0].qty === 2);
  }

  /* =============== guest cart merges on login =============== */
  {
    const bob = new Client();
    await bob.get('/api/bootstrap');
    await bob.post('/api/cart/add', { product_id: lunar.id, size_label: '30ml', qty: 1 });
    const before = await bob.get('/api/cart');
    ok('guest can build a cart', before.body.cart.length === 1);
    const r = await bob.post('/api/auth/register', { full_name: 'Bob Ferrand', email: 'bob@example.com', password: 'Cedar1234' });
    ok('guest cart merges into the new account', r.body.cart.length === 1, JSON.stringify(r.body.cart));
  }

  /* =============== checkout =============== */
  section('Checkout');
  let orderNumber;
  {
    const stockBefore = (await guest.get('/api/products')).body.products.find(p => p.id === lunar.id).stock;

    let r = await alice.post('/api/checkout', {
      customer_name: 'Alice Moreau', customer_email: 'alice@example.com',
      shipping_address: '4 Rue Lunaire, Brighton', card_number: '4111111111111112',
      card_expiry: '12/30', card_cvc: '123'
    });
    ok('invalid card number rejected', r.status === 400 && r.body.field === 'card_number');

    r = await alice.post('/api/checkout', {
      customer_name: 'Alice Moreau', customer_email: 'alice@example.com',
      shipping_address: '4 Rue Lunaire, Brighton', card_number: '4111111111111111',
      card_expiry: '01/20', card_cvc: '123'
    });
    ok('expired card rejected', r.status === 400 && r.body.field === 'card_expiry');

    r = await alice.post('/api/checkout', {
      customer_name: 'Alice Moreau', customer_email: 'alice@example.com',
      shipping_address: '4 Rue Lunaire, Brighton', card_number: '4111 1111 1111 1111',
      card_expiry: '12/30', card_cvc: '123'
    });
    ok('valid checkout succeeds', r.status === 200 && !!r.body.order_number, JSON.stringify(r.body));
    orderNumber = r.body.order_number;
    ok('total is 2 × £145.00', r.body.total_cents === 29000, `got ${r.body.total_cents}`);

    const cart = await alice.get('/api/cart');
    ok('cart empties after checkout', cart.body.cart.length === 0);

    const stockAfter = (await guest.get('/api/products')).body.products.find(p => p.id === lunar.id).stock;
    ok('stock decremented by 2', stockAfter === stockBefore - 2, `${stockBefore} → ${stockAfter}`);

    r = await alice.post('/api/checkout', {
      customer_name: 'Alice', customer_email: 'alice@example.com', shipping_address: 'x y z',
      card_number: '4111111111111111', card_expiry: '12/30', card_cvc: '123'
    });
    ok('empty cart cannot check out', r.status === 400);

    r = await alice.get('/api/orders');
    ok('order appears in history', r.body.orders.length === 1 && r.body.orders[0].order_number === orderNumber);
    ok('full card number never stored', !JSON.stringify(r.body).includes('4111111111111111'));
    ok('only last 4 kept', r.body.orders[0].pay_last4 === '1111' && r.body.orders[0].pay_brand === 'Visa');

    const other = new Client();
    await other.get('/api/bootstrap');
    r = await other.get('/api/order?number=' + orderNumber);
    ok('a stranger cannot read someone else\'s order', r.status === 403);
  }

  /* =============== reviews =============== */
  section('Reviews');
  const fig = boot.products.find(p => p.slug === 'midnight-fig');
  {
    const anon = new Client();
    await anon.get('/api/bootstrap');
    let r = await anon.post('/api/reviews', { product_id: lunar.id, rating: 5, body: 'Lovely' });
    ok('signed-out visitor cannot review', r.status === 401);

    r = await alice.post('/api/reviews', { product_id: fig.id, rating: 5, body: 'Never bought this one' });
    ok('cannot review a perfume you have not bought', r.status === 403, JSON.stringify(r.body));

    r = await alice.post('/api/reviews', { product_id: lunar.id, rating: 9, body: 'Out of range' });
    ok('rating above 5 rejected', r.status === 400);

    r = await alice.post('/api/reviews', { product_id: lunar.id, rating: 5, body: 'x' });
    ok('empty review text rejected', r.status === 400);

    r = await alice.post('/api/reviews', {
      product_id: lunar.id, rating: 5, title: 'Wears beautifully',
      body: 'Opens sharp and green, settles into something warmer after an hour.'
    });
    ok('verified purchaser can review', r.status === 200, JSON.stringify(r.body));
    ok('review comes back in the list', r.body.reviews.length === 1);
    ok('reviewer shown as first name + initial', r.body.reviews[0].author === 'Alice M.', r.body.reviews[0].author);
    ok('reviewer email is never exposed', !JSON.stringify(r.body).includes('alice@example.com'));
    ok('marked as the reviewer\'s own', r.body.reviews[0].mine === true);

    r = await alice.post('/api/reviews', { product_id: lunar.id, rating: 3, body: 'Trying to review twice' });
    ok('cannot review the same perfume twice', r.status === 400);

    const pub = await guest.get('/api/product?slug=lunar-no-12');
    ok('review shows on the public product page', pub.body.reviews.length === 1);
    ok('average rating computed', pub.body.product.rating_avg === 5 && pub.body.product.rating_count === 1);
    ok('guest sees canReview = false', pub.body.canReview === false);

    const reviewId = r.body ? null : null;
    const mine = (await alice.get('/api/product?slug=lunar-no-12')).body;
    ok('purchaser who already reviewed sees alreadyReviewed', mine.alreadyReviewed === true);

    const rid = mine.reviews[0].id;
    let u = await alice.post('/api/reviews/update', { id: rid, rating: 4, title: 'Still good', body: 'Revised after a week of wear.' });
    ok('reviewer can edit their own review', u.status === 200 && u.body.reviews[0].rating === 4);

    // Another user tries to edit it
    const bob = new Client();
    await bob.get('/api/bootstrap');
    await bob.post('/api/auth/login', { email: 'bob@example.com', password: 'Cedar1234' });
    u = await bob.post('/api/reviews/update', { id: rid, rating: 1, body: 'Sabotage attempt here' });
    ok('another customer cannot edit that review', u.status === 403);
    u = await bob.post('/api/reviews/delete', { id: rid });
    ok('another customer cannot delete that review', u.status === 403);

    const after = await guest.get('/api/product?slug=lunar-no-12');
    ok('review survived the tampering', after.body.reviews.length === 1 && after.body.reviews[0].rating === 4);
  }

  /* =============== stored XSS =============== */
  section('Cross-site scripting');
  {
    const payload = '<img src=x onerror=alert(1)>';
    // Alice reviews via a second purchase of a different product
    await alice.post('/api/cart/add', { product_id: fig.id, size_label: '30ml', qty: 1 });
    await alice.post('/api/checkout', {
      customer_name: 'Alice Moreau', customer_email: 'alice@example.com',
      shipping_address: '4 Rue Lunaire', card_number: '4111111111111111',
      card_expiry: '12/30', card_cvc: '123'
    });
    const r = await alice.post('/api/reviews', { product_id: fig.id, rating: 4, title: payload, body: payload + ' still fine' });
    ok('markup in a review is accepted as plain text', r.status === 200);
    ok('stored verbatim, not interpreted', r.body.reviews[0].title === payload);

    const res = await guest.raw('/api/product?slug=midnight-fig');
    ok('API responds as JSON, not HTML', (res.headers.get('content-type') || '').includes('application/json'));

    const c = await guest.post('/api/contact', {
      name: payload, email: 'x@example.com', subject: 'hi', message: 'hello there'
    });
    ok('contact form accepts and stores it safely', c.status === 200);
  }

  /* =============== CSRF =============== */
  section('CSRF protection');
  {
    let r = await alice.post('/api/cart/add', { product_id: lunar.id }, { noCsrf: true });
    ok('POST without a CSRF token is refused', r.status === 403);

    r = await alice.post('/api/cart/add', { product_id: lunar.id }, { csrf: 'not-the-right-token' });
    ok('POST with a wrong CSRF token is refused', r.status === 403);

    r = await alice.post('/api/cart/add', { product_id: lunar.id }, { headers: { Origin: 'https://evil.example.com' } });
    ok('cross-origin POST is refused', r.status === 403);

    r = await alice.post('/api/cart/add', { product_id: lunar.id, size_label: '30ml' });
    ok('POST with the right token works', r.status === 200);
    await alice.post('/api/cart/update', { id: r.body.cart[0].id, qty: 0 });
  }

  /* =============== admin =============== */
  section('Admin');
  const admin = new Client();
  {
    await admin.get('/api/bootstrap');
    let r = await admin.get('/api/admin/overview');
    ok('admin API refuses anonymous access', r.status === 401);

    r = await alice.get('/api/admin/overview');
    ok('admin API refuses a normal customer', r.status === 403);

    r = await alice.post('/api/admin/products/create', { name: 'Hacked', sizes: [{ label: '1ml', price_cents: 1 }] });
    ok('customer cannot create products', r.status === 403);

    r = await alice.post('/api/admin/customers/toggle', { id: 1 });
    ok('customer cannot disable accounts', r.status === 403);

    const js = await alice.raw('/admin.js');
    ok('admin bundle is 404 for a customer', js.status === 404);
    const jsGuest = await guest.raw('/admin.js');
    ok('admin bundle is 404 for a guest', jsGuest.status === 404);

    r = await admin.post('/api/auth/login', { email: 'admin@maisonlunar.com', password: 'StudioPass123' });
    ok('admin can sign in', r.status === 200 && r.body.user.is_admin === 1);

    const jsAdmin = await admin.raw('/admin.js');
    ok('admin bundle is served to an admin', jsAdmin.status === 200);

    r = await admin.get('/api/admin/overview');
    ok('overview loads', r.status === 200 && r.body.stats.orders === 2, JSON.stringify(r.body && r.body.stats));
    ok('revenue counted', r.body.stats.revenue_cents > 0);
    ok('customers counted (excludes staff)', r.body.stats.customers === 2, `got ${r.body.stats.customers}`);

    r = await admin.post('/api/admin/products/create', {
      name: 'Test Bloom', category: 'unisex', short_description: 'A test',
      description: 'Testing', sizes: [{ label: '50ml', price_cents: 12000 }], stock: 7
    });
    ok('admin can create a perfume', r.status === 200 && r.body.products.length === 7);
    const created = r.body.products.find(p => p.name === 'Test Bloom');
    ok('slug generated', created.slug === 'test-bloom');

    r = await admin.post('/api/admin/products/update', { id: created.id, stock: 3, hidden: 1 });
    ok('admin can update a perfume', r.status === 200);
    const pubList = await guest.get('/api/products');
    ok('hidden perfume is not public', !pubList.body.products.some(p => p.id === created.id));

    r = await admin.post('/api/admin/products/update', { id: created.id, image_url: 'javascript:alert(1)' });
    ok('javascript: image URL rejected', r.status === 400);

    r = await admin.post('/api/admin/products/delete', { id: created.id });
    ok('admin can delete a perfume', r.status === 200 && r.body.products.length === 6);

    r = await admin.post('/api/admin/orders/status', { id: 1, status: 'shipped' });
    ok('admin can set order status', r.status === 200);
    r = await admin.post('/api/admin/orders/status', { id: 1, status: 'teleported' });
    ok('invalid status rejected', r.status === 400);

    r = await admin.get('/api/admin/reviews');
    ok('admin sees all reviews', r.status === 200 && r.body.reviews.length === 2);

    const rid = r.body.reviews[0].id;
    r = await admin.post('/api/admin/reviews/status', { id: rid, status: 'hidden' });
    ok('admin can hide a review', r.status === 200);
    const hidden = await guest.get('/api/product?slug=midnight-fig');
    ok('hidden review is gone from the public page', hidden.body.reviews.length === 0);
    ok('hidden review excluded from the average', !hidden.body.product.rating_count);
    await admin.post('/api/admin/reviews/status', { id: rid, status: 'published' });

    r = await admin.post('/api/admin/settings', { settings: { hero_headline: 'A new headline', is_admin: 'yes' } });
    ok('admin can change settings', r.status === 200 && r.body.settings.hero_headline === 'A new headline');
    ok('settings allow-list blocks unknown keys', r.body.settings.is_admin === undefined);

    r = await admin.get('/api/admin/messages');
    ok('inbox has the contact message', r.status === 200 && r.body.messages.length === 1);

    r = await admin.get('/api/admin/customers');
    ok('customer list loads', r.status === 200 && r.body.customers.length === 3);

    r = await admin.post('/api/admin/customers/toggle', { id: r.body.customers.find(c => c.email === 'bob@example.com').id });
    ok('admin can disable a customer', r.status === 200 && r.body.is_active === 0);

    const bob = new Client();
    await bob.get('/api/bootstrap');
    r = await bob.post('/api/auth/login', { email: 'bob@example.com', password: 'Cedar1234' });
    ok('disabled customer cannot sign in', r.status === 403);
  }

  /* =============== SQL injection =============== */
  section('SQL injection attempts');
  {
    const evil = "' OR 1=1 --";
    let r = await guest.post('/api/auth/login', { email: evil, password: evil });
    ok('injection in login fails safely', r.status === 400);

    r = await guest.get('/api/product?slug=' + encodeURIComponent("' OR '1'='1"));
    ok('injection in a product lookup returns 404', r.status === 404);

    r = await guest.get('/api/order?number=' + encodeURIComponent("x' OR '1'='1"));
    ok('injection in an order lookup returns 404', r.status === 404);

    const still = await guest.get('/api/bootstrap');
    ok('database intact after injection attempts', still.body.products.length === 6);
  }

  /* =============== path traversal =============== */
  section('Path traversal');
  {
    for (const p of ['/../server.js', '/../lib/db.js', '/..%2Flib%2Fdb.js', '/../../etc/passwd', '/../data/maison-lunar.db']) {
      const res = await guest.raw(p);
      const text = await res.text();
      ok(`blocked: ${p}`, !text.includes('DatabaseSync') && !text.includes('root:x:') && !text.includes('scrypt'));
    }
  }

  /* =============== rate limiting =============== */
  section('Rate limiting');
  {
    const c = new Client();
    await c.get('/api/bootstrap');
    let hit429 = false;
    for (let i = 0; i < 12; i++) {
      const r = await c.post('/api/auth/login', { email: 'ratelimit@example.com', password: 'BadPass123' });
      if (r.status === 429) { hit429 = true; break; }
    }
    ok('repeated failed logins get rate limited', hit429);
  }

  /* =============== oversized input =============== */
  section('Input limits');
  {
    let r = await alice.post('/api/reviews', { product_id: lunar.id, rating: 5, body: 'x'.repeat(5000) });
    ok('over-long review rejected', r.status === 400);

    r = await guest.post('/api/contact', { name: 'a'.repeat(500), email: 'x@y.com', message: 'hello' });
    ok('over-long name rejected', r.status === 400);

    const res = await guest.raw('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': guest.csrf() },
      body: 'x'.repeat(300 * 1024)
    });
    ok('oversized body rejected', res.status === 413 || res.status === 400, `got ${res.status}`);
  }

  /* =============== logout =============== */
  section('Sign out');
  {
    const r = await alice.post('/api/auth/logout', {});
    ok('logout succeeds', r.status === 200);
    const after = await alice.get('/api/bootstrap');
    ok('session is gone after logout', after.body.user === null);
    const admin2 = await alice.get('/api/orders');
    ok('protected endpoint refuses the dead session', admin2.status === 401);
  }

  /* =============== password change =============== */
  section('Password change');
  {
    const c = new Client();
    await c.get('/api/bootstrap');
    await c.post('/api/auth/login', { email: 'alice@example.com', password: 'Lavender88' });

    let r = await c.post('/api/auth/password', { current_password: 'wrong', new_password: 'NewPass123' });
    ok('wrong current password rejected', r.status === 400);

    r = await c.post('/api/auth/password', { current_password: 'Lavender88', new_password: 'short' });
    ok('weak new password rejected', r.status === 400);

    r = await c.post('/api/auth/password', { current_password: 'Lavender88', new_password: 'NewPass123' });
    ok('password change succeeds', r.status === 200);

    const c2 = new Client();
    await c2.get('/api/bootstrap');
    r = await c2.post('/api/auth/login', { email: 'alice@example.com', password: 'NewPass123' });
    ok('new password works', r.status === 200);
    r = await c2.post('/api/auth/login', { email: 'alice@example.com', password: 'Lavender88' });
    ok('old password no longer works', r.status === 400);
  }
}
