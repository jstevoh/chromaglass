#!/usr/bin/env node
/**
 * Three sound builds, their checks written first (PLAN.md Wave 4, lane D:
 * 14t-pc in docs/plan/14-show-at-the-gig-2.md, 24.3 in
 * docs/plan/24-modular-rigs.md, 30b in docs/plan/30-sound-and-midi.md).
 *
 *   npm run soundowed -- --owed=pc,voices,lfo   (node only, about a second)
 *
 * Each line under an id is printed as owed while what it asks for is absent,
 * and is red the day it passes with its id still listed (the convention of
 * `timers.mjs`, `rungs-owed.mjs` and `liveshow.mjs`): the PR that builds an
 * item takes its id out of `--owed` in scripts/checks.json and never edits a
 * line or a bar. A build that is there and misses is red, owed or not. The
 * lines with no id hold on main and keep each build from breaking what is
 * already there.
 *
 * Why lines over the library and not over the page: the three are
 * arithmetic and bookkeeping (which binding a message reaches, where a note's
 * drop lands, when an LFO comes round), and a page hides each behind a frame
 * loop and a solver that a cloud runner steps at a twentieth of the Mac's
 * rate. So each item is a contract named below, in the module that owns it,
 * and the hook or the visualizer calls it. What the contract cannot see (the
 * hook's switch calling the host, the phone's list) is the review's.
 *
 * ## pc: Program Change (14t-pc), in src/lib/midi.ts
 *
 * `parseMidi` drops 0xC0, so AUM's matrix, an Elektron box or a hardware
 * sequencer changing pattern never reaches learn. The build adds:
 *
 *   - `parseMidi([0xC0 | ch, n])` → `{ kind: 'program', channel: ch, number: n, value: 0 }`
 *     (two bytes; `MidiEvent.kind` gains 'program');
 *   - `eventSource` of it → `{ kind: 'program', channel, number }`
 *     (`MidiSource.kind` gains 'program'; its `sourceKey` is not a note's or a CC's);
 *   - a `MidiTarget` `{ kind: 'setlist', index }`, the set list's item `index`
 *     (0-based), which the hook plays with the item's own fade, as Go does;
 *   - `parseMidiMap` keeps a program source bound to a preset or a set-list item;
 *   - `liveBindings(map, source, bank)`: the hook's own rule for which bindings a
 *     message reaches on the live bank (a bank's own binding wins over an
 *     always-live one), moved into the library so it can be checked, and the
 *     hook calls it;
 *   - `pressedBy(event)`: the hook's `pressed` (a note-on, a CC over 63), true
 *     for a Program Change.
 *
 * Pass: a recorded run of twelve Program Changes on two channels, with Bank
 * Select (CC 0 and 32) and clock bytes between them as a sequencer sends
 * them, reaches exactly one binding per message, the bound one, pressed; the
 * Bank Selects reach none of them.
 *
 * ## voices: MIDI notes as voices (24.3), src/lib/noteVoices.ts (new)
 *
 * Plain functions over one state object (no per-note objects in the frame):
 *
 *   - `makeNoteVoices()` → the state;
 *   - `voiceOn(v, channel, pitch, velocity, now, shape?, line?)` →
 *     `{ drop: { x, y, along, pitch, size, channel }, stole }`, velocity 0..127,
 *     `stole` the `{ channel, pitch }` the channel's cap let go of, else null;
 *   - `voiceOff(v, channel, pitch, now)`;
 *   - `voicePour(v, channel, pitch, now, shape?)` → that voice's pour, 0..1;
 *   - `noteSource(v, channel)` → `{ velocity, pitch, held }`, each 0..1, the
 *     patch bay's `notes` source;
 *   - `VOICE_DEFAULTS: { attack, release, cap }` (seconds, seconds, voices; cap 4);
 *
 * and in src/lib/melodyWalk.ts `melodyPlace(pitch, line)` → `{ x, y, along }`,
 * Melody Walk's own placement (its scale, its line, its fifths offset) taken
 * out of `MelodyWalk.update` so a note from a sequencer lands where the same
 * note heard by the microphone does (24.3-place-1). In midi.ts, a target
 * `{ kind: 'voices' }` (its tool, liquid, attack, release, cap and area are the
 * build's, optional) that `liveBindings` answers for every note on the
 * channel it was learned on, so one learn covers the channel.
 *
 * ## lfo: LFOs and envelopes you set (30b), src/lib/modulators.ts
 *
 *   - `setLfo(id, { bars, shape, restart? })`: bars a quarter to sixteen, shape
 *     'sine' | 'triangle' | 'ramp' | 'stepped' | 'smooth', restart a trigger;
 *   - `setEnvelope(id, { attack, decay, on })`: seconds, and what fires it;
 *   - `trigger(source, velocity?)`, source 'kick' | 'snare' | 'note' | 'pad':
 *     fires the envelopes whose `on` is that source or 'any', and restarts the
 *     LFOs whose `restart` is that source. `fire(velocity)` stays, and fires
 *     every envelope whose `on` is 'any', which is each one's default.
 *
 * Today's rates and shapes are the defaults (a line here holds that on main
 * and after). The drum loop below is written out, not heard: who calls
 * `trigger('kick')` from the ear's onsets is the visualizer's and the review's.
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, 'node_modules', '.cache', 'soundowed');
mkdirSync(cache, { recursive: true });

const IDS = ['pc', 'voices', 'lfo'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
let failed = 0, passed = 0, owedLines = 0;
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const unknown = [...owed].filter((id) => !IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${IDS.join(', ')})`);
/** `mainState`: what the line is owed for is absent, which is the only state an owed line is excused in. */
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  owedLines++;
  console.log(` owed  ${name} — ${detail}`);
};
/** A line's own arithmetic throwing is the build missing, said as a line rather than a stack. */
const attempt = (fn, fallback) => { try { return fn(); } catch (e) { return { ...fallback, error: String(e?.message ?? e).split('\n')[0] }; } };

const bundle = async (entry, name) => {
  const outfile = join(cache, `${name}.mjs`);
  await build({ entryPoints: [join(root, entry)], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning' });
  return import(`${pathToFileURL(outfile).href}?${Date.now()}`);
};

const midi = await bundle('src/lib/midi.ts', 'midi');
const walk = await bundle('src/lib/melodyWalk.ts', 'melodyWalk');
const mods = await bundle('src/lib/modulators.ts', 'modulators');
const voicesFile = join(root, 'src/lib/noteVoices.ts');
const nv = existsSync(voicesFile) ? await bundle('src/lib/noteVoices.ts', 'noteVoices') : null;
const liveBindings = typeof midi.liveBindings === 'function' ? midi.liveBindings : null;
const pressedBy = typeof midi.pressedBy === 'function' ? midi.pressedBy : null;

const map = (bindings) => ({ format: midi.MIDI_FORMAT, version: 1, name: 'soundowed', bindings });
const bind = (id, source, target, bank) => ({ id, source, target, mode: 'absolute', bank });

// ── pc: Program Change (14t-pc) ─────────────────────────────────────
console.log('\n14t-pc: Program Change');
{
  // Held on main, and after: a Program Change must not take a CC's or a note's place.
  const bank0 = midi.parseMidi([0xb2, 0, 1]);
  const bank32 = midi.parseMidi([0xb2, 32, 0]);
  const on = midi.parseMidi([0x92, 60, 100]);
  check('Bank Select (CC 0 and CC 32) is still read as a CC, and a note as a note',
    bank0?.kind === 'cc' && bank0.number === 0 && bank32?.kind === 'cc' && bank32.number === 32 && on?.kind === 'noteon',
    `${bank0?.kind} ${bank0?.number}, ${bank32?.kind} ${bank32?.number}, ${on?.kind}`);

  const pc = midi.parseMidi([0xc5, 7]);
  const src = pc ? midi.eventSource(pc) : null;
  const key = src ? midi.sourceKey(src) : null;
  const apart = key !== null && key !== midi.sourceKey({ kind: 'note', channel: 5, number: 7 }) && key !== midi.sourceKey({ kind: 'cc', channel: 5, number: 7 });
  line('pc', '14t-pc: a Program Change is read as its own kind of message, on its channel, kept apart from a note or CC of its number',
    pc?.kind === 'program' && pc.channel === 5 && pc.number === 7 && src?.kind === 'program' && src.channel === 5 && src.number === 7 && apart,
    `parseMidi([0xC5, 7]) → ${pc ? JSON.stringify(pc) : 'null'}; source ${src ? JSON.stringify(src) : 'none'}`, pc === null);

  const saved = map([
    bind('p-look', { kind: 'program', channel: 0, number: 3 }, { kind: 'preset', presetId: 'aurora-borealis' }),
    bind('p-item', { kind: 'program', channel: 0, number: 4 }, { kind: 'setlist', index: 4 }),
  ]);
  const back = attempt(() => midi.parseMidiMap(midi.serializeMidiMap(saved)), { bindings: [] });
  const look = back.bindings.find((b) => b.id === 'p-look');
  const item = back.bindings.find((b) => b.id === 'p-item');
  line('pc', 'and a map keeps a Program Change bound to a look and one bound to a set-list item, through save and load',
    look?.source.kind === 'program' && look.target.kind === 'preset' && look.target.presetId === 'aurora-borealis'
      && item?.source.kind === 'program' && item.target.kind === 'setlist' && item.target.index === 4,
    `${back.bindings.length} of 2 bindings kept${back.error ? ` (${back.error})` : ''}`, back.bindings.length === 0);

  // A recorded run, as a sequencer changing pattern sends it: Bank Select MSB
  // and LSB, then the Program Change, with clock running through it. Two
  // channels, so a channel's bindings are its own. The run is on bank 2:
  // program 3 on channel 0 is bound always-live and on bank 2 to another look,
  // so the bank's own wins and the message reaches one binding, not two;
  // program 9 is bound always-live and on bank 1, which bank 2 never reaches.
  const bound = new Map([['0:3', 'lava-lamp'], ['0:9', 'oil-and-water'], ['1:3', 'item:2'], ['1:0', 'item:0']]);
  const runMap = map([
    bind('a', { kind: 'program', channel: 0, number: 3 }, { kind: 'preset', presetId: 'aurora-borealis' }),
    bind('a2', { kind: 'program', channel: 0, number: 3 }, { kind: 'preset', presetId: 'lava-lamp' }, 2),
    bind('b', { kind: 'program', channel: 0, number: 9 }, { kind: 'preset', presetId: 'oil-and-water' }),
    bind('b1', { kind: 'program', channel: 0, number: 9 }, { kind: 'preset', presetId: 'aurora-borealis' }, 1),
    bind('c', { kind: 'program', channel: 1, number: 3 }, { kind: 'setlist', index: 2 }),
    bind('d', { kind: 'program', channel: 1, number: 0 }, { kind: 'setlist', index: 0 }),
    // A note 3 on channel 0, which a Program Change 3 must not reach.
    bind('n', { kind: 'note', channel: 0, number: 3 }, { kind: 'action', action: 'clear' }),
  ]);
  const programs = [[0, 3], [0, 9], [1, 3], [0, 3], [1, 0], [0, 9], [1, 3], [1, 0], [0, 3], [0, 3], [1, 3], [0, 9]];
  const stream = [];
  for (const [ch, n] of programs) stream.push([0xf8], [0xb0 | ch, 0, 0], [0xb0 | ch, 32, 1], [0xf8], [0xc0 | ch, n], [0xf8]);
  let landed = 0, doubled = 0, missed = 0, wrong = 0, bankSelectHits = 0, notPressed = 0;
  const run = attempt(() => {
    for (const bytes of stream) {
      if (midi.parseMidiRealtime(bytes)) continue;
      const e = midi.parseMidi(bytes);
      if (!e) { if ((bytes[0] & 0xf0) === 0xc0) missed++; continue; }
      const reached = liveBindings(runMap, midi.eventSource(e), 2);
      if (e.kind === 'cc') { bankSelectHits += reached.length; continue; }
      if (reached.length === 0) { missed++; continue; }
      if (reached.length > 1) doubled++;
      const t = reached[0].target;
      const got = t.kind === 'preset' ? t.presetId : t.kind === 'setlist' ? `item:${t.index}` : `${t.kind}`;
      if (got !== bound.get(`${e.channel}:${e.number}`)) wrong++;
      else landed++;
      if (!pressedBy(e)) notPressed++;
    }
    // And the rest of the hook's rule is kept: a note-off, a CC under the
    // middle and a Bank Select are not presses; a note-on and a CC over it are.
    const no = [[0x80, 60, 0], [0xb0, 7, 40], [0xb0, 0, 0], [0xb0, 32, 1]].filter((b) => pressedBy(midi.parseMidi(b))).length;
    const yes = [[0x90, 60, 100], [0xb0, 7, 100]].filter((b) => pressedBy(midi.parseMidi(b))).length;
    if (no !== 0 || yes !== 2) notPressed += 100;
    return {};
  }, {});
  line('pc', 'a recorded run of 12 Program Changes, with Bank Select and clock between, lands each on its bound look or set-list item, pressed, none doubled and none missed',
    !run.error && landed === 12 && doubled === 0 && missed === 0 && wrong === 0 && bankSelectHits === 0 && notPressed === 0,
    run.error ? `${liveBindings ? '' : 'no liveBindings export in src/lib/midi.ts; '}${run.error}` : `${landed} landed, ${doubled} doubled, ${missed} missed, ${wrong} on the wrong look, ${bankSelectHits} Bank Selects reached a binding, ${notPressed >= 100 ? `pressedBy wrong on a note-off, a low CC or a Bank Select; ${notPressed - 100}` : notPressed} not pressed`,
    !liveBindings || pc === null);
}

// ── voices: MIDI notes as voices (24.3) ────────────────────────────
console.log('\n24.3: notes as voices');
{
  const melodyPlace = typeof walk.melodyPlace === 'function' ? walk.melodyPlace : null;
  const absent = !nv;
  const why = absent ? 'no src/lib/noteVoices.ts' : '';
  const line0 = walk.DEFAULT_MELODY_LINE;
  const dt = 1 / 60;
  const shape0 = { attack: 0, release: 0, cap: 4 };

  // Two channels of a sequence: a line on channel 0 and a bass on channel 9.
  const seq = [
    { at: 0.0, ch: 0, p: 60, v: 90, off: 0.4 }, { at: 0.5, ch: 0, p: 64, v: 90, off: 0.9 },
    { at: 1.0, ch: 0, p: 67, v: 90, off: 1.4 }, { at: 1.5, ch: 0, p: 72, v: 90, off: 1.9 },
    { at: 0.0, ch: 9, p: 36, v: 110, off: 0.9 }, { at: 1.0, ch: 9, p: 43, v: 110, off: 1.9 },
  ];
  const r1 = attempt(() => {
    const v = nv.makeNoteVoices();
    const ev = [];
    for (const n of seq) ev.push({ t: n.at, on: true, n }, { t: n.off, on: false, n });
    ev.sort((a, b) => a.t - b.t || (a.on ? 1 : -1));
    const drops = [];
    for (const e of ev) {
      if (e.on) { const r = nv.voiceOn(v, e.n.ch, e.n.p, e.n.v, e.t, shape0, line0); if (r?.drop) drops.push({ ...r.drop, want: e.n }); }
      else { const r = nv.voiceOff(v, e.n.ch, e.n.p, e.t); if (r?.drop) drops.push(r.drop); }
    }
    return { drops };
  }, { drops: [] });
  const onChannel = r1.drops.filter((d) => d.want && d.channel === d.want.ch && d.pitch === d.want.p).length;
  line('voices', '24.3: notes on two channels lay one drop per note-on, each on its own channel and pitch, and none on a note-off',
    !r1.error && r1.drops.length === seq.length && onChannel === seq.length,
    r1.error ? `${why || r1.error}` : `${r1.drops.length} drops for ${seq.length} note-ons, ${onChannel} on their own channel and pitch`, absent);

  const r2 = attempt(() => {
    const v = nv.makeNoteVoices();
    const pitches = [48, 55, 60, 67, 72, 79, 84];
    let worst = 0, ordered = true, prev = -1;
    for (const [i, p] of pitches.entries()) {
      const { drop } = nv.voiceOn(v, 0, p, 100, i, shape0, line0);
      nv.voiceOff(v, 0, p, i + 0.5);
      const want = melodyPlace(p, line0);
      worst = Math.max(worst, Math.hypot(drop.x - want.x, drop.y - want.y));
      if (!(drop.along > prev)) ordered = false;
      prev = drop.along;
    }
    // And Melody Walk itself places with it, so the heard note and the played
    // one cannot drift apart: its update calls melodyPlace, and the line's
    // arithmetic is written once in the file.
    const src = readFileSync(join(root, 'src/lib/melodyWalk.ts'), 'utf8');
    const cls = src.slice(src.indexOf('export class MelodyWalk'));
    const shared = /melodyPlace\(/.test(cls) && (src.match(/line\.x0 \+ dx \* along/g) ?? []).length === 1;
    return { worst, ordered, shared };
  }, { worst: Infinity, ordered: false, shared: false });
  line('voices', 'each drop sits where Melody Walk puts the same pitch (melodyPlace), low notes to high across the plate',
    !r2.error && r2.worst < 1e-6 && r2.ordered && r2.shared,
    r2.error ? `${why || (melodyPlace ? r2.error : 'no melodyPlace export in src/lib/melodyWalk.ts')}` : `worst ${r2.worst.toExponential(1)} of the plate from melodyPlace; ${r2.ordered ? 'low to high' : 'out of order'}; ${r2.shared ? 'MelodyWalk.update places with it' : 'MelodyWalk.update keeps its own copy of the placement'}`,
    absent || !melodyPlace);

  const r3 = attempt(() => {
    const v = nv.makeNoteVoices();
    return { sizes: [20, 64, 127].map((vel, i) => { const s = nv.voiceOn(v, 0, 60 + i, vel, i, shape0, line0).drop.size; nv.voiceOff(v, 0, 60 + i, i + 0.5); return s; }) };
  }, { sizes: [] });
  line('voices', 'a harder note lays a bigger drop (velocity 20, 64, 127)',
    !r3.error && r3.sizes.length === 3 && r3.sizes.every((s) => s > 0) && r3.sizes[0] < r3.sizes[1] && r3.sizes[1] < r3.sizes[2],
    r3.error ? `${why || r3.error}` : `sizes ${r3.sizes.map((s) => s.toFixed(3)).join(', ')}`, absent);

  // Held for 1.5 s with no attack or release: pouring from the frame after
  // the note-on to the frame before the note-off, and stopped one frame on.
  const r4 = attempt(() => {
    const v = nv.makeNoteVoices();
    nv.voiceOn(v, 0, 60, 100, 0, shape0, line0);
    let low = 1;
    for (let t = dt; t <= 1.5 - dt + 1e-9; t += dt) low = Math.min(low, nv.voicePour(v, 0, 60, t, shape0));
    nv.voiceOff(v, 0, 60, 1.5);
    const after = nv.voicePour(v, 0, 60, 1.5 + dt, shape0);
    return { low, after };
  }, { low: 0, after: 1 });
  line('voices', 'a held note pours for as long as it is held, stopping within a frame of its note-off',
    !r4.error && r4.low > 0.5 && r4.after === 0,
    r4.error ? `${why || r4.error}` : `lowest pour while held ${r4.low.toFixed(3)}, a frame after the note-off ${r4.after.toFixed(3)}`, absent);

  // With an attack and a release: the 2-98% rise and fall (30a's measure of a
  // cord's attack and release, soundcords.mjs), read on a millisecond grid.
  const r5 = attempt(() => {
    const shape = { attack: 0.4, release: 0.8, cap: 4 };
    const v = nv.makeNoteVoices();
    nv.voiceOn(v, 0, 60, 127, 0, shape, line0);
    const ms = 0.001;
    let peak = 0;
    for (let t = 0; t <= 2; t += ms) peak = Math.max(peak, nv.voicePour(v, 0, 60, t, shape));
    const cross = (from, to, lo, hi, rising, offAt) => {
      let a = null, b = null;
      for (let t = from; t <= to; t += ms) {
        const p = nv.voicePour(v, 0, 60, t, shape) / peak;
        if (rising) { if (a === null && p >= lo) a = t; if (b === null && p >= hi) b = t; }
        else { if (a === null && p <= hi) a = t; if (b === null && p <= lo) b = t; }
      }
      return a !== null && b !== null ? b - a : null;
    };
    const rise = cross(0, 2, 0.02, 0.98, true);
    nv.voiceOff(v, 0, 60, 2);
    const fall = cross(2, 4, 0.02, 0.98, false);
    return { rise, fall, peak };
  }, { rise: null, fall: null });
  const near = (x, want) => x !== null && Math.abs(x - want) <= 0.1 * want;
  line('voices', 'with a 0.4 s attack and a 0.8 s release, the pour rises 2-98% over its attack and falls over its release, each within 10% of its time',
    !r5.error && near(r5.rise, 0.4) && near(r5.fall, 0.8),
    r5.error ? `${why || r5.error}` : `rise ${r5.rise?.toFixed(3)} s, fall ${r5.fall?.toFixed(3)} s`, absent);

  const r6 = attempt(() => {
    const v = nv.makeNoteVoices();
    const chord = [67, 60, 64].map((p) => ({ p, d: nv.voiceOn(v, 0, p, 100, 3, shape0, line0).drop }));
    const byPitch = [...chord].sort((a, b) => a.p - b.p).map((c) => c.d.x);
    return { n: chord.filter((c) => c.d).length, ordered: byPitch[0] < byPitch[1] && byPitch[1] < byPitch[2], xs: byPitch };
  }, { n: 0, ordered: false, xs: [] });
  line('voices', 'a three-note chord lays three drops in one frame, ordered across the plate by pitch',
    !r6.error && r6.n === 3 && r6.ordered,
    r6.error ? `${why || r6.error}` : `${r6.n} drops at x ${r6.xs.map((x) => x.toFixed(3)).join(', ')} for C, E, G`, absent);

  const r7 = attempt(() => {
    const shape = { attack: 0, release: 0.2, cap: 4 };
    const v = nv.makeNoteVoices();
    // Two notes held on another channel first: the cap is a channel's, not the plate's.
    nv.voiceOn(v, 9, 36, 100, 0, shape, line0); nv.voiceOn(v, 9, 43, 100, 0, shape, line0);
    const held = [60, 62, 64, 65];
    held.forEach((p, i) => nv.voiceOn(v, 0, p, 100, i * 0.1, shape, line0));
    const { stole } = nv.voiceOn(v, 0, 67, 100, 0.5, shape, line0);
    const first = nv.voicePour(v, 0, 60, 0.5 + 0.2 + 2 * dt, shape);
    const others = [[0, 62], [0, 64], [0, 65], [0, 67], [9, 36], [9, 43]].map(([c, p]) => nv.voicePour(v, c, p, 0.5 + 0.2 + 2 * dt, shape));
    return { stole, first, others };
  }, { stole: null, first: 1, others: [] });
  line('voices', 'on a channel capped at four voices, a fifth held note lets its oldest go, and the other four and another channel\'s two keep pouring',
    !r7.error && r7.stole?.channel === 0 && r7.stole?.pitch === 60 && r7.first < 0.02 && r7.others.length === 6 && r7.others.every((p) => p > 0.5),
    r7.error ? `${why || r7.error}` : `stole ${JSON.stringify(r7.stole)}, the first ${r7.first.toFixed(3)} after its release, the others ${r7.others.map((p) => p.toFixed(2)).join(', ')}`, absent);

  const r8 = attempt(() => {
    const v = nv.makeNoteVoices();
    nv.voiceOn(v, 3, 72, 96, 0, shape0, line0);
    const during = nv.noteSource(v, 3);
    const other = nv.noteSource(v, 4);
    nv.voiceOff(v, 3, 72, 1);
    const after = nv.noteSource(v, 3);
    return { during, other, after };
  }, {});
  const close = (a, b) => Math.abs(a - b) < 1e-6;
  line('voices', 'notes ride the patch bay: velocity, pitch and held per channel, held back to 0 once let go',
    !r8.error && close(r8.during?.velocity, 96 / 127) && close(r8.during?.pitch, 72 / 127) && r8.during?.held === 1 && r8.other?.held === 0 && r8.after?.held === 0,
    r8.error ? `${why || r8.error}` : `held ${JSON.stringify(r8.during)}, another channel ${JSON.stringify(r8.other)}, let go ${JSON.stringify(r8.after)}`, absent);

  const r9 = attempt(() => {
    const learned = map([bind('v', { kind: 'note', channel: 2, number: 60 }, { kind: 'voices' })]);
    const kept = midi.parseMidiMap(midi.serializeMidiMap(learned));
    const on2 = [36, 60, 67, 96].map((n) => liveBindings(kept, { kind: 'note', channel: 2, number: n }, 0).length);
    const on3 = liveBindings(kept, { kind: 'note', channel: 3, number: 60 }, 0).length;
    return { kept: kept.bindings.length, on2, on3 };
  }, { kept: 0, on2: [], on3: -1 });
  line('voices', 'a voices binding learned from one note survives save and load and answers every note on its channel, and no other channel',
    !r9.error && r9.kept === 1 && r9.on2.length === 4 && r9.on2.every((n) => n === 1) && r9.on3 === 0,
    r9.error ? `${liveBindings ? r9.error : 'no liveBindings export in src/lib/midi.ts'}` : `${r9.kept} kept; notes 36, 60, 67, 96 on ch 3 (index 2) reach ${r9.on2.join(', ')}; ch 4 (index 3) reaches ${r9.on3}`,
    // Owed while the voices build is absent, even once 14t-pc has shipped liveBindings.
    !nv || !liveBindings || r9.kept === 0);
}

// ── lfo: LFOs and envelopes you set (30b) ──────────────────────────
console.log('\n30b: LFOs and envelopes you set');
{
  const { Modulators } = mods;
  const seeded = () => { let s = 99; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const dt = 1 / 60;
  const probe = new Modulators(seeded());
  const absent = typeof probe.setLfo !== 'function' || typeof probe.trigger !== 'function';
  const why = absent ? 'no setLfo and trigger on Modulators (src/lib/modulators.ts)' : '';

  // Held on main and after: a fresh Modulators moves as it always has. The
  // formulas are today's, written out here so a build that changes a default
  // is caught (a look saved before keeps its motion).
  {
    const m = new Modulators(seeded());
    const today = { lfo1: 0, lfo2: 0, lfo3: 0 };
    let worst = 0, envAt = -1;
    const bpm = 128;
    for (let i = 0; i < 1200; i++) {
      if (i === 300) { m.fire(0.8); envAt = 0; }
      m.step(dt, bpm);
      const bars = bpm / 60 * dt / 4;
      today.lfo1 = (today.lfo1 + bars / 8) % 1; today.lfo2 = (today.lfo2 + bars / 2) % 1; today.lfo3 = (today.lfo3 + bars) % 1;
      if (envAt >= 0) envAt += dt;
      const want = {
        lfo1: 0.5 + 0.5 * Math.sin(today.lfo1 * Math.PI * 2),
        lfo2: 0.5 + 0.5 * Math.sin(today.lfo2 * Math.PI * 2),
        lfo3: 1 - Math.abs(today.lfo3 * 2 - 1),
        env1: envAt < 0 ? 0 : (envAt < 0.012 ? envAt / 0.012 : Math.exp(-(envAt - 0.012) / 0.28)) * 0.8,
        env2: envAt < 0 ? 0 : (envAt < 0.09 ? envAt / 0.09 : Math.exp(-(envAt - 0.09) / 1.6)) * 0.8,
      };
      for (const k of Object.keys(want)) worst = Math.max(worst, Math.abs(m.value(k) - want[k]));
    }
    check("today's rates and shapes are the defaults: a fresh Modulators follows the eight-, two- and one-bar LFOs and both envelopes as before",
      worst < 1e-6, `worst ${worst.toExponential(1)} over 20 s at 128 bpm`);
  }

  // Every rate and shape comes round within a frame of its bars. Each shape
  // has a mark once a cycle: the sine crossing 0.5 rising, the triangle's
  // lowest, the ramp's drop, the stepped value changing.
  const RATES = [0.25, 0.5, 1, 2, 4, 8, 16];
  const SHAPES = ['sine', 'triangle', 'ramp', 'stepped'];
  const marks = (v, shape) => {
    const at = [];
    for (let i = 2; i < v.length; i++) {
      const [a, b, c] = [v[i - 2], v[i - 1], v[i]];
      if (shape === 'sine' && b < 0.5 && c >= 0.5) at.push(i);
      if (shape === 'triangle' && b <= a && b < c) at.push(i - 1);
      if (shape === 'ramp' && c < b - 0.5) at.push(i);
      if (shape === 'stepped' && c !== b) at.push(i);
    }
    return at;
  };
  const r1 = attempt(() => {
    let worst = 0, cases = 0, empty = [], unlike = 0;
    for (const bpm of [120, 90]) for (const bars of RATES) for (const shape of SHAPES) {
      const m = new Modulators(seeded());
      m.setLfo('lfo1', { bars, shape });
      const period = bars * 4 * 60 / bpm;
      const v = [];
      for (let t = 0; t < period * 3.5; t += dt) { m.step(dt, bpm); v.push(m.value('lfo1')); }
      // Each frame against its shape's own formula at its phase (the LFO
      // starts at phase 0 and steps before it is read), so a triangle drawn
      // as a sine, or a ramp as a triangle, is not the shape it was set to.
      if (shape !== 'stepped') v.forEach((x, i) => {
        const ph = (((i + 1) * dt) / period) % 1;
        const f = shape === 'sine' ? 0.5 + 0.5 * Math.sin(ph * Math.PI * 2) : shape === 'triangle' ? 1 - Math.abs(ph * 2 - 1) : ph;
        const e = shape === 'ramp' ? Math.min(Math.abs(x - f), Math.abs(x - f + 1), Math.abs(x - f - 1)) : Math.abs(x - f);
        unlike = Math.max(unlike, e);
      });
      const at = marks(v, shape);
      if (at.length < 2) { empty.push(`${shape} ${bars} bars at ${bpm}`); continue; }
      for (let i = 1; i < at.length; i++) worst = Math.max(worst, Math.abs((at[i] - at[i - 1]) * dt - period));
      cases++;
    }
    return { worst, cases, empty, unlike };
  }, { worst: Infinity, cases: 0, empty: [], unlike: Infinity });
  line('lfo', '30b: every LFO rate (a quarter bar to sixteen) and shape (sine, triangle, ramp, stepped) comes round within a frame of its bars, at 120 and at 90 bpm, and draws its shape',
    !r1.error && r1.cases === 56 && r1.worst <= dt + 1e-9 && r1.unlike <= 0.02,
    r1.error ? why || r1.error : `${r1.cases} of 56, worst ${(r1.worst * 1000).toFixed(1)} ms off its period, ${r1.unlike.toFixed(3)} off its shape's formula${r1.empty.length ? `; no cycle seen: ${r1.empty.slice(0, 3).join('; ')}` : ''}`, absent);

  // A two-bar drum loop at 120: kicks on one and three, snares on two and
  // four, a kick pushed a sixteenth late in the second bar.
  const loop = [];
  for (let rep = 0; rep < 4; rep++) {
    const t0 = rep * 4;
    for (const [beat, what] of [[0, 'kick'], [1, 'snare'], [2, 'kick'], [3, 'snare'], [4, 'kick'], [5, 'snare'], [6.25, 'kick'], [7, 'snare']]) loop.push({ t: t0 + beat * 0.5, what });
  }
  const kicks = loop.filter((h) => h.what === 'kick').length;
  const snares = loop.length - kicks;
  const r2 = attempt(() => {
    const m = new Modulators(seeded());
    m.setEnvelope('env1', { attack: 0.01, decay: 0.08, on: 'kick' });
    m.setEnvelope('env2', { attack: 0.01, decay: 0.08, on: 'snare' });
    let k = 0, s = 0, i = 0, last = { env1: 0, env2: 0 }, armed = { env1: true, env2: true };
    let fired = false;
    for (let t = 0; t < 16; t += dt) {
      while (i < loop.length && loop[i].t <= t) m.trigger(loop[i++].what, 1);
      // fire() in a gap of the loop: it fires the envelopes left on 'any', and
      // these two are set to the kick and the snare, so neither may rise.
      if (!fired && t >= 15.8) { fired = true; m.fire(1); }
      m.step(dt, 120);
      for (const id of ['env1', 'env2']) {
        const v = m.value(id);
        // A fire is a rise past 0.5 from below 0.1: once per fire, however its peak is sampled.
        if (armed[id] && v > 0.5) { armed[id] = false; id === 'env1' ? k++ : s++; }
        if (v < 0.1) armed[id] = true;
        last[id] = v;
      }
    }
    return { k, s };
  }, { k: -1, s: -1 });
  line('lfo', 'an envelope set to fire on the kick fires once per kick of a drum loop and never on its snares, one set to the snare the other way round, and fire() leaves both alone',
    !r2.error && r2.k === kicks && r2.s === snares,
    r2.error ? why || r2.error : `kick envelope ${r2.k} of ${kicks} kicks, snare envelope ${r2.s} of ${snares} snares`, absent);

  const r3 = attempt(() => {
    const m = new Modulators(seeded());
    m.setEnvelope('env1', { attack: 0.25, decay: 0.5, on: 'pad' });
    m.trigger('pad', 1);
    const ms = 0.001;
    let peakAt = 0, peak = 0, eAt = null;
    for (let t = ms; t < 3; t += ms) {
      m.step(ms, 120);
      const v = m.value('env1');
      if (v > peak) { peak = v; peakAt = t; }
      if (peak > 0.99 && eAt === null && v <= peak / Math.E) eAt = t;
    }
    return { peakAt, decay: eAt === null ? null : eAt - peakAt };
  }, { peakAt: -1, decay: null });
  line('lfo', 'an envelope set to a 0.25 s attack and a 0.5 s decay peaks and falls to 1/e within a frame of each',
    !r3.error && Math.abs(r3.peakAt - 0.25) <= dt && r3.decay !== null && Math.abs(r3.decay - 0.5) <= dt,
    r3.error ? why || r3.error : `peak at ${r3.peakAt.toFixed(3)} s, 1/e ${r3.decay === null ? 'never' : `${r3.decay.toFixed(3)} s`} after it`, absent);

  const r4 = attempt(() => {
    const m = new Modulators(seeded());
    m.setLfo('lfo2', { bars: 1, shape: 'smooth' });
    const period = 4 * 60 / 120;
    let lo = 1, hi = 0, worst = 0, prev = null, dir = 0, turns = 0;
    for (let t = 0; t < period * 16; t += dt) {
      m.step(dt, 120);
      const v = m.value('lfo2');
      if (prev !== null) {
        worst = Math.max(worst, Math.abs(v - prev));
        const d = v - prev > 1e-9 ? 1 : v - prev < -1e-9 ? -1 : 0;
        if (d && dir && d !== dir) turns++;
        if (d) dir = d;
      }
      prev = v; lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    // Its rate: a new target each period turns the glide round at about two
    // thirds of the fifteen boundaries between sixteen glides (a uniform random
    // target is past its neighbours that often), never more than fifteen; a
    // glide four times too slow turns three times at most.
    // A glide from one target to the next over a period moves at most the
    // whole range in that period; a cosine glide peaks at pi/2 of that.
    return { worst, share: dt / period * Math.PI / 2, span: hi - lo, turns };
  }, { worst: Infinity, share: 0, span: 0, turns: 0 });
  line('lfo', 'the smoothed random glides at its rate: no frame steps by more than its share of the range, and over sixteen periods it covers a third of it and turns six to fifteen times',
    !r4.error && r4.worst <= r4.share * 1.01 && r4.span >= 0.33 && r4.turns >= 6 && r4.turns <= 15,
    r4.error ? why || r4.error : `largest step ${r4.worst.toFixed(4)} against ${r4.share.toFixed(4)}, covering ${r4.span.toFixed(2)}, turning ${r4.turns} times`, absent);

  const r5 = attempt(() => {
    const m = new Modulators(seeded());
    m.setLfo('lfo1', { bars: 8, shape: 'ramp', restart: 'kick' });
    const period = 8 * 4 * 60 / 120;
    let i = 0, worst = 0, seen = 0, snareLeast = Infinity;
    for (let t = 0; t < 16; t += dt) {
      let kick = false, snare = false;
      while (i < loop.length && loop[i].t <= t) { const h = loop[i++]; m.trigger(h.what, 1); if (h.what === 'kick') kick = true; else snare = true; }
      m.step(dt, 120);
      // The frame after a kick, a ramp restarted on it has run at most a frame;
      // the frame after a snare, it is still a quarter of a second or more in.
      if (kick) { seen++; worst = Math.max(worst, m.value('lfo1') * period); }
      else if (snare) snareLeast = Math.min(snareLeast, m.value('lfo1') * period);
    }
    return { worst, seen, snareLeast };
  }, { worst: Infinity, seen: 0, snareLeast: 0 });
  line('lfo', 'an LFO set to restart on the kick begins its cycle within a frame of each kick of the loop, and its snares leave it running',
    !r5.error && r5.seen === kicks && r5.worst <= dt + 1e-9 && r5.snareLeast >= 0.25,
    r5.error ? why || r5.error : `${r5.seen} kicks, the ramp at most ${(r5.worst * 1000).toFixed(1)} ms into its cycle the frame after; after a snare at least ${r5.snareLeast.toFixed(2)} s in`, absent);
}

console.log(`\n${passed}/${passed + failed} checks passed${owedLines ? `, ${owedLines} owed` : ''}`);
process.exit(failed ? 1 : 0);
