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
 *  1. The dial (Kick Bloom). The loop throws a bloom only on a kick with the
 *     dial over 0, and hands it the dial twice: in the dye's gain (with the
 *     fill's room, `autoAmp * pourDt * bloomGain`) and as the push's. And the
 *     bloom honours both: the dye it lays and the push it gives scale with
 *     their gains, each alone (twice the dye's gain, twice the dye and the
 *     same push), and a dye's gain of 0 lays no dye at all while the push is
 *     still thrown.
 *  2. Not a ring (the owner, 2026-10-21). Over 200 seeded kicks, the
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
 */
import { readFileSync } from 'node:fs';
import { throwKickBloom } from '../src/lib/kickBloom.ts';
import { musicDyeIn, reagentArea } from '../src/lib/areaCords.ts';
import { PRESET_AREAS } from '../src/lib/plateAreas.ts';
import { makeRng } from '../src/lib/rng.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

const vis = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
const bloomSrc = readFileSync('src/lib/kickBloom.ts', 'utf8');

/** One kick on a recording sink: the dye laid, the push given, each droplet's cell. */
function kick(seed, dyeGain, pushGain, hit = 0.8) {
  const dice = makeRng(seed, 'kickbloom');
  const rec = { dye: 0, push: 0, dyed: 0, cells: [] };
  const sink = {
    addDensity(x, y, a) { rec.dye += a; rec.dyed++; },
    addVelocity(x, y, vx, vy) { rec.push += Math.hypot(vx, vy); rec.cells.push([x, y]); },
  };
  throwKickBloom(sink, dice, 256, 128, 128, 24, { r: 1, g: 0.5, b: 0.2 }, hit, dyeGain, pushGain);
  return rec;
}

// ── 1. The dial ──
{
  const burst = vis.slice(vis.indexOf('const bloomGain'), vis.indexOf('// The beat dose'));
  check('the loop throws the bloom only on a kick with Kick Bloom over 0, and hands it the dial in the dye\'s gain and as the push\'s',
    /kickBloom \?\? 1/.test(burst) && /bloomGain > 0/.test(burst)
      && /throwKickBloom\([^;]*autoAmp \* pourDt \* bloomGain[^,;]*, bloomGain\);/.test(burst),
    'src/components/LiquidVisualizer.tsx');
  const a = kick(1, 1, 1), b = kick(1, 2, 1), c = kick(1, 1, 2), z = kick(1, 0, 1);
  const r = (x, y) => x / y;
  check('the bloom scales its dye with the dye\'s gain and its push with the push\'s, each alone',
    Math.abs(r(b.dye, a.dye) - 2) < 1e-9 && Math.abs(r(b.push, a.push) - 1) < 1e-9
      && Math.abs(r(c.push, a.push) - 2) < 1e-9 && Math.abs(r(c.dye, a.dye) - 1) < 1e-9,
    `dye x${r(b.dye, a.dye).toFixed(3)} push x${r(c.push, a.push).toFixed(3)}; the other x${r(b.push, a.push).toFixed(3)}, x${r(c.dye, a.dye).toFixed(3)}`);
  check('a dye\'s gain of 0 lays no dye, and the push is still thrown',
    a.dyed > 0 && z.dyed === 0 && z.dye === 0 && Math.abs(z.push - a.push) < 1e-9,
    `${z.dyed} droplets dyed of ${z.cells.length}; push ${z.push.toFixed(3)} against ${a.push.toFixed(3)}`);
}

// ── 2. Not a ring ──
{
  let gapRatio = 0, kicks = 0, fewest = Infinity, most = 0;
  for (let s = 0; s < 200; s++) {
    const k = kick(100 + s, 1, 1);
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
    gapRatio > 2.3 && bloomSrc.includes('lobeAt') && !/\(d \/ drops\) \* Math\.PI \* 2/.test(bloomSrc),
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
  const LAYERS = { autoInject: (g) => g[9] ?? '', addDensity: (g) => g[2] ?? '', throwKickBloom: (g) => g[8] ?? '' };
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
    reads >= 7 && calls.size >= 8 && misses.length === 0,
    misses.length ? misses.join(' | ') : `${reads} colours read, ${calls.size} pours`);
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
