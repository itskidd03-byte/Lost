import * as THREE from 'three';

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

// Some environments (and synthetic events) omit KeyboardEvent.code. Fall back to
// the printed key so movement and shortcuts still work.
export function keyCode(e) {
  if (e.code) return e.code;
  const k = e.key;
  if (!k) return '';
  if (k === ' ') return 'Space';
  if (k === 'Enter' || k === 'Escape' || k === 'Tab') return k;
  if (k.length === 1) {
    const up = k.toUpperCase();
    if (up >= 'A' && up <= 'Z') return `Key${up}`;
    if (up >= '0' && up <= '9') return `Digit${up}`;
  }
  return k;
}

export class FirstPerson {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.enabled = false;
    this.yaw = 0;
    this.pitch = 0;
    this.position = new THREE.Vector3(0, 1.66, 2.6);
    this.eye = 1.66;
    this.speed = 3.3;
    this.runSpeed = 5.6;
    this.radius = 0.3;
    this.bounds = null;
    this.blockers = [];
    this.walkable = null;
    this.groundHeight = null;
    this.keys = new Set();
    this.touch = { x: 0, y: 0 };
    this.bob = 0;
    this.vel = new THREE.Vector2();
    this.renderYaw = 0;
    this.renderPitch = 0;
    // Touch look is smoother when the camera eases toward the aim point.
    this.smoothLook = false;
    this.smoothY = this.position.y;
    this.onInteract = null;

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      const code = keyCode(e);
      if (MOVE_KEYS.has(code)) {
        this.keys.add(code);
        if (code.startsWith('Arrow')) e.preventDefault();
      }
    };
    this._onKeyUp = (e) => this.keys.delete(keyCode(e));
    this._onMouseMove = (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement !== this.dom) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-1.15, Math.min(1.15, this.pitch - e.movementY * 0.0022));
    };
    this._onBlur = () => this.keys.clear();

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('blur', this._onBlur);
  }

  get locked() {
    return document.pointerLockElement === this.dom;
  }

  lock() {
    if (!this.locked && this.dom.requestPointerLock) {
      const p = this.dom.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }

  unlock() {
    if (this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  look(yaw, pitch = 0) {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  place(x, z, lookYaw = this.yaw) {
    this.position.set(x, 0, z);
    this.yaw = lookYaw;
    this.pitch = 0;
    this.smoothY = 0;
    this.vel.set(0, 0);
    this.renderYaw = this.yaw;
    this.renderPitch = this.pitch;
  }

  blockerBlocks(x, z, b) {
    const r = this.radius;
    return x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r;
  }

  allowed(x, z) {
    if (this.bounds) {
      if (x < this.bounds.minX || x > this.bounds.maxX || z < this.bounds.minZ || z > this.bounds.maxZ) return false;
    }
    for (const b of this.blockers) if (this.blockerBlocks(x, z, b)) return false;
    if (this.walkable && !this.walkable(x, z)) return false;
    return true;
  }

  update(dt) {
    if (!this.enabled) return;
    let forward = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    let strafe = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    if (this.touch && (this.touch.x || this.touch.y)) {
      strafe += this.touch.x;
      forward += -this.touch.y;
    }
    const mag = Math.hypot(forward, strafe);
    if (mag > 1) {
      forward /= mag;
      strafe /= mag;
    }
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = sprint ? this.runSpeed : this.speed;

    // The camera eases toward the aim on touch, and movement follows the way
    // the eyes actually point, so a step always goes where you look.
    if (this.smoothLook) {
      const t = Math.min(1, dt * 20);
      let dy = this.yaw - this.renderYaw;
      dy = (((dy + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      this.renderYaw += dy * t;
      this.renderPitch += (this.pitch - this.renderPitch) * t;
    } else {
      this.renderYaw = this.yaw;
      this.renderPitch = this.pitch;
    }

    const sin = Math.sin(this.renderYaw);
    const cos = Math.cos(this.renderYaw);
    const wantX = (-sin * forward + cos * strafe) * speed;
    const wantZ = (-cos * forward - sin * strafe) * speed;
    const moving = forward !== 0 || strafe !== 0;
    const ease = Math.min(1, dt * (moving ? 14 : 18));
    this.vel.x += (wantX - this.vel.x) * ease;
    this.vel.y += (wantZ - this.vel.y) * ease;
    if (!moving && Math.hypot(this.vel.x, this.vel.y) < 0.02) {
      this.vel.set(0, 0);
    }

    let dx = this.vel.x * dt;
    let dz = this.vel.y * dt;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      const maxStep = (sprint ? this.runSpeed : this.speed) * 1.08 * dt;
      if (len > maxStep) {
        dx = (dx / len) * maxStep;
        dz = (dz / len) * maxStep;
      }
    }
    if (this.allowed(this.position.x + dx, this.position.z)) this.position.x += dx;
    else this.vel.x = 0;
    if (this.allowed(this.position.x, this.position.z + dz)) this.position.z += dz;
    else this.vel.y = 0;

    const pace = Math.hypot(this.vel.x, this.vel.y) / Math.max(0.001, this.speed);
    this.bob += dt * (pace > 0.15 ? (sprint ? 11 : 7.5) * Math.min(1, pace) : 1.6);

    const groundY = this.groundHeight ? this.groundHeight(this.position.x, this.position.z) : 0;
    const targetY = groundY + this.eye;
    this.smoothY += (targetY - this.smoothY) * Math.min(1, dt * 9);
    const bobY = Math.sin(this.bob) * 0.013;
    this.camera.position.set(this.position.x, this.smoothY + bobY, this.position.z);
    this.camera.rotation.set(this.renderPitch, this.renderYaw, 0, 'YXZ');
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('blur', this._onBlur);
  }
}

export class MapOrbit {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.enabled = false;
    this.theta = -0.62;
    this.phi = 0.92;
    this.radius = 2.1;
    this.minRadius = 0.85;
    this.maxRadius = 3.4;
    this.target = new THREE.Vector3();
    this.dragging = false;
    this.moved = 0;
    this._last = { x: 0, y: 0 };

    this._down = (e) => {
      if (!this.enabled || e.button !== 0) return;
      this.dragging = true;
      this.moved = 0;
      this._last = { x: e.clientX, y: e.clientY };
      this.dom.setPointerCapture?.(e.pointerId);
    };
    this._move = (e) => {
      if (!this.enabled || !this.dragging) return;
      const dx = e.clientX - this._last.x;
      const dy = e.clientY - this._last.y;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this._last = { x: e.clientX, y: e.clientY };
      this.theta -= dx * 0.006;
      this.phi = Math.max(0.18, Math.min(1.42, this.phi - dy * 0.005));
    };
    this._up = (e) => {
      this.dragging = false;
      this.dom.releasePointerCapture?.(e.pointerId);
    };
    this._wheel = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.radius + e.deltaY * 0.0016));
    };

    dom.addEventListener('pointerdown', this._down);
    dom.addEventListener('pointermove', this._move);
    dom.addEventListener('pointerup', this._up);
    dom.addEventListener('pointercancel', this._up);
    dom.addEventListener('wheel', this._wheel, { passive: false });
  }

  setTarget(v) {
    this.target.copy(v);
  }

  zoomBy(delta) {
    this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.radius + delta));
  }

  update() {
    if (!this.enabled) return;
    const sinPhi = Math.sin(this.phi);
    const pos = new THREE.Vector3(
      this.target.x + this.radius * sinPhi * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sinPhi * Math.cos(this.theta),
    );
    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this._down);
    this.dom.removeEventListener('pointermove', this._move);
    this.dom.removeEventListener('pointerup', this._up);
    this.dom.removeEventListener('pointercancel', this._up);
    this.dom.removeEventListener('wheel', this._wheel);
  }
}
