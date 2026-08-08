/* =====================================================================
   Maison Lunar — single-file app.
   Everything (storefront + admin) lives in one HTML file with hash
   routing, so there are no extra files to upload and nothing that can
   404 on GitHub Pages.

   HONEST SCOPE NOTE: this is a browser-side build. All data lives in
   this visitor's localStorage. That means the admin login is a UI gate,
   NOT a security boundary — anyone can read or change the data through
   devtools. Use the Node backend (server/) for a real, secure store.
   ===================================================================== */
(function () {
  'use strict';

  // ---------------------------------------------------------------
  // Storage (with Safari Private Browsing fallback)
  // ---------------------------------------------------------------
  const KEY = 'maison_lunar_v2';
  let storageOK = true;
  try { localStorage.setItem('__p__', '1'); localStorage.removeItem('__p__'); }
  catch (e) { storageOK = false; }

  let memory = null;

  const SEED = () => ({
    users: [{ id: 1, full_name: 'Site Administrator', email: 'admin@maisonlunar.com', pw: null, plain: 'LunarAdmin!2026', is_admin: 1, is_active: 1, created_at: new Date().toISOString() }],
    products: [
      { id: 11, name: 'Lunar No. 12', slug: 'lunar-no-12', brand: 'Maison Lunar', category: 'unisex', short_description: 'Moss, jasmine, and vetiver captured after dark.', description: 'Our founding accord. Bright bergamot opens into a mossy, jasmine heart, settled by vetiver and warm amber.', top_notes: 'Bergamot, Cardamom', middle_notes: 'Jasmine, Oakmoss', base_notes: 'Vetiver, Amber', image_url: '', sizes: [{ label: '30ml', price_cents: 8900 }, { label: '50ml', price_cents: 14500 }, { label: '100ml', price_cents: 21500 }], stock: 42, is_featured: 1, is_bestseller: 1, is_new_arrival: 0, hidden: 0, created_at: new Date().toISOString() },
      { id: 12, name: 'Midnight Fig', slug: 'midnight-fig', brand: 'Maison Lunar', category: 'womens', short_description: 'Wild fig and cedar, soft and enveloping.', description: 'A green fig accord wrapped in creamy sandalwood and soft musk, with a trace of black pepper.', top_notes: 'Green Fig Leaf, Pink Pepper', middle_notes: 'Fig Milk, Orris', base_notes: 'Sandalwood, Musk', image_url: '', sizes: [{ label: '30ml', price_cents: 8200 }, { label: '50ml', price_cents: 13800 }], stock: 30, is_featured: 1, is_bestseller: 0, is_new_arrival: 1, hidden: 0, created_at: new Date().toISOString() },
      { id: 13, name: 'Cedar & Smoke', slug: 'cedar-and-smoke', brand: 'Maison Lunar', category: 'mens', short_description: 'Dry cedar and smoked vetiver for cool evenings.', description: 'A confident, woody composition built around smoked cedar, dry vetiver, and a whisper of leather.', top_notes: 'Black Pepper, Cypress', middle_notes: 'Cedarwood, Smoked Tea', base_notes: 'Leather, Vetiver', image_url: '', sizes: [{ label: '50ml', price_cents: 15500 }, { label: '100ml', price_cents: 22500 }], stock: 25, is_featured: 0, is_bestseller: 1, is_new_arrival: 0, hidden: 0, created_at: new Date().toISOString() },
      { id: 14, name: 'Wild Jasmine', slug: 'wild-jasmine', brand: 'Maison Lunar', category: 'womens', short_description: 'Indolic jasmine over a soft musk base.', description: 'Night-blooming jasmine at full intensity, softened by a creamy musk base.', top_notes: 'Mandarin, Green Leaves', middle_notes: 'Jasmine Sambac, Tuberose', base_notes: 'White Musk, Amber', image_url: '', sizes: [{ label: '30ml', price_cents: 9200 }, { label: '50ml', price_cents: 14900 }], stock: 18, is_featured: 0, is_bestseller: 0, is_new_arrival: 1, hidden: 0, created_at: new Date().toISOString() },
      { id: 15, name: 'Green Oud', slug: 'green-oud', brand: 'Maison Lunar', category: 'unisex', short_description: 'A modern, green take on classic oud.', description: 'Oud reimagined lighter and greener — fig leaf and moss soften traditional agarwood.', top_notes: 'Fig Leaf, Bergamot', middle_notes: 'Oud, Oakmoss', base_notes: 'Vetiver, Amber', image_url: '', sizes: [{ label: '50ml', price_cents: 18500 }], stock: 12, is_featured: 1, is_bestseller: 0, is_new_arrival: 1, hidden: 0, created_at: new Date().toISOString() },
      { id: 16, name: 'Bergamot Rain', slug: 'bergamot-rain', brand: 'Maison Lunar', category: 'unisex', short_description: 'Bright citrus over petrichor-green facets.', description: 'A courtyard just after rain — bergamot and green tea over damp moss and soft musk.', top_notes: 'Bergamot, Green Tea', middle_notes: 'Petrichor, Violet Leaf', base_notes: 'Moss, White Musk', image_url: '', sizes: [{ label: '30ml', price_cents: 7900 }, { label: '50ml', price_cents: 12900 }], stock: 50, is_featured: 0, is_bestseller: 1, is_new_arrival: 0, hidden: 0, created_at: new Date().toISOString() }
    ],
    categories: [
      { id: 1, key: 'mens', label: "Men's" },
      { id: 2, key: 'womens', label: "Women's" },
      { id: 3, key: 'unisex', label: 'Unisex' }
    ],
    cart: [], orders: [], messages: [],
    session: null, adminSession: null,
    settings: {
      site_title: 'Maison Lunar', logo_text: 'MAISON LUNAR', favicon: '🌙',
      color_primary: '#CBB88B', color_secondary: '#2E6B49', color_background: '#060F0B',
      hero_eyebrow: 'Eau de Parfum · Night Bloom Collection',
      hero_headline: 'A quiet green, lit only by the moon.',
      hero_description: 'Moss, night-blooming jasmine, and vetiver — captured after dark and held in glass. Small-batch, hand-poured, made to be worn slowly.',
      hero_cta_text: 'Shop the Collection', hero_cta_link: '#/shop',
      about_heading: 'Grown after dark.',
      about_body: 'Maison Lunar began with a single overgrown courtyard, where night-blooming jasmine and wild moss took over once the light faded. We work in small batches, blending each accord by hand and testing it only after dusk.',
      contact_email: 'hello@maisonlunar.com', contact_phone: '', contact_address: 'England, by appointment',
      instagram: '', pinterest: '',
      footer_text: 'Small-batch fragrance, bottled by moonlight. Made in England, worn everywhere.',
      banner_text: '', low_stock_threshold: '5',
      testimonials: [
        { name: 'Rosalind H.', role: 'Bespoke client, London', quote: 'Genuinely unlike anything else in my collection.' },
        { name: 'Marcus T.', role: 'Subscription member', quote: 'The consultation alone was worth it.' },
        { name: 'Amara O.', role: 'Gifting order', quote: 'Rare to find both this good.' }
      ]
    },
    nextId: 100
  });

  function loadDb() {
    if (storageOK) {
      try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); }
      catch (e) { storageOK = false; }
    }
    if (memory) return memory;
    const fresh = SEED();
    saveDb(fresh);
    return fresh;
  }
  function saveDb(next) {
    memory = next;
    if (!storageOK) return true;
    try { localStorage.setItem(KEY, JSON.stringify(next)); return true; }
    catch (e) { storageOK = false; return false; }
  }
  let db = loadDb();
  const persist = () => saveDb(db);
  const nextId = () => ++db.nextId;

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const money = (c) => '£' + (Number(c || 0) / 100).toFixed(2);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));
  const validPw = (p) => typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);

  // Safari can't parse "2026-08-07 21:59:42"; normalise before parsing.
  function fmtDate(v, opts) {
    if (!v) return '—';
    let s = String(v).trim().replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) s += 'Z';
    const d = new Date(s);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', opts);
  }

  async function hash(str) {
    if (window.crypto && crypto.subtle && window.isSecureContext) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < str.length; i++) {
      h1 = ((h1 ^ str.charCodeAt(i)) >>> 0) * 0x01000193 >>> 0;
      h2 = (h2 + str.charCodeAt(i) * (i + 7)) >>> 0;
    }
    return 'fb' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }
  async function ensurePasswords() {
    let changed = false;
    for (const u of db.users) if (u.pw === null && u.plain) { u.pw = await hash(u.plain); delete u.plain; changed = true; }
    if (changed) persist();
  }

  const slugify = (n) => n.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.random().toString(16).slice(2, 6);
  const currentUser = () => db.session ? db.users.find(u => u.id === db.session) || null : null;
  const currentAdmin = () => {
    const a = db.adminSession ? db.users.find(u => u.id === db.adminSession) : null;
    return a && a.is_admin && a.is_active ? a : null;
  };
  const priceFrom = (p) => Math.min(...(p.sizes || [{ price_cents: 0 }]).map(s => s.price_cents));
  const visibleProducts = () => db.products.filter(p => !p.hidden);
  const lowStockLimit = () => parseInt(db.settings.low_stock_threshold, 10) || 5;
  const cartCount = () => db.cart.reduce((s, i) => s + i.qty, 0);
  const cartSubtotal = () => db.cart.reduce((s, i) => s + i.unit_price_cents * i.qty, 0);

  const BOTTLE = `<svg class="ph-bottle" viewBox="0 0 160 220" xmlns="http://www.w3.org/2000/svg">
    <rect x="55" y="20" width="50" height="18" rx="3" fill="none" stroke-width="1.2"/>
    <rect x="63" y="10" width="34" height="12" rx="2"/>
    <path d="M55 38 L50 60 L50 195 Q50 205 60 205 L100 205 Q110 205 110 195 L110 60 L105 38 Z" fill="rgba(203,184,139,0.06)" stroke-width="1.2"/>
    <line x1="50" y1="90" x2="110" y2="90" stroke-width="0.6" opacity="0.5"/></svg>`;
  const MOON = `<svg class="moon-mark" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
  const img = (p, cls) => p.image_url ? `<img class="${cls || ''}" src="${esc(p.image_url)}" alt="${esc(p.name)}">` : BOTTLE;

  // ---- admin inline editing ----------------------------------------
  // When (and only when) an admin is signed in, a small "+" appears beside
  // anything editable. The check runs at render time from the stored admin
  // session, so a normal visitor never receives these controls at all.
  const isAdmin = () => !!currentAdmin();
  function ed(field, label, multiline) {
    if (!isAdmin()) return '';
    return `<button class="admin-plus" data-ed="${esc(field)}" data-ml="${multiline ? 1 : 0}" title="Edit ${esc(label || field)}" aria-label="Edit ${esc(label || field)}">+</button>`;
  }
  function edProduct(id) {
    if (!isAdmin()) return '';
    return `<button class="admin-plus on-card" data-ed-product="${id}" title="Edit this perfume" aria-label="Edit this perfume">+</button>`;
  }
  function addProductTile() {
    if (!isAdmin()) return '';
    return `<button class="add-tile" data-add-product="1"><span class="plus-big">+</span><span>Add New Perfume</span></button>`;
  }

  function toast(msg, kind) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'show ' + (kind || 'success');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = ''; }, 3200);
  }

  function applyTheme() {
    const s = db.settings;
    const r = document.documentElement.style;
    if (s.color_primary) r.setProperty('--moon', s.color_primary);
    if (s.color_secondary) r.setProperty('--g-500', s.color_secondary);
    if (s.color_background) r.setProperty('--g-950', s.color_background);
    document.title = s.site_title || 'Maison Lunar';
    let link = $('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">' + (s.favicon || '🌙') + '</text></svg>');
  }

  // ---------------------------------------------------------------
  // Layout shells
  // ---------------------------------------------------------------
  function storeShell(inner) {
    const s = db.settings;
    const user = currentUser();
    const count = cartCount();
    return `
    ${isAdmin() ? `<div class="admin-bar">
      <span><strong>Admin mode</strong> — tap any <span class="plus-inline">+</span> to edit that item.</span>
      <span class="row-gap">
        <a href="#/admin/dashboard">Dashboard</a>
        <button id="exitAdmin">Exit admin</button>
      </span></div>` : ''}
    ${s.banner_text ? `<div class="promo-bar">${esc(s.banner_text)}${ed('banner_text', 'promo banner')}</div>`
      : (isAdmin() ? `<div class="promo-bar empty">No promo banner ${ed('banner_text', 'promo banner')}</div>` : '')}
    <header>
      <nav class="nav">
        <a href="#/" class="brand">${MOON}<span>${esc(s.logo_text || 'MAISON LUNAR')}</span></a>${ed('logo_text', 'website name')}
        <ul class="nav-links" id="navLinks">
          <li><a href="#/shop">Shop</a></li>
          <li><a href="#/about">About</a></li>
          <li><a href="#/contact">Contact</a></li>
          <li><a href="${user ? '#/account' : '#/login'}" id="authLink">${user ? 'My Account' : 'Login / Sign Up'}</a></li>
          <li><a class="nav-cta" href="#/cart">Cart${count ? ` <span class="cart-count">${count}</span>` : ''}</a></li>
        </ul>
        <button class="nav-toggle" id="navToggle" aria-label="Toggle menu"><span></span><span></span><span></span></button>
      </nav>
    </header>
    <main>${inner}</main>
    <footer>
      <div class="wrap">
        <div class="footer-grid">
          <div class="footer-brand">
            <div class="brand">${MOON}<span>${esc(s.logo_text || 'MAISON LUNAR')}</span></div>
            <p>${esc(s.footer_text)}${ed('footer_text', 'footer text', true)}</p>
          </div>
          <div class="footer-col"><h4>Navigate</h4><ul>
            <li><a href="#/shop">Shop</a></li><li><a href="#/about">About</a></li>
            <li><a href="#/contact">Contact</a></li><li><a href="#/account">My Account</a></li></ul></div>
          <div class="footer-col"><h4>Contact</h4><ul>
            <li><a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a></li>
            ${s.contact_phone ? `<li><a href="tel:${esc(s.contact_phone)}">${esc(s.contact_phone)}</a></li>` : ''}
            <li><span>${esc(s.contact_address)}</span></li></ul></div>
          <div class="footer-col"><h4>Follow</h4><ul>
            <li><a href="${esc(s.instagram || '#')}">Instagram</a></li>
            <li><a href="${esc(s.pinterest || '#')}">Pinterest</a></li></ul></div>
        </div>
        <div class="footer-bottom">
          <span>&copy; ${new Date().getFullYear()} ${esc(s.logo_text || 'Maison Lunar')}. All rights reserved.</span>
          <a href="#/admin">Admin</a>
        </div>
      </div>
    </footer>`;
  }

  const ADMIN_NAV = [
    ['#/admin/dashboard', 'Dashboard'], ['#/admin/products', 'Perfumes'], ['#/admin/stock', 'Stock'],
    ['#/admin/orders', 'Orders'], ['#/admin/customers', 'Customers'], ['#/admin/categories', 'Categories'],
    ['#/admin/content', 'Homepage & Content'], ['#/admin/appearance', 'Website Settings'], ['#/admin/messages', 'Messages']
  ];

  function adminShell(title, inner, active) {
    const a = currentAdmin();
    return `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <div class="admin-brand">${MOON}<span>${esc(db.settings.logo_text || 'MAISON LUNAR')}</span></div>
        <nav class="admin-nav">
          ${ADMIN_NAV.map(([h, l]) => `<a href="${h}" class="${h === active ? 'active' : ''}">${l}</a>`).join('')}
          <div class="divider"></div>
          <a href="#/">View Site ↗</a>
          <button id="adminLogout">Log Out</button>
        </nav>
      </aside>
      <main class="admin-main">
        <div class="admin-topbar"><h1>${esc(title)}</h1><div class="who">${esc(a ? a.full_name + ' · ' + a.email : '')}</div></div>
        ${inner}
      </main>
    </div>`;
  }

  // ---------------------------------------------------------------
  // Customer views
  // ---------------------------------------------------------------
  function productCard(p) {
    const badges = [p.is_bestseller ? '<span class="badge">Best Seller</span>' : '',
                    p.is_new_arrival ? '<span class="badge">New</span>' : ''].join('');
    const out = p.stock < 1;
    return `<div class="product-card glass">
      <div class="product-card-image">${img(p)}<div class="badge-row">${badges}</div>${edProduct(p.id)}</div>
      <div class="product-card-body">
        <div class="cat">${esc(p.category)}</div>
        <h3>${esc(p.name)}</h3>
        <p class="desc">${esc(p.short_description)}</p>
        <div class="price">From ${money(priceFrom(p))}</div>
        <div class="product-card-actions">
          <a class="btn btn-ghost" href="#/product/${esc(p.slug)}">View Details</a>
          <button class="btn btn-primary" data-add="${p.id}" ${out ? 'disabled' : ''}>${out ? 'Out of Stock' : 'Add to Cart'}</button>
        </div>
      </div></div>`;
  }

  function viewHome() {
    const s = db.settings;
    const featured = visibleProducts().filter(p => p.is_featured).slice(0, 4);
    return storeShell(`
      <section class="hero">
        <div class="glow-field"><div class="glow g1"></div><div class="glow g2"></div><div class="glow g3"></div></div>
        <div class="wrap hero-grid">
          <div>
            <div class="eyebrow">${esc(s.hero_eyebrow)}${ed('hero_eyebrow', 'eyebrow label')}</div>
            <h1 id="heroHeadline">${esc(s.hero_headline)}${ed('hero_headline', 'headline')}</h1>
            <p class="lede">${esc(s.hero_description)}${ed('hero_description', 'hero description', true)}</p>
            <div class="hero-ctas">
              <a href="${esc(s.hero_cta_link || '#/shop')}" class="btn btn-primary">${esc(s.hero_cta_text || 'Shop')}</a>
              ${ed('hero_cta_text', 'button text')}
              <a href="#/contact" class="btn btn-ghost">Get in Touch</a>
            </div>
          </div>
          <div class="moon-stage">
            <div class="moon-ring r1"></div><div class="moon-ring r2"></div><div class="moon-orb"></div>
            <svg class="bottle" viewBox="0 0 160 220">
              <rect x="55" y="20" width="50" height="18" rx="3" fill="none" stroke="var(--moon)" stroke-width="1.2"/>
              <rect x="63" y="10" width="34" height="12" rx="2" fill="var(--moon)"/>
              <path d="M55 38 L50 60 L50 195 Q50 205 60 205 L100 205 Q110 205 110 195 L110 60 L105 38 Z" fill="rgba(203,184,139,0.06)" stroke="var(--moon)" stroke-width="1.2"/>
              <line x1="50" y1="90" x2="110" y2="90" stroke="var(--moon)" stroke-width="0.6" opacity="0.5"/>
            </svg>
          </div>
        </div>
      </section>

      <section>
        <div class="wrap">
          <div class="section-head"><div class="eyebrow">Featured</div><h2>This Season's Favourites</h2></div>
          <div class="product-grid">${featured.map(productCard).join('')}${addProductTile()}
            ${!featured.length && !isAdmin() ? '<p class="muted">No featured perfumes yet.</p>' : ''}</div>
        </div>
      </section>

      <section id="about" class="band">
        <div class="wrap about-grid">
          <div>
            <div class="eyebrow">Who We Are</div>
            <h2 id="aboutHeading">${esc(s.about_heading)}${ed('about_heading', 'about heading')}</h2>
            <blockquote>"We wanted a green that only reveals itself at night."</blockquote>
            <p class="muted" id="aboutBody">${esc(s.about_body)}${ed('about_body', 'about text', true)}</p>
          </div>
          <div class="facts-card glass">
            <div class="fact"><dt>Founded</dt><dd>2019, from a single courtyard formula</dd></div>
            <div class="fact"><dt>Based</dt><dd>${esc(s.contact_address)}</dd></div>
            <div class="fact"><dt>Philosophy</dt><dd>Small batches, natural ingredients, no rush</dd></div>
            <div class="fact"><dt>Made For</dt><dd>Evenings, quiet rooms, people who read labels</dd></div>
          </div>
        </div>
      </section>

      <section>
        <div class="wrap">
          <div class="section-head"><div class="eyebrow">Testimonials</div><h2>Worn &amp; Well-Loved</h2></div>
          <div class="testi-grid">
            ${(s.testimonials || []).map((t, i) => `<div class="testi-card glass">
              <div class="testi-stars">★★★★★${isAdmin() ? `<button class="admin-plus" data-ed-testi="${i}" title="Edit testimonial">+</button>` : ''}</div>
              <p class="quote">"${esc(t.quote)}"</p>
              <div class="testi-person"><div class="testi-avatar">${esc((t.name || '?')[0])}</div>
                <div><div class="testi-name">${esc(t.name)}</div><div class="testi-role">${esc(t.role)}</div></div></div>
            </div>`).join('')}
            ${isAdmin() ? `<button class="add-tile short" data-ed-testi="new"><span class="plus-big">+</span><span>Add Testimonial</span></button>` : ''}
          </div>
        </div>
      </section>

      <section id="contact" class="band">
        <div class="wrap">
          <div class="section-head"><div class="eyebrow">Get In Touch</div><h2>Send Us a Message</h2></div>
          <div class="contact-grid">
            <form id="contactForm" novalidate>
              <div class="hp-field"><input type="text" id="company" tabindex="-1" autocomplete="off"></div>
              <div class="field-row">
                <div class="field" data-f="name"><label for="cName">Name</label><input id="cName" type="text"><div class="field-error">Please enter your name.</div></div>
                <div class="field" data-f="email"><label for="cEmail">Email</label><input id="cEmail" type="email"><div class="field-error">Please enter a valid email.</div></div>
              </div>
              <div class="field" data-f="subject"><label for="cSubject">Subject</label><input id="cSubject" type="text"><div class="field-error">Please enter a subject.</div></div>
              <div class="field" data-f="message"><label for="cMessage">Message</label><textarea id="cMessage"></textarea><div class="field-error">Please enter a message.</div></div>
              <button class="btn btn-primary" id="contactSubmit" type="submit">Send Message</button>
              <div class="form-status" id="contactStatus"></div>
            </form>
            <dl class="contact-side">
              <dt>Email</dt><dd><a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a>${ed('contact_email', 'contact email')}</dd>
              <dt>Phone</dt><dd>${s.contact_phone ? `<a href="tel:${esc(s.contact_phone)}">${esc(s.contact_phone)}</a>` : '<span class="muted">Not set</span>'}${ed('contact_phone', 'phone number')}</dd>
              <dt>Atelier</dt><dd>${esc(s.contact_address)}${ed('contact_address', 'address')}</dd>
            </dl>
          </div>
        </div>
      </section>`);
  }

  function bindHome() {
    const form = $('#contactForm');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const st = $('#contactStatus');
      if ($('#company').value) { st.className = 'form-status success'; st.textContent = 'Thank you.'; return; }
      const vals = { name: $('#cName').value.trim(), email: $('#cEmail').value.trim(), subject: $('#cSubject').value.trim(), message: $('#cMessage').value.trim() };
      let ok = true;
      const mark = (f, bad) => { const el = $(`[data-f="${f}"]`); el.classList.toggle('invalid', bad); if (bad) ok = false; };
      mark('name', !vals.name); mark('email', !validEmail(vals.email));
      mark('subject', !vals.subject); mark('message', !vals.message);
      if (!ok) { st.className = 'form-status error'; st.textContent = 'Please fix the highlighted fields.'; return; }
      db.messages.unshift({ id: nextId(), ...vals, is_read: 0, created_at: new Date().toISOString() });
      persist();
      st.className = 'form-status success';
      st.textContent = 'Thank you — your message has been saved to the admin inbox. (No email is sent in this browser-only build.)';
      form.reset();
    });
  }

  function viewShop(params) {
    const filter = params.get('f') || 'all';
    const q = (params.get('q') || '').toLowerCase();
    let list = visibleProducts();
    if (['mens', 'womens', 'unisex'].includes(filter)) list = list.filter(p => p.category === filter);
    else if (filter === 'bestseller') list = list.filter(p => p.is_bestseller);
    else if (filter === 'new') list = list.filter(p => p.is_new_arrival);
    if (q) list = list.filter(p => (p.name + ' ' + p.short_description + ' ' + (p.brand || '')).toLowerCase().includes(q));

    const chips = [['all', 'All'], ...db.categories.map(c => [c.key, c.label]), ['bestseller', 'Best Sellers'], ['new', 'New Arrivals']];
    return storeShell(`
      <section class="page-head">
        <div class="wrap-narrow center">
          <div class="eyebrow">The Collection</div>
          <h1>Every Bottle We Make</h1>
          <div class="search-row"><input type="search" id="shopSearch" placeholder="Search perfumes..." value="${esc(params.get('q') || '')}"></div>
        </div>
      </section>
      <section class="pt0">
        <div class="wrap">
          <div class="filter-bar">${chips.map(([k, l]) => `<button class="filter-chip ${k === filter ? 'active' : ''}" data-filter="${k}">${esc(l)}</button>`).join('')}</div>
          <div class="product-grid">${list.map(productCard).join('')}${addProductTile()}
            ${!list.length && !isAdmin() ? '<p class="empty-note">No perfumes match this filter.</p>' : ''}</div>
        </div>
      </section>`);
  }

  function bindShop(params) {
    $$('.filter-chip').forEach(c => c.addEventListener('click', () => {
      const q = params.get('q'); location.hash = '#/shop?f=' + c.dataset.filter + (q ? '&q=' + encodeURIComponent(q) : '');
    }));
    const s = $('#shopSearch');
    if (s) {
      let t;
      s.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const f = params.get('f') || 'all';
          const val = s.value.trim();
          location.hash = '#/shop?f=' + f + (val ? '&q=' + encodeURIComponent(val) : '');
        }, 400);
      });
    }
  }

  function viewProduct(slug) {
    const p = db.products.find(x => x.slug === slug && !x.hidden);
    if (!p) return storeShell(`<section><div class="wrap"><h2>Product not found</h2><p class="muted">That perfume may have been removed. <a href="#/shop">Back to the shop</a>.</p></div></section>`);
    const related = visibleProducts().filter(x => x.category === p.category && x.id !== p.id).slice(0, 4);
    return storeShell(`
      <section class="page-head">
        <div class="wrap pd-grid">
          <div class="pd-image">${img(p)}</div>
          <div>
            <div class="pd-cat">${esc(p.brand ? p.brand + ' · ' : '')}${esc(p.category)}</div>
            <h1 class="pd-name">${esc(p.name)}</h1>
            <div class="pd-price" id="pdPrice">${money(p.sizes[0].price_cents)}</div>
            <p class="muted">${esc(p.description)}</p>
            <div class="pd-pyramid">
              <div class="pd-tier"><div class="lbl">Top</div><div class="val">${esc(p.top_notes)}</div></div>
              <div class="pd-tier"><div class="lbl">Heart</div><div class="val">${esc(p.middle_notes)}</div></div>
              <div class="pd-tier"><div class="lbl">Base</div><div class="val">${esc(p.base_notes)}</div></div>
            </div>
            <label class="mini-label">Size</label>
            <div class="size-options">${p.sizes.map((sz, i) => `<div class="size-chip ${i === 0 ? 'active' : ''}" data-label="${esc(sz.label)}" data-price="${sz.price_cents}">${esc(sz.label)}</div>`).join('')}</div>
            <div class="qty-row">
              <div class="qty-control"><button id="qMinus">−</button><span id="qVal">1</span><button id="qPlus">+</button></div>
              <span class="muted small">${p.stock > 0 ? p.stock + ' in stock' : 'Out of stock'}</span>
            </div>
            <div class="pd-actions">
              <button class="btn btn-primary" id="pdAdd" data-id="${p.id}" ${p.stock < 1 ? 'disabled' : ''}>Add to Cart</button>
              <a class="btn btn-ghost" href="#/shop">Continue Shopping</a>
            </div>
            <div class="form-status" id="pdStatus"></div>
          </div>
        </div>
      </section>
      ${related.length ? `<section class="band"><div class="wrap">
        <div class="section-head"><div class="eyebrow">You May Also Like</div><h2>Related Perfumes</h2></div>
        <div class="product-grid">${related.map(productCard).join('')}</div></div></section>` : ''}`);
  }

  function bindProduct(slug) {
    const p = db.products.find(x => x.slug === slug);
    if (!p) return;
    let size = p.sizes[0], qty = 1;
    $$('.size-chip').forEach(c => c.addEventListener('click', () => {
      $$('.size-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      size = { label: c.dataset.label, price_cents: +c.dataset.price };
      $('#pdPrice').textContent = money(size.price_cents);
    }));
    $('#qMinus').addEventListener('click', () => { qty = Math.max(1, qty - 1); $('#qVal').textContent = qty; });
    $('#qPlus').addEventListener('click', () => { qty = Math.min(20, qty + 1); $('#qVal').textContent = qty; });
    $('#pdAdd').addEventListener('click', () => {
      addToCart(p.id, size.label, qty);
      const st = $('#pdStatus');
      st.className = 'form-status success';
      st.textContent = `Added ${qty} × ${p.name} (${size.label}) to your cart.`;
      updateCartBadge();
    });
  }

  function addToCart(productId, sizeLabel, qty) {
    const p = db.products.find(x => x.id === productId);
    if (!p || p.stock < 1) { toast('That perfume is out of stock.', 'error'); return; }
    const size = (p.sizes || []).find(s => s.label === sizeLabel) || p.sizes[0];
    const existing = db.cart.find(i => i.product_id === p.id && i.size_label === size.label);
    if (existing) existing.qty = Math.min(20, existing.qty + (qty || 1));
    else db.cart.push({ id: nextId(), product_id: p.id, size_label: size.label, unit_price_cents: size.price_cents, qty: qty || 1 });
    persist();
  }

  function updateCartBadge() {
    const link = $('.nav-cta');
    if (!link) return;
    const n = cartCount();
    link.innerHTML = 'Cart' + (n ? ` <span class="cart-count">${n}</span>` : '');
  }

  // ---- payment helpers ---------------------------------------------
  // IMPORTANT: this build never stores a card number. The PAN is validated in
  // memory, then only the brand and last 4 digits are kept on the order — the
  // same thing a receipt shows. Storing full card data in a browser would be
  // unsafe and against PCI rules, so it simply isn't done here. No money moves
  // either: taking real payments needs a processor (Stripe) and a server.
  function luhn(num) {
    const d = String(num).replace(/\D/g, '');
    if (d.length < 12) return false;
    let sum = 0, alt = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let n = +d[i];
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }
  function cardBrand(num) {
    const d = String(num).replace(/\D/g, '');
    if (/^4/.test(d)) return 'Visa';
    if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
    if (/^3[47]/.test(d)) return 'American Express';
    if (/^6(?:011|5)/.test(d)) return 'Discover';
    if (/^(50|5[6-9]|6)/.test(d)) return 'Maestro';
    return d.length ? 'Card' : '';
  }
  function validExpiry(v) {
    const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(v).trim());
    if (!m) return false;
    const mm = +m[1], yy = 2000 + +m[2];
    if (mm < 1 || mm > 12) return false;
    const now = new Date();
    const end = new Date(yy, mm, 0, 23, 59, 59);
    return end >= now;
  }
  // Apple Pay / Google Pay can only be offered when the device supports them
  // AND a payment processor is connected. We can detect the first; the second
  // is false in this build, so they're shown as unavailable rather than as
  // buttons that would do nothing.
  const walletAvailable = () => ({
    apple: !!(window.ApplePaySession && window.ApplePaySession.canMakePayments && window.ApplePaySession.canMakePayments()),
    google: !!window.PaymentRequest
  });

  function viewCart() {
    if (!db.cart.length) {
      return storeShell(`<section class="page-head"><div class="wrap">
        <div class="empty-state glass"><h3>Your cart is empty</h3><p class="muted">Explore the collection and find something to wear.</p>
        <a class="btn btn-primary" href="#/shop">Browse Perfumes</a></div></div></section>`);
    }
    const rows = db.cart.map(i => {
      const p = db.products.find(x => x.id === i.product_id) || { name: 'Removed product', image_url: '' };
      return `<div class="cart-item">
        <div class="cart-item-img">${img(p)}</div>
        <div><div class="cart-item-name">${esc(p.name)}</div>
          <div class="cart-item-meta">${esc(i.size_label)} · ${money(i.unit_price_cents)} each</div>
          <button class="cart-remove" data-remove="${i.id}">Remove</button></div>
        <div class="qty-control"><button data-q="-1" data-id="${i.id}">−</button><span>${i.qty}</span><button data-q="1" data-id="${i.id}">+</button></div>
        <div class="cart-item-price">${money(i.unit_price_cents * i.qty)}</div>
      </div>`;
    }).join('');
    const sub = cartSubtotal();
    const u = currentUser();
    return storeShell(`<section class="page-head"><div class="wrap">
      <div class="section-head left"><div class="eyebrow">Your Selection</div><h1>Shopping Cart</h1></div>
      <div class="cart-grid">
        <div class="glass cart-items">${rows}</div>
        <div class="cart-summary glass">
          <div class="summary-row"><span>Subtotal</span><span>${money(sub)}</span></div>
          <div class="summary-row"><span>Shipping</span><span>Calculated at dispatch</span></div>
          <div class="summary-row total"><span>Total</span><span>${money(sub)}</span></div>
          <button class="btn btn-primary btn-full mt20" id="checkoutToggle">Proceed to Checkout</button>
          <a class="btn btn-ghost btn-full mt10" href="#/shop">Continue Shopping</a>
          <form id="checkoutForm" class="hidden mt20">
            <h3 class="co-heading">Delivery Details</h3>
            <div class="field" data-f="coName"><label for="coName">Full Name</label><input id="coName" value="${esc(u ? u.full_name : '')}"><div class="field-error">Please enter your name.</div></div>
            <div class="field" data-f="coEmail"><label for="coEmail">Email</label><input id="coEmail" type="email" inputmode="email" value="${esc(u ? u.email : '')}"><div class="field-error">Please enter a valid email.</div></div>
            <div class="field" data-f="coAddr"><label for="coAddr">Shipping Address</label><textarea id="coAddr"></textarea><div class="field-error">Please enter a delivery address.</div></div>

            <h3 class="co-heading">Payment</h3>
            <div class="test-mode-note">Test mode — no payment is taken and no card is stored.
              Please don't enter a real card. Use <strong>4242 4242 4242 4242</strong>, any future expiry and any CVC.</div>

            <div class="pay-methods">
              <label class="pay-option selected"><input type="radio" name="payMethod" value="card" checked>
                <span class="pay-label">Card</span>
                <span class="card-brands"><span class="brand-chip">VISA</span><span class="brand-chip">MC</span><span class="brand-chip">AMEX</span></span></label>
              <label class="pay-option disabled" id="applePayOption"><input type="radio" name="payMethod" value="apple" disabled>
                <span class="pay-label"> Pay</span><span class="pay-note" id="applePayNote">Checking…</span></label>
              <label class="pay-option disabled" id="googlePayOption"><input type="radio" name="payMethod" value="google" disabled>
                <span class="pay-label">G Pay</span><span class="pay-note" id="googlePayNote">Checking…</span></label>
            </div>

            <div id="cardFields">
              <div class="field" data-f="ccNum"><label for="ccNum">Card Number <span class="brand-out" id="brandOut"></span></label>
                <input id="ccNum" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" maxlength="23">
                <div class="field-error">Please enter a valid card number.</div></div>
              <div class="field" data-f="ccName"><label for="ccName">Name on Card</label>
                <input id="ccName" autocomplete="cc-name"><div class="field-error">Please enter the name on the card.</div></div>
              <div class="field-row">
                <div class="field" data-f="ccExp"><label for="ccExp">Expiry (MM/YY)</label>
                  <input id="ccExp" inputmode="numeric" autocomplete="cc-exp" placeholder="12/29" maxlength="5">
                  <div class="field-error">Enter a valid future expiry date.</div></div>
                <div class="field" data-f="ccCvc"><label for="ccCvc">CVC</label>
                  <input id="ccCvc" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4">
                  <div class="field-error">Enter the 3 or 4 digit code.</div></div>
              </div>
              <p class="secure-note">🔒 Only the card brand and last 4 digits are ever saved — never the full number.</p>
            </div>

            <button class="btn btn-primary btn-full" id="placeOrder" type="submit">Pay ${money(sub)}</button>
            <div class="form-status" id="coStatus"></div>
          </form>
        </div>
      </div></div></section>`);
  }

  function bindCart() {
    $$('[data-q]').forEach(b => b.addEventListener('click', () => {
      const item = db.cart.find(i => i.id === +b.dataset.id);
      if (!item) return;
      item.qty += +b.dataset.q;
      if (item.qty < 1) db.cart = db.cart.filter(i => i.id !== item.id);
      persist(); render();
    }));
    $$('[data-remove]').forEach(b => b.addEventListener('click', () => {
      db.cart = db.cart.filter(i => i.id !== +b.dataset.remove);
      persist(); render();
    }));
    const toggle = $('#checkoutToggle');
    if (toggle) toggle.addEventListener('click', () => $('#checkoutForm').classList.toggle('hidden'));
    // ---- wallet availability (honest: shown as unavailable, not as dead buttons)
    const wallets = walletAvailable();
    const aNote = $('#applePayNote'), gNote = $('#googlePayNote');
    if (aNote) aNote.textContent = wallets.apple
      ? 'Device ready — needs a payment processor connected'
      : 'Not available on this device/browser';
    if (gNote) gNote.textContent = wallets.google
      ? 'Browser ready — needs a payment processor connected'
      : 'Not available on this browser';

    // ---- card input formatting
    const ccNum = $('#ccNum'), ccExp = $('#ccExp'), ccCvc = $('#ccCvc');
    if (ccNum) ccNum.addEventListener('input', () => {
      const digits = ccNum.value.replace(/\D/g, '').slice(0, 19);
      ccNum.value = digits.replace(/(.{4})/g, '$1 ').trim();
      $('#brandOut').textContent = cardBrand(digits);
      $('[data-f="ccNum"]').classList.remove('invalid');
    });
    if (ccExp) ccExp.addEventListener('input', () => {
      let d = ccExp.value.replace(/\D/g, '').slice(0, 4);
      if (d.length >= 3) d = d.slice(0, 2) + '/' + d.slice(2);
      ccExp.value = d;
      $('[data-f="ccExp"]').classList.remove('invalid');
    });
    if (ccCvc) ccCvc.addEventListener('input', () => {
      ccCvc.value = ccCvc.value.replace(/\D/g, '').slice(0, 4);
      $('[data-f="ccCvc"]').classList.remove('invalid');
    });

    const form = $('#checkoutForm');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      const st = $('#coStatus');
      st.className = 'form-status'; st.textContent = '';
      const name = $('#coName').value.trim(), email = $('#coEmail').value.trim(), addr = $('#coAddr').value.trim();

      let ok = true;
      const mark = (f, bad) => { const el = $(`[data-f="${f}"]`); if (el) el.classList.toggle('invalid', bad); if (bad) ok = false; };
      mark('coName', !name);
      mark('coEmail', !validEmail(email));
      mark('coAddr', !addr);

      const rawCard = ccNum ? ccNum.value.replace(/\D/g, '') : '';
      mark('ccNum', !luhn(rawCard));
      mark('ccName', !$('#ccName').value.trim());
      mark('ccExp', !validExpiry(ccExp.value));
      mark('ccCvc', !/^\d{3,4}$/.test(ccCvc.value));

      if (!ok) { st.className = 'form-status error'; st.textContent = 'Please fix the highlighted fields.'; return; }

      // Keep ONLY brand + last4. The full number is discarded here and never
      // written to storage.
      const payment = { method: 'card', brand: cardBrand(rawCard), last4: rawCard.slice(-4) };

      const btn = $('#placeOrder');
      btn.disabled = true; btn.textContent = 'Processing…';
      setTimeout(() => { finishOrder(name, email, addr, payment, st, btn); }, 700);
      return;
    });

    function finishOrder(name, email, addr, payment, st, btn) {
      const items = db.cart.map(i => {
        const p = db.products.find(x => x.id === i.product_id);
        return { product_id: i.product_id, product_name: p ? p.name : 'Product', size_label: i.size_label, unit_price_cents: i.unit_price_cents, qty: i.qty };
      });
      const total = cartSubtotal();
      const order = { id: nextId(), order_number: 'ML-' + Date.now().toString(36).toUpperCase(), user_id: db.session,
        customer_name: name, customer_email: email, shipping_address: addr,
        status: 'pending', subtotal_cents: total, total_cents: total,
        payment, created_at: new Date().toISOString(), items };
      items.forEach(i => { const p = db.products.find(x => x.id === i.product_id); if (p) p.stock = Math.max(0, p.stock - i.qty); });
      db.orders.unshift(order);
      db.cart = [];
      if (!persist()) {
        st.className = 'form-status error';
        st.textContent = 'Could not save the order — browser storage is blocked.';
        btn.disabled = false; btn.textContent = 'Place Order';
        return;
      }
      toast('Order ' + order.order_number + ' placed.');
      location.hash = '#/order/' + order.order_number;
    }
  }

  function viewOrderConfirm(orderNumber) {
    const o = db.orders.find(x => x.order_number === orderNumber);
    if (!o) return storeShell(`<section class="page-head"><div class="wrap"><h2>Order not found</h2>
      <p class="muted">We couldn't find that order. <a href="#/shop">Back to the shop</a>.</p></div></section>`);
    return storeShell(`<section class="page-head"><div class="wrap-narrow">
      <div class="glass confirm-card">
        <div class="confirm-tick">✓</div>
        <h1>Thank you, ${esc(o.customer_name.split(' ')[0])}</h1>
        <p class="muted">Your order is confirmed. A copy would normally be emailed to
          <strong>${esc(o.customer_email)}</strong> — this browser-only build can't send email.</p>
        <div class="confirm-num">Order ${esc(o.order_number)}</div>
        <div class="confirm-items">
          ${o.items.map(i => `<div class="confirm-row"><span>${esc(i.product_name)} · ${esc(i.size_label)} × ${i.qty}</span>
            <span>${money(i.unit_price_cents * i.qty)}</span></div>`).join('')}
          <div class="confirm-row total"><span>Total</span><span>${money(o.total_cents)}</span></div>
        </div>
        ${o.payment ? `<p class="muted small">Paid with ${esc(o.payment.brand)} ending ${esc(o.payment.last4)} — test mode, no money was taken.</p>` : ''}
        <p class="muted small">Delivering to: ${esc(o.shipping_address || 'No address given')}</p>
        <div class="confirm-actions">
          <a class="btn btn-primary" href="#/shop">Continue Shopping</a>
          ${currentUser() ? '<a class="btn btn-ghost" href="#/account">View My Orders</a>' : '<a class="btn btn-ghost" href="#/login">Create an Account</a>'}
        </div>
      </div></div></section>`);
  }

  function viewLogin() {
    return storeShell(`<div class="auth-wrap">
      <div class="auth-tabs"><div class="auth-tab active" data-tab="login">Login</div><div class="auth-tab" data-tab="signup">Sign Up</div></div>
      <div class="auth-card glass">
        <div class="auth-panel active" id="panel-login">
          <form id="loginForm" novalidate>
            <div class="field" data-f="lemail"><label for="lEmail">Email Address</label><input id="lEmail" type="email" autocomplete="email"><div class="field-error">Please enter a valid email.</div></div>
            <div class="field" data-f="lpw"><label for="lPw">Password</label>
              <div class="password-field"><input id="lPw" type="password" autocomplete="current-password"><button type="button" class="password-toggle" data-target="lPw">Show</button></div>
              <div class="field-error">Please enter your password.</div></div>
            <div class="auth-links"><label class="checkbox-row"><input type="checkbox" id="remember"> Remember me</label><a href="#" id="forgotLink">Forgot password?</a></div>
            <div class="hidden" id="forgotPanel">
              <div class="field"><label for="fEmail">Your email</label><input id="fEmail" type="email"></div>
              <button type="button" class="btn btn-ghost btn-full" id="forgotBtn">Send Reset Link</button>
              <div class="form-status" id="forgotStatus"></div>
            </div>
            <button class="btn btn-primary btn-full" id="loginBtn" type="submit">Login</button>
            <div class="form-status" id="loginStatus"></div>
          </form>
          <div class="auth-switch">New here? <a href="#" data-switch="signup">Create an account</a></div>
        </div>
        <div class="auth-panel" id="panel-signup">
          <form id="signupForm" novalidate>
            <div class="field" data-f="sname"><label for="sName">Full Name</label><input id="sName" type="text" autocomplete="name"><div class="field-error">Please enter your full name.</div></div>
            <div class="field" data-f="semail"><label for="sEmail">Email</label><input id="sEmail" type="email" autocomplete="email"><div class="field-error">Please enter a valid email.</div></div>
            <div class="field" data-f="spw"><label for="sPw">Password</label>
              <div class="password-field"><input id="sPw" type="password" autocomplete="new-password"><button type="button" class="password-toggle" data-target="sPw">Show</button></div>
              <div class="field-hint">At least 8 characters, with a letter and a number.</div>
              <div class="field-error">Password needs 8+ characters with a letter and a number.</div></div>
            <div class="field" data-f="sconfirm"><label for="sConfirm">Confirm Password</label>
              <div class="password-field"><input id="sConfirm" type="password" autocomplete="new-password"><button type="button" class="password-toggle" data-target="sConfirm">Show</button></div>
              <div class="field-error">Passwords do not match.</div></div>
            <button class="btn btn-primary btn-full" id="signupBtn" type="submit">Create Account</button>
            <div class="form-status" id="signupStatus"></div>
          </form>
          <div class="auth-switch">Already have an account? <a href="#" data-switch="login">Login</a></div>
        </div>
      </div>
    </div>`);
  }

  function bindLogin() {
    const showTab = (name) => {
      $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      $$('.auth-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
    };
    $$('.auth-tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
    $$('[data-switch]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); showTab(a.dataset.switch); }));
    $$('.password-toggle').forEach(b => b.addEventListener('click', () => {
      const i = document.getElementById(b.dataset.target);
      const showing = i.type === 'text';
      i.type = showing ? 'password' : 'text';
      b.textContent = showing ? 'Show' : 'Hide';
    }));
    $('#forgotLink').addEventListener('click', (e) => { e.preventDefault(); $('#forgotPanel').classList.toggle('hidden'); });
    $('#forgotBtn').addEventListener('click', () => {
      const st = $('#forgotStatus');
      st.className = 'form-status success';
      st.textContent = 'In this browser-only build no email can be sent. Sign up again, or use the admin account to reset data.';
    });

    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#loginStatus');
      const email = $('#lEmail').value.trim(), pw = $('#lPw').value;
      $('[data-f="lemail"]').classList.toggle('invalid', !validEmail(email));
      $('[data-f="lpw"]').classList.toggle('invalid', !pw);
      if (!validEmail(email) || !pw) return;
      const user = db.users.find(u => u.email === email.toLowerCase());
      if (!user || user.pw !== await hash(pw)) { st.className = 'form-status error'; st.textContent = 'Invalid email or password.'; return; }
      if (!user.is_active) { st.className = 'form-status error'; st.textContent = 'This account has been disabled.'; return; }
      db.session = user.id; persist();
      location.hash = '#/account';
    });

    $('#signupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#signupStatus');
      const name = $('#sName').value.trim(), email = $('#sEmail').value.trim();
      const pw = $('#sPw').value, cf = $('#sConfirm').value;
      let ok = true;
      const mark = (f, bad) => { $(`[data-f="${f}"]`).classList.toggle('invalid', bad); if (bad) ok = false; };
      mark('sname', name.length < 2); mark('semail', !validEmail(email));
      mark('spw', !validPw(pw)); mark('sconfirm', pw !== cf);
      if (!ok) return;
      if (db.users.some(u => u.email === email.toLowerCase())) {
        st.className = 'form-status error'; st.textContent = 'An account with that email already exists.'; return;
      }
      const user = { id: nextId(), full_name: name, email: email.toLowerCase(), pw: await hash(pw), is_admin: 0, is_active: 1, created_at: new Date().toISOString() };
      db.users.push(user); db.session = user.id;
      if (!persist()) { st.className = 'form-status error'; st.textContent = 'Your browser is blocking storage, so the account cannot be saved.'; return; }
      location.hash = '#/account';
    });

    if (location.hash.includes('signup')) showTab('signup');
  }

  function viewAccount() {
    const u = currentUser();
    if (!u) { location.hash = '#/login'; return ''; }
    const orders = db.orders.filter(o => o.user_id === u.id);
    return storeShell(`<section class="page-head"><div class="wrap account-grid">
      <div>
        <div class="profile-row"><div class="profile-avatar">${esc(u.full_name[0])}</div>
          <div><div class="profile-name">${esc(u.full_name)}</div><div class="muted small">${esc(u.email)}</div></div></div>
        <nav class="account-nav">
          <a href="#/shop">Continue Shopping</a><a href="#/cart">View Cart</a>
          <button id="logoutBtn">Log Out</button></nav>
      </div>
      <div>
        <div class="glass pad30 mb26">
          <div class="eyebrow mb14">Profile</div>
          <div class="fact"><dt>Full Name</dt><dd>${esc(u.full_name)}</dd></div>
          <div class="fact"><dt>Email</dt><dd>${esc(u.email)}</dd></div>
          <div class="fact"><dt>Member Since</dt><dd>${fmtDate(u.created_at, { year: 'numeric', month: 'long', day: 'numeric' })}</dd></div>
        </div>
        <div class="glass pad30">
          <div class="eyebrow mb14">Order History</div>
          ${orders.length ? orders.map(o => `<div class="order-row">
            <div><div>${esc(o.order_number)}</div><div class="muted small">${fmtDate(o.created_at)} · ${o.items.length} item${o.items.length === 1 ? '' : 's'}</div></div>
            <div class="row-gap"><span>${money(o.total_cents)}</span><span class="status-pill ${esc(o.status)}">${esc(o.status)}</span></div>
          </div>`).join('') : '<p class="muted small">No orders yet.</p>'}
        </div>
      </div></div></section>`);
  }

  function bindAccount() {
    const b = $('#logoutBtn');
    if (b) b.addEventListener('click', () => { db.session = null; persist(); location.hash = '#/'; });
  }

  // ---------------------------------------------------------------
  // Admin views
  // ---------------------------------------------------------------
  function viewAdminLogin() {
    return `<div class="auth-wrap admin-login">
      <div class="center mb30"><a href="#/" class="brand justify-center">${MOON}<span>${esc(db.settings.logo_text)}</span></a>
        <div class="eyebrow mt10">Administrator Access</div></div>
      <div class="auth-card glass">
        <form id="adminLoginForm" novalidate>
          <div class="field"><label for="aEmail">Email Address</label><input id="aEmail" type="email" autocomplete="email"></div>
          <div class="field"><label for="aPw">Password</label>
            <div class="password-field"><input id="aPw" type="password" autocomplete="current-password"><button type="button" class="password-toggle" data-target="aPw">Show</button></div></div>
          <button class="btn btn-primary btn-full" id="aSubmit" type="submit">Sign In</button>
          <div class="form-status" id="aStatus"></div>
        </form>
      </div>
      <p class="center muted small mt20">Restricted to authorised administrators.</p>
      <p class="center muted small">Demo login: admin@maisonlunar.com / LunarAdmin!2026</p>
    </div>`;
  }

  function bindAdminLogin() {
    $$('.password-toggle').forEach(b => b.addEventListener('click', () => {
      const i = document.getElementById(b.dataset.target);
      const showing = i.type === 'text';
      i.type = showing ? 'password' : 'text';
      b.textContent = showing ? 'Show' : 'Hide';
    }));
    $('#adminLoginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#aStatus');
      const email = $('#aEmail').value.trim(), pw = $('#aPw').value;
      const user = db.users.find(u => u.email === email.toLowerCase() && u.is_admin);
      if (!user || user.pw !== await hash(pw)) { st.className = 'form-status error'; st.textContent = 'Invalid credentials.'; return; }
      if (!user.is_active) { st.className = 'form-status error'; st.textContent = 'This admin account is disabled.'; return; }
      db.adminSession = user.id; persist();
      location.hash = '#/admin/dashboard';
    });
  }

  function viewAdminDashboard() {
    const totalStock = db.products.reduce((s, p) => s + p.stock, 0);
    const low = db.products.filter(p => p.stock > 0 && p.stock <= lowStockLimit());
    const out = db.products.filter(p => p.stock === 0);
    const pending = db.orders.filter(o => o.status === 'pending');
    const revenue = db.orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total_cents, 0);
    const stat = (l, v) => `<div class="stat-card glass"><div class="label">${l}</div><div class="value">${v}</div></div>`;
    return adminShell('Dashboard', `
      <div class="stat-grid">
        ${stat('Total Perfumes', db.products.length)}${stat('Total Stock', totalStock)}
        ${stat('Low Stock', low.length)}${stat('Out of Stock', out.length)}
        ${stat('Total Orders', db.orders.length)}${stat('Pending Orders', pending.length)}
        ${stat('Customers', db.users.filter(u => !u.is_admin).length)}${stat('Revenue', money(revenue))}
      </div>
      <div class="admin-card glass"><h2>Recent Orders</h2><div class="table-wrap"><table class="admin-table">
        <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${db.orders.slice(0, 6).map(o => `<tr><td>${esc(o.order_number)}</td><td>${esc(o.customer_name)}</td>
          <td>${money(o.total_cents)}</td><td><span class="status-pill ${esc(o.status)}">${esc(o.status)}</span></td>
          <td>${fmtDate(o.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No orders yet.</td></tr>'}</tbody>
      </table></div></div>
      <div class="admin-card glass"><h2>Recently Added Perfumes</h2><div class="table-wrap"><table class="admin-table">
        <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th></tr></thead>
        <tbody>${db.products.slice(0, 5).map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.category)}</td>
          <td>${money(priceFrom(p))}</td><td>${p.stock}</td></tr>`).join('')}</tbody>
      </table></div></div>`, '#/admin/dashboard');
  }

  function viewAdminProducts() {
    return adminShell('Perfumes', `
      <div class="admin-card glass">
        <div class="toolbar">
          <input type="search" id="pSearch" placeholder="Search perfumes...">
          <button class="btn btn-primary btn-sm" id="newProductBtn">+ Add New Perfume</button>
        </div>
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Flags</th><th></th></tr></thead>
          <tbody id="pBody">${productRows(db.products)}</tbody>
        </table></div>
      </div>
      <div class="modal-overlay" id="pModal"><div class="modal-box">
        <h2 id="pModalTitle">Add New Perfume</h2>
        <form id="pForm">
          <input type="hidden" id="pId">
          <div class="field-row">
            <div class="field"><label for="pName">Product Name</label><input id="pName" type="text"></div>
            <div class="field"><label for="pBrand">Brand</label><input id="pBrand" type="text"></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="pCategory">Category</label><select id="pCategory">${db.categories.map(c => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join('')}</select></div>
            <div class="field"><label for="pStock">Stock Quantity</label><input id="pStock" type="number" min="0" value="0"></div>
          </div>
          <div class="field"><label for="pShort">Short Description</label><input id="pShort" type="text"></div>
          <div class="field"><label for="pDesc">Full Description</label><textarea id="pDesc"></textarea></div>
          <div class="field-row">
            <div class="field"><label for="pTop">Top Notes</label><input id="pTop" type="text"></div>
            <div class="field"><label for="pMid">Middle Notes</label><input id="pMid" type="text"></div>
          </div>
          <div class="field"><label for="pBase">Base Notes</label><input id="pBase" type="text"></div>
          <div class="field"><label>Product Image</label>
            <div class="image-preview hidden" id="pImgPrev"><img id="pImgTag" alt=""></div>
            <div class="image-drop" id="pImgDrop">Tap to upload a PNG, JPG or WEBP (max 800KB)</div>
            <input type="file" id="pImgInput" accept="image/png,image/jpeg,image/webp" class="hidden">
            <div class="form-status" id="pImgStatus"></div>
            <button type="button" class="btn-icon mt10" id="pImgClear">Remove Image</button>
          </div>
          <div class="field"><label>Sizes &amp; Prices</label><div class="size-manager" id="sizeMgr"></div>
            <button type="button" class="btn-icon" id="addSize">+ Add Size</button></div>
          <div class="toggle-row">
            <label><input type="checkbox" id="pFeat"> Featured</label>
            <label><input type="checkbox" id="pBest"> Best Seller</label>
            <label><input type="checkbox" id="pNew"> New Arrival</label>
            <label><input type="checkbox" id="pHidden"> Hide from shop</label>
          </div>
          <div class="form-status" id="pFormStatus"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" id="pCancel">Cancel</button>
            <button type="submit" class="btn btn-primary" id="pSave">Save Changes</button>
          </div>
        </form>
      </div></div>`, '#/admin/products');
  }

  function productRows(list) {
    if (!list.length) return '<tr><td colspan="7" class="muted">No perfumes yet.</td></tr>';
    return list.map(p => {
      const flags = [p.is_featured ? 'Featured' : '', p.is_bestseller ? 'Best Seller' : '',
        p.is_new_arrival ? 'New' : '', p.hidden ? 'Hidden' : ''].filter(Boolean).join(', ') || '—';
      return `<tr><td><div class="thumb">${p.image_url ? `<img src="${esc(p.image_url)}">` : ''}</div></td>
        <td>${esc(p.name)}</td><td class="cap">${esc(p.category)}</td><td>${money(priceFrom(p))}</td>
        <td>${p.stock}</td><td class="muted xsmall">${esc(flags)}</td>
        <td class="nowrap"><button class="btn-icon" data-edit="${p.id}">Edit</button>
        <button class="btn-icon" data-dup="${p.id}">Duplicate</button>
        <button class="btn-icon danger" data-del="${p.id}">Delete</button></td></tr>`;
    }).join('');
  }

  function bindAdminProducts() {
    let uploadedImage = '';
    const modal = $('#pModal');

    const renderSizes = (sizes) => {
      $('#sizeMgr').innerHTML = sizes.map(s => `<div class="size-row">
        <input type="text" class="size-label" placeholder="e.g. 50ml" value="${esc(s.label || '')}">
        <input type="number" class="size-price" step="0.01" placeholder="Price (£)" value="${s.price_cents != null ? (s.price_cents / 100).toFixed(2) : ''}">
        <button type="button" class="remove-size">×</button></div>`).join('');
      $$('#sizeMgr .remove-size').forEach(b => b.addEventListener('click', () => b.closest('.size-row').remove()));
    };
    const collectSizes = () => $$('#sizeMgr .size-row').map(r => ({
      label: $('.size-label', r).value.trim(),
      price_cents: Math.round(parseFloat($('.size-price', r).value || '0') * 100)
    })).filter(s => s.label && s.price_cents > 0);

    const openModal = (p) => {
      uploadedImage = p ? p.image_url : '';
      $('#pModalTitle').textContent = p ? 'Edit Perfume' : 'Add New Perfume';
      $('#pFormStatus').className = 'form-status'; $('#pFormStatus').textContent = '';
      $('#pImgStatus').className = 'form-status'; $('#pImgStatus').textContent = '';
      $('#pId').value = p ? p.id : '';
      $('#pName').value = p ? p.name : '';
      $('#pBrand').value = p ? (p.brand || '') : db.settings.logo_text || '';
      $('#pCategory').value = p ? p.category : (db.categories[0] || { key: 'unisex' }).key;
      $('#pStock').value = p ? p.stock : 0;
      $('#pShort').value = p ? p.short_description : '';
      $('#pDesc').value = p ? p.description : '';
      $('#pTop').value = p ? p.top_notes : '';
      $('#pMid').value = p ? p.middle_notes : '';
      $('#pBase').value = p ? p.base_notes : '';
      $('#pFeat').checked = !!(p && p.is_featured);
      $('#pBest').checked = !!(p && p.is_bestseller);
      $('#pNew').checked = !!(p && p.is_new_arrival);
      $('#pHidden').checked = !!(p && p.hidden);
      renderSizes(p && p.sizes.length ? p.sizes : [{ label: '', price_cents: null }]);
      $('#pImgPrev').classList.toggle('hidden', !uploadedImage);
      if (uploadedImage) $('#pImgTag').src = uploadedImage;
      modal.classList.add('open');
    };

    $('#newProductBtn').addEventListener('click', () => openModal(null));
    $('#pCancel').addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
    $('#addSize').addEventListener('click', () => {
      const d = document.createElement('div');
      d.className = 'size-row';
      d.innerHTML = `<input type="text" class="size-label" placeholder="e.g. 50ml"><input type="number" class="size-price" step="0.01" placeholder="Price (£)"><button type="button" class="remove-size">×</button>`;
      $('.remove-size', d).addEventListener('click', () => d.remove());
      $('#sizeMgr').appendChild(d);
    });

    $('#pImgDrop').addEventListener('click', () => $('#pImgInput').click());
    $('#pImgClear').addEventListener('click', () => { uploadedImage = ''; $('#pImgPrev').classList.add('hidden'); });
    $('#pImgInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const st = $('#pImgStatus');
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { st.className = 'form-status error'; st.textContent = 'Please choose a PNG, JPG or WEBP image.'; return; }
      if (file.size > 800 * 1024) { st.className = 'form-status error'; st.textContent = 'Image must be under 800KB (browser storage is limited).'; return; }
      const reader = new FileReader();
      reader.onerror = () => { st.className = 'form-status error'; st.textContent = 'Could not read that file.'; };
      reader.onload = () => {
        uploadedImage = reader.result;
        $('#pImgPrev').classList.remove('hidden');
        $('#pImgTag').src = uploadedImage;
        st.className = 'form-status success'; st.textContent = 'Image ready — remember to save.';
      };
      reader.readAsDataURL(file);
    });

    $('#pForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const st = $('#pFormStatus');
      const name = $('#pName').value.trim();
      const sizes = collectSizes();
      if (!name) { st.className = 'form-status error'; st.textContent = 'Product name is required.'; return; }
      if (!sizes.length) { st.className = 'form-status error'; st.textContent = 'Add at least one size with a price.'; return; }
      const data = {
        name, brand: $('#pBrand').value.trim(), category: $('#pCategory').value,
        short_description: $('#pShort').value.trim(), description: $('#pDesc').value.trim(),
        top_notes: $('#pTop').value.trim(), middle_notes: $('#pMid').value.trim(), base_notes: $('#pBase').value.trim(),
        stock: parseInt($('#pStock').value, 10) || 0, image_url: uploadedImage, sizes,
        is_featured: $('#pFeat').checked ? 1 : 0, is_bestseller: $('#pBest').checked ? 1 : 0,
        is_new_arrival: $('#pNew').checked ? 1 : 0, hidden: $('#pHidden').checked ? 1 : 0
      };
      const id = $('#pId').value;
      if (id) {
        const p = db.products.find(x => x.id === +id);
        Object.assign(p, data);
      } else {
        db.products.unshift({ id: nextId(), slug: slugify(name), created_at: new Date().toISOString(), ...data });
      }
      if (!persist()) { st.className = 'form-status error'; st.textContent = 'Could not save — browser storage is full or blocked. Try a smaller image.'; return; }
      modal.classList.remove('open');
      toast(id ? 'Perfume updated.' : 'Perfume added.');
      render();
    });

    const wire = () => {
      $$('[data-edit]').forEach(b => b.addEventListener('click', () => openModal(db.products.find(p => p.id === +b.dataset.edit))));
      $$('[data-dup]').forEach(b => b.addEventListener('click', () => {
        const src = db.products.find(p => p.id === +b.dataset.dup);
        const copy = JSON.parse(JSON.stringify(src));
        copy.id = nextId(); copy.name = src.name + ' (Copy)'; copy.slug = slugify(copy.name);
        copy.created_at = new Date().toISOString();
        db.products.unshift(copy); persist(); toast('Perfume duplicated.'); render();
      }));
      $$('[data-del]').forEach(b => b.addEventListener('click', () => {
        const p = db.products.find(x => x.id === +b.dataset.del);
        if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
        db.products = db.products.filter(x => x.id !== p.id);
        persist(); toast('Perfume deleted.'); render();
      }));
    };
    wire();

    // Arriving from a storefront "+" opens the right editor straight away.
    const params = new URLSearchParams((location.hash.split('?')[1] || ''));
    if (params.get('new')) openModal(null);
    else if (params.get('edit')) {
      const p = db.products.find(x => x.id === +params.get('edit'));
      if (p) openModal(p);
    }

    $('#pSearch').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      $('#pBody').innerHTML = productRows(db.products.filter(p => (p.name + ' ' + (p.brand || '')).toLowerCase().includes(q)));
      wire();
    });
  }

  function viewAdminStock() {
    const limit = lowStockLimit();
    return adminShell('Stock', `
      <div class="admin-card glass">
        <h2>Low-Stock Threshold</h2>
        <div class="inline-form">
          <input type="number" id="lowThreshold" min="1" value="${limit}">
          <button class="btn btn-primary btn-sm" id="saveThreshold">Save</button>
        </div>
        <p class="muted small mt10">Perfumes at or below this number are flagged as low stock.</p>
      </div>
      <div class="admin-card glass">
        <h2>All Stock</h2>
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Perfume</th><th>Status</th><th>Stock</th><th>Adjust</th><th>Set exact</th></tr></thead>
          <tbody>${db.products.map(p => {
            const state = p.stock === 0 ? '<span class="status-pill cancelled">Out of stock</span>'
              : p.stock <= limit ? '<span class="status-pill pending">Low stock</span>'
              : '<span class="status-pill completed">In stock</span>';
            return `<tr><td>${esc(p.name)}</td><td>${state}</td><td><strong>${p.stock}</strong></td>
              <td class="nowrap"><button class="btn-icon" data-stock="-1" data-id="${p.id}">−1</button>
              <button class="btn-icon" data-stock="1" data-id="${p.id}">+1</button>
              <button class="btn-icon" data-stock="10" data-id="${p.id}">+10</button></td>
              <td class="nowrap"><input type="number" min="0" class="stock-input" data-set="${p.id}" value="${p.stock}">
              <button class="btn-icon" data-setbtn="${p.id}">Set</button></td></tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`, '#/admin/stock');
  }

  function bindAdminStock() {
    $('#saveThreshold').addEventListener('click', () => {
      db.settings.low_stock_threshold = String(Math.max(1, parseInt($('#lowThreshold').value, 10) || 5));
      persist(); toast('Threshold saved.'); render();
    });
    $$('[data-stock]').forEach(b => b.addEventListener('click', () => {
      const p = db.products.find(x => x.id === +b.dataset.id);
      p.stock = Math.max(0, p.stock + (+b.dataset.stock));
      persist(); render();
    }));
    $$('[data-setbtn]').forEach(b => b.addEventListener('click', () => {
      const id = +b.dataset.setbtn;
      const input = $(`[data-set="${id}"]`);
      const p = db.products.find(x => x.id === id);
      p.stock = Math.max(0, parseInt(input.value, 10) || 0);
      persist(); toast('Stock updated.'); render();
    }));
  }

  function viewAdminOrders(params) {
    const q = (params.get('q') || '').toLowerCase();
    const status = params.get('s') || '';
    let list = db.orders;
    if (status) list = list.filter(o => o.status === status);
    if (q) list = list.filter(o => (o.order_number + o.customer_name + o.customer_email).toLowerCase().includes(q));
    const statuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    return adminShell('Orders', `
      <div class="admin-card glass">
        <div class="toolbar">
          <input type="search" id="oSearch" placeholder="Search order #, name or email..." value="${esc(params.get('q') || '')}">
          <select id="oStatus"><option value="">All Statuses</option>
            ${statuses.map(s => `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>${list.length ? list.map(o => `<tr>
            <td>${esc(o.order_number)}</td>
            <td>${esc(o.customer_name)}<br><span class="muted xsmall">${esc(o.customer_email)}</span></td>
            <td>${(o.items || []).map(i => esc(i.product_name) + ' ×' + i.qty).join('<br>')}</td>
            <td>${money(o.total_cents)}</td>
            <td>${o.payment ? esc(o.payment.brand) + ' ••••' + esc(o.payment.last4) : '<span class="muted">—</span>'}</td>
            <td><select class="status-select" data-order="${o.id}">
              ${statuses.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
            <td>${fmtDate(o.created_at)}</td></tr>`).join('') : '<tr><td colspan="7" class="muted">No orders found.</td></tr>'}
          </tbody></table></div>
      </div>`, '#/admin/orders');
  }

  function bindAdminOrders(params) {
    $$('.status-select').forEach(sel => sel.addEventListener('change', () => {
      const o = db.orders.find(x => x.id === +sel.dataset.order);
      o.status = sel.value; persist(); toast('Order status updated.');
    }));
    let t;
    $('#oSearch').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => {
        const s = params.get('s') || '';
        location.hash = '#/admin/orders?' + (s ? 's=' + s + '&' : '') + 'q=' + encodeURIComponent(e.target.value.trim());
      }, 400);
    });
    $('#oStatus').addEventListener('change', (e) => {
      const q = params.get('q') || '';
      location.hash = '#/admin/orders?' + (e.target.value ? 's=' + e.target.value + '&' : '') + (q ? 'q=' + encodeURIComponent(q) : '');
    });
  }

  function viewAdminCustomers(params) {
    const q = (params.get('q') || '').toLowerCase();
    let list = db.users.filter(u => !u.is_admin);
    if (q) list = list.filter(u => (u.full_name + u.email).toLowerCase().includes(q));
    return adminShell('Customers', `
      <div class="admin-card glass">
        <div class="toolbar"><input type="search" id="cSearch" placeholder="Search customers..." value="${esc(params.get('q') || '')}"></div>
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Orders</th><th>Status</th><th></th></tr></thead>
          <tbody>${list.length ? list.map(u => {
            const orders = db.orders.filter(o => o.user_id === u.id);
            const spent = orders.reduce((s, o) => s + o.total_cents, 0);
            return `<tr><td>${esc(u.full_name)}</td><td>${esc(u.email)}</td><td>${fmtDate(u.created_at)}</td>
              <td>${orders.length}${orders.length ? ` <span class="muted xsmall">(${money(spent)})</span>` : ''}</td>
              <td><span class="status-pill ${u.is_active ? 'completed' : 'cancelled'}">${u.is_active ? 'Active' : 'Disabled'}</span></td>
              <td><button class="btn-icon" data-toggle="${u.id}">${u.is_active ? 'Disable' : 'Enable'}</button></td></tr>`;
          }).join('') : '<tr><td colspan="6" class="muted">No customers yet.</td></tr>'}
          </tbody></table></div>
        <p class="muted small mt10">Passwords are stored hashed and are never shown here.</p>
      </div>`, '#/admin/customers');
  }

  function bindAdminCustomers(params) {
    $$('[data-toggle]').forEach(b => b.addEventListener('click', () => {
      const u = db.users.find(x => x.id === +b.dataset.toggle);
      u.is_active = u.is_active ? 0 : 1;
      if (!u.is_active && db.session === u.id) db.session = null;
      persist(); toast(u.is_active ? 'Account enabled.' : 'Account disabled.'); render();
    }));
    let t;
    $('#cSearch').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { location.hash = '#/admin/customers?q=' + encodeURIComponent(e.target.value.trim()); }, 400);
    });
  }

  function viewAdminCategories() {
    return adminShell('Categories', `
      <div class="admin-card glass">
        <h2>Add Category</h2>
        <div class="inline-form">
          <input type="text" id="newCatLabel" placeholder="Category name, e.g. Limited Edition">
          <button class="btn btn-primary btn-sm" id="addCat">Add</button>
        </div>
      </div>
      <div class="admin-card glass">
        <h2>Existing Categories</h2>
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Name</th><th>Perfumes</th><th>Order</th><th></th></tr></thead>
          <tbody>${db.categories.map((c, i) => `<tr>
            <td><input class="cat-label" data-cat="${c.id}" value="${esc(c.label)}"></td>
            <td>${db.products.filter(p => p.category === c.key).length}</td>
            <td class="nowrap">
              <button class="btn-icon" data-move="up" data-id="${c.id}" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button class="btn-icon" data-move="down" data-id="${c.id}" ${i === db.categories.length - 1 ? 'disabled' : ''}>↓</button></td>
            <td class="nowrap"><button class="btn-icon" data-saveCat="${c.id}">Save</button>
              <button class="btn-icon danger" data-delCat="${c.id}">Delete</button></td></tr>`).join('')}
          </tbody></table></div>
      </div>`, '#/admin/categories');
  }

  function bindAdminCategories() {
    $('#addCat').addEventListener('click', () => {
      const label = $('#newCatLabel').value.trim();
      if (!label) { toast('Enter a category name.', 'error'); return; }
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      if (db.categories.some(c => c.key === key)) { toast('That category already exists.', 'error'); return; }
      db.categories.push({ id: nextId(), key, label });
      persist(); toast('Category added.'); render();
    });
    $$('[data-saveCat]').forEach(b => b.addEventListener('click', () => {
      const c = db.categories.find(x => x.id === +b.dataset.savecat);
      const input = $(`.cat-label[data-cat="${c.id}"]`);
      c.label = input.value.trim() || c.label;
      persist(); toast('Category saved.'); render();
    }));
    $$('[data-delCat]').forEach(b => b.addEventListener('click', () => {
      const c = db.categories.find(x => x.id === +b.dataset.delcat);
      const used = db.products.filter(p => p.category === c.key).length;
      if (!confirm(`Delete "${c.label}"?` + (used ? ` ${used} perfume(s) use it and will keep the old label until reassigned.` : ''))) return;
      db.categories = db.categories.filter(x => x.id !== c.id);
      persist(); toast('Category deleted.'); render();
    }));
    $$('[data-move]').forEach(b => b.addEventListener('click', () => {
      const i = db.categories.findIndex(c => c.id === +b.dataset.id);
      const j = b.dataset.move === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= db.categories.length) return;
      const tmp = db.categories[i]; db.categories[i] = db.categories[j]; db.categories[j] = tmp;
      persist(); render();
    }));
  }

  function viewAdminContent() {
    const s = db.settings;
    const f = (id, label, val, type) => `<div class="field"><label for="${id}">${label}</label>${
      type === 'area' ? `<textarea id="${id}">${esc(val)}</textarea>` : `<input id="${id}" type="text" value="${esc(val)}">`}</div>`;
    return adminShell('Homepage & Content', `
      <form id="contentForm">
        <div class="admin-card glass"><h2>Homepage Hero</h2>
          ${f('set_hero_eyebrow', 'Eyebrow Label', s.hero_eyebrow)}
          ${f('set_hero_headline', 'Headline', s.hero_headline)}
          ${f('set_hero_description', 'Description', s.hero_description, 'area')}
          <div class="field-row">${f('set_hero_cta_text', 'Button Text', s.hero_cta_text)}${f('set_hero_cta_link', 'Button Link', s.hero_cta_link)}</div>
        </div>
        <div class="admin-card glass"><h2>About Section</h2>
          ${f('set_about_heading', 'Heading', s.about_heading)}
          ${f('set_about_body', 'Body Text', s.about_body, 'area')}
        </div>
        <div class="admin-card glass"><h2>Promotional Banner</h2>
          ${f('set_banner_text', 'Banner text (leave blank to hide)', s.banner_text)}
        </div>
        <div class="admin-card glass"><h2>Featured Perfumes</h2>
          <p class="muted small mb14">Ticked perfumes appear in the homepage "Featured" row.</p>
          <div class="toggle-row">${db.products.map(p => `<label><input type="checkbox" class="feat-check" data-id="${p.id}" ${p.is_featured ? 'checked' : ''}> ${esc(p.name)}</label>`).join('')}</div>
        </div>
        <div class="admin-card glass"><h2>Testimonials</h2>
          <div id="testiMgr">${(s.testimonials || []).map((t, i) => `<div class="testi-edit" data-i="${i}">
            <div class="field-row">
              <div class="field"><label>Name</label><input class="t-name" value="${esc(t.name)}"></div>
              <div class="field"><label>Role</label><input class="t-role" value="${esc(t.role)}"></div>
            </div>
            <div class="field"><label>Quote</label><input class="t-quote" value="${esc(t.quote)}"></div>
            <button type="button" class="btn-icon danger remove-testi">Remove</button></div>`).join('')}</div>
          <button type="button" class="btn-icon" id="addTesti">+ Add Testimonial</button>
        </div>
        <button class="btn btn-primary" id="saveContent" type="submit">Save Changes</button>
        <div class="form-status" id="contentStatus"></div>
      </form>`, '#/admin/content');
  }

  function bindAdminContent() {
    $('#addTesti').addEventListener('click', () => {
      db.settings.testimonials = db.settings.testimonials || [];
      db.settings.testimonials.push({ name: '', role: '', quote: '' });
      persist(); render();
    });
    $$('.remove-testi').forEach(b => b.addEventListener('click', () => {
      const i = +b.closest('.testi-edit').dataset.i;
      db.settings.testimonials.splice(i, 1);
      persist(); render();
    }));
    $('#contentForm').addEventListener('submit', (e) => {
      e.preventDefault();
      ['hero_eyebrow', 'hero_headline', 'hero_description', 'hero_cta_text', 'hero_cta_link',
       'about_heading', 'about_body', 'banner_text'].forEach(k => {
        const el = document.getElementById('set_' + k);
        if (el) db.settings[k] = el.value.trim();
      });
      $$('.feat-check').forEach(c => {
        const p = db.products.find(x => x.id === +c.dataset.id);
        if (p) p.is_featured = c.checked ? 1 : 0;
      });
      db.settings.testimonials = $$('.testi-edit').map(row => ({
        name: $('.t-name', row).value.trim(), role: $('.t-role', row).value.trim(), quote: $('.t-quote', row).value.trim()
      })).filter(t => t.name && t.quote);
      const st = $('#contentStatus');
      if (!persist()) { st.className = 'form-status error'; st.textContent = 'Could not save — browser storage is blocked or full.'; return; }
      st.className = 'form-status success';
      st.textContent = 'Saved. The homepage is updated immediately.';
      applyTheme();
      toast('Content saved.');
    });
  }

  function viewAdminAppearance() {
    const s = db.settings;
    return adminShell('Website Settings', `
      <form id="appearanceForm">
        <div class="admin-card glass"><h2>Branding</h2>
          <div class="field"><label for="set_site_title">Website Title (browser tab)</label><input id="set_site_title" value="${esc(s.site_title)}"></div>
          <div class="field"><label for="set_logo_text">Website / Store Name</label><input id="set_logo_text" value="${esc(s.logo_text)}"></div>
          <p class="muted small">Changing this updates the nav, footer and browser tab everywhere.</p>
          <div class="field mt14"><label for="set_favicon">Favicon (emoji)</label><input id="set_favicon" maxlength="2" value="${esc(s.favicon)}" class="narrow"></div>
        </div>
        <div class="admin-card glass"><h2>Colours</h2>
          <div class="field"><label>Main Brand Colour</label>
            <div class="color-row"><input type="color" id="pick_primary" value="${esc(s.color_primary)}"><input type="text" id="set_color_primary" value="${esc(s.color_primary)}"></div></div>
          <div class="field"><label>Secondary Green</label>
            <div class="color-row"><input type="color" id="pick_secondary" value="${esc(s.color_secondary)}"><input type="text" id="set_color_secondary" value="${esc(s.color_secondary)}"></div></div>
          <div class="field"><label>Background</label>
            <div class="color-row"><input type="color" id="pick_background" value="${esc(s.color_background)}"><input type="text" id="set_color_background" value="${esc(s.color_background)}"></div></div>
        </div>
        <div class="admin-card glass"><h2>Contact &amp; Social</h2>
          <div class="field-row">
            <div class="field"><label for="set_contact_email">Contact Email</label><input id="set_contact_email" value="${esc(s.contact_email)}"></div>
            <div class="field"><label for="set_contact_phone">Phone Number</label><input id="set_contact_phone" value="${esc(s.contact_phone)}"></div>
          </div>
          <div class="field"><label for="set_contact_address">Address / Availability</label><input id="set_contact_address" value="${esc(s.contact_address)}"></div>
          <div class="field-row">
            <div class="field"><label for="set_instagram">Instagram URL</label><input id="set_instagram" value="${esc(s.instagram)}"></div>
            <div class="field"><label for="set_pinterest">Pinterest URL</label><input id="set_pinterest" value="${esc(s.pinterest)}"></div>
          </div>
          <div class="field"><label for="set_footer_text">Footer Description</label><textarea id="set_footer_text">${esc(s.footer_text)}</textarea></div>
        </div>
        <button class="btn btn-primary" id="saveAppearance" type="submit">Save Changes</button>
        <div class="form-status" id="appearanceStatus"></div>
      </form>
      <div class="admin-card glass mt26"><h2>Danger Zone</h2>
        <p class="muted small mb14">Resets all perfumes, orders, customers and settings back to the samples.</p>
        <button class="btn btn-danger btn-sm" id="resetAll">Reset All Data</button>
      </div>`, '#/admin/appearance');
  }

  function bindAdminAppearance() {
    ['primary', 'secondary', 'background'].forEach(k => {
      const pick = $('#pick_' + k), text = $('#set_color_' + k);
      pick.addEventListener('input', () => { text.value = pick.value; });
      text.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(text.value)) pick.value = text.value; });
    });
    $('#appearanceForm').addEventListener('submit', (e) => {
      e.preventDefault();
      ['site_title', 'logo_text', 'favicon', 'color_primary', 'color_secondary', 'color_background',
       'contact_email', 'contact_phone', 'contact_address', 'instagram', 'pinterest', 'footer_text'].forEach(k => {
        const el = document.getElementById('set_' + k);
        if (el) db.settings[k] = el.value.trim();
      });
      const st = $('#appearanceStatus');
      if (!persist()) { st.className = 'form-status error'; st.textContent = 'Could not save — browser storage is blocked.'; return; }
      applyTheme();
      st.className = 'form-status success';
      st.textContent = 'Saved. The site name and colours are updated everywhere.';
      toast('Website settings saved.');
      render();
    });
    $('#resetAll').addEventListener('click', () => {
      if (!confirm('Reset ALL data back to the samples? This cannot be undone.')) return;
      db = SEED(); memory = null;
      try { localStorage.removeItem(KEY); } catch (e) {}
      persist(); ensurePasswords().then(() => { applyTheme(); toast('All data reset.'); location.hash = '#/admin/dashboard'; render(); });
    });
  }

  function viewAdminMessages() {
    return adminShell('Messages', `
      <div class="inbox-grid">
        <div class="admin-card glass inbox-list">
          ${db.messages.length ? db.messages.map(m => `<div class="msg-item ${m.is_read ? '' : 'unread'}" data-msg="${m.id}">
            <div class="top-row"><span>${esc(m.name)}</span><span>${fmtDate(m.created_at)}</span></div>
            <div class="subject">${esc(m.subject)}</div></div>`).join('') : '<p class="muted">No messages yet.</p>'}
        </div>
        <div class="admin-card glass" id="msgDetail"><p class="muted">Select a message to read it.</p></div>
      </div>`, '#/admin/messages');
  }

  function bindAdminMessages() {
    const show = (m) => {
      $('#msgDetail').innerHTML = `
        <div class="msg-head">
          <div><h2>${esc(m.subject)}</h2>
            <p class="muted small">${esc(m.name)} · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a></p>
            <p class="muted xsmall">${fmtDate(m.created_at, { year: 'numeric', month: 'long', day: 'numeric' })}</p></div>
          <div class="row-gap"><button class="btn-icon" id="toggleRead">${m.is_read ? 'Mark Unread' : 'Mark Read'}</button>
            <button class="btn-icon danger" id="delMsg">Delete</button></div>
        </div>
        <p class="msg-body">${esc(m.message)}</p>`;
      $('#toggleRead').addEventListener('click', () => { m.is_read = m.is_read ? 0 : 1; persist(); render(); });
      $('#delMsg').addEventListener('click', () => {
        if (!confirm('Delete this message?')) return;
        db.messages = db.messages.filter(x => x.id !== m.id);
        persist(); toast('Message deleted.'); render();
      });
    };
    $$('[data-msg]').forEach(el => el.addEventListener('click', () => {
      const m = db.messages.find(x => x.id === +el.dataset.msg);
      if (!m.is_read) { m.is_read = 1; persist(); }
      el.classList.remove('unread');
      show(m);
    }));
  }

  // ---------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------
  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, query] = raw.split('?');
    return { path: path.replace(/\/$/, '') || '/', params: new URLSearchParams(query || '') };
  }

  function render() {
    // Re-read from storage on every render. Without this, a storefront tab
    // opened next to the admin panel keeps its own stale copy and admin edits
    // appear not to save — which is exactly what it looks like to the user.
    db = loadDb();
    const { path, params } = parseHash();
    const root = $('#app');
    applyTheme();

    // ---- admin routes: gated on every render, not just at login ----
    if (path.startsWith('/admin')) {
      if (!currentAdmin()) {
        root.innerHTML = viewAdminLogin();
        bindAdminLogin();
        window.scrollTo(0, 0);
        return;
      }
      const map = {
        '/admin': () => { location.hash = '#/admin/dashboard'; return null; },
        '/admin/dashboard': [viewAdminDashboard, null],
        '/admin/products': [viewAdminProducts, bindAdminProducts],
        '/admin/stock': [viewAdminStock, bindAdminStock],
        '/admin/orders': [viewAdminOrders, bindAdminOrders],
        '/admin/customers': [viewAdminCustomers, bindAdminCustomers],
        '/admin/categories': [viewAdminCategories, bindAdminCategories],
        '/admin/content': [viewAdminContent, bindAdminContent],
        '/admin/appearance': [viewAdminAppearance, bindAdminAppearance],
        '/admin/messages': [viewAdminMessages, bindAdminMessages]
      };
      const entry = map[path];
      if (!entry) { location.hash = '#/admin/dashboard'; return; }
      if (typeof entry === 'function') { entry(); return; }
      root.innerHTML = entry[0](params);
      const logout = $('#adminLogout');
      if (logout) logout.addEventListener('click', () => { db.adminSession = null; persist(); location.hash = '#/admin'; });
      if (entry[1]) entry[1](params);
      window.scrollTo(0, 0);
      return;
    }

    // ---- storefront routes ----
    if (path.startsWith('/order/')) {
      root.innerHTML = viewOrderConfirm(path.slice('/order/'.length));
      bindStoreChrome(); window.scrollTo(0, 0);
      return;
    }

    if (path.startsWith('/product/')) {
      const slug = path.slice('/product/'.length);
      root.innerHTML = viewProduct(slug);
      bindStoreChrome(); bindProduct(slug);
      window.scrollTo(0, 0);
      return;
    }

    switch (path) {
      case '/': case '/about': case '/contact':
        root.innerHTML = viewHome(); bindStoreChrome(); bindHome();
        if (path !== '/') { const el = document.getElementById(path.slice(1)); if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 60); }
        else window.scrollTo(0, 0);
        break;
      case '/shop':
        root.innerHTML = viewShop(params); bindStoreChrome(); bindShop(params); window.scrollTo(0, 0); break;
      case '/cart':
        root.innerHTML = viewCart(); bindStoreChrome(); bindCart(); window.scrollTo(0, 0); break;
      case '/login':
        if (currentUser()) { location.hash = '#/account'; return; }
        root.innerHTML = viewLogin(); bindStoreChrome(); bindLogin(); window.scrollTo(0, 0); break;
      case '/account': {
        const html = viewAccount();
        if (!html) return;
        root.innerHTML = html; bindStoreChrome(); bindAccount(); window.scrollTo(0, 0); break;
      }
      default:
        location.hash = '#/';
    }
  }

  // ---- inline editor modal ----------------------------------------
  const FIELD_LABELS = {
    hero_eyebrow: 'Eyebrow Label', hero_headline: 'Hero Headline', hero_description: 'Hero Description',
    hero_cta_text: 'Hero Button Text', about_heading: 'About Heading', about_body: 'About Text',
    contact_email: 'Contact Email', contact_phone: 'Phone Number', contact_address: 'Address',
    footer_text: 'Footer Text', banner_text: 'Promo Banner', logo_text: 'Website Name'
  };

  function openEditor(field, multiline) {
    const label = FIELD_LABELS[field] || field;
    const val = db.settings[field] || '';
    showModal(`<h2>Edit ${esc(label)}</h2>
      <div class="field"><label for="edVal">${esc(label)}</label>
        ${multiline ? `<textarea id="edVal">${esc(val)}</textarea>` : `<input id="edVal" type="text" value="${esc(val)}">`}</div>
      ${field === 'banner_text' ? '<p class="muted small">Leave empty to hide the banner.</p>' : ''}
      <div class="form-status" id="edStatus"></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-primary" id="edSave">Save</button></div>`, () => {
      $('#edSave').addEventListener('click', () => {
        db.settings[field] = $('#edVal').value.trim();
        if (!persist()) { const st = $('#edStatus'); st.className = 'form-status error'; st.textContent = 'Could not save — browser storage is blocked.'; return; }
        closeModal(); applyTheme(); toast('Saved.'); render();
      });
      setTimeout(() => { const el = $('#edVal'); if (el) el.focus(); }, 30);
    });
  }

  function openTestimonialEditor(index) {
    const isNew = index === 'new';
    const t = isNew ? { name: '', role: '', quote: '' } : (db.settings.testimonials[index] || { name: '', role: '', quote: '' });
    showModal(`<h2>${isNew ? 'Add' : 'Edit'} Testimonial</h2>
      <div class="field"><label for="tName">Customer Name</label><input id="tName" type="text" value="${esc(t.name)}"></div>
      <div class="field"><label for="tRole">Role / Location</label><input id="tRole" type="text" value="${esc(t.role)}"></div>
      <div class="field"><label for="tQuote">Quote</label><textarea id="tQuote">${esc(t.quote)}</textarea></div>
      <div class="form-status" id="tStatus"></div>
      <div class="modal-actions">
        ${isNew ? '' : '<button class="btn btn-danger" id="tDelete">Delete</button>'}
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-primary" id="tSave">Save</button></div>`, () => {
      $('#tSave').addEventListener('click', () => {
        const val = { name: $('#tName').value.trim(), role: $('#tRole').value.trim(), quote: $('#tQuote').value.trim() };
        if (!val.name || !val.quote) { const st = $('#tStatus'); st.className = 'form-status error'; st.textContent = 'Name and quote are required.'; return; }
        db.settings.testimonials = db.settings.testimonials || [];
        if (isNew) db.settings.testimonials.push(val); else db.settings.testimonials[index] = val;
        persist(); closeModal(); toast('Testimonial saved.'); render();
      });
      const del = $('#tDelete');
      if (del) del.addEventListener('click', () => {
        if (!confirm('Delete this testimonial?')) return;
        db.settings.testimonials.splice(index, 1);
        persist(); closeModal(); toast('Testimonial deleted.'); render();
      });
    });
  }

  function showModal(inner, bind) {
    closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'modal-overlay open';
    wrap.id = 'inlineModal';
    wrap.innerHTML = `<div class="modal-box">${inner}</div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(); });
    $$('[data-close]', wrap).forEach(b => b.addEventListener('click', closeModal));
    if (bind) bind();
  }
  function closeModal() {
    const m = $('#inlineModal');
    if (m) m.remove();
  }

  function bindAdminInline() {
    $$('[data-ed]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      openEditor(b.dataset.ed, b.dataset.ml === '1');
    }));
    $$('[data-ed-testi]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const v = b.dataset.edTesti;
      openTestimonialEditor(v === 'new' ? 'new' : +v);
    }));
    $$('[data-ed-product]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      location.hash = '#/admin/products?edit=' + b.dataset.edProduct;
    }));
    $$('[data-add-product]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault(); location.hash = '#/admin/products?new=1';
    }));
    const exit = $('#exitAdmin');
    if (exit) exit.addEventListener('click', () => { db.adminSession = null; persist(); toast('Signed out of admin.'); render(); });
  }

  function bindStoreChrome() {
    bindAdminInline();
    const toggle = $('#navToggle'), links = $('#navLinks');
    if (toggle && links) {
      toggle.addEventListener('click', () => links.classList.toggle('open'));
      $$('a', links).forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
    }
    $$('[data-add]').forEach(b => b.addEventListener('click', () => {
      const p = db.products.find(x => x.id === +b.dataset.add);
      if (!p) return;
      addToCart(p.id, p.sizes[0].label, 1);
      const orig = b.textContent;
      b.textContent = 'Added ✓';
      updateCartBadge();
      setTimeout(() => { b.textContent = orig; }, 1400);
    }));
  }

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  function banner() {
    const bar = document.createElement('div');
    bar.className = 'demo-bar' + (storageOK ? '' : ' warn');
    bar.innerHTML = storageOK
      ? 'Demo build — everything saves in this browser only, and no emails are sent.'
      : 'Your browser is blocking site storage (usually Safari Private Browsing). You can browse, but accounts and changes won\'t be saved. Open in a normal tab to use logins.';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('storage', (e) => { if (e.key === KEY) { db = loadDb(); render(); } });
  window.addEventListener('pageshow', () => { db = loadDb(); render(); });
  document.addEventListener('DOMContentLoaded', async () => {
    await ensurePasswords();
    banner();
    if (!location.hash) location.hash = '#/';
    render();
  });
})();
