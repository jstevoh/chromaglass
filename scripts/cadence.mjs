/**
 * Whether the plate takes its steps evenly, frame to frame (PLAN.md 14aa).
 *
 *   npm run cadence
 *
 * The owner reported the show "a little jittery sometimes". The loop turns
 * time into solver steps with an accumulator, and it read the time from
 * `Date.now()` part way into the frame: whole milliseconds, after a varying
 * amount of work. `src/lib/stepClock.ts` says at length why that stutters in
 * bursts on a display whose refresh matches the step: the remainder walks to
 * a step's edge and the scatter carries it back and forth, a frame with no
 * step and then one with two. This models both loops on the same displays and
 * counts the frames where the liquid stops or doubles.
 *
 * A display here is its refresh, a timestamp a few microseconds either side of
 * each refresh (what a browser hands the frame), and the frame's work before
 * the loop read its clock (a few milliseconds, scattered; a long frame now and
 * then). The old loop reads `floor(refresh time + work)` in milliseconds; the
 * new one is given the refresh's own stamp, as the visualizer now gives it
 * (`drawGate.lastDraw`). Seeded, so a run is the same run every time.
 *
 * "Uneven" is the feature, said without reference to either loop: on a display
 * whose refresh is a whole ratio of the step, every on-time run of refreshes
 * one step long (one at 60 Hz, two at 120 Hz with sixty steps) holds exactly
 * one step, and at thirty-per-refresh multiples each refresh exactly its
 * share. A refresh the page missed is not counted against either loop, since
 * nothing can draw a refresh that was not drawn.
 *
 * Bars:
 *   - the model shows the fault: the old loop is uneven on more than 1 % of
 *     the 60 Hz display's frames (it is the control; a model that could not
 *     make the old loop stutter could not say the new one does not);
 *   - the new clock: no uneven frame on any whole-ratio display, dropped
 *     frames and all;
 *   - and it keeps time: steps a second within 0.5 % of the step rate times the
 *     display's error from its nominal rate, on every display including the
 *     ones it cannot lock (144 Hz, 90 Hz), and a dropped refresh's steps are
 *     caught up (within 0.5 % over the run).
 */
import { StepClock } from '../src/lib/stepClock';

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
  const end = seconds * hz;
  while (k < end) {
    // Now and then a frame runs long and the next refresh is missed.
    const missed = r() < drop ? 1 + Math.floor(r() * 2) : 0;
    k += 1 + missed;
    const stamp = k * P + normal(r) * 0.004;    // the refresh's own timestamp, microseconds of scatter
    const work = Math.min(12, Math.max(0.3, 3.5 + normal(r) * 1.5));
    frames.push({ stamp, date: Math.floor(epoch + k * P + work), beats: 1 + missed });
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
 * Uneven frames, by the definition above: for `per` refreshes a step, each
 * run of `per` consecutive on-time frames holds one step; for `each` steps a
 * refresh, each on-time frame holds `each`. Only runs with no missed refresh
 * in them, and only after the first two seconds (the new clock's warm-up is
 * a dozen frames; the old loop has none, which only flatters it).
 */
function uneven(frames, steps, hz, rate) {
  const per = hz / rate;
  const skip = Math.round(2 * hz);
  let bad = 0, judged = 0;
  if (per >= 1) {
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
const displays = [
  { name: '60 Hz, sixty steps', hz: 60, rate: 60, whole: true },
  { name: '59.94 Hz, sixty steps', hz: 59.94, rate: 60, whole: true },
  { name: '120 Hz (ProMotion), sixty steps', hz: 120, rate: 60, whole: true },
  { name: '60 Hz, thirty steps (the governor halved them)', hz: 60, rate: 30, whole: true },
  { name: '120 Hz, thirty steps', hz: 120, rate: 30, whole: true },
  { name: '30 Hz (a slow wall), sixty steps', hz: 30, rate: 60, whole: true },
  { name: '144 Hz, sixty steps', hz: 144, rate: 60, whole: false },
  { name: '90 Hz, sixty steps', hz: 90, rate: 60, whole: false },
];

let oldAt60 = null;
for (const [i, d] of displays.entries()) {
  const frames = display({ hz: d.hz, seed: 7 + i });
  const stepS = 1 / d.rate;
  const before = oldLoop(frames, stepS);
  const { out: after, clock } = newLoop(frames, stepS);
  const seconds = (frames[frames.length - 1].stamp - frames[0].stamp) / 1000;
  // What a perfect clock takes: the display's refreshes times the whole ratio
  // when locked (which follows a 59.94 Hz panel), the wall clock otherwise.
  const nominal = d.whole ? Math.round(d.hz) : d.hz;
  const ideal = d.whole ? (frames.reduce((s, f, k) => (k ? s + f.beats : s), 0)) * (d.rate / nominal) : seconds * d.rate;
  const total = after.reduce((s, n) => s + n, 0);
  const ub = uneven(frames, before, d.hz, d.rate), ua = uneven(frames, after, d.hz, d.rate);
  console.log(`  ${d.name}: before ${pct(ub.share)} uneven (${ub.bad} of ${ub.judged}), after ${pct(ua.share)} (${ua.bad}); `
    + `${(total / seconds).toFixed(2)} steps a second, ${clock.locked} frames locked, ${clock.free} free`);
  if (d.hz === 60 && d.rate === 60) oldAt60 = ub;
  if (d.whole) check(`${d.name}: no uneven frame`, ua.bad === 0, `${ua.bad} of ${ua.judged}`);
  check(`${d.name}: keeps time, missed refreshes caught up`, Math.abs(total - ideal) <= 0.005 * ideal, `${total} steps, ${ideal.toFixed(0)} owed`);
}
check('control: the old loop stutters on a 60 Hz display (> 1 % uneven)', oldAt60 && oldAt60.share > 0.01, oldAt60 ? pct(oldAt60.share) : 'not run');

// A change of step rate mid-show (the governor halving, then restoring) takes no frame of two steps.
{
  const frames = display({ hz: 60, seconds: 20, drop: 0, seed: 99 });
  const clock = new StepClock();
  let doubled = 0;
  for (let i = 1; i < frames.length; i++) {
    const rate = i < 400 ? 60 : i < 800 ? 30 : 60;
    const n = clock.steps((frames[i].stamp - frames[i - 1].stamp) / 1000, 1 / rate, 4);
    if (n > 1) doubled++;
  }
  check('the governor changing the step rate costs no doubled frame', doubled === 0, `${doubled} frames of two steps`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
