import type { ReactNode } from 'react';
import { paceOf } from '../../lib/settingsMap';
import { Bulb } from './Playful';

/*
  The snail and the hare (PLAN 35d): the two ends of a pace control, drawn as
  the animals they are, so the slow end of Speed reads as slow and the fast end
  as fast without a number. Hand-drawn single lines on a 16 x 12 grid, the
  stroke the app's other pictograms use, in a faint grey that comes up to the
  text colour when the control sits at that end. They do not move: a pace
  control's job is to say how fast, and a pictogram that crawled on its own
  would be a second thing on the screen moving for no reason.
*/
const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.15, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function Snail({ size = 12, flip = false }: { size?: number; flip?: boolean }) {
  return (
    <svg viewBox="0 0 16 12" width={size} height={size * 0.75} aria-hidden style={flip ? { transform: 'scaleX(-1)' } : undefined} {...STROKE}>
      {/* the foot, rising into the neck and head */}
      <path d="M1.2 10.6h10.6c1.7 0 2.7-1 2.7-2.5V5.6" />
      {/* two eye stalks */}
      <path d="M12.6 5.8 12 3.2M14.4 5.6l.9-2.4" />
      {/* the shell, a spiral wound inward */}
      <path d="M3.4 10.4C1.6 7.2 3.2 2.6 6.6 2.4c3 0 4.6 3.2 3 5.6-1.2 1.7-3.8 1.4-4.2-.6-.3-1.4.9-2.4 2-1.8" />
    </svg>
  );
}

export function Hare({ size = 12, flip = false }: { size?: number; flip?: boolean }) {
  return (
    <svg viewBox="0 0 16 12" width={size} height={size * 0.75} aria-hidden style={flip ? { transform: 'scaleX(-1)' } : undefined} {...STROKE}>
      {/* the ears laid back along the run */}
      <path d="M12 4.5C10.6 3 9.4 1.8 8 1.2M12.8 4.4C12.2 2.8 11.2 1.6 9.8 .9" />
      {/* the body in one line: back, haunch, belly, chest and nose */}
      <path d="M12 4.5C9.8 4.9 7.2 4.2 5 5.2 3.2 6 2.8 8 4.4 8.7 7 8.5 9.4 8.1 11 7.5 12.6 7.5 14.2 7.2 15 6.3 14.6 5.2 13.4 4.5 12 4.5" />
      {/* the hind leg thrown back and the fore leg reaching */}
      <path d="M4.4 8.7 1 10.7H2.8M10.6 7.7 13.6 10.4" />
      <circle cx="15" cy="6" r=".4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * A pace control's track with its animals at the ends. A control that is not
 * one of the five (`PACE_KEYS`) is returned as it was, so the three surfaces
 * that draw a slider can wrap the track without asking which it is.
 *
 * `at` is the travel, 0 to 1, as the control draws it (after its curve), which
 * is what lights the animal the thumb is at the end of.
 */
export function PaceTrack({ settingKey, at, children, size = 12 }: { settingKey: string | null | undefined; at: number; children: ReactNode; size?: number }) {
  /*
    Lamp Warmth is the other control that wears a drawing on its track (PLAN
    35e): a bulb at the left whose glow is the grade's colour temperature. Its
    travel is the setting (0 to 1, no curve), so `at` is the warmth itself.
  */
  if (settingKey === 'lampWarmth') {
    return (
      <div className="flex items-center gap-2" data-lamp="">
        <Bulb warmth={at} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  }
  const pace = paceOf(settingKey);
  if (!pace) return <>{children}</>;
  const lit = 'text-text-2', dim = 'text-faint';
  const low = at < 0.06, high = at > 0.94;
  return (
    <div className="flex items-center gap-2" data-pace={pace.bipolar ? 'both' : 'ends'}>
      <span className={`shrink-0 transition-colors duration-[120ms] ${pace.bipolar ? (high || low ? dim : lit) : (low ? lit : dim)}`} data-pace-end={pace.bipolar ? 'hare-low' : 'snail'}>
        {pace.bipolar ? <Hare size={size} flip /> : <Snail size={size} />}
      </span>
      <div className="relative min-w-0 flex-1">
        {children}
        {pace.bipolar && (
          // The stop in the middle is where it stands still: the snail sits on it.
          <span className={`pointer-events-none absolute left-1/2 top-full -mt-1.5 -translate-x-1/2 transition-colors duration-[120ms] ${Math.abs(at - 0.5) < 0.03 ? lit : dim}`} data-pace-end="snail">
            <Snail size={size * 0.8} />
          </span>
        )}
      </div>
      <span className={`shrink-0 transition-colors duration-[120ms] ${high || (pace.bipolar && low) ? lit : dim}`} data-pace-end="hare">
        <Hare size={size} />
      </span>
    </div>
  );
}
