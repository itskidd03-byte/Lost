// Wildlife on the board. Eight animals from the Everything Library animals
// pack stand in for the box-and-cone critters: cattle, sheep, goats, deer,
// horses, foxes, chickens and ducks.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const FILES = {
  cow: 'BrownCow',
  sheep: 'Sheep',
  deer: 'Deer',
  fox: 'RedFox',
  chicken: 'Chicken',
  horse: 'ChestnutHorse',
  goat: 'Goat',
  duck: 'PekinDuck',
};

const models = new Map();
const waiting = [];
let started = null;
let ready = false;

export function loadCreatureModels() {
  if (started) return started;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const base = `${import.meta.env.BASE_URL}models/animals/`;
  started = Promise.all(
    Object.entries(FILES).map(async ([kind, file]) => {
      try {
        const gltf = await loader.loadAsync(`${base}${file}.glb`);
        gltf.scene.traverse((obj) => {
          if (!obj.isMesh) return;
          obj.castShadow = true;
          obj.receiveShadow = true;
          // the pack paints each animal with vertex colours; the exporter's
          // material is a plain red one, so trust the colours in the mesh
          if (obj.geometry.getAttribute('color')) {
            obj.material = obj.material.clone();
            obj.material.vertexColors = true;
            obj.material.color.set(0xffffff);
            obj.material.needsUpdate = true;
          }
        });
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        models.set(kind, { scene: gltf.scene, height: size.y || 1, length: size.z || size.x || 1 });
      } catch (err) {
        console.warn(`[godseye] animal ${file} did not load`, err);
      }
    }),
  ).then(() => {
    ready = models.size > 0;
    for (const cb of waiting.splice(0)) {
      try {
        cb();
      } catch (err) {
        console.warn('[godseye] creature swap failed', err);
      }
    }
    return models;
  });
  return started;
}

export function creaturesReady() {
  return ready;
}

export function onCreaturesReady(cb) {
  if (ready) cb();
  else waiting.push(cb);
}

function hash(n) {
  const x = Math.sin(n * 151.3) * 43758.5453;
  return x - Math.floor(x);
}

// One animal, scaled so it stands `height` tall with its hooves on y = 0.
export function creatureModel({ kind = 'deer', height = 0.05, seed = 1 } = {}) {
  const source = models.get(kind) || models.get('deer');
  if (!source) return null;
  const group = new THREE.Group();
  const body = source.scene.clone(true);
  const scale = height / source.height;
  body.scale.setScalar(scale);
  const box = new THREE.Box3().setFromObject(body);
  body.position.y -= box.min.y;
  group.add(body);
  group.rotation.y = hash(seed * 5.7) * Math.PI * 2;
  return { group, kind, height, body };
}
