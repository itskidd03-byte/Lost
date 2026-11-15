// AEGIS graphics memory bank — acquisition, validation and indexing.
//
//   node tools/aegis/build-assets.mjs            full run (1,800 assets)
//   node tools/aegis/build-assets.mjs --limit=3  smoke test (3 per category)
//   node tools/aegis/build-assets.mjs --only=DFI restrict to one collection
//
// The bank is only considered built when every category reaches its required
// count with distinct, decodable files. Anything short exits non-zero.

import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { BANK_DIR, DEPARTMENTS, CATEGORIES, PIPELINE_VERSION, TOTAL_REQUIRED } from './config.mjs';
import { uniq } from './lib.mjs';
import { polyHavenTextures } from './sources.mjs';
import { generateUiAsset } from './gen-ui.mjs';
import { generateEffectAsset } from './gen-fx.mjs';
import {
  categoryPlan, queryTasksFor, fill, isGenerated, sha256Of,
} from './build-core.mjs';

const args = process.argv.slice(2);
const argValue = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const LIMIT = Number(argValue('limit') || 0);
const ONLY = argValue('only');

const root = path.resolve(BANK_DIR);
const nowIso = () => new Date().toISOString();
const json = (obj) => JSON.stringify(obj, null, 2) + '\n';

async function main() {
  const startedAt = nowIso();
  const seenSourceIds = new Set();
  const seenHashes = new Set();
  const all = [];
  const shortfalls = [];
  const skipped = { duplicate: 0, too_small: 0, bad_data: 0, fetch_error: 0, oversize: 0 };
  const usedPolyHaven = new Set();

  const departments = DEPARTMENTS.filter((d) => !ONLY || d.id_prefix === ONLY);

  for (const dept of departments) {
    const plans = categoryPlan(dept, LIMIT);
    console.log(`\n=== ${dept.name} (${dept.id_prefix}) ===`);

    for (const plan of plans) {
      const dir = path.join(root, dept.key, plan.key);
      await mkdir(dir, { recursive: true });
      let filled = 0;

      // Rebuild cleanly: a rerun must never leave files the index does not declare.
      if (!LIMIT) {
        for (const f of await readdir(dir).catch(() => [])) {
          await rm(path.join(dir, f), { force: true });
        }
      }

      if (isGenerated(plan.key)) {
        for (let i = 0; i < plan.count; i++) {
          const assetId = `${dept.id_prefix}-${String(plan.start + i).padStart(4, '0')}`;
          const seed = parseInt(createHash('sha1').update(assetId).digest('hex').slice(0, 8), 16);
          const gen = plan.key === 'ui'
            ? generateUiAsset({ palette: dept.palette, index: i, seed })
            : generateEffectAsset({ palette: dept.palette, index: i, seed });
          const buf = Buffer.from(gen.svg, 'utf8');
          const info = { width: gen.width, height: gen.height };
          const file = `${assetId}.svg`;
          await writeFile(path.join(dir, file), buf);
          all.push({
            asset_id: assetId,
            name: `${dept.name} ${gen.name}`,
            style: dept.style,
            collection: dept.key,
            category: plan.key,
            category_label: plan.label,
            description: `${gen.name} for the ${dept.name} collection — original procedural ${plan.key} asset.`,
            tags: uniq([...gen.tags, plan.key, ...dept.palette_tags]).slice(0, 14),
            format: 'svg',
            dimensions: { width: info.width, height: info.height },
            bytes: buf.length,
            sha256: await sha256Of(buf),
            repository_path: `${BANK_DIR}/${dept.key}/${plan.key}/${file}`,
            license: 'original_generated',
            license_url: null,
            source: 'aegis_procedural_generator',
            source_url: null,
            creator: 'AEGIS graphics pipeline',
            credit: null,
            retrieved_at: nowIso(),
            generation: { method: 'procedural_synthesis', pipeline: `aegis@${PIPELINE_VERSION}`, kind: gen.kind, seed },
            verified: true,
          });
          filled++;
        }
        console.log(`  ${plan.key.padEnd(13)} ${filled}/${plan.count} generated`);
        continue;
      }

      if (plan.key === 'textures') {
        const pool = await polyHavenTextures(dept.texture_categories, {
          exclude: usedPolyHaven,
          wanted: plan.count + 12,
        });
        filled = await fill({
          dept, plan, dir, all, seenSourceIds, seenHashes, skipped,
          tasks: pool.map((c) => ({ candidate: c })),
          onAccepted: (c) => usedPolyHaven.add(c.source_id.replace('polyhaven:', '')),
        });
        if (filled < plan.count) shortfalls.push({ dept: dept.key, category: plan.key, got: filled, need: plan.count });
        console.log(`  ${plan.key.padEnd(13)} ${filled}/${plan.count} (Poly Haven CC0)`);
        continue;
      }

      filled = await fill({
        dept, plan, dir, all, seenSourceIds, seenHashes, skipped, queryLoader: true,
        tasks: queryTasksFor(dept, plan.key).map((t) => ({ ...t, offset: 0 })),
      });
      if (filled < plan.count) shortfalls.push({ dept: dept.key, category: plan.key, got: filled, need: plan.count });
      console.log(`  ${plan.key.padEnd(13)} ${filled}/${plan.count} acquired`);
    }
  }

  await writeManifests({ all, departments, startedAt, shortfalls });

  console.log(`\nTotal verified assets: ${all.length}${LIMIT ? ' (partial run)' : `/${TOTAL_REQUIRED}`}`);
  console.log('Skipped:', skipped);
  if (shortfalls.length) {
    console.error('\nSHORTFALLS (collection incomplete):');
    for (const s of shortfalls) console.error(`  ${s.dept}/${s.category}: ${s.got}/${s.need}`);
    process.exitCode = 1;
  }
}

async function writeManifests({ all, departments, startedAt, shortfalls }) {
  await mkdir(path.join(root, 'MEMORY_INDEX'), { recursive: true });

  const byId = [...all].sort((a, b) => a.asset_id.localeCompare(b.asset_id));
  const collectionSummaries = [];

  for (const dept of departments) {
    const assets = byId.filter((a) => a.collection === dept.key);
    const cats = {};
    for (const c of CATEGORIES) {
      const inCat = assets.filter((a) => a.category === c.key);
      cats[c.key] = {
        label: c.label,
        required: LIMIT ? Math.min(LIMIT, c.count) : c.count,
        actual: inCat.length,
        directory: `${BANK_DIR}/${dept.key}/${c.key}/`,
        asset_ids: inCat.map((a) => a.asset_id),
      };
    }
    await writeFile(path.join(root, dept.key, 'manifest.json'), json({
      collection: dept.key,
      display_name: dept.name,
      style: dept.style,
      id_prefix: dept.id_prefix,
      total_required: LIMIT ? CATEGORIES.reduce((s, c) => s + Math.min(LIMIT, c.count), 0) : 600,
      total_actual: assets.length,
      partial: Boolean(LIMIT),
      categories: cats,
      assets,
    }));
    collectionSummaries.push({
      collection: dept.key,
      display_name: dept.name,
      style: dept.style,
      id_prefix: dept.id_prefix,
      id_range: assets.length ? `${assets[0].asset_id} - ${assets[assets.length - 1].asset_id}` : null,
      total: assets.length,
      path: `${BANK_DIR}/${dept.key}/`,
      manifest: `${BANK_DIR}/${dept.key}/manifest.json`,
    });
  }

  const formats = {};
  for (const a of byId) formats[a.format] = (formats[a.format] || 0) + 1;

  await writeFile(path.join(root, 'manifest.json'), json({
    bank: BANK_DIR,
    version: PIPELINE_VERSION,
    generated_at: nowIso(),
    started_at: startedAt,
    partial: Boolean(LIMIT),
    total_assets: byId.length,
    total_required: TOTAL_REQUIRED,
    categories_per_collection: CATEGORIES.map((c) => ({ category: c.key, label: c.label, count: c.count })),
    collections: collectionSummaries,
    formats,
    licensing: {
      external: 'CC0 / public domain / CC BY only — attribution recorded per asset in MEMORY_INDEX/generation_provenance.json',
      original: 'original_generated — produced by tools/aegis/gen-ui.mjs and gen-fx.mjs',
    },
    indexes: [
      'MEMORY_INDEX/master_asset_index.json',
      'MEMORY_INDEX/category_index.json',
      'MEMORY_INDEX/style_index.json',
      'MEMORY_INDEX/asset_tags.json',
      'MEMORY_INDEX/retrieval_metadata.json',
      'MEMORY_INDEX/generation_provenance.json',
    ],
    shortfalls: shortfalls || [],
  }));

  await writeFile(path.join(root, 'MEMORY_INDEX', 'master_asset_index.json'), json({
    generated_at: nowIso(),
    total: byId.length,
    assets: byId.map((a) => ({
      asset_id: a.asset_id,
      name: a.name,
      style: a.style,
      collection: a.collection,
      category: a.category,
      description: a.description,
      tags: a.tags,
      format: a.format,
      dimensions: a.dimensions,
      repository_path: a.repository_path,
      license: a.license,
      source_url: a.source_url,
      verified: a.verified,
    })),
  }));

  const categoryIndex = {};
  for (const c of CATEGORIES) {
    const inCat = byId.filter((a) => a.category === c.key);
    categoryIndex[c.key] = {
      label: c.label,
      total: inCat.length,
      required_per_collection: c.count,
      by_style: inCat.reduce((m, a) => ((m[a.style] = (m[a.style] || 0) + 1), m), {}),
      asset_ids: inCat.map((a) => a.asset_id),
    };
  }
  await writeFile(path.join(root, 'MEMORY_INDEX', 'category_index.json'), json(categoryIndex));

  const styleIndex = {};
  for (const dept of departments) {
    const inStyle = byId.filter((a) => a.style === dept.style);
    styleIndex[dept.style] = {
      display_name: dept.name,
      id_prefix: dept.id_prefix,
      total: inStyle.length,
      palette: dept.palette,
      visual_keywords: dept.keywords,
      palette_tags: dept.palette_tags,
      categories: inStyle.reduce((m, a) => ((m[a.category] = (m[a.category] || 0) + 1), m), {}),
      search_hints: dept.keywords,
    };
  }
  await writeFile(path.join(root, 'MEMORY_INDEX', 'style_index.json'), json(styleIndex));

  const tagIndex = {};
  for (const a of byId) for (const t of a.tags) (tagIndex[t] = tagIndex[t] || []).push(a.asset_id);
  await writeFile(path.join(root, 'MEMORY_INDEX', 'asset_tags.json'), json({
    generated_at: nowIso(),
    tag_count: Object.keys(tagIndex).length,
    tags: Object.fromEntries(Object.entries(tagIndex).sort((a, b) => b[1].length - a[1].length)),
  }));

  await writeFile(path.join(root, 'MEMORY_INDEX', 'retrieval_metadata.json'), json({
    generated_at: nowIso(),
    bank: BANK_DIR,
    asset_count: byId.length,
    id_scheme: {
      DARK_FUTURISTIC_INDUSTRIAL: 'DFI-0001 .. DFI-0600',
      PHOTOREALISTIC: 'PHR-0001 .. PHR-0600',
      FANTASY_CINEMATIC: 'FCN-0001 .. FCN-0600',
    },
    searchable_fields: {
      style: Object.keys(styleIndex),
      category: CATEGORIES.map((c) => c.key),
      object_type: 'asset_tags.json (tag -> asset ids)',
      environment: 'asset_tags.json',
      colour_palette: 'style_index.json palette + palette_tags',
      material: 'asset_tags.json (textures carry material names)',
      character_type: 'category "characters" + tags',
      intended_application: 'tags: ui, hud, vfx, overlay, texture, photograph',
      descriptive_keywords: 'tags',
    },
    record_shape: {
      asset_id: 'stable unique id',
      name: 'human readable',
      style: 'collection style key',
      category: 'category key',
      description: 'one sentence',
      tags: 'searchable keywords',
      format: 'file extension',
      dimensions: '{ width, height }',
      repository_path: 'path inside this repository',
      license: 'licence string or original_generated',
      source_url: 'provenance page for externally acquired assets',
      verified: 'true once the file was decoded and measured',
    },
    join_keys: ['asset_id', 'repository_path'],
    tag_index: 'MEMORY_INDEX/asset_tags.json',
    no_vector_store_assumed: true,
    notes:
      'Indexes are plain JSON for transport. If a vector memory is later attached, embed ' +
      '"name + description + tags" per asset using asset_id as the stable key; do not rewrite ' +
      'existing collections — add a new namespace instead.',
  }));

  await writeFile(path.join(root, 'MEMORY_INDEX', 'generation_provenance.json'), json({
    generated_at: nowIso(),
    pipeline: { name: 'aegis-graphics-bank', version: PIPELINE_VERSION, builder: 'tools/aegis/build-assets.mjs' },
    policy: {
      accepted_licenses: ['CC0 1.0', 'Public domain', 'CC BY (attribution recorded)'],
      rejected_licenses: ['CC BY-SA', 'CC BY-NC', 'CC BY-ND', 'fair use'],
      original_assets: 'original_generated — procedurally synthesised by this pipeline',
      duplicates_rejected_by: ['sha256 content hash', 'source asset id'],
    },
    assets: byId.map((a) => ({
      asset_id: a.asset_id,
      generation: a.generation,
      source: a.source,
      source_url: a.source_url,
      creator: a.creator,
      credit: a.credit || null,
      license: a.license,
      license_url: a.license_url,
      retrieved_at: a.retrieved_at,
      sha256: a.sha256,
      bytes: a.bytes,
      dimensions: a.dimensions,
      format: a.format,
    })),
  }));

  const counts = CATEGORIES.map((c) => {
    const n = byId.filter((a) => a.category === c.key).length;
    return `| ${c.label} | ${c.count} | ${n} |`;
  }).join('\n');

  await writeFile(path.join(root, 'README.md'), `# AEGIS Graphics Memory Bank

Permanent, searchable graphics memory for AEGIS departments. This directory holds
**${byId.length} actual graphics files** — decoded, measured and indexed — not links.

Generated ${nowIso()} by \`tools/aegis/build-assets.mjs\` (pipeline \`aegis@${PIPELINE_VERSION}\`).

## Collections

| Collection | Id prefix | Assets | Directory |
|---|---|---:|---|
${collectionSummaries.map((c) => `| ${c.display_name} | ${c.id_prefix} | ${c.total} | \`${c.path}\` |`).join('\n')}

## Categories

| Category | Required per collection | Present |
|---|---:|---:|
${counts}

## Licensing

* Externally acquired assets are **CC0, public domain or CC BY** only. CC BY-SA,
  CC BY-NC and CC BY-ND are rejected by the pipeline. Per-asset source page,
  creator and licence are recorded in \`MEMORY_INDEX/generation_provenance.json\`.
* \`ui/\` and \`effects/\` assets are \`original_generated\`: original procedural
  vector art authored in \`tools/aegis/gen-ui.mjs\` and \`gen-fx.mjs\`.

## Retrieval

Start at \`MEMORY_INDEX/retrieval_metadata.json\`, then use
\`MEMORY_INDEX/asset_tags.json\` for keyword lookup and
\`MEMORY_INDEX/master_asset_index.json\` for full records. Every record carries a
stable \`asset_id\` and its \`repository_path\`.

## Rebuilding

\`\`\`bash
node tools/aegis/build-assets.mjs          # acquire + generate + index
node tools/aegis/validate-bank.mjs         # independent verification
\`\`\`

The \`AEGIS graphics memory bank\` workflow runs the same commands and commits new
assets in batches of 25.
`);
}

if (process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  main().catch((err) => {
    console.error('BUILD FAILED:', err);
    process.exitCode = 1;
  });
}
