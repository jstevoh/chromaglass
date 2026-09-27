#!/usr/bin/env node
/**
 * Past the spikes, the magnet pulls a pool's edge out into fingers.
 * Measured on the GPU solver and the plate shader (scripts/lab.mjs).
 *
 *   npm run fingers
 *
 * Reported by the owner: "The ferrofluid magnet still sucks and doesn't make
 * spikes or fingers. It's just a big blob that gets pulled around by the
 * magnet." `npm run spikes` holds the spikes; this holds the fingers
 * (PLAN.md §9i). What the references show (Chemical Bouillon's "Magnetic
 * pattern I", /mnt/project-files/ferrofluid-look/references) is the
 * sunflower: a pool under a magnet whose edge goes out in thin black
 * fingers all round it, with the dish showing between them. Before this, a
 * pool bigger than the spikes' reach (about 0.15 of the plate from a hand's
 * magnet) stayed round past them: on a look with no Labyrinth the magnet's
 * field pushed nothing apart at all, and on Magnet Garden what it pushed
 * out thinned to grey stubs a tenth of the plate long.
 *
 * So, a pool poured bigger than the spikes' reach, the Magnet held close
 * over it the way the tool holds it, six seconds; then the picture the plate
 * draws of it, read on circles round the magnet, 0.06, 0.09, 0.12 and 0.15
 * of the plate outside where the pool's edge was poured (0.12 is seven
 * tenths of the pool's radius; in the references the radial fingers are the
 * outer two fifths of the whole pattern, and this is 0.12 of 0.29). A
 * finger, on a circle, is a run of the picture that is dark (under a fifth
 * of full) where the ferrofluid is (past a fifth full), narrower than 20°;
 * a wider dark run is the pool itself having grown, and counts against it.
 *
 *   1. its edge goes out in fingers all round. On Magnet Garden (the look
 *      the Magnet is for): at least seven fingers on the circles 0.06 and
 *      0.09 out, no wide dark run, and spread round, in at least five of
 *      the twelve 30° sectors on the 0.09 circle. On Classic's settings (no
 *      Labyrinth, Phase Edge 0.35: ferrofluid dropped on any look), at least
 *      four on the 0.06 circle. With no magnet, and under Magnet Garden's
 *      own magnet (held further off, below the spikes' onset), none on any
 *      circle
 *   2. they reach: on the 0.12 circle, at least seven on Magnet Garden and
 *      two on Classic
 *   3. they are drawn black with the dish lit between them: on the 0.09
 *      circle the fingers' mean brightness is under 15 % of full and the
 *      gaps' over a third (a picture that came back black, or a plate drawn
 *      upside down against the field, fails here or in 1)
 *   4. none of it makes or loses ferrofluid
 *
 * Classic is asked for less because it has less: its Phase Edge (0.35, the
 * default) separates about a quarter slower than Magnet Garden's (0.75),
 * and the fingers the push draws out stay a grey film between a fifth and
 * two thirds full, which Classic draws as a pale outline rather than black
 * (PLAN.md §9o). Measured on first run, at 384² in a cloud session: Magnet
 * Garden 12, 9, 9 and 3 fingers on the four circles in 7 sectors, drawn at
 * 8 % against the gaps' 58 %; Classic 6, 4, 3 and 1; main's Magnet Garden
 * 6, 3, 1 and 0 in 3 sectors, main's Classic none.
 *
 * Read on the picture rather than on the field, because the picture is what
 * the owner sees and the field misleads here: a finger's stem runs about
 * half full, two or three cells across, so on the field past half full a
 * finger is a string of short pieces (26 pieces past half full on the
 * first try, only four of them longer than 0.04), which the plate draws as
 * the one black finger it is. An earlier count of every direction holding
 * any ferrofluid past half full read 16 fingers where the picture has
 * about ten, and would have counted a pool grown by a cell with a ragged
 * rim as 68 (the check-skeptic's control); a circle of the picture cannot.
 *
 * The magnet is at the plate's middle so that all four circles fall inside
 * the picture (the lab draws the plate 1.5 times the frame across, the
 * frame showing the middle two thirds; see spikes.mjs). A finger is only
 * counted where the field under it holds ferrofluid, so the dye's own dark
 * patches do not count and a picture flipped against the field loses its
 * fingers.
 *
 * On 384², the grid the app runs on most machines: at 256 the maze's
 * period is at its twelve-cell floor (fluid.ts, MAZE_PERIOD) and the
 * fingers come out fewer and blunt. About forty minutes in a cloud session.
 *
 * Not measured here: the magnet between no spikes and full (a lower Tool
 * Amount, or a Ferrofluid Scale that holds it higher), where the push is
 * ramped in with the spikes (fluid.ts, HAND_PULL); and a maze look's
 * labyrinth far from the hand while the hand is held. PLAN.md §9.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// As spikes.mjs: the Magnet tool in the hand, and Magnet Garden's own.
const HAND = { magnetStrength: 0.9, magnetHeight: 0.15 * 0.9, magnetSeconds: 1 / 60 };
const FAR = { magnetStrength: 0.9, magnetHeight: 0.3 * 0.8, magnetSeconds: 1 / 60 };
const STEPS = 360;
const AT = { x: 0.5, y: 0.5 };
// The pour: 0.9 deep at its middle, falling off as 1 − d² to its rim, so
// past half full out to about 0.165 of the plate: past the spikes' reach.
const POUR = 0.25;
// The phase settings the app runs each look on (LiquidVisualizer: Phase
// Edge as set, else 0.35; the tension 0.45 of Ferrofluid Scale, else of
// 0.4). Classic sets neither, so it runs the lab's own defaults.
const CLASSIC = { ferroLabyrinth: 0, phaseSharp: 0.35, phaseTension: 0.4 * 0.45 };
const GARDEN = { ferroLabyrinth: 0.8, phaseSharp: 0.75, phaseTension: 0.3 * 0.45 };
const S = 420;
const CIRCLES = [0.06, 0.09, 0.12, 0.15];

const { page, close } = await openLab();
try {
  const run = (over, look) => page.evaluate(async ({ over, look, AT, POUR, STEPS, S }) => {
    await lab.create(384);
    const cols = [[0.02, 0.36, 2.0], [2.0, 0.4, 0.48], [0.02, 0.8, 1.05]];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) lab.dye(0.12 + i * 0.25, 0.12 + j * 0.25, 0.16, cols[(i + j) % 3], 1.3);
    lab.flush(); await lab.step(2);
    lab.addPhase(AT.x, AT.y, POUR, 0.9);
    const before = await lab.phase();
    for (let k = 0; k < STEPS; k += 4) await lab.step(4, { phaseDisplace: 1, magnetX: AT.x, magnetY: AT.y, ...over });
    const after = await lab.phase();
    const px = await lab.render(S, lab.look(look).settings, {});
    return { n: after.n, before: Array.from(before.data), after: Array.from(after.data), px: Array.from(px) };
  }, { over, look, AT, POUR, STEPS, S });

  // The fingers on a circle `off` outside the poured edge.
  const circle = ({ n, after: d, px }, edge0, off) => {
    const r = edge0 + off, M = 1440;
    const at = [];
    for (let i = 0; i < M; i++) {
      const a = i / M * 2 * Math.PI, u = AT.x + r * Math.cos(a), v = AT.y + r * Math.sin(a);
      // The plate's (u, v), y up, to the picture's pixel, rows down.
      const x = Math.floor((0.5 + (u - 0.5) * 1.5) * S), y = Math.floor((0.5 - (v - 0.5) * 1.5) * S);
      if (x < 0 || y < 0 || x >= S || y >= S) throw new Error(`circle ${off} leaves the picture`);
      const k = (x + y * S) * 4, L = (px[k] + px[k + 1] + px[k + 2]) / 3 / 255;
      const c = d[Math.floor(u * n) + Math.floor(v * n) * n];
      at.push({ dark: L < 0.2 && c > 0.2, L });
    }
    // Start on a lit sample, so no run is split across the start.
    const start = at.findIndex(q => !q.dark);
    const fingers = [];
    let wide = 0, len = 0, litL = 0, lit = 0, darkL = 0, dark = 0;
    for (let k = 0; start >= 0 && k <= M; k++) {
      const i = (start + k) % M, q = at[i];
      if (k < M && q.dark) { len++; darkL += q.L; dark++; continue; }
      if (len > 0) { if (len > M * 20 / 360) wide++; else fingers.push(i - len / 2); }
      len = 0;
      if (k < M) { litL += q.L; lit++; }
    }
    if (start < 0) wide = 1;
    const sectors = new Set(fingers.map(i => Math.floor(((i + M) % M) / (M / 12)))).size;
    return { fingers: fingers.length, wide, sectors, dark: dark ? darkL / dark : 1, lit: lit ? litL / lit : 0 };
  };

  const cases = [
    ['Classic, no magnet', { ...CLASSIC, magnetStrength: 0 }, 'classic'],
    ['Classic, the hand\'s magnet', { ...CLASSIC, ...HAND }, 'classic'],
    ['Magnet Garden, the hand\'s magnet', { ...GARDEN, ...HAND }, 'magnet-garden'],
    ['Magnet Garden, its own magnet', { ...GARDEN, ...FAR }, 'magnet-garden'],
  ];
  const got = {};
  for (const [name, over, look] of cases) {
    const t0 = Date.now();
    const f = await run(over, look);
    let area0 = 0, mass0 = 0, mass = 0;
    for (let i = 0; i < f.n * f.n; i++) { if (f.before[i] > 0.5) area0++; mass0 += f.before[i]; mass += f.after[i]; }
    // Where the poured pool's edge was: the radius of a disc of its area
    // past half full.
    const edge0 = Math.sqrt(area0 / Math.PI) / f.n;
    const on = CIRCLES.map(off => circle(f, edge0, off));
    got[name] = { edge0, on, mass, mass0 };
    console.log(`  ${name}: fingers ${on.map((c, i) => `${c.fingers}${c.wide ? ` (+${c.wide} wide)` : ''} at +${CIRCLES[i]}`).join(', ')} past the poured edge (${edge0.toFixed(3)}); ` +
      `${on[1].sectors} of 12 sectors; drawn at ${(on[1].dark * 100).toFixed(0)}% against the gaps' ${(on[1].lit * 100).toFixed(0)}%; mass ${mass0.toFixed(0)} → ${mass.toFixed(0)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  console.log('');
  const none = got['Classic, no magnet'], own = got['Magnet Garden, its own magnet'];
  const held = [got['Classic, the hand\'s magnet'], got['Magnet Garden, the hand\'s magnet']];
  const [classic, garden] = held;
  const counts = (m) => m.on.map(c => c.fingers + c.wide).join('/');
  check('held close, the magnet pulls the pool\'s edge out in fingers all round, on Magnet Garden and on Classic',
    garden.on.slice(0, 2).every(c => c.fingers >= 7 && c.wide === 0) && garden.on[1].sectors >= 5 &&
      classic.on[0].fingers >= 4 && classic.on[0].wide === 0 &&
      [none, own].every(m => m.on.every(c => c.fingers + c.wide === 0)),
    `Magnet Garden ${counts(garden)} on the circles 0.06/0.09/0.12/0.15 out, in ${garden.on[1].sectors} sectors; Classic ${counts(classic)}; ${counts(none)} with no magnet, ${counts(own)} under Magnet Garden's own`);
  check('and they reach out',
    garden.on[2].fingers >= 7 && classic.on[2].fingers >= 2,
    `${garden.on[2].fingers} on Magnet Garden and ${classic.on[2].fingers} on Classic 0.12 past the poured edge`);
  check('drawn black, with the dish lit between them',
    held.every(h => h.on[1].dark < 0.15 && h.on[1].lit > 1 / 3),
    held.map(h => `fingers ${(h.on[1].dark * 100).toFixed(0)}%, gaps ${(h.on[1].lit * 100).toFixed(0)}%`).join('; '));
  const drift = Math.max(...Object.values(got).map(m => Math.abs(m.mass / m.mass0 - 1)));
  check('and none is made or lost', drift < 0.005, `worst ${(drift * 100).toFixed(3)}%`);
} finally {
  await close();
}
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
