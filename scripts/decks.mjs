#!/usr/bin/env node
/**
 * The A/B deck dissolve (PLAN 51c-2): with Decks on and two projectors on
 * the wall, a Go goes to the dark projector, its dish changes there, the
 * crossfade carries the light over, and Focus Dissolve's racks take the lit
 * one out and bring the dark one in.
 *
 *   npm run decks      (node, then the lab: any adapter that computes, so a cloud session too)
 *
 * What was asked. The owner's research on Liquid Light Lab's films (PLAN 51):
 * a two-projector show changes one head's dish while it is dark, and the
 * light goes over to it. 51c racked the projectors a Go changes on the spot;
 * the plan's two-projector form was left as 51c-2.
 *
 * Asked of the timing from outside its files (lib/deckDissolve.ts,
 * lib/focusDissolve.ts), a frame each sixtieth of a second on a made-up clock:
 *
 *   0. the deck a Go goes to is the darker one, B on a tie; the dish goes in
 *      at once on a dark deck over the first quarter, and waits that quarter
 *      on a lit one; the rest of the look follows the dish, to three quarters;
 *   1. the crossfade is still until a quarter of the way, lands at three
 *      quarters, never turns back, and is still at both ends (a hand's start
 *      and stop): its first and last frames' steps are under a tenth of its
 *      middle's;
 *   2. nothing lit changes sharp: through the dish's window the deck it goes
 *      to has no light (a dark Go); whenever either deck's light is on its
 *      way (between 2% and 98%), that deck is at least half melted; through
 *      the look's window both are; a deck's rack jumps (a frame's step over
 *      a fifth of its depth) only while its light is under 2%; and both end
 *      at rest, sharp;
 *   3. a Go to a lit deck, either way, racks it out over the first quarter
 *      and changes its dish only while it is held melted, landed before it
 *      racks in; the rest of the look never beside the dish on the front;
 *   4. a second Go mid-dissolve, before the middle and past it, goes to the
 *      darker deck then, and neither rack steps by more than a frame's worth
 *      at the second Go; 2 still holds after it;
 *   5. the look's split: the dish is the solver's settings alone (a plate's
 *      own: `PER_LAYER`), the rest is everything else but what the decks
 *      stand on (`DECK_RIG`), and the two together are the look but for that;
 *   5b. every house look sent by a deck Go leaves two projectors on the wall
 *      and both plates' levels as they were (the Mac film of the first build:
 *      the rest of the look switched Two Projectors off mid-dissolve), where
 *      the same looks' whole targets switch it off (the control);
 *   6. the switch is the rig's: off by default (a Go as before), not
 *      wandered, ridden by a cord or carried by a look, learnable as a
 *      switch; and the wiring reads the source (the App's timers cannot run
 *      in node): a Go goes to the decks only with Decks on, a fade and two
 *      projectors; a Back, a later Go and a Go to the back plate stop what of
 *      a deck Go is still to come; the front takes the dish and then the
 *      rest at the plan's times; and the Mixer draws Decks only where there is a B.
 *
 * Then of the real plate pass in the lab, two projectors at 256, the racks
 * and the crossfade as the clocks walk them over a dissolve:
 *
 *   7. the wall's light is kept through the dissolve: every frame's mean
 *      linear light within 1% of the first's, the racks melting both decks
 *      in turn (a blur in display values would darken the middle);
 *   8. a dark deck is not on the wall: at the crossfade's end, A's picture
 *      is the same to the byte with B sharp or melted, and with B's dish
 *      changed (its plate turned another way); the positive controls: at the
 *      middle, each moves the wall;
 *   9. the dissolve leaves nothing behind: its first frame is the plain A
 *      and its last the plain B, to the byte.
 */
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { openLab } from './lab.mjs';
import { BLUE, TEAL } from './lampcontrol.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const f3 = (v) => v.toFixed(3);

const out = 'node_modules/.cache/decks.mjs';
await build({
  stdin: { contents: "export * from './src/lib/deckDissolve.ts'; export * from './src/lib/focusDissolve.ts'; export { crossfadeWeights } from './src/lib/projectorBank.ts'; export { DEFAULT_SETTINGS } from './src/types.ts'; export { DRIFTABLE } from './src/lib/drift.ts'; export { RIG_KEYS } from './src/lib/lookFade.ts'; export { PATCH_TARGETS, PER_LAYER } from './src/lib/sceneMap.ts'; export { PIN_RANGE } from './src/lib/deskPins.ts'; export { LEARNABLE_SETTINGS } from './src/lib/midi.ts'; export { bankHasTwo } from './src/lib/projectorBank.ts'; export { targetLook } from './src/lib/lookFade.ts'; export { PRESETS } from './src/presets.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const m = await import(`../${out}`);
const { darkDeck, deckPlan, crossAt, dishOf, drawingOf, DECK_RIG, bankHasTwo, targetLook, PRESETS, DARK_SHARE, rackClock, walkRack, startDeckRack, crossfadeWeights, DEFAULT_SETTINGS, DRIFTABLE, RIG_KEYS, PATCH_TARGETS, PER_LAYER, LEARNABLE_SETTINGS } = m;

const T = 4, MS = T * 1000, FPS = 60;
/* A dissolve from `x0` at `start` on clock `c`, walked frame by frame to `end`: each frame's p, crossfade, lights and shares. */
function walk(c, x0, to, start, end) {
  const frames = [];
  for (let t = start; t <= end + 1e-9; t += 1000 / FPS) {
    walkRack(c, t);
    const p = (t - start) / MS;
    const x = crossAt(p, x0, to);
    const [wA, wB] = crossfadeWeights(x);
    frames.push({ t, p, x, w: [wA, wB], s: [c.share[0], c.share[1]] });
  }
  return frames;
}
/*
  Claim 2 over a run of frames: soft while the light moves, a rack's jump
  only in the dark. "Moves" is a frame's step in its light: a deck held at
  half light, sharp, before the crossfade has begun is not on its way (the
  first build counted it and failed a lit Go on a deck nothing had touched).
*/
function softWhileMoving(frames) {
  let moving = 1, jump = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    for (const d of [0, 1]) {
      if (i && f.w[d] !== frames[i - 1].w[d] && f.w[d] > DARK_SHARE && f.w[d] < 1 - DARK_SHARE) moving = Math.min(moving, f.s[d]);
      if (i && Math.abs(f.s[d] - frames[i - 1].s[d]) > 0.2 && Math.min(f.w[d], frames[i - 1].w[d]) >= DARK_SHARE) jump++;
    }
  }
  return { moving, jump };
}

// ── 0–2. A dark Go ─────────────────────────────────────────────────────
{
  const plan = deckPlan(0, T), planB = deckPlan(1, T), planTie = deckPlan(0.5, T);
  const routes = darkDeck(0) === 1 && darkDeck(1) === 0 && darkDeck(0.5) === 1 && darkDeck(0.51) === 0 && darkDeck(undefined) === 1;
  const times = plan.to === 1 && plan.dishDelayMs === 0 && Math.abs(plan.dishSeconds - 1) < 1e-9 && Math.abs(plan.lookDelayMs - 1000) < 1e-6 && Math.abs(plan.lookSeconds - 2) < 1e-9
    && planB.to === 0 && planB.dishDelayMs === 0
    && Math.abs(planTie.dishDelayMs - 1000) < 1e-6 && Math.abs(planTie.lookDelayMs - 2000) < 1e-6 && Math.abs(planTie.lookSeconds - 1) < 1e-9;
  check('the deck a Go goes to is the darker one, B on a tie; a dark deck\'s dish goes in at the Go over the first quarter, a lit one\'s waits it; the rest of the look follows the dish, to three quarters',
    routes && times, `dark Go: dish at ${plan.dishDelayMs} ms for ${plan.dishSeconds} s, the rest at ${plan.lookDelayMs} ms for ${plan.lookSeconds} s; lit Go: dish at ${planTie.dishDelayMs} ms, the rest at ${planTie.lookDelayMs} ms for ${planTie.lookSeconds} s`);

  const c = rackClock();
  startDeckRack(c, 0, T, 1);
  const fr = walk(c, 0, 1, 0, MS + 100);
  const xs = fr.map(f => f.x);
  const steps = xs.slice(1).map((v, i) => v - xs[i]);
  const first = fr.findIndex(f => f.x > 0), last = fr.findIndex(f => f.x >= 1);
  const mid = Math.max(...steps);
  const still = fr.filter(f => f.p <= 0.25).every(f => f.x === 0) && fr.filter(f => f.p >= 0.75).every(f => f.x === 1);
  const monotone = steps.every(d => d >= -1e-12);
  const ends = steps[first - 1] < mid / 10 && steps[last - 1] < mid / 10;
  check('the crossfade is still to a quarter of the way, lands at three quarters, never turns back, and starts and stops as a hand does (its first and last steps under a tenth of its middle\'s)',
    still && monotone && ends, `first step ${f3(steps[first - 1])}, last ${f3(steps[last - 1])}, middle ${f3(mid)}`);

  const dishWindow = fr.filter(f => f.t <= plan.dishDelayMs + plan.dishSeconds * 1000);
  const darkDish = Math.max(...dishWindow.map(f => f.w[1]));
  const { moving, jump } = softWhileMoving(fr);
  const lookWin = fr.filter(f => f.p >= 0.25 && f.p <= 0.75);
  const lookSoft = Math.min(...lookWin.map(f => Math.min(f.s[0], f.s[1])));
  const rest = fr[fr.length - 1].s[0] === 0 && fr[fr.length - 1].s[1] === 0 && c.ms[0] === 0 && c.ms[1] === 0;
  check('nothing lit changes sharp: B has no light while its dish goes in; a deck whose light is on its way is at least half melted, and so are both through the look\'s window; a rack jumps only in the dark; both end at rest, sharp',
    darkDish === 0 && moving >= 0.5 - 1e-6 && lookSoft >= 0.5 - 1e-6 && jump === 0 && rest,
    `B's light in the dish's window ${f3(darkDish)}, least melt while moving ${f3(moving)}, through the look ${f3(lookSoft)}, jumps in view ${jump}`);
}

// ── 3. A Go to a lit deck, either way ──────────────────────────────────
{
  const lit = (x0) => {
    const plan = deckPlan(x0, T);
    const c = rackClock();
    startDeckRack(c, 0, T, plan.to);
    const fr = walk(c, x0, plan.to, 0, MS + 100);
    const d = plan.to;
    const lands = plan.dishDelayMs + plan.dishSeconds * 1000;
    const during = fr.filter(f => f.t >= plan.dishDelayMs && f.t <= lands).map(f => f.s[d]);
    const restEnd = plan.lookDelayMs + plan.lookSeconds * 1000;
    const { moving, jump } = softWhileMoving(fr);
    return { plan, held: Math.min(...during), lands, restOk: plan.lookDelayMs >= lands - 1e-6 && restEnd <= 0.75 * MS + 1e-6 && plan.lookDelayMs >= 0.25 * MS - 1e-6, moving, jump };
  };
  const toB = lit(0.5), toA = lit(0.75);
  const ok = (r, to) => r.plan.to === to && r.plan.dishDelayMs > 0 && r.held >= 0.999 && r.lands <= 0.5 * MS + 1e-6 && r.restOk && r.moving >= 0.5 - 1e-6 && r.jump === 0;
  check('a Go to a lit deck, to B from the middle or to A from three quarters, waits for it to melt, changes its dish only while it is held melted, landed before it racks in at the half; the rest of the look follows the dish, inside the middle half',
    ok(toB, 1) && ok(toA, 0),
    `to B: held ${f3(toB.held)}, landed at ${toB.lands} ms; to A: held ${f3(toA.held)}, landed at ${toA.lands} ms; least melt while moving ${f3(Math.min(toB.moving, toA.moving))}`);
}

// ── 4. A second Go mid-dissolve ────────────────────────────────────────
{
  const second = (pAt) => {
    const c = rackClock();
    startDeckRack(c, 0, T, 1);
    const a = walk(c, 0, 1, 0, pAt * MS);
    const here = a[a.length - 1];
    const to = darkDeck(here.x);
    const before = [c.share[0], c.share[1]];
    startDeckRack(c, here.t, T, to);
    const step = Math.max(Math.abs(c.share[0] - before[0]), Math.abs(c.share[1] - before[1]));
    const b = walk(c, here.x, to, here.t, here.t + MS + 100);
    return { to, x: here.x, step, ...softWhileMoving(b) };
  };
  const early = second(0.3), late = second(0.6);
  // A frame's worth: the fastest a rack moves, its depth over a sixtieth of a quarter of T (the arriving deck's fast rack out).
  const frame = 1 / (FPS * T * 0.25) * Math.PI;
  check('a second Go before the middle goes to the deck still arriving (the darker), past it the light turns round; no rack steps by more than a frame\'s worth at the second Go, and nothing lit changes sharp after it',
    early.to === 1 && late.to === 0 && early.step <= frame && late.step <= frame && early.jump === 0 && late.jump === 0 && early.moving >= 0.5 - 1e-6 && late.moving >= 0.5 - 1e-6,
    `at 0.3 (x ${f3(early.x)}) to ${'AB'[early.to]}, step ${f3(early.step)}; at 0.6 (x ${f3(late.x)}) to ${'AB'[late.to]}, step ${f3(late.step)}; a frame's worth ${f3(frame)}`);
}

// ── 5. The look's split ────────────────────────────────────────────────
{
  const now = { ...DEFAULT_SETTINGS };
  const target = { ...DEFAULT_SETTINGS };
  let solver = 0, drawn = 0;
  for (const k of Object.keys(target)) {
    if (typeof target[k] !== 'number') continue;
    target[k] = target[k] + 0.125;
    if (PER_LAYER.has(k)) solver++; else drawn++;
  }
  const dish = dishOf(target, now), draw = drawingOf(target, now);
  let bad = 0;
  for (const k of Object.keys(target)) {
    const own = PER_LAYER.has(k);
    const rig = DECK_RIG.has(k);
    if (dish[k] !== (own ? target[k] : now[k])) bad++;
    if (draw[k] !== (own || rig ? now[k] : target[k])) bad++;
    if (drawingOf(target, dish)[k] !== (rig ? now[k] : target[k])) bad++;
  }
  check('the look\'s split: the dish is the solver\'s settings alone (what a plate owns), the rest everything else but what the decks stand on, and the rest laid over the dish is the look but for that',
    bad === 0 && solver > 20 && drawn > 20, `${solver} solver keys and ${drawn} others moved, ${bad} wrong`);
}

// ── 5b. Every house look, sent by a deck Go, leaves two projectors on the wall ──
{
  /*
    The Mac film of the first build (2026-11-27): every house look carries
    Two Projectors off and most a lamp ground of 0, so the rest of the look
    switched the second projector off halfway through its own dissolve.
    From two projectors on the wall, each look's whole target (the control:
    what a plain Go lays) and its deck rest, laid over its dish on either
    side, through the plate's own question.
  */
  const wall = { ...DEFAULT_SETTINGS, layerCount: 2, twoProjectors: 1, lampGround: 1, backBlend: 'own', projDeck: 1, projCross: 0, frontLevel: 1, backLevel: 1 };
  const two = (s) => bankHasTwo(s, Math.round(s.layerCount ?? 1), s.renderStyle === 'photo' ? 0 : s.lampGround ?? 0);
  let plainOff = 0, deckOff = 0, levels = 0;
  for (const p of PRESETS) {
    const full = targetLook(wall, p.settings);
    if (!two(full)) plainOff++;
    const front = drawingOf(full, dishOf(full, wall)), back = drawingOf(full, wall);
    if (!two(front) || !two(back)) deckOff++;
    for (const k of ['frontLevel', 'backLevel']) if (front[k] !== wall[k] || back[k] !== wall[k]) levels++;
  }
  check('every house look, sent by a deck Go either way, leaves two projectors on the wall and both plates\' levels where the operator has them; a plain Go to the same looks would switch the second projector off (the control: the bug the Mac film caught)',
    PRESETS.length > 20 && deckOff === 0 && levels === 0 && plainOff > PRESETS.length / 2 && DECK_RIG.has('twoProjectors'),
    `${PRESETS.length} looks: a plain Go takes two projectors off in ${plainOff}, a deck Go in ${deckOff}; levels moved ${levels}`);
}

// ── 6. The switch, and the wiring ──────────────────────────────────────
{
  const learn = LEARNABLE_SETTINGS.find(l => l.key === 'projDeck');
  const rig = DEFAULT_SETTINGS.projDeck === 0 && RIG_KEYS.has('projDeck') && !DRIFTABLE.includes?.('projDeck') && !(DRIFTABLE instanceof Set && DRIFTABLE.has('projDeck'))
    && !PATCH_TARGETS.some?.(t => (t.key ?? t) === 'projDeck') && learn && learn.min === 0 && learn.max === 1 && learn.step === 1;
  const fades = readFileSync('src/app/useLookFades.ts', 'utf8');
  const bank = readFileSync('src/components/ProjectorBank.tsx', 'utf8');
  const gate = /if \(\(settingsRef\.current\.projDeck \?\? 0\) > 0\.5 && seconds > 0 && twoOnWall\(settingsRef\.current\)\) \{ deckGo\(next, seconds\); return; \}/.test(fades);
  const body = (from, to) => fades.slice(fades.indexOf(from), fades.indexOf(to, fades.indexOf(from)));
  const stops = [body('const sendLook =', 'const goLook ='), body('const sendBack =', 'const goBackPlate ='), body('const revertLook =', '}, [fadeSeconds')].every(b => /stopDeck\(\);/.test(b));
  const deck = body('const deckGo =', 'useEffect(() => () => stopDeck()');
  const order = /after\(deckBack, plan\.dishDelayMs,/.test(deck) && /after\(frontWait, plan\.lookDelayMs, rest\)/.test(deck)
    && /after\(frontWait, plan\.dishDelayMs, \(\) => \{[\s\S]*fadeSettingsTo\(dishOf\(target, settingsRef\.current\), plan\.dishSeconds[\s\S]*after\(frontWait, plan\.lookDelayMs - plan\.dishDelayMs, rest\);/.test(deck)
    && /previousLook\.current = \{ id: pinnedPresetId, settings: s \};/.test(deck);
  const twoBranch = bank.slice(bank.indexOf('{two ? ('), bank.indexOf(') : (', bank.indexOf('{two ? ('))).includes('decks()');
  check('Decks is the rig\'s: off by default, not wandered, ridden or carried by a look, learnable as a switch; a Go goes to the decks only with it on, a fade and two projectors; a Back, a later Go or a Go to the back plate stops what of a deck Go is to come; the front takes the dish, then the rest, as planned; and the Mixer draws Decks only where there is a B',
    rig && gate && twoBranch && stops && order, `learnable ${learn ? `${learn.min}–${learn.max} step ${learn.step}` : 'no'}, gate ${gate}, drawn with B ${twoBranch}, a Back and a later Go stop it ${stops}, dish then rest as planned ${order}`);
}

// ── 7–9. Through the real pass ─────────────────────────────────────────
const S = 256, SAMPLES = 16;
const NEUTRAL = { saturationBoost: 1, granulation: 0, boundaryContrast: 0, edgeRelief: 0, beads: 0, lacing: 0, cells: 0, glossiness: 0,
  microDroplets: 0, thinFilm: 0, lampWarmth: 0, dishVignette: 0, lampHotspot: 0, lampGround: 1, layerCount: 2, twoProjectors: 1, projRack: 1, markMix: 0 };
const BACK = { backPlate: true, backRotation: Math.PI };
const lin = (v) => Math.pow(Math.max(0, v) / 255, 2.2);
const meanLin = (img) => { let s = 0, n = 0; for (let k = 0; k < img.length; k++) if (k % 4 !== 3) { s += lin(img[k]); n++; } return s / n; };
const maxDiff = (a, b) => { let d = 0; for (let k = 0; k < a.length; k++) if (k % 4 !== 3) d = Math.max(d, Math.abs(a[k] - b[k])); return d; };

const c = rackClock();
startDeckRack(c, 0, T, 1);
const plan = [];
for (let i = 0; i <= SAMPLES; i++) {
  const t = (MS * i) / SAMPLES;
  walkRack(c, t);
  plan.push({ x: crossAt(i / SAMPLES, 0, 1), rack: [c.share[0], c.share[1]] });
}
const lab = await openLab();
let shots;
try {
  const shoot = async (over, rack, cam = {}) => {
    const b64 = await lab.page.evaluate(async ([S, N, BACK, over, rack, cam]) => {
      const bytes = new Uint8Array(await lab.render(S, { ...N, ...over }, rack ? { ...BACK, ...cam, rack } : { ...BACK, ...cam }));
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }, [S, NEUTRAL, BACK, over, rack, cam]);
    return Buffer.from(b64, 'base64');
  };
  await lab.page.evaluate(async ([BLUE, TEAL]) => {
    await lab.create(128); lab.dye(0.38, 0.5, 0.17, BLUE, 0.6); lab.dye(0.62, 0.36, 0.1, TEAL, 0.8); lab.flush(); await lab.step(1);
  }, [BLUE, TEAL]);
  shots = { frames: [] };
  for (const f of plan) shots.frames.push(await shoot({ projCross: f.x }, f.rack));
  shots.plainA = await shoot({ projCross: 0, projRack: 0 }, null);
  shots.plainB = await shoot({ projCross: 1, projRack: 0 }, null);
  shots.aBsharp = await shoot({ projCross: 0 }, [0, 0]);
  shots.aBmelt = await shoot({ projCross: 0 }, [0, 1]);
  shots.midBsharp = await shoot({ projCross: 0.5 }, [0, 0]);
  shots.midBmelt = await shoot({ projCross: 0.5 }, [0, 1]);
  // B's dish changed (its plate turned a quarter instead of a half), at A and at the middle.
  shots.aBother = await shoot({ projCross: 0 }, [0, 1], { backRotation: Math.PI / 2 });
  shots.midBother = await shoot({ projCross: 0.5 }, [0, 1], { backRotation: Math.PI / 2 });
} finally { await lab.close(); }

{
  const l0 = meanLin(shots.frames[0]);
  const worst = Math.max(...shots.frames.map(f => Math.abs(meanLin(f) / l0 - 1)));
  check('through the real pass the wall\'s light is kept across a deck dissolve: every frame\'s mean linear light within 1% of the first\'s, both decks melting in turn',
    worst <= 0.01 && l0 > 0.02, `worst ${(100 * worst).toFixed(2)}% off, first frame ${f3(l0)} linear`);
  const dark = maxDiff(shots.aBsharp, shots.aBmelt), mid = maxDiff(shots.midBsharp, shots.midBmelt);
  const dish = maxDiff(shots.aBmelt, shots.aBother), dishMid = maxDiff(shots.midBmelt, shots.midBother);
  check('a dark deck is not on the wall: with the crossfade at A, the wall is the same to the byte with B sharp or melted (the pass sits out for it) and with B\'s dish changed; at the middle each moves it (the controls)',
    dark === 0 && dish === 0 && mid > 8 && dishMid > 8, `at A: B's melt ${dark}, its dish ${dish} levels; at the middle: ${mid} and ${dishMid}`);
  const startD = maxDiff(shots.frames[0], shots.plainA), endD = maxDiff(shots.frames[SAMPLES], shots.plainB);
  check('the dissolve leaves nothing behind: its first frame is the plain A and its last the plain B, to the byte',
    startD === 0 && endD === 0, `first ${startD}, last ${endD} levels`);
}

const failed = checks.filter(x => !x.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} decks checks passed`);
process.exit(failed ? 1 : 0);
