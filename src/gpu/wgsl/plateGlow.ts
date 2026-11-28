/**
 * Bioluminescent trails on the plate (PLAN 48c): the light the water's
 * dinoflagellates give, as the glow solver left it (gpu/glow.ts,
 * wgsl/glow.ts), drawn over the plate.
 *
 * Emission, filtered by the dye above (PLAN 48c-3). Everything else the plate
 * draws is the lamp's light, passed, bent or reflected (§38h's rule: nothing on
 * a lit plate makes light the lamp did not give). This is the one thing that
 * does make light, because the organisms do: luciferin oxidised by luciferase,
 * a band peaked at 474 to 476 nm whatever the dye (Hastings 1983; Noctiluca,
 * Pyrocystis and Lingulodinium all sit within a few nanometres of it). On its
 * way from the water to the lens it passes through the dye above it and is
 * attenuated by Beer–Lambert (`dyeT`, the front plate's transmission), so a
 * glow under red dye dims and under yellow shifts green.
 *
 * In linear light, as the soap film beside it (plateThinFilm.ts): the plate's
 * colour is sRGB-encoded at this point, so it is decoded, the light added,
 * and encoded again.
 */

/** The bioluminescence band, 475 nm, as linear sRGB at its brightest channel 1. */
const BLUE = [0.0, 0.32, 1.0];

export const GLOW_PLATE_WGSL = /* wgsl */ `
/* The glow's light, n × n over the plate's uv (gpu/glow.ts); a 4-float stand-in while the water is not glowing. The display's eighth storage buffer in its fragment stage (after 48f's surface at 25), the last of the eight every device gives without asking (gpu/device.ts asks for no more). */
@group(0) @binding(26) var<storage, read> glowLight: array<f32>;

const GLOW_BLUE: vec3f = vec3f(${BLUE.join(', ')});

fn glowAt(i: i32, j: i32, n: i32) -> f32 {
  return glowLight[u32(clamp(j, 0, n - 1)) * u32(n) + u32(clamp(i, 0, n - 1))];
}

fn glowOver(c: vec3f, fuv: vec2f, dyeT: vec3f) -> vec3f {
  let n = i32(round(sqrt(f32(arrayLength(&glowLight)))));
  if (n < 4) { return c; }
  let p = fuv * f32(n) - 0.5;
  let b = vec2i(floor(p));
  let f = p - floor(p);
  let l = mix(mix(glowAt(b.x, b.y, n), glowAt(b.x + 1, b.y, n), f.x), mix(glowAt(b.x, b.y + 1, n), glowAt(b.x + 1, b.y + 1, n), f.x), f.y);
  if (!(l > 1e-4)) { return c; }
  let v = clamp(c, vec3f(0.0), vec3f(1.0));
  let lin = select(pow((v + 0.055) / 1.055, vec3f(2.4)), v / 12.92, v <= vec3f(0.04045));
  return soapEncode(lin + GLOW_BLUE * dyeT * (l * U.glow));
}
`;
