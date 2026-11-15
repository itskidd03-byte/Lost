// Core planning and acquisition loop for the AEGIS graphics bank.

import { createHash } from 'node:crypto';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { BANK_DIR, CATEGORIES } from './config.mjs';
import { imageInfo, titleCase, uniq, throttles } from './lib.mjs';
import { commonsSearch, metSearch, articSearch } from './sources.mjs';

export const MIN_LONG_EDGE = 640;
export const MIN_BYTES = 10_000;
export const MAX_BYTES = 12 * 1024 * 1024;

export const isGenerated = (cat) => cat === 'ui' || cat === 'effects';

export const SOURCE_LABEL = {
  wikimedia_commons: 'Wikimedia Commons',
  met_museum: 'The Metropolitan Museum of Art (Open Access)',
  art_institute_chicago: 'Art Institute of Chicago (Open Access)',
  poly_haven: 'Poly Haven',
};

export function categoryPlan(dept, limit) {
  let cursor = 1;
  return CATEGORIES.map((c) => {
    const count = limit ? Math.min(limit, c.count) : c.count;
    const plan = { ...c, count, start: cursor };
    cursor += count;
    return plan;
  });
}

// Generic top-up queries, used only if the collection-specific queries run
// dry. They keep exact counts reachable without ever reusing an asset.
const FALLBACK_QUERIES = {
  characters: ['statue figure', 'sculpture human figure', 'mannequin figure', 'portrait painting', 'costume figure'],
  architecture: ['historic building interior', 'architecture detail stone', 'building structure interior', 'facade detail'],
  environments: ['landscape panorama', 'interior space photograph', 'industrial landscape', 'night landscape'],
  objects: ['museum object artifact', 'tool implement antique', 'machine part metal', 'household object antique'],
  concepts: ['engraving illustration', 'technical illustration engraving', 'drawing study sketch', 'lithograph print'],
};

export function queryTasksFor(dept, category) {
  const tasks = [];
  const push = (fn, q) => tasks.push({ fn, q });
  const queries = dept.queries[category] || [];

  // Wikimedia gives the deepest pool, so it is the primary source everywhere.
  for (const q of queries) push(commonsSearch, q);

  if (['characters', 'objects', 'architecture', 'concepts'].includes(category)) {
    const metQueries = dept.id_prefix === 'FCN'
      ? queries
      : ['armor helmet', 'mechanical instrument', 'scientific apparatus', 'portrait photograph'];
    for (const q of metQueries) push(metSearch, q);
  }

  if (category === 'concepts' || category === 'characters') {
    const articQueries = dept.id_prefix === 'FCN' ? queries : ['machine drawing', 'industrial design drawing'];
    for (const q of articQueries) push(articSearch, q);
  }

  for (const q of FALLBACK_QUERIES[category] || []) push(commonsSearch, q);

  return tasks;
}

export function buildTags(dept, category, candidate, query) {
  const words = String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  return uniq([
    ...words,
    category,
    ...dept.palette_tags,
    ...(candidate.extra_tags || [])
      .flatMap((t) => String(t).toLowerCase().split(/[^a-z0-9]+/))
      .filter((w) => w.length > 2),
    candidate.source === 'poly_haven' ? 'texture' : 'photograph',
  ]).slice(0, 14);
}

export function describe(dept, categoryLabel, title, candidate) {
  const origin = SOURCE_LABEL[candidate.source] || candidate.source;
  return `${title} — ${categoryLabel.toLowerCase()} asset for the ${dept.name} collection, sourced from ${origin}.`;
}

export const sha256Of = (buf) => createHash('sha256').update(buf).digest('hex');

async function nextFromQueries(ctx) {
  while (ctx.tasks.length) {
    const task = ctx.tasks[0];
    let batch = [];
    try {
      if (task.fn === commonsSearch) {
        batch = await commonsSearch(task.q, { limit: 50, offset: task.offset || 0 });
      } else if (task.fn === metSearch) {
        batch = await metSearch(task.q, { limit: 40, offset: task.offset || 0 });
      } else {
        batch = await articSearch(task.q, { limit: 40, page: (task.offset || 0) + 1 });
      }
    } catch {
      batch = [];
    }
    if (batch.length) task.buffer = (task.buffer || []).concat(batch);
    task.offset = (task.offset || 0) + 1;
    const exhausted = batch.length === 0 || task.offset > 2;
    if (exhausted) ctx.tasks.shift();
    if (task.buffer && task.buffer.length) {
      const c = task.buffer.shift();
      if (ctx.tasks[0] !== task && exhausted && task.buffer.length) ctx.tasks.unshift(task);
      c.query = task.q;
      return c;
    }
  }
  return null;
}

// Fill one category. `tasks` is either a queue of query descriptors
// (queryLoader: true) or a list of ready candidates.
export async function fill(ctx) {
  const { dept, plan, dir, all, seenSourceIds, seenHashes, skipped } = ctx;
  let filled = 0;
  let idleRounds = 0;

  while (filled < plan.count) {
    if (idleRounds > 3) break;

    let candidate;
    if (ctx.queryLoader) {
      candidate = await nextFromQueries(ctx);
    } else {
      const next = ctx.tasks.shift();
      candidate = next ? next.candidate : null;
    }

    if (!candidate) {
      idleRounds++;
      continue;
    }
    if (seenSourceIds.has(candidate.source_id)) {
      skipped.duplicate++;
      continue;
    }

    let buf;
    try {
      const res = await throttles.download.run(() =>
        fetch(candidate.image_url, {
          headers: { 'User-Agent': 'AEGIS-GraphicsMemoryBank/1.0 (asset acquisition bot)' },
          redirect: 'follow',
        }),
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    } catch {
      skipped.fetch_error++;
      continue;
    }

    if (buf.length > MAX_BYTES) {
      skipped.oversize++;
      continue;
    }
    const info = imageInfo(buf);
    if (!info || !info.width || !info.height) {
      skipped.bad_data++;
      continue;
    }
    if (Math.max(info.width, info.height) < MIN_LONG_EDGE || buf.length < MIN_BYTES) {
      skipped.too_small++;
      continue;
    }

    const hash = await sha256Of(buf);
    if (seenHashes.has(hash)) {
      skipped.duplicate++;
      continue;
    }

    const assetId = `${dept.id_prefix}-${String(plan.start + filled).padStart(4, '0')}`;
    const ext = info.format;
    const file = `${assetId}.${ext}`;
    await writeFile(path.join(dir, file), buf);

    const title = (candidate.title || plan.label).replace(/\s+/g, ' ').trim().slice(0, 90);
    seenSourceIds.add(candidate.source_id);
    seenHashes.add(hash);

    all.push({
      asset_id: assetId,
      name: titleCase(title),
      style: dept.style,
      collection: dept.key,
      category: plan.key,
      category_label: plan.label,
      description: describe(dept, plan.label, title, candidate),
      tags: buildTags(dept, plan.key, candidate, candidate.query),
      format: ext,
      dimensions: { width: info.width, height: info.height },
      bytes: buf.length,
      sha256: hash,
      repository_path: `${BANK_DIR}/${dept.key}/${plan.key}/${file}`,
      license: candidate.license,
      license_url: candidate.license_url,
      source: candidate.source,
      source_url: candidate.source_url,
      creator: candidate.creator,
      credit: candidate.credit || null,
      retrieved_at: new Date().toISOString(),
      generation: { method: 'external_acquisition', pipeline: 'aegis@1.0.0' },
      verified: true,
    });
    filled++;
    idleRounds = 0;
    if (ctx.onAccepted) ctx.onAccepted(candidate);
  }
  return filled;
}
