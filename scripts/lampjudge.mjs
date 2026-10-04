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
 * each moment taken on both grounds a quarter second apart, so the two
 * pictures are the same dish).
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
 *    dye has taken all the light. So, on the lamp, at both moments
 *    (scripts/judge.mjs `groundOf`, a 240×150 read of the frame):
 *
 *      glare ≤ 0.45   at most this share of the frame is the bare lamp
 *                     (bright and colourless: clear liquid, or no dye)
 *      ink   ≤ 0.30   at most this share has gone black (dye so deep it
 *                     takes the whole lamp)
 *      lit   ≥ 0.20, and ≥ 0.6 × the same look's lit share on black
 *                     the colour survives the turn: a fifth of the frame
 *                     holds lit colour, and the lamp keeps most of what the
 *                     black ground showed
 *
 *    A dish that passes goes on the lamp. A dish that fails stays on black,
 *    with the gate it failed as its reason: glare means it wants more dye (or
 *    a fuller dish) on the lamp, ink means less (PLAN 18b-1 says a look moved
 *    to the lamp may want a lower Dye Budget); either is a change to the look,
 *    not the ground, and is written into PLAN as its own item.
 *
 * The thresholds were set before any picture was read, from what the gates
 * are for, and are not tuned to the result.
 */

import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? 'gallery';
const GLARE = 0.45, INK = 0.30, LIT = 0.20, KEEP = 0.6;

/** What each look is going for: 'dish' (liquid in a dish; to the lamp if it
 *  reads), 'light' (draws light itself) or 'picture' (a photograph or print
 *  with its own ground), and the description's words that say so. */
export const INTENT = {
  classic: ['dish', '"the 1960s overhead projector at its most meditative"'],
  galaxy: ['light', '"spiral arms of starlight swirl through the void"'],
  'deep-ocean': ['dish', '"light coming through them from below"'],
  cyberpunk: ['light', '"neon fluids": neon is light, not a filter'],
  'acid-trip': ['dish', '"under a turning colour gel": a gel is a filter on a lamp'],
  'bass-drop': ['dish', '"crimson and ultramarine thrown across ice": dye in a dish'],
  'timbre-shifter': ['dish', 'says nothing of its ground: a dish of fluid'],
  'boiling-point': ['dish', '"a cauldron at the boil": a pot of liquid'],
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
  'sunny-side-up': ['picture', '"every edge running with interference colour; the polarised-light photograph"'],
  'macro-bead': ['dish', '"one travelling bead ... on a deep sea-green ground": a dish, close up'],
  'cell-bloom': ['dish', '"paint cells ... across a magnified violet pool"'],
  'lace-run': ['dish', '"a tongue of amber dye spreading over dark red ground"'],
  'fillmore-1969': ['dish', '"the Joshua Light Show": overhead projectors'],
  'crowd-plate': ['dish', '"everyone dancing is a hand on the glass"'],
  'milk-marble': ['dish', '"a dish of milk": milk is white, which the lamp gives and black does not'],
  'soap-film': ['picture', '"one sheet of interference colour": reflected light, all but gone in transmission'],
  'glycerine-drift': ['dish', '"bands of deep dye drifting against each other"'],
  'oil-and-water': ['dish', '"amber oil on teal water between two glasses"'],
  'red-cabbage': ['dish', '"violet red-cabbage dye as a pH indicator": a dish of dye'],
  'chemical-clock': ['dish', '"the Belousov-Zhabotinsky reaction in a dish of gel"'],
  agate: ['dish', '"a reagent seeping out through a gel"'],
  'magnet-garden': ['dish', '"black ferrofluid on a bright golden pool"'],
  'home-movie': ['dish', '"a light show filmed on Super 8": a projector'],
  'clock-glass': ['dish', '"two curved clock glasses with the dye between them ... a thin bright film"'],
  'ferro-maze': ['dish', '"black ferrofluid on a white light table"'],
  'ferro-paint': ['dish', '"ferrofluid worked through amber, teal and coral dye ... bright cells of colour"'],
  roy: ['picture', '"printed as a Lichtenstein panel": ink on paper, with dense dye printed as black ink'],
};

const f2 = (v) => v.toFixed(2);

/** One look's verdict from its frames (gallery index rows). */
export const verdictOf = (row) => {
  const [kind, why] = INTENT[row.id] ?? ['dish', 'not in the intent table: a dish by default'];
  const times = [...new Set(row.frames.map((f) => f.t))].sort((a, b) => a - b);
  const pairs = times.map((t) => ({
    t,
    black: row.frames.find((f) => f.t === t && f.ground === 0)?.light,
    lamp: row.frames.find((f) => f.t === t && f.ground === 1)?.light,
  }));
  const whole = pairs.length > 0 && pairs.every((p) => p.black && p.lamp);
  const worst = whole ? {
    glare: Math.max(...pairs.map((p) => p.lamp.glare)),
    ink: Math.max(...pairs.map((p) => p.lamp.ink)),
    lit: Math.min(...pairs.map((p) => p.lamp.lit)),
    keep: Math.min(...pairs.map((p) => p.lamp.lit / Math.max(1e-3, p.black.lit))),
  } : null;
  const fails = [];
  if (worst) {
    if (worst.glare > GLARE) fails.push(`the lamp is bare over ${Math.round(worst.glare * 100)}% of the frame (limit ${GLARE * 100}%): too little dye for the lamp`);
    if (worst.ink > INK) fails.push(`${Math.round(worst.ink * 100)}% of the frame goes black (limit ${INK * 100}%): dye laid for black is too deep for the lamp`);
    if (worst.lit < LIT) fails.push(`only ${Math.round(worst.lit * 100)}% lit colour on the lamp (needs ${LIT * 100}%)`);
    if (worst.keep < KEEP) fails.push(`keeps ${Math.round(worst.keep * 100)}% of the lit colour it shows on black (needs ${KEEP * 100}%)`);
  }
  let ground, reason;
  if (kind === 'light') { ground = 0; reason = `It draws light, not dye: ${why}.`; }
  else if (kind === 'picture') { ground = 0; reason = `A picture with its own ground, not a dish on a lamp: ${why}.`; }
  else if (!worst) { ground = 0; reason = 'No pair of frames on both grounds to judge; left as it ships.'; }
  else if (fails.length) { ground = 0; reason = `A dish (${why}), but on the lamp ${fails.join('; ')}.`; }
  else { ground = 1; reason = `A dish on a lamp (${why}), and it reads there: ${Math.round(worst.lit * 100)}% lit colour, ${Math.round(worst.glare * 100)}% bare lamp, ${Math.round(worst.ink * 100)}% black at worst.`; }
  return { id: row.id, name: row.name, kind, ground, reason, fails, worst, pairs };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  const verdicts = index.map(verdictOf);
  for (const v of verdicts) {
    const w = v.worst;
    console.log(`  ${v.ground ? 'LAMP ' : 'black'}  ${v.id.padEnd(20)} ${v.kind.padEnd(7)} ${w ? `glare ${f2(w.glare)} ink ${f2(w.ink)} lit ${f2(w.lit)} keep ${f2(w.keep)}` : 'no frames'}`);
    console.log(`         ${v.reason}`);
  }
  const lamp = verdicts.filter((v) => v.ground === 1).map((v) => v.id);
  console.log(`\n  on the lamp (${lamp.length} of ${verdicts.length}): ${lamp.join(', ') || 'none'}`);
  fs.writeFileSync(path.join(DIR, 'lampjudge.json'), JSON.stringify(verdicts, null, 2));
  console.log(`  wrote ${path.join(DIR, 'lampjudge.json')}`);
}
