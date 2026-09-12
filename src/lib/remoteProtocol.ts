/**
 * Phone-remote protocol.
 *
 * The laptop runs the show — microphone, GPU, the whole visualizer — and the
 * phone is a control surface for it. They talk over a WebSocket relay on the
 * local network (see `server/remote-server.js`), which is chosen over a cloud
 * round-trip because dragging a slider should move the visuals now, not in
 * 200ms, and because a light show shouldn't stop working when the wifi does.
 *
 * Both ends speak the same small message set. The display is authoritative:
 * it owns the state and broadcasts a snapshot whenever anything changes, so a
 * phone that connects (or reconnects) mid-show immediately shows the truth
 * rather than whatever it last remembered.
 */

import type { VisualizerSettings } from '../types';
import type { CastMessage } from './castProtocol';

/** WebSocket path the relay listens on. */
export const REMOTE_WS_PATH = '/remote-ws';
/** Served only by the show server; the display probes it before opening a socket. */
export const REMOTE_INFO_PATH = '/remote-info.json';

/** Query parameter that turns the app into the phone control surface. */
export const REMOTE_QUERY_PARAM = 'remote';

/** One-shot commands that aren't settings changes. */
export type RemoteAction =
  | 'play'
  | 'pause'
  | 'seed'
  | 'clear'
  | 'drain'
  | 'lucky'
  | 'automate-on'
  | 'automate-off'
  /** Hide every overlay on the display (a clean projected frame) / bring them back. */
  | 'overlays-off'
  | 'overlays-on'
  /** The show sequencer's transport. */
  | 'seq-play'
  | 'seq-pause'
  | 'seq-next'
  | 'seq-prev';

/** The sequencer as the phone sees it. */
export interface RemoteSequencer {
  name: string | null;
  running: boolean;
  stageIndex: number;
  stageName: string | null;
  /** 0..1 through the current stage. */
  progress: number;
  stages: { name: string; seconds: number }[];
}

/** What the phone shows: mirrored from the display, never guessed. */
export interface RemoteState {
  settings: VisualizerSettings;
  activePresetId: string | null;
  isActive: boolean;
  isAutomated: boolean;
  /** False while the display is showing nothing but the liquid. */
  overlaysVisible: boolean;
  /** Now-playing title, when music intelligence has identified something. */
  trackName?: string | null;
  /** The show sequencer's transport state, when the display has one. */
  sequencer?: RemoteSequencer;
}

export type RemoteMessage =
  /** Sent on connect so the relay knows which way to route. A mirror is a network display: any browser on the LAN showing the show. */
  | { type: 'hello'; role: 'display' | 'controller' | 'mirror' }
  /** Relay → display, when a network display joins and needs the whole show. */
  | { type: 'request-cast' }
  /** Relay → display: how many network displays are connected. */
  | { type: 'mirrors'; count: number }
  /** Display → network displays: the show itself, the same messages a cast receiver gets. */
  | { type: 'cast'; message: CastMessage }
  /** Relay → display, when a controller joins and needs a snapshot. */
  | { type: 'request-state' }
  /** Display → controllers. */
  | { type: 'state'; state: RemoteState }
  /** Controller → display. */
  | { type: 'patch'; settings: Partial<VisualizerSettings> }
  | { type: 'preset'; presetId: string }
  | { type: 'action'; action: RemoteAction }
  /**
   * The phone as a projectionist: a finger on its pad blows air or drops dye
   * at that point of the plate (normalised, y up), on the layer it holds;
   * its tilt rocks the plate.
   */
  | { type: 'blow'; x: number; y: number; layer: number }
  | { type: 'drop'; x: number; y: number; layer: number }
  | { type: 'tilt'; x: number; y: number };

/** Build the ws:// URL for the relay from the page's own origin. */
export function remoteSocketUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}${REMOTE_WS_PATH}`;
}

/**
 * Is there a relay behind this origin at all? A failed WebSocket handshake is
 * logged by the browser as an error no script can silence, so the display asks
 * this first. A static host answers with the SPA fallback (index.html, 200),
 * which fails the JSON check; only the show server returns the marker.
 */
export async function probeRelay(): Promise<boolean> {
  return (await relayInfo()) !== null;
}

export interface RelayInfo {
  port: number;
  /** The show server's LAN addresses, for the URL a network display opens. */
  hosts: string[];
}

/** The relay's own description of itself, or null when there is none behind this origin. */
export async function relayInfo(): Promise<RelayInfo | null> {
  try {
    const res = await fetch(REMOTE_INFO_PATH, { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    const body = (await res.json()) as { chromaglass?: unknown; port?: number; hosts?: string[] };
    if (body?.chromaglass !== 'relay') return null;
    return { port: body.port ?? (Number(window.location.port) || 3000), hosts: Array.isArray(body.hosts) ? body.hosts : [] };
  } catch {
    return null;
  }
}
