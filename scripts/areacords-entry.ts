// Bundled into a page by scripts/lab.mjs for `npm run areacords`: the lab's
// solver (lab-entry.ts, which this imports for `window.lab`) driven by the app's
// own area cords (src/lib/areaCords.ts), read through the patch bay's own reading
// (sceneMap.ts cordReading) from synthetic bands and hits, so the check holds
// what the app lays, on the real plate, and not a copy of it.
import './lab-entry';
import { AreaHands, fluidSink, type AreaFluid } from '../src/lib/areaCords';
import { cordReading, type PatchContext } from '../src/lib/sceneMap';
import { areaDye, type PlateArea } from '../src/lib/plateAreas';
import { dyeAbsorbances } from '../src/lib/dye';
import { PALETTE_RGB } from '../src/constants';
import { AUTO_DOSE, LIQUIDS_BY_ID } from '../src/presetPlate';
import { layFinger } from '../src/lib/handSolid';
import type { SceneMapping } from '../src/types';

/**
 * A burst of one reading: on from `t0` for `dur` seconds at `level`, falling by half across it, as a hit's hold does;
 * or, `hold`, set to `level` from `t0` and kept (a note's name, hitSource.ts noteClass, which is not a level and does not fall).
 */
type Burst = { feature: string; t0: number; dur: number; level: number; hold?: boolean };

type Lab = {
  create(N: number, L: number): Promise<unknown>;
  addDye(d: Float32Array | number[]): void;
  addVel(d: Float32Array | number[]): void;
  finger(x: number, y: number, r: number, mx: number, my: number): number;
  flush(dt?: number): void;
  step(n: number, over?: Record<string, number>, flushed?: boolean): Promise<void>;
  field(which: 'dye' | 'vel'): Promise<number[]>;
  chemistry(which: 'mix' | 'rxn'): Promise<{ n: number; data: number[] } | null>;
  solver(): {
    addMix(x: number, y: number, r: number, what: { acid?: number }): void;
    addLiquidDrop(x: number, y: number, r: number, what: Record<string, number>, amount: number): void;
  };
};
const lab = (window as unknown as { lab: Lab }).lab;

/** A noise floor the gates must not fire on: a few hundredths, the same every run. */
const floor = (t: number, f: string) => 0.03 * (0.5 + 0.5 * Math.sin(t * 37.1 + f.length * 1.7));

const api = {
  /**
   * Lay `areas` as pools (each in its family's first dye), then step `seconds`
   * of show with `cords` heard through `bursts`; return the dye, and the mean
   * |velocity| and temperature over the run sampled every `every` steps. `contract`
   * is the look's dyes (palette indices).
   */
  async run(cfg: { L: number; seconds: number; areas: PlateArea[]; contract: number[]; cords: SceneMapping[]; bursts: Burst[]; over: Record<string, number>; every: number; pools: boolean; middle?: boolean; chem?: 'mix' | 'rxn'; snaps?: number[]; fill?: number }) {
    const { L, areas, contract, cords, bursts, over } = cfg;
    await lab.create(L, L);
    const dye = new Float32Array(L * L * 4), vel = new Float32Array(L * L * 4);
    if (cfg.pools) {
      for (const a of areas) {
        const c = PALETTE_RGB[areaDye(a, contract)];
        const [ar, ag, ab] = dyeAbsorbances(c.r, c.g, c.b);
        for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
          const d = Math.hypot((i + 0.5) / L - a.x, (j + 0.5) / L - a.y) / (a.r * 0.6);
          if (d >= 1) continue;
          const w = 1.2 * (1 - d * d), k = (i + j * L) * 4;
          dye[k] += ar * w; dye[k + 1] += ag * w; dye[k + 2] += ab * w; dye[k + 3] += w;
        }
      }
      lab.addDye(dye); dye.fill(0);
    }
    lab.flush(over.dt);
    await lab.step(10, over);
    const hands = new AreaHands();
    /*
      The app's own sink (fluidSink) over a stand-in plate with the visualizer's
      three methods: the deltas go where the app's FluidSimulation puts them
      (temperature in the velocity's third channel, dye as absorbances), and a
      paddle is the Finger laid as fingerDrag lays it on a thin gap (its radius
      back in cells, rounded as the app rounds it). What is laid is also kept,
      cell by cell, with no flow and no cooling: what the plate would hold if
      nothing moved it, which the measured change is held against.
    */
    const laidHeat = new Float32Array(L * L), laidDye = new Float32Array(L * L);
    /*
      And the paddle as the solver is handed it: the same solid laid again
      (layFinger, as lab.finger lays it) into a sheet of its own, read each
      step as χ·|U| in cells a step, which is the speed the liquid under it
      is gripped to (thinGap.ts). Its time mean is what the pool would move
      at if the liquid went with the solid and nothing round it moved; and
      every cell it ever covered is the part of the pool it worked.
    */
    const paddleNow = new Float32Array(L * L * 4), paddleDry = new Float32Array(L * L), swept = new Uint8Array(L * L);
    const GS = L / 128;
    const plate: AreaFluid = {
      addTemp(x, y, k) { vel[(x + y * L) * 4 + 2] += k; laidHeat[x + y * L] += k; },
      addDensity(x, y, amount, r, g, b) {
        const [ar, ag, ab] = dyeAbsorbances(r, g, b), k = (x + y * L) * 4;
        dye[k] += amount * ar; dye[k + 1] += amount * ag; dye[k + 2] += amount * ab; dye[k + 3] += amount;
        laidDye[x + y * L] += amount;
      },
      fingerDrag(x, y, radius, _strength, dx, dy, _phase, moved) {
        const r = Math.round(radius * GS), mx = moved?.x ?? dx, my = moved?.y ?? dy;
        lab.finger(x, y, r, mx, my);
        layFinger(paddleNow, L, x, y, r, mx, my);
      },
    };
    /*
      An area of a reagent pours its bottle (PLAN 25i): what the app's
      pourLiquid hands the plate (its radius, AUTO_DOSE a dose, a fresh plate's
      whole headroom), then what FluidSimulation's onDeposit does with it on
      the GPU, the two this check reads: an acid or a base into the mix's
      acidity with the indicator on, and the BZ activator through the solver's
      own addLiquidDrop, which is where the app's lands. Each drop kept, for
      the count.
    */
    const drops: { id: string; x: number; y: number; t: number }[] = [];
    let now = 0;
    const sink = fluidSink(plate, GS, (_f, id, x, y, strength) => {
      const liq = LIQUIDS_BY_ID.get(id);
      if (!liq?.behaviour) return;
      const r = Math.max(1.5, Math.max(2, Math.round((liq.injectRadius ?? 3) * GS))) / L, amount = AUTO_DOSE * strength;
      const acid = liq.behaviour.acid ?? 0;
      if (acid !== 0 && (over.phIndicator ?? 0) > 0.001) lab.solver().addMix(x / L, y / L, r, { acid: acid * Math.min(1, amount) });
      if ((liq.behaviour.bz ?? 0) > 0) lab.solver().addLiquidDrop(x / L, y / L, r, liq.behaviour as Record<string, number>, amount);
      drops.push({ id, x: x / L, y: y / L, t: now });
    });
    /*
      `middle`: the same cords, every act moved to the plate's middle, as the
      music's hands landed before areas (the before of the lit-region count).
    */
    const at = cfg.middle ? areas.map(a => ({ ...a, x: 0.5, y: 0.5 })) : areas;
    const reading = { bands: new Array(8).fill(0) } as unknown as Record<string, number> & { bands: number[] };
    const hits = { value: (f: string) => reading[f] ?? 0 };
    const ctx: PatchContext = {
      room: null, film: null, shape: null,
      sound: { features: reading } as unknown as PatchContext['sound'],
      hits: hits as unknown as PatchContext['hits'],
      roomImpact: 0, filmImpact: 0, soundImpact: 1, shapeImpact: 0,
    };
    const DT = 1 / 60;
    const steps = Math.round(cfg.seconds / DT);
    const speed = new Float32Array(L * L), temp = new Float32Array(L * L), heatDry = new Float32Array(L * L);
    let samples = 0;
    const trace: { t: number; env: number[] }[] = [];
    const snaps: number[][] = [];
    const snapAt = new Set((cfg.snaps ?? []).map(t => Math.round(t / DT)));
    for (let s = 0; s < steps; s++) {
      const t = s * DT;
      now = t;
      if (snapAt.has(s)) snaps.push(Array.from(await lab.field('dye')));
      for (let b = 0; b < 8; b++) reading.bands[b] = floor(t, `band${b + 1}`);
      for (const f of ['kickHit', 'snareHit', 'hatsHit']) reading[f] = floor(t, f);
      for (const b of bursts) {
        if (b.hold) { if (t >= b.t0) reading[b.feature] = b.level; continue; }
        if (t < b.t0 || t >= b.t0 + b.dur) continue;
        const v = b.level * (1 - 0.5 * (t - b.t0) / b.dur);
        const band = /^band(\d)$/.exec(b.feature);
        if (band) reading.bands[Number(band[1]) - 1] = Math.max(reading.bands[Number(band[1]) - 1], v);
        else reading[b.feature] = Math.max(reading[b.feature] ?? 0, v);
      }
      const acts = hands.step(cords, at, (m) => cordReading(ctx, m, 0), DT);
      hands.lay(sink, L, DT, (a, k) => PALETTE_RGB[areaDye(a, contract, 0, k)], cfg.fill ?? 0);
      if (s % 6 === 0) trace.push({ t, env: acts.map(a => a.amount) });
      for (let i = 0; i < L * L; i++) if (paddleNow[i * 4 + 2] > 0) swept[i] = 1;
      lab.addDye(dye); lab.addVel(vel); dye.fill(0); vel.fill(0);
      lab.flush(over.dt);
      await lab.step(1, over, true);
      if (s % cfg.every === cfg.every - 1) {
        const v = await lab.field('vel');
        for (let i = 0; i < L * L; i++) {
          speed[i] += Math.hypot(v[i * 4], v[i * 4 + 1]); temp[i] += v[i * 4 + 2]; heatDry[i] += laidHeat[i];
          paddleDry[i] += Math.hypot(paddleNow[i * 4], paddleNow[i * 4 + 1]);
        }
        samples++;
      }
      paddleNow.fill(0);
    }
    for (let i = 0; i < L * L; i++) { speed[i] /= Math.max(1, samples); temp[i] /= Math.max(1, samples); heatDry[i] /= Math.max(1, samples); paddleDry[i] /= Math.max(1, samples); }
    return {
      dye: Array.from(await lab.field('dye')),
      speed: Array.from(speed), temp: Array.from(temp),
      laidDye: Array.from(laidDye), heatDry: Array.from(heatDry),
      paddleDry: Array.from(paddleDry), swept: Array.from(swept),
      fires: cords.map(m => hands.fires(m)),
      trace, drops, snaps,
      chem: cfg.chem ? await lab.chemistry(cfg.chem) : null,
    };
  },
};

(window as unknown as { areas: typeof api }).areas = api;
