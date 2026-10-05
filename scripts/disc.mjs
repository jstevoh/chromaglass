#!/usr/bin/env node
/**
 * The magnet under the glass is a cylinder, and the shader's field is a real magnet's.
 *
 *   npm run disc     (the lab: any adapter that computes; PW_WEBGPU=1 in a cloud session)
 *
 * PLAN.md 9v. The solver's magnet was a point dipole, and Magnet Size made a
 * bigger magnet by sinking it k times deeper with k³ the strength. A real
 * magnet held at a fixed gap is not scaled gap and all: a bigger one at the
 * same gap is stronger at the glass and reaches further; and the liquid's saturation
 * was a number in the dipole's own units, so the big magnet pulled less at
 * the edge of its reach than the magnet it stood for. The field is a
 * cylinder's now (gpu/wgsl/magnetDisc.ts, Derby and Olbert's closed form in Bulirsch's
 * elliptic integral) and the saturation a field on its scale.
 *
 * A field that looks plausible is still not the field, so this runs the
 * shader's own text (SPIKES_WGSL, which the solver and the standing layer
 * both include) on the GPU and holds what it gives to the physics, worked out
 * here independently: the field of the cylinder's side current summed by
 * Biot–Savart, loop by loop, with nothing in common with the shader's
 * algebra. Then what follows from a real magnet, read off the same shader:
 *
 *   1. the field is a cylinder magnet's, on and off its face, at its rim,
 *      and far off where the shader hands over to the dipole
 *   2. a bigger magnet at the same gap is stronger at the glass, and reaches
 *      further (the deepened dipole's axis field was the same at every Size)
 *   3. at the tool's own size it raises spikes as far out, and as strongly,
 *      as the dipole did: the default keeps today's look; and every look's
 *      own magnet, held further off, still raises none
 *   4. the solver's own energy (magnetFieldEnergy) is the field-unit law on
 *      that field, so a big magnet's pull at the edge of its spikes is a real
 *      magnet's (main's deepened dipole at Size 0.9 pulled about a third of
 *      it there)
 *   5. the plate's shortcut past the rim (spikeAmp answers far points without
 *      the integrals) stands on a bound that holds (the magnet's field there is
 *      under 1.25 times its dipole's) and never drops a point past the onset
 *   6. the TypeScript the solver ramps on (fieldOnAxis) is the shader's field
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
/** Worst of a list, where anything not a finite number is the worst there is (a NaN is never "under" a bound). */
const worstOf = (xs) => xs.reduce((w, x) => (Number.isFinite(x.err) && x.err <= w.err ? w : (Number.isFinite(x.err) ? x : { ...x, err: Infinity })), { err: -1 });

/*
  The physics, independently: a uniformly magnetised cylinder (radius a,
  thickness t, remanence 1) is a sheet of current K = M round its side, so
  its field is the Biot–Savart sum over that sheet, here nz loops of nphi
  segments. μ0 K = Br = 1, so each loop carries μ0 I = dz. At 400 × 1440 it
  agrees with the closed form to a few parts in a million, rim included.
*/
const trig = new Map();
function biotSavart(rho, z, a, t, nz = 400, nphi = 1440) {
  if (!trig.has(nphi)) trig.set(nphi, Array.from({ length: nphi }, (_, j) => [Math.cos((j + 0.5) * 2 * Math.PI / nphi), Math.sin((j + 0.5) * 2 * Math.PI / nphi)]));
  const cs = trig.get(nphi);
  let bx = 0, bz = 0;
  const dz = t / nz, dphi = 2 * Math.PI / nphi;
  for (let i = 0; i < nz; i++) {
    const rz = z - (-t / 2 + (i + 0.5) * dz);
    for (let j = 0; j < nphi; j++) {
      const [c, s] = cs[j];
      const rx = rho - a * c, ry = -a * s;
      const r2 = rx * rx + ry * ry + rz * rz, r3 = r2 * Math.sqrt(r2);
      const dlx = -a * s * dphi, dly = a * c * dphi;
      bx += dz * (dly * rz) / r3;
      bz += dz * (dlx * ry - dly * rx) / r3;
    }
  }
  return Math.hypot(bx, bz) / (4 * Math.PI);
}
/*
  And the same magnet as a point: moment m = M V at its centre, V = π a² t,
  |B| = (μ0 m / 4π) √(1 + 3 cos²θ) / R³ with μ0 M = 1. Good to (a/R)² far off;
  the shader hands over to it past eight times the magnet's half-size
  (√(a² + (t/2)²), its radius and half its length together).
*/
const pointDipole = (rho, z, a, t) => {
  const R = Math.hypot(rho, z), cos = z / R;
  return Math.PI * a * a * t / (4 * Math.PI) * Math.sqrt(1 + 3 * cos * cos) / R ** 3;
};

// The magnet's geometry, as magnetDisc.ts sets it.
const FACE = 0.06, MIN_GAP = 0.01, THICK = 4;
const gapOf = (h) => Math.max(h - FACE, MIN_GAP);
const centreOf = (h, a) => gapOf(h) + THICK * a / 2;
/** The true field at ρ off the axis, on the plate, of a magnet of radius a held at depth h. */
const trueField = (rho, h, a, n) => biotSavart(rho, centreOf(h, a), a, THICK * a, ...(n ?? []));

/*
  Main's magnet, for the before: a dipole at depth h, and Magnet Size's k
  times deeper with k³ the strength. Its field share (spikes.ts as it was)
  and its energy (fluid.ts's magnetEnergy as it was, MAGNET_BSAT 150), which
  is on the same scale as the energy now: the two agree at the hand's magnet
  on its axis by construction.
*/
const H_REF = 0.13;
const dipoleShare = (r, h, w) => {
  const q = r * r + h * h;
  return w * Math.sqrt((r * r + 4 * h * h) / q ** 4) * h ** 3 * 0.5 / (h / H_REF) ** 3;
};
const dipoleEnergy = (r, h, w) => {
  const q = r * r + h * h, b2 = (r * r + 4 * h * h) / q ** 4;
  return w * b2 / (1 + Math.sqrt(b2) / 150);
};
/*
  The energy law the liquid should follow (PLAN 9v): ψ = B²/(1 + B/Bs) with
  Bs a field, the saturation where the old 150 sat against the hand's field,
  and the scale that makes ψ at the hand's magnet what it was. Written from
  that definition, not read from the shader, which must agree with it.
*/
const G_REF = 2 / H_REF ** 3, LAW_BS = 0.9 * 150 / G_REF, LAW_E = G_REF ** 2 / 0.9;
const law = (b) => LAW_E * b * b / (1 + b / LAW_BS);

const HELD = 0.15 * (0.5 + 0.35);   // the hand's magnet at Ferrofluid Scale 0.35 (LiquidVisualizer: Magnet Height 0.15 held)
const W = 0.9;                       // its strength

const { page, close } = await openLab();
try {
  const ready = await page.evaluate(() => typeof lab.SPIKES_WGSL === 'string');
  if (!ready) throw new Error('the lab has no SPIKES_WGSL: scripts/lab-entry.ts must expose it');
  const consts = await page.evaluate(() => ({ onset: lab.SPIKE_ONSET, full: lab.SPIKE_FULL, bRef: lab.SPIKE_B_REF, radius: lab.MAGNET_RADIUS }));
  for (const [k, v] of Object.entries(consts)) if (!Number.isFinite(v) || v <= 0) throw new Error(`the lab's ${k} is ${v}`);

  /*
    The shader, run on a list of points: for each, the magnet m = (x, y,
    depth, strength) and the magnet's radius (magnetRadius(), which every
    including shader defines), and back the magnet's |B|, the share, the
    spikes' amount and the energy, exactly as the solver and the plate
    compute them.
  */
  const run = (qs) => page.evaluate(async (qs) => {
    const device = (await lab.create(64), lab.solver().device);
    const code = `${lab.SPIKES_WGSL}
struct Q { p: vec2f, radius: f32, pad: f32, m: vec4f };
@group(0) @binding(0) var<storage, read> qs: array<Q>;
@group(0) @binding(1) var<storage, read_write> outs: array<vec4f>;
var<private> R: f32;
fn magnetRadius() -> f32 { return R; }
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&qs)) { return; }
  let q = qs[i];
  R = q.radius;
  let b = magnetShare(q.p, q.m);
  outs[i] = vec4f(magnetDiscField(q.p, q.m, q.radius), b, spikeAmp(q.p, q.m), magnetFieldEnergy(b));
}`;
    const module = device.createShaderModule({ code });
    const info = await module.getCompilationInfo();
    const errs = info.messages.filter((m) => m.type === 'error');
    if (errs.length) throw new Error(errs.map((m) => `${m.lineNum}: ${m.message}`).join('\n'));
    const pipe = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
    const data = new Float32Array(qs.length * 8);
    qs.forEach((q, i) => data.set([q.x, q.y, q.radius, 0, q.mx, q.my, q.h, q.w], i * 8));
    const inBuf = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(inBuf, 0, data);
    const outBuf = device.createBuffer({ size: qs.length * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const read = device.createBuffer({ size: qs.length * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const bind = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }] });
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipe); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(Math.ceil(qs.length / 64)); pass.end();
    enc.copyBufferToBuffer(outBuf, 0, read, 0, qs.length * 16);
    device.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const out = Array.from(new Float32Array(read.getMappedRange().slice(0)));
    return qs.map((_, i) => ({ field: out[i * 4], share: out[i * 4 + 1], amp: out[i * 4 + 2], energy: out[i * 4 + 3] }));
  }, qs);
  // A point ρ off the axis of a magnet in the middle of the plate, along x.
  const at = (rho, h, a, w = W) => ({ x: 0.5 + rho, y: 0.5, radius: a, mx: 0.5, my: 0.5, h, w });
  // Exactly on the rim: the magnet at x 0 and the point at x a, so p − m is a to the last bit and γ is 0 (cel's other branch).
  const onRim = (h, a, w = W) => ({ x: a, y: 0.5, radius: a, mx: 0, my: 0.5, h, w });

  // ── 1. the field is a cylinder magnet's ──
  {
    const cases = [];
    for (const a of [0.025, 0.05, 0.1]) for (const h of [0.075, HELD, 0.27]) {
      const z = centreOf(h, a), size2 = a * a + (THICK * a / 2) ** 2;
      for (const f of [0, 0.25, 0.5, 0.9, 1, 1.1, 1.5, 2, 3, 4, 5, 7, 9, 11, 13, 16, 20]) {
        const rho = f * a, R2 = rho * rho + z * z;
        cases.push({ a, h, rho, zone: R2 <= 36 * size2 ? 'exact' : R2 >= 64 * size2 ? 'dipole' : 'blend', q: at(rho, h, a) });
      }
      cases.push({ a, h, rho: a, zone: a * a + z * z <= 36 * size2 ? 'exact' : a * a + z * z >= 64 * size2 ? 'dipole' : 'blend', rim: true, q: onRim(h, a) });
    }
    const got = await run(cases.map((c) => c.q));
    const rows = cases.map((c, i) => {
      const z = centreOf(c.h, c.a), truth = trueField(c.rho, c.h, c.a), dip = pointDipole(c.rho, z, c.a, THICK * c.a);
      return { ...c, got: got[i].field, truth, dip, err: Math.abs(got[i].field / truth - 1), dipErr: Math.abs(dip / truth - 1), vsDip: Math.abs(got[i].field / dip - 1) };
    });
    const where = (r) => `radius ${r.a}, depth ${r.h.toFixed(4)}, ${(r.rho / r.a).toFixed(2)} radii out${r.rim ? ' (on the rim exactly)' : ''}`;
    const exact = rows.filter((r) => r.zone === 'exact'), blend = rows.filter((r) => r.zone === 'blend'), dip = rows.filter((r) => r.zone === 'dipole');
    const we = worstOf(exact);
    check('the shader\'s field is a cylinder magnet\'s, on its face, at its rim and past it (Biot–Savart)', we.err < 2e-4 && exact.some((r) => r.rim),
      `${exact.length} points within six half-sizes of its centre (${exact.filter((r) => r.rim).length} exactly on the rim), worst ${(we.err * 100).toFixed(4)}% off (${where(we)})`);
    const wb = worstOf(blend.map((r) => ({ ...r, err: r.err - Math.max(r.dipErr, 0) })));
    check('where it hands over to the dipole, it is no further off than the dipole itself', blend.length > 0 && wb.err < 2e-4,
      `${blend.length} points six to eight half-sizes from its centre: worst ${(worstOf(blend).err * 100).toFixed(3)}% off, the point dipole there ${(Math.max(...blend.map((r) => r.dipErr)) * 100).toFixed(3)}%`);
    const wd = worstOf(dip.map((r) => ({ ...r, err: r.vsDip })));
    check('and past eight half-sizes it is the magnet\'s own dipole, which is the field to within 1.5%', dip.length > 0 && wd.err < 1e-4 && dip.every((r) => r.dipErr < 0.015),
      `${dip.length} points: worst ${(wd.err * 100).toFixed(4)}% from the point dipole of its volume, which is ${(Math.max(...dip.map((r) => r.dipErr)) * 100).toFixed(2)}% from Biot–Savart at worst`);
  }

  // ── 2, 3. a bigger magnet at the same gap: stronger at the glass, reaching further; the default as it was ──
  const reachOf = async (a, h, w = W) => {
    const rs = Array.from({ length: 400 }, (_, i) => i * 0.001);
    const got = await run(rs.map((r) => at(r, h, a, w)));
    if (!got.every((g) => Number.isFinite(g.share))) return { axis: NaN, reach: NaN, peak: NaN };
    const i = got.findIndex((g) => g.share < consts.onset);
    return { axis: got[0].share, peak: Math.max(...got.map((g) => g.share)), reach: i < 0 ? 0.4 : rs[i] };
  };
  const dipReach = (h, w) => { for (let r = 0; r < 0.6; r += 0.001) if (dipoleShare(r, h, w) < consts.onset) return r; return 0.6; };
  {
    const sizes = [0.5, 1, 2].map((k) => ({ k, a: consts.radius * k }));
    const now = [];
    for (const s of sizes) now.push({ ...s, ...(await reachOf(s.a, HELD)) });
    const before = sizes.map((s) => ({ k: s.k, axis: dipoleShare(0, HELD * s.k, W * s.k ** 3), reach: dipReach(HELD * s.k, W * s.k ** 3) }));
    const line = (rows) => rows.map((r) => `k ${r.k}: ${r.axis.toFixed(2)}, out to ${r.reach.toFixed(3)}`).join('; ');
    const stronger = (rows) => rows[1].axis > rows[0].axis * 1.5 && rows[2].axis > rows[1].axis * 1.2;
    const further = (rows) => rows[1].reach > rows[0].reach * 1.8 && rows[2].reach > rows[1].reach * 1.8;
    check('a bigger magnet at the same gap is stronger at the glass, and reaches further', stronger(now) && further(now) && !stronger(before),
      `on its axis, as a share of the hand's field, and how far out it raises spikes: ${line(now)} (main's deepened dipole, the same at every Size on its axis: ${line(before)})`);
    const own = now[1], was = before[1];
    check('at the tool\'s own size it raises spikes as far out and as strongly as the dipole did', Math.abs(own.reach / was.reach - 1) < 0.05 && Math.abs(own.axis / was.axis - 1) < 0.05,
      `held to the glass at Ferrofluid Scale 0.35: axis ${own.axis.toFixed(3)} against ${was.axis.toFixed(3)}, spikes out to ${own.reach.toFixed(3)} against ${was.reach.toFixed(3)}`);
    /*
      Every look's own magnet, held further off, still raises none: each
      gathers its pool flat, as a real one would, until a hand brings the
      magnet up. With the strength a field now (the pull far off goes as its
      square), Ferro Maze's went 0.3 → 0.45 and Ferro Paint's 0.5 → 0.6 to
      gather as they did; this asks they stayed under the onset doing it,
      anywhere round the magnet, at the depth the app holds it (magnetDepth).
    */
    const looks = await page.evaluate(() => lab.lookIds().map((id) => ({ id, s: lab.look(id).settings }))
      .filter((l) => (l.s.magnetStrength ?? 0) > 0 && (l.s.phaseAmount ?? 0) > 0)
      .map((l) => ({ id: l.id, w: l.s.magnetStrength, h: lab.magnetDepth(l.s.magnetHeight, l.s.phaseScale) })));
    const peaks = [];
    for (const l of looks) peaks.push((await reachOf(consts.radius, l.h, l.w)).peak);
    check('every look\'s own magnet, held further off, still raises no spikes', looks.length >= 3 && peaks.every((p) => p < consts.onset),
      looks.map((l, i) => `${l.id} ${peaks[i].toFixed(3)}`).join(', ') + ` at most, the onset ${consts.onset}`);
  }

  // ── 4. the solver's energy is the field-unit law, so a big magnet's pull at its edge is a real magnet's ──
  {
    const k = await page.evaluate(() => lab.magnetReach(0.9)), a = consts.radius * k, d = 0.002;
    const { reach } = await reachOf(a, HELD);
    const got = await run([at(reach - d, HELD, a), at(reach + d, HELD, a), at(0, HELD, a), at(0.3, 0.27, consts.radius, 0.5)]);
    const lawErr = Math.max(...got.map((g) => Math.abs(g.energy / law(g.share) - 1)));
    const pullFrom = (f) => (f(reach - d) - f(reach + d)) / (2 * d);
    const shader = (got[0].energy - got[1].energy) / (2 * d);
    const truth = pullFrom((r) => law(W * trueField(r, HELD, a, [160, 360]) / consts.bRef));
    const main = pullFrom((r) => dipoleEnergy(r, HELD * k, W * k ** 3));
    check('the solver\'s energy is the saturation law on the field (Bs a field)', Number.isFinite(lawErr) && lawErr < 1e-4,
      `ψ = B²/(1 + B/${LAW_BS.toFixed(4)}) × ${LAW_E.toFixed(0)} on the shader's field, worst ${lawErr.toExponential(1)} off, saturated and not`);
    check('so at Size 0.9 the pull at the edge of its spikes is a real magnet\'s, where main\'s was far short', Math.abs(shader / truth - 1) < 0.03 && main / truth < 0.6,
      `${reach.toFixed(3)} out: the solver's pull ${(shader / truth).toFixed(3)} of a real magnet's, main's deepened dipole ${(main / truth).toFixed(2)}`);
  }

  // ── 5. the plate's shortcut stands on a bound that holds, and never drops a spike ──
  {
    /*
      spikeAmp answers a point past 2(a + g) from the axis as flat when 1.25
      times the magnet's dipole there is under the onset. That needs the magnet's
      field there never to be more than 1.25 times its dipole's: measured
      here against Biot–Savart, for every size and gap.
    */
    let ratio = 0, ratioAt = '';
    for (const a of [0.025, 0.05, 0.1]) for (const h of [0.075, HELD, 0.27]) {
      const g = gapOf(h), z = centreOf(h, a);
      for (const f of [1, 1.1, 1.3, 1.6, 2, 3]) {
        const rho = 2 * (a + g) * f, r = trueField(rho, h, a, [160, 360]) / pointDipole(rho, z, a, THICK * a);
        if (!(r <= ratio)) { ratio = r; ratioAt = `radius ${a}, gap ${g.toFixed(4)}, ${f}× the guard`; }
      }
    }
    check('past twice the rim and gap the magnet\'s field is under 1.25 times its dipole\'s', ratio < 1.25,
      `at most ${ratio.toFixed(3)} (${ratioAt})`);
    /*
      And the shortcut itself, asked where it is tightest: strengths that put
      the onset from half the guard out to just past it, so a shortcut that cut in early, or a
      guard drawn too close, drops points that should stand.
    */
    const pts = [];
    for (const k of [0.5, 1, 2]) for (const h of [0.075, HELD]) {
      const a = consts.radius * k, g = gapOf(h), guard = 2 * (a + g);
      // Onsets from just inside the guard (where a guard drawn closer would cut) to just past it.
      const onsetAt = [0.55, 0.65, 0.8, 1.05].map((f) => guard * f);
      const units = await run(onsetAt.map((r) => at(r, h, a, 1)));
      const ws = [1.2, ...units.flatMap((u) => [1.02, 1.1].map((m) => m * consts.onset / u.share))];
      for (const w of ws) {
        for (let i = 0; i < 80; i++) {
          const r = i < 20 ? i * 0.02 : guard * (0.4 + (i - 20) * 0.0125), th = i * 2.399963;
          pts.push({ x: 0.5 + r * Math.cos(th), y: 0.5 + r * Math.sin(th), radius: a, mx: 0.5, my: 0.5, h, w });
        }
      }
    }
    const got = await run(pts);
    const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const worst = worstOf(got.map((g) => ({ err: Math.abs(g.amp - ss(consts.onset, consts.full, g.share)) })));
    const standing = got.filter((g) => g.amp > 0).length;
    check('and the shortcut never drops a spike', worst.err < 1e-4 && standing > 0,
      `${pts.length} points round magnets of three sizes, at strengths that put the onset from half the guard to just past it: spikeAmp is the share's smoothstep everywhere (${standing} standing), worst ${worst.err.toExponential(1)} off`);
  }

  // ── 6. the solver's ramp agrees with the shader ──
  {
    const rows = [[HELD, 0.05], [HELD, 0.1], [0.075, 0.025], [0.24, 0.05]];
    const got = await run(rows.map(([h, a]) => at(0, h, a)));
    const ts = await page.evaluate((rows) => rows.map(([h, a]) => lab.fieldOnAxis(0.9, h, a)), rows);
    const worst = worstOf(got.map((g, i) => ({ err: Math.abs(g.share / ts[i] - 1) })));
    check('the solver\'s ramp (fieldOnAxis) is the shader\'s field on the axis', worst.err < 1e-4,
      rows.map(([h, a], i) => `depth ${h.toFixed(3)} radius ${a}: ${ts[i].toFixed(4)} / ${got[i].share.toFixed(4)}`).join('; '));
  }
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} magnet field checks passed`);
process.exit(failed.length ? 1 : 0);
