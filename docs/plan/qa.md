# QA list: what the owner found playing it (from 2026-10-04)

The owner's QA rounds, one line per fault, ranked by how much it costs a show. A fix
thread takes the top open item in a tier; the PR that fixes it strikes the line here
(`~~…~~ #NNN`, and "live" once deployed). Where it shows: **desk** (the laptop's
Perform and Design desks), **phone**, **wall** (the show screen or projector), **Mac**
(the desktop app).

**Tier 1. Seen by the room, or it stops the show.**

- ~~**QA-1** The plate pulses each time a control is pressed or a tool is picked.~~ #277
  live (the microphone heard the click; onsets gated in a gesture's moment).
- ~~**QA-2** The mouse pointer shows on the show screen.~~ #271 live.
- ~~**QA-19** Interacting with settings switches to and maximizes the performance window.~~
  Main's 5b81f3c removed the auto-fill on the next click (`useCastSession.ts`); the
  open #323 edits the same listener and is superseded (review pass, 2026-10-10).
  What follows is the report as it was. Desk, wall.
  When the additional window that is used for performances is showing and not maximized,
  interacting with settings to change something automatically switches focus to the
  additional window and maximizes it. The performer needs to be able to use the settings
  without the overall extra window changing states (besides the light show settings
  themselves updating). Cause: `useCastSession.ts` captures any `pointerdown`/`keydown`
  outside raw text inputs and delegates `fillWindow()`, forcing the performance receiver window
  fullscreen.
- ~~**QA-28** The whole plate slides under the camera with the sound, a jolt on every
  kick: nauseating to watch (the owner, 2026-10-11).~~ **Fixed** (Frame Sway, 27a-7):
  #347's cover glass dragged the whole picture 0.39% of the plate a frame on average
  at the default Plate Rock (0.72% at the peak, a quarter of the plate a second);
  it is seated by default now and slides 0 (`npm run framesway`).
- ~~**QA-29** Choices that did nothing: 20 of the 80 values the menus offer were silently
  dropped (2026-10-09 to 2026-10-11).~~ Shipped; story in `docs/plan-shipped.md` §QA-29
  (moved 2026-10-29, 19m).
- ~~**QA-31** The closeup is "even bouncier and twitchier than before": it punches, pumps
  and shivers with the music at Frame Sway 0 (the owner, 2026-10-11).~~ Shipped; story in
  `docs/plan-shipped.md` §QA-31 (moved 2026-10-29, 19m).

**Tier 2. A control does the wrong thing, or cannot be reached.**

- ~~**QA-30** A switch that is on looks like one that is off: the Record panel's Include
  Audio Track is a white knob on a white track when on (1.0:1), four Settings switches and
  the remote's are a black knob on a dark track when off (2.0:1), and eight switch styles
  are drawn in all, one of them the …~~ Shipped; story in `docs/plan-shipped.md` §QA-30
  (moved 2026-10-29, 19m).
- ~~**QA-20** Blow amount isn't sensitive enough.~~ Story in `docs/plan-shipped.md` §QA-20
  (moved 2026-10-29, 19m).
- **QA-20a** The other tools' Amounts, read the same way: what each lays or moves at
  0.05, 1 and 5 of its Amount, against what the dial's ends should mean (the Spray's
  mist, the Press's pressure, the Finger's drag, capped at 0.25 in `fingerDrag`, so its
  Amount stops doing anything past about 1.7). Found with QA-20; not measured yet.
- **QA-20b** Blow's push on `npm run tools` (Mac) spreads widely from run to run: on
  twelve runs of 9 and 10 October the stroke out to the left moved the pool 0.08% to
  2.62% and the one to the right 0.28% to 2.11%, against the lab's 2.72% and 2.82%
  (`npm run airblow`); #335's run went red on 0.08% against 0.15% to beat with 44 of 46
  steps laid as air, on a branch that did not touch Blow. Not QA-20's bubbles: the
  check runs with Bubbles 0 (`scripts/tools.mjs`, its settings). Neither the way (left
  read lower on 8 runs, right on 4) nor the steps laid as air (44 to 54 where printed) follows it,
  so the spread is in what the app does between the pointer's moves and the steps
  (15g-7 is the same question); the next read is the stroke's breath per step, printed.

- ~~**QA-3** Picking a liquid pours it (Ferrofluid turns up before the hand pours).~~ #269
  live (PLAN 15i).
- ~~**QA-4**~~ **Fixed, #293**: with a desk up the chip sits at the top of the plate's box,
  not the window's; `npm run layout` asks it on both desks at 1440/1280/1024 (main: 3,856
  px² over Record). Story in `docs/plan-shipped.md` §QA-4 (moved 2026-10-29, 19m).
- **QA-5** Layers: + appears only on one-plate looks and there is no −. Desk, phone.
  **Shipped (#273, §16f)**: + on one layer, − on two, on the desk and the phone's Play
  sheet (a third plate is 16d).
- ~~**QA-6** The Magnet lays a fixed grid of spikes.~~ #247 live (9t).

- ~~**QA-12**~~ **Fixed, #296**: switching to Hold writes the camera's own centre into the aim (`holdWhereItIs` in `src/lib/macroCamera.ts`, run by App's `updateSettings`, so the desk's chip, the phone's Hold and the Camera menu all get it). `npm run holdjump`: the frame moved 0.299 (from Auto) and 0.197 (from Follow) of the plate in the second after Hold on main, 0.000 now; `npm run phone` asks it in the app on the Mac shard.

- ~~**QA-16**~~ **Fixed, #293**: a hue past 40° from every ink prints as two inks overprinted, green (cyan over yellow) and violet (magenta, half cyan); `npm run benday` 7 (main: green printed yellow, violet blue). Violet is laid flat, 21f.
  On Roy, 1963 a green dye cannot be added: it prints as another colour.
  Desk (the owner's report from the corner dot, plate `roy`). Likely cause, read in
  the code but not yet run: the Ben-Day print snaps every pixel's hue to the nearest of
  three inks (`benDayInkIndex` in `src/gpu/wgsl/plate.ts`, red, yellow or blue), so a
  green lands on yellow or blue. A real comic printed green as yellow and blue dots
  overlapping on the paper; doing that keeps the three inks and gives back green,
  orange and purple. Next to QA-15; deferred with it.
- ~~**QA-18**~~ **Fixed, this PR** (`npm run saves`, 28 lines, in Measure's browser part;
  main fails "Save asks for a name again with a saved look open"). Story in
  `docs/plan-shipped.md` §QA-18 (moved 2026-10-29, 19m).
- ~~**QA-18a**~~ **Fixed, this PR** (the owner's ask, 2026-10-06; `npm run saves`, 33
  lines). Story in `docs/plan-shipped.md` §QA-18 (moved 2026-10-29, 19m).

**Tier 3. On the wall, it looks wrong.**

- ~~**QA-7** Looks read as pixelated, "very digital", on a laptop.~~ #267 live (1b–1g open).
- ~~**QA-8** Sensual Laboratory is washed out by the lamp.~~ #262 live (18b-1).
- ~~**QA-9** Clock Glass and the ferrofluid looks fall short of their references.~~ #280
  live for Clock Glass and Ferro Paint; the maze is 9aa.
- ~~**QA-10** Velvet Underground, Lumia and Cell Bloom are underwhelming: one area of
  interest, not several.~~ #276 live (25a).

- ~~**QA-13** Fillmore East's dish fills only a small part of the canvas.~~ #276 live
  (25g: a square frame 44 % lit → 99 %).

- ~~**QA-14** The looks carry too few colours.~~ #281 live (18l; 18l-1..7 open).

- ~~**QA-15**~~ **Fixed, #293**: the seed is a laid-out panel, Dye Budget 0.45; `npm run
  royopen` 6/6 (main 1/6). Story in `docs/plan-shipped.md` §QA-15 (moved 2026-10-29, 19m).

**Tier 4. Polish.**

- ~~**QA-17** The phone's **Looks** tab wore a sparkle, the icon apps use for AI, and the
  owner wants nothing in the app to read as AI.~~ Shipped; story in `docs/plan-shipped.md`
  §QA-17 (moved 2026-10-29, 19m).

- ~~**QA-11**~~ **Fixed, this PR**: Follow wears a crosshair (locked on one subject) and
  Auto names its cut, "Auto cuts 5s" from Shot Length (`shotLabel`,
  `src/lib/macroCamera.ts`, the same `max(0.5, macroHold ?? 5)` the camera rides for), on
  the desk's chip and the phone's camera buttons; the … Story in `docs/plan-shipped.md`
  §QA-11 (moved 2026-10-29, 19m).

**Checks that went red on a tree they do not measure.** Not seen by the room, but each
holds a deploy until someone re-runs it, so they rank by how often they cost one; Wave
0's step 0.3 is their home and its rule holds: root cause, never loosen. Found on #338's
own deploy, which went red on five Mac checks #338 does not touch and green on the next
run. The Stage sheet's Esc and the Magnet's drag are another thread's (#349).

- **QA-21** Same-seed render determinism failed: two renders of one seed differed
  slightly, then matched on the re-run. Either the check reads a frame before the
  plate is settled or something in the step is not seeded.
- **QA-22** Beat Squeeze failed, then passed.
- **QA-23** The ferrofluid ring drifting with the band failed, then passed.
- **QA-24** Startup missed its 2 s limit by 0.02 s: a near miss, so find whether
  startup grew or the Mac runner was slow, before touching the limit.
- **QA-25** One of the ear's checks missed narrowly. Read from the runs: `npm run renders`'
  "the ear is reading", whose bar is 45 frames in a three-second window (15 a second).
  Every Mac run since 10-10 read 28–36 a second in both windows until #347 (the cover
  glass's return); its own PR run and every deploy since read 15–19 in the second
  window, on the bar. #345 (Preview), #339 and #350 alone read 28–36, so it was the
  glass. In the lab (384², the app's rock and kicks at the default Plate Rock, 600
  steps, SwiftShader): the glass took the same substeps as the tilt alone (2.1–3.2 a
  step), so 27a-1's plan held, but a step cost 1,080 ms against the tilt's 740: its
  drift shift (`driftShift`, one pass for every carried field) called `at` once per use,
  twenty-one times a cell, each a load of the field and one of the gap (a `select`
  reads both sides). **Fixed (this PR):** each of the seven cells it needs read once,
  the gap only for the ferrofluid's volume, summed in the old order: on SwiftShader the field is
  the same to the bit (the lab's dye after 120 steps of the glass, 8879.708350418165 both),
  and a step with the glass costs 865 ms, the glass's own cost from 340 ms to 125.
  Also, since #361 the glass only drifts with Frame Sway up (default 0), so
  at the defaults the shift does not run at all.
- **QA-26** The phone's clean-screen check is flaky; a fix is proposed in a comment on
  #339 (from the Wall reconnect thread), not yet pushed.
- **QA-27** The phone's two-finger Drop (19h-2) is instrumented and waits for its next
  failure to show where the dye goes; read that run before changing anything.
