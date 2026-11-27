/**
 * Each projector's focus (PLAN 51b): the thin lens's defocus, with the
 * lamp's image as the pupil.
 *
 * What was asked. Liquid Light Lab's players ride focus by feel ("a little
 * out of focus there, there we go"; "manual focus, then you can blend it"),
 * and in their "Epic Rig" film (17:50) one projector's layer racks soft while
 * the other's stays sharp. The plate had one focus, the look's Projector
 * Focus, a depth inside the 2 mm gap that moves the Becke lines, and every
 * picture on the wall was otherwise drawn sharp.
 *
 * The law. An overhead's lens sits about 0.36 m above its stage, a lens of
 * about 0.32 m focal length (a 3M 1700-series head throws to 1.5 to 4 m:
 * 1/u = 1/f − 1/v puts the stage 0.41 to 0.35 m below it over that range).
 * Rack the head by Δz and the stage sits Δz from the plane the wall is
 * sharp on; each stage point's cone, the pupil's width at the lens, is cut
 * by the stage plane in a patch Δz × pupil / 0.36 m across, which is the
 * blur on the stage, and the wall shows the stage at one magnification, so
 * as a share of the frame the blur needs neither the throw nor the screen.
 *
 * The pupil is the lamp's image, not the lens's glass. The Fresnel under the
 * stage is a condenser: it images the lamp's filament into the lens, so the
 * light through any stage point fills only that image, and a defocused point
 * on the wall is the filament's shape. A halogen projector lamp's coil is a
 * short bar (an FXL or ENX coil about 7 by 3.5 mm, its reflector's image
 * laid beside it) and the Fresnel magnifies it about 3.6 times (the lamp
 * about 0.1 m below a Fresnel that focuses it 0.36 m above), so the pupil is
 * a filled bar about 32 by 16 mm, against a lens about 90 mm across. That is
 * why an overhead's soft edges are so much tighter than its glass would make
 * them, and why they are a little longer one way: the bar lies along the
 * frame's width, as the lamp lies across the head. The blur is a box of the
 * bar's shape, uniform, because the coil is (the reflector fills its gaps).
 *
 * The frame is an overhead's stage, 0.285 m (an 11¼ inch stage) across the
 * frame's long side. So 10 mm of Δz, a squeeze plate's two glasses, blurs
 * 0.31% of the frame along the bar; the head's rack, about ±75 mm (the
 * stage's 0.35 to 0.41 m above), reaches 2.3%, within a real show's soft
 * edges (1.2 to 2.4% of the frame, 47v's films). The knob's middle is sharp,
 * either way is the head racked up or down; its first half is the rack's
 * real travel and past it the dial ramps on to a melt of about a tenth of
 * the frame (Settings may ramp past real; PLAN 51c's dissolve racks out to
 * there).
 *
 * The blur keeps the light: it is done in linear light (the plate's picture
 * is display values, `toLinear` in wgsl/focus.ts) and every tap weighs the
 * same, so a defocused cell spreads into a glow, not a dark smudge.
 *
 * What it does not do yet (PLAN 51b-2): the same Δz is the shadowgraph's,
 * which the look's Projector Focus sets inside the gap (plateTransmit's
 * defocusShadow). A head racked 10 mm is 5 gaps from the liquid, which is
 * where the Becke lines would be strongest, and they are drawn at the look's
 * Focus alone here: one lens told two things until 51b-2 hands the rack to
 * the shadowgraph too.
 */

/** The overhead's lens above its stage, metres. */
export const LENS_HEIGHT_M = 0.36;
/** The lamp's image in the lens, metres: the pupil a defocused point takes the shape of (long, along the frame's width; short). */
export const PUPIL_LONG_M = 0.032;
export const PUPIL_SHORT_M = 0.016;
/** The stage across the frame's long side, metres. */
export const STAGE_M = 0.285;
/** The head's rack, either way from sharp: the knob's first half. */
export const RACK_M = 0.075;
/** Past the rack the dial ramps on to this, at its ends: a melt of about a tenth of the frame. */
export const MELT_M = 0.32;
/** Below this many pixels of half-width a projector is sharp, and the pass sits out. */
export const SHARP_PX = 0.5;

const finite = (v: number | undefined, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * How far the dissolve racks, its dial `projRack` (0 off, PLAN 51c,
 * lib/focusDissolve.ts): its first half is the head's real rack, as the
 * focus knob's is (RACK_M); past it the dial ramps on, past real, to a glow.
 * Epic Rig's rack melts an oil disc a third of the frame across into one red
 * glow, so the blur there is the disc's own size: a melt of a tenth of the
 * frame (the focus knob's end, MELT_M) left a swap of dots a few percent
 * across at 57% of a hard cut in the lab (`npm run focus`); the dial's end,
 * a box a quarter of the frame along the lamp's bar, is GLOW_M.
 */
export const GLOW_M = 0.8;

/** The dial to the stage's distance from the plane in focus at the swap, metres. */
export function dissolveDz(v: number | undefined): number {
  const k = Math.min(1, Math.max(0, typeof v === 'number' && Number.isFinite(v) ? v : 0));
  return k <= 0.5 ? 2 * k * RACK_M : RACK_M + (2 * k - 1) * (GLOW_M - RACK_M);
}


/** The knob (−1 to 1, 0 sharp) to the stage's distance from the plane in focus, metres (always ≥ 0: the box does not care which way). */
export function focusDz(knob: number | undefined): number {
  const k = Math.min(1, Math.abs(finite(knob, 0)));
  return k <= 0.5 ? 2 * k * RACK_M : RACK_M + (2 * k - 1) * (MELT_M - RACK_M);
}

/** The blur's full size as a share of the frame's long side: [along the bar, across it]. */
export function focusBlur(knob: number | undefined): [number, number] {
  const dz = focusDz(knob);
  return [dz * PUPIL_LONG_M / LENS_HEIGHT_M / STAGE_M, dz * PUPIL_SHORT_M / LENS_HEIGHT_M / STAGE_M];
}

export interface FocusSettings { projFocusA?: number; projFocusB?: number; projRack?: number }

/**
 * A projector's Δz while a focus dissolve racks it (PLAN 51c,
 * lib/focusDissolve.ts): from where its own knob has the head, out towards
 * the dissolve's depth by `share` (0 at rest, 1 at the swap), and back. A head
 * already racked further than the dissolve goes is left where it is: the
 * operator racks out from where the lens is, never in.
 */
export function rackedDz(knob: number | undefined, depth: number | undefined, share: number): number {
  const dz = focusDz(knob);
  const peak = dissolveDz(depth);
  const t = Math.min(1, Math.max(0, finite(share, 0)));
  return peak > dz ? dz + (peak - dz) * t : dz;
}

/**
 * The box's half-widths in pixels for the shader, A's x and y then B's, for
 * a frame `longPx` on its long side seen at `zoom` (the closeup's shot
 * magnifies the stage, and the blur with it). B is 0 unless two projectors.
 * `rack` is each projector's share of a focus dissolve's rack this frame
 * (the stage clocks', lib/focusDissolve.ts), left out at rest.
 */
export function focusBoxPx(out: Float32Array | number[], s: FocusSettings, two: boolean, longPx: number, zoom: number, rack?: ArrayLike<number>): void {
  const scale = 0.5 * longPx * Math.max(1, finite(zoom, 1)) / LENS_HEIGHT_M / STAGE_M;
  const a = rackedDz(s.projFocusA, s.projRack, rack ? rack[0] : 0);
  const b = two ? rackedDz(s.projFocusB, s.projRack, rack ? rack[1] : 0) : 0;
  out[0] = a * PUPIL_LONG_M * scale; out[1] = a * PUPIL_SHORT_M * scale;
  out[2] = b * PUPIL_LONG_M * scale; out[3] = b * PUPIL_SHORT_M * scale;
}

/** Whether either projector is soft enough that the pass runs. */
export const focusWanted = (box: ArrayLike<number>): boolean => Math.max(box[0], box[2]) >= SHARP_PX;

/**
 * A melt's box is wide enough to be worked at a smaller picture (PLAN 51b-3,
 * gpu/focus.ts) once its short side is this many of the smaller picture's
 * pixels: a box of 12 small pixels or more across has nothing at one small
 * pixel's scale to alias, so the bilinear tap that draws it back is smooth.
 */
export const LOW_MIN_PX = 6;

/**
 * The scale the focus pass works a frame at: 1 the frame's own size, 2 a
 * half, 4 a quarter, 8 an eighth (a dissolve's glow, lib/focusDissolve.ts). Set by the soft projector with the narrowest box (along
 * its short side, the lamp's bar across), so no soft projector is boxed
 * coarser than it is wide; a projector sharp beside it (under SHARP_PX) does
 * not count, being drawn at full size untouched (wgsl/focus.ts compose).
 * `box` is focusBoxPx's.
 */
export function focusScale(box: ArrayLike<number>, two: boolean): number {
  let h = Infinity;
  if (box[0] >= SHARP_PX) h = box[1];
  if (two && box[2] >= SHARP_PX) h = Math.min(h, box[3]);
  if (!Number.isFinite(h)) return 1;
  return h >= 8 * LOW_MIN_PX ? 8 : h >= 4 * LOW_MIN_PX ? 4 : h >= 2 * LOW_MIN_PX ? 2 : 1;
}

/** The knob as the panel reads it: Sharp, or how far the head is racked. */
export const focusLabel = (v: number): string => {
  const k = finite(v, 0);
  if (Math.abs(k) < 0.005) return 'Sharp';
  const mm = Math.round(focusDz(k) * 1000);
  return `${k > 0 ? 'Up' : 'Down'} ${mm} mm${Math.abs(k) > 0.5 ? ', past the rack' : ''}`;
};
