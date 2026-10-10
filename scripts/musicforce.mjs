#!/usr/bin/env node
/**
 * The music's own pushes, as forces a thin gap keeps (PLAN 27e).
 *
 *   npm run musicforce     (the readings and the hand in node; the plate in the lab: any adapter that computes)
 *
 * What was reported: "Generally I don't feel like music is having as much
 * impact on the visuals as I would like." Read from the frame loop, Sound
 * Drive's routes are dye (the centre pulse, the mid's stream, the treble's
 * sparks, the kick's ring, the energy's swell) and two pushes: the bass
 * burst, a radial velocity laid every step while the velocity route (the
 * bass, on most looks) is over 0.25, and the kick ring's outward kick. On a
 * thin gap, every look since #248, a push straight out from a point is a
 * gradient, and the projection takes a gradient out whole. And the swell
 * read the energy (0–1) over 70, as though it were a band (0–85), so it
 * never reached its gate. So:
 *
 *   1. The readings: an energy of 0.6 reads 0.6, over the swell's gate of
 *      0.15 (it read 0.0086, under it, on the loudest music there is).
 *   2. The hand (lib/squish.ts BassPress): no depth under the burst's 0.25
 *      or at Sound Drive 0; followed up and down and moved, it lays exactly
 *      what is down and gives all of it back when the bass stops, where it
 *      pressed it and in the shape it pressed it. And the frame loop, read
 *      from the source (the lab cannot run it): the burst only off a thin
 *      gap, and every plate handed its hand after the music's block.
 *   3. In the lab, forty pools of colour on the app's thin gap, two seconds
 *      of a bass going between 0.8 and 0.3 each second through the
 *      analyser's smoothing, at the default Sound Drive (0.6), each against
 *      the same plate left alone: the hand moves at least a tenth of the
 *      plate's colour as the bass comes in, at least five times what the
 *      burst moved, and gives it back to under a third of that as the bass
 *      goes, and to under a sixth once the music stops. The burst's own reading is printed beside it: it has to move
 *      under 0.02, or the reason for this is gone and the burst should come
 *      back. A look's own stir is printed as the yardstick.
 *   4. And Classic's ferrofluid ring, through three bass swells, stays where
 *      it was poured: its mean distance from the middle moves under 0.009 of
 *      the plate (the bar `npm run rides` holds Beat Squeeze's kicks to),
 *      having been pushed out by the first swell.
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

const out = 'node_modules/.cache/musicforce-lib.mjs';
await build({ stdin: { contents: "export * from './src/lib/squish.ts'; export * from './src/lib/stir.ts'; export { levels01 } from './src/lib/soundLevels.ts';", resolveDir: '.', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
const { BassPress, bassPressDepth, BASS_PRESS, BASS_STEP, stirOf, levels01 } = await import(`../${out}`);

// ── 1. The readings ──────────────────────────────────────────────────
{
  const l = levels01({ bass: 56, mid: 35, treble: 14, energy: 0.6 });
  check('the swell reads the energy on its own scale: 0.6 is 0.6, over its gate of 0.15', Math.abs(l.energy - 0.6) < 1e-9 && l.energy > 0.15 && Math.abs(l.bass - 0.8) < 1e-9 && Math.abs(l.mid - 0.5) < 1e-9,
    `energy ${l.energy}, bass ${l.bass.toFixed(2)}, mid ${l.mid.toFixed(2)}; over 70 it read ${(0.6 / 70).toFixed(4)}, and the loudest calibrated music ${(0.85 / 70).toFixed(4)}`);
  const z = levels01({ bass: 200, mid: -5, treble: NaN, energy: 3 });
  check('and every band stays within 0 to 1', z.bass === 1 && z.mid === 0 && z.treble === 0 && z.energy === 1);
}

// ── 2. The hand, in node ─────────────────────────────────────────────
{
  check('the hand is not down under the burst\'s 0.25, nor at Sound Drive 0', bassPressDepth(0.25, 0.6) === 0 && bassPressDepth(1, 0) === 0 && bassPressDepth(1, 0.45) === BASS_PRESS,
    `full at Sound Drive 0.45: ${bassPressDepth(1, 0.45)}, at 0.6: ${bassPressDepth(1, 0.6).toFixed(5)}, at 1: ${bassPressDepth(1, 1).toFixed(5)}`);
  // Every cell's gap laid, summed, and where: what is down must be what was asked, and all of it must come back.
  const S = 192, gap = new Float64Array(S * S);
  const cell = (idx, g) => { gap[idx] += g; };
  const h = new BassPress();
  const sum = () => gap.reduce((a, b) => a + b, 0);
  const levels = [0.3, 0.6, 0.9, 0.9, 0.5, 0.2, 0.8, 1];
  for (const lv of levels) h.follow(S, 96, 96, 54, bassPressDepth(lv, 0.6), true, cell);
  const downOne = (() => { const g = new Float64Array(S * S); const p = new BassPress(); p.follow(S, 96, 96, 54, bassPressDepth(1, 0.6), true, (i, x) => { g[i] += x; }); return g.reduce((a, b) => a + b, 0); })();
  const asked = Math.abs(sum() - downOne) / Math.abs(downOne);
  h.follow(S, 110, 90, 54, bassPressDepth(1, 0.6), true, cell);   // moved: an area look's next area
  let elsewhere = 0; for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) if (Math.hypot(i - 96, j - 96) < 54 && Math.hypot(i - 110, j - 90) >= 54) elsewhere += gap[i + j * S];
  h.follow(S, 110, 90, 54, 0, true, cell);
  let left = 0; for (const g of gap) left = Math.max(left, Math.abs(g));
  check('followed up and down, what is down is what was asked; moved, nothing is left where it was; let up, all of it comes back',
    asked < 1e-9 && Math.abs(elsewhere) < 1e-12 && left < 1e-12 && h.depth === 0,
    `${(asked * 100).toExponential(1)}% off what was asked, ${elsewhere.toExponential(1)} left behind, ${left.toExponential(1)} left anywhere once let up`);
  const q = new BassPress(); let writes = 0;
  q.follow(S, 96, 96, 54, BASS_PRESS, true, () => {});
  q.follow(S, 96, 96, 54, BASS_PRESS * (1 + BASS_STEP / 2), true, () => { writes++; });
  check('and a change under BASS_STEP waits for a larger one', writes === 0 && q.depth === BASS_PRESS);
  // Pressed on a thin gap (a bowl), let go after the look turned Thin Gap off: given back as the bowl it was.
  const g2 = new Float64Array(S * S), c2 = (i, x) => { g2[i] += x; };
  const t = new BassPress(); t.follow(S, 96, 96, 54, BASS_PRESS, true, c2); t.letGo(S, false, c2);
  let left2 = 0; for (const x of g2) left2 = Math.max(left2, Math.abs(x));
  check('and let go after Thin Gap was turned off, it gives back the bowl it pressed, not a flat disc', left2 < 1e-12, `${left2.toExponential(1)} left`);
}

/*
  The frame loop's part, which the lab cannot run: read from the source. The
  burst runs only off a thin gap, the hand is handed where the burst was,
  and every plate is handed its hand on every running step from outside the
  music's block (so a plate the music left, or music that stopped, lets up).
*/
{
  const src = fs.readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
  const block = src.indexOf('// ── Audio input to fluid'), each = src.indexOf('fluidsRef.current.forEach((pl, li) => {', block);
  const hand = src.indexOf('pl.pressBass(', each), set = src.indexOf('bassPressAt = {', block);
  const between = src.slice(set, each);
  // The music's block opened after `let bassPressAt` must have closed before the forEach: its braces balance.
  const opened = src.indexOf('if (currentAudioData && currentSettings.audioMappings) {', block);
  const inner = src.slice(opened, each);
  const depth = [...inner].reduce((d, ch) => d + (ch === '{' ? 1 : ch === '}' ? -1 : 0), 0);
  check("the frame loop: the burst only off a thin gap, the hand set where the burst was and handed to every plate after the music's block",
    src.includes('if (vel01 > 0.25 && !activeFluid.thinGap) {') && set > block && between.includes('bassPressDepth(vel01,') && each > set && hand > each && hand - each < 400 && depth === 0,
    `braces between the music's block and the hand: ${depth} open`);
}

// ── 3 and 4. The plate, in the lab ───────────────────────────────────
/*
  The hand's steps as the frame loop lays them: the bass going between 0.8
  and 0.3 each second (the velocity route's level), smoothed as the analyser
  smooths the bass (LEVEL_SMOOTHING, 0.35 a frame, one step a frame here),
  at the default Sound Drive. Each entry is what the step lays (the change
  in depth, as BassPress's one disc), so the lab lays exactly the app's.
*/
const steps = (n, impact, period = 60) => {
  const h = new BassPress(); let lv = 0.3; const outp = [];
  for (let k = 0; k < n; k++) {
    lv += ((Math.floor(k / period) % 2 === 0 ? 0.8 : 0.3) - lv) * 0.35;
    const before = h.depth;
    h.follow(192, 96, 96, 54, bassPressDepth(lv, impact), true, () => {});
    outp.push(h.depth - before);
  }
  const before = h.depth; h.letGo(192, true, () => {}); outp.push(h.depth - before);
  return outp;
};
const R = Math.round(18 * 1.5 * 1.5 * Math.min(1.5, 0.6 / 0.45));   // the app's palm at Sound Drive 0.6

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
try {
  const r = await page.evaluate(async ({ hand, handOff, swells, stir03, R }) => {
    const res = {};
    const app = (N, mean = 0) => ({ thinGap: 1, gapThickness: 0.45, dt: 0.003, advection: 0.45, gapSpring: 0.00048, turbDetail: 3, meanDensity: mean, maxCurrent: 0.75 / (0.003 * 0.45 * (N - 2)), currentDamp: 0.99 });
    const dyeA = async () => { const f = await lab.field('dye'); const a = new Float32Array(f.length / 4); for (let i = 0; i < a.length; i++) a[i] = f[i * 4 + 3]; return a; };
    {
      const N = 192, c = N / 2;
      const seed = () => {
        let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
        for (let k = 0; k < 40; k++) lab.dye(0.1 + 0.8 * r(), 0.1 + 0.8 * r(), 0.03 + 0.05 * r(), [r(), r(), r()], 0.5 + r());
        lab.flush();
      };
      const run = async (route) => {
        await lab.create(N, N); seed();
        let mean = 0; { const a = await dyeA(); for (const x of a) mean += x; mean /= a.length; }
        await lab.step(2, app(N, mean));
        const snaps = [];
        for (let k = 0; k < 120; k++) {
          const over = { ...app(N, mean), turbScale: route === 'stir' ? stir03 : 0 };
          const lay = route === 'hand' ? hand[k] : 0;
          if (lay) lab.squish(c, c, R, lay, 0, 'press', 0, true);
          /*
            The burst as the frame loop laid it, every step at a bass of 0.8
            and Sound Drive 0.6: radial pushes every third cell out to 36
            cells, 0.65 × (0.8 − 0.25) × 0.6/0.45 at the middle, falling to
            nothing at the edge.
          */
          if (route === 'burst') {
            const B = Math.round(18 * 1.5 * (0.6 / 0.45)), str = (0.8 - 0.25) * (0.6 / 0.45), v = new Array(N * N * 4).fill(0);
            for (let bj = -B; bj <= B; bj += 3) for (let bi = -B; bi <= B; bi += 3) {
              const d = Math.hypot(bi, bj); if (d < 2 || d > B) continue;
              const f = str * 0.65 * (1 - d / B), i = (c + bi + (c + bj) * N) * 4;
              v[i] += bi / d * f; v[i + 1] += bj / d * f;
            }
            lab.addVel(v);
          }
          lab.flush(over.dt);
          await lab.step(1, over, true);
          if (k % 10 === 9) snaps.push(await dyeA());
        }
        // The music stops: the hand lets go of whatever is down (its last entry), and the plate settles a moment.
        if (route === 'hand' && hand[120]) lab.squish(c, c, R, hand[120], 0, 'press', 0, true);
        lab.flush(app(N).dt);
        await lab.step(1, app(N, mean), true);
        await lab.step(30, app(N, mean));
        snaps.push(await dyeA());
        return snaps;
      };
      const still = await run('still');
      const tot = still[0].reduce((a, b) => a + b, 0);
      const moved = (s) => s.map((sn, i) => { let d = 0; for (let k = 0; k < sn.length; k++) d += Math.abs(sn[k] - still[i][k]); return d / tot; });
      for (const name of ['stir', 'burst', 'hand']) res[name] = moved(await run(name));
    }
    // ── 4. Classic's ferrofluid ring under three bass swells ───────
    {
      const N = 256, over = app(N, 0), c = N / 2, RR = Math.round(R * N / 192);
      const { settings: L, pour } = lab.look('classic');
      const ringOut = async () => {
        const f = await lab.phase(); let t = 0, s = 0;
        for (let y = 0; y < f.n; y++) for (let x = 0; x < f.n; x++) { const v = f.data[x + y * f.n]; t += v; s += v * Math.hypot((x + 0.5) / f.n - 0.5, (y + 0.5) / f.n - 0.5); }
        return s / t;
      };
      await lab.create(N, N);
      lab.pour(pour, L.phaseScale ?? 1); lab.flush();
      await lab.step(2, over);
      res.ferroBefore = await ringOut();
      for (let k = 0; k < swells.length; k++) {
        if (swells[k]) lab.squish(c, c, RR, swells[k], 0, 'press', 0, true);
        lab.flush(over.dt);
        await lab.step(1, over, true);
        if (k === 20) res.ferroIn = await ringOut();
      }
      await lab.step(30, over);
      res.ferroAfter = await ringOut();
    }
    return res;
  }, { hand: steps(120, 0.6), swells: steps(360, 0.6), stir03: stirOf(0.3, 0.8, 0.6), R });

  const peak = (a) => Math.max(...a);
  const f = (a) => a.map((x) => x.toFixed(3)).join(' ');
  const hand = peak(r.hand), burst = peak(r.burst), back = r.hand[11], stopped = r.hand[12];
  console.log(`   (two seconds, each tenth of a second against the plate left alone; the bass comes in at 0 s and goes at 1 s; the last, half a second after the music stops)\n   hand  ${f(r.hand)}\n   burst ${f(r.burst)}\n   stir  ${f(r.stir)}`);
  check('the bass\'s hand moves at least a tenth of the plate\'s colour as the bass comes in, five times what the burst did',
    hand >= 0.1 && hand >= 5 * burst, `${hand.toFixed(3)} against the burst's ${burst.toFixed(3)} (a look's own stir, Turbulence 0.3 with the band: ${peak(r.stir).toFixed(3)})`);
  check('and the burst, as the frame loop laid it, still moves nothing on a thin gap (or bring it back)', burst < 0.02, burst.toFixed(4));
  check('and let up as the bass goes, it gives back all but a third, and when the music stops all but a sixth', back < hand / 3 && stopped < hand / 6,
    `${back.toFixed(3)} left with the bass down at 0.3 and ${stopped.toFixed(3)} once the music stops, of ${hand.toFixed(3)}`);
  const moved = r.ferroAfter - r.ferroBefore;
  check('Classic\'s ferrofluid ring, through three bass swells, stays where it was poured, its mean distance moving under 0.009 of the plate',
    r.ferroIn - r.ferroBefore > 0.001 && Math.abs(moved) < 0.009,
    `pushed out to ${r.ferroIn.toFixed(4)} by the first swell; ${r.ferroBefore.toFixed(4)} → ${r.ferroAfter.toFixed(4)} (${moved >= 0 ? '+' : ''}${moved.toFixed(4)})`);
} finally {
  await close();
}
check('no GPU validation errors', gpuErrors.length === 0, gpuErrors.slice(0, 2).join(' | '));

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} ok`);
process.exit(failed.length ? 1 : 0);
