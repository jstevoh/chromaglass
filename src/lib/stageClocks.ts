/**
 * The clocks of the things on the stage that turn on their own: the gel
 * wheel over the lamp and the moiré pack's upper sheet (PLAN 45a). Each is in
 * turns, kept in [0, 1), and advanced once a frame by the visualizer's loop on
 * the frame's real seconds, so a change of speed changes the rate from where
 * the wheel or the sheet stands, rather than jumping it to speed * time.
 *
 * Moved here from the visualizer's loop (19ai-10) when the sheet's clock
 * joined the gel's: one plain object, mutated in place, no per-frame objects.
 * The projectors' shutter vanes (PLAN 51a) are walked here too, on the same
 * real seconds: a vane is a thing on the stage that moves on its own once a
 * hand has sent it (lib/projectorBank.ts).
 */

import { walkShutters, type BankSettings } from './projectorBank';

export interface StageClocks {
  /** The gel wheel's turn (gelSpeed, turns a minute). */
  gel: number;
  /** The upper moiré sheet's spin (moireSpin, turns a minute; negative turns it back). */
  moire: number;
  /** Each projector's shutter vane, 0 open to 1 shut: A's, then B's. */
  shutters: Float32Array;
}

export function stageClocks(): StageClocks {
  return { gel: 0, moire: 0, shutters: new Float32Array(2) };
}

export function turnClocks(c: StageClocks, realDt: number, s: { gelSpeed?: number; moireSpin?: number } & BankSettings): void {
  c.gel = (c.gel + realDt * (s.gelSpeed ?? 0.5) / 60) % 1;
  const m = (c.moire + realDt * (s.moireSpin ?? 0) / 60) % 1;
  c.moire = m < 0 ? m + 1 : m;
  walkShutters(c.shutters, s, realDt);
}
