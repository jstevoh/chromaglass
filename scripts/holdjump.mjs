#!/usr/bin/env node
/**
 * Hold stays where the closeup is (PLAN.md QA-12, src/lib/macroCamera.ts).
 *
 * The owner pressed Hold on the zoom chip and the picture jumped. Hold sits on
 * the stored aim, and under Auto or Follow the camera had ridden off after
 * the liquid, so Hold eased it back to the old aim. The fix writes the
 * camera's own centre into the aim as Hold is pressed (`holdWhereItIs`, which
 * App's updateSettings runs on every patch: the desk's chip, the phone's Hold,
 * the Camera menu).
 *
 * The camera here is the real MacroCamera on a made-up plate: one drop of dye
 * drifting across, which Auto and Follow ride away from the stored aim, so
 * that the old Hold has a long way to go and the check can see it go. Each switch is run twice from the
 * same state, once with the patch as it was sent (main's Hold) and once
 * through holdWhereItIs, and the frame's centre is followed for a second
 * after. The first must move (or the plate never gave the old Hold anywhere
 * to go, and the second passing would mean nothing); the second must not.
 * The app's own wiring is asked by `npm run phone` on the Mac shard, where
 * the app's frames run.
 *
 *   npm run holdjump
 */
import { MacroCamera, holdWhereItIs } from '../src/lib/macroCamera.ts';
import { stream } from '../src/lib/rng.ts';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else failed++; console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

const SIZE = 192, DT = 1 / 60;
const field = { density: new Float32Array(SIZE * SIZE), vx: new Float32Array(SIZE * SIZE), vy: new Float32Array(SIZE * SIZE), size: SIZE };
// A drop of dye at (x, y) cells, moving at (u, v) cells a second; the velocity
// field carries the same motion, in cells a step, which is what the camera leads by.
const lay = (x, y, u, v) => {
  field.density.fill(0);
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const r2 = (i - x) ** 2 + (j - y) ** 2;
    field.density[j * SIZE + i] = 3 * Math.exp(-r2 / 40);
  }
  field.vx.fill(u * DT); field.vy.fill(v * DT);
};
const opts = (s) => ({ zoom: 3, chase: 0.6, hold: 5, spanX: 1 / 1.5, spanY: 1 / 1.5, mode: s.macroCamera,
  aimX: s.macroAimX, aimY: s.macroAimY });

/** Run the camera on mode `from` for four seconds, switch with `patch`, and return how far the frame moves in the second after. */
function run(from, patch, useFix) {
  const cam = new MacroCamera(stream('plate.macro'));
  // Follow is aimed at the drop, to lock on and ride off with it; Auto
  // finds it on its own, aimed at the middle.
  let x = 0.2 * SIZE, y = 0.8 * SIZE, shot;
  let s = { macroCamera: from, macroAimX: from === 'follow' ? 0.2 : 0.5, macroAimY: from === 'follow' ? 0.8 : 0.5 };
  const nullBefore = cam.centre === null;
  const step = () => { lay(x, y, 10, -1); x += 10 * DT; y -= 1 * DT; shot = cam.update(field, DT, opts(s)); };
  for (let t = 0; t < 4 * 60; t++) step();
  const at = { x: shot.cx, y: shot.cy };
  const p = useFix ? holdWhereItIs(patch, s.macroCamera, () => cam.centre) : patch;
  s = { ...s, ...p };
  let moved = 0;
  for (let t = 0; t < 60; t++) { step(); moved = Math.max(moved, Math.hypot(shot.cx - at.x, shot.cy - at.y)); }
  return { moved, nullBefore, aim: [s.macroAimX, s.macroAimY], at };
}

for (const from of ['auto', 'follow']) {
  const was = run(from, { macroCamera: 'hold' }, false);
  const now = run(from, { macroCamera: 'hold' }, true);
  check(`from ${from}, Hold keeps the frame where it is`, was.moved > 0.1 && now.moved < 0.005,
    `frame centre moved ${was.moved.toFixed(3)} of the plate in the second after Hold on the old aim (over 0.100 wanted, so there was a jump to stop), `
    + `${now.moved.toFixed(3)} with the aim taken from the camera (under 0.005 wanted; aim ${now.aim.map((v) => v.toFixed(3)).join(', ')})`);
  if (from === 'auto') check('the camera has no centre before it has run', was.nullBefore);
}

{
  const here = () => ({ x: 0.3, y: 0.6 });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check('a switch to Hold takes the camera\'s centre as its aim', same(holdWhereItIs({ macroCamera: 'hold' }, 'auto', here), { macroCamera: 'hold', macroAimX: 0.3, macroAimY: 0.6 }));
  check('and leaves alone: Hold already on, another mode, an aim of its own, no closeup running',
    same(holdWhereItIs({ macroCamera: 'hold' }, 'hold', here), { macroCamera: 'hold' })
    && same(holdWhereItIs({ macroCamera: 'hold' }, undefined, here), { macroCamera: 'hold' })
    && same(holdWhereItIs({ macroCamera: 'follow' }, 'auto', here), { macroCamera: 'follow' })
    && same(holdWhereItIs({ macroCamera: 'hold', macroAimX: 0.9, macroAimY: 0.1 }, 'auto', here), { macroCamera: 'hold', macroAimX: 0.9, macroAimY: 0.1 })
    && same(holdWhereItIs({ macroCamera: 'hold' }, 'follow', () => null), { macroCamera: 'hold' }));
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
