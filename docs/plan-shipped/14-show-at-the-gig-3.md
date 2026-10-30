# 14. The show at the gig: hearing, timing, speed and the picture on the wall: what shipped (continued)

Part 3 of 4 of §14's archive; it begins at 14aa. The section starts in `14-show-at-the-gig.md`.

## Second pass (moved 2026-10-04) (continued)

### 14aa. The plate stutters in bursts on a machine with room to spare (shipped 2026-10-24)

Asked: "things are a little jittery sometimes", and the GPU used across the code. No GPU
in the session that did it, so what was measurable without one was measured, and what
needs the owner's eyes is `docs/judging.md` §64.

**The step count.** The loop turned time into solver steps with an accumulator,
`floor(acc / step)`, and read the time from `Date.now()`: whole milliseconds, part way
into the frame, after a varying amount of work. On a display whose refresh matches the
step, the remainder sits wherever the frame's work puts its clock read, and when that
is near a step's edge the scatter carries it back and forth: a frame with no step, then
one with two. On a 59.94 Hz panel the remainder drifts through the edge every so often,
so it comes in bursts. `npm run cadence` models both loops on seeded displays (a refresh
stamp a few microseconds either side of the refresh, 3.5 ± 1.5 ms of work before the old
loop's clock read, 0.4 % of refreshes missed): the old loop's median over nine seeds
left 40 % of a 60 Hz display's runs uneven (1.7 to 51 % by seed: where the remainder
sits is luck), 7 % at 59.94 Hz, 19 % at 120 Hz with sixty steps, 18 % at thirty; the
new one none. It is a model, not a GPU run (14aa-2). `src/lib/stepClock.ts` now takes
the refresh's own stamp (the draw gate's `lastDraw`, whichever window's refresh drew),
judges the refresh from a median of the last 32 intervals, and when the step is a whole
ratio of it (to half a percent) and this interval is a whole number of refreshes (to 6 %),
takes the interval as exactly that many refreshes of the step's rate, so one accumulator
holds whole and half steps exactly, as the film render's integer count always has. A
missed refresh is the refreshes it was, so steps are still caught up within the old
cap. Everything else, a 90 or 144 Hz panel, a 61 Hz monitor, an interval from the
laptop's refresh to the projector's, keeps its own time in the same accumulator. The
check-skeptic's pass found the first version, which kept two clocks and reset one when
the other ran, running a 60 Hz show beside a 50 Hz wall at 50 steps a second; the
cadence check now draws two clocks through the real DrawGate (60 beside 48, 50, 60, 75
and 120 Hz) and holds each to the wall clock within 0.5 %. Every other per-frame
integrator in the loop gets the steadier interval too.

**The step's garbage (Wave 4.1, H2c-4).** `npm run encode` steps the real solver in the
lab, 512² on a thin gap, and reads the page's allocations with Chromium's sampling heap
profiler (collected objects included). Before: 506 KB a step, 1,939 B a dispatch, 249
`writeBuffer` calls for 267 dispatches, 3.4 ms median of main thread in `step()`. Where
it went: `kernel()`'s `replaceAll` over the source on every dispatch, re-hashed by the
pipeline cache's map (`get`, 207 KB); the failure check's `split` and template strings
(65 KB); the bind group keys spelled from labels; `arg()`'s array and write. Now: kernel
sources made once per format; the pipeline cache answers a name it answered a moment
ago from a hot map (dropped whenever any pipeline fails, and bypassed while a harness
listens, so `npm run startup`'s ledger still sees every ask); `arg()` writes only when
its eight numbers changed (what a buffer holds when the step runs is the last write, so
skipping an equal one changes nothing the GPU sees); the multigrids' names made once;
bind groups found by the objects they bind. After: 31 to 36 KB a step, 120 to 140 B a
dispatch, 2 writes a step and none a repeat, no bind group made, 0.4 to 0.5 ms. The
remainder is the array literals the dispatches are written with.

**The governor's hunting (14j's governor line).** A machine that holds one rung and not
the one above was retried every ninety seconds for ever: in `npm run rungs`'s model, 38
rung changes in half an hour, each retry a grid rebuilt twice and four seconds of
stutter. The wait now doubles each time the same rung, post level or step rate fails
with no tool held, up to sixteen times: 10 changes, retries 191, 367 and 727 s apart,
the first still at 99 s, and a machine that cools gets its rung back. And it forgets:
ten minutes held with no move clears the counts for what it holds and everything easier,
so a show that hunted early and then held its rung for an hour gets it back 92 s after a
four-second burst, not 24 minutes (the check-skeptic's case).

Found along the way and written in as 14ab: the video pour's pause and play every frame,
its CPU optical flow, the CPU field means, the whole-grid delta upload, per-frame bind
groups outside the solver, the beads' canvas, the ear's allocations, the gamepad, the
thick liquid's share.

### 14af. The wall's "title bar" chip: it went on asking, and could not be closed (shipped 2026-10-29)

The owner, from a screenshot of the desk with "THE PROJECTOR WINDOW STILL HAS ITS TITLE BAR ·
fill its screen" across its top: "I can't get rid of this popup. I don't even know what it
means." It meant the wall window was not in full screen, so its frame would sit across the
top of the projection. Three things were wrong:

- It had no close. A wall left framed on purpose kept it over the desk all show. Now an X
  hides it for that wall window (`useCastSession`'s `fillDismissed`, cleared when a new
  window is held).
- It said a fact, not the trouble or the remedy. Now: "The wall window isn't full screen, so
  its title bar shows on the wall" and **Make it full screen**; a click that has not taken
  1.5 s later says to click the wall once or press F there (`ProjectorFillChip.tsx`, moved
  out of `App.tsx`).
- In the Mac app it read only the page's full screen (`fullscreenElement`). A plain Electron
  window in the OS's full screen (the green button) has no title bar at all, and the chip
  went on asking over it. The app now counts a window whose page covers its screen as
  filling it; a window zoomed to the screen keeps its title bar and the menu bar, so its page
  is shorter and still counts as framed. And the button now also asks main.js
  (`fillProjector`, over `chromaglass:fill-projector`), which needs no gesture and falls
  back to the window's own full screen if the page's is refused; the same fallback now
  runs when the window loads. Closing the show now also exits the app 3 s after the quit
  if something holds the quit up: on CI's Mac the check's first version left a projector
  that had been in and out of the Mac's own full screen, and the app then stayed running
  with its port taken.

The web's path was already sound: measured in Chromium 153 under Xvfb, a delegated
`postMessage` (`delegate: 'fullscreen'`) lets the wall's `requestFullscreen` resolve with no
activation of its own. `npm run desktop` gained a line that takes the wall out of full
screen and asks the chip to come up, its button to fill the wall again and the chip to go,
and its X to keep it away for 2 s while the wall is still framed.


### 14ad. Any camera, anywhere; the motion camera told apart from the film's Webcam (shipped 2026-10-24)

Asked by the owner: "I should be able to select any camera as a source any place where we
use cameras in the settings. I'm also confused what the room control is vs. showing video on
the plate", and then, of the film's camera button: "this camera button only uses my laptop
camera".

What main did: two things open a camera. The room's sensor (`useSceneCamera`) had a picker,
drawn only once it was already on and only when the browser listed two cameras, so the
moment someone wants to choose, before the light comes on, it was not there. The film's
camera (`startFilmCamera`) asked for `facingMode: 'environment'` and nothing else, so on a
laptop it was the built-in camera, always; a second webcam, a capture card or a virtual
camera (the way a VJ app's output arrives today, §13) could not be put on the plate. A camera
pulled out left the sensor reading "opening…" and the film reading "camera live" over a dead
track, and neither came back.

What changed: `src/lib/cameras.ts` names the cameras and opens the chosen one by id, falling
back to the browser's pick (and saying so) when it is not plugged in; `useCameras` keeps one
list for both; `CameraPicker` is always drawn, with the remembered camera kept and marked
"not plugged in" rather than dropped. Both sources hear their track end, come off, say so,
and reopen when `devicechange` lists the same camera again. The sensor is renamed by what it
does, **Motion camera**, with a first line ("Its picture is never shown") and a link to the
film's Webcam, which has the opposite line and links back.

Measured (`npm run cameras`, two stand-in cameras behind `navigator.mediaDevices`): 31 of
31, desk and phone. The film opens `cam-usb` by id when picked (main could only ask for
`environment`), switches live, comes off on unplug and back on replug, and each camera's
choice survives a reload apart.

### 14aa-3. The governor climbs back to sixty steps into a stutter (shipped 2026-10-25)

Found by Antigravity on the owner's Mac (Metal, main at fd20c71, Poster, 1969 run 3 × 180 s;
`?steps=30` and Classic clean as controls), after 14aa-2 put Poster's 136 two-step frames in
the 14 s the governor tried sixty steps. Three causes, each in the governor:

1. **The budget was read off a frame, not a step.** At thirty steps on a 60 Hz display half the
   frames take no step, and `gpuFrameMs(0)` leaves the solver out, so the work the governor
   averaged was 7.6–8.7 ms, under the 9 ms it climbs on. That was a fair average of what was
   spent, and no guide at all to what sixty would spend.
2. **A climb was not priced.** Sixty steps adds half a step to every frame, and 768² roughly
   triples a step (8.2 → 25.1 ms). After the climb the GPU spent 15.6–16 ms a frame, or about
   27.6 at 768².
3. **Stepping down read only the average frame.** It needed the average over 22 ms for a second
   and a half, and the average of one 33 ms frame in five sat either side of 22, each dip
   starting the second and a half over.

**Changed** (`src/lib/governor.ts`): the loop hands the governor what one step costs (every
layer, from the solver's own timestamps, `gpuStepMs`) and how many steps the frame took, so it
keeps a step's cost and the drawing's apart; `workAt` predicts a state's cost from them (the
step scaled by the cells, the drawing by the pixels, never less than now), and every climb,
rung or rate, must be predicted under the budget. And a share of frames missing a refresh (over
25 ms, followed over about forty frames), with the GPU over its budget, gives the step rate up
after a second and a half; once begun the verdict holds to half its line, and it is judged
ahead of the average's own, which could otherwise start it over. Only the rate: at thirty a
missed refresh takes no second step, and the rungs, which cost a picture, keep the average's
line. The governor logs its moves (`moveLog`: why, and the predicted cost of a climb), and the
loop counts live frames by their steps (`solver().stepFrames`).

**Measured**: `npm run rungs` replays Poster's measured costs (drawing 4.0 ms, a step 8.2 at
thirty and 9.8 at sixty, 25.1 at 768²; frames over 13 ms miss one refresh in eight, five or
three) through the loop's own accumulator, three seeds a share. Old governor: 57 to 1136
two-step frames after the opening, sixty held 6.5 to 26.9 s or never given up, a climb to
sixty and to two pixels undone every ninety seconds. New: none, sixty given up at 4.0 s every
time, no climb undone. Controls: a light plate keeps sixty and climbs to the sharpest rung its
costs fit; a busy tab takes sixty and the plate has back as much or better within 100 s; a
plate over the climb budget with every frame on time (Classic's costs) keeps sixty and does not
move. On the GPU, `npm run stutter` counts two-step frames per look and climbs undone within
10 s, from the governor's own log.

### 14ac. Cartoons that ship with the app, and the video pour's stutter (shipped 2026-10-24)

Asked by the owner 2026-10-24: early cartoons in the app to run in the background and feed
the visuals, The Skeleton Dance first, and then "I don't want a short loop, I want the
extended cartoon looped."

What shipped. Four cartoons, each the whole film with only its title and end cards cut:
The Skeleton Dance (1929, 5:08), Steamboat Willie (1928, 6:58), Swing You Sinners! (1930,
7:28) and Out of the Inkwell's The Tantalizing Fly (1919, 3:19). A Cartoons shelf on the
desk's Dye panel and in the phone's dye sheet gives each a Pour (into the dish as dye,
looping, with Stop) and a Film (through the projector, under the dye; pressed again, off).
They are not also in Settings' Film section: on the desk that section sits beside the Dye
panel, and `npm run layout` caught the same buttons drawn twice.

Copyright. Every one was published in 1930 or before, so it is in the US public domain
(95 years from publication at the most). Where each copy came from, what was cut, and the
caveats (Disney's trademarks in Mickey; later versions of the characters; that The
Skeleton Dance's only copies online come from a modern transfer, not a print scan; status
outside the US) are in `public/video/cartoons/SOURCES.md`. Steamboat Willie is a scan of
an old 16mm print, cropped to the picture (its frame lines measured at rows 47 and 430 and
its edges at columns 60 and 538 on every tenth second of the reel). Swing You Sinners! is a
1950s television print whose distributor's title cards are cut.

Size. Silent H.264 MP4, 384 px wide, grey, 24 fps, grain smoothed (hqdn3d) before
encoding, the index at the front so a cartoon plays while it arrives: 6.1, 5.5, 8.1 and
1.5 MB, 21.2 MB together. The first pass, 480 px with light smoothing, was 48 MB. Nothing
is fetched at load (the files are not under `/assets/`, so the service worker leaves them
alone), so 14v's load time is unchanged; a cartoon is given to the video by address, so it
starts before it has all arrived.

14ab-1, fixed with it. `App.tsx` handed the poured video to the plate on every animation
frame, and `pourVideo` paused whatever it held before taking the new one, which was the
same video: it was paused and played sixty times a second. Now `pourVideo` takes a video
once (the same one again only makes sure it plays) and the app calls it once, on play.
Measured by `npm run cartoons`'s pour line, on a phone page in Chromium: with the old pour
(the per-frame hand-over and the old `pourVideo` put back), the page closed under the pour
before its two seconds were up (the check's "the page lives through Pour and Film" red,
10/11); with the fix, 2.00 s of the cartoon played in two seconds, 0 pauses, a picture
range of 186 read back from it, 14/14.

The film survives a rebuild. The GL effect's cleanup stopped the film, and that cleanup
also runs when the plate is rebuilt (`glEpoch`: a lost device, a resolution change), so a
loop, the camera or a window went dark on the projector while the panel still said it was
playing. Found by `npm run cartoons` under software WebGPU (`PW_WEBGPU=1`), after its review
made it ask what the projector holds: a second and a half after Film the projector held no
film and the video had been reset (15/16). The film is now stopped only when the plate goes
away, in its own effect (16/16 there).

The check, after one review pass: besides the files and the licence record, it asks that
the video the plate holds as its pour (`__cgVideo` under `?debug`) is the cartoon that
played, and that the plate's frame loop read it where there is a plate (2–3 frames in two
seconds on software WebGPU); that each loops (sent half a second from its end, back at its
start 1.5 s later, no `ended`); and that Stop and Film-off pause that same element and the
plate and projector let go. It runs in CI's browser part.

Measured: `npm run cartoons` 16/16 (no GPU and `PW_WEBGPU=1`), `layout` 77/77, `phone`
357/357, `desk` 48/48, `panel` 197/197, `lint` clean.

**Colour (2026-10-27).** The owner: "the out of copyright cartoons we added are all black and
white - we need some color ones please." Five more, whole and looping, on the same shelf and the
phone's dye sheet, each with a `colour` flag in `lib/cartoons.ts` and a "colour" tag in its row:
*Fiddlesticks* (1930; two-colour), *Jack Frost* (1934) and *Balloon Land* (1935) (Ub Iwerks'
ComiColors, Cinecolor), *Somewhere in Dreamland* (1936; a Fleischer Color Classic) and *Gulliver's
Travels* (1939; the Fleischer feature in Technicolor, title and End cards cut, 74 minutes).
Finding free ones took the renewal records, not the dates: a film from 1931 on is free only if
nobody renewed it in its 28th year, and the Copyright Office's *Catalog of Copyright Entries*
(on the Internet Archive as text) showed nine of the 1933 to 1934 ComiColors *were* renewed
(Exclusive Pictures, 1961 to 1962), so those are not here, while Jack Frost, Balloon Land,
Somewhere in Dreamland and Gulliver's Travels have none. Fiddlesticks is free by date: renewed in
1959, which does not extend a 1930 film past 95 years. What was left off, and why, is in
`SOURCES.md`. The colour cost bits: 4.2 to 7.3 MB a short against 1.5 to 8.1 grey, and the feature
27 MB; the check's bars moved to match (a feature up to 30 MB, the shelf under 80). The pour
already lays each pixel's own colour, so no drawing code changed; `npm run cartoons` now decodes
each file in the browser and holds its flag to its picture (0.0 colourfulness for each grey one,
30 to 82 for the colour ones).

### 14ab-7, 14ab-8. The ear's detectors and the gamepad ring (shipped 2026-10-28, #533)

14ab-7. Each of the ear's seventeen onset detectors kept a second of flux in an array pushed
to and shifted from, and every frame copied it, sorted it, mapped it to deviations and sorted
those, for the median and the median absolute deviation its threshold is built from. They
are two rings (doubling when a faster display fills them) and a partial sort now (`select`
in `audioFeatures.ts`), which finds the element the sort would have put at the middle, so the
threshold is the same number. The live ear stopped copying its two byte arrays into every
reading (nothing in the app reads them); the fifteen-frame median's two scratch arrays are
kept. `AudioFeatures.update` over 20 s of seeded kicks at 60 readings a second: 0.5–0.6 ms →
0.30 ms, 227.65 KB → 5.7 KB an update, sha256 of every reading identical. `npm run eargc`
holds the detector's threshold to the old sort-based detector's, to the bit, every frame at
60, 144 and 400 refreshes a second, while the display changes under it, over a stall, a reset
and a flat source (the lower-middle control disagrees on 285 frames), and the garbage to a
bar with a collection-free window. Two holes the check-skeptic pass found in its first
version are the reason for its shape: it compared hit booleans (a hit sits far above any
threshold, so a lower median, ODF_K 2.9 and a 0.9 s window stayed green), and its garbage
numbers were scavenge leftovers (Node clamps `--min-semi-space-size` to 16 MB; the old way
read 16 KB a frame, not 230).

14ab-8. The game controller's hook gave the App a new `cursor` object every 33 ms while the
ring showed, so the App rendered 43 times a second to move a ring, and its poll compared
against a stale `connected` and set the state on every tick (with 14j's timer line). The cursor is in a store, the
ring is `GamepadRing` (renders when it appears, goes, or swells under a trigger; moves by a
style write), the App is told nothing, and the poll no longer spreads the pad list or maps
the buttons each 16 ms. `npm run renders` gained a gamepad phase on a stand-in pad: with the
old hook under it, 43.3 / 42.8 (laptop / phone, stick sweeping) and 42.3 / 43.0 (trigger
held) renders a second, now 1.0 on all four; the ring found in 12 of 12 looks, changing
place, still under a held trigger, on the page.

### 14ab-3, 14ab-5, 14ab-9. The frame's bind groups, its readbacks and thick liquid's share (shipped 2026-10-28, #549)

14ab-5. The solver has kept its bind groups since H2c-11, but every pass after it made its
own again each frame, over a fresh `createView()` of every texture it bound: the plate's
pack, derive and display, the camera, the post chain's effect, push, stock and finish, the
projector, the particles' and the air's splats, the slosh dish and the ferrofluid drop's
relaxation. `gpu/groupCache.ts` finds a group by walking `WeakMap`s keyed by the pipeline and
then each object bound, and a view by its texture. Nothing has to be told to forget: a
texture made again is a new key, a texture let go is a key the collector takes with every
group under it, and the dye's ping-pong pair is two keys found again on every frame after.
Rooted at the pipeline because `layout: 'auto'` hands out a new layout object on each
`getBindGroupLayout`. The post chain's ring makes a view of each of its 32 layers with the
ring. `npm run framegroups` draws the app's chain in the lab (particles, plate, camera, the
test effect three frames back in the ring, stock, finish, a projector source and the
projector's pass) from three sets of objects each frame, at two sizes with the solver
stepping between frames and the dye's ping-pong pair turned round every other frame: made fresh as before, 12 bind groups and 64 views
a frame; cached, 0 and 0 once a size's first frames are past, every frame equal to the fresh
chain's byte for byte; and a cache keyed by the pipeline alone draws another picture
(the control). The plate's pack argument (the grid) is written when the grid changes, not
every frame.

14ab-3. `readbackAsync` asked the GPU for both fields on every call (two downsamples, two
590 KB copies, two mappings), and the frame calls it every frame for every layer, so a
120 Hz display stepping at sixty, a governor at thirty or a frozen plate read the same fields
back again and again. And it returned "fresh" whenever its ring held anything, so
`syncFromGpu`'s loop over every cell ran each frame on numbers it had, and `rbSeq`, which
tells the bubbles' rim deposit not to put the same displaced dye back twice, rose on every
frame instead of on every new mirror. Every solver submit that may write a field goes through
`submit`, which counts (`ReadGate`, `gpu/readGate.ts`); the readback, `measure`, the share's read and the
harnesses' reads go through `submitRead`, which does not. The review pass found the two
delta writers (`applyDeltas`, `applySplats`) submitting on their own and going round the
count: a pour handed across with no step after it was never read back. They count now,
and `framereads` pours on a still plate (0 asked before the fix, 1 after).
`readbackAsync` asks when the count has moved (or a ring has nothing from this epoch, or a
ring had no free slot last time) and returns fresh only for a landing it has not handed out.
`npm run framereads`, one call a frame: a still plate, 60 asked and 30 taken in 30 frames →
0 and 0; a step every other frame, 60 asked for 15 steps → 15; 74 repeats in 148 taken → 0;
a pour and a clear with no step are still read back; the settled mirror equals the field
read straight out. The bubbles' rim deposit now runs once a new mirror, as its comment
meant, which on a 120 Hz display or a governor at thirty is half as often as before. The means stay in the loop that fills the mirror; the rim is a mask.

14ab-9. `speciesShare` went through `readField`: a new MAP_READ buffer, a 590 KB `slice` and
a 590 KB unpadded copy a read, and a square root a cell. One kept buffer (`gpu/rimRead.ts`), summed where it is
mapped in the same order, the rim a mask made once (`lib/rimMask.ts`, which the solver's and
the app's dish areas use too): the share is the same number to the bit
(`npm run framereads`), and the two reads after the first make no buffer (2 before).

## Third pass (moved 2026-10-29, 19m)

### 14. The show at the gig: hearing, timing, speed and the picture on the wall

- **Shipped, 14v-6: the opening asks its first fills before the display, after the
  mount frames settle** (2026-10-18, this PR). The story and numbers are in
  `docs/plan-shipped/14-show-at-the-gig-2.md` §14v; judged over the week after merge against the week
  before by `npm run flakes -- --check 'no stop in the opening'` (week before,
  2026-10-11 to 18: 26 FAIL of 167 Mac startup runs, 16%, 11 of them green on the same
  commit; this PR's first version went red on its own first run, 2.07 s from 2.59 s,
  with the 200 ms cap below fired before the mount frame had rendered). The week
  after, 2026-10-17 to 24: 41 FAIL of 193 (21%), on 25 branches and on main, so it did
  not help; 14v-7 says why and what changed instead.
  Named shortcuts and retunes: four animation frames is a heuristic for "the mount
  frames have been presented" (the compositor keeps up to two frames in flight, and
  the CI Mac's post-mount frames took 0.30–0.39 s over three to four frames), not a
  signal that the compositor acknowledged them; the cap went 200 ms → 1.5 s and the
  frame count 2 → 4, so the opening can start up to that much later in a tab whose
  frames are held; and the desk's preview hole is measured in `useLayoutEffect`
  instead of `useEffect` (before the first paint, not after).
  What it was (found with 14v-5, read over 124 Mac runs' logs 2026-10-11 to 18, and
  diagnosed on PR #396): the "no stop in the opening" line went red on 14 of 124 runs
  (11%), and every red was 1.3–2.4 s on the adapter or device and then 2.4–4 s on the
  first compute pipeline while `plate/display` compiled and drew beside it. Warming the
  compiler at boot (#396: an empty kernel, a built fill-shaped kernel, and that kernel
  run once) went red on all three Mac runs of its own PR and was taken out; the third
  run showed `fluid/fill:rgba32float` compiling 4.32 s from 2.64 s beside
  `plate/display` (2.64 s) while a frame asked at 3.42 s waited on the GPU process
  until 6.80 s. Now `usePreviewFrame` measures the desk's preview hole in
  `useLayoutEffect` so the plate and intro mount directly at their preview size
  without a second full-window-to-preview resize frame, `introStill()` waits four
  animation frames plus a macrotask (with a 1.5 s cap for a tab hidden mid-wait;
  a 200 ms cap fired at 2.42 s on run 39189617869 before the post-mount frame at
  2.50 s had rendered) even when `#cg-intro` starts with `.cg-still` from
  `index.html`, and `prepareShow` asks the opening's `fluid/fill:*` compute kernels
  before `plate/display` (which still heads the render pipelines and runs alongside
  the remaining compute kernels). `npm run startup` prints the page's first compute
  pipeline ("first compile asked …, given …"), judged by nothing.

#### 14w. The pointer on the wall (shipped)

The owner, 2026-10-04: the mouse cursor must never show on the show, though it may on
the design screen. The projector window and a cast receiver (`CastDisplay.tsx`)
showed the arrow on any movement and hid it after 2.5 s (3 s) still, so it was on the
wall as the window opened and whenever the hand crossed the projector's screen; clean
screen hid it over the plate's canvas only, so it came back over the letterbox and the
"needs WebGPU" card. Now a script and a rule in `index.html`'s head put `show-screen`
on `<html>` of any `?cast=` page before anything else loads, and `.show-screen *` /
`.overlays-hidden *` are `cursor: none !important` (a child's own cursor, the canvas's
crosshair, beat an inherited one). Every
way the show reaches a second screen is that one page: the web projector window
(StageMirror), the Mac app's projector window, the multi-projector surfaces (drawn into
that window by `gpu/output.ts`) and a receiver. `npm run showcursor` asks each, as it
opens, with the mouse sweeping it and later, at a grid of points and on every element,
and that the design screen keeps its crosshair (12 lines; 9 of them red before the
change); `npm run desktop` adds "projector: no pointer on the wall". Nothing else is
drawn at the pointer: the projector copies the plate's canvas only, and no shader marks
where the mouse is. The gamepad's ring (`App.tsx`), the last thing drawn at a pointer,
showed on the laptop in clean screen while the sticks moved, so on one screen (or a
mirrored projector) it was on the show; since 2026-10-05 clean screen hides it and the
design screen keeps it (`npm run showcursor`, the ring's two lines, 13/14 → 14/14 with
the fix taken out and put back). The phone needs nothing: a touch screen draws no pointer, and a phone or
tablet showing `?cast=` gets the same page.

#### 14y. The sound Source opens on Off (shipped, asked 2026-10-22)

The owner: the source should always be None when the app opens, whatever look loads.
Read as the sound Source (Off / Mic / System / File / Band; the phone's Sound tiles).
The video Source already opened on Off and a look never sets either (a look carries how
hard a source drives the plate, never which one is on). What opened on something else
was the sound: a first visit's first click anywhere started the band, and the last
Mic or Band pick came back on every launch from `localStorage`.

- **Shipped:** `App.tsx` keeps the pick in `sessionStorage`, so a new tab or a
  relaunched app opens on Off and a reload of the tab keeps the input (a gig can reload
  without losing the interface). The first-click band is gone; the Band is one press in
  the Sound panel and on the phone. `?kiosk=1`, a box with nobody to click, still starts
  the band on its own. The phone is the same App state, so it opens on Off too.

- **Measured:** `npm run opensource`: the desk and the phone open with the sound on Off,
  a click starts nothing and opens no device, a pick is kept through a reload of the
  tab, and a new tab opens on Off again. Before: a fresh page's first click started the
  band; a remembered Mic reopened on launch.
- **Check changes:** `qa`'s "a first visit is driven by the band after one click" now
  asks that the click starts nothing, and the band is then chosen with its button;
  `kickbubbles` chooses the band by the Sound control after its dials are set (a band
  started at load would play before Audio Impact 0 is held, and the Mac runner's Chromium
  plays without a gesture); `gallery`, `pixels`, `shots`, `swirlcost`, `ferrodrift`'s band
  pages and the sixteen harnesses that set the remembered source write it to
  `sessionStorage` now.

#### 14aa. The plate stutters in bursts on a machine with room to spare (shipped, asked 2026-10-24)

The owner: "things are a little jittery sometimes"; make sure the GPU is used across
the code. Three causes, each with its check: the step count stopped and doubled the
liquid in bursts (`npm run cadence`), each solver step made half a megabyte of garbage
for the page's collector to stop for (`npm run encode`), and the governor retried a
rung the machine could not hold every ninety seconds for ever (`npm run rungs`,
"hunting"). How each was found and measured is in `docs/plan-shipped/14-show-at-the-gig-3.md` §14aa.

- ~~**14aa-3**~~ shipped below (2026-10-25).

- ~~**14aa-2**~~ (measured 2026-10-25 on the owner's Mac, Metal, comment on #441): at
  sixty steps a second (Poster 1969, 256², 60 s) 9.16 % of frames took no step or two
  before, 0 after. Governed three-minute runs at thirty steps: frames of two steps 1 → 0
  (Classic) and 2 → 0 (Neon Coral Reef), gaps over 50 ms 2 → 0, and the [1, 0] pattern
  broken on 0.01 % of on-time pairs. Poster 1969's 136 two-step frames fell in the 14 s
  the governor tried sixty steps and the frames were slow: catch-up, not cadence (14aa-3).

#### 14aa-3. The governor climbs back to sixty steps into a stutter (shipped 2026-10-25)

**Shipped**: the governor measures what a solver step costs apart from the frame's drawing,
judges each climb on what the state it climbs to would cost, and gives sixty steps up when
frames keep missing a refresh with the GPU over its budget, where it used to wait for an
average that sat either side of its line. Poster, 1969 on the owner's Mac held 8.5 to 16.8 s at
sixty steps after each climb, 82 to 192 frames of two steps; replayed in node, 57 to 1136 such
frames after the opening on the old governor and none on the new (`npm run rungs`); on the
GPU, `npm run stutter`. The story is in `docs/plan-shipped/14-show-at-the-gig-3.md` under the same number.

- ~~**14ab-1** *The video pour pauses and plays its video every frame* (a bug).~~ Shipped
  with 14ac (#451). `App.tsx`'s
  frame loop calls `pourVideo` each frame, and `pourVideo` pauses the element it holds
  and plays it again, which fires `pause` and `play`, which set React state twice a frame
  and restart the loop. Fix: `pourVideo` does nothing for the video it already pours, and
  is asked once, on play. Check: a page with a video poured counts `play` events and App
  renders a second.

- ~~**14ab-7** *The ear allocates every frame*: two byte arrays (14f's open line), two
  `Float64Array`s, and seventeen onset detectors each doing slice, sort, map and sort
  on their history. A ring and a selection median.~~ **Shipped** (#533, 2026-10-28): the
  detectors keep two rings and take the median and its deviation by partial sort, to the
  same number to the bit; the live ear stopped copying its byte arrays; the fifteen-frame
  median's scratch is kept. `AudioFeatures.update` 0.5–0.6 → 0.30 ms, 227.65 → 5.7 KB an
  update, readings identical (`npm run eargc`). Story in `docs/plan-shipped/14-show-at-the-gig-3.md`. What is
  left (5.7 KB an update) is the reading itself: seventeen onset objects, three arrays and
  the chroma; not worth a ring of readings until a Mac profile asks.

#### 14ac. Cartoons that ship with the app, and the video pour's stutter (shipped, asked 2026-10-24)

**Shipped** (2026-10-24): four public domain cartoons, each the whole film looping, poured as
dye or played as the film from a Cartoons shelf on the desk's Dye panel and the phone's dye
sheet (`src/lib/cartoons.ts`, `CartoonShelf.tsx`; sources and licences in
`public/video/cartoons/SOURCES.md`; `npm run cartoons`). With it, **14ab-1** (written down
with 14aa): the video pour no longer pauses and plays its video every frame. And the
projector's film (a loop, the camera, a window, a cartoon) now survives the plate being
rebuilt (a lost device, a resolution change), where it used to go dark while the panel still
said it was playing. The story is in
`docs/plan-shipped/14-show-at-the-gig-3.md` under the same number. The owner's look at them is `docs/judging.md` §66.

**Colour, shipped** (2026-10-27, the owner: "the out of copyright cartoons we added are all black
and white - we need some color ones please"): five more, in colour, on the same shelf and the
phone's dye sheet: *Fiddlesticks* (1930, two-colour), *Jack Frost* (1934) and *Balloon Land*
(1935), both ComiColors in Cinecolor, *Somewhere in Dreamland* (1936, a Fleischer Color Classic) and
the feature *Gulliver's Travels* (1939, Technicolor, 74 minutes, the whole film). Each one's status
is in `SOURCES.md` with the catalogue it was checked in; the owner's look is `docs/judging.md` §85.
`npm run cartoons` now decodes each file and holds its `colour` flag to its picture.

The owner: "can we download a couple videos for inclusion into the app? things that can run
in the background and be used for visualizations? like silly symphonies, skeleton dance? and
other early animations?", then "I don't want a short loop, I want the extended cartoon looped."

#### 14ae. One Record button (shipped, asked 2026-10-24)

The owner: "all the various recording options are also confusing and overlapping. What's
video recording? what's audio? what's recording inputs? what's recording the plate?" Three
things get recorded, under eight names in five places: a video file of the plate (the
desk's Video, Canvas Video, Record the plate, the Rec dot, the Guide's Record), a replayable
take of the hands on the plate (Record performance, Perf, the Performance tab) and a
frame-exact film of a loaded song (Render this song). Audio was never a recording of its
own: one switch inside the video's options. Nothing records MIDI, mic or camera input.

Shipped: one Record button (R, MIDI and remote `record-toggle`, the palette, the phone's
tile and Play pill). `lib/recordChoice.ts` keeps what it makes, **Plate video** (default,
what R did before), **Take**, or both; a press with anything running stops all of it. T
still records a Take by itself. One Rec dot with one clock replaces Rec and Perf. The Record
panel (the sliders button) is one page: the choice and the Record button, Plate video's
options (Sound is a setting here), Takes, and Song film (a button that opens the song's
render). The phone's More sheet says what Record makes. `npm run record` is the logic and
the one-of-each; `take`, `layout` and `phone` run the desk and the phone.
