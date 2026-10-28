#!/usr/bin/env node
/**
 * `npm run platekick`: the plate takes every kick on its next step
 * (lib/plateKick.ts, PLAN 30a-3).
 *
 * What was found: the beat clock decides a kick once a frame, and everything a
 * kick does to the plate was laid on the frame's first solver step, so a kick
 * decided on a frame that took no step was dropped. On the Mac runner 16 of 41
 * kicks pressed in the squeeze check's window at Beat Squeeze 0.8.
 *
 * The hold's own rules, on a clock this script turns (`npm run squeeze` asks the
 * same of the app on the Mac, where the plate steps): a kick on a stepless
 * frame is taken by the next frame that steps; a slow frame never drops the
 * kick it decided; a kick no step comes for in KICK_OWED_MS is let go and
 * never laid late; two kicks before a step are one lost and the later taken,
 * with the later's song time and lead. And the wiring: the app decides on the
 * clock's kick with the song clock and the clock's lead, asks once a frame
 * before the step loop, and every kick reaction in the loop reads that answer.
 */
import { readFileSync } from 'node:fs';
import { PlateKick, KICK_OWED_MS } from '../src/lib/plateKick.ts';

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? ' ok  ' : ' FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// A 120 Hz display, the plate stepping on every fourth frame (thirty a second).
{
  const k = new PlateKick();
  const frames = 4000, laid = [];
  let decided = 0;
  for (let f = 0; f < frames; f++) {
    const now = f * 1000 / 120;
    if (f % 48 === 1 + (f / 48 | 0) % 4) { k.decide(now / 1000, false, now); decided++; }   // every 0.4 s, on each of the four phases in turn
    if (k.take(f % 4 === 0, now)) laid.push(f);
  }
  check('at thirty steps on a 120 Hz screen, every kick is laid on a step', laid.length === decided && k.lost === 0 && laid.every((f) => f % 4 === 0),
    `${laid.length} laid of ${decided} decided, ${k.lost} let go`);
}
{
  const k = new PlateKick();
  k.decide(1, false, 0);
  check('a kick on a frame that steps is laid on that frame', k.take(true, 0) && k.taken === 1);
}
{
  const k = new PlateKick();
  k.decide(1, false, 0);
  check('a slow frame never drops the kick it decided', k.take(true, 5 * KICK_OWED_MS) && k.lost === 0,
    `taken after a ${5 * KICK_OWED_MS} ms frame`);
}
{
  const k = new PlateKick();
  k.decide(1, false, 0);
  const first = k.take(false, 0);
  const stalled = k.take(false, KICK_OWED_MS + 1);
  const after = k.take(true, KICK_OWED_MS + 20);
  check('a kick no step comes for in time is let go, and never laid late', !first && !stalled && !after && k.lost === 1 && k.taken === 0 && !k.owed);
}
{
  const k = new PlateKick();
  k.decide(1, false, 0);
  k.take(false, 0);
  k.decide(1.4, true, 40);
  const took = k.take(true, 40);
  check('two kicks before a step: the first let go, the later laid with its own time and lead',
    took && k.lost === 1 && k.taken === 1 && k.at === 1.4 && k.predicted === true);
}

{
  // The accent's beat: a predicted kick means the beat its lead on, a heard one the beat now.
  const k = new PlateKick();
  k.decide(10, true, 0);
  const ahead = k.meant(80);
  k.decide(10, false, 0);
  check('a predicted kick means the beat its lead ahead, a heard one the beat it was heard on',
    Math.abs(ahead - 10.08) < 1e-9 && k.meant(80) === 10 && k.meant(undefined) === 10,
    `${ahead.toFixed(3)} and ${k.meant(80).toFixed(3)} s for kicks decided at 10 s with an 80 ms lead`);
}

const vis = readFileSync(new URL('../src/components/LiquidVisualizer.tsx', import.meta.url), 'utf8');
const loop = vis.indexOf('for (let simStep = 0; simStep < simSteps; simStep++)');
const ASK = 'const kickNow = plateKick.take(simSteps > 0, showNow());';
const ask = vis.indexOf(ASK);
check('the app holds the clock\'s kick with the song clock and the clock\'s lead',
  /if \(kickRef\.current\.kick\) plateKickRef\.current\.decide\(songClockRef\.current, kickRef\.current\.predicted, nowMs\);/.test(vis));
check('and asks once a frame, before the step loop', ask > 0 && loop > ask && vis.indexOf('.take(simSteps', ask + ASK.length) < 0);
const left = (vis.match(/kickRef\.current\.kick && simStep === 0/g) ?? []).length;
const reads = (vis.match(/kickNow && simStep === 0/g) ?? []).length;
check('and every kick reaction in the step loop reads that answer', left === 0 && reads >= 3,
  `${reads} read it, ${left} still read the frame's own kick`);

console.log(failed ? `\n${failed} line(s) failed` : '\nall lines pass');
process.exit(failed ? 1 : 0);
