/**
 * Polling the GPU's species field once a second (`speciesShare` and
 * `speciesSnapshot`, sharing one `RimRead`) and handing the latest snapshot
 * to the plate's `BubbleField` on a thin gap (PLAN 33f, 19ai-10).
 *
 * Extracted from `fluidSimulation.ts` (`readPouredShare`) and
 * `LiquidVisualizer.tsx` (the bubble step block) so neither >100 KB file
 * grows.
 */

import type { PlateSolver } from '../gpu/solverTypes';
import type { BubbleField } from '../lib/bubbles';
import type { PouredLiquid, SpeciesSnapshot } from '../lib/bubbleLiquid';
import type { LiquidPhase } from '../lib/liquidPhase';
import type { VisualizerSettings } from '../types';
import { GRID_SCALE, GRID_SIZE, particleFlowScale } from './constants';
import type { FluidSimulation } from './fluidSimulation';

export interface SolverSpeciesSnap extends SpeciesSnapshot {
  poured: PouredLiquid;
}

export class SpeciesPoller {
  private steps = 0;
  private reading = false;
  private clears = 0;
  private snap: SolverSpeciesSnap | null = null;

  /**
   * The snapshot the last read brought back, without polling. The bubbles take
   * it from here rather than calling `poll` themselves: the solver's step
   * already polls once a step, and a second caller in the frame advanced the
   * same 60-step counter twice, so the "once a second" read ran twice as often
   * (and a caller passing its own thin-gap test could null what the step's
   * caller had just read). One owner of the counter, any number of readers.
   */
  get latest(): SolverSpeciesSnap | null { return this.snap; }

  /** Drop any cached snapshot and ignore any read started before this clear. */
  clear(): void {
    this.clears++;
    this.steps = 0;
    this.snap = null;
  }

  /**
   * Poll `speciesShare` and `speciesSnapshot` together once every 60 steps on
   * a thin gap (one shared GPU read in `RimRead`), updating `liquid.gpuShare`
   * and returning the latest snapshot (or `null` off a thin gap or after a
   * clear).
   */
  poll(thinGap: boolean, g: PlateSolver | null, liquid: LiquidPhase): SolverSpeciesSnap | null {
    if (!thinGap || !g?.speciesShare || !g?.speciesSnapshot) {
      liquid.gpuShare = null;
      this.snap = null;
      return null;
    }
    if (!this.reading && ++this.steps >= 60) {
      this.steps = 0;
      this.reading = true;
      const c = this.clears;
      Promise.all([g.speciesShare(), g.speciesSnapshot()])
        .then(([share, snap]) => {
          if (c !== this.clears) return;
          liquid.gpuShare = share;
          this.snap = snap;
        }, () => { /* a lost device: the next read tries again */ })
        .finally(() => { this.reading = false; });
    }
    return this.snap;
  }
}

/**
 * Step the plate's `BubbleField` for one simulation step, handing it the
 * species snapshot on a thin gap (and `null` otherwise), then applying each
 * bubble's footprint squeeze and pop collapse to the lead layer.
 */
export function stepPlateBubbles(
  bubbles: BubbleField,
  lead: FluidSimulation | undefined,
  currentSettings: VisualizerSettings,
  simStepS: number,
  tiltX: number,
  tiltY: number,
): void {
  const vx = lead?.readVx, vy = lead?.readVy;
  const qk = particleFlowScale(lead, currentSettings);
  bubbles.liquid(currentSettings);
  const thinGap = (currentSettings.thinGap ?? 1) > 0 && !!lead?.thinGap;
  const snap = thinGap && lead ? lead.speciesPoll.latest : null;
  bubbles.species(snap, snap ? snap.poured : null);
  bubbles.step(simStepS, (bx, by) => {
    if (!vx || !vy) return [0, 0];
    const ix = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(bx)));
    const iy = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(by)));
    return [vx[ix + iy * GRID_SIZE] * qk, vy[ix + iy * GRID_SIZE] * qk];
  }, tiltX, tiltY);
  // A bubble is air between the plates: the dye cannot sit under
  // it. A standing squeeze on each footprint keeps pumping the
  // dye out to the rim, so the field flows round the bubbles
  // instead of sliding underneath them as if they were painted on.
  // The bubble's press, not the hand's (lib/squish.ts Presser): a held Blow's straw bubble is one, and `npm run tools` counts the hand's alone.
  if (lead) {
    for (const b of bubbles.bubbles) {
      if (b.r < 1.2) continue;
      const bx = Math.round(b.x), by = Math.round(b.y);
      if (bx > 2 && by > 2 && bx < GRID_SIZE - 3 && by < GRID_SIZE - 3) lead.applySquish(bx, by, Math.max(1, b.r * 0.85 / GRID_SCALE), 0.0035, 0, false, 'press', 'bubble');
    }
  }
  // A pop is an inward cavity collapse into the void left behind.
  for (const ev of bubbles.events) {
    if (ev.kind === 'pop' && lead) {
      const px = Math.round(ev.x), py = Math.round(ev.y);
      if (px > 2 && py > 2 && px < GRID_SIZE - 3 && py < GRID_SIZE - 3) lead.popBubble(px, py, Math.max(2, Math.round(ev.r / GRID_SCALE)), 0.04);
    }
  }
}
