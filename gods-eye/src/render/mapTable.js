// The living table map. It renders the one world tile store; it does not hold
// its own copy of anything.

import * as THREE from 'three';
import { BIOMES, bounds, isLand, key } from '../world.js';

const TILE_MAX = 0.062;

export class MapTable {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);

    this.tileGroup = new THREE.Group();
    this.markGroup = new THREE.Group();
    this.group.add(this.tileGroup);
    this.group.add(this.markGroup);

    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.cone = new THREE.ConeGeometry(0.5, 1, 6);
    this.ring = new THREE.RingGeometry(0.32, 0.44, 18);
    this.materials = new Map();

    this.scale = 0.1;
    this.cols = 5;
    this.rows = 5;
    this.centerX = 2;
    this.centerY = 2;
    this.state = null;
    this.warMarks = [];
    this.selection = null;
    this.markerData = [];
    this.hovered = null;
    this.tilePick = [];

    // Johan himself, working the table. He walks to ground that has just
    // changed and raises it while you watch.
    this.worker = this.buildWorker();
    this.group.add(this.worker.root);
    this.workerHeight = 0.14;
    this.workerJob = null;
    this.workerTimer = 0;
    this.jobs = [];
    this.knownTiles = new Map();
    this.growth = new Map();
    this.meshByKey = new Map();
    this.puffs = [];
    this.puffGeometry = new THREE.RingGeometry(0.24, 0.4, 14);

    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    this.pickPlane.rotation.x = -Math.PI / 2;
    this.pickPlane.position.y = TILE_MAX + 0.02;
    this.group.add(this.pickPlane);

    this.selectionBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0xf0cf6a, transparent: true, opacity: 0.95 }),
    );
    this.selectionBox.visible = false;
    this.group.add(this.selectionBox);

    this.base = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.035, 1),
      new THREE.MeshStandardMaterial({ color: 0x2a2015, roughness: 0.9, metalness: 0.05 }),
    );
    this.group.add(this.base);

    this.frame = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.012, 1),
      new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 0.8 }),
    );
    this.frame.position.y = 0.001;
    this.group.add(this.frame);
  }

  buildWorker() {
    const root = new THREE.Group();
    const robe = new THREE.MeshStandardMaterial({ color: 0x24251f, roughness: 0.85, emissive: 0x2b2516, emissiveIntensity: 0.6 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xe0bb55, roughness: 0.45, metalness: 0.3, emissive: 0xc9a227, emissiveIntensity: 0.55 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xefdcb4, roughness: 0.75, emissive: 0x6a5330, emissiveIntensity: 0.45 });

    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.15, 10), robe);
    cloak.position.y = 0.58;
    const shoulders = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.24, 0.3, 10), robe);
    shoulders.position.y = 1.06;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 12), skin);
    head.position.y = 1.34;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.028, 6, 16), trim);
    collar.position.y = 1.17;
    collar.rotation.x = Math.PI / 2;

    const armPivot = new THREE.Group();
    armPivot.position.set(0.3, 1.06, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.44, 0.11), robe);
    arm.position.y = -0.2;
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.3, 0.045),
      new THREE.MeshStandardMaterial({ color: 0x7a5a34, roughness: 0.85 }),
    );
    handle.position.y = -0.46;
    const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.12), trim);
    hammerHead.position.y = -0.62;
    const hammer = new THREE.Group();
    hammer.add(handle, hammerHead);
    hammer.position.z = 0.05;
    armPivot.add(arm, hammer);

    const otherArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), robe);
    otherArm.position.set(-0.3, 0.86, 0);

    root.add(cloak, shoulders, head, collar, armPivot, otherArm);
    root.rotation.y = Math.PI * 0.15;
    return { root, armPivot, head, cloak };
  }

  queueJob(tile, kind) {
    const k = key(tile.x, tile.y);
    const job = { x: tile.x, y: tile.y, kind };
    if (kind === 'grow') {
      if (!this.growth.has(k)) this.growth.set(k, 0);
      // new ground comes first: an unbuilt tile is a hole in the world
      if (this.jobs.length >= 8) {
        this.growth.set(k, 1);
        return;
      }
      this.jobs.unshift(job);
      return;
    }
    // refinements are only worth a swing or two; a busy table drops the rest
    if (this.jobs.length >= 2) return;
    this.jobs.push(job);
  }

  material(colorHex, opts = {}) {
    const cacheKey = `${colorHex}|${opts.emissive || 0}|${opts.water ? 'w' : 's'}`;
    if (this.materials.has(cacheKey)) return this.materials.get(cacheKey);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness: opts.water ? 0.28 : 0.88,
      metalness: opts.water ? 0.35 : 0.04,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0.4,
    });
    this.materials.set(cacheKey, mat);
    return mat;
  }

  clearGroup(group) {
    while (group.children.length) group.remove(group.children[0]);
  }

  heightOf(tile) {
    if (!isLand(tile)) return 0.012;
    return 0.014 + Math.max(0, tile.elevation + 0.15) * 0.036;
  }

  build(state) {
    const sameWorld = this.state === state;
    if (!sameWorld) {
      // a different world: nothing on it has been seen yet
      this.knownTiles.clear();
      this.growth.clear();
      this.jobs.length = 0;
      this.workerJob = null;
      this.workerTimer = 0;
    }
    this.state = state;
    this.clearGroup(this.tileGroup);
    this.clearGroup(this.markGroup);
    this.warMarks = [];
    this.markerData = [];
    this.tilePick = [];
    this.meshByKey.clear();

    const b = bounds(state.world);
    this.cols = b.cols;
    this.rows = b.rows;
    this.scale = Math.min(1.86 / b.cols, 1.40 / b.rows, 0.26);
    this.centerX = (b.minX + b.maxX) / 2;
    this.centerY = (b.minY + b.maxY) / 2;
    this.worldMinX = b.minX;
    this.worldMaxX = b.maxX;
    this.worldMinY = b.minY;
    this.worldMaxY = b.maxY;

    const width = b.cols * this.scale;
    const depth = b.rows * this.scale;
    this.base.scale.set(width + 0.13, 1, depth + 0.13);
    this.base.position.y = -0.022;
    this.frame.scale.set(width + 0.08, 1, depth + 0.08);
    this.frame.position.y = 0.004;
    this.pickPlane.scale.set(width + 0.05, depth + 0.05, 1);

    const lastSeen = state.lastSeenDay ?? 0;
    const changed = [];
    const firstBuild = this.knownTiles.size === 0;
    this.workerHeight = Math.max(0.07, Math.min(0.15, this.scale * 1.1));
    this.worker.root.scale.setScalar(this.workerHeight / 1.55);
    if (!sameWorld) {
      const cradle = state.cradle;
      const startTile = cradle ? state.world.tiles.get(key(cradle.x, cradle.y)) : null;
      const sx = startTile ? (startTile.x - this.centerX) * this.scale : 0;
      const sz = startTile ? (startTile.y - this.centerY) * this.scale : 0;
      const sy = startTile ? Math.max(0.006, this.heightOf(startTile)) : 0.02;
      this.worker.root.position.set(sx, sy, sz);
    }

    for (const tile of state.world.tiles.values()) {
      const t = isLand(tile);
      const h = this.heightOf(tile);
      const color = (BIOMES[tile.biome] || BIOMES.blackgrass).table;
      const mesh = new THREE.Mesh(this.box, this.material(color, { water: !t }));
      mesh.scale.set(this.scale * 0.95, Math.max(0.006, h), this.scale * 0.95);
      mesh.position.set((tile.x - this.centerX) * this.scale, Math.max(0.006, h) / 2, (tile.y - this.centerY) * this.scale);
      this.tileGroup.add(mesh);
      this.tilePick.push({ tile, mesh });

      const top = Math.max(0.006, h);

      // Remember every tile so that new or changed ground can be built in
      // front of the player instead of silently appearing.
      const tileKey = key(tile.x, tile.y);
      this.meshByKey.set(tileKey, { mesh, top });
      if (firstBuild) {
        this.knownTiles.set(tileKey, tile.changedDay);
      } else {
        const seenDay = this.knownTiles.get(tileKey);
        if (seenDay === undefined) {
          this.knownTiles.set(tileKey, tile.changedDay);
          this.queueJob(tile, 'grow');
        } else if (tile.changedDay > seenDay) {
          this.knownTiles.set(tileKey, tile.changedDay);
          this.queueJob(tile, 'shape');
        }
      }
      const growth = this.growth.get(tileKey);
      if (growth !== undefined && growth < 1) {
        const raised = Math.max(0.0004, top * growth);
        mesh.scale.y = raised;
        mesh.position.y = raised / 2;
      }

      // forests and settlements
      const def = BIOMES[tile.biome] || BIOMES.blackgrass;
      if (t && (def.trees || tile.trees > 0.45) && tile.detail > 0.25) {
        const count = Math.min(3, Math.max(1, Math.round(tile.trees * 3)));
        for (let i = 0; i < count; i++) {
          const tree = new THREE.Mesh(this.cone, this.material('#16301f', { emissive: '#0b1d12', emissiveIntensity: 0.35 }));
          const s = this.scale * (0.34 + (i === 0 ? 0.06 : 0));
          tree.scale.set(s, s * 2.4, s);
          const ang = (i / count) * Math.PI * 2 + tile.x;
          tree.position.set(
            (tile.x - this.centerX) * this.scale + Math.cos(ang) * this.scale * (count > 1 ? 0.2 : 0),
            top + s * 1.2,
            (tile.y - this.centerY) * this.scale + Math.sin(ang) * this.scale * (count > 1 ? 0.2 : 0),
          );
          this.markGroup.add(tree);
        }
      }

      if (tile.settlementId) {
        const settlement = state.settlements.find((s) => s.id === tile.settlementId && s.alive);
        const nation = settlement?.nationId ? state.nations.find((n) => n.id === settlement.nationId) : null;
        const colorHex = nation?.color || '#e6c977';
        const s = this.scale * 0.36;
        const px = (tile.x - this.centerX) * this.scale;
        const pz = (tile.y - this.centerY) * this.scale;
        const walls = new THREE.Mesh(this.box, this.material(colorHex, { emissive: colorHex, emissiveIntensity: 0.22 }));
        walls.scale.set(s, s * 1.15, s);
        walls.position.set(px, top + s * 0.58, pz);
        this.markGroup.add(walls);
        const roof = new THREE.Mesh(this.cone, this.material('#3b2a1a'));
        roof.scale.set(s * 1.15, s * 0.9, s * 1.15);
        roof.position.set(px, top + s * 1.6, pz);
        roof.rotation.y = Math.PI / 4;
        this.markGroup.add(roof);
        this.markerData.push({ type: 'settlement', tile, settlement, nation });
      }

      if (tile.blood > 0) {
        const mark = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({
            color: 0x7c1414,
            transparent: true,
            opacity: Math.min(0.85, 0.35 + tile.blood * 0.22),
            depthWrite: false,
          }),
        );
        mark.rotation.x = -Math.PI / 2;
        mark.scale.setScalar(this.scale * (0.5 + Math.min(0.4, tile.blood * 0.12)));
        mark.position.set((tile.x - this.centerX) * this.scale, top + 0.003, (tile.y - this.centerY) * this.scale);
        this.markGroup.add(mark);
        this.warMarks.push({ mesh: mark, kind: 'blood', tile, base: mark.material.opacity });
      }

      if (tile.war) {
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({ color: 0xff3b22, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        glow.rotation.x = -Math.PI / 2;
        glow.scale.setScalar(this.scale * 1.05);
        glow.position.set((tile.x - this.centerX) * this.scale, top + 0.005, (tile.y - this.centerY) * this.scale);
        this.markGroup.add(glow);
        this.warMarks.push({ mesh: glow, kind: 'war', tile, base: 0.34 });
        this.markerData.push({ type: 'war', tile });
      }

      // Track ground Johan changed since the player last looked. A brand new
      // world is entirely new, so it gets nothing; later visits highlight the
      // most recent handful of changes rather than every tile at once.
      if (lastSeen > 0 && tile.changedDay > lastSeen) changed.push({ tile, top });

      if (tile.disaster && state.world.day - tile.disaster.day < 10) {
        const smoke = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({ color: 0xcf5a2a, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        smoke.rotation.x = -Math.PI / 2;
        smoke.scale.setScalar(this.scale * 0.8);
        smoke.position.set((tile.x - this.centerX) * this.scale, top + 0.007, (tile.y - this.centerY) * this.scale);
        this.markGroup.add(smoke);
        this.warMarks.push({ mesh: smoke, kind: 'disaster', tile, base: 0.35 });
      }
    }

    // unexplored ground inside the world's bounds reads as dark, solid void
    for (let tx = b.minX; tx <= b.maxX; tx++) {
      for (let ty = b.minY; ty <= b.maxY; ty++) {
        if (state.world.tiles.has(key(tx, ty))) continue;
        const voidTile = new THREE.Mesh(this.box, this.material('#0a0d0b'));
        voidTile.scale.set(this.scale * 0.95, 0.008, this.scale * 0.95);
        voidTile.position.set((tx - this.centerX) * this.scale, 0.004, (ty - this.centerY) * this.scale);
        this.tileGroup.add(voidTile);
      }
    }

    changed
      .sort((a, b) => b.tile.changedDay - a.tile.changedDay)
      .slice(0, 12)
      .forEach(({ tile, top }) => {
        const ring = new THREE.Mesh(
          this.ring,
          new THREE.MeshBasicMaterial({ color: 0xe8c46a, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.scale.setScalar(this.scale * 0.8);
        ring.position.set((tile.x - this.centerX) * this.scale, top + 0.006, (tile.y - this.centerY) * this.scale);
        this.markGroup.add(ring);
        this.warMarks.push({ mesh: ring, kind: 'new', tile, base: 0.38 });
      });

    // Nothing should stay half-built forever: ground whose job was dropped or
    // lost finishes itself.
    for (const [k, growth] of this.growth) {
      if (growth >= 1) continue;
      const busy =
        this.jobs.some((job) => key(job.x, job.y) === k) ||
        (this.workerJob && key(this.workerJob.x, this.workerJob.y) === k);
      if (!busy) this.growth.set(k, 1);
    }

    this.applySelection(state.selected);
  }

  tileCenter(tile) {
    return new THREE.Vector3(
      (tile.x - this.centerX) * this.scale,
      0.06,
      (tile.y - this.centerY) * this.scale,
    );
  }

  tileFromLocal(point) {
    if (!this.state) return null;
    const x = Math.round(point.x / this.scale + this.centerX);
    const y = Math.round(point.z / this.scale + this.centerY);
    let tile = this.state.world.tiles.get(key(x, y));
    if (tile) return tile;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
      tile = this.state.world.tiles.get(key(x + dx, y + dy));
      if (tile) return tile;
    }
    return null;
  }

  applySelection(sel) {
    this.selection = sel;
    if (!sel) {
      this.selectionBox.visible = false;
      return;
    }
    const tile = this.state.world.tiles.get(key(sel.x, sel.y));
    if (!tile) {
      this.selectionBox.visible = false;
      return;
    }
    const h = this.heightOf(tile);
    this.selectionBox.visible = true;
    this.selectionBox.scale.set(this.scale * 1.1, Math.max(0.02, h * 1.6), this.scale * 1.1);
    const c = this.tileCenter(tile);
    this.selectionBox.position.set(c.x, Math.max(0.02, h) * 0.85, c.z);
  }

  update(elapsed, dt = 0) {
    const pulse = 0.55 + Math.sin(elapsed * 3.4) * 0.3;
    for (const m of this.warMarks) {
      if (!m.mesh.material) continue;
      if (m.kind === 'war') m.mesh.material.opacity = 0.2 + pulse * 0.45;
      else if (m.kind === 'new') m.mesh.material.opacity = 0.3 + pulse * 0.45;
      else if (m.kind === 'disaster') m.mesh.material.opacity = 0.18 + Math.abs(Math.sin(elapsed * 2.2)) * 0.35;
    }
    if (this.selectionBox.visible) {
      this.selectionBox.material.opacity = 0.6 + Math.sin(elapsed * 4) * 0.3;
    }
    this.updateWorker(elapsed, dt);
    this.updatePuffs(dt);
  }

  /* ------------------------------ Johan at work ----------------------------- */

  updateWorker(elapsed, dt) {
    const w = this.worker;
    const step = Math.min(dt, 0.06);

    if (!this.workerJob) {
      while (this.jobs.length) {
        const job = this.jobs.shift();
        const tile = this.state?.world.tiles.get(key(job.x, job.y));
        if (!tile) continue;
        this.workerJob = { ...job, tile };
        this.workerTimer = 0;
        break;
      }
    }

    const job = this.workerJob;
    if (!job) {
      // idle: he stands over the work and looks across it, hammer resting
      w.armPivot.rotation.x *= Math.max(0, 1 - step * 5);
      w.head.position.y = 1.34 + Math.sin(elapsed * 1.7) * 0.012;
      w.head.rotation.y = Math.sin(elapsed * 0.55) * 0.4;
      return;
    }

    const tx = (job.tile.x - this.centerX) * this.scale;
    const tz = (job.tile.y - this.centerY) * this.scale;
    const ty = Math.max(0.006, this.heightOf(job.tile));
    const dx = tx - w.root.position.x;
    const dz = tz - w.root.position.z;
    const dist = Math.hypot(dx, dz);
    const walkSpeed = Math.max(0.16, this.scale * 3.6);

    if (dist > 0.012) {
      const move = Math.min(dist, walkSpeed * step);
      w.root.position.x += (dx / dist) * move;
      w.root.position.z += (dz / dist) * move;
      w.root.position.y = ty + Math.abs(Math.sin(elapsed * 12)) * this.scale * 0.22;
      const heading = Math.atan2(dx, dz);
      const turn = ((heading - w.root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      w.root.rotation.y += turn * Math.min(1, step * 9);
      w.armPivot.rotation.x = Math.sin(elapsed * 12) * 0.4;
      this.workerTimer = 0;
      return;
    }

    // at the tile: raise it out of the ground with the hammer
    w.root.position.set(tx, ty, tz);
    w.root.rotation.y += Math.sin(elapsed * 1.2) * step * 0.4;
    this.workerTimer += step;
    const swing = Math.sin(this.workerTimer * 24);
    w.armPivot.rotation.x = -0.85 + swing * 0.95;
    w.root.position.y = ty + Math.abs(swing) * this.scale * 0.18;
    if (swing < -0.9) this.spawnPuff(tx, tz, ty);

    if (job.kind === 'grow') {
      const k = key(job.x, job.y);
      const growth = Math.min(1, (this.growth.get(k) ?? 0) + step * 1.7);
      this.growth.set(k, growth);
      const entry = this.meshByKey.get(k);
      if (entry) {
        const raised = Math.max(0.0004, entry.top * growth);
        entry.mesh.scale.y = raised;
        entry.mesh.position.y = raised / 2;
      }
    }

    if (this.workerTimer > 1.25) {
      this.growth.set(key(job.x, job.y), 1);
      this.workerJob = null;
      this.workerTimer = 0;
    }
  }

  spawnPuff(x, z, y) {
    if (this.puffs.length > 7) return;
    const mesh = new THREE.Mesh(
      this.puffGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xf0cf6a,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.004, z);
    mesh.scale.setScalar(this.scale * 0.4);
    this.group.add(mesh);
    this.puffs.push({ mesh, life: 0 });
  }

  updatePuffs(dt) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i];
      puff.life += dt * 2.4;
      puff.mesh.scale.setScalar(this.scale * (0.4 + puff.life * 1.5));
      puff.mesh.material.opacity = Math.max(0, 0.5 * (1 - puff.life));
      if (puff.life >= 1) {
        this.group.remove(puff.mesh);
        puff.mesh.material.dispose();
        this.puffs.splice(i, 1);
      }
    }
  }
}
