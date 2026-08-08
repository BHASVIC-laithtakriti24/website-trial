// public/js/nav.js — shared across every customer page
(function () {
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));
  }

  async function refreshCartCount() {
    try {
      const res = await fetch((window.LUNAR_API_BASE||'') + '/api/cart', { credentials: 'include' });
      const data = await res.json();
      const count = data.items.reduce((sum, i) => sum + i.qty, 0);
      document.querySelectorAll('.cart-count').forEach(el => {
        el.textContent = count;
        el.style.display = count > 0 ? 'flex' : 'none';
      });
    } catch (e) { /* non-fatal */ }
  }

  async function refreshAuthLink() {
    const slot = document.getElementById('navAuthSlot');
    if (!slot) return;
    try {
      const res = await fetch((window.LUNAR_API_BASE||'') + '/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      if (data.user) {
        slot.innerHTML = `<a href="/account.html">My Account</a>`;
      } else {
        slot.innerHTML = `<a href="/login.html">Login / Sign Up</a>`;
      }
    } catch (e) { /* non-fatal */ }
  }

  async function applyAppearance() {
    try {
      const res = await fetch((window.LUNAR_API_BASE||'') + '/api/settings', { credentials: 'include' });
      const { settings } = await res.json();
      const root = document.documentElement.style;
      if (settings.color_primary) root.setProperty('--moon', settings.color_primary);
      if (settings.color_secondary) root.setProperty('--g-500', settings.color_secondary);
      if (settings.color_background) root.setProperty('--g-950', settings.color_background);
      if (settings.logo_text) {
        // Rebuild the brand cleanly: keep the moon-mark SVG, then a single
        // text node. The previous version wrote the name into *every* text
        // node inside .brand — and the markup has whitespace nodes on both
        // sides of the SVG — so the name appeared twice, doubling the
        // element's width and pushing the mobile menu button off-screen.
        document.querySelectorAll('.brand').forEach(el => {
          const svg = el.querySelector('svg');
          el.textContent = '';
          if (svg) el.appendChild(svg);
          el.appendChild(document.createTextNode(' ' + settings.logo_text));
        });
      }
      if (settings.favicon) {
        let link = document.querySelector('link[rel="icon"]');
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
        link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">' + encodeURIComponent(settings.favicon) + '</text></svg>';
      }
      if (settings.banner_text) {
        let banner = document.getElementById('promoBanner');
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'promoBanner';
          banner.style.cssText = 'background:var(--moon); color:var(--g-950); text-align:center; font-size:12px; letter-spacing:0.06em; padding:9px 16px;';
          if (window.LUNAR_addTopBar) window.LUNAR_addTopBar(banner);
          else document.body.insertBefore(banner, document.body.firstChild);
        }
        banner.textContent = settings.banner_text;
      }
    } catch (e) { /* non-fatal */ }
  }

  window.LunarNav = { refreshCartCount, refreshAuthLink };

  document.addEventListener('DOMContentLoaded', () => {
    refreshCartCount();
    refreshAuthLink();
    applyAppearance();
  });

  // reveal-on-scroll, shared by every page
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
    });
  }, { threshold: 0.12 });
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  });
})();
