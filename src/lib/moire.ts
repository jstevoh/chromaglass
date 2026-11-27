/**
 * The moiré pack (PLAN 45a): the sheet designs, their names as the desks and
 * the phone show them, and how long a copy without the pack may try them.
 *
 * A pair of printed transparencies on the stage, one under the glass and one
 * on the cover; the plate shader draws them as real filters (plateMoire.ts).
 * Numbers only, so the shader's uniforms, the desk and the phone all read the
 * one list; who may use the pack is `canUseMoirePack` in tierGates.
 */

/** A sheet design. The order is the shader's index, 1 up (0 is no sheet). */
export type MoireSheet =
  | 'none' | 'lines' | 'rings' | 'spokes' | 'spiral' | 'dots' | 'waves'
  | 'quasi' | 'inks' | 'song' | 'zoom';

/**
 * Every design, with what a desk calls it and one line on what it does.
 * The first six are the shapes every moiré set prints; the last four are
 * ours, sheets film cannot be printed as or a stage cannot hold still
 * (the owner, 2026-11-07: "a couple different designs that the other dude
 * isn't selling").
 */
export const MOIRE_SHEETS: readonly { id: MoireSheet; name: string; hint: string }[] = [
  { id: 'none', name: 'No sheet', hint: 'Nothing on this side of the stage.' },
  { id: 'lines', name: 'Lines', hint: 'Straight parallel lines: two at a slight angle beat into wide bars.' },
  { id: 'rings', name: 'Rings', hint: 'Concentric rings: two slid apart make curved fringes like a pond.' },
  { id: 'spokes', name: 'Spokes', hint: 'Radial blades, swept by Curl: two turned make the spinning star.' },
  { id: 'spiral', name: 'Spiral', hint: 'A spiral of one to twelve starts, set by Curl: two turned opposite ways make a flower.' },
  { id: 'dots', name: 'Dot Screen', hint: 'Clear hexagonal dots in black: two turned beat into larger hexagons.' },
  { id: 'waves', name: 'Waves', hint: 'Lines bent into waves, their height set by Curl.' },
  { id: 'quasi', name: 'Quasicrystal', hint: 'A five-fold pattern that never repeats: two make flowers no grid can.' },
  { id: 'inks', name: 'Colour Inks', hint: 'Cyan, magenta and yellow lines at the printer\'s angles: two beat in colour.' },
  { id: 'song', name: 'Song Groove', hint: 'A record\'s groove, wiggled by Curl; the pack\'s look lets the bass wiggle it.' },
  { id: 'zoom', name: 'Zoom Grid', hint: 'A log-polar grid: turning or scaling one makes the fringes spiral in for ever.' },
];

/** The design's index in the shader (0 for none or a name it does not know). */
export function moireSheetIndex(id: string | undefined): number {
  const i = MOIRE_SHEETS.findIndex(s => s.id === id);
  return i < 0 ? 0 : i;
}

export const VALID_MOIRE_SHEETS: ReadonlySet<string> = new Set(MOIRE_SHEETS.map(s => s.id));

/** The pack's id, as a licence and a look name it. */
export const MOIRE_PACK = 'moire';

/** How long a copy without the pack may try the sheets, in seconds. */
export const MOIRE_PREVIEW_SECONDS = 60;
