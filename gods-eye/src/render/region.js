// A walkable region generated directly from the world tiles. Selecting a tile on
// the table and descending puts you on that exact tile, in the same world.

import * as THREE from 'three';
import { BIOMES, isLand, key, tileAt } from '../world.js';
import { tree as detailTree, grassStrands, waterSurface, mountain, animal as detailAnimal } from './detail.js';

const TS = 4;
const RADIUS = 3;

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
    this.settlementRoads = new Map();
    this.disposables = [];
    this.time = 0;

    const sky = new THREE.Color('#2b3f52');
    this.scene.background = sky;
    this.scene.fog = new THREE.FogExp2('#2b3f52', 0.019);

    this.scene.add(new THREE.HemisphereLight(0x9fc0dd, 0x2b2a20, 1.35));
    this.scene.add(new THREE.AmbientLight(0x4a5768, 0.55));
    const sun = new THREE.DirectionalLight(0xffe3b0, 2.1);
    sun.position.set(-26, 34, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    this.scene.add(sun);
    this.sun = sun;

    this.buildGround();
    this.buildFeatures();
    this.buildActors();
    this.spawn = this.findSpawn();
  }

  buildGround() {
    // deep ocean plane so the patch never floats in the void
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshStandardMaterial({ color: 0x10344a, roughness: 0.25, metalness: 0.4 }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.42;
    this.scene.add(ocean);

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
        const water = waterSurface(TS * 0.96, TS * 0.96, def.world);
        water.group.position.set(x, info.top + 0.02, z);
        this.scene.add(water.group);
        for (const ripple of water.ripples) this.waterRipples.push(ripple);
      } else if (tile.detail > 0.2) {
        const tufts = grassStrands(26, TS * 0.42, { color: '#33502c', height: 0.55 });
        tufts.position.set(x, info.top, z);
        this.scene.add(tufts);
      }

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
    const indices = [];
    const color = new THREE.Color();

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
        for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          const info = this.tiles.get(key(ctx + dx, cty + dy));
          if (!info) continue;
          const def = BIOMES[info.tile.biome] || BIOMES.blackgrass;
          color.set(def.world);
          r += color.r;
          g += color.g;
          b += color.b;
          n += 1;
        }
        positions.push(x, this.cornerH(ctx, cty), z);
        if (n) {
          color.setRGB(r / n, g / n, b / n);
          colors.push(color.r, color.g, color.b);
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
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
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

    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.14, 1.1, 6);
    const leafGeo = new THREE.ConeGeometry(0.9, 2.6, 7);
    const rockGeo = new THREE.IcosahedronGeometry(0.8, 0);
    const hutGeo = new THREE.BoxGeometry(1.2, 0.9, 1.1);
    const roofGeo = new THREE.ConeGeometry(1.0, 0.7, 4);
    this.disposables.push(trunkGeo, leafGeo, rockGeo, hutGeo, roofGeo);

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
        const peak = mountain({
          scale: TS * (tile.biome === 'peak' ? 1.1 : 0.8),
          seed: tile.x * 53 + tile.y * 29,
          snow: tile.biome === 'peak' || tile.elevation > 0.62,
          ridges: tile.biome === 'peak' ? 3 : 2,
        });
        peak.position.set(x, top, z);
        peak.rotation.y = r * Math.PI * 2;
        this.scene.add(peak);
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

  buildSettlement(info, settlement, hutMat, roofMat, hutGeo, roofGeo, r) {
    // A town, not a single tile: the plaza is in the middle, dirt roads run out
    // across the neighbouring ground, and the houses and shops stand at the ends
    // of those roads with their doors facing the square.
    const businesses = this.state.businesses.filter((b) => b.alive && b.settlementId === settlement.id).slice(0, 4);
    const houses = Math.min(9, 4 + settlement.buildings.length + Math.floor(settlement.population / 10));
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
    this.scene.add(plaza);

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
      this.scene.add(seg);
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

      if (biz) {
        // a shopfront: awning, lit windows and its name over the door
        const awning = new THREE.Mesh(new THREE.BoxGeometry(w * 1.08, 0.14, 1.6), awningMat);
        awning.position.set(0, h * 0.62, d / 2 + 0.6);
        awning.castShadow = true;
        house.add(awning);
        for (const side of [-1, 1]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.24, h * 0.2, 0.08), windowMat);
          win.position.set(side * w * 0.28, h * 0.4, d / 2 + 0.03);
          house.add(win);
        }
        const sign = labelSprite(biz.name, '#f0dfb4');
        sign.scale.set(3.4, 0.85, 1);
        sign.position.set(0, h + 1.15, 0);
        house.add(sign);
      }

      house.position.set(px, foot.top, pz);
      house.rotation.y = Math.atan2(info.x - px, info.z - pz);
      this.scene.add(house);
    }

    this.settlementRoads.set(settlement.id, routes);

    // fire
    const fire = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffb45c }));
    fire.position.set(info.x, info.top + 0.3, info.z);
    this.scene.add(fire);
    const fireLight = new THREE.PointLight(0xff9a45, 6, 9, 2);
    fireLight.position.copy(fire.position).setY(info.top + 0.8);
    this.scene.add(fireLight);

    // banner
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), new THREE.MeshStandardMaterial({ color: 0x2c2118 }));
    pole.position.set(info.x - 1.8, info.top + 2, info.z - 1.8);
    this.scene.add(pole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(nation?.color || '#c9a227'), side: THREE.DoubleSide, roughness: 0.9 }),
    );
    flag.position.set(info.x - 1.1, info.top + 3.15, info.z - 1.8);
    this.scene.add(flag);

    const label = labelSprite(`${settlement.name}`, nation ? nation.color : '#f0dfb4');
    label.position.set(info.x, info.top + 9.4, info.z);
    this.scene.add(label);
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
    for (const npc of near) {
      const info = this.tiles.get(key(npc.x, npc.y));
      if (!info) continue;
      const h = hash(npc.id * 17, npc.id * 3);
      const h2 = hash(npc.id * 7, 13);
      const gx = info.x + (h - 0.5) * 2.6;
      const gz = info.z + (h2 - 0.5) * 2.6;
      const group = new THREE.Group();
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
      group.position.set(gx, info.top, gz);
      this.scene.add(group);
      const roads = npc.settlementId ? this.settlementRoads.get(npc.settlementId) : null;
      const route = roads && roads.length ? roads[npc.id % roads.length] : null;
      this.npcActors.push({
        npc,
        group,
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
        const critter = detailAnimal({
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
    if (!info || !info.land) return false;
    return true;
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
        actor.group.position.y = this.groundAt(x, z) + Math.abs(Math.sin(elapsed * 6.5 + actor.walkPhase)) * 0.055;
        const heading = Math.cos(elapsed * actor.speed + actor.walkPhase) >= 0 ? 1 : -1;
        actor.group.rotation.y = Math.atan2(dx * heading, dz * heading);
        continue;
      }
      const bob = Math.sin(elapsed * 1.6 + actor.phase) * 0.05;
      actor.group.position.y = actor.top + Math.abs(bob);
      actor.group.rotation.y = Math.sin(elapsed * 0.4 + actor.phase) * 0.9;
      actor.group.position.x = actor.baseX + Math.sin(elapsed * 0.25 + actor.phase) * 0.35;
      actor.group.position.z = actor.baseZ + Math.cos(elapsed * 0.21 + actor.phase) * 0.35;
    }
    for (const a of this.animalActors) {
      a.group.position.x = a.baseX + Math.sin(elapsed * 0.5 + a.phase) * 1.1;
      a.group.position.z = a.baseZ + Math.cos(elapsed * 0.42 + a.phase) * 1.1;
      a.group.rotation.y = Math.sin(elapsed * 0.5 + a.phase) * 1.4;
      const gait = Math.sin(elapsed * (a.kind === 'bird' ? 9 : 6) + a.phase);
      for (const leg of a.legs) leg.mesh.rotation.x = leg.base + gait * (leg.wing ? 0.7 : 0.45);
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
    for (const ripple of this.waterRipples) {
      const t = (elapsed * 0.3 + ripple.phase) % 1;
      ripple.mesh.scale.setScalar(ripple.base * (0.45 + t * 2.4));
      ripple.mesh.material.opacity = 0.26 * (1 - t);
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
