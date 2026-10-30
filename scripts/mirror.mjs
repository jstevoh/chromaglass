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
 * cells under the drop must change; no cell beyond its reach may change by
 * much more than the plate does on its own. Where one does, it is printed,
 * with whether it is the hand's mirror image across either axis or the centre.
 *
 * "Under the drop" is measured on the plate, not counted in cells. The desk's
 * preview is a wide window on the dish (since the desk's tabs, #512, the
 * Perform tab's: 802 by 289 at this viewport, showing 0.92 of the plate
 * across and 0.33 of it down), so a cell is 0.154 of the plate wide and
 * 0.055 tall, and a drop that reaches 0.11 from the hand covers two cells up
 * and down but not one across. See DROP_REACH below.
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
import { engineQuery, settlePlate, waitForEngine } from './frame.mjs';

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
// Timbre Shifter, the look the owner's report was made on, retired in PLAN 28i-1
// into Microscopic Chaos; the reported plate is laid on that look now. Printed
// only (judge: false below), so no bar rides on it; the drift quoted in the
// next comment was read on Timbre Shifter and has not been read again here.
const TIMBRE = { look: 'microscopic-chaos', rotation: [4.73, 0.75], output: REPORTED_OUTPUT, settings: {} };
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
  { ...TIMBRE, name: 'Microscopic Chaos on the reported output, layer 1', layer: 0, judge: false },
  { ...TIMBRE, name: 'the Press, reported plate, layer 1', layer: 0, tool: 'press', judge: false },
];

/*
  The printed-only plates take a minute of CI between them and can fail
  nothing, so they run when asked for (MIRROR_ALL=1) rather than on every push.
*/
const RUN = process.env.MIRROR_ALL ? SCENARIOS : SCENARIOS.filter((sc) => sc.judge !== false);

// `present`: on a Linux box with PW_WEBGPU, headed into Xvfb so the plate reads back (chromium.mjs, PLAN.md 19l).
const browser = await launchChromium(chromium, { present: true });
try {
  for (const sc of RUN) {
    const page = await browser.newPage({ viewport: { width: 1418, height: 703 } });
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
    /*
      And a chosen silence, before the page loads. The first drop is the
      page's first pointerdown, and on a browser that has never chosen a
      sound source that gesture starts the simulated band (App.tsx, the
      first visit's wake). CALM holds the music's own reactions still, but
      the band's kicks released bubbles into the densest dye near the middle
      of the plate whatever Audio Impact said, and from the second drop on
      the middle of the preview moved by itself. On the Mac, with the band
      let start: 29 kicks over the four drops, four bubbles near the middle
      from the second, and the middle cells' drift 1.7 1.6 16.3 12.8, against
      cells that sat at their drift with the band off. Audio Impact 0 holds
      the bubbles back now too (`npm run kickbubbles`), but a plate judged
      for what the hand alone did is judged in silence all the same: the
      band's tempo still paces the look, and a kick still breathes a maze.
      "None" written here is a choice made, so the wake leaves it alone. The
      printed-only plates are photographed silent too, the reported one
      included.
    */
    await page.addInitScript(() => {
      try {
        localStorage.setItem('chromaglass-desk-mode', 'perform');
        sessionStorage.setItem('chromaglass-audio-source', 'none');
      } catch { /* none */ }
    });
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${sc.look}${engineQuery()}`, { waitUntil: 'load' });
    await settlePlate(page, 8000);
    await waitForEngine(page);
    await page.evaluate(({ sc, CALM }) => {
      window.chromaglassSettings?.({ ...CALM, ...sc.settings });
      if (sc.output) window.chromaglassOutput?.(sc.output);
      if (sc.rotation) window.chromaglassRotation?.(sc.rotation);
      window.chromaglassLayer?.(sc.layer);
      window.chromaglassTool?.(sc.tool ?? 'dropper');
    }, { sc, CALM });
    await settlePlate(page, 3000);
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
    /*
      Where each cell's middle, and the hand, land on the plate: the app's own
      reading of a window point (`chromaglassDebug().plateAt`, the same
      arithmetic that puts the brush under the cursor, the plate's turn and
      layer 2's own zoom included). Distances and the hand's mirror images
      are then the plate's, which is what the derive pass's echo was (it lit
      each plate's relief from its mirror), whatever window the desk shows.
    */
    const cellPlate = await page.evaluate(({ hole, G }) => {
      const d = window.chromaglassDebug?.();
      if (typeof d?.plateAt !== 'function') return null;
      return Array.from({ length: G }, (_, y) => Array.from({ length: G }, (_, x) =>
        d.plateAt(hole.x + hole.width * (x + 0.5) / G, hole.y + hole.height * (y + 0.5) / G)));
    }, { hole, G });
    const handPlate = await page.evaluate(([x, y]) => window.chromaglassDebug?.().plateAt?.(x, y) ?? null, [hx, hy]);
    const plateDist = (y, x) => cellPlate && handPlate ? Math.hypot(cellPlate[y][x].x - handPlate.x, cellPlate[y][x].y - handPlate.y) : null;
    const drift = zero(), change = zero();
    // Each drop's own maps, for the median below.
    const driftReps = [], changeReps = [];
    let hand = null;
    for (let rep = 0; rep < REPS; rep++) {
      const a = await shot(); await settlePlate(page, 1300); const b = await shot();
      await page.mouse.move(hx, hy);
      await page.mouse.down();
      if (!hand) hand = await page.evaluate(() => window.chromaglassDebug?.().pointer?.());
      for (let k = 1; k <= 6; k++) { await page.mouse.move(hx + k * 2, hy + k); await settlePlate(page, 100); }
      await page.mouse.up();
      await page.mouse.move(hole.x + hole.width * 0.02, hole.y + hole.height * 0.02);
      await settlePlate(page, 500);
      const c = await shot();
      const d = await grid(a, b), ch = await grid(b, c);
      add(drift, d); add(change, ch); driftReps.push(d); changeReps.push(ch);
      await page.evaluate(() => { window.__shots = {}; });
    }
    const cellOf = (fx, fy) => [Math.min(G - 1, Math.floor(fy * G)), Math.min(G - 1, Math.floor(fx * G))];
    const [cy, cx] = cellOf(at.fx, at.fy);
    /*
      The hand's mirror images are the plate's, not the preview's: the cell
      whose middle is nearest to (1 - x, y), (x, 1 - y) and (1 - x, 1 - y) of
      the hand on the plate. On layer 1 unturned those are the preview's own
      mirror cells (the preview is centred on the plate); turned a quarter
      they are the same cells with the axes' names swapped; on layer 2,
      viewed through its own zoom and drift, the mirror across the plate's
      middle line lands next to the hand, under the drop, and is named so
      in the line below. A mirror further from its nearest cell's middle
      than half a cell is off the preview, and the line says that too.
    */
    const tags = new Map();
    const offPreview = [];
    if (cellPlate && handPlate) {
      const half = Math.hypot(cellPlate[0][1].x - cellPlate[0][0].x, cellPlate[0][1].y - cellPlate[0][0].y) / 2
        + Math.hypot(cellPlate[1][0].x - cellPlate[0][0].x, cellPlate[1][0].y - cellPlate[0][0].y) / 2;
      for (const [m, name] of [[{ x: handPlate.x, y: 1 - handPlate.y }, 'mirror across the middle line'], [{ x: 1 - handPlate.x, y: handPlate.y }, 'mirror across the middle column'], [{ x: 1 - handPlate.x, y: 1 - handPlate.y }, 'mirror through the centre']]) {
        let best = null;
        for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
          const d = Math.hypot(cellPlate[y][x].x - m.x, cellPlate[y][x].y - m.y);
          if (!best || d < best.d) best = { d, y, x };
        }
        if (best.d <= half) tags.set(`${best.y},${best.x}`, name); else offPreview.push(name);
      }
    } else {
      tags.set(cellOf(at.fx, 1 - at.fy).join(), 'mirror top/bottom');
      tags.set(cellOf(1 - at.fx, at.fy).join(), 'mirror left/right');
      tags.set(cellOf(1 - at.fx, 1 - at.fy).join(), 'mirror through the centre');
    }
    /*
      A cell is under the drop when its middle is within DROP_REACH of the
      hand on the plate, else it is judged. Until 2026-10-29 "round the hand"
      was the eight cells about the hand's, which was a drop's reach while
      the Design desk's preview showed the plate with cells about as tall as
      wide. #512 gave the check the Perform tab's preview instead, a wide
      window on the dish (see the top of this file): a cell there is 0.055
      of the plate tall, and the hand's drop, held about 0.7 s, changes the
      picture 0.11 from the hand (two cells up) as much as it does one cell
      up. Measured on the Macs after #512, Classic's layer 1 with the hand at
      (0.73, 0.42): up the hand's column 21 to 30 at 0.055 and 22 to 25 at
      0.11, against 53 to 64 under the hand and a drift of 4 to 9; at 0.166
      (three cells up, the hand's mirror across the plate's middle line) 6
      to 7 against a drift of 4 to 5, and one cell across (0.154) 6 to 8
      against 5. Before #512, with the hand at (0.81, 0.42) and wider cells,
      the two-up cell read 11 against 9, under the allowance; after, 22 to
      25 against 8 to 9, and the line went red on three of five deploys on
      the owner's Mac and GitHub's alike (2026-10-29, deploys 570, 576, 580),
      naming the hand's own paint "away from the hand". The reach is the
      drop's footprint seen: strong at 0.11, gone by 0.154 to 0.166. The bar
      on a judged cell is unchanged.
    */
    const DROP_REACH = 0.14;
    const near = (y, x) => {
      const d = plateDist(y, x);
      return d === null ? Math.abs(y - cy) <= 1 && Math.abs(x - cx) <= 1 : d < DROP_REACH;
    };
    let here = 0;
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (near(y, x)) here = Math.max(here, change[y][x]);
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
    // The drop's footprint on the plate: every cell within 0.25 of the hand, nearest first, with its mean change past its mean drift
    // (the judgement below is on each drop's own median; the two can differ on a cell).
    if (cellPlate && handPlate) {
      const foot = [];
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { const d = plateDist(y, x); if (d < 0.25) foot.push({ d, y, x }); }
      foot.sort((a, b) => a.d - b.d);
      console.log(`     the hand on the plate at ${handPlate.x.toFixed(3)},${handPlate.y.toFixed(3)} (plateAt); a cell ${Math.hypot(cellPlate[0][1].x - cellPlate[0][0].x, cellPlate[0][1].y - cellPlate[0][0].y).toFixed(3)} of the plate across and ${Math.hypot(cellPlate[1][0].x - cellPlate[0][0].x, cellPlate[1][0].y - cellPlate[0][0].y).toFixed(3)} down; under the drop within ${DROP_REACH} (*), m a mirror of the hand${offPreview.length ? `; off the preview: ${offPreview.join(', ')}` : ''}`);
      console.log('     mean change past mean drift by distance from the hand: ' + foot.map(({ d, y, x }) => `r${y + 1}c${x + 1} ${d.toFixed(3)}${near(y, x) ? '*' : ''}${tags.has(`${y},${x}`) ? 'm' : ''}: ${(change[y][x] - drift[y][x]).toFixed(1)}`).join(', '));
    }
    const worst = away[0];
    // Read on the plate, and a judgement left to make: the hand's own cell under the drop, at least half the grid judged (a zoomed-in layer exempts more; layer 2 leaves 20 of 36), and which mirrors sit under the drop said by name.
    const under = [...Array(G * G).keys()].filter((i) => near(Math.floor(i / G), i % G)).length;
    const mirrorsUnder = [...tags].filter(([k]) => near(...k.split(',').map(Number))).map(([, name]) => name);
    if (sc.judge !== false) check(`${sc.name}: the cells under the drop are read on the plate, and most of the grid is judged`,
      !!cellPlate && !!handPlate && Number.isFinite(handPlate.x) && Number.isFinite(handPlate.y) && near(cy, cx) && away.length >= G * G / 2,
      cellPlate && handPlate ? `the hand at ${handPlate.x.toFixed(2)},${handPlate.y.toFixed(2)}; ${under} cells within ${DROP_REACH} of it, ${away.length} judged${mirrorsUnder.length ? `; under the drop: ${mirrorsUnder.join(', ')}` : ''}${offPreview.length ? `; off the preview: ${offPreview.join(', ')}` : ''}` : 'chromaglassDebug().plateAt is not there, so the cells were counted, not measured');
    if (sc.judge !== false) check(`${sc.name}: the tool changes the picture where it is used`, here > 3,
      `${here.toFixed(1)} under the drop`);
    if (sc.judge === false) {
      console.log(`     (on the record: most beyond the drop's reach ${worst ? `${worst.v.toFixed(1)} past its drift at row ${worst.y + 1}, column ${worst.x + 1}${worst.tag ? ` (${worst.tag})` : ''}` : 'nothing'})`);
      await page.close();
      continue;
    }
    /*
      That the plate was silent, asked of the band itself: the band's own
      hook (window.__band, which App.tsx defines whenever the band starts
      under ?debug) as well as the kicks the plate and the ear counted. The
      counts alone can read 0 with the band playing on a page that is not
      drawing (check-skeptic): the plate counts a kick only in the frame
      loop. On the Mac, with the band let start, they read 29 and 26.
    */
    const music = await page.evaluate(() => {
      const d = window.chromaglassDebug?.();
      return { band: typeof window.__band === 'function', kicks: d?.kicks?.() ?? null, heard: d?.heardKicks?.() ?? null };
    });
    check(`${sc.name}: the plate hears no music while it is judged`, !music.band && music.kicks === 0 && music.heard === 0,
      `${music.band ? 'the band was started' : 'no band started'}, ${music.kicks} kicks reached the plate and the ear heard ${music.heard}, over the ${REPS} drops`);
    check(`${sc.name}: and nowhere else`, !!worst && worst.over < 1,
      worst ? `most beyond the drop's reach ${worst.v.toFixed(1)} past its drift (median) at row ${worst.y + 1}, column ${worst.x + 1}${worst.tag ? ` (${worst.tag})` : ''}, allowed ${worst.allowed.toFixed(1)}, against ${here.toFixed(1)} under the drop; each drop ${worst.reps}, drift ${worst.dreps}, past it ${worst.preps}` : 'no cell was judged');
    await page.close();
  }
} finally {
  await browser.close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
