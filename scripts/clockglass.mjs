#!/usr/bin/env node
/**
 * Clock Glass keeps several colours apart, as a clock-glass dish does.
 *
 *   npm run clockglass      (any adapter that computes: scripts/lab.mjs)
 *
 * Reported by the owner: "the clock glass preset is really underwhelming ...
 * nothing like the inspirations". The inspirations are the clock-glass shows
 * of the Joshua Light Show and the Fillmore: cells of red, amber and blue
 * oil, each with its dark rim, in a purple water, several colours to a
 * frame and in different parts of it. The look laid three water dyes
 * (lavender, ice, magenta) in rings on top of one another, and water dyes are
 * one liquid: the Mac gallery showed one lavender-magenta disc at 12 s and at
 * 30 s. It now lays a purple water and twelve bodies of oil, each with one of
 * the other dyes in it, with Oil Bodies on (src/lib/oilLay.ts, seedPreset's
 * 'clock-glass').
 *
 * What this asks is the feature, several colours side by side in their own
 * parts of the dish, not that a pass ran. Three plates, laid as the app lays
 * them and stepped five seconds with the look's own plate settings (its oil,
 * its curved glasses, Thin Gap):
 *
 *   now         the look as laid now
 *   before      the old lay (three rings of the old dyes, no oil)
 *
 * A cell's colour is its absorbance direction (R, G, B over their length).
 * The water is every dyed cell within WATER radians of the first dye's own;
 * the rest are grouped into regions (4-connected, at least REGION of the
 * dish each). Asked:
 *
 *   1. the dish has dye in it in every plate (so 2 is not "empty")
 *   2. the look's colours spread at least twice as far as the old lay's: the
 *      mean angle of each dyed cell's colour from the dish's mean colour,
 *      near 0 for one colour or a blend of several
 *   3. in at least four separate regions off the water: cells, side by side
 *   4. and the oil holds the colour laid in it as its own: of the dye laid
 *      in the bodies, the share the oil carries (Oil Bodies) after the five
 *      seconds. The share used to start empty when a plate first had bodies,
 *      on the reasoning that the colour inside a body would be handed to it
 *      within a few steps; it was not, and the colour ran out of each body
 *      into a halo in the water, as the water's colour spreads. It now
 *      starts from the plate as it is (fluid.ts, bodiesFresh).
 *
 * Measured while writing this (lab, 192², 300 steps) and printed below: the
 * bounds sit between the plates rather than on any one of them.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 192;
const STEPS = 300;
const WATER = 0.12;    // radians from the water's own absorbance direction
const REGION = 0.004;  // of the dish's cells, for a region to count
const APART = 0.3;     // radians between two regions' colours to be two colours
// The old look's dyes and lay (seedPreset before this change): lavender, ice, magenta.
const OLD = [{ r: 0.71, g: 0.55, b: 1.0 }, { r: 0.65, g: 0.95, b: 0.95 }, { r: 0.88, g: 0.07, b: 0.62 }];

// CLOCKGLASS_DUMP=<dir> writes each plate there as a PNG, to look at.
const DUMP = process.env.CLOCKGLASS_DUMP;
const { page, close } = await openLab();
try {
  const run = (which) => page.evaluate(async ({ which, N, STEPS, WATER, REGION, APART, OLD, DUMP }) => {
    await lab.create(N, N);
    const { settings: s, dyes: now } = lab.look('clock-glass');
    const dyes = which === 'before' ? OLD : now;
    const bodiesOn = which === 'now' ? 1 : 0;
    const oil = which === 'before' ? 0 : 0.9;
    const over = { thinGap: 1, advection: s.advection, plateCurve: s.plateCurve, depthDrag: s.depthDrag,
      platePressure: s.platePressure, oilTension: oil, oilBodies: bodiesOn };
    // Absorbance per unit of dye, as the app's addDensity stores it.
    const ab = (c) => [c.r, c.g, c.b].map((v) => -Math.log(Math.max(0.002, v)));
    const d = new Array(N * N * 4).fill(0);
    let laidInOil = 0;
    // splatBlob's Gaussian: sigma in plate units, amount at the middle.
    const blob = (x, y, sigma, amount, c) => {
      const a = ab(c);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const dx = (i + 0.5) / N - x, dy = (j + 0.5) / N - y;
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        if (w < 0.01) continue;
        const k = (i + j * N) * 4;
        for (let ch = 0; ch < 3; ch++) d[k + ch] += amount * w * a[ch];
        d[k + 3] += amount * w;
      }
    };
    if (which === 'before') {
      // Radius S × (0.3 − 0.09 ring) in 128-grid units, scaled by 1.5 (GRID_SCALE): over the plate.
      for (let ring = 0; ring < 3; ring++) blob(0.5, 0.5, (0.3 - ring * 0.09) * 1.5, 2.4, dyes[ring]);
    } else {
      const bodies = lab.clockGlassBodies(11, dyes.length);
      const sv = lab.solver();
      for (const b of bodies) sv.addMix(b.x, b.y, b.r, { oil: 1 });
      // As seedPreset's 'clock-glass': each body's dye in its oil, the
      // water's wash (splatBlob's 34 in 128-grid units at GRID_SCALE 1.5 on
      // the app's 192 grid) in what is left.
      const sigma = (34 * 1.5) / 192, aw = ab(dyes[0]);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = (i + 0.5) / N, y = (j + 0.5) / N, k = (i + j * N) * 4;
        let oil = 0, mine = -1;
        bodies.forEach((b, q) => { const c = Math.max(0, Math.min(1, (b.r - Math.hypot(x - b.x, y - b.y)) * N + 0.5)); if (c > oil) { oil = c; mine = q; } });
        const w = Math.exp(-((x - 0.5) ** 2 + (y - 0.5) ** 2) / (2 * sigma * sigma));
        const put = (amt, a) => { for (let ch = 0; ch < 3; ch++) d[k + ch] += amt * a[ch]; d[k + 3] += amt; };
        if (w >= 0.01 && oil < 1) put(1.3 * w * (1 - oil), aw);
        if (mine >= 0) { put(2.6 * oil, ab(dyes[bodies[mine].dye])); laidInOil += 2.6 * oil; }
      }
    }
    lab.addDye(d); lab.flush();
    await lab.step(STEPS, over, true);
    const f = await lab.field('dye');
    const u0 = (() => { const a = ab(dyes[0]); const l = Math.hypot(...a); return a.map((v) => v / l); })();
    const ang = (a, u) => Math.acos(Math.max(-1, Math.min(1, (a[0] * u[0] + a[1] * u[1] + a[2] * u[2]) / (Math.hypot(...a) * Math.hypot(...u)))));
    // 0 outside the dish or undyed, 1 water, 2 something else.
    const kind = new Uint8Array(N * N);
    let dish = 0, dyed = 0, water = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) > 0.45) continue;
      dish++;
      const k = (i + j * N) * 4, a = [f[k], f[k + 1], f[k + 2]];
      if (f[k + 3] < 0.05 || Math.hypot(...a) < 1e-4) continue;
      dyed++;
      if (ang(a, u0) < WATER) { kind[i + j * N] = 1; water++; } else kind[i + j * N] = 2;
    }
    // Regions of the rest, and each one's mean colour.
    const seen = new Uint8Array(N * N), regions = [];
    for (let start = 0; start < N * N; start++) {
      if (kind[start] !== 2 || seen[start]) continue;
      const stack = [start]; seen[start] = 1;
      let n = 0; const sum = [0, 0, 0];
      while (stack.length) {
        const q = stack.pop(); n++;
        const l = Math.hypot(f[q * 4], f[q * 4 + 1], f[q * 4 + 2]);
        for (let ch = 0; ch < 3; ch++) sum[ch] += f[q * 4 + ch] / l;
        const x = q % N, y = (q - x) / N;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          const r = xx + yy * N;
          if (kind[r] === 2 && !seen[r]) { seen[r] = 1; stack.push(r); }
        }
      }
      if (n >= REGION * dish) regions.push({ n, dir: sum });
    }
    // How far the dish's colours spread: each dyed cell's angle from the
    // dish's mean colour, averaged. One colour, or a blend, is near 0.
    const mean = [0, 0, 0];
    for (let q = 0; q < N * N; q++) if (kind[q]) { const l = Math.hypot(f[q * 4], f[q * 4 + 1], f[q * 4 + 2]); for (let ch = 0; ch < 3; ch++) mean[ch] += f[q * 4 + ch] / l; }
    let spread = 0;
    for (let q = 0; q < N * N; q++) if (kind[q]) spread += ang([f[q * 4], f[q * 4 + 1], f[q * 4 + 2]], mean);
    spread /= Math.max(1, dyed);
    // How much of the colour laid in the bodies the oil still holds as its own.
    let held = 0;
    if (which === 'now') { const o = await lab.field('oilDye'); for (let q = 3; q < o.length; q += 4) held += o[q]; }
    const colours = [];
    for (const r of regions.sort((p, q) => q.n - p.n)) if (colours.every((c) => ang(r.dir, c) > APART)) colours.push(r.dir);
    let png = null;
    if (DUMP) {
      const px = await lab.render(512, s, { zoom: 1 });
      const c = new OffscreenCanvas(512, 512);
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), 512, 512), 0, 0);
      const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let t = ''; for (const x of buf) t += String.fromCharCode(x); png = btoa(t);
    }
    return { regions: regions.length, colours: colours.length, water: water / dish, dyed: dyed / dish, spread, held: laidInOil > 0 ? held / laidInOil : 0, png };
  }, { which, N, STEPS, WATER, REGION, APART, OLD, DUMP: !!DUMP });

  const now = await run('now');
  const before = await run('before');
  if (DUMP) for (const [name, r] of [['now', now], ['before', before]]) (await import('node:fs')).writeFileSync(`${DUMP}/clockglass-${name}.png`, Buffer.from(r.png, 'base64'));
  const fmt = (r) => `${r.regions} regions in ${r.colours} colours, spread ${r.spread.toFixed(3)} rad`;
  console.log(`  now: ${fmt(now)}; before: ${fmt(before)}`);

  check('every plate has dye in its dish', Math.min(now.dyed, before.dyed) > 0.5,
    `dyed ${(now.dyed * 100).toFixed(0)}% and ${(before.dyed * 100).toFixed(0)}% of the dish`);
  check('the look\'s colours spread at least twice as far as the old lay\'s', now.spread > 2 * before.spread,
    `${now.spread.toFixed(3)} rad against ${before.spread.toFixed(3)}`);
  check('in at least four separate regions of colour off the water', now.regions >= 4, fmt(now));
  check('and the oil holds the colour laid in it as its own', now.held > 0.6,
    `${(now.held * 100).toFixed(0)}% of the bodies' dye is the oil's after five seconds`);
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length}`);
process.exit(failed ? 1 : 0);
