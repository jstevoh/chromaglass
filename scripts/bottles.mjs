#!/usr/bin/env node
/**
 * Does every tool that lays liquid lay the liquid in the bottle, or only its colour?
 *
 *   npm run bottles
 *
 * Found auditing every tool against every liquid (PLAN §15, 2026-09-27):
 * only the Dropper put the picked bottle's liquid on the plate. Pour, Spray,
 * Splat and Streak laid its colour and nothing else, so a Pour with the
 * Ferrofluid bottle was a pool of near-black dye the Magnet could not touch,
 * and Oil was orange water that never became an oil body. The hands that
 * are not the mouse (a replayed take, the pad, OSC) had the same hole in
 * their own copy of the tools, and their Pour still ran downhill.
 *
 * Through the real pointer on the running app, for each laying tool and
 * three bottles, it listens where each liquid reaches the plate:
 *
 *   Ferrofluid  the GPU's second phase (addPhase), near the hand
 *   Oil         the GPU's oil (addMix with oil), near the hand, Oil Bodies on
 *   Soap        the plate's soap field (liquidPhase), near the hand
 *
 * and asks that each tool lays each one, along the stroke: a few calls on
 * mouse-down would not do, so it asks for a steady run of them, the early
 * ones at the start of the stroke and the late ones at its end. It listens
 * at those calls because they carry where each pour landed; it also reads
 * the ferrofluid a Pour laid back off the plate itself. Mac only: the app
 * does not step on a cloud session's software WebGPU, and this says so and
 * stops rather than passing on nothing.
 *
 * The stroke is off the middle, at (0.25, 0.3) to (0.4, 0.3), and nothing
 * may land at its point reflection: a stroke through the centre is its own
 * mirror image, so a flipped coordinate anywhere between the pointer and the
 * field would have passed.
 *
 * Controls, so "laid" is not something the plate does anyway:
 *   - the same tools with Water in the bottle lay no ferrofluid and no oil
 *   - Finger and Blow with Ferrofluid in the bottle lay none (they lay nothing)
 *   - Water in the bottle lays no soap
 *   - a replayed Finger with Ferrofluid in the bottle lays none
 *   - only calls near the hand count: a look's own ferrofluid lands over the
 *     whole plate, and that is not the tool (picking the Ferrofluid bottle
 *     used to lay it; it lays nothing now, the first arm below)
 *   - the grid is pinned (`sim=256`) and every arm asks that the solver it
 *     listened to is still the plate's: a governor that moved the grid would
 *     hand the plate a new solver with no listener on it, and every "lays
 *     none" would pass on an empty log
 *
 * And two things a bottle changes about the dye, per push of the Pour (its
 * push is not scaled by the bottle, so dye per push does not depend on how
 * many steps a stroke got): a Ferrofluid Pour lays a tenth of Water's dye
 * or less (0.05 / 0.8 by design: the plate draws the black itself, and a
 * stain was left behind when the Magnet drew the pool away), and an Oil
 * Pour lays what Water's does.
 *
 * The other hands: a replayed Drop, Pour, Spray, Splat and Streak each lay
 * the Ferrofluid, and a replayed Pour pushes out from where it lands rather
 * than toward the bottom of the plate.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { isGpuEngine } from './frame.mjs';

const PORT = 4351;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
  // The grid pinned: a governor that moved it would lay a new solver under the listeners.
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic&sim=256`, { waitUntil: 'load' });
  await page.waitForTimeout(8000);

  // A slow adapter takes longer than a runner to open the stage.
  let engine = null;
  for (let k = 0; k < 10 && !isGpuEngine(engine); k++) {
    engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
    if (!isGpuEngine(engine)) await page.waitForTimeout(2000);
  }
  check('the GPU solver is the one being measured', isGpuEngine(engine), engine ?? 'no debug hook');
  if (!isGpuEngine(engine)) process.exit(1);
  const fresh = await page.evaluate(() => ['chromaglassLiquid', 'chromaglassTool', 'chromaglassSettings', 'chromaglassAction'].every((k) => typeof window[k] === 'function')
    && typeof window.chromaglassDebug().gesture === 'function' && typeof window.chromaglassDebug().tool === 'function');
  check('the page is running the build that was just made', fresh, fresh ? 'bottle, tool, gesture hooks present' : 'stale bundle');
  if (!fresh) process.exit(1);
  // The lead plate's solver is attached a moment after the stage reports.
  let solver = false;
  for (let k = 0; k < 15 && !solver; k++) {
    solver = await page.evaluate(() => !!window.chromaglassDebug().fluids?.[0]?.gpu);
    if (!solver) await page.waitForTimeout(1000);
  }
  /*
    And it steps. Software WebGPU opens the stage and attaches a solver but
    never steps the app's plate (CLAUDE.md), and every arm would then read
    nothing: say so and stop, rather than print a column of zeros.
  */
  const stepAt = () => page.evaluate(() => window.chromaglassDebug().fluids?.[0]?.stepIndex ?? -1);
  const s0 = await stepAt(); await page.waitForTimeout(1500); const s1 = await stepAt();
  const steps = solver && s1 > s0 && s0 >= 0;
  check('the lead plate has its GPU solver, and it steps', steps,
    !solver ? 'no solver after 15 s' : steps ? `${s1 - s0} steps in 1.5 s` : `stepIndex ${s0} → ${s1}: this adapter cannot run the app, use the Mac`);
  if (!steps) process.exit(1);

  // A calm plate, with Oil Bodies on so an oil pour has a body to become, and
  // no drop height, so the Dropper lays every step as the others do.
  const calm = () => page.evaluate(() => { window.chromaglassSettings({
    rotationSpeed: 0, turbulenceScale: 0, audioImpact: 0, plateRock: 0, beatSqueeze: 0, buoyancy: 0,
    rainDrip: 0, glassSmear: 0, vibrationFrequency: 0, centerGravity: 0, bubbles: 0, beads: 0, automateRate: 0,
    dropHeight: 0, oilTension: 0.6, oilBodies: 1, surfactantFlow: 0.5,
    audioMappings: { velocity: 'none', density: 'none', color: 'none', rotation: 'none' }
  }); window.__bottleTest = true; });
  await calm();
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const screen = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  const settle = (ms) => page.waitForTimeout(ms);

  /*
    The listeners, on the lead plate's solver and on the plate. Every call is
    kept with where it landed, in plate units (0..1), so the counts can be of
    calls near the hand. The flag is on the solver, not the plate: a plate
    keeps its object through a Clear, and it is the solver a governor would
    replace. `same` below asks whether the solver listened to is still the
    plate's.
  */
  const install = () => page.evaluate(() => {
    const f = window.chromaglassDebug().fluids[0];
    const g = f?.gpu;
    if (!g) return false;
    window.__bottleLog ??= { phase: [], oil: [], dye: [], push: [], press: [], squeeze: 0, vy: 0, vabs: 0 };
    const L = f.size;
    if (!f.__bottleSpied) {
      f.__bottleSpied = true;
      /*
        The Pour's dye per push is the hand's Pour's own, two ways.
        What the show lays by itself goes through autoInject (the look laying
        its pools again after a clear, the music's drops, replayed hands), so
        its calls are marked. And the mouse's stir (the canvas's mousemove:
        a shove along each move, for every tool but the Drop and the Finger)
        is a push with no dye, once a move event, while the Pour's is once a
        step: counted in, the ratio read how many steps the runner fitted
        into each move. So every call carries the task it was made in (the
        batch, closed at the next microtask), and only pushes made in a task
        that also laid the hand's dye count. On #210's first run a Water
        Pour read 10.22 where #201's read 9.29 on the same Pour code, and the
        Oil Pour (9.05; 9.17 on #201) went red against the higher one.
      */
      let auto = 0, batch = 0, open = false;
      const task = () => {
        if (!open) { open = true; batch++; queueMicrotask(() => { open = false; }); }
        return batch;
      };
      const autoInject = f.autoInject.bind(f);
      f.autoInject = (...a) => { auto++; try { return autoInject(...a); } finally { auto--; } };
      const addDensity = f.addDensity.bind(f);
      f.addDensity = (x, y, amount, r, g, b, ...rest) => { window.__bottleLog.dye.push({ x: x / L, y: y / L, a: Math.max(0, amount), rgb: [r, g, b], auto: auto > 0, b: task() }); return addDensity(x, y, amount, r, g, b, ...rest); };
      const squeezeOut = f.squeezeOut.bind(f);
      f.squeezeOut = (...a) => { window.__bottleLog.squeeze++; return squeezeOut(...a); };
      const addVelocity = f.addVelocity.bind(f);
      f.addVelocity = (x, y, vx, vy) => {
        const l = window.__bottleLog; const v = Math.hypot(vx, vy);
        l.push.push({ x: x / L, y: y / L, a: v, auto: auto > 0, b: task() }); l.vy += vy; l.vabs += v;
        return addVelocity(x, y, vx, vy);
      };
    }
    if (!g.__bottleSpied) {
      g.__bottleSpied = true;
      window.__bottleGpu = g;
      const addPhase = g.addPhase.bind(g);
      // Where the hand was when each pour was made, for `follows` below.
      g.addPhase = (x, y, r, a) => {
        const p = window.chromaglassDebug().pointer();
        window.__bottleLog.phase.push({ x, y, a, hx: p.x / p.grid, hy: p.y / p.grid });
        return addPhase(x, y, r, a);
      };
      const addMix = g.addMix.bind(g);
      g.addMix = (x, y, r, what) => { if ((what?.oil ?? 0) > 0) window.__bottleLog.oil.push({ x, y, a: what.oil }); return addMix(x, y, r, what); };
      const pressMix = g.pressMix.bind(g);
      g.pressMix = (x, y, r, outer, take) => { window.__bottleLog.press.push({ x, y, r, outer, a: take }); return pressMix(x, y, r, outer, take); };
    }
    window.__soapNear = async (pts, rad) => {
      const gpu = window.chromaglassDebug().fluids[0].gpu;
      const s = gpu ? await gpu.readField('mix') : window.chromaglassDebug().fluids[0].liquid.soap; 
      let t = 0;
      for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
        if (pts.some((p) => Math.hypot(x / L - p[0], y / L - p[1]) < rad)) t += gpu ? s[(x + y * L) * 4 + 1] : s[x + y * L];
      }
      return t;
    };
    return true;
  });
  const clear = async () => {
    await page.evaluate(() => window.chromaglassAction('clear'));
    await settle(1500);
    for (let k = 0; k < 10 && !(await install()); k++) await settle(500);
  };
  const reset = async () => {
    await install();
    await page.evaluate(() => { const l = window.__bottleLog; l.phase = []; l.oil = []; l.dye = []; l.push = []; l.press = []; l.squeeze = 0; l.vy = 0; l.vabs = 0; });
  };

  /*
    What the log holds along a path of points (plate 0..1), and at its point
    reflection. For each kind: how many calls landed within `rad` of the path
    and their summed amount, how many landed within `rad` of the reflected
    path, and whether the calls follow the hand: on average they landed
    where the hand was when they were made (the mean offset from it under
    0.04 of the plate, over every call, not only those near the path), and
    the hand had gone at least a quarter of the way along the path between
    the first quarter of them and the last.

    It read the pours' own places, the first quarter's nearer the start than
    the last quarter's, and went red on Splat once, on a Mac run of #209 (a
    docs-only PR). A Splat lays its liquid with its first droplet, flung 4.5
    to 27 cells from the hand in any direction, on a stroke 29 cells long
    (the grid is 192). A model of that scatter alone makes the old
    comparison flip rarely (0.2% of runs), so the red was more likely a
    pour the show made by itself near the path; either way the question was
    the wrong one. The hand's own place at each pour has no scatter; a
    fling in every direction averages out, and a pour made anywhere but
    near the hand (the stroke's start, a fixed spot) moves the mean: the
    model passes a healthy Splat on 99.5% of runs and one stuck at the
    stroke's start on 0.07%. Asking every pour to be near its hand failed
    a healthy Splat on 59%: about one in eight of its flings land past
    0.12 of the plate (23 cells).
  */
  const along = (pts, rad) => page.evaluate(({ pts, rad }) => {
    const l = window.__bottleLog;
    const near = (c, path) => path.some((p) => Math.hypot(c.x - p[0], c.y - p[1]) < rad);
    const mirror = pts.map((p) => [1 - p[0], 1 - p[1]]);
    const [s, e] = [pts[0], pts[pts.length - 1]];
    const t = (c) => ((c.x - s[0]) * (e[0] - s[0]) + (c.y - s[1]) * (e[1] - s[1])) / Math.max(1e-9, (e[0] - s[0]) ** 2 + (e[1] - s[1]) ** 2);
    const tally = (list) => {
      const on = list.filter((c) => near(c, pts));
      const q = Math.max(1, Math.floor(on.length / 4));
      const mean = (xs) => xs.reduce((a, c) => a + t(c), 0) / Math.max(1, xs.length);
      const hand = (c) => ({ x: c.hx, y: c.hy });
      const withHand = list.length > 0 && list.every((c) => c.hx !== undefined);
      const off = withHand ? Math.hypot(
        list.reduce((a, c) => a + c.x - c.hx, 0) / list.length,
        list.reduce((a, c) => a + c.y - c.hy, 0) / list.length) : Infinity;
      return {
        n: on.length, a: on.reduce((a, c) => a + c.a, 0), mirror: list.filter((c) => near(c, mirror)).length, off,
        follows: withHand && on.length >= 4 && off < 0.04
          && mean(on.slice(-q).map(hand)) - mean(on.slice(0, q).map(hand)) > 0.25,
      };
    };
    return {
      phase: tally(l.phase), oil: tally(l.oil),
      ...(() => {
        const hand = l.dye.filter((c) => !c.auto);
        const laid = new Set(hand.map((c) => c.b));
        const push = l.push.filter((c) => !c.auto && laid.has(c.b));
        // The colour the hand laid, weighted by how much of it landed near the stroke.
        const onHand = hand.filter((c) => near(c, pts) && c.a > 0);
        const w = onHand.reduce((a, c) => a + c.a, 0);
        const rgb = w > 0 ? [0, 1, 2].map((i) => onHand.reduce((a, c) => a + c.a * c.rgb[i], 0) / w) : null;
        return {
          dye: tally(hand).a, push: tally(push).a, rgb,
          shown: tally(l.dye.filter((c) => c.auto)).a,
          stir: tally(l.push.filter((c) => !c.auto && !laid.has(c.b))).a,
        };
      })(),
      vy: l.vy, vabs: l.vabs,
      same: window.chromaglassDebug().fluids[0].gpu === window.__bottleGpu,
    };
  }, { pts, rad });

  const bottle = async (id) => { await page.evaluate((id) => window.chromaglassLiquid(id), id); await settle(1800); };
  const pickTool = async (t) => {
    await page.evaluate((t) => window.chromaglassTool(t), t);
    // The pick is a React render away from the loop, and a hand that pressed
    // before it landed would be the Dropper: wait until the loop holds it.
    for (let k = 0; k < 40; k++) {
      if (await page.evaluate((t) => window.chromaglassDebug().tool() === t, t)) return;
      await settle(50);
    }
    throw new Error(`the tool never became ${t}`);
  };
  /** Off the middle, so the stroke is not its own mirror image. */
  const FROM = [0.25, 0.3], TO = [0.4, 0.3];
  /** A stroke, and where the hand was on the plate at each step of it (the pointer's own reading). */
  const stroke = async (t) => {
    await pickTool(t);
    await page.mouse.move(...screen(...FROM));
    await page.mouse.down();
    const path = [];
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(...screen(FROM[0] + (TO[0] - FROM[0]) * i / 20, FROM[1] + (TO[1] - FROM[1]) * i / 20));
      await settle(40);
      path.push(await page.evaluate(() => { const p = window.chromaglassDebug().pointer(); return [p.x / p.grid, p.y / p.grid]; }));
    }
    await page.mouse.up();
    await settle(200);
    return path;
  };
  /** One stroke of a tool with a bottle in the hand: what reached the plate along it. */
  const arm = async (t) => {
    await reset();
    const path = await stroke(t);
    const r = await along(path, 0.12);
    const soap = await page.evaluate(({ path }) => window.__soapNear(path, 0.12), { path });
    const soapMirror = await page.evaluate(({ path }) => window.__soapNear(path.map((p) => [1 - p[0], 1 - p[1]]), 0.12), { path });
    return { ...r, soap, soapMirror, path };
  };
  const same = (r) => r.same ? '' : ' (the solver changed under the stroke)';

  const LAYING = ['dropper', 'pour', 'spray', 'splatter', 'streak'];

  /*
    ── Picking a bottle lays nothing ──────────────────────────────────

    The owner, 2026-10-04: "when I pick the ferrofluid liquid - it deposits
    a huge chunk on the canvas. It shouldn't do that. I want to pour it on
    myself. Same with all of the other liquids." Picking the Ferrofluid
    bottle turned Ferrofluid (phaseAmount) up to 0.6 for the drops to show,
    and with it up the look's ring of ferrofluid was laid by whatever laid
    the look's ferrofluid next: a new solver, and the next look (laid by the
    amount the settings still held, a render before the new look's arrived).

    So, with nothing touching the plate: every bottle on the bench is picked
    in turn (through the same call the shelf, the phone and the remote make),
    and nothing may land: no ferrofluid (addPhase), no oil (addMix), no lay
    of the look's ferrofluid (phaseLays), and Ferrofluid left at 0, since
    every way the look's ring is laid asks for it above 0. Then a look is cued with the Ferrofluid bottle still in the
    hand, which is where the ring landed before: still no lay, and still 0
    (with Magnet Garden before it, which has ferrofluid of its own and lays
    it). And after the hand has poured, a Go to a look with none, faded,
    lays none half way through the fade.
    Soap and dye are not asked: Classic doses its own soap now and then and
    the ambient orbits lay dye every frame, and neither field can say who
    poured it. The control that the listeners hear
    at all is the arms below, which need the same listeners to see every pour
    of every laying tool; and the list of bottles must hold the Ferrofluid
    one, so a hook that returned nothing does not pass on an empty loop.

    And the bottle's ferrofluid is drawn once the hand pours it: after the
    first Dropper stroke with it, Ferrofluid is up, and the look's ring was
    not laid for it (phaseLays unchanged).
  */
  // Neither reads a missing hook as nothing: a counter that is not there would read "no lays" at both ends.
  const lays = async () => {
    const n = await page.evaluate(() => { const f = window.chromaglassDebug().phaseLays; return typeof f === 'function' ? f() : null; });
    if (typeof n !== 'number') throw new Error('chromaglassDebug().phaseLays is missing: the lays below cannot be counted');
    return n;
  };
  const amount = async () => {
    const a = await page.evaluate(() => window.chromaglassSettings().phaseAmount);
    if (typeof a !== 'number') throw new Error('the settings have no phaseAmount: Ferrofluid cannot be read');
    return a;
  };
  await clear();
  await page.evaluate(() => window.chromaglassDebug().fluids[0].gpu.clearPhase());
  const ids = await page.evaluate(() => window.chromaglassBottles?.() ?? []);
  const picks = [];
  for (const id of ids) {
    await reset();
    const laysBefore = await lays();
    await bottle(id);
    const r = await along([[0.5, 0.5]], 2);
    picks.push({ id, phase: r.phase.n, oil: r.oil.n, lays: (await lays()) - laysBefore, amount: await amount(), same: r.same });
  }
  const quiet = (p) => p.same && p.phase === 0 && p.oil === 0 && p.lays === 0 && p.amount <= 0.002;
  console.log(`     picked ${picks.map((p) => `${p.id} (${p.phase} ferrofluid, ${p.oil} oil, ${p.lays} lays, Ferrofluid ${p.amount})`).join('; ')}`);
  check('picking each bottle on the bench lays nothing and leaves Ferrofluid at 0',
    ids.includes('ferrofluid') && picks.every(quiet),
    `${picks.length} bottles (${ids.join(', ')}); ${picks.filter((p) => !quiet(p)).map((p) => p.id).join(', ') || 'none'} laid or turned it up`);
  /*
    Magnet Garden first, the control: a look with ferrofluid of its own lays
    it when cued, so the counter can count. Then Galaxy straight after it with
    the Ferrofluid bottle in the hand: the cue reaches the plate while the
    settings still hold Magnet Garden's 0.9, so it asks that the plate lays a
    look by the amount the look asks for (passed with the cue), not by them.
  */
  await bottle('ferrofluid');
  await reset();
  const laysGarden = await lays();
  await page.evaluate(() => window.chromaglassApplyPreset('magnet-garden'));
  await settle(4000);
  const garden = { lays: (await lays()) - laysGarden, amount: await amount() };
  check('a look with ferrofluid of its own still lays it when cued', garden.lays >= 1 && garden.amount > 0.002,
    `Magnet Garden laid its ferrofluid ${garden.lays} times, Ferrofluid ${garden.amount}`);
  await reset();
  const laysCue = await lays();
  await page.evaluate(() => window.chromaglassApplyPreset('galaxy'));
  await settle(4000);
  const cuedAlong = await along([[0.5, 0.5]], 2);
  const cued = { phase: cuedAlong.phase.n, lays: (await lays()) - laysCue, amount: await amount(), same: cuedAlong.same };
  check('a look with none, cued from one with some and the Ferrofluid bottle in the hand, lays none', cued.same && cued.lays === 0 && cued.phase === 0 && cued.amount <= 0.002,
    `${cued.lays} lays of the look's ferrofluid, ${cued.phase} pours, Ferrofluid ${cued.amount}${same(cued)}`);
  await page.evaluate(() => window.chromaglassApplyPreset('classic'));
  await settle(3000);
  await calm();

  /** The ferrofluid in the solver, read back: along a path, at its mirror, and in all. */
  const phaseAlong = (path) => page.evaluate(async ({ path }) => {
    const d = window.chromaglassDebug();
    if (typeof d.readPhase !== 'function') return null;
    const f = await d.readPhase();
    if (!f) return null;
    let t = 0, n = 0, m = 0;
    for (let y = 0; y < f.n; y++) for (let x = 0; x < f.n; x++) {
      const v = f.data[x + y * f.n]; t += v;
      if (path.some((p) => Math.hypot(x / f.n - p[0], y / f.n - p[1]) < 0.12)) n += v;
      if (path.some((p) => Math.hypot(x / f.n - (1 - p[0]), y / f.n - (1 - p[1])) < 0.12)) m += v;
    }
    return { total: t, near: n, mirror: m };
  }, { path });

  // ── Ferrofluid ───────────────────────────────────────────────────
  /*
    Not cleared first: Classic, cued above after Magnet Garden, asks for no
    ferrofluid and so leaves Magnet Garden's ring in the solver, unseen with
    Ferrofluid at 0. The first stroke must turn the amount up for its own
    pour and not bring that ring back with it: read back after it, the
    ferrofluid in the solver is the stroke's.
  */
  await clear();
  await bottle('ferrofluid');
  const laysFerro = await lays();
  const amountPicked = await amount();
  const ferro = {};
  ferro.dropper = await arm('dropper');
  await settle(600);
  const amountPoured = await amount();
  const firstPour = await phaseAlong(ferro.dropper.path);
  check('the first pour shows only itself: none of a look\'s ferrofluid left unseen in the solver',
    firstPour && firstPour.near > 0.5 && firstPour.near > 0.6 * firstPour.total && firstPour.mirror < 0.05 * firstPour.near,
    firstPour ? `${firstPour.near.toFixed(1)} of ${firstPour.total.toFixed(1)} along the stroke, ${firstPour.mirror.toFixed(1)} at its mirror` : 'the phase does not read back');
  for (const t of [...LAYING, 'finger', 'blow']) {
    if (t !== 'dropper') ferro[t] = await arm(t);
    console.log(`     Ferrofluid ${t.padEnd(8)} ${ferro[t].phase.n} pours of ferrofluid along the stroke (amount ${ferro[t].phase.a.toFixed(2)}), ${ferro[t].phase.mirror} at its mirror, dye ${ferro[t].dye.toFixed(1)}`);
  }
  const ferroAmount = await amount();
  const ferroLays = (await lays()) - laysFerro;
  for (const t of LAYING) {
    const r = ferro[t];
    check(`${t} with the Ferrofluid bottle lays ferrofluid along the stroke, and not at its mirror`,
      r.same && r.phase.n >= 8 && r.phase.a > 0.5 && r.phase.follows && r.phase.mirror === 0,
      `${r.phase.n} pours, amount ${r.phase.a.toFixed(2)}, ${r.phase.follows ? 'following' : 'not following'} the hand (off it by ${r.phase.off.toFixed(3)} on average), ${r.phase.mirror} at the mirror${same(r)}`);
  }
  check('the hand\'s first pour turns Ferrofluid up, and lays none of the look\'s',
    amountPicked <= 0.002 && amountPoured > 0.002 && ferroLays === 0,
    `Ferrofluid ${amountPicked} with the bottle picked, ${amountPoured} after one Dropper stroke (${ferroAmount} after them all); the look's ferrofluid laid ${ferroLays} times while they poured`);
  check('Finger and Blow with the Ferrofluid bottle lay none',
    ferro.finger.same && ferro.blow.same && ferro.finger.phase.n === 0 && ferro.blow.phase.n === 0,
    `Finger ${ferro.finger.phase.n}, Blow ${ferro.blow.phase.n}${same(ferro.finger)}${same(ferro.blow)}`);

  // Read back: the ferrofluid a Pour laid is on the plate along the stroke, not only asked for.
  await page.evaluate(() => window.chromaglassDebug().fluids[0].gpu.clearPhase());
  await settle(400);
  const poured = await arm('pour');
  await settle(600);
  const onPlate = await phaseAlong(poured.path);
  check('a Ferrofluid Pour is ferrofluid on the plate along the stroke, read back',
    onPlate && onPlate.near > 0.5 && onPlate.near > 0.6 * onPlate.total && onPlate.mirror < 0.05 * onPlate.near,
    onPlate ? `${onPlate.near.toFixed(1)} of ${onPlate.total.toFixed(1)} along the stroke, ${onPlate.mirror.toFixed(1)} at its mirror` : 'the phase does not read back');

  /*
    A Go after the pour, faded: the look fading in lays its ferrofluid half
    way through, and half way the settings are half way between the looks,
    so from the pour's Ferrofluid 0.6 to Galaxy's 0 they read 0.3 there. Laid
    by them, Galaxy's ring landed over the pour; laid by what Galaxy asks
    for (passed with the Go), nothing does.
  */
  const goFrom = await amount();
  const laysGo = await lays();
  await reset();
  await page.evaluate(() => window.chromaglassGo('galaxy', 2));
  await settle(3500);
  const wentAlong = await along([[0.5, 0.5]], 2);
  const went = { lays: (await lays()) - laysGo, phase: wentAlong.phase.n, same: wentAlong.same };
  check('a faded Go to a look with none, after the hand poured, lays none of its ferrofluid half way',
    goFrom > 0.002 && went.same && went.lays === 0 && went.phase === 0,
    `Ferrofluid ${goFrom} before the Go; ${went.lays} lays of the look's ferrofluid, ${went.phase} pours${same(went)}`);
  await page.evaluate(() => window.chromaglassApplyPreset('classic'));
  await settle(3000);
  await calm();

  // ── Oil and Soap ─────────────────────────────────────────────────
  await bottle('oil');
  const oil = {};
  for (const t of LAYING) {
    // Afresh each time: Oil Bodies stops pouring once oil covers a third of the plate.
    await clear();
    oil[t] = await arm(t);
    const r = oil[t];
    console.log(`     Oil        ${t.padEnd(8)} ${r.oil.n} pours of oil along the stroke, ${r.oil.mirror} at its mirror`);
    check(`${t} with the Oil bottle lays oil along the stroke`, r.same && r.oil.n >= 3 && r.oil.mirror === 0,
      `${r.oil.n} pours, ${r.oil.mirror} at the mirror${same(r)}`);
  }
  await bottle('soap');
  for (const t of LAYING) {
    await clear();
    const r = await arm(t);
    console.log(`     Soap       ${t.padEnd(8)} soap along the stroke ${r.soap.toFixed(1)}, at its mirror ${r.soapMirror.toFixed(1)}`);
    check(`${t} with the Soap bottle lays soap along the stroke`, r.soap > 1 && true,
      `${r.soap.toFixed(1)} along it, ${r.soapMirror.toFixed(1)} at the mirror`);
  }

  // ── Water: the control, and the dye a bottle leaves unchanged ────────
  await clear();
  await bottle('water');
  const water = {};
  for (const t of LAYING) water[t] = await arm(t);
  check('with Water in the bottle no tool lays ferrofluid, oil or soap',
    LAYING.every((t) => water[t].same && water[t].phase.n === 0 && water[t].oil.n === 0 && water[t].soap < 0.5),
    LAYING.map((t) => `${t} ${water[t].phase.n}/${water[t].oil.n}/${water[t].soap.toFixed(1)}${same(water[t])}`).join(', '));
  const perPush = (r) => r.dye / Math.max(1e-9, r.push);
  const wp = perPush(water.pour), fp = perPush(ferro.pour), op = perPush(oil.pour);
  check('a Ferrofluid Pour lays a tenth of the dye a Water Pour does per push, or less', water.pour.push > 0 && ferro.pour.push > 0 && ferro.pour.dye > 0 && ferro.pour.same && fp <= 0.1 * wp,
    `${fp.toFixed(2)} against ${wp.toFixed(2)} (by design 0.05 / 0.8 = 0.0625 of it)`);
  check('an Oil Pour lays the dye a Water Pour does per push (only a magnetic bottle changes it)',
    water.pour.push > 0 && oil.pour.push > 0 && oil.pour.same && Math.abs(op - wp) < 0.1 * wp,
    `${op.toFixed(2)} against ${wp.toFixed(2)}; not counted: the show's own dye near the strokes (oil ${oil.pour.shown.toFixed(1)}, water ${water.pour.shown.toFixed(1)}), the mouse's stir (oil ${oil.pour.stir.toFixed(2)} of ${(oil.pour.stir + oil.pour.push).toFixed(2)}, water ${water.pour.stir.toFixed(2)} of ${(water.pour.stir + water.pour.push).toFixed(2)})`);

  /*
    ── A bottle's own colour, and a dye in it (lib/liquidColour.ts) ────

    The owner, 2026-10-05: "Some of the liquids don't carry color. Let's
    make them by default the correct color, but allow them to have color as
    well." `npm run natural` holds the arithmetic; this holds the hand to
    it, through the real pointer: what the Pour lays per push.
      - Glycerine as it is (Natural) is clear: the Pour pushes and lays no
        colour at all.
      - Glycerine with Cherry Red picked for it lays Water's dye per push,
        and lays red: the dye is in it.
      - Syrup as it is lays its own amber, Water's dye per push.
    Water's Pour above is the control: the same tool, the same push.
  */
  const near3 = (a, b) => !!a && a.every((v, i) => Math.abs(v - b[i]) < 0.02);
  const fmt3 = (a) => a ? `(${a.map((v) => v.toFixed(3)).join(', ')})` : 'none';
  // The ambient orbits lay dye straight onto the plate every frame, not
  // through autoInject, so near the stroke they would read as the hand's
  // (as scripts/tools.mjs found): off for these three, back on after.
  await page.evaluate(() => window.chromaglassDebug().ambientSeed(false));
  await bottle('glycerine');
  await clear();
  const glyClear = await arm('pour');
  check('a Glycerine Pour, as it is, pushes and lays no colour: it is clear', glyClear.same && glyClear.push > 0 && glyClear.dye === 0,
    `${glyClear.dye.toFixed(2)} dye for ${glyClear.push.toFixed(2)} of push${same(glyClear)}`);
  await page.evaluate(() => window.chromaglassLiquidColour('glycerine', '#ff0000'));
  await settle(600);
  await clear();
  const glyRed = await arm('pour');
  const gp = perPush(glyRed);
  check('Glycerine with Cherry Red picked lays red, Water\'s dye per push: the dye is in it',
    glyRed.same && glyRed.push > 0 && Math.abs(gp - wp) < 0.1 * wp && near3(glyRed.rgb, [1, 0, 0]),
    `${gp.toFixed(2)} against ${wp.toFixed(2)} per push, laid ${fmt3(glyRed.rgb)}${same(glyRed)}`);
  await page.evaluate(() => window.chromaglassLiquidColour('glycerine', '#ffffff'));
  await bottle('syrup');
  await clear();
  const syr = await arm('pour');
  const sp = perPush(syr);
  check('a Syrup Pour, as it is, lays its own amber, Water\'s dye per push',
    syr.same && syr.push > 0 && Math.abs(sp - wp) < 0.1 * wp && near3(syr.rgb, [0xde / 255, 0xbf / 255, 0x45 / 255]),
    `${sp.toFixed(2)} against ${wp.toFixed(2)} per push, laid ${fmt3(syr.rgb)} (#debf45 is (0.871, 0.749, 0.271))${same(syr)}`);
  await page.evaluate(() => window.chromaglassDebug().ambientSeed(true));

  // ── The other hands ──────────────────────────────────────────────
  const AT = [0.3, 0.25];
  const replay = async (t, n = 4) => {
    await reset();
    await page.evaluate(({ t, n, at }) => { for (let k = 0; k < n; k++) window.chromaglassDebug().gesture({ tool: t, x: at[0], y: at[1], dx: 1, dy: 0, layer: 0 }); }, { t, n, at: AT });
    return along([AT], 0.12);
  };
  await bottle('ferrofluid');
  for (const t of LAYING) {
    const r = await replay(t);
    check(`a replayed ${t} with the Ferrofluid bottle lays ferrofluid, and not at its mirror`,
      r.same && r.phase.n >= 4 && r.phase.mirror === 0, `${r.phase.n} pours, ${r.phase.mirror} at the mirror${same(r)}`);
  }
  const rf = await replay('finger');
  check('a replayed Finger with the Ferrofluid bottle lays none', rf.same && rf.phase.n === 0, `${rf.phase.n} pours${same(rf)}`);
  await bottle('water');
  await reset();
  await page.evaluate((at) => { for (let k = 0; k < 4; k++) window.chromaglassDebug().gesture({ tool: 'pour', x: at[0], y: at[1], layer: 0 }); }, AT);
  const push = await along([AT], 0.12);
  check('a replayed Pour pushes out from where it lands, not down the plate',
    push.vabs > 0 && Math.abs(push.vy) < 0.1 * push.vabs,
    `net push down the plate ${push.vy.toFixed(2)} of ${push.vabs.toFixed(2)} in all`);

  /*
    The Press moves the oil with its colour (PLAN 15d). Its move is squeezeOut,
    once a dye reading while the palm is down; the oil's half is pressMix,
    through pressOil (src/lib/pressRing.ts), which `npm run pressoil` measures
    on the solver with the app's own arguments, the colour's half beside it.
    What only the app can show is that the Press reaches it and moves oil:

      - on a cleared plate, a clear oil body laid where the palm will be (no
        colour, the case the oil's own once-a-reading gate is for), held with
        the mouse: the oil under the palm falls, the ring round it gains, the
        total holds; the calls land under the palm, at the app's palm (30
        cells at 128, 0.234 of the plate), never at its mirror, and no more
        often than the dye mirror was read, plus one;
      - eight presses replayed through performGesture in one go, with no
        reading between them: exactly one reaches the oil;
      - with Oil Bodies off, the Press still presses (squeezeOut runs) and
        never touches the oil.

    Whether the Press still clears the dye into a ring is `npm run tools`.
  */
  const oilAt = (at) => page.evaluate(async ({ at }) => {
    const r = await window.chromaglassDebug().fluids[0].gpu.readChemistry('mix');
    if (!r) return null;
    const n = Math.round(Math.sqrt(r.data.length / 4)), R = 30 / 128;
    let palm = 0, ring = 0, all = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = r.data[(x + y * n) * 4], d = Math.hypot((x + 0.5) / n - at[0], (y + 0.5) / n - at[1]);
      all += v; if (d < 0.8 * R) palm += v; else if (d > R && d < 1.7 * R) ring += v;
    }
    return { palm, ring, all };
  }, { at });
  const hold = async (on) => {
    const v = on ? 1 : 0;
    await page.evaluate((v) => window.chromaglassSettings({ oilBodies: v }), v);
    // The setting reaches the plate a render and a step later: wait until the plate holds it.
    for (let k = 0; k < 40 && (await page.evaluate(() => window.chromaglassDebug().fluids[0].lastSettings?.oilBodies)) !== v; k++) await settle(50);
    const holds = await page.evaluate(() => window.chromaglassDebug().fluids[0].lastSettings?.oilBodies);
    await clear();
    await pickTool('press');
    await page.mouse.move(...screen(...AT));
    await settle(200);
    const at = await page.evaluate(() => { const p = window.chromaglassDebug().pointer(); return [p.x / p.grid, p.y / p.grid]; });
    // A clear body under where the palm will go, smaller than the palm, so its ring is water.
    await page.evaluate((a) => window.chromaglassDebug().fluids[0].gpu.addMix(a[0], a[1], 0.18, { oil: 1 }), at);
    await settle(300);
    await reset();
    const before = await oilAt(at);
    const read0 = await page.evaluate(() => window.chromaglassDebug().fluids[0].gpu.rbDyeLanded);
    await page.mouse.down();
    await settle(1500);
    await page.mouse.up();
    const read1 = await page.evaluate(() => window.chromaglassDebug().fluids[0].gpu.rbDyeLanded);
    await settle(200);
    const after = await oilAt(at);
    const byMouse = await page.evaluate(() => window.__bottleLog.press.length);
    const squeezed = await page.evaluate(() => window.__bottleLog.squeeze);
    // Until the plate is ready to move again (its mirror current, the oil's gate open), then all eight at once.
    for (let k = 0; k < 40; k++) {
      const ready = await page.evaluate(() => { const f = window.chromaglassDebug().fluids[0]; return f.dyeMirrorCurrent() && f.gpu.rbDyeLanded >= f.oilPressAfter; });
      if (ready) break;
      await settle(50);
    }
    await page.evaluate((a) => { for (let k = 0; k < 8; k++) window.chromaglassDebug().gesture({ tool: 'press', x: a[0], y: a[1], layer: 0 }); }, AT);
    await settle(300);
    const calls = await page.evaluate(({ at, AT, byMouse }) => {
      const l = window.__bottleLog.press;
      const near = (c, p) => Math.hypot(c.x - p[0], c.y - p[1]) < 0.03;
      const mouse = l.slice(0, byMouse), replay = l.slice(byMouse);
      const mirror = mouse.filter((c) => near(c, [1 - at[0], 1 - at[1]])).length + replay.filter((c) => near(c, [1 - AT[0], 1 - AT[1]])).length;
      const placed = mouse.filter((c) => near(c, at)).length + replay.filter((c) => near(c, AT)).length;
      const palm = mouse.length ? Math.max(...mouse.map((c) => Math.abs(c.r / (30 / 128) - 1))) : 1;
      return { n: l.length, mouse: mouse.length, replay: replay.length, placed, mirror, palm,
        same: window.chromaglassDebug().fluids[0].gpu === window.__bottleGpu };
    }, { at, AT, byMouse });
    return { ...calls, holds, squeezed, readings: read1 - read0, before, after };
  };
  await bottle('oil');
  /*
    On the old plate, Thin Gap off. These measure the Press's own move of the
    oil (squeezeOut and pressMix), which a thin gap retires: there the flow
    carries the oil out and back with its colour (PLAN 18a, the Press's
    carries retired), and squeezeOut returns before it moves anything. Every
    look runs on a thin gap since PLAN 18a-every, so without this the calls
    counted here never come and the lines below would read the thin flow,
    not the move they are about. The old plate is still a switch away, and
    this is still its Press. The oil's press on a thin gap has no app check
    of its own yet (PLAN 18a).
  */
  await page.evaluate(() => window.chromaglassSettings({ thinGap: 0 }));
  // Turned off in a show that opened thin, the plate stays thin until the old plate's pipelines are built.
  for (let k = 0; k < 400 && (await page.evaluate(() => !!window.chromaglassDebug().fluids?.[0]?.thinGap)); k++) await settle(50);
  const oldPlate = await page.evaluate(() => !window.chromaglassDebug().fluids?.[0]?.thinGap);
  let pOn, pOff;
  try {
    pOn = await hold(true);
    pOff = await hold(false);
  } finally {
    await page.evaluate(() => window.chromaglassSettings({ thinGap: 1 }));
  }
  check('the Press\'s oil checks below ran on the old plate they measure', oldPlate, oldPlate ? 'Thin Gap off and the plate stepping without it' : 'the plate was still on a thin gap after 20 s');
  const b = pOn.before, a = pOn.after;
  console.log(`     Press, Oil Bodies on: ${pOn.mouse} oil presses held over ${pOn.readings} readings and ${pOn.replay} of 8 replayed, ${pOn.placed} of ${pOn.n} under the palm, ${pOn.mirror} at its mirror; oil under the palm ${b?.palm.toFixed(1)} → ${a?.palm.toFixed(1)}, ring ${b?.ring.toFixed(1)} → ${a?.ring.toFixed(1)}, all ${b?.all.toFixed(1)} → ${a?.all.toFixed(1)}; off: ${pOff.n} oil presses in ${pOff.squeezed} presses`);
  check('the Press moves the oil with Oil Bodies on: out from under the palm onto the ring, and keeps it',
    pOn.same && pOn.holds === 1 && b && a && b.palm > 10 && a.palm < 0.7 * b.palm && a.ring - b.ring > 0.5 * (b.palm - a.palm) && Math.abs(a.all / b.all - 1) < 0.05,
    b && a ? `under the palm ${b.palm.toFixed(1)} → ${a.palm.toFixed(1)}, ring ${b.ring.toFixed(1)} → ${a.ring.toFixed(1)}, all ${b.all.toFixed(1)} → ${a.all.toFixed(1)}${same(pOn)}` : 'no oil read back');
  check('where the hand is, at the app\'s palm, never at its mirror, once a reading',
    pOn.mouse >= 3 && pOn.mouse <= pOn.readings + 1 && pOn.placed === pOn.n && pOn.mirror === 0 && pOn.palm < 0.02,
    `${pOn.mouse} held over ${pOn.readings} readings, ${pOn.placed} of ${pOn.n} under the palm, ${pOn.mirror} at the mirror, palm off 0.234 by ${(100 * pOn.palm).toFixed(1)}%`);
  check('and eight replayed presses with no reading between them move it once', pOn.replay === 1, `${pOn.replay} of 8`);
  check('and not at all with Oil Bodies off, while the Press still presses', pOff.same && pOff.holds === 0 && pOff.squeezed >= 3 && pOff.n === 0,
    `${pOff.n} oil presses in ${pOff.squeezed} presses, the plate holding Oil Bodies at ${pOff.holds}${same(pOff)}`);
} finally {
  await browser.close();
  stop();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
