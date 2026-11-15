// Jolene's toolbox: the detail that turns bare ground into a place.
//
// Everything here is shared by the table map and the walkable region so both
// look like the same world. Pieces are cheap, reused and deterministic, and the
// caller places them; nothing here reads game state.

import * as THREE from 'three';

const geoCache = new Map();
const matCache = new Map();

function geom(name, make) {
  if (!geoCache.has(name)) geoCache.set(name, make());
  return geoCache.get(name);
}

function mat(name, make) {
  if (!matCache.has(name)) matCache.set(name, make());
  return matCache.get(name);
}

export function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function surfaceMaterial(colorHex, { water = false, flat = false } = {}) {
  const key = `${colorHex}|${water ? 'w' : 's'}`;
  return mat(key, () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness: water ? 0.24 : 0.92,
      metalness: water ? 0.45 : 0.03,
      flatShading: flat,
      transparent: water,
      opacity: water ? 0.9 : 1,
    }),
  );
}

/* ---------------------------------- ground -------------------------------- */

// A tile is a small mound of ground, not a cube: a rounded crown sitting on a
// slightly wider skirt so neighbouring tiles read as one landscape.
export function terrainPiece(width, depth, height, colorHex, { water = false, lump = 1 } = {}) {
  const group = new THREE.Group();
  const material = surfaceMaterial(colorHex, { water });

  const crown = new THREE.Mesh(
    geom('tile-crown', () => new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2)),
    material,
  );
  // Tall ground gets a rounded cap, not a stretched egg: the body carries the
  // height and the crown only softens the top edge.
  crown.scale.set(width * 0.52, Math.min(Math.max(0.004, height) * 0.8, width * 0.2) * lump, depth * 0.52);
  crown.position.y = 0;
  crown.receiveShadow = true;
  group.add(crown);

  const skirt = new THREE.Mesh(geom('tile-skirt', () => new THREE.CylinderGeometry(0.5, 0.54, 1, 10, 1, true)), material);
  skirt.scale.set(width, Math.max(0.008, height), depth);
  skirt.position.y = -Math.max(0.008, height) / 2;
  skirt.receiveShadow = true;
  group.add(skirt);

  return group;
}

/* ---------------------------------- trees --------------------------------- */

const TREE_LEAVES = ['#2f5a38', '#3b6b41', '#24462e', '#4a7a3f'];

export function tree({ scale = 1, seed = 1, pale = false } = {}) {
  const rand = (n) => hash2(seed * 977 + n, seed * 131 + n * 7);
  const group = new THREE.Group();
  const trunkMat = mat('trunk', () => new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 1 }));
  const barkMat = mat('bark', () => new THREE.MeshStandardMaterial({ color: 0x2e2114, roughness: 1 }));

  const height = (1.0 + rand(1) * 0.55) * scale;
  const radius = 0.13 * scale;
  const trunk = new THREE.Mesh(geom('trunk', () => new THREE.CylinderGeometry(0.08, 0.14, 1, 6)), trunkMat);
  trunk.scale.set(radius * 6, height, radius * 6);
  trunk.position.y = height / 2;
  trunk.castShadow = true;
  group.add(trunk);

  const branches = 3 + Math.floor(rand(2) * 3);
  for (let i = 0; i < branches; i++) {
    const branch = new THREE.Mesh(geom('branch', () => new THREE.CylinderGeometry(0.04, 0.07, 1, 5)), barkMat);
    const len = (0.34 + rand(3 + i) * 0.3) * scale;
    branch.scale.set(radius * 4, len, radius * 4);
    branch.position.y = height * (0.55 + i * 0.1);
    const angle = (i / branches) * Math.PI * 2 + rand(9) * 0.8;
    branch.rotation.set(Math.cos(angle) * 0.95, angle, Math.sin(angle) * 0.95);
    branch.position.x = Math.cos(angle) * len * 0.55;
    branch.position.z = Math.sin(angle) * len * 0.55;
    group.add(branch);
  }

  const leaves = 3 + Math.floor(rand(4) * 3);
  for (let i = 0; i < leaves; i++) {
    const color = pale ? '#5c7a45' : TREE_LEAVES[Math.floor(rand(20 + i) * TREE_LEAVES.length)];
    const leafMat = surfaceMaterial(color);
    const blob = new THREE.Mesh(geom('leaf', () => new THREE.IcosahedronGeometry(1, 0)), leafMat);
    const s = (0.26 + rand(30 + i) * 0.2) * scale;
    blob.scale.set(s, s * 0.82, s);
    const angle = (i / leaves) * Math.PI * 2 + rand(40 + i);
    const spread = 0.24 * scale * (0.4 + rand(50 + i));
    blob.position.set(
      Math.cos(angle) * spread,
      height * (0.72 + rand(60 + i) * 0.4),
      Math.sin(angle) * spread,
    );
    blob.castShadow = true;
    group.add(blob);
  }

  return group;
}

/* ---------------------------------- grass --------------------------------- */

export function grassStrands(count, radius, { color = '#2b4a2b', height = 1 } = {}) {
  const blade = geom('blade', () => {
    const g = new THREE.ConeGeometry(0.022, 1, 3);
    g.translate(0, 0.5, 0);
    return g;
  });
  const mesh = new THREE.InstancedMesh(blade, surfaceMaterial(color), count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = hash2(i * 13 + 1, i * 7 + 3) * Math.PI * 2;
    const r = Math.sqrt(hash2(i * 5 + 2, i * 11 + 5)) * radius;
    dummy.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    const h = (0.5 + hash2(i + 9, i + 21)) * height;
    dummy.scale.set(0.7 + hash2(i, i * 3) * 0.5, h * 1.15, 1);
    dummy.rotation.y = a;
    dummy.rotation.z = (hash2(i * 2, i * 17) - 0.5) * 0.5;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* ---------------------------------- water --------------------------------- */

export function waterSurface(width, depth, colorHex) {
  const material = surfaceMaterial(colorHex, { water: true });
  const surface = new THREE.Mesh(geom('water', () => new THREE.PlaneGeometry(1, 1, 1, 1)), material);
  surface.rotation.x = -Math.PI / 2;
  surface.scale.set(width, depth, 1);
  surface.position.y = 0.001;
  const ripples = [];
  const rippleMat = mat('ripple', () =>
    new THREE.MeshBasicMaterial({
      color: 0xcfe9f2,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const group = new THREE.Group();
  group.add(surface);
  for (let i = 0; i < 1; i++) {
    const ring = new THREE.Mesh(geom('ripple-mesh', () => new THREE.RingGeometry(0.28, 0.36, 20)), rippleMat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.set((hash2(i + 1, 7) - 0.5) * width * 0.5, 0.004, (hash2(i + 5, 3) - 0.5) * depth * 0.5);
    ring.scale.setScalar(width * 0.4);
    group.add(ring);
    ripples.push({ mesh: ring, phase: i * 1.7 + hash2(i, 2) * 2, base: width * 0.35 });
  }
  return { group, ripples };
}

/* --------------------------------- village -------------------------------- */

// A village is more than one block: houses spread over the settlement tile and
// its neighbours, and the people standing in it are a tenth of a house tall so
// the proportions read correctly.
export function villageCluster({ seed = 1, scale = 1, nationColor = '#c9a227', houses = 5 } = {}) {
  const group = new THREE.Group();
  const rand = (n) => hash2(seed * 613 + n, seed * 227 + n * 3);
  const wallMat = mat('walls', () => new THREE.MeshStandardMaterial({ color: 0xa38a63, roughness: 0.9 }));
  const roofMat = mat('roof', () => new THREE.MeshStandardMaterial({ color: 0x53331f, roughness: 0.95 }));
  const woodMat = mat('wood', () => new THREE.MeshStandardMaterial({ color: 0x5a3f24, roughness: 0.95 }));
  const skinMat = mat('skin', () => new THREE.MeshStandardMaterial({ color: 0xd6b48b, roughness: 0.85 }));
  const clothMat = mat('cloth', () => new THREE.MeshStandardMaterial({ color: new THREE.Color(nationColor), roughness: 0.9 }));

  const people = [];

  for (let i = 0; i < houses; i++) {
    const house = new THREE.Group();
    const w = (0.5 + rand(i) * 0.3) * scale;
    const d = (0.45 + rand(i + 20) * 0.3) * scale;
    const h = (0.42 + rand(i + 40) * 0.35) * scale;

    const walls = new THREE.Mesh(geom('house-walls', () => new THREE.BoxGeometry(1, 1, 1)), wallMat);
    walls.scale.set(w, h, d);
    walls.position.y = h / 2;
    walls.castShadow = true;
    house.add(walls);

    const roof = new THREE.Mesh(geom('house-roof', () => new THREE.ConeGeometry(0.78, 1, 4)), roofMat);
    roof.scale.set(w * 1.06, h * 0.72, d * 1.06);
    roof.position.y = h + h * 0.34;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    house.add(roof);

    if (rand(i + 60) > 0.45) {
      const door = new THREE.Mesh(geom('door', () => new THREE.BoxGeometry(1, 1, 0.05)), woodMat);
      door.scale.set(w * 0.26, h * 0.5, 0.04);
      door.position.set(0, h * 0.25, d / 2 + 0.01);
      house.add(door);
    }

    const angle = (i / houses) * Math.PI * 2 + rand(i + 80) * 0.7;
    const spread = scale * (0.42 + rand(i + 100) * 0.5);
    house.position.set(Math.cos(angle) * spread, 0, Math.sin(angle) * spread);
    house.rotation.y = angle + Math.PI / 2;
    group.add(house);

    // one person per house, a tenth of the building's height
    const personH = (h + h * 0.72) / 10;
    const person = new THREE.Group();
    const body = new THREE.Mesh(geom('person-body', () => new THREE.CapsuleGeometry(0.28, 0.9, 2, 6)), clothMat);
    body.scale.setScalar(personH / 1.4);
    body.position.y = personH * 0.55;
    const head = new THREE.Mesh(geom('person-head', () => new THREE.SphereGeometry(0.26, 8, 6)), skinMat);
    head.scale.setScalar(personH / 1.4);
    head.position.y = personH * 1.05;
    person.add(body, head);
    person.position.set(Math.cos(angle + 0.6) * spread * 1.15, 0, Math.sin(angle + 0.6) * spread * 1.15);
    group.add(person);
    people.push({ group: person, phase: rand(i + 120) * 6, base: person.position.clone() });
  }

  const banner = new THREE.Mesh(geom('banner-pole', () => new THREE.CylinderGeometry(0.02, 0.02, 1, 5)), woodMat);
  banner.scale.set(scale, scale * 1.6, scale);
  banner.position.set(0, scale * 0.8, 0);
  group.add(banner);
  const flag = new THREE.Mesh(
    geom('banner-flag', () => new THREE.PlaneGeometry(0.32, 0.2)),
    surfaceMaterial(nationColor),
  );
  flag.scale.setScalar(scale * 0.9);
  flag.position.set(scale * 0.22, scale * 1.3, 0);
  flag.material.side = THREE.DoubleSide;
  group.add(flag);

  return { group, people };
}
