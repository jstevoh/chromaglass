/**
 * Where a song's title goes when one is due (PLAN 37x-10j): the corner
 * caption (lib/songCaption.ts). It could be poured as ink instead (37x-10,
 * lib/inkTitle.ts, the `titleCaption` setting off) until the owner shelved
 * the ink on 2026-11-12 (37x-10m); the callers still hand over the ink's
 * rows so that bringing it back is the sink's one line, but the sink
 * useRemote sets shows the caption only.
 *
 * Three things put a title up: the ear naming a new song (useInkTitle), a
 * song show's `{do:'title'}` (useSongScore), and a `song-title` message from
 * the phone, the show server or the assistant (useRemote). The setting and
 * the plate are useRemote's to reach; useSongScore has neither, and App.tsx,
 * which calls both, is over its size ceiling and may not grow
 * (`npm run sizes`) to pass one more prop between them. So, as app/songCue.ts
 * holds the song shows' writer, this holds the one function that chooses,
 * set while useRemote is mounted. The state stays App's.
 */
import type { SongCaption } from '../lib/songCaption';

/** The ink's rows and colour, for when the title is poured rather than captioned. */
export interface SongTitleInk { rows: { text: string; weight?: number }[]; colour?: string }
export type SongTitleSink = (card: SongCaption, ink: SongTitleInk) => void;

let sink: SongTitleSink | null = null;
export function setSongTitleSink(s: SongTitleSink | null): void { sink = s; }
/** Put a song's title up, as the corner caption (the ink is shelved, 37x-10m). */
export function showSongTitle(card: SongCaption, ink: SongTitleInk): void { sink?.(card, ink); }
