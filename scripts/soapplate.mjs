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
 *   7. The film lets the plate through as a soap film does (PLAN 32d-6,
 *      owed until it is built). A soap film is a lossless sheet of water a
 *      few hundred nanometres thick: what it does not reflect it transmits,
 *      T = 1 − R, and Airy's R for water in air is never more than about 8%
 *      (worked out below from the film's index, not taken from the shader).
 *      So a wedge of film from 0 to 1.5 µm laid over a lit plate must let at
 *      least 92% of the plate's light through everywhere, in linear light,
 *      and the share it takes must follow Airy's R along the wedge (the
 *      first order's peak near 100 nm, the black at the thin end); a black
 *      film (8 nm) must let more than 99% through, and never more than all
 *      of it. On main the film's colour
 *      is the table's times SOAP_GAIN 4, encoded, and the plate behind is
 *      dimmed by that encoded colour's luma, so up to about 60% of the light
 *      goes, and even a black film takes a share of it.
 *
 *        npm run soapplate -- --owed=wedge,black
 *
 *   8. Big motions run and small ones crawl (PLAN 32k, 2026-11-13: about 12
 *      forms a frame on the Mac against the owner's photograph's 55, and no
 *      folded streaks). The same 20 nm of unevenness laid frame-wide turns
 *      over at ten times the speed Darcy's law with the tuned ζ allows any
 *      motion, and laid as 6 mm patches stays within twice it; and with the
 *      frame tilted 12° from flat (Frame Tilt, 32h) at sin 12° of that speed.
 *
 *   9. The film stirs its own air (32d-1): on a plate with no flow at all,
 *      the air over the frame moves, because the film's plumes drag it.
 */
import { build } from 'esbuild';
import { openLab } from './lab.mjs';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? ' ok  ' : ' FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) passed++; else failed++;
};

/*
  Lines written ahead of their build (PLAN 32d-6), printed as owed while what
  they ask for is absent and red the day they pass with their id still listed
  (the convention of gap.mjs and timers.mjs): the PR that builds the item
  takes its ids out of --owed in scripts/checks.json and never edits a line or
  a bar. An owed line is excused only while the plate still draws main's film,
  which is told by the transmission main measures (MAIN_T in section 7,
  within 0.005): a build that changes the composite moves it, and a build that
  is there and misses is then red, owed or not. A half-built item (the
  composite moved to linear light with the gain of 4 kept, say) lands outside
  main's window and under the bar, so it is red too.
*/
const IDS = ['wedge', 'black'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
const unknown = [...owed].filter((id) => !IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${IDS.join(', ')})`);
/** `mainState`: what the line is owed for is absent, which is the only state an owed line is excused in. */
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
};

const out = 'node_modules/.cache/soapplate-ref.mjs';
await build({
  stdin: { contents: "export { createSoapFilm, soapFilmRgb } from './src/lib/soapFilm.ts'; export { SOAP } from './src/lib/filmTable.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const { createSoapFilm, soapFilmRgb, SOAP } = await import(`../${out}`);

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

    /*
      7: what the film lets through. The film is laid by hand and drawn with
      no step between, so it is exactly the film written: a wedge from 0 to
      1500 nm across the frame (each column of cells one thickness, the
      B-spline exact on a straight ramp away from the border), then a black
      film of 8 nm. Each is drawn four ways: the film over a lit plate and
      over a dark one, and the same two plates with the film at 0. The
      plate's own light at a pixel is lit − dark with the film off, what
      reaches the eye through the film is lit − dark with it on (the
      reflected light, the same over both, cancels), and their ratio, in
      linear light, is the film's transmission T. The lamp's fall-off and
      whatever the plate does behind the film divide out, so a ground that is
      not flat cannot move it.

      Light, not pixels. The ratio is of light only if the picture is linear
      in light, and the plate's is not: decoding sRGB undoes the encode but
      not the tone map and the plate's own response, and measured on main
      (2026-11-21) the plate under half the lit plate's light reads 0.5505
      of it in decoded pixels where the light is 0.4977 of it, 10.6% high,
      so a share taken from the light is misread by about as much.
      So the harness measures the plate's response here and inverts it: the
      film-off plate is drawn under a ramp of LED levels (0, 12, … 252, 255
      on all three channels), which at every pixel and channel gives the
      pixel value each level of light makes, and a pixel of any picture is
      then read back, at that pixel and channel, as the LED light that would
      have made it, interpolated between the two levels either side (and
      carried on the end segment's slope past either end). The light of an
      LED level is its colour decoded: the setting is a CSS colour, sRGB
      encoded, as every colour the owner picks is. Doing it per pixel takes
      the lamp's fall-off and the plate's ground out of the response too;
      what is read back is light in the LED's units, which a sum and a ratio
      can be taken of. The control in section 7 checks the inversion on a
      level that is not one of the ramp's.
    */
    const dec = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    // The plate is lit from below by the LED platform (bare has it off, so its ledColor alone lights nothing); dark is the same platform at black.
    const lit = { ...bare, ledPlatform: true, ledMode: 'single', ledColor: '#c8c8c8', soapFilmAngle: 0 };
    const dark = { ...bare, ledPlatform: true, ledMode: 'single', ledColor: '#000000', soapFilmAngle: 0 };
    const grey = (g) => `#${g.toString(16).padStart(2, '0').repeat(3)}`;
    const LEVELS = []; for (let g = 0; g <= 252; g += 12) LEVELS.push(g); LEVELS.push(255);
    const LIGHT = LEVELS.map(dec);
    const ramp = [];
    for (const g of LEVELS) ramp.push(await lab.render(R, { ...lit, soapFilm: 0, ledColor: grey(g) }, cam));
    const last = LEVELS.length - 1;
    let flat = 0;
    // A pixel's value read back as the LED light that would have made it there, channel by channel.
    const toLight = (px) => {
      const out = new Float32Array(R * R * 3);
      for (let p = 0; p < R * R; p++) for (let c = 0; c < 3; c++) {
        const k = p * 4 + c, v = px[k];
        let j = 0;
        while (j < last - 1 && ramp[j + 1][k] < v) j++;
        // A flat end segment (a channel clipped at 255, or two dark levels one value apart) has no slope to read: step in to one that has.
        while (j > 0 && ramp[j + 1][k] - ramp[j][k] < 1) j--;
        while (j < last - 1 && ramp[j + 1][k] - ramp[j][k] < 1) j++;
        const a = ramp[j][k], b = ramp[j + 1][k];
        if (b - a < 1) { flat++; out[p * 3 + c] = 0.5 * (LIGHT[j] + LIGHT[j + 1]); continue; }
        out[p * 3 + c] = LIGHT[j] + ((v - a) / (b - a)) * (LIGHT[j + 1] - LIGHT[j]);
      }
      return out;
    };
    // Luminance of that light summed over each film column (two pixels a cell), rows clear of the border.
    const colY = (px) => {
      const L = toLight(px), s = new Array(N).fill(0);
      for (let y = 8; y < R - 8; y++) for (let x = 0; x < R; x++) {
        const k = (y * R + x) * 3;
        s[x >> 1] += 0.2126 * L[k] + 0.7152 * L[k + 1] + 0.0722 * L[k + 2];
      }
      return s;
    };
    // The same sum of the pixels only decoded, as the harness read them before the inversion: the control prints it beside the inverted reading.
    const colDec = (px) => {
      const s = new Array(N).fill(0);
      for (let y = 8; y < R - 8; y++) for (let x = 0; x < R; x++) {
        const k = (y * R + x) * 4;
        s[x >> 1] += 0.2126 * dec(px[k]) + 0.7152 * dec(px[k + 1]) + 0.0722 * dec(px[k + 2]);
      }
      return s;
    };
    /*
      The control: a neutral filter of a half, made as the plate under half
      the lit plate's light (#929292, whose decoded light is 0.497 of
      #c8c8c8's; neither is a level of the ramp, so it is the interpolation
      and the per-pixel response being tested, not a lookup of a node). Its
      read-back light over the lit plate's, each less the dark plate's, must
      be that 0.497.
    */
    {
      const half = await lab.render(R, { ...lit, soapFilm: 0, ledColor: '#929292' }, cam);
      const full = await lab.render(R, { ...lit, soapFilm: 0 }, cam), none = await lab.render(R, { ...dark, soapFilm: 0 }, cam);
      o.ctrl = { half: colY(half), full: colY(full), none: colY(none), halfDec: colDec(half), fullDec: colDec(full), noneDec: colDec(none), want: dec(0x92) / dec(0xc8) };
    }
    const through = async () => ({
      onLit: colY(await lab.render(R, lit, cam)), onDark: colY(await lab.render(R, dark, cam)),
      offLit: colY(await lab.render(R, { ...lit, soapFilm: 0 }, cam)), offDark: colY(await lab.render(R, { ...dark, soapFilm: 0 }, cam)),
    });
    const wedge = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) wedge[j * N + i] = (1500 * i) / (N - 1);
    film().film.write(wedge);
    o.wedge = await through();
    film().film.write(new Float32Array(N * N).fill(8));
    o.black = await through();
    o.flat = flat;

    // 8: big motions run, small ones crawl. The same 20 nm of unevenness,
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

    // 9: the film's own plumes stir the air. No dye and nothing stirred, so
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

// ── 7. What the film lets through (PLAN 32d-6) ───────────────────────
{
  /*
    The law, from first principles and the film's index (SOAP.n1, the
    solution's 1.33, in air on both faces), not from the shader or the
    table. A plane wave at normal incidence on a film of index n and
    thickness d: each face reflects an amplitude r = (n − 1)/(n + 1), with
    opposite signs at the two faces, and the waves bouncing between them sum
    (Airy) to R(λ, d) = 2r²(1 − cos δ) / (1 + r⁴ − 2r² cos δ), δ = 4π n d / λ.
    Nothing is absorbed (water is clear over a micron), so T = 1 − R. R is
    largest where cos δ = −1, 4r² / (1 + r²)², which for n 1.33 is 7.7%.
    What the eye sees of a white plate through the film is that averaged over
    the visible, weighed by the eye's luminance response ȳ(λ) (CIE 1931, the
    published multi-lobe fit of Wyman, Sloan and Shirley, 2013) under light
    of an even spectrum, 380 to 780 nm by the nanometre. The average is a
    little under the peak, since the bands do not line up across the
    spectrum: so 92% everywhere on a 0 to 1.5 µm wedge, and 99% through a
    black film, are floors the law clears, which the first line here says
    with numbers.
  */
  const n = SOAP.n1, r = (n - 1) / (n + 1), r2 = r * r;
  const airy = (dNm, lNm) => { const c = Math.cos((4 * Math.PI * n * dNm) / lNm); return (2 * r2 * (1 - c)) / (1 + r2 * r2 - 2 * r2 * c); };
  const lobe = (l, mu, s1, s2) => { const t = (l - mu) / (l < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
  const ybar = (l) => 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
  let yw = 0; for (let l = 380; l <= 780; l++) yw += ybar(l);
  const rBar = (dNm) => { let s = 0; for (let l = 380; l <= 780; l++) s += airy(dNm, l) * ybar(l); return s / yw; };
  const thick = (i) => (1500 * i) / (N - 1);
  // Columns clear of the frame's border, where the spline reads the clamped edge rather than the ramp.
  const cols = []; for (let i = 4; i < N - 4; i++) cols.push(i);
  const lawR = cols.map((i) => rBar(thick(i)));
  const peak = 4 * r2 / (1 + r2) ** 2, lawMax = Math.max(...lawR), lawBlack = rBar(8);
  check('the law: Airy\'s R of a water film in air, averaged over the visible, is under 8% at every thickness to 1.5 µm and under 1% at 8 nm',
    lawMax < 0.08 && lawBlack < 0.01 && peak < 0.08, `n ${n}, peak ${(100 * peak).toFixed(2)}%, wedge's most ${(100 * lawMax).toFixed(2)}%, 8 nm ${(100 * lawBlack).toFixed(3)}%`);

  const tOf = (m, i) => (m.onLit[i] - m.onDark[i]) / (m.offLit[i] - m.offDark[i]);
  const w = res.wedge, b = res.black;
  // The instrument: the lit plate must be lit, or every ratio below is noise over noise. The dark plate need not be black (decoded only, about 12% of the lit one's light was the plate's own ground and glow; read back as light it is the ramp's level 0, so none), and lit − dark takes it out, so the bar asks only that most of it be the lamp.
  const ground = cols.reduce((s, i) => s + (w.offLit[i] - w.offDark[i]), 0) / cols.reduce((s, i) => s + w.offLit[i], 0);
  const groundY = cols.reduce((s, i) => s + w.offLit[i], 0) / (cols.length * 2 * (R - 16));
  check('control: the lit plate behind the film is lit (its own light over 0.2, and over 80% of what is seen with the film off)',
    groundY > 0.2 && ground > 0.8, `luminance ${groundY.toFixed(3)}, ${(100 * ground).toFixed(1)}% of it the plate's own`);
  // The inversion (in the page, above): a half neutral filter must read as one.
  {
    const c = res.ctrl, sumOf = (a) => cols.reduce((s, i) => s + a[i], 0);
    const got = (sumOf(c.half) - sumOf(c.none)) / (sumOf(c.full) - sumOf(c.none));
    const raw = (sumOf(c.halfDec) - sumOf(c.noneDec)) / (sumOf(c.fullDec) - sumOf(c.noneDec));
    check('control: read back through the plate\'s measured response, the plate under half its light (#929292 for #c8c8c8) reads that half to within 1%, so the ratios below are of light',
      Math.abs(got / c.want - 1) < 0.01, `${got.toFixed(4)} against ${c.want.toFixed(4)} (${(100 * (got / c.want - 1)).toFixed(2)}%); the pixels only decoded read ${raw.toFixed(4)} (${(100 * (raw / c.want - 1)).toFixed(1)}%); ${res.flat} pixel channels on a flat segment`);
  }

  /*
    The wedge. T in every column at least 0.92, and the share the film takes,
    1 − T, following Airy's R along the wedge: correlated over 0.8 across the
    columns, and on average between 0.6 and 1.4 of it. Why both. The floor
    alone is passed by a film that takes nothing (drawn additively over the
    plate, or not at all), which is not a soap film either; the shape alone
    is passed by main's film at any gain. A look that only imitates the
    colours, a tint laid on by height or a dimmer gain picked to clear 92%,
    has neither Airy's first-order peak near 100 nm nor its black at the
    thin end in the right proportion to the rest. The 8-bit picture reads T
    to about half a percent; Airy's own floor on this wedge is the law
    line's (about 92.7%), so a film drawn to the law clears 0.92.
  */
  const T = cols.map((i) => tOf(w, i));
  const take = T.map((t) => 1 - t);
  const minT = Math.min(...T), meanT = T.reduce((s, t) => s + t, 0) / T.length;
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const ma = mean(take), ml = mean(lawR);
  let sab = 0, saa = 0, sbb = 0;
  for (let k = 0; k < cols.length; k++) { const x = take[k] - ma, y = lawR[k] - ml; sab += x * y; saa += x * x; sbb += y * y; }
  const rho = sab / Math.sqrt(Math.max(1e-30, saa * sbb)), ratio = ma / ml;
  const worst = cols[T.indexOf(minT)];
  /*
    Main's numbers, measured on main with this harness and read back as
    light (2026-11-21: least 82.8% at 591 nm, mean 107.6%, black 106.11%;
    decoded only, before the inversion, they read 75.5%, 93.9% and 102.3%):
    MAIN_T holds them, the wedge's least and mean transmission and the black
    film's. Main is excused while the plate draws them to within 0.005, the
    8-bit picture's reading error; any build of 32d-6 moves the composite
    and so these.
  */
  const MAIN_T = { wedgeMin: 0.828, wedgeMean: 1.076, black: 1.061 };
  const nearMain = (v, m) => Math.abs(v - m) < 0.005;
  line('wedge', 'a 0 to 1.5 µm film lets at least 92% of the plate through everywhere, in linear light, and what it takes follows Airy\'s R (correlation over 0.8, mean 0.6 to 1.4 of it)',
    minT >= 0.92 && rho > 0.8 && ratio > 0.6 && ratio < 1.4,
    `least ${(100 * minT).toFixed(1)}% at ${thick(worst).toFixed(0)} nm (Airy's there ${(100 * (1 - rBar(thick(worst)))).toFixed(1)}%), mean ${(100 * meanT).toFixed(1)}%; correlation with Airy ${rho.toFixed(3)}, ${ratio.toFixed(2)} of Airy's share`,
    nearMain(minT, MAIN_T.wedgeMin) && nearMain(meanT, MAIN_T.wedgeMean));

  // The black film: 8 nm, under the 10 nm or so of a Newton black film; Airy's R there is about a tenth of a percent.
  let num = 0, den = 0;
  for (const i of cols) { num += b.onLit[i] - b.onDark[i]; den += b.offLit[i] - b.offDark[i]; }
  const tBlack = num / den;
  /*
    Both ways: a lossless film can let through no more light than reaches it,
    so T over 1 is a film that adds light, which is what main draws (its
    colour laid over the plate even at 8 nm, 106% measured as light). The ceiling's
    half a percent is the 8-bit picture's reading error.

    And only with a film there. A plate that draws no film at all lets all
    of the light through at 8 nm and passes the black line alone, so black
    is held with the wedge showing that a film is drawn: what the wedge
    takes, 1 − T on average, over 2%. Airy's average share on this wedge is
    about 4% (ml below, printed), and the 8-bit reading is good to about
    half a percent, so 2% is half the law's and four times the reading's.
  */
  const drawn = ma > 0.02;
  line('black', 'a black film (8 nm) lets more than 99% of the plate through and no more than all of it (100.5%), in linear light, with a film drawn (the wedge takes over 2% on average)',
    tBlack > 0.99 && tBlack < 1.005 && drawn,
    `${(100 * tBlack).toFixed(2)}% (Airy's ${(100 * (1 - lawBlack)).toFixed(2)}%); the wedge takes ${(100 * ma).toFixed(2)}% on average (Airy's ${(100 * ml).toFixed(2)}%)`, nearMain(tBlack, MAIN_T.black));
}

// ── 8. Big motions run, small ones crawl ─────────────────────────────
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

// ── 9. The film stirs its own air ────────────────────────────────────
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
