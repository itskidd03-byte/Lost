// The world is one tile store. The table map renders it and the walkable 3D
// regions render it. There is no second copy and no generated map image.

export const BIOMES = {
  ocean:      { name: 'Ocean',        table: '#12324a', world: '#1d5470', water: true,  fert: 0,    elev: -0.6 },
  coast:      { name: 'Coast',        table: '#27566b', world: '#3a7d93', water: true,  fert: 0.1,  elev: -0.2 },
  blackgrass: { name: 'Black Grass',  table: '#161c16', world: '#2a332b', fert: 0.12,   elev: 0.24 },
  grass:      { name: 'Grassland',    table: '#3d5739', world: '#7c9c5e', fert: 0.56,   elev: 0.3 },
  meadow:     { name: 'Meadow',       table: '#4b6b40', world: '#8fae6c', fert: 0.72,   elev: 0.32 },
  forest:     { name: 'Forest',       table: '#2c4b33', world: '#416d47', fert: 0.6,    elev: 0.36, trees: 2 },
  deepforest: { name: 'Deep Forest',  table: '#1e3628', world: '#2d513b', fert: 0.5,    elev: 0.42, trees: 4 },
  hills:      { name: 'Hills',        table: '#5b5842', world: '#7e7b5d', fert: 0.34,   elev: 0.55 },
  mountain:   { name: 'Mountain',     table: '#6c685f', world: '#8b877d', fert: 0.1,    elev: 0.85 },
  peak:       { name: 'Snow Peak',    table: '#bbb9af', world: '#e2e6e9', fert: 0.02,   elev: 1.15 },
  desert:     { name: 'Desert',       table: '#8d7c50', world: '#c9b183', fert: 0.1,    elev: 0.28 },
  tundra:     { name: 'Tundra',       table: '#8d9aa3', world: '#b9c4c9', fert: 0.08,   elev: 0.26 },
  swamp:      { name: 'Swamp',        table: '#34432f', world: '#4b5b3d', fert: 0.46,   elev: 0.2 },
  lake:       { name: 'Lake',         table: '#1c4659', world: '#2d7389', water: true,  fert: 0.4,  elev: -0.18 },
  river:      { name: 'River',        table: '#21576c', world: '#34849b', water: true,  fert: 0.8,  elev: -0.05 },
  island:     { name: "Johan's Island", table: '#55603f', world: '#94a373', fert: 0.2,  elev: 0.32 },
};

export const WATER_BIOMES = new Set(['ocean', 'coast', 'lake', 'river']);

const RESOURCES = {
  blackgrass: ['stone'],
  grass: ['grain', 'herbs'],
  meadow: ['grain', 'herbs', 'clay'],
  forest: ['timber', 'herbs', 'game'],
  deepforest: ['timber', 'furs', 'gems'],
  hills: ['stone', 'iron', 'clay'],
  mountain: ['iron', 'stone', 'gems'],
  peak: ['gems', 'stone'],
  desert: ['salt', 'glass sand'],
  tundra: ['furs', 'stone'],
  swamp: ['peat', 'herbs'],
  island: ['fish', 'timber'],
  river: ['fish', 'clay'],
  lake: ['fish'],
  coast: ['fish', 'salt'],
  ocean: ['fish'],
};

export function biome(tile) {
  return BIOMES[tile?.biome] || BIOMES.blackgrass;
}

export function key(x, y) {
  return `${x},${y}`;
}

export function isLand(tile) {
  return !!tile && !WATER_BIOMES.has(tile.biome);
}

export function tileAt(world, x, y) {
  return world.tiles.get(key(x, y));
}

export function makeTile(x, y, biomeId, rand = Math.random) {
  const def = BIOMES[biomeId] || BIOMES.blackgrass;
  return {
    x,
    y,
    biome: biomeId,
    elevation: (def.elev ?? 0.3) + (rand() - 0.5) * 0.05,
    fertility: def.fert ?? 0.2,
    detail: biomeId === 'blackgrass' ? 0 : 0.22,
    trees: def.trees ? 0.55 + rand() * 0.35 : 0,
    wildlife: 0,
    resources: [],
    settlementId: null,
    mood: 0,
    moodTag: null,
    blood: 0,
    war: false,
    disaster: null,
    changedDay: 0,
    plantedDay: 0,
    cultivated: 0,
  };
}

export function createWorld() {
  const world = { seed: Math.floor(Math.random() * 1e9), day: 0, tiles: new Map(), protected: new Set(), expansion: 0 };
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 5; y++) {
      const island = x === 1 && y === 1;
      const ring = Math.abs(x - 1) <= 1 && Math.abs(y - 1) <= 1;
      const id = island ? 'island' : ring ? 'ocean' : 'blackgrass';
      const tile = makeTile(x, y, id);
      if (island) {
        tile.detail = 0.92;
        tile.fertility = 0.16;
        tile.elevation = 0.34;
      }
      if (ring && !island) tile.elevation = -0.62;
      if (id === 'blackgrass') tile.elevation = 0.22 + (((x * 7 + y * 13) % 5) * 0.012);
      world.tiles.set(key(x, y), tile);
      if (island || ring) world.protected.add(key(x, y));
    }
  }
  // the island stays an island forever: never claim the void beyond its water
  for (const [px, py] of [[-1, 1], [1, -1], [-1, -1], [-1, 2], [2, -1], [0, -1], [-1, 0], [2, 2], [0, 2], [2, 0]]) {
    world.tiles.get(key(0, 0));
    world.protected.add(key(px, py));
  }
  return world;
}

export function bounds(world) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const t of world.tiles.values()) {
    if (t.x < minX) minX = t.x;
    if (t.x > maxX) maxX = t.x;
    if (t.y < minY) minY = t.y;
    if (t.y > maxY) maxY = t.y;
  }
  if (minX === Infinity) return { minX: 0, maxX: 0, minY: 0, maxY: 0, cols: 1, rows: 1 };
  return { minX, maxX, minY, maxY, cols: maxX - minX + 1, rows: maxY - minY + 1 };
}

export function allTiles(world) {
  return [...world.tiles.values()];
}

export function landTiles(world) {
  return allTiles(world).filter(isLand);
}

export function frontierTiles(world) {
  const seen = new Set();
  const out = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  for (const t of landTiles(world)) {
    for (const [dx, dy] of dirs) {
      const nx = t.x + dx, ny = t.y + dy, k = key(nx, ny);
      if (world.tiles.has(k) || world.protected.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push({ x: nx, y: ny });
    }
  }
  return out;
}

export function claimTile(world, x, y, biomeId = 'blackgrass', rand = Math.random) {
  const k = key(x, y);
  if (world.tiles.has(k)) return world.tiles.get(k);
  const tile = makeTile(x, y, biomeId, rand);
  if (biomeId === 'blackgrass') tile.elevation = 0.24 + rand() * 0.1;
  world.tiles.set(k, tile);
  world.expansion++;
  return tile;
}

export function neighbours(world, tile) {
  const out = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const t = tileAt(world, tile.x + dx, tile.y + dy);
    if (t) out.push(t);
  }
  return out;
}

export function setBiome(tile, biomeId) {
  tile.biome = biomeId;
  const def = BIOMES[biomeId];
  if (!def) return;
  tile.fertility = def.fert ?? tile.fertility;
  tile.elevation = def.elev ?? tile.elevation;
  if (def.trees) tile.trees = Math.max(tile.trees, 0.45);
  if (def.water) {
    tile.trees = 0;
    tile.wildlife = 0;
  }
}

export function addResource(tile, rand = Math.random) {
  const pool = RESOURCES[tile.biome] || [];
  if (!pool.length || tile.resources.length >= 3) return null;
  const res = pool[Math.floor(rand() * pool.length)];
  if (tile.resources.includes(res)) return null;
  tile.resources.push(res);
  return res;
}

export function expandWorld(world, rand, count = 1) {
  const frontier = frontierTiles(world);
  if (!frontier.length) return [];
  const claimed = [];
  for (let i = 0; i < count && frontier.length; i++) {
    const idx = Math.floor(rand() * frontier.length);
    const spot = frontier.splice(idx, 1)[0];
    if (world.tiles.has(key(spot.x, spot.y))) continue;
    const tile = claimTile(world, spot.x, spot.y, 'blackgrass', rand);
    tile.changedDay = world.day;
    claimed.push(tile);
  }
  return claimed;
}

export function bestLandTile(world, rand, filter) {
  const land = landTiles(world).filter((t) => !t.settlementId && !world.protected.has(key(t.x, t.y)));
  const pool = filter ? land.filter(filter) : land;
  if (!pool.length) return null;
  pool.sort((a, b) => b.fertility + b.detail - (a.fertility + a.detail));
  const top = pool.slice(0, Math.max(1, Math.ceil(pool.length * 0.25)));
  return top[Math.floor(rand() * top.length)];
}

/* ------------------------------- sculpting ------------------------------- */

function stepDir(rand) {
  return [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]][Math.floor(rand() * 8)];
}

export function raiseMountains(world, start, rand, length = 3) {
  const touched = [];
  let dir = stepDir(rand);
  let x = start.x, y = start.y;
  for (let i = 0; i < length; i++) {
    const t = tileAt(world, x, y);
    if (t && isLand(t) && !world.protected.has(key(t.x, t.y))) {
      setBiome(t, i === length - 1 ? 'peak' : i === 0 ? 'hills' : 'mountain');
      t.detail = Math.min(1, t.detail + 0.12);
      t.changedDay = world.day;
      touched.push(t);
      if (rand() < 0.5) addResource(t, rand);
    }
    x += dir[0];
    y += dir[1];
    if (rand() < 0.3) dir = stepDir(rand);
  }
  return touched;
}

export function growForest(world, start, rand, radius = 2) {
  const touched = [];
  const queue = [{ x: start.x, y: start.y, d: 0 }];
  const seen = new Set([key(start.x, start.y)]);
  while (queue.length) {
    const { x, y, d } = queue.shift();
    const t = tileAt(world, x, y);
    if (t && isLand(t) && !world.protected.has(key(x, y)) && !t.settlementId) {
      setBiome(t, d === 0 ? 'deepforest' : 'forest');
      t.trees = 0.7 + rand() * 0.3;
      t.detail = Math.min(1, t.detail + 0.1);
      t.changedDay = world.day;
      touched.push(t);
      if (d < radius) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = key(x + dx, y + dy);
          if (!seen.has(k) && rand() < 0.85) {
            seen.add(k);
            queue.push({ x: x + dx, y: y + dy, d: d + 1 });
          }
        }
      }
    }
  }
  return touched;
}

export function carveRiver(world, start, rand, length = 4) {
  const touched = [];
  let x = start.x, y = start.y;
  let bestDir = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]][Math.floor(rand() * 6)];
  for (let i = 0; i < length; i++) {
    const t = tileAt(world, x, y);
    if (!t) {
      if (world.protected.has(key(x, y))) break;
      claimTile(world, x, y, 'river', rand);
    } else if (isLand(t) && !world.protected.has(key(x, y)) && !t.settlementId) {
      setBiome(t, 'river');
      t.fertility = 0.82;
      t.changedDay = world.day;
      touched.push(t);
    }
    // rivers flow toward the lowest neighbouring ground
    let best = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = tileAt(world, x + dx, y + dy);
      if (!n) continue;
      if (!best || n.elevation < best.elevation) best = n;
    }
    if (best && best.elevation <= (tileAt(world, x, y)?.elevation ?? 1)) {
      x += Math.sign(best.x - x);
      y += Math.sign(best.y - y);
    } else {
      x += bestDir[0];
      y += bestDir[1];
    }
  }
  return touched;
}

export function makeLake(world, start, rand) {
  const touched = [];
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const t = tileAt(world, start.x + dx, start.y + dy);
    if (t && isLand(t) && !world.protected.has(key(t.x, t.y)) && !t.settlementId) {
      setBiome(t, 'lake');
      t.elevation = -0.18;
      t.changedDay = world.day;
      touched.push(t);
    }
  }
  return touched;
}

export function refineTile(world, tile, rand) {
  const notes = [];
  const before = tile.biome;
  tile.detail = Math.min(1, tile.detail + 0.16 + rand() * 0.22);
  tile.changedDay = world.day;

  if (tile.biome === 'blackgrass' && tile.detail > 0.22) {
    const roll = rand();
    const next = roll < 0.52 ? 'grass' : roll < 0.7 ? 'meadow' : roll < 0.83 ? 'hills' : roll < 0.94 ? 'forest' : 'swamp';
    setBiome(tile, next);
    notes.push(`black grass gave way to ${BIOMES[next].name.toLowerCase()}`);
  } else if (tile.biome === 'grass' && tile.detail > 0.65 && rand() < 0.34) {
    setBiome(tile, rand() < 0.3 ? 'forest' : 'meadow');
    notes.push(`grassland thickened into ${BIOMES[tile.biome].name.toLowerCase()}`);
  } else if (tile.biome === 'hills' && tile.detail > 0.72 && rand() < 0.28) {
    setBiome(tile, 'mountain');
    notes.push('hills rose into a mountain');
  } else if (tile.biome === 'forest' && tile.detail > 0.6 && rand() < 0.3) {
    setBiome(tile, 'deepforest');
    notes.push('the forest grew deep and dark');
  }

  if (!WATER_BIOMES.has(tile.biome)) {
    tile.trees = Math.min(1, tile.trees + (BIOMES[tile.biome].trees ? 0.12 : 0.03));
    tile.wildlife = Math.min(6, tile.wildlife + (rand() < 0.45 ? 1 : 0));
  }

  if (rand() < 0.35) {
    const res = addResource(tile, rand);
    if (res) notes.push(`a deposit of ${res} was uncovered`);
  }
  if (before !== tile.biome && BIOMES[tile.biome].trees) tile.plantedDay = world.day;
  return notes;
}

export function clearWarMarkers(world) {
  for (const t of world.tiles.values()) if (t.war) t.war = false;
}
