// Turn MEMORY_INDEX/assets.json into the compact view model the gallery page
// loads. No dependencies: it only reshapes the index and resolves previews.
//
//   node tools/asset-bank/build-gallery.mjs
//
// The gallery itself is static (asset-gallery/index.html); this file only keeps
// asset-gallery/assets.json in step with the bank.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';

const BANK = 'ASSET_MEMORY_BANK';
const OUT = 'asset-gallery/assets.json';
const IMAGE = /\.(png|jpe?g|webp|gif|svg)$/i;

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

// The bank stores paths relative to itself; the page lives one level up.
const toUrl = (rel) => `../${BANK}/${encodeURI(rel)}`;

const records = JSON.parse(await readFile(`${BANK}/MEMORY_INDEX/assets.json`, 'utf8'));

let localPreviews = 0;
let remotePreviews = 0;
let missingPreviews = 0;

const assets = [];
for (const rec of records) {
  const files = rec.files || [];
  const imageFile =
    files.find((f) => /_Color\.(jpe?g|png)$/i.test(f.path)) ||
    files.find((f) => /_Albedo\.(jpe?g|png)$/i.test(f.path)) ||
    files.find((f) => IMAGE.test(f.path));

  let thumb = '';
  if (rec.thumbnail && /^https?:/.test(rec.thumbnail)) {
    thumb = rec.thumbnail;
    remotePreviews++;
  } else if (rec.thumbnail && (await exists(path.join(BANK, rec.thumbnail)))) {
    thumb = toUrl(rec.thumbnail);
    localPreviews++;
  } else if (imageFile) {
    thumb = toUrl(imageFile.path);
    localPreviews++;
  } else {
    missingPreviews++;
  }

  assets.push({
    id: rec.asset_id,
    name: rec.name,
    category: rec.category,
    subcategory: rec.subcategory || '',
    kind: rec.kind,
    source: rec.source,
    creator: rec.creator,
    license: rec.license,
    page: rec.source_repository,
    thumb,
    bytes: rec.bytes || 0,
    formats: rec.formats || [],
    triangles: rec.polygons || 0,
    textures: rec.textures || 0,
    animations: rec.animations || [],
    tags: (rec.tags || []).slice(0, 12),
    summary: rec.summary || '',
    resolution: rec.resolution || '',
    files: files.map((f) => ({
      path: f.path,
      url: toUrl(f.path),
      format: f.format || path.extname(f.path).slice(1),
      bytes: f.bytes || 0,
      triangles: f.triangles || 0,
      width: f.width || 0,
      height: f.height || 0,
      animations: f.animations || [],
    })),
  });
}

assets.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

const byCategory = {};
for (const asset of assets) byCategory[asset.category] = (byCategory[asset.category] || 0) + 1;

const payload = {
  generated: new Date().toISOString(),
  totals: {
    assets: assets.length,
    files: assets.reduce((n, a) => n + a.files.length, 0),
    bytes: assets.reduce((n, a) => n + a.bytes, 0),
    clips: assets.reduce((n, a) => n + a.animations.length, 0),
  },
  counts: byCategory,
  assets,
};

await mkdir('asset-gallery', { recursive: true });
await writeFile(OUT, JSON.stringify(payload));
console.log(
  `gallery index: ${assets.length} assets, previews ${localPreviews} local / ${remotePreviews} remote / ${missingPreviews} without a preview -> ${OUT}`,
);
