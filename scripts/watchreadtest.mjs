// The self-test of the watch tool's design and physics reads
// (scripts/watchdesign.mjs, scripts/watchphysics.mjs), run by
// `npm run watch -- --selftest` beside the rest of watch.mjs's. Each case is
// a frame or a sequence whose answer is known by construction: two flat
// halves, a disc, ramps of known width, stripes, grids of known period;
// a texture slid, turned, banded and pulsed at known rates; fields built
// with a known spectral slope. A measure that drifts from its definition
// fails here before it misreads a reference. The dissolve clips watch.mjs
// encodes and watches (47w-2) are made here too. Kept apart from watch.mjs
// so that file stays under the size bar (`npm run sizes`).

import { designFrame, designSummary, compareDesign, palette, paletteAcc } from './watchdesign.mjs';
import { physicsAcc, physicsFrame, physicsSummary, physicsLines, spectrumSlope, scanTechniques, guessTechniques, realRange, fft as fftSelf } from './watchphysics.mjs';

const f2 = x => (x == null || !Number.isFinite(x) ? String(x) : x.toFixed(2));

export function readSelftest(check) {
  // The design read, on frames whose answers are known by construction.
  const DW = 320, DH = 180;
  const frame = fn => { const img = Buffer.alloc(DW * DH * 3); for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) img.set(fn(x, y), (y * DW + x) * 3); return img; };
  const grey = v => [v, v, v];
  const disc = (cx, cy, r) => (x, y) => (Math.hypot(x - cx, y - cy) < r ? 1 : 0);
  const halves = frame(x => (x < DW / 2 ? [230, 20, 20] : [20, 20, 230]));
  const pacc = paletteAcc(); const dh = designFrame(halves, DW, DH, pacc); const pal = palette(pacc);
  check('design: red | blue halves read as two colours, half each, 120° apart, very colourful',
    pal.length === 2 && pal.every(p => Math.abs(p.share - 0.5) < 0.02) && /red/.test(pal.map(p => p.name).join()) && /blue/.test(pal.map(p => p.name).join())
      && dh.hueGap === 120 && dh.colourfulness > 109,
    `${pal.map(p => `${p.name} ${p.hex} ${(p.share * 100).toFixed(0)}%`).join(', ')}; gap ${dh.hueGap}°, colourfulness ${dh.colourfulness.toFixed(0)}`);
  const dg = designFrame(frame(() => grey(128)), DW, DH);
  check('design: a grey frame has no colour, no edges, no forms', dg.colourfulness < 1 && dg.coloured === 0 && dg.edgeWidth === null && dg.forms === 0,
    `colourfulness ${dg.colourfulness.toFixed(1)}, edge width ${dg.edgeWidth}, forms ${dg.forms}`);
  const one = designFrame(frame((x, y) => grey(disc(DW / 2, DH / 2, 40)(x, y) ? 240 : 10)), DW, DH);
  check('design: one centred disc is one round form, centred, symmetric both ways',
    one.forms === 1 && one.elongation > 0.95 && Math.abs(one.centroid[0] - 0.5) < 0.01 && Math.abs(one.centroid[1] - 0.5) < 0.01 && one.mirror > 0.95 && one.halfTurn > 0.95,
    `forms ${one.forms}, elongation ${one.elongation.toFixed(2)}, centroid ${one.centroid.map(v => v.toFixed(2))}, mirror ${one.mirror.toFixed(2)}, half-turn ${one.halfTurn.toFixed(2)}`);
  const six = designFrame(frame((x, y) => grey([40, 100, 160, 220, 280].some((cx, i) => disc(cx, i % 2 ? 50 : 120, 18)(x, y)) || disc(160, 155, 12)(x, y) ? 240 : 10)), DW, DH);
  const offc = designFrame(frame((x, y) => grey(disc(60, 50, 25)(x, y) ? 240 : 10)), DW, DH);
  check('design: six discs are six forms; one off to the top left is centred there and not symmetric',
    six.forms === 6 && offc.centroid[0] < 0.25 && offc.centroid[1] < 0.35 && offc.mirror < 0.3,
    `forms ${six.forms}; off-centre centroid ${offc.centroid.map(v => v.toFixed(2))}, mirror ${offc.mirror.toFixed(2)}`);
  // A step whose ramp is w pixels wide reads an edge width of w (in % of 320).
  const ramp = w => designFrame(frame(x => grey(Math.round(20 + 220 * Math.max(0, Math.min(1, (x - 160) / w + 0.5))))), DW, DH).edgeWidth;
  const e2 = ramp(2), e32 = ramp(32);
  check('design: an edge ramped over 2 px reads about 0.6% of the width, over 32 px about 10%',
    Math.abs(e2 - 0.625) < 0.25 && Math.abs(e32 - 10) < 1.5, `${e2?.toFixed(2)}%, ${e32?.toFixed(2)}%`);
  const lined = designFrame(frame((x, y) => grey(Math.round(128 + 100 * Math.sin((2 * Math.PI * y) / 24)))), DW, DH);
  // Periods of 24 and 96 pixels: the scale is read on a quarter-size copy,
  // where a 12-pixel period is three pixels and aliases.
  const fine = designFrame(frame((x, y) => grey(Math.round(128 + 100 * Math.sin((2 * Math.PI * x) / 24) * Math.sin((2 * Math.PI * y) / 24)))), DW, DH);
  const coarse = designFrame(frame((x, y) => grey(Math.round(128 + 100 * Math.sin((2 * Math.PI * x) / 96) * Math.sin((2 * Math.PI * y) / 96)))), DW, DH);
  check('design: stripes across are coherent lines at 0°, long across and short down',
    lined.coherence > 0.95 && (lined.lineAngle < 5 || lined.lineAngle > 175) && lined.scaleX === null && lined.scaleY < 3,
    `coherence ${lined.coherence.toFixed(2)}, lines at ${lined.lineAngle.toFixed(0)}°, scale across ${lined.scaleX}, down ${lined.scaleY?.toFixed(2)}%`);
  // Blobs of 12 pixels sit inside a 16-pixel block, so they read no flow
  // lines; the 48-pixel ones show their rims as lines, which is why the
  // coarse grid's coherence is not held to the same bar (watchdesign.mjs).
  check('design: a grid of blobs four times coarser reads four times the scale; small blobs read no flow lines',
    coarse.scaleX / fine.scaleX > 3.3 && coarse.scaleX / fine.scaleX < 4.7 && fine.coherence < 0.35,
    `scale ${fine.scaleX?.toFixed(2)}% → ${coarse.scaleX?.toFixed(2)}% (${(coarse.scaleX / fine.scaleX).toFixed(2)}×); coherence ${fine.coherence.toFixed(2)}, ${coarse.coherence.toFixed(2)}`);
  const sumA = designSummary([one, six], null), sumB = designSummary([coarse], null);
  const cmp = compareDesign(sumA, sumB, 'discs', 'grid');
  const sizes = cmp.map(l => /^- \((\d+(?:\.\d+)?)\)/.exec(l)?.[1]).filter(Boolean).map(Number);
  check('design: --vs words the forms gap (6 discs against the grid\'s) and ranks the gaps biggest first',
    cmp.some(l => l.includes(`forms a frame: grid ${f2(sumB.forms.med)} against ${f2(sumA.forms.med)}, `) && /separate forms/.test(l)) && sumA.forms.med === 6 && sizes.length > 4 && sizes.every((v, i) => !i || v <= sizes[i - 1]),
    `${cmp.find(l => /forms a frame/.test(l)) ?? 'no forms row'}; sizes ${sizes.join(', ')}`);

  // The physics read, on sequences whose flow is known by construction: a
  // texture of soft blobs slid, turned, or faded in place, sampled
  // bilinearly so a sub-pixel move is a real one.
  const TS = 480, tex = new Float32Array(TS * TS);
  let ps = 11; const rnd = () => (ps = (ps * 16807) % 2147483647) / 2147483647;
  for (let b = 0; b < 900; b++) {
    const bx = rnd() * TS, by = rnd() * TS, r = 3 + rnd() * 5, a = 60 + rnd() * 160;
    for (let y = Math.max(0, Math.floor(by - 3 * r)); y < Math.min(TS, by + 3 * r); y++)
      for (let x = Math.max(0, Math.floor(bx - 3 * r)); x < Math.min(TS, bx + 3 * r); x++) tex[y * TS + x] += a * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (2 * r * r));
  }
  const at = (x, y) => {
    const x0 = Math.max(0, Math.min(TS - 2, Math.floor(x))), y0 = Math.max(0, Math.min(TS - 2, Math.floor(y))), fx = x - x0, fy = y - y0;
    return tex[y0 * TS + x0] * (1 - fx) * (1 - fy) + tex[y0 * TS + x0 + 1] * fx * (1 - fy) + tex[(y0 + 1) * TS + x0] * (1 - fx) * fy + tex[(y0 + 1) * TS + x0 + 1] * fx * fy;
  };
  const seq = (n, map, gain = () => 1) => {
    const acc = physicsAcc();
    for (let k = 0; k < n; k++) physicsFrame(frame((x, y) => { const [u, v] = map(x, y, k); return grey(Math.max(0, Math.min(255, Math.round(20 + gain(k, x, y) * at(u, v))))); }), DW, DH, acc, k);
    return acc;
  };
  const RATE = 10, NS = 24, noCut = new Array(NS).fill(false);
  // Slid right 0.8 px a sample at 320 (8 px/s = 2.5% of the width a second).
  const slid = physicsSummary(seq(NS, (x, y, k) => [x + 80 - 0.8 * k, y + 150]), { rate: RATE, cut: noCut, W: DW, scale: 2 });
  check('physics: a texture slid 2.5% of the width a second reads that speed, all of it whole-field, carried',
    Math.abs(slid.whole.med - 2.5) < 0.25 && slid.wholeShare > 0.9 && slid.own.med < 0.3 && slid.carried.med > 0.8,
    `whole ${f2(slid.whole.med)}%/s, share ${f2(slid.wholeShare)}, own ${f2(slid.own.med)}, carried ${f2(slid.carried.med)}`);
  check('physics: and it reads the direction: rightward is positive across, with no drift up or down',
    Math.abs(slid.horizontal - 2.5) < 0.25 && Math.abs(slid.vertical) < 0.2, `across ${f2(slid.horizontal)}, down ${f2(slid.vertical)}`);
  const down = physicsSummary(seq(NS, (x, y, k) => [x + 80, y + 150 - 0.8 * k]), { rate: RATE, cut: noCut, W: DW, scale: 2 });
  const up = physicsSummary(seq(NS, (x, y, k) => [x + 80, y + 150 + 0.8 * k]), { rate: RATE, cut: noCut, W: DW, scale: 2 });
  const gDown = guessTechniques(null, down).map(x => x.text).join(' | '), gUp = guessTechniques(null, up).map(x => x.text).join(' | ');
  check('physics: a texture sinking reads drift down (+2.5) and guesses gravity; rising reads −2.5 and guesses buoyancy',
    Math.abs(down.vertical - 2.5) < 0.25 && Math.abs(up.vertical + 2.5) < 0.25 && /gravity/.test(gDown) && !/buoyancy/.test(gDown) && /buoyancy/.test(gUp) && !/gravity/.test(gUp),
    `down ${f2(down.vertical)}, up ${f2(up.vertical)}`);
  // Turned about the centre at 0.1 rad/s (a turn in 63 s): curl is 2Ω = 0.2/s,
  // and anticlockwise on screen reads negative (image y runs down).
  const OM = 0.1 / RATE;
  const turned = physicsSummary(seq(NS, (x, y, k) => { const c = Math.cos(OM * k), sn = Math.sin(OM * k), X = x - 160, Y = y - 90; return [240 + c * X + sn * Y, 240 - sn * X + c * Y]; }), { rate: RATE, cut: noCut, W: DW, scale: 2 });
  // The map moves the content clockwise on screen (image y runs down), which
  // the summary words from a positive curl; the mirrored turn must read the
  // opposite sign.
  const turnedBack = physicsSummary(seq(NS, (x, y, k) => { const c = Math.cos(-OM * k), sn = Math.sin(-OM * k), X = x - 160, Y = y - 90; return [240 + c * X + sn * Y, 240 - sn * X + c * Y]; }), { rate: RATE, cut: noCut, W: DW, scale: 2 });
  check('physics: a texture turned clockwise once a minute reads a curl of +0.2/s and a turn in about 63 s; turned back, −0.2',
    Math.abs(turned.curl.med - 0.2) < 0.03 && Math.abs(turnedBack.curl.med + 0.2) < 0.03 && turned.wholeShare > 0.8 && Math.abs(turned.div.med) < 0.02,
    `curl ${turned.curl.med?.toFixed(3)}/s, back ${turnedBack.curl.med?.toFixed(3)}/s (one turn in ${(4 * Math.PI / Math.abs(turned.curl.med)).toFixed(0)} s), share ${f2(turned.wholeShare)}, divergence ${turned.div.med?.toFixed(3)}`);
  // Bands that slide alternately left and right (u = 0.8 sin(2πy/120) px a
  // sample): the fluid's own flow, which no whole-picture move explains. RMS
  // 2.5/√2 = 1.77% of the width a second.
  const banded = physicsSummary(seq(NS, (x, y, k) => [x + 80 - 0.8 * k * Math.sin((2 * Math.PI * y) / 120), y + 150]), { rate: RATE, cut: noCut, W: DW, scale: 2 });
  check('physics: bands sliding opposite ways read as the fluid\'s own flow at 1.77% a second, not whole-field',
    Math.abs(banded.own.med - 1.77) < 0.35 && banded.wholeShare < 0.25,
    `own ${f2(banded.own.med)}%/s, whole-field share ${f2(banded.wholeShare)}`);
  // Still, but the light pulses: change with no flow. The pulse is the same
  // over the frame on purpose: a brightness that varies along x with a phase
  // that moves in time is a travelling wave, which is apparent motion to any
  // eye or camera, and the first version of this test was that.
  const faded = physicsSummary(seq(NS, (x, y) => [x + 80, y + 150], k => 0.55 + 0.45 * Math.sin(k * 0.9)), { rate: RATE, cut: noCut, W: DW, scale: 2 });
  check('physics: a still texture whose light pulses in place reads near-zero speed and little carried',
    faded.own.med < 0.4 && faded.whole.med < 0.4 && faded.carried.med < 0.25,
    `own ${f2(faded.own.med)}, whole ${f2(faded.whole.med)}, carried ${f2(faded.carried.med)}`);
  // Spectra: a field built with power per band k^-1 against k^-4.
  // Built 256 square (periodic, from an inverse FFT) and read through a 128
  // square cut from inside it at an odd offset, so the window sees hard,
  // non-matching edges as it does on real footage.
  const field = slope => {
    const S = 256, re = Array.from({ length: S }, () => new Float64Array(S)), im = Array.from({ length: S }, () => new Float64Array(S));
    let sd = 5; const r2 = () => (sd = (sd * 48271) % 2147483647) / 2147483647;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const ky = y <= S / 2 ? y : y - S, kx = x <= S / 2 ? x : x - S, k = Math.hypot(kx, ky);
      // Ring power ∝ k · |A|², so |A| ∝ k^((slope − 1) / 2).
      const amp = k ? k ** ((slope - 1) / 2) : 0, ph = 2 * Math.PI * r2();
      re[y][x] = amp * Math.cos(ph); im[y][x] = amp * Math.sin(ph);
    }
    const ifft = (a, b) => { const n = a.length; for (let i = 0; i < n; i++) b[i] = -b[i]; fftSelf(a, b); for (let i = 0; i < n; i++) { a[i] /= n; b[i] = -b[i] / n; } };
    for (let y = 0; y < S; y++) ifft(re[y], im[y]);
    const cr = new Float64Array(S), ci = new Float64Array(S);
    for (let x = 0; x < S; x++) { for (let y = 0; y < S; y++) { cr[y] = re[y][x]; ci[y] = im[y][x]; } ifft(cr, ci); for (let y = 0; y < S; y++) re[y][x] = cr[y]; }
    let lo = Infinity, hi = -Infinity; for (const row of re) for (const v of row) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    return frame((x, y) => grey(Math.round(30 + 200 * (re[(y + 53) % S][(x + 37) % S] - lo) / (hi - lo))));
  };
  const f1 = field(-1), f4 = field(-4);
  const s1 = spectrumSlope(f1, DW, DH), s4 = spectrumSlope(f4, DW, DH), s4raw = spectrumSlope(f4, DW, DH, { hann: false });
  // −4 reads about −3: 8-bit quantisation is white noise, and the field's
  // power falls under it inside the band (watchphysics.mjs). What matters is
  // that it reads steep (the "smooth blobs" band, under −2.8), apart from −1,
  // and that the window is what keeps it there.
  check('physics: a field built at slope −1 reads about −1, one at −4 reads steep (under −2.8), and the window is what holds it',
    Math.abs(s1 + 1) < 0.35 && s4 < -2.8 && s4raw - s4 > 0.6, `${s1?.toFixed(2)}, ${s4?.toFixed(2)}; with no window ${s4raw?.toFixed(2)}`);
  const tech = scanTechniques({ title: 'Liquid light show with an overhead projector', description: 'Mineral oil, food coloring and a clock glass; slow motion at 240 fps', tags: ['ferrofluid'] });
  check('physics: the page scan names the rig, the oils, the dyes, the magnet and the camera speed',
    ['liquid light rig', 'oils and water', 'dyes and inks', 'magnetism', 'camera speed'].every(fam => tech.some(t => t.family === fam)),
    tech.map(t => `${t.family}: ${t.words.join('/')}`).join('; '));
  const notTech = scanTechniques({ title: 'Weeknight steak', description: 'Olive oil in the pan, a reverse sear, the recipe on the fridge magnet, notes with a ballpoint ink pen' });
  check('physics: and a cooking video\'s olive oil, fridge magnet, reverse sear and ink pen name none of them',
    !notTech.some(t => ['oils and water', 'dyes and inks', 'magnetism', 'camera speed'].includes(t.family)), notTech.map(t => `${t.family}: ${t.words.join('/')}`).join('; ') || 'none');
  const guess = guessTechniques(null, turned).map(x => x.text);
  const gSlid = guessTechniques(null, slid).map(x => x.text), gBand = guessTechniques(null, banded).map(x => x.text);
  check('physics: a turning texture is guessed as a turned glass; a slid or banded one is not',
    /turned/.test(guess[0] ?? '') && !gSlid.some(t => /turned/.test(t)) && !gBand.some(t => /turned/.test(t)),
    `${guess[0] ?? 'no guess'}; slid: ${gSlid[0] ?? 'none'}`);

  // The real shows' ranges (47v-3), beside the bands. The in-place guess
  // fires just under the lowest real show and not just over it: the bar is
  // the real shows' floor, where the synthetic bar (0.3) called both real
  // films digital.
  const rc = realRange('carried');
  const atCarried = v => ({ ...faded, carried: { ...faded.carried, med: v } });
  const inPlace = g => g.some(t => /changes in place/.test(t.text));
  check('physics: the in-place guess fires just under the lowest real show\'s carried share and not just over it',
    inPlace(guessTechniques(null, atCarried(rc[0] - 0.01))) && !inPlace(guessTechniques(null, atCarried(rc[0] + 0.01))),
    `real shows carried ${rc.map(v => f2(v)).join(' to ')}; guessed at ${f2(rc[0] - 0.01)}, not at ${f2(rc[0] + 0.01)}`);
  // And the read prints the range beside each of the five measures, by
  // name, saying when a clip falls outside every real show: the pulsing
  // light (given a lifetime, which on its own it never loses) is under them
  // on carried, the slid texture over.
  const fl = physicsLines({ ...faded, lifetime: 0.5 }).join('\n'), sl = physicsLines(slid).join('\n');
  const noted = ['flow', 'carried', 'turnover', 'lifetime', 'spectrum'].filter(m => new RegExp(`\\*\\*${m}\\*\\*: [^\\n]*real shows`).test(fl));
  check('physics: the read prints the real shows beside flow, carried, turnover, lifetime and spectrum, and says under or over',
    noted.length === 5 && /carried\*\*: [^\n]*under every real show/.test(fl) && /carried\*\*: [^\n]*over every real show/.test(sl),
    `noted on ${noted.join(', ')}; ${(fl.split('\n').find(l => /carried\*\*/.test(l)) ?? '').slice(0, 110)}`);
}

/**
 * A take for the dissolve clips (scripts/watchcuts.mjs, 47w-2): seven soft
 * blobs of dye on a dark ground, in the palette given, each drifting `v`
 * pixels a frame in its own direction, so the take moves by itself the way
 * liquid footage does and a mix of two takes is never a still picture.
 * Returns f → RGB for a W×H frame.
 */
export function blobTake(seed, colours, v = 0.4, W = 320, H = 180) {
  let s = seed * 7919 + 13;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const blobs = Array.from({ length: 7 }, (_, i) => {
    const ang = rnd() * 2 * Math.PI;
    return { x: rnd() * W, y: rnd() * H, r: 18 + rnd() * 24, vx: v * Math.cos(ang), vy: v * Math.sin(ang), c: colours[i % colours.length] };
  });
  return f => {
    const img = Buffer.alloc(W * H * 3);
    const at = blobs.map(b => [b.x + b.vx * f, b.y + b.vy * f, 1 / (2 * b.r * b.r)]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r = 12, g = 10, bl = 16;
      for (let i = 0; i < blobs.length; i++) {
        const w = Math.exp(-((x - at[i][0]) ** 2 + (y - at[i][1]) ** 2) * at[i][2]);
        r += w * blobs[i].c[0]; g += w * blobs[i].c[1]; bl += w * blobs[i].c[2];
      }
      const p = (y * W + x) * 3;
      img[p] = Math.min(255, r); img[p + 1] = Math.min(255, g); img[p + 2] = Math.min(255, bl);
    }
    return img;
  };
}

/**
 * The dissolve clips of watch.mjs's self-test (47w-2), as frame makers for a
 * W×H clip at FPS frames a second.
 *
 * F, fourteen seconds of four takes of drifting dye (47w-2): a dissolve
 * over 1.5 s from 4.0 s into a take in the same colours (which the colour
 * test cannot see), pausing for one sample half-way, a hard cut at 8.0 s, and a dissolve over 1.0 s from
 * 10.0 s into a take in other colours. G is one calm take with three
 * things that change the frame by a cut's worth over a second and are not
 * dissolves, each turned down by its own step of scripts/watchcuts.mjs: a
 * bright pour sweeping across from 3.0 to 4.5 s and staying (its middle
 * frame is no mix of its ends), a dye body spreading in place from 8.0 to
 * 9.0 s, and the lamp dimming to 45% from 13.0 to 14.0 s and coming back
 * from 15.0 to 16.0 (a mix of its ends, but back to a picture the take
 * already showed).
 */
export function dissolveClips(W, H, FPS) {
  const WARM = [[230, 90, 20], [200, 20, 120], [240, 200, 40]], COOL = [[20, 160, 200], [40, 200, 90], [90, 60, 220]];
  const tk = [1, 2, 3].map(k => blobTake(k, WARM, 0.4, W, H)).concat([blobTake(4, COOL, 0.4, W, H)]), calm = blobTake(5, WARM, 0.12, W, H);
  const xf = (a, b, u) => { const o = Buffer.alloc(a.length); for (let i = 0; i < a.length; i++) o[i] = Math.round(a[i] * (1 - u) + b[i] * u); return o; };
  const frameF = f => {
    const t = f / FPS;
    if (t < 4) return tk[0](f);
    // The weight holds for one sample (4.7 to 4.8 s) half-way: one quiet
    // sample, as the codec or the takes' own motion make, must not split
    // the dissolve in two.
    if (t < 5.5) return xf(tk[0](f), tk[1](f), ((t < 4.7 ? t : t < 4.8 ? 4.7 : t - 0.1) - 4) / 1.4);
    if (t < 8) return tk[1](f);
    if (t < 10) return tk[2](f);
    if (t < 11) return xf(tk[2](f), tk[3](f), t - 10);
    return tk[3](f);
  };
  const ease = u => Math.max(0, Math.min(1, u));
  const frameG = f => {
    const t = f / FPS, img = calm(f);
    const px = 30 + 260 * ease((t - 3) / 1.5), rad = 10 + 90 * ease(t - 8);
    const lamp = 1 - 0.55 * (ease(t - 13) - ease(t - 15));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 3;
      if (Math.hypot(x - px, y - 60) < 30) img.set([250, 250, 230], p);
      if (Math.hypot(x - 200, y - 120) < rad) img.set([240, 30, 150], p);
      for (let c = 0; c < 3; c++) img[p + c] = Math.round(img[p + c] * lamp);
    }
    return img;
  };
  return { frameF, frameG };
}
