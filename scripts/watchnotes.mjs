/**
 * What a person's rating notes keep saying (PLAN 47p-5; the owner,
 * 2026-11-28: open-ended feedback should count).
 *
 * A mark says how much someone liked a clip; the note says why, and a note
 * pinned to a moment ("froze" at 0:12) says where. Read one at a time they
 * explain a disagreement; read across a whole rating round they show what
 * the tool does not measure yet. When "drained" turns up on four clips, all
 * rated low, the tool is missing a fault a person sees, and that is the list
 * of fault checks worth building next.
 *
 * How the themes are found. Plain words, no model: the notes and moment
 * notes of every rated clip are split into words, folded to a stem (a few
 * English endings), stop words dropped, and words that mean one fault are
 * folded to its name (froze, frozen, stuck, stalls → freezes), from a short
 * list of the faults people name in moving pictures. A theme is a stem or a
 * fault named on at least two clips; it is counted once a clip however often
 * one note repeats it, since what matters is on how many clips it came up.
 * Each theme carries the mean mark of the clips that name it against the
 * rest, so a theme that rides with low marks stands out from one that is
 * just a common word.
 *
 * A theme is a candidate fault check when it is a named fault on at least
 * FAULT_CLIPS clips, or any theme on at least FAULT_CLIPS clips (and a
 * quarter of them) whose clips are rated at least one mark under the rest.
 * It is a candidate only: Claude reads the moments it was pinned to before
 * calling anything a fault.
 */

export const FAULT_CLIPS = 3;

/** Words that name one fault, folded to the fault's name. */
export const FAULTS = {
  freezes: ['froze', 'frozen', 'freeze', 'freezes', 'freezing', 'stuck', 'stall', 'stalls', 'stalled', 'stops', 'stopped', 'paused', 'hangs'],
  drained: ['drained', 'drain', 'drains', 'draining', 'empty', 'emptied', 'empties', 'washed-out', 'faded'],
  'whole picture turns': ['turns', 'turning', 'spin', 'spins', 'spinning', 'rotates', 'rotating', 'rotation', 'rotate', 'swirls-whole'],
  flicker: ['flicker', 'flickers', 'flickering', 'flash', 'flashes', 'flashing', 'strobe', 'strobing'],
  jitter: ['jitter', 'jittery', 'stutter', 'stutters', 'stuttering', 'judder', 'judders', 'choppy', 'jerky', 'janky'],
  seam: ['seam', 'seams', 'edge-line', 'hard-line', 'banding', 'banded'],
  halo: ['halo', 'halos', 'haloes', 'ring', 'rings', 'flower'],
  soft: ['blur', 'blurry', 'blurred', 'soft', 'smeared', 'smeary', 'mushy', 'fuzzy'],
  muddy: ['mud', 'muddy', 'murky', 'grey', 'gray', 'greyish', 'brown', 'dull-colour'],
  'too dark': ['dark', 'dim', 'murk', 'underexposed'],
  'blown out': ['blown', 'clipped', 'overexposed', 'glare'],
  monotonous: ['repetitive', 'repeats', 'repeating', 'samey', 'monotonous', 'boring', 'static', 'nothing-happens'],
};
const FAULT_OF = new Map(Object.entries(FAULTS).flatMap(([name, ws]) => ws.map(w => [w, name])));

const STOP = new Set(('a an and are as at be but by for from has have i in is it its it\'s of on or so that the this to too was were with very not no '
  + 'just bit lot more less much some all one than then there their them they what when where which who why how also again really quite '
  + 'like looks look looking seems feel feels clip film video here these those into over under out up down about after before while my me '
  + 'can could would should will its thats dont doesnt isnt nice good bad ok okay').split(/\s+/));

/** A word's stem: lower case, and a few English endings off, so "swirling" and "swirls" meet. */
export function stem(w) {
  let s = w.toLowerCase().replace(/[^a-z'-]/g, '').replace(/'s$/, '').replace(/'/g, '');
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('es')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  return s;
}

/** The themes of one text: fault names first (whole words, and two-word phrases joined by a dash), then stems. */
export function textThemes(text) {
  const words = String(text ?? '').toLowerCase().split(/[^a-z'-]+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/'/g, ''), pair = i + 1 < words.length ? `${w}-${words[i + 1]}` : null;
    const fault = (pair && FAULT_OF.get(pair)) || FAULT_OF.get(w);
    if (fault) { out.add(fault); continue; }
    const s = stem(w);
    if (s.length >= 4 && !STOP.has(w) && !STOP.has(s)) out.add(s);
  }
  return out;
}

const stamp = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/**
 * The themes across a ratings object: [{ theme, fault, clips: [key], moments:
 * [{ key, t, note }], mean, rest, candidate }], most clips first. `mean` is the
 * mean overall mark of the clips naming it, `rest` of the other rated clips.
 */
export function noteThemes(ratings, { minClips = 2, faultClips = FAULT_CLIPS } = {}) {
  const entries = Object.entries(ratings ?? {}).filter(([, e]) => e && typeof e === 'object');
  const byTheme = new Map();
  for (const [key, e] of entries) {
    const texts = [{ text: e.note, t: null }, ...(Array.isArray(e.moments) ? e.moments.map(m => ({ text: m.note, t: Number(m.t) })) : [])];
    for (const { text, t } of texts) {
      for (const th of textThemes(text)) {
        const x = byTheme.get(th) ?? { theme: th, fault: Object.hasOwn(FAULTS, th), clips: new Set(), moments: [] };
        x.clips.add(key);
        if (t != null && Number.isFinite(t)) x.moments.push({ key, t, note: text });
        byTheme.set(th, x);
      }
    }
  }
  const marks = new Map(entries.filter(([, e]) => typeof e.overall === 'number').map(([k, e]) => [k, e.overall]));
  const meanOf = keys => { const v = keys.filter(k => marks.has(k)).map(k => marks.get(k)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const themes = [];
  for (const x of byTheme.values()) {
    if (x.clips.size < minClips) continue;
    const clips = [...x.clips], mean = meanOf(clips), rest = meanOf([...marks.keys()].filter(k => !x.clips.has(k)));
    const low = mean != null && rest != null && rest - mean >= 1;
    const candidate = clips.length >= faultClips && (x.fault || (low && clips.length >= entries.length / 4));
    themes.push({ theme: x.theme, fault: x.fault, clips, moments: x.moments.sort((a, b) => a.key.localeCompare(b.key) || a.t - b.t), mean, rest, candidate });
  }
  return themes.sort((a, b) => b.clips.length - a.clips.length || (b.fault - a.fault) || a.theme.localeCompare(b.theme));
}

/** The themes as lines for batch.md and the command line. */
export function themeLines(themes, { max = 12 } = {}) {
  if (!themes.length) return ['Nothing comes up in the notes on more than one clip yet.'];
  return themes.slice(0, max).map(t => {
    const where = t.moments.length ? `; pinned at ${t.moments.slice(0, 4).map(m => `${m.key} ${stamp(m.t)}`).join(', ')}${t.moments.length > 4 ? ', …' : ''}` : '';
    const marks = t.mean != null && t.rest != null ? `, rated ${t.mean.toFixed(1)} against ${t.rest.toFixed(1)} for the rest` : '';
    return `- **${t.theme}** on ${t.clips.length} clips (${t.clips.slice(0, 5).join(', ')}${t.clips.length > 5 ? ', …' : ''})${marks}${where}${t.candidate ? ': candidate fault check' : ''}`;
  });
}

/** A clip's themes for its row in the batch table: the ones that recur, most-shared first. */
export function clipThemes(themes, key, max = 3) {
  return themes.filter(t => t.clips.includes(key)).slice(0, max).map(t => t.theme);
}
