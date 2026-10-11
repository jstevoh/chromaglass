#!/usr/bin/env node
/**
 * The closeup holds still: the music moves the liquid, not the camera
 * (lib/macroCamera.ts, lib/beads.ts).
 *
 *   npm run steadycam        (node only; the same functions the frame loop calls)
 *
 * What was reported (the owner, 2026-10-11, the morning after Frame Sway
 * seated the plate's own sway): "the macro zoom is even bouncier and
 * twitchier than before." Three things moved the closeup's frame that were
 * not the liquid:
 *
 *   - Macro Sync, 0.5 by default on every look, had three hands on the
 *     frame in every camera mode: a kick's punch-in on the zoom, a push with
 *     the energy, and a "handheld" tremor from the treble. Through the song
 *     below at 6x on a 1440 px frame the song swayed the frame 0.42% of its
 *     width (6 px) and pumped the zoom 3.2% (the frame's edge 23 px); at
 *     Macro Bead's 0.85, 0.71% and 6.3%.
 *   - The camera led its subject by the solver's velocity in the subject's
 *     one cell, times up to sixteen cells, and that velocity carries the
 *     music (Beat Squeeze's press, a kick's shove): a press of half a cell a
 *     step under a drop drifting on steadily threw the frame 0.95% (14 px)
 *     in a frame and 1.6% (24 px) over the beat.
 *   - Every drop of oil walked ±0.075 cells on each axis every solver step,
 *     4 px rms sixty times a second at 6x.
 *
 * What the craft does, from the references: a macro rig over a dish is a
 * camera on a copy stand or a boom arm, the plates moved under it, the
 * only motion in the picture the liquid's; a tripod is "essential", a pan
 * no faster than a frame width in seven seconds. Viewers notice a step of
 * about a pixel against fixed references, and 0.2 to 0.4 Hz frame motion
 * is what makes them ill. So the music's hand on the frame is 0 unless
 * Frame Sway, the one dial for that, is turned up; the lead reads the
 * subject's own motion smoothed over half a second; and a drop on still
 * paint stays where it is.
 *
 * What is checked, with the real MacroCamera on a made-up plate (as
 * `holdjump` does) through a song (as `framesway` does): 120 bpm for twenty
 * seconds at 60 frames a second, a kick each beat with its bass between
 * 0.55 and 0.95 decaying over a quarter second, hats on the eighths as the
 * treble, the energy swelling with each kick. At 6x on a 1440 px frame,
 * where the owner pushes in; a centre move is × 1.5 × zoom of the frame's
 * width (uvToFluid in the plate shader), and a zoom change moves the
 * frame's edge by half its relative change.
 *
 *   1. At every shipped look's own camera settings and every show stage,
 *      with Frame Sway at 0 (as every look ships it; `framesway` holds
 *      that), in Hold, Follow and Auto, the song moves the frame by
 *      nothing: the camera through the song and through silence give the
 *      same centre and the same zoom on every frame, to the bit. (Auto on
 *      a still drop, so that the cuts the song is allowed to time have
 *      nowhere to travel.)
 *   2. And it is the dial doing that, not a camera that cannot move: the
 *      default look at Frame Sway 1 sways the frame and pumps the zoom
 *      with the song as every look did, and half way does less than full
 *      and more than none.
 *   3. The camera rides its subject without a jolt: a drop drifting at two
 *      cells a second with the paint under it surging half a cell a step
 *      on each kick moves the frame exactly as it does with no press, and
 *      the drop stays near the centre; and the lead is still a lead: a
 *      drop at fifteen cells a second sits in the middle of the frame.
 *   4. A drop on still paint does not shiver, and a flow still carries it.
 *   5. The frame loop hands the camera `sway: frameSway(…frameSway)`, and the
 *      camera's punch, push and tremor carry it (`move = sync * sway`).
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const out = 'node_modules/.cache/steadycam-lib.mjs';
await build({
  stdin: {
    contents: [
      "export { MacroCamera } from './src/lib/macroCamera.ts';",
      "export { BeadField } from './src/lib/beads.ts';",
      "export { stream } from './src/lib/rng.ts';",
      "export { frameSway } from './src/lib/plateRock.ts';",
      "export { DEFAULT_SETTINGS } from './src/types.ts';",
      "export { PRESETS } from './src/presets.ts';",
      "export { builtInSequences } from './src/lib/sequencer.ts';",
    ].join('\n'),
    resolveDir: '.', loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
  // The presets and the sequencer reach for the browser only when called on to save.
  define: { 'import.meta.env.DEV': 'false' },
});
const L = await import(`../${out}`);

const SIZE = 192, FPS = 60, SECONDS = 20, BPM = 120, ZOOM = 6, WIDTH = 1440;
const DT = 1 / FPS, EVERY = Math.round(FPS * 60 / BPM);
const pc = (x) => `${(100 * x).toFixed(3)}%`;
const px = (x) => `${(WIDTH * x).toFixed(1)} px`;

// ── The plate: one drop of dye, and the paint under it ────────────────
const field = { density: new Float32Array(SIZE * SIZE), vx: new Float32Array(SIZE * SIZE), vy: new Float32Array(SIZE * SIZE), size: SIZE };
/**
 * A drop at (x, y) cells over paint moving (u, v) cells a second (the
 * velocity in cells a step, as the camera was once handed it). Only the
 * drop's own window is painted, and the last one cleared: the drop's
 * density is under 1e-6 twenty cells out, and a whole plate a frame for
 * every look and mode took minutes.
 */
let lastWin = null;
const lay = (x, y, u, v) => {
  const paint = (cx, cy, on) => {
    const i0 = Math.max(0, Math.floor(cx - 20)), i1 = Math.min(SIZE - 1, Math.ceil(cx + 20));
    const j0 = Math.max(0, Math.floor(cy - 20)), j1 = Math.min(SIZE - 1, Math.ceil(cy + 20));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      field.density[j * SIZE + i] = on ? 3 * Math.exp(-((i - cx) ** 2 + (j - cy) ** 2) / 40) : 0;
    }
  };
  if (lastWin) paint(lastWin[0], lastWin[1], false);
  paint(x, y, true);
  lastWin = [x, y];
  field.vx.fill(u * DT); field.vy.fill(v * DT);
};

// ── The song ──────────────────────────────────────────────────────────
const bassAt = (f) => {
  const sinceKick = (f % EVERY) * DT, kickN = Math.floor(f / EVERY);
  return (0.55 + 0.4 * ((kickN * 0.618) % 1)) * Math.exp(-sinceKick / 0.25);
};
const song = (f) => ({
  beat: f % EVERY === 0,
  bass: bassAt(f),
  treble: 0.85 * Math.exp(-((f % (EVERY / 2)) * DT) / 0.12),
  energy: Math.min(0.85, 0.45 + 0.35 * Math.exp(-((f % EVERY) * DT) / 0.3) + 0.05 * Math.sin(f * DT * 0.5)),
});
const SILENCE = { beat: false, bass: 0, treble: 0, energy: 0 };

/**
 * The camera through the song, or through silence, on a drop drifting at
 * `speed` cells a second (0: still), the paint under it surging `press`
 * cells a step on each kick. Per frame: the shot, and where the drop is.
 */
function run({ mode, sync, sway, chase, hold, music, speed = 2, press = 0, seconds = SECONDS }) {
  const cam = new L.MacroCamera(L.stream('plate.macro'));
  let x = 0.35 * SIZE, y = 0.55 * SIZE;
  const rows = [];
  for (let f = 0; f < FPS * seconds; f++) {
    const s = music ? song(f) : SILENCE;
    lay(x, y, speed + press * bassAt(f) * 60, speed * 0.3);
    x += speed * DT; y += speed * 0.3 * DT;
    const shot = cam.update(field, DT, {
      zoom: ZOOM, chase, hold, spanX: 1 / 1.5, spanY: 1 / 1.5, mode, aimX: 0.35, aimY: 0.55, floor: 0,
      sync, sway, energy: s.energy, bass: s.bass, beat: s.beat, treble: s.treble,
    });
    rows.push({ cx: shot.cx, cy: shot.cy, zoom: shot.zoom, bx: x / SIZE, by: y / SIZE });
  }
  return rows;
}
/** The song's hand: how far the two runs' frames are apart at the worst frame, in frame widths, and the zooms. */
function apart(a, b) {
  let pan = 0, zoom = 0;
  for (let i = 0; i < a.length; i++) {
    pan = Math.max(pan, Math.hypot(a[i].cx - b[i].cx, a[i].cy - b[i].cy) * 1.5 * ZOOM);
    zoom = Math.max(zoom, Math.abs(a[i].zoom - b[i].zoom) / b[i].zoom);
  }
  return { pan, zoom };
}
const camOf = (S) => ({ sync: S.macroSync ?? 0, chase: S.macroChase ?? 0.6, hold: Math.max(0.5, S.macroHold ?? 5) });

// ── 1. Every look and every show stage, as shipped ────────────────────
const looks = L.PRESETS.map((p) => ({ name: p.name ?? p.id, S: { ...L.DEFAULT_SETTINGS, ...p.settings } }));
looks.unshift({ name: 'the defaults', S: { ...L.DEFAULT_SETTINGS } });
for (const seq of L.builtInSequences()) {
  for (const st of seq.stages ?? []) {
    const look = L.PRESETS.find((p) => p.id === st.presetId);
    looks.push({ name: `${seq.name}: ${st.name}`, S: { ...L.DEFAULT_SETTINGS, ...(look?.settings ?? {}), ...(st.settings ?? {}) } });
  }
}
const moved = [];
let synced = 0;
for (const { name, S } of looks) {
  const sway = L.frameSway(S.frameSway);
  if ((S.macroSync ?? 0) > 0) synced++;
  for (const mode of ['hold', 'follow', 'auto']) {
    const speed = mode === 'auto' ? 0 : 2;
    const d = apart(run({ ...camOf(S), mode, sway, music: true, speed }), run({ ...camOf(S), mode, sway, music: false, speed }));
    if (d.pan > 0 || d.zoom > 0) moved.push(`${name} ${mode} (frame ${pc(d.pan)}, zoom ${pc(d.zoom)})`);
  }
}
check('every shipped look and show stage, in Hold, Follow and Auto, holds the closeup still through the song: the same centre and zoom as in silence, to the bit',
  moved.length === 0 && looks.length > 20 && synced > looks.length / 2,
  moved.length ? moved.slice(0, 4).join('; ') : `${looks.length} looks and stages, ${synced} with Macro Sync up, 0.000% of the frame`);

// ── 2. The dial ──────────────────────────────────────────────────────
{
  const S = L.DEFAULT_SETTINGS;
  const hand = (sway) => apart(run({ ...camOf(S), mode: 'hold', sway, music: true }), run({ ...camOf(S), mode: 'hold', sway, music: false }));
  const full = hand(1), half = hand(0.5), none = hand(0);
  console.log(`      the default look at 6x on ${WIDTH} px: Frame Sway at full lets the song sway the frame ${pc(full.pan)} (${px(full.pan)}) and pump the zoom ${pc(full.zoom)} (the edge ${px(full.zoom / 2)}); half way ${pc(half.pan)} and ${pc(half.zoom)}; seated ${pc(none.pan)} and ${pc(none.zoom)}`);
  check('and it is the dial: at Frame Sway 1 the song sways the frame at least 0.2% of its width and pumps the zoom at least 1%, as every look did; half way, less than full and more than none',
    full.pan >= 0.002 && full.zoom >= 0.01 && half.pan > 0 && half.pan < full.pan && half.zoom > 0 && half.zoom < full.zoom && none.pan === 0 && none.zoom === 0);
}

// ── 3. The ride ──────────────────────────────────────────────────────
{
  const S = L.DEFAULT_SETTINGS;
  const ride = (rows) => {
    let peak = 0, off = 0;
    for (let i = FPS * 3; i < rows.length; i++) {
      peak = Math.max(peak, Math.hypot(rows[i].cx - rows[i - 1].cx, rows[i].cy - rows[i - 1].cy) * 1.5 * ZOOM);
      off = Math.max(off, Math.hypot(rows[i].bx - rows[i].cx, rows[i].by - rows[i].cy) * 1.5 * ZOOM);
    }
    return { peak, off };
  };
  const calm = run({ ...camOf(S), mode: 'follow', sway: 0, music: false });
  const pressed = run({ ...camOf(S), mode: 'follow', sway: 0, music: false, press: 0.5 });
  const d = apart(pressed, calm), r = ride(pressed);
  check('a kick\'s press under the drop (half a cell a step) moves the frame exactly as no press does, and the drop stays within 5% of the frame\'s centre',
    d.pan === 0 && r.off < 0.05, `the frame ${pc(r.peak)} a frame at the peak either way, the drop ${pc(r.off)} off centre`);
  // Six seconds: at fifteen cells a second the drop crosses half the plate in that.
  const fast = ride(run({ ...camOf(S), mode: 'follow', sway: 0, music: false, speed: 15, seconds: 6 }));
  check('and the lead still leads: a drop at fifteen cells a second sits within 15% of the frame\'s centre',
    fast.off < 0.15, `${pc(fast.off)} off centre, the world passing at ${pc(fast.peak)} a frame`);
}

// ── 4. The drops ─────────────────────────────────────────────────────
{
  const still = () => [0, 0];
  const f = new L.BeadField(SIZE);
  f.drops = 0;
  f.beads.push({ x: 96, y: 96, r: 3, age: 0, seed: 1 });
  const b = f.beads[0];
  let sum2 = 0, n = 0, lx = b.x, ly = b.y;
  for (let t = 0; t < 120; t++) { f.step(DT, still, 0, 0); sum2 += (b.x - lx) ** 2 + (b.y - ly) ** 2; n++; lx = b.x; ly = b.y; }
  const rms = Math.sqrt(sum2 / n);
  const cellPx = WIDTH * 1.5 * ZOOM / SIZE;
  check('a drop on still paint does not shiver: it moves 0 cells a step', rms === 0,
    `${rms.toExponential(2)} cells a step rms (${(rms * cellPx).toFixed(2)} px at ${ZOOM}x), 0.0587 before (4.0 px)`);
  const g = new L.BeadField(SIZE);
  g.drops = 0;
  g.beads.push({ x: 96, y: 96, r: 3, age: 0, seed: 1 });
  const x0 = g.beads[0].x;
  for (let t = 0; t < 120; t++) g.step(DT, () => [0.05, 0], 0, 0);
  check('and the paint still carries it', g.beads[0].x - x0 > 1, `${(g.beads[0].x - x0).toFixed(2)} cells in two seconds of flow`);
}

// ── 5. The frame loop calls these, and not a copy ────────────────────
{
  const show = readFileSync(new URL('../src/components/LiquidVisualizer.tsx', import.meta.url), 'utf8');
  const cam = readFileSync(new URL('../src/lib/macroCamera.ts', import.meta.url), 'utf8');
  check('the frame loop hands the camera Frame Sway as its `sway`', /sway:\s*frameSway\(currentSettings\.frameSway\)/.test(show));
  check('the camera\'s punch, push and tremor carry it: `move = sync * sway`, the punch by `move`, the tremor by `move`, the push by `sway` or `move`',
    /const move = sync \* sway;/.test(cam)
    && (cam.match(/\((m\.)?bass - 0\.6\) \* 2\.5 \* (m\.)?move/g) ?? []).length === 2
    && (cam.match(/size \* 0\.0012 \* (move|m\.move) \* (treble|m\.treble)/g) ?? []).length === 2
    && /energy \* \(0\.05 \+ sync \* 0\.05\) \* sway/.test(cam) && /m\.energy \* m\.move \* 0\.08/.test(cam));
  check('and the camera reads no velocity from the plate: the lead is the subject\'s own motion', !/field\.vx|field\.vy/.test(cam));
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length} of ${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
