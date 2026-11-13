#!/usr/bin/env node
/**
 * The closeup shows the plate the solver made, and nothing drawn over it moves
 * or lights it.
 *
 *   npm run stillcloseup      (the lab: any adapter that computes)
 *
 * What was reported (the owner, 2026-11-13): "the drops in macro still have
 * jagged edges", and, the same day, a review asked of the whole picture: is
 * what it shows the physics, or a drawing of it. In the closeup four things
 * were drawings (PLAN 38u-1 to 38u-3):
 *
 *   - Edge Detail read the plate through two octaves of value noise that
 *     drifted on the clock and swelled on the beat, so an edge that surface
 *     tension holds smooth was ragged, and crawled while the plate was still
 *     (by a tenth of a cell at 6x: nothing on a soft pool, 0.05%, and plain
 *     on an edge, so line 1's plate is hard-edged discs);
 *   - Depth / Focus, besides the camera's depth of field, laid a paper's
 *     fibre on the ground, threw the dye's shadow down and to the right onto
 *     it as a lamp above the plate would, and brightened thick dye over thin;
 *   - the bubble's film swayed its colour on a sine of the time.
 *
 * Asked here of the feature, not of those four lines of shader: whatever is
 * drawn, a closeup must hold these.
 *
 *   1. A still plate is a still picture. The same plate, not stepped, drawn
 *      at two times ten seconds apart, differs by under STILL of the frame's
 *      mean, on the defaults and on the closeup looks that set no clocked
 *      device (Macro Bead, Cell Bloom). Lacing Run is left out by name: its
 *      Macro Lacing is still a drawn noise on the clock (PLAN 38u-9), and it
 *      is printed, not judged, so the number is on record until that goes.
 *      1c, the control: the same plate stirred and stepped differs by over
 *      CONTROL times STILL, so the measure sees motion when there is some.
 *   2. A still bubble keeps its colours. A pocket of air in dye at full
 *      Iridescence, drawn at three times four seconds apart (the sway's
 *      period was 15.7 s, so one pair is always apart), differs by under
 *      STILL inside the pocket. 2c: the pocket is in the picture (it differs
 *      from the same frame with the bubbles off by over CONTROL times STILL).
 *   3. No lamp above the plate. Round a round pool on the lit ground, the
 *      band just outside its edge is as bright on one side as on the other:
 *      the mean of opposite quarters along each diagonal differ by under
 *      KEY. 3c, the control: a second pool laid in one quarter reads over
 *      KEY_CONTROL times KEY, so a shadow there would be seen.
 *   4. Depth / Focus is the camera's focus and nothing else. Where the
 *      camera is in focus (the middle of the frame, inside FOCUS_R of its
 *      height) the dial at 1 and at 0 draw the same picture to within STILL.
 *      4c: outside SOFT_R the two differ by over CONTROL times STILL, so the
 *      dial is live and the middle is not equal because nothing is.
 *
 * Measured, the lab on software WebGPU, before (main, 2026-11-13) and after:
 *   1   0.381% / 0.117% / 0.366% / 0.276%  ->  0.000% on all four
 *   2   3.412%  ->  0.000%          3   19.402%  ->  0.003%
 *   4   27.052% ->  0.000%          (Lacing Run, owed: 3.574%)
 * The controls read 11.4% (1c), 53.5% (2c), 47.9% (3c) and 12.0% (4c).
 * STILL is 0.02%: two draws of one plate come back byte for byte the same
 * (the dither is the pixel's, not the clock's), and the least the warp moved
 * was six times the bar. CONTROL times STILL is 1%.
 *
 * Shortcuts, named. Line 1 holds the lab's clock and the solver, not the
 * app's loop: a clock that reaches the plate by a uniform the lab does not
 * set (the beat's phase, the cell clock) is not asked; `steadycam` and
 * `cellride` hold those. Line 3 asks of one pool at the plate's middle, where
 * the lamp's own fall-off is the same on every side.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 256, SIZE = 384, ZOOM = 6;
const STILL = 0.0002, CONTROL = 50, KEY = 0.02, KEY_CONTROL = 5, FOCUS_R = 0.25, SOFT_R = 0.42;
const LOOKS = ['macro-bead', 'cell-bloom'];
/** Looks whose closeup still carries a drawn clock, by the plan item that ends it. */
const OWED = { 'lace-run': '38u-9' };

const { page, close } = await openLab();
let out;
try {
  out = await page.evaluate(async ({ N, SIZE, ZOOM, LOOKS, OWED, FOCUS_R, SOFT_R }) => {
    const P = SIZE * SIZE;
    const shot = async (set, cam) => {
      const p = new Uint8ClampedArray(await lab.render(SIZE, set, { zoom: ZOOM, macroAmount: 1, cx: 0.5, cy: 0.5, ...cam }));
      if (p.length !== P * 4) throw new Error(`stillcloseup: a picture came back ${p.length} bytes, not ${P * 4}`);
      return p;
    };
    // Mean |a − b| over a mask, as a share of a's mean there, and a's mean (0..255).
    const share = (a, b, inMask = () => true) => {
      let d = 0, m = 0, n = 0;
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        if (!inMask((x + 0.5) / SIZE - 0.5, (y + 0.5) / SIZE - 0.5)) continue;
        const k = 4 * (y * SIZE + x);
        for (let c = 0; c < 3; c++) { d += Math.abs(a[k + c] - b[k + c]); m += a[k + c]; }
        n += 3;
      }
      return { share: d / Math.max(m, 1e-9), mean: m / Math.max(n, 1), n: n / 3 };
    };
    const known = lab.lookIds();
    const missing = [...LOOKS, ...Object.keys(OWED)].filter((id) => !known.includes(id));
    if (missing.length) throw new Error(`stillcloseup: no look ${missing.join(', ')}`);

    // ── Small hard discs: lines 1 and 4 ───────────────────────────────
    // Something sharp everywhere in the frame. A warp of a tenth of a cell
    // moves a smooth pool's picture by nothing that can be measured (0.05% on
    // a stirred plate of soft pools, with the warp on); it shows on an edge,
    // which is where the owner saw it. The discs also give a defocus
    // something to soften, and a middle that is not equal for being empty.
    await lab.create(N);
    let s = 4242; const r = () => (s = s * 16807 % 2147483647) / 2147483647;
    const span = 1 / (1.5 * ZOOM);                // the frame, plate widths
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      lab.dyeDisc(0.5 + i * span / 8, 0.5 + j * span / 8, span / 40, [0.2 + 1.2 * r(), 0.2 + 1.2 * r(), 0.2 + 1.2 * r()], 1.5);
    }
    lab.flush(); await lab.step(2);
    const cases = [{ name: 'defaults', set: {} }, { name: 'defaults on the lamp', set: { lampGround: 1 } },
      ...LOOKS.map((id) => ({ name: id, set: lab.look(id).settings })),
      ...Object.keys(OWED).map((id) => ({ name: id, set: lab.look(id).settings, owed: OWED[id] }))];
    const still = [];
    let first = null;
    for (const c of cases) {
      const set = { ...c.set, macroMode: true };
      const a = await shot(set, { time: 3 }), b = await shot(set, { time: 13 });
      if (!first) first = a;
      still.push({ name: c.name, owed: c.owed ?? null, ...share(a, b) });
    }
    // Line 4, on the lamp: the dial at 1 and at 0, in focus and out of it.
    const lit = { macroMode: true, lampGround: 1 };
    const sharp = await shot({ ...lit, macroDepth: 0 }, { time: 3 });
    const deep = await shot({ ...lit, macroDepth: 1 }, { time: 3 });
    const focus = share(sharp, deep, (x, y) => Math.hypot(x, y) < FOCUS_R);
    const soft = share(sharp, deep, (x, y) => Math.hypot(x, y) > SOFT_R);
    // 1c: the same plate, stirred and stepped.
    for (let i = 0; i < 6; i++) lab.vel(0.47 + 0.06 * r(), 0.47 + 0.06 * r(), 0.08, [(r() - 0.5) * 0.2, (r() - 0.5) * 0.2, 0, 0]);
    lab.flush(); await lab.step(40);
    const moved = share(first, await shot({ macroMode: true }, { time: 3 }));

    // ── A pocket of air in dye: line 2 ────────────────────────────────
    await lab.create(N);
    lab.dyeDisc(0.5, 0.5, 0.33, [0.2, 1.3, 0.7], 1.3);
    lab.flush(); await lab.step(10);
    const R = 10 / N;                             // the pocket, plate widths
    lab.solver().setBubbles(new Float32Array([0.5, 0.5, R, 1]), 1, 0.25, new Float32Array([0, 0, 1.0, 0]));
    await lab.step(2, { bubbleClear: 1 });
    const air = { macroMode: true, iridescence: 1 };
    const inPocket = (x, y) => Math.hypot(x, y) < R * 1.5 * ZOOM;   // the frame shows 1/(1.5 zoom) of the plate
    const t = [];
    for (const time of [3, 7, 11]) t.push(await shot(air, { time, bubbles: 0.8 }));
    const bare = await shot(air, { time: 3, bubbles: 0 });
    const sway = Math.max(share(t[0], t[1], inPocket).share, share(t[1], t[2], inPocket).share, share(t[0], t[2], inPocket).share);
    const pocket = share(t[0], bare, inPocket);

    // ── One round pool on the lit ground: line 3 ──────────────────────
    const ring = async (second) => {
      await lab.create(N);
      const PR = 0.03;                            // the pool, plate widths: 0.27 of the frame at 6x
      lab.dyeDisc(0.5, 0.5, PR, [1.4, 1.0, 0.3], 1.5);
      // The control's second pool, in the quarter toward +x, +y of the plate.
      if (second) lab.dyeDisc(0.5 + PR * 0.85, 0.5 + PR * 0.85, PR * 0.35, [1.4, 1.0, 0.3], 1.5);
      lab.flush(); await lab.step(4);
      const p = await shot({ macroMode: true, lampGround: 1 }, { time: 3 });
      const rf = PR * 1.5 * ZOOM;                 // the pool's radius, frame heights
      // Four quarters of the band from 1.04 to 1.22 radii, centred on the diagonals.
      const q = [0, 0, 0, 0], n = [0, 0, 0, 0];
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const dx = (x + 0.5) / SIZE - 0.5, dy = (y + 0.5) / SIZE - 0.5, d = Math.hypot(dx, dy);
        if (d < rf * 1.04 || d > rf * 1.22) continue;
        const i = (dx > 0 ? 1 : 0) + (dy > 0 ? 2 : 0), k = 4 * (y * SIZE + x);
        q[i] += 0.2126 * p[k] + 0.7152 * p[k + 1] + 0.0722 * p[k + 2]; n[i]++;
      }
      const m = q.map((v, i) => v / Math.max(n[i], 1));
      const mean = (m[0] + m[1] + m[2] + m[3]) / 4;
      // Opposite quarters: 0 against 3, 1 against 2.
      return { key: Math.max(Math.abs(m[0] - m[3]), Math.abs(m[1] - m[2])) / Math.max(mean, 1e-9), mean, n: Math.min(...n) };
    };
    const key = await ring(false), keyControl = await ring(true);
    return { adapter: lab.adapter(), still, moved, focus, soft, sway, pocket, key, keyControl };
  }, { N, SIZE, ZOOM, LOOKS, OWED, FOCUS_R, SOFT_R });
} finally {
  await close();
}

const pc = (v) => `${(100 * v).toFixed(3)}%`;
console.log(`\nstillcloseup: ${JSON.stringify(out.adapter)}\n`);
for (const s of out.still) {
  if (s.owed) { console.log(` owed ${s.name}: ${pc(s.share)} of the frame moved with the clock alone (PLAN ${s.owed})`); continue; }
  check(`1. a still plate is a still picture: ${s.name}`, s.mean > 8 && s.share <= STILL, `${pc(s.share)} of the frame's mean changed in 10 s of the clock (≤ ${pc(STILL)}; mean ${s.mean.toFixed(1)})`);
}
check('1c. the measure sees a plate that moved', out.moved.share > CONTROL * STILL, `${pc(out.moved.share)} after a stir and 40 steps (> ${pc(CONTROL * STILL)})`);
check('2. a still bubble keeps its colours', out.sway <= STILL, `${pc(out.sway)} inside the pocket, the worst of three times (≤ ${pc(STILL)})`);
check('2c. the pocket is in the picture', out.pocket.share > CONTROL * STILL && out.pocket.n > 200, `${pc(out.pocket.share)} against the same frame with no bubbles, over ${out.pocket.n} px (> ${pc(CONTROL * STILL)})`);
check('3. no lamp above the plate: the ground round a pool is as bright on every side', out.key.mean > 8 && out.key.n > 200 && out.key.key <= KEY, `opposite quarters differ by ${pc(out.key.key)} (≤ ${pc(KEY)}; mean ${out.key.mean.toFixed(1)}, ${out.key.n} px a quarter)`);
check('3c. a dark quarter would be seen', out.keyControl.key > KEY_CONTROL * KEY, `${pc(out.keyControl.key)} with a second pool in one quarter (> ${pc(KEY_CONTROL * KEY)})`);
check('4. Depth / Focus changes nothing where the camera is in focus', out.focus.mean > 8 && out.focus.share <= STILL, `${pc(out.focus.share)} of the middle's mean between the dial at 0 and at 1 (≤ ${pc(STILL)}; ${out.focus.n} px)`);
check('4c. and softens the surround', out.soft.share > CONTROL * STILL, `${pc(out.soft.share)} outside ${SOFT_R} of the frame (> ${pc(CONTROL * STILL)})`);

const bad = checks.filter((c) => !c.ok);
console.log(`\n${bad.length ? `${bad.length} FAILED` : `all ${checks.length} ok`}`);
process.exit(bad.length ? 1 : 0);
