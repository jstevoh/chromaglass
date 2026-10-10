#!/usr/bin/env node
/**
 * Which looks go on the lamp (PLAN 18b-1, judging §31).
 *
 *   npm run lampjudge -- gallery        (the folder a `lamp-gallery` run wrote)
 *
 * Lamp Ground (PLAN 18b) turns a look over: at 0 the dye glows on black, at 1
 * the lamp under the dish shines up through it, as on an overhead projector.
 * The owner asked for the choice to be made by rule rather than by taste, so
 * this is the rule, written down, and the numbers it reads come from the Mac
 * (`gallery.yml` labelled `lamp-gallery`: every look at 12 and 30 seconds,
 * each moment taken on both grounds about half a second apart, so the two
 * pictures are the same dish, moved on by what half a second moves it).
 *
 * Two questions, in order.
 *
 * 1. Is the look a dish of liquid on a lamp at all? Most are: the 1960s show
 *    was an overhead projector, and on a projector clear liquid is the lamp's
 *    white and dye is a filter in front of it (Beer–Lambert). That is the real
 *    optics, so a dish starts on the lamp. Some looks are something else, and
 *    say so in their own description: light itself (starlight, neon, plasma,
 *    an aurora, a lumia's folded sheets of light, glinting motes), which on a
 *    projector would be a gel or a lumia throwing light onto a dark screen; or
 *    a photograph or print lit from the front (the macro photograph over blue
 *    paper, the polarised photograph of oil interference, a soap film's
 *    interference colours, which are reflected light and all but vanish in
 *    transmission, a Lichtenstein panel). Those keep their black. INTENT
 *    below is that reading, one look at a time, with the description's own
 *    words as the reason.
 *
 * 2. Does the look, with the dye it was given for black, read on the lamp?
 *    A real show keeps the dish full of colour with some lamp showing through;
 *    it is not a white wall with a few tints, and not a dark plate where the
 *    dye has taken all the light. So, on the lamp, at both moments, over the
 *    dish (scripts/judge.mjs `groundPairOf`, the two pictures decoded and
 *    read pixel against pixel at 240×150; a pixel black on both grounds is
 *    the room round the dish, not the dish):
 *
 *      glare ≤ 0.45   at most this share of the dish is the bare lamp
 *                     (bright and colourless: clear liquid, or no dye)
 *      ink   ≤ 0.30   at most this share has gone black (dye so deep it
 *                     takes the whole lamp)
 *      lit   ≥ 0.20, and ≥ 0.6 × the same look's lit share on black
 *                     the colour survives the turn: a fifth of the dish
 *                     holds lit colour, and the lamp keeps most of what the
 *                     black ground showed
 *
 *    A dish the ground does not reach (at some moment the two pictures differ
 *    by under 6% of full scale on average: its own dye already draws the
 *    light table's white) keeps what it ships with; turning it changes
 *    nothing to judge. This gate was added after the first read, where the
 *    gap it sits in was seen: the three photographs, which ignore the ground
 *    by design, differ by 1%, Ferro Maze by 3%, and the least of any look the
 *    ground does reach by 13% (Jellyfish Bloom; Poster, 1969 14%).
 *    A dish that passes goes on the lamp. A dish that fails stays on black,
 *    with the gate it failed as its reason: glare means it wants more dye (or
 *    a fuller dish) on the lamp, ink means less (PLAN 18b-1 says a look moved
 *    to the lamp may want a lower Dye Budget); either is a change to the look,
 *    not the ground, and is written into PLAN as its own item.
 *
 * The thresholds were set before any picture was read, from what the gates
 * are for, and are not tuned to the result. One thing changed after the
 * first read, in what is measured rather than where the line is: the shares
 * were of the whole frame, so the dark room round a round dish (Clock Glass,
 * Home Movie, the Fillmore's screen) counted as dye gone black on the lamp.
 * Clock Glass failed on it (37% black, of which about 30 points were the
 * room); over the dish alone it reads 0%. And Ferro Maze, which draws its
 * light table with its own dye and looks the same on both grounds, failed
 * the bare-lamp gate as "too little dye"; the rule now says what it is.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { groundPairOf, roomOf } from './judge.mjs';

const DIR = process.argv[2] ?? 'gallery';
const GLARE = 0.45, INK = 0.30, LIT = 0.20, KEEP = 0.6, SAME = 0.06;

/** What each look is going for: 'dish' (liquid in a dish; to the lamp if it
 *  reads), 'light' (draws light itself) or 'picture' (a photograph or print
 *  with its own ground), and the description's words that say so. */
/** Where the owner has looked and overruled the rule: the ground, and their
 *  words. The rule's own verdict is still printed beside it, so a later
 *  change to the rule shows whether it now agrees. */
export const OWNER = {
  // 2026-10-04, on the look as it shipped on black: "sensual laboratory
  // looks washed out by the light". Its Multiply blend already lays the dye
  // over a cream platen at Lamp Ground 0, as grey paint on cream; on the lamp
  // the graphite is a filter and reads dark against the platen (the gallery's
  // pair at 30 s). The rule kept it on black on the colour gates (0% lit
  // colour on either ground: a graphite look has none to keep) and the bare
  // platen (70%), which for reactions on a platen is the look.
  'sensual-laboratory': [1, 'the owner found it washed out on black ("looks washed out by the light"); on the lamp its graphite reads dark on the platen'],
};

export const INTENT = {
  classic: ['dish', '"the 1960s overhead projector at its most meditative"'],
  galaxy: ['light', '"spiral arms of starlight swirl through the void"'],
  'deep-ocean': ['dish', '"light coming through them from below"'],
  cyberpunk: ['light', '"neon fluids": neon is light, not a filter'],
  'acid-trip': ['dish', '"under a turning colour gel": a gel is a filter on a lamp'],
  'bass-drop': ['dish', '"crimson and ultramarine thrown across ice": dye in a dish'],
  'timbre-shifter': ['dish', 'says nothing of its ground: a dish of fluid'],
  'microscopic-chaos': ['dish', '"a stained slide on a bright field ... under the lamp"'],
  'aurora-borealis': ['light', '"curtains ... across a night sky"'],
  'solar-flare': ['light', '"plumes of plasma ... from a white-hot core"'],
  'jellyfish-bloom': ['dish', '"translucent ... bells ... lit from beneath"'],
  'fractal-dream': ['dish', '"the plate folded into a turning six-way mirror": a dish in a kaleidoscope'],
  'velvet-underground': ['dish', '"rich pools ... under a warm lamp"'],
  'neon-coral-reef': ['dish', '"a reaction grows coral across the glass"'],
  'stardust-collapse': ['light', '"motes of white, lavender and amber dust": glints of light'],
  lumia: ['light', '"Thomas Wilfred\'s aurora: slow folded sheets of light"'],
  'sensual-laboratory': ['dish', '"reactions on the platen": Mark Boyle\'s overhead projector'],
  'oil-wheel': ['dish', '"an Optikinetics wheel warming under a 250 W lamp"'],
  'poster-1969': ['dish', '"two opaque dyes on a single plate"'],
  'oil-on-water': ['picture', '"the macro photograph ... over blue paper": lit from the front'],
  'colorful-cosmos': ['picture', '"big round drops over a warm gradient ... two lamps": a photograph'],
  'macro-bead': ['dish', '"one travelling bead ... on a deep sea-green ground": a dish, close up'],
  'cell-bloom': ['dish', '"paint cells ... across a magnified violet pool"'],
  'lace-run': ['dish', '"a tongue of amber dye spreading over dark red ground"'],
  'fillmore-1969': ['dish', '"the Joshua Light Show": overhead projectors'],
  'crowd-plate': ['dish', '"everyone dancing is a hand on the glass"'],
  'milk-marble': ['dish', '"a dish of milk": milk is white, which the lamp gives and black does not'],
  'soap-film': ['picture', '"one sheet of interference colour": reflected light, all but gone in transmission'],
  'oil-and-water': ['dish', '"amber oil on teal water between two glasses"'],
  'red-cabbage': ['dish', '"violet red-cabbage dye as a pH indicator": a dish of dye'],
  'chemical-clock': ['dish', '"the Belousov-Zhabotinsky reaction in a dish of gel"'],
  agate: ['dish', '"a reagent seeping out through a gel"'],
  'magnet-garden': ['dish', '"black ferrofluid on a bright golden pool"'],
  'lava-lamp': ['dish', '"the plate stood upright over a warm lamp": a lamp behind wax'],
  'home-movie': ['dish', '"a light show filmed on Super 8": a projector'],
  'clock-glass': ['dish', '"two curved clock glasses with coloured oil and water between them ... a thin bright film"'],
  'ferro-maze': ['dish', '"black ferrofluid on a white light table"'],
  'ferro-paint': ['dish', '"ferrofluid worked through amber, teal and coral dye ... bright cells of colour"'],
  roy: ['picture', '"printed as a Lichtenstein panel": ink on paper, with dense dye printed as black ink'],
};

const f2 = (v) => v.toFixed(2);

/** One look's verdict from its readings: `pairs` is [{ t, reading }], one
 *  per moment, each `groundPairOf(black, lamp)` (null where a frame is missing). */
export const verdictOf = (id, name, pairs) => {
  const [kind, why] = INTENT[id] ?? ['dish', 'not in the intent table: a dish by default'];
  const whole = pairs.length > 0 && pairs.every((p) => p.reading);
  const worst = whole ? {
    glare: Math.max(...pairs.map((p) => p.reading.glare)),
    ink: Math.max(...pairs.map((p) => p.reading.ink)),
    lit: Math.min(...pairs.map((p) => p.reading.lit)),
    keep: Math.min(...pairs.map((p) => p.reading.lit / Math.max(1e-3, p.reading.litBlack))),
    // The least of the moments: the two pictures are taken about half a
    // second apart (the shot, two frame reads 150 ms apart, the turn, a
    // quarter second), and a look moving fast (Ferro Maze fingering at 12 s,
    // 0.18) differs that much by itself; the ground differs at every moment.
    // So `change` is the ground plus that half second's motion, and the gate
    // can only call a look unreached, never prove one reached.
    change: Math.min(...pairs.map((p) => p.reading.change)),
  } : null;
  const fails = [];
  if (worst) {
    if (worst.glare > GLARE) fails.push(`the lamp is bare over ${Math.round(worst.glare * 100)}% of the dish (limit ${GLARE * 100}%): too little dye for the lamp`);
    if (worst.ink > INK) fails.push(`${Math.round(worst.ink * 100)}% of the dish goes black (limit ${INK * 100}%): dye laid for black is too deep for the lamp`);
    if (worst.lit < LIT) fails.push(`only ${Math.round(worst.lit * 100)}% lit colour on the lamp (needs ${LIT * 100}%)`);
    if (worst.keep < KEEP) fails.push(`keeps ${Math.round(worst.keep * 100)}% of the lit colour it shows on black (needs ${KEEP * 100}%)`);
  }
  let ground, reason;
  if (kind === 'light') { ground = 0; reason = `It draws light, not dye: ${why}.`; }
  else if (kind === 'picture') { ground = 0; reason = `A picture with its own ground, not a dish on a lamp: ${why}.`; }
  else if (!worst) { ground = null; reason = 'No pair of frames on both grounds to judge.'; }
  else if (worst.change < SAME) { ground = 0; reason = `A dish (${why}), but it draws the same on both grounds (at one moment the pictures differ by ${(worst.change * 100).toFixed(1)}% on average): its own dye already draws the lamp's white, so it keeps what it ships with.`; }
  else if (fails.length) { ground = 0; reason = `A dish (${why}), but on the lamp ${fails.join('; ')}.`; }
  else { ground = 1; reason = `A dish on a lamp (${why}), and it reads there: ${Math.round(worst.lit * 100)}% lit colour, ${Math.round(worst.glare * 100)}% bare lamp, ${Math.round(worst.ink * 100)}% black at worst.`; }
  if (OWNER[id] && whole) {
    const [g, words] = OWNER[id];
    return { id, name, kind, ground: g, reason: `The owner's pick: ${words}. (The rule alone: ${ground ? 'the lamp' : 'black'}. ${reason})`, rule: ground, fails, worst, pairs };
  }
  return { id, name, kind, ground, reason, rule: ground, fails, worst, pairs };
};

/** Decode the gallery's two pictures of each moment in a page and read them
 *  pixel against pixel. Chromium decodes the JPEGs, which keeps this free of
 *  an image library; it needs no GPU, so it runs anywhere. */
const readPairs = async (index) => {
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage();
    const pixelsOf = (file) => page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = new OffscreenCanvas(240, 150);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, 240, 150);
      // Back as base64: an array of 144,000 numbers through the protocol
      // took four seconds a picture.
      const d = ctx.getImageData(0, 0, 240, 150).data;
      let bin = '';
      for (let i = 0; i < d.length; i += 8192) bin += String.fromCharCode(...d.subarray(i, i + 8192));
      return btoa(bin);
    }, `data:image/jpeg;base64,${fs.readFileSync(path.join(DIR, file)).toString('base64')}`).then((b64) => new Uint8Array(Buffer.from(b64, 'base64')));
    const out = [];
    for (const row of index) {
      const times = [...new Set(row.frames.map((f) => f.t))].sort((a, b) => a - b);
      const shots = [];
      for (const t of times) {
        const b = row.frames.find((f) => f.t === t && f.ground === 0)?.file;
        const l = row.frames.find((f) => f.t === t && f.ground === 1)?.file;
        shots.push({ t, black: b ?? null, lamp: l ?? null, px: b && l ? [await pixelsOf(b), await pixelsOf(l)] : null });
      }
      const whole = shots.filter((s) => s.px);
      const room = whole.length ? roomOf(whole.map((s) => s.px)) : null;
      const pairs = shots.map(({ t, black, lamp, px }) => {
        const reading = px ? groundPairOf(px[0], px[1], room) : null;
        return { t, black, lamp, reading: reading && Object.fromEntries(Object.entries(reading).map(([k, v]) => [k, +v.toFixed(3)])) };
      });
      out.push([row, pairs]);
    }
    return out;
  } finally { await browser.close(); }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  const verdicts = (await readPairs(index)).map(([row, pairs]) => verdictOf(row.id, row.name, pairs));
  // A look without a whole pair at every moment has no reading, and a ruling
  // made without one would read as "keep black": a gallery run with no grounds
  // (a plain `gallery` label) or with frames that failed must not look like one.
  const unread = verdicts.filter((v) => !v.worst && v.kind === 'dish');
  if (unread.length) {
    console.error(`  no pair on both grounds for ${unread.map((v) => v.id).join(', ')}: run the gallery labelled lamp-gallery (GALLERY_GROUNDS=0,1)`);
    process.exit(1);
  }
  for (const v of verdicts) {
    const w = v.worst;
    console.log(`  ${v.ground ? 'LAMP ' : 'black'}  ${v.id.padEnd(20)} ${v.kind.padEnd(7)} ${w ? `glare ${f2(w.glare)} ink ${f2(w.ink)} lit ${f2(w.lit)} keep ${f2(w.keep)} change ${f2(w.change)}` : 'no frames'}`);
    console.log(`         ${v.reason}`);
  }
  const lamp = verdicts.filter((v) => v.ground === 1).map((v) => v.id);
  console.log(`\n  on the lamp (${lamp.length} of ${verdicts.length}): ${lamp.join(', ') || 'none'}`);
  fs.writeFileSync(path.join(DIR, 'lampjudge.json'), JSON.stringify(verdicts, null, 2));
  console.log(`  wrote ${path.join(DIR, 'lampjudge.json')}`);
}
