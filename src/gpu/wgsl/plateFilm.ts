/**
 * The film projector's frame on the plate (`filmFrame`, `filmOver`): where it
 * lands, how it is keyed and blended. Built into the display shader (plate.ts)
 * where the two functions sat, after the helpers they call (`tex2`,
 * `gradeMix`, `mixBlendOf`, `blendRowKeyed`) and the `film` binding.
 *
 * Why it is its own module: plate.ts is over the size budget (`npm run
 * sizes`) and may not grow, and PLAN 14ag's framing (Video Zoom, Across and
 * Up, and the frame's edge) grew these two; they moved here whole with it.
 */
export const FILM_FRAME_WGSL = /* wgsl */ `
/**
 * The film projector's frame where it lands, bent a little by the dye, graded,
 * and how much of it is there (w).
 *
 * Where it lands is the operator's (PLAN 14ag): Video Zoom and Video Across and
 * Up frame it, so a 4:3 reel, a portrait phone clip or a 2.39:1 film can be
 * pushed in on what matters or shown whole. filmScale is the cover-fit over
 * the zoom, filmPan the slide. Zoomed out, the frame stops at its edge: a
 * projector past its slide throws no picture, so w is 0 there and the film
 * adds nothing, under any blend, rather than the edge row smeared to the rim
 * by a clamped sampler. The edge is softened over a fixed sliver rather than
 * by fwidth, which is not allowed here: this is reached under the mixer's
 * per-row branches, and Tint refuses a derivative outside uniform control.
 */
fn filmFrame(uv: vec2f, fluid0: vec4f, normal0: vec3f) -> vec4f {
  let fuvF = (uv - 0.5 - U.filmPan) * U.filmScale + 0.5 + normal0.xy * 0.03 * fluid0.a;
  let inside = smoothstep(vec2f(-0.002), vec2f(0.002), fuvF) * smoothstep(vec2f(-0.002), vec2f(0.002), 1.0 - fuvF);
  return vec4f(gradeMix(tex2(film, vec2f(fuvF.x, 1.0 - fuvF.y)).rgb, U.mixGrade[3]), inside.x * inside.y);
}

/**
 * The film projector's frame over the picture. Its own way in, as it always
 * was: through the dye it lands on, keyed on its dark by Film Key. Any other
 * blend lays the frame itself, by Film Mix, and Key keys it by Film Key too.
 */
fn filmOver(color: vec3f, uv: vec2f, fluid0: vec4f, normal0: vec3f) -> vec3f {
  if (U.filmOn == 0 || U.filmMix <= 0.001) { return color; }
  let frame = filmFrame(uv, fluid0, normal0);
  let filmC = frame.rgb;
  let mixHere = U.filmMix * frame.w;
  let fm = mixBlendOf(U.mixBlend.w);
  if (fm != 0) { return blendRowKeyed(color, filmC, mixHere, fm, U.filmKey); }
  let fl = dot(filmC, vec3f(0.299, 0.587, 0.114));
  let key = smoothstep(U.filmKey, U.filmKey + 0.18, fl);
  let tinted = filmC * mix(vec3f(1.0), fluid0.rgb * 1.5, fluid0.a * 0.8);
  return mix(color, color * 0.35 + tinted * 0.95, key * mixHere);
}
`;
