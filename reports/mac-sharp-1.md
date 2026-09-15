# Mac sharpness look after #32

2026-09-14 evening, ChromaGlass Mac (Apple GPU, Chrome 152, 60 Hz, dpr 1). Nothing deployed, nothing committed to main.

## Part 1: launch

- `git status --short`: only ` M package-lock.json` and `?? chromaglass/`; no stash needed.
- `git pull --ff-only origin main`: b13c139 → 34ba40a. `git log --oneline -1`: **34ba40a Sharp liquid: boundaries that stay boundaries (#32)**.
- `npm install`: ok (the usual audit notice). `npm run build`: tail
  ```
  dist/assets/castProtocol-DEdRQmiY.js   183.89 kB │ gzip:  59.57 kB
  dist/assets/index-QCYoraKv.js          196.50 kB │ gzip:  61.71 kB
  dist/assets/App-Dqsz7MK7.js            349.43 kB │ gzip: 104.35 kB
  ✓ built in 1.17s
  ```
- Old server pid 15430 (key 8142) killed; new server **pid 17349**.
  ```
  Show key:           1415
  Laptop (the show):  http://localhost:3000/
  OSC in:             udp port 9000
  Phone (the remote): http://192.168.0.234:3000/?remote=1&key=1415
  Network display:    http://192.168.0.234:3000/?cast=true&key=1415
  ```
- `curl http://localhost:3000/` → **200**.

## Conditions

- Before shooting: GPU 46–55 % busy, load average 4.5. OBSBOT_Main at ~100 % CPU, MOTIV Mix 55 %, WindowServer 42 %.
- James's Chrome had `localhost:3000/?cast=true` open (the projector tab) plus Gmail, YouTube and Gemini. I didn't touch any of them.
- Frames were captured with `toDataURL` on `#liquid-canvas`, so there's no UI in them.
- Method: a fresh page per value at `?debug&sim=512`. Each run picked Fillmore East, 1969 from the title menu, then set Sharpness through Settings with the value setter plus an `input` event. The slider read back 0 / 0.5 / 1, and `settings.sharpness` matched. Then it waited 25 s and captured.
- Every run was GPU 512² at 1.0x.
- Script: `~/cg-scratch/sharp1.mjs`.
- Each page starts a new random composition, so the three frames show different plates. Compare the kind of edge, not individual blobs.

## Numbers

### readDensity (`fluids[0].readDensity`, 36864 cells), start → end of the 25 s

| Sharpness | mean | NaN | max |
|---|---|---|---|
| 0   | 0.719 → 1.111 | 0 → 0 | 3.62 → 6.00 |
| 0.5 | 0.719 → 1.038 | 0 → 0 | 3.74 → 6.00 |
| 1   | 0.732 → 1.183 | 0 → 0 | 3.28 → 6.00 |

A repeat run held each value for 45 s, in the order 1, 0, 0.5:
- Sharpness 1: 0.739 → 1.073
- Sharpness 0: 0.711 → 1.025, max 5.04
- Sharpness 0.5: 0.798 → 1.235

There was no NaN at any value. Density ends in the same 1.0–1.2 band at all three values, so the pass doesn't visibly drain or add dye.

### frameMs (`status.frameMs` once a second; median of the last 20 s)

| Sharpness | run 1 (sequential 0, 0.5, 1) | rAF ms (run 1) | run 2 (1, 0, 0.5; GPU 97–99 %) | rAF ms (run 2) |
|---|---|---|---|---|
| 0   | **16.96** | 16.67 | 39.9 | 25.8 |
| 0.5 | **16.90** | 16.67 | 45.8 | 33.2 |
| 1   | **27.4** (16.9 for 12 s, then 22–38) | 20.2 | 21.7 (22–26, back to 16.9 at 37 s) | 17.6 |

What this shows about the ≤15 % budget:
- **Run 1:** 0 and 0.5 are the same, pinned at the 60 Hz vsync floor. The 0.5 pass costs less than the headroom under 16.7 ms, but vsync hides anything smaller.
- **Run 2 is load, not Sharpness.** GPU sat at 97–99 % from start to finish, and the 0 page came out *slower* than the 1 page. Run 1's 1.0 slowdown also began 12 s in, not when the value changed. I can't attribute it to the pass.
- **The direct measurement didn't finish.** I tried timing `GpuFluid.step` directly, alternating 0/0.5/1 in 4 s blocks with a forced GPU sync (`~/cg-scratch/sharpbench*.mjs`). Both attempts ended with the Playwright page closing. The second closed during the initial 10 s load wait, before any hook was installed. The cause was outside the script; James was using the Mac at the time. I stopped there rather than keep opening windows on his screen.
- **So the step-level cost is still unmeasured.** Honest summary: at 512², 0.5 shows no frame-time cost above vsync noise on a moderately loaded day. Under heavy GPU load the frame time follows the load, not the setting.

### detail.mjs on the three full captures

The script's default was Playwright's own headless shell (build 1243), which isn't downloaded on this Mac. I ran it with `CHROMIUM_PATH` set to the installed Chrome.

```
file                       edge% p50g p99g sat hues  detail by scale (1,2,4,8,16,32 px, % of variance)
sharp-gpu-0.png              4.7  0.8 74.7 0.44   16     0.3  0.1  0.2  0.4  0.8  1.9
sharp-gpu-05.png             4.8  0.9 68.1 0.43   14     0.2  0.1  0.2  0.5  1.1  2.7
sharp-gpu-1.png              6.6  0.9 89.9 0.38   18     0.3  0.2  0.3  0.6  1.3  3.2
```

- **Edge% at 0 is inflated.** It reads 4.7 %, not the header's 2.4 %, because the centre crop includes the dark bead outlines, the plate-cells honeycomb and the dish rim, and all of those count as hard edges.
- **0 to 0.5:** edge% is flat. Detail at 8/16/32 px rises (0.4/0.8/1.9 → 0.5/1.1/2.7), which is sharper boundaries at blob scale.
- **1.0:** edge% jumps to 6.6 and p99g to 89.9, but saturation drops to 0.38. That matches what the frame shows: fringes and washed-out patches.
- **Caveat:** each value is one frame of a different composition, so these numbers are indicative only.

## Answers

**Does 0.5 look better than 0?** Yes, modestly. It is sharper edges, not contrast: saturation and p50 are unchanged.
- **Harder boundaries.** In `sharp-crop-05.png` the red core blob has a defined outline against the yellow. At 0 (`sharp-crop-0.png`) the red fades out over 20–40 px. The yellow/red boundary at the top of the crop is a clean line.
- **No black holes, checkerboard or colour fringing.** I found none that weren't already there at 0. The dark pockets at the dish rim on the right exist at 0 too.
- **One new artefact: grid-aligned stair-steps.** A few boundaries break into straight horizontal and vertical runs with right-angle notches. In `sharp-gpu-05.png`, look at the yellow notch near (925,380), the red/green step near (940,750), and the red lobe edge near (800,260).
- **Faint streaks in the small dish.** Its green/purple boundary picks up brush-stroke texture.
- **Overall:** mild at 1600×1000, but it's the start of what goes wrong at 1.0.

**Is 1.0 too much?** Yes. It looks like posterized blobs with combed, hairy edges, not liquid.
- **Fur along boundaries.** Nearly every red/black and red/grey boundary grows short parallel streaks perpendicular to the edge. See the top at (960,260), the bottom-left at (760,700), and the bottom edge of the grey patch in `sharp-crop-1.png`, which is a sawtooth.
- **Flat, washed-out regions.** Large areas go flat pale cyan-white (e.g. left of centre, (650,560)), and saturation falls 0.44 → 0.38.
- **Dark blotches.** Dark patches open at the top (740,260) and bottom (830,820) of the dish.
- **Small dish.** Its gradient turns into streaky brushwork.
- **Numbers:** there's no NaN and no checkerboard, but it isn't a plate you'd project.

**What does it cost at 512²?**
- **0.5:** no measurable frame cost. The median was 16.90 ms against 16.96 ms at 0, both at the vsync floor, so well inside ≤15 %.
- **1.0:** the only slow reading (27 ms) started 12 s in. The repeat run under full GPU load had 1.0 as the *fastest* page, so that reading is load.
- **Not measured:** the step-level cost with the vsync ceiling removed. My benchmark page was closed from outside twice (see above).

**Default:** keep **0.5**, which is already the shipped `DEFAULT_SETTINGS` value.
- **Why 0.5:** it's the only one of the three that sharpens colour boundaries without adding holes, fur or fringing, and it costs nothing visible.
- **What would change my mind:** if the stair-stepping bothers anyone on the projector, 0.35–0.4 is the place to try next, not 0.
- **Slider range:** I'd consider mapping the top of the slider lower (e.g. 0.6–0.7 of today's strength). Everything past about 0.6 is heading toward the 1.0 look.

## Anything else

- **The artefacts line up with the grid axes.** Both the stair-steps at 0.5 and the fur at 1.0 run horizontally and vertically. That suggests the anisotropy of the 4-neighbour stencil and clamp; a diagonal (8-neighbour) min/max or flux might round them off.
- **Fillmore doesn't set `sharpness`.** A preset pick keeps whatever the slider says, and a fresh load starts at 0.5 from `DEFAULT_SETTINGS`. So "0" is no longer the look anyone gets by default, and the other presets are all at 0.5 too.
- **Density overshoots the 0.9 budget.** The mean reaches 1.04–1.18 by 25 s at every Sharpness value, and max sits at the 6.0 cap. That's the regulator overshoot from drain-2, now against the lower #29 budget.
- **detail.mjs header vs this Mac.** The header says `CHROMIUM_PATH` unset is fine, but here it fails with "Executable doesn't exist … chromium_headless_shell-1243". Either `npx playwright install chromium-headless-shell` in ~/cg-scratch, or default the script to the installed Chrome.
- **The projector tab doesn't seem to have reconnected.** After the restart, `lsof` shows no client connections on :3000 once my pages close. The `display connected / disconnected` lines in the server log match my Playwright pages. James's `?cast=true` tab is still open, but it may be showing the stale show from before the restart. I left it alone.
