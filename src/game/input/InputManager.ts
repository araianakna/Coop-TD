export type PlayerSlot = "p1" | "p2";

export interface CursorState {
  /** Normalized device coords, [-1, 1] */
  ndcX: number;
  ndcY: number;
  actionPressed: boolean;
  actionJustPressed: boolean;
  cancelJustPressed: boolean;
}

/**
 * Local co-op input: Player 1 drives a real mouse cursor. Player 2 drives a
 * virtual cursor via gamepad left-stick + A/Cross to confirm, B/Circle to cancel.
 * If no gamepad is present, P2 falls back to inactive (still visible as a
 * hook point for split-screen/second-mouse setups later).
 */
export class InputManager {
  private p1: CursorState = { ndcX: 0, ndcY: 0, actionPressed: false, actionJustPressed: false, cancelJustPressed: false };
  private p2: CursorState = { ndcX: 0.4, ndcY: 0, actionPressed: false, actionJustPressed: false, cancelJustPressed: false };
  private p1PrevDown = false;
  private p2PrevA = false;
  private p2PrevB = false;
  /** Last pointer type P1 actually used ("mouse" | "pen" | "touch"), so the
   * orchestrator can hide the P1 reticle on touch — a finger IS the cursor
   * there, so drawing a separate crosshair on top of it just gets in the
   * way. Starts as "mouse" (the common case) until the first real event. */
  private p1PointerType: string = "mouse";

  constructor(domElement: HTMLElement) {
    domElement.addEventListener("pointermove", (e) => {
      const rect = domElement.getBoundingClientRect();
      this.p1.ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.p1.ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.p1PointerType = e.pointerType;
    });
    domElement.addEventListener("pointerdown", (e) => {
      if (e.button === 0) this.p1.actionPressed = true;
      this.p1PointerType = e.pointerType;
    });
    window.addEventListener("pointerup", (e) => {
      if (e.button === 0) this.p1.actionPressed = false;
    });
  }

  /** Call once per frame before reading cursor state. */
  update() {
    this.p1.actionJustPressed = this.p1.actionPressed && !this.p1PrevDown;
    this.p1PrevDown = this.p1.actionPressed;
    this.p1.cancelJustPressed = false;

    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads.find((p) => p && p.connected);
    if (pad) {
      const dead = 0.2;
      const lx = Math.abs(pad.axes[0]) > dead ? pad.axes[0] : 0;
      const ly = Math.abs(pad.axes[1]) > dead ? pad.axes[1] : 0;
      this.p2.ndcX = clamp(this.p2.ndcX + lx * 0.04, -1, 1);
      this.p2.ndcY = clamp(this.p2.ndcY - ly * 0.04, -1, 1);
      const aDown = pad.buttons[0]?.pressed ?? false;
      const bDown = pad.buttons[1]?.pressed ?? false;
      this.p2.actionPressed = aDown;
      this.p2.actionJustPressed = aDown && !this.p2PrevA;
      this.p2.cancelJustPressed = bDown && !this.p2PrevB;
      this.p2PrevA = aDown;
      this.p2PrevB = bDown;
    } else {
      this.p2.actionJustPressed = false;
      this.p2.cancelJustPressed = false;
    }
  }

  getCursor(player: PlayerSlot): CursorState {
    return player === "p1" ? this.p1 : this.p2;
  }

  /** Whether P1's most recent pointer input was touch — the orchestrator
   * uses this to hide the P1 reticle, since a finger doesn't need one. */
  isP1Touch(): boolean {
    return this.p1PointerType === "touch";
  }

  isP2Active(): boolean {
    const pads = navigator.getGamepads?.() ?? [];
    return pads.some((p) => p && p.connected);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
