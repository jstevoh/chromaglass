/**
 * Whether the plate takes its steps evenly, frame to frame, and keeps time
 * (PLAN.md 14aa).
 *
 *   npm run cadence
 *
 * The owner reported the show "a little jittery sometimes". The loop turns
 * time into solver steps with an accumulator, and it read the time from
 * `Date.now()` part way into the frame: whole milliseconds, after a varying
 * amount of work. `src/lib/stepClock.ts` says at length why that stutters on
 * a display whose refresh matches the step: where the remainder sits near a
 * step's edge, the scatter carries it back and forth, a frame with no step
 * and then one with two. This models both loops on the same displays and
 * counts the frames where the liquid stops or doubles.
 *
 * A display here is its refresh, the timestamp a browser hands the frame (a
 * few microseconds either side of the refresh, rounded to the 0.1 ms Chrome
 * coarsens its clocks to), and the frame's work before the old loop read its
 * clock (3.5 ± 1.5 ms, with a long frame now and then that misses a refresh).
 * The old loop reads `floor(refresh time + work)` in milliseconds; the new
 * one is given the refresh's stamp, as the visualizer now gives it
 * (`drawGate.lastDraw`). Seeded, so a run is the same run every time. Where
 * the old loop's remainder sits is a matter of the seed (at exactly 60 Hz it
 * is fixed by where the clock's milliseconds fall: the check-skeptic found 1.4
 * to 48 % over sixty seeds), so its numbers are the median of nine.
 *
 * "Uneven" is the feature, said without reference to either loop: on a display
 * whose refresh is a whole ratio of the step, every on-time run of refreshes
 * one step long (one at 60 Hz, two at 120 Hz with sixty steps) holds exactly
 * one step, and at a multiple each refresh exactly its share. A refresh the
 * page missed is not counted against either loop: nothing can draw a refresh
 * that was not drawn.
 *
 * With the wall up the frames are a mix of two clocks, the laptop's and the
 * projector's, let through one a refresh by the real `DrawGate`
 * (`src/lib/drawGate.ts`); those are drawn here through that gate, at 60 Hz
 * beside a 50, 48, 60, 75 and 120 Hz wall. The first version of the clock
 * reset its time whenever an interval fitted no refresh, and beside a 50 Hz
 * wall the plate ran at 50 steps a second; the check-skeptic found it, and the
 * keeps-time bar on those lines is the reason they are here.
 *
 * Bars:
 *   - the model shows the fault: the old loop's median is uneven on more
 *     than 1 % of the 60 Hz display's runs (the control; a model that could
 *     not make the old loop stutter could not say the new one does not);
 *   - the new clock: no uneven run on any whole-ratio display, missed
 *     refreshes and all;
 *   - it keeps time against the wall clock: steps a second within 0.5 % of the
 *     step rate on every display and every pair of clocks (a 59.94 Hz panel
 *     runs 0.1 % slow by design), missed refreshes caught up;
 *   - a display that is not a whole ratio is never snapped to one;
 *   - the governor changing the step rate, at either parity of the refresh,
 *     costs no frame of two steps.
 */
import { StepClock } from '../src/lib/stepClock';
import { DrawGate } from '../src/lib/drawGate';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// A small seeded generator (mulberry32) and a normal from it.
const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const normal = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
/** A browser's timestamp: the time, a few microseconds of scatter, rounded to 0.1 ms. */
const stampOf = (t, r) => Math.round((t + normal(r) * 0.004) * 10) / 10;

/**
 * One display for `seconds`: the frames it drew, each with its refresh's stamp
 * (ms), the Date.now() the old loop would have read, and how many refreshes
 * since the frame before (more than one: refreshes the page missed).
 */
function display({ hz, seconds = 120, drop = 0.004, seed = 1 }) {
  const r = rng(seed);
  const P = 1000 / hz;
  const epoch = 1.7e12 + r() * 1000;           // a Date.now() origin with its own fraction of a millisecond
  const frames = [];
  let k = 0;
  const end = Math.floor(seconds * hz);
  while (k < end) {
    const missed = r() < drop ? 1 + Math.floor(r() * 2) : 0;
    k += 1 + missed;
    const work = Math.min(12, Math.max(0.3, 3.5 + normal(r) * 1.5));
    frames.push({ stamp: stampOf(k * P, r), date: Math.floor(epoch + k * P + work), beats: 1 + missed });
  }
  return frames;
}

/** The loop before: Date.now() in seconds, the accumulator, the cap of four. */
function oldLoop(frames, stepS) {
  let acc = 0;
  const out = [];
  for (let i = 1; i < frames.length; i++) {
    const dt = (frames[i].date - frames[i - 1].date) / 1000;
    acc = Math.min(acc + dt, stepS * 4);
    const n = Math.floor(acc / stepS);
    acc -= n * stepS;
    out.push(n);
  }
  return out;
}

/** The loop now: the refresh's stamp, the step clock. */
function newLoop(frames, stepS) {
  const clock = new StepClock();
  const out = [];
  for (let i = 1; i < frames.length; i++) out.push(clock.steps((frames[i].stamp - frames[i - 1].stamp) / 1000, stepS, 4));
  return { out, clock };
}

/**
 * Uneven runs, by the definition above, after the first two seconds (the new
 * clock's warm-up is a dozen frames; the old loop has none, which only
 * flatters it).
 */
function uneven(frames, steps, hz, rate) {
  const per = hz / rate;
  const skip = Math.round(2 * hz);
  let bad = 0, judged = 0;
  if (per >= 0.99) {
    const n = Math.round(per);
    for (let i = skip; i + n <= steps.length; i++) {
      let ok = true, sum = 0;
      for (let j = i; j < i + n; j++) { if (frames[j + 1].beats !== 1) ok = false; sum += steps[j]; }
      if (!ok) continue;
      judged++;
      if (sum !== 1) bad++;
    }
  } else {
    const each = Math.round(1 / per);
    for (let i = skip; i < steps.length; i++) {
      if (frames[i + 1].beats !== 1) continue;
      judged++;
      if (steps[i] !== each) bad++;
    }
  }
  return { bad, judged, share: bad / Math.max(1, judged) };
}

const pct = (v) => `${(100 * v).toFixed(2)} %`;
const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const displays = [
  { name: '60 Hz, sixty steps', hz: 60, rate: 60, whole: true },
  { name: '59.94 Hz, sixty steps', hz: 59.94, rate: 60, whole: true },
  { name: '120 Hz (ProMotion), sixty steps', hz: 120, rate: 60, whole: true },
  { name: '119.88 Hz, sixty steps', hz: 119.88, rate: 60, whole: true },
  { name: '60 Hz, thirty steps (the governor halved them)', hz: 60, rate: 30, whole: true },
  { name: '120 Hz, thirty steps', hz: 120, rate: 30, whole: true },
  { name: '30 Hz (a slow wall), sixty steps', hz: 30, rate: 60, whole: true },
  { name: '144 Hz, sixty steps', hz: 144, rate: 60, whole: false },
  { name: '90 Hz, sixty steps', hz: 90, rate: 60, whole: false },
  { name: '61 Hz, sixty steps', hz: 61, rate: 60, whole: false },
  { name: '58.8 Hz, sixty steps', hz: 58.8, rate: 60, whole: false },
];

let oldAt60 = null;
for (const [i, d] of displays.entries()) {
  const stepS = 1 / d.rate;
  const olds = [];
  for (let k = 0; k < 9; k++) {
    const f = display({ hz: d.hz, seconds: 30, seed: 100 * i + k + 1 });
    olds.push(uneven(f, oldLoop(f, stepS), d.hz, d.rate).share);
  }
  const frames = display({ hz: d.hz, seed: 7 + i });
  const { out: after, clock } = newLoop(frames, stepS);
  const seconds = (frames[frames.length - 1].stamp - frames[0].stamp) / 1000;
  const total = after.reduce((s, n) => s + n, 0);
  const owed = seconds * d.rate;
  const ua = uneven(frames, after, d.hz, d.rate);
  const before = median(olds);
  console.log(`  ${d.name}: before ${pct(before)} uneven (median of 9; ${pct(Math.min(...olds))} to ${pct(Math.max(...olds))}), `
    + `after ${pct(ua.share)} (${ua.bad} of ${ua.judged}); ${(total / seconds).toFixed(2)} steps a second, ${clock.locked} frames snapped, ${clock.free} kept`);
  if (d.hz === 60 && d.rate === 60) oldAt60 = before;
  if (d.whole) check(`${d.name}: no uneven run`, ua.bad === 0, `${ua.bad} of ${ua.judged}`);
  check(`${d.name}: keeps time, missed refreshes caught up`, Math.abs(total - owed) <= 0.005 * owed,
    `${total} steps in ${seconds.toFixed(1)} s, ${owed.toFixed(0)} by the wall clock`);
  if (!d.whole) check(`${d.name}: not snapped to a ratio it is not`, clock.locked === 0, `${clock.locked} frames snapped`);
}
check('control: the old loop stutters on a 60 Hz display (median > 1 % uneven)', oldAt60 !== null && oldAt60 > 0.01, oldAt60 === null ? 'not run' : pct(oldAt60));

// The laptop and the wall, two clocks through the real draw gate.
for (const [i, [show, wall]] of [[60, 50], [60, 48], [60, 60], [120, 60], [60, 75]].entries()) {
  const r = rng(500 + i);
  const seconds = 60;
  const events = [];
  const wallPhase = r() * (1000 / wall);
  for (let k = 1; k * (1000 / show) < seconds * 1000; k++) events.push({ source: 'frame', t: k * (1000 / show) });
  for (let k = 1; wallPhase + k * (1000 / wall) < seconds * 1000; k++) events.push({ source: 'ask', t: wallPhase + k * (1000 / wall) });
  for (const e of events) e.stamp = stampOf(e.t, r);
  events.sort((a, b) => a.t - b.t);
  const gate = new DrawGate();
  const clock = new StepClock();
  let last = null, total = 0, drawn = 0, first = null;
  for (const e of events) {
    if (!gate.offer(e.source, e.stamp)) continue;
    drawn++;
    if (last !== null) total += clock.steps((gate.lastDraw - last) / 1000, 1 / 60, 4);
    else first = gate.lastDraw;
    last = gate.lastDraw;
  }
  const span = (last - first) / 1000;
  const owed = span * 60;
  check(`a ${show} Hz show with a ${wall} Hz wall keeps time through the draw gate`, Math.abs(total - owed) <= 0.005 * owed,
    `${(total / span).toFixed(2)} steps a second over ${drawn} frames drawn (${clock.locked} snapped, ${clock.free} kept)`);
}

// A change of step rate mid-show (the governor halving, then restoring) takes no frame of two steps, at either parity.
{
  const frames = display({ hz: 60, seconds: 60, drop: 0, seed: 99 });
  const clock = new StepClock();
  const switches = [400, 801, 1200, 1601, 2000, 2401, 2800, 3201];
  let doubled = 0, rate = 60;
  for (let i = 1; i < frames.length; i++) {
    if (switches.includes(i)) rate = rate === 60 ? 30 : 60;
    const n = clock.steps((frames[i].stamp - frames[i - 1].stamp) / 1000, 1 / rate, 4);
    if (n > 1) doubled++;
  }
  check('the governor changing the step rate costs no doubled frame, at either parity', doubled === 0, `${doubled} frames of two steps over ${switches.length} changes`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
