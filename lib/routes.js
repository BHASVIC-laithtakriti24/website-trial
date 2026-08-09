'use strict';
/* ---------------------------------------------------------------------
   API handlers. Nothing here trusts the client: every price is looked up
   from the database, every permission is re-checked on the server, and
   every identifier is validated before it reaches a query.
   ------------------------------------------------------------------ */

const { db } = require('./db');
const { hashPassword, verifyPassword, fakeVerify, randomToken } = require('./auth');
const { rateLimit, V } = require('./security');

class HttpError extends Error {
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}
const bad = (msg, field) => { throw new HttpError(400, msg, field); };
const denied = (msg = 'You need to be signed in to do that.') => { throw new HttpError(401, msg); };
const forbidden = (msg = 'You do not have access to that.') => { throw new HttpError(403, msg); };
const missing = (msg = 'Not found.') => { throw new HttpError(404, msg); };

/* ============================ helpers ============================== */

const SESSION_DAYS = 30;

function createSession(userId, req, ip) {
  const token = randomToken(32);
  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, user_agent, ip)
    VALUES (?, ?, datetime('now', ?), ?, ?)`
  ).run(token, userId, `+${SESSION_DAYS} day`, String(req.headers['user-agent'] || '').slice(0, 300), ip);
  return token;
}

function getSession(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.token, s.user_id, u.full_name, u.email, u.is_admin, u.is_active
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')`).get(token);
  if (!row || !row.is_active) return null;
  return row;
}

function destroySession(token) {
  if (token) db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.user_id ?? row.id,
    full_name: row.full_name,
    email: row.email,
    is_admin: row.is_admin ? 1 : 0
  };
}

function settingsMap() {
  const out = {};
  for (const r of db.prepare(`SELECT key, value FROM settings`).all()) out[r.key] = r.value;
  try { out.testimonials = JSON.parse(out.testimonials_json || '[]'); }
  catch { out.testimonials = []; }
  delete out.testimonials_json;
  return out;
}

const RATING_SQL = `
  (SELECT ROUND(AVG(rating), 2) FROM reviews r
    WHERE r.product_id = p.id AND r.status = 'published') AS rating_avg,
  (SELECT COUNT(*) FROM reviews r
    WHERE r.product_id = p.id AND r.status = 'published') AS rating_count`;

function shapeProduct(p) {
  if (!p) return null;
  let sizes = [];
  try { sizes = JSON.parse(p.sizes_json || '[]'); } catch { sizes = []; }
  const { sizes_json, ...rest } = p;
  return { ...rest, sizes, rating_avg: p.rating_avg || 0, rating_count: p.rating_count || 0 };
}

function listProducts({ includeHidden = false } = {}) {
  const sql = `SELECT p.*, ${RATING_SQL} FROM products p
               ${includeHidden ? '' : 'WHERE p.hidden = 0'}
               ORDER BY p.id ASC`;
  return db.prepare(sql).all().map(shapeProduct);
}

function cartRows(cartKey) {
  return db.prepare(`
    SELECT c.id, c.product_id, c.size_label, c.unit_price_cents, c.qty,
           p.name AS product_name, p.slug, p.image_url, p.stock
    FROM cart_items c JOIN products p ON p.id = c.product_id
    WHERE c.cart_key = ? ORDER BY c.id ASC`).all(cartKey);
}

function slugify(name) {
  const base = String(name).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'perfume';
  let slug = base, n = 1;
  while (db.prepare(`SELECT 1 FROM products WHERE slug = ?`).get(slug)) slug = `${base}-${++n}`;
  return slug;
}

/** Has this user bought this product? Returns the qualifying order id. */
function purchasedOrderId(userId, productId) {
  const row = db.prepare(`
    SELECT o.id FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.user_id = ? AND oi.product_id = ? AND o.status != 'cancelled'
    ORDER BY o.id ASC LIMIT 1`).get(userId, productId);
  return row ? row.id : null;
}

function reviewsFor(productId, viewer) {
  const rows = db.prepare(`
    SELECT r.id, r.rating, r.title, r.body, r.created_at, r.status, r.user_id,
           u.full_name
    FROM reviews r JOIN users u ON u.id = r.user_id
    WHERE r.product_id = ? AND (r.status = 'published' OR r.user_id = ? OR ? = 1)
    ORDER BY r.created_at DESC`).all(productId, viewer?.user_id ?? -1, viewer?.is_admin ? 1 : 0);
  return rows.map(r => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    created_at: r.created_at,
    status: r.status,
    // Only ever expose a display name, never the reviewer's email.
    author: displayName(r.full_name),
    mine: viewer ? r.user_id === viewer.user_id : false
  }));
}

function displayName(full) {
  const parts = String(full || 'Customer').trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts[parts.length - 1][0].toUpperCase() + '.';
}

function luhn(num) {
  const s = String(num).replace(/\D/g, '');
  if (s.length < 12 || s.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = +s[i];
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return sum % 10 === 0;
}

function cardBrand(num) {
  const s = String(num).replace(/\D/g, '');
  if (/^4/.test(s)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(s)) return 'Mastercard';
  if (/^3[47]/.test(s)) return 'Amex';
  if (/^6(011|5)/.test(s)) return 'Discover';
  return 'Card';
}

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const out = fn(); db.exec('COMMIT'); return out; }
  catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}

/* ============================= routes ============================== */

const routes = {};

/* ------------------------------ boot ------------------------------- */

routes['GET /api/bootstrap'] = (ctx) => ({
  settings: settingsMap(),
  categories: db.prepare(`SELECT id, key, label FROM categories ORDER BY id`).all(),
  products: listProducts(),
  user: publicUser(ctx.session),
  cart: cartRows(ctx.cartKey),
  csrf: ctx.csrf
});

/* ------------------------------ auth ------------------------------- */

routes['POST /api/auth/register'] = (ctx) => {
  const limit = rateLimit(`reg:${ctx.ip}`, 5, 15 * 60 * 1000);
  if (!limit.ok) throw new HttpError(429, 'Too many sign-up attempts. Try again shortly.');

  const name = V.str(ctx.body.full_name, { min: 2, max: 100 });
  const email = V.email(ctx.body.email);
  const pw = V.password(ctx.body.password);
  if (!name) bad('Enter your full name.', 'full_name');
  if (!email) bad('Enter a valid email address.', 'email');
  if (!pw) bad('Password needs at least 8 characters, with a letter and a number.', 'password');

  const exists = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (exists) bad('An account with that email already exists.', 'email');

  const info = db.prepare(
    `INSERT INTO users (full_name, email, pw_hash) VALUES (?, ?, ?)`
  ).run(name, email, hashPassword(pw));

  const userId = Number(info.lastInsertRowid);
  mergeGuestCart(ctx.cartKey, `u:${userId}`);
  const token = createSession(userId, ctx.req, ctx.ip);
  ctx.setSession(token);
  return { user: { id: userId, full_name: name, email, is_admin: 0 }, cart: cartRows(`u:${userId}`) };
};

routes['POST /api/auth/login'] = (ctx) => {
  const email = V.email(ctx.body.email);
  const password = V.str(ctx.body.password, { min: 1, max: 200, trim: false });

  const byIp = rateLimit(`login:ip:${ctx.ip}`, 20, 15 * 60 * 1000);
  if (!byIp.ok) throw new HttpError(429, `Too many attempts. Try again in ${byIp.retryAfter}s.`);
  if (email) {
    const byEmail = rateLimit(`login:em:${email}`, 8, 15 * 60 * 1000);
    if (!byEmail.ok) throw new HttpError(429, `Too many attempts for that account. Try again in ${byEmail.retryAfter}s.`);
  }

  if (!email || !password) {
    fakeVerify();
    bad('Email or password is incorrect.');
  }

  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
  if (!user) { fakeVerify(); bad('Email or password is incorrect.'); }
  if (!verifyPassword(password, user.pw_hash)) {
    db.prepare(`INSERT INTO login_attempts (email, ip, ok) VALUES (?, ?, 0)`).run(email, ctx.ip);
    bad('Email or password is incorrect.');
  }
  if (!user.is_active) forbidden('That account has been disabled.');

  db.prepare(`INSERT INTO login_attempts (email, ip, ok) VALUES (?, ?, 1)`).run(email, ctx.ip);
  mergeGuestCart(ctx.cartKey, `u:${user.id}`);
  const token = createSession(user.id, ctx.req, ctx.ip);
  ctx.setSession(token);
  return {
    user: { id: user.id, full_name: user.full_name, email: user.email, is_admin: user.is_admin },
    cart: cartRows(`u:${user.id}`)
  };
};

routes['POST /api/auth/logout'] = (ctx) => {
  destroySession(ctx.sessionToken);
  ctx.clearSession();
  return { ok: true };
};

routes['GET /api/auth/me'] = (ctx) => ({ user: publicUser(ctx.session) });

routes['POST /api/auth/password'] = (ctx) => {
  if (!ctx.session) denied();
  const current = V.str(ctx.body.current_password, { min: 1, max: 200, trim: false });
  const next = V.password(ctx.body.new_password);
  if (!next) bad('New password needs at least 8 characters, with a letter and a number.', 'new_password');

  const row = db.prepare(`SELECT pw_hash FROM users WHERE id = ?`).get(ctx.session.user_id);
  if (!row || !verifyPassword(current || '', row.pw_hash)) bad('Current password is incorrect.', 'current_password');

  db.prepare(`UPDATE users SET pw_hash = ? WHERE id = ?`).run(hashPassword(next), ctx.session.user_id);
  // Signing out every other device is the point of a password change.
  db.prepare(`DELETE FROM sessions WHERE user_id = ? AND token != ?`).run(ctx.session.user_id, ctx.sessionToken);
  return { ok: true };
};

/* ----------------------------- products ---------------------------- */

routes['GET /api/products'] = () => ({ products: listProducts() });

routes['GET /api/product'] = (ctx) => {
  const slug = V.str(ctx.query.slug, { min: 1, max: 200 });
  if (!slug) bad('Missing product.');
  const row = db.prepare(`SELECT p.*, ${RATING_SQL} FROM products p WHERE p.slug = ? AND p.hidden = 0`).get(slug);
  if (!row) missing('That perfume is no longer listed.');

  const product = shapeProduct(row);
  const reviews = reviewsFor(row.id, ctx.session);
  let canReview = false, alreadyReviewed = false;
  if (ctx.session) {
    alreadyReviewed = !!db.prepare(`SELECT 1 FROM reviews WHERE product_id = ? AND user_id = ?`)
      .get(row.id, ctx.session.user_id);
    canReview = !alreadyReviewed && !!purchasedOrderId(ctx.session.user_id, row.id);
  }
  return { product, reviews, canReview, alreadyReviewed };
};

/* ------------------------------- cart ------------------------------ */

function mergeGuestCart(fromKey, toKey) {
  if (!fromKey || fromKey === toKey) return;
  const items = db.prepare(`SELECT * FROM cart_items WHERE cart_key = ?`).all(fromKey);
  if (!items.length) return;
  tx(() => {
    for (const it of items) {
      const existing = db.prepare(
        `SELECT id, qty FROM cart_items WHERE cart_key = ? AND product_id = ? AND size_label = ?`
      ).get(toKey, it.product_id, it.size_label);
      if (existing) {
        db.prepare(`UPDATE cart_items SET qty = MIN(qty + ?, 99) WHERE id = ?`).run(it.qty, existing.id);
      } else {
        db.prepare(`
          INSERT INTO cart_items (cart_key, product_id, size_label, unit_price_cents, qty)
          VALUES (?, ?, ?, ?, ?)`).run(toKey, it.product_id, it.size_label, it.unit_price_cents, it.qty);
      }
    }
    db.prepare(`DELETE FROM cart_items WHERE cart_key = ?`).run(fromKey);
  });
}

routes['GET /api/cart'] = (ctx) => ({ cart: cartRows(ctx.cartKey) });

routes['POST /api/cart/add'] = (ctx) => {
  const productId = V.int(ctx.body.product_id, { min: 1 });
  const qty = V.int(ctx.body.qty ?? 1, { min: 1, max: 99 });
  if (!productId || !qty) bad('Invalid item.');

  const p = db.prepare(`SELECT * FROM products WHERE id = ? AND hidden = 0`).get(productId);
  if (!p) missing('That perfume is not available.');
  if (p.stock < 1) bad('That perfume is out of stock.');

  const sizes = JSON.parse(p.sizes_json || '[]');
  if (!sizes.length) bad('That perfume has no sizes set up.');
  const wanted = V.str(ctx.body.size_label, { max: 40 });
  // PRICE IS NEVER TAKEN FROM THE CLIENT — always read from the database.
  const size = (wanted && sizes.find(s => s.label === wanted)) || sizes[0];

  const existing = db.prepare(
    `SELECT id, qty FROM cart_items WHERE cart_key = ? AND product_id = ? AND size_label = ?`
  ).get(ctx.cartKey, productId, size.label);

  if (existing) {
    db.prepare(`UPDATE cart_items SET qty = MIN(?, 99) WHERE id = ?`).run(existing.qty + qty, existing.id);
  } else {
    db.prepare(`
      INSERT INTO cart_items (cart_key, product_id, size_label, unit_price_cents, qty)
      VALUES (?, ?, ?, ?, ?)`).run(ctx.cartKey, productId, size.label, size.price_cents, qty);
  }
  return { cart: cartRows(ctx.cartKey) };
};

routes['POST /api/cart/update'] = (ctx) => {
  const id = V.int(ctx.body.id, { min: 1 });
  const qty = V.int(ctx.body.qty, { min: 0, max: 99 });
  if (!id || qty == null) bad('Invalid change.');
  // Scoped to this cart_key: you cannot touch anyone else's basket.
  if (qty === 0) db.prepare(`DELETE FROM cart_items WHERE id = ? AND cart_key = ?`).run(id, ctx.cartKey);
  else db.prepare(`UPDATE cart_items SET qty = ? WHERE id = ? AND cart_key = ?`).run(qty, id, ctx.cartKey);
  return { cart: cartRows(ctx.cartKey) };
};

routes['POST /api/cart/remove'] = (ctx) => {
  const id = V.int(ctx.body.id, { min: 1 });
  if (!id) bad('Invalid item.');
  db.prepare(`DELETE FROM cart_items WHERE id = ? AND cart_key = ?`).run(id, ctx.cartKey);
  return { cart: cartRows(ctx.cartKey) };
};

/* ----------------------------- checkout ---------------------------- */

routes['POST /api/checkout'] = (ctx) => {
  const limit = rateLimit(`checkout:${ctx.ip}`, 10, 10 * 60 * 1000);
  if (!limit.ok) throw new HttpError(429, 'Too many checkout attempts. Try again shortly.');

  const name = V.str(ctx.body.customer_name, { min: 2, max: 100 });
  const email = V.email(ctx.body.customer_email);
  const address = V.str(ctx.body.shipping_address, { min: 5, max: 500 });
  if (!name) bad('Enter the delivery name.', 'customer_name');
  if (!email) bad('Enter a valid email address.', 'customer_email');
  if (!address) bad('Enter a delivery address.', 'shipping_address');

  const cardNumber = String(ctx.body.card_number || '').replace(/\D/g, '');
  const expiry = V.str(ctx.body.card_expiry, { max: 7 }) || '';
  const cvc = String(ctx.body.card_cvc || '').replace(/\D/g, '');
  if (!luhn(cardNumber)) bad('That card number is not valid.', 'card_number');
  if (!/^\d{2}\/?\d{2}$/.test(expiry)) bad('Expiry should be MM/YY.', 'card_expiry');
  const [mm, yy] = expiry.replace('/', '').match(/.{1,2}/g);
  const expDate = new Date(2000 + +yy, +mm, 0, 23, 59, 59);
  if (+mm < 1 || +mm > 12 || expDate < new Date()) bad('That card has expired.', 'card_expiry');
  if (!/^\d{3,4}$/.test(cvc)) bad('CVC should be 3 or 4 digits.', 'card_cvc');

  const items = cartRows(ctx.cartKey);
  if (!items.length) bad('Your basket is empty.');

  // Everything below is one atomic transaction: either the order is written
  // and stock is decremented, or nothing changes at all.
  const order = tx(() => {
    let subtotal = 0;
    for (const it of items) {
      const p = db.prepare(`SELECT stock, hidden, sizes_json, name FROM products WHERE id = ?`).get(it.product_id);
      if (!p || p.hidden) throw new HttpError(409, `${it.product_name} is no longer available.`);
      if (p.stock < it.qty) throw new HttpError(409, `Only ${p.stock} left of ${it.product_name}.`);
      // Re-price from the database in case the admin changed it mid-session.
      const sizes = JSON.parse(p.sizes_json || '[]');
      const size = sizes.find(s => s.label === it.size_label);
      if (!size) throw new HttpError(409, `${it.product_name} (${it.size_label}) is no longer sold.`);
      it.unit_price_cents = size.price_cents;
      subtotal += size.price_cents * it.qty;
    }

    const orderNumber = 'ML-' + Date.now().toString(36).toUpperCase() + '-' +
      randomToken(3).replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();

    const info = db.prepare(`
      INSERT INTO orders (order_number, user_id, customer_name, customer_email,
        shipping_address, status, subtotal_cents, total_cents, pay_brand, pay_last4)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
    ).run(orderNumber, ctx.session ? ctx.session.user_id : null, name, email, address,
          subtotal, subtotal, cardBrand(cardNumber), cardNumber.slice(-4));
    // NOTE: only brand + last 4 are stored. The full PAN and the CVC are
    // never written to disk and never leave this function.

    const orderId = Number(info.lastInsertRowid);
    const insItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, size_label, unit_price_cents, qty)
      VALUES (?, ?, ?, ?, ?, ?)`);
    const dec = db.prepare(`UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?`);
    for (const it of items) {
      insItem.run(orderId, it.product_id, it.product_name, it.size_label, it.unit_price_cents, it.qty);
      dec.run(it.qty, it.product_id);
    }
    db.prepare(`DELETE FROM cart_items WHERE cart_key = ?`).run(ctx.cartKey);
    return { id: orderId, order_number: orderNumber, total_cents: subtotal };
  });

  return { order_number: order.order_number, total_cents: order.total_cents };
};

/* ------------------------------ orders ----------------------------- */

routes['GET /api/orders'] = (ctx) => {
  if (!ctx.session) denied();
  const orders = db.prepare(
    `SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100`
  ).all(ctx.session.user_id);
  return { orders: orders.map(o => ({ ...o, items: orderItems(o.id), reviewable: reviewableItems(ctx.session.user_id, o.id) })) };
};

function orderItems(orderId) {
  return db.prepare(`
    SELECT oi.*, p.slug FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?`).all(orderId);
}

/** Products in this order the user has not reviewed yet. */
function reviewableItems(userId, orderId) {
  return db.prepare(`
    SELECT DISTINCT oi.product_id, oi.product_name, p.slug
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.id = ? AND o.user_id = ? AND o.status != 'cancelled'
      AND oi.product_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.product_id = oi.product_id AND r.user_id = ?)
  `).all(orderId, userId, userId);
}

routes['GET /api/order'] = (ctx) => {
  const num = V.str(ctx.query.number, { min: 3, max: 60 });
  if (!num) bad('Missing order number.');
  const o = db.prepare(`SELECT * FROM orders WHERE order_number = ?`).get(num);
  if (!o) missing('We could not find that order.');
  // A guest may view the order they just placed; a signed-in user may view
  // their own; an admin may view any.
  const mine = ctx.session && o.user_id === ctx.session.user_id;
  const isAdmin = ctx.session && ctx.session.is_admin;
  const justPlaced = ctx.recentOrders.includes(num);
  if (!mine && !isAdmin && !justPlaced) forbidden('Sign in to view that order.');
  return { order: { ...o, items: orderItems(o.id) } };
};

/* ----------------------------- reviews ----------------------------- */

routes['GET /api/reviews'] = (ctx) => {
  const productId = V.int(ctx.query.product_id, { min: 1 });
  if (!productId) bad('Missing product.');
  return { reviews: reviewsFor(productId, ctx.session) };
};

routes['POST /api/reviews'] = (ctx) => {
  if (!ctx.session) denied('Sign in to leave a review.');
  const limit = rateLimit(`review:${ctx.session.user_id}`, 10, 60 * 60 * 1000);
  if (!limit.ok) throw new HttpError(429, 'You have posted a lot of reviews just now. Try again later.');

  const productId = V.int(ctx.body.product_id, { min: 1 });
  const rating = V.int(ctx.body.rating, { min: 1, max: 5 });
  const title = V.str(ctx.body.title, { max: 120 }) ?? '';
  const body = V.str(ctx.body.body, { min: 3, max: 3000 });
  if (!productId) bad('Missing product.');
  if (!rating) bad('Choose a rating from 1 to 5 stars.', 'rating');
  if (!body) bad('Write a few words about the fragrance.', 'body');

  const product = db.prepare(`SELECT id FROM products WHERE id = ?`).get(productId);
  if (!product) missing('That perfume no longer exists.');

  // The verified-purchase gate. Enforced here, on the server, every time.
  const orderId = purchasedOrderId(ctx.session.user_id, productId);
  if (!orderId) forbidden('You can review a fragrance once you have ordered it.');

  const dupe = db.prepare(`SELECT id FROM reviews WHERE product_id = ? AND user_id = ?`)
    .get(productId, ctx.session.user_id);
  if (dupe) bad('You have already reviewed this fragrance. Edit your review instead.');

  db.prepare(`
    INSERT INTO reviews (product_id, user_id, order_id, rating, title, body)
    VALUES (?, ?, ?, ?, ?, ?)`).run(productId, ctx.session.user_id, orderId, rating, title, body);

  return { ok: true, reviews: reviewsFor(productId, ctx.session) };
};

routes['POST /api/reviews/update'] = (ctx) => {
  if (!ctx.session) denied();
  const id = V.int(ctx.body.id, { min: 1 });
  const rating = V.int(ctx.body.rating, { min: 1, max: 5 });
  const title = V.str(ctx.body.title, { max: 120 }) ?? '';
  const body = V.str(ctx.body.body, { min: 3, max: 3000 });
  if (!id || !rating || !body) bad('Check the rating and review text.');

  const r = db.prepare(`SELECT * FROM reviews WHERE id = ?`).get(id);
  if (!r) missing('Review not found.');
  if (r.user_id !== ctx.session.user_id && !ctx.session.is_admin) forbidden();

  db.prepare(`UPDATE reviews SET rating = ?, title = ?, body = ? WHERE id = ?`)
    .run(rating, title, body, id);
  return { ok: true, reviews: reviewsFor(r.product_id, ctx.session) };
};

routes['POST /api/reviews/delete'] = (ctx) => {
  if (!ctx.session) denied();
  const id = V.int(ctx.body.id, { min: 1 });
  const r = db.prepare(`SELECT * FROM reviews WHERE id = ?`).get(id);
  if (!r) missing('Review not found.');
  if (r.user_id !== ctx.session.user_id && !ctx.session.is_admin) forbidden();
  db.prepare(`DELETE FROM reviews WHERE id = ?`).run(id);
  return { ok: true, reviews: reviewsFor(r.product_id, ctx.session) };
};

/* ----------------------------- contact ----------------------------- */

routes['POST /api/contact'] = (ctx) => {
  const limit = rateLimit(`contact:${ctx.ip}`, 5, 60 * 60 * 1000);
  if (!limit.ok) throw new HttpError(429, 'Too many messages sent. Try again later.');

  const name = V.str(ctx.body.name, { min: 2, max: 100 });
  const email = V.email(ctx.body.email);
  const subject = V.str(ctx.body.subject, { max: 150 }) ?? '';
  const body = V.str(ctx.body.message, { min: 5, max: 5000 });
  if (!name) bad('Enter your name.', 'name');
  if (!email) bad('Enter a valid email address.', 'email');
  if (!body) bad('Write your message.', 'message');
  if (V.str(ctx.body.website, { max: 100 })) return { ok: true }; // honeypot: silently drop bots

  db.prepare(`INSERT INTO messages (name, email, subject, body) VALUES (?, ?, ?, ?)`)
    .run(name, email, subject, body);
  return { ok: true };
};

/* ============================== admin ============================== */

function requireAdmin(ctx) {
  if (!ctx.session) denied();
  if (!ctx.session.is_admin) forbidden();
  return ctx.session;
}

routes['GET /api/admin/overview'] = (ctx) => {
  requireAdmin(ctx);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const threshold = parseInt(settingsMap().low_stock_threshold, 10) || 5;
  return {
    stats: {
      products: one(`SELECT COUNT(*) n FROM products`).n,
      orders: one(`SELECT COUNT(*) n FROM orders`).n,
      revenue_cents: one(`SELECT COALESCE(SUM(total_cents),0) n FROM orders WHERE status != 'cancelled'`).n,
      customers: one(`SELECT COUNT(*) n FROM users WHERE is_admin = 0`).n,
      unread_messages: one(`SELECT COUNT(*) n FROM messages WHERE is_read = 0`).n,
      reviews: one(`SELECT COUNT(*) n FROM reviews`).n,
      low_stock: db.prepare(`SELECT id, name, stock FROM products WHERE stock <= ? ORDER BY stock ASC`).all(threshold)
    },
    recent_orders: db.prepare(`SELECT * FROM orders ORDER BY id DESC LIMIT 8`).all()
  };
};

routes['GET /api/admin/products'] = (ctx) => {
  requireAdmin(ctx);
  return { products: listProducts({ includeHidden: true }) };
};

function readProductInput(bodyIn, { partial = false } = {}) {
  const out = {};
  const put = (key, val, required) => {
    if (val === null && required && !partial) bad(`Check the ${key.replace(/_/g, ' ')} field.`, key);
    if (val !== null && val !== undefined) out[key] = val;
  };
  if (bodyIn.name !== undefined || !partial) put('name', V.str(bodyIn.name, { min: 1, max: 120 }), true);
  if (bodyIn.category !== undefined) put('category', V.str(bodyIn.category, { min: 1, max: 40 }));
  for (const f of ['short_description', 'description', 'top_notes', 'middle_notes', 'base_notes', 'brand']) {
    if (bodyIn[f] !== undefined) put(f, V.str(bodyIn[f], { max: 4000 }) ?? '');
  }
  if (bodyIn.image_url !== undefined) {
    const url = V.str(bodyIn.image_url, { max: 2000 }) ?? '';
    // Only http(s) and data: images — blocks javascript: URLs in an <img src>.
    if (url && !/^(https?:\/\/|data:image\/)/i.test(url)) bad('Image URL must start with https:// or be an uploaded image.', 'image_url');
    put('image_url', url);
  }
  if (bodyIn.stock !== undefined) put('stock', V.int(bodyIn.stock, { min: 0, max: 1000000 }), true);
  for (const f of ['is_featured', 'is_bestseller', 'is_new_arrival', 'hidden']) {
    if (bodyIn[f] !== undefined) out[f] = V.bool(bodyIn[f]);
  }
  if (bodyIn.sizes !== undefined) {
    const sizes = Array.isArray(bodyIn.sizes) ? bodyIn.sizes : [];
    const clean = [];
    for (const s of sizes.slice(0, 12)) {
      const label = V.str(s && s.label, { min: 1, max: 40 });
      const price = V.int(s && s.price_cents, { min: 0, max: 100000000 });
      if (label && price !== null) clean.push({ label, price_cents: price });
    }
    if (!clean.length) bad('Add at least one size with a price.', 'sizes');
    out.sizes_json = JSON.stringify(clean);
  }
  return out;
}

routes['POST /api/admin/products/create'] = (ctx) => {
  requireAdmin(ctx);
  const data = readProductInput(ctx.body);
  if (!data.sizes_json) bad('Add at least one size with a price.', 'sizes');
  data.slug = slugify(data.name);
  const keys = Object.keys(data);
  const info = db.prepare(
    `INSERT INTO products (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map(k => data[k]));
  return { id: Number(info.lastInsertRowid), products: listProducts({ includeHidden: true }) };
};

routes['POST /api/admin/products/update'] = (ctx) => {
  requireAdmin(ctx);
  const id = V.int(ctx.body.id, { min: 1 });
  if (!id) bad('Missing product.');
  const exists = db.prepare(`SELECT id FROM products WHERE id = ?`).get(id);
  if (!exists) missing('Product not found.');

  const data = readProductInput(ctx.body, { partial: true });
  const keys = Object.keys(data);
  if (keys.length) {
    db.prepare(`UPDATE products SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...keys.map(k => data[k]), id);
  }
  return { products: listProducts({ includeHidden: true }) };
};

routes['POST /api/admin/products/delete'] = (ctx) => {
  requireAdmin(ctx);
  const id = V.int(ctx.body.id, { min: 1 });
  if (!id) bad('Missing product.');
  db.prepare(`DELETE FROM products WHERE id = ?`).run(id);
  return { products: listProducts({ includeHidden: true }) };
};

routes['POST /api/admin/stock'] = (ctx) => {
  requireAdmin(ctx);
  const updates = Array.isArray(ctx.body.updates) ? ctx.body.updates : [];
  const stmt = db.prepare(`UPDATE products SET stock = ? WHERE id = ?`);
  tx(() => {
    for (const u of updates.slice(0, 500)) {
      const id = V.int(u.id, { min: 1 });
      const stock = V.int(u.stock, { min: 0, max: 1000000 });
      if (id && stock !== null) stmt.run(stock, id);
    }
  });
  return { products: listProducts({ includeHidden: true }) };
};

routes['GET /api/admin/orders'] = (ctx) => {
  requireAdmin(ctx);
  const orders = db.prepare(`SELECT * FROM orders ORDER BY id DESC LIMIT 500`).all();
  return { orders: orders.map(o => ({ ...o, items: orderItems(o.id) })) };
};

const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];

routes['POST /api/admin/orders/status'] = (ctx) => {
  requireAdmin(ctx);
  const id = V.int(ctx.body.id, { min: 1 });
  const status = V.oneOf(ctx.body.status, ORDER_STATUSES);
  if (!id || !status) bad('Choose a valid status.');
  db.prepare(`UPDATE orders SET status = ? WHERE id = ?`).run(status, id);
  return { ok: true };
};

routes['GET /api/admin/customers'] = (ctx) => {
  requireAdmin(ctx);
  return {
    customers: db.prepare(`
      SELECT u.id, u.full_name, u.email, u.is_admin, u.is_active, u.created_at,
        (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
        (SELECT COALESCE(SUM(total_cents),0) FROM orders o WHERE o.user_id = u.id AND o.status != 'cancelled') AS spent_cents
      FROM users u ORDER BY u.id DESC LIMIT 500`).all()
  };
};

routes['POST /api/admin/customers/toggle'] = (ctx) => {
  const me = requireAdmin(ctx);
  const id = V.int(ctx.body.id, { min: 1 });
  if (!id) bad('Missing customer.');
  if (id === me.user_id) bad('You cannot disable your own account.');
  const u = db.prepare(`SELECT is_active FROM users WHERE id = ?`).get(id);
  if (!u) missing('Customer not found.');
  const next = u.is_active ? 0 : 1;
  db.prepare(`UPDATE users SET is_active = ? WHERE id = ?`).run(next, id);
  if (!next) db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(id); // kick them out now
  return { is_active: next };
};

routes['GET /api/admin/categories'] = (ctx) => {
  requireAdmin(ctx);
  return { categories: db.prepare(`SELECT * FROM categories ORDER BY id`).all() };
};

routes['POST /api/admin/categories/save'] = (ctx) => {
  requireAdmin(ctx);
  const id = ctx.body.id ? V.int(ctx.body.id, { min: 1 }) : null;
  const label = V.str(ctx.body.label, { min: 1, max: 60 });
  if (!label) bad('Enter a category name.', 'label');
  const key = V.str(ctx.body.key, { min: 1, max: 40 }) ||
    label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (id) db.prepare(`UPDATE categories SET key = ?, label = ? WHERE id = ?`).run(key, label, id);
  else {
    if (db.prepare(`SELECT 1 FROM categories WHERE key = ?`).get(key)) bad('That category already exists.', 'key');
    db.prepare(`INSERT INTO categories (key, label) VALUES (?, ?)`).run(key, label);
  }
  return { categories: db.prepare(`SELECT * FROM categories ORDER BY id`).all() };
};

routes['POST /api/admin/categories/delete'] = (ctx) => {
  requireAdmin(ctx);
  const id = V.int(ctx.body.id, { min: 1 });
  if (!id) bad('Missing category.');
  const cat = db.prepare(`SELECT key FROM categories WHERE id = ?`).get(id);
  if (!cat) missing('Category not found.');
  const inUse = db.prepare(`SELECT COUNT(*) n FROM products WHERE category = ?`).get(cat.key).n;
  if (inUse) bad(`${inUse} perfume(s) still use that category. Move them first.`);
  db.prepare(`DELETE FROM categories WHERE id = ?`).run(id);
  return { categories: db.prepare(`SELECT * FROM categories ORDER BY id`).all() };
};

const ALLOWED_SETTINGS = new Set([
  'site_title', 'logo_text', 'color_primary', 'color_secondary', 'color_background',
  'hero_eyebrow', 'hero_headline', 'hero_description', 'hero_cta_text', 'hero_cta_link',
  'about_heading', 'about_body', 'contact_email', 'contact_phone', 'contact_address',
  'instagram', 'pinterest', 'footer_text', 'banner_text', 'low_stock_threshold'
]);

routes['POST /api/admin/settings'] = (ctx) => {
  requireAdmin(ctx);
  const patch = ctx.body.settings && typeof ctx.body.settings === 'object' ? ctx.body.settings : {};
  const stmt = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  tx(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (!ALLOWED_SETTINGS.has(k)) continue;   // allow-list: no arbitrary keys
      const val = V.str(v, { max: 4000 });
      if (val === null) continue;
      stmt.run(k, val);
    }
    if (Array.isArray(ctx.body.testimonials)) {
      const clean = ctx.body.testimonials.slice(0, 12).map(t => ({
        name: V.str(t && t.name, { max: 80 }) ?? '',
        role: V.str(t && t.role, { max: 100 }) ?? '',
        quote: V.str(t && t.quote, { max: 500 }) ?? ''
      })).filter(t => t.quote);
      stmt.run('testimonials_json', JSON.stringify(clean));
    }
  });
  return { settings: settingsMap() };
};

routes['GET /api/admin/messages'] = (ctx) => {
  requireAdmin(ctx);
  return { messages: db.prepare(`SELECT * FROM messages ORDER BY id DESC LIMIT 500`).all() };
};

routes['POST /api/admin/messages/read'] = (ctx) => {
  requireAdmin(ctx);
  const id = V.int(ctx.body.id, { min: 1 });
  if (!id) bad('Missing message.');
  db.prepare(`UPDATE messages SET is_read = 1 WHERE id = ?`).run(id);
  return { ok: true };
};

routes['POST /api/admin/messages/delete'] = (ctx) => {
  requireAdmin(ctx);
  const id = V.int(ctx.body.id, { min: 1 });
  if (!id) bad('Missing message.');
  db.prepare(`DELETE FROM messages WHERE id = ?`).run(id);
  return { ok: true };
};

routes['GET /api/admin/reviews'] = (ctx) => {
  requireAdmin(ctx);
  return {
    reviews: db.prepare(`
      SELECT r.*, u.full_name, u.email, p.name AS product_name, p.slug
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN products p ON p.id = r.product_id
      ORDER BY r.id DESC LIMIT 500`).all()
  };
};

routes['POST /api/admin/reviews/status'] = (ctx) => {
  requireAdmin(ctx);
  const id = V.int(ctx.body.id, { min: 1 });
  const status = V.oneOf(ctx.body.status, ['published', 'hidden']);
  if (!id || !status) bad('Choose a valid status.');
  db.prepare(`UPDATE reviews SET status = ? WHERE id = ?`).run(status, id);
  return { ok: true };
};

module.exports = { routes, HttpError, getSession, destroySession, settingsMap, mergeGuestCart };
