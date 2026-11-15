// Sectors: the table is worked one block of 20×20 ground at a time.
//
// Each sector gets its own pair of hands — a dresser who only reskins and moulds
// (never places ground) and a builder who extends the ground inside that sector
// so Johan only has to lay the first stones. When the table reaches a new band of
// 20×20, a fresh dresser and builder are deployed for the new sectors, in order.

import { addEvent } from './journal.js';
import {
  BIOMES, bounds, claimTile, isLand, key, refineTile, setBiome, tileAt,
} from './world.js';

export const SECTOR = 20;

const DRESSERS = ['Jolene', 'Maren', 'Ivy', 'Sable', 'Wren', 'Tamsin', 'Odile', 'Perrin', 'Lark', 'Mirabel', 'Cyan', 'Ysolde'];
const BUILDERS = ['Johan', 'Oren', 'Bram', 'Silas', 'Hollis', 'Emeric', 'Rook', 'Cassian', 'Ansel', 'Dorian', 'Fen', 'Tobiah'];

const MEADOW_BIOMES = new Set(['grass', 'meadow', 'blackgrass', 'tundra', 'island', 'hills']);
const RIDGE_BIOMES = new Set(['hills', 'mountain', 'peak']);

function inSector(tile, sector) {
  return (
    tile.x >= sector.sx * SECTOR && tile.x < (sector.sx + 1) * SECTOR &&
    tile.y >= sector.sy * SECTOR && tile.y < (sector.sy + 1) * SECTOR
  );
}

export function sectorTiles(state, sector) {
  const out = [];
  for (const t of state.world.tiles.values()) if (inSector(t, sector)) out.push(t);
  return out;
}

function free(tile, world) {
  return tile && isLand(tile) && !tile.settlementId && !world.protected.has(key(tile.x, tile.y));
}

/* ------------------------------- deployment ------------------------------- */

export function ensureCrew(state) {
  state.sectors = state.sectors || [];
  state.crewBand = state.crewBand || 0;

  const assigned = new Set(state.sectors.map((s) => s.id));
  const waiting = new Map();
  for (const t of state.world.tiles.values()) {
    const sx = Math.floor(t.x / SECTOR);
    const sy = Math.floor(t.y / SECTOR);
    const id = `${sx}:${sy}`;
    if (!assigned.has(id) && !waiting.has(id)) waiting.set(id, { sx, sy });
  }
  if (!waiting.size) return [];

  const b = bounds(state.world);
  const band = Math.max(Math.ceil(b.cols / SECTOR), Math.ceil(b.rows / SECTOR));
  const deploying = band > state.crewBand;
  if (deploying) state.crewBand = band;

  const ordered = [...waiting.values()].sort(
    (a, c) => a.sx * a.sx + a.sy * a.sy - (c.sx * c.sx + c.sy * c.sy) || a.sx - c.sx || a.sy - c.sy,
  );
  const deployed = [];
  for (const s of ordered) {
    const n = state.sectors.length;
    const sector = {
      id: `${s.sx}:${s.sy}`,
      sx: s.sx,
      sy: s.sy,
      dresser: DRESSERS[n % DRESSERS.length],
      builder: BUILDERS[n % BUILDERS.length],
      deployedDay: state.world.day,
      lastDay: state.world.day,
      dressed: 0,
      works: 0,
      built: 0,
    };
    state.sectors.push(sector);
    deployed.push(sector);
  }

  if (deploying && deployed.length) {
    const list = deployed.map((s) => `${s.dresser} dresses ${s.sx},${s.sy} with ${s.builder}`).join('; ');
    addEvent(state, {
      category: 'jolene',
      type: 'crew',
      title: deployed.length === 1
        ? `${deployed[0].dresser} takes sector ${deployed[0].sx},${deployed[0].sy}`
        : `${deployed.length} new hands for the ${band * SECTOR}×${band * SECTOR} table`,
      detail: `The ground spans ${b.cols}×${b.rows} tiles, so the table is worked in 20×20 sectors. ${list}. Each dresser moulds only her own ground — meadows levelled, rivers run across tiles, ranges stacked higher each pass — and Johan only has to place.`,
      where: `${b.minX}–${b.maxX}, ${b.minY}–${b.maxY}`,
      important: true,
      consequence: 'Sectors are worked in order, one full block at a time.',
    });
  }
  return deployed;
}

export function crewSummary(state) {
  const sectors = state.sectors || [];
  if (!sectors.length) return 'No sector crews are on the table yet.';
    return sectors
    .map((s) => {
      const works = [];
      if (s.meadows) works.push(`${s.meadows} meadow${s.meadows === 1 ? '' : 's'}`);
      if (s.ranges) works.push(`${s.ranges} range${s.ranges === 1 ? '' : 's'}`);
      if (s.rivers) works.push(`${s.rivers} river${s.rivers === 1 ? '' : 's'}`);
      const made = works.length ? works.join(', ') : 'detail passes only';
      return `${s.dresser} dresses sector ${s.sx},${s.sy} — ${made}, ${s.dressed} passes. ${s.builder} builds there, ${s.built} tiles raised.`;
    })
    .join('\n');
}

/* --------------------------------- work ---------------------------------- */

function repaint(state, sector, rand, land) {
  const fresh = land.filter((t) => (t.changedDay ?? 0) >= state.world.day - 2 && (t.detail ?? 0) < 0.95);
  const pool = fresh.length ? fresh : land.filter((t) => (t.detail ?? 0) < 0.95);
  if (!pool.length) return false;
  const tile = pool[Math.floor(rand() * pool.length)];
  tile.detail = Math.min(1, (tile.detail ?? 0.4) + 0.28);
  tile.polishedDay = state.world.day;
  sector.dressed += 1;
  state.jolene = state.jolene || { polished: 0, lastDay: 0, lastTile: null };
  state.jolene.polished += 1;
  state.jolene.reskinned = (state.jolene.reskinned || 0) + 1;
  state.jolene.lastDay = state.world.day;
  state.jolene.lastTile = { x: tile.x, y: tile.y };
  return true;
}

// Flat meadows: pull the whole run of soft ground to one level so it reads as a
// single field instead of a row of blocks.
function moldMeadow(state, sector, rand, land) {
  const meadow = land.filter((t) => MEADOW_BIOMES.has(t.biome) && free(t, state.world));
  if (meadow.length < 6) return false;
  const avg = meadow.reduce((sum, t) => sum + t.elevation, 0) / meadow.length;
  for (const t of meadow) {
    t.elevation += (avg - t.elevation) * 0.72;
    t.detail = Math.min(1, Math.max(0.55, (t.detail ?? 0.3) + 0.14));
    t.polishedDay = state.world.day;
    t.changedDay = state.world.day;
  }
  sector.dressed += 1;
  sector.meadows = (sector.meadows || 0) + 1;
  if (rand() < 0.7) {
    addEvent(state, {
      category: 'jolene',
      type: 'polish',
      title: `${sector.dresser} levelled a meadow at ${sector.sx},${sector.sy}`,
      detail: `${meadow.length} tiles of ground were pulled to a single height and their grass combed out. She placed nothing; she only flattened what was already there.`,
      where: `${sector.sx * SECTOR}–${sector.sx * SECTOR + SECTOR - 1}, ${sector.sy * SECTOR}–${sector.sy * SECTOR + SECTOR - 1}`,
      consequence: 'A field where there were blocks.',
    });
  }
  return true;
}

// Stacked ranges: one pass lifts the rock, the next lifts it again, so ridges
// grow over several visits instead of appearing at full height.
function stackRange(state, sector, rand, land) {
  const rocky = land.filter((t) => RIDGE_BIOMES.has(t.biome) && free(t, state.world));
  if (!rocky.length) return false;
  const start = rocky[Math.floor(rand() * rocky.length)];
  const dir = rand() < 0.5 ? [1, 0] : [0, 1];
  const length = 3 + Math.floor(rand() * 4);
  const touched = [];
  for (let i = 0; i < length; i++) {
    const t = tileAt(state.world, start.x + dir[0] * i, start.y + dir[1] * i);
    if (!t || !inSector(t, sector) || !free(t, state.world)) continue;
    setBiome(t, i === length - 1 ? 'peak' : i === 0 ? 'hills' : 'mountain');
    t.elevation = Math.min(1.5, (t.elevation ?? 0.6) + 0.1 + i * 0.03);
    t.detail = Math.min(1, (t.detail ?? 0.4) + 0.2);
    t.polishedDay = state.world.day;
    t.changedDay = state.world.day;
    touched.push(t);
  }
  if (touched.length < 2) return false;
  sector.dressed += 1;
  sector.ranges = (sector.ranges || 0) + 1;
  if (rand() < 0.7) {
    addEvent(state, {
      category: 'jolene',
      type: 'polish',
      title: `${sector.dresser} stacked a range at ${start.x},${start.y}`,
      detail: `She moulded ${touched.length} blocks into a ridge and lifted the rock again — shoulders, then peaks. Nothing new was placed; the same ground now stands higher.`,
      where: `${start.x},${start.y}`,
      consequence: 'The passes are harder and the snowline is higher.',
    });
  }
  return true;
}

// Rivers across tiles, cut only through ground that already exists.
function runRiver(state, sector, rand, land) {
  if (land.length < 8) return false;
  const tiles = sectorTiles(state, sector);
  if (tiles.some((t) => BIOMES[t.biome]?.water)) return false;
  const start = land[Math.floor(rand() * land.length)];
  let x = start.x;
  let y = start.y;
  let dir = [[1, 0], [0, 1], [-1, 0], [0, -1]][Math.floor(rand() * 4)];
  const length = 6 + Math.floor(rand() * 7);
  const touched = [];
  for (let i = 0; i < length; i++) {
    const t = tileAt(state.world, x, y);
    if (t && inSector(t, sector) && free(t, state.world)) {
      setBiome(t, 'river');
      t.fertility = 0.82;
      t.elevation = Math.max(-0.1, 0.05 - i * 0.006);
      t.polishedDay = state.world.day;
      t.changedDay = state.world.day;
      touched.push(t);
    }
    if (rand() < 0.28) dir = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]][Math.floor(rand() * 8)];
    x += dir[0];
    y += dir[1];
  }
  if (touched.length < 3) return false;
  sector.dressed += 1;
  sector.rivers = (sector.rivers || 0) + 1;
  addEvent(state, {
    category: 'jolene',
    type: 'polish',
    title: `${sector.dresser} ran a river through ${start.x},${start.y}`,
    detail: `${touched.length} tiles of dry ground were moulded down into one channel that runs across the sector. The banks keep their fields; only the bed went under.`,
    where: `${start.x},${start.y}`,
    consequence: 'Water now crosses this sector, and the fields beside it drink.',
  });
  return true;
}

// The sector's builder extends the ground inside its own block so Johan only
// has to lay the first stones.
function buildGround(state, sector, rand, tiles) {
  if (state.world.tiles.size >= 1200) return false;
  const spots = [];
  for (const t of tiles) {
    if (!isLand(t)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = t.x + dx;
      const ny = t.y + dy;
      if (Math.floor(nx / SECTOR) !== sector.sx || Math.floor(ny / SECTOR) !== sector.sy) continue;
      const k = key(nx, ny);
      if (state.world.tiles.has(k) || state.world.protected.has(k)) continue;
      spots.push({ x: nx, y: ny });
    }
  }
  if (!spots.length) return false;
  const spot = spots[Math.floor(rand() * spots.length)];
  const tile = claimTile(state.world, spot.x, spot.y, 'blackgrass', rand);
  tile.changedDay = state.world.day;
  sector.built += 1;
  sector.works += 1;
  return true;
}

/* ------------------------------ direct orders ----------------------------- */

export function sectorByDresser(state, name) {
  const wanted = String(name || '').toLowerCase();
  return (state.sectors || []).find((s) => s.dresser.toLowerCase() === wanted) || null;
}

// A named dresser takes an order by hand: she works only her own ground.
export function dressSector(state, sector, instruction, rand = Math.random) {
  const tiles = sectorTiles(state, sector);
  const land = tiles.filter(isLand);
  const text = String(instruction || '').toLowerCase();
  if (!tiles.length) {
    return { ok: false, category: 'jolene', title: `${sector.dresser} has no ground in sector ${sector.sx},${sector.sy} yet.` };
  }
  sector.lastDay = state.world.day;
  const done = (title, detail) => ({ ok: true, category: sector.dresser.toLowerCase(), title, detail });

  if (/(flat|level|meadow|field|plain)/.test(text)) {
    if (moldMeadow(state, sector, rand, land)) {
      return done(`${sector.dresser} levelled a meadow in ${sector.id}`, 'The ground there now sits at one height, with the grass combed out.');
    }
    return { ok: false, category: 'jolene', title: `${sector.dresser} found no meadow to flatten in ${sector.id}.` };
  }

  if (/(river|water|stream|creek)/.test(text)) {
    if (runRiver(state, sector, rand, land)) {
      return done(`${sector.dresser} ran water through ${sector.id}`, 'A channel now crosses her sector; only ground that already existed went under.');
    }
    return { ok: false, category: 'jolene', title: `${sector.dresser} cannot run water there yet — too little dry ground, or water already crosses it.` };
  }

  if (/(mountain|peak|ridge|range|hill)/.test(text)) {
    if (stackRange(state, sector, rand, land)) {
      return done(`${sector.dresser} stacked a range in ${sector.id}`, 'Shoulders, then peaks — the same blocks, raised another pass higher.');
    }
    return { ok: false, category: 'jolene', title: `${sector.dresser} found no rock to lift in ${sector.id}.` };
  }

  if (repaint(state, sector, rand, land)) {
    return done(`${sector.dresser} repainted ${sector.id}`, 'Detail sharpened on ground that was already there. She placed nothing.');
  }
  return { ok: false, category: 'jolene', title: `${sector.dresser} has nothing left to sharpen in ${sector.id}.` };
}

export function stepSectors(state, rand = Math.random) {
  ensureCrew(state);
  if (!state.sectors?.length) return;

  for (const sector of state.sectors) {
    if (state.world.day - (sector.lastDay ?? -99) < 3) continue;
    sector.lastDay = state.world.day;
    const tiles = sectorTiles(state, sector);
    if (!tiles.length) continue;
    const land = tiles.filter(isLand);
    if (!land.length) continue;

    // The builder goes first now and then: the sector keeps its own edge.
    if (rand() < 0.2 && buildGround(state, sector, rand, tiles)) continue;

    // Landscape work outranks detail work, otherwise raw polish would eat every
    // turn and no meadow, ridge or river would ever appear.
    if (rand() < 0.6) {
      if (moldMeadow(state, sector, rand, land)) continue;
      if (stackRange(state, sector, rand, land)) continue;
      if (runRiver(state, sector, rand, land)) continue;
    }

    if (repaint(state, sector, rand, land)) continue;

    const tile = land[Math.floor(rand() * land.length)];
    refineTile(state.world, tile, rand);
    sector.dressed += 1;
  }
}
