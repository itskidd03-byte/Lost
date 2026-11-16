// Settlements on the table grow with their people: a handful of tents on one
// block, a walled town spread over ten, a kingdom holding twenty with a castle,
// a market, its trades and its army. The same module draws the borders of every
// nation's land so a territory reads as one country instead of scattered dots.

import * as THREE from 'three';
import { BIOMES, isLand, key } from '../world.js';
import { medievalReady, medievalBuilding, medievalCastle } from './medieval.js';
import { personModel, peopleReady } from './people.js';
import { surfaceMaterial } from './detail.js';

export const CITY_POP = 50;
export const KINGDOM_POP = 100;
const CITY_BLOCKS = 10;
const KINGDOM_BLOCKS = 20;

export function footprintBlocks(pop) {
  if (pop >= KINGDOM_POP) return KINGDOM_BLOCKS;
  if (pop >= CITY_POP) return CITY_BLOCKS;
  return 1;
}

export function settlementRank(pop) {
  if (pop >= KINGDOM_POP) return 'kingdom';
  if (pop >= CITY_POP) return 'city';
  return 'camp';
}

function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The blocks a settlement holds: its own tile first, then the nearest free land
// around it, so a town takes ground in a ring rather than in a random scatter.
export function settlementFootprint(state, settlement, blocks = null) {
  const want = blocks ?? footprintBlocks(settlement.population || 0);
  const out = [];
  const taken = new Set();
  const queue = [{ x: settlement.x, y: settlement.y, d: 0 }];
  const seen = new Set([key(settlement.x, settlement.y)]);
  while (queue.length && out.length < want) {
    queue.sort((a, b) => a.d - b.d);
    const here = queue.shift();
    const tile = state.world.tiles.get(key(here.x, here.y));
    if (tile && isLand(tile) && (!tile.settlementId || tile.settlementId === settlement.id)) {
      out.push(tile);
      taken.add(key(tile.x, tile.y));
    }
    if (here.d > 6) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const k = key(here.x + dx, here.y + dy);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ x: here.x + dx, y: here.y + dy, d: here.d + 1 });
    }
  }
  return out;
}

/* ---------------------------------- tents --------------------------------- */

function quad(positions, a, b, c, d) {
  positions.push(...a, ...b, ...c, ...a, ...c, ...d);
}

// Two slopes leaning into a ridge, with a dark door at the front: a tent, not a
// cone with a hat.
function tentGeometry(w, h, d) {
  const hw = w / 2;
  const hd = d / 2;
  const positions = [];
  quad(positions, [-hw, 0, -hd], [hw, 0, -hd], [0, h, -hd], [0, h, -hd]);
  quad(positions, [-hw, 0, hd], [0, h, hd], [hw, 0, hd], [hw, 0, hd]);
  quad(positions, [-hw, 0, -hd], [0, h, -hd], [0, h, hd], [-hw, 0, hd]);
  quad(positions, [hw, 0, -hd], [hw, 0, hd], [0, h, hd], [0, h, -hd]);
  quad(positions, [-hw, 0, -hd], [-hw, 0, hd], [hw, 0, hd], [hw, 0, -hd]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildCamp({ settlement, project, scale, heightOf, nationColor, top = 0.02 }) {
  const group = new THREE.Group();
  const people = [];
  const at = project(settlement.x, settlement.y);
  group.position.set(at.x, top, at.z);

  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(nationColor), roughness: 0.92, side: THREE.DoubleSide });
  const clothPale = new THREE.MeshStandardMaterial({ color: 0xd9cbae, roughness: 0.95, side: THREE.DoubleSide });
  const tents = 3 + Math.floor(hash(settlement.id, 7) * 3);
  for (let i = 0; i < tents; i++) {
    const angle = (i / tents) * Math.PI * 2 + hash(settlement.id + i, 3) * 0.6;
    const spread = scale * (0.24 + hash(i, 11) * 0.2);
    const w = scale * (0.42 + hash(i, 13) * 0.16);
    const h = scale * (0.3 + hash(i, 17) * 0.12);
    const tent = new THREE.Mesh(tentGeometry(w, h, w * 1.25), i % 3 === 0 ? cloth : clothPale);
    tent.position.set(Math.cos(angle) * spread, scale * 0.005, Math.sin(angle) * spread);
    tent.rotation.y = -angle + Math.PI / 2;
    tent.castShadow = true;
    tent.receiveShadow = true;
    group.add(tent);
  }

  // the fire the camp is built around
  const fire = new THREE.Group();
  const ember = new THREE.Mesh(
    new THREE.SphereGeometry(scale * 0.035, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff8a3c, emissive: 0xff6a1e, emissiveIntensity: 1.6, roughness: 0.6 }),
  );
  ember.position.y = scale * 0.02;
  fire.add(ember);
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.012, scale * 0.012, scale * 0.13, 5), surfaceMaterial('#4a3320'));
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 5) * Math.PI * 2;
    log.position.y = scale * 0.015;
    fire.add(log);
  }
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(scale * 0.12, 14),
    new THREE.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = scale * 0.004;
  fire.add(glow);
  group.add(fire);

  // a banner so the camp flies the colours of whoever owns it
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.008, scale * 0.008, scale * 0.5, 5), surfaceMaterial('#5a3f24'));
  pole.position.set(-scale * 0.3, scale * 0.25, -scale * 0.18);
  group.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(scale * 0.2, scale * 0.12),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(nationColor), roughness: 0.9, side: THREE.DoubleSide }),
  );
  flag.position.set(-scale * 0.2, scale * 0.42, -scale * 0.18);
  group.add(flag);

  if (peopleReady()) {
    for (let i = 0; i < 4; i++) {
      const person = personModel({ seed: settlement.id * 13 + i * 5, height: scale * 0.7 });
      if (!person) continue;
      const angle = hash(i, settlement.id) * Math.PI * 2;
      person.root.position.set(Math.cos(angle) * scale * 0.34, 0, Math.sin(angle) * scale * 0.34);
      group.add(person.root);
      people.push({
        group: person.root,
        model: person,
        phase: hash(i, 9) * 6,
        base: person.root.position.clone(),
        speed: 0.4 + hash(i, 5) * 0.6,
        radius: scale * 0.24,
      });
    }
  }
  return { group, people };
}

/* ------------------------------ town and kingdom --------------------------- */

// Every building on the board comes from the same medieval kit as the houses, so
// a city and a kingdom keep the look of the table they sit on.
function buildingFor(rank, seed, i, scale) {
  const roll = hash(seed + i, 3);
  let kind = null;
  if (rank === 'kingdom') {
    if (roll > 0.86) kind = 'hall';
    else if (roll > 0.72) kind = 'tower';
  } else if (roll > 0.8) {
    kind = 'hall';
  }
  return { group: medievalBuilding({ seed, scale, kind }), kind: kind || 'house' };
}

function buildTown({ settlement, tiles, project, scale, heightOf, nationColor, rank }) {
  const group = new THREE.Group();
  const people = [];
  const centre = tiles[0];
  const at = project(centre.x, centre.y);
  group.position.set(at.x, Math.max(0.006, heightOf(centre)), at.z);

  // one building per block held, arranged over the blocks themselves
  tiles.forEach((tile, i) => {
    const local = project(tile.x, tile.y);
    const dx = local.x - group.position.x;
    const dz = local.z - group.position.z;
    if (i === 0) return;
    // leave the middle of a kingdom clear for the keep
    if (rank === 'kingdom' && Math.hypot(dx, dz) < scale * 1.35) return;
    const { group: building } = buildingFor(rank, settlement.id * 31 + i, i, scale * 0.62);
    // stand each house a little off the block's middle so the blocks leave
    // streets between them instead of fusing into a wall
    building.position.set(
      dx + (hash(i, 21) - 0.5) * scale * 0.22,
      Math.max(0.006, heightOf(tile)) - group.position.y,
      dz + (hash(i, 29) - 0.5) * scale * 0.22,
    );
    // face the square: a street of houses, not a row of random boxes
    building.rotation.y = Math.atan2(-dx, -dz);
    group.add(building);
  });

  // the heart of the town: a keep for a kingdom, a market square for a city
  if (rank === 'kingdom') {
    const castle = medievalCastle({ scale: scale * 1.15, seed: settlement.id });
    castle.rotation.y = Math.PI / 4;
    group.add(castle);
  }

  // stalls and crates around the square
  if (medievalReady() && rank !== 'kingdom') {
    for (let i = 0; i < 4; i++) {
      const stall = medievalBuilding({ seed: settlement.id * 7 + i, scale: scale * 0.5 });
      const angle = (i / 4) * Math.PI * 2 + 0.4;
      stall.position.set(Math.cos(angle) * scale * 0.34, 0, Math.sin(angle) * scale * 0.34);
      stall.rotation.y = -angle;
      group.add(stall);
    }
  }

  // the army: spears standing in ranks outside the keep
  if (rank === 'kingdom' && peopleReady()) {
    const soldiers = Math.min(10, 4 + Math.floor((settlement.population || 0) / 40));
    for (let i = 0; i < soldiers; i++) {
      const person = personModel({ seed: settlement.id * 17 + i * 3, height: scale * 0.62 });
      if (!person) continue;
      const angle = (i / soldiers) * Math.PI * 2;
      const spread = scale * (rank === 'kingdom' ? 0.62 : 0.4);
      person.root.position.set(Math.cos(angle) * spread, 0, Math.sin(angle) * spread);
      const spear = new THREE.Mesh(
        new THREE.CylinderGeometry(scale * 0.006, scale * 0.006, scale * 0.5, 4),
        surfaceMaterial('#6a4a28'),
      );
      spear.position.set(0, scale * 0.28, scale * 0.03);
      person.root.add(spear);
      group.add(person.root);
      people.push({
        group: person.root,
        model: person,
        phase: hash(i, 3) * 6,
        base: person.root.position.clone(),
        speed: 0.18,
        radius: scale * 0.05,
      });
    }
  } else if (peopleReady()) {
    for (let i = 0; i < 5; i++) {
      const person = personModel({ seed: settlement.id * 19 + i * 7, height: scale * 0.66 });
      if (!person) continue;
      const angle = hash(i, settlement.id) * Math.PI * 2;
      person.root.position.set(Math.cos(angle) * scale * 0.5, 0, Math.sin(angle) * scale * 0.5);
      group.add(person.root);
      people.push({
        group: person.root,
        model: person,
        phase: hash(i, 5) * 6,
        base: person.root.position.clone(),
        speed: 0.4 + hash(i, 11) * 0.5,
        radius: scale * 0.28,
      });
    }
  }

  return { group, people };
}

// Which blocks of a settlement are built on, so the land under them can stop
// growing trees and grass through the streets.
export function settlementBlockKeys(state) {
  const map = new Map();
  for (const s of state.settlements) {
    if (!s.alive) continue;
    const pop = s.population || 0;
    for (const tile of settlementFootprint(state, s, footprintBlocks(pop))) {
      map.set(key(tile.x, tile.y), s.id);
    }
  }
  return map;
}

export function buildSettlement({ settlement, state, project, scale, heightOf, nationColor }) {
  const pop = settlement.population || 0;
  const rank = settlementRank(pop);
  const tiles = settlementFootprint(state, settlement, footprintBlocks(pop));
  if (rank === 'camp') {
    const top = Math.max(0.006, heightOf(tiles[0] || settlement));
    const camp = buildCamp({ settlement, project, scale, heightOf, nationColor, top });
    camp.rank = rank;
    return camp;
  }
  const town = buildTown({ settlement, tiles, project, scale, heightOf, nationColor, rank });
  town.rank = rank;
  return town;
}

/* -------------------------------- territory ------------------------------- */

// The border of each nation: every block its settlements hold, plus the ring of
// country around them. Drawn as the outline of that shape, not a per-tile glow.
export function buildTerritories({ state, project, scale, heightOf }) {
  const group = new THREE.Group();
  const marks = [];
  const byNation = new Map();
  for (const s of state.settlements) {
    if (!s.alive || !s.nationId) continue;
    const set = byNation.get(s.nationId) || new Set();
    for (const tile of settlementFootprint(state, s, footprintBlocks(s.population || 0))) {
      set.add(key(tile.x, tile.y));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const t = state.world.tiles.get(key(tile.x + dx, tile.y + dy));
        if (t && isLand(t)) set.add(key(t.x, t.y));
      }
    }
    byNation.set(s.nationId, set);
  }

  for (const [nationId, set] of byNation) {
    const nation = state.nations.find((n) => n.id === nationId);
    if (!nation) continue;
    const color = new THREE.Color(nation.color || '#e6c977');
    const positions = [];
    const width = scale * 0.07;
    for (const k of set) {
      const [x, y] = k.split(',').map(Number);
      const tile = state.world.tiles.get(k);
      if (!tile) continue;
      const top = Math.max(0.006, heightOf(tile)) + 0.004;
      const sides = [
        [0, -1, [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]],
        [0, 1, [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5]],
        [-1, 0, [-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5]],
        [1, 0, [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]],
      ];
      for (const [dx, dy, a, b] of sides) {
        if (set.has(key(x + dx, y + dy))) continue;
        const p1 = project(x + a[0], y + a[2]);
        const p2 = project(x + b[0], y + b[2]);
        // a thin strip standing just proud of the ground on the border line
        const nx = (p2.z - p1.z);
        const nz = -(p2.x - p1.x);
        const len = Math.hypot(nx, nz) || 1;
        const ox = (nx / len) * width * 0.5;
        const oz = (nz / len) * width * 0.5;
        positions.push(
          p1.x + ox, top, p1.z + oz,
          p2.x + ox, top, p2.z + oz,
          p2.x - ox, top, p2.z - oz,
          p1.x + ox, top, p1.z + oz,
          p2.x - ox, top, p2.z - oz,
          p1.x - ox, top, p1.z - oz,
        );
      }
    }
    if (!positions.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const border = new THREE.Mesh(geometry, material);
    group.add(border);
    marks.push({ mesh: border, base: 0.42 });
  }

  return { group, marks };
}

// Nothing extra to fetch: towns are built from the kit the houses already use.
export function loadSettlementModels() {
  return Promise.resolve(true);
}
