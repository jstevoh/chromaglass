import { GAP_FLOOR, STEFAN_FILM, expNear0, plateRest, stampedDepth } from './sheet.ts';
import { KICK_HOLD, KICK_RELEASE } from './squish.ts';

/*
  The clock glass pressed on the kick as one rigid piece (PLAN 38w-28).

  What was wrong. Bass Drop's kick, and any look whose kick presses the
  glass across the dish (KICK_RADII), pumped the oil outward on every kick:
  in the lab, Lava Pop under that kick at 120 bpm went from 66% of its oil
  in the middle third of the frame to 44% in eight seconds, the gap reading
  its 0.0300 rest before each kick. A press and its release that bring the
  gap back where it was should bring the liquid back with it, and here they
  did not.

  Why. The press laid three nested bowls (squishDisc) and the shader closed
  each cell by Stefan's film on its own, 1/h² growing by 2a/h₀³ (gap.ts),
  so the middle closed slowly and the flank fast; the release
  (KickRelease) then opened the bowls linearly, the middle first. The gap
  went down through one sequence of shapes and came up through another. At
  a gap this thin the liquid's inertia is nothing (Reynolds well under one
  across the film), and a Stokes flow driven through a cycle of shapes
  moves the liquid by the area that cycle encloses in shape space, not by
  the shape it ends on: Purcell's scallop theorem read the other way
  round. A press and release that trace different paths is a pump.

  A real clock glass is rigid. A hand bears on it and the whole glass goes
  down by δ(t) and comes back up by δ(t): one shape, scaled by one depth.
  That path encloses no area, and over a kick the liquid comes back to
  where it was, less what the oil's own shear did with it on the way (which
  is the point: the liquids interact where the water shears, and this
  shear is what Lava Pop was missing, 38w-28's read of the round-five
  film). So the glass lays its gap as a target, depth × shape, eased down
  over KICK_HOLD and up over KICK_RELEASE along the same cosine, and lays
  each step only the change of that target, through the rhythm sheet's
  channel (gap.ts: laid as given, no Stefan closing counted twice, only the
  floor holding).

  The shape is the old discs' sum of clamped bowls, (1 − r²/R²)² over
  KICK_RADII, divided by how many there are, so it is 1 at the middle and
  `depth` is the middle's. A real glass on a film bends little but rocks
  and bears unevenly under a hand: the bowl is how that hand's weight sits
  on it, kept from the old press so the reach of a kick is what it was.
  The depth is what the old stamp closed the middle to (stampedDepth of the
  three discs' amount), so Beat Squeeze's dial means what it did.

  The hand's force, for the record: Stefan's F = 3πμR⁴ḣ / 2h³ for the glass
  coming down 1.2 mm of a 2 mm gap in 0.15 s over a 5 cm radius is 0.1 N on
  water and about 13 N on a 0.1 Pa·s oil: a firm press, not past a hand.

  And the spring. The plate's gap is pulled back to rest each step, the
  dent keeping (1 − spring)^((h/h_s)³) of itself (STEFAN_FILM, the film's
  suction), after the step's change is laid. A hand holds the glass where
  it put it, so the glass remembers what the plate will hold after the
  spring (`held`, as RhythmSheet.step does) and lays target − held: what
  the spring took back is pressed again. Laid without that, the probe's
  rigid lay came back past rest (0.0314 against 0.0300) since the release
  gave back the whole depth when the spring had already given back some.

  Off a thin gap (the old plate) there is no film to close, and the old
  discs and KickRelease still press it (FluidSimulation.pressKick).
*/

/** How long the hand takes to bring the glass down on a kick (s), at most KICK_HOLD, where it starts back up. */
export const GLASS_DOWN = KICK_HOLD;

/** The depth share of a kick `age` seconds after it landed: down over `down`, held to KICK_HOLD, back up over KICK_RELEASE, along one cosine. */
export function glassDepthShare(age: number, down = GLASS_DOWN): number {
  if (!(age > 0)) return 0;
  const d = Math.min(KICK_HOLD, Math.max(1e-3, down));
  if (age < d) return 0.5 * (1 - Math.cos(Math.PI * age / d));
  if (age < KICK_HOLD) return 1;
  const up = age - KICK_HOLD;
  return up < KICK_RELEASE ? 0.5 * (1 + Math.cos(Math.PI * up / KICK_RELEASE)) : 0;
}

/** How deep (gap units, at the middle) the glass goes for a kick of `amount` over each of `discs` discs, as the old stamp closed the middle. */
export function glassDepth(amount: number, discs: number): number {
  return stampedDepth(amount * Math.max(1, discs));
}

interface GlassKick { x: number; y: number; radii: number[]; reach: number; depth: number; down: number; age: number }

export class GlassPress {
  private kicks: GlassKick[] = [];
  /** The dent the plate holds now, after its spring (gap units, closed positive), L × L. */
  private held: Float32Array | null = null;
  private heldL = 0;
  /** Where `held` is not zero, inclusive; bi0 > bi1 for nowhere. */
  private bi0 = 1; private bi1 = 0; private bj0 = 1; private bj1 = 0;
  private rest: Float32Array | null = null;
  private inv: Float32Array | null = null;
  private restKey = '';
  /** Kicks pressed, steps laid, the gap laid, closed and opened (gap units summed over cells; laid = opened − closed), the deepest the dent went: for the checks. */
  kicksPressed = 0;
  steps = 0;
  laid = 0;
  closed = 0;
  opened = 0;
  /** Steps on which a kick was coming back up: for a check to see the glass let go. */
  releaseSteps = 0;
  deepest = 0;

  /** Kicks still pressing or coming back up. */
  get pressing(): number { return this.kicks.length; }

  /** Whether the glass is down anywhere or still pressing. */
  get live(): boolean { return this.kicks.length > 0 || this.bi0 <= this.bi1; }

  /**
   * A kick on the glass at cell (x, y) of an L grid, the hand's weight over
   * discs of `radii` cells, `depth` gap units down at the middle. Returns the
   * cells it bears on and their depths summed at the bottom of the press, as
   * a stroke counts what it lays (applySquish), for the plate's counts.
   */
  press(L: number, x: number, y: number, radii: readonly number[], depth: number, down = GLASS_DOWN): { cells: number; depth: number } {
    if (!(depth > 0) || radii.length === 0) return { cells: 0, depth: 0 };
    const rs = radii.map((r) => Math.max(1, Math.round(r)));
    const k = { x: Math.round(x), y: Math.round(y), radii: rs, reach: Math.max(...rs), depth, down, age: 0 };
    this.kicks.push(k);
    this.kicksPressed++;
    let cells = 0, sum = 0;
    for (let j = Math.max(0, k.y - k.reach); j <= Math.min(L - 1, k.y + k.reach); j++) {
      for (let i = Math.max(0, k.x - k.reach); i <= Math.min(L - 1, k.x + k.reach); i++) {
        const d2 = (i - k.x) ** 2 + (j - k.y) ** 2;
        let s = 0;
        for (const r of rs) { const q = 1 - d2 / (r * r); if (q > 0) s += q * q; }
        if (s > 0) { cells++; sum += depth * s / rs.length; }
      }
    }
    return { cells, depth: sum };
  }

  private restFor(L: number, curve: number): void {
    const key = `${L} ${curve}`;
    if (key === this.restKey) return;
    this.restKey = key;
    this.rest = new Float32Array(L * L);
    this.inv = new Float32Array(L * L);
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const r = plateRest((i + 0.5) / L, (j + 0.5) / L, curve);
      this.rest[i + j * L] = r;
      this.inv[i + j * L] = 1 / (STEFAN_FILM * Math.max(r, GAP_FLOOR));
    }
  }

  /**
   * One step of `dtSeconds` on an L grid: the glass's change of gap added to
   * `out` (gap units, negative closes), the spring `spring` a step (the
   * look's gapSpring) on Plate Shape `curve`. Returns the cells laid.
   */
  step(L: number, dtSeconds: number, spring: number, out: Float32Array, curve = 0): number {
    if (!this.live) return 0;
    const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 1 / 60;
    if (!this.held || this.heldL !== L) { this.held = new Float32Array(L * L); this.heldL = L; this.bi0 = 1; this.bi1 = 0; this.bj0 = 1; this.bj1 = 0; }
    this.restFor(L, curve);
    const held = this.held, rest = this.rest!, inv = this.inv!;
    const lnFree = Math.log(1 - Math.max(0, Math.min(1, Number.isFinite(spring) ? spring : 0)));
    const sprung = lnFree < 0;
    // The cells to visit: wherever the glass was held last step, and wherever a kick bears now.
    let i0 = this.bi0, i1 = this.bi1, j0 = this.bj0, j1 = this.bj1;
    let rising = false;
    for (const k of this.kicks) {
      k.age += dt;
      if (k.age > KICK_HOLD) rising = true;
      const R = k.reach;
      i0 = Math.min(i0 > i1 ? L : i0, Math.max(0, k.x - R)); i1 = Math.max(i1, Math.min(L - 1, k.x + R));
      j0 = Math.min(j0 > j1 ? L : j0, Math.max(0, k.y - R)); j1 = Math.max(j1, Math.min(L - 1, k.y + R));
    }
    let cells = 0, laid = 0, closed = 0, opened = 0, most = 0;
    let n0 = L, n1 = -1, m0 = L, m1 = -1;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const idx = i + j * L;
        let t = 0;
        for (const k of this.kicks) {
          const share = glassDepthShare(k.age, k.down);
          if (share <= 0) continue;
          const dx = i - k.x, dy = j - k.y, d2 = dx * dx + dy * dy;
          let s = 0;
          for (const r of k.radii) { const q = 1 - d2 / (r * r); if (q > 0) s += q * q; }
          t += k.depth * share * s / k.radii.length;
        }
        // No deeper than the floor allows, so nothing is refused and owed (gap.ts's sheet channel).
        const room = rest[idx] - GAP_FLOOR;
        if (t > room) t = room;
        const change = t - held[idx];
        if (change !== 0) {
          out[idx] -= change;
          laid -= change;
          if (change > 0) closed += change; else opened -= change;
          cells++;
        }
        // Held as the plate will hold it after its spring, at the gap it will have (RhythmSheet.step).
        if (sprung && t > 0) {
          const x = Math.min(2 / STEFAN_FILM, Math.max(GAP_FLOOR, rest[idx] - t) * inv[idx]);
          held[idx] = t * expNear0(lnFree * x * x * x);
        } else held[idx] = t;
        if (held[idx] !== 0) {
          if (i < n0) n0 = i; if (i > n1) n1 = i;
          if (j < m0) m0 = j; if (j > m1) m1 = j;
        }
        if (t > most) most = t;
      }
    }
    this.bi0 = n0; this.bi1 = n1; this.bj0 = m0; this.bj1 = m1;
    this.kicks = this.kicks.filter((k) => k.age < KICK_HOLD + KICK_RELEASE);
    this.steps++;
    if (rising) this.releaseSteps++;
    this.laid += laid;
    this.closed += closed;
    this.opened += opened;
    this.deepest = Math.max(this.deepest, most);
    return cells;
  }

  /** Let the glass go at once, nothing laid: a cleared plate. */
  forget(): void {
    this.kicks = [];
    this.held?.fill(0);
    this.bi0 = 1; this.bi1 = 0; this.bj0 = 1; this.bj1 = 0;
  }
}
