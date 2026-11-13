// The design read of a watched video: its colour, its forms, its light and
// its composition, as numbers a critique can stand on (`npm run watch`).
//
// What was asked for (the owner, 2026-11-12): to point Claude at any video
// or animation and get "meaningful feedback" on colour, form and so on, and
// use it to improve the plate. `watch.mjs` already said how a clip moves over
// time (motion, swells, calm, cuts, sound); what it did not say is what each
// frame is made of, so a comparison of a reference against the app came out
// as "theirs is calmer" and the eye had to supply the rest. The eye is good
// at this but loose: "more saturated", "finer", "softer" are each a number,
// and with the number the next take can be judged against the same bar.
//
// Every measure here is chosen to name something a liquid light show is
// made of, and to be read the same on a phone video of a real rig and on a
// take from the app:
//
//   palette        the six colours that cover the most of the clip, by weighted
//                  k-means over a 512-bin colour histogram of every sample.
//                  Hex, a plain name and the share of the frame.
//   colourfulness  Hasler and Süsstrunk (2003), M = σ_rgyb + 0.3 μ_rgyb on the
//                  opponent axes rg = R−G and yb = (R+G)/2 − B. Their bands:
//                  under 15 not colourful, 33 moderately, 59 quite, 82 highly,
//                  over 109 extremely. One number that tracks what people
//                  call "vivid" better than mean saturation does, because a
//                  saturated colour on a small share of a dark frame counts
//                  for what it covers.
//   harmony        the two strongest of twelve 30° hues and the angle between
//                  them (under 45° analogous, near 120° triadic, near 180°
//                  complementary), and the circular spread of hue over the
//                  coloured pixels (0 one hue, 1 every hue alike). Warm share:
//                  coloured pixels from magenta-red through yellow (330° to 90°).
//   contrast       the luminance at the 5th and 95th percentile of the frame,
//                  and its standard deviation (RMS contrast).
//   edge width     how soft the edges are: the frame's luminance range over its
//                  steepest gradients (98th percentile), which for an edge that
//                  ramps across w pixels is w. In % of the frame's width, so a
//                  320-wide sample and the owner's 4K take read alike. Oil on
//                  glass in focus reads well under 1%; a defocused projection,
//                  or a plate drawn from a coarse grid, reads several.
//   scale          the correlation length of luminance: the shift (along x and
//                  along y) at which the frame stops looking like itself, half
//                  its variance gone. In % of width. This is the size of the
//                  forms, cells or wisps, without having to segment them.
//   flow lines     the structure tensor over 16-pixel blocks (a twentieth of the
//                  width): coherence 0 where the gradients point every way
//                  (small blobs, noise), 1 where they all point one way
//                  (filaments, streaks, lines combed out by a flow). Averaged
//                  over blocks weighted by gradient energy, so black space does
//                  not dilute it. Plus the dominant line angle. At that window a
//                  form much bigger than a block shows its rim as a line too:
//                  coherence says how linear the detail is at that scale, and
//                  elongation (below) says whether the forms are threads.
//   forms          the bright regions above the midpoint of the frame's range,
//                  counted, their median size in % of the frame, and their
//                  elongation (minor over major axis of each region's spread:
//                  1 a round cell, near 0 a thread).
//   symmetry       luminance correlation with its own mirror image and with its
//                  half-turn (a kaleidoscope reads near 1 on both; a free pour
//                  near 0).
//   composition    the brightness centroid (0 to 1 across and down), how far
//                  the light spreads from it (0 a point, about 0.4 even), and
//                  which third of the frame across and down holds the most.
//
// Everything is per sample, on the 320-wide frames watch.mjs's first pass
// already decodes, then summarised by the median over samples (a cut or a
// flash does not drag it) with the 10th and 90th percentile where the swing
// itself matters. Plain loops over typed arrays: a ten-minute clip is a
// thousand samples and this adds a few seconds to the watch.

const HUE12 = ['red', 'orange', 'yellow', 'chartreuse', 'green', 'spring green', 'cyan', 'azure', 'blue', 'violet', 'magenta', 'rose'];

/** Hue in degrees, saturation and value of an 8-bit RGB triple (hue -1 when grey). */
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const v = mx / 255, s = mx ? d / mx : 0;
  if (d === 0) return [-1, s, v];
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, v];
}

/** A plain name for a colour: its hue, and dark, light, pale or grey. */
export function colourName(r, g, b) {
  const [h, s, v] = hsv(r, g, b);
  if (v < 0.12) return 'black';
  if (s < 0.18 || h < 0) return v > 0.85 ? 'white' : v > 0.55 ? 'light grey' : v > 0.3 ? 'grey' : 'dark grey';
  const hue = HUE12[Math.floor((h + 15) / 30) % 12];
  const tone = v < 0.35 ? 'dark ' : s < 0.45 && v > 0.7 ? 'pale ' : v < 0.6 ? 'deep ' : '';
  return tone + hue;
}

const hex = c => `#${c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** A running palette: 512 colour bins with their counts and colour sums. */
export function paletteAcc() {
  return { n: new Float64Array(512), r: new Float64Array(512), g: new Float64Array(512), b: new Float64Array(512), total: 0 };
}

function quantile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

/**
 * The design numbers of one frame (`px` RGB24, W×H), and its colours added
 * to `acc` when one is given. Scratch arrays are kept on `acc` so a clip of a
 * thousand samples allocates them once.
 */
export function designFrame(px, W, H, acc = null) {
  const N = W * H;
  const lum = new Float32Array(N);
  let sRg = 0, sYb = 0, sRg2 = 0, sYb2 = 0, coloured = 0, warm = 0, hs = 0, hc = 0;
  const hue12 = new Float64Array(12);
  for (let i = 0, p = 0; p < N; i += 3, p++) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    lum[p] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const rg = r - g, yb = 0.5 * (r + g) - b;
    sRg += rg; sYb += yb; sRg2 += rg * rg; sYb2 += yb * yb;
    if (acc) {
      const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      acc.n[k]++; acc.r[k] += r; acc.g[k] += g; acc.b[k] += b; acc.total++;
    }
    const [h, s, v] = hsv(r, g, b);
    if (h >= 0 && s > 0.25 && v > 0.15) {
      coloured++;
      hue12[Math.floor((h + 15) / 30) % 12]++;
      if (h >= 330 || h < 90) warm++;
      const a = (h * Math.PI) / 180;
      hs += Math.sin(a); hc += Math.cos(a);
    }
  }
  const mRg = sRg / N, mYb = sYb / N;
  const colourfulness = Math.sqrt(Math.max(0, sRg2 / N - mRg * mRg) + Math.max(0, sYb2 / N - mYb * mYb)) + 0.3 * Math.sqrt(mRg * mRg + mYb * mYb);

  // Luminance spread.
  let lsum = 0; for (let p = 0; p < N; p++) lsum += lum[p];
  const lmean = lsum / N;
  let lvar = 0; for (let p = 0; p < N; p++) lvar += (lum[p] - lmean) ** 2;
  const sorted = Float32Array.from(lum).sort();
  const p5 = quantile(sorted, 0.05), p95 = quantile(sorted, 0.95);

  // Gradients (central differences, so a step from 0 to 1 over w pixels reads
  // 1/w), the structure tensor in 16-pixel blocks, and the steep tail.
  const grad = new Float32Array(N);
  const B = 16, bx = Math.floor(W / B), by = Math.floor(H / B);
  const Jxx = new Float64Array(bx * by), Jyy = new Float64Array(bx * by), Jxy = new Float64Array(bx * by);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x;
    const gx = (lum[p + 1] - lum[p - 1]) / 2, gy = (lum[p + W] - lum[p - W]) / 2;
    grad[p] = Math.hypot(gx, gy);
    const cx = Math.floor(x / B), cy = Math.floor(y / B);
    if (cx < bx && cy < by) { const c = cy * bx + cx; Jxx[c] += gx * gx; Jyy[c] += gy * gy; Jxy[c] += gx * gy; }
  }
  const range = p95 - p5;
  // The steep gradients: the 90th percentile of those on an edge at all
  // (steeper than would cross the frame's range in 50 pixels). Not a
  // percentile of every pixel: one sharp edge across a dark frame covers two
  // columns in 320, under the 2% a 98th percentile of the frame would need
  // to see it, and read no edge at all (the self-test's 2-pixel ramp did).
  const steep = [];
  for (let p = 0; p < N; p++) if (grad[p] > 0.02 * range) steep.push(grad[p]);
  steep.sort((a, b) => a - b);
  const gTop = range > 0.05 ? quantile(steep, 0.9) : NaN;
  // A frame with no edges to speak of (one flat colour, or black) has no
  // edge width; null, not a huge number.
  const edgeWidth = Number.isFinite(gTop) && gTop > 0.004 ? (range / gTop / W) * 100 : null;
  const edgeT = Number.isFinite(gTop) ? Math.max(0.02, 0.5 * gTop) : Infinity;
  let onEdge = 0; for (let p = 0; p < N; p++) if (grad[p] > edgeT) onEdge++;

  let cohW = 0, cohS = 0, oS = 0, oC = 0;
  for (let c = 0; c < bx * by; c++) {
    const tr = Jxx[c] + Jyy[c];
    if (tr <= 1e-7) continue;
    const coh = Math.sqrt((Jxx[c] - Jyy[c]) ** 2 + 4 * Jxy[c] ** 2) / tr;
    cohW += tr; cohS += coh * tr;
    // The gradient's dominant angle, doubled so opposite gradients agree;
    // the lines run at right angles to it.
    oS += 2 * Jxy[c]; oC += Jxx[c] - Jyy[c];
  }
  const coherence = cohW > 0 ? cohS / cohW : null;
  let lineAngle = cohW > 0 ? ((0.5 * Math.atan2(oS, oC)) * 180) / Math.PI + 90 : null;
  if (lineAngle != null) lineAngle = ((lineAngle % 180) + 180) % 180;

  // A quarter-size luminance for the correlation lengths and the symmetry.
  const qw = Math.max(8, Math.floor(W / 4)), qh = Math.max(4, Math.floor(H / 4));
  const q = new Float32Array(qw * qh);
  for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) {
    let s = 0, k = 0;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const xx = x * 4 + i, yy = y * 4 + j; if (xx < W && yy < H) { s += lum[yy * W + xx]; k++; } }
    q[y * qw + x] = s / k;
  }
  let qm = 0; for (const v of q) qm += v; qm /= q.length;
  let qv = 0; for (const v of q) qv += (v - qm) ** 2; qv /= q.length;
  const corrLen = (dx, dy, max) => {
    if (qv < 1e-6) return null;
    let prev = 1;
    for (let l = 1; l <= max; l++) {
      let s = 0, k = 0;
      for (let y = 0; y + l * dy < qh; y++) for (let x = 0; x + l * dx < qw; x++) { s += (q[y * qw + x] - qm) * (q[(y + l * dy) * qw + x + l * dx] - qm); k++; }
      const c = k ? s / k / qv : 0;
      // Interpolated to where it crosses a half, in quarter-size pixels.
      if (c < 0.5) return (l - 1 + (prev - 0.5) / Math.max(1e-6, prev - c)) * 4;
      prev = c;
    }
    return null;
  };
  const lx = corrLen(1, 0, Math.floor(qw / 2)), ly = corrLen(0, 1, Math.floor(qh / 2));
  const pearQ = (f) => {
    if (qv < 1e-6) return null;
    let s = 0; for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) { const [x2, y2] = f(x, y); s += (q[y * qw + x] - qm) * (q[y2 * qw + x2] - qm); }
    return s / q.length / qv;
  };
  const mirror = pearQ((x, y) => [qw - 1 - x, y]);
  const halfTurn = pearQ((x, y) => [qw - 1 - x, qh - 1 - y]);

  // Composition: where the light sits, above the frame's own ground (its
  // 5th percentile). Weighted by raw luminance, a dim but not black ground
  // outweighs the subject by its area: a bright disc in the top left of a
  // frame at 4% grey read centred at 0.36 across.
  let cx = 0, cy = 0, wsum = 0;
  const thirds = new Float64Array(9);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = Math.max(0, lum[y * W + x] - p5); cx += v * x; cy += v * y; wsum += v;
    thirds[Math.min(2, Math.floor((3 * y) / H)) * 3 + Math.min(2, Math.floor((3 * x) / W))] += v;
  }
  let spread = null, centroid = null;
  if (wsum > 1e-6 * N) {
    cx /= wsum; cy /= wsum;
    let sd = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sd += Math.max(0, lum[y * W + x] - p5) * ((x - cx) ** 2 + (y - cy) ** 2);
    spread = Math.sqrt(sd / wsum) / Math.hypot(W, H);
    centroid = [cx / (W - 1), cy / (H - 1)];
  }

  // Forms: bright regions on a half-size mask, 4-connected.
  const hw = Math.floor(W / 2), hh = Math.floor(H / 2), M = hw * hh;
  const thr = p5 + 0.5 * range;
  const mask = new Uint8Array(M);
  if (range > 0.05) for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
    const v = (lum[2 * y * W + 2 * x] + lum[2 * y * W + 2 * x + 1] + lum[(2 * y + 1) * W + 2 * x] + lum[(2 * y + 1) * W + 2 * x + 1]) / 4;
    mask[y * hw + x] = v > thr ? 1 : 0;
  }
  const stack = new Int32Array(M);
  const forms = [];
  for (let s0 = 0; s0 < M; s0++) {
    if (mask[s0] !== 1) continue;
    let top = 0; stack[top++] = s0; mask[s0] = 2;
    let a = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    while (top) {
      const p = stack[--top], x = p % hw, y = (p - x) / hw;
      a++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      if (x > 0 && mask[p - 1] === 1) { mask[p - 1] = 2; stack[top++] = p - 1; }
      if (x < hw - 1 && mask[p + 1] === 1) { mask[p + 1] = 2; stack[top++] = p + 1; }
      if (y > 0 && mask[p - hw] === 1) { mask[p - hw] = 2; stack[top++] = p - hw; }
      if (y < hh - 1 && mask[p + hw] === 1) { mask[p + hw] = 2; stack[top++] = p + hw; }
    }
    if (a < 4) continue;
    const mx = sx / a, my = sy / a;
    const vxx = sxx / a - mx * mx + 1 / 12, vyy = syy / a - my * my + 1 / 12, vxy = sxy / a - mx * my;
    const t = (vxx + vyy) / 2, d = Math.sqrt(((vxx - vyy) / 2) ** 2 + vxy * vxy);
    forms.push({ area: a / M, elong: Math.sqrt(Math.max(0, t - d) / Math.max(1e-9, t + d)) });
  }
  forms.sort((u, v) => u.area - v.area);
  // Elongation weighted by area: the big forms are the ones the eye reads.
  let ew = 0, es = 0; for (const f of forms) { ew += f.area; es += f.area * f.elong; }

  const top2 = [...hue12].map((v, i) => [i, v]).sort((u, v) => v[1] - u[1]);
  const second = top2[1][1] >= 0.1 * Math.max(1, coloured) ? top2[1][0] : null;
  let gap = null;
  if (coloured && second != null) { gap = Math.abs(top2[0][0] - second) * 30; if (gap > 180) gap = 360 - gap; }

  return {
    colourfulness, coloured: coloured / N, warm: coloured ? warm / coloured : null,
    hueSpread: coloured ? 1 - Math.hypot(hs, hc) / coloured : null,
    hue1: coloured ? top2[0][0] : null, hue2: coloured ? second : null, hueGap: gap,
    hue12: coloured ? [...hue12].map(v => v / coloured) : null,
    lumMean: lmean, p5, p95, rms: Math.sqrt(lvar / N),
    edgeWidth, edgeShare: onEdge / N,
    scaleX: lx != null ? (lx / W) * 100 : null, scaleY: ly != null ? (ly / W) * 100 : null,
    coherence, lineAngle,
    forms: forms.length, formArea: forms.length ? forms[forms.length >> 1].area : null, elongation: ew > 0 ? es / ew : null,
    mirror, halfTurn, centroid, spread, thirds: centroid ? [...thirds].map(v => v / wsum) : null,
  };
}

/** Weighted k-means over the palette's bins: the k colours that cover the most. */
export function palette(acc, k = 6) {
  const bins = [];
  for (let i = 0; i < 512; i++) if (acc.n[i] > 0) bins.push({ n: acc.n[i], c: [acc.r[i] / acc.n[i], acc.g[i] / acc.n[i], acc.b[i] / acc.n[i]] });
  if (!bins.length) return [];
  bins.sort((a, b) => b.n - a.n);
  // Seeds: the commonest bin, then each next commonest at least 60 apart
  // from those already chosen, so two shades of one black are not two seeds.
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const seeds = [];
  for (const b of bins) { if (seeds.length >= k) break; if (seeds.every(s => d2(s, b.c) > 60 * 60)) seeds.push([...b.c]); }
  let cl = seeds.map(c => ({ c, n: 0 }));
  for (let it = 0; it < 12; it++) {
    const sum = cl.map(() => [0, 0, 0, 0]);
    for (const b of bins) {
      let best = 0, bd = Infinity;
      for (let j = 0; j < cl.length; j++) { const d = d2(cl[j].c, b.c); if (d < bd) { bd = d; best = j; } }
      const s = sum[best]; s[0] += b.n * b.c[0]; s[1] += b.n * b.c[1]; s[2] += b.n * b.c[2]; s[3] += b.n;
    }
    cl = sum.map((s, j) => (s[3] ? { c: [s[0] / s[3], s[1] / s[3], s[2] / s[3]], n: s[3] } : { c: cl[j].c, n: 0 }));
  }
  return cl.filter(c => c.n > 0).sort((a, b) => b.n - a.n)
    .map(c => ({ hex: hex(c.c), rgb: c.c.map(Math.round), name: colourName(...c.c), share: c.n / acc.total }));
}

/** The palette as a strip, each colour as wide as its share. RGB24, w×h. */
export function paletteStrip(pal, w = 960, h = 96) {
  const img = Buffer.alloc(w * h * 3);
  let x0 = 0;
  const tot = pal.reduce((s, p) => s + p.share, 0) || 1;
  pal.forEach((p, i) => {
    const x1 = i === pal.length - 1 ? w : Math.round(x0 + (p.share / tot) * w);
    for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) img.set(p.rgb, (y * w + x) * 3);
    x0 = x1;
  });
  return img;
}

/** The summary over samples: median, and the 10th and 90th percentiles. */
export function designSummary(frames, acc) {
  const stat = key => {
    const v = frames.map(f => f[key]).filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b);
    return v.length ? { med: quantile(v, 0.5), p10: quantile(v, 0.1), p90: quantile(v, 0.9) } : null;
  };
  const keys = ['colourfulness', 'coloured', 'warm', 'hueSpread', 'hueGap', 'lumMean', 'p5', 'p95', 'rms', 'edgeWidth', 'edgeShare',
    'scaleX', 'scaleY', 'coherence', 'forms', 'formArea', 'elongation', 'mirror', 'halfTurn', 'spread'];
  const s = Object.fromEntries(keys.map(k => [k, stat(k)]));
  // Hues over the whole clip, and the line angle by its doubled-angle mean
  // (0° and 179° are the same line).
  const hue = new Float64Array(12); let hn = 0;
  for (const f of frames) if (f.hue12) { f.hue12.forEach((v, i) => (hue[i] += v * f.coloured)); hn += f.coloured; }
  s.hues = hn ? [...hue].map((v, i) => [HUE12[i], v / hn]).sort((a, b) => b[1] - a[1]).filter(x => x[1] >= 0.05) : [];
  let as = 0, ac = 0;
  for (const f of frames) if (f.lineAngle != null && f.coherence != null) { const a = (f.lineAngle * Math.PI) / 90; as += f.coherence * Math.sin(a); ac += f.coherence * Math.cos(a); }
  s.lineAngle = as || ac ? (((Math.atan2(as, ac) * 90) / Math.PI) + 180) % 180 : null;
  const cs = frames.filter(f => f.centroid);
  s.centroid = cs.length ? [0, 1].map(i => quantile(cs.map(f => f.centroid[i]).sort((a, b) => a - b), 0.5)) : null;
  const th = new Float64Array(9); for (const f of frames) if (f.thirds) f.thirds.forEach((v, i) => (th[i] += v));
  const tsum = th.reduce((a, b) => a + b, 0);
  s.thirds = tsum ? [...th].map(v => v / tsum) : null;
  s.palette = acc ? palette(acc) : [];
  s.samples = frames.length;
  return s;
}

const f = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));
const pc = x => (x == null || !Number.isFinite(x) ? '–' : `${(x * 100).toFixed(0)}%`);
const band = (x, cuts) => { if (x == null) return ''; for (const [lim, w] of cuts) if (x < lim) return w; return cuts.at(-1)[1]; };
const range = (st, fmt = f) => (st ? `${fmt(st.med)} (${fmt(st.p10)} to ${fmt(st.p90)})` : '–');

/** The design section of summary.md: numbers, each with what it means. */
export function designLines(s) {
  const M = s.colourfulness?.med;
  const vivid = band(M, [[15, 'not colourful'], [33, 'slightly colourful'], [45, 'moderately colourful'], [59, 'averagely colourful'], [82, 'quite colourful'], [109, 'highly colourful'], [Infinity, 'extremely colourful']]);
  const gap = s.hueGap?.med;
  const harmony = gap == null ? 'one hue' : band(gap, [[45, 'analogous'], [90, 'near-analogous'], [150, 'triadic'], [Infinity, 'complementary']]);
  const ew = s.edgeWidth?.med;
  const edges = band(ew, [[0.4, 'crisp'], [1, 'clean'], [2.5, 'soft'], [Infinity, 'very soft, blurred']]);
  const coh = s.coherence?.med;
  const lines = band(coh, [[0.3, 'no grain: blobs and texture going every way'], [0.5, 'some flow lines'], [0.7, 'flow lines: filaments and combed streaks'], [Infinity, 'strongly linear: streaks or stripes']]);
  const el = s.elongation?.med;
  const shape = band(el, [[0.3, 'threads and filaments'], [0.55, 'elongated lobes'], [0.8, 'rounded forms'], [Infinity, 'round cells and discs']]);
  const sym = Math.max(s.mirror?.med ?? -1, s.halfTurn?.med ?? -1);
  const symWord = band(sym, [[0.3, 'free, asymmetric'], [0.6, 'loosely balanced'], [0.85, 'clearly symmetric'], [Infinity, 'kaleidoscopic']]);
  const sx = s.scaleX?.med, sy = s.scaleY?.med;
  const thirdNames = ['top left', 'top', 'top right', 'left', 'centre', 'right', 'bottom left', 'bottom', 'bottom right'];
  const ti = s.thirds ? s.thirds.indexOf(Math.max(...s.thirds)) : -1;
  return [
    '## Design',
    '',
    `Medians over ${s.samples} samples, with the 10th to 90th percentile in brackets. Definitions: \`scripts/watchdesign.mjs\`.`,
    '',
    `- **palette** (share of the whole clip): ${s.palette.map(p => `${p.name} ${p.hex} ${pc(p.share)}`).join(', ') || 'none'}`,
    `- **colourfulness** ${range(s.colourfulness, x => f(x, 0))}: ${vivid} (Hasler–Süsstrunk: 33 moderate, 59 quite, 82 highly, 109 extremely)`,
    `- **hues**: ${s.hues.map(([n, v]) => `${n} ${pc(v)}`).join(', ') || 'none'}; coloured ${range(s.coloured, pc)} of the frame; the two strongest ${f(gap, 0)}° apart, ${harmony}; spread ${range(s.hueSpread, x => f(x, 2))} (0 one hue, 1 all); warm ${range(s.warm, pc)} of the colour`,
    `- **light**: mean luminance ${range(s.lumMean, x => f(x, 2))}; 5th to 95th percentile ${f(s.p5?.med, 2)} to ${f(s.p95?.med, 2)}; RMS contrast ${range(s.rms, x => f(x, 2))}`,
    `- **edges**: width ${range(s.edgeWidth, x => `${f(x, 2)}%`)} of the frame's width, ${edges}; ${range(s.edgeShare, pc)} of the frame on an edge`,
    `- **scale**: forms hold together over ${f(sx, 1)}% of the width across and ${f(sy, 1)}% down${sx && sy ? ` (${sx / sy > 1.4 ? 'stretched across' : sy / sx > 1.4 ? 'stretched down' : 'about even'})` : ''}; 10th to 90th across ${f(s.scaleX?.p10, 1)} to ${f(s.scaleX?.p90, 1)}%`,
    `- **flow lines**: coherence ${range(s.coherence, x => f(x, 2))}, ${lines}${coh != null && coh >= 0.5 && s.lineAngle != null ? `, running at ${f(s.lineAngle, 0)}° (0 across, 90 up and down)` : ''}`,
    `- **forms**: ${range(s.forms, x => f(x, 0))} bright forms a frame, median size ${range(s.formArea, x => `${f(x * 100, 2)}%`)} of the frame; elongation ${range(s.elongation, x => f(x, 2))}, ${shape}`,
    `- **symmetry**: mirror ${range(s.mirror, x => f(x, 2))}, half-turn ${range(s.halfTurn, x => f(x, 2))}: ${symWord}`,
    `- **composition**: light centred at ${s.centroid ? `${f(s.centroid[0], 2)} across, ${f(s.centroid[1], 2)} down` : '–'}, spread ${range(s.spread, x => f(x, 2))} (0 a point, about 0.4 even); most light in the ${ti >= 0 ? thirdNames[ti] : '–'} third (${s.thirds ? pc(s.thirds[ti]) : '–'})`,
  ];
}

/**
 * A reference against this clip, in words: the measures that differ most,
 * biggest first. Scales are compared as ratios (a form twice the size is the
 * same gap at any size), shares and correlations as differences.
 */
export function compareDesign(ref, cur, refName = 'the reference', curName = 'this') {
  const rows = [];
  const add = (label, key, kind, words) => {
    const a = ref[key]?.med, b = cur[key]?.med;
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return;
    let size, say;
    if (kind === 'ratio') {
      if (a <= 0 || b <= 0) return;
      size = Math.abs(Math.log(b / a)) / Math.log(1.5);
      say = `${label}: ${curName} ${f(b, 2)} against ${f(a, 2)}, ${b > a ? `${f(b / a, 1)}× ${words[0]}` : `${f(a / b, 1)}× ${words[1]}`}`;
    } else {
      size = Math.abs(b - a) / kind;
      say = `${label}: ${curName} ${f(b, 2)} against ${f(a, 2)}, ${b > a ? words[0] : words[1]}`;
    }
    rows.push({ size, say });
  };
  add('colourfulness', 'colourfulness', 15, ['more vivid', 'duller']);
  add('coloured share of the frame', 'coloured', 0.15, ['more of the frame coloured', 'less of the frame coloured']);
  add('hue spread', 'hueSpread', 0.2, ['more hues at once', 'fewer hues at once']);
  add('warm share', 'warm', 0.2, ['warmer', 'cooler']);
  add('mean luminance', 'lumMean', 0.08, ['brighter', 'darker']);
  add('RMS contrast', 'rms', 0.05, ['more contrast', 'flatter']);
  add('edge width (% of width)', 'edgeWidth', 'ratio', ['softer edges', 'crisper edges']);
  add('form scale across (% of width)', 'scaleX', 'ratio', ['larger forms', 'finer forms']);
  add('flow-line coherence', 'coherence', 0.12, ['more filaments and streaks', 'blobbier, fewer flow lines']);
  add('forms a frame', 'forms', 'ratio', ['more separate forms', 'fewer separate forms']);
  add('elongation', 'elongation', 0.15, ['rounder forms', 'more stretched forms']);
  add('mirror symmetry', 'mirror', 0.2, ['more symmetric', 'less symmetric']);
  add('spread of the light', 'spread', 0.06, ['light spread wider', 'light more concentrated']);
  rows.sort((u, v) => v.size - u.size);
  const pal = p => p.slice(0, 4).map(x => `${x.name} ${pc(x.share)}`).join(', ');
  return [
    `## Design against ${refName}`,
    '',
    `Biggest gaps first; a size of 1 is about a just-noticeable step (15 colourfulness, 1.5× a scale, 0.15 of a share).`,
    '',
    ...rows.map(r => `- (${f(r.size, 1)}) ${r.say}`),
    `- palette: ${refName} ${pal(ref.palette ?? [])}; ${curName} ${pal(cur.palette ?? [])}`,
  ];
}
