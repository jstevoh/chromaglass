/**
 * The 5x5 Gaussian kernel and `blurAlpha` helper for the gooey edge decode,
 * moved out of `plate.ts` so `plate.ts` stays under its size budget.
 */
export const BLUR_ALPHA_WGSL = /* wgsl */ `
const W5 = array<f32, 25>(
  0.00296902, 0.01330621, 0.02193823, 0.01330621, 0.00296902,
  0.01330621, 0.05963430, 0.09832033, 0.05963430, 0.01330621,
  0.02193823, 0.09832033, 0.16210282, 0.09832033, 0.02193823,
  0.01330621, 0.05963430, 0.09832033, 0.05963430, 0.01330621,
  0.00296902, 0.01330621, 0.02193823, 0.01330621, 0.00296902
);

fn blurAlpha(t: texture_2d<f32>, fuv: vec2f, blurFluid: f32) -> f32 {
  if (U.derivedOn > 0.5 && blurFluid * U.gridSize < 0.5) {
    let d = blurFluid * 1.554;
    let k = vec3f(0.19138, 0.61724, 0.19138);
    var acc = 0.0;
    for (var j = 0; j < 3; j++) {
      for (var i = 0; i < 3; i++) {
        acc += k[i] * k[j] * tex2(t, fuv + vec2f(f32(i - 1), f32(j - 1)) * d).a;
      }
    }
    return acc;
  }
  var result = 0.0;
  for (var j = -2; j <= 2; j++) {
    for (var i = -2; i <= 2; i++) {
      let offset = vec2f(f32(i), f32(j)) * blurFluid;
      // Plain bilinear here, not the bicubic: twenty-five taps whose whole
      // purpose is to blur.
      let a = tex2(t, fuv + offset).a;
      result += a * W5[(j + 2) * 5 + (i + 2)];
    }
  }
  return result;
}
`;
