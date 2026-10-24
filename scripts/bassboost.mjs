#!/usr/bin/env node
/**
 * Bass Boost does something: it presses the glass harder, and the kicks still move it (PLAN 27g).
 *
 *   npm run bassboost     (the ear and the hand in node; the plate in the lab: any adapter that computes)
 *
 * What was reported (the owner, 2026-10-22): "I don't feel like it actually
 * does anything." The slider multiplied the ranged bass reading (0 to 85 at
 * the default Sensitivity), and every hand that reads the bass takes it over
 * 70 or 85 and stops. On the band's chorus (`renderBand`, through the ear a
 * render uses) the reading sat over the press's ceiling 0.00 of the time at
 * 1×, 0.57 at 2× and 0.70 at 3×; the glass was held flat and its change a
 * second fell from 3.06 to 1.83 to 0.90 while its deepest press rose 8%. So
 * turning it up made the plate calmer. The kick detector reads the spectrum
 * and never saw the slider.
 *
 * What changed: the hand follows the bass with the boost taken back off it
 * (squish.ts `bassRouteValue`) and lays the boost as a gain on the force
 * (`bassPressFor`'s last argument, the burst's push, the kick's dye).
 *
 *   1. The control, the old arithmetic (the boosted reading into the hand):
 *      pinned over the ceiling at least half the time at 3× and the press
 *      changing less than half as much a second as at 1×. If it does not, the
 *      song has lost its shape and nothing below means anything.
 *   2. At 1× the hand is the hand it was, to the bit.
 *   3. The new hand is never held at its ceiling by the boost (pinned at 3×
 *      within a tenth of 1×), its deepest press grows with the boost (2× at
 *      least 1.8 the depth of 1×, 3× at least 2.6), and its change a second
 *      grows with it (3× at least 2× of 1×): the kicks still press and let go.
 *   4. The kick detector hears the same kicks at every setting (the slider is
 *      a gain on the hand, not a retune of the ear).
 *   5. The frame loop, read from the source (a route that is not the bass takes a
 *      gain of 1): the press, the burst and the
 *      kick's dye each take the gain, and the bass route is read through
 *      `bassRouteValue`.
 *   6. In the lab, on the app's thin gap, the hand at 1×, 2× and 3× moves
 *      more of the plate's colour each time and the plate stays finite.
 *
 * And any GPU validation error fails the run.
 */
import fs from 'node:fs';
import { build } from 'esbuild';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : String(x));

const out = 'node_modules/.cache/bassboost-lib.mjs';
await build({
  stdin: {
    contents: `export * from './src/lib/squish.ts'; export { songAudioTrack } from './src/lib/songTrack.ts'; export { setShowSeed } from './src/lib/rng.ts'; export { renderBand } from './scripts/band.mjs';`,
    resolveDir: '.', loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const { BassPress, bassPressDepth, bassPressFor, bassPressLevel, bassBoostGain, bassRouteValue, BASS_PRESS, songAudioTrack, setShowSeed, renderBand } = await import(`../${out}`);
setShowSeed(7);

const SR = 48000, FPS = 30, IMPACT = 0.55;
const pcm = renderBand(20, SR, 4 * 8 * 16).pcm;
const BOOSTS = [1, 2, 3];

// ── The ear at each boost, and what each hand does with it ───────────
const rows = {};
for (const b of BOOSTS) {
  const t = songAudioTrack(pcm, SR, FPS, { sensitivity: 0.4, bassBoost: b, autoCalibrate: true }).slice(4 * FPS, 20 * FPS);
  const hand = (depthOf, pinnedOf) => {
    let prev = 0, change = 0, deepest = 0, pinned = 0;
    for (const a of t) {
      const d = depthOf(a) / BASS_PRESS;
      change += Math.abs(d - prev); prev = d; deepest = Math.max(deepest, d);
      if (pinnedOf(a)) pinned++;
    }
    return { change: change / (t.length / FPS), deepest, pinned: pinned / t.length };
  };
  const routeOld = (a) => Math.min(1, a.bass / 100);                       // the boosted reading, as it was
  const routeNew = (a) => bassRouteValue(a.bass, b);                       // the boost taken back off
  rows[b] = {
    old: hand((a) => bassPressFor(routeOld(a), false, IMPACT, 1), (a) => bassPressLevel(routeOld(a), false) >= 1),
    now: hand((a) => bassPressFor(routeNew(a), false, IMPACT, 1, b), (a) => bassPressLevel(routeNew(a), false) >= 1),
    kicks: t.reduce((n, a, i) => n + (a.features?.onsets?.kick?.hit && !(i && t[i - 1].features?.onsets?.kick?.hit) ? 1 : 0), 0),
  };
}
console.log('     (the band\'s chorus, 4–20 s, Sound Drive 0.55)');
for (const b of BOOSTS) {
  const r = rows[b];
  console.log(`     ${b}×  old: change ${f2(r.old.change)}/s deepest ${f2(r.old.deepest)} pinned ${f2(r.old.pinned)}   now: change ${f2(r.now.change)}/s deepest ${f2(r.now.deepest)} pinned ${f2(r.now.pinned)}   kicks ${r.kicks}`);
}
check('control: the boosted reading, fed to the hand as it was, pins it at 3× and presses less a second than at 1×',
  rows[3].old.pinned >= 0.5 && rows[3].old.change < 0.5 * rows[1].old.change,
  `pinned ${f2(rows[3].old.pinned)}, change ${f2(rows[3].old.change)} against ${f2(rows[1].old.change)}`);
{
  let same = true;
  for (let l = 0; l <= 1.0001; l += 0.05) for (const i of [0.2, 0.45, 1]) for (const p of [undefined, 0.4, 1]) {
    same = same && bassPressFor(l, false, i, p, 1) === bassPressFor(l, false, i, p) && bassPressFor(l, false, i, p) === bassPressDepth(bassPressLevel(l, false), i) * (p ?? 1)
      && Math.abs(bassRouteValue(l * 100, 1) - Math.min(1, l)) < 1e-12;
  }
  check('at 1× the hand is the hand it was, to the bit', same && bassBoostGain(undefined) === 1 && bassBoostGain(NaN) === 1);
}
check('the new hand is not held at its ceiling by the boost', rows[3].now.pinned <= rows[1].now.pinned + 0.1, `${f2(rows[3].now.pinned)} at 3×, ${f2(rows[1].now.pinned)} at 1×`);
check('its deepest press grows with the boost', rows[2].now.deepest >= 1.8 * rows[1].now.deepest && rows[3].now.deepest >= 2.6 * rows[1].now.deepest,
  `${f2(rows[1].now.deepest)}, ${f2(rows[2].now.deepest)}, ${f2(rows[3].now.deepest)}`);
check('and so does its change a second, the kicks still press and let go', rows[2].now.change >= 1.5 * rows[1].now.change && rows[3].now.change >= 2 * rows[1].now.change,
  `${f2(rows[1].now.change)}, ${f2(rows[2].now.change)}, ${f2(rows[3].now.change)} a second`);
check('the kick detector hears the same kicks at every setting', rows[1].kicks > 10 && rows[2].kicks === rows[1].kicks && rows[3].kicks === rows[1].kicks,
  `${rows[1].kicks}, ${rows[2].kicks}, ${rows[3].kicks} kicks`);

// ── The frame loop, from the source ──────────────────────────────────
{
  const src = fs.readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
  const has = (s) => src.includes(s);
  check('the frame loop: the bass route is read through bassRouteValue and only when it is the bass; the press, the burst and the kick\'s dye take the gain',
    has("const bassGain = velRoute === 'bass' ? boostGain : 1;")
    && has("velRoute === 'bass' ? bassRouteValue(currentAudioData.bass, boostGain) : getAudioValue(currentAudioData, velRoute)")
    && has("currentAudioData.passage, bassGain),")
    && has('const bassStr = (vel01 - 0.25) * autoAmp * bassGain;')
    && has('bass01 * boostGain * (0.33 + 1.17 * DICE.music.float()) * autoAmp')
    && has('* bass01 * boostGain * bloomGain;'));
}

// ── The plate, in the lab ─────────────────────────────────────────────
/*
  The musicforce hand: the bass going between 0.8 and 0.3 of the route's
  ceiling each second through the analyser's smoothing, at Sound Drive 0.6,
  here at the gain 1, 2 and 3 (the route's own level is the unboosted bass
  the hand follows, so the gain is the only difference between the three).
*/
const steps = (n, boost, period = 60) => {
  const h = new BassPress(); let lv = 0.3; const outp = [];
  for (let k = 0; k < n; k++) {
    lv += ((Math.floor(k / period) % 2 === 0 ? 0.8 : 0.3) - lv) * 0.35;
    const before = h.depth;
    h.follow(192, 96, 96, 54, bassPressFor(lv * 0.7, false, 0.6, 1, boost), true, () => {});
    outp.push(h.depth - before);
  }
  const before = h.depth; h.letGo(192, true, () => {}); outp.push(h.depth - before);
  return outp;
};
const R = Math.round(18 * 1.5 * 1.5 * Math.min(1.5, 0.6 / 0.45));

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
try {
  const r = await page.evaluate(async ({ hands, R }) => {
    const app = (N, mean = 0) => ({ thinGap: 1, gapThickness: 0.45, dt: 0.003, advection: 0.45, gapSpring: 0.00048, turbDetail: 3, meanDensity: mean, maxCurrent: 0.75 / (0.003 * 0.45 * (N - 2)), currentDamp: 0.99 });
    const dyeA = async () => { const f = await lab.field('dye'); const a = new Float32Array(f.length / 4); for (let i = 0; i < a.length; i++) a[i] = f[i * 4 + 3]; return a; };
    const N = 192, c = N / 2;
    const seed = () => {
      let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let k = 0; k < 40; k++) lab.dye(0.1 + 0.8 * r(), 0.1 + 0.8 * r(), 0.03 + 0.05 * r(), [r(), r(), r()], 0.5 + r());
      lab.flush();
    };
    const run = async (hand) => {
      await lab.create(N, N); seed();
      let mean = 0; { const a = await dyeA(); for (const x of a) mean += x; mean /= a.length; }
      await lab.step(2, app(N, mean));
      const snaps = [];
      for (let k = 0; k < 120; k++) {
        const over = { ...app(N, mean), turbScale: 0 };
        const lay = hand ? hand[k] : 0;
        if (lay) lab.squish(c, c, R, lay, 0, 'press', 0, true);
        lab.flush(over.dt);
        await lab.step(1, over, true);
        if (k % 10 === 9) snaps.push(await dyeA());
      }
      if (hand && hand[120]) lab.squish(c, c, R, hand[120], 0, 'press', 0, true);
      lab.flush(app(N).dt);
      await lab.step(1, app(N, mean), true);
      await lab.step(30, app(N, mean));
      snaps.push(await dyeA());
      return snaps;
    };
    const still = await run(null);
    const tot = still[0].reduce((a, b) => a + b, 0);
    const res = {};
    for (const name of Object.keys(hands)) {
      const snaps = await run(hands[name]);
      res[name] = snaps.map((sn, i) => { let d = 0; for (let k = 0; k < sn.length; k++) d += Math.abs(sn[k] - still[i][k]); return d / tot; });
      res[name + 'Finite'] = snaps.every((sn) => sn.every(Number.isFinite));
    }
    return res;
  }, { hands: { b1: steps(120, 1), b2: steps(120, 2), b3: steps(120, 3) }, R });
  const peak = (a) => Math.max(...a);
  const p = [r.b1, r.b2, r.b3].map(peak);
  console.log(`     (the plate's colour moved against the plate left alone, peak over two seconds) 1× ${p[0].toFixed(3)}  2× ${p[1].toFixed(3)}  3× ${p[2].toFixed(3)}`);
  check('on the app\'s thin gap the hand moves more of the plate\'s colour at 2× than 1×, and at 3× than 2×', p[1] > p[0] * 1.15 && p[2] > p[1] * 1.05, `${p.map((x) => x.toFixed(3)).join(' → ')}`);
  check('and the plate stays finite, the colour given back as the bass goes (all but a half of the peak by the end)',
    r.b1Finite && r.b2Finite && r.b3Finite && r.b3[11] < 0.5 * p[2], `3× ends at ${r.b3[11].toFixed(3)} of its ${p[2].toFixed(3)}`);
} finally {
  await close();
}
check('no GPU validation errors', gpuErrors.length === 0, gpuErrors.slice(0, 2).join(' | '));

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} ok`);
process.exit(failed.length ? 1 : 0);
