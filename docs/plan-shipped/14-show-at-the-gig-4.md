# 14. The show at the gig: hearing, timing, speed and the picture on the wall: what shipped (continued)

Part 4 of 4 of §14's archive; it begins at 14ad. The section starts in `14-show-at-the-gig.md`.

## Third pass (moved 2026-10-29, 19m) (continued)

### 14. The show at the gig: hearing, timing, speed and the picture on the wall (continued)

#### 14ad. Any camera, anywhere; the motion camera told apart from the film's Webcam (shipped, asked 2026-10-24)

**Shipped** (2026-10-24): one camera list (`useCameras`, kept current on `devicechange`)
and one picker (`CameraPicker.tsx`) in both places a camera opens, desk and phone alike: the
motion camera (was "The Room") and the film's Webcam, which could only ever open the
browser's "environment" camera. Each choice is remembered apart; a camera pulled out takes
its source off and says so, and opens again by itself when it is plugged back in; a chosen
camera that is missing opens the browser's pick, says so, and hands over when it arrives
(`src/lib/cameras.ts`, `npm run cameras`). The room section is now **Motion camera**,
its first line says its picture is never shown and points at Webcam, and the film's camera
line says it shows a picture and points back. Story in `docs/plan-shipped/14-show-at-the-gig-3.md`.

- **14z-2** (**shipped**): where a song ends and the next begins, measured on real songs.
  `npm run songends` joins eight CC-BY songs (`scripts/fixtures/songs`, credits there) with
  half-second and two-second gaps, gapless and crossfaded, in a quiet room and a noisy one
  (the room 30 dB under the music), runs the app's own ear over them, and plays each song
  whole. The old rule, timed against the room tracker: 16 of 48 gaps and gapless joins, 0
  of 16 crossfades. `SongBoundary` now: 43 of 48, no change inside any whole song; a song's
  end is a dip 40 dB under its own loud level (over 40 s) or a second on the room's floor,
  and the next song is sound that carries on for 0.75 s (a last chord after a stop does
  not). On the lab's twenty-three songs: 65 of 66 gaps, 39 of 44 gapless, no false change
  in 5.8 h. It is heard on every reading of the ear (`onReading`), not on the App's renders
  (14u). Crossfades are song identification's: measured, no summary of the sound (harmony,
  spectral shape, level, hits) moved further between two songs than between a verse and a
  chorus of one. The local matcher now captures every 6 s, not 12: it names every
  crossfade's new song with none wrong, 7.9 s in after a 6 s crossfade (9.4 s at 12), 6.7 s
  gapless in a noisy room. It no longer names songs it has never heard: a held chord made
  one pair at every frame, and n of them against m in a stored song summed to thousands of
  votes at one place in it; each pair now votes once per alignment (`localFingerprint.ts`).
  With each fixture left out of the library in turn, strangers named 38 times before, 0
  after, and the known songs named in 978 captures of 4 s, not 929. The busy flag can no
  longer hang on a throw (14s's `finalizeListen`).

## Fourth pass (moved 2026-10-29, 19m-2)

### 14. The show at the gig: hearing, timing, speed and the picture on the wall

#### 14v. Where the opening's time went (2026-10-04)

Reported by the owner 2026-10-04: "Chromaglass takes a long time to load on the web."
Measured the same day. Where the time went, on CI's Mac with the shader cache emptied
(`npm run startup`, runs 37166785182, 37166234101, 37165604455): the desk is up within
a second, and the plate sits black on its starting frame until its first step at
12.15, 17.62 and 12.49 s. 11.46, 13.57 and 11.83 s of that is `gpu/prepare.ts`
building the opening's fifty pipelines one after another (about 0.23 s each; the
first, `fluid/fill`, 0.6–2.7 s while Chromium starts Metal; `plate/display` 1.5–2.2 s
alone). The owner's machine pays the same, scaled to its compiler, whenever a deploy
changes the shaders. The download is small beside it (about 550 kB of scripts, Brotli,
cached for good) but was a chain: the entry ran before the app's chunks were asked
for, and the GPU was asked for only after they had arrived and drawn.

#### 14v. Changed after it shipped (#254): one render pipeline compiling at a time

- **Changed after it shipped (2026-10-04, #254): one render pipeline compiling at a time.**
  Main's deploy of 5505a2a (run 37196539858) went red on `startup` 4b: the page's
  thread held 4.98 s from 0.96 s, against the 4.5 s cap. The three render pipelines
  asked first (display, derive, the air's splat) did not compile side by side: each
  took 5.22–5.24 s there, where the display alone had taken 1.03–2.49 s on every
  run before this item, and the hold ended 0.27–0.65 s before the display's compile
  did on six of the seven Mac runs since (2.92 to 5.94 s; the seventh still waited
  in its lanes for first uses). Before it, with a kernel first, the hold ended 2.5
  to 4.5 s in whatever was compiling, once with nothing asked yet. So
  `buildInTurn` now compiles one render pipeline at a time, the display still
  first, the other lanes taking kernels beside it. So what the page asks does move
  when Chromium's hold at the GPU's start ends: it can lengthen it. On #254's Mac run
  (37200639755) the hold was 2.91 s from 1.01 s (4.98 s on the red deploy; 1.92 to
  4.98 s on the seven runs since #249), the first step 10.21 s (7.96 to 14.19 s).
  The display still took 3.46 s, settling at 3.9 s with the two kernels beside it,
  which also took 3.46 s each: whatever is in flight under Chromium's GPU start
  ends with it. So one run says the change is not worse and passes 4b with room;
  whether it narrows the spread needs the next deploys' readings.

#### 14z-1. On a New Song opens on Keep

- **14z-1** (**shipped**): On a New Song opens on Keep. Nobody gets a look changed by
  a boundary nobody trusts; New preset and Random are still one press in Settings.
  `npm run music`: "a new song keeps the look unless someone asks for more" (FAIL on
  'preset', ok on 'off').

#### 14z-3. The change lands on a hit of the new song

- **14z-3** (**shipped**): the change lands on a hit of the new song (27 of 31 gaps; else
  1 s after it is confirmed), a median 1.0 s after its first note. After a gap the look fades
  in over 1 s; named by identification, mid-crossfade, it blends in over twice the desk's
  fade, at least 4 s. Judged on the owner's GPU: `docs/judging.md` §65.

#### 14f. Sound and MIDI reach the plate a frame late, through a whole-app render

**Read in the code.** Every frame the analyser calls `setAudioData` with two new
arrays (`useAudioAnalyzer.ts`), which re-renders the whole ~4,400-line `App`; only
then does an effect copy it into `audioDataRef`, after this frame's loop has run, so
the plate reads the sound one frame late. A MIDI CC goes through an animation frame,
`setSettings` and an effect the same way (`rideSetting`, `App.tsx`). `App.tsx` already
avoids exactly this elsewhere ("a re-render of the whole shell sixty times a
second"). On a weaker laptop that is dropped frames and garbage-collection hitches on
top of the solver.

Measured since, by `npm run ears` on the Mac runner (2026-09-27): with the show
window covered and nothing else drawing, the ear's 16 ms tick read 15 times a
second, not 60 (inferred: each reading re-renders `App`, and the main thread could
not take more); the visible app drew 28 frames a second in the same run. On #195's
deploy (main 6c6d17e) the visible page drew 14 frames in two seconds while the rest
of the show was still being built behind it, and `npm run ears` went red on a floor
of twenty frame readings, with the ear doing what it should (the wall's 10 asks all
read in the page's stalls). The floor now asks that every frame the page drew read
(#194); how slowly a busy page draws is this item's to fix, not that check's.

*Fix:* the frame loop reads the analyser and the ride's shadow itself; React keeps
the meters, at about ten updates a second, with the arrays reused. *Measure:* count
`App` renders a second under `?debug` in `npm run desk` with a stream running (12 or
fewer), and stamp the reading's time against the frame's.

#### 14o-smoke. The deployed Worker, measured from a cloud session

- ~~**14o-smoke**~~ (S): the deployed Worker, measured from a cloud session on 2026-10-24.
  The live site's build carries the Worker's address; a POST with no Origin is refused 403;
  one from the site's origin passes the store, size and rate gates to the body (400 on a
  non-audio body); a 4 s tone reaches AudD, which answers that it cannot fingerprint a pure
  tone; and a 10 s clip of the bundled "Live On Rainy Days" comes back 200 `{"match":false}`
  (not in AudD's catalogue). Whether a well-known commercial track comes back named is
  the one thing left, and needs a recording no cloud session should send.

## Shipped after the split

### 14ab-4. The CPU's deltas go across by the rows written (shipped 2026-10-30, #579)

14ab-4. With the GPU solver attached, `flushDeltas` copied all 192² cells of the CPU's
delta arrays into two interleaved arrays and uploaded the dye, flow and multiplier grids
whole every step it had anything, 1.33 MB through three `writeTexture`s, and 590 KB more for
a hand's grid and again for a breath's, for what was usually a bubble's ring or a hand's
disc. The writers that know where they wrote now say which rows (`lib/deltaRows.ts`:
`addDensity`, `addVelocity`, `addTemp`, the bubbles' rims and the holes they fill, the hand
on a thin gap, the breath); the old `dirty = true`, which every other writer still sets,
means the whole grid, so a writer that forgets is slower and never wrong. The rows are a
mask, sent as bands (bands closer than 8 rows go as one upload), with the bands the last
upload to that texture wrote, which its copy still holds and the fold reads; the CPU's arrays
are zero there by then. A texture's first upload is whole: the lab half of the check, handing
its first rows to a fresh solver, caught the multiplier's texture resting at zero, not one.

Finding the rows by scanning the arrays was measured first and dropped: 400 µs a flush on a
plate with a few cells written, twice the copy it would save. `npm run frameuploads`
(node and lab): every writer's cells inside the rows it said (a scan, with a control write it
did not say); the arrays at rest after every flush; the solver's copies bit for bit the
whole run's after every flush in node and the plate bit for bit after every step on the real
solver (two whole runs agree, and a span two rows short is seen); a cell after a cell sends
14 KB, not 1.33 MB; over the node half's thirteen frames 19.6 → 9.6 MB (a hand, a breath and
a bubble's ring are tens of rows each, and the frames after a whole one go whole), and the
lab half's eight 13.0 → 3.3 MB. The flush's own CPU in node, two cells a step: 318 → 18 µs.
The review found the popped hole's fill reaching a wider ring than the rim's, past R = 22
cells (the app caps bubbles at 13); it marks `fillHole`'s own reach now, and the check pours
a bubble of 38 cells. It also had each frame's control seen alone, the multiplier laid in
the lab, and a second breath, so the breath's grid goes by rows in both halves.

### 14ab-2. The video pour's dye and flow on the GPU (shipped 2026-10-30, #584)

14ab-2. A poured video was drawn into a 192² canvas every frame and read back with
`getImageData`, copied whole (147 KB) to be the next frame's reference, and each of its
36,000 cells went through `addDensity` (its brightness as dye, under a luma key) and, where
it changed by more than the video's noise, `addVelocity` (the change read as motion along
the brightness gradient, u = −(dI/dt)∇I/|∇I|², brightness constancy's smallest answer). On
the GPU solver every one of those calls also marked its row, so each step sent all the
rows the picture covered, up to the whole 1.33 MB, on top of the loop's own time (1.4 to
1.6 ms a frame in node, before the browser's read back).

The WebGPU solver now takes the frame as a texture (`pourVideo`, `fluid/inputs.ts`) and
works out the same thing in two compute passes (`videoSample`, `videoFlow`, in
`wgsl/splat.ts`), with the loop's numbers interpolated from `lib/videoFlow.ts`, where the
loop itself now lives for the WebGL solver and the CPU's. The frame is drawn at the grid's
size as the canvas did, each cell the mean of up to four bilinear taps a side over its
footprint so a big frame's detail does not alias into motion, and kept as 8 bits, so the
thresholds see the canvas's whole numbers. Its deltas are held until the step's flush and
added to the CPU's there (`upsampleDeltaSum`), as the loop's writes waited in the CPU's
arrays: two frames between two steps (a step rate under the refresh) add up, and a hand's
push on a thin gap is imposed with the video's, as one. A step with only the video's frames
still flushes, and sends no row of the CPU's. The app's frame makes one call
(`pourVideoFrame` in `lib/videoFlow.ts`): the solver's pass, or, when it has none or poured
nothing (a frame from another origin that cannot be read), the canvas and the loop. With it
one fault went: the pour plays every cartoon on one element, so the next cartoon's first
frame was differenced against the last one's end and the cut read as a burst of motion; a
frame is now fresh when the video's address changes. The still picture's CPU pour
(`injectImage`) moved beside the loop, as it was, to keep `fluidSimulation.ts` under its
size ceiling.

`npm run videoflow` (node and lab, 19 lines; the Mac's fifth shard runs its `<video>` line
alone): in node, the real FluidSimulation through the app's own call pours through the loop
without the pass (the reference) and with it writes nothing into the CPU's arrays, flushes
for the held frames with 0 bytes against 1.03 MB for the check's picture (a cartoon covering
the frame sends 1.33 MB), sends a tool's cells in the same frame by their own row, flushes
before a read of the plate, and hands a frame the pass did not pour to the loop; each video's
first frame is fresh. On the real solver the deltas the fold takes match the loop's to 1.7e-7
(dye) and 3.4e-6 (flow) of their scale, at the grid's size, at four times it and at four by
two (each cell's block dithered, so one tap a cell is seen), a frame a step later too, and
the plate after the fold (its flow to its half float); a playing `<video>` pours where its
frame is, cell by cell. SwiftShader loses its GPU instance copying from a `<video>`, so the
cloud pours an ImageBitmap of it and the Mac the element. Controls: the second frame poured
as a first is seen in the flow, the last frame alone is not the two frames' sum, a flush after
the flush adds nothing, the canvas's pour upside down is 143% from itself, and by hand one tap
a cell, the edge guard removed, the held frames not added, the vertical gradient reversed, the
read's flush removed and the fresh frame keyed on the wrong thing each fail their lines. The
review (check-skeptic) found the first four of those gaps. `pourVideo` costs 0.1 to 0.2 ms
of the CPU a call on SwiftShader, a canvas's copy included; a video's is a copy on the GPU.
`npm run wgsl` now compiles the splat kernels too, which it never had.

### 14ab-13. A poured picture and a poured video land the right way up (shipped 2026-10-30, #591, finished in #596)

14ab-13. The text pour turns its canvas over before it pours ("the plate's rows run from the
bottom of the frame up; a canvas's run down"), and the video pour and an uploaded picture
did not, so if that comment was right both landed upside down. It was. On the owner's Mac
(Apple GPU, Metal), a still plate, a pour and a photograph straight after, beside its source:
the word "TOP RAT" over "bottom" through `pourText` stood the right way up; an uploaded
picture of the same two words, pink above and blue below, landed with the blue on top and
every letter upside down (a vertical flip, not a mirror: the words still read left to right);
and a cartoon frame (Jack Frost, 240 s in: an orange sky above, pumpkins below) poured with
the pumpkins at the top and the sky's light at the bottom. The pictures, before and after,
desktop and phone, are on the branch `antigravity/14ab-13-pictures`.

The grid's rows count up the plate and every pour but the text's laid a source's first row
on the grid's first: `pourPictureCpu`, the solver's `videoSample` pass and the CPU loop. Each
is turned where its rows are taken, at no cost a frame. The upload draws its picture turned
over once, as `pourText` does (`uprightPicture` in `lib/videoFlow.ts`, called by
`usePour.ts`). The solver's copy of a video's frame turns it (`flipY: true` on
`copyExternalImageToTexture` in `pourVideo`, `gpu/fluid/inputs.ts`). The CPU loop
(`pourVideoFrameCpu`, the WebGL solver's way) reads the grid's row y from the frame's row
S−1−y, and the cell above from the row before, so the flow it reads is turned with the dye.
Antigravity's first fix drew every video frame again onto a canvas of its own turned over,
a full-size draw a frame on the path 14ab exists to lighten; the review moved it into the
copy and the loop's read, and the frame loop's call is as it was.

`npm run videoflow` holds it (24 lines, 5 new): a title card with a known top (a bright band
across its top third, a dim one across its bottom third, a blob rising two rows between two
frames) poured through the loop and through the solver's pass lands its brightest cells
above the middle of its dye (`up` +0.334 and +0.332 of the dyed rows' height) and its rise
as flow up the plate; an uploaded picture of it through `uprightPicture` lands +0.333. Each
against the card turned over (−0.334, −0.332) and the upload read as it came (−0.333). On the
code before the fix the four video lines go red (20 of 24, `up` −0.334 and −0.332): the
other twenty hold the pass and the loop to each other, which a frame turned the same wrong
way on both passes. The lines run on the Mac's `--video` shard too, so Metal's turned copy
is asked as well as SwiftShader's.
