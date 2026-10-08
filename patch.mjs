import fs from 'fs';
let code = fs.readFileSync('src/gpu/wgsl/plate.ts', 'utf8');

code = code.replace(
  `      // Through it: the liquid beyond, magnified by the lens (more toward the
      // middle), in the closeup; the projector's view of it (below) is the
      // liquid right there, a flat slab of air being a window, not a lens.
      let lensUv = fuvBase - p * R * (0.35 + 0.45 * play) * dropCam;
      let lensF = decodeFluid(layer0, lensUv, 0.0, false);
      let lensCol = onGround(bgColor, lensF, dyeThrough);
      // And the lamp through the clear gap, carrying the liquid's hue
      // (0.18 toward white: measured, see git history of this block).
      let through = mix(tint, vec3f(1.0), 0.18) * (0.45 + 0.5 * h + 0.55 * ground);
      // Some bubbles are all but clear, some milky with a thicker film.
      let clarity = mix(0.3, 0.95, k1);
      var c = mix(lensCol, through, 0.25 + 0.55 * clarity);
      c = mix(outColor, c, smoothstep(0.0, 0.2, h));`,
  `      // Through it: the liquid beyond. Because the solver removed the dye
      // from the bubble's interior, outColor is already the lamp shining through!
      let clarity = mix(0.3, 0.95, k1);
      var c = outColor;`
);

code = code.replace(
  `        cp = mix(lensCol, mix(tint, vec3f(1.0), 0.18) * (0.95 + 0.55 * ground), 0.25 + 0.55 * clarity);`,
  `        cp = outColor;`
);

fs.writeFileSync('src/gpu/wgsl/plate.ts', code);
