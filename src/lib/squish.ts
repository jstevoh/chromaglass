/**
 * A hand on the top glass, and the glass coming back up (PLAN.md §10 step 4,
 * roadmap G in docs/bubbles-plan.md).
 *
 * What was reported: "a squeeze gives a smooth ring and a lift breaks into
 * fingers; today both finger". Squeezing a Hele-Shaw cell drives the liquid
 * outward, the viscous film pushing the thinner one ahead of it, and that is
 * the *stable* direction of Saffman–Taylor: the front stays round and the
 * dye piles into a clean ring. Lifting is the unstable one. The gap opens,
 * the film is sucked back in, and whatever is thinner (air, or the clear
 * liquid round the ring) invades the viscous film as fingers. Anyone who has
 * pressed two plates of glass together with a drop of paint between them and
 * pulled them apart has seen it: the paint comes away as a fern, never as a
 * ring.
 *
 * The plate had the two strokes the wrong way round. Its fingers were drawn
 * on the way down (`applySquish` thinning the film along a ring of spokes
 * and shoving the outflow along them) and the lift, which the solver does
 * run (the gap's spring, `squeezeUpdate` in wgsl/fluid.ts), had nothing in
 * it but a smooth inflow: the unstable stroke with no instability at all.
 *
 * So the press is now smooth: the film thins evenly under the palm, the
 * centre clears and the dye piles into a round rim. And a press remembers
 * itself. When it lets go (no press for 150 ms, the same pause that already
 * told one press from the next), the glass comes up over the next second,
 * and while it does the spokes come in from the rim: the gap opens fastest
 * along them and the liquid runs inward down them, so the rim the press
 * piled up is drawn back into the cleared centre as fingers. How hard the
 * lift fingers follows how deep the press went, so a long hard press lifts
 * into long fingers and a tap into short ones.
 *
 * The spokes are the same ones the press used to draw: their count, phase
 * and ragged widths come from where the press is and from Fingering. With
 * Fingering at 0 there are no spokes, the lift adds nothing, and the plate
 * is the plate it was (the gap's own spring still lifts it, smoothly).
 *
 * A drop's splash keeps its fingers on the way down: a falling drop's crown
 * spreading over the film is a different instability (the rim of a spreading
 * sheet, Rayleigh–Plateau), and a splash that went round would be a
 * regression nobody asked for. It is the `splash` stroke, drawn exactly as
 * every press was before.
 *
 * Pure, so the lab (`npm run lift`) lays the very same strokes on its plate
 * as the app does, and measures them there.
 */

/** A pause this long between presses is a release (ms): the same mark that told one press from the next. */
export const RELEASE_MS = 150;
/** How long the glass takes to come back up far enough to finger, in seconds of show. */
export const LIFT_SECONDS = 1.2;
/**
 * The lift's envelope time constant (s). The fingers form in the first
 * moments of the lift, while the gap opens fastest, and are then carried by
 * the flow: an exponential rather than a flat second, so they grow out of
 * the rim rather than switching on and off.
 */
export const LIFT_TAU = 0.3;
/**
 * The deepest press the lift remembers: the gap delta the outermost disc of
 * a press lays per step, summed over its steps. The film cannot go thinner
 * than the shader's floor, so past about 0.026 (the rest gap of 0.03 down to
 * 0.004) a longer press is not a deeper one: the Press tool held at 1× gets
 * there in about a tenth of a second, and a kick's squeeze at full would be
 * about a tenth of the way (Beat Squeeze lays nothing yet, PLAN §10 step 4).
 */
export const DEPTH_CAP = 0.026;
/**
 * The lift's per-step strength at the envelope's start, for a press that
 * went all the way down. Twice the Press tool's own per-step press at 1×
 * (0.004), measured in the lab (`npm run lift`, the rim's angular contrast
 * in the dye, at the default look's glass): at 0.004 the lift drew 0.037
 * and one finger; at 0.008, 0.073 and fifteen at the spokes, the
 * Fillmore's sunburst (at the fastest look's glass, 0.061 and seven against
 * 0.078 and ten). A shallower
 * press lifts by the square root of its share of the way down, so a tap (a
 * tenth of the way) lifts a third as hard a step rather than a tenth; with
 * the cap on the gap it can open no more than it pressed, and on the plate
 * that is a faint ripple at the spokes (0.004), too faint to count fingers.
 *
 * Not yet on every kick: Beat Squeeze has never reached the plate (its
 * centre is a fraction of a cell, and a stroke at a fraction lays nothing;
 * PLAN §10 step 4), so there is no kick's press to lift. When it does, it
 * lifts through the same memory as a hand, as its own presser.
 */
export const LIFT_GAIN = 0.008;

export type Stroke = 'press' | 'lift' | 'splash';

/**
 * What one cell of a stroke does: the gap delta (negative thins the film),
 * the velocity kick, and a multiplier on the dye (1 leaves it).
 */
export type SquishCell = (idx: number, gap: number, vx: number, vy: number, mul: number) => void;

export interface Spokes { count: number; phase: number; seed: number }

/**
 * Each press gets its own spoke count and phase (from where it is, so a held
 * press keeps them), and each spoke its own width, length and strength, with
 * a second harmonic shifting the spacing: a ragged sunburst with dye
 * surviving between the fingers, not a turbine.
 */
export function spokesAt(x: number, y: number, fingering: number): Spokes {
  if (!(fingering > 0)) return { count: 0, phase: 0, seed: 0 };
  const seed = (((x * 73856093) ^ (y * 19349663)) >>> 0);
  return { count: 8 + (seed % 9) + Math.round(8 * fingering), phase: ((seed >>> 8) % 1000) / 1000 * Math.PI * 2, seed };
}

function spokeProp(s: number, seed: number) {
  const h = ((s + 1) * 2654435761 + seed) >>> 0;
  return { w: 0.5 + ((h & 255) / 255) * 0.9, len: 0.45 + (((h >>> 8) & 255) / 255) * 0.6, k: 0.25 + (((h >>> 16) & 255) / 255) * 0.75 };
}

const TAU = Math.PI * 2;

/** Where a direction falls on the spokes: how far onto one (−1..1) and which. */
function onSpoke(theta: number, sp: Spokes) {
  const n = sp.count;
  const warped = theta + 0.35 * Math.cos((n * 0.5 + 1) * theta + sp.phase * 1.7) / n * TAU;
  const sIdx = Math.floor(((warped + sp.phase / n) / TAU * n) % n + n) % n;
  const prop = spokeProp(sIdx, sp.seed);
  const raw = Math.cos(n * warped + sp.phase);
  // Narrow spokes: the cosine sharpened by this spoke's width.
  const ang = Math.max(-1, Math.min(1, (raw - (1 - prop.w * 0.85)) / (prop.w * 0.85)));
  return { ang, prop };
}

/**
 * One stroke over a disc of `radius` cells at (x, y) on an S × S grid,
 * reported cell by cell to `cell`.
 *
 * - `press`: the film thins evenly by `amount`; with Fingering the centre
 *   clears and, in a press's first moments (`pile` > 0), the dye piles into
 *   a round rim. No spokes: the stable stroke.
 * - `lift`: `amount` is the lift's strength this step. Along the spokes,
 *   from the rim inward, the gap opens and the liquid is drawn toward the
 *   centre; between them nothing. The disc is a little wider than the
 *   press, so the fingers start from the rim the press piled, not inside it.
 * - `splash`: the press as it was drawn before, fingers on the way down, for
 *   a drop's impact.
 */
export function squishDisc(
  S: number, x: number, y: number, radius: number, amount: number, fingering: number,
  stroke: Stroke, pile: number, cell: SquishCell,
): void {
  const sp = spokesAt(x, y, fingering);
  const spokeGain = fingering * 0.9;
  const reach = stroke === 'lift' ? Math.round(radius * 1.15) : radius;
  const r2 = reach * reach;
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) {
      const d2 = i * i + j * j;
      if (d2 >= r2) continue;
      const nx = x + i;
      const ny = y + j;
      if (!(nx > 0 && nx < S - 1 && ny > 0 && ny < S - 1)) continue;
      const idx = nx + ny * S;
      if (stroke === 'lift') {
        if (sp.count === 0 || d2 === 0) continue;
        const dist = Math.sqrt(d2);
        const { ang, prop } = onSpoke(Math.atan2(j, i), sp);
        if (ang <= 0) continue;
        // From the rim inward, as far as this spoke reaches: the invading
        // front starts at the edge of the pressed disc and runs toward the
        // centre, strongest at the rim where the gap opens first.
        const inner = radius * (1 - prop.len);
        if (dist < inner) continue;
        const along = Math.min(1, (dist - inner) / Math.max(1, radius - inner));
        const w = ang * prop.k * fingering * (0.35 + 0.65 * along);
        const push = amount * 8 * w;
        /*
          The gap opens along the spoke ahead of the spring, back toward
          where the glass rests: half the lift's strength, and the shader's
          squeezeUpdate never lets an opening pass rest. Uncapped it did: at
          the default look's spring (the glass half way back in about 24 s)
          this opened the film to 0.081 against a rest of 0.030 (a quarter:
          0.055; check-skeptic), and the lab's own spring, forty times the
          app's, had hidden it. Capped, the fingers are the gap's more than
          the inward flow's (doubling the flow changed nothing; it takes 25
          times to matter): at a quarter the default look's rim read 0.038
          and two fingers, at half 0.073 and fifteen, and at the fastest
          look's spring 0.078 and ten.
          `npm run lift` holds all of it.
        */
        cell(idx, amount * 0.5 * w, -(i / dist) * push, -(j / dist) * push, 1);
        continue;
      }
      let a = amount, vx = 0, vy = 0, mul = 1;
      if (fingering > 0 && d2 > 0) {
        const dist = Math.sqrt(d2);
        // Under the palm the glass clears: the dye is pushed out and the
        // centre reads as near-black glass. Round, on either stroke.
        if (dist < radius * 0.3) mul *= 1 - Math.min(0.05, amount * 1.4) * fingering * (1 - dist / (radius * 0.3));
        if (stroke === 'press') {
          // The pile as a round rim: the dye the palm drove out, stood up at
          // the front, the same all the way round (the stable stroke).
          const rimW = pile > 0 ? Math.max(0, 1 - Math.abs(dist - radius * 0.8) / (radius * 0.2)) : 0;
          if (rimW > 0) mul *= 1 + pile * 0.5 * rimW;
        } else {
          const { ang, prop } = onSpoke(Math.atan2(j, i), sp);
          a *= Math.max(0.05, 1 + spokeGain * ang * prop.k);
          // The rim at the finger's end: a band hugging this spoke's own
          // tip, where the dye pushed along the channel piles up.
          const tipW = pile > 0 && ang > 0.1 ? Math.max(0, 1 - Math.abs(dist - radius * prop.len) / (radius * 0.2)) : 0;
          if (ang > 0 && dist < radius * prop.len) {
            const push = amount * 8 * ang * fingering * prop.k;
            vx = (i / dist) * push;
            vy = (j / dist) * push;
            if (ang > 0.25 && tipW === 0) {
              mul *= 1 - Math.min(0.08, amount * 2.2) * fingering * prop.k * (ang - 0.25) / 0.75 * (0.25 + 0.75 * dist / (radius * prop.len));
            }
          }
          if (tipW > 0) mul *= 1 + pile * prop.k * ang * tipW;
        }
      }
      cell(idx, -a, vx, vy, mul);
    }
  }
}

/**
 * The press's memory: where it was, how deep it went, and when it let go.
 * `press` is told of every press as it happens (the outermost of a tool's
 * nested discs); `step` is asked once a solver step and returns the lift to
 * lay this step, or null.
 */
export class PressLift {
  private at: { x: number; y: number; radius: number; fingering: number } | null = null;
  private depth = 0;
  private lastAt = -Infinity;
  /** Lift steps laid since the last press let go: for a check to see the lift run. */
  steps = 0;

  press(x: number, y: number, radius: number, amount: number, fingering: number, nowMs: number): void {
    // A pause starts a new press, whose depth starts again.
    if (nowMs - this.lastAt > RELEASE_MS) this.depth = 0;
    this.lastAt = nowMs;
    this.steps = 0;
    if (!(fingering > 0)) { this.at = null; return; }
    this.at = { x, y, radius, fingering };
    this.depth = Math.min(DEPTH_CAP, this.depth + Math.max(0, amount));
  }

  /** Whether a press is being held now (pressed within the release pause). */
  held(nowMs: number): boolean { return nowMs - this.lastAt <= RELEASE_MS; }

  step(nowMs: number, dtSeconds: number): { x: number; y: number; radius: number; amount: number; fingering: number } | null {
    if (!this.at || this.held(nowMs)) return null;
    const age = (nowMs - this.lastAt - RELEASE_MS) / 1000;
    if (age > LIFT_SECONDS) { this.at = null; return null; }
    this.steps++;
    // Per second of show, not per step: a slower loop takes bigger steps.
    const amount = LIFT_GAIN * Math.sqrt(this.depth / DEPTH_CAP) * Math.exp(-age / LIFT_TAU) * (dtSeconds * 60);
    return { ...this.at, amount };
  }

  forget(): void { this.at = null; this.depth = 0; this.lastAt = -Infinity; this.steps = 0; }

  /** Whether (x, y) is this press's place: within its radius of where it was. */
  near(x: number, y: number, radius: number): boolean {
    return !!this.at && Math.hypot(x - this.at.x, y - this.at.y) < Math.max(radius, this.at.radius);
  }

  /** Whether there is anything left to remember: a press held, or a lift still to run. */
  get live(): boolean { return this.at !== null; }
}

/** Who pressed: a hand (the Press tool, a finger, the pad, a person standing still) or the beat squeeze's kick. */
export type Presser = 'hand' | 'kick';

/**
 * Every press on one plate, each remembered where it is. One memory for the
 * whole plate (the first draft) let every presser overwrite it: two fingers
 * on the Press, lifting one gave nothing while the other held, and a kick
 * within a second of a hand letting go moved the hand's lift to the kick's
 * place and started it again (the pre-push review). So a press is matched
 * to the memory of the same presser at the same place, and a press anywhere
 * else is a memory of its own. At most eight, the oldest let go first.
 */
export class PressLifts {
  private list: { who: Presser; m: PressLift }[] = [];

  press(who: Presser, x: number, y: number, radius: number, amount: number, fingering: number, nowMs: number): void {
    let e = this.list.find((q) => q.who === who && q.m.near(x, y, radius));
    if (!e) {
      // Nothing to lift into fingers, and nothing here to stop.
      if (!(fingering > 0)) return;
      e = { who, m: new PressLift() };
      this.list.push(e);
      if (this.list.length > 8) this.list.shift();
    }
    e.m.press(x, y, radius, amount, fingering, nowMs);
  }

  /** The lifts to lay this step, one for each press that has let go and not yet finished lifting. */
  step(nowMs: number, dtSeconds: number): { x: number; y: number; radius: number; amount: number; fingering: number }[] {
    const out = [];
    for (const { m } of this.list) {
      const l = m.step(nowMs, dtSeconds);
      if (l) out.push(l);
    }
    this.list = this.list.filter((q) => q.m.live);
    return out;
  }

  /** Whether any press is held now. */
  held(nowMs: number): boolean { return this.list.some((q) => q.m.held(nowMs)); }

  /** Lift steps laid, over every press remembered. */
  get steps(): number { return this.list.reduce((n, q) => n + q.m.steps, 0); }

  /** How many presses are remembered. */
  get size(): number { return this.list.length; }

  forget(): void { this.list = []; }
}
