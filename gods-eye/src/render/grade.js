// The render grade — one place for sky, image-based light and film treatment.
//
// The game draws three views with one renderer: the cabin, the table inside it,
// and the region you walk in. Each used to light itself from scratch with flat
// colours and a single sun. This module gives all three the same cinematic
// floor, without touching a single mesh:
//
//   * a painted equirectangular sky, with the sun in it, used as the region's
//     background instead of one flat blue;
//   * image-based lighting generated from that same sheet (a PMREM probe), so
//     stone, water and metal reflect the sky they stand under;
//   * a warm, nearly dark interior probe for the cabin, so the lantern makes
//     brass read as brass and the table's metals pick up the room;
//   * one quality tier, decided once and expressed as numbers, so a phone gets
//     a cheaper shadow map and no bloom while a desktop gets both;
//   * a restrained bloom pass, so the lantern and the sun through the window
//     spill light instead of clipping to white.
//
// It changes light, not geometry, simulation or gameplay.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Where the sun stands. The painted sun and the region's directional light are
// the same light, so they read this one vector: if they ever disagree, the sky
// casts a shadow from a sun that is not in it.
export const SUN = { x: -30, y: 46, z: 22 };

// Palette of the day sky. Kept close to the colours the region was already
// lit with, so this reads as the same world with better light in it.
export const SKY = {
  zenith: '#6f9dc4',
  high: '#9dc3dd',
  horizon: '#d3e6f1',
  below: '#93a39b',
  nadir: '#5c6b68',
};

// A phone is identified by the size of the view it has to fill, not by its user
// agent: a tablet in landscape earns the desktop treatment, a phone in
// landscape does not. Core count catches the small laptops a viewport test
// would promote.
function detectTier() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'high';
  const shortSide = Math.min(window.innerWidth || 1024, window.innerHeight || 768);
  const cores = navigator.hardwareConcurrency || 4;
  return shortSide < 760 || cores <= 4 ? 'low' : 'high';
}

export const TIER = detectTier();

// What a tier actually changes. Scenes read these numbers instead of comparing
// tier strings, so adding the defined Standard tier is one row here rather than
// an edit in every scene.
const QUALITY = {
  high: { regionShadow: 2048, cabinShadow: 2048, maxPixelRatio: 2, bloom: true },
  low: { regionShadow: 1024, cabinShadow: 512, maxPixelRatio: 1.5, bloom: false },
};

export const quality = QUALITY[TIER];

// How much of the frame each probe is allowed to fill. The probes themselves
// are the same on every tier; only their resolution follows the device cost.
const ENVIRONMENT_INTENSITY = { outdoor: 0.55, interior: 0.35 };

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// The sky sheet: a vertical band from zenith to horizon to ground, then the sun
// laid on it with a wide falloff so the sun itself and the light around it are
// part of the same image the probe is built from.
function skySheet() {
  const w = 1024;
  const h = 512;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, SKY.zenith);
  grad.addColorStop(0.3, SKY.high);
  grad.addColorStop(0.49, SKY.horizon);
  grad.addColorStop(0.53, SKY.horizon);
  grad.addColorStop(0.6, SKY.below);
  grad.addColorStop(1, SKY.nadir);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const dir = new THREE.Vector3(SUN.x, SUN.y, SUN.z).normalize();
  const u = 0.5 + Math.atan2(dir.z, dir.x) / (Math.PI * 2);
  const v = 0.5 - Math.asin(dir.y) / Math.PI;
  const sx = u * w;
  const sy = v * h;

  // additive, drawn three times so the glow survives the seam at u = 0/1
  ctx.globalCompositeOperation = 'lighter';
  for (const dx of [-w, 0, w]) {
    const glow = ctx.createRadialGradient(sx + dx, sy, 0, sx + dx, sy, w * 0.19);
    glow.addColorStop(0, 'rgba(255, 248, 226, 1)');
    glow.addColorStop(0.06, 'rgba(255, 243, 216, 0.72)');
    glow.addColorStop(0.24, 'rgba(252, 238, 205, 0.16)');
    glow.addColorStop(1, 'rgba(252, 238, 205, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx + dx, sy, w * 0.19, 0, Math.PI * 2);
    ctx.fill();

    const disc = ctx.createRadialGradient(sx + dx, sy, 0, sx + dx, sy, w * 0.032);
    disc.addColorStop(0, 'rgba(255, 253, 244, 1)');
    disc.addColorStop(0.7, 'rgba(255, 246, 219, 0.9)');
    disc.addColorStop(1, 'rgba(255, 240, 200, 0)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(sx + dx, sy, w * 0.032, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // a thin haze band right on the horizon, where the eye expects distance
  const haze = ctx.createLinearGradient(0, h * 0.44, 0, h * 0.56);
  haze.addColorStop(0, 'rgba(238, 247, 252, 0)');
  haze.addColorStop(0.5, 'rgba(238, 247, 252, 0.35)');
  haze.addColorStop(1, 'rgba(238, 247, 252, 0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, h * 0.44, w, h * 0.12);

  return finish(c);
}

// The cabin probe: almost no light, one warm pool where the lantern hangs and
// one cool patch where the window is. Enough for a metal edge to catch a room.
function interiorSheet() {
  const w = 512;
  const h = 256;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b0e11';
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = 'lighter';
  const warm = ctx.createRadialGradient(w * 0.28, h * 0.42, 0, w * 0.28, h * 0.42, w * 0.22);
  warm.addColorStop(0, 'rgba(255, 190, 118, 0.95)');
  warm.addColorStop(0.3, 'rgba(190, 118, 60, 0.28)');
  warm.addColorStop(1, 'rgba(90, 50, 24, 0)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, w, h);

  const windowLight = ctx.createRadialGradient(w * 0.72, h * 0.5, 0, w * 0.72, h * 0.5, w * 0.16);
  windowLight.addColorStop(0, 'rgba(164, 198, 226, 0.8)');
  windowLight.addColorStop(0.4, 'rgba(96, 132, 164, 0.22)');
  windowLight.addColorStop(1, 'rgba(40, 60, 80, 0)');
  ctx.fillStyle = windowLight;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  const floor = ctx.createLinearGradient(0, h * 0.6, 0, h);
  floor.addColorStop(0, 'rgba(30, 20, 12, 0)');
  floor.addColorStop(1, 'rgba(46, 30, 16, 0.5)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);

  return finish(c);
}

// Flat stand-ins until initGrade runs, so a scene built early still gets a
// coherent sky instead of a black void.
let outdoor = { background: new THREE.Color(SKY.horizon), environment: null };
let interior = { environment: null };
let ready = false;

// Build both probes once per renderer. Must run before the cabin or a region is
// constructed; both ask for their environment in their own constructor.
export function initGrade(renderer) {
  if (ready || !renderer) return;
  ready = true;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const sky = skySheet();
    const room = interiorSheet();
    outdoor = { background: sky, environment: pmrem.fromEquirectangular(sky).texture };
    interior = { environment: pmrem.fromEquirectangular(room).texture };
    // The sheets and the generator's working targets are done with: the two
    // probe textures above are the only things that need to survive.
    room.dispose();
    pmrem.dispose();
  } catch (err) {
    // A driver without half-float targets keeps the flat sky and loses only the
    // reflections; that is not a reason to show nothing.
    console.warn('[gods-eye] environment probes unavailable, lighting flat', err);
  }
}

// Put the right probe on a scene: the sky outside, the lantern room inside. One
// place decides both which sheet and how strongly it fills, so the cabin and the
// region cannot drift apart again.
export function applyEnvironment(scene, kind) {
  const probe = kind === 'interior' ? interior : outdoor;
  if (kind !== 'interior') scene.background = probe.background;
  if (probe.environment) {
    scene.environment = probe.environment;
    scene.environmentIntensity = ENVIRONMENT_INTENSITY[kind];
  }
}

// One renderer, one camera, one film treatment. This owns the settings that
// used to sit in the Game constructor, so nothing else has to know whether the
// machine in front of the player is a phone or a desktop.
export class Presentation {
  constructor(renderer, camera) {
    this.renderer = renderer;
    this.camera = camera;
    this.tier = TIER;
    this.composer = null;
    this.renderPass = null;

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if (quality.bloom) this.buildBloom();
    this.resize();
  }

  buildBloom() {
    try {
      const size = this.renderer.getSize(new THREE.Vector2());
      const composer = new EffectComposer(this.renderer);
      // an empty scene to start: the pass is pointed at whichever scene the
      // game is drawing, which changes when the player moves between views
      this.renderPass = new RenderPass(new THREE.Scene(), this.camera);
      // threshold is in linear HDR: only the sun, the lantern and the glows
      // around them cross it, so the world keeps its contrast
      composer.addPass(this.renderPass);
      composer.addPass(new UnrealBloomPass(size, 0.24, 0.55, 0.9));
      composer.addPass(new OutputPass());
      this.composer = composer;
    } catch (err) {
      console.warn('[gods-eye] bloom unavailable, rendering direct', err);
      this.renderPass = null;
    }
  }

  get bloomEnabled() {
    return !!this.composer;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(pixelRatio);
      this.composer.setSize(w, h);
    }
  }

  render(scene) {
    if (!this.composer) {
      this.renderer.render(scene, this.camera);
      return;
    }
    this.renderPass.scene = scene;
    this.composer.render();
  }
}
