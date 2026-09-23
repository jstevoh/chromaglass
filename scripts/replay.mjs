#!/usr/bin/env node
/**
 * Replay one seeded roll of `npm run evolve` and print the look it rolled.
 *
 *   WANT_ID=fillmore-1969 WANT_K=9 npm run replay > /tmp/look.json
 *   WASH_LOOK=/tmp/look.json npm run wash
 *
 * `evolve` rolls from a seeded generator so a failure can be reproduced. This
 * walks the same sequence without a browser and writes the whole look out —
 * all 136 settings, because the first attempt at reproducing a flat plate
 * picked the nine that looked relevant and measured 7–14% against a reported
 * 96%.
 *
 * It reproduces the *look*, not the plate: `evolve` runs its rolls one after
 * another on one page without clearing, so roll nine inherits whatever rolls
 * zero to eight left on the glass.
 *
 * EVOLVE_SEED and EVOLVE_ROLLS have to match the run being reproduced.
 */
import { PRESETS } from '../src/presets.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { luckyLook } from '../src/lib/lucky.ts';
import { evolvedLook } from '../src/lib/lookFade.ts';

let seed = Number(process.env.EVOLVE_SEED ?? 20260922);
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const LED = ['#ff2d55', '#34c759', '#0a84ff', '#ffd60a'];
const base = (id) => ({ ...DEFAULT_SETTINGS, ...(PRESETS.find(p => p.id === id)?.settings ?? {}) });
const ROLLS = Number(process.env.EVOLVE_ROLLS ?? 20);
const STARTS = ['classic', 'fillmore-1969', 'oil-wheel'];
const WANT_ID = process.env.WANT_ID ?? STARTS[0];
if (!STARTS.includes(WANT_ID)) {
  console.error(`WANT_ID must be one of the start looks: ${STARTS.join(', ')}`);
  process.exit(2);
}
const WANT_K = Number(process.env.WANT_K ?? 9);

for (const startId of STARTS) {
  const from = base(startId);
  for (let k = 0; k < ROLLS; k++) {
    const look = evolvedLook(from, luckyLook(from, LED, rand));
    if (startId === WANT_ID && k === WANT_K) {
      // The whole look, because guessing which nine of the fifty-five matter
      // is how the first attempt at reproducing this measured the wrong plate.
      process.stdout.write(JSON.stringify(look));
      process.exit(0);
    }
  }
}
console.error(`roll ${WANT_K} of ${WANT_ID} was never reached — EVOLVE_ROLLS is ${ROLLS}`);
process.exit(2);
