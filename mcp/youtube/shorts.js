/**
 * Shorts (PLAN 44i-2c): what makes YouTube show an upload as a Short, held
 * at the call rather than found out after the film is up.
 *
 * YouTube's rule, read from its help page 2026-11-28 ("Understand
 * three-minute YouTube Shorts", support.google.com/youtube/answer/15424877):
 * since 2024-10-15 an upload three minutes long or less, with a square or
 * vertical picture, is a Short. The API has no field for it either way: a
 * film is a Short because of its shape and length. `#Shorts` is no longer
 * what makes one, but it is what people search and what the plan asked for
 * ("tagged"), and costs a line. So "upload this as a Short" here means three
 * things, the first two measured from the file (`probe.js`), never taken on
 * the caller's word:
 *
 *  - three minutes or less. Measured from the movie header, held strictly: a
 *    film that reads 3:00.04 is over, because YouTube would make it a long
 *    video and the owner would find a landscape player round a portrait film.
 *  - square or taller than wide, as shown (a phone's quarter turn counted).
 *  - `#Shorts` in the title or the description; when neither has it, it goes
 *    on its own line at the end of the description's own text (before the
 *    chapters and the credits line, which describe.js puts after), once.
 *
 * A film whose length or shape cannot be read (a browser's own recording
 * writes no length; a kind of file probe.js does not read) is refused as a
 * Short with what was missing and how to fix it, not let through on a guess.
 *
 * The other way round matters as much: a film NOT asked to be a Short that is
 * short and tall will be one anyway, so the job says so (`shorts` in its
 * view), and the owner is never surprised by a Short they did not mean.
 *
 * And one YouTube rule the owner's music films can meet: a Short over one
 * minute with an active Content ID claim is blocked worldwide (the same
 * help page). The server cannot see claims before upload, so a Short over a
 * minute says it in its note; under a minute it does not need to.
 */
import { clock } from './probe.js';

export const SHORT_MAX_SEC = 180;
export const SHORTS_TAG = '#Shorts';
const TAGGED = /(^|\s)#shorts\b/i;

const size = (p) => `${p.width}x${p.height}`;

/** Would YouTube show this film as a Short? true, false, or null when its length or shape is not known. */
export function wouldBeShort(p) {
  if (!p || !p.durationSec || !p.width || !p.height) return null;
  return p.durationSec <= SHORT_MAX_SEC && p.height >= p.width;
}

/** Throws unless the film can go up as a Short, with the measured numbers and the fix. */
export function checkShort(p, name) {
  if (!p) throw new Error(`${name}: a Short is judged from the file, and this kind of file is not read here (MP4, MOV, M4V, WebM, MKV are). Export it as MP4.`);
  if (!p.durationSec) {
    // A browser's recorder writes no length: a WebM with no Duration, or a fragmented MP4 with no mehd. Copying the streams into a new file writes one.
    const fix = p.container === 'ebml' ? 'ffmpeg -i in.webm -c copy out.webm' : 'ffmpeg -i in.mp4 -c copy out.mp4';
    throw new Error(`${name}${p.width && p.height ? ` (${size(p)})` : ''} does not say how long it is (a browser's own recording writes no length), so it cannot be held to a Short's three minutes. Copy it into a new file first: ${fix}.`);
  }
  if (!p.width || !p.height) throw new Error(`${name}: its picture size could not be read, so it cannot be held to a Short's shape.`);
  const over = p.durationSec > SHORT_MAX_SEC, wide = p.width > p.height;
  if (over || wide) {
    const why = [over ? `${clock(p.durationSec)} long (${p.durationSec.toFixed(2)} s; a Short is 3:00 or less)` : '', wide ? `${size(p)}, wider than tall (a Short is square or vertical, e.g. 1080x1920)` : ''].filter(Boolean).join(' and ');
    throw new Error(`${name} is ${why}, so YouTube would show it as a long video, not a Short.${wide ? ' Cut a 9:16 copy first.' : ' Trim it under three minutes.'}`);
  }
}

/** The description's own text with #Shorts at its end, unless the title or the text already has it. */
export function tagShort(title, description) {
  const d = String(description ?? '');
  if (TAGGED.test(String(title ?? '')) || TAGGED.test(d)) return d;
  return d.trim() ? `${d.replace(/\s+$/, '')}\n\n${SHORTS_TAG}` : SHORTS_TAG;
}

/** One line for the job's view: what YouTube will make of this film, or nothing when its shape is not known. */
export function shortsNote(p, asked) {
  const is = wouldBeShort(p);
  if (is === null) return undefined;
  const shape = `${clock(p.durationSec)}, ${size(p)}`;
  if (asked) return `a Short (${shape}, tagged ${SHORTS_TAG})${p.durationSec > 60 ? '; over a minute, so a Content ID claim on its music would block it everywhere' : ''}`;
  return is ? `YouTube will show this as a Short (${shape}); pass short: true to tag it so` : undefined;
}
