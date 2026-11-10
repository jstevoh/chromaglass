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

export interface SoundNow { source: AudioSource; file: string | null }
/** The sources the assistant may pick: a file needs the music player's own choice of file, so it is not one. */
export const ASSISTANT_SOURCES = ['none', 'microphone', 'system', 'simulated', 'drone'] as const;
export type AssistantSource = typeof ASSISTANT_SOURCES[number];

let now: SoundNow = { source: 'none', file: null };
let door: ((s: AudioSource) => void) | null = null;
const listeners = new Set<() => void>();

export function publishSound(next: SoundNow): void {
  if (next.source === now.source && next.file === now.file) return;
  now = next;
  for (const l of listeners) l();
}
export function setSoundDoor(d: ((s: AudioSource) => void) | null): void { door = d; }
/** The relay's `assistant-sound`: the source changed, or why not. */
export function askSound(source: unknown): string | null {
  if (!(ASSISTANT_SOURCES as readonly unknown[]).includes(source)) return `no such source: ${String(source)}`;
  if (!door) return 'the sound is not running';
  door(source as AssistantSource);
  return null;
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useSoundNow = () => useSyncExternalStore(subscribe, () => now, () => now);
