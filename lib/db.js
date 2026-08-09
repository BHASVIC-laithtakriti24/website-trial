'use strict';
/* ---------------------------------------------------------------------
   Database layer — node:sqlite (built into Node 22.5+). No npm install.
   Every query in this project is a PREPARED STATEMENT with bound
   parameters, which is what makes SQL injection structurally impossible
   here: user input is never concatenated into SQL text.
   ------------------------------------------------------------------ */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { hashPassword } = require('./auth');

const DATA_DIR = process.env.ML_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'maison-lunar.db');

const db = new DatabaseSync(DB_PATH);

// WAL: safe concurrent reads while writing. foreign_keys: real referential integrity.
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);
db.exec(`PRAGMA busy_timeout = 5000;`);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash       TEXT    NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT    NOT NULL,
  user_agent  TEXT,
  ip          TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS categories (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  key    TEXT NOT NULL UNIQUE,
  label  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT    NOT NULL,
  slug               TEXT    NOT NULL UNIQUE,
  brand              TEXT    NOT NULL DEFAULT 'Maison Lunar',
  category           TEXT    NOT NULL DEFAULT 'unisex',
  short_description  TEXT    NOT NULL DEFAULT '',
  description        TEXT    NOT NULL DEFAULT '',
  top_notes          TEXT    NOT NULL DEFAULT '',
  middle_notes       TEXT    NOT NULL DEFAULT '',
  base_notes         TEXT    NOT NULL DEFAULT '',
  image_url          TEXT    NOT NULL DEFAULT '',
  sizes_json         TEXT    NOT NULL DEFAULT '[]',
  stock              INTEGER NOT NULL DEFAULT 0,
  is_featured        INTEGER NOT NULL DEFAULT 0,
  is_bestseller      INTEGER NOT NULL DEFAULT 0,
  is_new_arrival     INTEGER NOT NULL DEFAULT 0,
  hidden             INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);

CREATE TABLE IF NOT EXISTS cart_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_key          TEXT    NOT NULL,
  product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size_label        TEXT    NOT NULL,
  unit_price_cents  INTEGER NOT NULL,
  qty               INTEGER NOT NULL,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cart_key ON cart_items(cart_key);

CREATE TABLE IF NOT EXISTS orders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number      TEXT    NOT NULL UNIQUE,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name     TEXT    NOT NULL,
  customer_email    TEXT    NOT NULL,
  shipping_address  TEXT    NOT NULL DEFAULT '',
  status            TEXT    NOT NULL DEFAULT 'pending',
  subtotal_cents    INTEGER NOT NULL DEFAULT 0,
  total_cents       INTEGER NOT NULL DEFAULT 0,
  pay_brand         TEXT    NOT NULL DEFAULT '',
  pay_last4         TEXT    NOT NULL DEFAULT '',
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

CREATE TABLE IF NOT EXISTS order_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name      TEXT    NOT NULL,
  size_label        TEXT    NOT NULL,
  unit_price_cents  INTEGER NOT NULL,
  qty               INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oi_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       TEXT    NOT NULL DEFAULT '',
  body        TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'published',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, status);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  subject     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,
  ip          TEXT NOT NULL,
  ok          INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attempts ON login_attempts(email, created_at);
`);

/* ------------------------------- seed ------------------------------- */

const DEFAULT_SETTINGS = {
  site_title: 'Maison Lunar',
  logo_text: 'MAISON LUNAR',
  color_primary: '#CBB88B',
  color_secondary: '#2E6B49',
  color_background: '#060F0B',
  hero_eyebrow: 'Eau de Parfum · Night Bloom Collection',
  hero_headline: 'A quiet green, lit only by the moon.',
  hero_description: 'Moss, night-blooming jasmine, and vetiver — captured after dark and held in glass. Small-batch, hand-poured, made to be worn slowly.',
  hero_cta_text: 'Shop the Collection',
  hero_cta_link: '#/shop',
  about_heading: 'Grown after dark.',
  about_body: 'Maison Lunar began with a single overgrown courtyard, where night-blooming jasmine and wild moss took over once the light faded. We work in small batches, blending each accord by hand and testing it only after dusk.',
  contact_email: 'laithtakriti@icloud.com',
  contact_phone: '',
  contact_address: 'England, by appointment',
  instagram: '',
  pinterest: '',
  footer_text: 'Small-batch fragrance, bottled by moonlight. Made in England, worn everywhere.',
  banner_text: '',
  low_stock_threshold: '5',
  testimonials_json: JSON.stringify([
    { name: 'Rosalind H.', role: 'Bespoke client, London', quote: 'Genuinely unlike anything else in my collection.' },
    { name: 'Marcus T.', role: 'Subscription member', quote: 'The consultation alone was worth it.' },
    { name: 'Amara O.', role: 'Gifting order', quote: 'Rare to find both this good.' }
  ])
};

const SEED_CATEGORIES = [
  ['mens', "Men's"], ['womens', "Women's"], ['unisex', 'Unisex']
];

const SEED_PRODUCTS = [
  ['Lunar No. 12', 'lunar-no-12', 'unisex', 'Moss, jasmine, and vetiver captured after dark.',
   'Our founding accord. Bright bergamot opens into a mossy, jasmine heart, settled by vetiver and warm amber.',
   'Bergamot, Cardamom', 'Jasmine, Oakmoss', 'Vetiver, Amber',
   [{ label: '30ml', price_cents: 8900 }, { label: '50ml', price_cents: 14500 }, { label: '100ml', price_cents: 21500 }], 42, 1, 1, 0],
  ['Midnight Fig', 'midnight-fig', 'womens', 'Wild fig and cedar, soft and enveloping.',
   'A green fig accord wrapped in creamy sandalwood and soft musk, with a trace of black pepper.',
   'Green Fig Leaf, Pink Pepper', 'Fig Milk, Orris', 'Sandalwood, Musk',
   [{ label: '30ml', price_cents: 8200 }, { label: '50ml', price_cents: 13800 }], 30, 1, 0, 1],
  ['Cedar & Smoke', 'cedar-and-smoke', 'mens', 'Dry cedar and smoked vetiver for cool evenings.',
   'A confident, woody composition built around smoked cedar, dry vetiver, and a whisper of leather.',
   'Black Pepper, Cypress', 'Cedarwood, Smoked Tea', 'Leather, Vetiver',
   [{ label: '50ml', price_cents: 15500 }, { label: '100ml', price_cents: 22500 }], 25, 0, 1, 0],
  ['Wild Jasmine', 'wild-jasmine', 'womens', 'Indolic jasmine over a soft musk base.',
   'Night-blooming jasmine at full intensity, softened by a creamy musk base.',
   'Mandarin, Green Leaves', 'Jasmine Sambac, Tuberose', 'White Musk, Amber',
   [{ label: '30ml', price_cents: 9200 }, { label: '50ml', price_cents: 14900 }], 18, 0, 0, 1],
  ['Green Oud', 'green-oud', 'unisex', 'A modern, green take on classic oud.',
   'Oud reimagined lighter and greener — fig leaf and moss soften traditional agarwood.',
   'Fig Leaf, Bergamot', 'Oud, Oakmoss', 'Vetiver, Amber',
   [{ label: '50ml', price_cents: 18500 }], 12, 1, 0, 1],
  ['Bergamot Rain', 'bergamot-rain', 'unisex', 'Bright citrus over petrichor-green facets.',
   'A courtyard just after rain — bergamot and green tea over damp moss and soft musk.',
   'Bergamot, Green Tea', 'Petrichor, Violet Leaf', 'Moss, White Musk',
   [{ label: '30ml', price_cents: 7900 }, { label: '50ml', price_cents: 12900 }], 50, 0, 1, 0]
];

function seed() {
  const setSetting = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING`
  );
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) setSetting.run(k, String(v));

  const catCount = db.prepare(`SELECT COUNT(*) AS n FROM categories`).get().n;
  if (catCount === 0) {
    const ins = db.prepare(`INSERT INTO categories (key, label) VALUES (?, ?)`);
    for (const [k, l] of SEED_CATEGORIES) ins.run(k, l);
  }

  const prodCount = db.prepare(`SELECT COUNT(*) AS n FROM products`).get().n;
  if (prodCount === 0) {
    const ins = db.prepare(`
      INSERT INTO products (name, slug, category, short_description, description,
        top_notes, middle_notes, base_notes, sizes_json, stock,
        is_featured, is_bestseller, is_new_arrival)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const p of SEED_PRODUCTS) {
      ins.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7],
        JSON.stringify(p[8]), p[9], p[10], p[11], p[12]);
    }
  }

  // Admin account. The password comes from the environment so it is never
  // committed to source. If unset, we generate one and print it ONCE.
  const adminEmail = (process.env.ML_ADMIN_EMAIL || 'admin@maisonlunar.com').toLowerCase();
  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(adminEmail);
  if (!existing) {
    const pw = process.env.ML_ADMIN_PASSWORD || require('node:crypto').randomBytes(12).toString('base64url');
    db.prepare(`INSERT INTO users (full_name, email, pw_hash, is_admin) VALUES (?, ?, ?, 1)`)
      .run('Site Administrator', adminEmail, hashPassword(pw));
    console.log('\n  ─────────────────────────────────────────────');
    console.log('   Admin account created');
    console.log('   Email:    ' + adminEmail);
    if (!process.env.ML_ADMIN_PASSWORD) {
      console.log('   Password: ' + pw);
      console.log('   (Shown once. Save it, or set ML_ADMIN_PASSWORD.)');
    } else {
      console.log('   Password: from ML_ADMIN_PASSWORD');
    }
    console.log('  ─────────────────────────────────────────────\n');
  }
}

seed();

/* --------------------------- housekeeping --------------------------- */

function sweep() {
  db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();
  db.prepare(`DELETE FROM login_attempts WHERE created_at < datetime('now','-1 day')`).run();
  db.prepare(`DELETE FROM cart_items WHERE created_at < datetime('now','-30 day')`).run();
}
sweep();
setInterval(sweep, 60 * 60 * 1000).unref();

module.exports = { db, DB_PATH, DEFAULT_SETTINGS };
