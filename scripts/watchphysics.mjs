// The physics read of a watched video: how the material on screen moves and
// mixes, measured from the frames (`npm run watch`).
//
// Asked for by the owner (2026-11-12), beside the design read: when Claude
// watches a reference, say what is physically happening, not only what it
// looks like. The project's standing rule is that the plate simulates the
// phenomenon (flow, surface tension, diffusion, immiscibility) rather than
// imitating the look, so a reference is only useful to the solver once it is
// read in the solver's terms: how fast the stuff moves, whether it is carried
// (advected) or fades in place, whether the dish turns, whether it spreads
// from a source, how long a form lives, and what the size spectrum of its
// detail says about the mixing. These are those, from pixels:
//
//   flow           block matching between samples a second apart (and one
//                  sample apart where a second is too far for the search),
//                  coarse to fine over three sizes with a sub-pixel finish:
//                  a displacement for each 16-pixel block (at 320 wide) with
//                  enough texture to match. Speeds in % of the frame's width
//                  per second, so a phone video and the app read alike, and in
//                  cm/s once the width of the glass is known (an overhead
//                  projector's stage is about 25 cm across).
//   whole-field    an affine fit to every block's vector: the part of the
//                  motion that is the whole picture moving together (the
//                  camera panning, the dish being slid, turned or zoomed), and
//                  its rotation (from the fit's antisymmetric part, a period in
//                  seconds: a turning dish or a vortex filling the view) and
//                  its divergence (positive: spreading out from a pour or a
//                  press; negative: drawing in). What is left over is the
//                  fluid's own flow, its speed the RMS of the residual.
//   carried        how much of the change from one sample to the next the flow
//                  explains: the previous sample moved by the measured flow,
//                  compared with the next. Near 1, the material is transported
//                  (oil and dye pushed around); near 0, the picture changes in
//                  place (colours fading, light changing, a dissolve, dye
//                  diffusing faster than it moves). This is the number for
//                  "physics writes, rendering reads": a plate that shimmers in
//                  place reads low.
//   turnover       form size (the correlation length, from the design read)
//                  over the fluid's own speed: the seconds it takes the flow to
//                  carry a form across its own size. Large: stately, viscous;
//                  small: churning.
//   lifetime       how long a picture stays like itself: the lag at which the
//                  correlation between a sample and a later one (inside one
//                  shot) falls to a half. Unlike motion, it counts a form that
//                  slowly reshapes in place.
//   spectrum       the slope of the luminance power spectrum over a centre
//                  square, from 4 to 42 cycles across it (a Hann window
//                  first), as power per wavenumber band. Shallower than −1.8
//                  is fine filamentary detail all the way down (a slowly
//                  diffusing dye stretched by flow); −1.8 to −2.8 a cascade
//                  of detail at every scale; steeper is smooth blobs with soft
//                  edges (a defocused or under-resolved plate). The steep end
//                  saturates near −3 on 8-bit video: the codec's quantisation
//                  is white noise, and a field built at −4 falls under it
//                  within the band (it reads about −3.0; without the window,
//                  −1.9).
//   drift          the median direction of the whole-field motion's vertical
//                  part over the clip: things falling or rising (a pour from
//                  above, bubbles, a tilted plate).
//
// What these cannot know: viscosity, density or the real size of the glass.
// The speeds and times are what the camera saw; a Reynolds number needs a
// viscosity the frames do not carry. And a camera that moves makes its own
// whole-field motion, which is why that part is measured and set apart.

/** Average-pool an RGB24 frame to a luminance image k times smaller, as bytes. */
function poolLum(px, W, H, k) {
  const w = Math.floor(W / k), h = Math.floor(H / k), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const p = ((y * k + j) * W + x * k + i) * 3;
      s += 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2];
    }
    out[y * w + x] = Math.round(s / (k * k));
  }
  return { w, h, d: out };
}

function halve(img) {
  const w = img.w >> 1, h = img.h >> 1, d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = 2 * y * img.w + 2 * x;
    d[y * w + x] = (img.d[p] + img.d[p + 1] + img.d[p + img.w] + img.d[p + img.w + 1] + 2) >> 2;
  }
  return { w, h, d };
}

/**
 * Normalised sum of absolute differences between the bs×bs block of `a`
 * whose top left is (x, y) and the block of `b` at (x+dx, y+dy): each block
 * less its mean and over its own spread, then scaled back by a's spread, so
 * the result is in a's grey levels. Infinity where either leaves its image.
 * Normalised, so a block that brightens, dims or loses contrast as it moves
 * (the light pulsing, a colour wheel turning, dye thinning) still matches
 * where it went: with the mean alone taken out, a texture whose light
 * pulsed in place read a fluid speed of 1.2% of the width a second.
 */
function zsad(a, b, x, y, bs, dx, dy) {
  if (x < 0 || y < 0 || x + bs > a.w || y + bs > a.h) return Infinity;
  if (x + dx < 0 || y + dy < 0 || x + dx + bs > b.w || y + dy + bs > b.h) return Infinity;
  let ma = 0, mb = 0, qa = 0, qb = 0;
  for (let j = 0; j < bs; j++) {
    const ra = (y + j) * a.w + x, rb = (y + j + dy) * b.w + x + dx;
    for (let i = 0; i < bs; i++) { const u = a.d[ra + i], v = b.d[rb + i]; ma += u; mb += v; qa += u * u; qb += v * v; }
  }
  const N = bs * bs;
  ma /= N; mb /= N;
  const sa = Math.sqrt(Math.max(1e-6, qa / N - ma * ma)), sb = Math.sqrt(Math.max(1e-6, qb / N - mb * mb));
  const k = sa / Math.max(0.5, sb);
  let s = 0;
  for (let j = 0; j < bs; j++) {
    const ra = (y + j) * a.w + x, rb = (y + j + dy) * b.w + x + dx;
    for (let i = 0; i < bs; i++) s += Math.abs(a.d[ra + i] - ma - k * (b.d[rb + i] - mb));
  }
  return s;
}

/** The best offset within ±r of (cx, cy) for the block of size bs centred at (px, py). */
function search(a, b, px, py, bs, cx, cy, r) {
  // Held inside the image: a block by the edge measures from the nearest
  // window that fits, not from none (the self-test's left-hand column read
  // half its speed while its coarse windows fell off the image).
  const x = Math.max(0, Math.min(a.w - bs, Math.round(px - bs / 2))), y = Math.max(0, Math.min(a.h - bs, Math.round(py - bs / 2)));
  let best = Infinity, bx = cx, by = cy;
  for (let dy = cy - r; dy <= cy + r; dy++) for (let dx = cx - r; dx <= cx + r; dx++) {
    const s = zsad(a, b, x, y, bs, dx, dy);
    if (s < best || (s === best && Math.abs(dx) + Math.abs(dy) < Math.abs(bx) + Math.abs(by))) { best = s; bx = dx; by = dy; }
  }
  return { dx: bx, dy: by, s: best, x, y };
}

/**
 * The displacement field from half-size image A to B: a vector per 8×8 block
 * (16 pixels at 320), in half-size pixels, or null where the block has too
 * little texture to match. Coarse to fine: at an eighth of the sample's size
 * a 6-pixel block (48 at 320) searched ±6 (±48 at 320), at a quarter an
 * 8-pixel block ±2 about twice that, then the 8-pixel block at half size ±2,
 * then a parabola through the match either side for the sub-pixel part. The
 * coarse blocks are bigger than the fine one on purpose: a block of 2 pixels
 * at an eighth matches noise (the first version did, and read a slid texture
 * at 0.4 of its true whole-field share).
 */
export function flowField(A, B) {
  const qa = halve(A), qb = halve(B), ea = halve(qa), eb = halve(qb);
  const BS = 8, nx = Math.floor(A.w / BS), ny = Math.floor(A.h / BS), out = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    // Not the outer ring of blocks: what they hold can leave the frame
    // before the next sample, and then the best match is a wrong one (on the
    // self-test's slid texture they were most of the 14% of motion the fit
    // could not explain).
    if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) { out.push(null); continue; }
    const x = i * BS, y = j * BS, cx = x + BS / 2, cy = y + BS / 2;
    // Texture: a block flat to within a few levels cannot be matched (the
    // aperture problem), so it carries no vector.
    let m = 0, v = 0;
    for (let yy = 0; yy < BS; yy++) for (let xx = 0; xx < BS; xx++) m += A.d[(y + yy) * A.w + x + xx];
    m /= BS * BS;
    for (let yy = 0; yy < BS; yy++) for (let xx = 0; xx < BS; xx++) v += (A.d[(y + yy) * A.w + x + xx] - m) ** 2;
    const sd = Math.sqrt(v / (BS * BS));
    if (sd < 3) { out.push(null); continue; }
    const e = search(ea, eb, cx / 4, cy / 4, 6, 0, 0, 6);
    const q = search(qa, qb, cx / 2, cy / 2, 8, Number.isFinite(e.s) ? 2 * e.dx : 0, Number.isFinite(e.s) ? 2 * e.dy : 0, 2);
    const h = search(A, B, cx, cy, BS, Number.isFinite(q.s) ? 2 * q.dx : 0, Number.isFinite(q.s) ? 2 * q.dy : 0, 2);
    if (!Number.isFinite(h.s)) { out.push(null); continue; }
    const par = (l, c, r) => (Number.isFinite(l) && Number.isFinite(r) && l + r - 2 * c > 0 ? Math.max(-0.5, Math.min(0.5, (l - r) / (2 * (l + r - 2 * c)))) : 0);
    const fx = par(zsad(A, B, h.x, h.y, BS, h.dx - 1, h.dy), h.s, zsad(A, B, h.x, h.y, BS, h.dx + 1, h.dy));
    const fy = par(zsad(A, B, h.x, h.y, BS, h.dx, h.dy - 1), h.s, zsad(A, B, h.x, h.y, BS, h.dx, h.dy + 1));
    // Match quality: the residual a pixel against the block's own contrast.
    const resid = h.s / (BS * BS) / sd;
    const edge = Math.abs(e.dx) === 6 || Math.abs(e.dy) === 6;
    out.push({ x: cx, y: cy, dx: h.dx + fx, dy: h.dy + fy, resid, edge });
  }
  return { nx, ny, v: out };
}

/**
 * How much of the change from A to B the field explains. Each pixel of B is
 * compared with A where the flow says it came from (bilinear, so a move of a
 * fraction of a pixel counts) and with A where it is: `res` and `raw`.
 */
function carried(A, B, field) {
  const BS = 8, W = A.w, H = A.h;
  const samp = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) return null;
    return A.d[y0 * W + x0] * (1 - fx) * (1 - fy) + A.d[y0 * W + x0 + 1] * fx * (1 - fy) + A.d[(y0 + 1) * W + x0] * (1 - fx) * fy + A.d[(y0 + 1) * W + x0 + 1] * fx * fy;
  };
  let raw = 0, res = 0, n = 0;
  for (let j = 0; j < field.ny; j++) for (let i = 0; i < field.nx; i++) {
    const f = field.v[j * field.nx + i];
    if (!f || f.edge) continue;
    for (let yy = 0; yy < BS; yy++) for (let xx = 0; xx < BS; xx++) {
      const x = i * BS + xx + f.dx, y = j * BS + yy + f.dy;
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
      const from = samp(xi - f.dx, yi - f.dy);
      if (from == null) continue;
      raw += Math.abs(B.d[yi * W + xi] - A.d[yi * W + xi]);
      res += Math.abs(B.d[yi * W + xi] - from);
      n++;
    }
  }
  return n ? { raw: raw / n, res: res / n } : null;
}

/** Least-squares affine fit v = v0 + M (p − c) to the vectors, in units per second. */
function affine(vs) {
  const n = vs.length;
  if (n < 6) return null;
  let cx = 0, cy = 0; for (const v of vs) { cx += v.x; cy += v.y; } cx /= n; cy /= n;
  let sxx = 0, syy = 0, sxy = 0, mu = 0, mv = 0;
  for (const v of vs) { const x = v.x - cx, y = v.y - cy; sxx += x * x; syy += y * y; sxy += x * y; mu += v.u; mv += v.w; }
  mu /= n; mv /= n;
  const det = sxx * syy - sxy * sxy;
  if (det <= 1e-9) return null;
  const fit = key => {
    let sx = 0, sy = 0; for (const v of vs) { const x = v.x - cx, y = v.y - cy; sx += x * v[key]; sy += y * v[key]; }
    return [(syy * sx - sxy * sy) / det, (sxx * sy - sxy * sx) / det];
  };
  const [a, b] = fit('u'), [c, d] = fit('w');
  let tot = 0, res = 0;
  for (const v of vs) {
    const x = v.x - cx, y = v.y - cy;
    const pu = mu + a * x + b * y, pv = mv + c * x + d * y;
    tot += v.u * v.u + v.w * v.w; res += (v.u - pu) ** 2 + (v.w - pv) ** 2;
  }
  // Image y runs down, so a turn anticlockwise on screen is a negative curl here.
  return { u: mu, v: mv, a, b, c, d, cx, cy, curl: c - b, div: a + d, rmsAll: Math.sqrt(tot / n), rmsOwn: Math.sqrt(res / n), share: tot > 0 ? 1 - res / tot : 0 };
}

// A small radix-2 FFT, in place, for the spectrum.
export function fft(re, im, inv = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = ((inv ? 2 : -2) * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j], k = i + j + len / 2;
        const vr = re[k] * cr - im[k] * ci, vi = re[k] * ci + im[k] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi; re[k] = ur - vr; im[k] = ui - vi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

/**
 * The slope of the radially averaged power spectrum of the frame's luminance
 * over a centre square of S pixels (S a power of two no bigger than the
 * frame's shorter side, at most 128), from 4 to 42 cycles across it.
 */
export function spectrumSlope(px, W, H, { hann = true } = {}) {
  let S = 128; while (S > Math.min(W, H)) S >>= 1;
  if (S < 32) return null;
  const x0 = (W - S) >> 1, y0 = (H - S) >> 1;
  const re = Array.from({ length: S }, () => new Float64Array(S)), im = Array.from({ length: S }, () => new Float64Array(S));
  let mean = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const p = ((y0 + y) * W + x0 + x) * 3; re[y][x] = 0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2]; mean += re[y][x]; }
  mean /= S * S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // The window, so the square's hard edges do not leak power into every
    // band and flatten a steep spectrum (the self-test turns it off to show it).
    const wgt = hann ? (0.5 - 0.5 * Math.cos((2 * Math.PI * x) / (S - 1))) * (0.5 - 0.5 * Math.cos((2 * Math.PI * y) / (S - 1))) : 1;
    re[y][x] = (re[y][x] - mean) * wgt;
  }
  for (let y = 0; y < S; y++) fft(re[y], im[y]);
  const cr = new Float64Array(S), ci = new Float64Array(S);
  for (let x = 0; x < S; x++) {
    for (let y = 0; y < S; y++) { cr[y] = re[y][x]; ci[y] = im[y][x]; }
    fft(cr, ci);
    for (let y = 0; y < S; y++) { re[y][x] = cr[y]; im[y][x] = ci[y]; }
  }
  const kmax = Math.min(42, S / 3), bins = new Float64Array(kmax + 1), cnt = new Float64Array(kmax + 1);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ky = y <= S / 2 ? y : y - S, kx = x <= S / 2 ? x : x - S, k = Math.round(Math.hypot(kx, ky));
    if (k >= 4 && k <= kmax) { bins[k] += re[y][x] ** 2 + im[y][x] ** 2; cnt[k]++; }
  }
  // Power per wavenumber band (the ring's sum, not its mean): the 2D form of
  // the 1D spectra the literature quotes.
  const xs = [], ys = [];
  for (let k = 4; k <= kmax; k++) if (cnt[k] && bins[k] > 0) { xs.push(Math.log(k)); ys.push(Math.log(bins[k])); }
  if (xs.length < 5) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  return sxy / sxx;
}

/** A running physics read: half-size luminance of every sample, and the spectra. */
export function physicsAcc() { return { frames: [], spectra: [] }; }

/** Add one sample (RGB24, W×H). The spectrum is taken on at most 400 samples, spread evenly by the caller's index. */
export function physicsFrame(px, W, H, acc, k) {
  acc.frames.push(poolLum(px, W, H, 2));
  if (k % (acc.spectrumEvery ?? 1) === 0) { const s = spectrumSlope(px, W, H); if (s != null) acc.spectra.push(s); }
}

const quant = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.round(p * (s.length - 1)))] : null; };

/**
 * The summary: `rate` samples a second, `cut[k]` true where sample k starts a
 * new shot, `W` the sample width (320), `scale` the design read's median
 * correlation length across (% of width) for the turnover time.
 */
export function physicsSummary(acc, { rate, cut, W, scale }) {
  const F = acc.frames, n = F.length;
  const shotOf = new Int32Array(n); for (let k = 1; k < n; k++) shotOf[k] = shotOf[k - 1] + (cut[k] ? 1 : 0);
  const long = Math.max(1, Math.round(rate)); // about a second
  const pairs = [];
  const stride = Math.max(1, Math.ceil(n / 300));
  // Anchors a second from the end of their shot, so every pair spans the
  // second: a pair one sample apart sees a slow flow move a fraction of a
  // pixel, under the codec's noise, and the self-test's slid texture read
  // half its speed while those pairs were let in. Only a clip shorter than
  // two seconds, or a shot that is, falls back to single samples.
  const useLong = n > 2 * long;
  for (let k = 0; k + 1 < n; k += stride) {
    const L = useLong ? (k + long < n && shotOf[k + long] === shotOf[k] ? long : 0) : shotOf[k + 1] === shotOf[k] ? 1 : 0;
    if (!L) continue;
    const fl = flowField(F[k], F[k + L]);
    const fs = L > 1 ? flowField(F[k], F[k + 1]) : null;
    const vs = [];
    fl.v.forEach((f, i) => {
      let g = f, lag = L;
      // Only where the second outran the search (its coarse match hit the
      // edge): a slow block measured over one sample is mostly the parabola's
      // pull toward a whole pixel, and pulled the slid texture's speed down.
      if (fs && f && f.edge && fs.v[i] && !fs.v[i].edge && fs.v[i].resid <= 0.6) { g = fs.v[i]; lag = 1; }
      if (!g || g.edge || g.resid > 0.6) return;
      // Half-size pixels over `lag` samples → % of the width per second.
      const s = (2 / W) * 100 * (rate / lag);
      vs.push({ x: (g.x * 2 / W) * 100, y: (g.y * 2 / W) * 100, u: g.dx * s, w: g.dy * s });
    });
    const valid = fl.v.filter(Boolean).length;
    // Carried over the second when the long field held for most blocks
    // (a move of a fraction of a pixel a sample is lost in the codec's noise
    // over one sample), over one sample when the second outran it.
    const longOk = fl.v.filter(x => x && !x.edge && x.resid <= 0.6).length >= 0.5 * Math.max(1, valid);
    const c1 = longOk || !fs ? carried(F[k], F[k + L], fl) : carried(F[k], F[k + 1], fs);
    // Fit, drop the vectors far off the fit (a block that matched the wrong
    // blob, or one by the edge whose content left the frame), fit again.
    let af = affine(vs);
    if (af) {
      const off = v => Math.hypot(v.u - (af.u + af.a * (v.x - af.cx) + af.b * (v.y - af.cy)), v.w - (af.v + af.c * (v.x - af.cx) + af.d * (v.y - af.cy)));
      const offs = vs.map(off).sort((a, b) => a - b), mad = offs[offs.length >> 1];
      const keep = vs.filter(v => off(v) <= 3 * mad + 0.05 * (Math.abs(af.u) + Math.abs(af.v) + 0.1));
      if (keep.length >= 6 && keep.length < vs.length) { vs.length = 0; vs.push(...keep); af = affine(vs); }
    }
    pairs.push({ k, vs, af, matched: valid ? vs.length / valid : 0, c1 });
  }
  const speeds = pairs.flatMap(p => p.vs.map(v => Math.hypot(v.u, v.w)));
  const own = pairs.map(p => p.af?.rmsOwn).filter(x => x != null);
  const whole = pairs.map(p => (p.af ? Math.hypot(p.af.u, p.af.v) : null)).filter(x => x != null);
  const share = pairs.map(p => p.af?.share).filter(x => x != null);
  // Curl and divergence in 1/s: the fit's velocities are % of width per
  // second over positions in % of width, so the ratio is per second.
  const curl = pairs.map(p => p.af?.curl).filter(x => x != null);
  const div = pairs.map(p => p.af?.div).filter(x => x != null);
  const vert = pairs.map(p => p.af?.v).filter(x => x != null);
  const horiz = pairs.map(p => p.af?.u).filter(x => x != null);
  // Carried: only where the picture changed by more than the codec's noise.
  const carr = pairs.map(p => (p.c1 && p.c1.raw > 1.5 ? Math.max(0, Math.min(1, 1 - p.c1.res / p.c1.raw)) : null)).filter(x => x != null);

  // Lifetime: the correlation of a sample with one τ later, inside a shot,
  // averaged over anchors, until it falls under a half.
  const qs = F.map(halve);
  const corr = (a, b) => {
    let ma = 0, mb = 0; const N = a.d.length;
    for (let i = 0; i < N; i++) { ma += a.d[i]; mb += b.d[i]; }
    ma /= N; mb /= N;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < N; i++) { const x = a.d[i] - ma, y = b.d[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
  };
  let lifetime = null, lifeCapped = false;
  const maxLag = Math.min(n - 1, Math.round(rate * 120));
  let prevC = 1, lagS = [];
  for (let s = 1; s <= maxLag; s = Math.max(s + 1, Math.round(s * 1.25))) lagS.push(s);
  for (const L of lagS) {
    const cs = [];
    for (let k = 0; k + L < n; k += Math.max(1, Math.ceil((n - L) / 60))) if (shotOf[k + L] === shotOf[k]) { const c = corr(qs[k], qs[k + L]); if (c != null) cs.push(c); }
    if (cs.length < 3) { lifeCapped = true; break; }
    const c = cs.reduce((a, b) => a + b, 0) / cs.length;
    if (c < 0.5) { const prevL = lagS[lagS.indexOf(L) - 1] ?? 0; lifetime = (prevL + ((prevC - 0.5) / Math.max(1e-6, prevC - c)) * (L - prevL)) / rate; break; }
    prevC = c;
  }
  if (lifetime == null) lifeCapped = true;
  const longestShot = (() => { let best = 0, run = 1; for (let k = 1; k < n; k++) { if (shotOf[k] === shotOf[k - 1]) run++; else run = 1; best = Math.max(best, run); } return Math.max(best, n ? 1 : 0) / rate; })();

  const ownMed = quant(own, 0.5);
  return {
    pairs: pairs.length,
    matched: quant(pairs.map(p => p.matched), 0.5),
    speed: { med: quant(speeds, 0.5), p90: quant(speeds, 0.9) },
    own: { med: ownMed, p90: quant(own, 0.9) },
    whole: { med: quant(whole, 0.5), p90: quant(whole, 0.9) },
    wholeShare: quant(share, 0.5),
    curl: { med: quant(curl, 0.5), p10: quant(curl, 0.1), p90: quant(curl, 0.9) },
    div: { med: quant(div, 0.5), p10: quant(div, 0.1), p90: quant(div, 0.9) },
    vertical: quant(vert, 0.5),
    horizontal: quant(horiz, 0.5),
    carried: { med: quant(carr, 0.5), p10: quant(carr, 0.1), p90: quant(carr, 0.9), n: carr.length },
    turnover: scale != null && ownMed ? scale / ownMed : null,
    lifetime, lifeCapped, longestShot,
    spectrum: { med: quant(acc.spectra, 0.5), p10: quant(acc.spectra, 0.1), p90: quant(acc.spectra, 0.9) },
  };
}

const f = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));
const band = (x, cuts) => { if (x == null || !Number.isFinite(x)) return ''; for (const [lim, w] of cuts) if (x < lim) return w; return cuts.at(-1)[1]; };

/** The physics section of summary.md. */
export function physicsLines(p) {
  const own = p.own.med;
  const pace = band(own, [[0.5, 'nearly still'], [2, 'slow, viscous drift'], [6, 'flowing'], [15, 'brisk'], [Infinity, 'fast, churning']]);
  const curl = p.curl.med;
  // Rotation period of a solid turn: curl = 2Ω.
  const period = curl && Math.abs(curl) > 0.01 ? (4 * Math.PI) / Math.abs(curl) : null;
  const turn = period != null && period < 120 ? `turning ${curl < 0 ? 'anticlockwise' : 'clockwise'} on screen, about one turn in ${f(period, 0)} s` : 'no steady turn';
  const dv = p.div.med;
  const spread = band(dv, [[-0.02, 'drawing in (converging)'], [0.02, 'neither spreading nor drawing in'], [Infinity, 'spreading out (diverging), as from a pour or a press']]);
  const car = p.carried.med;
  const carriedWord = band(car, [[0.2, 'the picture changes in place more than it moves (fading, light changes, dissolves, or diffusion outrunning flow)'], [0.5, 'part carried, part changing in place'], [0.75, 'mostly carried by the flow'], [Infinity, 'carried: the material is transported']]);
  const sl = p.spectrum.med;
  const spec = band(sl, [[-2.8, 'steep: smooth blobs and soft edges, little fine detail (defocus, or a coarse grid)'], [-1.8, 'a cascade: detail at every scale, falling off like stirred turbulence'], [Infinity, 'shallow: fine filaments and sharp detail all the way down, as a slowly diffusing dye stretched by flow']]);
  const vert = p.vertical;
  const drift = vert == null || Math.abs(vert) < 0.3 ? 'no steady drift up or down' : vert > 0 ? `drifting down (${f(vert, 1)}% of the width a second): falling, pouring or a plate tilted down` : `drifting up (${f(-vert, 1)}% a second): rising, as warm wax or bubbles`;
  const turnover = p.turnover;
  return [
    '## Physics',
    '',
    `From ${p.pairs} sample pairs; speeds in % of the frame's width a second (×0.25 for cm/s on an overhead projector's 25 cm stage). Definitions: \`scripts/watchphysics.mjs\`.`,
    '',
    `- **flow**: the fluid's own speed (whole-field motion taken out) median ${f(own, 1)}, 90th ${f(p.own.p90, 1)}: ${pace}. Block speeds median ${f(p.speed.med, 1)}, 90th ${f(p.speed.p90, 1)}; ${f((p.matched ?? 0) * 100, 0)}% of textured blocks matched`,
    `- **whole-field motion** (camera, or the dish slid, turned or zoomed): median ${f(p.whole.med, 1)}, and it explains ${f((p.wholeShare ?? 0) * 100, 0)}% of the motion`,
    `- **rotation**: curl median ${f(curl, 3)}/s (${f(p.curl.p10, 3)} to ${f(p.curl.p90, 3)}): ${turn}`,
    `- **spreading**: divergence median ${f(dv, 3)}/s (${f(p.div.p10, 3)} to ${f(p.div.p90, 3)}): ${spread}`,
    `- **carried**: ${f(car, 2)} (${f(p.carried.p10, 2)} to ${f(p.carried.p90, 2)}, over ${p.carried.n} changing pairs) of the change from one sample to the next is the flow moving material: ${carriedWord}`,
    `- **turnover**: ${turnover != null ? `${f(turnover, 1)} s for the flow to carry a form across its own size` : '–'}${turnover != null ? `, ${band(turnover, [[0.5, 'churning'], [2, 'lively'], [6, 'unhurried'], [Infinity, 'stately, viscous']])}` : ''}`,
    `- **lifetime**: ${p.lifetime != null ? `a picture stays like itself for about ${f(p.lifetime, 1)} s (correlation with itself falls to a half)` : `longer than the clip shows (longest shot ${f(p.longestShot, 0)} s)`}`,
    `- **spectrum**: slope ${f(sl, 2)} (${f(p.spectrum.p10, 2)} to ${f(p.spectrum.p90, 2)}) of power per wavenumber band: ${spec}`,
    `- **drift**: ${drift}`,
  ];
}

/** Physics gaps against a reference, biggest first, in the design read's style. */
export function comparePhysics(ref, cur, refName = 'the reference', curName = 'this') {
  const rows = [];
  const add = (label, a, b, kind, words) => {
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return;
    let size;
    if (kind === 'ratio') { if (a <= 0 || b <= 0) return; size = Math.abs(Math.log(b / a)) / Math.log(1.5); rows.push({ size, say: `${label}: ${curName} ${f(b, 2)} against ${f(a, 2)}, ${b > a ? `${f(b / a, 1)}× ${words[0]}` : `${f(a / b, 1)}× ${words[1]}`}` }); }
    else { size = Math.abs(b - a) / kind; rows.push({ size, say: `${label}: ${curName} ${f(b, 2)} against ${f(a, 2)}, ${b > a ? words[0] : words[1]}` }); }
  };
  add('own flow speed (% width/s)', ref.own?.med, cur.own?.med, 'ratio', ['faster', 'slower']);
  add('carried share', ref.carried?.med, cur.carried?.med, 0.15, ['more transported', 'more changing in place']);
  add('turnover (s)', ref.turnover, cur.turnover, 'ratio', ['more stately', 'more churning']);
  add('lifetime (s)', ref.lifetime, cur.lifetime, 'ratio', ['longer-lived forms', 'shorter-lived forms']);
  add('spectrum slope', ref.spectrum?.med, cur.spectrum?.med, 0.4, ['more fine detail', 'smoother, less fine detail']);
  add('whole-field share', ref.wholeShare, cur.wholeShare, 0.2, ['more of the motion is the whole picture', 'more of the motion is the fluid\'s own']);
  add('curl (1/s)', ref.curl?.med, cur.curl?.med, 0.05, ['turning more clockwise', 'turning more anticlockwise']);
  rows.sort((u, v) => v.size - u.size);
  return [`## Physics against ${refName}`, '', ...rows.map(r => `- (${f(r.size, 1)}) ${r.say}`)];
}

// ─── techniques: what the page says, and guesses from the footage ───────────

/**
 * Technique words to look for in a video's page (title, description, tags,
 * chapters): what the maker says they used. Each group is a family of
 * technique the plate either models or could; a hit is a lead to follow (the
 * skill says to open the links the description gives), not a fact about
 * every frame.
 */
const TECHNIQUE_WORDS = [
  ['liquid light rig', /overhead projector|\bOHP\b|clock ?(face|glass)|watch ?glass|petri|pyrex|\bdish(es)?\b|color ?wheel|colou?r wheel|light ?show/i],
  // Not a bare "oil", "ink" or "magnet": a cooking video's olive oil, a
  // ballpoint's ink and a fridge magnet are not the technique (the check
  // skeptic's counter-example, 2026-11-12).
  ['oils and water', /mineral oil|baby oil|glycerin|glycerol|vegetable oil|castor oil|silicone oil|oil and water|oil dyes?|oil colou?rs?|oil-based|immiscib/i],
  ['dyes and inks', /food colou?r|\bdyes?\b|\binks?\b(?! ?(pen|jet|cartridge))|alcohol ink|india ink|watercolou?r|acrylic|paint pour|fluid art/i],
  ['surface tension', /dish ?soap|detergent|surfactant|marangoni|milk|soap film|bubbles?/i],
  ['heat and convection', /\bheat\b|lava|convection|hot plate|candle|warm/i],
  ['magnetism', /ferrofluid|neodymium|electromagnet|magnetic (field|fluid)/i],
  ['optics and lighting', /\bUV\b|black ?light|fluoresc|macro|polari[sz]|schlieren|shadowgraph|caustic|refract|prism|dichroic|kaleidoscope|mirror/i],
  ['camera speed', /slow[ -]?mo|high[ -]?speed camera|phantom|time[ -]?lapse|\d{3,4} ?fps|reversed footage|played backwards/i],
  ['digital', /after effects|touchdesigner|houdini|blender|cinema ?4d|\bC4D\b|unreal|shader|glsl|notch|resolume|\bVJ\b|generative|simulation|\bCGI\b|\bAI\b|stable diffusion|runway/i],
];

export function scanTechniques(info) {
  if (!info) return [];
  const text = [info.title, info.descriptionFull ?? info.description, ...(info.tags ?? []), ...(info.chapters ?? []).map(c => c.title)].filter(Boolean).join(' \n ');
  const hits = [];
  for (const [family, re] of TECHNIQUE_WORDS) {
    const g = new RegExp(re.source, 'gi'), seen = new Set();
    for (const m of text.matchAll(g)) seen.add(m[0].toLowerCase());
    if (seen.size) hits.push({ family, words: [...seen].slice(0, 8) });
  }
  return hits;
}

/**
 * Guesses at how the footage was made, each from measurements that point at
 * it, in the order of how strongly they point. A guess names its evidence so
 * it can be checked against the stills and the page; it is the start of the
 * physics read, not the end.
 */
export function guessTechniques(d, p, cutsPerMin = 0) {
  const g = [];
  const med = (o, k) => o?.[k]?.med ?? null;
  const own = p?.own?.med, curl = p?.curl?.med, div = p?.div?.med, car = p?.carried?.med, sl = p?.spectrum?.med;
  const period = curl && Math.abs(curl) > 0.01 ? (4 * Math.PI) / Math.abs(curl) : null;
  const say = (w, text, why) => g.push({ w, text, why });
  if (p?.wholeShare > 0.5 && period != null && period < 90) say(3, 'the glass or dish is turned (or the camera rotates)', `whole-field motion explains ${(p.wholeShare * 100).toFixed(0)}% of the motion, one turn in ${period.toFixed(0)} s`);
  else if (p?.wholeShare > 0.5 && p?.whole?.med > 2) say(2.5, 'the camera pans or the plate is slid: the picture moves as one', `whole-field share ${(p.wholeShare * 100).toFixed(0)}%, ${p.whole.med.toFixed(1)}% of the width a second`);
  if (div != null && div > 0.03) say(2, 'pours or presses: material spreading out from where it is added', `divergence ${div.toFixed(3)}/s`);
  if (car != null && car < 0.3) say(2.5, 'the picture changes in place more than it flows: crossfades between layers, a colour wheel or lights cycling, dye diffusing, or a digital effect rather than transport', `carried ${car.toFixed(2)}`);
  if (p?.vertical != null && p.vertical > 0.5) say(1.5, 'gravity: pouring, dripping, or a plate tilted toward the bottom of the frame', `drift down ${p.vertical.toFixed(1)}% of the width a second`);
  if (p?.vertical != null && p.vertical < -0.5) say(1.5, 'buoyancy: warm wax or oil rising, or bubbles', `drift up ${(-p.vertical).toFixed(1)}% of the width a second`);
  if (own != null && own < 1.5 && (p.lifetime ?? Infinity) > 8) say(2, 'viscous oils (mineral oil, glycerin) moved gently, by slow heat or tilting; or footage slowed down', `own flow ${own.toFixed(2)}% a second, a picture lives ${p.lifetime != null ? `${p.lifetime.toFixed(0)} s` : 'longer than the shot'}`);
  if (own != null && own > 12) say(1.5, 'thin, fast liquids (water-based dyes, alcohol inks) stirred or blown; or time-lapse', `own flow ${own.toFixed(1)}% a second`);
  const el = med(d, 'elongation'), coh = med(d, 'coherence'), forms = med(d, 'forms');
  if (el != null && el < 0.35 && coh != null && coh > 0.5) say(2, 'dye stretched into filaments by shear: stirring, tilting or a drawn tool through layered liquids', `elongation ${el.toFixed(2)}, flow-line coherence ${coh.toFixed(2)}`);
  if (el != null && el > 0.75 && forms != null && forms >= 8) say(2, 'cells and droplets: immiscible oil and water broken into drops, or bubbles', `${forms.toFixed(0)} forms a frame, elongation ${el.toFixed(2)}`);
  if (Math.max(med(d, 'mirror') ?? -1, med(d, 'halfTurn') ?? -1) > 0.85) say(2.5, 'a kaleidoscope or mirror (optical, or a digital mirror effect)', `mirror ${f(med(d, 'mirror'), 2)}, half-turn ${f(med(d, 'halfTurn'), 2)}`);
  const ew = med(d, 'edgeWidth');
  if (ew != null && ew > 2.5) say(1.5, 'soft focus: a projection out of focus, a soft lens, or a coarse simulation scaled up', `edge width ${ew.toFixed(1)}% of the width${sl != null ? `, spectrum ${sl.toFixed(2)}` : ''}`);
  if (ew != null && ew < 0.5 && sl != null && sl > -2.2) say(1.5, 'sharp, in-focus macro or a high-resolution render: detail all the way down', `edge width ${ew.toFixed(2)}%, spectrum ${sl.toFixed(2)}`);
  const dark = med(d, 'p5'), M = med(d, 'colourfulness');
  if (dark != null && dark < 0.05 && M != null && M > 45) say(1, 'saturated colour on a dark ground: dyes lit by transmitted light (a projector) or fluorescing under UV', `5th percentile luminance ${dark.toFixed(2)}, colourfulness ${M.toFixed(0)}`);
  if (cutsPerMin > 6) say(1, 'an edited montage: many shots, not one continuous performance', `${cutsPerMin.toFixed(1)} cuts a minute`);
  return g.sort((a, b) => b.w - a.w);
}

export function techniqueLines(info, d, p, cutsPerMin) {
  const hits = scanTechniques(info);
  const guesses = guessTechniques(d, p, cutsPerMin);
  const links = info?.links ?? [];
  return [
    '## Techniques',
    '',
    hits.length ? 'What the page says (title, description, tags, chapters):' : (info ? 'The page names no technique words.' : 'No page: a local file. Ask where it came from, or read the techniques off the stills.'),
    ...hits.map(h => `- ${h.family}: ${h.words.join(', ')}`),
    ...(info?.chapters?.length ? [`- chapters: ${info.chapters.slice(0, 12).map(c => `${Math.floor(c.start / 60)}:${String(Math.floor(c.start % 60)).padStart(2, '0')} ${c.title}`).join('; ')}`] : []),
    ...(links.length ? ['', 'Links in the description to read for the maker\'s own account (gear lists, tutorials, the artist\'s site):', ...links.slice(0, 10).map(u => `- ${u}`)] : []),
    '',
    guesses.length ? 'Guessed from the footage (strongest first; check each against the stills):' : 'Nothing in the measurements points at a technique strongly enough to guess.',
    ...guesses.map(x => `- ${x.text} (${x.why})`),
  ];
}
