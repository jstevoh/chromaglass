/**
 * The shape of the quality ladder, and what a step down it actually buys.
 *
 * The governor has no cost model. It walks a list of rungs — a solver grid
 * and a share of the display's pixels — one step at a time, down when frames
 * are slow and up when they are fast. **The order of that list is its whole
 * model**, so a rung that costs the same as the one above it is a rung the
 * governor will spend a step-down and a settling period discovering, in the
 * middle of a show that is already struggling.
 *
 *   npm run rungs
 *
 * Two things went wrong here and neither was visible from inside the app.
 *
 * The **pixel rungs were inert**. A rung's `dpr` is its share of the
 * display's pixels, and the renderer's own canvas sizing read the display's
 * ratio instead — so a step from 512² at 2x to 512² at 1x wrote a new number
 * into the readout and left the canvas at full resolution. `npm run ladder`
 * found it: the canvas was 2560×1600 on all five rungs of a five-rung
 * ladder. The governor gave up quality, believed it had bought headroom,
 * found none, and went looking for the next thing to give up.
 *
 * And on a display with one pixel per pixel — a projector, most external
 * monitors — `{512, dpr}` and `{512, 1}` are **the same rung written twice**.
 *
 * A third was read in the code rather than found by a run (PLAN.md §14c):
 * with a projector attached, **the wall's pixels came from the laptop's
 * ratio**, so a Retina laptop drew a 1080p wall at 960×540 and a 1x laptop
 * drew a 4K wall at full size on every rung. A stage has its own ladder now,
 * checked below, and the laptop's ladder with no stage is held to a fixture
 * of what it was.
 *
 * Both are arithmetic, so both can be checked here rather than by watching a
 * projector and wondering. `npm run ladder` is the other half: what each
 * rung costs on a real GPU.
 */

import { qualityLadder, canvasPixelsFor } from '../src/lib/platform';
import { LEARNABLE_SETTINGS, curveOf, settingKeyOf, valueAt, travelOf, handValueAt } from '../src/lib/midi';
import { readSetting } from '../src/lib/readout';
import { QualityGovernor, STEP_RATES } from '../src/lib/governor';

const checks = [];
const check = (what, ok, detail = '') => checks.push([what, ok, detail]);

const WINDOW = { width: 1280, height: 800 };
const STAGE = { width: 1920, height: 1080 };
const CAP = 8192;

// ── The ladder's shape ───────────────────────────────────────────────
//
// `qualityLadder` reads `window.devicePixelRatio` through `devicePixels()`,
// so a stand-in window is enough to ask it for the ladder a given display
// would be given. `stage` is a projector's own pixels, as the wall window
// announces them, or null for the laptop alone.
const ladderAt = (tier, gpu, devicePx, stage = null, gridCap = Number.POSITIVE_INFINITY) => {
  globalThis.window = {
    devicePixelRatio: devicePx,
    location: { search: '', hostname: 'localhost' },
    innerWidth: WINDOW.width,
    innerHeight: WINDOW.height,
  };
  return qualityLadder(tier, gpu, stage, gridCap);
};

for (const devicePx of [1, 1.5, 2, 3]) {
  for (const tier of ['hosted', 'local']) {
    const { rungs, start } = ladderAt(tier, 'strong', devicePx);
    const keys = rungs.map((r) => `${r.grid}:${r.dpr.toFixed(3)}`);
    check(`${tier} at ${devicePx}x: no rung is another rung written twice`,
      new Set(keys).size === keys.length, keys.join('  '));
    check(`${tier} at ${devicePx}x: it starts on a rung it has`,
      start >= 0 && start < rungs.length, `start ${start} of ${rungs.length}`);
    // Down the ladder is down: never a finer grid or more pixels than the
    // rung above, or a step down would be a step up in cost.
    let ordered = true;
    for (let i = 1; i < rungs.length; i++) {
      const a = rungs[i - 1], b = rungs[i];
      if (b.grid > a.grid || b.dpr > a.dpr) ordered = false;
    }
    check(`${tier} at ${devicePx}x: every step down gives something up`, ordered,
      rungs.map((r) => `${r.grid}@${r.dpr.toFixed(2)}`).join(' → '));
  }
}

{
  const { rungs } = ladderAt('local', 'strong', 1);
  console.log(`\n  a 1x display's local ladder: ${rungs.map((r) => `${r.grid}²@${r.dpr.toFixed(2)}`).join('  ')}`);
  const two = ladderAt('local', 'strong', 2).rungs;
  console.log(`  a 2x display's local ladder: ${two.map((r) => `${r.grid}²@${r.dpr.toFixed(2)}`).join('  ')}\n`);
  /*
    Counting rungs was the old way of saying this and it stopped being true
    the moment a 1x display gained a grid rung of its own (1024², H3): both
    ladders are five long now, and the check passed on an arithmetic
    coincidence rather than on the property it describes.

    The property is about *what a step gives up*. A rung that differs from
    the one above it only in pixels can only exist where there are pixels to
    give up, so a 1x ladder must have none and a 2x ladder must have some.
  */
  const pixelOnly = (rs) => rs.filter((r, i) => i > 0 && rs[i - 1].grid === r.grid).length;
  check('a step that gives up only pixels exists only where there are pixels to give up',
    pixelOnly(rungs) === 0 && pixelOnly(two) > 0,
    `1x has ${pixelOnly(rungs)} such steps, 2x has ${pixelOnly(two)}`);

  /*
    And 1024² is offered where it was measured to hold and nowhere else.
    `npm run ladder --device-pixels 2` puts it at 44.7 ms and 22 fps against
    the 30 the gate asks for, where one device pixel gives 30.8 ms and 32.
    The step costs the same either way — it is the grid, not the pixels —
    and what breaks it is shading four times the canvas.
  */
  check('1024² is offered at one device pixel and not at two',
    rungs.some((r) => r.grid === 1024) && !two.some((r) => r.grid === 1024),
    `1x: ${rungs.map((r) => r.grid).join(',')}  ·  2x: ${two.map((r) => r.grid).join(',')}`);
}

// ── With no wall, the laptop's ladder is the one it always had ───────
//
// PLAN.md §14c changed what the ladder is when a projector is attached, and
// the operating rules say a change keeps today's look wherever it was not
// asked to change anything. Without a stage that is everywhere: the laptop's
// own screen, the phone (which never has a stage; see §14c in PLAN.md), a
// Chromecast or a network display running its own show.
//
// So this is a fixture, not a formula. Every line was printed by the ladder
// as it stood before §14c (main at 33ad11c, #191), for each tier and each ratio a
// real screen has (1.25 and 1.5 are Windows scaling, 2.625 an Android
// phone), and a ladder that differs from it by one rung or one start is a
// changed show on a machine nobody attached a projector to. Written out
// rather than recomputed, because a check that rebuilt the ladder the way
// the code does would agree with the code whatever the code did.
{
  const TODAY = `
    hosted 1x: 512@1 384@1 256@1 | weak 2, mid 1, strong 0
    hosted 1.25x: 512@1.25 512@1 384@1 256@1 | weak 3, mid 2, strong 1
    hosted 1.5x: 512@1.5 512@1 384@1 256@1 | weak 3, mid 2, strong 1
    hosted 2x: 512@1.5 512@1 384@1 256@1 | weak 3, mid 2, strong 1
    hosted 2.625x: 512@1.5 512@1 384@1 256@1 | weak 3, mid 2, strong 1
    hosted 3x: 512@1.5 512@1 384@1 256@1 | weak 3, mid 2, strong 1
    local 1x: 1024@1 768@1 512@1 384@1 256@1 | weak 4, mid 3, strong 2
    local 1.25x: 768@1.25 512@1.25 512@1 384@1 256@1 | weak 4, mid 3, strong 2
    local 1.5x: 768@1.5 512@1.5 512@1 384@1 256@1 | weak 4, mid 3, strong 2
    local 2x: 768@2 512@2 512@1 384@1 256@1 | weak 4, mid 3, strong 2
    local 2.625x: 768@2.625 512@2.625 512@1 384@1 256@1 | weak 4, mid 3, strong 2
    local 3x: 768@3 512@3 512@1 384@1 256@1 | weak 4, mid 3, strong 2
    native 1x: 1024@1 768@1 512@1 384@1 256@1 | weak 4, mid 3, strong 2
    native 1.25x: 768@1.25 512@1.25 512@1 384@1 256@1 | weak 4, mid 3, strong 2
    native 1.5x: 768@1.5 512@1.5 512@1 384@1 256@1 | weak 4, mid 3, strong 2
    native 2x: 768@2 512@2 512@1 384@1 256@1 | weak 4, mid 3, strong 2
    native 2.625x: 768@2.625 512@2.625 512@1 384@1 256@1 | weak 4, mid 3, strong 2
    native 3x: 768@3 512@3 512@1 384@1 256@1 | weak 4, mid 3, strong 2
  `.trim().split('\n').map((l) => l.trim());
  const differ = [];
  for (const want of TODAY) {
    const [, tier, px] = /^(\w+) ([\d.]+)x:/.exec(want);
    const starts = [];
    // Every class's rungs, not only the last one's: the fixture's one line
    // of rungs is a claim that all three classes share it.
    const rungSets = new Set();
    for (const gpu of ['weak', 'mid', 'strong']) {
      const l = ladderAt(tier, gpu, Number(px));
      rungSets.add(l.rungs.map((r) => `${r.grid}@${+r.dpr.toFixed(3)}`).join(' '));
      starts.push(`${gpu} ${l.start}`);
    }
    const got = `${tier} ${px}x: ${[...rungSets].join(' / ')} | ${starts.join(', ')}`;
    if (got !== want) differ.push(`${got}  (was ${want.split(': ')[1]})`);
    // A software adapter gets one rung everywhere, stage or none.
    const soft = ladderAt(tier, 'software', Number(px));
    if (soft.rungs.length !== 1 || soft.rungs[0].grid !== 256 || soft.rungs[0].dpr !== 1 || soft.start !== 0) {
      differ.push(`${tier} ${px}x software: ${soft.rungs.map((r) => `${r.grid}@${r.dpr}`).join(' ')} from ${soft.start}`);
    }
  }
  check('with no stage, every tier at every ratio has the ladder and the start it had before §14c',
    differ.length === 0, differ.length ? differ.slice(0, 3).join('  ·  ') : `${TODAY.length} ladders, 3 GPU classes each, unchanged`);
}

// ── What a rung does to the canvas ───────────────────────────────────
//
// The half that was inert. These are the numbers the renderer now uses, so
// a regression here is a regression there.
{
  const full = canvasPixelsFor(2, null, CAP, WINDOW);
  const half = canvasPixelsFor(1, null, CAP, WINDOW);
  check('halving a rung\'s pixels halves the canvas',
    half.width === full.width / 2 && half.height === full.height / 2,
    `${full.width}x${full.height} → ${half.width}x${half.height}`);
  check('and quarters the pixels it has to shade',
    (half.width * half.height) * 4 === full.width * full.height,
    `${(full.width * full.height / 1e6).toFixed(2)} Mpx → ${(half.width * half.height / 1e6).toFixed(2)}`);
}

{
  // With a projector mirroring, the stage's pixels are the target and the
  // rung is a fraction of them — the window's own size does not come into it.
  const full = canvasPixelsFor(2, STAGE, CAP, WINDOW);
  check('a mirrored stage renders at the stage, not the window',
    full.width === STAGE.width && full.height === STAGE.height, `${full.width}x${full.height}`);
  /*
    And the fraction is the stage's own, whatever laptop is driving it.

    This used to read "and the rung is still a fraction of it", and assert
    that a rung of `dpr: 1` on a laptop of ratio 2 drew the stage at half:
    960 of 1920. That was the old behaviour written down, not a property,
    and it was the behaviour PLAN.md §14c is about: a rung's pixels with a
    stage were `dpr / devicePx` of the stage, so a Retina laptop opened a
    1080p projector at 960×540, because its own screen has two pixels per
    point and the projector does not. The feature changed, so the claim
    does. A stage's rungs are now shares of the stage (1, 0.75, 0.5 of it,
    `stageLadder` in lib/platform.ts), and `canvasPixelsFor` no longer takes
    the laptop's ratio at all, so what is asserted is what a share draws:
    all of the stage at 1, half its width and height at 0.5. That the
    ladder a stage is given does not depend on the laptop either is checked
    below, under §14c.
  */
  const whole = canvasPixelsFor(1, STAGE, CAP, WINDOW);
  const half = canvasPixelsFor(0.5, STAGE, CAP, WINDOW);
  check('with a stage, a rung is its share of the stage: all of it at 1, half its width at 0.5',
    whole.width === STAGE.width && whole.height === STAGE.height && half.width === STAGE.width / 2 && half.height === STAGE.height / 2,
    `${whole.width}x${whole.height} at 1, ${half.width}x${half.height} at 0.5`);
}

{
  // A rung asking for more pixels than the display has cannot have them:
  // `frac` is capped at 1, so the canvas never exceeds the stage.
  const over = canvasPixelsFor(3, STAGE, CAP, WINDOW);
  check('a rung cannot ask for more pixels than the display has',
    over.width === STAGE.width, `${over.width} of ${STAGE.width}`);
  const capped = canvasPixelsFor(1, { width: 20000, height: 20000 }, CAP, WINDOW);
  check('and never more than the GPU can allocate', capped.width === CAP, `${capped.width}`);
}

{
  // Every rung of a 2x local ladder, as canvas pixels: the numbers the
  // governor is actually trading quality for.
  const { rungs } = ladderAt('local', 'strong', 2);
  console.log(`  ${'rung'.padEnd(6)}${'grid'.padEnd(8)}${'dpr'.padStart(5)}${'canvas'.padStart(13)}${'Mpx'.padStart(8)}`);
  let last = null;
  let allDiffer = true;
  for (const [i, r] of rungs.entries()) {
    const px = canvasPixelsFor(r.dpr, null, CAP, WINDOW);
    const mpx = px.width * px.height / 1e6;
    console.log(`  ${String(i).padEnd(6)}${`${r.grid}²`.padEnd(8)}${r.dpr.toFixed(2).padStart(5)}${`${px.width}x${px.height}`.padStart(13)}${mpx.toFixed(2).padStart(8)}`);
    const key = `${r.grid}:${px.width}x${px.height}`;
    if (key === last) allDiffer = false;
    last = key;
  }
  console.log('');
  check('and no two rungs in a row are the same grid at the same pixels', allDiffer);
}

// ── A projector's pixels are the projector's (PLAN.md §14c) ──────────
//
// Read in the code, not reported: the ladder was built from the laptop's
// pixel ratio, and with a stage attached each rung drew `dpr / devicePx` of
// the stage. Two machines get that wrong in opposite directions, and these
// are the two cases the plan names.
//
// A Retina laptop on a 1080p projector opened the show on the ladder's
// `dpr: 1` rung, which on a 2x laptop is half of everything: 960×540 on a
// 1920×1080 wall, stretched by the mirror. And the 1024² rung, written for
// projectors, was gated on the laptop having one pixel per pixel, so the
// laptops that run most shows here never saw it.
//
// A 1x laptop on a 4K projector had the opposite problem: `dpr / devicePx`
// is 1 on every rung, so every rung drew all 3840×2160 and the governor had
// only the grid to give up, while what costs on a 4K wall is shading its
// pixels.
//
// Both are arithmetic on the ladder and the canvas size, so both are
// checked here, through the same two functions the show calls.
{
  const P1080 = { width: 1920, height: 1080 };
  const K4 = { width: 3840, height: 2160 };
  const at = (r, stage) => canvasPixelsFor(r.dpr, stage, CAP, WINDOW);
  const mpx = (p) => p.width * p.height / 1e6;
  const shown = (p) => `${p.width}x${p.height}`;

  // A Retina laptop (2x) and a Windows laptop at 150 %, every GPU class
  // that gets a ladder, on the hosted page and run locally: the first
  // frame on the wall has the wall's own pixels.
  const opened = [];
  let allWhole = true;
  for (const devicePx of [1.5, 2]) {
    for (const tier of ['hosted', 'local']) {
      for (const gpu of ['weak', 'mid', 'strong']) {
        const { rungs, start } = ladderAt(tier, gpu, devicePx, P1080);
        const px = at(rungs[start], P1080);
        if (px.width !== P1080.width || px.height !== P1080.height) allWhole = false;
        if (gpu === 'strong') opened.push(`${devicePx}x ${tier}: ${rungs[start].grid}² at ${shown(px)}`);
      }
    }
  }
  check('a Retina laptop with a 1080p stage starts at the stage\'s own pixels', allWhole, opened.join('  ·  '));

  {
    const { rungs } = ladderAt('local', 'strong', 2, P1080);
    const top = rungs.find((r) => r.grid === 1024);
    check('and offers 1024², the rung written for projectors',
      !!top && shown(at(top, P1080)) === shown(P1080),
      top ? `1024² at ${shown(at(top, P1080))}` : `grids offered: ${rungs.map((r) => r.grid).join(',')}`);
  }

  {
    const { rungs } = ladderAt('local', 'strong', 1, K4);
    const top = at(rungs[0], K4);
    const bottom = at(rungs[rungs.length - 1], K4);
    check('a 1x laptop with a 4K stage has a bottom rung with fewer pixels than its top',
      mpx(bottom) < mpx(top),
      `top ${rungs[0].grid}² at ${shown(top)} (${mpx(top).toFixed(2)} Mpx), bottom ${rungs[rungs.length - 1].grid}² at ${shown(bottom)} (${mpx(bottom).toFixed(2)} Mpx)`);
    /*
      And 1024² is offered by the stage's pixels, not by a ratio.

      The rung's gate was measured as a pixel count: 1024² held 32 fps at
      1280×800 (1.0 Mpx) and fell to 22 at 2560×1600 (4.1 Mpx), with the
      solver's step the same 25 ms both times. A 4K projector has one pixel
      per pixel and 8.3 Mpx, twice the count that was measured to fail, so
      offering it there would be offering a rung that cannot hold, which
      the governor climbs into, fails, and offers again ninety seconds
      later. Before §14c a 1x laptop offered it on any wall at all.
    */
    check('but not 1024² on a 4K wall, twice the pixels it was measured to fail at',
      !rungs.some((r) => r.grid === 1024), `grids offered: ${rungs.map((r) => r.grid).join(',')}`);
  }

  /*
    Two stage ladders written out, canvas size by canvas size, as the
    no-stage ones are above. The cases around them ask whether (the top has
    more pixels than the bottom, the start is the whole stage), and a ladder
    whose pixel rungs were 1, 0.99 and 0.98 of the stage passed every one of
    them (the check-skeptic). These say where: the pixel rungs are three
    quarters and half of the wall, and the grids below the opening one are
    drawn at half. Written from §14c's design, not printed from the code.
  */
  {
    const WANT = {
      '1920x1080': '1024@1920x1080 768@1920x1080 512@1920x1080 512@1440x810 512@960x540 384@960x540 256@960x540 from 2',
      '3840x2160': '768@3840x2160 512@3840x2160 512@2880x1620 512@1920x1080 384@1920x1080 256@1920x1080 from 1',
    };
    const off = [];
    for (const stage of [P1080, K4]) {
      const { rungs, start } = ladderAt('local', 'strong', 2, stage);
      const got = `${rungs.map((r) => `${r.grid}@${shown(at(r, stage))}`).join(' ')} from ${start}`;
      if (got !== WANT[shown(stage)]) off.push(`${shown(stage)}: ${got}`);
    }
    check('a 1080p and a 4K stage get exactly their shares: all, three quarters, half',
      off.length === 0, off.length ? off.join('  ·  ') : `${Object.keys(WANT).join(' and ')}, strong, as written`);
  }

  /*
    And the 1024² gate at its edges: 1920×1200, the largest projector it is
    written for, is offered it, and 2560×1440, 3.7 Mpx (close to the 4.1
    measured to fail), is not. Only 1080p and 4K were asked before, so a gate
    moved to 1920×1080 passed.
  */
  {
    const has = (w, h) => ladderAt('local', 'strong', 2, { width: w, height: h }).rungs.some((r) => r.grid === 1024);
    const wuxga = has(1920, 1200);
    const qhd = has(2560, 1440);
    check('1024² is offered on a 1920x1200 wall and not on a 2560x1440 one',
      wuxga && !qhd, `1920x1200: ${wuxga ? 'offered' : 'not offered'}; 2560x1440: ${qhd ? 'offered' : 'not offered'}`);
  }

  /*
    A wall after the GPU has run out of memory at its opening grid.

    Below the grid a stage's ladder opens on, its rungs are all at half the
    stage. So a governor stepped down from a grid that ran out of memory
    (`failRung`, marking each rung it leaves failed for good) walks the
    pixel rungs first: 512² at 1, 0.75, 0.5, then 384² at 0.5, and a 1080p
    wall is drawn at 960×540 until a reload, when all that ran out was the
    grid (the pre-push review). The laptop's own ladder had 384² at full
    pixels to land on. So the ladder is built under the cap, and has to
    open on the whole stage at the largest grid that fits. `walked` is the
    old way, for the numbers: the uncapped ladder stepped down past the cap.
  */
  {
    const lines = [];
    let whole = true;
    for (const gpu of ['weak', 'mid', 'strong']) {
      const open = ladderAt('local', gpu, 2, P1080);
      const cap = open.rungs[open.start].grid - 1;
      if (cap < 256) continue; // the weak class opens at the bottom grid: nothing below it to fit
      const { rungs, start } = ladderAt('local', gpu, 2, P1080, cap);
      const r = rungs[start];
      const px = at(r, P1080);
      if (r.grid > cap || shown(px) !== shown(P1080) || rungs.some((x) => x.grid > cap)) whole = false;
      const walked = open.rungs.slice(open.start).find((x) => x.grid <= cap);
      lines.push(`${gpu}: out of memory at ${cap + 1}², opens ${r.grid}² at ${shown(px)} (walked down: ${walked.grid}² at ${shown(at(walked, P1080))})`);
    }
    check('a wall that ran out of memory at its grid opens on a smaller grid at the whole stage, not at half of it',
      whole && lines.length === 2, lines.join('  ·  '));
  }

  // Whatever laptop drives it, a wall is the same wall: the ladder a stage
  // gets does not depend on the laptop's own ratio at all.
  for (const stage of [P1080, K4]) {
    const seen = [1, 1.25, 1.5, 2, 3].map((devicePx) => {
      const { rungs, start } = ladderAt('local', 'strong', devicePx, stage);
      return `${rungs.map((r) => shown(at(r, stage))).join(' ')} from ${start}`;
    });
    check(`a ${shown(stage)} stage gets the same canvas sizes from a 1x, 1.25x, 1.5x, 2x or 3x laptop`,
      new Set(seen).size === 1, new Set(seen).size === 1 ? seen[0] : `${new Set(seen).size} different ladders: ${[...new Set(seen)].slice(0, 2).join('  ·  ')}`);
  }

  // The stage ladders keep the ladder's own rules: nothing twice, every
  // step down gives something up and nothing back, in grid or in pixels,
  // and the start is a rung it has.
  for (const stage of [P1080, K4]) {
    for (const tier of ['hosted', 'local']) {
      for (const gpu of ['weak', 'mid', 'strong']) {
        const { rungs, start } = ladderAt(tier, gpu, 2, stage);
        const px = rungs.map((r) => at(r, stage));
        const keys = rungs.map((r, i) => `${r.grid}:${shown(px[i])}`);
        let ordered = true;
        for (let i = 1; i < rungs.length; i++) {
          if (rungs[i].grid > rungs[i - 1].grid || mpx(px[i]) > mpx(px[i - 1])) ordered = false;
        }
        check(`${tier}, ${gpu}, ${shown(stage)} stage: no rung twice, every step down gives something up, starts on a rung`,
          new Set(keys).size === keys.length && ordered && start >= 0 && start < rungs.length,
          `${rungs.map((r, i) => `${r.grid}@${shown(px[i])}`).join(' → ')}, from ${start}`);
      }
    }
  }

  {
    const { rungs, start } = ladderAt('local', 'strong', 2, P1080);
    console.log(`\n  a 2x laptop's local ladder with a 1920x1080 stage (starts on ${start}):`);
    console.log(`  ${'rung'.padEnd(6)}${'grid'.padEnd(8)}${'share'.padStart(6)}${'canvas'.padStart(13)}${'Mpx'.padStart(8)}`);
    for (const [i, r] of rungs.entries()) {
      const px = at(r, P1080);
      console.log(`  ${String(i).padEnd(6)}${`${r.grid}²`.padEnd(8)}${r.dpr.toFixed(2).padStart(6)}${shown(px).padStart(13)}${mpx(px).toFixed(2).padStart(8)}`);
    }
    console.log('');
  }
}

// ── The curved controls reach every surface ──────────────────────────
//
// Speed's travel is cubed because thirty of the thirty-two looks sit in the
// bottom quarter of its range. Three surfaces draw that slider — the settings
// panel, the phone and the desks — and each looks the curve up its own way.
// The desk names a ride `setting:globalSpeed` where the other two use
// `globalSpeed`, so the desk's Speed handle sat against the left stop at a
// value the curve puts a third of the way along, while the other two were
// right. A control that disagrees with itself across two screens reads as two
// different programs.
{
  const curved = LEARNABLE_SETTINGS.filter((x) => (x.curve ?? 1) !== 1);
  check('something is curved at all', curved.length > 0,
    curved.map((x) => `${String(x.key)}^${x.curve}`).join(', ') || 'nothing');
  for (const spec of curved) {
    const key = String(spec.key);
    // Through the same function the sliders use, so this is the mapping and
    // not a copy of it.
    check(`${key}: the desk's own name for it finds the curve`,
      curveOf(settingKeyOf(`setting:${key}`)) === spec.curve, `setting:${key}`);
    check(`${key}: and the panel's plain name finds it too`,
      curveOf(settingKeyOf(key)) === spec.curve, key);
    check(`${key}: a value round-trips through the travel`,
      [spec.min, (spec.min + spec.max) / 2, spec.max].every((v) =>
        Math.abs(valueAt(travelOf(v, spec.min, spec.max, spec.curve), spec.min, spec.max, spec.curve) - v) < 1e-9),
      `${spec.min}..${spec.max}`);
    // The whole point: the middle of the throw is near where the looks live,
    // not near the middle of the range.
    const mid = valueAt(0.5, spec.min, spec.max, spec.curve);
    check(`${key}: half the travel is ${mid.toFixed(4)}, not ${((spec.min + spec.max) / 2).toFixed(4)}`,
      mid < (spec.min + spec.max) / 2);
    // Reported: Speed at 1% sat a fifth of the way along, and the next notch
    // down threw it to the bottom. Swept a thousandth at a time by hand, the
    // knob lands where the hand put it and the chip reads where the knob is.
    let jump = 0, worstAt = 0, misread = '';
    for (let i = 0; i <= 1000; i++) {
      const t = i / 1000;
      const v = handValueAt(t, spec.min, spec.max, spec.curve);
      const lands = travelOf(v, spec.min, spec.max, spec.curve);
      if (Math.abs(lands - t) > jump) { jump = Math.abs(lands - t); worstAt = t; }
      const shown = readSetting(key, v, spec.min, spec.max);
      if (!misread && shown.endsWith('%') && Math.abs(parseInt(shown, 10) - lands * 100) > 0.51) misread = `${shown} with the knob at ${(lands * 100).toFixed(1)}%`;
    }
    check(`${key}: the knob lands where the hand puts it, all the way to the bottom`, jump < 0.01,
      `worst ${(jump * 100).toFixed(1)}% off, at ${(worstAt * 100).toFixed(1)}%`);
    check(`${key}: and its chip reads where the knob is`, !misread, misread || 'every step');
  }
}

// ── What the governor spends, and in what order ──────────────────────
//
// The ladder above is what it can spend; this is the policy. It matters
// because the three things it can give up are not alike: a rung costs
// resolution and a post level costs an effect, both of them visible and both
// of them lasting until the machine gets faster — while halving the step rate
// costs nothing at all, because the liquid covers the same distance in the
// same second taking steps twice as long.
//
// So the order is the whole point, and it is the kind of thing that is easy
// to get backwards and never notice: a governor that drops a rung first still
// produces a smooth plate, just a coarser one than the machine had to settle
// for. None of this needs a GPU — it is a state machine fed frame intervals.
{
  const { rungs } = ladderAt('local', 'strong', 2);
  /**
   * Where a rung sits on the ladder. `g.rung` hands back the array element
   * itself, so this is exact — and it is the only unambiguous way to say
   * which direction a move went. Comparing grids alone calls 512²@2 → 512²@1
   * "no move", and comparing either half alone cannot tell a climb from a
   * drop. A lower index is a better rung.
   */
  const at = (r) => rungs.indexOf(r);
  const seen = (r) => `${r.grid}²@${r.dpr.toFixed(2)}`;

  /** Feed `seconds` of frames at a fixed interval; hand back every move it made. */
  const feed = (g, frameMs, gpuMs, seconds, from) => {
    const dt = frameMs / 1000;
    const moves = [];
    let now = from;
    const until = from + seconds;
    while (now < until) {
      now += dt;
      if (g.sample(dt, 1, now, false, gpuMs)) {
        moves.push({ rung: g.rung, index: at(g.rung), stepRate: g.stepRate, post: g.postLevel });
      }
    }
    return { moves, now };
  };

  check('every step rate divides a 60 Hz refresh evenly',
    STEP_RATES.every((r) => 60 % r === 0), STEP_RATES.join(', ') +
    ' — a rate that does not is uneven in a way the number hides: at 45 on a 60 Hz' +
    ' screen three frames in four advance the liquid and the fourth does not');
  check('and every step down the step ladder is a step down',
    STEP_RATES.every((r, i) => i === 0 || r < STEP_RATES[i - 1]), STEP_RATES.join(' → '));
  check('the floor is 30 — below about 20–25 a plate steps rather than flows',
    Math.min(...STEP_RATES) >= 30, `floor ${Math.min(...STEP_RATES)}`);

  {
    // A machine holding 25 fps with the GPU busy: it cannot sustain sixty
    // steps a second, so it is already dropping them, which is slow motion.
    const g = new QualityGovernor(rungs, 0, 0);
    const from = { index: at(g.rung), rate: g.stepRate };
    const { moves } = feed(g, 40, 35, 12, 0);
    check('a machine that cannot hold the rate gives up the rate first', moves.length > 0 &&
      moves[0].stepRate < from.rate && moves[0].index === from.index,
      moves.length === 0 ? 'it never moved at all'
        : `first move: ${from.rate} → ${moves[0].stepRate} steps/s, still on ${seen(moves[0].rung)}`);
    check('and only then starts giving up the picture',
      moves.length > 1 && moves[1].index > moves[0].index && moves[1].stepRate === moves[0].stepRate,
      moves.slice(0, 3).map((m) => `${seen(m.rung)} ${m.stepRate}/s`).join('  →  '));
    check('the rate never goes below the floor, however long it struggles',
      moves.every((m) => m.stepRate >= Math.min(...STEP_RATES)),
      `lowest ${Math.min(...moves.map((m) => m.stepRate))}`);
  }

  {
    // The same machine, freed: whatever is visible comes back before the
    // thing nobody can see. Going back to sixty spends the headroom and buys
    // no picture, so it waits until the rungs have been bought back.
    const g = new QualityGovernor(rungs, 0, 0);
    const down = feed(g, 40, 35, 12, 0);
    check('it did in fact both slow down and shrink before being let go',
      g.stepRate < STEP_RATES[0] && at(g.rung) > 0, `${seen(g.rung)} at ${g.stepRate} steps/s`);

    /*
      Five seconds of fast frames before anything is recorded.

      The slow verdict outlives the feed that produced it: `slowSince` was set
      a second and a half before the fast frames started, and the average is
      still up, so the very first fast sample can fire one more *downward*
      move. Reading that as the first climb is how this check passed while
      asserting nothing — a drop changes the rung and leaves the rate alone
      too. A climb needs eight seconds of fast frames, so nothing in this
      window can be one.
    */
    const quiet = feed(g, 16.0, 3, 5, down.now);
    const sank = at(g.rung);
    const slowed = g.stepRate;
    check('and the settling window holds no climb to mistake for one',
      quiet.moves.every((m) => m.index >= sank), `${quiet.moves.length} move(s), all downward or none`);

    const up = feed(g, 16.0, 3, 200, quiet.now);
    const first = up.moves[0];
    check('coming back, the picture is restored before the step rate',
      first !== undefined && first.index < sank && first.stepRate === slowed,
      first === undefined ? 'it never climbed'
        : `first climb: ${seen(rungs[sank])} → ${seen(first.rung)}, still at ${first.stepRate} steps/s`);
    check('but the step rate does come back, given long enough',
      g.stepRate === STEP_RATES[0], `ended at ${g.stepRate} steps/s on ${seen(g.rung)}`);
  }

  {
    // `?rung=` holds the whole rung for measuring. It has to hold the rate
    // too, or a measurement of a rung is a measurement of something else.
    const g = new QualityGovernor(rungs, 1, 0, true);
    const before = { at: seen(g.rung), rate: g.stepRate };
    feed(g, 60, 55, 30, 0);
    check('a pinned governor holds the step rate as well as the rung',
      seen(g.rung) === before.at && g.stepRate === before.rate,
      `${before.at} at ${before.rate}/s → ${seen(g.rung)} at ${g.stepRate}/s`);
  }
}

let failed = 0;
for (const [what, ok, detail] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
