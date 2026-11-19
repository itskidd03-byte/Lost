import * as THREE from 'three';
import { MapTable } from './mapTable.js';
import { applyEnvironment, quality } from './grade.js';
import {
  plankFloor, plasterWall, beamWood, wovenFabric, tableTopWood,
} from './surfaces.js';

function canvasTexture(w, h, draw, repeat = [1, 1]) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  return tex;
}

function woodTexture(base, dark) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.08})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.6;
      const y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 8, w * 0.6, y + (Math.random() - 0.5) * 8, w, y + (Math.random() - 0.5) * 4);
      ctx.stroke();
    }
    ctx.strokeStyle = dark;
    for (let y = 0; y < h; y += 32) {
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  });
}

function plasterTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#4d4034';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const a = 0.02 + Math.random() * 0.06;
      ctx.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,236,200,${a * 0.6})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

// A soft radial glow for the lantern and the candle: the light has to look like
// it is coming from somewhere, not only land on things.
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,226,170,0.95)');
  g.addColorStop(0.3, 'rgba(255,190,110,0.5)');
  g.addColorStop(0.65, 'rgba(255,150,70,0.16)');
  g.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function parchmentTexture() {
  return canvasTexture(256, 320, (ctx, w, h) => {
    ctx.fillStyle = '#d8c49a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(120,90,50,${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.strokeStyle = 'rgba(80,55,30,0.55)';
    ctx.lineWidth = 1;
    for (let y = 26; y < h - 16; y += 15) {
      ctx.beginPath();
      ctx.moveTo(24, y + Math.random() * 2);
      ctx.lineTo(w - 24, y + Math.random() * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(150,60,40,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(38, 40, 12, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function windowTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a1626');
    g.addColorStop(0.55, '#12293c');
    g.addColorStop(0.72, '#1b3a4d');
    g.addColorStop(1, '#050a0e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(220,235,255,0.85)';
    ctx.beginPath();
    ctx.arc(178, 60, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(220,235,255,0.16)';
    ctx.beginPath();
    ctx.arc(178, 60, 34, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(220,240,255,${Math.random() * 0.5})`;
      ctx.fillRect(Math.random() * w, Math.random() * h * 0.6, 1.3, 1.3);
    }
    ctx.strokeStyle = 'rgba(120,180,200,0.10)';
    for (let y = 150; y < h; y += 12) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  });
}

// A texture from a shared furniture pack: they arrive as 4K atlases, so the
// useful surface is cropped and made seamless into these files first.
function furnitureTexture(file, repeat = [1, 1]) {
  const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/furniture/${file}`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  return tex;
}

export class Cabin {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#060809');
    this.scene.fog = new THREE.FogExp2('#080b0d', 0.055);

    // A warm, almost dark probe with the window in it. Brass, glass and the
    // polished props on the table pick up a room instead of a constant, and the
    // lantern stays the light you actually read by.
    applyEnvironment(this.scene, 'interior');

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.tablePos = new THREE.Vector3(0.4, 0, -0.55);
    this.tableTop = 0.95;
    this.mapCenter = new THREE.Vector3(this.tablePos.x, this.tableTop, this.tablePos.z);
    this.spawn = new THREE.Vector3(-0.9, 0, 2.75);
    this.spawnYaw = 0.06;

    this.blockers = [];
    this.wallLamps = [];
    this.throne = null;
    this.lantern = null;
    this.journal = null;
    this.dust = null;
    this.time = 0;

    this.buildRoom();
    this.buildTable();
    this.buildLaptop();
    this.buildBed();
    this.buildJournal();
    this.buildThrone();
    this.buildWallLamps();
    this.buildLight();

    this.map = new MapTable(this.mapGroup);
    this.focusTarget = this.mapCenter.clone();
    this.focusTarget.y += 0.04;
    // The room casts and catches shadow; the board does not, or every tree on it
    // would be a caster and the lantern-lit table would crawl.
    this.enableShadows();
  }

  enableShadows() {
    const board = new Set();
    if (this.mapGroup) this.mapGroup.traverse((o) => board.add(o));
    this.root.traverse((o) => {
      if (!o.isMesh || board.has(o)) return;
      // glass and glow cards throw no shadow, they only take light
      if (o.material && o.material.isMeshBasicMaterial) {
        o.receiveShadow = false;
        return;
      }
      o.castShadow = true;
      o.receiveShadow = true;
    });
    if (this.floorMat) this.floorMat.needsUpdate = true;
  }

  buildRoom() {
    // floorboards
    const floorTex = plankFloor({ boards: 7 });
    const floorMap = floorTex.map.clone();
    floorMap.needsUpdate = true;
    floorMap.repeat.set(7, 6);
    const floorBump = floorTex.bump.clone();
    floorBump.needsUpdate = true;
    floorBump.repeat.set(7, 6);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorMap,
      bumpMap: floorBump,
      bumpScale: 0.02,
      roughness: 0.82,
      color: 0xcbb394,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 7.4), floorMat);
    this.floor = floor;
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);
    this.floorMat = floorMat;

    // plaster with grit, patches and hairline cracks
    const plaster = plasterWall();
    const wallMap = plaster.map.clone();
    wallMap.needsUpdate = true;
    wallMap.repeat.set(3.2, 1.7);
    const wallBump = plaster.bump.clone();
    wallBump.needsUpdate = true;
    wallBump.repeat.set(3.2, 1.7);
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallMap,
      bumpMap: wallBump,
      bumpScale: 0.03,
      roughness: 0.97,
      color: 0xa2937c,
    });

    // oak for beams, frames and furniture
    const beams = beamWood();
    const beamMap = beams.map.clone();
    beamMap.needsUpdate = true;
    const beamBump = beams.bump.clone();
    beamBump.needsUpdate = true;
    const beamMat = new THREE.MeshStandardMaterial({
      map: beamMap,
      bumpMap: beamBump,
      bumpScale: 0.015,
      color: 0xb59a7c,
      roughness: 0.86,
    });
    const darkBeamMat = new THREE.MeshStandardMaterial({
      map: beamMap,
      color: 0x6a5340,
      roughness: 0.9,
    });

    const H = 3.15;
    const T = 0.16;

    const wall = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      this.root.add(m);
      return m;
    };

    wall(8.6, H, T, 0, H / 2, -3.62);
    wall(T, H, 7.4, -4.22, H / 2, 0);
    // right wall with a window opening
    wall(T, H, 2.9, 4.22, H / 2, -2.25);
    wall(T, H, 2.9, 4.22, H / 2, 2.25);
    wall(T, 0.95, 1.6, 4.22, 0.47, 0);
    wall(T, 0.75, 1.6, 4.22, 2.78, 0);
    // front wall with a door opening
    wall(3.0, H, T, -2.8, H / 2, 3.62);
    wall(2.9, H, T, 2.85, H / 2, 3.62);
    wall(1.6, 0.85, T, -0.65, 2.72, 3.62);

    // skirting and a panelled dado: the wall meets the floor in carpentry, not a seam
    const skirt = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), darkBeamMat);
      m.position.set(x, 0.06, z);
      this.root.add(m);
    };
    skirt(8.44, 0.05, 0, -3.52);
    skirt(0.05, 7.28, -4.12, 0);
    skirt(0.05, 7.28, 4.12, 0);
    skirt(8.44, 0.05, 0, 3.52);
    // the panelling wears the oak taken from the shared furniture pack, with a
    // batten every metre, so the walls are boarded rather than painted flat
    const panelMat = new THREE.MeshStandardMaterial({
      map: furnitureTexture('table-top.jpg', [6, 1]),
      color: 0xd8c3a6,
      roughness: 0.8,
    });
    this.panelMat = panelMat;
    const dado = (w, d, x, z) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.92, d), panelMat);
      panel.position.set(x, 0.56, z);
      panel.receiveShadow = true;
      this.root.add(panel);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d + 0.02), darkBeamMat);
      rail.position.set(x, 1.05, z);
      this.root.add(rail);
      // battens: thin uprights splitting the boarding into panels
      const along = w > d ? w : d;
      const vertical = w < d;
      const count = Math.max(2, Math.round(along / 1.1));
      for (let i = 1; i < count; i++) {
        const t = -along / 2 + (along * i) / count;
        // an upright batten, thin on both faces of the wall whichever wall it is
        const batten = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.86, 0.05), darkBeamMat);
        batten.position.set(vertical ? x : x + t, 0.56, vertical ? z + t : z);
        this.root.add(batten);
      }
    };
    dado(8.42, 0.035, 0, -3.56);
    dado(0.035, 7.24, -4.16, 0);
    dado(0.035, 7.24, 4.16, 0);
    dado(8.42, 0.035, 0, 3.56);
    for (const sx of [-3.2, -1.7, 0.6, 2.2, 3.4]) {
      const stile = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.92, 0.05), darkBeamMat);
      stile.position.set(sx, 0.56, -3.53);
      this.root.add(stile);
    }

    // door: boards, casing, iron hinges and a latch
    const doorGroup = new THREE.Group();
    doorGroup.position.set(-0.65, 0, 3.6);
    this.root.add(doorGroup);
    for (let i = 0; i < 5; i++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.27, 2.28, 0.06), beamMat);
      board.position.set(-0.56 + i * 0.28, 1.15, 0);
      doorGroup.add(board);
    }
    for (const [y, x, w] of [[0.42, 0, 1.42], [1.86, 0, 1.42]]) {
      const batten = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.05), darkBeamMat);
      batten.position.set(x, y, 0.05);
      doorGroup.add(batten);
    }
    for (const y of [0.55, 1.5]) {
      const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.02), new THREE.MeshStandardMaterial({ color: 0x3b3a38, metalness: 0.8, roughness: 0.45 }));
      hinge.position.set(-0.62, y, 0.05);
      doorGroup.add(hinge);
    }
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.03), new THREE.MeshStandardMaterial({ color: 0x2f2c28, metalness: 0.75, roughness: 0.4 }));
    latch.position.set(0.5, 1.1, 0.06);
    doorGroup.add(latch);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshStandardMaterial({ color: 0x8a6b2c, metalness: 0.7, roughness: 0.4 }));
    handle.position.set(0.56, 1.1, 0.1);
    doorGroup.add(handle);
    for (const [w, h, x, y] of [[1.62, 0.09, 0, 2.36], [0.09, 2.36, -0.76, 1.18], [0.09, 2.36, 0.76, 1.18]]) {
      const casing = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.09), darkBeamMat);
      casing.position.set(-0.65 + x, y, 3.56);
      this.root.add(casing);
    }
    const threshold = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.16), darkBeamMat);
    threshold.position.set(-0.65, 0.025, 3.58);
    this.root.add(threshold);

    // window: glass, frame, sill and shutters
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.25),
      new THREE.MeshBasicMaterial({ map: windowTexture() }),
    );
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(4.12, 1.72, 0);
    this.root.add(glass);
    for (const [w, h, d, x, y, z] of [
      [0.08, 1.4, 0.08, 4.1, 1.72, -0.78],
      [0.08, 1.4, 0.08, 4.1, 1.72, 0.78],
      [0.08, 0.08, 1.64, 4.1, 2.42, 0],
      [0.08, 0.08, 1.64, 4.1, 1.02, 0],
      [0.06, 1.3, 0.05, 4.1, 1.72, 0],
      [0.06, 0.05, 1.3, 4.1, 1.72, 0],
    ]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), darkBeamMat);
      bar.position.set(x, y, z);
      this.root.add(bar);
    }
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 1.78), beamMat);
    sill.position.set(4.02, 0.98, 0);
    this.root.add(sill);
    for (const sz of [-1.02, 1.02]) {
      const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.34, 0.28), beamMat);
      shutter.position.set(4.06, 1.74, sz);
      shutter.rotation.x = sz > 0 ? -0.14 : 0.14;
      this.root.add(shutter);
    }

    // ...and a little herb pot on the sill
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0x8d5a3c, roughness: 0.95 }));
    pot.position.set(4.0, 1.06, -0.5);
    this.root.add(pot);
    for (let i = 0; i < 5; i++) {
      const sprig = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.16, 4), new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 1 }));
      sprig.position.set(3.98 + (Math.random() - 0.5) * 0.05, 1.19, -0.55 + i * 0.024);
      sprig.rotation.z = (Math.random() - 0.5) * 0.5;
      this.root.add(sprig);
    }

    // ceiling boards between the rafters
    const ceilMap = floorTex.map.clone();
    ceilMap.needsUpdate = true;
    ceilMap.repeat.set(4, 5);
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(8.6, 7.4),
      new THREE.MeshStandardMaterial({ map: ceilMap, roughness: 0.95, color: 0x8d7a60 }),
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 3.13;
    this.root.add(ceil);
    for (let i = -1; i <= 1; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.16, 0.2), beamMat);
      beam.position.set(0, 3.02, i * 2.0);
      this.root.add(beam);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 7.4), beamMat);
    ridge.position.set(0, 3.06, 0);
    this.root.add(ridge);

    // rug: woven wool, worn at the edge
    const wool = wovenFabric('#3f1a18', '#6b3a24', 40);
    const rugMap = wool.map.clone();
    rugMap.needsUpdate = true;
    rugMap.repeat.set(4, 4);
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(1.9, 40),
      new THREE.MeshStandardMaterial({ map: rugMap, roughness: 1, color: 0xc9b49a }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0.4, 0.005, -0.2);
    rug.receiveShadow = true;
    this.root.add(rug);
    const rugInner = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.55, 40),
      new THREE.MeshStandardMaterial({ color: 0x7d4a2c, roughness: 1 }),
    );
    rugInner.rotation.x = -Math.PI / 2;
    rugInner.position.set(0.4, 0.007, -0.2);
    this.root.add(rugInner);

    // a shelf of books, a jar and a candle stub on the back wall
    const shelf = new THREE.Group();
    shelf.position.set(1.05, 1.7, -3.48);
    this.root.add(shelf);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.26), beamMat);
    shelf.add(board);
    for (const [w, h, x, dy, colour] of [
      [0.07, 0.26, -0.55, 0.15, 0x5b2f28], [0.05, 0.24, -0.46, 0.14, 0x2f4150],
      [0.08, 0.22, -0.36, 0.13, 0x4a3d24], [0.06, 0.25, 0.18, 0.15, 0x35472f],
    ]) {
      const book = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.19), new THREE.MeshStandardMaterial({ color: colour, roughness: 0.95 }));
      book.position.set(x, dy, 0);
      shelf.add(book);
    }
    const jar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.055, 0.14, 10),
      new THREE.MeshStandardMaterial({ color: 0x8b9a7a, roughness: 0.4, metalness: 0.05, transparent: true, opacity: 0.85 }),
    );
    jar.position.set(0.42, 0.1, 0);
    shelf.add(jar);
    const stub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.032, 0.09, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8cba9, roughness: 0.9 }),
    );
    stub.position.set(-0.1, 0.07, 0.02);
    shelf.add(stub);

    // coat pegs by the door
    for (const [px, py] of [[-2.05, 1.68], [-1.72, 1.66], [-2.3, 1.5]]) {
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.1, 6), darkBeamMat);
      peg.rotation.x = Math.PI / 2;
      peg.position.set(px, py, 3.52);
      this.root.add(peg);
    }
    const cloak = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.8, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x3b3a30, roughness: 1 }),
    );
    cloak.position.set(-2.05, 1.28, 3.5);
    cloak.rotation.z = 0.05;
    this.root.add(cloak);

    // a chest at the foot of the bed
    const chest = new THREE.Group();
    chest.position.set(-2.2, 0, -2.6);
    chest.rotation.y = 0.5;
    this.root.add(chest);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.44, 0.56), beamMat);
    body.position.y = 0.22;
    chest.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.1, 0.6), darkBeamMat);
    lid.position.y = 0.48;
    chest.add(lid);
    for (const bx of [-0.28, 0.28]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.58), new THREE.MeshStandardMaterial({ color: 0x33312d, metalness: 0.7, roughness: 0.5 }));
      band.position.set(bx, 0.23, 0);
      chest.add(band);
    }

    this.wallMat = wallMat;
    this.beamMat = beamMat;
    this.darkBeamMat = darkBeamMat;
  }

  buildTable() {
    const top = tableTopWood();
    const topMap = top.map.clone();
    topMap.needsUpdate = true;
    topMap.repeat.set(2, 1.4);
    const topBump = top.bump.clone();
    topBump.needsUpdate = true;
    topBump.repeat.set(2, 1.4);
    // the table wears the skin taken from the shared furniture pack: dark oak
    // boards, tiled across the top, with the painted grain kept as relief
    const skin = furnitureTexture('table-top.jpg', [2, 1.4]);
    const mat = new THREE.MeshStandardMaterial({
      map: skin,
      bumpMap: topBump,
      bumpScale: 0.006,
      roughness: 0.66,
      color: 0xf2e2ca,
    });
    const group = new THREE.Group();
    group.position.copy(this.tablePos);
    this.root.add(group);

    const surface = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.1, 1.95), mat);
    surface.position.y = this.tableTop - 0.05;
    surface.receiveShadow = true;
    group.add(surface);
    // a lipped edge, so the top is a piece of joinery rather than a slab
    const rim = new THREE.Mesh(new THREE.BoxGeometry(2.98, 0.045, 2.03), this.darkBeamMat || this.beamMat);
    rim.position.y = this.tableTop - 0.088;
    group.add(rim);

    const apron = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.14, 1.78), this.beamMat);
    apron.position.y = this.tableTop - 0.17;
    group.add(apron);
    for (const [w, d, x, z] of [[2.6, 0.09, 0, 0.86], [2.6, 0.09, 0, -0.86], [0.09, 1.62, 1.3, 0], [0.09, 1.62, -1.3, 0]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, d), this.darkBeamMat || this.beamMat);
      rail.position.set(x, this.tableTop - 0.29, z);
      group.add(rail);
    }

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, this.tableTop - 0.1, 8), this.beamMat);
        leg.position.set(sx * 1.32, (this.tableTop - 0.1) / 2, sz * 0.82);
        leg.rotation.z = sx * 0.012;
        group.add(leg);
      }
    }

    this.mapGroup = new THREE.Group();
    this.mapGroup.position.set(0, this.tableTop, 0);
    group.add(this.mapGroup);

    this.blockers.push({
      minX: this.tablePos.x - 1.45,
      maxX: this.tablePos.x + 1.45,
      minZ: this.tablePos.z - 0.97,
      maxZ: this.tablePos.z + 0.97,
    });

    // the odds and ends a man keeps beside his world: a candle, an inkwell, a
    // rolled chart and a cup
    const props = new THREE.Group();
    props.position.set(0, this.tableTop, 0);
    group.add(props);
    const candle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.028, 0.13, 9),
      new THREE.MeshStandardMaterial({ color: 0xe2d6b8, roughness: 0.9 }),
    );
    candle.position.set(-1.16, 0.065, -0.62);
    props.add(candle);
    const dish = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.075, 0.012, 12),
      new THREE.MeshStandardMaterial({ color: 0x6c6257, metalness: 0.5, roughness: 0.55 }),
    );
    dish.position.set(-1.16, 0.006, -0.62);
    props.add(dish);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.012, 0.045, 6),
      new THREE.MeshBasicMaterial({ color: 0xffcf82 }),
    );
    flame.position.set(-1.16, 0.155, -0.62);
    props.add(flame);
    this.tableFlame = flame;
    const candleGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xffc27a,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    candleGlow.position.set(-1.16, 0.16, -0.62);
    candleGlow.scale.setScalar(0.3);
    props.add(candleGlow);
    this.candleGlow = candleGlow;
    this.tableCandle = new THREE.PointLight(0xffb765, 1.1, 1.6, 2);
    this.tableCandle.position.set(-1.16, 0.2, -0.62);
    props.add(this.tableCandle);

    const ink = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.038, 0.045, 10),
      new THREE.MeshStandardMaterial({ color: 0x1b1a1c, roughness: 0.5, metalness: 0.2 }),
    );
    ink.position.set(1.12, 0.022, -0.6);
    props.add(ink);
    const quill = new THREE.Mesh(
      new THREE.ConeGeometry(0.006, 0.2, 4),
      new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.95 }),
    );
    quill.position.set(1.16, 0.11, -0.55);
    quill.rotation.z = 0.4;
    props.add(quill);
    const scroll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.42, 10),
      new THREE.MeshStandardMaterial({ color: 0xd9c8a2, roughness: 1 }),
    );
    scroll.position.set(1.24, 0.022, 0.34);
    scroll.rotation.z = Math.PI / 2;
    scroll.rotation.y = 0.3;
    props.add(scroll);
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.032, 0.085, 12),
      new THREE.MeshStandardMaterial({ color: 0x7d6a52, roughness: 0.6 }),
    );
    cup.position.set(-1.22, 0.042, 0.42);
    props.add(cup);

    // stool
    const stool = new THREE.Group();
    stool.position.set(this.tablePos.x + 1.9, 0, this.tablePos.z + 0.4);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 16), mat);
    seat.position.y = 0.58;
    stool.add(seat);
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.58, 8), this.beamMat);
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.18, 0.29, Math.sin(a) * 0.18);
      leg.rotation.z = Math.cos(a) * 0.08;
      leg.rotation.x = -Math.sin(a) * 0.08;
      stool.add(leg);
    }
    const brace = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.016, 6, 14), this.darkBeamMat || this.beamMat);
    brace.rotation.x = Math.PI / 2;
    brace.position.y = 0.22;
    stool.add(brace);
    this.root.add(stool);
    this.blockers.push({ minX: this.tablePos.x + 1.6, maxX: this.tablePos.x + 2.2, minZ: this.tablePos.z + 0.1, maxZ: this.tablePos.z + 0.7 });
  }

  buildLaptop() {
    // A small desk against the right wall, turned toward the room, with an open
    // laptop on it: walk to it and the orders menu comes up.
    const deskTex = woodTexture('#4a3520', 'rgba(0,0,0,0.32)');
    deskTex.repeat.set(1, 1);
    const deskMat = new THREE.MeshStandardMaterial({ map: deskTex, roughness: 0.82, color: 0xb69a72 });
    const shell = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.5, roughness: 0.45 });
    const keys = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.7 });
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x0b1a22,
      emissive: 0x2f6d86,
      emissiveIntensity: 1.15,
      roughness: 0.35,
    });

    const desk = new THREE.Group();
    desk.position.set(2.15, 0, 1.45);
    desk.rotation.y = -0.36;
    this.root.add(desk);

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.64), deskMat);
    top.position.y = 0.72;
    top.receiveShadow = true;
    desk.add(top);
    for (const [lx, lz] of [[-0.5, -0.24], [0.5, -0.24], [-0.5, 0.24], [0.5, 0.24]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.72, 0.07), deskMat);
      leg.position.set(lx, 0.36, lz);
      desk.add(leg);
    }

    const laptop = new THREE.Group();
    laptop.position.set(0, 0.75, 0.02);
    laptop.rotation.y = -0.18;
    desk.add(laptop);

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.026, 0.3), shell);
    base.position.y = 0.015;
    laptop.add(base);
    const keyBed = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.008, 0.17), keys);
    keyBed.position.set(0, 0.03, 0.03);
    laptop.add(keyBed);
    const trackpad = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.006, 0.08), shell);
    trackpad.position.set(0, 0.031, 0.12);
    laptop.add(trackpad);

    const lid = new THREE.Group();
    lid.position.set(0, 0.028, -0.15);
    lid.rotation.x = -1.85;
    const lidShell = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.018), shell);
    lidShell.position.y = 0.15;
    const display = new THREE.Mesh(new THREE.PlaneGeometry(0.39, 0.25), screenMat);
    display.position.set(0, 0.15, 0.012);
    lid.add(lidShell, display);
    laptop.add(lid);

    // The desk sits away from the lantern, so it carries its own small lamp.
    const lampStand = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.42, 6), shell);
    lampStand.position.set(-0.44, 0.95, -0.12);
    desk.add(lampStand);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.17, 10, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x2f2a22, emissive: 0xffb765, emissiveIntensity: 0.55, side: THREE.DoubleSide, roughness: 0.8 }),
    );
    shade.position.set(-0.44, 1.2, -0.12);
    desk.add(shade);
    const lamp = new THREE.PointLight(0xffc98a, 0.85, 3.4, 2);
    lamp.position.set(-0.4, 1.12, -0.06);
    desk.add(lamp);

    const glow = new THREE.PointLight(0x7fd4ff, 0.55, 1.9, 2);
    glow.position.set(0, 0.2, 0.16);
    laptop.add(glow);

    this.laptopPos = new THREE.Vector3(2.15, 0, 1.45);
    this.laptopScreen = display;
    this.laptopGlow = glow;
    this.blockers.push({ minX: 2.15 - 0.66, maxX: 2.15 + 0.66, minZ: 1.45 - 0.38, maxZ: 1.45 + 0.38 });
  }

  buildBed() {
    const frameMat = this.beamMat;
    const group = new THREE.Group();
    group.position.set(-3.15, 0, -2.1);
    this.root.add(group);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.32, 2.5), frameMat);
    frame.position.y = 0.26;
    frame.receiveShadow = true;
    group.add(frame);

    // posts and rails
    for (const [px, pz] of [[-0.82, -1.2], [0.82, -1.2], [-0.82, 1.2], [0.82, 1.2]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.5, 8), this.darkBeamMat || frameMat);
      post.position.set(px, 0.25, pz);
      group.add(post);
    }

    const mattress = new THREE.Mesh(
      new THREE.BoxGeometry(1.56, 0.28, 2.32),
      new THREE.MeshStandardMaterial({ color: 0xb2a48a, roughness: 1 }),
    );
    mattress.position.y = 0.54;
    group.add(mattress);

    const wool = wovenFabric('#5c2f28', '#8a4a34', 34);
    const blanketMap = wool.map.clone();
    blanketMap.needsUpdate = true;
    blanketMap.repeat.set(3, 4);
    const blanket = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.12, 1.5),
      new THREE.MeshStandardMaterial({ map: blanketMap, roughness: 1, color: 0xcfae90 }),
    );
    blanket.position.set(0, 0.69, 0.4);
    group.add(blanket);

    // the turned-down edge of the blanket
    const fold = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.09, 0.34),
      new THREE.MeshStandardMaterial({ map: blanketMap, roughness: 1, color: 0xe0c3a4 }),
    );
    fold.position.set(0, 0.75, -0.22);
    group.add(fold);

    const pillowMap = wovenFabric('#b8ab90', '#d3c6ab', 22).map.clone();
    pillowMap.needsUpdate = true;
    pillowMap.repeat.set(2, 1);
    const pillow = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.16, 0.42),
      new THREE.MeshStandardMaterial({ map: pillowMap, roughness: 1, color: 0xdfd3ba }),
    );
    pillow.position.set(0, 0.7, -0.86);
    pillow.rotation.x = 0.04;
    group.add(pillow);

    const head = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 0.12), frameMat);
    head.position.set(0, 0.78, -1.24);
    head.receiveShadow = true;
    group.add(head);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.09, 0.16), this.darkBeamMat || frameMat);
    rail.position.set(0, 1.32, -1.24);
    group.add(rail);

    this.blockers.push({ minX: -4.1, maxX: -2.2, minZ: -3.45, maxZ: -0.75 });
  }

  buildJournal() {
    const group = new THREE.Group();
    group.name = 'journal';
    group.position.set(2.35, 1.82, -3.52);
    this.root.add(group);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 1.08, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.8 }),
    );
    group.add(board);

    const pages = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.94),
      new THREE.MeshStandardMaterial({ map: parchmentTexture(), roughness: 1, emissive: 0x1a1206, emissiveIntensity: 0.18 }),
    );
    pages.position.set(0, 0, 0.031);
    group.add(pages);

    // two hanging straps
    for (const sx of [-0.26, 0.26]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.04), new THREE.MeshStandardMaterial({ color: 0x28180e }));
      strap.position.set(sx, 0.58, 0.02);
      group.add(strap);
    }

    const glow = new THREE.PointLight(0xffcf7a, 0.5, 1.8, 2);
    glow.position.set(0, 0, 0.35);
    group.add(glow);

    this.journal = group;
  }

  // A barber's chair, promoted to a throne: chrome pedestal, tufted leather, a
  // footrest and a gold crown along the headrest, set where Johan can sit and
  // watch the world he is working on.
  buildThrone() {
    const leather = new THREE.MeshStandardMaterial({
      map: furnitureTexture('tufted-leather.jpg', [2, 1.4]),
      color: 0xe9dfd6,
      roughness: 0.6,
      metalness: 0.05,
    });
    const leatherDark = new THREE.MeshStandardMaterial({ color: 0x2c1915, roughness: 0.72 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc9cdd4, roughness: 0.24, metalness: 0.94 });
    const gold = new THREE.MeshStandardMaterial({
      color: 0xc9a227, roughness: 0.38, metalness: 0.75, emissive: 0x2a1f05, emissiveIntensity: 0.6,
    });
    const group = new THREE.Group();
    const at = new THREE.Vector3(-3.05, 0, 1.65);
    group.position.copy(at);
    // face the table it is set beside
    group.rotation.y = Math.atan2(this.tablePos.x - at.x, this.tablePos.z - at.z);
    this.root.add(group);

    // pedestal: a weighted plate, a chrome column and a ring the foot rests on
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.07, 18), chrome);
    plate.position.y = 0.035;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.52, 12), chrome);
    column.position.y = 0.33;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.022, 6, 20), chrome);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.24;
    group.add(plate, column, ring);

    // seat, with a rolled front edge
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.16, 0.7), leather);
    seat.position.y = 0.65;
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.78, 12), leather);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, 0.67, 0.34);
    group.add(seat, roll);

    // tall tufted back, leaning away from the sitter
    const back = new THREE.Group();
    back.position.set(0, 0.7, -0.32);
    back.rotation.x = -0.12;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.05, 0.16), leather);
    panel.position.y = 0.52;
    back.add(panel);
    for (let row = 0; row < 3; row++) {
      for (let col = -1; col <= 1; col++) {
        const button = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), leatherDark);
        button.position.set(col * 0.22, 0.28 + row * 0.3, 0.085);
        back.add(button);
      }
    }
    // headrest with the gold crown
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.16), leather);
    head.position.set(0, 1.16, -0.04);
    back.add(head);
    for (const [w, h, y] of [[0.62, 0.05, 1.3], [0.44, 0.04, 1.36]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.11), gold);
      bar.position.set(0, y, -0.02);
      back.add(bar);
    }
    for (const gx of [-0.26, 0, 0.26]) {
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 6), gold);
      finial.position.set(gx, 1.44, -0.02);
      back.add(finial);
    }
    group.add(back);

    // armrests on chrome posts
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 8), chrome);
      post.position.set(side * 0.36, 0.82, 0.05);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.46), leather);
      pad.position.set(side * 0.36, 1.0, 0.06);
      group.add(post, pad);
    }

    // footrest: a chrome frame with a ribbed plate
    const rest = new THREE.Group();
    rest.position.set(0, 0, 0.42);
    for (const side of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 6), chrome);
      bar.position.set(side * 0.22, 0.3, 0.12);
      bar.rotation.x = 0.8;
      rest.add(bar);
    }
    const plateRest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.24), leatherDark);
    plateRest.position.set(0, 0.45, 0.29);
    plateRest.rotation.x = -0.25;
    rest.add(plateRest);
    group.add(rest);

    this.throne = group;
    this.blockers.push({ minX: at.x - 0.55, maxX: at.x + 0.55, minZ: at.z - 0.55, maxZ: at.z + 0.6 });
  }

  // Lamps on the walls, so the room is lit from more than the one lantern: a
  // brass bracket, a warm shade and a small pool of light on the plaster.
  buildWallLamps() {
    const brass = new THREE.MeshStandardMaterial({ color: 0x8b6a3a, metalness: 0.65, roughness: 0.42 });
    const shadeMat = new THREE.MeshStandardMaterial({
      color: 0x3a2b1c, emissive: 0xffaf5f, emissiveIntensity: 0.85, roughness: 0.72, side: THREE.DoubleSide,
    });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff0cf, emissive: 0xffc078, emissiveIntensity: 2.2, roughness: 0.3 });
    const spots = [
      [-4.14, 2.0, -1.5, Math.PI / 2],
      [-4.14, 2.0, 2.35, Math.PI / 2],
      [4.14, 2.0, -2.7, -Math.PI / 2],
    ];
    for (const [x, y, z, yaw] of spots) {
      const lamp = new THREE.Group();
      lamp.position.set(x, y, z);
      lamp.rotation.y = yaw;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.12), brass);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.26, 6), brass);
      arm.rotation.z = Math.PI / 2.4;
      arm.position.set(0.12, 0.04, 0);
      const cup = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.16, 12, 1, true), shadeMat);
      cup.position.set(0.24, -0.02, 0);
      cup.rotation.z = Math.PI;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), bulbMat);
      bulb.position.set(0.24, -0.1, 0);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color: 0xffb977,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glow.position.set(0.24, -0.06, 0);
      glow.scale.setScalar(0.62);
      const light = new THREE.PointLight(0xffb266, 3.4, 4.8, 2);
      light.position.set(0.3, -0.08, 0);
      lamp.add(plate, arm, cup, bulb, glow, light);
      this.root.add(lamp);
      this.wallLamps.push({ light, glow, phase: Math.random() * 6 });
    }
  }

  buildLight() {
    this.ambient = new THREE.AmbientLight(0x6b7a8c, 1.15);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0x42566a, 0x241a10, 0.95);
    this.scene.add(this.hemi);

    // Moonlight through the window: the one light in the room that casts, so the
    // furniture and the props on the table throw shadows on the boards.
    const moon = new THREE.DirectionalLight(0x9dc3e6, 1.7);
    moon.position.set(6, 4.5, 1.5);
    moon.target.position.set(-1, 1, 0);
    moon.castShadow = true;
    // a phone pays for every shadow texel, so it gets a smaller map
    moon.shadow.mapSize.set(quality.cabinShadow, quality.cabinShadow);
    moon.shadow.camera.left = -6.5;
    moon.shadow.camera.right = 6.5;
    moon.shadow.camera.top = 6.5;
    moon.shadow.camera.bottom = -6.5;
    moon.shadow.camera.near = 0.4;
    moon.shadow.camera.far = 24;
    moon.shadow.bias = -0.0007;
    moon.shadow.normalBias = 0.02;
    this.scene.add(moon);
    this.scene.add(moon.target);
    this.moon = moon;

    const lantern = new THREE.Group();
    lantern.position.set(this.tablePos.x - 1.5, 2.15, this.tablePos.z + 0.35);
    this.root.add(lantern);
    const cage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 0.34, 8, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x241a10, metalness: 0.5, roughness: 0.6, side: THREE.DoubleSide }),
    );
    lantern.add(cage);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc978 }),
    );
    lantern.add(flame);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.85, 4), this.beamMat);
    cord.position.y = 0.58;
    lantern.add(cord);

    this.lantern = new THREE.PointLight(0xffb35c, 15, 11, 1.7);
    this.lantern.position.set(lantern.position.x, lantern.position.y - 0.05, lantern.position.z);
    this.scene.add(this.lantern);

    // The visible glow, and a wide warm fill so the lamp actually brightens the
    // room rather than just dotting the table with a hotspot.
    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xffc27a,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.lanternGlow = new THREE.Sprite(glowMat);
    this.lanternGlow.position.copy(lantern.position);
    this.lanternGlow.scale.setScalar(0.95);
    this.scene.add(this.lanternGlow);

    this.roomGlow = new THREE.PointLight(0xffb877, 7.2, 11, 1.35);
    this.roomGlow.position.set(lantern.position.x - 0.1, lantern.position.y - 0.25, lantern.position.z + 0.1);
    this.scene.add(this.roomGlow);

    this.mapLight = new THREE.PointLight(0xffd79a, 5.2, 3.4, 2);
    this.mapLight.position.set(this.mapCenter.x, this.mapCenter.y + 0.95, this.mapCenter.z);
    this.scene.add(this.mapLight);

    // dust
    const count = 160;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = 0.2 + Math.random() * 2.8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 7;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xffe6bd, size: 0.007, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.scene.add(this.dust);
  }

  update(dt, elapsed) {
    this.time = elapsed;
    if (this.lantern) {
      const flicker = 8.8 + Math.sin(elapsed * 7.3) * 0.5 + Math.sin(elapsed * 17.1) * 0.32 + Math.random() * 0.35;
      this.lantern.intensity = flicker;
      // the glow breathes with the flame, and the room brightens a little with it
      if (this.lanternGlow) {
        const swell = 0.9 + flicker * 0.022;
        this.lanternGlow.scale.setScalar(swell);
        this.lanternGlow.material.opacity = 0.42 + flicker * 0.012;
      }
      // the room is lit by the lamp: as the flame swells, the walls brighten
      if (this.roomGlow) this.roomGlow.intensity = 5.4 + flicker * 0.26;
      if (this.ambient) this.ambient.intensity = 1.02 + flicker * 0.016;
      if (this.hemi) this.hemi.intensity = 0.8 + flicker * 0.018;
    }
    if (this.tableFlame) {
      const f = 0.85 + Math.sin(elapsed * 9.1) * 0.1 + Math.random() * 0.07;
      this.tableFlame.scale.set(1, f, 1);
      this.tableFlame.position.y = 0.148 + f * 0.01;
      if (this.tableCandle) this.tableCandle.intensity = 0.75 + f * 0.4;
      if (this.candleGlow) {
        this.candleGlow.scale.setScalar(0.26 + f * 0.06);
        this.candleGlow.material.opacity = 0.3 + f * 0.16;
      }
    }
    if (this.dust) {
      const pos = this.dust.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.array[i * 3 + 1] += Math.sin(elapsed * 0.4 + i) * 0.0006;
        pos.array[i * 3] += Math.cos(elapsed * 0.3 + i * 1.3) * 0.0004;
      }
      pos.needsUpdate = true;
    }
    this.map.update(elapsed, dt);
  }
}
