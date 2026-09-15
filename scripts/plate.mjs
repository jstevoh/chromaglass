#!/usr/bin/env node
/**
 * Does every preset actually say what is on its plate — and is any of it real?
 *
 *   npm run plate
 *
 * Three maps in `src/presetPlate.ts` decide what a preset looks like before a
 * single frame is drawn: which dyes it may use, how the automation puts them
 * on the glass, and what liquid they are. All three are keyed by preset id as
 * a plain string, which is a design that works right up until someone writes
 * `'sillicone'` — and then that preset quietly has no liquid in it, forever,
 * with no error anywhere and nothing on screen that looks broken. It just
 * never does the thing it was supposed to do.
 *
 * That is the failure this catches. The rest is an audit: every preset in the
 * app is listed with what is in its dish, and the four liquids that carry
 * behaviour each have to be used by something, because a liquid nothing pours
 * is a menu entry rather than a feature.
 *
 * Unlike the other harnesses this one is bundled by esbuild before it runs,
 * because it reaches into app modules that import each other and Node's own
 * type-stripping cannot tell a type-only import from a value one.
 */

import { PRESETS } from '../src/presets.ts';
import { PRESET_CONTRACTS, PRESET_INJECT_STYLES, PRESET_LIQUIDS } from '../src/presetPlate.ts';
import { DEFAULT_LIQUID_TYPES } from '../src/types.ts';
import { PALETTE } from '../src/constants.ts';

const STYLES = ['drop', 'pour', 'spray', 'splatter', 'streak'];
/** Keys that are a plate but not a preset in the menu. */
const NOT_A_PRESET = new Set(['fillmore-wash']);

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const ids = PRESETS.map(p => p.id);
const liquidIds = new Set(DEFAULT_LIQUID_TYPES.map(l => l.id));
const behaviourOf = new Map(DEFAULT_LIQUID_TYPES.map(l => [l.id, l.behaviour]));

// ── 1. Nothing names a preset that isn't there ───────────────────────
{
  const stray = [];
  for (const [map, name] of [[PRESET_CONTRACTS, 'contracts'], [PRESET_INJECT_STYLES, 'styles'], [PRESET_LIQUIDS, 'liquids']]) {
    for (const key of Object.keys(map)) {
      if (!ids.includes(key) && !NOT_A_PRESET.has(key)) stray.push(`${name}:${key}`);
    }
  }
  check('every key is a preset that exists', stray.length === 0, stray.join(', '));
}

// ── 2. Every preset is fully described ───────────────────────────────
{
  const missing = { contract: [], styles: [], liquids: [] };
  for (const id of ids) {
    if (!PRESET_CONTRACTS[id]) missing.contract.push(id);
    if (!PRESET_INJECT_STYLES[id]) missing.styles.push(id);
    if (!PRESET_LIQUIDS[id]) missing.liquids.push(id);
  }
  check('every preset names its dyes', missing.contract.length === 0, missing.contract.join(', '));
  check('every preset names its injection styles', missing.styles.length === 0, missing.styles.join(', '));
  check('every preset names what is in the dish', missing.liquids.length === 0, missing.liquids.join(', '));
}

// ── 3. And names things that exist ───────────────────────────────────
{
  const badDye = [], badStyle = [], badLiquid = [];
  for (const [id, c] of Object.entries(PRESET_CONTRACTS))
    for (const i of c) if (!Number.isInteger(i) || i < 0 || i >= PALETTE.length) badDye.push(`${id}:${i}`);
  for (const [id, ss] of Object.entries(PRESET_INJECT_STYLES))
    for (const st of ss) if (!STYLES.includes(st)) badStyle.push(`${id}:${st}`);
  for (const [id, ls] of Object.entries(PRESET_LIQUIDS))
    for (const l of ls) if (!liquidIds.has(l)) badLiquid.push(`${id}:${l}`);
  check('every dye index is in the palette', badDye.length === 0, badDye.join(', '));
  check('every injection style is one the solver knows', badStyle.length === 0, badStyle.join(', '));
  // The one that matters: a typo here is silent at runtime.
  check('every liquid named is a liquid that exists', badLiquid.length === 0, badLiquid.join(', '));
}

// ── 4. Each liquid that does something is actually poured ────────────
{
  const behavioural = DEFAULT_LIQUID_TYPES.filter(l => l.behaviour).map(l => l.id);
  const used = new Set(Object.values(PRESET_LIQUIDS).flat());
  const unused = behavioural.filter(id => !used.has(id));
  check('every liquid with physics in it is used by some preset', unused.length === 0, unused.join(', '));
}

// ── 5. The audit ─────────────────────────────────────────────────────
console.log('');
console.log('     what is on each plate:');
let withPhysics = 0;
for (const p of PRESETS) {
  const ls = PRESET_LIQUIDS[p.id] ?? [];
  const does = ls.filter(l => behaviourOf.get(l));
  if (does.length) withPhysics++;
  const chance = ls.length ? `${Math.round(does.length / ls.length * 100)}%` : '—';
  console.log(`       ${p.id.padEnd(20)} ${ls.join(', ').padEnd(28)} ${chance.padStart(4)} of doses do something`);
}
console.log('');
console.log(`     ${withPhysics}/${PRESETS.length} presets carry a liquid that changes the plate`);
check('most of the app takes advantage of them', withPhysics >= PRESETS.length - 2,
  `${PRESETS.length - withPhysics} plate${PRESETS.length - withPhysics === 1 ? '' : 's'} of plain dye`);

console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
