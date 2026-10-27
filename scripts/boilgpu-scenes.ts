// The dishes `npm run boilgpu` steps, and what it reads off them each step
// (PLAN 36e-2). One module, run twice: in the lab page against the GPU solver
// (or the control, scripts/boilgpu-cpu.ts), and in node against the CPU
// reference in the same contract, so the two are stepped by the same code and
// read by the same code, and only the solver differs. It imports neither: the
// solver is handed in as `make`. The bars, and every number they are held to,
// are in scripts/boilgpu.mjs; this file measures and returns plain numbers.
//
// The dishes are boil.mjs's, with its options, seeds, steps and holds, except
// where boilgpu.mjs says a float32 store needs a longer step to be read at all.

export type Arr = ArrayLike<number>;
export interface Fields { T: Arr; alpha: Arr; u: Arr; v: Arr; source: Arr; starts: Arr; dTnuc: Arr }
export interface Controls { heat?: number; holds?: { x: number; y: number; r: number }[]; tilt?: number; g?: number }
export interface Plate {
  n: number;
  write(f: Record<string, Float32Array>): void | Promise<void>;
  step(dt: number, c: Controls): void | Promise<void>;
  read(): Promise<Fields>;
  destroy?(): void;
}
export type Options = Record<string, unknown> & { n?: number; width?: number; radius?: number; gap?: number; glass?: number; ambient?: number;
  lampIrradiance?: number; lampWidth?: number; lampCentre?: [number, number]; hForced?: number; hNatural?: number; emissivity?: number };
export type Make = (o: Options) => Plate | Promise<Plate>;

const RHO_C = 4.18e6, RHO_C_GLASS = 2500 * 840, LATENT_V = 0.598 * 2.257e6, SB = 5.670374e-8;
/** A cell with no nucleation site: Infinity, or anything from T_HOM − T_SAT up (the contract). */
export const NO_SITE = 200;

export function geometry(o: Options) {
  const n = o.n ?? 64, width = o.width ?? 0.1, dx = width / n, radius = o.radius ?? 0.45 * width;
  const xy = (k: number): [number, number] => [((k % n) + 0.5) * dx - width / 2, (((k / n) | 0) + 0.5) * dx - width / 2];
  const inside = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) inside[k] = Math.hypot(...xy(k)) < radius ? 1 : 0;
  return { n, width, dx, radius, xy, inside };
}
type Geo = ReturnType<typeof geometry>;

const field = (g: Geo, f: (x: number, y: number, k: number) => number) => {
  const a = new Float32Array(g.n * g.n);
  for (let k = 0; k < g.n * g.n; k++) a[k] = f(...g.xy(k), k);
  return a;
};
const vapour = (g: Geo, F: Fields) => { let s = 0; for (let k = 0; k < g.n * g.n; k++) if (g.inside[k]) s += F.alpha[k]; return s * g.dx * g.dx; };
const fastest = (F: Fields) => { let m = 0; for (let i = 0; i < F.u.length; i++) m = Math.max(m, Math.abs(F.u[i])); for (let i = 0; i < F.v.length; i++) m = Math.max(m, Math.abs(F.v[i])); return m; };
const started = (F: Fields) => { let s = 0; for (let k = 0; k < F.starts.length; k++) s += F.starts[k]; return s; };
const arr = (a: Arr) => Array.from(a);

/** Every cell's ∇·u against the source the step asked for, as a share of the largest source. */
function divergence(g: Geo, F: Fields) {
  const { n, dx } = g;
  let smax = 0, e = 0;
  for (let k = 0; k < n * n; k++) if (g.inside[k]) smax = Math.max(smax, Math.abs(F.source[k]));
  for (let k = 0; k < n * n; k++) {
    if (!g.inside[k]) continue;
    const i = k % n, j = (k / n) | 0;
    const div = (F.u[j * (n + 1) + i + 1] - F.u[j * (n + 1) + i] + F.v[(j + 1) * n + i] - F.v[j * n + i]) / dx;
    e = Math.max(e, Math.abs(div - F.source[k]));
  }
  return smax > 0 ? e / smax : -1;
}

/** The dish's heat over the room: sensible in liquid and glass, latent in its steam (J). */
function dishEnergy(g: Geo, o: Options, F: Fields) {
  const amb = o.ambient ?? 20, gap = o.gap ?? 1e-3, glass = o.glass ?? 2e-3;
  let E = 0;
  for (let k = 0; k < g.n * g.n; k++) {
    if (!g.inside[k]) continue;
    const a = F.alpha[k], C = (1 - a) * RHO_C * gap + RHO_C_GLASS * glass;
    E += (C * (F.T[k] - amb) + a * LATENT_V * gap) * g.dx * g.dx;
  }
  return E;
}

/*
  boil.mjs's ledger, step by step: the lamp's infrared band (the dishes it is
  kept on have no dye), the air, the glass faces' radiation, conduction into
  the rim and what the flow carries out of it, each from the options and the
  fields before and after the step.
*/
function ledger(g: Geo, o: Options, first: Fields) {
  const amb = o.ambient ?? 20, gap = o.gap ?? 1e-3, glass = o.glass ?? 2e-3, eps = o.emissivity ?? 0.9;
  const I0 = o.lampIrradiance ?? 8000, sig = o.lampWidth ?? 0.02, [lx, ly] = o.lampCentre ?? [0, 0];
  const hF = o.hForced ?? 50, hN = o.hNatural ?? 10, kIR = (o.kappaIR as number | undefined) ?? 600, fv = (o.visibleFraction as number | undefined) ?? 0.12;
  const { n, dx, inside } = g;
  let T0 = Float64Array.from(first.T), A0 = Float64Array.from(first.alpha);
  const L = { gained: 0, lost: 0 };
  const each = (Q: Fields, dt: number, c: Controls) => {
    for (let k = 0; k < n * n; k++) {
      if (!inside[k]) continue;
      const [x, y] = g.xy(k);
      const a = A0[k], Tm = 0.5 * (T0[k] + Q.T[k]);
      const I = I0 * Math.exp(-((x - lx) ** 2 + (y - ly) ** 2) / (2 * sig * sig)) * (c.heat ?? 0);
      L.gained += I * (1 - fv) * (1 - Math.exp(-kIR * gap * (1 - a))) * dx * dx * dt;
      const held = (c.holds ?? []).some((hd) => Math.hypot(x - hd.x, y - hd.y) < hd.r);
      const air = (held ? hN : hF) * (Tm - amb);
      const rad = 2 * eps * SB * 0.5 * ((T0[k] + 273.15) ** 4 + (Q.T[k] + 273.15) ** 4 - 2 * (amb + 273.15) ** 4);
      L.lost += (air + rad) * dx * dx * dt;
      const i = k % n, j = (k / n) | 0;
      const Kk = 0.6 * gap * (1 - a) + 1.0 * glass, K0 = 0.6 * gap + 1.0 * glass;
      const faces: [number, number, number][] = [[i + 1, j, Q.u[j * (n + 1) + i + 1]], [i - 1, j, -Q.u[j * (n + 1) + i]], [i, j + 1, Q.v[(j + 1) * n + i]], [i, j - 1, -Q.v[j * n + i]]];
      for (const [ii, jj, w] of faces) {
        if (ii >= 0 && jj >= 0 && ii < n && jj < n && inside[jj * n + ii]) continue;
        L.lost += ((2 * Kk * K0) / (Kk + K0)) * (T0[k] - amb) * dt;
        if (w > 0) L.lost += w * dx * gap * (RHO_C * (1 - a) * (Tm - amb) + a * LATENT_V) * dt;
      }
    }
    T0 = Float64Array.from(Q.T); A0 = Float64Array.from(Q.alpha);
  };
  return { L, each };
}

async function plate(make: Make, o: Options, f: Record<string, Float32Array> = {}) {
  const P = await make(o);
  const g = geometry(o);
  if (P.n !== g.n) throw new Error(`the plate has ${P.n} cells across, asked for ${g.n}`);
  if (Object.keys(f).length) await P.write(f);
  return { P, g };
}
/** Step `seconds` at `dt`, reading after every step when `each` is given. */
async function run(P: Plate, seconds: number, dt: number, c: Controls, each?: (F: Fields, s: number) => void) {
  const steps = Math.round(seconds / dt);
  for (let s = 1; s <= steps; s++) {
    await P.step(dt, c);
    if (each) each(await P.read(), s);
  }
}

// ── The dishes ─────────────────────────────────────────────────────────────

export const H1_DISH: Options = { n: 48, gap: 0.5e-3, glass: 1e-3, lampIrradiance: 20000, lampWidth: 0.015,
  lampCentre: [0.012, -0.006], kappaIR: 600, visibleFraction: 0.12, hForced: 50 };
export const DISH: Options = { n: 48, gap: 0.5e-3, glass: 1e-3, lampIrradiance: 22000, lampWidth: 0.03,
  hForced: 50, hNatural: 10, cavityRadius: 5e-6, cavitySpread: 0.3, siteDensity: 7e4, interfaceH: 1e4, seed: 3 };
export const HAND = { x: 0.015, y: 0, r: 0.012 };
export const LAMP_DT = 0.01;

export const scenes: Record<string, (make: Make, arg?: any) => Promise<any>> = {
  /* H1, H2 and the first step and second of the model: the lamp on a dish with a dye patch. */
  async lamp(make) {
    const g = geometry(H1_DISH);
    const dye = field(g, (x, y) => (Math.hypot(x + 0.02, y - 0.01) < 0.008 ? 1.5 : 0));
    const one = async (heat: number, dyed: boolean) => {
      const { P } = await plate(make, H1_DISH, dyed ? { dye } : {});
      await P.step(LAMP_DT, { heat });
      const F = await P.read();
      P.destroy?.();
      return { T: arr(F.T), fastest: fastest(F), u: arr(F.u), v: arr(F.v) };
    };
    const full = await one(1, true), half = await one(0.5, true), off = await one(0, true), clear = await one(1, false);
    const { P } = await plate(make, H1_DISH, { dye });
    let second: Fields | null = null;
    await run(P, 1, 0.05, { heat: 1 }, (F, s) => { if (s === 20) second = F; });
    P.destroy?.();
    const S = second as unknown as Fields;
    return { dye: arr(dye), full, half, off, clear, second: { T: arr(S.T), u: arr(S.u), v: arr(S.v) } };
  },

  /* H3: a warm dish cooling under the fan and under a held hand. */
  async air(make) {
    const o = { n: 48, gap: 0.5e-3, glass: 1e-3, hForced: 50, hNatural: 10 };
    const g = geometry(o);
    const { P } = await plate(make, o, { T: field(g, (_x, _y, k) => (g.inside[k] ? 60 : 20)) });
    await run(P, 10, 0.1, { heat: 0, holds: [HAND] });
    const F = await P.read();
    P.destroy?.();
    const pick = (x: number, y: number) => Math.floor((y + g.width / 2) / g.dx) * g.n + Math.floor((x + g.width / 2) / g.dx);
    return { fan: F.T[pick(-0.015, 0)], held: F.T[pick(0.015, 0)] };
  },

  /* H3: a Gaussian warm bump with no air spreading by conduction. */
  async bump(make) {
    const o = { n: 48, gap: 0.5e-3, glass: 1e-3, hForced: 0, hNatural: 0, emissivity: 0 };
    const g = geometry(o), s0 = 3 * g.dx, c = (g.n / 2) * g.n + g.n / 2, [cx, cy] = g.xy(c);
    const { P } = await plate(make, o, { T: field(g, (x, y, k) => (g.inside[k] ? 20 + 10 * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s0 * s0)) : 20)) });
    await run(P, 40, 0.1, { heat: 0 });
    const F = await P.read();
    P.destroy?.();
    return { peak: F.T[c], s0 };
  },

  /* H4: a warm patch on an upright and a level plate. */
  async rise(make) {
    const o = { n: 96, width: 0.1, gap: 1e-3 }, g = geometry(o), a = 10 * g.dx;
    const patch = (T: number) => plate(make, o, { T: field(g, (x, y) => (Math.hypot(x, y) < a ? T : 20)) });
    const first = async (T: number) => {
      const { P } = await patch(T);
      await P.step(1e-4, { heat: 0, tilt: Math.PI / 2 });
      const F = await P.read();
      P.destroy?.();
      return -F.v[(g.n / 2) * g.n + g.n / 2];   // the face above the centre cell; up is −y
    };
    const u40 = await first(40), u70 = await first(70);
    const L = (await patch(70)).P, U = (await patch(70)).P;
    const T0 = arr((await L.read()).T);
    await run(L, 5, 0.05, { heat: 0, tilt: 0 });
    let second: Arr = [];
    await run(U, 5, 0.05, { heat: 0, tilt: Math.PI / 2 }, (F, s) => { if (s === 20) second = arr(F.T); });
    const level = arr((await L.read()).T), upright = arr((await U.read()).T);
    L.destroy?.(); U.destroy?.();
    return { a, u40, u70, T0, level, upright, second };
  },

  /* H6: the plate's own sites, and the threshold on them. */
  async sites(make) {
    const o = { n: 48, cavityRadius: 5e-6, cavitySpread: 0.3, siteDensity: 2e5, hForced: 0, hNatural: 0, emissivity: 0, seed: 7 };
    const g = geometry(o);
    const own = await (await plate(make, o)).P.read();
    const dTnuc = arr(own.dTnuc);
    const at = async (frac: number) => {
      const { P } = await plate(make, o, { T: field(g, (_x, _y, k) => (!g.inside[k] ? 20 : dTnuc[k] < NO_SITE ? 100 + frac * dTnuc[k] : 130)) });
      await P.step(1e-4, {});
      const F = await P.read();
      P.destroy?.();
      return { starts: arr(F.starts), vapour: vapour(g, F) };
    };
    return { dTnuc, inside: arr(g.inside), dx: g.dx, under: await at(0.98), over: await at(1.02) };
  },

  /* H8: a bubble's rim, both ways, on a dish and reservoir 10 K over and under the boil. */
  async rim(make, { T, dt }: { T: number; dt: number }) {
    const o = { n: 32, gap: 0.5e-3, glass: 1e-3, ambient: T, hForced: 0, hNatural: 0, interfaceH: 1e4 };
    const g = geometry(o), c = (g.n / 2) * g.n + g.n / 2;
    const { P } = await plate(make, o, { T: field(g, () => T), alpha: field(g, (_x, _y, k) => (g.inside[k] ? 0.3 : 0)) });
    await P.step(dt, { heat: 0 });
    const F = await P.read();
    P.destroy?.();
    return { T: F.T[c], alpha: F.alpha[c], dx: g.dx };
  },

  /*
    H6's nucleus, on its own: one site (5 K) in a dish and reservoir at 102% of
    it, so nothing else moves, stepped 10 µs. The cell starts a bubble as wide as
    the gap, and pays the steam's latent heat for it out of its own.
  */
  async nucleus(make) {
    const T = 105.1, o = { n: 32, gap: 0.5e-3, glass: 1e-3, ambient: T, hForced: 0, hNatural: 0, emissivity: 0 };
    const g = geometry(o), c = (g.n / 2) * g.n + g.n / 2;
    const { P } = await plate(make, o, { T: field(g, () => T), dTnuc: field(g, (_x, _y, k) => (k === c ? 5 : Infinity)) });
    await P.step(1e-5, { heat: 0 });
    const F = await P.read();
    P.destroy?.();
    let elsewhere = 0;
    for (let k = 0; k < g.n * g.n; k++) if (k !== c) elsewhere = Math.max(elsewhere, F.starts[k]);
    return { T: F.T[c], alpha: F.alpha[c], starts: F.starts[c], elsewhere, dx: g.dx };
  },

  /*
    H5, H7, H8, H9 and the model's course: five minutes of the lamp and the fan,
    a minute of a hand held off the lamp's centre, and thirty seconds after it
    lifts. `dTnuc` is the reference's sites, written so the two dishes boil from
    the same cavities.
  */
  async dish(make, dTnuc: number[]) {
    const g = geometry(DISH), { n, dx } = g;
    const { P } = await plate(make, DISH, { dTnuc: Float32Array.from(dTnuc) });
    let tmax = 0, pushed = 0, levelSpeed = 0;
    await run(P, 300, 0.1, { heat: 1 }, (F) => {
      levelSpeed = Math.max(levelSpeed, fastest(F));
      for (let k = 0; k < n * n; k++) {
        if (!g.inside[k]) continue;
        tmax = Math.max(tmax, F.T[k]);
        const i = k % n, j = (k / n) | 0;
        pushed += (F.u[j * (n + 1) + i + 1] - F.u[j * (n + 1) + i] + F.v[(j + 1) * n + i] - F.v[j * n + i]) * dx * 0.1;
      }
    });
    const warm = await P.read();
    const fan = { starts: started(warm), tmax, pushed, levelSpeed, T: arr(warm.T) };

    const hold = { heat: 1, holds: [HAND] }, lift = { heat: 1, holds: [] };
    const E0 = dishEnergy(g, DISH, warm), book = ledger(g, DISH, warm);
    let first = -1, peakV = 0, peakU = 0, hotLiquid = 0, overSite = -Infinity, divWorst = 0, divSteps = 0;
    let firstStarts: number[] = [];
    const vap: number[] = [];
    const div = (F: Fields) => { const e = divergence(g, F); if (e >= 0) { divWorst = Math.max(divWorst, e); divSteps++; } };
    let held: Fields = warm;
    await run(P, 60, 0.1, hold, (F, s) => {
      div(F); book.each(F, 0.1, hold); vap.push(vapour(g, F)); held = F;
      if (first < 0 && started(F) > 0) { first = s * 0.1; firstStarts = arr(F.starts); }
      if (first < 0) return;
      peakV = Math.max(peakV, vapour(g, F)); peakU = Math.max(peakU, fastest(F));
      if (s * 0.1 - first <= 5) return;
      for (let k = 0; k < n * n; k++) {
        if (!g.inside[k]) continue;
        if (F.alpha[k] === 0 && F.dTnuc[k] < NO_SITE) overSite = Math.max(overSite, F.T[k] - (100 + F.dTnuc[k]));
        const [x, y] = g.xy(k);
        if (Math.hypot(x - HAND.x, y - HAND.y) < HAND.r) hotLiquid = Math.max(hotLiquid, F.T[k]);
      }
    });
    const starts = arr(held.starts), startsHeld = started(held);
    let calmV = -1, calmU = -1, last: Fields = held;
    await run(P, 30, 0.1, lift, (F, s) => {
      div(F); book.each(F, 0.1, lift); vap.push(vapour(g, F)); last = F;
      if (calmV < 0 && vapour(g, F) < 0.01 * peakV) calmV = s * 0.1;
      if (calmU < 0 && fastest(F) < 0.02 * peakU) calmU = s * 0.1;
    });
    P.destroy?.();
    return {
      fan, first, firstStarts, starts, startsHeld, startsAfter: started(last) - startsHeld, peakV, peakU, hotLiquid, overSite,
      calmV, calmU, vap, dE: dishEnergy(g, DISH, last) - E0, gained: book.L.gained, lost: book.L.lost, divWorst, divSteps,
    };
  },

  /* H5, H10: the Heat dial on a hotter lamp, through a boil that dries cells out. */
  async hotter(make, dTnuc: number[]) {
    const o = { ...DISH, lampIrradiance: 40000 }, g = geometry(o);
    const { P } = await plate(make, o, { dTnuc: Float32Array.from(dTnuc) });
    await run(P, 120, 0.1, { heat: 0.5 });
    const warm = await P.read(), half = started(warm);
    const on = { heat: 1 }, off = { heat: 0 };
    const E0 = dishEnergy(g, o, warm), book = ledger(g, o, warm);
    let first = -1, peak = 0, dry = 0, divWorst = 0, divSteps = 0, last: Fields = warm;
    await run(P, 60, 0.1, on, (F, s) => {
      const e = divergence(g, F); if (e >= 0) { divWorst = Math.max(divWorst, e); divSteps++; }
      book.each(F, 0.1, on);
      if (first < 0 && started(F) > half) first = s * 0.1;
      peak = Math.max(peak, vapour(g, F));
      for (let k = 0; k < g.n * g.n; k++) if (F.alpha[k] >= 0.9) dry++;
    });
    let calm = -1;
    await run(P, 10, 0.1, off, (F, s) => { book.each(F, 0.1, off); last = F; if (calm < 0 && vapour(g, F) < 0.01 * peak) calm = s * 0.1; });
    P.destroy?.();
    return { half, first, peak, dry, calm, dE: dishEnergy(g, o, last) - E0, gained: book.L.gained, lost: book.L.lost, divWorst, divSteps };
  },

  /* H11: a pocket of steam in a dish and a reservoir both at 100 °C. */
  async pocket(make) {
    const o = { ...DISH, n: 40, ambient: 100, hForced: 0, hNatural: 0 }, g = geometry(o);
    const a0 = field(g, (x, y, k) => (g.inside[k] && Math.hypot(x, y) < 0.008 ? 0.5 : 0));
    const c = (A: Arr) => { let sx = 0, sy = 0, w = 0; for (let k = 0; k < g.n * g.n; k++) { const [x, y] = g.xy(k); sx += A[k] * x; sy += A[k] * y; w += A[k]; } return [sx / w, sy / w]; };
    const go = async (tilt: number) => {
      const { P } = await plate(make, o, { T: field(g, () => 100), alpha: a0 });
      await run(P, 1, 0.02, { heat: 0, tilt });
      const F = await P.read();
      P.destroy?.();
      const [x0, y0] = c(a0), [x1, y1] = c(F.alpha);
      return { dy: (y1 - y0) / g.dx, d: Math.hypot(x1 - x0, y1 - y0) / g.dx, alpha: arr(F.alpha) };
    };
    return { a0: arr(a0), up: await go(Math.PI / 2), flat: await go(0) };
  },

  /*
    The model's boil, a second of it cell by cell: a dish 97 °C at the edge and
    103 °C under the hand, steam at α 0.3 under it, the lamp on and the hand
    held, and no sites (so the second is the rims', the latent heat's, the
    vapour's volume and the flow's, and not which cell crossed its threshold
    in which rounding).
  */
  async boil(make) {
    const g = geometry(DISH);
    const near = (x: number, y: number) => Math.hypot(x - HAND.x, y - HAND.y);
    const T = field(g, (x, y, k) => (g.inside[k] ? 97 + 6 * Math.exp(-(near(x, y) ** 2) / (2 * 0.012 ** 2)) : 20));
    const alpha = field(g, (x, y, k) => (g.inside[k] && near(x, y) < 0.008 ? 0.3 : 0));
    const { P } = await plate(make, DISH, { T, alpha, dTnuc: field(g, () => Infinity) });
    const out: Record<number, { T: number[]; alpha: number[]; u: number[]; v: number[] }> = {};
    await run(P, 1, 0.1, { heat: 1, holds: [HAND] }, (F, s) => {
      if (s === 1 || s === 10) out[s] = { T: arr(F.T), alpha: arr(F.alpha), u: arr(F.u), v: arr(F.v) };
    });
    P.destroy?.();
    return { T0: arr(T), alpha0: arr(alpha), one: out[1], ten: out[10] };
  },
};
