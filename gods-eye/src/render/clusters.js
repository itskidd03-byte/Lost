// Ground that reads as one landform instead of a grid of blocks.
//
// The world is stored as tiles, and a tile at a time is exactly how the board
// should not look: a lake turns into a checkerboard of squares and a forest into
// a row of identical bushes. This module floods the tile store into clusters of
// like ground and draws each cluster once — a sheet of water, a meadow rolling
// over several tiles, a canopy, a ridge — so the eye sees a pond, a meadow, a
// wood or a mountain range.
//
// Nothing here reads game state: the caller hands over tiles and a projection
// from tile space to table space, and gets back a group to add to the board.

import * as THREE from 'three';
import { WATER_BIOMES, isLand, key } from '../world.js';
import { tree, surfaceMaterial } from './detail.js';
import { makeWaterMaterial } from './water.js';
import { peak as sharedPeak } from './mountains.js';

const ROCK = new Set(['mountain', 'peak']);
const WOOD = new Set(['forest', 'deepforest']);
const OPEN = new Set(['grass', 'meadow', 'hills']);

export function clusterKind(tile) {
  if (!tile) return null;
  if (WATER_BIOMES.has(tile.biome)) return 'water';
  if (ROCK.has(tile.biome)) return 'rock';
  if (WOOD.has(tile.biome) || (isLand(tile) && tile.trees > 0.45)) return 'wood';
  if (OPEN.has(tile.biome)) return 'open';
  return null;
}

const KIND_ORDER = ['water', 'rock', 'wood', 'open'];

// Four-way flood fill over tiles of the same kind. Settled ground is never part
// of a cluster: a town is drawn by the settlement builder, not by the landform.
export function findClusters(tiles) {
  const grid = new Map();
  const byKey = new Map();
  for (const tile of tiles) {
    if (!tile) continue;
    byKey.set(key(tile.x, tile.y), tile);
    if (tile.settlementId) continue;
    const kind = clusterKind(tile);
    if (kind) grid.set(key(tile.x, tile.y), kind);
  }
  const seen = new Set();
  const clusters = [];
  for (const [start, kind] of grid) {
    if (seen.has(start)) continue;
    const members = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const here = queue.pop();
      const tile = byKey.get(here);
      if (tile) members.push(tile);
      const [x, y] = here.split(',').map(Number);
      // corners count too: two woods touching at a corner are one wood, and a
      // pond that runs diagonally is still a pond
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const next = key(x + dx, y + dy);
        if (grid.get(next) !== kind || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    if (!members.length) continue;
    clusters.push(shape(kind, members));
  }
  return clusters;
}

// What a cluster covers, and which way it runs: a river is a water cluster that
// is long and thin, a range is a rock cluster that is long and thin, and so on.
function shape(kind, tiles) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let sx = 0, sy = 0, top = -Infinity;
  for (const t of tiles) {
    minX = Math.min(minX, t.x);
    maxX = Math.max(maxX, t.x);
    minY = Math.min(minY, t.y);
    maxY = Math.max(maxY, t.y);
    sx += t.x;
    sy += t.y;
    top = Math.max(top, t.elevation ?? 0.2);
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const alongX = w >= h;
  const long = Math.max(w, h);
  const thin = Math.min(w, h);
  return {
    kind,
    tiles,
    keys: new Set(tiles.map((t) => key(t.x, t.y))),
    minX, maxX, minY, maxY,
    w, h, size: tiles.length,
    cx: sx / tiles.length,
    cy: sy / tiles.length,
    alongX,
    elongation: long / Math.max(1, thin),
    long,
    thin,
    top,
  };
}

/* ------------------------------- water sheet ------------------------------ */

// One flat sheet over every tile of the cluster, with coordinates that line up
// across tiles so a texture can flow over the whole body.
// One sheet over the whole body of water. Each tile contributes a rounded square
// rather than a flat quad: the tiles still meet exactly along their shared edges,
// but the outer rim of the body curves, so a lake is a lake and not a run of
// squares.
const SHEET_STEPS = 4;

function sheetGeometry(cluster, project, y, isWater, { square = false, diagonal = false } = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const N = SHEET_STEPS;
  for (const t of cluster.tiles) {
    const base = positions.length / 3;
    const level = y + (t.elevation ?? 0) * 0.0004;
    // where the water meets land, pull the sheet back so the bank shows: a lake
    // edge should wander, not trace the tile grid
    // any water beside this tile counts, even water found as a separate body: two
    // lakes that touch should read as one shore, not two insets meeting in a seam
    // where water touches only at a corner — a river stepped diagonally — the
    // tile still reaches for it, so the channel joins instead of beading
    const wet = (dx, dy) =>
      !!(isWater && (isWater(t.x + dx, t.y + dy) ||
        (diagonal && (isWater(t.x + dx, t.y) || isWater(t.x, t.y + dy)))));
    // a channel stays a channel: a river is drawn square so its tiles join into
    // one current instead of a string of rounded puddles
    const bank = square ? 0.14 : 0.26;
    const halfL = 0.5 * (wet(-1, 0) ? 1 : 1 - bank);
    const halfR = 0.5 * (wet(1, 0) ? 1 : 1 - bank);
    const halfU = 0.5 * (wet(0, -1) ? 1 : 1 - bank);
    const halfD = 0.5 * (wet(0, 1) ? 1 : 1 - bank);
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const u = (i / N) * 2 - 1;
        const v = (j / N) * 2 - 1;
        // a squircle: full width along the axes, corners pulled in
        const reach = square
          ? Math.max(Math.abs(u), Math.abs(v))
          : Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25);
        const k = reach > 1 ? 1 / reach : 1;
        const px = t.x + u * (u < 0 ? halfL : halfR) * k;
        const py = t.y + v * (v < 0 ? halfU : halfD) * k;
        const at = project(px, py);
        positions.push(at.x, level, at.z);
        uvs.push(px, py);
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = base + j * (N + 1) + i;
        indices.push(a, a + N + 2, a + 1, a, a + N + 1, a + N + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/* --------------------------------- heights -------------------------------- */

// Where the ground sits on a tile, and how it eases from one tile to the next, so
// a patch of several tiles rolls instead of stepping.
function heightField(cluster, heightOf) {
  const levels = new Map();
  for (const t of cluster.tiles) levels.set(key(t.x, t.y), Math.max(0.006, heightOf(t)));
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const at = (px, py) => {
      const direct = levels.get(key(px, py));
      if (direct !== undefined) return direct;
      // outside the cluster: borrow the nearest tile in the cluster so the patch
      // does not fall off a cliff at its own edge
      let best = 0;
      let bestD = Infinity;
      for (const [k, level] of levels) {
        const [kx, ky] = k.split(',').map(Number);
        const d = Math.abs(kx - px) + Math.abs(ky - py);
        if (d < bestD) {
          bestD = d;
          best = level;
        }
      }
      return best;
    };
    const h00 = at(x0, y0);
    const h10 = at(x0 + 1, y0);
    const h01 = at(x0, y0 + 1);
    const h11 = at(x0 + 1, y0 + 1);
    const a = h00 * (1 - fx) + h10 * fx;
    const b = h01 * (1 - fx) + h11 * fx;
    return a * (1 - fy) + b * fy;
  };
}

/* -------------------------------- builders -------------------------------- */

function waterCluster(cluster, { project, scale, heightOf, isWater }) {
  const group = new THREE.Group();
  const river = cluster.elongation >= 2.4 && cluster.size >= 2;
  const big = cluster.size > 26;
  // bodies that touch overlap by a hair, so each sits a little above its neighbour
  // and no two sheets fight for the same pixel
  const level = Math.max(0.006, heightOf(cluster.tiles[0])) + 0.0035 + (cluster.cx + cluster.cy) * 0.00002;
  // dark water with pale current bands, running along the channel it fills
  const dir = river ? (cluster.alongX ? 'x' : 'y') : 'both';
  const material = makeWaterMaterial({
    tint: river ? '#e8f7fd' : '#e2f3fa',
    opacity: river ? 0.94 : 0.9,
    river,
    dir,
  });
  if (material.map) material.map.offset.set(hash(cluster.cx, cluster.cy), hash(cluster.cy, cluster.cx));
  // The ground under the water is one dark basin, so no tile edge shows through
  // the surface as a square of its own.
  const basin = new THREE.Mesh(
    sheetGeometry(cluster, project, level - scale * 0.16, isWater, { square: true, diagonal: true }),
    new THREE.MeshStandardMaterial({ color: 0x0d2b3a, roughness: 0.9, metalness: 0.05 }),
  );
  basin.receiveShadow = true;
  group.add(basin);

  const sheet = new THREE.Mesh(
    sheetGeometry(cluster, project, level, isWater, { square: true, diagonal: true }),
    material,
  );
  sheet.receiveShadow = true;
  group.add(sheet);

  // Ripples live on the open water, not on every tile of it.
  const ripples = [];
  const ringGeo = new THREE.RingGeometry(0.3, 0.38, 20);
  const rippleMat = new THREE.MeshBasicMaterial({
    color: 0xd6f0f6,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const count = big ? 5 : Math.min(4, 1 + Math.floor(cluster.size / 3));
  for (let i = 0; i < count; i++) {
    const t = cluster.tiles[Math.floor(hash(i + cluster.size, 7) * cluster.tiles.length)];
    const at = project(t.x, t.y);
    const ring = new THREE.Mesh(ringGeo, rippleMat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, level + 0.001, at.z);
    ring.scale.setScalar(scale * (0.35 + hash(i, 3) * 0.4));
    group.add(ring);
    ripples.push({ mesh: ring, phase: hash(i, 11) * 2, base: scale * 0.5 });
  }

  // Reeds and stones where the water meets the land, so the edge is a bank.
  if (!big) {
    const reed = surfaceMaterial('#4c6b3a');
    const stone = surfaceMaterial('#6a655c');
    for (const t of cluster.tiles) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const neighbour = cluster.keys.has(key(t.x + dx, t.y + dy));
        if (neighbour) continue;
        const at = project(t.x + dx * 0.45, t.y + dy * 0.45);
        const clump = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const blade = new THREE.Mesh(new THREE.ConeGeometry(scale * 0.02, scale * (0.18 + hash(i, t.x) * 0.16), 3), reed);
          blade.position.set((hash(i, 5) - 0.5) * scale * 0.3, scale * 0.1, (hash(i, 9) - 0.5) * scale * 0.3);
          blade.rotation.z = (hash(i, 13) - 0.5) * 0.4;
          clump.add(blade);
        }
        if (hash(t.x, t.y) > 0.6) {
          const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(scale * 0.07, 0), stone);
          rock.position.y = scale * 0.03;
          rock.scale.y = 0.6;
          clump.add(rock);
        }
        clump.position.set(at.x, level, at.z);
        group.add(clump);
      }
    }
  }

  // A pond gets lilies; a river gets the flow handled by its texture.
  if (!river && cluster.size >= 2) {
    const lily = surfaceMaterial('#3f6b3c');
    for (let i = 0; i < Math.min(6, cluster.size); i++) {
      const t = cluster.tiles[Math.floor(hash(i, 17) * cluster.tiles.length)];
      const at = project(t.x + (hash(i, 3) - 0.5) * 0.5, t.y + (hash(i, 5) - 0.5) * 0.5);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(scale * 0.09, 9), lily);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(at.x, level + 0.0015, at.z);
      group.add(pad);
    }
  }

  return { group, waters: [{ material, river }], ripples };
}

// The ground itself is one continuous surface built by ground.js, so a meadow
// adds only what grows on it. Nothing here lays a patch over the tiles: that is
// what used to show circles of the old surface through the blend.
function meadowCluster(cluster, { project, scale, heightOf }) {
  const group = new THREE.Group();
  const height = heightField(cluster, heightOf);
  const biome = cluster.tiles.some((t) => t.biome === 'meadow') ? 'meadow' : cluster.tiles.some((t) => t.biome === 'hills') ? 'hills' : 'grass';

  // Tufts and the odd flower break the surface up without costing much.
  const tuftGeo = new THREE.ConeGeometry(scale * 0.03, scale * 0.2, 3);
  const bladeMat = surfaceMaterial(biome === 'hills' ? '#6a6a4c' : '#4c6b3a');
  const tufts = new THREE.InstancedMesh(tuftGeo, bladeMat, Math.min(90, cluster.size * 6));
  const dummy = new THREE.Object3D();
  let n = 0;
  for (const t of cluster.tiles) {
    for (let i = 0; i < 6 && n < tufts.count; i++) {
      const tx = t.x + (hash(t.x * 7 + i, t.y * 3) - 0.5) * 0.85;
      const ty = t.y + (hash(t.x * 5, t.y * 11 + i) - 0.5) * 0.85;
      const at = project(tx, ty);
      dummy.position.set(at.x, height(tx, ty) + scale * 0.09, at.z);
      dummy.rotation.y = hash(t.x + i, t.y) * Math.PI;
      dummy.scale.set(1, 0.7 + hash(i, t.x) * 0.8, 1);
      dummy.updateMatrix();
      tufts.setMatrixAt(n++, dummy.matrix);
    }
  }
  tufts.count = n;
  tufts.instanceMatrix.needsUpdate = true;
  tufts.receiveShadow = true;
  group.add(tufts);

  return { group, waters: [], ripples: [] };
}

function woodCluster(cluster, { project, scale, heightOf }) {
  const group = new THREE.Group();
  const height = heightField(cluster, heightOf);
  const deep = cluster.tiles.some((t) => t.biome === 'deepforest');

  // A canopy, thickest at the middle of the wood, thinning at its edge.
  const count = Math.min(26, Math.max(3, Math.round(cluster.size * 2.2)));
  for (let i = 0; i < count; i++) {
    const pick = cluster.tiles[Math.floor(hash(i, cluster.size + 3) * cluster.tiles.length)];
    const inset = 0.34 * (0.4 + hash(i, 7));
    const tx = pick.x + (hash(i, 11) - 0.5) * (1 - inset);
    const ty = pick.y + (hash(i, 13) - 0.5) * (1 - inset);
    const at = project(tx, ty);
    const variety = 0.75 + hash(i, 19) * 0.7;
    const sapling = tree({
      scale: scale * 0.75 * variety,
      seed: pick.x * 97 + pick.y * 13 + i,
      pale: deep && i % 3 === 0,
    });
    sapling.position.set(at.x, height(tx, ty), at.z);
    sapling.rotation.y = hash(i, 23) * Math.PI * 2;
    group.add(sapling);
  }

  // Undergrowth: low bushes that hide the seam between tiles.
  const bushMat = surfaceMaterial(deep ? '#28402c' : '#33583a');
  const bushGeo = new THREE.IcosahedronGeometry(1, 0);
  for (const t of cluster.tiles) {
    if (hash(t.x * 3, t.y * 5) < 0.45) continue;
    const at = project(t.x + (hash(t.x, 9) - 0.5) * 0.6, t.y + (hash(t.y, 4) - 0.5) * 0.6);
    const bush = new THREE.Mesh(bushGeo, bushMat);
    const s = scale * (0.1 + hash(t.x, t.y) * 0.1);
    bush.scale.set(s, s * 0.7, s);
    bush.position.set(at.x, height(t.x, t.y) + s * 0.4, at.z);
    bush.castShadow = true;
    group.add(bush);
  }

  return { group, waters: [], ripples: [] };
}

// A massif is a lump of rock with its faces knocked out of line, which reads as
// a sculpted mountain rather than a pyramid sitting on the board.
function massif(seed, width, height, snow) {
  const group = new THREE.Group();
  const rock = surfaceMaterial('#6f6a61', { flat: true });
  const rockDark = surfaceMaterial('#57534d', { flat: true });
  const snowMat = surfaceMaterial('#e9eef1', { flat: true });
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const jitter = 0.82 + hash(seed * 13 + i, i * 7) * 0.36;
    position.setXYZ(i, position.getX(i) * jitter, position.getY(i) * jitter, position.getZ(i) * jitter);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();

  const body = new THREE.Mesh(geometry, seed % 2 ? rock : rockDark);
  body.scale.set(width, height, width * (0.8 + hash(seed, 3) * 0.4));
  body.position.y = height * 0.42;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  if (snow) {
    const cap = new THREE.Mesh(geometry, snowMat);
    cap.scale.set(width * 0.52, height * 0.42, width * 0.45);
    cap.position.y = height * 0.86;
    group.add(cap);
  }
  return group;
}

function rockCluster(cluster, { project, scale, heightOf }) {
  const group = new THREE.Group();
  const height = heightField(cluster, heightOf);
  const snow = cluster.tiles.some((t) => t.biome === 'peak') || cluster.top > 0.95;
  const steps = Math.max(2, Math.min(7, cluster.long));
  // The range runs along the cluster's long axis, so a line of rock tiles
  // becomes a ridge instead of a row of separate hills.
  for (let i = 0; i < steps; i++) {
    const f = steps === 1 ? 0.5 : i / (steps - 1);
    const along = (cluster.alongX ? cluster.minX : cluster.minY) + f * ((cluster.alongX ? cluster.w : cluster.h) - 1);
    const across = cluster.alongX ? cluster.cy : cluster.cx;
    // stagger across the axis so the ridge has shoulders
    const offset = (hash(i, 5) - 0.5) * (cluster.thin * 0.55);
    const tx = cluster.alongX ? along + 0.5 : across + offset;
    const ty = cluster.alongX ? across + offset : along + 0.5;
    const at = project(tx, ty);
    const h = (0.34 + hash(i, 11) * 0.22) * (snow ? 1.2 : 1);
    const seed = i + cluster.size;
    const snowy = snow || hash(i, 3) > 0.6;
    // the shared mountain design, textured; the sculpted lump only while the
    // models are still loading
    const peakHeight = scale * (0.9 + h * 1.5) * (snowy ? 1.2 : 1);
    const modelled = sharedPeak({
      height: peakHeight,
      width: peakHeight * (0.95 + hash(i, 23) * 0.3),
      seed,
      snow: snowy,
    });
    const peak = modelled || massif(seed, scale * 0.4, scale * h, snowy);
    peak.position.set(at.x, height(tx, ty) - scale * 0.02, at.z);
    peak.rotation.y = hash(i, 17) * Math.PI;
    group.add(peak);
  }

  // scree at the foot of the range ties it to the ground
  const scree = surfaceMaterial('#6b665c');
  const screeGeo = new THREE.IcosahedronGeometry(scale * 0.1, 0);
  for (const t of cluster.tiles) {
    if (hash(t.x, t.y * 3) < 0.5) continue;
    const at = project(t.x + (hash(t.x, 2) - 0.5) * 0.7, t.y + (hash(t.y, 6) - 0.5) * 0.7);
    const stone = new THREE.Mesh(screeGeo, scree);
    stone.scale.y = 0.55;
    stone.rotation.y = hash(t.x, 8) * Math.PI;
    stone.position.set(at.x, height(t.x, t.y) + scale * 0.03, at.z);
    group.add(stone);
  }

  return { group, waters: [], ripples: [] };
}

function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Draw one cluster. Small clusters are left to the per-tile art, which is cheap
// and already reads correctly on a single block.
export function buildCluster(cluster, opts) {
  // a single pool is still a pool; everything else needs a neighbour to be a landform
  if (cluster.size < 2 && cluster.kind !== 'water') return null;
  switch (cluster.kind) {
    case 'water':
      return waterCluster(cluster, opts);
    case 'open':
      return meadowCluster(cluster, opts);
    case 'wood':
      return woodCluster(cluster, opts);
    case 'rock':
      return rockCluster(cluster, opts);
    default:
      return null;
  }
}

// A single block of rock gets the same sculpted treatment as a whole range, so
// no tile on the board is ever a plain cone.
export function loneMassif({ project, scale, heightOf, tile }) {
  const group = new THREE.Group();
  const at = project(tile.x, tile.y);
  const seed = tile.x * 31 + tile.y * 7 + 3;
  const snowy = tile.biome === 'peak';
  const peakHeight = scale * (snowy ? 1.7 : 1.35);
  const shape = sharedPeak({ height: peakHeight, width: peakHeight * 1.0, seed, snow: snowy }) ||
    massif(seed, scale * 0.4, scale * 0.55, snowy);
  shape.position.set(at.x, Math.max(0.006, heightOf(tile)) - scale * 0.02, at.z);
  shape.rotation.y = hash(tile.x, tile.y) * Math.PI;
  group.add(shape);
  return group;
}

export const CLUSTER_KINDS = new Set(KIND_ORDER);
