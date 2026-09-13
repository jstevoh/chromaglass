# Mac GPU look 5 — 2026-09-13

Run on James's Mac (`~/chromaglass`, Darwin 25.5.0) from a task relayed by the cloud session chromaglass-69. A local update to PR #21 (fa37a1f) and a fourth, short look at Fillmore East, 1969 on the real GPU: the settled frame, a 2× crop of the warm core, one 4 s press at the big dish's centre, and the engine status polled once a second through the whole settle. No deploy was run: the cloud deploys itself from GitHub Actions on every merge to main.

**Caveat for the whole report.** The machine was not quiet. James's own Chrome had a ChromaGlass display page open and connected to the show server (the server log says `display connected (2 now)`, and a Chrome renderer under James's Chrome sat at 100 % CPU the whole time), with OBSBOT Center and Shure MOTIV Mix each at 50–60 % on top. So the governor stepped **down** this time (512² → 384² → 256²) instead of up, and the requested pictures are at 256². I left James's tab alone and took a second set pinned to 512² with the `?sim=512` URL override so the look can be compared with look 4. Both sets are in this folder.

## Summary

| Step | Result |
|---|---|
| 1. Stop old server | OK — node pid 4357 was listening on 3000; killed |
| 1. Pull, install, build | OK — main moved b704ec8 → fa37a1f (3 files, +39/−3); install and build clean |
| 1. Show server | OK — running detached, show key **6834**, LAN host 192.168.0.234, OSC on udp 9000 |
| 2. Screenshots | OK — GPU engine, 1.0x dpr, no page errors. Governed set at 256² (`fillmore4-gpu.png`, `beads-crop-2.png`, `fillmore4-press-gpu.png`); pinned set at 512² (`*-sim512.png`) |
| Beads in patches with empty stretches | **Not visibly, and not measurably.** The yellow core is still an even carpet; the ring-pixel density scan over the warm core gives the same spread as report 3's frame (cv 0.56 vs 0.54, 14 vs 13 sparse blocks out of ~100). Details below |
| Wider size range in the small beads | **A little.** More doublets and joined pairs, and small beads from about 6 to 14 px across, but the crowd still reads as one size at arm's length |
| Press centre clear glass | **Yes.** A near-black clear pit about 40–50 px across at the press point in both sets, the beads gone from it |
| Colour at the fingers' tips | **No.** The dye between and beyond the fingers is the same brightness as the rest of the field; the fingers just fade out, nothing gathers at their ends |
| Fingers | Still ragged and per-press at 512². At 256² they blur to a soft smudge round the pit (spoke depths 16–33 vs 18–48 at 512²) |
| The 512 → 768 → 512 hop | **Explained from the governor code, not reproduced** (the machine was too busy to climb). It is by design: see section 3 |

## 1. Update

```
$ lsof -nP -iTCP:3000 -sTCP:LISTEN
COMMAND  PID         USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    4357 jameshiggins   13u  IPv4 0x292203cb35706c56      0t0  TCP *:3000 (LISTEN)
$ kill 4357
$ git pull origin main
 src/components/LiquidVisualizer.tsx |  7 +++++++
 src/lib/beads.ts                    | 33 ++++++++++++++++++++++++++++++---
 3 files changed, 39 insertions(+), 3 deletions(-)
$ git log --oneline -1
fa37a1f Beads in patches, clear glass under the palm (#21)
```

Working tree before and after: `M package-lock.json`, `?? chromaglass/` (same as every previous report; left alone).

`npm install`: clean (npm audit still reports vulnerabilities; not acted on).

```
$ npm run build
dist/assets/presets-D4QFXRow.js         30.17 kB │ gzip:   7.15 kB
dist/assets/castProtocol-CBXnl1s-.js   181.08 kB │ gzip:  58.51 kB
dist/assets/index-D8gGylTS.js          196.50 kB │ gzip:  61.70 kB
dist/assets/App-BvmM_fFK.js            343.41 kB │ gzip: 102.38 kB
✓ built in 1.38s
```

### Show server

```
$ (nohup npm run remote > ~/chromaglass-server.log 2>&1 &)
$ tail ~/chromaglass-server.log

  ChromaGlass show server

  Show key:           6834
  Laptop (the show):  http://localhost:3000/
  OSC in:             udp port 9000  (/chromaglass/setting/<key> <n>, /chromaglass/action/<name>, /chromaglass/preset <id>, /blow /drop /press /tilt /dye)
  Phone (the remote): http://192.168.0.234:3000/?remote=1&key=6834
  Network display:    http://192.168.0.234:3000/?cast=true&key=6834
```

Later lines in the log: `display connected (2 now)` — that second display is the page in James's Chrome mentioned above.

## 2. Screenshots on the real GPU

Same setup: Playwright in `~/cg-scratch` driving the installed Google Chrome headed at 1600×1000 against `http://localhost:3000/?debug`. Canvas filled the viewport, so the press landed at pixel (921, 517). Script `~/cg-scratch/shoot5.mjs` (governed run, raw numbers in `engine-status-5.json`) and `shoot5b.mjs` (the same with `&sim=512`, raw numbers in `engine-status-5-sim512.json`). The first governed attempt failed on the preset menu click (the menu did not open on a page running 30 ms frames); the script now retries the title button until the menu item is visible. No page errors in either run.

### Engine status, polled once a second (governed run)

| Moment | engine | grid | steppedDown | frameMs |
|---|---|---|---|---|
| initial (10 s after load) | gpu | **384** | **true** | 41.3 |
| Fillmore settle t = 0 s | gpu | 384 | true | 42.3 |
| t = 1 s | gpu | 384 | true | 51.2 |
| **t = 2 s** | gpu | **256** | true | 16.7 (reset by the move) |
| t = 3–8 s | gpu | 256 | true | 16.9 – 19.2 |
| t = 9–10 s | gpu | 256 | true | 21.7, 21.6 |
| t = 11–24 s | gpu | 256 | true | 16.8 – 17.1 |
| Fillmore East, 1969 (25 s) | gpu | 256 | true | 16.9 |
| press held, t = 0 / 1 / 2 / 3 s | gpu | 256 | true | 26.4 / 17.0 / 16.9 / 16.9 |
| 1 s after release | gpu | 256 | true | 16.9 |
| after-press t = 1–5 s | gpu | 256 | true | 16.8 – 20.3 |

Settings after the preset: beads 312, dishSpread 0.85, beads 0.7, cells 0.55, fingering 0.85 (unchanged from look 4). Only one grid change during the settle: 384² → 256² at t = 2 s, after two seconds of 42–51 ms frames at 384². The frame time was already 31–41 ms at 384² before the preset was picked, which is the other ChromaGlass tab and the audio/camera apps, not this build. Once at 256² frames sat at 16.9 ms and the governor never climbed back: 384² is marked failed for the session, by design.

### Engine status, pinned run (`?sim=512`, governed false)

| Moment | grid | frameMs |
|---|---|---|
| initial | 512 | 46.3 |
| Fillmore settle, t = 0–24 s | 512 | 22.4 – 46.2, typically 28–40 |
| Fillmore East, 1969 (25 s) | 512 | 36.1 |
| press held | 512 | 32 – 51 |
| 1 s after release | 512 | 41.1 |

So 512² was running at 25–35 fps on the loaded machine. Fewer solver steps in 25 s than a quiet run would get, so this frame is a little less settled than look 4's, but the look is comparable.

### fillmore4-gpu.png (governed, 256²) and fillmore4-gpu-sim512.png

Composition as in look 4: big dish right of centre with the faint tan rim, cherry red top and right, warm orange-yellow field with the bead crowd, green upper left and a green blob at the bottom, the purple-blue dish overlapping at the left, a pale-blue lozenge where the two dishes cross, a bead-filled cyan blob at the top of the warm field and a second pale-cyan patch at the centre of the yellow. Against the reference photo: the beads have **not** gathered into patches with empty stretches between. The yellow core is still a continuous, even carpet of small circles from one side to the other; the only sparse areas are the same ones as before, the red field and the orange lower-right, where a scatter of larger rings sits on their own. The 256² frame is softer and a touch smaller in the beads than the 512² one, but the density pattern is the same in both.

Numbers: `~/cg-scratch/patchy2.mjs` counts, per 30 px block over the yellow/orange/green-yellow part of the big dish (x 700–1200, y 300–800), the fraction of pixels that are a bead ring (darker than a 13 px neighbourhood by more than 10 luminance units), and reports the spread across blocks. If beads now gathered in patches, the coefficient of variation and the number of sparse blocks should rise.

| Frame | warm blocks | ring fraction p10 / p50 / p90 | cv | sparse (<5 %) | dense (>25 %) |
|---|---|---|---|---|---|
| report 3 `fillmore3-gpu.png` | 94 | 3.3 / 33.0 / 42.4 % | 0.54 | 13 | 57 |
| this `fillmore4-gpu.png` (256²) | 106 | 1.9 / 34.0 / 43.1 % | 0.56 | 14 | 65 |
| this `fillmore4-gpu-sim512.png` | 98 | 4.6 / 35.3 / 42.7 % | 0.54 | 10 | 61 |

No change beyond noise. The sparse blocks in every frame are the ones on the edge of the warm area where the colour turns red, not holes inside the core.

### beads-crop-2.png (clip 800,380 360×300, shown at 2×; also beads-crop-2-sim512.png)

Looser in a small way. Compared with report 4's crop there are more touching pairs and joined doublets, a few figure-of-eight shapes where two beads have merged, and the small beads now run from about 6 px to 14 px rather than all one size; a handful of 25–40 px rings sit among them. But the density is flat across the crop: no stretch of clear yellow glass wider than about one bead, and no dense knot that stands out from its surroundings. It still reads as bubble wrap with a few bubbles popped, not as the reference's scattered oil lenses of many sizes with clear dye between them. Inside the cyan patches the beads are good as before: lit tops, blue-white shading, packed.

### fillmore4-press-gpu.png (governed, 256²; zoom in press-zoom-5.png)

The press centre is now clear glass: a near-black round pit about 50 px across at the press point, with no beads inside it and a soft edge. Around it the beads survive as dimmer circles, and the cyan blob above has been pushed up into a hooked shape. At 256² the fingers are barely there, a soft dark smudge with a couple of faint arms; the whole press reads as a dark hole with a shadow round it, which is a real consequence of the governor's fall to 256² on a loaded machine rather than a change in the fingering. The dye between the arms is no brighter than the rest of the field, so there is no colour gathering at the fingers' tips. Spoke scan on the 70–110 px ring: 14 dark minima, gaps 6–89°, depths 16–33 units (look 4 was 14 minima, depths 19–38).

### fillmore4-press-gpu-sim512.png (pinned 512²; zoom in press-zoom-5-sim512.png)

At 512² the press looks like look 4 with the new clear centre: a black pit about 40 px across, then a broad dark arm to the upper right and another to the lower left, a fan of fine dark tendrils to the right and down, dye and dimmed beads surviving between them, and the cyan blob squeezed up into a foot shape. Ragged and irregular, as intended. Spoke scan: 40–70 px ring 11 minima with depths 18–48; 70–110 px ring 16 minima, gaps 6–134°, depths 18–47; so the fingers are as strong as look 4's (19–38) and even more uneven. As in the governed frame, no colour piles up at the tips; the reference's bright rims at the ends of the fingers are still missing.

### Anything new that is wrong

- Nothing broken. No page errors, bead count still 312, presets and press tool behave as before.
- The press's black pit has a slightly crisp edge at 512² (a soft ring about 10 px wide, then black); in the photo the clear centre bleeds into the fingers more gradually. Minor.
- The cyan blob at the top of the warm field still carries a pale halo a few pixels wide, more visible at 512² than 256². Same as look 4, not worse.

## 3. The 512 → 768 → 512 hop from look 4

Could not be reproduced today because the machine never had room to climb, but the governor code (`src/lib/governor.ts`, `src/lib/platform.ts`) explains it exactly:

- The local ladder is 768@dpr, 512@dpr, 512@1.0, 384, 256, cpu. On this Mac dpr is 1.0, so the start rung for a "strong" GPU is the 512@1.0 entry.
- The governor climbs one rung after 8 s of frames under 17.5 ms with JavaScript work under 9 ms, then settles for 2.5 s. That is the 512² → 768² move seen at the 25 s mark in look 4 (the settle takes about 10.5 s after the preset, which is when the frames first went quiet).
- It steps down after 1.5 s of frames over 22 ms and marks the failed rung so it is never retried in the session. The 4 s press in look 4 pushed the 768² frame time over that line (today the press cost 26 ms for its first second even at 256²), so it dropped back to 512² and 768² was blacklisted for the session.
- `steppedDown` is defined as "below the rung this machine started on". 512² is the start rung, so returning to it reads false. It is not a missed flag; the promotion is simply not sticky, by design.

So the hop is the governor probing 768², finding the press too slow there, and giving up on it for the session. If a sticky promotion is wanted, the change would be either a wider slow threshold during interaction or not blacklisting a rung that only failed while a tool was held.

Today's numbers add one more point: a 60 fps rung that fails because of *other* load (another ChromaGlass tab, audio and camera apps) is also blacklisted for the session, so the show sat at 256² with 16.9 ms frames for the rest of the run even though 384² would probably have been fine once the load eased. A retry after a long quiet spell might be worth considering.

## 4. Suggestions for the next pass

- **Bead patches are not showing up.** Whatever the noise field is doing, its effect is below what a density scan or the eye can see at this bead count and size; the warm core is as even as in look 3. Either the field's amplitude is too low, its scale is close to the bead spacing so it averages out, or the beads settle back to even spacing after spawning. A stronger check would be to print the field's min/max over the dish, or to spawn with the field's contrast raised until stretches of clear glass a few bead-widths wide appear.
- **Size spread is there but small.** The 6–14 px range in the small beads is visible at 2× only. The reference has small beads next to beads three or four times their diameter in the same patch.
- **Colour at the fingers' tips** is the remaining fingering nit: the clear centre is right, but the displaced dye should thicken at the ends of the arms rather than vanish.
- **Governor:** see section 3. Worth deciding whether 768² should be retried after a quiet stretch, and whether frames during a held tool should count towards blacklisting a rung.

## 5. What was not done

- No deploy (GitHub Actions does it on merge).
- James's Chrome tab on the show server was left open; it is the reason for the load. The report's governed pictures are at 256² because of it.
- Nothing committed besides `reports/`; `package-lock.json` and `chromaglass/` untouched; nothing pushed to main.
