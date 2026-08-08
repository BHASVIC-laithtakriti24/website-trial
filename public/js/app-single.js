/* Maison Lunar — single-file app.
   Hash routing (#/shop, #/admin/products …) so the whole site lives in one
   index.html. No folders, no external files, nothing that can 404. */
(function () {
  'use strict';

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const money = (c) => '\u00A3' + ((c || 0) / 100).toFixed(2);

  function parseDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    let s = String(v).trim().replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) s += 'Z';
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const fdate = (v, o) => { const d = parseDate(v); return d ? d.toLocaleDateString('en-GB', o) : '\u2014'; };
  const fdatetime = (v) => { const d = parseDate(v); return d ? d.toLocaleString('en-GB') : '\u2014'; };

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) { const err = new Error(data.error || 'Something went wrong.'); err.status = res.status; throw err; }
    return data;
  }

  const bottle = () => `<svg class="ph-bottle" viewBox="0 0 160 220" xmlns="http://www.w3.org/2000/svg">
    <rect x="55" y="20" width="50" height="18" rx="3" fill="none" stroke-width="1.2"/>
    <rect x="63" y="10" width="34" height="12" rx="2"/>
    <path d="M55 38 L50 60 L50 195 Q50 205 60 205 L100 205 Q110 205 110 195 L110 60 L105 38 Z" fill="rgba(203,184,139,0.06)" stroke-width="1.2"/>
    <line x1="50" y1="90" x2="110" y2="90" stroke-width="0.6" opacity="0.5"/></svg>`;

  const moonMark = `<svg class="moon-mark" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" stroke="#CBB88B" stroke-width="1.3" stroke-linejoin="round"/></svg>`;

  let SETTINGS = {};

  // ---------- chrome ----------
  function storefrontHeader(active) {
    const name = SETTINGS.logo_text || 'MAISON LUNAR';
    return `<header><nav class="nav">
      <a href="#/" class="brand">${moonMark} ${esc(name)}</a>
      <ul class="nav-links" id="navLinks">
        <li><a href="#/shop" class="${active === 'shop' ? 'on' : ''}">Shop</a></li>
        <li><a href="#/about">About</a></li>
        <li><a href="#/contact">Contact</a></li>
        <li id="navAuthSlot"><a href="#/login">Login / Sign Up</a></li>
        <li><a class="nav-cta nav-cart" href="#/cart">Cart <span class="cart-count" style="display:none">0</span></a></li>
      </ul>
      <button class="nav-toggle" id="navToggle" aria-label="Toggle menu"><span></span><span></span><span></span></button>
    </nav></header>`;
  }

  function footer() {
    const name = SETTINGS.logo_text || 'MAISON LUNAR';
    const email = SETTINGS.contact_email || 'hello@maisonlunar.com';
    return `<footer><div class="wrap">
      <div class="footer-grid">
        <div class="footer-brand">
          <div class="brand">${moonMark} ${esc(name)}</div>
          <p>${esc(SETTINGS.footer_text || '')}</p>
        </div>
        <div class="footer-col"><h4>Navigate</h4><ul>
          <li><a href="#/shop">Shop</a></li><li><a href="#/about">About</a></li>
          <li><a href="#/contact">Contact</a></li><li><a href="#/account">My Account</a></li></ul></div>
        <div class="footer-col"><h4>Contact</h4><ul>
          <li><a href="mailto:${esc(email)}">${esc(email)}</a></li>
          <li><span>${esc(SETTINGS.contact_address || '')}</span></li></ul></div>
        <div class="footer-col"><h4>Follow</h4><ul><li><a href="#/">Instagram</a></li><li><a href="#/">Pinterest</a></li></ul></div>
      </div>
      <div class="footer-bottom"><span>&copy; 2026 ${esc(name)}. All rights reserved.</span><a href="#/">Back to top &uarr;</a></div>
    </div></footer>`;
  }

  function wireNav() {
    const t = $('#navToggle'), l = $('#navLinks');
    if (t && l) {
      t.addEventListener('click', () => l.classList.toggle('open'));
      $$('a', l).forEach(a => a.addEventListener('click', () => l.classList.remove('open')));
    }
    refreshCartCount();
    refreshAuthSlot();
  }

  async function refreshCartCount() {
    try {
      const c = await api('/api/cart');
      const n = c.items.reduce((s, i) => s + i.qty, 0);
      $$('.cart-count').forEach(e => { e.textContent = n; e.style.display = n > 0 ? 'flex' : 'none'; });
    } catch (e) {}
  }
  async function refreshAuthSlot() {
    const slot = $('#navAuthSlot');
    if (!slot) return;
    try {
      const { user } = await api('/api/auth/me');
      slot.innerHTML = user ? `<a href="#/account">My Account</a>` : `<a href="#/login">Login / Sign Up</a>`;
    } catch (e) {}
  }

  function productCard(p) {
    const badges = [p.is_bestseller ? '<span class="badge">Best Seller</span>' : '',
      p.is_new_arrival ? '<span class="badge">New</span>' : ''].join('');
    const img = p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}">` : bottle();
    const oos = p.stock < 1;
    return `<div class="product-card glass">
      <div class="product-card-image">${img}<div class="badge-row">${badges}</div></div>
      <div class="product-card-body">
        <div class="cat">${esc(p.category)}</div>
        <h3>${esc(p.name)}</h3>
        <p class="desc">${esc(p.short_description)}</p>
        <div class="price">From ${money(p.price_from_cents)}</div>
        <div class="product-card-actions">
          <a class="btn btn-ghost" href="#/product/${esc(p.slug)}">View Details</a>
          <button class="btn btn-primary" data-add="${p.id}" data-size="${esc((p.sizes[0] || {}).label || '')}" ${oos ? 'disabled' : ''}>${oos ? 'Out of Stock' : 'Add to Cart'}</button>
        </div>
      </div></div>`;
  }

  function wireAddButtons(root) {
    $$('[data-add]', root).forEach(btn => btn.addEventListener('click', async () => {
      const orig = btn.textContent; btn.disabled = true;
      try {
        await api('/api/cart/items', { method: 'POST', body: { product_id: +btn.dataset.add, size_label: btn.dataset.size, qty: 1 } });
        btn.textContent = 'Added \u2713'; refreshCartCount();
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1400);
      } catch (e) { alert(e.message); btn.disabled = false; }
    }));
  }

  // ---------- views: storefront ----------
  async function viewHome() {
    const s = SETTINGS;
    let testis = [];
    try { testis = Array.isArray(s.testimonials) ? s.testimonials : JSON.parse(s.testimonials || '[]'); } catch (e) {}
    const app = $('#app');
    app.innerHTML = storefrontHeader('home') + `<main>
      <section class="hero">
        <div class="glow-field"><div class="glow g1"></div><div class="glow g2"></div><div class="glow g3"></div></div>
        <div class="wrap">
          <div>
            <div class="eyebrow">${esc(s.hero_eyebrow || '')}</div>
            <h1>${esc(s.hero_headline || '')}</h1>
            <p class="lede">${esc(s.hero_description || '')}</p>
            <div class="hero-ctas">
              <a href="#/shop" class="btn btn-primary">Shop the Collection</a>
              <a href="#/contact" class="btn btn-ghost">Book a Consultation</a>
            </div>
          </div>
          <div class="moon-stage">
            <div class="moon-ring r1"></div><div class="moon-ring r2"></div><div class="moon-orb"></div>
            <svg class="bottle" viewBox="0 0 160 220" aria-hidden="true">
              <rect x="55" y="20" width="50" height="18" rx="3" fill="none" stroke="#CBB88B" stroke-width="1.2"/>
              <rect x="63" y="10" width="34" height="12" rx="2" fill="#CBB88B"/>
              <path d="M55 38 L50 60 L50 195 Q50 205 60 205 L100 205 Q110 205 110 195 L110 60 L105 38 Z" fill="rgba(203,184,139,0.06)" stroke="#CBB88B" stroke-width="1.2"/>
              <line x1="50" y1="90" x2="110" y2="90" stroke="#CBB88B" stroke-width="0.6" opacity="0.5"/>
            </svg>
          </div>
        </div>
      </section>

      <section><div class="wrap">
        <div class="section-head"><div class="eyebrow">Featured</div><h2>This Season's Favourites</h2></div>
        <div class="product-grid" id="featured"><p style="color:var(--sage)">Loading…</p></div>
      </div></section>

      <section id="about" class="about"><div class="wrap"><div class="about-grid">
        <div class="about-text">
          <div class="eyebrow">Who We Are</div>
          <h2>${esc(s.about_heading || '')}</h2>
          <blockquote>"We wanted a green that only reveals itself at night — the way a garden changes once the sun goes down."</blockquote>
          <p>${esc(s.about_body || '')}</p>
        </div>
        <div class="facts-card glass">
          <div class="fact"><dt>Founded</dt><dd>2019, from a single courtyard formula</dd></div>
          <div class="fact"><dt>Based</dt><dd>England, atelier open by appointment</dd></div>
          <div class="fact"><dt>Philosophy</dt><dd>Small batches, natural ingredients, no rush</dd></div>
          <div class="fact"><dt>Made For</dt><dd>Evenings, quiet rooms, people who read labels</dd></div>
        </div>
      </div></div></section>

      <section><div class="wrap">
        <div class="section-head"><div class="eyebrow">What We Offer</div><h2>Services &amp; Collections</h2></div>
        <div class="services-grid">
          <div class="service-card glass"><h3>Bespoke Consultation</h3><p>A one-to-one session to build a scent around your history and skin.</p></div>
          <div class="service-card glass"><h3>Home Fragrance</h3><p>Candles, room mists and diffusers from the same accords.</p></div>
          <div class="service-card glass"><h3>Gifting &amp; Curation</h3><p>Presentation sets for weddings, milestones and corporate gifting.</p></div>
          <div class="service-card glass"><h3>Refill Subscription</h3><p>Your formula, restocked automatically in refillable glass.</p></div>
        </div>
      </div></section>

      <section class="why"><div class="wrap">
        <div class="section-head"><div class="eyebrow">Why Maison Lunar</div><h2>Made Slowly, On Purpose</h2></div>
        <div class="why-grid">
          <div class="why-item"><h3>Small-Batch Crafted</h3><p>Runs of under 200 bottles, mixed and rested by hand.</p></div>
          <div class="why-item"><h3>Naturally Sourced</h3><p>Quality-first ingredients, synthetic-free wherever possible.</p></div>
          <div class="why-item"><h3>Personalised Service</h3><p>Real conversations before every bespoke order.</p></div>
          <div class="why-item"><h3>Carbon-Neutral Shipping</h3><p>Every order offset, packed in recyclable materials.</p></div>
        </div>
      </div></section>

      <section><div class="wrap">
        <div class="section-head"><div class="eyebrow">Showcase</div><h2>From the Atelier</h2></div>
        <div class="gallery-grid">
          <div class="gallery-tile gt-1"><span>The Atelier, Late Evening</span></div>
          <div class="gallery-tile gt-2"><span>Wild Vetiver Root</span></div>
          <div class="gallery-tile gt-3"><span>Hand-Poured Batches</span></div>
          <div class="gallery-tile gt-4"><span>Night Bloom Jasmine</span></div>
          <div class="gallery-tile gt-5"><span>Numbered Bottling</span></div>
          <div class="gallery-tile gt-6"><span>Packed for Gifting</span></div>
        </div>
      </div></section>

      <section class="testimonials"><div class="wrap">
        <div class="section-head"><div class="eyebrow">Testimonials</div><h2>Worn &amp; Well-Loved</h2></div>
        <div class="testi-grid">${testis.map(t => `<div class="testi-card glass">
          <div class="testi-stars">\u2605\u2605\u2605\u2605\u2605</div>
          <p class="quote">"${esc(t.quote)}"</p>
          <div class="testi-person"><div class="testi-avatar">${esc((t.name || '?')[0])}</div>
            <div><div class="testi-name">${esc(t.name)}</div><div class="testi-role">${esc(t.role || '')}</div></div></div>
        </div>`).join('')}</div>
      </div></section>

      <section id="contact"><div class="wrap">
        <div class="section-head"><div class="eyebrow">Get In Touch</div><h2>Send Us a Message</h2>
          <p>Questions, bespoke inquiries or press — we read every message ourselves.</p></div>
        <div class="contact-grid">
          <form id="contactForm" novalidate>
            <div class="hp-field" aria-hidden="true"><label for="company">Company</label><input type="text" id="company" tabindex="-1" autocomplete="off"></div>
            <div class="field-row">
              <div class="field" data-f="name"><label for="cName">Name</label><input type="text" id="cName"><div class="field-error">Please enter your name.</div></div>
              <div class="field" data-f="email"><label for="cEmail">Email</label><input type="email" id="cEmail"><div class="field-error">Please enter a valid email address.</div></div>
            </div>
            <div class="field" data-f="subject"><label for="cSubject">Subject</label><input type="text" id="cSubject"><div class="field-error">Please enter a subject.</div></div>
            <div class="field" data-f="message"><label for="cMessage">Message</label><textarea id="cMessage"></textarea><div class="field-error">Please enter a message.</div></div>
            <button type="submit" class="btn btn-primary" id="cSubmit">Send Message</button>
            <div class="form-status" id="cStatus" role="status" aria-live="polite"></div>
          </form>
          <dl class="contact-side">
            <dt>Email</dt><dd><a href="mailto:${esc(s.contact_email || '')}">${esc(s.contact_email || '')}</a></dd>
            <dt>Atelier</dt><dd>${esc(s.contact_address || '')}</dd>
            <dt>Follow</dt><dd><div class="socials"><a href="#/">Instagram</a><a href="#/">Pinterest</a></div></dd>
          </dl>
        </div>
      </div></section>
    </main>` + footer();

    wireNav();

    try {
      const { products } = await api('/api/products?featured=1');
      const f = $('#featured');
      f.innerHTML = products.length ? products.slice(0, 4).map(productCard).join('') : '<p style="color:var(--sage)">No featured perfumes yet.</p>';
      wireAddButtons(f);
    } catch (e) {}

    const form = $('#contactForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#cStatus'); st.className = 'form-status';
      const v = { name: $('#cName').value.trim(), email: $('#cEmail').value.trim(), subject: $('#cSubject').value.trim(), message: $('#cMessage').value.trim() };
      let ok = true;
      const mark = (k, bad) => { $(`[data-f="${k}"]`).classList.toggle('invalid', bad); if (bad) ok = false; };
      mark('name', !v.name);
      mark('email', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email));
      mark('subject', !v.subject);
      mark('message', !v.message);
      if (!ok) { st.className = 'form-status error'; st.textContent = 'Please fix the highlighted fields.'; return; }
      const btn = $('#cSubmit'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        await api('/api/contact', { method: 'POST', body: { ...v, company: $('#company').value } });
        st.className = 'form-status success';
        st.textContent = 'Thank you — your message has been received. (Demo: no email is actually sent.)';
        form.reset();
      } catch (err) { st.className = 'form-status error'; st.textContent = err.message; }
      finally { btn.disabled = false; btn.textContent = 'Send Message'; }
    });
  }

  async function viewShop() {
    $('#app').innerHTML = storefrontHeader('shop') + `<main>
      <section class="shop-hero"><div class="wrap-narrow">
        <span class="eyebrow">The Collection</span>
        <h1>Every Bottle We Make</h1>
        <div class="search-row"><input type="search" id="searchInput" placeholder="Search perfumes…"></div>
      </div></section>
      <section style="padding-top:20px"><div class="wrap">
        <div class="filter-bar" id="filterBar">
          <button class="filter-chip active" data-filter="all">All</button>
          <button class="filter-chip" data-filter="mens">Men's</button>
          <button class="filter-chip" data-filter="womens">Women's</button>
          <button class="filter-chip" data-filter="unisex">Unisex</button>
          <button class="filter-chip" data-filter="bestseller">Best Sellers</button>
          <button class="filter-chip" data-filter="new">New Arrivals</button>
        </div>
        <div class="product-grid" id="grid"><p style="color:var(--sage)">Loading…</p></div>
      </div></section></main>` + footer();
    wireNav();

    let filter = 'all', search = '';
    async function load() {
      const q = new URLSearchParams();
      if (search) q.set('search', search);
      if (['mens', 'womens', 'unisex'].includes(filter)) q.set('category', filter);
      if (filter === 'bestseller') q.set('bestseller', '1');
      if (filter === 'new') q.set('new', '1');
      const { products } = await api('/api/products?' + q);
      const g = $('#grid');
      g.innerHTML = products.length ? products.map(productCard).join('')
        : '<p style="color:var(--sage);grid-column:1/-1;text-align:center;padding:50px 0">No perfumes match this filter.</p>';
      wireAddButtons(g);
    }
    $('#filterBar').addEventListener('click', (e) => {
      const c = e.target.closest('.filter-chip'); if (!c) return;
      $$('.filter-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active'); filter = c.dataset.filter; load();
    });
    let t;
    $('#searchInput').addEventListener('input', (e) => {
      clearTimeout(t); t = setTimeout(() => { search = e.target.value.trim(); load(); }, 300);
    });
    load();
  }

  async function viewProduct(slug) {
    $('#app').innerHTML = storefrontHeader('shop') + `<main><section class="pd-hero"><div class="wrap">
      <div class="pd-grid" id="pd"><p style="color:var(--sage)">Loading…</p></div>
      <div id="relatedWrap"></div>
    </div></section></main>` + footer();
    wireNav();

    let data;
    try { data = await api('/api/products/' + encodeURIComponent(slug)); }
    catch (e) { $('#pd').innerHTML = `<p style="color:var(--sage)">${esc(e.message)}</p>`; return; }

    const p = data.product;
    let size = p.sizes[0], qty = 1;
    const img = p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}">` : bottle();

    $('#pd').innerHTML = `
      <div class="pd-image">${img}</div>
      <div>
        <div class="pd-cat">${esc(p.category)}</div>
        <h1 class="pd-name">${esc(p.name)}</h1>
        <div class="pd-price" id="pdPrice">${money(size.price_cents)}</div>
        <p class="pd-desc">${esc(p.description)}</p>
        <div class="pd-pyramid">
          <div class="pd-tier"><div class="lbl">Top</div><div class="val">${esc(p.top_notes)}</div></div>
          <div class="pd-tier"><div class="lbl">Heart</div><div class="val">${esc(p.middle_notes)}</div></div>
          <div class="pd-tier"><div class="lbl">Base</div><div class="val">${esc(p.base_notes)}</div></div>
        </div>
        <label class="mini-label">Size</label>
        <div class="size-options" id="sizes">${p.sizes.map((s, i) =>
          `<div class="size-chip ${i === 0 ? 'active' : ''}" data-label="${esc(s.label)}" data-price="${s.price_cents}">${esc(s.label)}</div>`).join('')}</div>
        <div class="qty-row">
          <div class="qty-control"><button id="qMinus">&minus;</button><span id="qVal">1</span><button id="qPlus">+</button></div>
          <span class="stock-note">${p.stock > 0 ? p.stock + ' in stock' : 'Out of stock'}</span>
        </div>
        <div class="pd-actions">
          <button class="btn btn-primary" id="addBtn" ${p.stock < 1 ? 'disabled' : ''}>Add to Cart</button>
          <a class="btn btn-ghost" href="#/shop">Continue Shopping</a>
        </div>
        <div class="form-status" id="pdStatus"></div>
      </div>`;

    $('#sizes').addEventListener('click', (e) => {
      const c = e.target.closest('.size-chip'); if (!c) return;
      $$('.size-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      size = { label: c.dataset.label, price_cents: +c.dataset.price };
      $('#pdPrice').textContent = money(size.price_cents);
    });
    $('#qMinus').addEventListener('click', () => { qty = Math.max(1, qty - 1); $('#qVal').textContent = qty; });
    $('#qPlus').addEventListener('click', () => { qty = Math.min(20, qty + 1); $('#qVal').textContent = qty; });
    $('#addBtn').addEventListener('click', async () => {
      const st = $('#pdStatus');
      try {
        await api('/api/cart/items', { method: 'POST', body: { product_id: p.id, size_label: size.label, qty } });
        st.className = 'form-status success';
        st.textContent = `Added ${qty} \u00d7 ${p.name} (${size.label}) to your cart.`;
        refreshCartCount();
      } catch (e) { st.className = 'form-status error'; st.textContent = e.message; }
    });

    if (data.related.length) {
      $('#relatedWrap').innerHTML = `<div class="section-head" style="margin-top:70px"><div class="eyebrow">You May Also Like</div><h2>Related Perfumes</h2></div>
        <div class="product-grid" id="relGrid">${data.related.map(productCard).join('')}</div>`;
      wireAddButtons($('#relGrid'));
    }
  }

  async function viewCart() {
    $('#app').innerHTML = storefrontHeader() + `<main><section class="cart-page"><div class="wrap">
      <div class="section-head" style="text-align:left;max-width:none;margin-bottom:36px">
        <div class="eyebrow">Your Selection</div><h1 class="page-title">Shopping Cart</h1></div>
      <div id="cartRoot"><p style="color:var(--sage)">Loading…</p></div>
    </div></section></main>` + footer();
    wireNav();

    async function load() { render(await api('/api/cart')); }

    function render(cart) {
      const root = $('#cartRoot');
      if (!cart.items.length) {
        root.innerHTML = `<div class="empty-state glass"><h3>Your cart is empty</h3>
          <p style="margin-bottom:24px">Explore the collection and find something you'll want to wear.</p>
          <a class="btn btn-primary" href="#/shop">Browse Perfumes</a></div>`;
        return;
      }
      root.innerHTML = `<div class="cart-grid">
        <div class="glass cart-items">${cart.items.map(i => {
          const im = i.image_url ? `<img src="${esc(i.image_url)}" alt="">` : bottle();
          return `<div class="cart-item">
            <div class="cart-item-img">${im}</div>
            <div><div class="cart-item-name">${esc(i.name)}</div>
              <div class="cart-item-meta">${esc(i.size_label)} &middot; ${money(i.unit_price_cents)} each</div>
              <button class="cart-remove" data-del="${i.id}">Remove</button></div>
            <div class="qty-control"><button data-q="-1" data-id="${i.id}">&minus;</button><span>${i.qty}</span><button data-q="1" data-id="${i.id}">+</button></div>
            <div class="cart-item-price">${money(i.unit_price_cents * i.qty)}</div>
          </div>`; }).join('')}</div>
        <div><div class="cart-summary glass">
          <div class="summary-row"><span>Subtotal</span><span>${money(cart.subtotal_cents)}</span></div>
          <div class="summary-row"><span>Shipping</span><span>Calculated at dispatch</span></div>
          <div class="summary-row total"><span>Total</span><span>${money(cart.total_cents)}</span></div>
          <button class="btn btn-primary btn-full" id="coToggle" style="margin-top:18px">Proceed to Checkout</button>
          <a class="btn btn-ghost btn-full" href="#/shop" style="margin-top:12px">Continue Shopping</a>
          <form id="coForm">
            <div class="field"><label for="coName">Full Name</label><input type="text" id="coName"></div>
            <div class="field"><label for="coEmail">Email</label><input type="email" id="coEmail"></div>
            <div class="field"><label for="coAddr">Shipping Address</label><textarea id="coAddr"></textarea></div>
            <button type="submit" class="btn btn-primary btn-full" id="placeBtn">Place Order</button>
            <div class="form-status" id="coStatus"></div>
          </form>
        </div></div></div>`;

      $('#coToggle').addEventListener('click', () => $('#coForm').classList.toggle('open'));
      $$('[data-q]').forEach(b => b.addEventListener('click', async () => {
        const cur = +b.parentElement.querySelector('span').textContent;
        render(await api('/api/cart/items/' + b.dataset.id, { method: 'PATCH', body: { qty: cur + (+b.dataset.q) } }));
        refreshCartCount();
      }));
      $$('[data-del]').forEach(b => b.addEventListener('click', async () => {
        render(await api('/api/cart/items/' + b.dataset.del, { method: 'DELETE' }));
        refreshCartCount();
      }));
      $('#coForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const st = $('#coStatus'), btn = $('#placeBtn');
        btn.disabled = true; btn.textContent = 'Placing order…';
        try {
          const r = await api('/api/cart/checkout', { method: 'POST', body: {
            customer_name: $('#coName').value.trim(), customer_email: $('#coEmail').value.trim(), shipping_address: $('#coAddr').value.trim() } });
          st.className = 'form-status success';
          st.textContent = `Order placed! Confirmation number: ${r.order_number}.`;
          refreshCartCount(); setTimeout(load, 1500);
        } catch (err) { st.className = 'form-status error'; st.textContent = err.message; }
        finally { btn.disabled = false; btn.textContent = 'Place Order'; }
      });
    }
    load();
  }

  async function viewLogin() {
    try { const { user } = await api('/api/auth/me'); if (user) { location.hash = '#/account'; return; } } catch (e) {}
    $('#app').innerHTML = storefrontHeader() + `<main><div class="auth-wrap">
      <div class="auth-tabs"><div class="auth-tab active" data-tab="login">Login</div><div class="auth-tab" data-tab="signup">Sign Up</div></div>
      <div class="auth-card glass">
        <div class="auth-panel active" id="panel-login">
          <form id="loginForm" novalidate>
            <div class="field" data-f="le"><label for="lEmail">Email Address</label><input type="email" id="lEmail"><div class="field-error">Please enter a valid email address.</div></div>
            <div class="field" data-f="lp"><label for="lPass">Password</label>
              <div class="password-field"><input type="password" id="lPass"><button type="button" class="password-toggle" data-t="lPass">Show</button></div>
              <div class="field-error">Please enter your password.</div></div>
            <div class="auth-links"><label class="checkbox-row"><input type="checkbox" id="remember"> Remember me</label>
              <a href="#/login" id="forgotLink">Forgot password?</a></div>
            <div class="forgot-panel" id="forgotPanel">
              <div class="field"><label for="fEmail">Enter your email to reset your password</label><input type="email" id="fEmail"></div>
              <button type="button" class="btn btn-ghost btn-full" id="fSubmit">Send Reset Link</button>
              <div class="form-status" id="fStatus"></div>
            </div>
            <button type="submit" class="btn btn-primary btn-full" id="lSubmit">Login</button>
            <div class="form-status" id="lStatus"></div>
          </form>
          <div class="auth-switch">New here? <a href="#/login" data-switch="signup">Create an account</a></div>
        </div>
        <div class="auth-panel" id="panel-signup">
          <form id="signupForm" novalidate>
            <div class="field" data-f="sn"><label for="sName">Full Name</label><input type="text" id="sName"><div class="field-error">Please enter your full name.</div></div>
            <div class="field" data-f="se"><label for="sEmail">Email</label><input type="email" id="sEmail"><div class="field-error">Please enter a valid email address.</div></div>
            <div class="field" data-f="sp"><label for="sPass">Password</label>
              <div class="password-field"><input type="password" id="sPass"><button type="button" class="password-toggle" data-t="sPass">Show</button></div>
              <div class="field-hint">At least 8 characters, with a letter and a number.</div>
              <div class="field-error">Password must be at least 8 characters with a letter and a number.</div></div>
            <div class="field" data-f="sc"><label for="sConf">Confirm Password</label>
              <div class="password-field"><input type="password" id="sConf"><button type="button" class="password-toggle" data-t="sConf">Show</button></div>
              <div class="field-error">Passwords do not match.</div></div>
            <button type="submit" class="btn btn-primary btn-full" id="sSubmit">Create Account</button>
            <div class="form-status" id="sStatus"></div>
          </form>
          <div class="auth-switch">Already have an account? <a href="#/login" data-switch="login">Login</a></div>
        </div>
      </div>
      <p class="admin-hint">Administrator? <a href="#/admin">Sign in to the admin dashboard</a></p>
    </div></main>`;
    wireNav();

    const show = (n) => {
      $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === n));
      $$('.auth-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + n));
    };
    $$('.auth-tab').forEach(t => t.addEventListener('click', () => show(t.dataset.tab)));
    $$('[data-switch]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); show(a.dataset.switch); }));
    $$('.password-toggle').forEach(b => b.addEventListener('click', () => {
      const i = document.getElementById(b.dataset.t);
      const showing = i.type === 'text'; i.type = showing ? 'password' : 'text';
      b.textContent = showing ? 'Show' : 'Hide';
    }));
    $('#forgotLink').addEventListener('click', (e) => { e.preventDefault(); $('#forgotPanel').classList.toggle('open'); });
    $('#fSubmit').addEventListener('click', async () => {
      const st = $('#fStatus');
      try { const r = await api('/api/auth/forgot-password', { method: 'POST', body: { email: $('#fEmail').value.trim() } });
        st.className = 'form-status success'; st.textContent = r.message; }
      catch (e) { st.className = 'form-status error'; st.textContent = e.message; }
    });

    const okEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#lStatus'), btn = $('#lSubmit');
      const em = $('#lEmail').value.trim(), pw = $('#lPass').value;
      let ok = true;
      $('[data-f="le"]').classList.toggle('invalid', !okEmail(em)); if (!okEmail(em)) ok = false;
      $('[data-f="lp"]').classList.toggle('invalid', !pw); if (!pw) ok = false;
      if (!ok) return;
      btn.disabled = true; btn.textContent = 'Logging in…'; st.className = 'form-status';
      try { await api('/api/auth/login', { method: 'POST', body: { email: em, password: pw, remember: $('#remember').checked } });
        location.hash = '#/account'; }
      catch (err) { st.className = 'form-status error'; st.textContent = err.message; }
      finally { btn.disabled = false; btn.textContent = 'Login'; }
    });

    $('#signupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#sStatus'), btn = $('#sSubmit');
      const n = $('#sName').value.trim(), em = $('#sEmail').value.trim(), pw = $('#sPass').value, cf = $('#sConf').value;
      const pwOk = pw.length >= 8 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);
      let ok = true;
      $('[data-f="sn"]').classList.toggle('invalid', n.length < 2); if (n.length < 2) ok = false;
      $('[data-f="se"]').classList.toggle('invalid', !okEmail(em)); if (!okEmail(em)) ok = false;
      $('[data-f="sp"]').classList.toggle('invalid', !pwOk); if (!pwOk) ok = false;
      $('[data-f="sc"]').classList.toggle('invalid', pw !== cf); if (pw !== cf) ok = false;
      if (!ok) return;
      btn.disabled = true; btn.textContent = 'Creating account…'; st.className = 'form-status';
      try { await api('/api/auth/register', { method: 'POST', body: { full_name: n, email: em, password: pw, confirm_password: cf } });
        location.hash = '#/account'; }
      catch (err) { st.className = 'form-status error'; st.textContent = err.message; }
      finally { btn.disabled = false; btn.textContent = 'Create Account'; }
    });

    if (location.hash.includes('signup')) show('signup');
  }

  async function viewAccount() {
    let user;
    try { const d = await api('/api/auth/me'); if (!d.user) { location.hash = '#/login'; return; } user = d.user; }
    catch (e) { location.hash = '#/login'; return; }

    $('#app').innerHTML = storefrontHeader() + `<main><section class="account-page"><div class="wrap">
      <div class="account-grid">
        <div>
          <div class="profile-row">
            <div class="profile-avatar">${esc(user.full_name[0])}</div>
            <div><div class="profile-name">${esc(user.full_name)}</div><div class="profile-email">${esc(user.email)}</div></div>
          </div>
          <nav class="account-nav">
            <a href="#/shop">Continue Shopping</a>
            <a href="#/cart">View Cart</a>
            <button id="logoutBtn">Log Out</button>
          </nav>
        </div>
        <div>
          <div class="glass panel-card">
            <div class="eyebrow" style="margin-bottom:14px">Profile</div>
            <div class="fact"><dt>Full Name</dt><dd>${esc(user.full_name)}</dd></div>
            <div class="fact"><dt>Email</dt><dd>${esc(user.email)}</dd></div>
            <div class="fact"><dt>Member Since</dt><dd>${fdate(user.created_at, { year: 'numeric', month: 'long', day: 'numeric' })}</dd></div>
          </div>
          <div class="glass panel-card">
            <div class="eyebrow" style="margin-bottom:14px">Order History</div>
            <div id="orders"><p style="color:var(--sage);font-size:14px">Loading…</p></div>
          </div>
        </div>
      </div>
    </div></section></main>` + footer();
    wireNav();

    $('#logoutBtn').addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' });
      location.hash = '#/';
    });

    try {
      const { orders } = await api('/api/orders/mine');
      $('#orders').innerHTML = orders.length ? orders.map(o => `<div class="order-row">
        <div><div>${esc(o.order_number)}</div>
          <div class="order-meta">${fdate(o.created_at)} &middot; ${(o.items || []).length} item${(o.items || []).length === 1 ? '' : 's'}</div></div>
        <div class="order-right"><span>${money(o.total_cents)}</span><span class="status-pill ${esc(o.status)}">${esc(o.status)}</span></div>
      </div>`).join('') : '<p style="color:var(--sage);font-size:14px">No orders yet — orders you place while logged in appear here.</p>';
    } catch (e) { $('#orders').innerHTML = '<p style="color:var(--sage);font-size:14px">Could not load orders.</p>'; }
  }

  // ---------- admin ----------
  const ADMIN_NAV = [
    ['#/admin/dashboard', 'Dashboard'], ['#/admin/products', 'Perfumes'], ['#/admin/orders', 'Orders'],
    ['#/admin/customers', 'Customers'], ['#/admin/content', 'Website Content'],
    ['#/admin/appearance', 'Appearance'], ['#/admin/messages', 'Messages']
  ];

  async function requireAdmin() {
    try { const { admin } = await api('/api/admin/me'); if (!admin) { location.hash = '#/admin'; return null; } return admin; }
    catch (e) { location.hash = '#/admin'; return null; }
  }

  function adminShell(active, title, bodyHtml, admin) {
    return `<div class="admin-shell">
      <aside class="admin-sidebar">
        <div class="admin-brand">${moonMark} ${esc(SETTINGS.logo_text || 'MAISON LUNAR')}</div>
        <nav class="admin-nav">
          ${ADMIN_NAV.map(([h, l]) => `<a href="${h}" class="${h.endsWith(active) ? 'active' : ''}">${l}</a>`).join('')}
          <div class="divider"></div>
          <a href="#/">View Site</a>
          <button id="adminLogout">Log Out</button>
        </nav>
      </aside>
      <main class="admin-main">
        <div class="admin-topbar"><h1>${esc(title)}</h1><div class="who">${esc(admin.full_name)} \u00B7 ${esc(admin.email)}</div></div>
        ${bodyHtml}
      </main></div>`;
  }

  function wireAdminShell() {
    const b = $('#adminLogout');
    if (b) b.addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }); location.hash = '#/admin'; });
  }

  async function viewAdminLogin() {
    try { const { admin } = await api('/api/admin/me'); if (admin) { location.hash = '#/admin/dashboard'; return; } } catch (e) {}
    $('#app').innerHTML = `<main><div class="auth-wrap" style="padding-top:70px">
      <div style="text-align:center;margin-bottom:30px">
        <a href="#/" class="brand" style="justify-content:center;display:inline-flex">${moonMark} ${esc(SETTINGS.logo_text || 'MAISON LUNAR')}</a>
        <div class="eyebrow" style="margin-top:10px">Administrator Access</div>
      </div>
      <div class="auth-card glass">
        <form id="aForm" novalidate>
          <div class="field"><label for="aEmail">Email Address</label><input type="email" id="aEmail"></div>
          <div class="field"><label for="aPass">Password</label>
            <div class="password-field"><input type="password" id="aPass"><button type="button" class="password-toggle" data-t="aPass">Show</button></div></div>
          <button type="submit" class="btn btn-primary btn-full" id="aSubmit">Sign In</button>
          <div class="form-status" id="aStatus"></div>
        </form>
      </div>
      <p class="admin-hint">Demo administrator: <strong>admin@maisonlunar.com</strong> / <strong>LunarAdmin!2026</strong></p>
      <p class="admin-hint"><a href="#/">&larr; Back to the store</a></p>
    </div></main>`;
    $$('.password-toggle').forEach(b => b.addEventListener('click', () => {
      const i = document.getElementById(b.dataset.t);
      const s = i.type === 'text'; i.type = s ? 'password' : 'text'; b.textContent = s ? 'Show' : 'Hide';
    }));
    $('#aForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#aStatus'), btn = $('#aSubmit');
      btn.disabled = true; btn.textContent = 'Signing in…'; st.className = 'form-status';
      try { await api('/api/admin/login', { method: 'POST', body: { email: $('#aEmail').value.trim(), password: $('#aPass').value } });
        location.hash = '#/admin/dashboard'; }
      catch (err) { st.className = 'form-status error'; st.textContent = err.message; }
      finally { btn.disabled = false; btn.textContent = 'Sign In'; }
    });
  }

  async function viewAdminDashboard() {
    const admin = await requireAdmin(); if (!admin) return;
    const s = await api('/api/admin/stats');
    const lowStock = (await api('/api/admin/products')).products.filter(p => p.stock > 0 && p.stock <= 10).length;
    const outStock = (await api('/api/admin/products')).products.filter(p => p.stock === 0).length;
    $('#app').innerHTML = adminShell('dashboard', 'Dashboard', `
      <div class="stat-grid">
        <div class="stat-card glass"><div class="label">Total Perfumes</div><div class="value">${s.total_products}</div></div>
        <div class="stat-card glass"><div class="label">Customers</div><div class="value">${s.total_customers}</div></div>
        <div class="stat-card glass"><div class="label">Orders</div><div class="value">${s.total_orders}</div></div>
        <div class="stat-card glass"><div class="label">Revenue</div><div class="value">${money(s.revenue_cents)}</div></div>
        <div class="stat-card glass"><div class="label">Low Stock (&le;10)</div><div class="value">${lowStock}</div></div>
        <div class="stat-card glass"><div class="label">Out of Stock</div><div class="value">${outStock}</div></div>
      </div>
      <div class="admin-card glass"><h2>Recent Orders</h2><div class="table-wrap"><table class="admin-table">
        <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${s.recent_orders.length ? s.recent_orders.map(o => `<tr><td>${esc(o.order_number)}</td><td>${esc(o.customer_name)}</td>
          <td>${money(o.total_cents)}</td><td><span class="status-pill ${esc(o.status)}">${esc(o.status)}</span></td>
          <td>${fdate(o.created_at)}</td></tr>`).join('') : '<tr><td colspan="5" style="color:var(--sage)">No orders yet.</td></tr>'}</tbody>
      </table></div></div>
      <div class="admin-card glass"><h2>Recent Messages</h2>
        ${s.recent_messages.length ? s.recent_messages.map(m => `<div class="msg-item ${m.is_read ? '' : 'unread'}">
          <div class="top-row"><span>${esc(m.name)} &middot; ${esc(m.email)}</span><span>${fdate(m.created_at)}</span></div>
          <div class="subject">${esc(m.subject)}</div></div>`).join('') : '<p style="color:var(--sage);font-size:13px">No messages yet.</p>'}
      </div>`, admin);
    wireAdminShell();
  }

  async function viewAdminProducts() {
    const admin = await requireAdmin(); if (!admin) return;
    $('#app').innerHTML = adminShell('products', 'Perfumes', `
      <div class="admin-card glass">
        <div class="toolbar">
          <input type="search" id="pSearch" placeholder="Search perfumes…">
          <button class="btn btn-primary btn-sm" id="newBtn">+ Add New Perfume</button>
        </div>
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Flags</th><th></th></tr></thead>
          <tbody id="pBody"><tr><td colspan="7" style="color:var(--sage)">Loading…</td></tr></tbody>
        </table></div>
      </div>
      <div class="modal-overlay" id="pModal"><div class="modal-box">
        <h2 id="mTitle">Add New Perfume</h2>
        <form id="pForm">
          <input type="hidden" id="pId">
          <div class="field-row">
            <div class="field"><label for="pName">Product Name</label><input type="text" id="pName"></div>
            <div class="field"><label for="pCat">Category</label><select id="pCat">
              <option value="unisex">Unisex</option><option value="mens">Men's</option><option value="womens">Women's</option></select></div>
          </div>
          <div class="field"><label for="pShort">Short Description</label><input type="text" id="pShort"></div>
          <div class="field"><label for="pDesc">Full Description</label><textarea id="pDesc"></textarea></div>
          <div class="field-row">
            <div class="field"><label for="pTop">Top Notes</label><input type="text" id="pTop"></div>
            <div class="field"><label for="pMid">Middle Notes</label><input type="text" id="pMid"></div>
          </div>
          <div class="field"><label for="pBase">Base Notes</label><input type="text" id="pBase"></div>
          <div class="field"><label for="pStock">Stock Quantity</label><input type="number" id="pStock" min="0" value="0"></div>
          <div class="field"><label>Product Image</label>
            <div class="image-preview" id="imgPrev" style="display:none"><img id="imgPrevImg" alt=""></div>
            <div class="image-drop" id="imgDrop">Tap to upload a PNG, JPG or WEBP</div>
            <input type="file" id="imgInput" accept="image/png,image/jpeg,image/webp" style="display:none">
            <div class="form-status" id="imgStatus"></div>
          </div>
          <div class="field"><label>Sizes &amp; Prices</label><div class="size-manager" id="sizeMgr"></div>
            <button type="button" class="btn-icon" id="addSize">+ Add Size</button></div>
          <div class="toggle-row">
            <label><input type="checkbox" id="pFeat"> Featured</label>
            <label><input type="checkbox" id="pBest"> Best Seller</label>
            <label><input type="checkbox" id="pNew"> New Arrival</label>
          </div>
          <div class="form-status" id="pStatus"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
            <button type="submit" class="btn btn-primary" id="saveBtn">Save Changes</button>
          </div>
        </form>
      </div></div>`, admin);
    wireAdminShell();

    let products = [], imageUrl = '';
    const modal = $('#pModal');

    async function load() { products = (await api('/api/admin/products')).products; render(products); }

    function render(list) {
      $('#pBody').innerHTML = list.length ? list.map(p => {
        const flags = [p.is_featured && 'Featured', p.is_bestseller && 'Best Seller', p.is_new_arrival && 'New'].filter(Boolean).join(', ') || '\u2014';
        return `<tr><td><div class="thumb">${p.image_url ? `<img src="${esc(p.image_url)}">` : ''}</div></td>
          <td>${esc(p.name)}</td><td style="text-transform:capitalize">${esc(p.category)}</td>
          <td>${money(p.price_from_cents)}</td><td>${p.stock}</td>
          <td style="font-size:11px;color:var(--sage)">${esc(flags)}</td>
          <td style="white-space:nowrap"><button class="btn-icon" data-edit="${p.id}">Edit</button>
          <button class="btn-icon" data-del="${p.id}" style="color:var(--danger)">Delete</button></td></tr>`;
      }).join('') : '<tr><td colspan="7" style="color:var(--sage)">No perfumes yet.</td></tr>';

      $$('[data-edit]').forEach(b => b.addEventListener('click', () => open(products.find(p => p.id == b.dataset.edit))));
      $$('[data-del]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this perfume? This cannot be undone.')) return;
        await api('/api/admin/products/' + b.dataset.del, { method: 'DELETE' }); load();
      }));
    }

    $('#pSearch').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      render(products.filter(p => p.name.toLowerCase().includes(q)));
    });

    function sizeRows(sizes) {
      $('#sizeMgr').innerHTML = sizes.map(s => `<div class="size-row">
        <input type="text" class="s-label" placeholder="e.g. 50ml" value="${esc(s.label || '')}">
        <input type="number" class="s-price" step="0.01" placeholder="Price (£)" value="${s.price_cents != null ? (s.price_cents / 100).toFixed(2) : ''}">
        <button type="button" class="remove-size">&times;</button></div>`).join('');
      $$('.remove-size').forEach(b => b.addEventListener('click', () => b.closest('.size-row').remove()));
    }
    $('#addSize').addEventListener('click', () => {
      const d = document.createElement('div');
      d.className = 'size-row';
      d.innerHTML = `<input type="text" class="s-label" placeholder="e.g. 50ml"><input type="number" class="s-price" step="0.01" placeholder="Price (£)"><button type="button" class="remove-size">&times;</button>`;
      d.querySelector('.remove-size').addEventListener('click', () => d.remove());
      $('#sizeMgr').appendChild(d);
    });

    function open(p) {
      imageUrl = p ? p.image_url : '';
      $('#mTitle').textContent = p ? 'Edit Perfume' : 'Add New Perfume';
      $('#pId').value = p ? p.id : '';
      $('#pName').value = p ? p.name : '';
      $('#pCat').value = p ? p.category : 'unisex';
      $('#pShort').value = p ? p.short_description : '';
      $('#pDesc').value = p ? p.description : '';
      $('#pTop').value = p ? p.top_notes : '';
      $('#pMid').value = p ? p.middle_notes : '';
      $('#pBase').value = p ? p.base_notes : '';
      $('#pStock').value = p ? p.stock : 0;
      $('#pFeat').checked = p ? p.is_featured : false;
      $('#pBest').checked = p ? p.is_bestseller : false;
      $('#pNew').checked = p ? p.is_new_arrival : false;
      sizeRows(p && p.sizes.length ? p.sizes : [{ label: '', price_cents: null }]);
      $('#pStatus').className = 'form-status'; $('#pStatus').textContent = '';
      $('#imgStatus').className = 'form-status';
      if (imageUrl) { $('#imgPrev').style.display = 'block'; $('#imgPrevImg').src = imageUrl; }
      else $('#imgPrev').style.display = 'none';
      modal.classList.add('open');
    }

    $('#newBtn').addEventListener('click', () => open(null));
    $('#cancelBtn').addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

    $('#imgDrop').addEventListener('click', () => $('#imgInput').click());
    $('#imgInput').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const st = $('#imgStatus');
      if (f.size > 1.2 * 1024 * 1024) { st.className = 'form-status error'; st.textContent = 'Please use an image under about 1MB (browser storage limit).'; return; }
      const r = new FileReader();
      r.onload = async () => {
        st.className = 'form-status'; st.style.display = 'block'; st.textContent = 'Uploading…';
        try {
          const res = await api('/api/admin/upload-image', { method: 'POST', body: { dataUrl: r.result } });
          imageUrl = res.url;
          $('#imgPrev').style.display = 'block'; $('#imgPrevImg').src = imageUrl;
          st.className = 'form-status success'; st.textContent = 'Image uploaded.';
        } catch (err) { st.className = 'form-status error'; st.textContent = err.message; }
      };
      r.readAsDataURL(f);
    });

    $('#pForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#pStatus'), btn = $('#saveBtn');
      const sizes = $$('#sizeMgr .size-row').map(r => ({
        label: r.querySelector('.s-label').value.trim(),
        price_cents: Math.round(parseFloat(r.querySelector('.s-price').value || '0') * 100)
      })).filter(s => s.label && s.price_cents > 0);
      if (!$('#pName').value.trim()) { st.className = 'form-status error'; st.textContent = 'Product name is required.'; return; }
      if (!sizes.length) { st.className = 'form-status error'; st.textContent = 'Add at least one size with a price.'; return; }
      const payload = {
        name: $('#pName').value.trim(), category: $('#pCat').value,
        short_description: $('#pShort').value.trim(), description: $('#pDesc').value.trim(),
        top_notes: $('#pTop').value.trim(), middle_notes: $('#pMid').value.trim(), base_notes: $('#pBase').value.trim(),
        stock: parseInt($('#pStock').value, 10) || 0, image_url: imageUrl, sizes,
        is_featured: $('#pFeat').checked, is_bestseller: $('#pBest').checked, is_new_arrival: $('#pNew').checked
      };
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const id = $('#pId').value;
        if (id) await api('/api/admin/products/' + id, { method: 'PUT', body: payload });
        else await api('/api/admin/products', { method: 'POST', body: payload });
        modal.classList.remove('open'); await load();
      } catch (err) { st.className = 'form-status error'; st.textContent = err.message; }
      finally { btn.disabled = false; btn.textContent = 'Save Changes'; }
    });

    load();
  }

  async function viewAdminOrders() {
    const admin = await requireAdmin(); if (!admin) return;
    $('#app').innerHTML = adminShell('orders', 'Orders', `
      <div class="admin-card glass">
        <div class="toolbar">
          <input type="search" id="oSearch" placeholder="Search order #, name or email…">
          <select id="oStatus"><option value="">All Statuses</option>
            <option>pending</option><option>processing</option><option>shipped</option>
            <option>completed</option><option>cancelled</option></select>
        </div>
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th><th></th></tr></thead>
          <tbody id="oBody"><tr><td colspan="6" style="color:var(--sage)">Loading…</td></tr></tbody>
        </table></div>
      </div>
      <div class="modal-overlay" id="oModal"><div class="modal-box">
        <h2>Order Details</h2><div id="oDetail"></div>
        <div class="modal-actions"><button class="btn btn-ghost" id="oClose">Close</button></div>
      </div></div>`, admin);
    wireAdminShell();

    async function load() {
      const q = new URLSearchParams();
      if ($('#oSearch').value.trim()) q.set('search', $('#oSearch').value.trim());
      if ($('#oStatus').value) q.set('status', $('#oStatus').value);
      const { orders } = await api('/api/admin/orders?' + q);
      $('#oBody').innerHTML = orders.length ? orders.map(o => `<tr>
        <td>${esc(o.order_number)}</td>
        <td>${esc(o.customer_name)}<br><span style="color:var(--sage);font-size:11px">${esc(o.customer_email)}</span></td>
        <td>${money(o.total_cents)}</td><td><span class="status-pill ${esc(o.status)}">${esc(o.status)}</span></td>
        <td>${fdate(o.created_at)}</td><td><button class="btn-icon" data-view="${o.id}">View</button></td></tr>`).join('')
        : '<tr><td colspan="6" style="color:var(--sage)">No orders found.</td></tr>';
      $$('[data-view]').forEach(b => b.addEventListener('click', () => viewOrder(b.dataset.view)));
    }

    async function viewOrder(id) {
      const { order, items } = await api('/api/admin/orders/' + id);
      $('#oDetail').innerHTML = `
        <p style="font-size:13px;color:var(--sage);margin-bottom:6px">Order ${esc(order.order_number)} &middot; ${fdatetime(order.created_at)}</p>
        <p><strong>${esc(order.customer_name)}</strong> &middot; ${esc(order.customer_email)}</p>
        <p style="font-size:13px;color:var(--sage);margin-bottom:16px">${esc(order.shipping_address || 'No address provided')}</p>
        <div class="table-wrap"><table class="admin-table"><thead><tr><th>Product</th><th>Size</th><th>Qty</th><th>Price</th></tr></thead>
        <tbody>${items.map(i => `<tr><td>${esc(i.product_name)}</td><td>${esc(i.size_label)}</td><td>${i.qty}</td><td>${money(i.unit_price_cents * i.qty)}</td></tr>`).join('')}</tbody></table></div>
        <p style="text-align:right;margin-top:12px;font-family:var(--font-display);font-size:18px">Total: ${money(order.total_cents)}</p>
        <div class="field" style="margin-top:18px"><label for="stSel">Update Status</label><select id="stSel">
          ${['pending', 'processing', 'shipped', 'completed', 'cancelled'].map(s => `<option ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select></div>
        <button class="btn btn-primary" id="stBtn">Update Status</button>
        <div class="form-status" id="stMsg"></div>`;
      $('#stBtn').addEventListener('click', async () => {
        const m = $('#stMsg');
        try { await api('/api/admin/orders/' + order.id, { method: 'PATCH', body: { status: $('#stSel').value } });
          m.className = 'form-status success'; m.textContent = 'Order status updated.'; load(); }
        catch (e) { m.className = 'form-status error'; m.textContent = e.message; }
      });
      $('#oModal').classList.add('open');
    }

    $('#oClose').addEventListener('click', () => $('#oModal').classList.remove('open'));
    $('#oModal').addEventListener('click', (e) => { if (e.target.id === 'oModal') e.target.classList.remove('open'); });
    let t; $('#oSearch').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 300); });
    $('#oStatus').addEventListener('change', load);
    load();
  }

  async function viewAdminCustomers() {
    const admin = await requireAdmin(); if (!admin) return;
    $('#app').innerHTML = adminShell('customers', 'Customers', `
      <div class="admin-card glass"><div class="table-wrap"><table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Status</th><th></th></tr></thead>
        <tbody id="cBody"><tr><td colspan="5" style="color:var(--sage)">Loading…</td></tr></tbody>
      </table></div></div>
      <div class="modal-overlay" id="cModal"><div class="modal-box">
        <h2>Customer Profile</h2><div id="cDetail"></div>
        <div class="modal-actions"><button class="btn btn-ghost" id="cClose">Close</button></div>
      </div></div>`, admin);
    wireAdminShell();

    async function load() {
      const { customers } = await api('/api/admin/customers');
      $('#cBody').innerHTML = customers.length ? customers.map(c => `<tr>
        <td>${esc(c.full_name)}</td><td>${esc(c.email)}</td><td>${fdate(c.created_at)}</td>
        <td><span class="pill-toggle ${c.is_active ? 'on' : 'off'}">${c.is_active ? 'Active' : 'Disabled'}</span></td>
        <td style="white-space:nowrap"><button class="btn-icon" data-view="${c.id}">View</button>
        <button class="btn-icon" data-tog="${c.id}" data-active="${c.is_active ? 1 : 0}">${c.is_active ? 'Disable' : 'Enable'}</button></td></tr>`).join('')
        : '<tr><td colspan="5" style="color:var(--sage)">No customers yet.</td></tr>';
      $$('[data-view]').forEach(b => b.addEventListener('click', () => detail(b.dataset.view)));
      $$('[data-tog]').forEach(b => b.addEventListener('click', async () => {
        await api('/api/admin/customers/' + b.dataset.tog, { method: 'PATCH', body: { is_active: b.dataset.active !== '1' } });
        load();
      }));
    }
    async function detail(id) {
      const { customer, orders } = await api('/api/admin/customers/' + id);
      $('#cDetail').innerHTML = `<p><strong>${esc(customer.full_name)}</strong></p>
        <p style="font-size:13px;color:var(--sage);margin-bottom:16px">${esc(customer.email)} &middot; joined ${fdate(customer.created_at)}</p>
        <h3 style="font-size:14px;margin-bottom:10px">Order History</h3>
        ${orders.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Order</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody>
          ${orders.map(o => `<tr><td>${esc(o.order_number)}</td><td>${money(o.total_cents)}</td><td><span class="status-pill ${esc(o.status)}">${esc(o.status)}</span></td><td>${fdate(o.created_at)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p style="color:var(--sage);font-size:13px">No orders yet.</p>'}`;
      $('#cModal').classList.add('open');
    }
    $('#cClose').addEventListener('click', () => $('#cModal').classList.remove('open'));
    $('#cModal').addEventListener('click', (e) => { if (e.target.id === 'cModal') e.target.classList.remove('open'); });
    load();
  }

  async function viewAdminContent() {
    const admin = await requireAdmin(); if (!admin) return;
    const { settings } = await api('/api/admin/settings');
    let testis = [];
    try { testis = JSON.parse(settings.testimonials || '[]'); } catch (e) {}

    $('#app').innerHTML = adminShell('content', 'Website Content', `
      <form id="cForm">
        <div class="admin-card glass"><h2>Homepage Hero</h2>
          <div class="field"><label for="hero_eyebrow">Eyebrow Label</label><input type="text" id="hero_eyebrow"></div>
          <div class="field"><label for="hero_headline">Headline</label><input type="text" id="hero_headline"></div>
          <div class="field"><label for="hero_description">Description</label><textarea id="hero_description"></textarea></div>
        </div>
        <div class="admin-card glass"><h2>About Section</h2>
          <div class="field"><label for="about_heading">Heading</label><input type="text" id="about_heading"></div>
          <div class="field"><label for="about_body">Body Text</label><textarea id="about_body"></textarea></div>
        </div>
        <div class="admin-card glass"><h2>Contact Information</h2>
          <div class="field-row">
            <div class="field"><label for="contact_email">Contact Email</label><input type="email" id="contact_email"></div>
            <div class="field"><label for="contact_address">Address / Availability</label><input type="text" id="contact_address"></div>
          </div>
        </div>
        <div class="admin-card glass"><h2>Footer</h2>
          <div class="field"><label for="footer_text">Footer Description</label><textarea id="footer_text"></textarea></div>
        </div>
        <div class="admin-card glass"><h2>Testimonials</h2>
          <div id="tMgr"></div><button type="button" class="btn-icon" id="addT">+ Add Testimonial</button>
        </div>
        <div class="admin-card glass"><h2>Promotional Banner</h2>
          <div class="field"><label for="banner_text">Banner Text (leave blank to hide)</label><input type="text" id="banner_text"></div>
        </div>
        <button type="submit" class="btn btn-primary" id="saveC">Save Changes</button>
        <div class="form-status" id="cStatus"></div>
      </form>`, admin);
    wireAdminShell();

    const KEYS = ['hero_eyebrow', 'hero_headline', 'hero_description', 'about_heading', 'about_body', 'contact_email', 'contact_address', 'footer_text', 'banner_text'];
    KEYS.forEach(k => { const el = document.getElementById(k); if (el) el.value = settings[k] || ''; });

    function renderT() {
      $('#tMgr').innerHTML = testis.map((t, i) => `<div class="field-row t-row" data-i="${i}" style="margin-bottom:14px;align-items:end">
        <div class="field" style="margin-bottom:0"><label>Name</label><input type="text" class="t-name" value="${esc(t.name || '')}"></div>
        <div class="field" style="margin-bottom:0"><label>Role / Location</label><input type="text" class="t-role" value="${esc(t.role || '')}"></div>
        <div class="field" style="margin-bottom:0;grid-column:1/-1"><label>Quote</label><input type="text" class="t-quote" value="${esc(t.quote || '')}"></div>
        <button type="button" class="btn-icon rm-t" style="grid-column:1/-1;width:fit-content;color:var(--danger)">Remove</button>
      </div>`).join('');
      $$('.rm-t').forEach(b => b.addEventListener('click', () => {
        testis.splice(+b.closest('.t-row').dataset.i, 1); renderT();
      }));
    }
    renderT();
    $('#addT').addEventListener('click', () => { testis.push({ name: '', role: '', quote: '' }); renderT(); });

    $('#cForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#cStatus'), btn = $('#saveC');
      const payload = {};
      KEYS.forEach(k => { payload[k] = (document.getElementById(k) || {}).value || ''; });
      payload.testimonials = JSON.stringify($$('#tMgr .t-row').map(r => ({
        name: r.querySelector('.t-name').value.trim(),
        role: r.querySelector('.t-role').value.trim(),
        quote: r.querySelector('.t-quote').value.trim()
      })).filter(t => t.name && t.quote));
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        await api('/api/admin/settings', { method: 'PUT', body: payload });
        SETTINGS = (await api('/api/settings')).settings;
        st.className = 'form-status success'; st.textContent = 'Saved — the storefront is updated immediately.';
      } catch (err) { st.className = 'form-status error'; st.textContent = err.message; }
      finally { btn.disabled = false; btn.textContent = 'Save Changes'; }
    });
  }

  async function viewAdminAppearance() {
    const admin = await requireAdmin(); if (!admin) return;
    const { settings } = await api('/api/admin/settings');
    $('#app').innerHTML = adminShell('appearance', 'Appearance', `
      <form id="aForm">
        <div class="admin-card glass"><h2>Colours</h2>
          <div class="field"><label>Main Accent Colour</label>
            <div class="color-row"><input type="color" id="cp_pick"><input type="text" id="color_primary"></div></div>
          <div class="field"><label>Secondary Green</label>
            <div class="color-row"><input type="color" id="cs_pick"><input type="text" id="color_secondary"></div></div>
          <div class="field"><label>Background Green</label>
            <div class="color-row"><input type="color" id="cb_pick"><input type="text" id="color_background"></div></div>
        </div>
        <div class="admin-card glass"><h2>Branding</h2>
          <div class="field"><label for="site_title">Website Title</label><input type="text" id="site_title"></div>
          <div class="field"><label for="logo_text">Logo Text (nav &amp; footer)</label><input type="text" id="logo_text"></div>
          <div class="field"><label for="favicon">Favicon (emoji)</label><input type="text" id="favicon" maxlength="2" style="max-width:110px"></div>
        </div>
        <button type="submit" class="btn btn-primary" id="saveA">Save Changes</button>
        <div class="form-status" id="aStatus"></div>
      </form>`, admin);
    wireAdminShell();

    ['site_title', 'logo_text', 'favicon'].forEach(k => { document.getElementById(k).value = settings[k] || ''; });
    const pairs = [['color_primary', 'cp_pick'], ['color_secondary', 'cs_pick'], ['color_background', 'cb_pick']];
    pairs.forEach(([k, pick]) => {
      const v = settings[k] || '#000000';
      document.getElementById(k).value = v;
      document.getElementById(pick).value = /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000';
      document.getElementById(pick).addEventListener('input', (e) => { document.getElementById(k).value = e.target.value; });
      document.getElementById(k).addEventListener('input', (e) => {
        if (/^#[0-9a-f]{6}$/i.test(e.target.value)) document.getElementById(pick).value = e.target.value;
      });
    });

    $('#aForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#aStatus'), btn = $('#saveA');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        await api('/api/admin/settings', { method: 'PUT', body: {
          site_title: $('#site_title').value.trim(), logo_text: $('#logo_text').value.trim(),
          favicon: $('#favicon').value.trim(), color_primary: $('#color_primary').value.trim(),
          color_secondary: $('#color_secondary').value.trim(), color_background: $('#color_background').value.trim() } });
        SETTINGS = (await api('/api/settings')).settings;
        applyAppearance();
        st.className = 'form-status success'; st.textContent = 'Appearance updated across the site.';
      } catch (err) { st.className = 'form-status error'; st.textContent = err.message; }
      finally { btn.disabled = false; btn.textContent = 'Save Changes'; }
    });
  }

  async function viewAdminMessages() {
    const admin = await requireAdmin(); if (!admin) return;
    $('#app').innerHTML = adminShell('messages', 'Messages', `
      <div class="inbox-grid">
        <div class="admin-card glass inbox-list" id="mList"><p style="color:var(--sage)">Loading…</p></div>
        <div class="admin-card glass" id="mDetail"><p style="color:var(--sage)">Select a message to read it.</p></div>
      </div>`, admin);
    wireAdminShell();

    let msgs = [], activeId = null;
    async function load() {
      msgs = (await api('/api/admin/messages')).messages;
      $('#mList').innerHTML = msgs.length ? msgs.map(m => `<div class="msg-item ${m.is_read ? '' : 'unread'}" data-id="${m.id}">
        <div class="top-row"><span>${esc(m.name)}</span><span>${fdate(m.created_at)}</span></div>
        <div class="subject">${esc(m.subject)}</div></div>`).join('') : '<p style="color:var(--sage)">No messages yet.</p>';
      $$('#mList .msg-item').forEach(el => el.addEventListener('click', () => open(+el.dataset.id)));
      if (activeId) { const m = msgs.find(x => x.id === activeId); if (m) detail(m); }
    }
    async function open(id) {
      activeId = id;
      const m = msgs.find(x => x.id === id);
      if (!m.is_read) { await api('/api/admin/messages/' + id, { method: 'PATCH', body: { is_read: true } }); m.is_read = 1; }
      await load();
    }
    function detail(m) {
      $('#mDetail').innerHTML = `<div class="msg-head">
          <div><h2>${esc(m.subject)}</h2>
            <p style="font-size:13px;color:var(--sage)">${esc(m.name)} &middot; <a href="mailto:${esc(m.email)}" style="color:var(--moon)">${esc(m.email)}</a></p>
            <p style="font-size:11px;color:var(--sage);margin-top:4px">${fdatetime(m.created_at)}</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-icon" id="togRead">${m.is_read ? 'Mark Unread' : 'Mark Read'}</button>
            <button class="btn-icon" id="delMsg" style="color:var(--danger)">Delete</button></div>
        </div>
        <p style="font-size:14.5px;line-height:1.7;white-space:pre-wrap">${esc(m.message)}</p>`;
      $('#togRead').addEventListener('click', async () => {
        await api('/api/admin/messages/' + m.id, { method: 'PATCH', body: { is_read: !m.is_read } });
        activeId = m.id; load();
      });
      $('#delMsg').addEventListener('click', async () => {
        if (!confirm('Delete this message?')) return;
        await api('/api/admin/messages/' + m.id, { method: 'DELETE' });
        activeId = null;
        $('#mDetail').innerHTML = '<p style="color:var(--sage)">Select a message to read it.</p>';
        load();
      });
    }
    load();
  }

  // ---------- appearance ----------
  function applyAppearance() {
    const s = SETTINGS, r = document.documentElement.style;
    if (s.color_primary) r.setProperty('--moon', s.color_primary);
    if (s.color_secondary) r.setProperty('--g-500', s.color_secondary);
    if (s.color_background) r.setProperty('--g-950', s.color_background);
    if (s.site_title) document.title = s.site_title;
    if (s.favicon) {
      let l = document.querySelector('link[rel="icon"]');
      if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
      l.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">' + encodeURIComponent(s.favicon) + '</text></svg>';
    }
  }

  function renderBanners() {
    const host = document.getElementById('topBars');
    host.innerHTML = '';
    const demoBar = document.createElement('div');
    demoBar.className = 'top-bar demo-bar';
    if (window.LUNAR_STORAGE_OK === false) {
      demoBar.classList.add('warn');
      demoBar.textContent = 'Your browser is blocking site storage — usually Private Browsing on Safari. You can look around, but signing in won\u2019t stick. Open this in a normal tab to use accounts.';
    } else {
      demoBar.innerHTML = 'Static demo — data is saved only in your browser and no emails are sent. <a href="#" id="resetDemo">Reset demo data</a>';
    }
    host.appendChild(demoBar);
    if (SETTINGS.banner_text) {
      const promo = document.createElement('div');
      promo.className = 'top-bar promo-bar';
      promo.textContent = SETTINGS.banner_text;
      host.appendChild(promo);
    }
    const rl = document.getElementById('resetDemo');
    if (rl) rl.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('Reset all demo data back to the samples?')) {
        try { localStorage.removeItem('lunar_demo_db_v1'); } catch (err) {}
        location.reload();
      }
    });
    document.body.style.setProperty('--topbar-h', host.getBoundingClientRect().height + 'px');
  }

  // ---------- router ----------
  const routes = [
    [/^#?\/?$/, viewHome],
    [/^#\/shop$/, viewShop],
    [/^#\/product\/(.+)$/, (m) => viewProduct(m[1])],
    [/^#\/cart$/, viewCart],
    [/^#\/login/, viewLogin],
    [/^#\/account$/, viewAccount],
    [/^#\/admin$/, viewAdminLogin],
    [/^#\/admin\/dashboard$/, viewAdminDashboard],
    [/^#\/admin\/products$/, viewAdminProducts],
    [/^#\/admin\/orders$/, viewAdminOrders],
    [/^#\/admin\/customers$/, viewAdminCustomers],
    [/^#\/admin\/content$/, viewAdminContent],
    [/^#\/admin\/appearance$/, viewAdminAppearance],
    [/^#\/admin\/messages$/, viewAdminMessages]
  ];

  async function router() {
    const hash = location.hash || '#/';
    // in-page anchors on the homepage
    if (hash === '#/about' || hash === '#/contact') {
      if (!document.getElementById('about')) await viewHome();
      const el = document.getElementById(hash.slice(2));
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    for (const [re, fn] of routes) {
      const m = re.exec(hash);
      if (m) {
        window.scrollTo(0, 0);
        try { await fn(m); } catch (e) { console.error(e); $('#app').innerHTML = `<main><div class="wrap" style="padding:120px 0"><h2>Something went wrong</h2><p style="color:var(--sage)">${esc(e.message)}</p><p><a class="btn btn-ghost" href="#/">Back to home</a></p></div></main>`; }
        return;
      }
    }
    location.hash = '#/';
  }

  window.addEventListener('hashchange', router);

  (async function start() {
    try { SETTINGS = (await api('/api/settings')).settings; } catch (e) { SETTINGS = {}; }
    applyAppearance();
    renderBanners();
    window.addEventListener('resize', () => {
      const h = document.getElementById('topBars');
      if (h) document.body.style.setProperty('--topbar-h', h.getBoundingClientRect().height + 'px');
    });
    await router();
  })();
})();
