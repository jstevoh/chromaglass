# Mac launch and looks after #42

2026-09-15, morning. The Mac is on `main` at b687f94 "Lacing: the threads that outline a boundary, drawn by the strain across it (#42)".

*This report is pushed in stages. The launch section is final. The lacing looks follow.*

## 1. Launch

- **Pull.** I stashed only `package-lock.json`, fast-forwarded 129ad9b → b687f94 (#42), and popped the stash. #42 doesn't touch the lockfile, so the pop was clean and the local edit is kept. A backup is at `/tmp/package-lock.local-backup-42.json`. The nested `chromaglass/` clone is untouched. No `npm install`.
- **Build.** `npm run build`: OK in 1.18 s.
- **Restart.** I killed the old server (pid 25271, key 9281) and started `npm run remote` with nohup. The log is in `~/chromaglass-server.log`.

| | |
|---|---|
| Server pid | **30897** |
| Show key | **1678** |
| Phone | http://192.168.0.234:3000/?remote=1&key=1678 |
| Network display | http://192.168.0.234:3000/?cast=true&key=1678 |
| `curl http://localhost:3000/` | 200, 1320 bytes |

- The key changed, so any tab or display still holding key 9281 needs a reload with 1678. I left James's Chrome and the projector alone. James's Chrome has one tab open, and it isn't the show.
- **Load at the start:** GPU utilisation 94 %, load average 4.3. Timings below are compared by frames, not seconds.

## 2. Lacing (first pass; more to follow)

**Method.** `~/cg-scratch/lace42.mjs` runs Fillmore at `?debug&sim=512` on "GPU · 512² · 1.0x" throughout. `Math.random` is seeded (mulberry32, seed 7), and Granulation 0 and Plate Cells 0 are set over OSC. It runs one page at a time.

Lacing only affects the display, so I swept it inside one page. At frame 400 and again at frame 1100, I set lacing to 0, 0.25, 0.45, 0.7 and 1.0 over OSC in turn. Each capture waits until `settings.lacing` reads the value, then does a `readPixels` of the next frame. A sweep takes about 20 frames per value. Between captures the dye moves only slightly, so the main difference is the threads.

- **Errors:** 0 GL errors from `getError` after every draw in the first 25 s, no shader or GL console lines, and 0 NaN in the dye at the end (after the press).

### Filaments or texture? **In the main dish, filaments that follow the boundary, but they read as a contour map. In the small dish, a stipple.**

2× crops at frame 1100. Each row is lacing 0 / 0.25 / 0.45 / 0.7 / 1.0.

The cyan core in its yellow-green ramp:

![core](l42-f1100-core.png)

A red tongue against orange:

![red](l42-f1100-red.png)

The left of the main dish: cyan → pink → orange:

![left](l42-f1100-left.png)

The small dish (`fluids[1]`), purple into green:

![small dish](l42-f1100-small.png)

- **The threads follow the boundary's shape.** They are not noise sprayed near it. Every line runs parallel to its edge, and they bend with it (top right in the red row, the core outline).
- **But a wide colour ramp gets 4–6 evenly spaced parallel lines, not one braid.** Examples are the stack in the cyan → pink ramp on the left, and the rings around the cyan core. That is exactly the "contour map" the shader comment says the noise should prevent. A soft 100 px ramp and a hard edge both get lines; the hard edge only packs them tighter. At 0.25 it is a faint, fairly pleasant topographic hatch. At 0.45 it is plainly isolines.
- **The lines get jagged where the ramp is shallow and the level barely changes.** They zigzag in a sawtooth with a period of ~6–8 px (the orange below the red tongue, and the lower left of the core row). Inside the red tongue, where two reds of similar hue meet, the pass paints a pale speckled patch. That one does read as texture over the colour.
- **At 0.7 and 1.0 the lines go white and break into sparkle.** At 1.0 the core shows single-pixel glitter along the inner ring.
- **The small dish is a stipple, not threads:** fine pale dashes and dots over the whole purple → green ramp, like video noise. Its threads are aliased, not filaments. My guess is that the magnified layer (`u_layerZoom1`) is sampled with the same one-cell `e` as layer 0, so its line spacing falls below a screen pixel. Even at 0.25 it adds grit.

Numbers (`lacediff42.mjs`). "Lifted" means a pixel more than 8 luminance units brighter than lacing 0 at nearly the same frame; "braid" means |Δ| > 40; "hp" is the 5×5 high-pass. The frames are ~20 frames apart, so a little of the "lifted" count is motion.

| crop | lacing | lifted % | mean lift | braid % | hp |
|---|---|---|---|---|---|
| main dish 380 px, f1100 | 0 | – | – | – | 3.87 |
| | 0.25 | 13.6 | 21 | 3.0 | 4.53 |
| | **0.45** | **20.8** | **26** | **6.3** | **5.48** |
| | 0.7 | 25.9 | 33 | 10.8 | 7.02 |
| | 1.0 | 28.8 | 40 | 15.1 | 8.83 |
| small dish 180×260, f1100 | 0 | – | – | – | 1.49 |
| | 0.45 | 9.4 | 19 | 0.4 | 3.37 |
| | 1.0 | 14.0 | 32 | 3.9 | 6.52 |

Frame 400 matches within 2 points (main dish hp 3.92 → 5.32 at 0.45 → 8.44 at 1.0). A fifth of the main dish is touched at the default.
