/**
 * Touch-only input. The game is played with the on-screen joystick, look pad and
 * action buttons in `src/ui/touch.ts`; there is no keyboard or pointer-lock path.
 */
export interface InputState {
  /** Analog joystick axes: +x strafes right, +y walks forward. */
  moveX: number;
  moveY: number;
  sprint: boolean;
  blocking: boolean;
}

export class Input {
  readonly state: InputState = {
    moveX: 0, moveY: 0, sprint: false, blocking: false
  };
  private lookX = 0;
  private lookY = 0;

  /** Joystick vector: x strafes, y walks forward. Both in -1..1. */
  setMove(x: number, y: number): void {
    const deadZone = 0.14;
    const distance = Math.hypot(x, y);
    if (distance <= deadZone) {
      this.state.moveX = 0;
      this.state.moveY = 0;
      return;
    }
    // Keep the stick's direction but scale speed by how far it is pushed.
    const strength = Math.min(1, (distance - deadZone) / (1 - deadZone));
    this.state.moveX = (x / distance) * strength;
    this.state.moveY = (y / distance) * strength;
  }

  addLook(dx: number, dy: number): void {
    this.lookX += dx;
    this.lookY += dy;
  }

  consumeLook(): { x: number; y: number } {
    const delta = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return delta;
  }

  reset(): void {
    this.state.moveX = 0;
    this.state.moveY = 0;
    this.state.sprint = false;
    this.state.blocking = false;
    this.lookX = 0;
    this.lookY = 0;
  }
}
