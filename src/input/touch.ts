import { STICK_RADIUS, CENTRED, stickVector, knobOffset, type StickVector } from './stick';

/**
 * Two floating thumbsticks, drawn as DOM over the canvas.
 *
 * Floating rather than fixed: the stick appears wherever the thumb lands, because a fixed
 * pad on a phone is a target you have to look down at, and this game never lets you look
 * away. The screen splits down the middle — left thumb moves, right thumb aims — which is
 * the convention for the genre and needs no explaining.
 *
 * Pointer events, not touch events, so a stylus and a touch-screen laptop work too; mouse
 * pointers are ignored, since the desktop path already has aim on the mouse.
 */

/** Screen fraction reserved for the move stick. The rest aims. */
const MOVE_ZONE = 0.5;

interface Active {
  pointerId: number;
  originX: number;
  originY: number;
  vector: StickVector;
  el: HTMLElement;
  knob: HTMLElement;
}

export class TouchControls {
  private readonly layer: HTMLElement;
  private readonly sticks: HTMLElement[] = [];
  private move: Active | null = null;
  private aim: Active | null = null;
  /** True once a real touch has happened — desktop never shows the sticks. */
  private used = false;

  constructor(private readonly target: HTMLElement = document.body) {
    this.layer = document.createElement('div');
    this.layer.id = 'ui-touch';
    this.layer.innerHTML = `
      <div class="stick" data-role="move"><i></i></div>
      <div class="stick" data-role="aim"><i></i></div>`;
    this.target.appendChild(this.layer);
    for (const el of this.layer.querySelectorAll<HTMLElement>('.stick')) {
      el.hidden = true;
      this.sticks.push(el);
    }

    // Listen on the window so a thumb that slides off the canvas still steers, and so a
    // pointer lost to a system gesture is always cleaned up.
    window.addEventListener('pointerdown', (e) => this.onDown(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: false });
    for (const end of ['pointerup', 'pointercancel'] as const) {
      window.addEventListener(end, (e) => this.onUp(e));
    }
  }

  /** Whether this device is actually being played by touch, so the HUD can adapt. */
  get engaged(): boolean {
    return this.used;
  }

  axis(): { x: number; y: number } {
    const v = this.move?.vector ?? CENTRED;
    return { x: v.x * v.magnitude, y: v.y * v.magnitude };
  }

  aimStick(): StickVector {
    return this.aim?.vector ?? CENTRED;
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    // A tap on the HUD (an item slot, the shop button) is a press, not a stick.
    if ((e.target as HTMLElement | null)?.closest('#ui-hud, #ui-overlay')) return;
    const wantsAim = e.clientX > window.innerWidth * MOVE_ZONE;
    if (wantsAim && this.aim) return;
    if (!wantsAim && this.move) return;

    if (!this.used) {
      this.used = true;
      document.documentElement.classList.add('touch-play');
    }
    e.preventDefault();

    const el = this.sticks[wantsAim ? 1 : 0];
    if (!el) return;
    const knob = el.querySelector<HTMLElement>('i')!;
    el.style.left = `${e.clientX}px`;
    el.style.top = `${e.clientY}px`;
    el.hidden = false;
    knob.style.transform = 'translate(-50%, -50%)';

    const active: Active = {
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      vector: CENTRED,
      el,
      knob,
    };
    if (wantsAim) this.aim = active;
    else this.move = active;
  }

  private onMove(e: PointerEvent): void {
    const active = this.find(e.pointerId);
    if (!active) return;
    e.preventDefault();
    const dx = e.clientX - active.originX;
    const dy = e.clientY - active.originY;
    active.vector = stickVector(dx, dy);
    const knob = knobOffset(dx, dy);
    active.knob.style.transform = `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`;
  }

  private onUp(e: PointerEvent): void {
    const active = this.find(e.pointerId);
    if (!active) return;
    active.el.hidden = true;
    if (this.move === active) this.move = null;
    else this.aim = null;
  }

  private find(pointerId: number): Active | null {
    if (this.move?.pointerId === pointerId) return this.move;
    if (this.aim?.pointerId === pointerId) return this.aim;
    return null;
  }

  /** Drop both sticks — used when a panel opens, so the player does not walk while shopping. */
  release(): void {
    for (const active of [this.move, this.aim]) if (active) active.el.hidden = true;
    this.move = null;
    this.aim = null;
  }
}

export const TOUCH_CSS = `
/* Above the HUD (z-index 10): the stick is transient feedback about where your thumb is,
   so it has to be visible even when the thumb lands on top of a panel. The HUD does not
   take pointer events except on its own buttons, so steering there already worked — the
   knob just disappeared underneath, which reads as the control being dead. */
#ui-touch{position:fixed;inset:0;pointer-events:none;z-index:11}
#ui-touch .stick{position:fixed;width:${STICK_RADIUS * 2}px;height:${STICK_RADIUS * 2}px;margin:${-STICK_RADIUS}px 0 0 ${-STICK_RADIUS}px;border-radius:50%;border:1.5px solid rgba(138,216,194,.3);background:rgba(7,14,13,.3)}
#ui-touch .stick[data-role="aim"]{border-color:rgba(255,180,56,.34)}
#ui-touch .stick i{position:absolute;left:50%;top:50%;width:46px;height:46px;border-radius:50%;background:rgba(97,229,222,.3);border:1.5px solid rgba(207,238,229,.5)}
#ui-touch .stick[data-role="aim"] i{background:rgba(255,180,56,.3);border-color:rgba(255,226,160,.55)}
`;
