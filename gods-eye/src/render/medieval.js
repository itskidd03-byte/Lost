// Villages on the board, built from Kenney's retro medieval kit: modular one
// unit pieces (walls, doorways, roofs, towers, fences) baked into a handful of
// house shapes so each cottage is a single draw call once merged.
//
// The people standing around them come from the medieval people pack — see
// people.js.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { personModel, peopleReady } from './people.js';

// Kenney's kit points its materials at external atlases by file name. Loading
// them ourselves keeps the retro pixel look (nearest filtering) and lets the
// pieces take the scene's light instead of the unlit shader the GLBs ship with.
const ATLAS = {
  stones: 'cobblestone',
  bricks: 'cobblestoneAlternative',
  painted: 'cobblestonePainted',
  details: 'details',
  planks: 'planks',
  roof: 'roof',
  barrel: 'barrel',
  fence: 'fence',
  tree: 'tree',
  water: 'water',
};

const atlasTextures = new Map();
const texLoader = new THREE.TextureLoader();

function atlasFor(materialName) {
  const file = ATLAS[String(materialName).toLowerCase()];
  if (!file) return null;
  let texture = atlasTextures.get(file);
  if (!texture) {
    texture = texLoader.load(`${import.meta.env.BASE_URL}models/medieval/Textures/${file}.png`);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapLinearFilter;
    atlasTextures.set(file, texture);
  }
  return texture;
}

function litMaterial(name) {
  const key = `kit|${name}`;
  let material = litMaterials.get(key);
  if (material) return material;
  const map = atlasFor(name);
  material = new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 0.88, metalness: 0 });
  material.name = name;
  litMaterials.set(key, material);
  return material;
}

const litMaterials = new Map();

const PIECES = [
  'wall', 'wall-door', 'wall-window', 'roof', 'roof-side', 'roof-corner',
  'floor-flat', 'fence', 'fence-wood', 'detail-crate', 'barrels', 'tree-large',
  'stairs-stone', 'structure',
];

// Each variant is a list of pieces with where they sit, in kit units (1 = one
// modular cell). Houses are one cell wide and two tall, which at table scale is
// a cottage you can read at a glance.
const VARIANTS = [
  { name: 'cottage', parts: [
    { piece: 'floor-flat', x: 0, z: 0, y: 0 },
    { piece: 'wall-door', x: 0, z: 0, y: 0.02, ry: Math.PI / 2 },
    { piece: 'roof', x: 0, z: 0, y: 1.0 },
  ] },
  { name: 'house', parts: [
    { piece: 'floor-flat', x: 0, z: 0, y: 0 },
    { piece: 'wall-window', x: 0, z: 0, y: 0.02 },
    { piece: 'roof', x: 0, z: 0, y: 1.0, ry: Math.PI / 2 },
  ] },
  { name: 'hall', parts: [
    { piece: 'floor-flat', x: 0, z: 0, y: 0 },
    { piece: 'wall', x: 0, z: 0, y: 0.02 },
    { piece: 'wall-door', x: 0, z: 0, y: 1.0, ry: Math.PI },
    { piece: 'roof-side', x: 0, z: 0, y: 2.0 },
  ] },
  { name: 'tower', parts: [
    { piece: 'floor-flat', x: 0, z: 0, y: 0 },
    { piece: 'wall', x: 0, z: 0, y: 0.02 },
    { piece: 'wall-window', x: 0, z: 0, y: 1.0 },
    { piece: 'roof-corner', x: 0, z: 0, y: 2.0 },
  ] },
];

const Dressing = [
  { piece: 'barrels', y: 0 },
  { piece: 'detail-crate', y: 0 },
  { piece: 'fence', y: 0 },
  { piece: 'tree-large', y: 0 },
];

const models = new Map();
const templates = [];
const dressing = [];
const waiting = [];
let started = null;
let ready = false;
let kitTexture = null;

function hash(n) {
  const x = Math.sin(n * 113.7) * 43758.5453;
  return x - Math.floor(x);
}

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Pieces from the kit do not all carry the same vertex attributes, and merged
// geometry needs identical ones. Keep the three the atlas needs and drop the
// rest; anything missing a UV gets a flat one.
function tidy(geometry) {
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name);
  }
  geometry.morphAttributes = {};
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  if (!geometry.getAttribute('uv')) {
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return geometry;
}

// Bake a variant's pieces into one mesh per material: the kit uses a shared
// atlas, so a whole cottage ends up as two or three meshes instead of ten.
function bake(parts) {
  const byMaterial = new Map();
  for (const part of parts) {
    const source = models.get(part.piece);
    if (!source) continue;
    const holder = new THREE.Object3D();
    holder.position.set(part.x || 0, part.y || 0, part.z || 0);
    holder.rotation.y = part.ry || 0;
    const clone = source.clone(true);
    holder.add(clone);
    holder.updateMatrixWorld(true);
    clone.traverse((obj) => {
      if (!obj.isMesh) return;
      const geometry = tidy(obj.geometry.clone().applyMatrix4(obj.matrixWorld));
      const material = obj.material;
      if (!byMaterial.has(material)) byMaterial.set(material, []);
      byMaterial.get(material).push(geometry);
    });
  }
  const meshes = [];
  for (const [material, geometries] of byMaterial) {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((geo) => geo.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  return meshes;
}

export function loadMedievalModels() {
  if (started) return started;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const base = `${import.meta.env.BASE_URL}models/medieval/`;
  started = Promise.all(
    PIECES.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`${base}${name}.glb`);
                  gltf.scene.traverse((obj) => {
          if (!obj.isMesh) return;
          obj.castShadow = true;
          obj.receiveShadow = true;
          obj.material = litMaterial(obj.material?.name || 'stones');
          if (obj.material.map && !kitTexture) kitTexture = obj.material.map;
        });
        models.set(name, gltf.scene);
      } catch (err) {
        console.warn(`[godseye] medieval piece ${name} did not load`, err);
      }
    }),
  ).then(() => {
    for (const variant of VARIANTS) {
      const meshes = bake(variant.parts);
      if (meshes.length) templates.push({ name: variant.name, meshes, parts: variant.parts.length });
    }
    for (const item of Dressing) {
      const scene = models.get(item.piece);
      if (scene) dressing.push({ piece: item.piece, scene });
    }
    ready = templates.length > 0;
    if (!ready) console.warn('[godseye] medieval kit produced no house shapes');
    for (const cb of waiting.splice(0)) {
      try {
        cb();
      } catch (err) {
        console.warn('[godseye] medieval swap failed', err);
      }
    }
    return templates;
  });
  return started;
}

export function medievalReady() {
  return ready;
}

export function onMedievalReady(cb) {
  if (ready) cb();
  else waiting.push(cb);
}

function instantiate(template) {
  const group = new THREE.Group();
  for (const mesh of template.meshes) {
    const copy = new THREE.Mesh(mesh.geometry, mesh.material);
    copy.castShadow = true;
    copy.receiveShadow = true;
    group.add(copy);
  }
  group.userData.variant = template.name;
  group.userData.parts = template.parts;
  return group;
}

// A settlement on the table: a ring of cottages facing outwards, a tower for
// the bigger ones, a few fences and barrels, and its people walking about.
export function medievalVillage({ seed = 1, scale = 1, nationColor = '#c9a227', houses = 5 } = {}) {
  const group = new THREE.Group();
  const people = [];
  if (!ready) return { group, people };

  // one kit cell is about a house wide on the board
  const cell = scale * 0.6;
  const count = Math.max(1, Math.min(7, houses));

  for (let i = 0; i < count; i++) {
    const rand = (n) => hash2(seed * 31 + i * 7 + n, seed * 17 - i * 3 + n * 11);
    const slot = templates[Math.floor(rand(1) * templates.length) % templates.length];
    const house = instantiate(slot);
    house.scale.setScalar(cell);
    const angle = (i / count) * Math.PI * 2 + rand(2) * 0.6;
    const spread = scale * (0.42 + rand(3) * 0.5);
    house.position.set(Math.cos(angle) * spread, 0, Math.sin(angle) * spread);
    house.rotation.y = -angle + Math.PI / 2;
    group.add(house);

    // its household, standing a tenth of the house tall, as before
    if (peopleReady()) {
      // A person is scaled up from true size: on a board this small the real
      // ratio turns villagers into three-pixel specks, so they stand about a
      // house tall — miniature rules, not realism.
      const height = cell * 1.05;
      const person = personModel({ seed: seed * 13 + i * 5, height });
      if (person) {
        const px = Math.cos(angle + 0.5) * spread * 1.45;
        const pz = Math.sin(angle + 0.5) * spread * 1.45;
        person.root.position.set(px, 0, pz);
        group.add(person.root);
        people.push({
          group: person.root,
          model: person,
          phase: rand(4) * 6,
          base: person.root.position.clone(),
          speed: 0.5 + rand(5) * 0.7,
        });
      }
    }
  }

  // dressing: fences at the edge, crates and barrels beside the houses
  const extras = Math.min(4, 1 + Math.floor(seed % 3));
  for (let i = 0; i < extras && dressing.length; i++) {
    const rand = (n) => hash2(seed * 53 + i * 11 + n, seed * 29 + i * 5 + n);
    const item = dressing[Math.floor(rand(1) * dressing.length) % dressing.length];
    const piece = item.scene.clone(true);
    piece.scale.setScalar(cell * (item.piece === 'fence' ? 0.8 : 0.55));
    const angle = rand(2) * Math.PI * 2;
    const spread = scale * (0.55 + rand(3) * 0.55);
    piece.position.set(Math.cos(angle) * spread, 0, Math.sin(angle) * spread);
    piece.rotation.y = angle;
    group.add(piece);
  }

  // the nation's banner in the middle of the village
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1, 5),
    new THREE.MeshStandardMaterial({ color: 0x5a3f24, roughness: 0.95 }),
  );
  pole.scale.set(scale, scale * 1.8, scale);
  pole.position.set(0, scale * 0.9, 0);
  group.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.2),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(nationColor), roughness: 0.9, side: THREE.DoubleSide }),
  );
  flag.scale.setScalar(scale * 0.9);
  flag.position.set(scale * 0.22, scale * 1.5, 0);
  group.add(flag);

  return { group, people };
}

