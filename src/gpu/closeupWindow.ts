/**
 * The closeup's window: where on the plate the camera looks, so the dye can
 * be carried finer than the grid there and drawn at the screen's own scale
 * (PLAN 47a-1 and 47a, "Fine Detail" in the Macro section).
 *
 * What was reported (2026-11-11, and measured again 2026-11-13 against ten of
 * a macro artist's films watched frame by frame): our closeup magnifies a
 * coarse field, theirs films a small dish finely. The films hold 2.2 to 3.1
 * times more edge detail at a fine scale than a four-times-coarser copy of
 * the same frame does (the "fine over coarse" of the watch); ours held 1.08
 * at 1x and 1.2 at 6x, because at 6x one solver cell covers tens of screen
 * pixels and everything finer than a cell has been diffused away by the
 * grid's resampling.
 *
 * **The physics.** A dye in water diffuses about a thousand times more slowly
 * than momentum (Schmidt number ν/D ≈ 10³), so stirring folds it into
 * filaments some thirty times finer than the flow's own smallest eddy: the
 * Batchelor scale. Fine dye over a coarse flow is what a real dish does, not
 * a cheat. `fineDye.ts` carries the dye over this window on a grid of about
 * two screen pixels a texel, through the velocity the solver computes, with
 * no diffusion; this file only says where the window is.
 *
 * **Why a window.** In the closeup nothing outside the frame is seen, so the
 * fine dye is only needed there, and a texture over the frame at two pixels
 * a texel costs the same at 2x as at 6x. The window turns with the plate
 * under the camera (`uvToFluid` in the plate shader turns the fluid by the
 * layer's rotation), so it is a rectangle aligned with the screen, not with
 * the plate: the frame's own shape plus a margin, never the plate-aligned
 * box round a turning frame, which on a wide screen would waste most of its
 * texels. Its texels are square in fluid uv, so a coarse cell is the same
 * number of them across and up (the fine dye's low-pass needs that).
 */

import type { VisualizerSettings } from '../types';

/** Where the closeup looks on one layer, in fluid uv. */
export interface CloseupWindow {
  /** The frame's centre, fluid uv. */
  cx: number;
  cy: number;
  /** Half the window's width and height, fluid uv, along the screen's axes. */
  hx: number;
  hy: number;
  /** cos and sin of the turn from screen to fluid (the shader's `cos(-rotation)`). */
  c: number;
  s: number;
  /** The fine dye's texture over the window, in texels; `2 · hx / texX` is `2 · hy / texY`. */
  texX: number;
  texY: number;
}

/**
 * How far past the frame the window reaches, as a share of it. The closeup's
 * crinkle (`macroWarpOffset`) moves a sample by at most a few cells' worth at
 * zoom, and the defocus taps by `dof · 0.022 / (1.5 · zoom)`; a tenth more
 * than the frame holds both, and dye carried in from the margin has already
 * been folded by the flow before it reaches the screen's edge.
 */
export const WINDOW_MARGIN = 1.1;
/**
 * Screen pixels a window texel covers. Two keeps a filament the flow has
 * thinned to a texel at two pixels, which the Catmull-Rom read of the plate
 * draws as a line and not a stair, at a quarter the texels of one pixel each.
 */
export const WINDOW_PX_PER_TEXEL = 2;
/** The window's longest edge, in texels: five textures of 1280 × 720 half float are 37 MB. */
export const WINDOW_MAX_EDGE = 1280;
/**
 * The fewest window texels a solver cell may span before the fine dye is
 * worth carrying. Below it the window is finer than the grid by less than
 * the Catmull-Rom read of the grid already draws, and the fine dye could add
 * nothing the plate does not already show.
 */
export const WINDOW_MIN_CELL = 3;

/**
 * How much of the fine dye the plate shows: Fine Detail, as far into the
 * closeup as the zoom has gone. At 1x it is 0 and nothing runs.
 */
export function closeupFine(s: Partial<VisualizerSettings>, macroAmount: number): number {
  return Math.max(0, Math.min(1, s.macroFine ?? 0)) * Math.max(0, Math.min(1, macroAmount));
}

/**
 * The window the camera sees on a layer, or null where there should be no
 * fine dye: at 1x, under the kaleidoscope or the dish spread (which map the
 * screen to the plate their own ways), while the frame still covers most of
 * the plate, and where a cell is too few texels across for a finer grid to
 * hold anything (`WINDOW_MIN_CELL`).
 */
export function closeupWindowOf(
  shot: { cx: number; cy: number; zoom: number },
  amount: number,
  rotation: number,
  width: number,
  height: number,
  grid: number,
  s: Partial<Pick<VisualizerSettings, 'kaleidoscope' | 'dishSpread'>>,
): CloseupWindow | null {
  if (!(amount > 0.001) || width <= 0 || height <= 0 || grid <= 0) return null;
  if (Math.round(s.kaleidoscope ?? 0) >= 2 || (s.dishSpread ?? 0) > 0.001) return null;
  const zoom = Math.max(1, shot.zoom);
  const big = Math.max(width, height);
  // `uvToFluid`: a screen pixel is 1 / (1.5 · big · zoom) of fluid uv.
  const perPx = 1 / (1.5 * big * zoom);
  let texel = WINDOW_PX_PER_TEXEL * perPx;
  const most = big * WINDOW_MARGIN / WINDOW_PX_PER_TEXEL;
  if (most > WINDOW_MAX_EDGE) texel *= most / WINDOW_MAX_EDGE;
  if (1 / grid / texel < WINDOW_MIN_CELL) return null;
  // Rounded up to 8 texels, so a window resized by a pixel keeps its textures.
  const edge = (px: number) => Math.max(8, Math.ceil((px * WINDOW_MARGIN * perPx) / texel / 8) * 8);
  const texX = edge(width), texY = edge(height);
  const hx = texX * texel / 2, hy = texY * texel / 2;
  if (4 * hx * hy > 0.25) return null;
  return {
    cx: shot.cx, cy: shot.cy, hx, hy,
    c: Math.cos(-rotation), s: Math.sin(-rotation),
    texX, texY,
  };
}
