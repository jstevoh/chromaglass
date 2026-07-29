// Lyrics layer: fetch time-synced lyrics from LRCLIB (free, no API key),
// parse LRC timestamps, derive semantic word-triggers and a lexicon-based
// sentiment score per line. Falls back to unsynced lyrics aligned roughly
// against the song map's energy curve when no synced lyrics exist.

import { LyricLine, LyricTheme, LyricTrigger, SongMap } from './musicTypes';

const LRCLIB_BASE = 'https://lrclib.net/api/get';

// ── Keyword → visual theme map ─────────────────────────────────────────
const THEME_KEYWORDS: Record<LyricTheme, string[]> = {
  fire:   ['fire', 'burn', 'burning', 'flame', 'flames', 'blaze', 'heat', 'hot', 'smoke', 'ash', 'ignite', 'spark'],
  water:  ['rain', 'water', 'ocean', 'sea', 'river', 'wave', 'waves', 'drown', 'flood', 'tears', 'cry', 'fall', 'falling', 'pour'],
  sky:    ['sky', 'stars', 'star', 'moon', 'sun', 'cloud', 'clouds', 'heaven', 'fly', 'flying', 'wings', 'high', 'space'],
  earth:  ['ground', 'earth', 'mountain', 'stone', 'dust', 'roots', 'home', 'road', 'dirt', 'grave'],
  love:   ['love', 'heart', 'hearts', 'kiss', 'baby', 'darling', 'hold', 'touch', 'sweet', 'honey'],
  dark:   ['dark', 'darkness', 'night', 'shadow', 'shadows', 'black', 'cold', 'dead', 'death', 'ghost', 'fear'],
  light:  ['light', 'shine', 'shining', 'bright', 'glow', 'golden', 'gold', 'diamond', 'diamonds', 'morning', 'dawn'],
  motion: ['run', 'running', 'dance', 'dancing', 'move', 'moving', 'jump', 'spin', 'shake', 'drive', 'faster', 'go'],
};

// Small sentiment lexicon — enough to shade sections warm/cool
const POSITIVE = new Set(['love', 'happy', 'joy', 'smile', 'beautiful', 'sweet', 'good', 'best', 'bright', 'shine', 'free', 'alive', 'heaven', 'gold', 'golden', 'dream', 'dreams', 'hope', 'peace', 'dance', 'laugh', 'sun', 'warm', 'home', 'together', 'forever', 'kiss', 'paradise', 'perfect', 'glory', 'wonderful']);
const NEGATIVE = new Set(['hate', 'sad', 'cry', 'tears', 'pain', 'hurt', 'broken', 'break', 'alone', 'lonely', 'dark', 'darkness', 'cold', 'dead', 'death', 'die', 'lost', 'lose', 'fear', 'afraid', 'goodbye', 'sorry', 'wrong', 'fall', 'falling', 'bleed', 'scars', 'war', 'fight', 'lie', 'lies', 'never']);

export interface LyricsResult {
  lines: LyricLine[];
  synced: boolean;
  triggers: LyricTrigger[];
}

/** Fetch lyrics from LRCLIB; returns null when nothing is found. */
export async function fetchLyrics(
  artist: string,
  title: string,
  album?: string,
  durationSec?: number,
): Promise<{ syncedLyrics?: string; plainLyrics?: string } | null> {
  try {
    const params = new URLSearchParams({ artist_name: artist, track_name: title });
    if (album) params.set('album_name', album);
    if (durationSec) params.set('duration', String(Math.round(durationSec)));
    const res = await fetch(`${LRCLIB_BASE}?${params.toString()}`, {
      headers: { 'Lrclib-Client': 'ChromaGlass (https://github.com/jstevoh/chromaglass)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || (!data.syncedLyrics && !data.plainLyrics)) return null;
    return { syncedLyrics: data.syncedLyrics || undefined, plainLyrics: data.plainLyrics || undefined };
  } catch (e) {
    console.warn('fetchLyrics failed', e);
    return null;
  }
}

/** Parse LRC format ("[mm:ss.xx] line") into timestamped lines. */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split('\n')) {
    const m = raw.match(/^\s*\[(\d+):(\d+)(?:\.(\d+))?\]\s*(.*)$/);
    if (!m) continue;
    const min = parseInt(m[1], 10), sec = parseInt(m[2], 10);
    const frac = m[3] ? parseInt(m[3], 10) / Math.pow(10, m[3].length) : 0;
    const text = m[4].trim();
    if (!text) continue;
    lines.push({ time: min * 60 + sec + frac, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/**
 * Rough alignment for unsynced lyrics: distribute lines across the vocal
 * region of the track, weighting toward higher-energy frames from the song
 * map (verses/choruses carry more lines than quiet intros).
 */
export function alignPlainLyrics(plain: string, map: SongMap): LyricLine[] {
  const texts = plain.split('\n').map(s => s.trim()).filter(Boolean);
  if (texts.length === 0) return [];
  const start = map.sections.find(s => s.label !== 'intro')?.start ?? 0;
  const lastSection = map.sections[map.sections.length - 1];
  const end = lastSection?.label === 'outro' ? lastSection.start : map.durationSec;
  const span = Math.max(10, end - start);
  return texts.map((text, i) => ({ time: start + (span * i) / texts.length, text }));
}

/** Score one line's sentiment with the lexicon (-1..1). */
export function scoreSentiment(text: string): number {
  const words = text.toLowerCase().split(/[^a-z']+/).filter(Boolean);
  if (words.length === 0) return 0;
  let score = 0, hits = 0;
  for (const w of words) {
    if (POSITIVE.has(w)) { score += 1; hits++; }
    else if (NEGATIVE.has(w)) { score -= 1; hits++; }
  }
  return hits === 0 ? 0 : score / Math.max(2, hits);
}

/** Extract themed word-triggers from timestamped lines. */
export function extractTriggers(lines: LyricLine[]): LyricTrigger[] {
  const triggers: LyricTrigger[] = [];
  for (const line of lines) {
    const words = line.text.toLowerCase().split(/[^a-z']+/).filter(Boolean);
    for (const [theme, keywords] of Object.entries(THEME_KEYWORDS) as [LyricTheme, string[]][]) {
      const hit = words.find(w => keywords.includes(w));
      if (hit) {
        triggers.push({ time: line.time, word: hit, theme });
        break; // one trigger per line — the first theme that matches
      }
    }
  }
  return triggers;
}

/** Full lyrics pipeline: fetch → parse/align → sentiment → triggers. */
export async function buildLyrics(
  artist: string,
  title: string,
  album: string | undefined,
  map: SongMap | null,
): Promise<LyricsResult | null> {
  const fetched = await fetchLyrics(artist, title, album, map?.durationSec);
  if (!fetched) return null;

  let lines: LyricLine[] = [];
  let synced = false;
  if (fetched.syncedLyrics) {
    lines = parseLrc(fetched.syncedLyrics);
    synced = lines.length > 0;
  }
  if (lines.length === 0 && fetched.plainLyrics && map) {
    lines = alignPlainLyrics(fetched.plainLyrics, map);
  }
  if (lines.length === 0) return null;

  for (const line of lines) line.sentiment = scoreSentiment(line.text);
  return { lines, synced, triggers: extractTriggers(lines) };
}

/** Mean sentiment of the lines inside a time window (section arc). */
export function sectionSentiment(lines: LyricLine[], start: number, end: number): number {
  const inRange = lines.filter(l => l.time >= start && l.time < end);
  if (inRange.length === 0) return 0;
  return inRange.reduce((s, l) => s + (l.sentiment ?? 0), 0) / inRange.length;
}

/** The current lyric line at a playback position (last line whose time has passed). */
export function lineAt(lines: LyricLine[], positionSec: number): LyricLine | null {
  let current: LyricLine | null = null;
  for (const l of lines) {
    if (l.time <= positionSec) current = l;
    else break;
  }
  return current;
}
