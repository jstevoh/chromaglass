/**
 * Words poured onto the plate as dye from outside the desk (PLAN 37x-10c):
 * the phone remote's text box, and a message the show server relays.
 *
 * What was asked (the owner, 2026-11-08): at the start of each song in a
 * live set, pour the song's name and credit onto the plate as ink, and let
 * the liquid sweep it away. The pour itself already existed: the song
 * action `{do:'title'}` hands `titleRows(song)` to the visualizer's
 * `pourText`, which draws the rows on a canvas and adds them to the plate's
 * dye (`fluid/inputs.ts` `pourImage`), where the flow carries and smears
 * them like any other dye. It fired only for a song music intelligence had
 * named, though, and a set played from files through the Mac's speakers
 * (a CC BY album, say) names nothing. So the words now come in from the
 * outside too, as a `pour-text` message, and this file is the one place
 * that says what such a message may hold.
 *
 * Why the page shapes the message and not the sender: a phone's message
 * reaches the display straight from the relay, so whatever the sender
 * promised, the display must still read the message as untrusted. The rows
 * are capped (four rows, sixty characters each) because the pour shrinks
 * the letters until the longest row fits the box, and a paragraph pasted
 * whole would pour as dust; the weights are clamped because a weight is a
 * share of the box's height, and one row at a weight of a thousand leaves
 * the others a pixel. The colour is a hex colour or `contrast` (dark
 * letters on a bright plate, the look's brightest dye on a dark one), never
 * an arbitrary CSS string handed to a canvas.
 *
 * Nothing here runs in the frame loop.
 */
import { wrapTitle } from './songShows';

export interface PourTextRow { text: string; weight: number }
export interface PourTextMessage { rows: PourTextRow[]; colour: string }

/** Rows a pour holds: a title on two lines and two lines of credit. */
export const POUR_TEXT_MAX_ROWS = 4;
/** Characters a row holds: past this the letters shrink to dust. */
export const POUR_TEXT_MAX_CHARS = 60;
/** A row's share of the box's height, kept to a sane range. */
export const POUR_TEXT_WEIGHT_MIN = 0.25;
export const POUR_TEXT_WEIGHT_MAX = 3;
/**
 * The shortest gap between two pours the display takes, in ms. Each pour
 * adds dye and takes nothing away, so a double tap, or a sender's loop,
 * would stack the same words into a blot. A song starts no more often.
 */
export const POUR_TEXT_GAP_MS = 1500;

/** One row's text: control characters out, white space collapsed, capped. */
const cleanRow = (t: unknown): string => String(t ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, POUR_TEXT_MAX_CHARS)
  .trim();

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A `pour-text` message as the display may act on it, or null when it holds
 * no words. Empty rows are dropped, not poured as a gap.
 */
export function parsePourText(raw: unknown): PourTextMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as { rows?: unknown; colour?: unknown };
  if (!Array.isArray(m.rows)) return null;
  const rows: PourTextRow[] = [];
  for (const r of m.rows) {
    if (rows.length >= POUR_TEXT_MAX_ROWS) break;
    const row: { text?: unknown; weight?: unknown } = r && typeof r === 'object' ? r : { text: r };
    const text = cleanRow(row.text);
    if (!text) continue;
    const w = typeof row.weight === 'number' && Number.isFinite(row.weight) ? row.weight : 1;
    rows.push({ text, weight: Math.min(POUR_TEXT_WEIGHT_MAX, Math.max(POUR_TEXT_WEIGHT_MIN, w)) });
  }
  if (rows.length === 0) return null;
  const colour = typeof m.colour === 'string' && HEX.test(m.colour) ? m.colour.toLowerCase() : 'contrast';
  return { rows, colour };
}

/**
 * What a person typed or pasted, as rows laid out as a song's title card is
 * (`titleRows`): the first line is the name, in capitals on one or two
 * lines; each line after it is a credit, smaller. One line holding a dash
 * between spaces ("Song - Artist", the shape a track list is pasted in) is
 * read as the name and its credit.
 */
export function pourTextRows(typed: string): PourTextRow[] {
  let lines = String(typed ?? '').split(/\r?\n/).map(cleanRow).filter(Boolean);
  if (lines.length === 1) {
    const parts = lines[0].split(/\s+[-–—]\s+/).map(cleanRow).filter(Boolean);
    if (parts.length >= 2) lines = [parts[0], parts.slice(1).join(' – ')];
  }
  if (lines.length === 0) return [];
  const [name, ...credits] = lines;
  // The name takes two rows only when there is room left for the credits.
  const nameRows = wrapTitle(name, credits.length >= POUR_TEXT_MAX_ROWS - 1 ? 1 : 2)
    .map((t) => ({ text: t.toUpperCase(), weight: 1.25 }));
  const rows = [...nameRows, ...credits.map((t) => ({ text: t, weight: 0.75 }))];
  return rows.slice(0, POUR_TEXT_MAX_ROWS);
}
