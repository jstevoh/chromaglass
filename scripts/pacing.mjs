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
 *   - with Follow the Song, played to synthesised songs through the real
 *     analyser, tracker and the app's own cue: each drop opened or let go by
 *     the rule, at the gain promised, the plate reaching the swell; planned
 *     swells waiting through builds and breakdowns and arriving when they
 *     end or when 24 s is up; and Follow 0, or Pacing 0 (from the start or
 *     pulled down mid-scene), leaving the scene exactly as it was;
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
  PACE_NEUTRAL, STALE_MOMENT, DIM_RATE, FROM_DARK_BELOW, OPEN_SCENE_SECONDS, CUE_STALE, songCueFrom,
} from '../src/lib/scenePacing.ts';
import { builtInSequences } from '../src/lib/sequencer.ts';
import { makeRng } from '../src/lib/rng.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { RIG_KEYS, lookOf } from '../src/lib/lookFade.ts';
import { PRESETS } from '../src/presets.ts';
import { shape } from './watch.mjs';
import { analysePcm } from '../src/lib/audioFeatures.ts';
import { SongShape } from '../src/lib/songShape.ts';
import { arrange, rng as songRng, SR } from './arrangement.mjs';

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
function play(seq, { seconds, dial = 0, seed = 1, cue = null, follow = 0, pacingAt = null }) {
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
    livePacing = pacingAt ? pacingAt(t) : transition > 0 ? from + (to - from) * Math.min(1, elapsed / transition) : to;
    const song = cue ? cue(t) : null;
    /*
      Where the scene stood before the tick, for "Following the song" to hold
      each drop and each hold to the rules in scenePacing.ts: how far into the
      plan, its length and its fades, the last swell it had passed, and the
      planned swells still to come (on this clock, t).
    */
    const pl = scene.plan, cur = scene.cursor;
    const local = elapsed - scene.planFrom;
    const pre = pl ? {
      local, seconds: pl.seconds, fadeIn: pl.fadeIn, fadeOut: pl.fadeOut,
      lastFired: cur.nextSwell > 0 ? pl.swells[cur.nextSwell - 1].at : null,
      pending: cue ? pl.swells.slice(cur.nextSwell).filter(sw => !sw.song).map(sw => t - local + sw.at) : null,
    } : null;
    const r = cue ? scene.tick(elapsed, livePacing, song, follow) : scene.tick(elapsed, livePacing);
    sent = r.sample;
    for (let k = 0; k < Math.round(TICK / FRAME); k++) plate = approachPace(plate, sent, FRAME);
    const inserted = cue && scene.plan ? scene.plan.swells.filter(sw => sw.song && sw.at === local).map(sw => ({ ...sw })) : [];
    rows.push({ t, stage: index, elapsed, pacing: livePacing, sent: { ...sent }, plate: { ...plate }, moments: r.moments, plan: scene.plan, song, scene,
      opened: scene.dropsOpened, letGo: scene.dropsLetGo, pre, inserted, st });
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

// ─── Following the song ─────────────────────────────────────────────────────
/*
  Follow the Song (`songFollow`, PLAN §10 step 2's second half): a paced scene
  played to the song's shape as `songShape.ts` hears it. Light Show Night is
  played against a set of synthesised club songs (`scripts/arrangement.mjs`,
  the songs `npm run shape` measures the tracker on, one after another with
  two and a half seconds of room between), through the real analyser and the
  real tracker, and the cue handed to each tick is built by the app's own
  `songCueFrom` from a report kept the way the plate keeps it. A second set
  of three awkward songs is played on one long scene, a stage that waits for
  the song's section: a breakdown the beat comes back out of with no build, a
  breakdown the song ends in, and a sixteen-bar build longer than HOLD_MAX.
  Light Show Night cannot test those: its scenes are 22 to 30 s with a dark
  ending, so no hold there lasts 24 s, and most holds end on a drop.

  The review this was rewritten after found most of the first version could
  pass with the feature broken: the two 20 s window checks passed with drop()
  doing nothing (they measure the breakdowns' dimming), "every drop opens a
  swell or is let go" took "let go" as whatever was not opened, "no planned
  swell fires in a hold" passed with no hold ever holding anything, and
  "Pacing 0 leaves today's plate" could not fail. So each claim below is held
  to the rule in scenePacing.ts it is about, with its count printed so a
  reader can see it was not vacuous:

    - the cue: each event handed over once, and none heard more than 1.5 s
      before the tick that asks (a sequencer that was paused asks late);
    - at Follow 0 the scene is the scene with no song at all, bit for bit; at
      Pacing 0 from the start and at Pacing pulled to 0 in the middle of a
      stage while the song breaks down, builds and drops, not one tick
      differs from the same stage played with no song;
    - every drop is opened or let go by the scene's own count, and the count
      is the rule's: let go exactly when it lands in a dark ending or within
      DROP_AFTER (4 s) of the last swell the scene passed, opened otherwise;
      an opened one puts in a swell of the stage's opening move with the
      gain the formula says, fires that move on its own tick, and the plate
      reaches 0.85 of the swell's top within two seconds (formula below);
    - planned swells come due inside holds (at least 8 across the nights),
      none fires there, the held one arrives within half a second of the
      hold ending (and alone), and past HOLD_MAX (24 s) the plan plays on;
    - and, measured against the thing the footage says a show does
      (footage.md, 2): at the beat the plate is not locked to the song (the
      footage's -0.15 to +0.27), and over 20 s windows it follows the song's
      sections, 0.3 or more, as the one live show's 0.40.
    - and it is still a light show: the swells still 1.5 to 3.5 a minute.
*/
console.log('\nFollowing the song');
{
  /*
    The cue itself, on a made-up report: the rules are two lines, and a wrong
    one of either would pass everything after, since the songs below are
    asked every tick and nothing they hear is ever late.
  */
  {
    const ev = (seq, at, kind = 'drop') => ({ kind, at, strength: 1, seq });
    const report = { now: { section: 'build', tension: 0.4, time: 10 }, events: [ev(1, 2), ev(2, 8.9, 'build'), ev(3, 9.2), ev(4, 9.9)] };
    const a = songCueFrom(report, 2);
    const b = songCueFrom(report, a.seq);
    const none = songCueFrom(null, 7);
    check('the cue hands each event over once: those numbered past the last seen, with the song\'s section and tension now',
      a.cue.events.map(e => e.seq).join() === '3,4' && a.seq === 4 && a.cue.section === 'build' && a.cue.tension === 0.4
      && b.cue.events.length === 0 && b.seq === 4 && none.cue === null && none.seq === 7,
      `after 2: [${a.cue.events.map(e => e.seq)}] to ${a.seq}; asked again: [${b.cue.events.map(e => e.seq)}]; nothing listening: ${none.cue}, ${none.seq}`);
    const late = songCueFrom({ now: { section: 'steady', tension: 0, time: 20 }, events: [ev(5, 18.4), ev(6, 18.6)] }, 4);
    check(`and none heard more than ${CUE_STALE} s before the tick, though its number is passed so it never comes later`,
      late.cue.events.map(e => e.seq).join() === '6' && late.seq === 6, `1.6 s and 1.4 s old: [${late.cue.events.map(e => e.seq)}] to ${late.seq}`);
  }

  /*
    Songs one after another, through the analyser and the tracker at 60
    readings a second, with the plate's report kept as LiquidVisualizer keeps
    it (every event numbered, the last sixteen kept, the tracker's state now)
    and one cue a quarter-second tick through `songCueFrom`. The loudness on
    each tick is the mean power of the readings in it.
  */
  const listen = songs => {
    const parts = songs.map(({ bpm, seed, sections }) => {
      const a = arrange({ bpm, sections, seed });
      // Cut half a second after the music, as a player does, not after the tail.
      return a.pcm.subarray(0, Math.round((a.truth.sections.at(-1).end + 0.5) * SR));
    });
    const gap = Math.round(2.5 * SR);
    const pcm = new Float32Array(parts.reduce((n, p) => n + p.length + gap, 0));
    const hiss = songRng(31);
    let at = 0;
    for (const p of parts) {
      pcm.set(p, at); at += p.length;
      for (let i = 0; i < gap; i++) pcm[at + i] = 5e-4 * (hiss() * 2 - 1) * Math.sqrt(3);
      at += gap;
    }
    const seconds = pcm.length / SR;
    const readings = analysePcm(pcm, SR, 60);
    const tracker = new SongShape();
    const events = [], kept = [], cues = [], loud = [];
    let fi = 0, seq = 0, lastSeq = 0, now = { ...tracker.now };
    for (let k = 0; k < Math.ceil(seconds / TICK - 1e-9); k++) {
      const t = k * TICK;
      let p = 0, c = 0;
      while (fi < readings.length && readings[fi].time <= t) {
        const r = readings[fi++];
        for (const e of tracker.update(r, r.time)) {
          events.push(e);
          kept.push({ ...e, seq: ++seq });
          if (kept.length > 16) kept.shift();
        }
        now = { ...tracker.now };
        p += 10 ** (r.db[0] / 10); c++;
      }
      const got = songCueFrom({ now, events: kept.slice() }, lastSeq);
      lastSeq = got.seq;
      cues.push(got.cue);
      loud.push(c ? 10 * Math.log10(p / c) : (loud.length ? loud[loud.length - 1] : -120));
    }
    const count = kind => events.filter(e => e.kind === kind).length;
    return { seconds, cues, loud, events, cue: t => cues[Math.min(cues.length - 1, Math.round(t / TICK))], count };
  };
  const SONG = [
    { kind: 'intro', bars: 4 }, { kind: 'verse', bars: 8 }, { kind: 'build', bars: 8 }, { kind: 'drop', bars: 8 },
    { kind: 'breakdown', bars: 8 }, { kind: 'build', bars: 4 }, { kind: 'drop', bars: 8 }, { kind: 'outro', bars: 4 },
  ];
  const club = listen([[128, 21], [122, 22], [132, 23], [126, 24], [124, 25]].map(([bpm, seed]) => ({ bpm, seed, sections: SONG })));
  /*
    The awkward three. The tracker hears the beat coming back after the first
    one's breakdown as a drop (of 0.75: "the beat coming in"), so that
    breakdown ends on a drop too; the second's breakdown runs into the outro
    and the gap, and ends with no drop at all; the third's build at 118 bpm
    is 32 s, heard as a breakdown (the kick leaving) running into a build.
  */
  const awkward = listen([
    { bpm: 124, seed: 41, sections: [{ kind: 'intro', bars: 4 }, { kind: 'verse', bars: 8 }, { kind: 'breakdown', bars: 8 }, { kind: 'verse', bars: 8 }, { kind: 'outro', bars: 4 }] },
    { bpm: 124, seed: 42, sections: [{ kind: 'intro', bars: 4 }, { kind: 'verse', bars: 8 }, { kind: 'breakdown', bars: 8 }, { kind: 'outro', bars: 4 }] },
    { bpm: 118, seed: 43, sections: [{ kind: 'intro', bars: 4 }, { kind: 'verse', bars: 8 }, { kind: 'build', bars: 16 }, { kind: 'drop', bars: 8 }, { kind: 'outro', bars: 4 }] },
  ]);
  for (const [name, s] of [['club songs', club], ['awkward songs', awkward]]) {
    console.log(`   ${name}: ${f2(s.seconds / 60)} min, heard ${s.count('drop')} drops, ${s.count('build')} builds, ${s.count('breakdown')} breakdowns`);
  }
  // One long scene: a stage that waits for the song's section, at Pacing 0.8.
  const long = { id: 'follow-long', name: 'One long scene', stages: [{ name: 'Long', seconds: 30, advance: 'section', transition: 0, settings: { pacing: 0.8 } }] };

  // Follow 0 is no song at all; Pacing 0 is today's plate whatever Follow says.
  const { seconds } = club;
  const drops = club.events.filter(e => e.kind === 'drop');
  const bare = play(night, { seconds, seed: 1 });
  const zero = play(night, { seconds, seed: 1, cue: club.cue, follow: 0 });
  const same = bare.length === zero.length && bare.every((r, i) => r.sent.activity === zero[i].sent.activity && r.sent.dim === zero[i].sent.dim
    && r.moments.join() === zero[i].moments.join());
  check('at Follow 0 the scene is the scene with no song, bit for bit', drops.length >= 8 && same, `${bare.length} ticks, ${drops.length} drops offered`);
  const flat = { ...night, stages: night.stages.map(st => ({ ...st, settings: { ...st.settings, pacing: 0 } })) };
  const neutral = play(flat, { seconds, seed: 1, cue: club.cue, follow: 1 });
  const moved = neutral.filter(r => r.sent.activity !== 1 || r.sent.dim !== 1 || r.moments.length).length;
  check('at Pacing 0, Follow 1 leaves today\'s plate: 1 and 1, nothing fired', moved === 0, `${moved} of ${neutral.length} ticks moved`);
  /*
    The same, where it can fail: a scene planned at 0.8 and the operator
    pulling Pacing to 0 in the middle of it while the song breaks down,
    builds and drops, then putting it back. The plan is there all through,
    so a song that reached it with Pacing down (holding its swells, taking
    them out for a drop's) would change the scene that comes back up. Played
    against the same stage with no song at all, and with the song only while
    Pacing is down (a steady song either side), not one tick may differ,
    during or after.
  */
  {
    const bd = club.events.find(e => e.kind === 'breakdown' && e.at > 30);
    const dr = club.events.find(e => e.kind === 'drop' && e.at > bd.at);
    const a = Math.floor((bd.at - 5) / TICK) * TICK, b = Math.ceil((dr.at + 10) / TICK) * TICK;
    const inside = kind => club.events.filter(e => e.kind === kind && e.at >= a && e.at < b).length;
    const pacingAt = t => (t >= a && t < b ? 0 : 0.8);
    const STEADY = { events: [], section: 'steady', tension: 0 };
    const cue = t => (t >= a && t < b ? club.cue(t) : STEADY);
    const alone = play(long, { seconds: b + 60, seed: 1, pacingAt });
    const heard = play(long, { seconds: b + 60, seed: 1, pacingAt, cue, follow: 1 });
    const differs = (r, i) => r.sent.activity !== heard[i].sent.activity || r.sent.dim !== heard[i].sent.dim || r.moments.join() !== heard[i].moments.join();
    const during = alone.filter((r, i) => r.t < b && differs(r, i)).length;
    const after = alone.filter((r, i) => r.t >= b && differs(r, i)).length;
    const later = alone.filter(r => r.t >= b && r.moments.length).length;
    check('and with Pacing pulled to 0 mid-scene through a breakdown, a build and a drop, not one tick differs from no song, during or after',
      inside('breakdown') > 0 && inside('build') > 0 && inside('drop') > 0 && later > 0 && during === 0 && after === 0,
      `Pacing 0 from ${f2(a)} to ${f2(b)} s over ${inside('breakdown')} breakdown, ${inside('build')} build, ${inside('drop')} drop; `
      + `${during} ticks differ during, ${after} of ${alone.length - Math.round(b / TICK)} after (${later} moments after)`);
  }

  /*
    The rules, restated here as the spec they are (scenePacing.ts, "Following
    the song" and the numbers under it), not imported, so a change to one of
    them in the code is a change this sees.

    A drop's swell: gain g = 1 + DROP_GAIN · strength · Follow, DROP_GAIN 0.5,
    rising over DROP_ATTACK 0.6 s to g and falling away after. The scene's
    activity is rest + (top − rest) · envelope, rest = 1 − 0.8 p and top =
    1 + 0.8 p at Pacing p, and within a fade it is pulled back toward rest by
    the light (a smoothstep up over fadeIn, down over fadeOut). So a drop's
    swell tops out at

        rest + (top − rest) · g · light(at + 0.6)

    and the plate must reach 0.85 of that within two seconds. At full
    strength and Pacing 0.7 the top is 2.12; a planned swell's top in its
    place, what a drop that did nothing would leave, is 1.56, 0.74 of it, and
    a drop put in at a planned swell's gain reached 0.66 at worst.

    Why 0.85 and not the 0.9 the review asked for: the plate follows the
    scene on a 0.35 s lag (ACTIVITY_TAU, approachPace), and a drop's swell
    peaks 0.6 s in and starts falling at once, so the lag alone costs a tenth
    of the top. Every drop here is caught at 0.90 to 0.91 of it, the lag and
    nothing else, and a line at 0.9 would sit on that number: a weaker
    drop falls away faster (its decay 4 s against 7) and loses a little more
    to the lag, and the check would go red on the lag, not on the drop.
  */
  const DROP_GAIN = 0.5, DROP_AFTER = 4, DROP_ATTACK = 0.6, HOLD_MAX = 24, HOLD_STEP = 0.3, MARGIN = 2;
  const smooth = x => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };
  const lightAt = (pre, x) => Math.min(pre.fadeIn > 0 ? smooth(x / pre.fadeIn) : 1,
    pre.fadeOut > 0 ? 1 - smooth((x - (pre.seconds - pre.fadeOut)) / pre.fadeOut) : 1);
  // The stage's opening move, from the stage as written: the first it lists that is not the drain, a pour by default.
  const openingOf = st => (Array.isArray(st.pace?.moments) ? st.pace.moments : ['pour']).filter(m => m !== 'drain')[0] ?? 'pour';

  const followed = (rows, cues, follow) => {
    const o = {
      opened: 0, letGo: 0, dark: 0, breath: 0, unaccounted: 0, wrongOpen: 0, wrongLetGo: 0, badMove: 0, badGain: 0, noMove: 0,
      short: 0, worst: Infinity, dips: 0, sceneOpened: 0, sceneLetGo: 0,
      due: 0, heldFired: 0, holds: 0, released: 0, badRelease: 0, capped: 0, badCap: 0,
    };
    for (const sc of new Set(rows.map(r => r.scene))) { o.sceneOpened += sc.dropsOpened; o.sceneLetGo += sc.dropsLetGo; }
    const dOpen = rows.map((r, k) => r.opened - (k && rows[k - 1].scene === r.scene ? rows[k - 1].opened : 0));
    const dGo = rows.map((r, k) => r.letGo - (k && rows[k - 1].scene === r.scene ? rows[k - 1].letGo : 0));
    // The planned moments fired on a tick: all but the drain and the drop's own.
    const planned = k => rows[k].moments.filter(m => m !== 'drain').length - dOpen[k];

    for (let k = 0; k < rows.length; k++) {
      const ds = cues[k].events.filter(e => e.kind === 'drop');
      if (!ds.length) { if (dOpen[k] || dGo[k]) o.unaccounted++; continue; }
      const r = rows[k], pre = r.pre, e = ds[0];
      if (ds.length !== 1 || !pre) { o.unaccounted++; continue; }
      const dark = pre.fadeOut > 0 && pre.local >= pre.seconds - pre.fadeOut;
      const breath = pre.lastFired !== null && pre.local - pre.lastFired < DROP_AFTER;
      if (dOpen[k] === 1 && dGo[k] === 0) {
        o.opened++;
        if (dark || breath) o.wrongOpen++;
        const g = 1 + DROP_GAIN * e.strength * follow;
        if (r.inserted.length !== 1 || r.inserted[0].kind !== openingOf(r.st)) o.badMove++;
        else if (Math.abs((r.inserted[0].gain ?? 1) - g) > 1e-9) o.badGain++;
        if (!r.moments.includes(openingOf(r.st))) o.noMove++;
        const rest = 1 - 0.8 * r.pacing, top = 1 + 0.8 * r.pacing;
        const want = rest + (top - rest) * g * lightAt(pre, pre.local + DROP_ATTACK);
        const got = Math.max(...rows.slice(k, k + 9).map(x => x.plate.activity));
        o.worst = Math.min(o.worst, got / want);
        if (got < 0.85 * want) o.short++;
        // Not falling faster on the drop's tick than the scene was already
        // falling the tick before: a planned swell dying away carries on
        // dying for the quarter second the drop's attack takes to start,
        // which is the scene as it was; the build's wind vanishing under the
        // drop (0.83 to 0.44 in one tick, before the fix) is not.
        const a0 = k >= 2 ? rows[k - 2].sent.activity : rows[k - 1].sent.activity;
        const a1 = rows[k - 1].sent.activity, a2 = r.sent.activity;
        if (a2 < a1 - Math.max(0, a0 - a1) - 1e-6) o.dips++;
      } else if (dGo[k] === 1 && dOpen[k] === 0) {
        o.letGo++;
        if (dark) o.dark++; else if (breath) o.breath++; else o.wrongLetGo++;
      } else o.unaccounted++;
    }

    /*
      The holds. A hold is a run of ticks the song says build or breakdown,
      in one scene (a new stage starts its count again), broken by a drop
      that opened (it takes the hold's place and starts the count again).
      The code holds for its first HOLD_MAX seconds: the swell due is moved
      HOLD_STEP (0.3 s) past the tick, so never due, and any others due with
      it are let go. When the hold ends, the moved one is due on the second
      tick after the last it was held on, so it fires within half a second of
      that, alone; unless moving it would have put it past the scene's last
      moment for a swell (its dark ending), where it is let go.
    */
    const holding = k => (cues[k].section === 'build' || cues[k].section === 'breakdown') && dOpen[k] === 0;
    for (let k = 0; k < rows.length; k++) {
      if (!holding(k)) continue;
      const k0 = k;
      while (k + 1 < rows.length && holding(k + 1) && rows[k + 1].scene === rows[k0].scene) k++;
      const k1 = k;
      let kH = k0;
      while (kH + 1 <= k1 && rows[kH + 1].t - rows[k0].t < HOLD_MAX) kH++;
      const due = rows[k0].pre.pending.filter(at => at <= rows[kH].t).length;
      o.holds++;
      o.due += due;
      for (let j = k0; j <= kH; j++) o.heldFired += Math.max(0, planned(j));
      if (!due || kH + 2 >= rows.length || rows[kH + 2].scene !== rows[kH].scene) continue;
      if (kH === k1 && dOpen[k1 + 1] === 1) continue;   // the drop's swell is the held one, on time
      const pre = rows[kH].pre;
      const lastAt = rows[kH].t - pre.local + pre.seconds - pre.fadeOut - MARGIN;
      const expect = rows[kH].t + HOLD_STEP <= lastAt ? 1 : 0;
      const fired = planned(kH + 1) + planned(kH + 2);
      if (kH < k1) { o.capped++; if (fired !== expect) o.badCap++; } else { o.released++; if (fired !== expect) o.badRelease++; }
    }
    return o;
  };

  const BASE_F = 1.2, LUMA_F = 0.31;
  const motionOf = rows => rows.map((r, i) => BASE_F * r.plate.activity * r.plate.dim + (i ? Math.abs(r.plate.dim - rows[i - 1].plate.dim) * LUMA_F * 100 : 0));
  const measure = rows => {
    const motion = motionOf(rows);
    return shape({
      rows: rows.map((r, i) => ({ t: r.t, motion: motion[i], dark: 1 - r.plate.dim, loud: club.loud[i],
        colour: 0, coloured: 0, hue12: new Array(12).fill(0), hv: new Array(39).fill(0) })),
      rate: 1 / TICK, span: seconds,
    });
  };
  /*
    At the beat: motion against loudness on the quarter-second ticks with
    each series' own two-second running mean taken out, so what is left is
    what moves inside a bar (a kick, a fill, a pour answering a drop) and
    not the sections, which the windows below measure. Loudness as amplitude,
    as shape() takes it. Not shape()'s 1 s windows: those are a second's mean
    of each, and over a set of fifteen-second sections a second's mean is
    mostly the section, so they read the same climb the 20 s windows do.
  */
  const pear = (a, b) => {
    const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
    return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
  };
  const highPass = (x, half) => x.map((v, i) => {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(x.length - 1, i + half); k++) { s += x[k]; c++; }
    return v - s / c;
  });
  const atTheBeat = rows => pear(highPass(motionOf(rows), 4), highPass(rows.map((_, i) => 10 ** (club.loud[i] / 20)), 4));

  const FSEEDS = [1, 2, 3, 4];
  const res = FSEEDS.map(seed => {
    const off = play(night, { seconds, seed, cue: club.cue, follow: 0 });
    const on = play(night, { seconds, seed, cue: club.cue, follow: 1 });
    const longOn = play(long, { seconds: awkward.seconds, seed, cue: awkward.cue, follow: 1 });
    const a = followed(on, club.cues, 1), b = followed(longOn, awkward.cues, 1);
    const both = {};
    for (const key of Object.keys(a)) both[key] = key === 'worst' ? Math.min(a.worst, b.worst) : a[key] + b[key];
    return { seed, ...both, off: measure(off), on: measure(on), beatOff: atTheBeat(off), beatOn: atTheBeat(on) };
  });
  const r = (m, w) => m.sections?.[w]?.r;
  for (const x of res) {
    console.log(`   seed ${x.seed}: drops opened ${x.opened}, let go ${x.letGo} (${x.dark} dark, ${x.breath} a breath after a swell), reaching ${f2(x.worst)} of their top at worst; `
      + `${x.due} planned swells due in ${x.holds} holds, ${x.heldFired} fired there, ${x.released} released by the song, ${x.capped} by HOLD_MAX; `
      + `at the beat ${f2(x.beatOff)} and ${f2(x.beatOn)}; motion vs loudness at 1/5/10/20 s: Follow 0 ${[1, 5, 10, 20].map(w => f2(r(x.off, w))).join('/')}, Follow 1 ${[1, 5, 10, 20].map(w => f2(r(x.on, w))).join('/')}; `
      + `swells ${f2(x.on.swells.perMin)}/min`);
  }
  const sum = k => res.reduce((a, x) => a + x[k], 0);
  check('every drop is opened or let go by the scene\'s own count, and by the rule: let go exactly in a dark ending or within 4 s of a swell, and under a third are',
    sum('opened') > 0 && sum('dark') > 0 && sum('breath') > 0 && sum('unaccounted') === 0 && sum('wrongOpen') === 0 && sum('wrongLetGo') === 0
    && sum('sceneOpened') === sum('opened') && sum('sceneLetGo') === sum('letGo') && sum('letGo') < sum('opened') / 2,
    `${sum('opened')} opened (the scenes counted ${sum('sceneOpened')}), ${sum('letGo')} let go (counted ${sum('sceneLetGo')}: ${sum('dark')} in a dark ending, ${sum('breath')} a breath after a swell), `
    + `${sum('wrongOpen')} opened against the rule, ${sum('wrongLetGo')} let go against it, ${sum('unaccounted')} unaccounted, over ${FSEEDS.length} nights of both sets`);
  check('each opened drop puts in the stage\'s opening move at gain 1 + 0.5 × strength × Follow, and fires it on its own tick',
    sum('opened') > 0 && sum('badMove') === 0 && sum('badGain') === 0 && sum('noMove') === 0,
    `${sum('badMove')} with another move, ${sum('badGain')} with another gain, ${sum('noMove')} not fired, of ${sum('opened')}`);
  check('and the plate reaches 0.85 of that swell\'s top within 2 s of every drop opened',
    sum('opened') > 0 && sum('short') === 0, `${sum('short')} of ${sum('opened')} short; the lowest ${f2(Math.min(...res.map(x => x.worst)))} of its top`);
  check('the plate does not slow on the drop: the build\'s wind holds under the drop\'s attack', sum('opened') > 0 && sum('dips') === 0,
    `${sum('dips')} of ${sum('opened')} drops fell faster on their tick than the scene was already falling`);
  check('planned swells come due inside the song\'s builds and breakdowns, and none fires there (their first 24 s)',
    sum('due') >= 8 && sum('heldFired') === 0, `${sum('due')} came due in ${sum('holds')} holds, ${sum('heldFired')} fired`);
  check('when the song ends a hold with no drop, the held swell arrives within 0.5 s, alone',
    sum('released') >= FSEEDS.length && sum('badRelease') === 0, `${sum('badRelease')} of ${sum('released')} holds released otherwise`);
  check('and a hold past 24 s lets the plan play on: the held swell arrives within 0.5 s of the 24th second',
    sum('capped') >= FSEEDS.length && sum('badCap') === 0, `${sum('badCap')} of ${sum('capped')} long holds otherwise`);
  const beat = res.filter(x => !(x.beatOn >= -0.15 && x.beatOn <= 0.27));
  check('following the song does not lock the plate to its beat: motion against loudness at the beat stays in the footage\'s -0.15 to +0.27', beat.length === 0,
    res.map(x => f2(x.beatOn)).join(', '));
  /*
    Over 20 s windows. What moves this number is the sections: a breakdown's
    hush and lower light, a build's wind, a drop's swell, against the
    loudness of each. The review measured it at 0.34 with drop() doing
    nothing, so it is not the drops' check (the per-drop peak above is); it
    is the claim that the scene follows the song's sections. And the song's
    doing is counted from zero, not from Follow 0: the plan alone reads
    −0.17 to −0.02 against these songs (its dark endings fall where they
    fall), and "0.2 over Follow 0" gave following credit for lifting that to
    nothing.
  */
  const mean = (w, which) => res.reduce((a, x) => a + (r(x[which], w) ?? NaN), 0) / res.length;
  check('over 20 s windows the scene follows the song\'s sections (breakdowns hushed, builds wound up, drops): 0.3 or more on average, as the one live show\'s 0.40',
    mean(20, 'on') >= 0.3, `Follow 1 ${f2(mean(20, 'on'))}, Follow 0 ${f2(mean(20, 'off'))}`);
  check('and that is the song\'s doing: 0.2 or more over the plan alone, counted from 0 where the plan reads below it',
    mean(20, 'on') - Math.max(0, mean(20, 'off')) >= 0.2, `${f2(mean(20, 'on'))} over ${f2(Math.max(0, mean(20, 'off')))}`);
  const rate = res.filter(x => !(x.on.swells.perMin >= 1.5 && x.on.swells.perMin <= 3.5));
  check('still a light show: swells 1.5 to 3.5 a minute', rate.length === 0, res.map(x => f2(x.on.swells.perMin)).join(', '));
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
    && /const cue = a\.songCue\?\.\(\) \?\? null;/.test(hook)
    && /run\.scene\.tick\(elapsed, pacing, cue, pacingOf\(settings\.songFollow\)\)/.test(hook) && /a\.moment\?\.\(k\)/.test(hook) && /sendPace\(sample\)/.test(hook));
  check('it gives the light back when paused or the show pauses, holds the dark when the set is over, and puts Pacing back on stop',
    /if \(run\.pausedAt !== null\) \{ if \(!run\.finished\) sendPace\(PACE_NEUTRAL\); return; \}/.test(hook)
    && /run\.enteredAt \+= TICK_MS \* 0\.001;\s*sendPace\(PACE_NEUTRAL\);\s*return;/.test(hook)
    && /releasePacing\(\);\s*sendPace\(PACE_NEUTRAL\);/.test(hook));
  // The song's side: the app hands the sequencer what the tracker heard, new
  // since the last tick. Without it Follow the Song is a slider that does nothing.
  check('the app hands the sequencer the song\'s new events, its section and its tension, through the songCueFrom checked above',
    /import \{ songCueFrom \} from '\.\/lib\/scenePacing'/.test(app)
    && /songCue: \(\) => \{[^}]*const \{ cue, seq \} = songCueFrom\(visualizerRef\.current\?\.songShape\(\), songCueSeqRef\.current\);\s*songCueSeqRef\.current = seq;\s*return cue;/.test(app));
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
