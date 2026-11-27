#!/usr/bin/env node
/**
 * Which looks carry trapped air (PLAN 33q-4).
 *
 *   npm run lookair      (node; the logic shard)
 *
 * What was reported (the owner, 2026-11-26): too many bubbles in the looks.
 * 33q-1 had already cut the oil beads to about a third, so what was left was
 * the air: Bubbles sat at 0.2 in DEFAULT_SETTINGS, and every look that did
 * not name it carried that 0.2 by inheritance, a galaxy and a reaction in a
 * gel as much as a dish between two glasses. The owner chose (2026-11-27, on
 * the physics board, PLAN.md's physics queue): air on by default only in the
 * looks made for it, off elsewhere, still possible to turn on.
 *
 * Air is trapped when a second glass closes over the liquid, so the looks
 * made for it are the clock-glass sandwich (AIR_LOOKS below; the reasons are
 * at `bubbles` in DEFAULT_SETTINGS), and the moiré pack's looks laid over
 * one of them (presetsMoire.ts: the house look's dish under the sheets). What this measures is what the app
 * lays, not what a file says: each look resolved the way the desk lays it
 * (`targetLook` over a plate that was full of air, so a look that leaves
 * Bubbles out is seen to clear it), and Feeling Lucky's rolls counted.
 *
 *   1. the base a look is laid on has no air (DEFAULT_SETTINGS and LOOK_BASE)
 *   2. every look outside AIR_LOOKS lays Bubbles 0 over a plate at 1, so
 *      going from Lava Pop to Galaxy takes the air away rather than keeping it
 *   3. every look in AIR_LOOKS, and every moiré look over one, still lays
 *      air, at no more than it had (0.2): the owner judged 33q-1's count at
 *      that amount, and this item is which looks, not how many. It is what a
 *      look lays; Evolve may still wander a look's air to twice that and back
 *      (dialWindow in lib/drift.ts), as before
 *   4. the dial is still there to turn air on in a look without it: Bubbles
 *      is pinnable and on the Recipe strip the desk and the phone draw
 *   5. Feeling Lucky rolls air about one look in five, never past 0.3
 *      (it was four in five, at 0.2 to 1), with and without the moiré pack
 *
 * Not measured here: a look the owner saved keeps the air it was saved with
 * (the owner's own file), and a designed show's stages (songDesign.ts, the
 * built-in sequences) still set air over any look, PLAN 33q-5.
 *
 * Printed: how many looks lay air, which, and Lucky's share.
 */
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { PRESETS } from '../src/presets.ts';
import { LOOK_BASE, targetLook } from '../src/lib/lookFade.ts';
import { luckyLook } from '../src/lib/lucky.ts';
import { MOIRE_LOOKS } from '../src/presetsMoire.ts';
import { PIN_RANGE, DEFAULT_RECIPE } from '../src/lib/deskPins.ts';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else failed++; console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

// The clock-glass sandwich: oil and water under a second glass, pressed or kicked.
const AIR_LOOKS = ['classic', 'oil-and-water', 'clock-glass', 'splodascope'];
const BEFORE = 0.2;
// A pack look is its house look's dish under the sheets, so it has the house look's air.
const madeForAir = (id) => AIR_LOOKS.includes(id) || MOIRE_LOOKS.some((m) => m.id === id && AIR_LOOKS.includes(m.from));

const known = AIR_LOOKS.filter((id) => PRESETS.some((p) => p.id === id));
check('every look named for air ships', known.length === AIR_LOOKS.length, AIR_LOOKS.filter((id) => !known.includes(id)).join(', ') || 'all found');

check('1. the base a look is laid on has no air', DEFAULT_SETTINGS.bubbles === 0 && LOOK_BASE.bubbles === 0,
  `DEFAULT_SETTINGS ${DEFAULT_SETTINGS.bubbles}, LOOK_BASE ${LOOK_BASE.bubbles}`);

const full = { ...DEFAULT_SETTINGS, bubbles: 1 };
const laid = PRESETS.map((p) => ({ id: p.id, name: p.name, air: targetLook(full, p.settings).bubbles }));
const stray = laid.filter((l) => !madeForAir(l.id) && l.air !== 0);
check('2. every other look lays no air over a plate full of it', stray.length === 0,
  stray.map((l) => `${l.name} ${l.air}`).join(', ') || `${laid.filter((l) => !madeForAir(l.id)).length} looks at 0`);

const air = laid.filter((l) => madeForAir(l.id));
const want = AIR_LOOKS.length + MOIRE_LOOKS.filter((m) => AIR_LOOKS.includes(m.from)).length;
check('3. the sandwich looks still lay air, no more than before', air.length === want && air.every((l) => l.air > 0 && l.air <= BEFORE),
  air.map((l) => `${l.name} ${l.air}`).join(', '));

{
  const galaxy = PRESETS.find((p) => p.id === 'galaxy');
  check('4. the dial is still there for a look without air', targetLook(full, galaxy.settings).bubbles === 0
    && PIN_RANGE.has('bubbles') && DEFAULT_RECIPE.includes('bubbles'),
    `Galaxy lays ${targetLook(full, galaxy.settings).bubbles}; Bubbles pinnable ${PIN_RANGE.has('bubbles')}, on the Recipe ${DEFAULT_RECIPE.includes('bubbles')}`);
}

for (const pack of [false, true]) {
  // A seeded roll, so the share is the same number every run.
  let s = 0x9e3779b9;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  const N = 4000;
  let withAir = 0, most = 0;
  for (let i = 0; i < N; i++) {
    const b = luckyLook(DEFAULT_SETTINGS, ['#ff0000'], rand, pack).bubbles;
    if (b > 0) withAir++;
    most = Math.max(most, b);
  }
  const share = withAir / N;
  check(`5. Feeling Lucky rolls air about one look in five, a few bubbles (moiré pack ${pack ? 'in' : 'out'})`, share > 0.15 && share < 0.25 && most <= 0.3,
    `${(share * 100).toFixed(1)}% of ${N} rolls, at most ${most.toFixed(2)}`);
}

const any = laid.filter((l) => l.air > 0);
console.log(`\nlooks laying air: ${any.length} of ${laid.length} (${any.map((l) => l.name).join(', ')})`);
console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
