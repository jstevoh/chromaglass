/**
 * The closeup's ferrofluid drop (PLAN §29a): a bead standing off the glass,
 * lit as a camera sees it, its shape the liquid's.
 *
 * What was reported: the owner, 2026-10-11, "I want to see much more 3d
 * drops. I want to see a drop of ferro fluid with light reflecting off of
 * it, with some dye on top of it". What the closeup drew was a flat black
 * disc: rendered in the lab, the drop's inside was one value of black.
 *
 * What this holds, each against the thing it would read if the feature were
 * gone or faked:
 *
 *  1. The surface is the sessile drop's (wgsl/ferroDrop.ts): its middle
 *     stands at 2 sin(θ/2) (1 − 1/I0(a)) l_c for the contact angle Relief /
 *     3D asks and its radius a, which is the balance's own solution for a
 *     round drop; nothing stands where there is no ferrofluid; and the top
 *     is reached over about l_c from the edge, not at the edge (a surface
 *     that only followed the phase would be a step).
 *  2. The magnet moves the drop's volume toward itself: with the hand's
 *     magnet just off its right side (where the field falls off fastest)
 *     the right shoulder stands a tenth taller than with no field and the
 *     left lower, and the volume is the same within a tenth (the field
 *     moves the liquid, it does not add any).
 *  3. The picture: in the closeup the drop's inside is no longer one black.
 *     The spread of its light (the 98th percentile less the 5th) is wide at
 *     Relief / 3D 0.7 and nearly nothing at 0, which is the flat drawing as
 *     it was; and its brightest pixels sit on the key light's side, up and
 *     to the left of the drop's middle, as a reflection of a light there
 *     must.
 *  4. The dye over the drop colours what it reflects: a yellow laid over
 *     the drop takes the blue out of the drop's highlight (yellow absorbs
 *     blue) against the same drop with no dye, and less of the red.
 *  5. Only the closeup: the plate at 1x is the same to the byte whatever
 *     Relief / 3D is, since the drop is drawn as a camera sees it, and the
 *     projector's plate is not a camera's.
 *  6. The domes the Magnet stands (PLAN 29a-10): the owner, 2026-11-01, "Let's
 *     make sure we have 3d in the macro view", after the films of Magnet
 *     Garden's domes. In the closeup they were black blobs, each with a dim
 *     dot: their sides' reflection, a few percent of the lit liquid round
 *     them, was multiplied into the display's values as if they were light.
 *     On a pool held over the hand's Magnet, the domes in the closeup show a
 *     dark gloss well off black, and it varies across each.
 *
 * Lab only (the real solver and plate shader on software WebGPU); a few
 * minutes on a cloud box, seconds on the Mac.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 256;
const R = 0.04;          // the drop's radius as poured, in plate widths
const LC = 0.04 / (2 * Math.PI);   // l_c in plate widths (SPIKE_PITCH / 2π)
const SIZE = 384;

const { page, close } = await openLab();
try {
  const result = await page.evaluate(async ({ N, R, SIZE }) => {
    const settings = (relief) => ({ ...lab.look('ferro-paint').settings, ferroLabyrinth: 0, macroCells: 0, macroLacing: 0, macroRelief: relief });
    const lay = async (dye) => {
      await lab.create(N);
      if (dye) lab.dye(0.5, 0.5, 0.09, lab.dyeOf([1.0, 0.85, 0.05]), 1.4);
      lab.flush();
      lab.addPhase(0.5, 0.5, R, 1);
      // No magnet while it settles, and the dye left where it is (Pushes Dye off).
      await lab.step(20, { phaseSharp: 0.75, phaseDisplace: 0 });
    };
    const lum = (px, i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    const cam = { zoom: 5, macroAmount: 1, cx: 0.5, cy: 0.5, magnets: [] };
    // A plain drop: its surface, the picture at two reliefs, and the plate.
    await lay(false);
    const flat = await lab.render(SIZE, settings(0), cam);
    const lit = await lab.render(SIZE, settings(0.7), cam);
    const still = lab.dropHeight();
    const phase = await lab.phase();
    // The magnet under the drop's right side, in the picture only (the solver is not stepped).
    await lab.render(64, settings(0.7), { ...cam, magnets: [{ x: 0.5 + R + 0.03, y: 0.5, height: 0.15, strength: 0.9 }] });
    const leaned = lab.dropHeight();
    const plate0 = await lab.render(256, settings(0), { zoom: 1, macroAmount: 0, magnets: [] });
    const plate7 = await lab.render(256, settings(0.7), { zoom: 1, macroAmount: 0, magnets: [] });
    // The same drop under a yellow.
    await lay(true);
    const dyed = await lab.render(SIZE, settings(0.7), cam);
    const dyedFlat = await lab.render(SIZE, settings(0), cam);
    await lay(false);
    const clear = await lab.render(SIZE, settings(0.7), cam);

    // The drop on screen: the flat drawing's black disc.
    const disc = (px) => {
      let m = 0, sx = 0, sy = 0;
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        if (lum(px, (y * SIZE + x) * 4) < 25) { m++; sx += x; sy += y; }
      }
      return { x: sx / m, y: sy / m, r: Math.sqrt(m / Math.PI) };
    };
    const d = disc(flat);
    const inside = (px, D, f) => {
      const out = [];
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        if (Math.hypot(x - D.x, y - D.y) < f * D.r) out.push({ x, y, i: (y * SIZE + x) * 4, l: lum(px, (y * SIZE + x) * 4) });
      }
      return out;
    };
    const spread = (px) => {
      const ls = inside(px, d, 0.85).map((p) => p.l).sort((a, b) => a - b);
      return ls[Math.floor(ls.length * 0.98)] - ls[Math.floor(ls.length * 0.05)];
    };
    const brightest = inside(lit, d, 0.95).sort((a, b) => b.l - a.l).slice(0, 60);
    const bx = brightest.reduce((s, p) => s + p.x, 0) / brightest.length - d.x;
    const by = brightest.reduce((s, p) => s + p.y, 0) / brightest.length - d.y;
    // The highlight's colour: the brightest pixels of each, where the drop is.
    const dd = disc(dyedFlat);
    const colour = (px, D) => {
      const top = inside(px, D, 0.95).sort((a, b) => b.l - a.l).slice(0, 60);
      const c = [0, 1, 2].map((k) => top.reduce((s, p) => s + px[p.i + k], 0) / top.length);
      return c;
    };
    let same = 0;
    for (let i = 0; i < plate0.length; i++) if (plate0[i] !== plate7[i]) same++;

    // The surface along the row through the drop's middle.
    const n = still.n;
    const row = (h) => Array.from({ length: n }, (_, x) => h[Math.floor(n / 2) * n + x]);
    const ph = Array.from({ length: phase.n }, (_, x) => phase.data[Math.floor(phase.n / 2) * phase.n + x]);
    let outside = 0;
    for (let i = 0; i < n * n; i++) if (phase.data[i] < 0.15) outside = Math.max(outside, still.h[i]);
    const vol = (h) => h.reduce((s, v) => s + v, 0);
    return {
      n, still: row(still.h), leaned: row(leaned.h), ph, outside,
      volStill: vol(still.h), volLeaned: vol(leaned.h),
      flat: spread(flat), lit: spread(lit), d, bx, by,
      dyed: colour(dyed, dd), clear: colour(clear, disc(flat)), differ: same,
    };
  }, { N, R, SIZE });

  // 1. The surface.
  const { n, still, leaned, ph } = result;
  const mid = Math.floor(n / 2);
  let edge = mid;
  while (edge < n - 1 && ph[edge + 1] >= 0.5) edge++;
  const lcCells = LC * n;
  const plateau = 2 * Math.sin((0.7 * 160 * Math.PI) / 180 / 2);
  const top = still[mid];
  const at1 = still[Math.round(edge - lcCells)];
  /*
    The middle of a round drop of radius a (in l_c) under h − ∇²h = P with
    h = 0 on its edge is P (1 − 1/I0(a)): the plateau, less what the edge
    still holds it down by when the drop is only a few l_c across. A
    surface that followed the phase, or one scaled to the plateau, misses it.
  */
  const a = (edge + 0.5 - mid) / lcCells;
  let i0 = 0, term = 1;
  for (let k = 0; k < 40; k++) { i0 += term; term *= (a / 2) ** 2 / ((k + 1) ** 2); }
  const want = plateau * (1 - 1 / i0);
  check('the drop stands as the sessile balance says for its contact angle and size (θ 112° at Relief / 3D 0.7)',
    Math.abs(top - want) < 0.06 * want,
    `${top.toFixed(3)} l_c in the middle against ${want.toFixed(3)} (2 sin θ/2 = ${plateau.toFixed(3)}, times 1 − 1/I0(${a.toFixed(2)})), the drop ${a.toFixed(1)} l_c in radius`);
  check('nothing stands where there is no ferrofluid', result.outside < 0.02, `highest outside the drop ${result.outside.toFixed(4)} l_c`);
  check('the top is reached over about l_c from the edge, not at it',
    at1 > 0.35 * top && at1 < 0.9 * top,
    `one l_c in from the half-full line ${(at1 / top * 100).toFixed(0)}% of the top (1 − 1/e is 63%)`);
  // 2. The magnet.
  // Each side against itself with no field, since the drop's middle falls between cells.
  const half = Math.round((edge - mid) / 2);
  const right = leaned[mid + half] / still[mid + half], left = leaned[mid - half] / still[mid - half];
  check('a magnet off the drop\'s right side stands that side taller and the far side lower',
    right > 1.1 && left < 1 && right > 1.15 * left,
    `right shoulder ${(right * 100).toFixed(0)}% of its height with no field, left ${(left * 100).toFixed(0)}%`);
  check('and moves the volume rather than adding to it',
    Math.abs(result.volLeaned / result.volStill - 1) < 0.1, `${(result.volLeaned / result.volStill * 100).toFixed(1)}% of the volume with no field`);
  // 3. The picture.
  check('the closeup lights the drop\'s inside at Relief / 3D 0.7',
    result.lit > 60, `light spread inside the drop ${result.lit.toFixed(1)} of 255 (the drop ${result.d.r.toFixed(0)} px in radius)`);
  check('and at Relief / 3D 0 it is the flat black it was',
    result.flat < 8, `spread ${result.flat.toFixed(1)}`);
  check('the brightest of it is on the key light\'s side, up and to the left',
    result.bx < -0.1 * result.d.r && result.by < -0.1 * result.d.r,
    `the brightest 60 pixels ${(result.bx / result.d.r).toFixed(2)}, ${(result.by / result.d.r).toFixed(2)} radii from the middle (screen x right, y down)`);
  // 4. The dye over it.
  const [dr, , db] = result.dyed, [cr, , cb] = result.clear;
  check('a yellow over the drop takes the blue out of its highlight, and less of the red',
    db / cb < 0.7 && dr / cr > db / cb + 0.2,
    `blue ${cb.toFixed(0)} → ${db.toFixed(0)}, red ${cr.toFixed(0)} → ${dr.toFixed(0)}`);
  // 5. The plate.
  check('the plate at 1x is the same to the byte at any Relief / 3D', result.differ === 0, `${result.differ} bytes differ`);

  // 6. The domes the Magnet stands, in the closeup.
  const domes = await page.evaluate(async ({ SIZE }) => {
    await lab.create(256);
    const cols = [[0.02, 0.36, 2.0], [2.0, 0.4, 0.48], [0.02, 0.8, 1.05]];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) lab.dye(0.12 + i * 0.25, 0.12 + j * 0.25, 0.16, cols[(i + j) % 3], 1.3);
    lab.flush(); await lab.step(2);
    const M = { x: 0.42, y: 0.58 };
    lab.addPhase(M.x, M.y, 0.09, 0.9);
    // Magnet Garden's phase settings and the hand's Magnet held under the pool (domes.mjs, spikes.mjs).
    const over = { ferroLabyrinth: 0.8, phaseSharp: 0.75, phaseTension: 0.3 * 0.45, phaseDisplace: 0,
      magnetStrength: 0.9, magnetHeight: 0.15 * 0.9, magnetSeconds: 1 / 60, magnetX: M.x, magnetY: M.y };
    for (let k = 0; k < 160; k += 4) await lab.step(4, over);
    const f = await lab.phase();
    let tall = 0; for (const v of f.data) if (v > 1.5) tall++;
    const settings = (relief) => ({ ...lab.look('magnet-garden').settings, macroRelief: relief });
    const cam = { zoom: 6, macroAmount: 1, cx: M.x, cy: M.y };
    const flat = await lab.render(SIZE, settings(0), cam);
    const lit = await lab.render(SIZE, settings(0.7), cam);
    const lum = (px, i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    // The ferrofluid on screen: what the flat drawing draws black, three pixels in from its edge.
    const dark = new Uint8Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) dark[i] = lum(flat, i * 4) < 25 ? 1 : 0;
    const ls = [];
    for (let y = 3; y < SIZE - 3; y++) for (let x = 3; x < SIZE - 3; x++) {
      let all = 1;
      for (let dy = -3; dy <= 3 && all; dy++) for (let dx = -3; dx <= 3; dx++) if (!dark[(y + dy) * SIZE + x + dx]) { all = 0; break; }
      // The brightest channel: the gloss is the dye's colour mirrored, mostly red under a yellow.
      if (all) { const i = (y * SIZE + x) * 4; ls.push(Math.max(lit[i], lit[i + 1], lit[i + 2])); }
    }
    ls.sort((a, b) => a - b);
    const q = (t) => ls[Math.floor(ls.length * t)];
    return { tall, px: ls.length, p10: q(0.1), p50: q(0.5), p90: q(0.9) };
  }, { SIZE });
  /*
    A dome is a steep cone: most of its surface is past Snell's window (its
    reflection cannot leave through the top glass) or faces down, so what it
    shows is the lamp-lit liquid round it, mirrored at Fresnel's 0.5 to 4 %.
    A camera records 2 % of a white at about 39 of 255; multiplied into the
    display's values as if they were light, it was 5, and the domes were one
    black (its brightest channel 2 of 255 in the middle). So: the middle of
    the domes' light a dark gloss well off black, and spread across each,
    which a flat lift would not be.
  */
  check('in the closeup the Magnet\'s domes mirror the lit liquid round them, as a camera records a dark gloss, not one black',
    domes.tall > 50 && domes.p50 >= 12 && domes.p50 <= 100,
    `the middle of the domes' light ${domes.p50.toFixed(1)} of 255 over ${domes.px} px (${domes.tall} cells stood past 1.5 full)`);
  check('and that light runs across each dome, its shape, not a flat grey',
    domes.p90 - domes.p10 >= 20,
    `${domes.p10.toFixed(1)} to ${domes.p90.toFixed(1)} from the 10th to the 90th percentile`);
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
