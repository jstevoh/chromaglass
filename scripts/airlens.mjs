#!/usr/bin/env node
/**
 * An air bubble as a projector throws it, measured on the lab's plate.
 *
 *   npm run airlens      (any adapter that computes: scripts/lab.mjs)
 *
 * The research on bubbles and drops (bubbles-and-drops.md, in the project's
 * shared files, item 2) found that the bubbles were drawn as a camera with a
 * front light sees a soap bubble: a bright crescent, a white highlight, film
 * colour round the rim. A bubble between a projector's glasses is none of
 * that. It is a pocket of air with the liquid pushed out, and its curved
 * edge bends the lamp's light three times as hard as an oil drop does, out of
 * the projection lens: so a small one is a dark disc round a pin-point, a big
 * one, flattened into a pancake by the glasses, a clear window edged in a
 * band from half the gap. The macro closeup is still the camera and keeps
 * the old bubble (the owner's "both", as for the drops: npm run droplens).
 *
 * Each question is asked of one bubble laid in the solver's own air field
 * (setBubbles, then two steps to stamp it and take the dye out under it), on
 * a plate of one grey, with the camera on the bubble. Where the bubble is in
 * the frame is found from the frame: every pixel that differs from the same
 * plate drawn with the bubbles' shading off. A field stamped upside down
 * (the orientation trap in wgsl/air.ts) puts that away from the frame's
 * middle, and the check stops rather than measuring the plate beside it.
 *
 * Brightness is read against the bubble's own middle, not the plain frame:
 * the plain frame has no liquid there, and on the lab's plate, as on every
 * look with a dark ground, no liquid is black.
 */
import { openLab } from './lab.mjs';
import { readFileSync } from 'node:fs';

/*
  The predictions, from the shader's own constants (read from plate.ts, so a
  change there moves them rather than leaving a copy here stale; the
  softening, its clamps and the gap's clamps are copied from dropHalfGap
  and the Bubbles block, and a stale copy turns the check red): the core
  ends at u* = X / sqrt(1 + X^2) of the curved part, X = NA / (2 n_w (n_w/n_air - 1));
  the curved part is the whole radius of a ball and half the gap round a
  pancake; the band leaves 1 - AIR_DARK of the light; and its inner edge is
  softened over 0.7 of a screen pixel as a fraction of the curved part.
*/
const plateSrc = readFileSync(new URL('../src/gpu/wgsl/plate.ts', import.meta.url), 'utf8');
const constant = (name) => {
  const m = plateSrc.match(new RegExp(`const ${name}: f32 = ([0-9.]+);`));
  if (!m) throw new Error(`no ${name} in plate.ts`);
  return Number(m[1]);
};
const NA = constant('DROP_NA'), NW = constant('N_WATER'), NAIR = constant('N_AIR'), DARK = constant('AIR_DARK'), HALF_GAP = constant('DROP_HALF_GAP');
const X = NA / (2 * NW * (NW / NAIR - 1)), CORE = X / Math.sqrt(1 + X * X);
/*
  Iridescence at its default, which every look has always had: the plate's
  bubble takes film colour only above it (plate.ts). Read from the defaults,
  and handed to every frame, so the check does not lean on what the lab
  happens to start from.
*/
const typesSrc = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
const IRID = Number((typesSrc.match(/\n  iridescence: ([0-9.]+),/) ?? [])[1]);
if (!Number.isFinite(IRID)) throw new Error('no default iridescence in types.ts');
const N = 192, S = 512, ZOOM = 3;
// Screen pixels to a plate unit, as uvToFluid in plate.ts maps them.
const PER_UNIT = S * 1.5 * ZOOM;
/*
  The size the plate reads: the air field packs it in sixteen steps on a log
  scale from 0.004 to 0.16 of the plate (wgsl/air.ts, sizeQ), and the band
  of a pancake is placed from that, while where in the bubble a point is
  comes from its laid radius. So a 12-cell bubble is read as 11.5 cells.
*/
const sizeRead = (r) => {
  const q = Math.floor(Math.min(1, Math.max(0, Math.log2(Math.max(r, 1e-4) / 0.004) / 5.321928)) * 15 + 0.5);
  return 0.004 * 2 ** (q / 15 * 5.321928);
};
// Where, as a fraction of the laid radius, the brightness is half the middle's.
const halfPoint = (r, rho) => {
  const R = sizeRead(r);
  const flat = Math.min(0.95, Math.max(0, 1 - rho / R));
  const soft = Math.min(0.3, Math.max(0.02, 0.7 / PER_UNIT / Math.max((1 - flat) * R, 1 / PER_UNIT)));
  // 1 - DARK * smoothstep(-1, 1, z) = 0.5, solved by halving.
  let lo = -1, hi = 1;
  for (let k = 0; k < 40; k++) { const z = (lo + hi) / 2, u = (z + 1) / 2; if (u * u * (3 - 2 * u) < 0.5 / DARK) lo = z; else hi = z; }
  return flat + (CORE + soft * lo) * (1 - flat);
};

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  const m = await page.evaluate(async ({ N, S, ZOOM, IRID }) => {
    const DIM = [0.6, 0.6, 0.6];
    // The closeup's own paint detail is laid over the whole frame, bubble or
    // none; what is asked is the bubble, so it is off in both views.
    const QUIET = { macroCells: 0, macroLacing: 0, macroDepth: 0, macroEdgeDetail: 0, macroRelief: 0 };
    const lum = (px, i) => 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
    /*
      One bubble of r cells at (x, y) on the grey plate, the glasses bowed by
      curve (0 at rest), photographed at 3x with the bubbles' shading on and
      off. The half gap under it comes back from the solver, as the plate
      reads it.
    */
    const shoot = async (x, y, r, { curve = 0, set = {}, cam = {} } = {}) => {
      await lab.create(N);
      for (let yy = 0.01; yy < 1; yy += 0.008) for (let xx = 0.01; xx < 1; xx += 0.008) lab.dye(xx, yy, 0.007, DIM, 1.2);
      lab.flush(); await lab.step(2);
      lab.solver().setBubbles(new Float32Array([x, y, r / N, 1]), 1, 0.05, new Float32Array(4));
      await lab.step(2, { plateCurve: curve });
      const sq = await lab.squeeze();
      // No readback is an error, not a gap of nothing.
      if (!sq) throw new Error('no gap read back from the solver');
      const gap = sq.gap[Math.floor(y * sq.n) * sq.n + Math.floor(x * sq.n)];
      if (!(gap > 0.001)) throw new Error(`the gap under the bubble reads ${gap}`);
      const view = { zoom: ZOOM, macroAmount: 0, view: true, cx: x, cy: y, ...cam };
      const on = await lab.render(S, { ...QUIET, iridescence: IRID, ...set }, { ...view, bubbles: 0.8 });
      const off = await lab.render(S, { ...QUIET, iridescence: IRID, ...set }, { ...view, bubbles: 0 });
      let x0 = S, x1 = -1, y0 = S, y1 = -1;
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
        const i = (yy * S + xx) * 4;
        if (Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]) > 24) {
          x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy);
        }
      }
      if (x1 < 0) throw new Error(`no bubble in the frame at (${x}, ${y})`);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, found = Math.max(x1 - x0, y1 - y0) / 2;
      if (Math.abs(cx - S / 2) > 4 || Math.abs(cy - S / 2) > 4) throw new Error(`the bubble at (${x}, ${y}) is at (${cx}, ${cy}) px, not the frame's middle`);
      /*
        The middle's brightness: a disc a tenth of the radius round the centre,
        inside the smallest core asked about here (0.27).
      */
      const rad = r / N * S * 1.5 * ZOOM;
      let mid = 0, nm = 0;
      for (let yy = Math.floor(S / 2 - 0.1 * rad); yy <= Math.ceil(S / 2 + 0.1 * rad); yy++) {
        for (let xx = Math.floor(S / 2 - 0.1 * rad); xx <= Math.ceil(S / 2 + 0.1 * rad); xx++) {
          if (Math.hypot(xx - S / 2, yy - S / 2) > 0.1 * rad) continue;
          mid += lum(on, (yy * S + xx) * 4); nm++;
        }
      }
      mid /= nm;
      /*
        Where the brightness first falls under half the middle's, walking out
        a pixel at a time in each of the four directions and interpolating
        between the two pixels either side; the four averaged, so a centre a
        pixel off cancels. As a fraction of the laid radius.
      */
      const crossings = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => {
        let prev = null;
        for (let t = 0; t <= Math.ceil(rad) + 2; t++) {
          const f = lum(on, ((S / 2 + dy * t) * S + S / 2 + dx * t) * 4) / Math.max(1, mid);
          if (f < 0.5) return prev ? prev.t + (prev.f - 0.5) / (prev.f - f) : 0;
          prev = { t, f };
        }
        return Infinity;
      });
      const edge = crossings.reduce((a, b) => a + b, 0) / 4 / rad;
      /*
        Over a ring of radii lo to hi: the brightness's mean, median, brightest
        in a hundred and brightest, against the middle's; the mean colour; and
        the mean of each pixel's own chroma (its brightest channel less its
        dimmest), which a film whose hue changes across the window cannot
        average away to grey as the mean colour can.
      */
      const ring = (lo, hi, px = on) => {
        const ls = []; const c = [0, 0, 0]; let chroma = 0;
        for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
          const d = Math.hypot(xx - S / 2, yy - S / 2) / rad;
          if (d < lo || d > hi) continue;
          const i = (yy * S + xx) * 4;
          ls.push(lum(px, i));
          c[0] += px[i]; c[1] += px[i + 1]; c[2] += px[i + 2];
          chroma += Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]);
        }
        const n = ls.length;
        if (n < 20) throw new Error(`only ${n} pixels from ${lo} to ${hi} of the radius`);
        ls.sort((a, b) => a - b);
        const k = Math.max(1, mid);
        return { mean: ls.reduce((a, b) => a + b, 0) / n / k, median: ls[Math.floor(n / 2)] / k, top: ls[Math.floor(0.99 * (n - 1))] / k,
          max: ls[n - 1] / k, rgb: c.map((v) => v / n), chroma: chroma / n };
      };
      // The liquid round it, from the frame without the bubbles' shading, in the same units as mid.
      const liquid = ring(1.4, 1.7, off).mean * Math.max(1, mid);
      return { gap, mid, rad, found, liquid, edge, crossings, ring };
    };
    const out = {};
    // A small bubble: 2.5 cells, a ball (under half the gap at rest, 3 cells).
    {
      const s = await shoot(0.5, 0.42, 2.5);
      out.small = { gap: s.gap, mid: s.mid, rad: s.rad, found: s.found, edge: s.edge, band: s.ring(0.4, 0.55).mean };
      const c = await shoot(0.5, 0.42, 2.5, { cam: { macroAmount: 1 } });
      out.smallCam = { band: c.ring(0.4, 0.55).mean };
      /*
        Part way into the closeup: the bubble changes view with the drops,
        over the middle fifth of the zoom's fade (dropCam, smoothstep 0.4 to
        0.6), not across the whole of it. At 0.35 of the way it is still the
        projector's, at 0.65 already the camera's.
      */
      out.early = { band: (await shoot(0.5, 0.42, 2.5, { cam: { macroAmount: 0.35 } })).ring(0.4, 0.55).mean };
      out.late = { band: (await shoot(0.5, 0.42, 2.5, { cam: { macroAmount: 0.65 } })).ring(0.4, 0.55).mean };
    }
    // A big one, 12 cells, a pancake: flat but for half the gap round its edge.
    {
      /*
        The window: how bright its middle fifth is against its outer part
        (0.4 to 0.6 of the radius), which a dome's shading darkens outward;
        and its brightest pixel in a hundred against the median, which a
        highlight lifts. Not the brightest pixel against the dimmest: the
        lab's plate is laid in a lattice of dye discs, and the liquid's hue
        the window carries is read from a ring round the bubble through
        where in it each point is, so the window has a grain of a few
        percent (measured, 151 to 164 against a middle of 157).
      */
      const win = (s) => { const w = s.ring(0, 0.6); return { dome: s.ring(0, 0.2).mean / s.ring(0.4, 0.6).mean, glint: w.top / w.median, peak: w.max / w.median, rgb: w.rgb, chroma: w.chroma }; };
      const s = await shoot(0.5, 0.5, 12);
      out.big = { gap: s.gap, mid: s.mid, rad: s.rad, found: s.found, liquid: s.liquid, edge: s.edge, ...win(s), band: s.ring(0.86, 0.9).mean };
      out.bigCam = win(await shoot(0.5, 0.5, 12, { cam: { macroAmount: 1 } }));
      out.film = win(await shoot(0.5, 0.5, 12, { set: { iridescence: 1 } }));
      /*
        The glasses bowed apart in the middle (plateCurve +0.5), so the gap
        under the bubble is wider and its band should begin further in; and
        pressed together (-0.5), printed. Pressed, the band is a cell and a
        tenth wide, inside the air field's own antialiased rim (a texel and a
        half, wgsl/air.ts), where the coverage that weights where a point is
        falls steeply and pulls its reading inward: the band is drawn two or
        three pixels further out at 3x than the gap says (measured 0.929
        against 0.902). That is the field's resolution, not the optics, so
        the band's following the gap is asked where the field can resolve it.
      */
      const w = await shoot(0.5, 0.5, 12, { curve: 0.5 });
      out.wide = { gap: w.gap, edge: w.edge };
      const p = await shoot(0.5, 0.5, 12, { curve: -0.5 });
      out.press = { gap: p.gap, edge: p.edge };
    }
    return out;
  }, { N, S, ZOOM, IRID });

  console.log(`     the core ends at ${CORE.toFixed(3)} of the curved part (NA ${NA}, air ${NAIR} in water ${NW}); the band leaves ${(1 - DARK).toFixed(2)}`);
  /*
    Every prediction below moves with the constants it is read from, so an
    edit to them moves the shader and the check together. One anchor that
    does not: the research's table (bubbles-and-drops.md, item 1) has the
    core of an air bubble in water at 0.06 to 0.22 of the radius for the
    bare lens (NA 0.05 to 0.2), and the effective aperture the drops use,
    0.25, puts it a little past that. A core outside 0.15 to 0.35 is no
    longer air in water, whatever the constants say (an oil drop's is 0.71).
  */
  check('the aperture puts an air bubble\'s core where the research does', CORE > 0.15 && CORE < 0.35,
    `${CORE.toFixed(3)} of the curved part`);
  // As dropHalfGap reads it: no gap in the view (a blank field) is the gap at rest.
  const halfAt = (gap) => (gap > 0.001 ? HALF_GAP * Math.min(3, Math.max(0.3, gap / 0.03)) : HALF_GAP);
  const predS = halfPoint(2.5 / N, halfAt(m.small.gap)), predB = halfPoint(12 / N, halfAt(m.big.gap));
  // The frame finds each bubble at the size it was laid, to three pixels.
  const sized = [m.small, m.big].every((b) => Math.abs(b.found - b.rad) <= 3);
  console.log(`     the bubbles found ${m.small.found.toFixed(1)} and ${m.big.found.toFixed(1)} px across their radius, laid ${m.small.rad.toFixed(1)} and ${m.big.rad.toFixed(1)}`);
  /*
    How dark the band is, as well as where: a tenth of the light (1 -
    AIR_DARK) within five hundredths. Where it begins barely depends on how
    dark it is, so a band half as dark would pass on position alone.
  */
  const bandOk = (b) => Math.abs(b - (1 - DARK)) <= 0.05;
  /*
    Within four hundredths of the radius: a pixel of the small bubble's 29.
    Where in its bubble a point is comes from a field three cells across,
    good to a fraction of a texel.
  */
  check('projected, a small bubble is a dark disc round a pin-point',
    sized && Math.abs(m.small.edge - predS) <= 0.04 && bandOk(m.small.band),
    `half as bright as its middle ${m.small.edge.toFixed(3)} of the radius out (the aperture says ${predS.toFixed(3)}); ${(100 * m.small.band).toFixed(0)}% of its middle from 0.4 to 0.55`);
  /*
    Within two hundredths, about three pixels of the big bubble's 138: its
    band's inner edge is where a pancake's meniscus begins and the aperture's
    core ends in it, both from the gap the solver says is under it.
  */
  check('projected, a big bubble is a clear window edged in a band from half the gap',
    sized && Math.abs(m.big.edge - predB) <= 0.02 && bandOk(m.big.band),
    `half as bright ${m.big.edge.toFixed(3)} of the radius out (half the gap, ${(halfAt(m.big.gap) * N).toFixed(2)} cells, and the aperture say ${predB.toFixed(3)}); ${(100 * m.big.band).toFixed(0)}% of its middle from 0.86 to 0.9`);
  /*
    And clear: every figure above is against the bubble's own middle, which
    says nothing of how bright the middle is. The window is the lamp through
    air where the liquid was, so it is at least as bright as the liquid
    round it; and a small bubble's pin-point is the same lamp, as bright as
    the big one's window to a fifth.
  */
  check('the window and the pin-point are the lamp, as bright as the liquid round them or brighter',
    m.big.mid >= m.big.liquid && Math.abs(m.small.mid / m.big.mid - 1) <= 0.2,
    `the big bubble's middle ${m.big.mid.toFixed(0)} against the liquid's ${m.big.liquid.toFixed(0)}; the small one's ${m.small.mid.toFixed(0)}`);
  /*
    Flat across the window, to six tenths out: the lamp through a slab of
    air. Its middle within three percent of its outer part (a dome darkens
    outward); its brightest pixel in a hundred within six percent of the
    median, and its brightest within ten (the lab plate's grain tops out at
    1.045), so a highlight too small to move a hundredth of the window still
    shows. And as grey as the grey plate, at the default Iridescence: each
    pixel's brightest channel within four levels of its dimmest on average
    (the film the camera's bubble wears at the default moved the window's
    mean channels twelve apart, 144,166,156). The camera's bubble, printed
    beside it, has a dome and a highlight.
  */
  check('and its window is flat: no highlight, no film colour, no dome',
    Math.abs(m.big.dome - 1) < 0.03 && m.big.glint < 1.06 && m.big.peak < 1.1 && m.big.chroma < 4,
    `middle ×${m.big.dome.toFixed(3)} its outer part, brightest in a hundred ×${m.big.glint.toFixed(3)} the median and brightest ×${m.big.peak.toFixed(3)} (the closeup's bubble: ×${m.bigCam.dome.toFixed(2)}, ×${m.bigCam.glint.toFixed(2)}, ×${m.bigCam.peak.toFixed(2)}); chroma ${m.big.chroma.toFixed(1)} a pixel at Iridescence ${IRID}`);
  /*
    Iridescence asks for soap film. Turned up it must still colour the
    window on the plate, or the setting would do nothing at 1x: colour, a
    pixel's channels apart, not only a change of brightness.
  */
  const filmShift = Math.hypot(...m.film.rgb.map((v, i) => v - m.big.rgb[i]));
  check('but Iridescence turned up still lays film colour over it',
    filmShift > 8 && m.film.chroma > m.big.chroma + 8,
    `the window's mean colour moves ${filmShift.toFixed(1)} (${m.big.rgb.map((v) => v.toFixed(0)).join(',')} → ${m.film.rgb.map((v) => v.toFixed(0)).join(',')}), chroma ${m.big.chroma.toFixed(1)} → ${m.film.chroma.toFixed(1)} a pixel`);
  /*
    With the gap wider under it, the band's inner edge moves in by what the
    gap says, within a fifth; a band that ignored the gap stays put, and one
    that followed its square root moves about half as far.

    Pressed, only the direction and at least half the distance: the pressed
    band is inside the air field's antialiased rim (above), which reads it
    two or three pixels further out than the gap says. A band that could
    only widen, never narrow, stays put.
  */
  const predW = halfPoint(12 / N, halfAt(m.wide.gap)), predP = halfPoint(12 / N, halfAt(m.press.gap));
  const shift = m.big.edge - m.wide.edge, predShift = predB - predW;
  check('a wider gap widens the band',
    m.wide.gap > 1.3 * m.big.gap && Math.abs(shift - predShift) <= 0.2 * predShift,
    `the glasses bowed from ${m.big.gap.toFixed(4)} to ${m.wide.gap.toFixed(4)} under it; the band's edge from ${m.big.edge.toFixed(3)} to ${m.wide.edge.toFixed(3)} of the radius, in by ${shift.toFixed(3)} (says ${predShift.toFixed(3)})`);
  const pshift = m.press.edge - m.big.edge, predPShift = predP - predB;
  check('and a narrower one narrows it',
    m.press.gap < 0.8 * m.big.gap && pshift >= 0.5 * predPShift,
    `pressed to ${m.press.gap.toFixed(4)}, the band's edge ${m.press.edge.toFixed(3)} of the radius, out by ${pshift.toFixed(3)} (the gap says ${predPShift.toFixed(3)}; the air field's rim reads it further)`);
  check('in the closeup the camera\'s bubble is lit where the plate\'s is dark',
    m.smallCam.band > 3 * m.small.band && m.smallCam.band > 0.35,
    `${(100 * m.smallCam.band).toFixed(0)}% of its middle from 0.4 to 0.55 of the small bubble, ${(100 * m.small.band).toFixed(0)}% projected`);
  check('and the view changes over the middle of the zoom\'s fade, with the drops\'',
    m.early.band < 0.25 && m.late.band > 0.35,
    `${(100 * m.early.band).toFixed(0)}% at 0.35 of the way, ${(100 * m.late.band).toFixed(0)}% at 0.65`);
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
