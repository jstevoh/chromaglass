#!/usr/bin/env node
/**
 * The set list file (src/lib/setList.ts): what someone writes by hand or
 * exports from the desk reads back as the set they meant, a single saved look
 * or sequence file becomes one item, and a bad file says what is wrong with
 * it instead of half-loading.
 *
 *   npm run setlist
 */
import fs from 'node:fs';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { PRESETS } from '../src/presets.ts';
import { readSetListFile, writeSetListFile, moveItem } from '../src/lib/setList.ts';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else failed++; console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const known = (k) => k in DEFAULT_SETTINGS;
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

{
  const r = readSetListFile(fs.readFileSync('docs/sets/example.chromaglass-setlist.json', 'utf8'), known);
  check('the example set reads, every item in it', r.list.items.length === 3 && r.warnings.length === 0,
    `${r.list.items.map((i) => i.ref).join(', ')}${r.warnings.length ? `; ${r.warnings.join('; ')}` : ''}`);
  check('naming looks that ship', r.list.items.every((i) => PRESETS.some((p) => p.id === i.ref)),
    r.list.items.filter((i) => !PRESETS.some((p) => p.id === i.ref)).map((i) => i.ref).join(', ') || 'all found');
  const dark = r.list.items[1];
  check('an item carries its fade, song, controls and strip', dark.fade === 8 && dark.song?.title === 'Dark Star'
    && dark.controls?.globalSpeed === 0.03 && dark.rides?.length === 4 && r.list.items[2].fade === 0);
  const again = readSetListFile(writeSetListFile(r.list, [], []), known);
  check('exported and read again, it is the same set', JSON.stringify(again.list.items.map(({ id: _id, ...rest }) => rest)) === JSON.stringify(r.list.items.map(({ id: _id, ...rest }) => rest)));
}
{
  const r = readSetListFile(JSON.stringify({ format: 'chromaglass-setlist', version: 1, items: [
    { look: 'classic', controls: { dimmer: 0.2, globalSpeeed: 0.1, beatSqueeze: 'lots', plateRock: 0.4 }, rides: ['dimmer', 'nope'] },
    { fade: 3 },
  ] }), known);
  check('the room\'s own settings, misspelt and non-numeric controls are named, not taken',
    r.list.items.length === 1 && JSON.stringify(r.list.items[0].controls) === '{"plateRock":0.4}' && r.warnings.length >= 4,
    r.warnings.join('; '));
  check('an item naming no look is left out and said', r.warnings.some((w) => /names no look/.test(w)));
}
{
  const preset = { format: 'chromaglass-preset', version: 1, id: 'user-mine-1', name: 'Mine', createdAt: 0, settings: { ...DEFAULT_SETTINGS } };
  const r = readSetListFile(JSON.stringify(preset), known);
  check('a saved look file is one item, carrying the look', r.list.items.length === 1 && r.list.items[0].kind === 'saved' && r.presets.length === 1);
  const seq = { format: 'chromaglass-sequence', version: 1, sequence: { id: 'seq-x', name: 'X', loop: false, stages: [] } };
  const q = readSetListFile(JSON.stringify(seq), known);
  check('a sequence file is one item, carrying the sequence', q.list.items.length === 1 && q.list.items[0].kind === 'sequence' && q.sequences.length === 1);
  const bare = readSetListFile(JSON.stringify([{ look: 'classic' }, { saved: 'user-mine-1' }]), known);
  check('a bare list of items reads', bare.list.items.length === 2);
}
{
  check('not JSON says so', /not a JSON/.test(throws(() => readSetListFile('{nope', known)) ?? ''));
  check('something else entirely says so', /not a set list/.test(throws(() => readSetListFile('{"hello":1}', known)) ?? ''));
  check('a set with nothing usable says why', /Nothing in it|no items/.test(throws(() => readSetListFile('{"format":"chromaglass-setlist","items":[{"fade":1}]}', known)) ?? ''));
}
{
  const list = { name: 's', items: [{ id: 'a', kind: 'look', ref: 'x' }, { id: 'b', kind: 'look', ref: 'y' }, { id: 'c', kind: 'look', ref: 'z' }] };
  check('an item moves up and down, held to the list', moveItem(list, 'c', -1).items.map((i) => i.id).join('') === 'acb'
    && moveItem(list, 'a', -1) === list && moveItem(list, 'a', 5).items.map((i) => i.id).join('') === 'bca');
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
