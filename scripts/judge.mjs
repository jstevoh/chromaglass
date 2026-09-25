/**
 * A frame as numbers, for judging looks and controls by more than eye
 * (scripts/controls.mjs, scripts/gallery.mjs). Pixels are RGBA, W×H.
 *
 *   luma      mean brightness, 0..1
 *   colours   the share of pixels with real colour in them
 *   flat      the share of the frame in its single commonest colour
 *             (coarsely bucketed: a gradient backdrop is still one colour)
 *   cast      how far the mean colour leans off grey
 *   detail    mean luminance gradient: fine structure, edges
 *   motion    (of two frames) how much changed between them
 */
export const judge = (px) => {
  const bins = new Map();
  let n = 0, lum = 0, sat = 0, rg = 0, yb = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    bins.set(k, (bins.get(k) ?? 0) + 1);
    lum += 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 40 && (mx - mn) / mx > 0.25) sat++;
    rg += r - g; yb += (r + g) / 2 - b;
    n++;
  }
  let top = 0;
  for (const v of bins.values()) if (v > top) top = v;
  return { luma: lum / n / 255, colours: sat / n, flat: top / n, cast: Math.hypot(rg / n, yb / n) / 255 };
};

export const detailOf = (px, W, H) => {
  let t = 0;
  const L = (i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const i = (y * W + x) * 4;
    t += Math.abs(L(i + 4) - L(i)) + Math.abs(L(i + W * 4) - L(i));
  }
  return t / ((W - 1) * (H - 1)) / 255;
};

export const motionOf = (a, b) => {
  let t = 0;
  for (let i = 0; i < a.length; i += 4) t += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  return t / (a.length / 4) / 3 / 255;
};

/** Two frames a moment apart, as one reading. */
export const readingOf = (a, b, W, H) => ({ ...judge(b), motion: motionOf(a, b), detail: detailOf(b, W, H) });
