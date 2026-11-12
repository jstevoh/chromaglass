/**
 * What the show hears, for the remote link to report and the owner's
 * assistant to change (PLAN 44j).
 *
 * Why a holder here rather than a prop. The source is useSoundState's and is
 * changed through useSoundSource's `handleSourceChange`; the remote link is
 * useRemote's; all three are called from App(), which is over its size
 * ceiling and may not grow (`npm run sizes`), so one more pair of arguments
 * passed between them is bytes App.tsx cannot take. app/songCue.ts holds its
 * sink for the same reason. The state stays the sound hooks': this holds a
 * copy of it for reading and the one door that writes it, both set while
 * useSoundSource is mounted.
 */
import { useSyncExternalStore } from 'react';
import type { AudioSource } from './shared';

/**
 * `input` and `inputs` (PLAN 44k-12): the microphone inputs by the names the
 * Sound panel's picker shows, and the one chosen (null: the default
 * microphone). Names, not the browser's device ids: an id is a long opaque
 * string the owner never sees, and the assistant is asked for "the
 * Scarlett", not for an id. The ids stay here, for the door.
 */
export interface SoundNow { source: AudioSource; file: string | null; input: string | null; inputs: string[] }
/** The sources the assistant may pick: a file needs the music player's own choice of file, so it is not one. */
export const ASSISTANT_SOURCES = ['none', 'microphone', 'system', 'simulated', 'drone'] as const;
export type AssistantSource = typeof ASSISTANT_SOURCES[number];

/** What the assistant names the default microphone by, as the picker's first row is "Default microphone". */
export const DEFAULT_INPUT = 'default';

let now: SoundNow = { source: 'none', file: null, input: null, inputs: [] };
let devices: { id: string; label: string }[] = [];
/**
 * The door: a source, and with `device` (an id, '' the default) the
 * microphone's input chosen first. It settles once the source has opened or
 * failed, with why it failed (an interface gone or held by another app only
 * shows when getUserMedia answers), so the answer is never "done" for a
 * microphone that did not open.
 */
type SoundDoor = (s: AudioSource, device?: string) => Promise<string | null> | unknown;
let door: SoundDoor | null = null;
const listeners = new Set<() => void>();
const tell = () => { for (const l of listeners) l(); };

/** The source, from useSoundSource. */
export function publishSound(next: { source: AudioSource; file: string | null }): void {
  if (next.source === now.source && next.file === now.file) return;
  now = { ...now, ...next };
  tell();
}
/**
 * The inputs and the one chosen, from useSoundState, which owns both (the
 * picker's list is enumerateDevices', refreshed on a devicechange and once
 * the microphone is open, since before that permission the browser names
 * none). An id chosen once and since unplugged reads as its id is not
 * listed: null, as the panel's picker then shows its default row.
 */
export function publishInputs(list: { id: string; label: string }[], chosenId: string): void {
  devices = list.map((d) => ({ id: d.id, label: d.label }));
  const inputs = devices.map((d) => d.label);
  const input = devices.find((d) => d.id === chosenId && chosenId !== '')?.label ?? null;
  if (input === now.input && inputs.join('\n') === now.inputs.join('\n')) return;
  now = { ...now, input, inputs };
  tell();
}
export function setSoundDoor(d: SoundDoor | null): void { door = d; }
/**
 * The relay's `assistant-sound`: the source changed, or why not. With
 * `device`, a name from `inputs` (any case) or `default`: only for the
 * microphone, and judged again here on the page's own list, since the
 * guard's copy of the state runs behind (an interface unplugged between the
 * assistant's read and its call is refused here, with the list as it is).
 */
export async function askSound(source: unknown, device?: unknown): Promise<string | null> {
  if (!(ASSISTANT_SOURCES as readonly unknown[]).includes(source)) return `no such source: ${String(source)}`;
  let id: string | undefined;
  if (device !== undefined) {
    if (source !== 'microphone') return `an input is the microphone's: source ${String(source)} takes none`;
    const want = typeof device === 'string' ? device.trim().toLowerCase() : '';
    const hit = want === DEFAULT_INPUT ? { id: '' } : devices.find((d) => d.label === device) ?? devices.find((d) => d.label.trim().toLowerCase() === want);
    if (!hit || !want) return `no microphone input "${String(device)}" (there are: ${[...devices.map((d) => d.label), DEFAULT_INPUT].join(', ')})`;
    id = hit.id;
  }
  if (!door) return 'the sound is not running';
  const why = await door(source as AssistantSource, id);
  return typeof why === 'string' ? why : null;
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
/** The copy the state carries, for the check. */
export const readSound = (): SoundNow => now;
export const useSoundNow = () => useSyncExternalStore(subscribe, () => now, () => now);
