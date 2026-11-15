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
    this.state = state;
    this.clearGroup(this.tileGroup);
    this.clearGroup(this.markGroup);
    this.warMarks = [];
    this.markerData = [];
    this.tilePick = [];

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

  update(elapsed) {
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
  }
}
