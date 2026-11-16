// Low-poly buildings from the Quaternius pack the graphics folder holds (CC0).
// They are loaded once, kept in memory, and cloned into every town so a house
// is a real modelled building instead of a painted box.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FILES = {
  home_a: 'building_home_A_blue.glb',
  home_b: 'building_home_B_blue.glb',
  building_a: 'building_A.glb',
  building_b: 'building_B.glb',
  market: 'building_market_blue.glb',
  blacksmith: 'building_blacksmith_blue.glb',
  church: 'building_church_blue.glb',
  windmill: 'building_windmill_blue.glb',
  watermill: 'building_watermill_blue.glb',
  barracks: 'building_barracks_blue.glb',
  tower_a: 'building_tower_A_blue.glb',
  tower_b: 'building_tower_B_blue.glb',
  castle: 'building_castle_blue.glb',
  archery: 'building_archeryrange_blue.glb',
  mine: 'building_mine_blue.glb',
  ruined: 'building_destroyed.glb',
};

// Which way each model's door already points, as an extra quarter turn so the
// town can rotate every house to face its square.
const TURN = {
  home_a: Math.PI,
  home_b: Math.PI,
  building_a: 0,
  building_b: 0,
  market: Math.PI,
  blacksmith: Math.PI,
  church: 0,
  windmill: 0,
  watermill: 0,
  barracks: Math.PI,
  tower_a: 0,
  tower_b: 0,
  castle: 0,
  archery: Math.PI,
  mine: Math.PI,
  ruined: Math.PI,
};

const models = new Map();
let started = null;

export function townModels() {
  return models.size ? models : null;
}

export function loadTownModels() {
  if (started) return started;
  const loader = new GLTFLoader();
  const base = `${import.meta.env.BASE_URL}models/`;
  started = Promise.all(
    Object.entries(FILES).map(async ([name, file]) => {
      try {
        const gltf = await loader.loadAsync(base + file);
        const scene = gltf.scene;
        scene.traverse((obj) => {
          if (!obj.isMesh) return;
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (obj.material) obj.material.side = THREE.FrontSide;
        });
        models.set(name, scene);
      } catch (err) {
        console.warn(`[godseye] building model ${file} did not load`, err);
      }
    }),
  ).then(() => models);
  return started;
}

// Clone a model, scale it to the height the town wants, plant it on y = 0 and
// keep its footprint inside the plot it was given.
export function buildingModel(name, height, maxWidth) {
  const source = models.get(name);
  if (!source) return null;
  const object = source.clone(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  if (!size.y || !size.x || !size.z) return null;
  let scale = height / size.y;
  scale = Math.min(scale, maxWidth / size.x, maxWidth / size.z);
  object.scale.setScalar(scale);
  box.setFromObject(object);
  object.position.y -= box.min.y;

  const group = new THREE.Group();
  group.add(object);
  group.rotation.y = TURN[name] || 0;
  group.userData.height = size.y * scale;
  return group;
}
