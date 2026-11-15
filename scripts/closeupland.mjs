#!/usr/bin/env node
/**
 * The closeup comes in on liquid, never on bare glass.
 *
 *   npm run closeupland -- --node  the camera and the zoom's reading (CI: logic)
 *   npm run closeupland           the app: the Macro Zoom pushed in on a plate
 *                                 whose middle is bare (CI: the Mac's tools
 *                                 shard; PW_WEBGPU=1 in a cloud session)
 *
 * What was reported (the owner, 2026-10-29, with a screenshot of the Recipe
 * panel): "this closeup button doesn't seem to do anything besides make the
 * canvas black/empty?" The closeup's camera is Hold by default, aimed at the
 * middle of the plate, and Hold sat on its aim and nowhere else, so on a plate
 * whose middle was bare the closeup was four times the size of nothing. In
 * the app (software WebGPU), one pool a fifth of the way across a cleared
 * plate: the frame's mean 1.4 of 255 and no pixel over 24, for as long as the
 * closeup was in. And the button flipped `macroMode` alone, so the frame went
 * to 4x while the Macro Zoom knob beside it read 1.00x.
 *
 * The node half drives the real MacroCamera (src/lib/macroCamera.ts) on
 * made-up plates at 4x, through a 16:10 frame:
 *
 *   1. the control: on the plate of the report (one pool off the middle), the
 *      frame on the aim, where Hold used to sit, holds under BARE of the
 *      plate's average dye. Without it the lines below could pass on a plate
 *      that never gave the camera bare glass to come in on
 *   2. Hold and Follow, coming in on that plate, frame the pool from the first
 *      frame: the frame holds at least half what the plate's fullest frame
 *      holds, and the pool's middle is in the middle third of it
 *   3. with liquid under the aim, Hold does not move: the frame stays on the
 *      aim to 1e-6 (a look whose middle is full comes in where it always did)
 *   4. nearest, not fullest: two equal pools, it lands on the one by the aim
 *   5. a hand that moves the aim during the closeup is obeyed, onto bare glass
 *      if that is where it points
 *   6. an empty plate coming in waits on the aim, and lands on the first pour,
 *      in Hold and in Follow; a zoom ramped in from 1.01x (the pinch, the
 *      slider) lands too; a switch from Auto to Hold mid-closeup does not
 *   7. out and in again lands again, whatever a hand did last time
 *   8. the Macro Zoom is the closeup's one control (the owner, 2026-11-14:
 *      "lets get rid of the close-up button. The macro zoom control should be
 *      used for zooming in/out always", PLAN QA-32c): the frame's zoom
 *      (`macroZoomOf`) is the Macro Zoom on every flag and zoom, so a look
 *      with `macroMode` on and the zoom at 1 is at the plate (it was at 4x
 *      under a knob reading 1.0x), and every shipped look that sets the flag
 *      carries a zoom of its own past 1.05 (or it would now open at the plate)
 *   9. the landing's copy of the solver's full zoom agrees with
 *      src/sim/constants (src/lib does not import src/sim), and no hand in
 *      src/ is a Close-up press any more: no `closeupToggle`, no
 *      `macro-toggle` action, no `macro-button`, no flip of `macroMode`
 *  10. a zoom parked short of 2x (a pinch let go at 1.5x) stops asking after
 *      LAND_SECONDS: Hold on a full middle for ten seconds, the middle then
 *      drained, does not cut across the plate (it did, in one frame)
 *  11. where it settles is told once (`onLand`, which the app makes the aim),
 *      and a nudge of the aim from there (the arrows, the sliders, Evolve)
 *      pans on from the pool rather than back to the bare middle
 *
 * The app half: classic, the plate cleared and one pool laid at (0.33, 0.5)
 * through the debug hook; at 1x the pool is drawn (the control: a black frame
 * is also what a frame that could not be read gives); the readback's dye in
 * the 4x frame on the aim is under BARE of the plate's (the control for the
 * zoom); the zoom pushed in by + seven times (to 4.3x, the app's own zoom
 * code): the zoom chip reads it, over LIT_SHARE of the frame's pixels lit with the
 * shot on the pool and the aim moved onto it; the chip's − pressed until it
 * goes, out at 1x.
 */
import { MacroCamera } from '../src/lib/macroCamera.ts';
import { stream } from '../src/lib/rng.ts';
import { BARE_SHARE, LAND_FULL_ZOOM } from '../src/lib/macroLanding.ts';
import { macroZoomOf, MACRO_FULL_ZOOM, MACRO_PRESET_ZOOM } from '../src/sim/constants.ts';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else failed++; console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

/** A held frame under this share of the plate's average dye is bare glass (macroLanding.ts). */
const BARE = BARE_SHARE;
/** Share of the app's 4x frame that must be lit (pixels over 24 of 255); measured 0.00 before, 0.32 with the landing before it was centred. */
const LIT_SHARE = 0.15;

const fx = (v) => v.toFixed(3);

if (process.argv.includes('--node')) {
  const SIZE = 192, DT = 1 / 60, ZOOM = 4;
  const spanX = 1 / 1.5, spanY = spanX / 1.6;
  const hx = spanX / ZOOM * 0.5 * SIZE, hy = spanY / ZOOM * 0.5 * SIZE;
  const plate = () => ({ density: new Float32Array(SIZE * SIZE), size: SIZE });
  const pour = (f, u, v, amp = 2, r = 7) => {
    for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
      f.density[j * SIZE + i] += amp * Math.exp(-((i - u * SIZE) ** 2 + (j - v * SIZE) ** 2) / (r * r));
    }
  };
  const opts = (mode, aimX = 0.5, aimY = 0.5) => ({ zoom: ZOOM, chase: 0.6, hold: 5, spanX, spanY, mode, aimX, aimY });
  const mean = (f, cx, cy) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, Math.floor(cy - hy)); j <= Math.min(SIZE - 1, Math.ceil(cy + hy)); j++) {
      for (let i = Math.max(0, Math.floor(cx - hx)); i <= Math.min(SIZE - 1, Math.ceil(cx + hx)); i++) { s += f.density[j * SIZE + i]; n++; }
    }
    return s / n;
  };
  const plateMean = (f) => f.density.reduce((a, b) => a + b, 0) / f.density.length;
  const fullest = (f) => {
    let best = 0;
    for (let y = hy; y <= SIZE - hy; y += 2) for (let x = hx; x <= SIZE - hx; x += 2) best = Math.max(best, mean(f, x, y));
    return best;
  };
  /** How much of the fullest frame's dye the shot's frame holds, and how far (in frame halves) a point is from its middle. */
  const read = (f, shot, u, v) => ({
    share: mean(f, shot.cx * SIZE, shot.cy * SIZE) / fullest(f),
    off: Math.max(Math.abs(u - shot.cx) * SIZE / hx, Math.abs(v - shot.cy) * SIZE / hy),
  });

  // 1. The plate of the report.
  const report = plate();
  pour(report, 0.22, 0.30);
  const onAim = mean(report, SIZE / 2, SIZE / 2) / plateMean(report);
  check('the control: on the plate of the report, the frame on the aim is bare glass', onAim < BARE,
    `the frame where Hold used to sit holds ${fx(onAim)} of the plate's average dye (under ${BARE} wanted)`);

  // 2. Hold and Follow come in on it.
  for (const mode of ['hold', 'follow']) {
    const cam = new MacroCamera(stream('plate.macro'));
    const first = read(report, cam.update(report, DT, opts(mode)), 0.22, 0.30);
    let shot;
    for (let t = 0; t < 60; t++) shot = cam.update(report, DT, opts(mode));
    const last = read(report, shot, 0.22, 0.30);
    check(`${mode}, coming in on bare glass, frames the pool from the first frame`,
      first.share >= 0.5 && last.share >= 0.5 && first.off < 1 / 3 && last.off < 1 / 3,
      `the frame holds ${fx(first.share)} then ${fx(last.share)} of the fullest frame's dye (0.5 wanted), the pool ${fx(first.off)} then ${fx(last.off)} of a half-frame off its middle (under 0.333 wanted); at ${fx(shot.cx)}, ${fx(shot.cy)}`);
  }

  // 3. Liquid under the aim: Hold stays.
  {
    const f = plate();
    pour(f, 0.5, 0.5, 1.5, 6); pour(f, 0.22, 0.30, 3, 9);
    const cam = new MacroCamera(stream('plate.macro'));
    let worst = 0;
    for (let t = 0; t < 60; t++) { const s = cam.update(f, DT, opts('hold')); worst = Math.max(worst, Math.hypot(s.cx - 0.5, s.cy - 0.5)); }
    check('with liquid under the aim, Hold comes in on the aim', worst < 1e-6,
      `the frame strayed ${worst.toExponential(1)} of the plate from it (a fuller pool elsewhere; under 1e-6 wanted)`);
  }

  // 4. Nearest, not fullest.
  {
    const f = plate();
    pour(f, 0.35, 0.55); pour(f, 0.82, 0.8, 2.4);
    const cam = new MacroCamera(stream('plate.macro'));
    let shot;
    for (let t = 0; t < 30; t++) shot = cam.update(f, DT, opts('hold'));
    const r = read(f, shot, 0.35, 0.55);
    check('it lands on the pool by the aim, not the fullest across the plate', r.off < 1 / 3,
      `the near pool ${fx(r.off)} of a half-frame off the middle (under 0.333 wanted); at ${fx(shot.cx)}, ${fx(shot.cy)}`);
  }

  // 5. A hand's aim during the closeup is obeyed, onto bare glass.
  {
    const cam = new MacroCamera(stream('plate.macro'));
    for (let t = 0; t < 30; t++) cam.update(report, DT, opts('hold'));
    let shot;
    for (let t = 0; t < 90; t++) shot = cam.update(report, DT, opts('hold', 0.7, 0.65));
    const miss = Math.hypot(shot.cx - 0.7, shot.cy - 0.65);
    const bare = mean(report, shot.cx * SIZE, shot.cy * SIZE) / plateMean(report);
    check('a hand that moves the aim onto bare glass is obeyed', miss < 0.005 && bare < BARE,
      `the frame ${fx(miss)} of the plate from the hand's aim (under 0.005 wanted), on ${fx(bare)} of the plate's average dye`);
  }

  // 6. An empty plate comes in on the aim and lands on the first pour.
  for (const mode of ['hold', 'follow']) {
    const f = plate();
    const cam = new MacroCamera(stream('plate.macro'));
    let waited = 0, shot;
    for (let t = 0; t < 60; t++) { shot = cam.update(f, DT, opts(mode)); waited = Math.max(waited, Math.hypot(shot.cx - 0.5, shot.cy - 0.5)); }
    pour(f, 0.72, 0.3);
    shot = cam.update(f, DT, opts(mode));
    const r = read(f, shot, 0.72, 0.3);
    check(`${mode}, an empty plate waits on the aim and lands on the first pour`, waited < 1e-6 && r.off < 1 / 3,
      `${waited.toExponential(1)} of the plate off the aim while empty (under 1e-6 wanted), then the pour ${fx(r.off)} of a half-frame off the middle the frame it was poured (under 0.333 wanted)`);
  }

  // 6b. The pinch and the slider come in a notch at a time: 1.01x is
  // nearly the whole plate, and not bare, so the landing is asked again
  // until the zoom is fully in (the review's ramp ended on 0.5, 0.5).
  for (const mode of ['hold', 'follow']) {
    const cam = new MacroCamera(stream('plate.macro'));
    let shot;
    for (let t = 0; t <= 60; t++) shot = cam.update(report, DT, { ...opts(mode), zoom: 1.01 + (ZOOM - 1.01) * Math.min(1, t / 60) });
    for (let t = 0; t < 30; t++) shot = cam.update(report, DT, opts(mode));
    const r = read(report, shot, 0.22, 0.30);
    check(`${mode}, a zoom ramped in from 1.01x lands on the pool`, r.off < 1 / 3 && r.share >= 0.5,
      `the pool ${fx(r.off)} of a half-frame off the middle (under 0.333 wanted), the frame ${fx(r.share)} of the fullest's dye (0.5 wanted); at ${fx(shot.cx)}, ${fx(shot.cy)}`);
  }

  // 6d. In by +, as the app's keys and the chip come in now the Close-up
  // button is gone (QA-32c): 1.2x a press, three frames apart, to 4.3x. The
  // pool sits a fifth of the plate from the aim, so the 2.07x frame still
  // shows its edge and the 4.3x frame is bare: the landing that stood at
  // the first frame past 2x stayed on the aim (the Mac's app half, 0.000 of
  // the frame lit). And the control: the same presses stopped at 2.07x, the
  // pool in that frame, stay on the aim, since there it is not bare.
  {
    const steps = (n) => Array.from({ length: n }, (_, k) => 1.2 ** (k + 1));
    const edge = plate();
    pour(edge, 0.3, 0.5);
    const frameOn = (z) => {
      const ex = spanX / z * 0.5 * SIZE, ey = spanY / z * 0.5 * SIZE;
      let s = 0, n = 0;
      for (let j = Math.floor(SIZE / 2 - ey); j <= Math.ceil(SIZE / 2 + ey); j++) for (let i = Math.floor(SIZE / 2 - ex); i <= Math.ceil(SIZE / 2 + ex); i++) { s += edge.density[j * SIZE + i]; n++; }
      return s / n / plateMean(edge);
    };
    const at207 = frameOn(1.2 ** 4), at43 = frameOn(1.2 ** 7);
    const press = (zooms, mode) => {
      const cam = new MacroCamera(stream('plate.macro'));
      let shot;
      for (const z of zooms) for (let t = 0; t < 3; t++) shot = cam.update(edge, DT, { ...opts(mode), zoom: z });
      for (let t = 0; t < 60; t++) shot = cam.update(edge, DT, { ...opts(mode), zoom: zooms[zooms.length - 1] });
      return shot;
    };
    for (const mode of ['hold', 'follow']) {
      const shot = press(steps(7), mode);
      const r = read(edge, shot, 0.3, 0.5);
      check(`${mode}, a zoom pressed in by + to 4.3x lands on the pool its 2.07x frame still showed`,
        at207 >= BARE && at43 < BARE && r.off < 1 / 3,
        `the frame on the aim holds ${fx(at207)} of the plate's average at 2.07x (${BARE} or more wanted: not bare) and ${fx(at43)} at 4.3x (under ${BARE}: bare); the pool ${fx(r.off)} of a 4x half-frame off the middle (under 0.333 wanted); at ${fx(shot.cx)}, ${fx(shot.cy)}`);
    }
    const stopped = press(steps(4), 'hold');
    const miss = Math.hypot(stopped.cx - 0.5, stopped.cy - 0.5);
    check('the control: the same presses stopped at 2.07x, the pool in the frame, stay on the aim', miss < 1e-6,
      `the frame ${miss.toExponential(1)} of the plate from the aim (under 1e-6 wanted), the pool showing ${fx(at207)} of the plate's average there`);
  }

  // 6c. A switch from Auto to Hold during the closeup is a hand on the
  // camera, not the closeup coming in: Hold goes to its aim, glass or not
  // (App writes the camera's centre into the aim as it switches, QA-12, so
  // in the app this is no move at all; `npm run holdjump`).
  {
    const cam = new MacroCamera(stream('plate.macro'));
    for (let t = 0; t < 60; t++) cam.update(report, DT, opts('auto'));
    let shot;
    for (let t = 0; t < 90; t++) shot = cam.update(report, DT, opts('hold'));
    const miss = Math.hypot(shot.cx - 0.5, shot.cy - 0.5);
    check('a switch from Auto to Hold mid-closeup is not a landing', miss < 0.005,
      `the frame ${fx(miss)} of the plate from Hold's aim on bare glass (under 0.005 wanted)`);
  }

  // 7. Out and in again lands again.
  {
    const cam = new MacroCamera(stream('plate.macro'));
    for (let t = 0; t < 30; t++) cam.update(report, DT, opts('hold'));
    for (let t = 0; t < 30; t++) cam.update(report, DT, opts('hold', 0.7, 0.65));
    cam.reset();   // what LiquidVisualizer does as the closeup comes in
    let shot;
    for (let t = 0; t < 30; t++) shot = cam.update(report, DT, opts('hold', 0.7, 0.65));
    const r = read(report, shot, 0.22, 0.30);
    check('out and in again, it lands again', r.off < 1 / 3,
      `the pool ${fx(r.off)} of a half-frame off the middle (under 0.333 wanted), the aim left on bare glass by a hand the time before`);
  }

  // 8. The button's press.
  // 10. A zoom parked short of fully in stops asking.
  {
    const f = plate();
    pour(f, 0.5, 0.5, 2, 6); pour(f, 0.22, 0.30);
    const cam = new MacroCamera(stream('plate.macro'));
    const parked = { ...opts('hold'), zoom: 1.5 };
    for (let t = 0; t < 600; t++) cam.update(f, DT, parked);
    for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) { if (Math.hypot(i - SIZE / 2, j - SIZE / 2) < 30) f.density[j * SIZE + i] = 0; }
    let worst = 0;
    for (let t = 0; t < 120; t++) { const sh = cam.update(f, DT, parked); worst = Math.max(worst, Math.hypot(sh.cx - 0.5, sh.cy - 0.5)); }
    check('a zoom parked at 1.5x stops asking: a held shot whose middle drains does not cut', worst < 1e-6,
      `the frame moved ${worst.toExponential(1)} of the plate off the aim after the middle drained at 10 s (under 1e-6 wanted)`);
  }

  // 11. The landing is told once, and the aim made from it pans on from the pool.
  {
    const told = [];
    const cam = new MacroCamera(stream('plate.macro'));
    const landOpts = { ...opts('hold'), onLand: (x, y) => told.push([x, y]) };
    for (let t = 0; t < 60; t++) cam.update(report, DT, landOpts);
    const at = told[0] ?? [0.5, 0.5];
    const toldOff = Math.max(Math.abs(at[0] - 0.22) * SIZE / hx, Math.abs(at[1] - 0.30) * SIZE / hy);
    // A quarter of the frame to the right, as one tap of the arrow is (`panAim`).
    const nudged = [at[0] + spanX / ZOOM * 0.25, at[1]];
    let shot;
    for (let t = 0; t < 90; t++) shot = cam.update(report, DT, { ...opts('hold', nudged[0], nudged[1]), onLand: landOpts.onLand });
    const strayed = Math.hypot(shot.cx - nudged[0], shot.cy - nudged[1]);
    const r = read(report, shot, 0.22, 0.30);
    check('where it lands is told once, and a nudge of the aim from there pans on from the pool',
      told.length === 1 && toldOff < 1 / 3 && strayed < 0.005 && r.off < 1,
      `told ${told.length} time(s) (1 wanted), at ${told.map(([x, y]) => `${fx(x)}, ${fx(y)}`).join('; ') || 'nowhere'}, the pool ${fx(toldOff)} of a half-frame off it (under 0.333 wanted); nudged, the frame ${fx(strayed)} of the plate from the new aim (under 0.005 wanted) with the pool ${fx(r.off)} of a half-frame off its middle (in the frame, under 1, wanted)`);
  }

  // 8. The Macro Zoom is the closeup's one control.
  {
    let wrong = 0, cases = 0;
    const off = [];
    for (const macroMode of [undefined, false, true]) {
      for (const macroZoom of [undefined, 0.5, 1, 1.04, 1.05, 1.06, 2, 4, 12]) {
        cases++;
        const want = Math.max(1, macroZoom ?? 1);
        if (macroZoomOf({ macroMode, macroZoom }) !== want) { wrong++; off.push(`${macroMode}/${macroZoom} → ${macroZoomOf({ macroMode, macroZoom })}`); }
      }
    }
    // The flag-on look at 1x is the case the old reading drew at 4x: asked by name, so a
    // grid that lost it could not pass.
    const flagAtOne = macroZoomOf({ macroMode: true, macroZoom: 1 });
    const { PRESETS } = await import('../src/presets.ts');
    const flagged = PRESETS.filter((p) => p.settings.macroMode === true);
    const bare = flagged.filter((p) => !((p.settings.macroZoom ?? 1) > 1.05)).map((p) => p.id);
    // A look saved as it is drawn: a zoom from the remote or a fader comes
    // without the flag, and saving it at 3x must not bring it back at the plate
    // (cleanSettings' rule for looks from before the zoom was the control).
    const { makeUserPreset } = await import('../src/lib/userPresets.ts');
    const { DEFAULT_SETTINGS } = await import('../src/types.ts');
    const saved = makeUserPreset('z', '', { ...DEFAULT_SETTINGS, macroZoom: 3, macroMode: false }, null, null).settings;
    const savedFlat = makeUserPreset('p', '', { ...DEFAULT_SETTINGS, macroZoom: 1, macroMode: true }, null, null).settings;
    // A show's stage that says Closeup with no zoom of its own glides the zoom.
    const { stageCloseup, STAGE_CLOSEUP_ZOOM } = await import('../src/lib/sequencer.ts');
    const on = {}, kept = { macroZoom: 6 }, offStage = { macroZoom: 6 };
    stageCloseup(on, true); stageCloseup(kept, true); stageCloseup(offStage, false);
    check('the frame\'s zoom is the Macro Zoom on every flag, every closeup look carries its own, a save keeps it and a stage moves it',
      wrong === 0 && flagAtOne === 1 && flagged.length > 0 && bare.length === 0
      && macroZoomOf(saved) === 3 && macroZoomOf(savedFlat) === 1
      && on.macroZoom === MACRO_PRESET_ZOOM && STAGE_CLOSEUP_ZOOM === MACRO_PRESET_ZOOM && kept.macroZoom === 6 && offStage.macroZoom === 1,
      `${wrong} of ${cases} flag and zoom pairs read otherwise${off.length ? ` (${off.join(', ')})` : ''}; macroMode on at 1x reads ${flagAtOne}x (1 wanted: it was 4); ${flagged.length} shipped closeup looks, ${bare.length ? `with no zoom: ${bare.join(', ')}` : 'each with a zoom past 1.05'}; saved at 3x with the flag off it reads ${macroZoomOf(saved)}x (3 wanted), at 1x with it on ${macroZoomOf(savedFlat)}x (1 wanted); a stage's Closeup on ${on.macroZoom}x (${MACRO_PRESET_ZOOM} wanted), on over 6x ${kept.macroZoom}x, off ${offStage.macroZoom}x`);
  }

  // 9. The landing's full zoom is the solver's, and no Close-up press is left in src/.
  {
    /*
      The owner asked for the Close-up button gone everywhere (2026-11-14):
      the desk's Recipe panel, the side rail's Macro, the phone's Zoom toggle,
      the remote's Closeup switch, the palette's "Macro closeup", the Macro
      pad action on MIDI, the gamepad and the controllers' maps. Each was a
      press to 4x and back beside the zoom; a scan of the source is how a
      hand that comes back would be seen, since none of them has a check of
      its own any more to fail. A write of `macroMode` is only `true`,
      `false`, a zoom compared to 1.05 or a stage's own boolean; never `!`.
    */
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join, relative } = await import('node:path');
    const root = join(process.cwd(), 'src');
    const files = [];
    const walk = (d) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else if (/\.tsx?$/.test(n)) files.push(f); } };
    walk(root);
    const hits = [];
    for (const f of files) {
      const rel = relative(root, f).split('\\').join('/');
      // Comments out, line count kept: what they say about the old press is history, not a hand.
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
      code.split('\n').forEach((line, i) => {
        if (/^\s*\/\//.test(line)) return;
        /*
          The names a press went by, and the shapes a new one would take
          whatever it is called: a two-valued zoom (a ternary between the
          plate and a closeup, written as a patch or handed to onZoom), and a
          flip of the flag. The zoom's own steps (+ and −, the slider, the
          pinch) are a value along it, never one of two.
        */
        if (/closeupToggle|(macro|closeup)-toggle|macro-button|macroMode:\s*!/.test(line)
          || /macroZoom:\s*[^,}]*\?[^:]*:/.test(line)
          || /\?\s*\{\s*macroZoom:\s*1\b/.test(line)
          || /onZoom\([^)]*\?/.test(line)) hits.push(`${rel}:${i + 1}`);
      });
    }
    check('the landing\'s full zoom is the solver\'s, and no Close-up press is left in the app',
      LAND_FULL_ZOOM === MACRO_FULL_ZOOM && files.length > 100 && hits.length === 0,
      `full ${LAND_FULL_ZOOM} vs ${MACRO_FULL_ZOOM}; ${files.length} source files, a Close-up press at ${hits.join(', ') || 'none'}`);
  }
} else {
  const { chromium } = await import('playwright');
  const { spawn } = await import('node:child_process');
  const { launchChromium, presentsInXvfb, port, untilServing } = await import('./chromium.mjs');
  const { engineQuery, installFrameReader, frameOf, waitForShow, waitForEngine, settlePlate } = await import('./frame.mjs');
  const PORT = port(4793);
  /** The app's pool, in plate uv (see layPool). */
  const POOL = [0.33, 0.5];
  const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { detached: true, stdio: 'ignore' });
  const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
  process.on('exit', stop);
  await untilServing(PORT, { child: server });
  const browser = await launchChromium(chromium, { present: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await installFrameReader(page);
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
    const opened = await waitForShow(page, presentsInXvfb() ? 300_000 : 60_000);
    if (opened === null) throw new Error('the show never opened');
    await waitForEngine(page);
    await settlePlate(page, 3000);
    /*
      The plate of the report: cleared, one pool off the middle. The look's
      opening may still be pouring when a software plate gets here (it did
      on the first run of this in a cloud session: the frame on the aim held
      3.6 times the plate's average after the clear), so the clear is laid
      again until the plate stays as laid, at most four times; the control
      below says whether it did.
    */
    /*
      Where: a sixth of the plate left of the middle. The 1x frame shows the
      middle two thirds of the plate across and, on a 16:10 desk, the middle
      0.42 up it (the plate is drawn at 1.5 times the frame's long side), so
      the node half's pool at (0.22, 0.30) sat on the frame's top edge here:
      on the Mac's runs the 1x frame read 0.017 lit once and then black to
      the last pixel twice (the brightest pixel 0 of 255), while the
      closeup found it each time: the likeliest reading is the dish's turn
      or the Mac's frame carrying it out of the 1x frame. At (0.33, 0.5) it stays in the 1x
      frame however the dish turns (0.17 from the middle, under the 0.21 the
      frame reaches up and down), and the 4x frame on the aim (0.083 by 0.052
      of the plate either side of it) stays bare.
    */
    const layPool = () => page.evaluate(([px, py]) => {
      const d = window.chromaglassDebug(); const f = d.fluids[0]; const N = d.gridSize;
      f.clearAll();
      for (let j = -10; j <= 10; j++) for (let i = -10; i <= 10; i++) {
        if (i * i + j * j < 100) f.addDensity(Math.round(N * px) + i, Math.round(N * py) + j, 1.5, 1, 0.3, 0.1);
      }
      f.markDirty();
    }, POOL);
    const lit = async () => {
      const px = await frameOf(page, 160, 100);
      if (!px) return null;
      let n = 0, top = 0;
      for (let i = 0; i < px.length; i += 4) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; if (l > 24) n++; if (l > top) top = l; }
      lit.top = top;
      return n / (px.length / 4);
    };
    const state = () => page.evaluate(([px, py]) => {
      const d = window.chromaglassDebug(); const rd = d.fluids[0].readDensity; const N = d.gridSize; const s = d.settings;
      // The 4x frame on the aim, as the camera reads it (a 16:10 canvas, the frame 1/1.5 of the plate across at 1x).
      const hx = (1 / 1.5) / 4 * 0.5 * N, hy = hx / 1.6;
      let all = 0, frame = 0, n = 0;
      for (let k = 0; k < rd.length; k++) all += Math.max(0, rd[k]);
      const cx = (s.macroAimX ?? 0.5) * N, cy = (s.macroAimY ?? 0.5) * N;
      for (let j = Math.floor(cy - hy); j <= Math.ceil(cy + hy); j++) for (let i = Math.floor(cx - hx); i <= Math.ceil(cx + hx); i++) { frame += Math.max(0, rd[i + j * N]); n++; }
      // How far the shot is from the pool, in halves of the frame it shows.
      const c = document.querySelector('#liquid-canvas') ?? document.querySelector('canvas');
      const w = c?.width || 16, h = c?.height || 10, maxDim = Math.max(w, h) * 1.5, z = Math.max(1, d.shot.zoom);
      const off = Math.max(Math.abs(d.shot.cx - px) / (w / maxDim / z * 0.5), Math.abs(d.shot.cy - py) / (h / maxDim / z * 0.5));
      return { onAim: (frame / n) / (all / rd.length), off, zoom: d.shot.zoom, macroMode: s.macroMode, macroZoom: s.macroZoom, aimX: s.macroAimX ?? 0.5, aimY: s.macroAimY ?? 0.5 };
    }, POOL);
    let before = null;
    for (let tries = 0; tries < 4 && !(before?.onAim < BARE); tries++) {
      await layPool();
      await settlePlate(page, 2000);
      before = await state();
    }
    const flat = await lit();
    // The pool is about half a percent of the plate; 0.026 of the 1x frame
    // lit in a cloud session.
    check('the control: at 1x the pool is drawn', flat !== null && flat > 0.005,
      `${flat === null ? 'no frame read' : fx(flat)} of the frame lit, its brightest pixel ${Math.round(lit.top ?? 0)} of 255 (over 0.005 wanted: a frame that could not be read is black too)`);
    check('the control: the frame on the aim is bare glass', before.onAim < BARE,
      `the 4x frame on the aim holds ${fx(before.onAim)} of the plate's average dye (under ${BARE} wanted)`);
    // In by the zoom, the closeup's one control, as a hand does: + seven
    // times from the plate (1.2x a step from 1.2, to 4.3x), the app's own
    // zoom code (zoomMacro, the − / + chip's and the wheel's too).
    await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
    for (let k = 0; k < 7; k++) { await page.keyboard.press('+'); await page.waitForTimeout(50); }
    await settlePlate(page, 1500);
    const inside = await state();
    const chip = await page.locator('[data-testid="macro-zoom-value"]').textContent().catch(() => null);
    const close = await lit();
    // Lit, and lit by the pool: the shot on it, and the aim moved there from
    // the bare middle (the landing is handed back as the aim, `onLand`). The
    // old camera never wrote the aim, so a look that poured into the middle
    // meanwhile cannot pass this for it.
    const aimToPool = Math.hypot(inside.aimX - POOL[0], inside.aimY - POOL[1]);
    check('the zoom pushed in lands on the liquid, not on bare glass, and the aim says where',
      close !== null && close > LIT_SHARE && inside.off < 1 / 3 && aimToPool < 0.05,
      `${close === null ? 'no frame read' : fx(close)} of the 4x frame lit (over ${LIT_SHARE} wanted), the pool ${fx(inside.off)} of a half-frame off its middle (under 0.333 wanted), the aim at ${fx(inside.aimX)}, ${fx(inside.aimY)}, ${fx(aimToPool)} of the plate from the pool (under 0.05 wanted)`);
    check('and the zoom chip reads the zoom, the frame there', chip?.trim() === `${(inside.macroZoom ?? 1).toFixed(1)}×` && inside.macroZoom > 4 && inside.zoom > 3,
      `the chip reads ${chip ?? 'nothing'}, Macro Zoom ${inside.macroZoom} (past 4 wanted), the frame at ${fx(inside.zoom)}x`);
    // Out by the zoom too: the chip's − (the − key's step) until it is gone,
    // with no switch to find. Clicked in the page: a software plate's frames
    // outlast Playwright's own wait after a click.
    let presses = 0;
    for (; presses < 20; presses++) {
      const minus = page.locator('[data-testid="macro-zoom-out"]');
      if (!(await minus.count())) break;
      await minus.evaluate((b) => b.click());
      await page.waitForTimeout(50);
    }
    await settlePlate(page, 1000);
    const out = await state();
    check('the zoom brought down is out at the plate, the flag with it', out.macroMode === false && out.macroZoom === 1 && out.zoom < 1.05,
      `after ${presses} presses of −: macroMode ${out.macroMode}, Macro Zoom ${out.macroZoom}, the frame at ${fx(out.zoom)}x`);
  } finally {
    await browser.close();
    stop();
  }
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
