import Panzoom, { type PanzoomObject } from "@panzoom/panzoom";

const MAX_SCALE = 6;
const TAP_SCALE = 3;
const DOUBLE_TAP_MS = 300;
const TAP_SLOP_PX = 12;

/** Pinch, wheel and drag zoom for the AgMet graphic, starting fitted to the screen. */
export class ImageViewer {
  private pz: PanzoomObject;
  private lastTap = 0;
  private lastTouchToggle = 0;
  private down: { x: number; y: number } | null = null;

  // panzoom moves a layer that fills the stage, so focal-point math matches what you touch
  constructor(
    stage: HTMLElement,
    canvas: HTMLElement,
    private img: HTMLImageElement,
  ) {
    this.pz = Panzoom(canvas, {
      minScale: 1,
      maxScale: MAX_SCALE,
      step: 0.6,
      panOnlyWhenZoomed: true,
      cursor: "grab",
      animate: true,
      duration: 180,
    });
    stage.addEventListener("wheel", (e) => this.pz.zoomWithWheel(e));

    canvas.addEventListener("pointerdown", (e) => {
      this.down = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "touch" || !this.down) return;
      const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      if (moved > TAP_SLOP_PX) return;
      const now = performance.now();
      if (now - this.lastTap < DOUBLE_TAP_MS) {
        this.lastTap = 0;
        this.lastTouchToggle = now;
        this.toggle(e);
      } else {
        this.lastTap = now;
      }
    });
    // phones also fire dblclick after a double tap, which would undo the touch toggle
    canvas.addEventListener("dblclick", (e) => {
      if (performance.now() - this.lastTouchToggle > 500) this.toggle(e);
    });
  }

  // double-tap zooms into the tapped spot, or back out to the full graphic
  private toggle(e: { clientX: number; clientY: number }): void {
    if (this.pz.getScale() > 1.05) this.fit();
    else this.pz.zoomToPoint(TAP_SCALE, e, { animate: true });
  }

  zoomIn(): void {
    this.pz.zoomIn();
  }

  zoomOut(): void {
    if (this.pz.getScale() <= 1.6) this.fit();
    else this.pz.zoomOut();
  }

  fit(animate = true): void {
    this.pz.reset({ animate });
  }

  show(src: string, alt: string): void {
    this.fit(false);
    this.img.alt = alt;
    if (this.img.src.endsWith(src)) return;
    this.img.src = src;
  }
}
