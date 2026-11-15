// A walkable region generated directly from the world tiles. Selecting a tile on
// the table and descending puts you on that exact tile, in the same world.

import * as THREE from 'three';
import { BIOMES, isLand, key, tileAt } from '../world.js';
import { tree as detailTree, grassStrands, waterSurface } from './detail.js';

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

    const landMats = new Map();
    const waterMats = new Map();

    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      for (let dy = -RADIUS; dy <= RADIUS; dy++) {
        const tx = this.center.x + dx;
        const ty = this.center.y + dy;
        const tile = tileAt(this.state.world, tx, ty);
        if (!tile) continue;
        const land = isLand(tile);
        const def = BIOMES[tile.biome] || BIOMES.blackgrass;
        const top = land ? 0.5 + Math.max(-0.3, Math.min(1.2, tile.elevation)) * 1.7 : -0.1;
        const height = top + 2.2;

        let mat;
        if (land) {
          if (!landMats.has(tile.biome)) {
            landMats.set(
              tile.biome,
              new THREE.MeshStandardMaterial({
                color: new THREE.Color(def.world),
                roughness: 0.94,
                metalness: 0.02,
              }),
            );
          }
          mat = landMats.get(tile.biome);
        } else {
          if (!waterMats.has(tile.biome)) {
            waterMats.set(
              tile.biome,
              new THREE.MeshStandardMaterial({
                color: new THREE.Color(def.world),
                roughness: 0.16,
                metalness: 0.5,
                transparent: true,
                opacity: 0.82,
              }),
            );
          }
          mat = waterMats.get(tile.biome);
        }

        const geo = new THREE.BoxGeometry(TS, height, TS);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(dx * TS, top - height / 2, dy * TS);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.disposables.push(geo);

        this.tiles.set(key(tx, ty), { tile, top, land, x: dx * TS, z: dy * TS, mesh });

        if (!land) {
          const water = waterSurface(TS * 0.96, TS * 0.96, def.world);
          water.group.position.set(dx * TS, top + 0.02, dy * TS);
          this.scene.add(water.group);
          for (const ripple of water.ripples) this.waterRipples.push(ripple);
        } else if (tile.detail > 0.2) {
          const tufts = grassStrands(26, TS * 0.42, { color: '#33502c', height: 0.55 });
          tufts.position.set(dx * TS, top, dy * TS);
          this.scene.add(tufts);
        }

        // cultivated fields around settlements
        if (tile.settlementId && land) {
          const plot = new THREE.Mesh(
            new THREE.PlaneGeometry(TS * 0.7, TS * 0.35),
            new THREE.MeshStandardMaterial({ color: 0x6d7a3d, roughness: 1 }),
          );
          plot.rotation.x = -Math.PI / 2;
          plot.rotation.z = hash(tx, ty) * 3;
          plot.position.set(dx * TS + 1.0, top + 0.02, dy * TS + 1.1);
          this.scene.add(plot);
        }
      }
    }
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
        for (let i = 0; i < 3; i++) {
          const hx = hash(tile.x * 7 + i, tile.y * 11 - i);
          const hz = hash(tile.x * 3 - i, tile.y * 5 + i);
          const rock = new THREE.Mesh(rockGeo, tile.biome === 'peak' ? snowMat : rockMat);
          const s = 0.8 + hx * 1.6;
          rock.scale.set(s, s * 1.5, s);
          rock.position.set(x + (hx - 0.5) * 2.6, top + s * 0.7, z + (hz - 0.5) * 2.6);
          rock.rotation.set(hx * 3, hz * 4, 0);
          this.scene.add(rock);
        }
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
          this.buildSettlement(info, settlement, hutMat, roofMat, hutGeo, roofGeo, r);
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

  buildSettlement(info, settlement, hutMat, roofMat, hutGeo, roofGeo, r) {
    // Houses stand about four times the height of a person — before this they
    // were shorter than the people walking between them.
    const count = Math.min(11, 3 + settlement.buildings.length + Math.floor(settlement.population / 6));
    const nation = settlement.nationId ? this.state.nations.find((n) => n.id === settlement.nationId) : null;
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const gableGeo = new THREE.ConeGeometry(0.72, 1, 4);
    const doorGeo = new THREE.BoxGeometry(0.42, 0.62, 0.06);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2817, roughness: 0.92 });
    this.disposables.push(wallGeo, gableGeo, doorGeo);

    for (let i = 0; i < count; i++) {
      const hx = hash(settlement.id * 13 + i, 7);
      const hz = hash(settlement.id * 29, 11 + i);
      // Houses ring the square rather than sitting on it, so the middle of the
      // village stays open and the player never spawns inside a wall.
      const angle = (i / count) * Math.PI * 2 + hx * 0.5;
      const radius = 5.2 + hz * 2.8;
      const px = info.x + Math.cos(angle) * radius;
      const pz = info.z + Math.sin(angle) * radius;
      const w = 1.5 + hash(i, settlement.id) * 1.1;
      const d = 1.4 + hash(i + 3, settlement.id) * 1.0;
      const h = 3.4 + hash(i + 7, settlement.id) * 1.8;
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

      house.position.set(px, info.top, pz);
      house.rotation.y = angle;
      this.scene.add(house);
    }

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
      this.npcActors.push({ npc, group, baseX: gx, baseZ: gz, top: info.top, phase: h * 10 });
    }

    const speciesGeo = new THREE.BoxGeometry(0.5, 0.4, 0.9);
    this.disposables.push(speciesGeo);
    for (const sp of this.state.species) {
      if (Math.abs(sp.x - this.center.x) > RADIUS || Math.abs(sp.y - this.center.y) > RADIUS) continue;
      const info = this.tiles.get(key(sp.x, sp.y));
      if (!info) continue;
      for (let i = 0; i < 2; i++) {
        const animal = new THREE.Mesh(
          speciesGeo,
          new THREE.MeshStandardMaterial({ color: sp.kind === 'bird' ? 0xd8d0b0 : 0x7a6448, roughness: 0.95 }),
        );
        const ax = info.x + (hash(sp.id + i, 5) - 0.5) * 3;
        const az = info.z + (hash(sp.id - i, 9) - 0.5) * 3;
        animal.position.set(ax, info.top + 0.3, az);
        this.scene.add(animal);
        this.animalActors.push({ mesh: animal, baseX: ax, baseZ: az, phase: hash(i, sp.id) * 9 });
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
      if (Math.hypot(ax, az) >= 2.6) continue;
      const len = Math.hypot(ax, az);
      const dx = len > 0.001 ? ax / len : 0.7;
      const dz = len > 0.001 ? az / len : 0.7;
      actor.baseX = point.x + dx * 3.4;
      actor.baseZ = point.z + dz * 3.4;
      actor.group.position.x = actor.baseX;
      actor.group.position.z = actor.baseZ;
    }
    return point;
  }

  groundAt(x, z) {
    const tx = this.center.x + Math.round(x / TS);
    const ty = this.center.y + Math.round(z / TS);
    const info = this.tiles.get(key(tx, ty));
    if (!info) return 0;
    return info.top;
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

  update(dt, elapsed) {
    this.time = elapsed;
    for (const actor of this.npcActors) {
      const bob = Math.sin(elapsed * 1.6 + actor.phase) * 0.05;
      actor.group.position.y = actor.top + Math.abs(bob);
      actor.group.rotation.y = Math.sin(elapsed * 0.4 + actor.phase) * 0.9;
      actor.group.position.x = actor.baseX + Math.sin(elapsed * 0.25 + actor.phase) * 0.35;
      actor.group.position.z = actor.baseZ + Math.cos(elapsed * 0.21 + actor.phase) * 0.35;
    }
    for (const a of this.animalActors) {
      a.mesh.position.x = a.baseX + Math.sin(elapsed * 0.5 + a.phase) * 1.1;
      a.mesh.position.z = a.baseZ + Math.cos(elapsed * 0.42 + a.phase) * 1.1;
      a.mesh.rotation.y = Math.sin(elapsed * 0.5 + a.phase) * 1.4;
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
