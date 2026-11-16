// The people on the board: peasants, townsfolk and a royal pair from the free
// medieval 3D people pack. They arrive as rigged skinned meshes, so a few bones
// swung by hand is enough to make a village look like it is working.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const NAMES = [
  'peasant_1', 'peasant_2', 'peasant_3', 'peasant_4',
  'city_dwellers_1', 'city_dwellers_2', 'king', 'queen',
];

const models = new Map();
const waiting = [];
let started = null;
let ready = false;

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function loadPeopleModels() {
  if (started) return started;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const base = `${import.meta.env.BASE_URL}models/people/`;
  started = Promise.all(
    NAMES.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`${base}${name}.glb`);
        gltf.scene.traverse((obj) => {
          if (!obj.isMesh) return;
          obj.castShadow = true;
          obj.frustumCulled = false;
          // The exporter writes an empty colour attribute, which three turns
          // into vertex colours and multiplies the atlas away — a black person.
          if (obj.geometry.getAttribute('color')) obj.geometry.deleteAttribute('color');
          if (obj.material) {
            obj.material.vertexColors = false;
            obj.material.needsUpdate = true;
          }
        });
        const box = new THREE.Box3().setFromObject(gltf.scene);
        models.set(name, { scene: gltf.scene, height: box.getSize(new THREE.Vector3()).y || 1 });
      } catch (err) {
        console.warn(`[godseye] person ${name} did not load`, err);
      }
    }),
  ).then(() => {
    ready = true;
    for (const cb of waiting.splice(0)) {
      try {
        cb();
      } catch (err) {
        console.warn('[godseye] people swap failed', err);
      }
    }
    return models;
  });
  return started;
}

export function peopleReady() {
  return ready;
}

export function onPeopleReady(cb) {
  if (ready) cb();
  else waiting.push(cb);
}

const DRIVEN = ['Thigh_L', 'Thigh_R', 'Calf_L', 'Calf_R', 'Upperarm_L', 'Upperarm_R', 'Lowerarm_L', 'Lowerarm_R', 'Spine_02'];

// One villager, cloned from whichever model the seed lands on and scaled so it
// stands `height` tall on the board.
export function personModel({ seed = 1, height = 0.03 } = {}) {
  if (!models.size) return null;
  const names = [...models.keys()];
  const name = names[Math.floor(hash(seed * 7.3) * names.length) % names.length];
  const source = models.get(name);
  const root = skeletonClone(source.scene);
  root.scale.setScalar(height / source.height);
  root.rotation.y = hash(seed * 3.1) * Math.PI * 2;
  root.updateMatrixWorld(true);

  // Bones are not aligned to the world: an FBX rig points a bone's own Y down
  // the limb. Convert the two axes we animate (forward swing and sideways) into
  // each bone's local frame once, instead of guessing at rotation order.
  const bones = new Map();
  const world = new THREE.Quaternion();
  const inverse = new THREE.Quaternion();
  const axisX = new THREE.Vector3();
  const axisZ = new THREE.Vector3();
  root.traverse((obj) => {
    if (!obj.isBone || !DRIVEN.includes(obj.name)) return;
    obj.getWorldQuaternion(world);
    inverse.copy(world).invert();
    axisX.set(1, 0, 0).applyQuaternion(inverse).normalize();
    axisZ.set(0, 0, 1).applyQuaternion(inverse).normalize();
    bones.set(obj.name, {
      bone: obj,
      base: obj.quaternion.clone(),
      axisX: axisX.clone(),
      axisZ: axisZ.clone(),
    });
  });
  return { root, bones, name, height };
}

const swing = new THREE.Quaternion();
const rest = new THREE.Quaternion();

// A walk made of bone swings: thighs and arms counter each other, knees bend on
// the back half of the stride. speed 0 leaves them standing with a small breath.
//
// The pack ships in a T-pose, so the arms are also brought down to the sides as
// part of the pose — otherwise every idle villager stands with their arms out.
export function walkPerson(model, time, speed = 1) {
  if (!model?.bones.size) return;
  const stride = time * (4.2 + speed * 1.6);
  const moving = Math.min(1, speed + 0.15);
  for (const [name, entry] of model.bones) {
    const left = name.endsWith('_L');
    const phase = left ? 0 : Math.PI;
    let angle = 0;
    let droop = 0;
    if (name.startsWith('Thigh')) angle = Math.sin(stride + phase) * 0.52 * moving;
    else if (name.startsWith('Calf')) angle = Math.max(0, -Math.sin(stride + phase)) * 0.6 * moving;
    else if (name.startsWith('Upperarm')) {
      angle = Math.sin(stride + phase + Math.PI) * 0.42 * moving;
      droop = left ? 1.18 : -1.18;
    } else if (name.startsWith('Lowerarm')) angle = 0.2 + Math.sin(stride + phase) * 0.12;
    else if (name === 'Spine_02') angle = Math.sin(stride * 2) * 0.03;
    if (!angle && !droop) {
      entry.bone.quaternion.copy(entry.base);
      continue;
    }
    entry.bone.quaternion.copy(entry.base);
    if (droop) {
      rest.setFromAxisAngle(entry.axisZ, droop);
      entry.bone.quaternion.multiply(rest);
    }
    if (angle) {
      swing.setFromAxisAngle(entry.axisX, angle);
      entry.bone.quaternion.multiply(swing);
    }
  }
}
