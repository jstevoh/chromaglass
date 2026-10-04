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
 * the ferrofluid behind, and on a look without ferrofluid it did nothing at
 * all. So this goes the way a visitor does, through the keyboard and the
 * mouse, on a look that has no ferrofluid of its own:
 *
 *   1. picking the Magnet changes nothing on the plate: no ferrofluid
 *      poured and no magnet under it until a hand holds it (the owner's
 *      "immediate big black hole in the middle when I select it", and then
 *      "Magnet still makes a giant black hole as soon as you pick it")
 *   2. the first touch brings the ferrofluid: a pool under the hand, as big
 *      as Magnet Size, and nothing poured anywhere else
 *   3. dragging it across the plate carries that pool with the hand, and
 *      neither makes nor loses liquid
 *   4. let go of, it stays where the hand left it, rather than going back
 *      to the middle and taking the ferrofluid with it
 *   5. and Magnet Across still moves it once the hand has set it down
 *   6. Magnet Size reaches the solver: a bigger magnet is the same field
 *      reaching further (lib/magnetSize.ts), k times deeper with k³ the
 *      strength, so the spikes over it start where they did
 *   7. a new grid (the quality governor stepping down) with the Magnet in
 *      hand lays nothing on an untouched plate, and only the hand's pool,
 *      at the magnet, once it has brought one: never the look's ring again
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
    grid gives the plate a new solver, which lays the Magnet's pool again
    where the magnet is, and a pool laid again at the hand reads as one
    carried there. Counted too (magnetRelays), so it cannot pass if it
    happens anyway. And at Magnet Size 0.9 from the load (set=, which a look
    change keeps: it is the performer's, RIG_KEYS), so the pool the first
    touch brings is a size the tool's own size would not give.
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
  const pools = () => page.evaluate(() => window.chromaglassDebug().magnetPools?.() ?? -1);
  const relays = () => page.evaluate(() => window.chromaglassDebug().magnetRelays?.() ?? -1);
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
    2. The first touch brings the ferrofluid: one pool, under the hand, as
    big as Magnet Size.

    Where the hand is, read from the app while it holds (magnetHand). The
    touch is near the canvas's left edge, so the hand is well off the
    middle, and that is asked (0.2 at least), or a pool laid at the look's
    magnet, the middle, would sit near enough the hand to pass. At Size 0.9
    the pool is 0.09 × 2^0.8 = 0.157 in radius (lib/magnetSize.ts) and
    holds 0.9 πr²/2 = 3.47% of the plate: asked within a fifth either way,
    which neither the tool's own size (1.15%) nor the look's ring (22%)
    meets, and most of it within 0.18 of the hand. Told once
    (magnetPools), and not laid as a look's ferrofluid (phaseLays, which
    clears what is there and pours the ring). And drawn: the app turns
    Ferrofluid up to 0.6 with the hold and gives the look its magnet (0.8),
    or the pool is in the solver and invisible on the plate.
  */
  const POOL = 0.9 * Math.PI * (0.09 * 2 ** 0.8) ** 2 / 2;
  /*
    What the plate is doing round the touch, printed and not asked: on one
    Mac run the pool's centre sat 0.11 off the hand 1.5 s after the touch
    (85% of it within 0.18, against 100% on the run before) and the drag
    then left it behind, while the lab replaying that run's own step (its
    STEP line, magnet, hand path and pool, 256²) kept it on the hand and
    carried it 90% of the way, 87% with the pool started 0.11 off, on a
    bare plate and on a dyed one alike. So whatever moved it is in the app
    and not in the step: these say which, the next time it happens. The
    pool where it was laid, a fifth of a second after the touch; the
    solver's magnet through the first second and a half; the plate's turn
    and spin; the steps the solver took; and the automation's own hands.
  */
  const scene = () => page.evaluate(() => {
    const d = window.chromaglassDebug(), f = d.fluids?.[0];
    return { angle: d.rotation?.current?.[0] ?? null, spin: d.spin?.current?.[0] ?? null, steps: f?.stepCount ?? null, auto: { ...(d.autoEvents ?? {}) }, at: performance.now() };
  });
  const sceneBefore = await scene();
  await page.mouse.move(...at(0.05));
  await page.mouse.down();
  await page.waitForTimeout(200);
  const laid = await phase(null);
  const laidHand = await page.evaluate(() => window.chromaglassDebug().magnetHand?.());
  const early = [];
  for (let k = 0; k < 5; k++) {
    await page.waitForTimeout(260);
    early.push(await page.evaluate(() => { const m = window.chromaglassDebug().magnetNow?.(); return m ? `${m.held ? 'H' : '-'}${m.x.toFixed(2)},${m.y.toFixed(2)}` : '?'; }));
  }
  const sceneTouch = await scene();
  const fmtScene = (a, b) => `the plate turned ${a.angle !== null && b.angle !== null ? (b.angle - a.angle).toFixed(4) : '?'} rad (spin ${b.spin !== null ? b.spin.toFixed(4) : '?'} rad/s), ` +
    `${a.steps !== null && b.steps !== null ? b.steps - a.steps : '?'} solver steps in ${((b.at - a.at) / 1000).toFixed(1)} s, automation ${JSON.stringify(a.auto)} → ${JSON.stringify(b.auto)}`;
  console.log(`     the touch: the pool laid with its centre at ${laid.x.toFixed(2)},${laid.y.toFixed(2)} (${(laid.total * 100).toFixed(2)}%), the hand at ${laidHand ? `${laidHand.x.toFixed(2)},${laidHand.y.toFixed(2)}` : 'nowhere'}; ` +
    `the solver's magnet ${early.join(' ')}; ${fmtScene(sceneBefore, sceneTouch)}`);
  console.log(`     STEP at the touch ${await page.evaluate(() => JSON.stringify(window.chromaglassDebug().fluids?.[0]?.lastStep ?? null))}`);
  const first = await page.evaluate(() => window.chromaglassDebug().magnetHand?.());
  const firstAt = first ? { x: Math.max(0.05, Math.min(0.95, first.x)), y: Math.max(0.05, Math.min(0.95, first.y)) } : null;
  const brought = await phase(firstAt, 0.18);
  const pooled = await pools(), laysTouched = await lays();
  const given = await page.evaluate(() => { const s = window.chromaglassDebug().settings ?? {}; return { amount: s.phaseAmount, strength: s.magnetStrength, size: s.magnetSize }; });
  const share = brought.total > 0 ? brought.near / 1e4 / brought.total : 0;
  const offMiddle = firstAt ? Math.hypot(firstAt.x - 0.5, firstAt.y - 0.5) : 0;
  check('the first touch brings one pool of ferrofluid, under the hand, as big as Magnet Size, and draws it',
    !!firstAt && offMiddle > 0.2 && pooled === 1 && laysTouched === laysBefore
      && Math.abs(brought.total / POOL - 1) < 0.2 && share > 0.6 && given.amount === 0.6 && given.strength === 0.8,
    `the hand at ${firstAt ? `${firstAt.x.toFixed(2)},${firstAt.y.toFixed(2)}` : 'nowhere'}, ${offMiddle.toFixed(2)} off the middle; ` +
    `${(brought.total * 100).toFixed(2)}% of the plate (one pool at Size ${given.size}: ${(POOL * 100).toFixed(2)}%), ${(share * 100).toFixed(0)}% of it within 0.18 of the hand; ` +
    `pools brought ${pooled}, laid as a look's ${laysBefore} → ${laysTouched} times; Ferrofluid ${given.amount}, Magnet Strength ${given.strength}`);

  /*
    3. The drag, from that first touch on without letting go: the pool goes
    with the hand. The hand's path sampled (magnetHand) as it goes, and the
    pool's centre of mass asked to have come at least half way from where
    it was laid to where the hand ends, nearer the hand than the hand's
    mirror across the plate's middle row (a plate drawn upside down against
    the solver, or a pointer mapping flipped, would put it there), and half
    of it within 0.18 of the hand. With the plate's own turning and currents
    held still above, a pool the magnet does not carry stays where it was
    laid: 0 of the way.

    A pool laid again is not a pool carried: one laid afresh under the hand
    (a clear, then the next hold's pool) or given again to a new solver at
    the magnet (magnetRelays) would land at the end point at once. So the
    counters are asked to be as they were at the first touch.

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
  const relays0 = await relays();
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
  const after = { pools: await pools(), lays: await lays(), relays: await relays() };
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
  const once = after.pools === 1 && after.lays === laysBefore && after.relays === relays0;
  const counts = `pools brought ${after.pools}, laid as a look's ${laysBefore} → ${after.lays}, given again to a new solver ${relays0} → ${after.relays}`;
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
      x: st.magnetX, y: st.magnetY, strength: st.magnetStrength, height: st.magnetHeight, held: !!m?.held,
      lookStrength: Math.max(0, s.magnetStrength ?? 0),
      lookHeight: Math.max(0.02, (s.magnetHeight ?? 0.25) * (0.5 + (s.phaseScale ?? 0.4))),
      // Magnet Size's factor (lib/magnetSize.ts): what the hand set down is sized by it, the look's own magnet is not.
      k: 2 ** (2 * Math.max(0, Math.min(1, s.magnetSize ?? 0.5)) - 1),
      heightAsked: (s.magnetHeight ?? 0.25) * (0.5 + (s.phaseScale ?? 0.4)),
    };
  });
  const fmt = (m) => m ? `${m.x.toFixed(2)},${m.y.toFixed(2)} strength ${m.strength.toFixed(2)} height ${m.height.toFixed(3)}${m.held ? ' (held)' : ''}` : 'unknown';
  /*
    The look's magnet, as the look alone gives it, or (sized) as the hand
    set it down at Magnet Size: k³ the strength and k times the height. The
    check runs at Size 0.9 (k = 1.74), so a set-down magnet that ignored the
    size, or a look's own that took it, fails here.
  */
  const asLook = (m, sized = false) => !!m && !m.held
    && Math.abs(m.strength - m.lookStrength * (sized ? m.k ** 3 : 1)) < 1e-3
    && Math.abs(m.height - (sized ? Math.max(0.02, m.heightAsked * m.k) : m.lookHeight)) < 1e-3;
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
    `two seconds after letting go the solver was given ${fmt(letGo)} (the look alone: strength ${letGo?.lookStrength.toFixed(2)} height ${letGo?.lookHeight.toFixed(3)}; at Magnet Size ×${letGo?.k.toFixed(2)}: strength ${(letGo ? letGo.lookStrength * letGo.k ** 3 : 0).toFixed(2)} height ${(letGo ? letGo.heightAsked * letGo.k : 0).toFixed(3)})`);

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
    is the same field over it reaching k times as far: k times deeper with k³
    the strength (lib/magnetSize.ts, where the physics is). Asked of the
    step the solver was given while the hand holds the magnet, at Size 0.1
    and 0.9 (k = 0.574 and 1.741): the height's ratio k, the strength's k³,
    and the spikes over it (spikesOnAxis: strength over height cubed) where
    they were. A Size that never reached the solver gives ratios of 1.

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
  const hRatio = small && big ? big.height / small.height : 0, sRatio = small && big ? big.strength / small.strength : 0;
  check('Magnet Size makes the held magnet reach further with the same field over it',
    sizes[0] === 0.1 && sizes[1] === 0.9 && !!small?.held && !!big?.held && Math.abs(hRatio / k - 1) < 0.01 && Math.abs(sRatio / (k ** 3) - 1) < 0.01,
    `set from the desk's Magnet options: ${sizes.join(', then ')}; held at Size 0.1: ${fmt(small)}; at 0.9: ${fmt(big)}; height ×${hRatio.toFixed(3)} (asked ×${k.toFixed(3)}), strength ×${sRatio.toFixed(3)} (asked ×${(k ** 3).toFixed(3)})`);

  /*
    7. A new grid while the Magnet is in hand lays only what the hand brought.

    The quality governor moves the solver to another grid when the machine
    falls behind, and a new solver is given the ferrofluid again (the frame
    loop's phaseSolverRef). Before 9x that lay was the look's ring: main's
    old check of the ring read "the ferrofluid was laid again (lays 1 → 2,
    grid 384 → 256) while the middle was watched" on another PR's run, the
    governor stepping down and pouring the ring afresh. The pick pours
    nothing now, so the same path must lay nothing on an untouched plate,
    and only the pool, at the magnet, once a hand has brought one: never the
    ring, never the magnet under the middle, and not a second pool beside
    the one carried across (the held magnet's own pour asks whether the
    solver has a phase, which the carry has given it by then).

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
      grid: d.fluids?.[0]?.gpu?.N ?? 0, lays: d.phaseLays?.() ?? -1, pools: d.magnetPools?.() ?? -1, relays: d.magnetRelays?.() ?? -1,
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
    grids1.moved && grids1.seen[0] === 512 && picked2.lays >= 0 && picked2.relays >= 0
      && regrid1.lays === picked2.lays && regrid1.pools === 0 && regrid1.relays === picked2.relays
      && regrid1.strength === 0 && regrid1.magnets === 0 && plate1.total >= 0 && plate1.total <= Math.max(0, bare.total) + 0.001,
    `grid ${grids1.seen.join(' → ')}² (governed ${regrid1.governed}); laid ${picked2.lays} → ${regrid1.lays} times, ${regrid1.pools} pools, ` +
    `carried ${picked2.relays} → ${regrid1.relays}; the step's magnet strength ${regrid1.strength}, ${regrid1.magnets} magnets; ` +
    `ferrofluid ${(bare.total * 100).toFixed(2)}% of the plate before, ${(plate1.total * 100).toFixed(2)}% after`);

  // Still, for the same reasons as the drag above: the carry goes where the magnet is.
  await page2.evaluate(() => {
    const d = window.chromaglassDebug();
    Object.assign(d.settings, {
      rotationSpeed: 0, audioMappings: { ...(d.settings.audioMappings ?? {}), rotation: 'none' },
      turbulenceScale: 0, audioImpact: 0, plateRock: 0, beatSqueeze: 0, buoyancy: 0, globalSpeed: 0.025,
    });
  });
  const box2 = await (await page2.$('canvas')).boundingBox();
  await page2.mouse.move(box2.x + box2.width * 0.42, box2.y + box2.height * 0.5);
  await page2.mouse.down();
  await page2.waitForTimeout(1500);
  const touched2 = await counts2();
  const poured2 = await page2.evaluate(() => window.chromaglassDebug().magnetHand?.());
  /*
    Then moved, held, out from the middle, so the magnet is no longer where
    the pool was poured: a carry laid at the pool's first place rather than
    at the magnet reads under 0.7 near the hand, since the new solver starts
    with no phase of its own. Outward, and asked of the plate (how far the
    hand went, and how far from the middle it ended), because the canvas is
    not the plate: the first Mac run moved 0.2 of the canvas from 0.25 and
    the plate's hand ended at 0.46,0.51, 0.04 from the middle, where a ring
    laid round the middle would have read as near the hand too. That run
    carried one pool, all of it (1.00), 100% at the hand.
  */
  for (let i = 1; i <= 15; i++) {
    await page2.mouse.move(box2.x + box2.width * (0.42 - 0.02 * i), box2.y + box2.height * 0.5);
    await page2.waitForTimeout(60);
  }
  await page2.waitForTimeout(500);
  const grids2 = await newGrid();
  await page2.waitForTimeout(2000);
  const hand2 = await page2.evaluate(() => window.chromaglassDebug().magnetHand?.());
  const handAt = hand2 ? { x: Math.max(0.05, Math.min(0.95, hand2.x)), y: Math.max(0.05, Math.min(0.95, hand2.y)) } : null;
  const regrid2 = await counts2(), plate2 = await phase2(handAt);
  await page2.mouse.up();
  const offMiddle2 = handAt ? Math.hypot(handAt.x - 0.5, handAt.y - 0.5) : 0;
  const movedBy = handAt && poured2 ? Math.hypot(handAt.x - poured2.x, handAt.y - poured2.y) : 0;
  const ofPool = plate2.total / POOL;
  check('and once the hand has brought its pool, a new grid carries that pool to the magnet and nothing else',
    grids2.moved && touched2.pools === 1 && regrid2.pools === 1 && regrid2.lays === picked2.lays && regrid2.relays === touched2.relays + 1
      && ofPool > 0.5 && ofPool < 1.6 && plate2.near > 0.7 && offMiddle2 > 0.15 && movedBy > 0.12,
    `grid ${grids2.seen.join(' → ')}²; ${touched2.pools} pool from the touch, ${regrid2.pools} after; laid ${picked2.lays} → ${regrid2.lays} times; ` +
    `carried ${touched2.relays} → ${regrid2.relays}; ferrofluid ${(plate2.total * 100).toFixed(2)}% of the plate, ${ofPool.toFixed(2)} of the pool's ` +
    `(the ring is about 22%), ${(100 * plate2.near).toFixed(0)}% of it within 0.18 of the hand at ${handAt ? `${handAt.x.toFixed(2)},${handAt.y.toFixed(2)}` : 'nowhere'}, ` +
    `${offMiddle2.toFixed(2)} from the middle and ${movedBy.toFixed(2)} from where the pool was poured (${poured2 ? `${poured2.x.toFixed(2)},${poured2.y.toFixed(2)}` : 'unknown'}); centre of mass ${plate2.x.toFixed(2)},${plate2.y.toFixed(2)}`);
} finally {
  await browser.close();
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
