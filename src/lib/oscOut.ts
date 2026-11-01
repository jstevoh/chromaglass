/**
 * OSC out (PLAN.md 13.5-osc): the plate's colour, the sound and the beat, out
 * to a VJ app through the show server, which sends the UDP a page cannot. This
 * is the page's half, shared by Settings and the phone layout: what the switch
 * says, which target it may send, and what is remembered on this machine.
 *
 * The addresses themselves are the server's (`server/osc.js`, written out in
 * `docs/osc.md`). The target's rule is written here again rather than imported
 * because the server never imports `src/` and the page never imports
 * `server/` (server/README.md); `npm run oscout` holds the two to the same
 * answers.
 */

/** Resolume's default OSC input port on this Mac: where OSC out goes until the operator names somewhere else. */
export const OSC_OUT_DEFAULT = '127.0.0.1:7000';

/** The ear's readings OSC out carries, by name, each 0..1 against its own recent range. The server's SOUND_OUT. */
export const SOUND_OUT = ['level', 'kick', 'bass', 'snare', 'hats', 'note'] as const;

/** What the switch shows: null until a show server says it is there. */
export interface OscOutLabel {
  on: boolean;
  /** Where it is sending, or where it will once switched on. */
  target: string;
  /** False while the server holds the packets for want of a Pro licence. */
  pro: boolean;
  says: string;
}

/**
 * "host:port" to send to, tidied, or null: an IPv4 address (a broadcast one
 * reaches every machine on the network) or localhost, port 1 to 65535. Names
 * are refused, not looked up: a venue with no DNS would hold the feed.
 */
export function oscOutTarget(text: string): string | null {
  const m = /^\s*(localhost|\d{1,3}(?:\.\d{1,3}){3})\s*:\s*(\d{1,5})\s*$/.exec(text);
  if (!m) return null;
  const host = m[1] === 'localhost' ? '127.0.0.1' : m[1];
  if (host.split('.').some(o => Number(o) > 255)) return null;
  const port = Number(m[2]);
  return port >= 1 && port <= 65535 ? `${host}:${port}` : null;
}

/** The line beside the switch. */
export function oscOutLine(o: OscOutLabel): string {
  if (!o.on) return o.says.startsWith('off (') ? `Stopped: ${o.says.slice(5, -1)}` : `Off. Sends to ${o.target} when on.`;
  if (!o.pro) return 'Needs a Pro licence: nothing is sent until one is in.';
  return `Sending colour, sound and the beat to ${o.target}`;
}

const KEY = 'chromaglass.oscOut';

/** Remembered on this machine, as Link is: a show is set up once. */
export function loadOscOut(): { on: boolean; target: string } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { on?: unknown; target?: unknown } | null;
    const target = typeof v?.target === 'string' ? oscOutTarget(v.target) : null;
    return { on: v?.on === true, target: target ?? OSC_OUT_DEFAULT };
  } catch { return { on: false, target: OSC_OUT_DEFAULT }; }
}
export function saveOscOut(v: { on: boolean; target: string }): void {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* a private window: not remembered */ }
}
