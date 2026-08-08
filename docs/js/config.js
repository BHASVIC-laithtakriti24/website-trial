// public/js/config.js
// Controls where the frontend sends its API requests.
//
//  - Same-origin (default): leave API_BASE empty. Used when the Node server
//    serves these files itself (npm start / Render / Fly / Docker).
//
//  - Split hosting: put the frontend on GitHub Pages and the backend on
//    Render/Fly. Set API_BASE to your backend's URL, e.g.
//      window.LUNAR_API_BASE = 'https://maison-lunar.onrender.com';
//    You must also set ALLOWED_ORIGINS on the server to your Pages URL.
//
//  - Demo mode: set by the static build script. Loads a browser-side mock
//    of the API backed by localStorage so the site is browsable with no
//    server at all. NOT secure and NOT a real backend — see README.
window.LUNAR_API_BASE = window.LUNAR_API_BASE || '';
window.LUNAR_DEMO = window.LUNAR_DEMO || false;

// Where the site itself lives. This is '/' when the Node server hosts it,
// but on GitHub Pages a project site lives under /repo-name/, so internal
// redirects must be resolved against that prefix rather than hard-coding a
// leading slash. Derived from where config.js was loaded from, so it works
// in both modes with no configuration.
window.LUNAR_SITE_BASE = window.LUNAR_SITE_BASE || (function () {
  const tag = document.querySelector('script[src*="js/config.js"]');
  if (!tag) return '';
  const abs = new URL(tag.getAttribute('src'), location.href).pathname;
  return abs.replace(/js\/config\.js$/, '').replace(/\/$/, '');
})();

// Use for every in-app redirect: location.href = LUNAR_URL('/account.html')
window.LUNAR_URL = function (p) { return window.LUNAR_SITE_BASE + p; };

// Safari cannot parse "2026-08-07 21:59:42" (a space instead of a "T") and
// returns Invalid Date, which is what SQLite hands back. Normalise before
// parsing so dates render identically on iOS, macOS Safari, and Chrome.
window.parseDate = function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  let v = String(value).trim().replace(' ', 'T');
  // A bare SQLite timestamp has no timezone; treat it as UTC like the server.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v)) v += 'Z';
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

window.formatDate = function formatDate(value, opts) {
  const d = window.parseDate(value);
  if (!d) return '\u2014';
  return d.toLocaleDateString('en-GB', opts);
};

window.formatDateTime = function formatDateTime(value) {
  const d = window.parseDate(value);
  if (!d) return '\u2014';
  return d.toLocaleString('en-GB');
};

// Top bars (promo banner, demo notice) must not sit *on top of* the fixed
// header — on a phone that silently swallows taps on the menu button, which
// looks like "the menu is broken". Stack them in one fixed host and push the
// header and page content down by however tall that host is.
window.LUNAR_addTopBar = function (el) {
  // Only the storefront has a fixed header to sit above; admin pages scroll
  // normally, so there the bar goes in normal flow and can't cover buttons.
  const hasFixedHeader = !!document.querySelector('header');

  let host = document.getElementById('lunarTopBars');
  if (!host) {
    host = document.createElement('div');
    host.id = 'lunarTopBars';
    host.style.cssText = hasFixedHeader
      ? 'position:fixed; top:0; left:0; right:0; z-index:150;'
      : 'position:relative; z-index:150;';
    document.body.insertBefore(host, document.body.firstChild);
  }
  host.appendChild(el);

  if (!hasFixedHeader) return; // in-flow bar needs no offsetting

  const relayout = () => {
    const h = Math.round(host.getBoundingClientRect().height);
    const hdr = document.querySelector('header');
    if (hdr) hdr.style.top = h + 'px';
    const main = document.querySelector('main');
    if (main) main.style.paddingTop = 'calc(96px + ' + h + 'px)';
    const shell = document.querySelector('.admin-shell');
    if (shell) shell.style.paddingTop = h + 'px';
    const sidebar = document.querySelector('.admin-sidebar');
    if (sidebar && getComputedStyle(sidebar).position === 'sticky') sidebar.style.top = h + 'px';
  };
  requestAnimationFrame(relayout);
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => setTimeout(relayout, 250));
};
