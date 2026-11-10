/**
 * The frame loop's side of the ink title (PLAN 37x-10; the title itself and
 * its wash are `inkTitle.ts`): a title asked for is rasterised once and
 * poured at the next step, and the wash is added to every step after it
 * until it has passed. Plain functions over one state object the visualizer
 * keeps in a ref, so the frame loop gains a call and no objects (CLAUDE.md,
 * "No ceremony in the frame"; its own module, 19ai-10).
 *
 * Every title on the plate comes through here: the identified song's
 * (`app/useInkTitle.ts`, when the Live Show's Title switch is on), a song
 * show's title card and sign-off (`app/useSongScore.ts`), and the words a
 * phone, the show server or the owner's assistant pours in a live set (the
 * `pour-text` message, 37x-10c and 37x-10d). Before this the words were a
 * picture laid into the CPU's arrays at 192² and left for the plate's own
 * flow; now they are ink at the solver's grid and the wash takes them.
 */
import { PALETTE_RGB } from '../constants';
import { inkTitleMask, inkTitleInk, inkTitleWash, inkHex, INK_TITLE_DENSITY, inkTitlePad, inkTitleCarrier, inkTitleRinse, inkTitleRinseRadius, INK_TITLE_RINSE_POINTS, type InkRow } from './inkTitle';
import { thicknessViscosity } from './turntable';

/** What of a plate a title needs: FluidSimulation's face. */
export interface InkTitleTarget {
  size: number;
  gpu: {
    readonly N: number;
    readonly thinGapLive?: boolean;
    pourInk?(mask: Float32Array, n: number, rgb: readonly number[], density: number, carrier?: { share: number; lnNu: number; index: number; mask?: Float32Array }): boolean;
    pour?(x: number, y: number, radius: number, take: number, sp: null, volume?: boolean): void;
  } | null;
  addDensity(x: number, y: number, amount: number, r?: number, g?: number, b?: number): void;
  addVelocity(x: number, y: number, vx: number, vy: number): void;
  meanColor: readonly number[];
  meanDensity: number;
}

/** The settings a title reads (VisualizerSettings' five, and the plate's Thickness for its ink's). */
export interface InkTitleSettings {
  gapThickness?: number;
  inkTitleColor?: string;
  inkTitleSize?: number;
  inkTitleY?: number;
  inkTitleSweep?: number;
}

export interface InkTitleRun {
  /** A title asked for and not yet poured. */
  pending: { rows: InkRow[]; colour: string | undefined } | null;
  /** The title on the plate, its box in plate fractions, while its wash runs. */
  box: number[] | null;
  /** Seconds since it landed. */
  since: number;
  /** The wash's deltas, L × L × 4, reused step to step. */
  vel: Float32Array;
  /** The rinse's pours of a step, (x, y, take) a point (PLAN 37x-10g), reused step to step. */
  rinse: Float32Array;
}

export const newInkTitleRun = (): InkTitleRun => ({ pending: null, box: null, since: 0, vel: new Float32Array(0), rinse: new Float32Array(INK_TITLE_RINSE_POINTS * 3) });

/**
 * Ask for a title: poured at the plate's next step. `colour` is '' for the
 * look's first colour, a '#rrggbb', 'contrast' (dark ink on a bright plate,
 * the look's colour on a dark one, as the title card asked for before), or
 * left out for the Title colour setting.
 */
export function queueInkTitle(run: InkTitleRun, rows: readonly InkRow[], colour?: string): void {
  if (rows.some((r) => r.text.trim())) run.pending = { rows: rows.map((r) => ({ ...r })), colour };
}

const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** The ink's colour, 0..1: the asked-for colour, the setting's, or the look's first (`palette` its dye numbers). */
function inkColour(asked: string | undefined, setting: string, fluid: InkTitleTarget, palette: readonly number[]): [string, number[][]] {
  const pal = palette.map((i) => PALETTE_RGB[i]).filter(Boolean).map((c) => [c.r, c.g, c.b]);
  let colour = asked ?? setting;
  if (colour === 'contrast') {
    // As the title card's was (lib/songShows.ts): dark letters on a bright plate, the look's own colour on a dark one.
    const bright = Math.min(1, fluid.meanDensity) > 0.25 && lum(fluid.meanColor) > 0.3;
    colour = bright ? '#0e0e12' : '';
  }
  return [colour, pal];
}

/**
 * One step of the plate (`seconds` long). A title waiting is poured, at the
 * solver's own grid through `pourInk` (or laid through the CPU's arrays on a
 * plate without the WebGPU solver); a title on the plate gets the wash's
 * push for this step, on the rows it lies in only. Nothing at all when no
 * title is asked for or up, which is every step of a show without titles.
 * `palette` is the look's dye numbers, `angle` the plate's own turn.
 */
export function stepInkTitle(run: InkTitleRun, fluid: InkTitleTarget | null | undefined, s: InkTitleSettings, seconds: number, palette: readonly number[], angle: number): void {
  if (!fluid || (!run.pending && !run.box)) return;
  const L = fluid.size;
  if (run.pending) {
    const { rows, colour: asked } = run.pending;
    run.pending = null;
    const [colour, pal] = inkColour(asked, s.inkTitleColor ?? '', fluid, palette);
    const size = s.inkTitleSize ?? 0.5, y = s.inkTitleY ?? 0.5;
    const gpu = fluid.gpu;
    const n = gpu?.pourInk ? gpu.N : L;
    const { mask, box } = inkTitleMask(rows, size, y, n, angle);
    if (box[2] <= box[0]) return;
    const rgb = inkTitleInk(colour, pal);
    // On a thin gap the ink is made up thick, on a pad under its letters (PLAN 37x-10g, inkTitle.ts).
    const carrier = gpu?.pourInk && gpu.thinGapLive
      ? inkTitleCarrier(thicknessViscosity(s.gapThickness ?? 0.45), inkTitlePad(mask, n, box)) : undefined;
    if (!gpu?.pourInk?.(mask, n, rgb, INK_TITLE_DENSITY, carrier)) {
      // The CPU's arrays take a colour and make the absorbance themselves (addDensity), at the logical grid.
      const m = n === L ? mask : inkTitleMask(rows, size, y, L, angle).mask;
      const c = inkHex(colour) ?? pal[0] ?? [0.1, 0.1, 0.12];
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const v = m[i + j * L];
        if (v > 0.004) fluid.addDensity(i, j, v * INK_TITLE_DENSITY, c[0], c[1], c[2]);
      }
    }
    run.box = box;
    run.since = 0;
    return;
  }
  if (run.vel.length !== L * L * 4) run.vel = new Float32Array(L * L * 4);
  const vel = run.vel;
  const dial = s.inkTitleSweep ?? 0.5;
  const rows = inkTitleWash(seconds, run.since, dial, run.box!, vel, L);
  // The rinse that fingers through a thick title's pad (PLAN 37x-10g): pours of clear liquid with their volume, a thin gap's only.
  const gpu = fluid.gpu;
  if (gpu?.pour && gpu.thinGapLive) {
    const k = inkTitleRinse(seconds, run.since, dial, run.box!, run.rinse);
    for (let p = 0; p < k; p++) gpu.pour(run.rinse[p * 3], run.rinse[p * 3 + 1], inkTitleRinseRadius, run.rinse[p * 3 + 2], null, true);
  }
  run.since += seconds;
  if (!rows) {
    // The wash has passed (or the dial is at 0): the dye stays, as colour in the show.
    run.box = null;
    return;
  }
  for (let j = rows[0]; j <= rows[1]; j++) {
    for (let i = 0; i < L; i++) {
      const o = (i + j * L) * 4;
      if (vel[o] !== 0 || vel[o + 1] !== 0) fluid.addVelocity(i, j, vel[o], vel[o + 1]);
      vel[o] = 0; vel[o + 1] = 0;
    }
  }
}
