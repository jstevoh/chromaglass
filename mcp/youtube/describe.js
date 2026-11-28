/**
 * The words that go up with a video: its description put together from the
 * person's text, a chapter list and the credits line, and its titles and
 * descriptions in other languages (PLAN 44i-2b). Pure: no file, no network.
 *
 * What was asked. The owner's films carry music under CC BY, and the credit
 * line was typed into each description by hand, which is how an upload goes
 * out uncredited the one time it is forgotten. A film with several pieces in
 * it (an album, a set) needs chapters, and YouTube makes chapters only from
 * timestamps written in the description, under rules it applies silently: the
 * first at 0:00, at least three, in order, each at least ten seconds long. A
 * list that breaks one of them is simply not made into chapters, and nobody
 * finds out until a viewer looks for them. So both are built here, from a
 * list or the upload card and from `settings.json`, and a list that would not
 * become chapters is refused before anything is sent, with the rule it broke.
 *
 * The description is three blocks, in this order, each left out when empty:
 * the person's own text, the chapter list, the credits line. Putting it
 * together again never stacks a second copy: a chapter list replaces the one
 * already in the text (a re-render with new timings, `update_video` with new
 * chapters), and a credits line the text already holds (a replacement carries
 * the old description, credits and all) is moved to the foot, not repeated.
 *
 * Why the credits line is a template. CC BY asks for the title of the piece,
 * not only the artist ("[Title] by Scott Buckley – released under CC-BY 4.0"
 * is the artist's own wording), and the title changes with every film. So the
 * line in settings may hold `{music}`, filled from the upload's `music`; an
 * upload under such a line that names no music is refused, since a credit
 * with a hole in it is the uncredited upload this exists to stop. A film with
 * other music passes its own `credits` line, or `credits: false` for none.
 *
 * YouTube's limits, from the API's own pages (2026-11-28): a title is at most
 * 100 characters, a description at most 5,000 bytes, and neither may hold `<`
 * or `>` (the request is refused as invalid). Checked here so a long chapter
 * list fails at the call, not hours later in the queue's drain.
 */

export const DESCRIPTION_BYTES = 5000;
export const TITLE_CHARS = 100;
const ANGLE = /[<>]/;

/** Seconds from `75`, `"1:15"` or `"1:02:03"`; NaN when it is none of those. */
export function parseTime(at) {
  if (typeof at === 'number') return Number.isFinite(at) && at >= 0 ? Math.floor(at) : NaN;
  const m = /^\s*(?:(\d+):)?(\d{1,2}):(\d{2})\s*$/.exec(String(at ?? ''));
  if (!m) return NaN;
  const [h, mi, s] = [Number(m[1] ?? 0), Number(m[2]), Number(m[3])];
  if (s > 59 || (m[1] !== undefined && mi > 59)) return NaN;
  return h * 3600 + mi * 60 + s;
}

/** How YouTube writes a timestamp: `0:00`, `4:05`, `1:02:03`. */
export function formatTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/* A line that is a chapter: a timestamp first, then the chapter's name. */
const CHAPTER_LINE = /^\s*(\d+(?::\d{1,2}){1,2})\s+[-–—:|]?\s*(.+?)\s*$/;

/**
 * A chapter list from what a call or a card may give: an array of
 * `{ at, title }` (at in seconds or as `m:ss`), an array of `"0:00 Intro"`
 * lines, or one string of such lines. Throws with the rule a list breaks.
 * `durationSec`, when known (an update, the video's own length), also holds
 * the last chapter to ten seconds before the end.
 */
export function parseChapters(raw, durationSec) {
  if (raw === undefined || raw === null) return null;
  let items = raw;
  if (typeof raw === 'string') items = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!Array.isArray(items)) throw new Error('chapters is a list of { at, title }, or of lines like "0:00 Intro".');
  const list = items.map((it, i) => {
    let at, title;
    if (typeof it === 'string') {
      const m = CHAPTER_LINE.exec(it);
      if (!m) throw new Error(`chapter ${i + 1} ("${it}") is not a time and a name, like "1:30 The second piece".`);
      [at, title] = [parseTime(m[1]), m[2]];
    } else if (it && typeof it === 'object') {
      [at, title] = [parseTime(it.at), String(it.title ?? '').trim()];
    } else throw new Error(`chapter ${i + 1} is neither a line nor { at, title }.`);
    if (Number.isNaN(at)) throw new Error(`chapter ${i + 1} has no time YouTube reads (seconds, or m:ss, or h:mm:ss).`);
    if (!title) throw new Error(`chapter ${i + 1} has no name.`);
    if (ANGLE.test(title)) throw new Error(`chapter ${i + 1}'s name holds < or >, which YouTube refuses in a description.`);
    return { at, title };
  });
  if (!list.length) return null;
  /* YouTube's rules for chapters (its help page "Video chapters", 2026-11-28). */
  if (list[0].at !== 0) throw new Error('The first chapter must start at 0:00, or YouTube makes no chapters at all.');
  if (list.length < 3) throw new Error('YouTube makes chapters only from three or more timestamps.');
  for (let i = 1; i < list.length; i++) {
    if (list[i].at - list[i - 1].at < 10) throw new Error(`Chapter ${i + 1} (${formatTime(list[i].at)}) starts less than ten seconds after the one before; YouTube needs each chapter ten seconds or longer, in order.`);
  }
  /* YouTube reports P0D for a video still processing (and a live one): a length of nothing is not known, not zero. */
  if (Number.isFinite(durationSec) && durationSec > 0 && durationSec - list[list.length - 1].at < 10) {
    throw new Error(`The last chapter (${formatTime(list[list.length - 1].at)}) starts less than ten seconds before the video ends (${formatTime(durationSec)}).`);
  }
  return list;
}

export const chapterBlock = (list) => list.map((c) => `${formatTime(c.at)} ${c.title}`).join('\n');

/**
 * The text without its chapter list: the run of timestamp lines that starts
 * at a 0:00 line, as YouTube reads it. A timestamp elsewhere in the prose
 * ("the bloom at 2:10 ...") does not start at 0:00 and is left alone.
 */
export function stripChapters(text) {
  const lines = String(text ?? '').split('\n');
  const start = lines.findIndex((l) => { const m = CHAPTER_LINE.exec(l); return m && parseTime(m[1]) === 0; });
  if (start < 0) return String(text ?? '');
  let end = start;
  while (end + 1 < lines.length && CHAPTER_LINE.test(lines[end + 1])) end++;
  return [...lines.slice(0, start), ...lines.slice(end + 1)].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * The credits line for one upload. `own` is the call's or card's `credits`:
 * a line of its own, `false` for none, or undefined for the settings' line.
 * Returns '' for none. Throws when the line wants `{music}` and has none.
 */
export function creditsLine(settingsCredits, own, music, body = '') {
  if (own === false || own === 'false') return '';
  const line = own === undefined || own === true ? (settingsCredits ?? '') : String(own);
  if (!line.includes('{music}')) return line.trim();
  let piece = String(music ?? '').trim();
  /* A description that already carries the filled line (a replacement, which
     reads the old video's; an update that pastes the text back) names the
     piece itself: read it from there, so the line is found, not asked for. */
  if (!piece) piece = musicIn(line, body) ?? '';
  if (!piece) throw new Error('The credits line in settings.json names the piece ({music}); pass music (the title of the piece), a credits line of this upload\'s own, or credits: false.');
  return line.replaceAll('{music}', piece).trim();
}

/** The piece named in `body` by a filled copy of the template `line`, or null. */
function musicIn(line, body) {
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(line.trim().split('{music}').map(esc).join('(.+?)'));
  const m = re.exec(String(body ?? ''));
  return m?.[1]?.trim() || null;
}

/** Seconds in an ISO 8601 duration as YouTube gives it (`PT1H2M3S`); NaN if none. */
export function isoSeconds(d) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(d ?? ''));
  if (!m || d === 'P' || d === 'PT') return NaN;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

/** Body, chapters, credits, in that order, with the checks YouTube would make. */
export function composeDescription(body, chapters, credits, what = 'The description') {
  let text = String(body ?? '').trim();
  if (chapters) text = stripChapters(text);
  /* The line already in the text (a replacement's, an update's) is lifted out and put back at the foot, so it is there once and new chapters go above it. */
  if (credits) text = text.split(credits).join('').replace(/\n{3,}/g, '\n\n').trim();
  const blocks = [text, chapters ? chapterBlock(chapters) : '', credits];
  const out = blocks.filter(Boolean).join('\n\n');
  if (ANGLE.test(out)) throw new Error(`${what} holds < or >, which YouTube refuses.`);
  const bytes = Buffer.byteLength(out, 'utf8');
  if (bytes > DESCRIPTION_BYTES) throw new Error(`${what} would be ${bytes} bytes with its chapters and credits; YouTube takes ${DESCRIPTION_BYTES}.`);
  return out;
}

export function checkTitle(title, what = 'The title') {
  const t = String(title ?? '');
  if (!t.trim()) throw new Error(`${what} is empty.`);
  if (t.length > TITLE_CHARS) throw new Error(`${what} is ${t.length} characters; YouTube takes at most ${TITLE_CHARS}.`);
  if (ANGLE.test(t)) throw new Error(`${what} holds < or >, which YouTube refuses.`);
  return t;
}

const LANG = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
export const validLanguage = (l) => typeof l === 'string' && LANG.test(l);

/**
 * Titles and descriptions in other languages, as `{ "es": { title,
 * description } }`. YouTube refuses localizations on a video with no default
 * language (`defaultLanguageNotSet`), so one is required here. Each language's
 * description gets the same chapters and credits as the default one (a viewer
 * reading Spanish is owed the music's credit too); a language that gives no
 * description gets the default description whole. `null` for a language
 * removes it (on an update).
 */
export function composeLocalizations(raw, { language, chapters, credits, fallbackDescription }) {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('localizations is an object like {"es": {"title": "...", "description": "..."}}.');
  if (!validLanguage(language)) throw new Error('Titles in other languages need the video\'s own language first: pass language (e.g. "en"); YouTube refuses them without it.');
  const out = {};
  for (const [lang, v] of Object.entries(raw)) {
    if (!validLanguage(lang)) throw new Error(`"${lang}" is not a language code like "es" or "pt-BR".`);
    if (v === null) { out[lang] = null; continue; }
    if (!v || typeof v !== 'object') throw new Error(`localizations.${lang} is { title, description }.`);
    const title = checkTitle(v.title, `The ${lang} title`);
    const description = v.description === undefined
      ? fallbackDescription
      : composeDescription(v.description, chapters, credits, `The ${lang} description`);
    out[lang] = { title, description };
  }
  return out;
}
