#!/usr/bin/env node
/**
 * The mixer: an order for the stack, and a grade on each source.
 *
 *   npm run mixer      (the lab: any adapter that computes, so a cloud session too)
 *
 * What was asked (docs/rig-plan.md, R7): "a video mixer control … that can
 * move the order of layers (LED spinning, video, picture, any other image
 * input) and control brightness, contrast and the other photo and video
 * standards on each." `lib/mixer.ts` says how the four that move are placed
 * and why the front plate does not.
 *
 * This asks the real plate shader, on a plate laid down the same way every
 * time, whether each control does the one thing it says:
 *
 *   1. the order: moving the film under the back plate changes the picture
 *      where the back plate has dye, and nowhere else; moving the logo under
 *      the film changes it inside the logo and nowhere else; the LED ring
 *      raised off the bottom stops lighting the glass and lays its light over
 *      the plate instead
 *   2. the levels: a front plate at 0 leaves the bare lamp, a back plate at 0
 *      is a one-plate picture exactly, an LED lamp at 0 is no LED at all
 *   3. the grades: brightness scales the source's light, contrast spreads it,
 *      saturation 0 is grey, a hue turn moves the colours round by about that
 *      much, and a film at brightness 0 is no film at all
 *   4. every control reaches the picture, and only its own source's part of
 *      it: each one moved off its rest changes what is drawn (none is a dead
 *      slider), the back plate's leave everything off the back plate alone,
 *      the LED ring's reach glass the back plate does not cover, the logo's
 *      stay inside the logo (so two sources' grades cannot be cross-wired)
 *   5. the stack's own rules, without a GPU: a saved order that is garbage or
 *      short comes back as the four, nothing goes under the front plate but
 *      the LED ring, and a pad that raises a source walks it through every
 *      place it can go and back to where it began
 *
 * Each rule was held to a broken shader when it was written (a beam that
 * draws nothing, a logo that vanishes when lowered, the ring left lighting
 * the glass as a beam, the LED and back-plate grades swapped, saturation or
 * contrast made a plain gain, a front plate that fades to black instead of
 * to the lamp): an earlier version of this check passed all of those, since
 * "a different picture" is also what a missing source gives, and each
 * assertion below that asks for the source to be *there* is the answer.
 *
 * What it does not say: that the default order is today's picture. That was
 * measured once, when the mixer went in, by rendering four scenes (plain; the
 * LED ring; LED, film, logo and two plates; photo mode) on main and on the
 * change and comparing the bytes, which were identical. A check here could
 * only compare the shader against itself.
 */
import { openLab } from './lab.mjs';
import {
  parseMixOrder, moveInMix, raiseInMix, mixStack, mixPositions, MIX_CONTROLS, MIX_MOVERS,
} from '../src/lib/mixer.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── 5. The stack's rules ────────────────────────────────────────────
{
  const four = (o) => [...o].sort().join() === [...MIX_MOVERS].sort().join();
  const odd = ['', 'nonsense', 'film film film', 'mark, film > led', 42, null, 'back front led film mark', 'led back film mark'];
  check('a saved order that is garbage, short or repeated comes back as the four',
    odd.every(o => four(parseMixOrder(o)) && parseMixOrder(o).length === 4),
    odd.map(o => `${JSON.stringify(o)} → ${parseMixOrder(o).join(' ')}`).join(' · '));
  check('and one it knows keeps its order', parseMixOrder('mark, film > led').join(' ') === 'mark back film led',
    parseMixOrder('mark, film > led').join(' '));
  check('the front plate sits over the LED ring while the ring is the lamp, and at the bottom otherwise',
    mixStack('led front back film mark').join(' ') === 'led front back film mark'
    && mixStack('front led back film mark').join(' ') === 'front led back film mark'
    && mixStack('back front led film mark').join(' ') === 'front back led film mark');
  check('the film steps under the back plate', moveInMix('led front back film mark', 'film', -1) === 'led front film back mark');
  const stuck = MIX_MOVERS.filter(m => m !== 'led').map(m => {
    // Walk it all the way down: it must stop just above the front plate.
    let o = 'led front back film mark';
    for (let k = 0; k < 6; k++) o = moveInMix(o, m, -1);
    const st = mixStack(o);
    return st.indexOf(m) === st.indexOf('front') + 1 ? null : `${m}: ${st.join(' ')}`;
  }).filter(Boolean);
  check('nothing but the LED ring goes under the front plate', stuck.length === 0, stuck.join(' · '));
  const ledUp = moveInMix('led front back film mark', 'led', 1);
  check('the LED ring passes the front plate: the lamp becomes a beam', mixStack(ledUp).join(' ') === 'front led back film mark',
    mixStack(ledUp).join(' '));
  check('and nothing moves off the top or the bottom',
    moveInMix('led front back film mark', 'mark', 1) === 'led front back film mark'
    && moveInMix('led front back film mark', 'led', -1) === 'led front back film mark');
  // Pressed until the order comes back round: every row it can reach, then home.
  // With the LED ring as the lamp the others have the three rows above the front
  // plate; the ring has all five, the lamp and four as a beam.
  const walks = MIX_MOVERS.map(m => {
    const home = 'led front back film mark';
    let o = home, presses = 0;
    const rows = new Set();
    do { o = raiseInMix(o, m); rows.add(mixStack(o).indexOf(m)); presses++; } while (o !== home && presses < 12);
    const want = m === 'led' ? 5 : 3;
    return { m, ok: o === home && rows.size === want && presses === want, rows: [...rows].sort().join(''), presses };
  });
  check('a pad walks a source through every place it can go and back home',
    walks.every(w => w.ok), walks.map(w => `${w.m}: rows ${w.rows} in ${w.presses}`).join(' · '));
  const pos = mixPositions('film mark led back');
  check('and the shader is told each source\'s place among the four',
    pos.film === 1 && pos.mark === 2 && pos.led === 3 && pos.back === 4, JSON.stringify(pos));
}

// ── The plate ────────────────────────────────────────────────────────
const { page, close } = await openLab();
const shots = await page.evaluate(async (controls) => {
  await lab.create(192);
  let s = 424242;
  const r = () => (s = s * 16807 % 2147483647) / 2147483647;
  // Dye over the left half only, so the right half is bare glass to compare
  // against; the back plate is the same dye turned half round, so it lies over
  // the right half, and the two plates' dye can be told apart.
  for (let i = 0; i < 10; i++) lab.dye(0.08 + 0.34 * r(), 0.15 + 0.7 * r(), 0.06 + 0.08 * r(), [0.3 + 1.2 * r(), 0.3 + 1.2 * r(), 0.3 + 1.2 * r()], 1.4);
  lab.flush(); await lab.step(6);
  const mk = (w, h, paint) => { const c = new OffscreenCanvas(w, h); paint(c.getContext('2d'), w, h); return c; };
  // A film bright enough to clear the key everywhere, in coloured stripes.
  const film = mk(128, 128, (g, w, h) => { for (let x = 0; x < w; x += 8) { g.fillStyle = `hsl(${x * 3},85%,${55 + (x % 24)}%)`; g.fillRect(x, 0, 8, h); } });
  // A logo: a solid warm card with a transparent margin.
  const mark = mk(100, 40, (g) => { g.fillStyle = 'rgb(250,210,120)'; g.fillRect(10, 5, 80, 30); });
  const S = 128;
  // The lamp's own pools and the glass's droplets off: they belong to the glass,
  // and a source moved under the back plate is under them too (lib/mixer.ts),
  // which is right but would blur what these measure.
  const base = { layerCount: 2, filmMix: 0.9, markMix: 1, markX: 0.5, markY: 0.5, markScale: 0.6, beads: 0, lampHotspot: 0, secondLamp: 0, microDroplets: 0, lampWarmth: 0, dishVignette: 0 };
  const all = { film, mark, backPlate: true, backRotation: Math.PI };
  const shot = (set, cam = all) => lab.render(S, { ...base, ...set }, cam);
  const out = {
    S,
    def: await shot({}),
    noFilm: await shot({ filmMix: 0 }),
    filmUnderBack: await shot({ mixOrder: 'led film back mark' }),
    noBack: await shot({ backLevel: 0 }),
    noMark: await shot({ markMix: 0 }),
    noMarkNoFilm: await shot({ markMix: 0, filmMix: 0 }),
    markUnderFilm: await shot({ mixOrder: 'led back mark film' }),
    onePlate: await shot({ layerCount: 1 }, { film, mark, backRotation: Math.PI }),
    oneBackOff: await shot({ backLevel: 0 }),
    frontOff: await shot({ frontLevel: 0, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    bare: await shot({ layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    filmDark: await shot({ filmBright: 0 }),
    frontHalf: await shot({ frontBright: 0.5, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    frontContrast: await shot({ frontContrast: 1.8, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    frontGrey: await shot({ frontSat: 0, saturationBoost: 1, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    frontFlat: await shot({ saturationBoost: 1, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    frontHue: await shot({ frontHue: 120, layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    markDark: await shot({ markBright: 0 }),
    led: await shot({ ledPlatform: true, ledMode: 'rainbow', layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    ledBeam: await shot({ ledPlatform: true, ledMode: 'rainbow', layerCount: 1, filmMix: 0, markMix: 0, mixOrder: 'back led film mark' }, {}),
    ledLampOff: await shot({ ledPlatform: true, ledMode: 'rainbow', layerCount: 1, filmMix: 0, markMix: 0, ledLevel: 0 }, {}),
    ledBeamOff: await shot({ ledPlatform: true, ledMode: 'rainbow', layerCount: 1, filmMix: 0, markMix: 0, mixOrder: 'back led film mark', ledLevel: 0 }, {}),
    noLed: await shot({ layerCount: 1, filmMix: 0, markMix: 0 }, {}),
    // The front plate at 0 over a lit lamp: must leave the lamp, not black.
    ledFrontOff: await shot({ ledPlatform: true, ledMode: 'rainbow', layerCount: 1, filmMix: 0, markMix: 0, frontLevel: 0 }, {}),
    each: {},
  };
  // Every control, moved off its rest, in a scene where its source is on the wall.
  for (const c of controls) {
    const moved = c.key.endsWith('Hue') ? 90 : c.none === 1 ? 0.4 : c.max;
    out.each[c.key] = await shot({ ledPlatform: true, ledMode: 'rainbow', [c.key]: moved });
  }
  out.eachRest = await shot({ ledPlatform: true, ledMode: 'rainbow' });
  out.eachNoBack = await shot({ ledPlatform: true, ledMode: 'rainbow', backLevel: 0 });
  return out;
}, MIX_CONTROLS.map(c => ({ key: c.key, none: c.none, max: c.max })));
await close();

const { S } = shots;
const px = (img, x, y) => { const k = (y * S + x) * 4; return [img[k], img[k + 1], img[k + 2]]; };
/** Mean absolute difference per channel over the pixels `where` picks, and how many it picked. */
const diff = (a, b, where = () => true) => {
  let sum = 0, n = 0, max = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!where(x, y)) continue;
    const p = px(a, x, y), q = px(b, x, y);
    for (let c = 0; c < 3; c++) { const d = Math.abs(p[c] - q[c]); sum += d; if (d > max) max = d; }
    n++;
  }
  return { mean: n ? sum / (3 * n) : 0, max, n };
};
const f1 = (v) => v.toFixed(1);

// Where the back plate has dye: what taking it away changes.
const backDye = (x, y) => { const p = px(shots.def, x, y), q = px(shots.noBack, x, y); return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 12; };
const noBackDye = (x, y) => { const p = px(shots.def, x, y), q = px(shots.noBack, x, y); return p[0] === q[0] && p[1] === q[1] && p[2] === q[2]; };
// Where the film shows: what taking it away changes, with no logo over it.
const filmOn = (x, y) => { const p = px(shots.noMark, x, y), q = px(shots.noMarkNoFilm, x, y); return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 12; };
// The logo's card, well inside its edges: centre 0.5, half-width 0.3, card 80% of it across and 75% up.
const inCard = (x, y) => Math.abs(x / S - 0.5) < 0.2 && Math.abs(y / S - 0.5) < 0.04;
const inRect = (x, y) => Math.abs(x / S - 0.5) <= 0.31 && Math.abs(y / S - 0.5) <= 0.13;

// ── 1. The order ────────────────────────────────────────────────────
{
  const covered = diff(shots.def, shots.filmUnderBack, (x, y) => backDye(x, y) && filmOn(x, y));
  const bare = diff(shots.def, shots.filmUnderBack, (x, y) => noBackDye(x, y));
  check('the film moved under the back plate changes the picture where the back plate has dye',
    covered.n > 200 && covered.mean > 4, `${f1(covered.mean)} a channel over ${covered.n} px`);
  check('and not where it has none', bare.n > 1000 && bare.max <= 1, `worst ${bare.max} over ${bare.n} px`);
  const card = diff(shots.def, shots.markUnderFilm, (x, y) => inCard(x, y) && filmOn(x, y));
  const out = diff(shots.def, shots.markUnderFilm, (x, y) => !inRect(x, y));
  check('the logo moved under the film changes the picture inside the logo',
    card.n > 50 && card.mean > 6, `${f1(card.mean)} a channel over ${card.n} px`);
  check('and nowhere outside it', out.max === 0, `worst ${out.max} over ${out.n} px`);
  // And it is still there: a logo that vanished when lowered would change the
  // card as much as one that went under the film.
  const still = diff(shots.markUnderFilm, shots.noMark, inCard);
  check('the logo under the film is still drawn', still.mean > 20, `${f1(still.mean)} a channel over what no logo gives`);
  const onTop = diff(shots.def, shots.noMark, inCard);
  check('the logo on top covers what is under it', onTop.mean > 20, `${f1(onTop.mean)} a channel`);
  const bareGlass = (x) => x > S * 0.6;
  const lit = diff(shots.led, shots.noLed, bareGlass);
  const beam = diff(shots.ledBeam, shots.led);
  check('the LED ring raised off the bottom is a different picture from the lamp',
    lit.mean > 4 && beam.mean > 4, `the lamp changes bare glass by ${f1(lit.mean)}, raising it changes the frame by ${f1(beam.mean)}`);
  // "Different" is also what a beam that draws nothing gives: it must add light.
  const adds = diff(shots.ledBeam, shots.noLed);
  check('the beam lays the ring\'s light over the plate', adds.mean > 50, `${f1(adds.mean)} a channel over no LED`);
  // And it stops being the lamp: through clear glass, a beam over the dark lamp
  // is the same light as the lamp itself, so a ring left lighting the glass as
  // well would show there doubled.
  const once = diff(shots.ledBeam, shots.led, bareGlass);
  check('and stops lighting the glass from beneath', once.max <= 1, `worst ${once.max} on bare glass`);
}

// ── 2. The levels ───────────────────────────────────────────────────
{
  const one = diff(shots.oneBackOff, shots.onePlate);
  check('a back plate at level 0 is a one-plate picture, exactly', one.max === 0, `worst ${one.max}`);
  const lamp = diff(shots.ledLampOff, shots.noLed);
  check('an LED lamp at level 0 is no LED, exactly', lamp.max === 0, `worst ${lamp.max}`);
  const beam = diff(shots.ledBeamOff, shots.noLed);
  check('and an LED beam at level 0 is no LED either', beam.max <= 1, `worst ${beam.max}`);
  const dye = (x, y) => x < S * 0.45;
  const off = diff(shots.frontOff, shots.bare, dye);
  const plain = diff(shots.bare, shots.frontOff, (x) => x > S * 0.6);
  // The lab's lamp is black: a front plate at 0 is the glass with nothing lit on it.
  const blank = shots.frontOff.filter((v, i) => i % 4 !== 3 && v > 3).length;
  check('a front plate at level 0 leaves the bare lamp', off.mean > 3 && blank === 0 && plain.max === 0,
    `the plate took ${f1(off.mean)} a channel with it; ${blank} channels still lit`);
  // The lab's lamp is black, so "the lamp" and "black" are one picture above;
  // over the LED ring as the lamp they are not.
  const lampLeft = diff(shots.ledFrontOff, shots.led, (x) => x > S * 0.6);
  const lampOn = diff(shots.ledFrontOff, shots.noLed, (x) => x > S * 0.6);
  check('and over a lit lamp, the lamp itself', lampLeft.max <= 1 && lampOn.mean > 20,
    `worst ${lampLeft.max} against the lamp through clear glass, ${f1(lampOn.mean)} over black`);
}

// ── 3. The grades ───────────────────────────────────────────────────
{
  const film0 = diff(shots.filmDark, shots.noFilm);
  check('a film at brightness 0 is no film at all', film0.max === 0, `worst ${film0.max}`);
  const luma = (img, where) => {
    let sum = 0, n = 0, sq = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (!where(x, y)) continue;
      const [r0, g0, b0] = px(img, x, y);
      const l = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
      if (l < 6) continue;
      sum += l; sq += l * l; n++;
    }
    const m = sum / Math.max(1, n);
    return { m, sd: Math.sqrt(Math.max(0, sq / Math.max(1, n) - m * m)), n };
  };
  const dye = (x) => x < S * 0.45;
  const a = luma(shots.bare, dye), h = luma(shots.frontHalf, dye);
  check('brightness 0.5 on the front plate halves its light', h.m / a.m > 0.4 && h.m / a.m < 0.62,
    `${f1(a.m)} → ${f1(h.m)} (${(h.m / a.m).toFixed(2)})`);
  const c = luma(shots.frontContrast, dye);
  // A gain spreads it too; contrast is about mid-grey, so the dark end must go
  // darker while the bright end goes brighter.
  const tenth = (img, q) => {
    const ls = [];
    for (let y = 0; y < S; y++) for (let x = 0; x < S * 0.45; x++) {
      const [r0, g0, b0] = px(img, x, y);
      const l = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
      if (l >= 6) ls.push(l);
    }
    if (ls.length < 200) throw new Error(`only ${ls.length} lit pixels to take a tenth of`);
    ls.sort((p, q2) => p - q2);
    return ls[Math.floor(q * (ls.length - 1))];
  };
  const [lo0, hi0, lo1, hi1] = [tenth(shots.bare, 0.1), tenth(shots.bare, 0.9), tenth(shots.frontContrast, 0.1), tenth(shots.frontContrast, 0.9)];
  check('contrast spreads it about mid-grey', c.sd / a.sd > 1.3 && lo1 < lo0 - 5 && hi1 > hi0 + 5,
    `spread ${f1(a.sd)} → ${f1(c.sd)}; darkest tenth ${f1(lo0)} → ${f1(lo1)}, brightest ${f1(hi0)} → ${f1(hi1)}`);
  const chroma = (img) => {
    let sum = 0, n = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S * 0.45; x++) {
      const [r0, g0, b0] = px(img, x, y);
      if (Math.max(r0, g0, b0) < 12) continue;
      sum += Math.max(r0, g0, b0) - Math.min(r0, g0, b0); n++;
    }
    return { c: sum / Math.max(1, n), n };
  };
  // Grey and still lit: a saturation that went to black would have no
  // coloured pixel left to judge, and read as grey.
  const was = chroma(shots.frontFlat), grey = chroma(shots.frontGrey);
  check('saturation 0 is grey', was.c > 15 && grey.c < 2 && grey.n > 0.9 * was.n,
    `colour ${f1(was.c)} → ${f1(grey.c)} a pixel, over ${grey.n} of ${was.n} lit pixels`);
  // The circular mean of the hue over the dye, weighted by how coloured each pixel is.
  const hueOf = (img) => {
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S * 0.45; x++) {
      const [r0, g0, b0] = px(img, x, y);
      const mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0), d = mx - mn;
      if (d < 10) continue;
      let hh = mx === r0 ? ((g0 - b0) / d) % 6 : mx === g0 ? (b0 - r0) / d + 2 : (r0 - g0) / d + 4;
      hh *= Math.PI / 3;
      sx += Math.cos(hh) * d; sy += Math.sin(hh) * d; n++;
    }
    if (n < 200) throw new Error(`only ${n} coloured pixels to take a hue from`);
    return Math.atan2(sy, sx) * 180 / Math.PI;
  };
  const turned = ((hueOf(shots.frontHue) - hueOf(shots.bare)) % 360 + 540) % 360 - 180;
  check('a hue turn of 120° moves the colours round by about that', Math.abs(turned - 120) < 35, `${f1(turned)}°`);
  const markD = diff(shots.markDark, shots.def, inCard);
  const markLum = luma(shots.markDark, inCard);
  check('a logo at brightness 0 is a black card', markD.mean > 40 && markLum.n < 10, `${markLum.n} px of it still lit`);
}

// ── 4. Every control reaches the picture ────────────────────────────
{
  const dead = MIX_CONTROLS.filter(c => diff(shots.each[c.key], shots.eachRest).mean < 0.05)
    .map(c => `${c.label} (${String(c.key)})`);
  check(`all ${MIX_CONTROLS.length} of the mixer's controls change what is drawn`, dead.length === 0,
    dead.length ? `dead: ${dead.join(', ')}` : '');
  // And each one where its own source is. Off the back plate (the right-hand
  // dye, turned half round, taken away changes nothing there), the back
  // plate's controls must change nothing and the LED ring's, lighting the
  // glass from beneath, must change it; the logo's stay inside the logo.
  // The film covers the frame and the front plate carries the lamp's light,
  // so theirs have no footprint to hold them to.
  const offBack = (x, y) => { const p = px(shots.eachRest, x, y), q = px(shots.eachNoBack, x, y); return p[0] === q[0] && p[1] === q[1] && p[2] === q[2]; };
  const stray = [];
  for (const c of MIX_CONTROLS) {
    const img = shots.each[c.key];
    if (c.source === 'back') { const d = diff(img, shots.eachRest, offBack); if (d.n < 1000 || d.max > 0) stray.push(`${String(c.key)} worst ${d.max} off the back plate`); }
    if (c.source === 'led') { const d = diff(img, shots.eachRest, offBack); if (d.n < 1000 || d.mean < 3) stray.push(`${String(c.key)} only ${f1(d.mean)} off the back plate`); }
    if (c.source === 'mark') { const d = diff(img, shots.eachRest, (x, y) => !inRect(x, y)); if (d.max > 0) stray.push(`${String(c.key)} worst ${d.max} outside the logo`); }
  }
  check('and each of the back plate\'s, the LED ring\'s and the logo\'s only where that source is', stray.length === 0, stray.join(' · '));
}

const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
