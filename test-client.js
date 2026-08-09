'use strict';
/* ---------------------------------------------------------------------
   Client render test.

   There is no browser in this environment, so this provides just enough
   of a DOM for app.js to run, points it at a real server, and walks every
   route. It catches the errors that matter most here: a view function
   throwing, or referencing something that does not exist.

   Run:  node test-client.js
   ------------------------------------------------------------------ */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const PORT = 3998;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = path.join(__dirname, 'data', '_test_client');

let passed = 0, failed = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { failed++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  \x1b[31m✗ ${name}\x1b[0m${detail ? ' — ' + detail : ''}`); }
};

/* ---------------------------- DOM shim ------------------------------ */

function makeElement(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    children: [], _html: '', value: '', type: 'text', checked: false,
    dataset: {}, style: { setProperty() {}, removeProperty() {} },
    className: '', textContent: '', disabled: false, id: '',
    classList: {
      _set: new Set(),
      add(...c) { c.forEach(x => this._set.add(x)); },
      remove(...c) { c.forEach(x => this._set.delete(x)); },
      toggle(c, force) { if (force === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } else if (force) this._set.add(c); else this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    appendChild(c) { this.children.push(c); return c; },
    insertAdjacentHTML(pos, html) { this._html += html; },
    remove() {},
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {},
    focus() {}, scrollIntoView() {}, reset() {},
    closest() { return makeElement('div'); },
    querySelector() { return makeElement('div'); },
    querySelectorAll() { return []; }
  };
  return el;
}

function buildEnv() {
  const app = makeElement('div');
  app.id = 'app';
  const head = makeElement('head');
  // A script tag appended here would normally load over the network. There is
  // no loader in this shim, so settle it immediately; the admin bundle is
  // injected directly by the test instead.
  head.appendChild = (node) => {
    head.children.push(node);
    if (node.tagName === 'SCRIPT') setTimeout(() => { if (node.onerror) node.onerror(); }, 0);
    return node;
  };
  const body = makeElement('body');
  body.style = { overflow: '' };

  // Resolve selectors against the markup the app just rendered, so the
  // event-binding code runs against real output instead of always finding
  // null. Not a parser — an existence check, which is what matters here.
  const present = (sel) => {
    const html = app.innerHTML;
    let m;
    if ((m = /^#([\w-]+)$/.exec(sel))) return html.includes(`id="${m[1]}"`);
    if ((m = /^\[([\w-]+)="?([^\]"]*)"?\]$/.exec(sel))) return html.includes(`${m[1]}="${m[2]}"`);
    if ((m = /^\.([\w-]+)$/.exec(sel))) return html.includes(m[1]);
    return false;
  };

  const document = {
    cookie: '',
    documentElement: { style: { setProperty() {}, removeProperty() {} } },
    head, body,
    title: '',
    createElement: (t) => makeElement(t),
    querySelector(sel) {
      if (sel === '#app') return app;
      return present(sel) ? makeElement('div') : null;
    },
    querySelectorAll(sel) { return present(sel) ? [makeElement('div')] : []; },
    addEventListener() {}, removeEventListener() {}
  };

  const location = { hash: '', href: BASE + '/' };
  const listeners = {};
  const window = {
    document, location,
    addEventListener(ev, fn) { listeners[ev] = fn; },
    scrollTo() {},
    crypto: require('node:crypto').webcrypto,
    isSecureContext: false,
    confirm: () => true,
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: (url, init) => fetch(String(url).startsWith('http') ? url : BASE + url, init)
  };
  window.window = window;

  return { window, document, location, app, listeners };
}

/* ------------------------------ runner ------------------------------ */

(async function run() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  const child = spawn(process.execPath, ['--no-warnings', 'server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), ML_DATA_DIR: TMP, ML_ADMIN_PASSWORD: 'StudioPass123' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });

  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + '/api/bootstrap'); break; }
    catch { await new Promise(r => setTimeout(r, 150)); }
  }

  try { await tests(); }
  catch (e) { failed++; failures.push('CRASH: ' + e.stack); console.error(e); }
  finally { child.kill('SIGTERM'); await new Promise(r => setTimeout(r, 250)); }

  console.log(`\n${'─'.repeat(56)}`);
  console.log(`  \x1b[32m${passed} passed\x1b[0m   ${failed ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed'}`);
  if (failures.length) { console.log('\n  Failures:'); failures.forEach(f => console.log('   · ' + f)); }
  console.log(`${'─'.repeat(56)}\n`);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();

/* ------------------------------ tests -------------------------------- */

async function loadApp(cookieJar) {
  const env = buildEnv();
  env.document.cookie = cookieJar || '';

  // Route fetch through a cookie-aware wrapper so sessions work.
  const jar = new Map();
  (cookieJar || '').split(';').forEach(p => {
    const i = p.indexOf('='); if (i > 0) jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  });
  env.window.fetch = async (url, init = {}) => {
    const headers = { ...(init.headers || {}) };
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(String(url).startsWith('http') ? url : BASE + url, { ...init, headers });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    env.document.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    return res;
  };

  const ctx = vm.createContext(Object.assign(env.window, {
    console, fetch: env.window.fetch, URLSearchParams, TextEncoder, JSON, Math, Date,
    Number, String, Boolean, Array, Object, Set, Map, Error, parseInt, parseFloat, isNaN
  }));
  ctx.globalThis = ctx;

  const code = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'app.js' });

  // wait for boot()
  for (let i = 0; i < 50; i++) {
    if (ctx.ML && ctx.ML.state.ready) break;
    await new Promise(r => setTimeout(r, 60));
  }
  return { ctx, env, jar };
}

async function tests() {
  console.log('\n\x1b[1mStorefront renders\x1b[0m');

  const { ctx, env } = await loadApp();
  ok('app boots and hydrates', ctx.ML && ctx.ML.state.ready === true);
  ok('products loaded into state', ctx.ML.state.products.length === 6);

  const routes = [
    ['/', 'home'],
    ['/shop', 'shop'],
    ['/shop?f=unisex', 'shop filtered'],
    ['/shop?q=oud', 'shop search'],
    ['/product/lunar-no-12', 'product page'],
    ['/product/does-not-exist', 'missing product'],
    ['/cart', 'empty cart'],
    ['/login', 'login'],
    ['/order/NOPE', 'unknown order'],
    ['/totally/unknown', '404 page']
  ];

  for (const [hash, label] of routes) {
    env.location.hash = '#' + hash;
    let threw = null;
    try { await ctx.ML.render(); } catch (e) { threw = e; }
    const html = env.app.innerHTML;
    ok(`renders ${label}`, !threw && html.length > 200, threw ? threw.message : `html length ${html.length}`);
  }

  // Product page specifics
  env.location.hash = '#/product/lunar-no-12';
  await ctx.ML.render();
  let html = env.app.innerHTML;
  ok('product page shows the name', html.includes('Lunar No. 12'));
  ok('product page has a reviews section', html.includes('id="reviews"'));
  ok('signed-out visitor is invited to sign in to review', html.includes('Sign in</a> to leave yours') || html.includes('to leave yours'));
  ok('no reviews yet message', html.includes('No reviews yet'));
  ok('all three note tiers render', html.includes('>Top<') && html.includes('>Heart<') && html.includes('>Base<'));
  ok('size chips render', (html.match(/size-chip/g) || []).length >= 3);

  // Cart with an item
  await ctx.ML.api('/api/cart/add', { product_id: ctx.ML.state.products[0].id, size_label: '50ml', qty: 2 });
  ctx.ML.state.cart = (await ctx.ML.api('/api/cart')).cart;
  env.location.hash = '#/cart';
  await ctx.ML.render();
  html = env.app.innerHTML;
  ok('cart shows the line item', html.includes('Lunar No. 12'));
  ok('cart shows a subtotal', html.includes('£290.00'), 'expected 2 × £145.00');
  ok('checkout form present', html.includes('id="checkoutForm"'));
  ok('cart badge in the nav', html.includes('cart-count'));

  console.log('\n\x1b[1mCustomer journey\x1b[0m');

  // Register through the client's own API layer
  await ctx.ML.api('/api/auth/register', { full_name: 'Cleo Rousseau', email: 'cleo@example.com', password: 'Vetiver22' });
  await ctx.ML.hydrate();
  ok('signed in after registering', ctx.ML.state.user && ctx.ML.state.user.email === 'cleo@example.com');

  env.location.hash = '#/account';
  await ctx.ML.render();
  html = env.app.innerHTML;
  ok('account page renders', html.includes('Hello, Cleo'));
  ok('account shows order stats', html.includes('Total spent'));
  ok('account offers a password change', html.includes('id="pwForm"'));

  // Buy something
  await ctx.ML.api('/api/checkout', {
    customer_name: 'Cleo Rousseau', customer_email: 'cleo@example.com',
    shipping_address: '9 Moonlit Way, Hove', card_number: '4111111111111111',
    card_expiry: '11/29', card_cvc: '456'
  });
  ctx.ML.state.cart = [];

  env.location.hash = '#/account';
  await ctx.ML.render();
  html = env.app.innerHTML;
  ok('order appears in account history', html.includes('ML-'));
  ok('"awaiting your review" prompt appears', html.includes('Write a review'));

  env.location.hash = '#/product/lunar-no-12';
  await ctx.ML.render();
  html = env.app.innerHTML;
  ok('purchaser is offered the review form', html.includes('id="reviewForm"'));
  ok('star input renders 5 stars', (html.match(/star-btn/g) || []).length >= 5);

  await ctx.ML.api('/api/reviews', {
    product_id: ctx.ML.state.products.find(p => p.slug === 'lunar-no-12').id,
    rating: 5, title: 'Quietly excellent', body: 'Wears close to the skin and lasts all evening.'
  });
  await ctx.ML.refreshProducts();
  env.location.hash = '#/product/lunar-no-12';
  await ctx.ML.render();
  html = env.app.innerHTML;
  ok('review shows on the page', html.includes('Quietly excellent'));
  ok('verified purchase badge shown', html.includes('Verified purchase'));
  ok('author is masked to first name + initial', html.includes('Cleo R.'));
  ok('reviewer sees edit and delete', html.includes('data-edit-review') && html.includes('data-delete-review'));
  ok('rating summary appears', html.includes('out of 5'));
  ok('already-reviewed notice replaces the form', html.includes('You have reviewed this fragrance'));

  env.location.hash = '#/shop';
  await ctx.ML.render();
  ok('shop card shows the star rating', env.app.innerHTML.includes('card-rating'));

  console.log('\n\x1b[1mAdmin\x1b[0m');

  // A customer must not get the admin UI
  env.location.hash = '#/admin/dashboard';
  await ctx.ML.render();
  ok('customer sees the staff sign-in wall, not the dashboard',
    env.app.innerHTML.includes('Staff sign in') && !env.app.innerHTML.includes('admin-shell'));

  const adminEnv = await loadApp();
  await adminEnv.ctx.ML.api('/api/auth/login', { email: 'admin@maisonlunar.com', password: 'StudioPass123' });
  await adminEnv.ctx.ML.hydrate();
  ok('admin session established', adminEnv.ctx.ML.state.user.is_admin === 1);

  // The admin bundle needs the real script tag path; load it manually here.
  const adminCode = fs.readFileSync(path.join(__dirname, 'public', 'admin.js'), 'utf8');
  vm.runInContext(adminCode, adminEnv.ctx, { filename: 'admin.js' });
  ok('admin bundle registers itself', !!adminEnv.ctx.ML.admin);

  const adminRoutes = ['/admin/dashboard', '/admin/products', '/admin/stock', '/admin/orders',
    '/admin/reviews', '/admin/customers', '/admin/categories', '/admin/content',
    '/admin/appearance', '/admin/messages'];

  for (const r of adminRoutes) {
    let threw = null;
    try { await adminEnv.ctx.ML.admin.render(r); } catch (e) { threw = e; }
    const h = adminEnv.env.app.innerHTML;
    ok(`admin renders ${r}`, !threw && h.includes('admin-shell'), threw ? threw.message : 'no admin-shell');
  }

  await adminEnv.ctx.ML.admin.render('/admin/reviews');
  ok('admin review page lists the review', adminEnv.env.app.innerHTML.includes('Quietly excellent'));
  await adminEnv.ctx.ML.admin.render('/admin/orders');
  ok('admin order page lists the order', adminEnv.env.app.innerHTML.includes('Cleo Rousseau'));
  await adminEnv.ctx.ML.admin.render('/admin/products');
  ok('admin product page lists all six', (adminEnv.env.app.innerHTML.match(/data-edit="/g) || []).length === 6);

  // Admin sees inline edit controls on the storefront
  adminEnv.env.location.hash = '#/';
  await adminEnv.ctx.ML.render();
  ok('admin sees inline "+" editors on the homepage', adminEnv.env.app.innerHTML.includes('admin-plus'));
  ok('admin sees the admin bar', adminEnv.env.app.innerHTML.includes('admin-bar'));

  env.location.hash = '#/';
  await ctx.ML.render();
  ok('customer never receives inline editors', !env.app.innerHTML.includes('admin-plus'));
  ok('customer never receives the admin bar', !env.app.innerHTML.includes('admin-bar'));
}
