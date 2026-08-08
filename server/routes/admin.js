// server/routes/admin.js
// Every handler in this file (other than /api/admin/login) is wrapped by
// requireAdmin in server.js, which re-checks the session server-side on
// every request. There is no client-side-only gate anywhere in this app —
// hiding a button in the UI is never treated as "protecting" a route.
import crypto from 'node:crypto';
import {
  hashPassword, verifyPassword, createSession, destroySession,
  isValidEmail, isRateLimited, recordFailedAttempt, clearAttempts
} from '../auth.js';
import { sendJson } from '../utils.js';
import { formatProduct } from './api.js';

const ADMIN_COOKIE = 'lunar_admin_session';

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + crypto.randomBytes(2).toString('hex');
}

export function registerAdminRoutes(router, db) {

  // ---- admin auth (separate cookie + separate endpoint from customer auth) ----
  router.post('/api/admin/login', async (req, res, ctx) => {
    const { email, password } = ctx.body;
    const ip = req.socket.remoteAddress || 'unknown';
    const rlKey = `admin:${ip}:${(email || '').toLowerCase()}`;
    if (isRateLimited(rlKey)) {
      return sendJson(res, 429, { error: 'Too many failed attempts. Please try again in 15 minutes.' });
    }
    if (!isValidEmail(email) || !password) {
      recordFailedAttempt(rlKey);
      return sendJson(res, 401, { error: 'Invalid credentials.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_admin = 1').get(email.toLowerCase());
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      recordFailedAttempt(rlKey);
      return sendJson(res, 401, { error: 'Invalid credentials.' });
    }
    if (!user.is_active) return sendJson(res, 403, { error: 'This admin account has been disabled.' });

    clearAttempts(rlKey);
    const session = createSession(db, user.id, false);
    ctx.setCookie(ADMIN_COOKIE, session.token, { maxAge: session.maxAgeSeconds });
    sendJson(res, 200, { admin: { id: user.id, full_name: user.full_name, email: user.email } });
  });

  router.post('/api/admin/logout', async (req, res, ctx) => {
    const token = ctx.cookies[ADMIN_COOKIE];
    if (token) destroySession(db, token);
    ctx.clearCookie(ADMIN_COOKIE);
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/admin/me', async (req, res, ctx) => {
    if (!ctx.admin) return sendJson(res, 200, { admin: null });
    sendJson(res, 200, { admin: { id: ctx.admin.id, full_name: ctx.admin.full_name, email: ctx.admin.email } });
  });

  // ---- everything below requires ctx.admin, enforced in server.js router dispatch ----

  router.get('/api/admin/stats', async (req, res, ctx) => {
    const totalProducts = db.prepare('SELECT COUNT(*) c FROM products').get().c;
    const totalCustomers = db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin = 0').get().c;
    const totalOrders = db.prepare('SELECT COUNT(*) c FROM orders').get().c;
    const revenue = db.prepare("SELECT COALESCE(SUM(total_cents),0) r FROM orders WHERE status != 'cancelled'").get().r;
    const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 6').all();
    const recentMessages = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 6').all();
    sendJson(res, 200, {
      total_products: totalProducts,
      total_customers: totalCustomers,
      total_orders: totalOrders,
      revenue_cents: revenue,
      recent_orders: recentOrders,
      recent_messages: recentMessages
    });
  });

  // ---- products ----
  router.get('/api/admin/products', async (req, res, ctx) => {
    const rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
    sendJson(res, 200, { products: rows.map(formatProduct) });
  });

  router.post('/api/admin/products', async (req, res, ctx) => {
    const b = ctx.body;
    if (!b.name || typeof b.name !== 'string') return sendJson(res, 400, { error: 'Product name is required.' });
    if (!Array.isArray(b.sizes) || b.sizes.length === 0) return sendJson(res, 400, { error: 'At least one size is required.' });
    const slug = slugify(b.name);
    const info = db.prepare(`
      INSERT INTO products (name, slug, category, short_description, description, top_notes, middle_notes, base_notes,
        image_url, sizes, stock, is_featured, is_bestseller, is_new_arrival)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.name.trim(), slug, b.category || 'unisex', b.short_description || '', b.description || '',
      b.top_notes || '', b.middle_notes || '', b.base_notes || '', b.image_url || '',
      JSON.stringify(b.sizes), parseInt(b.stock, 10) || 0,
      b.is_featured ? 1 : 0, b.is_bestseller ? 1 : 0, b.is_new_arrival ? 1 : 0
    );
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
    sendJson(res, 201, { product: formatProduct(product) });
  });

  router.put('/api/admin/products/:id', async (req, res, ctx) => {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(ctx.params.id);
    if (!existing) return sendJson(res, 404, { error: 'Product not found.' });
    const b = ctx.body;
    db.prepare(`
      UPDATE products SET
        name = ?, category = ?, short_description = ?, description = ?,
        top_notes = ?, middle_notes = ?, base_notes = ?, image_url = ?,
        sizes = ?, stock = ?, is_featured = ?, is_bestseller = ?, is_new_arrival = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      b.name ?? existing.name, b.category ?? existing.category,
      b.short_description ?? existing.short_description, b.description ?? existing.description,
      b.top_notes ?? existing.top_notes, b.middle_notes ?? existing.middle_notes, b.base_notes ?? existing.base_notes,
      b.image_url ?? existing.image_url,
      b.sizes ? JSON.stringify(b.sizes) : existing.sizes,
      b.stock != null ? parseInt(b.stock, 10) : existing.stock,
      b.is_featured != null ? (b.is_featured ? 1 : 0) : existing.is_featured,
      b.is_bestseller != null ? (b.is_bestseller ? 1 : 0) : existing.is_bestseller,
      b.is_new_arrival != null ? (b.is_new_arrival ? 1 : 0) : existing.is_new_arrival,
      ctx.params.id
    );
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(ctx.params.id);
    sendJson(res, 200, { product: formatProduct(product) });
  });

  router.delete('/api/admin/products/:id', async (req, res, ctx) => {
    db.prepare('DELETE FROM products WHERE id = ?').run(ctx.params.id);
    sendJson(res, 200, { ok: true });
  });

  // ---- image upload: validated base64 data-URL, saved to disk, served statically ----
  router.post('/api/admin/upload-image', async (req, res, ctx) => {
    const { dataUrl } = ctx.body;
    const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
    if (!match) return sendJson(res, 400, { error: 'Please upload a PNG, JPG, or WEBP image.' });
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 3 * 1024 * 1024) return sendJson(res, 400, { error: 'Image must be smaller than 3MB.' });

    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const uploadsDir = path.join(__dirname, '..', '..', 'data', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = `${crypto.randomBytes(8).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);
    sendJson(res, 201, { url: `/uploads/${filename}` });
  });

  // ---- orders ----
  router.get('/api/admin/orders', async (req, res, ctx) => {
    const { status, search } = ctx.query;
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const args = [];
    if (status) { sql += ' AND status = ?'; args.push(status); }
    if (search) { sql += ' AND (order_number LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?)'; args.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    sql += ' ORDER BY created_at DESC';
    const orders = db.prepare(sql).all(...args);
    sendJson(res, 200, { orders });
  });

  router.get('/api/admin/orders/:id', async (req, res, ctx) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(ctx.params.id);
    if (!order) return sendJson(res, 404, { error: 'Order not found.' });
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    sendJson(res, 200, { order, items });
  });

  router.patch('/api/admin/orders/:id', async (req, res, ctx) => {
    const { status } = ctx.body;
    const allowed = ['pending', 'processing', 'shipped', 'completed', 'cancelled'];
    if (!allowed.includes(status)) return sendJson(res, 400, { error: 'Invalid status.' });
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, ctx.params.id);
    sendJson(res, 200, { ok: true });
  });

  // ---- customers ----
  router.get('/api/admin/customers', async (req, res, ctx) => {
    const rows = db.prepare(`
      SELECT id, full_name, email, is_active, created_at FROM users WHERE is_admin = 0 ORDER BY created_at DESC
    `).all();
    sendJson(res, 200, { customers: rows });
  });

  router.get('/api/admin/customers/:id', async (req, res, ctx) => {
    const customer = db.prepare('SELECT id, full_name, email, is_active, created_at FROM users WHERE id = ? AND is_admin = 0').get(ctx.params.id);
    if (!customer) return sendJson(res, 404, { error: 'Customer not found.' });
    const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(ctx.params.id);
    sendJson(res, 200, { customer, orders });
  });

  router.patch('/api/admin/customers/:id', async (req, res, ctx) => {
    const { is_active } = ctx.body;
    db.prepare('UPDATE users SET is_active = ? WHERE id = ? AND is_admin = 0').run(is_active ? 1 : 0, ctx.params.id);
    sendJson(res, 200, { ok: true });
  });

  // ---- messages ----
  router.get('/api/admin/messages', async (req, res, ctx) => {
    const rows = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC').all();
    sendJson(res, 200, { messages: rows });
  });

  router.patch('/api/admin/messages/:id', async (req, res, ctx) => {
    const { is_read } = ctx.body;
    db.prepare('UPDATE contact_messages SET is_read = ? WHERE id = ?').run(is_read ? 1 : 0, ctx.params.id);
    sendJson(res, 200, { ok: true });
  });

  router.delete('/api/admin/messages/:id', async (req, res, ctx) => {
    db.prepare('DELETE FROM contact_messages WHERE id = ?').run(ctx.params.id);
    sendJson(res, 200, { ok: true });
  });

  // ---- settings (content + appearance) ----
  router.get('/api/admin/settings', async (req, res, ctx) => {
    const rows = db.prepare('SELECT key, value FROM site_settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    sendJson(res, 200, { settings });
  });

  router.put('/api/admin/settings', async (req, res, ctx) => {
    const updates = ctx.body;
    const stmt = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [key, value] of Object.entries(updates)) {
      const stored = typeof value === 'string' ? value : JSON.stringify(value);
      stmt.run(key, stored);
    }
    sendJson(res, 200, { ok: true });
  });
}
