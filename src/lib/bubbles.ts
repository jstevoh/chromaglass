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
  /**
   * Fingering: how far the rim has broken into fingers (0 round, 1 the
   * fingers as long as the radius), how many there are, and where they sit.
   * Air pushed into liquid faster than the liquid can get out of its way
   * does not push a round front: the front breaks into fingers (Saffman and
   * Taylor), the thing a bubble blown through a straw between two plates
   * shows. Surface tension rounds it off again once the blowing stops.
   */
  fing: number;
  lobes: number;
  fph: number;
  /** Blown by hand through the straw (kept when the look has no bubbles of its own). */
  straw?: boolean;
  /** On the end of the straw this step: held there and growing. */
  held?: boolean;
}

export const MAX_BUBBLES = 40;

/**
 * How fast gas crosses from a small bubble to a large neighbour, in cells² a
 * second per unit of 1/r difference: a 3-cell bubble beside an 8-cell one
 * gives up its gas in about half a minute, which is slow enough to watch.
 */
const RIPEN = 1.4;

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
  /** fingering, finger count, finger phase, film age (0-1) — the air splat's shape block. */
  readonly packedFinger = new Float32Array(MAX_BUBBLES * 4);
  /** The bubble on the end of the straw, while there is one. */
  private strawBubble: Bubble | null = null;
  /** Things that happened this step, for the show to react to (a pop disturbs the dye). */
  readonly events: BubbleEvent[] = [];

  constructor(private readonly grid: number) {}

  clear(): void {
    this.bubbles.length = 0;
    this.events.length = 0;
    this.strawBubble = null;
  }

  /**
   * Let the look's own bubbles go and keep the ones blown by hand: a look
   * with no bubbles of its own still keeps what the straw put there.
   */
  clearLooks(): void {
    for (let i = this.bubbles.length - 1; i >= 0; i--) if (!this.bubbles[i].straw) this.bubbles.splice(i, 1);
  }

  /** Whether any bubble on the plate was blown by hand. */
  get anyBlown(): boolean { return this.bubbles.some((b) => b.straw); }

  private make(x: number, y: number, r: number, life: number, wob = 0.12): Bubble {
    return {
      x, y, r, age: 0, life,
      sx: 0, sy: 0,
      wob, wph: Math.random() * Math.PI * 2, wvel: 1.2 + Math.random() * 1.2,
      kx: 0, ky: 0,
      fing: 0, lobes: 8 + Math.floor(Math.random() * 7), fph: Math.random() * Math.PI * 2,
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
    const N = this.grid;
    for (let i = 0; i < count; i++) {
      /*
        Air on a plate does not arrive at one size. Every bubble came out
        within ±35% of the size asked for, which read as a sheet of identical
        rings (reported: "all basically the same size and take over the
        visualization"). Sizes in a real froth run heavy-tailed: many small,
        a few large. u³ puts two in three under 0.6 of the asked size and one
        in twenty past 1.7.
      */
      const u = Math.random();
      // Not under two cells: the air field is a grid, and a bubble smaller
      // than a cell cut a square hole in the dye rather than a round one.
      const size = Math.max(2, r * (0.3 + 2.1 * u * u * u));
      /*
        And they leave the liquid showing. Past a sixth of the plate under
        air the look is the bubbles rather than the liquid they sit in, so a
        spawn that would take it further is skipped (a blow through the
        straw is not a spawn and is not held to it).
      */
      let under = 0;
      for (const b of this.bubbles) under += b.r * b.r;
      if (Math.PI * (under + size * size) > N * N * 0.16) return;
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * spread;
      this.push(this.make(x + Math.cos(a) * d, y + Math.sin(a) * d, size, 9 + Math.random() * 14, 0.1 + Math.random() * 0.08));
    }
  }

  /**
   * Air blown through a straw held still at (x, y): one bubble on the end of
   * it, growing while the blowing goes on.
   *
   * Its area grows at a steady rate, as a steady breath delivers a steady
   * volume, so it swells fast at first and slows as it gets big, up to about
   * a seventh of the plate across. The faster it is growing, the more its rim
   * breaks into fingers; small bubbles are shed off the rim as it goes, the
   * ring of satellites round a blown bubble. Let go, it stays where it is and
   * rounds off, and a long time later pops; blow again beside it and the
   * plate fills with them.
   *
   * `strength` is the tool's Amount (1 is a steady breath).
   */
  blow(x: number, y: number, dt: number, strength = 1): void {
    const N = this.grid;
    const rMax = N * 0.07;
    let b = this.strawBubble;
    if (b && (!this.bubbles.includes(b) || Math.hypot(b.x - x, b.y - y) > b.r + 3)) {
      // Popped, or the straw has moved off it: the next breath is a new bubble.
      b = this.strawBubble = null;
    }
    if (!b) {
      b = this.make(x, y, Math.max(1, N * 0.008), 1e9, 0.08);
      b.straw = true;
      this.push(b);
      this.strawBubble = b;
    }
    const rate = Math.max(0.05, strength) * Math.PI * rMax * rMax / 3.5;   // cells² a second
    const r0 = b.r;
    b.r = Math.min(rMax, Math.sqrt(b.r * b.r + rate * dt / Math.PI));
    const speed = (b.r - r0) / Math.max(dt, 1e-4);                       // cells a second
    // Fingers as long as the growth is fast, relaxing toward that.
    const want = Math.min(1, speed / (N * 0.03)) * 0.55;
    b.fing += (want - b.fing) * (1 - Math.exp(-dt / 0.25));
    // Held at the straw.
    const k = Math.min(1, dt * 8);
    b.x += (x - b.x) * k; b.y += (y - b.y) * k;
    b.kx = 0; b.ky = 0;
    b.held = true;
    b.life = b.age + 60;
    // Satellites off the rim while it grows.
    if (speed > 0.2 && this.bubbles.length < MAX_BUBBLES - 1 && Math.random() < dt * 5 * Math.min(1, strength)) {
      const a = Math.random() * Math.PI * 2;
      const d = b.r * (1 + b.fing * 0.6) + 1.5 + Math.random() * 3;
      const sat = this.make(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, Math.max(0.8, N * (0.003 + Math.random() * 0.004)), 8 + Math.random() * 10, 0.1);
      sat.kx = Math.cos(a) * 8; sat.ky = Math.sin(a) * 8;
      this.push(sat);
    }
  }

  /**
   * Something landed on the plate at (x, y): dye from a dropper, or a blow
   * of air. A bubble under a drop of dye is burst by it — the film cannot
   * hold against the weight — and bubbles around the point are shoved away
   * along the spreading front. Air shoves harder and bursts nothing (fresh
   * air arrives as new bubbles elsewhere).
   */
  disturb(x: number, y: number, r: number, kind: 'dye' | 'air', strength = 1): void {
    const bs = this.bubbles;
    // The front spreads well past the drop itself.
    const reach = kind === 'air' ? r * 3 + 4 : r * 3 + 6;
    const shove = (kind === 'air' ? 40 : 22) * strength;
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      const dx = b.x - x, dy = b.y - y;
      const dist = Math.hypot(dx, dy) || 1e-3;
      if (kind === 'dye' && dist < r + b.r * 0.6 && b.age > 0.3) {
        this.events.push({ kind: 'pop', x: b.x, y: b.y, r: b.r });
        bs.splice(i, 1);
        if (b.r > 2 && bs.length < MAX_BUBBLES - 2) {
          const n = 2 + Math.floor(Math.random() * 2);
          for (let k = 0; k < n; k++) {
            const a = Math.random() * Math.PI * 2;
            const nb = this.make(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r, b.r * (0.25 + Math.random() * 0.2), 2 + Math.random() * 2.5, 0.12);
            nb.kx = Math.cos(a) * 20; nb.ky = Math.sin(a) * 20;
            bs.push(nb);
          }
        }
        continue;
      }
      if (dist < reach) {
        const k = shove * (1 - dist / reach);
        const ux = dx / dist, uy = dy / dist;
        // A shove sets the kick rather than adding to it, so a finger held
        // still does not wind a bubble up to escape velocity.
        if (Math.hypot(b.kx, b.ky) < k) { b.kx = ux * k; b.ky = uy * k; }
        b.wob = Math.max(b.wob, 0.06 * (1 - dist / reach));
      }
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

    // The bubbles on the end of the straw this step: held where it is, so
    // nothing below moves them (a satellite pressed against one, a merge).
    const heldNow = new Set(bs.filter((b) => b.held));
    for (const b of bs) {
      // A bubble on the end of the straw is held there; one let go rounds off.
      if (!b.held) b.fing *= Math.exp(-dt / 1.2);
      if (b.held) { b.held = false; b.age += dt; b.wph += b.wvel * dt; continue; }
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
      // Surface tension wins at small sizes: a small bubble stays round. Only
      // a large one stretches under drag, and it takes a couple of seconds.
      const speed = Math.hypot(dx, dy);
      const bigness = Math.max(0, Math.min(1, (b.r - 3) / 4));
      const want = Math.min(0.4, speed * 0.2) * bigness;
      const ax = speed > 1e-3 ? dx / speed : 0, ay = speed > 1e-3 ? dy / speed : 0;
      const k = 1 - Math.exp(-dt * 0.7);
      b.sx += (ax * want - b.sx) * k;
      b.sy += (ay * want - b.sy) * k;
      const wobTarget = Math.min(0.1, speed * 0.002 + agitation * 0.02) * bigness;
      b.wob += (wobTarget - b.wob) * (1 - Math.exp(-dt * (b.wob > wobTarget ? 0.5 : 1.0)));
      b.wph += b.wvel * dt;
    }

    // Cluster: bubbles nearby drift gently toward one another and then rest
    // against each other — the packed fields in every reference frame — and
    // only merge once they have sat pressed together for a while.
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], c = bs[j];
        const ddx = c.x - a.x, ddy = c.y - a.y;
        const dist = Math.hypot(ddx, ddy) || 1e-3;
        const touch = a.r + c.r;
        // A held bubble does not give: the other takes the whole of the move.
        const ka = heldNow.has(a) ? 0 : heldNow.has(c) ? 2 : 1;
        const kc = heldNow.has(c) ? 0 : heldNow.has(a) ? 2 : 1;
        if (dist < touch * 3 && dist > touch * 0.95) {
          const pull = 2.5 * dt * (1 - dist / (touch * 3));
          a.x += (ddx / dist) * pull * ka; a.y += (ddy / dist) * pull * ka;
          c.x -= (ddx / dist) * pull * kc; c.y -= (ddy / dist) * pull * kc;
        } else if (dist < touch * 0.95) {
          // Overlapping: push apart to rest edge to edge.
          const push = (touch * 0.95 - dist) * 0.5;
          a.x -= (ddx / dist) * push * ka; a.y -= (ddy / dist) * push * ka;
          c.x += (ddx / dist) * push * kc; c.y += (ddy / dist) * push * kc;
        }
      }
    }
    // Merge: two that have been pressed together long enough become one,
    // area-conserving; the survivor is left slightly necked along the join.
    for (let i = 0; i < bs.length; i++) {
      for (let j = bs.length - 1; j > i; j--) {
        const a = bs[i], c = bs[j];
        const ddx = a.x - c.x, ddy = a.y - c.y;
        const dist2 = ddx * ddx + ddy * ddy;
        if (a.age > 2 && c.age > 2 && dist2 < (a.r + c.r) * (a.r + c.r) * 0.92 && Math.random() < dt * 0.12) {
          const wa = a.r * a.r, wc = c.r * c.r;
          // Merged into the one on the straw, it stays on the straw.
          const pin = heldNow.has(a) ? a : heldNow.has(c) ? c : null;
          a.x = pin ? pin.x : (a.x * wa + c.x * wc) / (wa + wc);
          a.y = pin ? pin.y : (a.y * wa + c.y * wc) / (wa + wc);
          a.r = Math.min(a.straw || c.straw ? N * 0.07 : N * 0.05, Math.sqrt(wa + wc));
          if (c.straw) { a.straw = true; a.held = c.held; if (this.strawBubble === c) this.strawBubble = a; }
          a.age = Math.min(a.age, c.age);
          const dist = Math.sqrt(dist2) || 1;
          a.sx = (ddx / dist) * 0.18;
          a.sy = (ddy / dist) * 0.18;
          a.wob = Math.max(a.wob, 0.08);
          this.events.push({ kind: 'merge', x: a.x, y: a.y, r: a.r });
          bs.splice(j, 1);
        }
      }
    }

    /*
      Ostwald ripening: the big grow at the small's expense.

      The gas in a small bubble is at a higher pressure than in a large one
      (Laplace: the excess goes as 1/r), so where two sit close the gas
      diffuses through the liquid from the small to the large, and the small
      one shrinks away. It is what spreads a froth's sizes apart over time
      rather than leaving them all alike. The rate goes with the difference
      in 1/r and falls off with the gap; area is conserved.
    */
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], c = bs[j];
        // Not the bubble on the straw, or its own ring: the breath sets those.
        if (a.held || c.held || a.straw || c.straw) continue;
        const gap = Math.hypot(c.x - a.x, c.y - a.y) - a.r - c.r;
        const reach = 1.2 * (a.r + c.r);
        if (gap > reach) continue;
        const [sm, lg] = a.r < c.r ? [a, c] : [c, a];
        const dA = RIPEN * dt * (1 / Math.max(0.5, sm.r) - 1 / Math.max(0.5, lg.r)) * (1 - Math.max(0, gap) / reach);
        if (!(dA > 0)) continue;
        const take = Math.min(dA, sm.r * sm.r);
        sm.r = Math.sqrt(Math.max(0, sm.r * sm.r - take));
        lg.r = Math.min(N * 0.05, Math.sqrt(lg.r * lg.r + take));
      }
    }
    // Dissolved: ripened away to nothing, it goes without a pop.
    for (let i = bs.length - 1; i >= 0; i--) if (bs[i].r < 0.6 && !bs[i].held) bs.splice(i, 1);

    // Split: a bubble stretched hard enough tears in two along its axis.
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      const s = Math.hypot(b.sx, b.sy);
      if (b.age > 4 && b.r > 5 && s > 0.36 && bs.length < MAX_BUBBLES && Math.random() < dt * 0.3) {
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
      this.packedFinger[o] = b.fing;
      this.packedFinger[o + 1] = b.lobes;
      this.packedFinger[o + 2] = b.fph;
      // How far through its life the film is: it drains and thins as it
      // ages, which the plate draws as its colours shifting and then going
      // dark just before it pops, as a soap film does.
      this.packedFinger[o + 3] = Math.max(0, Math.min(1, b.age / Math.max(0.1, end)));
      n++;
    }
    return n;
  }
}
