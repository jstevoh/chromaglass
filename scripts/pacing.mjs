#!/usr/bin/env node
/**
 * Pacing: does a paced sequence ask the plate for the shape real shows have,
 * and does Pacing 0 leave today's show exactly as it was?
 *
 *   npm run pacing
 *
 * PLAN §10, step 1. `src/lib/scenePacing.ts` plans each stage of a running
 * sequence as a scene (swells opened by a pour, a press or the next dyes; rests
 * between; the light going to near-black at the end) and the sequencer plays
 * the plan through `stepScene` every quarter second. This drives that same
 * code through whole sets in node, tick by tick, with the stages' Pacing
 * gliding in as the hook glides it, and asserts:
 *
 *   - at Pacing 0 nothing is planned, nothing fires, and every tick hands the
 *     plate 1 and 1, on every built-in sequence: the default keeps today's show;
 *   - "Light Show Night", measured with the same yardstick the filmed shows
 *     were (`shape()` from scripts/watch.mjs), swells 1.5 to 3.5 times a minute
 *     and is calm 20 to 40 % of the time, over several nights' seeds;
 *   - every dark ending reaches near-black, the light never steps (planned or
 *     followed), and a sequence stopped in the dark comes back up over more
 *     than a second rather than in one frame;
 *   - a scene out of the dark opens with a pour, no moment repeats back to back,
 *     a drain fires only in the dark and only where a stage asked, and a stage
 *     that waits for the song's section never plans a dark ending;
 *   - a locate forward drops what it skipped rather than firing it all at once,
 *     and a locate back re-arms what is ahead;
 *   - the same seed plans the same night, and another seed a different one;
 *   - the pieces are connected: the hook plays the plan, the app hands its
 *     moments to the plate, and the plate multiplies its light and its clock by
 *     what it is handed.
 *
 * What this cannot say is how the plate looks doing it. The "motion" measured
 * here is what the sequencer *asks* for (the plate's clock lean times its
 * light), not frames of the plate, which a cloud session cannot read. `film.yml`
 * on the Mac, filming "Light Show Night" and measuring it with the same
 * `shape()`, is what judges whether the plate delivers it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  planScene, sampleScene, stepScene, cursorAt, approachPace, endsDark,
  PACE_NEUTRAL, STALE_MOMENT, DIM_RATE,
} from '../src/lib/scenePacing.ts';
import { builtInSequences } from '../src/lib/sequencer.ts';
import { makeRng } from '../src/lib/rng.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { RIG_KEYS, lookOf } from '../src/lib/lookFade.ts';
import { PRESETS } from '../src/presets.ts';
import { shape } from './watch.mjs';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const f2 = x => (Number.isFinite(x) ? x.toFixed(2) : String(x));

const TICK = 0.25;          // the sequencer's tick (TICK_MS in useShowSequencer)
const FRAME = 1 / 60;       // the plate's frame, where approachPace runs

/**
 * Play a sequence the way `useShowSequencer` does, for `seconds`, with the
 * Pacing dial at `dial`. Returns one row per tick: what was sent, what the
 * plate had followed to, the moments fired, and which stage and how far in.
 *
 * What it copies from the hook, so a change there should change it here:
 * the plan is made on entry at the stage's target Pacing (its own setting, or
 * the dial), comes up from the dark when the last thing sent was under half
 * light, a section or hold stage is planned 600 s long with no dark ending,
 * the stage's Pacing glides in over its transition, and a time stage advances
 * when its seconds are up.
 */
function play(seq, { seconds, dial = 0, seed = 1 }) {
  const rand = makeRng(seed, 'show.pacing').float;
  const rows = [];
  let sent = { ...PACE_NEUTRAL }, plate = { ...PACE_NEUTRAL };
  let livePacing = dial;
  let index = 0, entered = 0, plan = null, cursor = null, from = dial, to = dial, transition = 0;
  const enter = (i, t) => {
    const st = seq.stages[i];
    index = i; entered = t;
    from = livePacing;
    to = typeof st.settings?.pacing === 'number' ? st.settings.pacing : livePacing;
    transition = Math.max(0, st.transition);
    const fromDark = t > 0 && sent.dim < 0.5;
    if (to <= 0.001) { plan = null; cursor = null; return; }
    const timed = st.advance === 'time';
    plan = planScene(timed ? st.seconds : Math.max(st.seconds, 600), to, rand,
      { fromDark, pace: timed ? st.pace : { ...st.pace, endDark: false } });
    cursor = { nextSwell: 0, drained: false, lastElapsed: 0 };
  };
  enter(0, 0);
  for (let t = 0; t < seconds; t += TICK) {
    const st = seq.stages[index];
    const elapsed = t - entered;
    livePacing = transition > 0 ? from + (to - from) * Math.min(1, elapsed / transition) : to;
    let moments = [];
    if (plan) {
      const r = stepScene(plan, cursor, elapsed, livePacing);
      sent = r.sample; moments = r.moments;
    } else sent = { ...PACE_NEUTRAL };
    rows.push({ t, stage: index, elapsed, sent: { ...sent }, plate: { ...plate }, moments, plan });
    // The plate's frames until the next tick.
    for (let k = 0; k < Math.round(TICK / FRAME); k++) plate = approachPace(plate, sent, FRAME);
    if (st.advance === 'time' && elapsed + TICK >= st.seconds) enter((index + 1) % seq.stages.length, t + TICK);
  }
  return rows;
}

const seqs = builtInSequences();
const night = seqs.find(q => q.id === 'light-show-night');

// ─── Pacing 0 is today's show ───────────────────────────────────────────────
console.log('\nPacing 0');
check('the default is 0', DEFAULT_SETTINGS.pacing === 0, `DEFAULT_SETTINGS.pacing = ${DEFAULT_SETTINGS.pacing}`);
check('it belongs to the room: a look change keeps it', RIG_KEYS.has('pacing') && !('pacing' in lookOf(PRESETS[0].settings)));
{
  const setsIt = PRESETS.filter(p => 'pacing' in (p.settings ?? {})).map(p => p.id);
  check('no look turns it on', setsIt.length === 0, setsIt.length ? setsIt.join(', ') : `${PRESETS.length} looks read`);
  const empty = planScene(30, 0, () => { throw new Error('drew dice at Pacing 0'); });
  check('nothing is planned, and no dice are drawn', empty.swells.length === 0 && empty.fadeIn === 0 && empty.fadeOut === 0 && empty.drainAt === null);
  let off = 0, fired = 0, ticks = 0;
  for (const q of seqs.filter(q => q.id !== 'light-show-night')) {
    for (const r of play(q, { seconds: 900, dial: 0 })) {
      ticks++;
      if (r.sent.activity !== 1 || r.sent.dim !== 1 || r.plate.activity !== 1 || r.plate.dim !== 1) off++;
      fired += r.moments.length;
    }
  }
  check('every other built-in sequence hands the plate exactly 1 and 1, and fires nothing', off === 0 && fired === 0,
    `${ticks} ticks over ${seqs.length - 1} sequences: ${off} off neutral, ${fired} moments`);
  // Bitwise, not near: a plan at 0 must not even round.
  const s0 = sampleScene(planScene(30, 0.8, makeRng(3, 'show.pacing').float), 12.3, 0);
  check('a plan played at Pacing 0 is exactly neutral', s0.activity === 1 && s0.dim === 1, `${s0.activity}, ${s0.dim}`);
}

// ─── The shape, measured as the shows were ──────────────────────────────────
console.log('\nLight Show Night, measured with shape()');
check('the sequence exists and is paced', !!night && night.stages.every(st => (st.settings?.pacing ?? 0) > 0));
const SEEDS = [1, 2, 3, 4, 5, 6];
const SET = 20 * 60;
const perNight = [];
for (const seed of SEEDS) {
  const rows = play(night, { seconds: SET, dial: 0, seed });
  /*
    The motion proxy: the plate's clock (the activity, as the frame follows
    it: the visualizer multiplies its clock by it after the phrase's lean)
    times the light it is drawn in. A frame-difference measure of a plate
    moving at half pace in eighty per cent light reads about 0.4 of one at full
    pace and light; that is the assumption, and the only one. Pours are not
    added as extra motion, so a swell here is the clock and the light alone,
    and the moments are counted separately. The first version put the activity
    through the lean as well, and this measured no swells at all: the clock
    reached about half of each one.
  */
  const shaped = shape({
    rows: rows.map(r => ({
      t: r.t, motion: 2 * r.plate.activity * r.plate.dim, dark: 1 - r.plate.dim,
      colour: 0, coloured: 0, hue12: new Array(12).fill(0), hv: new Array(39).fill(0),
    })),
    rate: 1 / TICK, span: SET,
  });
  const dimLow = rows.filter(r => r.plate.dim < 0.25).length / rows.length;
  const pours = rows.reduce((n, r) => n + r.moments.filter(k => k !== 'drain').length, 0) / (SET / 60);
  perNight.push({ seed, rows, sh: shaped, dimLow, pours });
  console.log(`   seed ${seed}: swells ${f2(shaped.swells.perMin)}/min (rise ${f2(shaped.swells.rise)} s, decay ${f2(shaped.swells.decay)} s, `
    + `peak ${f2(shaped.swells.peakOverMedian)}× median), calm ${(shaped.calm * 100).toFixed(0)} %, `
    + `light down ${(dimLow * 100).toFixed(0)} %, moments ${f2(pours)}/min`);
}
{
  const bad = perNight.filter(n => !(n.sh.swells.perMin >= 1.5 && n.sh.swells.perMin <= 3.5));
  check('swells 1.5 to 3.5 a minute, every night', bad.length === 0, bad.map(n => `seed ${n.seed}: ${f2(n.sh.swells.perMin)}`).join('; ') || `${SEEDS.length} nights`);
  const calm = perNight.filter(n => !(n.sh.calm >= 0.2 && n.sh.calm <= 0.4));
  check('calm 20 to 40 % of the time, every night', calm.length === 0, calm.map(n => `seed ${n.seed}: ${(n.sh.calm * 100).toFixed(0)} %`).join('; ') || `${SEEDS.length} nights`);
  // The footage's swells stood about 2.5 times the median; far over that is a
  // plate that only ever rests or lurches, far under it is no swell at all.
  const tall = perNight.filter(n => !(n.sh.swells.peakOverMedian >= 1.8 && n.sh.swells.peakOverMedian <= 4));
  check('a swell stands 1.8 to 4 times the median, as the footage\'s 2.5 did', tall.length === 0, perNight.map(n => f2(n.sh.swells.peakOverMedian)).join(', '));
  const slow = perNight.filter(n => !(n.sh.swells.rise >= 1 && n.sh.swells.decay >= 2 && n.sh.swells.decay <= 9));
  check('swells rise over a second or more and fall away over 2 to 9', slow.length === 0,
    slow.map(n => `seed ${n.seed}: rise ${f2(n.sh.swells.rise)}, decay ${f2(n.sh.swells.decay)}`).join('; ') || 'medians in range');
  // What a scene adds to the dark: the fades. A look's own black surround is
  // the rest of the measured 30–60 %, so this is a share, not the whole.
  const dark = perNight.filter(n => !(n.dimLow >= 0.08 && n.dimLow <= 0.3));
  check('the light is down (under a quarter) 8 to 30 % of the set', dark.length === 0,
    dark.map(n => `seed ${n.seed}: ${(n.dimLow * 100).toFixed(0)} %`).join('; ') || perNight.map(n => `${(n.dimLow * 100).toFixed(0)} %`).join(', '));
  const moments = perNight.filter(n => !(n.pours >= 1.5 && n.pours <= 4));
  check('the moments arrive at about the swell rate', moments.length === 0, perNight.map(n => f2(n.pours)).join(', ') + ' a minute');
}

// ─── Darkness without cuts ──────────────────────────────────────────────────
console.log('\nDarkness');
{
  const rows = perNight[0].rows;
  // Every stage end: the lowest the light got in its last two seconds.
  const ends = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].stage !== rows[i - 1].stage) {
      const last = rows.slice(Math.max(0, i - 8), i);
      ends.push(Math.min(...last.map(r => r.plate.dim)));
    }
  }
  const lit = ends.filter(d => d > 0.1);
  check('every dark ending reaches near-black', ends.length > 20 && lit.length === 0, `${ends.length} stage ends, lowest light max ${f2(Math.max(...ends))}`);
  let planned = 0, followed = 0;
  for (const n of perNight) for (let i = 1; i < n.rows.length; i++) {
    planned = Math.max(planned, Math.abs(n.rows[i].sent.dim - n.rows[i - 1].sent.dim));
    followed = Math.max(followed, Math.abs(n.rows[i].plate.dim - n.rows[i - 1].plate.dim));
  }
  // A smoothstep over the shortest fade (2.5 s in) moves at most 1.5/2.5 of
  // the range a second; per tick that is 0.14. Across a stage change the
  // sample goes from the old stage's black to the new one's, which is black too.
  check('the planned light never steps', planned <= 0.16, `largest change in a quarter second ${f2(planned)}`);
  check('the light the plate draws never steps', followed <= DIM_RATE * TICK + 1e-9, `largest ${f2(followed)} against a limit of ${f2(DIM_RATE * TICK)}`);
  // Stopped in the dark: the sequencer sends 1, 1 at once. How long to full?
  let p = { activity: 0.4, dim: 0.04 }, t = 0;
  while (p.dim < 0.99 && t < 10) { p = approachPace(p, PACE_NEUTRAL, FRAME); t += FRAME; }
  check('stopped in the dark, the light comes back over more than a second', t >= 1.2 && t <= 2.5, `${f2(t)} s from black to full`);
}

// ─── The plan's own rules ───────────────────────────────────────────────────
console.log('\nScenes');
{
  let plans = 0, notPour = 0, twice = 0, drainsLit = 0, drainsUnasked = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = makeRng(seed, 'show.pacing').float;
    for (const p of [0.2, 0.5, 0.7, 1]) {
      const T = 15 + (seed % 7) * 5;
      const dark = planScene(T, p, r, { fromDark: true });
      plans++;
      if (dark.swells.length && (dark.swells[0].kind !== 'pour' || dark.swells[0].at > 0.5)) notPour++;
      for (const pl of [dark, planScene(T, p, r)]) {
        for (let i = 1; i < pl.swells.length; i++) if (pl.swells[i].kind === pl.swells[i - 1].kind) twice++;
        if (pl.drainAt !== null) drainsUnasked++;
      }
      const asked = planScene(T, p, r, { pace: { moments: ['pour', 'drain'] } });
      if (asked.drainAt !== null && !endsDark(asked)) drainsLit++;
      if (asked.swells.some(s => s.kind === 'drain')) drainsLit++;
    }
  }
  check('out of the dark, a scene opens with a pour as the light comes up', notPour === 0, `${notPour} of ${plans} did not`);
  check('no moment twice running', twice === 0, `${twice} repeats`);
  check('a drain only where a stage asked, and only into the dark', drainsUnasked === 0 && drainsLit === 0, `${drainsUnasked} unasked, ${drainsLit} in the light`);
  const verse = seqs.find(q => q.id === 'verse-chorus');
  const rows = play(verse, { seconds: 300, dial: 0.9 });
  check('a stage waiting for the song never plans a dark ending', rows.every(r => !r.plan || r.plan.fadeOut === 0) && rows.every(r => r.sent.dim > 0.5),
    `lowest light ${f2(Math.min(...rows.map(r => r.sent.dim)))} over five minutes at Pacing 0.9`);
  const lit = planScene(30, 0.9, makeRng(9, 'show.pacing').float, { pace: { endDark: false } });
  check('a stage can ask to stay lit', lit.fadeOut === 0);
}

// ─── Jumps ──────────────────────────────────────────────────────────────────
console.log('\nLocating');
{
  const plan = planScene(120, 1, makeRng(4, 'show.pacing').float);
  const cur = cursorAt(plan, 0);
  stepScene(plan, cur, 0.25, 1);
  const jump = stepScene(plan, cur, 100, 1);
  const skipped = plan.swells.filter(s => s.at > 0.25 && s.at < 100 - STALE_MOMENT).length;
  check('a locate forward drops what it skipped', skipped >= 3 && jump.moments.length <= 1, `${skipped} swells skipped, ${jump.moments.length} fired on landing`);
  const back = stepScene(plan, cur, 0.25, 1);
  let refired = back.moments.length;
  for (let t = 0.5; t <= 100; t += TICK) refired += stepScene(plan, cur, t, 1).moments.length;
  const due = plan.swells.filter(s => s.at > 0.25 && s.at <= 100).length;
  check('a locate back re-arms what is ahead', refired === due, `${refired} fired of ${due} ahead`);
  // Pacing pulled to 0 mid-stage and brought back: what came due meanwhile is stale.
  const c2 = cursorAt(plan, 0);
  for (let t = 0; t <= 30; t += TICK) stepScene(plan, c2, t, 0);
  const again = stepScene(plan, c2, 30.25, 1);
  check('Pacing brought back up does not fire what came due at 0', again.moments.length <= 1, `${again.moments.length} fired`);
}

// ─── Seeds ──────────────────────────────────────────────────────────────────
console.log('\nSeeds');
{
  const key = p => JSON.stringify(p.swells.map(s => [s.at.toFixed(4), s.kind, s.attack.toFixed(4), s.decay.toFixed(4)]));
  const a = planScene(25, 0.7, makeRng(7, 'show.pacing').float, { fromDark: true });
  const b = planScene(25, 0.7, makeRng(7, 'show.pacing').float, { fromDark: true });
  const c = planScene(25, 0.7, makeRng(8, 'show.pacing').float, { fromDark: true });
  check('the same seed plans the same scene', key(a) === key(b), `${a.swells.length} swells`);
  check('another seed plans a different one', key(a) !== key(c));
  const n1 = play(night, { seconds: 300, seed: 5 }).flatMap(r => r.moments).join(',');
  const n2 = play(night, { seconds: 300, seed: 5 }).flatMap(r => r.moments).join(',');
  check('the same seed plays the same night', n1 === n2 && n1.length > 0, `${n1.split(',').length} moments in five minutes`);
}

// ─── Connected ──────────────────────────────────────────────────────────────
/*
  Greps, and weak ones: they cannot say the wiring works, only that someone
  did not take it out. Each names a line whose absence would make every check
  above pass while the show did nothing at all.
*/
console.log('\nWiring');
{
  const src = f => readFileSync(join(process.cwd(), f), 'utf8');
  const hook = src('src/hooks/useShowSequencer.ts');
  const app = src('src/App.tsx');
  const vis = src('src/components/LiquidVisualizer.tsx');
  check('the sequencer plays the plan', /stepScene\(run\.plan, run\.cursor, elapsed, pacing\)/.test(hook) && /a\.moment\?\.\(k\)/.test(hook) && /sendPace\(sample\)/.test(hook));
  check('the app hands moments and pace to the plate', /pace: \(sample\) => visualizerRef\.current\?\.pace\(sample\)/.test(app)
    && /case 'pour': v\?\.pour\(\)/.test(app) && /case 'drain': runActionRef\.current\?\.\('drain'\)/.test(app));
  check('the plate draws in the paced light', /dimmerGain: flashGainRef\.current \* paceNowRef\.current\.dim/.test(vis));
  check('the plate runs its clock and its automation at the paced activity', /f\.paceMul = paceNowRef\.current\.activity/.test(vis)
    && /dynamicSpeed \*= Number\.isFinite\(this\.paceMul\) \? this\.paceMul : 1/.test(vis) && /ph\.drive \* paceNowRef\.current\.activity/.test(vis));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
