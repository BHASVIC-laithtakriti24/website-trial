// build-single.js — fuses single/style.css + single/app.js into ONE index.html.
// Output: single-file/index.html  (upload that one file; nothing else needed)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(dir, 'single', 'style.css'), 'utf8');
const js  = fs.readFileSync(path.join(dir, 'single', 'app.js'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="theme-color" content="#060F0B">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="format-detection" content="telephone=no">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Maison Lunar — Eau de Parfum</title>
<meta name="description" content="Maison Lunar — small-batch fragrance, bottled by moonlight.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<script>
${js}
</script>
</body>
</html>
`;

const outDir = path.join(dir, 'single-file');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log('Built single-file/index.html (' + kb + ' KB) — one file, no dependencies.');
