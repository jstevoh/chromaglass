#!/usr/bin/env node
/**
 * Roy, 1963 opens as a panel, not a stain.
 *
 *   npm run royopen     (after a build: the app lays the seed, the lab prints it)
 *
 * What was reported (the owner, 2026-10-04, over a screenshot nine seconds
 * into the look): "The Roy preset always starts with this giant black stain.
 * Get rid of it. It needs to look more like an abstract colorful Roy
 * Lichtenstein painting."
 *
 * The stain was the look's own seed (seedPreset's 'roy' case in
 * LiquidVisualizer.tsx). splatBlob takes a radius in the 128 grid's units and
 * scales it by GRID_SCALE itself; Roy's seed handed it plate fractions times
 * the grid's size, already in cells, so its four pools came out four to five
 * times too wide and lay over each other across the whole glass. Red over
 * blue over yellow absorbs every channel, and the print reads dark as black.
 *
 * So this asks the seed the app actually lays, not a copy of it: the built
 * app is opened on Roy, and its own plate object lays the look's seed through
 * captureSeed (which hands back what the seed added and takes it off again).
 * That dye is then drawn by the real plate shader in the lab with Roy's
 * settings, so the print reads it as the show would, and the picture is
 * counted in the print's five inks (white paper, black, red, yellow, blue):
 *
 *   1. no stain in the dye: under 1% of the plate absorbs all three channels
 *      strongly (above 1.2 each), the dye a print can only draw as black
 *   2. the picture is mostly paper and ink, not black: black (the outlines)
 *      at most 15% of the view, white paper at least 35%
 *   3. all three inks are on it, each at least 3% of the view
 *   4. there are fields of Ben-Day dots in it: at least 150 separate
 *      dot-sized marks of ink on paper (the panel's pale washes, printed)
 *   5. the seed sits inside the look's own Dye Budget, so the regulator does
 *      not open the show by boiling it off (and the budget is what keeps the
 *      plate a print with paper in it later on, PLAN 21e)
 *
 * Read on main before the fix (the lab on SwiftShader, the same dye):
 *   1. 71% of the plate absorbing all three; 2. black 57%, white 0%;
 *   3. red 37%, yellow 0%, blue 0%; 4. 16 dots, a ring round one pool;
 *   5. a mean of 3.69 against a budget of 0.9 (0.45 since, the fix's).
 * And after: 0.1%; black 9.9%, white 57%; red 12.8%, yellow 6.8%, blue
 * 9.8%; 254 dots; a mean of 0.115 against 0.45.
 * After #267 moved the pigment's grain behind the gooey curve, the same seed
 * printed its fields solid (47 dots, white 38%); with the fields re-laid at
 * 0.75 of their old strength: 0.0%; black 8.1%, white 59%; red 12.9%,
 * yellow 6.2%, blue 10.1%; 272 dots; a mean of 0.109.
 *
 * And a control, so a counter that cannot see black cannot pass line 2: the
 * same seed with every cell made to absorb all three channels as much as its
 * strongest must print mostly black where it has ink.
 */
import { spawn } from 'node:child_process';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const SIZE = 640;
let server = null, port = 4620;
for (let t = 0; t < 6 && !server; t++) {
  const child = spawn('./node_modules/.bin/vite', ['preview', '--port', String(4620 + t), '--strictPort'], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
  let died = false;
  child.on('exit', () => { died = true; });
  await new Promise((r) => setTimeout(r, 2500));
  if (!died) { server = child; port = 4620 + t; }
}
if (!server) { console.error('the preview did not start on ports 4620-4625 (a busy port, or no build: run `npm run build` first)'); process.exit(2); }
const stopServer = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* already gone */ } };
process.on('exit', stopServer);

const { page: lab, close } = await openLab();
try {
  // ── The seed, as the app lays it ──────────────────────────────────
  const app = await lab.context().browser().newPage();
  await app.goto(`http://localhost:${port}/?debug&look=roy`, { waitUntil: 'load' });
  await app.waitForFunction(() => window.chromaglassDebug?.().fluids?.[0]?.captureSeed, null, { timeout: 60000 });
  const seed = await app.evaluate(() => {
    const d = window.chromaglassDebug();
    const fl = d.fluids[0];
    const S = fl.size;
    const [a, r, g, b] = fl.captureSeed(() => fl.seedPreset('roy', () => 0));
    const dye = new Array(S * S * 4);
    for (let i = 0; i < S * S; i++) { dye[4 * i] = r[i]; dye[4 * i + 1] = g[i]; dye[4 * i + 2] = b[i]; dye[4 * i + 3] = a[i]; }
    return { S, dye, plate: d.plate };
  });
  await app.close();
  if (seed.plate !== 'roy') throw new Error(`the app opened on ${seed.plate}, not roy`);

  let stain = 0, sum = 0;
  const n = seed.S * seed.S;
  for (let i = 0; i < n; i++) {
    if (Math.min(seed.dye[4 * i], seed.dye[4 * i + 1], seed.dye[4 * i + 2]) > 1.2) stain++;
    sum += seed.dye[4 * i + 3];
  }
  const mean = sum / n;
  if (!(sum > 0)) throw new Error('the seed laid no dye at all: nothing below would mean anything');

  // ── Printed, through the real plate shader ────────────────────────
  const print = (dye) => lab.evaluate(async ({ S, dye, SIZE }) => {
    await lab.create(S, S);
    const look = lab.look('roy');
    lab.addDye(dye); lab.flush(); await lab.step(0);
    const px = await lab.render(SIZE, look.settings, { zoom: 1, macroAmount: 0, bubbles: 0 });
    const INK = { white: [255, 255, 255], black: [0, 0, 0], red: [227, 26, 31], yellow: [255, 219, 15], blue: [20, 84, 199] };
    const names = Object.keys(INK);
    const cls = new Uint8Array(SIZE * SIZE).fill(255);
    const cnt = { white: 0, black: 0, red: 0, yellow: 0, blue: 0, other: 0 };
    for (let i = 0; i < SIZE * SIZE; i++) {
      let best = -1, bd = 70;
      names.forEach((k, j) => { const v = INK[k]; const dd = Math.hypot(px[4 * i] - v[0], px[4 * i + 1] - v[1], px[4 * i + 2] - v[2]); if (dd < bd) { bd = dd; best = j; } });
      if (best < 0) cnt.other++; else { cnt[names[best]]++; cls[i] = best; }
    }
    // Dots: separate marks of one ink, each the size of a Ben-Day dot (the
    // print's pitch is the view's height over 32 rows, a dot 0.3 of it in
    // radius), with paper round them (paper, or the antialiased pixels
    // between a dot and the paper, which are none of the five inks).
    const pitch = Math.max(4, SIZE / 32), dotArea = Math.PI * (0.3 * pitch) ** 2;
    const seen = new Uint8Array(SIZE * SIZE);
    let dots = 0;
    for (let s0 = 0; s0 < SIZE * SIZE; s0++) {
      if (seen[s0] || cls[s0] < 2 || cls[s0] === 255) continue;
      const ink = cls[s0];
      let area = 0, paper = 0, rim = 0;
      const stack = [s0];
      seen[s0] = 1;
      while (stack.length) {
        const p = stack.pop();
        area++;
        const x = p % SIZE, y = (p - x) / SIZE;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) continue;
          const q = xx + yy * SIZE;
          if (cls[q] === ink) { if (!seen[q]) { seen[q] = 1; stack.push(q); } } else { rim++; if (cls[q] !== 1) paper++; }
        }
      }
      if (area > 0.3 * dotArea && area < 3 * dotArea && paper > 0.5 * rim) dots++;
    }
    for (const k in cnt) cnt[k] = 100 * cnt[k] / (SIZE * SIZE);
    return { cnt, dots };
  }, { S: seed.S, dye, SIZE });
  const dye = seed.dye;
  const shown = await print(dye);
  const c = shown.cnt;
  const f = (v) => v.toFixed(1);

  // The control: every cell absorbing all three channels as its strongest.
  const dark = dye.slice();
  for (let i = 0; i < n; i++) { const m = Math.max(dark[4 * i], dark[4 * i + 1], dark[4 * i + 2]); dark[4 * i] = dark[4 * i + 1] = dark[4 * i + 2] = m; }
  const ctl = (await print(dark)).cnt;
  const inked = c.red + c.yellow + c.blue;
  const instrument = ctl.black > 0.6 * (inked + c.black);
  check('control: the counter sees black (the same seed made to absorb everything prints black where it has ink)', instrument,
    `${f(ctl.black)}% black, against ${f(inked + c.black)}% inked or outlined in the seed's own print`);

  const budget = (await lab.evaluate(() => lab.look('roy').settings.dyeBudget));
  check('1. no stain in the dye: under 1% of the plate absorbs all three channels above 1.2', 100 * stain / n < 1, `${f(100 * stain / n)}%`);
  check('2. black at most 15% of the view and white paper at least 35%', instrument && c.black <= 15 && c.white >= 35, `black ${f(c.black)}%, white ${f(c.white)}%`);
  check('3. red, yellow and blue each at least 3% of the view', c.red >= 3 && c.yellow >= 3 && c.blue >= 3, `red ${f(c.red)}%, yellow ${f(c.yellow)}%, blue ${f(c.blue)}%`);
  check('4. fields of Ben-Day dots: at least 150 dot-sized marks of ink on paper', shown.dots >= 150, `${shown.dots}`);
  check('5. the seed sits inside Roy\'s Dye Budget', mean <= budget, `mean ${mean.toFixed(3)} against ${budget}`);
} finally {
  await close();
  stopServer();
}

const failed = checks.filter((x) => !x.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
