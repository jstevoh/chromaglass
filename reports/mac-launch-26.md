# Mac launch and GPU check after #26 — 2026-09-13

Run on James's Mac (`~/chromaglass`, Darwin 25.5.0) from a task relayed by the cloud session. Show server brought up on main at #26, then a quick GPU check of the feedback-loop fix (Oil on Water, Macro Bead, the Camera slider on Classic), the macro zoom keys, and the Focus slider gating. No deploy was run. Nothing committed or pushed except this folder on `mac-reports`.

**Read this first.** The wait loop found no look-7 renders running at 20:00:25, so no waiting was needed. The machine was not quiet, the same way look 7 found it: James's Chrome had a show tab connected to the server (one renderer at 100 % of a core since 19:34), MOTIV Mix and OBSBOT running, load average about 5. Every camera-on frame ran at 34–115 ms and the governor stepped 512 → 384 → 256 → CPU 192² during each run, so the frame times below say nothing about the cost of the new camera pass on a quiet GPU. Two of my Playwright runs died on screenshot timeouts under that load; the numbers below are from the third, complete run (`gpu-check-26.json`), with the earlier partial runs cited where they add something.

**Headline.** The fix holds: with the camera on, the plate is not black. Oil on Water reads 179 mean luminance in the 30×30 patch at (35 %, 35 %), Macro Bead 189, and Classic with the Camera slider at 0.6 reads a deep blue (RGB 0,0,156) that is the dye there, not a black plate. No "Feedback loop" message and no console or page error appeared in any of the three runs. `+` pressed three times on Macro Bead takes `macroZoom` 4.5 → 5.4 → 6.5 → 7.8. On a fresh load of Classic (camera 0) the Focus slider is disabled, and it is enabled once Camera is set to 0.6.

## Summary

| Step | Result |
|---|---|
| 0. Wait | `pgrep -f cg-scratch/shoot` found nothing at 20:00:25; continued at once |
| 1. Working tree | ` M package-lock.json`, `?? chromaglass/`, `?? reports/` only; no stash needed |
| 2. Pull | main 57d5496 → **2f4a711** "The plate no longer goes black with the camera on; macro zoom at will; the show stays put (#26)", 8 files +116/−80 |
| 3. Install, build | install clean (npm audit still lists vulnerabilities, not acted on); build 2123 modules, 2.54 s |
| 4. Old server | node pid 8911 on 3000 (started on #25 by look 7), killed; James's Chrome tab was connected to it and reconnected to the new server |
| 5. Show server | pid 11793, show key **6412**, `http://localhost:3000/` = **200**; phone `http://192.168.0.234:3000/?remote=1&key=6412`, network display `http://192.168.0.234:3000/?cast=true&key=6412`, OSC udp 9000 |
| 6a. Oil on Water | patch mean luminance **179.1** (min 175, max 183, RGB 134,189,212), GPU 384², 33.7 ms frames. Not black |
| 6b. Macro Bead | patch mean luminance **189.4** (min 178, max 207, RGB 219,200,2), GPU 256², 40.2 ms frames. Not black |
| 6c. `+` × 3 | `macroZoom` **4.5 → 5.4 → 6.5 → 7.8** (identical in run 1) |
| 6d. Feedback loop | **None.** 0 console errors, 0 page errors in all three runs |
| 6e. Classic, Camera 0.6 | patch mean luminance **11.5** (min 10, max 34, RGB **0,0,156**): deep blue dye, not black. Engine was CPU 192² by then, 77 ms frames |
| 6f. Focus slider | Fresh load of Classic, Camera 0: Focus **disabled**. Camera set to 0.6: Focus **enabled** (run 2). In runs 1 and 3 Classic was picked after Macro Bead and Camera stayed at 1, so Focus was already enabled before the change (Classic does not set `camera`; the preset is a partial overlay) |
| Odd | In run 1 the title read **Fractal Dream** at the end, after `preset-menu-classic` had been clicked; runs 2 and 3 stayed on Classic Light Show through the same steps. Unexplained; see below |

## 1. Launch

```
$ git status --short
 M package-lock.json
?? chromaglass/
?? reports/
$ git checkout main && git fetch origin main && git pull --ff-only origin main
   57d5496..2f4a711  main       -> origin/main
 src/components/SettingsPanel.tsx    | 72 ++++++++++++++++++++-------------
 src/components/TrackPanel.tsx       |  1 -
 src/lib/cameraPass.ts               | 15 +++++--
 src/lib/musicTypes.ts               |  4 +-
 8 files changed, 116 insertions(+), 80 deletions(-)
$ git log --oneline -1
2f4a711 The plate no longer goes black with the camera on; macro zoom at will; the show stays put (#26)
```

Build tail:

```
✓ 2123 modules transformed.
dist/index.html                          1.32 kB │ gzip:   0.58 kB
dist/assets/songMapWorker-Dc5_FQYD.js    5.77 kB
dist/assets/index-DB-0v7-8.css          49.48 kB │ gzip:   8.62 kB
dist/assets/useRemoteLink-Bxgw-GQG.js    4.47 kB │ gzip:   2.08 kB
dist/assets/CastDisplay-Cjqy7viC.js      6.97 kB │ gzip:   2.63 kB
dist/assets/RemoteControl-BxAiFjdA.js   25.33 kB │ gzip:   6.97 kB
dist/assets/presets-BM1IUgIH.js         30.17 kB │ gzip:   7.15 kB
dist/assets/castProtocol-UxNWftNY.js   182.05 kB │ gzip:  58.84 kB
dist/assets/index-B-40N_jS.js          196.50 kB │ gzip:  61.71 kB
dist/assets/App-CNwYTKiK.js            349.27 kB │ gzip: 104.32 kB
✓ built in 2.54s
```

Server:

```
$ lsof -nP -iTCP:3000 -sTCP:LISTEN
node    8911 jameshiggins   13u  IPv4 ...  TCP *:3000 (LISTEN)
$ pkill -f "node server/remote-server.js"      # port free 2 s later
$ (nohup npm run remote > ~/chromaglass-server.log 2>&1 &)
$ tail -20 ~/chromaglass-server.log
  ChromaGlass show server

  Show key:           6412
  Laptop (the show):  http://localhost:3000/
  OSC in:             udp port 9000  (/chromaglass/setting/<key> <n>, /chromaglass/action/<name>, /chromaglass/preset <id>, /blow /drop /press /tilt /dye)
  Phone (the remote): http://192.168.0.234:3000/?remote=1&key=6412
  Network display:    http://192.168.0.234:3000/?cast=true&key=6412

  Same Wi-Fi: use the addresses above. Across buildings, other access points
  or the internet: run "npm run tunnel" in another window and use the https
  address it prints, with ?cast=true&key=6412 or ?remote=1&key=6412.
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
200
```

Later log lines: `display connected (1 now)` (James's tab reconnecting), then a `display connected (2 now)` / `display disconnected` pair per Playwright run.

## 2. GPU check

Playwright from `~/cg-scratch` (`shoot26d.mjs`, the complete run; `shoot26.mjs` run 1 and `shoot26b.mjs` run 2 are the partial ones), installed Chrome, headed, 1600×1000, `http://localhost:3000/?debug`, 5 s after load. Presets picked from the title button's menu with the usual retry. The readback is `gl.readPixels` on the `webgl2` context of `#liquid-canvas` (the context is created with `preserveDrawingBuffer: true`), a 30×30 patch with its top-left at (560, 350) of the 1600×1000 canvas, luminance 0.2126 R + 0.7152 G + 0.0722 B per pixel, `gl.getError()` 0 every time.

| Moment | Engine, frames | Mean lum | Min / max | Mean RGB |
|---|---|---|---|---|
| Initial (Classic, camera 0) | GPU 512², 16.7 ms | – | – | – |
| Oil on Water, +4 s | GPU 384², 33.7 ms | **179.1** | 175 / 183 | 134, 189, 212 |
| Macro Bead, +4 s | GPU 256², 40.2 ms | **189.4** | 178 / 207 | 219, 200, 2 |
| Classic, camera still 1 (carried over) | CPU 192², 68.9 ms | 12.6 | 12 / 20 | 0, 0, 170 |
| Classic, Camera slider 0.6, +3 s | CPU 192², 77.2 ms | **11.5** | 10 / 34 | 0, 0, 156 |
| same, after the screenshot | CPU 192² | 11.6 | 10 / 39 | 0, 0, 157 |

Run 1 (crashed later but got these): Oil on Water 208.8 (RGB 214,218,98), Macro Bead 63.9 (RGB 219,24,1), Camera 0.6 on what turned out to be Fractal Dream 58.4 (RGB 222,1,149). Run 2, fresh load of Classic at camera 0: 10.7 (RGB 15,9,13). The patch lands on whatever dye is at (35 %, 35 %), so the absolute numbers differ between runs; the point is that none is the black plate the camera pass produced before #26, and the Classic value is a saturated blue, not zero.

Screenshots: `oil-on-water-gpu.png` (blue and yellow dye under a soft camera blur, the whole UI showing, title "Oil on Water"), `macro-bead-gpu.png` (yellow-orange bead closeup with the "– 4.5× +" chip in the top bar, Macro lit, title "Macro Bead"), `camera-0.6-gpu.png` (blue-black-red Classic plate). The third one is **the canvas alone via `toDataURL`, no UI**: `page.screenshot` stalled for 45 s at 77 ms frames, and the same stall killed runs 2 and 3 at 30 s and 120 s. The first two are ordinary page screenshots. Run 1's `camera-0.6-gpu.png` (Fractal Dream, with the Settings panel open and Camera 0.60, Focus 0.60, Aperture 0.55, Bloom 0.35 showing) is in the look-7 commit 3cd7754 by accident, see below.

Macro zoom: after Macro Bead, one click on the plate to take focus, then `+` three times, 0.5 s apart:

```
macroZoom before/after each +: 4.5 -> 5.4 -> 6.5 -> 7.8
```

Console: no message matching /feedback loop/i at any level, `consoleErrors: 0`, `pageErrors: 0`, in all three runs.

Focus slider (`input[type="range"][aria-label="Focus"]`, Settings opened with `[title="Open settings"]`, Camera set through the `HTMLInputElement` value setter plus an `input` event):

| Run | Classic reached how | Camera before | Focus disabled before | Camera after | Focus disabled after |
|---|---|---|---|---|---|
| 2 | fresh load, Classic on load | 0 | **true** | 0.6 | **false** |
| 1, 3 | picked after Macro Bead | 1 | false | 0.6 | false |

So the gating works in the direction asked. Note that picking Classic after a camera preset leaves `camera` at 1: Classic's settings do not include `camera`, and a preset applies as an overlay on the current settings. The show therefore keeps the photograph look after "Classic" is picked from Oil on Water or Macro Bead, which may or may not be intended.

## 3. Things the next PR should know

- **Frames and the governor.** Every run went 512² → 384² (on the Oil on Water pick) → 256² (Macro Bead) → CPU 192² (Classic) and never climbed back. Camera-on frames were 34–115 ms against the 17 ms this Mac showed at 512² in looks 5–7 with the camera off, but James's show tab was eating a core throughout (look 7 measured the GPU at 72–99 % busy under the same tabs), so I cannot separate the camera pass's own cost from the load. A quiet-machine pass with `&sim=512` pinned is the way to measure it.
- **One unexplained preset change.** In run 1 the title read "Fractal Dream" at the end of the sequence, after `preset-menu-classic` was clicked (the `classic` step 3 s after the click recorded camera 1, focus 0.6, macroMode false, consistent with either preset since neither sets `camera`). Runs 2 and 3 clicked the same item and stayed on Classic Light Show at every check. It could be a stale-coordinate click into the menu while it was still animating under the load, or the show moving on its own, which #26 says it no longer does. I did not record the title in run 1, so this one is a flag, not a finding. Run 3 records the title at every step and shows no drift.
- **Screenshots stall under load.** CDP screenshots hung at 30 s, 120 s and 45 s with the camera pass on and frames at 77 ms. `canvas.toDataURL` on the preserved drawing buffer returned at once (and the frame after it read 500 ms). If the next task needs a screenshot with the camera on, ask for the canvas image, or pin a small grid.
- **Concurrency with look 7.** The look-7 session committed 3cd7754 "Mac GPU look 7 after #25" at 20:03:37 while my first run's files were sitting in the untracked `reports/` on main; its `git add reports/` swept `oil-on-water-gpu.png`, `macro-bead-gpu.png` and `gpu-check-26.json` from that run into its commit, and its `git checkout main` at 20:03:40 removed the folder under me. This commit replaces those three files with run 3's versions. The Fractal Dream screenshot lives on as `camera-0.6-gpu.png` in 3cd7754 only.
