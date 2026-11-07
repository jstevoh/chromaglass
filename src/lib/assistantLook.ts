import type { VisualizerSettings } from '../types';
import { RIG_KEYS, SETUP_KEYS } from './lookFade';
import { sanitizePatch } from './sanitizeSettings';

/**
 * A look the owner's assistant made, armed for the performer's Go (PLAN 44c,
 * the `cue-look` message; the relay's guard is `server/assistant.js`).
 *
 * The assistant names a base look from the library and the settings it wants
 * different. What it hands over is data from outside the app, so it goes
 * through the same `sanitizePatch` a phone's patch does (unknown keys dropped,
 * every number clamped to its travel), and the room's settings are taken out
 * whatever mode the show is in: a look never carries the room (`RIG_KEYS`,
 * `SETUP_KEYS`), and one that did would carry the projector's grid or the
 * microphone's latency on into every look after it. In Full mode the
 * assistant moves the room with a patch, where it can be seen and undone.
 *
 * The armed look keeps its base's id, so Go takes the base's dyes and the
 * library still knows which look is on the plate; the name is the assistant's.
 * A base not in the library, or none named, falls back to the look on the plate.
 */
export interface AssistantLook {
  id: string;
  name: string;
  settings: Partial<VisualizerSettings>;
}

const NAME_MAX = 60;

export function assistantLook(
  message: { name?: unknown; base?: unknown; settings?: unknown },
  presets: readonly { id: string; settings: Partial<VisualizerSettings> }[],
  onPlate: string | null,
): AssistantLook | null {
  const named = typeof message.base === 'string' ? presets.find(p => p.id === message.base) : undefined;
  const base = named ?? (onPlate ? presets.find(p => p.id === onPlate) : undefined);
  const changes = sanitizePatch(message.settings) as Record<string, unknown>;
  for (const key of Object.keys(changes)) {
    if (RIG_KEYS.has(key as keyof VisualizerSettings) || SETUP_KEYS.has(key as keyof VisualizerSettings)) delete changes[key];
  }
  if (!base && Object.keys(changes).length === 0) return null;
  const raw = typeof message.name === 'string' ? message.name.trim().slice(0, NAME_MAX) : '';
  return {
    id: base?.id ?? onPlate ?? 'assistant',
    name: raw || 'From the assistant',
    settings: { ...(base?.settings ?? {}), ...(changes as Partial<VisualizerSettings>) },
  };
}
