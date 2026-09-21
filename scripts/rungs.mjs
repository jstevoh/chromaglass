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
  check('a 1x display is offered fewer rungs than a 2x one', rungs.length < two.length,
    `${rungs.length} against ${two.length} — the pixel rungs only exist where there are pixels to give up`);
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

let failed = 0;
for (const [what, ok, detail] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
