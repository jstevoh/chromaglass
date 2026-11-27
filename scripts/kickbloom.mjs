#!/usr/bin/env node
/**
 * The kick's bloom (`npm run kickbloom`, node only, about a second).
 *
 * The droplets each kick throws used to be inline in the visualizer's frame
 * loop, where only a grep of the source could reach them (panel.mjs held them
 * that way). PLAN 19ai-10 moved them to lib/kickBloom.ts, so this calls the
 * code that runs, on a sink that records every droplet, and keeps the grep
 * only for what stays in the loop: what the loop hands the bloom.
 *
 *  1. The dial (Kick Bloom). Since PLAN 38v-1 the bloom is a cord on every
 *     look the music plays (lib/musicCords.ts): the kick's hit, gated, on a
 *     dropper that lets go a slug of drops and a dose of the bottle's liquid,
 *     riding Sound Drive and Kick Bloom as masters. Played by the real hands
 *     (lib/areaCords.ts) for 40 kicks: twice the dial lays twice the dye, and
 *     at 0 no drop and no dose. (The droplets' push went with the frame
 *     loop's block: a drop's own volume pushes the liquid aside.)
 *  2. Not a ring (the owner, 2026-10-21). Over 200 seeded slugs of about
 *     eight drops (lib/kickBloom.ts scatterBloom, as the bloom cord lays them), the
 *     droplets' angles round the burst's centre are not evenly spaced: in a
 *     kick of n droplets on one circle every gap is 2π/n; here the largest
 *     gap in a kick averages well over twice that (a lobe of clumps and an
 *     empty side). And 5 to 11 droplets a kick, as the comment says.
 *  3. A touch on a reagent lays no dye (PLAN 25i-10). An area whose liquid is
 *     a reagent (Chemical Clock's three activator places, Red Cabbage's acid
 *     and base wells) answers the music with a drop of that reagent, and its
 *     colour is the chemistry's. The cords were made so in 25i; the loop's
 *     own hands were not, and every kick threw 5 to 11 droplets of the area's
 *     dye on the gel, which stands still and kept them, so they piled into
 *     the clusters the owner saw on the live stream (2026-11-10). Three
 *     parts: (a) `musicDyeIn` is 0 for every reagent area a look ships,
 *     the five the report names among them, and 1 for every other; (b) the
 *     pour honours it: `autoInject` with no colour lays none in any of the
 *     five styles Inject Style can pick (only the drop did, so a spray or a
 *     pour of reagent was still coloured); (c) in the loop, every area colour
 *     (`areaCycle`, `areaColor`) is read into a const, every use of that
 *     const is inside a pour (`autoInject`, `addDensity`, `throwKickBloom`),
 *     and each pour carries `musicDyeIn` of the same area in the argument
 *     that lays the colour (autoInject's `dye`, the factor on addDensity's
 *     amount, the bloom's dye gain). The check's own controls, each red: the
 *     old autoInject; the gate moved to the energy argument; an ungated pour
 *     of a colour read without a ternary; a colour destructured; an ungated
 *     pour of the bloom's colour beside the bloom; the gate of another area.
 *     Two such pours are left in the loop (the automation's); the music's
 *     left it for the cords, so (d): Red Cabbage's music cords, under loud
 *     music and twenty kicks, lay no dye in its two reagent wells and drop
 *     the reagent once a kick.
 */
import { readFileSync } from 'node:fs';
import { scatterBloom } from '../src/lib/kickBloom.ts';
import { musicDyeIn, reagentArea, AreaHands, plateArea } from '../src/lib/areaCords.ts';
import { cordReading } from '../src/lib/sceneMap.ts';
import { PRESETS } from '../src/presets.ts';
import { PRESET_AREAS } from '../src/lib/plateAreas.ts';
import { makeRng } from '../src/lib/rng.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

const vis = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
const bloomSrc = readFileSync('src/lib/kickBloom.ts', 'utf8');

/** One kick's scatter on a recording sink: the dye laid and each drop's cell (lib/kickBloom.ts scatterBloom). */
function kick(seed, total = 7.3, drops = 8) {
  const dice = makeRng(seed, 'kickbloom');
  const rec = { dye: 0, dyed: 0, cells: [] };
  scatterBloom((x, y, a) => { rec.dye += a; rec.dyed++; rec.cells.push([x, y]); }, () => dice.float(), 128, 128, 24, total, drops);
  return rec;
}

/** A look's bloom cord, played by the real hands on a recording sink for `kicks` kicks of `hit`, under these masters. */
function bloomOf(cords, masters, kicks = 40, hit = 0.8) {
  const hands = new AreaHands();
  const plate = plateArea(5);
  const rec = { dye: 0, drops: 0, doses: 0 };
  const sink = {
    heat() {}, dye() {}, paddle() {},
    drop(x, y, a, c, slug) { if (slug) { rec.dye += a; rec.drops++; } },
    dose() { rec.doses++; },
  };
  const dice = makeRng(7, 'kickbloom-cord');
  for (let k = 0; k < kicks; k++) {
    for (let step = 0; step < 30; step++) {
      const v = step < 3 ? hit : 0;
      const ctx = { sound: { features: {} }, shape: null, room: null, film: null, hits: { value: () => v }, roomImpact: 0, filmImpact: 0, soundImpact: 1, shapeImpact: 1, masters };
      hands.step(cords, null, (m, band) => cordReading(ctx, m, 0, band), 1 / 60, plate, masters);
      hands.lay(sink, 192, 1 / 60, () => ({ r: 1, g: 1, b: 1 }), 0, { pace: 1, dice: () => dice.float(), plate });
    }
  }
  return rec;
}

// ── 1. The dial ──
/*
  Since PLAN 38v-1 the bloom is a cord on every look: the kick's hit, gated,
  on a dropper that lets go a slug of drops, riding Sound Drive and Kick
  Bloom as its masters. The dial is the second master: twice the dial, twice
  the dye; at 0 none at all, and no dose either.
*/
{
  const bad = [];
  let looks = 0;
  for (const p of PRESETS) {
    if (!((p.settings.audioImpact ?? 0.45) > 0.01)) continue;
    looks++;
    const b = (p.settings.sceneMappings ?? []).filter(m => m.role === 'bloom');
    if (!b.length || !b.every(m => m.source === 'hits' && m.feature === 'kickHit' && m.mode === 'gate' && m.setting === 'areaPour'
      && m.volume > 0 && m.masters?.includes('kickBloom') && m.masters?.includes('audioImpact'))) bad.push(p.id);
  }
  check('every look the music plays carries the kick\'s bloom as a gated dropper on the kick, riding Sound Drive and Kick Bloom',
    looks >= 30 && bad.length === 0, bad.length ? bad.join(', ') : `${looks} looks`);
  const cords = PRESETS.find(p => p.id === 'classic').settings.sceneMappings.filter(m => m.role === 'bloom');
  const one = bloomOf(cords, { audioImpact: 1, kickBloom: 1 });
  const two = bloomOf(cords, { audioImpact: 1, kickBloom: 2 });
  const none = bloomOf(cords, { audioImpact: 1, kickBloom: 0 });
  check('Kick Bloom scales the slug\'s dye (twice the dial, twice the dye) and at 0 lays none and doses nothing',
    one.drops > 40 * 4 && Math.abs(two.dye / one.dye - 2) < 0.15 && none.dye === 0 && none.drops === 0 && none.doses === 0 && one.doses === 40,
    `dye x${(two.dye / one.dye).toFixed(3)}; ${one.drops} drops and ${one.doses} doses in 40 kicks; at 0 ${none.drops} drops, ${none.doses} doses`);
}

// ── 2. Not a ring ──
{
  let gapRatio = 0, kicks = 0, fewest = Infinity, most = 0;
  for (let s = 0; s < 200; s++) {
    const k = kick(100 + s);
    const n = k.cells.length;
    fewest = Math.min(fewest, n); most = Math.max(most, n);
    if (n < 3) continue;
    const cx = k.cells.reduce((t, p) => t + p[0], 0) / n, cy = k.cells.reduce((t, p) => t + p[1], 0) / n;
    const ang = k.cells.map(([x, y]) => Math.atan2(y - cy, x - cx)).sort((p, q) => p - q);
    let big = ang[0] + 2 * Math.PI - ang[n - 1];
    for (let i = 1; i < n; i++) big = Math.max(big, ang[i] - ang[i - 1]);
    gapRatio += big / (2 * Math.PI / n); kicks++;
  }
  gapRatio /= kicks;
  check('the droplets are clumps at random angles, not evenly round one circle (largest gap over 2.3x an even ring\'s)',
    gapRatio > 2.3 && bloomSrc.includes('lobeAt') && !/\(d \/ n\) \* Math\.PI \* 2/.test(bloomSrc),
    `largest gap ${gapRatio.toFixed(2)}x an even ring's, over ${kicks} kicks`);
  check('5 to 11 droplets a kick, both ends reached', fewest === 5 && most === 11, `${fewest} to ${most}`);
}

// ── 3. A touch on a reagent lays no dye ──
{
  // (a) Which areas: every reagent area 0, every other 1, and the ones the owner's report names among the 0s.
  const wrong = [];
  const zero = new Set();
  let others = 0;
  for (const [id, areas] of Object.entries(PRESET_AREAS)) {
    areas.forEach((a, i) => {
      const want = reagentArea(a) ? 0 : 1;
      if (want === 0) zero.add(`${id}:${i}`); else others++;
      if (musicDyeIn(a) !== want) wrong.push(`${id} area ${i} (${a.liquid}) ${musicDyeIn(a)}`);
    });
  }
  const named = ['chemical-clock:0', 'chemical-clock:1', 'chemical-clock:2', 'red-cabbage:0', 'red-cabbage:1'];
  const missing = named.filter(k => !zero.has(k));
  check('the music lays no dye in a reagent area (Chemical Clock\'s three places, Red Cabbage\'s two wells) and all of it in any other',
    wrong.length === 0 && missing.length === 0 && musicDyeIn(null) === 1 && others > zero.size,
    wrong.length || missing.length ? [...wrong, ...missing.map(k => `${k} not a reagent`)].join('; ') : `${zero.size} reagent areas, ${others} others`);

  // (b) The share of colour is honoured by the pour itself, in every style it can take (Inject Style picks it).
  // The CPU plate, on node: the GPU's usage flags are named at its import, so give it their values first.
  globalThis.GPUTextureUsage ??= { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
  globalThis.GPUBufferUsage ??= { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
  globalThis.GPUMapMode ??= { READ: 1, WRITE: 2 };
  globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  const { FluidSimulation } = await import('../src/sim/fluidSimulation.ts');
  const laid = {};
  for (const style of ['drop', 'spray', 'splatter', 'pour', 'streak']) {
    const sim = new FluidSimulation(128, 0, 0, 0.1);
    let sum = 0, full = 0;
    const add = sim.addDensity.bind(sim);
    sim.addDensity = (x, y, a, ...rest) => { sum += a; return add(x, y, a, ...rest); };
    sim.autoInject(style, 64, 64, 5, 1, 0.5, 0.2, 0.6, false, 1); full = sum; sum = 0;
    sim.autoInject(style, 64, 64, 5, 1, 0.5, 0.2, 0.6, false, 0);
    laid[style] = [full, sum];
  }
  check('a pour with no colour in it lays no dye in any style (drop, spray, splatter, pour, streak)',
    Object.values(laid).every(([f, z]) => f > 0 && z === 0),
    Object.entries(laid).map(([k, [f, z]]) => `${k} ${f.toFixed(1)} -> ${z.toFixed(1)}`).join(', '));

  // (c) In the loop: every area colour read, every use of it, and the gate in the argument that lays it.
  const misses = [];
  const closeOf = (i) => { let depth = 0; for (let j = i; j < vis.length; j++) { if (vis[j] === '(') depth++; else if (vis[j] === ')' && --depth === 0) return j; } return -1; };
  const argsOf = (open, close) => {
    const out = []; let depth = 0, from = open + 1;
    for (let j = open + 1; j < close; j++) {
      const c = vis[j];
      if (c === '(' || c === '[' || c === '{') depth++; else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === ',' && depth === 0) { out.push(vis.slice(from, j).trim()); from = j + 1; }
    }
    out.push(vis.slice(from, close).trim());
    return out;
  };
  // The calls that lay colour, and which argument carries the share for each.
  const LAYERS = { autoInject: (g) => g[9] ?? '', addDensity: (g) => g[2] ?? '' };
  const callAround = (at) => {
    let best = null;
    for (const name of Object.keys(LAYERS)) {
      for (let k = vis.lastIndexOf(`${name}(`, at); k >= 0 && at - k < 600; k = vis.lastIndexOf(`${name}(`, k - 1)) {
        const open = k + name.length, close = closeOf(open);
        if (close > at && (!best || k > best.k)) { best = { k, name, open, close }; break; }
      }
    }
    return best;
  };
  const uses = [...vis.matchAll(/area(Cycle|Color)\(/g)].filter(m => !/const area(Cycle|Color) = \($/.test(vis.slice(m.index - 6, m.index + 11)) && !vis.slice(m.index - 6, m.index).endsWith('const '));
  const calls = new Map();
  let reads = 0;
  for (const m of uses) {
    const lineStart = vis.lastIndexOf('\n', m.index) + 1;
    const line = vis.slice(lineStart, vis.indexOf('\n', m.index));
    const d = line.match(/const (\w+) = (?:\w+ \? )?area(?:Cycle|Color)\([^,]+, (\w+)/);
    if (!d) { misses.push(`an area colour not read into a const: ${line.trim().slice(0, 80)}`); continue; }
    reads++;
    const [, v, area] = d;
    const declEnd = lineStart + line.length;
    const redecl = vis.indexOf(`const ${v} = `, declEnd);
    const end = Math.min(redecl < 0 ? vis.length : redecl, vis.split('\n').slice(0, vis.slice(0, declEnd).split('\n').length + 60).join('\n').length);
    const re = new RegExp(`\\b${v}\\b`, 'g');
    re.lastIndex = declEnd;
    for (let u = re.exec(vis); u && u.index < end; u = re.exec(vis)) {
      const call = callAround(u.index);
      if (!call) { misses.push(`${v} used outside a pour: ${vis.slice(u.index - 30, u.index + 30).replace(/\s+/g, ' ')}`); continue; }
      calls.set(call.k, { ...call, v, area });
    }
  }
  for (const { name, open, close, v, area } of calls.values()) {
    const share = LAYERS[name](argsOf(open, close));
    const ok = name === 'autoInject' ? share === `musicDyeIn(${area})` : new RegExp(`\\* musicDyeIn\\(${area}\\)$`).test(share);
    if (!ok) misses.push(`${name} of ${v}: the share is '${share.slice(0, 60)}'`);
  }
  check('every pour of an area\'s colour in the frame loop carries musicDyeIn of that area, in the argument that lays the colour',
    // Two now: the music's own pours left the loop for the cords (PLAN 38v-1); (d) holds those.
    reads >= 2 && calls.size >= 2 && misses.length === 0,
    misses.length ? misses.join(' | ') : `${reads} colours read, ${calls.size} pours`);
}

// (d) The music's cords in a reagent area: loud music and every kick, and no dye laid, only the reagent's drops.
{
  const look = PRESETS.find(p => p.id === 'red-cabbage');
  const areas = PRESET_AREAS['red-cabbage'];
  const cords = look.settings.sceneMappings.filter(m => m.role && m.area !== undefined);
  const hands = new AreaHands();
  const got = { dye: 0, drops: 0, liquid: 0 };
  const sink = { heat() {}, paddle() {}, dye(x, y, a) { got.dye += a; }, drop(x, y, a) { got.drops += a; }, liquid() { got.liquid++; }, dose() {} };
  const loud = { bass: 90, mid: 85, treble: 80, volume: 90, energy: 0.8, timbre: 60, complexity: 60, features: {} };
  for (let step = 0; step < 600; step++) {
    const v = step % 30 < 3 ? 0.9 : 0;
    const ctx = { sound: loud, shape: null, room: null, film: null, hits: { value: () => v }, roomImpact: 0, filmImpact: 0, soundImpact: 1, shapeImpact: 1, masters: { audioImpact: 1, kickBloom: 1 } };
    hands.step(cords, areas, (m, band) => cordReading(ctx, m, 0, band), 1 / 60, plateArea(5), ctx.masters);
    hands.lay(sink, 192, 1 / 60, () => ({ r: 1, g: 1, b: 1 }), 0, { pace: 1 });
  }
  check('the music\'s cords in Red Cabbage\'s reagent wells lay no dye under loud music and twenty kicks, only drops of the reagent',
    cords.length >= 3 && got.dye === 0 && got.drops === 0 && got.liquid >= 20, `${cords.length} cords; dye ${got.dye}, dropper ${got.drops}, ${got.liquid} reagent drops`);
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
