// A walkable region generated directly from the world tiles. Selecting a tile on
// the table and descending puts you on that exact tile, in the same world.

import * as THREE from 'three';
import { BIOMES, WATER_BIOMES, isLand, key, tileAt } from '../world.js';
import { tree as detailTree, grassStrands, waterSurface, mountain, animal as detailAnimal } from './detail.js';
import { buildingModel, loadTownModels, townModels } from './models.js';
import { loadNatureModels, onNatureReady, swapNatureTrees } from './nature.js';
import {
  loadPeopleModels, onPeopleReady, peopleReady, personModel, walkPerson,
} from './people.js';
import { loadCreatureModels, creaturesReady, creatureModel, onCreaturesReady } from './creatures.js';
import { groundCover } from './surfaces.js';
import { loadMountainModels, peak as sharedPeak } from './mountains.js';
import { advanceWater, makeWaterMaterial } from './water.js';
import { SKY, SUN, applyEnvironment, quality } from './grade.js';

const TS = 4;
const RADIUS = 6;

function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function labelSprite(text, color = '#f0dfb4') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(6,8,10,0.55)';
  ctx.fillRect(0, 34, 512, 60);
  ctx.font = '42px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sprite.scale.set(7, 1.75, 1);
  sprite.renderOrder = 20;
  return sprite;
}

export class Region {
  constructor(state, center) {
    this.scene = new THREE.Scene();
    this.center = { x: center.x, y: center.y };
    this.state = state;
    this.tiles = new Map();
    this.npcActors = [];
    this.animalActors = [];
    this.disasterFX = [];
    this.warFX = [];
    this.waterRipples = [];
    this.waterMats = [];
    this.rapidsFX = [];
    this.settlementRoads = new Map();
    this.towns = new Map();
    this.townMats = null;
    this.townCheck = 0;
    // the modelled buildings arrive a moment after the first frame; the towns
    // are rebuilt with them the moment they are ready
    this.modelsPending = true;
    loadTownModels();
    // Villagers and wildlife are models too. Both packs are usually already in
    // memory by the time you walk into a region; if not, the crowd is rebuilt
    // the moment they land.
    this.natureSwapped = false;
    // trees drawn before the pack arrived are replaced in place the moment it
    // lands, without waiting for the next settlement rebuild
    onNatureReady(() => {
      if (this.natureSwapped) return;
      this.natureSwapped = true;
      swapNatureTrees(this.scene);
    });
    loadNatureModels();
    this.disposables = [];
    this.time = 0;

    // Day, not dusk. The sky is painted with the sun already in it, and the
    // same sheet is the region's image-based light: rock, water and metal now
    // reflect the sky above them instead of a single flat tint. The hemisphere
    // and ambient terms are lighter than they were because the probe carries
    // part of the fill now.
    applyEnvironment(this.scene, 'outdoor');
    this.scene.fog = new THREE.FogExp2(SKY.horizon, 0.0072);

    this.scene.add(new THREE.HemisphereLight(0xd6e9f7, 0x6d6047, 1.15));
    this.scene.add(new THREE.AmbientLight(0x9fb3c6, 0.22));
    const sun = new THREE.DirectionalLight(0xfff1d6, 3.0);
    sun.position.set(SUN.x, SUN.y, SUN.z);
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.regionShadow, quality.regionShadow);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.scene.add(sun.target);
    // The sun keeps this offset from the player, so the shadow camera travels
    // with them instead of sitting over the middle of the patch.
    this.sunOffset = sun.position.clone();
    this.sun = sun;

    this.buildGround();
    this.buildHorizon();
    this.buildFeatures();
    this.buildActors();
    this.spawn = this.findSpawn();

    // Villagers and wildlife stand in as painted shapes until the model packs
    // are in memory; if they land later, the crowd is rebuilt in place.
    this.peopleApplied = peopleReady();
    this.creaturesApplied = creaturesReady();
    loadPeopleModels();
    loadCreatureModels();
    onPeopleReady(() => {
      if (this.peopleApplied) return;
      this.peopleApplied = true;
      this.reskinActors();
    });
    onCreaturesReady(() => {
      if (this.creaturesApplied) return;
      this.creaturesApplied = true;
      this.reskinActors();
    });
  }

  buildGround() {
    // the sea the island stands in: painted water with long slow swells, so the
    // patch never floats in the void and the horizon is alive
    const oceanMat = makeWaterMaterial({
      tint: '#9cc6da',
      opacity: 1,
      river: false,
      dir: 'both',
      repeat: 26,
      speed: 0.035,
    });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.42;
    this.scene.add(ocean);
    this.waterMats.push(oceanMat);

    // Pass 1: every tile becomes a sample of ground, not a cube.
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      for (let dy = -RADIUS; dy <= RADIUS; dy++) {
        const tx = this.center.x + dx;
        const ty = this.center.y + dy;
        const tile = tileAt(this.state.world, tx, ty);
        if (!tile) continue;
        const land = isLand(tile);
        const top = land ? 0.5 + Math.max(-0.3, Math.min(1.2, tile.elevation)) * 1.7 : -0.1;
        this.tiles.set(key(tx, ty), { tile, top, land, x: dx * TS, z: dy * TS });
      }
    }

    // Pass 2: smooth the heights so the land rolls between tiles instead of
    // stepping like a staircase. Water keeps its own level.
    const smoothed = new Map();
    for (const [k, info] of this.tiles) {
      if (!info.land) {
        smoothed.set(k, -0.1);
        continue;
      }
      let sum = info.top * 2;
      let n = 2;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nb = this.tiles.get(key(info.tile.x + ox, info.tile.y + oy));
        if (!nb || !nb.land) continue;
        sum += nb.top;
        n += 1;
      }
      smoothed.set(k, sum / n);
    }
    for (const [k, info] of this.tiles) info.top = smoothed.get(k);

    this.buildTerrain();

    // Pass 3: water, grass and fields sit on the smoothed ground.
    for (const info of this.tiles.values()) {
      const { tile, land, x, z } = info;
      const def = BIOMES[tile.biome] || BIOMES.blackgrass;
      if (!land) {
        // keep each sheet inside its own tile so it never bleeds onto land
        const river = tile.biome === 'river';
        // shallows near a bank are pale and clear; the middle of a channel is
        // deep and holds its colour
        const shallow = this.shoreDepth(info) <= 1;
        // white water where the bed drops, and now and then along a run of river
        const rapids = river && (this.rapidsAt(info) || (tile.x * 7 + tile.y * 5) % 13 === 0);
        const water = waterSurface(TS, TS, shallow ? '#f2fcff' : river ? '#dff2fb' : '#b6d7e6', {
          river,
          dir: this.flowDir(tile),
          seed: tile.x * 31 + tile.y * 17,
          opacity: shallow ? 0.78 : 0.96,
          speed: rapids ? 1.15 : null,
        });
        water.group.position.set(x, info.top + (shallow ? 0.012 : 0.02), z);
        this.scene.add(water.group);
        if (water.material) this.waterMats.push(water.material);
        for (const ripple of water.ripples) this.waterRipples.push(ripple);
        if (rapids) this.buildRapids(info);
      } else if (tile.detail > 0.2) {
        const tufts = grassStrands(26, TS * 0.42, { color: '#33502c', height: 0.55 });
        tufts.position.set(x, info.top, z);
        this.scene.add(tufts);
      }

      // the bank you walk: stones and reeds along every shore, so the edge of
      // the water is ground you can follow instead of a cliff
      if (land && this.touchesWater(tile)) this.buildBank(info);

      // cultivated fields around settlements
      if (tile.settlementId && land) {
        const plot = new THREE.Mesh(
          new THREE.PlaneGeometry(TS * 0.7, TS * 0.35),
          new THREE.MeshStandardMaterial({ color: 0x6d7a3d, roughness: 1 }),
        );
        plot.rotation.x = -Math.PI / 2;
        plot.rotation.z = hash(tile.x, tile.y) * 3;
        plot.position.set(x + 1.0, info.top + 0.02, z + 1.1);
        this.scene.add(plot);
      }
    }
  }

  // How far this water sits from dry ground: 1 on the shoreline, 2 a tile out,
  // 3 in the open water. The first ring is the shallow shelf you can wade.
  shoreDepth(info) {
    const { tile } = info;
    let best = 2;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const nb = this.tiles.get(key(tile.x + dx, tile.y + dy));
        if (nb && nb.land) best = Math.min(best, Math.max(Math.abs(dx), Math.abs(dy)));
      }
    }
    return best;
  }

  touchesWater(tile) {
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nb = this.tiles.get(key(tile.x + dx, tile.y + dy));
      return !!(nb && !nb.land);
    });
  }

  // A river dropping away under itself is a rapid: white water over the stones.
  rapidsAt(info) {
    const { tile, top } = info;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = this.tiles.get(key(tile.x + dx, tile.y + dy));
      if (!nb || nb.land) continue;
      if (Math.abs(nb.top - top) > 0.12) return true;
    }
    return false;
  }

  buildRapids(info) {
    const foamMat = new THREE.MeshBasicMaterial({
      color: 0xf4fbff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const group = new THREE.Group();
    group.position.set(info.x, info.top + 0.03, info.z);
    for (let i = 0; i < 5; i++) {
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(TS * (0.18 + hash(i, 3) * 0.22), TS * 0.06), foamMat.clone());
      streak.rotation.x = -Math.PI / 2;
      streak.rotation.z = hash(i, 7) * Math.PI;
      streak.position.set((hash(i, 11) - 0.5) * TS * 0.7, 0.002, (hash(i, 13) - 0.5) * TS * 0.7);
      group.add(streak);
    }
    this.scene.add(group);
    this.rapidsFX.push({ group, mats: group.children.map((m) => m.material), phase: hash(info.tile.x, info.tile.y) * 6 });
  }

  buildBank(info) {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.95 });
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x4c6b3a, roughness: 0.95 });
    const group = new THREE.Group();
    group.position.set(info.x, info.top, info.z);
    for (let i = 0; i < 4; i++) {
      const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + hash(i, 5) * 0.14, 0), stoneMat);
      stone.scale.y = 0.55;
      stone.rotation.y = hash(i, 9) * Math.PI;
      stone.position.set((hash(info.tile.x + i, 3) - 0.5) * TS * 0.85, 0.05, (hash(info.tile.y + i, 7) - 0.5) * TS * 0.85);
      stone.castShadow = true;
      stone.receiveShadow = true;
      group.add(stone);
    }
    for (let i = 0; i < 5; i++) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.55 + hash(i, 13) * 0.4, 3), reedMat);
      blade.position.set((hash(info.tile.x + i, 17) - 0.5) * TS * 0.8, 0.3, (hash(info.tile.y + i, 19) - 0.5) * TS * 0.8);
      blade.rotation.z = (hash(i, 23) - 0.5) * 0.3;
      group.add(blade);
    }
    this.scene.add(group);
  }

  // Which way the water runs here: along the axis where this tile has more wet
  // neighbours, so the current follows the channel instead of the tile grid.
  flowDir(tile) {
    const wet = (x, y) => {
      const t = this.state.world.tiles.get(key(x, y));
      return !!(t && WATER_BIOMES.has(t.biome));
    };
    let ew = 0;
    let ns = 0;
    if (wet(tile.x - 1, tile.y)) ew += 1;
    if (wet(tile.x + 1, tile.y)) ew += 1;
    if (wet(tile.x, tile.y - 1)) ns += 1;
    if (wet(tile.x, tile.y + 1)) ns += 1;
    if (!ew && !ns) return 'both';
    return ew >= ns ? 'x' : 'y';
  }

  cornerH(tx, ty) {
    let sum = 0;
    let n = 0;
    for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const info = this.tiles.get(key(tx + dx, ty + dy));
      if (!info) continue;
      sum += info.top;
      n += 1;
    }
    return n ? sum / n : -0.1;
  }

  // One continuous, vertex-coloured ground mesh over the whole patch.
  buildTerrain() {
    const infos = [...this.tiles.values()];
    if (!infos.length) return;
    let minTx = Infinity;
    let maxTx = -Infinity;
    let minTy = Infinity;
    let maxTy = -Infinity;
    for (const info of infos) {
      minTx = Math.min(minTx, info.tile.x);
      maxTx = Math.max(maxTx, info.tile.x);
      minTy = Math.min(minTy, info.tile.y);
      maxTy = Math.max(maxTy, info.tile.y);
    }
    const cols = maxTx - minTx + 1;
    const rows = maxTy - minTy + 1;
    const colsV = cols + 1;
    const rowsV = rows + 1;
    const positions = [];
    const colors = [];
    const uvs = [];
    const indices = [];
    const color = new THREE.Color();
    const sand = new THREE.Color('#c2ab7d');

    for (let j = 0; j < rowsV; j++) {
      for (let i = 0; i < colsV; i++) {
        const ctx = minTx + i;
        const cty = minTy + j;
        const x = (ctx - this.center.x - 0.5) * TS;
        const z = (cty - this.center.y - 0.5) * TS;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        let wet = false;
        let landHere = false;
        for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const info = this.tiles.get(key(ctx + dx, cty + dy));
          if (!info) continue;
          if (info.land) landHere = true;
          else wet = true;
          const def = BIOMES[info.tile.biome] || BIOMES.blackgrass;
          color.set(def.world);
          r += color.r;
          g += color.g;
          b += color.b;
          n += 1;
        }
        // slopes catch the sun: this is what makes a hill read as a hill up close
        const slope = this.cornerH(ctx - 1, cty - 1) - this.cornerH(ctx + 1, cty + 1);
        const shade = Math.max(0.8, Math.min(1.18, 1 + slope * 0.35));
        // a little unevenness so the ground is trodden earth, not a table
        const bumps = (hash(ctx * 7 + 1, cty * 13 + 3) - 0.5) * 0.07;
        positions.push(x, this.cornerH(ctx, cty) + bumps, z);
        // the texture repeats every two tiles, in world units, so it keeps its
        // scale whether the patch is nine tiles across or fifteen
        uvs.push(x / (TS * 2), z / (TS * 2));
        if (n) {
          color.setRGB(r / n, g / n, b / n);
          // where water meets land the ground dries into a band of sand
          if (wet && landHere) color.lerp(sand, 0.45);
          colors.push(color.r * shade, color.g * shade, color.b * shade);
        } else {
          colors.push(0.04, 0.16, 0.26);
        }
      }
    }

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = j * colsV + i;
        const b2 = a + 1;
        const c = a + colsV;
        const d = c + 1;
        indices.push(a, b2, c, b2, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const cover = groundCover();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: cover.map,
      bumpMap: cover.bump,
      bumpScale: 0.25,
      roughness: 0.96,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.disposables.push(geo);
    this.terrain = mesh;
  }

  buildFeatures() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 });
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: 0x2f5a38, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x3b6b41, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0x24462e, roughness: 0.95 }),
    ];
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 0.95 });
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xdde6e9, roughness: 0.8 });
    const hutMat = new THREE.MeshStandardMaterial({ color: 0x9a7f5c, roughness: 0.92 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x53331f, roughness: 0.95 });

    const bloomMats = [
      new THREE.MeshStandardMaterial({ color: '#e0c96a', roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: '#d8d2c0', roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: '#b06ba0', roughness: 0.85 }),
    ];
    const bloomGeo = new THREE.SphereGeometry(0.032, 5, 4);
    const stemGeo = new THREE.CylinderGeometry(0.006, 0.008, 0.11, 4);
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x4d6b3a, roughness: 1 });
    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.14, 1.1, 6);
    const leafGeo = new THREE.ConeGeometry(0.9, 2.6, 7);
    const rockGeo = new THREE.IcosahedronGeometry(0.8, 0);
    const hutGeo = new THREE.BoxGeometry(1.2, 0.9, 1.1);
    const roofGeo = new THREE.ConeGeometry(1.0, 0.7, 4);
    this.disposables.push(trunkGeo, leafGeo, rockGeo, hutGeo, roofGeo);
    this.townMats = { hutMat, roofMat, hutGeo, roofGeo };

    for (const info of this.tiles.values()) {
      const { tile, top, land, x, z } = info;
      if (!land) continue;
      const r = hash(tile.x, tile.y);
      const r2 = hash(tile.y + 17, tile.x - 5);

      if (tile.biome === 'forest' || tile.biome === 'deepforest' || (tile.trees > 0.5 && tile.biome !== 'swamp')) {
        const count = tile.biome === 'deepforest' ? 7 : 4;
        for (let i = 0; i < count; i++) {
          const hx = hash(tile.x * 31 + i, tile.y * 17 - i);
          const hz = hash(tile.x * 13 - i, tile.y * 29 + i * 3);
          const px = x + (hx - 0.5) * (TS - 1.2);
          const pz = z + (hz - 0.5) * (TS - 1.2);
          const group = detailTree({ scale: 2.6 + hz * 1.3, seed: tile.x * 31 + tile.y * 17 + i });
          group.position.set(px, top, pz);
          group.rotation.y = hx * Math.PI * 2;
          this.scene.add(group);
        }
      }

      if (tile.biome === 'mountain' || tile.biome === 'peak') {
        const snowy = tile.biome === 'peak' || tile.elevation > 0.62;
        // the same peak design and texture as the board, only life-size
        const shape = sharedPeak({
          height: TS * (tile.biome === 'peak' ? 2.4 : 1.7),
          width: TS * 1.1,
          seed: tile.x * 53 + tile.y * 29,
          snow: snowy,
        }) || mountain({
          scale: TS * (tile.biome === 'peak' ? 1.1 : 0.8),
          seed: tile.x * 53 + tile.y * 29,
          snow: snowy,
          ridges: tile.biome === 'peak' ? 3 : 2,
        });
        shape.position.set(x, top, z);
        shape.rotation.y = r * Math.PI * 2;
        this.scene.add(shape);
      }

      if (tile.biome === 'blackgrass') {
        for (let i = 0; i < 5; i++) {
          const hx = hash(tile.x * 19 + i, tile.y * 23 - i);
          const hz = hash(tile.x * 11 - i, tile.y * 37 + i);
          const tuft = new THREE.Mesh(
            new THREE.ConeGeometry(0.16, 0.4, 4),
            new THREE.MeshStandardMaterial({ color: 0x1d2a20, roughness: 1 }),
          );
          tuft.position.set(x + (hx - 0.5) * 3.4, top + 0.18, z + (hz - 0.5) * 3.4);
          this.scene.add(tuft);
        }
      }

      if (tile.settlementId) {
        const settlement = this.state.settlements.find((s) => s.id === tile.settlementId && s.alive);
        if (settlement) {
          // One town per settlement, laid out from its centre tile and spread
          // over the ground around it, not rebuilt on every tile it covers.
          if (settlement.x === tile.x && settlement.y === tile.y) {
            this.buildSettlement(info, settlement, hutMat, roofMat, hutGeo, roofGeo, r);
          }
        }
      }

      // ground clutter: pebbles, flowers, ferns and reeds, so a field is a field
      // when you are standing in it and not only from the table
      if (land && !tile.settlementId) {
        const pebbles = 3;
        for (let i = 0; i < pebbles; i++) {
          const hx = hash(tile.x * 41 + i, tile.y * 7 - i);
          if (hx > 0.62) continue;
          const sz = 0.1 + hx * 0.22;
          const stone = new THREE.Mesh(rockGeo, rockMat);
          stone.scale.set(sz, sz * 0.55, sz * 0.9);
          stone.position.set(
            x + (hash(tile.y * 3 + i, tile.x) - 0.5) * (TS - 0.6),
            top + sz * 0.22,
            z + (hash(tile.x * 5 - i, tile.y * 9) - 0.5) * (TS - 0.6),
          );
          stone.rotation.y = hx * 6.2;
          this.scene.add(stone);
        }
        if (tile.detail > 0.32) {
          const flowers = 3 + Math.round(tile.detail * 5);
          for (let i = 0; i < flowers; i++) {
            const hx = hash(tile.x * 23 + i * 7, tile.y * 31 - i);
            const bx = x + (hash(tile.y * 11 + i, tile.x * 3) - 0.5) * (TS - 0.8);
            const bz = z + (hash(tile.x * 17 - i, tile.y * 5) - 0.5) * (TS - 0.8);
            const stem = new THREE.Mesh(stemGeo, reedMat);
            stem.position.set(bx, top + 0.055, bz);
            this.scene.add(stem);
            const bloom = new THREE.Mesh(bloomGeo, bloomMats[hx > 0.66 ? 0 : hx > 0.33 ? 1 : 2]);
            bloom.scale.setScalar(0.7 + hx * 0.5);
            bloom.position.set(bx, top + 0.11, bz);
            this.scene.add(bloom);
          }
        }
        if ((tile.biome === 'swamp') && hash(tile.x, tile.y) > 0.4) {
          for (let i = 0; i < 4; i++) {
            const reed = new THREE.Mesh(
              new THREE.ConeGeometry(0.03, 0.9 + hash(i, tile.x) * 0.5, 4),
              reedMat,
            );
            reed.position.set(
              x + (hash(tile.x + i, tile.y) - 0.5) * 3.2,
              top + 0.45,
              z + (hash(tile.y + i, tile.x) - 0.5) * 3.2,
            );
            this.scene.add(reed);
          }
        }
      }

      if (tile.blood > 0) {
        const stain = new THREE.Mesh(
          new THREE.CircleGeometry(1.1 + tile.blood * 0.3, 18),
          new THREE.MeshBasicMaterial({ color: 0x5c1212, transparent: true, opacity: 0.55, depthWrite: false }),
        );
        stain.rotation.x = -Math.PI / 2;
        stain.position.set(x, top + 0.03, z);
        this.scene.add(stain);
      }

      if (tile.war) {
        const glow = new THREE.Mesh(
          new THREE.RingGeometry(1.4, 1.9, 24),
          new THREE.MeshBasicMaterial({ color: 0xff3a1e, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
        );
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(x, top + 0.04, z);
        this.scene.add(glow);
        this.warFX.push(glow);
      }

      if (tile.disaster && this.state.world.day - tile.disaster.day < 10) {
        const count = 26;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          positions[i * 3] = (hash(tile.x + i, tile.y) - 0.5) * 2.5;
          positions[i * 3 + 1] = hash(tile.y + i, tile.x) * 1.5;
          positions[i * 3 + 2] = (hash(tile.x - i, tile.y + i) - 0.5) * 2.5;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const points = new THREE.Points(
          geo,
          new THREE.PointsMaterial({ color: 0xd8743a, size: 0.28, transparent: true, opacity: 0.75, depthWrite: false }),
        );
        points.position.set(x, top + 0.2, z);
        this.scene.add(points);
        this.disasterFX.push({ points, base: positions.slice(), speed: 0.3 + tile.disaster.intensity });
      }
    }
  }

  landAt(x, z) {
    const tx = this.center.x + Math.round(x / TS);
    const ty = this.center.y + Math.round(z / TS);
    const info = this.tiles.get(key(tx, ty));
    return info && info.land ? info : null;
  }

  townSignature(settlement) {
    const businesses = this.state.businesses.filter((b) => b.alive && b.settlementId === settlement.id).length;
    return `${settlement.buildings.length}:${settlement.population}:${businesses}:${settlement.nationId || 0}`;
  }

  buildSettlement(info, settlement, hutMat, roofMat, hutGeo, roofGeo, r) {
    // A town, not a single tile: the plaza is in the middle, dirt roads run out
    // across the neighbouring ground, and the houses and shops stand at the ends
    // of those roads with their doors facing the square. Jolene dresses the
    // whole thing afterwards.
    const previous = this.towns.get(settlement.id);
    if (previous) this.scene.remove(previous.group);
    const group = new THREE.Group();
    this.scene.add(group);

    const businesses = this.state.businesses.filter((b) => b.alive && b.settlementId === settlement.id).slice(0, 4);
    // the village grows with the settlement: every building and every few
    // extra souls adds another house on the next visit (or while you stand here)
    const houses = Math.min(20, 4 + settlement.buildings.length * 2 + Math.floor(settlement.population / 10));
    const slots = houses + businesses.length;
    const nation = settlement.nationId ? this.state.nations.find((n) => n.id === settlement.nationId) : null;

    const dirt = new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 1 });
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1 });
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const gableGeo = new THREE.ConeGeometry(0.72, 1, 4);
    const doorGeo = new THREE.BoxGeometry(0.42, 0.62, 0.06);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2817, roughness: 0.92 });
    const awningMat = new THREE.MeshStandardMaterial({ color: 0x8c3f2f, roughness: 0.85 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0xcfa968, emissive: 0x6b4a1c, emissiveIntensity: 0.5, roughness: 0.6 });
    this.disposables.push(wallGeo, gableGeo, doorGeo);

    const plaza = new THREE.Mesh(new THREE.CircleGeometry(3.4, 22), dirt);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(info.x, info.top + 0.035, info.z);
    plaza.receiveShadow = true;
    group.add(plaza);

    const routes = [];
    const roadSegment = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 0.02) return;
      // sit the strip on the higher of the two tiles so it is never swallowed
      const y = Math.max(this.groundAt(x1, z1), this.groundAt(x2, z2)) + 0.06;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, len), roadMat);
      seg.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
      seg.rotation.y = Math.atan2(x2 - x1, z2 - z1);
      seg.receiveShadow = true;
      group.add(seg);
    };

    for (let i = 0; i < slots; i++) {
      const angle = (i / slots) * Math.PI * 2 + hash(settlement.id * 7, i) * 0.35;
      const radius = 8.5 + hash(settlement.id + 11, i) * 5.5;
      const px = info.x + Math.cos(angle) * radius;
      const pz = info.z + Math.sin(angle) * radius;
      const foot = this.landAt(px, pz);
      if (!foot) continue;

      // dirt road from the plaza out to this door
      let prevX = info.x + Math.cos(angle) * 3.2;
      let prevZ = info.z + Math.sin(angle) * 3.2;
      for (let sIdx = 1; sIdx <= 7; sIdx++) {
        const rr = 3.2 + (radius - 3.6) * (sIdx / 7);
        const nx = info.x + Math.cos(angle) * rr;
        const nz = info.z + Math.sin(angle) * rr;
        roadSegment(prevX, prevZ, nx, nz);
        prevX = nx;
        prevZ = nz;
      }
      routes.push({
        ax: info.x + Math.cos(angle) * 3.6,
        az: info.z + Math.sin(angle) * 3.6,
        bx: px,
        bz: pz,
      });

      const biz = i < businesses.length ? businesses[i] : null;
      const w = biz ? 4.6 : 1.6 + hash(i, settlement.id) * 1.2;
      const d = biz ? 3.8 : 1.5 + hash(i + 3, settlement.id) * 1.1;
      const h = biz ? 4.4 + hash(i + 9, settlement.id) * 0.9 : 3.2 + hash(i + 7, settlement.id) * 1.8;
      const house = new THREE.Group();

      // A real modelled building from the graphics pack when it is loaded, and
      // the painted box only until the first models arrive.
      const modelName = this.houseModelFor(i, biz, settlement);
      const model = modelName ? buildingModel(modelName, h * 1.25, 4.6) : null;
      const top = model ? model.userData.height || h : h;
      if (model) {
        house.add(model);
      } else {
        const walls = new THREE.Mesh(wallGeo, hutMat);
        walls.scale.set(w, h, d);
        walls.position.y = h / 2;
        walls.castShadow = true;
        walls.receiveShadow = true;
        house.add(walls);

        const roof = new THREE.Mesh(gableGeo, roofMat);
        roof.scale.set(w * 1.34, h * 0.3, d * 1.34);
        roof.position.y = h + h * 0.15;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        house.add(roof);

        const door = new THREE.Mesh(doorGeo, doorMat);
        door.scale.set(w * 0.24, h * 0.3, 0.3);
        door.position.set(0, h * 0.15, d / 2 + 0.02);
        house.add(door);
      }

      if (biz) {
        // a shopfront: awning and lit windows on the painted box, and the name
        // over the door whichever building stands there
        if (!model) {
          const awning = new THREE.Mesh(new THREE.BoxGeometry(w * 1.08, 0.14, 1.6), awningMat);
          awning.position.set(0, h * 0.62, d / 2 + 0.6);
          awning.castShadow = true;
          house.add(awning);
          for (const side of [-1, 1]) {
            const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.24, h * 0.2, 0.08), windowMat);
            win.position.set(side * w * 0.28, h * 0.4, d / 2 + 0.03);
            house.add(win);
          }
        }
        const sign = labelSprite(biz.name, '#f0dfb4');
        sign.scale.set(3.4, 0.85, 1);
        sign.position.set(0, top + 1.15, 0);
        house.add(sign);
      }

      house.position.set(px, foot.top, pz);
      house.rotation.y = Math.atan2(info.x - px, info.z - pz);
      group.add(house);
    }

    this.settlementRoads.set(settlement.id, routes);

    // fire
    const fire = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffb45c }));
    fire.position.set(info.x, info.top + 0.3, info.z);
    group.add(fire);
    const fireLight = new THREE.PointLight(0xff9a45, 6, 9, 2);
    fireLight.position.copy(fire.position).setY(info.top + 0.8);
    group.add(fireLight);

    // banner
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), new THREE.MeshStandardMaterial({ color: 0x2c2118 }));
    pole.position.set(info.x - 1.8, info.top + 2, info.z - 1.8);
    group.add(pole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(nation?.color || '#c9a227'), side: THREE.DoubleSide, roughness: 0.9 }),
    );
    flag.position.set(info.x - 1.1, info.top + 3.15, info.z - 1.8);
    group.add(flag);

    const label = labelSprite(`${settlement.name}`, nation ? nation.color : '#f0dfb4');
    label.position.set(info.x, info.top + 9.4, info.z);
    group.add(label);

    this.dressTown(group, info, settlement, nation, routes, houses);
    this.towns.set(settlement.id, { group, signature: this.townSignature(settlement) });
  }

  // Which modelled building stands on a plot: a shopfront for a business, the
  // odd landmark around the edge, and homes everywhere else.
  houseModelFor(index, biz, settlement) {
    if (!townModels()) return null;
    const seed = settlement.id * 131 + index * 17;
    const pick = (list, salt) => list[Math.floor(hash(seed, salt) * list.length) % list.length];
    if (biz) return pick(['market', 'blacksmith', 'barracks', 'market'], 3);
    if (index > 0 && index % 9 === 4) {
      return pick(['church', 'windmill', 'watermill', 'tower_a', 'tower_b', 'archery', 'mine', 'castle'], 5);
    }
    const homes = ['home_a', 'home_b', 'building_a', 'home_b', 'home_a', 'building_b'];
    return homes[index % homes.length];
  }

  // Jolene's pass over the world: the same town Johan raised, but painted,
  // planted, fenced and furnished instead of left as bare boxes.
  dressTown(group, info, settlement, nation, routes, houses) {
    const rand = (n) => hash(settlement.id * 97 + n, settlement.id * 41 - n * 3);
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.95 });
    const clothMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(nation?.color || '#a8532f'),
      roughness: 0.88,
      side: THREE.DoubleSide,
    });
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.95 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8880, roughness: 0.95 });
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x4a3521, roughness: 1 });
    const cropMat = new THREE.MeshStandardMaterial({ color: 0x5f7a3a, roughness: 1 });
    const flowerMats = ['#d8b23c', '#c46a5a', '#b08ad0', '#e0d7a8'].map(
      (c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.8 }),
    );
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd79a, emissive: 0xffb45c, emissiveIntensity: 0.9 });

    const flowerGeo = new THREE.SphereGeometry(0.12, 6, 5);
    const stemGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.32, 4);
    const postGeo = new THREE.BoxGeometry(0.1, 0.8, 0.1);
    const railGeo = new THREE.BoxGeometry(1, 0.07, 0.06);
    const barrelGeo = new THREE.CylinderGeometry(0.26, 0.3, 0.7, 8);
    const cropGeo = new THREE.ConeGeometry(0.16, 0.5, 5);
    this.disposables.push(flowerGeo, stemGeo, postGeo, railGeo, barrelGeo, cropGeo);

    const place = (mesh, x, z, lift = 0) => {
      if (!this.landAt(x, z)) return null;
      mesh.position.set(x, this.groundAt(x, z) + lift, z);
      group.add(mesh);
      return mesh;
    };

    // cobbled apron ringing the square
    const apron = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.15, 26), stoneMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(info.x, info.top + 0.045, info.z);
    group.add(apron);

    // market stalls around the square
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.55;
      const sx = info.x + Math.cos(a) * 5.3;
      const sz = info.z + Math.sin(a) * 5.3;
      if (!this.landAt(sx, sz)) continue;
      const stall = new THREE.Group();
      const table = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 1.1), plankMat);
      table.position.y = 0.76;
      stall.add(table);
      for (const [lx, lz] of [[-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.76, 0.1), plankMat);
        leg.position.set(lx, 0.38, lz);
        stall.add(leg);
      }
      const canopy = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7), clothMat);
      canopy.rotation.x = -Math.PI / 2 + 0.22;
      canopy.position.set(0, 2.15, -0.12);
      stall.add(canopy);
      for (const lx of [-1.05, 1.05]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), plankMat);
        post.position.set(lx, 1.1, -0.55);
        stall.add(post);
      }
      stall.position.set(sx, this.groundAt(sx, sz), sz);
      stall.rotation.y = a + Math.PI / 2;
      group.add(stall);
    }

    // the town well
    const wellX = info.x + 2.5;
    const wellZ = info.z + 1.1;
    if (this.landAt(wellX, wellZ)) {
      const well = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, 0.62, 12), stoneMat);
      ring.position.y = 0.31;
      well.add(ring);
      const postA = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.7, 0.1), plankMat);
      postA.position.set(-0.6, 0.95, 0);
      const postB = postA.clone();
      postB.position.x = 0.6;
      well.add(postA, postB);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.6, 4), new THREE.MeshStandardMaterial({ color: 0x53331f, roughness: 0.95 }));
      roof.position.y = 2.0;
      roof.rotation.y = Math.PI / 4;
      well.add(roof);
      well.position.set(wellX, this.groundAt(wellX, wellZ), wellZ);
      group.add(well);
    }

    // lamps at the road mouths
    for (const route of routes.slice(0, 4)) {
      const ang = Math.atan2(route.az - info.z, route.ax - info.x);
      const lx = info.x + Math.cos(ang + 0.28) * 4.6;
      const lz = info.z + Math.sin(ang + 0.28) * 4.6;
      if (!this.landAt(lx, lz)) continue;
      const lamp = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), plankMat);
      post.position.y = 1.25;
      lamp.add(post);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lampMat);
      bulb.position.y = 2.55;
      lamp.add(bulb);
      lamp.position.set(lx, this.groundAt(lx, lz), lz);
      group.add(lamp);
    }

    // fences along the first few roads
    for (const route of routes.slice(0, 4)) {
      const dx = route.bx - route.ax;
      const dz = route.bz - route.az;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const steps = Math.max(2, Math.min(6, Math.floor(len / 2.1)));
      for (const side of [-1, 1]) {
        let prev = null;
        for (let sIdx = 1; sIdx <= steps; sIdx++) {
          const t = sIdx / (steps + 1);
          const fx = route.ax + dx * t + nx * side * 1.35;
          const fz = route.az + dz * t + nz * side * 1.35;
          if (!this.landAt(fx, fz)) {
            prev = null;
            continue;
          }
          const post = new THREE.Mesh(postGeo, plankMat);
          place(post, fx, fz, 0.4);
          if (prev) {
            const rail = new THREE.Mesh(railGeo, plankMat);
            const mx = (prev.x + fx) / 2;
            const mz = (prev.z + fz) / 2;
            const seg = place(rail, mx, mz, 0.62);
            if (seg) {
              seg.scale.x = Math.hypot(fx - prev.x, fz - prev.z);
              seg.rotation.y = Math.atan2(fx - prev.x, fz - prev.z) + Math.PI / 2;
            }
          }
          prev = { x: fx, z: fz };
        }
      }
    }

    // gardens and flowers by the doors
    for (let i = 0; i < houses; i++) {
      const route = routes[i % Math.max(1, routes.length)];
      if (!route) break;
      const gx = route.bx + (rand(i) - 0.5) * 4.4;
      const gz = route.bz + (rand(i + 30) - 0.5) * 4.4;
      if (!this.landAt(gx, gz)) continue;
      if (rand(i + 60) > 0.45) {
        const plot = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.6), soilMat);
        place(plot, gx, gz, 0.02);
        for (let c = 0; c < 6; c++) {
          const crop = new THREE.Mesh(cropGeo, cropMat);
          place(crop, gx + (c % 3 - 1) * 0.7, gz + (Math.floor(c / 3) - 0.5) * 0.7, 0.28);
        }
      }
      if (rand(i + 90) > 0.35) {
        const mat = flowerMats[Math.floor(rand(i + 120) * flowerMats.length)];
        for (let f = 0; f < 4; f++) {
          const fx = gx + (rand(i * 7 + f) - 0.5) * 1.8;
          const fz = gz + (rand(i * 11 + f) - 0.5) * 1.8;
          place(new THREE.Mesh(stemGeo, cropMat), fx, fz, 0.16);
          place(new THREE.Mesh(flowerGeo, mat), fx, fz, 0.34);
        }
      }
      if (rand(i + 150) > 0.6) {
        const barrel = new THREE.Mesh(barrelGeo, barrelMat);
        place(barrel, gx + 1.3, gz - 1.0, 0.35);
      }
    }

    // a few ornamental trees and grass tufts so the town sits in greenery
    for (let i = 0; i < 4; i++) {
      const a = rand(i + 200) * Math.PI * 2;
      const rr = 5.6 + rand(i + 210) * 6;
      const tx = info.x + Math.cos(a) * rr;
      const tz = info.z + Math.sin(a) * rr;
      if (!this.landAt(tx, tz)) continue;
      const treeGroup = detailTree({ scale: 1.5 + rand(i + 220) * 0.7, seed: settlement.id * 13 + i });
      treeGroup.position.set(tx, this.groundAt(tx, tz), tz);
      treeGroup.rotation.y = rand(i + 230) * Math.PI * 2;
      group.add(treeGroup);
    }
    for (let i = 0; i < 8; i++) {
      const route = routes[i % Math.max(1, routes.length)];
      if (!route) break;
      const tx = route.ax + (route.bx - route.ax) * rand(i + 260);
      const tz = route.az + (route.bz - route.az) * rand(i + 270);
      if (!this.landAt(tx, tz)) continue;
      const tufts = grassStrands(8, 0.9, { color: '#3a5733', height: 0.45 });
      tufts.position.set(tx, this.groundAt(tx, tz), tz);
      group.add(tufts);
    }
  }

  reassignRoutes(settlementId) {
    const routes = this.settlementRoads.get(settlementId) || [];
    if (!routes.length) return;
    let i = 0;
    for (const actor of this.npcActors) {
      if (actor.settlementId !== settlementId) continue;
      actor.route = routes[i % routes.length];
      actor.lane = (hash(i * 7, settlementId) - 0.5) * 0.8;
      i += 1;
    }
  }

  // Distant ridgelines so the walkable world has a painted background too.
  buildHorizon() {
    const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x8199ad, roughness: 1 });
    const geo = new THREE.ConeGeometry(1, 1, 5);
    this.disposables.push(geo);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + hash(i, 3) * 0.14;
      const r = 58 + hash(i, 7) * 28;
      const h = 8 + hash(i, 11) * 15;
      const w = 15 + hash(i, 13) * 16;
      const ridge = new THREE.Mesh(geo, ridgeMat);
      ridge.scale.set(w, h, w);
      ridge.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r);
      this.scene.add(ridge);
    }
  }

  // Swaps every villager and animal for the modelled versions once the packs
  // are in memory, keeping them on the same tiles.
  reskinActors() {
    if (!this.scene) return;
    for (const actor of this.npcActors) this.scene.remove(actor.group);
    for (const actor of this.animalActors) this.scene.remove(actor.group);
    this.npcActors.length = 0;
    this.animalActors.length = 0;
    this.buildActors();
  }

  buildActors() {
    const bodies = [
      new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x6a7d8a, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x7d6a8a, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x8a7d5a, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x5a7d6a, roughness: 0.9 }),
    ];
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a483, roughness: 0.85 });
    const bodyGeo = new THREE.CapsuleGeometry(0.24, 0.86, 3, 8);
    const headGeo = new THREE.SphereGeometry(0.2, 10, 8);
    this.disposables.push(bodyGeo, headGeo);

    const near = this.state.npcs.filter(
      (n) => n.alive && Math.abs(n.x - this.center.x) <= RADIUS && Math.abs(n.y - this.center.y) <= RADIUS,
    );
    // A town can hold more rigged bodies than a phone wants to draw, so the ones
    // nearest the tile you walked into fill the streets.
    const modelled = new Set(
      [...near]
        .sort((a, b) => (Math.abs(a.x - this.center.x) + Math.abs(a.y - this.center.y))
          - (Math.abs(b.x - this.center.x) + Math.abs(b.y - this.center.y)))
        .slice(0, 24),
    );
    for (const npc of near) {
      const info = this.tiles.get(key(npc.x, npc.y));
      if (!info) continue;
      const h = hash(npc.id * 17, npc.id * 3);
      const h2 = hash(npc.id * 7, 13);
      const gx = info.x + (h - 0.5) * 2.6;
      const gz = info.z + (h2 - 0.5) * 2.6;
      const group = new THREE.Group();
      // the medieval person pack, when it is here; the painted villager only
      // while the models are still on the wire
      const person = peopleReady() && modelled.has(npc) ? personModel({ seed: npc.id * 31 + 7, height: 1.75 }) : null;
      // Once the pack is in, extra villagers are simply not on the street — a
      // painted cut-out standing beside a real one would look like a mistake.
      if (peopleReady() && !person) continue;
      // rigged bodies are the most expensive thing in the region: no shadow pass
      if (person) person.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      if (person) {
        group.add(person.root);
      } else {
        const body = new THREE.Mesh(bodyGeo, bodies[npc.id % bodies.length]);
        body.position.y = 0.85;
        body.castShadow = true;
        group.add(body);
        const head = new THREE.Mesh(headGeo, skin);
        head.position.y = 1.6;
        group.add(head);
        const hat = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.34, 7), bodies[(npc.id + 2) % bodies.length]);
        hat.position.y = 1.82;
        group.add(hat);
      }
      group.position.set(gx, info.top, gz);
      this.scene.add(group);
      const roads = npc.settlementId ? this.settlementRoads.get(npc.settlementId) : null;
      const route = roads && roads.length ? roads[npc.id % roads.length] : null;
      this.npcActors.push({
        npc,
        group,
        model: person || null,
        settlementId: npc.settlementId || null,
        baseX: gx,
        baseZ: gz,
        top: info.top,
        phase: h * 10,
        route,
        // people in town walk their road back and forth at their own pace
        speed: route ? 0.16 + h2 * 0.14 : 0,
        walkPhase: route ? h * Math.PI * 2 : 0,
        lane: (hash(npc.id * 5, 13) - 0.5) * 0.8,
      });
    }

    const speciesGeo = new THREE.BoxGeometry(0.5, 0.4, 0.9);
    this.disposables.push(speciesGeo);
    for (const sp of this.state.species) {
      if (Math.abs(sp.x - this.center.x) > RADIUS || Math.abs(sp.y - this.center.y) > RADIUS) continue;
      const info = this.tiles.get(key(sp.x, sp.y));
      if (!info) continue;
      for (let i = 0; i < 2; i++) {
        const kinds = sp.kind === 'bird' ? ['chicken', 'duck'] : ['deer', 'sheep', 'cow', 'goat', 'horse', 'fox'];
        const kind = kinds[Math.floor(hash(sp.id + i, 3) * kinds.length) % kinds.length];
        const modelled = creaturesReady() ? creatureModel({ kind, height: 1.5, seed: sp.id * 7 + i }) : null;
        const critter = modelled
          ? { group: modelled.group, legs: [], kind: modelled.kind, modelled: true }
          : detailAnimal({
            kind: sp.kind === 'bird' ? 'bird' : 'deer',
            scale: 1.05,
            seed: sp.id * 7 + i,
          });
        const ax = info.x + (hash(sp.id + i, 5) - 0.5) * 3;
        const az = info.z + (hash(sp.id - i, 9) - 0.5) * 3;
        critter.group.position.set(ax, info.top, az);
        this.scene.add(critter.group);
        this.animalActors.push({
          group: critter.group,
          legs: critter.legs,
          kind: critter.kind,
          modelled: !!modelled,
          baseX: ax,
          baseZ: az,
          top: info.top,
          phase: hash(i, sp.id) * 9,
        });
      }
    }
  }

  findSpawn() {
    const centerInfo = this.tiles.get(key(this.center.x, this.center.y));
    let point = null;
    if (centerInfo && centerInfo.land) {
      point = new THREE.Vector3(centerInfo.x, centerInfo.top, centerInfo.z + 1.8);
    } else {
      for (const info of this.tiles.values()) {
        if (info.land) {
          point = new THREE.Vector3(info.x, info.top, info.z + 1.8);
          break;
        }
      }
    }
    if (!point) return new THREE.Vector3(0, 0.5, 0);

    // Villagers step aside so the player does not open their eyes inside a crowd.
    for (const actor of this.npcActors || []) {
      const ax = actor.baseX - point.x;
      const az = actor.baseZ - point.z;
      if (Math.hypot(ax, az) >= 4.2) continue;
      const len = Math.hypot(ax, az);
      const dx = len > 0.001 ? ax / len : 0.7;
      const dz = len > 0.001 ? az / len : 0.7;
      actor.baseX = point.x + dx * 5.2;
      actor.baseZ = point.z + dz * 5.2;
      actor.group.position.x = actor.baseX;
      actor.group.position.z = actor.baseZ;
    }
    return point;
  }

  groundAt(x, z) {
    // Same surface the mesh draws: bilinear over the tile corners.
    const fx = x / TS + this.center.x;
    const fz = z / TS + this.center.y;
    const i0 = Math.floor(fx + 0.5);
    const j0 = Math.floor(fz + 0.5);
    const tx = fx + 0.5 - i0;
    const tz = fz + 0.5 - j0;
    const h00 = this.cornerH(i0, j0);
    const h10 = this.cornerH(i0 + 1, j0);
    const h01 = this.cornerH(i0, j0 + 1);
    const h11 = this.cornerH(i0 + 1, j0 + 1);
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  walkable(x, z) {
    const tx = this.center.x + Math.round(x / TS);
    const ty = this.center.y + Math.round(z / TS);
    const info = this.tiles.get(key(tx, ty));
    if (!info) return false;
    if (info.land) return true;
    // the shallows of a bank are yours to wade: ankle-deep water along the shore
    return this.shoreDepth(info) <= 1;
  }

  tilesBounds() {
    return {
      minX: (-RADIUS - 0.45) * TS,
      maxX: (RADIUS + 0.45) * TS,
      minZ: (-RADIUS - 0.45) * TS,
      maxZ: (RADIUS + 0.45) * TS,
    };
  }

  nearestNpc(pos, maxDist = 3.2) {
    let best = null;
    let bestD = maxDist;
    for (const actor of this.npcActors) {
      const d = Math.hypot(actor.group.position.x - pos.x, actor.group.position.z - pos.z);
      if (d < bestD) {
        best = actor;
        bestD = d;
      }
    }
    return best;
  }

  update(dt, elapsed, playerPos = null) {
    this.time = elapsed;
    this.playerPos = playerPos;
    // Walk to the edge of the patch and the shadows come with you. Without the
    // follow, everything more than a few tiles from the middle falls out of the
    // shadow camera and goes flat.
    if (playerPos && this.sun) {
      this.sun.target.position.set(playerPos.x, 0, playerPos.z);
      this.sun.position.set(
        playerPos.x + this.sunOffset.x,
        this.sunOffset.y,
        playerPos.z + this.sunOffset.z,
      );
      this.sun.target.updateMatrixWorld();
    }
    for (const actor of this.npcActors) {
      if (actor.route) {
        // Walking the road: plaza to door and back again.
        const swing = Math.sin(elapsed * actor.speed + actor.walkPhase);
        const k = (swing + 1) / 2;
        const dx = actor.route.bx - actor.route.ax;
        const dz = actor.route.bz - actor.route.az;
        const len = Math.hypot(dx, dz) || 1;
        const x = actor.route.ax + dx * k - (dz / len) * actor.lane;
        const z = actor.route.az + dz * k + (dx / len) * actor.lane;
        actor.group.position.x = x;
        actor.group.position.z = z;
        // step around the player instead of walking through them
        const pp = this.playerPos;
        if (pp) {
          const ox = x - pp.x;
          const oz = z - pp.z;
          const od = Math.hypot(ox, oz);
          if (od < 1.2 && od > 0.001) {
            actor.group.position.x = x + (ox / od) * (1.2 - od);
            actor.group.position.z = z + (oz / od) * (1.2 - od);
          }
        }
        actor.group.position.y = this.groundAt(x, z) + Math.abs(Math.sin(elapsed * 6.5 + actor.walkPhase)) * (actor.model ? 0.02 : 0.055);
        const heading = Math.cos(elapsed * actor.speed + actor.walkPhase) >= 0 ? 1 : -1;
        actor.group.rotation.y = Math.atan2(dx * heading, dz * heading);
        if (actor.model) walkPerson(actor.model, elapsed, 1);
        continue;
      }
      const bob = Math.sin(elapsed * 1.6 + actor.phase) * 0.05;
      actor.group.position.y = actor.top + Math.abs(bob);
      actor.group.rotation.y = Math.sin(elapsed * 0.4 + actor.phase) * 0.9;
      actor.group.position.x = actor.baseX + Math.sin(elapsed * 0.25 + actor.phase) * 0.35;
      actor.group.position.z = actor.baseZ + Math.cos(elapsed * 0.21 + actor.phase) * 0.35;
      if (actor.model) walkPerson(actor.model, elapsed, 0.2);
    }
    for (const a of this.animalActors) {
      a.group.position.x = a.baseX + Math.sin(elapsed * 0.5 + a.phase) * 1.1;
      a.group.position.z = a.baseZ + Math.cos(elapsed * 0.42 + a.phase) * 1.1;
      a.group.rotation.y = Math.sin(elapsed * 0.5 + a.phase) * 1.4;
      const gait = Math.sin(elapsed * (a.kind === 'bird' || a.modelled ? 5 : 6) + a.phase);
      for (const leg of a.legs) leg.mesh.rotation.x = leg.base + gait * (leg.wing ? 0.7 : 0.45);
      if (a.modelled) {
        a.group.position.y = a.top + Math.abs(gait) * 0.06;
        a.group.rotation.z = gait * 0.03;
      }
    }
    for (const fx of this.disasterFX) {
      const pos = fx.points.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.array[i * 3 + 1] += dt * fx.speed;
        if (pos.array[i * 3 + 1] > 3.4) pos.array[i * 3 + 1] = 0;
      }
      pos.needsUpdate = true;
    }
    const pulse = 0.35 + Math.sin(elapsed * 3) * 0.25;
    for (const fx of this.warFX) fx.material.opacity = pulse;
    // every river runs and every lake breathes, in the world as on the table
    for (const material of this.waterMats) advanceWater(material, dt);
    const wave = (elapsed ?? 0) * 2.6;
    for (const rapid of this.rapidsFX) {
      const pulse = 0.35 + Math.sin(wave + rapid.phase) * 0.25;
      for (const mat of rapid.mats) mat.opacity = pulse;
    }
    for (const ripple of this.waterRipples) {
      const t = (elapsed * 0.3 + ripple.phase) % 1;
      ripple.mesh.scale.setScalar(ripple.base * (0.45 + t * 2.4));
      ripple.mesh.material.opacity = 0.26 * (1 - t);
    }

    // the modelled buildings finished loading: rebuild every town with them,
    // without waiting for the settlement to grow
    if (this.modelsPending && townModels()) {
      this.modelsPending = false;
      for (const [id] of [...this.towns]) {
        const settlement = this.state.settlements.find((s) => s.id === id && s.alive);
        const info = settlement ? this.tiles.get(key(settlement.x, settlement.y)) : null;
        if (!info || !this.townMats) continue;
        this.buildSettlement(
          info,
          settlement,
          this.townMats.hutMat,
          this.townMats.roofMat,
          this.townMats.hutGeo,
          this.townMats.roofGeo,
          0,
        );
        this.reassignRoutes(id);
      }
    }

    // the village keeps growing while you stand in it: a new house or shop
    // appears as the settlement builds, so the world matches the table
    this.townCheck += dt;
    if (this.townCheck > 4) {
      this.townCheck = 0;
      for (const [id, town] of [...this.towns]) {
        const settlement = this.state.settlements.find((s) => s.id === id && s.alive);
        if (!settlement) continue;
        if (town.signature === this.townSignature(settlement)) continue;
        const info = this.tiles.get(key(settlement.x, settlement.y));
        if (!info || !this.townMats) continue;
        this.buildSettlement(
          info,
          settlement,
          this.townMats.hutMat,
          this.townMats.roofMat,
          this.townMats.hutGeo,
          this.townMats.roofGeo,
          0,
        );
        this.reassignRoutes(id);
      }
    }
  }

  dispose() {
    this.scene.traverse((obj) => {
      if (obj.isMesh || obj.isPoints || obj.isSprite) {
        if (obj.geometry && !this.disposables.includes(obj.geometry)) obj.geometry.dispose?.();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            m.map?.dispose?.();
            m.dispose?.();
          }
        }
      }
    });
    for (const g of this.disposables) g.dispose?.();
    this.scene.clear();
  }
}
