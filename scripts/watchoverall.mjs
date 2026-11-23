/**
 * The whole film in a few sentences: how the show felt overall (PLAN 47x-8).
 *
 * What was asked (the owner, 2026-11-22, after reading the first before/after
 * reads): "describe the overall flow as well, not just the moment to moment
 * changes. How did the light show feel overall?" The words in
 * `watchwords.mjs` name the film's character one measure at a time, and the
 * diff lists what moved; neither says what a person leaving the room would
 * say: it built slowly to one big moment and then let go, or it held one
 * calm mood the whole way, on a dark ground in two neighbouring hues.
 *
 * So this reads the arc from the per-sample rows `watchVideo` already keeps,
 * not from the medians the words use: the motion in thirds of the film (does
 * it build, settle, swell in the middle, dip, hold), where its strongest
 * moment falls and how far above the usual it stands, its longest rest, how
 * even or surging it moves, whether the light and colour drift across the
 * film, how often the palette reorganises, and whether the motion goes with
 * the music. The character sentence is the words' own terms, rephrased into
 * one line, so it can never say something the words did not.
 *
 * Why thirds and not a fitted curve: a person describes an arc in beginning,
 * middle and end, and a slope fit calls a swell in the middle "flat". Why a
 * 1.4x rise between the first and last third to call it building: the drift
 * test clips, which hold one motion, read their thirds within 10% of each
 * other, and the app's own takes of a held look within about 25%; 1.4x is past
 * both, the same order as the 1.5x just-noticeable step the diff uses for
 * ratio measures. The peak is called out only past 1.8x the median, the same
 * bar `shape()` uses for a swell.
 *
 * Plain functions over the rows; nothing here runs in the app.
 */

const STILL = 0.1;   // the same still floor as `shape()` in watch.mjs: under it at the median, there is no arc

const median = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const mean = a => { const s = a.filter(Number.isFinite); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : NaN; };
const stamp = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const joinAnd = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const where = share => (share < 0.2 ? 'near the start' : share < 0.4 ? 'about a third of the way in'
  : share < 0.6 ? 'about halfway' : share < 0.8 ? 'about two thirds through' : 'near the end');
const times = x => (x < 2.5 ? 'about twice' : x < 3.5 ? 'about three times' : x < 5 ? 'about four times' : 'many times');

// The words' terms as a person would say them in one line about the look.
const LOOK = {
  greyed: 'greyed colour', muted: 'muted colour', 'of hue': 'several hues set against each other',
  complementary: 'complementary colours', analogous: 'neighbouring hues', 'cold-warm': 'warm against cold',
  'light-dark': 'light against dark', 'of saturation': 'bright colour against dull', 'of extension': 'one colour holding most of the frame',
  'dark-ground': 'a dark ground', luminous: 'a luminous glow', washed: 'a washed-out light', chiaroscuro: 'strong light and shadow',
  'hard-edged': 'hard edges', soft: 'soft edges', painterly: 'painterly edges',
  marbling: 'marbling', threads: 'threads', lobes: 'lobes', beads: 'beads', cells: 'cells', wash: 'a wash of colour',
  fine: 'fine detail', broad: 'broad shapes',
  'all-over': 'filling the frame', centred: 'centred', 'off-centre': 'set off centre', kaleidoscopic: 'kaleidoscopic',
  symmetric: 'symmetric', axis: 'laid along an axis',
  bloom: 'blooms opening', 'turned dish': 'a turning dish', pour: 'pours',
};
const LOOK_AREAS = ['colour', 'light', 'edges', 'form', 'composition', 'show'];

const ARC = {
  still: 'barely moves from start to end',
  holds: 'holds one steady pace from start to end',
  builds: 'builds, starting quiet and gathering toward the end',
  settles: 'settles, starting busy and easing off toward the end',
  swells: 'swells in the middle and eases off again',
  dips: 'eases off in the middle and comes back',
  wanders: 'rises and falls with no clear direction',
};

/**
 * Read the whole film's arc and character from `watchVideo`'s return object.
 * Returns `{ lines, arc }`: `lines` the sentences for "## Overall", `arc` the
 * numbers behind them for `compareOverall`.
 */
export function overall(read) {
  const rows = Array.isArray(read?.rows) ? read.rows : [];
  const rate = read?.rate || 4;
  const n = rows.length;
  const words = read?.words?.words ?? [];
  const arc = { shape: null, thirds: null, peakAt: null, peakShare: null, peakOver: null, rest: null, restAt: null,
    surge: null, lumTrend: null, colourTrend: null, reorg: null, sync: null, effort: null };
  const sentences = [];

  // The character: Laban's effort when all three factors were clear, else what of Time and Weight was.
  const w = area => words.find(x => x.area === area);
  const effort = w('effort');
  if (effort) { arc.effort = effort.term; sentences.push(`It moves like a ${effort.term}: ${effort.text.split(': ')[1].split(' (')[0]}.`); }
  else {
    const tw = [w('time'), w('weight'), w('space')].filter(Boolean).map(x => x.term);
    if (tw.length) sentences.push(`Its motion reads ${joinAnd(tw)}.`);
  }

  const m = rows.map((r, k) => (k === 0 || r.cut || r.fade ? NaN : r.motion));
  const med = median(m);
  if (n < 8 || !Number.isFinite(med)) {
    arc.shape = null;
  } else if (med < STILL) {
    arc.shape = 'still';
    sentences.push(`Across the film it ${ARC.still}.`);
  } else {
    // A 1.25 s smoothing, the window `shape()` finds swells in, so one codec blip is not the peak.
    const hw = Math.round(1.25 * rate) >> 1;
    const sm = m.map((_, i) => mean(m.slice(Math.max(0, i - hw), Math.min(n, i + hw + 1))));
    const third = k => mean(m.slice(Math.floor((k * n) / 3), Math.floor(((k + 1) * n) / 3)));
    const [a, b, c] = [third(0), third(1), third(2)];
    const mu = mean(m);
    arc.thirds = [a, b, c].map(x => x / mu);
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c);
    if ((hi - lo) / mu < 0.3) arc.shape = 'holds';
    else if (c >= 1.4 * a && b >= 0.9 * a) arc.shape = 'builds';
    else if (a >= 1.4 * c && b <= 1.1 * a) arc.shape = 'settles';
    else if (b >= 1.25 * Math.max(a, c)) arc.shape = 'swells';
    else if (b * 1.25 <= Math.min(a, c)) arc.shape = 'dips';
    else arc.shape = 'wanders';

    // How it moves within the arc: even, or in surges (the spread of the smoothed motion over its mean).
    const smMu = mean(sm);
    const sd = Math.sqrt(mean(sm.map(x => (x - smMu) ** 2)));
    arc.surge = sd / smMu;
    // "Evenly" is said only of a film that builds or settles: beside "holds one steady pace" it says
    // the same thing twice, and beside "rises and falls" it contradicts it (the first real-pair run
    // printed "moves unevenly, with no clear direction, evenly").
    const manner = arc.surge > 0.6 ? ', in surges'
      : arc.surge < 0.25 && (arc.shape === 'builds' || arc.shape === 'settles') ? ', steadily' : '';
    sentences.push(`Across the film it ${ARC[arc.shape]}${manner}.`);

    // The peak is looked for only where the smoothing window is whole. At either end the window
    // holds half as many samples, so one blip weighs twice as much: the classic closeup's first
    // run named its strongest moment "near the start, at 0:00" from a light flicker as the take
    // began (motion 9.1 at 0.2 s against a median near 2).
    let pk = -1;
    sm.forEach((x, i) => { if (i >= hw && i < n - hw && Number.isFinite(x) && (pk < 0 || x > sm[pk])) pk = i; });
    const smMed = median(sm);
    if (pk >= 0) {
      arc.peakAt = rows[pk].t; arc.peakShare = pk / Math.max(1, n - 1); arc.peakOver = sm[pk] / smMed;
      if (arc.peakOver >= 1.8) sentences.push(`Its strongest moment comes ${where(arc.peakShare)}, at ${stamp(arc.peakAt)}, ${times(arc.peakOver)} the usual motion.`);
      else sentences.push('No one moment stands far above the rest.');
    }

    // The longest rest: a run under a third of the 90th percentile, the bar `shape()` calls calm.
    const p90 = [...m].filter(Number.isFinite).sort((x, y) => x - y)[Math.floor(0.9 * m.filter(Number.isFinite).length)];
    let run = 0, best = 0, bestEnd = -1;
    sm.forEach((x, i) => { if (x < p90 / 3) { run++; if (run > best) { best = run; bestEnd = i; } } else run = 0; });
    if (best / rate >= 2) {
      arc.rest = best / rate; arc.restAt = rows[bestEnd - best + 1].t;
      sentences.push(`It rests longest at ${stamp(arc.restAt)}, for ${Math.round(arc.rest)} s.`);
    }
  }

  // The light and the colour across the film: first third against last, in the diff's own steps
  // (mean luminance 0.08, coloured share 0.15).
  if (n >= 8) {
    const part = (f, k) => mean(rows.slice(Math.floor((k * n) / 3), Math.floor(((k + 1) * n) / 3)).map(f));
    const dl = part(r => r.lum, 2) - part(r => r.lum, 0);
    const dc = part(r => r.colour, 2) - part(r => r.colour, 0);
    arc.lumTrend = dl; arc.colourTrend = dc;
    const drift = [];
    if (Math.abs(dl) >= 0.08) drift.push(dl > 0 ? 'brightens' : 'darkens');
    if (Math.abs(dc) >= 0.15) drift.push(dc > 0 ? 'fills with more colour' : 'loses colour');
    if (drift.length) sentences.push(`From start to end it ${joinAnd(drift)}.`);
  }
  const reorg = read?.shape?.reorgAt;
  if (Array.isArray(reorg)) {
    arc.reorg = reorg.length;
    sentences.push(reorg.length === 0 ? 'The palette and layout hold from start to end.'
      : reorg.length === 1 ? `The picture reorganises once, at ${stamp(reorg[0])}.`
        : `The picture reorganises ${reorg.length} times, first at ${stamp(reorg[0])}.`);
  }

  // The music: the best lagged correlation `watchVideo` already found, when there was sound.
  const s = read?.sync;
  if (s && Number.isFinite(s.best)) {
    arc.sync = s.best;
    sentences.push(s.best >= 0.4 ? `The motion goes with the music (r ${s.best.toFixed(2)}).`
      : s.best < 0.2 ? `The motion keeps its own time, apart from the music (r ${s.best.toFixed(2)}).`
        : `The motion follows the music loosely (r ${s.best.toFixed(2)}).`);
  }

  const look = LOOK_AREAS.flatMap(area => words.filter(x => x.area === area).map(x => LOOK[x.term]).filter(Boolean));
  if (look.length) sentences.push(`The look: ${joinAnd(look)}.`);

  const steadyNote = sentences.length
    ? ['', "The swells, rests and peak come from one take and may vary from take to take; the look and the light's drift hold."] : [];
  return { lines: sentences.length ? [sentences.join(' '), ...steadyNote] : ['Too short or too still to read an arc.'], arc };
}

/**
 * How the overall feel changed between two reads: the arc, where the
 * strongest moment fell, the effort, the music. Returns a list of sentences
 * (an empty list when nothing overall moved).
 */
export function compareOverall(before, after, { effortNearEdge = false } = {}) {
  const b = before?.arc ?? before, a = after?.arc ?? after;
  const out = [];
  if (!b || !a) return out;
  if (b.shape && a.shape && b.shape !== a.shape) out.push(`The arc changed: before, the film ${ARC[b.shape]}; after, it ${ARC[a.shape]}.`);
  else if (b.shape && a.shape) out.push(`The arc held: before and after, the film ${ARC[a.shape]}.`);
  // The character is Laban's three factors together, so when one of their words is only near its
  // edge (47x-5) a new or lost effort is that flicker again: the cell bloom's after read called it
  // "a clear float" from a light weight and an indirect space that both moved under a step.
  if (effortNearEdge) { /* the effort words differ only at an edge: not a change of feel */ }
  else if (b.effort && a.effort && b.effort !== a.effort) out.push(`The feel went from a ${b.effort} to a ${a.effort}.`);
  else if (!b.effort && a.effort) out.push(`After, the motion reads as a clear ${a.effort}.`);
  else if (b.effort && !a.effort) out.push(`After, the motion no longer reads as a clear ${b.effort}.`);
  const strong = x => x.peakOver != null && x.peakOver >= 1.8;
  if (strong(b) && strong(a) && Math.abs(a.peakShare - b.peakShare) >= 0.25) out.push(`The strongest moment moved from ${where(b.peakShare)} to ${where(a.peakShare)}.`);
  else if (strong(b) && !strong(a)) out.push('After, no one moment stands far above the rest.');
  else if (!strong(b) && strong(a)) out.push(`After, one moment stands out, ${where(a.peakShare)}.`);
  if (b.surge != null && a.surge != null && (b.surge > 0.6) !== (a.surge > 0.6)) out.push(a.surge > 0.6 ? 'After, it moves in surges.' : 'After, it moves more evenly.');
  if (b.sync != null && a.sync != null && Math.abs(a.sync - b.sync) >= 0.2) out.push(a.sync > b.sync ? 'After, the motion goes more with the music.' : 'After, the motion goes less with the music.');
  return out;
}
