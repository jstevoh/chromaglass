#!/usr/bin/env node
/**
 * The mixer: an order for the stack, and a grade on each source.
 *
 *   npm run mixer      (the lab: any adapter that computes, so a cloud session too)
 *
 * What was asked (docs/rig-plan.md, R7): "a video mixer control … that can
 * move the order of layers (LED spinning, video, picture, any other image
 * input) and control brightness, contrast and the other photo and video
 * standards on each." `lib/mixer.ts` says how the four that move are placed
 * and why the front plate does not.
 *
 * This asks the real plate shader, on a plate laid down the same way every
 * time, whether each control does the one thing it says:
 *
 *   1. the order: moving the film under the back plate changes the picture
 *      where the back plate has dye, and nowhere else; moving the logo under
 *      the film changes it inside the logo and nowhere else; the LED ring
 *      raised off the bottom stops lighting the glass and lays its light over
 *      the plate instead
 *   2. the levels: a front plate at 0 leaves the bare lamp, a back plate at 0
 *      is a one-plate picture exactly, an LED lamp at 0 is no LED at all
 *   3. the grades: brightness scales the source's light, contrast spreads it,
 *      saturation 0 is grey, a hue turn moves the colours round by about that
 *      much, and a film at brightness 0 is no film at all
 *   4. every control reaches the picture, and only its own source's part of
 *      it: each one moved off its rest changes what is drawn (none is a dead
 *      slider), the back plate's leave everything off the back plate alone,
 *      the LED ring's reach glass the back plate does not cover, the logo's
 *      stay inside the logo (so two sources' grades cannot be cross-wired),
 *      and the gel's and the lumia's do nothing while only the other is on
 *   5. the stack's own rules, without a GPU: a saved order that is garbage or
 *      short comes back as the six, nothing goes under the front plate but
 *      the lamp's three (the LED ring, the gel, the lumia), an order saved
 *      before the gel and the lumia were rows keeps them in the lamp, and a
 *      pad that raises a source walks it through every place it can go and
 *      back to where it began
 *   6. the gel wheel and the lumia (PLAN.md §11 step 2): in the lamp the gel
 *      colours the bare glass and the lumia lights it; over the glass the gel
 *      is a filter on the lens, which colours the dye and leaves black glass
 *      black, and the lumia a beam, which lays its light over the plate and
 *      stops lighting the glass from beneath; at level 0 each is nothing,
 *      wherever it is; and with both at 0, where they sit changes nothing,
 *      so the rows they push about (the front plate's, the LED ring's) are
 *      still read where they are
 *   7. the blends (PLAN.md §11 step 3): on every row but the front plate, the
 *      lamp's three in the lamp as well as over the glass, each of screen, add,
 *      multiply and key is its own formula (lib/mixer.ts, MixBlend) pixel by
 *      pixel, predicted from the picture without the row and the row added at
 *      full level, and not another's; the back plate, whose dye's coverage
 *      cannot be told from its colour, for the two that need no more than
 *      their product, and multiply seen to darken only; the key leaves what
 *      is under a film's black as it was, and every blend what is outside the
 *      logo's card; any blend at a level of next to nothing lays next to
 *      nothing; and the back plate's Own is its Blend Mode, at Screen and at
 *      Multiply (5b, without a GPU: the post chain's finish is told the
 *      logo's blend)
 *
 * Each rule was held to a broken shader when it was written (a beam that
 * draws nothing, a logo that vanishes when lowered, the ring left lighting
 * the glass as a beam, the LED and back-plate grades swapped, saturation or
 * contrast made a plain gain, a front plate that fades to black instead of
 * to the lamp): an earlier version of this check passed all of those, since
 * "a different picture" is also what a missing source gives, and each
 * assertion below that asks for the source to be *there* is the answer. The
 * gel's and the lumia's (6, and the last of 4) were held to twelve more: the
 * lamp's floor left on the gel over the lens, a lumia beam that draws nothing,
 * a lumia left lighting the glass as a beam, the two grades swapped, the two
 * rows' places swapped, the front plate's row left at the old fixed place, a
 * gel over the lens that draws nothing, the LED lamp drawn only at row 0, the
 * gel and the lumia over the glass drawn at the top whatever their row, the
 * gel tinting the whole lamp whatever its row in it, a wheel of one colour,
 * and a gel over the lens at full density whatever its level. Five of those
 * passed the first version of section 6, which asked only whether light
 * arrived and never where a row sat among others lit; each went red once
 * the checks asked which colour, how much, and under or over what. The
 * blends (7) were held to twelve more: add written as screen, screen and
 * multiply at full strength whatever the level, a key with no edge and a key
 * that keys nothing, the film reading the LED ring's blend, the back plate's,
 * the logo's, the lamp's and the lumia beam's blends each ignored, the LED's
 * and the gel's swapped on the way to the shader, and the back plate blended
 * by its level alone without its dye's coverage. Then five the check skeptic
 * found passing: the gel's and the lumia's blends ignored in the lamp (only
 * the LED ring was asked there), the back plate's Own drawn as Screen whatever
 * its Blend Mode, a logo multiplied without its alpha (the clear margin
 * darkened), and the post chain's finish never told the logo's blend (5b).
 * (A thirteenth of the first twelve, screen written
 * as screening s·a, drew the same picture, which is the point of it: the
 * shader's comment says why the two are one formula.)
 *
 * What it does not say: that the default order is today's picture. That was
 * measured once, when the mixer went in, by rendering four scenes (plain; the
 * LED ring; LED, film, logo and two plates; photo mode) on main and on the
 * change and comparing the bytes, which were identical. A check here could
 * only compare the shader against itself.
 */
import { readFileSync } from 'node:fs';
import { openLab } from './lab.mjs';
import {
  parseMixOrder, moveInMix, raiseInMix, mixStack, mixPositions, MIX_CONTROLS, MIX_MOVERS,
} from '../src/lib/mixer.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── 5b. The finish, told everything it reads ────────────────────────
{
  /*
    The logo at the top of the stack is drawn by the finish, and the finish is
    one text (FINISH_WGSL) in two shaders: the plate's, which the lab below
    renders, and the post chain's, which it does not. With any effect on, the
    post chain's is the one on the wall, and it knows only what
    WebGPUPostChain.finish() packs from the FinishView the frame hands it. A
    new uniform the finish reads (the logo's blend was one) has to be in the
    post chain's fields, packed by finish(), and handed over by the frame, or
    the logo quietly goes back to its old way whenever an effect is on. No
    GPU is needed to ask that: it is three places in the source agreeing.
  */
  const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const plateSrc = src('src/gpu/wgsl/plate.ts');
  const finish = plateSrc.slice(plateSrc.indexOf('export const FINISH_WGSL'), plateSrc.indexOf('export const DISPLAY_BINDINGS'));
  const reads = [...new Set([...finish.matchAll(/\bU\.([A-Za-z_]\w*)/g)].map(m => m[1]))];
  const postFields = new Set([...src('src/gpu/wgsl/postFields.ts').matchAll(/name: '(\w+)'/g)].map(m => m[1]));
  const postSrc = src('src/gpu/post.ts');
  const unpacked = reads.filter(n => n !== 'resolution' && !postSrc.includes(`this.pack.set('${n}'`));
  const view = postSrc.slice(postSrc.indexOf('export interface FinishView'), postSrc.indexOf('}', postSrc.indexOf('export interface FinishView')));
  const viewKeys = [...view.matchAll(/^\s+(\w+):/gm)].map(m => m[1]);
  const lv = src('src/components/LiquidVisualizer.tsx');
  const call = lv.slice(lv.indexOf('post.finish('), lv.indexOf('}', lv.indexOf('post.finish(')));
  const unsent = viewKeys.filter(k => !new RegExp(`\\b${k}:`).test(call));
  check('the post chain\'s finish is told every uniform the finish reads, the logo\'s blend among them',
    reads.length >= 4 && reads.includes('markBlend') && reads.every(n => postFields.has(n)) && unpacked.length === 0 && viewKeys.includes('markBlend') && unsent.length === 0,
    `reads ${reads.join(', ')}; not a post field: ${reads.filter(n => !postFields.has(n)).join(', ') || 'none'}; not packed: ${unpacked.join(', ') || 'none'}; not handed over: ${unsent.join(', ') || 'none'}`);
}

// ── 5. The stack's rules ────────────────────────────────────────────
{
  const HOME = 'led gel lumia front back film mark';
  const lamp = new Set(['led', 'gel', 'lumia']);
  const six = (o) => [...o].sort().join() === [...MIX_MOVERS].sort().join();
  const odd = ['', 'nonsense', 'film film film', 'mark, film > led', 42, null, 'back front led film mark', 'led back film mark'];
  check('a saved order that is garbage, short or repeated comes back as the six',
    odd.every(o => six(parseMixOrder(o)) && parseMixOrder(o).length === 6),
    odd.map(o => `${JSON.stringify(o)} → ${parseMixOrder(o).join(' ')}`).join(' · '));
  check('and one it knows keeps its order', parseMixOrder('mark, film > led').join(' ') === 'gel lumia mark back film led',
    parseMixOrder('mark, film > led').join(' '));
  const kept = [
    [HOME, HOME],
    ['gel front lumia back film mark led', 'gel front lumia back film mark led'],
    ['back front led film mark gel lumia', 'front back led film mark gel lumia'],
    ['led back front film mark', HOME],
  ].filter(([o, want]) => mixStack(o).join(' ') !== want);
  check('the front plate sits over the lamp\'s sources the order puts under it, and over none of anything else',
    kept.length === 0, kept.map(([o]) => `${o} → ${mixStack(o).join(' ')}`).join(' · '));
  // Every order saved before the gel and the lumia were rows: they were drawn
  // after the LED lamp and before the glass, whether the ring was the lamp or a beam.
  check('an order saved before the gel and the lumia were rows keeps them in the lamp',
    mixStack('led front back film mark').join(' ') === HOME
    && mixStack('front led back film mark').join(' ') === 'gel lumia front led back film mark'
    && mixStack('front back film led mark').join(' ') === 'gel lumia front back film led mark',
    mixStack('front led back film mark').join(' '));
  check('the film steps under the back plate', moveInMix(HOME, 'film', -1) === 'led gel lumia front film back mark');
  const stuck = MIX_MOVERS.filter(m => !lamp.has(m)).map(m => {
    // Walk it all the way down: it must stop just above the front plate.
    let o = HOME;
    for (let k = 0; k < 8; k++) o = moveInMix(o, m, -1);
    const st = mixStack(o);
    return st.indexOf(m) === st.indexOf('front') + 1 ? null : `${m}: ${st.join(' ')}`;
  }).filter(Boolean);
  check('nothing but the LED ring, the gel and the lumia goes under the front plate', stuck.length === 0, stuck.join(' · '));
  const passes = ['led', 'gel', 'lumia'].map(m => {
    // Raised until it is just over the glass: one press past the front plate.
    // Bounded: a move that stopped moving would otherwise spin until the
    // shard's timeout, and print nothing.
    let o = HOME;
    for (let k = 0; k < 7 && mixStack(o).indexOf(m) < mixStack(o).indexOf('front') - 1; k++) o = moveInMix(o, m, 1);
    const st = mixStack(moveInMix(o, m, 1));
    return st.indexOf(m) === st.indexOf('front') + 1 ? null : `${m}: ${st.join(' ')}`;
  }).filter(Boolean);
  check('each of the lamp\'s three passes the front plate, out of the lamp', passes.length === 0, passes.join(' · '));
  check('and nothing moves off the top or the bottom',
    moveInMix(HOME, 'mark', 1) === HOME && moveInMix(HOME, 'led', -1) === HOME);
  // Pressed until the order comes back round: every row it can reach, then home.
  // With the lamp's three under the glass the others have the three rows above
  // the front plate; each of the lamp's three has all seven.
  const walks = MIX_MOVERS.map(m => {
    let o = HOME, presses = 0;
    const rows = new Set();
    do { o = raiseInMix(o, m); rows.add(mixStack(o).indexOf(m)); presses++; } while (o !== HOME && presses < 12);
    const want = lamp.has(m) ? 7 : 3;
    return { m, ok: o === HOME && rows.size === want && presses === want, rows: [...rows].sort().join(''), presses };
  });
  check('a pad walks a source through every place it can go and back home',
    walks.every(w => w.ok), walks.map(w => `${w.m}: rows ${w.rows} in ${w.presses}`).join(' · '));
  // Two orders, so that no row's place is the same in both: a place written
  // into the code rather than read would be right in one of them at most.
  const pos = mixPositions('film mark led back');
  const pos2 = mixPositions('led lumia front gel back film mark');
  check('and the shader is told each row\'s place among the seven',
    pos.gel === 0 && pos.lumia === 1 && pos.front === 2 && pos.film === 3 && pos.mark === 4 && pos.led === 5 && pos.back === 6 && pos.top === 6
    && pos2.led === 0 && pos2.lumia === 1 && pos2.front === 2 && pos2.gel === 3 && pos2.back === 4 && pos2.film === 5 && pos2.mark === 6,
    `${JSON.stringify(pos)} · ${JSON.stringify(pos2)}`);
}

// ── The plate ────────────────────────────────────────────────────────
const { page, close } = await openLab();
const shots = await page.evaluate(async (controls) => {
  await lab.create(192);
  let s = 424242;
  const r = () => (s = s * 16807 % 2147483647) / 2147483647;
  // Dye over the left half only, so the right half is bare glass to compare
  // against; the back plate is the same dye turned half round, so it lies over
  // the right half, and the two plates' dye can be told apart.
  for (let i = 0; i < 10; i++) lab.dye(0.08 + 0.34 * r(), 0.15 + 0.7 * r(), 0.06 + 0.08 * r(), [0.3 + 1.2 * r(), 0.3 + 1.2 * r(), 0.3 + 1.2 * r()], 1.4);
  lab.flush(); await lab.step(6);
  const mk = (w, h, paint) => { const c = new OffscreenCanvas(w, h); paint(c.getContext('2d'), w, h); return c; };
  // A film bright enough to clear the key everywhere, in coloured stripes.
  const film = mk(128, 128, (g, w, h) => { for (let x = 0; x < w; x += 8) { g.fillStyle = `hsl(${x * 3},85%,${55 + (x % 24)}%)`; g.fillRect(x, 0, 8, h); } });
  // A logo: a solid warm card with a transparent margin.
  const mark = mk(100, 40, (g) => { g.fillStyle = 'rgb(250,210,120)'; g.fillRect(10, 5, 80, 30); });
  const S = 128;
  // The lamp's own pools and the glass's droplets off: they belong to the glass,
  // and a source moved under the back plate is under them too (lib/mixer.ts),
  // which is right but would blur what these measure.
  const base = { layerCount: 2, filmMix: 0.9, markMix: 1, markX: 0.5, markY: 0.5, markScale: 0.6, beads: 0, lampHotspot: 0, secondLamp: 0, microDroplets: 0, lampWarmth: 0, dishVignette: 0 };
  const all = { film, mark, backPlate: true, backRotation: Math.PI };
  const shot = (set, cam = all) => lab.render(S, { ...base, ...set }, cam);
  const out = {
    S,
    def: await shot({}),
    noFilm: await shot({ filmMix: 0 }),
    filmUnderBack: await shot({ mixOrder: 'led gel lumia front film back mark' }),
    noBack: await shot({ backLevel: 0 }),
    noMark: await shot({ markMix: 0 }),
    noMarkNoFilm: await shot({ markMix: 0, filmMix: 0 }),
    markUnderFilm: await shot({ mixOrder: 'led gel lumia front back mark film' }),
    onePlate: await shot({ layerCount: 1 }, { film, mark, backRotation: Math.PI }),
    oneBackOff: await shot({ backLevel: 0 }),
    frontOff: await shot({ frontLevel: 0, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    bare: await shot({ layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    filmDark: await shot({ filmBright: 0 }),
    frontHalf: await shot({ frontBright: 0.5, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    frontContrast: await shot({ frontContrast: 1.8, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    frontGrey: await shot({ frontSat: 0, saturationBoost: 1, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    frontFlat: await shot({ saturationBoost: 1, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    frontHue: await shot({ frontHue: 120, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    markDark: await shot({ markBright: 0 }),
    led: await shot({ ledPlatform: true, ledMode: 'rainbow', layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    ledBeam: await shot({ ledPlatform: true, ledMode: 'rainbow', layerCount: 1, filmMix: 0, markMix: 0, mixOrder: 'gel lumia front back led film mark' }, {}),
    ledLampOff: await shot({ ledPlatform: true, ledMode: 'rainbow', layerCount: 1, filmMix: 0, markMix: 0, ledLevel: 0 }, {}),
    ledBeamOff: await shot({ ledPlatform: true, ledMode: 'rainbow', layerCount: 1, filmMix: 0, markMix: 0, mixOrder: 'gel lumia front back led film mark', ledLevel: 0 }, {}),
    noLed: await shot({ layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    // The front plate at 0 over a lit lamp: must leave the lamp, not black.
    ledFrontOff: await shot({ ledPlatform: true, ledMode: 'rainbow', layerCount: 1, filmMix: 0, markMix: 0, frontLevel: 0 }, {}),
    // The gel wheel and the lumia, one plate and nothing else lit.
    gelLamp: await shot({ gelWheel: 0.9, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    gelLens: await shot({ gelWheel: 0.9, layerCount: 1, filmMix: 0, markMix: 0, mixOrder: 'led lumia front gel back film mark' }, {}),
    gelLensOff: await shot({ gelWheel: 0, layerCount: 1, filmMix: 0, markMix: 0, mixOrder: 'led lumia front gel back film mark' }, {}),
    lumiaLamp: await shot({ lumia: 0.9, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    lumiaBeam: await shot({ lumia: 0.9, layerCount: 1, filmMix: 0, markMix: 0, mixOrder: 'led gel front lumia back film mark' }, {}),
    lumiaBeamOff: await shot({ lumia: 0, layerCount: 1, filmMix: 0, markMix: 0, mixOrder: 'led gel front lumia back film mark' }, {}),
    // Each alone, with the other's grade moved: it must change nothing.
    gelOnlyLumiaGraded: await shot({ gelWheel: 0.9, lumiaBright: 0.4, lumiaHue: 90, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    lumiaOnlyGelGraded: await shot({ lumia: 0.9, gelBright: 0.4, gelHue: 90, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    // Half the level of the ones above, for how much a level gives.
    gelLensHalf: await shot({ gelWheel: 0.3, layerCount: 1, filmMix: 0, markMix: 0, mixOrder: 'led lumia front gel back film mark' }, {}),
    gelLensSix: await shot({ gelWheel: 0.6, layerCount: 1, filmMix: 0, markMix: 0, mixOrder: 'led lumia front gel back film mark' }, {}),
    lumiaBeamHalf: await shot({ lumia: 0.45, layerCount: 1, filmMix: 0, markMix: 0, mixOrder: 'led gel front lumia back film mark' }, {}),
    // Both lit in the lamp, in the two orders of the pair: the gel colours only what is under it.
    lampGelUnder: await shot({ gelWheel: 0.9, lumia: 0.9, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    lampGelOver: await shot({ gelWheel: 0.9, lumia: 0.9, layerCount: 1, filmMix: 0, markMix: 0, mixOrder: 'led lumia gel front back film mark' }, {}),
    // Over the glass, with the film on the wall to be under or over: one plate,
    // and bare glass on the right where only the film shows.
    filmAlone: await shot({ layerCount: 1, markMix: 0 }, { film }),
    gelUnderFilm: await shot({ gelWheel: 0.9, layerCount: 1, markMix: 0, mixOrder: 'led lumia front gel back film mark' }, { film }),
    gelOverFilm: await shot({ gelWheel: 0.9, layerCount: 1, markMix: 0, mixOrder: 'led lumia front back film gel mark' }, { film }),
    lumiaUnderFilm: await shot({ lumia: 0.9, layerCount: 1, markMix: 0, mixOrder: 'led gel front lumia back film mark' }, { film }),
    lumiaOverFilm: await shot({ lumia: 0.9, layerCount: 1, markMix: 0, mixOrder: 'led gel front back film lumia mark' }, { film }),
    // Both at 0, everything else lit, in pairs of orders that differ only in
    // where the two sit, and so move the LED ring's row (and the front
    // plate's) without moving it across the glass.
    allHome: await shot({ ledPlatform: true, ledMode: 'rainbow' }),
    allShuffled: await shot({ ledPlatform: true, ledMode: 'rainbow', mixOrder: 'gel lumia led front back film mark' }),
    allBeamHome: await shot({ ledPlatform: true, ledMode: 'rainbow', mixOrder: 'front back led film mark' }),
    allBeamShuffled: await shot({ ledPlatform: true, ledMode: 'rainbow', mixOrder: 'front back led gel lumia film mark' }),
    each: {},
  };
  /*
    The blends (7): each row with nothing of it (c), the same row added at
    full level (so its own picture is that less c), and each of the four at
    0.6. One plate and the grain's own saturation step at 1, so what is
    under a row is what the rows under it made. The film here has dark
    stripes as well as coloured ones, for the key to drop: black, two greys
    either side of the key's soft edge, and five colours none near white.
  */
  const film2 = mk(128, 128, (g, w) => {
    const bars = ['rgb(0,0,0)', 'rgb(150,90,40)', 'rgb(20,20,20)', 'rgb(40,120,160)', 'rgb(45,45,45)', 'rgb(120,40,140)', 'rgb(90,150,60)', 'rgb(160,60,70)'];
    for (let x = 0; x < w; x += 16) { g.fillStyle = bars[(x / 16) % bars.length]; g.fillRect(x, 0, 16, 128); }
  });
  const one = { layerCount: 1, saturationBoost: 1, filmMix: 0, markMix: 0 };
  const ROWS = {
    film: { key: 'filmBlend', set: { ...one, filmBright: 0.6 }, cam: { film: film2 }, off: { filmMix: 0 }, on: (l) => ({ filmMix: l }) },
    led: { key: 'ledBlend', set: { ...one, ledMode: 'rainbow', ledBright: 0.4, mixOrder: 'gel lumia front back led film mark' }, cam: {}, off: { ledPlatform: false }, on: (l) => ({ ledPlatform: true, ledLevel: l }) },
    // Each source graded down, so that it and the dye under it add up to
    // less than white, where every blend would be the same number.
    gel: { key: 'gelBlend', set: { ...one, gelBright: 0.5, mixOrder: 'led lumia front gel back film mark' }, cam: {}, off: { gelWheel: 0 }, on: (l) => ({ gelWheel: l }) },
    lumia: { key: 'lumiaBlend', set: { ...one, mixOrder: 'led gel front lumia back film mark' }, cam: {}, off: { lumia: 0 }, on: (l) => ({ lumia: l }) },
    mark: { key: 'markBlend', set: { ...one, markBright: 0.3, markX: 0.3, markY: 0.2, markScale: 0.4 }, cam: { mark }, off: { markMix: 0 }, on: (l) => ({ markMix: l }) },
    // Not turned: its dye over the front's, so there is something under it everywhere it is.
    back: { key: 'backBlend', set: { ...one, layerCount: 2, backBright: 0.5 }, cam: { backPlate: true, backRotation: 0 }, off: { backLevel: 0 }, on: (l) => ({ backLevel: l }) },
    // In the lamp, under the glass, over the lumia so there is light under it:
    // the bare glass on the right is the lamp.
    ledLamp: { key: 'ledBlend', set: { ...one, ledMode: 'rainbow', ledBright: 0.4, lumia: 1, lumiaBright: 1.8, mixOrder: 'lumia led gel front back film mark' }, cam: {}, off: { ledPlatform: false }, on: (l) => ({ ledPlatform: true, ledLevel: l }) },
    // The gel and the lumia in the lamp, each over the LED ring's light.
    gelLamp: { key: 'gelBlend', set: { ...one, ledPlatform: true, ledMode: 'rainbow', ledBright: 0.4, gelBright: 0.5 }, cam: {}, off: { gelWheel: 0 }, on: (l) => ({ gelWheel: l }) },
    lumiaLamp: { key: 'lumiaBlend', set: { ...one, ledPlatform: true, ledMode: 'rainbow', ledBright: 0.4 }, cam: {}, off: { lumia: 0 }, on: (l) => ({ lumia: l }) },
  };
  out.blend = {};
  for (const [id, r] of Object.entries(ROWS)) {
    const b = out.blend[id] = {
      c: await shot({ ...r.set, ...r.off }, r.cam),
      full: await shot({ ...r.set, ...r.on(1), [r.key]: 'add' }, r.cam),
      own: await shot({ ...r.set, ...r.on(0.6) }, r.cam),
      // Just past the shader's skip at 0.001, so the blend itself is asked.
      zero: await shot({ ...r.set, ...r.on(0.002), [r.key]: 'add' }, r.cam),
    };
    for (const m of ['screen', 'add', 'multiply', 'key']) b[m] = await shot({ ...r.set, ...r.on(0.6), [r.key]: m }, r.cam);
  }
  // The back plate on Own under another Blend Mode: Multiply, whose formula is the row's Multiply.
  out.blend.back.ownMultiply = await shot({ ...ROWS.back.set, ...ROWS.back.on(0.6), blendMode: 'multiply' }, ROWS.back.cam);
  // And on paper, where the back plate is lit as a photograph whatever its blend.
  out.blend.back.photoOwn = await shot({ ...ROWS.back.set, ...ROWS.back.on(0.6), renderStyle: 'photo' }, ROWS.back.cam);
  out.blend.back.photoAdd = await shot({ ...ROWS.back.set, ...ROWS.back.on(0.6), renderStyle: 'photo', backBlend: 'add' }, ROWS.back.cam);
  out.blend.back.photoNone = await shot({ ...ROWS.back.set, ...ROWS.back.off, renderStyle: 'photo' }, ROWS.back.cam);

  // Every control, moved off its rest, in a scene where its source is on the wall.
  const lit = { ledPlatform: true, ledMode: 'rainbow', gelWheel: 0.6, lumia: 0.6 };
  for (const c of controls) {
    const moved = c.key.endsWith('Hue') ? 90 : c.none === 1 ? 0.4 : c.max;
    out.each[c.key] = await shot({ ...lit, [c.key]: moved });
  }
  out.eachRest = await shot(lit);
  out.eachNoBack = await shot({ ...lit, backLevel: 0 });
  return out;
}, MIX_CONTROLS.map(c => ({ key: c.key, none: c.none, max: c.max })));
await close();

const { S } = shots;
const px = (img, x, y) => { const k = (y * S + x) * 4; return [img[k], img[k + 1], img[k + 2]]; };
/** Mean absolute difference per channel over the pixels `where` picks, and how many it picked. */
const diff = (a, b, where = () => true) => {
  let sum = 0, n = 0, max = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!where(x, y)) continue;
    const p = px(a, x, y), q = px(b, x, y);
    for (let c = 0; c < 3; c++) { const d = Math.abs(p[c] - q[c]); sum += d; if (d > max) max = d; }
    n++;
  }
  return { mean: n ? sum / (3 * n) : 0, max, n };
};
const f1 = (v) => v.toFixed(1);

// Where the back plate has dye: what taking it away changes.
const backDye = (x, y) => { const p = px(shots.def, x, y), q = px(shots.noBack, x, y); return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 12; };
const noBackDye = (x, y) => { const p = px(shots.def, x, y), q = px(shots.noBack, x, y); return p[0] === q[0] && p[1] === q[1] && p[2] === q[2]; };
// Where the film shows: what taking it away changes, with no logo over it.
const filmOn = (x, y) => { const p = px(shots.noMark, x, y), q = px(shots.noMarkNoFilm, x, y); return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 12; };
// The logo's card, well inside its edges: centre 0.5, half-width 0.3, card 80% of it across and 75% up.
const inCard = (x, y) => Math.abs(x / S - 0.5) < 0.2 && Math.abs(y / S - 0.5) < 0.04;
const inRect = (x, y) => Math.abs(x / S - 0.5) <= 0.31 && Math.abs(y / S - 0.5) <= 0.13;

// ── 1. The order ────────────────────────────────────────────────────
{
  const covered = diff(shots.def, shots.filmUnderBack, (x, y) => backDye(x, y) && filmOn(x, y));
  const bare = diff(shots.def, shots.filmUnderBack, (x, y) => noBackDye(x, y));
  check('the film moved under the back plate changes the picture where the back plate has dye',
    covered.n > 200 && covered.mean > 4, `${f1(covered.mean)} a channel over ${covered.n} px`);
  check('and not where it has none', bare.n > 1000 && bare.max <= 1, `worst ${bare.max} over ${bare.n} px`);
  const card = diff(shots.def, shots.markUnderFilm, (x, y) => inCard(x, y) && filmOn(x, y));
  const out = diff(shots.def, shots.markUnderFilm, (x, y) => !inRect(x, y));
  check('the logo moved under the film changes the picture inside the logo',
    card.n > 50 && card.mean > 6, `${f1(card.mean)} a channel over ${card.n} px`);
  check('and nowhere outside it', out.max === 0, `worst ${out.max} over ${out.n} px`);
  // And it is still there: a logo that vanished when lowered would change the
  // card as much as one that went under the film.
  const still = diff(shots.markUnderFilm, shots.noMark, inCard);
  check('the logo under the film is still drawn', still.mean > 20, `${f1(still.mean)} a channel over what no logo gives`);
  const onTop = diff(shots.def, shots.noMark, inCard);
  check('the logo on top covers what is under it', onTop.mean > 20, `${f1(onTop.mean)} a channel`);
  const bareGlass = (x) => x > S * 0.6;
  const lit = diff(shots.led, shots.noLed, bareGlass);
  const beam = diff(shots.ledBeam, shots.led);
  check('the LED ring raised off the bottom is a different picture from the lamp',
    lit.mean > 4 && beam.mean > 4, `the lamp changes bare glass by ${f1(lit.mean)}, raising it changes the frame by ${f1(beam.mean)}`);
  // "Different" is also what a beam that draws nothing gives: it must add light.
  const adds = diff(shots.ledBeam, shots.noLed);
  check('the beam lays the ring\'s light over the plate', adds.mean > 50, `${f1(adds.mean)} a channel over no LED`);
  // And it stops being the lamp: through clear glass, a beam over the dark lamp
  // is the same light as the lamp itself, so a ring left lighting the glass as
  // well would show there doubled.
  const once = diff(shots.ledBeam, shots.led, bareGlass);
  check('and stops lighting the glass from beneath', once.max <= 1, `worst ${once.max} on bare glass`);
}

// ── 2. The levels ───────────────────────────────────────────────────
{
  const one = diff(shots.oneBackOff, shots.onePlate);
  check('a back plate at level 0 is a one-plate picture, exactly', one.max === 0, `worst ${one.max}`);
  const lamp = diff(shots.ledLampOff, shots.noLed);
  check('an LED lamp at level 0 is no LED, exactly', lamp.max === 0, `worst ${lamp.max}`);
  const beam = diff(shots.ledBeamOff, shots.noLed);
  check('and an LED beam at level 0 is no LED either', beam.max <= 1, `worst ${beam.max}`);
  const dye = (x, y) => x < S * 0.45;
  const off = diff(shots.frontOff, shots.bare, dye);
  const plain = diff(shots.bare, shots.frontOff, (x) => x > S * 0.6);
  // The lab's lamp is black: a front plate at 0 is the glass with nothing lit on it.
  const blank = shots.frontOff.filter((v, i) => i % 4 !== 3 && v > 3).length;
  check('a front plate at level 0 leaves the bare lamp', off.mean > 3 && blank === 0 && plain.max === 0,
    `the plate took ${f1(off.mean)} a channel with it; ${blank} channels still lit`);
  // The lab's lamp is black, so "the lamp" and "black" are one picture above;
  // over the LED ring as the lamp they are not.
  const lampLeft = diff(shots.ledFrontOff, shots.led, (x) => x > S * 0.6);
  const lampOn = diff(shots.ledFrontOff, shots.noLed, (x) => x > S * 0.6);
  check('and over a lit lamp, the lamp itself', lampLeft.max <= 1 && lampOn.mean > 20,
    `worst ${lampLeft.max} against the lamp through clear glass, ${f1(lampOn.mean)} over black`);
}

// ── 3. The grades ───────────────────────────────────────────────────
{
  const film0 = diff(shots.filmDark, shots.noFilm);
  check('a film at brightness 0 is no film at all', film0.max === 0, `worst ${film0.max}`);
  const luma = (img, where) => {
    let sum = 0, n = 0, sq = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (!where(x, y)) continue;
      const [r0, g0, b0] = px(img, x, y);
      const l = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
      if (l < 6) continue;
      sum += l; sq += l * l; n++;
    }
    const m = sum / Math.max(1, n);
    return { m, sd: Math.sqrt(Math.max(0, sq / Math.max(1, n) - m * m)), n };
  };
  const dye = (x) => x < S * 0.45;
  const a = luma(shots.bare, dye), h = luma(shots.frontHalf, dye);
  check('brightness 0.5 on the front plate halves its light', h.m / a.m > 0.4 && h.m / a.m < 0.62,
    `${f1(a.m)} → ${f1(h.m)} (${(h.m / a.m).toFixed(2)})`);
  const c = luma(shots.frontContrast, dye);
  // A gain spreads it too; contrast is about mid-grey, so the dark end must go
  // darker while the bright end goes brighter.
  const tenth = (img, q) => {
    const ls = [];
    for (let y = 0; y < S; y++) for (let x = 0; x < S * 0.45; x++) {
      const [r0, g0, b0] = px(img, x, y);
      const l = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
      if (l >= 6) ls.push(l);
    }
    if (ls.length < 200) throw new Error(`only ${ls.length} lit pixels to take a tenth of`);
    ls.sort((p, q2) => p - q2);
    return ls[Math.floor(q * (ls.length - 1))];
  };
  const [lo0, hi0, lo1, hi1] = [tenth(shots.bare, 0.1), tenth(shots.bare, 0.9), tenth(shots.frontContrast, 0.1), tenth(shots.frontContrast, 0.9)];
  check('contrast spreads it about mid-grey', c.sd / a.sd > 1.3 && lo1 < lo0 - 5 && hi1 > hi0 + 5,
    `spread ${f1(a.sd)} → ${f1(c.sd)}; darkest tenth ${f1(lo0)} → ${f1(lo1)}, brightest ${f1(hi0)} → ${f1(hi1)}`);
  const chroma = (img) => {
    let sum = 0, n = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S * 0.45; x++) {
      const [r0, g0, b0] = px(img, x, y);
      if (Math.max(r0, g0, b0) < 12) continue;
      sum += Math.max(r0, g0, b0) - Math.min(r0, g0, b0); n++;
    }
    return { c: sum / Math.max(1, n), n };
  };
  // Grey and still lit: a saturation that went to black would have no
  // coloured pixel left to judge, and read as grey.
  const was = chroma(shots.frontFlat), grey = chroma(shots.frontGrey);
  check('saturation 0 is grey', was.c > 15 && grey.c < 2 && grey.n > 0.9 * was.n,
    `colour ${f1(was.c)} → ${f1(grey.c)} a pixel, over ${grey.n} of ${was.n} lit pixels`);
  // The circular mean of the hue over the dye, weighted by how coloured each pixel is.
  const hueOf = (img) => {
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S * 0.45; x++) {
      const [r0, g0, b0] = px(img, x, y);
      const mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0), d = mx - mn;
      if (d < 10) continue;
      let hh = mx === r0 ? ((g0 - b0) / d) % 6 : mx === g0 ? (b0 - r0) / d + 2 : (r0 - g0) / d + 4;
      hh *= Math.PI / 3;
      sx += Math.cos(hh) * d; sy += Math.sin(hh) * d; n++;
    }
    if (n < 200) throw new Error(`only ${n} coloured pixels to take a hue from`);
    return Math.atan2(sy, sx) * 180 / Math.PI;
  };
  const turned = ((hueOf(shots.frontHue) - hueOf(shots.bare)) % 360 + 540) % 360 - 180;
  check('a hue turn of 120° moves the colours round by about that', Math.abs(turned - 120) < 35, `${f1(turned)}°`);
  const markD = diff(shots.markDark, shots.def, inCard);
  const markLum = luma(shots.markDark, inCard);
  check('a logo at brightness 0 is a black card', markD.mean > 40 && markLum.n < 10, `${markLum.n} px of it still lit`);
}

// ── 4. Every control reaches the picture ────────────────────────────
{
  const dead = MIX_CONTROLS.filter(c => diff(shots.each[c.key], shots.eachRest).mean < 0.05)
    .map(c => `${c.label} (${String(c.key)})`);
  check(`all ${MIX_CONTROLS.length} of the mixer's controls change what is drawn`, dead.length === 0,
    dead.length ? `dead: ${dead.join(', ')}` : '');
  // And each one where its own source is. Off the back plate (the right-hand
  // dye, turned half round, taken away changes nothing there), the back
  // plate's controls must change nothing and the LED ring's, lighting the
  // glass from beneath, must change it; the logo's stay inside the logo.
  // The film covers the frame and the front plate carries the lamp's light,
  // so theirs have no footprint to hold them to.
  const offBack = (x, y) => { const p = px(shots.eachRest, x, y), q = px(shots.eachNoBack, x, y); return p[0] === q[0] && p[1] === q[1] && p[2] === q[2]; };
  const stray = [];
  for (const c of MIX_CONTROLS) {
    const img = shots.each[c.key];
    if (c.source === 'back') { const d = diff(img, shots.eachRest, offBack); if (d.n < 1000 || d.max > 0) stray.push(`${String(c.key)} worst ${d.max} off the back plate`); }
    if (c.source === 'led') { const d = diff(img, shots.eachRest, offBack); if (d.n < 1000 || d.mean < 3) stray.push(`${String(c.key)} only ${f1(d.mean)} off the back plate`); }
    if (c.source === 'mark') { const d = diff(img, shots.eachRest, (x, y) => !inRect(x, y)); if (d.max > 0) stray.push(`${String(c.key)} worst ${d.max} outside the logo`); }
  }
  check('and each of the back plate\'s, the LED ring\'s and the logo\'s only where that source is', stray.length === 0, stray.join(' · '));
  // The gel and the lumia light the whole lamp, so they have no footprint
  // either; what can be asked is that neither's grade reaches the other's
  // picture, which is what two grades cross-wired in the shader would do.
  const gelAlone = diff(shots.gelOnlyLumiaGraded, shots.gelLamp);
  const lumiaAlone = diff(shots.lumiaOnlyGelGraded, shots.lumiaLamp);
  check('and the lumia\'s grade does nothing to the gel, nor the gel\'s to the lumia', gelAlone.max === 0 && lumiaAlone.max === 0,
    `worst ${gelAlone.max} on the gel alone, ${lumiaAlone.max} on the lumia alone`);
}

// ── 6. The gel wheel and the lumia ──────────────────────────────────
{
  const bareGlass = (x) => x > S * 0.6;
  const dye = (x) => x < S * 0.45;
  const tint = diff(shots.gelLamp, shots.noLed, bareGlass);
  // And in the wheel's own colours, a segment each: the lab holds the wheel
  // still (gelAngle 0) on the harmony's first four dyes, so the bare glass's
  // upper right is under one segment (a yellow) and its lower right under
  // the next (a red). A wheel that lost its segments would be one colour.
  const meanRgb = (img, x0, x1, y0, y1) => {
    const m = [0, 0, 0]; let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = px(img, x, y); m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; n++; }
    return m.map(v => v / n);
  };
  const upper = meanRgb(shots.gelLamp, 90, 120, 10, 50), lower = meanRgb(shots.gelLamp, 90, 120, 78, 118);
  const gr = (c) => c[1] / Math.max(1, c[0]);
  check('the gel in the lamp colours the bare glass, a segment of the wheel at a time',
    tint.mean > 4 && gr(upper) > 0.6 && gr(lower) < 0.1,
    `${f1(tint.mean)} a channel over no gel; green to red ${gr(upper).toFixed(2)} upper right, ${gr(lower).toFixed(2)} lower right`);
  const underLum = diff(shots.lampGelUnder, shots.lampGelOver, bareGlass);
  check('and in the lamp it colours what is under it: the lumia under the gel, or not over it', underLum.mean > 4,
    `${f1(underLum.mean)} a channel between the two orders on bare glass`);
  // Over the lens it multiplies: black glass has no light to colour, and a
  // gel that added light (a beam) or was left in the lamp would light it.
  const black = diff(shots.gelLens, shots.noLed, bareGlass);
  const dyed = diff(shots.gelLens, shots.noLed, dye);
  check('raised over the glass, the gel colours the dye and leaves black glass black', black.max <= 1 && dyed.mean > 4,
    `worst ${black.max} on bare glass; ${f1(dyed.mean)} a channel on the dye`);
  const lampLight = diff(shots.lumiaLamp, shots.noLed, bareGlass);
  check('the lumia in the lamp lights the bare glass', lampLight.mean > 4, `${f1(lampLight.mean)} a channel over no lumia`);
  const beam = diff(shots.lumiaBeam, shots.noLed, dye);
  const through = diff(shots.lumiaLamp, shots.noLed, dye);
  check('raised over the glass, the lumia lays its light over the dye', beam.mean > through.mean + 4,
    `${f1(beam.mean)} a channel over the dye as a beam, ${f1(through.mean)} through it from the lamp`);
  // Through clear glass, a beam over the dark lamp is the same light as the
  // lamp's own; a lumia left in the lamp as well would show there doubled.
  const once = diff(shots.lumiaBeam, shots.lumiaLamp, bareGlass);
  check('and stops lighting the glass from beneath', once.max <= 1, `worst ${once.max} on bare glass`);
  const gel0 = diff(shots.gelLensOff, shots.noLed), lum0 = diff(shots.lumiaBeamOff, shots.noLed);
  check('over the glass, a gel or a lumia at level 0 is none, exactly', gel0.max === 0 && lum0.max === 0,
    `worst ${gel0.max} for the gel, ${lum0.max} for the lumia`);
  // Level 0 alone is the shader's early skip, and would hold for a level that
  // was full density at any other value: half the level is about half the change.
  // The gel's is 0.3 against 0.6, where neither picture is near white: the
  // dye it brightens clips at 0.9 and not at half of it, which read as a
  // level that gives more than half (0.59 of 0.9 at 0.45).
  const unclipped = (x, y) => dye(x) && Math.max(...px(shots.gelLensSix, x, y), ...px(shots.gelLensHalf, x, y)) < 250;
  const gelHalf = diff(shots.gelLensHalf, shots.noLed, unclipped).mean / Math.max(1e-6, diff(shots.gelLensSix, shots.noLed, unclipped).mean);
  const lumHalf = diff(shots.lumiaBeamHalf, shots.noLed, bareGlass).mean / Math.max(1e-6, diff(shots.lumiaBeam, shots.noLed, bareGlass).mean);
  check('and half the level is about half of it', gelHalf > 0.4 && gelHalf < 0.6 && lumHalf > 0.4 && lumHalf < 0.6,
    `the gel's change on the dye ${gelHalf.toFixed(2)} of the full level's, the lumia's on bare glass ${lumHalf.toFixed(2)}`);
  // Over the glass, a row's place among the others: under the film or over it.
  const filmShows = (x, y) => bareGlass(x) && (() => { const p = px(shots.filmAlone, x, y); return p[0] + p[1] + p[2] > 60; })();
  const gelUnder = diff(shots.gelUnderFilm, shots.filmAlone, filmShows);
  const gelOver = diff(shots.gelOverFilm, shots.filmAlone, filmShows);
  const redFilm = meanRgb(shots.filmAlone, 90, 120, 78, 118), redGel = meanRgb(shots.gelOverFilm, 90, 120, 78, 118);
  check('the gel under the film leaves the film alone, and over it colours the film in its own colour',
    gelUnder.n > 1000 && gelUnder.max <= 1 && gelOver.mean > 8 && gr(redGel) < 0.3 * gr(redFilm),
    `worst ${gelUnder.max} under over ${gelUnder.n} px; ${f1(gelOver.mean)} a channel over it; green to red under the red segment ${gr(redFilm).toFixed(2)} → ${gr(redGel).toFixed(2)}`);
  const lumPlace = diff(shots.lumiaUnderFilm, shots.lumiaOverFilm, filmShows);
  check('and the lumia under the film is not the lumia over it', lumPlace.mean > 3, `${f1(lumPlace.mean)} a channel between them`);
  const same = diff(shots.allShuffled, shots.allHome), sameBeam = diff(shots.allBeamShuffled, shots.allBeamHome);
  check('with both at 0, where they sit in the stack changes nothing, though it moves the LED ring\'s row, lamp or beam',
    same.max === 0 && sameBeam.max === 0, `worst ${same.max} and ${sameBeam.max}`);
}

// ── 7. The blends ───────────────────────────────────────────────────
{
  /*
    Each blend against its formula (lib/mixer.ts, MixBlend), pixel by pixel.
    c is the picture with nothing of the row, and s·a the row's own picture
    times its alpha, read off the row added at full level less c. From
    those two alone each of the four is predicted at level 0.6:

      screen    c + L·sa·(1 − c)
      add       c + L·sa
      multiply  c·(1 − L + L·s)            (rows with no alpha of their own)
      key       mix(c, s, L·smoothstep(0.18, 0.36, luma(s)))   (Film Key's default, and every other row's)

    and the picture drawn with that blend must be its own prediction, and not
    the other three's. The back plate's dye has a coverage of its own which
    add at full level cannot tell from its colour, so only the two that need
    no more than s·a (screen and add) are predicted for it. Pixels are left
    out where anything is at white, where the frame's clip makes every
    prediction the same number.
  */
  const L = 0.6;
  const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const sstep = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
  const predict = {
    screen: (c, s) => c.map((v, i) => v + L * s[i] * (1 - v)),
    add: (c, s) => c.map((v, i) => v + L * s[i]),
    multiply: (c, s) => c.map((v, i) => v * (1 - L + L * s[i])),
    key: (c, s) => { const k = L * sstep(0.18, 0.36, luma(...s)); return c.map((v, i) => v + (s[i] - v) * k); },
  };
  const MODES = Object.keys(predict);
  /** Mean error of each prediction against the picture drawn with blend `m`, in 8-bit steps, and how many pixels. */
  const fit = (b, m, where = () => true) => {
    const err = Object.fromEntries(MODES.map(k => [k, 0]));
    let n = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (!where(x, y)) continue;
      const c = px(b.c, x, y).map(v => v / 255), full = px(b.full, x, y), got = px(b[m], x, y);
      if (Math.max(...full, ...got) >= 250) continue;
      const s = full.map((v, i) => Math.max(0, v / 255 - c[i]));
      // Where either is dark every blend but multiply is the same number.
      if (Math.max(...c) < 40 / 255 || Math.max(...s) < 40 / 255) continue;
      const preds = MODES.map(k => predict[k](c, s));
      if (Math.max(...preds.flat()) >= 250 / 255) continue;
      preds.forEach((p, j) => { err[MODES[j]] += p.reduce((acc, v, i) => acc + Math.abs(v * 255 - got[i]), 0) / 3; });
      n++;
    }
    for (const k of MODES) err[k] = n ? err[k] / n : Infinity;
    return { err, n };
  };
  const table = (id, modes) => modes.map(m => {
    const { err, n } = fit(shots.blend[id], m);
    return { m, own: err[m], near: Math.min(...modes.filter(k => k !== m).map(k => err[k])), n };
  });
  const say = (rows) => rows.map(r => `${r.m} ${f1(r.own)} (next ${f1(r.near)})`).join(', ') + `; ${rows[0].n} px`;
  // Within a step and a half of 255 of its own formula, and four times as far
  // (and never under two and a half steps) from the nearest other. Measured
  // here: each blend 0.2 to 1.0 steps from its own formula, and 4.2 (the LED
  // ring's screen against its add, over a dim lamp) to 33 from the nearest other.
  const good = (rows) => rows.every(r => r.n > 200 && r.own < 1.5 && r.near > Math.max(2.5, 4 * r.own));
  const NAMES = { film: 'the film', led: 'the LED beam', gel: 'the gel over the lens', lumia: 'the lumia beam', mark: 'the logo', ledLamp: 'the LED ring in the lamp', gelLamp: 'the gel in the lamp', lumiaLamp: 'the lumia in the lamp' };
  for (const id of ['film', 'led', 'gel', 'lumia', 'mark', 'ledLamp', 'gelLamp', 'lumiaLamp']) {
    const rows = table(id, MODES);
    check(`${NAMES[id]}: each of screen, add, multiply and key is its own formula and not another's`, good(rows), say(rows));
  }
  const backRows = table('back', ['screen', 'add']);
  check('the back plate: screen and add are their formulas, with its dye\'s coverage as the alpha', good(backRows), say(backRows));
  // Multiply cannot be predicted for the back plate (above); it can be seen to
  // darken, and only where the plate has dye.
  {
    const b = shots.blend.back;
    let darker = 0, lighter = 0, n = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const c = px(b.c, x, y), f = px(b.full, x, y), m = px(b.multiply, x, y);
      if (Math.max(...c) < 40 || f.every((v, i) => v - c[i] < 20)) continue;
      n++;
      const d = (m[0] + m[1] + m[2]) - (c[0] + c[1] + c[2]);
      if (d < -15) darker++; else if (d > 6) lighter++;
    }
    // And where it has none, nothing: a multiply by its level alone would darken the bare glass too.
    const bare = diff(b.multiply, b.c, (x, y) => px(b.full, x, y).every((v, i) => Math.abs(v - px(b.c, x, y)[i]) <= 1));
    check('and multiply darkens what is under it where it has dye, and lightens nothing, and leaves the rest',
      n > 200 && darker > 0.8 * n && lighter === 0 && bare.n > 1000 && bare.max <= 1,
      `${darker} of ${n} px darker, ${lighter} lighter; worst ${bare.max} over ${bare.n} px without its dye`);
    // Its Own is the look's Blend Mode, and Multiply there is the row's Multiply to the formula.
    const asMode = diff(b.ownMultiply, b.multiply), fromScreen = diff(b.ownMultiply, b.own);
    check('the back plate\'s Own is its Blend Mode: at Screen the row\'s Screen, at Multiply the row\'s Multiply',
      diff(b.own, b.screen).max <= 1 && asMode.max <= 1 && fromScreen.mean > 10,
      `worst ${diff(b.own, b.screen).max} at Screen and ${asMode.max} at Multiply; ${f1(fromScreen.mean)} a channel between the two Blend Modes`);
  }
  // On paper: the blend reaches the back plate's lit drops, and nothing where it has none.
  {
    const b = shots.blend.back;
    const dyed = (x, y) => px(b.full, x, y).some((v, i) => v - px(b.c, x, y)[i] > 20);
    const bare = (x, y) => px(b.full, x, y).every((v, i) => Math.abs(v - px(b.c, x, y)[i]) <= 1);
    const onDye = diff(b.photoAdd, b.photoOwn, dyed), offDye = diff(b.photoAdd, b.photoOwn, bare), lit = diff(b.photoOwn, b.photoNone, dyed);
    // Off the dye is where adding the plate at full level moved no channel a
    // step, which still leaves a sliver of coverage: there Add (c + a·s) and
    // Own on paper (a mix toward the lit dye by a) part by a·c, two steps at
    // most, measured. A blend that reached past the dye would be tens.
    check('on paper the back plate\'s blend reaches its lit drops, and nothing where it has no dye',
      lit.mean > 5 && onDye.n > 1000 && onDye.mean > 3 && offDye.n > 1000 && offDye.max <= 2 && offDye.mean < 0.2,
      `the plate ${f1(lit.mean)} a channel over the paper; Add against Own ${f1(onDye.mean)} over its dye, ${offDye.mean.toFixed(2)} (worst ${offDye.max}) off it`);
  }
  // The logo's alpha: every blend leaves what is outside its card, the transparent margin included, as it was.
  {
    const b = shots.blend.mark;
    // Where adding the logo at full level changed nothing, and not because
    // what is under it was already at white, where an add changes nothing
    // either; and two pixels clear of the card's edge, where the texture's
    // filtering blends the card's alpha down together with its colour toward
    // the clear margin's black, so that the logo's own way in darkens there by
    // a few steps (8 at most here), as it always did.
    const clear1 = (x, y) => Math.max(...px(b.c, x, y)) < 250 && px(b.full, x, y).every((v, i) => Math.abs(v - px(b.c, x, y)[i]) <= 1);
    const clear = (x, y) => [-2, -1, 0, 1, 2].every(dy => [-2, -1, 0, 1, 2].every(dx => {
      const u = Math.min(S - 1, Math.max(0, x + dx)), v = Math.min(S - 1, Math.max(0, y + dy));
      return clear1(u, v);
    }));
    const worst = ['own', ...MODES].map(m => [m, diff(b[m], b.c, clear).max]);
    check('every blend leaves what the logo\'s card does not cover as it was, its clear margin too',
      worst.every(([, v]) => v <= 1) && diff(b.c, b.c, clear).n > 10000, worst.map(([m, v]) => `${m} ${v}`).join(' · '));
  }
  // The key's other half: where the film is black or near it, what is under is left as it was.
  {
    const b = shots.blend.film;
    const dark = (x, y) => { const c = px(b.c, x, y), f = px(b.full, x, y); return Math.max(...c) >= 40 && f.every((v, i) => v - c[i] <= 20); };
    const keyed = diff(b.key, b.c, dark), mult = diff(b.multiply, b.c, dark);
    check('the key leaves what is under the film\'s black as it was, where multiply darkens it', keyed.n > 200 && keyed.mean < 1.5 && mult.mean > 20,
      `${f1(keyed.mean)} a channel keyed, ${f1(mult.mean)} multiplied, over ${keyed.n} px`);
  }
  const zeros = Object.keys(shots.blend).map(id => [id, diff(shots.blend[id].zero, shots.blend[id].c).max]);
  check('any blend at a level of next to nothing (0.002, past the shader\'s skip) lays next to nothing', zeros.every(([, m]) => m <= 1), zeros.map(([id, m]) => `${id} ${m}`).join(' · '));
}

const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
