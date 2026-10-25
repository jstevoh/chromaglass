import { useEffect, useId, useState } from 'react';
import { blackbodyHex, kelvinLabel, warmthKelvin } from '../../lib/lampKelvin';
import { FORM_S, dripFallFor } from '../../lib/dripPace';

/*
  Small machines inside controls (PLAN 35e): a bottle that tips and holds what
  is left of the Dye Budget, a drop that lets go at the pace of the carrier's
  viscosity, and a bulb whose filament glows the colour of the temperature the
  Lamp Warmth grade matches. Each moves only inside its own few pixels, and
  stands still under reduced motion (index.css). Colour says where, never
  whether: the drop and the bottle's outline take the control's own text colour,
  so violet stays "on" and red stays "live".
*/

// ── Bottle ───────────────────────────────────────────────────────────

/** The bottle in its own frame: a neck, a shoulder, a body from y 7.3 to 21. */
const BOTTLE = 'M6 1.6h4v3.1l2.4 2.6v12.2a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6V7.3L6 4.7z';
const BODY_TOP = 7.3, BODY_BOTTOM = 21;
/** How far it leans when picked, degrees: far enough to read as tipped, short of pouring out. */
const TIP_DEG = -26;
const PIVOT = '8px 18px';

/**
 * A bottle of liquid. `level` is how full it stands, 0 to 1, and `tipped` leans
 * it forward, ready to pour. The surface stays level as the bottle leans (the
 * liquid is drawn in the room's frame and clipped by the bottle's), which is
 * what a real one does and what makes the lean read as a tilt, not a turn.
 * `colour` is the liquid's own, or transparent for clear liquid, which is then
 * drawn as a faint tint so there is something to see rise and fall.
 */
export function Bottle({ colour, level, tipped = false, height = 20, testId }: {
  colour: string; level: number; tipped?: boolean; height?: number; testId?: string;
}) {
  const id = useId();
  const clipId = `cg-bottle-${id.replace(/:/g, '')}`;
  const lv = Math.max(0, Math.min(1, level));
  const surface = BODY_BOTTOM - (BODY_BOTTOM - BODY_TOP) * lv;
  const clear = colour === 'transparent';
  const lean = tipped ? TIP_DEG : 0;
  const frame = (deg: number) => ({ transform: `rotate(${deg}deg)`, transformOrigin: PIVOT }) as const;
  return (
    <svg
      viewBox="0 0 16 22" width={height * 16 / 22} height={height}
      aria-hidden overflow="visible" className="shrink-0"
      data-testid={testId} data-level={lv.toFixed(2)} data-tipped={tipped ? 'true' : 'false'}
    >
      <g className="cg-tip" style={frame(lean)}>
        <clipPath id={clipId}><path d={BOTTLE} /></clipPath>
        <g clipPath={`url(#${clipId})`}>
          <g className="cg-tip" style={frame(-lean)}>
            <rect x="-8" y={surface} width="32" height="30" fill={clear ? 'currentColor' : colour} opacity={clear ? 0.4 : 1} />
            {clear && <path d={`M-8 ${surface}h32`} stroke="currentColor" strokeWidth="0.9" opacity="0.85" />}
          </g>
        </g>
        <path d={BOTTLE} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/**
 * The reading `read` gives, polled while mounted: how much of the Dye Budget is
 * left. Only the picked bottle asks, a few times a second, and it re-renders
 * only when the level moves a twentieth, so a plate at rest costs nothing and
 * nothing above it re-renders (`npm run renders`).
 */
export function useDyeRoom(read: (() => number) | undefined): number {
  const [room, setRoom] = useState(1);
  useEffect(() => {
    if (!read) return;
    const poll = () => {
      const v = Math.round(Math.max(0, Math.min(1, read())) * 20) / 20;
      setRoom(prev => (prev === v ? prev : v));
    };
    poll();
    const id = setInterval(poll, 400);
    return () => clearInterval(id);
  }, [read]);
  return read ? room : 1;
}

/** The picked bottle: tipped, and filled to what is left of the Dye Budget as `read` gives it. */
export function LiveBottle({ colour, read, height, tipped = true, testId }: { colour: string; read: (() => number) | undefined; height?: number; tipped?: boolean; testId?: string }) {
  const room = useDyeRoom(read);
  return <Bottle colour={colour} level={room} tipped={tipped} height={height} testId={testId} />;
}

// ── Drip ─────────────────────────────────────────────────────────────

/**
 * A drop at the lip of a button that lets go at its carrier's pace: `mode` is
 * the look's Viscosity word, and the fall is timed by `dripFallFor` (Stokes's
 * terminal speed, the same number the solver reads). Thick also pays out a
 * thread behind the drop. It runs once when the button is hovered, focused or
 * becomes the chosen one (index.css), and at rest it is a drop hanging.
 */
export function ViscosityDrip({ mode }: { mode: 'thick' | 'thin' }) {
  const fall = dripFallFor(mode);
  const thick = mode === 'thick';
  return (
    <svg
      viewBox="0 0 20 22" width="14" height="15" aria-hidden className="cg-drip shrink-0"
      style={{ '--form': `${FORM_S}s`, '--fall': `${fall}s` } as React.CSSProperties}
      data-fall-seconds={fall.toFixed(3)}
    >
      <path d="M5 2h10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {thick && <rect className="cg-thread" x="9.2" y="2" width="1.6" height="10" fill="currentColor" />}
      <g className="cg-fall">
        <circle className="cg-form" cx="10" cy={thick ? 12 : 6.2} r={thick ? 3.4 : 2.6} fill="currentColor" />
      </g>
    </svg>
  );
}

// ── Bulb ─────────────────────────────────────────────────────────────

/**
 * The lamp beside Lamp Warmth: a bulb whose filament and glow are the
 * blackbody colour at the temperature the grade matches (lib/lampKelvin.ts),
 * with that temperature written under it. It does not move; it changes colour
 * with the slider, which is the whole of it.
 */
export function Bulb({ warmth }: { warmth: number }) {
  const hex = blackbodyHex(warmthKelvin(warmth));
  return (
    <span className="flex w-11 shrink-0 flex-col items-center gap-px" data-testid="lamp-bulb" data-kelvin={Math.round(warmthKelvin(warmth))}>
      <svg viewBox="0 0 22 24" width="24" height="26" aria-hidden>
        <circle cx="11" cy="9.5" r="8.8" fill={hex} opacity="0.2" />
        <path d="M7.6 15.6A6.6 6.6 0 1 1 14.4 15.6V18H7.6z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M8 18h6M8.6 20.4h4.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M9 17.4V10.6l1-1.6 1 1.6 1-1.6 1 1.6v6.8" fill="none" stroke={hex} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="whitespace-nowrap font-mono text-[10px] leading-none text-muted">{kelvinLabel(warmth)}</span>
    </span>
  );
}
