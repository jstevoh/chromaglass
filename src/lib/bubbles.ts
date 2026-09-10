/**
 * Trapped air between the plates.
 *
 * After the blob itself, the most recognisable thing in a projected liquid
 * show is the bubble: a bright ring with a dark centre that drifts with the
 * dye, slides uphill when the plate tilts, and merges with its neighbours. The
 * solver has no notion of a second phase, so bubbles live here as a small
 * particle list that rides the velocity field, and the renderer draws each
 * one as a lens — rim, highlight, a lighter interior — over the composited
 * dye.
 */

export interface Bubble {
  x: number;   // logical grid cells
  y: number;
  r: number;   // radius, cells
  age: number; // seconds
  life: number;
}

export const MAX_BUBBLES = 24;

/** Solver velocity units → cells per second: one step moves v·dt·(N−2) cells at 60 steps/s. */
const CELLS_PER_UNIT = 0.05 * 190 * 60;

export class BubbleField {
  readonly bubbles: Bubble[] = [];
  /** x/N, y/N, r/N, opacity — the shader's uniform block. */
  readonly packed = new Float32Array(MAX_BUBBLES * 4);

  constructor(private readonly grid: number) {}

  clear(): void {
    this.bubbles.length = 0;
  }

  /** Blow `count` bubbles at (x, y), scattered within `spread` cells. */
  spawn(x: number, y: number, r: number, count = 1, spread = 0): void {
    for (let i = 0; i < count; i++) {
      if (this.bubbles.length >= MAX_BUBBLES) {
        // Retire the oldest rather than refuse — a blow should always show.
        let oldest = 0;
        for (let k = 1; k < this.bubbles.length; k++) if (this.bubbles[k].age > this.bubbles[oldest].age) oldest = k;
        this.bubbles.splice(oldest, 1);
      }
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * spread;
      this.bubbles.push({
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        r: r * (0.65 + Math.random() * 0.7),
        age: 0,
        life: 7 + Math.random() * 12,
      });
    }
  }

  /**
   * Advance by `dt` seconds. `velocity` samples the solver field in its own
   * units; `tiltX/Y` is the plate tilt (air climbs against it); `lifeScale`
   * stretches or shortens how long bubbles last.
   */
  step(dt: number, velocity: (x: number, y: number) => [number, number], tiltX: number, tiltY: number, lifeScale: number): void {
    const N = this.grid;
    const bs = this.bubbles;
    for (const b of bs) {
      const [vx, vy] = velocity(b.x, b.y);
      // Ride the dye, climb the tilt, and wander a little — a bubble is never quite still.
      b.x += (vx * CELLS_PER_UNIT * 1.4 - tiltX * 900 + (Math.random() - 0.5) * 1.2) * dt;
      b.y += (vy * CELLS_PER_UNIT * 1.4 - tiltY * 900 + (Math.random() - 0.5) * 1.2) * dt;
      b.age += dt;
    }
    // Merge on contact: the larger one absorbs the smaller, area-conserving.
    for (let i = 0; i < bs.length; i++) {
      for (let j = bs.length - 1; j > i; j--) {
        const a = bs[i], c = bs[j];
        const dx = a.x - c.x, dy = a.y - c.y;
        if (dx * dx + dy * dy < (a.r + c.r) * (a.r + c.r) * 0.55) {
          const wa = a.r * a.r, wc = c.r * c.r;
          a.x = (a.x * wa + c.x * wc) / (wa + wc);
          a.y = (a.y * wa + c.y * wc) / (wa + wc);
          a.r = Math.min(N * 0.045, Math.sqrt(wa + wc));
          a.age = Math.min(a.age, c.age);
          bs.splice(j, 1);
        }
      }
    }
    // Pop at the end of life or at the plate's edge.
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      if (b.age > b.life * lifeScale || b.x < b.r + 1 || b.y < b.r + 1 || b.x > N - b.r - 1 || b.y > N - b.r - 1) bs.splice(i, 1);
    }
  }

  /** Fill `packed`; returns how many entries are live. */
  pack(lifeScale: number): number {
    const N = this.grid;
    let n = 0;
    for (const b of this.bubbles) {
      const end = b.life * lifeScale;
      const fadeIn = Math.min(1, b.age / 0.35);
      const fadeOut = Math.min(1, Math.max(0, (end - b.age) / 1.5));
      const o = n * 4;
      this.packed[o] = b.x / N;
      this.packed[o + 1] = b.y / N;
      this.packed[o + 2] = b.r / N;
      this.packed[o + 3] = fadeIn * fadeOut;
      n++;
    }
    return n;
  }
}
