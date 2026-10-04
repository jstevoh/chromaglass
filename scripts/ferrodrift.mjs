#!/usr/bin/env node
/**
 * Does the ferrofluid poured round Classic's middle stay where it was poured
 * while the band plays?
 *
 *   npm run ferrodrift
 *
 * Found by #238 (PLAN.md, "with the band playing, the ferrofluid poured round
 * Classic's middle drifts into it"): with the band playing, the disc 0.12
 * round the middle went from 0.180 to 0.501 of black in nine seconds on the
 * Mac, against 0.099 to 0.084 in silence, and nothing in the lab moved it.
 * #230 then took that pour out of the Magnet's pick and the line out of
 * `npm run magnet`, so no check watched it after.
 *
 * What four runs of this on the Mac found (#250, every number the disc's
 * mean at the start and twelve seconds on, unless said):
 *
 *   - With the look as it is, the ring spreads into the middle at the same
 *     rate whether the band plays or not: 0.100 → 0.248 in silence, 0.097 →
 *     0.233 with the band, and no slower with the bubbles, the centre
 *     gravity, Tempo Sync or the vibration taken away. The ferrofluid's mean
 *     distance from the middle grows as it does (0.307 → 0.312), so it is the
 *     look's own stirring spreading the ring both ways, not a pull inward.
 *   - With the plate's own currents held, as `npm run magnet` held them when
 *     #238 read its drift, on the thin gap every look plays since #248: the
 *     band moved nothing in, with its bubbles on the plate or none (0.097 →
 *     0.082 with three bubbles, 0.102 → 0.076 with none; silence 0.114 →
 *     0.117 and 0.106 → 0.110).
 *   - Held on the old plate (Thin Gap off): with two to seven of the band's
 *     bubbles near the middle it still drifts in, 0.099 → 0.150 with the mean
 *     distance falling 0.310 → 0.298; on a run where the band dropped no
 *     bubble, and with Bubbles at 0, it did not (0.086 → 0.086, 0.097 →
 *     0.093). The old plate's bubbles press the glass every frame and the
 *     squeeze film there still makes liquid from that press: PLAN.md's
 *     "a still bubble presses the glass", left open for the old plate.
 *
 * So this asks the thin gap, held, with the band playing and its bubbles
 * certainly on the plate: the band's dice drop bubbles on some runs and not
 * others, and a run with none would pass whatever the bubbles do. Four are
 * set down within the band's range (just outside the disc 0.12 round the
 * middle) and kept at four. Against silence on the same plate, held the
 * same way, which has to be still itself, read as the ring's mean distance
 * from the middle (the bar, below, says why not the disc). And the old
 * plate the same, which has to be pulled in by more than the bar: the instrument shown to see the drift it was
 * built for, until the old plate's bubbles stop pressing and that line turns
 * round to ask the old plate to stay too.
 *
 * Needs a GPU that presents WebGPU: the macOS runner, in checks.yml.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, isGpuEngine } from './frame.mjs';

const PORT = 4347;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

/*
  The plate's own currents, held 2.5 s after the pour as `npm run magnet`
  held them when #238 read the drift: turbulence, Audio Impact, the rock,
  Beat Squeeze, the heat's lift and the turning off, and an ordinary plate
  clock. Audio Impact 0 holds every music reaction but the bubbles, which
  are set down here instead.
*/
const HELD = {
  rotationSpeed: 0, turbulenceScale: 0, audioImpact: 0, plateRock: 0, beatSqueeze: 0, buoyancy: 0, globalSpeed: 0.025,
};
const PAGES = [
  { name: 'silence', band: false, bubbles: false, oldPlate: false },
  { name: 'the band and its bubbles', band: true, bubbles: true, oldPlate: false },
  { name: 'the band and its bubbles, old plate', band: true, bubbles: true, oldPlate: true },
];
/*
  Where the bubbles are set down: 0.15 out from the middle, four ways round,
  just outside the disc that is read, inside the band's own range (6 to 46
  steps of 128 from the middle, 0.05 to 0.36). At 0.2 the old plate's
  drift read +0.020 against the bar's +0.012 on its first run: the press
  pulls the ring toward the bubbles, and a bubble halfway to the ring pulls
  little of it into the disc. Nearer, the same pull lands in the disc, and
  the thin gap is asked under the same bubbles.
*/
const SPOTS = [0, 1, 2, 3].map((k) => ({ x: 0.5 + 0.15 * Math.cos(k * Math.PI / 2 + 0.4), y: 0.5 + 0.15 * Math.sin(k * Math.PI / 2 + 0.4) }));

const browser = await launchChromium(chromium);
const results = [];
try {
  for (const pg of PAGES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 200)));
    if (!pg.band) {
      // A chosen silence, so the page's first click starts no band (scripts/mirror.mjs).
      await page.addInitScript(() => {
        try { localStorage.setItem('chromaglass-audio-source', 'none'); } catch { /* none */ }
      });
    }
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic&sim=256${engineQuery()}`, { waitUntil: 'load' });
    await page.waitForTimeout(9000);
    const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
    if (!isGpuEngine(engine)) {
      check(`${pg.name}: the GPU solver is the one being measured`, false, engine ?? 'no debug hook');
      await page.close();
      continue;
    }
    // The old plate: Thin Gap turned off and waited for, as bottles.mjs does.
    let plateOk = true;
    if (pg.oldPlate) {
      await page.evaluate(() => window.chromaglassSettings?.({ thinGap: 0 }));
      for (let k = 0; k < 400 && (await page.evaluate(() => !!window.chromaglassDebug().fluids?.[0]?.thinGap)); k++) await page.waitForTimeout(50);
    }

    /** The ferrofluid: the disc 0.12 round the middle (its mean), the whole plate's share and its mean distance from the middle. */
    const read = () => page.evaluate(async () => {
      const d = window.chromaglassDebug();
      const f = await d.readPhase();
      if (!f) return null;
      const { n, data } = f;
      let total = 0, disc = 0, discCells = 0, rsum = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = data[x + y * n];
        const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5);
        total += v; rsum += v * r;
        if (r < 0.12) { disc += v; discCells++; }
      }
      return {
        n, disc: disc / Math.max(1, discCells), total: total / (n * n), r: total ? rsum / total : 0,
        bubbles: d.bubbles?.bubbles?.length ?? -1, drawn: d.bubbleUniforms?.().count ?? -1, kicks: d.kicks?.() ?? -1,
        thin: !!d.fluids?.[0]?.thinGap, lays: d.phaseLays?.() ?? -1,
        // __band stays defined once the band has started and returns null when it is not playing (App.tsx).
        band: (window.__band?.() ?? null) != null,
        held: { turbulenceScale: d.settings.turbulenceScale, audioImpact: d.settings.audioImpact, phaseAmount: d.settings.phaseAmount },
      };
    });
    /*
      Four bubbles where the band drops its own, kept at four: one set down
      at each spot that has none of the plate's bubbles within 0.05 of it.
      The band's size (LiquidVisualizer, "A few bubbles at a time": 0.9 to
      2.1 grid steps at 128, here 1.5), one at a time with no spread.
    */
    const keepBubbles = () => page.evaluate((spots) => {
      const d = window.chromaglassDebug(), b = d.bubbles, G = d.pointer().grid;
      if (!b?.spawn) return -1;
      for (const s of spots) {
        const near = b.bubbles.some((q) => Math.hypot(q.x / G - s.x, q.y / G - s.y) < 0.05);
        if (!near) b.spawn(s.x * G, s.y * G, 1.5 * G / 128, 1, 0);
      }
      return b.bubbles.length;
    }, SPOTS);

    // The first click (in the corner, off the plate) starts the band where it is let.
    await page.mouse.click(5, 5);
    await page.waitForTimeout(500);
    const laysBefore = await page.evaluate(() => window.chromaglassDebug().phaseLays?.() ?? -1);
    // Ferrofluid turned up on a bare plate pours the look's own shape: Classic's ring.
    await page.evaluate(() => { window.chromaglassDebug().settings.phaseAmount = 0.6; });
    await page.waitForTimeout(2500);
    const laysAfter = await page.evaluate(() => window.chromaglassDebug().phaseLays?.() ?? -1);
    await page.evaluate((held) => {
      const d = window.chromaglassDebug();
      Object.assign(d.settings, held, { audioMappings: { ...(d.settings.audioMappings ?? {}), rotation: 'none' } });
    }, HELD);
    /*
      Read before the bubbles are topped up, so the count is the bubbles
      that lasted the 1.5 s since (and that the frame handed the shader),
      not the ones just set down. Every sample also asks that the plate is
      the one asked for, the ring was not laid again (a new solver of the
      same size re-lays it, LiquidVisualizer "Unless the ferrofluid on the
      plate is the pool"), and the held settings and the pour are still
      what this set (App rebuilds the settings it hands the loop).
    */
    const series = [];
    let bubbleSum = 0, drawnSum = 0, steady = true;
    for (let t = 0; t <= 12; t += 1.5) {
      const s = await read();
      if (pg.bubbles) await keepBubbles();
      series.push({ t, ...s });
      if (s) {
        if (t > 0) { bubbleSum += s.bubbles; drawnSum += s.drawn; }
        plateOk = plateOk && s.thin === !pg.oldPlate;
        steady = steady && s.lays === laysAfter && s.held.turbulenceScale === 0 && s.held.audioImpact === 0 && s.held.phaseAmount === 0.6;
      } else steady = false;
      if (t < 12) await page.waitForTimeout(1500);
    }
    const first = series[0], last = series[series.length - 1];
    if (!steady) console.log(`  ${pg.name}: the ring was laid again, a reading failed, or the held settings were let go while it was watched`);
    console.log(`  ${pg.name}: poured ${laysAfter - laysBefore} time(s); grid ${first?.n} → ${last?.n}; ` +
      `${last?.thin ? 'thin gap' : 'old plate'}; band ${last?.band ? `playing, ${last.kicks - first.kicks} kicks while watched` : 'off'}`);
    for (const s of series) {
      if (!s) { console.log('     (no phase read)'); continue; }
      console.log(`     t=${s.t.toFixed(1).padStart(4)} s  disc ${s.disc.toFixed(3)}  plate ${(s.total * 100).toFixed(2)}%  r ${s.r.toFixed(3)}  bubbles ${s.bubbles} (drawn ${s.drawn})`);
    }
    const n = series.length - 1;
    results.push({ pg, series, first, last, poured: laysAfter - laysBefore, plateOk, steady, bubbles: bubbleSum / n, drawn: drawnSum / n });
    await page.close();
  }
} finally {
  await browser.close();
}

/*
  How far the ferrofluid moved in toward the middle: its mean distance from
  the middle, the mean of the first two readings less the mean of the last
  two (so a positive number is a pull inward), on a page that poured the
  ring once (round the middle, where Classic pours it: most of it 0.28 to
  0.34 out, the disc nearly clear, about a fifth of the plate), never laid
  it again, kept its grid, its plate and its held settings.

  The mean distance, not the disc 0.12 round the middle that #238 read. The
  disc is a small window on a few drops at the ring's inner edge, and a
  pour settling in its first seconds moves it either way: two runs of
  silence on the same build read the disc +0.004 and −0.022 (first two
  readings to last two), rising 0.119 → 0.135 in the first 1.5 s and
  falling to 0.104, while the mean distance read 0.308 → 0.307 and 0.308 →
  0.308. The disc is still printed. A drift in is the ring's mean distance
  falling: the old plate with its bubbles 0.315 → 0.306 and 0.311 → 0.301,
  and #238's run, 0.310 → 0.298 on the old plate.
*/
const poured = (r) => r?.first && r.first.total > 0.15 && r.first.r > 0.28 && r.first.r < 0.34 && r.first.disc > 0.03 && r.first.disc < 0.2;
const pull = (r) => {
  if (!r?.first || !r?.last || r.poured !== 1 || r.first.n !== r.last.n || !r.plateOk || !r.steady || !poured(r)) return null;
  const S = r.series;
  return (S[0].r + S[1].r) / 2 - (S[S.length - 1].r + S[S.length - 2].r) / 2;
};
const signed = (v, d = 4) => v === null ? 'unread' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;
const said = (r) => r?.first && r?.last ? `mean distance ${r.first.r.toFixed(4)} → ${r.last.r.toFixed(4)}, pulled in ${signed(pull(r))} (the disc 0.12 round the middle ${r.first.disc.toFixed(3)} → ${r.last.disc.toFixed(3)})` : 'unread';
const kicksIn = (r) => r?.first && r?.last ? r.last.kicks - r.first.kicks : -1;
const [quiet, band, old] = PAGES.map((p) => results.find((r) => r.pg === p));
const pq = pull(quiet), pb = pull(band), po = pull(old);
/*
  The bar, 0.004 of the plate's width more pull than silence: a third of
  #238's 0.012 and under half of the old plate's 0.009 and 0.010 now, where
  the thin gap with the band and its bubbles read 0.001 and 0.001 against
  silence's 0.001 and 0.000. Silence itself has to be still (under 0.004
  either way), or the difference could hide a drift both pages share: with
  the look's own currents let go both spread, the mean distance growing
  about 0.005 in twelve seconds.
*/
const BAR = 0.004;
check('the ring was poured round the middle on every page, once, and stayed the ring the pages watched',
  [quiet, band, old].every((r) => r && poured(r) && r.poured === 1 && r.steady && r.plateOk),
  [quiet, band, old].map((r, i) => `${PAGES[i].name}: ${r?.first ? `${(r.first.total * 100).toFixed(1)}% of the plate, ${r.first.r.toFixed(3)} out, the disc ${r.first.disc.toFixed(3)}; poured ${r.poured}, ${r.steady ? 'held' : 'not held'}, ${r.plateOk ? 'on its plate' : 'on the wrong plate'}` : 'unread'}`).join('; '));
check('silence was silent and still: no band, no kicks, no bubbles, the ring where it was poured',
  !!quiet?.last && !quiet.last.band && kicksIn(quiet) === 0 && quiet.series.every((s) => s && s.bubbles === 0) && pq !== null && Math.abs(pq) < BAR,
  `${quiet?.last?.band ? 'a band playing' : 'no band'}, ${kicksIn(quiet)} kicks while watched; ${said(quiet)}`);
check('the band played, and its bubbles lasted on the plate and were drawn, while it was watched',
  [band, old].every((r) => !!r?.last?.band && kicksIn(r) > 0 && r.bubbles >= 3 && r.drawn >= 3),
  [band, old].map((r, i) => `${PAGES[i + 1].name}: ${r?.last?.band ? `band playing, ${kicksIn(r)} kicks` : 'no band'}, ${r ? `${r.bubbles.toFixed(1)} bubbles lasting 1.5 s, ${r.drawn.toFixed(1)} drawn` : 'unread'}`).join('; '));
/*
  The instrument, shown to see the drift it was built for: the old plate's
  bubbles still press the glass and pull the poured ring in (PLAN.md, "a
  still bubble presses the glass"). When that item lands this line turns
  round and asks the old plate to stay as the thin gap does.
*/
check('and it can see a drift: the old plate, whose bubbles still press the glass, pulls the ring in by more than the bar over silence',
  pq !== null && po !== null && po > pq + BAR,
  `the old plate with the band and its bubbles: ${said(old)}`);
check('with the band playing, the ferrofluid poured round the middle is pulled in no more than in silence',
  pq !== null && pb !== null && pb < pq + BAR,
  `on the thin gap, with the band and its bubbles: ${said(band)}; in silence: ${said(quiet)}; over twelve seconds`);

const failed = checks.filter(c => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} failed` : `\nall ${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
