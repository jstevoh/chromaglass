/**
 * The spinning dish (PLAN.md §22): the dish, the liquid in it, the hand that
 * turns it and the motor that can turn it on its own.
 *
 * What was asked for: "spin the plate on command, or set it to spin
 * automatically at some rate (or a rate controlled by some other factor, like
 * music tempo)". What a real dish on a turntable does, which is what this
 * models rather than a picture turned by an angle:
 *
 *   - The dish is a flywheel. The hand or a motor turns it; the bed it rests
 *     on takes the speed away (the flywheel in LiquidVisualizer's frame).
 *   - The liquid is not the dish. It is a layer a few millimetres thick
 *     between two glasses, dragged round by them through its viscosity. In a
 *     thin gap the depth-averaged flow feels the walls as a drag 12ν/h² (plane
 *     Poiseuille flow between two plates moving together), so the liquid
 *     relative to the dish decays as e^(−t/τ) with τ = h²/12ν. That is about
 *     three seconds for water in the plate's 6 mm middle, a tenth of a second
 *     for a light oil, and a millisecond for glycerine: spin a dish of water
 *     and the water stays put for a moment while the glass goes round under
 *     it, as coffee does when the cup is turned; spin a dish of oil and the
 *     oil goes with it at once.
 *   - What the audience sees is the liquid, so the picture turns with the
 *     liquid, not the dish. The solver works in a frame turning with the
 *     liquid's bulk (`liquidFollow` below: the liquid at the plate's rest gap
 *     and the look's own viscosity), and everything that does not keep up
 *     with that bulk, or runs ahead of it, is a flow in that frame: the
 *     solver's swirl (`spinSwirl` in src/gpu/wgsl/fluid.ts). Where the glass
 *     is pressed closer the liquid is gripped harder and goes round with the
 *     dish; where it opens up it lags; oil holds on harder than water; so the
 *     colour winds into spirals as the dish spins up and unwinds as it stops.
 *     That change of frame is exact, not an approximation: in a frame turning
 *     at ω_l the liquid feels the frame's own acceleration (the Euler force,
 *     −ω̇_l × r) and the swirl carries it.
 *   - Spun, the dish is a centrifuge. In the turning frame everything feels
 *     ω²r outward; where the liquid is all one density that is a pressure and
 *     moves nothing, and where it is not, the heavier liquid is pushed out and
 *     the lighter pulled in (the swirl's centrifugal term).
 *
 * This module is the CPU side, pure so `npm run turntable` can hold it to
 * those numbers without a browser: the liquid's lag, the motor's rate and
 * tempo lock, and the hand. The GPU side, the swirl, is measured in the lab
 * (`npm run dish`).
 */

/**
 * The plate's real size (PLAN §18a's numbers, which the thin-gap solver in
 * #220 uses too, so the two agree when both are in): an overhead projector's
 * stage takes a clock glass of about eight inches, 0.2 m, and the gap field is
 * in plate widths, 0.03 in the middle at rest, so the rest gap is 6 mm.
 */
export const DISH_METRES = 0.2;
export const DISH_REST_GAP = 0.03;
/** The narrowest and widest the squeeze lets the gap go, in plate widths (gapRest, squeezeUpdate). */
export const DISH_GAP_RANGE = [0.004, 0.06] as const;

/**
 * The liquids' kinematic viscosities, m²/s.
 *
 * The look's Viscosity is a word, not a number: 'thin' is water, which is
 * what the colours of a water-based show are, 1 mm²/s; 'thick' is a light
 * mineral oil or a glycerine-and-water mix, 20 mm²/s (baby oil is 20 to 30;
 * 60% glycerine about 10). The oil a look pours (the mix's oil) is its own
 * liquid, a light oil at 50 mm²/s, and where the two share a cell the
 * viscosity is their Arrhenius mix, ln ν = x ln ν_oil + (1 − x) ln ν_water,
 * which is how the viscosities of liquid mixtures actually combine (not
 * linearly: a drop of syrup does not thicken a glass of water by its share).
 */
export const WATER_NU = 1e-6;
export const THICK_NU = 2e-5;
export const OIL_NU = 5e-5;

export function carrierViscosity(viscosity: string | undefined): number {
  return viscosity === 'thin' ? WATER_NU : THICK_NU;
}

/**
 * Density contrasts, Δρ/ρ, for the centrifuge.
 *
 * The dye is the colour in the water. Food colouring in water adds a
 * percent or two; coloured water in a dish of oil is 12 to 18% heavier than
 * the oil round it. The look's Dye Weight (solutalBuoyancy) already says
 * which of those its dye is when the plate is stood up, so the spun dish
 * reads the same dial: 2% at 0, 15% at 1. The oil a look pours is lighter
 * than the water, about 12% (mineral oil 0.85–0.88 against 1.0), and the
 * ferrofluid heavier, about 25% (a light-oil ferrofluid is 1.1–1.2 against a
 * 0.88 oil), both fixed properties of the liquids and so constants in the
 * solver (SPIN_OIL_LIGHT, SPIN_PHASE_HEAVY).
 */
export function dyeDensityContrast(dyeWeight: number | undefined): number {
  const w = Math.max(0, Math.min(1, Number.isFinite(dyeWeight) ? dyeWeight! : 0));
  return 0.02 + 0.13 * w;
}

/**
 * The clear liquid's kinematic viscosity, m²/s, from the Thickness dial (0
 * to 1): water at 0, glycerine at 1, on a log scale (fluid.ts says why;
 * `thinGapViscosity` there is this). Here so a pure module (the cover glass,
 * lib/plateRock.ts) can read it without the GPU solver.
 */
export function thicknessViscosity(thickness: number): number {
  return 1e-6 * Math.pow(10, 3 * Math.max(0, Math.min(1, thickness)));
}

/** The drag time h²/12ν, seconds, for a gap in plate widths. */
export function dragSeconds(nu: number, gap = DISH_REST_GAP): number {
  const h = gap * DISH_METRES;
  return (h * h) / (12 * Math.max(1e-9, nu));
}

/**
 * The liquid's bulk, following the dish: dω_l/dt = (Ω − ω_l)/τ, exactly over
 * the step. Non-finite inputs leave it where it was: this is integrated into
 * an angle, and an angle that goes NaN stays NaN for the rest of the show.
 *
 * Within LIQUID_REST of a dish at rest it is at rest, exactly. An exponential
 * only approaches zero, and the frame treats a turntable whose liquid is not
 * exactly zero as turning (the centrifuge takes the look's own turn then,
 * and the picture adds the liquid's): water's 3 s would leave a residue for
 * the rest of the show after one touch of the Spin tool. The dish itself
 * comes to rest exactly by its dry friction (dishFollow).
 */
export const LIQUID_REST = 1e-6;
export function liquidFollow(omegaL: number, dish: number, dt: number, tau: number): number {
  if (!Number.isFinite(dish) || !Number.isFinite(dt) || dt <= 0) return omegaL;
  const next = dish + (omegaL - dish) * Math.exp(-dt / Math.max(1e-4, tau));
  if (dish === 0 && Math.abs(next) < LIQUID_REST) return 0;
  return Number.isFinite(next) ? next : omegaL;
}

/**
 * One frame of the whole dish (PLAN 22h): what turns it, what its liquid
 * does, and how far the picture turns.
 *
 * There is one dish under a plate, and everything that turns it turns the
 * same glass: the look's own motor, the music routed to rotation and a
 * flick (the look's flywheel, `look`), and Auto Spin and a hand on the Spin
 * tool (the turntable, `turntable`). Their speeds add, because they are two
 * motors and a push on one wheel. Until 22h only the turntable's share went
 * through the liquid; the look's turned the picture rigidly, as if the
 * liquid were bolted to the glass, so a flicked plate of water went round at
 * once where a real one stays put for a moment and catches up over its drag
 * time, and the flick dragged the dye round with a stirring term of its own
 * in the current (the twist's flick half) to stand in for the drag it was
 * not getting. Now the whole dish's speed is what the liquid follows, and the
 * picture turns with the liquid alone: that is the drag through the gap
 * doing the work the stirring term imitated, and it is retired.
 *
 * `dish` is the dish's speed Ω, `liquid` the bulk's ω_l after this frame
 * (liquidFollow, so it comes to rest exactly when the dish does), and `turn`
 * the angle the picture turns this frame: the liquid's speed integrated over
 * the frame exactly, Ω dt + (ω_l − Ω) τ (1 − e^(−dt/τ)), not the speed at its
 * end times dt. The two agree at 60 frames a second; on a frame that took
 * half a second (a busy machine, the shaders still building) the end speed
 * counted the whole frame at a speed the liquid only reached at its end, and
 * a flick turned water twice as far as it went (CI's Mac, the first run of
 * `npm run flick`: 0.117 rad in a 0.46 s frame where the liquid went 0.061).
 * The solver's swirl is driven by Ω − ω_l and its centrifuge by ω_l, both
 * from these.
 */
export interface DishFrame { dish: number; liquid: number; turn: number }
export function dishFrame(look: number, turntable: number, liquid: number, dt: number, tau: number): DishFrame {
  const dish = (Number.isFinite(look) ? look : 0) + (Number.isFinite(turntable) ? turntable : 0);
  const next = liquidFollow(liquid, dish, dt, tau);
  if (!(dt > 0) || !Number.isFinite(dt) || next === liquid && next === dish) {
    const still = next * (dt > 0 && Number.isFinite(dt) ? dt : 0);
    return { dish, liquid: next, turn: Number.isFinite(still) ? still : 0 };
  }
  const t = Math.max(1e-4, tau);
  const turn = dish * dt + (liquid - dish) * t * (1 - Math.exp(-dt / t));
  return { dish, liquid: next, turn: Number.isFinite(turn) ? turn : 0 };
}

/**
 * The look's motor dial (`rotationSpeed`, 0 to 1) as the dish's speed, rad/s.
 * Moved here from the frame unchanged, so a check can read it.
 *
 * The top of this dial used to be one turn every thirteen minutes.
 * `rotationSpeed` ran `v * 0.01`, so the whole slider reached 0.01 rad/s —
 * measured at 0.011 rad over 1.4 s with the dial at 0.8, against 1.885 rad/s
 * for a flick. It was a motor that kept a plate alive and could not be seen
 * doing it, and asking for a plate that visibly turns was asking for travel
 * this dial did not have.
 *
 * Every shipped look sat at 0.1 or below then (most under 0.012), so the
 * bottom tenth was kept exactly as it was — `v * 0.01`, the same arithmetic,
 * the same numbers — and the ninety per cent above it is where the speed
 * lives. The two halves meet at 0.001 rad/s, so there is no step at the join,
 * and the square keeps fine control at the slow end of what is a visible
 * range: about a turn every fifteen seconds at half, and a flick's worth at
 * the top.
 *
 * The bottom tenth looked alive for another reason: the same dial stirred
 * the current round the middle, at thirty times the dial in the solver's
 * units, and on most looks that stir turned the liquid in view twenty to a
 * thousand times faster than this motor turned the dish. The stir went in
 * PLAN 22j (the dish drags the liquid through the gap, so a steady motor
 * leaves nothing to stir once the liquid has caught up), and the looks that
 * leaned on it were moved up the dial to turn their dish as fast as the stir
 * moved the liquid they show (presets.ts, Rotation Speed). Most now sit
 * between 0.02 and 0.2.
 */
export function lookMotorRate(asked: number): number {
  const v = Math.max(0, Number.isFinite(asked) ? asked : 0);
  return v <= 0.1 ? v * 0.01 : 0.001 + Math.pow((v - 0.1) / 0.9, 2) * 2.4;
}

/**
 * The look's motor, one frame's ask, rad/s: the dial's speed `rate` the
 * plate's way round (`way`, ±1 and the wander), and the music routed to
 * rotation, `music`, with its sway `sway` (which crosses zero: a quiet band
 * pushes the plate back).
 *
 * The sway used to multiply the dial's speed as well. While that speed was a
 * thousandth of a radian a second it changed nothing anyone could see; once
 * the dial carried what the stir did (22j) it would have turned acid-trip's
 * whole dish backwards at 0.24 rad/s in every quiet bar. A motor holds its
 * way round whatever the band does, so only the band's share sways, exactly
 * as it always has (`npm run turntable`, check 15).
 */
export function lookMotor(rate: number, way: number, music: number, sway: number): number {
  const m = rate * way + music * sway;
  return Number.isFinite(m) ? m : 0;
}

/** Wrap an angle difference to (−π, π]. */
export function wrapPi(a: number): number {
  const t = a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
  return t <= -Math.PI ? t + 2 * Math.PI : t;
}

/** Auto Spin's modes (the `spinAuto` setting). */
export const SPIN_OFF = 0, SPIN_RATE = 1, SPIN_TEMPO = 2;
export const SPIN_AUTO_NAMES = ['Off', 'Rate', 'Tempo'] as const;
/** Spin Rate's range, revolutions a minute, either way round. */
export const SPIN_RPM_MAX = 45;
/** Beats a turn's range in Tempo. */
export const SPIN_BEATS_RANGE = [1, 64] as const;

/** The beat as the beat clock has it this frame: its period and when the next beat falls, in ms. */
export interface TempoReading { periodMs: number; nextBeatMs: number; nowMs: number }

/**
 * The motor under one dish (Auto Spin).
 *
 * Rate is a speed, in rev/min, signed for the direction. Tempo is a speed from
 * the beat clock, one turn every `beats` beats, and it is phase-locked: the
 * dish is a flywheel relaxing toward the motor's speed, so a speed alone
 * drifts against the beat as the drag and the tempo's small wanderings add
 * up, and after a minute a turn that should land on the bar lands anywhere.
 * So the motor steers by angle as well: it keeps an angle the dish should be
 * at, advanced by the clock's own beats (the beat's phase from its period
 * and next beat, the clock that has already read the kick's `at`), and asks
 * for a little more or less speed in proportion to how far the dish is off
 * it. The gain against the flywheel's drag D makes a damped second-order
 * loop, ζ = √(D/k)/2: at the default drag (D ≈ 0.6/s) and k = 0.25/s that is
 * 0.77, settling in a few seconds without swinging past.
 *
 * With no tempo heard yet, Tempo turns at the Spin Rate; once it has heard
 * one, it holds the last tempo through a breakdown rather than stopping the
 * dish when the kick drops out.
 */
export class AutoSpin {
  private beats = 0;
  private lastPhase = -1;
  private anchor: number | null = null;
  private periodMs = 0;
  /** The angle the dish should be at in Tempo, radians, or null when not locked. */
  ref: number | null = null;

  /** Forget the lock (a hand took the dish, the mode changed, the look was laid). */
  release(): void { this.anchor = null; this.ref = null; this.lastPhase = -1; }

  /**
   * The speed the motor asks for, rad/s, before the plate's direction (the
   * caller multiplies by +1 or −1 for which plate and which way round).
   * `dishAngle` is the dish's own angle with that direction divided out.
   */
  target(mode: number, rpm: number, beats: number, tempo: TempoReading | null, dishAngle: number): number {
    const rpmC = Math.max(-SPIN_RPM_MAX, Math.min(SPIN_RPM_MAX, Number.isFinite(rpm) ? rpm : 0));
    if (mode === SPIN_RATE) { this.release(); return (2 * Math.PI * rpmC) / 60; }
    if (mode !== SPIN_TEMPO) { this.release(); return 0; }
    const sign = rpmC < 0 ? -1 : 1;
    if (tempo && tempo.periodMs > 0 && Number.isFinite(tempo.nextBeatMs)) this.periodMs = tempo.periodMs;
    if (!(this.periodMs > 0)) { this.release(); return (2 * Math.PI * rpmC) / 60; }
    const n = Math.round(Math.max(SPIN_BEATS_RANGE[0], Math.min(SPIN_BEATS_RANGE[1], Number.isFinite(beats) ? beats : 16)));
    const rate = sign * (2 * Math.PI * 1000) / (this.periodMs * n);
    // Where in the beat we are, from the clock itself; held (and so only the
    // rate steering) while the clock has nothing to say.
    if (!tempo || !(tempo.periodMs > 0)) return rate;
    const phase = Math.max(0, Math.min(0.999999, 1 - (tempo.nextBeatMs - tempo.nowMs) / tempo.periodMs));
    if (this.lastPhase >= 0 && phase < this.lastPhase - 0.5) this.beats++;
    this.lastPhase = phase;
    const along = sign * 2 * Math.PI * (this.beats + phase) / n;
    if (this.anchor === null) this.anchor = dishAngle - along;
    this.ref = this.anchor + along;
    const off = this.ref - dishAngle;
    // A dish that was grabbed or flicked far off the lock is re-anchored
    // where it is rather than wound back round to it.
    if (Math.abs(off) > Math.PI) { this.anchor = dishAngle - along; this.ref = dishAngle; return rate; }
    return rate + TEMPO_LOCK * off;
  }
}

/** The tempo lock's gain, per second (see AutoSpin). */
export const TEMPO_LOCK = 0.25;

/**
 * A hand on the dish (the Spin tool): the dish goes round under the hand.
 *
 * Grab the glass and turn it, the way a record is turned under a finger: the
 * dish takes the hand's angular speed about its middle, read from where the
 * pointer is as the hand goes round. Let go and it coasts on the flywheel.
 * Hold still and it stops, because a hand holding a dish still is a brake.
 * Near the middle the angle is noise (a pixel is a large angle), so the hand
 * is read only from a tenth of the plate out, and the speed is smoothed over
 * a few tens of milliseconds, the time a pointer takes to report twice.
 */
export class SpinHand {
  private hands = new Map<string, { phi: number; at: number; rate: number; moved: number; scale: number }>();
  /** Radius, in plate widths from the middle, inside which the hand's angle is not read. */
  static readonly DEAD = 0.05;
  /** Seconds the hand's speed is smoothed over. */
  static readonly SMOOTH = 0.05;
  /** Seconds without a move before a held hand counts as still. */
  static readonly STILL = 0.08;
  /** Seconds a still hand takes the speed out of the dish in: a hand that stops, stops it. */
  static readonly BRAKE = 0.03;
  /**
   * The fastest a hand turns the dish, rad/s: a turn and a half a second,
   * twice the top of Auto Spin's Rate and quicker than anyone spins a record
   * by hand. A hand is read by its angle round the middle, so a swipe across
   * the plate that passes near the middle reads as a whirl: 0.6 of the plate
   * in a quarter of a second, 0.06 from the middle, peaked at 22 rad/s, three
   * and a half turns a second, from an ordinary drag (measured by review,
   * `npm run turntable` holds it here). A real hand that near the axis has no
   * lever to turn the glass that fast with, so each reading is held to this.
   */
  static readonly MAX = 3 * Math.PI;

  get held(): boolean { return this.hands.size > 0; }

  /**
   * A hand lands, at (dx, dy) from the dish's middle as the audience sees it
   * (plate widths). `scale` is how much of its speed it gives the dish: the
   * Spin tool's Amount for this screen's pointer, one for a remote's finger,
   * which carries no Amount of its own (the display's would be whatever tool
   * the laptop has in hand).
   */
  down(id: string, dx: number, dy: number, atMs: number, scale = 1): void {
    this.hands.set(id, { phi: Math.atan2(dy, dx), at: atMs, rate: 0, moved: atMs, scale: Number.isFinite(scale) ? scale : 1 });
  }

  /** It moves: its speed round the middle, smoothed. Implicitly lands a hand not yet down. */
  move(id: string, dx: number, dy: number, atMs: number, scale = 1): void {
    const h = this.hands.get(id);
    if (!h) { this.down(id, dx, dy, atMs, scale); return; }
    if (Number.isFinite(scale)) h.scale = scale;
    if (Math.hypot(dx, dy) < SpinHand.DEAD) { h.phi = Math.atan2(dy, dx); h.at = atMs; return; }
    const phi = Math.atan2(dy, dx);
    const dt = (atMs - h.at) / 1000;
    if (dt > 1e-4) {
      const inst = Math.max(-SpinHand.MAX, Math.min(SpinHand.MAX, wrapPi(phi - h.phi) / dt));
      const k = 1 - Math.exp(-dt / SpinHand.SMOOTH);
      h.rate = SpinHand.held(h, atMs);
      if (Number.isFinite(inst)) h.rate += (inst - h.rate) * k;
      h.phi = phi; h.at = atMs; h.moved = atMs;
    }
  }

  up(id: string): void { this.hands.delete(id); }
  clear(): void { this.hands.clear(); }

  /** Let go of any hand that has not been heard from in `ms` (a remote's finger, whose lift may not arrive). */
  forgetQuiet(nowMs: number, ms: number, prefix: string): void {
    for (const [id, h] of this.hands) if (id.startsWith(prefix) && nowMs - h.at > ms) this.hands.delete(id);
  }

  /**
   * The speed the hands ask of the dish, rad/s (each hand's speed times its
   * scale, averaged), or null when no hand is on it. A hand that has not
   * moved for STILL is holding the dish still.
   */
  rate(nowMs: number): number | null {
    if (this.hands.size === 0) return null;
    let sum = 0;
    for (const h of this.hands.values()) sum += SpinHand.held(h, nowMs) * h.scale;
    return sum / this.hands.size;
  }

  /** A hand's speed now: what it last moved at, run down once it has been still for STILL. */
  private static held(h: { rate: number; moved: number }, nowMs: number): number {
    const still = (nowMs - h.moved) / 1000 - SpinHand.STILL;
    return still > 0 ? h.rate * Math.exp(-still / SpinHand.BRAKE) : h.rate;
  }
}

/** How fast the dish takes the hand's speed, seconds: a grip on glass, not a gearbox. */
export const GRIP_SECONDS = 0.04;

/**
 * The dish on its bed, one frame: it relaxes toward the speed it is driven at
 * (a motor, or rest) at `dragRate` per second, and dry friction takes the
 * last of it, so a flicked plate stops instead of creeping for ever at a
 * speed too small to see. Moved here from the frame unchanged, so the tempo
 * lock is checked against the same flywheel the plate runs (`npm run
 * turntable`).
 */
export function dishFollow(vel0: number, motor: number, dragRate: number, dt: number): number {
  let vel = vel0 + (motor - vel0) * (1 - Math.exp(-dragRate * dt));
  const grip = dragRate * 0.02 * dt;
  vel = Math.abs(vel - motor) <= grip ? motor : vel - Math.sign(vel - motor) * grip;
  return Number.isFinite(vel) ? vel : vel0;
}
