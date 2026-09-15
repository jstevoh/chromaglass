# Plan: a plate with real detail, and a show you can render

Two threads of work, merged into one running order.

**The look.** Filmed liquid (acrylic pour, oil and milk macro) carries structure at
every scale. Ours does not: measured on a 512 px centre crop, the reference frames
put 4.2–7.3 % of their pixels on a hard edge with a typical local contrast of 2–7,
while our settled Fillmore plate manages 2.4 % and 0.8. At the scales that read on a
wall (4–8 px) the reference carries three to five times more structure. The cause is
numerical diffusion: every solver step advects and diffuses the dye, so anything
finer than about eight cells is gone within a second, and nothing generates structure
below the grid.

**The instrument.** The show can be played from the music more directly than
sound-drive-and-hope, and a finished song deserves a rendered film rather than a
screen capture.

| Measure (512 px centre crop) | Pour | Drops | Marbling | Ours now |
|---|---|---|---|---|
| Pixels on a hard edge | 7.3 % | 4.2 % | 5.6 % | 2.4 % |
| Typical local contrast | 7.2 | 2.0 | 6.5 | 0.8 |
| Structure at 4 px | 1.5 % | 0.9 % | 1.3 % | 0.3 % |
| Structure at 8 px | 2.3 % | 2.2 % | 2.5 % | 0.5 % |

`scratchpad/detail.mjs` produces this table. Batch 1 moves it into the repo as
`npm run detail` so every batch is judged the same way.

## Running order

Each batch is one PR: build, test in the sandbox, merge, deploy, then a GPU look on
the Mac before the next one starts. Order is by what lifts everything else first,
and by what would otherwise force a rebase later.

### 1. Sharp liquid, and pigment in it

`src/lib/gpuFluid.ts`, `src/components/LiquidVisualizer.tsx`, `src/types.ts`

- **Interface sharpening** (`sharpness`, 0–1). A counter-diffusion term along the dye
  gradient, applied each step after advection, that restores the step at a boundary
  instead of letting it smear. This is how multiphase solvers keep two fluids apart.
  Clamped so it can only undo diffusion, never amplify beyond the local range of the
  four cells it samples, which is what stops checkerboarding.
- **Granulation** (`granulation`, `grainScale`). Sub-grid pigment texture: a noise
  field sampled in *advected* coordinates, so the speckle travels with the dye
  instead of sitting on the screen, modulated by dye thickness and by how slowly the
  cell is moving (pigment settles where the flow is slack).

Both land in the GPU and CPU solvers so the two engines still agree.

**Gate:** typical local contrast ≥ 3.0 and structure at 4 px ≥ 0.9 % on the Fillmore
frame at the preset's default, with no more than 15 % frame-time cost at 512², and no
oscillation over a 100 s settle. **Risk:** sharpening concentrates dye, so the budget
regulator will bite sooner; recheck every preset's `dyeBudget` in the same PR.
**Fallback:** the settings default to 0, so a bad look is one slider away from the
current behaviour.

### 2. Lacing

`src/components/LiquidVisualizer.tsx` (fragment shader)

The pale hair-thin filaments that outline every colour boundary in a pour. Driven by
the strain rate at the interface (the velocity gradient projected along the dye
gradient, both already available in the shader when the velocity texture is bound),
not drawn as a fixed edge, so it thins where the boundary is stretched and thickens
where it folds. New setting `lacing`; the existing `macroLacing` stays as the macro
camera's own.

**Gate:** pixels on a hard edge ≥ 4.5 %. **Depends on** batch 1: lacing a smeared
boundary looks like a glow, not a filament.

### 3. Drops, not rings

`src/lib/beads.ts`, the bead mask shader

The bead field is the right instinct and already measures well; take it three steps
further, to the second reference frame.

- Each drop carries **its own dye colour**, not just a dark rim.
- **Domed** body with one specular highlight, sized from the lamp's direction.
- **Polygonal flattening** when drops crowd, the way foam packs, instead of staying
  circles that push apart.
- **Compound drops**: a drop that has swallowed a smaller one keeps it visible.

New setting `beadDrops` (0–1) blends from today's dark-rimmed rings to full drops, so
the Fillmore look is unchanged at 0.

**Gate:** on a 2× crop, a 6:1 size range within one cluster, visible highlights, and
flattened contacts between touching drops.

### 4. Liquids that behave differently

`src/types.ts` (`LiquidType` grows behaviour fields), `src/components/LiquidVisualizer.tsx`

Today a liquid is an inject radius, an amount and a heat. Make the liquid kind change
the interface physics:

- **Soap.** Dropping it collapses the surface tension in a disc for a moment, so the
  colour flees outward and then curls into filaments. A real gesture from the era and
  the most performable thing in this batch; it wants a MIDI action and an OSC address
  like the press.
- **Milk.** An opaque, scattering ground that colour rides on top of rather than
  mixes into. Needs an opacity channel in the render rather than pure transmission,
  which is what makes the reference's reds sit so solid under the drops.
- **Silicone.** The cell maker: displaces colour aside into a ring rather than
  colouring it, which is where every cell in a pour comes from. Pairs with batch 3.
- **Glycerine.** Coils and ropes when poured, slow and thick.

**Depends on** batches 1 and 3 to read properly.

### 5. Playing it: sound learn, shutter, and a look link

`src/lib/soundLearn.ts` (new), `src/components/MidiPanel.tsx`, `src/lib/cameraPass.ts`, `src/App.tsx`

- **Sound learn.** The Learn flow that already binds a control to a MIDI knob gains a
  second source: the music. Pick a control, pick kick, bass, snare, hats, level or a
  frequency band, set a depth, and the plate follows it. Onset triggers fire the
  existing actions, so a kick can press the big dish and a bar line can step the
  preset. Our sources beat a plain FFT: the beat clock predicts beats and the song map
  knows bars and sections, so a trigger can land on the beat rather than behind it.
  Needs per-band energies and per-band onsets added to `useAudioAnalyzer`.
- **Shutter** (`shutter`, camera pass). Long exposure where it is physically
  motivated: the reference photographs are long exposures, and their light trails are
  part of why they read as film. Accumulates into the camera's existing scene buffer
  with a decay, coupled to aperture and bloom. Off in the light-show style, on in the
  Photograph presets.
- **Look link.** The whole settings state in a URL, for sending a look between the
  laptop, the phone and anyone else.

Independent of batches 1–4, so this can be built while the Mac is judging a look.

### 6. Render a song

`src/lib/rng.ts` (new), `src/lib/render.ts` (new), `src/hooks/useRecorder.ts`

Step the show frame by frame and encode it, instead of capturing the screen:

- **Seeded randomness first.** There are 104 `Math.random` calls in the solver, the
  beads, the bubbles and the macro camera. Every one becomes a draw from a seeded
  generator carried on the fluid, or the render is not reproducible. This is the real
  work of the batch and the reason it comes last: doing it earlier would collide with
  every batch above.
- **Offline audio analysis.** Pre-compute the bands per frame from the song file, so
  the reactivity is identical every run and not tied to the frame rate.
- **WebCodecs encode to MP4** with the audio track, at a grid the live machine cannot
  hold (768² or 1024²) and a resolution up to 4K, streaming to disk. Chrome only;
  elsewhere the current MediaRecorder capture stays as the fallback.
- Runs a sequence and a per-song preset end to end, so the output is a finished light
  show for that song.

**Gate:** the same song rendered twice is byte-identical, and a 3-minute 1080p render
completes without dropping a frame.

## Not doing

Kaleidoscope, tiling, tunnel, halftone, posterize and solarize: warps of a picture
that would erase the plate's identity. A built-in drum machine: the music file player
already covers rehearsal.

## Operating rules

- The sandbox runs the CPU solver under SwiftShader, so every look is judged on the
  Mac's GPU before the next batch starts.
- One Mac session at a time, committing from a worktree, never while a show is
  running: two sessions in one checkout have already trodden on each other's server
  and files.
- Every new setting is MIDI-learnable, reachable from the phone, and defaults to the
  current behaviour so a preset made today still looks the same tomorrow.
