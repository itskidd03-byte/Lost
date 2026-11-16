// The living table map. It renders the one world tile store; it does not hold
// its own copy of anything.

import * as THREE from 'three';
import { BIOMES, bounds, isLand, key } from '../world.js';
import {
  tree, grassStrands, animal, hash2, nameSprite,
} from './detail.js';
import { loadMedievalModels, onMedievalReady } from './medieval.js';
import {
  loadPeopleModels, onPeopleReady, peopleReady, personModel, walkPerson,
} from './people.js';
import { loadCreatureModels, creaturesReady, creatureModel, onCreaturesReady } from './creatures.js';
import { findClusters, buildCluster, loneMassif } from './clusters.js';
import { buildGround } from './ground.js';
import { advanceWater, makeWaterMaterial } from './water.js';
import { loadMountainModels } from './mountains.js';
import {
  buildSettlement, buildTerritories, settlementBlockKeys, loadSettlementModels, footprintBlocks,
} from './settlements.js';

const TILE_MAX = 0.062;

export class MapTable {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);

    this.tileGroup = new THREE.Group();
    this.markGroup = new THREE.Group();
    this.societyMesh = null;
    this.societyKey = '';
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
    this.ripples = [];
    this.villagers = [];
    this.animals = [];
    this.waters = [];
    this.waterRipples = [];
    this.borders = [];
    this.clusterByKey = new Map();
    this.blocksByKey = new Map();
    this.sky = new THREE.Group();
    this.group.add(this.sky);
    this.clouds = [];
    this.birds = [];
    this.buildSky();

    // The art arrives a moment after the first frame. Until it does the board
    // draws its painted stand-ins; the moment a pack lands the board is rebuilt
    // so the table shows the models everywhere at once.
    this.artPending = true;
    const refresh = () => {
      if (this.state) this.build(this.state);
    };
    onMedievalReady(refresh);
    onPeopleReady(() => {
      // the crew standing on the board are medieval people now
      this.reskinJolene();
      this.swapWorker();
      refresh();
    });
    onCreaturesReady(refresh);
    loadMedievalModels();
    loadPeopleModels();
    loadCreatureModels();
    loadSettlementModels().then(() => {
      if (this.state) this.build(this.state);
    });
    // the shared mountain design arrives with the rest of the art: the board is
    // rebuilt once with it so the ranges are the same rock as the world you walk
    loadMountainModels().then(() => {
      if (this.state) this.build(this.state);
    });

    // Jolene walks the board too, but she only dresses what is already there.
    this.jolene = this.buildJolene();
    this.group.add(this.jolene.root);
    this.joleneGoal = null;
    this.joleneTimer = 0;

    // Every 20×20 sector has its own dresser, so more than one of them stands
    // over the board once the table has grown.
    this.extraDressers = [];

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

    // The slab under the world is the sea the island sits in: wherever the land
    // does not reach, this is what shows, so it is painted and moving water.
    this.seaMaterial = makeWaterMaterial({
      tint: '#9cc6da',
      opacity: 1,
      river: false,
      dir: 'both',
      repeat: 0.09,
      speed: 0.04,
    });
    this.base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.035, 1), this.seaMaterial);
    this.group.add(this.base);

    this.frame = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.012, 1),
      new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 0.8 }),
    );
    this.frame.position.y = 0.001;
    this.group.add(this.frame);
  }

  // Johan is one of the same people as the villagers once the pack is in; the
  // robed cone is only the stand-in for the first second of the page.
  buildWorker() {
    const root = new THREE.Group();
    if (peopleReady()) {
      const person = personModel({ seed: 97, height: 1.55 });
      if (person) {
        root.add(person.root);
        root.rotation.y = Math.PI * 0.15;
        return { root, model: person, armPivot: new THREE.Group(), head: null, cloak: null };
      }
    }
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

  buildSky() {
    // Clouds and birds above the board, so the table has weather and life over
    // it rather than being a slab of ground in the dark.
    const puffGeo = new THREE.IcosahedronGeometry(1, 0);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xe6ecf4,
      roughness: 1,
      flatShading: true,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x2b2b26, transparent: true, opacity: 0.75 });
    const birdGeo = new THREE.ConeGeometry(0.5, 1, 3);

    for (let i = 0; i < 7; i++) {
      const cloud = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.scale.set(0.5 + hash2(i, k) * 0.45, 0.16 + hash2(k, i) * 0.1, 0.42 + hash2(i + k, 9) * 0.28);
        puff.position.set((k - 1) * 0.5, hash2(i * 3, k) * 0.08, (hash2(i, k * 5) - 0.5) * 0.35);
        cloud.add(puff);
      }
      cloud.userData = { phase: hash2(i, 5) * Math.PI * 2, speed: 0.03 + hash2(i, 13) * 0.05, lane: hash2(i, 17) };
      this.sky.add(cloud);
      this.clouds.push(cloud);
    }

    for (let i = 0; i < 4; i++) {
      const bird = new THREE.Mesh(birdGeo, birdMat);
      bird.rotation.x = Math.PI / 2;
      bird.scale.setScalar(1);
      bird.userData = { phase: hash2(i, 21) * Math.PI * 2, speed: 0.12 + hash2(i, 31) * 0.1 };
      this.sky.add(bird);
      this.birds.push(bird);
    }
  }

  buildJolene(clothColor = 0xcfc6e6, seed = 11) {
    const root = new THREE.Group();
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 18),
      new THREE.MeshBasicMaterial({ color: 0xd8cff0, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.002;

    // Once the medieval people are in, the dressers are one of them — a person
    // walking the board reads better than a robed cone. The robe is the
    // stand-in for the first second, and anything that fails to load.
    const person = peopleReady() ? personModel({ seed, height: 1.55 }) : null;
    if (person) {
      root.add(glow, person.root);
      return { root, glow, model: person, gown: null, head: null, hair: null };
    }

    const cloth = new THREE.MeshStandardMaterial({
      color: clothColor,
      roughness: 0.55,
      emissive: 0x5f5680,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.94,
    });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x2a2430, roughness: 0.7, emissive: 0x3a2f44, emissiveIntensity: 0.45 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf2e4cf, roughness: 0.8, emissive: 0x6a5330, emissiveIntensity: 0.3 });

    const gown = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.35, 12, 1, true), cloth);
    gown.position.y = 0.67;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.3, 0.5, 10), cloth);
    torso.position.y = 1.36;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin);
    head.position.y = 1.74;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.225, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
    hair.position.y = 1.78;

    root.add(gown, torso, head, hair, glow);
    root.scale.setScalar(0.08);
    return { root, gown, head, hair, glow, model: null };
  }

  // Swaps the robed stand-in for a person, keeping where he stands.
  swapWorker() {
    if (!this.worker || this.worker.model) return;
    const at = this.worker.root.position.clone();
    const face = this.worker.root.rotation.y;
    this.group.remove(this.worker.root);
    this.worker = this.buildWorker();
    this.worker.root.position.copy(at);
    this.worker.root.rotation.y = face;
    this.worker.root.scale.setScalar(this.workerHeight / 1.55);
    this.group.add(this.worker.root);
    if (this.state) this.setNameplate(this.worker.root, this.state.johan?.name || 'Johan', '#f0cf6a');
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

  // Where the surface actually is at a tile: the smooth ground once it exists,
  // the tile's own elevation before that (and in the walkable region, which
  // builds its own ground).
  heightOf(tile) {
    if (this.groundY && tile) return this.groundY(tile);
    if (!isLand(tile)) return 0.01;
    return 0.016 + Math.max(0, tile.elevation + 0.15) * 0.032;
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
    this.ripples.length = 0;
    this.villagers.length = 0;
    this.animals.length = 0;
    this.waters.length = 0;
    this.waterRipples.length = 0;
    this.borders.length = 0;
    this.clusterByKey.clear();
    this.blocksByKey.clear();

    // Sector dressers are rebuilt with the board: one figure per sector.
    for (const fig of this.extraDressers) this.group.remove(fig.root);
    this.extraDressers = [];
    const tints = [0xbfe0d8, 0xe0c8b4, 0xc8d4e8, 0xd8c8b0, 0xc8e0c0, 0xe0d0e8];
    const sectors = (state.sectors || []).slice(1, 7);
    sectors.forEach((sector, i) => {
      const fig = this.buildJolene(tints[i % tints.length]);
      this.group.add(fig.root);
      this.extraDressers.push({
        root: fig.root,
        glow: fig.glow,
        model: fig.model || null,
        sector,
        goal: null,
        timer: i * 0.6,
      });
    });

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

    // Sky over the board: clouds high enough to miss the figures, birds below.
    for (const cloud of this.clouds) {
      const lane = cloud.userData.lane;
      cloud.scale.setScalar(this.scale * (0.55 + lane * 0.3));
      cloud.position.set((lane - 0.5) * width * 1.1, this.scale * (3.6 + lane * 1.4), (hash2(lane * 100, 3) - 0.5) * depth * 0.9);
    }
    for (const bird of this.birds) {
      bird.scale.setScalar(this.scale * 0.3);
      bird.position.y = this.scale * (2.8 + bird.userData.phase * 0.06);
    }

    // Landforms and towns are worked out before the tiles are drawn: the tiles
    // need to know which of them belong to a lake, a wood or a street.
    const tiles = [...state.world.tiles.values()];
    // a lone pool still deserves a surface of its own, so water is kept even at
    // one tile; every other kind of ground needs neighbours to become a landform
    this.clusters = findClusters(tiles).filter((c) => c.size >= 2 || c.kind === 'water');
    for (const cluster of this.clusters) {
      for (const k of cluster.keys) this.clusterByKey.set(k, cluster);
    }
    this.blocksByKey = settlementBlockKeys(state);
    const project = (x, y) => ({ x: (x - this.centerX) * this.scale, z: (y - this.centerY) * this.scale });

    // One ground for the whole board. Everything else — trees, houses, water,
    // people — is placed on this surface, so nothing stands in a hole or floats.
    const ground = buildGround({
      world: state.world,
      scale: this.scale,
      centerX: this.centerX,
      centerY: this.centerY,
    });
    this.tileGroup.add(ground.mesh);
    this.groundMesh = ground.mesh;
    this.ground = ground;
    // Blocks still being melted into the land survive a rebuild: the board is
    // rebuilt every second or so while you are watching it, and clearing them
    // here would cut the molding short every time.
    if (!this.molds) this.molds = new Map();
    if (!this.moldSettled) this.moldSettled = new Map();
    this.moldClock = 0;
    const groundY = (tile) => ground.heightAt(tile.x, tile.y);
    this.groundY = groundY;

    const lastSeen = state.lastSeenDay ?? 0;
    const changed = [];
    const firstBuild = this.knownTiles.size === 0;
    // A phone in landscape has little height to spare, so the figure is drawn
    // larger there or he would be a few pixels of noise on the board.
    const shortScreen = typeof window !== 'undefined' && window.innerHeight < 620;
    this.workerHeight = Math.max(0.07, Math.min(0.15, this.scale * 1.1)) * (shortScreen ? 1.75 : 1);
    this.worker.root.scale.setScalar(this.workerHeight / 1.55);

    // Names over every AI standing on the table, so you know who is who.
    const crew = state.sectors || [];
    this.setNameplate(this.worker.root, state.johan?.name || 'Johan', '#f0cf6a');
    this.setNameplate(this.jolene.root, crew[0]?.dresser || 'Jolene', '#d9c9f2');
    for (const d of this.extraDressers) this.setNameplate(d.root, d.sector.dresser, '#d9c9f2');
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
      const tileKey = key(tile.x, tile.y);
      const cluster = this.clusterByKey.get(tileKey) || null;
      const inBlock = this.blocksByKey.has(tileKey);
      const top = groundY(tile);
      this.tilePick.push({ tile });

      // grass tufts sit on the smooth ground where no patch has taken over
      if (t && tile.detail > 0.15 && !cluster && !inBlock && tile.biome !== 'mountain' && tile.biome !== 'peak') {
        const grassColor = tile.biome === 'blackgrass' ? '#2b3a2b' : '#4f7040';
        const strands = grassStrands(
          Math.min(12, 4 + Math.round(tile.detail * 8)),
          this.scale * 0.36,
          { color: grassColor, height: this.scale * 0.42 },
        );
        strands.position.set((tile.x - this.centerX) * this.scale, top, (tile.y - this.centerY) * this.scale);
        this.markGroup.add(strands);
      }

      // Remember every tile so that new or changed ground can be built in
      // front of the player instead of silently appearing.
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
      // forests and settlements
      const def = BIOMES[tile.biome] || BIOMES.blackgrass;
      if (t && !cluster && !inBlock && (def.trees || tile.trees > 0.45) && tile.detail > 0.25) {
        const count = Math.min(3, Math.max(1, Math.round(tile.trees * 3)));
        for (let i = 0; i < count; i++) {
          const sapling = tree({
            scale: this.scale * (0.34 + (i === 0 ? 0.05 : 0) + tile.detail * 0.1),
            seed: tile.x * 97 + tile.y * 13 + i,
            pale: tile.biome === 'deepforest',
          });
          const ang = (i / count) * Math.PI * 2 + tile.x;
          sapling.position.set(
            (tile.x - this.centerX) * this.scale + Math.cos(ang) * this.scale * (count > 1 ? 0.22 : 0),
            top,
            (tile.y - this.centerY) * this.scale + Math.sin(ang) * this.scale * (count > 1 ? 0.22 : 0),
          );
          sapling.rotation.y = ang * 1.7;
          this.markGroup.add(sapling);
        }
      }

      // Peaks and slopes get real mountains, not a smoother mound.
      // Rock is sculpted, never a cone: a lone block gets one massif, a line of
      // them a whole range (drawn with its cluster below).
      if (t && !cluster && (tile.biome === 'mountain' || tile.biome === 'peak') && tile.detail > 0.2) {
        const peak = loneMassif({
          project,
          scale: this.scale * (tile.biome === 'peak' ? 1.15 : 1.0),
          heightOf: (t) => this.heightOf(t),
          tile,
        });
        this.markGroup.add(peak);
      }

      // Wild ground has animals on it.
      const wild = t && !tile.settlementId && tile.detail > 0.3 &&
        ['grass', 'meadow', 'forest', 'deepforest', 'hills', 'tundra', 'swamp', 'desert', 'island'].includes(tile.biome);
      if (wild) {
        const roll = hash2(tile.x * 71, tile.y * 37);
        if (roll > 0.5 && this.animals.length < 24) {
          const kind = roll > 0.86 ? 'bird' : roll > 0.7 ? 'fox' : 'deer';
          const size = this.scale * (kind === 'bird' ? 0.6 : 0.44);
          const modelled = creaturesReady()
            ? creatureModel({
              kind: kind === 'bird' ? (roll > 0.93 ? 'chicken' : 'duck') : kind === 'fox' ? 'fox' : 'deer',
              height: size * 0.55,
              seed: tile.x * 13 + tile.y * 7,
            })
            : null;
          const critter = modelled
            ? { group: modelled.group, legs: [], kind: modelled.kind, modelled: true }
            : animal({ kind, scale: size, seed: tile.x * 13 + tile.y * 7 });
          critter.group.position.set((tile.x - this.centerX) * this.scale, top, (tile.y - this.centerY) * this.scale);
          critter.group.rotation.y = roll * Math.PI * 2;
          this.markGroup.add(critter.group);
          this.animals.push({
            ...critter,
            base: critter.group.position.clone(),
            phase: roll * 9,
            drift: 0.6 + roll * 0.8,
            home: critter.group.rotation.y,
          });
        }
      }

      if (tile.settlementId) {
        const settlement = state.settlements.find((s) => s.id === tile.settlementId && s.alive);
        const nation = settlement?.nationId ? state.nations.find((n) => n.id === settlement.nationId) : null;
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

    // Landforms are drawn once for the whole cluster: a lake becomes a sheet of
    // moving water, grass rolls over several blocks, a wood is one canopy and a
    // line of rock one ridge.
    for (const cluster of this.clusters) {
      const built = buildCluster(cluster, {
        project,
        scale: this.scale,
        heightOf: (tile) => groundY(tile),
        isWater: (x, y) => {
          const beside = state.world.tiles.get(key(x, y));
          return !!beside && !isLand(beside);
        },
      });
      if (!built) continue;
      this.markGroup.add(built.group);
      for (const water of built.waters) this.waters.push(water);
      for (const ring of built.ripples) this.waterRipples.push(ring);
    }

    // Settlements take the ground their population can hold: tents on a block,
    // a town of ten, a kingdom of twenty with a keep and an army.
    for (const settlement of state.settlements) {
      if (!settlement.alive) continue;
      const nation = settlement.nationId ? state.nations.find((n) => n.id === settlement.nationId) : null;
      const built = buildSettlement({
        settlement,
        state,
        project,
        scale: this.scale * 0.95,
        heightOf: (tile) => groundY(tile),
        nationColor: nation?.color || '#e6c977',
      });
      this.markGroup.add(built.group);
      for (const person of built.people) this.villagers.push(person);
    }

    // and the country each nation claims around its towns
    const territory = buildTerritories({
      state,
      project,
      scale: this.scale,
      heightOf: (tile) => groundY(tile),
    });
    this.markGroup.add(territory.group);
    for (const mark of territory.marks) this.borders.push(mark);

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
    this.muteShadows();
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

  // Johan raises a block of ground out of the board; from there the refine pass
  // takes it. The lift swells up, holds while he works it, then melts away so the
  // new ground finishes as part of the landscape around it rather than as a slab.
  startMold(tile, height = 1) {
    if (!this.ground || !this.molds) return;
    const k = key(tile.x, tile.y);
    const peak = this.scale * 0.62 * height;
    const running = this.molds.get(k);
    if (running) {
      // the board is rebuilt while a tile is still settling; let the block that
      // is already standing finish its mold instead of starting over
      running.peak = Math.max(running.peak, peak);
      return;
    }
    this.molds.set(k, { x: tile.x, y: tile.y, raise: 0, peak, t: 0 });
  }

  updateMolds(dt) {
    if (!this.molds || !this.molds.size || !this.ground?.refresh) return;
    this.moldClock += dt;
    let moved = false;
    for (const [k, mold] of this.molds) {
      mold.t += dt;
      const before = mold.raise;
      if (mold.t < 0.4) {
        const p = mold.t / 0.4;
        mold.raise = mold.peak * p * p * (3 - 2 * p);
      } else if (mold.t < 1.1) {
        mold.raise = mold.peak;
      } else {
        const p = Math.min(1, (mold.t - 1.1) / 1.9);
        mold.raise = mold.peak * (1 - p * p * (3 - 2 * p));
      }
      if (Math.abs(mold.raise - before) > 1e-7) moved = true;
      if (mold.t > 3.05) {
        this.molds.delete(k);
        // the last frame of the mold still has to be drawn flat
        this.moldSettled.set(k, { x: mold.x, y: mold.y, raise: 0 });
        moved = true;
      }
    }
    // twenty-odd rebuilds a second is enough to look like the ground is flowing
    if (moved && this.moldClock > 0.075) {
      const view = new Map(this.molds);
      for (const [k, v] of this.moldSettled) view.set(k, v);
      this.moldSettled.clear();
      this.moldClock = 0;
      this.ground.refresh(view);
    }
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

  // The board has its own lamp and fifteen hundred little pieces on it; letting
  // all of those cast into the room's shadow map would cost more than the room
  // is worth. The furniture and the walls still cast.
  muteShadows() {
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
    });
  }

  // Tiles the world's camps and kingdoms claim, painted on the board. The shape
  // grows as they breed and take the land around them.
  updateSociety(society) {
    const camps = (society?.data ?? society)?.camps || [];
    const key = camps.map((c) => `${c.id}:${(c.territory || []).length}:${c.people.length}`).join('|');
    this.lastSociety = society;
    if (key === this.societyKey && this.societyMesh?.parent) return;
    this.societyKey = key;
    if (!this.groundY) return;
    const project = (x, y) => ({ x: (x - this.centerX) * this.scale, z: (y - this.centerY) * this.scale });
    const positions = [];
    const colors = [];
    const color = new THREE.Color();
    camps.forEach((camp, index) => {
      color.setHSL((camp.id * 0.137) % 1, 0.7, 0.6);
      for (const k of camp.territory || []) {
        const [x, y] = k.split(',').map(Number);
        const tile = this.state?.world?.tiles?.get(k);
        if (!tile) continue;
        const top = this.groundY(tile) + 0.02;
        const a = project(x - 0.5, y - 0.5);
        const b = project(x + 0.5, y - 0.5);
        const c = project(x + 0.5, y + 0.5);
        const d = project(x - 0.5, y + 0.5);
        positions.push(a.x, top, a.z, b.x, top, b.z, c.x, top, c.z);
        positions.push(a.x, top, a.z, c.x, top, c.z, d.x, top, d.z);
        for (let i = 0; i < 6; i++) colors.push(color.r, color.g, color.b);
      }
    });
    if (!this.societyMesh) {
      const geometry = new THREE.BufferGeometry();
      const material = new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide,
      });
      this.societyMesh = new THREE.Mesh(geometry, material);
      this.societyMesh.renderOrder = 2;
    }
    if (!this.societyMesh.parent) this.group.add(this.societyMesh);
    const geometry = this.societyMesh.geometry;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    this.societyMesh.visible = positions.length > 0;
  }

  update(elapsed, dt = 0) {
    this.updateMolds(dt);
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
    for (const ripple of this.ripples) {
      const t = (elapsed * 0.32 + ripple.phase) % 1;
                ripple.mesh.scale.setScalar(ripple.base * (0.45 + t * 1.8));
      ripple.mesh.material.opacity = 0.17 * (1 - t);
    }
    // the water moves: a river runs on, a pond only breathes
    for (const water of this.waters) advanceWater(water.material, dt);
    if (this.seaMaterial) advanceWater(this.seaMaterial, dt);
    for (const ring of this.waterRipples) {
      const t = (elapsed * 0.45 + ring.phase) % 1;
      ring.mesh.scale.setScalar(ring.base * (0.5 + t * 1.6));
      ring.mesh.material.opacity = 0.26 * (1 - t);
    }
    for (const mark of this.borders) {
      mark.mesh.material.opacity = mark.base * (0.7 + Math.sin(elapsed * 1.3) * 0.3);
    }
    for (const person of this.villagers) {
      const reach = person.radius ?? this.scale * 0.14;
      person.group.position.x = person.base.x + Math.sin(elapsed * 0.5 + person.phase) * reach;
      person.group.position.z = person.base.z + Math.cos(elapsed * 0.42 + person.phase) * reach;
      // modelled villagers walk on their own bones; the painted ones slide
      if (person.model) {
        walkPerson(person.model, elapsed + person.phase, person.speed ?? 0.6);
        person.group.rotation.y = Math.atan2(
          Math.cos(elapsed * 0.5 + person.phase) * 0.14,
          -Math.sin(elapsed * 0.42 + person.phase) * 0.14,
        );
      }
    }

    for (const critter of this.animals) {
      critter.group.position.x = critter.base.x + Math.sin(elapsed * 0.35 * critter.drift + critter.phase) * this.scale * 0.45;
      critter.group.position.z = critter.base.z + Math.cos(elapsed * 0.29 * critter.drift + critter.phase) * this.scale * 0.45;
      critter.group.rotation.y = critter.home + Math.sin(elapsed * 0.4 + critter.phase) * 1.2;
      const gait = Math.sin(elapsed * (critter.kind === 'bird' || critter.modelled ? 5.2 : 6.5) + critter.phase);
      for (const leg of critter.legs) {
        leg.mesh.rotation.x = leg.base + gait * (leg.wing ? 0.75 : 0.5);
      }
      if (critter.modelled) {
        // the animal models have no skeleton, so the body carries the walk:
        // a small bob with a roll each stride
        critter.group.position.y = critter.base.y + Math.abs(gait) * this.scale * 0.03;
        critter.group.rotation.z = gait * 0.05;
      } else if (critter.kind === 'bird') {
        critter.group.position.y += Math.abs(gait) * this.scale * 0.03;
      }
    }

    const halfWidth = (this.base.scale.x || 1) * 0.5;
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.speed * Math.min(dt, 0.05) * this.scale * 8;
      if (cloud.position.x > halfWidth) cloud.position.x = -halfWidth;
      cloud.position.y = this.scale * (3.6 + cloud.userData.lane * 1.4) + Math.sin(elapsed * 0.35 + cloud.userData.phase) * this.scale * 0.25;
    }
    for (const bird of this.birds) {
      const orbit = elapsed * bird.userData.speed + bird.userData.phase;
      bird.position.x = Math.cos(orbit) * this.scale * 7.5;
      bird.position.z = Math.sin(orbit) * this.scale * 6;
      bird.rotation.y = -orbit;
    }

    this.updateWorker(elapsed, dt);
    this.updateJolene(elapsed, dt);
    this.updateDressers(elapsed, dt);
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
      if (w.head) {
        w.head.position.y = 1.34 + Math.sin(elapsed * 1.7) * 0.012;
        w.head.rotation.y = Math.sin(elapsed * 0.55) * 0.4;
      }
      if (w.model) walkPerson(w.model, elapsed, 0.15);
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
      if (w.model) walkPerson(w.model, elapsed, 1);
      this.workerTimer = 0;
      return;
    }

    // at the tile: the block comes up out of the board here, and the refine pass
    // takes over from the first swing and melts it back into the land
    if (!job.molding) {
      job.molding = true;
      this.startMold(job.tile, job.kind === 'grow' ? 1 : 0.5);
    }
    w.root.position.set(tx, ty, tz);
    w.root.rotation.y += Math.sin(elapsed * 1.2) * step * 0.4;
    this.workerTimer += step;
    const swing = Math.sin(this.workerTimer * 24);
    w.armPivot.rotation.x = -0.85 + swing * 0.95;
    w.root.position.y = ty + Math.abs(swing) * this.scale * 0.18;
    if (w.model) walkPerson(w.model, elapsed, 0.35);
    if (swing < -0.9) this.spawnPuff(tx, tz, ty);

    if (job.kind === 'grow') {
      const k = key(job.x, job.y);
      this.growth.set(k, Math.min(1, (this.growth.get(k) ?? 0) + step * 1.7));
    }

    if (this.workerTimer > 1.25) {
      this.growth.set(key(job.x, job.y), 1);
      this.workerJob = null;
      this.workerTimer = 0;
    }
  }

  updateJolene(elapsed, dt) {
    if (!this.state || !this.jolene) return;
    const j = this.jolene;
    const step = Math.min(dt, 0.06);
    j.root.scale.setScalar(Math.max(0.05, this.workerHeight * 0.92) / 1.55);

    this.joleneTimer -= step;
    if (!this.joleneGoal || this.joleneTimer <= 0) {
      const land = [];
      for (const tile of this.state.world.tiles.values()) if (isLand(tile)) land.push(tile);
      if (!land.length) return;
      // She goes where Johan has just worked, and dresses that first.
      const fresh = land.filter((tile) => tile.polishedDay === this.state.world.day);
      const pool = fresh.length ? fresh : land;
      const tile = pool[Math.floor(Math.random() * pool.length)];
      this.joleneGoal = {
        x: (tile.x - this.centerX) * this.scale,
        z: (tile.y - this.centerY) * this.scale,
        y: Math.max(0.006, this.heightOf(tile)),
      };
      this.joleneTimer = 2.6 + Math.random() * 3.2;
    }

    const dx = this.joleneGoal.x - j.root.position.x;
    const dz = this.joleneGoal.z - j.root.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.01) {
      const move = Math.min(dist, Math.max(0.12, this.scale * 2.4) * step);
      j.root.position.x += (dx / dist) * move;
      j.root.position.z += (dz / dist) * move;
      j.root.position.y = this.joleneGoal.y + Math.abs(Math.sin(elapsed * 5)) * this.scale * 0.06;
      j.root.rotation.y = Math.atan2(dx, dz);
      j.glow.material.opacity = 0.12;
    } else {
      j.root.position.y = this.joleneGoal.y + Math.sin(elapsed * 1.7) * this.scale * 0.02;
      j.glow.material.opacity = 0.1 + Math.abs(Math.sin(elapsed * 1.9)) * 0.1;
      j.root.rotation.y += step * 1.6;
      this.joleneWork = (this.joleneWork || 0) + step;
      if (this.joleneWork > 0.55) {
        this.joleneWork = 0;
        this.spawnPuff(this.joleneGoal.x, this.joleneGoal.z, this.joleneGoal.y, 0xd8cff0);
      }
    }
    if (j.model) walkPerson(j.model, elapsed, dist > 0.01 ? 1 : 0.12);
  }

  // Swaps Jolene's robed figure for a person from the pack, keeping where she
  // stands and the name over her head.
  reskinJolene() {
    if (!this.jolene || this.jolene.model) return;
    const at = this.jolene.root.position.clone();
    const face = this.jolene.root.rotation.y;
    this.group.remove(this.jolene.root);
    this.jolene = this.buildJolene(this.joleneTint ?? 0xcfc6e6, 23);
    this.jolene.root.position.copy(at);
    this.jolene.root.rotation.y = face;
    this.group.add(this.jolene.root);
    if (this.state) {
      const crew = this.state.sectors || [];
      this.setNameplate(this.jolene.root, crew[0]?.dresser || 'Jolene', '#d9c9f2');
    }
  }

  setNameplate(root, name, color) {
    const existing = root.getObjectByName('nameplate');
    if (existing) {
      root.remove(existing);
      existing.material?.dispose?.();
    }
    const sprite = nameSprite(name, color);
    sprite.name = 'nameplate';
    sprite.position.set(0, 2.35, 0);
    sprite.scale.set(2.8, 0.7, 1);
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 20;
    root.add(sprite);
  }

  updateDressers(elapsed, dt) {
    if (!this.state || !this.extraDressers.length) return;
    const step = Math.min(dt, 0.06);
    const figScale = Math.max(0.05, this.workerHeight * 0.9) / 1.55;

    for (const d of this.extraDressers) {
      const s = d.sector;
      const cx = (s.sx * 20 + 10 - this.centerX) * this.scale;
      const cz = (s.sy * 20 + 10 - this.centerY) * this.scale;
      if (!d.placed) {
        // Start her on ground that exists: a sector's geometric centre may be
        // empty space if the world has only grown into one corner of it.
        d.placed = true;
        let homeX = cx;
        let homeZ = cz;
        let homeY = 0.02;
        for (const tile of this.state.world.tiles.values()) {
          if (Math.floor(tile.x / 20) !== s.sx || Math.floor(tile.y / 20) !== s.sy) continue;
          homeX = (tile.x - this.centerX) * this.scale;
          homeZ = (tile.y - this.centerY) * this.scale;
          homeY = Math.max(0.006, this.heightOf(tile));
          break;
        }
        d.root.position.set(homeX, homeY, homeZ);
      }
      d.root.scale.setScalar(figScale);
      d.timer -= step;

      if (!d.goal || d.timer <= 0) {
        const tiles = [];
        for (const tile of this.state.world.tiles.values()) {
          if (Math.floor(tile.x / 20) === s.sx && Math.floor(tile.y / 20) === s.sy && isLand(tile)) tiles.push(tile);
        }
        if (!tiles.length) continue;
        const tile = tiles[Math.floor(Math.random() * tiles.length)];
        d.goal = {
          x: (tile.x - this.centerX) * this.scale,
          z: (tile.y - this.centerY) * this.scale,
          y: Math.max(0.006, this.heightOf(tile)),
        };
        d.timer = 2.4 + Math.random() * 3;
      }

      const dx = d.goal.x - d.root.position.x;
      const dz = d.goal.z - d.root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.01) {
        const move = Math.min(dist, Math.max(0.1, this.scale * 2.2) * step);
        d.root.position.x += (dx / dist) * move;
        d.root.position.z += (dz / dist) * move;
        d.root.position.y = d.goal.y + Math.abs(Math.sin(elapsed * 5)) * this.scale * 0.02;
        d.root.rotation.y = Math.atan2(dx, dz);
        d.glow.material.opacity = 0.1;
        if (d.model) walkPerson(d.model, elapsed, 1);
      } else {
        d.root.position.y = d.goal.y + Math.sin(elapsed * 1.6) * this.scale * 0.01;
        d.root.rotation.y += step * 1.5;
        d.glow.material.opacity = 0.09 + Math.abs(Math.sin(elapsed * 1.8)) * 0.09;
        if (d.model) walkPerson(d.model, elapsed, 0.12);
      }
    }
  }


  spawnPuff(x, z, y, color = 0xf0cf6a) {
    if (this.puffs.length > 7) return;
    const mesh = new THREE.Mesh(
      this.puffGeometry,
      new THREE.MeshBasicMaterial({
        color,
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
