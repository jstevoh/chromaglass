/**
 * The pads' door for the phone (PLAN 30c): the phone's grid of pads plays
 * the same holds the MIDI controller's do (app/usePadHits.ts, lib/padHits.ts),
 * through this, so a pad pressed on the glass and one struck on the APC40
 * are one engine and cannot come to mean different things.
 *
 * A door rather than props because the phone's stage is handed its props by
 * App(), which may not grow (npm run sizes); usePadHits, App's hook, opens
 * it and closes it. Only the phone's PhonePads walks through.
 */
import type { HandTarget, PadTarget } from './padTarget.ts';

export interface PadDoor {
  /** A pad pressed: `key` names it while held, `squeeze` 0..1 is how hard. */
  hit: (key: number, target: PadTarget, squeeze: number) => void;
  /** Pressed harder or softer while held (a pen's pressure). */
  press: (key: number, squeeze: number) => void;
  lift: (key: number) => void;
  /** A Track Select button: the tool, the liquid, or (`dye`) the colour in hand. */
  pick: (target: HandTarget | { kind: 'dye'; paletteIndex: number }) => void;
}

let door: PadDoor | null = null;
export function setPadDoor(d: PadDoor | null): void { door = d; }
export const padDoor = (): PadDoor | null => door;
