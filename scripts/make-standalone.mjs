/**
 * Packages the production build into one self-contained HTML file: no external
 * scripts, styles or assets, so it runs from a phone's Downloads folder or a USB
 * stick with no server. Writes public/kingdoms-of-the-forgotten-island.html.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const dist = resolve(root, 'dist');
if (!existsSync(dist)) {
  console.error('No dist/ build found. Run `npm run build` first.');
  process.exit(1);
}
const assetsDir = resolve(dist, 'assets');
const files = readdirSync(assetsDir);
const jsFile = files.find((file) => file.endsWith('.js'));
const cssFile = files.find((file) => file.endsWith('.css'));
if (!jsFile) {
  console.error('No bundled JavaScript found in dist/assets.');
  process.exit(1);
}

let html = readFileSync(resolve(dist, 'index.html'), 'utf8');
const js = readFileSync(resolve(assetsDir, jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');
// Function replacements keep `$&` and `$'` inside the bundle literal.
html = html.replace(
  /<script[^>]*src="[^"]+"[^>]*><\/script>\s*/i,
  () => `<script type="module">\n${js}\n</script>\n`
);
html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>\s*/gi, '');
if (cssFile) {
  const css = readFileSync(resolve(assetsDir, cssFile), 'utf8');
  html = html.replace(
    /<link[^>]*rel="stylesheet"[^>]*>\s*/i,
    () => `<style>\n${css}\n</style>\n`
  );
}
// The standalone file cannot install itself; drop app-shell links so it makes no
// request for a manifest or icons when opened from a phone's Downloads folder.
html = html
  .replace(/<link[^>]*rel="manifest"[^>]*>\s*/gi, '')
  .replace(/<link[^>]*rel="icon"[^>]*>\s*/gi, '')
  .replace(/<link[^>]*rel="apple-touch-icon"[^>]*>\s*/gi, '');
if (/\ssrc="\/assets\//.test(html) || /\shref="\/assets\//.test(html)) {
  console.error('Standalone build still references dist assets; refusing to write a broken file.');
  process.exit(1);
}

mkdirSync(resolve(root, 'public'), { recursive: true });
const out = resolve(root, 'public/kingdoms-of-the-forgotten-island.html');
writeFileSync(out, html, 'utf8');
console.log(`Standalone game written to ${out} (${Math.round(Buffer.byteLength(html) / 1024)} kB)`);
