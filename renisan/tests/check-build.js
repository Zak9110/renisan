// Post-build smoke test: run after `vite build` to make sure the deployable output is complete.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const read = (f) => fs.readFileSync(path.join(dist, f), 'utf8');
const must = (f) => assert(fs.existsSync(path.join(dist, f)), `dist/${f} missing`);

for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'robots.txt', 'sitemap.xml', 'data/meta.json', 'og-image.png', 'icons/icon-512.png']) must(f);

const meta = JSON.parse(read('data/meta.json'));
const dataFiles = [
  meta.federal.file, meta.krg.file, meta.scholarships.file,
  ...(meta.federal.extra_files ?? []).map((e) => e.file),
  ...(meta.federal.history ?? []).map((h) => h.file),
  ...(meta.federal.rules ? [meta.federal.rules.file] : [])
];
for (const f of dataFiles) must(`data/${f}`);

const html = read('index.html');
assert(!html.includes('__SITE_URL__') || !process.env.SITE_URL, 'SITE_URL placeholder left in index.html');
assert(html.includes('application/ld+json'), 'structured data missing');
assert(html.includes('data-theme'), 'theme bootstrap missing');
assert(!html.includes('/src/main.tsx'), 'index.html still points at the dev entry');

const sw = read('sw.js');
for (const f of [...dataFiles, 'meta.json']) {
  assert(sw.includes(`data/${f}`), `service worker does not precache data/${f}`);
}
const manifest = JSON.parse(read('manifest.webmanifest'));
assert(manifest.icons.length >= 2 && manifest.shortcuts?.length === 2, 'manifest icons/shortcuts');

const bytes = (f) => fs.statSync(path.join(dist, f)).size;
const js = fs.readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.js')).reduce((n, f) => n + bytes(`assets/${f}`), 0);
console.log(`✓ dist complete — js ${(js / 1024).toFixed(0)} KB, federal data ${(bytes(`data/${meta.federal.file}`) / 1024).toFixed(0)} KB`);
assert(js < 400 * 1024, 'JS bundle unexpectedly large');
