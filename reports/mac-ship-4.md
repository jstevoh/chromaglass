# Mac GPU look 4 — 2026-09-13

Run on James's Mac (`~/chromaglass`, Darwin 25.5.0) from a task relayed by the cloud session chromaglass-69. A local update to PR #20 (b704ec8) and a third look at Fillmore East, 1969 on the real GPU, this time with two presses and a 2× crop of the warm core. No deploy was run: the cloud deploys itself from GitHub Actions on every merge to main.

## Summary

| Step | Result |
|---|---|
| 1. Stop old server | OK — node pid 3882 was listening on 3000; killed |
| 1. Pull, install, build | OK — main moved 547698c → b704ec8; install and build clean |
| 1. Show server | OK — running detached, show key 6386, LAN host 192.168.0.234, OSC on udp 9000 |
| 2. Screenshots | OK — GPU engine, 1.0x dpr, ~17 ms frames; no page errors. Seven pictures in this folder |
| Fingers ragged, not a turbine | **Yes** — broad arms of different lengths and widths, fine tendrils between, dye surviving between them. An angular scan confirms it (below) |
| Two presses, different spoke counts | **Yes** — press 1 has about six broad arms plus many fine ones (14 dark minima on the 70–110 px ring); press 2 has about four broad arms plus a fan of fine streaks to one side (7 minima) |
| Small beads still a honeycomb in the crop | **Looser, not gone** — there are gaps, pairs and doublets now, but the crowd is still an even, uniform-density carpet of near-equal circles at the 2× scale |
| Cool blobs with a hard bright rim | **No** — the second cyan blob and the green blob now fade over an 8–12 px pale band; no yellow-white line. The pale band itself is still noticeable on the green blob's left edge |
| Odd number | The grid went **512² → 768²** at the 25 s Fillmore mark (16.7 ms) and back to 512² after the first press, with `steppedDown` false throughout |

## 1. Update

```
$ lsof -nP -iTCP:3000 -sTCP:LISTEN
COMMAND  PID         USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    3882 jameshiggins   13u  IPv4 0x41762cfac28f3220      0t0  TCP *:3000 (LISTEN)
$ kill 3882
$ git pull origin main
 src/lib/beads.ts                    |  7 ++++---
 src/presets.ts                      |  4 ++--
 4 files changed, 31 insertions(+), 13 deletions(-)
$ git log --oneline -1
b704ec8 A ragged sunburst: irregular fingers, looser beads, softer cool blobs (#20)
```

Working tree before and after: `M package-lock.json`, `?? chromaglass/` (the same as the last three reports; left alone).

`npm install`: clean (npm audit still reports vulnerabilities; not acted on).

```
$ npm run build
dist/assets/presets-DPPQS3PC.js         30.17 kB │ gzip:   7.15 kB
dist/assets/castProtocol-CTHQLDzO.js   180.36 kB │ gzip:  58.26 kB
dist/assets/index-ahON_J1n.js          196.50 kB │ gzip:  61.71 kB
dist/assets/App-ChFHMX0V.js            343.41 kB │ gzip: 102.38 kB
✓ built in 1.02s
```

### Show server

```
$ (nohup npm run remote > ~/chromaglass-server.log 2>&1 &)
$ tail -20 ~/chromaglass-server.log

  ChromaGlass show server

  Show key:           6386
  Laptop (the show):  http://localhost:3000/
  OSC in:             udp port 9000  (/chromaglass/setting/<key> <n>, /chromaglass/action/<name>, /chromaglass/preset <id>, /blow /drop /press /tilt /dye)
  Phone (the remote): http://192.168.0.234:3000/?remote=1&key=6386
  Network display:    http://192.168.0.234:3000/?cast=true&key=6386
```

## 2. Screenshots on the real GPU

Same setup: Playwright in `~/cg-scratch` driving the installed Google Chrome headed (`channel: 'chrome', headless: false`) at 1600×1000 against `http://localhost:3000/?debug`. The canvas filled the viewport (bounding box 0,0 1600×1000), so press 1 landed at pixel (921, 517) and press 2 at (1056, 420). Script: `~/cg-scratch/shoot4.mjs`; raw numbers in `engine-status-4.json`; the angular scan is `~/cg-scratch/spokes.mjs`. No page errors.

### Engine numbers (`window.chromaglassDebug().status`)

| Moment | engine | grid | dpr | tier / gpu | governed | steppedDown | frameMs | beads | dishSpread / beads / cells / fingering |
|---|---|---|---|---|---|---|---|---|---|
| initial (10 s after load) | gpu | 512 | 1.0 | local / strong | yes | no | 20.48 | 0 | 0 / 0 / 0 / 0 |
| Fillmore East, 1969 (25 s) | gpu | **768** | 1.0 | local / strong | yes | no | 16.70 | 312 | 0.85 / 0.7 / 0.55 / 0.85 |
| 1 s after the 4 s press 1 | gpu | 512 | 1.0 | local / strong | yes | no | 17.02 | 312 | same |
| 1 s after the 3 s press 2 | gpu | 512 | 1.0 | local / strong | yes | no | 17.11 | 312 | same |

New this time: the governor stepped the grid **up** to 768² at some point during the 25 s Fillmore settle (frame time 16.7 ms there), then it was back at 512² a second after the first press, still with `steppedDown` false. Last report it sat at 512² the whole time. So the governor is now promoting on the Mac and then demoting again round a press; the frame time was fine at both sizes. Worth knowing if the promotion is meant to be sticky.

### fillmore3-gpu.png

Very close to last report's settled frame: big dish right of centre with the faint tan rim, cherry red top and right, warm orange-yellow field, green at the upper left and a green blob at the bottom, the purple-blue-green dish overlapping at the left. The cool core has changed shape: it is now two pieces, a small pale-cyan bead-filled patch at the centre of the yellow (around 930, 510) and a larger pale-cyan lozenge to its left (around 760, 500) that touches the magenta. Compared with the reference photo the warm field still reads as a carpet of small circles rather than a few big oil lenses, but the big rings in the red and the left dish are the right idea.

### fillmore3-press-gpu.png (press 1, 1 s after release; zoom in press1-zoom.png)

The fingers are ragged now. From the press point a dark blue-grey pit spreads into about six broad arms of clearly different lengths and widths (one long arm to the right, a short stubby one up, two thin ones down-left), with finer dark tendrils between the arms and orange-yellow dye surviving between all of them; the beads show through the dark as dimmer circles rather than being wiped. It reads as a bruise or a starfish rather than a turbine, which is the direction of the reference's broken sunburst. The cyan lozenge beside the press was squeezed into a bean and its beads now read as lit domes with a soft pale edge.

The angular luminance scan (mean per degree on rings round the press point, 5° smoothing, minima below mean − ½ sd) confirms it against last report:

| Frame | ring | dark minima | gaps between them (°) |
|---|---|---|---|
| report 3 `fillmore2-press-gpu.png` | 70–110 px | 18 | 17,17,17,16,16,17,16,16,16,16,81,16,17,16,16,17,17,16 |
| this `fillmore3-press-gpu.png` | 70–110 px | 14 | 40,38,25,8,11,9,7,9,9,11,71,7,6,109 |
| this `fillmore3-press2-gpu.png` (press 2) | 70–110 px | 7 | 27,7,74,141,19,13,79 |

Report 3 was a 16–17° comb with equal depths (30–33 luminance units). This press has gaps from 6° to 109° and depths from 20 to 38, at every radius.

### fillmore3-press2-gpu.png (press 2, 1 s after release; zoom in press2-zoom.png)

A different press, a different pattern: press 2 (in the orange-green at the upper right of the dish) has about four broad dark arms, two long ones up-left running almost parallel, one straight down, plus a fan of maybe eight fine straight streaks to the right into the green, and it is much fainter overall than press 1 (mean luminance drop about half). So the spoke count, phase and strength really do change per press. Meanwhile the cyan lozenge has flowed over the press-1 centre as a big soft-edged bead-filled shape; the press-1 arms to its upper right are still faintly visible around it, so the fingers survive but the blob covers them.

### beads-crop.png (clip 800,380 360×300, shown at 2×)

Looser than last report but not yet random. There are now gaps in the carpet, touching pairs and doublets, and a few larger circles among the small ones. But the density is still uniform across the whole warm field and almost every circle is the same size with the same dark ring and pale centre, so at 2× it still reads as an even carpet of bubbles rather than the reference's scattered oil lenses of many sizes. Inside the cyan patch the beads look good: lit tops, blue-white shading, clustered.

### Cool blob rims (fillmore3-gpu.png)

No hard bright rims remain. The second cyan lozenge fades into the red and yellow over a pale band roughly 8–12 px wide with no line; the green blob at the bottom has a bright lime edge on its left that is soft, with a lavender-cyan interior. Both are much better than report 3's yellow-white outlines. The pale band on the cyan lozenge is still a touch bright against the magenta on its left, but it is a gradient, not an edge.

## 3. Suggestions for the next pass

- **Fingers are done for now.** Ragged, per-press, surviving. Only nit: at 1 s the dark pit at the centre is quite grey-blue and flat; in the photo the centre of a press is usually clear glass (near black) with the colour pushed to the fingers' tips.
- **The bead carpet needs size and density variation, not more jitter.** The honeycomb is broken, but the field still reads as bubble wrap because every small bead is the same size and the density is flat across the whole warm area. Cluster them: a few dense patches, some near-empty patches, and a wider size spread within the small ones.
- **Check the 512 → 768 → 512 grid hop.** If the governor's promotion is meant to hold, something round the press demoted it without setting `steppedDown`.

## 4. What was not done

- No deploy (GitHub Actions does it on merge).
- Nothing committed besides `reports/`; `package-lock.json` and `chromaglass/` untouched; nothing pushed to main.
