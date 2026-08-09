/* =====================================================================
   Maison Lunar — studio dashboard.

   The server returns 404 for this file unless the request carries an
   admin session cookie, so a normal visitor never receives this code.
   That is a convenience, not the security boundary: every endpoint it
   calls re-checks admin rights server-side on every single request.
   ================================================================== */
(function () {
  'use strict';

  const ML = window.ML;
  const { state, api, esc, money, fmtDate, stars, $, $$, toast, showModal, closeModal } = ML;

  const NAV = [
    ['#/admin/dashboard', 'Dashboard'],
    ['#/admin/products', 'Perfumes'],
    ['#/admin/stock', 'Stock'],
    ['#/admin/orders', 'Orders'],
    ['#/admin/reviews', 'Reviews'],
    ['#/admin/customers', 'Customers'],
    ['#/admin/categories', 'Categories'],
    ['#/admin/content', 'Homepage & Content'],
    ['#/admin/appearance', 'Website Settings'],
    ['#/admin/messages', 'Messages']
  ];

  function shell(title, inner, active) {
    const u = state.user || {};
    return `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <div class="admin-brand">${ML.MOON}<span>${esc(state.settings.logo_text || 'MAISON LUNAR')}</span></div>
        <nav class="admin-nav">
          ${NAV.map(([h, l]) => `<a href="${h}" class="${h === active ? 'active' : ''}">${esc(l)}</a>`).join('')}
          <div class="divider"></div>
          <a href="#/">View site ↗</a>
          <button id="adminLogout">Sign out</button>
        </nav>
      </aside>
      <main class="admin-main">
        <div class="admin-topbar"><h1>${esc(title)}</h1><div class="who">${esc(u.full_name || '')} · ${esc(u.email || '')}</div></div>
        ${inner}
      </main>
    </div>`;
  }

  function statusPill(s) { return `<span class="status-pill ${esc(s)}">${esc(s)}</span>`; }

  /* --------------------------- dashboard ---------------------------- */

  async function viewDashboard() {
    const data = await api('/api/admin/overview');
    const s = data.stats;
    return shell('Dashboard', `
      <div class="stat-grid">
        <div class="stat-card glass"><div class="label">Revenue</div><div class="value">${money(s.revenue_cents)}</div></div>
        <div class="stat-card glass"><div class="label">Orders</div><div class="value">${s.orders}</div></div>
        <div class="stat-card glass"><div class="label">Customers</div><div class="value">${s.customers}</div></div>
        <div class="stat-card glass"><div class="label">Reviews</div><div class="value">${s.reviews}</div></div>
      </div>

      ${s.low_stock.length ? `<div class="admin-card glass">
        <h2>Running low</h2>
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Perfume</th><th>Stock</th><th></th></tr></thead>
          <tbody>${s.low_stock.map(p => `<tr>
            <td>${esc(p.name)}</td><td>${p.stock}</td>
            <td><a class="btn-icon" href="#/admin/stock">Restock</a></td></tr>`).join('')}</tbody>
        </table></div>
      </div>` : ''}

      <div class="admin-card glass">
        <h2>Recent orders</h2>
        ${data.recent_orders.length ? `<div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>${data.recent_orders.map(o => `<tr>
            <td>${esc(o.order_number)}</td>
            <td>${esc(o.customer_name)}<div class="muted xsmall">${esc(o.customer_email)}</div></td>
            <td>${fmtDate(o.created_at)}</td>
            <td>${money(o.total_cents)}</td>
            <td>${statusPill(o.status)}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="empty-state">No orders yet. They will appear here the moment one is placed.</p>'}
      </div>

      <div class="admin-card glass">
        <h2>Inbox</h2>
        <p class="muted">${s.unread_messages} unread message${s.unread_messages === 1 ? '' : 's'}.
          <a href="#/admin/messages">Open the inbox</a>.</p>
      </div>`, '#/admin/dashboard');
  }

  /* ---------------------------- perfumes ---------------------------- */

  let adminProducts = [];

  async function viewProducts() {
    adminProducts = (await api('/api/admin/products')).products;
    return shell('Perfumes', `
      <div class="admin-card glass">
        <div class="row-gap" style="justify-content:space-between">
          <h2>All perfumes (${adminProducts.length})</h2>
          <button class="btn btn-primary btn-sm" id="newProduct">Add perfume</button>
        </div>
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Name</th><th>Category</th><th>Sizes</th><th>Stock</th><th>Rating</th><th>Flags</th><th></th></tr></thead>
          <tbody>${adminProducts.map(p => `<tr>
            <td><strong>${esc(p.name)}</strong><div class="muted xsmall">${esc(p.slug)}</div></td>
            <td>${esc(p.category)}</td>
            <td>${p.sizes.map(s => `${esc(s.label)} ${money(s.price_cents)}`).join('<br>')}</td>
            <td>${p.stock}</td>
            <td>${p.rating_count ? `${stars(p.rating_avg)} <span class="muted xsmall">(${p.rating_count})</span>` : '<span class="muted xsmall">—</span>'}</td>
            <td class="xsmall muted">${[p.is_featured && 'Featured', p.is_bestseller && 'Best seller', p.is_new_arrival && 'New', p.hidden && 'Hidden'].filter(Boolean).join(', ') || '—'}</td>
            <td class="nowrap">
              <button class="btn-icon" data-edit="${p.id}">Edit</button>
              <button class="btn-icon" data-del="${p.id}">Delete</button>
            </td></tr>`).join('')}</tbody>
        </table></div>
      </div>`, '#/admin/products');
  }

  function bindProducts() {
    const nb = $('#newProduct');
    if (nb) nb.addEventListener('click', () => openProductEditor(null));
    $$('[data-edit]').forEach(b => b.addEventListener('click', () => openProductEditor(+b.dataset.edit)));
    $$('[data-del]').forEach(b => b.addEventListener('click', async () => {
      const p = adminProducts.find(x => x.id === +b.dataset.del);
      if (!p) return;
      if (!confirm(`Delete "${p.name}"? Orders keep their record, but the product page goes away.`)) return;
      try {
        await api('/api/admin/products/delete', { id: p.id });
        await ML.refreshProducts();
        toast('Perfume deleted.');
        ML.render();
      } catch (err) { toast(err.message, 'error'); }
    }));
  }

  function openProductEditor(id) {
    const p = id ? (adminProducts.find(x => x.id === id) || state.products.find(x => x.id === id)) : null;
    const blank = { name: '', category: state.categories[0] ? state.categories[0].key : 'unisex', brand: 'Maison Lunar',
      short_description: '', description: '', top_notes: '', middle_notes: '', base_notes: '',
      image_url: '', sizes: [{ label: '50ml', price_cents: 0 }], stock: 0,
      is_featured: 0, is_bestseller: 0, is_new_arrival: 0, hidden: 0 };
    const v = p || blank;

    showModal(`
      <h2>${p ? 'Edit perfume' : 'Add a perfume'}</h2>
      <div class="field"><label for="pName">Name</label><input id="pName" type="text" value="${esc(v.name)}"></div>
      <div class="field-row">
        <div class="field"><label for="pCat">Category</label>
          <select id="pCat">${state.categories.map(c => `<option value="${esc(c.key)}" ${c.key === v.category ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
        <div class="field"><label for="pStock">Stock</label><input id="pStock" type="number" min="0" value="${v.stock}"></div>
      </div>
      <div class="field"><label for="pShort">Short description</label><input id="pShort" type="text" value="${esc(v.short_description)}"></div>
      <div class="field"><label for="pDesc">Full description</label><textarea id="pDesc" rows="3">${esc(v.description)}</textarea></div>
      <div class="field-row">
        <div class="field"><label for="pTop">Top notes</label><input id="pTop" type="text" value="${esc(v.top_notes)}"></div>
        <div class="field"><label for="pMid">Heart notes</label><input id="pMid" type="text" value="${esc(v.middle_notes)}"></div>
      </div>
      <div class="field"><label for="pBase">Base notes</label><input id="pBase" type="text" value="${esc(v.base_notes)}"></div>
      <div class="field"><label for="pImg">Image URL <span class="muted xsmall">(https:// — leave blank for the drawn bottle)</span></label>
        <input id="pImg" type="text" value="${esc(v.image_url)}" placeholder="https://…"></div>

      <label class="mini-label">Sizes and prices</label>
      <div id="sizeRows">${v.sizes.map((s, i) => sizeRow(s, i)).join('')}</div>
      <button class="btn-icon mt10" id="addSize" type="button">Add another size</button>

      <div class="toggle-row mt20">
        <label><input type="checkbox" id="pFeat" ${v.is_featured ? 'checked' : ''}> Featured</label>
        <label><input type="checkbox" id="pBest" ${v.is_bestseller ? 'checked' : ''}> Best seller</label>
        <label><input type="checkbox" id="pNew" ${v.is_new_arrival ? 'checked' : ''}> New arrival</label>
        <label><input type="checkbox" id="pHide" ${v.hidden ? 'checked' : ''}> Hidden from shop</label>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost" id="pCancel" type="button">Cancel</button>
        <button class="btn btn-primary" id="pSave" type="button">${p ? 'Save changes' : 'Add perfume'}</button>
      </div>
      <div class="form-status" id="pStatus"></div>`, () => {

      const rows = $('#sizeRows');
      const wireRemove = () => $$('[data-rm-size]', rows).forEach(b => b.onclick = () => {
        if (rows.children.length <= 1) { toast('A perfume needs at least one size.', 'error'); return; }
        b.closest('.size-row').remove();
      });
      wireRemove();
      $('#addSize').addEventListener('click', () => {
        rows.insertAdjacentHTML('beforeend', sizeRow({ label: '', price_cents: 0 }, rows.children.length));
        wireRemove();
      });

      $('#pCancel').addEventListener('click', closeModal);
      $('#pSave').addEventListener('click', async () => {
        const st = $('#pStatus');
        const sizes = $$('.size-row', rows).map(r => ({
          label: $('.size-label', r).value.trim(),
          price_cents: Math.round(parseFloat($('.size-price', r).value || '0') * 100)
        })).filter(s => s.label);

        if (!$('#pName').value.trim()) { st.className = 'form-status error'; st.textContent = 'Give the perfume a name.'; return; }
        if (!sizes.length) { st.className = 'form-status error'; st.textContent = 'Add at least one size with a price.'; return; }

        const payload = {
          name: $('#pName').value.trim(), category: $('#pCat').value,
          short_description: $('#pShort').value.trim(), description: $('#pDesc').value.trim(),
          top_notes: $('#pTop').value.trim(), middle_notes: $('#pMid').value.trim(),
          base_notes: $('#pBase').value.trim(), image_url: $('#pImg').value.trim(),
          stock: parseInt($('#pStock').value, 10) || 0, sizes,
          is_featured: $('#pFeat').checked ? 1 : 0,
          is_bestseller: $('#pBest').checked ? 1 : 0,
          is_new_arrival: $('#pNew').checked ? 1 : 0,
          hidden: $('#pHide').checked ? 1 : 0
        };

        const btn = $('#pSave');
        btn.disabled = true; btn.textContent = 'Saving…';
        try {
          if (p) await api('/api/admin/products/update', { id: p.id, ...payload });
          else await api('/api/admin/products/create', payload);
          await ML.refreshProducts();
          closeModal();
          toast(p ? 'Perfume saved.' : 'Perfume added.');
          ML.render();
        } catch (err) {
          st.className = 'form-status error'; st.textContent = err.message;
          btn.disabled = false; btn.textContent = p ? 'Save changes' : 'Add perfume';
        }
      });
    });
  }

  function sizeRow(s, i) {
    return `<div class="size-row field-row">
      <div class="field"><input class="size-label" type="text" placeholder="50ml" value="${esc(s.label)}"></div>
      <div class="field"><input class="size-price" type="number" step="0.01" min="0" placeholder="0.00" value="${(s.price_cents / 100).toFixed(2)}"></div>
      <button class="btn-icon" type="button" data-rm-size="${i}" aria-label="Remove this size">Remove</button>
    </div>`;
  }

  /** Lets the "+" buttons on the storefront open the product editor. */
  function bindInlineProduct() {
    $$('[data-ed-product]').forEach(b => b.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!adminProducts.length) {
        try { adminProducts = (await api('/api/admin/products')).products; } catch {}
      }
      openProductEditor(+b.dataset.edProduct);
    }));
    $$('[data-add-product]').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      openProductEditor(null);
    }));
  }

  /* ------------------------------ stock ----------------------------- */

  async function viewStock() {
    adminProducts = (await api('/api/admin/products')).products;
    const threshold = parseInt(state.settings.low_stock_threshold, 10) || 5;
    return shell('Stock', `
      <div class="admin-card glass">
        <h2>Update stock levels</h2>
        <p class="muted small mb14">Change the numbers, then save. Anything at or below ${threshold} is flagged as low.</p>
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Perfume</th><th>Current</th><th>New level</th></tr></thead>
          <tbody>${adminProducts.map(p => `<tr>
            <td>${esc(p.name)}${p.stock <= threshold ? ' <span class="status-pill pending">Low</span>' : ''}</td>
            <td>${p.stock}</td>
            <td><input class="stock-input" type="number" min="0" data-id="${p.id}" value="${p.stock}" style="max-width:120px"></td>
          </tr>`).join('')}</tbody>
        </table></div>
        <div class="row-gap mt20">
          <button class="btn btn-primary" id="saveStock">Save stock</button>
          <div class="form-status" id="stockStatus"></div>
        </div>
      </div>

      <div class="admin-card glass">
        <h2>Low stock threshold</h2>
        <div class="field-row">
          <div class="field"><label for="thVal">Flag anything at or below</label>
            <input id="thVal" type="number" min="0" value="${threshold}"></div>
          <div class="field" style="align-self:end"><button class="btn btn-ghost" id="saveTh">Save threshold</button></div>
        </div>
      </div>`, '#/admin/stock');
  }

  function bindStock() {
    $('#saveStock').addEventListener('click', async () => {
      const st = $('#stockStatus');
      const updates = $$('.stock-input').map(i => ({ id: +i.dataset.id, stock: parseInt(i.value, 10) || 0 }));
      try {
        await api('/api/admin/stock', { updates });
        await ML.refreshProducts();
        toast('Stock updated.');
        ML.render();
      } catch (err) { st.className = 'form-status error'; st.textContent = err.message; }
    });
    $('#saveTh').addEventListener('click', async () => {
      try {
        const res = await api('/api/admin/settings', { settings: { low_stock_threshold: $('#thVal').value } });
        state.settings = res.settings;
        toast('Threshold saved.');
        ML.render();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  /* ------------------------------ orders ---------------------------- */

  const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];

  async function viewOrders() {
    const orders = (await api('/api/admin/orders')).orders;
    return shell('Orders', `
      <div class="admin-card glass">
        <h2>All orders (${orders.length})</h2>
        ${orders.length ? `<div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>${orders.map(o => `<tr>
            <td><strong>${esc(o.order_number)}</strong>
              ${o.pay_last4 ? `<div class="muted xsmall">${esc(o.pay_brand)} ····${esc(o.pay_last4)}</div>` : ''}</td>
            <td>${esc(o.customer_name)}<div class="muted xsmall">${esc(o.customer_email)}</div>
              <div class="muted xsmall">${esc(o.shipping_address)}</div></td>
            <td class="xsmall">${o.items.map(i => `${esc(i.product_name)} (${esc(i.size_label)}) × ${i.qty}`).join('<br>')}</td>
            <td>${fmtDate(o.created_at)}</td>
            <td>${money(o.total_cents)}</td>
            <td><select class="status-select" data-order="${o.id}">
              ${STATUSES.map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select></td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="empty-state">No orders yet.</p>'}
      </div>`, '#/admin/orders');
  }

  function bindOrders() {
    $$('.status-select').forEach(sel => sel.addEventListener('change', async () => {
      try {
        await api('/api/admin/orders/status', { id: +sel.dataset.order, status: sel.value });
        toast('Order status updated.');
      } catch (err) { toast(err.message, 'error'); }
    }));
  }

  /* ----------------------------- reviews ---------------------------- */

  async function viewReviews() {
    const reviews = (await api('/api/admin/reviews')).reviews;
    return shell('Reviews', `
      <div class="admin-card glass">
        <h2>Customer reviews (${reviews.length})</h2>
        <p class="muted small mb14">Every review here came from a verified purchase. Hiding one keeps it visible
          to its author but takes it off the product page and out of the average.</p>
        ${reviews.length ? `<div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Perfume</th><th>Rating</th><th>Review</th><th>Customer</th><th>Date</th><th></th></tr></thead>
          <tbody>${reviews.map(r => `<tr>
            <td>${esc(r.product_name || 'Removed')}</td>
            <td>${stars(r.rating)}</td>
            <td>${r.title ? `<strong>${esc(r.title)}</strong><br>` : ''}<span class="xsmall">${esc(r.body).slice(0, 220)}</span></td>
            <td>${esc(r.full_name)}<div class="muted xsmall">${esc(r.email)}</div></td>
            <td>${fmtDate(r.created_at)}</td>
            <td class="nowrap">
              ${statusPill(r.status)}
              <button class="btn-icon" data-rv="${r.id}" data-next="${r.status === 'published' ? 'hidden' : 'published'}">
                ${r.status === 'published' ? 'Hide' : 'Publish'}</button>
            </td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="empty-state">No reviews yet. They appear once a customer reviews something they bought.</p>'}
      </div>`, '#/admin/reviews');
  }

  function bindReviews() {
    $$('[data-rv]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api('/api/admin/reviews/status', { id: +b.dataset.rv, status: b.dataset.next });
        await ML.refreshProducts();
        toast('Review updated.');
        ML.render();
      } catch (err) { toast(err.message, 'error'); }
    }));
  }

  /* ---------------------------- customers --------------------------- */

  async function viewCustomers() {
    const customers = (await api('/api/admin/customers')).customers;
    return shell('Customers', `
      <div class="admin-card glass">
        <h2>Accounts (${customers.length})</h2>
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Name</th><th>Email</th><th>Orders</th><th>Spent</th><th>Joined</th><th>Status</th><th></th></tr></thead>
          <tbody>${customers.map(c => `<tr>
            <td>${esc(c.full_name)}${c.is_admin ? ' <span class="status-pill">Staff</span>' : ''}</td>
            <td>${esc(c.email)}</td>
            <td>${c.order_count}</td>
            <td>${money(c.spent_cents)}</td>
            <td>${fmtDate(c.created_at)}</td>
            <td>${c.is_active ? '<span class="status-pill delivered">Active</span>' : '<span class="status-pill cancelled">Disabled</span>'}</td>
            <td>${c.id === (state.user && state.user.id) ? '<span class="muted xsmall">You</span>'
              : `<button class="btn-icon" data-toggle="${c.id}">${c.is_active ? 'Disable' : 'Enable'}</button>`}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`, '#/admin/customers');
  }

  function bindCustomers() {
    $$('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
      try {
        const res = await api('/api/admin/customers/toggle', { id: +b.dataset.toggle });
        toast(res.is_active ? 'Account enabled.' : 'Account disabled and signed out.');
        ML.render();
      } catch (err) { toast(err.message, 'error'); }
    }));
  }

  /* ---------------------------- categories -------------------------- */

  async function viewCategories() {
    const categories = (await api('/api/admin/categories')).categories;
    state.categories = categories;
    return shell('Categories', `
      <div class="admin-card glass">
        <h2>Categories</h2>
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Label</th><th>Key</th><th>Perfumes</th><th></th></tr></thead>
          <tbody>${categories.map(c => `<tr>
            <td><input class="cat-label" data-id="${c.id}" type="text" value="${esc(c.label)}"></td>
            <td class="muted xsmall">${esc(c.key)}</td>
            <td>${state.products.filter(p => p.category === c.key).length}</td>
            <td class="nowrap">
              <button class="btn-icon" data-cat-save="${c.id}">Save</button>
              <button class="btn-icon" data-cat-del="${c.id}">Delete</button>
            </td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="admin-card glass">
        <h2>Add a category</h2>
        <div class="field-row">
          <div class="field"><label for="newCat">Label</label><input id="newCat" type="text" placeholder="e.g. Limited Edition"></div>
          <div class="field" style="align-self:end"><button class="btn btn-primary" id="addCat">Add category</button></div>
        </div>
        <div class="form-status" id="catStatus"></div>
      </div>`, '#/admin/categories');
  }

  function bindCategories() {
    const save = async (payload) => {
      try {
        const res = await api('/api/admin/categories/save', payload);
        state.categories = res.categories;
        toast('Category saved.');
        ML.render();
      } catch (err) {
        const st = $('#catStatus');
        if (st) { st.className = 'form-status error'; st.textContent = err.message; }
        else toast(err.message, 'error');
      }
    };
    $$('[data-cat-save]').forEach(b => b.addEventListener('click', () => {
      const id = +b.dataset.catSave;
      const input = $(`.cat-label[data-id="${id}"]`);
      save({ id, label: input.value.trim() });
    }));
    $$('[data-cat-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this category?')) return;
      try {
        const res = await api('/api/admin/categories/delete', { id: +b.dataset.catDel });
        state.categories = res.categories;
        toast('Category deleted.');
        ML.render();
      } catch (err) { toast(err.message, 'error'); }
    }));
    $('#addCat').addEventListener('click', () => {
      const label = $('#newCat').value.trim();
      if (!label) { const st = $('#catStatus'); st.className = 'form-status error'; st.textContent = 'Give the category a name.'; return; }
      save({ label });
    });
  }

  /* ------------------------- content & settings --------------------- */

  const CONTENT_FIELDS = [
    ['hero_eyebrow', 'Hero eyebrow', false],
    ['hero_headline', 'Hero headline', false],
    ['hero_description', 'Hero description', true],
    ['hero_cta_text', 'Hero button text', false],
    ['hero_cta_link', 'Hero button link', false],
    ['about_heading', 'About heading', false],
    ['about_body', 'About text', true],
    ['banner_text', 'Promo banner (blank hides it)', false],
    ['footer_text', 'Footer text', true]
  ];

  const SETTINGS_FIELDS = [
    ['site_title', 'Browser tab title', false],
    ['logo_text', 'Website name', false],
    ['contact_email', 'Contact email', false],
    ['contact_phone', 'Contact phone', false],
    ['contact_address', 'Atelier address', false],
    ['instagram', 'Instagram URL', false],
    ['pinterest', 'Pinterest URL', false]
  ];

  function fieldsForm(fields, formId) {
    return `<form id="${formId}">
      ${fields.map(([key, label, multi]) => `<div class="field">
        <label for="f_${key}">${esc(label)}</label>
        ${multi
          ? `<textarea id="f_${key}" data-key="${key}" rows="3">${esc(state.settings[key] || '')}</textarea>`
          : `<input id="f_${key}" data-key="${key}" type="text" value="${esc(state.settings[key] || '')}">`}
      </div>`).join('')}
      <button class="btn btn-primary mt14" type="submit">Save changes</button>
      <div class="form-status" id="${formId}Status"></div>
    </form>`;
  }

  async function viewContent() {
    return shell('Homepage & Content', `
      <div class="admin-card glass">
        <h2>Homepage copy</h2>
        ${fieldsForm(CONTENT_FIELDS, 'contentForm')}
      </div>
      <div class="admin-card glass">
        <h2>Testimonials</h2>
        <p class="muted small mb14">These are the quotes on the homepage. Customer reviews are separate and live on
          each product page.</p>
        <div class="table-wrap"><table class="admin-table">
          <thead><tr><th>Name</th><th>Role</th><th>Quote</th></tr></thead>
          <tbody>${(state.settings.testimonials || []).map(t => `<tr>
            <td>${esc(t.name)}</td><td>${esc(t.role)}</td><td>${esc(t.quote)}</td></tr>`).join('')}</tbody>
        </table></div>
        <p class="muted small mt14">Edit these from the homepage using the <span class="plus-inline">+</span> buttons.</p>
      </div>`, '#/admin/content');
  }

  async function viewAppearance() {
    return shell('Website Settings', `
      <div class="admin-card glass">
        <h2>Identity and contact</h2>
        ${fieldsForm(SETTINGS_FIELDS, 'settingsForm')}
      </div>
      <div class="admin-card glass">
        <h2>Colours</h2>
        <form id="colourForm">
          <div class="field-row">
            <div class="field"><label for="f_color_primary">Accent</label>
              <input id="f_color_primary" data-key="color_primary" type="color" value="${esc(state.settings.color_primary || '#CBB88B')}"></div>
            <div class="field"><label for="f_color_secondary">Green</label>
              <input id="f_color_secondary" data-key="color_secondary" type="color" value="${esc(state.settings.color_secondary || '#2E6B49')}"></div>
            <div class="field"><label for="f_color_background">Background</label>
              <input id="f_color_background" data-key="color_background" type="color" value="${esc(state.settings.color_background || '#060F0B')}"></div>
          </div>
          <button class="btn btn-primary mt14" type="submit">Save colours</button>
          <div class="form-status" id="colourFormStatus"></div>
        </form>
      </div>`, '#/admin/appearance');
  }

  function bindSettingsForm(formId) {
    const form = $('#' + formId);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = $('#' + formId + 'Status');
      const patch = {};
      $$('[data-key]', form).forEach(el => { patch[el.dataset.key] = el.value; });
      try {
        const res = await api('/api/admin/settings', { settings: patch });
        state.settings = res.settings;
        ML.applyTheme();
        st.className = 'form-status success';
        st.textContent = 'Saved. The site is updated for everyone.';
      } catch (err) {
        st.className = 'form-status error';
        st.textContent = err.message;
      }
    });
  }

  /* ---------------------------- messages ---------------------------- */

  async function viewMessages() {
    const messages = (await api('/api/admin/messages')).messages;
    return shell('Messages', `
      <div class="admin-card glass">
        <h2>Inbox (${messages.filter(m => !m.is_read).length} unread)</h2>
        ${messages.length ? `<div class="msg-list">
          ${messages.map(m => `<div class="msg-item ${m.is_read ? '' : 'unread'}">
            <div class="msg-head">
              <div><strong>${esc(m.subject || '(no subject)')}</strong>
                <div class="muted xsmall">${esc(m.name)} · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a> · ${fmtDate(m.created_at)}</div></div>
              <div class="nowrap">
                <button class="btn-icon" data-msg-read="${m.id}">${m.is_read ? 'Read' : 'Mark read'}</button>
                <button class="btn-icon" data-msg-del="${m.id}">Delete</button>
              </div>
            </div>
            <div class="msg-body">${esc(m.body).replace(/\n/g, '<br>')}</div>
          </div>`).join('')}
        </div>` : '<p class="empty-state">Nothing in the inbox. Messages from the contact form land here.</p>'}
      </div>`, '#/admin/messages');
  }

  function bindMessages() {
    $$('[data-msg-read]').forEach(b => b.addEventListener('click', async () => {
      try { await api('/api/admin/messages/read', { id: +b.dataset.msgRead }); ML.render(); }
      catch (err) { toast(err.message, 'error'); }
    }));
    $$('[data-msg-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete this message?')) return;
      try { await api('/api/admin/messages/delete', { id: +b.dataset.msgDel }); toast('Message deleted.'); ML.render(); }
      catch (err) { toast(err.message, 'error'); }
    }));
  }

  /* ------------------------------ router ---------------------------- */

  async function render(path) {
    const app = $('#app');
    let html = '', after = null;

    try {
      switch (path) {
        case '/admin':
        case '/admin/dashboard': html = await viewDashboard(); break;
        case '/admin/products': html = await viewProducts(); after = bindProducts; break;
        case '/admin/stock': html = await viewStock(); after = bindStock; break;
        case '/admin/orders': html = await viewOrders(); after = bindOrders; break;
        case '/admin/reviews': html = await viewReviews(); after = bindReviews; break;
        case '/admin/customers': html = await viewCustomers(); after = bindCustomers; break;
        case '/admin/categories': html = await viewCategories(); after = bindCategories; break;
        case '/admin/content': html = await viewContent(); after = () => bindSettingsForm('contentForm'); break;
        case '/admin/appearance':
          html = await viewAppearance();
          after = () => { bindSettingsForm('settingsForm'); bindSettingsForm('colourForm'); };
          break;
        case '/admin/messages': html = await viewMessages(); after = bindMessages; break;
        default:
          html = shell('Not found', '<div class="admin-card glass"><p class="empty-state">That dashboard page does not exist.</p></div>', '');
      }
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        state.user = null; state.adminLoaded = false;
        location.hash = '#/login';
        await ML.hydrate();
        return ML.render();
      }
      html = shell('Something went wrong',
        `<div class="admin-card glass"><p class="empty-state">${esc(err.message)}</p></div>`, '');
    }

    app.innerHTML = html;

    const logout = $('#adminLogout');
    if (logout) logout.addEventListener('click', async () => {
      try { await api('/api/auth/logout', {}); } catch {}
      state.user = null; state.cart = []; state.adminLoaded = false;
      location.hash = '#/';
      await ML.hydrate();
      ML.render();
    });

    if (after) after();
    window.scrollTo(0, 0);
  }

  ML.admin = { render, bindInlineProduct, openProductEditor };
})();
