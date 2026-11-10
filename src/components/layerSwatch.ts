/*
  Moved out of LiquidVisualizer.tsx as it was (a pure move), to make room in that file
  for the lamp boil's remote holds (PLAN 36e-2): the file is held at its size ceiling.
*/

/** Held to 0..1. */
const c01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * A layer's mean dye as a swatch.
 *
 * Normalised by its own brightest channel rather than shown raw: a layer with
 * a little dye on it averages to almost black across the whole grid, and a row
 * of near-black squares says nothing. Scaling to the hue keeps a quiet layer
 * legible while `fill` carries how much is actually there.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const peak = Math.max(r, g, b);
  const k = peak > 0.001 ? 0.85 / peak : 0;
  const to = (v: number) => {
    const n = Math.round(c01(v * k) * 255);
    return n.toString(16).padStart(2, '0');
  };
  return peak <= 0.001 ? '#111111' : `#${to(r)}${to(g)}${to(b)}`;
}
