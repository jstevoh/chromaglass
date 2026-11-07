/**
 * Slosh: the liquid running down a tilt and swinging back, as two layers, oil
 * riding on water (PLAN 18a-13, 18a-13a, 18a-13d).
 *
 * What was reported (the owner, 2026-10-20): "we don't really have the ability
 * to slosh the liquids around the plate with the tilt mechanic: you would tilt
 * in one direction and until in the other causing sloshing and mixing." Then,
 * 2026-10-22, of this and Plate Rock and Beat Squeeze: "Make sure we are using
 * legit physics and simulations, as opposed to faking it."
 *
 * Why the plate could not slosh. The thin gap (PLAN 18a, wgsl/thinGap.ts) is a
 * Hele-Shaw cell: the liquid's momentum is its drag against the glass, 12ν/h²
 * times the speed, with nothing for inertia to carry. Tip the plate and a
 * uniform in-plane gravity is balanced, to the last digit, by the pressure of
 * liquid piled against the rim, so the flow is zero. A tilt that reverses
 * cannot overshoot, because in a creeping flow nothing has the momentum to.
 *
 * What a dish does is the shallow-water equations, and a dish with oil on its
 * water does them in two layers. The first version of this file (#419) was one
 * layer on a staggered grid, stepped forward-backward, with upwind momentum: it
 * could not hold a wave that steepens into a bore, so a wave that grew past a
 * Froude number of about one was taken down by a made-up "breaking" drag and a
 * speed wall, and the lean the dial reaches was capped at 0.01 of g because 0.02
 * blew the grid up. Both were named shortcuts (18a-13d). This is the scheme that
 * replaces them.
 *
 * The equations. Water, depth h, momentum q = h u; oil, thickness h₁, velocity
 * u₁; ρ₁/ρ = r (0.88 for a light mineral oil); the floor at b, the tilt, and a
 * glass pressed on the liquid at the pressure head P:
 *
 *     ∂h/∂t + ∇·q = 0
 *     ∂q/∂t + ∇·(q q / h) + ∇(g h²/2) = −g h ∇(b + r h₁ + P) − F₂
 *     ∂u₁/∂t + (u₁·∇)u₁ = −g ∇(h + b + r h₁ + P) − F₁ / (r h₁)
 *
 * The tilt is the floor. A plate tipped so that gravity has a part `a` along it
 * is, to the liquid, a level plate whose floor slopes: b = −(a·x)/g. Writing it
 * that way rather than as a body force is what makes the scheme *well-balanced*:
 * a held tilt is a lake at rest on a sloping floor, which the discretisation
 * below holds exactly (zero flow to the float's rounding, by construction and
 * not by a tolerance), so a tipped dish settles and stays settled.
 *
 * The oil. The plate's oil (Oil Tension's mix, PLAN §10) is not a layer over the
 * whole dish: it is bodies, lenses floating on the water. A lens on water stops
 * spreading at the thickness where its weight's spreading is balanced by its
 * negative spreading coefficient S = γ_wa − γ_oa − γ_ow (de Gennes, Brochard-
 * Wyart & Quéré, *Capillarity and Wetting Phenomena*, §4.1, "floating lenses"):
 *
 *     e² = 2 |S| ρ / (g ρ₁ (ρ − ρ₁))
 *
 * which for a light mineral oil (S ≈ −6 mN/m: water 72, oil 30, the oil-water
 * interface 48) is 3.4 mm, a little over half the 6 mm this dish is solved at (and deeper
 * than the plate's real 2 mm sandwich: SLOSH_REST_DEPTH, PLAN 38r-1). A lens at that
 * thickness keeps its shape (the plate's own Oil Tension holds its outline), and
 * a lens of fixed shape on water is a raft: it is pushed by the slope of the
 * water's pressure head under it, h + b + r h₁ + P (the head at the floor, which
 * is the same through both layers), and by its drag; it does not spread under
 * its own weight. So the oil is the third line above, and its thickness h₁ is
 * read from the plate every step (e times the oil's share of the cell), not
 * carried by this solver: where the oil is is the plate's business, the dish's
 * is how fast it goes. Its weight is in the water's line: the water under a lens
 * is shallower by r h₁ (it floats), and a lens that moves pushes the water out
 * of its way, as a boat does.
 *
 * The drag. Both layers lie between the plate's two glasses (the thin gap's
 * model of the plate, 18a), so the drag is the steady laminar flow of two
 * liquids stacked between two no-slip walls: each layer's profile a parabola,
 * velocity and shear stress continuous at the interface. Solved exactly
 * (`twoLayerDrag`), it gives the 2×2 matrix that takes the layers' mean speeds
 * to the stress each feels. For one liquid it is 12ν/h², the one-layer drag the
 * dish had and the thin gap has, so the pace the owner judges (docs/judging.md
 * §58) is the pace it was; for oil on water it is the oil held back by the cover
 * glass above it and pulled along by the water below. It is taken implicitly
 * (a 2×2 solve a cell), so glycerine's 333/s does not limit the step.
 *
 * The scheme, and why this one. Two-layer shallow water has two wave families,
 * the outer one at √(g(h + h₁)) and an inner one along the interface, and its
 * coupling terms (g h ∇(r h₁), g h₁ ∇h) are not in conservation form, so how a
 * scheme crosses a jump in them decides which bore it computes. The state of the
 * art is path-conservative finite volumes (Parés 2006; Castro, Macías & Parés
 * 2001 for the two-layer Roe scheme; Fernández-Nieto, Castro & Parés 2011 for
 * IFCP, the cheap Roe-like one). Roe and IFCP need both layers present in every
 * cell: a vanishing layer (here, the oil, which is absent over most of the dish)
 * is a dry front for them that needs its own fix, and the Roe matrix turns
 * complex where the layers shear past the Kelvin-Helmholtz limit. Bouchut and
 * Morales de Luna (2008, "An entropy satisfying scheme for two-layer shallow
 * water equations with uncoupled treatment", M2AN 42) solve each layer as a
 * one-layer system over the other layer's weight as its floor, with Audusse's
 * hydrostatic reconstruction at each face, and prove it keeps every depth
 * non-negative, holds the lake at rest, and satisfies a discrete entropy
 * (energy) inequality: bores lose energy as real ones do, and nothing grows by
 * itself. A vanishing layer is the one-layer dry front, which that
 * reconstruction is built for. That is the scheme here:
 *
 *   - each x and y face: the two cells' values reconstructed to the face
 *     (MUSCL, the MC limiter, on the depth, the head h + z and the velocity), the
 *     hydrostatic reconstruction h* = max(0, h + z − max(z_L, z_R)), and the
 *     HLL Riemann flux (Harten, Lax & van Leer 1983) on (h, q) with the wave
 *     speeds of each side, the tangential momentum carried upwind; the rim is a
 *     wall, its ghost the cell mirrored (Audusse, Bouchut, Bristeau, Klein &
 *     Perthame 2004, SIAM J. Sci. Comput. 25, "A fast and stable well-balanced
 *     scheme with hydrostatic reconstruction", §2 and their second-order §3);
 *   - the cell's own source, −g h (z_E − z_W)/dx from its reconstruction, which
 *     with the faces' corrections makes the lake at rest exact at second order;
 *   - Heun's two stages in time (SSP RK2), at a fixed step SLOSH_DT whose
 *     Courant number the check reads in every forcing it gives;
 *   - the raft's momentum, upwind, with the head's slope central (flat head,
 *     no push: the oil is well-balanced too).
 *
 * The bore is now resolved by the flux: a hard tip that steepens a wave into a
 * jump keeps it a jump two cells wide that runs at the jump's own speed and loses
 * energy at it (the check times a dam break against Stoker's exact solution).
 * There is no breaking drag and no speed wall.
 *
 * Where it runs. On the GPU (wgsl/slosh.ts), because the oil's share is a GPU
 * field (the mix) the second layer has to be read from every step, and the plate
 * draws the depth (18a-13c) from the same texture; and because two Riemann solves
 * a face, five faces a cell, two stages a step and seven steps a frame is about
 * ten million flops a frame, nothing on the GPU and several milliseconds of the
 * frame loop's thread. This file is the same scheme in TypeScript, the reference
 * `npm run slosh` holds to the physics, and `npm run sloshgpu` holds the GPU's
 * kernels to, value for value.
 *
 * Named shortcuts, each with the item that replaces it:
 *
 *   (a) The lens holds its capillary thickness e; inside a lens there is no
 *       inner wave, and a lens thinner than e does not pull back (dewet). Its
 *       outline is the plate's (PLAN 18a-13g).
 *   (b) Free-slip rim, on the grid's own staircase of the circle (no cut cells);
 *       the wall's boundary layer is left out (18a-13b).
 *   (c) The drag is the steady laminar profile's. At slosh frequencies water's
 *       Stokes layer, √(2ν/ω) ≈ 0.7 mm, is thinner than the gap, so a real dish
 *       of water rings with less drag than this (18a-13b again: it moves the
 *       pace the owner judges, so it waits for that judgement).
 *   (d) The dish turning (the turntable) adds no Coriolis or centrifugal term.
 *   (e) The CPU solver (no GPU) ignores it.
 *   (f) A phone's tilt reaches the dish in screen axes. Gravity's direction is
 *       turned by the turntable's angle and the remote's tilt is not, so with the
 *       plate turned a phone tipped right sloshes at that angle (18a-13e).
 *   (g) The pressed glass is a pressure head over its footprint (the moving
 *       pressure patch that ship-wave and meteotsunami models use for a hull or a
 *       squall line), not a rigid lid the liquid must fit under: the head is the
 *       depth the glass is pushed down, which is the same thing until the glass
 *       closes the gap, and the thin gap's own press (pressKick) is what models
 *       that part.
 *   (h) A kick's press is counted twice near the glass: the thin gap's own
 *       squeeze (pressKick, lib/squish.ts) pushes the colour out under the glass,
 *       and this dish's head pushes its liquid out too, and both reach the plate's
 *       flow. Far from the glass only the dish's ring is left, which is the part
 *       the gap cannot make. Kept because `npm run squeeze` holds the gap's press
 *       as it is; the one-press answer is the dish taking the gap's squeeze as its
 *       source (PLAN 18a-13h).
 *   (i) The scheme damps a ring by itself a little: the lowest mode on water
 *       falls at 0.335/s where the drag alone gives 0.300/s, the MC limiter's
 *       clipping at the crests and the first-order cells by the rim (`npm run
 *       slosh` holds the rate within 15%). A finer grid or a fifth-order WENO
 *       reconstruction would take most of it out, at four times the work or more.
 *
 * Pure and deterministic, so `npm run slosh` holds it to its numbers in node.
 */

/** Cells across the dish. A wave a cell wide is not a wave; 64 is two dozen across the lowest mode's half-wavelength. */
export const SLOSH_N = 64;
/** The dish's width, in the units the solver counts plate widths in: 1. The rim is the inscribed circle. */
export const SLOSH_RADIUS = 0.5;
/*
  Rest depth in plate widths: 6 mm, the gap the plate had before PLAN 38r and
  not its 2 mm now (lib/turntable.ts DISH_GAP_METRES). Kept, and named a
  shortcut (PLAN 38r-1): a slosh is a free surface's wave, and between two
  glasses there is none, so the real sandwich does not slosh at all; what
  this solves is a dish whose liquid can heap, and at 2 mm its floating
  lens (SLOSH_LENS, 3.4 mm) would be deeper than the water it floats on.
  Whether the tilt's slosh becomes the open dish's (no top glass) or the
  sandwich's creeping flow is 38r-1's question.
*/
export const SLOSH_REST_DEPTH = 0.03;
/** The plate's width in metres (lib/turntable.ts DISH_METRES). */
export const SLOSH_PLATE_METRES = 0.2;
/** g in plate widths per second squared: 9.81 m/s² over the 0.2 m plate. */
export const SLOSH_G = 9.81 / SLOSH_PLATE_METRES;
/** The wave speed √(g h₀), plate widths per second. */
export const SLOSH_C = Math.sqrt(SLOSH_G * SLOSH_REST_DEPTH);
/**
 * The slope at the dial's top, a held tilt's rim-to-rim rise as a share of the
 * plate's width (0.01 is 0.6 degrees): a held tilt piles the liquid a third of
 * the rest depth up from rim to rim. It was a stability cap on the first
 * scheme (0.02 blew it up under resonant rocking); on this one it is a choice,
 * kept where the owner first saw it (docs/judging.md §58), and the check rocks
 * the dish at twice it to show it would hold.
 */
export const SLOSH_LEAN = 0.01;
/** The depth the check holds the liquid above under the worst forcing, a share of the rest depth. Not enforced: the scheme keeps depths non-negative by itself. */
export const SLOSH_FLOOR = 0.12;
/**
 * The step, seconds: seven to a 60 Hz frame (`sloshSteps`). The Courant number for
 * the 2-D unsplit scheme is (|u| + c)·dt/dx summed over both axes: 0.37 at rest,
 * and 0.76 at the worst forcing the dial can give (a tilt rocked at the lowest
 * mode on water, `npm run slosh`). At 1/300 that forcing ran at 1.06, past
 * SLOSH_COURANT_MAX, which is what the check holds every forcing under.
 */
export const SLOSH_DT = 1 / 420;
/** The largest Courant number the scheme is stable at, and what the check holds every forcing to. */
export const SLOSH_COURANT_MAX = 0.9;
/** Below this speed (plate widths per second) with no forcing, and level (next), the dish is at rest, exactly. */
export const SLOSH_REST_SPEED = 2e-4;
/** And the head within this share of the rest depth everywhere: 0.1%, a tenth of a pixel of the pile. */
export const SLOSH_REST_RISE = 1e-3;
/** A depth below which a cell is dry and its velocity is zero, plate widths (a micron). */
export const SLOSH_DRY = 5e-6;

/** The oil's density over the water's: a light mineral oil, 0.88 (lib/turntable.ts, dyeDensityContrast's note). */
export const SLOSH_OIL_DENSITY = 0.88;
/** The oil's kinematic viscosity, plate widths² a second: the plate's poured oil, 50 mm²/s (lib/turntable.ts OIL_NU). */
export const SLOSH_OIL_NU = 5e-5 / (SLOSH_PLATE_METRES * SLOSH_PLATE_METRES);
/** The oil's spreading coefficient on water, N/m: 72 − 30 − 48 mN/m for a light mineral oil, negative, so it floats as lenses. */
export const SLOSH_SPREADING = -0.006;
/**
 * A floating lens's thickness, plate widths: e² = 2|S|ρ/(g ρ₁ (ρ − ρ₁)) (de
 * Gennes et al., floating lenses). 3.4 mm, 0.017 of the plate.
 */
export const SLOSH_LENS = Math.sqrt((2 * Math.abs(SLOSH_SPREADING) * 1000) / (9.81 * SLOSH_OIL_DENSITY * 1000 * (1000 - SLOSH_OIL_DENSITY * 1000))) / SLOSH_PLATE_METRES;
/** The oil's share below which a cell holds no lens (the mix's fringe), and the thinnest layer the drag is solved for, plate widths. */
const SLOSH_THIN = 1e-5;

/** How many SLOSH_DT steps `seconds` takes, and so how long each is: the step never longer than SLOSH_DT. */
export function sloshSteps(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / SLOSH_DT - 1e-9));
}

/**
 * The drag 1/s a Thickness (0 to 1) puts on the flow: 12ν/h₀², the same one the
 * gap's solve takes (`thinGapDragSeconds`, gpu/fluid.ts, is its reciprocal).
 * Taken from the viscosity so the two cannot drift apart. The dish takes the
 * water's viscosity back out of it (`sloshNu`) and solves the drag for the
 * depth each cell has.
 */
export function sloshDrag(nu: number, restDepth = SLOSH_REST_DEPTH, plateMetres = SLOSH_PLATE_METRES): number {
  const h = restDepth * plateMetres;
  return (12 * Math.max(1e-9, nu)) / (h * h);
}

/** The water's kinematic viscosity in plate widths² a second, from the drag 1/s at the rest depth: r h₀²/12. */
export function sloshNu(r: number, restDepth = SLOSH_REST_DEPTH): number {
  return (Math.max(0, r) * restDepth * restDepth) / 12;
}

/**
 * The acceleration a dish is given by a tilt, plate widths per second squared,
 * along the plate's own axes: g × the dial's lean × the tilt. The tilt is how
 * far the plate stands up times the direction downhill (a unit vector,
 * `downhill()` in the visualizer), plus the held phone's own, in -1..1 on each
 * axis (the remote's, faded out by the visualizer a couple of seconds after the
 * last reading), which is a tilt of the same size at full.
 */
export function sloshAccel(slosh: number, upright: number, dirX: number, dirY: number, extX = 0, extY = 0): [number, number] {
  const k = SLOSH_G * SLOSH_LEAN * clamp01(slosh);
  const u = clamp01(upright);
  const tx = u * fin(dirX) + clampUnit(extX), ty = u * fin(dirY) + clampUnit(extY);
  return [k * tx, k * ty];
}

/**
 * The acceleration Plate Rock's swing gives the dish (PLAN 18a-13a; how the rock is
 * driven is lib/plateRock.ts's, 27f-2), plate widths
 * per second squared: the rock's swing (lib/plateRock.ts rockSwing, about ±1 at
 * full) as a tilt at the Slosh dial's top lean, times Frame Sway. A rocked dish
 * moves all of its liquid one way and back, so the whole picture sways with
 * the beat, which is the frame moving and not the liquid (the owner, 2026-10-11);
 * so only as far as Frame Sway lets the music move the frame, and not at all at
 * its default 0. Bass Drop's 0.35 rocks the dish at a third of the dial's lean.
 *
 * A shortcut, named: the thin gap takes the same swing as a tilt of CUR_ROCK
 * (a fifth: sinθ up to 0.2, the glass tipped eleven degrees), and the dish takes
 * it at SLOSH_LEAN (a hundredth). The dish's step stays inside its Courant
 * limit up to the dial's own lean, rocked at resonance; at twice it the flow
 * reaches 1.5 plate widths/s and the step runs past the limit, where `npm run
 * slosh` asks only that it holds (the resonance table). And a real 3 cm dish tipped eleven degrees would empty itself over the rim,
 * which no projectionist does. So the rock tips the dish as far as the hand's
 * own dial can, and no further.
 */
export function rockAccel(swingX: number, swingY: number, sway: number): [number, number] {
  const k = SLOSH_G * SLOSH_LEAN * clamp01(sway);
  return [k * clampUnit(swingX), k * clampUnit(swingY)];
}

/**
 * The steady laminar drag of two liquids stacked between two no-slip glasses,
 * water (depth h, viscosity μ) on the floor and oil (thickness h₁, μ₁) above it:
 * the matrix M with [F₁, F₂] = M [U₁, U₂], F the stress each layer feels and U
 * its mean speed, in the dish's units with the water's density 1 (μ = ρν).
 *
 * Each layer's profile is a parabola under its own driving force G (per volume):
 * the water w(z) = −G₂z²/2μ₂ + A₂z from the floor, the oil w(s) = −G₁s²/2μ₁ + A₁s
 * from the cover glass (s = H − z). At the interface the two speeds agree and so
 * do the shear stresses:
 *
 *     A₂h − A₁h₁ = G₂h²/2μ₂ − G₁h₁²/2μ₁,    μ₂A₂ + μ₁A₁ = G₁h₁ + G₂h
 *
 * The means U = K G follow, and at steady state a layer's drag is the force that
 * drives it, F = diag(h₁, h) G, so M = diag(h₁, h) K⁻¹. One liquid (μ₁ = μ₂, the
 * layers going together) gives F₁ + F₂ = 12μU/H, the one-layer dish's 12ν/h².
 * Written into `out` as [M11, M12, M21, M22].
 */
export function twoLayerDrag(h1: number, h: number, mu1: number, mu2: number, out: Float64Array | number[]): void {
  const a = Math.max(h1, SLOSH_THIN), b = Math.max(h, SLOSH_THIN);
  const det = b * mu1 + a * mu2;
  // Column 1: G = (1, 0). Column 2: G = (0, 1). For each, R1 and R2 the interface conditions' right sides.
  let R1 = (-a * a) / (2 * mu1), R2 = a;
  let A2 = (R1 * mu1 + a * R2) / det, A1 = (b * R2 - mu2 * R1) / det;
  const K11 = -(a * a) / (6 * mu1) + (A1 * a) / 2, K21 = (A2 * b) / 2;
  R1 = (b * b) / (2 * mu2); R2 = b;
  A2 = (R1 * mu1 + a * R2) / det; A1 = (b * R2 - mu2 * R1) / det;
  const K12 = (A1 * a) / 2, K22 = -(b * b) / (6 * mu2) + (A2 * b) / 2;
  const kd = K11 * K22 - K12 * K21;
  // K⁻¹ = [K22, −K12; −K21, K11] / kd, then the rows scaled by the thicknesses.
  out[0] = (a * K22) / kd; out[1] = (-a * K12) / kd;
  out[2] = (-b * K21) / kd; out[3] = (b * K11) / kd;
}

function fin(x: number): number {
  return Number.isFinite(x) ? x : 0;
}

function clampUnit(x: number): number {
  return Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
}

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}

/**
 * The slope limiter: monotonized central (van Leer 1977), the steeper of the
 * two one-sided differences' bounds and the central difference, zero at an
 * extremum. Minmod, the most cautious, clipped the lowest mode's crest every
 * swing and took it down at 0.047/s on top of the drag (`npm run slosh`, the
 * ring's decay: 0.347/s against 0.300); MC keeps the scheme TVD and takes 0.035,
 * most of which is the rim's cells, which are first order (shortcut b).
 */
function limit(a: number, b: number): number {
  if (a * b <= 0) return 0;
  const m = Math.min(2 * Math.abs(a), 2 * Math.abs(b), 0.5 * Math.abs(a + b));
  return a > 0 ? m : -m;
}

/** A glass pressed on the liquid: its centre (plate units, 0..1 across), footprint radius, and how far down it pushes the head, plate widths. */
export type SloshPress = { x: number; y: number; radius: number; depth: number };

/**
 * What the visualizer hands the GPU's dish for a step (gpu/fluid.ts setSlosh):
 * the tilt's acceleration, plate widths a second squared; the water's
 * viscosity, plate widths² a second (`sloshNu`); the presses on the liquid; and
 * whether to lay it level and still first.
 */
export type SloshDrive = { ax: number; ay: number; nu: number; presses: SloshPress[]; level: boolean };

/** The lowest mode's angular frequency, c k with k = 1.8412/R (the first zero of J1' on a round dish): 4.46 /s. */
export const SLOSH_OMEGA = (SLOSH_C * 1.8412) / SLOSH_RADIUS;

/**
 * How long a ring takes to die to a ten-thousandth after the last thing that
 * drove it, seconds. The slowest thing in the dish is its lowest mode: under-
 * damped (r < 2ω) its amplitude falls as e^(−r t / 2) (`npm run slosh` measures
 * the rate); over-damped it creeps back at the slow root, r/2 − √(r²/4 − ω²),
 * which for glycerine is ω²/r, a twentieth of a second's rate. A thousandth
 * was the first try and the default Thickness came to rest by the reference's
 * own measure three frames after it (1.9 s against 1.85: the tilt's release puts
 * a little into modes the lowest one's rate does not describe), so the bar is a
 * ten-thousandth: 55 s on water, 2.5 s at the default, two minutes at most. The
 * GPU's dish is not read back, so this is how the visualizer knows it has
 * stopped, and `npm run slosh` holds the reference dish to being at rest within it.
 */
export function sloshRingSeconds(r: number): number {
  const half = Math.max(r, 0) / 2;
  const rate = half < SLOSH_OMEGA ? half : half - Math.sqrt(half * half - SLOSH_OMEGA * SLOSH_OMEGA);
  return Math.min(120, Math.log(1e4) / Math.max(rate, 1e-3));
}

/**
 * How hard a kick's glass still presses, `t` seconds after the kick: fully for
 * `hold`, then let go over `release` on a half cosine, so the press's head
 * comes off the liquid smoothly and the ring it leaves is the liquid's own, not
 * an edge in the forcing (lib/squish.ts KICK_HOLD and KICK_RELEASE, the same
 * envelope the thin gap's squeeze uses, so the two presses keep time).
 */
export function glassHeld(t: number, hold: number, release: number): number {
  if (!(t >= 0)) return 0;
  if (t < hold) return 1;
  if (t >= hold + release) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * (t - hold)) / release));
}

/**
 * When the GPU's dish runs (the visualizer's, one per layer): while something
 * drives it, and for `sloshRingSeconds` after, then laid level and left alone,
 * so a dish nobody is tilting or pressing costs nothing. `tick` says whether to
 * step it this frame and whether to lay it level first.
 */
export class SloshClock {
  private quiet = Infinity;
  private running = false;
  tick(seconds: number, driven: boolean, r: number): { level: boolean } | null {
    if (driven) {
      this.quiet = 0;
      const level = !this.running;
      this.running = true;
      return { level };
    }
    if (!this.running) return null;
    this.quiet += Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    if (this.quiet > sloshRingSeconds(r)) { this.running = false; return null; }
    return { level: false };
  }
  /** Stop at once (the dial taken away, the solver gone): the next drive lays it level. */
  stop(): void { this.running = false; this.quiet = Infinity; }
  get live(): boolean { return this.running; }
}

/**
 * How many presses the dish holds at once: Beat Squeeze's kick is the glass
 * pressed over three nested discs (lib/squish.ts KICK_RADII, the thin gap's own
 * press), and the next kick can land while the last is still letting go.
 */
export const SLOSH_PRESSES = 6;

/** Where a press's edge starts to round off, a share of its radius. */
const PRESS_FLAT = 0.75;

/**
 * A press's head at a point: the depth over a flat-topped disc whose outer
 * quarter rounds to nothing as cos² (a glass's rim pressing a film, not a
 * punch: the edge is a few of the dish's cells wide, so the grid resolves it).
 * Shared with the GPU's kernel word for word.
 */
export function pressHead(p: SloshPress, x: number, y: number): number {
  if (!(p.depth > 0) || !(p.radius > 0)) return 0;
  const d = Math.hypot(x - p.x, y - p.y) / p.radius;
  if (d >= 1) return 0;
  if (d <= PRESS_FLAT) return p.depth;
  const c = Math.cos((0.5 * Math.PI * (d - PRESS_FLAT)) / (1 - PRESS_FLAT));
  return p.depth * c * c;
}

/** A Riemann flux across one face, normal component n and tangential t: [mass, normal momentum, tangential momentum]. */
const flux = new Float64Array(3);

/**
 * HLL across a face whose two sides, after the hydrostatic reconstruction, are
 * (hL, uL, vL) and (hR, uR, vR), u normal to the face. The wave speeds are each
 * side's u ± √(g h), and a dry side's front is the other side's u ∓ 2√(g h)
 * (the exact speed of a rarefaction into a dry bed, Toro's *Shock-Capturing
 * Methods for Free-Surface Shallow Flows*, §10.4).
 */
function hll(g: number, hL: number, uL: number, vL: number, hR: number, uR: number, vR: number): void {
  if (hL <= 0 && hR <= 0) { flux[0] = flux[1] = flux[2] = 0; return; }
  const cL = Math.sqrt(g * hL), cR = Math.sqrt(g * hR);
  const sL = hL <= 0 ? uR - 2 * cR : hR <= 0 ? uL - cL : Math.min(uL - cL, uR - cR);
  const sR = hR <= 0 ? uL + 2 * cL : hL <= 0 ? uR + cR : Math.max(uL + cL, uR + cR);
  const fL0 = hL * uL, fL1 = hL * uL * uL + 0.5 * g * hL * hL;
  const fR0 = hR * uR, fR1 = hR * uR * uR + 0.5 * g * hR * hR;
  let f0: number, f1: number;
  if (sL >= 0) { f0 = fL0; f1 = fL1; }
  else if (sR <= 0) { f0 = fR0; f1 = fR1; }
  else {
    const k = 1 / (sR - sL);
    f0 = (sR * fL0 - sL * fR0 + sL * sR * (hR - hL)) * k;
    f1 = (sR * fL1 - sL * fR1 + sL * sR * (hR * uR - hL * uL)) * k;
  }
  flux[0] = f0; flux[1] = f1; flux[2] = f0 >= 0 ? f0 * vL : f0 * vR;
}

export class SloshDish {
  readonly n: number;
  readonly dx: number;
  /**
   * The water's depth at the cell centres, n × n: `rest32 + hd`, worked out from
   * the stored state after every stage (0 outside the dish). Read it; to set a
   * depth, `setDepth`.
   */
  readonly h: Float64Array;
  /**
   * What is stored: the depth's departure from rest, h − h₀, as the GPU's
   * water texture holds it (float32, as there). Not the depth itself, because a
   * float32 depth loses the dish's water. Stored whole, 3 cm of depth keeps
   * seven figures, and a step's change to a cell is rounded to the eighth; the
   * scheme's fluxes cancel exactly between neighbours, so every bit of water the
   * dish loses is that rounding. On a liquid creeping back to level at Thickness
   * 0.6 the roundings fall the same way step after step for seconds (the field
   * changes slowly, so does each cell's error), and `npm run slosh` measured the
   * dish 1.0e-5 lighter after ten seconds, at its bar, against 3e-15 with the
   * same arithmetic stored in float64. The departure is at most a third of the
   * depth on a held tilt and mostly far less, so its rounding is as many times
   * finer, and nothing about the scheme changes: the fluxes, the stages and the
   * drag all work on h, and only the store and the read differ.
   */
  readonly hd: Float32Array;
  /** The rest depth as the GPU holds it (float32), which `h` is measured from: at rest h is exactly this. */
  readonly rest32: number;
  /** The water's momentum h u, along x and y. */
  readonly qx: Float32Array;
  readonly qy: Float32Array;
  /** The oil's thickness, read from the plate (`setOil`): SLOSH_LENS times the oil's share. Not carried here. */
  readonly h1: Float32Array;
  /** The oil's velocity, x and y. */
  readonly ox: Float32Array;
  readonly oy: Float32Array;
  /** 1 where the cell is in the dish. */
  readonly wet: Uint8Array;
  readonly restDepth: number;
  /** Cells in the dish, for the mass check. */
  readonly cells: number;
  /** The presses on the liquid now (`press`). */
  readonly presses: SloshPress[] = [];
  /** The largest Courant number any stage has run at since construction: the check holds it under SLOSH_COURANT_MAX. */
  courant = 0;
  /** Times the grid went non-finite and was put back to rest: the check holds this at zero. */
  blowups = 0;
  /** The density ratio and the oil's viscosity, the dish's own constants, settable for the check's one-liquid case. */
  oilDensity = SLOSH_OIL_DENSITY;
  oilNu = SLOSH_OIL_NU;

  // The RK stages' copies, and each stage's rates.
  private readonly s0: Float32Array[];
  private readonly rate: Float64Array[];
  // Per cell, the reconstruction's inputs and slopes: depth, head, u, v (water), along x and y.
  private readonly z: Float64Array;
  private readonly eta: Float64Array;
  private readonly uu: Float64Array;
  private readonly vv: Float64Array;
  private readonly sx: Float64Array[];
  private readonly sy: Float64Array[];
  private readonly drag = new Float64Array(4);
  /** True from rest() until the next forced step: lets a still dish cost nothing. */
  private resting = true;

  constructor(n = SLOSH_N, restDepth = SLOSH_REST_DEPTH) {
    this.n = n;
    this.dx = 1 / n;
    this.restDepth = restDepth;
    const nn = n * n;
    this.rest32 = Math.fround(restDepth);
    this.h = new Float64Array(nn);
    this.hd = new Float32Array(nn);
    this.qx = new Float32Array(nn);
    this.qy = new Float32Array(nn);
    this.h1 = new Float32Array(nn);
    this.ox = new Float32Array(nn);
    this.oy = new Float32Array(nn);
    this.wet = new Uint8Array(nn);
    this.s0 = [0, 1, 2, 3, 4].map(() => new Float32Array(nn));
    this.rate = [0, 1, 2, 3, 4].map(() => new Float64Array(nn));
    this.z = new Float64Array(nn);
    this.eta = new Float64Array(nn);
    this.uu = new Float64Array(nn);
    this.vv = new Float64Array(nn);
    this.sx = [0, 1, 2, 3].map(() => new Float64Array(nn));
    this.sy = [0, 1, 2, 3].map(() => new Float64Array(nn));
    let cells = 0;
    // In the dish: the cell's centre within the inscribed circle, decided in integers, (2i + 1 − n)² + (2j + 1 − n)² ≤ n²,
    // so the GPU (wgsl/slosh.ts inDish) puts the rim on the same cells and not on two roundings of a square root.
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = 2 * i + 1 - n, b = 2 * j + 1 - n;
      if (a * a + b * b <= n * n) { this.wet[j * n + i] = 1; cells++; }
    }
    this.cells = cells;
    this.rest();
  }

  /**
   * Level and still, exactly, with whatever oil the dish holds floating on it:
   * the water under a lens shallower by the lens's weight, r h₁, so the head at
   * the floor is the same everywhere and nothing moves.
   */
  rest(): void {
    this.resting = true;
    const r = this.oilDensity;
    for (let k = 0; k < this.h.length; k++) this.hd[k] = this.wet[k] ? -r * this.h1[k] : 0;
    this.syncDepth();
    this.qx.fill(0); this.qy.fill(0); this.ox.fill(0); this.oy.fill(0);
    this.presses.length = 0;
  }

  /** Set the water's depth at cell k (a check's starting state): stored as its departure from rest, as the step stores it. */
  setDepth(k: number, depth: number): void {
    if (!this.wet[k]) return;
    this.hd[k] = depth - this.rest32;
    this.h[k] = this.rest32 + this.hd[k];
  }

  /** The depth from the stored departure: never below zero (a dry cell's departure is −rest32 exactly, so its depth is 0). */
  private syncDepth(): void {
    const { h, hd, wet, rest32 } = this;
    for (let k = 0; k < h.length; k++) h[k] = wet[k] ? Math.max(0, rest32 + hd[k]) : 0;
  }

  /**
   * The oil's share of each cell (0..1, n × n, the plate's mix sampled at the
   * cell's centre), or null for none: its thickness becomes SLOSH_LENS × the share.
   * The water is not moved by this: if the oil is new, the water feels its weight
   * from the next step, as a lens laid on still water does.
   */
  setOil(share: Float32Array | null): void {
    for (let k = 0; k < this.h1.length; k++) {
      const s = share && this.wet[k] ? Math.max(0, Math.min(1, share[k])) : 0;
      this.h1[k] = s > SLOSH_THIN ? SLOSH_LENS * s : 0;
    }
  }

  /** Lay a press in slot `slot` (0..SLOSH_PRESSES−1), or take it away with depth 0. */
  press(slot: number, p: SloshPress | null): void {
    if (slot < 0 || slot >= SLOSH_PRESSES) return;
    while (this.presses.length < SLOSH_PRESSES) this.presses.push({ x: 0.5, y: 0.5, radius: 0, depth: 0 });
    this.presses[slot] = p && p.depth > 0 ? { ...p } : { x: 0.5, y: 0.5, radius: 0, depth: 0 };
  }

  private pressing(): boolean {
    return this.presses.some((p) => p.depth > 0 && p.radius > 0);
  }

  /** The water held, in cell-depths. Conserved. */
  mass(): number {
    let m = 0;
    for (let k = 0; k < this.h.length; k++) m += this.h[k];
    return m;
  }

  /** The head at the floor, h + r h₁, at cell k (the tilt and the presses aside): level at rest. */
  head(k: number): number {
    return this.h[k] + this.oilDensity * this.h1[k];
  }

  /** Kinetic energy of both layers plus the potential of the head's departure from its mean, per unit (water) density, plate widths⁴ per second². */
  energy(): number {
    const { n, dx } = this;
    const mean = this.meanHead();
    let e = 0;
    for (let k = 0; k < n * n; k++) {
      if (!this.wet[k]) continue;
      const h = this.h[k];
      const u = h > SLOSH_DRY ? this.qx[k] / h : 0, v = h > SLOSH_DRY ? this.qy[k] / h : 0;
      const dh = this.head(k) - mean;
      e += (0.5 * h * (u * u + v * v) + 0.5 * this.oilDensity * this.h1[k] * (this.ox[k] ** 2 + this.oy[k] ** 2) + 0.5 * SLOSH_G * dh * dh) * dx * dx;
    }
    return e;
  }

  private meanHead(): number {
    let s = 0;
    for (let k = 0; k < this.h.length; k++) if (this.wet[k]) s += this.head(k);
    return s / this.cells;
  }

  /** The largest departure of the head from its mean, as a share of the rest depth. */
  maxRise(): number {
    const mean = this.meanHead();
    let m = 0;
    for (let k = 0; k < this.h.length; k++) if (this.wet[k]) m = Math.max(m, Math.abs(this.head(k) - mean));
    return m / this.restDepth;
  }

  /** The fastest water, and oil where there is oil, plate widths per second. */
  maxSpeed(): number {
    let m = 0;
    for (let k = 0; k < this.h.length; k++) {
      if (!this.wet[k]) continue;
      const h = this.h[k];
      if (h > SLOSH_DRY) m = Math.max(m, Math.hypot(this.qx[k], this.qy[k]) / h);
      if (this.h1[k] > 0) m = Math.max(m, Math.hypot(this.ox[k], this.oy[k]));
    }
    return m;
  }

  /**
   * Advance `seconds` under the tilt's acceleration (ax, ay), the water's drag
   * `r` (1/s at the rest depth, `sloshDrag`) and the presses, in sloshSteps
   * steps. Returns true while the dish is moving, tipped or pressed, and false
   * the moment it is at rest, level, exactly: a dish whose liquid has stopped and
   * is not being tipped has nothing left to ring, and its drag would otherwise
   * only approach that for ever.
   */
  step(seconds: number, ax: number, ay: number, r: number): boolean {
    if (!(seconds > 0) || !Number.isFinite(seconds)) return this.live(ax, ay);
    ax = Number.isFinite(ax) ? ax : 0;
    ay = Number.isFinite(ay) ? ay : 0;
    r = Number.isFinite(r) ? Math.max(0, r) : 0;
    // Level, still, not tipped and not pressed: nothing to compute, and the cost of a dish nobody is tilting is zero.
    if (this.resting && ax === 0 && ay === 0 && !this.pressing()) return false;
    this.resting = false;
    const subs = sloshSteps(seconds);
    const dt = seconds / subs;
    const nu = sloshNu(r, this.restDepth);
    for (let s = 0; s < subs; s++) this.substep(dt, ax, ay, nu);
    return this.live(ax, ay);
  }

  private live(ax: number, ay: number): boolean {
    const sp = this.maxSpeed(), rise = this.maxRise();
    if (!(sp < 1e3 && rise < 1e3)) { this.blowups++; this.rest(); return false; }
    if (ax !== 0 || ay !== 0 || this.pressing()) return true;
    // Speed alone is not rest: a standing wave stops dead at each end of its swing, with all its energy in the head, so the rise counts too.
    if (sp > SLOSH_REST_SPEED || rise > SLOSH_REST_RISE) return true;
    this.rest();
    return false;
  }

  /** One step: Heun's two stages, then the drag, implicit. */
  private substep(dt: number, ax: number, ay: number, nu: number): void {
    const { hd, qx, qy, ox, oy, s0, rate } = this;
    const st = [hd, qx, qy, ox, oy];
    for (let v = 0; v < 5; v++) s0[v].set(st[v]);
    // Stage 1: U¹ = U⁰ + dt L(U⁰).
    this.rates(ax, ay, dt);
    for (let v = 0; v < 5; v++) { const a = st[v], d = rate[v]; for (let k = 0; k < a.length; k++) a[k] = a[k] + dt * d[k]; }
    this.syncDepth();
    this.clean();
    // Stage 2: U = ½U⁰ + ½(U¹ + dt L(U¹)).
    this.rates(ax, ay, dt);
    for (let v = 0; v < 5; v++) { const a = st[v], d = rate[v], b = s0[v]; for (let k = 0; k < a.length; k++) a[k] = 0.5 * b[k] + 0.5 * (a[k] + dt * d[k]); }
    this.syncDepth();
    this.clean();
    this.applyDrag(dt, nu);
  }

  /** Dry cells hold no momentum, and the oil's velocity is zero where there is no oil to carry it. */
  private clean(): void {
    const { h, hd, qx, qy, wet } = this;
    for (let k = 0; k < h.length; k++) {
      if (!wet[k]) continue;
      // Rounding only: the scheme keeps it non-negative under SLOSH_COURANT_MAX. (h is already held at 0 by syncDepth.)
      if (this.rest32 + hd[k] < 0) hd[k] = -this.rest32;
      if (h[k] <= SLOSH_DRY) { qx[k] = 0; qy[k] = 0; }
    }
  }

  /**
   * The water's and the oil's rates of change for the state as it is: the faces'
   * fluxes, the cells' sources, the raft's push. Written as flat loops over
   * typed arrays (no closures in them): `npm run slosh` runs some twelve minutes
   * of dish, and this is all of its time.
   */
  private rates(ax: number, ay: number, dt: number): void {
    const { n, dx, h, qx, qy, ox, oy, h1, wet, z, eta, uu, vv, sx, sy, rate } = this;
    const g = SLOSH_G, r = this.oilDensity, inv = 1 / dx;
    const [dh, dqx, dqy, dox, doy] = rate;
    const press = this.presses.filter((p) => p.depth > 0 && p.radius > 0);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      dh[k] = 0; dqx[k] = 0; dqy[k] = 0; dox[k] = 0; doy[k] = 0;
      if (!wet[k]) { z[k] = 0; eta[k] = 0; uu[k] = 0; vv[k] = 0; continue; }
      const x = (i + 0.5) / n - 0.5, y = (j + 0.5) / n - 0.5;
      let p = 0;
      for (let q = 0; q < press.length; q++) p += pressHead(press[q], (i + 0.5) / n, (j + 0.5) / n);
      // The water's floor: the tilt (b = −a·x/g), the oil's weight on it, the glass pressing it.
      z[k] = -(ax * x + ay * y) / g + r * h1[k] + p;
      eta[k] = h[k] + z[k];
      uu[k] = h[k] > SLOSH_DRY ? qx[k] / h[k] : 0;
      vv[k] = h[k] > SLOSH_DRY ? qy[k] / h[k] : 0;
    }
    // Slopes, limited (MC); a cell beside the rim (either neighbour out of the dish) is first order.
    const [sxh, sxe, sxu, sxv] = sx, [syh, sye, syu, syv] = sy;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (wet[k] && i > 0 && i < n - 1 && wet[k - 1] && wet[k + 1]) {
        sxh[k] = limit(h[k] - h[k - 1], h[k + 1] - h[k]);
        sxe[k] = limit(eta[k] - eta[k - 1], eta[k + 1] - eta[k]);
        sxu[k] = limit(uu[k] - uu[k - 1], uu[k + 1] - uu[k]);
        sxv[k] = limit(vv[k] - vv[k - 1], vv[k + 1] - vv[k]);
      } else { sxh[k] = 0; sxe[k] = 0; sxu[k] = 0; sxv[k] = 0; }
      if (wet[k] && j > 0 && j < n - 1 && wet[k - n] && wet[k + n]) {
        syh[k] = limit(h[k] - h[k - n], h[k + n] - h[k]);
        sye[k] = limit(eta[k] - eta[k - n], eta[k + n] - eta[k]);
        syu[k] = limit(uu[k] - uu[k - n], uu[k + n] - uu[k]);
        syv[k] = limit(vv[k] - vv[k - n], vv[k + n] - vv[k]);
      } else { syh[k] = 0; sye[k] = 0; syu[k] = 0; syv[k] = 0; }
    }
    // The faces, x then y, each in its own call so V8 compiles each loop for the arrays it is handed.
    const cx = this.faces(true, sxh, sxe, 1, dqx, dqy, uu, vv, sxu, sxv);
    const cy = this.faces(false, syh, sye, n, dqy, dqx, vv, uu, syv, syu);
    const courant = Math.max(cx, cy);
    // The raft: pushed down the slope of the head under it (central, so a level head pushes nothing), its momentum upwind.
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (!wet[k] || h1[k] <= 0) continue;
      const wl = i > 0 && wet[k - 1] === 1, wr = i < n - 1 && wet[k + 1] === 1;
      const wd = j > 0 && wet[k - n] === 1, wu = j < n - 1 && wet[k + n] === 1;
      const gx = wl && wr ? (eta[k + 1] - eta[k - 1]) * 0.5 * inv : wr ? (eta[k + 1] - eta[k]) * inv : wl ? (eta[k] - eta[k - 1]) * inv : 0;
      const gy = wd && wu ? (eta[k + n] - eta[k - n]) * 0.5 * inv : wu ? (eta[k + n] - eta[k]) * inv : wd ? (eta[k] - eta[k - n]) * inv : 0;
      const a = ox[k], b = oy[k];
      let advX = 0, advY = 0;
      if (a > 0) { if (wl) { advX += a * (a - ox[k - 1]); advY += a * (b - oy[k - 1]); } }
      else if (wr) { advX += a * (ox[k + 1] - a); advY += a * (oy[k + 1] - b); }
      if (b > 0) { if (wd) { advX += b * (a - ox[k - n]); advY += b * (b - oy[k - n]); } }
      else if (wu) { advX += b * (ox[k + n] - a); advY += b * (oy[k + n] - b); }
      dox[k] = -g * gx - advX * inv;
      doy[k] = -g * gy - advY * inv;
    }
    this.courant = Math.max(this.courant, 2 * courant * dt * inv);
  }

  /**
   * The faces along one axis: face (i, j) along x lies between cells i − 1 and
   * i; along y, between rows j − 1 and j. Adds each face's fluxes to the two
   * cells it joins and the cells' own sources, and returns the fastest wave.
   */
  private faces(X: boolean, sH: Float64Array, sE: Float64Array, step: number, dqn: Float64Array, dqt: Float64Array,
    un: Float64Array, ut: Float64Array, sun: Float64Array, sut: Float64Array): number {
    const { n, h, eta, wet } = this;
    const dh = this.rate[0];
    const g = SLOSH_G, inv = 1 / this.dx;
    const rows = X ? n : n + 1, cols = X ? n + 1 : n;
    let courant = 0;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const R = j * n + i, L = R - step;
      const wL = (X ? i > 0 : j > 0) && wet[L] === 1, wR = (X ? i < n : j < n) && wet[R] === 1;
      if (!wL && !wR) continue;
      let hL = 0, eL = 0, uL = 0, vL = 0, hR = 0, eR = 0, uR = 0, vR = 0;
      if (wL) { hL = h[L] + 0.5 * sH[L]; eL = eta[L] + 0.5 * sE[L]; uL = un[L] + 0.5 * sun[L]; vL = ut[L] + 0.5 * sut[L]; }
      if (wR) { hR = h[R] - 0.5 * sH[R]; eR = eta[R] - 0.5 * sE[R]; uR = un[R] - 0.5 * sun[R]; vR = ut[R] - 0.5 * sut[R]; }
      // The rim: the wall's ghost is the cell mirrored, the normal speed turned round.
      if (!wR) { hR = hL; eR = eL; uR = -uL; vR = vL; }
      if (!wL) { hL = hR; eL = eR; uL = -uR; vL = vR; }
      const zs = Math.max(eL - hL, eR - hR);
      const hLs = Math.max(0, eL - zs), hRs = Math.max(0, eR - zs);
      hll(g, hLs, uL, vL, hRs, uR, vR);
      const cL = Math.abs(uL) + Math.sqrt(g * hLs), cR = Math.abs(uR) + Math.sqrt(g * hRs);
      if (cL > courant) courant = cL;
      if (cR > courant) courant = cR;
      if (wL) {
        dh[L] -= flux[0] * inv;
        dqn[L] -= (flux[1] + 0.5 * g * (hL * hL - hLs * hLs)) * inv;
        dqt[L] -= flux[2] * inv;
      }
      if (wR) {
        dh[R] += flux[0] * inv;
        dqn[R] += (flux[1] + 0.5 * g * (hR * hR - hRs * hRs)) * inv;
        dqt[R] += flux[2] * inv;
      }
    }
    // The cell's own source from its reconstruction: −g h (z_E − z_W)/dx, with z_E − z_W = (slope of the head) − (slope of the depth).
    for (let k = 0; k < n * n; k++) if (wet[k]) dqn[k] -= g * h[k] * (sE[k] - sH[k]) * inv;
    return courant;
  }

  /** The drag, implicit: per cell, the 2×2 solve of (mass + dt M) U = mass U*. */
  private applyDrag(dt: number, nu: number): void {
    const { h, qx, qy, ox, oy, h1, wet, drag } = this;
    const r = this.oilDensity, mu1 = r * this.oilNu, mu2 = Math.max(1e-12, nu);
    for (let k = 0; k < h.length; k++) {
      if (!wet[k] || h[k] <= SLOSH_DRY) continue;
      twoLayerDrag(h1[k], h[k], mu1, mu2, drag);
      const m1 = r * h1[k], m2 = h[k];
      const a = m1 + dt * drag[0], b = dt * drag[1], c = dt * drag[2], d = m2 + dt * drag[3];
      const det = a * d - b * c;
      const u2x = qx[k] / h[k], u2y = qy[k] / h[k];
      const u1x = h1[k] > 0 ? ox[k] : 0, u1y = h1[k] > 0 ? oy[k] : 0;
      const rx1 = m1 * u1x, rx2 = m2 * u2x, ry1 = m1 * u1y, ry2 = m2 * u2y;
      const nx1 = (d * rx1 - b * rx2) / det, nx2 = (a * rx2 - c * rx1) / det;
      const ny1 = (d * ry1 - b * ry2) / det, ny2 = (a * ry2 - c * ry1) / det;
      qx[k] = nx2 * h[k]; qy[k] = ny2 * h[k];
      // Where there is no oil its row says only where a lens would go if one arrived: tied to the water and the glass.
      ox[k] = nx1; oy[k] = ny1;
    }
  }

  /**
   * The flow at the cell centres, for the check and the CPU's own use: RGBA,
   * n × n, row j the plate's y at (j + 0.5)/n. Red and green are the water's
   * velocity in plate widths a second, blue the depth of both layers over the
   * rest depth, alpha 0. Cells outside the dish are zero. The GPU writes its own
   * (wgsl/slosh.ts `sloshOut`), with the oil's velocity in the alpha's place.
   */
  field(out: Float32Array): Float32Array {
    const { n } = this;
    for (let k = 0; k < n * n; k++) {
      const o = k * 4;
      if (!this.wet[k]) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
      const h = this.h[k];
      out[o] = h > SLOSH_DRY ? this.qx[k] / h : 0;
      out[o + 1] = h > SLOSH_DRY ? this.qy[k] / h : 0;
      out[o + 2] = (h + this.h1[k]) / this.restDepth;
      out[o + 3] = 0;
    }
    return out;
  }
}
