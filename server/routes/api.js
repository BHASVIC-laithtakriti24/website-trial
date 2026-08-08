// server/routes/api.js — customer-facing API (auth, shop, cart, contact)
import crypto from 'node:crypto';
import {
  hashPassword, verifyPassword, createSession, destroySession, getUserBySession,
  isValidEmail, isValidPassword, isRateLimited, recordFailedAttempt, clearAttempts, newToken
} from '../auth.js';
import { sendJson, sendEmail, escapeHtml } from '../utils.js';

const SESSION_COOKIE = 'lunar_session';
const CART_COOKIE = 'lunar_cart';

function publicUser(u) {
  return { id: u.id, full_name: u.full_name, email: u.email, is_admin: !!u.is_admin, created_at: u.created_at };
}

function getOrCreateCart(db, ctx) {
  // Prefer a logged-in user's cart; fall back to a guest cart_token cookie.
  if (ctx.user) {
    let cart = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(ctx.user.id);
    if (!cart) {
      const info = db.prepare('INSERT INTO carts (user_id) VALUES (?)').run(ctx.user.id);
      cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(info.lastInsertRowid);
    }
    return cart;
  }
  const token = ctx.cookies[CART_COOKIE];
  let cart = token ? db.prepare('SELECT * FROM carts WHERE cart_token = ?').get(token) : null;
  if (!cart) {
    const newTok = newToken();
    const info = db.prepare('INSERT INTO carts (cart_token) VALUES (?)').run(newTok);
    cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(info.lastInsertRowid);
    ctx.setCookie(CART_COOKIE, newTok, { maxAge: 60 * 60 * 24 * 60 });
  }
  return cart;
}

function cartPayload(db, cart) {
  const items = db.prepare(`
    SELECT ci.id, ci.product_id, ci.size_label, ci.unit_price_cents, ci.qty,
           p.name, p.slug, p.image_url, p.stock
    FROM cart_items ci JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = ?
    ORDER BY ci.id ASC
  `).all(cart.id);
  const subtotal = items.reduce((sum, i) => sum + i.unit_price_cents * i.qty, 0);
  return { items, subtotal_cents: subtotal, total_cents: subtotal };
}

export function registerApiRoutes(router, db) {

  // ---------------- AUTH ----------------

  router.post('/api/auth/register', async (req, res, ctx) => {
    const { full_name, email, password, confirm_password } = ctx.body;
    if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
      return sendJson(res, 400, { error: 'Please enter your full name.' });
    }
    if (!isValidEmail(email)) return sendJson(res, 400, { error: 'Please enter a valid email address.' });
    if (!isValidPassword(password)) {
      return sendJson(res, 400, { error: 'Password must be at least 8 characters and include a letter and a number.' });
    }
    if (password !== confirm_password) return sendJson(res, 400, { error: 'Passwords do not match.' });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return sendJson(res, 409, { error: 'An account with that email already exists.' });

    const { hash, salt } = hashPassword(password);
    const info = db.prepare(`
      INSERT INTO users (full_name, email, password_hash, password_salt, is_admin, is_active)
      VALUES (?, ?, ?, ?, 0, 1)
    `).run(full_name.trim(), email.toLowerCase(), hash, salt);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    const session = createSession(db, user.id, false);
    ctx.setCookie(SESSION_COOKIE, session.token, { maxAge: session.maxAgeSeconds });

    sendEmail({
      to: user.email,
      subject: 'Welcome to Maison Lunar',
      html: `<p>Hi ${escapeHtml(full_name)},</p><p>Your Maison Lunar account has been created. We're glad to have you.</p>`
    }).catch(() => {});

    sendJson(res, 201, { user: publicUser(user) });
  });

  router.post('/api/auth/login', async (req, res, ctx) => {
    const { email, password, remember } = ctx.body;
    const ip = req.socket.remoteAddress || 'unknown';
    const rlKey = `${ip}:${(email || '').toLowerCase()}`;

    if (isRateLimited(rlKey)) {
      return sendJson(res, 429, { error: 'Too many failed attempts. Please try again in 15 minutes.' });
    }
    if (!isValidEmail(email) || typeof password !== 'string' || !password) {
      recordFailedAttempt(rlKey);
      return sendJson(res, 400, { error: 'Invalid email or password.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      recordFailedAttempt(rlKey);
      return sendJson(res, 401, { error: 'Invalid email or password.' });
    }
    if (!user.is_active) {
      return sendJson(res, 403, { error: 'This account has been disabled. Contact support for help.' });
    }

    clearAttempts(rlKey);
    const session = createSession(db, user.id, !!remember);
    ctx.setCookie(SESSION_COOKIE, session.token, { maxAge: session.maxAgeSeconds });
    sendJson(res, 200, { user: publicUser(user) });
  });

  router.post('/api/auth/logout', async (req, res, ctx) => {
    const token = ctx.cookies[SESSION_COOKIE];
    if (token) destroySession(db, token);
    ctx.clearCookie(SESSION_COOKIE);
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/auth/me', async (req, res, ctx) => {
    if (!ctx.user) return sendJson(res, 200, { user: null });
    sendJson(res, 200, { user: publicUser(ctx.user) });
  });

  router.post('/api/auth/forgot-password', async (req, res, ctx) => {
    const { email } = ctx.body;
    // Always return a generic success message — never reveal whether an
    // email exists in the system (prevents user enumeration attacks).
    if (isValidEmail(email)) {
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
      if (user) {
        const token = newToken();
        const expires = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 min
        db.prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expires);
        const resetUrl = `${ctx.origin}/reset-password.html?token=${token}`;
        sendEmail({
          to: user.email,
          subject: 'Reset your Maison Lunar password',
          html: `<p>Someone requested a password reset for this account.</p><p><a href="${resetUrl}">Click here to reset your password</a>. This link expires in 30 minutes.</p><p>If you didn't request this, you can ignore this email.</p>`
        }).catch(() => {});
      }
    }
    sendJson(res, 200, { ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
  });

  router.post('/api/auth/reset-password', async (req, res, ctx) => {
    const { token, password } = ctx.body;
    if (!token || !isValidPassword(password)) {
      return sendJson(res, 400, { error: 'Invalid request or password too weak.' });
    }
    const reset = db.prepare(`
      SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime('now')
    `).get(token);
    if (!reset) return sendJson(res, 400, { error: 'This reset link is invalid or has expired.' });

    const { hash, salt } = hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, reset.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(token);
    // Invalidate all existing sessions for this user as a security measure.
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(reset.user_id);
    sendJson(res, 200, { ok: true });
  });

  // ---------------- PRODUCTS ----------------

  router.get('/api/products', async (req, res, ctx) => {
    const { category, featured, bestseller, new: newArrival, search } = ctx.query;
    let sql = 'SELECT * FROM products WHERE 1=1';
    const args = [];
    if (category) { sql += ' AND category = ?'; args.push(category); }
    if (featured === '1') sql += ' AND is_featured = 1';
    if (bestseller === '1') sql += ' AND is_bestseller = 1';
    if (newArrival === '1') sql += ' AND is_new_arrival = 1';
    if (search) { sql += ' AND (name LIKE ? OR short_description LIKE ?)'; args.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY created_at DESC';
    const rows = db.prepare(sql).all(...args);
    sendJson(res, 200, { products: rows.map(formatProduct) });
  });

  router.get('/api/products/:slug', async (req, res, ctx) => {
    const p = db.prepare('SELECT * FROM products WHERE slug = ?').get(ctx.params.slug);
    if (!p) return sendJson(res, 404, { error: 'Product not found.' });
    const related = db.prepare('SELECT * FROM products WHERE category = ? AND id != ? LIMIT 4').all(p.category, p.id);
    sendJson(res, 200, { product: formatProduct(p), related: related.map(formatProduct) });
  });

  // ---------------- CART ----------------

  router.get('/api/cart', async (req, res, ctx) => {
    const cart = getOrCreateCart(db, ctx);
    sendJson(res, 200, cartPayload(db, cart));
  });

  router.post('/api/cart/items', async (req, res, ctx) => {
    const { product_id, size_label, qty } = ctx.body;
    const quantity = Math.max(1, Math.min(20, parseInt(qty, 10) || 1));
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
    if (!product) return sendJson(res, 404, { error: 'Product not found.' });
    const sizes = JSON.parse(product.sizes || '[]');
    const size = sizes.find(s => s.label === size_label) || sizes[0];
    if (!size) return sendJson(res, 400, { error: 'No size available for this product.' });
    if (product.stock < 1) return sendJson(res, 400, { error: 'This product is currently out of stock.' });

    const cart = getOrCreateCart(db, ctx);
    const existing = db.prepare('SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ? AND size_label = ?')
      .get(cart.id, product.id, size.label);
    if (existing) {
      db.prepare('UPDATE cart_items SET qty = qty + ? WHERE id = ?').run(quantity, existing.id);
    } else {
      db.prepare('INSERT INTO cart_items (cart_id, product_id, size_label, unit_price_cents, qty) VALUES (?, ?, ?, ?, ?)')
        .run(cart.id, product.id, size.label, size.price_cents, quantity);
    }
    sendJson(res, 200, cartPayload(db, cart));
  });

  router.patch('/api/cart/items/:id', async (req, res, ctx) => {
    const qty = Math.max(0, Math.min(20, parseInt(ctx.body.qty, 10) || 0));
    const cart = getOrCreateCart(db, ctx);
    const item = db.prepare('SELECT * FROM cart_items WHERE id = ? AND cart_id = ?').get(ctx.params.id, cart.id);
    if (!item) return sendJson(res, 404, { error: 'Item not found in cart.' });
    if (qty === 0) {
      db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
    } else {
      db.prepare('UPDATE cart_items SET qty = ? WHERE id = ?').run(qty, item.id);
    }
    sendJson(res, 200, cartPayload(db, cart));
  });

  router.delete('/api/cart/items/:id', async (req, res, ctx) => {
    const cart = getOrCreateCart(db, ctx);
    db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(ctx.params.id, cart.id);
    sendJson(res, 200, cartPayload(db, cart));
  });

  router.post('/api/cart/checkout', async (req, res, ctx) => {
    const { customer_name, customer_email, shipping_address } = ctx.body;
    if (!customer_name || !isValidEmail(customer_email)) {
      return sendJson(res, 400, { error: 'Please provide a valid name and email.' });
    }
    const cart = getOrCreateCart(db, ctx);
    const payload = cartPayload(db, cart);
    if (payload.items.length === 0) return sendJson(res, 400, { error: 'Your cart is empty.' });

    const orderNumber = 'ML-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
    const info = db.prepare(`
      INSERT INTO orders (order_number, user_id, customer_name, customer_email, shipping_address, status, subtotal_cents, total_cents)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(orderNumber, ctx.user ? ctx.user.id : null, customer_name, customer_email, shipping_address || '', payload.subtotal_cents, payload.total_cents);

    const orderId = info.lastInsertRowid;
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, size_label, unit_price_cents, qty)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const item of payload.items) {
      insertItem.run(orderId, item.product_id, item.name, item.size_label, item.unit_price_cents, item.qty);
      db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?').run(item.qty, item.product_id);
    }
    db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);

    sendEmail({
      to: customer_email,
      subject: `Order confirmation — ${orderNumber}`,
      html: `<p>Thank you, ${escapeHtml(customer_name)} — your Maison Lunar order <strong>${orderNumber}</strong> has been received.</p>
             <p>Total: £${(payload.total_cents / 100).toFixed(2)}</p>`
    }).catch(() => {});

    sendJson(res, 201, { order_number: orderNumber, total_cents: payload.total_cents });
  });

  router.get('/api/orders/mine', async (req, res, ctx) => {
    if (!ctx.user) return sendJson(res, 401, { error: 'Please log in to view your orders.' });
    const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(ctx.user.id);
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
    const withItems = orders.map(o => ({ ...o, items: items.all(o.id) }));
    sendJson(res, 200, { orders: withItems });
  });

  // ---------------- CONTACT ----------------

  router.post('/api/contact', async (req, res, ctx) => {
    const { name, email, subject, message, company } = ctx.body; // "company" = honeypot
    if (company) return sendJson(res, 200, { ok: true }); // silently drop bot submissions
    if (!name || !isValidEmail(email) || !subject || !message) {
      return sendJson(res, 400, { error: 'Please fill in all fields with a valid email address.' });
    }
    db.prepare('INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)')
      .run(name.trim(), email.toLowerCase(), subject.trim(), message.trim());

    const settings = db.prepare('SELECT value FROM site_settings WHERE key = ?').get('contact_email');
    const businessEmail = settings ? settings.value : 'hello@maisonlunar.com';

    const result = await sendEmail({
      to: businessEmail,
      subject: `New contact form message: ${subject}`,
      html: `<p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p><p><strong>Subject:</strong> ${escapeHtml(subject)}</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
      replyTo: email
    });

    sendJson(res, 201, { ok: true, emailed: result.sent });
  });

  // ---------------- SETTINGS (public read) ----------------

  router.get('/api/settings', async (req, res) => {
    const rows = db.prepare('SELECT key, value FROM site_settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    if (settings.testimonials) { try { settings.testimonials = JSON.parse(settings.testimonials); } catch { settings.testimonials = []; } }
    sendJson(res, 200, { settings });
  });
}

export function formatProduct(p) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    category: p.category,
    short_description: p.short_description,
    description: p.description,
    top_notes: p.top_notes,
    middle_notes: p.middle_notes,
    base_notes: p.base_notes,
    image_url: p.image_url,
    sizes: JSON.parse(p.sizes || '[]'),
    stock: p.stock,
    is_featured: !!p.is_featured,
    is_bestseller: !!p.is_bestseller,
    is_new_arrival: !!p.is_new_arrival,
    price_from_cents: Math.min(...JSON.parse(p.sizes || '[{"price_cents":0}]').map(s => s.price_cents))
  };
}
