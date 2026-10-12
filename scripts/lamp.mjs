#!/usr/bin/env node
/**
 * The lamp shines through the dye (PLAN.md 18b).
 *
 *   npm run lamp      (the lab: any adapter that computes, so a cloud session too)
 *
 * What was found: the solver keeps the dye as absorbance per channel, the
 * physical way, and the picture then painted it as light over a black
 * ground, so clear liquid was black, a gel under the glass did not pass
 * through the dye (blue dye over a red gel showed blue), and the opacity came
 * from a darkness fudge and a cap. The pale lace in the owner's reference
 * still (PLAN §20) is clear liquid under the lamp, which that plate cannot
 * draw: the numpy prototype found no pixel near white on the black ground
 * and a tenth of them on the lamp's. Lamp Ground (`lampGround`) is the
 * projector's way: out = lamp · exp(−absorbance · amount), per look, 0 by
 * default.
 *
 * Asked here, through the real plate shader on lab plates:
 *
 *   1. at 0 the picture is the plate as it was before the lamp, byte for
 *      byte, every look, and the looks that ship on the lamp draw on it: that
 *      is `npm run lampzero`, on the CPU rasteriser, since 2026-10-11. It
 *      compares two compiled programs (today's plate.ts against the same
 *      with the lamp's lines taken out, lampcontrol.mjs), and a GPU's
 *      compiler may round the two differently where their text is the same:
 *      the owner's M4 read one pixel of Fillmore 2 levels off. Its header
 *      has the story. The numbering here stays, so the lines below keep
 *      their names in the run logs.
 *   2. a clear pool on the lamp ground throws at least 90% of the lamp (PLAN
 *      §20a), read in a hole in a ring of dye against the bare lamp at the
 *      same pixels; the same pool on the black ground is the control, and
 *      throws almost none
 *   3. it is Beer and Lambert: a plate of dye twice as dense lets through the
 *      square of what the single one does, channel by channel, for three
 *      dyes; and nothing caps it, so a dense pool's absorbed colour goes dark.
 *      Read against the bare lamp at the same pixels, so the hot-spot's fall
 *      away from the middle divides out; it failed (by 0.07) while the
 *      hot-spot still lifted a white lamp to 1.28 and the middle clipped.
 *      And it is the dye's colour: the logs of what two channels pass are in
 *      the ratio of the absorbances laid down (a swapped filter squares too)
 *   4. a gel under the glass passes through the dye: the pool over the gel is
 *      the gel times what the dye lets through, as read over the white lamp;
 *      on the black ground (the control) it is not, which was the fault
 *   5. two plates are two filters: the lamp through the back plate and the
 *      front is the product of each, pixel by pixel, with the back plate turned
 *      half round so its dye is somewhere the front's is not
 *   6. halfway, the picture is half of each: a fader on it fades from one to
 *      the other, pixel by pixel, rather than lifting the paint with grey
 *   7. the photograph keeps its paper: renderStyle photo draws the same at 0
 *      and at 1
 *
 * Checks 2 to 5 render with the grade and the plate's painted texture
 * (saturation, grain, boundary glow, meniscus, beads) at their neutral
 * values, so what is read is the light through the dye and nothing laid on
 * it (lampzero renders each look with its own settings).
 */
import { openLab } from './lab.mjs';
import { RED, YELLOW, BLUE, TEAL } from './lampcontrol.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};


const S = 192;
const NEUTRAL = { saturationBoost: 1, granulation: 0, boundaryContrast: 0, edgeRelief: 0, beads: 0, lacing: 0, cells: 0, glossiness: 0, microDroplets: 0, thinFilm: 0 };

const now = await openLab();
let shots;
try {
  shots = await now.page.evaluate(async ([S, N, RED, YELLOW, BLUE, TEAL]) => {
    const flat = async (dyes, amount) => {
      const { L } = await lab.create(128);
      const d = new Array(L * L * 4).fill(0);
      for (let k = 0; k < L * L; k++) { d[k * 4] = dyes[0] * amount; d[k * 4 + 1] = dyes[1] * amount; d[k * 4 + 2] = dyes[2] * amount; d[k * 4 + 3] = amount; }
      lab.addDye(d); lab.flush(); await lab.step(1);
    };
    const r = (over, cam = {}) => lab.render(S, { ...N, ...over }, cam);
    const out = {};
    // 2. A clear pool: a hole in a ring of teal.
    const { L } = await lab.create(128);
    lab.dye(0.5, 0.5, 0.36, TEAL, 1.0);
    {
      // A ring: the disc's dye taken back out of its middle, cell by cell.
      const d = new Array(L * L * 4).fill(0);
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const dx = (i + 0.5) / L - 0.5, dy = (j + 0.5) / L - 0.5;
        const f = 1 - (dx * dx + dy * dy) / (0.36 * 0.36);
        if (f <= 0 || dx * dx + dy * dy > 0.13 * 0.13) continue;
        const k = (i + j * L) * 4;
        d[k] = -TEAL[0] * f; d[k + 1] = -TEAL[1] * f; d[k + 2] = -TEAL[2] * f; d[k + 3] = -f;
      }
      lab.addDye(d);
    }
    lab.flush(); await lab.step(1);
    out.poolLamp = await r({ lampGround: 1 });
    out.poolBlack = await r({ lampGround: 0 });
    await lab.create(128); lab.flush(); await lab.step(1);
    out.bare = await r({ lampGround: 1 });
    out.bareGel = await r({ lampGround: 1, gelWheel: 1 });
    // 3. Flat plates of dye, single and double.
    for (const [name, dye] of [['red', RED], ['yellow', YELLOW], ['blue', BLUE]]) {
      await flat(dye, 0.35); out[`${name}1`] = await r({ lampGround: 1 });
      await flat(dye, 0.7); out[`${name}2`] = await r({ lampGround: 1 });
    }
    await flat(BLUE, 1.6); out.dense = await r({ lampGround: 1 });
    // 4 and 5. One pool of blue over a gel, and the same plate twice.
    await lab.create(128); lab.dye(0.5, 0.5, 0.3, BLUE, 0.5); lab.flush(); await lab.step(1);
    out.poolWhite = await r({ lampGround: 1 });
    out.poolHalf = await r({ lampGround: 0.5 });
    out.poolGel = await r({ lampGround: 1, gelWheel: 1 });
    out.poolGelBlack = await r({ lampGround: 0, gelWheel: 1 });
    out.bareGelBlack = await r({ lampGround: 0, gelWheel: 1 });
    out.blackWhite = await r({ lampGround: 0 });
    /*
      Two plates: a pool off the middle, the back plate turned half round, so
      the back plate's dye lies at the mirror of the front's and a filter
      taken from the wrong plate shows (lab-entry.ts: drawn in one place,
      "where the back plate has dye" and "where the front has" are the same
      pixels). Pools at 0.4 and its mirror at 0.6, radius 0.15: they overlap
      across the middle, where the light is through both.
    */
    await lab.create(128); lab.dye(0.4, 0.5, 0.15, BLUE, 0.5); lab.flush(); await lab.step(1);
    out.offOne = await r({ lampGround: 1 });
    out.offTwo = await r({ lampGround: 1, layerCount: 2 }, { backPlate: true, backRotation: Math.PI });
    // 6. The photograph.
    // With both lamps up: the hot-spots are the one lamp-ground line the
    // photograph's branches do not skip on their own.
    out.photo0 = await r({ renderStyle: 'photo', lampGround: 0, lampHotspot: 1, secondLamp: 1 });
    out.photo1 = await r({ renderStyle: 'photo', lampGround: 1, lampHotspot: 1, secondLamp: 1 });
    return out;
  }, [S, NEUTRAL, RED, YELLOW, BLUE, TEAL]);
} finally { await now.close(); }

// ── Reading ───────────────────────────────────────────────────────────
const px = (img, x, y) => { const k = (y * S + x) * 4; return [img[k], img[k + 1], img[k + 2]]; };
/** The pixels within radius r (in plate units, 0–1) of the centre, or between r0 and r. */
const disc = (r, r0 = 0) => {
  const out = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot((x + 0.5) / S - 0.5, (y + 0.5) / S - 0.5);
    if (d <= r && d >= r0) out.push([x, y]);
  }
  return out;
};
const mean = (img, pts) => {
  const m = [0, 0, 0];
  for (const [x, y] of pts) { const p = px(img, x, y); for (let c = 0; c < 3; c++) m[c] += p[c]; }
  return m.map(v => v / pts.length);
};
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const f2 = (v) => v.toFixed(2);
const r0 = (c) => c.map(v => Math.round(v)).join(',');

// ── 2. A clear pool throws the lamp ──────────────────────────────────
{
  const hole = disc(0.08);
  const lamp = lum(mean(shots.bare, hole)), lit = lum(mean(shots.poolLamp, hole)), dark = lum(mean(shots.poolBlack, hole));
  const ring = lum(mean(shots.poolLamp, disc(0.3, 0.2)));
  check('a clear pool on the lamp ground throws at least 90% of the lamp; on the black ground (the control) almost none',
    lamp > 200 && lit / lamp >= 0.9 && dark / lamp < 0.05 && ring < lit * 0.8,
    `the bare lamp ${f2(lamp)}; the pool ${f2(lit / lamp * 100)}% of it on the lamp, ${f2(dark / lamp * 100)}% on black; the dye round it ${f2(ring / lamp * 100)}%`);
}

// ── 3. Beer and Lambert ──────────────────────────────────────────────
{
  const mid = disc(0.25);
  const lamp = mean(shots.bare, mid);
  const rows = ['red', 'yellow', 'blue'].map(n => {
    const t1 = mean(shots[`${n}1`], mid).map((v, c) => v / lamp[c]);
    const t2 = mean(shots[`${n}2`], mid).map((v, c) => v / lamp[c]);
    // Read where the light is well above the bytes' step: ln of 3/255 is noise.
    const errs = t1.map((t, c) => (t > 0.1 && t2[c] > 0.04 ? Math.abs(t2[c] - t * t) : 0));
    const used = t1.filter((t, c) => t > 0.1 && t2[c] > 0.04).length;
    return { n, t1, t2, worst: Math.max(...errs), used, spread: Math.max(...t1) - Math.min(...t1) };
  });
  check('twice the dye lets through the square of what once does, channel by channel (exp of absorbance × amount), for three dyes',
    rows.every(r => r.worst <= 0.02 && r.used >= 2 && r.spread > 0.2),
    rows.map(r => `${r.n}: T ${r.t1.map(f2).join('/')} → ${r.t2.map(f2).join('/')} (want ${r.t1.map(t => f2(t * t)).join('/')}), worst ${f2(r.worst)}`).join(' · '));
  /*
    Which colour comes through, not only how much: T = exp(−a·k) per
    channel, so the logs of what two channels let through are in the ratio
    of the absorbances laid down. Squaring alone would pass a filter with its
    channels swapped. Read where both are between 5% and 92%, clear of the
    bytes' step.
  */
  const ABS = { red: RED, yellow: YELLOW, blue: BLUE };
  const ratios = rows.map(r => {
    const a = ABS[r.n], bad = [];
    let pairs = 0;
    for (let c = 0; c < 3; c++) for (let d = c + 1; d < 3; d++) {
      const [tc, td] = [r.t1[c], r.t1[d]];
      if (tc < 0.05 || tc > 0.92 || td < 0.05 || td > 0.92) continue;
      pairs++;
      const got = Math.log(tc) / Math.log(td), want = a[c] / a[d];
      if (Math.abs(got / want - 1) > 0.15) bad.push(`${'rgb'[c]}/${'rgb'[d]} ${f2(got)} for ${f2(want)}`);
    }
    const least = a.indexOf(Math.min(...a)), brightest = r.t1.indexOf(Math.max(...r.t1));
    return { n: r.n, pairs, bad, ok: brightest === least };
  });
  check('and it is the dye\'s own colour: the channels let through in the ratio of the absorbances laid down, the least absorbed brightest',
    ratios.every(r => r.pairs >= 1 && !r.bad.length && r.ok),
    ratios.map(r => `${r.n}: ${r.pairs} pairs${r.bad.length ? `, off ${r.bad.join(', ')}` : ''}${r.ok ? '' : ', the wrong channel brightest'}`).join(' · '));
  const dense = mean(shots.dense, mid).map((v, c) => v / lamp[c]);
  check('nothing caps it: a dense pool of blue lets through under 3% of the red and green it absorbs, and still some of the blue',
    dense[0] < 0.03 && dense[1] < 0.03 && dense[2] > 0.1, `T ${dense.map(f2).join('/')}`);
}

// ── 4. A gel under the glass, through the dye ───────────────────────
{
  const pool = disc(0.2);
  // Pixel by pixel: the gel's colour changes round the wheel.
  let errLamp = 0, errBlack = 0, n = 0;
  for (const [x, y] of pool) {
    const gel = px(shots.bareGel, x, y), white = px(shots.poolWhite, x, y), bare = px(shots.bare, x, y);
    const want = gel.map((g, c) => g * white[c] / Math.max(1, bare[c]));
    const got = px(shots.poolGel, x, y), black = px(shots.poolGelBlack, x, y);
    for (let c = 0; c < 3; c++) {
      // A gel is 1.5 times its colour over the lamp, and where that passes
      // white the bare gel reads 255 while the light through the dye is
      // still more: read only what the bytes hold.
      if (gel[c] >= 250) continue;
      errLamp += Math.abs(got[c] - want[c]); errBlack += Math.abs(black[c] - want[c]); n++;
    }
  }
  const gelMean = mean(shots.bareGel, pool), poolMean = mean(shots.poolGel, pool), blackMean = mean(shots.poolGelBlack, pool);
  check('a gel under the glass passes through the dye: the pool over the gel is the gel times what the dye lets through; on black (the control) it is not',
    n > pool.length && errLamp / n <= 4 && errBlack / n >= 15 && lum(gelMean) > 40,
    `${n} readings; mean error ${f2(errLamp / n)} on the lamp, ${f2(errBlack / n)} on black; the gel ${r0(gelMean)}, the pool over it ${r0(poolMean)} on the lamp, ${r0(blackMean)} on black`);
}

// ── 5. Two plates, two filters ───────────────────────────────────────
{
  // Pixel by pixel: the back plate turned half round puts its dye at the
  // mirror of each point, so the light is the lamp times what the front
  // lets through here and what the back lets through there.
  const mirror = (x, y) => [S - 1 - x, S - 1 - y];
  let err = 0, n = 0, front = 0, back = 0, both = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const [mx, my] = mirror(x, y);
    const lampHere = px(shots.bare, x, y), lampThere = px(shots.bare, mx, my);
    const tHere = px(shots.offOne, x, y).map((v, c) => v / Math.max(1, lampHere[c]));
    const tThere = px(shots.offOne, mx, my).map((v, c) => v / Math.max(1, lampThere[c]));
    const got = px(shots.offTwo, x, y);
    const tH = lum(tHere), tT = lum(tThere);
    if (tH > 0.9 && tT > 0.9) continue;            // clear glass in both: nothing to read
    if (tH < 0.7 && tT > 0.95) front++; else if (tT < 0.7 && tH > 0.95) back++; else if (tH < 0.7 && tT < 0.7) both++;
    for (let c = 0; c < 3; c++) { err += Math.abs(got[c] - lampHere[c] * tHere[c] * tThere[c]); n++; }
  }
  check('the lamp through the back plate and the front is the product of what each lets through, each where its own dye is',
    n > 0 && err / n <= 2 && front > 50 && back > 50 && both > 50,
    `mean error ${f2(err / Math.max(1, n))} over ${n} readings; ${front} pixels under the front's dye alone, ${back} under the back's, ${both} under both`);
}

// ── 6. Halfway ───────────────────────────────────────────────────────
{
  let err = 0, n = 0;
  for (let k = 0; k < shots.poolHalf.length; k++) {
    if (k % 4 === 3) continue;
    err += Math.abs(shots.poolHalf[k] - (shots.blackWhite[k] + shots.poolWhite[k]) / 2); n++;
  }
  const pool = disc(0.2);
  check('halfway, the picture is half the dye on black and half the lamp through it, pixel by pixel',
    // The two pictures it is between must differ, or half of each is either.
    err / n <= 1 && Math.abs(lum(mean(shots.poolWhite, pool)) - lum(mean(shots.blackWhite, pool))) > 20,
    `mean error ${f2(err / n)} of a byte; the pool ${r0(mean(shots.blackWhite, pool))} on black, ${r0(mean(shots.poolHalf, pool))} halfway, ${r0(mean(shots.poolWhite, pool))} on the lamp`);
}

// ── 7. The photograph ────────────────────────────────────────────────
{
  let worst = 0;
  for (let k = 0; k < shots.photo0.length; k++) if (k % 4 !== 3) worst = Math.max(worst, Math.abs(shots.photo0[k] - shots.photo1[k]));
  const paper = lum(mean(shots.photo0, disc(0.45, 0.35)));
  check('the photograph keeps its paper: Lamp Ground changes nothing in it', worst === 0 && paper > 20, `worst ${worst}, the paper ${f2(paper)}`);
}

const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} lamp checks passed`);
process.exit(failed ? 1 : 0);
