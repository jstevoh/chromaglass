/**
 * Beat Squeeze's kick laid on a plate (moved out of `FluidSimulation.pressKick`
 * to keep that file under its size budget, PLAN 38w-28, when the glass's
 * branch became the clock glass pressed whole).
 */
import { KickRelease, PressLifts, type Presser, type Stroke } from '../lib/squish';
import { GlassPress, glassDepth } from '../lib/glassPress';
import { RhythmSheet } from '../lib/sheet';
import { showNow } from '../lib/showClock';
import type { PlateSolver } from '../gpu/solverTypes';
import { GRID_SCALE } from './constants';
import { pressSheetKick } from './stepping';

/** What of a plate a kick touches: FluidSimulation's own, by these names. */
export interface KickPlate {
  readonly size: number;
  readonly gpu: PlateSolver | null;
  readonly thinGap: boolean;
  readonly pressLift: PressLifts;
  readonly sheet: RhythmSheet;
  readonly glassPress: GlassPress;
  readonly kickRelease: KickRelease;
  readonly pressedCells: Record<Presser, number>;
  readonly pressedDepth: Record<Presser, number>;
  readonly dishKicks: { x: number; y: number; amount: number; radii: number[]; t: number }[];
  applySquish(x: number, y: number, radius: number, amount: number, fingering?: number, pileTips?: boolean, stroke?: Exclude<Stroke, 'lift'>, who?: Presser): void;
}

/**
 * Beat Squeeze's kick (lib/squish.ts `kickPress`): the rhythm sheet's one
 * dent, as wide as the sheet bends over this liquid in the time the kick
 * holds it, or where the look presses the glass (Frame Sway, Press the Whole
 * Glass) the clock glass over three nested discs across most of the dish.
 * `radii` in cells of a 128 plate, `amount` each disc's press. Remembered
 * for the lift like a hand's press, and let go a moment later.
 */
export function layKick(p: KickPlate, x: number, y: number, amount: number, fingering: number, radii: readonly number[], nu: number, curve: number): void {
  x = Math.round(x);
  y = Math.round(y);
  if (radii.length === 1 && p.gpu && p.thinGap) {
    /*
      The rhythm sheet, solved (lib/sheet.ts, PLAN 27f-4): a fingertip on
      it here, held KICK_HOLD and lifted, pushing out from under it as much
      liquid as the stamped bowl closed over the same reach (stampedVolume),
      and from then on the sheet's own equation lays the gap, step by step
      (liftStep). The lift's memory still hears the kick as a press, so
      Fingering's fingers follow it as they followed the bowl.
    */
    const radius = Math.round(radii[0] * GRID_SCALE);
    p.pressLift.press('kick', x, y, radius, amount, fingering, showNow());
    pressSheetKick(p.sheet, p.size, x, y, amount, radii[0], nu, curve, p.gpu.coverMetres);
  } else if (p.gpu && p.thinGap) {
    /*
      The clock glass, pressed whole (lib/glassPress.ts, PLAN 38w-28): one
      rigid shape over the discs, down over KICK_HOLD and back up over
      KICK_RELEASE along the same path, laid step by step (liftStep). It
      was the discs stamped through the shader's Stefan closing and given
      back linearly by KickRelease, down one path of shapes and up
      another, which pumped the oil out to the rim on every kick (Bass
      Drop's live glass; 66% of Lava Pop's oil in the middle third went to
      44% in eight seconds in the lab). The lift's memory still hears it
      as a press, so Fingering's fingers follow the glass as it comes up.
    */
    const cells = radii.map((r) => Math.round(r * GRID_SCALE));
    p.pressLift.press('kick', x, y, cells[0], amount, fingering, showNow());
    // Counted as a stroke counts what it lays (applySquish): the cells the glass bears on, and how deep.
    const bears = p.glassPress.press(p.size, x, y, cells, glassDepth(amount, radii.length));
    p.pressedCells.kick += bears.cells;
    p.pressedDepth.kick += bears.depth;
  } else {
    // The old plate: no film to close, the discs stamped and given back (KickRelease).
    radii.forEach((r, i) => p.applySquish(x, y, r, amount, fingering, i === 0, 'press', 'kick'));
    p.kickRelease.kick(x, y, radii.map((r) => Math.round(r * GRID_SCALE)), amount, p.thinGap);
  }
  // And the same glass on the slosh dish (stepSlosh), over the same radii the
  // gap was pressed with: off the frame-moving looks that is the sheet's one
  // dent (kickPress), so the dish is pushed down where the plate is and no
  // wider, and the liquid it moves runs out as a ring and back off the rim.
  if (p.thinGap && amount > 0) {
    p.dishKicks.push({ x: (x + 0.5) / p.size, y: (y + 0.5) / p.size, amount, radii: [...radii], t: 0 });
    if (p.dishKicks.length > 2) p.dishKicks.shift();
  }
}
