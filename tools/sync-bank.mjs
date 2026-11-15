// Pull the live Graphics Command Center library into memory/graphics/catalog.csv.
// No dependencies: plain fetch + fs, so it runs in GitHub Actions untouched.
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.GCC_BASE || 'https://site-d460edd452c14327949ad468417abf82.freebuff.page';
const OUT = 'memory/graphics';

const getJson = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${res.statusText}`);
  return res.json();
};

const esc = (value) => {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const stats = await getJson('/api/stats');
const categories = Object.keys(stats.byCategory || {});
const records = new Map();

for (const category of categories) {
  for (let offset = 0; offset <= 900; offset += 100) {
    const page = await getJson(`/api/search?category=${encodeURIComponent(category)}&limit=100&offset=${offset}`);
    for (const record of page.records || []) records.set(record.id, record);
    if ((page.records || []).length < 100) break;
  }
}

const rows = [...records.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
const header = ['id', 'name', 'category', 'source', 'licence', 'width', 'height', 'palette', 'page_url'];
const body = rows.map((r) => [
  r.id,
  r.title,
  r.category,
  r.provider,
  [r.license, r.licenseClass].filter(Boolean).join(' · '),
  r.width,
  r.height,
  (r.palette || []).slice(0, 3).map((p) => p && p.hex).filter(Boolean).join(' '),
  r.pageUrl,
].map(esc).join(','));

await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/catalog.csv`, [header.join(','), ...body].join('\n') + '\n');

const summary = [
  '# Live library snapshot',
  '',
  `Fetched ${new Date().toISOString()} from ${BASE}.`,
  '',
  `- Assets: ${rows.length}`,
  `- Providers: ${Object.entries(stats.byProvider || {}).map(([k, v]) => `${k} ${v}`).join(', ')}`,
  `- Categories: ${categories.length}`,
  '',
  '| Category | Assets |',
  '| --- | --- |',
  ...Object.entries(stats.byCategory || {}).sort((a, b) => b[1] - a[1]).map(([cat, n]) => `| ${cat} | ${n} |`),
  '',
];
await writeFile('reports/library-snapshot.md', summary.join('\n'));

console.log(`catalog.csv: ${rows.length} assets across ${categories.length} categories`);
