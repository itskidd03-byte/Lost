// Trees, bushes and rocks from the Stylized Nature MegaKit (CC0, Quaternius).
// Loaded once at boot, then cloned wherever the painted trees used to stand.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const TREES = [
  'CommonTree_1',
  'CommonTree_2',
  'CommonTree_3',
  'CommonTree_4',
  'Pine_1',
  'Pine_3',
  'TwistedTree_1',
  'TwistedTree_2',
  'DeadTree_1',
];

const PROPS = ['Bush_Common', 'Bush_Common_Flowers', 'Rock_Medium_1', 'Rock_Medium_2'];

const models = new Map();
let started = null;
let ready = false;
const waiting = [];

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function loadNatureModels() {
  if (started) return started;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const base = `${import.meta.env.BASE_URL}models/nature/`;
  started = Promise.all(
    [...TREES, ...PROPS].map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`${base}${name}.glb`);
        gltf.scene.traverse((obj) => {
          if (!obj.isMesh) return;
          obj.castShadow = true;
          obj.receiveShadow = true;
        });
        models.set(name, gltf.scene);
      } catch (err) {
        console.warn(`[godseye] nature model ${name} did not load`, err);
      }
    }),
  ).then(() => {
    // only now is the whole set in memory: a half-filled map used to report
    // ready while every tree was still missing
    ready = true;
    for (const cb of waiting.splice(0)) {
      try {
        cb();
      } catch (err) {
        console.warn('[godseye] nature swap failed', err);
      }
    }
    return models;
  });
  return started;
}

export function natureReady() {
  return ready;
}

// Called once the whole pack is in memory, whether that happened before or
// after the region was built.
export function onNatureReady(cb) {
  if (ready) cb();
  else waiting.push(cb);
}

// One tree, cloned and scaled so it stands about as tall as the painted one
// it replaces, with its roots on y = 0.
export function natureTree({ scale = 1, seed = 1 } = {}) {
  if (!models.size) return null;
  const name = TREES[Math.floor(hash(seed * 3.7) * TREES.length) % TREES.length];
  const source = models.get(name);
  if (!source) return null;
  const object = source.clone(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  if (!size.y) return null;
  object.scale.setScalar((1.9 * scale) / size.y);
  box.setFromObject(object);
  object.position.y -= box.min.y;
  const group = new THREE.Group();
  group.add(object);
  group.rotation.y = hash(seed * 11.3) * Math.PI * 2;
  return group;
}

// Any tree the world drew before the models arrived is swapped in place, so a
// region built during loading still ends up with real trees.
export function swapNatureTrees(root) {
  if (!ready) return 0;
  const targets = [];
  root.traverse((obj) => {
    const spec = obj.userData?.treeSpec;
    if (spec && !spec.modelled) targets.push(obj);
  });
  let swapped = 0;
  for (const group of targets) {
    const spec = group.userData.treeSpec;
    const fresh = natureTree(spec);
    if (!fresh) continue;
    for (const child of [...group.children]) group.remove(child);
    while (fresh.children.length) group.add(fresh.children[0]);
    group.userData.treeSpec = { ...spec, modelled: true };
    swapped += 1;
  }
  return swapped;
}
