#!/usr/bin/env node
/**
 * Does every tool in the hand do what it says, and nothing else?
 *
 *   npm run tools
 *
 * Asked for: "check all of the tools to make sure they work in expected
 * ways", after the Magnet turned out to be fighting a press and a stir the
 * pointer applied under every tool. Each tool is used through the real
 * pointer on a calm, cleared plate, and the dye on the lead plate is read
 * back and measured around where the hand was:
 *
 *   hover       moving across the plate with no button down changes nothing
 *   Drop        lays dye where it is held
 *   Pour        lays more than Drop, and spreads it out from where it lands
 *   Spray       lays a wider, finer mist than Drop
 *   Splat       flings dye round the hand
 *   Streak      lays dye along the stroke
 *   Finger      carries dye along the stroke, adds none, and stops when the
 *               hand stops (it used to go on pushing while held still)
 *   Blow        clears dye from under it
 *   Press       pushes dye out from under the palm into a ring, keeping it
 *   Press, let go, on a thin gap (Thin Gap, PLAN §18a): the colour goes out
 *               under the palm and comes back when the hand lets go
 *
 * The Magnet has its own check (npm run magnet).
 *
 * Needs a GPU that presents WebGPU: the macOS runner, in checks.yml.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery } from './frame.mjs';

const PORT = 4346;
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
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(8000);

  // A calm plate: nothing moves the dye but the hand. The music would pour,
  // the turbulence and the turning would carry, the drips would streak.
  const calm = {
    rotationSpeed: 0, turbulenceScale: 0, audioImpact: 0, plateRock: 0, beatSqueeze: 0, buoyancy: 0,
    rainDrip: 0, glassSmear: 0, vibrationFrequency: 0, centerGravity: 0, bubbles: 0, beads: 0,
    audioMappings: { velocity: 'none', density: 'none', color: 'none', rotation: 'none' },
  };
  await page.evaluate((c) => window.chromaglassSettings?.(c), calm);
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const screen = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  const tool = (t) => page.evaluate((t) => window.chromaglassTool?.(t), t);
  const clear = async () => { await page.evaluate(() => window.chromaglassAction?.('clear')); await page.waitForTimeout(2500); };
  const settle = (ms) => page.waitForTimeout(ms);

  /** The lead plate's density, and where the pointer is on it (grid cells). */
  const snap = (keep) => page.evaluate((keep) => {
    const d = window.chromaglassDebug();
    const f = d.fluids?.[0];
    (window.__toolSnaps ??= {})[keep] = { n: d.gridSize, data: Float32Array.from(f.readDensity), step: f.stepIndex ?? -1, dt: f.dtSeconds ?? 0 };
    return d.pointer();
  }, keep);
  /**
   * Dye in a disc round a point and in the ring outside it, the total on the
   * plate, and the centre of mass; `at` in grid cells, radii in plate widths.
   */
  const measure = (keep, at, r = 0.07, ring = 0.16) => page.evaluate(({ keep, at, r, ring }) => {
    const s = window.__toolSnaps[keep];
    const n = s.n; let disc = 0, out = 0, total = 0, cx = 0, cy = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = Math.max(0, s.data[x + y * n]);
      if (!Number.isFinite(v)) continue;
      total += v; cx += v * x; cy += v * y;
      const dist = Math.hypot(x - at.x, y - at.y) / n;
      if (dist < r) disc += v; else if (dist < ring) out += v;
    }
    return { disc, ring: out, total, cx: total ? cx / total / n : 0, cy: total ? cy / total / n : 0 };
  }, { keep, at, r, ring });

  const A = [0.42, 0.5], B = [0.58, 0.5];
  const hold = async (t, at, ms) => {
    await tool(t);
    await settle(300);   // the pick is a React render away: pressing at once used the last tool for a moment
    await page.mouse.move(...screen(...at));
    await page.mouse.down();
    await settle(ms);
    await page.mouse.up();
  };
  const stroke = async (t, from, to, ms, stay = 0) => {
    await tool(t);
    await settle(300);   // the pick is a React render away: pressing at once used the last tool for a moment
    await page.mouse.move(...screen(...from));
    await page.mouse.down();
    const n = 30;
    for (let i = 1; i <= n; i++) {
      await page.mouse.move(...screen(from[0] + (to[0] - from[0]) * i / n, from[1] + (to[1] - from[1]) * i / n));
      await settle(ms / n);
    }
    if (stay) { await snap('stroked'); await settle(stay); }
    await page.mouse.up();
  };
  /** Lay a pool of dye at a point to work on, and let it settle. */
  const pool = async (at) => { await hold('dropper', at, 1500); await settle(1500); };
  /**
   * What the plate does on its own over `ms`, from the same pool: the
   * control a tool that adds nothing (Finger) or keeps what it moves
   * (Press) is judged against, rather than against zero.
   */
  const idleChange = async (at, ms) => {
    const p = await snap('ctl0'); await settle(ms); await snap('ctl1');
    const a = await measure('ctl0', p), b = await measure('ctl1', p);
    return b.total - a.total;
  };

  // ── Hover ────────────────────────────────────────────────────────
  await clear();
  await pool(A);
  await settle(3000);   // past the pool's own settling, as for the Finger below
  await snap('idleA');
  await settle(2000);
  await snap('idle0');
  await settle(2000);
  const at = await (async () => { await page.mouse.move(...screen(...A)); return page.evaluate(() => window.chromaglassDebug().pointer()); })();
  await snap('idle1');
  // The same two seconds with the pointer swept back and forth over the pool, no button.
  for (let i = 0; i < 40; i++) { await page.mouse.move(...screen(A[0] + 0.06 * Math.sin(i / 3), A[1] + 0.04 * Math.cos(i / 4))); await settle(50); }
  await snap('hover');
  /*
    Judged per solver step, against the larger of two windows left alone
    before it.

    It was judged against the one two seconds before, as a total, and went
    red once in 75 runs (deploy 36270301147, a commit that changed only
    PLAN.md): 192 → 174 hovering against 195 → 192 left alone. Across those
    75 runs the hover window lost more than the window before it in 56, which
    a pointer that does nothing should not do half the time, let alone three
    quarters. Two reasons, neither the hand: the sweep's forty moves take
    longer than their forty fifty-millisecond waits (every move is a round
    trip to the browser), so the hover window is the longer one; and a single
    two-second window of a settling pool is a noisy control (the idle change
    ranged from 3 to over 20 in those runs), and the allowance is twice it,
    so a quiet one shrank the bar under an ordinary hover. So each window is
    counted in the solver steps it spanned (stepIndex, read with the dye),
    and the plate's own rate is the larger of two windows before.

    Not after. A window after the hover was the first version's second
    control, and the check-skeptic review saw what that does: if the hover
    does stir the pool, the stir goes on settling after it, the after window
    loses more, and the allowance grows with the very fault it is judging.
    It is still read and printed, so a stir that lingers is seen.
  */
  await settle(2000);
  await snap('idle2');
  const iA = await measure('idleA', at), i0 = await measure('idle0', at), i1 = await measure('idle1', at), hv = await measure('hover', at), i2 = await measure('idle2', at);
  const stepsAt = await page.evaluate(() => ['idleA', 'idle0', 'idle1', 'hover', 'idle2'].map(k => window.__toolSnaps[k].step));
  const span = (a, b) => stepsAt[b] - stepsAt[a];
  const stepsOk = stepsAt.every(n => n >= 0) && [0, 1, 2, 3].every(k => span(k, k + 1) > 0);
  const idleRate = Math.max(Math.abs(i0.disc - iA.disc) / Math.max(1, span(0, 1)), Math.abs(i1.disc - i0.disc) / Math.max(1, span(1, 2)));
  const hoverMove = Math.abs(hv.disc - i1.disc), idleMove = idleRate * span(2, 3);
  // A pool to hover over: with none (an empty plate, or readbacks of zeros)
  // nothing moves, hovering or not, and the check would pass on nothing.
  const pooled = i1.disc > 5;
  check('moving over the plate with no button down leaves it alone',
    stepsOk && pooled && hoverMove <= Math.max(2, 2 * idleMove) + 0.05 * i1.disc,
    !stepsOk ? `the plate did not step through every window (steps ${stepsAt.join(', ')})`
      : !pooled ? `no pool under the pointer to hover over (${i1.disc.toFixed(1)})`
        : `dye under the pointer ${i1.disc.toFixed(0)} → ${hv.disc.toFixed(0)} hovering over ${span(2, 3)} steps; left alone before ${iA.disc.toFixed(0)} → ${i0.disc.toFixed(0)} → ${i1.disc.toFixed(0)} over ${span(0, 1)} and ${span(1, 2)} steps (${(Math.abs(i0.disc - iA.disc) / Math.max(1, span(0, 1))).toFixed(3)} and ${(Math.abs(i1.disc - i0.disc) / Math.max(1, span(1, 2))).toFixed(3)} a step), ${idleMove.toFixed(1)} at the faster rate over the hover's steps; after, ${hv.disc.toFixed(0)} → ${i2.disc.toFixed(0)} over ${span(3, 4)}`);

  // ── The pouring tools ───────────────────────────────────────────
  const laid = {};
  for (const [t, ms] of [['dropper', 1200], ['pour', 1200], ['spray', 1200], ['splatter', 1200]]) {
    await clear();
    await page.mouse.move(...screen(...A));
    const p = await snap(`${t}0`);
    await hold(t, A, ms);
    await settle(700);
    await snap(`${t}1`);
    const a = await measure(`${t}0`, p), b = await measure(`${t}1`, p);
    const an = await measure(`${t}0`, p, 0.02, 0.07), bn = await measure(`${t}1`, p, 0.02, 0.07);
    laid[t] = { disc: b.disc - a.disc, ring: b.ring - a.ring, total: b.total - a.total, near: bn.disc - an.disc, spread: bn.ring - an.ring };
    console.log(`     ${t.padEnd(8)} laid ${laid[t].total.toFixed(0)}: ${laid[t].disc.toFixed(0)} within 0.07 of the hand, ${laid[t].ring.toFixed(0)} from 0.07 to 0.16`);
  }
  check('Drop lays dye where it is held', laid.dropper.disc > 5 && laid.dropper.disc > 0.6 * laid.dropper.total,
    `${laid.dropper.disc.toFixed(0)} of ${laid.dropper.total.toFixed(0)} within 0.07`);
  check('Pour lays more than Drop', laid.pour.total > 1.3 * laid.dropper.total,
    `${laid.pour.total.toFixed(0)} against ${laid.dropper.total.toFixed(0)}`);
  // At the pour's own scale: its stream is about 0.03 of the plate across.
  const spreadOf = (l) => l.spread / Math.max(1e-6, l.near + l.spread);
  check('and spreads it out from where it lands', spreadOf(laid.pour) > spreadOf(laid.dropper),
    `${(100 * spreadOf(laid.pour)).toFixed(0)}% of it from 0.02 to 0.07, against Drop's ${(100 * spreadOf(laid.dropper)).toFixed(0)}%`);
  check('Spray lays a wider mist than Drop', laid.spray.total > 5 && laid.spray.ring / laid.spray.total > laid.dropper.ring / Math.max(1e-6, laid.dropper.total),
    `${(100 * laid.spray.ring / Math.max(1e-6, laid.spray.total)).toFixed(0)}% beyond 0.07`);
  check('Splat flings dye round the hand', laid.splatter.total > 5 && laid.splatter.disc + laid.splatter.ring > 0.7 * laid.splatter.total,
    `${laid.splatter.total.toFixed(0)} laid, ${(100 * (laid.splatter.disc + laid.splatter.ring) / Math.max(1e-6, laid.splatter.total)).toFixed(0)}% within 0.16`);

  // ── The Amount ──────────────────────────────────────────────────
  // A mouse can say where and for how long, not how much; each tool's Amount
  // says how much. Turned down, the same hold of the dropper lays less dye.
  // Down rather than up: the middle of a drop reaches the plate's density
  // ceiling, so more is not all measurable as more, and less always is.
  {
    await clear();
    await page.evaluate(() => window.chromaglassToolAmount?.('dropper', 0.4));
    await page.mouse.move(...screen(...A));
    const p = await snap('amt0');
    await hold('dropper', A, 1200);
    await settle(700);
    await snap('amt1');
    const a = await measure('amt0', p), b = await measure('amt1', p);
    await page.evaluate(() => window.chromaglassToolAmount?.('dropper', 1));
    const less = b.total - a.total;
    check("a tool's Amount sets how much it does — the dropper at 0.4x lays less dye", less > 0 && less < 0.7 * laid.dropper.total,
      `${less.toFixed(0)} against ${laid.dropper.total.toFixed(0)} at 1x`);
  }

  // ── Streak ──────────────────────────────────────────────────────
  await clear();
  await page.mouse.move(...screen(...A));
  const s0 = await snap('streak0');
  await stroke('streak', A, B, 1200);
  await settle(700);
  await snap('streak1');
  const pB = await (async () => { await page.mouse.move(...screen(...B)); return page.evaluate(() => window.chromaglassDebug().pointer()); })();
  const mid = { x: (s0.x + pB.x) / 2, y: (s0.y + pB.y) / 2 };
  const st0 = await measure('streak0', mid, 0.1), st1 = await measure('streak1', mid, 0.1);
  check('Streak lays dye along the stroke', st1.disc - st0.disc > 5 && st1.disc - st0.disc > 0.5 * (st1.total - st0.total),
    `${(st1.disc - st0.disc).toFixed(0)} of ${(st1.total - st0.total).toFixed(0)} within 0.1 of the stroke's middle`);

  // ── Finger ──────────────────────────────────────────────────────
  await clear();
  await pool(A);
  // Past the pool's own settling, so the plate left alone and the plate
  // stroked are the same plate at the same stage.
  await settle(3000);
  const fIdle = await idleChange(A, 3800);
  const f0p = await snap('finger0');
  await stroke('finger', A, B, 1500, 1500);
  await settle(700);
  await snap('finger1');
  const fa = await measure('finger0', f0p), fs = await measure('stroked', f0p), fb = await measure('finger1', f0p);
  /*
    And the plate left alone again after the stroke. What the plate does on
    its own after a pool is laid swings from +29 to +139 between runs, and
    one window before the stroke is a single reading of that: a stroke that
    moved 576 -> 766 against +49 failed by one unit (main's #146 deploy) on
    runs where the same code passed. Bracketed, the slack is the larger of
    what the plate did alone before and after; a Finger that makes dye still
    has to beat both.
  */
  const fIdleAfter = await idleChange(A, 3800);
  const fDrift = Math.abs(fIdle) >= Math.abs(fIdleAfter) ? fIdle : fIdleAfter;
  const moved = Math.hypot(fs.cx - fa.cx, fs.cy - fa.cy);
  const drift = Math.hypot(fb.cx - fs.cx, fb.cy - fs.cy);
  // Toward B on the plate: B's grid point less A's.
  const dirB = { x: pB.x - f0p.x, y: pB.y - f0p.y };
  const along = ((fs.cx - fa.cx) * dirB.x + (fs.cy - fa.cy) * dirB.y) / Math.max(1e-6, Math.hypot(dirB.x, dirB.y));
  check('Finger carries the dye along the stroke', along > 0.005,
    `centre of mass moved ${(along * 100).toFixed(1)}% of the plate toward where the stroke went`);
  // The plate's own change over the same time is part of the slack, as for
  // the Press below: it is measured once, and it moved by +68 on a run where
  // the stroke landed 82 under it against an allowance of 80.
  check('and adds none', Math.abs((fb.total - fa.total) - fDrift) < 0.15 * fa.total + 5 + Math.abs(fDrift),
    `${fa.total.toFixed(0)} → ${fb.total.toFixed(0)}, against ${fIdle >= 0 ? '+' : ''}${fIdle.toFixed(0)} before and ${fIdleAfter >= 0 ? '+' : ''}${fIdleAfter.toFixed(0)} after with the plate left alone as long`);
  check('and stops when the hand stops', drift < Math.max(0.003, 0.5 * moved),
    `${(moved * 100).toFixed(1)}% moved during the stroke, ${(drift * 100).toFixed(1)}% while held still after it`);

  // ── Blow and Press ──────────────────────────────────────────────
  for (const t of ['blow', 'press']) {
    await clear();
    await pool(A);
    const idle = await idleChange(A, 2500);
    const p = await snap(`${t}0`);
    await hold(t, A, 1500);
    await settle(700);
    await snap(`${t}1`);
    // Held still, the Blow is a straw: it blows a bubble, and what it clears
    // is what is under the bubble, pushed out to the bubble's rim.
    let bubble = null;
    if (t === 'blow') {
      const bub = await page.evaluate(() => {
        const d = window.chromaglassDebug(); const n = d.gridSize;
        return (d.bubbles?.bubbles ?? []).filter((b) => b.straw).map((b) => ({ x: b.x, y: b.y, r: b.r / n }));
      });
      bubble = bub.sort((u, v) => v.r - u.r)[0] ?? null;
      console.log(`     the straw blew ${bub.length} bubble(s)${bubble ? `, the biggest ${bubble.r.toFixed(3)} of the plate across its radius` : ''}`);
    }
    const a = await measure(`${t}0`, p, 0.05, 0.25), b = await measure(`${t}1`, p, 0.05, 0.25);
    if (t === 'blow') {
      if (!bubble) { check('Blow held still blows a bubble', false, 'no bubble on the plate'); continue; }
      const at = { x: bubble.x, y: bubble.y };
      const under0 = await measure(`${t}0`, at, bubble.r * 0.6, bubble.r * 1.6);
      const under1 = await measure(`${t}1`, at, bubble.r * 0.6, bubble.r * 1.6);
      check('Blow held still clears the dye from under the bubble it blows', under1.disc < 0.3 * under0.disc + 2,
        `${under0.disc.toFixed(0)} → ${under1.disc.toFixed(0)} under it`);
      // Moved to the rim, not made: what was under it and round it, against the plate left alone.
      const was = under0.disc + under0.ring, now = under1.disc + under1.ring;
      /*
        And the whole plate, on the record. This judges what is under the
        bubble and round it, so dye carried in from further out reads as made
        (CI: 480 -> 1092 against +47 left alone, failing a deploy). The plate's
        total says which it was, so the next failure shows moved or made
        (from #158, folded in with PLAN 15d).
      */
      console.log(`     the plate as a whole ${a.total.toFixed(0)} → ${b.total.toFixed(0)} across the blow, against ${idle >= 0 ? '+' : ''}${idle.toFixed(0)} left alone`);
      check('and pushes it out to the rim rather than making more', now - was - idle < 0.5 * was + 5 + 3 * Math.abs(idle),
        `${was.toFixed(0)} → ${now.toFixed(0)} under it and round it, against ${idle >= 0 ? '+' : ''}${idle.toFixed(0)} left alone`);
    } else {
      check('Press pushes the dye out from under the palm', b.disc < 0.8 * a.disc,
        `${a.disc.toFixed(0)} → ${b.disc.toFixed(0)} under it, ${a.ring.toFixed(0)} → ${b.ring.toFixed(0)} from 0.05 to 0.25`);
      /*
        Loses none, and makes no more than it had. Not 'keeps it exactly', as
        the Finger does: the press squeezes the film, the gap under the palm
        closes and the liquid runs out from under it, and the solver carries
        the dye's concentration through that spreading flow without thinning
        it, so a press can add up to about as much again as it had (CI:
        +64, +253 beyond the plate left alone). That is the dye advection,
        not the tool, and it is tracked on its own (a conserving advection
        where the flow spreads, which touches the beat squeeze, bubbles and
        currents too).
      */
      /*
        The slack is the plate's own: what it did alone over the same time,
        not a fixed 5. The pool a press sits in varies by run (90 to 374 of
        dye round the hand), and on a small one a fixed 5 was less than the
        plate moves by itself (-11 to +70 left alone), so the check failed on
        whether the idle sample landed high or low (CI: 90 -> 194 against -11,
        the same press that passed at 374 -> 554 against +70).
      */
      const slack = 5 + 3 * Math.abs(idle);
      const made = (b.total - a.total) - idle;
      check('and keeps it', made > -0.15 * a.total - slack && made < 1.0 * a.total + slack,
        `${a.total.toFixed(0)} → ${b.total.toFixed(0)}, against ${idle >= 0 ? '+' : ''}${idle.toFixed(0)} with the plate left alone as long`);
    }
  }

  // ── Press, let go, on a thin gap ────────────────────────────────
  /*
    The owner, 2026-09-28: the Press "just pushes everything out instead of
    bringing it back when you release". With Thin Gap on, the flow between
    the glasses is reversible, so what the glass pushed out it draws back
    as it lifts; this asks it of the app, through the real pointer, on
    Classic. Measured as the colour's mean distance from the palm, over the
    whole cleared plate: it has to grow under the press, and once the hand
    lets go a half of that growth has to come back within three seconds
    (the lab's `npm run presslift` reads the same colour, under the palm,
    77% back at 3 s on Classic's glass, and its ring 72%; a glass on the
    look's clock, as it was, came back 4% in the first second, and a carry
    that moved the colour out to a ring never brought it back at all). Turned off again after, so nothing
    below or in later checks runs on it.

    Two controls. The same press with Thin Gap off, the Press the owner
    reported, which must come back less than half: a check that passed it
    would not be measuring the fault. And each pool against itself: a pool
    on this plate keeps spreading on its own (the look's flow and the dye's
    spread), so before the hand comes down the same pool is watched for three
    of the plate's seconds, and that drift is taken off what the press and
    the lift do. The mean distance also falls if colour is lost from the
    outside of the pool (the look's own fade, or colour pushed over the
    dish's rim), and would read as colour come back, and rises if colour
    under the palm is deleted rather than moved (the old press's cleared
    centre): so neither the press nor the lift may lose more colour than
    the pool lost on its own over the drift window (5% of it, for the
    plate's own flicker).
  */
  {
    /*
      Held and let go in the plate's own seconds, not the page's. The first
      Mac run held the Press 1.5 s and waited 3 s by the wall clock, and read
      it pushed out 0.027 and a third back; on a runner that cannot keep the
      step rate, the solver runs fewer steps than the wall's seconds and the
      glass both closes and lifts less (the glass springs in the show's
      seconds, `dtSeconds` a step). So each wait counts the solver's steps,
      times what each stands for, and prints how long it took.
    */
    const waits = [];
    const plateWait = async (seconds, record = true) => {
      const t0 = Date.now();
      const read = () => page.evaluate(() => { const f = window.chromaglassDebug().fluids?.[0]; return { n: f?.stepIndex ?? -1, dt: f?.dtSeconds ?? 0 }; });
      const a = await read();
      let b = a;
      while (Date.now() - t0 < seconds * 8000 + 5000) {
        await settle(50);
        b = await read();
        if (a.n >= 0 && b.dt > 0 && (b.n - a.n) * b.dt >= seconds) break;
      }
      const plate = a.n >= 0 ? (b.n - a.n) * b.dt : 0;
      if (record) waits.push(`${plate.toFixed(2)} s of plate in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      return plate >= seconds;
    };
    /*
      The pool settles for twelve of the plate's seconds before anything is
      read, and the hand holds for two and a half. With 1.5 s of the wall's
      the pool was a fresh drop still spreading, as fast as the press's
      whole net push (the idle pool 0.009 to 0.016 out in three seconds
      against pushes of 0.015 to 0.020), and one run passed a press whose
      own colour never came in (0.077 → 0.076; check-skeptic). Settled eight
      seconds it still drifted 0.012 in three against a push of 0.023, so
      the push is made longer and the drift smaller.
    */
    const settlePool = () => plateWait(12, false);
    const HOLD = 2.5;
    let timed = true;
    /*
      One press and let go on a settled pool at A. Read four times: settled;
      three of the plate's seconds later with nothing touching it (its own
      drift); held down HOLD seconds; three seconds after letting go.

      Each pool is its own control. The runs before this laid a second,
      idle pool as the control, and the two pools of one run started 15 to
      40% apart in mean distance (37148523629: 0.105 against 0.072; the
      re-run of 37150787513: 0.071 against 0.084) and drifted at different
      rates, so the control's noise was as big as the effect.
    */
    const pressLift = async (name) => {
      await clear();
      await pool(A);
      await settlePool();
      const where = await snap(`${name}0`);
      timed = (await plateWait(3)) && timed;
      await snap(`${name}1`);
      await tool('press');
      await settle(300);
      await page.mouse.move(...screen(...A));
      await page.mouse.down();
      timed = (await plateWait(HOLD)) && timed;
      await snap(`${name}2`);
      await page.mouse.up();
      timed = (await plateWait(3)) && timed;
      await snap(`${name}3`);
      return where;
    };
    const spread = (keep, at) => page.evaluate(({ keep, at }) => {
      const s = window.__toolSnaps[keep];
      const n = s.n; let w = 0, d = 0, near = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = Math.max(0, s.data[x + y * n]);
        if (!Number.isFinite(v)) continue;
        const r = Math.hypot(x - at.x, y - at.y) / n;
        w += v; d += v * r;
        if (r < 0.05) near += v;
      }
      // A snapshot with no colour would read a mean of 0 and agree to anything below (check-skeptic): it stops the check instead.
      if (!(w > 5)) throw new Error(`${keep}: no colour on the plate to measure`);
      return { total: w, mean: d / w, under: near / w, step: s.step, dt: s.dt };
    }, { keep, at });
    const readRun = async (name, at) => Promise.all([0, 1, 2, 3].map((k) => spread(`${name}${k}`, at)));

    /*
      Each solver set, and the plate left three seconds, before its pool:
      the fifth Mac run laid its pools straight after a change of Thin Gap
      with less colour and further out than the others.
    */
    /*
      On the calm plate (scripts/mirror.mjs's CALM: no turbulence, no sound
      driving the flow, no rocking, rain or spin), where anything the hand
      did not do stands out. On Classic as it plays, a pool settled twelve
      seconds still drifted out 0.0041 of the plate a second, so over the
      three seconds after the lift the drift (0.012) was half the press's
      whole push (0.023, run 37163762683): a press frozen at the lift read
      54%, and the check could not tell. The Press is the same Press; the
      plate's own stirring, which no lift can undo, is what is taken away.
      And no bubbles: the page's first click (an earlier check's) starts the
      built-in band, whose kicks drop bubbles near the middle of the plate
      whatever Audio Impact says, and a bubble is a held press of its own
      (#225; the mirror check's thread found the band there, #238). Bubbles
      at 0 clears the look's and stops the kicks laying more. Put back after.
    */
    const before = await page.evaluate(() => ({ ...window.chromaglassSettings?.() }));
    await page.evaluate(() => window.chromaglassSettings?.({
      thinGap: 0, turbulenceScale: 0, audioImpact: 0, plateRock: 0, beatSqueeze: 0, buoyancy: 0,
      rainDrip: 0, glassSmear: 0, vibrationFrequency: 0, centerGravity: 0, rotationSpeed: 0, spinImpulse: 0, bubbles: 0,
      audioMappings: { velocity: 'none', density: 'none', color: 'none', rotation: 'none' },
    }));
    await settle(3000);
    // The Press as the owner has it, Thin Gap off.
    const at = await pressLift('off');
    const off = await readRun('off', at);

    await page.evaluate(() => window.chromaglassSettings?.({ thinGap: 1 }));
    // The thin gap's pipelines are built when it is first asked for; the plate runs the old way until they are in.
    const thinBy = Date.now() + 20000;
    let thin = false;
    while (!thin && Date.now() < thinBy) {
      await settle(250);
      thin = await page.evaluate(() => !!window.chromaglassDebug().fluids?.[0]?.thinGap);
    }
    await settle(3000);
    const on = await readRun('lift', await pressLift('lift'));
    await page.evaluate((b) => window.chromaglassSettings?.({ ...b, thinGap: 0 }), before);

    /*
      Net of the pool's own drift. `drift` is how far its mean moved a
      plate second over the three before the hand. The push is what the
      held pool did beyond that drift over the hold (the 0.3 s to pick the
      tool adds a hundredth of the drift window's change, against it); the
      return is how far it came in over the three seconds after letting go,
      plus the three seconds of drift it would otherwise have made, as a
      share of the push. Reversible flow brings the pool back to where it
      would have drifted to had the glass never moved: that is 100%. The
      lab's colour under the palm (`npm run presslift`) is 77% back at 3 s,
      and the bar is half.

      And the drift must not do the work: a press frozen where the hand left
      it, its colour not moving at all after the lift, has to read under
      half (check-skeptic's control: on an earlier run's numbers the frozen
      press read 107%), and the pressed colour's own mean has to fall. The
      push has to be real: the mean grows by a fifth more than the drift,
      which is the film under the palm thinned by a third (the colour moving
      with its liquid stretches by √(h₀/h)); the lab's press grows it ×2.13.
    */
    // Each window's length in the plate's seconds as the solver stepped it, not the wait asked for (a wait stops past its target, and the hold holds the 0.3 s tool pick too).
    const span = (a, b) => (b.step - a.step) * b.dt;
    const drift = (r) => (r[1].mean - r[0].mean) / Math.max(span(r[0], r[1]), 1e-3);
    const pushOf = (r) => (r[2].mean - r[1].mean) - drift(r) * span(r[1], r[2]);
    const backOf = (r) => (pushOf(r) > 0 ? ((r[2].mean - r[3].mean) + drift(r) * span(r[2], r[3])) / pushOf(r) : 0);
    /*
      And a quarter of the push has to come back on its own, before any drift
      is credited. The frozen press rules out a return of nothing; it does not
      rule out a token return plus a drift that slowed after the press (a
      pushed-out pool spreads more slowly), which the pre-press rate then
      over-credits: with drift 0.004 a second halving under the hand and a 2%
      return on a 0.03 push, the formula reads 50% (check-skeptic). With this
      the drift can supply at most half the bar.
    */
    const cameIn = (r) => r[2].mean - r[3].mean >= 0.25 * pushOf(r);
    const pushed = (r) => pushOf(r) > 0.2 * r[1].mean;
    const frozen = (r) => [r[0], r[1], r[2], { ...r[2], step: r[3].step, dt: r[3].dt }];
    const resolves = (r) => backOf(frozen(r)) < 0.5;
    const ratio = (a, b) => (a.total > 0 ? b.total / a.total : 0);
    const own = (r) => ratio(r[0], r[1]);
    const pressKept = ratio(on[1], on[2]), liftKept = ratio(on[2], on[3]);
    const laid = on[0].total > 5 && off[0].total > 5;
    const timing = timed ? `; waited ${waits.join(', ')}` : `; the plate did not step through every wait: ${waits.join(', ')}`;
    const frozenNote = resolves(on) ? '' : `; the pool drifted too much to tell: a press frozen at the lift would read ${(backOf(frozen(on)) * 100).toFixed(0)}% back`;
    const fmt = (r) => r.map((x) => x.mean.toFixed(3)).join(' → ');
    // Printed, not asserted: the share of the colour within 0.05 of the palm, as the lab's presslift reads it.
    const under = (r) => r.map((x) => `${(x.under * 100).toFixed(0)}%`).join(' → ');
    check('Press on a thin gap pushes the colour out from under the palm',
      thin && timed && laid && pushed(on) && pressKept >= own(on) - 0.05,
      !thin ? 'the plate never ran as a thin gap' : `the colour's mean distance from the palm ${fmt(on)} (settled, its own drift, held down, let go): drifting ${drift(on).toFixed(4)} a second, pushed ${pushOf(on).toFixed(3)} net, against a fifth of ${on[1].mean.toFixed(3)}; ${(pressKept * 100).toFixed(0)}% of the colour kept against its own ${(own(on) * 100).toFixed(0)}% before the hand${timing}`);
    check('and draws it back when the hand lets go, where the Press as it was did not',
      thin && timed && laid && pushed(on) && resolves(on) && cameIn(on) && backOf(on) >= 0.5 && liftKept >= own(on) - 0.05
        && pushed(off) && backOf(off) < 0.5,
      `${on[2].mean.toFixed(3)} → ${on[3].mean.toFixed(3)} three of the plate's seconds after letting go: ${(backOf(on) * 100).toFixed(0)}% of the way back net of its drift, ${(((on[2].mean - on[3].mean) / Math.max(pushOf(on), 1e-6)) * 100).toFixed(0)}% before it (a quarter needed); ${(liftKept * 100).toFixed(0)}% of the colour kept against its own ${(own(on) * 100).toFixed(0)}%; with Thin Gap off (the control) ${fmt(off)}, pushed ${pushOf(off).toFixed(3)} net, ${(backOf(off) * 100).toFixed(0)}% back${frozenNote}`);
    console.log(`     the colour within 0.05 of the palm: pressed on the thin gap ${under(on)}; Thin Gap off ${under(off)}`);
    console.log(`     the Press's waits, in the plate's seconds: ${waits.join(', ')}`);
  }
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
