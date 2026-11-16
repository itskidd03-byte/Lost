// Pull the live Graphics Command Center library into memory/graphics/catalog.csv.
// No dependencies: plain fetch + fs, so it runs in GitHub Actions untouched.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';

const BASE = process.env.GCC_BASE || 'https://site-d460edd452c14327949ad468417abf82.freebuff.page';
const OUT = 'memory/graphics';
const REPO = process.env.GITHUB_REPOSITORY || 'itskidd03-byte/Lost';
const BANK = 'AEGIS_GRAPHICS_MEMORY';
const BANK_PREFIX = {
  DARK_FUTURISTIC_INDUSTRIAL: 'dfi',
  PHOTOREALISTIC: 'phr',
  FANTASY_CINEMATIC: 'fcn',
};

const getJson = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${res.statusText}`);
  return res.json();
};

const esc = (value) => {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Assets whose files live in this repository: the AEGIS graphics memory bank.
// Each collection manifest is authoritative for its 600 files, so these records
// are merged into the catalogue and survive every re-sync.
const readBank = async () => {
  let entries;
  try {
    entries = await readdir(BANK, { withFileTypes: true });
  } catch {
    return { records: [], collections: [] };
  }
  const records = [];
  const collections = [];
  const dirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('MEMORY_'))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const dir of dirs) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(`${BANK}/${dir.name}/manifest.json`, 'utf8'));
    } catch {
      continue;
    }
    const assets = manifest.assets || [];
    const prefix = BANK_PREFIX[dir.name] || dir.name.toLowerCase();
    collections.push({ collection: dir.name, count: assets.length });
    for (const asset of assets) {
      if (!asset || !asset.asset_id || !asset.repository_path) continue;
      records.push({
        id: `aegis:${asset.asset_id}`,
        title: asset.name,
        category: `${prefix}-${asset.category}`,
        provider: 'aegis',
        license: asset.license,
        licenseClass: asset.source,
        width: asset.dimensions?.width ?? '',
        height: asset.dimensions?.height ?? '',
        palette: [],
        pageUrl: `https://github.com/${REPO}/blob/main/${asset.repository_path}`,
      });
    }
  }
  return { records, collections };
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

const bank = await readBank();
for (const record of bank.records) records.set(record.id, record);

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

const bankCategories = [...new Set(bank.records.map((record) => record.category))].sort();
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
  '## AEGIS graphics memory bank',
  '',
  'Real image files committed in this repository; listed from each collection manifest in',
  '`AEGIS_GRAPHICS_MEMORY/`. Catalogue ids are `aegis:<asset id>`.',
  '',
  `- Files: ${bank.records.length}`,
  ...bank.collections.map((entry) => `- ${entry.collection}: ${entry.count}`),
  `- Categories: ${bankCategories.length} (${bankCategories[0] || '—'} … ${bankCategories[bankCategories.length - 1] || '—'})`,
  '',
  '| Category | Assets |',
  '| --- | --- |',
  ...Object.entries(
    bank.records.reduce((acc, record) => {
      acc[record.category] = (acc[record.category] || 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cat, n]) => `| ${cat} | ${n} |`),
  '',
];
await writeFile('reports/library-snapshot.md', summary.join('\n'));

console.log(
  `catalog.csv: ${rows.length} assets (${rows.length - bank.records.length} live, ${bank.records.length} AEGIS) across ${new Set(rows.map((r) => r.category)).size} categories`,
);
