/**
 * The beat clock's tempo, for the remote link to report and the owner's
 * assistant to set (PLAN 44k-7).
 *
 * Why a holder here rather than a prop, as `soundNow.ts` is for the sound.
 * The tempo is `useTempo`'s, its readout a label sampled four times a second
 * and its ways in (a typed bpm, a tap, back to the ear, Link and Link's
 * transport) callbacks that also remember Link on this machine; the remote
 * link is `useRemote`'s; both are called from App(), which is over its size
 * ceiling and may not grow (`npm run sizes`). So `useTempo` publishes its
 * label here and sets the one door, and `useRemote` reads the one and asks
 * the other. The state stays `useTempo`'s: this holds a copy for reading.
 *
 * Why a typed bpm is the assistant's way in and a tap is only beside it: an
 * assistant cannot tap in time (each call is a round trip of unknown length),
 * so a number it reads off a set list or a track's page is what it has; the
 * tap is there because a person driving the assistant may say "tap it".
 */
import { useSyncExternalStore } from 'react';
import type { TempoLabel } from '../lib/tempo';

/** What `show_state` reads: the bpm the clock runs at, where it comes from, and Link. */
export interface TempoNow {
  bpm: number;
  /** `link`, `clock` (a MIDI clock), `tap`, `manual` (a typed bpm or the set list's), or null: the ear's. */
  source: string | null;
  link: { available: boolean; on: boolean; peers: number; follows: boolean };
}

/**
 * The typed bpm's range: the beat clock's own (`lib/tempo.ts` clamps a period
 * to 300–1000 ms), so a number the clock would quietly fold into it is
 * refused instead, with the range, where the assistant hears why.
 */
export const TEMPO_MIN_BPM = 60;
export const TEMPO_MAX_BPM = 200;

export interface TempoDoor {
  bpm: (bpm: number) => void;
  tap: () => void;
  heard: () => void;
  link: (on: boolean) => void;
  transport: (on: boolean) => void;
}

let now: TempoNow = { bpm: 0, source: null, link: { available: false, on: false, peers: 0, follows: false } };
let door: TempoDoor | null = null;
const listeners = new Set<() => void>();

export function publishTempo(label: TempoLabel): void {
  const link = { available: !!label.link?.available, on: !!label.link?.on, peers: label.link?.peers ?? 0, follows: !!label.link?.follows };
  if (now.bpm === label.bpm && now.source === label.source && now.link.available === link.available
    && now.link.on === link.on && now.link.peers === link.peers && now.link.follows === link.follows) return;
  now = { bpm: label.bpm, source: label.source, link };
  for (const l of listeners) l();
}
export function setTempoDoor(d: TempoDoor | null): void { door = d; }

/** The relay's `assistant-tempo`: done, or why not. Read as untrusted: the guard checked it, but a newer relay may send what this build does not know. */
export function askTempo(m: { do?: unknown; bpm?: unknown }): string | null {
  if (!door) return 'the tempo is not running';
  switch (m.do) {
    case 'bpm': {
      const bpm = m.bpm;
      if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm < TEMPO_MIN_BPM || bpm > TEMPO_MAX_BPM) return `a bpm from ${TEMPO_MIN_BPM} to ${TEMPO_MAX_BPM}`;
      door.bpm(bpm);
      return null;
    }
    case 'tap': door.tap(); return null;
    case 'heard': door.heard(); return null;
    default: return `not a tempo this build knows: ${String(m.do)}`;
  }
}
/** The relay's `assistant-link`: Link on or off, and whether Live's play and stop move the Sequence. */
export function askLink(m: { on?: unknown; transport?: unknown }): string | null {
  if (!door) return 'the tempo is not running';
  if (typeof m.on !== 'boolean' && typeof m.transport !== 'boolean') return 'link: on, transport, or both, as true or false';
  if (typeof m.on === 'boolean') door.link(m.on);
  if (typeof m.transport === 'boolean') door.transport(m.transport);
  return null;
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useTempoNow = () => useSyncExternalStore(subscribe, () => now, () => now);
