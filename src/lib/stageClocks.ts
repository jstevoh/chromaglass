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
 * hand has sent it (lib/projectorBank.ts). So is a focus dissolve's rack
 * (PLAN 51c, lib/focusDissolve.ts), on the show clock rather than the real
 * seconds, because the look fade it hides runs on that clock.
 */

import { walkShutters, type BankSettings } from './projectorBank';
import { rackClock, startDeckRack, startRack, walkRack, type DissolvePlan, type RackClock } from './focusDissolve';
import { showNow } from './showClock';

export interface StageClocks {
  /** The gel wheel's turn (gelSpeed, turns a minute). */
  gel: number;
  /** The upper moiré sheet's spin (moireSpin, turns a minute; negative turns it back). */
  moire: number;
  /** Each projector's shutter vane, 0 open to 1 shut: A's, then B's. */
  shutters: Float32Array;
  /** Each projector's focus dissolve, its share in `rack.share` (lib/focusDissolve.ts). */
  rack: RackClock;
}

export function stageClocks(): StageClocks {
  return { gel: 0, moire: 0, shutters: new Float32Array(2), rack: rackClock() };
}

export function turnClocks(c: StageClocks, realDt: number, s: { gelSpeed?: number; moireSpin?: number } & BankSettings): void {
  c.gel = (c.gel + realDt * (s.gelSpeed ?? 0.5) / 60) % 1;
  const m = (c.moire + realDt * (s.moireSpin ?? 0) / 60) % 1;
  c.moire = m < 0 ? m + 1 : m;
  walkShutters(c.shutters, s, realDt);
  walkRack(c.rack, showNow());
}

/**
 * A focus dissolve over `seconds` (PLAN 51c) on the projectors a Go changes:
 * the front's, and the back's while its plate follows the front's look; for a
 * Go to the back plate (`back`) with two projectors on the wall (`two`), the
 * back's alone, the front holding sharp (Epic Rig's one layer held while the
 * other racks). With one projector both plates are in its one beam, so a Go
 * to the back plate racks it.
 */
export function rackStage(c: StageClocks, seconds: number, back: boolean, backFollows: boolean, two: boolean): DissolvePlan {
  return startRack(c.rack, showNow(), seconds, !back || !two, back || backFollows);
}

/** A deck dissolve over `seconds` to projector `to` (PLAN 51c-2, lib/deckDissolve.ts): the other racks out, `to` racks in. */
export function rackDeck(c: StageClocks, seconds: number, to: 0 | 1): void {
  startDeckRack(c.rack, showNow(), seconds, to);
}
