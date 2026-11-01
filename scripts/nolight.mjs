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
 *        levels; for the dish, its rim a dark line against the plate just
 *        inside), so a case that drew nothing cannot pass
 *   5.   the projectors' rims, which move the picture as they spread it:
 *        nothing brighter than the lamp through the wash, and a line drawn
 *
 * All on a grey wash under 250, so added light cannot clip away. Not asked:
 * the camera's view of the droplets, where a ball focused past gathers the
 * light its rim loses into its middle (brighter there, and rightly); the
 * Saturation Boost grade, which can lift a band past its input (PLAN 38h-2).
 *   6.   oil in focus (Focus at its middle, where Δz is 0): no pixel of the
 *        oil brighter than the water it displaced. The old flat 8% read 8%
 *        of the water's level there
 *   7.   oil out of focus is a lens: at Focus 0.8 some of it brighter than
 *        the water and some darker (the shadowgraph's 1 - Δz·∇²OPL), and at
 *        Focus 0.2 the same pixels the other way, which a flat gain cannot do
 *   8.   no grain: the same plate drawn at two times of the clock is the same
 *        picture, byte for byte
 *
 * And the light at the edges (PLAN 38h-2), which was a lamp above the glass:
 *
 *   9-10. the oil drops, clear and dyed, on the lamp through the wash: no
 *        pixel brighter than the wash without them (the rings' rim glowed
 *        15% of the plate; a dyed drop added its colour as light on the lamp
 *        ground too), and their band darker; the clear ones' rims also to
 *        the camera, where the glow was not under the projector's band
 *   11.  the camera's dye rims and its line between two dyes, where the dye
 *        is light (Lamp Ground 0): nothing brighter than with both off (the
 *        rim was lit on the lamp's side, the line added a quarter of white)
 *   12.  where the two lamps stand draws nothing: the plate, the camera's
 *        view, the closeup's relief and the camera's bubbles, the same with
 *        both lamps moved to opposite corners and both to one corner; the relief and the bubbles
 *        each shown to draw something, so a view that drew nothing cannot pass
 *
 * Main before 38h-2 read 8/12 on these (lines 9 to 12 red: the drops 2 and
 * 91 levels over, 25 on the clear drops' rims to the camera, the camera's
 * edges 206, the lamps' moves 232 levels on the camera's view, 145 on the
 * closeup, 138 on the bubbles).
 *
 * Every number asked is printed. Run against main before 38h it
 * read 0/8: the droplets' dots, the oil's 8%, the gel's 1.5, Glossiness's
 * sheen, the dish's and the rims' glow and the grain each over the plate
 * (the PR's body has the numbers). A branch with the dish's, the rims' and
 * the oil's glows put back read 4/8, those red.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 128, SIZE = 256, SLACK = 1, DARK = 8, DOES = 0.002;
/** Where the oil goes: the wash, away from the pools, so the plate under it is the lamp through the wash alone. */
const OIL = { x: 0.72, y: 0.28, r: 0.09 };

const { page, close } = await openLab();
/** Where the lamps stand for line 12: the middle, and opposite corners. */
/*
  Where the lamps stand for line 12: the middle, then opposite corners, then
  both in one corner. Opposite corners alone are point-mirrored, so a term
  lit from above that was linear in the lamps' directions and weighted alike
  would cancel there (the review of this check); in one corner it cannot.
*/
const LAMPS = [{ x: 0.5, y: 0.5, x2: 0.5, y2: 0.5 }, { x: 0.1, y: 0.9, x2: 0.9, y2: 0.1 }, { x: 0.1, y: 0.9, x2: 0.1, y2: 0.9 }];
/*
  The camera's leg of line 9: three round beads on the middle row (so the
  plate's y, up or down, does not matter), seen in the closeup (Macro 1,
  where the drops are the camera's), and only the ring 0.8 to 1.1 of each
  radius read, where the old glow was (25 levels over on main; from 0.9 out
  it read 0, the camera's contact line darkening it). A round drop is
  rightly brighter inside its rim, a ball gathering the light behind it
  toward a camera focused past it: 1 + 0.3 (1 - r)^2, 1.012 at 0.8 of the
  radius. So the bar there is that gain of the wash and a level each side
  for rounding (FOCUS_EDGE): the branch reads 3 of its 4. On the plate the old ring's glow sat under the
  projector's black band and showed one pixel 2 levels over; to the camera,
  unmasked, it read up to 64.
*/
const CAM_BEADS = [[0.3, 3], [0.55, 5], [0.75, 2.5]];
/** A round drop's own brightening at 0.8 of its radius, to the camera (the beads' block, `focus`). */
const FOCUS_EDGE = 0.3 * 0.2 * 0.2;
let r, r2;
try {
  r = await page.evaluate(async ({ N, SIZE, OIL, DARK }) => {
    await lab.create(N);
    /*
      The grade at 1, a plain transfer. Saturation Boost pushes each channel
      away from the pixel's own grey, so a gel that darkens green and blue
      lifts red after it (55 levels on a cyan pool): that is the picture's
      colour grade, not light the plate makes, and it is asked of neither.
    */
    const base = { lampGround: 1, edgeRelief: 0.6, saturationBoost: 1, lampHotspot: 0 };
    const shot = async (over, cam = {}) => Array.from(await lab.render(SIZE, { ...base, ...over }, { time: 3, ...cam }));
    /*
      The plate under everything is a grey wash that passes about 60% of the
      lamp, the same everywhere. The lamp through clear water is 255, and
      light added there clips to 255 and passes unseen: on clear water the
      old Glossiness read 2 levels over and the dish's glow 24 of its 72 (the
      review of this check). And the hot spot is off: it multiplies the
      finished picture by up to 1.31 at its middle, clipping the lamp itself,
      which is PLAN 38a's to make a condenser, not this check's.

      The projectors' rims are drawn on the wash alone: spreading the dishes
      moves the picture, so no pixel can be held to its own without them.
      What can be asked is the audit's own measure, that nothing is brighter
      than the lamp through the liquid.
    */
    lab.dye(0.5, 0.5, 1.2, [0.35, 0.35, 0.35], 0.6);
    lab.flush(); await lab.step(2);
    const out = { empty: await shot({}), emptySpread: await shot({ dishSpread: 1 }) };
    // Two pools of dye over the wash, pushed a little so their edges have slope.
    lab.dye(0.3, 0.62, 0.13, [1.4, 0.3, 0.2], 1.2);
    lab.dye(0.4, 0.35, 0.1, [0.2, 0.7, 1.3], 1.0);
    lab.vel(0.35, 0.5, 0.15, [0.01, -0.006, 0, 0]);
    lab.flush(); await lab.step(40);
    const plain = await shot({});
    out.plain = plain;
    /*
      The droplets at 768 px, compared in the page: a droplet is a fifth to a
      third of a cell across, under a pixel at 256, and drawn antialiased to
      the pixel its ring there is a faint smudge no case could see. At 768
      (about a pixel and a half to four across) the ring is resolved.
    */
    {
      const big = async (over) => lab.render(768, { ...base, ...over }, { time: 3 });
      const a = await big({ microDroplets: 1 }), b = await big({});
      let over = 0, dark = 0;
      for (let i = 0; i < a.length; i += 4) {
        let up = -255, down = 0;
        for (let c = 0; c < 3; c++) { up = Math.max(up, a[i + c] - b[i + c]); down = Math.max(down, b[i + c] - a[i + c]); }
        over = Math.max(over, up); if (down > DARK) dark++;
      }
      out.dropletsBig = { over, dark: dark / (a.length / 4) };
    }
    out.gloss = await shot({ glossiness: 1 });
    out.gel = await shot({ gelWheel: 1 });
    out.dish = await shot({ dishVignette: 1 });
    out.dishOff = plain;
    out.later = await shot({}, { time: 7.31 });
    // The oil, onto the wash away from the pools, and one step so the view packs it.
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
  }, { N, SIZE, OIL, DARK });
  r2 = await page.evaluate(async ({ N, SIZE, LAMPS, CAM_BEADS }) => {
    await lab.create(N);
    const base = { lampGround: 1, edgeRelief: 0.6, saturationBoost: 1, lampHotspot: 0 };
    const shot = async (over, cam = {}) => Array.from(await lab.render(SIZE, { ...base, ...over }, { time: 3, ...cam }));
    lab.dye(0.5, 0.5, 1.2, [0.35, 0.35, 0.35], 0.6);
    lab.flush(); await lab.step(2);
    /*
      The oil drops on the lamp through the wash: a lens over a level wash
      shows the same wash, so any pixel brighter than the wash without them
      is light the drops made. Three round ones of 2.5 to 5 cells (the rings
      the bead field draws), and the same three as dyed drops, the mask as
      the field rasters it (npm run droplens draws it the same way).
    */
    const beads = [{ x: 0.3 * N, y: 0.5 * N, r: 3 }, { x: 0.6 * N, y: 0.4 * N, r: 5 }, { x: 0.68 * N, y: 0.7 * N, r: 2.5 }];
    const ringMask = new lab.BeadField(N);
    for (const b of beads) ringMask.beads.push({ age: 5, seed: 0.5, ...b });
    ringMask.dirty = true;
    const px = new Uint8ClampedArray(SIZE * 2 * SIZE * 4);
    lab.rasterDrops(beads.map((b) => ({ age: 5, seed: 0.5, color: [1, 0.48, 0], ...b })), N, SIZE, px, new Float32Array(SIZE * SIZE), new Int32Array(SIZE * SIZE), 1);
    const dropMask = new OffscreenCanvas(SIZE * 2, SIZE);
    dropMask.getContext('2d').putImageData(new ImageData(px, SIZE * 2, SIZE), 0, 0);
    const camMask = new lab.BeadField(N);
    for (const [x, r] of CAM_BEADS) camMask.beads.push({ age: 5, seed: 0.5, x: x * N, y: 0.5 * N, r });
    camMask.dirty = true;
    const out = {
      camRings: await shot({ beads: 0.8 }, { macroAmount: 1, beadMask: camMask }),
      camRingsOff: await shot({ beads: 0 }, { macroAmount: 1 }),
      beadsOff: await shot({ beads: 0 }),
      rings: await shot({ beads: 0.8 }, { beadMask: ringMask }),
      drops: await shot({ beads: 0.8, beadDrops: 1 }, { beadMask: dropMask }),
    };
    // The two pools of the first plate, and a row of bubbles across them.
    lab.dye(0.3, 0.62, 0.13, [1.4, 0.3, 0.2], 1.2);
    lab.dye(0.4, 0.35, 0.1, [0.2, 0.7, 1.3], 1.0);
    lab.vel(0.35, 0.5, 0.15, [0.01, -0.006, 0, 0]);
    lab.flush(); await lab.step(40);
    const bub = [[0.3, 0.6, 5], [0.42, 0.4, 8], [0.6, 0.55, 4]];
    lab.solver().setBubbles(new Float32Array(bub.flatMap(([u, v, c]) => [u, v, c / N, 1])), bub.length, 0.25,
      new Float32Array(bub.flatMap((_, i) => [0, 0, ((i + 0.5) / bub.length) * Math.PI * 2 * 0.999, 0])));
    await lab.step(2, { bubbleClear: 1 });
    /*
      The camera's rims and lines, where the dye is light (Lamp Ground 0, a
      black ground): on the lamp ground the dye's own colour is not what the
      plate shows, so light added to it there would pass unseen. Glossiness
      at 1 steepens the relief four times, so the rims have slope to show.
    */
    const dyeLight = { lampGround: 0, glossiness: 1 };
    const cam = { macroAmount: 0.02 };
    out.camEdges = await shot({ ...dyeLight, edgeRelief: 1, boundaryContrast: 1 }, cam);
    out.camFlat = await shot({ ...dyeLight, edgeRelief: 0, boundaryContrast: 0 }, cam);
    /*
      Where the lamps stand. Both on (Second Lamp 1), Edge Relief, the line,
      Light Play and the closeup's relief up, the hot spot off (it is the
      lamp lever's, in stage coordinates, and never followed the lamp): the
      same plate with the two lamps moved to opposite corners. Light from
      beneath comes up the axis whatever the bulb's place, so the picture is
      the same; light from above lit the sides facing the lamp. The cells
      on (Macro Cells 1): the closeup's relief is their menisci and the
      field's own slope, and on this plate the field alone is too gentle
      for the camera's cone to lose any light.
    */
    const lit = { secondLamp: 1, edgeRelief: 1, boundaryContrast: 1, lightPlay: 1, macroRelief: 1, macroCells: 1 };
    const views = {
      plate: { macroAmount: 0 },
      camera: { macroAmount: 0.02 },
      closeup: { zoom: 3, macroAmount: 1, cx: 0.35, cy: 0.5 },
      bubbles: { zoom: 2, macroAmount: 1, cx: 0.42, cy: 0.5, bubbles: 0.8 },
    };
    out.moved = {};
    for (const [name, v] of Object.entries(views)) {
      out.moved[name] = [];
      for (const lamp of LAMPS) out.moved[name].push(await shot(lit, { ...v, lamp }));
    }
    // That the closeup's relief and the camera's bubbles draw something at all.
    out.reliefOff = await shot({ ...lit, macroRelief: 0 }, { ...views.closeup, lamp: LAMPS[0] });
    out.bubblesOff = await shot(lit, { ...views.bubbles, bubbles: 0, lamp: LAMPS[0] });
    return out;
  }, { N, SIZE, LAMPS, CAM_BEADS });
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

/*
  Glossiness's old law added almost nothing to a projected plate (its sheen
  was 0.04 x 0.12 of white, half a level): what it did was light the dye from
  a lamp above, Lambert, so even a flat pool darkened by its distance from
  the lamp. So line 2 asks as well that the wash where it lies level, a
  corner of the plate well away from the pools and their stir, is not moved
  at all: the relief law has no slope there to bend light with. (Where the
  picture merely looks flat the surface may still slope gently, and four
  times that slope is a real loss, so the corner is chosen by where the
  liquid is level, not by the picture.)
*/
function levelMoved(a, b) {
  let most = 0, n = 0;
  for (let i = 0; i < P; i++) {
    const u = (i % SIZE + 0.5) / SIZE, v = 1 - (Math.floor(i / SIZE) + 0.5) / SIZE;
    if (u < 0.75 || u > 0.95 || v < 0.65 || v > 0.92) continue;
    n++;
    for (let c = 0; c < 3; c++) most = Math.max(most, Math.abs(a[4 * i + c] - b[4 * i + c]));
  }
  return { most, n };
}
const top = (p) => { let m = 0; for (let i = 0; i < P; i++) for (let c = 0; c < 3; c++) m = Math.max(m, p[4 * i + c]); return m; };
const lamp = top(r.empty);
{
  const d = r.dropletsBig;
  check(`1. the satellite droplets (at 768 px): no pixel brighter than without them (by over ${SLACK}), and over ${pct(DOES)} of the plate darker by ${DARK}+`,
    lamp < 250 && d.over <= SLACK && d.dark > DOES, `brightest by ${d.over} levels; ${pct(d.dark)} darker; the plate's brightest ${lamp}`);
}
for (const [i, key, name, off] of [
  [2, 'gloss', 'Glossiness at 1', 'plain'],
  [3, 'gel', 'the gel at 1', 'plain'],
]) {
  const d = compare(r[key], r[off]);
  const f = key === 'gloss' ? levelMoved(r[key], r[off]) : null;
  check(`${i}. ${name}: no pixel brighter than without it (by over ${SLACK}), and over ${pct(DOES)} of the plate darker by ${DARK}+${f ? `, the level wash not moved (by over ${SLACK})` : ''}`,
    lamp < 250 && d.over <= SLACK && d.dark > DOES && (!f || (f.n > 0.02 * P && f.most <= SLACK)),
    `brightest by ${d.over} levels; ${pct(d.dark)} darker; the plate's brightest ${lamp}${f ? `; the level wash (${pct(f.n / P)}) moved by at most ${f.most}` : ''}`);
}
{
  /*
    The dish's own "darker" is mostly its vignette and the black beyond it,
    so what says the wall is drawn is read at the wall: Dish Vignette 1 puts
    the rim at 0.98 of the half-width (plate.ts, the dish block), the wall's
    line peaking past 0.96, where the vignette's edge has hardly begun. The
    band there against a band just inside it: under 0.6 of it is a dark
    line; the vignette's edge alone leaves about 0.85, a glow over 1.
  */
  const d = compare(r.dish, r.dishOff);
  const band = (lo, hi) => { let t = 0, n = 0; for (let i = 0; i < P; i++) { const dr = Math.hypot((i % SIZE + 0.5) / SIZE - 0.5, (Math.floor(i / SIZE) + 0.5) / SIZE - 0.5) / 0.5; if (dr >= lo && dr < hi) { t += r.dish[4 * i + 1]; n++; } } return t / Math.max(1, n); };
  const wall = band(0.962, 0.975), inner = band(0.90, 0.92);
  check(`4. the dish's wall: no pixel brighter than without it (by over ${SLACK}), and at the rim a dark line (under 0.6 of the plate just inside)`,
    lamp < 250 && d.over <= SLACK && inner > 50 && wall < 0.6 * inner, `brightest by ${d.over} levels; the wall ${wall.toFixed(1)} against ${inner.toFixed(1)} inside (${(wall / Math.max(1, inner)).toFixed(2)})`);
}

{
  /*
    Every pixel of the spread picture against the brightest of the wash
    (the lamp is flat with the hot spot off, so the wash's brightest is its
    level, Lamp Warmth's falloff aside), with the lamp over 100 so a black
    frame cannot pass and under 250 so a glow cannot clip. The guard only
    says the spread drew dishes (pixels lit but darker than the lamp: their
    edges, the rims' lines and the dishes' own falloff, 19% of the frame);
    it cannot tell the rims' line from the rest, and line 4 is the one that
    holds the wall's law (the same 0.85) to a dark line.
  */
  const spread = top(r.emptySpread);
  let mid = 0; for (let i = 0; i < P; i++) { const g = r.emptySpread[4 * i + 1]; if (g > 20 && g < lamp - DARK) mid++; }
  check(`5. the projectors' rims: on the grey wash nothing brighter than the lamp through it (by over ${SLACK}), and the dishes drawn`,
    lamp > 100 && lamp < 250 && spread <= lamp + SLACK && mid > DOES * P, `the lamp's brightest ${lamp}; spread apart ${spread}; ${pct(mid / P)} lit but darker`);
}

// The oil's disc and a ring of water round it, in the picture's rows (row 0 at the top, plate y up).
const inOil = (u, v) => Math.hypot(u - OIL.x, (1 - v) - OIL.y) < OIL.r * 1.3;
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
// That the oil is there at all is line 7's: out of focus it draws a lens. With none laid, 6 compares water to water.
const oilThere = up8 > 20 && down8 > 20;
{
  const d = compare(r.oilFocus, r.waterFocus, inOil);
  // The old 8% was of the water's own level: the brightest it could add.
  let lvl = 0; for (let i = 0; i < P; i++) { const x = i % SIZE, y = Math.floor(i / SIZE); if (inOil(x / SIZE, y / SIZE)) lvl = Math.max(lvl, r.waterFocus[4 * i + 1]); }
  check(`6. oil in focus brightens nothing (by over ${SLACK} levels) over the water it lies in, the oil there (it is a lens out of focus)`,
    oilThere && d.over <= SLACK, `brightest by ${d.over} levels over ${d.n} px (a flat 8% of this water would be ${Math.round(0.08 * lvl)})`);
}
{
  check('7. oil out of focus is a lens: brighter and darker in places at Focus 0.8, and the other way at 0.2 (over 90% of those pixels)',
    up8 > 20 && down8 > 20 && both > 20 && flip / both > 0.9, `${up8} px brighter, ${down8} darker at 0.8; ${flip} of ${both} turn over at 0.2`);
}
{
  const d = compare(r.later, r.plain), e = compare(r.plain, r.later);
  check('8. no grain: two times of the clock draw the same plate', d.over <= 0 && e.over <= 0, `the most a channel moved: ${Math.max(d.over, e.over, 0)} levels`);
}

{
  const lampR = top(r2.beadsOff);
  // The closeup shows the middle third of the plate across the frame (1.5 plate widths a frame at zoom 1).
  const PER = SIZE * 1.5;
  const onRim = (u, v) => CAM_BEADS.some(([x, rc]) => {
    const d = Math.hypot((u - 0.5) * SIZE / PER + 0.5 - x, (v - 0.5) * SIZE / PER) / (rc / N);
    return d >= 0.8 && d <= 1.1;
  });
  const rimPx = (() => { let n = 0; for (let i = 0; i < P; i++) if (onRim((i % SIZE + 0.5) / SIZE, (Math.floor(i / SIZE) + 0.5) / SIZE)) n++; return n; })();
  for (const [i, key, name] of [[9, 'rings', 'the oil drops (Beads 0.8)'], [10, 'drops', 'the dyed drops (Bead Drops 1)']]) {
    const d = compare(r2[key], r2.beadsOff);
    const c = i === 9 ? compare(r2.camRings, r2.camRingsOff, (u, v) => onRim(u + 0.5 / SIZE, v + 0.5 / SIZE)) : null;
    check(`${i}. ${name} on the lamp: no pixel brighter than the wash without them (by over ${SLACK}), and over ${pct(DOES)} of the plate darker by ${DARK}+${c ? `; to the camera, no pixel of their rims brighter than a ball's own gathering there (${(FOCUS_EDGE * 100).toFixed(1)}% of the wash, and 2 levels), over a tenth of the rims darker by ${DARK}+` : ''}`,
      lampR > 100 && lampR < 250 && d.over <= SLACK && d.dark > DOES && (!c || (rimPx > 200 && c.n === rimPx && c.over <= FOCUS_EDGE * lampR + 2 && c.dark > 0.1)),
      `brightest by ${d.over} levels; ${pct(d.dark)} darker; the wash ${lampR}${c ? `; the camera's rims (${c.n} px) brightest by ${c.over}, ${pct(c.dark)} darker` : ''}`);
  }
}
{
  const d = compare(r2.camEdges, r2.camFlat);
  check(`11. the camera's dye rims and two-dye lines (Edge Relief 1, Boundary Contrast 1): no pixel brighter than with them off (by over ${SLACK}), and over ${pct(DOES)} of the plate darker by ${DARK}+`,
    top(r2.camFlat) > 100 && d.over <= SLACK && d.dark > DOES, `brightest by ${d.over} levels; ${pct(d.dark)} darker; the plate's brightest ${top(r2.camFlat)}`);
}
{
  const most = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) if ((i & 3) !== 3) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
  const moved = Object.entries(r2.moved).map(([k, [a, ...rest]]) => [k, Math.max(...rest.map((b) => most(a, b)))]);
  const relief = compare(r2.reliefOff, r2.moved.closeup[0]).dark, bubbles = compare(r2.bubblesOff, r2.moved.bubbles[0]);
  const bubblesDo = Math.max(bubbles.dark, compare(r2.moved.bubbles[0], r2.bubblesOff).dark);
  check(`12. where the two lamps stand draws nothing: the plate, the camera's view, the closeup's relief and the camera's bubbles the same (by ${SLACK}) with both lamps moved to opposite corners and both to one corner, the relief and the bubbles each moving over ${pct(DOES)} of the picture`,
    moved.every(([, m]) => m <= SLACK) && Math.max(relief, compare(r2.moved.closeup[0], r2.reliefOff).dark) > DOES && bubblesDo > DOES,
    `${moved.map(([k, m]) => `${k} ${m}`).join(', ')} levels; the relief moves ${pct(Math.max(relief, compare(r2.moved.closeup[0], r2.reliefOff).dark))}, the bubbles ${pct(bubblesDo)}`);
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
