// public/js/api.js — tiny fetch wrapper, JSON in/out, surfaces API errors
window.api = async function api(path, { method = 'GET', body } = {}) {
  const base = window.LUNAR_API_BASE || '';
  const res = await fetch(base + path, {
    method,
    credentials: 'include', // send session cookie, incl. cross-origin setups
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
};

window.formatMoney = function formatMoney(cents) {
  return '\u00A3' + (cents / 100).toFixed(2);
};

// A neutral bottle glyph used as a placeholder wherever a product has no
// uploaded photo yet — keeps cards looking finished instead of broken.
window.bottleSvg = function bottleSvg() {
  return `<svg class="ph-bottle" viewBox="0 0 160 220" xmlns="http://www.w3.org/2000/svg">
    <rect x="55" y="20" width="50" height="18" rx="3" fill="none" stroke-width="1.2"/>
    <rect x="63" y="10" width="34" height="12" rx="2"/>
    <path d="M55 38 L50 60 L50 195 Q50 205 60 205 L100 205 Q110 205 110 195 L110 60 L105 38 Z" fill="rgba(203,184,139,0.06)" stroke-width="1.2"/>
    <line x1="50" y1="90" x2="110" y2="90" stroke-width="0.6" opacity="0.5"/>
  </svg>`;
};
