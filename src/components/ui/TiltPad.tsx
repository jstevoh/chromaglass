import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  PAD_DEAD, PAD_SPRING_MS, bearingName, padKey, padToTilt, pointerToPad, springAt, tiltToPad, type Tilt,
} from '../../lib/tiltPad';

/*
  The tilt pad: a joystick for Gravity and Tilt Direction (lib/tiltPad.ts says
  why a disc, and what the numbers are).

  It draws the plate's own two settings and writes them, so it is never out of
  step with the Gravity and Tilt Direction faders, a look that sets them, the
  phone's motion sensor or a controller: whichever moved last is where the puck
  is. Nothing is held here but the grab (where the puck was when the pointer
  went down) and a return in flight.

  Spring is the stick's own spring. With it on, letting go sends the puck back
  to where it was when it was grabbed, not to the middle: a look that stands the
  plate up (Lava Lamp has Gravity 1) is a tilt the hand has not touched, and a
  stick that dropped it to level on release would take the look's own gravity
  away the first time the pad was used. Tip it one way, flick it the other and
  let go, and the liquid slops across, runs back past the middle and settles
  where the look had it (Slosh, lib/slosh.ts, is what makes that a slop and not
  a slide). With Spring off the puck stays where it is let go, which is a held
  tilt.
*/

export interface TiltPadProps {
  /** The plate's Gravity (`plateUpright`) and Tilt Direction (`tiltDirection`). */
  upright: number;
  direction: number;
  /** Both together, as one settings patch, so a frame never sees a new bearing at the old Gravity. */
  onTilt: (tilt: Tilt) => void;
  /** Letting go returns the puck to where it was grabbed. */
  spring: boolean;
  /** Pixels on a side. The phone's is bigger: a thumb is not a pointer. */
  size?: number;
  disabled?: boolean;
  testId?: string;
}

const INSET = 0.08 / 2.16;

export function TiltPad({ upright, direction, onTilt, spring, size = 176, disabled, testId = 'tilt-pad' }: TiltPadProps) {
  const root = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  // The tilt the puck is returned to: the one it had when the hand took it. Kept while a return is in flight, so a second flick before the first has landed still goes home to the look's own tilt.
  const home = useRef<Tilt | null>(null);
  const grabbed = useRef<number | null>(null);
  const flight = useRef<number | null>(null);
  const last = useRef<Tilt>({ upright, direction });
  const now = useRef<Tilt>({ upright, direction });
  now.current = { upright, direction };

  // The latest handler, read at send time: a return in flight outlives the render that started it, and must not call a stale one.
  const handler = useRef(onTilt);
  handler.current = onTilt;
  const send = useCallback((t: Tilt) => {
    const l = last.current;
    if (l.upright === t.upright && l.direction === t.direction) return;
    last.current = t;
    handler.current(t);
  }, []);

  const stopFlight = () => {
    if (flight.current != null) cancelAnimationFrame(flight.current);
    flight.current = null;
  };
  useEffect(() => stopFlight, []);

  const box = () => {
    const r = root.current?.getBoundingClientRect();
    if (!r) return { left: 0, top: 0, width: 0, height: 0 };
    const i = r.width * INSET;
    return { left: r.left + i, top: r.top + i, width: r.width - 2 * i, height: r.height - 2 * i };
  };

  const aim = (e: { clientX: number; clientY: number }) => {
    const p = pointerToPad(e.clientX, e.clientY, box());
    const t = padToTilt(p.x, p.y);
    // The dead ring is level, and level keeps the bearing it had: the tilt of a look that is flat on purpose is not 180 because a pointer crossed the middle.
    send(t.upright === 0 ? { upright: 0, direction: last.current.direction } : t);
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (disabled || e.button > 0) return;
    e.preventDefault();
    root.current?.focus({ preventScroll: true });
    root.current?.setPointerCapture(e.pointerId);
    if (flight.current == null || home.current == null) home.current = { ...now.current };
    stopFlight();
    last.current = { ...now.current };
    grabbed.current = e.pointerId;
    setDragging(true);
    aim(e);
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (grabbed.current !== e.pointerId) return;
    aim(e);
  };
  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (grabbed.current !== e.pointerId) return;
    grabbed.current = null;
    setDragging(false);
    const to = home.current;
    if (!spring || !to) { home.current = null; return; }
    const from = tiltToPad(now.current.upright, now.current.direction);
    const goal = tiltToPad(to.upright, to.direction);
    const t0 = performance.now();
    const step = (t: number) => {
      const k = (t - t0) / PAD_SPRING_MS;
      if (k >= 1) {
        // The exact values the look had, not a round trip through the disc's rounding.
        flight.current = null;
        home.current = null;
        send(to);
        return;
      }
      const p = springAt(from, goal, k);
      const m = padToTilt(p.x, p.y);
      send(m.upright === 0 ? { upright: 0, direction: last.current.direction } : m);
      flight.current = requestAnimationFrame(step);
    };
    flight.current = requestAnimationFrame(step);
  };

  const level = () => { stopFlight(); home.current = null; send({ upright: 0, direction: now.current.direction }); };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (disabled) return;
    if (e.key === 'Escape' || e.key === 'Home' || e.key === '0') { e.preventDefault(); level(); return; }
    const p = padKey(e.key, tiltToPad(now.current.upright, now.current.direction), e.shiftKey);
    if (!p) return;
    e.preventDefault();
    stopFlight();
    home.current = null;
    const t = padToTilt(p.x, p.y);
    send(t.upright === 0 ? { upright: 0, direction: now.current.direction } : t);
  };

  const at = tiltToPad(upright, direction);
  const lean = upright > 0;
  const says = lean
    ? `Gravity ${Math.round(upright * 100)} percent, liquid runs ${bearingName(direction)}`
    : 'Level';

  return (
    <svg
      ref={root}
      viewBox="-1.08 -1.08 2.16 2.16"
      width={size}
      height={size}
      tabIndex={disabled ? -1 : 0}
      role="group"
      aria-roledescription="tilt pad"
      aria-label={`Tilt pad. ${says}. Arrow keys tip it, Escape levels it.`}
      aria-disabled={disabled || undefined}
      data-testid={testId}
      data-upright={upright}
      data-direction={direction}
      data-dragging={dragging || undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={level}
      onKeyDown={onKey}
      style={{ touchAction: 'none', cursor: disabled ? 'not-allowed' : dragging ? 'grabbing' : 'grab', opacity: disabled ? 0.4 : 1 }}
      className="shrink-0 select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      <circle r="1" fill="var(--color-elevated)" stroke="var(--color-border-strong)" strokeWidth="0.02" />
      <circle r="0.5" fill="none" stroke="var(--color-border)" strokeWidth="0.015" />
      <circle r={PAD_DEAD} fill="none" stroke="var(--color-border-strong)" strokeWidth="0.015" />
      <path d="M -1 0 H 1 M 0 -1 V 1" stroke="var(--color-border)" strokeWidth="0.015" />
      {lean && <line x1="0" y1="0" x2={at.x} y2={-at.y} stroke="var(--color-accent)" strokeOpacity="0.55" strokeWidth="0.04" strokeLinecap="round" />}
      <circle
        cx={at.x}
        cy={-at.y}
        r="0.13"
        fill={lean ? 'var(--color-accent)' : 'var(--color-elevated)'}
        stroke={dragging ? '#fff' : 'var(--color-accent)'}
        strokeWidth="0.04"
      />
    </svg>
  );
}
