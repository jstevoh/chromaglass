#!/usr/bin/env node
/**
 * The rest of a bubble's air, its checks written before the builds (PLAN
 * 15g-8c, 15g-8e, 15g-8f and 15g-8g in docs/plan/15-tools-on-liquids.md).
 *
 *   npm run bubbleair -- --owed=oldplate,species,mix,maze,donor,press
 *                             (the lab: any adapter that computes; in Measure's lab8 part)
 *
 * Each line under an id is printed as owed while what it asks for is absent,
 * and is red the day it passes with its id still listed (the convention of
 * `timers.mjs`, `soundowed.mjs` and `liveshow.mjs`): the PR that builds an
 * item takes its id out of `--owed` in scripts/checks.json and never edits a
 * line or a bar. A build that is there and misses is red, owed or not. The
 * lines with no id hold on main and keep each build from breaking what
 * already works. Ids and items:
 *
 *   oldplate  15g-8c   the old plate (Thin Gap off) carries the colour with its liquid
 *   species   15g-8e   the species carried alone takes the air
 *   mix       15g-8e   the oil's mix (mixAdvectSub) takes the air
 *   maze      15g-8e   the colour on the maze's own path takes the air
 *   donor     15g-8f   the carry empties a bubble and fills its hole without airShed
 *   press     15g-8g   the app lays no standing press under a bubble
 *
 * The plate is bubbledye's (`npm run bubbledye`, PLAN 15g-8b): Classic's step
 * and gap on a 128² grid, a pool of one colour (depth 1) of radius 0.3 in
 * the middle, five steps to settle, then one bubble held sixty steps. What a
 * carry owes a bubble is what the liquid it rides in does: the air between
 * the glasses pushes the liquid out of its way, so whatever the liquid holds
 * (the colour, a poured liquid's share, the oil) leaves with it, none is made
 * or lost, and when the air goes the liquid round it flows back with what it
 * holds. Every pool here is one concentration, so after a pop the right
 * answer is that concentration everywhere: the bars below are that physics
 * with the grid's rounding, not a picture.
 *
 * ## oldplate (15g-8c)
 *
 * With Thin Gap off the GPU still multiplies the colour under a bubble away
 * (airExclude, src/gpu/fluid.ts) and the CPU paints it back round the rim
 * from the readback mirror (depositBubbleRims, src/sim/fluidSimulation.ts),
 * frames late on a slow machine. The lab has no CPU half, so it reads the
 * GPU's alone, which is what the build makes right. On main (128², this
 * plate, Thin Gap 0): a bubble put down whole loses 2.6% of the pool's
 * colour, one drifting a fifth of the plate loses 6.6%, and a popped one's
 * hole stays empty (0.000 thirty steps after). Asked: each keeps the plate's
 * colour to TOTAL_KEPT %, piles no ring (the deepest cell under PEAK_MOST of
 * the pool), empties (under LEFT_MOST left in its middle: already 0 on main,
 * the multiply's doing, so a guard), and the pop's hole fills back to
 * HOLE_BACK of the pool in thirty steps, as bubbledye asks of the thin gap.
 * And the CPU's half is gone: no `depositBubbleRims` left in src/. What it is
 * owed for is absent while the old plate's step still runs `airExclude`.
 *
 * ## species, mix, maze (15g-8e)
 *
 * 15g-8b made the carries of amounts take the air (airLiquid in
 * wgsl/fluid.ts): colour per unit of liquid, a donor with air in it handing
 * on its liquid mixed with what comes in, and airShed after. Three carries
 * of what the liquid holds do not, each measured with a bubble of radius
 * 0.05 put down whole in the pool, sixty steps:
 *
 *   species  a poured liquid's share in a stage of its own (stepSpecies with
 *            `fuseSpecies` off, src/gpu/fluid/passes.ts): 0.343 of the
 *            pool's share left under the bubble, where the same pour riding
 *            with the colour (the pair, the default) leaves 0.006. So the two
 *            setups `npm run thick` holds equal part under air.
 *   mix      the oil's mix on a thin gap (mixAdvectSub, no Air kernel): an
 *            oil pool keeps 0.203 of its oil under the bubble.
 *   maze     the colour on the Labyrinth's own path (bodyAdvectThin in sixths,
 *            src/gpu/fluid.ts, the `!bodiesOn && mazeFlow` branch): it takes
 *            the air but airShed never runs after it, 0.032 left.
 *
 * Asked of each: the amount kept to TOTAL_KEPT % (holds on main), no ring
 * (holds), and no more left in the bubble's middle than the colour's own
 * carry leaves under the same bubble on the same plate (a control run
 * first), MATCH_MOST over it at most and never over LEFT_MOST, bubbledye's
 * bar. Held to the colour's carry rather than to a fixed number, because
 * that carry is what 15g-8f changes: with airShed it leaves 0.006, without
 * it 0.026, and either way these three are asked to do what it does, so the
 * two items can land in either order (8e first means airShed after each of
 * these carries too, until 8f takes it off them all).
 *
 * Each case first proves the setup it names: the species stage reports
 * 'alone'; the oil pool holds a disc of radius 0.3 to 2%; the maze's flow
 * was ready. What the maze premise cannot see is the branch's other gates
 * (magnetSeconds, Oil Bodies off): a build that routed the Labyrinth's
 * colour through the ordinary carry would pass here, and `npm run maze` and
 * `ferrodye`, which hold the maze's own carry, are what catch that (the
 * plate's src/gpu/fluid.ts sits at its size ceiling, so no flag was added
 * there for this). What each is owed for is absent while its reading is
 * still near main's (over MAIN_PART of what main left): a build that moved
 * it and stopped short is red.
 *
 * ## donor (15g-8f)
 *
 * The donor rule counts what comes into a cell with air at the least it can
 * be (two rings deep), so a bubble put down whole leaves colour in the cells
 * round its middle and `airShed` hands it to the rim afterwards: a
 * correction, not the carry getting it right, and one that reaches only dry
 * cells beside liquid, so a bigger bubble's core keeps what it had. And a
 * popped bubble's hole fills unevenly. Measured in a lab built without the
 * airShed pass (an esbuild plugin turns its one call in passes.ts off; the
 * check is red if that call is not found while the kernel is still in the
 * source, and once airShed is gone the plain lab is the lab without it):
 *
 *   a bubble of radius 0.05 held sixty steps leaves 0.026 of the pool in its
 *   middle (0.006 with airShed), one of 0.08 leaves 0.040 (0.033 with it);
 *   thirty steps after each pops, the cells within three radii of it run
 *   0.68 to 1.08 of the pool (0.58 to 1.07 at 0.08); with airShed, 0.60 to
 *   1.09 and 0.52 to 1.09, so the patch does not even out the hole either.
 *   Those cells read the same one step after the pop as thirty after (the
 *   hole's middle is 1.01 of the pool from the first step): the liquid is
 *   back at once, and what is uneven is the colour it brought, the carry's
 *   error frozen in a pool with no diffusion, not a refill still under way.
 *
 * Asked: under LEFT_MOST left in the middle of each, and after each pop every
 * cell within three radii between EVEN_LOW and EVEN_HIGH of the pool: the
 * pool is one concentration, so a carry that moves colour per unit of liquid
 * fills the hole back to it, give or take rounding. And the patch is gone:
 * no `airShed` kernel left. Owed while KERNELS.airShed is in the source.
 *
 * ## press (15g-8g)
 *
 * The app lays a standing 'press' squish on every bubble's footprint each
 * frame (src/sim/speciesPoll.ts, `applySquish(..., 'press', 'bubble')`) "so
 * the field flows round the bubbles". Since 15g-8d the thin solve gives
 * standing air no mobility, so the liquid goes round by itself, and the
 * press only dents the glass under the air, a source the solve must answer.
 * The lab lays the same press (radius 0.85 of the bubble's, 0.0035 deep,
 * through lab.squish as the app lays it) on a bubble of 0.04 drifting a fifth
 * of the plate: with it and without it the mean speed of the liquid round
 * the bubble (out to twice its radius) agree to 0.1%, nothing runs through
 * it either way, and the press takes the gap under it from 0.0300 to 0.0273.
 * Guards, holding on main: the lab's press lands (it dents the gap by over
 * GAP_DENT, so a press that laid nothing cannot make the two flows agree),
 * the flow round agrees with and without it to FLOW_SAME, and with no press
 * nothing runs through the bubble (its middle's speed under THROUGH_MOST of
 * the speed round it). Owed: no applySquish left in src/ with the presser
 * 'bubble' or sized by a bubble's radius. What the lab cannot
 * see is the app's own plate on the Mac (`npm run holeline` here, `bubbles`
 * and the Mac's `tools`): the brief asks for those to stay green.
 */
import { openLab } from './lab.mjs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOTAL_KEPT = 0.1;   // %, as bubbledye
const PEAK_MOST = 1.25;   // × the pool, as bubbledye
const LEFT_MOST = 0.02;   // of the pool, as bubbledye
const HOLE_BACK = 0.5;    // of the pool, as bubbledye
const EVEN_LOW = 0.95;
const EVEN_HIGH = 1.05;
const MAIN_PART = 0.75;
const MATCH_MOST = 0.005;
const GAP_DENT = 0.001;
const FLOW_SAME = 0.02;
const THROUGH_MOST = 0.01;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDS = ['oldplate', 'species', 'mix', 'maze', 'donor', 'press'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
let failed = 0, passed = 0;
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
  console.log(` owed  ${name} — ${detail}`);
};

// ── The source, comments taken out, for the lines that ask what is still there ──
const uncomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const tsFiles = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? tsFiles(p) : /\.tsx?$/.test(f) ? [p] : [];
});
const src = Object.fromEntries(tsFiles(join(root, 'src')).map((p) => [p.slice(root.length + 1), uncomment(readFileSync(p, 'utf8'))]));
const where = (re) => Object.entries(src).filter(([, s]) => re.test(s)).map(([p]) => p);
/*
  Each searched across all of src/, so a split that moves a dispatch or a
  kernel to another file neither turns main red nor skips the lab without
  airShed. A rename alone does not pass a line: the CPU's rim is also looked
  for as any call handing the bubbles' pack to the solver other than the
  GPU's setBubbles, and the press as any applySquish sized by a bubble's
  radius (`b.r`) as well as by its presser's name, in either quotes.
*/
const deposit = [...new Set([...where(/depositBubbleRims/), ...where(/lead\.(?!gpu\.setBubbles\b)[\w.]+\(\s*bubblesRef\.current\.packed\b/)])];
const oldPlateExclude = where(/['"]airExclude['"]/).filter((p) => p.startsWith('src/gpu/') && !p.startsWith('src/gpu/wgsl/')).length > 0;
const shedKernel = where(/KERNELS\.airShed\s*=/).length > 0;
const bubblePress = where(/applySquish\([^;]*(['"]bubble['"]|\bb\.r\b)[^;]*\)/);

// ── The lab without airShed, for the donor's lines ──
const SHED_CALL = 'if (gives && this.air) {';
let shedHits = 0;
const noShed = {
  name: 'no-air-shed',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]fluid[\\/]passes\.ts$/ }, (a) => {
      const parts = readFileSync(a.path, 'utf8').split(SHED_CALL);
      shedHits += parts.length - 1;
      return { contents: parts.join('if (false) {'), loader: 'ts' };
    });
  },
};

/*
  One run on a fresh plate: the pool (and what `setup` adds), five steps, a
  bubble held sixty steps (`kind` whole: radius `r` in the middle; move: 0.04
  drifting from 0.4 to 0.6 across), read; for a pop, the bubble gone and
  thirty steps more, read again. `read` names what is read and how: the
  colour's depth, a channel of the species or the oil's mix, or the flow.
*/
const runIn = (page, cfg) => page.evaluate(async (cfg) => {
  const N = 128, L = 128;
  const look = lab.look('classic').settings;
  const DT = look.globalSpeed * 0.2;
  const over = { thinGap: 1, gapThickness: look.gapThickness ?? 0.45, dt: DT, advection: look.advection, bubbleClear: 1, ...cfg.over };
  await lab.create(N, L);
  const s = lab.solver();
  lab.dyeDisc(0.5, 0.5, 0.3, [0.2, 0.5, 0.9], 1);
  if (cfg.fuse !== undefined) s.fuseSpecies = cfg.fuse;
  if (cfg.species) lab.addSpecies(0.5, 0.5, 0.3, 2, cfg.species);
  if (cfg.oil) s.addMix(0.5, 0.5, 0.3, { oil: 1 });
  if (cfg.ferro) lab.addPhase(0.5, 0.5, 0.3, 0.9);
  lab.flush(DT);
  await lab.step(5, over);
  const grid = async () => {
    if (cfg.read === 'species') return { d: await lab.field('species'), ch: 0, n: L };
    if (cfg.read === 'mix') { const m = await lab.chemistry('mix'); if (!m) throw new Error('no oil mix on the plate'); return { d: m.data, ch: 0, n: m.n }; }
    return { d: await lab.field('dye'), ch: 3, n: L };
  };
  const read = async (bx, by, br) => {
    const { d, ch, n } = await grid();
    let t = 0, mx = 0, inside = 0, nIn = 0, lo = Infinity, hi = -Infinity;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = d[(i + j * n) * 4 + ch]; t += v; mx = Math.max(mx, v);
      const rr = Math.hypot((i + 0.5) / n - bx, (j + 0.5) / n - by);
      if (rr < br * 0.6) { inside += v; nIn++; }
      if (rr < br * 3) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    if (!nIn) throw new Error('no cells under the bubble to read');
    const out = { t, mx, inside: inside / nIn, lo, hi };
    if (cfg.read === 'flow') {
      const v = await lab.field('vel'), sq = await lab.squeeze();
      let through = 0, round = 0, nRound = 0, gap = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const k = (i + j * L) * 4, rr = Math.hypot((i + 0.5) / L - bx, (j + 0.5) / L - by), sp = Math.hypot(v[k], v[k + 1]);
        if (rr < br * 0.6) { through += sp; gap += sq ? sq.gap[i + j * L] : NaN; }
        else if (rr < br * 2) { round += sp; nRound++; }
      }
      Object.assign(out, { through: through / nIn, round: round / nRound, gap: gap / nIn });
    }
    return out;
  };
  const t0 = await read(0.5, 0.5, cfg.r ?? 0.05);
  const put = (x, y, rr) => s.setBubbles(new Float32Array([x, y, rr, 1]), 1, 0.25, new Float32Array(4));
  let at = { x: 0.5, y: 0.5, r: cfg.r ?? 0.05 };
  for (let k = 0; k < 60; k++) {
    if (cfg.kind === 'move') at = { x: 0.4 + 0.2 * k / 60, y: 0.5, r: 0.04 };
    put(at.x, at.y, at.r);
    // The app's press, as speciesPoll.ts lays it each frame: 0.85 of the bubble's radius, 0.0035 deep, on the thin gap's bowl.
    if (cfg.press) { lab.squish(Math.round(at.x * L), Math.round(at.y * L), Math.max(1, Math.round(at.r * L * 0.85)), 0.0035, 0, 'press', 0, true); lab.flush(DT); }
    await lab.step(1, over);
  }
  const held = await read(at.x, at.y, at.r);
  const how = { species: s.lastSpeciesCarry, maze: !!s.mazeReady && !!s.phaseMuT };
  if (!cfg.pop) return { t0, held, how };
  s.setBubbles(new Float32Array(4), 0, 0.25, new Float32Array(4));
  await lab.step(30, over);
  return { t0, held, popped: await read(at.x, at.y, at.r), how };
}, cfg);

const f3 = (v) => v.toFixed(3);
const keptOf = (r, end) => (100 * (end.t - r.t0.t)) / r.t0.t;

let opened = await openLab();
try {
  const page = opened.page;

  // ── oldplate (15g-8c) ──
  for (const kind of ['whole', 'move', 'pop']) {
    const r = await runIn(page, { over: { thinGap: 0 }, kind, pop: kind === 'pop' });
    const end = r.popped ?? r.held;
    const kept = keptOf(r, end);
    console.log(`oldplate ${kind}: total ${f3(r.t0.t)} -> ${f3(end.t)} (${kept.toFixed(3)}%), deepest ${f3(r.held.mx)}, left under it ${f3(r.held.inside)}${r.popped ? `, the hole after ${f3(r.popped.inside)}` : ''}`);
    line('oldplate', `15g-8c: Thin Gap off, a bubble ${kind === 'move' ? 'drifting' : kind === 'pop' ? 'popped' : 'put down whole'} keeps the plate's colour to ${TOTAL_KEPT}%`, Math.abs(kept) < TOTAL_KEPT, `${kept.toFixed(3)}%`, oldPlateExclude);
    check(`Thin Gap off, ${kind}: no ring, the deepest cell under ${PEAK_MOST}× the pool`, r.held.mx < PEAK_MOST && end.mx < PEAK_MOST, `${f3(r.held.mx)}, ${f3(end.mx)}`);
    check(`Thin Gap off, ${kind}: the bubble emptied, under ${LEFT_MOST} of the pool left in its middle`, r.held.inside < LEFT_MOST, f3(r.held.inside));
    if (r.popped) line('oldplate', `15g-8c: Thin Gap off, the popped bubble's hole fills back to ${HOLE_BACK} of the pool in thirty steps`, r.popped.inside > HOLE_BACK, f3(r.popped.inside), oldPlateExclude);
  }
  line('oldplate', '15g-8c: the CPU paints no ring back from the mirror: no depositBubbleRims left in src/', !deposit.length, deposit.length ? `still in ${deposit.join(', ')}` : 'gone', oldPlateExclude);

  // ── species, mix, maze (15g-8e) ──
  // What main leaves in a bubble's middle. The mix's was 0.203 with the quartic well; the deep
  // quench (PLAN 38f-2) pulls the oil a bubble's carry leaves behind into its pool, so main
  // leaves 0.149 with no air carry built (the owed bar, the colour's own 0.011, is unchanged).
  const MAIN_LEFT = { species: 0.343, mix: 0.149, maze: 0.0315 };
  // The colour's own carry under the same bubble on the same plate, the bar each other carry is held to.
  const control = await runIn(page, { kind: 'whole' });
  const bar = Math.min(LEFT_MOST, control.held.inside + MATCH_MOST);
  console.log(`the colour's own carry: left under the bubble ${f3(control.held.inside)}, so each carry below is asked for under ${f3(bar)}`);
  const POOL = Math.PI * 0.3 * 0.3 * 128 * 128;
  const carries = [
    ['species', 'a poured liquid\'s share carried in its own stage', { species: 'glycerine', fuse: false, read: 'species' }, (r) => r.how.species === 'alone' || `the species rode ${r.how.species}, not alone`],
    ['mix', 'the oil\'s mix (mixAdvectSub)', { oil: true, read: 'mix', over: { oilTension: 0.9 } }, (r) => Math.abs(r.t0.t / POOL - 1) < 0.02 || `the oil pool holds ${f3(r.t0.t / POOL)} of a disc of radius 0.3`],
    ['maze', 'the colour on the Labyrinth\'s own path', { ferro: true, over: { ferroLabyrinth: 0.9, phaseSharp: 0.75, magnetStrength: 0 } }, (r) => r.how.maze || 'the maze\'s flow never ran'],
  ];
  for (const [id, what, cfg, ran] of carries) {
    const r = await runIn(page, { kind: 'whole', ...cfg });
    const premise = ran(r);
    if (premise !== true) { check(`15g-8e ${id}: the case runs the carry it names`, false, premise); continue; }
    const kept = keptOf(r, r.held);
    console.log(`${id}: total ${f3(r.t0.t)} -> ${f3(r.held.t)} (${kept.toFixed(3)}%), deepest ${f3(r.held.mx)}, left under it ${f3(r.held.inside)} (main ${MAIN_LEFT[id]})`);
    check(`${id}: ${what} keeps its amount to ${TOTAL_KEPT}% under a bubble`, Math.abs(kept) < TOTAL_KEPT, `${kept.toFixed(3)}%`);
    check(`${id}: no ring, the deepest cell under ${PEAK_MOST}× the pool`, r.held.mx < PEAK_MOST, f3(r.held.mx));
    line(id, `15g-8e: ${what} takes the air: no more left in the bubble's middle than the colour's own carry leaves, ${MATCH_MOST} over it at most`, r.held.inside < bar, `${f3(r.held.inside)} against ${f3(bar)}`, r.held.inside > MAIN_PART * MAIN_LEFT[id]);
  }

  // ── press (15g-8g) ──
  const free = await runIn(page, { kind: 'move', read: 'flow' });
  const pressed = await runIn(page, { kind: 'move', read: 'flow', press: true });
  const rel = Math.abs(pressed.held.round - free.held.round) / Math.max(free.held.round, 1e-12);
  console.log(`press: the speed round a drifting bubble ${free.held.round.toExponential(3)} without the press, ${pressed.held.round.toExponential(3)} with it (${(100 * rel).toFixed(2)}%); through it ${free.held.through.toExponential(2)}; the gap under it ${free.held.gap.toFixed(4)} without, ${pressed.held.gap.toFixed(4)} with`);
  check(`the lab's press lands: it dents the gap under the bubble by over ${GAP_DENT}`, pressed.held.gap < free.held.gap - GAP_DENT, `${free.held.gap.toFixed(4)} -> ${pressed.held.gap.toFixed(4)}`);
  check(`the liquid goes round a drifting bubble the same with the app's press and without it, to ${100 * FLOW_SAME}%`, free.held.round > 0 && rel < FLOW_SAME, `${(100 * rel).toFixed(2)}%`);
  check(`with no press, nothing runs through the bubble: its middle under ${THROUGH_MOST} of the speed round it`, free.held.round > 0 && free.held.through < THROUGH_MOST * free.held.round, `${(free.held.through / Math.max(free.held.round, 1e-12)).toFixed(4)}`);
  line('press', '15g-8g: the app lays no standing press under a bubble: no applySquish with the presser \'bubble\' or a bubble\'s radius in src/', !bubblePress.length, bubblePress.length ? `still in ${bubblePress.join(', ')}` : 'gone', bubblePress.length > 0);

  // ── donor (15g-8f), in a lab without airShed ──
  await opened.close();
  opened = null;
  shedHits = 0;
  const bare = await openLab({ plugins: shedKernel ? [noShed] : [], tag: shedKernel ? 'noshed' : '' });
  opened = bare;
  if (shedKernel && shedHits !== 1) {
    check('the lab without airShed is built: its one call in passes.ts found and turned off', false, `"${SHED_CALL}" found ${shedHits} times while KERNELS.airShed is still in the source; this check's plugin needs the call's new form`);
  } else {
    for (const r0 of [0.05, 0.08]) {
      const r = await runIn(bare.page, { kind: 'whole', r: r0, pop: true });
      console.log(`donor, radius ${r0}${shedKernel ? ' (airShed off)' : ''}: left under it ${f3(r.held.inside)}; thirty steps after the pop, within three radii ${f3(r.popped.lo)} to ${f3(r.popped.hi)}; total ${keptOf(r, r.popped).toFixed(3)}%`);
      line('donor', `15g-8f: without airShed, a bubble of radius ${r0} put down whole leaves under ${LEFT_MOST} of the pool in its middle`, r.held.inside < LEFT_MOST, f3(r.held.inside), shedKernel);
      line('donor', `15g-8f: thirty steps after it pops, every cell within three radii is ${EVEN_LOW} to ${EVEN_HIGH} of the pool`, r.popped.lo >= EVEN_LOW && r.popped.hi <= EVEN_HIGH, `${f3(r.popped.lo)} to ${f3(r.popped.hi)}`, shedKernel);
      check(`donor, radius ${r0}: the plate's colour kept to ${TOTAL_KEPT}% through the pop`, Math.abs(keptOf(r, r.popped)) < TOTAL_KEPT, `${keptOf(r, r.popped).toFixed(3)}%`);
    }
  }
  line('donor', '15g-8f: the patch is gone: no airShed kernel left in src/', !shedKernel, shedKernel ? 'KERNELS.airShed is still there' : 'gone', shedKernel);
} catch (e) {
  check('the lab ran', false, e.message.slice(0, 300));
} finally {
  await opened?.close();
}
console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed (owed lines printed as owed)`);
process.exit(failed ? 1 : 0);
