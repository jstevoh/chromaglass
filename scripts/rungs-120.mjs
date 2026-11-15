/**
 * The plate on a 120 Hz screen (PLAN.md 46e, 14aa-5), run by `npm run rungs`
 * through `owedLines` and written in a module beside it because rungs.mjs is
 * past 40 KB.
 *
 * What was reported: the governor's lines are drawn in a 60 Hz display's
 * milliseconds (`SLOW_MS` 22, `FAST_MS` 18.5, `MISSED_MS` 25 in
 * src/lib/governor.ts), so on a 120 Hz screen (the owner's laptop, most
 * phones, a ProMotion iPad) a missed refresh is not seen as one. This is the
 * replay that says what that costs, and the bar the fix is built against.
 *
 * What it costs, measured here before anything was changed. With sixty steps
 * a second on a 120 Hz screen a plate's step lands every other refresh; a
 * frame that holds the loop past two refreshes (a step's frame that runs a
 * little long, or a frame of two steps catching up) comes back after three,
 * 25 ms, and the step clock owes a step and a half: the plate holds one image
 * half a step too long and later draws two steps in one frame, the liquid
 * stopping and then jumping, which is exactly the stutter 14aa-3 took out at
 * 60 Hz. At 60 Hz that interval is 33 ms and plainly past `MISSED_MS`; at
 * 120 Hz it is 25.0 ms, *on* the line, and `frameMs > MISSED_MS` does not
 * count it. A display's vsync is regular to microseconds and three refreshes
 * are exactly 25 ms, so Chrome's stamps, rounded to a tenth of a millisecond,
 * read 25.0 every time; only a stamp scattered across a rounding edge reads
 * 25.1 and is counted. (The first version of this comment said "about half"
 * are counted. The check-skeptic measured the replay: with no scatter, 7 of
 * 21,600 three-refresh gaps read over 25, from floating point. Every miss
 * main counted was a 33 ms one.) So the share of missed frames that gives the
 * step rate up (`MISS_SHARE`) builds from the rarer four-refresh frames
 * alone: Poster, 1969's measured costs (the 60 Hz replay in rungs.mjs) at one
 * miss in eight give sixty up after 13.5 s on one seed, 60 s on another, and
 * on the third never, 1135 steps drawn two to a frame in three minutes; at
 * one in five after 6.2 to 12.9 s. With the stamps scattered ±0.05 ms it is
 * 4.3 to 12.1 s at one in eight, 20 steps skipped on one seed. At ±0.1 ms
 * main all but passes, so how red main is on the owner's screen depends on a
 * scatter nobody has measured (46e-2); the build is held to both scatters
 * here. At 60 Hz the same machine gives sixty up at 4.0 s every time, with no
 * step skipped after the opening.
 *
 * What the replay is. The real frame loop's three pieces, the real ones:
 * `DrawGate` (offered every refresh's stamp, as `render` in
 * LiquidVisualizer.tsx offers it), `StepClock` (fed the gate's interval, with
 * the visualizer's catch-up cap from `governor.frameMs`), and the governor
 * (fed the interval and the frame's GPU cost, as the visualizer feeds it). A
 * fix in the governor or the step clock is seen here. The gate is offered
 * one clock, the laptop's, so it draws every frame offered: a fix in its
 * two-clock path (the wall up, 14b-120) is not this replay's. The catch-up
 * cap is retyped from the visualizer, so a line reads it from the source and
 * goes red the day the two differ. What is modelled is the machine: a
 * frame costs its drawing plus its steps (the same costs as the 60 Hz replays
 * in rungs.mjs, so the two are the same machine on two screens), and it holds
 * the loop for as many whole refreshes as that takes. Then, for a machine
 * that misses at random (Poster), a frame that ends within 3.7 ms of a
 * refresh's edge (13 ms of a 16.7 ms refresh, the 60 Hz replay's line, kept
 * in milliseconds because a GPU's scatter is in milliseconds, not refreshes)
 * misses it at the given share and takes one more. Stamps are rounded to a
 * tenth of a millisecond, as Chrome's are.
 *
 * Holding the loop for whole refreshes is a shortcut, and a named one. A real
 * browser keeps a frame or two in flight, so a long frame can show as a late
 * present with the callbacks still on time, and a ProMotion panel can change
 * its own refresh. Whether the app's real frames on the owner's 120 Hz
 * screen look like this replay is the Mac's to say (`npm run stutter`, 46c),
 * not this file's; this is the policy given that model, as the 60 Hz Poster
 * replay is.
 *
 * What is measured is the feature, not the lines. A step is an image; on any
 * screen the plate is even when every image is held for one step's time
 * (16.7 ms at sixty steps, 33.3 at thirty), within 6 %, and no step is drawn
 * in a frame with another (a step the audience never saw). Both are counted
 * after the opening's ten seconds, and a hold that spans a change of the step
 * rate is not judged. So a fix is free to be the lines drawn in refreshes, or
 * a miss judged against the step's own time, or the gate pacing its draws;
 * what it is not free to do is spend the picture. A naive "draw every line in
 * refreshes" asks a 120 Hz screen for 120 drawn frames, and a plate whose
 * steps already land evenly every other refresh (Classic's costs, below)
 * would give up its step rate and then its grid for frames nobody sees as
 * different: the controls hold every machine at 120 Hz to the rung and the
 * step rate it keeps at 60 Hz. The owner's rule is that the look comes first.
 *
 * Owed (`--owed=120hz`, the convention of rungs-owed.mjs): Poster at 120 Hz
 * fails today, so its two lines print as owed while main's governor still
 * has its miss line exactly as it is (`MISSED_MS = 25` and the `missShare`
 * line, read from the source), and are red the day that line changes and
 * they still fail. A fix built in the step clock alone leaves that line as it
 * is, so its PR takes `120hz` out of `--owed` to be judged. The controls are
 * not owed: they pass on main, and they are what keep the fix from buying
 * 120 Hz's evenness with the picture.
 *
 * Proofs that the owed lines can pass, on all 18 Poster runs: a miss judged
 * as an interval past a step and a quarter (`frameMs > 1.25 * 1000 /
 * STEP_RATES[this.steps]`), and the one character `frameMs >= MISSED_MS`.
 * Both keep every other line green. The second is an honest fix for 120 Hz
 * only (three refreshes are 25.0 ms there; at 60 Hz no interval is): at
 * 144 Hz three refreshes are 20.8 ms and still not a miss, which this check
 * does not replay (46e-3). Which line is right is the build's to argue.
 */

import { readFileSync } from 'node:fs';
import { StepClock } from '../src/lib/stepClock';

/** One refresh's worth of milliseconds at a 60 Hz display, the zone a GPU's scatter misses a refresh in (see above). */
const MISS_ZONE_MS = 16.7 - 13;
/** The opening, not judged: the governor settles, the step clock learns the refresh. */
const OPENING_MS = 10_000;
/** How far an image's hold may sit from one step's time and still be even: 6 %, the step clock's own slack for one interval. */
const HOLD_SLACK = 0.06;

/**
 * Replay `seconds` of a plate on a `hz` screen through the real draw gate,
 * step clock and governor. `machine(rung, stepRate)` gives the drawing's and
 * a step's GPU milliseconds, and for a machine that misses at random its
 * `share`. Counts, after the opening, the steps drawn in a frame with
 * another (`skipped`) and the images held off one step's time (`uneven`, of
 * `holds`).
 */
export function replayAt({ QualityGovernor, DrawGate, ladder, start, machine, hz, seconds = 180, seed = 1, jitter = 0 }) {
  const R = 1000 / hz;
  let x = seed >>> 0;
  const next = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; };
  // The display's refresh, scattered by `jitter` ms either way (its own seeded stream), then rounded to 0.1 ms as Chrome's stamps are.
  let y = (seed * 7919 + 17) >>> 0;
  const wobble = () => { y = (y * 1664525 + 1013904223) >>> 0; return (y / 2 ** 32) * 2 - 1; };
  const stamps = [];
  const stamp = (i) => {
    while (stamps.length <= i) stamps.push(Math.round((stamps.length * R + jitter * wobble()) * 10) / 10);
    return stamps[i];
  };
  const g = new QualityGovernor(ladder, start, 0);
  const gate = new DrawGate();
  const clock = new StepClock();
  let k = 0, lastDrawn = -Infinity, lastImage = -Infinity, lastImageRate = 0;
  let skipped = 0, uneven = 0, holds = 0;
  const moves = [];
  while (stamp(k) < seconds * 1000) {
    const t = stamp(k);
    // A frame the gate turns away costs nothing and the loop asks again next refresh.
    if (!gate.offer('frame', t)) { k += 1; continue; }
    const dtS = Number.isFinite(lastDrawn) ? (t - lastDrawn) / 1000 : R / 1000;
    lastDrawn = t;
    // LiquidVisualizer's catch-up cap (the GPU path, where a step's JavaScript is a submission).
    const catchUp = g.frameMs > 40 ? 1 : g.frameMs > 24 ? 2 : 4;
    const rate = g.stepRate;
    const steps = clock.steps(dtS, 1 / rate, catchUp);
    const m = machine(g.rung, rate);
    const cost = m.draw + m.step * steps;
    let held = Math.max(1, Math.ceil(cost / R - 1e-9));
    if (m.share && held * R - cost < MISS_ZONE_MS && next() < m.share) held += 1;
    if (steps >= 1) {
      if (t > OPENING_MS) {
        skipped += steps - 1;
        if (lastImageRate === rate && Number.isFinite(lastImage)) {
          const period = 1000 / rate;
          holds++;
          if (Math.abs(t - lastImage - period) > HOLD_SLACK * period) uneven++;
        }
      }
      lastImage = t;
      lastImageRate = rate;
    }
    if (g.sample(dtS, 1, t / 1000, false, cost, m.step, steps)) moves.push({ at: t / 1000, index: g.rungIndex, stepRate: g.stepRate });
    k += held;
  }
  return { g, skipped, uneven, holds, moves };
}

export function lines120({ line, check, ladderAt, QualityGovernor, DrawGate }) {
  const seen = (r) => `${r.grid}²@${r.dpr.toFixed(2)}`;
  const { rungs: ladder, start } = ladderAt('local', 'strong', 2);
  /*
    The machines, each the 60 Hz replay's in rungs.mjs: Poster, 1969 as
    measured on the owner's Mac (4.0 ms of drawing at one pixel, a step 9.8 ms
    at 512² and sixty, 8.2 at thirty, 25.1 at 768²), missing at random at one
    frame in eight, five and three; the light plate (1.5 ms and 2.5 ms) that
    climbs to 512² at two pixels; Classic's costs (5.8 ms and 7.1 ms), over
    the climb budget with its frames on time; and a plate so light it climbs
    to the top rung, whose every frame fits in one 120 Hz refresh.
  */
  const poster = (share) => (rung, rate) => ({
    draw: 4.0 * rung.dpr ** 2,
    step: rung.grid === 768 ? 25.1 : rung.grid === 512 ? (rate === 60 ? 9.8 : 8.2) : 8.2 * (rung.grid / 512) ** 2,
    share,
  });
  const light = (rung) => ({ draw: 1.5 * rung.dpr ** 2, step: 2.5 * (rung.grid / 512) ** 2 });
  const classic = (rung) => ({ draw: 5.8 * rung.dpr ** 2, step: 7.1 * (rung.grid / 512) ** 2 });
  const feather = (rung) => ({ draw: 0.6 * rung.dpr ** 2, step: 0.8 * (rung.grid / 512) ** 2 });
  const posters = [];
  for (const share of [1 / 8, 1 / 5, 1 / 3]) for (const seed of [1, 2, 3]) posters.push({ name: `Poster 1 in ${Math.round(1 / share)}, seed ${seed}`, machine: poster(share), seed });
  const calm = [{ name: 'light', machine: light, seed: 1 }, { name: 'Classic', machine: classic, seed: 1 }, { name: 'feather', machine: feather, seed: 1 }];
  /*
    Each machine at two stamp scatters: none (a display's vsync is regular to
    microseconds, so a rounded stamp is the refresh grid itself and three
    refreshes read exactly 25.0 ms every time) and ±0.05 ms (a stamp that
    rounds the other way now and then). The check-skeptic found the first
    version ran only the first, and that at ±0.1 ms main's governor all but
    passes, since half the 25.0s then read 25.1: whether main is red depends
    on a scatter the owner's screen has not been measured for yet (46e-2).
    Both are red on main, and a build is held to both.
  */
  const JITTERS = [0, 0.05];
  const machines = [...posters, ...calm];
  const at = (hz) => machines.flatMap((p) => JITTERS.map((jitter) => ({ ...p, name: `${p.name} ±${jitter} ms`, jitter,
    ...replayAt({ QualityGovernor, DrawGate, ladder, start, machine: p.machine, hz, seed: p.seed, jitter }) })));
  const at60 = at(60);
  const at120 = at(120);
  const where = (r) => `${seen(r.g.rung)} ${r.g.stepRate}/s`;
  const evenText = (r) => `${r.name}: ${r.skipped} skipped, ${r.uneven}/${r.holds} uneven`;
  const isPoster = (r) => r.name.startsWith('Poster');
  const undone = (moves) => moves.filter((m, i) => i > 0 && i < moves.length - 1
    && (m.index < moves[i - 1].index || m.stepRate > moves[i - 1].stepRate) && moves[i + 1].at - m.at < 10).length;

  /*
    The instrument first, on the screen whose answer is known: at 60 Hz every
    machine is even after the opening (the 60 Hz lines in rungs.mjs count the
    same jumps with their own accumulator, and pass). An instrument that found
    jitter here would be measuring itself.
  */
  check('46e: at 60 Hz, through the real draw gate and step clock, every machine holds each image one step and skips none after the opening',
    at60.every((r) => r.skipped === 0 && r.uneven === 0 && r.holds > 0), at60.map(evenText).join('; '));

  /*
    The controls at 120 Hz: the plates that are even there today stay even,
    and land where they land at 60 Hz, the same rung and the same step rate,
    with no climb undone. Classic is the one that matters: its step frames
    take two refreshes, every frame steps, and the plate is even at sixty
    steps; a governor that counts a two-refresh frame as a miss gives sixty
    up, and one that wants 120 drawn frames gives up the grid next.
  */
  const calm120 = at120.filter((r) => !isPoster(r));
  check('46e: at 120 Hz the light, Classic and feather plates stay even, with no step skipped after the opening',
    calm120.every((r) => r.skipped === 0 && r.uneven === 0 && r.holds > 0), calm120.map(evenText).join('; '));
  /*
    Judged move by move, not at the end: the check-skeptic's 120 Hz-only spike
    on top of the sketch fix took feather's sixty away at 31.6 s and gave it
    back at 122 s, ninety seconds at half rate that an end-state comparison
    never saw. A calm machine makes the same moves at 120 Hz as at 60 Hz, to
    the same rung and step rate within a second; Poster, whose step rate is
    the thing at issue, never goes below the lowest rung it reaches at 60 Hz.
    These are relative to a 60 Hz run of the same build; a governor that
    spends the picture on both screens is the absolute 60 Hz lines' to catch
    in rungs.mjs ("a plate over the climb budget with every frame on time
    keeps sixty", which caught every line halved).
  */
  const movesText = (r) => r.moves.map((m) => `${m.at.toFixed(1)}s ${seen(ladder[m.index])} ${m.stepRate}/s`).join(' → ') || 'no moves';
  const sameMoves = (a, b) => a.length === b.length
    && a.every((m, i) => m.index === b[i].index && m.stepRate === b[i].stepRate && Math.abs(m.at - b[i].at) <= 1);
  const lowest = (r) => Math.max(r.g.rungIndex, ...r.moves.map((m) => m.index));
  check('46e: and at 120 Hz each calm plate makes the moves it makes at 60 Hz, and Poster never drops below its 60 Hz picture, with no climb undone within 10 s',
    at120.every((r, i) => undone(r.moves) === 0
      && (isPoster(r) ? lowest(r) <= lowest(at60[i]) : sameMoves(r.moves, at60[i].moves))),
    at120.map((r, i) => `${r.name}: ${movesText(r)} (60 Hz ${movesText(at60[i])})`).join('; '));

  /*
    The replay retypes the visualizer's catch-up cap (the GPU path's, where
    the frame interval caps it); if the loop's cap changes, this replay is no
    longer the loop, so the cap is read from the source and the replay must
    be brought along with it.
  */
  const viz = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
  check('46e: the replay\'s catch-up cap is still the visualizer\'s (frame interval past 40 ms one step, past 24 two)',
    /frameMsNow > 40 \? 1 : frameMsNow > 24 \? 2 : SIM_MAX_CATCHUP/.test(viz),
    'src/components/LiquidVisualizer.tsx: `const behind = … frameMsNow > 40 ? 1 : frameMsNow > 24 ? 2 : SIM_MAX_CATCHUP`');

  /*
    The owed lines: Poster at 120 Hz does what it does at 60 Hz. Main's state
    is its miss line in 60 Hz milliseconds, read from the source: while that
    line is there these two are owed; the day it changes they pass or are red.
  */
  const src = readFileSync('src/lib/governor.ts', 'utf8');
  const mainState = src.includes('const MISSED_MS = 25;')
    && src.includes('this.missShare += ((frameMs > MISSED_MS ? 1 : 0) - this.missShare) * MISS_K;');
  const p120 = at120.filter(isPoster);
  line('120hz', '46e: Poster at 120 Hz skips no step after the opening and holds every image one step (at most 1 % uneven), at any share of missed refreshes',
    p120.every((r) => r.skipped === 0 && r.uneven <= 0.01 * r.holds && r.holds > 0), p120.map(evenText).join('; '), mainState);
  line('120hz', '46e: and gives sixty up within 6 s of opening, as it does at 60 Hz',
    p120.every((r) => r.moves.length > 0 && r.moves[0].at <= 6 && r.moves[0].stepRate === 30),
    p120.map((r) => `${r.name}: ${r.moves.length ? `${r.moves[0].at.toFixed(1)} s → ${r.moves[0].stepRate}/s` : 'never'}`).join('; '), mainState);
}
