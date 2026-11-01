/**
 * The ladder's lines written ahead of their builds (PLAN.md Wave 4: 14b-120,
 * 14c-4k, 14c-governor, 14c-readout and H2c-10 in
 * docs/plan/40-specs-frame-gig-desk.md), run by `npm run rungs` and written in
 * a module beside it because rungs.mjs is past 40 KB.
 *
 * Each line here measures something main does not do yet, so each is listed
 * in `--owed=` in scripts/checks.json and printed as owed while it fails, and
 * each is red the day it passes with its id still listed: the PR that ships
 * one takes its id out (the convention of `wallflash.mjs`, `liveshow.mjs` and
 * `soapbreak`). An owed line is excused only in main's state, the thing it
 * asks for not there at all (no `paceTo` on the gate, no `carry` on the
 * governor, no `engineLabel` export, a grid rounded to even only, a 4K wall
 * opening on all of itself); a build that is there and misses is red, owed
 * or not. The builder never moves a bar here (docs/handoff.md).
 *
 * Three of the five need something to call that does not exist yet, so the
 * line names it and that name is the contract the build implements:
 *
 *   - 14b-120: `DrawGate.paceTo`, `'faster'` (today's rule, the default) or
 *     `'wall'`, set by the show when the wall is the output. With `'wall'`
 *     the gate paces draws to the wall's refresh and the desk's preview takes
 *     the same frames.
 *   - 14c-governor: `QualityGovernor.carry(from, rungs, start, now, pin?)`, a
 *     static that builds the governor for a new ladder carrying the old one's
 *     step-rate give-up and its failed-rung marks (by rung, grid and share,
 *     since the two ladders' indices differ). `govern()` in the visualizer
 *     calls it in place of `new QualityGovernor` when a wall comes or goes.
 *   - 14c-readout: `engineLabel({ grid, dpr, post, stage })` exported from
 *     src/sim/stepping.ts beside `postLevelLabel`, the readout's text, which
 *     today is a template inline in LiquidVisualizer.tsx.
 */

export const RUNGS_OWED = ['4k', 'governor', '120', 'readout', 'grid32'];

export async function owedLines({ check, ladderAt, canvasPixelsFor, CAP, WINDOW, QualityGovernor, DrawGate }) {
  /*
    src/sim/stepping.ts holds both the grid's rounding and the readout's
    label, and imports the GPU kit, whose module reads WebGPU's usage flags
    as it loads: given empty ones here, as node has none, and imported late
    so that nothing else in `rungs` sees them.
  */
  for (const k of ['GPUTextureUsage', 'GPUBufferUsage', 'GPUShaderStage', 'GPUMapMode', 'GPUColorWrite']) globalThis[k] ??= {};
  const stepping = await import('../src/sim/stepping');
  const { resolveSimResolution } = stepping;
  const flag = process.argv.find((a) => a.startsWith('--owed='));
  const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
  const unknown = [...owed].filter((id) => !RUNGS_OWED.includes(id));
  if (unknown.length) check('every id in --owed is a line of rungs-owed.mjs', false, `unknown: ${unknown.join(', ')} (known: ${RUNGS_OWED.join(', ')})`);
  // `mainState`: the line's feature is absent, which is the only state an owed line is excused in.
  const line = (id, name, ok, detail, mainState) => {
    if (!owed.has(id)) return check(name, ok, detail);
    if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
    if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
    console.log(` owed  ${name} — ${detail}`);
  };
  const mpx = (p) => p.width * p.height / 1e6;

  // ── 14c-4k: a 4K wall opens at the share whose pixels it can shade ──
  {
    const K4 = { width: 3840, height: 2160 };
    const opened = [];
    let worst = 0;
    for (const devicePx of [1, 2]) {
      for (const tier of ['hosted', 'local']) {
        for (const gpu of ['mid', 'strong']) {
          const { rungs, start } = ladderAt(tier, gpu, devicePx, K4);
          const px = canvasPixelsFor(rungs[start].dpr, K4, CAP, WINDOW);
          worst = Math.max(worst, mpx(px));
          opened.push(`${devicePx}x ${tier} ${gpu}: ${rungs[start].grid}² at ${px.width}x${px.height}`);
        }
      }
    }
    line('4k', '14c-4k: a 3840×2160 stage opens at a share of at most 4.7 Mpx (the 0.75 share), and not below 4.0', worst <= 4.7 && worst >= 4.0,
      `the most opened on: ${worst.toFixed(2)} Mpx; ${opened.join('  ·  ')}`, worst > 8);
  }

  // ── 14b-120: a 120 Hz desk with a 60 Hz projector, the wall the output ──
  {
    /*
      The two clocks of wall.mjs's arithmetic at their plainest (no jitter,
      no draw cost: a gate that holds the rate there is not yet one that holds
      it everywhere, which wall.mjs's sweep asks of the default rule): the
      show's frames at 120, the projector's asks at 60, ten phases between
      them. Today's rule paces to the faster display, 120 draws a second,
      every other one of which the wall never shows.
    */
    const draws = (paceTo, showHz, wallHz, phase) => {
      const gate = new DrawGate();
      if (paceTo) gate.paceTo = paceTo;
      const ev = [];
      for (let t = 0; t < 4000; t += 1000 / showHz) ev.push(['frame', t]);
      for (let t = phase; t < 4000; t += 1000 / wallHz) ev.push(['ask', t]);
      ev.sort((a, b) => a[1] - b[1]);
      let n = 0;
      for (const [source, t] of ev) if (gate.offer(source, t) && t >= 1000) n++;
      return n / 3;
    };
    const has = 'paceTo' in new DrawGate();
    const phases = Array.from({ length: 10 }, (_, i) => (i / 10) * (1000 / 60));
    const wall = phases.map((p) => draws('wall', 120, 60, p));
    const hi = Math.max(...wall), lo = Math.min(...wall);
    line('120', '14b-120: the wall the output, a 120 Hz desk and a 60 Hz projector draw at most 62 a second, and at least 57',
      has && hi <= 62 && lo >= 57, `${has ? '' : 'no DrawGate.paceTo; '}${lo.toFixed(1)} to ${hi.toFixed(1)} a second over ten phases`, !has);
  }

  // ── 14c-governor: a wall coming and going keeps the governor's memory ──
  {
    /*
      The hunting machine of rungs.mjs (PLAN.md 14j): a laptop that cannot
      hold its opening rung (26 ms frames there, 16 ms one below), which the
      governor learns to retry less and less often. Six minutes in, a wall
      opens for a minute (a 1080p stage, which holds), then closes, and the
      governor is rebuilt both times, as `govern()` rebuilds it. Counted: the
      rung changes in the ten minutes after the wall closes, against the same
      ten minutes of the same machine with no wall at all.
    */
    const laptop = ladderAt('local', 'strong', 2);
    const P1080 = { width: 1920, height: 1080 };
    const wallLadder = ladderAt('local', 'strong', 2, P1080);
    const has = typeof QualityGovernor.carry === 'function';
    const rebuild = (from, ladder, start, now) => has ? QualityGovernor.carry(from, ladder.rungs, start, now) : new QualityGovernor(ladder.rungs, start, now);
    /*
      And it still governs. A carry that gave up (a governor that never moves
      again) would make no changes at all and pass the count, so after the
      ten minutes the machine slows (40 ms frames on every rung) and the
      governor must step down within 20 s, and it must be on the laptop's
      own ladder (the check-skeptic).
    */
    let after = null;
    const run = (cycle) => {
      let g = new QualityGovernor(laptop.rungs, 1, 0);
      let onWall = false;
      let now = 0;
      const moves = [];
      while (now < 1020) {
        if (cycle && !onWall && now >= 360 && now < 420) { g = rebuild(g, wallLadder, wallLadder.start, now); onWall = true; }
        if (cycle && onWall && now >= 420) { g = rebuild(g, laptop, laptop.start, now); onWall = false; }
        const ms = !onWall && g.rungIndex <= 1 ? 26 : 16;
        now += ms / 1000;
        if (g.sample(ms / 1000, 1, now, false, ms - 10) && now >= 420) moves.push({ at: now, index: g.rungIndex });
      }
      if (cycle) {
        const from = { index: g.rungIndex, rate: g.stepRate };
        let down = Infinity;
        for (const end = now + 20; now < end && down === Infinity;) {
          now += 0.04;
          g.sample(0.04, 1, now, false, 30);
          if (g.rungIndex > from.index || g.stepRate < from.rate) down = now - 1020;
        }
        after = { down, laptop: g.rungs === laptop.rungs || JSON.stringify(g.rungs) === JSON.stringify(laptop.rungs) };
      }
      return moves;
    };
    const quiet = run(false), cycled = run(true);
    const firstClimb = (moves) => moves.find((m, i) => i > 0 && m.index < moves[i - 1].index)?.at ?? Infinity;
    line('governor', '14c-governor: a wall opened and closed costs no more rung changes in the next ten minutes than no wall',
      cycled.length <= quiet.length && firstClimb(cycled) >= firstClimb(quiet) - 5 && after.laptop && after.down <= 20,
      `${has ? '' : 'no QualityGovernor.carry; '}${cycled.length} changes after the wall (first climb back at ${firstClimb(cycled).toFixed(0)} s) against ${quiet.length} with none (${firstClimb(quiet).toFixed(0)} s); on the laptop's ladder ${after.laptop}; slowed, it gives something up after ${after.down.toFixed(1)} s`, !has);
  }

  // ── 14c-readout: the readout says what the share is of ──
  {
    const engineLabel = stepping.engineLabel;
    const has = typeof engineLabel === 'function';
    const cases = [[512, 1, ''], [768, 0.75, ' · effects ½'], [384, 1.5, ' · effects off']];
    const today = ([grid, dpr, post]) => `WebGPU · ${grid}² · ${dpr.toFixed(1)}x${post}`;
    const same = has && cases.every((c) => engineLabel({ grid: c[0], dpr: c[1], post: c[2], stage: false }) === today(c));
    const walled = has ? cases.map((c) => engineLabel({ grid: c[0], dpr: c[1], post: c[2], stage: true })) : [];
    const says = walled.length === cases.length && walled.every((t, i) => t.includes('of the wall') && t.startsWith(`WebGPU · ${cases[i][0]}² · ${cases[i][1].toFixed(1)}x`));
    line('readout', '14c-readout: with a stage the readout says "of the wall", without one it is byte for byte today\'s',
      same && says, has ? `with a stage: ${walled.map((t) => JSON.stringify(t)).join(', ')}; without one ${same ? 'unchanged' : 'changed'}` : 'no engineLabel export in src/sim/stepping.ts', !has);
  }

  // ── H2c-10: a pinned grid is a multiple of 32 ──
  {
    const governor = { rung: { grid: 512 } };
    const asked = [514, 1000, 777, 100];
    const got = asked.map((n) => resolveSimResolution(n, governor, CAP));
    const want = asked.map((n) => Math.round(n / 32) * 32);
    line('grid32', 'H2c-10: a pinned grid is rounded to the nearest multiple of 32 (up on a tie)',
      got.every((g, i) => g === want[i]), asked.map((n, i) => `${n} → ${got[i]} (want ${want[i]})`).join(', '),
      got.some((g) => g % 32 !== 0) && got.every((g) => g % 2 === 0));
  }
}
