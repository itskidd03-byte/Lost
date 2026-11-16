// Decorating the room: furniture you place yourself.
//
// The catalogue is procedural — a table, a chair, a lamp, a statue and a fern —
// so the room can be furnished without shipping more assets. Everything is
// saved in local storage and restored on load, and every piece leaves a blocker
// behind so you cannot walk through what you set down.

import * as THREE from 'three';

const KEY = 'gods-eye-decor';

function oakTexture() {
  const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/furniture/table-top.jpg`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.6, 1.2);
  return tex;
}

let materials = null;

function mats() {
  if (materials) return materials;
  const oak = new THREE.MeshStandardMaterial({ map: oakTexture(), color: 0xe6d3b8, roughness: 0.72 });
  const darkOak = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.8 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 0.95 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.6, roughness: 0.42 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x6e3b32, roughness: 0.9 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3f6b3c, roughness: 0.9 });
  const shade = new THREE.MeshStandardMaterial({
    color: 0x3c2c1c, emissive: 0xffb15e, emissiveIntensity: 0.9, roughness: 0.7, side: THREE.DoubleSide,
  });
  materials = { oak, darkOak, stone, bronze, cloth, leaf, shade };
  return materials;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(rt, rb, h, mat, seg = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const BUILDERS = {
  table() {
    const m = mats();
    const group = new THREE.Group();
    const top = box(1.0, 0.07, 0.68, m.oak, 0, 0.73, 0);
    group.add(top);
    for (const [x, z] of [[-0.42, -0.26], [0.42, -0.26], [-0.42, 0.26], [0.42, 0.26]]) {
      const leg = box(0.07, 0.7, 0.07, m.darkOak, x, 0.35, z);
      group.add(leg);
    }
    return { group, radius: 0.62 };
  },

  chair() {
    const m = mats();
    const group = new THREE.Group();
    group.add(box(0.48, 0.07, 0.46, m.oak, 0, 0.45, 0));
    group.add(box(0.48, 0.5, 0.06, m.oak, 0, 0.72, -0.21));
    group.add(box(0.4, 0.06, 0.4, m.cloth, 0, 0.5, 0.01));
    for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
      group.add(box(0.05, 0.45, 0.05, m.darkOak, x, 0.22, z));
    }
    return { group, radius: 0.34 };
  },

  lamp() {
    const m = mats();
    const group = new THREE.Group();
    const base = cylinder(0.16, 0.2, 0.05, m.bronze, 16);
    base.position.y = 0.03;
    const pole = cylinder(0.025, 0.025, 1.45, m.bronze, 8);
    pole.position.y = 0.75;
    const cup = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.24, 14, 1, true), m.shade);
    cup.position.y = 1.52;
    cup.rotation.z = Math.PI;
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xfff2d6, emissive: 0xffc078, emissiveIntensity: 2 }),
    );
    bulb.position.y = 1.44;
    const light = new THREE.PointLight(0xffb266, 3.2, 5.2, 2);
    light.position.y = 1.42;
    group.add(base, pole, cup, bulb, light);
    return { group, radius: 0.3 };
  },

  statue() {
    const m = mats();
    const group = new THREE.Group();
    group.add(box(0.44, 0.22, 0.44, m.stone, 0, 0.11, 0));
    group.add(box(0.3, 0.08, 0.3, m.stone, 0, 0.25, 0));
    const torso = cylinder(0.1, 0.16, 0.5, m.stone, 10);
    torso.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), m.stone);
    head.position.y = 0.86;
    head.castShadow = true;
    const arm = cylinder(0.035, 0.035, 0.34, m.stone, 6);
    arm.position.set(0.14, 0.66, 0.03);
    arm.rotation.z = 0.6;
    group.add(torso, head, arm);
    return { group, radius: 0.3 };
  },

  fern() {
    const m = mats();
    const group = new THREE.Group();
    const pot = cylinder(0.16, 0.11, 0.26, m.cloth, 12);
    pot.position.y = 0.13;
    group.add(pot);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), m.leaf);
      const a = (i / 5) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.11, 0.36 + (i % 2) * 0.07, Math.sin(a) * 0.11);
      leaf.scale.set(1, 0.7, 1);
      leaf.castShadow = true;
      group.add(leaf);
    }
    return { group, radius: 0.24 };
  },
};

export const DECOR_PROPS = [
  { id: 'table', label: 'Table' },
  { id: 'chair', label: 'Chair' },
  { id: 'lamp', label: 'Lamp' },
  { id: 'statue', label: 'Statue' },
  { id: 'fern', label: 'Fern' },
];

export class Decor {
  constructor() {
    this.items = [];
  }

  add(root, blockers, kind, x, z, yaw = 0, save = true) {
    const builder = BUILDERS[kind];
    if (!builder) return null;
    const { group, radius } = builder();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    root.add(group);
    const item = { kind, x, z, yaw, group, radius };
    const blocker = {
      minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius,
    };
    blockers.push(blocker);
    item.blocker = blocker;
    this.items.push(item);
    if (save) this.save();
    return item;
  }

  // Whatever is under the cursor, within reach of the point tapped.
  nearest(x, z, maxDist = 0.7) {
    let best = null;
    let bestD = maxDist;
    for (const item of [...this.items].reverse()) {
      const d = Math.hypot(item.x - x, item.z - z);
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best;
  }

  remove(root, blockers, item) {
    if (!item) return false;
    root.remove(item.group);
    item.group.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
    const index = blockers.indexOf(item.blocker);
    if (index >= 0) blockers.splice(index, 1);
    this.items = this.items.filter((i) => i !== item);
    this.save();
    return true;
  }

  clear(root, blockers) {
    for (const item of [...this.items]) this.remove(root, blockers, item);
    this.save();
  }

  save() {
    try {
      const data = this.items.map((i) => ({ kind: i.kind, x: +i.x.toFixed(2), z: +i.z.toFixed(2), yaw: +i.yaw.toFixed(2) }));
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* private mode: the room just will not remember */
    }
  }

  load(root, blockers) {
    let data = [];
    try {
      data = JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch {
      data = [];
    }
    if (!Array.isArray(data)) return;
    for (const entry of data) {
      if (!entry || !BUILDERS[entry.kind]) continue;
      this.add(root, blockers, entry.kind, entry.x, entry.z, entry.yaw || 0, false);
    }
  }
}
