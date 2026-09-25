#!/usr/bin/env node
/**
 * The liquids file (src/lib/liquidFile.ts): what someone writes by hand or
 * saves from the designer reads back as the liquid they meant, a bad file says
 * what is wrong with it instead of half-loading, and the words the designer
 * uses for how two liquids meet agree with what the shelf's own liquids are.
 *
 *   npm run liquidfile
 */
import fs from 'node:fs';
import { DEFAULT_LIQUID_TYPES } from '../src/types.ts';
import { readLiquidFile, writeLiquidFile, meets, isCustomLiquid } from '../src/lib/liquidFile.ts';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else failed++; console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const shelf = DEFAULT_LIQUID_TYPES;
const by = (id) => shelf.find((l) => l.id === id);
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

{
  const { liquids, warnings } = readLiquidFile(fs.readFileSync('docs/liquids/examples.liquids.json', 'utf8'), shelf);
  check('the example file reads, every liquid in it', liquids.length === 3 && warnings.length === 0, `${liquids.map((l) => l.name).join(', ')}${warnings.length ? `; ${warnings.join('; ')}` : ''}`);
  check('as liquids of their own, never a bottle the app ships', liquids.every(isCustomLiquid) && liquids.every((l) => !shelf.some((s) => s.id === l.id)), liquids.map((l) => l.id).join(', '));
  const m = liquids[0];
  check('with the properties it was written with', m.behaviour.weight === 0.4 && m.behaviour.polarity === -0.7 && m.injectRadius === 3 && m.color === '#c8d0e0');
  const again = readLiquidFile(writeLiquidFile(liquids), [...shelf, ...liquids]);
  check('saved and loaded again, it is the same liquid, updated in place', writeLiquidFile(again.liquids) === writeLiquidFile(liquids) && again.replaces.length === 3,
    `${again.replaces.length} of 3 replaced`);
}
{
  const { liquids, warnings } = readLiquidFile(JSON.stringify({ name: 'Hot Tar', color: '#321', drop: { size: 99 }, behaviour: { weight: 7, sparkle: 1, polarity: 'lots' } }), shelf);
  const l = liquids[0];
  check('one liquid on its own, written by hand, reads too', liquids.length === 1 && l.name === 'Hot Tar' && l.color === '#332211');
  check('a number out of range is held to the range, and said', l.injectRadius === 8 && l.behaviour.weight === 0.5 && warnings.some((w) => /Weight 7/.test(w)), warnings.join('; '));
  check('and a property a liquid does not have is named, not silently dropped', warnings.some((w) => /sparkle/.test(w)) && warnings.some((w) => /Polarity is not a number/.test(w)));
}
{
  const { liquids } = readLiquidFile(JSON.stringify([{ id: 'water', name: 'Water' }, { name: 'Water' }]), shelf);
  check('a file cannot overwrite a bottle the app ships, nor two of its own collide', liquids.every(isCustomLiquid) && liquids[0].id !== liquids[1].id, liquids.map((l) => l.id).join(', '));
}
{
  const errs = [throws(() => readLiquidFile('{ nope', shelf)), throws(() => readLiquidFile('{"liquids": []}', shelf)),
    throws(() => readLiquidFile('{"liquids": [{"color": "#fff"}]}', shelf)), throws(() => readLiquidFile('42', shelf))];
  check('a file that is not a liquid says why', errs.every(Boolean), errs.join(' · '));
}
{
  const ow = meets(by('oil'), by('water')), aw = meets(by('alcohol'), by('water')), sw = meets(by('syrup'), by('water'));
  check('oil stays apart from water, and beads in it', ow.mixing === 'stays apart' && ow.notes.some((n) => /beads/.test(n)), `${ow.mixing}; ${ow.notes.join('; ')}`);
  check('alcohol blends into water', aw.mixing === 'blends', aw.mixing);
  check('syrup sinks under water on a tilted plate', sw.notes.some((n) => /sinks/.test(n)), sw.notes.join('; '));
  check('acid and base neutralise', meets(by('acid'), by('base')).notes.some((n) => /neutralise/.test(n)));
  const fw = meets(by('ferrofluid'), by('water'));
  check('ferrofluid never mixes with the dye, and a magnet pulls it', fw.notes.some((n) => /magnet/.test(n)), fw.notes.join('; '));
}
console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
