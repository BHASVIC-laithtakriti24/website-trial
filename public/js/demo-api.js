// public/js/demo-api.js
// =====================================================================
//  DEMO MODE ONLY — loaded only in the static GitHub Pages build.
//
//  GitHub Pages cannot run a server, so this file intercepts fetch() and
//  answers the same API surface from localStorage, letting the identical
//  frontend be browsed with no backend.
//
//  BE CLEAR ABOUT WHAT THIS IS NOT:
//   * It is NOT real authentication. Everything runs in the visitor's own
//     browser, so anyone can read or edit the "database" from devtools.
//     The admin area here is a UI preview, not a security boundary.
//   * Passwords are hashed (SHA-256) rather than stored in plain text, but
//     that is cosmetic in a client-side context — do not reuse a real
//     password here.
//   * Data is per-browser and disappears when localStorage is cleared.
//     Nothing is shared between visitors.
//   * No emails are ever sent.
//
//  For a real deployment with genuine server-side auth, run the Node
//  backend (see README). This file is never loaded in that mode.
// =====================================================================
(function () {
  const KEY = 'lunar_demo_db_v1';

  const SEED = {
    users: [
      { id: 1, full_name: 'Demo Administrator', email: 'admin@maisonlunar.com', pw: null, plain: 'LunarAdmin!2026', is_admin: 1, is_active: 1, created_at: new Date().toISOString() }
    ],
    products: [
      { id: 1, name: 'Lunar No. 12', slug: 'lunar-no-12', category: 'unisex', short_description: 'Moss, jasmine, and vetiver captured after dark.', description: 'Our founding accord. Bright bergamot opens into a mossy, jasmine heart, settled by vetiver and warm amber — built to be worn slowly, over a whole evening.', top_notes: 'Bergamot, Cardamom', middle_notes: 'Jasmine, Oakmoss', base_notes: 'Vetiver, Amber', image_url: '', sizes: [{ label: '30ml', price_cents: 8900 }, { label: '50ml', price_cents: 14500 }, { label: '100ml', price_cents: 21500 }], stock: 42, is_featured: 1, is_bestseller: 1, is_new_arrival: 0, created_at: new Date().toISOString() },
      { id: 2, name: 'Midnight Fig', slug: 'midnight-fig', category: 'womens', short_description: 'Wild fig and cedar, soft and enveloping.', description: 'A green fig accord wrapped in creamy sandalwood and soft musk, finished with a trace of black pepper for warmth.', top_notes: 'Green Fig Leaf, Pink Pepper', middle_notes: 'Fig Milk, Orris', base_notes: 'Sandalwood, Musk', image_url: '', sizes: [{ label: '30ml', price_cents: 8200 }, { label: '50ml', price_cents: 13800 }], stock: 30, is_featured: 1, is_bestseller: 0, is_new_arrival: 1, created_at: new Date().toISOString() },
      { id: 3, name: 'Cedar & Smoke', slug: 'cedar-and-smoke', category: 'mens', short_description: 'Dry cedar and smoked vetiver for cool evenings.', description: 'A confident, woody composition built around smoked cedar, dry vetiver, and a whisper of leather.', top_notes: 'Black Pepper, Cypress', middle_notes: 'Cedarwood, Smoked Tea', base_notes: 'Leather, Vetiver', image_url: '', sizes: [{ label: '50ml', price_cents: 15500 }, { label: '100ml', price_cents: 22500 }], stock: 25, is_featured: 0, is_bestseller: 1, is_new_arrival: 0, created_at: new Date().toISOString() },
      { id: 4, name: 'Wild Jasmine', slug: 'wild-jasmine', category: 'womens', short_description: 'Indolic jasmine over a soft musk base.', description: 'An unapologetically floral composition — night-blooming jasmine at full intensity, softened by a creamy musk base.', top_notes: 'Mandarin, Green Leaves', middle_notes: 'Jasmine Sambac, Tuberose', base_notes: 'White Musk, Amber', image_url: '', sizes: [{ label: '30ml', price_cents: 9200 }, { label: '50ml', price_cents: 14900 }], stock: 18, is_featured: 0, is_bestseller: 0, is_new_arrival: 1, created_at: new Date().toISOString() },
      { id: 5, name: 'Green Oud', slug: 'green-oud', category: 'unisex', short_description: 'A modern, green take on classic oud.', description: 'Oud reimagined lighter and greener — fig leaf and moss soften the depth of traditional agarwood.', top_notes: 'Fig Leaf, Bergamot', middle_notes: 'Oud, Oakmoss', base_notes: 'Vetiver, Amber', image_url: '', sizes: [{ label: '50ml', price_cents: 18500 }], stock: 12, is_featured: 1, is_bestseller: 0, is_new_arrival: 1, created_at: new Date().toISOString() },
      { id: 6, name: 'Bergamot Rain', slug: 'bergamot-rain', category: 'unisex', short_description: 'Bright citrus over petrichor-green facets.', description: 'The smell of a courtyard just after rain — bright bergamot and green tea over damp moss and soft musk.', top_notes: 'Bergamot, Green Tea', middle_notes: 'Petrichor Accord, Violet Leaf', base_notes: 'Moss, White Musk', image_url: '', sizes: [{ label: '30ml', price_cents: 7900 }, { label: '50ml', price_cents: 12900 }], stock: 50, is_featured: 0, is_bestseller: 1, is_new_arrival: 0, created_at: new Date().toISOString() }
    ],
    cart: [],
    orders: [],
    messages: [],
    session: null,
    adminSession: null,
    settings: {
      site_title: 'Maison Lunar', favicon: '\u{1F319}',
      color_primary: '#CBB88B', color_secondary: '#2E6B49', color_background: '#060F0B',
      logo_text: 'MAISON LUNAR', hero_image: '',
      hero_eyebrow: 'Eau de Parfum \u00B7 Night Bloom Collection',
      hero_headline: 'A quiet green, lit only by the moon.',
      hero_description: 'Moss, night-blooming jasmine, and vetiver \u2014 captured after dark and held in glass. Small-batch, hand-poured, made to be worn slowly.',
      about_heading: 'Grown after dark.',
      about_body: 'Maison Lunar began with a single overgrown courtyard, where night-blooming jasmine and wild moss took over once the light faded. We work in small batches, blending each accord by hand and testing it only after dusk.',
      contact_email: 'hello@maisonlunar.com',
      contact_address: 'England, by appointment',
      footer_text: 'Small-batch fragrance, bottled by moonlight. Made in England, worn everywhere.',
      testimonials: JSON.stringify([
        { name: 'Rosalind H.', role: 'Bespoke client, London', quote: 'Genuinely unlike anything else in my collection.' },
        { name: 'Marcus T.', role: 'Subscription member', quote: 'The consultation alone was worth it.' },
        { name: 'Amara O.', role: 'Gifting order', quote: 'Rare to find both this good.' }
      ]),
      banner_text: 'Demo mode \u2014 data is stored only in your browser.'
    },
    nextId: 100
  };

  // Safari in Private Browsing (and some locked-down mobile configs) either
  // blocks localStorage or throws on write. Without handling that, the demo
  // appears to log you in and then instantly forgets on the next page — the
  // single most confusing failure on iOS. Detect it up front, fall back to
  // in-memory storage so the page still works, and tell the visitor plainly
  // that nothing will persist.
  let storageOK = true;
  try {
    const probe = '__lunar_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
  } catch (e) {
    storageOK = false;
  }
  window.LUNAR_STORAGE_OK = storageOK;

  let memoryDb = null;

  function load() {
    if (storageOK) {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { storageOK = false; }
    }
    if (memoryDb) return memoryDb;
    const fresh = JSON.parse(JSON.stringify(SEED));
    save(fresh);
    return fresh;
  }

  function save(nextDb) {
    memoryDb = nextDb;
    if (!storageOK) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(nextDb));
    } catch (e) {
      // Most often a private-mode quota error, or the DB outgrew the quota
      // after several base64 image uploads.
      storageOK = false;
      window.LUNAR_STORAGE_OK = false;
    }
  }

  let db = load();

  // SHA-256 via SubtleCrypto. See the file header: hashing here is good
  // hygiene, not a security guarantee, because it runs client-side.
  async function hash(str) {
    // crypto.subtle only exists in a secure context (https:// or localhost).
    // Opening the files straight off disk with file:// has no secure context,
    // so fall back to a simple digest purely so the demo still functions.
    // Weaker, but this is a browser-side demo either way — see the header.
    if (window.crypto && crypto.subtle && window.isSecureContext) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < str.length; i++) {
      h1 = (h1 ^ str.charCodeAt(i)) >>> 0; h1 = (h1 * 0x01000193) >>> 0;
      h2 = (h2 + str.charCodeAt(i) * (i + 7)) >>> 0;
    }
    return 'fb' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }
  async function ensureSeedPasswords() {
    let changed = false;
    for (const u of db.users) {
      if (u.pw === null && u.plain) { u.pw = await hash(u.plain); delete u.plain; changed = true; }
    }
    if (changed) save(db);
  }

  const json = (status, data) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' }
  });
  const validEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const validPw = (p) => typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);
  const nextId = () => ++db.nextId;
  const pub = (u) => ({ id: u.id, full_name: u.full_name, email: u.email, is_admin: !!u.is_admin, created_at: u.created_at });

  function fmt(p) {
    const prices = (p.sizes || []).map(s => s.price_cents);
    return { ...p, is_featured: !!p.is_featured, is_bestseller: !!p.is_bestseller, is_new_arrival: !!p.is_new_arrival,
      price_from_cents: prices.length ? Math.min(...prices) : 0 };
  }
  function cartPayload() {
    const items = db.cart.map(ci => {
      const p = db.products.find(x => x.id === ci.product_id) || {};
      return { ...ci, name: p.name, slug: p.slug, image_url: p.image_url, stock: p.stock };
    });
    const subtotal = items.reduce((s, i) => s + i.unit_price_cents * i.qty, 0);
    return { items, subtotal_cents: subtotal, total_cents: subtotal };
  }
  const currentUser = () => db.session ? db.users.find(u => u.id === db.session) : null;
  const currentAdmin = () => {
    const a = db.adminSession ? db.users.find(u => u.id === db.adminSession) : null;
    return a && a.is_admin && a.is_active ? a : null;
  };

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    // Anything that isn't our API (fonts, images) goes to the real network.
    if (!url.includes('/api/')) return originalFetch(input, init);

    await ensureSeedPasswords();
    const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
    const query = Object.fromEntries(new URLSearchParams((url.split('?')[1] || '')));
    const method = (init.method || 'GET').toUpperCase();
    let body = {};
    try { body = init.body ? JSON.parse(init.body) : {}; } catch (e) {}

    const m = (p) => path === p;
    const idOf = (prefix) => parseInt(path.slice(prefix.length), 10);

    // ---------------- auth ----------------
    if (m('/api/auth/register') && method === 'POST') {
      if (!body.full_name || body.full_name.trim().length < 2) return json(400, { error: 'Please enter your full name.' });
      if (!validEmail(body.email)) return json(400, { error: 'Please enter a valid email address.' });
      if (!validPw(body.password)) return json(400, { error: 'Password must be at least 8 characters and include a letter and a number.' });
      if (body.password !== body.confirm_password) return json(400, { error: 'Passwords do not match.' });
      if (db.users.some(u => u.email === body.email.toLowerCase())) return json(409, { error: 'An account with that email already exists.' });
      const user = { id: nextId(), full_name: body.full_name.trim(), email: body.email.toLowerCase(), pw: await hash(body.password), is_admin: 0, is_active: 1, created_at: new Date().toISOString() };
      db.users.push(user); db.session = user.id; save(db);
      return json(201, { user: pub(user) });
    }
    if (m('/api/auth/login') && method === 'POST') {
      const user = db.users.find(u => u.email === (body.email || '').toLowerCase());
      if (!user || user.pw !== await hash(body.password || '')) return json(401, { error: 'Invalid email or password.' });
      if (!user.is_active) return json(403, { error: 'This account has been disabled. Contact support for help.' });
      db.session = user.id; save(db);
      return json(200, { user: pub(user) });
    }
    if (m('/api/auth/logout') && method === 'POST') { db.session = null; save(db); return json(200, { ok: true }); }
    if (m('/api/auth/me')) { const u = currentUser(); return json(200, { user: u ? pub(u) : null }); }
    if (m('/api/auth/forgot-password') && method === 'POST') {
      return json(200, { ok: true, message: 'Demo mode: no email is sent. On the real backend a reset link would be emailed.' });
    }
    if (m('/api/auth/reset-password') && method === 'POST') {
      return json(400, { error: 'Password reset needs the real backend — it is not available in the static demo.' });
    }

    // ---------------- products ----------------
    if (m('/api/products') && method === 'GET') {
      let list = db.products.slice();
      if (query.category) list = list.filter(p => p.category === query.category);
      if (query.featured === '1') list = list.filter(p => p.is_featured);
      if (query.bestseller === '1') list = list.filter(p => p.is_bestseller);
      if (query.new === '1') list = list.filter(p => p.is_new_arrival);
      if (query.search) {
        const q = query.search.toLowerCase();
        list = list.filter(p => p.name.toLowerCase().includes(q) || (p.short_description || '').toLowerCase().includes(q));
      }
      return json(200, { products: list.map(fmt) });
    }
    if (path.startsWith('/api/products/') && method === 'GET') {
      const slug = path.slice('/api/products/'.length);
      const p = db.products.find(x => x.slug === slug);
      if (!p) return json(404, { error: 'Product not found.' });
      const related = db.products.filter(x => x.category === p.category && x.id !== p.id).slice(0, 4);
      return json(200, { product: fmt(p), related: related.map(fmt) });
    }

    // ---------------- cart ----------------
    if (m('/api/cart') && method === 'GET') return json(200, cartPayload());
    if (m('/api/cart/items') && method === 'POST') {
      const p = db.products.find(x => x.id === body.product_id);
      if (!p) return json(404, { error: 'Product not found.' });
      const size = (p.sizes || []).find(s => s.label === body.size_label) || (p.sizes || [])[0];
      if (!size) return json(400, { error: 'No size available for this product.' });
      if (p.stock < 1) return json(400, { error: 'This product is currently out of stock.' });
      const qty = Math.max(1, Math.min(20, parseInt(body.qty, 10) || 1));
      const existing = db.cart.find(i => i.product_id === p.id && i.size_label === size.label);
      if (existing) existing.qty += qty;
      else db.cart.push({ id: nextId(), product_id: p.id, size_label: size.label, unit_price_cents: size.price_cents, qty });
      save(db); return json(200, cartPayload());
    }
    if (path.startsWith('/api/cart/items/') && method === 'PATCH') {
      const id = idOf('/api/cart/items/');
      const item = db.cart.find(i => i.id === id);
      if (!item) return json(404, { error: 'Item not found in cart.' });
      const qty = Math.max(0, Math.min(20, parseInt(body.qty, 10) || 0));
      if (qty === 0) db.cart = db.cart.filter(i => i.id !== id); else item.qty = qty;
      save(db); return json(200, cartPayload());
    }
    if (path.startsWith('/api/cart/items/') && method === 'DELETE') {
      db.cart = db.cart.filter(i => i.id !== idOf('/api/cart/items/'));
      save(db); return json(200, cartPayload());
    }
    if (m('/api/cart/checkout') && method === 'POST') {
      if (!body.customer_name || !validEmail(body.customer_email)) return json(400, { error: 'Please provide a valid name and email.' });
      const payload = cartPayload();
      if (!payload.items.length) return json(400, { error: 'Your cart is empty.' });
      const order = {
        id: nextId(), order_number: 'DEMO-' + Date.now().toString(36).toUpperCase(),
        user_id: db.session, customer_name: body.customer_name, customer_email: body.customer_email,
        shipping_address: body.shipping_address || '', status: 'pending',
        subtotal_cents: payload.subtotal_cents, total_cents: payload.total_cents,
        created_at: new Date().toISOString(),
        items: payload.items.map(i => ({ product_id: i.product_id, product_name: i.name, size_label: i.size_label, unit_price_cents: i.unit_price_cents, qty: i.qty }))
      };
      order.items.forEach(i => { const p = db.products.find(x => x.id === i.product_id); if (p) p.stock = Math.max(0, p.stock - i.qty); });
      db.orders.unshift(order); db.cart = []; save(db);
      return json(201, { order_number: order.order_number, total_cents: order.total_cents });
    }
    if (m('/api/orders/mine') && method === 'GET') {
      if (!currentUser()) return json(401, { error: 'Please log in to view your orders.' });
      return json(200, { orders: db.orders.filter(o => o.user_id === db.session) });
    }

    // ---------------- contact ----------------
    if (m('/api/contact') && method === 'POST') {
      if (body.company) return json(200, { ok: true }); // honeypot
      if (!body.name || !validEmail(body.email) || !body.subject || !body.message) {
        return json(400, { error: 'Please fill in all fields with a valid email address.' });
      }
      db.messages.unshift({ id: nextId(), name: body.name, email: body.email, subject: body.subject, message: body.message, is_read: 0, created_at: new Date().toISOString() });
      save(db);
      return json(201, { ok: true, emailed: false });
    }

    // ---------------- settings (public) ----------------
    if (m('/api/settings') && method === 'GET') {
      const s = { ...db.settings };
      try { s.testimonials = JSON.parse(s.testimonials); } catch (e) { s.testimonials = []; }
      return json(200, { settings: s });
    }

    // ---------------- admin ----------------
    if (m('/api/admin/login') && method === 'POST') {
      const user = db.users.find(u => u.email === (body.email || '').toLowerCase() && u.is_admin);
      if (!user || user.pw !== await hash(body.password || '')) return json(401, { error: 'Invalid credentials.' });
      if (!user.is_active) return json(403, { error: 'This admin account has been disabled.' });
      db.adminSession = user.id; save(db);
      return json(200, { admin: { id: user.id, full_name: user.full_name, email: user.email } });
    }
    if (m('/api/admin/logout') && method === 'POST') { db.adminSession = null; save(db); return json(200, { ok: true }); }
    if (m('/api/admin/me')) {
      const a = currentAdmin();
      return json(200, { admin: a ? { id: a.id, full_name: a.full_name, email: a.email } : null });
    }
    if (path.startsWith('/api/admin/') && !currentAdmin()) {
      return json(401, { error: 'Admin authentication required.' });
    }

    if (m('/api/admin/stats')) {
      return json(200, {
        total_products: db.products.length,
        total_customers: db.users.filter(u => !u.is_admin).length,
        total_orders: db.orders.length,
        revenue_cents: db.orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total_cents, 0),
        recent_orders: db.orders.slice(0, 6),
        recent_messages: db.messages.slice(0, 6)
      });
    }
    if (m('/api/admin/products') && method === 'GET') return json(200, { products: db.products.map(fmt) });
    if (m('/api/admin/products') && method === 'POST') {
      if (!body.name) return json(400, { error: 'Product name is required.' });
      if (!Array.isArray(body.sizes) || !body.sizes.length) return json(400, { error: 'At least one size is required.' });
      const p = { id: nextId(), slug: body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.random().toString(16).slice(2, 6),
        name: body.name, category: body.category || 'unisex', short_description: body.short_description || '', description: body.description || '',
        top_notes: body.top_notes || '', middle_notes: body.middle_notes || '', base_notes: body.base_notes || '',
        image_url: body.image_url || '', sizes: body.sizes, stock: parseInt(body.stock, 10) || 0,
        is_featured: body.is_featured ? 1 : 0, is_bestseller: body.is_bestseller ? 1 : 0, is_new_arrival: body.is_new_arrival ? 1 : 0,
        created_at: new Date().toISOString() };
      db.products.unshift(p); save(db);
      return json(201, { product: fmt(p) });
    }
    if (path.startsWith('/api/admin/products/') && method === 'PUT') {
      const p = db.products.find(x => x.id === idOf('/api/admin/products/'));
      if (!p) return json(404, { error: 'Product not found.' });
      ['name', 'category', 'short_description', 'description', 'top_notes', 'middle_notes', 'base_notes', 'image_url'].forEach(k => { if (body[k] != null) p[k] = body[k]; });
      if (body.sizes) p.sizes = body.sizes;
      if (body.stock != null) p.stock = parseInt(body.stock, 10) || 0;
      if (body.is_featured != null) p.is_featured = body.is_featured ? 1 : 0;
      if (body.is_bestseller != null) p.is_bestseller = body.is_bestseller ? 1 : 0;
      if (body.is_new_arrival != null) p.is_new_arrival = body.is_new_arrival ? 1 : 0;
      save(db); return json(200, { product: fmt(p) });
    }
    if (path.startsWith('/api/admin/products/') && method === 'DELETE') {
      db.products = db.products.filter(x => x.id !== idOf('/api/admin/products/')); save(db);
      return json(200, { ok: true });
    }
    if (m('/api/admin/upload-image') && method === 'POST') {
      // In demo mode the data URL is kept inline rather than written to disk.
      if (!/^data:image\/(png|jpe?g|webp);base64,/.test(body.dataUrl || '')) return json(400, { error: 'Please upload a PNG, JPG, or WEBP image.' });
      if (body.dataUrl.length > 1.6 * 1024 * 1024) return json(400, { error: 'Demo mode: please use an image under ~1MB (browser storage limit).' });
      return json(201, { url: body.dataUrl });
    }
    if (m('/api/admin/orders') && method === 'GET') {
      let list = db.orders.slice();
      if (query.status) list = list.filter(o => o.status === query.status);
      if (query.search) {
        const q = query.search.toLowerCase();
        list = list.filter(o => o.order_number.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q) || o.customer_email.toLowerCase().includes(q));
      }
      return json(200, { orders: list });
    }
    if (path.startsWith('/api/admin/orders/') && method === 'GET') {
      const o = db.orders.find(x => x.id === idOf('/api/admin/orders/'));
      if (!o) return json(404, { error: 'Order not found.' });
      return json(200, { order: o, items: o.items || [] });
    }
    if (path.startsWith('/api/admin/orders/') && method === 'PATCH') {
      const o = db.orders.find(x => x.id === idOf('/api/admin/orders/'));
      if (!o) return json(404, { error: 'Order not found.' });
      if (!['pending', 'processing', 'shipped', 'completed', 'cancelled'].includes(body.status)) return json(400, { error: 'Invalid status.' });
      o.status = body.status; save(db); return json(200, { ok: true });
    }
    if (m('/api/admin/customers') && method === 'GET') {
      return json(200, { customers: db.users.filter(u => !u.is_admin).map(u => ({ id: u.id, full_name: u.full_name, email: u.email, is_active: u.is_active, created_at: u.created_at })) });
    }
    if (path.startsWith('/api/admin/customers/') && method === 'GET') {
      const c = db.users.find(u => u.id === idOf('/api/admin/customers/') && !u.is_admin);
      if (!c) return json(404, { error: 'Customer not found.' });
      return json(200, { customer: { id: c.id, full_name: c.full_name, email: c.email, is_active: c.is_active, created_at: c.created_at }, orders: db.orders.filter(o => o.user_id === c.id) });
    }
    if (path.startsWith('/api/admin/customers/') && method === 'PATCH') {
      const c = db.users.find(u => u.id === idOf('/api/admin/customers/') && !u.is_admin);
      if (c) { c.is_active = body.is_active ? 1 : 0; save(db); }
      return json(200, { ok: true });
    }
    if (m('/api/admin/messages') && method === 'GET') return json(200, { messages: db.messages });
    if (path.startsWith('/api/admin/messages/') && method === 'PATCH') {
      const msg = db.messages.find(x => x.id === idOf('/api/admin/messages/'));
      if (msg) { msg.is_read = body.is_read ? 1 : 0; save(db); }
      return json(200, { ok: true });
    }
    if (path.startsWith('/api/admin/messages/') && method === 'DELETE') {
      db.messages = db.messages.filter(x => x.id !== idOf('/api/admin/messages/')); save(db);
      return json(200, { ok: true });
    }
    if (m('/api/admin/settings') && method === 'GET') return json(200, { settings: db.settings });
    if (m('/api/admin/settings') && method === 'PUT') {
      Object.entries(body).forEach(([k, v]) => { db.settings[k] = typeof v === 'string' ? v : JSON.stringify(v); });
      save(db); return json(200, { ok: true });
    }

    return json(404, { error: 'Not found (demo mode).' });
  };

  // Visible, permanent notice so nobody mistakes the demo for a live store.
  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.style.cssText = 'background:#1a2f22;color:#DED0AC;border-bottom:1px solid rgba(203,184,139,.3);font:400 12px/1.5 Jost,sans-serif;padding:8px 16px;text-align:center;position:relative;z-index:200;';
    if (!storageOK) {
      bar.style.background = '#4a2a1e';
      bar.style.color = '#F3C4B0';
      bar.innerHTML = 'Your browser is blocking site storage \u2014 this is usually Private Browsing on Safari. ' +
        'You can look around, but signing in won\u2019t stick between pages. Open this in a normal (non-private) tab to use accounts.';
    } else {
      bar.innerHTML = 'Static demo \u2014 data is saved only in your browser and no emails are sent. ' +
        '<a href="#" id="lunarDemoReset" style="color:#CBB88B;text-decoration:underline;">Reset demo data</a>';
    }
    if (window.LUNAR_addTopBar) window.LUNAR_addTopBar(bar);
    else document.body.insertBefore(bar, document.body.firstChild);
    const resetLink = document.getElementById('lunarDemoReset');
    if (resetLink) {
      resetLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Reset all demo data back to the samples?')) {
          try { localStorage.removeItem(KEY); } catch (err) {}
          memoryDb = null;
          location.reload();
        }
      });
    }
  });
})();
