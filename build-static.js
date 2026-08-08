// build-static.js
// Generates a static, server-free build of the site into ./docs, which is
// what GitHub Pages serves.
//
// Run:  node build-static.js
//
// What it does:
//   1. Copies everything in /public into /docs
//   2. Rewrites absolute paths (/css/...) to relative ones so the site works
//      from a project subpath like  username.github.io/maison-lunar/
//   3. Injects demo-api.js, which answers API calls from localStorage
//   4. Adds a 404.html so deep links don't hard-fail on Pages
//
// The result is a browsable demo, NOT a real backend. See README.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'public');
const OUT = path.join(__dirname, 'docs');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function walk(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, cb);
    else cb(p);
  }
}

// --- 1. fresh copy ---
fs.rmSync(OUT, { recursive: true, force: true });
copyDir(SRC, OUT);

// --- 2 & 3. rewrite HTML ---
// Read the shared scripts once so they can be inlined. Inlining matters: a
// static site served from a project subpath is easy to break with one wrong
// script path, and a 404 on a single JS file silently kills login, cart, and
// the admin panel. With the JS embedded there is nothing left to 404.
const readJs = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');
const JS = {
  config: readJs('js', 'config.js'),
  demo: readJs('js', 'demo-api.js'),
  api: readJs('js', 'api.js'),
  nav: readJs('js', 'nav.js'),
  guard: readJs('admin', 'js', 'admin-guard.js')
};
// CSS is inlined for the same reason as the JS: uploading to GitHub Pages by
// drag-and-drop very often drops a subfolder, and a missing css/ or js/
// directory produces a page that looks broken or silently won't log in. With
// both embedded, every HTML file stands completely on its own.
const CSS = {
  theme: fs.readFileSync(path.join(SRC, 'css', 'theme.css'), 'utf8'),
  admin: fs.readFileSync(path.join(SRC, 'admin', 'css', 'admin.css'), 'utf8')
};

walk(OUT, (file) => {
  if (!file.endsWith('.html')) return;
  let html = fs.readFileSync(file, 'utf8');

  // depth below docs/ decides how many ../ we need (admin pages are 1 deep)
  const rel = path.relative(OUT, path.dirname(file));
  const prefix = rel === '' ? './' : '../'.repeat(rel.split(path.sep).length);

  // absolute -> relative asset & link paths
  html = html.replace(/(href|src)="\/([^"]*)"/g, (mm, attr, p) => `${attr}="${prefix}${p}"`);
  // bare root link (href="/") -> index
  html = html.replace(/(href|src)="\/"/g, (mm, attr) => `${attr}="${prefix}index.html"`);

  // With no <script src="...config.js"> left, the site base can't be derived
  // from it — so bake it in explicitly.
  const siteBase = prefix === './' ? '.' : '..';

  // Swap external stylesheets for inline <style> blocks.
  html = html.replace(/[ \t]*<link rel="stylesheet" href="[^"]*css\/theme\.css">\s*/, `<style>\n${CSS.theme}\n</style>\n`);
  html = html.replace(/[ \t]*<link rel="stylesheet" href="[^"]*admin\/css\/admin\.css">\s*/, `<style>\n${CSS.admin}\n</style>\n`);

  // Swap each external script tag for an inline equivalent, same order.
  html = html.replace(
    /[ \t]*<script src="[^"]*js\/config\.js"><\/script>\s*/,
    `<script>
window.LUNAR_DEMO = true;
window.LUNAR_SITE_BASE = '${siteBase}';
${JS.config}
</script>
<script>
${JS.demo}
</script>
`
  );
  html = html.replace(/[ \t]*<script src="[^"]*admin\/js\/admin-guard\.js"><\/script>\s*/, `<script>\n${JS.guard}\n</script>\n`);
  html = html.replace(/[ \t]*<script src="[^"]*js\/api\.js"><\/script>\s*/, `<script>\n${JS.api}\n</script>\n`);
  html = html.replace(/[ \t]*<script src="[^"]*js\/nav\.js"><\/script>\s*/, `<script>\n${JS.nav}\n</script>\n`);

  fs.writeFileSync(file, html);
});

// --- 4. Pages 404 fallback ---
fs.copyFileSync(path.join(OUT, 'index.html'), path.join(OUT, '404.html'));

// Stops GitHub Pages running the files through Jekyll (which ignores
// files/folders beginning with an underscore).
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log('Static demo built into ./docs');
console.log('Preview locally with:  npx serve docs   (or any static server)');
console.log('On GitHub: Settings -> Pages -> Source: main branch, /docs folder');
