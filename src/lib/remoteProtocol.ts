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
  | 'automate-off';

/** What the phone shows: mirrored from the display, never guessed. */
export interface RemoteState {
  settings: VisualizerSettings;
  activePresetId: string | null;
  isActive: boolean;
  isAutomated: boolean;
  /** Now-playing title, when music intelligence has identified something. */
  trackName?: string | null;
}

export type RemoteMessage =
  /** Sent on connect so the relay knows which way to route. */
  | { type: 'hello'; role: 'display' | 'controller' }
  /** Relay → display, when a controller joins and needs a snapshot. */
  | { type: 'request-state' }
  /** Display → controllers. */
  | { type: 'state'; state: RemoteState }
  /** Controller → display. */
  | { type: 'patch'; settings: Partial<VisualizerSettings> }
  | { type: 'preset'; presetId: string }
  | { type: 'action'; action: RemoteAction };

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
  try {
    const res = await fetch(REMOTE_INFO_PATH, { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return false;
    const body = (await res.json()) as { chromaglass?: unknown };
    return body?.chromaglass === 'relay';
  } catch {
    return false;
  }
}
