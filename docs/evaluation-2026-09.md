# Evaluation, September 2026: visuals, controls, efficiency, settings

This evaluation was taken on a MacBook with an Apple M4. The numbers come from the app itself, running headless Chromium on Metal. Motion and colour measurements are made on the picture the app draws, alternating settings so drift cancels. Frame and step rates are read from the app's own counters.

> **Test with music, and hold the look still.** Headless Chromium hears nothing, so the first rounds of comparisons ran on a silent plate. That hid most of what the audio does, and it hid one real regression (below). Set `localStorage['chromaglass-audio-source'] = 'simulated'` to get the built-in band. Also turn off `onNewSong`: its default cues a different look on every simulated song change, which makes before/after galleries compare different looks. And enter every look from the same predecessor, because looks inherit whatever they don't set.

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
| Beads, bubbles, soap/milk | Rode the clamped remainder, ~50× faster than the dye; ignored turbulence. | Ride the flow the dye rides, on its clock (#74). This exposed a second bug: soap was advected at the wall-clock step (5–6× the dye) by a backtrace that doesn't conserve mass, so under music it multiplied ~15× and thinned the dye everywhere. Solar Flare kept half its dye. #76 moves it at the dye's rate and conserves it. |
| Vibration | Nothing below ~0.6, nothing without a mic. | Works in silence and swells with music. #72's first version was too deep and too fine and broke the high-vibration looks into squares; #73 made it a shimmer (52- to 15-cell wave). |
| Rain drip | Invisible pull; friction on at full past 0.1; pointed uphill. | A downhill streak current; friction scales with it. |
| Heat Intensity, Boiling Point | Read by nothing. | Removed from the UI (the keys stay in saved looks). |
| Dark banding | 8-bit targets; the only dither faded out below luma 0.03. | One-step triangular dither at every final write. Never on true black. |
| GPU catch-up | Keyed to JS time (~0.4 ms), so a GPU-bound frame always owed 4 steps. | Also keyed to frame time. |
| Ranges | Speed 0–1, Evaporation 0–1 in 0.05 steps, Dye Budget 0–1.5 on MIDI and phone. | Speed 0–0.3, Evaporation 0–0.08 in 0.0005 steps, Dye Budget 0.1–1.2. |
| Layers | "+" could add a third layer that was simulated but never drawn. | Two. |
| Settings search | 66 of 97 labels, typed as shown, didn't find their section. ⌘K matched names only. | Labels indexed, word-by-word matching. ⌘K matches terms and labels. |
| Flash Limit | Last switch of the longest section. | Also beside Dimmer and Blackout, in a new **Master** section the sheet opens on (#75). |
| Names | "Projectors" meant a section and a slider. | The slider is "Dish Spread". |

## Every slider, tested

All 94 sliders in Settings were tested on the M4 with music playing, on the classic look, with each control's prerequisite switched on where it has one (Grain Size with Granulation, the camera's controls with the camera on, the macro's with the zoom in). There were two methods:

- **Simulation controls:** alternate the ends of the range and measure the picture's motion, brightness, colour and edge detail, with repeats to separate the control from the plate's own chaos.
- **Display-only controls:** freeze the liquid and change only that control, so the difference between two images of the same frame is the control and nothing else. This method is the more reliable of the two. The statistical one missed Glossiness and Lamp Warmth, which are obvious on a frozen frame (0.047 and 0.051 per channel).

| Result | Controls |
|---|---|
| **Working, measured** | Speed, Dimmer, Sensitivity, Sound Drive, Beat Prediction, Beat Squeeze, Turbulence, Dye Budget, Edge Relief, Lacing, Granulation, Grain Size, Glossiness, Boundary Glow, Saturation, Post Blur, Gooey, Oil Beads, Plate Cells, Round Dish, Dish Spread, Camera, Focus, Bloom, Refraction, Kaleidoscope Zoom, Hot-Spot, Second Lamp, Iridescence, Lumia, Gel Wheel, Gel Speed, Lamp Warmth, Exposure, Macro Zoom, Paint Cells, Cell Size, Macro Lacing, Depth/Focus, Edge Detail, Relief, Chase Speed, Glass Smear, Rain Drip, Polarity, Diffusion, Layers, Rotation |
| **Depends on the scene** | Thin Film and Micro-Droplets (thin dye only), Light Play (needs edge relief or bubbles), Bubbles and Plate Rock (fire on kicks), Blob Surface Tension (needs polarity), Fingering (shows with the Press tool), Layer Scale Variety and Background Loop (need a second layer with dye on it), Sound Impact (needs a patch in The Room) |
| **Weak** | Sharpness (fixed per texel against a diffusion that grows with the grid; its own comment says it measured nothing), Turbulence Detail (fine octaves are small by design now), Chromatic Aberration and Aperture (about a pixel), Bass Boost (the band's bass already saturates the scale) |
| **Structurally dead until the flow pass** | Buoyancy, Centre Gravity, Heat Decay, Blow Velocity's lift. They act only through the lasting velocity, which the end-of-step clamp holds at 0.002. Plate Pressure only adds ~39% to Speed. |
| **Not testable headless** | The room camera's six, the film's four, the logo's four, Hue Journey (minutes), Beat Lead (timing) |

Advection, Damping, Evaporation, Evolve Speed and LED Speed read as "no effect" on the statistical test, but their code paths are direct: advection scales every step's transport. They are judged by code rather than by that number.

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

**Since then: the derive pass.** On a frozen classic frame at 3×, the Sobel normal, the interface line and the gooey blur cost 19, 10 and 6 ms of a 48 ms frame. The lacing walk costs nothing measurable. A derive pass now works the normal and the line out once per texel per plate, and the display interpolates them. The blur runs nine moment-matched taps where the kernel is narrower than half a texel. The same frozen frame now takes 18 ms against 43 per pixel. Live at 256² and 2×, the app runs at 58 fps against 33. Left to itself at 2×, the governor settles on 384² at 1× either way, but now holds a steady 17 ms there where it ran 20–29 ms (and in one of two runs stepped down to 256²). It still doesn't reach Retina. At 512² and 2× it's 33 fps against 28, because with two 512² plates the frame is now the solver's rather than the display's. The pressure solve's fixed 24 iterations from zero are the next thing to look at. `?derived=0` draws the old per-pixel path for comparison.

## Still to do, in order

1. **Real lasting flow.** Done (#80, #81), though not by removing the clamp. A lasting current now runs beside the per-step flow. It has drag, a cap of 0.75 cells per step, and a warm-started projection on a half-resolution grid. Buoyancy, rocking, centre gravity and the twist build up in it and move the plate. The main pressure solve still starts from zero every step.
2. **Derived-field pass for the display shader.** Done (above).
3. **Transmission optics.** Done (#83), as **Light Through Dye** in Lamp & Light, together with the fix for thick dye. It is on at 0.5 in every look rather than behind a flag. On frozen frames at 0, 0.5 and 1, half gave thick pools depth without crushing dense blue. At 1, dense blue went nearly black and Galaxy lost a third of its brightness. `docs/judging.md` has the switch.
4. **Settings structure.** Done (#79).
5. **Looks that depend on music.** Acid Trip and Lava Lamp draw almost nothing in silence (the LED wheel or a flat wash). They should be judged with music playing before being retuned.
