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
//   * one quality tier, decided once, so a phone gets a cheaper shadow map and
//     no bloom while a desktop gets both;
//   * a restrained bloom pass, so the lantern and the sun through the window
//     spill light instead of clipping to white.
//
// It changes light, not geometry, simulation or gameplay.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// A phone is identified by the size of the view it has to fill, not by its
// user agent: a tablet in landscape earns the desktop treatment, a phone in
// landscape does not.
function detectTier() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'high';
  const shortSide = Math.min(window.innerWidth || 1024, window.innerHeight || 768);
  const cores = navigator.hardwareConcurrency || 4;
  if (shortSide < 760) return 'low';
  if (cores <= 4) return 'low';
  return 'high';
}

export const TIER = detectTier();

// Palette of the day sky. Kept close to the colours the region was already
// lit with, so this reads as the same world with better light in it.
const SKY = {
  zenith: '#6f9dc4',
  high: '#9dc3dd',
  horizon: '#d3e6f1',
  below: '#93a39b',
  nadir: '#5c6b68',
  sun: '#fff3d8',
  // the direction the sun already stands in the region: (-30, 46, 22)
  sunDir: new THREE.Vector3(-30, 46, 22).normalize(),
  horizonHex: '#cfe3ef',
};

let pmrem = null;
let outdoor = null;
let interior = null;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c, mapping = THREE.EquirectangularReflectionMapping) {
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = mapping;
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

  const dir = SKY.sunDir;
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

// Build the two probes once per renderer. Must run before the cabin or a region
// is constructed; both ask for their environment in their own constructor.
export function initGrade(renderer) {
  if (outdoor || !renderer) return;
  pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader?.();

  const sky = skySheet();
  outdoor = {
    background: sky,
    environment: pmrem.fromEquirectangular(sky).texture,
    horizon: SKY.horizonHex,
  };

  const room = interiorSheet();
  interior = { environment: pmrem.fromEquirectangular(room).texture };
  room.dispose();
}

// The region and the table both stand in daylight. If initGrade has not run
// (a unit test importing a renderer module directly), fall back to the old flat
// sky rather than throwing.
export function outdoorSky() {
  if (outdoor) return outdoor;
  return {
    background: new THREE.Color(SKY.horizonHex),
    environment: null,
    horizon: SKY.horizonHex,
  };
}

export function interiorEnvironment() {
  return interior ? interior.environment : null;
}

// One renderer, one camera, one film treatment. This owns the settings that
// used to sit in the Game constructor, so nothing else has to know whether the
// machine in front of the player is a phone or a desktop.
export class Presentation {
  constructor(renderer, camera) {
    this.renderer = renderer;
    this.camera = camera;
    this.tier = TIER;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, TIER === 'high' ? 2 : 1.5);

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.composer = null;
    this.bloom = null;
    this.renderPass = null;

    if (TIER === 'high') {
      try {
        const size = renderer.getSize(new THREE.Vector2());
        this.composer = new EffectComposer(renderer);
        this.renderPass = new RenderPass(new THREE.Scene(), camera);
        // threshold is in linear HDR: only the sun, the lantern and the glows
        // around them cross it, so the world keeps its contrast
        this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.24, 0.55, 0.9);
        this.composer.addPass(this.renderPass);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());
      } catch (err) {
        // a driver without half-float targets is not a reason to show nothing
        console.warn('[gods-eye] bloom unavailable, rendering direct', err);
        this.composer = null;
        this.renderPass = null;
        this.bloom = null;
      }
    }

    this.resize();
  }

  // Shadow texels and bloom are the two things a phone should not pay for.
  get bloomEnabled() {
    return !!this.composer;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(w, h);
    }
  }

  render(scene) {
    if (!this.composer) {
      this.renderer.render(scene, this.camera);
      return;
    }
    // RenderPass holds a scene reference; the game swaps scene when it changes
    // mode, so the pass is told which one to draw every frame.
    this.renderPass.scene = scene;
    this.composer.render();
  }
}
