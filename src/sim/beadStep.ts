/**
 * Frame-loop step for the plate's oil beads (`BeadField`, PLAN 18i-2, 19ai-10).
 *
 * Extracted from `LiquidVisualizer.tsx` so the frame loop stays under its size
 * ceiling and hands the field the live glass gap, carrier and oil viscosities,
 * density contrast, and plate tilt sine each step.
 */
import { beadPopulation, type BeadField } from '../lib/beads';
import { WATER_AIR } from '../lib/bubbles';
import { DISH_GAP_METRES, carrierViscosity, thicknessViscosity } from '../lib/turntable';
import type { VisualizerSettings } from '../types';
import { GRID_SIZE, particleFlowScale } from './constants';
import type { FluidSimulation } from './fluidSimulation';

/** Sunflower oil properties from `src/bottles.ts`: 49 mPa·s, 920 kg/m³, 33 mN/m. */
const OIL_BEAD_MU = 0.049;
const OIL_BEAD_RHO = 920;
const OIL_WATER_SIGMA = 0.033;

/**
 * Populate (every thirtieth frame while active) and advance `beads` for one
 * simulation step, wiring the live cover gap and carrier/oil properties.
 * Returns `true` when the caller's `beadFrame` counter should advance.
 */
export function stepPlateBeads(
  beads: BeadField,
  lead: FluidSimulation | undefined,
  settings: VisualizerSettings,
  harmony: readonly number[],
  paletteRgb: readonly { r: number; g: number; b: number }[],
  simStep: number,
  beadFrame: number,
  running: boolean,
  simStepS: number,
  sinX: number,
  sinY: number,
): boolean {
  const beadAmt = Math.max(0, Math.min(1, Number.isFinite(settings.beads) ? settings.beads! : 0));
  if (beadAmt <= 0) {
    if (beads.beads.length) beads.clear();
    return false;
  }
  // Drops take their colours from the look's palette (PLAN.md batch 3); set every
  // frame because it is one number, and the palette with the populate below so a
  // new look eases toward its colours over RECOLOUR_S rather than cutting.
  beads.drops = settings.beadDrops ?? 0;
  if (simStep === 0 && (beadFrame % 30 === 0 || !beads.hasPalette) && beads.drops > 0) {
    beads.setPalette(harmony.map(i => paletteRgb[i] ?? paletteRgb[0]));
  }
  const tickFrame = simStep === 0;
  if (tickFrame && beadFrame % 30 === 0) {
    const dens = lead?.readDensity;
    beads.populate(
      ...beadPopulation(beadAmt, settings.macroMode),
      dens ? (bx, by) => dens[Math.max(0, Math.min(GRID_SIZE - 1, Math.round(bx))) + Math.max(0, Math.min(GRID_SIZE - 1, Math.round(by))) * GRID_SIZE] : undefined,
    );
  }
  if (running) {
    const carrierNu = (settings.thinGap ?? 1) > 0
      ? thicknessViscosity(Number.isFinite(settings.gapThickness) ? settings.gapThickness! : 0.45)
      : carrierViscosity(settings.viscosity);
    beads.setLiquid({
      gapMetres: lead?.gpu?.coverMetres ?? DISH_GAP_METRES,
      muOut: WATER_AIR.rho * carrierNu,
      muIn: OIL_BEAD_MU,
      deltaRho: OIL_BEAD_RHO - WATER_AIR.rho,
      sigma: OIL_WATER_SIGMA,
    });
    const bvx = lead?.readVx, bvy = lead?.readVy;
    const bk = particleFlowScale(lead, settings);
    beads.step(simStepS, (bx, by) => {
      if (!bvx || !bvy) return [0, 0];
      /*
        The clamp has to reject NaN, which the obvious one does not.
        `Math.round(NaN)` is NaN, `Math.min` and `Math.max` pass NaN through,
        an array indexed by NaN is `undefined` and `undefined * bk` is NaN —
        so a bead that went bad once was fed NaN for ever, and the gradient
        `beads.ts` draws it with throws inside the frame loop.
      */
      const cell = (v: number): number =>
        Number.isFinite(v) ? Math.max(0, Math.min(GRID_SIZE - 1, Math.round(v))) : -1;
      const ix = cell(bx);
      const iy = cell(by);
      if (ix < 0 || iy < 0) return [0, 0];
      const vx = bvx[ix + iy * GRID_SIZE] * bk;
      const vy = bvy[ix + iy * GRID_SIZE] * bk;
      return [Number.isFinite(vx) ? vx : 0, Number.isFinite(vy) ? vy : 0];
    }, sinX, sinY);
  }
  return tickFrame;
}
