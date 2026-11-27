/**
 * The projector, for the remote link to report and the owner's assistant to
 * run (PLAN 44k-15; the guard's rules are server/assistantProjector.js).
 *
 * Why a holder here rather than a prop, as outputsNow.ts is: the cast window
 * and the projector mode are useControllers' (useProjector over the cast
 * sender), the wall is useOutput's, and the remote link is useRemote's, all
 * called from App(), which is over its size ceiling and may not grow
 * (`npm run sizes`). The state stays those hooks': this holds a copy of it for
 * reading and the doors that change it, the same calls the projector's chip,
 * the menu's Send to wall and Settings → Wall's controls make.
 *
 * The geometry is judged once, by the guard, before it is sent: only the
 * guard sends this page an `assistant-projector` (the relay keeps the type
 * from phones), and a geometry does not go stale between the guard's look
 * and the page's the way a camera's name does. The page still lays it on
 * through normalizeOutput, as every other way into the wall does.
 */
import { useSyncExternalStore } from 'react';
import { IDENTIFY_MS, normalizeOutput, wallTestOn, type OutputConfig, type WallTest } from '../lib/outputConfig';
import type { ProjectorNow } from '../lib/remoteProtocol';

export type { ProjectorNow };

type Cast = ProjectorNow['cast'];
type Wall = ProjectorNow['wall'];
let now: ProjectorNow = { cast: null, wall: null };
const listeners = new Set<() => void>();
const take = (next: ProjectorNow) => { if (JSON.stringify(next) === JSON.stringify(now)) return; now = next; for (const l of listeners) l(); };

/** The cast window and the projector mode, as useControllers holds them. */
export function publishCast(c: NonNullable<Cast>): void {
  take({ ...now, cast: { screen: c.screen, permission: c.permission, mode: c.mode, casting: c.casting } });
}

/** The wall as useOutput holds it: the geometry and grade (shapes counted, not copied), and the test card. */
export function publishWall(o: OutputConfig, test: WallTest, at = Date.now()): void {
  const wall: NonNullable<Wall> = {
    flipX: o.flipX, flipY: o.flipY, corners: [...o.corners],
    maskTop: o.maskTop, maskRight: o.maskRight, maskBottom: o.maskBottom, maskLeft: o.maskLeft, maskFeather: o.maskFeather,
    gain: o.gain, gamma: o.gamma, flashGuard: o.flashGuard, surfaces: o.surfaces.length,
    test: test.pattern, identifying: wallTestOn({ pattern: false, identifyUntil: test.identifyUntil }, at),
  };
  take({ ...now, wall });
}

/** The cast window: open it on the projector, or close it; and the mode. */
export interface CastDoor { open: () => void; close: () => void; setMode: (m: 'ask' | 'auto' | 'off') => void }
/** The wall: patch the geometry and grade, square it, the test card, Identify. */
export interface WallDoor { patch: (fn: (prev: OutputConfig) => OutputConfig) => void; reset: () => void; test: (fn: (prev: WallTest) => WallTest) => void }
let castDoor: CastDoor | null = null;
let wallDoor: WallDoor | null = null;
export function setCastDoor(d: CastDoor | null): void { castDoor = d; }
export function setWallDoor(d: WallDoor | null): void { wallDoor = d; }

/**
 * Wait for the cast to say it opened. A window opened with no click is a
 * blocked popup in a browser, and the cast sender then says so in a toast and
 * stays shut, so the answer waits to see, rather than "done" for a wall that
 * stayed dark. The Mac app opens it at once, on the projector's screen.
 */
async function opened(waitMs: number): Promise<boolean> {
  for (let t = 0; t < waitMs; t += 100) {
    if (now.cast?.casting) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return !!now.cast?.casting;
}

/**
 * How long a cast waits for the window. Under the MCP server's ANSWER_MS
 * (2.5 s from the guard's yes): an answer later than that is reported as
 * "allowed but not confirmed", and a blocked window would never reach the
 * assistant as the refusal it is. `npm run assistant` holds the two apart.
 */
export const CAST_WAIT_MS = 2000;

/** The guard's `assistant-projector` for the page: done, or why not. */
export async function askProjector(m: { do?: unknown; on?: unknown; mode?: unknown; wall?: unknown }, waitMs = CAST_WAIT_MS): Promise<string | null> {
  if (m.do === 'cast' || m.do === 'mode') {
    if (!castDoor || !now.cast) return 'the projector is not running on this page';
    if (m.do === 'mode') {
      if (m.mode !== 'ask' && m.mode !== 'auto' && m.mode !== 'off') return `mode: ask, auto or off, not ${String(m.mode)}`;
      castDoor.setMode(m.mode);
      return null;
    }
    if (typeof m.on !== 'boolean') return 'cast: on, as true or false';
    if (!m.on) { if (now.cast.casting) castDoor.close(); return null; }
    if (now.cast.casting) return null;
    castDoor.open();
    return (await opened(waitMs)) ? null
      : 'the show\'s window did not open (a browser blocks a window that no click opened: press Send to wall on the laptop, or run the show in the Mac app)';
  }
  if (!wallDoor || !now.wall) return 'the wall is not running on this page';
  if (m.do === 'test') {
    if (typeof m.on !== 'boolean') return 'test: on, as true or false';
    const on = m.on;
    wallDoor.test((w) => ({ ...w, pattern: on }));
    return null;
  }
  if (m.do === 'identify') { wallDoor.test((w) => ({ ...w, identifyUntil: Date.now() + IDENTIFY_MS })); return null; }
  if (m.do === 'wall-reset') { wallDoor.reset(); return null; }
  if (m.do === 'wall') {
    const w = m.wall;
    if (!w || typeof w !== 'object') return 'wall: the geometry or grade to change';
    // The shapes and the test card are never patched from here: the one is the desk's, the other `test`'s.
    const { surfaces: _s, test: _t, ...patch } = w as Partial<OutputConfig>;
    // The flash guard on only, here as at the guard: a safety holds on the page that keeps it, whatever the relay passes.
    wallDoor.patch((prev) => ({ ...normalizeOutput({ ...prev, ...patch }), surfaces: prev.surfaces, flashGuard: prev.flashGuard || patch.flashGuard === true }));
    return null;
  }
  return `projector: cast, mode, test, identify, wall or wall-reset on the page, not ${String(m.do)}`;
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
/** The copy the state carries, for the check. */
export const readProjector = (): ProjectorNow => now;
export const useProjectorNow = () => useSyncExternalStore(subscribe, () => now, () => now);
