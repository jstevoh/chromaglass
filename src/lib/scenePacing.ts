/**
 * Pacing: a stage of the sequence played as a scene of a light show.
 *
 * PLAN.md §10, step 1. Twenty-odd filmed liquid light shows were measured with
 * the watch tool on 2026-09-26 (/mnt/project-files/research/light-show/, the
 * table in PLAN §10), and they share a shape that ours does not have:
 *
 *   - swells of motion, 1.5 to 3.5 a minute, each rising over a couple of
 *     seconds and falling away over two to nine;
 *   - a plate that is calm 20–40 % of the time between them;
 *   - near-black 30–60 % of the time, ranging from a full flood to a fade
 *     between scenes, and no hard cuts;
 *   - a scene every 15–30 seconds.
 *
 * Ours is equally busy all the time. `phrasing.ts` found why and stopped at
 * "a decision": its gusts scale small drops, and small drops on a plate that is
 * never still change nothing an audience can see. Real shows get their shape
 * from whole-plate events (a pour, a press, the dyes changing) with the dish
 * left alone between them, and from the light going down between scenes.
 *
 * This is the decision, made where the show is already scripted: the stage
 * sequencer. A stage is a scene. With Pacing up, each stage gets a plan made
 * when it is entered, from the show's seed:
 *
 *   - **swells**, at the measured rate, each one opened by a *moment*: a pour
 *     across a good share of the plate, a press, or the next dyes. The first
 *     swell out of darkness is always a pour, so a scene begins with colour
 *     arriving as the light comes up;
 *   - **rests** between them, where the plate's clock slows and the light
 *     settles a little;
 *   - a **dark ending**: the light falls to near-black over the stage's last
 *     few seconds, and the next stage comes up out of it.
 *
 * What it hands the show is two numbers a moment and a list of events: the
 * *activity* (a multiplier on the plate's clock and on how often the automation
 * acts: 1 is today, under 1 a rest) and the *dim* (a multiplier on the house
 * dimmer: 1 is today). At Pacing 0 the plan is empty and both are exactly 1, so
 * every sequence and every look behaves as it did before this existed. That is
 * the first thing `npm run pacing` checks.
 *
 * Pure: no clock, no DOM, no dice of its own. The caller hands it a random
 * source (the sequencer passes the show's `show.pacing` stream), so a harness
 * can drive a whole set through it in node, and the same seed plans the same
 * night.
 */

import type { SongEvent, SongShapeState } from './songShape.ts';

/** The events a scene can open a swell with. The same moves a pad or a song's action makes. */
export type PaceMoment = 'pour' | 'burst' | 'dyes' | 'drain';

export const PACE_MOMENTS: readonly PaceMoment[] = ['pour', 'burst', 'dyes', 'drain'];

/** What a stage may say about its own scene; everything is optional and has a default from the Pacing amount. */
export interface StagePace {
  /** End the stage in near-black (default: yes once Pacing is at a half or more). */
  endDark?: boolean;
  /**
   * Which moments may open its swells (default pour, burst, dyes). 'drain' is
   * only ever fired as the light goes down at a dark ending, so the dye swirls
   * away in the dark rather than in front of the room; list it to ask for that.
   */
  moments?: PaceMoment[];
}

export interface Swell {
  /** Seconds into the stage. */
  at: number;
  kind: PaceMoment;
  /** Seconds to arrive, and the time constant it falls away on. */
  attack: number;
  decay: number;
  /** How far over a planned swell's top this one goes (1, or more for a drop). */
  gain?: number;
  /** Opened by the song's drop rather than by the plan. */
  song?: boolean;
  /** Where the envelope starts its attack from (0, or for a drop wherever the scene already stood). */
  from?: number;
}

export interface ScenePlan {
  seconds: number;
  swells: Swell[];
  /** Seconds the light takes to come up out of black at the start (0: it was not dark). */
  fadeIn: number;
  /** Seconds the light takes to go down at the end (0: no dark ending). */
  fadeOut: number;
  /** When the drain fires, if the stage asked for one at its dark ending. */
  drainAt: number | null;
  /** The stage's own opening move (the first it lists, a pour by default): what a drop opens with. */
  opening: PaceMoment;
  /** The mean gap between swells this plan was made with, seconds. */
  gap: number;
}

export interface PaceSample {
  /** Multiplier on the plate's clock and the automation's rate. 1 is today's plate. */
  activity: number;
  /** Multiplier on the dimmer. 1 is today's light. */
  dim: number;
}

export const PACE_NEUTRAL: Readonly<PaceSample> = Object.freeze({ activity: 1, dim: 1 });

/*
  Following the song (PLAN §10, step 2, the second half).

  A scene planned from the seed puts its big moment wherever the dice put it,
  and a song puts its own somewhere else: the pour lands in the middle of a
  build and the drop, eight seconds later, gets a plate still settling from
  it. A projectionist does the opposite. They hold still through the build,
  winding the plate up a little as it climbs, throw the big move on the drop,
  and let the dish rest through a breakdown. `songShape.ts` now hears those
  three things live, and with **Follow the Song** up (the `songFollow`
  setting, 0 to 1) a scene is played to them:

    - a **drop** opens a swell there and then, with the stage's own opening
      move (a pour unless the stage lists another first), bigger than a
      planned one by up to half again with the drop's strength, and the
      planned swell nearest after it is taken out, because the drop was it;
    - through a **build** the planned swells wait (up to HOLD_MAX seconds, so
      a build the tracker never hears the end of does not hold the scene for
      ever) and the plate's pace climbs toward today's with the build;
    - through a **breakdown** the planned swells wait too, the plate's swells
      fall away sooner and the light settles a little lower than a rest's.

  A drop in a stage's dark ending is let go: the light is on its way down and
  the next scene comes up out of the dark with its own opening move. Nor does
  a drop open a swell within DROP_AFTER seconds of the last one: two big
  moves a breath apart are one mess, and the tracker's own drops are six
  seconds apart at least.

  At Follow 0 nothing here happens, bit for bit, and it all rides on Pacing:
  with Pacing at 0 there is no scene for the song to shape, and the plate is
  today's. `npm run pacing` holds both, and measures what following does to
  the thing the footage says a show does: motion against loudness near 0 at
  the beat and about 0.4 over twenty-second windows.
*/

/** What the song is doing, for the scene's light and pace: each 0..1, already scaled by Follow. */
export interface SongMood {
  /** How far through a build (the tracker's tension). */
  tension: number;
  /** 1 in a breakdown. */
  breakdown: number;
}
export const NO_MOOD: Readonly<SongMood> = Object.freeze({ tension: 0, breakdown: 0 });

/** What the sequencer hands a scene of the song each tick (from `songShape.ts`). */
export interface SongCue {
  /** Drops, builds and breakdowns heard since the last tick. */
  events: readonly { kind: 'build' | 'drop' | 'breakdown'; strength: number }[];
  section: 'quiet' | 'steady' | 'build' | 'breakdown';
  tension: number;
}

/*
  The cue, from what the tracker reports. The plate owns the tracker and keeps
  its last sixteen events, each numbered; the sequencer asks four times a
  second. So a tick takes the events numbered past the last one it was handed,
  and of those only the ones heard in the last CUE_STALE seconds of the song:
  a sequencer that was paused, or held in Design, does not ask, and the drop
  it missed is history by the time it asks again, not a pour to throw now.
  The number moves past a stale event too, so it is never handed over later.

  Here rather than inline in App.tsx because the review found the check
  building its own copy of the cue with neither filter: App's version could be
  deleted and `npm run pacing` stayed green. Now the app and the check call
  this one function, the check asserts both filters on it directly, and the
  wiring grep holds the app to calling it.
*/
export const CUE_STALE = 1.5;

/** What the plate reports of the song's shape (`songShape` on the visualizer's handle). */
export interface SongReport {
  now: Pick<SongShapeState, 'section' | 'tension' | 'time'>;
  events: readonly (SongEvent & { seq: number })[];
}

/** The cue for this tick from the report, and the number of the last event now seen. */
export function songCueFrom(report: SongReport | null | undefined, lastSeq: number): { cue: SongCue | null; seq: number } {
  if (!report) return { cue: null, seq: lastSeq };
  const events = report.events.filter(e => e.seq > lastSeq && report.now.time - e.at <= CUE_STALE);
  const seq = report.events.reduce((m, e) => Math.max(m, e.seq), lastSeq);
  return { cue: { events, section: report.now.section, tension: report.now.tension }, seq };
}

/*
  The numbers. BUILD_WIND: a build at its top has the plate back to 0.7 of
  the way from rest to today's pace, so the climb is seen and the drop's
  swell is still the biggest thing in the scene (a planned swell's top is 1.8
  at full Pacing, a drop's at full strength 0.2 + 1.6 × 1.5 = 2.6: the plate's
  own step clamp keeps the solver where it was at 1.8).
  BREAKDOWN_HUSH and _DIM: through a breakdown a swell's envelope is cut to a
  fifth and the rest's light a further fifth down, which at full Pacing is the
  light at 0.58 against a rest's 0.72, a settling rather than a fade. DROP_GAIN:
  a drop of full strength goes half again over a planned swell's top.
  HOLD_MAX: twenty-four seconds, which is sixteen bars at 160 bpm or a long
  build at 128; past it the plan plays on. DROP_ATTACK/DECAY: a drop arrives
  in 0.6 s, not the planned 1.5–3, because it is on a beat, and falls away
  over 4–7 s like a planned one.
*/
const BUILD_WIND = 0.7;
const BREAKDOWN_HUSH = 0.8;
const BREAKDOWN_DIM = 0.2;
const DROP_GAIN = 0.5;
const HOLD_MAX = 24;
const DROP_AFTER = 4;
const DROP_ATTACK = 0.6;
/** A held swell is moved on this far each tick: a little over the sequencer's quarter second, so it is never due. */
const HOLD_STEP = 0.3;

/*
  The numbers, and where each comes from.

  Swell rate: the footage ran 1.5 to 3.5 a minute (JLS 2.9, the Dregs 1.6,
  Sheep Dip 1.75), so Pacing spans that range, a slow set at a little and a
  busy one at full.

  Rise and fall: measured rises and decays ran 2 to 9 seconds. A swell here
  arrives over 1.5–3 s and falls on a 3–7 s time constant: the plate carries
  its motion on after the push, so what reaches the screen is slower than the
  envelope. That is also why the envelope is not exactly the measured one;
  the film on the Mac is what says where it landed.

  Rest and peak: the plate's clock at a fifth of its pace at rest at full
  Pacing, and 1.8 times it at a swell's top. `phrasing.ts` found a rest has
  to be deep to read as one ("a rest is a real rest") and started from a
  third. Measured with the footage's own yardstick (`npm run pacing`, calm is
  the share of the time under a third of the 90th percentile of motion), a
  third under a top of 1.5 left the rests sitting on that line: "Light Show
  Night" read 18 % calm against the footage's 20–40 %, and 14 % of its lit
  time. A fifth under 1.8 reads 25–28 %, with the swells' tops 2.4 times the
  median against the footage's 2.5. The swell's top goes above today's pace,
  so a set at full Pacing has peaks rather than only valleys.

  Darkness: near-black is 30–60 % of real shows on average, with a range down
  to a fade between scenes. Most of that is the looks' own black surround; the
  dimmer adds the fades between scenes and a slight settling in the rests.
  BLACK is not zero because a fade that goes to exact black reads as the
  projector switching off, where a real show's fade leaves a glow.

  The fades are slow: down over a third of the scene (8 to 14 s), up over a
  quarter (6 to 9 s). They began at a sixth and a tenth (3 to 8 s, 2.5 to 5),
  and measured by the footage's yardstick with the fade counted as what it is
  on a frame (the dimmer scales every pixel, so a fade is a change in all of
  them), each fade read as a swell of its own: 4.3 swells a minute, decaying
  in 1.5 s, and the rests calm 47 % of the time because the fades set the top
  of the scale. At these lengths a fade changes the frame about as much as
  the plate moving does, and a scene measures 2.35 swells a minute, calm 27 %,
  its swells 2.4 times the median (the footage's 2.5), rising over 2.5 s and
  falling over 3.3 (`npm run pacing`). A scene of 25 s is lit for about 10;
  most of the footage's darkness is like that, a slow going and coming.
*/
const RATE_MIN = 1.5, RATE_MAX = 3.5;          // swells a minute, at Pacing 0+ and 1
const REST_AT_FULL = 0.2;                      // the clock at rest, at full Pacing
const PEAK_OVER = 0.8;                         // how far over today's pace a swell's top goes, at full
const REST_DIM_AT_FULL = 0.72;                 // the light at rest, at full Pacing
const BLACK = 0.04;                            // the bottom of a fade between scenes
const FADE_OUT = [8, 14] as const;             // seconds, a third of the stage within these
const FADE_IN = [6, 9] as const;               // seconds, a quarter of the stage within these
const MARGIN = 2;                              // no swell opens this close to the fade or the end

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const smooth = (x: number) => { const k = clamp(x, 0, 1); return k * k * (3 - 2 * k); };

/**
 * Plan one stage as a scene.
 *
 * `fromDark` is whether the stage before it ended in near-black, so this one
 * comes up out of it. `rand` is a uniform [0, 1) source.
 */
export function planScene(
  seconds: number,
  pacing: number,
  rand: () => number,
  opts: { fromDark?: boolean; pace?: StagePace } = {},
): ScenePlan {
  const p = clamp(pacing, 0, 1);
  const T = Math.max(1, seconds);
  if (p <= 0.001) return { seconds: T, swells: [], fadeIn: 0, fadeOut: 0, drainAt: null, opening: 'pour', gap: Infinity };

  const endDark = opts.pace?.endDark ?? p >= 0.5;
  const fadeOut = endDark ? clamp(T / 3, FADE_OUT[0], Math.min(FADE_OUT[1], T / 2)) : 0;
  const fadeIn = opts.fromDark ? clamp(T / 4, FADE_IN[0], Math.min(FADE_IN[1], T / 4)) : 0;
  // A stage's moments come from a file someone may have written by hand, so
  // only the four known ones are taken, whatever else the list holds.
  const listed = Array.isArray(opts.pace?.moments) ? opts.pace.moments.filter(m => PACE_MOMENTS.includes(m)) : null;
  const allowed = (listed ?? ['pour', 'burst', 'dyes']).filter(m => m !== 'drain');
  const kinds: PaceMoment[] = allowed.length ? allowed : ['pour'];
  /*
    The drain fires once the light is down, not as it starts to go: the
    drain takes most of a second, and fired at the top of the fade (the
    first version) it ran with the light at 0.93, so the room watched the
    dye swirl away and then watched an empty plate fade. An eighth of the fade
    from the end is where the smoothstep has the light near black, and
    `npm run pacing` holds it there.
  */
  const drainAt = endDark && (listed ?? []).includes('drain') ? T - fadeOut * 0.12 : null;

  /*
    Where the swells go.

    Jittered around the mean gap rather than exponential. Phrasing's gusts are
    exponential on purpose — weather — and two landing together there is a
    busier gust. Here each swell is a whole-plate event, and two a second
    apart are one mess followed by a long hole; the footage's gaps (median
    17–40 s) do not show that. Between 0.6 and 1.4 of the mean keeps them
    irregular without clumping.

    The first opens the scene: at once out of darkness (the stage's first
    moment arrives as the light comes up, a pour unless the stage says
    otherwise), otherwise somewhere in the first gap, so a stage change is not
    always the instant something lands.

    The rate is kept over the whole stage, not only its lit part. A scene owes
    T / gap swells; the first is always there, and the rest are spread over
    what is left of the stage after it. Spaced at the plain gap from the first
    instead, a 25-second scene with its opening pour and a dark ending packed
    two swells into its 18 lit seconds, and a set of such scenes measured 3.35
    to 3.55 a minute at a Pacing that asks for 2.9 (`npm run pacing`). Short
    scenes now get one swell each, which is what the footage shows: a scene
    every 15 to 30 seconds and a swell every 17 to 40.
  */
  const gap = 60 / (RATE_MIN + (RATE_MAX - RATE_MIN) * p);
  const last = T - fadeOut - MARGIN;
  const swells: Swell[] = [];
  let t = opts.fromDark ? Math.min(0.5, fadeIn * 0.2) : 1 + rand() * gap * 0.6;
  const owed = T / gap;
  const spacing = owed > 1 ? Math.max(gap * 0.6, (last - t) / (owed - 1)) : Infinity;
  let prev: PaceMoment | null = null;
  while (t <= last) {
    /*
      Out of darkness the first is the stage's own opening move: the first it
      lists, a pour by default. It was always a pour, and since a scene of 20
      to 30 seconds has one swell, a set of them was all pours: "The dish,
      pressed" never pressed (the review's count: 47 pours, no press, no dye
      change in a night). After that, no moment twice running.
    */
    let kind: PaceMoment;
    if (swells.length === 0 && opts.fromDark) kind = kinds[0];
    else {
      const pool: PaceMoment[] = kinds.length > 1 && prev ? kinds.filter(k => k !== prev) : kinds;
      kind = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
    }
    swells.push({ at: t, kind, attack: 1.5 + 1.5 * rand(), decay: 3 + 4 * rand() });
    prev = kind;
    t += spacing * (0.6 + 0.8 * rand());
  }
  return { seconds: T, swells, fadeIn, fadeOut, drainAt, opening: kinds[0], gap };
}

/** How far into a swell's envelope `dt` seconds after it opened: up smoothly, down exponentially. */
function envelope(s: Swell, dt: number): number {
  if (dt < 0) return 0;
  const g = s.gain ?? 1;
  if (dt < s.attack) { const f = s.from ?? 0; return f + (g - f) * smooth(dt / s.attack); }
  return g * Math.exp(-(dt - s.attack) / s.decay);
}

/**
 * Where the scene is `t` seconds in, at Pacing `pacing` (read live, so a
 * stage that glides the dial glides the depth of its scene too).
 */
export function sampleScene(plan: ScenePlan, t: number, pacing: number, mood: SongMood = NO_MOOD): PaceSample {
  const p = clamp(pacing, 0, 1);
  if (p <= 0.001) return { ...PACE_NEUTRAL };
  let env = 0;
  for (const s of plan.swells) env = Math.max(env, envelope(s, t - s.at));
  // A breakdown lets the swells fall away sooner and holds the plate low.
  env *= 1 - BREAKDOWN_HUSH * clamp(mood.breakdown, 0, 1);

  const rest = 1 - (1 - REST_AT_FULL) * p;
  const peak = 1 + PEAK_OVER * p;
  let activity = rest + (peak - rest) * env;
  // A build winds the plate up toward today's pace as it climbs, and no
  // further: the swell over today's pace is the drop's.
  activity = Math.max(activity, rest + (1 - rest) * BUILD_WIND * clamp(mood.tension, 0, 1));

  const restDim = (1 - (1 - REST_DIM_AT_FULL) * p) * (1 - BREAKDOWN_DIM * clamp(mood.breakdown, 0, 1));
  let dim = Math.min(1, restDim + (1 - restDim) * env);

  // Up out of black, and down into it, on smoothsteps: a crossfade's shape,
  // never a step, which is the "no hard cuts" row of the yardstick.
  let light = 1;
  if (plan.fadeIn > 0) light = Math.min(light, smooth(t / plan.fadeIn));
  if (plan.fadeOut > 0) light = Math.min(light, 1 - smooth((t - (plan.seconds - plan.fadeOut)) / plan.fadeOut));
  dim = BLACK + (dim - BLACK) * light;
  // In the dark the plate rests too: nothing an audience cannot see should be
  // spending the swell that the next scene opens with.
  activity = rest + (activity - rest) * light;
  return { activity, dim };
}

/** Whether a stage planned like this ends in the dark, for the next stage to come up out of. */
export const endsDark = (plan: ScenePlan | null): boolean => !!plan && plan.fadeOut > 0;

/*
  How the plate follows the plan: at most this fast, whatever the plan asks.

  The plan's own fades are smoothsteps over three seconds or more, whose
  steepest point moves the light about 0.5 a second, so this limit never bends
  a fade that was planned. It is for the moves nobody planned: the operator
  stops the sequence in the middle of a dark ending, pulls Pacing to 0, or
  presses Next with the light halfway down. Each of those hands the plate a new
  target in one tick, and without a limit the light would come back in a
  third of a second, which is the hard cut this whole file is here to remove.
  At 0.6 a second, black to full light takes a second and a half.

  The activity is not rate-limited, only smoothed over a third of a second:
  the plan's swells are already smooth curves, and the visualizer applies it
  to the plate's clock after the phrase's 2.5 s lean rather than through it,
  which would have flattened each swell to about half.
*/
export const DIM_RATE = 0.6;
const ACTIVITY_TAU = 0.35;

/** One frame of the plate following a pace target: the light rate-limited, the activity smoothed. */
export function approachPace(prev: PaceSample, target: PaceSample, dt: number): PaceSample {
  const step = DIM_RATE * Math.max(0, dt);
  const dim = prev.dim + clamp(target.dim - prev.dim, -step, step);
  const activity = prev.activity + (target.activity - prev.activity) * (1 - Math.exp(-Math.max(0, dt) / ACTIVITY_TAU));
  return { activity, dim };
}

/*
  Playing a plan: which moments are due, and where the scene is.

  Here rather than in the sequencer hook so that the part that decides when
  a pour lands can be driven through a whole set in node (`npm run pacing`),
  tick by tick, exactly as the hook drives it.

  A moment more than `STALE_MOMENT` late is dropped rather than fired. The
  sequencer ticks every quarter second, so anything due is normally caught
  within one; later than this is a jump — a desk located forward, a stage
  started part-way through by song identification, a tab throttled in the
  background — and firing every pour the jump skipped would land them all at
  once, the pile-up the plan was spacing out. A locate backwards re-arms what
  is ahead again.
*/
export const STALE_MOMENT = 1.5;

export interface SceneCursor {
  /** The next swell whose moment has not fired. */
  nextSwell: number;
  /** Whether the dark ending's drain has fired (or was passed). */
  drained: boolean;
  /** Seconds into the stage at the last step, to see a locate going backwards. */
  lastElapsed: number;
}

/** A cursor at `elapsed` seconds in, owing nothing from before it. */
export function cursorAt(plan: ScenePlan, elapsed: number): SceneCursor {
  const i = plan.swells.findIndex(sw => sw.at >= elapsed);
  return {
    nextSwell: i < 0 ? plan.swells.length : i,
    drained: plan.drainAt !== null && plan.drainAt < elapsed,
    lastElapsed: elapsed,
  };
}

/** One tick: the moments now due (in order) and the scene's sample. Moves `cur` on. */
export function stepScene(plan: ScenePlan, cur: SceneCursor, elapsed: number, pacing: number, mood: SongMood = NO_MOOD): { sample: PaceSample; moments: PaceMoment[] } {
  const moments: PaceMoment[] = [];
  if (pacing <= 0.001) { cur.lastElapsed = elapsed; return { sample: { ...PACE_NEUTRAL }, moments }; }
  if (elapsed + 0.01 < cur.lastElapsed) Object.assign(cur, cursorAt(plan, elapsed));
  while (cur.nextSwell < plan.swells.length && plan.swells[cur.nextSwell].at <= elapsed) {
    const sw = plan.swells[cur.nextSwell++];
    if (elapsed - sw.at <= STALE_MOMENT) moments.push(sw.kind);
  }
  if (!cur.drained && plan.drainAt !== null && plan.drainAt <= elapsed) {
    cur.drained = true;
    if (elapsed - plan.drainAt <= STALE_MOMENT) moments.push('drain');
  }
  cur.lastElapsed = elapsed;
  return { sample: sampleScene(plan, elapsed, pacing, mood), moments };
}

/*
  One stage's scene, played: the plan, where it has got to, and the plans
  after it when the stage outlasts one.

  The sequencer hook keeps one of these per stage and calls `tick` every
  quarter second; `npm run pacing` drives the same class through whole sets.
  It was first written inline in the hook with a copy in the check, and the
  review found the check testing its copy: three changes to the hook (section
  stages allowed to end dark, never coming up from the dark, the plate never
  following) left every line green.
*/

/**
 * How long a scene is planned for when the stage has no end of its own clock:
 * a section stage or a hold. No dark ending, because the plan cannot know when
 * the section will change and a fade that lands at the stage's minimum would
 * leave the plate black until it did. A stage that outlasts it (a hold left
 * up, a section that never changes) is given the next plan on from there
 * rather than sitting at rest for the rest of the night.
 */
export const OPEN_SCENE_SECONDS = 600;

/** A stage comes up out of the dark when the light last sent was under this. */
export const FROM_DARK_BELOW = 0.5;

/** What the player needs of a stage (a `ShowStage` has all of it). */
export interface PacedStage {
  seconds: number;
  advance: 'time' | 'section' | 'hold';
  pace?: StagePace;
}

const freshCursor = (): SceneCursor => ({ nextSwell: 0, drained: false, lastElapsed: 0 });

export class ScenePlayer {
  plan: ScenePlan | null = null;
  cursor: SceneCursor = freshCursor();
  /** Seconds into the stage the plan in force starts at: past 0 only once an open stage has outrun a plan. */
  planFrom = 0;

  /**
   * `rand` is the show's dice (the hook passes the `show.pacing` stream: seeded
   * with the night, and not a `plate.` stream, because a scene belongs to the
   * set and should not start over when a look is laid in the middle of it).
   */
  constructor(private readonly stage: PacedStage, private readonly rand: () => number) {}

  private make(pacing: number, fromDark: boolean): ScenePlan | null {
    if (pacing <= 0.001) return null;
    const timed = this.stage.advance === 'time';
    return planScene(
      timed ? this.stage.seconds : Math.max(this.stage.seconds, OPEN_SCENE_SECONDS),
      pacing,
      this.rand,
      { fromDark, pace: timed ? this.stage.pace : { ...this.stage.pace, endDark: false } },
    );
  }

  /** Entering the stage, at the Pacing it is going to; `fromDark` when the light is down as it enters. */
  enter(pacing: number, fromDark: boolean): this {
    this.holdFrom = null;
    this.wound = 0;
    this.droppedAt = null;
    this.plan = this.make(pacing, fromDark);
    this.cursor = freshCursor();
    this.planFrom = 0;
    return this;
  }

  /** When the song began holding the swells back (a build or a breakdown), seconds into the plan in force. */
  private holdFrom: number | null = null;
  /** Drops that opened a swell, and drops let go (in a dark ending, or a breath after a swell): counted for `npm run pacing`. */
  dropsOpened = 0;
  dropsLetGo = 0;
  /** How far the last build had wound the plate (its tension × Follow), carried into the drop's attack. */
  private wound = 0;
  /** When the last drop opened its swell, seconds into the plan in force. */
  private droppedAt: number | null = null;

  /**
   * One tick, `elapsed` seconds into the stage, at the Pacing in force now.
   * `song` is what the song's shape heard since the last tick, and `follow`
   * how far the scene follows it (the Follow the Song setting): see
   * "Following the song" above. With either missing or 0 this is the scene
   * exactly as planned.
   */
  tick(elapsed: number, pacing: number, song: SongCue | null = null, follow = 0): { sample: PaceSample; moments: PaceMoment[] } {
    if (!this.plan && pacing > 0.001) {
      // Pacing came up mid-stage: plan from here, with nothing owed from before.
      this.plan = this.make(pacing, false);
      this.planFrom = 0;
      if (this.plan) this.cursor = cursorAt(this.plan, elapsed + 0.001);
    }
    if (this.plan && this.planFrom > 0 && elapsed < this.planFrom) {
      // Located back before the plan in force: start this stage's plans over.
      this.plan = this.make(pacing, false);
      this.planFrom = 0;
      if (this.plan) this.cursor = cursorAt(this.plan, elapsed);
    }
    if (this.plan && this.stage.advance !== 'time' && elapsed - this.planFrom >= this.plan.seconds) {
      // An open stage past its plan: the next one, on from here.
      this.planFrom += this.plan.seconds;
      this.plan = this.make(pacing, false);
      this.cursor = freshCursor();
    }
    if (!this.plan) return { sample: { ...PACE_NEUTRAL }, moments: [] };
    const local = elapsed - this.planFrom;
    const f = clamp(follow, 0, 1);
    let mood: SongMood = NO_MOOD;
    if (song && f > 0.001 && pacing > 0.001) {
      const holding = song.section === 'build' || song.section === 'breakdown';
      if (!holding || (this.holdFrom !== null && local < this.holdFrom)) this.holdFrom = holding ? local : null;
      else if (this.holdFrom === null) this.holdFrom = local;
      if (holding && this.holdFrom !== null && local - this.holdFrom < HOLD_MAX) this.hold(local);
      for (const e of song.events) if (e.kind === 'drop') this.drop(local, clamp(e.strength, 0, 1), f);
      /*
        The wind-up is carried into the drop. The tracker says "steady" on the
        drop's own frame, and the drop's swell starts from nothing, so taken
        as it stands the plate fell from the build's pace to the rest's for a
        tick just as the pour landed: measured at Pacing 0.7 through a 16 s
        build, 0.83 to 0.44 and back up to 1.07 a quarter second later, the
        clock visibly slowing on the downbeat before it surged. So the build's
        wind holds under the drop and gives way over its attack.
      */
      if (song.section === 'build') this.wound = clamp(song.tension, 0, 1) * f;
      let tension = song.section === 'build' ? this.wound : 0;
      if (this.droppedAt !== null && local - this.droppedAt < DROP_ATTACK) {
        tension = Math.max(tension, this.wound * (1 - (local - this.droppedAt) / DROP_ATTACK));
      } else if (song.section !== 'build') this.wound = 0;
      mood = { tension, breakdown: song.section === 'breakdown' ? f : 0 };
    } else { this.holdFrom = null; this.wound = 0; this.droppedAt = null; }
    return stepScene(this.plan, this.cursor, local, pacing, mood);
  }

  /*
    Three paths worth knowing. A breakdown running straight into a build is
    one hold, so HOLD_MAX (24 s) can run out inside the build and a planned
    swell fire before the drop; that is the cap doing its job on a long
    stretch without a drop. A stage change starts the hold's count again, as
    it starts a new plan. And a locate backwards within a stage replays the
    plan as the song left it: its drops' swells where they were put, the
    planned swells they replaced gone.

    Hold the plan's next swell back while the song winds up or breaks down:
    one due on this tick is moved on to the next, and any others due with it
    are let go, so that when the hold ends one swell arrives and not a
    pile-up. Past the scene's last moment for a swell (its dark ending), a
    held swell is let go too.
  */
  private hold(local: number): void {
    const plan = this.plan!;
    const next = local + HOLD_STEP;
    const lastAt = plan.seconds - plan.fadeOut - MARGIN;
    let kept = false;
    plan.swells = plan.swells.filter((sw, i) => {
      if (i < this.cursor.nextSwell || sw.song || sw.at > next) return true;
      if (kept || next > lastAt) return false;
      kept = true;
      sw.at = next;
      return true;
    });
  }

  /*
    The drop: a swell now, with the stage's own opening move, and the planned
    swell nearest after it taken out (a held one is always there, since a
    hold keeps it one tick ahead). Let go in a dark ending, or a breath after
    the last swell.
  */
  private drop(local: number, strength: number, f: number): void {
    const plan = this.plan!;
    if (plan.fadeOut > 0 && local >= plan.seconds - plan.fadeOut) { this.dropsLetGo++; this.wound = 0; return; }
    const fired = plan.swells.slice(0, this.cursor.nextSwell);
    const prev = fired.length ? fired[fired.length - 1] : null;
    if (prev && local - prev.at < DROP_AFTER) { this.dropsLetGo++; this.wound = 0; return; }
    const window = Number.isFinite(plan.gap) ? plan.gap * 0.6 : 0;
    plan.swells = plan.swells.filter((sw, i) => i < this.cursor.nextSwell || sw.at > local + window);
    // It rises from wherever the scene stands, not from nothing: a drop that
    // lands while a planned swell is still falling away took the pace down
    // with that swell for a tick before its own attack caught up.
    let now = 0;
    for (const sw of plan.swells) now = Math.max(now, envelope(sw, local - sw.at));
    plan.swells.splice(this.cursor.nextSwell, 0, {
      at: local, kind: plan.opening, attack: DROP_ATTACK, decay: 4 + 3 * strength, gain: 1 + DROP_GAIN * strength * f, song: true, from: now,
    });
    this.holdFrom = null;
    this.droppedAt = local;
    this.dropsOpened++;
  }
}
