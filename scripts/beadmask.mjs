#!/usr/bin/env node
/**
 * The oil beads' mask drawn on the GPU (PLAN.md 14ab-6).
 *
 *   npm run beadmask              (both halves; the lab's wants an adapter
 *                                  that computes, PW_WEBGPU=1 off a Mac)
 *   npm run beadmask -- --node    (the list alone, in node)
 *
 * Read in the code on 2026-10-24 (14ab): every frame the beads moved, which is
 * every frame they are out, the page drew their mask on the CPU and uploaded
 * the picture: the rings a 512² canvas with a radial gradient and a stroked
 * rim per bead, the drops `rasterDrops`, a loop over every pixel of every drop
 * and every wall it shares into a 1024 × 512 picture (`npm run drops` timed it
 * at 17 ms a frame on a cloud machine). Now the page writes the beads down as
 * a list (lib/beadPack.ts) and the plate draws the mask from it in compute
 * passes (gpu/beadMask.ts, wgsl/beadMask.ts), the CPU's arithmetic a line
 * for a line.
 *
 * The feature is "the plate reads the mask it read before, without the CPU
 * drawing it", so on fields laid the way `npm run drops` lays them (a crowd
 * gathered by a slow current for twenty seconds, repopulated as the app does,
 * Fillmore's dyes), as rings, as full drops and at half Drops (where ovals
 * and passengers are drawn part way in):
 *
 * In node:
 *   - the list finds every pair of drops that touch, the walls rasterDrops
 *     finds by asking every pair, and no other;
 *   - the bytes a frame hands across, and the CPU's time to write the list
 *     against the time to draw the picture.
 *
 * In the lab, on the real plate (`WebGPUPlate.setBeads`, as the app's frame
 * calls it):
 *   - the drops' mask, both halves, against `rasterDrops`' picture of the same
 *     field, pixel by pixel and channel by channel;
 *   - the rings' mask against each pixel's share of bead, dome and rim,
 *     counted a third way (the canvas `render()` draws is printed beside it
 *     but not judged: it antialiases by its own rasteriser's lights);
 *   - the plate drawn through `draw` with the field against the plate drawn
 *     with the CPU's picture: the list is drawn before the display reads it;
 *   - and the CPU's time to write the list there against the time to draw.
 * Controls, which must read far apart: the GPU's masks against their
 * references moved a pixel, the drops' upside down too; the plate with no
 * beads against the plate with them.
 */
import { build } from 'esbuild';

const nodeOnly = process.argv.includes('--node');
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const out = 'node_modules/.cache/beadmask-beads.mjs';
await build({
  stdin: { contents: "export * from './src/lib/beads.ts'; export * from './src/lib/beadPack.ts'; export { setShowSeed } from './src/lib/rng.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const { BeadField, rasterDrops, setShowSeed, BeadPacker, packBytes, dropWall } = await import(`../${out}`);

// The app's grid and mask (GRID_SIZE in LiquidVisualizer.tsx, BeadField.size).
const N = 192, S = 512;
const FILLMORE = [[1, 0.48, 0], [1, 0.92, 0], [0.65, 0.95, 0.95], [0.31, 0.78, 0.47]];
// The current `npm run drops` gathers its crowds with: three sinks at fourteen cells a second.
const SINKS = [[0.3, 0.35], [0.68, 0.3], [0.5, 0.72]].map(([x, y]) => [x * N, y * N]);
const current = (x, y) => {
  let best = null, bd = Infinity;
  for (const [sx, sy] of SINKS) { const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = [sx, sy]; } }
  if (bd < 1) return [0, 0];
  return [(best[0] - x) / bd * 0.03, (best[1] - y) / bd * 0.03];
};
/** A field as the app runs one: repopulated every thirtieth frame, stepped; ages as they fall (fresh beads still fading in). */
function crowd(drops, frames = 1200, s = 4242) {
  setShowSeed(s);
  const f = new BeadField(N);
  f.drops = drops;
  f.setPalette(FILLMORE.map(([r, g, b]) => ({ r, g, b })));
  for (let i = 0; i < frames; i++) {
    if (i % 30 === 0) f.populate(Math.round(60 + 360 * 0.8), 0.8 + 0.4 * 0.8);
    f.step(1 / 60, current, 0, 0);
  }
  return f;
}
const FIELDS = [
  { name: 'rings', drops: 0, field: crowd(0) },
  { name: 'drops', drops: 1, field: crowd(1) },
  { name: 'half drops', drops: 0.5, field: crowd(0.5) },
];
for (const F of FIELDS) {
  const bs = F.field.beads;
  F.count = bs.length;
  F.ovals = bs.filter((b) => b.sx !== undefined && Math.hypot(b.sx, b.sy ?? 0) > 0.01).length;
  F.passengers = bs.filter((b) => b.inner).length;
  F.fading = bs.filter((b) => b.age < 0.6).length;
}

// ── The list, in node ─────────────────────────────────────────────────
{
  const packer = new BeadPacker();
  for (const F of FIELDS.filter((f) => f.drops > 0)) {
    const bs = F.field.beads, k = S / N;
    const p = packer.packBeads(bs, N, S, F.drops);
    // Every pair rasterDrops would cut, asked of every pair as it asks.
    const cx = bs.map((b) => Math.fround(b.x * k)), cy = bs.map((b) => Math.fround(b.y * k)), cr = bs.map((b) => Math.fround(Math.max(1, b.r * k)));
    const cA = bs.map((b) => Math.fround(1 + (b.sx !== undefined ? F.drops * Math.hypot(b.sx, b.sy ?? 0) : 0)));
    const want = new Set();
    for (let i = 0; i < bs.length; i++) for (let j = 0; j < bs.length; j++) {
      if (i === j) continue;
      const dx = cx[j] - cx[i], dy = cy[j] - cy[i], D2 = dx * dx + dy * dy, reach = cr[i] * cA[i] + cr[j] * cA[j];
      if (D2 >= reach * reach || !(D2 > 1e-6)) continue;
      const D = Math.sqrt(D2), w = dropWall(cr[i], cr[j], D), f = Math.fround;
      want.add(`${i}:${f(dx / D)}:${f(dy / D)}:${f(w.apex)}:${f(w.side * w.rho)}`);
    }
    // And what the list holds (every bead here is drawable, so its index in the list is its index in the field).
    const U = new Uint32Array(p.beads.buffer);
    const got = new Set();
    for (let i = 0; i < p.n; i++) {
      for (let q = U[i * 24 + 10]; q < U[i * 24 + 10] + U[i * 24 + 11]; q++) got.add(`${i}:${[0, 1, 2, 3].map((c) => p.cuts[q * 4 + c]).join(':')}`);
    }
    const missing = [...want].filter((x) => !got.has(x)).length, extra = [...got].filter((x) => !want.has(x)).length;
    check(`${F.name}: the list holds every wall rasterDrops cuts, and no other`, p.n === bs.length && want.size > 100 && missing === 0 && extra === 0,
      `${want.size} walls between ${bs.length} drops (${F.ovals} drawn out, ${F.passengers} carrying one); ${missing} missing, ${extra} extra`);
  }

  /*
    The app's own frame, read in its source: no harness here builds the
    visualizer, so this is what says the frame hands the plate the field (a
    deleted call, or the frame handing it nothing, compiles). The field when it
    moved goes into the frame's view, and the view's field to `setBeads`;
    frameTypes types it as a field, so no picture can come back that way.
  */
  {
    const { readFileSync } = await import('node:fs');
    const lv = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8'), ft = readFileSync('src/sim/frameTypes.ts', 'utf8');
    const made = /const beadMask = \(currentSettings\.beads \?\? 0\) > 0 \? beadsRef\.current\.moved\(\) : null;/.test(lv);
    const handed = /\n\s+beadMask,\n/.test(lv);
    const drawn = /if \(view\.beadMask\) upload\('beads', \(\) => plate\.setBeads\(view\.beadMask!\)\);/.test(lv);
    const typed = /beadMask: BeadField \| null;/.test(ft);
    const canvasGone = !/beadsRef\.current\.render\(\)/.test(lv) && !/setSource\('beads'/.test(lv);
    check("the app's frame hands the plate the moved field, and no picture of it", made && handed && drawn && typed && canvasGone,
      `moved() into the view ${made && handed}, setBeads from it ${drawn}, typed as a field ${typed}, no render() or picture ${canvasGone}`);
  }

  // Bytes and time, warm, as the app runs them every frame they move.
  const timed = (fn, reps = 40) => { for (let r = 0; r < 20; r++) fn(); const t0 = performance.now(); for (let r = 0; r < reps; r++) fn(); return (performance.now() - t0) / reps; };
  const px = new Uint8ClampedArray(S * 2 * S * 4), own = new Float32Array(S * S), ids = new Int32Array(S * S);
  const d = FIELDS[1];
  const rasterMs = timed(() => rasterDrops(d.field.beads, N, S, px, own, ids, 1));
  const packMs = timed(() => packer.packBeads(d.field.beads, N, S, 1));
  const dropBytes = packBytes(packer.packBeads(d.field.beads, N, S, 1));
  const ringBytes = packBytes(packer.packBeads(FIELDS[0].field.beads, N, S, 0));
  check('a frame hands across the list, a tenth of the picture or less', dropBytes * 10 <= S * 2 * S * 4 && ringBytes * 10 <= S * S * 4,
    `drops ${(S * 2 * S * 4 / 1e6).toFixed(2)} MB → ${(dropBytes / 1e3).toFixed(1)} KB (${d.count} drops), rings ${(S * S * 4 / 1e6).toFixed(2)} MB → ${(ringBytes / 1e3).toFixed(1)} KB (${FIELDS[0].count} rings)`);
  check('and writing the list costs the CPU a tenth of drawing the drops or less', packMs * 10 <= rasterMs,
    `rasterDrops ${rasterMs.toFixed(2)} ms → the list ${packMs.toFixed(3)} ms a frame`);
}

/**
 * The rings' mask worked out a third way (the rings' line in the lab): each
 * bead's coverage of each pixel counted on an 8 × 8 grid of points, then the
 * canvas's own arithmetic, interiors over the ones before at their fade-in
 * with the gradient read at the pixel's middle, then every rim added.
 */
function ringsExact(beads) {
  const k = S / N, SS = 8;
  const bead = new Float64Array(S * S), rim = new Float64Array(S * S), dome = new Float64Array(S * S);
  const each = (fn) => {
    for (const b of beads) {
      const x0 = b.x * k, y0 = b.y * k, rr = Math.max(1, b.r * k);
      for (let py = Math.max(0, Math.floor(y0 - rr - 1)); py <= Math.min(S - 1, Math.ceil(y0 + rr + 1)); py++) {
        for (let px = Math.max(0, Math.floor(x0 - rr - 1)); px <= Math.min(S - 1, Math.ceil(x0 + rr + 1)); px++) fn(b, x0, y0, rr, px, py);
      }
    }
  };
  const share = (px, py, x0, y0, inside) => {
    let n = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const dx = px + (sx + 0.5) / SS - x0, dy = py + (sy + 0.5) / SS - y0;
      if (inside(dx * dx + dy * dy)) n++;
    }
    return n / (SS * SS);
  };
  each((b, x0, y0, rr, px, py) => {
    const cov = share(px, py, x0, y0, (d2) => d2 < rr * rr);
    if (!cov) return;
    const a = cov * Math.min(1, b.age / 0.6), t = Math.min(1, Math.hypot(px + 0.5 - x0, py + 0.5 - y0) / rr), i = py * S + px;
    bead[i] = a + bead[i] * (1 - a);
    dome[i] = (1 - t) * a + dome[i] * (1 - a);
  });
  each((b, x0, y0, rr, px, py) => {
    const lw = Math.max(1, rr * 0.12), i = py * S + px;
    const cov = share(px, py, x0, y0, (d2) => d2 < rr * rr && d2 >= (rr - lw) * (rr - lw));
    rim[i] = Math.min(1, rim[i] + cov * Math.min(1, b.age / 0.6) * (0.8 + 0.2 * b.seed));
  });
  return [bead, rim, dome];
}
/** A mask's channel against an exact one (0..1): its sum as a ratio, how many pixels past 24 levels, the most. */
function against(px, c, exact) {
  let over24 = 0, most = 0, sm = 0, se = 0;
  for (let i = 0; i < S * S; i++) {
    const e = exact[i] * 255, d = Math.abs(px[i * 4 + c] - e);
    if (d > 24) over24++;
    most = Math.max(most, Math.round(d));
    sm += px[i * 4 + c]; se += e;
  }
  return { ratio: sm / se, over24, most };
}
/** A channel moved a pixel right (the control). */
function shift(a) {
  const o = new Float64Array(a.length);
  for (let y = 0; y < S; y++) for (let x = 1; x < S; x++) o[y * S + x] = a[y * S + x - 1];
  return o;
}

// ── The lab: the real plate ───────────────────────────────────────────
if (!nodeOnly) {
  const { openLab } = await import('./lab.mjs');
  const { page, close } = await openLab();
  try {
    await page.evaluate(() => lab.create(64));
    const info = await page.evaluate(() => lab.adapter());
    console.log(`  adapter: ${info?.vendor} ${info?.architecture}`);
    // Every bead as plain data, into a field built in the page.
    const data = (f) => JSON.stringify(f.beads);
    await page.evaluate(({ N, S }) => {
      const device = lab.solver().device;
      window.bm = {
        field(beads, drops) {
          const f = new lab.BeadField(N);
          f.drops = drops;
          for (const b of JSON.parse(beads)) f.beads.push(b);
          f.dirty = true;
          return f;
        },
        /** A texture's RGBA bytes. */
        async read(tex) {
          const W = tex.width, H = tex.height, row = W * 4;
          const buf = device.createBuffer({ size: row * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
          const enc = device.createCommandEncoder();
          enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [W, H]);
          device.queue.submit([enc.finish()]);
          await buf.mapAsync(GPUMapMode.READ);
          const px = new Uint8Array(buf.getMappedRange().slice(0));
          buf.unmap(); buf.destroy();
          return px;
        },
        /**
         * The mask as the plate draws it from the field (`setBeads`, then the
         * head of a draw), on one plate kept for every field, as the app keeps
         * one: rings to drops and back remakes the texture, and a smaller
         * field draws from buffers a bigger one grew. And the bytes `setBeads`
         * actually writes across, counted at the queue.
         */
        async gpu(f) {
          const plate = (this.plate ??= new lab.WebGPUPlate(device, 'rgba8unorm'));
          const q = device.queue, write = q.writeBuffer;
          let written = 0;
          q.writeBuffer = function (buf, off, data, dataOff, size) {
            written += size ?? (data.byteLength - (dataOff ?? 0));
            return write.apply(this, arguments);
          };
          try { plate.setBeads(f.moved()); } finally { q.writeBuffer = write; }
          const enc = device.createCommandEncoder();
          plate.drawBeads(enc);
          device.queue.submit([enc.finish()]);
          const tex = plate.sources.get('beads').texture;
          const px = await this.read(tex);
          return { px, W: tex.width, H: tex.height, written };
        },
        /** The mask as the CPU drew it, uploaded the way the app uploaded it. */
        async cpu(f) {
          const plate = new lab.WebGPUPlate(device, 'rgba8unorm');
          f.dirty = true;
          plate.setSource('beads', f.render());
          const tex = plate.sources.get('beads').texture;
          const px = await this.read(tex);
          plate.dispose();
          return { px, W: tex.width, H: tex.height };
        },
        /**
         * Two masks compared: per channel and half, how many pixels differ by
         * more than one level and by more than eight, the most, and each
         * channel's sum as a ratio. `shift` moves the second a pixel right,
         * `flip` turns it upside down (the controls).
         */
        compare(a, b, W, H, { shift = 0, flip = false } = {}) {
          const halves = W > H ? 2 : 1, res = [];
          for (let h = 0; h < halves; h++) for (let c = 0; c < 3; c++) {
            let over1 = 0, over8 = 0, most = 0, sa = 0, sb = 0;
            for (let y = 0; y < H; y++) for (let x = 0; x < H; x++) {
              const xb = Math.min(H - 1, Math.max(0, x - shift)), yb = flip ? H - 1 - y : y;
              const va = a[(y * W + h * H + x) * 4 + c], vb = b[(yb * W + h * H + xb) * 4 + c];
              const d = Math.abs(va - vb);
              if (d > 1) over1++;
              if (d > 8) over8++;
              if (d > most) most = d;
              sa += va; sb += vb;
            }
            res.push({ half: h, c, over1, over8, most, ratio: sb > 0 ? sa / sb : sa === 0 ? 1 : Infinity, sa });
          }
          return res;
        },
      };
    }, { N, S });

    const summary = (rs) => rs.map((r) => `${'rgb'[r.c]}${r.half ? '′' : ''} ${r.over1}/${r.over8} (≤${r.most})`).join(', ');
    // Rings, drops, half drops, then rings again, all on the one plate.
    for (const F of [...FIELDS, { ...FIELDS[0], name: 'rings again, after the drops' }]) {
      const res = await page.evaluate(async ({ beads, drops, S }) => {
        const g = await bm.gpu(bm.field(beads, drops));
        const f = bm.field(beads, drops);
        let ref;
        if (drops > 0) {
          // rasterDrops' picture itself, with no canvas between.
          const px = new Uint8ClampedArray(S * 2 * S * 4);
          lab.rasterDrops(f.beads, f.grid, S, px, new Float32Array(S * S), new Int32Array(S * S), drops);
          ref = { px, W: S * 2, H: S };
        } else ref = await bm.cpu(f);
        const out = { W: g.W, H: g.H, refW: ref.W, written: g.written, same: bm.compare(g.px, ref.px, g.W, g.H) };
        // The rings' two masks themselves, to be held to the beads' exact coverage in node.
        const b64 = (a) => { let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(s); };
        if (!(drops > 0)) { out.gpu = b64(g.px); out.canvas = b64(ref.px); }
        if (drops > 0) {
          out.shifted = bm.compare(g.px, ref.px, g.W, g.H, { shift: 1 });
          out.flipped = bm.compare(g.px, ref.px, g.W, g.H, { flip: true });
          // Pixels any drop covers, for the share that differs.
          let covered = 0;
          for (let i = 0; i < S * S; i++) if (ref.px[((i / S | 0) * S * 2 + i % S) * 4] > 0) covered++;
          out.covered = covered;
        }
        return out;
      }, { beads: data(F.field), drops: F.drops, S });
      const shape = `${res.W}×${res.H}`;
      if (F.drops > 0) {
        check(`${F.name}: the mask is the shape the plate tells drops by`, res.W === S * 2 && res.H === S && res.refW === S * 2, shape);
        // The field has what the drops' arithmetic draws beyond a round drop, or the line below asks nothing of it.
        check(`${F.name}: the field has drops drawn out and drops carrying one`, F.ovals >= 5 && F.passengers >= 50,
          `${F.ovals} drawn out (at least 5), ${F.passengers} carrying one (at least 50)`);
        check(`${F.name}: the plate writes across a tenth of the picture or less`, res.written > 0 && res.written * 10 <= S * 2 * S * 4,
          `${(res.written / 1e3).toFixed(1)} KB written at the queue against the picture's ${(S * 2 * S * 4 / 1e6).toFixed(2)} MB`);
        /*
          The bar. The arithmetic is the CPU's in single floats, and the CPU's
          picture rounds each byte half to even where the GPU's rounds half
          up, so a level either way is rounding. Past eight levels a pixel is
          drawn differently: a different owner across a wall, or a hole
          filled from another neighbour (the GPU's fill reads the pass before,
          the CPU's the pixel it filled a moment ago, which on these fields
          has not yet given a different pixel). Those are held to one in ten
          thousand of the drops' pixels in each channel, and more than a level
          off to one in a thousand.
        */
        const worst8 = Math.max(...res.same.map((r) => r.over8)), worst1 = Math.max(...res.same.map((r) => r.over1));
        check(`${F.name}: the GPU's mask is rasterDrops', both halves, channel by channel`,
          res.covered > 50000 && worst8 <= res.covered / 10000 && worst1 <= res.covered / 1000,
          `${F.count} drops (${F.ovals} drawn out, ${F.passengers} carrying one, ${F.fading} fading in) over ${res.covered} px; past 1 / past 8 levels (most): ${summary(res.same)}`);
        const ctl = (rs) => Math.min(...rs.filter((r) => r.c === 0 && r.half === 0).map((r) => r.over8));
        check(`${F.name}: and the comparison sees a mask a pixel over, or upside down`,
          ctl(res.shifted) > 20 * Math.max(1, worst8) && ctl(res.flipped) > 20 * Math.max(1, worst8),
          `red past 8 levels: ${ctl(res.shifted)} a pixel over, ${ctl(res.flipped)} upside down, ${worst8} as drawn`);
      } else {
        check(`${F.name}: the mask is the square the plate tells rings by`, res.W === S && res.H === S && res.refW === S, shape);
        check(`${F.name}: the plate writes across a tenth of the picture or less`, res.written > 0 && res.written * 10 <= S * S * 4,
          `${(res.written / 1e3).toFixed(1)} KB written at the queue against the picture's ${(S * S * 4 / 1e6).toFixed(2)} MB`);
        /*
          The canvas is no reference for a ring's edge: it antialiases a
          filled circle and a stroke its own way, which differs by browser and
          by rasteriser (on SwiftShader an edge pixel sat up to 96 levels from
          the share of it the bead covers, the rims' sum 1.8% light). What
          the plate means by the mask is how much of each pixel is bead (red,
          at its fade-in), the dome under that (blue) and how much is rim
          (green): so both are held to that, worked out here a third way,
          each pixel's coverage counted on an 8 × 8 grid of points (to a
          sixty-fourth, four levels), composited as the canvas composites.
          The GPU takes the coverage as the distance to the edge plus a half,
          as rasterDrops does, which is the share exactly for a straight edge
          through the middle of a pixel and off by up to a tenth (26 levels)
          at a corner or round a bead a pixel or two across. So: each
          channel's sum to half a percent, and no more than one pixel in a
          thousand of the beads' area past 24 levels. The canvas's numbers
          are printed beside, not judged.
        */
        const exact = ringsExact(F.field.beads);
        const G = Buffer.from(res.gpu, 'base64'), Cv = Buffer.from(res.canvas, 'base64');
        const area = exact[0].reduce((a, v) => a + v, 0);
        const rows = [0, 1, 2].map((c) => ({ c, gpu: against(G, c, exact[c]), canvas: against(Cv, c, exact[c]) }));
        const say = (r) => `${['bead', 'rim', 'dome'][r.c]} ×${r.gpu.ratio.toFixed(4)}, ${r.gpu.over24} past 24 (most ${r.gpu.most}) [canvas ×${r.canvas.ratio.toFixed(4)}, ${r.canvas.over24} (most ${r.canvas.most})]`;
        check(`${F.name}: the GPU's mask is each pixel's share of bead, dome and rim`,
          area > 30000 && rows.every((r) => Math.abs(r.gpu.ratio - 1) <= 0.005 && r.gpu.over24 <= area / 1000),
          `${F.count} rings (${F.fading} fading in) over ${area.toFixed(0)} px of bead; ${rows.map(say).join('; ')}`);
        const moved = against(G, 0, shift(exact[0]));
        check(`${F.name}: and the comparison sees a mask a pixel over`, moved.over24 > 20 * Math.max(1, rows[0].gpu.over24),
          `red past 24 levels: ${moved.over24} a pixel over, ${rows[0].gpu.over24} as drawn`);
      }
    }

    // ── Through the plate's draw ──
    const drawn = await page.evaluate(async ({ beads, S }) => {
      for (let y = 0.05; y < 1; y += 0.1) for (let x = 0.05; x < 1; x += 0.1) lab.dye(x, y, 0.04, [0.9 * x, 0.6, 0.9 * (1 - y)], 1.2);
      lab.flush(); await lab.step(2);
      const set = { beads: 0.8, beadDrops: 1 };
      const field = bm.field(beads, 1);
      const px = new Uint8ClampedArray(S * 2 * S * 4);
      lab.rasterDrops(field.beads, field.grid, S, px, new Float32Array(S * S), new Int32Array(S * S), 1);
      const canvas = new OffscreenCanvas(S * 2, S);
      canvas.getContext('2d').putImageData(new ImageData(px, S * 2, S), 0, 0);
      const viaList = await lab.render(256, set, { beadMask: field.moved() });
      const viaPicture = await lab.render(256, set, { beadMask: canvas });
      const none = await lab.render(256, set, {});
      const diff = (a, b) => { let over = 0, most = 0; for (let i = 0; i < a.length; i++) { if (i % 4 === 3) continue; const d = Math.abs(a[i] - b[i]); if (d > 4) over++; most = Math.max(most, d); } return { over, most }; };
      return { same: diff(viaList, viaPicture), none: diff(none, viaPicture), n: 256 * 256 * 3 };
    }, { beads: data(FIELDS[1].field), S });
    check('the plate drawn with the field is the plate drawn with the CPU\'s picture, and the beads are on it',
      drawn.same.over <= 20 && drawn.none.over > 50 * Math.max(1, drawn.same.over),
      `values past 4 levels: ${drawn.same.over} of ${drawn.n} (most ${drawn.same.most}); with no beads ${drawn.none.over}`);

    // ── The CPU's time in the page ──
    const t = await page.evaluate(async ({ rings, drops, S }) => {
      const timed = (fn, reps = 10) => { fn(); const t0 = performance.now(); for (let r = 0; r < reps; r++) fn(); return (performance.now() - t0) / reps; };
      const r = bm.field(rings, 0), d = bm.field(drops, 1);
      const packer = new lab.BeadPacker();
      const px = new Uint8ClampedArray(S * 2 * S * 4), own = new Float32Array(S * S), ids = new Int32Array(S * S);
      return {
        canvas: timed(() => { r.dirty = true; r.render(); }),
        raster: timed(() => lab.rasterDrops(d.beads, d.grid, S, px, own, ids, 1)),
        packRings: timed(() => packer.packBeads(r.beads, r.grid, S, 0)),
        packDrops: timed(() => packer.packBeads(d.beads, d.grid, S, 1)),
      };
    }, { rings: data(FIELDS[0].field), drops: data(FIELDS[1].field), S });
    /*
      Judged on the drops, which rasterDrops draws in plain script. The rings'
      canvas may be accelerated, so its time can be the recording of the calls
      and not the drawing: printed, not judged.
    */
    check('in the page, the list costs the CPU a tenth of drawing the drops or less',
      t.packDrops * 10 <= t.raster,
      `drops: rasterDrops ${t.raster.toFixed(2)} ms → the list ${t.packDrops.toFixed(3)} ms (the 2 MB upload not counted); rings: the canvas's calls ${t.canvas.toFixed(2)} ms → the list ${t.packRings.toFixed(3)} ms`);
  } finally {
    await close();
  }
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
