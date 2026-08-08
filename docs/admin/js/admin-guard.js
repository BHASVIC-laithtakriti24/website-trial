// public/admin/js/admin-guard.js
// Runs on every admin page. Note this is a UX convenience only — the real
// protection is server-side: every /api/admin/* route independently checks
// the admin session cookie in server.js, so even if this script were removed
// or bypassed, the API itself would still refuse unauthorized requests.
window.adminApi = async function adminApi(path, { method = 'GET', body } = {}) {
  const res = await fetch((window.LUNAR_API_BASE || '') + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401) { location.href = LUNAR_URL('/admin/login.html'); throw new Error('Not authenticated'); }
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.data = data; throw err; }
  return data;
};

window.adminFormatMoney = function (cents) { return '\u00A3' + (cents / 100).toFixed(2); };

const NAV_ITEMS = [
  { href: '/admin/dashboard.html', label: 'Dashboard' },
  { href: '/admin/products.html', label: 'Products' },
  { href: '/admin/orders.html', label: 'Orders' },
  { href: '/admin/customers.html', label: 'Customers' },
  { href: '/admin/content.html', label: 'Website Content' },
  { href: '/admin/appearance.html', label: 'Appearance' },
  { href: '/admin/messages.html', label: 'Messages' }
];

async function initAdminShell() {
  let admin;
  try {
    const data = await adminApi('/api/admin/me');
    if (!data.admin) { location.href = LUNAR_URL('/admin/login.html'); return null; }
    admin = data.admin;
  } catch (e) { return null; }

  const sidebar = document.getElementById('adminSidebar');
  if (sidebar) {
    const current = location.pathname;
    sidebar.innerHTML = `
      <div class="admin-brand">
        <svg viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" stroke="#CBB88B" stroke-width="1.3" stroke-linejoin="round"/></svg>
        MAISON LUNAR
      </div>
      <nav class="admin-nav">
        ${NAV_ITEMS.map(i => `<a href="${i.href}" class="${current === i.href ? 'active' : ''}">${i.label}</a>`).join('')}
        <div class="divider"></div>
        <a href="/" target="_blank">View Site \u2197</a>
        <button id="adminLogoutBtn">Log Out</button>
      </nav>`;
    document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
      await adminApi('/api/admin/logout', { method: 'POST' });
      location.href = LUNAR_URL('/admin/login.html');
    });
  }
  const whoEl = document.getElementById('adminWho');
  if (whoEl) whoEl.textContent = admin.full_name + ' \u00B7 ' + admin.email;

  return admin;
}

window.initAdminShell = initAdminShell;
