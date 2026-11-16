// Ground textures for the table. Each biome gets a small seamless tile painted
// by gods-eye/scripts/make-terrain-textures.py, so the board reads as grass,
// rock or sand instead of a flat colour, without a single photographic image.

import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const tiles = new Map();

export const TEXTURED_BIOMES = new Set([
  'grass', 'meadow', 'forest', 'deepforest', 'blackgrass', 'hills',
  'mountain', 'peak', 'desert', 'tundra', 'swamp', 'island',
]);

export function terrainTexture(biome) {
  if (!TEXTURED_BIOMES.has(biome)) return null;
  let texture = tiles.get(biome);
  if (texture) return texture;
  texture = loader.load(`${import.meta.env.BASE_URL}textures/terrain/${biome}.webp`);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 1.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  tiles.set(biome, texture);
  return texture;
}
