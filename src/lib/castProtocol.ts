/**
 * Casting: the show on a second screen.
 *
 * The receiver — a Chromecast, a wired second display presented through the
 * Presentation API, or a plain popup window — cannot see the sender's canvas.
 * A presentation runs in its own browsing context with no `window.opener`,
 * so the only thing that works everywhere is for the receiver to run the
 * visualizer itself and for the sender to tell it what to draw: the settings
 * as they change, the audio bands thirty times a second, and the one-shot
 * triggers. The pictures then match because the receiver is running the same
 * solver on the same inputs, not because pixels were copied.
 */

import type { VisualizerSettings } from '../types';

/** The BroadcastChannel a popup receiver listens on (same origin, same machine). */
export const CAST_CHANNEL = 'chromaglass-cast';

/** The audio bands the visualizer reads — everything but the raw spectrum. */
export interface CastAudio {
  volume: number;
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  spectralCentroid: number;
  timbre: number;
  complexity: number;
}

export interface CastState {
  settings: VisualizerSettings;
  isActive: boolean;
  isAutomated: boolean;
  activeLayer: number;
  seedCount: number;
  clearTrigger: number;
  drainTrigger: number;
  /** The preset last applied and how many times one has been; the receiver re-seeds when the count rises. */
  presetId: string | null;
  presetSeq: number;
  /** The user's palette lock as palette indices, or null. */
  harmonyLock: number[] | null;
}

export type CastMessage =
  /** Receiver → sender, on load: send me everything. */
  | { type: 'hello' }
  /**
   * Receiver → sender: this window mirrors the sender's own canvas (a second
   * display on the same machine), so the sender should render at this size —
   * the projector's pixels — and need not send the show at all.
   */
  | { type: 'stage'; width: number; height: number }
  /** Sender → receiver. */
  | { type: 'state'; state: CastState }
  | { type: 'audio'; audio: CastAudio | null };
