// The ground of the board, as one piece.
//
// The old board built a lump of geometry per tile — a rounded crown on a skirt —
// and then lay patches of meadow and water over the top. Wherever a patch met a
// tile the crown poked through it, so the board showed circles of the old surface
// glitching through the new. This builds a single heightfield across the whole
// map instead: heights ease between tiles, colours blend the same way, and hills
// roll because the surface is continuous, not because each block is rounded.
//
// Nothing here reads game state beyond the tile store; the caller places it.

import * as THREE from 'three';
import { BIOMES, bounds as worldBounds, isLand, key } from '../world.js';

// How much vertical room each kind of ground gets to roll in.
const RELIEF = {
  ocean: 0.06, coast: 0.1, lake: 0.05, river: 0.06,
  meadow: 0.5, grass: 0.55, forest: 0.7, deepforest: 0.8, swamp: 0.25,
  hills: 1.5, mountain: 2.1, peak: 2.6, desert: 0.45, tundra: 0.35,
  blackgrass: 0.35, island: 0.6,
};

function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Value noise, two octaves: enough to make a gentle swell, cheap enough to run
// over a few thousand vertices every time the board is rebuilt.
function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = smooth(x - xi);
  const fy = smooth(y - yi);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return (top + (bottom - top) * fy) * 2 - 1;
}

function fbm(x, y) {
  return noise(x, y) * 0.65 + noise(x * 2.3 + 11, y * 2.3 - 7) * 0.35;
}

// A ground texture for the whole board: soft blotches and grit, greyscale, so
// the vertex colours underneath decide what kind of ground it is.
let detailTexture = null;

function groundTexture() {
  if (detailTexture) return detailTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d9d9d9';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.6 + Math.random() * 2.4;
    const v = 150 + Math.random() * 105;
    ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${0.05 + Math.random() * 0.12})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 8 + Math.random() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() > 0.5;
    g.addColorStop(0, dark ? 'rgba(120,120,120,0.07)' : 'rgba(245,245,245,0.07)');
    g.addColorStop(1, 'rgba(180,180,180,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  detailTexture = new THREE.CanvasTexture(canvas);
  detailTexture.wrapS = THREE.RepeatWrapping;
  detailTexture.wrapT = THREE.RepeatWrapping;
  detailTexture.colorSpace = THREE.SRGBColorSpace;
  detailTexture.anisotropy = 4;
  return detailTexture;
}

const palette = new Map();
const VOID = new THREE.Color(0x18201a);
const BED = new THREE.Color('#1d4753');

function rgbOf(biome) {
  // ground that has not been claimed yet is dark, not grassland
  if (!biome) return [VOID.r, VOID.g, VOID.b];
  let rgb = palette.get(biome);
  if (rgb) return rgb;
  const def = BIOMES[biome] || BIOMES.blackgrass;
  // Earth, not daylight flatness: the walkable region wants bright open ground
  // because the sun is on it, the board is lit like a model, so the same hue is
  // taken down toward its shaded form and the colours read as soil and leaf.
  const colour = new THREE.Color(def.world).lerp(new THREE.Color(def.table), 0.44);
  // Under a lake the ground is the bed, not the bright face of the water. Every
  // kind of water gets the same bed: the sheet above is translucent, so a bed that
  // changed colour at a biome line would print that line straight through the lake.
  if (!isLand({ biome, elevation: 1 })) colour.copy(BED);
  rgb = [colour.r, colour.g, colour.b];
  palette.set(biome, rgb);
  return rgb;
}

// One ground surface for the board. Returns the mesh and the height function the
// rest of the board should place things with, so trees, houses and people all
// stand on the same ground you can see.
export function buildGround({ world, scale, centerX, centerY, segmentsPerTile = 4 }) {
  const b = worldBounds(world);
  const cols = b.cols;
  const rows = b.rows;
  // a grown world can span sixty tiles; the ground detail steps down rather than
  // spending a hundred thousand vertices on a board seen from a metre away
  const density = cols > 46 || rows > 46 ? 2 : cols > 26 || rows > 26 ? 3 : segmentsPerTile;
  const segX = Math.max(8, Math.min(220, Math.round(cols * density)));
  const segY = Math.max(8, Math.min(220, Math.round(rows * density)));

  const tiles = world.tiles;
  const tileAt = (x, y) => tiles.get(key(x, y)) || null;

  const level = (tile) => {
    // ground still to be claimed is flat and sits just clear of the table top, so
    // the tray never shows through between two explored stretches
    if (!tile) return 0.014;
    // lake and river beds sit in a basin, but clear of the table under them
    if (!isLand(tile)) return 0.01;
    return 0.016 + Math.max(0, (tile.elevation ?? 0.2) + 0.15) * 0.032;
  };

  // Bilinear read of a tile property at a fractional tile position, so a hill
  // leans into its neighbour instead of stepping.
  const sample = (x, y, read) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    // smoothly, but decisively: a plain bilinear smears one tile of water a whole
    // tile into the meadow beside it
    const fx = smooth(smooth(x - x0));
    const fy = smooth(smooth(y - y0));
    const a = read(x0, y0);
    const bb = read(x0 + 1, y0);
    const c = read(x0, y0 + 1);
    const d = read(x0 + 1, y0 + 1);
    const top = a + (bb - a) * fx;
    const bottom = c + (d - c) * fx;
    return top + (bottom - top) * fy;
  };

  const reliefAt = (x, y) => sample(x, y, (tx, ty) => {
    const tile = tileAt(tx, ty);
    return RELIEF[tile?.biome] ?? 0.4;
  });

  // Ground that is being raised or worked right now: Johan lifts a block out of
  // the board and the surface under it is handed to the refine pass, which melts
  // that block down into the land around it. `molds` holds the lift still to be
  // worked off, keyed by tile.
  let moldsNow = new Map();

  const moldLift = (x, y) => {
    let lift = 0;
    for (const mold of moldsNow.values()) {
      // the block is flat across its own tile and slopes away just outside it
      const reach = Math.max(Math.abs(x - mold.x), Math.abs(y - mold.y));
      const edge = Math.max(0, Math.min(1, (1.4 - reach) / 0.9));
      lift += mold.raise * edge * edge * (3 - 2 * edge);
    }
    return lift;
  };

  const heightAt = (x, y) => {
    const base = sample(x, y, (tx, ty) => level(tileAt(tx, ty)));
    // the swell is strongest where the land is rough, and flat on water
    const relief = reliefAt(x, y);
    const swell = fbm(x * 0.8, y * 0.8) * scale * 0.32 * relief +
      fbm(x * 1.8 + 5, y * 1.8 + 3) * scale * 0.05 * relief;
    // fade to the base plate at the edge of the world, so the board sits on its
    // tray instead of hanging off it
    const edge = Math.min(
      x - (b.minX - 0.5), (b.maxX + 0.5) - x,
      y - (b.minY - 0.5), (b.maxY + 0.5) - y,
    );
    const fade = Math.max(0, Math.min(1, edge / 0.9));
    return base + swell * smooth(fade) + moldLift(x, y);
  };

  const channel = (tx, ty, index) => rgbOf(tileAt(tx, ty)?.biome)[index];

  const colorAt = (x, y, out) => {
    const r = sample(x, y, (tx, ty) => channel(tx, ty, 0));
    const g = sample(x, y, (tx, ty) => channel(tx, ty, 1));
    const bl = sample(x, y, (tx, ty) => channel(tx, ty, 2));
    // a little variation so a wide field is not one flat wash
    const grain = 0.9 + fbm(x * 1.7 + 31, y * 1.7 - 13) * 0.14;
    out.setRGB(r * grain, g * grain, bl * grain);
    return out;
  };

  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const c = new THREE.Color();
  for (let j = 0; j <= segY; j++) {
    for (let i = 0; i <= segX; i++) {
      const tx = b.minX - 0.5 + (i / segX) * (cols);
      const ty = b.minY - 0.5 + (j / segY) * (rows);
      const wx = (tx - centerX) * scale;
      const wz = (ty - centerY) * scale;
      const y = heightAt(tx, ty);
      positions.push(wx, y, wz);
      colorAt(tx, ty, c);
      // slopes catch the light, hollows sit in their own shade: this is what makes
      // a rolling hill read as a hill instead of a painted patch
      const slope = (heightAt(tx - 0.45, ty - 0.45) - heightAt(tx + 0.45, ty + 0.45)) / (scale * 0.9);
      const shade = Math.max(0.72, Math.min(1.22, 1 + slope * 0.5));
      colors.push(c.r * shade, c.g * shade, c.b * shade);
      uvs.push(tx * 0.9, ty * 0.9);
    }
  }
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i;
      indices.push(a, a + segX + 1, a + 1, a + 1, a + segX + 1, a + segX + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const map = groundTexture();
  map.repeat.set(Math.max(1, cols * 1.4), Math.max(1, rows * 1.4));
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map,
    roughness: 0.95,
    metalness: 0.02,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'ground';

  // Re-sample the surface while something is being molded, so the block can be
  // seen sinking into the landscape instead of popping into place.
  const position = geometry.attributes.position;
  let refreshAt = 0;
  const refresh = (molds) => {
    moldsNow = molds;
    for (let j = 0; j <= segY; j++) {
      for (let i = 0; i <= segX; i++) {
        const tx = b.minX - 0.5 + (i / segX) * cols;
        const ty = b.minY - 0.5 + (j / segY) * rows;
        position.setY(j * (segX + 1) + i, heightAt(tx, ty));
      }
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    refreshAt = performance.now();
  };

  return { mesh, heightAt, bounds: b, refresh, lastRefresh: () => refreshAt };
}
