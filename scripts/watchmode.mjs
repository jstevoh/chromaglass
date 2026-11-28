/**
 * Liquid or general: which read a film gets (PLAN 47p-3, the owner's pick, 2026-11-28).
 *
 * The watch tool was built to judge ChromaGlass's plate against real liquid
 * light shows, and most of what it says is calibrated on them: the physics
 * read's words and its "real shows a to b" ranges, the report card's bands
 * (`REAL_SHOW_CARDS`), the technique guesses (oils, dyes, a turned dish), the
 * wet show's words (cells, marbling, a pour) and the app's "Settings to try".
 * Packaged for anyone (reelreader, PLAN 47p), it will be handed cartoons,
 * interviews and street films, and on those every one of these reads is a
 * wrong verdict said with confidence. Measured before this file, with this
 * version of the tool: Big Buck Bunny (an edited cartoon, 14 cuts a minute)
 * graded Arc 9.0/10 and Unity 8.5/10 "against the real-show calibration",
 * and a 1950s film of New York streets read as "carried: the material is
 * transported" by a flow.
 *
 * So the default is a general read in general words, and the liquid read
 * switches on only when the footage shows a liquid light show (or the page
 * says so and the footage nearly does), or when asked: `--liquid` (or
 * `--general` the other way), `{ liquid: true }` to `watchVideo`, or the
 * config's `mode`. The summary always says which it chose and the numbers
 * that chose it, so a wrong choice is visible and one flag away from fixed.
 *
 * What a liquid light show looks like in these numbers, three cues:
 *
 *   1. One take: at most 2 hard cuts a minute (dissolves do not count; the
 *      Joshua Light Show's Liquid Loops film dissolves between loops).
 *   2. The motion is the picture's own: the whole-field fit explains under
 *      half of it (a pan or a zoom moves the whole picture as one) and the
 *      picture's own flow is at least 0.3% of the width a second (a still
 *      frame, or a camera on a tripod over a quiet room, is not flowing).
 *   3. Light on a dark ground: at least 10% of the frame near black on
 *      average, and colourfulness at least 30. A show is coloured light
 *      projected in a dark room; daylight, a lit set or a cartoon sky is not.
 *
 * All three, or a page naming a liquid technique (an overhead projector,
 * mineral oil, food dye, ferrofluid: `scanTechniques` in watchphysics.mjs)
 * and two of them.
 *
 * Where the bars sit, measured 2026-11-28 (4 to 10 samples a second, 15 to
 * 60 s each; `npm run watchmode` holds these rows):
 *
 *   liquid            hard cuts/min  whole  own   near black  colourfulness
 *   JLS Liquid Loops  0, 0           .14    8.4, 3.8  .14, .41   98, 85
 *   glow ink in water 0              .41    3.0   .58         109
 *   the app, 2 takes  0, 0           .21-.23 4.0, .65 .50, .41  106, 124
 *   Bill Ham (card)   –              –      –     .14         136
 *   JLS Fillmore (card) –            –      –     .35         35
 *
 *   general
 *   Big Buck Bunny    14, 14         .21    .95, 1.1  .02, .07   59, 51
 *   Sintel trailer    10             .53    3.5   .42          9
 *   New York streets  0, 0           .91, .98 2.5, .43 .00     5, 4
 *   an interview      6              .89    .43   .04          37
 *
 * Each general film fails at least two cues; each liquid one passes all
 * three. The near-black bar is the tightest: the real shows' lowest is 0.14
 * (Bill Ham, Liquid Loops' first minute), the general films' highest that
 * also has colour is 0.07. The colourfulness bar sits under the Fillmore
 * film's 35 (an old print, washed) and over the interview's and the street
 * film's; Sintel's dark frames pass the near-black cue and fail this one.
 * Black-and-white ink in water (cut, 8 a minute, colourfulness 0) reads
 * general: it is a liquid, but not a light show, and the card's bands are a
 * light show's. `--liquid` reads it as one.
 *
 * What this does not do: tell a liquid show from any other continuous,
 * colourful, dark-ground footage with its own motion (a night street with
 * neon on a tripod, a VJ loop, a fish tank). Those read liquid. The summary
 * says why, and `--general` reads them as general.
 */

import { scanTechniques } from './watchphysics.mjs';

export const MAX_CUTS_PER_MIN = 2;
export const MAX_WHOLE_SHARE = 0.5;
export const MIN_OWN_FLOW = 0.3;
export const MIN_NEAR_BLACK = 0.1;
export const MIN_COLOURFULNESS = 30;
/** The technique families in a page that say liquid (not "heat", "milk" or "bubbles": a cooking video). */
export const LIQUID_FAMILIES = ['liquid light rig', 'oils and water', 'dyes and inks', 'magnetism'];

const num = x => (x != null && Number.isFinite(x) ? x : null);
const f = (x, d = 1) => (x == null ? '–' : x.toFixed(d));
const pct = x => (x == null ? '–' : `${(x * 100).toFixed(0)}%`);

/**
 * The three cues from a film's numbers: `{ cutsPerMin (hard cuts only),
 * wholeShare, own, black, colourfulness }`, any of them null when not read.
 */
export function liquidCues(m) {
  const cuts = num(m.cutsPerMin), whole = num(m.wholeShare), own = num(m.own), black = num(m.black), colour = num(m.colourfulness);
  return [
    { key: 'take', ok: cuts != null && cuts <= MAX_CUTS_PER_MIN,
      yes: `one take (${f(cuts)} hard cuts a minute)`,
      no: cuts == null ? 'no cut count' : `${f(cuts)} hard cuts a minute (a show is one take, at most ${MAX_CUTS_PER_MIN})` },
    { key: 'own', ok: whole != null && own != null && whole < MAX_WHOLE_SHARE && own >= MIN_OWN_FLOW,
      yes: `the motion the picture's own (whole-field ${pct(whole)}, own flow ${f(own, 2)}% of the width a second)`,
      no: whole == null || own == null ? 'no flow read'
        : whole >= MAX_WHOLE_SHARE ? `the whole picture moving as one (${pct(whole)} of the motion: a camera pan, zoom or roll)`
          : `little motion of its own (${f(own, 2)}% of the width a second, under ${MIN_OWN_FLOW})` },
    { key: 'light', ok: black != null && colour != null && black >= MIN_NEAR_BLACK && colour >= MIN_COLOURFULNESS,
      yes: `coloured light on a dark ground (${pct(black)} near black, colourfulness ${f(colour, 0)})`,
      no: black == null || colour == null ? 'no light read'
        : black < MIN_NEAR_BLACK ? `${pct(black)} of the frame near black (a projected show sits on a dark ground, at least ${pct(MIN_NEAR_BLACK)})`
          : `colourfulness ${f(colour, 0)} (a show is coloured light, at least ${MIN_COLOURFULNESS})` },
  ];
}

/**
 * Words of those families too common outside a liquid show to count alone:
 * a bare "ink" is a squid-ink sauce or a tattoo, "dye" tie-dye, "acrylic" a
 * painting tutorial (npm run watchmode (b), the cooking page). "Food colour",
 * "alcohol ink" and "fluid art" still count.
 */
const WEAK_WORDS = new Set(['ink', 'inks', 'dye', 'dyes', 'acrylic', 'watercolor', 'watercolour']);

/** The page's liquid technique words (title, description, tags), or []. */
export function liquidPageWords(info) {
  return scanTechniques(info).filter(h => LIQUID_FAMILIES.includes(h.family)).flatMap(h => h.words).filter(w => !WEAK_WORDS.has(w));
}

/**
 * Which read a film gets. `forced` is true, false or null (the flag, the
 * option or the config's mode, in that order, already resolved by the
 * caller); `m` the cue numbers; `info` the page, if any. Returns
 * `{ liquid, how, cues, page, line }`, `line` the sentence for the summary.
 */
export function readMode({ forced = null, how = null, m = {}, info = null } = {}) {
  const cues = liquidCues(m);
  const page = liquidPageWords(info);
  const passed = cues.filter(c => c.ok).length;
  let liquid, by;
  if (forced === true || forced === false) { liquid = forced; by = how ?? 'flag'; }
  else if (passed === cues.length) { liquid = true; by = 'footage'; }
  else if (page.length && passed >= cues.length - 1) { liquid = true; by = 'page'; }
  else { liquid = false; by = 'footage'; }
  const yes = cues.filter(c => c.ok).map(c => c.yes), no = cues.filter(c => !c.ok).map(c => c.no);
  const pageText = page.length ? `the page says ${page.slice(0, 4).map(w => `"${w}"`).join(', ')}` : '';
  let line;
  if (by !== 'footage' && by !== 'page') {
    line = liquid
      ? `Read as liquid footage, as asked (${by}). The footage itself: ${[...yes, ...no].join('; ')}.`
      : `Read as general footage, as asked (${by}): no physics read, report card, technique guesses or liquid words.`;
  } else if (liquid) {
    line = `Read as liquid footage: ${[...(by === 'page' ? [pageText] : []), ...yes].join('; ')}${no.length ? `; though ${no.join('; ')}` : ''}. \`--general\` reads it as general footage.`;
  } else {
    line = `Read as general footage, not a liquid light show: ${no.join('; ')}${pageText ? `, though ${pageText}` : ''}. So no physics read, report card, technique guesses or liquid words; \`--liquid\` reads it as liquid footage.`;
  }
  return { liquid, how: by, cues: cues.map(c => ({ key: c.key, ok: c.ok })), page, line };
}

/** The cue numbers from watch()'s reads. */
export function cueNumbers({ rows, cuts, span, shape, design, physics }) {
  const hard = (cuts ?? []).filter(k => !rows?.[k]?.dissolve).length;
  return {
    cutsPerMin: span > 0 ? hard / Math.max(1 / 60, span / 60) : null,
    wholeShare: physics?.tooShort ? null : num(physics?.wholeShare),
    own: physics?.tooShort ? null : num(physics?.own?.med),
    black: num(shape?.black?.mean),
    colourfulness: num(design?.colourfulness?.med),
  };
}

const band = (x, cuts) => { if (x == null) return ''; for (const [lim, w] of cuts) if (x < lim) return w; return cuts.at(-1)[1]; };

/**
 * The motion section for general footage, in place of the physics read:
 * how fast things move on screen, how much of it the camera is, zoom, roll,
 * how long a view holds, and how fine the detail is, in words a film editor
 * or a colourist would use and with no liquid ranges beside them. The
 * numbers are the physics read's own (watchphysics.mjs), so a `--liquid`
 * read of the same film agrees with these.
 */
export function generalMotionLines(p) {
  const lines = ['## Motion', '', `From ${p.pairs ?? 0} sample pairs; speeds in % of the frame's width a second. Definitions: \`scripts/watchphysics.mjs\`.`, ''];
  if (!p.tooShort) {
    const speed = num(p.speed?.med), whole = num(p.wholeShare), cam = num(p.cameraShare), curl = num(p.curl?.med), dv = num(p.div?.med), vert = num(p.vertical);
    lines.push(`- **on-screen speed**: median ${f(speed, 1)}, 90th ${f(num(p.speed?.p90), 1)}: ${band(speed, [[0.5, 'nearly still'], [2, 'slow'], [6, 'moderate'], [15, 'quick'], [Infinity, 'fast']])}`);
    lines.push(`- **the whole picture moving** (a camera pan, tilt, zoom or roll): ${pct(whole)} of the motion${cam != null ? `, a straight pan ${pct(cam)}` : ''}: ${band(whole, [[0.25, 'mostly things moving in a still frame'], [0.5, 'part camera, part things moving'], [Infinity, 'mostly the camera moving']])}`);
    const period = curl && Math.abs(curl) > 0.01 ? (4 * Math.PI) / Math.abs(curl) : null;
    lines.push(`- **roll**: ${period != null && period < 120 ? `the picture turns ${curl < 0 ? 'anticlockwise' : 'clockwise'}, about once in ${f(period, 0)} s (a camera roll, or something turning)` : 'no steady turn'}`);
    lines.push(`- **zoom**: ${dv == null ? '–' : dv > 0.02 ? `opening outwards (${f(dv, 3)}/s: a zoom in, a push in, or things coming closer)` : dv < -0.02 ? `drawing in (${f(dv, 3)}/s: a zoom out, a pull back, or things moving away)` : 'none steady'}`);
    lines.push(`- **drift**: ${vert == null || Math.abs(vert) < 0.3 ? 'no steady drift up or down' : `${vert > 0 ? 'down' : 'up'} ${f(Math.abs(vert), 1)}% of the width a second (a tilt, or things falling or rising)`}`);
  } else {
    lines.push(`- the crop is too short for the motion read (${p.rows} rows; use a crop at least a fifth as tall as it is wide)`);
  }
  const life = num(p.lifetime), sl = p.spectrum?.reliable === false ? null : num(p.spectrum?.med);
  lines.push(`- **how long a view holds**: ${life != null ? `about ${f(life, 1)} s before the picture is half unlike itself` : `longer than the clip (longest shot ${f(num(p.longestShot), 0)} s)`}`);
  lines.push(`- **detail**: ${p.spectrum?.reliable === false ? 'unreliable (compression)' : sl == null ? '–' : `spectrum slope ${f(sl, 2)}: ${band(sl, [[-2.8, 'soft: smooth areas, little fine detail'], [-1.8, 'detail at every scale'], [Infinity, 'crisp: fine texture and sharp detail all the way down']])}`}`);
  return lines;
}
