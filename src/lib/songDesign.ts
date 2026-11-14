/**
 * Listen: one press that names the song playing, puts it in the Songs list,
 * and, once the show has heard it through, designs its show around it
 * (PLAN 28h-8).
 *
 * The owner asked for it on 2026-11-08, looking at the Sequence tab: the Songs
 * panel there had a Title and an Artist to type, a Follow switch, and a Score
 * that waits for "a recognised song the show has heard through once". All the
 * pieces existed (the song ID in `hooks/useMusicIntelligence.ts`, the song
 * map its first listen makes, the song shows of `songShows.ts`, the stage
 * sequences of `sequencer.ts`) but nothing joined them, so a song was named by
 * typing it and its show was built action by action. This file is the join,
 * and it is pure: what to do next from what the ear knows (`listenStep`), and
 * what to write once the song is mapped (`designFromMap`). `npm run listen`
 * drives both with a known song.
 *
 * ## What it reuses, and what it does not add
 *
 * No second recogniser. Listen asks the song ID that is already running to
 * try now rather than on its next turn, and reads what it returns; the map is
 * the one the first listen of a song already makes (`songMap.ts`), the same
 * one the Score draws. A song heard before has its map at once, so its show
 * is designed the moment it is named; a new song's map is made when it ends
 * (silence, or the next song), so its show is ready for its next play, which
 * is what "after it has heard the song" means here.
 *
 * ## What it designs
 *
 * Two things, each in the form the person already edits, so a designed show
 * is a starting point and not a black box:
 *
 *   - **A stage sequence made for the song**, one stage per section of the
 *     map, each as long as its section, so the sequencer's own `startAt` puts
 *     a song joined halfway in the right stage. A stage moves the settings a
 *     show reads as the song changing (how much dye, how stirred, how hard the
 *     sound presses and rocks the plate, the bubbles) with the section's
 *     energy against the song's own quietest and loudest sections, not an
 *     absolute level: a quiet ballad still opens up for its chorus. It names
 *     no look, so the song's show's look is the one that plays, and the
 *     stages only ride it; the colours open from two dyes in the intro to the
 *     whole palette for the chorus, turn a dye for each verse, and the bridge
 *     goes in close, as the built-in Verse / Chorus sequence does.
 *   - **Cues on the song's show**, pinned to sections, never to seconds (the
 *     Score's rule: a section is what is meant, its time is an estimate):
 *     the title on the first note, a burst on every chorus, new dyes for the
 *     bridge and the last chorus, the plate drained eight seconds before the
 *     end. A song whose map found no chorus gets its burst on its loudest
 *     section.
 *
 * Designed cues carry ids of their own (`lsn-`), so designing again replaces
 * them and leaves every cue the person added by hand where it was.
 */

import type { SongMap } from './musicTypes';
import type { TrackIdentity } from './musicTypes';
import { sectionKind, type SongAction } from './songShows';
import { stageId, type ShowStage } from './sequencer';
import { songRefFromTrack, type SongRef } from './songRef';

/** The id prefix of a designed cue, and of a designed sequence. */
export const DESIGNED_CUE = 'lsn-';
export const DESIGNED_SEQUENCE = 'seq-lsn-';

/**
 * How long Listen waits for a name before it says it could not hear one. The
 * song ID retries every ten seconds while nothing is named, and the local
 * matcher every six (`useMusicIntelligence`): forty-five seconds is four tries
 * of the first and seven of the second.
 */
export const LISTEN_GIVE_UP_MS = 45_000;

export type ListenPhase =
  /** Not listening. */
  | 'idle'
  /** Waiting for the song ID to name the song. */
  | 'listening'
  /** Named; the show is hearing it through to map it. */
  | 'learning'
  /** Its show is designed. */
  | 'designed'
  /** Nothing named in LISTEN_GIVE_UP_MS. */
  | 'missed'
  /** The song stopped before the show had heard enough of it to map. */
  | 'short';

export interface ListenState {
  phase: ListenPhase;
  /** When Listen was pressed (ms, the caller's clock). */
  startedAt: number;
  /** The song named, once it is. */
  song: SongRef | null;
  /** Its key in the song ID, to tell its map from another song's. */
  isrc: string | null;
  /** What was designed: stages and cues. */
  stages: number;
  cues: number;
  /** The song already had a sequence of the person's own, which Listen left as it was. */
  ownSequence: boolean;
}

export const LISTEN_IDLE: ListenState = { phase: 'idle', startedAt: 0, song: null, isrc: null, stages: 0, cues: 0, ownSequence: false };

/** What the ear knows this moment (`MusicIntelState`, read whole). */
export interface ListenInput {
  now: number;
  track: TrackIdentity | null;
  /** The map of the track playing, when it has one (a song heard before). */
  songMap: SongMap | null;
  /** The map the last first-listen made, kept after its song ended. */
  heardMap: SongMap | null;
  analyzing: boolean;
}

/**
 * What the caller should do: put the named song in the list (`heard`), and/or
 * design its show from this map (`design`). Both can come on one step, for a
 * song that was heard before.
 */
/** What the Songs panel is handed: the state, its line, and the presses. */
export interface ListenControl {
  state: ListenState;
  line: string;
  /** The song Listen added or found, for the panel to open. */
  showId: string | null;
  start: () => void;
  cancel: () => void;
  /** Name it by hand when the song ID could not (the typed Title and Artist). */
  tag: (title: string, artist: string) => void;
}

export interface ListenStep {
  state: ListenState;
  heard: SongRef | null;
  design: SongMap | null;
}

export function startListening(now: number): ListenState {
  return { ...LISTEN_IDLE, phase: 'listening', startedAt: now };
}

/**
 * One step of Listen, from what the ear knows now. Pure: the hook calls it
 * whenever the song ID's state changes, and on a slow tick for the give-up.
 */
export function listenStep(s: ListenState, i: ListenInput): ListenStep {
  const none = { state: s, heard: null, design: null };
  if (s.phase === 'listening' || s.phase === 'missed') {
    if (!i.track) {
      return s.phase === 'listening' && i.now - s.startedAt > LISTEN_GIVE_UP_MS ? { ...none, state: { ...s, phase: 'missed' } } : none;
    }
    const song = songRefFromTrack(i.track);
    const named: ListenState = { ...s, phase: 'learning', song, isrc: i.track.isrc };
    const map = mapFor(i, i.track.isrc);
    return { state: named, heard: song, design: map };
  }
  if (s.phase === 'learning') {
    const map = mapFor(i, s.isrc);
    if (map) return { state: s, heard: null, design: map };
    // The song went (silence, or another song) and its analysis is over with
    // no map: it was not heard long enough to make one.
    const gone = !i.track || i.track.isrc !== s.isrc;
    if (gone && !i.analyzing) return { ...none, state: { ...s, phase: 'short' } };
  }
  return none;
}

/** The map of this song: the one playing's, or the one its first listen just made. */
function mapFor(i: ListenInput, isrc: string | null): SongMap | null {
  if (!isrc) return null;
  if (i.track?.isrc === isrc && i.songMap && i.songMap.isrc === isrc) return i.songMap;
  if (i.heardMap && i.heardMap.isrc === isrc) return i.heardMap;
  return null;
}

/** What the panel says, in a line. */
export function listenLine(s: ListenState, fingerprintEnabled: boolean): string {
  const name = s.song ? `${s.song.title} by ${s.song.artist}` : '';
  switch (s.phase) {
    case 'idle': return 'Press Listen while a song plays: the show names it, adds it here, and designs its show once it has heard it through.';
    case 'listening': return 'Listening for the song…';
    case 'learning': return `Heard: ${name}. Learning the song; its show is designed when it ends.`;
    case 'designed': return s.ownSequence
      ? `Designed for ${name}: ${s.cues} cue${s.cues === 1 ? '' : 's'} on its show; your own sequence for it is kept. They play whenever the song is recognised.`
      : `Designed for ${name}: ${s.stages} stage${s.stages === 1 ? '' : 's'} and ${s.cues} cue${s.cues === 1 ? '' : 's'}. They play whenever the song is recognised.`;
    case 'missed': return fingerprintEnabled
      ? 'Could not name the song. Type its title and artist and press Name it: the show still learns it as it plays.'
      : 'Song ID is not set up in this build. Type the title and artist and press Name it: the show still learns it as it plays.';
    case 'short': return `${name} stopped before the show had heard enough of it. Play it through and press Listen again.`;
  }
}

// ── The design ────────────────────────────────────────────────────────

export interface Design {
  stages: ShowStage[];
  actions: SongAction[];
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
let cueCounter = 0;
const cue = (when: SongAction['when'], what: SongAction['what']): SongAction =>
  ({ id: `${DESIGNED_CUE}${Date.now().toString(36)}-${(cueCounter++).toString(36)}`, when, what });

interface Part { start: number; end: number; label: string; energy: number }

/**
 * A map with one section (a song too short, or too even, for the analysis to
 * cut) gets three parts from its energy curve, so its stages still move.
 */
function partsOf(map: Pick<SongMap, 'durationSec' | 'sections' | 'energyCurve' | 'frameRate'>): Part[] {
  const secs = map.sections.filter((s) => s.end > s.start);
  if (secs.length >= 2) return secs.map((s) => ({ start: s.start, end: s.end, label: s.label, energy: s.energy }));
  const d = Math.max(3, map.durationSec || secs[0]?.end || 3);
  const curve = map.energyCurve ?? [];
  const rate = map.frameRate > 0 ? map.frameRate : curve.length / d;
  const mean = (a: number, b: number): number => {
    const i0 = Math.floor(a * rate), i1 = Math.max(i0 + 1, Math.floor(b * rate));
    let sum = 0, n = 0;
    for (let i = i0; i < i1 && i < curve.length; i++) { sum += curve[i]; n++; }
    return n ? sum / n : 0.5;
  };
  return [['opening', 0, d / 3], ['middle', d / 3, (2 * d) / 3], ['close', (2 * d) / 3, d]]
    .map(([label, a, b]) => ({ label: label as string, start: a as number, end: b as number, energy: mean(a as number, b as number) }));
}

const titleCase = (l: string): string => (l ? l[0].toUpperCase() + l.slice(1) : 'Section');

/**
 * The show designed for a song from its map: one stage per section and the
 * cues on its show. Pure; the ids are new each call.
 */
export function designFromMap(map: Pick<SongMap, 'durationSec' | 'sections' | 'energyCurve' | 'frameRate'>): Design {
  const parts = partsOf(map);
  const lo = Math.min(...parts.map((p) => p.energy)), hi = Math.max(...parts.map((p) => p.energy));
  // Against the song's own range: a ballad's chorus still opens up. A song
  // whose sections are all alike sits in the middle rather than at an end.
  const rel = (e: number): number => (hi - lo > 0.05 ? (e - lo) / (hi - lo) : 0.5);
  const counts: Record<string, number> = {};
  const total: Record<string, number> = {};
  for (const p of parts) { const k = sectionKind(p.label) ?? p.label; total[k] = (total[k] ?? 0) + 1; }

  const stages: ShowStage[] = [];
  let prevE = -1, prevMacro = false;
  for (const p of parts) {
    const kind = sectionKind(p.label);
    const key = kind ?? p.label;
    counts[key] = (counts[key] ?? 0) + 1;
    const nth = counts[key];
    const e = rel(p.energy);
    const seconds = Math.max(1, Math.round((p.end - p.start) * 10) / 10);
    // Up into a louder section quickly, as a hand would on the downbeat; down
    // into a quieter one slowly. Never more than half the stage.
    const into = prevE < 0 ? 3 : e > prevE + 0.15 ? 2.5 : 6;
    const stage: ShowStage = {
      id: stageId(),
      name: total[key] > 1 ? `${titleCase(p.label)} ${nth}` : titleCase(p.label),
      seconds,
      advance: 'time',
      transition: r2(Math.min(into, seconds / 2)),
      settings: {
        dyeBudget: r2(0.45 + 0.5 * e),
        turbulenceScale: r2(0.15 + 0.55 * e),
        audioImpact: r2(0.3 + 0.55 * e),
        plateRock: r2(0.2 + 0.45 * e),
        beatSqueeze: r2(0.2 + 0.65 * e),
        bubbles: r2(0.15 + 0.45 * e),
      },
    };
    if (kind === 'intro' || kind === 'outro') { stage.paletteSize = 2; stage.paletteLead = 0; }
    else if (kind === 'verse') { stage.paletteSize = 3; stage.paletteLead = nth - 1; }
    else if (kind === 'bridge') {
      stage.paletteSize = 3; stage.paletteLead = 2; stage.macro = true;
      stage.settings = { ...stage.settings, macroZoom: 4.5, macroSync: 0.8 };
    }
    // The stage after a close-up goes back out: a stage that names no camera
    // leaves it where the last one put it.
    if (prevMacro && kind !== 'bridge') stage.macro = false;
    prevMacro = stage.macro === true;
    prevE = e;
    stages.push(stage);
  }

  const actions: SongAction[] = [cue({ at: 'start' }, { do: 'title' })];
  const choruses = total.chorus ?? 0;
  if (choruses > 0) {
    actions.push(cue({ at: 'section', section: 'chorus' }, { do: 'burst' }));
    if (choruses > 1) actions.push(cue({ at: 'section', section: 'chorus', nth: choruses }, { do: 'dyes' }));
  } else {
    // No chorus found: the burst goes on the loudest section past the first.
    let best = parts.length > 1 ? 1 : 0;
    for (let i = 1; i < parts.length; i++) if (parts[i].energy > parts[best].energy) best = i;
    if (map.sections.length >= 2) actions.push(cue({ at: 'section', section: 'any', nth: best + 1 }, { do: 'burst' }));
    else actions.push(cue({ at: 'time', sec: Math.round(parts[best].start) }, { do: 'burst' }));
  }
  if ((total.bridge ?? 0) > 0) actions.push(cue({ at: 'section', section: 'bridge', nth: 1 }, { do: 'dyes' }));
  if ((map.durationSec || 0) > 30) actions.push(cue({ at: 'before-end', sec: 8 }, { do: 'drain' }));
  return { stages, actions };
}

/** A song's show's actions with the designed ones replaced: the person's own stay, in their order. */
export function withDesign(actions: readonly SongAction[], designed: readonly SongAction[]): SongAction[] {
  return [...actions.filter((a) => !a.id.startsWith(DESIGNED_CUE)), ...designed];
}
