#!/usr/bin/env node
/**
 * Enough colours, and the hues between them (PLAN.md 18l).
 *
 *   npm run colours      (the lab: any adapter that computes, so a cloud session too)
 *
 * What was reported (the owner, 2026-10-04): "in general there just aren't
 * enough colors in the presets. I want a lot of color subtlety between color
 * gradients." Measured in the lab, three things took the colours away:
 *
 *   - most looks carried two or three dyes and the hue walk showed one fewer,
 *     so two were on the plate at once;
 *   - the palette's colours were read as perfect filters (a channel at 0 an
 *     absorbance of 6.2), and a perfect filter is one colour at every depth,
 *     so each pool was one flat colour from its rim to its core, and a sixth
 *     of a blocking dye in a mixture killed a channel outright;
 *   - the saturation grade clamped each channel on its own, pressing nearby
 *     colours onto one at the gamut's edge and turning their hue.
 *
 * Asked here, through the real plate shader:
 *
 *   1. most looks carry five dyes or more, and every look with six or more
 *      has five on its plate at once, with its own hue walk on or off
 *      (`dyesOnPlate`, which the visualizer draws its working set by); every
 *      shipped look names its dyes;
 *   2. a dye has more than one colour: a flat plate of it, thin, at one unit
 *      and deep, through the black ground as every look draws it, gets
 *      strictly more saturated with depth (a thin wash is a pale tint of it),
 *      for six palette dyes; a pure blue at one unit lets through a few
 *      percent of red and green, the floor a real dye has and a perfect
 *      filter has not; and a deep yellow turns toward orange, which drawing
 *      the depth (Transmission) does and Transmission at 0 does not;
 *   3. where two neighbouring dyes meet the mixture walks between them: on a
 *      ramp of mixtures, rendered across the whole frame (the lab draws the
 *      plate at 1.5 times the frame, so the read spans plate 0.15–0.85, the
 *      whole ramp, its ends pure dye), the net hue change in the outer tenth
 *      at each end is at most a third of the whole (an even walk is a fifth;
 *      the old dyes put 39–48% there for these four pairs, the change
 *      bunched at the ends, a snap; the new 25–28%);
 *   4. the saturation grade keeps the hue: the ramps graded at 1.45 against
 *      1, every coloured pixel within 3° of hue at the 95th percentile, and
 *      the grade still saturates (chroma up at least 4%).
 *
 * Checks 2 to 4 render with the plate's painted texture (grain, boundary
 * glow, gloss, beads) at neutral, so what is read is the dye.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const S = 128;
const NEUTRAL = { saturationBoost: 1, granulation: 0, boundaryContrast: 0, edgeRelief: 0, beads: 0, lacing: 0, cells: 0, glossiness: 0, microDroplets: 0, thinFilm: 0, gooeyEffect: 0, lampGround: 0 };
// Palette indices: yellow, hot pink, blue, cobalt, teal, amber.
const DEPTH_DYES = [[0, 'yellow'], [2, 'hot pink'], [8, 'blue'], [9, 'cobalt'], [16, 'teal'], [17, 'amber']];
const DEPTHS = [0.35, 1, 2.5];
// Neighbours that meet on the looks' plates: yellow and hot pink, amber and
// hot pink, purple and blue, orange and cherry red.
const PAIRS = [[0, 2, 'yellow → hot pink'], [17, 2, 'amber → hot pink'], [10, 8, 'purple → blue'], [1, 3, 'orange → red']];

const hsv = ([r, g, b]) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  let h = 0;
  if (c > 0) { h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s: mx ? c / mx : 0, c };
};
const hueGap = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 360 - d); };

const lab = await openLab();
let data;
try {
  data = await lab.page.evaluate(async ([S, NEUTRAL, DEPTH_DYES, DEPTHS, PAIRS]) => {
    const pal = lab.palette();
    const flat = async (abs, amount) => {
      const { L } = await lab.create(64);
      const d = new Array(L * L * 4).fill(0);
      for (let k = 0; k < L * L; k++) { d[k * 4] = abs[0] * amount; d[k * 4 + 1] = abs[1] * amount; d[k * 4 + 2] = abs[2] * amount; d[k * 4 + 3] = amount; }
      lab.addDye(d); lab.flush(); await lab.step(1);
    };
    const centre = (px) => {
      const m = [0, 0, 0]; let n = 0;
      for (let y = S * 0.4; y < S * 0.6; y++) for (let x = S * 0.4; x < S * 0.6; x++) {
        const k = (Math.floor(y) * S + Math.floor(x)) * 4; m[0] += px[k]; m[1] += px[k + 1]; m[2] += px[k + 2]; n++;
      }
      return m.map(v => v / n);
    };
    const depth = [];
    for (const [i] of DEPTH_DYES) {
      const abs = lab.dyeOf(pal.colours[i]);
      const row = [];
      for (const a of DEPTHS) { await flat(abs, a); row.push(centre(await lab.render(S, NEUTRAL))); }
      depth.push(row);
    }
    // A ramp of mixtures across the plate, the same total dye everywhere:
    // plate 0 to 0.15 all the first dye, 0.85 to 1 all the second. Read along
    // the middle row, which the plate draws left to right or right to left;
    // the walk's evenness, read at both ends, does not care which.
    const ramps = [];
    for (const [i, j] of PAIRS) {
      const a = lab.dyeOf(pal.colours[i]), b = lab.dyeOf(pal.colours[j]);
      const { L } = await lab.create(64);
      const d = new Array(L * L * 4).fill(0);
      for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
        const w = Math.min(1, Math.max(0, ((x + 0.5) / L - 0.15) / 0.7));
        const k = (y * L + x) * 4;
        for (let c = 0; c < 3; c++) d[k + c] = a[c] * (1 - w) + b[c] * w;
        d[k + 3] = 1;
      }
      lab.addDye(d); lab.flush(); await lab.step(1);
      const flatGrade = Array.from(await lab.render(S, NEUTRAL));
      const graded = Array.from(await lab.render(S, { ...NEUTRAL, saturationBoost: 1.45 }));
      ramps.push({ flatGrade, graded });
    }
    // The same deep and thin yellow with the depth not drawn (Transmission 0):
    // the turn toward orange must come from the depth.
    const yellow = lab.dyeOf(pal.colours[0]);
    const flatYellow = [];
    for (const a of [DEPTHS[0], DEPTHS[2]]) { await flat(yellow, a); flatYellow.push(centre(await lab.render(S, { ...NEUTRAL, transmission: 0 }))); }
    return { looks: pal.looks, depth, ramps, flatYellow };
  }, [S, NEUTRAL, DEPTH_DYES, DEPTHS, PAIRS]);
} finally { await lab.close(); }

// 1. The dyes each look carries, and how many are on its plate.
{
  const sizes = data.looks.map(l => l.dyes);
  const five = sizes.filter(n => n >= 5).length;
  const none = data.looks.filter(l => l.dyes === 0).map(l => l.id);
  check('every look names its dyes', none.length === 0 && data.looks.length > 30, none.join(', ') || `${data.looks.length} looks`);
  check('most looks carry five dyes or more', five >= sizes.length * 0.6,
    `${five} of ${sizes.length} (sizes ${[...new Set(sizes)].sort((a, b) => a - b).map(n => `${n}: ${sizes.filter(m => m === n).length}`).join(', ')})`);
  const few = data.looks.filter(l => l.dyes >= 6 && l.onPlate < 5);
  check('every look with six dyes or more has five on its plate at once', few.length === 0,
    few.map(l => `${l.id} ${l.onPlate}`).join(', ') || data.looks.filter(l => l.dyes >= 6).map(l => l.onPlate).join(''));
}

// 2. A dye at three depths.
{
  const rows = data.depth.map((row, k) => ({ name: DEPTH_DYES[k][1], hsv: row.map(hsv), rgb: row }));
  const paler = rows.filter(r => !(r.hsv[0].s <= r.hsv[1].s - 0.03 && r.hsv[2].s >= r.hsv[1].s + 0.02));
  check('a thin wash of a dye is a paler tint of it, and depth saturates it further', paler.length === 0,
    rows.map(r => `${r.name} ${r.hsv.map(h => h.s.toFixed(2)).join('/')}`).join(', '));
  const blue = rows[2].rgb[1];
  const leak = Math.min(blue[0], blue[1]) / Math.max(1, blue[2]);
  check('a pure blue at one unit lets a few percent of red and green through', leak >= 0.02 && leak <= 0.08,
    `${(leak * 100).toFixed(1)}% (${blue.map(v => v.toFixed(0)).join('/')})`);
  const y = rows[0].hsv, y0 = data.flatYellow.map(hsv);
  check('a deep yellow turns toward orange, from the depth', y[0].h - y[2].h >= 4 && Math.abs(y0[0].h - y0[1].h) <= 1.5,
    `hue ${y.map(h => h.h.toFixed(0)).join('° / ')}° thin, one unit, deep; ${y0.map(h => h.h.toFixed(0)).join('° / ')}° thin and deep at Transmission 0`);
}

// 3 and 4. The ramps.
{
  // Across the whole frame: the lab draws the plate at 1.5 times the frame
  // (uvToFluid in plate.ts), so 2.5% to 97.5% of it is plate 0.15 to 0.85,
  // the ramp from one pure dye to the other. Hue at a position is the mean
  // of a few pixels about it, and the walk's ends are read as net change at
  // set places, so the 8-bit jitter of each step does not count.
  const hueAt = (px, f) => {
    const y = Math.floor(S / 2), x0 = Math.round(S * (0.025 + 0.95 * f));
    const m = [0, 0, 0]; let n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = Math.min(S - 1, Math.max(0, x0 + dx)), k = ((y + dy) * S + x) * 4;
      m[0] += px[k]; m[1] += px[k + 1]; m[2] += px[k + 2]; n++;
    }
    return hsv(m.map(v => v / n)).h;
  };
  const walks = [];
  let shifts = [], chroma1 = 0, chroma145 = 0;
  data.ramps.forEach((r, k) => {
    const h = [0, 0.1, 0.9, 1].map(f => hueAt(r.flatGrade, f));
    const tot = hueGap(h[0], h[3]);
    const ends = (hueGap(h[0], h[1]) + hueGap(h[2], h[3])) / Math.max(1e-6, tot);
    walks.push({ name: PAIRS[k][2], ends, tot });
    // Every pixel of the whole picture, for the grade.
    for (let i = 0; i < r.flatGrade.length; i += 4) {
      const a = hsv([r.flatGrade[i], r.flatGrade[i + 1], r.flatGrade[i + 2]]);
      const b = hsv([r.graded[i], r.graded[i + 1], r.graded[i + 2]]);
      if (a.c < 30) continue;
      shifts.push(hueGap(a.h, b.h)); chroma1 += a.c; chroma145 += b.c;
    }
  });
  const snaps = walks.filter(w => !(w.ends <= 0.34 && w.tot > 10));
  check('where two neighbouring dyes meet, the mixture walks between them', snaps.length === 0,
    walks.map(w => `${w.name} ${(w.ends * 100).toFixed(0)}% of ${w.tot.toFixed(0)}°`).join(', '));
  shifts.sort((a, b) => a - b);
  const p95 = shifts[Math.floor(shifts.length * 0.95)] ?? 0;
  check('the saturation grade keeps the hue', shifts.length > 1000 && p95 <= 3,
    `95th percentile ${p95.toFixed(1)}° over ${shifts.length} coloured pixels`);
  check('the grade still saturates', chroma145 >= chroma1 * 1.04, `chroma ×${(chroma145 / Math.max(1, chroma1)).toFixed(3)}`);
}

const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
