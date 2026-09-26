#!/usr/bin/env node
/**
 * Film Physics, photographed: the plate's films drawn through a soap film's
 * own colours, and nothing else touched.
 *
 *   npm run filmlook      (any adapter that computes: scripts/lab.mjs)
 *
 * `npm run film` holds the table to the research's film.py and reads the
 * shader's source for it. This asks the pixels, on the lab's plate (the real
 * solver and the real plate shader), and against a control: the same lab
 * built with Film Physics taken out of the shader (below), since the lab
 * fills every setting from the defaults and so has no plate "without" it.
 *
 * - With no film on the plate, Film Physics changes nothing, to the bit.
 * - With Thin Film up, it changes the film and nothing more than a level
 *   or two outside the rainbow film's own footprint.
 * - At 0, the plate, Thin Film and both views of the bubbles are the
 *   control's, to the bit; at 1 they are not, so the control can fail.
 * - Thin Film at 1 is as bright as the rainbow (the table is gained to its
 *   mean), its thickness does not drift with the clock where the rainbow's
 *   hue does, and at a half it is halfway between.
 * - The projected bubbles' film fades to a faint tint: a projector throws
 *   only the light through a film, 92 to 100 per cent of the lamp in pale
 *   complements, so what the film adds falls under a quarter of the
 *   rainbow's.
 * - The closeup's bubbles, the camera's, keep a coloured film, the
 *   reflected soap colours. A bubble's film runs about 1.6 times thicker in
 *   its middle than at its rim (one rainbow period to 207 nm of soap): 250
 *   to 390 nm for a middling one, where soap goes blue, green-gold and
 *   orange, so over the bubble it turns gold where the rainbow turned it
 *   blue and violet. Less colour than the rainbow's, and that is the
 *   physics too: the rainbow is never grey, a film often is.
 * - And the projector's tint is the gold's complement, a faint blue.
 *
 * Mutations the check-skeptic ran against the first version of this, which
 * passed it and are what the checks above were added for: the whole plate
 * dimmed with the setting on, a black film everywhere, the film drifting
 * with the clock, the slider made a switch, the rainbow changed at 0.
 */
import { openLab } from './lab.mjs';
import { readFileSync } from 'node:fs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/*
  The control: the same lab on the same source, with Film Physics taken out
  of the plate shader. Its film mix returns the rainbow whatever the setting
  says and the projector's tint is never drawn: the shader as it was before
  the setting existed, built from today's file so it cannot drift from it
  in anything else. Every edit is asserted, so a rename in plate.ts fails
  here loudly rather than leaving the control identical to the real thing.
*/
const RAINBOW_ONLY = {
  name: 'rainbow-only',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]plate\.ts$/ }, (args) => {
      let src = readFileSync(args.path, 'utf8');
      // The whole mix, replaced by the rainbow as the film was drawn before
      // (so a change inside the mix, at 0 or not, shows against it), and the
      // projector's tint never drawn.
      const mixFn = /fn filmColourAt\(tR: f32, tP: f32\) -> vec3f \{[\s\S]*?\n\}/;
      if (!mixFn.test(src)) throw new Error('filmlook: the rainbow-only control could not find filmColourAt in plate.ts');
      src = src.replace(mixFn, 'fn filmColourAt(tR: f32, tP: f32) -> vec3f {\n  return thinFilmColour(tR);\n}');
      const tint = 'if (U.filmPhysics > 0.0) {\n          let cpT';
      if (!src.includes(tint)) throw new Error('filmlook: the rainbow-only control could not find the projector\'s tint in plate.ts');
      src = src.replace(tint, 'if (false) {\n          let cpT');
      return { contents: src, loader: 'ts' };
    });
  },
};

/*
  One plate, laid the same in both labs: thin dye (amounts where Thin Film
  draws, under 0.4), then seven bubbles of several sizes. Returns every
  render the checks below read, keyed by name.
*/
async function scene(labels) {
  const N = 192, S = 400;
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  await lab.create(N);
  const pal = [[0.2, 1.0, 1.0], [1.0, 1.0, 0.2], [1.0, 0.2, 1.0]];
  for (let i = 0; i < 40; i++) lab.dye(0.15 + rnd() * 0.7, 0.15 + rnd() * 0.7, 0.03 + rnd() * 0.06, pal[i % 3], 0.05 + rnd() * 0.25);
  lab.flush(); await lab.step(30);
  const plate = { zoom: 1.3, macroAmount: 0, view: true, cx: 0.5, cy: 0.5, bubbles: 0 };
  // The plate's clock, seconds, set, so a second clock a minute on can be
  // asked of. Early, so that a film whose thickness did drift would not
  // already have run off the table's end at both clocks and look still.
  const T = 1;
  const r = {};
  const want = (k) => labels.includes(k);
  const shot = async (k, over, cam) => { if (want(k)) r[k] = Array.from(await lab.render(S, over, cam)); };
  await shot('bare0', { thinFilm: 0, filmPhysics: 0 }, { ...plate, time: T });
  await shot('bare1', { thinFilm: 0, filmPhysics: 1 }, { ...plate, time: T });
  await shot('film0', { thinFilm: 1, filmPhysics: 0 }, { ...plate, time: T });
  await shot('filmHalf', { thinFilm: 1, filmPhysics: 0.5 }, { ...plate, time: T });
  await shot('film1', { thinFilm: 1, filmPhysics: 1 }, { ...plate, time: T });
  await shot('bare0Later', { thinFilm: 0, filmPhysics: 0 }, { ...plate, time: T + 60 });
  await shot('film0Later', { thinFilm: 1, filmPhysics: 0 }, { ...plate, time: T + 60 });
  await shot('film1Later', { thinFilm: 1, filmPhysics: 1 }, { ...plate, time: T + 60 });
  const bs = [], sizes = [4, 5, 6, 8, 10, 12, 14];
  for (const rad of sizes) bs.push(0.25 + rnd() * 0.5, 0.25 + rnd() * 0.5, rad / N, 1);
  lab.solver().setBubbles(new Float32Array(bs), sizes.length, 0.05, new Float32Array(sizes.length * 4));
  await lab.step(3);
  const QUIET = { macroCells: 0, macroLacing: 0, macroDepth: 0, macroEdgeDetail: 0, macroRelief: 0 };
  const views = {
    plate: [{}, { zoom: 1.3, macroAmount: 0, view: true, cx: 0.5, cy: 0.5 }],
    closeup: [QUIET, { zoom: 3, macroAmount: 1, view: true, cx: 0.5, cy: 0.5 }],
  };
  // A bubble's film wobbles with the clock (0.08 of a period, every 15.7 s),
  // so the bubbles are asked at three clocks a third of that apart and the
  // numbers averaged: the film, not one moment of its wobble.
  for (const [k, t] of [0, 5.24, 10.47].entries()) {
    for (const [v, [quiet, cam]] of Object.entries(views)) {
      const at = { ...cam, time: T + t };
      await shot(`${v}None${k}`, { ...quiet, iridescence: 0 }, { ...at, bubbles: 0 });
      await shot(`${v}Flat${k}`, { ...quiet, iridescence: 0 }, { ...at, bubbles: 0.8 });
      await shot(`${v}0${k}`, { ...quiet, iridescence: 0.9, filmPhysics: 0 }, { ...at, bubbles: 0.8 });
      await shot(`${v}1${k}`, { ...quiet, iridescence: 0.9, filmPhysics: 1 }, { ...at, bubbles: 0.8 });
    }
  }
  return r;
}

const CLOCKS = [0, 1, 2];
const ALL = ['bare0', 'bare1', 'film0', 'filmHalf', 'film1', 'bare0Later', 'film0Later', 'film1Later',
  ...CLOCKS.flatMap((k) => ['None', 'Flat', '0', '1'].flatMap((s) => [`plate${s}${k}`, `closeup${s}${k}`]))];
const AT_ZERO = ['bare0', 'film0', 'plate00', 'closeup00'];

let m, ref;
{
  const { page, close } = await openLab();
  try { m = await page.evaluate(scene, ALL); } finally { await close(); }
}
{
  const { page, close } = await openLab({ plugins: [RAINBOW_ONLY], tag: 'rainbow-only' });
  try { ref = await page.evaluate(scene, [...AT_ZERO, 'film1']); } finally { await close(); }
}

const px = (a, i) => [a[i], a[i + 1], a[i + 2]];
const sum3 = (a, b, i) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
const differ = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (sum3(a, b, i)) n++; return n; };
const lum = (a, i) => 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2];
// The film's footprint on the plate: the pixels the rainbow film changes.
const foot = [];
for (let i = 0; i < m.film0.length; i += 4) if (sum3(m.film0, m.bare0, i)) foot.push(i);

// ── Nothing but the film ─────────────────────────────────────────────
check('with no film on the plate, Film Physics changes nothing', differ(m.bare0, m.bare1) === 0,
  `${differ(m.bare0, m.bare1)} pixels changed`);
{
  /*
    Outside the rainbow film's footprint, a pixel may still move a level or
    two where the film's weight is too small to show in the rainbow but the
    soap colour is not neutral; more than that is something else moving.
    Measured: 38 pixels by at most 2. A setting that dimmed the whole plate
    moves some fifteen thousand.
  */
  let changed = 0, outside = 0;
  for (let i = 0; i < m.film0.length; i += 4) {
    const d = sum3(m.film0, m.film1, i);
    if (d) changed++;
    if (d > 2 && !sum3(m.film0, m.bare0, i)) outside++;
  }
  check('with Thin Film up, it changes the film, and only the film', changed >= 2000 && foot.length >= 2000 && outside === 0,
    `${changed} pixels changed, ${outside} of them by more than 2 levels outside the ${foot.length} the film draws on`);
}

// ── At 0, the rainbow every look was made with ───────────────────────
{
  const bad = AT_ZERO.map((k) => [k, differ(m[k], ref[k])]).filter(([, n]) => n > 0);
  const control = differ(m.film1, ref.film1);
  check('at 0, every film is the rainbow every look was made with, to the bit', bad.length === 0 && control >= 2000,
    `${bad.length ? bad.map(([k, n]) => `${k}: ${n} px`).join(', ') : `0 pixels differ in ${AT_ZERO.length} renders`} from the plate drawn without the setting (at 1, ${control} do: the control is a different shader)`);
}

// ── The dye's film: as bright, fixed in time, and the slider a slider ──
{
  const mean = (a) => foot.reduce((s, i) => s + lum(a, i), 0) / foot.length;
  const l0 = mean(m.film0), l1 = mean(m.film1);
  check('Thin Film at 1 is as bright as the rainbow it replaces', Math.abs(l1 - l0) < 1.5,
    `mean luminance on the film ${l1.toFixed(1)} against ${l0.toFixed(1)} (a black film everywhere reads 26)`);

  const moved = (a, b) => foot.reduce((s, i) => s + sum3(a, b, i), 0) / foot.length;
  const plateAlone = moved(m.bare0, m.bare0Later), soap = moved(m.film1, m.film1Later), rainbow = moved(m.film0, m.film0Later);
  /*
    The plate under the film moves a little with the clock by itself (2
    levels a pixel, a minute on, from a clock of one second), and the film
    multiplies it by up to 1.8, so the film at 1 is held to half as much
    again as the plate alone, not to nothing. The rainbow a minute on is
    some forty; a thickness that drifted is tens.
  */
  check('and its thickness does not drift with the clock, where the rainbow\'s hue did',
    soap <= 1.5 * plateAlone + 0.5 && rainbow > 3 * plateAlone + 3,
    `a minute on, the film's pixels move ${soap.toFixed(2)} a pixel at 1, ${rainbow.toFixed(2)} at 0, the plate alone ${plateAlone.toFixed(2)}`);

  let off = 0;
  for (const i of foot) for (let k = 0; k < 3; k++) off += Math.abs(m.filmHalf[i + k] - (m.film0[i + k] + m.film1[i + k]) / 2);
  off /= foot.length * 3;
  check('at a half, the film is halfway between', off < 2,
    `${off.toFixed(2)} levels a channel from the midpoint of 0 and 1 (the slider made a switch at a half reads 7.6)`);
}

// ── The bubbles: the projector's tint and the camera's gold ──────────
/*
  "Colour" is chroma, max - min of a pixel's channels, and "yellow over
  blue" is (r + g) / 2 - b, each averaged over the bubbles' own pixels
  (those the bubbles change by more than a tenth of full scale) less the
  same with the film off (Iridescence 0), so what is compared is what the
  film adds.
*/
const bubbleStats = (v) => {
  let n = 0, c0 = 0, c1 = 0, cf = 0, moved = 0, y0 = 0, y1 = 0, yf = 0;
  const chroma = (a, i) => Math.max(...px(a, i)) - Math.min(...px(a, i));
  const yellow = (a, i) => (a[i] + a[i + 1]) / 2 - a[i + 2];
  for (const k of CLOCKS) {
  const none = m[`${v}None${k}`], flat = m[`${v}Flat${k}`], r0 = m[`${v}0${k}`], r1 = m[`${v}1${k}`];
  for (let i = 0; i < none.length; i += 4) {
    if (sum3(flat, none, i) < 0.1 * 255 * 3) continue;
    n++; cf += chroma(flat, i); c0 += chroma(r0, i); c1 += chroma(r1, i);
    yf += yellow(flat, i); y0 += yellow(r0, i); y1 += yellow(r1, i);
    moved += sum3(r1, r0, i);
  }
  }
  return { n, add0: (c0 - cf) / n, add1: (c1 - cf) / n, moved: moved / n, yRainbow: (y0 - yf) / n, ySoap: (y1 - yf) / n };
};
{
  const p = bubbleStats('plate');
  check('the projected bubbles\' film fades to a faint tint, the light through a film', p.n > 2000 && p.add0 > 10 && p.add1 < 0.25 * p.add0,
    `colour the film adds ${p.add1.toFixed(1)} against the rainbow's ${p.add0.toFixed(1)}, over ${p.n} bubble pixels`);
  const c = bubbleStats('closeup');
  check('the closeup\'s bubbles keep a coloured film, the soap\'s own gold',
    c.n > 2000 && c.add0 > 5 && c.add1 > 1.5 && c.ySoap > 3 && c.moved > 10,
    `colour the film adds ${c.add1.toFixed(1)} (the rainbow's ${c.add0.toFixed(1)}), yellow over blue ${c.ySoap.toFixed(1)} (the rainbow's ${c.yRainbow.toFixed(1)}), ${c.moved.toFixed(1)} apart from the rainbow per pixel`);
  /*
    A lower bound as well as a sign: a projector film taken out altogether
    reads 0 here, to the level. The complement measured -1.2 to -1.9 at
    single clocks, -1.4 averaged over three; the bar is half of that.
  */
  check('and the projector\'s tint is its complement, the light the film lets by',
    c.ySoap > 3 && p.ySoap <= -0.7,
    `yellow over blue: the camera's ${c.ySoap.toFixed(1)}, the projector's ${p.ySoap.toFixed(1)}`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
