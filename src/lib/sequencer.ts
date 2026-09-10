/**
 * The show as a sequence, not a dice roll.
 *
 * A projectionist working a set does not change things at random. Watching
 * hours of liquid light shows, the same arc keeps appearing: a plate that
 * opens in one colour and slowly admits the others, a build that grows busier
 * toward the chorus and drops back for the verse, a set that walks its hues
 * around the wheel over twenty minutes. Automation on its own can only roll
 * dice; this module gives the show a script.
 *
 * A sequence is a list of stages. Each stage says what the plate should look
 * like — which preset, which settings to override, how many of the preset's
 * dyes are in play — and how the show gets to the next one: after so many
 * seconds, or when the song moves to a new section. The hook that runs it
 * (`useShowSequencer`) interpolates settings between stages so a change reads
 * as a hand slowly turning a knob, never a cut.
 */

import type { VisualizerSettings } from '../types';

/** How a stage hands over to the next one. */
export type StageAdvance = 'time' | 'section' | 'hold';

export interface ShowStage {
  id: string;
  name: string;
  /** How long the stage lasts (for 'time'), or a minimum before a section change may advance it. */
  seconds: number;
  advance: StageAdvance;
  /** Adopt this preset's settings and dye contract on entry — the plate is not cleared. */
  presetId?: string;
  /** Settings to move toward over `transition` seconds, on top of the preset. */
  settings?: Partial<VisualizerSettings>;
  /** How many of the preset's dyes are in play (1 = monochrome). Omit for all of them. */
  paletteSize?: number;
  /** Which dye of the contract leads the window (wraps). */
  paletteLead?: number;
  /** Force the macro camera on or off; omit to leave it as the preset says. */
  macro?: boolean;
  /** Seconds the settings take to arrive. */
  transition: number;
}

export interface ShowSequence {
  id: string;
  name: string;
  description?: string;
  /** Start over when the last stage ends. */
  loop: boolean;
  stages: ShowStage[];
  builtIn?: boolean;
}

let idCounter = 0;
export const stageId = (): string => `st-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/** The numeric fields a stage may glide; everything else switches at stage entry. */
export function lerpSettings(
  from: Partial<VisualizerSettings>,
  to: Partial<VisualizerSettings>,
  t: number,
): Partial<VisualizerSettings> {
  const out: Record<string, unknown> = {};
  const k = Math.max(0, Math.min(1, t));
  for (const key of Object.keys(to) as (keyof VisualizerSettings)[]) {
    const a = from[key], b = to[key];
    if (typeof a === 'number' && typeof b === 'number') {
      out[key] = a + (b - a) * k;
    } else {
      out[key] = k >= 1 || a === undefined ? b : (k > 0.5 ? b : a);
    }
  }
  return out as Partial<VisualizerSettings>;
}

const s = (name: string, seconds: number, extra: Partial<ShowStage>): ShowStage => ({
  id: stageId(), name, seconds, advance: 'time', transition: 8, ...extra,
});

/**
 * Built-in scripts. Each is a reading of an arc seen in the references, not a
 * theory: the times are roughly what the recordings do.
 */
export function builtInSequences(): ShowSequence[] {
  return [
    {
      id: 'slow-build',
      name: 'Slow Build',
      description: 'One dye on bare glass, the plate filling and the other dyes arriving over four minutes, then the whole set turning.',
      loop: true,
      builtIn: true,
      stages: [
        s('Opening — one dye', 60, {
          presetId: 'classic', paletteSize: 1, paletteLead: 0, transition: 4,
          settings: { dyeBudget: 0.35, turbulenceScale: 0.15, audioImpact: 0.3, bubbles: 0.15, plateRock: 0.2, beatSqueeze: 0.2 },
        }),
        s('Second dye in', 60, {
          paletteSize: 2, paletteLead: 0, transition: 20,
          settings: { dyeBudget: 0.6, turbulenceScale: 0.3, audioImpact: 0.45, bubbles: 0.35, plateRock: 0.35, beatSqueeze: 0.4 },
        }),
        s('Full set', 90, {
          paletteSize: 3, paletteLead: 0, transition: 25,
          settings: { dyeBudget: 0.85, turbulenceScale: 0.5, audioImpact: 0.6, bubbles: 0.5, plateRock: 0.45, beatSqueeze: 0.55 },
        }),
        s('Turn the wheel', 90, {
          paletteSize: 3, paletteLead: 1, transition: 30,
          settings: { dyeBudget: 0.9, turbulenceScale: 0.55, audioImpact: 0.65, beatSqueeze: 0.6 },
        }),
        s('Settle', 60, {
          paletteSize: 2, paletteLead: 2, transition: 30,
          settings: { dyeBudget: 0.55, turbulenceScale: 0.25, audioImpact: 0.4, bubbles: 0.25, plateRock: 0.25, beatSqueeze: 0.3 },
        }),
      ],
    },
    {
      id: 'verse-chorus',
      name: 'Verse / Chorus',
      description: 'Follows the song: quiet plate through the verse, the chorus pressed and rocked, the bridge in close-up. Advances when the section changes.',
      loop: true,
      builtIn: true,
      stages: [
        s('Verse', 30, {
          advance: 'section', transition: 6, paletteSize: 2, paletteLead: 0,
          settings: { dyeBudget: 0.6, turbulenceScale: 0.3, audioImpact: 0.45, plateRock: 0.3, beatSqueeze: 0.35, bubbles: 0.3 },
        }),
        s('Chorus', 30, {
          advance: 'section', transition: 3, paletteSize: 3, paletteLead: 0,
          settings: { dyeBudget: 0.95, turbulenceScale: 0.65, audioImpact: 0.8, plateRock: 0.6, beatSqueeze: 0.8, bubbles: 0.6 },
        }),
        s('Verse again', 30, {
          advance: 'section', transition: 6, paletteSize: 2, paletteLead: 1,
          settings: { dyeBudget: 0.6, turbulenceScale: 0.3, audioImpact: 0.45, plateRock: 0.3, beatSqueeze: 0.35, bubbles: 0.3 },
        }),
        s('Bridge — close up', 30, {
          advance: 'section', transition: 4, macro: true, paletteSize: 3, paletteLead: 1,
          settings: { macroZoom: 4.5, macroSync: 0.8, turbulenceScale: 0.45, audioImpact: 0.6 },
        }),
        s('Last chorus', 30, {
          advance: 'section', transition: 3, macro: false, paletteSize: 3, paletteLead: 2,
          settings: { dyeBudget: 1.0, turbulenceScale: 0.7, audioImpact: 0.85, plateRock: 0.65, beatSqueeze: 0.85, bubbles: 0.65 },
        }),
      ],
    },
    {
      id: 'set-journey',
      name: 'Set Journey',
      description: 'A whole set: the classic wheel, a slow oil wheel, the mirrored dish, the chemistry bench, the 1969 poster, and back — each stage a few minutes.',
      loop: true,
      builtIn: true,
      stages: [
        s('Classic wheel', 180, { presetId: 'classic', transition: 10 }),
        s('Oil wheel, hands off', 180, { presetId: 'oil-wheel', transition: 15 }),
        s('Mirrored dish', 150, { presetId: 'classic', transition: 12, settings: { kaleidoscope: 4, dishVignette: 0.7, turbulenceScale: 0.4 } }),
        s('Chemistry bench', 150, { presetId: 'sensual-laboratory', transition: 15 }),
        s('Poster, 1969', 150, { presetId: 'poster-1969', transition: 10 }),
        s('Lumia interlude', 120, { presetId: 'lumia', transition: 20 }),
      ],
    },
  ];
}

const STORAGE_KEY = 'chromaglass-sequences';

export function loadUserSequences(): ShowSequence[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ShowSequence[];
    return Array.isArray(parsed) ? parsed.filter(q => q && Array.isArray(q.stages)) : [];
  } catch {
    return [];
  }
}

export function saveUserSequences(seqs: ShowSequence[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seqs.filter(q => !q.builtIn)));
  } catch { /* private mode, full storage: the show still runs */ }
}

/** A user-editable copy of a sequence (built-ins are read-only). */
export function duplicateSequence(seq: ShowSequence, name?: string): ShowSequence {
  return {
    ...seq,
    id: `seq-${Date.now().toString(36)}`,
    name: name ?? `${seq.name} copy`,
    builtIn: false,
    stages: seq.stages.map(st => ({ ...st, id: stageId(), settings: st.settings ? { ...st.settings } : undefined })),
  };
}

/** What the transport reports — mirrored to the phone. */
export interface SequencerStatus {
  sequenceId: string | null;
  name: string | null;
  running: boolean;
  stageIndex: number;
  stageName: string | null;
  /** 0..1 through the current stage (time-based), or time since entry for section stages. */
  progress: number;
  stages: { name: string; seconds: number; advance: StageAdvance }[];
}
