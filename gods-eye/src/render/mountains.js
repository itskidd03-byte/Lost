// The peaks on the board and in the world come from one design: the modular
// terrain pack's Mountain_1 to Mountain_4, loaded from the shared file and
// textured here so both views show the same rock.
//
// Each model is normalised once (base at y = 0, one unit tall, footprint
// measured) and every peak is a copy with its own height colours: grey stone at
// the foot, paler rock up the face, snow on the summit when the tile calls for it.

import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mountainRockTexture } from './surfaces.js';

const FILES = ['Mountain_1.obj', 'Mountain_2.obj', 'Mountain_3.obj', 'Mountain_4.obj'];

const shapes = [];
let started = null;
let ready = false;
let material = null;

export function mountainModels() {
  return ready ? shapes : null;
}

export function loadMountainModels() {
  if (started) return started;
  const loader = new OBJLoader();
  const base = `${import.meta.env.BASE_URL}models/terrain/`;
  started = Promise.all(
    FILES.map(async (file, index) => {
      try {
        const object = await loader.loadAsync(base + file);
        let source = null;
        object.traverse((child) => {
          if (!source && child.isMesh) source = child.geometry;
        });
        if (!source) return;
        const geo = source.clone();
        geo.computeBoundingBox();
        const box = geo.boundingBox;
        const height = Math.max(0.0001, box.max.y - box.min.y);
        geo.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
        geo.scale(1 / height, 1 / height, 1 / height);
        geo.computeBoundingBox();
        const wide = Math.max(geo.boundingBox.max.x - geo.boundingBox.min.x, 0.0001);
        const deep = Math.max(geo.boundingBox.max.z - geo.boundingBox.min.z, 0.0001);
        geo.userData.footprint = { x: wide, z: deep };
        geo.computeVertexNormals();
        shapes[index] = geo;
      } catch (err) {
        console.warn(`[godseye] mountain model ${file} did not load`, err);
      }
    }),
  ).then(() => {
    ready = shapes.some(Boolean);
    return shapes;
  });
  return started;
}

function stoneMaterial() {
  if (material) return material;
  material = new THREE.MeshStandardMaterial({
    map: mountainRockTexture(),
    vertexColors: true,
    flatShading: true,
    roughness: 0.94,
    metalness: 0.02,
    emissive: new THREE.Color('#2b3a43'),
    emissiveIntensity: 0.5,
  });
  return material;
}

const FOOT = new THREE.Color('#8b959b');
const FACE = new THREE.Color('#aab4b9');
const HIGH = new THREE.Color('#d4dbde');
const SNOW = new THREE.Color('#eef2f5');

function tintByHeight(geometry, snow) {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const y = THREE.MathUtils.clamp(position.getY(i), 0, 1.15);
    color.copy(FOOT).lerp(FACE, Math.min(1, y * 1.5));
    if (y > 0.45) color.lerp(HIGH, Math.min(1, (y - 0.45) / 0.5) * 0.6);
    if (snow && y > 0.66) color.lerp(SNOW, Math.min(1, (y - 0.66) / 0.24));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A single peak: `height` and `width` are in world units. Returns null until the
// shared models have landed, so callers can keep their painted stand-in.
export function peak({ height = 1, width = null, seed = 1, snow = true } = {}) {
  if (!ready) return null;
  const shape = shapes[seed % shapes.length] || shapes.find(Boolean);
  if (!shape) return null;
  const geometry = tintByHeight(shape.clone(), snow);
  const mesh = new THREE.Mesh(geometry, stoneMaterial());
  const foot = shape.userData.footprint;
  const target = width ?? height * 0.9;
  mesh.scale.set(target / foot.x, height, target / foot.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
