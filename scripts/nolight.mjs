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
 * And the shadowgraph (PLAN 38h-3):
 *
 *   13.  it is the whole column's, one term: a clear pour of glycerine, no
 *        dye in it and no oil, is a lens out of focus as line 7 asks of the
 *        oil, and brightens nothing in focus. And as strong a lens as the
 *        oil's for its index step: the two drops are the same size, so the
 *        summed |ln T| each makes just off focus goes as glycerine's 0.142
 *        over water to the oil's 0.8 of 0.137 (1.29), within a quarter. The
 *        dye's shadowgraph and the oil's were drawn apart, the dye's only
 *        where the dye itself sloped and the oil's from the oil alone, so on
 *        main the pour drew its lens only where the wash happened to slope:
 *        301 px against the oil's 1944
 *
 * And two written ahead of their builds (owed, see below):
 *
 *   14.  a clear rim in focus (PLAN 18e-2): at Focus 0.5 a clear pour of
 *        glycerine, a clear oil drop and the pour on clear water with no
 *        dye anywhere each draw a dark hairline on their edge, the light
 *        bent by the path's slope past the projection lens, and nothing in
 *        their middles or round them. On main nothing moves at all there:
 *        the plate bends light by the dye's slope only
 *   15.  the camera's bubble film is light through it (38h-6): at
 *        Iridescence 1 nothing brighter than at 0, at Film Physics 0 and 1,
 *        and the film still drawn. Main multiplies by up to 1.7, a front-lit
 *        soap film's reflection: 22 levels over at Film Physics 0
 *   16.  the projector's bubble film is light through it (38h-14): the
 *        same at the plate's own bubbles, at Film Physics 0 and 1, and the
 *        film still drawn. Main at Film Physics 0 multiplied by the
 *        rainbow taken as reflected light: 54 levels over the lamp
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

/*
  Two lines written ahead of their builds (14 for PLAN 18e-2, 15 for 38h-6),
  each printed as owed while it fails and red the day it passes with its id
  still listed (the convention of timers.mjs and wallflash.mjs); an owed line
  is excused only while what it asks for is absent, and a build that is
  there and misses is red.

    npm run nolight -- --owed=rim,film
*/
const IDS = ['rim', 'film'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
const unknown = [...owed].filter((id) => !IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${IDS.join(', ')})`);
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  checks.push({ name, ok: true });
  console.log(` owed  ${name} — ${detail}`);
};

const N = 128, SIZE = 256, SLACK = 1, DARK = 8, DOES = 0.002;
/** Line 15's "the film still draws": a transmitted soap film passes 92 to 100% of the light, so over most of a bubble its tint is a level or so, not DARK's 8: any level moved counts. */
const FILM_MOVE = 0;
/** Where the oil goes: the wash, away from the pools, so the plate under it is the lamp through the wash alone. */
const OIL = { x: 0.72, y: 0.28, r: 0.09 };
/** Where the clear pour goes (line 9): the wash's far corner from the oil and the pools. */
const POUR = { x: 0.72, y: 0.72, r: 0.09 };
/** Line 9's strength is read just off Focus's middle, where the transport is still linear in the path and nothing clips. */
const NEAR = 0.56;
/** Line 14's index-matched pour, on the clear plate: the corner away from the glycerine. */
const MATCH = { x: 0.28, y: 0.72, r: 0.09 };

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
let r, r2, r3;
try {
  r = await page.evaluate(async ({ N, SIZE, OIL, POUR, DARK, NEAR }) => {
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
    out.waterNear = await shot({ projectorFocus: NEAR });
    s.addMix(OIL.x, OIL.y, OIL.r, { oil: 0.8 });
    await lab.step(1);
    out.oilFocus = await shot({ projectorFocus: 0.5 });
    out.oil8 = await shot({ projectorFocus: 0.8 });
    out.oil2 = await shot({ projectorFocus: 0.2 });
    out.oilNear = await shot({ projectorFocus: NEAR });
    // A clear pour, no dye in it, onto the wash away from the oil and the pools: glycerine, n 1.4746.
    lab.addSpecies(POUR.x, POUR.y, POUR.r, 50, 'glycerine', false);
    out.pourFocus = await shot({ projectorFocus: 0.5 });
    out.pour8 = await shot({ projectorFocus: 0.8 });
    out.pour2 = await shot({ projectorFocus: 0.2 });
    out.pourNear = await shot({ projectorFocus: NEAR });
    return out;
  }, { N, SIZE, OIL, POUR, DARK, NEAR });
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
    /*
      Line 15 (38h-6): the camera's bubbles with their film at Iridescence 0
      and 1, at Film Physics 0 and 1, Light Play off (the softbox's glint is
      its own and stays). And the projector's, printed only.
    */
    out.film = {};
    for (const fp of [0, 1]) for (const ir of [0, 1]) {
      const over = { filmPhysics: fp, iridescence: ir, lightPlay: 0 };
      out.film[`cam${fp}${ir}`] = await shot(over, { ...views.bubbles, lamp: LAMPS[0] });
      out.film[`plate${fp}${ir}`] = await shot(over, { macroAmount: 0, bubbles: 0.8, lamp: LAMPS[0] });
    }
    return out;
  }, { N, SIZE, LAMPS, CAM_BEADS });
  /*
    Line 14's third leg: the same clear pour on a plate with no dye at all,
    the lamp through clear water. The plate's rim term is gated on the dye
    being there (fluid0.a > 0.03), and a clear pour into clear water has
    none, so on main nothing can draw there even once the deflection reads
    the path.
  */
  r3 = await page.evaluate(async ({ N, SIZE, POUR, MATCH }) => {
    await lab.create(N);
    const base = { lampGround: 1, edgeRelief: 0.6, saturationBoost: 1, lampHotspot: 0, projectorFocus: 0.5 };
    const shot = async () => Array.from(await lab.render(SIZE, base, { time: 3 }));
    lab.flush(); await lab.step(2);
    const off = await shot();
    const gly = lab.addSpecies(POUR.x, POUR.y, POUR.r, 50, 'glycerine', false);
    const on = await shot();
    /*
      And the same glycerine with its index matched to water's: the same
      field, the same footprint, the same viscosity, no step in the path. An
      edge matched in index is invisible (why a glass rod vanishes in oil of
      its own index), so it draws nothing; a rim drawn from where the poured
      liquid is, and not from the light, draws one here.
    */
    lab.solver().pour(MATCH.x, MATCH.y, MATCH.r, 50, { ...gly, index: 1.333 }, false);
    return { off, on, matched: await shot() };
  }, { N, SIZE, POUR, MATCH });
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

/*
  Where a place on the plate is in the picture. The view shows the plate's
  middle two thirds across the frame (uvToFluid's 1.5: a frame's width is
  1/1.5 of the plate), so a point of the plate sits 1.5 times as far from the
  picture's middle as from the plate's, and a disc is 1.5 times as wide. Lines
  6, 7 and 13 read the plate's numbers as the picture's until 18e-2's line was
  written (the oil's disc then read round (0.72, 0.28) of the picture, its
  middle at (0.83, 0.17), so the ring of water each was read with cut through
  the drop's own rim); the rings below are where the drops are drawn.
  In the picture's rows: row 0 at the top, plate y up.
*/
const MAG = 1.5;
const drawn = (o) => ({ x: 0.5 + (o.x - 0.5) * MAG, y: 0.5 + (o.y - 0.5) * MAG, r: o.r * MAG });
/** How far a pixel is from a place on the plate, in that place's own radii as drawn. */
const radii = (o) => { const s = drawn(o); return (u, v) => Math.hypot(u - s.x, (1 - v) - s.y) / s.r; };
/*
  What the lens alone does out of focus. With 18e-2 a clear edge loses light
  past the pupil in focus as well (line 14), a hairline dark at Focus 0.5 that
  is no lens and does not turn over, and on main there is none. So lines 7
  and 13 ask of a picture out of focus against the plate without the drop at
  that focus, times what the drop already does in focus: pic − base · picF /
  baseF, in levels. On main picF is baseF where it matters (line 6), and this
  is the difference it always read.
*/
const lensOnly = (pic, base, picF, baseF, i) => pic[i] - base[i] * (picF[i] + 0.5) / (baseF[i] + 0.5);
// The oil's disc and a ring of water round it.
const oilR = radii(OIL);
const inOil = (u, v) => oilR(u, v) < 1.3;
let up8 = 0, down8 = 0, flip = 0, both = 0;
for (let i = 0; i < P; i++) {
  const x = i % SIZE, y = Math.floor(i / SIZE);
  if (!inOil(x / SIZE, y / SIZE)) continue;
  const g8 = lensOnly(r.oil8, r.water8, r.oilFocus, r.waterFocus, 4 * i + 1);
  const g2 = lensOnly(r.oil2, r.water2, r.oilFocus, r.waterFocus, 4 * i + 1);
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
{
  const pourR = radii(POUR);
  const inPour = (u, v) => pourR(u, v) < 1.3;
  let up = 0, down = 0, turn = 0, seen = 0;
  for (let i = 0; i < P; i++) {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    if (!inPour(x / SIZE, y / SIZE)) continue;
    const g8 = lensOnly(r.pour8, r.oil8, r.pourFocus, r.oilFocus, 4 * i + 1);
    const g2 = lensOnly(r.pour2, r.oil2, r.pourFocus, r.oilFocus, 4 * i + 1);
    if (g8 > 2) up++;
    if (g8 < -2) down++;
    if (Math.abs(g8) > 2 && Math.abs(g2) > 2) { seen++; if (Math.sign(g8) !== Math.sign(g2)) turn++; }
  }
  /*
    The strength, not only the area: the count of pixels past 2 levels fills
    most of the drop's disc for any lens over about 1%, so a pour drawn at
    half or twice its optical path would count the same (the review of this
    line). And at 0.8 the lobes clip, so a sum of levels there moved only
    1.43 times when the pour's index step was doubled. So the strength is
    read at Focus NEAR, where exp(-Δz ∇²OPL/n) is still about linear: the
    sum of |ln(picture / without the drop)| over the drop and the defocus
    disc's reach past it (0.07 of the plate covers R to Focus 0.8), against
    the oil's.
  */
  const reach = (o) => { const s = drawn(o); return (u, v) => Math.hypot(u - s.x, (1 - v) - s.y) < s.r * 1.3 + 0.07 * MAG; };
  // |ln(pic / base)| less what the drop does in focus (lensOnly's reason, in logs).
  const strength = (pic, base, picF, baseF, o) => {
    const keep = reach(o); let sum = 0;
    const ln = (a, b, i) => Math.log((a[i] + 0.5) / (b[i] + 0.5));
    for (let i = 0; i < P; i++) if (keep((i % SIZE) / SIZE, Math.floor(i / SIZE) / SIZE)) sum += Math.abs(ln(pic, base, 4 * i + 1) - ln(picF, baseF, 4 * i + 1));
    return sum;
  };
  const sPour = strength(r.pourNear, r.oilNear, r.pourFocus, r.oilFocus, POUR), sOil = strength(r.oilNear, r.waterNear, r.oilFocus, r.waterFocus, OIL);
  const d = compare(r.pourFocus, r.oilFocus, inPour);
  // What the optics predict: each lens as strong as its index step (glycerine 1.4746, the oil 0.8 of 1.47, over water's 1.333).
  const expect = (1.4746 - 1.333) / (0.8 * (1.47 - 1.333));
  const ratio = sPour / Math.max(1, sOil) / expect;
  check(`13. one shadowgraph for the whole column: a clear pour with no dye is a lens out of focus (brighter and darker at 0.8, the other way at 0.2, over 90%), as strong as the oil's for its index step (within a quarter), and in focus brightens nothing (by over ${SLACK})`,
    up > 20 && down > 20 && seen > 20 && turn / seen > 0.9 && ratio > 0.75 && ratio < 1 / 0.75 && d.over <= SLACK,
    `${up} px brighter, ${down} darker at 0.8 (the oil's ${up8 + down8}); summed |ln T| at ${NEAR} ${sPour.toFixed(1)} against the oil's ${sOil.toFixed(1)}, ${ratio.toFixed(2)} of the ${expect.toFixed(2)} the index steps predict; ${turn} of ${seen} turn over at 0.2; in focus brightest by ${d.over} levels`);
}

/*
  14 (PLAN 18e-2, owed). A clear pour's rim in focus. At Focus's middle (Δz
  0) the shadowgraph is 1, so what an edge draws there is the pupil's loss
  alone: a ray bent at the edge by the slope of the optical path, ∇OPL, past
  the projection lens's aperture, a dark hairline on the edge itself. The
  plate works that bend out from the dye's slope (refractionOptics note 1),
  so a pour with no dye across its edge, glycerine into water (Δn 0.14), or
  a clear oil drop, draws no rim in focus: on main nothing at all moves
  there. So, at Focus 0.5, against the same plate without it:
    - the pour on the wash: over a quarter of its rim's ring (0.8 to 1.2 of
      its radius) darker by DARK+, and none of it brighter (line 13 asks
      that of the whole drop);
    - only at the rim: its flat middle (inside 0.6 of the radius) and the
      wash round it (1.4 to 2 radii) moved by no more than SLACK, so a line
      painted wide, or a pour tinted, cannot pass;
    - the clear oil drop on the wash, the same ring darker by DARK+ over a
      quarter of it (Cahn-Hilliard's interface is softer than the pour's
      step, so it draws a softer rim, but a rim);
    - the pour on clear water, no dye anywhere: the same quarter of its
      ring darker. The rim is the light lost from the lamp, and does not
      need dye to have something to darken;
    - each of the three with the pour's guards: nothing on its rim brighter,
      its middle and the ground round it unmoved;
    - and the same glycerine poured with its index matched to water's (the
      same field and footprint, no step in the path) draws nothing, so a rim
      drawn from where a liquid was poured, not from the light, cannot pass.
  The owed state is main's: nothing moves at all on any of the three rims.
*/
{
  const ringOf = (o, a, b) => { const d = radii(o); return (u, v) => { const k = d(u, v); return k >= a && k <= b; }; };
  const most = (pic, base, keep) => { const up = compare(pic, base, keep).over, down = compare(base, pic, keep).over; return Math.max(up, down, 0); };
  /*
    Each leg: its rim darker over Q, no pixel of the rim brighter, and its
    middle and the ground round it unmoved, so a darkened disc or a wide
    painted band cannot pass any of them. And "owed" means nothing moved at
    all on any of the three rims (by over SLACK): a rim built too weak to
    reach DARK is red, not owed.
  */
  const leg = (pic, base, o) => ({ ...compare(pic, base, ringOf(o, 0.8, 1.2)), moved: most(pic, base, ringOf(o, 0.8, 1.2)), middle: most(pic, base, ringOf(o, 0, 0.6)), round: most(pic, base, ringOf(o, 1.4, 2)) });
  const legs = [['pour', leg(r.pourFocus, r.oilFocus, POUR)], ['oil', leg(r.oilFocus, r.waterFocus, OIL)], ['pour on clear water', leg(r3.on, r3.off, POUR)]];
  const matched = most(r3.matched, r3.on, ringOf(MATCH, 0, 2));
  const Q = 0.25;
  line('rim', `14. a clear rim in focus (Focus 0.5): the clear pour, the clear oil drop and the pour on clear water each darken over ${pct(Q)} of their rim (0.8 to 1.2 radii) by ${DARK}+, no pixel of it brighter (by ${SLACK}), each middle and the ground round it unmoved (by ${SLACK}); the same pour matched to water's index draws nothing (by ${SLACK})`,
    legs.every(([, l]) => l.dark > Q && l.over <= SLACK && l.middle <= SLACK && l.round <= SLACK) && matched <= SLACK,
    `${legs.map(([k, l]) => `${k}: ${pct(l.dark)} of its rim darker, brightest by ${l.over}, middle moved ${l.middle}, round it ${l.round}`).join('; ')}; the matched pour moved ${matched} levels`,
    legs.every(([, l]) => l.moved <= SLACK));
}
/*
  15 (PLAN 38h-6, owed). The camera's bubble film by transmission. A pocket
  of air between the glasses, lit from beneath, shows its wetting film by
  the light through it: T = 1 - R, 92 to 100 per cent of the light in pale
  complements of the reflected colours (filmTableAt(…, true)), which the
  projector's bubble already wears at Film Physics. The camera's bubble
  multiplies by 0.45 + 1.25 × the reflected film colour (camFilm), up to
  1.7: a soap film lit from the front, as in the macro photographs it was
  tuned against. So: the camera's bubbles at Iridescence 1 against the same
  bubbles at Iridescence 0, at Film Physics 0 and at 1: no pixel brighter
  (by over SLACK, a transmitted film only takes light away, and more film
  colour takes more), and the film still draws (over DOES of the picture
  moved at all, at either Film Physics: a transmitted film tints by a level
  or so over most of a bubble, 8% at most, so DARK's 8 would ask more than
  the physics gives; main at Film Physics 1, already transmitted, moves
  0.00% of the picture by 8, 0.01% by over 2 and 10.83% by any level), so a
  film taken off altogether cannot pass. And the camera's bubbles at Film
  Physics 0 are the same picture as at 1 (by SLACK, at each Iridescence):
  a pocket lit from beneath has one film, the transmitted one the projector
  already wears at Film Physics 1, so a grey stand-in or a second film of
  its own cannot pass. Not caught: a gain inside camFilm the same at both
  Iridescences cancels from the comparison (there is no film-free picture
  of a bubble to hold it to); the review reads camFilm. The projector's own
  bubbles are line 16. The owed state is main's: brighter by over 10 levels.
*/
{
  const f = r2.film;
  /* The share of the picture where any channel moved by more than t levels, either way. */
  const moved = (a, b, t) => { let n = 0; for (let i = 0; i < P; i++) for (let c = 0; c < 3; c++) if (Math.abs(a[4 * i + c] - b[4 * i + c]) > t) { n++; break; } return n / P; };
  const cam = [0, 1].map((fp) => ({ fp, up: compare(f[`cam${fp}1`], f[`cam${fp}0`]), moved: moved(f[`cam${fp}1`], f[`cam${fp}0`], FILM_MOVE) }));
  // The camera wears the transmitted table at any Film Physics: the same picture at 0 and 1, at each Iridescence.
  const same = Math.max(...[0, 1].map((ir) => Math.max(compare(f[`cam0${ir}`], f[`cam1${ir}`]).over, compare(f[`cam1${ir}`], f[`cam0${ir}`]).over, 0)));
  const over = Math.max(...cam.map((c) => c.up.over));
  line('film', `15. the camera's bubble film is light through it: at Iridescence 1 no pixel brighter than at 0 (by over ${SLACK}), at Film Physics 0 and 1, the film still drawn (over ${pct(DOES)} of the picture moved at each), and Film Physics 0 drawing the camera's bubbles as 1 does (by ${SLACK})`,
    over <= SLACK && cam.every((c) => c.moved > DOES) && same <= SLACK,
    `${cam.map((c) => `Film Physics ${c.fp}: brightest by ${c.up.over}, ${pct(c.moved)} moved`).join('; ')}; Film Physics 0 against 1 differs by ${same}`,
    over > 10);
  /*
    16 (PLAN 38h-14). The projector's own bubbles, on the same plate and the
    same pockets, at Iridescence 1 against 0, at Film Physics 0 and 1. The
    projector throws only the light through a pocket's film, T = 1 - R
    (bubbleFilm.ts's projectorFilm): at Film Physics 1 soap's measured
    table, at 0 the stylised rainbow taken as the reflected colour and
    passed as its complement. So no pixel brighter (by over SLACK), and the
    film still draws (over DOES of the picture moved by any level at each
    Film Physics), so a film taken off altogether cannot pass. Main read
    54 and 0: at Film Physics 0 it multiplied the plate by 0.45 + 1.25 x
    the rainbow, a front-lit film's reflection, up to 1.7 times the lamp.
  */
  const plate = [0, 1].map((fp) => ({ fp, up: compare(f[`plate${fp}1`], f[`plate${fp}0`]).over, moved: moved(f[`plate${fp}1`], f[`plate${fp}0`], FILM_MOVE) }));
  check(`16. the projector's bubble film is light through it: at Iridescence 1 no pixel brighter than at 0 (by over ${SLACK}), at Film Physics 0 and 1, the film still drawn (over ${pct(DOES)} of the picture moved at each)`,
    plate.every((c) => c.up <= SLACK && c.moved > DOES),
    plate.map((c) => `Film Physics ${c.fp}: brightest by ${c.up}, ${pct(c.moved)} moved`).join('; '));
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
