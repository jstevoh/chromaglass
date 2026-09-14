# Mac drain measurement 1 — 2026-09-14

Run on James's Mac (`~/chromaglass` on main at #26, 2f4a711; show server pid 11793 on port 3000 serving the 20:00 build, not restarted). Script `~/cg-scratch/drain1.mjs`, samples in `mac-drain-1.json` alongside. No launch, no deploy, nothing committed except this folder on `mac-reports` (from a temporary worktree).

**Load:** not quiet. James's Chrome had `localhost:3000/` and the projector `?cast=true` open the whole time; GPU 77 % busy, load average 4.1 before the first page opened. Left alone as instructed. Frames: GPU run 17–45 ms (mean 23), CPU run 31–64 ms (mean 48).

**Method.** Fresh Playwright page (installed Chrome, headed, 1600×1000, dpr 1), `?debug&sim=512` then `?debug&sim=cpu`. Load, 5 s, pick Fillmore East, 1969 from the title menu, then once a second for 100 s: `status`, `fluids[0].readDensity` and `fluids[1].readDensity` (192² arrays; on the GPU this is the async downsampled readback of the dye texture's alpha, the same numbers the regulator's `meanDensity` uses), `settings`, a rAF counter, and dish luminance = mean Rec. 709 luminance of 400 random `gl.readPixels` samples within r = 330 px of (921, 517) on `#liquid-canvas`. "lit" = fraction of cells above 0.05; "top10" = mean of the top 10 % of cells.

## GPU 512²

| t | density mean | lit | top10 | layer 1 mean | luminance | frameMs | frames so far |
|---|---|---|---|---|---|---|---|
| 0 | 0.796 | 1.000 | 1.81 | 0.000 | 131.0 | 37.7 | 2 |
| 10 | 0.467 | 0.687 | 1.81 | 0.195 | 115.3 | 25.6 | 513 |
| 25 | 0.286 | 0.677 | 1.72 | 0.062 | 69.1 | 17.9 | 1294 |
| 50 | 0.224 | 0.314 | 1.68 | 0.009 | 48.1 | 24.6 | 2669 |
| 75 | 0.122 | 0.246 | 0.99 | 0.001 | 29.7 | 24.8 | 4074 |
| 100 | 0.138 | 0.211 | 1.17 | 0.000 | 24.5 | 18.9 | 5491 |

## CPU 192²

| t | density mean | lit | top10 | layer 1 mean | luminance | frameMs | frames so far |
|---|---|---|---|---|---|---|---|
| 0 | 0.713 | 0.709 | 1.90 | 0.420 | 130.6 | 51.4 | 2 |
| 10 | 0.780 | 0.707 | 2.21 | 0.417 | 126.2 | 37.8 | 215 |
| 25 | 1.065 | 0.760 | 3.58 | 0.411 | 128.1 | 42.7 | 551 |
| 50 | 1.106 | 0.803 | 3.66 | 0.402 | 125.1 | 47.4 | 1116 |
| 75 | 1.119 | 0.836 | 3.39 | 0.393 | 122.4 | 42.4 | 1692 |
| 100 | 1.197 | 0.854 | 3.38 | 0.384 | 115.2 | 47.1 | 2249 |

(The CPU luminance column wobbles ±6 from the 400-pixel random sample; the 1 s series sits at 114–130 throughout with no trend.)

## Answers

1. **On the GPU the dye itself falls, not just the picture.** Density mean 0.80 → 0.29 → 0.22 → 0.12 → 0.14 at 0/25/50/75/100 s and the lit fraction 1.00 → 0.21 track the luminance 131 → 69 → 48 → 30 → 25 all the way down. `dimmer` stayed 1, so nothing in the render is dimming a full plate; the plate is emptying.
2. **It is per solver step, and it is the GPU solver.** Layer 1 gets no injection after the preset seeds it, so it is a clean decay measure. On the GPU it shrinks by a factor **0.99858 per step** (0.288 → 0.0002 over 5226 steps, half-life about 490 steps ≈ 9 s). On the CPU it shrinks by **0.99996 per step** (0.4185 → 0.3844 over 2142 steps), which is exactly the nominal `evapFactor` = 1 − evaporationRate 0.002 × 0.02. The GPU path loses dye about 35× faster per step than the setting asks for. The step counts are not the explanation: at the CPU run's 2249 steps the GPU run was at t ≈ 42 s with density 0.27 and lit 0.45, against the CPU's 1.20 and 0.85.
3. **The CPU engine does not drain.** Layer 0 rises 0.71 → 1.20 over 2249 steps (injection beats evaporation; it is approaching the 1.2 `dyeBudget` target where the regulator would start to bite) and top10 rises 1.9 → 3.4. Layer 1 only loses the nominal 0.004 % per step.
4. **Nothing in the settings changed on its own.** `dyeBudget` 1.2, `evaporationRate` 0.002, `dimmer` 1 on every sample of both runs. The regulator is not the cause either: `meanDensity` never reached the 1.2 target, so `regulatorEvap` was 0 throughout.

## What `fluids[0]` exposes

Own keys: `meanDensity, tiltX, tiltY, layerIndex, gpu, dirty, squishKey, squishSteps, squishLastAt, squishLastStep, stepIndex, size, dt, diff, visc, s, sR, sG, sB, density, densityR, densityG, densityB, vx, vy, vx0, vy0, pressure, gap, dhdt, temp, temp0, mul, dyeAdd, velAdd, rbDensity, rbVx, rbVy, mcA, mcB`. Getters: `readDensity, readVx, readVy`. No `readGap`. On the GPU `gap` and `dhdt` are delta buffers (mean 0 every sample, zeroed each step); on the CPU `gap` is absolute (mean 0.030). `meanDensity` equals the mean of `readDensity` on both engines. Two layers on both engines; `gridSize` 192.

## Notes

- rAF count vs `status.frameMs`: the GPU page drew 5491 frames in 100 s (18.2 ms average) while `frameMs` read 17–45 ms (mean 23), so `frameMs` is not a plain per-frame mean; it over-reads under load. CPU: 2249 frames (44.5 ms) vs frameMs mean 48, consistent.
- Since the loss is per step and exponential, a faster GPU (more steps per second) drains the Fillmore plate faster in wall time; that matches look 6 and look 7 (121 → 26) and the "doesn't drain on CPU" observation, which was really "CPU has no excess loss," not "fewer steps."
- Candidates for the next PR to check in the GPU step: anything that multiplies the dye each step (damping applied to dye rather than velocity, the MacCormack limiter clamping, a half-float dye texture losing low values, `mul` being re-applied) rather than the evaporation uniform, since the CPU path with the same settings is exact.
