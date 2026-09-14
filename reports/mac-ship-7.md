# Mac GPU look 7 — 2026-09-13

Run on James's Mac (`~/chromaglass`, Darwin 25.5.0) from a task relayed by the cloud session. Show server brought up on main at #25 (the server had been started on #24), then a seventh look at Fillmore East, 1969 on the real GPU. No deploy was run. Nothing committed or pushed except this folder on `mac-reports`.

**Read this first: the machine was not quiet.** James's Chrome had the show open in two tabs the whole time, `http://localhost:3000/` and the projector window `http://localhost:3000/?cast=true`, and the NEBULA X1 projector was on HDMI at 3840×2160 (UI 1920×1080 @ 30 Hz). One Chrome renderer sat at 100 % of a core and the GPU at 72–76 % busy with bursts to 99 % lasting 10–15 s, before any Playwright page was open. The first pinned pass ran at 17–41 ms frames; every later pass ran at 45–85 ms, three runs died on CDP screenshot timeouts, and the governed pass could only step down. I left James's Chrome alone as instructed. So the 25 s pinned frames are comparable to look 6, the timing-sensitive answers (governor, press over a fixed number of seconds) are not, and I say which is which below.

**Headline.** (1) The cells carpet is faint now and the bead field is the visible texture, but the cell network is still clearly there under it at 0.2. (2) The dish drains exactly as before: 121 → 92 → 58 → 33 → 26 over 100 s (look 6: 113 / 73 / 52 / 34 / 32); `dyeBudget` 1.2 did not change the slope. The CPU 192² engine, reached by the governor under the load, does **not** drain: 120 at 100 s. (3) The press is now a regression: instead of clear glass at the centre, a 4 s press leaves a hard-edged bright blob of piled dye about 200 px across (luminance 202 at r < 20 px, from 142; look 6: 26). There is still no rim beyond the fingers' tips. The cause is in `applySquish`: the press tool calls it three times per gesture at three nested radii, and each call piles at its own tip band, so the three bands tile the palm.

## Summary

| Step | Result |
|---|---|
| 1. Working tree | `M package-lock.json`, `?? chromaglass/` only; no stash needed |
| 2. Pull | main 1ef241d → **57d5496** "Fillmore: the beads show through, the dish keeps its dye, a rim at the tips, a governor that climbs (#25)", 5 files +37/−22 |
| 3. Install, build | clean (npm audit still lists vulnerabilities, not acted on); build 1.23 s |
| 4. Old server | node pid 7091 on 3000, killed |
| 5. Show server | up, show key **8228**, `http://localhost:3000/` = 200; phone `http://192.168.0.234:3000/?remote=1&key=8228`, network display `http://192.168.0.234:3000/?cast=true&key=8228`, OSC udp 9000 |
| 6. Displays | **Two.** Built-in Liquid Retina 2560×1664 (main, mirror off) and **NEBULA X1 on HDMI, 3840×2160, UI 1920×1080 @ 30 Hz, mirror off, Television: Yes** |
| Load | Not quiet: Chrome renderer 100 %, OBSBOT 70 %, MOTIV Mix 49 %, WindowServer 40 %, load average 4.8; GPU 72–99 % busy from James's show + projector tabs. First pinned pass 17–41 ms frames, everything after 45–85 ms |
| Visible field | Beads over a faint cell carpet. patchy2 on `fillmore7-gpu.png`: **cv 0.72 / 26 sparse / 3 dense** (look 6: 0.62 / 20 / 61; cells-off 1.50 / 83 / 0) |
| Bead count | **348** (look 6: 312; target 60 + 360 × 0.8 = 348 reached) |
| Dish luminance 10/25/50/75/100 s | **121 / 92 / 58 / 33 / 26** (look 6: 113 / 73 / 52 / 34 / 32). Still drains |
| Press centre | **Not clear.** 4 s press with the usual 1 px wiggle: r < 20 px 142 → **202**, a hard-edged bright blob; 1 s press: 187 → 168 (faint pit) with a bright ring 40–100 px; 4 s press held still: 199 → 192 (nothing) |
| Rim at the tips | **No.** Tip band 100–130 px: 4 s press −22 to +6 (look 6: −12 to −49), 1 s press −12 to +36 (look 6: −3 to −9). The positives are the blob's edge and the cyan patch being shoved, not a warm rim. Radial profile: no local maximum beyond the channel end that exceeds the pre-press level on any spoke |
| Governed pass | Could not test the climb: under the load the governor went 512 → 384 (before the preset) → 256 (2 s after) → **CPU 192²** (6 s after) and stayed there through the press and 65 s after. It did not hop. 100 s of "after press" was cut to 65 s by me (below) |
| New | (a) On the CPU engine the dish keeps its colour (120 at 100 s); the drain is a GPU-engine matter. (b) Chrome's console floods with a WebGL warning, "READ-usage buffer was written, then fenced, but written again before being read back", tens per second, from the async readback |

## 1. Launch

```
$ git status --short
 M package-lock.json
?? chromaglass/
$ git checkout main && git fetch origin main && git pull --ff-only origin main
   1ef241d..57d5496  main       -> origin/main
 CHANGELOG.md | src/components/LiquidVisualizer.tsx | src/lib/governor.ts | src/lib/sequencer.ts | src/presets.ts
 5 files changed, 37 insertions(+), 22 deletions(-)
$ git log --oneline -1
57d5496 Fillmore: the beads show through, the dish keeps its dye, a rim at the tips, a governor that climbs (#25)
$ npm run build | tail
dist/assets/presets-DRrOufSS.js         30.17 kB │ gzip:   7.15 kB
dist/assets/castProtocol-CJDrQ-S8.js   181.91 kB │ gzip:  58.80 kB
dist/assets/index-aylHbRoe.js          196.50 kB │ gzip:  61.71 kB
dist/assets/App-Bd_kS9Zb.js            348.86 kB │ gzip: 104.06 kB
✓ built in 1.23s
$ lsof -nP -iTCP:3000 -sTCP:LISTEN
node    7091 jameshiggins   13u  IPv4 ...  TCP *:3000 (LISTEN)
$ pkill -f "node server/remote-server.js"
$ (nohup npm run remote > ~/chromaglass-server.log 2>&1 &)
$ tail ~/chromaglass-server.log

  ChromaGlass show server

  Show key:           8228
  Laptop (the show):  http://localhost:3000/
  OSC in:             udp port 9000  (/chromaglass/setting/<key> <n>, /chromaglass/action/<name>, /chromaglass/preset <id>, /blow /drop /press /tilt /dye)
  Phone (the remote): http://192.168.0.234:3000/?remote=1&key=8228
  Network display:    http://192.168.0.234:3000/?cast=true&key=8228
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
200
$ system_profiler SPDisplaysDataType | grep -E "Display Type|Resolution|Main Display|Mirror|Connection"
          Display Type: Built-in Liquid Retina Display
          Resolution: 2560 x 1664 Retina
          Main Display: Yes
          Mirror: Off
          Connection Type: Internal
          Resolution: 3840 x 2160 (2160p/4K UHD 1 - Ultra High Definition)
          Mirror: Off
```

The second block is the **NEBULA X1** (full listing: UI Looks like 1920 × 1080 @ 30.00 Hz, Rotation: Supported, Television: Yes). So the projector path from #22/#24 is live on this machine right now, in James's own Chrome: the server log printed `display connected (1 now)` the moment it came up, and Chrome's tab list has both `localhost:3000/` and `localhost:3000/?cast=true`. I did not touch either tab.

Load (`ps -A -o %cpu,comm | sort -nr | head -8`) before shooting: Google Chrome Helper (Renderer) 101.6, OBSBOT_Main 69.6, MOTIV Mix 49.0, WindowServer 40.2, MOTIV Mix Helper 16.5, load average 4.8. GPU device utilization from `ioreg -c IOAccelerator`, sampled every 2 s for a minute with no Playwright page open: `73 72 71 75 74 69 75 89 99 99 99 98 99 86 72 74 86 99 99 99 99 99 97 71 72 73 74 75 69 67`. The bursts to 99 % last 10–15 s and come round every 20–30 s; that looks like a governed tab climbing a rung, failing it and dropping, which is what #25's climb change would do on a 4K projector window. I could not confirm that without touching the tab.

## 2. Screenshots

All in this folder. Playwright in `~/cg-scratch` driving installed Google Chrome, headed, 1600×1000, press at (921.6, 517). CDP screenshots stalled for 30–120 s under the load in three runs, so the settle series and the governed pass were re-shot with `cap7.mjs`, which reads the canvas back with `gl.readPixels` inside a rAF (the context is created with `preserveDrawingBuffer: true`); those frames have no UI chrome. No page errors in any run.

| File | What | Frames during the run |
|---|---|---|
| `fillmore7-gpu.png` | pinned `?sim=512`, 25 s after the preset | 17–41 ms, p50 20 |
| `beads-crop-7.png` | clip 800,380 360×300 of the above at 2× | |
| `fillmore7-press-gpu.png`, `press-zoom-7.png` | 4 s press (1 px wiggle every 100 ms as in every look), shot 1 s after release; zoom 300×300 at 2× | 17–32 ms |
| `iso-pre-press1s-7.png`, `fillmore7-press1s-gpu.png`, `press1s-zoom-7.png` | separate run: 1 s press, shot at release | **58–66 ms** |
| `fillmore7-still-pre.png`, `fillmore7-press-still-gpu.png`, `press-still-zoom-7.png` | separate run: 4 s press held **still** (no wiggle), shot 1 s after release | **54–77 ms** |
| `fillmore7-settle-50s.png`, `fillmore7-settle-100s.png` | settle series (readPixels capture) | 50–68 ms |
| `fillmore7-gpu-governed.png`, `fillmore7-press-gpu-governed.png` | governed run: 100 s after the preset, and 1 s after its press; **both at CPU 192²** | 16–87 ms, p50 66 |
| `engine-status-7-sim512.json`, `engine-status-7-press1s.json`, `engine-status-7-still.json` | per-second status, settings, press point, full `beadList` | |
| `governed-7-polls.txt` | the governed run's 170 status polls (the JSON was not written, see §5) | |

Scripts: `shoot7.mjs`, `shoot7p.mjs`, `shoot7s2.mjs` (still press), `shoot7e.mjs` (settle series, readPixels), `shoot7g2.mjs` (governed), `cap7.mjs`, `rimprof.mjs` (new: channel end and first local maximum along each spoke), plus `tips.mjs`, `patchy2.mjs`, `beadsizes.mjs`, `dishlum.mjs`, `spokes.mjs`, `cropz.mjs` from look 6.

## 3. Is the visible field the beads now?

Mostly, but the carpet is not gone. `beads-crop-7.png`: the warm core is scattered dark-rimmed rings of clearly mixed size (8–30 px small population, big lenses to 94 px) with bare yellow, orange and green dye between them, and **under all of it a faint but continuous honeycomb of small cells** at the same ~8 px pitch as before, visible everywhere the dye is bright. At 0.2 it reads as a texture rather than as rings, which is a real improvement; at a glance the picture is now "beads over a fine grain", where look 6 was "a carpet with a few big rings".

patchy2 (ring-pixel fraction per 30 px block over the warm core, 700–1200 × 300–800):

| Frame (pinned 512², 25 s) | warm blocks | ring frac p10 / p50 / p90 | cv | sparse (<5 %) | dense (>25 %) |
|---|---|---|---|---|---|
| look 6 `fillmore6-gpu.png` (cells 0.55) | 102 | 0.0 / 34.0 / 42.9 % | 0.62 | 20 | 61 |
| look 6, `cells` → 0 | 123 | 0.0 / 0.0 / 16.4 % | 1.50 | 83 | 0 |
| **look 7 `fillmore7-gpu.png` (cells 0.2)** | 96 | 0.6 / 9.7 / 21.2 % | **0.72** | **26** | **3** |
| look 7 `fillmore7-still-pre.png` (second 25 s frame) | 156 | 0.0 / 8.1 / 25.7 % | 0.93 | 65 | 19 |

The dense blocks have gone from 61 to 3 and the median ring fraction from 34 % to 10 %, so the carpet no longer dominates the statistic; but cv 0.72–0.93 is still well short of the 1.50 of the cells-off frame, and p50 is 8–10 % rather than 0, which is the faint honeycomb still counting as ring edges. Halfway between the two look 6 frames, in other words.

Bead field from `beadList` (pinned run): **348 beads** (60 + 360 × 0.8, the target reached again), radii 0.51–5.62 grid cells = 9 / 17 / 43 / 94 px diameter at p10 / p50 / p90 / max; small population 260 beads 8–30 px (ratio 3.6); occupied 12-cell blocks 163/256, most with 1–3 beads, none with 8+; nearest neighbour p10 / p50 / p90 = 17 / 38 / 60 px. Same shape as look 6 with 36 more beads.

**Does the warm core still read as the Fillmore stills?** It reads as the reference's *big* droplets in the orange, with the fine grain of the plate behind them. It is not empty: with 348 beads over the dish there is always a ring within 40–60 px. What it does not have is the reference's density of *small* dark-rimmed droplets packed together; those were the cells, and at 0.2 they are grain, not droplets. If the stills' texture is wanted back as droplets rather than grain, the bead field would need a denser small population (the 260 small beads are spread over the whole plate, ~1 per 100 px block).

## 4. Dish luminance over 100 s

`shoot7e.mjs`, pinned 512², mean luminance inside the big dish (r = 330 px round 921,517) and the fraction of pixels over 40:

| time after preset | look 6 | **look 7** | lit (>40) |
|---|---|---|---|
| 10 s | 113 | **121** | 89 % |
| 25 s | 73 | **92** | 78 % |
| 50 s | 52 | **58** | 50 % |
| 75 s | 34 | **33** | 29 % |
| 100 s | 32 | **26** | 21 % |

An earlier attempt at the same series (killed at 75 s by a screenshot timeout) gave 118 / 97 / 64, and the two 25 s frames from the other pinned runs give 76 and 103. So the plate is a little brighter for the first half minute than in look 6 (the extra 0.25 of `dyeBudget` and 36 more beads), and by 75 s it is exactly where it was. `fillmore7-settle-100s.png` is a black dish with a red blob, a mint blob, a magenta blob and a dim yellow smear; `fillmore7-settle-50s.png` still has the red haze and a cyan-green lump but the yellow core is gone. **The dish does not keep its colour.** Whatever the regulator's target is, it is not what empties the plate: the settle frames lose dye everywhere at once, which looks like evaporation plus damping rather than a budget pulling the mean down.

The control that says so: the governed run landed on the **CPU 192² engine** (§5) and its dish measured **119.5 at 100 s** and 120.5 after the press, with the warm core intact (`fillmore7-gpu-governed.png` looks like a 10 s GPU frame). The same preset, the same 100 s, the same silence; only the engine differs. So the drain is in the GPU path (or scales with grid), not in the preset's numbers. Note the CPU frame also has a much stronger cell honeycomb over the core than the GPU frames, and a paler, softer picture overall.

## 5. The press

### 5a. Centre: not clear any more

Luminance in discs round the press point (before → after):

| run | r < 20 | 20–40 | 40–70 | 70–100 | 100–130 |
|---|---|---|---|---|---|
| look 6, 4 s press | 134 → 26 | 134 → 64 | | | |
| **look 7, 4 s press, wiggled** (`fillmore7-press-gpu.png`) | 142 → **202** | 137 → 182 | 127 → 178 | 115 → 163 | 107 → 139 |
| look 7, 1 s press, shot at release | 187 → 168 | 190 → 186 | 173 → 182 | 161 → 175 | 151 → 157 |
| look 7, 4 s press **held still** | 199 → 192 | 195 → 176 | 182 → 179 | 166 → 168 | 147 → 149 |

`press-zoom-7.png` shows what the numbers mean: a lobed, hard-edged blob of thick yellow-green and orange dye about 200 px across where the palm was, with the beads packed inside it (they gather where the dye is thick), the cyan patch squeezed into the top of it, and the dark channels only surviving as a fan of rays at the lower left, outside the blob. Nothing is clipped (0 % of pixels in r < 120 px have a channel at 250+); it is a real pile of dye, the brightest thing on the plate. The 1 s frame (`press1s-zoom-7.png`) is the same thing starting: a faint pit (187 → 168 at the centre) inside a bright ring 40–100 px (+9 to +14 all round), the carpet round it intact. The still 4 s press (`press-still-zoom-7.png`) did neither: a mint blob and some dark rays, the centre 199 → 192.

Why, from `applySquish` (LiquidVisualizer.tsx ~863–940, after #25): the pile is now applied **inside** the spoke, in a band `radius × len ± 0.2 × radius` hugging each spoke's tip (`tipW`), and the channel's thinning is skipped where `tipW > 0`. But the press tool calls `applySquish` **three times per gesture** with radii `20 + 12·amt`, `12 + 6·amt` and `6` grid cells (the `case 'press'` at ~1994). Each call runs the same spokes with the same `len` (0.45–1.05) at its own radius, so the tip bands land at roughly 3–7, 6–14 and 10–34 cells from the centre: three rings of pile that between them cover the whole palm, each `× (1 + 0.05 × 0.85 × k × ang)` per call, i.e. up to ×1.04 per call, three calls per step, for 45 steps. That is a multiplier of tens on dye that the `core` term only thins by 0.95 per call over `dist < 0.3 × radius`. It was ×1.017 and outside the spoke in #24, which is why look 6 saw nothing.

Two more things about the count. The pile is keyed to `squishSteps <= 45`, and `squishSteps` resets whenever the seed changes; the seed is `x, y` on the grid after `Math.round(g.x × S)`, so the 1 px wiggle my script has always made (0.32 of a cell at this canvas) flips the seed on about a third of moves, restarting the 45-step clock throughout the 4 s hold. A finger on glass drifts by more than that, so a held press on the stage will keep piling too. The still press is the clean case (one seed, 45 steps, then nothing), and there the pile is not visible at all. And these runs were at 55–75 ms frames, so "45 steps" was ~3 s of the 4 s hold in the still run and ~0.7 s in look 6's 60 fps world; the step count, not the seconds, is what the code measures.

### 5b. Fingers

Still ragged and per-press. `spokes.mjs` on `fillmore7-press-gpu.png`: 70–110 px ring 11 dark minima, depths 27–57 (look 6: 16 minima, 14–35); 110–150 px 8 minima, depths 32–85. The depths are bigger because the ring's mean is now 160 (the blob) rather than 115. In the wiggled 4 s frame the channels are clearly visible only on the lower-left quadrant; in the still frame they are a fan of 5–6 dark rays to the left and lower left, 25–34 deep at 70–110 px.

### 5c. Rim at the tips: no

`tips.mjs` (6 deepest spokes on the 70–110 px ring; ±3° wedge; before → after):

4 s press, wiggled, 1 s after release (`fillmore7-gpu.png` → `fillmore7-press-gpu.png`), look 6 in brackets:

| spoke | depth | tip 100–130 | 130–160 | 160–200 |
|---|---|---|---|---|
| 68° | 35 | 117 → 107 (−10) | 105 → 145 (+40) | 94 → 152 (+59) |
| 83° | 41 | 121 → 119 (−2) | 100 → 156 (+56) | 77 → 153 (+76) |
| 137° | 57 | 114 → 92 (−22) | 118 → 97 (−21) | 145 → 137 (−8) |
| 165° | 38 | 105 → 92 (−13) | 96 → 93 (−3) | 99 → 90 (−9) |
| 201° | 50 | 62 → 58 (−4) | 42 → 40 (−2) | 52 → 48 (−3) |
| 216° | 29 | 66 → 71 (+6) | 41 → 48 (+8) | 45 → 38 (−7) |
| all angles | | 107 → 139 (+32) | 97 → 124 (+27) | 90 → 108 (+18) |

(look 6: −49, −23, −39, −33, −23, −12.) The two big positives at 68° and 83° are the cyan patch's far edge, shoved from 130 to 200 px (its profile jumps from 110/130 to 153/100 there); the all-angles rise is the blob. No warm rim.

1 s press, shot at release (`iso-pre-press1s-7.png` → `fillmore7-press1s-gpu.png`; look 6: −7, −3, −4, −3, −9, −7):

| spoke | depth | tip 100–130 | 130–160 | 160–200 |
|---|---|---|---|---|
| 2° | 11 | 169 → 157 (−12) | 172 → 161 (−11) | 173 → 158 (−14) |
| 36° | 20 | 147 → 141 (−6) | 142 → 134 (−7) | 127 → 107 (−20) |
| 73° | 25 | 93 → 102 (+9) | 58 → 56 (−3) | 57 → 48 (−9) |
| 86° | 21 | 116 → 114 (−2) | 66 → 65 (−1) | 57 → 52 (−5) |
| 113° | 18 | 132 → 168 (+36) | 176 → 195 (+19) | 166 → 164 (−1) |
| 163° | 21 | 143 → 136 (−7) | 100 → 103 (+3) | 64 → 62 (−2) |
| all angles | | 151 → 157 (+6) | 136 → 140 (+4) | 121 → 113 (−9) |

113° is the cyan patch again (its edge at 120–140 px). 4 s still press (`fillmore7-still-pre.png` → `fillmore7-press-still-gpu.png`): −41, −31, −21, +14, +11, −3, all angles 100–130 px +2; the two positives are at 255° and 275° where the mint blob's edge moved.

**Measuring the rim where it should be** (`rimprof.mjs`): along each of the same spokes, 4 px bins to 240 px, "channel end" = first bin from 40 px outward where after ≥ 0.85 × before having been below it, then the first local maximum of the after profile within 40 px beyond that, compared with before at the same radius:

| run | spoke | channel end | first local max beyond it (after / before there) |
|---|---|---|---|
| 4 s wiggled | 68° | 80 px | 88 px: 145 / 129 (+15) |
| | 83° | 68 | 76: 125 / 147 (−22) |
| | 137° | 84 | 92: 132 / 113 (+19) |
| | 165° | 104 | 124: 94 / 103 (−10) |
| | 201° | 96 | none within 40 px |
| | 216° | 192 | 200: 47 / 57 (−11) |
| 1 s | 2°, 163° | no channel found | |
| | 36°, 73°, 86°, 113° | 184–200 px | +5 to −10 |
| 4 s still | 141° | 96 | 100: 149 / 179 (−30) |
| | 220° | 156 | 180: 155 / 173 (−18) |
| | 240° | 48 | 60: 157 / 187 (−30) |
| | 255° | 72 | 80: 149 / 163 (−15) |
| | 275° | 72 | 76: 145 / 134 (+12) |
| | 299° | 104 | none within 40 px |

So looked for at the end of each channel rather than in a fixed band, the answer is the same: on two spokes of the wiggled press there is a bump of +15 to +19 just past the channel (68° at 88 px, 137° at 92 px), which is the blob's own edge, since both sit at the radius where the after profile steps down from ~190 to ~110; on the still press the bins just past every channel are 15–30 *darker* than before, the dye having been pushed along with nothing piling. Nothing on any spoke in any run reaches the reference's "brighter than the field" at the fingers' ends.

## 6. Governed pass

`shoot7g2.mjs`, no sim pin, status once a second. What happened:

| phase | samples | grid | frameMs |
|---|---|---|---|
| initial (10 s after load) | 1 | **384**, `steppedDown: true` | 64 |
| Fillmore settle 0–1 s | 2 | 384 | 59–72 |
| 2–5 s | 4 | 256 | 16–41 |
| 6–99 s | 94 | **CPU 192²** | 56–82, p50 ~60 |
| press held 0–4 s | 5 | CPU 192² | 58–68 |
| after press 0–64 s | 65 | CPU 192² | 57–87 |

`governed: true`, `steppedDown: true`, `gpu: strong`, `tier: local`, dpr 1. It never climbed and never hopped: one descent through the ladder in the first 16 s of the page's life, then the bottom rung for the rest. The press did nothing to it, and no retry of a failed rung was seen in 165 s (nothing was fast for the 8 s the climb needs; the EMA never went under 50 ms). The first governed attempt (`shoot7g.mjs`, CDP screenshots) did the same, 384 → 256 → 192 by 6 s, and died on the screenshot at 100 s. **This says nothing about #25's climb threshold**: with the GPU 72–99 % busy from the other tabs, 22 ms was never available at any GPU rung. The one thing it does show is that the CPU rung was reachable and stable under contention, and that its picture is a different picture (§4).

The after-press poll is 65 s rather than 100 because I killed leftover Chrome processes from the earlier timed-out runs and took this run's browser with them; the two governed PNGs had already been written, the per-second polls are in `governed-7-polls.txt`, and the JSON was not written.

## 7. Anything else

- **A WebGL warning floods the console.** Every run logs "performance warning: READ-usage buffer was written, then fenced, but written again before being read back. This discarded the shadow copy that was created to accelerate readback." at tens of lines per second (40 in the first 5 s of the diagnostic run). It is ANGLE's complaint that the readback PBO in `readbackAsync` (gpuFluid.ts ~752) is rewritten before it is read; harmless on its own, but it means the async readback is not actually async on this Metal path, and it is a plausible part of why a page starved of GPU time drops to 2 fps rather than degrading gracefully. Not checked whether look 6 had it (console was not captured then).
- **Frame time clamps at 500 ms.** With the GPU saturated, `status.frameMs` sat at 491–499: that is `HUGE_MS`, and the status shows the clamp rather than the real interval.
- Under the load the bead field sometimes took more than 25 s to populate: two runs reported `beads: 0` at the 25 s status and 348 later.
- No page errors in any run. The preset label stays FILLMORE EAST, 1969; settings read back as `cells 0.2, beads 0.8, fingering 0.85, dishSpread 0.85`.
- `?cast=true` in James's Chrome plus a 4K projector at 30 Hz is the first time the projector path has been live during a look; nothing here tests it, but it is the load.

## 8. Suggestions

1. **Press pile:** apply the pile once per gesture, not per nested call. Either compute it only in the outermost `applySquish` (the `radius = 20 + 12·amt` call) or pass a flag so the two inner calls skip `tipW`; and key `squishSteps` to the gesture (pointer-down id) rather than to the rounded grid position, so a drifting finger does not restart the 45-step clock. Then look again at the size: at ×1.04 per step for 45 steps the band still gets ×5, which on a bright field will read as a blob before it reads as a rim; something like ×1.015 with the channel thinning genuinely stopping short is closer. And the `core` clearing (0.95 per call, `dist < 0.3 × radius`) is now weaker than the pile it fights; the centre was clear in look 6 and is not now.
2. **Drain:** `dyeBudget` 1.2 did not touch the slope, and the CPU engine at 192² holds 120 for 100 s with the same preset. Compare what evaporation, damping and the regulator do per step in `gpuFluid.ts` against the CPU solver; whichever differs is the drain. The 25 s "settled frame" is still a third of the way down.
3. **Cells:** 0.2 is grain rather than rings; if the cloud wants the stills' packed small droplets back, that is a denser small-bead population, not more cells.
4. **Governor:** the climb could not be tested here; it needs a quiet machine, or a run with James's projector tab closed. Worth checking separately whether that tab's own governor is the thing bursting the GPU to 99 % every 20–30 s.
5. **Readback warning:** double-buffer the readback PBO (or skip the readback on frames where the previous one has not been consumed) so the async path is really async.

## 9. What was not done

- No deploy (GitHub Actions does it on merge).
- Nothing committed besides `reports/`; `package-lock.json` and the nested `chromaglass/` clone untouched; nothing pushed to main.
- The governed after-press poll is 65 s, not 100 (my fault, §6). The governor's climb to 768² was not testable under the load.
- James's Chrome tabs and the projector window were left alone throughout.
