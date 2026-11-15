// Where a first listen's recording sits in the song (PLAN 28h-9).
//
// What was wrong: the recorder that makes a song's map starts when the song
// is identified (`adoptTrack`), and that is never the song's first note. The
// fingerprint needs a few seconds of sound before it can name anything, the
// service answers a moment later, and when Listen is pressed halfway through
// a record the recording starts halfway through the song. The analysis
// counts its seconds from the recording's first sample, so every section,
// every curve and the fingerprint stored with the map came out early by that
// much, while the position the show reads them at counts from the song's
// start (`SongPosition`: the match's `offsetSec` plus the time since). A
// song identified at 0:30 whose chorus starts at 1:00 had its map's chorus at
// 0:30, so the Score drew it half a minute early, the stages Listen designed
// changed half a minute early, and a burst pinned to the chorus fired then.
//
// The fix moves the map, not the clock. The clock is right about the song —
// it is re-anchored by every fresh match — and the map is the thing measured
// from the wrong zero. So the recording's first sample is given the song
// second the clock read at that instant, using the newest anchor the track
// has when the listen ends (a re-identification a minute in knows better than
// the first match did), and everything the analysis measured is moved later
// by it. The nudge is left out: it is a performer's correction of a map that
// did not exist yet during a first listen, and the next play starts unnudged.
//
// Why not record from a buffer kept from before the match, so the recording
// starts with the song: a buffer only reaches back as far as it was kept, a
// song joined halfway would still start late, and the rolling buffer is
// minutes of audio held all show for a song that may already have a map. The
// lead is the one number that is true in both cases.
//
// The part of the song before the recording was not heard, so the map says
// so rather than inventing it: a section labelled `unheard` covers it, at the
// first heard section's energy (so it moves no stage against the song's own
// range), with no pitch and no harmony (the follower reads an empty profile
// as no evidence either way, `centreChroma`). Two cases are not worth a
// section of their own:
//   - a lead shorter than the analysis cuts any section (boundaries are at
//     least eight of its seconds apart, `segment`) is folded into the first
//     section, as a few seconds of a first match are;
//   - a first section the analysis called the intro still ends within the
//     analysis's own intro rule (an opening under 25 s) once moved, so it is
//     the rest of the intro and takes the unheard start into it. One that does
//     not was only called the intro because the recording began there, and
//     becomes a verse, the analysis's word for a section it cannot place.

import type { SongMap, SongSection } from './musicTypes';
import { FP_HOP_SEC } from './localFingerprint.ts';

/** Leads shorter than this fold into the first section: the analysis never cuts a section this short. */
export const FOLD_LEAD_SEC = 8;
/** The analysis calls an opening section shorter than this the intro (`segment`). */
const INTRO_MAX_SEC = 25;
/** Ten minutes: the most of a song a map is made from; a lead past it is a clock gone wrong. */
const MAX_LEAD_SEC = 600;
/**
 * The stored harmony's rate: twelve notes a profile, FOLLOW_RATE profiles a
 * second (`songFollow.ts`). Written out rather than imported, because only the
 * map's readers may import the follower (`npm run songfollow` holds that line,
 * so a look's patches can never read the song's place through it); `npm run
 * listen` fails if the two rates ever part.
 */
export const CHROMA_RATE = 4;
const CHROMA_NOTES = 12;

/**
 * The song second a moment `atMs` (performance.now) falls on, by the track's
 * own anchor: the match's offset plus the time since it was taken. 0 when the
 * track has no anchor (named by hand, whose clock starts at 0 when named).
 */
export function songSecAt(track: { offsetSec?: number; identifiedAtMs?: number } | null, atMs: number | null): number {
  if (!track || track.identifiedAtMs == null || atMs == null) return 0;
  const s = (track.offsetSec ?? 0) + (atMs - track.identifiedAtMs) / 1000;
  return Number.isFinite(s) ? Math.min(MAX_LEAD_SEC, Math.max(0, s)) : 0;
}

/** A map measured from a recording that began `leadSec` into the song, moved to the song's own seconds. */
export function shiftSongMap(map: SongMap, leadSec: number): SongMap {
  const lead = Number.isFinite(leadSec) ? Math.min(MAX_LEAD_SEC, Math.max(0, leadSec)) : 0;
  if (lead === 0) return map;
  const moved: SongSection[] = map.sections.map((s) => ({ ...s, start: s.start + lead, end: s.end + lead }));
  const first = moved[0];
  if (first) {
    if (lead < FOLD_LEAD_SEC || (first.label === 'intro' && first.end < INTRO_MAX_SEC)) first.start = 0;
    else {
      if (first.label === 'intro') first.label = 'verse';
      moved.unshift({ start: 0, end: lead, label: 'unheard', energy: first.energy });
    }
  }
  const rate = map.frameRate > 0 ? map.frameRate : 0;
  const pad = Math.round(lead * rate);
  const e0 = first ? first.energy : (map.energyCurve[0] ?? 0);
  const chromaPad = Math.round(lead * CHROMA_RATE) * CHROMA_NOTES;
  return {
    ...map,
    durationSec: map.durationSec + lead,
    sections: moved,
    energyCurve: pad ? new Array<number>(pad).fill(e0).concat(map.energyCurve) : map.energyCurve,
    pitchCurve: pad ? new Array<number>(pad).fill(0).concat(map.pitchCurve) : map.pitchCurve,
    chroma: map.chroma ? new Array<number>(chromaPad).fill(0).concat(map.chroma) : map.chroma,
  };
}

/**
 * A fingerprint's anchor frames moved later by the lead, so the local matcher,
 * which reads a match's offset off these frames, names the song's position and
 * not the recording's: unmoved, every later local match would set the clock
 * early by the lead and undo the shift of the map.
 */
export function shiftFingerprintFrames(frames: Uint32Array, leadSec: number): Uint32Array {
  const lead = Number.isFinite(leadSec) ? Math.min(MAX_LEAD_SEC, Math.max(0, leadSec)) : 0;
  const by = Math.round(lead / FP_HOP_SEC);
  if (by === 0) return frames;
  const out = new Uint32Array(frames.length);
  for (let i = 0; i < frames.length; i++) out[i] = frames[i] + by;
  return out;
}
