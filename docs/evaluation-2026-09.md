# Evaluation, September 2026: visuals, controls, efficiency, settings

This evaluation was taken on a MacBook with an Apple M4. The numbers come from the app itself, running headless Chromium on Metal. Motion and colour measurements are made on the picture the app draws, alternating settings so drift cancels. Frame and step rates are read from the app's own counters.

## What was wrong, in one paragraph

Most of the plate's forces did nothing you could see. The solver clamps its lasting velocity to 0.002 at the end of every step. At the tuned timestep that is about 0.05 cells a second, so 99.7% of dyed cells sat exactly at the cap in every look measured. Everything that visibly moves the picture is a push added after the pressure solve: fingering, colour repulsion, bursts. Each one moves the dye for a single step and is then clamped away. Forces written to build up over time did nothing: turbulence, spin, buoyancy, centre gravity and plate tilt. The turbulence's noise gradient was also never divided by its span, which put it at about 1% of its intended strength. Around those were a dozen controls with range bugs, gates or no reader at all.

## Fixed

| Area | What it did | Now |
|---|---|---|
| Turbulence (#71) | Same motion at 0, 0.3 and 1.0 (0.0016). | An RMS flow speed. Motion is 0.0031, 0.022 and 0.031 at 0, 0.5 and 1.0. |
| Spin (mid/treble) | About 1% strength (same missing division). | Intended strength. |
| Logo opacity | Invisible below 50%, popped in at half strength. | Any opacity draws. |
| Random evolve (desks) | Changed the evolve *rate*; evolving stayed off. | The real switch. |
| Macro zoom | Every zoom from 1.05× to 4× rendered at 4×. | 2.5× renders about 2.8× (the camera eases). |
| Sound Mappings → velocity | Never read. Density "none" silenced all music reactions. | Drives the burst. Density gates only its own pulse. |
| Hue journey | Only ran while evolving. Minutes ran on the solver clock (3.5 min to 8 s). | Wall clock, always. |
| Oil beads | Repopulated every frame before a stroke, almost never after. | Their own clock. |
| Beads, bubbles, soap/milk | Rode the clamped remainder, ~50× faster than the dye; ignored turbulence. | Ride the flow the dye rides, on its clock. |
| Vibration | Nothing below ~0.6, nothing without a mic. | Works in silence and swells with music. #72's first version was too deep and too fine and broke the high-vibration looks into squares; #73 made it a shimmer (52- to 15-cell wave). |
| Rain drip | Invisible pull; friction on at full past 0.1; pointed uphill. | A downhill streak current; friction scales with it. |
| Heat Intensity, Boiling Point | Read by nothing. | Removed from the UI (the keys stay in saved looks). |
| Dark banding | 8-bit targets; the only dither faded out below luma 0.03. | One-step triangular dither at every final write. Never on true black. |
| GPU catch-up | Keyed to JS time (~0.4 ms), so a GPU-bound frame always owed 4 steps. | Also keyed to frame time. |
| Ranges | Speed 0–1, Evaporation 0–1 in 0.05 steps, Dye Budget 0–1.5 on MIDI and phone. | Speed 0–0.3, Evaporation 0–0.08 in 0.0005 steps, Dye Budget 0.1–1.2. |
| Layers | "+" could add a third layer that was simulated but never drawn. | Two. |
| Settings search | 66 of 97 labels, typed as shown, didn't find their section. ⌘K matched names only. | Labels indexed, word-by-word matching. ⌘K matches terms and labels. |
| Flash Limit | Last switch of the longest section. | Also beside Dimmer and Blackout. |
| Names | "Projectors" meant a section and a slider. | The slider is "Dish Spread". |

## Efficiency on this machine

Pinned rungs, vsync on, full-window Perform mode, two layers:

| Rung | App fps | Solver steps/s |
|---|---|---|
| 256² @1× | 55 | 60 |
| 384² @1× | 54 | 60 |
| 512² @1× | 28 | 57 |
| 768² @1× | 9 | 32 |
| 512² @2× (Retina) | 10 | 35 |

The governor settles on **384² at 1×** here. Two things keep it there.

**The solver is about 80–90 full-grid passes per step per layer.** Two full pressure projections of 24 Jacobi iterations each account for 48 of them. Pressure starts from zero every time. Warm-starting it, and folding the squeeze solve into the projection, are the largest savings available: roughly 11 passes a step come out of the squeeze alone.

**The display shader keeps Retina out of reach.** At 256² the frame rate is 53 fps at 1×, 41 at 1.5× and 18 at 2×, with the solver nearly free. The per-pixel look samples the dye field around 320 times per pixel with both layers on. That work includes the Sobel normal, boundary edges and the lacing walk, all of which are functions of a 384–512² field. Computing them once at grid resolution into a derived texture would cut per-pixel fetches to a handful and make 1.5–2× affordable.

The earlier `docs/bench/macbook-m4.txt` figure of 59 fps at 512² was one layer on the smaller Design stage. The table above is the show setup.

## Still to do, in order

1. **Real lasting flow (the biggest remaining lever).** Replace the end-of-step speed clamp with drag and a per-step displacement cap. Warm-start the pressure. Give density-weighted forms to the forces that should build up over time: rocking, a concave dish, heat from the lamp. Buoyancy and the airflow's lift also have the same inverted sign the drip had; they are still too weak to see.
2. **Derived-field pass for the display shader**, for Retina and weak GPUs (above).
3. **Transmission optics.** The plate is drawn as coloured light over black; a projector sends lamp light through dye. Thin dye should be pale, thick dye deep, and overlaps darker. This changes every look, so it should ship behind a flag first.

   It also has to arrive together with the fix for thick dye. The packed colour channels clip above 8 while the density they are divided by does not, so thick dye decodes pale (thick red as pink). Fixing that alone was tried and reverted. The hue is fixed per unit and only opacity follows thickness, so the clip is the only thing that makes a thick pool look different from a thin one. Without it, Boiling Point and Acid Trip flattened to single colours. Packing the colour at 1/40 in an 8-bit texture also cost precision in thin dye.
4. **Settings structure.** Put a Live/Master section first (Dimmer, Blackout, Flash Limit, Speed). Split the Projectors grab-bag (wall geometry vs look effects vs film). Move the patch bay and its four masters into a single Patches section. Give each setting one range across every surface (sheet, desk, MIDI, phone and sequencer disagree for Speed, Dye Budget, folds and zoom).
5. **Looks that depend on music.** Acid Trip and Lava Lamp draw almost nothing in silence (the LED wheel or a flat wash). They should be judged with music playing before being retuned.
