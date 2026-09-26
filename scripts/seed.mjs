#!/usr/bin/env node
/**
 * The same seed plays the same show.
 *
 *   npm run seed            (node: the source gate, the generator, the libraries)
 *   npm run seed -- --lab   (and the lab: seeded injection through the real
 *                            solver and plate shader, read back twice)
 *   npm run seed -- --app   (and the built app: ?seed= reaches it and it says
 *                            which seed it is on; after a build)
 *
 * PLAN.md §6 is "Render this song", and its gate is that the same song
 * rendered twice is byte-identical. That needs every number that decides what
 * reaches the plate to come from a seed rather than from `Math.random`, and
 * there were 199 of them. They now come from `src/lib/rng.ts`: one seed a
 * night, and one named stream per purpose so that a draw added in one place
 * cannot move the numbers another place gets. Five remain, all ids. What this checks is that
 * property, not a picture:
 *
 *   1. The source. No `Math.random` anywhere in `src` outside the allowlist
 *      below, each entry with its reason and its count — so a new one, even in
 *      a file that already has an allowed one, is caught. Parsed with the
 *      TypeScript compiler rather than grepped, so a `Math.random` in a
 *      comment (several files explain why they avoid it) is not a hit and one
 *      passed as a value (`rand = Math.random`) is. Also caught: a
 *      `createNoise2D()` with no argument, which builds its table from
 *      `Math.random` out of sight — that is how the noise a look is laid with
 *      escaped every earlier attempt to make the plate repeatable.
 *   2. The generator: the same (seed, name) is the same sequence, a different
 *      seed or name is a different one, every helper draws exactly once, and
 *      a million draws are flat.
 *   3. The libraries the plate is decided by — the beads, the bubbles, the
 *      closeup camera, the chemistry, the palette, the modulators, the
 *      phrasing, Evolve's wander and Lucky — run twice on one seed and once on
 *      another, through the show's own streams exactly as the app calls them.
 *      Twice is identical; the other seed is not. And the streams are
 *      independent: churning the bubbles first leaves the beads where they
 *      were.
 *   4. That building one of those objects draws nothing. The visualizer makes
 *      them as `useRef(new X())`, which constructs one on every render; a
 *      constructor that drew from its stream would move the show by however
 *      many times React rendered.
 *   5. With `--lab`: the lab's GPU solver fed seeded dye and seeded bubbles,
 *      stepped and drawn by the real plate shader, twice on one seed and once
 *      on another, compared byte for byte. What the node checks cannot say is
 *      whether the GPU half then does the same thing twice; this does.
 *
 * What is not covered: `doseLiquid`'s pick and the automation's draws live in
 * `LiquidVisualizer.tsx`, which cannot be imported without React and a DOM,
 * so they are held by the source gate (no `Math.random` left there) and by
 * the stream they share with nothing else, not by a replay.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { makeRng, parseSeed, restartStreams, setShowSeed, showSeed, stream } from '../src/lib/rng.ts';
import { BeadField } from '../src/lib/beads.ts';
import { BubbleField } from '../src/lib/bubbles.ts';
import { MacroCamera } from '../src/lib/macroCamera.ts';
import { ChemistryField } from '../src/lib/chemistry.ts';
import { Modulators } from '../src/lib/modulators.ts';
import { Phrasing } from '../src/lib/phrasing.ts';
import { driftLook } from '../src/lib/drift.ts';
import { luckyLook } from '../src/lib/lucky.ts';
import { pickHarmony, harmonyColor } from '../src/constants.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── 1. The source ─────────────────────────────────────────────────────

/*
  What may still be random, and why. Keyed by file, then by kind, with the
  count: a second `Math.random` in a file that is allowed one is a new call
  and fails. Every entry here is something that never reaches the plate AND
  must not repeat — a seeded id would come out the same for two sessions on
  one `?seed=`, and the second saved thing would overwrite the first.
*/
const ALLOW = {
  'src/lib/rng.ts': {
    crypto: 2,   // the guard that there is a getRandomValues, and the call
    why: 'the seed itself: drawn once a load from crypto.getRandomValues, which is what makes the live show vary night to night',
  },
  'src/lib/crashLog.ts': {
    'Math.random': 1,
    why: 'names one page load in crash reports; two loads on the same ?seed= must still be two loads',
  },
  'src/hooks/useMusicIntelligence.ts': {
    'Math.random': 1,
    why: 'the id a recorded performance is stored under; seeded, a second session on the same seed would overwrite the first take',
  },
  'src/hooks/useMidi.ts': {
    'Math.random': 1,
    why: 'the id of a new MIDI binding in a saved map; never on the plate, must not collide across sessions',
  },
  'src/lib/midi.ts': {
    'Math.random': 1,
    why: 'the fallback id of a loaded MIDI binding that arrived without one; never on the plate',
  },
  'src/lib/outputConfig.ts': {
    'Math.random': 1,
    why: 'the fallback id of a projector surface in a saved output setup; never drawn',
  },
};

/** Every source of randomness in one file, by kind, with lines. */
function randomnessIn(text, fileName) {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const found = [];
  const at = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const isMath = (e) => ts.isIdentifier(e) && e.text === 'Math';
  const visit = (n) => {
    if (ts.isPropertyAccessExpression(n) && isMath(n.expression) && n.name.text === 'random') found.push({ kind: 'Math.random', line: at(n) });
    if (ts.isElementAccessExpression(n) && isMath(n.expression) && ts.isStringLiteralLike(n.argumentExpression) && n.argumentExpression.text === 'random') {
      found.push({ kind: 'Math.random', line: at(n) });
    }
    // simplex-noise's factories fall back to Math.random when handed nothing.
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^createNoise[234]D$/.test(n.expression.text) && n.arguments.length === 0) {
      found.push({ kind: 'unseeded noise', line: at(n) });
    }
    if (ts.isPropertyAccessExpression(n) && (n.name.text === 'getRandomValues' || n.name.text === 'randomUUID')) found.push({ kind: 'crypto', line: at(n) });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

// The gate is only as good as what it can see, so first: does it see?
{
  const probe = [
    '// Math.random() in a line comment',
    '/* and Math.random() in a block */',
    "const s = 'Math.random() in a string';",
    'const a = Math.random();',
    "const b = Math['random']();",
    'function f(rand = Math.random) { return rand; }',
    'const n = createNoise2D();',
    'const m = createNoise2D(rng.float);',
    'const c = crypto.getRandomValues(new Uint32Array(1));',
  ].join('\n');
  const hits = randomnessIn(probe, 'probe.ts');
  const lines = hits.map((h) => `${h.kind}@${h.line}`).join(', ');
  check('the gate sees code and not comments or strings', lines === 'Math.random@4, Math.random@5, Math.random@6, unseeded noise@7, crypto@9', lines);
}

{
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) files.push(p);
    }
  };
  walk('src');
  const byFile = new Map();
  for (const f of files) {
    const hits = randomnessIn(fs.readFileSync(f, 'utf8'), f);
    if (hits.length) byFile.set(f.split(path.sep).join('/'), hits);
  }
  const stray = [];
  let total = 0, allowed = 0;
  for (const [f, hits] of byFile) {
    const counts = {};
    for (const h of hits) counts[h.kind] = (counts[h.kind] ?? 0) + 1;
    for (const [k, n] of Object.entries(counts)) {
      total += n;
      const ok = ALLOW[f]?.[k] ?? 0;
      if (n > ok) stray.push(`${f}: ${n} ${k} (${ok} allowed) at line ${hits.filter((h) => h.kind === k).map((h) => h.line).join(', ')}`);
      else allowed += n;
    }
  }
  const stale = [];
  for (const [f, entry] of Object.entries(ALLOW)) {
    for (const [k, n] of Object.entries(entry)) {
      if (k === 'why') continue;
      const have = (byFile.get(f) ?? []).filter((h) => h.kind === k).length;
      if (have < n) stale.push(`${f}: allows ${n} ${k}, has ${have}`);
    }
  }
  console.log(`      ${files.length} source files; ${total} sources of randomness, ${allowed} of them allowed:`);
  for (const [f, entry] of Object.entries(ALLOW)) console.log(`        ${f} — ${entry.why}`);
  check('nothing in src draws from Math.random, or unseeded noise, outside the allowlist', stray.length === 0,
    stray.length ? stray.join('; ') : `${total - allowed} strays`);
  check('and the allowlist is no longer than what is there', stale.length === 0, stale.join('; ') || 'every entry still used');
}

// ── 2. The generator ─────────────────────────────────────────────────

const take = (rng, n) => Array.from({ length: n }, () => rng.float());
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const differing = (a, b) => a.filter((v, i) => v !== b[i]).length;
/** A short, printable fingerprint of a list of numbers (FNV-1a over their bits). */
const print = (nums) => {
  const f = new Float64Array(nums.length); f.set(nums);
  const bytes = new Uint8Array(f.buffer);
  let h = 0x811c9dc5;
  for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
};

{
  const a = take(makeRng(1, 'a'), 10000), a2 = take(makeRng(1, 'a'), 10000);
  const b = take(makeRng(2, 'a'), 10000), c = take(makeRng(1, 'b'), 10000);
  check('one (seed, name) is one sequence', same(a, a2), `10000 draws, ${print(a)} twice`);
  check('another seed is another sequence', differing(a, b) > 9990, `${differing(a, b)} of 10000 differ`);
  check('another name is another sequence', differing(a, c) > 9990, `${differing(a, c)} of 10000 differ`);
  const e1 = take(makeRng(1, 'a', 'look:galaxy'), 1000);
  check('an event is a sequence of its own', differing(a.slice(0, 1000), e1) > 995, `${differing(a.slice(0, 1000), e1)} of 1000 differ from the event-less start`);
  const r = makeRng(1, 'a'); take(r, 500); r.restart();
  check('restarting goes back to the start', same(take(r, 1000), a.slice(0, 1000)));

  // Flat: a million draws into 64 bins. The threshold is the chi-square with
  // 63 degrees of freedom at p = 0.0001 (about 113); a fixed seed, so this
  // is a property of the implementation, not a coin toss each run.
  const big = makeRng(20260926, 'uniformity');
  const bins = new Array(64).fill(0);
  let sum = 0, lo = 1, hi = 0;
  for (let i = 0; i < 1e6; i++) { const v = big.float(); sum += v; if (v < lo) lo = v; if (v > hi) hi = v; bins[Math.floor(v * 64)]++; }
  const want = 1e6 / 64;
  const chi = bins.reduce((s, n) => s + (n - want) ** 2 / want, 0);
  check('a million draws are flat over [0, 1)', lo >= 0 && hi < 1 && Math.abs(sum / 1e6 - 0.5) < 0.002 && chi < 113,
    `mean ${(sum / 1e6).toFixed(5)}, min ${lo.toExponential(2)}, max ${hi.toFixed(7)}, chi-square ${chi.toFixed(1)} on 63 dof`);

  // Each helper is one draw, and the same number the old idiom made of it,
  // so swapping `Math.random()` for one moves nothing after it in the stream.
  const helpers = [
    ['float', (g) => g.float(), (v) => v],
    ['range(3, 7)', (g) => g.range(3, 7), (v) => 3 + v * 4],
    ['int(7)', (g) => g.int(7), (v) => Math.floor(v * 7)],
    ['pick', (g) => g.pick(['a', 'b', 'c', 'd', 'e']), (v) => ['a', 'b', 'c', 'd', 'e'][Math.floor(v * 5)]],
    ['chance(0.3)', (g) => g.chance(0.3), (v) => v < 0.3],
    ['angle', (g) => g.angle(), (v) => v * Math.PI * 2],
    ['centred', (g) => g.centred(), (v) => v - 0.5],
    ['signed', (g) => g.signed(), (v) => v * 2 - 1],
  ];
  const wrong = [];
  for (const [name, use, idiom] of helpers) {
    const g = makeRng(9, 'helpers'), twin = makeRng(9, 'helpers');
    for (let i = 0; i < 200; i++) {
      const before = g.draws;
      const got = use(g), expect = idiom(twin.float());
      if (g.draws !== before + 1 || !Object.is(got, expect)) { wrong.push(name); break; }
    }
  }
  check('every helper is exactly one draw, the old idiom\'s number', wrong.length === 0, wrong.join(', ') || helpers.map((h) => h[0]).join(', '));

  const parsed = [parseSeed('42'), parseSeed('4294967297'), parseSeed(' 7 '), parseSeed('fillmore'), parseSeed('fillmore'), parseSeed(''), parseSeed(null)];
  check('?seed= reads a number as itself mod 2^32, a word as its hash, nothing as nothing',
    parsed[0] === 42 && parsed[1] === 1 && parsed[2] === 7 && Number.isInteger(parsed[3]) && parsed[3] === parsed[4] && parsed[5] === null && parsed[6] === null,
    `42→${parsed[0]}, 2^32+1→${parsed[1]}, "fillmore"→${parsed[3]}`);
}

{
  // The show's streams: one object each, re-keyed in place.
  setShowSeed(11);
  const s = stream('plate.beads');
  const first = take(s, 50);
  setShowSeed(11);
  check('a reseed restarts a stream, and it is the same object', stream('plate.beads') === s && same(take(s, 50), first) && showSeed() === 11,
    `seed ${showSeed()}, ${print(first)} twice`);
  // Laying a look restarts the plate's streams from (seed, look), whatever came before.
  setShowSeed(11);
  take(stream('plate.beads'), 777);
  const lucky = stream('show.lucky'); take(lucky, 3);
  const luckyNext = makeRng(11, 'show.lucky'); take(luckyNext, 3);
  const restarted = restartStreams('look:galaxy', 'plate.');
  const afterHistory = take(stream('plate.beads'), 50);
  // A plate stream nobody had asked for yet when the look was laid.
  const late = take(stream('plate.late'), 50);
  check('laying a look leaves Lucky running on', same(take(lucky, 5), take(luckyNext, 5)), 'show.lucky continued where it was, not restarted');
  setShowSeed(11);
  take(stream('plate.late'), 3);
  restartStreams('look:galaxy', 'plate.');
  const fresh = take(stream('plate.beads'), 50);
  check('laying a look restarts the plate from (seed, look), history or none', same(afterHistory, fresh), `${restarted} plate streams restarted; 777 draws of history made no difference`);
  check('and a stream first asked for after the look was laid starts where it would have', same(late, take(stream('plate.late'), 50)),
    'made after the restart, or there to be restarted: the same sequence');
}

// ── 3. The libraries, as the app calls them ──────────────────────────

const N = 192, dt = 1 / 60;
const swirl = (x, y) => [Math.sin(y * 0.05) * 0.004, Math.cos(x * 0.05) * 0.004];
const lay = (seed) => { setShowSeed(seed); restartStreams('look:fillmore-1969', 'plate.'); };

const churnBubbles = () => {
  const f = new BubbleField(N);
  for (let t = 0; t < 240; t++) { if (t % 20 === 0) f.spawn(60 + t / 4, 90, 5, 3, 20); f.step(dt, swirl, 0, 0, 1, 0.8); }
};
const churnBeads = () => {
  const f = new BeadField(N);
  f.populate(300, 1);
  for (let t = 0; t < 120; t++) f.step(dt, swirl, 0, 0);
};

const beads = (seed, churn = false) => {
  lay(seed);
  if (churn) churnBubbles();
  const f = new BeadField(N);
  f.populate(420, 1);
  for (let t = 0; t < 180; t++) f.step(dt, swirl, 0.0002, -0.0001);
  return { n: f.beads.length, nums: f.beads.flatMap((b) => [b.x, b.y, b.r, b.seed]), first: f.beads[0] };
};
const bubbles = (seed, churn = false) => {
  lay(seed);
  if (churn) churnBeads();
  const f = new BubbleField(N);
  f.spawn(96, 96, 6, 8, 24);
  for (let t = 0; t < 360; t++) {
    if (t < 90) f.blow(50, 140, dt, 1);
    f.step(dt, swirl, 0, 0, 1, 0.6);
    if (t % 90 === 45) f.spawn(40 + t / 6, 60, 5, 4, 16);
  }
  f.pack(1);
  return { n: f.bubbles.length, nums: [...f.bubbles.flatMap((b) => [b.x, b.y, b.r, b.wph, b.lobes]), ...f.packed] };
};
const macro = (seed) => {
  lay(seed);
  // Sixteen drops of equal mass on a 64² plate: which one a cut goes to is
  // decided by the camera's jitter, so a seed that did not reach it would show.
  const M = 64, density = new Float32Array(M * M), vx = new Float32Array(M * M), vy = new Float32Array(M * M);
  for (let k = 0; k < 16; k++) {
    const cx = 10 + (k % 4) * 14, cy = 10 + Math.floor(k / 4) * 14;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) density[i + j * M] += Math.exp(-((i - cx) ** 2 + (j - cy) ** 2) / 6);
  }
  const cam = new MacroCamera();
  const shots = [];
  for (let t = 0; t < 900; t++) { const s = cam.update({ density, vx, vy, size: M }, dt, { zoom: 4, chase: 0.5, hold: 1.2 }); shots.push(s.cx, s.cy); }
  const cuts = new Set(); for (let t = 0; t < shots.length; t += 60) cuts.add(`${shots[t].toFixed(2)},${shots[t + 1].toFixed(2)}`);
  return { n: cuts.size, nums: shots };
};
const chemistry = (seed) => {
  lay(seed);
  const c = new ChemistryField(96);
  c.reset();
  c.step(120);
  return { n: c.activator.reduce((s, v) => s + (v > 0.2 ? 1 : 0), 0), nums: Array.from(c.activator) };
};
const palette = (seed) => {
  lay(seed);
  const nums = [];
  for (let i = 0; i < 60; i++) { const h = pickHarmony(); const c = harmonyColor(h); nums.push(...h, c.r, c.g, c.b); }
  return { n: 60, nums };
};
const modulators = (seed) => {
  lay(seed);
  const m = new Modulators();
  const nums = [];
  for (let t = 0; t < 1200; t++) { m.step(dt, 128); nums.push(m.value('lfo4')); }
  return { n: new Set(nums).size, nums };
};
const phrasing = (seed) => {
  lay(seed);
  const p = new Phrasing();
  const nums = [];
  for (let t = 0; t < 3600; t++) { const ph = p.step(dt, 1, 0.5); nums.push(ph.drive, ph.gust, ph.drift); }
  return { n: nums.filter((v, i) => i % 3 === 1 && v > 0.3).length, nums };
};
const wander = (seed) => {
  lay(seed);
  const nums = [];
  let cur = { ...DEFAULT_SETTINGS };
  for (let i = 0; i < 40; i++) {
    const patch = driftLook(cur, DEFAULT_SETTINGS, 1);
    for (const [k, v] of Object.entries(patch).sort()) nums.push(k.length, v);
    cur = { ...cur, ...patch };
  }
  return { n: 40, nums };
};
const lucky = (seed) => {
  lay(seed);
  const nums = [];
  for (let i = 0; i < 20; i++) {
    const look = luckyLook(DEFAULT_SETTINGS, ['#ff0000', '#00ff00', '#0000ff']);
    for (const [k, v] of Object.entries(look).sort(([a], [b]) => (a < b ? -1 : 1))) nums.push(typeof v === 'number' ? v : String(v).length);
  }
  return { n: 20, nums };
};

const libs = [
  ['beads', beads, (r) => `${r.n} beads, first at (${r.first.x.toFixed(2)}, ${r.first.y.toFixed(2)}) r ${r.first.r.toFixed(2)}`],
  ['bubbles', bubbles, (r) => `${r.n} bubbles after six seconds`],
  ['closeup camera', macro, (r) => `${r.n} distinct framings in fifteen seconds`],
  ['chemistry', chemistry, (r) => `${r.n} active cells`],
  ['palette', palette, () => '60 palettes and drop colours'],
  ['modulators', modulators, (r) => `${r.n} distinct stepped-LFO values`],
  ['phrasing', phrasing, (r) => `${r.n} gusty frames in a minute`],
  ["Evolve's wander", wander, () => '40 drifts'],
  ['Lucky', lucky, () => '20 rolls'],
];
for (const [name, run, say] of libs) {
  const a = run(5), a2 = run(5), b = run(6);
  const d = differing(a.nums, b.nums);
  check(`${name}: seed 5 twice is the same`, same(a.nums, a2.nums), `${say(a)}; ${a.nums.length} numbers, ${print(a.nums)} both times`);
  check(`${name}: seed 6 is not seed 5`, d > 0, `${d} of ${a.nums.length} numbers differ; ${say(b)}`);
}

// The streams are independent: what one draws never moves another.
{
  const quiet = beads(5), churned = beads(5, true);
  check('the bubbles drawing hundreds of numbers first leaves every bead where it was', same(quiet.nums, churned.nums),
    `${stream('plate.bubbles').draws} bubble draws in between; beads ${print(quiet.nums)} both times`);
  const qb = bubbles(5), cb = bubbles(5, true);
  check('and the beads drawing first leaves every bubble where it was', same(qb.nums, cb.nums), `bubbles ${print(qb.nums)} both times`);
}

// ── 4. Building one draws nothing ────────────────────────────────────
{
  const built = [
    ['plate.beads', () => new BeadField(N)],
    ['plate.bubbles', () => new BubbleField(N)],
    ['plate.chemistry', () => new ChemistryField(64)],
    ['plate.macro', () => new MacroCamera()],
    ['plate.modulators', () => new Modulators()],
    ['plate.phrasing', () => new Phrasing()],
  ];
  const moved = [];
  lay(5);
  for (const [name, make] of built) {
    const before = stream(name).draws;
    for (let i = 0; i < 25; i++) make();   // twenty-five renders' worth
    if (stream(name).draws !== before) moved.push(`${name} +${stream(name).draws - before}`);
  }
  check('constructing any of them, as every React render does, draws nothing from the show', moved.length === 0,
    moved.join(', ') || `${built.length} kinds, 25 each`);
  // And what a construction does draw — the chemistry's opening seeds, the
  // beads' patch offset — is still the seed's, not the clock's.
  setShowSeed(5); const c1 = Array.from(new ChemistryField(64).activator);
  setShowSeed(5); const c2 = Array.from(new ChemistryField(64).activator);
  setShowSeed(6); const c3 = Array.from(new ChemistryField(64).activator);
  check('while its opening state is still the seed\'s', same(c1, c2) && differing(c1, c3) > 0, `chemistry opening ${print(c1)} twice, ${differing(c1, c3)} cells differ on seed 6`);
}

// ── 5. The lab ───────────────────────────────────────────────────────
if (process.argv.includes('--lab')) {
  const { openLab } = await import('./lab.mjs');
  /*
    A plate laid the way `boiling-point` lays one — forty blobs, a dye and a
    size each from the plate's stream — with a seeded field of bubbles on it,
    stepped by the GPU solver and drawn by the plate shader. The node half
    decides every number; the page only runs the GPU. Twice on one seed must
    be the same bytes; the other seed must not be.
  */
  const plan = (seed) => {
    lay(seed);
    const r = stream('plate.fluid.0');
    const blobs = [];
    for (let i = 0; i < 40; i++) {
      blobs.push({ x: 0.06 + r.float() * 0.88, y: 0.06 + r.float() * 0.88, r: 0.02 + r.float() * 0.04,
        rgb: [r.float(), r.float(), r.float()], d: 0.6 + r.float() });
    }
    const kicks = [];
    for (let i = 0; i < 12; i++) kicks.push({ x: 0.1 + r.float() * 0.8, y: 0.1 + r.float() * 0.8, v: [r.centred() * 0.02, r.centred() * 0.02, 0, 0] });
    const f = new BubbleField(256);
    f.spawn(128, 128, 8, 10, 60);
    for (let t = 0; t < 60; t++) f.step(dt, swirl, 0, 0, 1, 0.5);
    const count = f.pack(1);
    return { blobs, kicks, bubbles: { packed: Array.from(f.packed), finger: Array.from(f.packedFinger), count } };
  };
  const { page, close } = await openLab();
  try {
    const run = (p) => page.evaluate(async (p) => {
      await lab.create(256);
      for (const b of p.blobs) lab.dye(b.x, b.y, b.r, b.rgb, b.d);
      for (const k of p.kicks) lab.vel(k.x, k.y, 0.08, k.v);
      lab.flush();
      lab.solver().setBubbles(new Float32Array(p.bubbles.packed), p.bubbles.count, 0.8, new Float32Array(p.bubbles.finger));
      await lab.step(90);
      const dye = await lab.field('dye');
      const px = await lab.render(160, {}, { bubbles: 0.8 });
      return { dye, px };
    }, p);
    const bytesOf = (a) => new Uint8Array(new Float32Array(a).buffer);
    const a = await run(plan(5)), a2 = await run(plan(5)), b = await run(plan(6));
    const diffDye = (x, y) => { const p = bytesOf(x), q = bytesOf(y); let n = 0; for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) n++; return n; };
    const diffPx = (x, y) => { let n = 0; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) n++; return n; };
    check('lab: seed 5 twice, the solver\'s dye is the same to the byte', diffDye(a.dye, a2.dye) === 0,
      `${a.dye.length} floats after 90 steps, ${diffDye(a.dye, a2.dye)} bytes differ`);
    check('lab: and the plate shader draws the same picture', diffPx(a.px, a2.px) === 0, `${a.px.length / 4} pixels, ${diffPx(a.px, a2.px)} bytes differ`);
    const d = diffPx(a.px, b.px);
    check('lab: seed 6 is another picture', d > a.px.length * 0.05, `${d} of ${a.px.length} bytes differ`);
  } finally { await close(); }
} else {
  console.log('      (the lab half runs with `--lab`: it needs WebGPU, which CI\'s Mac has)');
}

// ── 6. The app ───────────────────────────────────────────────────────
/*
  The built app, for what only a page can say: that `?seed=` reaches it, that
  the seed it is running on can be read back from it, and that without one
  two loads are two different shows. Nothing here reads a frame, so it holds
  on a machine with no GPU too; it needs `npm run build` first.
*/
if (process.argv.includes('--app')) {
  const { spawn } = await import('node:child_process');
  const { chromium } = await import('playwright');
  const { launchChromium } = await import('./chromium.mjs');
  let server = null, port = 4390;
  for (let t = 0; t < 6 && !server; t++) {
    const child = spawn('./node_modules/.bin/vite', ['preview', '--port', String(4390 + t), '--strictPort'], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
    let died = false;
    child.on('exit', () => { died = true; });
    await new Promise((r) => setTimeout(r, 2500));
    if (!died) { server = child; port = 4390 + t; }
  }
  if (!server) { console.error('the preview did not start on ports 4390-4395 (a busy port, or vite preview failing: its errors are above)'); process.exit(2); }
  const browser = await launchChromium(chromium);
  try {
    const seedOf = async (query) => {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${port}/${query}`, { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.__cgSeed === 'number', null, { timeout: 30000 });
      const seed = await page.evaluate(() => window.__cgSeed);
      await page.close();
      return seed;
    };
    const fixed = await seedOf('?seed=1234&look=classic');
    const named = await seedOf('?seed=fillmore&look=classic');
    const a = await seedOf('?look=classic'), b = await seedOf('?look=classic');
    check('app: ?seed=1234 runs the show on 1234, readable as window.__cgSeed', fixed === 1234, `read back ${fixed}`);
    check('app: a named seed runs on that name\'s number', named === parseSeed('fillmore'), `?seed=fillmore → ${named}`);
    check('app: with no ?seed=, two loads are two shows', Number.isInteger(a) && Number.isInteger(b) && a !== b, `${a}, then ${b}`);
  } finally {
    await browser.close();
    try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
