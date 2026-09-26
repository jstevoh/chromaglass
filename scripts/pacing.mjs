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
  planScene, sampleScene, stepScene, cursorAt, approachPace, endsDark, ScenePlayer,
  PACE_NEUTRAL, STALE_MOMENT, DIM_RATE, FROM_DARK_BELOW, OPEN_SCENE_SECONDS,
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
const pc = x => `${(x * 100).toFixed(0)} %`;

const TICK = 0.25;          // the sequencer's tick (TICK_MS in useShowSequencer)
const FRAME = 1 / 60;       // the plate's frame, where approachPace runs
const DRAIN_SECONDS = 50 / 60;   // the drain's run (LiquidVisualizer, drainFrameRef: 50 frames)

/**
 * Play a sequence the way `useShowSequencer` does, for `seconds`, with the
 * Pacing dial at `dial`. One row per tick: what was sent, what the plate had
 * followed to by the next tick, the moments fired, the stage and how far in.
 *
 * The scene itself is the hook's own code: a `ScenePlayer` per stage, entered
 * at the stage's target Pacing and coming up from the dark on the hook's own
 * `FROM_DARK_BELOW`. The first version restated that here and the review
 * found three changes to the hook that left this green. What is still
 * restated, because it is React: the stage's Pacing gliding in over its
 * transition, and a time stage advancing when its seconds are up. Section and
 * hold stages never advance here, and pause, Design and the show's own pause
 * are not played; the wiring greps at the end are all that holds those.
 */
function play(seq, { seconds, dial = 0, seed = 1 }) {
  const rand = makeRng(seed, 'show.pacing').float;
  const rows = [];
  let sent = { ...PACE_NEUTRAL }, plate = { ...PACE_NEUTRAL };
  let livePacing = dial;
  let index = 0, entered = 0, scene = null, from = dial, to = dial, transition = 0;
  const enter = (i, t) => {
    const st = seq.stages[i];
    index = i; entered = t;
    from = livePacing;
    to = typeof st.settings?.pacing === 'number' ? st.settings.pacing : livePacing;
    transition = Math.max(0, st.transition);
    scene = new ScenePlayer(st, rand).enter(to, t > 0 && sent.dim < FROM_DARK_BELOW);
  };
  enter(0, 0);
  for (let t = 0; t < seconds; t += TICK) {
    const st = seq.stages[index];
    const elapsed = t - entered;
    livePacing = transition > 0 ? from + (to - from) * Math.min(1, elapsed / transition) : to;
    const r = scene.tick(elapsed, livePacing);
    sent = r.sample;
    for (let k = 0; k < Math.round(TICK / FRAME); k++) plate = approachPace(plate, sent, FRAME);
    rows.push({ t, stage: index, elapsed, sent: { ...sent }, plate: { ...plate }, moments: r.moments, plan: scene.plan });
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
  const others = seqs.filter(q => q.id !== 'light-show-night' && q.stages.some(st => 'pacing' in (st.settings ?? {})));
  check('no other built-in sequence sets Pacing, so each plays as it did', others.length === 0, others.map(q => q.id).join(', ') || `${seqs.length - 1} sequences read`);
  const empty = planScene(30, 0, () => { throw new Error('drew dice at Pacing 0'); });
  check('nothing is planned, and no dice are drawn', empty.swells.length === 0 && empty.fadeIn === 0 && empty.fadeOut === 0 && empty.drainAt === null);
  // Bitwise, not near: a plan at 0 must not even round.
  const s0 = sampleScene(planScene(30, 0.8, makeRng(3, 'show.pacing').float), 12.3, 0);
  check('a plan played at Pacing 0 is exactly neutral', s0.activity === 1 && s0.dim === 1, `${s0.activity}, ${s0.dim}`);
  /*
    The case that matters on the night: a stage planned at 0.8, and the
    operator pulls Pacing to 0 in the middle of it. Every tick must be exactly
    1 and 1 and nothing may fire, though swells come due meanwhile.
  */
  const stage = { seconds: 120, advance: 'time' };
  const player = new ScenePlayer(stage, makeRng(4, 'show.pacing').float).enter(0.8, false);
  let off = 0, fired = 0, t = 0;
  for (; t < 5; t += TICK) player.tick(t, 0.8);
  const due = player.plan.swells.filter(sw => sw.at >= 5 && sw.at < 60).length;
  for (; t < 60; t += TICK) { const r = player.tick(t, 0); if (r.sample.activity !== 1 || r.sample.dim !== 1) off++; fired += r.moments.length; }
  check('Pacing pulled to 0 mid-stage hands back exactly 1 and 1 and fires nothing', off === 0 && fired === 0 && due >= 1,
    `${due} swells came due in the 55 s at 0: ${fired} fired, ${off} ticks off neutral`);
  let back = 0;
  for (let k = 0; k < 8; k++, t += TICK) back += player.tick(t, 0.8).moments.length;
  check('and brought back up, it does not fire what came due at 0', back <= 1, `${back} fired in the first two seconds back`);
}

// ─── The planner's rate, where it has room ──────────────────────────────────
console.log('\nThe planner\'s rate');
{
  /*
    A scene long enough to hold many swells: 300 s, timed, not from the dark.
    The rate asked for is 1.5 + 2p a minute, the footage's range across the
    dial. Light Show Night cannot show this, because its 22–30 s scenes hold
    one swell each (below): there the swell rate is the scene rate.
  */
  const bad = [];
  for (const p of [0.2, 0.5, 0.7, 1]) {
    const want = 300 / 60 * (1.5 + 2 * p);
    let n = 0;
    for (let seed = 1; seed <= 50; seed++) n += planScene(300, p, makeRng(seed, 'show.pacing').float).swells.length;
    const mean = n / 50;
    console.log(`   Pacing ${p}: ${f2(mean)} swells in 300 s, asked ${f2(want)}`);
    if (Math.abs(mean - want) > 0.1 * want) bad.push(`${p}: ${f2(mean)} vs ${f2(want)}`);
  }
  check('a long scene swells at the rate its Pacing asks, within a tenth', bad.length === 0, bad.join('; ') || 'at 0.2, 0.5, 0.7 and 1');
}

// ─── The shape, measured as the shows were ──────────────────────────────────
console.log('\nLight Show Night, measured with shape()');
check('the sequence exists and is paced', !!night && night.stages.every(st => (st.settings?.pacing ?? 0) > 0));
const SEEDS = [1, 2, 3, 4, 5, 6];
const SET = 20 * 60;
/*
  The motion proxy, and every assumption in it.

  The yardstick's motion is the mean change in luma between samples, in
  per cent (`watch.mjs`). Here it is two terms:

    - the plate moving: BASE × activity × light. BASE is the app's own median,
      1.2 % a sample (`npm run moving` on Metal: "median change 1.229 %"), and
      the plate's motion is taken to scale with its clock and with the light
      it is drawn in. The plate's inertia is left out (it carries motion on
      after a push, which would lengthen the swells), and so are the phrasing's
      gusts and the automation, taken as part of the base;
    - the light changing: the dimmer multiplies the frame's colour, so a fade
      is a change in every pixel, |Δlight| × LUMA × 100, with LUMA the take's
      mean brightness, 0.31 in the same run. The first version left this out
      and so counted every fade as the calmest part of the set.

  The moments are not added as motion: a pour moving a third of the plate is
  what makes a swell visible, and this counts only the clock and the light.
  It measures what the sequence asks of the plate. The film on the Mac
  (`film.yml`, Light Show Night) is what says whether the plate delivers it.
*/
const BASE = 1.2, LUMA = 0.31;
const perNight = [];
for (const seed of SEEDS) {
  const rows = play(night, { seconds: SET, dial: 0, seed });
  const motion = rows.map((r, i) => BASE * r.plate.activity * r.plate.dim + (i ? Math.abs(r.plate.dim - rows[i - 1].plate.dim) * LUMA * 100 : 0));
  const sh = shape({
    rows: rows.map((r, i) => ({
      t: r.t, motion: motion[i], dark: 1 - r.plate.dim,
      colour: 0, coloured: 0, hue12: new Array(12).fill(0), hv: new Array(39).fill(0),
    })),
    rate: 1 / TICK, span: SET,
  });
  const lit = rows.map((r, i) => i).filter(i => rows[i].plate.dim >= 0.5);
  const p90 = [...motion].sort((a, b) => a - b)[Math.floor(0.9 * motion.length)];
  const calmLit = lit.filter(i => motion[i] < p90 / 3).length / lit.length;
  const dimLow = rows.filter(r => r.plate.dim < 0.25).length / rows.length;
  const kinds = {};
  for (const r of rows) for (const k of r.moments) kinds[k] = (kinds[k] ?? 0) + 1;
  perNight.push({ seed, rows, sh, calmLit, dimLow, kinds });
  console.log(`   seed ${seed}: swells ${f2(sh.swells.perMin)}/min (rise ${f2(sh.swells.rise)} s, decay ${f2(sh.swells.decay)} s, `
    + `peak ${f2(sh.swells.peakOverMedian)}× median), calm ${pc(sh.calm)} (${pc(calmLit)} of the lit time), `
    + `light down ${pc(dimLow)}, moments ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}`);
}
{
  const plans = perNight[0].rows.filter((r, i, a) => i === 0 || r.stage !== a[i - 1].stage).map(r => r.plan.swells.length);
  console.log(`   swells planned per scene: ${[...new Set(plans)].join(', ')} (so the night's swell rate is its scene rate)`);
  const bad = perNight.filter(n => !(n.sh.swells.perMin >= 1.5 && n.sh.swells.perMin <= 3.5));
  check('swells 1.5 to 3.5 a minute, every night', bad.length === 0, bad.map(n => `seed ${n.seed}: ${f2(n.sh.swells.perMin)}`).join('; ') || `${SEEDS.length} nights`);
  const calm = perNight.filter(n => !(n.sh.calm >= 0.2 && n.sh.calm <= 0.4));
  check('calm 20 to 40 % of the time, fades counted as the change they are', calm.length === 0, calm.map(n => `seed ${n.seed}: ${pc(n.sh.calm)}`).join('; ') || perNight.map(n => pc(n.sh.calm)).join(', '));
  // The footage's swells stood about 2.5 times the median; far over that is a
  // plate that only ever rests or lurches, far under it is no swell at all.
  const tall = perNight.filter(n => !(n.sh.swells.peakOverMedian >= 1.8 && n.sh.swells.peakOverMedian <= 4));
  check('a swell stands 1.8 to 4 times the median, as the footage\'s 2.5 did', tall.length === 0, perNight.map(n => f2(n.sh.swells.peakOverMedian)).join(', '));
  const slow = perNight.filter(n => !(n.sh.swells.rise >= 1 && n.sh.swells.decay >= 2 && n.sh.swells.decay <= 9));
  check('swells rise over a second or more and fall away over 2 to 9', slow.length === 0,
    slow.map(n => `seed ${n.seed}: rise ${f2(n.sh.swells.rise)}, decay ${f2(n.sh.swells.decay)}`).join('; ') || 'medians in range');
  /*
    What the scenes add to the dark. A look's own black surround is most of
    the footage's 30–60 % near-black, so this is a share, not the whole. The
    floor is the shortest fades allowed in the longest scene: 8 s down and
    6 s up, each under a quarter light for its last or first third (a
    smoothstep passes 0.25 at a third of the way), 4.7 s in 30 s, 15.6 %. The
    ceiling keeps the scenes mostly out of the dark.
  */
  const dark = perNight.filter(n => !(n.dimLow >= 0.155 && n.dimLow <= 0.3));
  check('the light is down (under a quarter) for at least the shortest fades, and under 30 %', dark.length === 0,
    perNight.map(n => pc(n.dimLow)).join(', '));
  const varied = perNight.filter(n => Object.keys(n.kinds).filter(k => k !== 'drain').length < 3);
  check('the scenes open with different moments: a pour, a press and the dyes', varied.length === 0,
    perNight.map(n => Object.keys(n.kinds).filter(k => k !== 'drain').length).join(', ') + ' kinds a night');
}

// ─── Darkness without cuts ──────────────────────────────────────────────────
console.log('\nDarkness');
{
  const rows = perNight[0].rows;
  const ends = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].stage !== rows[i - 1].stage) ends.push(Math.min(...rows.slice(Math.max(0, i - 8), i).map(r => r.plate.dim)));
  }
  check('every dark ending reaches near-black', ends.length > 20 && ends.every(d => d <= 0.1), `${ends.length} stage ends, lowest light max ${f2(Math.max(...ends))}`);
  let planned = 0, bent = 0;
  for (const n of perNight) for (let i = 1; i < n.rows.length; i++) {
    planned = Math.max(planned, Math.abs(n.rows[i].sent.dim - n.rows[i - 1].sent.dim));
    bent = Math.max(bent, Math.abs(n.rows[i].plate.dim - n.rows[i].sent.dim));
  }
  // The plan must fit inside the plate's rate limit, or the limit would bend
  // every fade; and if it does, the plate arrives at each tick's target.
  check('the planned light never moves faster than the plate may follow', planned <= DIM_RATE * TICK + 1e-9, `largest change in a quarter second ${planned.toFixed(3)} against ${(DIM_RATE * TICK).toFixed(3)}`);
  check('so the plate draws the planned light, not a bent one', bent <= 1e-6, `largest gap between plate and plan at a tick ${bent.toExponential(1)}`);
  let p = { activity: 0.4, dim: 0.04 }, t = 0;
  while (p.dim < 0.99 && t < 10) { p = approachPace(p, PACE_NEUTRAL, FRAME); t += FRAME; }
  check('stopped in the dark, the light comes back over more than a second', t >= 1.2 && t <= 2.5, `${f2(t)} s from black to full`);
}

// ─── The plan's own rules ───────────────────────────────────────────────────
console.log('\nScenes');
{
  let plans = 0, withSwells = 0, wrongOpen = 0, twice = 0, drainsUnasked = 0, drains = 0, drainLit = 0, worst = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = makeRng(seed, 'show.pacing').float;
    for (const p of [0.2, 0.5, 0.7, 1]) {
      const T = 15 + (seed % 7) * 5;
      const lists = [undefined, ['burst', 'pour'], ['dyes', 'burst', 'pour']];
      const moments = lists[seed % 3];
      const dark = planScene(T, p, r, { fromDark: true, pace: moments ? { moments } : undefined });
      plans++;
      if (dark.swells.length) withSwells++;
      if (dark.swells.length && (dark.swells[0].kind !== (moments?.[0] ?? 'pour') || dark.swells[0].at > 0.5)) wrongOpen++;
      for (const pl of [dark, planScene(T, p, r)]) {
        for (let i = 1; i < pl.swells.length; i++) if (pl.swells[i].kind === pl.swells[i - 1].kind) twice++;
        if (pl.drainAt !== null) drainsUnasked++;
      }
      const asked = planScene(T, p, r, { pace: { endDark: true, moments: ['pour', 'drain'] } });
      if (asked.swells.some(s => s.kind === 'drain')) drainLit++;
      if (asked.drainAt !== null) {
        drains++;
        // The light when the drain starts and when it has run: after the
        // stage's end the next stage comes up from black, so the end counts.
        const light = Math.max(sampleScene(asked, asked.drainAt, p).dim, sampleScene(asked, Math.min(T, asked.drainAt + DRAIN_SECONDS), p).dim);
        worst = Math.max(worst, light);
        if (light > 0.12) drainLit++;
      }
    }
  }
  check('out of the dark, a scene opens with its stage\'s first moment as the light comes up', withSwells === plans && wrongOpen === 0, `${wrongOpen} of ${plans} did not; ${plans - withSwells} had no swell`);
  check('no moment twice running within a scene', twice === 0, `${twice} repeats`);
  check('a drain only where a stage asked', drainsUnasked === 0, `${drainsUnasked} unasked`);
  check('and it runs in the dark, the light under 0.12 from start to finish', drains > 0 && drainLit === 0, `${drains} drains, the brightest at ${f2(worst)}`);
  const lit = planScene(30, 0.9, makeRng(9, 'show.pacing').float, { pace: { endDark: false } });
  check('a stage can ask to stay lit', lit.fadeOut === 0);
}

// ─── Stages with no clock of their own ──────────────────────────────────────
console.log('\nSection and hold stages');
{
  let lowest = 1, lateSwells = 0;
  for (const advance of ['section', 'hold']) {
    const player = new ScenePlayer({ seconds: 30, advance }, makeRng(6, 'show.pacing').float).enter(0.9, false);
    for (let t = 0; t < 3 * OPEN_SCENE_SECONDS; t += TICK) {
      const r = player.tick(t, 0.9);
      lowest = Math.min(lowest, r.sample.dim);
      if (t > 2 * OPEN_SCENE_SECONDS && r.moments.length) lateSwells++;
    }
  }
  check('a stage waiting for the song, or held, never goes dark', lowest > 0.5, `lowest light ${f2(lowest)} over half an hour at Pacing 0.9`);
  check('and keeps swelling long after its first plan runs out', lateSwells >= 10, `${lateSwells} moments in its third ten minutes`);
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
}

// ─── Seeds ──────────────────────────────────────────────────────────────────
console.log('\nSeeds');
{
  const key = p => JSON.stringify(p.swells.map(s => [s.at.toFixed(4), s.kind, s.attack.toFixed(4), s.decay.toFixed(4)]));
  const a = planScene(120, 0.7, makeRng(7, 'show.pacing').float);
  const b = planScene(120, 0.7, makeRng(7, 'show.pacing').float);
  const c = planScene(120, 0.7, makeRng(8, 'show.pacing').float);
  check('the same seed plans the same scene', key(a) === key(b) && a.swells.length >= 3, `${a.swells.length} swells`);
  check('another seed plans a different one', key(a) !== key(c));
  const series = seed => play(night, { seconds: 300, seed }).map(r => `${r.sent.activity.toFixed(5)},${r.sent.dim.toFixed(5)}`).join(';');
  check('the same seed plays the same night, tick for tick', series(5) === series(5));
  check('and another seed another night', series(5) !== series(6));
}

// ─── Connected ──────────────────────────────────────────────────────────────
/*
  Greps, and weak ones: they cannot say the wiring works, only that someone
  did not take it out. Each names a line whose absence would leave every check
  above green while the show did nothing, or did it at the wrong moment.
*/
console.log('\nWiring');
{
  const src = f => readFileSync(join(process.cwd(), f), 'utf8');
  const hook = src('src/hooks/useShowSequencer.ts');
  const app = src('src/App.tsx');
  const vis = src('src/components/LiquidVisualizer.tsx');
  check('the sequencer plays each stage through the scene player, coming up from the dark on the same rule',
    /scene: new ScenePlayer\(stage, stream\('show\.pacing'\)\.float\)\.enter\(pacing, fromDark\)/.test(hook)
    && /paceSentRef\.current\.dim < FROM_DARK_BELOW/.test(hook)
    && /run\.scene\.tick\(elapsed, pacing\)/.test(hook) && /a\.moment\?\.\(k\)/.test(hook) && /sendPace\(sample\)/.test(hook));
  check('it gives the light back when paused or the show pauses, holds the dark when the set is over, and puts Pacing back on stop',
    /if \(run\.pausedAt !== null\) \{ if \(!run\.finished\) sendPace\(PACE_NEUTRAL\); return; \}/.test(hook)
    && /run\.enteredAt \+= TICK_MS \* 0\.001;\s*sendPace\(PACE_NEUTRAL\);\s*return;/.test(hook)
    && /releasePacing\(\);\s*sendPace\(PACE_NEUTRAL\);/.test(hook));
  check('the app hands moments and pace to the plate', /v\.pace\(sample\); return true;/.test(app)
    && /case 'pour': v\?\.pour\(\)/.test(app) && /case 'burst': v\?\.applyGesture/.test(app)
    && /case 'dyes': v\?\.stepDyes\(\)/.test(app) && /case 'drain': runActionRef\.current\?\.\('drain'\)/.test(app));
  check('the plate takes the target and follows it every frame', /paceTargetRef\.current = \{ activity: sample\.activity, dim: sample\.dim \}/.test(vis)
    && /paceNowRef\.current = approachPace\(paceNowRef\.current, paceTargetRef\.current, realDt\)/.test(vis));
  check('the plate draws in the paced light', /dimmerGain: flashGainRef\.current \* paceNowRef\.current\.dim/.test(vis));
  check('the plate runs its clock and its automation at the paced activity', /f\.paceMul = paceNowRef\.current\.activity/.test(vis)
    && /dynamicSpeed \*= Number\.isFinite\(this\.paceMul\) \? this\.paceMul : 1/.test(vis) && /ph\.drive \* paceNowRef\.current\.activity/.test(vis));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
