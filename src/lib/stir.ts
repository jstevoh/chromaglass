/**
 * Turbulence, the hand stirring the layer: the stir's speed for the dial and
 * the music (PLAN 27c). LiquidVisualizer's deriveStep says why it is this
 * curve and this cap; `npm run rides` holds both.
 *
 * `dial` is the setting (0–1), `energy` the analyser's (0–1, or null with no
 * sound), `impact` Sound Drive.
 */
export function stirOf(dial: number, energy: number | null, impact: number): number {
  const t = Math.max(0, Math.min(1, Number.isFinite(dial) ? dial : 0));
  const speed = t * (1 + 3 * t * t * t);
  if (energy == null) return speed;
  return speed * Math.min(2, 1 + Math.min(1, Math.max(0, energy)) * Math.max(0, impact) * 2.0);
}

/** The same, as it was until PLAN 27c: the dial was the speed, and the music held it to the larger of the dial and 1.2. */
export function stirBefore(dial: number, energy: number | null, impact: number): number {
  const t = dial ?? 0;
  if (energy == null) return t;
  return Math.min(Math.max(t, 1.2), t * (1 + Math.min(1, energy) * impact * 2.0));
}
