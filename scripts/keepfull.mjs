#!/usr/bin/env node
/**
 * Keep full tops up a dish left running, and only when it has run low (PLAN
 * 18a-22; `npm run keepfull`, node, about a second).
 *
 * What was reported. The owner left the player running for an evening on Lava
 * Pop with Evolve off, and the plate emptied. The Mac app that night was
 * 1.3.1751, from before the draught stopped sliding the thin gap's liquid out
 * over its open rim (18a-16) and before Rain Drip and the no-oil rock went
 * through the closed circulation (18a-17); and every look's Evaporation still
 * takes a share of the dye a step. Nothing poured any back unless Evolve was on,
 * and Evolve also stirs, blows, thins and changes the look. Keep Full is the
 * hand on the dropper and nothing else (sim/keepFull.ts says why).
 *
 * This holds the hand's sums (keepFullDose, the one place it decides) and the
 * wiring that makes it the room's switch and nothing more:
 *  1. An empty dish gets a drop, and a hand's full drop or near it; a dish just
 *     under the line a smaller one.
 *  2. Not before the last one could have been seen: none sooner than
 *     KEEP_FULL_FAST_S on an empty dish, KEEP_FULL_SLOW_S just under the line.
 *  3. A full dish gets nothing, and a dish between the lines is left alone
 *     until it falls under KEEP_FULL_LOW, then topped up until KEEP_FULL_HIGH
 *     (the hysteresis, so it does not drip at the line for ever).
 *  4. A look with nothing to keep (target 0) or a measure that is not a
 *     number gets nothing.
 *  5. The visualizer steps it only with `keepFull` on, while playing and not
 *     draining, through the hand's own Drop (dropBottle), on its own dice
 *     (DICE.keep, so Evolve's draws do not move); and it is a room key
 *     (RIG_KEYS), off by default, so no look changes.
 *  6. The desk (both Evolve rows), the settings sheet, the phone and the
 *     phone remote each draw its switch.
 *  0. The control: a dose function that always pours (or never) fails 1–3,
 *     so the lines above can fail.
 *
 * Whether the drops refill a real dish, and how fast Lava Pop loses its dye
 * without them, is the app's question on the Mac: `npm run keepfullapp`.
 */
import { readFileSync } from 'node:fs';
import { keepFullDose, KEEP_FULL_LOW, KEEP_FULL_HIGH, KEEP_FULL_FAST_S, KEEP_FULL_SLOW_S } from '../src/sim/keepFull.ts';
import { RIG_KEYS } from '../src/lib/lookFade.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push(!!ok);
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

/** The sums 1–4 against a dose function, as a list of failures (empty when it holds). */
function holds(dose) {
  const bad = [];
  const T = 0.8;
  const t = () => new Uint8Array(8);
  // 1. Empty, long after the last drop.
  const empty = dose(t(), 0, 0, T, 1e9);
  if (!(empty >= 0.9)) bad.push(`empty dish got ${empty.toFixed(2)} of a drop`);
  const under = dose(t(), 0, T * (KEEP_FULL_LOW - 0.02), T, 1e9);
  if (!(under > 0 && under < empty)) bad.push(`just under the line got ${under.toFixed(2)} (empty ${empty.toFixed(2)})`);
  // 2. Pace.
  if (dose(t(), 0, 0, T, KEEP_FULL_FAST_S * 0.9) > 0) bad.push('an empty dish dropped again before KEEP_FULL_FAST_S');
  if (dose(t(), 0, T * (KEEP_FULL_LOW - 0.02), T, KEEP_FULL_SLOW_S * 0.5) > 0) bad.push('just under the line dropped again well before KEEP_FULL_SLOW_S');
  // 3. Full, and the band between the lines.
  if (dose(t(), 0, T * 1.0, T, 1e9) > 0) bad.push('a full dish got a drop');
  const mid = T * (KEEP_FULL_LOW + KEEP_FULL_HIGH) / 2;
  if (dose(t(), 0, mid, T, 1e9) > 0) bad.push('a dish between the lines, not being topped up, got a drop');
  const run = t();
  dose(run, 0, T * 0.5, T, 1e9);                       // falls under the line: topping starts
  if (!(dose(run, 0, mid, T, 1e9) > 0)) bad.push('topping stopped between the lines, before KEEP_FULL_HIGH');
  dose(run, 0, T * KEEP_FULL_HIGH, T, 1e9);            // back to full: it stops
  if (dose(run, 0, mid, T, 1e9) > 0) bad.push('topping carried on after the dish was full again');
  // 4. Nothing to keep.
  if (dose(t(), 0, 0, 0, 1e9) > 0) bad.push('a look with no target got a drop');
  if (dose(t(), 0, NaN, T, 1e9) > 0) bad.push('a NaN measure got a drop');
  return bad;
}

const bad = holds(keepFullDose);
check('the dose: an empty dish gets a full drop, paced, and a full one nothing (1–4)', bad.length === 0, bad.join('; ') || `low ${KEEP_FULL_LOW}, high ${KEEP_FULL_HIGH}, every ${KEEP_FULL_FAST_S}–${KEEP_FULL_SLOW_S} s`);
const always = holds(() => 1), never = holds(() => 0);
check('control: a dose that always pours, and one that never does, both fail', always.length > 0 && never.length > 0, `${always.length} and ${never.length} failures`);

// 5. The wiring.
const viz = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
const gate = /if \(isActiveRef\.current && drainFrameRef\.current === 0\) \{[^}]*\}\s*if \(currentSettings\.keepFull\) autoEventsRef\.current\.kept \+= stepKeepFull\(/;
check('the visualizer steps it only with Keep Full on, playing and not draining', gate.test(viz) && (viz.match(/stepKeepFull\(/g) ?? []).length === 1);
const mod = readFileSync('src/sim/keepFull.ts', 'utf8');
const hands = mod.slice(mod.indexOf('export function keepFullHands'), mod.indexOf('const tryAim'));
check('its hand aims with its own dice (DICE.keep), never Evolve\'s', hands.length > 200 && /DICE\.keep/.test(hands) && !/DICE\.(evolve|hands|music|lay)/.test(hands)
  && /keepFullRef = useRef\(keepFullState\(\{/.test(viz) && /hands: keepFullHands\(look\)/.test(mod));
check('a top-up is the hand\'s own Drop (dropBottle), not a stamp or a fade', /dropBottle\(af, x, y, KEEP_FULL_DROP \* dose/.test(mod) && !/addDensity|autoInject/.test(mod.replace(/\/\*[\s\S]*?\*\//g, '')));
check('it is the room\'s switch: off by default, kept over a Go (as Song titles and the logo melt are)', DEFAULT_SETTINGS.keepFull === false && RIG_KEYS.has('keepFull'));

// 6. Every surface draws it.
const has = (file, re) => re.test(readFileSync(file, 'utf8'));
const desk = readFileSync('src/components/desk/DeskPanels.tsx', 'utf8');
check('the desk draws it beside both Evolve switches', (desk.match(/testId="toggle-keepfull"/g) ?? []).length === 2 && (desk.match(/testId="toggle-evolve"/g) ?? []).length === 2);
check('the settings sheet, the phone and the phone remote draw it',
  has('src/components/settings/MotionSections.tsx', /onUpdate\(\{ keepFull: v \}\)/)
  && has('src/components/phone/PhonePlay.tsx', /onSetting\(\{ keepFull: !s\.keepFull \}\)/)
  && has('src/components/RemoteControl.tsx', /patch\(\{ keepFull: !value\('keepFull'\) \}\)/));

process.exit(checks.every(Boolean) ? 0 : 1);
