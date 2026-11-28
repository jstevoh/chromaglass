/**
 * The dark-field ring's two filters (PLAN 47b; wgsl/plateDarkField.ts says
 * the optics). Rheinberg's filter is a ring of coloured gel under the
 * condenser: a gel passes its own colour and takes out the rest, so it never
 * adds light. `ringGel(hue, amount)` is that gel at a hue in degrees, from
 * clear (amount 0, plain dark field's white) to a deep theatre gel at 1, in
 * linear light, its brightest channel 1.
 */
export function ringGel(hue: number, amount: number): [number, number, number] {
  const a = Math.min(1, Math.max(0, Number.isFinite(amount) ? amount : 0));
  const h = ((((Number.isFinite(hue) ? hue : 0) % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  // The gel's colour in display units, mixed toward white by how much gel is in, then to linear light.
  const lin = (v: number) => {
    const e = 1 - a * 0.9 * (1 - v);
    return e <= 0.04045 ? e / 12.92 : Math.pow((e + 0.055) / 1.055, 2.4);
  };
  return [lin(r), lin(g), lin(b)];
}

/** Defaults: the macro films' pink in the borders' middles and blue on their steep walls. */
export const RING_INNER_HUE = 330;
export const RING_OUTER_HUE = 205;
