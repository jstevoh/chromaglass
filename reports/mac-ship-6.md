# Mac GPU look 6 — 2026-09-13

Run on James's Mac (`~/chromaglass`, Darwin 25.5.0) from a task relayed by the cloud session. Show server brought up on main at #24 (PRs #23 and #24 since the last start on #22), then a sixth look at Fillmore East, 1969 on the real GPU: a pinned 512² set for comparison with look 5, a governed set polled for 100 s either side of the press, and three extra passes to answer questions that came up (plate cells vs beads, a 1 s press, a 100 s settle series). No deploy was run. Nothing committed or pushed except this folder on `mac-reports`.

**Headline.** The dense carpet of small rings in the yellow core, the thing every report since look 3 has been calling "the beads", is not the bead field at all. It is the **plate cells** shader (`cells: 0.55` in the preset). Turning cells to 0 over OSC removes it entirely and leaves ~300 scattered, clearly patchy, clearly size-varied oil beads; turning beads to 0 leaves the carpet untouched. So #23's patch mask and size spread in `beads.ts` are working, and were probably working in #21 too, but they cannot be seen through the cell network. Numbers and pictures below.

## Summary

| Step | Result |
|---|---|
| 1. Working tree | `M package-lock.json`, `?? chromaglass/` only; no stash needed |
| 2. Pull | main 4b3c47a → **1ef241d** "The projector window fills its screen from a click on the laptop (#24)", 8 files +188/−37 |
| 3. Install, build | clean (npm audit still lists vulnerabilities; not acted on); build 1.08 s |
| 4. Old server | node pid 5497 on 3000, killed |
| 5. Show server | up, show key **2086**, `http://localhost:3000/` = 200; phone `http://192.168.0.234:3000/?remote=1&key=2086`, network display `http://192.168.0.234:3000/?cast=true&key=2086`, OSC udp 9000 |
| 6. Displays | **Only the built-in display** (2560×1664 Retina, main, mirror off). No NEBULA X1 or any HDMI display attached right now |
| Load | Quieter than look 5: no ChromaGlass tab in James's Chrome (top Chrome renderer 0.6 %), no second display connected on the server. MOTIV Mix 57 %, WindowServer 30 %, OBSBOT Center 15 %, load average 5.0 |
| Beads in patches with bare dye between | **Yes for the bead field, invisible under the cells.** patchy2 on the pinned frame: cv 0.62, 20 sparse, 61 dense (look 5: 0.54 / 10 / 61). With cells off: cv 1.50, 83 sparse, 0 dense |
| Size spread within a patch | **Yes**, once the carpet is off: small population 8–30 px across (ratio 3.7), whole field 9–89 px, neighbours of 10, 16, 24 and 40 px in one cluster |
| Bead count | **312**, unchanged (the target 60 + 360 × 0.7 was reached in both runs); not "well under" |
| Press centre | Clear glass, as in look 5: pit ~45 px, luminance 26 at r < 20 px (134 before) |
| Bright rim at the fingers' tips | **No.** Tip band (100–130 px) along the 6 strongest spokes: −12 to −49 after a 4 s press, −3 to −9 after a 1 s press with an immediate screenshot. Nothing anywhere outside the pit is brighter than before |
| Governed pass | 512² for all 204 samples; never stepped down, never climbed. Frames 16.7–24 ms, EMA at 17.0–17.5, so the 8 s "fast" clock (< 17.5 ms) kept resetting |
| New | The whole composition **drains in about a minute** with no audio: dish brightness 113 → 73 → 52 → 34 → 32 at 10 / 25 / 50 / 75 / 100 s. Look 5's 25 s frame measures the same (75), so this is not new to #23, just never looked at past 25 s |

## 1. Launch

```
$ git status --short
 M package-lock.json
?? chromaglass/
$ git checkout main && git fetch origin main && git pull --ff-only origin main
Updating 4b3c47a..1ef241d
 CHANGELOG.md | README.md | src/App.tsx | src/components/CastDisplay.tsx
 src/components/LiquidVisualizer.tsx | src/hooks/useCastSession.ts
 src/lib/beads.ts | src/lib/governor.ts
 8 files changed, 188 insertions(+), 37 deletions(-)
$ git log --oneline -1
1ef241d The projector window fills its screen from a click on the laptop (#24)
$ npm run build | tail
dist/assets/presets-xrWBDWKB.js         30.17 kB │ gzip:   7.15 kB
dist/assets/castProtocol-BfP83wD4.js   181.83 kB │ gzip:  58.74 kB
dist/assets/index-D0ThqoN4.js          196.50 kB │ gzip:  61.71 kB
dist/assets/App-CBbAM-YN.js            348.86 kB │ gzip: 104.06 kB
✓ built in 1.08s
$ lsof -nP -iTCP:3000 -sTCP:LISTEN
node    5497 jameshiggins   13u  IPv4 ...  TCP *:3000 (LISTEN)
$ pkill -f "node server/remote-server.js"
$ (nohup npm run remote > ~/chromaglass-server.log 2>&1 &)
$ tail ~/chromaglass-server.log

  ChromaGlass show server

  Show key:           2086
  Laptop (the show):  http://localhost:3000/
  OSC in:             udp port 9000  (/chromaglass/setting/<key> <n>, /chromaglass/action/<name>, /chromaglass/preset <id>, /blow /drop /press /tilt /dye)
  Phone (the remote): http://192.168.0.234:3000/?remote=1&key=2086
  Network display:    http://192.168.0.234:3000/?cast=true&key=2086
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
200
$ system_profiler SPDisplaysDataType | grep -E "Display Type|Resolution|Main Display|Mirror|Connection"
          Display Type: Built-in Liquid Retina Display
          Resolution: 2560 x 1664 Retina
          Main Display: Yes
          Mirror: Off
          Connection Type: Internal
```

Only the built-in display is listed: the NEBULA X1 projector is not on HDMI right now, so #22/#24's projector-window path could not be exercised.

Load before shooting (`ps -A -o %cpu,comm | sort -nr | head -8`): MOTIV Mix 57.5, WindowServer 29.6, MOTIV Mix Helper 23.3, OBSBOT Center 15.5, MOTIV Mix Helper (Renderer) 13.3, OBSBOT_Main 7.6, Claude Helper 6.3 and 4.3. No Chrome process above 0.6 %, and `lsof -nP -iTCP:3000` showed no display connected apart from the Playwright pages as they ran. James's Chrome was left alone.

## 2. Screenshots

All in this folder. Playwright in `~/cg-scratch` driving installed Google Chrome, headed, 1600×1000, canvas filling the viewport, press at (921.6, 517). No page errors in any run.

| File | What |
|---|---|
| `fillmore6-gpu.png` | pinned `?sim=512`, 25 s after the preset (compare `fillmore4-gpu-sim512.png`) |
| `beads-crop-6.png` | clip 800,380 360×300 of the above at 2× |
| `fillmore6-press-gpu.png` | 4 s press at the big dish centre, shot 1 s after release |
| `press-zoom-6.png` | 300×300 centred on the press point, 2× |
| `fillmore6-press1s-gpu.png`, `press1s-zoom-6.png` | separate run: 1 s press, shot at release, for the tip rim |
| `fillmore6-gpu-governed.png`, `fillmore6-press-gpu-governed.png` | governed run, 100 s after the preset and after its press (the drained plate, see §6) |
| `fillmore6-cells0.png` | preset, 15 s, then `/chromaglass/setting/cells 0` over OSC, 6 s later |
| `fillmore6-beads0.png` | same with `/chromaglass/setting/beads 0` |
| `fillmore6-settle-50s.png`, `fillmore6-settle-100s.png` | the settle series at 50 and 100 s |
| `engine-status-6-sim512.json`, `engine-status-6-governed.json` | per-second status, settings, press point, and the full `beadList` (new in #23's debug object) |

Scripts: `shoot6.mjs` (pinned), `shoot6g.mjs` (governed, 100 s polls), `shoot6c.mjs <key> <value>` (OSC setting after the preset), `shoot6d.mjs` (settle series), `shoot6p.mjs` (1 s press), `tips.mjs` (spoke tip luminance before/after), `beadsizes.mjs` (bead list statistics), `dishlum.mjs`, plus the old `patchy2.mjs`, `spokes.mjs`, `cropz.mjs`.

## 3. Beads: patches, sizes, count

### What the carpet is

`fillmore6-gpu.png` and `beads-crop-6.png` look like look 5: the yellow core is still an even carpet of ~7–12 px rings from edge to edge. But the debug object's new `beadList` has **312 entries on the 192-cell bead grid, radii 0.49–5.03 cells, i.e. 8–84 px across at this canvas**, spread over the whole plate with a median nearest neighbour of 34 px. Three hundred rings that size cannot make a carpet of thousands of 8 px rings. The isolation passes settle it:

| Frame (pinned 512²) | warm blocks | ring fraction p10 / p50 / p90 | cv | sparse (<5 %) | dense (>25 %) |
|---|---|---|---|---|---|
| look 5 `fillmore4-gpu-sim512.png` | 98 | 4.6 / 35.3 / 42.7 % | 0.54 | 10 | 61 |
| **look 6 `fillmore6-gpu.png`** | 102 | 0.0 / 34.0 / 42.9 % | **0.62** | **20** | 61 |
| look 6, `beads` → 0 | 115 | 0.0 / 36.2 / 44.1 % | 0.64 | 25 | 71 |
| look 6, `cells` → 0 | 123 | 0.0 / 0.0 / 16.4 % | **1.50** | **83** | **0** |

With the bead field switched off the carpet is unchanged. With the plate cells switched off (`u_cells`, the `cellField` network in the fragment shader, "the fine network in the dish core of the Fillmore stills") the carpet vanishes and what remains is the actual bead field: scattered dark-rimmed lenses, a cluster of a dozen at the right of the crop with 10, 16, 24 and 40 px rings side by side, and wide stretches of bare yellow and orange dye between clusters. That is exactly the look the last three passes have been asking for; it has been underneath the cells all along.

So the answer to "do the beads now sit in patches with bare dye between them" is yes for the bead field and no for the picture, because the cells are drawn at the same size as the small beads, over the same warm core (`centreW` weights them toward the lead dish's centre), and at 0.55 they dominate. The modest change in the patchy2 numbers on the full frame (cv 0.54 → 0.62, sparse 10 → 20) is real but comes from a darker centre blob and the dye's edges, not from visible patches in the carpet.

### Sizes

From `beadList` (pinned run): diameter p10 / p50 / p90 / max = 9 / 18 / 42 / 84 px; the small population (r < 1.8 × N/192) runs 8–30 px, a 3.7 : 1 spread, on top of the big-lens tail. In the cells-off crop that spread is plain to see within one cluster. On the full frame it reads as "a few bigger rings among the carpet", as before.

### Count

`chromaglassDebug().beads` = **312** in every run (pinned, governed, 1 s press, both isolation passes), the same as looks 4 and 5. The populate loop still reaches its target of `60 + 360 × 0.7`; the hard patch mask (`p <= 0 → skip`) plus the tighter crowding gap did not run it out of room on this plate within its `count × 6` tries. Occupancy at 100 px blocks: 129–144 of 256 blocks hold a bead, most with 1–3, and the largest cluster has 10. So the field is sparse everywhere rather than "packed patches and empty stretches" at the 100 px scale; the patch structure is at the 30–60 px scale (nearest-neighbour p10 / p50 / p90 = 17 / 34 / 61 px, max 132 px).

## 4. The press

### Centre

Clear glass again. Pinned 4 s press: luminance inside r < 20 px fell from 134 to 26 and 20–40 px from 134 to 64; the pit is ~45 px across with a soft edge. Same as look 5.

### Fingers

Still ragged and per-press at 512². `spokes.mjs` on `fillmore6-press-gpu.png`: 40–70 px ring 15 dark minima, depths 16–37; 70–110 px ring 16 minima, gaps 6–103°, depths 14–35 (look 5: 16 minima, depths 18–47). `press-zoom-6.png` shows the pit, a broad dark arm to the upper left and lower right, fine tendrils, the cyan blob squeezed up into a foot shape. Fewer of the distinct medium rings survive round the pit than in look 5's zoom, otherwise the same.

### Bright rim at the tips: not there

`tips.mjs` finds the 6 deepest dark spokes on the 70–110 px ring of the press frame, then averages luminance in a ±3° wedge across the tip band (100–130 px from the press point) in the settled frame and in the press frame at the same angles.

4 s press, shot 1 s after release (`fillmore6-gpu.png` → `fillmore6-press-gpu.png`):

| spoke angle | depth (70–110) | tip 100–130 before → after | 130–160 | 160–200 |
|---|---|---|---|---|
| 133° | 35 | 114 → 66 (**−49**) | 92 → 48 (−45) | 95 → 78 (−17) |
| 171° | 20 | 102 → 79 (**−23**) | 68 → 61 (−8) | 53 → 50 (−3) |
| 209° | 28 | 110 → 71 (**−39**) | 112 → 78 (−33) | 141 → 96 (−45) |
| 223° | 20 | 111 → 79 (**−33**) | 109 → 81 (−28) | 133 → 94 (−39) |
| 256° | 25 | 84 → 61 (**−23**) | 74 → 66 (−8) | 58 → 53 (−5) |
| 295° | 19 | 68 → 55 (**−12**) | 43 → 45 (+2) | 38 → 32 (−7) |
| all angles | | 106 → 90 (−15) | 96 → 86 (−11) | 90 → 82 (−8) |

Look 5's frames on the same script: −40, −47, −28, −8, −17, −63. No difference in kind.

Because the pile is only applied during a press's first 45 solver steps (`squishSteps <= 45`, about 0.75 s at 60 fps), a second run held the press for 1 s and screenshotted at release (`fillmore6-press1s-gpu.png`):

| spoke angle | depth | tip 100–130 before → after | 130–160 | 160–200 |
|---|---|---|---|---|
| 29° | 14 | 103 → 96 (−7) | 107 → 101 (−6) | 100 → 103 (+3) |
| 52° | 16 | 87 → 83 (−3) | 77 → 75 (−2) | 63 → 59 (−4) |
| 65° | 21 | 69 → 65 (−4) | 47 → 45 (−2) | 39 → 37 (−2) |
| 81° | 22 | 62 → 59 (−3) | 38 → 35 (−3) | 37 → 34 (−3) |
| 110° | 24 | 85 → 75 (−9) | 83 → 96 (+13) | 128 → 149 (+21) |
| 170° | 16 | 90 → 83 (−7) | 65 → 64 (−1) | 52 → 51 (−1) |
| all angles | | 107 → 104 (−2) | 98 → 96 (−2) | 89 → 87 (−2) |

At 1 s the pit itself is only a faint dark smudge (r < 20 px luminance 87, from 136) and the carpet round it is intact (`press1s-zoom-6.png`); the clear centre and the fingers build over the rest of the 4 s hold. The one positive, 110° at 130–200 px, is the cyan blob's edge being shoved outward (its radial profile jumps from 93/126 to 133/150 there), not a rim of warm dye. Every spoke's tip band is a little darker than before the press in both timings, and the radial profiles along the spokes fall monotonically from the ring at 40–70 px outward with at most a 10–15 unit local bump (133° and 295° in the 4 s frame at 90–110 px) that never reaches the pre-press level. In the reference the fingers end in dye brighter than the field. Here they still fade out.

Two things worth checking in the pile code from here: `pile` tops out at `0.02 × fingering × min(1, amount × 250)` = 0.017 per step, applied through `this.mul[idx] *= thick` with `thick ≤ 1 + 0.017 × k × ang`; over 45 steps that is at most ×1.3–×2 on dye that the same press is thinning and advecting away, and by the time the first frame after `mouse.down()` is drawn the tool has already delivered several radii per step. Also the mask `ang > 0.1` and `over < 1` put the rim in a band `radius × len` to `radius × (len + 0.2)`, which for this press radius may fall inside the 70–110 px zone the fingers themselves darken, not out at 100–130 px.

## 5. Governed pass

`shoot6g.mjs`, no sim pin, status polled once a second for 100 s after the preset, through the 4 s press, and for 100 s after.

| phase | samples | grid | frameMs min / p50 / max | samples < 17.5 ms |
|---|---|---|---|---|
| initial (10 s after load) | 1 | 512 | 18.8 | |
| Fillmore settle 0–99 s | 100 | **512** throughout | 16.7 / 17.15 / 24.1 | 91 |
| press held 0–3 s | 4 | 512 | 17.1–17.3 | |
| after press 0–99 s | 100 | **512** throughout | 16.7 / 17.24 / 24.2 | 85 |

`governed: true`, `steppedDown: false` for the whole run; `gpu: strong`, `tier: local`, dpr 1.0. So the new retry logic could not be observed: nothing failed, so there was nothing to retry, and nothing climbed either. The reason it did not climb is the threshold, not the retry rule. The governor needs `emaFrame < 17.5 ms` (and work < 9 ms) continuously for 8 s. On a 60 Hz display the frame interval is 16.7 ms plus jitter, the EMA sat at 17.0–17.5 ms with a sample over 17.5 about every 10 s, and every one of those resets `fastSince`. Look 4's climb to 768² happened on a quieter afternoon. So on this Mac the ladder in practice is 512² and down, and 768² is reachable only by luck. If a climb is wanted, 17.5 ms is too close to the vsync interval; something like 18 ms, or judging on the EMA alone without the per-sample reset, would give it a chance.

The press did not push the frame over 22 ms at 512², so the "not blacklisted while held" rule was not exercised either.

## 6. New: the composition drains in about a minute

The governed frames at 100 s (`fillmore6-gpu-governed.png`, `fillmore6-press-gpu-governed.png`) are nothing like the 25 s frames: the big dish is mostly black with five or six separate blobs (green, red, magenta, violet, cyan) and a faint ochre ghost where the warm core was. A settle series with the pinned grid (`shoot6d.mjs`), mean luminance inside the big dish (r = 330 px) and the fraction of pixels over 40:

| time after preset | dish mean luminance | lit (> 40) |
|---|---|---|
| 10 s | 113 | 88 % |
| 25 s | 73 | 71 % |
| 50 s | 52 | 36 % |
| 75 s | 34 | 33 % |
| 100 s | 32 | 24 % |

Look 5's `fillmore4-gpu-sim512.png` (25 s) measures 75 / 73 %, so this was already so; every report's "settled frame" at 25 s was a third of the way down the slope. With no audio input (`audioImpact 0.6`, `beatSqueeze 0.9`, `sound drive 60 %` but nothing playing) the preset's `evaporationRate 0.002`, `damping 0.975`, `dyeBudget 0.95` and `automateRate 0.12` leave the plate to fade while the automation keeps dropping single blobs. Whether that is the intended life of the preset between songs is the cloud's call; on a quiet stage it means the Fillmore look lasts about 40 s before it is a dark dish with a few blobs. The 50 s frame (`fillmore6-settle-50s.png`) is a reasonable in-between: cyan-green blob with beads, orange lump, red haze, the yellow core gone.

## 7. Anything else

- No page errors in any of the six runs. Bead count, settings and the press tool behave as before.
- The cells-off frame shows the preset label switch to CUSTOM after the OSC patch, as expected.
- The pale halo round the cyan blob and the slightly crisp pit edge from look 5 are unchanged.
- The `beadList` export in the debug object is very useful; it is what made §3 possible. It is included in both engine-status JSONs.

## 8. Suggestions

1. **Decide what the carpet is.** If the reference's dense small rings are meant to be the cells, then the bead field's job is the scattered big lenses, and #23's patches and sizes are done and can be seen by looking at the red and orange regions, or by lowering `cells` in the preset. If the reference's rings are meant to be oil beads in patches, drop `cells` to something like 0.15–0.25 in the Fillmore preset, or gate the cells by the same patch field so the two agree; at 0.55 no bead-side change will show.
2. **Tip rim:** measure it in the engine rather than on screen first (sum of `mul` in the rim band on the first frame of a press), then look at the multiplier's size and where the band lands relative to the spoke length. Currently no rim is visible at any timing.
3. **Governor:** the 17.5 ms climb threshold sits on top of the 60 Hz interval; consider ~18 ms or removing the per-sample reset, otherwise the retry-after-90-s rule will rarely get to run on this Mac because it never leaves 512².
4. **Drain:** confirm the fade over ~60 s is wanted when no music is playing, or give the preset a slower evaporation and a gentler damping for the silent case.

## 9. What was not done

- No deploy (GitHub Actions does it on merge).
- Nothing committed besides `reports/`; `package-lock.json` and the nested `chromaglass/` clone untouched; nothing pushed to main.
- The projector path (#22, #24) could not be exercised: no HDMI display attached.
