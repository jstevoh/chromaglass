/**
 * A song's credit as a caption in the bottom-left corner, the way a music
 * channel of the early 1980s put one up over a video (PLAN 37x-10j).
 *
 * What was reported: the owner judged the poured-ink titles (37x-10g, thick
 * ink on a clear pad, washed off by a rinse) "not very readable honestly",
 * and asked for titles that "just show up like MTV used to have them in the
 * bottom left corner and then fade away. Simple ui overlay", and then "as
 * much like 1980s MTV as possible". So this is not a fluid effect and not
 * the plate's: it is a card laid over the finished picture, as a broadcaster
 * laid one over a tape, and the physics rule does not reach it.
 *
 * What that card was: plain white sans-serif, left-aligned, low in the
 * title-safe corner, four short lines stacked in one size and weight, the
 * artist first, the song in quotation marks, then the album and the label.
 * No box and no logo, only the soft dark edge an analogue key left round
 * white letters, which is also what keeps them readable on a bright plate.
 * It cut on a few seconds into the video, sat still for about seven
 * seconds, and went. Here the cut is a quick fade (a fifth of a second in,
 * under half a second out), since a hard cut on a 30 fps stream reads as a
 * dropped frame rather than as a cut.
 *
 * Who draws it: two pictures need it and neither can see the other. The
 * screen gets it from `SongCaptionOverlay` (components/SongCaptionOverlay.tsx),
 * a canvas over the plate; the live stream gets it from the encoder, which
 * draws it onto each output's staging canvas after the plate
 * (lib/liveStream.ts `stage`), so it is burned into what YouTube receives.
 * Both call `drawSongCaption` with what `songCaptionNow` answers, so the
 * stream shows what the screen does. The caption showing is held here, as
 * liveFrame holds the stream's listener: the encoder is not a React
 * component and must not take the visualizer's props to learn of it. The
 * app's hooks are the only writers (`showSongCaption` from useSongTitle).
 */

export interface SongCaption {
  artist: string;
  title: string;
  album?: string;
  label?: string;
}

/** A line over this many characters ends in '…': four short lines are the card, and a long album name is not a fifth. */
export const SONG_CAPTION_CHARS = 48;
/** The fade in, the hold and the fade out, in ms: up in a fifth of a second, readable for seven, gone in under half. */
export const SONG_CAPTION_IN_MS = 200;
export const SONG_CAPTION_HOLD_MS = 7000;
export const SONG_CAPTION_OUT_MS = 450;
export const SONG_CAPTION_MS = SONG_CAPTION_IN_MS + SONG_CAPTION_HOLD_MS + SONG_CAPTION_OUT_MS;

const line = (v: unknown): string => {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return s.length > SONG_CAPTION_CHARS ? `${s.slice(0, SONG_CAPTION_CHARS - 1)}…` : s;
};

/**
 * A caption as the display may show it, from anything (a `song-title`
 * message from the phone, the show server or the assistant, or a song the
 * ear named): strings only, control characters out, each line clipped. Null
 * when there is no title, since a card with only an artist names nothing.
 */
export function parseSongCaption(m: unknown): SongCaption | null {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  const title = line(o.title);
  if (!title) return null;
  const out: SongCaption = { artist: line(o.artist), title };
  const album = line(o.album);
  const label = line(o.label);
  if (album) out.album = album;
  if (label) out.label = label;
  return out;
}

/** The card's lines, top to bottom: artist, the song in quotation marks, album, label; an empty one left out. */
export function songCaptionLines(c: SongCaption): string[] {
  const title = /^["“]/.test(c.title) ? c.title : `“${c.title}”`;
  return [c.artist, title, c.album ?? '', c.label ?? ''].filter((s) => s.length > 0);
}

/** How much of the card shows `ms` after it went up: 0 before and after, 1 through the hold. */
export function songCaptionAlpha(ms: number): number {
  if (!(ms >= 0) || ms >= SONG_CAPTION_MS) return 0;
  if (ms < SONG_CAPTION_IN_MS) return ms / SONG_CAPTION_IN_MS;
  const out = ms - SONG_CAPTION_IN_MS - SONG_CAPTION_HOLD_MS;
  return out <= 0 ? 1 : 1 - out / SONG_CAPTION_OUT_MS;
}

let showing: { lines: string[]; at: number } | null = null;
const listeners = new Set<() => void>();

/** Put a card up at `at` (performance.now()), replacing any still showing: a new song's credit is never queued behind the last one's. */
export function showSongCaption(c: SongCaption, at = performance.now()): void {
  const card = parseSongCaption(c);
  if (!card) return;
  showing = { lines: songCaptionLines(card), at };
  for (const fn of listeners) fn();
}

/** Take the card down at once (a show stopped, a check's reset). */
export function clearSongCaption(): void {
  showing = null;
  for (const fn of listeners) fn();
}

/** The card's lines and how much of it shows at `now`, or null when nothing is up. */
export function songCaptionNow(now = performance.now()): { lines: string[]; alpha: number } | null {
  if (!showing) return null;
  const alpha = songCaptionAlpha(now - showing.at);
  if (alpha <= 0) {
    if (now - showing.at >= SONG_CAPTION_MS) showing = null;
    return null;
  }
  return { lines: showing.lines, alpha };
}

/** Told each time a card goes up or is taken down: the overlay starts its animation frames on it. */
export function onSongCaption(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Draw the card into `ctx` over a picture `w` by `h`. The letters are a
 * twenty-fourth of the picture's height (45 px on a 1080 line stream, the
 * size a credit had on a 480 line set), narrowed so the longest line fits
 * in three quarters of the width on a tall picture; the card sits inside
 * the title-safe margin, a fifteenth in from the left and an eleventh up
 * from the bottom. The dark edge is the letters again in black, a
 * sixteenth of their size down and right, with a soft halo: the drop shadow
 * a character generator of the time keyed under white, not an outline (a
 * later decade's). Measured by `npm run caption`: a blurred shadow alone
 * (the first draft) left no near-black pixel round the letters on a bright
 * cream plate, white on cream; this leaves 2.1% of the box near-black.
 */
export function drawSongCaption(ctx: Ctx2D, w: number, h: number, lines: string[], alpha: number): void {
  if (alpha <= 0 || lines.length === 0) return;
  const font = (px: number) => `500 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  let px = Math.max(10, Math.round(h / 24));
  ctx.save();
  ctx.font = font(px);
  const widest = Math.max(...lines.map((s) => ctx.measureText(s).width));
  if (widest > w * 0.75) { px = Math.max(8, Math.floor(px * (w * 0.75) / widest)); ctx.font = font(px); }
  const lead = Math.round(px * 1.22);
  const x = Math.round(w / 15);
  const bottom = Math.round(h - h / 11);
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const yOf = (i: number) => bottom - (lines.length - 1 - i) * lead;
  // First the dark: the letters again, a little down and right, with a soft halo round them.
  const off = Math.max(1, Math.round(px * 0.06));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = Math.max(2, px * 0.25);
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x + off, yOf(i) + off);
  // Then the white, crisp, over it.
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, yOf(i));
  ctx.restore();
}
