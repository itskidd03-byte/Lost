import type { Input } from '../render/input';
import type { PanelKind } from './hud';

export interface TouchActions {
  onAttack(): void;
  onInteract(): void;
  onFinish(): void;
  onToggleTarget(): void;
  onPanel(kind: PanelKind): void;
  onSpeed(speed: number): void;
  onSave(): void;
  onLoad(): void;
  onInstall(): void;
  onCancelBuild(): void;
  getSpeed(): number;
  getAccount(): string;
  cheatsRevealed(): boolean;
  hasPowers(): boolean;
  hasPendingBuild(): boolean;
}

interface PanelButton {
  kind: PanelKind;
  label: string;
}

const PANEL_BUTTONS: PanelButton[] = [
  { kind: 'inventory', label: 'Inventory' },
  { kind: 'character', label: 'Character' },
  { kind: 'build', label: 'Build' },
  { kind: 'ledger', label: 'Property' },
  { kind: 'map', label: 'Map' },
  { kind: 'factions', label: 'Factions' },
  { kind: 'history', label: 'History' },
  { kind: 'injuries', label: 'Injuries' },
  { kind: 'references', label: 'References' },
  { kind: 'studio', label: "Slayer's notes" },
  { kind: 'powers', label: 'Powers' },
  { kind: 'cheats', label: 'Cheats' },
  { kind: 'settings', label: 'Settings' }
];

/**
 * On-screen controls: a left thumb stick, a right-side look pad and an action
 * cluster, plus a full-screen island menu. Pointer events mean the same layout
 * also works with a mouse in a desktop preview.
 */
export class TouchControls {
  private root: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private lookPad: HTMLElement;
  private sheet: HTMLElement;
  private sprintOn = false;
  private lookPointer: number | null = null;
  private stickPointer: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;
  private readonly stickRadius = 42;

  constructor(private input: Input, private actions: TouchActions) {
    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.innerHTML = `
      <div class="look-pad" aria-hidden="true"></div>
      <button class="touch-menu" id="touch-menu" aria-label="Island menu">MENU</button>
      <div class="stick" id="touch-stick">
        <div class="stick-knob"></div>
        <span>MOVE</span>
      </div>
      <div class="actions">
        <button class="tbtn" data-touch="sprint">Sprint</button>
        <button class="tbtn" data-touch="target">Aim</button>
        <button class="tbtn" data-touch="finish">Finish</button>
        <button class="tbtn" data-touch="block">Block</button>
        <button class="tbtn" data-touch="interact">Use</button>
        <button class="tbtn attack" data-touch="attack">Attack</button>
      </div>
      <div class="sheet" id="touch-sheet" hidden></div>
    `;
    document.getElementById('app')!.appendChild(this.root);

    this.lookPad = this.root.querySelector('.look-pad') as HTMLElement;
    this.stick = this.root.querySelector('.stick') as HTMLElement;
    this.knob = this.root.querySelector('.stick-knob') as HTMLElement;
    this.sheet = this.root.querySelector('.sheet') as HTMLElement;

    this.bindLook();
    this.bindStick();
    this.bindActions();
    this.root.querySelector('#touch-menu')?.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.openSheet();
    });
  }

  /** Close the menu sheet, e.g. when a panel takes over the screen. */
  closeSheet(): void {
    this.sheet.hidden = true;
    this.root.classList.remove('sheet-open');
  }

  private bindLook(): void {
    const pad = this.lookPad;
    pad.addEventListener('pointerdown', (event) => {
      if (this.lookPointer !== null) return;
      event.preventDefault();
      this.lookPointer = event.pointerId;
      this.lookLastX = event.clientX;
      this.lookLastY = event.clientY;
      try { pad.setPointerCapture(event.pointerId); } catch { /* not every browser can capture */ }
    });
    pad.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.lookPointer) return;
      const dx = event.clientX - this.lookLastX;
      const dy = event.clientY - this.lookLastY;
      this.lookLastX = event.clientX;
      this.lookLastY = event.clientY;
      this.input.addLook(dx * 1.4, dy * 1.4);
    });
    const release = (event: PointerEvent) => {
      if (event.pointerId !== this.lookPointer) return;
      this.lookPointer = null;
    };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
  }

  private bindStick(): void {
    const stick = this.stick;
    const update = (event: PointerEvent) => {
      const rect = stick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = event.clientX - cx;
      let dy = event.clientY - cy;
      const distance = Math.hypot(dx, dy);
      if (distance > this.stickRadius) {
        dx = (dx / distance) * this.stickRadius;
        dy = (dy / distance) * this.stickRadius;
      }
      this.knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      this.input.setMove(dx / this.stickRadius, -dy / this.stickRadius);
    };
    const release = () => {
      this.stickPointer = null;
      this.knob.style.transform = 'translate(0px, 0px)';
      this.input.setMove(0, 0);
    };
    stick.addEventListener('pointerdown', (event) => {
      if (this.stickPointer !== null) return;
      event.preventDefault();
      this.stickPointer = event.pointerId;
      try { stick.setPointerCapture(event.pointerId); } catch { /* optional */ }
      update(event);
    });
    stick.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.stickPointer) return;
      update(event);
    });
    stick.addEventListener('pointerup', release);
    stick.addEventListener('pointercancel', release);
  }

  private bindActions(): void {
    const press = (selector: string, handler: (button: HTMLElement) => void) => {
      this.root.querySelectorAll<HTMLElement>(selector).forEach((button) => {
        button.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          handler(button);
        });
      });
    };

    press('[data-touch="attack"]', () => this.actions.onAttack());
    press('[data-touch="interact"]', () => this.actions.onInteract());
    press('[data-touch="finish"]', () => this.actions.onFinish());
    press('[data-touch="target"]', () => this.actions.onToggleTarget());
    press('[data-touch="sprint"]', (button) => {
      this.sprintOn = !this.sprintOn;
      this.input.state.sprint = this.sprintOn;
      button.classList.toggle('active', this.sprintOn);
    });

    const block = this.root.querySelector<HTMLElement>('[data-touch="block"]');
    if (block) {
      const start = (event: PointerEvent) => {
        event.preventDefault();
        this.input.state.blocking = true;
        block.classList.add('active');
      };
      const stop = () => {
        this.input.state.blocking = false;
        block.classList.remove('active');
      };
      block.addEventListener('pointerdown', start);
      block.addEventListener('pointerup', stop);
      block.addEventListener('pointercancel', stop);
      block.addEventListener('pointerleave', stop);
    }

    this.sheet.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.sheet.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const panel = target.closest<HTMLElement>('[data-sheet-panel]');
      if (panel) {
        const kind = panel.dataset.sheetPanel as PanelKind;
        this.closeSheet();
        this.actions.onPanel(kind);
        return;
      }
      const speed = target.closest<HTMLElement>('[data-sheet-speed]');
      if (speed) {
        this.actions.onSpeed(Number(speed.dataset.sheetSpeed));
        this.openSheet();
        return;
      }
      if (target.closest('[data-sheet-save]')) {
        this.closeSheet();
        this.actions.onSave();
        return;
      }
      if (target.closest('[data-sheet-load]')) {
        this.closeSheet();
        this.actions.onLoad();
        return;
      }
      if (target.closest('[data-sheet-cancel-build]')) {
        this.closeSheet();
        this.actions.onCancelBuild();
        return;
      }
      if (target.closest('[data-sheet-install]')) {
        this.closeSheet();
        this.actions.onInstall();
        return;
      }
      if (target.closest('[data-sheet-close]') || target === this.sheet) this.closeSheet();
    });
  }

  private openSheet(): void {
    const speed = this.actions.getSpeed();
    const paused = speed === 0;
    const speedButton = (value: number, label: string) =>
      `<button data-sheet-speed="${value}" class="${speed === value ? 'active' : ''}">${label}</button>`;
    const panels = PANEL_BUTTONS
      .filter((panel) => (panel.kind !== 'cheats' || this.actions.cheatsRevealed())
        && (panel.kind !== 'powers' || this.actions.hasPowers()))
      .map((panel) => `<button data-sheet-panel="${panel.kind}">${panel.label}</button>`)
      .join('');
    const account = this.actions.getAccount();
    const download = typeof location !== 'undefined' && location.protocol.startsWith('http')
      ? '<a class="sheet-download" href="./kingdoms-of-the-forgotten-island.html" download="kingdoms-of-the-forgotten-island.html">Download the standalone game</a>'
      : '';
    this.sheet.innerHTML = `
      <div class="sheet-card">
        <div class="sheet-head">
          <h2>Island menu</h2>
          <button class="sheet-close" data-sheet-close="1" aria-label="Close menu">✕</button>
        </div>
        <div class="sheet-grid">${panels}</div>
        <h3>Island speed</h3>
        <div class="sheet-row">
          ${speedButton(0, paused ? 'Paused ✓' : 'Pause')}
          ${speedButton(1, '1×')}
          ${speedButton(2, '2×')}
          ${speedButton(4, '4×')}
        </div>
        <h3>Session</h3>
        <div class="sheet-row">
          <button data-sheet-save="1">Save world</button>
          <button data-sheet-load="1">Load save</button>
          <button data-sheet-install="1">Install app</button>
          ${this.actions.hasPendingBuild() ? '<button class="danger" data-sheet-cancel-build="1">Cancel placement</button>' : ''}
        </div>
        ${download}
        <p class="fineprint">${account ? `Autosaving to ${account} every 10 seconds. ` : ''}Leaving the game pauses the island and switches autonomous time off. Nothing advances while you are away. Lord Slayer still keeps a graphics note check every 5 minutes.</p>
      </div>
    `;
    this.sheet.hidden = false;
    this.root.classList.add('sheet-open');
  }
}
