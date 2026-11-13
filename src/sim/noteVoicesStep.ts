/**
 * Frame-loop step for Melody Walk drops and MIDI notes-as-voices (PLAN 24.3,
 * 24.3-place-1, 19ai-10).
 *
 * Extracted from `components/LiquidVisualizer.tsx` so the frame loop does not
 * grow: drains queued melody and note-on drops through `layMelodyDrop` (same
 * liquid, same pipette physics) and steps held/releasing voices with
 * `voicePour` each simulation step.
 */
import { lookTarget as dyeLookTarget } from '../lib/dyeTarget';
import type { MelodyDrop, MelodyLine } from '../lib/melodyWalk';
import type { MidiEvent, MidiTarget } from '../lib/midi';
import {
  voiceOff,
  voiceOn,
  voicePour,
  type NoteVoices,
  type VoiceDrop,
  type VoiceTool,
} from '../lib/noteVoices';
import type { VisualizerSettings } from '../types';
import type { FluidSimulation } from './fluidSimulation';

export type LayMelodyDropFn = (
  fluid: FluidSimulation,
  d: MelodyDrop,
  gain: number,
  room: number,
  liquid?: string,
  tool?: VoiceTool,
) => void;

/** Queue drops from `MelodyWalk.update` while the dial is up (capped at 4), else clear the queue. */
export function queueMelodyDrops(dropsNow: readonly MelodyDrop[], dialOn: boolean, melodyQueue: MelodyDrop[]): void {
  if (dialOn) {
    for (let i = 0; i < dropsNow.length; i++) melodyQueue.push(dropsNow[i]);
    if (melodyQueue.length > 4) melodyQueue.splice(0, melodyQueue.length - 4);
  } else {
    melodyQueue.length = 0;
  }
}

/**
 * Handle a MIDI note-on or note-off routed to a `{ kind: 'voices' }` binding.
 * Starts or releases the voice in `voices` and queues its initial pipette drop
 * for the next simulation step (capped so a stalled plate never floods).
 */
export function handleNoteVoiceEvent(
  voices: NoteVoices,
  voiceDrops: VoiceDrop[],
  e: MidiEvent,
  target: Extract<MidiTarget, { kind: 'voices' }>,
  line: MelodyLine,
  nowS: number,
): void {
  if (e.kind === 'noteoff' || (e.kind === 'noteon' && e.value <= 0)) {
    voiceOff(voices, e.channel, e.number, nowS);
    return;
  }
  if (e.kind !== 'noteon') return;
  const { drop } = voiceOn(
    voices,
    e.channel,
    e.number,
    e.value,
    nowS,
    {
      tool: target.tool,
      liquid: target.liquid,
      attack: target.attack,
      release: target.release,
      cap: target.cap,
      area: target.area,
    },
    line,
  );
  voiceDrops.push(drop);
  if (voiceDrops.length > 16) voiceDrops.splice(0, voiceDrops.length - 16);
}

const pourScratch: MelodyDrop = { x: 0.5, y: 0.5, along: 0.5, pitch: 60, strength: 0, at: 0 };

/**
 * Run one solver step of Melody Walk drops and MIDI notes-as-voices on the
 * active plate. Zero per-step allocations when steady.
 */
export function stepMelodyAndVoices(
  mf: FluidSimulation | undefined,
  currentSettings: VisualizerSettings,
  running: boolean,
  melodyQueue: MelodyDrop[],
  voices: NoteVoices,
  voiceDrops: VoiceDrop[],
  nowS: number,
  simStepS: number,
  lay: LayMelodyDropFn,
): void {
  const hasMelody = melodyQueue.length > 0;
  const hasVoiceDrops = voiceDrops.length > 0;
  if (!running || !mf) {
    if (hasMelody) melodyQueue.length = 0;
    if (hasVoiceDrops) voiceDrops.length = 0;
    return;
  }

  let room = -1;
  const getRoom = (): number => {
    if (room >= 0) return room;
    const target = dyeLookTarget(mf.seedMean, currentSettings.dyeBudget ?? 0.85, mf.seedBudget);
    const clearPhase = mf.seedMean === 0 && (currentSettings.phaseAmount ?? 0) > 0.002;
    room = clearPhase ? 0 : Math.max(0, Math.min(1, (1.0 - mf.meanDensity / Math.max(0.06, target)) * 2.5));
    return room;
  };

  if (hasMelody) {
    const gain = Math.max(0, Math.min(2, currentSettings.melodyWalk ?? 0));
    if (gain > 0) {
      const r = getRoom();
      for (let i = 0; i < melodyQueue.length; i++) {
        lay(mf, melodyQueue[i], gain, r);
      }
    }
    melodyQueue.length = 0;
  }

  if (hasVoiceDrops) {
    const r = getRoom();
    for (let i = 0; i < voiceDrops.length; i++) {
      const d = voiceDrops[i];
      lay(mf, d, 1, r, d.liquid || undefined, d.tool);
    }
    voiceDrops.length = 0;
  }

  const slots = voices.slots;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.active) continue;
    const pour = voicePour(voices, s.channel, s.pitch, nowS);
    if (pour <= 0) continue;
    const r = getRoom();
    pourScratch.x = s.x;
    pourScratch.y = s.y;
    pourScratch.along = s.along;
    pourScratch.pitch = s.pitch;
    pourScratch.strength = pour;
    pourScratch.at = nowS;
    lay(mf, pourScratch, pour * simStepS * 2.5, r, s.liquid || undefined, s.tool);
  }
}
