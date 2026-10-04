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

/**
 * A frame read as light through dye, for choosing a look's ground (PLAN 18b-1,
 * `npm run lampjudge`). On a projector the dish is a filter in front of the
 * lamp: clear liquid throws the lamp's own near-white, dye takes colour out of
 * it, and dye deep enough takes all of it and throws black. So three shares:
 *
 *   glare   the bare lamp: bright (brightest channel over 80%) and nearly
 *           colourless (channels within a fifth of each other; a warm lamp's
 *           white is about 0.85 blue to red, so it counts)
 *   ink     dye so deep nothing comes through: brightest channel under 10%
 *   lit     lit colour: brightest channel over 25% and a third or more of it
 *           missing from the dimmest (the share `colours` counts, set higher,
 *           since a pale tint of the lamp is not yet colour to an audience)
 *   vivid   Hasler and Süsstrunk's colourfulness (2003), over 255: the
 *           spread of red-green and yellow-blue plus a third of their mean,
 *           the number that tracks how colourful people say a picture is
 */
export const groundOf = (px) => {
  let n = 0, glare = 0, ink = 0, lit = 0, srg = 0, syb = 0, srg2 = 0, syb2 = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 204 && (mx - mn) / mx < 0.2) glare++;
    if (mx < 26) ink++;
    if (mx > 64 && (mx - mn) / mx > 0.35) lit++;
    const rg = r - g, yb = (r + g) / 2 - b;
    srg += rg; syb += yb; srg2 += rg * rg; syb2 += yb * yb;
    n++;
  }
  const mrg = srg / n, myb = syb / n;
  const sd = Math.sqrt(Math.max(0, srg2 / n - mrg * mrg) + Math.max(0, syb2 / n - myb * myb));
  return { glare: glare / n, ink: ink / n, lit: lit / n, vivid: (sd + 0.3 * Math.hypot(mrg, myb)) / 255 };
};

/** Two frames a moment apart, as one reading. */
export const readingOf = (a, b, W, H) => ({ ...judge(b), motion: motionOf(a, b), detail: detailOf(b, W, H) });
