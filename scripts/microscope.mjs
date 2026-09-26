#!/usr/bin/env node
/**
 * The closeup is a microscope pushing in: detail arrives with magnification.
 *
 * Reported: "as soon as I macro zoom, instead of actually zooming in until
 * you can see more details in the liquids, it jumps right to these cells."
 * The paint cells, the fine cells between them and the lacing were all drawn
 * at full strength the moment the zoom left 1x (the closeup's ramp ends at
 * 2x). Now each comes through as it grows big enough on screen to see.
 *
 * Measured on the lab's plate, rendered as the app draws it (lab.render):
 * how much fine structure the frame has (mean |Laplacian| of its brightness)
 * at each zoom. Just past 1x the frame is the liquid, magnified, with no more
 * structure than it has at 1x; by 9x the cells are in.
 *
 *   npm run microscope      (any adapter that computes: scripts/lab.mjs)
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const ZOOMS = [1, 1.5, 2.5, 4, 6, 9, 14];
const { page, close } = await openLab();
try {
  const detail = await page.evaluate(async (ZOOMS) => {
    await lab.create(256);
    let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 40; k++) lab.dye(r(), r(), 0.05 + 0.1 * r(), [r() * 2, r() * 2, r() * 2], 1.5);
    lab.flush(); await lab.step(30);
    const S = 256, out = {};
    for (const z of ZOOMS) {
      const px = await lab.render(S, { macroMode: z > 1.05, macroZoom: z }, { zoom: z, cx: 0.45, cy: 0.5 });
      const L = (x, y) => { const i = (y * S + x) * 4; return 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]; };
      let e = 0, n = 0;
      for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
        e += Math.abs(L(x + 1, y) + L(x - 1, y) + L(x, y + 1) + L(x, y - 1) - 4 * L(x, y)); n++;
      }
      out[z] = e / n;
    }
    return out;
  }, ZOOMS);
  console.log('     fine structure by zoom: ' + ZOOMS.map((z) => `${z}x ${detail[z].toFixed(2)}`).join(', '));
  check('pushing in a little magnifies the liquid, with no cells yet',
    detail[1.5] < 1.5 * detail[1] + 1 && detail[2.5] < 1.5 * detail[1] + 1,
    `${detail[1.5].toFixed(2)} at 1.5x and ${detail[2.5].toFixed(2)} at 2.5x, against ${detail[1].toFixed(2)} on the whole plate`);
  check('the paint\'s own structure is there further in', detail[9] > 3 * detail[2.5] + 1,
    `${detail[9].toFixed(2)} at 9x`);
  check('and it arrives on the way, not at one zoom',
    detail[4] > detail[2.5] && detail[4] < detail[14],
    `${detail[2.5].toFixed(2)} → ${detail[4].toFixed(2)} → ${detail[14].toFixed(2)}`);
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
