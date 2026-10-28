import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MidiAction } from '../lib/midi';

/**
 * A game controller as a projectionist's hand.
 *
 * Left stick moves a cursor over the plate; the right stick blows air from
 * the cursor in the direction it is pushed, harder the further it goes. The
 * right trigger drops dye at the cursor, the trigger's travel setting how
 * much; the left trigger blows a plain puff. Shoulders cycle the dye colour,
 * the d-pad steps presets (left/right) and plates (up/down), the face buttons
 * are the one-shots and Start is play/pause.
 *
 * Standard mapping (https://w3c.github.io/gamepad/#remapping): buttons
 * 0 A · 1 B · 2 X · 3 Y · 4 LB · 5 RB · 6 LT · 7 RT · 8 Back · 9 Start ·
 * 10 L3 · 11 R3 · 12 up · 13 down · 14 left · 15 right. Axes 0/1 left
 * stick, 2/3 right stick. Gyro is not part of the Gamepad API, so rocking the
 * plate stays on the phone's tilt.
 */
export interface GamepadHost {
  gesture: (tool: 'blow' | 'drop', x: number, y: number, amount: number, dx?: number, dy?: number) => void;
  action: (action: MidiAction) => void;
  cycleDye: (dir: 1 | -1) => void;
  cycleLayer: (dir: 1 | -1) => void;
}

export interface GamepadCursor { x: number; y: number; visible: boolean; pressing: boolean; }

/**
 * Where the ring is, outside React. The hook used to hand the App a new
 * `cursor` object every thirty-third of a second while the ring showed, which
 * rendered the whole App thirty times a second to move a ring (PLAN.md
 * 14ab-8); now the ring (`GamepadRing`) listens here and the App is told
 * nothing. `set` says whether anything changed, so a held trigger on a
 * still cursor is no event at all.
 */
export interface CursorStore {
  get: () => GamepadCursor;
  set: (next: GamepadCursor) => boolean;
  subscribe: (fn: () => void) => () => void;
}

export function makeCursorStore(): CursorStore {
  let now: GamepadCursor = { x: 0.5, y: 0.5, visible: false, pressing: false };
  const listeners = new Set<() => void>();
  return {
    get: () => now,
    set: (next) => {
      // Hidden stays hidden whatever the stick says: a ring nobody sees has no place.
      if (!next.visible && !now.visible) return false;
      if (next.x === now.x && next.y === now.y && next.visible === now.visible && next.pressing === now.pressing) return false;
      now = next;
      listeners.forEach(fn => fn());
      return true;
    },
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}

/**
 * The ring's look, as a primitive a render can compare: it changes when the
 * ring appears, goes, or grows with a pull of the trigger, and not when it
 * moves. `GamepadRing` renders on this alone.
 */
export const ringLook = (c: GamepadCursor): 'hidden' | 'idle' | 'pressing' => (!c.visible ? 'hidden' : c.pressing ? 'pressing' : 'idle');

/** The ring's look, re-rendering only the caller, and only when `ringLook` changes. */
export function useRingLook(store: CursorStore) {
  return useSyncExternalStore(store.subscribe, () => ringLook(store.get()));
}

const DEAD = 0.18;
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export function useGamepad(host: GamepadHost, enabled = true) {
  const hostRef = useRef(host); hostRef.current = host;
  const [connected, setConnected] = useState<string | null>(null);
  // The name last handed to React: the poll compares against this, not against
  // `connected`, which a timer made once only ever saw as it was then (null),
  // so every tick set the state again.
  const connectedRef = useRef<string | null>(null);
  const storeRef = useRef<CursorStore | null>(null);
  if (!storeRef.current) storeRef.current = makeCursorStore();
  const cursor = storeRef.current;
  const cursorRef = useRef({ x: 0.5, y: 0.5 });
  const prevButtons = useRef<boolean[]>([]);
  const pressedNow = useRef<boolean[]>([]);
  const lastBlow = useRef(0);
  const lastDrop = useRef(0);
  const lastCursorPush = useRef(0);
  const idleSince = useRef(0);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    // Polled on a timer rather than requestAnimationFrame: the laptop's own
    // window may be behind the projector's, and a hidden tab stops animating
    // while the show, and the hand on the controller, carry on.
    let last = performance.now();
    const named = (id: string | null) => {
      if (id === connectedRef.current) return;
      connectedRef.current = id;
      setConnected(id);
    };
    const firstPad = () => {
      const pads = navigator.getGamepads?.() ?? [];
      for (let i = 0; i < pads.length; i++) { const p = pads[i]; if (p && p.connected) return p; }
      return undefined;
    };
    const onConnect = (e: GamepadEvent) => named(e.gamepad.id.replace(/\s*\(.*$/, ''));
    const onDisconnect = () => {
      const still = firstPad();
      named(still ? still.id.replace(/\s*\(.*$/, '') : null);
      if (!still) cursor.set({ ...cursor.get(), visible: false });
    };
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const pad = firstPad();
      if (!pad) return;
      if (!connectedRef.current) named(pad.id.replace(/\s*\(.*$/, ''));
      const h = hostRef.current;
      const ax = pad.axes;
      const lx = dz(ax[0] ?? 0), ly = -dz(ax[1] ?? 0);
      const rx = dz(ax[2] ?? 0), ry = -dz(ax[3] ?? 0);
      const lt = pad.buttons[6]?.value ?? 0, rt = pad.buttons[7]?.value ?? 0;
      let active = false;

      // Cursor: the left stick moves it, faster the further it is pushed.
      if (lx !== 0 || ly !== 0) {
        const c = cursorRef.current;
        c.x = Math.max(0, Math.min(1, c.x + lx * 0.9 * dt));
        c.y = Math.max(0, Math.min(1, c.y + ly * 0.9 * dt));
        active = true;
      }
      const c = cursorRef.current;
      // Right stick: a directed blow from the cursor.
      const push = Math.hypot(rx, ry);
      if (push > 0 && now - lastBlow.current > 40) {
        lastBlow.current = now;
        h.gesture('blow', c.x, c.y, Math.min(1, push), rx, ry);
        active = true;
      }
      // Left trigger: a plain puff at the cursor; right trigger: dye, as much as it is pulled.
      if (lt > 0.05 && now - lastBlow.current > 40) { lastBlow.current = now; h.gesture('blow', c.x, c.y, lt); active = true; }
      if (rt > 0.05 && now - lastDrop.current > 90) { lastDrop.current = now; h.gesture('drop', c.x, c.y, rt); active = true; }

      // Buttons, on their rising edge.
      // Two arrays swapped, not one made a tick (it ran every 16 ms).
      const pressed = pressedNow.current;
      pressed.length = pad.buttons.length;
      for (let i = 0; i < pad.buttons.length; i++) pressed[i] = pad.buttons[i].pressed;
      const rose = (i: number) => pressed[i] && !prevButtons.current[i];
      if (rose(0)) h.action('seed');
      if (rose(1)) h.action('drain');
      if (rose(2)) h.action('lucky');
      if (rose(3)) h.action('overlays-toggle');
      if (rose(4)) h.cycleDye(-1);
      if (rose(5)) h.cycleDye(1);
      if (rose(8)) h.action('automate-toggle');
      if (rose(9)) h.action('play-toggle');
      if (rose(10)) { c.x = 0.5; c.y = 0.5; }
      if (rose(11)) h.action('macro-toggle');
      if (rose(12)) h.cycleLayer(1);
      if (rose(13)) h.cycleLayer(-1);
      if (rose(14)) h.action('preset-prev');
      if (rose(15)) h.action('preset-next');
      for (let i = 0; i < pressed.length; i++) if (pressed[i] && !prevButtons.current[i]) active = true;
      pressedNow.current = prevButtons.current;
      prevButtons.current = pressed;

      if (active) idleSince.current = now;
      const visible = now - idleSince.current < 2500;
      const pressing = push > 0 || lt > 0.05 || rt > 0.05;
      if (now - lastCursorPush.current > 33) {
        lastCursorPush.current = now;
        cursor.set({ x: c.x, y: c.y, visible, pressing });
      }
    };
    const timer = setInterval(tick, 16);
    return () => {
      clearInterval(timer);
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { connected, cursor };
}
