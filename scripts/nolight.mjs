#!/usr/bin/env node
/**
 * Nothing on a plate lit from beneath makes light (PLAN 38h).
 *
 *   npm run nolight      (the lab: any adapter that computes)
 *
 * What the realism audit found (2026-10-30, docs/plan/38-realism-audit.md):
 * six places in the plate shader painted light that a transmission
 * projector cannot throw. The satellite droplets each carried a white dot of
 * a lamp above them; the oil was 8% brighter than the water wherever it lay,
 * at any focus; the gel multiplied the lamp by 1.5 over a floor of 0.10;
 * Glossiness lit the dye from a point above (Lambert, Blinn, Schlick); the
 * dish's glass wall glowed warm; and a grain of 3% was added to the plate
 * every frame. Each now comes from what the light does going through
 * (plateTransmit.ts and plate.ts's oil block): a lens or a steep wall bends
 * light out of the pupil, a filter passes at most all of a band, and a lens
 * gathers light only on a plane past itself.
 *
 * So the claim, case by case, on one lab plate drawn through the real plate
 * shader, each picture against the same plate with the one thing off:
 *
 *   1-4. droplets, Glossiness, the gel and the dish's wall: no pixel
 *        brighter than without it (one level of rounding allowed), and each
 *        still does something (a share of the plate darker by more than 8
 *        levels), so a case that drew nothing cannot pass
 *   5.   the projectors' rims, which move the picture as they spread it: on
 *        a plate of one grey wash, nothing brighter than the lamp through it
 *   6.   oil in focus (Focus at its middle, where Δz is 0): no pixel of the
 *        oil brighter than the water it displaced. The old flat 8% read 8%
 *        of the water's level there
 *   7.   oil out of focus is a lens: at Focus 0.8 some of it brighter than
 *        the water and some darker (the shadowgraph's 1 - Δz·∇²OPL), and at
 *        Focus 0.2 the same pixels the other way, which a flat gain cannot do
 *   8.   no grain: the same plate drawn at two times of the clock is the same
 *        picture, byte for byte
 *
 * Every number asked is printed. Run against main before this change, the
 * droplets read 255-level dots over the water, the oil 8% over it in focus,
 * the gel half again over the lamp, the dish's rim a warm line over the
 * plate and the clock 4 levels of grain between two frames (the PR's body).
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 128, SIZE = 256, SLACK = 1, DARK = 8, DOES = 0.002;
/** Where the oil goes: clear water, away from the dye, so the plate under it is the lamp alone. */
const OIL = { x: 0.72, y: 0.28, r: 0.09 };

const { page, close } = await openLab();
let r;
try {
  r = await page.evaluate(async ({ N, SIZE, OIL }) => {
    await lab.create(N);
    /*
      The grade at 1, a plain transfer. Saturation Boost pushes each channel
      away from the pixel's own grey, so a gel that darkens green and blue
      lifts red after it (55 levels on a cyan pool): that is the picture's
      colour grade, not light the plate makes, and it is asked of neither.
    */
    const base = { lampGround: 1, edgeRelief: 0.6, saturationBoost: 1 };
    const shot = async (over, cam = {}) => Array.from(await lab.render(SIZE, { ...base, ...over }, { time: 3, ...cam }));
    /*
      The projectors' rims first, on the empty plate: spreading the dishes
      moves the picture, so no pixel can be held to its own without them.
      What can be asked is the audit's own measure, that nothing is brighter
      than the lamp through the liquid. The lamp through clear water is 255,
      where a glow would clip and pass, so the plate is a grey wash that
      passes about 60% of it, the same everywhere. And the hot spot is off:
      it multiplies the finished picture by up to 1.31 at its middle, which
      is PLAN 38a's to make a condenser, not this check's.
    */
    lab.dye(0.5, 0.5, 1.2, [0.35, 0.35, 0.35], 0.6);
    lab.flush(); await lab.step(2);
    const out = { empty: await shot({ lampHotspot: 0 }), emptySpread: await shot({ lampHotspot: 0, dishSpread: 1 }) };
    await lab.create(N);
    // Two pools of dye, pushed a little so their edges have slope, and the
    // rest of the plate clear water.
    lab.dye(0.3, 0.62, 0.13, [1.4, 0.3, 0.2], 1.2);
    lab.dye(0.4, 0.35, 0.1, [0.2, 0.7, 1.3], 1.0);
    lab.vel(0.35, 0.5, 0.15, [0.01, -0.006, 0, 0]);
    lab.flush(); await lab.step(40);
    const plain = await shot({});
    out.plain = plain;
    out.droplets = await shot({ microDroplets: 1 });
    out.gloss = await shot({ glossiness: 1 });
    out.gel = await shot({ gelWheel: 1 });
    out.dish = await shot({ dishVignette: 0.9 });
    out.dishOff = plain;
    out.later = await shot({}, { time: 7.31 });
    // The oil, onto the clear water, and one step so the view packs it.
    const s = lab.solver();
    out.waterFocus = await shot({ projectorFocus: 0.5 });
    out.water8 = await shot({ projectorFocus: 0.8 });
    out.water2 = await shot({ projectorFocus: 0.2 });
    s.addMix(OIL.x, OIL.y, OIL.r, { oil: 0.8 });
    await lab.step(1);
    out.oilFocus = await shot({ projectorFocus: 0.5 });
    out.oil8 = await shot({ projectorFocus: 0.8 });
    out.oil2 = await shot({ projectorFocus: 0.2 });
    return out;
  }, { N, SIZE, OIL });
} finally {
  await close();
}

const P = SIZE * SIZE;
/** The most any channel of a passes b, and the share of pixels darker by more than DARK, over the pixels keep() says. */
function compare(a, b, keep = () => true) {
  let over = 0, dark = 0, n = 0;
  for (let i = 0; i < P; i++) {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    if (!keep(x / SIZE, y / SIZE)) continue;
    n++;
    let up = -255, down = 0;
    for (let c = 0; c < 3; c++) { up = Math.max(up, a[4 * i + c] - b[4 * i + c]); down = Math.max(down, b[4 * i + c] - a[4 * i + c]); }
    over = Math.max(over, up);
    if (down > DARK) dark++;
  }
  return { over, dark: dark / Math.max(1, n), n };
}
const pct = (v) => `${(100 * v).toFixed(2)}%`;

for (const [i, key, name, off] of [
  [1, 'droplets', 'the satellite droplets', 'plain'],
  [2, 'gloss', 'Glossiness at 1', 'plain'],
  [3, 'gel', 'the gel at 1', 'plain'],
  [4, 'dish', "the dish's wall", 'dishOff'],
]) {
  const d = compare(r[key], r[off]);
  check(`${i}. ${name}: no pixel brighter than without it (by over ${SLACK}), and over ${pct(DOES)} of the plate darker by ${DARK}+`,
    d.over <= SLACK && d.dark > DOES, `brightest by ${d.over} levels; ${pct(d.dark)} darker`);
}

{
  const top = (p) => { let m = 0; for (let i = 0; i < P; i++) for (let c = 0; c < 3; c++) m = Math.max(m, p[4 * i + c]); return m; };
  const lamp = top(r.empty), spread = top(r.emptySpread);
  // Under 250, or a glow on a lamp at 255 would clip to the lamp and pass.
  check(`5. the projectors' rims: on a plate of one grey wash nothing brighter than the lamp through it (by over ${SLACK}), with room under 255 to see it`,
    lamp < 250 && spread <= lamp + SLACK, `the lamp's brightest ${lamp}; spread apart ${spread}`);
}

// The oil's disc and a ring of water round it, in the picture's rows (row 0 at the top, plate y up).
const inOil = (u, v) => Math.hypot(u - OIL.x, (1 - v) - OIL.y) < OIL.r * 1.3;
{
  const d = compare(r.oilFocus, r.waterFocus, inOil);
  // The old 8% was of the water's own level: the brightest it could add.
  let lvl = 0; for (let i = 0; i < P; i++) { const x = i % SIZE, y = Math.floor(i / SIZE); if (inOil(x / SIZE, y / SIZE)) lvl = Math.max(lvl, r.waterFocus[4 * i + 1]); }
  check(`6. oil in focus brightens nothing (by over ${SLACK} levels) over the water it lies in`,
    d.n > 200 && d.over <= SLACK, `brightest by ${d.over} levels over ${d.n} px (a flat 8% of this water would be ${Math.round(0.08 * lvl)})`);
}
{
  let up8 = 0, down8 = 0, flip = 0, both = 0;
  for (let i = 0; i < P; i++) {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    if (!inOil(x / SIZE, y / SIZE)) continue;
    const g8 = r.oil8[4 * i + 1] - r.water8[4 * i + 1];
    const g2 = r.oil2[4 * i + 1] - r.water2[4 * i + 1];
    if (g8 > 2) up8++;
    if (g8 < -2) down8++;
    if (Math.abs(g8) > 2 && Math.abs(g2) > 2) { both++; if (Math.sign(g8) !== Math.sign(g2)) flip++; }
  }
  check('7. oil out of focus is a lens: brighter and darker in places at Focus 0.8, and the other way at 0.2 (over 90% of those pixels)',
    up8 > 20 && down8 > 20 && both > 20 && flip / both > 0.9, `${up8} px brighter, ${down8} darker at 0.8; ${flip} of ${both} turn over at 0.2`);
}
{
  const d = compare(r.later, r.plain), e = compare(r.plain, r.later);
  check('8. no grain: two times of the clock draw the same plate', d.over <= 0 && e.over <= 0, `the most a channel moved: ${Math.max(d.over, e.over, 0)} levels`);
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
