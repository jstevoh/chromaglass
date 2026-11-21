#!/usr/bin/env node
/**
 * The soap film on the plate (PLAN 32d): `npm run soapplate`.
 *
 * What was reported (2026-11-12, the looks filmed against the owner's
 * references): Soap Film was 82 to 87% black, mean luminance 0.05 against the
 * 0.48 of the owner's "Liquid Tapestry" photograph, and one hue (spread 0.02
 * against 0.41). It had no film in it: its colour was Thin Film's ring table
 * read off the dye's amount, a tint of the pigment, and the soap tore the dye
 * away. Now the frame holds the draining film of §32 (gpu/soapFilmPlate.ts)
 * and the plate draws the film's reflected colour from its thickness
 * (plateThinFilm.ts, soapFilmOver). This holds the feature, not a moment:
 *
 *   1. Off is off. A plate stepped with Soap Film up and drawn at 0 is, to
 *      the byte, the same plate stepped and drawn with it never on: the film
 *      writes nothing into the plate's own fields, and the shader's gate
 *      draws nothing. With it off the solver makes no film at all. Control:
 *      the same plate drawn at 0.05 is not the same bytes, so the comparison
 *      can see a film when there is one. Turned off, the film goes.
 *
 *   2. The plate draws the film's own colours, where the film has them. The
 *      film's thickness is read back and the CPU reference draws it
 *      (soapFilmRgb, the picture `npm run soapfilm` judges against the
 *      photograph); the plate's picture of the same moment, the film alone
 *      over a dark ground, must follow it cell for cell (the correlation of
 *      their colours' detail, the plate behind the film taken out), and the same
 *      picture turned upside down must not (the film hangs: thin at the top,
 *      thick at the bottom, and a flipped read would draw it standing on its
 *      head, which is the bug this check caught while it was written). A
 *      colour laid on by height, or a noise that is not the film's, cannot
 *      follow the film's own patches.
 *
 *   3. The reported numbers, on the lab's picture of the look: mean luminance
 *      over 0.25 (was 0.05), under 15% of the frame near black (luma under
 *      0.12, was 82 to 87%), and six or more of the twelve hue sectors each
 *      holding 4% of the coloured pixels (was one); and the same look drawn
 *      with the film at 0 fails all three, so it is the film that lights it.
 *
 *   4. The air the plate's flow makes moves the film, and only moves it: the
 *      same film stirred and left alone part (RMS of the difference over 2%
 *      of the film's own spread, and over 5 nm under the stir), while the
 *      film's total stays within 1% of
 *      the unstirred one's (it is inextensible: a swirl, never a stretch).
 *      The stir is off the frame's middle, and the film must move under it
 *      three times what it does at its mirror, so a flow read upside down
 *      fails.
 *
 *   5. A drained film is drawn again, top first. A film laid black (20 nm,
 *      every cell ruptured) is a drained film; within the pull's two seconds
 *      the top half is fresh film while the bottom is still black, and after
 *      it the whole frame holds a fresh film's thickness again (within 20%),
 *      one that moves and drains (painted-fresh cells left ruptured would
 *      not); and a film over the floor (200 nm) is left alone.
 *
 *   6. The angle is Snell's: drawn at Film Angle 45 the plate follows the CPU
 *      reference at cosI = cos 45° more closely than it follows the reference
 *      straight on (the bands move to a thicker film as you lean).
 *
 *   7. Big motions run and small ones crawl (PLAN 32k, 2026-11-13: about 12
 *      forms a frame on the Mac against the owner's photograph's 55, and no
 *      folded streaks). The same 20 nm of unevenness laid frame-wide turns
 *      over at ten times the speed Darcy's law with the tuned ζ allows any
 *      motion, and laid as 6 mm patches stays within twice it; and with the
 *      frame tilted 12° from flat (Frame Tilt, 32h) at sin 12° of that speed.
 *
 *   8. The film stirs its own air (32d-1): on a plate with no flow at all,
 *      the air over the frame moves, because the film's plumes drag it.
 */
import { build } from 'esbuild';
import { openLab } from './lab.mjs';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? ' ok  ' : ' FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) passed++; else failed++;
};

const out = 'node_modules/.cache/soapplate-ref.mjs';
await build({
  stdin: { contents: "export { createSoapFilm, soapFilmRgb } from './src/lib/soapFilm.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const { createSoapFilm, soapFilmRgb } = await import(`../${out}`);

const N = 128;         // the film's grid (SOAP_PLATE_GRID)
const R = 256;         // the plate's picture: two pixels a film cell, the frame filling it (gpu/soapFrame.ts)
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const { page, close } = await openLab();
let res;
try {
  res = await page.evaluate(async ({ N, R }) => {
    const look = lab.look('soap-film').settings;
    // The film alone over a dark ground, no look's grade: what the shader draws.
    const bare = { soapFilm: 1, ledColor: '#000000', ledPlatform: false };
    const cam = { zoom: 1, macroAmount: 0, cx: 0.5, cy: 0.5, bubbles: 0 };
    const lay = async () => {
      await lab.create(N);
      lab.dye(0.5, 0.5, 0.3, [0.5, 0.4, 0.6], 0.3);
      lab.flush();
    };
    const film = () => lab.solver().soapPlate;
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const o = {};

    // 1 and 2: a film ten seconds old (150 steps at four times its pace).
    await lay();
    await lab.step(150, { soapFilm: 1, soapFilmRate: 4 });
    o.h = Array.from((await film().read()).h);
    o.on = Array.from(await lab.render(R, { ...look, soapFilm: 1 }, cam));
    o.bare = Array.from(await lab.render(R, bare, cam));
    o.angled = Array.from(await lab.render(R, { ...bare, soapFilmAngle: 45 }, cam));
    o.offA = Array.from(await lab.render(R, { ...look, soapFilm: 0 }, cam));
    o.faint = Array.from(await lab.render(R, { ...look, soapFilm: 0.05 }, cam));
    // Turned off, the film goes (and the next time it is a fresh one).
    await lab.step(1, { soapFilm: 0 });
    o.keptOff = lab.solver().fields.soapFilm !== null;
    await lay();
    await lab.step(150, { soapFilm: 0, soapFilmRate: 4 });
    o.madeOff = lab.solver().fields.soapFilm !== null;
    o.offB = Array.from(await lab.render(R, { ...look, soapFilm: 0 }, cam));

    // 4: the same film stirred and not. The stir is off the frame's middle,
    // in the plate's upper left (plate uv 0.35, 0.7, which is the film's cell
    // 0.275 across and 0.2 down: the film's rows run down the picture), so a
    // flow read upside down would stir the film's lower left instead.
    const stirred = async (stir) => {
      await lay();
      await lab.step(5, { soapFilm: 1 });
      for (let k = 0; k < 30; k++) {
        if (stir) {
          const a = k * 0.6;
          lab.vel(0.35, 0.7, 0.08, [1.5 * Math.cos(a), 1.5 * Math.sin(a), 0, 0]);
          lab.flush();
        }
        await lab.step(1, { soapFilm: 1 });
      }
      return Array.from((await film().read()).h);
    };
    o.hStir = await stirred(true);
    o.hStill = await stirred(false);

    // 5: a drained film, drawn again.
    await lay();
    await lab.step(1, { soapFilm: 1 });
    film().film.write(new Float32Array(N * N).fill(20));
    await lab.step(60, { soapFilm: 1 });
    o.hHalf = Array.from((await film().read()).h);
    await lab.step(90, { soapFilm: 1 });
    o.hAfter = Array.from((await film().read()).h);
    // and the redrawn film is a live one: it moves and drains.
    await lab.step(30, { soapFilm: 1, soapFilmRate: 4 });
    o.hLater = Array.from((await film().read()).h);
    // A film that has not drained (200 nm, over the floor) is left alone.
    film().film.write(new Float32Array(N * N).fill(200));
    await lab.step(60, { soapFilm: 1 });
    o.hKept = Array.from((await film().read()).h);
    o.sums = [sum(o.hStir), sum(o.hStill)];

    // 7: big motions run, small ones crawl. The same 20 nm of unevenness,
    // laid once as one frame-wide tilt (thick on the left, thin on the right)
    // and once as patches 6 mm across, at a slow drain rate so the film has
    // barely moved when its velocity is read (the big swirls' solve is warm-
    // started, so it is given twenty steps to settle).
    const mobility = async (shape, tilt = 90) => {
      await lay();
      await lab.step(1, { soapFilm: 1, soapFilmTilt: tilt });
      const h = new Float32Array(N * N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) h[j * N + i] = 500 + 20 * shape(i + 0.5, j + 0.5);
      film().film.write(h);
      await lab.step(20, { soapFilm: 1, soapFilmRate: 0.25, soapFilmTilt: tilt });
      const r = await film().film.read();
      let q = 0; for (const v of r.uf) q += v * v; for (const v of r.vf) q += v * v;
      // Which way the halves go: vf is down the film (rows run down), on the
      // nx × (ny + 1) horizontal faces.
      let left = 0, right = 0;
      for (let j = 1; j < N; j++) for (let i = 0; i < N; i++) { if (i < N / 2) left += r.vf[j * N + i]; else right += r.vf[j * N + i]; }
      return { rms: Math.sqrt(q / (r.uf.length + r.vf.length)), left, right };
    };
    o.mobBig = await mobility((x) => Math.cos(Math.PI * x / N));
    o.mobPatch = await mobility((x, y) => Math.cos(2 * Math.PI * x / 6) * Math.cos(2 * Math.PI * y / 6));
    o.mobTilt = await mobility((x) => Math.cos(Math.PI * x / N), 12);

    // 8: the film's own plumes stir the air. No dye and nothing stirred, so
    // the plate has no flow at all: whatever turns the air is the film.
    await lab.create(N);
    lab.flush();
    await lab.step(30, { soapFilm: 1, soapFilmRate: 4 });
    o.airStill = film().air ? Array.from(await film().air.read()) : null;
    { const r = await film().film.read(); let q = 0; for (const v of r.uf) q += v * v; for (const v of r.vf) q += v * v; o.filmStill = Math.sqrt(q / (r.uf.length + r.vf.length)); }
    return o;
  }, { N, R });
} finally {
  await close();
}

// ── 1. Off is off ────────────────────────────────────────────────────
const diffCount = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };
check('with Soap Film off the solver makes no film', !res.madeOff, res.madeOff ? 'a film was made' : 'none');
check('and turned off, the film it had goes', !res.keptOff, res.keptOff ? 'still there' : 'gone');
const offDiff = diffCount(res.offA, res.offB);
check('a plate stepped with the film and drawn at 0 is the plate that never had one, to the byte', offDiff === 0, `${offDiff} bytes differ`);
const faintDiff = diffCount(res.faint, res.offA);
check('and the comparison sees a film when one is drawn (the same plate at 0.05 differs)', faintDiff > R * R * 0.05, `${faintDiff} bytes differ`);

// ── 2. The film's own colours ────────────────────────────────────────
/*
  The plate reads the film through a cubic B-spline (soapThickness), which at
  a cell's centre is the cell and its neighbours weighed 1, 4, 1 over 6 each
  way; at a pixel a quarter of a cell off it is near that. So the reference is
  drawn from the same smoothed film, or the comparison would be measuring the
  laid film's cell-to-cell noise, which the spline is there to round off.
*/
const spline = (h) => {
  const at = (i, j) => h[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
  const tmp = new Float64Array(N * N), outH = new Float64Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) tmp[j * N + i] = (at(i - 1, j) + 4 * at(i, j) + at(i + 1, j)) / 6;
  const t = (i, j) => tmp[Math.min(N - 1, Math.max(0, j)) * N + i];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) outH[j * N + i] = (t(i, j - 1) + 4 * t(i, j) + t(i, j + 1)) / 6;
  return outH;
};
const cpuPicture = (h, cosI) => {
  const f = createSoapFilm({ nx: N, ny: N, noise: 0 });
  f.h.set(spline(h));
  return soapFilmRgb(f, { cosI });
};
// The plate's picture folded to the film's cells (2 × 2 pixels each), row 0 at the top, rgb 0..1.
const fold = (px) => {
  const C = new Float64Array(N * N * 3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) {
    let s = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += px[((2 * j + dy) * R + 2 * i + dx) * 4 + c] / 255;
    C[(j * N + i) * 3 + c] = s / 4;
  }
  return C;
};
const cpuRgb = (rgb, flip = false) => {
  const C = new Float64Array(N * N * 3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) {
    C[(j * N + i) * 3 + c] = rgb[((flip ? N - 1 - j : j) * N + i) * 3 + c];
  }
  return C;
};
/*
  Pearson over the frame's inside (the border's cells and the spline's reach
  left out), of the colour and not only the luminance, and of each picture's
  own detail: each channel less its mean over the 17 × 17 cells around it.

  Why the colour: luminance alone was tried first and is blind where it
  matters. A film in its higher orders (600 nm and up) is a play of pinks and
  greens at nearly one brightness.

  Why the detail: the film is drawn over the plate, and the plate behind it
  shows through what the film does not reflect: the dye laid in the middle
  and the lamp's fall-off. Those are broad (measured on this plate: the
  picture twice the reference's brightness in the middle, the same at the
  rim), and they took the plain correlation of a plate that drew the film
  exactly down to 0.70, where the film's own pattern, the plumes and bands a
  cell or two across, correlates at 0.95. A band of a seventh of the frame
  keeps every form the film has and none of the plate behind it.
*/
const K = 8;
const detail = (C) => {
  const o = new Float64Array(N * N * 3);
  for (let c = 0; c < 3; c++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let s = 0, m = 0;
    for (let y = Math.max(0, j - K); y <= Math.min(N - 1, j + K); y++) for (let x = Math.max(0, i - K); x <= Math.min(N - 1, i + K); x++) { s += C[(y * N + x) * 3 + c]; m++; }
    o[(j * N + i) * 3 + c] = C[(j * N + i) * 3 + c] - s / m;
  }
  return o;
};
const corr = (a0, b0) => {
  const a = detail(a0), b = detail(b0);
  let sab = 0, saa = 0, sbb = 0;
  for (let j = 4; j < N - 4; j++) for (let i = 4; i < N - 4; i++) for (let c = 0; c < 3; c++) {
    const x = a[(j * N + i) * 3 + c], y = b[(j * N + i) * 3 + c];
    sab += x * y; saa += x * x; sbb += y * y;
  }
  return sab / Math.sqrt(Math.max(1e-12, saa * sbb));
};
const plateOn = fold(res.bare);
const cpu0 = cpuPicture(res.h, 1);
const rOn = corr(plateOn, cpuRgb(cpu0));
const rFlip = corr(plateOn, cpuRgb(cpu0, true));
check('the plate draws the film the reference draws, cell for cell (correlation of their colours\' detail over 0.9)', rOn > 0.9, `r = ${rOn.toFixed(3)}`);
check('and not the film upside down (correlation with the flipped reference under half of that)', rFlip < 0.5 * rOn, `r = ${rFlip.toFixed(3)}`);

// ── 3. The reported numbers ──────────────────────────────────────────
// And their control: the same look drawn with the film at 0 must fail all
// three, or the light and the colour came from something other than the film.
const reported = (px) => {
  let lum = 0, black = 0, coloured = 0;
  const sectors = new Array(12).fill(0);
  for (let k = 0; k < px.length; k += 4) {
    const r = px[k] / 255, g = px[k + 1] / 255, b = px[k + 2] / 255;
    const L = luma(r, g, b);
    lum += L;
    if (L < 0.12) black++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn > 0.08) {
      coloured++;
      let hue;
      if (mx === r) hue = ((g - b) / (mx - mn) + 6) % 6;
      else if (mx === g) hue = (b - r) / (mx - mn) + 2;
      else hue = (r - g) / (mx - mn) + 4;
      sectors[Math.min(11, Math.floor(hue * 2))]++;
    }
  }
  const n = px.length / 4;
  return { lum: lum / n, black: black / n, held: sectors.filter((x) => coloured > 0 && x / coloured > 0.04).length, coloured: coloured / n };
};
{
  const on = reported(res.on), off = reported(res.offA);
  check('the look is lit: mean luminance over 0.25 (was 0.05)', on.lum > 0.25, on.lum.toFixed(3));
  check('and not black: under 15% of the frame near black (was 82 to 87%)', on.black < 0.15, `${(100 * on.black).toFixed(1)}%`);
  check('and a rainbow: six or more of twelve hue sectors each hold 4% of the colour (was one)', on.held >= 6, `${on.held} of 12, ${(100 * on.coloured).toFixed(0)}% of the frame coloured`);
  check('control: the same look with the film at 0 fails all three (the film is what lights it)', off.lum <= 0.25 && off.black >= 0.15 && off.held < 6,
    `luminance ${off.lum.toFixed(3)}, ${(100 * off.black).toFixed(1)}% near black, ${off.held} sectors`);
}

// ── 4. The air moves the film, and only moves it ─────────────────────
{
  const a = res.hStir, b = res.hStill;
  let mean = 0; for (const v of b) mean += v; mean /= b.length;
  let spread = 0, d = 0;
  for (let i = 0; i < b.length; i++) { spread += (b[i] - mean) ** 2; d += (a[i] - b[i]) ** 2; }
  const rel = Math.sqrt(d / spread);
  check('the plate\'s flow moves the film (stirred against still, RMS difference over 2% of the film\'s spread)', rel > 0.02, `${(100 * rel).toFixed(1)}%`);
  // Where: around the stir's film cell (0.275, 0.2) against its mirror below (0.275, 0.8).
  const box = (cx, cy) => {
    let s2 = 0, m = 0;
    for (let j = Math.round((cy - 0.12) * N); j < Math.round((cy + 0.12) * N); j++) for (let i = Math.round((cx - 0.12) * N); i < Math.round((cx + 0.12) * N); i++) {
      s2 += (a[j * N + i] - b[j * N + i]) ** 2; m++;
    }
    return Math.sqrt(s2 / m);
  };
  const at = box(0.275, 0.2), mirror = box(0.275, 0.8);
  // The size held too: 15 nm RMS under the stir when written, a coupling a third as strong fails.
  check('and where the flow is: under the stir the film moves over 5 nm RMS, three times what it does at the stir\'s mirror below', at > 5 && at > 3 * mirror, `${at.toFixed(1)} nm against ${mirror.toFixed(1)} nm`);
  const [sa, sb] = res.sums;
  const drift = Math.abs(sa - sb) / sb;
  check('and makes or loses no film doing it (totals within 1%)', drift < 0.01, `${(100 * drift).toFixed(2)}%`);
}

// ── 5. A drained film is drawn again, top first ──────────────────────
{
  const rows = (h, j0, j1) => { let s = 0; for (let j = j0; j < j1; j++) for (let i = 0; i < N; i++) s += h[j * N + i]; return s / ((j1 - j0) * N); };
  const topHalf = rows(res.hHalf, 4, N / 2 - 8), bottomHalf = rows(res.hHalf, N / 2 + 8, N - 4);
  check('a drained film is drawn again from the top: halfway, the top is fresh film and the bottom still black', topHalf > 250 && bottomHalf < 40, `top ${topHalf.toFixed(0)} nm, bottom ${bottomHalf.toFixed(0)} nm`);
  // A fresh film's mean (freshFilm, √ of the depth from 350 to 750 nm): 350 + 400 × 2/3.
  const fresh = 350 + 400 * (2 / 3);
  const after = rows(res.hAfter, 0, N);
  check('and once drawn the whole frame holds a fresh film (mean within 20% of a fresh film\'s)', Math.abs(after - fresh) / fresh < 0.2, `${after.toFixed(0)} nm against ${fresh.toFixed(0)}`);
  // A live film, not black cells painted fresh: it moves and drains after.
  let sp = 0, dd = 0;
  for (let i = 0; i < res.hAfter.length; i++) { sp += (res.hAfter[i] - after) ** 2; dd += (res.hLater[i] - res.hAfter[i]) ** 2; }
  const later = rows(res.hLater, 0, N), moved = Math.sqrt(dd / sp);
  check('and the redrawn film is alive: it changes (over 1% of its spread) and drains', moved > 0.01 && later < after, `${(100 * moved).toFixed(1)}%, ${after.toFixed(0)} → ${later.toFixed(0)} nm`);
  const keptBottom = rows(res.hKept, N / 2 + 8, N - 4);
  check('and a film that has not drained (200 nm, over the floor) is not drawn again', keptBottom < 250, `bottom half ${keptBottom.toFixed(0)} nm after a second`);
}

// ── 6. The angle ─────────────────────────────────────────────────────
{
  const plate45 = fold(res.angled);
  const r45 = corr(plate45, cpuRgb(cpuPicture(res.h, Math.cos(Math.PI / 4))));
  const r0 = corr(plate45, cpuRgb(cpu0));
  check('leaning the film is Snell\'s law: at 45° the plate follows the reference at 45° better than straight on', r45 > r0 + 0.2 && r45 > 0.85, `r = ${r45.toFixed(3)} against ${r0.toFixed(3)}`);
}

// ── 7. Big motions run, small ones crawl ─────────────────────────────
/*
  The film is a two-dimensional Brinkman fluid (gpu/soapAir.ts, PLAN 32k):
  the air's drag on its faces resists a motion of any size alike, its surface
  viscosity resists a small one far more. Darcy's law with the solver's one
  tuned ζ (wgsl/soapFilm.ts) moves no part of the film faster than
  ρ g Δh / ζ, 0.13 mm/s for these 20 nm, at any size: the swirls the frame
  had before this were the size of the laid patches. Now the frame-wide
  imbalance must turn over at ten times that, while the 6 mm patches stay
  within twice it (their speed was the tuned one, and is kept).
*/
{
  const ceiling = (1000 * 9.81 * 20e-9) / 1.5;
  const big = res.mobBig, patch = res.mobPatch;
  // And the right way round: the thick left half sinks (down the film, +vf) and the thin right half rises.
  check('big motions run: a frame-wide 20 nm imbalance turns over at ten times the tuned Darcy ceiling, thick side sinking', Number.isFinite(big.rms) && big.rms > 10 * ceiling && big.left > 0 && big.right < 0,
    `${(big.rms * 1e3).toFixed(2)} mm/s rms against a ceiling of ${(ceiling * 1e3).toFixed(2)}; left half ${big.left > 0 ? 'sinks' : 'rises'}, right ${big.right < 0 ? 'rises' : 'sinks'}`);
  // Two-sided: a frozen film would pass an upper bound alone. Main's patches
  // read 0.037 mm/s; the air the patches stir adds to it (the air loop), so the
  // band is a tenth of the ceiling to twice it.
  check('and small ones crawl: 6 mm patches of the same 20 nm move, at a tenth to twice that ceiling', Number.isFinite(patch.rms) && patch.rms > 0.1 * ceiling && patch.rms < 2 * ceiling,
    `${(patch.rms * 1e3).toFixed(3)} mm/s rms`);
  // Frame Tilt (32h): gravity along a frame tilted θ from flat is g sin θ,
  // and the film's speed is linear in its weight, so at 12° the same
  // imbalance turns over at sin 12° = 0.21 of the hanging speed.
  const ratio = res.mobTilt.rms / big.rms, want = Math.sin(12 * Math.PI / 180);
  check('and a frame tilted 12° from flat turns the same imbalance over at sin 12° of that (within 5%)', Math.abs(ratio - want) / want < 0.05,
    `${ratio.toFixed(3)} of the hanging speed, sin 12° = ${want.toFixed(3)}`);
}

// ── 8. The film stirs its own air ────────────────────────────────────
/*
  The air over the frame is a fluid of its own (gpu/soapAir.ts, 32d-1): the
  film's draining plumes drag it, and it keeps the motion. On a plate with no
  dye and no stir the plate's flow is zero, so any air moving is the film's
  doing. Before the air layer there was no air to read (a film that only
  copied the plate's flow would read 0 here).
*/
{
  const a = res.airStill;
  let q = 0, n = 0;
  if (a) for (let k = 0; k < a.length; k += 2) { q += a[k] * a[k] + a[k + 1] * a[k + 1]; n++; }
  const rms = n ? Math.sqrt(q / n) : 0;
  // Not just moving: tied to the film's own motion. Held steady the air would
  // take kFilm / (kFilm + λ) = 2/3 of the film's speed; a fresh film's plumes
  // are fastest in its first second and slow as it sorts, and the air keeps
  // what they gave it (its memory, 1/λ ≈ 2 s), so two seconds in it reads
  // about the film's own speed (1.07 when written). The band, 0.3 to 2, is
  // that share and not a stray stir or a leaking texture, which would not be
  // tied to the film's speed at all.
  const share = rms / res.filmStill;
  check('the film\'s own plumes set the air over it moving (no plate flow): air at 0.3 to 2 times the film\'s speed', Number.isFinite(share) && share > 0.3 && share < 2,
    `air ${(rms * 1e3).toFixed(3)} mm/s, film ${(res.filmStill * 1e3).toFixed(3)} mm/s, ${share.toFixed(2)}`);
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
