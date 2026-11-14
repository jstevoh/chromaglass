# src/gpu/wgsl

The shader sources, as TypeScript modules that export WGSL strings (`/* wgsl */` template literals) and the constants both sides share. Nothing here touches a device; `src/gpu/*.ts` builds the pipelines.

## Start here

- `fluid.ts` (12 KB): `KERNELS`, `kernel(name, format)`, `SIM_STRUCT`, `NOISE_WGSL`: the solver. An index: each pass's kernels are in `fluid/` (see its README), and this file joins them into the one table a pass is asked for by name.
- `thinGap.ts` (52 KB, grep it): `thinGapKernels`, the flow between two glasses (Hele-Shaw), and `LIFT_GRID`, where the oil lift's and the sealed bottle's Ψ is solved (`fluid/seal.ts`).
- `thinWarm.ts`: `thinWarmKernels(HEAD, COMMON, ROWS0)`, spread into `thinGapKernels`: the thin solve's warm start fitted to each step (`hsWarmDot`, `hsWarmFit`, `hsWarmScale`; PLAN 38r-12), and `WARM_GROUPS`, `WARM_FIT` for the solver's buffer.
- `plate.ts` (194 KB, grep it): `DISPLAY_MAIN`, `DERIVE_WGSL`, `FINISH_WGSL`, `plateWgsl`: the composite.
- `plateFields.ts`: `PLATE_FIELDS`, `PLATE_STRUCT`, the composite's uniforms.
- `spikes.ts`, `magnetDisc.ts`: the magnet's field (`MAGNET_RADIUS`) and the spikes' onset. The liquid's own onset is worked out from the ferrofluid in SI (`ferroOnsetTesla`, `SPIKE_ONSET_REAL`, the target; the plate still runs on the lab's `SPIKE_ONSET` until PLAN 38k-7; `FERRO_MS_TESLA`, `FERRO_CHI`, `FERRO_DENSITY`, `WATER_DENSITY`, `MAGNET_BR`; PLAN 38k), and the WGSL gives the field as a vector too (`magnetVec`, `magnetDiscFieldVec`) so several magnets add as fields. `standing.ts` exports `LIFT_ONSET`, the film's lift scale against the onset.

## Contracts

- Solver kernels write the fields; `pack.ts` turns them into the plate the composite reads. The composite never writes a solver field.
- Kernel sets are composed from shared parts passed as strings (`thinGapKernels(HEAD, W, NOISE)`, `slumpKernels`, `filmKernels`).
- Imports only `../uniforms` and number-only modules in `src/lib` (turntable, dye, liquidProps, handSolid, filmTable, outputConfig, videoFlow); never `components/`, `hooks/` or a device.
- `lib/magnetSize.ts` and `sim/fluidSimulation.ts` read `magnetDisc`; the rest is read by `src/gpu/*.ts`.

## Files

- `air.ts`: air splat (`AIR_SPLAT_WGSL`, `AIR_BOIL_WGSL`), and `AIR_RIM_WGSL`, shared with the plate: a bubble's fingered rim (`rimAt`) and what the field's fourth channel says, which bubble of the list a texel is (`AIR_LOOK_*`, `AIR_LOOK_SPAN` exported, PLAN 38h-15). `splat.ts`: pours. `stats.ts`: field summaries.
- `camera.ts`, `cameraFields.ts`: camera pass.
- `ferroDrop.ts`: closeup drop. `standing.ts`: domes.
- `plateThinFilm.ts`: `THIN_FILM_WGSL`, Thin Film's rings over the plate, the film's amount read through a B-spline (PLAN 1i; `npm run filmrings`).
- `plateBenDay.ts`: `BENDAY_OUTLINE_WGSL` (`benDayStrength`, `benDayEdge`), the Ben-Day print's pen line round each plate's shapes and seams, kept beside `plate.ts` (PLAN 21b; `npm run benday`).
- `lampField.ts`: `LAMP_FIELD_WGSL`, `lampField`, `pupilPass`: the projector's light on the stage (the lamp lever, the aperture), with the CPU twin `npm run lampfield` reads.
- `plateTransmit.ts`: `TRANSMIT_WGSL` (Glossiness as relief, the gel as a filter, the satellite droplets as lenses, PLAN 38h) and `EDGE_LIGHT_WGSL` (every edge's share of the light from beneath, `edgePass`, and the drops' aperture and indices, PLAN 38h-2; and `camBubble`, the closeup bubble's centre and radius fitted to the air texels, PLAN 38h-7, now only for the boiling's steam): pieces of the plate shader kept beside `plate.ts`; `npm run nolight` checks them. `TRANSMIT_WGSL` carries `MOIRE_WGSL`.
- `plateMoire.ts`: `MOIRE_WGSL`, the moiré pack's two printed sheets on the stage (`moireSheets`, the product of two box-integrated gratings, the lens's defocus by the sheet's gap, the lower sheet bent through the liquid) and `mixBelowBack`, which `plate.ts` calls for the Mixer rows between the plates, after the sheets (PLAN 45a); `npm run moire` checks it.
- `beadShape.ts`: `BEAD_SHAPE_WGSL`, the oil beads as the plate reads them (`beadWide`, `beadAt`, `beadColour`, moved here from `plate.ts`): for the rings, the mask evaluated at the point drawn from the list and tiles it was drawn from (bindings 22 to 24, PLAN 38h-17), its edge a screen pixel wide; the drops and a picture handed in place of a list read the mask; `npm run beadround` checks it. `beadMask.ts` exports `BEAD_STRUCT_WGSL`, the struct both read.
- `bubbleShape.ts`: `BUBBLE_SHAPE_WGSL`, each bubble drawn from its own disc at the screen's resolution (PLAN 38h-15): the list as the air was stamped (bindings 20 and 21, after the soap film's 18 and 19), `airHere` (which bubble a point is in, by the field's index, and its rim one screen pixel wide) and `airLiquid` (the liquid round a bubble read past the grid's hole); built into the plate shader after `TRANSMIT_WGSL`; `npm run bubbleround` checks it.
- `glint.ts`: the lens pass's shaders, `STEP_WGSL` (the flakes advected at their height by Poiseuille's profile, turned by Jeffery's orbit, settled by Stokes, born again), `SPLAT_WGSL` (each flake by the mirror law, drawn as its aperture's disc and six diffraction spikes, `SPLAT_VERTS`) and `LENS_WGSL` (the plate's picture in linear light with the glints and the side lamp added, then the finish), with `SPECK_STRIDE`; laws in `lib/glint.ts`.
- `closeupDepth.ts`: `CLOSEUP_DEPTH_WGSL` (the camera's bubble wall traced through Snell, Fresnel and total internal reflection against the light pad's critical cone, `airWallSeen`; the liquid above and below a ball narrower than the gap, `airColumn`, and in the wall's reflection, `camBounce`, each on the lamp ground or the black one (`liquidPart`); Light Play as a softbox above the glass, `softboxRadiance`, PLAN 38h-7) and its constants `SOFTBOX_TILT`, `SOFTBOX_HALF`, `SOFTBOX_GAIN`; built into the plate shader after `EDGE_LIGHT_WGSL`; `npm run closeupdepth` checks it.
- `film.ts`: a clear film that tears; `FILM_PRECURSOR`, the precursor its holes sit on.
- `filmDye.ts`: `FILM_DYE_WGSL` (`filmDyeThrough`, Beer–Lambert over the clear film's thickness above its precursor; `filmDyePaint`, the same on the black ground) and `FILM_DYE_DEPTH`; built into the plate shader after `TRANSMIT_WGSL`; `npm run lace` 8 checks it (PLAN 20b-13).
- `fluid/`: the solver's kernels, one file a pass.
- `output.ts`, `outputFields.ts`: projector pass.
- `pack.ts`: fields to the 8-bit plate (`PACK_KERNELS`); where Oil Bodies keeps the oil's share, `packDyeBodies` lets a part-oil cell's two liquids pass the light side by side, at the composite's rest path `DYE_PATH` (PLAN 47z-1; `npm run dropcolour`).
- `particles.ts`: particle dye.
- `post.ts`, `postFields.ts`: post chain.
- `probe.ts`: brightness probe.
- `slosh.ts`, `soapFilm.ts`, `lampBoil.ts`, `slump.ts`: slosh, soap film, lamp-boiling dish, ink slump. `soapFilm.ts`'s setup reads an `ext` face push (binding 8), zero unless written.
- `soapFilmPlate.ts`: what the plate adds to the soap film (PLAN 32d): `soapPullState` and `soapPull` (a drained film drawn again, top first); `SOAP_PLATE_KERNELS`, `NOISE_CELLS`.
- `soapAir.ts`: the air over the film and the film's big swirls (PLAN 32d-1, 32k): `soapAirForce`, `soapAirDiv`, `soapAirJacobi`, `soapAirProject` (the air, a fluid with inertia, stirred by the plate's flow and the film's plumes), `soapAirBrinkSource`, `soapAirBrinkJacobi` (the film's large-scale Brinkman flow), `soapAirExt` (both into the solver's `ext` faces); `SOAP_AIR_KERNELS`. `plateThinFilm.ts` also draws the film (`soapFilmOver`, display bindings 18 and 19: the thickness and `soapFilmLut`, storage buffers because the pass already samples sixteen textures).
- `tank.ts`: `TANK_KERNELS` (`tankBounds`, `tankDye`, `tankAdvect`, `tankForce`, `tankDiv`, `tankSmoothRed`, `tankSmoothBlack`, `tankRestrict`, `tankProlong` (the pressure's multigrid V-cycle, each on a level's own small uniform), `tankProject`) and `TANK_UNIFORM_BYTES`: the tank's substep (PLAN 47n), pass for pass the CPU reference's (`lib/tank.ts`); `npm run tankgpu` checks it.

## Checks

`npm run wgsl` (every shader compiles), then as relevant `physics`, `maze`, `spikes`, `disc`, `fingers`, `ferrohands`, `domes`, `ferrodye`, `microscope`, `straw`, `derive`, `grating`. `plate.ts`: `pops`, `ferrolook`, `filmrings`, `mixer`, `grainedge`, `lampzero`, `lampfield`, `litstage` and a `look` render. `output.ts`: `map`, `beams`, `wallpattern`. Also `sloshgpu`, `soapgpu`, `boilgpu`, `particles`. A changed constant: `checkguard`.
