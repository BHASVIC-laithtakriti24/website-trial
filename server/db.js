// server/db.js
// Real SQLite database using Node's built-in node:sqlite module — zero npm
// dependencies required. File lives in /data/lunar.db and persists between
// server restarts.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { hashPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'lunar.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'unisex',   -- mens | womens | unisex
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  top_notes TEXT NOT NULL DEFAULT '',
  middle_notes TEXT NOT NULL DEFAULT '',
  base_notes TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  sizes TEXT NOT NULL DEFAULT '[]',           -- JSON [{label,price_cents}]
  stock INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_bestseller INTEGER NOT NULL DEFAULT 0,
  is_new_arrival INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  cart_token TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  size_label TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  shipping_address TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | processing | shipped | completed | cancelled
  subtotal_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  size_label TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// ---- default site settings (used by admin "Website Content" + "Appearance") ----
const defaultSettings = {
  site_title: 'Maison Lunar',
  favicon: '\u{1F319}',
  color_primary: '#CBB88B',
  color_secondary: '#2E6B49',
  color_background: '#060F0B',
  logo_text: 'MAISON LUNAR',
  hero_image: '',
  hero_eyebrow: 'Eau de Parfum \u00B7 Night Bloom Collection',
  // In the headline, *text between asterisks* renders italic gold, and a
  // newline becomes a line break. Both are escaped safely before rendering.
  hero_headline: 'A quiet green,\nlit only by *the moon*.',
  hero_description: 'Moss, night-blooming jasmine, and vetiver \u2014 captured after dark and held in glass. Small-batch, hand-poured, made to be worn slowly.',
  about_heading: 'Grown after dark.',
  about_quote: 'We wanted a green that only reveals itself at night \u2014 the way a garden changes once the sun goes down.',
  // Blank lines separate paragraphs.
  about_body: 'Maison Lunar began with a single overgrown courtyard, where night-blooming jasmine and wild moss took over once the light faded. We work in small batches, blending each accord by hand and testing it only after dusk \u2014 the hours our scents are made to be worn in.\n\nEvery bottle is numbered, every formula rests for weeks before release, and nothing leaves the atelier until it has been worn, slept in, and worn again.',
  composition_top: 'Bergamot \u00B7 Cardamom',
  composition_heart: 'Jasmine \u00B7 Oakmoss',
  composition_base: 'Vetiver \u00B7 Amber',
  services_intro: 'From a single bottle to a fully bespoke accord, built around how you actually want to smell.',
  gallery_intro: 'A look at the process, the ingredients, and the finished pour.',
  contact_email: 'laithtakriti@icloud.com',
  contact_address: 'By appointment, England',
  footer_text: 'Small-batch fragrance, bottled by moonlight. Made in England, worn everywhere.',
  testimonials: JSON.stringify([
    { name: 'Rosalind H.', role: 'Bespoke client, London', quote: 'Genuinely unlike anything else in my collection \u2014 it changes over the evening in a way that keeps surprising me.' },
    { name: 'Marcus T.', role: 'Subscription member', quote: 'The consultation alone was worth it. They actually listened to what I didn\u2019t like, not just what I did.' },
    { name: 'Amara O.', role: 'Gifting order', quote: 'Bought the candle as a gift and ended up ordering the parfum for myself the same week. Rare to find both this good.' }
  ]),
  banner_text: ''
};

const settingStmt = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaultSettings)) settingStmt.run(k, String(v));

// ---- seed products (only if table empty) ----
const productCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
if (productCount === 0) {
  const insert = db.prepare(`
    INSERT INTO products
      (name, slug, category, short_description, description, top_notes, middle_notes, base_notes,
       image_url, sizes, stock, is_featured, is_bestseller, is_new_arrival)
    VALUES (@name, @slug, @category, @short_description, @description, @top_notes, @middle_notes, @base_notes,
       @image_url, @sizes, @stock, @is_featured, @is_bestseller, @is_new_arrival)
  `);

  const seed = [
    {
      name: 'Lunar No. 12', slug: 'lunar-no-12', category: 'unisex',
      short_description: 'Moss, jasmine, and vetiver captured after dark.',
      description: 'Our founding accord. Bright bergamot opens into a mossy, jasmine heart, settled by vetiver and warm amber — built to be worn slowly, over a whole evening.',
      top_notes: 'Bergamot, Cardamom', middle_notes: 'Jasmine, Oakmoss', base_notes: 'Vetiver, Amber',
      image_url: '', sizes: JSON.stringify([{ label: '30ml', price_cents: 8900 }, { label: '50ml', price_cents: 14500 }, { label: '100ml', price_cents: 21500 }]),
      stock: 42, is_featured: 1, is_bestseller: 1, is_new_arrival: 0
    },
    {
      name: 'Midnight Fig', slug: 'midnight-fig', category: 'womens',
      short_description: 'Wild fig and cedar, soft and enveloping.',
      description: 'A green fig accord wrapped in creamy sandalwood and soft musk, finished with a trace of black pepper for warmth.',
      top_notes: 'Green Fig Leaf, Pink Pepper', middle_notes: 'Fig Milk, Orris', base_notes: 'Sandalwood, Musk',
      image_url: '', sizes: JSON.stringify([{ label: '30ml', price_cents: 8200 }, { label: '50ml', price_cents: 13800 }]),
      stock: 30, is_featured: 1, is_bestseller: 0, is_new_arrival: 1
    },
    {
      name: 'Cedar & Smoke', slug: 'cedar-and-smoke', category: 'mens',
      short_description: 'Dry cedar and smoked vetiver for cool evenings.',
      description: 'A confident, woody composition built around smoked cedar, dry vetiver, and a whisper of leather.',
      top_notes: 'Black Pepper, Cypress', middle_notes: 'Cedarwood, Smoked Tea', base_notes: 'Leather, Vetiver',
      image_url: '', sizes: JSON.stringify([{ label: '50ml', price_cents: 15500 }, { label: '100ml', price_cents: 22500 }]),
      stock: 25, is_featured: 0, is_bestseller: 1, is_new_arrival: 0
    },
    {
      name: 'Wild Jasmine', slug: 'wild-jasmine', category: 'womens',
      short_description: 'Indolic jasmine over a soft musk base.',
      description: 'An unapologetically floral composition — night-blooming jasmine at full intensity, softened by a creamy musk base.',
      top_notes: 'Mandarin, Green Leaves', middle_notes: 'Jasmine Sambac, Tuberose', base_notes: 'White Musk, Amber',
      image_url: '', sizes: JSON.stringify([{ label: '30ml', price_cents: 9200 }, { label: '50ml', price_cents: 14900 }]),
      stock: 18, is_featured: 0, is_bestseller: 0, is_new_arrival: 1
    },
    {
      name: 'Green Oud', slug: 'green-oud', category: 'unisex',
      short_description: 'A modern, green take on classic oud.',
      description: 'Oud reimagined lighter and greener — fig leaf and moss soften the depth of traditional agarwood.',
      top_notes: 'Fig Leaf, Bergamot', middle_notes: 'Oud, Oakmoss', base_notes: 'Vetiver, Amber',
      image_url: '', sizes: JSON.stringify([{ label: '50ml', price_cents: 18500 }]),
      stock: 12, is_featured: 1, is_bestseller: 0, is_new_arrival: 1
    },
    {
      name: 'Bergamot Rain', slug: 'bergamot-rain', category: 'unisex',
      short_description: 'Bright citrus over petrichor-green facets.',
      description: 'The smell of a courtyard just after rain — bright bergamot and green tea over damp moss and soft musk.',
      top_notes: 'Bergamot, Green Tea', middle_notes: 'Petrichor Accord, Violet Leaf', base_notes: 'Moss, White Musk',
      image_url: '', sizes: JSON.stringify([{ label: '30ml', price_cents: 7900 }, { label: '50ml', price_cents: 12900 }]),
      stock: 50, is_featured: 0, is_bestseller: 1, is_new_arrival: 0
    }
  ];

  for (const p of seed) {
    insert.run({ ...p, slug: p.slug });
  }
}

// ---- seed a default admin account (only if none exists) ----
const adminCount = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get().c;
if (adminCount === 0) {
  const { hash, salt } = hashPassword('LunarAdmin!2026');
  db.prepare(`
    INSERT INTO users (full_name, email, password_hash, password_salt, is_admin, is_active)
    VALUES (?, ?, ?, ?, 1, 1)
  `).run('Site Administrator', 'admin@maisonlunar.com', hash, salt);
  console.log('----------------------------------------------------------');
  console.log(' Seeded default admin account:');
  console.log('   email:    admin@maisonlunar.com');
  console.log('   password: LunarAdmin!2026');
  console.log(' Change this password immediately after first login.');
  console.log('----------------------------------------------------------');
}

export default db;
