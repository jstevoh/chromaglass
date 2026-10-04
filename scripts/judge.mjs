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
 * One moment of a look read on both grounds, for choosing which it goes on
 * (PLAN 18b-1, `npm run lampjudge`): `black` and `lamp` are the same frame,
 * the same size, at Lamp Ground 0 and 1. On a projector the dish is a filter
 * in front of the lamp: clear liquid throws the lamp's own near-white, dye
 * takes colour out of it, and dye deep enough takes all of it and throws
 * black. So, over the dish: `room` marks the pixels that are not the dish,
 * the dark room round a round dish or a vignette, which is black whatever
 * the ground and was counted as dye gone black until it was left out. The
 * room is found by place, not by colour (`roomOf`: black on both grounds at
 * every moment taken), so opaque dye that is black on both grounds at one
 * moment, black ferrofluid or a dense ultramarine, stays in the dish and
 * counts as ink. Throws when under a twentieth of the frame is the dish: two
 * black readbacks are a failed frame, not a look the ground does not reach.
 *
 *   glare   on the lamp, the bare lamp: bright (brightest channel over 80%)
 *           and nearly colourless (channels within a fifth of each other; a
 *           warm lamp's white is about 0.85 blue to red, so it counts)
 *   ink     on the lamp, dye so deep nothing comes through: brightest
 *           channel under 10%
 *   lit     on the lamp, lit colour: brightest channel over 25% and a third
 *           or more of it missing from the dimmest (higher than `colours`
 *           asks, since a pale tint of the lamp is not yet colour to an
 *           audience)
 *   litBlack  the same share on black, to compare
 *   change  the mean difference between the two pictures over the dish, as a
 *           share of full scale: near 0 for a look the ground does not reach
 *           (a photograph, which keeps its paper, or a look whose own dye
 *           already draws the white of a light table)
 *   dish    the share of the frame that is the dish
 */
const darkAt = (px, i) => Math.max(px[i], px[i + 1], px[i + 2]) < 26;

/** The room round the dish, from every moment's pair: a pixel black on both
 *  grounds at all of them. One flag per pixel. */
export const roomOf = (pairs) => {
  const n = pairs[0][0].length / 4;
  const room = new Uint8Array(n).fill(1);
  for (const [black, lamp] of pairs) for (let k = 0; k < n; k++) if (!(darkAt(black, k * 4) && darkAt(lamp, k * 4))) room[k] = 0;
  return room;
};

export const groundPairOf = (black, lamp, room = roomOf([[black, lamp]])) => {
  let dish = 0, glare = 0, ink = 0, lit = 0, litBlack = 0, change = 0;
  const isLit = (px, i) => { const mx = Math.max(px[i], px[i + 1], px[i + 2]), mn = Math.min(px[i], px[i + 1], px[i + 2]); return mx > 64 && (mx - mn) / mx > 0.35; };
  for (let i = 0; i < lamp.length; i += 4) {
    if (room[i / 4]) continue;
    const mx = Math.max(lamp[i], lamp[i + 1], lamp[i + 2]), mn = Math.min(lamp[i], lamp[i + 1], lamp[i + 2]);
    dish++;
    if (mx > 204 && (mx - mn) / mx < 0.2) glare++;
    if (mx < 26) ink++;
    if (isLit(lamp, i)) lit++;
    if (isLit(black, i)) litBlack++;
    change += (Math.abs(lamp[i] - black[i]) + Math.abs(lamp[i + 1] - black[i + 1]) + Math.abs(lamp[i + 2] - black[i + 2])) / 765;
  }
  if (dish < lamp.length / 4 / 20) throw new Error(`groundPairOf: only ${dish} pixels of dish; the frames are black`);
  const n = dish;
  return { glare: glare / n, ink: ink / n, lit: lit / n, litBlack: litBlack / n, change: change / n, dish: dish / (lamp.length / 4) };
};

/** Two frames a moment apart, as one reading. */
export const readingOf = (a, b, W, H) => ({ ...judge(b), motion: motionOf(a, b), detail: detailOf(b, W, H) });
