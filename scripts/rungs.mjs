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
 * Both are arithmetic, so both can be checked here rather than by watching a
 * projector and wondering. `npm run ladder` is the other half: what each
 * rung costs on a real GPU.
 */

import { qualityLadder, canvasPixelsFor } from '../src/lib/platform';
import { LEARNABLE_SETTINGS, curveOf, settingKeyOf, valueAt, travelOf } from '../src/lib/midi';
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
// would be given.
const ladderAt = (tier, gpu, devicePx) => {
  globalThis.window = {
    devicePixelRatio: devicePx,
    location: { search: '', hostname: 'localhost' },
    innerWidth: WINDOW.width,
    innerHeight: WINDOW.height,
  };
  return qualityLadder(tier, gpu);
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

// ── What a rung does to the canvas ───────────────────────────────────
//
// The half that was inert. These are the numbers the renderer now uses, so
// a regression here is a regression there.
{
  const full = canvasPixelsFor(2, null, CAP, 2, WINDOW);
  const half = canvasPixelsFor(1, null, CAP, 2, WINDOW);
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
  const full = canvasPixelsFor(2, STAGE, CAP, 2, WINDOW);
  const half = canvasPixelsFor(1, STAGE, CAP, 2, WINDOW);
  check('a mirrored stage renders at the stage, not the window',
    full.width === STAGE.width && full.height === STAGE.height, `${full.width}x${full.height}`);
  check('and the rung is still a fraction of it',
    half.width === STAGE.width / 2, `${half.width} of ${STAGE.width}`);
}

{
  // A rung asking for more pixels than the display has cannot have them:
  // `frac` is capped at 1, so the canvas never exceeds the stage.
  const over = canvasPixelsFor(3, STAGE, CAP, 1, WINDOW);
  check('a rung cannot ask for more pixels than the display has',
    over.width === STAGE.width, `${over.width} of ${STAGE.width}`);
  const capped = canvasPixelsFor(1, { width: 20000, height: 20000 }, CAP, 1, WINDOW);
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
    const px = canvasPixelsFor(r.dpr, null, CAP, 2, WINDOW);
    const mpx = px.width * px.height / 1e6;
    console.log(`  ${String(i).padEnd(6)}${`${r.grid}²`.padEnd(8)}${r.dpr.toFixed(2).padStart(5)}${`${px.width}x${px.height}`.padStart(13)}${mpx.toFixed(2).padStart(8)}`);
    const key = `${r.grid}:${px.width}x${px.height}`;
    if (key === last) allDiffer = false;
    last = key;
  }
  console.log('');
  check('and no two rungs in a row are the same grid at the same pixels', allDiffer);
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
