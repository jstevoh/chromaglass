/**
 * Trapped air between the plates.
 *
 * After the blob itself, the most recognisable thing in a projected liquid
 * show is the bubble. Between two glasses it is not a free soap bubble but a
 * pancake: a pocket of air spanning the gap, its rim a meniscus against the
 * liquid. That decides how it lives. It has no film of its own to drain and
 * burst, so nothing ends it on a clock (PLAN 38b): it arrives as volume (a
 * breath through the straw, air the music lets into the oil, a press that
 * traps some) and it leaves only by the open rim, by merging into another,
 * by a drop landing on it, or by its gas dissolving into the liquid, which at
 * the real rate takes years.
 *
 * The solver has no second phase, so bubbles live here as a small particle
 * list riding the velocity field, each with a stretch and a film, and the
 * renderer draws them as one air field (gpu/air.ts) the plate shader reads.
 *
 * Every rate below is the liquid's own: its viscosity from the look's
 * Thickness, its surface tension and its gas solubility from whether it is
 * water or oil (`liquid`), and the gap from the dish's rest gap (38r moves
 * that constant; nothing here types a gap in millimetres).
 */
import { stream, type Rng } from './rng';
import { DISH_METRES, DISH_REST_GAP, OPEN_RIM, carrierViscosity, thicknessViscosity } from './turntable';
import { plateSin } from './plateRock';

export { DISH_METRES, DISH_REST_GAP };

export interface Bubble {
  id: number;
  x: number;    // logical grid cells
  y: number;
  r: number;    // radius, cells (of the equivalent circle)
  /** How long it has been on the plate, seconds. Times nothing; a drop's front spares a pocket that has only just arrived. */
  age: number;
  /** Air still coming in, in r² (cells²): a released pocket inflates at a breath's rate rather than appearing whole. */
  inject: number;
  /** Stretch along a direction: (sx, sy) is axis × (long semi-axis / equivalent radius − 1); 0 is round. */
  sx: number;
  sy: number;
  /** The liquid film it leaves on the glass, as a fraction of the gap (Bretherton; see `step`). */
  film: number;
  /** Open to the air at the rim and emptying (see `step`). */
  venting?: boolean;
  /** A transient kick of velocity (cells/s) from a drop's spreading front nearby. */
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

export const MAX_BUBBLES = 128;

/**
 * The liquid round the air, at the defaults: light mineral oil, about 17
 * mPa·s and 30 mN/m against air. `liquid()` replaces both every frame from
 * the look (PLAN 38n); a check that builds a field by hand keeps these.
 */
export const LIQUID_MU = 0.017;
export const LIQUID_SIGMA = 0.030;

/**
 * Reynolds/Chesters film drainage geometry factor (R_film / h_crit)².
 * For contact film radius R_film ~ 0.1 mm and critical rupture thickness h_crit ~ 1.2 nm,
 * (R_film / h_crit)² ≈ 7200. Scaled by Chesters drainage coefficient ~1.0,
 * this dimensionless factor bridges viscous-capillary time (μ/σ)·R_e (~1 ms) to
 * macroscopic film drainage times (~4–8 s).
 *
 * Shortcut: The factor is tuned so a 3-cell bubble pair (Re ≈ 1.5 cells ≈ 1.56 mm)
 * coalesces in ~6.4 s.
 */
export const DRAINAGE_FILM_FACTOR = 7200;

/**
 * The two carrier liquids a look names (its Viscosity word, lib/turntable.ts
 * carrierViscosity): water for 'thin', a light mineral oil for 'thick'.
 * Density kg/m³, surface tension against air N/m, and the Ostwald
 * coefficient of air in it (dissolved gas per volume of liquid over gas per
 * volume of air at the same pressure): about 0.018 for air in water, about
 * 0.09 in a light hydrocarbon oil, which dissolves five times as much.
 */
export const WATER_AIR = { rho: 1000, sigma: 0.072, ostwald: 0.018 };
export const OIL_AIR = { rho: 860, sigma: 0.030, ostwald: 0.09 };

/** Air's diffusivity in water, m²/s; in a thicker liquid by Stokes–Einstein, D ∝ 1/μ. */
const D_AIR_WATER = 2e-9;
const MU_WATER = 1e-3;
const ATMOSPHERE = 101325;
const G = 9.81;

/**
 * A pancake's film (Park and Homsy 1984, Bretherton's law with the half gap
 * as the tube's radius): a pocket moving at capillary number Ca leaves a
 * film on each glass 1.337·Ca^⅔·(b/2) thick, and drags on it, so it runs
 * ahead of the liquid by 2/(1 + 2.26·Ca^⅔) rather than Taylor and Saffman's
 * film-free 2 (PLAN 38n).
 */
const FILM_COEF = 0.6685;
const FILM_DRAG = 2.26;

/**
 * The film's range in the packed byte, as a fraction of the gap: from Ca
 * 1e-6 (a pocket all but still) to Ca 1e-2 (one carried by a hard push), a
 * log scale over the two and two-thirds decades between.
 */
const FILM_LO = FILM_COEF * 1e-4;
const FILM_DECADES = Math.log10(Math.pow(1e-2, 2 / 3) / 1e-4);

/**
 * How far a pocket stretches before it tears in two: a deformation
 * (L − B)/(L + B) of one half, three to one. Taylor's critical deformation
 * for a drop much thinner than the liquid round it is about there, and a
 * pancake stretched further necks in the middle (the rest of the necking,
 * which a list of discs cannot draw, is PLAN 38g-2).
 */
const SPLIT_D = 0.5;

/** Two rims nearer than this many cells are touching: the film between them is microns, a cell is a millimetre. */
const CONTACT = 0.05;

/** Solver velocity units → cells per second: one step moves v·dt·(N−2) cells at 60 steps/s. */
const CELLS_PER_UNIT = 0.05 * 190 * 60;

export interface BubbleEvent {
  kind: 'pop' | 'merge' | 'split';
  x: number;
  y: number;
  r: number;
}

/** Long semi-axis over equivalent radius, minus one, for a deformation D = (L − B)/(L + B). */
function stretchOf(D: number): number {
  const d = Math.min(0.95, Math.max(0, D));
  return Math.sqrt((1 + d) / (1 - d)) - 1;
}

export class BubbleField {
  readonly bubbles: Bubble[] = [];
  /** x/N, y/N, r/N, opacity — the shader's position block. */
  readonly packed = new Float32Array(MAX_BUBBLES * 4);
  /** sx, sy, and two zeros where a wobble was (a pocket in oil is overdamped) — the shape block. */
  readonly packedShape = new Float32Array(MAX_BUBBLES * 4);
  /** fingering, finger count, finger phase, film (0-1, log of its thickness) — the air splat's shape block. */
  readonly packedFinger = new Float32Array(MAX_BUBBLES * 4);
  /** The bubble on the end of the straw, while there is one. */
  private strawBubble: Bubble | null = null;
  /** Things that happened this step, for the show to react to (the liquid closing into a pocket that left). */
  readonly events: BubbleEvent[] = [];
  private nextId = 1;

  /** The liquid's dynamic viscosity μ, Pa·s. */
  liquidMu = LIQUID_MU;
  /** Its surface tension σ against air, N/m. */
  liquidSigma = LIQUID_SIGMA;
  /** Its density, kg/m³ (the buoyant drift). */
  liquidRho = OIL_AIR.rho;
  /** Air's Ostwald coefficient in it (how fast a pocket dissolves). */
  liquidOstwald = OIL_AIR.ostwald;
  /** The gap between the glasses, metres: the dish's rest gap. */
  gapMetres = DISH_REST_GAP * DISH_METRES;
  /**
   * How many times the real rate air dissolves into the liquid. 1 is real,
   * and real is effectively never on a show's clock (see `step`); a dial
   * may scale it past nature, as the owner's rule allows, without the law
   * underneath changing (PLAN 38b-2).
   */
  dissolve = 1;

  /**
   * Film drainage contact time (seconds) between touching bubble pairs (PLAN 18i).
   * Key: min(id1, id2) * 2^26 + max(id1, id2) to avoid string allocation.
   */
  private readonly contactDrain = new Map<number, number>();
  private readonly touchingNow = new Set<number>();
  /** The bubbles on the end of the straw this step (kept, not made each step). */
  private readonly heldNow = new Set<Bubble>();

  /**
   * `rng` decides every size, scatter and finger: the show's
   * `plate.bubbles` stream unless a check hands in its own. A stream of its
   * own rather than a share of one, so a bubble that learns to draw one more
   * number cannot move where the beads land (lib/rng.ts, `npm run seed`).
   */
  constructor(private readonly grid: number, private readonly rng: Rng = stream('plate.bubbles')) {}

  /**
   * The look's liquid. With Thin Gap on (every look) its viscosity is the
   * Thickness dial's, on the same log scale from water to glycerine the
   * thin-gap solver drags with; off, the Viscosity word's. The word also
   * says whether the carrier is water ('thin') or oil, which sets the
   * surface tension and how much air it dissolves.
   */
  liquid(s: { thinGap?: number; gapThickness?: number; viscosity?: string }): void {
    const c = s.viscosity === 'thin' ? WATER_AIR : OIL_AIR;
    this.liquidRho = c.rho;
    this.liquidSigma = c.sigma;
    this.liquidOstwald = c.ostwald;
    // 0.45 is the default Thickness (types.ts), a light mineral oil.
    const nu = (s.thinGap ?? 1) > 0 ? thicknessViscosity(Number.isFinite(s.gapThickness) ? s.gapThickness! : 0.45) : carrierViscosity(s.viscosity);
    this.liquidMu = c.rho * nu;
  }

  clear(): void {
    this.bubbles.length = 0;
    this.events.length = 0;
    this.strawBubble = null;
    this.contactDrain.clear();
    this.touchingNow.clear();
    this.nextId = 1;
  }

  /**
   * Let the look's own bubbles go and keep the ones blown by hand: a look
   * with no bubbles of its own still keeps what the straw put there.
   */
  clearLooks(): void {
    for (let i = this.bubbles.length - 1; i >= 0; i--) if (!this.bubbles[i].straw) this.bubbles.splice(i, 1);
    this.contactDrain.clear();
    this.touchingNow.clear();
  }

  /** Whether any bubble on the plate was blown by hand. */
  get anyBlown(): boolean { return this.bubbles.some((b) => b.straw); }

  /** The film a front moving at `cellsPerSecond` lays on the glass, as a fraction of the gap. */
  private filmAt(cellsPerSecond: number): number {
    const Ca = (this.liquidMu * Math.abs(cellsPerSecond) * (DISH_METRES / this.grid)) / this.liquidSigma;
    return FILM_COEF * Math.cbrt(Ca * Ca);
  }

  /** A steady breath's volume, as r² a second (cells²): the straw fills a seventh of the plate across in 3.5 s. */
  private get breath(): number {
    const rMax = this.grid * 0.07;
    return (rMax * rMax) / 3.5;
  }

  private make(x: number, y: number, r: number): Bubble {
    return {
      id: this.nextId++,
      x, y, r, age: 0, inject: 0,
      sx: 0, sy: 0, film: 0,
      kx: 0, ky: 0,
      fing: 0, lobes: 8 + this.rng.int(7), fph: this.rng.angle(),
    };
  }

  /**
   * Onto the list, if the air field has room. Only the straw's own pocket
   * is put on a full plate, by retiring the oldest: the field holds 128
   * discs, a GPU buffer's size and not a property of air, and a breath
   * should always show.
   */
  private push(b: Bubble, force = false): boolean {
    if (this.bubbles.length >= MAX_BUBBLES) {
      if (!force) return false;
      let oldest = 0;
      for (let k = 1; k < this.bubbles.length; k++) if (this.bubbles[k].age > this.bubbles[oldest].age) oldest = k;
      this.bubbles.splice(oldest, 1);
    }
    this.bubbles.push(b);
    return true;
  }

  /** One half of `b` torn along its axis, centred (dx, dy) from it: half its air, all else its own. */
  private half(b: Bubble, dx: number, dy: number): Bubble {
    const nb = this.make(b.x + dx, b.y + dy, b.r / Math.SQRT2);
    nb.film = b.film;
    nb.age = b.age;
    nb.inject = b.inject / 2;
    nb.venting = b.venting;
    nb.straw = b.straw;
    return nb;
  }

  /** Let `count` pockets of air in at (x, y), scattered within `spread` cells. Each inflates at a breath's rate. */
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
      const u = this.rng.float();
      // Not under two cells: the air field is a grid, and a bubble smaller
      // than a cell cut a square hole in the dye rather than a round one.
      const size = Math.max(2, r * (0.3 + 2.1 * u * u * u));
      /*
        And they leave the liquid showing. Past a sixth of the plate under
        air the look is the bubbles rather than the liquid they sit in, so a
        spawn that would take it further is skipped (a blow through the
        straw is not a spawn and is not held to it). The air still to come
        counts: it is on its way.
      */
      let under = 0;
      for (const b of this.bubbles) under += b.r * b.r + b.inject;
      if (Math.PI * (under + size * size) > N * N * 0.16) return;
      const a = this.rng.angle();
      const d = this.rng.float() * spread;
      const b = this.make(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.5);
      /*
        It comes in as volume, at the rate a steady breath does, so a pocket
        swells from a point in a fifth of a second rather than appearing whole
        or fading in like a sprite (it faded in over 0.35 s). Its film is the
        one its own front lays down as it grows (`filmAt`).
      */
      b.inject = size * size - b.r * b.r;
      b.film = this.filmAt(this.breath / (2 * size));
      if (!this.push(b)) return;
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
   * rounds off; blow again beside it and the plate fills with them.
   *
   * `strength` is the breath's volume a second against a steady breath's
   * (lib/breath.ts, strawFlow: the Amount, which is the breath's speed). It
   * had a floor of 0.05, which held every Amount under about a fifth (the
   * hands passed the Amount squared) at the same breath (PLAN.md QA-20).
   */
  blow(x: number, y: number, dt: number, strength = 1): void {
    const N = this.grid;
    const rMax = N * 0.07;
    let b = this.strawBubble;
    if (b && (!this.bubbles.includes(b) || Math.hypot(b.x - x, b.y - y) > b.r + 3)) {
      // Gone, or the straw has moved off it: the next breath is a new bubble.
      b = this.strawBubble = null;
    }
    if (!b) {
      b = this.make(x, y, Math.max(1, N * 0.008));
      b.straw = true;
      this.push(b, true);
      this.strawBubble = b;
    }
    const rate = Math.max(0, strength || 0) * Math.PI * rMax * rMax / 3.5;   // cells² a second
    const r0 = b.r;
    // Up to a seventh of the plate; one a merge made bigger keeps its air.
    b.r = Math.max(b.r, Math.min(rMax, Math.sqrt(b.r * b.r + rate * dt / Math.PI)));
    const speed = (b.r - r0) / Math.max(dt, 1e-4);                       // cells a second
    // The film under it is the one its growing rim lays down.
    if (speed > 0) b.film = this.filmAt(speed);
    // Fingers as long as the growth is fast, relaxing toward that.
    const want = Math.min(1, speed / (N * 0.03)) * 0.55;
    b.fing += (want - b.fing) * (1 - Math.exp(-dt / 0.25));
    // Saffman-Taylor wavelength scaling: lambda ≈ pi * b_eff / sqrt(Ca) (PLAN 18i).
    // An advancing air front in a Hele-Shaw cell destabilizes into fingers with
    // wavelength lambda (Saffman & Taylor 1958, Paterson 1981). The number of lobes
    // around the perimeter 2 * pi * R is m ≈ (2 * pi * R) / lambda ≈ (2 * R / b_eff) * sqrt(Ca).
    // Physical speed U (m/s) = speed * (DISH_METRES / N).
    // Capillary number Ca = μ * U / σ.
    if (speed > 0.1) {
      const uMps = speed * (DISH_METRES / N);
      const Ca = Math.max(1e-4, (this.liquidMu * uMps) / this.liquidSigma);
      // Effective meniscus neck gap b_eff ≈ 0.091 cells (0.095 mm) is a tuned shortcut:
      // about 63x smaller than the real 6 mm plate gap (DISH_REST_GAP * DISH_METRES).
      // If the physical 6 mm gap (b ≈ 5.76 cells) were used directly, m ≈ (2R/b)*sqrt(Ca) ~ 0.5 lobes,
      // meaning a bubble on a 192 grid would never form more than 1 finger.
      // b_eff is set in cells (moves with grid size) to produce 6-18 visible Saffman-Taylor
      // lobes on the discrete grid. Lobe count scales as m ∝ R * sqrt(Ca) between the clamps.
      const m = Math.round(22.0 * b.r * Math.sqrt(Ca));
      b.lobes = Math.min(18, Math.max(6, m));
    }
    // Held at the straw.
    const k = Math.min(1, dt * 8);
    b.x += (x - b.x) * k; b.y += (y - b.y) * k;
    b.kx = 0; b.ky = 0;
    b.held = true;
    // Satellites off the rim while it grows.
    if (speed > 0.2 && this.bubbles.length < MAX_BUBBLES - 1 && this.rng.float() < dt * 5 * Math.min(1, strength)) {
      const a = this.rng.angle();
      const d = b.r * (1 + b.fing * 0.6) + 1.5 + this.rng.float() * 3;
      const sat = this.make(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, Math.max(0.8, N * (0.003 + this.rng.float() * 0.004)));
      sat.film = b.film;
      sat.kx = Math.cos(a) * 8; sat.ky = Math.sin(a) * 8;
      this.push(sat);
    }
  }

  /**
   * Something landed on the plate at (x, y): dye from a dropper, or a blow
   * of air. A pocket under a drop of dye is taken by it, the liquid closing
   * where the air was (the engulfing PLAN 38b keeps), and bubbles around the
   * point are shoved away along the spreading front. Air shoves harder and
   * takes nothing (fresh air arrives as new bubbles elsewhere).
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
        // No spray of daughters: that was a free soap film's rim retracting
        // (Culick), and a pocket between glasses has no film to retract.
        this.events.push({ kind: 'pop', x: b.x, y: b.y, r: b.r });
        bs.splice(i, 1);
        continue;
      }
      if (dist < reach) {
        const k = shove * (1 - dist / reach);
        const ux = dx / dist, uy = dy / dist;
        // A shove sets the kick rather than adding to it, so a finger held
        // still does not wind a bubble up to escape velocity.
        if (Math.hypot(b.kx, b.ky) < k) { b.kx = ux * k; b.ky = uy * k; }
      }
    }
  }

  /**
   * Advance by `dt` seconds. `velocity` samples the solver field in its own
   * units; `tiltX/Y` is the plate's hold tilt (air climbs against it);
   * `agitation` (0..1, from the treble) shakes them.
   */
  step(dt: number, velocity: (x: number, y: number) => [number, number], tiltX: number, tiltY: number, agitation = 0): void {
    const N = this.grid;
    const bs = this.bubbles;
    const m = DISH_METRES / N;            // metres a cell
    const gap = this.gapMetres;
    const mu = this.liquidMu, sigma = this.liquidSigma;
    this.events.length = 0;

    /*
      Buoyancy on a tilted plate: the air is pushed up the slope by Δρ·g·sinθ
      and the liquid lets it through at Darcy's b²/12μ, so a pocket climbs at
      Δρ·g·sinθ·b²/(12μ) (PLAN 38n), in the liquid's own viscosity and the
      real gap. It was −tilt·900 cells a second for every liquid and size.
    */
    const climb = (this.liquidRho * G * gap * gap) / (12 * mu) / m;
    const sinX = plateSin(tiltX, 0), sinY = plateSin(tiltY, 0);
    const rimR = OPEN_RIM * N, cx0 = N / 2, cy0 = N / 2;
    // Air's diffusivity in this liquid, and how far a pocket's depleted shell reaches (the plate).
    const D = D_AIR_WATER * (MU_WATER / mu);
    const breath = this.breath;

    // The bubbles on the end of the straw this step: held where it is, so
    // nothing below moves them (a satellite pressed against one, a merge).
    const heldNow = this.heldNow;
    heldNow.clear();
    for (const b of bs) if (b.held) heldNow.add(b);
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      // A bubble on the end of the straw is held there; one let go rounds off.
      if (!b.held) b.fing *= Math.exp(-dt / 1.2);
      b.age += dt;
      if (b.inject > 0) {
        const add = Math.min(b.inject, breath * dt);
        b.r = Math.sqrt(b.r * b.r + add);
        b.inject -= add;
      }
      if (b.held) { b.held = false; continue; }
      const [vx, vy] = velocity(b.x, b.y);
      /*
        Taylor and Saffman: a pocket of inviscid air spanning the gap runs at
        twice the depth-mean liquid speed, slowed by the drag of the film it
        leaves on each glass (FILM_DRAG). It was 1.5 for 2, tuned so the
        bubbles kept the show's pace; the real 2 is the law here (PLAN 38n).
      */
      const vMag = Math.hypot(vx, vy) * CELLS_PER_UNIT;
      const Ca = (mu * vMag * m) / sigma;
      const speedRatio = 2 / (1 + FILM_DRAG * Math.cbrt(Ca * Ca));
      // In the absence of audio agitation, millimeter air pancakes between plates
      // have zero artificial Brownian wander (Pe >> 10^6, thermal drift < 10^-6 m/s).
      // Treble acoustic agitation provides physical vibrational jitter scaling continuously
      // in proportion to agitation (from 0 at 0 up to 2.0 at full agitation), with two
      // independent random draws for x and y.
      const wanderScale = agitation * 2.0;
      const wx = wanderScale > 0 ? this.rng.centred() * wanderScale : 0;
      const wy = wanderScale > 0 ? this.rng.centred() * wanderScale : 0;
      const dx = vx * CELLS_PER_UNIT * speedRatio - sinX * climb + b.kx + wx;
      const dy = vy * CELLS_PER_UNIT * speedRatio - sinY * climb + b.ky + wy;
      b.x += dx * dt;
      b.y += dy * dt;
      b.kx *= Math.exp(-dt / 0.22);
      b.ky *= Math.exp(-dt / 0.22);
      const speed = Math.hypot(dx, dy);
      const R = b.r * m;

      /*
        Its film: a moving pocket lays a fresh one, Bretherton's thickness for
        its own speed, over the glass it crosses, so the film under it turns
        over as fast as it sweeps its own width; a still one keeps the film it
        was last laid on. The plate draws the pocket's colour from this rather
        than from a random number and a clock (PLAN 38n).
      */
      const filmT = this.filmAt(speed);
      b.film += (filmT - b.film) * (1 - Math.exp(-dt * speed / Math.max(1, 2 * b.r)));

      /*
        Its shape: strain in the flow stretches it and its rim pulls it back.
        A pancake's n = 2 mode relaxes at τ₂ = 2μR³/(b²σ) (Paterson 1981):
        in the default oil, 0.04 ms at 1 mm, 4.5 ms at 5 mm and a tenth of a
        second for a pocket the straw blew at today's 6 mm gap (nine times
        those at 2 mm), so small ones are round whatever the flow does and
        big ones stay long. Held in a strain rate ε it settles at a
        deformation 2ε·τ₂ along the stretching axis: round an inviscid
        pancake the outer potential is (ε/2)(r² − R⁴/r²)cos 2θ, so its rim
        is pushed out at 2εR·cos 2θ, the same 2 as in its 2U drift. It was a
        stretch of 0.2 per cell/s of drift relaxing at 1.4 s for every size;
        drift alone does not deform a pocket (a circle translates as a
        circle in Hele-Shaw flow), strain does.
      */
      const tau2 = (2 * mu * R * R * R) / (gap * gap * sigma);
      // Under a millisecond it is round at any strain the plate makes (a few
      // a second): the four samples of the strain are spent only on big ones.
      let eps = 0, half = 0, exy = 0;
      if (tau2 > 1e-3) {
        const h = Math.max(1, b.r);
        const [ux1, uy1] = velocity(b.x + h, b.y), [ux0, uy0] = velocity(b.x - h, b.y);
        const [ux3, uy3] = velocity(b.x, b.y + h), [ux2, uy2] = velocity(b.x, b.y - h);
        const k2h = CELLS_PER_UNIT / (2 * h);
        half = 0.5 * ((ux1 - ux0) - (uy3 - uy2)) * k2h;
        exy = 0.5 * ((ux3 - ux2) + (uy1 - uy0)) * k2h;
        eps = Math.hypot(half, exy);                         // principal strain rate, 1/s
      }
      const D0 = 2 * eps * tau2;
      let tx = 0, ty = 0;
      if (eps > 1e-9) {
        const th = 0.5 * Math.atan2(exy, half);
        const s = stretchOf(D0);
        tx = Math.cos(th) * s; ty = Math.sin(th) * s;
        // An ellipse is the same either way along its axis: relax toward the nearer.
        if (tx * b.sx + ty * b.sy < 0) { tx = -tx; ty = -ty; }
      }
      const kRelax = 1 - Math.exp(-dt / Math.max(1e-6, tau2));
      b.sx += (tx - b.sx) * kRelax;
      b.sy += (ty - b.sy) * kRelax;

      /*
        Dissolving. The air in a pocket is above atmospheric by its Laplace
        pressure σ(2/b + 1/R), so it dissolves into liquid that is saturated
        at the atmosphere (it is open to it at the rim) at Henry's law's
        rate, through a shell that reaches across the plate: a pancake loses
        area at 2π·D·L·(Δp/p₀)/ln(R_plate/R). With air's D in the oil
        (Stokes–Einstein from water's 2e-9 m²/s) and L its Ostwald
        coefficient, a 3 mm pocket in the default oil takes centuries. That is
        the real answer: between glasses a pocket does not melt away on a
        show's clock. It was ripened away by its neighbours at about a
        million times that rate. `dissolve` scales D past nature.
      */
      const dp = sigma * (2 / gap + 1 / Math.max(R, 1e-5)) / ATMOSPHERE;
      const dA = (2 * Math.PI * D * this.liquidOstwald * dp * this.dissolve) / Math.max(1, Math.log((DISH_METRES / 2) / Math.max(R, 1e-5)));
      b.r = Math.sqrt(Math.max(0, b.r * b.r - (dA / (Math.PI * m * m)) * dt));

      /*
        Leaving at the rim. The dish's rim is open (OPEN_RIM, 18g-1): a pocket
        whose edge reaches it opens to the air, and the liquid pressed in
        by the meniscus's 2σ/b closes it from behind, through the gap's
        b²/12μ, its edge moving at bσ/(6μR). So its area falls at a steady
        π·bσ/(3μ): a millimetre pocket is gone inside a frame, the biggest
        the straw blows in under a tenth of a second at a 6 mm gap and a
        fifth at 2 mm. It used to pop where its disc
        touched the square around the dish.
      */
      if (!b.venting && Math.hypot(b.x - cx0, b.y - cy0) + b.r >= rimR) {
        b.venting = true;
        this.events.push({ kind: 'pop', x: b.x, y: b.y, r: b.r });
      }
      if (b.venting) b.r = Math.sqrt(Math.max(0, b.r * b.r - ((gap * sigma) / (3 * mu)) / (m * m) * dt));
      if (b.r < 0.3 && b.inject <= 0) { bs.splice(i, 1); continue; }

      /*
        Breaking up: held at a strain that would stretch it past SPLIT_D, and
        stretched there, it tears in two equal halves of its area, side by
        side along the axis. It was a 0.3-a-second dice roll on any bubble
        over five cells stretched past 0.36, the halves flung apart.
      */
      const sMag = Math.hypot(b.sx, b.sy);
      if (D0 >= SPLIT_D && sMag >= 0.9 * stretchOf(SPLIT_D) && bs.length < MAX_BUBBLES) {
        const ux = b.sx / sMag, uy = b.sy / sMag;
        const r2 = b.r / Math.SQRT2;
        this.events.push({ kind: 'split', x: b.x, y: b.y, r: b.r });
        bs.splice(i, 1, this.half(b, ux * r2, uy * r2), this.half(b, -ux * r2, -uy * r2));
      }
    }

    /*
      Merging. Two pockets pressed together drain the liquid film between
      them (Reynolds), in a time that grows with their reduced radius and
      μ/σ; once it ruptures, the neck between them grows at σ/μ (Yokota and
      Okumura), a couple of metres a second, so inside the step. What is
      left to see is the one pocket the two made, as long as the pair was
      end to end, rounding off at its own τ₂ (above): a big one stays long a
      while, a small one is round by the next frame. It was one disc at once
      with a fixed 0.18 stretch.
    */
    this.touchingNow.clear();
    for (let i = 0; i < bs.length; i++) {
      for (let j = bs.length - 1; j > i; j--) {
        const a = bs[i], c = bs[j];
        const ddx = a.x - c.x, ddy = a.y - c.y;
        const dist = Math.hypot(ddx, ddy);
        if (dist >= a.r + c.r + CONTACT || a.inject > 0 || c.inject > 0) continue;
        const key = Math.min(a.id, c.id) * (2 ** 26) + Math.max(a.id, c.id);
        this.touchingNow.add(key);
        const Re = (a.r * c.r) / (a.r + c.r);
        // Stefan-Reynolds thin-film drainage: t_drain = DRAINAGE_FILM_FACTOR * (μ / σ) * Re_metres.
        const tDrain = DRAINAGE_FILM_FACTOR * (mu / sigma) * Re * m;
        const contact = (this.contactDrain.get(key) ?? 0) + dt;
        this.contactDrain.set(key, contact);
        if (contact < tDrain) continue;
        this.contactDrain.delete(key);
        const wa = a.r * a.r, wc = c.r * c.r;
        // Merged into the one on the straw, it stays on the straw.
        const pin = heldNow.has(a) ? a : heldNow.has(c) ? c : null;
        const ex = dist > 1e-6 ? ddx / dist : 1, ey = dist > 1e-6 ? ddy / dist : 0;
        const Rm = Math.sqrt(wa + wc);
        // End to end the pair was dist + a.r + c.r long: an ellipse that long of the pair's area.
        const s = Math.min(stretchOf(0.95), Math.max(0, (dist + a.r + c.r) / (2 * Rm) - 1));
        a.x = pin ? pin.x : (a.x * wa + c.x * wc) / (wa + wc);
        a.y = pin ? pin.y : (a.y * wa + c.y * wc) / (wa + wc);
        // Every bit of both: air leaves only by the rim, a drop or dissolving.
        a.r = Rm;
        a.film = (a.film * wa + c.film * wc) / (wa + wc);
        a.venting = a.venting || c.venting;
        if (c.straw) { a.straw = true; a.held = c.held; if (this.strawBubble === c) this.strawBubble = a; }
        a.age = Math.min(a.age, c.age);
        a.sx = ex * s;
        a.sy = ey * s;
        this.events.push({ kind: 'merge', x: a.x, y: a.y, r: a.r });
        bs.splice(j, 1);
      }
    }
    for (const key of this.contactDrain.keys()) {
      if (!this.touchingNow.has(key)) this.contactDrain.delete(key);
    }

    /*
      Crowding (Durian's bubble model, PLAN 38g). Two pockets pressed into
      each other push back with a stiffness of their Laplace pressure over
      the contact, k = σ·b/R̃ for their reduced radius R̃, and each gives
      way against its own drag in the gap, ξ = 6πμR²/b, so the overlap
      relaxes at τ = 1/(k(1/ξa + 1/ξc)) and the small one moves the more.
      For two of a size that is 3π/8 of their τ₂ (above): a fraction of a
      millisecond for millimetre pockets, which stay round and edge to edge,
      and a tenth of a second or more for big ones, which a push squeezes
      flat against each other. It was a push to 0.98 of
      their radii every step, half each, whatever their sizes.
    */
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], c = bs[j];
        const ddx = c.x - a.x, ddy = c.y - a.y;
        const dist = Math.hypot(ddx, ddy) || 1e-3;
        const over = a.r + c.r - dist;
        if (over <= 0) continue;
        const Ra = Math.max(a.r, 0.3) * m, Rc = Math.max(c.r, 0.3) * m;
        const k = (sigma * gap * (Ra + Rc)) / (Ra * Rc);
        // A held bubble does not give: the other takes the whole of the move.
        const ma = heldNow.has(a) ? 0 : gap / (6 * Math.PI * mu * Ra * Ra);
        const mc = heldNow.has(c) ? 0 : gap / (6 * Math.PI * mu * Rc * Rc);
        if (ma + mc <= 0) continue;
        const close = over * (1 - Math.exp(-dt * k * (ma + mc)));
        const pa = close * ma / (ma + mc), pc = close * mc / (ma + mc);
        a.x -= (ddx / dist) * pa; a.y -= (ddy / dist) * pa;
        c.x += (ddx / dist) * pc; c.y += (ddy / dist) * pc;
      }
    }
  }

  /** Fill `packed`, `packedShape` and `packedFinger`; returns how many entries are live. */
  pack(): number {
    const N = this.grid;
    let n = 0;
    for (const b of this.bubbles) {
      if (n >= MAX_BUBBLES) break;
      const o = n * 4;
      this.packed[o] = b.x / N;
      this.packed[o + 1] = b.y / N;
      this.packed[o + 2] = b.r / N;
      // Air is there or it is not: a pocket arrives by growing and leaves by
      // shrinking (above), never by fading.
      this.packed[o + 3] = 1;
      this.packedShape[o] = b.sx;
      this.packedShape[o + 1] = b.sy;
      this.packedShape[o + 2] = 0;
      this.packedShape[o + 3] = 0;
      this.packedFinger[o] = b.fing;
      this.packedFinger[o + 1] = b.lobes;
      this.packedFinger[o + 2] = b.fph;
      // Its film, on a log scale from a still pocket's to a hard-pushed one's (FILM_LO).
      this.packedFinger[o + 3] = Math.max(0, Math.min(1, Math.log10(Math.max(b.film, 1e-12) / FILM_LO) / FILM_DECADES));
      n++;
    }
    return n;
  }
}
