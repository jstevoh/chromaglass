/**
 * The score: a song the show has heard, drawn as a timeline, with the song's
 * show laid on it (PLAN 28h).
 *
 * The owner asked for it on 2026-10-11: now that the show hears a song and
 * remembers it (the song map, `songMap.ts`: its sections and an energy curve
 * from the first listen), draw it, so that the changes a song's show makes
 * (`songShows.ts`) can be put where the song's shape says, and so that during
 * a show the picture of where the show *thinks* the song is can be watched,
 * and nudged back into step when it is wrong.
 *
 * ## Cues pinned to sections, placed by the scheduler itself
 *
 * A cue on the score is one of the song show's actions, and the place it is
 * drawn is where the runtime will fire it. Not where it ought to: this file
 * does not work out "the second chorus starts at 1:32" on its own, it runs the
 * real scheduler (`dueActions`) over the song, at every moment where anything
 * can become due, and draws each action where it came out. A second copy of
 * the rules would be a picture that can disagree with the show, and the whole
 * point of the picture is to be believed in the dark.
 *
 * Pinning a cue on the score pins it to a *section* ("the second chorus",
 * "every chorus"), never to a second. The second chorus is what the person
 * means; its time is an estimate from one listen, which a later listen or a
 * corrected edge moves, and a cue at 1:32 would stay at 1:32 when the chorus
 * did not. A live take (PLAN 28g's follower) hands over its place in the map's
 * own seconds, so a stretched verse holds the chorus's cue back until the
 * chorus is played, and a skipped bridge's cue does not fire.
 *
 * ## What a nudge is
 *
 * The show's idea of where the song is comes from the clock started when the
 * song was recognised (`useMusicIntelligence`), re-anchored by the fingerprint
 * as it plays. On a record that is right about where the *audio* is; what it
 * cannot know is whether the song map put a section's edge where the song
 * really turns, which is an estimate from one listen. So the nudge moves the
 * position: a beat at a time, or "the section the show is in starts now"
 * (the show got there early) and "the next section is now" (the song got
 * there first). What reads the song's position moves with it: a song's show
 * that follows the song, the sequencer's section stages, the lyrics. A show
 * started by hand keeps its own clock and does not (PLAN 28h-4), nor do a
 * listen's replay and a take (28h-7), which count from the recognised start.
 *
 * Pure: a map and a show in, a score out; no DOM, no clock. `npm run score`
 * drives it with a known song.
 */

import type { SongMap, SongSection } from './musicTypes';
import {
  dueActions, sectionsAt, sectionKind, describeWhat, describeWhen,
  type ActionWhen, type FiredState, type SectionKind, type SongClock, type SongShow,
} from './songShows';

export interface ScoreSection {
  index: number;
  start: number;
  end: number;
  label: string;
  /** The kind a song show can name, or null for a label it cannot (a one-section map's "song"). */
  kind: SectionKind | null;
  /** Which of its kind this is, counted as the runtime counts: the second chorus is 2. */
  nth: number;
  /** Mean energy of the section, 0..1, as the map measured it. */
  energy: number;
  /** Where it sits on the score, 0..1 of the song. */
  x0: number;
  x1: number;
}

export interface ScoreCue {
  actionId: string;
  /** Seconds into the song where it fires. An action that fires on every chorus has one cue per chorus. */
  at: number;
  x: number;
  /** The section it fires in, or null outside the map. */
  section: number | null;
  when: string;
  what: string;
  /** Pinned to a section (moves with it), as against a time or the song's end. */
  pinned: boolean;
}

export interface Score {
  duration: number;
  sections: ScoreSection[];
  /** The energy curve, `points` long, 0..1 of the loudest point. */
  energy: number[];
  cues: ScoreCue[];
  /** Actions with no place on a timeline: on kicks. Listed beside it. */
  loose: { actionId: string; when: string; what: string }[];
}

/** The count key the runtime uses for a label (`sectionsAt`): its leading letters. */
const countKey = (label: string): string => label.toLowerCase().replace(/[^a-z].*$/, '');

/** "Chorus 2", "Intro", "Song": a section as a person names it. */
export function sectionName(s: Pick<ScoreSection, 'label' | 'nth'>, all?: readonly Pick<ScoreSection, 'label'>[]): string {
  const word = s.label ? s.label[0].toUpperCase() + s.label.slice(1) : 'Section';
  const many = all ? all.filter(o => countKey(o.label) === countKey(s.label)).length > 1 : s.nth > 1;
  return many ? `${word} ${s.nth}` : word;
}

/** Resample a curve to `n` points, each the mean of what falls in it, scaled to its loudest. */
function resample(curve: readonly number[], n: number): number[] {
  if (curve.length === 0 || n <= 0) return [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i / n) * curve.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / n) * curve.length));
    let sum = 0;
    for (let j = a; j < b; j++) sum += curve[j] ?? 0;
    out.push(sum / (b - a));
  }
  const top = Math.max(...out);
  return top > 0 ? out.map(v => v / top) : out;
}

/**
 * The score of a song: its sections, its energy, and where its show's actions
 * fire. `show` may be null (a song with no show yet: the score is still the
 * song, and pinning the first cue makes the show).
 */
export function scoreOf(
  map: Pick<SongMap, 'durationSec' | 'sections' | 'energyCurve'>,
  show: SongShow | null,
  /**
   * How long the runtime believes the song is, which is what its "before the
   * end" cues count back from (`songDuration`). The map's own length when
   * omitted, which is the runtime's last resort too.
   */
  durationSec?: number | null,
  points = 160,
): Score {
  const sections0 = map.sections;
  const duration = Math.max(1, durationSec || map.durationSec || (sections0.length ? sections0[sections0.length - 1].end : 1));
  const counts: Record<string, number> = {};
  const sections: ScoreSection[] = sections0.map((s: SongSection, index) => {
    const key = countKey(s.label);
    counts[key] = (counts[key] ?? 0) + 1;
    return {
      index, start: s.start, end: s.end, label: s.label, kind: sectionKind(s.label), nth: counts[key],
      energy: s.energy, x0: Math.max(0, Math.min(1, s.start / duration)), x1: Math.max(0, Math.min(1, s.end / duration)),
    };
  });

  const cues: ScoreCue[] = [];
  const loose: Score['loose'] = [];
  if (show) {
    /*
      Every moment something can come due: the top, each section's first
      second, each time an action names, each countdown to the end. Between
      them the scheduler's answer cannot change, so stepping through these is
      the same as stepping through the song a frame at a time, and exact.
    */
    const times = new Set<number>([0]);
    for (const s of sections) if (s.start >= 0 && s.start < duration) times.add(s.start);
    for (const a of show.actions) {
      if (a.when.at === 'time' && a.when.sec <= duration) times.add(Math.max(0, a.when.sec));
      if (a.when.at === 'before-end') times.add(Math.max(0, duration - a.when.sec));
    }
    const placed = { ...show, actions: show.actions.filter(a => a.when.at !== 'kick') };
    const fired: FiredState = new Map();
    for (const t of [...times].sort((x, y) => x - y)) {
      const clock: SongClock = { t, duration, ...sectionsAt(sections0, t), kicks: 0 };
      for (const a of dueActions(placed, clock, fired)) {
        cues.push({
          actionId: a.id, at: t, x: Math.min(1, t / duration), section: clock.section?.index ?? null,
          when: describeWhen(a.when), what: describeWhat(a.what), pinned: a.when.at === 'section',
        });
      }
    }
    for (const a of show.actions) if (a.when.at === 'kick') loose.push({ actionId: a.id, when: describeWhen(a.when), what: describeWhat(a.what) });
  }
  return { duration, sections, energy: resample(map.energyCurve ?? [], points), cues, loose };
}

/**
 * How long a song is, as a song's show counts it: whoever started the show,
 * then the recognised track, then the show's own note of the song, then the
 * song map. One answer for the runtime (`useSongShows`) and the score, so a
 * cue drawn "8 s before the end" fires there; the map is last because the
 * listen it was made from can run long or stop short.
 */
export function songDuration(...sources: (number | null | undefined)[]): number | null {
  for (const d of sources) if (typeof d === 'number' && Number.isFinite(d) && d > 0) return d;
  return null;
}

/** Where the playhead is: its place, the section it is in, and how long until the next one. */
export function playhead(score: Score, positionSec: number): { x: number; index: number | null; intoSection: number; toNext: number | null } {
  const t = Math.max(0, positionSec);
  const i = score.sections.findIndex(s => t >= s.start && t < s.end);
  const sec = i >= 0 ? score.sections[i] : null;
  const next = i >= 0 ? score.sections[i + 1] : score.sections.find(s => s.start > t);
  return {
    x: Math.max(0, Math.min(1, t / score.duration)),
    index: i >= 0 ? i : null,
    intoSection: sec ? t - sec.start : 0,
    toNext: next ? next.start - t : null,
  };
}

export type NudgeKind = 'section-start' | 'next-section';

/**
 * How far to move the position, seconds, for a section nudge; null when there
 * is nowhere to go (before the first section, or in the last with nothing after).
 *
 * "section-start": the section the show is in starts *now*: the show got
 * there early, so the position goes back to its first second. "next-section":
 * the next section is now: the song got there first, so the position goes
 * forward to the next one's first second, and that section's cues fire.
 */
export function nudgeFor(score: { sections: readonly { start: number; end: number }[] }, positionSec: number, kind: NudgeKind): number | null {
  const t = Math.max(0, positionSec);
  const i = score.sections.findIndex(s => t >= s.start && t < s.end);
  if (kind === 'section-start') return i >= 0 ? score.sections[i].start - t : null;
  const next = i >= 0 ? score.sections[i + 1] : score.sections.find(s => s.start > t);
  return next ? next.start - t : null;
}

/** The nudge's fine step: a beat at the tempo the show hears, or half a second without one. */
export const hasBeat = (bpm: number): boolean => bpm >= 40 && bpm <= 240;
export const nudgeStep = (bpm: number): number => (hasBeat(bpm) ? 60 / bpm : 0.5);

/**
 * The "when" for a cue pinned on the score: this section only ("at the second
 * chorus") or every section of its kind ("at every chorus"). A section whose
 * label a show cannot name is pinned by its place among all of them.
 */
export function pinWhen(section: Pick<ScoreSection, 'kind' | 'nth' | 'index'>, every: boolean): ActionWhen {
  if (!section.kind || section.kind === 'any') return { at: 'section', section: 'any', nth: section.index + 1 };
  return every ? { at: 'section', section: section.kind } : { at: 'section', section: section.kind, nth: section.nth };
}

/** "+0.5 s", "−1.2 s", or "" at none: how far the nudge has moved the song. */
export function nudgeLabel(sec: number): string {
  if (Math.abs(sec) < 0.05) return '';
  return `${sec > 0 ? '+' : '−'}${Math.abs(sec).toFixed(1)} s`;
}

export const mmss = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Where the song is: the clock started when the song was recognised, plus the
 * nudge. `useMusicIntelligence` reads the position through this, every tick
 * and at a nudge, so `npm run score` can run the same arithmetic.
 *
 * The nudge is held here and not written into the track's `offsetSec`, because
 * the fingerprint re-anchors `offsetSec` every few seconds while a song is
 * known (the local matcher, then the API), and a nudge written there would be
 * gone within twelve seconds. The re-anchor is right about where the *audio*
 * is; what the nudge corrects is where the map put an edge, or where a
 * performer hears the chorus begin, which no re-anchor knows. So it outlives
 * every re-anchor of the same song and goes when the song does.
 */
export class SongPosition {
  private isrc: string | null = null;
  private nudgeSec = 0;

  get nudge(): number { return this.nudgeSec; }

  /** The position now, seconds into the song; null when no song is on the clock. A different song takes the nudge away. */
  at(track: { isrc: string; offsetSec?: number; identifiedAtMs?: number } | null, nowMs: number): number | null {
    if (!track || track.identifiedAtMs == null) return null;
    if (track.isrc !== this.isrc) { this.isrc = track.isrc; this.nudgeSec = 0; }
    return Math.max(0, (track.offsetSec ?? 0) + (nowMs - track.identifiedAtMs) / 1000 + this.nudgeSec);
  }

  /** Move the song later (+) or earlier (-). */
  add(deltaSec: number): void { if (Number.isFinite(deltaSec)) this.nudgeSec += deltaSec; }

  /** Take the nudge out. */
  reset(): void { this.nudgeSec = 0; }

  /** The song went: the next one, even the same song played again, starts unnudged. */
  forget(): void { this.isrc = null; this.nudgeSec = 0; }
}
