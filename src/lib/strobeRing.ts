/*
  The ring of dots round Auto Spin (PLAN 35f), after the strobe rim of a
  turntable platter. Those dots stand still under a lamp that flickers in step
  with the mains, because the platter turns exactly one dot's spacing between
  two flashes. The ring here is lit by the beat in the same way: in Tempo the
  dish turns once in `beats` beats, so between two beats it turns 360 / beats
  degrees, and a ring with `beats` dots has that for its spacing. Seen once a
  beat it does not move at all, however fast the dish goes. That is locked, and
  it needs no word.

  A ring cannot have more dots than a few pixels allow, so past MAX_DOTS beats
  a turn the ring keeps MAX_DOTS dots and the alias shows: each beat the dish
  turns a little less or more than one spacing, and the ring creeps at that
  difference. Honest as a platter's would be.

  In Rate the dish is not lit by the beat, so the ring turns at the dish's
  speed, rpm * 6 degrees a second, drawn at a tenth of a turn a second at most
  so a 45 rpm dish is a blur of dots and not a strobing one.
*/
import { SPIN_BEATS_RANGE, SPIN_RATE, SPIN_RPM_MAX, SPIN_TEMPO } from './turntable';

export const MAX_DOTS = 32;

export interface Strobe {
  dots: number;
  /** How the ring drifts on screen, degrees a second (signed). 0 is standing still. */
  driftDegPerS: number;
  /** In Tempo with a tempo heard: the ring is lit by the beat. */
  strobed: boolean;
  /** Auto Spin is off: the ring is drawn, still and dim. */
  off: boolean;
}

/** Wrap an angle into [-half, half) of a period. */
const wrapTo = (a: number, period: number) => {
  const m = ((a % period) + period) % period;
  return m >= period / 2 ? m - period : m;
};

export function strobeOf(mode: number, rpm: number, beats: number, bpm: number): Strobe {
  const m = Math.round(Number.isFinite(mode) ? mode : 0);
  if (m !== SPIN_RATE && m !== SPIN_TEMPO) return { dots: MAX_DOTS, driftDegPerS: 0, strobed: false, off: true };
  const rpmC = Math.max(-SPIN_RPM_MAX, Math.min(SPIN_RPM_MAX, Number.isFinite(rpm) ? rpm : 0));
  const spinDeg = rpmC * 6;
  if (m === SPIN_RATE || !(bpm > 0)) {
    // Tempo with no tempo heard yet turns at the Rate (lib/turntable.ts AutoSpin).
    const shown = Math.sign(spinDeg) * Math.min(Math.abs(spinDeg), 36);
    return { dots: MAX_DOTS, driftDegPerS: shown, strobed: false, off: false };
  }
  const n = Math.round(Math.max(SPIN_BEATS_RANGE[0], Math.min(SPIN_BEATS_RANGE[1], Number.isFinite(beats) ? beats : 16)));
  const sign = rpmC < 0 ? -1 : 1;
  const dots = Math.min(n, MAX_DOTS);
  const spacing = 360 / dots;
  const perBeat = sign * 360 / n;                 // what the dish turns between two beats, degrees
  const seen = wrapTo(perBeat, spacing);           // what the strobe shows of it
  const aliased = Math.abs(seen) < 1e-9 ? 0 : seen;
  return { dots, driftDegPerS: aliased * bpm / 60, strobed: true, off: false };
}
