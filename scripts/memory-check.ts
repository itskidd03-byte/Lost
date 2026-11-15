/**
 * Live check of the memory bank + art direction layer.
 * Run: npx esbuild scripts/memory-check.ts --bundle --platform=node --format=esm --outfile=.smoke/memory.mjs && node .smoke/memory.mjs
 */
import { artDirection, MATERIAL_LABELS, type MaterialKey } from '../src/render/artDirection';
import { fetchBankStats, searchReferences } from '../src/data/memoryBank';

const stats = await fetchBankStats();
console.log(`Library: ${stats.total} records (${stats.highRes} high-res, ${stats.analyzed} analysed)`);
console.log(`Licences: ${Object.entries(stats.byLicense).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`Providers: ${Object.entries(stats.byProvider).map(([k, v]) => `${k} ${v}`).join(' · ')}`);

const sample = await searchReferences({ category: 'tex-wood', limit: 3 });
console.log(`\ntex-wood sample: ${sample.total} total, first = "${sample.records[0]?.title}" (${sample.records[0]?.license})`);

await artDirection.load();
console.log(`\nArt direction status: ${artDirection.status}${artDirection.error ? ` — ${artDirection.error}` : ''}`);
for (const key of Object.keys(MATERIAL_LABELS) as MaterialKey[]) {
  const choice = artDirection.choices[key];
  console.log(
    `${key.padEnd(8)} ${choice.hex}  source: ${choice.source ? `${choice.source.title} [${choice.source.category}, ${choice.source.license}]` : 'baked fallback'}`
  );
}

const referenced = (Object.keys(MATERIAL_LABELS) as MaterialKey[]).filter((key) => artDirection.choices[key].source);
console.log(`\nMaterials grounded in real references: ${referenced.length}/${Object.keys(MATERIAL_LABELS).length}`);
console.log(`Attributions carried into the game: ${artDirection.attributions().length}`);

// Adopting a specific reference must change the rendered colour and keep attribution.
const adoptable = sample.records.find((record) => record.palette?.length);
if (!adoptable) {
  console.error('FAIL: no adoptable record in sample');
  process.exitCode = 1;
} else {
  const before = artDirection.hex('stone');
  const versionBefore = artDirection.version;
  artDirection.adopt('stone', adoptable);
  const after = artDirection.hex('stone');
  const kept = artDirection.attributions().some((record) => record.id === adoptable.id);
  console.log(`Adopted “${adoptable.title}” for stone: ${before} → ${after}${kept ? ' · attribution kept' : ''}`);
  if (after === before || artDirection.version === versionBefore || !kept) {
    console.error('FAIL: adoption did not apply cleanly');
    process.exitCode = 1;
  }
}

if (stats.total < 100 || referenced.length === 0) {
  console.error('MEMORY BANK CHECK FAILED');
  process.exitCode = 1;
} else {
  console.log('MEMORY BANK CHECK PASSED');
}
