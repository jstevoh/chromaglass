#!/usr/bin/env node
/**
 * A thread of oil narrower than the gap pinches into beads; a ribbon wider
 * than the gap holds (PLAN 38w-27). Measured on the GPU solver alone
 * (scripts/lab.mjs), on a thin gap at 512², the app's own grid on a Mac, where
 * the 2 mm gap is 5.1 cells: Oil Tension 0.9, the plate level, nothing
 * stirring.
 *
 *   npm run beads
 *
 * What was there: the oil's surface tension was the curvature of its outline
 * in the plane (mixForce), and a straight thread drawn that way cannot bead, a
 * wave along it only lengthening the outline, so a pressed thread on Classic
 * stayed a thread, where the 1969 footage strings it into beads. A real
 * thread narrower than the gap is round, curved 2/w across itself, out of the
 * plane, so its necks are at a higher pressure than its bulges and empty into
 * them (Rayleigh–Plateau); one wider than the gap is a ribbon held flat by
 * both glasses, whose edge's curvature across the gap is the same all along,
 * and confinement keeps it whole (THREAD in src/gpu/wgsl/fluid/capillary.ts).
 *
 *   1. A thread 3.5 cells wide (0.68 of the gap), laid straight across the
 *      middle half of the dish with a width wobble of a few per cent, breaks
 *      into at least six beads in two seconds (120 steps), its width along
 *      it varying by over half its mean. On main it was one body, its width
 *      varying by 0.10, and none broke.
 *   2. A ribbon 8 cells wide (1.6 gaps), the same wobble, the same plate, is
 *      one body after three seconds (180 steps): confinement holds it.
 *   3. Neither makes or loses oil: the dish's total within 0.1%.
 *   And any GPU validation error fails the run: a force that never ran would
 *   read as a held ribbon.
 *
 * About seven minutes on software WebGPU (PW_WEBGPU=1); no canvas.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 512;
const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
let r;
try {
  r = await page.evaluate(async ({ N }) => {
    const T = { thinGap: 1, gapThickness: 0.45, gapSpring: 0, oilTension: 0.9, oilBodies: 0, diff: 0 };
    /*
      A straight band of oil along x from a quarter to three quarters of the
      dish, `w` cells wide, its edge two cells of part-oil, its width wobbled
      by twelve seeded sine modes of up to 2% each (wavelengths 0.03 to 0.17
      of the dish), so the instability has something to grow from, as a real
      thread always does.
    */
    const lay = (w0) => {
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const modes = Array.from({ length: 12 }, () => [rnd() * 2 * Math.PI, 0.04 * (rnd() - 0.5)]);
      lab.solver().layOil((x, y, n) => {
        if (x < 0.25 || x > 0.75) return 0;
        let w = w0;
        for (let k = 0; k < modes.length; k++) w *= 1 + modes[k][1] * Math.sin((k + 3) * 2 * Math.PI * x / 0.5 + modes[k][0]);
        return Math.max(0, Math.min(1, 0.5 + (w / 2 - Math.abs(y - 0.5) * n) / 2));
      });
    };
    /*
      The band's width along it (the oil summed across it, column by column,
      over its middle 0.3 to 0.7, clear of its ends), the dish's oil, and the
      bodies: 4-connected cells over half oil.
    */
    const read = async () => {
      const m = await lab.chemistry('mix'), n = m.n;
      const col = [];
      for (let i = Math.round(0.3 * n); i < Math.round(0.7 * n); i++) {
        let s = 0;
        for (let j = Math.round(0.4 * n); j < Math.round(0.6 * n); j++) s += Math.max(0, m.data[(i + j * n) * 4]);
        col.push(s);
      }
      let total = 0;
      for (let k = 0; k < n * n; k++) total += m.data[k * 4];
      const seen = new Uint8Array(n * n);
      let bodies = 0;
      for (let k = 0; k < n * n; k++) {
        if (seen[k] || m.data[k * 4] <= 0.5) continue;
        bodies++;
        const stack = [k];
        seen[k] = 1;
        while (stack.length) {
          const q = stack.pop(), i = q % n, j = (q - i) / n;
          for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
            if (a < 0 || b < 0 || a >= n || b >= n) continue;
            const qq = a + b * n;
            if (!seen[qq] && m.data[qq * 4] > 0.5) { seen[qq] = 1; stack.push(qq); }
          }
        }
      }
      const mean = col.reduce((a, b) => a + b, 0) / col.length;
      const sd = Math.sqrt(col.reduce((a, b) => a + (b - mean) ** 2, 0) / col.length);
      return { total, mean, spread: sd / mean, bodies };
    };
    const run = async (w, steps) => {
      await lab.create(N, N);
      lab.solver().layOil(() => 0);
      lay(w);
      const start = await read();
      await lab.step(steps, T);
      return { start, end: await read(), gapCells: lab.coverMetres() / 0.2 * N };
    };
    return { thread: await run(3.5, 120), ribbon: await run(8, 180) };
  }, { N });
} finally {
  await close();
}

check('no GPU pass failed validation (a force that never ran would read as a held ribbon)', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));
const { thread: t, ribbon: b } = r;
const show = (x) => `${x.end.bodies} bodies, width ${x.end.mean.toFixed(2)} cells ± ${(100 * x.end.spread).toFixed(0)}% (laid ${x.start.mean.toFixed(2)} ± ${(100 * x.start.spread).toFixed(1)}%)`;
// 1.
check(`a thread 3.5 cells wide, under the ${t.gapCells.toFixed(1)}-cell gap, pinches into at least six beads in two seconds, its width along it varying by over half its mean`,
  t.end.bodies >= 6 && t.end.spread > 0.5,
  `${show(t)}; ${(0.5 * N / t.end.bodies / 3.5).toFixed(1)} widths a bead (Rayleigh–Plateau's fastest wave is 4.5 diameters, free of glass); main: 1 body, ± 10%`);
// 2.
check('a ribbon 8 cells wide, over the gap, is still one body after three seconds: confinement holds it',
  b.end.bodies === 1, show(b));
// 3.
for (const [name, x] of [['the thread', t], ['the ribbon', b]]) {
  const drift = Math.abs(x.end.total / x.start.total - 1);
  check(`${name} makes and loses no oil (the dish's total within 0.1%)`, drift < 0.001,
    `${x.start.total.toFixed(1)} → ${x.end.total.toFixed(1)} cells' worth`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
