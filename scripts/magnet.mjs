#!/usr/bin/env node
/**
 * Does the Magnet tool move the ferrofluid, the way a hand does it?
 *
 *   npm run magnet
 *
 * Reported: "magnet tool isn't really working". `npm run ferro` proves the
 * physics with the magnet placed by setting, and every one of its checks
 * passed while the tool did very little in the hand: the pull was scaled by
 * the flow's own step, which a slow look keeps tiny, so a dragged magnet left
 * the ferrofluid behind. So this goes the way a visitor does, through the
 * keyboard and the mouse, on a look that has no ferrofluid of its own:
 *
 *   1. picking the Magnet changes nothing on the plate: no ferrofluid
 *      poured and no magnet under it until a hand holds it (the owner's
 *      "immediate big black hole in the middle when I select it", and then
 *      "Magnet still makes a giant black hole as soon as you pick it")
 *   2. touching the bare plate with it brings no ferrofluid either: none in
 *      the solver, Ferrofluid not turned up, no look's pour (the owner: "Why
 *      does the magnet add ferrofluid? It should only work on ferrofluid
 *      that is already there"); it does give the look its magnet
 *   3. over ferrofluid that is there (a pool laid as the bottle lays it), a
 *      hold draws it and adds none, and a drag carries it with the hand,
 *      neither making nor losing liquid
 *   4. let go of, it stays where the hand left it, rather than going back
 *      to the middle and taking the ferrofluid with it
 *   5. and Magnet Across still moves it once the hand has set it down
 *   6. Magnet Size reaches the solver: a bigger magnet is a wider one held
 *      at the same gap (lib/magnetSize.ts, PLAN 9v), its radius k times the
 *      tool's own, its height and strength as they were
 *   7. a new grid (the quality governor stepping down) with the Magnet in
 *      hand lays nothing on a bare plate, picked and untouched or held:
 *      never the look's ring, and no pool of the magnet's own
 *
 * Needs a GPU that presents WebGPU: the macOS runner, in checks.yml.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, isGpuEngine } from './frame.mjs';

const PORT = 4341;
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

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 200)));
  /*
    On one grid (sim=256, as bottles.mjs pins it): the governor moving the
    grid gives the plate a new solver, which does not carry the ferrofluid
    across (PLAN 9w), and the drag below would read the pool as lost.
    Counted too (phaseLays), so it cannot pass if it happens anyway. And at
    Magnet Size 0.9 from the load (set=, which a look change keeps: it is
    the performer's, RIG_KEYS), so the set-down magnet is sized (check 4).
  */
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic&sim=256&set=magnetSize=0.9${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
  check('the GPU solver is the one being measured', isGpuEngine(engine), engine ?? 'no debug hook');
  if (!isGpuEngine(engine)) process.exit(1);

  /**
   * How much ferrofluid is on the lead plate, where its centre of mass is
   * (plate 0..1), and how much sits within `reach` of a point (the hand).
   */
  const phase = (at = null, reach = 0.12) => page.evaluate(async ({ at, reach }) => {
    const f = await window.chromaglassDebug().readPhase();
    if (!f) return { total: -1, x: 0, y: 0, near: 0, n: 0 };
    const { n, data } = f;
    let total = 0, cx = 0, cy = 0, near = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = data[x + y * n];
      total += v; cx += v * (x / n); cy += v * (y / n);
      if (at && Math.hypot((x + 0.5) / n - at.x, (y + 0.5) / n - at.y) < reach) near += v;
    }
    // Near and total as fractions of the plate's cells, so a grid change
    // does not read as liquid made or lost (n is reported for that too).
    return { total: total / (n * n), x: total ? cx / total : 0, y: total ? cy / total : 0, near: near / (n * n) * 1e4, n };
  }, { at, reach });
  const amount = () => page.evaluate(() => window.chromaglassDebug().settings?.phaseAmount ?? 0);

  const before = await phase();
  const amountBefore = await amount();
  console.log(`     classic: ferrofluid ${amountBefore}, ${(before.total * 100).toFixed(1)}% of the plate`);

  /*
    1. Pick the Magnet the way a hand does, and the plate is as it was.

    Reported by the owner: "Magnet makes an immediate big black hole in the
    middle when I select it." Picking it gave the look a magnet (Magnet
    Strength 0.8) under the middle, which gathered the ferrofluid it also
    poured into one black pool there. That magnet was taken away (PLAN 9s)
    and the owner, on the build with it gone: "Magnet still makes a giant
    black hole as soon as you pick it." The pour itself was the hole: the
    look's ring, about a fifth of the plate in black drops round the middle
    (22% at Classic's Scale in the lab), which at a big Ferrofluid Scale run
    together across it. So picking the Magnet pours nothing now.

    Asked of the solver, not the settings: no magnet in the step, no lay of
    the ferrofluid (phaseLays) and none on the plate. And again nine seconds
    on, still untouched, so a pour that waits for the amount, the solver or
    the governor (each of which has laid the ring on its own before: a new
    solver lays it afresh) is caught too.
  */
  const lays = () => page.evaluate(() => window.chromaglassDebug().phaseLays?.() ?? -1);
  const live = () => page.evaluate(() => window.chromaglassDebug().phaseState?.()?.live ?? null);
  const laysBefore = await lays();
  await page.mouse.click(5, 5);
  await page.keyboard.press('m');
  await page.waitForTimeout(2500);
  const pickedStep = await page.evaluate(() => {
    const d = window.chromaglassDebug(), st = d.fluids?.[0]?.lastStep;
    return { tool: d.tool?.() ?? null, strength: st ? +st.magnetStrength : null, magnets: d.magnets?.().length ?? null };
  });
  const picked = await phase();
  // In hand, asked first: a pick that missed would pass both of these on an untouched plate.
  check('picked, and not yet touched, the Magnet puts no magnet under the plate',
    pickedStep.tool === 'magnet' && pickedStep.strength === 0 && pickedStep.magnets === 0,
    `${pickedStep.tool} in hand; the solver is stepped with magnet strength ${pickedStep.strength}, ${pickedStep.magnets} magnets on the plate`);
  await page.waitForTimeout(9000);
  const untouched = await phase();
  const laysPicked = await lays();
  check('and pours no ferrofluid: the plate is as it was until a hand touches it',
    laysBefore >= 0 && laysPicked === laysBefore && picked.total >= 0 && untouched.total >= 0
      && pickedStep.tool === 'magnet' && picked.total <= before.total + 0.001 && untouched.total <= before.total + 0.001,
    `ferrofluid ${(before.total * 100).toFixed(2)}% of the plate before the pick, ${(picked.total * 100).toFixed(2)}% after, ` +
    `${(untouched.total * 100).toFixed(2)}% nine seconds on (Ferrofluid ${amountBefore} → ${await amount()}); laid ${laysBefore} → ${laysPicked} times`);

  /*
    Hold the plate still under the hand for the drag. Classic turns, and the
    pointer mapping follows it, so a held pointer drags the magnet across the
    plate and the ferrofluid smears along a moving path behind it (CI read
    the gathering 0.11 to 0.19 away from where the hand stopped, and the
    check failed by one unit). The turning is the look's, not the magnet's,
    so it is a control here, the way ferro.mjs sets the look it measures on.

    And the plate's own currents, for the same reason. With the band playing,
    Classic's turbulence, sound drive, beat rock and squeeze and its heat
    lift churn the plate as hard as the magnet pulls, differently on every
    run: the check went fail, pass, fail across three heads with no magnet
    change between them (on the last, the solver's magnet was at the hand and
    the ferrofluid gathered 0.25 away). In the lab, where nothing else moves,
    a held magnet gathers 123 -> 317 in three seconds.
  */
  await page.evaluate(() => {
    const d = window.chromaglassDebug();
    Object.assign(d.settings, {
      rotationSpeed: 0, audioMappings: { ...(d.settings.audioMappings ?? {}), rotation: 'none' },
      turbulenceScale: 0, audioImpact: 0, plateRock: 0, beatSqueeze: 0, buoyancy: 0,
      /*
        And an ordinary plate clock. The magnet acts in plate time, and
        Classic runs the plate slowest of any look (0.00924); the music was
        nudging it up, and with the sound drive held at zero the ferrofluid
        had a third of the time to move in the same four seconds (CI: +47 at
        best along the whole path, against +111 to +124 with the music on).
      */
      globalSpeed: 0.025,
    });
  });

  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const at = (fx) => [box.x + box.width * fx, box.y + box.height * 0.5];

  /*
    2. The first touch on the bare plate brings no ferrofluid.

    The owner, 2026-10-04, on the build where it did (9x laid a pool under
    the hand the first time the Magnet touched a plate with none): "Why does
    the magnet add ferrofluid? It should only work on ferrofluid that is
    already there." So asked of the solver while the hand holds the magnet
    on Classic, a look with none: no ferrofluid in it (readPhase, and
    phaseState's live, which any lay sets), no look's pour (phaseLays), and
    Ferrofluid not turned up, since turned up over a bare plate the frame
    loop pours the look's ring. Asked after a second and a half of holding
    and again after letting go, so a lay that waits for the amount or the
    hold's later calls to the app is caught too.

    And still a magnet: the hold gives the look one (Magnet Strength 0.8),
    so let go of it stays under the glass where the hand left it (check 4).
    A hold that reached nothing would pass every other line here.

    The touch is near the canvas's left edge, so the hand is well off the
    middle (asked: 0.2 at least), where neither the look's ring nor a magnet
    under the middle would put anything near it.
  */
  /*
    What the plate is doing round the touch, printed and not asked: on one
    Mac run (#230) the magnet's pool sat 0.11 off the hand 1.5 s after the
    touch and the drag then left it behind, while the lab replaying that
    run's own step carried it 87–90%. So whatever moved it is in the app
    and not in the step: these say which, the next time a drag drops. The
    solver's magnet through the first second and a half; the plate's turn
    and spin; the steps the solver took; and the automation's own hands.
  */
  const scene = () => page.evaluate(() => {
    const d = window.chromaglassDebug(), f = d.fluids?.[0];
    return { angle: d.rotation?.current?.[0] ?? null, spin: d.spin?.current?.[0] ?? null, steps: f?.stepCount ?? null, auto: { ...(d.autoEvents ?? {}) }, at: performance.now() };
  });
  const fmtScene = (a, b) => `the plate turned ${a.angle !== null && b.angle !== null ? (b.angle - a.angle).toFixed(4) : '?'} rad (spin ${b.spin !== null ? b.spin.toFixed(4) : '?'} rad/s), ` +
    `${a.steps !== null && b.steps !== null ? b.steps - a.steps : '?'} solver steps in ${((b.at - a.at) / 1000).toFixed(1)} s, automation ${JSON.stringify(a.auto)} → ${JSON.stringify(b.auto)}`;
  const given = () => page.evaluate(() => { const s = window.chromaglassDebug().settings ?? {}; return { amount: s.phaseAmount ?? 0, strength: s.magnetStrength ?? 0, size: s.magnetSize }; });
  await page.mouse.move(...at(0.05));
  await page.mouse.down();
  await page.waitForTimeout(1500);
  const first = await page.evaluate(() => window.chromaglassDebug().magnetHand?.());
  const firstAt = first ? { x: Math.max(0.05, Math.min(0.95, first.x)), y: Math.max(0.05, Math.min(0.95, first.y)) } : null;
  const bareHeld = await phase(firstAt, 0.18), liveHeld = await live(), givenHeld = await given(), laysHeld = await lays();
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const bareAfter = await phase(), liveAfter = await live(), givenAfter = await given(), laysAfter = await lays();
  const offMiddle = firstAt ? Math.hypot(firstAt.x - 0.5, firstAt.y - 0.5) : 0;
  check('touching a bare plate with the Magnet brings no ferrofluid, and gives the look its magnet',
    !!firstAt && offMiddle > 0.2 && liveHeld === false && liveAfter === false
      && bareHeld.total >= 0 && bareHeld.total <= before.total + 0.001 && bareAfter.total >= 0 && bareAfter.total <= before.total + 0.001
      && laysHeld === laysBefore && laysAfter === laysBefore
      && givenHeld.amount <= 0.002 && givenAfter.amount <= 0.002 && givenHeld.strength === 0.8,
    `the hand at ${firstAt ? `${firstAt.x.toFixed(2)},${firstAt.y.toFixed(2)}` : 'nowhere'}, ${offMiddle.toFixed(2)} off the middle; ` +
    `ferrofluid ${(before.total * 100).toFixed(2)}% of the plate before, ${(bareHeld.total * 100).toFixed(2)}% held, ${(bareAfter.total * 100).toFixed(2)}% let go ` +
    `(in the solver: ${liveHeld}, then ${liveAfter}); laid as a look's ${laysBefore} → ${laysHeld} → ${laysAfter} times; ` +
    `Ferrofluid ${givenHeld.amount} held, ${givenAfter.amount} let go; Magnet Strength ${givenHeld.strength}`);

  /*
    3. Ferrofluid that is there: the hand holds the magnet over it, and the
    hold draws it and adds none.

    Poured the way the Ferrofluid bottle pours it: the bottle's laying tools
    end in the solver's addPhase (LiquidVisualizer's liquid dose), called
    here once, so the pool is one known size where the hand will touch, and
    the check does not ride a Dropper's timing. 0.157 in radius, 0.9 full:
    0.9 πr²/2 = 3.47% of the plate. Ferrofluid is left at Classic's 0, as a
    pool poured and then hidden would be, so the hold has a reason to turn
    it up and the check can see it does only over ferrofluid that is there.
    Turned up, the frame loop's "turned up on a bare plate" pour must not
    fire either (phaseLays, and the total: the ring would add 22%).
  */
  const POOL = 0.9 * Math.PI * 0.157 ** 2 / 2;
  if (firstAt) await page.evaluate(({ x, y }) => window.chromaglassDebug().fluids[0].gpu.addPhase(x, y, 0.157, 0.9), firstAt);
  await page.waitForTimeout(500);
  const poured = await phase(firstAt, 0.18), livePoured = await live();
  const sceneBefore = await scene();
  await page.mouse.move(...at(0.05));
  await page.mouse.down();
  const early = [];
  for (let k = 0; k < 6; k++) {
    await page.waitForTimeout(250);
    early.push(await page.evaluate(() => { const m = window.chromaglassDebug().magnetNow?.(); return m ? `${m.held ? 'H' : '-'}${m.x.toFixed(2)},${m.y.toFixed(2)}` : '?'; }));
  }
  const sceneTouch = await scene();
  console.log(`     the touch: the solver's magnet ${early.join(' ')}; ${fmtScene(sceneBefore, sceneTouch)}`);
  console.log(`     STEP at the touch ${await page.evaluate(() => JSON.stringify(window.chromaglassDebug().fluids?.[0]?.lastStep ?? null))}`);
  const brought = await phase(firstAt, 0.18);
  const laysTouched = await lays();
  const givenPool = await given();
  const share = brought.total > 0 ? brought.near / 1e4 / brought.total : 0;
  check('held over poured ferrofluid, the Magnet draws it and adds none',
    !!firstAt && livePoured === true && Math.abs(poured.total / POOL - 1) < 0.2 && laysTouched === laysBefore
      && Math.abs(brought.total / poured.total - 1) < 0.08 && share > 0.6 && givenPool.amount === 0.6,
    `poured ${(poured.total * 100).toFixed(2)}% of the plate (asked ${(POOL * 100).toFixed(2)}%); held over it ${(brought.total * 100).toFixed(2)}%, ` +
    `${(share * 100).toFixed(0)}% of it within 0.18 of the hand; laid as a look's ${laysBefore} → ${laysTouched} times; Ferrofluid 0 → ${givenPool.amount}`);

  /*
    3, on. The drag, from that touch on without letting go: the pool goes
    with the hand. The hand's path sampled (magnetHand) as it goes, and the
    pool's centre of mass asked to have come at least half way from where
    it was laid to where the hand ends, nearer the hand than the hand's
    mirror across the plate's middle row (a plate drawn upside down against
    the solver, or a pointer mapping flipped, would put it there), and half
    of it within 0.18 of the hand. With the plate's own turning and currents
    held still above, a pool the magnet does not carry stays where it was
    laid: 0 of the way.

    A pool laid again is not a pool carried: one laid afresh (a look's
    pour, phaseLays) would put ferrofluid where the drag did not. So the
    counter is asked to be as it was at the first touch.

    In the lab (scripts/lab.mjs, Classic's settings, 256², the hand's
    magnet at Size 0.5) a pool laid at 0.30 and dragged 0.3 across over
    three and a half seconds ended with its centre at 0.58, the magnet at
    0.60: 93% of the way.

    On one grid, pinned above (sim=256), and asked: the quality governor
    moving the grid gives the plate a new solver (CI: "44% kept" once, which
    is (256/384)²: a grid change, not a leak).

    From near the canvas's left edge to three quarters across, about 0.45
    of the plate in a cloud session's mapping (0.05 across read 0.74,0.32
    on the plate, 0.75 across 0.36,0.59), in six seconds.
  */
  const drag0 = await phase(null);
  const sceneDrag = await scene();
  const trail = [];
  const sample = async () => { const h = await page.evaluate(() => window.chromaglassDebug().magnetHand?.()); if (h) trail.push({ x: h.x, y: h.y }); };
  for (let i = 0; i <= 40; i++) {
    await page.mouse.move(...at(0.05 + 0.7 * i / 40));
    await page.waitForTimeout(150);
    if (i % 4 === 0) await sample();
  }
  const hold = [];
  for (let k = 0; k < 12; k++) {
    await page.waitForTimeout(250); await sample();
    hold.push(await page.evaluate(() => { const m = window.chromaglassDebug().magnetNow?.(); return m ? `${m.held ? 'H' : '-'}${m.x.toFixed(2)},${m.y.toFixed(2)}` : '?'; }));
  }
  console.log(`     the solver's magnet through the hold: ${hold.join(' ')}`);
  // The whole step as the solver got it, so the lab can replay it (scripts/lab.mjs).
  console.log(`     STEP ${await page.evaluate(() => JSON.stringify(window.chromaglassDebug().fluids?.[0]?.lastStep ?? null))}`);
  const spot = await page.evaluate(() => window.chromaglassDebug().magnetHand?.());
  const solverMagnet = await page.evaluate(() => window.chromaglassDebug().magnetNow?.());
  console.log(`     through the drag and the hold: ${fmtScene(sceneDrag, await scene())}`);
  const drag1 = await phase(spot ? { x: spot.x, y: spot.y } : null, 0.18);
  const after = { lays: await lays() };
  await page.mouse.up();
  console.log(`     the hand's path: ${trail.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}`);
  console.log(`     the solver's magnet at the end: ${solverMagnet ? `${solverMagnet.x.toFixed(2)},${solverMagnet.y.toFixed(2)} strength ${solverMagnet.strength} height ${solverMagnet.height} ${solverMagnet.held ? 'held' : 'NOT held'}` : 'unknown'}`);
  const sameGrid = drag0.n === drag1.n;
  const from = { x: drag0.x, y: drag0.y }, to = { x: drag1.x, y: drag1.y };
  const way = spot ? Math.hypot(spot.x - from.x, spot.y - from.y) : 0;
  const behind = spot ? Math.hypot(spot.x - to.x, spot.y - to.y) : Infinity;
  const came = way > 0 ? 1 - behind / way : 0;
  const nearEnd = drag1.total > 0 ? drag1.near / 1e4 / drag1.total : 0;
  const mirrored = spot ? Math.hypot(spot.x - to.x, 1 - spot.y - to.y) : 0;
  const once = after.lays === laysBefore;
  const counts = `laid as a look's ${laysBefore} → ${after.lays} times`;
  check('dragging the Magnet carries its pool with the hand',
    sameGrid && once && !!spot && way > 0.2 && came > 0.5 && behind < mirrored && nearEnd > 0.5,
    `the pool's centre ${from.x.toFixed(2)},${from.y.toFixed(2)} → ${to.x.toFixed(2)},${to.y.toFixed(2)}, the hand ending at ` +
    `${spot ? `${spot.x.toFixed(2)},${spot.y.toFixed(2)}` : 'nowhere'}: ${(came * 100).toFixed(0)}% of the way (${way.toFixed(2)}), ` +
    `${behind.toFixed(2)} from the hand against ${mirrored.toFixed(2)} from its mirror, ${(nearEnd * 100).toFixed(0)}% of it within 0.18 of the hand; ` +
    `${counts}${sameGrid ? '' : `; the grid moved ${drag0.n} → ${drag1.n}`}`);
  /*
    The phase moves in flux form, so its total changes only if something
    lays or takes it: asked with the same counters, since a pool laid again
    holds exactly what the first did and a total alone could not see it.
  */
  const kept = drag1.total / Math.max(1e-6, drag0.total);
  check('and dragging it neither makes nor loses liquid',
    sameGrid && once && Math.abs(kept - 1) < 0.08,
    `kept ${(kept * 100).toFixed(0)}%; ${counts}${sameGrid ? '' : ` (the grid moved ${drag0.n} → ${drag1.n})`}`);
  await page.waitForTimeout(1000);

  /*
    3. Let go, and the magnet stays where the hand left it.

    Reported by the owner: "I don't like how the magnet draws the ferrofluid
    back to the center automatically. I want to just control it with the
    mouse." A quarter of a second after the last touch the solver's magnet
    went back to the look's own place, the middle of the plate on every
    look, and the ferrofluid the drag had carried off flowed back after it.

    The look's magnet is put first in the far corner from where the hand
    will be, so a magnet gone home cannot pass by landing near the hand:
    the drag above ends wherever the pointer mapping puts 0.85 across, which
    read 0.43,0.58 in a cloud session, 0.1 from the middle. And the check
    first asks that the solver really has the magnet in that corner, so a
    settings write that never reached it cannot pass either. Then the hand
    presses the magnet down there, holds it, lets go, and two seconds on the
    check asks what the solver was given: the lead plate's last step, not
    the hand (which the fix does not change and always said the right
    place), and not magnetNow, which is bookkeeping written beside the step
    and could say the right place while the step said another.

    Once let go it is the look's magnet, left where the hand put it: the
    look's own strength and height, not the hand's firm, low pull, which is
    the hand pressing it up to the glass.
  */
  const clamp = (v) => Math.max(0.05, Math.min(0.95, v));
  /** What the lead plate's solver was last given, and what the look alone would give it. */
  const readStep = () => page.evaluate(() => {
    const d = window.chromaglassDebug(), st = d.fluids?.[0]?.lastStep, s = d.settings, m = d.magnetNow?.();
    if (!st) return null;
    return {
      x: st.magnetX, y: st.magnetY, strength: st.magnetStrength, height: st.magnetHeight, radius: st.magnetRadius ?? null, held: !!m?.held,
      lookStrength: Math.max(0, s.magnetStrength ?? 0),
      lookHeight: Math.max(0.02, (s.magnetHeight ?? 0.25) * (0.5 + (s.phaseScale ?? 0.4))),
      // Magnet Size's factor (lib/magnetSize.ts): what the hand set down is sized by it, the look's own magnet is not.
      k: 2 ** (2 * Math.max(0, Math.min(1, s.magnetSize ?? 0.5)) - 1),
    };
  });
  const fmt = (m) => m ? `${m.x.toFixed(2)},${m.y.toFixed(2)} strength ${m.strength.toFixed(2)} height ${m.height.toFixed(3)} radius ${m.radius?.toFixed(3) ?? 'none'}${m.held ? ' (held)' : ''}` : 'unknown';
  /*
    The look's magnet, as the look alone gives it, or (sized) as the hand
    set it down at Magnet Size: the look's strength and height, a magnet k
    times the tool's own radius (MAGNET_RADIUS, 0.05; PLAN 9v). The check
    runs at Size 0.9 (k = 1.74), so a set-down magnet that ignored the size,
    or a look's own that took it, fails here.
  */
  const asLook = (m, sized = false) => !!m && !m.held
    && Math.abs(m.strength - m.lookStrength) < 1e-3
    && Math.abs(m.height - m.lookHeight) < 1e-3
    && m.radius !== null && Math.abs(m.radius - 0.05 * (sized ? m.k : 1)) < 1e-4;
  await page.mouse.move(...at(0.85));
  const probe = await page.evaluate(() => window.chromaglassDebug().magnetHand?.());
  const corner = { x: (probe?.x ?? 0.5) > 0.5 ? 0.1 : 0.9, y: (probe?.y ?? 0.5) > 0.5 ? 0.1 : 0.9 };
  await page.evaluate((c) => Object.assign(window.chromaglassDebug().settings, { magnetX: c.x, magnetY: c.y }), corner);
  await page.waitForTimeout(1000);
  const home = await readStep();
  check('the look\'s own magnet is where the check put it, in the far corner',
    asLook(home) && Math.hypot(home.x - corner.x, home.y - corner.y) < 0.02,
    `asked for ${corner.x},${corner.y}; the solver was given ${fmt(home)}`);
  await page.mouse.down();
  await page.waitForTimeout(1000);
  const left = await page.evaluate(() => window.chromaglassDebug().magnetHand?.());
  await page.mouse.up();
  await page.waitForTimeout(2000);
  const letGo = await readStep();
  const away = left && home ? Math.hypot(clamp(left.x) - home.x, clamp(left.y) - home.y) : 0;
  const off = left && letGo ? Math.hypot(letGo.x - clamp(left.x), letGo.y - clamp(left.y)) : Infinity;
  /*
    And it is a magnet, not just a place: on a look with no magnet of its
    own, the hand's first hold gives the look one (onMagnetInHand), so the
    one set down has strength. Since the Magnet stopped bringing a magnet
    when picked (1b), a hold that failed to give it one would leave the
    look's strength at 0, and the step at 0 too, which asLook alone passes.
  */
  check('let go of, the magnet stays where the hand left it',
    away > 0.3 && asLook(letGo, true) && off < 0.02 && letGo.strength > 0 && letGo.k > 1.5,
    `the hand left it at ${left ? `${left.x.toFixed(2)},${left.y.toFixed(2)}` : 'nowhere'}, ${away.toFixed(2)} from the look's; ` +
    `two seconds after letting go the solver was given ${fmt(letGo)} (the look alone: strength ${letGo?.lookStrength.toFixed(2)} height ${letGo?.lookHeight.toFixed(3)}; at Magnet Size ×${letGo?.k.toFixed(2)}: radius ${(letGo ? 0.05 * letGo.k : 0).toFixed(3)})`);

  /*
    4. And the look can still place it. Magnet Across moved (the slider, a
    fader, a patch) takes the magnet from where the hand left it, so the
    sliders are not dead once the tool has been used. This passed before the
    fix too, by design; it is here so the fix cannot make the sliders dead.
    The y term is what lets it fail: across can land near where the hand
    left the magnet, but the corner's y is on the other side of the middle
    from the hand's, so a magnet still at the hand is 0.4 off in y at least.
  */
  const across = corner.x > 0.5 ? 0.3 : 0.7;
  await page.evaluate((x) => { window.chromaglassDebug().settings.magnetX = x; }, across);
  await page.waitForTimeout(1000);
  const placed = await readStep();
  check('moving Magnet Across takes it from where the hand left it',
    asLook(placed) && Math.abs(placed.x - across) < 0.02 && Math.abs(placed.y - corner.y) < 0.02,
    `Magnet Across ${corner.x} → ${across}; the solver was given ${fmt(placed)}`);

  /*
    6. Magnet Size, asked for by the owner: "I just want a magnet that I can
    control the size of that I can interact with." A magnet k times the size
    is a magnet k times as wide held at the same gap, with the same strength
    (lib/magnetSize.ts and gpu/wgsl/magnetDisc.ts, where the physics is;
    PLAN 9v: until then a dipole k times deeper with k³ the strength). Asked
    of the step the solver was given while the hand holds the magnet, at
    Size 0.1 and 0.9 (k = 0.574 and 1.741): the radius's ratio k, the
    height's and the strength's 1. A Size that never reached the solver
    gives a radius ratio of 1; one that still sank the magnet, a height's
    of k.

    Set the way a hand sets it on the desk: right-click the Magnet for its
    options and move Size there (ToolAmount.tsx), then read back what the
    app holds. So the desk's control is asked too, and the size is the
    app's own setting rather than a write into the settings the app hands
    the visualizer, which the next render can replace.
  */
  const setSize = async (v) => {
    await page.getByTestId('tool-segmented-magnet').click({ button: 'right' });
    await page.getByTestId('tool-options-size').fill(String(v));
    await page.mouse.click(5, 5);
    await page.waitForTimeout(300);
    return page.evaluate(() => window.chromaglassDebug().settings?.magnetSize ?? null);
  };
  const sizes = [];
  const heldAt = async (size) => {
    sizes.push(await setSize(size));
    await page.mouse.move(...at(0.5));
    await page.mouse.down();
    await page.waitForTimeout(800);
    const m = await readStep();
    await page.mouse.up();
    await page.waitForTimeout(300);
    return m;
  };
  const small = await heldAt(0.1), big = await heldAt(0.9);
  const k = 2 ** (2 * 0.9 - 1) / 2 ** (2 * 0.1 - 1);
  const ratio = (key) => small && big && small[key] ? big[key] / small[key] : 0;
  const rRatio = ratio('radius'), hRatio = ratio('height'), sRatio = ratio('strength');
  check('Magnet Size makes the held magnet a wider one at the same gap and strength',
    sizes[0] === 0.1 && sizes[1] === 0.9 && !!small?.held && !!big?.held && Math.abs(rRatio / k - 1) < 0.01 && Math.abs(hRatio - 1) < 0.01 && Math.abs(sRatio - 1) < 0.01,
    `set from the desk's Magnet options: ${sizes.join(', then ')}; held at Size 0.1: ${fmt(small)}; at 0.9: ${fmt(big)}; radius ×${rRatio.toFixed(3)} (asked ×${k.toFixed(3)}), height ×${hRatio.toFixed(3)} and strength ×${sRatio.toFixed(3)} (asked ×1)`);

  /*
    7. A new grid while the Magnet is in hand lays nothing on a bare plate.

    The quality governor moves the solver to another grid when the machine
    falls behind, and a new solver is given the ferrofluid again (the frame
    loop's phaseSolverRef). Before 9x that lay was the look's ring: main's
    old check of the ring read "the ferrofluid was laid again (lays 1 → 2,
    grid 384 → 256) while the middle was watched" on another PR's run, the
    governor stepping down and pouring the ring afresh. The pick pours
    nothing now, so the same path must lay nothing on an untouched plate:
    never the ring, never the magnet under the middle.

    And nothing with the magnet held there either. The new solver's lay
    pours the look's ring whenever Ferrofluid is up, so a hold that turned
    Ferrofluid up over a bare plate would have the governor pour it; and
    from 9x until the owner's "it should only work on ferrofluid that is
    already there", a new solver was given the magnet's own pool again at
    the magnet. Both are the magnet adding ferrofluid.

    Its own page, because the drag above pins its grid (sim=256) to keep the
    governor still, and a pinned grid turns the governor off. Here the
    governor is on and held on one rung (rung=2, 512² at one device pixel)
    so it neither climbs nor falls on its own, and it is stepped down on
    purpose (stepDownFrames, the same door crash.mjs uses for S3; a lost
    rung is never climbed back to) until the lead solver really is a new
    size: 512² for the untouched plate, 384² for the held one. Opened at
    gpu=mid's own 384² the second step had nowhere to go but 256², the
    bottom, and the first page is closed so its show is not drawing on the
    same GPU meanwhile.
  */
  await page.close();
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page2.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page2.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic&rung=2&set=magnetSize=0.9${engineQuery()}`, { waitUntil: 'load' });
  await page2.waitForTimeout(9000);
  const counts2 = () => page2.evaluate(() => {
    const d = window.chromaglassDebug(), st = d.fluids?.[0]?.lastStep;
    return {
      grid: d.fluids?.[0]?.gpu?.N ?? 0, lays: d.phaseLays?.() ?? -1, live: d.phaseState?.()?.live ?? null, amount: d.settings?.phaseAmount ?? 0,
      strength: st ? +st.magnetStrength : null, magnets: d.magnets?.().length ?? null, governed: !!d.status?.governed,
    };
  });
  const phase2 = (at = null, reach = 0.18) => page2.evaluate(async ({ at, reach }) => {
    const f = await window.chromaglassDebug().readPhase();
    if (!f) return { total: -1, x: 0, y: 0, near: 0, n: 0 };
    const { n, data } = f;
    let total = 0, cx = 0, cy = 0, near = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = data[x + y * n];
      total += v; cx += v * (x / n); cy += v * (y / n);
      if (at && Math.hypot((x + 0.5) / n - at.x, (y + 0.5) / n - at.y) < reach) near += v;
    }
    return { total: total / (n * n), x: total ? cx / total : 0, y: total ? cy / total : 0, near: total ? near / total : 0, n };
  }, { at, reach });
  /**
   * Step the governor down until the lead solver is on a new grid: the grids
   * it went through, and whether it got there (a solver, of another size: a
   * moment with none between two of the same size is not a new grid).
   */
  const newGrid = async () => {
    const from = (await counts2()).grid, seen = [from];
    for (let i = 0; i < 4; i++) {
      await page2.evaluate(() => window.chromaglassDebug().stepDownFrames(1));
      await page2.waitForTimeout(2500);
      const g = (await counts2()).grid;
      if (g !== seen[seen.length - 1]) seen.push(g);
      if (g > 0 && from > 0 && g !== from) return { seen, moved: true };
    }
    return { seen, moved: false };
  };
  const bare = await phase2();
  await page2.mouse.click(5, 5);
  await page2.keyboard.press('m');
  await page2.waitForTimeout(1500);
  const picked2 = await counts2();
  const grids1 = await newGrid();
  await page2.waitForTimeout(3000);
  const regrid1 = await counts2(), plate1 = await phase2();
  check('a new grid with the Magnet picked and untouched lays nothing: no ring, no magnet under the middle',
    grids1.moved && grids1.seen[0] === 512 && picked2.lays >= 0
      && regrid1.lays === picked2.lays && regrid1.live === false
      && regrid1.strength === 0 && regrid1.magnets === 0 && plate1.total >= 0 && plate1.total <= Math.max(0, bare.total) + 0.001,
    `grid ${grids1.seen.join(' → ')}² (governed ${regrid1.governed}); laid ${picked2.lays} → ${regrid1.lays} times, in the solver: ${regrid1.live}; ` +
    `the step's magnet strength ${regrid1.strength}, ${regrid1.magnets} magnets; ` +
    `ferrofluid ${(bare.total * 100).toFixed(2)}% of the plate before, ${(plate1.total * 100).toFixed(2)}% after`);

  /*
    Then held on the bare plate, off the middle, and the governor stepped
    down again under the hand. The hold has given the look its magnet
    (asked, so a hold that never reached the app cannot pass), and nothing
    else: no lay, nothing in the solver, Ferrofluid still down, and the
    plate as bare as it was.
  */
  const box2 = await (await page2.$('canvas')).boundingBox();
  await page2.mouse.move(box2.x + box2.width * 0.2, box2.y + box2.height * 0.5);
  await page2.mouse.down();
  await page2.waitForTimeout(1500);
  const touched2 = await counts2();
  const grids2 = await newGrid();
  await page2.waitForTimeout(2000);
  const hand2 = await page2.evaluate(() => window.chromaglassDebug().magnetHand?.());
  const regrid2 = await counts2(), plate2 = await phase2();
  const strength2 = await page2.evaluate(() => window.chromaglassDebug().settings?.magnetStrength ?? 0);
  await page2.mouse.up();
  check('and held on the bare plate, a new grid still lays nothing: no ring, no pool of the magnet\'s own',
    grids2.moved && !!hand2 && strength2 === 0.8 && touched2.lays === picked2.lays && regrid2.lays === picked2.lays
      && touched2.live === false && regrid2.live === false && regrid2.amount <= 0.002
      && plate2.total >= 0 && plate2.total <= Math.max(0, bare.total) + 0.001,
    `grid ${grids2.seen.join(' → ')}² with the hand at ${hand2 ? `${hand2.x.toFixed(2)},${hand2.y.toFixed(2)}` : 'nowhere'}; Magnet Strength ${strength2}; ` +
    `laid ${picked2.lays} → ${touched2.lays} → ${regrid2.lays} times; in the solver: ${touched2.live}, then ${regrid2.live}; Ferrofluid ${regrid2.amount}; ` +
    `ferrofluid ${(bare.total * 100).toFixed(2)}% of the plate before, ${(plate2.total * 100).toFixed(2)}% after`);
} finally {
  await browser.close();
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
