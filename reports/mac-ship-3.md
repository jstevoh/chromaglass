# Mac GPU look 3 — 2026-09-13

Run on James's Mac (`~/chromaglass`, Darwin 25.5.0) from a task relayed by the cloud session chromaglass-69. A local update to PR #19 (547698c) and a second look at Fillmore East, 1969 on the real GPU. No deploy was run: the cloud deploys itself from GitHub Actions on every merge to main.

## Summary

| Step | Result |
|---|---|
| 1. Stop old server | OK — node pid 3229 was listening on 3000; killed |
| 1. Pull, install, build | OK — main moved 9c3fd6c → 547698c; install and build clean |
| 1. Show server | OK — running detached, show key 3711, LAN host 192.168.0.234, OSC on udp 9000 |
| 2. Screenshots | OK — GPU engine, 512² grid, 1.0x dpr, ~17 ms frames; no page errors. Ten pictures in this folder |
| Fingers after the press | **Yes** — about 24 dark spokes round the press point, still there 5 s later. But they are perfectly regular (a turbine, not a sunburst) |
| Beads vary and cluster | **Mostly** — sizes now range from tiny to big; big rings sit sparse in the red and the left dish, tiny ones crowd the warm core. The crowd is still a fairly regular honeycomb |
| Bead interiors read as domes | **Partly** — lighter interiors and a pale upper rim in the cool blobs; the big rings in the red are still hollow dark circles |
| Cool core's edges soft | **The core yes, its neighbours no** — the central cyan blob fades into the yellow; the second cyan blob left of it and the green blob at the bottom still carry a hard bright yellow-white rim |
| Horizontal lines in the left dish | **Absent** in all three 1-second crops, in the full frames, and after switching to layer 2. A pixel scan of last report's frames finds none either, so it was a viewing artefact, not a seam and not tearing |
| Classic after Fillmore | **Fixed** — beads 0, dishSpread 0, cells 0, fingering 0; no second dish, no bead rings |

## 1. Update

```
$ lsof -nP -iTCP:3000 -sTCP:LISTEN
COMMAND  PID         USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    3229 jameshiggins   13u  IPv4 0x58c7a983a20cc703      0t0  TCP *:3000 (LISTEN)
$ kill 3229
$ git pull origin main
 src/App.tsx                         |  4 +++-
 src/components/LiquidVisualizer.tsx | 36 +++++++++++++++++++++++++++++------
 src/lib/beads.ts                    | 38 ++++++++++++++++++++++++++++---------
 src/presets.ts                      |  6 +++---
 5 files changed, 71 insertions(+), 19 deletions(-)
$ git log --oneline -1
547698c Fillmore after the GPU look: fingers that stay, varied lit beads, softer edges, no preset leak (#19)
```

Working tree before and after: `M package-lock.json`, `?? chromaglass/` (the same as the last two reports; left alone).

`npm install`: clean (npm audit still reports vulnerabilities; not acted on).

```
$ npm run build
✓ 2122 modules transformed.
dist/index.html                          1.32 kB │ gzip:   0.58 kB
dist/assets/songMapWorker-Dc5_FQYD.js    5.77 kB
dist/assets/index-BOOQhiEr.css          47.31 kB │ gzip:   8.25 kB
dist/assets/useRemoteLink-Zu8hLsfm.js    4.47 kB │ gzip:   2.08 kB
dist/assets/CastDisplay-B1WdS5UP.js      6.07 kB │ gzip:   2.33 kB
dist/assets/RemoteControl-CCL0n3of.js   25.33 kB │ gzip:   6.97 kB
dist/assets/presets-nCu8w-La.js         30.17 kB │ gzip:   7.16 kB
dist/assets/castProtocol-DO3WxFzq.js   180.01 kB │ gzip:  58.07 kB
dist/assets/index-BSDAQuMB.js          196.50 kB │ gzip:  61.71 kB
dist/assets/App-Ch1UX-tn.js            343.41 kB │ gzip: 102.38 kB
✓ built in 1.05s
```

### Show server

```
$ (nohup npm run remote > ~/chromaglass-server.log 2>&1 &)
$ tail -20 ~/chromaglass-server.log

  ChromaGlass show server

  Show key:           3711
  Laptop (the show):  http://localhost:3000/
  OSC in:             udp port 9000  (/chromaglass/setting/<key> <n>, /chromaglass/action/<name>, /chromaglass/preset <id>, /blow /drop /press /tilt /dye)
  Phone (the remote): http://192.168.0.234:3000/?remote=1&key=3711
  Network display:    http://192.168.0.234:3000/?cast=true&key=3711
```

## 2. Screenshots on the real GPU

Same setup as last time: Playwright in `~/cg-scratch` driving the installed Google Chrome headed (`channel: 'chrome', headless: false`) at 1600×1000 against `http://localhost:3000/?debug`. The canvas filled the viewport (bounding box 0,0 1600×1000), so the press landed at pixel (921, 517). Script: `~/cg-scratch/shoot3.mjs`; raw numbers in `engine-status-3.json`. No page errors.

### Engine numbers (`window.chromaglassDebug().status`)

| Moment | engine | grid | dpr | tier / gpu | governed | steppedDown | frameMs | beads | dishSpread / beads / cells / fingering |
|---|---|---|---|---|---|---|---|---|---|
| initial (10 s after load) | gpu | 512 | 1.0 | local / strong | yes | no | 17.09 | 0 | 0 / 0 / 0 / 0 |
| Fillmore East, 1969 (25 s) | gpu | 512 | 1.0 | local / strong | yes | no | 17.46 | 312 | 0.85 / 0.7 / 0.55 / 0.85 |
| 1 s after the 4 s press | gpu | 512 | 1.0 | local / strong | yes | no | 16.94 | 312 | same |
| 5 s after the press | gpu | 512 | 1.0 | local / strong | yes | no | 17.02 | 312 | same |
| layer 2 active (1.5 s) | gpu | 512 | 1.0 | local / strong | yes | no | 18.13 | 312 | same |
| Classic Light Show (20 s) | gpu | 512 | 1.0 | local / strong | yes | no | 21.59 | **0** | **0 / 0 / 0 / 0** |

`steppedDown` stayed false throughout this time (last run it flipped true after the press). The one odd number is Classic at 21.6 ms against ~17 ms everywhere else, a hair over the 60 fps governor; the grid and dpr did not move. It may be the preset transition still settling at the 20 s mark.

### fillmore2-gpu.png

The bones of the reference are there: a big dish right of centre on black with a faint tan rim, a warm orange-yellow field, a cool icy-cyan core just left of and below the dish centre, cherry red across the top and right, green at the upper left and a green blob at the bottom, and the smaller purple-blue-green dish overlapping at the left. The beads now vary: big dark rings (30–40 px) sit sparse across the red and the left dish, and tiny ones crowd the yellow core and the cyan blobs, so the field reads as oil in dye rather than a bubble-wrap tile. Two things still off: the crowd in the yellow core is still a fairly regular honeycomb at this scale, and while the central cyan core now fades softly into the yellow, the second cyan blob to its left and the green blob at the bottom still have a hard, bright yellow-white edge.

### fillmore2-press-gpu.png (1 s after release)

The press made fingers this time: about 24 dark spokes radiate from the press point through the yellow and red, with the dye carved out to black at the centre. They are too regular, though: equal spacing, equal length, straight and the same width, so the frame reads as a turbine or a gobo rather than the ragged sunburst in the photo, where spokes differ in length and width and dye survives between them. The cyan blob beside the press has been squeezed into a lumpy shape and its interior beads now read as lit domes (pale tops, dark undersides), with a softer edge than before.

### fillmore2-press-after-gpu.png (5 s after release)

The spokes survive unchanged 5 s on, so the fingers no longer wash out. The cyan blob has flowed over the press centre as a big soft-edged bead-filled shape, with the spokes still visible around and beneath it; a small orange drop has started at the lower right (the preset's own drops, see the layer-2 note). Still a perfect starburst rather than a broken one.

### leftdish-1/2/3.png (1 s apart, clip 300,200 500×500)

No thin straight horizontal dark lines in any of the three; the left dish is a smooth purple-to-blue-to-green gradient with a few large rings and the big dish's beads crossing at right. A row scan (mean luminance per row across x 380–600, comparing each row to its neighbours) finds no row darker than its neighbours by more than 0.3 luminance units in any of the three crops, in this run's full frames, or in the layer-2 frame. The same scan on last report's `fillmore-gpu.png` and `fillmore-press-gpu.png` finds nothing either, so the lines described last time were an artefact of viewing the downscaled image, not a seam in the render and not tearing in the capture.

### leftdish-layer2.png / fillmore2-layer2-gpu.png

Switching the active layer to 2 changes nothing about lines (still none). The only difference is a few small new drops: a green streak, a purple dot and an orange dot in the left dish, and an orange bead-filled blob in the big dish. The orange one was already forming in the 5 s press frame, so these are the preset's periodic drops, not something the layer switch caused. Note the active layer persists across presets: Classic below was captured with layer 2 still selected.

### classic2-gpu.png

The leak is fixed: beads 0, dishSpread 0, cells 0, fingering 0 from the debug hook, no second dish, no bead rings, no cell texture. Classic now shows its own look, which is a full-bleed plate: a blue field fills the viewport, red glows in along the right edge, yellow at the left corners, and a single magenta blob sits at the left, all with round soft edges. The dish with red, blue and yellow blobs in last report's `classic-gpu.png` was Fillmore's dish leaking; native Classic has no rim, which matches the pre-#18 look.

## 3. Suggestions for the next pass

- **Break the sunburst.** Randomise the spoke count and phase per press, vary spoke length and width with noise or with the local dye thickness, and let some dye survive between spokes. The physics is right now; the pattern is too clean.
- **Soften the other cool blobs.** The core got the soft edge; the second cyan blob and the green one still carry the hard bright rim. Whatever rule softened the core should apply to every cool blob against the warm dye.
- **Loosen the packing in the warm core.** Sizes vary now, but the tiny beads in the yellow still fall into a honeycomb; a jitter on position or a few missing cells would break it.

## 4. What was not done

- No deploy (GitHub Actions does it on merge).
- Nothing committed besides `reports/`; `package-lock.json` and `chromaglass/` untouched; nothing pushed to main.
