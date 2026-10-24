/**
 * Plate Rock's hand: a person tipping the dish with the music, once every
 * two beats, and the slow sway between (PLAN 27a, 27f-2). The frame loop
 * drives it and the plate takes its lean as a tilt (fluid.ts ROCK_FALL);
 * `npm run rides` drives the same code.
 *
 * What was reported (the owner, 2026-10-21): Plate Rock and Beat Squeeze
 * "feel the same". They did, for a reason in this file. The hand was a damped
 * spring at 0.9 Hz shoved on every kick, so the plate tipped on each kick and
 * rang back before the next, a pulse in time with the kick's dye burst and
 * the squeeze's press: three moves on the same beat, read as one.
 *
 * A projectionist rocking a clock glass does not jab it on every kick. The
 * hand tips the dish one way across a half bar and back across the next, the
 * colour running downhill through the clear liquid each way, so the rock is
 * the slow thing on the plate and the kick's own moves are the quick ones.
 * So the hand now leans on the one and on three (the strong beats `BarGrid`
 * finds; the one it presses hardest is the accent's, as before), and only
 * there: two, four and the off-beat kicks leave it moving where it was
 * going. Each lean goes to the other side of an axis that turns a little
 * each time, so over a few bars the rocking swings round the dish as a hand
 * swirling a glass does, and it goes there along the path a hand's reach
 * takes: minimum jerk (Flash and Hogan, 1985, the measured shape of a
 * person's point-to-point arm movement; `reach`), from rest x(τ) = x₀ +
 * (x₁ − x₀)(10τ³ − 15τ⁴ + 6τ⁵), speed a bell that starts and ends at rest. A spring shoved has
 * its fastest moment at the shove, which is the jolt on the kick that read
 * as the squeeze; a reach is fastest half way between beats.
 *
 * Where the grid is unsure of the bar (no beat yet, a fill, a lost lock) the
 * hand leans on the first kick two beats after the last lean (half a second
 * a beat until the grid has a tempo), so the plate never stops rocking
 * because the grid lost the bar. With no kick for ROCK_LEVEL_AFTER it puts
 * the dish down level: a lean held through a silence would slide the colour
 * to one side until the music came back.
 *
 * The slider is how far the hand tips the glass and is applied once, by
 * `rockSwing`, at the end (it was applied twice before 27a, the dial going as
 * its square). The hand's lean before the slider is ROCK_LEAN, half the
 * spring's peak on a full kick: it holds there longer and goes back and forth
 * slower (one swing a bar, where the spring rang at 0.9 Hz), so the colour
 * travels further each way than it did and comes back. The old spring is kept below (`springKick`, `springStep`) so `npm run
 * rides` can print what the rock did before beside what it does now.
 */
import { STRONG_BEAT } from './barGrid';

export type RockHand = {
  /** The lean now, in swing units (rockSwing scales it by the slider), and its speed a second. */
  x: number; y: number; vx: number; vy: number;
  /** The rocking axis's angle; it turns ROCK_TURN with each lean. */
  phase: number;
  /** The reach under way: from (where and how fast), to, how far along (s), and how long it takes. Absent until the first lean. */
  fromX?: number; fromY?: number; fromVX?: number; fromVY?: number; toX?: number; toY?: number; t?: number; dur?: number;
  /** Which side the last lean went (±1), and seconds since it began. */
  side?: number; since?: number;
};
/** The spring as it was (27a to 27f-2), kept for `npm run rides`'s before. */
export type RockSpring = { x: number; y: number; vx: number; vy: number; phase: number };

/*
  The hand's lean before the slider, at a full bass: half the old spring's
  peak swing on a full kick (±1.1). Leaning as steeply as the spring's peak
  and holding it for most of a half bar moved the colour three times as far
  as the spring did at the default (`npm run rides`: 0.62 of the plate's
  colour changed in two seconds against 0.20), a look's own stir's worth of
  slide from a dial that had been the background move. At half it moves it
  0.3, half again the spring's, at 2.6 degrees on the default: a gentle tip
  held long enough for the heavy colour to run, which is what a hand rocking
  a dish does. And it no longer drives the colour the cover glass piles at
  the grid's wall (PLAN 27a-6, on the looks that loosen the glass) fast
  enough to cost the carries extra substeps: the 1.38 a step at the default
  that a full-height lean asked, against the plate's 1.00 held still.
*/
export const ROCK_LEAN = 0.55;
/** A lean every this many beats: the one and three. */
export const ROCK_BEATS = 2;
/** The beat the hand counts in before the grid has a tempo, seconds (120 bpm). */
export const ROCK_BEAT_GUESS = 0.5;
/** The share of the time to the next lean the reach takes; the rest the hand holds the glass tipped. */
export const ROCK_REACH = 0.8;
/** How far the rocking axis turns with each lean (radians): 26°, a half turn in about seven bars. */
export const ROCK_TURN = 0.45;
/** With no lean for this long (s) the hand puts the dish down level, over ROCK_LEVEL_MOVE. */
export const ROCK_LEVEL_AFTER = 3;
export const ROCK_LEVEL_MOVE = 1;

/** The kick's shove before the slider, for the old spring: a full kick swings it about ±1.1. */
export const ROCK_SHOVE = 7;
/** The sway between kicks, before the slider: ±0.12 of the swing (it was 0.35; below). */
export const ROCK_SWAY = 0.12;
/*
  How fast the sway wanders, in the noise's units a second. It was 0.11 (and
  0.09 on y), a lean held for five or ten seconds at a time, which through
  the old current moved nothing. As a tilt on a thin gap a lean that long
  slides the colour steadily to one side in silence: held at its far end for
  two seconds at the default Plate Rock it moved the colour 0.52, two and a
  half times what the kicks themselves move (`npm run rides`). A hand holding
  a glass wobbles about every second or two, and the colour it tips one way
  comes back the next, so the sway wanders five times as fast. That alone
  still moved it 0.185, nine tenths of the kicks' 0.205: between kicks the
  hand all but holds the glass still and the kicks are the rock, so the sway
  is a third of what it was.
*/
export const ROCK_SWAY_RATE = 0.55;

/** The sway's noise (−1 to 1 each way) at `t` seconds, for rockSwing. */
export function swayAt(noise: (x: number, y: number) => number, t: number): [number, number] {
  return [noise(t * ROCK_SWAY_RATE, 3.7), noise(7.1, t * ROCK_SWAY_RATE * 0.82)];
}
/** The swing to the plate's tilt (sinθ) the solver takes: × the swing × (dye − mean) on the old plate's current, the tilt itself on a thin gap. */
export const CUR_ROCK = 0.2;

/** A hand at rest, level. */
export function restingHand(): RockHand {
  return { x: 0, y: 0, vx: 0, vy: 0, phase: 0.7 };
}

/**
 * Minimum jerk from where the hand is, moving as it is, to rest at `p1`
 * (Flash and Hogan's quintic with the start's speed kept and both ends'
 * acceleration nought): where the reach is at `tau` (0 to 1) and its speed
 * per unit tau. `v0` is the start's speed per unit tau (speed a second × the
 * reach's seconds). From rest it is 10τ³ − 15τ⁴ + 6τ⁵ of the way; a lean
 * that falls before the last reach has finished carries the hand's speed on
 * into the next rather than stopping it dead.
 */
export function reach(p0: number, v0: number, p1: number, tau: number): [number, number] {
  const u = Math.max(0, Math.min(1, tau));
  const d = p1 - p0 - v0;
  const c3 = 10 * d + 4 * v0, c4 = -15 * d - 7 * v0, c5 = 6 * d + 3 * v0;
  const u2 = u * u, u3 = u2 * u;
  return [p0 + v0 * u + c3 * u3 + c4 * u3 * u + c5 * u3 * u2, v0 + 3 * c3 * u2 + 4 * c4 * u3 + 5 * c5 * u3 * u];
}

/**
 * A kick: the hand tips the dish to its next side if this kick is where a
 * lean falls. `place` is the kick's place in the bar (`BarGrid.placeAt`: 0
 * the one, 2 three, STRONG_BEAT one or three, null where the grid is unsure)
 * and `beat` the grid's beat period in seconds (0 unknown). Whether it leant.
 */
export function kickRock(rock: RockHand, bass01: number, accent: number, place: number | null = null, beat = 0): boolean {
  const every = ROCK_BEATS * (beat > 0 && Number.isFinite(beat) ? beat : ROCK_BEAT_GUESS);
  const since = rock.since ?? Infinity;
  const strong = place === 0 || place === 2 || place === STRONG_BEAT;
  /*
    On a strong beat at least a beat after the last lean (a double kick on the
    one is one lean); anywhere the grid is unsure, two beats after it; and on
    any kick at all once two and a half leans' time has gone by without one,
    so a grid that is sure of the wrong bar cannot hold the hand still.
  */
  const due = place === null ? since >= 0.9 * every : (strong && since >= 0.45 * every) || since >= 2.5 * every;
  if (!due || !(accent > 0)) return false;
  const lean = ROCK_LEAN * (0.6 + 0.4 * Math.max(0, Math.min(1, Number.isFinite(bass01) ? bass01 : 0))) * accent;
  rock.side = -(rock.side ?? -1);
  rock.phase += ROCK_TURN;
  rock.fromX = rock.x; rock.fromY = rock.y; rock.fromVX = rock.vx; rock.fromVY = rock.vy;
  rock.toX = rock.side * lean * Math.cos(rock.phase);
  rock.toY = rock.side * lean * Math.sin(rock.phase);
  rock.t = 0; rock.dur = ROCK_REACH * every; rock.since = 0;
  return true;
}

/** One step of `dt` seconds: the hand along its reach, or putting the dish down after the kicks stop. */
export function stepRock(rock: RockHand, dt: number): void {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  rock.since = (rock.since ?? Infinity) + dt;
  if (rock.dur === undefined || rock.toX === undefined || rock.toY === undefined) { rock.vx = 0; rock.vy = 0; return; }
  if (rock.since > ROCK_LEVEL_AFTER && (rock.toX !== 0 || rock.toY !== 0)) {
    rock.fromX = rock.x; rock.fromY = rock.y; rock.fromVX = rock.vx; rock.fromVY = rock.vy;
    rock.toX = 0; rock.toY = 0; rock.t = 0; rock.dur = ROCK_LEVEL_MOVE;
  }
  rock.t = (rock.t ?? 0) + dt;
  const D = rock.dur, tau = rock.t / D;
  const [x, dx] = reach(rock.fromX ?? 0, (rock.fromVX ?? 0) * D, rock.toX, tau);
  const [y, dy] = reach(rock.fromY ?? 0, (rock.fromVY ?? 0) * D, rock.toY, tau);
  rock.x = x; rock.y = y;
  rock.vx = tau < 1 ? dx / D : 0; rock.vy = tau < 1 ? dy / D : 0;
}

/** The old hand's kick (27a to 27f-2): the spring shoved on every kick, each a different way round. */
export function springKick(rock: RockSpring, bass01: number, accent: number): void {
  rock.vx += Math.cos(rock.phase) * bass01 * ROCK_SHOVE * accent;
  rock.vy += Math.sin(rock.phase) * bass01 * ROCK_SHOVE * accent;
  rock.phase += 2.4;
}

/** The old hand's step: a 0.9 Hz spring, damped to a fifth. */
export function springStep(rock: RockSpring, dt: number): void {
  const w = 2 * Math.PI * 0.9, z = 0.22;
  const ax = -w * w * rock.x - 2 * z * w * rock.vx;
  const ay = -w * w * rock.y - 2 * z * w * rock.vy;
  rock.vx += ax * dt; rock.vy += ay * dt;
  rock.x += rock.vx * dt; rock.y += rock.vy * dt;
}

/** The swing the plate takes, for the slider `R` and the sway's noise (−1 to 1 each way). */
export function rockSwing(rock: { x: number; y: number }, R: number, swayX: number, swayY: number): [number, number] {
  return [(rock.x + swayX * ROCK_SWAY) * R, (rock.y + swayY * ROCK_SWAY) * R];
}

/*
  The cover glass (PLAN 27a-1). The tilt above moves only the colour that is
  heavier than the plate's mean, so on a look whose colour is spread evenly a
  rock moved almost nothing (the Mac's controls run on #305: Plate Rock
  visible on 7 looks of 23, and "nothing" on the even ones, Boiling Point,
  Crowd Plate, Red Cabbage, Clock Glass). That is the right answer for the
  weight, and not the whole of what a hand rocking a clock glass shows.

  The top glass is not fixed to the bottom one. It rides on the liquid film,
  nested in the bottom glass's curve, and tipping the pair makes it slide
  downhill on that film until the curve (or the bottom glass's rim) stops it,
  then back when the hand tips the other way. A glass sliding over a film
  drags it with a shear, linear across the gap, so the liquid's column goes
  at half the glass's speed (Couette; it is what Glass Smear already is in
  hsPrep), and everything in it, colour spread evenly or not, goes with it:
  the picture sloshes with the hand.

  The glass is a damped pendulum in the bottom glass's bowl:

      dv/dt = g sinθ − (g/R_c) x − v/τ,     τ = m_A h / μ

  m_A the cover's mass per area (2 mm of glass, 5 kg/m²), R_c the bowl's
  radius of curvature, and τ the film's shear drag
  on it, which the liquid's viscosity sets: 1.4 s on the default light oil
  in the 6 mm middle, so the glass swings a few times before it settles, and
  three hundredths of a second in glycerine, so it creeps. It slides only as
  far as the gap between the two glasses' rims lets it (COVER_ROOM), where
  it stops dead: a glass against glass does not bounce.

  It moves the liquid in real seconds, not the plate's: the slide is laid in
  m/s and fluid.ts turns it into the flow's units with the step's seconds
  (as a Blow's breath), so a slow look's picture sloshes as far as a fast
  one's when the same hand rocks it.
*/
export type CoverGlass = { x: number; y: number; vx: number; vy: number };
import { DISH_METRES, DISH_REST_GAP, thicknessViscosity } from './turntable';
/** The cover's mass per area, kg/m²: 2 mm of glass at 2,500 kg/m³. */
export const COVER_KG_M2 = 5;
/*
  The bottom glass's radius of curvature, m, and how far the cover can slide
  before its rim meets the bottom glass's: a 20 cm bowl 6½ cm deep (R_c
  0.11), with a 12 cm cover in it (4 cm each way). The cover swings in it at
  √(g/R_c), 1.5 Hz, and lightly damped (on the default oil a swing falls to a
  third in 2.8 s, four swings), so how far a rock drives it is mostly how close the hand's
  0.9 Hz is to that. In a shallow clock glass it is close and the cover
  rings out to the rim on any rock at all: a 20 cm glass 3 cm deep (0.18,
  1.2 Hz) with 3 cm of room drove it there from Plate Rock 0.2 on, and on
  an evenly coloured plate in the lab (`npm run rides`) 0.2 slid the
  picture 9.4 cells and the default 0.45 as far, so the dial did nothing
  past its first fifth. A deeper bowl both holds the cover more firmly
  (R_c sinθ, two fifths less far for a tilt) and swings it further from the
  hand, so the dial reaches the rim only near its top: 3.7 cells at 0.2,
  8.7 at the default, 13.5 at full, each within an eighth of where the
  glass's slide says the liquid should be. A bowl that deep is a
  dish for a liquid show rather than a watch glass, which is what the
  projectionist would pick for a cover that answers the hand.
*/
export const BOWL_RADIUS = 0.11;
export const COVER_ROOM = 0.04;
/*
  The plate's sinθ as the solver takes it, from the hold's tilt (the swing ×
  HOLD_TILT, and the phone's) and the rock's swing: the hold × 10 and the
  rock × CUR_ROCK (fluid.ts takes both; LiquidVisualizer's step). The cover
  is tipped by the same, and `npm run rides` drives it through this too.
*/
export const HOLD_TILT = 0.004;
export function plateSin(hold: number, swing: number): number {
  return hold * 10 + swing * CUR_ROCK;
}
const G = 9.81;
/** The film's shear drag on the cover, 1/τ (per second), for the look's Thickness, at the plate's rest gap (6 mm in the middle). */
export function coverDrag(thickness: number, density = 1000): number {
  return (density * thicknessViscosity(thickness)) / (COVER_KG_M2 * DISH_REST_GAP * DISH_METRES);
}
/**
 * One step of `dt` seconds: the plate tipped by `tiltX`, `tiltY` (the sinθ
 * the solver takes, plateSin) and the film's drag `drag` (coverDrag).
 * The drag is taken implicitly, so glycerine's 30 per second is as steady
 * as the oil's 0.7 at any step.
 */
export function stepCover(c: CoverGlass, tiltX: number, tiltY: number, drag: number, dt: number, room = COVER_ROOM): void {
  /*
    A tilt that is not a number (a phone's reading gone bad) is level, and a
    glass that has become one starts again at rest: the cover integrates
    what it is given, so one NaN would otherwise stay in it, and in the
    liquid it drags, for the rest of the show.
  */
  if (!Number.isFinite(tiltX)) tiltX = 0;
  if (!Number.isFinite(tiltY)) tiltY = 0;
  if (![c.x, c.y, c.vx, c.vy].every(Number.isFinite)) { c.x = 0; c.y = 0; c.vx = 0; c.vy = 0; }
  /*
    A cover with no room is seated in the bottom glass's rim: it cannot slide
    and drags nothing (Frame Sway at 0, `coverRoom`). Held at rest outright,
    so not even a rounding error's drift reaches the film.
  */
  if (!(room > 0)) { c.x = 0; c.y = 0; c.vx = 0; c.vy = 0; return; }
  const w2 = G / BOWL_RADIUS;
  c.vx = (c.vx + dt * (G * tiltX - w2 * c.x)) / (1 + dt * drag);
  c.vy = (c.vy + dt * (G * tiltY - w2 * c.y)) / (1 + dt * drag);
  c.x += c.vx * dt; c.y += c.vy * dt;
  const r = Math.hypot(c.x, c.y);
  if (r > room) {
    // Against the rim: held there, and what was going outward stops.
    const nx = c.x / r, ny = c.y / r;
    c.x = nx * room; c.y = ny * room;
    const out = c.vx * nx + c.vy * ny;
    if (out > 0) { c.vx -= out * nx; c.vy -= out * ny; }
  }
}

/*
  Frame Sway (the owner, 2026-10-11): "I'm getting nauseous watching the
  visuals. It moves around the x/y axis with sounds ... like the whole plate
  moves around under the camera. Make the liquids and their interactions the
  main focus, not the overall movement of the plates or cameras."

  What moved was the cover glass above. On a thin gap it drags the film at
  half its slide, and the film is the whole picture: every kick at the
  default Plate Rock slid all of it a few cells one way and swung it back at
  the bowl's 1.5 Hz (`npm run framesway` measures it, per frame, on a song's
  kicks). That is a real clock glass rocked by a hand, and it is also exactly
  a camera shake, which is what a viewer's stomach reads it as. The tilt
  itself stays: it moves only the colour heavier than the plate's mean, a
  pool sliding downhill through clear liquid while the rest holds still,
  which is the liquid's own motion and what the rock is for (27a).

  So the cover sits seated by default and the dial says how loose it is: the
  room between the two glasses' rims, from none (the cover held in the
  bottom glass's rim, as a clamped clock glass is) to the 4 cm `COVER_ROOM`
  the cover had. The other things that moved the whole frame with the beat
  ride the same dial (LiquidVisualizer: the lamp following the rock; the
  plate shader: a kaleidoscope's turn and breath on the beat, the closeup's
  crinkle pulsing with it), so one dial, off by default, is everything that
  moves the frame rather than the liquid.
*/
/** The Frame Sway dial's default: the frame holds still and the liquid moves. */
export const FRAME_SWAY_DEFAULT = 0;
/** The dial, clamped, with a NaN read as off. */
export function frameSway(v: number | undefined): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v as number)) : FRAME_SWAY_DEFAULT;
}
/*
  The looks that may move the frame with the music (the owner, 2026-10-11,
  the morning after: "it's ok if the whole plate moves (or other global
  changes) with a small subset of presets. I just don't want this kind of
  look to be a default across all presets.").

  So a look may, by name, and only these: a look on this list may set Frame
  Sway above 0 and may patch the sound (the `sound`, `bands` or `hits`
  source) onto a dial that moves the whole frame (`FRAME_MOTION`,
  lib/drift.ts: the rock, the press, the kaleidoscope, the turntable, the
  lamp's swing). Every other look holds the frame still and the music moves
  its liquid. `npm run framesway` holds every shipped look to it, and holds
  the list to `FRAME_MOVING_MOST` names, so it cannot quietly become the
  default by growing.

  Bass Drop, because it is the one look about the drop: its kick has thrown
  the plate since it was written (as a patch that read nothing, until 28f),
  and its Beat Squeeze presses the whole dish. Oil Wheel is not on it: its
  band patched onto the dish's motor, and a real oil wheel turns at its
  motor's speed whatever the band does, so that patch went into the liquid.
*/
export const FRAME_MOVING_LOOKS: ReadonlySet<string> = new Set(['bass-drop']);
/** How many looks the list may ever hold: a handful, never the norm. */
export const FRAME_MOVING_MOST = 4;
/** The room the cover has to slide in for the dial: none seated, `COVER_ROOM` at full. */
export function coverRoom(sway: number | undefined): number {
  return COVER_ROOM * frameSway(sway);
}
/**
 * How far the plate's rock moves the lamp, in plate widths across and up: a
 * tipped plate lit from a new side, a twentieth of the plate at the spring's
 * full swing, for Plate Rock and Frame Sway (none by default; above).
 */
export function lampRock(rock: { x: number; y: number }, plateRock: number | undefined, sway: number | undefined): [number, number] {
  const k = (Number.isFinite(plateRock) ? Math.max(0, Math.min(1, plateRock as number)) : 0) * frameSway(sway);
  return [rock.x * 0.05 * k, rock.y * 0.05 * k];
}
