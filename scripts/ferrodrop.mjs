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
 *     round drop, with the plateau no higher than the top glass (0.95 of
 *     the 2 mm gap, 1.49 l_c, PLAN 38r); nothing stands where there is no ferrofluid; and the top
 *     is reached over about l_c from the edge, not at the edge (a surface
 *     that only followed the phase would be a step).
 *  2. The magnet moves the drop's volume toward itself: with the hand's
 *     magnet just off its right side (where the field falls off fastest)
 *     the left shoulder stands lower than with no field and the right a
 *     tenth taller, or, where the drop is already pressed to the top glass
 *     (this drop in the 2 mm gap, PLAN 38r), held at the glass; the lean
 *     between the two is 1.15 either way, and the volume is the same within
 *     a tenth (the field moves the liquid, it does not add any).
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
 *  6. A glass pressed down on the drop squeezes it, it does not cut it
 *     (PLAN 29a-11, owed). The plate pressed to a 0.8 mm gap all over before
 *     the same drop is laid, against the plate at its 2 mm rest: the drop's
 *     volume, the integral of h over the plate, is the same within 0.5%,
 *     and nowhere does the surface the display is handed (z, the packed
 *     flow's third channel) stand above the glass over it, pressed or at
 *     rest. See the line's comment for why.
 *
 *   npm run ferrodrop -- --owed=29a-11
 *
 * Each line under an id in `--owed` is printed as owed while what it asks
 * for is absent (the convention of `npm run gap`): the PR that builds the
 * item takes its id out of `--owed` in scripts/checks.json and never edits
 * a line or a bar. A build that is there and misses is red, owed or not,
 * and an owed line that passes is red until its id is taken out.
 *
 *  7. The domes the Magnet stands (PLAN 29a-13): the owner, 2026-11-01, "Let's
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
import { DISH_GAP_METRES, DISH_METRES, DISH_REST_GAP } from '../src/lib/turntable.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const IDS = ['29a-11'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
const unknown = [...owed].filter((id) => !IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${IDS.join(', ')})`);
/** `mainState`: what the line is owed for is absent, which is the only state an owed line is excused in. */
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
};

const N = 256;
const R = 0.04;          // the drop's radius as poured, in plate widths
const LC = 0.04 / (2 * Math.PI);   // l_c in plate widths (SPIKE_PITCH / 2π)
const SIZE = 384;
/*
  The pressed gap of line 6 (PLAN 29a-11), in the solver's gap field: the
  field is DISH_REST_GAP at the 2 mm rest (lib/turntable.ts), so 0.8 mm is
  0.4 of it. 0.8 mm is 0.63 l_c, well under the 1.49 l_c the solve caps a
  drop at today, so a solve that ignores the live gap stands a drop more
  than twice as tall as the glass over it.
*/
const PRESSED_METRES = 0.0008;
const PRESSED = DISH_REST_GAP * PRESSED_METRES / DISH_GAP_METRES;

const { page, close } = await openLab();
try {
  const result = await page.evaluate(async ({ N, R, SIZE, PRESSED, REST }) => {
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

    /*
      6. Pressed (PLAN 29a-11). The glass is brought down to 0.8 mm over the
      whole plate through the cover's own ledger (lib/cover.ts, PLAN 38r-5):
      the same 157 g glass on 0.4 of the default 62.8 mL settles at 0.4 of
      the 2 mm gap, from its first step and held there (measured
      2026-11-21: coverMetres 0.00080, the squeeze field 0.01199 in every
      cell, against 0.03 at rest). Not the gap column of the velocity
      deltas: laid there it never reached the squeeze field at all (0.030
      everywhere after ten steps, on the old plate and the thin one), and
      not Cover Hand's press, which keeps closing the film for seconds
      (0.69 to 0.32 mm over 120 steps) and so has no one gap to hold the
      drop against. Then the drop is laid and settled as in lay(). The
      control is the default liquid's 2 mm. The drop is the same ferrofluid
      on the same footprint in both, so its volume must be the same.
    */
    const pressedArm = async (share) => {
      await lab.create(N);
      lab.flush();
      const glass = { liquidMl: 62.8 * share };
      await lab.step(10, glass);
      lab.addPhase(0.5, 0.5, R, 1);
      await lab.step(20, { ...glass, phaseSharp: 0.75, phaseDisplace: 0 });
      await lab.render(64, settings(0.7), cam);
      const hs = lab.dropHeight();
      // The surface the display is handed, if the lab can read it (dropSurface, the API line 6 asks for).
      const surf = typeof lab.dropSurface === 'function' ? lab.dropSurface() : null;
      const sq = await lab.squeeze();
      const ph = await lab.phase();
      // The gap over the drop: the least and most of the field where the ferrofluid is.
      let gMin = Infinity, gMax = 0, sumC = 0;
      for (let k = 0; k < ph.data.length; k++) {
        sumC += ph.data[k];
        if (ph.data[k] > 0.05 && sq.n === ph.n) { gMin = Math.min(gMin, sq.gap[k]); gMax = Math.max(gMax, sq.gap[k]); }
      }
      return {
        vol: hs.h.reduce((s, v) => s + v, 0), maxH: Math.max(...hs.h), sumC, gMin, gMax,
        maxZ: surf ? Math.max(...surf.z) : null,
      };
    };
    const rest = await pressedArm(1);
    const pressed = await pressedArm(PRESSED / REST);

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
      rest, pressed,
    };
  }, { N, R, SIZE, PRESSED, REST: DISH_REST_GAP });

  // 1. The surface.
  const { n, still, leaned, ph } = result;
  const mid = Math.floor(n / 2);
  let edge = mid;
  while (edge < n - 1 && ph[edge + 1] >= 0.5) edge++;
  const lcCells = LC * n;
  /*
    The sessile plateau, 2 sin(θ/2) = 1.66 l_c at 112°, unless the top glass
    is lower: the plate's 2 mm rest gap (PLAN 38r) is 1.57 l_c, and a drop
    that tall touches it, so gpu/ferroDrop.ts lets a drop stand to 0.95 of
    the gap and no more. In the 6 mm gap this was written on (4.7 l_c) the
    glass was far above every drop and the plateau was the sessile one.
  */
  const sessile = 2 * Math.sin((0.7 * 160 * Math.PI) / 180 / 2);
  const glass = 0.95 * (DISH_GAP_METRES / DISH_METRES) / LC;
  const plateau = Math.min(sessile, glass);
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
  check('the drop stands as the sessile balance says for its contact angle and size (θ 112° at Relief / 3D 0.7), up to the top glass',
    Math.abs(top - want) < 0.06 * want,
    `${top.toFixed(3)} l_c in the middle against ${want.toFixed(3)} (the lower of 2 sin θ/2 = ${sessile.toFixed(3)} and the glass ${glass.toFixed(3)}, times 1 − 1/I0(${a.toFixed(2)})), the drop ${a.toFixed(1)} l_c in radius`);
  check('nothing stands where there is no ferrofluid', result.outside < 0.02, `highest outside the drop ${result.outside.toFixed(4)} l_c`);
  check('the top is reached over about l_c from the edge, not at it',
    at1 > 0.35 * top && at1 < 0.9 * top,
    `one l_c in from the half-full line ${(at1 / top * 100).toFixed(0)}% of the top (1 − 1/e is 63%)`);
  // 2. The magnet.
  // Each side against itself with no field, since the drop's middle falls between cells.
  const half = Math.round((edge - mid) / 2);
  const right = leaned[mid + half] / still[mid + half], left = leaned[mid - half] / still[mid - half];
  /*
    Under a top glass the drop cannot stand taller on the magnet's side:
    this drop's sessile top (1.66 l_c) is above the 2 mm gap's glass (1.49
    l_c, PLAN 38r), so with no field it already stands at the glass, and
    the magnet's lean, which the solve clamps to the glass (gpu/ferroDrop.ts
    A.more.y), can only take the far side down. That is the physics of a
    sandwich: the volume the magnet draws toward itself comes off the far
    side, and the near side stays pressed to the glass. So here the near
    shoulder holds its height (within 2%) while the far one falls, and the
    lean between them is the same 1.15 as before. On a gap the sessile top
    clears (the 6 mm dish this was written on: 138% and 78%) the near
    shoulder rises a tenth, as it did.
  */
  const pinned = sessile > glass;
  check(pinned
    ? 'a magnet off the drop\'s right side, the drop pressed to the top glass, holds that side at the glass and takes the far side lower'
    : 'a magnet off the drop\'s right side stands that side taller and the far side lower',
    (pinned ? right > 0.98 : right > 1.1) && left < 1 && right > 1.15 * left,
    `right shoulder ${(right * 100).toFixed(0)}% of its height with no field, left ${(left * 100).toFixed(0)}%${pinned ? ` (the sessile top ${sessile.toFixed(2)} l_c is above the glass's ${glass.toFixed(2)})` : ''}`);
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
  // 6. Pressed (PLAN 29a-11).
  {
    const { rest, pressed } = result;
    // The gap field in l_c: DISH_GAP_METRES at DISH_REST_GAP, over the dish's width, over l_c in plate widths.
    const lcOf = (field) => field * (DISH_GAP_METRES / DISH_REST_GAP) / DISH_METRES / LC;
    const gapRest = lcOf(rest.gMin), gapPressed = lcOf(pressed.gMin);
    /*
      First that the press is there and the drop is the same drop, or the
      line measures nothing: the gap over the ferrofluid is the 0.8 mm asked
      (to 2%, and even across the drop to 1%), the control's the 2 mm rest,
      and the ferrofluid laid is the same (Σc to 1%), since the volume the
      line compares is the drop's own.
    */
    const landed = Math.abs(pressed.gMin / PRESSED - 1) < 0.02 && pressed.gMax / pressed.gMin < 1.01
      && Math.abs(rest.gMin / DISH_REST_GAP - 1) < 0.02 && Math.abs(pressed.sumC / rest.sumC - 1) < 0.01;
    check('line 6\'s press lands: the gap over the drop is 0.8 mm (to 2%), the control\'s 2 mm, the same ferrofluid laid in both (Σc to 1%)',
      landed,
      `gap over the drop ${(pressed.gMin * DISH_GAP_METRES / DISH_REST_GAP * 1000).toFixed(3)}–${(pressed.gMax * DISH_GAP_METRES / DISH_REST_GAP * 1000).toFixed(3)} mm pressed, ${(rest.gMin * DISH_GAP_METRES / DISH_REST_GAP * 1000).toFixed(3)} mm at rest; Σc ${pressed.sumC.toFixed(1)} against ${rest.sumC.toFixed(1)}`);
    /*
      Why this and not the obvious thing. A drop between two glasses is
      incompressible: a glass pressed down on it squeezes it thinner and
      wider and keeps every bit of its volume, V = ∫h dA, and nothing of it
      stands above the glass, z ≤ b at every point (b the live gap). Both
      halves of that are needed and neither is enough alone. Today the solve
      caps h at 0.95 GAP_LC, a constant (gpu/ferroDrop.ts A.more.y: 1.49 l_c,
      the rest gap's), whatever the glass is doing, and throws the excess
      away; pressed to 0.8 mm (0.63 l_c) the volume is therefore exactly
      what it was, and the drop stands 2.4 times through the glass. A build
      that only clamps h to the live gap gets the second half and loses the
      volume over the plateau (a disc of 1.49 l_c cut to 0.63 loses more
      than half of it); one that scales the drawn surface down to fit, which
      looks the same in a picture, loses it too. Only spreading the excess
      to the neighbours (the item's build) keeps both. And the surface the
      display draws is z, not h: packVelDrop adds FILM_H0 l_c a cell past
      full to h, up to 2.1 l_c over a 1.56 l_c gap, so the line reads z as
      the display is handed it, and z must keep min(h + domes, b).

      The API the build adds for it (scripts/lab-entry.ts):
        lab.dropSurface() → { n, h: number[], z: number[] } | null
      the last render's drop, n × n row by row, both in l_c: h the solve's
      height as dropHeight() reads it today, z the third channel packVelDrop
      wrote into the packed flow that render (FerroDrop.read() extended to
      copy it). The live gap the solve reads is the view's (packView's w,
      the squeeze field), the same field this line reads with lab.squeeze().

      mainState: the solve's tallest cell over the pressed gap by more than
      a tenth, which is the solve ignoring the live gap. A build that reads
      the gap and loses the volume is not excused (it is red), nor is one
      that keeps the volume and lets z through the glass.
    */
    const kept = pressed.vol / rest.vol;
    const zOk = pressed.maxZ !== null && rest.maxZ !== null && pressed.maxZ <= gapPressed * 1.005 && rest.maxZ <= gapRest * 1.005;
    line('29a-11', 'a drop pressed to a 0.8 mm gap keeps its volume (∫h dA within 0.5% of the 2 mm rest\'s) and stands nowhere above the glass (z ≤ the live gap, pressed and at rest)',
      landed && Math.abs(kept - 1) < 0.005 && zOk,
      `volume ${(kept * 100).toFixed(2)}% of the rest's; tallest h ${pressed.maxH.toFixed(3)} l_c pressed under a ${gapPressed.toFixed(3)} l_c gap, ${rest.maxH.toFixed(3)} at rest under ${gapRest.toFixed(3)}; tallest z ${pressed.maxZ === null ? 'unread (no lab.dropSurface)' : `${pressed.maxZ.toFixed(3)} pressed, ${rest.maxZ.toFixed(3)} at rest`}`,
      pressed.maxH > 1.1 * gapPressed);
  }


  // 7. The domes the Magnet stands, in the closeup (PLAN 29a-13).
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
    const settings = (relief) => ({ ...lab.look('magnet-garden').settings, macroRelief: relief });
    const Z = 6;
    const cam = { zoom: Z, macroAmount: 1, cx: M.x, cy: M.y };
    const flat = await lab.render(SIZE, settings(0), cam);
    const lit = await lab.render(SIZE, settings(0.7), cam);
    const lum = (px, i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    /*
      Each pixel's place on the plate: the lab draws the plate 1.5 times the
      frame across at 1x (domes.mjs), Z times that here, about the camera's
      centre, rows down. The phase there says which pixels are domes (past
      1.5 full) rather than the flat film between them, which at 6x fills
      the frame too (the check-skeptic's point: a mask of what the flat
      drawing draws black is the whole pool). The mapping is held by the
      flat drawing itself: where the plate says water (under 0.3 full) it
      must draw the lit dye, or the line below fails rather than measuring
      the wrong place. (Not the other way round: the flat drawing paints a
      grey sheen down a dome's sides, the 1x look, so 4 in 10 of the domes'
      pixels are lit in it; measured 98.4% of water lit, 59.7% of domes
      dark, with this mapping the best of 1,400 tried scales, turns, flips
      and offsets.)
    */
    const phaseAt = (x, y) => {
      const u = M.x + ((x + 0.5) / SIZE - 0.5) / (1.5 * Z), v = M.y - ((y + 0.5) / SIZE - 0.5) / (1.5 * Z);
      const i = Math.min(f.n - 1, Math.max(0, Math.floor(u * f.n))), j = Math.min(f.n - 1, Math.max(0, Math.floor(v * f.n)));
      return f.data[i + j * f.n];
    };
    let agree = 0, judged = 0;
    const ls = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const p = phaseAt(x, y), k = (y * SIZE + x) * 4;
      if (p < 0.3) { judged++; if (lum(flat, k) >= 25) agree++; }
      // The brightest channel: the gloss is the dye's colour mirrored, mostly red under a yellow.
      if (p > 1.5) ls.push(Math.max(lit[k], lit[k + 1], lit[k + 2]));
    }
    ls.sort((a, b) => a - b);
    const q = (t) => ls[Math.floor(ls.length * t)] ?? 0;
    return { agree: agree / Math.max(judged, 1), px: ls.length, p10: q(0.1), p50: q(0.5), p90: q(0.9) };
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
  check('the closeup\'s pixels are where the plate says (where the plate is water, the flat drawing draws the lit dye)',
    domes.agree > 0.95, `${(domes.agree * 100).toFixed(1)}% of the water's pixels lit`);
  check('in the closeup the Magnet\'s domes mirror the lit liquid round them, as a camera records a dark gloss, not one black',
    domes.px > 2000 && domes.p50 >= 12 && domes.p50 <= 100,
    `the middle of the domes' light ${domes.p50.toFixed(1)} of 255 over ${domes.px} px of them (past 1.5 full)`);
  check('and that light runs across each dome, its shape, not a flat grey',
    domes.p90 - domes.p10 >= 20,
    `${domes.p10.toFixed(1)} to ${domes.p90.toFixed(1)} from the 10th to the 90th percentile`);
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
