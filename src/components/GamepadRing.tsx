import { useLayoutEffect, useRef } from 'react';
import { useRingLook, type CursorStore } from '../hooks/useGamepad';

/**
 * The game controller's ring over the plate (PLAN.md 14ab-8).
 *
 * The App used to hold the ring's place as state and render, whole, thirty
 * times a second while a stick moved it. Now the hook's cursor lives in a store
 * and this ring is the only thing that listens: it renders when the ring
 * appears, goes, or swells under a trigger (`useRingLook`), and moves with a
 * style write straight onto its element, which no render is needed for.
 * `rect` is where the plate is drawn (the cursor's x and y run across it).
 */
export function GamepadRing({ cursor, rect, colour }: {
  cursor: CursorStore;
  rect: () => { left: number; top: number; width: number; height: number };
  colour: string;
}) {
  const look = useRingLook(cursor);
  const el = useRef<HTMLDivElement>(null);
  const rectRef = useRef(rect); rectRef.current = rect;
  // Before paint, so a ring that has just appeared is never seen at the corner.
  useLayoutEffect(() => {
    const place = () => {
      const node = el.current;
      if (!node) return;
      const c = cursor.get();
      const box = rectRef.current();
      node.style.left = `${box.left + c.x * box.width}px`;
      node.style.top = `${box.top + (1 - c.y) * box.height}px`;
    };
    place();
    return cursor.subscribe(place);
  }, [cursor, look]);
  if (look === 'hidden') return null;
  const pressing = look === 'pressing';
  return (
    <div
      ref={el}
      className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 shadow-[0_0_12px_rgba(255,255,255,0.6)] transition-transform"
      style={{ width: pressing ? 44 : 28, height: pressing ? 44 : 28, backgroundColor: pressing ? `${colour}55` : 'transparent' }}
      data-testid="gamepad-cursor"
    />
  );
}
