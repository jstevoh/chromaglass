#!/usr/bin/env node
/**
 * A Mixer row taken out over bars, and brought back (PLAN.md §11 step 4).
 *
 *   npm run rowfade   (node only: src/lib/mixFade.ts, and the app's source for the wiring)
 *
 * What was asked: "a level ridden by hand is a fade; a row's own fade time
 * and a cut/fade pad, so a film can come in over two bars from a pad". The
 * plan's check for it is "a node harness on the fade curve, and no hard
 * cuts", and a hard cut is a question with a number in it: how far the level
 * moves in one step of the show timer that drives it. So each fade here is
 * driven the way the app drives it, one call of `step` every 16 ms of a
 * made-up clock, and every level it wrote is kept and read.
 *
 * What each part rules out:
 *
 * - The bars: a fade time in bars that is not two bars at the tempo (a
 *   film over two bars at 120 is four seconds), or a tempo off the end of
 *   the range (a tracker that read 12 bpm between songs) stretching a fade
 *   to forty seconds.
 * - The curve: a fade that starts or lands with a step. A straight line
 *   from 0.4 to 0 over four seconds moves 0.0016 in its first 16 ms, and
 *   the house curve (smoothstep) moves 0.00001; the eye reads the first as
 *   the film starting to go, the second as nothing, which is the point. The
 *   check asks the first and last step to be under a tenth of the steepest,
 *   which a straight line fails by ten times.
 * - No step bigger than the curve's steepest (1.5 times the average) at the
 *   show timer's 16 ms: a fade that jumps anywhere along the way.
 * - Back to where it was: a film at 0.4 taken out comes back at 0.4, and a
 *   row that was never up comes in to 1.
 * - A second press turns round from where it is, without a jump, in the
 *   share of the fade time the distance is: half-way out comes back in half
 *   the time. Without the share, a turn a quarter of the way along crawls
 *   back over the whole four seconds.
 * - The hand wins: a fader moved while a fade runs stops it there, and a
 *   later take-out remembers where the hand left it. Each row's level
 *   setting, by its own name (the film's is `filmMix`, the gel's `gelWheel`).
 * - A fade time of 0 is a cut: set at once, nothing left running.
 * - A Go while a row fades: the look fade laid each step down whole, the
 *   room's settings as they were when Go was pressed, so a film fading out
 *   flickered back to its old level once a look step (63 times in the
 *   control here). Each step now keeps the room as it is (`keepRoom`).
 * - The wiring, read from the source (it cannot be run without the app): a
 *   case for every row's pad, on MIDI and from the remote; the two ways a
 *   hand writes a setting both telling the fades; every one of the four
 *   places the Mixer is drawn handed the take buttons; and each fade time
 *   learnable, pinnable and read out in bars.
 *
 * Held red against twenty broken fades: a straight line for the curve, a
 * turn that takes the whole fade time, a take-in to full and one that forgets
 * the level it took out, a hand that does not stop it, a tempo trusted off
 * the end of the range or under the grid's confidence, a fade time of 0 that
 * walks, a turn that jumps to the end it was heading for, the look fade laid
 * down whole (the control), the Go's step with its two looks swapped or no
 * takes handed it, keepRoom keeping one row, a turned take-in forgetting
 * where it was first taken out, the takes since a Go not remembered, a Back
 * putting back what the hand moved or the whole room, and Lucky not stopping
 * a take.
 *
 * What it does not say: that the wall looks right while a film fades. That
 * is the plate drawing a level it has always drawn, which `npm run mixer`
 * holds (half the level is half the change); the look of a two-bar fade on
 * a real film is owed on the Mac (docs/judging.md §13).
 */
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RowFades, barsToMs, fadeCurve, fadeBarsOf, fadeTempo, LOOK_LEVEL_KEYS, FADE_ROWS, FADE_CONTROLS, FADE_MAX_BARS, DEFAULT_FADE_BARS,
} from '../src/lib/mixFade.ts';
import { MIX_SOURCE_INFO, fadeKey } from '../src/lib/mixer.ts';
import { MIN_BEAT_CONFIDENCE } from '../src/lib/barGrid.ts';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(root, p), 'utf8');

let failed = 0;
let total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const r = (v, n = 4) => Number(v.toFixed(n));

const TICK = 16;

/**
 * Drive the fades the way App's show timer does: `step` every TICK ms until
 * nothing runs or `until` is reached, keeping every value written per row.
 * `level` holds the settings' level as the app's would be (a written value
 * lands before the next tick); `hand` may write a row at a given time.
 */
function drive(fades, level, from, until, events = []) {
  const wrote = {};
  let t = from;
  for (; t <= until; t += TICK) {
    for (const e of events) if (e.at === t) e.do(t);
    const out = fades.step(t);
    for (const [id, v] of Object.entries(out)) {
      (wrote[id] ??= []).push({ t, v });
      level[id] = v;
    }
    if (!Object.keys(fades.running()).length && !events.some(e => e.at > t)) break;
  }
  return { wrote, end: t };
}

// ── The bars ─────────────────────────────────────────────────────────
console.log('\n The bars');
check('two bars at 120 bpm are four seconds', barsToMs(2, 120) === 4000, `${barsToMs(2, 120)} ms`);
check('and at 90 bpm, five and a third', Math.abs(barsToMs(2, 90) - 16000 / 3) < 1e-6, `${r(barsToMs(2, 90), 1)} ms`);
check('with no tempo heard or sent, bars are counted at 120', barsToMs(2, 0) === 4000 && barsToMs(2, NaN) === 4000);
check('a tempo off the end of the range is held to it, not trusted (12 bpm counts as 40, 400 as 240)',
  barsToMs(2, 12) === barsToMs(2, 40) && barsToMs(2, 400) === barsToMs(2, 240), `${barsToMs(2, 12)} ms, ${barsToMs(2, 400)} ms`);
check(`a fade time is 0 to ${FADE_MAX_BARS} bars`, barsToMs(-1, 120) === 0 && barsToMs(99, 120) === barsToMs(FADE_MAX_BARS, 120));

check('the tempo sent or tapped counts first, then the one heard (a beat of 0.5 s is 120), and a beat the grid is unsure of does not count',
  fadeTempo(97, 0.5, 1) === 97 && fadeTempo(0, 0.5, 1) === 120 && fadeTempo(0, 0.5, 0) === 0 && fadeTempo(0, 0.5, 0.1) === 0 && fadeTempo(0, 0.5, MIN_BEAT_CONFIDENCE) === 120 && barsToMs(2, fadeTempo(0, 0.5, 1)) === 4000
    && barsToMs(2, fadeTempo(0, 0.6, 1)) === 4800,
  `sent 97 → ${fadeTempo(97, 0.5, 1)}; heard 0.5 s → ${fadeTempo(0, 0.5, 1)}, two bars ${barsToMs(2, fadeTempo(0, 0.5, 1))} ms; heard 0.6 s → ${Math.round(barsToMs(2, fadeTempo(0, 0.6, 1)))} ms; unsure (0, and 0.1 under the grid's ${MIN_BEAT_CONFIDENCE}) → ${fadeTempo(0, 0.5, 0)}, ${fadeTempo(0, 0.5, 0.1)}`);
{
  const own = FADE_ROWS.filter(id => fadeBarsOf({ [fadeKey(id)]: 5.5 }, id) !== 5.5
    || FADE_ROWS.some(o => o !== id && fadeBarsOf({ [fadeKey(o)]: 5.5 }, id) !== DEFAULT_FADE_BARS));
  check('each row counts its own fade time and no other row\'s, and a rig saved before them counts two bars', own.length === 0 && fadeBarsOf({}, 'film') === DEFAULT_FADE_BARS,
    own.join(', ') || FADE_ROWS.map(id => String(fadeKey(id))).join(', '));
}

// ── The curve ────────────────────────────────────────────────────────
console.log('\n The curve');
const ks = Array.from({ length: 1001 }, (_, i) => i / 1000);
const cs = ks.map(fadeCurve);
check('it runs from 0 to 1 and never turns back', cs[0] === 0 && cs[1000] === 1 && cs.every((c, i) => !i || c >= cs[i - 1]));
check('and is the same going out as coming in', ks.every(k => Math.abs(fadeCurve(k) + fadeCurve(1 - k) - 1) < 1e-12));

// ── A film taken out over two bars, and brought back ────────────────
console.log('\n A film at 0.4 taken out over two bars at 120 bpm, driven at the show timer\'s 16 ms');
{
  const fades = new RowFades();
  const level = { film: 0.4 };
  const ms = barsToMs(2, 120);
  const first = fades.press('film', level.film, ms, 0);
  check('the press writes nothing at once: the level is where it was', first === 0.4);
  check('and the row is fading out', fades.running().film === 'out');
  const { wrote } = drive(fades, level, TICK, 10000);
  const list = wrote.film ?? [];
  const last = list[list.length - 1];
  const reached = list.find(p => p.v === 0);
  check('it lands at exactly 0, on time', last?.v === 0 && reached && Math.abs(reached.t - ms) <= TICK,
    `at ${reached?.t} ms of ${ms}`);
  const ds = list.map((p, i) => Math.abs(p.v - (i ? list[i - 1].v : 0.4)));
  const steepest = 1.5 * 0.4 * TICK / ms;
  const worst = Math.max(...ds);
  check('no step anywhere is bigger than the curve\'s steepest', worst <= steepest + 1e-9,
    `largest ${r(worst, 5)} against ${r(steepest, 5)} (a cut would be 0.4)`);
  check('it leaves and lands at rest: the first and last steps are under a tenth of the steepest (a straight line\'s are two thirds)',
    ds[0] < steepest / 10 && ds[ds.length - 1] < steepest / 10, `${r(ds[0], 6)} and ${r(ds[ds.length - 1], 6)}`);
  check('nothing is left running', !fades.isFading('film'));

  fades.press('film', level.film, ms, 20000);
  const back = drive(fades, level, 20000 + TICK, 30000).wrote.film ?? [];
  check('pressed again, it comes back to 0.4, where it was, not to full', back[back.length - 1]?.v === 0.4,
    `ends at ${back[back.length - 1]?.v}`);
}
{
  const fades = new RowFades();
  const level = { mark: 0 };
  fades.press('mark', 0, 1000, 0);
  drive(fades, level, TICK, 5000);
  check('a row that was never up comes in to 1', level.mark === 1, `${level.mark}`);
}

// ── A second press turns it round ────────────────────────────────────
console.log('\n Pressed again part-way');
for (const at of [2000, 1008]) {
  const fades = new RowFades();
  const level = { film: 0.4 };
  const ms = 4000;
  fades.press('film', 0.4, ms, 0);
  let turned = null;
  const { wrote } = drive(fades, level, TICK, 20000, [{ at, do: (t) => { turned = { t, v: level.film, first: fades.press('film', level.film, ms, t) }; } }]);
  const list = wrote.film;
  const after = list.filter(p => p.t >= at);
  const jump = Math.max(...after.map((p, i) => Math.abs(p.v - (i ? after[i - 1].v : turned.v))));
  const done = after.find(p => p.v === 0.4);
  // Measured from where the walk is at the press (what `press` returns), which
  // is a tick past the level last written, as it is in the app.
  const share = (0.4 - turned.first) / 0.4;
  const took = done ? done.t - at : Infinity;
  check(`turned at ${at} ms (${r(turned.v, 3)}), it goes back in from there without a jump`,
    jump <= Math.max(1.5 * 0.4 * TICK / ms, 1.5 * (0.4 - turned.first) * TICK / (ms * share)) + 1e-6,
    `largest step ${r(jump, 5)}, the press ${r(Math.abs(turned.first - turned.v), 5)} from the last level written`);
  check(`and is back at 0.4 in its share of the fade time (${Math.round(share * 100)} %, ${Math.round(ms * share)} ms)`,
    Math.abs(took - ms * share) <= TICK, `${took} ms`);
}

{
  // A row coming in from nothing, with nothing remembered (the gel and the
  // lumia, whose level a look sets, are usually this), turned a quarter of
  // the time in: it has a sixth of the way to go back, not all of it.
  const fades = new RowFades();
  const level = { gel: 0 };
  const ms = 4000;
  fades.press('gel', 0, ms, 0);
  let turned = null;
  const { wrote } = drive(fades, level, TICK, 20000, [{ at: 992, do: (t) => { turned = { t, v: level.gel }; fades.press('gel', level.gel, ms, t); } }]);
  const done = (wrote.gel ?? []).find(p => p.t > 992 && p.v === 0);
  const share = turned.v / 1;
  check(`a row coming in from nothing, turned at ${r(turned.v, 3)}, is back at 0 in its share of the fade time (${Math.round(share * 100)} %)`,
    done && Math.abs(done.t - 992 - ms * share) <= 2 * TICK, `${done ? done.t - 992 : 'never'} ms against ${Math.round(ms * share)}`);
}
{
  // Taken out from 0.4, brought back in, turned out again part-way in, and
  // pressed a third time: it comes back to 0.4, the level it was first taken
  // out from, not to where the turn caught it on the way in.
  const fades = new RowFades();
  const level = { film: 0.4 };
  fades.press('film', 0.4, 1000, 0);
  drive(fades, level, TICK, 3000);
  fades.press('film', level.film, 1000, 4000);
  drive(fades, level, 4000 + TICK, 4400);
  const caught = level.film;
  fades.press('film', level.film, 1000, 4416);
  drive(fades, level, 4416 + TICK, 8000);
  const outAgain = level.film;
  fades.press('film', level.film, 1000, 9000);
  drive(fades, level, 9000 + TICK, 12000);
  check(`taken out, brought in, turned out at ${r(caught, 3)} and brought in again, it comes back to 0.4, where it was first taken out`,
    caught > 0 && caught < 0.4 && outAgain === 0 && level.film === 0.4, `out to ${outAgain}, back to ${level.film}`);
}
{
  const fades = new RowFades();
  const level = { gel: 0.7 };
  fades.press('gel', 0.7, 500, 0);
  drive(fades, level, TICK, 3000);
  fades.forget(['gel']);
  fades.press('gel', 0, 500, 5000);
  drive(fades, level, 5000 + TICK, 8000);
  check('a row forgotten (a new look\'s gel) comes in to 1, not to the level it was taken out from in the look before', level.gel === 1, `${level.gel}`);
}

// ── The hand wins ────────────────────────────────────────────────────
console.log('\n The hand wins');
{
  const fades = new RowFades();
  const level = { film: 0.8, led: 1 };
  fades.press('film', 0.8, 4000, 0);
  fades.press('led', 1, 4000, 0);
  const { wrote } = drive(fades, level, TICK, 20000, [{ at: 1008, do: () => { level.film = 0.55; fades.handOn(['filmMix']); } }]);
  const afterHand = (wrote.film ?? []).filter(p => p.t >= 1008);
  check('a fader on the film stops its fade where the hand put it', afterHand.length === 0 && level.film === 0.55 && !fades.isFading('film'),
    `${afterHand.length} writes after the hand; film at ${level.film}`);
  check('and leaves the LED ring\'s fade running to its end', level.led === 0, `led at ${level.led}`);
  fades.press('film', level.film, 1000, 30000);
  drive(fades, level, 30000 + TICK, 40000);
  fades.press('film', level.film, 1000, 50000);
  drive(fades, level, 50000 + TICK, 60000);
  check('a later take-out remembers where the hand left it, and brings it back there', r(level.film) === 0.55, `${level.film}`);
}
{
  const bad = FADE_ROWS.filter(id => {
    const fades = new RowFades();
    fades.press(id, 1, 1000, 0);
    fades.handOn(['dimmer', 'filmBright', `${id}Fade`]);
    if (!fades.isFading(id)) return true;
    fades.handOn([String(MIX_SOURCE_INFO[id].level)]);
    return fades.isFading(id);
  });
  check('each row\'s own level setting is the one that stops it, and nothing else does', bad.length === 0,
    bad.length ? bad.join(', ') : FADE_ROWS.map(id => String(MIX_SOURCE_INFO[id].level)).join(', '));
}

// ── Zero bars is a cut ───────────────────────────────────────────────
console.log('\n A cut');
{
  const fades = new RowFades();
  const out = fades.press('back', 0.7, barsToMs(0, 120), 0);
  const back = fades.press('back', out, barsToMs(0, 120), 16);
  check('at a fade time of 0 the press sets the level at once, out and back, and leaves nothing running',
    out === 0 && back === 0.7 && !fades.isFading('back'), `${out} then ${back}`);
}

// ── A Go while a row fades ───────────────────────────────────────────
/*
  The look fade (App's fadeSettingsTo) steps the whole settings from the plate
  as it was when Go was pressed towards the new look, thirty times a second.
  The room's settings are the same at both ends, so each step laid down whole
  put a row's level back to where it was at the Go, every step, and a film
  taken out from its button during a Go flickered between where it was going
  and where it had been at the Go, once a look step, until the Go ended.
  And the gel wheel's and the lumia's levels are the look's, so a take on
  either pressed while a Go ran had the two timers writing one setting and the
  Go won: 63 steps back up in the check-skeptic's run, then the new look's
  level, the take undone.

  Driven here as the app drives both, with the app's own step (lookFade's
  lookStep, which the Go's timer calls, and RowFades' levelsTakenSince, which
  it hands it): the look fade's step every 32 ms, the row fade's every 16 ms,
  each writing into one settings object. Every row, not one standing in for
  them: the room's rows taken before the Go, the look's rows during it. The
  control for each is the step laid down whole, as it was.
*/
const lookOut = join(tmpdir(), `rowfade-look-${process.pid}.mjs`);
await build({
  stdin: { contents: "export { blendLooks, targetLook, keepRoom, lookStep, roomMoved, roomBack, RIG_KEYS } from './src/lib/lookFade.ts'; export { DEFAULT_SETTINGS } from './src/types.ts'; export { PRESETS } from './src/presets.ts';", resolveDir: root, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: lookOut, logLevel: 'warning',
});
const { blendLooks, targetLook, keepRoom, lookStep, roomMoved, roomBack, RIG_KEYS, DEFAULT_SETTINGS, PRESETS } = await import(lookOut);
rmSync(lookOut, { force: true });
console.log('\n A Go while a row fades');
{
  const levels = FADE_ROWS.map(id => String(MIX_SOURCE_INFO[id].level));
  const lookOwned = levels.filter(k => !RIG_KEYS.has(k));
  check('the levels a look sets are the gel wheel\'s and the lumia\'s, and no other row\'s (the rest are the room\'s)',
    lookOwned.join() === [...LOOK_LEVEL_KEYS].join(), `look: ${lookOwned.join(', ')}; listed: ${LOOK_LEVEL_KEYS.join(', ')}`);
  const other = PRESETS.find(p => p.settings && Object.keys(p.settings).length > 10)?.settings ?? { speed: 0.2 };
  // Both on the 16 ms grid the timers step on, or the press never lands.
  const GO_AT = 1024;
  const go = (id, withStep) => {
    const key = String(MIX_SOURCE_INFO[id].level);
    const lookRow = LOOK_LEVEL_KEYS.includes(key);
    let now = { ...DEFAULT_SETTINGS, [key]: 0.7 };
    const fades = new RowFades();
    // The room's rows are taken before the Go, the look's (which a Go
    // coming in stops) part-way through it.
    const pressAt = lookRow ? GO_AT + 480 : 0;
    let from = null;
    let to = null;
    const seen = [];
    for (let t = 0; t <= 6000; t += 16) {
      if (t === pressAt) fades.press(id, now[key], 2000, t);
      if (t >= GO_AT && t % 32 === 0) {
        if (!from) { from = now; to = targetLook(now, { ...other, [key]: 0.55 }); }
        const k = Math.min(1, (t - GO_AT) / 3000);
        now = withStep ? lookStep(from, to, k, now, fades.levelsTakenSince(GO_AT)) : (k >= 1 ? to : blendLooks(from, to, k));
        seen.push(now[key]);
      }
      const out = fades.step(t);
      if (out[id] !== undefined) now = { ...now, [key]: out[id] };
      if (t >= pressAt) seen.push(now[key]);
    }
    const ups = seen.filter((v, i) => i && v > seen[i - 1] + 1e-9).length;
    return { ups, end: seen[seen.length - 1] };
  };
  const rows = FADE_ROWS.map(id => ({ id, kept: go(id, true), control: go(id, false) }));
  const bad = rows.filter(x => x.kept.ups !== 0 || x.kept.end !== 0 || x.control.ups < 10);
  check('through a Go, every row taken out walks down to 0 and never back up, even between the two timers\' writes: the room\'s taken before it, the gel\'s and the lumia\'s during it (laid down whole, each step of the Go puts it back)',
    bad.length === 0,
    rows.map(x => `${x.id} ${x.kept.ups} up, ends ${r(x.kept.end, 3)} (whole: ${x.control.ups} up, ends ${r(x.control.end, 3)})`).join(' · '));
  const room = keepRoom({ ...DEFAULT_SETTINGS, filmMix: 0.9, gelWheel: 0.3 }, { ...DEFAULT_SETTINGS, filmMix: 0.2, gelWheel: 0.8 });
  check('and the look\'s own settings still come from the look', room.filmMix === 0.2 && room.gelWheel === 0.3, `film ${room.filmMix}, gel ${room.gelWheel}`);
  // The step itself: from the old look at 0, the new one at 1, half-way
  // between, and nothing the look does not own nor a take held is kept.
  const a = { ...DEFAULT_SETTINGS, gelWheel: 0.1, lumia: 0.2 };
  const b = { ...DEFAULT_SETTINGS, gelWheel: 0.9, lumia: 0.8 };
  const s0 = lookStep(a, b, 0, a);
  const s1 = lookStep(a, b, 1, a);
  const sh = lookStep(a, b, 0.5, a);
  const held = lookStep(a, b, 0.5, { ...a, lumia: 0.33 }, ['lumia']);
  check('a Go\'s step starts from the old look, lands on the new, passes between them, and keeps only the rows it is told were taken',
    s0.gelWheel === 0.1 && s1.gelWheel === 0.9 && sh.gelWheel > 0.1 && sh.gelWheel < 0.9 && s1.lumia === 0.8 && held.lumia === 0.33 && held.gelWheel === sh.gelWheel,
    `gel ${s0.gelWheel} → ${r(sh.gelWheel, 3)} → ${s1.gelWheel}; lumia held at ${held.lumia}`);
  /*
    A Back undoes the change, not the hand: the room's settings the change
    itself moved (Lucky rolls the microphone's, which are the room's) go back
    where the hand has left them since, and a room setting the hand moved
    after it stays. Kept through the fade, the first version of this step
    left Lucky's roll in place on Back.
  */
  const before = { ...DEFAULT_SETTINGS, sensitivity: 0.5, bassBoost: 1, speed: 0.3 };
  const lucky = { ...before, sensitivity: 0.9, bassBoost: 1.6, speed: 0.8 };
  const moved = roomMoved(before, lucky);
  const back = roomBack(moved, { ...lucky, bassBoost: 1.2 });
  check('a Back puts back the room a change moved by itself (Lucky\'s microphone), not what the hand moved since, and nothing of the look',
    Object.keys(moved.before).sort().join() === 'bassBoost,sensitivity' && JSON.stringify(back) === '{"sensitivity":0.5}',
    `moved ${Object.keys(moved.before).join(', ')}; put back ${JSON.stringify(back)}`);
  const f = new RowFades();
  f.press('gel', 0.5, 1000, 100);
  f.press('film', 0.5, 1000, 900);
  check('the rows taken since a Go began are the ones pressed at or after it, running or landed',
    f.levelsTakenSince(500).join() === 'filmMix' && f.levelsTakenSince(100).sort().join() === 'filmMix,gelWheel', `${f.levelsTakenSince(500).join()}`);
}

// ── The wiring ───────────────────────────────────────────────────────
console.log('\n The wiring (read from the source)');
const app = src('src/App.tsx');
const midi = src('src/lib/midi.ts');
const proto = src('src/lib/remoteProtocol.ts');
const missingPad = FADE_ROWS.filter(id => !new RegExp(`case 'mix-fade-${id}':\\s+fadeRow\\('${id}'\\)`).test(app));
check('every row\'s pad runs its own row\'s fade', missingPad.length === 0, missingPad.join(', ') || `${FADE_ROWS.length} pads`);
// The remote's own switch, not the whole App: runAction's cases above
// would answer for it otherwise.
const remoteSwitch = app.slice(app.indexOf('switch (message.action)'), app.indexOf("unhandled('an action from the phone'"));
const missingRemote = FADE_ROWS.filter(id => !proto.includes(`'mix-fade-${id}'`) || !remoteSwitch.includes(`case 'mix-fade-${id}':`));
const remoteCase = remoteSwitch.length > 0 && /case 'mix-fade-mark':\s*\n\s*fadeRow\(message\.action\.slice\('mix-fade-'\.length\)/.test(remoteSwitch);
check('and so does the remote\'s, for each of them', missingRemote.length === 0 && remoteCase, missingRemote.join(', '));
const missingMidi = FADE_ROWS.filter(id => !new RegExp(`'mix-fade-${id}': 'Mixer: Fade In/Out, `).test(midi));
const notOnBeat = midi.slice(midi.indexOf('const NOT_ON_A_BEAT'), midi.indexOf('export const triggerable'));
const onBeat = FADE_ROWS.filter(id => !notOnBeat.includes(`'mix-fade-${id}'`));
check('each pad is named on the MIDI sheet and is not fired on a beat (a fade turned round every kick hangs half-way)',
  missingMidi.length === 0 && onBeat.length === 0, [...missingMidi, ...onBeat.map(id => `${id} on a beat`)].join(', '));
const update = app.slice(app.indexOf('const updateSettings ='), app.indexOf('const applyPreset ='));
const ride = app.slice(app.indexOf('const rideSetting ='), app.indexOf('const rideSetting =') + 600);
check('both of the hand\'s ways into the settings tell the fades (a slider or the remote, a MIDI fader)',
  /handOnLevels\(Object\.keys\(newSettings\)\)/.test(update) && /rowFades\.handOn\(\[String\(key\)\]\)/.test(ride));
const prepare = app.slice(app.indexOf('prepare: () =>'), app.indexOf('const songRender ='));
check('a render drops the fades on its way in and out, as it drops the other timed walks',
  (prepare.match(/rowFades\.clear\(\)/g) ?? []).length === 2);
const lookFadeSrc = app.slice(app.indexOf('const fadeSettingsTo ='), app.indexOf('const sendLook ='));
const presetSrc = app.slice(app.indexOf('const applyPreset ='), app.indexOf('const applyPreset =') + 300);
const userPresetSrc = app.slice(app.indexOf('const applyUserPreset ='), app.indexOf('const applyUserPreset =') + 500);
const luckySrc = app.slice(app.indexOf('const triggerLucky ='), app.indexOf('const triggerLucky =') + 600);
const newSrc = app.slice(app.indexOf('const newLook ='), app.indexOf('const newLook =') + 500);
const revertSrc = app.slice(app.indexOf('const revertLook ='), app.indexOf('const revertLook =') + 800);
check('every look that comes in stops a take on the gel and the lumia (a preset, a saved look, Lucky), New drops every take, and Back puts back the room Lucky rolled',
  [presetSrc, userPresetSrc, luckySrc].every(s => /lookTakesLevels\(\)/.test(s))
  && /rowFades\.clear\(\)/.test(newSrc) && /rowFades\.forget\(FADE_ROWS\)/.test(newSrc) && /setRowFading\(\{\}\)/.test(newSrc)
  && /room: roomMoved\(settingsRef\.current, next\)/.test(luckySrc) && /roomBack\(prev\.room, settingsRef\.current\)/.test(revertSrc));
check('a Go, a Back and a new song\'s look lay each step down through lookStep, from the old look to the new, over the room and the rows taken since it began; and a look coming in stops a take on the gel and the lumia',
  (lookFadeSrc.match(/setSettings\(prev => lookStep\(from, to, /g) ?? []).length === 3
  && (lookFadeSrc.match(/lookStep\(from, to, (t|1), prev, taken\)/g) ?? []).length === 2
  && /const taken = rowFades\.levelsTakenSince\(started\)/.test(lookFadeSrc)
  && !/setSettings\((to|blendLooks|keepRoom)/.test(lookFadeSrc) && !/prev => (keepRoom|blendLooks)/.test(lookFadeSrc)
  && /lookTakesLevels\(\)/.test(lookFadeSrc) && /lookTakesLevels\(\)/.test(presetSrc) && /handOnLevels\(LOOK_LEVEL_KEYS\)/.test(app));
const glideSrc = app.slice(app.indexOf('const glideSetting = useCallback'), app.indexOf('const glideSetting = useCallback') + 900);
check('a song\'s glide and a sequence stage\'s writes stop a take on the levels they write, and a take stops a glide',
  /handOnLevels\(\[String\(key\)/.test(glideSrc) && /applySettings: \(patch\) => \{ handOnLevels\(Object\.keys\(patch\)\)/.test(app)
  && /glidesRef\.current\.get\(levelKey\)/.test(app.slice(app.indexOf('const fadeRow ='), app.indexOf('const fadeRow =') + 1500)));
check('a new look forgets where its gel and lumia were taken out from; a render leaves no button lit; the bars are counted at fadeTempo',
  /rowFades\.forget\(\['gel', 'lumia'\]\)/.test(app) && (prepare.match(/setRowFading\(\{\}\)/g) ?? []).length === 2 && /fadeTempo\(tempoRef\.current\?\.bpm/.test(app));
const mounts = {
  'the Perform desk': /<MixerPanel [^>]*onFade=\{p\.takes\?\.onFade\}/.test(src('src/components/desk/PerformDesk.tsx'))
    && /<MixerPanel [^>]*fading=\{p\.takes\?\.fading\}/.test(src('src/components/desk/PerformDesk.tsx')) && /takes=\{mixTakes\}/.test(app),
  'Settings': /onFade=\{mixTakes\?\.onFade\}/.test(src('src/components/SettingsPanel.tsx'))
    && /fading=\{mixTakes\?\.fading\}/.test(src('src/components/SettingsPanel.tsx')) && /mixTakes=\{mixTakes\}/.test(app),
  'the phone': /onFade=\{p\.mixer\.takes\?\.onFade\}/.test(src('src/components/phone/PhoneStage.tsx'))
    && /fading=\{p\.mixer\.takes\?\.fading\}/.test(src('src/components/phone/PhoneStage.tsx')) && /takes: mixTakes/.test(app),
  'the remote, lit from the display\'s state': /onFade=\{\(id\) => action\(`mix-fade-\$\{id\}`/.test(src('src/components/RemoteControl.tsx'))
    && /fading=\{state\?\.rowFading\}/.test(src('src/components/RemoteControl.tsx')) && /\browFading,\n/.test(app),
};
const unmounted = Object.entries(mounts).filter(([, ok]) => !ok).map(([k]) => k);
check('all four places the Mixer is drawn have the take buttons', unmounted.length === 0, unmounted.join(', ') || Object.keys(mounts).join(', '));
const panelSrc = src('src/components/MixerPanel.tsx');
check('and the drawer has each row\'s fade time', /slider\(fadeKey\(id\), 'Fade time'\)/.test(panelSrc));
const learn = new Set([...midi.matchAll(/\.\.\.FADE_CONTROLS/g)].length ? FADE_CONTROLS.map(c => String(c.key)) : []);
const pins = src('src/lib/deskPins.ts');
const unlearned = FADE_ROWS.filter(id => !learn.has(String(fadeKey(id))));
check('each fade time is learnable on MIDI and pinnable in the Mixer section, over 0 to 8 bars',
  unlearned.length === 0 && /FADE_CONTROLS\.map\(c => \[String\(c\.key\), 'mixer'\]\)/.test(pins)
  && FADE_CONTROLS.every(c => c.min === 0 && c.max === FADE_MAX_BARS), unlearned.join(', '));
const types = src('src/types.ts');
const defaults = FADE_ROWS.filter(id => !new RegExp(`\\b${id}Fade: ${DEFAULT_FADE_BARS}\\b`).test(types));
check(`every row starts at ${DEFAULT_FADE_BARS} bars`, defaults.length === 0, defaults.join(', '));

console.log(`\n${total - failed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
