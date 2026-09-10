/**
 * Trapped air between the plates.
 *
 * After the blob itself, the most recognisable thing in a projected liquid
 * show is the bubble — and a real one is never a perfect circle for long. It
 * stretches along the flow, wobbles after a knock, necks into a neighbour and
 * merges, tears in two under shear, and pops into a spray of smaller ones.
 *
 * The solver has no second phase, so bubbles live here as a small particle
 * list riding the velocity field. Each carries a shape — a stretch vector and
 * a decaying wobble — and the renderer draws them all as one implicit
 * (metaball) surface, so two bubbles pulling together blend through a neck
 * instead of two circles overlapping.
 */

export interface Bubble {
  x: number;    // logical grid cells
  y: number;
  r: number;    // radius, cells (of the equivalent circle)
  age: number;  // seconds
  life: number;
  /** Stretch along a direction: (sx, sy) is axis × magnitude (0 = round). */
  sx: number;
  sy: number;
  /** Wobble: amplitude of the shape modes, its phase, and how fast the phase runs. */
  wob: number;
  wph: number;
  wvel: number;
  /** A transient kick of velocity (cells/s) from a split or a pop nearby. */
  kx: number;
  ky: number;
}

export const MAX_BUBBLES = 24;

/** Solver velocity units → cells per second: one step moves v·dt·(N−2) cells at 60 steps/s. */
const CELLS_PER_UNIT = 0.05 * 190 * 60;

export interface BubbleEvent {
  kind: 'pop' | 'merge' | 'split';
  x: number;
  y: number;
  r: number;
}

export class BubbleField {
  readonly bubbles: Bubble[] = [];
  /** x/N, y/N, r/N, opacity — the shader's position block. */
  readonly packed = new Float32Array(MAX_BUBBLES * 4);
  /** sx, sy, wobble amplitude, wobble phase — the shader's shape block. */
  readonly packedShape = new Float32Array(MAX_BUBBLES * 4);
  /** Things that happened this step, for the show to react to (a pop disturbs the dye). */
  readonly events: BubbleEvent[] = [];

  constructor(private readonly grid: number) {}

  clear(): void {
    this.bubbles.length = 0;
    this.events.length = 0;
  }

  private make(x: number, y: number, r: number, life: number, wob = 0.12): Bubble {
    return {
      x, y, r, age: 0, life,
      sx: 0, sy: 0,
      wob, wph: Math.random() * Math.PI * 2, wvel: 1.2 + Math.random() * 1.2,
      kx: 0, ky: 0,
    };
  }

  private push(b: Bubble): void {
    if (this.bubbles.length >= MAX_BUBBLES) {
      // Retire the oldest rather than refuse — a blow should always show.
      let oldest = 0;
      for (let k = 1; k < this.bubbles.length; k++) if (this.bubbles[k].age > this.bubbles[oldest].age) oldest = k;
      this.bubbles.splice(oldest, 1);
    }
    this.bubbles.push(b);
  }

  /** Blow `count` bubbles at (x, y), scattered within `spread` cells. Fresh air arrives wobbling. */
  spawn(x: number, y: number, r: number, count = 1, spread = 0): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * spread;
      this.push(this.make(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.65 + Math.random() * 0.7), 9 + Math.random() * 14, 0.1 + Math.random() * 0.08));
    }
  }

  /**
   * Advance by `dt` seconds. `velocity` samples the solver field in its own
   * units; `tiltX/Y` is the plate tilt (air climbs against it); `lifeScale`
   * stretches or shortens how long bubbles last; `agitation` (0..1, from the
   * treble) shakes them and pops the older ones.
   */
  step(dt: number, velocity: (x: number, y: number) => [number, number], tiltX: number, tiltY: number, lifeScale: number, agitation = 0): void {
    const N = this.grid;
    const bs = this.bubbles;
    this.events.length = 0;

    for (const b of bs) {
      const [vx, vy] = velocity(b.x, b.y);
      // Ride the dye, climb the tilt, carry any kick, and wander a little.
      const dx = vx * CELLS_PER_UNIT * 1.4 - tiltX * 900 + b.kx + (Math.random() - 0.5) * (0.5 + agitation * 1.5);
      const dy = vy * CELLS_PER_UNIT * 1.4 - tiltY * 900 + b.ky + (Math.random() - 0.5) * (0.5 + agitation * 1.5);
      b.x += dx * dt;
      b.y += dy * dt;
      b.kx *= Math.exp(-dt / 0.5);
      b.ky *= Math.exp(-dt / 0.5);
      b.age += dt;

      // Shape: stretch along the direction it is being dragged, relaxing
      // when the drag stops; the wobble runs down unless something feeds it.
      const speed = Math.hypot(dx, dy);
      const want = Math.min(0.45, speed * 0.22);
      const ax = speed > 1e-3 ? dx / speed : 0, ay = speed > 1e-3 ? dy / speed : 0;
      const k = 1 - Math.exp(-dt * 1.2);   // a bubble takes a second to take a new shape
      b.sx += (ax * want - b.sx) * k;
      b.sy += (ay * want - b.sy) * k;
      const wobTarget = Math.min(0.18, speed * 0.004 + agitation * 0.05);
      b.wob += (wobTarget - b.wob) * (1 - Math.exp(-dt * (b.wob > wobTarget ? 0.6 : 1.5)));
      b.wph += b.wvel * dt;
    }

    // Merge on contact: the larger absorbs the smaller, area-conserving,
    // and the survivor is left necked along the join and wobbling.
    for (let i = 0; i < bs.length; i++) {
      for (let j = bs.length - 1; j > i; j--) {
        const a = bs[i], c = bs[j];
        const ddx = a.x - c.x, ddy = a.y - c.y;
        const dist2 = ddx * ddx + ddy * ddy;
        // Fresh spray gets a moment to fly apart before it can merge back.
        if (a.age > 0.4 && c.age > 0.4 && dist2 < (a.r + c.r) * (a.r + c.r) * 0.5) {
          const wa = a.r * a.r, wc = c.r * c.r;
          a.x = (a.x * wa + c.x * wc) / (wa + wc);
          a.y = (a.y * wa + c.y * wc) / (wa + wc);
          a.r = Math.min(N * 0.05, Math.sqrt(wa + wc));
          a.age = Math.min(a.age, c.age);
          const dist = Math.sqrt(dist2) || 1;
          a.sx = (ddx / dist) * 0.25;
          a.sy = (ddy / dist) * 0.25;
          a.wob = Math.max(a.wob, 0.16);
          this.events.push({ kind: 'merge', x: a.x, y: a.y, r: a.r });
          bs.splice(j, 1);
        }
      }
    }

    // Split: a bubble stretched hard enough tears in two along its axis.
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      const s = Math.hypot(b.sx, b.sy);
      if (b.age > 3 && b.r > 3 && s > 0.4 && bs.length < MAX_BUBBLES && Math.random() < dt * 0.4) {
        const ux = b.sx / s, uy = b.sy / s;
        const r2 = b.r / Math.SQRT2;
        const gap = r2 * 1.3;
        const child = (dir: number) => {
          const nb = this.make(b.x + ux * gap * dir, b.y + uy * gap * dir, r2 * (0.85 + Math.random() * 0.3), b.life, 0.15);
          nb.kx = ux * 14 * dir; nb.ky = uy * 14 * dir;
          return nb;
        };
        this.events.push({ kind: 'split', x: b.x, y: b.y, r: b.r });
        bs.splice(i, 1, child(1), child(-1));
      }
    }

    // Pop: at the end of life, at the plate's edge, or shaken loose by the
    // treble — leaving a spray of smaller bubbles that don't last long.
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      const atEdge = b.x < b.r + 1 || b.y < b.r + 1 || b.x > N - b.r - 1 || b.y > N - b.r - 1;
      const shaken = b.age > 5 && Math.random() < dt * agitation * 0.06;
      if (b.age > b.life * lifeScale || atEdge || shaken) {
        this.events.push({ kind: 'pop', x: b.x, y: b.y, r: b.r });
        bs.splice(i, 1);
        if (!atEdge && b.r > 2 && bs.length < MAX_BUBBLES - 2) {
          const n = 2 + Math.floor(Math.random() * 2);
          for (let k = 0; k < n; k++) {
            const a = Math.random() * Math.PI * 2;
            const nb = this.make(b.x + Math.cos(a) * b.r * 0.9, b.y + Math.sin(a) * b.r * 0.9, b.r * (0.25 + Math.random() * 0.2), 2 + Math.random() * 2.5, 0.12);
            nb.kx = Math.cos(a) * 18; nb.ky = Math.sin(a) * 18;
            bs.push(nb);
          }
        }
      }
    }
  }

  /** Fill `packed` and `packedShape`; returns how many entries are live. */
  pack(lifeScale: number): number {
    const N = this.grid;
    let n = 0;
    for (const b of this.bubbles) {
      const end = b.life * lifeScale;
      const fadeIn = Math.min(1, b.age / 0.35);
      const fadeOut = Math.min(1, Math.max(0, (end - b.age) / 1.2));
      const o = n * 4;
      this.packed[o] = b.x / N;
      this.packed[o + 1] = b.y / N;
      this.packed[o + 2] = b.r / N;
      this.packed[o + 3] = fadeIn * fadeOut;
      this.packedShape[o] = b.sx;
      this.packedShape[o + 1] = b.sy;
      this.packedShape[o + 2] = b.wob;
      this.packedShape[o + 3] = b.wph;
      n++;
    }
    return n;
  }
}
