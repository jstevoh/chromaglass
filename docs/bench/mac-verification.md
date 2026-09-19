# Mac verification — projection mapping on real hardware

MacBook, Apple M4 · 2026-09-18 (local evening) · branch `claude/liquid-light-chromaglass-wn3eoo` at `c51c79b`
("Switching the last shape off lit the whole wall"). Automated run, no human at the machine.

## Short answers

- **Circle on a skewed quad: correct.** It renders as a tilted, egg-shaped ellipse that keystones with
  the quad. It is not a round circle bolted onto the quad. Only 0.5% of pixels light up in the quad's
  corners outside the local-space ellipse, and only 0.5% inside the round circle a bolted-on
  implementation would draw. Numbers are below.
- **Area between shapes: black on screen.** A gap strip between the circle and the right column, and
  the gap between the triangle and the rectangle, both have mean luminance 0.000 on Metal.
- **"Off": correct.** With one shape and that shape Off, the stage is black: 0.02% of pixels above
  0.03 luminance, max 0.063, mean 0.000. With six shapes, switching one cube face Off removes only
  that face.
- **All five harness lines pass**, on SwiftShader as the step was written and again on the M4's
  Metal renderer.

## Things to know first (deviations and caveats)

1. **Stash.** Before the sync, `git status --short` showed
   ` M package-lock.json` and `?? chromaglass/`. The untracked `chromaglass/` is a **separate nested
   git repo** (its own `.git`, HEAD `59bd3f1 Remove the Monochrome Ink preset`, 140 MB). `git stash -u`
   would try to record an embedded repo as a gitlink, so I ran `git stash push -m "pre-sync 1929"`
   without `-u`. That stashed `package-lock.json` only and left `chromaglass/` untouched on disk. The
   incoming branch has no `chromaglass/` path, so nothing conflicts. The stash is kept as `stash@{0}`.
   `npm install` modified `package-lock.json` again; that change is not committed.
2. **The harnesses use SwiftShader on this Mac, not the GPU.** Playwright's headless Chromium on macOS
   falls back to `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device ...))` unless it gets
   `--use-angle=metal`. As written, `npm run wall` and `npm run bench -- --full` therefore both ran in
   software. The bench's own header says so ("gpu software"), and every rung came out at 2 fps. I did
   **not** commit those numbers as `macbook-m4.txt`. I re-ran both scripts from a scratch copy (outside
   the repo) whose only change is three extra flags in `BASE_ARGS`:
   `'--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'`. A probe confirmed that headless
   Chromium with those flags reports `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`.
   **Suggested repo change (not made): let `chromium.mjs` add `--use-angle=metal` on darwin, or read
   extra args from an env var.** Without it, "run it on the machine a show runs on" measures
   SwiftShader on every Mac.
3. **Step 4 was driven by Playwright, not by hand.** The Chrome extension was not connected, so I
   drove the real UI from a script: All settings… → Projectors → Mapping, `+ Circle`, dragging the four
   `surface-corner-*` handles with the mouse, and so on. It ran in headless Chromium on Metal (renderer
   string checked inside the page) at 1470×956, DPR 1. "The wall" here is the canvas on the Design stage
   with Settings closed. I did not open a separate projector window.
4. **`npm run dev`**: port 3000 was already held by an older `vite` (pid 59734, started 19:20, before
   the pull and the vite version bump). I left it alone, and Vite moved this session's server to
   **3001**. All Step 4 work used `http://localhost:3001/?debug`.
5. **⌘K opens the command palette**, not Settings. The route that worked is the "All settings…" button
   → the "Projectors" rail item → scroll to Mapping.
6. Screenshots are in `docs/bench/mapping/*.png` **on the Mac only and are not committed**, because the
   task said to commit only this file and `macbook-m4.txt`. Each one is described in words below. Ask
   the Mac to push them if you want them.

## STEP 1 — sync

```
git fetch → 87b558f..7218178 (8 commits incoming); pull fast-forwarded to c51c79b
npm install → ok ("5 vulnerabilities (1 low, 1 moderate, 3 high)" — not touched)
```

## STEP 2 — `npm run wall 2>&1 | tail -30` (verbatim, as written = SwiftShader)

Exit 0, 1 min 13 s wall-clock. Every check line is printed **twice**: 114 `ok` lines for 57 checks. It
looks cosmetic, but you may want to check it.

```
 ok   a blanked edge is black through the camera too — mean 0.0000
 ok   and the picture survives it — mean 0.627
 ok   and the picture survives it — mean 0.627
 ok   a corner pin holds through the camera too — mean 0.0000
 ok   a corner pin holds through the camera too — mean 0.0000
 ok   and the picture is inside it — mean 0.654
 ok   and the picture is inside it — mean 0.654
 ok   the guard is being handed a reading of the real frame — luminance 0.612
 ok   the guard is being handed a reading of the real frame — luminance 0.612
  the probe, through the grade  0.184 dim / 0.612 plain / 0.966 lifted
 ok   and the reading follows what the wall actually gets — 0.184 < 0.612 < 0.966
 ok   and the reading follows what the wall actually gets — 0.184 < 0.612 < 0.966
 ok   the guard is on without anyone asking for it — flashGuard true
 ok   the guard is on without anyone asking for it — flashGuard true
 ok   and it is being fed — luminance 0.616801026348039
 ok   and it is being fed — luminance 0.616801026348039
 ok   outside a shape the projector goes dark — 0.513 -> 0.000
 ok   outside a shape the projector goes dark — 0.513 -> 0.000
 ok   and inside it the picture is still there — 0.756 -> 0.706
 ok   and inside it the picture is still there — 0.756 -> 0.706
 ok   two shapes light, and the gap between them does not — left 0.679 gap 0.000 right 0.671
 ok   two shapes light, and the gap between them does not — left 0.679 gap 0.000 right 0.671
 ok   a circle leaves the corners of its quad dark — middle 0.743, corner 0.000
 ok   a circle leaves the corners of its quad dark — middle 0.743, corner 0.000
 ok   a shape switched off lights nothing — 0.0000
 ok   a shape switched off lights nothing — 0.0000
 ok   resetting drops the pass again — gone
 ok   resetting drops the pass again — gone

57/57 checks passed
```

### Same harness on the M4 (Metal) — scratch copy with the three flags above

Exit 0, 16 s.

```
 ok   a blanked edge is black through the camera too — mean 0.0000
 ok   and the picture survives it — mean 0.572
 ok   and the picture survives it — mean 0.572
 ok   a corner pin holds through the camera too — mean 0.0000
 ok   a corner pin holds through the camera too — mean 0.0000
 ok   and the picture is inside it — mean 0.626
 ok   and the picture is inside it — mean 0.626
 ok   the guard is being handed a reading of the real frame — luminance 0.594
 ok   the guard is being handed a reading of the real frame — luminance 0.594
  the probe, through the grade  0.179 dim / 0.594 plain / 0.953 lifted
 ok   and the reading follows what the wall actually gets — 0.179 < 0.594 < 0.953
 ok   and the reading follows what the wall actually gets — 0.179 < 0.594 < 0.953
 ok   the guard is on without anyone asking for it — flashGuard true
 ok   the guard is on without anyone asking for it — flashGuard true
 ok   and it is being fed — luminance 0.5954289276960782
 ok   and it is being fed — luminance 0.5954289276960782
 ok   outside a shape the projector goes dark — 0.523 -> 0.000
 ok   outside a shape the projector goes dark — 0.523 -> 0.000
 ok   and inside it the picture is still there — 0.745 -> 0.686
 ok   and inside it the picture is still there — 0.745 -> 0.686
 ok   two shapes light, and the gap between them does not — left 0.652 gap 0.000 right 0.657
 ok   two shapes light, and the gap between them does not — left 0.652 gap 0.000 right 0.657
 ok   a circle leaves the corners of its quad dark — middle 0.741, corner 0.000
 ok   a circle leaves the corners of its quad dark — middle 0.741, corner 0.000
 ok   a shape switched off lights nothing — 0.0000
 ok   a shape switched off lights nothing — 0.0000
 ok   resetting drops the pass again — gone
 ok   resetting drops the pass again — gone

57/57 checks passed
```

## STEP 3 — bench

**As written (`npm run bench -- --full --out docs/bench/macbook-m4.txt`)**: exit 0, but on SwiftShader.
Not committed. Verbatim:

```
ChromaGlass grid sweep · 2026-09-19T02:33:26.329Z
ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)
tier local · gpu software · 2 layers · dpr 1 · 1280x800

grid        fps   frame   solver    other  steps/s  speed
256²          2 492.4ms    1.3ms  490.2ms        3     5%
384²          2 499.9ms    1.2ms  498.7ms        2     3%
512²          2 500.0ms    1.4ms  499.1ms        1     2%
768²          2 500.0ms    4.4ms  497.5ms        1     2%
cpu192        2 500.0ms   62.7ms  457.9ms        1     2%

solver = one step across every layer (CPU submission time on the GPU path).
other  = the frame minus the solver. speed = steps/s against the 60 the show asks for.
```

**On Metal** (scratch copy, same script, three extra flags). This is what `docs/bench/macbook-m4.txt`
now contains, replacing the earlier two-run file from `5d6678b`, which is still in history:

```
ChromaGlass grid sweep · 2026-09-19T02:34:57.946Z
ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)
tier local · gpu strong · 1 layer · dpr 1 · 1280x800

grid        fps   frame   solver    other  steps/s  speed
256²         59  17.0ms    1.7ms   15.3ms       59    98%
384²         59  17.0ms    1.8ms   15.2ms       60   100%
512²         59  17.0ms    1.8ms   15.1ms       60   100%
768²         48  20.8ms    0.4ms   20.4ms       57    95%
cpu192       42  23.6ms   22.3ms    1.4ms       42    69%

solver = one step across every layer (CPU submission time on the GPU path).
other  = the frame minus the solver. speed = steps/s against the 60 the show asks for.
```

Its self-checks all pass: "the report has a table in it", "the CPU rung produced numbers" and "the
grid went back to Auto afterwards". Note that this sweep reports **1 layer** at 1280×800, while the
earlier by-hand runs reported 2 layers at 1470×956. At 768² it gave 48 fps / 95% speed, compared with
12 fps and 26 fps in the two earlier runs, so the rows are not directly comparable. The SwiftShader
run of the same command reported 2 layers.

## STEP 4 — what it looks like on the M4

Look on screen: "Lava Lamp", Design mode. All coordinates are normalised to the frame.

### a) `+ Circle`, corners dragged into a strongly non-rectangular quad

Stored corners: TL (0.10, 0.12), TR (0.40, 0.20), **BR (0.58, 0.95)** (pulled far out), BL (0.08, 0.72).

**It is an ellipse that follows the quad.** On the stage it is a tilted, slightly egg-shaped ellipse,
running from the upper left down to the pulled-out lower-right corner. The picture is mapped inside it,
and everything outside it is black. The pad preview in Settings draws the same outline
(`01a-circle-skewed-panel.png`, `01a-circle-skewed-wall.png`).

To settle this with numbers rather than by eye, I decoded the screenshot's stage region (160 px across)
and counted pixels above 0.03 luminance. I compared the rendered shape against three predictions:
the correct one (a circle in the quad's local space pushed through the homography), a round-on-screen
circle on the quad's bounding box, and an axis-aligned ellipse inscribed in that bounding box. The
"baseline" column is the same pixels with no shapes, a few seconds earlier:

| region | lit | baseline |
|---|---|---|
| outside the quad | 0.000 | 0.641 |
| quad corners, outside the keystoned ellipse | **0.005** | 0.887 |
| inside a round circle but not the keystoned ellipse | **0.005** | 1.000 |
| inside the bbox ellipse but not the keystoned ellipse | **0.002** | 0.869 |
| inside the keystoned ellipse | 0.716 | 1.000 |

Wherever either wrong hypothesis would light the wall and the correct one would not, the wall stays
dark (0.2–0.5% lit, compared with 87–100% lit before shapes were added). Inside the ellipse, 72% is lit
rather than 100%, because the whole plate is squeezed into the shape and the plate's own dark rim lands
along the ellipse's edge. You can see that in the screenshot.

### b) `+ Triangle` and `+ Rectangle`, spread apart

Triangle quad (0.64–0.95, 0.06–0.42), rectangle quad (0.68–0.95, 0.58–0.92), plus the circle above
(`01b-three-shapes-wall.png`). On screen there are three separate lit shapes with black between them.

- Vertical strip between the circle and the right column (x 0.60–0.63): mean luminance **0.000**
- Band between the triangle and the rectangle (y 0.45–0.55): mean **0.000**
- The triangle's quad top-left corner, which is outside the triangle: mean **0.000**
- Inside the triangle: 0.110. Inside the rectangle: 0.052. Both lit.

### c) `+ Cube`

This adds three faces at the centre: a top rhombus plus left and right faces, each showing its own
third of the plate (`01c-cube-wall.png`, `01c-cube-panel.png`). It reads as a box seen from above.
Where it overlaps the circle's quad, the cube faces draw on top of the circle. Six surfaces are
stored.

### d) Switching the selected shape "Off"

- **Six shapes, the left cube face selected and switched Off** (`01d-selected-off-wall.png`): only
  that face disappears. The part of the ellipse it had been covering shows through, the rest of the
  frame stays black, and the button reads "Off".
- **One shape only (the skewed circle), switched Off** (`01d2-single-circle-off-wall.png`): the
  stage is **black**, not a lit full frame. Before switching Off, 14.1% of the stage was lit. After,
  0.02% of pixels exceed 0.03 luminance, the maximum is 0.063 and the mean is 0.0000. The stored
  surface has `enabled: false`. The last-shape-off bug that `c51c79b` fixes does not reproduce.

## Other things noticed along the way (not fixed)

- **Selection is lost when Settings closes.** `selected` is `useState` inside `OutputPanel`. After
  closing Settings to look at the wall and reopening it, no shape has handles or the On/Off editor
  until you click the shape again. That is a small but real friction in the drag → look → drag loop.
- **The pad is fixed at 16:9, but the stage showed the canvas at 852×762 CSS px while its backing
  store was 1470×956** (the window's aspect). Positions match in normalised coordinates, but shapes
  look different in proportion in the pad and on the stage. The cube is a clear isometric box in the
  pad and noticeably flatter on the stage. Whether the stage should stretch like that is a separate
  question. I did not check a separate projector window, whose aspect would decide what's correct.
- React logs `Encountered two children with the same key, ""` repeatedly from page load onward,
  before any mapping interaction. Pre-existing and unrelated to mapping as far as I can tell.
- The duplicate `ok` lines in the `wall` output, noted above.
