# Mac launch after #28 and drain measurement 2 — 2026-09-14

Run on James's Mac, `~/chromaglass` on main. Scripts `~/cg-scratch/drain2.mjs` (drain1 with one run and the extension flag) and `~/cg-scratch/press8.mjs` (readPixels captures via `cap7.mjs`); samples in `drain-2.json` alongside, zoom `press-zoom-8.png`. No deploy; nothing committed except this folder on `mac-reports` from the `/tmp/mac-reports-wt` worktree. The shared checkout stays on main with its modified `package-lock.json` and the nested `chromaglass/` clone untouched.

**Load:** not quiet, and busier than measurement 1. James's Chrome had `localhost:3000/` and the projector `?cast=true` open throughout (left alone); GPU 75 % busy before the first page, 88 % after the press run; load average 4.1–4.4. The drain page drew 3985 rAF frames in 100 s (25 ms a frame, measurement 1: 5491 = 18 ms); `status.frameMs` read 17–60 (mean 37). The press page ran at 41–71 ms frames.

## Launch

- `git status --short` before: only ` M package-lock.json` and `?? chromaglass/`, so no stash.
- `git pull --ff-only origin main`: 2f4a711 → **cf9332e "The GPU dye in 32-bit floats: the plate no longer empties (#28)"** (with cd86ad6 "A press clears the palm again; a preset resets the camera (#27)" under it).
- `npm install` clean (npm audit notice only). `npm run build` tail: `dist/assets/App-D1Cus_QV.js 349.28 kB │ gzip: 104.32 kB`, `✓ built in 1.25s`.
- Old server pid 11793 killed (`pkill -f "node server/remote-server.js"`), port 3000 free, new server pid 14778 started detached, log `~/chromaglass-server.log`:

```
  Show key:           2355
  Laptop (the show):  http://localhost:3000/
  OSC in:             udp port 9000
  Phone (the remote): http://192.168.0.234:3000/?remote=1&key=2355
  Network display:    http://192.168.0.234:3000/?cast=true&key=2355
```

- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → **200**.

## The extension

`document.getElementById('liquid-canvas').getContext('webgl2').getExtension('OES_texture_float_linear') !== null` → **true** on this Chrome 152 / Intel Mac, so `GpuFluid` took the RGBA32F dye path (`gpuFluid.ts`: `f32 = !!gl.getExtension('OES_texture_float_linear')`). Checked on both pages.

## GPU 512², Fillmore East 1969, no audio, 100 s

Same method as measurement 1: fresh Playwright page (installed Chrome, headed, 1600×1000, dpr 1), `?debug&sim=512`, load, 5 s, pick the preset from the title menu, then once a second `fluids[0].readDensity` / `fluids[1].readDensity` stats, `settings`, a rAF counter, and dish luminance = mean Rec. 709 luminance of 400 random `gl.readPixels` samples within r = 330 px of (921, 517). "lit" = fraction of cells above 0.05; "top10" = mean of the top 10 % of cells. Measurement 1's GPU numbers in the right half.

| t | density mean | lit | top10 | layer 1 | luminance | frameMs | frames | ‖ m1 density | m1 lit | m1 top10 | m1 layer 1 | m1 lum | m1 frames |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.713 | 0.704 | 1.90 | 0.419 | 128.6 | 42.3 | 3 | ‖ 0.796 | 1.000 | 1.81 | 0.000 | 131.0 | 2 |
| 10 | 0.937 | 0.724 | 3.34 | 0.410 | 118.5 | 30.5 | 465 | ‖ 0.467 | 0.687 | 1.81 | 0.195 | 115.3 | 513 |
| 25 | 1.211 | 0.793 | 4.65 | 0.396 | 123.1 | 27.2 | 1198 | ‖ 0.286 | 0.677 | 1.72 | 0.062 | 69.1 | 1294 |
| 50 | 1.330 | 0.830 | 4.54 | 0.374 | 119.6 | 44.1 | 2279 | ‖ 0.224 | 0.314 | 1.68 | 0.009 | 48.1 | 2669 |
| 75 | 1.286 | 0.847 | 4.02 | 0.354 | 114.0 | 38.8 | 3151 | ‖ 0.122 | 0.246 | 0.99 | 0.001 | 29.7 | 4074 |
| 100 | 1.366 | 0.891 | 3.74 | 0.336 | 109.5 | 45.7 | 3985 | ‖ 0.138 | 0.211 | 1.17 | 0.000 | 24.5 | 5491 |

(Measurement 1's t = 0 row was taken before the seed had been read back, hence layer 1 = 0 there; its layer-1 series started at 0.388 at frame 47.)

**Per-step factor of layer 1:** 0.4194 at frame 3 → 0.3359 at frame 3985, 3982 steps, endpoint factor **0.999944 a step** (least-squares on log over all 101 samples: 0.999944, half-life ≈ 12 300 steps). Measurement 1 on the same GPU path: 0.99858 (half-life 491 steps). The setting's nominal `evapFactor` is 0.99996 (1 − 0.002 × 0.02), so the GPU now loses 5.6 × 10⁻⁵ a step against the nominal 4.0 × 10⁻⁵: 1.4× the setting where it was 35×. The CPU in measurement 1 read 0.99996 exactly.

**Does the plate hold its dye like the CPU did?** Yes. Layer 0 rises 0.71 → 1.21 at 25 s → 1.37 at 100 s (measurement 1's CPU: 0.71 → 1.20 over 2249 steps; this run at 2249 steps was at t ≈ 49 s, density 1.33). The lit fraction climbs 0.70 → 0.89 (CPU: 0.71 → 0.85) instead of falling to 0.21, and top10 goes 1.9 → 4.7 by 25 s (CPU: 1.9 → 3.6). The dish luminance holds 129 → 110 rather than 131 → 25. `dyeBudget` 1.2, `evaporationRate` 0.002, `dimmer` 1 on every sample, as before.

## Press check, after #27

Pinned `&sim=512`, Fillmore, 25 s settle polled, Press tool, 4 s at (921.6, 517) with the usual 1 px wiggle every 100 ms, `gl.readPixels` capture (no CDP screenshot) at the end of the settle and 1 s after release; `press-zoom-8.png` is the 300×300 round the press point at 2×. Grid stayed 512², `fingering` 0.85, `cells` 0.2, `beads` 0.8, 348 beads.

| | look 6 (#24) | look 7 (#25) | **this (#27 + #28)** |
|---|---|---|---|
| r < 20 px luminance before → after | 134 → 26 (clear) | 142 → 202 (blob) | **212 → 193** (faint pit) |
| 20–40 px | | 137 → 182 | 212 → 227 |
| 40–70 px | | 127 → 178 | 209 → 211 |
| 70–100 px | | 115 → 163 | 206 → 198 |
| 100–130 px | | 107 → 139 | 180 → 183 |
| dish mean (r < 330) | | | 136 → 138 |

The blob is gone: the after frame is a smooth cyan-green palm about 150 px across with a small dark dot (about 15 px) at the press point and a slightly brighter ring at 20–40 px, and the bead outlines that covered the palm before have been swept out of it. It is not clear glass either: the centre is only 19 units (9 %) darker, where look 6 dropped it to 26. Note the palm is much brighter before the press than in looks 6 and 7 (212 vs 134/142) because the plate now holds its dye: at 25 s the density mean is 1.10 against 0.29 on the old build, and the cyan patch under the press point is near the render's top (69 % of r < 20 px pixels have a channel at 250+, 0 % have luminance 250+). The press is thinning a plate that is nearly saturated on screen.

**Spokes and rim** (`tips.mjs` / `rimprof.mjs`, six deepest minima of the 70–110 px ring of the after frame): only three angles have any depth (11°, 342°, 358°, depths 90–100), and those are the red patch to the right of the dish that the press shoved into the ring (luminance ~100 against 190–207 before), not dark finger channels; the other three (281°, 295°, 308°) have depth ≤ 6, i.e. no channel. No finger channels are visible in the zoom at all. Along the three "channels" `rimprof` finds the channel end at 104–124 px and a first local maximum of the after profile 14–18 above before at 108–144 px, but the after profile is flat there (108–118 on 342° and 358° across 110–200 px; 134 → 152 → 118 on 11° matching before's 161 → 141 → 124): the positive deltas sit where the before frame had a dark bead outline, not on a bump above the surrounding after field. So: **no rim at any spoke, no channels, no blob, a faint pit.**

## Anything else

- The density mean now overshoots the 1.2 budget (1.21 at 25 s, peak 1.38) and then holds at 1.25–1.37 from 30 s on, while top10 falls 4.7 → 3.7 from 45 s and luminance drifts 129 → 110: the regulator is now the thing shaping the plate after 30 s (it never bit on the old build because the mean never reached 1.2).
- `status.frameMs` still over-reads under load: 37 ms mean against 25 ms from the rAF count.
- Beads: 348 throughout; `beadList` not re-measured.
- `fluids[0]` own keys after #27: `squishKey` is gone (`squishSteps, squishLastAt, squishLastStep` remain), otherwise as measurement 1.
- The Chrome console still floods with the "READ-usage buffer was written, then fenced" warning from the async readback (filtered from the logs).
