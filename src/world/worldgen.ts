import { RNG, clamp, smoothstep } from '../core/rng';
import type { ResourceNode } from '../core/types';

export const WORLD_SIZE = 1400;
export const SEA_LEVEL = 5.5;
export const RES = 160;

export type Biome = 'marsh' | 'mountain' | 'vale' | 'desert' | 'swamp' | 'steppe' | 'highland' | 'saltflat' | 'forest' | 'delta';

export interface RegionDef {
  id: string;
  name: string;
  biome: Biome;
  center: { x: number; z: number };
  climate: string;
  resources: string[];
  description: string;
}

const TAU = Math.PI * 2;

export const REGIONS: RegionDef[] = [
  {
    id: 'north_marsh', name: 'The Grey Reeds', biome: 'marsh', center: { x: 0, z: -430 },
    climate: 'Cold, foggy, wet',
    resources: ['peat', 'clay', 'herbs', 'fish', 'wood'],
    description: 'Fog-drowned wetland threaded with black waterways. Poor roads, rich medicine.'
  },
  {
    id: 'east_mountain', name: 'The Iron Crown Range', biome: 'mountain', center: { x: 430, z: 0 },
    climate: 'Alpine, snowbound peaks',
    resources: ['iron', 'copper', 'gold', 'stone', 'wood'],
    description: 'Snow-capped ridges hiding veins of iron, copper and gold behind lethal passes.'
  },
  {
    id: 'south_vale', name: 'The Verdant Vale', biome: 'vale', center: { x: 0, z: 430 },
    climate: 'Temperate, mild',
    resources: ['wood', 'game', 'stone', 'clay', 'fish', 'herbs'],
    description: 'Fertile river valleys, dense forest and sheltered harbours. The player begins here.'
  },
  {
    id: 'west_dune', name: 'The Sunscour', biome: 'desert', center: { x: -430, z: 0 },
    climate: 'Arid, brutal heat',
    resources: ['salt', 'stone', 'gold', 'clay'],
    description: 'Endless dunes interrupted by rare oases and seams of exposed mineral.'
  },
  {
    id: 'c_swamp', name: 'Sunken Fen', biome: 'swamp', center: { x: -120, z: -230 },
    climate: 'Stagnant, humid',
    resources: ['peat', 'herbs', 'clay', 'fish'],
    description: 'A drowned basin of rotting timber where only the stubborn settle.'
  },
  {
    id: 'c_steppe', name: 'Ember Steppe', biome: 'steppe', center: { x: 230, z: -140 },
    climate: 'Dry grassland, cold nights',
    resources: ['game', 'stone', 'wood', 'copper'],
    description: 'Open grass and scattered rock. Excellent for horses and armies.'
  },
  {
    id: 'c_highland', name: 'Jade Highlands', biome: 'highland', center: { x: 130, z: 210 },
    climate: 'Cool, terraced',
    resources: ['wood', 'game', 'iron', 'stone'],
    description: 'Rolling terraced hills with deep soil and defensible ridgelines.'
  },
  {
    id: 'c_salt', name: 'The Salt Flats', biome: 'saltflat', center: { x: -280, z: 160 },
    climate: 'Bleached, wind-scoured',
    resources: ['salt', 'clay', 'stone'],
    description: 'A glaring white pan where water is scarce and salt is currency.'
  },
  {
    id: 'c_forest', name: 'Whisperwood', biome: 'forest', center: { x: -60, z: 30 },
    climate: 'Deep forest, damp shade',
    resources: ['wood', 'game', 'herbs', 'clay'],
    description: 'Ancient interior forest, thick with game and timber, hard to clear.'
  },
  {
    id: 'c_delta', name: 'Twin Rivers', biome: 'delta', center: { x: 300, z: 300 },
    climate: 'Warm, river-fed',
    resources: ['fish', 'wood', 'clay', 'game', 'herbs'],
    description: 'Two great rivers braid into the sea here. The richest farmland on the island.'
  }
];

export interface WorldTerrain {
  size: number;
  resolution: number;
  heights: Float32Array;
  regionIndex: Uint8Array;
  biome: Biome[];
  seed: number;
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const top = a + (b - a) * u;
  const bottom = c + (d - c) * u;
  return top + (bottom - top) * v;
}

function fbm(x: number, y: number, seed: number, octaves: number): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * freq, y * freq, seed + i * 977) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return value / norm;
}

function ridged(x: number, y: number, seed: number, octaves: number): number {
  let value = 0;
  let amp = 0.55;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x * freq, y * freq, seed + i * 613) * 2 - 1);
    value += n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.11;
  }
  return value / norm;
}

export function nearestRegion(x: number, z: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < REGIONS.length; i++) {
    const r = REGIONS[i];
    const dx = x - r.center.x;
    const dz = z - r.center.z;
    // Slight warping so borders are not perfect circles.
    const dist = dx * dx + dz * dz + Math.sin((x + z) * 0.004) * 9000;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function generateTerrain(seed: number): WorldTerrain {
  const heights = new Float32Array(RES * RES);
  const regionIndex = new Uint8Array(RES * RES);
  const biome: Biome[] = new Array(RES * RES);
  const half = WORLD_SIZE / 2;

  for (let gz = 0; gz < RES; gz++) {
    for (let gx = 0; gx < RES; gx++) {
      const idx = gz * RES + gx;
      const x = -half + (gx / (RES - 1)) * WORLD_SIZE;
      const z = -half + (gz / (RES - 1)) * WORLD_SIZE;
      const region = nearestRegion(x, z);
      regionIndex[idx] = region;
      const def = REGIONS[region];

      const nx = x / half;
      const nz = z / half;
      const radius = Math.sqrt(nx * nx + nz * nz);
      const coast = 1 - smoothstep(clamp((radius - 0.52) / 0.42, 0, 1));
      const baseNoise = fbm(x * 0.0021 + 40, z * 0.0021 - 20, seed, 5);
      const detail = fbm(x * 0.011, z * 0.011, seed + 31, 3);

      let h = (SEA_LEVEL - 9) + coast * (14 + baseNoise * 26) + detail * 3.2 * coast;

      switch (def.biome) {
        case 'mountain': {
          const ridge = ridged(x * 0.0032, z * 0.0032, seed + 71, 5);
          h += ridged(x * 0.0009, z * 0.0009, seed + 5, 3) * coast * 34 + ridge * coast * 26;
          h += 6 * coast;
          break;
        }
        case 'highland': {
          h += ridged(x * 0.0024, z * 0.0024, seed + 17, 3) * coast * 18;
          break;
        }
        case 'marsh':
        case 'swamp': {
          h -= coast * 3.4;
          h = SEA_LEVEL - 1.2 + (h - (SEA_LEVEL - 1.2)) * 0.55;
          break;
        }
        case 'desert': {
          const dune = Math.sin(x * 0.012 + fbm(x * 0.004, z * 0.004, seed + 9, 2) * 6) * 2.4;
          h = h * 0.72 + 3.4 + dune;
          break;
        }
        case 'saltflat': {
          h = SEA_LEVEL + 1.1 + (h - SEA_LEVEL) * 0.35;
          break;
        }
        case 'delta': {
          h = SEA_LEVEL - 0.6 + (h - (SEA_LEVEL - 0.6)) * 0.7;
          break;
        }
        case 'steppe': {
          h = h * 0.9 + 1.4;
          break;
        }
        case 'forest': {
          h += 1.8;
          break;
        }
        default:
          break;
      }

      // Gentle beach shelf so coasts are walkable.
      if (h < SEA_LEVEL) h = SEA_LEVEL - Math.pow(SEA_LEVEL - h, 1.08);
      heights[idx] = h;
      biome[idx] = def.biome;
    }
  }

  return { size: WORLD_SIZE, resolution: RES, heights, regionIndex, biome, seed };
}

export function heightAt(terrain: WorldTerrain, x: number, z: number): number {
  const half = terrain.size / 2;
  const fx = clamp((x + half) / terrain.size, 0, 1) * (terrain.resolution - 1);
  const fz = clamp((z + half) / terrain.size, 0, 1) * (terrain.resolution - 1);
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const x1 = Math.min(terrain.resolution - 1, x0 + 1);
  const z1 = Math.min(terrain.resolution - 1, z0 + 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const h00 = terrain.heights[z0 * terrain.resolution + x0];
  const h10 = terrain.heights[z0 * terrain.resolution + x1];
  const h01 = terrain.heights[z1 * terrain.resolution + x0];
  const h11 = terrain.heights[z1 * terrain.resolution + x1];
  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return top + (bottom - top) * tz;
}

export function regionAt(terrain: WorldTerrain, x: number, z: number): RegionDef {
  const half = terrain.size / 2;
  const gx = Math.round(clamp((x + half) / terrain.size, 0, 1) * (terrain.resolution - 1));
  const gz = Math.round(clamp((z + half) / terrain.size, 0, 1) * (terrain.resolution - 1));
  return REGIONS[terrain.regionIndex[gz * terrain.resolution + gx]];
}

export function isLand(terrain: WorldTerrain, x: number, z: number): boolean {
  return heightAt(terrain, x, z) > SEA_LEVEL;
}

export function isWalkable(terrain: WorldTerrain, x: number, z: number): boolean {
  return isLand(terrain, x, z) && Math.abs(x) < WORLD_SIZE / 2 - 20 && Math.abs(z) < WORLD_SIZE / 2 - 20;
}

const RESOURCE_TABLE: Record<Biome, string[]> = {
  marsh: ['peat', 'herbs', 'clay', 'fish', 'wood'],
  mountain: ['iron', 'copper', 'gold', 'stone', 'wood'],
  vale: ['wood', 'game', 'stone', 'clay', 'herbs', 'fish'],
  desert: ['salt', 'stone', 'gold', 'clay'],
  swamp: ['peat', 'herbs', 'clay', 'fish'],
  steppe: ['game', 'stone', 'wood', 'copper'],
  highland: ['wood', 'game', 'iron', 'stone'],
  saltflat: ['salt', 'clay', 'stone'],
  forest: ['wood', 'game', 'herbs', 'clay'],
  delta: ['fish', 'wood', 'clay', 'game', 'herbs']
};

export function generateResources(terrain: WorldTerrain, seed: number): ResourceNode[] {
  const rng = new RNG(seed ^ 0x51ed);
  const nodes: ResourceNode[] = [];
  let attempts = 0;
  while (nodes.length < 1400 && attempts < 12000) {
    attempts++;
    const x = rng.range(-WORLD_SIZE / 2 + 60, WORLD_SIZE / 2 - 60);
    const z = rng.range(-WORLD_SIZE / 2 + 60, WORLD_SIZE / 2 - 60);
    if (!isWalkable(terrain, x, z)) continue;
    const region = regionAt(terrain, x, z);
    const type = rng.pick(RESOURCE_TABLE[region.biome]);
    nodes.push({
      id: `res_${nodes.length}`,
      type,
      position: { x, z },
      amount: rng.int(40, 260),
      regionId: region.id
    });
  }
  return nodes;
}

export function findSettlementSite(
  terrain: WorldTerrain,
  resources: ResourceNode[],
  center: { x: number; z: number },
  seed: number
): { x: number; z: number } {
  const rng = new RNG(seed);
  let best = { x: center.x, z: center.z };
  let bestScore = -Infinity;
  for (let i = 0; i < 260; i++) {
    const angle = rng.next() * TAU;
    const radius = rng.range(30, 210);
    const x = center.x + Math.cos(angle) * radius;
    const z = center.z + Math.sin(angle) * radius;
    if (!isWalkable(terrain, x, z)) continue;
    const h = heightAt(terrain, x, z);
    if (h > SEA_LEVEL + 26) continue;
    let score = 26 - Math.abs(h - (SEA_LEVEL + 6)) * 0.9;
    let nearWater = false;
    for (let a = 0; a < 8; a++) {
      const wx = x + Math.cos((a / 8) * TAU) * 34;
      const wz = z + Math.sin((a / 8) * TAU) * 34;
      if (!isLand(terrain, wx, wz)) nearWater = true;
    }
    if (nearWater) score += 8;
    for (const node of resources) {
      const d = Math.hypot(node.position.x - x, node.position.z - z);
      if (d < 70) score += node.type === 'wood' || node.type === 'stone' ? 0.22 : 0.12;
    }
    score -= radius * 0.02;
    if (score > bestScore) {
      bestScore = score;
      best = { x, z };
    }
  }
  return best;
}

export function terrainColor(biome: Biome, height: number): [number, number, number] {
  const wet = height < SEA_LEVEL + 2.2;
  switch (biome) {
    case 'mountain':
      return height > SEA_LEVEL + 44 ? [0.92, 0.94, 0.97] : height > SEA_LEVEL + 24 ? [0.5, 0.5, 0.53] : [0.36, 0.4, 0.32];
    case 'marsh':
      return wet ? [0.27, 0.32, 0.24] : [0.35, 0.42, 0.29];
    case 'swamp':
      return wet ? [0.22, 0.28, 0.21] : [0.3, 0.36, 0.24];
    case 'desert':
      return [0.84, 0.74, 0.5];
    case 'saltflat':
      return [0.9, 0.9, 0.86];
    case 'steppe':
      return [0.56, 0.6, 0.32];
    case 'highland':
      return [0.4, 0.52, 0.32];
    case 'forest':
      return [0.2, 0.36, 0.2];
    case 'delta':
      return wet ? [0.35, 0.45, 0.3] : [0.42, 0.55, 0.3];
    default:
      return wet ? [0.4, 0.45, 0.3] : [0.4, 0.54, 0.29];
  }
}
