/* =====================================================================
   Maison Lunar — storefront client.

   This file holds NO data and NO authority. Products, prices, sessions,
   orders and reviews all live on the server; this is only presentation.
   Reading this source tells an attacker nothing they could not already
   see by using the site normally — which is the point.
   ================================================================== */
(function () {
  'use strict';

  /* ------------------------------ state ----------------------------- */

  const state = {
    settings: {}, categories: [], products: [], cart: [], user: null, csrf: '',
    ready: false, adminLoaded: false
  };

  /* ---------------------------- API client -------------------------- */

  function csrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)ml_csrf=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : state.csrf;
  }

  async function api(path, body, opts) {
    const init = {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.headers['X-CSRF-Token'] = csrfToken();
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(path, init);
    } catch {
      throw new ApiError('Could not reach the server. Check your connection.', 0);
    }
    let data = {};
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) {
      if (res.status === 401 && state.user) { state.user = null; }
      throw new ApiError(data.error || 'Something went wrong.', res.status, data.field);
    }
    return data;
  }

  class ApiError extends Error {
    constructor(message, status, field) { super(message); this.status = status; this.field = field; }
  }

  async function hydrate() {
    const data = await api('/api/bootstrap');
    state.settings = data.settings || {};
    state.categories = data.categories || [];
    state.products = data.products || [];
    state.cart = data.cart || [];
    state.user = data.user || null;
    state.csrf = data.csrf || '';
    state.ready = true;
    applyTheme();
    await ensureAdminModule();
  }

  /** The admin bundle is only requested when the server says you are an
   *  admin — and the server returns 404 for it otherwise. */
  async function ensureAdminModule() {
    if (!state.user || !state.user.is_admin || state.adminLoaded) return;
    await new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = '/admin.js';
      s.onload = () => { state.adminLoaded = true; resolve(); };
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
  }

  /* ----------------------------- helpers ---------------------------- */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  const money = (c) => '£' + (Number(c || 0) / 100).toFixed(2);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));

  function fmtDate(v, opts) {
    if (!v) return '—';
    let s = String(v).trim().replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) s += 'Z';
    const d = new Date(s);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', opts || { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const priceFrom = (p) => Math.min(...((p.sizes && p.sizes.length ? p.sizes : [{ price_cents: 0 }]).map(s => s.price_cents)));
  const visibleProducts = () => state.products.filter(p => !p.hidden);
  const cartCount = () => state.cart.reduce((s, i) => s + i.qty, 0);
  const cartSubtotal = () => state.cart.reduce((s, i) => s + i.unit_price_cents * i.qty, 0);
  const isAdmin = () => !!(state.user && state.user.is_admin);

  const BOTTLE = `<svg class="ph-bottle" viewBox="0 0 160 220" xmlns="http://www.w3.org/2000/svg">
    <rect x="55" y="20" width="50" height="18" rx="3" fill="none" stroke-width="1.2"/>
    <rect x="63" y="10" width="34" height="12" rx="2"/>
    <path d="M55 38 L50 60 L50 195 Q50 205 60 205 L100 205 Q110 205 110 195 L110 60 L105 38 Z" fill="rgba(203,184,139,0.06)" stroke-width="1.2"/>
    <line x1="50" y1="90" x2="110" y2="90" stroke-width="0.6" opacity="0.5"/></svg>`;
  const MOON = `<svg class="moon-mark" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
  const img = (p, cls) => p.image_url ? `<img class="${cls || ''}" src="${esc(p.image_url)}" alt="${esc(p.name)}">` : BOTTLE;

  function stars(n, cls) {
    const r = Math.round(Number(n) || 0);
    return `<span class="stars ${cls || ''}" aria-label="${r} out of 5">${'★'.repeat(r)}<span class="dim">${'★'.repeat(5 - r)}</span></span>`;
  }

  function toast(msg, kind) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'show ' + (kind || 'success');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = ''; }, 3600);
  }

  function applyTheme() {
    const s = state.settings, r = document.documentElement.style;
    if (s.color_primary) r.setProperty('--moon', s.color_primary);
    if (s.color_secondary) r.setProperty('--g-500', s.color_secondary);
    if (s.color_background) r.setProperty('--g-950', s.color_background);
    document.title = (s.site_title || 'Maison Lunar') + ' — Eau de Parfum';
  }

  /* --------------------- admin inline edit affordance --------------- */

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

  /* ------------------------------ shell ----------------------------- */

  function storeShell(inner) {
    const s = state.settings;
    const user = state.user;
    const count = cartCount();
    return `
    ${isAdmin() ? `<div class="admin-bar">
      <span><strong>Admin mode</strong> — tap any <span class="plus-inline">+</span> to edit that item.</span>
      <span class="row-gap">
        <a href="#/admin/dashboard">Dashboard</a>
        <button id="adminSignOut">Sign out</button>
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
          <a href="#/login">Staff sign in</a>
        </div>
      </div>
    </footer>`;
  }

  /* ---------------------------- components -------------------------- */

  function productCard(p) {
    const badges = [p.is_bestseller ? '<span class="badge">Best Seller</span>' : '',
                    p.is_new_arrival ? '<span class="badge">New</span>' : ''].join('');
    const out = p.stock < 1;
    return `<div class="product-card glass">
      <div class="product-card-image">${img(p)}<div class="badge-row">${badges}</div>${edProduct(p.id)}</div>
      <div class="product-card-body">
        <div class="cat">${esc(p.category)}</div>
        <h3>${esc(p.name)}</h3>
        ${p.rating_count ? `<div class="card-rating">${stars(p.rating_avg)}<span class="muted xsmall">${p.rating_avg} (${p.rating_count})</span></div>` : ''}
        <p class="desc">${esc(p.short_description)}</p>
        <div class="price">From ${money(priceFrom(p))}</div>
        <div class="product-card-actions">
          <a class="btn btn-ghost" href="#/product/${esc(p.slug)}">View Details</a>
          <button class="btn btn-primary" data-add="${p.id}" ${out ? 'disabled' : ''}>${out ? 'Out of Stock' : 'Add to Cart'}</button>
        </div>
      </div></div>`;
  }

  /* ------------------------------ views ----------------------------- */

  function viewHome() {
    const s = state.settings;
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
                <div class="field" data-f="name"><label for="cName">Name</label><input id="cName" type="text" autocomplete="name"><div class="field-error">Please enter your name.</div></div>
                <div class="field" data-f="email"><label for="cEmail">Email</label><input id="cEmail" type="email" autocomplete="email"><div class="field-error">Please enter a valid email.</div></div>
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
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#contactStatus');
      const vals = {
        name: $('#cName').value.trim(), email: $('#cEmail').value.trim(),
        subject: $('#cSubject').value.trim(), message: $('#cMessage').value.trim(),
        website: $('#company').value
      };
      let ok = true;
      const mark = (f, isBad) => { const el = $(`[data-f="${f}"]`); if (el) el.classList.toggle('invalid', isBad); if (isBad) ok = false; };
      mark('name', !vals.name); mark('email', !validEmail(vals.email));
      mark('subject', !vals.subject); mark('message', !vals.message);
      if (!ok) { st.className = 'form-status error'; st.textContent = 'Please fix the highlighted fields.'; return; }

      const btn = $('#contactSubmit');
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        await api('/api/contact', vals);
        st.className = 'form-status success';
        st.textContent = 'Message sent. It is now in the studio inbox and we will reply by email.';
        form.reset();
      } catch (err) {
        st.className = 'form-status error';
        st.textContent = err.message;
      } finally {
        btn.disabled = false; btn.textContent = 'Send Message';
      }
    });
  }

  function viewShop(params) {
    const filter = params.get('f') || 'all';
    const q = (params.get('q') || '').toLowerCase();
    let list = visibleProducts();
    const catKeys = state.categories.map(c => c.key);
    if (catKeys.includes(filter)) list = list.filter(p => p.category === filter);
    else if (filter === 'bestseller') list = list.filter(p => p.is_bestseller);
    else if (filter === 'new') list = list.filter(p => p.is_new_arrival);
    if (q) list = list.filter(p => (p.name + ' ' + p.short_description + ' ' + (p.brand || '')).toLowerCase().includes(q));

    const chips = [['all', 'All'], ...state.categories.map(c => [c.key, c.label]), ['bestseller', 'Best Sellers'], ['new', 'New Arrivals']];
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
      const q = params.get('q');
      location.hash = '#/shop?f=' + c.dataset.filter + (q ? '&q=' + encodeURIComponent(q) : '');
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

  /* ---------------------------- product ----------------------------- */

  let productPage = null;   // { product, reviews, canReview, alreadyReviewed }

  async function viewProduct(slug) {
    try {
      productPage = await api('/api/product?slug=' + encodeURIComponent(slug));
    } catch {
      productPage = null;
      return storeShell(`<section><div class="wrap"><h2>Perfume not found</h2>
        <p class="muted">That perfume may have been removed. <a href="#/shop">Back to the shop</a>.</p></div></section>`);
    }
    const p = productPage.product;
    const related = visibleProducts().filter(x => x.category === p.category && x.id !== p.id).slice(0, 4);

    return storeShell(`
      <section class="page-head">
        <div class="wrap pd-grid">
          <div class="pd-image">${img(p)}</div>
          <div>
            <div class="pd-cat">${esc(p.brand ? p.brand + ' · ' : '')}${esc(p.category)}</div>
            <h1 class="pd-name">${esc(p.name)}</h1>
            ${p.rating_count
              ? `<a class="pd-rating" href="#reviews">${stars(p.rating_avg)}<span class="muted small">${p.rating_avg} out of 5 · ${p.rating_count} review${p.rating_count === 1 ? '' : 's'}</span></a>`
              : '<div class="pd-rating muted small">No reviews yet</div>'}
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

      <section id="reviews" class="band">
        <div class="wrap-narrow">
          <div class="section-head left">
            <div class="eyebrow">Reviews</div>
            <h2>What people say about ${esc(p.name)}</h2>
          </div>
          <div id="reviewWriter">${reviewWriter()}</div>
          <div id="reviewList">${reviewList(productPage.reviews)}</div>
        </div>
      </section>

      ${related.length ? `<section><div class="wrap">
        <div class="section-head"><div class="eyebrow">You May Also Like</div><h2>Related Perfumes</h2></div>
        <div class="product-grid">${related.map(productCard).join('')}</div></div></section>` : ''}`);
  }

  function reviewWriter() {
    const { canReview, alreadyReviewed, product } = productPage;
    if (!state.user) {
      return `<div class="review-gate glass">
        <p>Reviews come from customers who have bought the fragrance.
        <a href="#/login">Sign in</a> to leave yours.</p></div>`;
    }
    if (alreadyReviewed) {
      return `<div class="review-gate glass"><p>You have reviewed this fragrance. Your review is below — you can edit or remove it there.</p></div>`;
    }
    if (!canReview) {
      return `<div class="review-gate glass">
        <p>You can review <strong>${esc(product.name)}</strong> once you have ordered it. That keeps every review on this
        page a real, verified purchase.</p></div>`;
    }
    return reviewForm({ rating: 0, title: '', body: '' }, { productId: product.id });
  }

  function reviewForm(values, meta) {
    const id = meta.reviewId ? `data-review-id="${meta.reviewId}"` : '';
    return `<form class="review-form glass" id="reviewForm" ${id} data-product-id="${meta.productId}" novalidate>
      <h3>${meta.reviewId ? 'Edit your review' : 'Write a review'}</h3>
      <div class="field" data-f="rating">
        <label>Your rating</label>
        <div class="star-input" id="starInput" role="radiogroup" aria-label="Rating out of 5">
          ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="star-btn ${values.rating >= n ? 'on' : ''}" data-star="${n}"
            role="radio" aria-checked="${values.rating === n}" aria-label="${n} star${n === 1 ? '' : 's'}">★</button>`).join('')}
        </div>
        <input type="hidden" id="rvRating" value="${values.rating || 0}">
        <div class="field-error">Choose a rating.</div>
      </div>
      <div class="field" data-f="title"><label for="rvTitle">Headline <span class="muted xsmall">(optional)</span></label>
        <input id="rvTitle" type="text" maxlength="120" value="${esc(values.title)}" placeholder="Sums up how it wears"></div>
      <div class="field" data-f="body"><label for="rvBody">Your review</label>
        <textarea id="rvBody" maxlength="3000" placeholder="How does it open, how does it last, when do you wear it?">${esc(values.body)}</textarea>
        <div class="field-error">Write a few words.</div></div>
      <div class="row-gap">
        <button class="btn btn-primary" type="submit" id="rvSubmit">${meta.reviewId ? 'Save review' : 'Publish review'}</button>
        ${meta.reviewId ? '<button class="btn btn-ghost" type="button" id="rvCancel">Cancel</button>' : ''}
      </div>
      <div class="form-status" id="rvStatus"></div>
    </form>`;
  }

  function reviewList(reviews) {
    if (!reviews || !reviews.length) {
      return `<p class="empty-note">No reviews yet. If you have worn this one, yours would be the first.</p>`;
    }
    return `<div class="review-list">${reviews.map(r => `
      <article class="review glass ${r.status === 'hidden' ? 'is-hidden-review' : ''}">
        <div class="review-top">
          <div>
            ${stars(r.rating)}
            ${r.title ? `<h4>${esc(r.title)}</h4>` : ''}
          </div>
          <div class="review-meta">
            <span class="review-author">${esc(r.author)}</span>
            <span class="verified" title="Bought from Maison Lunar">✓ Verified purchase</span>
            <time>${fmtDate(r.created_at)}</time>
          </div>
        </div>
        <p>${esc(r.body).replace(/\n/g, '<br>')}</p>
        ${r.status === 'hidden' ? '<p class="xsmall muted">Hidden by the studio — only you and staff can see this.</p>' : ''}
        ${r.mine ? `<div class="review-actions">
          <button class="btn btn-ghost btn-sm" data-edit-review="${r.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete-review="${r.id}">Delete</button>
        </div>` : ''}
      </article>`).join('')}</div>`;
  }

  function bindProduct() {
    if (!productPage) return;
    const p = productPage.product;
    let size = p.sizes[0], qty = 1;

    $$('.size-chip').forEach(c => c.addEventListener('click', () => {
      $$('.size-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      size = { label: c.dataset.label, price_cents: +c.dataset.price };
      $('#pdPrice').textContent = money(size.price_cents);
    }));
    const minus = $('#qMinus'), plus = $('#qPlus');
    if (minus) minus.addEventListener('click', () => { qty = Math.max(1, qty - 1); $('#qVal').textContent = qty; });
    if (plus) plus.addEventListener('click', () => { qty = Math.min(20, qty + 1); $('#qVal').textContent = qty; });

    const add = $('#pdAdd');
    if (add) add.addEventListener('click', async () => {
      const st = $('#pdStatus');
      add.disabled = true;
      try {
        await addToCart(p.id, size.label, qty);
        st.className = 'form-status success';
        st.textContent = `Added ${qty} × ${p.name} (${size.label}) to your cart.`;
      } catch (err) {
        st.className = 'form-status error';
        st.textContent = err.message;
      } finally {
        add.disabled = p.stock < 1;
      }
    });

    bindReviewUi();
  }

  function bindReviewUi() {
    const form = $('#reviewForm');
    if (form) {
      const ratingInput = $('#rvRating');
      $$('.star-btn', form).forEach(b => b.addEventListener('click', () => {
        const n = +b.dataset.star;
        ratingInput.value = n;
        $$('.star-btn', form).forEach(x => {
          x.classList.toggle('on', +x.dataset.star <= n);
          x.setAttribute('aria-checked', +x.dataset.star === n);
        });
        $('[data-f="rating"]').classList.remove('invalid');
      }));

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const st = $('#rvStatus');
        const rating = +ratingInput.value;
        const body = $('#rvBody').value.trim();
        let ok = true;
        const mark = (f, isBad) => { const el = $(`[data-f="${f}"]`, form); if (el) el.classList.toggle('invalid', isBad); if (isBad) ok = false; };
        mark('rating', !rating); mark('body', body.length < 3);
        if (!ok) { st.className = 'form-status error'; st.textContent = 'Add a rating and a few words.'; return; }

        const btn = $('#rvSubmit');
        btn.disabled = true; btn.textContent = 'Saving…';
        const payload = { rating, title: $('#rvTitle').value.trim(), body };
        try {
          if (form.dataset.reviewId) {
            await api('/api/reviews/update', { id: +form.dataset.reviewId, ...payload });
            toast('Review updated.');
          } else {
            await api('/api/reviews', { product_id: +form.dataset.productId, ...payload });
            toast('Thanks — your review is live.');
          }
          await refreshProducts();
          render();
        } catch (err) {
          st.className = 'form-status error';
          st.textContent = err.message;
          btn.disabled = false;
          btn.textContent = form.dataset.reviewId ? 'Save review' : 'Publish review';
        }
      });

      const cancel = $('#rvCancel');
      if (cancel) cancel.addEventListener('click', () => render());
    }

    $$('[data-edit-review]').forEach(b => b.addEventListener('click', () => {
      const id = +b.dataset.editReview;
      const r = (productPage.reviews || []).find(x => x.id === id);
      if (!r) return;
      $('#reviewWriter').innerHTML = reviewForm(
        { rating: r.rating, title: r.title, body: r.body },
        { productId: productPage.product.id, reviewId: r.id }
      );
      bindReviewUi();
      $('#reviewForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));

    $$('[data-delete-review]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete your review? This cannot be undone.')) return;
      try {
        await api('/api/reviews/delete', { id: +b.dataset.deleteReview });
        toast('Review deleted.');
        await refreshProducts();
        render();
      } catch (err) { toast(err.message, 'error'); }
    }));
  }

  async function refreshProducts() {
    const data = await api('/api/products');
    state.products = data.products || [];
  }

  /* ------------------------------ cart ------------------------------ */

  async function addToCart(productId, sizeLabel, qty) {
    const data = await api('/api/cart/add', { product_id: productId, size_label: sizeLabel, qty: qty || 1 });
    state.cart = data.cart || [];
    updateCartBadge();
  }

  function updateCartBadge() {
    const link = $('.nav-cta');
    if (!link) return;
    const n = cartCount();
    link.innerHTML = 'Cart' + (n ? ` <span class="cart-count">${n}</span>` : '');
  }

  function viewCart() {
    if (!state.cart.length) {
      return storeShell(`<section class="page-head"><div class="wrap-narrow">
        <div class="empty-state glass">
          <div class="eyebrow">Your Basket</div>
          <h3>Nothing in here yet</h3>
          <p class="muted">Your basket is empty. The collection is a good place to start.</p>
          <a class="btn btn-primary" href="#/shop">Browse the Collection</a>
        </div></div></section>`);
    }
    const subtotal = cartSubtotal();
    return storeShell(`
      <section class="page-head">
        <div class="wrap cart-grid">
          <div>
            <div class="section-head left"><div class="eyebrow">Your Basket</div><h1>Review Your Order</h1></div>
            <div class="cart-items">
              ${state.cart.map(i => `<div class="cart-item">
                <div class="cart-item-img">${i.image_url ? `<img src="${esc(i.image_url)}" alt="${esc(i.product_name)}">` : BOTTLE}</div>
                <div>
                  <div class="cart-item-name">${esc(i.product_name)}</div>
                  <div class="cart-item-meta">${esc(i.size_label)} · ${money(i.unit_price_cents)} each</div>
                  <button class="cart-remove" data-remove="${i.id}">Remove</button>
                </div>
                <div class="qty-control">
                  <button data-q="-1" data-id="${i.id}" aria-label="Decrease quantity">−</button>
                  <span>${i.qty}</span>
                  <button data-q="1" data-id="${i.id}" aria-label="Increase quantity">+</button>
                </div>
                <div class="cart-item-price">${money(i.unit_price_cents * i.qty)}</div>
              </div>`).join('')}
            </div>
          </div>
          <aside class="cart-summary glass">
            <h3 class="mini-label">Summary</h3>
            <div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
            <div class="summary-row"><span>Shipping</span><span>Calculated at dispatch</span></div>
            <div class="summary-row total"><span>Total</span><span>${money(subtotal)}</span></div>
            <button class="btn btn-primary btn-full mt20" id="checkoutToggle">Checkout</button>

            <form id="checkoutForm" class="hidden mt20" novalidate>
              <h4 class="mini-label">Delivery</h4>
              <div class="field" data-f="coName"><label for="coName">Full name</label><input id="coName" type="text" autocomplete="name" value="${esc(state.user ? state.user.full_name : '')}"><div class="field-error">Enter a name.</div></div>
              <div class="field" data-f="coEmail"><label for="coEmail">Email</label><input id="coEmail" type="email" autocomplete="email" value="${esc(state.user ? state.user.email : '')}"><div class="field-error">Enter a valid email.</div></div>
              <div class="field" data-f="coAddr"><label for="coAddr">Delivery address</label><textarea id="coAddr" autocomplete="street-address"></textarea><div class="field-error">Enter an address.</div></div>

              <h4 class="mini-label mt20">Payment</h4>
              <div class="field" data-f="ccName"><label for="ccName">Name on card</label><input id="ccName" type="text" autocomplete="cc-name"><div class="field-error">Enter the name on the card.</div></div>
              <div class="field" data-f="ccNum"><label for="ccNum">Card number <span class="brand-out" id="brandOut"></span></label>
                <input id="ccNum" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000"><div class="field-error">Enter a valid card number.</div></div>
              <div class="field-row">
                <div class="field" data-f="ccExp"><label for="ccExp">Expiry</label><input id="ccExp" type="text" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY"><div class="field-error">Use MM/YY.</div></div>
                <div class="field" data-f="ccCvc"><label for="ccCvc">CVC</label><input id="ccCvc" type="text" inputmode="numeric" autocomplete="cc-csc" placeholder="123"><div class="field-error">3 or 4 digits.</div></div>
              </div>
              <p class="xsmall muted">Card details are checked, then discarded. Only the brand and last four digits are kept with your order — never the full number or the CVC.</p>
              <button class="btn btn-primary btn-full mt14" id="placeOrder" type="submit">Place Order</button>
              <div class="form-status" id="coStatus"></div>
            </form>
          </aside>
        </div>
      </section>`);
  }

  function bindCart() {
    $$('[data-q]').forEach(b => b.addEventListener('click', async () => {
      const item = state.cart.find(i => i.id === +b.dataset.id);
      if (!item) return;
      const next = item.qty + +b.dataset.q;
      try {
        const data = await api('/api/cart/update', { id: item.id, qty: Math.max(0, next) });
        state.cart = data.cart || [];
        render();
      } catch (err) { toast(err.message, 'error'); }
    }));

    $$('[data-remove]').forEach(b => b.addEventListener('click', async () => {
      try {
        const data = await api('/api/cart/remove', { id: +b.dataset.remove });
        state.cart = data.cart || [];
        render();
      } catch (err) { toast(err.message, 'error'); }
    }));

    const toggle = $('#checkoutToggle');
    if (toggle) toggle.addEventListener('click', () => {
      $('#checkoutForm').classList.toggle('hidden');
      $('#coName').focus();
    });

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
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#coStatus');
      st.className = 'form-status'; st.textContent = '';

      const payload = {
        customer_name: $('#coName').value.trim(),
        customer_email: $('#coEmail').value.trim(),
        shipping_address: $('#coAddr').value.trim(),
        card_number: ccNum.value.replace(/\D/g, ''),
        card_expiry: ccExp.value,
        card_cvc: ccCvc.value
      };

      let ok = true;
      const mark = (f, isBad) => { const el = $(`[data-f="${f}"]`); if (el) el.classList.toggle('invalid', isBad); if (isBad) ok = false; };
      mark('coName', !payload.customer_name);
      mark('coEmail', !validEmail(payload.customer_email));
      mark('coAddr', !payload.shipping_address);
      mark('ccNum', !luhn(payload.card_number));
      mark('ccName', !$('#ccName').value.trim());
      mark('ccExp', !/^\d{2}\/\d{2}$/.test(payload.card_expiry));
      mark('ccCvc', !/^\d{3,4}$/.test(payload.card_cvc));
      if (!ok) { st.className = 'form-status error'; st.textContent = 'Please fix the highlighted fields.'; return; }

      const btn = $('#placeOrder');
      btn.disabled = true; btn.textContent = 'Processing…';
      try {
        const res = await api('/api/checkout', payload);
        state.cart = [];
        await refreshProducts();
        toast('Order ' + res.order_number + ' placed.');
        location.hash = '#/order/' + res.order_number;
      } catch (err) {
        st.className = 'form-status error';
        st.textContent = err.message;
        if (err.field) { const el = $(`[data-f="${err.field.replace('customer_', 'co').replace('shipping_address', 'coAddr').replace('card_number', 'ccNum').replace('card_expiry', 'ccExp').replace('card_cvc', 'ccCvc')}"]`); if (el) el.classList.add('invalid'); }
        btn.disabled = false; btn.textContent = 'Place Order';
      }
    });
  }

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
    if (/^6(011|5)/.test(d)) return 'Discover';
    return d ? 'Card' : '';
  }

  /* -------------------------- order receipt ------------------------- */

  async function viewOrderConfirm(orderNumber) {
    let o;
    try {
      const data = await api('/api/order?number=' + encodeURIComponent(orderNumber));
      o = data.order;
    } catch (err) {
      return storeShell(`<section class="page-head"><div class="wrap-narrow">
        <h2>Order not available</h2><p class="muted">${esc(err.message)} <a href="#/shop">Back to the shop</a>.</p>
      </div></section>`);
    }
    return storeShell(`<section class="page-head"><div class="wrap-narrow">
      <div class="glass confirm-card">
        <div class="confirm-tick">✓</div>
        <h1>Thank you, ${esc(String(o.customer_name).split(' ')[0])}</h1>
        <p class="muted">Your order is confirmed and saved to your account. A copy is on its way to
          <strong>${esc(o.customer_email)}</strong>.</p>
        <div class="confirm-num">Order ${esc(o.order_number)}</div>
        <div class="confirm-items">
          ${o.items.map(i => `<div class="confirm-row"><span>${esc(i.product_name)} · ${esc(i.size_label)} × ${i.qty}</span>
            <span>${money(i.unit_price_cents * i.qty)}</span></div>`).join('')}
          <div class="confirm-row total"><span>Total</span><span>${money(o.total_cents)}</span></div>
        </div>
        ${o.pay_last4 ? `<p class="muted small">Paid with ${esc(o.pay_brand)} ending ${esc(o.pay_last4)}.</p>` : ''}
        <p class="muted small">Delivering to: ${esc(o.shipping_address || 'No address given')}</p>
        <div class="confirm-actions">
          <a class="btn btn-primary" href="#/shop">Continue Shopping</a>
          ${state.user
            ? '<a class="btn btn-ghost" href="#/account">View my orders</a>'
            : '<a class="btn btn-ghost" href="#/login">Create an account to review it</a>'}
        </div>
      </div></div></section>`);
  }

  /* ------------------------------ auth ------------------------------ */

  function viewLogin() {
    return storeShell(`<div class="auth-wrap">
      <div class="auth-tabs"><div class="auth-tab active" data-tab="login">Login</div><div class="auth-tab" data-tab="signup">Sign Up</div></div>
      <div class="auth-card glass">
        <div class="auth-panel active" id="panel-login">
          <form id="loginForm" novalidate>
            <div class="field" data-f="lemail"><label for="lEmail">Email address</label><input id="lEmail" type="email" autocomplete="email"><div class="field-error">Enter a valid email.</div></div>
            <div class="field" data-f="lpw"><label for="lPw">Password</label>
              <div class="password-field"><input id="lPw" type="password" autocomplete="current-password"><button type="button" class="password-toggle" data-target="lPw">Show</button></div>
              <div class="field-error">Enter your password.</div></div>
            <button class="btn btn-primary btn-full mt14" type="submit" id="loginBtn">Sign In</button>
            <div class="form-status" id="loginStatus"></div>
          </form>
        </div>
        <div class="auth-panel" id="panel-signup">
          <form id="signupForm" novalidate>
            <div class="field" data-f="sname"><label for="sName">Full name</label><input id="sName" type="text" autocomplete="name"><div class="field-error">Enter your name.</div></div>
            <div class="field" data-f="semail"><label for="sEmail">Email address</label><input id="sEmail" type="email" autocomplete="email"><div class="field-error">Enter a valid email.</div></div>
            <div class="field" data-f="spw"><label for="sPw">Password</label>
              <div class="password-field"><input id="sPw" type="password" autocomplete="new-password"><button type="button" class="password-toggle" data-target="sPw">Show</button></div>
              <div class="field-error">At least 8 characters, with a letter and a number.</div></div>
            <button class="btn btn-primary btn-full mt14" type="submit" id="signupBtn">Create Account</button>
            <div class="form-status" id="signupStatus"></div>
          </form>
        </div>
      </div>
      <p class="center muted xsmall mt20">Staff sign in with the same form — the studio dashboard appears automatically.</p>
    </div>`);
  }

  function bindLogin() {
    $$('.auth-tab').forEach(t => t.addEventListener('click', () => {
      $$('.auth-tab').forEach(x => x.classList.remove('active'));
      $$('.auth-panel').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      $('#panel-' + t.dataset.tab).classList.add('active');
    }));
    $$('.password-toggle').forEach(b => b.addEventListener('click', () => {
      const input = $('#' + b.dataset.target);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.textContent = show ? 'Hide' : 'Show';
    }));

    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#loginStatus');
      const email = $('#lEmail').value.trim(), pw = $('#lPw').value;
      let ok = true;
      const mark = (f, isBad) => { const el = $(`[data-f="${f}"]`); el.classList.toggle('invalid', isBad); if (isBad) ok = false; };
      mark('lemail', !validEmail(email)); mark('lpw', !pw);
      if (!ok) { st.className = 'form-status error'; st.textContent = 'Check your email and password.'; return; }

      const btn = $('#loginBtn');
      btn.disabled = true; btn.textContent = 'Signing in…';
      try {
        const res = await api('/api/auth/login', { email, password: pw });
        state.user = res.user;
        state.cart = res.cart || [];
        await ensureAdminModule();
        toast('Signed in as ' + res.user.full_name + '.');
        location.hash = res.user.is_admin ? '#/admin/dashboard' : '#/account';
      } catch (err) {
        st.className = 'form-status error';
        st.textContent = err.message;
        btn.disabled = false; btn.textContent = 'Sign In';
      }
    });

    $('#signupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#signupStatus');
      const name = $('#sName').value.trim(), email = $('#sEmail').value.trim(), pw = $('#sPw').value;
      let ok = true;
      const mark = (f, isBad) => { const el = $(`[data-f="${f}"]`); el.classList.toggle('invalid', isBad); if (isBad) ok = false; };
      mark('sname', name.length < 2);
      mark('semail', !validEmail(email));
      mark('spw', !(pw.length >= 8 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw)));
      if (!ok) { st.className = 'form-status error'; st.textContent = 'Please fix the highlighted fields.'; return; }

      const btn = $('#signupBtn');
      btn.disabled = true; btn.textContent = 'Creating…';
      try {
        const res = await api('/api/auth/register', { full_name: name, email, password: pw });
        state.user = res.user;
        state.cart = res.cart || [];
        toast('Welcome to Maison Lunar.');
        location.hash = '#/account';
      } catch (err) {
        st.className = 'form-status error';
        st.textContent = err.message;
        if (err.field) { const el = $(`[data-f="s${err.field.replace('full_name', 'name').replace('password', 'pw').replace('email', 'email')}"]`); if (el) el.classList.add('invalid'); }
        btn.disabled = false; btn.textContent = 'Create Account';
      }
    });
  }

  /* ----------------------------- account ---------------------------- */

  async function viewAccount() {
    if (!state.user) { location.hash = '#/login'; return ''; }
    let orders = [];
    try { orders = (await api('/api/orders')).orders || []; }
    catch { orders = []; }

    const spent = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total_cents, 0);
    const toReview = orders.flatMap(o => (o.reviewable || []).map(r => ({ ...r, order_number: o.order_number })));
    const seen = new Set();
    const uniqueToReview = toReview.filter(r => !seen.has(r.product_id) && seen.add(r.product_id));

    return storeShell(`
      <section class="page-head">
        <div class="wrap">
          <div class="section-head left">
            <div class="eyebrow">Your Account</div>
            <h1>Hello, ${esc(String(state.user.full_name).split(' ')[0])}</h1>
            <p class="muted">${esc(state.user.email)}</p>
          </div>

          <div class="stat-grid stat-grid-3">
            <div class="stat-card glass"><div class="label">Orders</div><div class="value">${orders.length}</div></div>
            <div class="stat-card glass"><div class="label">Total spent</div><div class="value">${money(spent)}</div></div>
            <div class="stat-card glass"><div class="label">Awaiting your review</div><div class="value">${uniqueToReview.length}</div></div>
          </div>

          ${uniqueToReview.length ? `
          <div class="section-head left mt26"><h2>Review what you have worn</h2>
            <p class="muted">You have bought these. Tell people how they wear.</p></div>
          <div class="to-review">
            ${uniqueToReview.map(r => `<a class="to-review-item glass" href="#/product/${esc(r.slug)}#reviews">
              <span>${esc(r.product_name)}</span>
              <span class="btn btn-primary btn-sm">Write a review</span>
            </a>`).join('')}
          </div>` : ''}

          <div class="section-head left mt26"><h2>Order history</h2></div>
          ${orders.length ? `<div class="order-list">
            ${orders.map(o => `<div class="order-card glass">
              <div class="order-head">
                <div><strong>${esc(o.order_number)}</strong><div class="muted small">${fmtDate(o.created_at)}</div></div>
                <div class="row-gap">
                  <span class="status-pill ${esc(o.status)}">${esc(o.status)}</span>
                  <strong>${money(o.total_cents)}</strong>
                </div>
              </div>
              <div class="order-items">
                ${o.items.map(i => `<div class="confirm-row">
                  <span>${i.slug ? `<a href="#/product/${esc(i.slug)}">${esc(i.product_name)}</a>` : esc(i.product_name)} · ${esc(i.size_label)} × ${i.qty}</span>
                  <span>${money(i.unit_price_cents * i.qty)}</span></div>`).join('')}
              </div>
              ${o.pay_last4 ? `<div class="muted xsmall">${esc(o.pay_brand)} ending ${esc(o.pay_last4)} · ${esc(o.shipping_address)}</div>` : ''}
            </div>`).join('')}
          </div>` : `<p class="empty-note">No orders yet. <a href="#/shop">Find something to wear</a>.</p>`}

          <div class="section-head left mt26"><h2>Password</h2></div>
          <form id="pwForm" class="glass pad30 account-form" novalidate>
            <div class="field" data-f="curpw"><label for="curPw">Current password</label>
              <input id="curPw" type="password" autocomplete="current-password"><div class="field-error">Enter your current password.</div></div>
            <div class="field" data-f="newpw"><label for="newPw">New password</label>
              <input id="newPw" type="password" autocomplete="new-password"><div class="field-error">At least 8 characters, with a letter and a number.</div></div>
            <button class="btn btn-primary" type="submit" id="pwBtn">Change password</button>
            <div class="form-status" id="pwStatus"></div>
          </form>

          <div class="mt26"><button class="btn btn-ghost" id="logoutBtn">Sign out</button></div>
        </div>
      </section>`);
  }

  function bindAccount() {
    const logout = $('#logoutBtn');
    if (logout) logout.addEventListener('click', async () => {
      try { await api('/api/auth/logout', {}); } catch {}
      state.user = null; state.cart = []; state.adminLoaded = false;
      toast('Signed out.');
      location.hash = '#/';
      await hydrate();
      render();
    });

    const form = $('#pwForm');
    if (form) form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#pwStatus');
      const cur = $('#curPw').value, next = $('#newPw').value;
      let ok = true;
      const mark = (f, isBad) => { const el = $(`[data-f="${f}"]`); el.classList.toggle('invalid', isBad); if (isBad) ok = false; };
      mark('curpw', !cur);
      mark('newpw', !(next.length >= 8 && /[A-Za-z]/.test(next) && /[0-9]/.test(next)));
      if (!ok) { st.className = 'form-status error'; st.textContent = 'Please fix the highlighted fields.'; return; }

      const btn = $('#pwBtn');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        await api('/api/auth/password', { current_password: cur, new_password: next });
        st.className = 'form-status success';
        st.textContent = 'Password changed. Any other devices have been signed out.';
        form.reset();
      } catch (err) {
        st.className = 'form-status error';
        st.textContent = err.message;
      } finally {
        btn.disabled = false; btn.textContent = 'Change password';
      }
    });
  }

  /* ------------------------------ modal ----------------------------- */

  function showModal(inner, bind) {
    closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'modal-overlay open';
    wrap.id = 'modalBackdrop';
    wrap.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true">${inner}</div>`;
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(); });
    document.addEventListener('keydown', escClose);
    if (bind) bind();
    const first = wrap.querySelector('input, textarea, select, button');
    if (first) first.focus();
  }
  function escClose(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() {
    const m = $('#modalBackdrop');
    if (m) m.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', escClose);
  }

  /* ------------------ admin inline settings editing ------------------ */

  function openEditor(field, multiline) {
    const value = state.settings[field] || '';
    showModal(`
      <h2>Edit ${esc(field.replace(/_/g, ' '))}</h2>
      <div class="field">
        ${multiline
          ? `<textarea id="edValue" rows="6">${esc(value)}</textarea>`
          : `<input id="edValue" type="text" value="${esc(value)}">`}
      </div>
      <div class="row-gap justify-center mt14">
        <button class="btn btn-primary" id="edSave">Save</button>
        <button class="btn btn-ghost" id="edCancel">Cancel</button>
      </div>
      <div class="form-status" id="edStatus"></div>`, () => {
      $('#edCancel').addEventListener('click', closeModal);
      $('#edSave').addEventListener('click', async () => {
        const st = $('#edStatus');
        const btn = $('#edSave');
        btn.disabled = true; btn.textContent = 'Saving…';
        try {
          const res = await api('/api/admin/settings', { settings: { [field]: $('#edValue').value } });
          state.settings = res.settings;
          applyTheme();
          closeModal();
          toast('Saved.');
          render();
        } catch (err) {
          st.className = 'form-status error'; st.textContent = err.message;
          btn.disabled = false; btn.textContent = 'Save';
        }
      });
    });
  }

  function openTestimonialEditor(index) {
    const list = (state.settings.testimonials || []).slice();
    const isNew = index === 'new';
    const t = isNew ? { name: '', role: '', quote: '' } : (list[+index] || { name: '', role: '', quote: '' });
    showModal(`
      <h2>${isNew ? 'Add' : 'Edit'} testimonial</h2>
      <div class="field"><label for="tName">Name</label><input id="tName" type="text" value="${esc(t.name)}"></div>
      <div class="field"><label for="tRole">Role or context</label><input id="tRole" type="text" value="${esc(t.role)}"></div>
      <div class="field"><label for="tQuote">Quote</label><textarea id="tQuote" rows="4">${esc(t.quote)}</textarea></div>
      <div class="row-gap justify-center mt14">
        <button class="btn btn-primary" id="tSave">Save</button>
        ${isNew ? '' : '<button class="btn btn-danger" id="tDelete">Delete</button>'}
        <button class="btn btn-ghost" id="tCancel">Cancel</button>
      </div>
      <div class="form-status" id="tStatus"></div>`, () => {
      $('#tCancel').addEventListener('click', closeModal);

      const save = async (nextList) => {
        const st = $('#tStatus');
        try {
          const res = await api('/api/admin/settings', { testimonials: nextList });
          state.settings = res.settings;
          closeModal(); toast('Saved.'); render();
        } catch (err) { st.className = 'form-status error'; st.textContent = err.message; }
      };

      $('#tSave').addEventListener('click', () => {
        const entry = { name: $('#tName').value.trim(), role: $('#tRole').value.trim(), quote: $('#tQuote').value.trim() };
        if (!entry.quote) { const st = $('#tStatus'); st.className = 'form-status error'; st.textContent = 'A testimonial needs a quote.'; return; }
        const next = list.slice();
        if (isNew) next.push(entry); else next[+index] = entry;
        save(next);
      });

      const del = $('#tDelete');
      if (del) del.addEventListener('click', () => {
        const next = list.slice();
        next.splice(+index, 1);
        save(next);
      });
    });
  }

  function bindAdminInline() {
    if (!isAdmin()) return;
    $$('[data-ed]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      openEditor(b.dataset.ed, b.dataset.ml === '1');
    }));
    $$('[data-ed-testi]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      openTestimonialEditor(b.dataset.edTesti);
    }));
    if (window.ML && window.ML.admin && window.ML.admin.bindInlineProduct) {
      window.ML.admin.bindInlineProduct();
    }
    const signOut = $('#adminSignOut');
    if (signOut) signOut.addEventListener('click', async () => {
      try { await api('/api/auth/logout', {}); } catch {}
      state.user = null; state.cart = []; state.adminLoaded = false;
      location.hash = '#/';
      await hydrate();
      render();
    });
  }

  /* ---------------------------- store chrome ------------------------ */

  function bindStoreChrome() {
    const toggle = $('#navToggle'), links = $('#navLinks');
    if (toggle && links) toggle.addEventListener('click', () => links.classList.toggle('open'));

    $$('[data-add]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await addToCart(+b.dataset.add, null, 1);
        toast('Added to your cart.');
      } catch (err) {
        toast(err.message, 'error');
      } finally { b.disabled = false; }
    }));
  }

  /* ------------------------------ router ---------------------------- */

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [pathPart, queryPart] = raw.split('?');
    return { path: pathPart.split('#')[0] || '/', params: new URLSearchParams(queryPart || '') };
  }

  let rendering = false;

  async function render() {
    if (rendering) return;
    rendering = true;
    const app = $('#app');
    try {
      const { path, params } = parseHash();

      if (path.startsWith('/admin')) {
        if (!isAdmin()) {
          app.innerHTML = storeShell(`<section class="page-head"><div class="wrap-narrow center">
            <div class="eyebrow">Studio</div><h1>Staff sign in</h1>
            <p class="muted mt14">This area is for Maison Lunar staff. Sign in with your studio account.</p>
            <div class="mt26"><a class="btn btn-primary" href="#/login">Go to sign in</a></div>
          </div></section>`);
          bindStoreChrome();
          return;
        }
        await ensureAdminModule();
        if (window.ML && window.ML.admin) {
          await window.ML.admin.render(path, params);
          return;
        }
      }

      let html = '';
      let after = null;

      if (path === '/' || path === '/about' || path === '/contact') {
        html = viewHome(); after = bindHome;
      } else if (path === '/shop') {
        html = viewShop(params); after = () => bindShop(params);
      } else if (path.startsWith('/product/')) {
        html = await viewProduct(decodeURIComponent(path.slice('/product/'.length)));
        after = bindProduct;
      } else if (path === '/cart') {
        html = viewCart(); after = bindCart;
      } else if (path.startsWith('/order/')) {
        html = await viewOrderConfirm(decodeURIComponent(path.slice('/order/'.length)));
      } else if (path === '/login') {
        if (state.user) { location.hash = '#/account'; return; }
        html = viewLogin(); after = bindLogin;
      } else if (path === '/account') {
        html = await viewAccount();
        if (!html) return;
        after = bindAccount;
      } else {
        html = storeShell(`<section class="page-head"><div class="wrap-narrow center">
          <div class="eyebrow">404</div><h1>Page not found</h1>
          <p class="muted mt14">That page does not exist. <a href="#/shop">Browse the collection</a>.</p>
        </div></section>`);
      }

      app.innerHTML = html;
      bindStoreChrome();
      bindAdminInline();
      if (after) after();

      if (path === '/about') { const el = $('#about'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
      else if (path === '/contact') { const el = $('#contact'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
      else if (location.hash.includes('#reviews')) { const el = $('#reviews'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
      else window.scrollTo(0, 0);
    } finally {
      rendering = false;
    }
  }

  /* ------------------------------- boot ----------------------------- */

  window.ML = {
    state, api, render, toast, esc, money, fmtDate, stars, $, $$,
    storeShell, showModal, closeModal, hydrate, refreshProducts, applyTheme,
    validEmail, MOON, BOTTLE, img, priceFrom
  };

  window.addEventListener('hashchange', render);

  (async function boot() {
    const app = $('#app');
    try {
      await hydrate();
    } catch (err) {
      app.innerHTML = `<div class="boot-error">
        <h1>Maison Lunar</h1>
        <p>The site could not reach its server. If you are running this locally, start it with
        <code>node server.js</code> and reload.</p>
        <p class="muted small">${esc(err.message)}</p></div>`;
      return;
    }
    await render();
  })();
})();
