import * as THREE from 'three';
import { MapTable } from './mapTable.js';

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

export class Cabin {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#060809');
    this.scene.fog = new THREE.FogExp2('#080b0d', 0.055);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.tablePos = new THREE.Vector3(0.4, 0, -0.55);
    this.tableTop = 0.95;
    this.mapCenter = new THREE.Vector3(this.tablePos.x, this.tableTop, this.tablePos.z);
    this.spawn = new THREE.Vector3(-0.9, 0, 2.75);
    this.spawnYaw = 0.06;

    this.blockers = [];
    this.lantern = null;
    this.journal = null;
    this.dust = null;
    this.time = 0;

    this.buildRoom();
    this.buildTable();
    this.buildLaptop();
    this.buildBed();
    this.buildJournal();
    this.buildLight();

    this.map = new MapTable(this.mapGroup);
    this.focusTarget = this.mapCenter.clone();
    this.focusTarget.y += 0.04;
  }

  buildRoom() {
    const floorTex = woodTexture('#3a2a1b', 'rgba(0,0,0,0.35)');
    floorTex.repeat.set(5, 5);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8.6, 7.4),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, color: 0xbfae98 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.root.add(floor);

    const wallTex = plasterTexture();
    wallTex.repeat.set(3, 1.6);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95, color: 0x8a7b68 });
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x2a1d12, roughness: 0.85 });
    const H = 3.15;
    const T = 0.16;

    const wall = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, y, z);
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

    // door
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.42, 2.3, 0.1), beamMat);
    door.position.set(-0.65, 1.15, 3.6);
    door.rotation.y = 0.02;
    this.root.add(door);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshStandardMaterial({ color: 0x8a6b2c, metalness: 0.7, roughness: 0.4 }));
    handle.position.set(-0.12, 1.16, 3.53);
    this.root.add(handle);

    // window frame + glass
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.25),
      new THREE.MeshBasicMaterial({ map: windowTexture(), transparent: false }),
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
    ]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), beamMat);
      bar.position.set(x, y, z);
      this.root.add(bar);
    }

    // ceiling beams
    for (let i = -1; i <= 1; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.16, 0.2), beamMat);
      beam.position.set(0, 3.02, i * 2.0);
      this.root.add(beam);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 7.4), beamMat);
    ridge.position.set(0, 3.06, 0);
    this.root.add(ridge);

    // rug
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(1.9, 32),
      new THREE.MeshStandardMaterial({ color: 0x4a1f1c, roughness: 1 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0.4, 0.005, -0.2);
    this.root.add(rug);
    const rugInner = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.55, 32), new THREE.MeshStandardMaterial({ color: 0x6b3a24, roughness: 1 }));
    rugInner.rotation.x = -Math.PI / 2;
    rugInner.position.set(0.4, 0.007, -0.2);
    this.root.add(rugInner);

    this.wallMat = wallMat;
    this.beamMat = beamMat;
  }

  buildTable() {
    const wood = woodTexture('#5a3f24', 'rgba(0,0,0,0.4)');
    wood.repeat.set(2, 1.4);
    const mat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.72, color: 0xa9906d });
    const group = new THREE.Group();
    group.position.copy(this.tablePos);
    this.root.add(group);

    const top = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.1, 1.95), mat);
    top.position.y = this.tableTop - 0.05;
    group.add(top);

    const apron = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.14, 1.78), this.beamMat);
    apron.position.y = this.tableTop - 0.17;
    group.add(apron);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, this.tableTop - 0.1, 0.13), this.beamMat);
        leg.position.set(sx * 1.32, (this.tableTop - 0.1) / 2, sz * 0.82);
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

    // stool
    const stool = new THREE.Group();
    stool.position.set(this.tablePos.x + 1.9, 0, this.tablePos.z + 0.4);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 14), mat);
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
    group.add(frame);
    const mattress = new THREE.Mesh(
      new THREE.BoxGeometry(1.56, 0.28, 2.32),
      new THREE.MeshStandardMaterial({ color: 0xa89b82, roughness: 1 }),
    );
    mattress.position.y = 0.54;
    group.add(mattress);
    const blanket = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.12, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x5c2f28, roughness: 1 }),
    );
    blanket.position.set(0, 0.69, 0.4);
    group.add(blanket);
    const pillow = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.16, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xc7bba2, roughness: 1 }),
    );
    pillow.position.set(0, 0.7, -0.86);
    group.add(pillow);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 0.12), frameMat);
    head.position.set(0, 0.78, -1.24);
    group.add(head);

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

  buildLight() {
    this.scene.add(new THREE.AmbientLight(0x5c6c80, 0.95));
    this.scene.add(new THREE.HemisphereLight(0x3a4e63, 0x1a1208, 0.7));

    const moon = new THREE.DirectionalLight(0x9dc3e6, 1.7);
    moon.position.set(6, 4.5, 1.5);
    moon.target.position.set(-1, 1, 0);
    this.scene.add(moon);
    this.scene.add(moon.target);

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

    this.lantern = new THREE.PointLight(0xffb35c, 13, 10, 1.8);
    this.lantern.position.set(lantern.position.x, lantern.position.y - 0.05, lantern.position.z);
    this.scene.add(this.lantern);

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
      const flicker = 7.6 + Math.sin(elapsed * 7.3) * 0.5 + Math.sin(elapsed * 17.1) * 0.32 + Math.random() * 0.35;
      this.lantern.intensity = flicker;
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
