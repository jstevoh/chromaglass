/**
 * Dissolves, for the watch tool (scripts/watch.mjs, PLAN 47w-2).
 *
 * What was reported: on *Streams II* the cut detector read 3.8 cuts a minute
 * where the takes, counted by eye, run about 7, and its "longest shots" were
 * several takes each. The film joins most of its takes with dissolves of a
 * second or so. watch.mjs finds a cut as one sample that changes several
 * times more than the samples around it; a dissolve spreads the same change
 * over ten or twenty samples, each of which changes only a little more than
 * the liquid does by itself, so none of them is an outlier and the take
 * boundary is never seen.
 *
 * The obvious fix, a lower threshold on the per-sample change, cannot work
 * here: liquid footage changes by itself, smoothly and sometimes fast, and a
 * pour or a colour wheel turning raises the change for a second just as a
 * dissolve does. What a dissolve has that the liquid does not is its
 * arithmetic. Every frame inside it is a weighted mix of the last frame of
 * the old take and the first frame of the new one, with the weight running
 * from one to the other. A pour moves dye across the frame: the frame halfway
 * through has the dye halfway across, which no mix of the two ends gives.
 *
 * So a dissolve is found in four steps, on a 32×18 thumbnail of each
 * sample's brightness (small enough that a slow drift inside each take
 * stays near a mix, and cheap to keep for an hour of samples):
 *
 *   1. A run of samples whose change is raised above the take's own: more
 *      than 1.6 times the median change of the three seconds either side.
 *   2. Its two ends differ by a cut's worth: more than 2.5 times what each
 *      side's take changes by itself over the same number of samples (a
 *      fast take's ends always differ a lot), and by more than 4% of full
 *      brightness. Both halves were set on real footage: without the first
 *      the Joshua Light Show film read 37 dissolves where the sheets show
 *      about a dozen, and without the second a bar show filmed on one
 *      camcorder read four, each 0.2 s of its noise and the lamp.
 *   3. Every frame inside it is the mix: fitting a·A + (1−a)·B to it leaves
 *      under a fifth of the ends' difference unexplained.
 *   4. What follows is new: the frame after it is unlike every frame of the
 *      three seconds before it, and the frame before it unlike every frame
 *      of the three seconds after, each by more than half the ends'
 *      difference. A light that dims and comes back, or a flash, is a mix of
 *      its ends too (brightness scales every pixel alike), but it returns to
 *      a picture the take already showed; a dissolve does not.
 *
 * A run that holds or touches a hard cut is the hard cut's (watch.mjs counts
 * a two-sample blend there already). A fade to black passes as a dissolve
 * into a black take, which for counting takes is what it is.
 */

export const TW = 32, TH = 18;

/** A TW×TH box average of a W×H brightness frame (values 0..1). */
export function thumb(lum, W, H) {
  const t = new Float32Array(TW * TH), c = new Uint16Array(TW * TH);
  for (let y = 0; y < H; y++) {
    const ty = Math.min(TH - 1, Math.floor((y * TH) / H));
    for (let x = 0; x < W; x++) {
      const i = ty * TW + Math.min(TW - 1, Math.floor((x * TW) / W));
      t[i] += lum[y * W + x]; c[i]++;
    }
  }
  for (let i = 0; i < t.length; i++) t[i] /= Math.max(1, c[i]);
  return t;
}

// Mean absolute difference, in percent of full brightness: the same unit as
// watch.mjs's per-sample motion.
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return (s / a.length) * 100; };
const median = a => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0);

/**
 * The best a with F ≈ a·A + (1−a)·B, and the share of |A−B|² it leaves.
 */
export function mixFit(F, A, B) {
  let num = 0, den = 0;
  for (let i = 0; i < F.length; i++) { const d = A[i] - B[i]; num += (F[i] - B[i]) * d; den += d * d; }
  const a = den > 0 ? num / den : 0;
  let res = 0;
  for (let i = 0; i < F.length; i++) res += (F[i] - B[i] - a * (A[i] - B[i])) ** 2;
  return { a, left: den > 0 ? res / den : Infinity };
}

/**
 * The dissolves in a clip: `thumbs[k]` is sample k's thumbnail, `cuts` the
 * hard cuts' samples, `rate` samples a second. Returns
 * [{ from, to, mid, gap, inside, left, fall }]: samples `from` (the old
 * take's last frame) to `to` (the new take's first), the ends' difference,
 * the takes' own change over that span, the share the mix leaves, how far
 * the mix weight falls, and how near the takes come to each other. `rejected`,
 * if given, collects every raised run that was not a dissolve with the step
 * that turned it down (`len`, `cut`, `gap`, `mix`, `revisit`), so the
 * self-test can hold each step to the case only it catches.
 */
export function findDissolves({ thumbs, cuts = [], rate, rejected = null }) {
  const n = thumbs.length;
  if (n < 6) return [];
  const d = [0];
  for (let k = 1; k < n; k++) d.push(diff(thumbs[k], thumbs[k - 1]));
  const W = Math.max(3, Math.round(3 * rate));
  const base = d.map((_, k) => median(d.slice(Math.max(1, k - W), k + W + 1)));
  const raised = d.map((v, k) => k > 0 && v > 1.6 * base[k] + 0.3);
  // One quiet sample inside a dissolve (the codec, or the takes' own motion
  // cancelling the mix for a moment) does not end it.
  const runs = [];
  for (let k = 1; k < n; k++) {
    if (!raised[k]) continue;
    let e = k;
    while (e + 1 < n && (raised[e + 1] || (e + 2 < n && raised[e + 2]))) e += raised[e + 1] ? 1 : 2;
    runs.push([k, e]); k = e;
  }
  const near = Math.max(1, Math.round(rate / 3)), W3 = Math.round(3 * rate);
  const out = [];
  for (const [s, e] of runs) {
    // Sample s's change is from s−1 to s, so the run spans frames s−1 to e.
    const from = s - 1, to = e, L = to - from;
    const at = {};
    const no = why => { rejected?.push({ from, to, why, ...at }); };
    // Two samples at least: one inner frame to test the mix on. No upper
    // bound: a slow dissolve over five seconds is still one.
    if (L < 2) { no('len'); continue; }
    if (cuts.some(c => c >= from - near && c <= to + near)) { no('cut'); continue; }
    const gap = diff(thumbs[from], thumbs[to]);
    // What each take changes by itself over L samples, where there is room
    // to see it; a dissolve at the clip's very start or end has one side.
    const sides = [];
    if (from - L >= 0) sides.push(diff(thumbs[from], thumbs[from - L]));
    if (to + L < n) sides.push(diff(thumbs[to], thumbs[to + L]));
    if (!sides.length) { no('len'); continue; }
    const inside = Math.max(...sides);
    Object.assign(at, { gap, inside });
    if (!(gap > 4 && gap > 2.5 * inside)) { no('gap'); continue; }
    const fits = [];
    for (let j = from + 1; j < to; j++) fits.push(mixFit(thumbs[j], thumbs[from], thumbs[to]));
    const left = fits.reduce((a, f) => a + f.left, 0) / fits.length;
    // How far the weight runs, reported but not required: a crossfade that
    // flickers or pauses on its way is still a change of take, and the
    // first draft's demand that the weight fall steadily turned down
    // nothing the other steps let through (the check-skeptic pass).
    const fall = fits[0].a - fits.at(-1).a;
    Object.assign(at, { left, fall });
    if (!(left < 0.1)) { no('mix'); continue; }
    let seen = Infinity;
    for (let j = Math.max(0, from - W3); j < from; j++) seen = Math.min(seen, diff(thumbs[to], thumbs[j]));
    for (let j = to + 1; j <= Math.min(n - 1, to + W3); j++) seen = Math.min(seen, diff(thumbs[from], thumbs[j]));
    if (!(seen > 0.5 * gap)) { no('revisit'); continue; }
    out.push({ from, to, mid: Math.round((from + to) / 2), gap, inside, left, fall, seen });
  }
  return out;
}
