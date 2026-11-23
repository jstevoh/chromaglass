/**
 * Where the oil meets the water, drawn as sharp as the real interface is
 * (Crisp Edges, PLAN 38w-15). Built into the display shader's VIEW block
 * (plate.ts) after viewAt, since it reads view0 the same way.
 */
export const INTERFACE_WGSL = /* wgsl */ `
/*
  The owner's note on Classic was "complexity and clarity": the reference
  stills from the 1960s shows have crisp, clean rims between the coloured
  water and the oil cells, and the plate drew those rims as a smear several
  pixels wide.

  The smear is not the liquid's. Oil and water do not mix: the real
  interface between them is a few molecules thick, far below anything a
  projector resolves, so on the wall it is a step. The solver carries the
  two phases as a Cahn-Hilliard order parameter (the oil fraction in view0),
  and Cahn-Hilliard has to spread that step over a few grid cells to step
  it at all: its equilibrium profile is s = (1 + tanh(x / eps)) / 2 across
  the interface, with eps about one cell. At N = 512 on a 1280-pixel wall
  one cell is two and a half pixels, so the band where s runs from 0.03 to
  0.97 was ten pixels of mixed colour that no real dish shows. That width is
  the numerics' (the interface's thickness in the model is set by the grid,
  not by the chemistry), so drawing it is drawing the solver's discretisation,
  not the liquid.

  What the solver does know exactly is where the interface is (the level
  set s = 1/2) and which way it faces (the gradient of s), and that is all a
  sharp interface is. So inside the band each pixel reads the plate not at
  its own point but at the point on its own side where the band has ended:
  it is moved along the interface's normal, out of the band, onto the pure
  phase it belongs to. A pixel within a pixel of the level set keeps a
  share of the band, so the step is drawn one pixel wide and antialiased,
  and a pixel outside the band is not moved at all. Everything the plate
  reads afterwards (the dye, the oil's own dye, the chemistry, the relief)
  is read at the moved point, so the colours are each side's own, unmixed,
  up to the line.

  The distance to the level set comes from the tanh profile itself, not from
  a straight line through it: with u = x / eps, s(1 - s) = s' eps / 2, so
  eps = 2 s (1 - s) / |grad s| and u = atanh(2s - 1) = ln(s / (1 - s)) / 2.
  That holds whatever the local width is (the band widens where the flow
  shears it and thins where it presses it) and stays exact far into the
  band, where the straight-line estimate (s - 1/2) / |grad s| overshoots.

  The remap, in u: half a pixel is pu = px / (2 eps) in u. A sharp line
  seen through a pixel shows the share of the pixel on each side of it: s
  runs straight from 0 to 1 across the one pixel the line crosses, which is
  2s - 1 = u / pu. So inside |u| < CRISP_BAND the pixel is read at
  u' = atanh(clamp(u / pu, -T, T)), T = tanh(CRISP_BAND): the pixel the line
  crosses gets its coverage, everything past it is read at the band's edge
  (s = 0.012 or 0.988), and at |u| = CRISP_BAND u' = u, so the remap meets
  the unmoved plate without a seam. The first remap stretched the pixel
  linearly in u, u' = CRISP_BAND * u / pu, which is a tanh across the pixel,
  not its coverage: its 10-90 rise was half a pixel, so at pixel centres
  more than half the rims came out as a hard step, a staircase
  (classicdish: 45% antialiased). Where pixels are already wider than the band (pu >= CRISP_BAND: a
  zoomed-out plate, a coarse grid) nothing moves.

  Only a real interface is drawn sharp. A faint trace of oil left in the
  water (s a few hundredths, no s = 1/2 anywhere near) also has a value and
  a gradient, and moved by the same rule its pixels were read from wherever
  its gradient pointed: the first render showed flecks of oil dye scattered
  over the water. Its profile is no tanh: a speck of oil fraction A and
  radius r gives s(1 - s) / |grad s| about r, so its eps reads as several
  cells, where the solver's interface keeps eps near one (the measured 10-90
  width, 1.9 cells, is 2.2 eps). So the offset fades out between eps of
  2 and 3.5 cells; eps varies smoothly, so the fade leaves no seam.

  The relief round every cell (Edge Relief, the meniscus) is the one read
  that stays at the unmoved point (rim0 in plate.ts). It is the lamp's light
  bent by the curved oil surface at the rim, and that curve has a width of
  its own, set by surface tension and the gap between the glasses, not by
  the grid. Read at the moved point it was read out in the flat pure phase,
  and the dark and bright line round every cell went: classicdish measures
  that the relief survives.

  It moves where the plate is read, never what the solver holds: the flow,
  the mixing and the interface's motion are all the solver's. Off (0) it
  changes nothing; Crisp Edges between 0 and 1 blends the offset, so a look
  can keep some of the soft band.
*/
const CRISP_BAND = 2.2;
fn oilTexel(p: vec2i) -> f32 {
  let d = vec2i(textureDimensions(view0)) - 1;
  return unpack2x16unorm(textureLoad(view0, clamp(p, vec2i(0), d), 0).x).y;
}
fn oilAt(uv: vec2f) -> f32 {
  let n = vec2f(textureDimensions(view0));
  let q = uv * n - 0.5;
  let i = vec2i(floor(q));
  let f = q - floor(q);
  return mix(mix(oilTexel(i), oilTexel(i + vec2i(1, 0)), f.x),
             mix(oilTexel(i + vec2i(0, 1)), oilTexel(i + vec2i(1, 1)), f.x), f.y);
}
// The point to read the plate at for a pixel at p, px plate units wide.
fn crispInterface(p: vec2f, px: f32) -> vec2f {
  if (U.crispEdges < 0.005) { return p; }
  let s = oilAt(p);
  if (s < 0.012 || s > 0.988) { return p; }
  let h = 1.0 / vec2f(textureDimensions(view0));
  let g = vec2f(oilAt(p + vec2f(h.x, 0.0)) - oilAt(p - vec2f(h.x, 0.0)),
                oilAt(p + vec2f(0.0, h.y)) - oilAt(p - vec2f(0.0, h.y))) / (2.0 * h);
  let gl = length(g);
  if (gl < 1e-3) { return p; }
  let eps = 2.0 * s * (1.0 - s) / gl;
  let u = 0.5 * log(s / (1.0 - s));
  let pu = 0.5 * px / eps;
  if (pu >= CRISP_BAND || abs(u) >= CRISP_BAND) { return p; }
  let T = tanh(CRISP_BAND);
  let ut = atanh(clamp(u / max(pu, 1e-4), -T, T));
  let real = 1.0 - smoothstep(2.0, 3.5, eps / h.x);
  return p + (g / gl) * eps * (ut - u) * clamp(U.crispEdges, 0.0, 1.0) * real;
}
`;
