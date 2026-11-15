// Independent verification of the bank. Reads only what is on disk plus the
// manifests, so it can catch a build that lied about its own output.
//
//   node tools/aegis/validate-bank.mjs
//
// Exits non-zero on any mismatch.

import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { BANK_DIR, DEPARTMENTS, CATEGORIES, TOTAL_REQUIRED } from './config.mjs';
import { imageInfo } from './lib.mjs';

const root = path.resolve(BANK_DIR);
const problems = [];
const notes = [];

const readJson = async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8'));

async function main() {
  const master = await readJson('manifest.json');
  const index = await readJson('MEMORY_INDEX/master_asset_index.json');
  const provenance = await readJson('MEMORY_INDEX/generation_provenance.json');
  const tags = await readJson('MEMORY_INDEX/asset_tags.json');

  const assets = index.assets || [];
  notes.push(`manifest total: ${master.total_assets}`);
  notes.push(`index entries: ${assets.length}`);

  if (assets.length !== master.total_assets) problems.push('index/manifest total mismatch');
  if (!master.partial && assets.length !== TOTAL_REQUIRED) {
    problems.push(`expected ${TOTAL_REQUIRED} assets, found ${assets.length}`);
  }

  // Per-collection, per-category exact counts.
  for (const dept of DEPARTMENTS) {
    const inDept = assets.filter((a) => a.collection === dept.key);
    const expected = master.partial ? null : 600;
    if (expected && inDept.length !== expected) {
      problems.push(`${dept.key}: ${inDept.length} assets, expected ${expected}`);
    }
    for (const c of CATEGORIES) {
      const n = inDept.filter((a) => a.category === c.key).length;
      const need = master.partial ? null : c.count;
      if (need && n !== need) problems.push(`${dept.key}/${c.key}: ${n} assets, expected ${need}`);
    }
  }

  // Every declared file must exist, be a real image, and match its record.
  const hashes = new Map();
  const seenIds = new Set();
  let verified = 0;

  for (const a of assets) {
    if (seenIds.has(a.asset_id)) problems.push(`duplicate asset_id ${a.asset_id}`);
    seenIds.add(a.asset_id);

    const abs = path.resolve(a.repository_path);
    let buf;
    try {
      buf = await readFile(abs);
    } catch {
      problems.push(`missing file ${a.repository_path}`);
      continue;
    }
    const info = imageInfo(buf);
    if (!info) {
      problems.push(`not a decodable image: ${a.repository_path}`);
      continue;
    }
    if (info.width !== a.dimensions.width || info.height !== a.dimensions.height) {
      problems.push(
        `${a.asset_id}: dimensions ${info.width}x${info.height} != manifest ${a.dimensions.width}x${a.dimensions.height}`,
      );
    }
    if ((info.format === 'svg' ? 'svg' : info.format) !== a.format) {
      problems.push(`${a.asset_id}: format ${info.format} != manifest ${a.format}`);
    }
    const h = createHash('sha256').update(buf).digest('hex');
    if (hashes.has(h)) problems.push(`identical content: ${a.asset_id} and ${hashes.get(h)}`);
    hashes.set(h, a.asset_id);
    verified++;
  }

  // Provenance coverage.
  const provIds = new Set((provenance.assets || []).map((p) => p.asset_id));
  for (const a of assets) if (!provIds.has(a.asset_id)) problems.push(`no provenance for ${a.asset_id}`);

  // No orphans on disk.
  let onDisk = 0;
  for (const dept of DEPARTMENTS) {
    for (const c of CATEGORIES) {
      const dir = path.join(root, dept.key, c.key);
      let files = [];
      try {
        files = await readdir(dir);
      } catch {
        continue;
      }
      onDisk += files.length;
      const declared = new Set(
        assets.filter((a) => a.collection === dept.key && a.category === c.key).map((a) => path.basename(a.repository_path)),
      );
      for (const f of files) if (!declared.has(f)) problems.push(`orphan file ${dept.key}/${c.key}/${f}`);
    }
  }
  notes.push(`files on disk: ${onDisk}`);
  notes.push(`files verified: ${verified}`);
  notes.push(`unique content hashes: ${hashes.size}`);
  notes.push(`tags indexed: ${tags.tag_count}`);

  const byFormat = assets.reduce((m, a) => ((m[a.format] = (m[a.format] || 0) + 1), m), {});
  notes.push(`formats: ${JSON.stringify(byFormat)}`);

  const bySource = (provenance.assets || []).reduce((m, p) => ((m[p.source] = (m[p.source] || 0) + 1), m), {});
  notes.push(`sources: ${JSON.stringify(bySource)}`);

  console.log(notes.join('\n'));
  if (problems.length) {
    console.error(`\n${problems.length} PROBLEM(S):`);
    for (const p of problems.slice(0, 40)) console.error('  - ' + p);
    process.exitCode = 1;
  } else {
    console.log('\nVALID: every declared asset exists, decodes, matches its manifest record, and is unique.');
  }
}

main().catch((err) => {
  console.error('VALIDATION FAILED:', err);
  process.exitCode = 1;
});
