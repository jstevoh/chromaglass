/**
 * The flower: ghost copies of every thin rim, one cell apart (PLAN 31s-8).
 *
 *   npm run flower            (the lab: the solver's dye format and the plate's derive pass)
 *   npm run flower -- --quick (this build only, no control: a quicker look by hand; the film gate runs it in full)
 *
 * What was reported: about eight faint circles round every moving bubble
 * and drop, at headed 2x Chrome on Galaxy with tier=local, after the
 * three-cell Sobel that drew the same thing (15g-15) had been replaced and
 * the replacement had shipped as the fix (#933). The owner kept seeing it.
 *
 * Why it survived: the slope's taps stand one cell of the logical grid
 * (192) apart, while the dye they read is the solver's own grid (768 at
 * tier=local on a 2x screen), four texels to a cell. A tap that reads one
 * point of its cell sees one texel in four, so a rim thinner than a cell
 * (a bubble's cut is about a texel and a half) is seen by exactly the taps
 * that land on it: the pixel beside it sees it through the next tap out,
 * the one beside that through the one after, and the rim is drawn again at
 * every tap offset, a comb of copies one cell apart. Eight taps out, eight
 * circles. The fix reads each tap as the mean of its whole cell, which is
 * what a cell's worth of dye is.
 *
 * What this measures, on three plates written straight into a dye texture
 * at 768 (logical grid 192), sharper than any drop the solver can pour so
 * that nothing the solver does softens them first:
 *
 *   ring    a dye ring a texel and a half wide (a rim, a thin filament)
 *   disc    a disc whose edge is half a texel, a step (a drop's rim)
 *   bubble  a hole of air, its edge a step, in thin even dye, with the
 *           dye it pushed aside piled in a ring just outside it
 *
 * The disc's edge is a step because at a texel and a half its edge is a
 * ramp across most of a cell, which point reads do not comb (measured: the
 * point-read control read 0.17 on it, the cell-mean build 0.15). Even as
 * a step it combs only weakly under point reads (0.14), so the disc is
 * gated on the build and its control printed, not required: the ring and
 * the bubble are the flower's shape. A bubble on even dye is no edge at
 * all under either build (its air is held to the middle's density), and on
 * a gentle tilt ∇² ripples three cells long all across the tilt, far past
 * any rim and alike under both builds: a fault of its own, not the
 * flower's (PLAN 31s-9). The piled rim is what a bubble pushes aside, and
 * what the flower copied.
 *
 * For each, the slope the derive pass writes (|.xy|) and its Laplacian
 * (.z), in the band one and a half to four cells either side of the rim,
 * where the copies stand. A slope that is the dye seen through a smooth
 * kernel varies there over the kernel's width (1.5 cells); a comb varies
 * every texel. So the measure is what is left after a box one cell wide:
 * sum |G − box(G)| / sum |G|. A smooth response leaves a few per cent; the
 * comb leaves most of it.
 *
 * The control proves the instrument can see the flower: the same build
 * with each tap read at one point again (cellDensity's single read for
 * every grid, which is what main drew before this fix) must read over
 * CONTROL_MIN on the ring and the bubble, or the check is measuring
 * nothing. The bubble's control reads each air tap at one point too.
 */
import { openLab } from './lab.mjs';

const QUICK = process.argv.includes('--quick');

// What a smooth slope leaves after a one-cell box, at most (measured: see the commit).
const MAX_COMB = 0.10;
// What the point-read control must leave, at least, on the ring and the bubble.
const CONTROL_MIN = 0.3;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const CONTROL_POINT = {
  name: 'point-read',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]plateSlope\.ts$/ }, async (a) => {
      const { readFileSync } = await import('node:fs');
      let s = readFileSync(a.path, 'utf8');
      const cut = 'if (s < 1.5) {';
      const found = s.split(cut).length - 1;
      if (found !== 1) throw new Error(`flower: the point-read control found ${found} of 1 "${cut}" in wgsl/plateSlope.ts`);
      s = s.replace(cut, 'if (s < 1.0e9) {');
      return { contents: s, loader: 'ts' };
    });
  },
};

async function measure(plugins, tag) {
  const { page, close } = await openLab({ plugins, tag });
  try {
    return await page.evaluate(async (PROFILE) => {
      const N = 768, L = 192, S = N / L;
      await lab.create(N);
      const solver = lab.solver();
      const device = solver.device;
      const plate = new lab.WebGPUPlate(device, 'rgba8unorm');
      plate.pack.set('logicalGrid', L).set('gridSize', N);
      const target = device.createTexture({ size: [320, 320], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
      const fmt = solver.dye.read.format;
      const toHalf = (v) => {
        const f = new Float32Array([v]), u = new Uint32Array(f.buffer)[0];
        const s = (u >> 16) & 0x8000, e = ((u >> 23) & 255) - 112, m = u & 0x7fffff;
        if (e <= 0) return s;
        if (e >= 31) return s | 0x7c00;
        return s | (e << 10) | (m >> 13);
      };
      const half = (v) => {
        const e = (v >> 10) & 31, f = v & 1023, s = v & 0x8000 ? -1 : 1;
        // An infinity or a NaN is a broken pass, not a quiet zero that would read as no comb.
        if (e === 31) throw new Error(`flower: the derive pass wrote ${f ? 'NaN' : 'an infinity'}`);
        return e === 0 ? s * f * 2 ** -24 : s * (1 + f / 1024) * 2 ** (e - 15);
      };
      // A dye texture of the solver's own format, density in .a and the colour scaled by it.
      const dyeTex = (density) => {
        const t = device.createTexture({ size: [N, N], format: fmt, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING });
        const f32 = new Float32Array(N * N * 4);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const d = density(x + 0.5, y + 0.5), i = (y * N + x) * 4;
          f32[i] = d * 0.9; f32[i + 1] = d * 0.4; f32[i + 2] = d * 0.2; f32[i + 3] = d;
        }
        if (fmt === 'rgba32float') device.queue.writeTexture({ texture: t }, f32, { bytesPerRow: N * 16 }, [N, N]);
        else device.queue.writeTexture({ texture: t }, Uint16Array.from(f32, toHalf), { bytesPerRow: N * 8 }, [N, N]);
        return t;
      };
      const airTex = (air) => {
        const t = device.createTexture({ size: [N, N], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
        const u8 = new Uint8Array(N * N * 4);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) u8[(y * N + x) * 4] = Math.round(255 * air(x + 0.5, y + 0.5));
        device.queue.writeTexture({ texture: t }, u8, { bytesPerRow: N * 4 }, [N, N]);
        return t;
      };
      const derived = async (layer) => {
        const enc = device.createCommandEncoder();
        plate.draw(enc, target.createView(), { width: 320, height: 320 }, [layer]);
        device.queue.submit([enc.finish()]);
        const tex = plate.layers[0].derived;
        const w = tex.width, h = tex.height;
        const row = Math.ceil((w * 8) / 256) * 256;
        const buf = device.createBuffer({ size: row * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        const e2 = device.createCommandEncoder();
        e2.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [w, h]);
        device.queue.submit([e2.finish()]);
        await buf.mapAsync(GPUMapMode.READ);
        const halves = new Uint16Array(buf.getMappedRange().slice(0));
        buf.unmap();
        return { w, h, at: (x, y, c) => half(halves[y * (row / 2) + x * 4 + c]) };
      };
      // Off the texel grid on purpose, so no tap lines up with the rim by luck.
      const cx = N / 2 + 0.37, cy = N / 2 - 0.21, R = 25 * S, RIM = 1.5, STEP = 0.5;
      const r = (x, y) => Math.hypot(x - cx, y - cy);
      const step = (t) => 0.5 - 0.5 * Math.tanh(t / (STEP / 2));
      const plates = {
        ring: { dye: (x, y) => 2.0 * Math.exp(-(((r(x, y) - R) / (RIM / 2)) ** 2)), air: null },
        disc: { dye: (x, y) => 2.0 * step(r(x, y) - R), air: null },
        bubble: { dye: (x, y) => 0.3 + 2.0 * Math.exp(-(((r(x, y) - R - RIM) / (RIM / 2)) ** 2)), air: (x, y) => step(r(x, y) - R) },
      };
      // sum |G − box(G)| / sum |G| over the band 1.5–4 cells from the rim, either side. The box is one
      // cell wide and centred: S + 1 texels, the two ends weighed a half, so a smooth ramp leaves nothing
      // (an even box of S texels sits half a texel off and leaves half the ramp's step).
      const comb = (G, w) => {
        const h0 = Math.round(S / 2), bw = (k) => (Math.abs(k) === h0 ? 0.5 : 1);
        let res = 0, tot = 0;
        for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
          const dr = Math.abs(r(x + 0.5, y + 0.5) - R) / S;
          if (dr < 1.5 || dr > 4) continue;
          let m = 0, n = 0;
          for (let j = -h0; j <= h0; j++) for (let i = -h0; i <= h0; i++) {
            const k = bw(i) * bw(j);
            m += k * G[(y + j) * w + (x + i)]; n += k;
          }
          m /= n;
          const g = G[y * w + x];
          res += Math.abs(g - m); tot += Math.abs(g);
        }
        return { comb: tot > 0 ? res / tot : 0, tot };
      };
      const out = { fmt, cell: S };
      for (const [name, p] of Object.entries(plates)) {
        const res = await derived({ dye: dyeTex(p.dye), velForced: solver.velForced, grain: null, particles: null, air: p.air ? airTex(p.air) : null, view: null });
        const { w } = res;
        const slope = new Float32Array(w * w), lap = new Float32Array(w * w);
        for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
          slope[y * w + x] = Math.hypot(res.at(x, y, 0), res.at(x, y, 1));
          lap[y * w + x] = res.at(x, y, 2);
        }
        out[name] = { w, slope: comb(slope, w), lap: comb(lap, w) };
        if (PROFILE) out[name].profile = Array.from({ length: 64 }, (_, k) => {
          const x = Math.floor(cx + R) - 24 + k, y = Math.floor(cy);
          return [x - (cx + R), slope[y * w + x], lap[y * w + x]].map((v) => +v.toFixed(4));
        });
      }
      return out;
    }, !!process.env.FLOWER_PROFILE);
  } finally {
    await close();
  }
}

const fmt = (m) => `slope ${m.slope.comb.toFixed(3)}, ∇² ${m.lap.comb.toFixed(3)}`;
const build = await measure([], 'flower');
console.log(` --   dye ${build.fmt}, ${build.cell} texels a cell, derive at ${build.ring.w}²`);
const control = QUICK ? null : await measure([CONTROL_POINT], 'flower-point');
if (process.env.FLOWER_PROFILE) for (const name of ['ring', 'disc', 'bubble']) {
  console.log(`\n${name}: texels from the rim, slope, ∇² (build | control)`);
  build[name].profile.forEach((b, k) => console.log(`  ${b.join('\t')}\t|\t${control ? control[name].profile[k].slice(1).join('\t') : ''}`));
}

check('the derive pass is at the dye\'s size, more than a texel a cell (else there is nothing to comb)',
  build.ring.w === 768 && build.cell >= 2, `${build.ring.w}², ${build.cell} texels a cell`);
for (const name of ['ring', 'disc', 'bubble']) {
  const b = build[name];
  // Both measures must see the rim: a ∇² gone to zero leaves nothing to comb, and would pass.
  const live = b.slope.tot > 0 && b.lap.tot > 0;
  check(`${name}: the slope and its ∇² see the rim at all`, live, `sum |slope| in the band ${b.slope.tot.toFixed(1)}, sum |∇²| ${b.lap.tot.toFixed(1)}`);
  const worst = Math.max(b.slope.comb, b.lap.comb);
  check(`${name}: no copies of the rim a cell apart (what a one-cell box leaves ≤ ${MAX_COMB})`,
    live && worst <= MAX_COMB, `${fmt(b)}${control ? `; point-read control ${fmt(control[name])}` : ''}`);
}
if (control) {
  for (const name of ['ring', 'bubble']) {
    const c = control[name];
    check(`${name}: the point-read control draws the flower (≥ ${CONTROL_MIN}), so the measure can see one`,
      Math.max(c.slope.comb, c.lap.comb) >= CONTROL_MIN, fmt(c));
  }
}

const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} of ${checks.length} failed` : `\nall ${checks.length} passed`);
process.exit(failed ? 1 : 0);
