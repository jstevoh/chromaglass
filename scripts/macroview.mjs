#!/usr/bin/env node
/**
 * The closeup is a closer look at the liquid, not a field of cells.
 *
 *   npm run macroview      (the lab: any adapter that computes)
 *
 * What was reported (2026-10-19): "Macro zoom is also still not great. Things
 * look like a bunch of biological cells when you zoom in - this isn't right. I
 * just want a closer and more 3d view of the liquid on the plate." Every look
 * that did not name its own Paint Cells and Macro Lacing inherited 0.75 and
 * 0.55, and at 4x and 6x the closeup drew packed concentric rings and dark
 * filaments (cellField, PLAN 20c-1) over any dye, however smooth it was. That
 * is a texture laid on the liquid, not the liquid seen closer.
 *
 * Asked here, on one stirred plate of nine pools at 256², of the default
 * settings and of three shipped looks that do not name cells (classic,
 * jellyfish-bloom, oil-and-water; macro-bead, cell-bloom and lace-run are
 * cell looks by name and are not asked), at 4x and 6x (the frame the pinch
 * and the Auto camera reach):
 *
 *   1. no cells the dye did not ask for. The cells' and lacing's own
 *      contribution to the frame (the picture, against the same picture with
 *      macroCells and macroLacing at 0), as a share of the frame's mean, is
 *      under CELLS. It is not a lattice test: the cells are irregular, and
 *      an autocorrelation's secondary peak read 0.02 on the old defaults,
 *      under its own line, so it measured nothing (the first draft of this
 *      file). The control is the old defaults (0.75 and 0.55), which must
 *      sit over CONTROL times the line or the line is measuring nothing
 *   2. the closeup is shaded, as a surface is: the relief's own contribution
 *      (the picture against the same picture with macroRelief at 0) is at
 *      least RELIEF of the frame's mean, and SMOOTH of it lives at scales
 *      over 17 px, so it reads as a swell and a sheen and not as grain
 *   3. the colour is the dye's. From 1x to 6x the plate's chroma does not
 *      drift: the middle sixth of the 1x frame (what the 6x frame is a view
 *      of), against the 6x frame, both averaged over 32 px blocks, is under
 *      HUE_DE in mean CIE76 distance on a* and b* (lightness is the relief's
 *      to move)
 *
 * The closeup stays still: the camera and its clock are held by `steadycam`
 * and `cellride`; nothing here moves.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 256, STEPS = 300, SIZE = 768;
const ZOOMS = [4, 6];
const CELLS = 0.01, CONTROL = 5, RELIEF = 0.02, SMOOTH = 0.5, HUE_DE = 5;
/** The old defaults (types.ts before 33g), the control for line 1. */
const OLD = { macroCells: 0.75, macroLacing: 0.55 };
const LOOKS = ['classic', 'jellyfish-bloom', 'oil-and-water'];

const { page, close } = await openLab();
const rows = [];
try {
  const known = await page.evaluate(() => lab.lookIds());
  const missing = LOOKS.filter((id) => !known.includes(id));
  if (missing.length) throw new Error(`no look ${missing.join(', ')}`);
  await page.evaluate(async ({ N, STEPS }) => {
    await lab.create(N);
    let s = 4242; const r = () => (s = s * 16807 % 2147483647) / 2147483647;
    for (let i = 0; i < 9; i++) lab.dye(0.15 + 0.7 * r(), 0.15 + 0.7 * r(), 0.06 + 0.08 * r(), [1.6 * r(), 1.6 * r(), 1.6 * r()], 0.8 + 0.6 * r());
    for (let k = 0; k < STEPS / 30; k++) {
      for (let i = 0; i < 6; i++) lab.vel(0.2 + 0.6 * r(), 0.2 + 0.6 * r(), 0.12, [(r() - 0.5) * 0.03, (r() - 0.5) * 0.03, 0, 0]);
      lab.flush(); await lab.step(30);
    }
  }, { N, STEPS });
  const cases = [
    { name: 'defaults', settings: {}, control: false },
    ...LOOKS.map((id) => ({ name: id, look: id, control: false })),
    { name: 'old defaults (control)', settings: OLD, control: true },
  ];
  for (const c of cases) {
    const row = await page.evaluate(async ({ c, SIZE, ZOOMS }) => {
      const base = c.look ? lab.look(c.look).settings : {};
      const set = { ...base, ...(c.settings ?? {}), macroMode: true };
      const shot = async (s, zoom) => new Uint8ClampedArray(await lab.render(SIZE, s, { zoom, macroAmount: zoom > 1 ? 1 : 0, cx: 0.5, cy: 0.5 }));
      const W = SIZE, P = W * W;
      const lum = (p) => { const L = new Float32Array(P); for (let i = 0; i < P; i++) L[i] = 0.2126 * p[4 * i] + 0.7152 * p[4 * i + 1] + 0.0722 * p[4 * i + 2]; return L; };
      // Box mean over (2h+1)² by summed-area table.
      const boxMean = (L, h) => {
        const S = new Float64Array((W + 1) * (W + 1));
        for (let y = 0; y < W; y++) { let run = 0; for (let x = 0; x < W; x++) { run += L[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + run; } }
        const M = new Float32Array(P);
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
          const x0 = Math.max(0, x - h), x1 = Math.min(W, x + h + 1), y0 = Math.max(0, y - h), y1 = Math.min(W, y + h + 1);
          M[y * W + x] = (S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
        }
        return M;
      };
      const lab3 = (r, g, b) => {
        const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
        const R = f(r), G = f(g), B = f(b);
        const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
        const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
        return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))];
      };
      const out = { name: c.name, zooms: [] };
      const flat = { ...set, macroRelief: 0 };
      const one = await shot(set, 1);
      for (const z of ZOOMS) {
        const px = await shot(set, z), nr = await shot(flat, z);
        const L = lum(px), Ln = lum(nr);
        const cl = lum(await shot({ ...set, macroCells: 0, macroLacing: 0 }, z));
        let cs = 0, ms = 0, rs = 0, e0 = 0, e1 = 0;
        const contrib = new Float32Array(P);
        for (let i = 0; i < P; i++) { contrib[i] = Math.abs(L[i] - Ln[i]); cs += Math.abs(L[i] - cl[i]); ms += cl[i]; rs += contrib[i]; }
        const Mc = boxMean(contrib, 8);
        for (let i = 0; i < P; i++) { e0 += contrib[i] ** 2; e1 += Mc[i] ** 2; }
        const cells = cs / (ms + 1e-6), relief = rs / (ms + 1e-6), smooth = e1 / (e0 + 1e-9);
        // The hue: the middle sixth of 1x, against 6x, in 32 px blocks, on
        // the chroma plane (a*, b*) alone: lightness is the relief's to move.
        let de = null;
        if (z === 6) {
          const crop = Math.round(W / 6), o = Math.round((W - crop) / 2), B = 32, nb = W / B;
          let tot = 0, n = 0;
          for (let by = 0; by < nb; by++) for (let bx = 0; bx < nb; bx++) {
            const a = [0, 0, 0], b = [0, 0, 0];
            for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
              const i = ((by * B + y) * W + bx * B + x) * 4, sx = o + Math.floor((bx * B + x) * crop / W), sy = o + Math.floor((by * B + y) * crop / W), j = (sy * W + sx) * 4;
              for (let k = 0; k < 3; k++) { a[k] += px[i + k]; b[k] += one[j + k]; }
            }
            const la = lab3(a[0] / (B * B), a[1] / (B * B), a[2] / (B * B)), lb = lab3(b[0] / (B * B), b[1] / (B * B), b[2] / (B * B));
            tot += Math.hypot(la[1] - lb[1], la[2] - lb[2]); n++;
          }
          de = tot / n;
        }
        out.zooms.push({ z, cells: +cells.toFixed(4), relief: +relief.toFixed(4), smooth: +smooth.toFixed(3), de: de == null ? null : +de.toFixed(2) });
      }
      return out;
    }, { c, SIZE, ZOOMS });
    row.control = c.control;
    rows.push(row);
    console.log(`  ${row.name.padEnd(24)} ${row.zooms.map((z) => `${z.z}x: cells ${z.cells}, relief ${z.relief} (${z.smooth} smooth)${z.de != null ? `, chroma dist ${z.de}` : ''}`).join('   ')}`);
  }
} finally {
  await close();
}

const shipped = rows.filter((r) => !r.control), control = rows.find((r) => r.control);
const all = shipped.flatMap((r) => r.zooms.map((z) => ({ ...z, name: r.name })));
const worst = (k, dir = 1) => all.filter((z) => z[k] != null).reduce((m, z) => (dir * z[k] > dir * m[k] ? z : m));
const wc = worst('cells'), wr = worst('relief', -1), ws = worst('smooth', -1), wd = worst('de');
const cc = Math.min(...control.zooms.map((z) => z.cells));
check(`1. no cells the dye did not ask for: their share of the frame is under ${CELLS} at 4x and 6x`,
  all.every((z) => z.cells < CELLS), `worst ${wc.name} ${wc.z}x ${wc.cells}`);
check(`1c. and the control (the old defaults) shows them, at over ${CONTROL} times the line`,
  cc > CONTROL * CELLS, `control least ${cc}`);
check(`2. the closeup is shaded: relief is ${RELIEF} of the frame or more, and ${SMOOTH} of it is smooth`,
  all.every((z) => z.relief >= RELIEF && z.smooth >= SMOOTH), `least relief ${wr.name} ${wr.z}x ${wr.relief}; least smooth ${ws.name} ${ws.z}x ${ws.smooth}`);
check(`3. the colour is the dye's: mean chroma distance from 1x to 6x under ${HUE_DE}`,
  all.filter((z) => z.de != null).every((z) => z.de < HUE_DE), `worst ${wd.name} ${wd.de}`);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
