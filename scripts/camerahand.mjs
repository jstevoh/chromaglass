#!/usr/bin/env node
/**
 * The closeup camera answers a hand (PLAN.md 27d, "Camera controls feel weak").
 *
 *   npm run camerahand      (node only; the real MacroCamera, as `steadycam` runs it)
 *
 * What was reported (the owner, 2026-10-22): "the camera controls don't really
 * do much". Measured on the closeup's controls at 1440 px, 60 frames a second:
 *
 *   - Chase Speed in Hold took 0.37 s to cover nine tenths of an aim jump at
 *     0 and 0.18 s at 1, and nothing once the aim stopped: a twofold throw.
 *     In Follow the frame tracks a drifting drop the same at 0, 0.4 and 1,
 *     because the lead (lib/macroCamera.ts leadTarget) cancels the lag, so
 *     it is Hold's answer that Chase can be.
 *   - Macro Zoom's slider was linear over 1x..16x: 1x to 4x, where the closeup
 *     lives, was the first fifth of the travel, and 8x to 16x, where the
 *     solver's grid is a dozen cells across, was the last half.
 *   - Music Sync does nothing to the frame in Hold and Follow while Frame Sway
 *     is 0 (the owner's rule: the frame is moved by a hand), and says nothing.
 *   - The only pan was Alt-drag.
 *
 * What is asked, and what each line can and cannot catch:
 *   1. Chase's throw: Hold's 90% time is over 2 s at 0, under 0.1 s at 1, and at
 *      the default 0.4 is the 0.27 s it always was (a look that left Chase alone
 *      moves as before). The control: the measure reads the analytic time for
 *      the rate it was handed, ln(10) / rate, so a harness that measured
 *      nothing would not agree with it.
 *   2. Zoom's travel: the curve is the setting table's (the desk, the phone,
 *      the remote and a MIDI fader all read it), 8x is within three quarters of
 *      the travel, 4x within half, and a value goes out and back unchanged.
 *   3. The arrows pan by the frame, not the plate (a tap at 8x is half a tap
 *      at 4x), a Shift is a frame, a held key is slower than a tap, the aim
 *      stays on the plate; and the app binds them only while the closeup is in.
 *   4. Music Sync's label is true: through a song in Hold at Frame Sway 0 the
 *      shot is identical at Sync 0 and 1, and with Frame Sway up it is not.
 *      The panel greys the slider with that reason in exactly those two cases.
 *   5. The phone's remote has Chase Speed beside Music Sync and Shot Length.
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const out = 'node_modules/.cache/camerahand-lib.mjs';
await build({
  stdin: {
    contents: [
      "export { MacroCamera, holdRate, panAim } from './src/lib/macroCamera.ts';",
      "export { LEARNABLE_SETTINGS, curveOf, handValueAt, travelOf } from './src/lib/midi.ts';",
    ].join('\n'),
    resolveDir: '.', loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
  define: { 'import.meta.env.DEV': 'false' },
});
const L = await import(`../${out}`);

const SIZE = 192, FPS = 60, DT = 1 / FPS, W = 1440, H = 900;
const spanX = W / (W * 1.5), spanY = H / (W * 1.5);
const field = () => {
  const f = { density: new Float32Array(SIZE * SIZE), vx: new Float32Array(SIZE * SIZE), vy: new Float32Array(SIZE * SIZE), size: SIZE };
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) { const d = (i - 96) ** 2 + (j - 96) ** 2; if (d < 900) f.density[j * SIZE + i] = 3 * Math.exp(-d / 40); }
  return f;
};
const base = { zoom: 4, chase: 0.4, hold: 5, sync: 0.5, sway: 0, mode: 'hold', aimX: 0.35, aimY: 0.5, spanX, spanY, floor: 0, energy: 0, bass: 0, treble: 0, beat: false };

// ── 1. Chase's throw ───────────────────────────────────────────────────
const ninety = (chase) => {
  const f = field(), c = new L.MacroCamera();
  let s;
  for (let i = 0; i < 12 * FPS; i++) s = c.update(f, DT, { ...base, chase });
  const x0 = s.cx;
  for (let i = 0; i < 12 * FPS; i++) {
    s = c.update(f, DT, { ...base, chase, aimX: 0.65 });
    if (Math.abs(s.cx - x0) >= 0.9 * 0.3) return (i + 1) * DT;
  }
  return Infinity;
};
const t0 = ninety(0), t4 = ninety(0.4), t1 = ninety(1);
check('1a. Chase 0 glides: nine tenths of an aim jump takes over 2 s', t0 > 2, `${t0.toFixed(2)} s`);
check('1b. Chase 1 snaps: under 0.1 s', t1 < 0.1, `${t1.toFixed(3)} s`);
check('1c. the default 0.4 still answers in the 0.27 s it did (within a frame or two)', Math.abs(t4 - 0.27) < 0.04, `${t4.toFixed(3)} s`);
check('1d. the throw is over thirty fold (it was twofold: 0.37 s to 0.18 s)', t0 / t1 > 30, `${(t0 / t1).toFixed(0)}x`);
const analytic = (c) => Math.log(10) / L.holdRate(c);
check('1e. control: the measured time is the ease\'s own, ln 10 over its rate, at the three settings',
  [[0, t0], [0.4, t4], [1, t1]].every(([c, t]) => Math.abs(t - analytic(c)) < 2 * DT + 0.03 * analytic(c)),
  [[0, t0], [0.4, t4], [1, t1]].map(([c, t]) => `${c}: ${t.toFixed(3)} vs ${analytic(c).toFixed(3)}`).join(', '));
check('1f. a Chase that is not a number is the default\'s, not a stuck camera', Math.abs(L.holdRate(NaN) - L.holdRate(0.4)) < 1e-9);

// ── 2. Zoom's travel ───────────────────────────────────────────────────
const zs = L.LEARNABLE_SETTINGS.find((s) => s.key === 'macroZoom');
const curve = L.curveOf('macroZoom');
const at = (t) => L.handValueAt(t, zs.min, zs.max, curve);
check('2a. Macro Zoom has a curve in the setting table, so every control bends it alike', curve > 1, `curve ${curve}`);
check('2b. 4x is within the first half of the travel, 8x within three quarters',
  L.travelOf(4, zs.min, zs.max, curve) <= 0.5 && L.travelOf(8, zs.min, zs.max, curve) <= 0.75,
  `4x at ${L.travelOf(4, zs.min, zs.max, curve).toFixed(2)}, 8x at ${L.travelOf(8, zs.min, zs.max, curve).toFixed(2)} (linear: 0.20, 0.47)`);
check('2c. both ends are still there: travel 0 is 1x, travel 1 is 16x', at(0) === 1 && at(1) === 16, `${at(0)} .. ${at(1)}`);
check('2d. a value goes out and back unchanged (a look saved at 4.5x reads 4.5x)',
  [1, 1.2, 2, 4, 4.5, 6, 12, 16].every((z) => Math.abs(at(L.travelOf(z, zs.min, zs.max, curve)) - z) < 0.01));

// ── 3. The arrows ──────────────────────────────────────────────────────
const mid = { x: 0.5, y: 0.5 };
const tap4 = L.panAim(mid, { dx: 1, dy: 0 }, 4).x - 0.5, tap8 = L.panAim(mid, { dx: 1, dy: 0 }, 8).x - 0.5;
const shift4 = L.panAim(mid, { dx: 1, dy: 0 }, 4, { big: true }).x - 0.5, held4 = L.panAim(mid, { dx: 1, dy: 0 }, 4, { repeat: true }).x - 0.5;
check('3a. a tap moves a quarter of the frame, and the frame\'s share holds at any zoom (8x is half of 4x)',
  Math.abs(tap4 - (2 / 3) / 4 / 4) < 1e-9 && Math.abs(tap8 * 2 - tap4) < 1e-9, `${tap4.toFixed(4)} at 4x, ${tap8.toFixed(4)} at 8x`);
check('3b. Shift moves a whole frame, and a held key is much slower than a tap', Math.abs(shift4 - (2 / 3) / 4) < 1e-9 && held4 < tap4 / 5, `${shift4.toFixed(4)}, held ${held4.toFixed(4)}`);
const edge = L.panAim({ x: 0.99, y: 0.01 }, { dx: 1, dy: -1 }, 2, { big: true });
check('3c. the aim stays on the plate', edge.x === 1 && edge.y === 0, `${edge.x}, ${edge.y}`);
check('3d. up is up and down is down: the aim\'s y grows downward, as the plate\'s uv does', L.panAim(mid, { dx: 0, dy: -1 }, 4).y < 0.5 && L.panAim(mid, { dx: 0, dy: 1 }, 4).y > 0.5);
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
check('3e. the app pans on the four arrows, only with the closeup in, through the aim Alt-drag uses',
  /ArrowLeft: \[-1, 0\], ArrowRight: \[1, 0\], ArrowUp: \[0, -1\], ArrowDown: \[0, 1\]/.test(app)
  && /if \(arrow && \(settingsRef\.current\.macroZoom \?\? 1\) > 1\.05\)/.test(app) && /aimMacro\(to\.x, to\.y\)/.test(app));

// ── 4. Music Sync's label ──────────────────────────────────────────────
const song = (sway, sync) => {
  const f = field(), c = new L.MacroCamera(), EVERY = 30, shots = [];
  for (let i = 0; i < FPS * 12; i++) {
    const since = (i % EVERY) * DT;
    shots.push(c.update(f, DT, { ...base, mode: 'hold', aimX: 0.5, zoom: 6, sync, sway, beat: i % EVERY === 0, bass: 0.9 * Math.exp(-since / 0.25),
      treble: 0.85 * Math.exp(-((i % 15) * DT) / 0.12), energy: 0.7 }));
  }
  return shots;
};
const diff = (a, b) => a.reduce((m, s, i) => Math.max(m, Math.abs(s.cx - b[i].cx), Math.abs(s.cy - b[i].cy), Math.abs(s.zoom - b[i].zoom)), 0);
const still = diff(song(0, 0), song(0, 1)), swayed = diff(song(1, 0), song(1, 1));
check('4a. Hold at Frame Sway 0: Music Sync 0 and 1 give the same shot, frame for frame', still === 0, `max difference ${still}`);
check('4b. with Frame Sway up they do not (so the slider is live there, and the panel must not grey it)', swayed > 0.001, `max difference ${swayed.toFixed(4)}`);
const panel = readFileSync(new URL('../src/components/SettingsPanel.tsx', import.meta.url), 'utf8');
check('4c. the panel greys Music Sync in Hold and Follow with Frame Sway at 0, naming why',
  /disabled=\{\(settings\.macroCamera \?\? 'hold'\) !== 'auto' && \(settings\.frameSway \?\? 0\) <= 0\.001 && 'needs Frame Sway'\}\s+label="Music Sync"/.test(panel));

// ── 5. The phone's remote ──────────────────────────────────────────────
const remote = readFileSync(new URL('../src/components/RemoteControl.tsx', import.meta.url), 'utf8');
check('5. the remote has Chase Speed with the closeup\'s other sliders', /<Slider label="Chase Speed" field="macroChase"/.test(remote));

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length} of ${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
