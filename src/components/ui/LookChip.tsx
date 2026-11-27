import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useMidiTouch } from '../../hooks/useMidiTouch';
import { useLookThumb } from '../../lib/lookThumbs';
import { MIDI_HIT } from './index';

/**
 * A look as a round chip: a picture of the look on the plate, its name on
 * hover (the desk) or a long press (the phone) (PLAN 34b-6).
 *
 * What was asked (the owner, 2026-11-27): the preset lists took a ton of
 * room, each look a 48 px row of coloured slide mount and name; a round chip
 * showing a sample of the look on the canvas instead. On the owner's screen
 * the Cues panel is 270 px wide and held a set of 44 looks: 44 rows of 48 px,
 * 2,112 px to scroll through. As 40 px chips with 8 px between, five to a row,
 * they are 9 rows of 48 px, 432 px: the whole set on screen at once.
 *
 * The picture is a still, never a live view (lib/lookThumbs.ts says why):
 * a shipped look's `public/looks/<id>.webp`, or a saved look's 96 px thumb
 * taken from the plate once. Until a saved look has one, the chip shows the
 * look's two dyes, the swatch the slide mount used to show.
 *
 * States: `live` is ringed in the live red, `next` in the accent, the way the
 * rows were bordered. A controller's touch rings it as every learned control
 * is ringed (MIDI_HIT).
 *
 * The name: `title` for the desk's hover, a label of our own on a long press
 * for a touch screen (where there is no hover, and a long press is the
 * gesture a phone's own home screen uses to tell you what an icon is). The
 * long press also calls `onLongPress` (the desk opens the item's menu there,
 * as a right-click does), and the click a long press ends in is swallowed,
 * so reading a name never fires the look.
 */
export interface LookChipProps {
  /** The look whose picture to show (a preset id); null for none. */
  lookId: string | null | undefined;
  name: string;
  /** Two of the look's dyes, the fallback picture. */
  swatch: string;
  /** Diameter, px. */
  size?: number;
  state?: 'live' | 'next' | 'idle';
  /** Hover text; defaults to the name. */
  title?: string;
  /** Faded, as for a set item whose look is gone. */
  dim?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  onLongPress?: () => void;
  midiKey?: string;
  testId?: string;
  pressed?: boolean;
  /** Small marks over the chip's edge (a song note, a remove ×), positioned by the caller. */
  children?: ReactNode;
}

/** How long a touch is held before it reads as asking for the name, ms. */
export const LONG_PRESS_MS = 450;

export function LookChip({ lookId, name, swatch, size = 40, state = 'idle', title, dim, onClick, onDoubleClick, onContextMenu, onLongPress, midiKey, testId, pressed, children }: LookChipProps) {
  const still = useLookThumb(lookId);
  const hit = useMidiTouch(midiKey ?? null);
  const [naming, setNaming] = useState(false);
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!naming) return;
    const t = window.setTimeout(() => setNaming(false), 1600);
    return () => window.clearTimeout(t);
  }, [naming]);
  const cancel = () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  const ring = state === 'live' ? 'ring-2 ring-live ring-offset-2 ring-offset-bg'
    : state === 'next' ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg'
    : 'ring-1 ring-white/10 hover:ring-white/40';
  return (
    <span className="group relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={() => { if (longPressed.current) { longPressed.current = false; return; } onClick?.(); }}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onPointerDown={(e) => {
          longPressed.current = false;
          if (e.pointerType === 'mouse') return;
          cancel();
          timer.current = window.setTimeout(() => {
            timer.current = null;
            longPressed.current = true;
            setNaming(true);
            onLongPress?.();
          }, LONG_PRESS_MS);
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        title={title ?? name}
        aria-pressed={pressed}
        data-testid={testId}
        data-state={state}
        data-midi-hit={hit ? 'true' : undefined}
        className={`block h-full w-full overflow-hidden rounded-full transition-shadow duration-[120ms] [-webkit-touch-callout:none] select-none ${ring} ${hit ? MIDI_HIT : ''} ${dim ? 'opacity-40' : ''}`}
        style={{ background: swatch }}
      >
        {still && <img src={still} loading="lazy" alt="" draggable={false} className="block h-full w-full object-cover" />}
        {/* The name in the chip's own text, for a screen reader and for anything that reads the list (the checks, the remote's DOM): drawn only on hover or a hold. */}
        <span className="sr-only">{name}</span>
      </button>
      {children}
      {naming && (
        <span
          role="status"
          className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border-strong bg-elevated px-2 py-1 text-[13px] text-text shadow-lg"
          data-testid={testId ? `${testId}-name` : undefined}
        >{name}</span>
      )}
    </span>
  );
}

/** The chip's picture alone, for inside another control (the phone's look button): no button of its own. */
export function LookPicture({ lookId, swatch, size = 36 }: { lookId: string | null | undefined; swatch: string; size?: number }) {
  const still = useLookThumb(lookId);
  return (
    <span aria-hidden className="inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-white/10" style={{ width: size, height: size, background: swatch }}>
      {still && <img src={still} loading="lazy" alt="" draggable={false} className="block h-full w-full object-cover" />}
    </span>
  );
}
