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
import type { SceneMapping } from '../src/types';

/** A burst of one reading: on from `t0` for `dur` seconds at `level`, falling by half across it, as a hit's hold does. */
type Burst = { feature: string; t0: number; dur: number; level: number };

type Lab = {
  create(N: number, L: number): Promise<unknown>;
  addDye(d: Float32Array | number[]): void;
  addVel(d: Float32Array | number[]): void;
  finger(x: number, y: number, r: number, mx: number, my: number): number;
  flush(dt?: number): void;
  step(n: number, over?: Record<string, number>, flushed?: boolean): Promise<void>;
  field(which: 'dye' | 'vel'): Promise<number[]>;
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
  async run(cfg: { L: number; seconds: number; areas: PlateArea[]; contract: number[]; cords: SceneMapping[]; bursts: Burst[]; over: Record<string, number>; every: number; pools: boolean; middle?: boolean }) {
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
    const GS = L / 128;
    const plate: AreaFluid = {
      addTemp(x, y, k) { vel[(x + y * L) * 4 + 2] += k; laidHeat[x + y * L] += k; },
      addDensity(x, y, amount, r, g, b) {
        const [ar, ag, ab] = dyeAbsorbances(r, g, b), k = (x + y * L) * 4;
        dye[k] += amount * ar; dye[k + 1] += amount * ag; dye[k + 2] += amount * ab; dye[k + 3] += amount;
        laidDye[x + y * L] += amount;
      },
      fingerDrag(x, y, radius, _strength, dx, dy, _phase, moved) { lab.finger(x, y, Math.round(radius * GS), moved?.x ?? dx, moved?.y ?? dy); },
    };
    const sink = fluidSink(plate, GS);
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
    for (let s = 0; s < steps; s++) {
      const t = s * DT;
      for (let b = 0; b < 8; b++) reading.bands[b] = floor(t, `band${b + 1}`);
      for (const f of ['kickHit', 'snareHit', 'hatsHit']) reading[f] = floor(t, f);
      for (const b of bursts) {
        if (t < b.t0 || t >= b.t0 + b.dur) continue;
        const v = b.level * (1 - 0.5 * (t - b.t0) / b.dur);
        const band = /^band(\d)$/.exec(b.feature);
        if (band) reading.bands[Number(band[1]) - 1] = Math.max(reading.bands[Number(band[1]) - 1], v);
        else reading[b.feature] = Math.max(reading[b.feature] ?? 0, v);
      }
      const acts = hands.step(cords, at, (m) => cordReading(ctx, m, 0), DT);
      hands.lay(sink, L, DT, (a, k) => PALETTE_RGB[areaDye(a, contract, 0, k)]);
      if (s % 6 === 0) trace.push({ t, env: acts.map(a => a.amount) });
      lab.addDye(dye); lab.addVel(vel); dye.fill(0); vel.fill(0);
      lab.flush(over.dt);
      await lab.step(1, over, true);
      if (s % cfg.every === cfg.every - 1) {
        const v = await lab.field('vel');
        for (let i = 0; i < L * L; i++) { speed[i] += Math.hypot(v[i * 4], v[i * 4 + 1]); temp[i] += v[i * 4 + 2]; heatDry[i] += laidHeat[i]; }
        samples++;
      }
    }
    for (let i = 0; i < L * L; i++) { speed[i] /= Math.max(1, samples); temp[i] /= Math.max(1, samples); heatDry[i] /= Math.max(1, samples); }
    return {
      dye: Array.from(await lab.field('dye')),
      speed: Array.from(speed), temp: Array.from(temp),
      laidDye: Array.from(laidDye), heatDry: Array.from(heatDry),
      fires: cords.map(m => hands.fires(m)),
      trace,
    };
  },
};

(window as unknown as { areas: typeof api }).areas = api;
