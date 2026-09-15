# Mac launch and looks after #34

2026-09-14 evening, ChromaGlass Mac (Apple GPU, Chrome 152, 60 Hz, dpr 1). Nothing deployed, nothing committed to main.

## Launch

- `git status --short`: only ` M package-lock.json` and `?? chromaglass/`, so no stash was needed.
- `git pull --ff-only origin main`: 34ba40a → 37c5e10. `git log --oneline -1`: **37c5e10 The controller, drawn; and sharpening without the grid showing (#34)**.
- `npm install`: ok (the usual audit notice). `npm run build`, tail:
  ```
  dist/assets/castProtocol-Clt_oyYj.js   188.90 kB │ gzip:  61.19 kB
  dist/assets/index-C0K2WSFx.js          196.50 kB │ gzip:  61.71 kB
  dist/assets/App-C6Gt1a0x.js            363.67 kB │ gzip: 108.99 kB
  ✓ built in 1.11s
  ```
- Killed the old server (pid 17349, key 1415). The new server is **pid 18430**:
  ```
  Show key:           3523
  Laptop (the show):  http://localhost:3000/
  OSC in:             udp port 9000
  Phone (the remote): http://192.168.0.234:3000/?remote=1&key=3523
  Network display:    http://192.168.0.234:3000/?cast=true&key=3523
  ```
- `curl http://localhost:3000/` → **200**.

## Conditions

- James's Chrome had Gmail, YouTube, a BMW configurator and `localhost:3000/?cast=true` open. I didn't touch any of them or the projector.
- Before the looks: GPU 39 %, load average 4.1. MOTIV Mix was at 54 % CPU, WindowServer 46 %, OBSBOT 35 %.
- **The GPU was at 97–100 % for the whole sharpness look.** Keep that in mind for every frame-time number below.

## Look 1: the controller picture

Script: `~/cg-scratch/surface34.mjs`. Installed Chrome, headed, 1600×1000, `?debug`, `midi` permission granted.
- Steps: open the MIDI panel, Enable, then open the controller picture. There's no hardware attached and there was no MIDI error.
- The map started empty (0 bindings) and the picture opened on the APC40 mkII layout.
- `surface-gpu.png` is the empty picture. Then I closed it, pressed APC40 mkII (77 bindings, "made on APC40 mkII") and reopened it: `surface-factory.png`. Then On paper: `surface-paper.png`.

### Counts

| | `[data-bound="true"]` (shows a label) | `[data-bound="false"]` (hardware name only) |
|---|---|---|
| Empty map | 0 | 147 |
| APC40 mkII factory map | **77** | **70** |

On the factory map, the 70 controls that show only their hardware name are:
- 12 clip pads: Clip 5/2–8/2 and the whole bottom row, Clip 1/1–8/1.
- The four button rows under the grid: Act, A|B, Solo and Arm, 32 buttons.
- Master and Stop All Clips.
- The 8 device buttons: Device/Bank arrows, Dev On/Off, Dev Lock, Clip/Dev, Detail.
- Pan, Sends and User.
- Tempo and Cue Level (the two endless encoders) and the crossfader.
- Session Rec, Tap Tempo, Metronome, Nudge −/+, Shift and the four arrows.

### Fit, clipping and readability

I measured each control in the DOM (the SVG draws at 1224×728 px for a 1064×632 panel, scale 1.15):
- **Nothing is clipped.** Every control is inside the picture (0 outside the viewBox), and no two control shapes overlap (0 pairs).
- **The whole overlay fits in 1000 px** without scrolling, legend and notes included.
- **11 labels run past the edge of their own shape by 2–8 px.** On pads: Deep Ocean, Macro Bead, "Microscop…", "Undergrou…". On knobs: Background, Macro Zoom, Music Sync. On small round buttons: "Rando…", two "Sunsh…" and "Emera…". They cross the outline, but none reaches a neighbour. It's visible on Background Loop, Macro Music Sync and Iridescence.
- **15 bound labels are cut off with an ellipsis.**
  - The whole Sel row of dyes: Sunsh…, Sunsh…, Vibra…, Cherr…, Crims…, Emera…, Limpi…, Icy B…. The two Sunshines can't be told apart.
  - Four of the Stop row actions: Rando…, Clean…, Previ…, Next ….
  - Microscop… / Chaos, Velvet / Undergrou…, Iridescen….
- **Readability at 1600 wide:**
  - Bound labels are bold, at least 8 px on screen, and readable: pads, knobs, scene column, transport.
  - The rotated fader labels (Sound Drive … Saturation, Dimmer) are small but readable.
  - The unbound hardware names (Act, A|B, Solo, Arm, Pan, Nudge…) are grey on near-black and only just legible. That's fine as "unassigned", but on paper they're pale grey on white and fainter still.
  - Two dye labels are hard to read against their own fill: Crimson (dark red on dark red) and Icy Blue on paper (pale on pale).
- **Small bug: the crossfader has a vertical line through it.** The fader track line is always drawn vertically, so on the horizontal crossfader (104×24) it cuts through the label as "Cross|fader". `ControllerSurface.tsx:178` should draw it along the long axis.
- **On paper** only turns the panel itself white. The side list and page stay dark, which is fine for Save PNG. The colours stay distinguishable on white, though the pale setting fill and cyan text are lighter.

### Does the factory map sit sensibly on the panel?

Mostly yes. The big groups are where hands expect them:
- **Presets on the clip grid** (purple, 28 of 40 pads, filled from the top row). These are the big lit pads under the right hand, so this is the right place.
- **Sequencer Play/Pause, Previous, Next, Stop and Random down the scene column**, right beside the grid. Good.
- **Faders are the "amounts":** Sound Drive, Evolve Speed, Speed, Dye Budget, Turbulence, Plate Rock, Bubbles, Saturation. **Dimmer is on the master fader**, which is exactly where it should be.
- **Device knobs (left) are the lamp and camera:** Light Play, Lamp Motion, Hot-Spot, Second Lamp / Camera, Focus, Aperture, Bloom. **Track knobs (right) are looks:** Beat Squeeze, Edge Relief, Iridescence, Hue Journey / Background Loop, Round Dish, Macro Zoom, Macro Music Sync. Both are coherent groups.
- **Transport:** Play/Pause, **Blackout** on Stop, Record. Blackout on the big transport button is right.

What I would move:
1. **Dyes off the Sel row and onto the spare clip pads.**
   - Why: the Sel buttons are small, they sit under the faders where a hand on a fader covers them, and their labels truncate to five letters.
   - As far as I know the APC40 mkII track-select buttons light in one colour only, so they can't show the dye colour. The clip pads are RGB, and the picture's own note says "each one lights in the dye or preset it cues".
   - The whole empty bottom row (Clip 1/1–8/1) is free for them, with four more spare on row 2.
2. **Clear, Drain and Clean Screen out of the Stop row.**
   - Why: they sit in one tight row with Seed, Random Evolve, Macro and Previous/Next Preset. It's the same small round button, and the row directly above it is four rows of identical unassigned buttons. A destructive action one button away from Seed is easy to hit by mistake mid-show.
   - Where: Stop All Clips (on its own, and already means "clear") for Clear. Shift+ or a device button for Drain and Clean Screen.
3. **Previous/Next Preset onto the Bank ←/→ or Left/Right arrows.**
   - Why: arrows read as "previous/next" and are free. It also separates preset stepping from the scene column's Sequencer Previous/Next, which sounds the same.
   - The same goes for the two "Random"s: Random (scene 5) and Random Evolve (Stop 4) look alike on the picture.
4. **Use the free continuous controls.** Tempo and Cue Level are endless encoders and the crossfader is unbound.
   - The crossfader is a natural home for a blend-type control (Evolve Speed or Sound Drive), which would free a channel fader.
   - Cue Level could nudge Dimmer finely or scroll presets.
5. **Labels:** give the Sel/Stop rows a two-line label, or let text overflow onto the panel below the button, so dyes and actions stay readable. The pads could also take a smaller font before truncating.

## Look 2: sharpening after the isotropic stencil

Script: `~/cg-scratch/sharp2.mjs`, the same method and crop as the #32 look (`sharp1b.mjs`).
- Fresh page per value at `?debug&sim=512`: pick Fillmore East, 1969, then set Sharpness through Settings.
- The slider read back 0 / 0.5 / 1, and `settings.sharpness` matched.
- Capture with `toDataURL` at 25 s, 2× crop of (800,380)–(1160,680). Then `status.frameMs` once a second from 26 to 45 s.
- Every run was GPU · 512² · 1.0x, with no NaN at any value.
- Each page is a new random composition, so compare kinds of edge, not blobs.

Files:
- Full frames: `sharp2-0.png`, `sharp2-05.png`, `sharp2-1.png`.
- 2× crops: `sharp2-crop-0.png`, `sharp2-crop-05.png`, `sharp2-crop-1.png`.
- Small-dish zooms: `sharp2-zoom-dish-05.png` and `sharp2-zoom-dish-1.png` (330,240 300×260, 2×).

### readDensity mean (`fluids[0].readDensity`)

| Sharpness | start | 25 s | 45 s | max |
|---|---|---|---|---|
| 0   | 0.728 | 1.214 | 1.200 | 6.0 |
| 0.5 | 0.760 | 1.245 | 1.224 | 6.0 |
| 1   | 0.802 | 1.283 | 1.280 | 6.0 |

These are the same band as the #32 look (and still above the 0.9 budget), so the new stencil doesn't add or drain dye.

### detail.mjs (installed Chrome via `CHROMIUM_PATH`, run from `~/cg-scratch`)

```
file                       edge% p50g p99g sat hues  detail by scale (1,2,4,8,16,32 px, % of variance)
sharp2-0.png                 6.4  1.1 70.6 0.38   12     0.4  0.2  0.4  0.7  1.3  2.9
sharp2-05.png                  7    1 75.6 0.35   12     0.4  0.2  0.5  0.9  1.9  4.3
sharp2-1.png                 7.7  1.1 86.7 0.36   16     0.5  0.3  0.7  1.2  2.4  5.5
```

- **0 to 0.5:** blob-scale detail (16/32 px) rises 1.3/2.9 → 1.9/4.3, about +47 %. #32 gave 0.8/1.9 → 1.1/2.7 at its 0.5, about +40 %.
- **Fine scales stay flat:** 1/2 px reads 0.4/0.2 at both values, so the extra detail is not pixel noise.
- **1.0:** p99g jumps to 86.7, but saturation doesn't collapse (0.36 vs 0.38 at 0). At #32's 1.0 it fell 0.44 → 0.38.

### frameMs

This is `status.frameMs` once a second, median over t = 26–45 s (n = 20). The rAF column is the real frame interval from counting rAF frames in the page over the same 20 s.

| Order | Sharpness | frameMs median | rAF ms | GPU % |
|---|---|---|---|---|
| run 1, page 1 | 0   | **16.92** | 16.75 | 97–100 |
| run 1, page 2 | 0.5 | **38.30** | 27.70 | 97–99 |
| run 1, page 3 | 1   | 41.41 | 31.10 | 96–99 |
| run 2, page 1 | 0.5 | 38.09 | 27.47 | 95–99 |
| run 2, page 2 | 0   | 37.14 | 26.42 | 98–99 |
| run 2, page 3 | 0.5 | 43.63 | 29.81 | 96–99 |
| run 2, page 4 | 0   | 42.60 | 30.77 | 97–99 |

**Run 1's 16.9 vs 38.3 is load, not the setting.**
- The 0 page ran at the 60 Hz floor while the GPU was already at 99 %. Everything after it ran slower, including the 1 page (32 fps).
- I repeated in reverse, alternating 0.5 / 0 / 0.5 / 0 (`~/cg-scratch/sharp2r.mjs`). Each 0.5 page is about 1 ms slower than the 0 page right after it: 38.1 vs 37.1, and 43.6 vs 42.6.
- The drift across the run is 5–6 ms, larger than that gap.

**For the frame budget:** the 0.5 pass at 512² costs about 1 ms per frame against about 37–43 ms frames, roughly 2–3 %, and that is within the noise.
- It is well inside a 15 % budget.
- On a quiet GPU it would still sit under the 16.7 ms vsync floor, as #32's 0.5 did.
- The GPU dropped back to 38 % once my pages closed, so most of the 97–100 % was my Playwright page on top of James's open tabs.
- It's still not a step-level measurement: vsync or load hides anything smaller.

## Answers

**Are the grid-aligned stair-steps at 0.5 gone?** Gone in the places I looked.
- In #32's 0.5 frame, angled boundaries broke into horizontal and vertical runs with right-angle notches. I looked at the same kind of place in the new 0.5 frame at 3–4× zoom:
  - the diagonal edges of the red core (`~/cg-scratch/sharp2/zoom/05-core.png`, 850,430)
  - the curved outline of the green/red blob against the pale cells (720,260)
  - the pink blob at the top right of `sharp2-crop-05.png`
  - the cyan patch's lower edge
- All of them follow the curve with no right-angle notches.
- What's left is a fine crinkle along some edges, 1–2 px and not aligned with x or y, most visible on the red core's upper-left edge. It reads as a liquid edge, not a grid.

**Is the fur at 1.0 gone?** Gone in the main dish, but 1.0 has two new faults of its own.
- **The combing is gone.** #32's 1.0 grew short parallel hairs perpendicular to every red/dark boundary. The new 1.0 has none: boundaries are clean curves, and the green blob in the crop has a smooth outline. There are no pale washed-out regions either, and saturation holds.
- **New: a thin bright rim.** Most boundaries get a 1–2 px light line along them, like a halo from overshoot. The clearest example is the bright green line around the green blob at (730,250). The effect is outlined blobs, like a cel drawing.
- **New: blocky grid artefacts in the small left dish.** Its smooth blue/purple/green gradient breaks into axis-aligned rectangles and streaks (`sharp2-zoom-dish-1.png`). At 0.5 the same area is a clean smooth gradient (`sharp2-zoom-dish-05.png`), and at 0 it is too.
  - So the grid still shows at full strength where the dye is thin and the gradients are shallow.
  - My guess, not tested: the clamp or limiter lets the sharpening amplify tiny differences there.

**Is the sharpening still doing its job at 0.5?** Yes, if anything slightly more than #32's 0.5.
- At 0 (`sharp2-crop-0.png`), the red core fades into the yellow-green over 20–30 px with a soft wobbly edge.
- At 0.5 (`sharp2-crop-05.png`), the core is a defined red shape with a crisp edge against green and the pale cells, and the pink blob at the top right has a clean outline.
- detail.mjs agrees: 16/32 px detail is up about 47 %, with no rise at 1–2 px.

**Frame cost:**
- Median frameMs: 16.92 at 0 vs 38.30 at 0.5 in run 1, but that gap is load (see above).
- The paired repeat gives 37.14 at 0 vs 38.09 at 0.5, and 42.60 vs 43.63.
- So 0.5 costs about 1 ms, 2–3 %.

**Would I move the default off 0.5?** No, keep 0.5.
- It now sharpens colour boundaries a little more than #32's 0.5 did, without the stair-steps that were its one fault.
- I saw no rims, fur or blockiness at 0.5, and it costs nothing measurable.
- #32's fallback of 0.35–0.4 isn't needed any more.
- If anything needs changing, it's the top of the slider. 1.0 is usable in the main dish, but the outline rims and the small dish's blockiness say 0.7–0.8 would be a safer maximum. It's also worth checking why thin-dye gradients go blocky at full strength.

## Anything else

- **Server log shows reconnect cycling.** The `display connected / disconnected (1 now)` lines match my Playwright pages opening and closing.
- **What was loading the GPU.** During the look, Chrome's GPU helper was at 43 % CPU and the GPU at 97–100 %.
  - The three sockets on :3000 were all my Playwright Chrome.
  - James's Chrome had YouTube open and the `?cast=true` tab, which likely went stale after the restart (#32 look).
  - When my pages closed, the GPU fell back to 38 %. So the frame times here are my 512² page sharing the GPU with James's tabs, not a quiet machine.
