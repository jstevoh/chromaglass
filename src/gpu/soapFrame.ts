/**
 * Where the soap film's frame sits on the plate (PLAN 32d), in the plate's uv:
 * a square from SOAP_FRAME_LO to SOAP_FRAME_LO + SOAP_FRAME_SPAN both ways.
 *
 * Why this square and not the whole plate. The plate's camera shows the middle
 * two thirds of the plate across the screen's longer side (uvToFluid in
 * wgsl/plate.ts: a plate uv per 1.5 screens), so a frame over the whole plate
 * would spend a third of its cells off screen, and on a wide screen the top and
 * the bottom of the film, where it goes black and where it is thickest, would
 * never be seen. The frame fills the view's longer side instead. It is fixed to
 * the plate, so the camera's zoom and the dish move it as they move the liquid.
 *
 * Its own module, with no imports, so the plate's shader, the film's kernels and
 * the solver all read one number without carrying each other.
 */
export const SOAP_FRAME_LO = 1 / 6;
export const SOAP_FRAME_SPAN = 2 / 3;
