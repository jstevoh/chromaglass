/**
 * A preset or a sequence made for one song remembers which. Matching is by
 * ISRC when both sides have a real one, else by title and artist with the
 * usual noise stripped — a "(Remastered 2011)" or a stray comma should not
 * keep a look from finding its song.
 */

import type { TrackIdentity } from './musicTypes';

export interface SongRef {
  title: string;
  artist: string;
  isrc?: string;
  durationSec?: number;
}

const norm = (s: string): string =>
  s.toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')          // parentheticals: remasters, edits, feat.
    .replace(/\b(feat|ft)\.?\s.*$/, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const songRefFromTrack = (t: TrackIdentity): SongRef => ({
  title: t.title,
  artist: t.artist,
  isrc: t.source === 'manual' ? undefined : t.isrc,
  durationSec: t.durationSec,
});

export const songLabel = (s: SongRef): string => `${s.title} — ${s.artist}`;

export function sameSong(a: SongRef | null | undefined, b: SongRef | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.isrc && b.isrc) return a.isrc === b.isrc;
  return norm(a.title) === norm(b.title) && norm(a.artist) === norm(b.artist) && norm(a.title) !== '';
}

export function parseSongRef(raw: unknown): SongRef | undefined {
  const o = raw as Partial<SongRef> | null;
  if (!o || typeof o !== 'object' || typeof o.title !== 'string' || typeof o.artist !== 'string') return undefined;
  if (!o.title.trim() || !o.artist.trim()) return undefined;
  return {
    title: o.title.trim(),
    artist: o.artist.trim(),
    isrc: typeof o.isrc === 'string' && o.isrc.trim() ? o.isrc.trim() : undefined,
    durationSec: Number.isFinite(o.durationSec) && (o.durationSec as number) > 0 ? o.durationSec : undefined,
  };
}
