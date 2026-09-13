import { useEffect, useRef, useState } from 'react';
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

const DEAD = 0.18;
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export function useGamepad(host: GamepadHost, enabled = true) {
  const hostRef = useRef(host); hostRef.current = host;
  const [connected, setConnected] = useState<string | null>(null);
  const [cursor, setCursor] = useState<GamepadCursor>({ x: 0.5, y: 0.5, visible: false, pressing: false });
  const cursorRef = useRef({ x: 0.5, y: 0.5 });
  const prevButtons = useRef<boolean[]>([]);
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
    const onConnect = (e: GamepadEvent) => setConnected(e.gamepad.id.replace(/\s*\(.*$/, ''));
    const onDisconnect = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const still = [...pads].find(p => p && p.connected);
      setConnected(still ? still.id.replace(/\s*\(.*$/, '') : null);
      if (!still) setCursor(c => ({ ...c, visible: false }));
    };
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const pads = navigator.getGamepads?.() ?? [];
      const pad = [...pads].find(p => p && p.connected);
      if (!pad) return;
      if (!connected) setConnected(pad.id.replace(/\s*\(.*$/, ''));
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
      const pressed = pad.buttons.map(b => b.pressed);
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
      if (pressed.some((p, i) => p && !prevButtons.current[i])) active = true;
      prevButtons.current = pressed;

      if (active) idleSince.current = now;
      const visible = now - idleSince.current < 2500;
      const pressing = push > 0 || lt > 0.05 || rt > 0.05;
      if (now - lastCursorPush.current > 33) {
        lastCursorPush.current = now;
        setCursor(prev => (prev.visible === visible && !visible ? prev : { x: c.x, y: c.y, visible, pressing }));
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
