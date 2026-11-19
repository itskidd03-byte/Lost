// Water, painted once and shared by the table and the world you walk through.
//
// The sheet is a mix of deep blue and pale blue bands, so a river reads as water
// at a glance on a board only a forearm wide. Every body gets its own copy of the
// texture so each current can run at its own speed and direction, and a runner
// advances the offsets a frame at a time.

import * as THREE from 'three';

let waterMap = null;

export function waterTexture() {
  if (waterMap) return waterMap;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // deep water, with the paler colour of a moving current laid over it in bands
  ctx.fillStyle = '#2a7ba2';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 7; i++) {
    const y = (i / 7) * size;
    const grad = ctx.createLinearGradient(0, y, 0, y + size / 7);
    grad.addColorStop(0, 'rgba(48, 136, 172, 0.5)');
    grad.addColorStop(0.45, 'rgba(126, 206, 228, 0.62)');
    grad.addColorStop(1, 'rgba(40, 116, 152, 0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, size, size / 7 + 1);
  }

  // dark troughs between the currents
  for (let i = 0; i < 6; i++) {
    const y = (i / 6) * size + 6;
    ctx.strokeStyle = 'rgba(10, 52, 76, 0.34)';
    ctx.lineWidth = 2 + (i % 2);
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 8) {
      ctx.lineTo(x, y + Math.sin((x / size) * Math.PI * 2 + i) * 2.4);
    }
    ctx.stroke();
  }

  // pale streaks: the surface itself moving
  for (let i = 0; i < 26; i++) {
    const y = (i / 26) * size + (Math.random() - 0.5) * 3;
    const light = i % 3 === 0;
    ctx.strokeStyle = light ? 'rgba(206, 240, 249, 0.42)' : 'rgba(150, 216, 234, 0.30)';
    ctx.lineWidth = light ? 1.6 : 1;
    const bend = (Math.random() - 0.5) * 2.6;
    ctx.beginPath();
    ctx.moveTo(-4, y);
    for (let x = 0; x <= size + 4; x += 10) {
      ctx.lineTo(x, y + Math.sin((x / size) * Math.PI * 3 + i * 0.7) * bend);
    }
    ctx.stroke();
  }

  // a few flecks of foam, brightest along the middle of the current
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = `rgba(214, 240, 246, ${0.10 + Math.random() * 0.18})`;
    ctx.fillRect(x, y, 1.6 + Math.random() * 2.4, 1);
  }

  waterMap = new THREE.CanvasTexture(canvas);
  waterMap.wrapS = THREE.RepeatWrapping;
  waterMap.wrapT = THREE.RepeatWrapping;
  waterMap.colorSpace = THREE.SRGBColorSpace;
  waterMap.repeat.set(1, 1);
  waterMap.anisotropy = 8;
  return waterMap;
}

// A normal sheet read straight out of the water's own luminance, so the ripple
// you see, the ripple the sun catches and the ripple that moves are the same
// ripple. Without it the surface is a painted colour that never answers the
// light; with it every crest throws a highlight that travels with the current.
let waterNormal = null;

function waterNormalTexture() {
  if (waterNormal) return waterNormal;
  const source = waterTexture().image;
  const size = source.width;
  const data = source.getContext('2d').getImageData(0, 0, size, size).data;
  const at = (x, y) => {
    const i = ((((y % size) + size) % size) * size + (((x % size) + size) % size)) * 4;
    return (data[i] * 0.3 + data[i + 1] * 0.5 + data[i + 2] * 0.2) / 255;
  };

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const strength = 2.6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  waterNormal = new THREE.CanvasTexture(canvas);
  waterNormal.wrapS = THREE.RepeatWrapping;
  waterNormal.wrapT = THREE.RepeatWrapping;
  waterNormal.anisotropy = 4;
  return waterNormal;
}

// A material with its own current. `dir` is the axis the water runs along: a
// river follows its own length, a pond only breathes where it sits.
// `repeat` under one widens the pattern: the sheet's uvs are in tiles, so a
// quarter repeat stretches one current band across four tiles.
export function makeWaterMaterial({ tint = '#eaf7fb', opacity = 0.93, river = false, dir = 'both', repeat = 0.3, speed = null } = {}) {
  const map = waterTexture().clone();
  map.needsUpdate = true;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  const normalMap = waterNormalTexture().clone();
  normalMap.needsUpdate = true;
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(repeat, repeat);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tint),
    map,
    normalMap,
    normalScale: new THREE.Vector2(river ? 0.5 : 0.32, river ? 0.5 : 0.32),
    // the probe is the sky: water should hand its highlights back to it
    envMapIntensity: river ? 1.15 : 0.85,
    roughness: river ? 0.18 : 0.24,
    metalness: 0.26,
    emissive: new THREE.Color('#16566f'),
    emissiveIntensity: 0.4,
    transparent: true,
    opacity,
  });
  material.userData.flow = { speed: speed ?? (river ? 0.5 : 0.05), dir };
  return material;
}

// Move a sheet on by a frame. Rivers run; ponds barely stir. The normal sheet
// travels with the colour sheet, so the highlight on a crest stays on the crest
// instead of sliding across it.
export function advanceWater(material, dt) {
  const map = material?.map;
  if (!map) return;
  const flow = material.userData.flow || { speed: 0.05, dir: 'both' };
  const step = flow.speed * dt;
  const drift = (tex, sx, sy) => {
    if (!tex) return;
    tex.offset.x = (tex.offset.x - sx) % 1;
    tex.offset.y = (tex.offset.y - sy) % 1;
  };
  if (flow.dir === 'x') {
    drift(map, step, 0);
    drift(material.normalMap, step, 0);
  } else if (flow.dir === 'y') {
    drift(map, 0, step);
    drift(material.normalMap, 0, step);
  } else {
    drift(map, step * 0.7, step * 0.45);
    drift(material.normalMap, step * 0.7, step * 0.45);
  }
}
