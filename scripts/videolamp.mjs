#!/usr/bin/env node
/**
 * The video as the lamp under the dish (PLAN 14ag-3).
 *
 *   npm run videolamp      (the lab: any adapter that computes, so a cloud session too)
 *
 * What the owner chose (2026-11-14), of four ways put for a video and the
 * liquid to meet: the video as the lamp under the dish, as a show sets its
 * dish on a light panel or a tablet. Its light comes up through the liquid,
 * the liquid's surface bends where each point of it is seen from, and the dye
 * takes its share out of it, colour by colour. Built in wgsl/plateLamp.ts
 * (the film as a row of the lamp, and the bend) and lib/mixer.ts (the film can
 * go under the front plate), with the lamp ground brought up by Film Mix in
 * gpu/plateUniforms.ts.
 *
 * This asks the real plate shader, on a lab plate laid the same way every
 * time, each thing the feature says, and each against a control that would
 * pass it by accident if the feature were not there:
 *
 *   1. the dye filters the video's light: with one flat colour playing under
 *      the glass, every pixel is the same plate on the white lamp times that
 *      colour, channel by channel (Beer–Lambert takes the same share of any
 *      light, so the product is the law, not a look). Control: the same film
 *      over the glass is not that product (it is laid over the dye, not seen
 *      through it), so the product is not something every film placement
 *      gives.
 *   2. the video is the lamp where there is no dye: bare glass shows the
 *      film's colour itself, on a look whose own ground is black.
 *   3. Film Mix 0 leaves the look as it was, to the byte, with the film still
 *      in the lamp: the lamp ground follows the film in, and nothing is left
 *      on when it is faded out.
 *   4. zoomed out, the frame stops at its edge and the lamp passes bare past
 *      it: the corners are the white lamp, the middle the film.
 *   5. the liquid refracts it: a pool of glycerine poured into the water (a
 *      real index step, 1.4746 against 1.333, at the same depth) moves a
 *      striped picture under its rim and leaves it where it was in its flat
 *      middle and on clear water away from it. Control: the same pool over a
 *      flat-coloured film changes the rim far less, so what moved is the
 *      picture, not light lost at the rim (the shadowgraph darkens a rim
 *      under any lamp).
 *   6. the stack's rule: the film may go under the front plate, the switch on
 *      the video's row puts it at the top of the lamp and back where the
 *      default has it, and an order saved without the film still puts it
 *      over the glass.
 */
import { openLab } from './lab.mjs';
import { mixStack, filmInLamp, filmAsLamp } from '../src/lib/mixer.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const f2 = (v) => v.toFixed(2);

// ── 6. The stack's rule, without a GPU ──────────────────────────────
{
  const HOME = 'led gel lumia front back film mark';
  const LAMP = 'led gel lumia film front back mark';
  check('the film can stand under the front plate, and is read there',
    mixStack(LAMP).join(' ') === LAMP && filmInLamp(LAMP) && !filmInLamp(HOME), mixStack(LAMP).join(' '));
  check('the switch puts it at the top of the lamp, and back over the back plate',
    filmAsLamp(HOME, true) === LAMP && filmAsLamp(LAMP, false) === HOME
    && filmAsLamp(LAMP, true) === LAMP && filmAsLamp(HOME, false) === HOME,
    `${filmAsLamp(HOME, true)} · ${filmAsLamp(LAMP, false)}`);
  check('out of the lamp, it goes just over the back plate wherever the operator has put that',
    filmAsLamp('led gel lumia film front mark back', false) === 'led gel lumia front mark back film',
    filmAsLamp('led gel lumia film front mark back', false));
  check('an order saved without the film, or without the front plate, keeps the film over the glass',
    mixStack('led front back mark').join(' ') === 'led gel lumia front back film mark'
    && !filmInLamp('film led back mark') && !filmInLamp('led gel lumia front back mark'),
    `${mixStack('led front back mark').join(' ')} · ${mixStack('film led back mark').join(' ')}`);
}

// ── The plate ───────────────────────────────────────────────────────
const { page, close } = await openLab();
const shots = await page.evaluate(async () => {
  await lab.create(192);
  let s = 515151;
  const r = () => (s = s * 16807 % 2147483647) / 2147483647;
  // Dye over the left half only, so the right half is clear water to compare against.
  for (let i = 0; i < 10; i++) lab.dye(0.08 + 0.34 * r(), 0.15 + 0.7 * r(), 0.06 + 0.08 * r(), [0.3 + 1.2 * r(), 0.3 + 1.2 * r(), 0.3 + 1.2 * r()], 1.4);
  lab.flush(); await lab.step(6);
  const mk = (paint) => { const c = new OffscreenCanvas(128, 128); paint(c.getContext('2d')); return c; };
  const FLAT = [230, 140, 60];
  const flat = mk((g) => { g.fillStyle = `rgb(${FLAT.join(',')})`; g.fillRect(0, 0, 128, 128); });
  // Stripes four texels wide, dark and light, so a shift of a pixel or two shows.
  const stripes = mk((g) => { for (let x = 0; x < 128; x += 4) { g.fillStyle = (x / 4) % 2 ? 'rgb(240,230,210)' : 'rgb(40,50,70)'; g.fillRect(x, 0, 4, 128); } });
  const S = 128;
  // The lamp's own pools, the glass's droplets and the vignette off: they are
  // the glass's, and would blur the products these read.
  const base = { layerCount: 1, markMix: 0, saturationBoost: 1, beads: 0, lampHotspot: 0, secondLamp: 0, microDroplets: 0, lampWarmth: 0, dishVignette: 0, filmMix: 1, filmBlend: 'own' };
  const LAMP = 'led gel lumia film front back mark';
  const shot = async (set, film) => lab.render(S, { ...base, ...set }, film ? { film, time: 1 } : { time: 1 });
  const out = {
    S, FLAT,
    white: await shot({ lampGround: 1 }),
    flatLamp: await shot({ lampGround: 0, mixOrder: LAMP }, flat),
    flatOver: await shot({ lampGround: 1 }, flat),
    plain: await shot({ lampGround: 0 }),
    lampMix0: await shot({ lampGround: 0, mixOrder: LAMP, filmMix: 0 }, flat),
    zoomedOut: await shot({ lampGround: 0, mixOrder: LAMP, filmZoom: 0.5 }, flat),
    stripesBefore: await shot({ lampGround: 0, mixOrder: LAMP }, stripes),
    flatBefore: null,
  };
  out.flatBefore = out.flatLamp;
  // A pool of glycerine on the clear right half, as though poured long ago:
  // its index in the column at the water's depth (PLAN 18d-9).
  lab.addSpecies(0.72, 0.5, 0.12, 50, 'glycerine', false);
  out.stripesPool = await shot({ lampGround: 0, mixOrder: LAMP }, stripes);
  out.flatPool = await shot({ lampGround: 0, mixOrder: LAMP }, flat);
  return out;
});
await close();

const { S, FLAT } = shots;
const at = (img, x, y, c) => img[(y * S + x) * 4 + c];
// The lab's picture has y down; the dye is on x < 0.45 of the plate.
const dyed = (x, y) => {
  const d = [0, 1, 2].reduce((m, c) => Math.max(m, at(shots.white, x, y, c)), 0);
  return x / S < 0.45 && d < 200;
};
const clearW = (x, y) => x / S > 0.5 && Math.hypot(x / S - 0.72, y / S - 0.5) > 0.2;

// 1. The product, and its control.
{
  const errs = [], overErrs = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!dyed(x, y)) continue;
    for (let c = 0; c < 3; c++) {
      const want = at(shots.white, x, y, c) * FLAT[c] / 255;
      errs.push(Math.abs(at(shots.flatLamp, x, y, c) - want));
      overErrs.push(Math.abs(at(shots.flatOver, x, y, c) - want));
    }
  }
  const mean = (a) => a.reduce((m, v) => m + v, 0) / Math.max(1, a.length);
  const p95 = (a) => [...a].sort((p, q) => p - q)[Math.floor(a.length * 0.95)] ?? 0;
  check('under the glass, the dye filters the video\'s light: the plate on the white lamp times the film\'s colour',
    errs.length > 300 && mean(errs) < 3 && p95(errs) < 8,
    `${errs.length / 3} dyed pixels, off by ${f2(mean(errs))} on average, ${p95(errs)} at the 95th`);
  check('and the same film over the glass is not that product (the control)',
    mean(overErrs) > 4 * Math.max(1, mean(errs)), `off by ${f2(mean(overErrs))} on average`);
}

// 2. Bare glass is the film's colour.
{
  let n = 0, worst = 0, darkPlain = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!clearW(x, y)) continue;
    n++;
    for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(at(shots.flatLamp, x, y, c) - FLAT[c]));
    darkPlain = Math.max(darkPlain, at(shots.plain, x, y, 0), at(shots.plain, x, y, 1), at(shots.plain, x, y, 2));
  }
  check('on clear water the video is the lamp, on a look whose own ground is black',
    n > 500 && worst <= 6 && darkPlain < 40, `${n} pixels, the film's colour within ${worst}; the look alone at most ${darkPlain}`);
}

// 3. Film Mix 0 is the look alone.
{
  let differ = 0;
  for (let k = 0; k < shots.plain.length; k++) if (shots.plain[k] !== shots.lampMix0[k]) differ++;
  check('Film Mix 0 with the film in the lamp is the look as it was, to the byte', differ === 0, `${differ} bytes differ`);
}

// 4. The zoomed-out frame.
{
  const cornerOk = [[3, 3], [S - 4, 3], [S - 4, S - 4]].every(([x, y]) =>
    [0, 1, 2].every(c => Math.abs(at(shots.zoomedOut, x, y, c) - at(shots.white, x, y, c)) <= 3));
  const mid = [S * 0.72 | 0, S / 2 | 0];
  const midOk = [0, 1, 2].every(c => Math.abs(at(shots.zoomedOut, mid[0], mid[1], c) - FLAT[c]) <= 6);
  check('zoomed out, the lamp passes bare past the frame\'s edge and is the film inside it', cornerOk && midOk,
    `corner ${[0, 1, 2].map(c => at(shots.zoomedOut, S - 4, 3, c)).join(',')} against the white lamp's ${[0, 1, 2].map(c => at(shots.white, S - 4, 3, c)).join(',')}; middle ${[0, 1, 2].map(c => at(shots.zoomedOut, mid[0], mid[1], c)).join(',')}`);
}

// 5. Refraction at the pool's rim.
{
  const ring = { rim: [], middle: [], far: [], flatRim: [] };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot((x + 0.5) / S - 0.72, (y + 0.5) / S - 0.5);
    const dif = (a, b) => [0, 1, 2].reduce((m, c) => m + Math.abs(at(a, x, y, c) - at(b, x, y, c)), 0) / 3;
    const v = dif(shots.stripesPool, shots.stripesBefore);
    if (d >= 0.1 && d <= 0.14) { ring.rim.push(v); ring.flatRim.push(dif(shots.flatPool, shots.flatBefore)); }
    else if (d < 0.06) ring.middle.push(v);
    else if (x / S > 0.5 && d > 0.22) ring.far.push(v);
  }
  const mean = (a) => a.reduce((m, v) => m + v, 0) / Math.max(1, a.length);
  const rim = mean(ring.rim), middle = mean(ring.middle), far = mean(ring.far), flatRim = mean(ring.flatRim);
  check('a glycerine pool bends the picture under its rim, and not in its flat middle or on clear water',
    rim > 6 && rim > 4 * Math.max(0.5, middle) && rim > 4 * Math.max(0.5, far),
    `mean change ${f2(rim)} on the rim, ${f2(middle)} in the middle, ${f2(far)} away`);
  check('and over a flat film the same rim changes far less, so what moved is the picture (the control)',
    rim > 3 * Math.max(0.5, flatRim), `${f2(flatRim)} on the rim over a flat film`);
}

const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
