#!/usr/bin/env node
/**
 * A drop lands where it is dropped, and nowhere else.
 *
 * Reported twice: on the Design desk, the Drop tool on the lead plate (not
 * the second) lays its dye under the hand and, somewhere across the plate, a
 * second reaction "like a press or a blow" — first mirrored top to bottom,
 * then left to right. The report that came with the second (Timbre Shifter,
 * two layers turned to 271 and 43 degrees, bubbles and beads on, output gain
 * 1.45 and gamma 2.5) is reproduced here as closely as a harness can, next to
 * a calm Classic plate, and each is judged the same way: the tool used low and
 * to one side of the preview, and how much every cell of a 6x6 grid over the
 * preview changed, against the plate's own drift over the same time. The
 * cells round the hand must change; no cell away from them may change by much
 * more than the plate does on its own. Where one does, it is printed, with
 * whether it is the hand's mirror image across either axis or the centre.
 *
 * Four times over, at the same spot, and the maps averaged. Judged on one
 * drop, a calm Classic plate "echoed" in a different cell every run, with no
 * bubble on it: a bead merging or a drip landing in the window. An echo of
 * the hand comes back every time; those do not.
 *
 * The echo itself was the derive pass lighting each plate's relief from its
 * mirror (npm run derive pins that, in the lab): it showed here as the calm
 * Classic lead plate changing at the hand's mirror, 35 to 53 against a drift
 * of 15, and after the fix 1.5 against 1.9. So the calm plate is what this
 * judges, turned and not turned.
 *
 *   node scripts/mirror.mjs        (needs a WebGPU browser: CI's macOS runner)
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery } from './frame.mjs';

const PORT = 4351;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 2500));

const G = 6, REPS = 4;
// Nothing but the hand moves the dye: the music, the turbulence, the drips and the turning held still.
const CALM = {
  turbulenceScale: 0, audioImpact: 0, plateRock: 0, beatSqueeze: 0, buoyancy: 0,
  rainDrip: 0, glassSmear: 0, vibrationFrequency: 0, centerGravity: 0, rotationSpeed: 0, spinImpulse: 0,
  audioMappings: { velocity: 'none', density: 'none', color: 'none', rotation: 'none' },
};
const REPORTED_OUTPUT = {
  flipX: false, flipY: false, corners: [0, 0, 1, 0, 1, 1, 0, 1], maskTop: 0, maskRight: 0, maskBottom: 0,
  maskLeft: 0, maskFeather: 0, gain: 1.45, gamma: 2.5, flashGuard: true, surfaces: [],
};
const PLAIN_OUTPUT = { ...REPORTED_OUTPUT, gain: 1, gamma: 1 };
const TIMBRE = { look: 'timbre-shifter', rotation: [4.73, 0.75], output: REPORTED_OUTPUT, settings: {} };
// Judged: the calm plate, where anything the hand did not do stands out.
// Printed only (judge: false): the reported plate, which moves by itself far
// more than a drop does (a drift of 40-160 a cell against 1-5 on Classic, so
// its averaged maps still swing by a few tens), and the Press, which by
// design moves the whole plate: the liquid it squeezes out has to go
// somewhere (30-100 a cell against a drift of 3-8, everywhere). Neither is an
// echo; both are kept on the record next to the cells an echo would light.
const SCENARIOS = [
  { name: 'Classic, calm, layer 1', look: 'classic', layer: 0, rotation: [0, 0], settings: { layerCount: 2 } },
  { name: 'Classic, calm, layer 2', look: 'classic', layer: 1, rotation: [0, 0], settings: { layerCount: 2 } },
  { name: 'Classic, calm, layer 1 turned a quarter', look: 'classic', layer: 0, rotation: [4.73, 0], settings: { layerCount: 2 } },
  { ...TIMBRE, name: 'Timbre Shifter as reported, layer 1', layer: 0, judge: false },
  { ...TIMBRE, name: 'the Press, reported plate, layer 1', layer: 0, tool: 'press', judge: false },
];

/*
  The printed-only plates take a minute of CI between them and can fail
  nothing, so they run when asked for (MIRROR_ALL=1) rather than on every push.
*/
const RUN = process.env.MIRROR_ALL ? SCENARIOS : SCENARIOS.filter((sc) => sc.judge !== false);

const browser = await launchChromium(chromium);
try {
  for (const sc of RUN) {
    const page = await browser.newPage({ viewport: { width: 1418, height: 703 } });
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
    await page.addInitScript(() => { try { localStorage.setItem('chromaglass-desk-mode', 'design'); } catch { /* none */ } });
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${sc.look}${engineQuery()}`, { waitUntil: 'load' });
    await page.waitForTimeout(8000);
    await page.evaluate(({ sc, CALM }) => {
      window.chromaglassSettings?.({ ...CALM, ...sc.settings });
      if (sc.output) window.chromaglassOutput?.(sc.output);
      if (sc.rotation) window.chromaglassRotation?.(sc.rotation);
      window.chromaglassLayer?.(sc.layer);
      window.chromaglassTool?.(sc.tool ?? 'dropper');
    }, { sc, CALM });
    await page.waitForTimeout(3000);
    const hole = await page.getByTestId('desk-preview').boundingBox();
    if (!hole) { check(`${sc.name}: the Design desk's preview is there`, false); await page.close(); continue; }
    // Pictures stay in the page and only the 6x6 means come back: shipping
    // every pixel out as JSON made ten scenarios outrun the job's timeout.
    let shots = 0;
    const shot = async () => {
      const png = await page.screenshot({ clip: hole });
      const id = shots++;
      await page.evaluate(async ({ b64, id }) => {
        const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
        const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        (window.__shots ??= {})[id] = x.getImageData(0, 0, img.width, img.height);
      }, { b64: png.toString('base64'), id });
      return id;
    };
    const grid = (ia, ib) => page.evaluate(({ ia, ib, G }) => {
      const a = window.__shots[ia], b = window.__shots[ib];
      const out = Array.from({ length: G }, () => Array(G).fill(0));
      const n = Array.from({ length: G }, () => Array(G).fill(0));
      for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
        const i = (y * a.width + x) * 4;
        const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
        const gx = Math.min(G - 1, Math.floor(x / a.width * G)), gy = Math.min(G - 1, Math.floor(y / a.height * G));
        out[gy][gx] += d; n[gy][gx]++;
      }
      return out.map((row, y) => row.map((v, x) => v / Math.max(1, n[y][x])));
    }, { ia, ib, G });
    const add = (acc, m) => acc.forEach((row, y) => row.forEach((_, x) => { row[x] += m[y][x] / REPS; }));
    const zero = () => Array.from({ length: G }, () => Array(G).fill(0));
    // Low and to the right, so its mirror images across each axis and the centre are three different cells.
    const at = { fx: 0.75, fy: 0.75 };
    const hx = hole.x + hole.width * at.fx, hy = hole.y + hole.height * at.fy;
    const drift = zero(), change = zero();
    // Each drop's own maps, for the median below.
    const driftReps = [], changeReps = [];
    let hand = null;
    for (let rep = 0; rep < REPS; rep++) {
      const a = await shot(); await page.waitForTimeout(1300); const b = await shot();
      await page.mouse.move(hx, hy);
      await page.mouse.down();
      if (!hand) hand = await page.evaluate(() => window.chromaglassDebug?.().pointer?.());
      for (let k = 1; k <= 6; k++) { await page.mouse.move(hx + k * 2, hy + k); await page.waitForTimeout(100); }
      await page.mouse.up();
      await page.mouse.move(hole.x + hole.width * 0.02, hole.y + hole.height * 0.02);
      await page.waitForTimeout(500);
      const c = await shot();
      const d = await grid(a, b), ch = await grid(b, c);
      add(drift, d); add(change, ch); driftReps.push(d); changeReps.push(ch);
      await page.evaluate(() => { window.__shots = {}; });
    }
    const cellOf = (fx, fy) => [Math.min(G - 1, Math.floor(fy * G)), Math.min(G - 1, Math.floor(fx * G))];
    const [cy, cx] = cellOf(at.fx, at.fy);
    const tags = new Map([
      [cellOf(at.fx, 1 - at.fy).join(), 'mirror top/bottom'],
      [cellOf(1 - at.fx, at.fy).join(), 'mirror left/right'],
      [cellOf(1 - at.fx, 1 - at.fy).join(), 'mirror through the centre'],
    ]);
    const near = (y, x) => Math.abs(y - cy) <= 1 && Math.abs(x - cx) <= 1;
    const here = Math.max(...[-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => change[cy + dy]?.[cx + dx] ?? 0)));
    /*
      Judged on the median of the four drops, not their mean.

      The claim above is that an echo comes back on every drop and the plate's
      own events do not, and the mean does not ask that: one drip or blob
      spreading into a cell during one of the four drops carried the average
      over its allowance. It failed twice in this way, each time beside a
      region already moving on its own. Once at row 2, column 5, 22.8
      against 22.8, next to drift of 23.3. Once at row 4, column 3, 25.1
      against 17.9, next to drift of 28.4. Each time the same cell sat at its
      drift on the other runs (2.5 against 2.5, 2.1 against 2.2). The median
      of four is untouched by one such event, and an echo on every drop moves
      it exactly as much as the mean. The maps above still print the mean.

      And each drop is judged against its own drift, not a median of the four
      changes against a median of the four drifts. A drop's drift is the
      1.3 s just before it, so a region the plate sets moving on its own
      shows in both of that drop's windows or, when it starts mid-drop, in
      one drop's change alone. Taken apart, the two medians pair windows from
      different drops. On the Mac, Classic's layer 1 (once turned a quarter,
      once not) failed twice this way, at a cell in the middle that began
      moving by itself partway through the four drops: once at row 2,
      column 4, each drop 4.8 3.5 64.1 55.1 against drift 4.9 3.6 4.2 48.6
      (a median of 29.9 against one of 4.6), and once at row 3, column 3,
      2.5 63.3 49.9 48.4 against 2.9 2.7 44.5 36.8 (49.1 against an
      allowance of 43.7). Paired, each drop's change past its own
      drift is -0.1 -0.1 59.9 6.5 and -0.4 60.6 5.4 11.6: one drop caught a
      region starting up and the others stayed within about 12 of their
      drift, medians 3.2 and 8.5.

      For an echo nothing changes. A drop that adds e to its window's drift
      d changes the cell by d + e; before, median(d) + e was allowed
      2 median(d) + 4, now e is allowed median(d) + 4, the same bound, and the
      floor of 0.3 of the change round the hand moves across the same way.
      The derive pass's echo (35 to 53 against a drift of 15) fails it as it
      did, and the fixed plate (1.5 against 1.9) passes as it did.

      What it gives up is the case it was changed for. When the plate's own
      movement lands in a drop's change but not in its drift (a region
      starting up mid-drop, drift 0 0 40 40 against the plate's own change
      0 40 40 40), the old test was already at 40 against 44 with no echo at
      all, and this one lets an echo 20 larger through there. An echo on a
      plate that is not starting up somewhere under it is judged as before.
    */
    const median = (reps, y, x) => {
      const v = reps.map((m) => m[y][x]).sort((a, b) => a - b);
      return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    };
    const pastReps = changeReps.map((m, i) => m.map((row, y) => row.map((c, x) => c - driftReps[i][y][x])));
    const away = [];
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      if (near(y, x)) continue;
      const v = median(pastReps, y, x), dm = median(driftReps, y, x);
      // How far past what the plate does alone, in its own terms.
      const allowed = Math.max(dm + 4, 0.3 * here - dm);
      away.push({ y, x, v, allowed, over: v / allowed, tag: tags.get(`${y},${x}`) ?? '',
        reps: changeReps.map((m) => m[y][x].toFixed(1)).join(' '), dreps: driftReps.map((m) => m[y][x].toFixed(1)).join(' '),
        preps: pastReps.map((m) => m[y][x].toFixed(1)).join(' ') });
    }
    away.sort((a, b) => b.over - a.over);
    const rot = await page.evaluate(() => window.chromaglassDebug?.().rotation?.current ?? null);
    const handAt = (hand ? ` — the hand on the plate at ${(hand.x / hand.grid).toFixed(2)},${(hand.y / hand.grid).toFixed(2)}` : '')
      + (rot ? `, plates turned ${rot.map((r) => r.toFixed(2)).join(', ')}` : '');
    console.log(`     ${sc.name}: mean change by cell over ${REPS} (rows top to bottom; * the hand, m its mirror images), drift in brackets${handAt}`);
    for (let y = 0; y < G; y++) {
      console.log('       ' + change[y].map((v, x) => {
        const mark = y === cy && x === cx ? '*' : tags.has(`${y},${x}`) ? 'm' : ' ';
        return `${v.toFixed(1).padStart(6)}${mark}(${drift[y][x].toFixed(1)})`;
      }).join(''));
    }
    const worst = away[0];
    if (sc.judge !== false) check(`${sc.name}: the tool changes the picture where it is used`, here > 3,
      `${here.toFixed(1)} round the hand`);
    if (sc.judge === false) {
      console.log(`     (on the record: most away from the hand ${worst ? `${worst.v.toFixed(1)} past its drift at row ${worst.y + 1}, column ${worst.x + 1}${worst.tag ? ` (${worst.tag})` : ''}` : 'nothing'})`);
      await page.close();
      continue;
    }
    check(`${sc.name}: and nowhere else`, !worst || worst.over < 1,
      worst ? `most away from the hand ${worst.v.toFixed(1)} past its drift (median) at row ${worst.y + 1}, column ${worst.x + 1}${worst.tag ? ` (${worst.tag})` : ''}, allowed ${worst.allowed.toFixed(1)}, against ${here.toFixed(1)} round the hand; each drop ${worst.reps}, drift ${worst.dreps}, past it ${worst.preps}` : 'nothing');
    await page.close();
  }
} finally {
  await browser.close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
