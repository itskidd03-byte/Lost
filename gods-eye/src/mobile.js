// Touch controls: a thumb stick for walking, drag-to-look on the canvas, and
// action buttons that follow the current mode.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function isTouchDevice() {
  const forced = new URLSearchParams(location.search).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  return (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
}

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.enabled = false;
    this.stickActive = false;
    this.lookId = null;
    this.lastLook = { x: 0, y: 0 };
    this.els = {
      root: document.getElementById('touch'),
      stick: document.getElementById('stick'),
      knob: document.getElementById('stick-knob'),
      table: document.getElementById('touch-table'),
      interact: document.getElementById('touch-interact'),
    };
    this.bind();
  }

  bind() {
    const stick = this.els.stick;
    if (!stick) return;
    stick.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.stickActive = true;
      stick.setPointerCapture?.(e.pointerId);
      this.moveStick(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (!this.stickActive) return;
      e.preventDefault();
      this.moveStick(e);
    });
    const release = () => {
      this.stickActive = false;
      this.els.knob.style.transform = 'translate(-50%, -50%)';
      if (this.game.fp) this.game.fp.touch = { x: 0, y: 0 };
    };
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);

    document.querySelectorAll('[data-touch]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!this.enabled) return;
        this.game.touchAction(btn.dataset.touch);
      });
    });

    const canvas = this.game.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.pointerType === 'mouse') return;
      if (this.game.mode !== 'cabin' && this.game.mode !== 'world') return;
      this.lookId = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.enabled || this.lookId !== e.pointerId) return;
      const dx = e.clientX - this.lastLook.x;
      const dy = e.clientY - this.lastLook.y;
      this.lastLook = { x: e.clientX, y: e.clientY };
      this.game.lookBy(dx, dy);
    });
    const endLook = (e) => {
      if (this.lookId === e.pointerId) this.lookId = null;
    };
    canvas.addEventListener('pointerup', endLook);
    canvas.addEventListener('pointercancel', endLook);
  }

  moveStick(e) {
    const rect = this.els.stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const max = rect.width * 0.36;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.els.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.game.fp.touch = { x: clamp(dx / max, -1, 1), y: clamp(dy / max, -1, 1) };
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.els.root) this.els.root.hidden = !on;
    if (!on && this.els.knob) this.els.knob.style.transform = 'translate(-50%, -50%)';
    document.body.classList.toggle('touch-mode', on);
  }

  setMode(mode) {
    if (!this.enabled) return;
    const table = mode === 'table';
    if (this.els.table) this.els.table.hidden = !table;
    // the stick roams the board too: push forward to walk the aim across the map,
    // push sideways to turn
    if (this.els.stick) this.els.stick.style.display = '';
    if (this.els.interact) {
      this.els.interact.textContent = table ? 'Walk' : mode === 'world' ? 'Talk' : 'Look';
      this.els.interact.style.display = table ? 'none' : '';
    }
  }
}
