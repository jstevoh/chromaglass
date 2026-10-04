# Plan: a plate with real detail, a show you can render, and a show that plays like one

Three threads of work, merged into one running order.

**The look.** Filmed liquid (acrylic pour, oil and milk macro) carries structure at
every scale. Ours does not: measured on a 512 px centre crop, the reference frames
put 4.2–7.3 % of their pixels on a hard edge with a typical local contrast of 2–7,
while our settled Fillmore plate manages 2.4 % and 0.8. At the scales that read on a
wall (4–8 px) the reference carries three to five times more structure. The cause is
numerical diffusion: every solver step advects and diffuses the dye, so anything
finer than about eight cells is gone within a second, and nothing generates structure
below the grid.

**The instrument.** The show can be played from the music more directly than
sound-drive-and-hope, and a finished song deserves a rendered film rather than a
screen capture.

**The show.** Twenty-odd filmed liquid light shows, from the Joshua Light Show's 1969
*Liquid Loops* to a band's show in 2023, were measured with the watch tool
(`npm run watch`) on 2026-09-26. Real shows move in swells and scenes, spend a third
or more of the time near black, hold two or three hues a frame, and do not follow the
kick. Ours is equally busy all the time, which `src/lib/phrasing.ts` measured and
stopped short of fixing. Batch 10 is that thread; its yardstick is the table there.

| Measure (512 px centre crop) | Pour | Drops | Marbling | Ours now |
|---|---|---|---|---|
| Pixels on a hard edge | 7.3 % | 4.2 % | 5.6 % | 2.4 % |
| Typical local contrast | 7.2 | 2.0 | 6.5 | 0.8 |
| Structure at 4 px | 1.5 % | 0.9 % | 1.3 % | 0.3 % |
| Structure at 8 px | 2.3 % | 2.2 % | 2.5 % | 0.5 % |

`npm run detail` (`scripts/detail.mjs`) produces this table, so every batch is judged
the same way rather than by eye.

> **This is the plate's own running order.** The engine work it now sits on — the
> WebGPU port, the effects, air and the second liquid — is in
> [docs/roadmap.md](docs/roadmap.md), which says what comes first and links the
> plans behind each piece. The port landed on 2026-09-20 and the shader freeze with
> it: there is one shading language in the tree now, WGSL in `src/gpu/wgsl/`.

## Order of work

*Written 2026-10-04 from an inventory of every open item in this file and in
`docs/stability-plan.md`, `docs/webgpu-plan.md`, `docs/crash-plan.md`, `docs/rig-plan.md`,
`docs/roadmap.md` and `docs/judging.md`: about 270 items, of which about 30 were the same
work written in two to six places.* This list is the plan: work from the top. Each line
is one PR unless it says otherwise. The detail, the evidence and the measure for each
step are in its section (`§` and the item's id), not here.

**How to use it.** A session takes the first open step in a lane nobody else is in,
reads only that step's section (`grep -n '^##' PLAN.md`, then `sed -n` the part), and,
when it ships, strikes the step here in the same PR (`~~…~~ #NNN`) and marks its section
shipped. What it finds along the way goes into the section it belongs to, and here only
if it changes the order.

**Why this order.** Five rules, in priority:

1. **First, whatever makes every later PR cheaper.** On 2026-10-03, 46 % of the PR check
   runs that finished were red, two thirds of them on a line the PR had not touched (19h).
   Over the week to 10-04 a merged change took a median 90 minutes to go live, and 64 % of
   the PRs' Mac minutes went on pushes that added none of the PR's own code (19i). Every
   step below pays that toll on every push, so Wave 0 is the largest saving in the file.
2. **Then whatever can stop a show or hand it to a stranger,** smallest first (Wave 1).
3. **The owner's Mac judging runs beside the code, in the order that unblocks code** (Wave 2):
   47 items wait on the owner's eyes, and a few of them gate whole sections.
4. **Seams before the features that crowd them** (Wave 3): `LiquidVisualizer.tsx` is 10,109
   lines and `App.tsx` about 5,000. They are not where merges conflict (none of the last 25
   recorded conflicts was in them; the shared documents were, which Wave 0 fixes), but a
   session must read them to change them, and three of Wave 1's faults (S16, 14s, 14u) come
   from state scattered through them.
5. **The frame budget before effects that spend it** (Wave 4), **then features in the order
   their dependencies allow** (Waves 5 to 7).

**Lanes.** Steps in different lanes touch different files and can run in parallel
sessions; steps in one lane go one after another. **A** `server/` and the Workers. **B**
`App.tsx`, the desks, the phone, `src/lib` outside sound. **C** `src/gpu/` and
`src/gpu/wgsl/`. **D** sound and time: `useAudioAnalyzer`, `audioFeatures`, `beatClock`,
`barGrid`, `songShape`, `soundLearn`, `useMidi`. **E** `scripts/`, `.github/`, the build.
**F** docs. **G** `LiquidVisualizer.tsx`, one session at a time, always.

### Wave 0. Every change cheaper and faster to ship (lanes E, F)

Ordered by minutes saved, from the Actions API over 2026-09-27 to 10-04 (19i to 19t
have the evidence). A change merged today waits a median 90 minutes to be live, at most
313; a PR runs its checks about four times; the account's five Mac runners were 87 to
91 % busy; and 14 of 26 failed jobs re-run by hand went green with nothing changed.

- **0.1** ~~**19j** (E, S): a merge that changes no file the site is built from deploys nothing
  and waits for nothing. Eight of the last thirty merges changed no site file, and a
  docs-only merge still ran the whole Mac; #245, which wrote this order, waited 79
  minutes.~~ #253 (3 of those 30 answer `nothing`; the other five rightly carried a site
  change that was not yet live)
- **0.2** **19i** (E, M): a green Mac result carries across a merge of main that is disjoint
  from the PR's own site files. Those pushes were 56 % of the PRs' Mac minutes and 16
  of their 29 reds; this is the largest saving in the file.
- **0.3** **19s, then one PR per check** (E, S each): the checks that go red on trees they do
  not measure, each to its root cause and never by loosening it, worst first by the
  ledger: the drop map's "nowhere else" (19h-1, #238), the phone's two-finger Drop
  (19h-2, #240, found: the old push), the tapped clock's two stopwatches (0-tap), the Finger's "adds none"
  on thin pools (0-finger), the wall's gain (0-wallgain), `qa` with no adapter
  (11-qaguard), the other deploy reds (0-deployreds), the wall's stamps (21-wall,
  14b-askline, 19c-wallmutant), the Magnet's drag (11-magnetdrag), "Blow held still"
  (11-blowbubble), and `tools`' "Pour lays more than Drop", which passes at 0 against 0.
- **0.4** **19r** (E, S): the open shard is back near its 15-minute timeout (median 12.6, green
  maximum 14.1, one cancelled at 15.3); even it again.
- **0.5** **19k** (E, M): one manifest of checks, so a PR that changes only check scripts runs
  only their shards, a new check edits no shared file, and `npm run quick` runs what
  the diff needs, in parallel.
- **0.6** **19m** (F, M, at a quiet moment): fragment files for the shared documents, and this
  file as an index with one file per section; 23 of the last 25 merge conflicts were in
  `PLAN.md`, `docs/judging.md`, the changelog or `package.json`.
- **0.7** **19l** (E, M): app frames readable in a cloud session (headed Chromium under xvfb), so
  a session reproduces a Mac check's logic before it pushes.
- **0.8** **19o with 14p** (E, S then M): a rollback in under a minute, and show night played from
  a tag the owner judged.
- **0.9** **19p** (E, S): a preview URL on every PR, so the owner judges on a real GPU before
  merge rather than after.
- **0.10** **19q** (owner's settings, S): auto-merge with `Measure` and `WebGPU (macOS)` required.
- **0.11** **19n** (E, S): a Measure-only deploy in about 5.5 minutes, not 8.
- **0.12** **19c, 19e, 19d-perms, 19d-maps, 19d-deps** (E, S each): the checks nothing runs or that
  can pass unmeasured (with a `?cast` harness, which S15 needs), shared harness helpers,
  least-privilege workflows, hidden source maps, `engines`.
- **0.13** **19t** (E, S): the owner's judging sheet, generated, with a link per item.
- **0.14** **19f** (F, S): the rest of the docs out of step with the code.

### Wave 1. Nothing at a gig can stop the show or hand it to a stranger

- **1.1** **14m, then 14o** (A, M then S): the show key to loopback only, long and timing-safe,
  a lockout, `maxPayload` and a hello deadline; then the song-ID Worker's origin list
  and limits, with the report Worker's (`docs/crash-plan.md`).
- **1.2** **14n** (B, S): one `sanitizePatch` for the socket, MIDI map files and loaded looks.
- **1.3** **S19, S18** (C, S each): the particle dispatch at 1024², and finite guards on the
  carried fields. **S20** after them (C+G, M).
- **1.4** **S14** (B, S): an error boundary per panel, desk and phone component, the plate
  outside them all.
- **1.5** **14s** (B+D, M): the input picker, Safari's second song, song ID's latch.
- **1.6** **14g** (B, M): a knocked cable brings the input and the projector back.
- **1.7** **14h** (B+E, M): precache the build, never `startOver()` offline, fonts from the site
  (#207's note), timeouts on song ID and lyrics.
- **1.8** **14k**'s build version in the cast hello (B, S), after 0.8's show tag: a projector
  window from another build says so.
- **1.9** **S17** (C, M): a pipeline that fails to build is skipped, not fatal (#212 has merged).
- **1.10** **S16** (G, S): a GPU rebuild keeps the film.
- **1.11** **13-recmem** (B, M): Record streams to disk; a set-length take cannot run out of memory.
- **1.12** **14i-guard, then 14r, then S21** (C, S then M then M): the flash guard in linear light,
  by quarter-wall and the red rule; then the watchdog and a Rescue Go.
- **1.13** **S15** (B, M): a reload re-attaches the wall and resumes the set; needs 0.12's `?cast`
  harness. **S7** (E, M): an hour in CI, nightly.

### Wave 2. The owner's judging queue (the owner's lane, beside the code)

Judged in this order, because these gate code:

- **2.1** **18a-11** Thin Gap's cost (`docs/judging.md` §19a): gates 18a-10, and says whether
  Thin Gap, on in every look since #248, needs a look turned back off.
- **2.2** **15b** the tools' feel: gates 15g.
- **2.3** **16b-cost** a source pass's cost and **13-twoproj** two popup projectors: gate 16d.
- **2.4** **10.0** the first `film.yml` baseline (a session gets 403 on dispatch): gates every
  §10 film judgment, then **10.1** Light Show Night with Pacing up.
- **2.5** **14b-repeat** wall smoothness against cost; **H2b** 30 steps a second; **22h** the
  look's own turning (shipped, judge the eleven music looks against the last deploy before it); **21c** dots and zoom; **3-highlight**; **18i** timed pops;
  ~~**0-bandbubbles**~~ #251 (the owner asked for the fix, 2026-10-04: Audio Impact 0 drops no bubbles).
- **2.6** **P7-cpu**, a decision rather than a look: delete the CPU solver's stepping (the
  roadmap and webgpu-plan say it is unreachable) or extend it (18a-9, 22d say so).
  Recommended: delete; it unblocks 3.2.

Then the rest of `docs/judging.md` in its own order, an area a sitting (the looks, the
Mixer, the ferrofluid, the wall, the phone and the apps), from the judging sheet (0.13),
with each PR's preview URL (0.9) so a look is judged before it merges. The owner's account steps sit here too: **S8-on** (switch the crash reports on),
**19g** (more Mac runners), **12.2** (the store accounts), **13.1-sign** (the Mac app's
Developer ID).

### Wave 3. Seams in the two big files (one session, in a quiet week)

Each a mechanical PR that moves code and changes no behaviour: the same checks, the same
numbers, merged the day it is green so no other branch has to chase it. The point is what a
session has to read to make a change, and the faults that come from scattered state; the
merge conflicts are the shared documents', which 0.6 ends.

- **3.1** **P7-cpu** (G): delete the CPU solver's stepping, about 1,000 lines, if 2.6 says so.
- **3.2** **14l** (G, L): `FluidSimulation` out of `LiquidVisualizer.tsx`; then device recovery as
  `useGpuStage` (which S16's fault came from); then the pointer and touch handlers as
  `usePlateInput`; then the frame loop as a module; then the imperative handle.
- **3.3** **App seams** (B, L, from 14u): the audio source as `useAudioSource` (14s's faults live
  there); one settings-writer layer that tags each write with its source (14u's Evolve
  anchor and 11-back come from those rules being scattered); one action table for MIDI,
  the remote, the keyboard and ⌘K.
- **3.4** **Keep this file small** (F): after 0.6, a batch whose open items are all done moves to
  `docs/plan-shipped.md` in the PR that closes it.

### Wave 4. The frame budget (lane C, measured with `npm run stages` and `npm run renders`)

- **4.1** **H2c-4** constant arguments written once and `kernel()` cached (S): CPU, every step.
- **4.2** **H2c-1, H2c-3, then H2c-2** (M, S, S): the coarse multigrid levels in one workgroup,
  `mgZero` folded in, then a warm start and one V-cycle: about 250 dispatches a step.
- **4.3** **14j with H2c-9 and 14b-120** (M): a draw cap, readbacks only after a step, pack only
  after a step, a heat-aware governor.
- **4.4** **H2c-7, H2c-6, H2c-8, H2c-5** (S each): the readback straight into its ring, no aux
  target without the camera, air only where there are bubbles, first-order velocity.
- **4.5** **14f-midi** (B, S): a MIDI ride without an App render.
- **4.6** **19d-lazy** (B+E, M, after 1.7): load the panels when first opened; drop `motion`.
- **4.7** **14c-4k, 14c-governor, H2c-10, H2c-labels** (S each). Then **H2a**, **H1**, **H3a**.

### Wave 5. Playing it: the instrument

Lane D: **5-downbeat** (S); **14t with 10.3-fast** (M: half tempo in the clock and in the
bar grid together); **14e** (M, output latency and one lead per source); **10.2-shelf**
(S) then **10.3-4otf, 10.3-sure, 10.3-half, 10.3-newsong, 10.3-fill** (S each);
**10.2-snare** then **10.2-build** (M); **10.3-rest** (M).

Lane B: **10-go** Go on the music and a T-bar (M); **5-looklink** (S); **11-back** (S);
**16a-render, 16a-cast, 16a-remote, 16a-follow** (S each); **16b-logo** (S); **5-learncast**
(S); **14a-timers** (S); **14c-readout** (S); **14k**'s remote lag and coalesced pointer
(M); **5-actions** (S); **11-pinch** (S).

Lane A: **14q** (S) then **R8** room lights as fixtures (M); **R4-card** the load-in card
(S); **14m-guest** (M, after 1.1).

Then: **6-recordset** (after 1.11), **8-pictures**, **5-shutter**, **5-channels**,
**R5-kit** the show kit, **14t-decks**, **15h** the Comb, **9j**.

### Wave 6. The physics under the look (lane C, one solver change at a time)

- **6.1** ~~**18a-every** Thin Gap in every look~~ #248 (the owner's pick came before 2.1's
  reading; 2.1 still reads it), then **15b**, **15g**,
  **15d-maze**, **18a-7**, **18a-10**, **RM-E**.
- **6.2** ~~**18b** the lamp through the dye~~ #256 (behind Lamp Ground, 0 in every look;
  the owner picks the looks, judging §31), then **18f** heat from the lamp (which unblocks 10.6
  and the slide plan's S2) and **18j** milk (which replaces 4-milk), and **20a**.
- **6.3** **18c** a pour adds liquid, then **18g** colour leaves by flushing and **18k-spray**.
- **6.4** **18e** edges from refraction (which is #219's 20d).
- **6.5** **18d** each liquid's real properties, then **10.5-bodies** and **H8** more bottles.
- **6.6** **18h**, ~~**18a-2**~~ #255 (then **0-fingering** and **22g**), **18a-3**, **18a-4**, **18a-6**,
  **18a-8**, **18k-film**, **18k-linear** (then **16c-linear**), **18k-chem**.
- **6.7** §20 after its prerequisites: **20b, 20c, 20e, 20f**.
- **6.8** The ferrofluid: **9t** (then **9u**, **9k**), **9h**, **9o**, **9d**, **9v**, ~~**9w**~~ #266, **9z**, **9m**,
  **9l**, **9p**, **9q**, **9r**. Spin: **22b** to **22k** (~~22h~~ #252). Painters: **21b**, **21d**. The
  wall's picture: **14i** (then **16c-clip**). Smaller: **0-gridband**, **0-seam**,
  **10-small**, **16c-stack**, **RM-F** then **RM-D**, **RM-desk**.

### Wave 7. Reach

- **7.1** The stores (§12), after the owner's accounts (2.x): **12.3**, **12.5**, **12.6**, then
  **12.7**, **12.8**; **12.4a**; later **12.9**.
- **7.2** VJ software (§13): **13.4** the OSC write-up (S, any time), **13.5** OSC out and Link,
  **13-port**, **13-intel**, **13-icon**, **13-update** (after signing), then **13.2**
  Syphon, **13.3** NDI and Spout, **13.6** video in.
- **7.3** Many plates (§16): **16d** (after 2.3), **16e**, then **R2**, **R5**, **R4**.
- **7.4** **§17** hear the set ahead (after 1.7). **R6** watching a real rig. **H4**, **H5**.
  The slide plan: **RM-S4**, then **RM-S135** after 6.2's heat.

### One home for work written twice

Each of these was written in more than one place; the first location is the one to read
and to mark shipped, and the others now point to it.

| Work | Home | Also written in |
|---|---|---|
| Real viscous fingering | 18a (18a-2) | §0, 10.4, 15d, roadmap Stage 1 G, #228 |
| A tool's push lasts one step | 18a (18a-3) | 15b, roadmap §H |
| Milk's opacity | 18j | §4 |
| Heat and a plate that lives on its own | 18f | 10.6, roadmap S2 |
| More liquids as bodies | 18d | 10.5, roadmap §I |
| Standing domes | 9t | 9u, 15d, 18k |
| The lamp through the dye, edges by refraction | 18b, 18e | #219's 20a, 20d |
| Linear light | 18k-linear | 16c, §14's opening, rig R3 |
| A Mixer row per plate | 16e | 11 step 6, rig R7 |
| Layers at their own speeds | 16d | 10.7, roadmap Stage 4 |
| Sound learn's bar on the one | §5 | 10.3 |
| A beat track on the shelf | 10.2 | 10.3 |
| Half tempo | 14t (the clock), 10.3 (the bar grid) | done together, 5 |
| MIDI clock phase | 14e (Start, dropout), 14t (Continue, SPP) | done together |
| Precache, fonts, offline | 14h | §13, 19d |
| Source maps, `CRASH_GPU` | 19d, 19c | `docs/crash-plan.md` |
| The song-ID Worker | 14o | `docs/crash-plan.md` |
| The show kit | rig R5 (R5-kit) | §13 |
| Draw cap, pack and read back after a step | 14j | 14b, H2c-9 |
| Probe pixels and timestamp labels | 14r, H2c-labels | |
| Mixed versions at the projector | 14p | 14k |
| The checks red on trees they do not measure | Wave 0's list | §0, §11, 19h |
| Press dye on the GPU | 18a-3 | 15d |

## Running order

The batches, and where each stands. This table is the ledger: a PR that ships a step
updates its row. The order to work in is the order of work above.

Where each batch stands, as of 2026-09-27:

| | Batch | State |
|---|---|---|
| 0 | The dye a tool makes | **Shipped** (#152); the fingering push that grew a grating of stripes, dots and labyrinths in every pool, and drained the plate, **taken out** (`npm run grating` §5), not yet seen on the Mac; it was also the phone's two-finger Drop reds, one finger's pool at a third of the other's (#240, `npm run grating` §6 replays them); real viscous fingering to replace it, open |
| 1 | Sharp liquid, and pigment in it | **Shipped**; sharpening retired, granulation stands |
| 2 | Lacing | **Shipped**; its 4–8 px gate moved to batch 3 |
| 3 | Drops, not rings | **Shipped** (#163): drops and bubbles as air pockets, shaded as a projector throws them |
| 4 | Liquids that behave differently | **Shipped**; milk's opacity still owed |
| 5 | Playing it | Sound learn **shipped** (#155, on #154's bands); shutter and look link **not started** |
| 6 | Render a song | **Shipped** (#153 seed, #154 offline bands, #156 render); the 3-minute 1080p gate is unmeasured |
| 7 | The room in the plate | **Shipped** |
| 8 | The desk | **Shipped** |
| 9 | Ferrofluid after the references | Sharp edge and two looks **shipped** (#161); maze detail **shipped** (#167); dye carried **shipped** (#168); the magnet's spikes, 9e, **shipped** (#183, with the phone's fingers as magnets), not yet judged on the Mac; fingers past the spikes, 9i, **shipped** (#200, `npm run fingers`), not yet judged on the Mac; Blow and Finger move it, 9n, **shipped** (#206, `npm run ferrohands`), not yet judged on the Mac; picking the Magnet no longer gathers a black pool in the middle, 9s, **shipped** (`npm run magnet`), and pours nothing, with Magnet Size, 9x, **shipped**; brings no ferrofluid at all, only moving what is poured, 9y, **shipped**; the pool it sets down is 9u, open; colour between the domes, 9f, **shipped** (`npm run domes`: the dye kept; the gaps still narrow, 9t), not yet judged on the Mac; the magnet as a disc 9v, open; carrying the ferrofluid, the mix and the reactions across a new solver, 9w, **shipped** (`npm run regrid`, and `npm run magnet`'s check 8 on the Mac); the dye at its own grid across one, 9z, open; 9g, 9h, 9j, 9k–9m, 9o–9r and 9t open |
| 10 | Playing like a show | Step 0, film every look, **shipped** (#162); its first full baseline not yet run; step 1, rest, big events and darkness, **shipped** on the sequencer (#170), not yet filmed; step 2, the song's shape, **heard** live (builds, drops, breakdowns; `npm run shape`) and **followed** by Pacing (#182, Follow the Song; `npm run pacing`), not yet filmed; step 3, accents, the one **shipped** (#184, Accent the One; `npm run downbeat`), not yet seen on the Mac, every other bar, fills only, a hand's variation and a press pulled onto the beat not started; step 4, press round and lift into fingers, **shipped** (#185, `npm run lift`), not yet seen on the Mac, and Beat Squeeze, found never to have pressed the plate, **pressing** on every kick and let go after each (`npm run lift`, `npm run squeeze` on the Mac), not yet seen on the Mac; step 5, oil and water as bodies, **shipped** (#179, Oil Bodies, on in Oil & Water), not yet judged on the Mac; steps 6 and 7 not started |
| 11 | The mixer | Step 1, the sources there are in one stack with a grade each, **shipped** (#176); step 2, the gel wheel and the lumia as rows, **shipped** (#189); step 3, a blend per row, **shipped** (#193); step 4, a take button and fade time per row, **shipped** (#195); step 5, the desk's Mixer over the rides and not the plate, **shipped** (#196); none yet judged on the Mac; step 6 waits on rig-plan R1 (§16e) |
| 12 | The App Store and Google Play (at the end of this plan) | An iPhone shell (Capacitor) and an Android one (Trusted Web Activity) planned; step 1, the site on a phone, **passed** on the iPhone (Safari, 2026-09-27), Android not yet run; step 4, the iPhone shell, **built** with the laptop-remote mode (4a), compiled in CI, not yet on a phone |
| 13 | ChromaGlass in popular VJ software (at the end of this plan) | Planned 2026-09-27: a small native wrapper (Electron) first, with the whole show cached offline and the show server inside, then video out through Syphon, NDI and Spout, OSC control, Ableton Link and video in. Step 1, the Mac app, **shipped** (`desktop/`, `npm run desktop`, built in `desktop.yml`), not yet opened on the owner's Mac with a projector (`docs/judging.md` §26); steps 2 to 6 not started |
| 14 | The show at the gig: hearing, timing, speed, the wall (at the end of this plan) | Found 2026-09-27 by reading the code: the show goes deaf behind the projector window (14a), the wall can draw twice a refresh (14b), the projector's pixels come from the laptop's ratio (14c), the beat clock hears smoothed bass (14d). 14a **shipped** (the ear keeps hearing behind the wall, and says when it is deaf; `npm run ears`), not yet seen on the Mac with a real covered window; 14c **shipped** (a wall's pixels are the wall's: a Retina laptop on a 1080p projector opens at 1920×1080, was 960×540, and is offered 1024²; a 4K wall's bottom rung is 2.07 Mpx, was 8.29 like its top; the mirror smooths at 'high'; `npm run rungs` 70/70, was 63/70), whether 1024² holds on a 1080p wall not yet measured on the Mac; 14d **shipped** (the clock hears the kick's onset, by its time; `npm run kicks`), not yet counted in the app on the Mac; 14b **shipped** (one draw a refresh with the wall up, whichever window asks, each offer stamped with its refresh's own time: `npm run wall` 119.1–120.2 draws a second on a 60 Hz display before, 59.8–60.3 after, and 60.0 with 11.7 ms draws where the first version drew 68.7; covered, every ask draws); on the Mac runner, with a renderer, `npm run wall` 187/187, the governor fed a whole refresh of the faster window; 14b-2 **shipped** (on a busy machine the gate no longer turns down a window's own next frame: 23.4 drawn of 29.4 handed before, 29.5 of 29.5 after, `npm run wall`'s busy phase; its floor judged in the same seconds); 14f **shipped for the sound** (the ear tells React ten times a second and the plate asks for each frame's reading itself: the App renders 11 a second with the band, was 70, and a quiet page only its clock, was 5; `npm run renders`; on the Mac the plate heard its own frame's reading on every frame), the MIDI fader's half still open; 14v, the load: the opening built three at a time, the app preloaded and the GPU asked for at boot, **shipped** (`npm run loadtime`; `startup`: first step 9.52 s cold on the Mac, was 12.15–17.62 s); 14v-2, the display asked for first and two duplicate kernels merged, **shipped** (Mac numbers in §14v) |
| 15 | Every tool on every liquid | Audited 2026-09-27 (table in 15); 15a, every laying tool lays the bottle, **shipped** (`npm run bottles`, Mac); 15d, the Press moves the oil with its colour, **shipped** (`npm run pressoil`), not yet judged on the Mac; the ferrofluid's half **shipped under Thin Gap** (a pressed pool stays full, spreads by the volume the glass displaced and comes back on lift; the ferrofluid's own viscosity in the gap; `npm run ferropress`), not yet judged on the Mac, and with Thin Gap off a press still greys it; 15c, Blow's wind carries the colour and the oil rather than erasing them, **shipped** (`npm run wind`, and `tools` on the Mac) as a carry, a shortcut 15g replaces with air's shear on the film; not yet judged on the Mac; 15b, 15e, 15f, 15g open |
| 16 | Many plates (rig-plan R1, at the end of this plan) | Picked by the owner 2026-09-27 ("Let's build multi-plate next"); planned in five steps. 16a, the back plate's own look, **shipped** (#231, `npm run backplate`), not yet seen on the Mac; 16b, a projector picks its source, **shipped** (#226, `map`, `mixer`, `wall`), not yet seen on the Mac; 16c, beams add and the seam goes, **shipped** (#232, `beams`); 16d–16e not started |
| 18 | The physics under the look | Audited 2026-09-28 (section 18): the shortcuts where the plate imitates a liquid's result instead of simulating it, ranked by gain against GPU cost; the top four are the plate as a Hele-Shaw cell (18a, which the tools' 15b/15g and the grates thread's fingering wait on), the lamp through the dye (18b), a pour that adds liquid (18c) and each liquid's real properties (18d). **18a first part shipped** behind Thin Gap (off in every look; `npm run thingap`); **the Press draws the liquid back when you let go, on Thin Gap, shipped** (carries in substeps, the press a bowl, the glass lifting in seconds, the Press's carries retired there; `npm run presslift`, `tools` on the Mac), not yet judged on the Mac; **Thin Gap on in every look, shipped** (#248, the owner's pick; saved looks carried over; the opening builds its pipelines before the first step), its cost not yet read on the Mac (2.1); **forces as forces (18a-2) shipped** (body forces answer the liquid's viscosity, Rain Drip heavy colour, Updraft a shear, Glass Smear a sliding glass; `npm run forces`); 18a-3 to 18a-11 left, each its own PR; **18b the lamp through the dye, shipped** behind Lamp Ground (0 in every look, the owner picks which go on the lamp; `npm run lamp`), 18b-1 to 18b-6 left |
| 19 | The checks, the build and the plan itself (at the end of this plan) | Found 2026-09-28 in a review of the workflows, the harnesses and the build: `gallery.yml` holds the Mac runners (19a, **shipped**: by label or by hand, and a merged PR's runs stop, `npm run macqueue`), Measure is near its timeout (19b, **shipped** with 19h: three parts side by side, every step runs, and the `wgsl` and parse gates), checks that can pass unmeasured or that nothing runs (19c), the build (19d), the harnesses as code (19e), the plan out of step (19f); what a red PR costs and which reds are the PR's own (19h, **shipped** in part: docs-only PRs skip the Mac, the shards evened, two flaky lines handed off; and a deploy skips the Mac when the PR's site files are apart from main's newer ones); 19i to 19t, faster coding and releases, measured 2026-10-04 (Wave 0 of the order of work), not started |
| 20 | Lace and holes: a pale film torn open over colour | Planned 2026-09-28 from a still of another show: clear film dewetting in the gap, under the lamp (18b), edges from refraction (18e), oil discs on the front layer. A CPU prototype tears a film into lace with holes over a hundredfold of sizes. The lamp ground it needs shipped (18b, #256: a clear pool throws 100% of the lamp, `npm run lamp`); 20a–20f open |
| 21 | Looks after painters | Roy, 1963 and its Ben-Day Dots control **shipped** (`npm run benday`, lab); not yet judged on the Mac; 21a–21d open |
| 22 | Spin the plate | Asked 2026-09-28: the dish turned on command and by itself, at a rate or with the tempo. 22a, the Spin tool, Auto Spin (Off, Rate, Tempo) and Reverse Spin, with the liquid dragged round by the glass through the gap, **shipped** (#223; `npm run dish`, `npm run turntable`), not yet judged on the Mac (`docs/judging.md` §28). 22h, the look's own turning (motor, music, flick) on the same dish, so a flicked plate of water trails the glass, **shipped** (#252; `npm run turntable`, `npm run flick`); 22b–22g, 22i–22k open |

Also landed or in flight around these batches: the macro closeup's cells ride the paint
and stop shaking at 6x (#165, `npm run cellride`); the show's pipelines are built before
it opens, so a cold Mac no longer freezes for 6–19 s at the start (#164, `npm run
startup`), and draws with each of them once before it opens, so the first frames no longer
stop for a second or two either (#181); the magnet stays where the hand leaves it (#159).

### 0. The dye a tool makes, and the deploys it is blocking

`src/gpu/wgsl/fluid.ts` (advection), `scripts/tools.mjs`

**Shipped in #152.** The Finger's "adds none" passes on Metal (208 → 199 against
−16 and −7 left alone), as do the Blow and the Press, and plates hold less dye at the
same point than before. What follows is how it was found.

*Found 2026-09-27, not yet done:* **"adds none" still goes red on runs that do not
touch the Finger.** #182's tools shard (a Pacing change; the same code had passed the
shard one commit earlier) read 50 → 64 against −12 before and +9 after, red by 1.5.
The check allows |Δ − d| < 0.15·total + 5 + |d| with d the larger-magnitude idle
reading, signed. So when the plate's two idle readings have opposite signs, the
allowance is centred on one of them rather than spanning both, which is not the
bracket its comment describes ("a Finger that makes dye still has to beat both").
Whether to bracket it (Δ within the two idle readings ± the allowance) is a decision
for the check's owner, taken with §0's "what the check should mean" below, since on
the positive side it is looser whenever the larger idle reading is the negative one.
*Measured 2026-09-27 over 40 Mac tools shards, and not a flake:* the Finger adds dye
on a thin plate. The pool the check strokes is laid by holding Drop for 1.5 s of wall
time, so its size follows the runner's speed: 49 to 279 across the 40. On all 12 pools
under 150 the stroke added +11 to +21 while the plate alone had lost 1 to 34 before it
(and gained 7 to 11 after); on settled pools it read about what the plate did alone.
That is up to a third of a thin pool, §0's fault at a smaller size, and the three reds
(106 → 127, 50 → 66, 73 → 90) were all thin pools. Bracketing would have made all 40
pass, which is why it was not done (the check-skeptic review: the after window carries
the stroke's own aftermath). Two things follow, in order: a control on the Mac (the
same timing with the Finger picked and no stroke) to settle whether the after window
is the plate or the stroke; then the advection fix below, which is what makes this
check green for good. Laying the pool by solver steps rather than milliseconds would
make it one size every run, but only after the fault is fixed, or it hides it.

*Found 2026-09-27, **fixed in #225 and #238** (2026-10-03/04; #238's first Mac run, with silence chosen, read 0.4, 0.4 and 3.7 past the drift against allowances of 10.7, 27.1 and 12.8):* **the mirror check's "and nowhere else" goes red at
exactly its limit on changes that cannot move a pixel.** It was the plate, not the
check. Six rounds of measurement on the Mac runner found the calm Classic plate
starting a single plate-wide flow out from the middle (0.63–0.88 of it radial, mean
speed up to 0.34) with the first bubble a drop trapped, and never with Bubbles at 0
(speed stayed near 0.005). Each bubble presses the glass over its footprint every
step, and the press source was balanced with a plate mean the CPU guessed from the
gap deltas over a resting gap of 0.03; a held press has squeezed its gap to the
floor (0.004), where the deltas are clamped away, so the guess was wrong and the
difference went into the pressure solve as a net source, which a closed plate has
no answer for. And on the app's glass the press's memory (`gapMemory`, a 0.22 s
half-life of remembered squeeze that does not move the gap) was summed into the
press's own rate every step it was held, so a held press pushed out some three
hundred times what its gap lost, and went on pushing from a gap already on the
floor. The projection's right-hand side is now made zero-mean exactly on the GPU
(`divTiles` in `wgsl/fluid.ts`): the glass lifting a hair everywhere to take what a
press pushed out. And the memory takes over only once a press has gone, never past
the floor (`squeezeUpdate`). `npm run heldpress` (lab, Classic's glass): a held
press's far plate once steady 3.28e-2 on main, as fast as while it closed, half of
it radial; 4.6e-5 after. It went red again after #225 (#218, #230, #237 and main's
997c71f deploy, all the same shape: drops 1 and 2 clean, then the middle moving by
itself). #238 found the bubbles were the simulated band's, started by the check's own
first drop, and that the air's standing source in `divergence` poured liquid out of
every still bubble with the whole plate as the sink (the item on a still bubble
below). It takes the term out and has the check choose silence and assert that no
band played. The original report follows.
 #191 (PLAN.md only) read
"Classic, calm, layer 1 turned a quarter: and nowhere else" at 11.1 past drift
against an allowance of 11.1, at the tool's mirror through the centre
(`scripts/mirror.mjs`, the Mac plate shard). It has been red at its limit on other
branches that do not touch the plate. Either the mirror echo it was written to catch
comes back now and then, or the allowance is drawn from a drift reading that is
sometimes as large as the echo; which of the two is the first thing to settle, from
the per-drop numbers it already prints. A thread cannot re-run a job (403), so each
of these costs the owner a by-hand re-run. *Later that day:* #208's plate shard read
13.4 past drift against 12.5 at row 3, column 5, not a mirror cell, where the drift
grew on every drop (3.5, 5.9, 11.2, 60.1): a region starting up by itself caught two of
the four drops (past drift 1.0, 3.1, 30.8, 23.7), and a median of four does not hold
two. So the second guess, the plate's own movement, not an echo; #225 traces that
movement to a held press (every trapped bubble) setting the whole plate flowing.

*Found 2026-10-03 (#225), open:* **with presses that move the dye, the grid pass
holds less of the grid-band detail.** `npm run grating`'s pressed plate (gap −0.3 in a
step, ten steps a press) read 22% on main because its presses were swallowed by the
unbalanced press source (the dye under them barely moves). Balanced, the same presses
push the dye, and the pass holds the band to 64% of what grows without it; a variant
balanced before the clamp reads 74%. The owner chose to re-baseline that line
(2026-10-03): it now asks for under 0.68, between the shipped pass (64% lab, 65% Mac)
and a pass 30% weaker (3.5% a step reads 70.0%, 2.5% 75%, 1% 87%); it leans on
`npm run heldpress` to catch presses that stop moving the dye. It is not at the fronts: masked away from them
(87–95% of the plate kept) the fix reads 62–70% and main 37–38%. The flows with the
pass on and off are the same (mean |u| 0.462). Rendered in Red Cabbage's closeup at
2.8x and 8x, neither shows the 45° grate (`/mnt/project-files/mirror-fix/`, outside
the repo). Open: whether the pass should be stronger where the flow is strong or the
gap is changing, or whether the dye's conserving advection grows the band itself
under a strong flow (its divergence by central differences is not the projection's).
Both renders also show a vertical seam down the middle of the plate, on main as well:
its own item, unmeasured.

*Found 2026-10-03 (#225), **half done in #238** (the air's standing source is gone):* **a still bubble presses the glass.** Every
step, each bubble lays a standing press of 0.0035 over 0.85 of its radius
(`LiquidVisualizer`, "A bubble is air between the plates"), which holds the gap
under it at the floor so the dye is pumped out from under it. The air's own
standing term in `divergence` did the same with a source where the air is and a
sink everywhere else, and that half is what still moved the whole plate after
#225: balancing a source with a uniform sink is exactly a flow out over the whole
plate, for as long as the bubble lasts. On the Mac, four bubbles near the middle of
a calm Classic plate took its mean speed from 1.3 to 40–138 (thousandths), 0.70 of
it outward; in the lab (`npm run heldpress`, trapped bubbles) the far plate held at
4.57e-3, 0.79 of it out from them, and 1.83e-5 with the term taken out (#238). Both
were shortcuts that imitate how a trapped bubble looks rather than simulate it: in
a real cell a bubble spans the gap and displaces the liquid only while it grows,
shrinks or moves, and a still one pushes nothing. What is left is the press, which
#225 balanced and which reaches the floor and stops (heldpress), but which still
stirs the liquid round every bubble. And the press's memory (`gapMemory`) still pushes
liquid after a press without moving the gap, so a release's remembered squeeze is
liquid from nowhere: a real squeeze film is overdamped and pushes out exactly what
its gap loses, as fast as the viscous film lets it close. Replace both with the air excluding the liquid by
itself (the bubble as a region the flow goes round: a no-flux boundary, or the
Hele-Shaw permeability going to zero inside it), and measure it with `npm run pops`,
`npm run straw` and `npm run heldpress`, which should then need no press to hold.

*Found 2026-10-04 (#238); **shipped #251 (0-bandbubbles)**:* **the simulated band's
kicks released bubbles whatever Audio Impact said.** The first click on a browser that
never chose a sound source starts the band (`App.tsx`, the first visit's wake), and
from then on a kick may release bubbles into the densest dye near the middle of the
plate (`LiquidVisualizer`, "A few bubbles at a time"). Audio Impact 0 and every
mapping set to none leave that on, which is how the drop check's calm plate came to
have bubbles at all; the check now chooses silence (`scripts/mirror.mjs`). Whether
Audio Impact 0 should mean the music touches nothing, bubbles included, is a look
question: gating them would change only plates set to 0.
**Shipped:** the owner asked for the fix (2026-10-04), taken as: Audio Impact 0 means the music drops
no bubbles; the first click still starts the band. A kick's odds of releasing air now
follow the dye ring's own scale, impact over its default (0.45), capped at the
default: unchanged at 0.45 and above (the same draws, so a render at the default is
the same render), thinning with the fader below it, none at 0. The phone's Sound Drive
is the same setting. `npm run kickbubbles` (Mac, open shard) plays it as a first visit
does, on the laptop and the phone at 0 (no release over at least 15 kicks that reached
the bubbles' decision) and at Classic's own 0.55 (drive 1, a share of kicks near the old
45%), with `chromaglassDebug().musicBubbles()` counting the frame's own chances,
releases, Audio Impact and Bubbles.
*Found along the way, not done:* a song's chorus lifts Audio Impact by 0.2 for the plate
(`useMusicIntelligence`, music library tracks only), so a fader at 0 is 0.2 in a
chorus, for every reaction behind it, not only the bubbles. Whether 0 should hold
through a chorus is a look question.
Still reaching the plate from the band at Audio Impact 0, each behind a dial of its
own and left as it is: Soap Bursts on the beat (Soap Flow), Rock and the rhythm plate
(Plate Rock, Beat Squeeze), the maze breathing on a kick (Ferro Labyrinth), the
camera's beat (Macro Sync), and the look's pace (Tempo Sync). Whether any of those
should also answer to Audio Impact is a later look question, not done here.

*Found 2026-10-04 (#238), not yet done:* **with the band playing, the ferrofluid
poured round Classic's middle drifts into it.** Picking the Magnet on Classic pours a
ring round the middle; `npm run magnet` watches the disc 0.12 round the middle for
nine seconds with the solver stepped with no magnet at all. While a still bubble
poured liquid out over the whole plate (the standing air term #238 removed), eight
runs on other PRs read the disc's mean 0.058–0.099 at the start and 0.054–0.184 at
the end; with that outflow gone and the band left playing (the check's own click
starts it), the Mac read 0.180 and 0.501. So the outflow was hiding something the
band does to the middle. Not found in the lab: the app's own step (sound drives held
at zero, as the check holds them), the same pour, and four bubbles held or kicked on
and off near the middle keep the disc at 0.095 → 0.083–0.086 without the outflow
(0.062–0.069 with it), and dense dye with no bubbles moves it 0.095 → 0.103. Left to
look at: the band's bubbles as the app moves them (carried by the flow, pressed,
popped with a puff of air), and the first 2.5 s, when Beat Squeeze and the band's
turbulence still run and the disc already reads 0.180. In silence the same window on
the Mac read 0.099 → 0.084 with no bubbles on the plate (a run of #238 before #230
merged), so it is the band. #230 then took the pour out of the pick and that line out
of `npm run magnet`, so no check sees this now: build one that pours a ring round the
middle with the band on, in the app, on the Mac, and find what moves it.

*Found 2026-09-27, not yet done:* **the wall's "output gain lifts what reaches the
wall" went red on a run that does not touch the output.** #184's tools shard (Accent
the One, default 0, which leaves every kick's weight at exactly 1) read 0.040 → 0.046
at a gain of 2.2, a lift of 1.15 against the 1.25 it asks (it usually reads about 1.5;
main's deploy one commit earlier passed it). Not the flash guard: the bracket turns it
off, and with it off the loop resets its gain to 1 at once (`LiquidVisualizer`, where
the guard's reading comes back null). The plain frame was unusually dark (0.040,
against 0.164 for the same plate earlier in the run), so a guess, unmeasured: most of
its light was in a few bright cells that a 2.2 gain clips at white, which lifts the
mean far less than the grade. If so, the check should read cells the gain cannot clip
(below 1/2.2 before the grade) rather than the whole frame's mean. *Later that day:* over 40 tools
shards the lift read 1.52 to 1.90 in 37, 1.15 and 1.19 in the two reds, 2.20 and 2.27
at the top: single odd readings, not a spread, so clipping (which would spread them)
is the weaker guess. The frame is the flip's stripe plate, not the show's (0.02 to 0.05
where the keystone before it read 0.05 to 0.19). The wait after a config change counted
the page's animation frames, not the stage's drawn ones, and did not wait for the guard
to be off; it now waits for both, and the check prints all seven readings in order, so
the next red says which frame was odd (this PR).

**The phone's take-button checks judge the fade by its own clock, and the slider by
its lag behind it** (this PR, `npm run phone`). #207's Checks run went red on "set to
one bar in the drawer, the same take lands in about half the time … with a jump", on a
PR that does not touch the Mixer, and a cloud session went red on it on 4 of 4 runs.
The check read the slider every 80 ms and judged each step against the time between
reads, but a slider shows what React last rendered: one render landing ~120 ms late
and the next catching up read as a jump. Now the app logs each level a take works out
(`window.__cgFadeLog`, kept only when a page asks), the fade's steps are held to the
time between them and to coming about a tick apart, and the slider is held to how late
it is behind the fade. 5 of 5 runs green (two on 2026-10-03's main); red on all three lines against a timer slowed
to 400 ms, a slider written one tick in 25, a level rounded to tenths and a clock a
quarter second ahead on one tick in ten.

**Deploys no longer re-measure a tree its PR already passed** (this PR, `npm run
deploygate`). Measured 2026-09-27, 1 AM to 11 AM PT: 18 red runs, 5 of 16 deploys.
Every deploy re-ran the four Mac shards; 16 of the last 20 merges published exactly
the tree their PR's `Checks` had just passed on, and 3 of the 5 red deploys (#189,
#195, #196) were that tree going red the second time on a check nothing in it
touched. `deploy.yml` now skips the checks when the tree is the PR run's (the head
contained main, and its run was green) and runs them in full otherwise. It halves
the Mac jobs per merge, which is also what had run times at 20–55 minutes by noon
against 10 at 1 AM.

*Found 2026-09-27, not yet done:* the checks that went red on deploys that day, on code
they do not measure (besides the Finger, the mirror and the wall's gain above): Beat Squeeze on two deploys (#190's,
"with the band playing, the show hears kicks — 3 in 45 s"; #195's, "the tapped beat
drives the show's clock — 149.5 bpm tapped at 122"), the ear on #195's deploy ("the
wall only where the frames stalled past 250 ms — 0 of 10 read within 250 ms"), the
phone's two-finger Drop on #186's deploy (B 81 against 2/0/0, fine by eye; the check is
split in two in batch 11's note on it, and its cause found there 2026-10-04: the fingering push), `qa` on
#189's deploy with no WebGPU adapter in 10 s, and `startup`'s GPU-start stop at 3.52 s
against 3.5 on #194 (that one: see the `startup` item in §0's CI list, fixed by
telling Chromium's hold on the page apart by the page's own thread). Each wants what §0 asks of the Finger: find whether the check or
the product is wrong, from the numbers it prints.

*Read 2026-09-28, on #216's show shard, a docs-only tree:* "the tapped beat drives the
show's clock" read a beat every 401.7 ms against 404.1 ms tapped, its second red, after
#195's 396.6 against 401.4; the runs of #203 and #211 on the same code read 405.8
against 405.8 and 403.2 against 403.2. The clock is not the suspect §11 names:
`setExternal` is handed the tap's reading right before `update` on every frame, with the
same `now`, so every frame ends on the tempo source's own period, and nothing in the
check clears the tap (only Tempo: Listen Again does). The two numbers come from two
stopwatches. The check stamps each tap in the page just before `chromaglassAction('tap-tempo')`, and the app stamps it again
inside `tapTempo`, so a pause between the two stamps (a collection, or the first call
into `runAction` on a busy runner) lands in one and not the other. Both reds read the
app's mean shorter, which is what a late first stamp does, by 14.4 and 7.2 ms over the
three gaps, where the check allows 6. This is read in the code, not run. *Proposed:*
`chromaglassDebug()` returns the tempo source's reading. The check then asks that the
clock's period is that period to within 0.5 ms (the feature: the tap drives the clock).
Separately, allowing for dispatch, it asks that the app's taps are the harness's
(a tap dropped or doubled moves the mean by a third or more). The `check-skeptic` holds
both halves red.

The dye's advection now thins
where the flow spreads and thickens where it gathers (the Jacobian of the
backtrace, in `macCormack`), with a gathering cell held to the most its upstream
cells held. The Finger's own velocity was never the source — in the lab it moves
the plate's total by 0.0% — the fingering push added after the projection was
(taken out since, below): it ran along the dye's gradient, the Finger's carry made that gradient steep,
and the backtrace copied the dye outward (lab, the Finger's path under the
push: 636 → 756 against 687 left alone; now 622 → 588 against 612). Holding
the gathering side matters: carried conservatively, a push up the gradient is
diffusion run backwards and grew a speck from 1.0 to the 6.0 ceiling in under
five seconds.

**The fingering push grew a grating, and was what drained the plate** (2026-09-27,
`npm run grating` §5). Reported on Classic: stripes three to eight cells across at
every angle, and a quarter of an hour in, red dots in a lattice about ten cells
apart with labyrinths between them. Not #174's checkerboard (one cell, on the
grid's diagonals): a push in `forcesB`, set by a look's Polarity, moved the dye
along its own gradient by a slow noise, and where the noise was negative that is
diffusion run backwards, which grows a spinodal pattern inside every pool at the
size the push's gradient sees (a logical cell either side). In the lab, Classic's
own step on forty pools for ten seconds, 512 under 192, the worst channel's
share of variance in waves 2.6–16 texels across, in parts of 10,000: 52 as laid,
107 without the push, 2518 with it, and 819 at a quarter of its strength; the
plate kept 97% of its dye without the push and 41% with it. Tried on the same
plate before taking it out (a first look, alpha only, waves 2.6–8 texels, where
the push read 1895 against 32 without it): carried as a flux (conserves the dye, grows the pattern three times as fast:
4165), pushing only outward (345, and still losing dye), pushing along the
contours (3298), and only at a pool's edge (40 at ten seconds; at thirty, 109
against the stirring's 45, a comb of teeth along every edge and holes drawn into
pools). On a phone's grid (256, half-float dye) at Velvet Underground's strength
(Polarity 0.9, 0.22) the same push grows its waves a few cells long, where the
grid's axes pin them: the crosshatch the owner saw on the iPhone (2.6–5 texels,
231 against 22 without it; the picture is in the project's files, not the repo,
at `dye-grating/phone-grid-half-float.png`). None of
those is the phenomenon (below), so the push is **taken out**,
on the GPU and the CPU plate alike. The Finger's "adds none" reds were this loss:
the plate alone lost dye, so a stroke read as adding it; the
Finger's own lab read −0.2 idle out of 1329 with the push off (finger-lab, 2026-09-27).
Still to see: the Finger's check on the Mac over a run of builds, and whether the
looks with Polarity have lost an edge movement the owner liked (docs/judging.md
§20).

*Found 2026-09-27, not yet done:* **real viscous fingering.** In a Hele-Shaw cell
(two glasses and a gap b) the flow is Darcy's, u = −(b²/12μ)∇p, and an edge
between two liquids fingers only where the thinner one is driving into the
thicker: growth σ(k) = U|k|(μ₂−μ₁)/(μ₁+μ₂) − b²γ|k|³/(12(μ₁+μ₂)), so the surface
tension γ across the edge sets the finger width (fastest near λ = πb·√(γ/(ΔμU)))
and a still plate does not finger at all. *Since 18a-2 (2026-10-04) the thin gap's body
forces are forces: a push moves a liquid as h²/12μ says, and Rain Drip's heavy colour
already fingers by Rayleigh–Taylor, the gravity cousin of this. What is left for this
item is the colours' own viscosities and the capillary jump; Polarity's push between
colours is still a dial read as a speed (hsPrep's stirring).* The solver has the pieces: the gap
(vel.w, the squeeze), a drag through it (Depth Drag), a Jacobi projection, and
liquids with a `body` in the liquid field; and a Hele-Shaw thin-gap mode (§18a, #220: Thin Gap,
off by default) brings the mobility-weighted projection and the gap's
drag, so this builds on it. Build: a viscosity per liquid carried
with the dye (water thin, the pools' oil and syrup thick); the gap's drag 12μ/b²
on the flow, per cell; the projection weighted by the mobility b²/12μ on each face
(a variable-coefficient Poisson solve, the same Jacobi); and a capillary pressure
jump γκ at the edge. Then a lift (§10 step 4) fingers because water or air is
drawn in, a press does not because it is the stable direction, Polarity and Blob
Surface Tension mean a viscosity contrast and a γ, and `squish.ts`'s drawn spokes
(a shortcut of the same kind) can go. Checks: a radial lift's finger count against
the fastest wave for its b, γ and U; a press stays round; a still plate grows
nothing (`npm run grating` §5 asks that already).

*Found 2026-09-27, not yet done:* **#174's grating may have been this one.** Its
report was "Red Cabbage at 2.8x", read as the closeup's zoom, and its pixels
converted to cells at 8.75 px a cell on that reading. 2.8x is the tool's Amount
(the dock's `2.8×`); a report saved with the camera at 1x reads `shot.zoom 1`,
and at 1x a cell is about 4.7 px of a Retina screenshot, so its 10–15 px stripes
were 2–3 cells, not √2. Red Cabbage has Polarity, so the push ran there too. The
`dampGrid` pass stays (it removes a pattern nothing else does), but its cost on
the Mac (judging §10) is worth weighing against what it was for.

*Found 2026-09-27, not yet done:* **the owner likes the dots.** A "Roy" look with
its own control is being built in its own thread from the old push's mechanism
(anti-diffusion on the dye, a wavelength set by the gradient's reach, bounded by
the advection's hold and the 6.0 cap).

**This was first because it was red.** `npm run tools` fails on `main` about two
runs in three, and the deploy is gated on it, so every merge queues behind a coin
toss. Four deploys failed in a row on 2026-09-26 before one got through.

The claim it breaks is the Finger's: *carries dye along the stroke, adds none*. It
adds a great deal.

| commit | dye on the plate | the Finger added |
|---|---|---|
| #142 | 635 | **+301** |
| #142 | 656 | **+246** |
| `main` | 592 | **+307** |
| `main` | 655 | **+394** |
| #143 | 180 | +36 |

Forty to sixty per cent of whatever is already there, against a tolerance of
`0.15 * fa.total`. It is not a regression and it is not the gate being flaky — both
were checked, and both were wrong answers on the way here. The behaviour is the same
at #142, #143 and `main`; what varies is how much dye the plate happens to be holding
when the harness runs, because the tolerance scales with the pool and the amount added
scales with it too. It passes only on a thin plate. #143's two green runs started at
180 rather than 650.

The cause is already written down in `tools.mjs`, for the Press rather than the
Finger: *"the solver carries the dye's concentration through that spreading flow
without thinning it, so a press can add up to about as much again as it had"*. The
same note says it is tracked on its own, and this is that item. A flow that spreads
has to thin what it carries; ours multiplies it.

Two things to settle, in this order:

- **A conserving advection where the flow diverges.** This is the fix and it touches
  the beat squeeze, bubbles and currents as well, so it wants `npm run tools`,
  `npm run liquids` and `npm run plates` green together before and after, and a
  before/after on `npm run detail` — thinning dye correctly will change how sharp the
  plate reads, and that is the number this whole plan is judged on.
- **What the check should mean.** "Adds none" is a claim about the tool; what fails is
  the advection under it. Once the advection conserves, the check is honest as written.
  Loosening it first would silence the one instrument that found this, so it stays as
  it is until the physics is right.

### 1. Sharp liquid, and pigment in it

**Shipped**: sharpening retired, granulation stands. How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 2. Lacing

**Shipped**; its 4–8 px gate moved to batch 3. How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 3. Drops, not rings

**Shipped** (#163): drops and bubbles as air pockets, shaded as a projector throws them. Open: whether the camera pass brings a highlight back is the owner's call. How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 4. Liquids that behave differently

**Shipped**, with milk's opacity still owed (below). How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

**Still owed: milk's opacity.** What ships is behaviour, not optics. Colour still
transmits through milk rather than sitting on it, because the dye texture's RGBA is
already fully spent — three log-absorptions and a density — and there is no channel
left for an opaque ground. That is the part of the reference's solid reds this does
not yet reach, and it needs a render change rather than a solver one.

### 4a. What is in each preset's dish

**Shipped**: what each preset puts in its dish. How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 5. Playing it: sound learn, shutter, and a look link

`src/lib/soundLearn.ts` (new), `src/hooks/useAudioAnalyzer.ts`, `src/components/MidiPanel.tsx`,
`src/lib/cameraPass.ts`, `src/App.tsx`

Independent of batches 1–4, so it can be built while the Mac is judging a look, and it
is the batch that changes how the show feels to play.

**Sound learn.** Today the music drives three fixed things: sound drive, beat squeeze
and macro sync. Anything else is a hand on a knob. The reference tool does better than
that with two kinds of row: a *mapping* (source → target × depth, where the source is a
frequency band, the overall level or a drum) and a *trigger* (a one-shot on an onset:
a flash, a zoom punch, the next preset).

The better version of that reuses a vocabulary the app already has rather than adding
a second one. The Learn button that binds a control to a MIDI knob grows a second
source: the music. Pick a slider, pick kick, bass, snare, hats, level or a band, set a
depth, and the plate follows it. Triggers map onsets onto the existing `MidiAction`
list, so a kick presses the big dish into a sunburst, a snare drops the lead dye, a bar
line steps the preset. One learn flow, one action list, one set of bindings saved in
the same file, whether the hand on the control is yours, a fader's or the drummer's.

Ours can be better than a plain FFT for a reason they cannot match: the beat clock
predicts the next beat and the song map knows bars and sections, so a trigger fires
*on* the beat rather than a few tens of milliseconds behind the microphone. A
band-energy mapping still follows the sound directly; it is the discrete hits that get
to arrive on time.

Needs per-band energies and per-band onsets added to `useAudioAnalyzer` (it exposes
bass, mid, treble, energy and the raw `frequencyData` today, but no named bands and no
onsets).

**The bands shipped in #154, and sound learn in #155.**
`src/lib/audioFeatures.ts` is the one analyser the live show and an offline song both
use: level, kick, bass, snare, hats, eight bands and an onset per source (`npm run
bands`, 71/71). On it, #155 puts a music button beside every Learn button: a slider
follows a source at a depth through the patch bay (`sceneMap.ts`), and an action fires
on a source's onset, on the predicted beat once the clock is locked (64 ms ahead of the
heard kick on the test song; `npm run learn`, 30/30). A beat cannot press a toggle.
What it leaves open: "press the big dish" and "drop the lead dye" have no matching
`MidiAction` yet; the bar is every fourth beat from lock, with no real downbeat; and
learned mappings do not reach a Cast or network display (triggers do). The downbeat is also what batch 10's accent
selection (step 3) needs.

*Found 2026-09-28, not done:* the downbeat exists now (the bar grid's one, #184, Accent
the One), but sound learn still fires `bar` on every fourth beat it has counted since
the clock locked (`beatIndex % 4`, `soundLearn.ts`), so "Each bar" lands on whichever
beat the lock began on. Take the bar grid's one when the grid is sure of it (its own
0.15), and the count only when it is not. *Measure:* `npm run learn` with a song whose
lock begins on beat 3: the bar fires on the one.

**Shutter** (`shutter`, camera pass). Their trail buffer is a generic VJ smear laid
over everything. Here it belongs in the camera, where it is physically motivated: the
photographs that the Photograph style is built from are long exposures, and their light
trails and motion blur are part of why they read as film rather than as a screen. An
exposure-time control accumulates frames into the camera's existing scene buffer with a
decay, which puts it downstream of aperture and bloom so the three couple the way a
real lens does. Off in the light-show style, on by default in the Photograph presets.

**Look link.** The whole settings state in a URL. Preset files already do this properly
for a look you want to keep; a link is for the other case, showing someone a look right
now, between the laptop, the phone and anyone you want to send it to. Opening one sets
the look only: the projector window, the remote and the show server are untouched.

**An ear per input channel** (*proposed 2026-09-28*). The show hears one input and
splits it into kick, snare and bass by what the spectrum suggests (`audioFeatures.ts`).
A band's desk can send more than that: the kick mic, the bass DI, the vocal bus and a
room mic, on separate channels of one interface. Open the input with its
`channelCount` and a `ChannelSplitter`, and make each channel a named source beside
the analyser's: the kick's onset from the kick mic, the vocal bus for the lyrics and
for presence, the room mic's roar as a sound-learn source. Browsers differ above two
channels, so it is surest in the Mac app (§13 step 1). The phone's Sound sheet gets a
meter and an on/off per channel. *Measure:* `npm run bands` on a four-channel file with
a kick on channel 1 only: the kick onset follows channel 1, not the mix.

### 6. Render a song

**Shipped** (#153 seed, #154 offline bands, #156 render), with two items open (below). How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

**Not yet measured:** a 3-minute 1080p render end to end, and a full sequence with its
cue sheet played out over a song. Both need the Mac.

*Proposed 2026-09-28:* **record the whole set, render it afterwards.** A take today is
the gestures painted with the laptop's primary pointer, at about 15 Hz
(`performanceTake.ts`; "Feed the performance recorder" in `LiquidVisualizer.tsx`): no
settings, no Go or Back, no Mixer takes, blackout or tempo, and no phone, OSC or
gamepad hands. Log all of it with the seed, write the audio to disk as it plays, and
afterwards render the set through the existing Render path at 1080p or 4K. As batch
6's caution about live takes says (`docs/plan-shipped.md`), it would be the same
decisions, not the same pixels. The phone's
hands already go through `performGesture`, so they are logged with the rest, and its
Record toggle arms "log the set". *Measure:* `npm run render` of a logged two-minute
set holds the live log's Go times and look names.

### 7. The room in the plate: the camera as a sensor

**Shipped**. How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 8. The desk: the laptop is a control surface, not the show

**Shipped**, with one proposal open (below). How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

*Proposed 2026-09-28:* **pictures, not swatches, in the cue list.** In the dark a look is
picked by its name and one colour swatch (`lookSwatch`, `PhoneStage.tsx`, and the desk's
pick lists). `gallery.yml` already photographs every preset; ship those photographs as
thumbnails, and have Save Look keep a still of the plate in the preset file, sent to a
receiver once rather than in every cast state (the lesson of S0's logo, in
`docs/stability-plan.md`). The phone's Looks sheet, where rows are smallest, gains most.
*Measure:* `npm run desk` and `npm run phone` find a picture on every built-in look's
row; the cast state's size is unchanged.

### 9. Ferrofluid after the references

`src/gpu/wgsl/plate.ts`, `src/presets.ts`, `src/presetPlate.ts`, `scripts/ferrolook.mjs`

The reference is Chemical Bouillon's ferrofluid films (frames in
`/mnt/project-files/ferrofluid-look/references/`): razor-sharp edges at any zoom, a fine
scale (fingers or cells about 1/60 of the frame, hundreds of them), thin black walls of
ferrofluid between packed cells of coloured dye, and wet gloss. Ferrofluid is the one
liquid here that *should* shine: a projected look has no speculars, because the light
comes through the liquid, but these films are lit from the front.

**9a. The edge, and two looks, shipped in #161.** The ferrofluid ends on a sharp,
antialiased line at any zoom (edge width at 1x 17.9 → 1.5 px; at 3x 4.46 → 0.40
cells), with an amber sliver inside, a bright meniscus outside and a glint that stays
with the key light. A pool is black all through. Two looks: **Ferro Maze** and
**Ferro Paint**. `npm run ferrolook`, 10/10.

What watching the lab clips of Ferro Maze, Ferro Paint and Magnet Garden found
(`/mnt/project-files/ferrofluid-look/watch/`), in the order to fix them:

- **9b. Maze detail**, shipped in #167. The maze's finger width is fixed by `MAZE_PERIOD` (0.045 of the
  plate) and comes out two to three times wider than the reference, and it coarsens
  over time. Maze Detail (0 to 1) divides the period by up to three; 0 is the maze as it
  was, bit for bit, and Ferro Maze uses 0.5. `npm run maze`: finger width 0.0296 at 0.5
  against 0.0431 at 0 (ratio 0.69). Whether it now matches the reference is for the
  Mac.
- **9c. The dye rides the ferrofluid** (**shipped**, #168). In Ferro Paint the dye is not carried by the
  ferrofluid, so the patchwork does not deform with the fingers the way the reference's
  does.
- **9d. Smaller faults.** A sub-half phase shows as brown ghost smears; Ferro Maze's
  white table clips (32 % of the frame blown); no visible pulse on the kick.
- **9e. The magnet stands it up** (**shipped**, #183). Reported: "doesn't make spikes or fingers.
  It's just a big blob that gets pulled around by the magnet." The magnet's pull held a
  gathered pool round, and a full pool is stable in the maze's physics, so nothing
  broke it. Now a magnet brought up close (the Magnet tool; no look's own magnet is
  near enough) stands the pool up into Rosensweig spikes: the solver draws the liquid
  into a ring-packed field of domes round the magnet (`src/gpu/wgsl/spikes.ts`, wells
  in `phaseMu`), under a maze field the dipoles' repulsion rises across its reach, so
  the pool's outline breaks up rather than rounding, and the plate draws each dome as a peak with a star
  of light and a white point on it. On the phone every finger holding the Magnet is a
  magnet (up to four). `npm run spikes` measures it; numbers in the PR.

Open, from building 9e (in the order to do them):

- **9f. Colour between the domes** (**shipped**, this PR, `npm run domes`). Where the
  pool parted, the gaps showed a thin amber film, not the bright dye the references
  have between their domes. Two causes, measured on Magnet Garden at 384². The maze's
  flow destroyed the dye under the backtrace advect (6% of the plate's dye gone, the
  gaps left with 3% of theirs): now the dye crosses faces wherever the maze flows
  (bodyAdvect, conserved), a numerical loss removed, and the gaps draw in the dye's
  own colour. And the domes stand shoulder to shoulder (16% of the plate near the
  magnet under half full): that is 9t, the physics the model lacks. A pull eased
  while the hand is still opened the gaps to 41%, but it was a look-driven tuning
  and was dropped under the physics rule. The phone's finger magnets get the same.
  Judging notes: docs/judging.md §22.
- **9t. Domes that stand up out of the layer** (found building 9f). The ferrofluid is
  a plan-view layer capped at full (phaseRelax, and the double well's minimum at 1),
  so a pool the magnet pulls together can only spread sideways, and the domes pack.
  A real Rosensweig peak rises many layer depths out of the pool and draws the
  liquid from the valleys into it, which is why the references show dry, coloured
  gaps. The fix is physical: let the column under a spike hold more than full, as
  high as the magnetic pressure against surface tension and gravity holds it, with
  the double well and the relax pass following that height; then SPIKE_PULL's 0.5,
  itself a tuning standing in for this, can go back toward the plain Kelvin force.
  A first try (the relax cap raised under the spikes alone) stood the domes at only
  1.4, because the double well still pins the layer at 1
  (/mnt/project-files/handoff/ferrofluid-9f/taller-domes-tried.patch). `npm run
  domes` should then ask for a third of the plate near the magnet open again.
- **9g. Domes at the lab's grid.** On 256² a spike's pitch is ten cells and a dome is
  four or five across, so much of each is edge and grey. The app runs 384² and up
  where they are sharper; the Mac should judge whether 256 (the software rung and
  some phones) needs a coarser pitch.
- **9h. Thick walls in Ferro Paint and the maze.** The references' ferrofluid walls
  between dye cells are thin and even; ours still thicken where the maze coarsens.
- **9i. Fingers past the spikes** (**shipped**, #200). A pool bigger than the
  spikes' reach stayed a round blob past them under the Magnet: on Magnet Garden
  the push it gave went in through the separation's own diffusion and thinned the
  edge to a grey the plate does not draw. Now, on a look with a Labyrinth, the
  hand's magnet's field is at least as strong as its spikes and reaches further
  (screening 0.04 of the look's), the dipoles' push moves the liquid only by flow
  (`phaseMu` writes the flow's potential and the separation's apart), and the
  well steepens where the push is on so a finger stays liquid. A pool poured 0.17
  of the plate in radius, the Magnet held six seconds at 384², counted as black
  fingers crossing circles in the plate's picture: on Magnet Garden 12, 9 and 9
  on the circles 0.06, 0.09 and 0.12 past the poured edge, in 7 of 12 sectors; on
  main 6, 3 and 1, grey stubs. The phone's fingers holding the Magnet get the
  same, from the same solver. Looks with no Labyrinth (Classic) are as they were:
  giving the hand its push there too, with its pull eased so the edge could get
  out, stopped a close magnet gathering scattered drops (`npm run ferro` on the
  Mac), and with the pull whole the fingers came out grey (9o). `npm run
  fingers`; Mac look in `docs/judging.md` §16.

- **9j. Spikes that follow the music.** A real ferrofluid speaker's spikes jump on the
  kick. The spikes now answer the magnet's field, so the maze's audio breathing
  could drive their height too.

Open, from building 9i:

- **9k. More fingers, and a labyrinth in the middle.** The reference ("Magnetic
  pattern I") has sixty or more fingers round a pool and its middle turns to
  stripes; ours has about sixteen, and the middle stays a field of domes (9e's
  spikes win there). A finger's neck also thins to about half full on its way
  out, so a finger reads as a round tip on a grey stem in the field: the plate
  draws the half-full line and shows it whole in the lab, but a Mac look should
  say whether it breaks up at 60 fps.
- **9l. The magnet still has to pull under a Labyrinth.** Under a maze field the
  pull under the hand was already halved with the spikes (SPIKE_PULL); the longer
  push now works against it too. `npm run magnet` (Mac only) holds that a pool
  still follows the magnet when it is dragged, on Classic; nothing holds it on
  Magnet Garden.
- **9m. The spikes' outline margin is thin.** `npm run spikes` asks for an outline
  2.78 times a disc's; it reads 2.85 now, 2.62 with the finger push reaching all
  the way in. Anything that softens the spikes' repulsion will turn it red.
- **9o. Fingers on Classic.** With no Labyrinth the Magnet only gathers: no
  fingers past the spikes. A push of the hand's own there (tried in 9i) either
  stopped the magnet gathering scattered drops, with the pull eased, or drew
  grey fingers (7, 1, 0 and 0 on `npm run fingers`' circles), with it whole:
  Classic's Phase Edge, 0.35, separates too slowly to keep up with the flow
  pulling them out. Wants a push that switches on only once the liquid has
  gathered under the hand, and a floor on the separation's speed there.
- **9p. What `npm run fingers` does not measure.** The magnet between no spikes
  and full (a low Tool Amount, or a Ferrofluid Scale that holds it higher),
  where the push ramps in; and a maze look's labyrinth far from the hand while
  the hand is held: the hand's share (spikesClose) is one number for the plate,
  so the push leaves the far labyrinth's separation too, and it rests on the
  maze's flow alone there.
- **9n. Blow and Finger on the ferrofluid** (**shipped**, #206). Asked by the owner
  (2026-09-27): shouldn't blowing and Finger also move the ferrofluid round? They
  barely did: both only added velocity, which lasts one step before the speed
  clamp cuts it back (a stroke across a pool moved it 0.2 of a cell), so the dye
  has long been carried by hand and the ferrofluid never was. Now the Finger
  carries it along the stroke as it carries the dye, Blow held still blows a hole
  in a pool and moved pushes it along (`carryPhase`, conserving). A moving Blow
  keeps the way the hand last went for 150 ms, so a frame's later steps and a
  frame the pointer did not report a move in push rather than puff. Only a hand's
  Blow and Finger: the pour event's burst, a bubble's pop and the automation's
  breath and evolve stroke, which also blow or drag, leave it be. Every hand goes
  through the same methods, so a phone's fingers on Finger and Blow do it too
  (the pointer's path, the mouse's numbers), as does the remote
  (`performGesture`); a phone finger on the Magnet is still a magnet. `npm run
  ferrohands`.
- **9q. A Mac check of the hands on the ferrofluid.** `npm run ferrohands` measures
  the carry with the app's own numbers (lib/handCarry.ts) but not the app's calls:
  which method each hand reaches, the Finger's carry waiting on each reading of the
  dye, how often a hand acts, and a moving Blow's held direction. A check through
  the real pointer on Magnet Garden, reading the phase before and after, belongs in
  `npm run tools` on the Mac.
- **9r. The Finger's carry searches when it need not.** `phaseCarry` gathers each
  cell's share from every cell within the hop, which only a puff (straight out)
  needs; along a stroke exactly one cell can land on each, and could be read
  directly as `mixCarry` does. The remote's widest directed Blow at 512² is about
  4000 reads a cell over 28 000 cells. Worth doing if a Mac frame-time reading
  under a held Blow shows it.

- **9s. Picking the Magnet made a black hole in the middle** (**shipped**). Reported
  by the owner (2026-10-03): "Magnet makes an immediate big black hole in the middle
  when I select it." Picking the Magnet on a look without a magnet gave the look one
  (Magnet Strength 0.8, since #155), and a look's magnet sits under the plate at
  Magnet Across and Up, the middle, from the moment it has strength. So before the
  hand touched anything, a magnet nobody put there pulled the freshly poured ring of
  ferrofluid into one pool in the middle: in the lab (Classic's pour, 256²) the disc
  0.12 round the middle went from 9% of its area black to 54% in a second and all of
  it in four, holding a fifth of all the ferrofluid, against 9% black with no magnet. Picking a magnet up is
  taking it in the hand, so now picking it only pours the ferrofluid, and the look
  gets its magnet from the first hand that holds one (`onMagnetInHand`), set down
  where that hand lets go, as #159 left it (every hold gives a look with Magnet
  Strength 0 the 0.8 again). `npm run magnet` asks that the solver is stepped with
  no magnet until the hand holds it, that the disc's mean ferrofluid stays under 0.3
  nine seconds on (in the lab 0.10 as poured and after, 0.54 a second into the old
  magnet and 0.97 by four), measured again if the ferrofluid was laid afresh in the
  window, and that the magnet let go of has strength. Left: a hold while the show is stopped
  or draining gives no magnet, because the hand is read in the solver's step; a
  hold after Start does.
- **9u. A set-down magnet still gathers a pool with no domes.** What the hand leaves
  behind (strength 0.8 at the look's height, 0.225 at Classic's Scale) is a field
  share of 0.15 on its axis, under the spikes' onset (0.18, `spikes.ts`), so it pulls
  the ferrofluid into one flat black pool where the hand let go. A real magnet strong
  enough to pull a pool across the dish raises Rosensweig domes on it, and the pool
  is never one flat disc. That is the pull against the lift: a thin-film lab of the
  Rosensweig instability (2026-10-03, not yet in the repo) found the plate conserves
  the ferrofluid's area where a real layer conserves its volume, so domes standing up
  cannot open gaps, and its magnet case piled the pool 0.84 of a capillary length
  deep before domes came, with the balance of pull and lift left open. It belongs to
  the standing-domes plate PR that lab is for, not to a retune of the set-down
  strength here.
- **9x. Picking the Magnet poured the hole itself; a magnet you size and play**
  (**shipped**). Reported by the owner (2026-10-03), on the build with 9s live:
  "Magnet still makes a giant black hole as soon as you pick it. That's not what I
  want. I just want a magnet that I can control the size of that I can interact
  with." The page is network-first in the service worker, so it was not a stale
  build: the pour was the hole. Picking the Magnet poured the look's ring
  (`phasePour`), 22% of the plate in black drops round the middle at Classic's Scale
  and 27% at Scale 0.8, where the drops run together across it (lab, 256²; the
  disc 0.12 round the middle 9% black, then 29%). Now picking it changes nothing on
  the plate. The first touch on a plate with no ferrofluid brings one pool under the
  hand (`magnetFor`), 0.09 of the plate in radius at the tool's own size, about 1%
  of the plate; the app turns Ferrofluid up so it is drawn and gives the look its
  magnet (`onMagnetInHand`), and the pool goes with the hand (lab: laid at 0.30 and
  dragged to 0.60, its centre ended at 0.58). **Magnet Size** (`magnetSize`, 0–1,
  0.5 the tool as it was; `lib/magnetSize.ts`) sets how big the hand's magnet is,
  held and set down: k = 0.5 to 2 times the size, the dipole k times deeper with k³
  the strength, which is a real magnet scaled (magnetostatics has no length of its
  own): the same field share over it, reaching k times as far (the pull is weaker
  than a scaled magnet's at a big Size, see 9v), so the spikes' patch and
  the pool it brings are k times as wide (lab: 0.3%, 1.1% and 4.6% of the plate at k
  0.5, 1 and 2). It is the performer's, kept across looks (`RIG_KEYS`) and never
  drifted, on the Settings sheet, the desks' Magnet options (right-click the Magnet)
  and the phone's Magnet panel (tap the Magnet twice), and MIDI-learnable. The
  governor's new solver gets the pool back where the magnet is, not the look's ring,
  and nothing at all while the Magnet is picked and untouched.
  The tools' options (right-click a tool) opened beneath the plate on the Design desk,
  only their bottom edge showing under the canvas; they go to the page's body now.
  `npm run magnet` asks that picking pours nothing and puts no magnet under the
  plate, nine seconds on too; that the first touch brings one pool under the hand
  and draws it; that a drag carries it at least half way to where the hand ends;
  that Size reaches the solver's step as height ×k and strength ×k³; and, on its own
  page with the governor held at 512² (`rung=2`) and stepped down on purpose
  (`stepDownFrames`) twice, that a new grid
  lays nothing on an untouched plate and only the hand's pool, once, at the magnet
  moved from where the pool was poured (another PR's run caught main's ring laid again by the governor, lays 1 → 2,
  grid 384² → 256²). `npm run
  phone` asks that Size is under the Magnet's Amount and moves the setting. The
  pool still reads as a black disc with domes round its rim, because the plate
  cannot open gaps between domes yet: that is 9t's standing-domes plate PR.
  Open: on one Mac run (PR #230, after main came in) the pool's centre was 0.11 off
  the hand 1.5 s after the touch, before the drag, and the drag then left it behind
  (46% of the way). The lab replaying that run's own step, magnet path and pool kept
  it on the hand and carried it 87–90%, bare plate or dyed, so the cause is in the
  app and not the step. `npm run magnet` now prints the pool as laid, the solver's
  magnet through the first second and a half, the plate's turn, the step count and
  the automation's hands, so a recurrence names it. Main's deploys went red on
  both magnet checks after 9s: `npm run magnet`'s "poured round the middle does not
  gather into it" (the ring pour this item takes away) and `scripts/ferro.mjs`'s
  "not at its mirror", whose two arms ran on two grids when the governor moved the
  solver (384² then 256²); ferro.mjs now pins its grid (`sim=384`).
- **9y. The Magnet brings no ferrofluid** (**shipped**). Asked by the owner
  (2026-10-04), on the build with 9x live: "Why does the magnet add ferrofluid? It
  should only work on ferrofluid that is already there." 9x's first touch on a bare
  plate laid a pool under the hand (`magnetFor`) and the app turned Ferrofluid up to
  draw it; a new solver was given that pool again at the magnet. All three are gone,
  on every path (desk, phone fingers, MIDI and the remote all hold the magnet through
  `magnetFor`): a magnet is a field, and over a dish with none in it a real one moves
  nothing. The hold still gives the look its magnet (Magnet Strength 0.8, so it is
  set down where the hand lets go), and turns Ferrofluid up only when the solver has
  ferrofluid to draw (`phaseIsLive`: poured, then hidden by the amount at 0 or a look
  with none), since turned up over a bare plate the frame loop's "turned up on a bare
  plate" pour would lay the look's ring. Magnet Size is the magnet's own size and
  reach. Every look that shows ferrofluid (Magnet Garden, Ferro Maze, Ferro Paint)
  pours its own when it is laid; none relied on the Magnet's pool. `npm run magnet`
  now asks that a hold on a bare plate lays nothing (none in the solver, no look's
  pour, Ferrofluid still down) while giving the look its magnet; that a pool poured
  as the bottle pours it is drawn by the hold, not added to, and carried by the
  drag; and that a new grid lays nothing on a bare plate, picked and untouched or
  held. Found along the way: ferrofluid poured by hand is not what a new solver gets
  back; it gets the look's ring while Ferrofluid is up (9w, since shipped).
- **9v. The magnet as a disc, not a deepened dipole.** Magnet Size scales the
  solver's dipole (9x). A real disc magnet held at a fixed gap is flatter over
  its face than a dipole, and a bigger one at the same gap is somewhat stronger at
  the glass, not equal; the dipole's saturation (`MAGNET_BSAT`) stands in for the
  flat face today. Replace `magnetEnergy` (and `spikeAmp`, which must agree) with a
  finite disc's field (a disc of radius a at depth g: the on-axis field
  Br/2 · (1 − g/√(g² + a²)) and its off-axis form), with Size setting a.
  And put the saturation in field units: `MAGNET_BSAT` is a number in the
  dipole's geometric units, so the k-deeper dipole sits lower on the curve than
  the magnet it stands for and pulls less than the 1/k a scaled magnet does
  (lib/magnetSize.ts: at Size 0.9, 0.47 of it one height out and 0.33 at one and
  a half; at Size 0, 1.2 to 2.2 times it). A big magnet holds its pool more
  weakly at the edge of its reach than a real one.
- **9w. Carry the ferrofluid across a new solver** (**shipped**). The dye was
  carried when the governor moved the grid; the phase was not, so the frame loop
  poured the look's ring onto every new solver while Ferrofluid was up: a pool
  dragged into a shape lost it, and ferrofluid poured by hand from the bottle (on
  Classic, say) came back as the look's ring, ferrofluid nobody poured. With the
  Magnet moving only what is on the plate (9y), a pool lost that way left it
  nothing to hold. The oil, soap and acidity of the mix (Oil Bodies' bodies
  among them) and the BZ and Liesegang reactions were lost the same way, with
  nothing poured back. Now the old solver copies those fields on the GPU before
  it goes (`handOver` in `gpu/fluid.ts`), and the new one lays them onto its
  grid (`takeOver`): the ferrofluid and the mix by an area-weighted mean
  (`carryArea`, counted in integers so every overlap is exact), which keeps the
  amount to the rounding, and the reactions copied as they were. The frame loop
  lays the look's ferrofluid only on a solver that opened on no carry (the first,
  or one after a lost device). `npm run regrid` (lab, 6/6 in a cloud session at
  384² and 256²): 5.288% of the plate in → 5.288% on the new grid, 0.0 ppm off,
  each cell (ferrofluid and mix) within 1.5e-7 of the area mean worked out in JavaScript, the black
  shared 97.4% (98.2% back up), the middle moved 0.00 cell; the same move with
  nothing handed over leaves 0.000% (main's behaviour); oil 3.020% → 3.020%, soap
  0.690% → 0.690%, acid 0.396% → 0.396%, Oil Bodies' tally the same; BZ and the
  gel identical value for value; a carry from another device refused. On the
  Mac, `npm run magnet` check 8 asks it of the app: the Ferrofluid bottle on
  Classic, two pools poured, the governor stepped down from 512²: no lay, the
  same amount, the pools where they were. Not carried: Oil Bodies' share of the
  dye (it starts empty and is handed back the colour inside each body within a
  few steps), the glass's press (a press held through a move starts again from
  the rest gap) and the particles (H1, which re-seed from the dye). Not checked
  anywhere yet: that the app keeps the carry until the new solver's first
  readback, so an out-of-memory retry after a climb gets it, and that after a
  lost device the app's next solver refuses the old carry and lays the look's
  ferrofluid as before (the lab checks only a second device's refusal).
- **9z. The dye at its own grid across a new solver.** Found while doing 9w: the
  dye and the flow cross a move of the grid through the CPU's 192² arrays
  (`FluidSimulation.attachGpu`, `pullStateFromGpu`), so a plate on 384² to 1024²
  is carried at 192² and upsampled back: anything finer than about two cells of
  the old grid is smoothed away at every move, and the copy is a frame old.
  Carry the dye and the velocity on the GPU as 9w carries the phase (an area
  mean for the dye, which is an amount; the velocity resampled and projected),
  keeping the CPU path only for a lost device. Measure it first: the dye's fine
  structure (the `grating` or `microscope` measures) before and after one move.

### 10. Playing like a show

`src/lib/phrasing.ts`, `src/lib/beatClock.ts`, `src/lib/audioFeatures.ts`,
`scripts/watch.mjs`, `scripts/film.mjs`

From the footage study of 2026-09-26: the plan page is
<https://claude.ai/artifact/UB2VSoFbA3S84yEoFPuPQX>, the notes are
`/mnt/project-files/research/light-show/footage.md` (every clip, its link and its
numbers) and `craft-and-field.md` (performers, VJ practice, the digital field).

The yardstick, measured on the footage at four samples a second:

| Quality | Real shows |
|---|---|
| Swells of motion | 1.5–3.5 a minute, peaking about 2.5x the median, rising and falling over 2–9 s |
| Composition change | every 7–10 s, without a cut |
| Scene change | every 15–30 s |
| Share of time calm | 20–40 % |
| Near-black | 30–60 % on average, ranging from 3 % to 90 % over a set |
| Hues in a frame | 2–3, one family leading, the family changing by scene |
| Motion against loudness | r ≈ 0 at the beat; about 0.4 over 20 s windows |
| Edges | two regimes: soft washes under 1 %, sharp drop and cell fields about 15 % |
| Hard cuts | none |

The last-but-one row matters for this plan's own gate: the detail table at the top was
built on macro films, which are all drop and cell field. A real show's big shapes are
soft, so `npm run detail` should judge the two regimes separately rather than ask every
region to be sharp.

The steps, most visible first. Each is one PR with its own check, and every step after
0 reports its change in the film table's units.

0. **Film every look and measure it**, shipped in #162. `npm run film` records each
   look three times for two minutes with the band in a box and writes the table above
   with our looks under the real shows' rows; `film.yml` runs it by hand across six Mac
   runners. **The first full baseline has not been run yet**: that is one by-hand run of
   `film.yml`, and every step below is measured against it.
1. **Rest, big events and darkness.** `phrasing.ts` already has the shape and measured
   why it changes nothing: small gusts on a plate that is never still are invisible. Let
   it fire the whole-frame events the app already has (a flood pour, a partial drain, a
   dye swap, a press), let the plate settle and the dimmer fall between them, and let a
   scene end in near-black. A Pacing setting whose zero keeps today's look.
   *Target:* swells 1.5–3.5 a minute, calm 20–40 %, near-black ranging across at least
   10–70 % over a set, cuts still zero. *Check:* a node harness on the phrase generator
   from a seeded run, and the film table.
   *Shipped* (#170) on the stage sequencer rather than the phrase generator, because a
   stage is already a scene: `src/lib/scenePacing.ts` plans each stage of a running
   sequence (a pour, press or dye change opening each swell, rests where the plate's clock
   drops as low as a fifth, and from Pacing ½ a slow fade to near-black at the stage's
   end, the next coming up out of it), and the plate follows it on its clock, its
   automation and its light. A **Pacing** setting (0 keeps today's show; sheet, MIDI,
   desks, phone; a stage may set it and it is put back when the sequence stops), an
   ending choice per stage, and a built-in **Light Show Night** of 22–30 s scenes.
   `npm run pacing` measures what the sequence asks for with the footage's `shape()`,
   counting a fade as the change in every pixel it is: 2.35 swells a minute, calm 25–28 %,
   swells 2.4× the median, the light under a quarter 19 % of the set, every drain in the
   dark. Whether the plate delivers it is the film's to say: film Light Show Night.
2. **Hear the song's shape live.** Presence (rising or falling action) and a slowly
   accumulating intensity from #154's bands, and from them live build, drop and
   breakdown events that choose which swell step 1 fires and how big. *Target:* a drop
   reported within one bar, none in a steady section, and motion against loudness near
   0 at the beat and positive over 20 s. *Check:* synthesised songs with known builds.
   *Heard* (the first half, this PR): `src/lib/songShape.ts` listens to the bands in
   decibels (new on each reading, `AudioReading.db`, because the 0..1 values are fitted
   to the last twelve seconds and a long breakdown reads as loud as the drop by its
   end) and reports builds, drops and breakdowns live, with a section, a slow
   intensity and a rising-or-falling action. The desk's status line and the phone's
   Sound sheet show it, and sound learn can bind a trigger to each drop, build or
   breakdown. `npm run shape` (in Measure) plays it songs from
   `scripts/arrangement.mjs` whose sections are known to the sample: every drop heard
   within one bar (median 0.03, latest 0.53), none anywhere else, builds before their
   drops, breakdowns within four bars, a bar of silence before a drop not costing it,
   nothing in two minutes of four on the floor or of a rock beat whose fills take the
   kick out for two beats, the same at 30 fps and 20 dB down, a real two-to-four-second
   gap between songs heard as quiet, and nothing at all on the shelf's ambient tracks.
   A build needs the beat to have come in first (the kick hitting four times in four
   seconds): before that rule the shelf's swells read as builds two or three times a
   minute.
   *Followed* (the second half): **Follow the Song** (`songFollow`, 0 to 1, default 0)
   plays a paced scene to what is heard. A drop opens a swell on its own tick with the
   stage's opening move, up to half again bigger, and takes out the planned swell it
   replaces; through a build and a breakdown the planned swells wait (up to 24 s), the
   plate winds up with the build and settles lower in a breakdown. At 0 the scene is
   bit for bit the scene with no song, and at Pacing 0 the plate is today's. It is on
   the desk's Pacing section, the remote, MIDI (Follow the Song), and the phone (the
   Sound sheet, beside the song's line; the Play sheet gained a Light show tile, since
   Pacing had no way onto the phone before). `npm run pacing` plays Light Show Night
   against five synthesised club songs through the real analyser and tracker: motion
   against loudness over 20 s windows 0.34 to 0.40 at Follow 1 (Follow 0 on the same
   songs −0.17 to −0.02; the one live show 0.40), and at the beat (a two-second
   running mean taken out of each) 0.05. Each drop is held to the rule: over four
   nights, and three awkward songs on one long scene (a breakdown the beat returns
   out of, one the song ends in, a 32 s build), 62 drops opened a swell of the
   stage's opening move at the promised gain, the plate reaching 0.90 of its top at
   worst within 2 s, and 18 were let go, 12 in a dark ending and 6 within 4 s of a
   swell. 26 planned swells came due in holds and none fired there; each arrived
   within half a second of its hold ending (5) or of the 24 s cap (4). With Pacing
   pulled to 0 mid-scene through a breakdown, build and drop, the scene that comes
   back is the one with no song, tick for tick. The app builds the cue with
   `songCueFrom` (scenePacing.ts), the function the check plays and tests.
   Found on the way:
   - A drop in a scene's dark ending is let go (12 of Light Show Night's 60 in the
     check, one in five): the light is going down and the next scene comes up with its own move.
     A show following a song might rather cut the dark short on a drop and come up
     with it; worth judging on the Mac with a real track.
   - Over 1 s windows the proxy's motion-against-loudness reads 0.26 to 0.29, the top
     of the footage's range at the beat, because the proxy has no beat-level motion of
     its own and a second's mean is mostly the section. The plate's own motion adds
     that noise; `film.yml` with a song playing is what measures it.
   - The swells run at 3.2 a minute following the song, against 2.4 without;
     inside the footage's 1.6 to 3.7, near its top.
   - The tracker hears the beat coming back after a breakdown as a drop (0.75 on the
     check's verse after a breakdown), so the scene throws its big move there too.
     Right for a club track; a band coming back from a quiet verse may want less.
   - A scene that comes up out of the dark while the song builds holds its opening
     move until the build ends: it comes up lit and still. Worth judging on the Mac.
   Found on the way, not yet fixed:
   - A build is recognised about halfway in, not at its start (a short one later: the
     club song's four-bar second build at 65 %): the hats leave before the riser has
     climbed far, so the top end falls before it rises, and the climb has to show in
     every third of six seconds so a fill's two-beat jump is not one. A build that
     starts by taking the beat away is heard as a breakdown for its first bars. Onset
     density (a snare roll doubling) would catch it earlier.
   - A song whose first build comes before its beat has ever played (intro straight
     into a build) is heard from its drop: builds wait for the beat.
   - The kick onset reads a fast snare roll's 200 Hz body as kicks: in the club song's
     build, 32nd-note snares fired `kick` three to five times a half-second. Sound learn
     on the kick fires through every build.
   - Nothing on the shelf has a beat: its four tracks are ambient, so the tracker is
     measured on synthesised songs only, and on the shelf only for not inventing drops
     or builds (none now). A CC-licensed dance track with known sections on the shelf
     would let the check hear real drops.
   - Quiet is thirty-five decibels under the song's loudest, a guess for a room: a
     noisy club between tracks may never fall that far, and then the next song's
     intro can still read as a breakdown of the last. Worth measuring on a recording
     from a gig.
3. **Choose the accents.** Beat squeeze and plate rock fire on every kick. Let the
   performer pick downbeats, every other bar or fills only, vary the depth a little as a
   hand does, and pull a hand-played press onto the predicted beat. Needs a real
   downbeat, which #155 does not have yet.
   *Shipped 2026-09-27* (#184, **Accent the One**, `beatAccent`, 0 to 1, default 0): a bar grid
   (`lib/barGrid.ts`) hears the beats from the readings' onsets and which is the one
   from the harmony moving, the backbeat and the kick, the evidence kept beat by beat
   across the song and only trusted past a mark a bar-less loop never reaches. Each
   kick's squeeze and rock are then weighed by its place: the one at 1.25, three at
   0.4, two, four and the "and" let go at full, the one after a fill at 1.5. Where the
   grid knows only the half bar (the backbeat, not yet which strong beat is the one),
   one and three keep their press and two and four lose it; where it knows nothing,
   every kick is 1. Settings → Show, MIDI, the desks, the remote, a sequence's
   stages, and the phone's Sound sheet with a line saying what the grid hears. The
   squeeze's weighting reaches the plate since Beat Squeeze does (step 4's found
   items); until then only the rock's showed.
   *Check:* `npm run downbeat` (90): on eight synthesised songs, a real beat within
   70 ms on every tick of every groove, at the song's tempo within 2 % on 1326 of 1326
   ticks; no kick but the one ever called the one (0 of 528, 519 of them placed); the
   one known for 78 % of the groove's ones (rock songs 75 to 100 %, four on the floor
   49 to 88 % on sixteen-bar sections, where the half bar carries the rest: two and
   four softened 98 %); every kick weighed exactly what its place says (the one 1.25
   on 159 kicks, three 0.4 on 155), the one after a fill 1.5 on 32 of 32 fills (12 club,
   20 rock); a pulse and three loops with no bar (118, 126, 132) never placed, on a beat
   they do hear; the same at 30 fps, 20 dB down and on the page's clock (every
   estimate the same); fuzzed onset streams never name a tempo outside 69 to 185 bpm
   and always return; an estimate's median 0.5 ms, 99th percentile 0.5 ms; the accent
   at 0 leaves every kick at exactly 1, 933 of which the accent at 1 moves. The sure
   mark is 2.2 (it was 2.6, set over a loop whose bass played a pickup into every one,
   a bar cue; without it the loops reach 1.65 at worst). Mended on the way: the
   tempo's refinement between bins was unbounded on a flank (393 bpm named in a song
   at 128; a fuzzed stream hung the render loop), and the bins moved with the clock's
   rounding. Not yet seen on the plate: the app's frames cannot be read in a cloud
   session.
   *Found while building it, not yet done:*
   - **The rest of the step is not built.** The one (and the one after a fill) is; the
     other accents the step asks for are not: *every other bar* (the grid knows the bar,
     not yet the pair of bars), *fills only* (the fill is heard, and could be the only
     press), *a hand's variation* (the depth varied a little from press to press), and
     *a hand-played press pulled onto the predicted beat*.
   - **Above about 148 bpm on four on the floor the grid hears half tempo** (75 to 87
     bpm) and is almost never sure of the one (0 of 172 estimates at 160, 31 of 184 at
     150). It fails safe, every kick 1, but no accent reaches DnB or fast techno; the
     check's songs stop at 140.
   - **Four on the floor's one is slow to come.** With the kick on every beat and a
     chord a bar, only the chord tells the one from three: on sixteen-bar sections
     the grid is sure of it 49 % of the time at 90 bpm, 82 to 88 % faster (a third of
     the time on the eight-bar sections the check had first). A crash on the one and
     the phrase's changes are evidence the grid does not use yet; the bass line's
     pickup it hears only as the harmony moving (a loop with one reached a t of 2.6
     on it alone).
   - **The sure mark rests on three synthesised loops.** 2.2 stands a third over their
     worst (1.65). A real bar-less track (a DJ tool, a techno loop with a drifting
     pad) may reach further; a recorded one on the shelf would say.
   - **Half tempo, now and then.** Club 140 names 70 bpm on 2 of its 181 settled
     ticks (the check holds 95 %); the weighting toward 120 is an octave and a bit
     wide, and 140 is near where its double and half weigh alike.
   - **A new song after a gap finds its one late**: bar 14 of its groove, against
     bar 7 heard alone. The old grid is held four seconds before it is let go, and
     the new one then gathers from nothing.
   - **No recorded song has been counted.** Nothing on the shelf has a beat; a
     CC-licensed rock track and a dance track with known bars would let the check
     hear real ones.
   - **Sound learn's "Each bar" still counts from the clock's lock**, the one a
     quarter of the time; it could fire on the grid's one instead.
   - **The beat clock fires on through a fill on its own prediction**, which hides the
     fill from the accent's "after a fill" in the app (the check hears the kicks
     themselves).
4. **Press smooth, lift into fingers** (roadmap G). A squeeze gives a smooth ring and a
   lift breaks into fingers; today both finger. *Check:* finger count round the ring,
   low on press and high on lift, in the lab.
   *Built 2026-09-27* (lib/squish.ts): a press is round by construction (the film thins
   evenly, the centre clears, the dye stands up in a round rim), and remembers itself;
   150 ms after it lets go the glass comes up for a second and a bit, and the spokes the
   press used to draw on the way down now come in from the rim, the gap opening along
   them and the liquid drawn back toward the centre, as deep as the press went (a tap a
   tenth of the way down lifts a third as hard a step as a held hand, and on the plate
   that is a faint ripple at the spokes, too faint to count fingers). Each press lifts
   on its own: two fingers on the phone, one let go while the other holds, and the one
   let go lifts where it was; the pad's held press keeps pressing while held still.
   Fingering 0 is today's plate
   exactly; a drop's splash keeps its fingers on the way down, drawn exactly as before.
   On the phone Fingering is on the Press tool's own Amount. *Check:* `npm run lift`:
   held, the film under the palm has no angular structure (contrast 0.000, the stroke
   drawn before 0.041, in spokes at its own angles); let go, at the default look's gap
   spring, the dye round the rim goes up and down 0.073 of its level in 15 fingers,
   sitting at the lift's spokes (correlation 0.92, 0.16 for the spokes turned a few
   degrees), and at the fastest look's 0.078 in 10; the gap's spring alone makes 0.0026
   of it at the spokes against the lift's 0.067; a one-frame tap lifts at 0.004. The
   lift brings the glass back to rest and never past it: the shader caps an opening
   there (uncapped, 0.081 against a rest of 0.030). 25 checks. Waiting on the owner's
   eyes on a real GPU (judging.md 15).
   *Found while building it, not yet done:*
   - **Beat Squeeze has never pressed the plate. Fixed (shipped with this item's fix
     PR, the owner's call on 2026-09-27: "Fix it tonight").** Its centre was
     `GRID_SIZE / 2` plus a random fraction of 30 cells, never rounded, so every cell
     index `squishDisc` reported was fractional, and a Float32Array drops a write at a
     fractional index without a word: the rhythm plate every Fillmore description
     promises was the plate rock alone. Every stroke now lands on a whole cell
     (`applySquish` and `squishDisc` both round). Rounding alone would have floored
     the lead plate: a kick pressed and nothing let it go but the gap's spring (the
     glass half way back in about 24 s at the default look, 50 on the Fillmore's):
     at 140 bpm with the bass at 0.7, 100 % of the pressed disc is on the floor after
     40 s on the Fillmore's glass (`npm run lift`; a one-off run at 120 bpm put the
     default look at 93 % and Soap Film at 76 %).
     So a kick is held for the lift's pause (0.15 s) and its gap given back over a
     third of a second (`KickRelease`, lib/squish.ts): 0 % on the floor, the mean back
     at rest, each kick still pressing the film under it to 0.0255 to 0.0258 a tenth
     of a second after it lands. *Check:* `npm run lift` (a kick lands on whole cells, all 319,800 of
     its writes kept, where with the rounding taken out none are; pressed and never let go at 140 bpm the disc floors,
     let go it stays at rest on no spring, the Fillmore's and the default look's
     glass, and at half the step rate); `npm run squeeze` in the app on the Mac shard
     (Fillmore East with the band, on a beat tapped in at 130 bpm: the kicks press
     the lead plate as deep as the look's squeeze, each is let go, the gap given back
     over the run is the depth pressed, and at Beat Squeeze 0 nothing is pressed;
     tapped since the #190 deploy, next item). Both count what the code
     hands the plate, on the CPU; neither reads the GPU (next item). Every look changes with music
     playing; waiting on the owner's eyes (judging.md 15).
   - **The show hears a quarter of the simulated band's kicks, or fewer, on the Mac.**
     **Shipped** (with 14d): two causes, both measured by `npm run kicks`, which plays
     the band's own score (`bandStep`) through the live ear. The clock's onset, the
     smoothed bass crossing 0.45, never crossed in the chorus, where the sawtooth
     bass holds the level over the line: 59 of 160 chorus kicks heard at 20 fps (110
     at 60). And a loop reading the onset's `hit` loses the kicks that land on
     readings it never sees, since the ear reads at 60 Hz and the loop is handed the
     latest reading: 46 of 160 at a 20 fps plate. The clock and the song's shape now
     read the kick's onset by its time (`at` moving), and the onset calls a kick that
     lands with a bass note (next item but one): 155–160 of 160 chorus kicks, every
     intro and verse kick bar one, at 60, 30 and 20 fps, 48 and 44.1 kHz, late frames
     or not. The
     band's scheduler was not a cause (0 of 62 kicks late on the cloud's busy page,
     `window.__band()` under `?debug`). Still owed: the count in the app on the Mac
     (next item). What was found:
     The band plays four on the floor at 122 bpm, two kicks a second, outside its
     break. `npm run squeeze` counted the kicks the show heard on the Mac shard: 6 in
     12 s and 9 in 12 s on #192's run, and on the #190 deploy (main, 2026-09-27) 3 in
     45 s at Beat Squeeze 0.9 and 6 in 42 s at 0, the plate stepping at the same rate
     both ways (898 and 805 steps). That run failed the deploy, since the check then
     asked for 5 heard kicks; it now taps its beat in, so it asks the press and not
     the ear. The ear is still open: whether the onset (bass over 0.45 from under
     it, `beatClock.ts`) misses kicks the bassline holds the level over, whether a
     main thread busy enough to step the plate 20 times a second leaves the band's
     25 ms scheduler late past its 0.12 s lookahead (a note scheduled in the past
     plays its envelope already over, so silent), or both. Every beat ride reads
     these kicks, so a band the show hears one kick in four of is a quarter of the
     show. *Check to write:* heard kicks against the kicks the band played, in the
     app on the Mac, logged by section.
   - **Count the heard kicks in the app on the Mac.** `npm run kicks` hears the band
     offline, through the ear's code; nothing yet counts it in the running app, where
     the plate's frames and the band's timer share a busy page. Both counts are there
     under `?debug`: `chromaglassDebug().heardKicks()` (onsets the loop saw) and `window.__band()`
     (kicks the band scheduled, and how many late). *Check to write:* a Mac check
     that plays the band for 30 s and asks for nine in ten of its kicks heard.
   - **A kick with its bass note read as low mids.** **Shipped** with the item above.
     The kick onset would not fire when a frame's new energy at 150–400 Hz came
     within 6 dB of the new energy under 120 Hz (`KICK_TILT_DB`, which keeps snare
     bodies off the kick). The band starts a bass note on every kick, and its
     harmonics put the kick's lead at 3.9–5.9 dB: the ear called 134 of the chorus's
     160 kicks at 48 kHz and 124 at 44.1 kHz (a Mac runs at either; the bins fall
     differently), and 4 of the intro's 31. At 3 dB it calls all of them at both
     rates, and the lone snare in `npm run bands` still fires no kick (it first does
     at 1 dB). `npm run kicks` now runs at both rates and holds the ear's own onsets
     to 95 % in every section. Not yet heard on real records: a kick under a bass
     guitar played on the beat is the same case, and a floor tom the other side of
     it, and `bands` has no tom.
   - **A check that reads a kick's press on the GPU.** `npm run squeeze` counts the
     cells and depth the kick hands the plate and the gap its release gives back, on
     the CPU: a regression in the upload (the plate not marked dirty, the flush
     skipped, `squeezeUpdate` ignoring a delta) would pass it. The Mac reads back the
     velocity (`rbVx`, `rbVy`); the outward flow round a kick's centre a frame or two
     after it lands, against the same seconds at Beat Squeeze 0, would say the press
     reached the solver. (The hand's press goes up the same path, and the Mac's tool
     checks read that.)
   - **A kick dirties the plate for about half a second.** With Fingering up a
     kick's press is remembered and lifts for over a second, and its release lays a
     third of a second; on the Fillmore with a band the lead plate is marked dirty,
     a full delta upload, on most steps. Nothing measures the frame cost yet; worth
     reading on the Mac's frame timings before a show.
   - **Whether a kick's press should show more.** Held and released, a kick at the
     Fillmore's squeeze thins the film under it by about a seventh (0.030 to 0.0255) for
     a tenth of a second; the ring it spreads is the flow the shader derives from
     that. If it reads too faint on the Mac, the press can go deeper now that it no
     longer adds up (the 0.0024 a disc was doubled when the press laid nothing, so
     it was never judged by its own look).
   - **The lab's glass is forty times springier than the app's.** BASE's `gapSpring`
     is 0.02 a step; the app derives it from dt and Plate Spring, 0.00048 at the
     default look (the glass half way back in about 24 s), 0.0080 at the fastest look
     (Lacing Run), 0.00005 at the slowest (Lumia). A lab check that presses or lifts
     measures a glass no look has unless it passes the look's spring (`npm run lift`
     does now); the others that touch the gap (`straw`, `physics`) should be read with
     that in mind, and a lib function shared by the app and the lab would keep them
     from drifting apart. The spring is not all of it: the app's dt (0.00107 at the
     default look, against the lab's 0.004) and its gap memory (0.99665 a step, where
     the lab's forgets dh/dt at once) differ too. With all three, the lab's held press
     drove the dye out of the whole ring before any lift (its mean 0.069 against the
     0.5 laid), so `lift` passes the spring only; whether the app's plate empties a
     press's ring like that is for the Mac.
   - **At the default look a press stays down for tens of seconds.** Half way back in
     about 24 s is a long time for a hand on glass; worth judging on the Mac whether
     the glass should come up faster by default (Plate Spring).
   - **The Fillmore East sequence's Sunburst stage leans on Beat Squeeze** (1.0, with
     Fingering 1.0): with the squeeze reaching the plate, each kick now lifts with a
     faint ripple at the rim's spokes (a tap's lift, 0.004 in `npm run lift`), and the
     big sunburst still comes from a hand on the Press; a kick's lift strong enough to
     read as the sunburst is a plan item for after the owner has seen it. Its
     description says the dish is pressed on every kick again. Judge it on the Mac.
   - **Stroke centres are not checked to be whole cells anywhere. Done:** `squishDisc`
     and `applySquish` round every centre now, so the next fractional caller lands on
     the nearest cell instead of laying nothing (`npm run lift`).
   - **The fingers are drawn, not grown.** The lift lays spokes from the CPU as the
     press did; the solver's own squeeze flow is still symmetric in the sign of dh/dt.
     An instability in `squeezeUpdate` keyed on a rising gap would let the fingers'
     spacing come from the film's thickness, as roadmap G asks.
   - **A pressed disc comes out octagonal in the lab** (an even press on an even
     plate): some grid direction in the squeeze solve, cause not yet looked for.
   - **The lab's finished picture of an off-centre point is not at that point.** A
     ring drawn round the press's cell in `lab.render` found none of its fingers
     (correlation −0.06 against −0.97 in the dye, and no flip or transpose above 0.23),
     so the plate shader's dish and lens framing moves it; a check that reads the
     picture off the centre needs that map first.
   - **Fingering had no way onto the phone** before this (now on the Press tool's
     Amount); the other Show-sheet plate controls (Beads, Cells, Lacing) still have none.
5. **Oil and water that stay apart** (roadmap §I). Liquids as bodies with interfaces,
   with the ferrofluid phase as the precedent. The biggest difference in every frame,
   and the largest piece of work here; prototype in the lab first.
   *Shipped 2026-09-27 for oil and water* (#179, Oil Bodies, on in Oil & Water): the oil
   carries its own share of the dye, so amber oil on teal water stays two colours
   as the drops round, merge and are dragged. *Check:* `npm run bodies`. Waiting on
   the owner's eyes on a real GPU (judging.md 14).
   *Found while building it, not yet done:*
   - **Only oil is a body.** Silicone lands in the same oil field; soap, milk, ink and
     the other bottles are still properties that blend. Each immiscible pair wants
     the same treatment (roadmap §I, and batch 4's liquids).
   - **Oil on Water with Oil Bodies at 0 still loses colour.** The rebuilt tension
     took a settled drop from 41% to 88% of its dye kept (86% still inside it), but MacCormack still drops
     the rest; the flux transport Oil Bodies uses keeps all of it. Worth trying the
     flux transport for any look with oil, bodies or not, and measuring the cost.
   - **A seam inside freshly merged bodies** lingers for a few seconds in the lab
     (each drop's old rim). Judge it on the Mac; if it reads as a drawn line, blend
     the oil's own colour faster where two bodies have just joined.
   - **The cost is untimed.** Oil Bodies adds a transport, four partition passes, four
     blurs and a landing pass to every step of Oil & Water; `npm run stages` on the
     Mac gives the number.
   - **The lab's default diffusion (1e-4) is harsher than Oil & Water (0).** Checks
     of the dye near oil should set the look's own diffusion, or say why not.
   - **Oil poured in the first seconds of a show may stall a frame.** The bodies'
     six kernels, like the oil's surface tension before them, are built behind the
     show (about fifteen seconds after it opens on the Mac), because no look runs
     them until oil is poured and `npm run startup` holds the opening to what its
     first steps use. Oil poured before they are ready builds them on that frame.
     A check that pours oil at once in Oil & Water would say how long it stops.
6. **A plate that lives on its own** (roadmap S2, heat and boiling). Blocked on heat
   having a strength.
7. **Layers at their own speeds** (roadmap Stage 4, the rig). A slow wash, a drop field
   and a streak layer, each at its own speed, added as light.

Small things that ride along with the steps: drops with a coloured rim lined up in
chains along the flow (with batch 3), letting the dish rim show now and then as a phrase
event, and one big organiser over a field of small drops at about a 10:1 size range.

*Proposed 2026-09-28:* **Go on the music.** A Go is immediate and its fade is in seconds
(`sendLook` → `fadeSettingsTo`; a set item's `fade` is seconds), while the Mixer's takes
already fade in bars (`barsToMs`, #195). A performer wants the change to land on the
music: Go on the next bar, in 4, 8 or 16 bars, or at the next section the song's shape
hears (`barGrid`'s one, `songShape`), with the fade in bars. Beside it a **T-bar**: a
learnable fader, and one on the phone, that scrubs the fade from the look playing to the
one armed, by hand, with soft takeover, and a Go that completes it. It is the hand's side
of §17's anticipation. On the phone a long press on Go arms "on the bar" with a ring
counting down, and the Looks sheet gets the T-bar. *Measure:* `npm run setlist` for the
arming and the count; `npm run downbeat`'s song for a Go that lands within a frame of the
one; `npm run desk` for the T-bar's soft takeover.

### 11. The mixer

`src/lib/mixer.ts`, `src/components/MixerPanel.tsx`, the display pass in
`src/gpu/wgsl/plate.ts`; the design is [docs/rig-plan.md](docs/rig-plan.md) R7.

Asked for directly on 2026-09-27: "a video mixer control available from the top level
but also in the settings, that can move the order of layers (LED spinning, video,
picture, any other image input) and control brightness, contrast and the other photo
and video standards on each." With it, a standing rule: every feature ships its phone
version in the same PR (see the operating rules below).

1. **The sources there are, in one stack**, *shipped* (#176). The LED ring, the front
   and back plates, the film and the logo, top of the list on top on the wall; the
   front plate fixed, and only the LED ring passing it (the lamp under the glass, or a
   beam over it). Each row has a level and a grade (brightness, contrast, saturation,
   hue). On the Perform desk (docked beside the plate, no scrim), in Settings → Mixer,
   on the phone's Mix sheet and on the remote; every control MIDI-learnable and
   pinnable, four pads to walk a source up the stack. At the defaults the picture is
   byte-identical to before. `npm run mixer` measures it (31 checks, each held red
   against a broken shader). **Owed:** the Mac look in `docs/judging.md` §13 (the film
   between the plates, the LED beam, whether 0–200 % is the right travel).
2. **The other pictures as rows**, *shipped* (#189). The lumia and the gel wheel
   were each still set in their own corner of Settings (the camera already comes in
   as the film). Each is now a row with its level (Lumia and Gel Wheel, the same
   settings) and its own grade. With the LED ring they are the lamp's three, the
   only rows that can go under the front plate, built bottom up into the light the
   glass is lit by; raised over it, the lumia is a beam screened over the plate and
   the gel a filter on the lens, which colours what is under it in the stack and
   leaves black glass black. Every order saved before keeps its picture (the two go
   in under the front plate, where the shader always drew them), and seven scenes
   rendered on main and on the change are the same to the byte. Two more pads
   (Mixer: Raise Gel Wheel, Raise Lumia). `npm run mixer` 44/44, each new check held
   red against a broken shader. **Owed:** the Mac look in `docs/judging.md` §13 (the
   gel's 1.5 gain over the lens; the lumia as a beam).
3. **A blend per row**, *shipped* (#193). Every row but the front plate keeps the
   way it always came in as Own (the beams screened, the gel a filter, the film
   through the dye, the logo by its alpha, the back plate by its Blend Mode) and can
   be set to Screen, Add, Multiply or Key instead, in its Grade drawer; a row off
   Own says which in its tag. R3's additive light made a choice. Everything starts
   on Own, and the seven scenes of step 2 render the same to the byte. Six pads
   (Mixer: Next Blend, per row). `npm run mixer` 60/60: each blend on each row,
   the lamp's three included, is its formula pixel by pixel (within 1 step of 255,
   the nearest other formula 4 to 42 steps away); the logo's clear margin stays
   clear; on paper the back plate is still lit as a photograph and blended after;
   the post chain's finish is told the logo's blend; and the checks were held red
   against seventeen broken shaders. Key keys at Film Key on the film and at its
   default elsewhere. `npm run phone` presses every row's blend and holds each
   row's name whole beside its tag. **Owed:** the Mac look in `docs/judging.md` §13
   (the key's edge on a real film; Add over a bright plate). The front plate has no
   blend: it is the glass the rest is laid on.
4. **Crossfade a row**, *shipped* (#195). Each row has a Fade button beside its level
   that takes it out over the row's fade time and brings it back to where it was (a
   film at 40% comes back at 40%); pressed while it runs, it turns round from where it
   is, in its share of the time; a fader moved during a fade stops it there. The fade
   time is in bars, in the row's drawer (0 to 8, 0 is a cut, two bars to start),
   counted at the tempo the desk sends or taps, else the one heard, else 120. Seven
   pads (Mixer: Fade In/Out, per row), each fade time MIDI-learnable; the desk,
   Settings, the phone's Mix sheet and the remote all have the buttons. `npm run
   rowfade` 48/48 drives whole fades at the show timer's 16 ms: no step past the
   curve's steepest (0.0024 on a four-second fade from 0.4), at rest at both ends,
   on time, the turn-round, the hand, the cut, a Go during a fade on every row, the tempo the bars
   are counted at, and the wiring; held red against twenty broken fades. A song's glide
   of a level, and a sequence stage's writes, stop a take on it, as a hand does; a
   new look forgets where its gel and lumia were taken out from; the remote's
   buttons light from the display's state. `npm run phone` presses the front plate's
   button on a phone and reads it walk to 0 in 3.8 s over 41 levels, turn round and
   come back. Found on the way and fixed here: a Go laid each step of its fade down
   whole, the room's settings as they were when it was pressed, so a film taken out
   (or a fader ridden) during a Go flickered back once a step; the look fade now
   keeps the room as it is (`keepRoom`), and a take on the gel or the lumia pressed during
   a Go, whose levels the look also sets, is the take's to the end of the Go (`lookStep`;
   the Go undid it, 63 steps back up, before). **Owed:** the Mac look in
   `docs/judging.md` §13, and a film coming in from a pad filmed by hand
   (`film.yml`) to show no hard cut in its motion table.
5. **The mixer on a narrow desk**, *shipped* (#196). At 1024 px the docked sheet
   covered half the plate. Done more simply than the compact layout planned here:
   the docked Mixer is the rides' column wide at every window (304 px, was 440), so
   it lies over the rides it stands in for and never over the plate; the row's name
   keeps its width, the tag gives way, and the blend buttons sit closer. Measured
   against the plate's own box: 29% of it covered at 1024, 18% at 1280 and 15% at
   1440 before, 0% at all three now. `npm run layout` opens it at the three widths
   with a row's drawer open and asks that none of the plate is under it, all five
   blend buttons are there, and nothing in it is cut, crowded or spills (27/27).
   The phone's Mix sheet is its own layout (step 1) and is unchanged.
6. **A row per projector** (rig-plan R1). Once a rig has more than one live plate,
   each projector's plate is a row, with its own grade at the projector's scope (R2).
   This is the large one; it waits on R1, and is §16e.

Found while shipping step 2, not yet done: #189's deploy (main 41ad65e) went red on
the Mac show shard's `qa` at two checks that passed on the same tree in the PR's run an
hour before: "the plate, not the hole, takes the pointer" (the cursor over a DIV at the
desk's preview) and "the run completed" (`__cgFrame` returned null in the look-fade
colour section), with "requestAdapter did not answer in 10s" in the console. Neither
touches the Mixer; the second looks like the adapter going away under the run. Worth a
`qa` guard that says "no frame" rather than throwing, so the run goes on to the checks
after it. And #193's first show shard died before any test ran: the runner could not
resolve github.com at checkout.

Found while shipping step 4, not yet done: #195's deploy (main 6c6d17e) went red on
two Mac checks that passed on the same tree in its PR run and again in #196's run
right after, so step 4 went live only with #196. `npm run ears` on the open shard:
"visible with the wall asking too" drew 14 frames in 2 s where it asks more than 20
(35 in #196's run); every reading was in the right place, so the floor counted the
runner's frame rate, not the ear, and the "Gaps in the plan" thread has a fix on #194.
`npm run squeeze` on the show shard: "the tapped beat drives the show's clock" read a
beat every 396.6 ms against 401.4 ms tapped (2 ms allowed), with the plate stepping
255 times in 12 s where it steps about 320; the Mixer's fades only read the tempo. The
tempo the taps set is the plain mean of their gaps, so something moved the clock off it
after the taps; worth reading whether the clock falls back to the heard beat when a
frame comes more than 250 ms after the last (`beatClock.setExternal`'s window).

Found while building step 4, and settled: step 4 made Back keep the room's settings
the hand changed after the Go (the film's level, the Mixer, the dimmer), since each
step of a look fade kept the room as it was. The owner asked for Back to go fully back
(2026-09-27), so it has its own path now, **done** (#204): a Back fades the wall's
part of the room back with the look (`backStep`), leaves the machine's setup
(`SETUP_KEYS`: the grid, the microphone's latency and prediction, the room camera's
reading, the set's pacing, the logo's place, each row's take time), anything a hand, a
pad or a song writes while the Back runs, and the dimmer in a blackout, and stops every
take still walking. `npm run rowfade` 48 → 58: a Go, the hand's moves after it and a
Back: film, dimmer, a row's grade and the microphone back as they were (all four stayed
put through the Go's step, the control), the look's 24 changed settings back, the setup
left, no tick more than a smooth two seconds allows, a ride and a blackout during the
Back held, a take stopped (left running, it walks the film to 0 under the Back), and
every writer of the wall's settings marked. The pre-push review found the blackout,
the Mixer's order and blend pads and a running glide written over by a Back, and the
check-skeptic eleven broken Backs that passed the first checks; all fixed and red
now. Still true: a Back after a new song's own look rewinds the room to when that
song began, which "fully back" means but may surprise after an unattended change.
Not done here: a take pressed during a Go wins over
the Go for that row, but a hand on the gel wheel's or the lumia's slider during a Go
still does not (the Go's next step puts the look's level back), and inside a sequence
a take on the gel or the lumia during a stage's glide is stopped by the glide's next
tick, as a hand's is (the button lights once and nothing moves). The rule a Go now
keeps (a later press wins, to the end of the change) would settle both.

Found while building step 3, not yet done: the logo darkens what is under it by up to
8 steps of 255 in the pixel or two where its card meets its clear margin, on its own
way in as much as any blend, because its texture is filtered with its colour not
premultiplied by its alpha (`npm run mixer` stays two pixels clear of that edge).
Premultiplying on upload would take it out. And once, in a cloud session,
`npm run phone`'s "spreading them zooms in by as much as they spread" read 4.00× →
5.60× (1.40 times, 3.40 wanted): the zoom followed the first of six finger moves
(50 → 70 px) and none after. It passed on the next run (3.40) and on every run before;
the Mix sheet is shut by then. Worth reading whether a touchMove can be dropped while
the page is busy. Seen again building step 4: three runs in seven with `PW_WEBGPU=1`
(1.40, 1.40, 3.00 times), on step 4's tree and once on step 3's. Sending the move the
pinch's once-a-frame throttle holds back when the frame is up, instead of at the lift,
did not stop it, so the later moves seem not to reach the pinch at all (inferred, not
measured): the touch listeners' cleanup drops the pinch, and a plate rebuilt mid-pinch
would do exactly this.

Found while building step 1, both **done** (#198): the remote's Mixer had no check of
its own (`npm run phone` drives the phone layout, not `?remote=1`); `npm run remotemix`
now starts the show server with a display and a phone on the remote and asks the
display's own settings that the phone lists its rows in its order, moves the stack by
the stack's rule, sets a blend and a level, walks a take down over the fade time set on
the display and back, and takes another row with its own button (12 checks, in the
Measure job; the order asked is one set on the display, since a remote that never read
it drew the default and agreed). And on landscape phones narrower than about 800 px the dock's
tools fell under the 48 px target (42 px at 740×360, 35 at 667×375): there the dock is
now two rows, the ten tools over the five sheets, at 48 px and 4 px gaps, and one row
from 800 up. The second row cost the plate its height (48% of a 667×375 screen, under
the half a landscape plate is held to) until the top row, a full-width band of touch
between the look and the three buttons, let touches through to the plate: 60% there
now, and 79% at 844×390 (was 65%). `npm run phone` holds 800×360, 799×360, 740×360 and
667×375, asks which sizes get one row and that a finger in the top gap lands on the
plate (243 checks, was 177).

Three Mac checks went red once each on commits that did not touch them, one per run,
while this batch's plan was going in (#177), and no cause is known yet:

- `npm run phone`, "two fingers holding Drop lay dye under both": A 62 against B
  181, 0.34 of each other where the check asks 0.4 (0.63–0.99 over the nine other
  runs that have it). Not the plate coasting: the line now prints how far the
  fingers' cells moved between picking and holding, and it read 0.0 on the next
  run. Look next at the held Drop's drops (`dropHeight`), which land every
  DROP_EVERY steps with a splash.
  **Again on #186's deploy (5831ff7, 2026-09-27 12:34Z), where it stopped the
  deploy:** A 234 against B 81, 0.35, the mirrors clear (0/0/0 and 2/0/0), the
  fingers 0.0 cells from where they were picked; the same shard passed on all four
  of #186's own runs. It is not one finger: the first time A was the low one, this
  time B. With two failures now at 0.34–0.35 and nine to thirteen
  passes at 0.63–0.99, the split is bimodal, which reads like one finger's drops
  landing a beat later than the other's in the window, not noise round a mean.
  **A third time on #196 (ed42edd, 2026-09-27 16:04Z)**, a desk-only change: A 81
  against B 221, 0.37, the mirrors clear, 0.0 cells of drift, 100 readbacks. The
  three low fingers read 62, 81 and 81 and the high ones 181 to 234: one finger
  laying about one drop's dye and the other about three, where a phase difference
  between the two fingers' drop clocks (each counts DROP_EVERY solver steps from its
  own touch) can only make them one drop apart. So look at what can take a whole
  drop away: a drop's splash (`autoInject('drop')`) carried out of the measuring
  disk, or two drops on one spot capped at the plate's density ceiling.
  (#186 changed where a press lands; the held Drop's splash lands on whole cells
  already, so it lays the same as before.)
  **A fourth time on #208 (3a0fcf8, 2026-09-28): A 201 against B 65, 0.32.** Read
  2026-10-03 against the 35 other Mac runs of the last two days: that one red, and
  the pairs that passed read 0.46 to 0.98 of each other, at 74 to 269 a finger, both
  fingers 52 cells from the middle every time. Classic lays the Drop as a stream
  (Drop Height 0), not drops, so the drop-clock theory above was not this check's:
  both fingers lay on every step from the second touch to the lift, by the code. So
  the check is now two, and the next red says which half: **what each finger laid**,
  by the app's own count (`chromaglassDebug().hands()[i].laid`: steps held, drops,
  dye handed the solver; each held to the steps the plate itself took with it down,
  and the same dye a step for both), and **what the plate holds**, the dye under
  each finger against its mirrors as before, at least a fifth of its nearest dye
  still inside its disk, with the balance asked of the dye nearest each finger
  (within three disks, nearer it than the other) instead of one disk, so a pool the
  plate carried off its finger's cell in the 1.9 s is still counted as that finger's.
  *Still open:* why the plate's two pools of the same steps differ by up to 2.5
  times on a cleared plate. The line now prints the disk and the nearest-dye readings
  side by side, so a red with equal counts and unequal nearest dye is the plate
  losing one pool's dye, and equal nearest dye with unequal disks is the plate
  moving it. Both halves were shown red on the Mac before merging, each on a mutant
  pushed to the PR and reverted. With B's dye reaching the plate at a third, the
  plate half went red (A 194, B 72, 0.37) while the count half stayed green (A 28
  steps and 222 dye, B 26 and 206, against the plate's 26 to 30 steps), as it
  should, since both fingers had laid alike. With B laying on every other step, the
  count half went red (A 23 steps, B 11, against the plate's 21 to 25), and the
  plate half stayed green at A 101 to B 61 (0.60). A half-rate finger is inside
  the plate's own scatter, so the plate's balance could never have caught it. On
  both runs, the dye nearest each finger equalled the dye in its disk, so in these
  1.9 s the plate does not carry a pool off its finger. A red with equal counts is
  therefore dye the plate lost, not dye it moved.
  **Found 2026-10-04 (#240): the plate lost it to the fingering push, which #222
  took out.** Of the six reds handed over as this line's (2026-10-03), two were the
  mutants above, run on purpose on #224's branch (commits 7efc16a and 81748e9 say
  so), not flakes. Three more, one finger at a third with both counts equal (main's
  deploys at 05:11Z, A 69 to B 229, and 06:06Z, A 236 to B 84; Roy's branch at
  07:57Z, A 197 to B 72), and the four of 2026-09-27/28 above, all ran on trees
  before #222 merged (08:38Z 2026-10-03). In the 80-odd Mac runs of the phone's
  fingers since, none has read one finger low, and four diagnostic runs on the Mac
  (PR #240, taken out again) held two Drops 146 times, most with the band playing, after
  the Press as the check does and not, with every readback fresh (landed within two
  of issued) and no drying, thinning, air or multiply near the fingers: none did
  either. The push moved dye up its own gradient where its noise was negative, a
  held pool is the steepest gradient on the plate, and the advection's hold and cap
  threw away what it piled up; where the noise was positive the pool kept its dye,
  so which finger lost hung on where the plate's angle put it, and when.
  `npm run grating` §6 replays two held Drops (Water, 7.9 a step, as the red lines
  print) at two red runs' cells on the phone's grid, at ten moments of the show's
  clock: with the push back the pools read 82 to 238 of 237 laid, a pair as
  uneven as 94 to 235 (0.40), four of twenty under 0.6; as it is, every pool keeps
  191 or 192, the pairs 1.00 of each other. *Still open, and rarer:* both fingers low at once, after
  #222. Once on #230's branch (16:07Z 2026-10-03, A 0 and B 0 with 214 and 206
  laid, the mirrors at -0 to -3) and once in the 146 holds (74 and 76 of 285 and
  277, the whole plate up 159 of 562 laid, low from the first reading 0.4 s in,
  in the one diagnostic run that did not yet log drying or air). Not stale
  readbacks; not seen in the few holds with the band never started, too few to
  clear the band. The line now prints the whole plate's gain against what both
  fingers handed it, so the next one says whether the plate lost dye everywhere.
- **Found while reading it, and fixed with it: a held Drop with Drop Height up let
  go of a drop on every step, not every tenth.** Its clock (`dropClockRef`, and each
  finger's own) was counted up only past a frame's first step until it had started,
  so on frames of one step each, a plate stepping at the display's rate, it stayed
  at 0 and every step was a drop: 60 drops in 60 steps where 6 were meant, 33 with
  one two-step frame among them (simulated over the old and new counting); ten times
  the dye and a splash on every step until the first frame that happened to owe two.
  Counted after each step it is used on, the first step is still a drop at once.
  `npm run phone` counts a held finger's drops against its steps on the Mac shard.
  It cannot show the old clock there: the Mac runner's phone section steps
  less than once a frame (14 to 18 steps over 15 to 20 frames). That makes two-step
  frames common, which unstuck the old clock, so the old clock passed too (2 drops
  over 16 steps). The arithmetic above is the evidence for the fix, and the owner's
  look at Bass Drop and Boiling Point at 60 fps is the check (`docs/judging.md` §19).
- `tools.mjs`, "Blow held still blows a bubble": the straw blew 0 bubbles, on the
  run after, where every other shard passed.
- `npm run startup`, the same check, a second kind of stop: on #186's run on 1f627f3
  (2026-09-27) the frames stopped 2.22 s from 1.34 s, *before* the device was given
  (asked at 0.53 s, given at 3.50 s; the first step at 13.61 s), where the check
  names the stop at the GPU's start as a separate 0.30 s from 1.04 s. The same app
  passed the shard on the commit before (40dee25; only a check script differed).
  Not #181's stop (that one sat a quarter second after the first step). Worth
  measuring what the page does while Chromium creates the device (the table shows
  no frames counted between 0.77 s and 3.48 s), and whether 4b should own every
  stop before the device is given rather than only the first. Again on #194's run
  on 5fd3636 (2026-09-27): 3.52 s from 1.04 s, the device asked at 0.83 s and given
  at 4.56 s, while the control's stop at the GPU's start began at 1.43 s, so the
  check's 0.25 s match to it missed and the stop counted as an opening stop. #194
  changes nothing that runs before the device is given (its ladder is built once a
  device and a stage exist); 5fd3636's parent 1d842d1 passed the same shard.
  **Fixed (this PR):** the moment a stop begins is not what makes it Chromium's.
  Over 53 open-shard logs of 26-27 September, every opening (the control's and the
  show's) drew no frame for 1.25 to 4.2 s from about 1.0 to 1.4 s after load, and in
  every one whose timeline was printed the page's own timers stopped with the frames
  and no long task of the page's lay in it: Chromium holds the page's whole thread
  while it starts its GPU, and lets go within a tenth of a second of handing over the
  adapter or device. The show's own stops leave the page's timers running (the nine
  second freeze #164 fixed; the stop after the first step #181 fixed). #204's red (run
  36346188828) was the old rule's matching: a 0.15 s long task let one frame through
  at 1.41 s, the rule matched that sliver and the 2.58 s rest went to check 4. Now a
  tick every 100 ms marks the page's thread; any stretch of half a second or more,
  beginning in the first 3 s and ending before the first step, with no frame, no
  tick and no long task, and not begun where a promise the page awaits had just
  settled, is time the thread was held from outside, taken out of check 4's frame
  gaps and held by 4b to 4.5 s all told. If long tasks cannot be seen or the timer
  runs slow, nothing is taken out. The settled promises are there because the
  check-skeptic review found that the page's own JavaScript run after an `await` on
  a WebGPU promise (all the show's GPU setup) is never a long task: a second of it
  looked exactly like a held thread. Long animation frames were tried first and
  fail on the Mac: Chromium's own hold was one too (2.94 s from 1.01 s, run
  36353565837). What does tell is that the page's code after an await begins the
  moment its promise settles, and Chromium's hold begins with the adapter or device
  still pending. In a cloud session (`ci-flakes/startup-lab/probe7.mjs`) a second
  of busy code after awaiting requestDevice, a pipeline, fetch and work done each
  read as the page's own, and a renderer stopped from outside for 2 s read as held.
  *Still open:* a continuation of something the check does not wrap (an `import()`)
  would look held; the 4.5 s cap is the backstop. The long animation frames stay
  printed with where their rendering began, in case they can tell later. On this
  PR's green run (36364179427) the show's hold at the GPU's start, a 2.08 s frame
  gap that check 4 alone would have failed, was taken out as held (2.05 s). *Open:*
  the control's hold on the same run (3.82 s from 1.05 s, inside its device
  request) read neither held nor the page's own; the control is not judged, and a
  miss there can only make the show red, never pass it, but the opening line now
  prints what 4b made of each page's wait so the next runs say why. The old "within 0.25 s of the control's stop" and "control plus a second" are
  gone. Read against the 53 logs: #204's red and 36339282520's split stop (1.28 s
  then 1.68 s) now count as one held stretch each, 2.57 s and about 3 s; 2 of the 53
  (4.05 s on 36294600123, 3.75 s on 36338802046, each wholly inside a four-second
  device request) went over the old 3.5 s cap, as did #194's 3.52 s; the owner chose
  to raise it to 4.5 s, above every opening read (the controls' longest 4.18 s).
- `npm run startup`, "no stop in the opening, or while the rest was built behind
  it": **fixed in #181.** It was not a flake and not the deploys: every Mac run since
  #164 (37 of them, PR and deploy alike, medians 1.37 and 1.39 s) stopped the frames
  for 1.0 to 2.4 s a quarter second after the first step, longer on slower runners,
  and the three deploys that went red (2.43, 2.02, 2.03 s) were the slow ones. The
  cause, measured by timing each submit the GPU was handed: the first draw with the
  plate's render pipelines on a new device took the GPU 1.42 s, and the same draw a
  few frames later 0.03 s. Not a compile (warm openings stopped as long), not the
  canvas, not the fields' memory (a bare page writing all 75.8 MB stopped 0.08 s),
  not the builds behind the show. Each render pipeline built ahead now draws once
  behind the starting frame (`gpu/kit.ts`, firstDraw; only the half the show opens
  with, since the half built behind a running show would pay the same cost under
  it): the plate's first draw took
  0.14 s, the opening's longest wait for a frame fell to 0.82 s (not at the first
  step), and the forty warm openings' median stop from 1.08 s to 0.12 s. The 2 s
  limit is unchanged. `npm run startup` now prints the submits the GPU spent longest
  on round the first step, so the next stop of this kind names itself. Found on the
  way: on a slow runner the control's own freeze ended right at its twenty-second
  watch, so it read as never moving and check 1b failed on the control; the opening
  is now read at least to when the plate was seen running, and 1b asks the control
  to have run steadily at all.
- `npm run startup`, 1b, "moving for good no later than the old way" (with 3 s to
  spare): red on three of seventy open-shard runs, 27 September to 3 October (16.72
  against 13.71 s on 36371919138, 22.47 against 18.12 on 37095698733, 19.24 against
  14.99 on #223's 37143242070), while the show less the control ran -4.95 to +4.35 s
  across them. One opening against one, unpaired, measured the runner: each wait is
  Chromium handing over the GPU (2.9 to 6.1 s after load), the GPU compiling the same
  forty-five pipelines cold, and the page's own work, and the compile took the two
  openings of one run 0.75 to 1.5 times as long a pipeline as each other (the three
  reds 1.22 to 1.31, 12.9 to 16.8 s of compile in the show). **Fixed (this PR):** 1b
  takes Chromium's handover and the compile of the old way's pipelines out of both
  sides, and holds what is left, the page's own wait (beyond-the-list builds in it),
  to the control's plus 1 s: replayed on all seventy, -0.89 to +0.27 s, the three reds
  +0.01, +0.27 and +0.07. A second line holds the show's build of those pipelines to
  1.75 times the control's stop for them, so a slower way of building still reads
  red. *Still open:* the replay approximated each build from the run's total (the
  logs printed only that); the first green Mac runs print the real split, and the
  1.75 should be read against twenty of them. **Fixed again (the next PR):** the
  first cut read the old way's compile off the stop in its steps, and went red on
  #218's deploy (37167643240) the first time a control's frames stopped (2.16 to
  19.78 s) before its first step was counted: no stop in its steps, so nothing
  priced. It now reads the stop in its frames that its on-frame builds sat in (begun
  within a second of the last, counted from the end of Chromium's requests to the
  frames' return); replayed on the seventy as a proxy, -0.90 to +0.31 s (sd 0.22),
  and that deploy's control about 2.0 s against the show's 1.14 s. Each run now
  prints every stop its control's frames made, what was built in each and which it
  priced. Its first Mac run (37171671783) showed why it sums the stops a build sat
  in, each less Chromium's part, rather than taking the first: the control's frames
  stopped through the device's handover with its first build in that stop, then
  from 4.76 s for 12.10 s for the other 47, and the first, less Chromium's, read
  0.01 s (917x). On that run's numbers it reads 12.10 s, the show's own 1.05 s
  against 1.86 s and its build 1.03x. A stop with no build in it is never priced,
  so a runner's stall among the builds cannot make the 1.75x bound lenient. A build less than half again slower
  than the runner's own spread cannot be told from it by one pair of openings; a
  third opening, or a reference compile timed inside each, would cost another
  half-minute of Mac time a run.
- Still owed from that hunt: the solver's first submits cost a few tenths of a second
  more than later ones even with every compute pipeline dispatched once ahead on
  scraps (downsample 0.32 s, upsampleDelta 0.40 s, run 36306162647). Worth finding
  whether a one-workgroup dispatch on one-texel scraps reaches the cost at all.
- `tools.mjs`, the Finger's "and adds none": red on 4 of about 20 Mac runs across
  four branches on 2026-09-27 (53 → 66, 56 → 71, 50 → 64, 49 → 64, where the plate
  left alone drifted −22 to −12 before and +8 to +10 after), green on the rest,
  including gains as large (61 → 81 against +1 and +8). What differs on the red runs is
  the drift before the stroke, negative every time, so the margin read off it looks
  like the thing to read first; nothing measured yet says why.
- `magnet.mjs`, "dragging the Magnet gathers the ferrofluid along where the hand
  goes": on #180 (PLAN.md only, the same code #179's PR and deploy passed), the drag
  gathered 300 → 363 against 266 → 300 left alone, a gain of 29 where the check asks
  a tenth of 300. It asks the gain against what was there, on a hand path drawn at
  random each run, so a run whose best spot starts full reads low; worth reading
  the gain's spread over the last runs before touching its tenth.
- `mirror.mjs`, "Classic, calm, layer 1: and nowhere else" (**fixed in #225 and #238**: the
  region starting to move by itself was the bubbles' press leaking a net source into
  the pressure solve, then the air's standing source, under bubbles the simulated band
  released after the check's first drop; see the mirror item near the top): on #189 (the Mixer's gel
  and lumia rows, whose default picture renders the same to the byte as main's), 16.3
  past its drift at the hand's left/right mirror cell against an allowance of 16.1.
  The cell's drift climbed drop by drop (3.2, 5.9, 18.3, 49.5) and its change with it
  (5.0, 10.0, 46.8, 78.4): a region starting to move by itself mid-run, the case the
  check's own comment says it gives up. Over the seven Mac runs before it the same
  line read 2.1 to 9.1 against allowances of 8.3 to 36.4, at most 63 % of it. Worth
  asking whether a drop's drift should be read on both sides of the drop, so that a
  region starting up is in the drift and not only in the change.
- `phone.mjs`, "portrait: set to one bar in the drawer, the same take lands in about
  half the time": on #210 (the Press; no mixer or phone code) it landed where it
  should (0 at 1944 ms against two bars' 3849 ms; #201's run 1936 against 3838) and
  went red on "with a jump", whose size the line did not print (it does now). The fade is stepped by
  a 16 ms show interval against the show clock and the slider shows React's state,
  so a main thread that stalls on a busy Mac runner moves the level a stall's worth
  at once, and at one bar the allowance per 80 ms sample (0.106) is half two bars'.
  Worth printing the largest step and its gap first, then asking whether the walk
  should stamp the level with the show's time rather than the harness's.
- `bottles.mjs`, "an Oil Pour lays the dye a Water Pour does per push": red once on
  #210 (9.05 against 10.22; #201: 9.17 against 9.29). Water's ratio moved, not
  Oil's: the mouse's stir is a push with no dye once a move event, the Pour's once a
  step, so the ratio read how many steps the runner fitted into each move. **Fixed
  in #210:** only the hand's own Pour counts (pushes made in the task that laid its
  dye, nothing through autoInject); the detail line prints what was left out.
- `bottles.mjs`, "splatter with the Ferrofluid bottle lays ferrofluid along the
  stroke": red once on #209 (docs only), "not following the hand", 26 pours. It read
  the pours' own places, and a Splat flings its liquid up to 27 cells from the hand
  on a 29-cell stroke. **Fixed:** it reads where the hand was at each pour, and asks
  that the pours land on it on average and that the hand moved along the stroke.

## Not doing

- **Kaleidoscope, tiling, tunnel, halftone, posterize, solarize.** Warps of a picture.
  They are what every VJ tool already offers and they would erase the plate's identity.
- **A built-in drum machine.** Reacting to a synthesized beat is fine for rehearsal,
  but you perform with a band, and the music file player already covers practice.

## What comes next

The order of work at the top of this file (2026-10-04). It replaces the list that
stood here, written on 2026-09-26, whose every step has since shipped or moved into
it. The shipped batches are in `docs/plan-shipped.md`, and 19m is the rest of this
file's split.

## Operating rules

- A sandbox has no GPU worth the name, so a WebGPU fallback adapter classifies as
  `software` and gets one 256² rung. Every look is still judged on the Mac's GPU before
  the next batch starts.
- One Mac session at a time, committing from a worktree, never while a show is
  running: two sessions in one checkout have already trodden on each other's server
  and files.
- Every new setting is MIDI-learnable, reachable from the phone, and defaults to the
  current behaviour so a preset made today still looks the same tomorrow.
- Every feature ships its phone version in the same PR, not after (the owner, 2026-09-27).
- This plan is kept current: every PR that ships a batch step marks it shipped here,
  and anything found along the way that should be fixed or added goes in as an item,
  in the batch it belongs to or a new one (the owner, 2026-09-27).
- The repository is public, so it names no one: "the owner", not a name, email or
  machine (2026-09-27). Squash-merge commits made on GitHub still carry the merging
  account's email unless that account keeps its email private in GitHub's settings.

## 12. ChromaGlass in the App Store and Google Play

Asked on 2026-09-27: "What would it take to create an Apple iPhone app and put it in
the store?", then "expand on this idea with the Android store". Steps 1, 4 and 4a are
built; the running order has where each step stands. The
full iPhone write-up, with a table of every browser feature the app leans on, is in
the project files (`iphone-app/iphone-app-plan.md`); this is the plan.

**The shape.** Neither store needs a rewrite. The show is one web build, and both
stores take a thin shell around it, but not the same shell, because the two phones'
web views differ in what matters here:

| | iPhone | Android |
|---|---|---|
| Shell | Capacitor: the built site **bundled** in the app, drawn by WKWebView | A Trusted Web Activity (Bubblewrap): the **live** site in full-screen Chrome |
| WebGPU | iOS 26 (iPhone 11 and newer), Safari and WKWebView alike | Chrome on Android 12+, Qualcomm and ARM GPUs; the app's "needs WebGPU" screen covers the rest |
| Web MIDI | None in WebKit; a CoreMIDI plugin later | Chrome has it, so USB controllers work from day one |
| Record and Render | A web download does not save in a web view: route to the share sheet or Photos | Chrome downloads as it does now |
| Updates | A new App Store build each time (guideline 2.5.2: no downloading code that changes the app) | Every deploy to `main` reaches the app at once; the store only sees a new build when the shell changes |
| Offline | Everything is inside the app | The service worker (`public/sw.js`) caches a file only once it has been fetched; precaching the build is 14h |
| Account | Apple Developer Program, $99 a year | Google Play Console, $25 once |
| Tools | Xcode on the Mac | Bubblewrap (JDK and Android SDK), on the Mac or in CI; Android Studio optional |

A Trusted Web Activity is Chrome itself, not a web view, so Android gets WebGPU, Web
MIDI, WebCodecs, wake lock and downloads exactly as the website has them today. A
Capacitor Android app would run in Android's WebView instead, which has no Web MIDI
and whose WebGPU would need its own test; the TWA is less work and does more. iOS
has no equivalent (every iPhone browser is WebKit, and Apple does not take a shell
that just points at a website), so there the build ships inside the app.

`detectTier()` in `src/lib/platform.ts` already has a `native` tier keyed on
`window.__CHROMAGLASS_NATIVE__`; the iPhone shell sets it. The Android app is the
hosted site in Chrome and keeps the `hosted` tier.

**What each store asks for.**

- *Apple.* A bundle ID and App Store Connect record; permission strings for the
  microphone, camera, adding to Photos, and motion if Tilt goes native; a privacy
  policy URL and the App Privacy label (crash reports from `crashLog.ts` as
  Diagnostics, not linked; audio clips to AudD/ACRCloud when song ID is on; lyrics
  lookups to lrclib.net; no tracking); a privacy manifest; export compliance (HTTPS
  only); a 1024 px icon, 6.9" iPhone screenshots, an age rating and a review note.
  The review risk is guideline 4.2, minimum functionality ("a website in a wrapper"),
  which the bundled build, offline play and native mic, camera, motion and Photos
  answer. TestFlight puts it on the owner's phone before review.
- *Google.* Identity verification for the developer account; Digital Asset Links
  (`/.well-known/assetlinks.json` on Firebase Hosting, holding the app's signing
  certificate fingerprint) so Chrome drops its address bar; an Android App Bundle
  signed through Play App Signing, targeting the API level Google currently requires;
  the Data safety form (the same three data flows as Apple's label); a privacy policy
  (required, since the app uses the microphone and camera); the IARC content rating;
  a 512 px icon, a 1024×500 feature graphic and phone screenshots. A personal
  developer account made since late 2023 must run a **closed test with at least 12
  testers opted in for 14 days in a row** before it can publish to everyone; that is
  the longest wait on the Android side and cannot be hurried, so it starts early.
  Play's minimum-functionality and WebView policies are aimed at wrappers of other
  people's sites; our own interactive instrument is not what they catch.

Both listings say the show flashes, and that the flash guard (`src/lib/flashGuard.ts`)
limits it. Free is simplest on both: a price or in-app purchase adds agreements, tax
forms and a 15 % cut.

**Running order.** Steps marked *(owner)* need the owner's phone, card or account.

1. **Smoke test the site on both phones** *(owner)*: chromaglass.web.app in Safari on
   an iOS 26 iPhone and in Chrome on a recent Android phone. Does the plate start,
   hold its frame rate, take fingers, hear the mic? Whatever breaks here is fixed on
   the website first, and both apps inherit the fix. *iPhone: **passed**, the owner
   ran the site in Safari on 2026-09-27 ("iPhone works. I tested it"). Android: not
   yet run.*
2. **Open both accounts** *(owner)*: Apple Developer Program and Play Console, and
   install Xcode. *Not started.*
3. **The Android shell** (one PR): a Bubblewrap project, `assetlinks.json` in
   `public/.well-known/` with a Firebase Hosting header so it serves as JSON, the
   manifest checked for what a TWA needs, and a CI step that builds the bundle.
   The upload key stays with the owner, never in the repo. Then the closed test
   starts, 12 testers for 14 days, while the iPhone work carries on. *Not started.*
4. **The iPhone shell** (one PR): Capacitor's `ios/` project with `webDir: dist`,
   no service worker in the app, permission strings, status bar hidden, minimum
   iOS 26, and an `xcodebuild` step on the macOS runner. ***Built*** (the "iPhone
   app" workflow compiles it for the simulator; `npm run ios` opens it in Xcode on
   the Mac), not yet run on a phone (`docs/judging.md` §16). Changed from the
   plan: the app takes the website's quality ladder, not the `native` tier's,
   because `capacitor://localhost` read as a laptop serving itself and would
   have offered a phone 1024² at three device pixels (`detectTier`, checked by
   `npm run applink`); it gets more once a phone's heat over a set is measured.
   Still owed from this step: the audio session (music through the speaker
   while the mic is on) and the idle timer, which lean on WebKit's own
   handling until the phone shows whether they need native code; the home
   indicator.
4a. **The app is also the laptop's remote** (asked for 2026-09-27: "make the
   remote control work on the iPhone app … switch back and forth between
   modes"). More › Laptop remote asks once for the laptop's address (paste the
   Phone line `npm run remote` prints, or type it) and remembers it; the remote
   carries it as `?relay=` and connects there, since the app's own origin has
   no relay (`src/lib/appLink.ts`). Play here goes back to the plate. Only in
   the app: the website's https page cannot open a plain ws:// socket to a
   laptop. Only the app's remote follows `?relay=`: review found that the
   laptop's display followed it too, so a crafted link opened on the laptop
   handed its show key and the show to any host it named; fixed before
   merge. `npm run applink` (Measure) checks all of it on a real relay with a
   stand-in laptop, the page on another origin and a stranger's host. ***Built***, not yet on a
   phone. Open: the iPad in the app gets the full layout, which has no Laptop
   remote button yet, and neither does a phone that took More › Full layout
   (until the app is reopened); a QR code on the laptop that opens the app straight
   into its remote (a `chromaglass://` link) would save the typing.
5. **Record and Render save natively on the iPhone** (one PR): the share sheet or
   Photos. The only feature that needs new code to work at all. *Not started.*
6. **A privacy policy page** on Firebase Hosting, and the store listings: text,
   screenshots from the lab and a real phone, icons, the feature graphic. *Not started.*
7. **TestFlight and the closed test** *(owner)*: a full set played on each phone,
   watching heat, battery and audio routing; a by-hand check in `docs/judging.md`.
   *Not started.*
8. **Submit to both stores.** *Not started.*
9. **Later:** a CoreMIDI plugin so controllers work on the iPhone and iPad; the iPad
   and a Mac App Store build from the same Xcode project; Android tablets and
   Chromebooks come with the Play listing.

The phone layout (#173) is what both apps show, so the operating rule that every
feature ships its phone version is what keeps them whole.

## 13. ChromaGlass in popular VJ software

Asked on 2026-09-27: "Integrate into popular VJ software." It came up alongside
"have we reached the point where we need to grow beyond the web?" The answer to that
(project files, `beyond-web/beyond-web.md`) was *not yet for the show itself*.
Handing video to another app was the one place a page cannot go. Step 1, the Mac app,
is built (#207); steps 2 to 6 are not.

**What integration means here.** A VJ app (Resolume Arena and Avenue, VDMX,
TouchDesigner, MadMapper, Millumin, OBS) meets ChromaGlass in four ways, and each one
takes a different route:

| | What it is | Route | Needs |
|---|---|---|---|
| **Video out** | The plate as a live layer in the VJ app | Syphon on macOS (Resolume, VDMX, MadMapper, Millumin, TouchDesigner, OBS), Spout on Windows (Resolume, TouchDesigner, OBS), NDI across a network (all of them) | A page cannot publish a GPU texture. **Today:** OBS captures the projector window and sends it out through its Syphon or NDI plugin. **Properly:** the wrapper (steps 1–3) |
| **Control in** | The VJ app or its controller plays ChromaGlass | OSC, which the show server already hears on UDP 9000 (`server/remote-server.js`, `oscToMessage`: `/chromaglass/setting/<key>`, `/action/<name>`, `/preset/<id>`, `/blow`, `/drop`, `/press`, `/tilt`, `/dye`) | The web app plus `npm run show`. Written up and templated, not built again |
| **Tempo** | One beat shared by everything | Ableton Link, which Resolume, VDMX and TouchDesigner all speak. MIDI clock already comes in (`src/lib/midi.ts`) | A page cannot join Link. The show server can |
| **Video in** | A VJ app's output as a ChromaGlass source | Syphon, Spout or NDI, arriving as a camera | **Today:** any virtual camera (OBS Virtual Camera, NDI Webcam Input), picked like a camera. **Properly:** the wrapper (step 6) |

**Not doing: a plugin inside the VJ app.** FFGL (Resolume) and ISF (VDMX, MadMapper)
run OpenGL fragment shaders inside the host. The plate is dozens of WebGPU compute
passes a frame, with a pressure solve, which means porting the solver back to GLSL.
That is the native rewrite `beyond-web.md` argues against. Streaming the plate into
the host gives the VJ the same layer without it.

**The wrapper comes first** (the owner, 2026-09-27: "Would a good option be to create a
small native wrapper that allows us to integrate into other VJ apps and have a
complete cached system?" Yes, and he asked for it in the plan). It is one small
native shell that does three jobs:

- **The whole show, cached.** The built site goes inside the app, so it opens and
  plays with no network. That covers a gig with no wifi, which the service worker
  only partly covers (see "Found along the way").
- **The show server, inside it.** OSC, Art-Net and the phone remote without a
  terminal. Electron's main process runs `server/remote-server.js` as it is.
- **A native add-on for the VJ routes.** Syphon, NDI and Spout, out and later in.

It is **Electron**, not Tauri. The show server is already Node. Electron's
Chromium is the WebGPU and Web MIDI that CI's `WebGPU (macOS)` job tests, while
Tauri on a Mac draws in Safari's web view, which has no Web MIDI. And Electron's
offscreen rendering hands over a GPU shared texture, which Syphon and Spout need.
The web app stays the core: every change lands on the site first, and the wrapper
picks it up in its next build. `detectTier()` already reads Electron as the
`native` tier. It is about 150 MB to download, which a show laptop doesn't mind.

**Running order.** Steps marked *(owner)* need the owner's Mac and a VJ app on it.

1. **The wrapper** (one PR): an Electron app for the Mac with the built site inside
   it (offline from the first launch), the show server started with it, the show
   window opened on the projector with no click needed, background throttling off,
   and a macOS build on the CI runner. A check loads the packaged app with the
   network off and sees a lit plate. **Shipped** (2026-09-27): `desktop/` (its
   README has the build, the signing secrets and the first launch), the check
   `npm run desktop` run on the packed app by `.github/workflows/desktop.yml` on a
   Mac, which also builds the `.dmg` (Actions → Mac app → Run workflow). The server
   is `server/remote-server.js` unchanged, imported by the app; the app keeps its
   show key between launches; `useProjector` sends the show to a projector with no
   gesture when `isDesktopApp()`, and the app fills the projector's screen itself.
   Measured in a cloud session before and after: with a stand-in second screen, no
   projector window opened before, one opened in full screen after; without the
   app's fill, the wall showed the click hint and the laptop the title-bar chip.
   **Owed:** the Mac look (`docs/judging.md` §26), and signing it with the owner's
   Developer ID (the secrets in `desktop/README.md`); until then macOS asks once in
   Privacy & Security before it opens.
2. **Syphon out** (one PR): a native add-on that publishes the plate as a Syphon
   server from Electron's offscreen shared texture, with no readback. Then *(owner)*:
   the plate as a layer in Resolume or VDMX on the owner's Mac, with the delay measured
   against the plate's own frame. *Not started.*
3. **NDI out, then Spout on Windows** (one PR each): the same add-on sends NDI over
   the network, and Spout on a Windows build. *Not started.*
4. **Control, written up** (one PR): the OSC address space documented where a VJ
   finds it (the show server's page and `docs/`), plus a starter Resolume OSC map and
   a TouchDesigner OSC Out example that play presets, actions and settings. Works
   on the website with `npm run show` too. *Not started.*
5. **ChromaGlass talks back and keeps time** (one PR, in the show server): OSC *out*
   for the plate's colour, the sound bands and the beat, the way Art-Net out already
   sends the colour to the lighting (`server/artnet.js`), so a VJ app's effects can
   follow the plate. And Ableton Link in, feeding the beat clock the way MIDI clock
   does. *Not started.*
6. **Video in from a VJ app** (one PR): Syphon and NDI arrive as a Mixer source
   (§11), not through a virtual camera. *Not started.*

Until step 2 lands, the plate still reaches a VJ app the way it can today: OBS
captures the projector window and sends it on through its Syphon or NDI plugin, and a
virtual camera brings video in. The phone rule applies to anything with a control: a
Link or OSC-out switch is reachable from the phone's More sheet.

**Found along the way** (from the same beyond-the-web review, for a gig with no
network):

- `public/sw.js` caches files as they are fetched, and loads the page from the
  network first, so parts of the app nobody opened, and the music shelf, are
  missing offline. Cache the whole build ahead of time, and add a check that loads
  the app with the network off.
- Record keeps the whole take in memory until it stops (`src/hooks/useRecorder.ts`).
  That's fine for a song and risky for a set. In Chrome, write to a file as it
  records (File System Access).
- The popup projector has only been used with one projector. Run two before rig R1
  counts on it.

**Found building step 1** (2026-09-27):

- The app's storage is its own, like a second browser: presets, MIDI maps and
  settings saved in Chrome are not in it, and moving them is one file at a time
  (each preset's download button, the MIDI map). One "take everything with you"
  file (every user preset, the MIDI and sound-learn maps, the set list, the room's
  settings), written in Chrome and opened in the app, would make the move one step.
  The same file is a backup before a gig.
- The storage belongs to the origin, port included: if port 3000 is taken when the
  app opens (a `npm run show` still running), the app moves to 3001 and opens with
  none of its saved looks. It says so in Show → Show Server Details…, but a
  performer would not look there. Either warn in the show window, or give the app
  its own origin (a custom protocol for the show window, with the relay still on
  the port), which needs `relayInfo()` to learn the relay's address another way.
- Built for Apple silicon only. An Intel Mac needs an `x64` (or universal) target in
  `desktop/electron-builder.config.cjs`, about doubling the build.
- The icon is the website's (`public/icon-512.png`), a flat square in the Dock. A
  Mac icon has its own shape and shadow (a 1024 px `.icns`).
- No updates in the app: a new version is a new download from Actions. Once it is
  signed, `electron-updater` from GitHub Releases on a `desktop-v*` tag (which
  `desktop.yml` already builds on) would let the app offer the new show itself.
- The hidden-window lines are judged only where a window in a bare Electron is seen
  to slow down when minimised or covered: never under xvfb (no window manager), and
  on CI's Mac runner only if its window server really hides a minimised window.
  The first run's control, a window inside the app, stayed visible at 46 frames/s
  minimised because the app's switches reach every window in its process. Where
  it is not measured, it is `docs/judging.md` §26 on the owner's Mac.
- In a cloud session `npm run desktop` can fail "the run finished" on a 30 s
  `page.reload` timeout, after software WebGPU starves the page (its covered-window
  reading shows 2 s of timers taking about 54 s, and once the GPU process exited).
  Measured on 2026-10-03 in one container: 3 of 6 runs failed this way after main's
  #231 and #233 came in, and 1 of 4 failed on the head before them. So it is the
  container, not those PRs. The Mac runner has never shown it. Worth fixing: a
  check that times out because its machine is slow says nothing about the app.
  Wait for the reload on the page's own first frame rather than `load`, or say
  "skip" when the covered reading shows the page was starved, as the lit plate does.

## 14. The show at the gig: hearing, timing, speed and the picture on the wall

Asked on 2026-09-27: "What else am I missing in plan.md? What other efficiency,
latency, and quality updates would help us". The code was read for it the same day,
four ways at once (what a frame costs, how late the plate answers, what the wall
shows, what stops a set), against this plan, `docs/roadmap.md`,
`docs/stability-plan.md`, `docs/webgpu-plan.md`, `docs/filters-plan.md` and
`docs/rig-plan.md`, so that nothing below is already written somewhere else. Items have
shipped since; the running order says which. Each item says what the code does now, with where, whether that is read in
the code or inferred from how a browser behaves, and what would measure a fix. The
order is what a performer or an audience would notice first.

What is already handled and so is not here: the wake lock (re-taken on every return
to the page, and held by the projector window too); the picture when the show window
is covered (the projector window drives the frames); fades, the dimmer and the
gamepad on timers rather than animation frames; MIDI unplugged and plugged back in;
the phone link's reconnect; readbacks that skip rather than wait; splats landing in
the frame they were made; dither before every 8-bit screen; the plate's bicubic
upsample. Display-P3 and HDR are H4 in `docs/roadmap.md`, linear-light blending is
deferred in `docs/webgpu-plan.md`, and the soft edge between projectors is rig R3.

### 14a. The show goes deaf when its window is hidden

**Shipped** (#191): the ear keeps hearing behind the wall, and says when it is deaf (`npm run ears`). How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

*Still owed:* the owner's look on the Mac, covering the show window with another app
for thirty seconds and reading `chromaglassCastState().ear.reads` before and after
(about sixty ticks a second with no wall, and the desk not saying "not hearing").
The worker's tick is chosen because a hidden page's own timers are held to about one
a second; that is Chrome's documented behaviour and cannot be shown headless.

*Found along the way, not done:* the look fade, the dimmer, the drift glides and the
simulated band run on the page's own timers (`showInterval`, `simulatedMusic.ts`),
moved there so a covered window would not freeze them. A hidden page's timers are
held to about one a second (much less after five minutes hidden), so a Go fired from
a MIDI pad while the show window is covered steps through its crossfade a second at a
time instead of gliding. The same worker tick could drive them.

### 14b. With the wall up, the plate may draw twice a refresh and the governor cannot see it

**Shipped** (#203, #236): one draw a refresh with the wall up, and on a busy machine the wall no longer costs the show its own frames (`npm run wall`). How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

*Still owed:* the owner's look with a real projector on its own display. And stepping down under a wall at all: it is new behaviour, from 14b and
14c together (the governor fed real intervals now, and a ladder built from the stage),
and nobody has seen it happen on the Mac.

*14b-2, the gate on a busy machine (shipped 2026-10-03).* `wall`'s floor went red on
starved Mac runners (#231: 36.4 drawn against 37.7; once 23.3 against 25.0) with the
draw gate untouched. Two things were wrong. The floor was 0.9 of what the show drew
alone at the start of the run, a different two seconds on a runner whose rate moves by
a third, so it judged the runner more than the gate. Judged against what either window
was handed in the same seconds, the 53 Mac runs of 2026-09-28 to 10-03 read 0.86 to
1.0, and the three under 0.9 were the gate: both clocks on one refresh, 24.3 drawn a
second where the show's own window was handed 28.3 (and 24.4 of 28.3; 34.8 where the wall's was handed 38.7). A
window handed only some refreshes has gaps of one, two or three, the gate's median of
them read two, its 0.6 of that 1.2 refreshes, and the show's next frame one refresh
after its own draw was turned down with nothing in its place: the wall costing the
show frames on exactly the machines least able to spare them. Now a clock's own next
refresh is never turned down (one turned down per clock per draw, which is all one
refresh holds), and the floor is 0.9 of the more of the two windows' frames handed in
the same seconds. `npm run wall` makes the busy machine on purpose (half the
refreshes missed by both windows together, checked to be the same ones; a cloud
browser misses none under load): the gate as it was drew 23.4 of 29.4 handed with both
clocks on one refresh and 26.0 of 29.5 half a refresh apart (both red), now 29.5 of
29.5 at each; in its
arithmetic on a 60 Hz display missing refreshes, 0.75 of either window alone at worst
before and 0.99 after, never more than one draw a slot. The regular-clock sweep is
unchanged (28 and 20 a second, 120/60, 11.7 ms draws).

*Found along the way, not done:*

- *On a busy machine the wall repeats frames the show missed.* The gate still works to
  the median gap of a clock, which a window missing refreshes reads as two or three, so
  an ask in a refresh the show missed is turned down when it comes under 1.2 refreshes
  after the last draw. `npm run wall` on its busy machine three quarters of a refresh
  behind drew 35.0 for 44.0 slots served (0.8), and the Mac runs 0.68 to 0.91 of the
  slots. The floor does
  not catch it (each window still gets its own frames) and the ceiling allows it. Taking
  the refresh from the shortest gap that recurs, as `wall` measures the display,
  brings it to 0.90 to 0.95 in the arithmetic, at the cost of up to a quarter more draws on a
  machine already short of time; whether the wall's smoothness is worth that is the
  owner's call. Measure: the busy phase's draws against its slots.
- *A 120 Hz laptop with a 60 Hz projector draws 120 a second.* The gate works to the
  faster display so that neither window gets fewer frames than it would alone, which
  keeps the desk at 120 on a ProMotion screen; but every draw carries the mirror
  copy, and the wall shows only every other one. Pacing to the projector while the
  show window is not what the audience is watching would halve that work. Measure:
  the arithmetic case 120/60 with the draws counted against the wall's refresh.
- *The wall's older "asking for one draws one" line cannot fail on the ask.* It asks
  thirty times with the show's own frames running and counts every frame drawn, so
  the show's own clock alone passes it (and did before this: 60 a second is over its
  twenty in half a second). The new "covered, every ask the wall makes draws" line is
  the one that measures an ask; the older one should be run covered, as that one is.
- *The full app on software WebGPU loses its device every few seconds* in a cloud
  session ("A valid external Instance reference no longer exists", after about sixty
  frames, then some six seconds to recover), which is why the app's pixel checks
  cannot run there even with `PW_WEBGPU=1`, not only its readbacks. Worth knowing
  before anyone tries to make them.

### 14c. The projector's resolution comes from the laptop's pixel ratio

**Shipped** (#194): a wall's pixels are the wall's, not the laptop's ratio (`npm run rungs`). How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

*Still owed, on the Mac:* whether 1024² holds on a 1080p wall. 2.07 Mpx sits between
what was measured to hold (1.0) and to fail (4.1), so what `npm run ladder` with a
stage should show is the canvas at 1920×1080 on the top three rungs, 1440×810 and
960×540 below them, whatever the laptop's ratio, and 1024² at 1920×1080 at or near 30
fps at thirty steps. If it does not hold, the gate comes down to what does. And the
owner's look at a 0.75 rung on a real projector through the 'high' mirror.

*Found along the way, not done:*
- `npm run ladder` cannot attach a stage. It opens one page, and a wall window opened
  from it would share that page's device scale factor, so a Retina laptop driving a
  1x projector cannot be staged in one browser context. A `?stage=1920x1080`
  diagnostic knob, like `?dpr=`, calling `setStage` would let it measure the wall.
- A 4K wall opens at 512² on all 8.3 Mpx, as it did from a 1x laptop before. The start
  rule weighs the GPU class and not the stage's pixels; the governor finds the 0.75
  rung within seconds, but a wall above 1920×1200 could open there.
- The readout says "512² · 1.0x" on a wall too, where 1.0 is now a share of the wall
  rather than a pixel ratio, and the bench's `dpr` reads the same number. On a stage it
  should say so ("of the wall").
- A wall coming or going builds a new governor, which forgets a step rate it had given
  up and waits out its settling period again, and forgets rungs a solver that would not
  start had marked failed (only running out of memory sets the cap it keeps).
- `PW_WEBGPU=1 npm run phone` went red once in two runs on "spreading them zooms in by
  as much as they spread" (3.00 times of 3.40): the zoom was read before the pinch's
  last move landed, on a software plate a few frames a second. Green on the rerun; the
  phone's code was not touched here.

### 14d. The beat clock hears a smoothed bass level, not the kick

**Shipped** (#199): the clock hears the kick's onset, by its time (`npm run kicks`); counting heard kicks in the app on the Mac is 10.4's. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 14e. The picture and the room disagree about when the kick is

**Read in the code; the output delays are inferred.**

- *The app's own songs* are analysed from `captureStream()`, before the output
  device, and nothing reads `outputLatency`, `baseLatency` or `getOutputTimestamp`.
  On wired output that roughly cancels the analysis delay; on Bluetooth or AirPlay
  (150–300 ms) the plate leads the room by that much, and a locked kick adds Beat
  Lead on top. For a shelf song the precomputed `SongEar` (`songTrack.ts`, used today
  only by Render) could be read at `currentTime − outputLatency`, with no analysis
  delay at all.
- *One Beat Lead for every tempo source.* `beatLead` is described as the
  microphone's latency, but the clock applies it the same to MIDI clock and a tapped
  tempo, which have almost none. Switching from the mic to the desk's clock moves
  every kick by the mic's delay. Split it into the rig's display lag and a measured
  microphone delay, calibrated by tapping along or by a click played out and heard
  back.
- *MIDI clock* is timed with `performance.now()` in the handler (`useMidi.ts`)
  rather than the message's own `timeStamp`, so a slow frame delays the beat; and
  without a Start message, or after a 400 ms dropout, the pulse count starts on
  whichever pulse came first, up to half a beat off. Use `timeStamp`, and let an
  audio onset or a tap set the phase when no Start has come.

*Measure:* `outputLatency` in `chromaglassDebug()`; a unit test with jittered MIDI
timestamps next to `npm run timecode`; a speaker-to-microphone click on the Mac next
to `film`.

### 14f. Sound and MIDI reach the plate a frame late, through a whole-app render

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

**Shipped, the sound's half (2026-09-27).** Measured first under `?debug` with the
simulated band: the App rendered 69.8–70.3 times a second against 60 readings, and
with no sound at all 5 times a second, every one of those a poll (the layer badges,
the tempo label, the song's shape, the timecode, and where a plate draws the engine
status) setting a value it already had, which React renders the App to find out
whenever anything else is pending. Now the ear keeps every reading in a ref the
moment it makes it (`Ear.live`), tells React ten times a second (`EAR_VIEW_MS`), and
hands every reading to listeners on its own clock (`Ear.onReading`), which the cast's
audio feed uses so it keeps its 30 a second behind the wall. The plate asks for the
reading at the top of each frame (`hear`), and its frame first offers the ear that
frame (`plateFrame`), so the frame hears a reading taken on itself whichever of the
two loops runs first. The polls compare against what they last set. `npm run
renders`, on the Perform desk: React told 10.0 times a second, the App rendering
11.0 (those and the desk's "live for" clock), every commit on the page the same,
laptop and phone; the old ear 69.9–70.6, red. The ear tells React on a 100 ms
schedule, not 100 ms after the last time: readings come on frames, and "the first
frame past 100 ms" fell to 7.5 a second at 15 frames a second (by the rule; a slow
Mac draws 24 to 42), where the schedule keeps 10.0 down to 10. A quiet page renders
its clock and nothing else, 1.0 a second (the old engine-status pattern 1.3–1.7,
red). A frozen view (0.0 told), a dead render counter and a dead commit counter are
red too. On the Mac `open` shard (#211's first run) the plate heard a reading taken
on its own frame on every frame it drew (95 of 95 and 126 of 126 laptop, 72 of 72
and 93 of 93 phone), with React told 9.9–10.3 a second at 24 to 42 frames a second
and the App rendering 10.9–11.6. The ear's reading for the plate's frame runs
guarded, so a throw in it costs that frame its reading, not the plate its loop.

Still open here: the MIDI half. A fader still re-renders the App once a frame while
it moves (`rideSetting`: the ride drains into `setSettings` on an animation frame), by
design so the desk shows the value; reading the ride's shadow in the frame loop and
showing the desk's value at ten a second is the same split, not yet done. And the
reading's two byte arrays are still new each reading (about 60 KB a second), not
reused: a listener may hold an older reading, so reusing them needs the readers
checked first.

### 14g. A knocked cable: the audio interface and the projector do not come back

**Read in the code; what macOS does with the window is inferred.**

- *Audio.* When the input track ends, the handler sets the source to none
  (`track.onended`, `App.tsx`), and `devicechange` only refreshes the list of inputs.
  Plug the interface back in and the plate still plays deaf until someone opens
  Settings; the only sign is "silent" in the desk's audio line. Remember the intended
  input, reopen it when `devicechange` says it is back, and show a loud "input lost"
  on the desk and the phone.
- *Projector.* Automatic sending is skipped while a cast is open (`useProjector.ts`),
  the "send there" chip is hidden while casting, and `openWindow` only focuses a live
  window. Pull the HDMI and push it back, and the projector window has been moved to
  the laptop and out of fullscreen, and the wall shows an empty desktop. On
  `screenschange` while casting, move the window back to the projector; the existing
  next-click refill restores fullscreen.

*Measure:* `npm run shelf` or `npm run music` with a fake stream whose track stops
and comes back; a stubbed `getScreenDetails` with a fake `screenschange` in
`npm run panel`.

### 14h. No internet at the venue

**Read in the code.**

- The service worker saves nothing ahead of time (`install` only calls
  `skipWaiting()`, `public/sw.js`); a built file is cached only once it has been
  fetched. So after a deploy, the projector window's code and the song-map worker may
  not be there offline.
- A failed chunk matches `Failed to fetch` on the error screen, whose `startOver()`
  unregisters every service worker and deletes every cache (`src/main.tsx`): offline,
  that turns one missing file into a site that cannot be reloaded at all.
- The fonts come from Google (`src/index.css`), which the worker does not handle.
  *Found building the Mac app (§13 step 1), 2026-09-27:* they do not, anywhere. The
  `@import url(https://fonts.googleapis.com/…)` comes after `@custom-variant`, and
  CSS ignores an `@import` after any other rule, so the build drops it (`dist/assets`
  has no `googleapis`) and Geist and Geist Mono never load: every page shows the
  fallback fonts. `npm run desktop` saw no request leave the app. Serving the two
  fonts from the site fixes the look and the offline half at once; which one the
  designs were judged in is for the owner's eyes.
- Song ID and lyrics fetch with no timeout (`fingerprint.ts`, `lyrics.ts`), and one
  busy flag gates the local fingerprint match, the song-end detector and the remote
  ID together (`useMusicIntelligence.ts`), so a request that hangs on venue Wi-Fi
  stops songs the local library knows from being recognised.

*Fix:* precache every built file on install; never `startOver()` while
`!navigator.onLine`; serve the fonts from the site; `AbortSignal.timeout(8000)` on
both requests and a busy flag of the local matcher's own. *Measure:* extend
`npm run sw` (load, go offline, open `?cast=true`, reload: the app still draws) and
`npm run music` with a stub that never answers.

### 14i. What the wall shows: clipping, banding and the flash guard

**Read in the code; how visible each is is inferred until the lab renders it.**

- *The projector's gain and gamma work on an 8-bit picture.* The output pass's scene
  is the canvas's format (`output.ts`), and the frame is already dithered to 8 bits
  when `pow(col * gain, gamma)` runs (`wgsl/output.ts`). At gamma 0.5 code 1 becomes
  code 16: dark fades jump off black and the dither grows into speckle. Gain above 1
  clips each channel on its own, so saturated colours change hue (orange at 2.2
  turns yellow). Draw the scene in `rgba16float`, dither once in the output pass, and
  roll off with a shoulder that keeps the hue.
- *The camera caps white at about two thirds of the lamp.* With the camera on, the
  plate draws into the camera's scene in the canvas's 8-bit format (`camera.ts`), so
  the light above 1 the plate leaves unclamped for it is clipped anyway, and
  `aces(col * 1.12)` then peaks at 0.83. Oil on Water, Colorful Cosmos and Sunny Side
  Up use it. `rgba16float` for that scene, and/or an ACES scaled so 1 stays 1.
- *The dye reaches the plate in 8 bits and is then magnified.* `packDye` stores
  `sqrt(d/8)` in `rgba8unorm` (`wgsl/pack.ts`), and each texel covers 5.6 screen pixels
  at 512² on 1080p and 11 at 4K, with the closeup multiplying thin-dye contrast about
  ten times. Bicubic smooths between texels but cannot put the lost levels back, so
  slow gradients can terrace. `docs/webgpu-plan.md` calls it "probably gone"; nothing
  measures it. Sample the float fields or pack to `rgba16float`.
- *The flash guard reads screen values, not light.* `luma()` in `wgsl/probe.ts`
  weights the canvas's encoded values, while the guard's thresholds are relative
  luminance, which is defined on linear light. A strobe between 0.85 and 0.95 reads as
  0.08, under the 0.10 flash step, though in light it is 0.16, so bright strobes go
  uncounted; a kick from black to 0.3 reads 0.3 but is 0.07, so dark shows are dimmed
  for nothing. This is a safety item: decode to linear before the weights.
- *Keystone and corner pins* resample the whole frame bilinearly at the same size
  (`output.ts`), which softens by up to half a pixel and turns pixel-scale grain into
  a fixed pattern. Catmull-Rom (the plate's `textureBicubic`) and the grain after the
  warp.

*Measure:* lab ramps through the output pass at gain 2.2 and gamma 0.6 (largest step
between neighbouring codes, hue drift on colour patches); a flat white plate through
the camera (at least 0.97); a radial dye ramp flat and in the closeup (distinct levels,
widest flat run); flat 0.85/0.95 and 0/0.3 frames through the probe and into
`npm run wall`'s traces; a one-pixel grating through a 5 % keystone.

### 14j. Heat, battery and frames nobody sees

**Read in the code; the thermal behaviour is inferred.**

- *No frame-rate cap.* The loop draws on every animation frame and the readback runs
  in each, so a 120 Hz ProMotion MacBook, a 90/120 Hz Android phone or a 144 Hz
  laptop pays for 120–144 draws a second of a liquid that steps at 60 or 30. Cap the
  draw rate at 60, or twice the step rate when the governor has halved it.
- *A readback every frame, even frozen.* `syncFromGpu()` runs for every layer each
  frame whatever the solver did; with the plate frozen the solver stops but the draw
  and the readback go on at the display's rate. Read back only on a frame that stepped
  or wrote deltas.
- *The governor knows nothing of heat.* It climbs whenever frames are fast and
  retries a failed rung every 90 s, forever (`governor.ts`), so a laptop or phone that
  is warming up climbs, drops frames for a second and a half, steps down, and does it
  again every minute and a half. Every Apple GPU classes as `strong` (`device.ts`), so
  an iPhone opens at 512² and climbs; the phone layout does not touch the ladder; and
  the adapter is always asked for `high-performance`, which wakes the discrete GPU on
  dual-GPU laptops. Double the wait each time the same rung fails, cap a phone's climb
  at its starting rung, and consider a "cool / battery" output setting (low-power
  adapter, 30 steps, a capped top rung) that ships with its phone control.
- *The gamepad* is polled every 16 ms with no pad connected (`useGamepad.ts`); start
  the timer on `gamepadconnected`.

*Measure:* Chromium with `--disable-frame-rate-limit`, draws a second at 65 or fewer
while steps hold; frozen, readbacks a second near 0; `npm run rungs` with a simulated
machine whose capacity sinks, rung changes in ten minutes bounded.

### 14k. Smaller, for the same pass

- *The tablet remote* holds a slider for 50 ms on the tablet and another 50 ms on the
  display, both trailing (`RemoteControl.tsx`, `App.tsx`), then steps the value with
  no easing: at least 100 ms before anything moves. The pad throttles on the leading
  edge with no trailing send, so the end of a flick is dropped. Send the first change
  at once, keep one trailing send, and ease on the display. The cast's audio goes out
  at 30 Hz with no onsets or beat phase, so a network display locks its own kicks.
- *The mouse and fingers on the main canvas* use `mousemove` and `touchmove`, keeping
  the last position, so each frame gets one straight chord and a fast circle is
  flattened. `pointermove` with `getCoalescedEvents` for the path and
  `getPredictedEvents` for the tip (`npm run phone`, and `tools` on the Mac).
- *A check before the show.* Sound moving, projector found and fullscreen, screen
  kept awake, the cache complete, MIDI present, the GPU's rung: every signal exists,
  nothing gathers them. A panel on the desk, and its phone version, with a `panel`
  check.
- *A deploy mid-show can mix versions:* a projector window opened after a deploy runs
  the new build against the old show, and the cast hello carries no build version
  (`castProtocol.ts`). Inferred; send the version and warn on a mismatch.

### 14l. LiquidVisualizer.tsx is one 9,400-line component

**Suggested 2026-09-27 (a review the owner passed on); measured by line count only.** The
show's component holds the WebGPU renderer's lifecycle, the frame loop and its gates,
the pointer, touch and magnet handling, the cast and projector hooks and the debug
surface, in one file several threads edit at once. Split it into a renderer module
the loop drives (no React), hooks for the fingers and the wall, and a thin component,
one piece a PR, each with `lint`, `panel`, `desk`, `phone`, `wall` and the Mac's
`tools` and `qa` green. Not while the file is under active change in other threads.
`React.memo` on the panels only where a render count (the one 14f adds) shows a panel
rendering for props it does not use.

*Found 2026-09-28, not done:* a second reading of the code, this time for what a
stranger on the network, a stale callback or a knocked device does to a set: the show
server, the ear, the desk and the shell, read as the pass above was, against the plans
first. What it found in the recovery paths is `docs/stability-plan.md` S14–S21, the GPU
step's cost `docs/webgpu-plan.md` H2c, the report Worker's limits `docs/crash-plan.md`,
the room's lights, a load-in card and the show kit `docs/rig-plan.md` (R4, R5, R8), and
the checks and the build §19.

### 14m. Anyone on the venue's network can drive the show

**Read in the code** (`server/remote-server.js` unless named).

- The show key is four random digits (`SHOW_KEY`), about 13 bits, compared with `!==`,
  and a wrong `hello` only closes that socket: nothing counts failures or slows the next
  try. Through `npm run tunnel` the 9,000 keys fall in minutes.
- On the LAN it need not be guessed. `/remote-info.json` hands the key to any request
  without `x-forwarded-for` or `cf-connecting-ip` (`isLocalRequest`), which is every
  device on the venue's Wi-Fi, not only the machine `remoteProtocol.ts` says it is for.
  The socket checks no Origin or Host either, so a web page open on any phone in the
  room can reach `ws://<laptop>:3000/remote-ws`.
- With the key, a `hello` as `display` receives every phone's commands, and can push
  `state` and `cast` to the phones and to the network display on the wall, set the
  Art-Net `lights`, and toggle Record and Blackout.
- Frames are taken up to the `ws` default of 100 MiB (`new WebSocketServer({ server,
  path })`); the 512 KB limit is checked after the frame is buffered and made a string.
  A socket that never says hello is never closed, and nothing caps connections. A few
  large frames stop the Node process, and every phone, network display, OSC and Art-Net
  with it.
- A restart with the generated key answers every phone and network display `denied`,
  and `useRemoteLink.ts` stops retrying for good on that, though the server's comment
  says it is restartable mid-show.
- Art-Net in reads every universe but its own output (`packet.universe ===
  artnet.universe` is the only filter) into one `seen` map, so on a rig with four
  universes each mapped setting jumps between their values. A non-numeric `ARTNET_RATE`
  makes the rate `NaN`, and `setInterval(…, NaN)` sends every millisecond.

*Fix:* the key only to a loopback `req.socket.remoteAddress`, and an Origin check on the
upgrade; a longer key from `crypto.randomInt`, compared with `timingSafeEqual`, and an
address locked out after a few wrong hellos; a display key apart from the phones', so a
phone's key cannot take the display role; `maxPayload: 512 * 1024`, a 5 s deadline for
the hello and a cap per address; the generated key kept in a file beside the server, so
a restart keeps it; an input universe, and the `ARTNET_*` numbers validated. The phone's
join and the iPhone app's laptop remote (`appLink.ts`) must keep working.

Once the server has roles, a **guest key** is a small step (*proposed*): a key whose
socket may only drop, blow and finger, rate-limited, in the palette's dyes, onto a
chosen plate, with a Guests level and a kill on the desk and the phone. A singer's
tablet, a second projectionist, or at a party the audience's phones through a QR code
on a card.

*Measure:* extend `npm run remotemix`: a request from a LAN address gets no key; three
wrong keys lock the address out; a 1 MB frame is refused without the process growing; a
silent socket is closed at 5 s; a restart keeps the key and the phone rejoins; a guest
socket's `patch` is dropped.

### 14n. One malformed message can end the plate

**Read in the code; the chain was followed by hand, not run.** The display applies a
remote `patch` as it comes (`case 'patch': queuePatch(message.settings)` →
`updateSettings`, `App.tsx`): any key, of any type. `{"simResolution":"x"}` gives
`Math.round("x")`, `NaN`, in `resolveSimResolution` (`LiquidVisualizer.tsx`); `new
WebGPUFluid(device, NaN)` throws on `createTexture`, and the catch calls
`governor.failRung()`, which marks the rung failed forever (`governor.ts`). Each rung in
turn fails the same way, until the plate stands on "no WebGPU": a one-way door in the
sense of `docs/stability-plan.md`. A phone on an older build that sends a renamed or
retyped key does the same by accident. The OSC path already drops non-finite numbers
(`oscToMessage`'s `num()`); the socket does not. Two more doors of the kind:

- a MIDI map file's setting binding keeps any key and, for a key not in
  `LEARNABLE_BY_KEY`, its own `min` and `max` unchecked (`parseMidiMap`, `midi.ts`),
  where `parseSoundBindings` drops unknown keys;
- gestures: `dx`/`dy` sent as strings become `NaN` in the CPU velocity
  (`blowDirected`), and every distinct `drop.color` string becomes a key in `hexCache`
  (`constants.ts`), which never forgets one.

*Fix:* one `sanitizePatch` against the settings registry (known keys, the default's
`typeof`, finite numbers clamped to the setting's range), used by the socket, the MIDI
map loader and a loaded look alike; gestures typed as OSC's are; `hexCache` bounded.
*Measure:* a node check beside `npm run remotemix` that sends `simResolution: "x"`, a
`NaN`, an unknown key and a 1,000-character colour, and finds the settings, the
governor's ladder and the cache as they were.

### 14o. The song-ID Worker is open to anyone

**Read in the code.** `server/fingerprint-worker.js` answers any origin
(`Access-Control-Allow-Origin: *`) with no key and no rate limit, and its URL is built
into the public bundle (`VITE_FINGERPRINT_PROXY_URL`, `deploy.yml`). Anyone who reads
the bundle can identify songs on the owner's AudD or ACRCloud account, from a script or
from their own site. It also parses the whole multipart body (`request.formData()`)
before its 2 MB check. The report Worker already has what this one lacks
(`ALLOWED_ORIGINS`, a per-address limit in KV; `docs/crash-plan.md`).

*Fix:* the same origin list and per-address limit (per /64 on IPv6), a refusal on
`Content-Length` before parsing, and a daily ceiling that answers "busy" rather than
spending. The show's own origins (the site, the show server, the Mac app) stay allowed.
*Measure:* a node harness in the manner of `npm run report-worker`: a foreign origin
refused, the 31st request in an hour refused, a 3 MB body refused before `formData()`.

### 14p. Show night runs whatever merged last

**Read in the code.** `npm run show` is `npm run update && npm run remote`, and `update`
is `git pull origin main && npm install && npm run build`. `main` takes several
sessions' merges a day, each as soon as its checks are green (CLAUDE.md), and each
deploys to the site. So the laptop at soundcheck builds whatever landed an hour before,
much of it marked "not yet seen on the Mac" in the running order above, and the hosted
site can change under a show that is playing from it. 14k's mixed versions at the
projector are a symptom of this; this is the cause.

*Fix:* a `show-*` tag, cut when the owner has judged a build on the Mac; `npm run show`
checks out the newest tag unless asked for `main`, and prints which; one command to roll
back to the tag before; a Firebase channel that serves the tag, for a show played from
the site; the Mac app (§13 step 1) bundles a tag, not `main`. *Measure:* `npm run show`
in a scratch clone with a tag behind `main` builds the tag's tree; the cast hello's
version (14k) matches it.

### 14q. The room's lights do not follow the wall

**Read in the code** (the `lights` effect in `App.tsx`; `server/artnet.js`). Every
50 ms the show sends each layer's mean colour and `master = blackout ? 0 : min(1, fill ×
1.6)`: how much dye the plate holds. It does not see the Dimmer, Pacing's fades toward
black (which ride the flash-gain uniform, not a setting), the flash guard, the Mixer's
levels or the output gain. So in Light Show Night the pars stay up through a near-black
scene the wall has faded into, and Blackout cuts them at once while the wall fades over
a second. The colour is a mean, so a magenta-and-cyan plate lights the room grey, the
fault the roadmap names for `sceneSense`. The flash guard does not reach them (14r).

*Fix:* send the master the wall shows (dimmer, pacing gain, blackout's fade, the guard's
gain, the output gain), and the dominant colour rather than the mean, from the probe's
tiles (14r). Fixtures with places, and sACN, are rig-plan R8. *Measure:* a check on the
master the App sends, beside `npm run lights` (which checks the bytes): at Dimmer 0.2,
through a Pacing fade to black and a blackout's fade, the master follows the wall's
brightness within a frame; a two-colour plate sends one of its colours, not grey.

### 14r. The flash guard reads one number for the whole wall

**Read in the code.** `flashGuard.ts` watches the frame's mean luminance (`probeTiles`
folds every pixel into one sum, `wgsl/probe.ts`). The photosensitivity guidance it is
written against counts a flash over a quarter of the screen: a flash of 0.4 over a
quarter of the wall reads 0.1 as a mean, at the line, and a smaller patch never counts.
The separate rule for saturated red is not implemented, and nothing looks at
high-contrast patterns, of which Ferro Maze (a black labyrinth on a white table, 9d) is
the case. The room's lights (14q) are not guarded. And the probe divides an older
frame's sum by the current frame's pixel count (`probe.ts`), so after a pixel-ratio rung
change (1.5× to 1×) one reading is 2.25× too bright and then drops back, which the guard
counts as a flash.

*Fix, after 14i's decode to linear light:* keep the probe's per-workgroup partials as
tiles; luminance and a red ratio per tile, counted over quarter-wall windows; the pixel
count kept with its sum; the same gain on the Art-Net master. No control on the phone,
by design; the guard's line on the desk and the phone names the rule that is holding.
*Measure:* `npm run wall`'s traces with a quarter-wall flash of 0.4 at 5 Hz (counted), a
full-wall red flash (counted by the red rule) and a 1.5× to 1× rung change (not counted).

### 14s. The ear: the input picker, Safari's second song, and song ID

**Measured in headless Chromium on 2026-09-28 where it says so; the rest read in the
code.**

- *The input picker never changes the input.* `chooseAudioInput` (`App.tsx`) is
  memoised on `[audioSource]` alone, and calls the `handleSourceChange` of the render in
  which the source last changed, when `audioStream` was still `null` and `audioInputId`
  the old one. Measured with fake devices: picking Input 1 and then Input 2 made three
  `getUserMedia` calls, none with a `deviceId`, and all three tracks stayed live. The
  interface picked at soundcheck is not the one the show hears until a reload, and each
  pick leaves another microphone open. Hold the handler and the stream in refs, and pass
  the id.
- *On Safari and iOS, every song after the first is silence to the ear.* Without
  `captureStream`, `musicStream` hands back the one `MediaStreamDestination`'s stream;
  `startMusic`, `handleSourceChange` and `toggleMusic` stop `audioStream`'s tracks, and
  then the same ended stream is handed out again. Measured in Chromium with
  `captureStream` deleted: the analyser's source was live after the first shelf track
  and ended after the second; the track-end advance goes the same way. Inferred for
  Safari: that context is made in `oncanplay`, outside a gesture, and never resumed.
  Never stop the destination's own tracks; resume it from the play gesture.
- *Song ID can switch itself off for the session.* Its silence branch sets `busyRef` and
  awaits `finalizeListen` with no `finally` (`useMusicIntelligence.ts`), unlike the two
  branches beside it: one throw leaves identification, the local match and the song-end
  detector off. A failed `decodeAudioData` in `songMap.ts` and an error in `capturePcm`
  (`fingerprint.ts`) each leave an `AudioContext` open. (14h's shared busy flag is the
  same flag, hung by a request rather than a throw.)

*Measure:* a browser check with Chromium's fake devices (the second input is opened by
its id, the first one's track ends); the same with `captureStream` removed (the source
is live after the third track); `npm run music` with a `finalizeListen` that throws once
(identification runs again).

### 14t. The clock and the controller

**Read in the code.**

- *The beat clock can hold half tempo for good.* Locked at twice the period, an onset
  between beats has `k = Math.round(0.5) = 1` and an error of half the period, outside
  the 0.3 window: −0.08. The next, on the beat: +0.15. It gains 0.07 every two beats and
  never halves (`beatClock.ts`). A half-note intro at 150 bpm, then four on the floor,
  drives `musicPace` at 75 for the song, and sound learn's bars are eight beats long.
  This is the clock's own; §10 step 3's half tempo above 148 bpm is the bar grid's.
  Halve when most off-beat onsets land near half the period, and double the same way;
  a half-note intro in `npm run kicks`.
- *MIDI timecode's full-frame locates cannot arrive.* MIDI is opened with `sysex: false`
  (`useMidi.ts`), and a browser withholds SysEx without it, so the `0xF0` branch and
  `TimecodeReader.full` never run in the app. `README.md` says both are read, and
  `timecode.ts` counts on full frames for a backward shuttle; `npm run timecode` tests
  the reader and not the hook, which is why it is green. Ask for SysEx when timecode is
  chosen (it prompts), or say in the README that only quarter frames are read, and
  check the hook's path.
- *A controller's lights stay dark after a replug.* The LED cache is cleared on
  `[enabled, ports.output, map.name]`, and `onstatechange` only refreshes the ports and
  rewires the inputs. With the output on auto, a knocked cable or a power-cycled APC
  comes back dark and stays dark until each value changes. Clear the cache, and soft
  takeover, when an output connects. (§14's opening counts a MIDI replug as handled;
  that is the inputs.)
- *Continue starts the bar again.* `App.tsx` sends Start and Continue alike to
  `clockStart`, which resets the pulse count (`tempo.ts`), and Song Position Pointer
  (0xF2) is dropped by `parseMidi`: a DAW that continues mid-bar leaves the phase up to
  three quarters of a beat off. (Start and a clock dropout are 14e's.) 14-bit pairs and
  NRPN (CC 99/98/6/38) are not decoded either, so learn and auto-map bind the coarse
  byte or the parameter number.
- *The decks already know the bar* (*proposed*). Pioneer's Pro DJ Link (a CDJ's beat
  packets carry the beat within the bar and the tempo) and Denon's StageLinQ are on the
  network the show server already listens on for OSC and Art-Net. They give the true
  downbeat and tempo, which the ear gets wrong (half tempo above ~148, the one slow to
  come), and a track-load or on-air event that can stand in for fingerprinting at a new
  song. Ableton Link (§13 step 5) gives tempo and phase but not the track's bar one. A
  `server/prolink.js` beside `artnet.js`, into the beat clock as an outside source with
  14e's lead; "Decks" as a tempo source in the Sound sheet, on the phone too. The
  protocols are documented by their users, not their makers, which is the risk.

*Measure:* `npm run kicks` with a half-note intro (the tempo is 150 by the chorus);
`npm run timecode` through the hook with a SysEx full frame; a reconnected output is
sent every lit pad again; Continue after a Song Position of bar 3, beat 2 lands there.

### 14u. The desk and the shell

**Measured in headless Chromium at 1440×900 on 2026-09-28 where it says so; the rest
read in the code.**

- *The preview frame stops following the hole.* `usePreviewFrame.ts` observes
  `ref.current` once per `[enabled]`, and the desk stays up across Esc and a Perform ↔
  Design switch, so a new hole is never observed. Measured: after clean screen and Esc
  the frame stays at 0,0,1440,900 while the hole is at 288,104,824,706; a click on the
  preview lands on the hole, and every tool does nothing until a resize. After a switch,
  clean screen leaves the plate as the 824×706 box in a black window, wrong exactly when
  the laptop's screen is the show. A callback ref that observes what it is attached to.
- *Evolve wanders around the look before.* Only `applyPreset` and `updateSettings` move
  `driftAnchor` or drop `driftGlide` keys; `fadeSettingsTo` (Go), `revertLook` (Back),
  the sequencer's stages and `rideSetting` (a MIDI fader) do not. `driftLook` holds each
  dial within 20 % of its travel of the anchor, and skips a dial the anchor has at 0.
  Measured with the real `driftLook` over 100 drifts: 1,496 of 1,560 preset-to-preset
  Gos pull a dial more than a quarter of its travel off the new look, or switch on a
  dial it had off (stardust-collapse to poster-1969: nine switched on, ten pulled);
  re-anchored at the Go, none. A fader is also fought by a glide in flight. Re-anchor at
  the end of a look fade, and treat a ride as a hand's write.
- *⌘S never saves over the open look.* The keyboard's ⌘S opens the save sheet
  (`setShowSave(true)`) where the desk's button calls `saveLook()`, and it matches before
  the shifted branch, so ⇧⌘S never runs (`App.tsx`). Measured: the button wrote over
  "Mine"; ⌘S offered "Mine copy".
- *A sequence in the set list reads "missing" on every load.* The `cues` memo reads
  `sequencerRef.current`, which is assigned further down the same render, and its
  dependencies do not change on load. Go still plays it; the list says `slow-build · seq
  · missing`. Measured.
- *One storage read can stop the app starting.* `localStorage.getItem(
  'chromaglass-palette-lock')` in a `useState` initialiser has no `try`, where every
  read around it has one; with the site's storage blocked (Chrome with the site's
  cookies blocked, some private windows) it is the one throw, and Boot says "ChromaGlass
  could not start". Measured.
- *Two hands on the phone's clean screen bring the controls back.* The long press's
  `down` overwrites its timer without clearing it (`App.tsx`), so the first finger's
  700 ms can no longer be cancelled once a second finger lands.
- *Renders nobody needs* (beside 14f): `useImperativeHandle` in `LiquidVisualizer.tsx`
  has no dependencies, so its handle of about seventy methods is rebuilt on every App
  render (30 a second through a look fade); `<audio onTimeUpdate>` re-renders the App
  about four times a second while a song plays; `getLiveEngineStatus` is passed inline,
  so Settings' 1 s tick is re-armed by every App render and does not tick while the App
  renders fast.
- *After 14f's sound half (#211):* the cast's feed now listens to the ear itself, but
  `useSongChange` still has no dependency list, so the song-gap detector is sampled at
  the App's render rate, now about 11 a second (it was about 70). A tenth of a second
  may be fine enough for a gap between songs; if it is not, it wants the ear's
  `onReading`, as the cast's feed has.

*Measure:* `npm run desk` and `npm run layout` for the frame after Esc and after a
switch (the frame is the hole; a click on the preview reaches the plate); a node check
over `driftLook` for the 1,560 pairs, re-anchored; `npm run setlist` for the sequence's
name; `npm run phone` for two fingers; a load with storage blocked in `npm run panel`.

### 14v. The show takes a long time to load on the web

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

- **Shipped:** the opening's pipelines are built three at a time (`?lanes=N` to time
  other counts, `?lanes=1` the old way); the built page asks for the app's chunks
  alongside the entry (`vite.config.ts`), but not for the remote or a cast; and
  `main.tsx` asks for the GPU before it imports the app (`gpu/device.ts`).
  `npm run loadtime` holds the order (Brotli, 100 ms round trips, 10 Mb/s): the
  app's chunks asked at 0.12 s, before the entry is in (was 0.30 s, after it); the
  GPU asked at 0.41 s (was 0.88 s); in a cloud session with `PW_WEBGPU=1`, the
  device given at 0.42 s (was 0.95 s) and the first shader handed over at 0.81 s
  (was 0.96 s). On the Mac (`npm run startup`, cold), two at a time built the
  fifty in 10.86 s against 11.46, 13.57 and 11.83 s one at a time: the
  forty-nine after the first (which waits on Chromium starting the GPU) a fifth
  faster, 7.17 s against 8.93 and 9.17 s, with no frame gap over 0.67 s; three at
  a time built them in 8.76 s, the plate stepping at 9.52 s (was 12.15, 17.62 and
  12.49 s), with no frame gap over 0.58 s (run 37174580232).
- `npm run loadtime` runs in Measure's browser part (`checks.yml`, "The load").
- *The plate is black while the opening compiles.* Seconds on a cold cache. A
  starting picture (the look's palette, still) would say the show is coming; it
  changes the first frame, so it is the owner's call.
- **Shipped:** the opening asks for its render pipelines first, the display first of
  all (`gpu/prepare.ts`): with three in flight it had been asked forty-fifth, and the
  last 1.34 s of the opening was the display compiling alone with the other lanes dry
  (run 37174580232, "slowest ahead"). And two solver kernels that did what another
  did are gone: `pressureClear` was `mgZero` with its count read off the Sim, and
  `mgProlong0` was `mgProlong` but for level 0's packed index (now `A.a.y`): one fewer
  compile in every opening on a thin gap (every look, since 18a-every), two in one
  opening with Thin Gap off. Each build ahead now records its compile and its first
  use apart (`Prepared.raw`), and `npm run startup` prints them ("each build ahead
  from its own ask"), to say whether the next cut is fewer kernels or waiting once for
  all the first uses rather than one at a time. Its first Mac run (37190509856, with
  #248's thin gap now in every opening) answered: built ahead 0.54 → 11.24 s, first
  step 11.54 s, and 6.31 s of the lanes' time was first uses, 6.18 s of it the
  display's, the derive's and the air's first draws, 2.06 s each and all at once,
  every lane idle while the GPU warmed. So a first use is now handed to the GPU and
  not waited for in its lane; the opening waits once for all of them at the end
  (`useWait`, printed by `startup`). On the next Mac run (37192204661): first uses
  1.17 s of lane time (was 6.31), the one wait at the end 0.00 s, built ahead 0.49 →
  10.16 s and first step 10.69 s (was 11.54 s on this PR's first run, the same
  opening), no frame gap over 0.62 s. The lanes now spend 27.4 of their 29 s
  compiling, so what is left is the compiles themselves: 48 of them, the first three
  under Chromium's 2.9 s GPU start.
- *Fewer compiles: kernels that run back to back fused.* With the lanes busy, the
  opening is the sum of its compiles over three: 0.33 s median each with three in
  flight. The solver's small kernels are each a full compile however little they do
  (most are 4–6 kB of source, the shared Sim struct and a few lines); pairs that run
  one after the other on the same cells (`decayDye` and `decayVel`, the multigrid's
  restrict and zero) could be one dispatch writing both, which is fewer compiles and
  fewer dispatches a step. Each fusion changes the solver's step, so each wants
  `physics`, `thingap` and the Mac's frame time, not just `startup`.
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
- *Fewer or smaller opening pipelines.* `plate/display` alone is 1.5–2.2 s cold, and
  every look opens on the same forty-three; a display shader split by what the look
  turns on, or kernels that share one pipeline, would cut the compile itself. Measure
  with `npm run startup`'s "built ahead" line.
- *More lanes.* All at once held the page for 8.6 s (`gpu/prepare.ts`); three is
  the default; four or more may still hold under `startup`'s 2 s gap.
- *The first compile waits on Chromium starting the GPU* (2.5–3.7 s of the
  opening, `fluid/fill`), at about a second after load on CI's Mac whenever the
  device is asked for: asking at boot did not move it there. Whether it moves on
  the web, where the app's download takes longer, is unmeasured.

## 15. Every tool on every liquid

Asked 2026-09-27 ("Shouldn't blowing and finger also move around the ferrofluid?",
then "look at the liquid and tools interactions across all of them"). Read from the
code, with the velocity numbers measured in the lab. The whole table is in
`docs/tool-by-liquid.md`. What it found, by what a
performer would notice first:

### 15a. Only the Dropper lays the bottle's liquid (shipped)

**Shipped** (#201): every laying tool lays the bottle's liquid (`npm run bottles`); the Splat line's "following the hand" was fixed in #214. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 15b. A tool's push lasts one step (why Blow and Finger barely move anything)

Every liquid rides one velocity field, which is held to `MAX_SPEED` 0.002
(`src/gpu/fluid.ts`, `decayVel`). The idle plate already runs at that limit. A
tool's velocity folds in before the step, carries the liquid once, and the clamp
then cuts it back to idle. The comments in `fingerDrag` and `blowAir` say the
projection removes the push. In the lab, the clamp accounts for about three times as
much as the projection does. Lab, 256², fingerDrag's own velocity dragged 30 cells
across a disc of dye and ferrofluid over 60 steps (centroid shift, cells):

| | dye | ferrofluid |
|---|---|---|
| left alone | 0.00 | 0.00 |
| today | 0.17 | 0.20 |
| clamp lifted | 0.56 | 0.63 |
| at the hand's own speed, no swirl, clamp on | 0.87 | 1.09 |

Only liquids with a hand-written carry actually move under a tool: the dye (Finger's
`carryDye`, Press's `squeezeOut`) and the oil (Finger's `carryMix`). A likely fix is
to feed a hand's velocity into the lasting current (`cur`, capped at 0.75 of a cell a
step, which remembers for about a hundred steps) instead of the clamped field. That
would carry every field alike. It changes how every tool feels, so it goes to the owner
first. Blow and Finger on the ferrofluid are 9n, in the ferrofluid thread, which has
these numbers.

### 15c. Blow's wind erases colour rather than pushing it (shipped)

**Shipped** (#215): Blow's wind carries the colour and the oil the way the hand went, rather than erasing them (`npm run wind`, `npm run tools`). Its follow-ups are 15f and 15g. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

**Fixed after it shipped (2026-10-04): a drag began with a straw.** Main's deploy
after #230 went red on `tools`' "keeps it rather than erasing it": a Blow drawn
across a pool of 229 left 175, with 5 straw steps among its 49 wind steps. A press
has no move before it, so "no move in 150 ms" made every step between the press
and the first reported move a straw step, and the straw's bubble takes the dye
under it off the plate while it sits there (`airExclude`; the plate's budget
servo returns it later). At the Mac runner's 10–30 frames a second that was 2 to
7 straw steps a stroke, and on a slow frame rate a moving hand whose moves came a
frame apart read as held too. The press now counts as a move, and the straw needs
the hand held both 150 ms and three frames with no move (`BLOW_STRAW_FRAMES`).
`tools` asks that the stroke blows no straw before its first move
(`blowSteps.strawFirst`), and prints the stroke's straw steps under "keeps it".

**Changed after it shipped (2026-10-04): the push was judged against what came after it.**
Main's deploy of 5505a2a (run 37196539858) went red on `tools`' "pushes the colour
along": the wind moved the pool's middle +0.70% of the plate toward B, against
+0.56% to beat, all of it from the window left alone *after* the stroke (+0.39%;
the window before read -0.00%). With the ambient seeder off (#249) the window before
read -0.08% to +0.00% on all five runs that reached the line, and the window after
+0.24% to +0.39%, toward B every time. And since Thin Gap is on in every look
(18a-every) the stroke's own push is smaller (+0.70% to +2.31% on main's code, was +0.76% to +4.15%), so the
drift is a larger share. Whether it is the wind's liquid still going is not settled:
split in halves on #254's first run it read +0.30% then +0.16% (no dying away within
the thin gap's tenth of a second), and charged at the second half's rate the wind's
+0.64% met +0.69%. Charging it or not is a guess either way, and not charging it
would pass a wind that pushed nothing on a plate that starts drifting with the
stroke. So the wind is now drawn both ways, out to the right and out to the left
from a fresh pool in the plate's middle each time, and each has to beat the window
before it by 0.002: a drift the wind did not make helps one stroke as much as it
holds back the other, and from the middle a drift toward the middle moves neither. The windows after are
printed in halves for both; if they turn round with the wind, the drift is the
wind's. On #254's Mac run (37200639755): out to the right +2.33% against +0.20% to
beat, out to the left +1.48%, both with -0.00% before; after it +0.16% then +0.14%
right and +0.26% then +0.15% left, each toward its own stroke's end, so the drift
after does turn round with the wind. Not yet seen: the line failing on a wind with
its carry turned off.

### 15g. Blow as air on a thin film, not a carry (replaces 15c's shortcut)

The owner's standing rule (2026-09-28): build from the chemistry and physics of the
liquids, not from a picture of their result. 15c is a shortcut by that rule, and so
are the carries it copied. The wind moves the colour, the oil and the ferrofluid
directly, a take from under the hand and a put a hop ahead (`blowDye`, `blowOil`,
`blowCarry`), because the flow cannot carry them: a tool's push is cut back to idle
at the end of the step it was added in (15b). The Finger (`carryDye`, `carryMix`,
`fingerCarry`) and the Press (`pressDye`, `pressMix`) do the same. It keeps the
colour and moves it the right way, and it is not what air on a liquid does.

What air blown on a thin layer does, and what the plate would need:

- **Shear.** Air moving over the surface drags it with a tangential stress, about
  tau = 1/2 rho_air C_f U^2 along the jet (C_f a few thousandths for a wall jet).
  In a layer this thin the flow is viscous (lubrication), so the stress drives a
  Couette profile: the surface moves at tau h / mu and the depth-mean at
  tau h / (2 mu), in proportion to the depth. A deep pool moves more than a thin
  film under the same breath, and a thick oil (glycerine) less than water. The
  plate's depth-mean velocity should take tau h / (2 mu) as a force that lasts as
  long as the breath does, not a disc of velocity that the clamp removes.
- **Pressure.** Where the jet meets the surface it presses a dimple, about
  1/2 rho_air U^2 at the stagnation point, which pushes liquid out from under the
  nozzle (a Poiseuille flow, -h^2 grad p / (3 mu) depth-mean). That is a held
  puff's ring, and it is the Press's physics at a smaller pressure: it belongs in
  the gap field the Press already squeezes (`squeeze`, `applySquish`), not in a
  ring map.
- **The film.** The layer's thickness moves with its own flow,
  dh/dt + div(h u) = 0: it thins where the air hits and piles up in a bow wave
  where the wind stops. Colour, oil and ferrofluid are then carried by that one
  flow, conserved by the advection, and the carries can go.

Depends on 15b: the tool's force has to reach a flow that remembers it (the lasting
current `cur`, or the clamp lifted for forced flow), which changes how every tool
feels, so it goes to the owner first. When it lands, `npm run wind` is the check:
with the carries deleted, the colour kept and moved along by the flow alone, and the
oil with it, against the same bars. Then the same for the Finger (a solid dragged
through the layer: no-slip on the finger, the wake behind it) and the Press
(squeeze flow from the gap, which the solver half models already).

### 15f. Found with 15c

- The Finger carries the oil (`carryMix`) whenever the dye mirror is current, and
  a carry with no colour under it never marks the mirror spent. So a Finger over a
  body with no colour under it carries the oil every step at a share sized for one
  carry a reading. The Press (15d) and now the Blow keep the oil on its own clock
  (`oilPressAfter`); the Finger should too.
- The Press's ring (`pressDye`) keeps 99.4% of a pool of colour a puff blows out over
  30 readings, not all of it: a nearest-cell gather does not tile a small ring
  exactly, and the counted stretch that makes a flat plate exact does not on an
  uneven one. Small next to the 21% the eraser lost, but a ring that splits each
  palm cell exactly among the cells that read it would keep all of it.
- A remote hand's Blow (performGesture: the phone as the laptop's remote, a pen, OSC,
  a replayed take) goes through the same `blowWind`, but no check drives it through
  the app: `npm run wind` runs the functions it calls, and `npm run tools` only the
  mouse. A gesture sent through the remote's link in `tools` would close it.

### 15d. Press moves the colour out of an oil body but leaves the oil, and leaves the ferrofluid

`squeezeOut` carried the dye into a ring and nothing else. With Oil Bodies on, a
press took the oil's colour out of its body, which is what the Finger did before
`carryMix`. The ferrofluid under a palm doesn't move either.

**The oil: shipped.** A press takes the oil the way it takes the dye, the same share
of every cell under the palm, and puts it down on the dye's ring (the palm's rim to
1.7 palms out), area for area (`pressMix`, the other mode of `mixCarry`); the dye's
half (`pressDye`) now lands each cell's colour by the same map, straight out, where it
used to spread it evenly round the whole ring, which put half of a palm-edge press's
colour in the water across the ring from its oil. Both live in `src/lib/pressRing.ts`,
which the app and the lab share. What would land off the plate is not taken, oil or
colour. The oil is pressed once a dye reading on its own clock, so a clear body is
pressed at the dye's rate. `npm run pressoil` (lab, with the app's own palm, a quarter
of the plate across) 11/11: the oil kept to 0.4% of what moved in the middle, off it
and in a corner; every palm cell at exactly 0.4^6; the ring gaining what the palm lost
band by band; one press of each half on a body's edge landing the same amounts in the
same cells (the old even ring: 454 of 908 on the far side, in the water); each palm
cell giving up the same share of colour as of oil; and in a corner all the colour
taken landing (780.0 of 780.0), none taken from the 2225 palm cells with nowhere to go. A first
cut with the Finger's cone and a hop lost 27% of the oil moved in a corner and landed a
fifth of it back under the palm. `npm run bottles` (Mac) asks that the app's Press,
held and replayed, reaches it, and only with Oil Bodies on. The phone's Press is the
same `squeezeOut`. The straight-out dye is a change of look on every plate: to be
judged on the Mac (`docs/judging.md` §18). The only app check of the dye ring's shape
is `npm run press`, which is not in CI and sets its settings by writing into the
debug hook's copy (the pattern `depth` had); worth bringing into the tools shard.

**The ferrofluid: shipped under Thin Gap.** A press greyed it. The flow carried the
ferrofluid by area (the flux form in `phaseAdvect`), so under a palm the glass's
outflow took a share of every cell, and a pool stayed the size it was and went grey:
its fullest cell fell from 0.96 to 0.48 with Thin Gap on and to 0.67 without (lab, a
palm pressing the gap to a sixth, ten steps in). A real pool between two glasses keeps its volume:
pressed, it gets thinner and wider and stays full. A flat take out to the palm's rim,
as the oil's (`pressMix`), would have been the same fault by hand: it takes a share of
every cell too. So with Thin Gap on, the ferrofluid moves as a volume, c·h, on the
thin solve's own face fluxes, and each cell divides by its gap after (`phaseAdvect`,
`phaseGapSeen`). `npm run ferropress` (lab, 7 checks): pressed over twenty steps to a
sixth of the gap, the middle of a pool held to 0.6% (0.955 → 0.961, the check allows
3%; it is a stagnation point), where carried by area the same middle fell to 0.155 at
twenty steps; its volume kept to 0.13% while the cells
it fills grew 2.5 times; and after the lift it matches a pool the glass never touched
to 0.006 in every ring. Two cuts on the way: putting the glass's
part back as c times the gap's change along the path kept a pool full but grew it 7%
a press and lift; carrying the volume on the cells' filtered velocities emptied the middle to
0.53, because that flux carried 18% more out of it than the glass displaced. Only the
solve's own face flux (the mean of two cells' h·u plus the second difference of
M_f·ΔP) keeps both.

And the gap's drag takes the ferrofluid's own viscosity, by share (`hsPrep`,
`FERRO_NU`, 5 mm²/s, a light hydrocarbon ferrofluid's). Which way a front fingers then
follows the two liquids (Saffman–Taylor): on the default plate (Thickness 0.45, a light
oil of 22 mm²/s) the ferrofluid is the thinner, so a press pushing it out into the oil
is the unstable direction, and a bumpy pool's outline keeps more of its bumps (its
spread over its radius 0.023 → 0.013 against 0.009 for an even pair, `ferropress`
§5); in water it is the thicker, the press rounds it a little more (0.008), and the
lift is the unstable one. The same drag sets how fast the ferrofluid answers any
body force under Thin Gap, the magnet's included: about 4.4 times faster than before
(its drag is 0.22 of the default oil's), in any clear liquid since 18a-2 (before it,
the pull itself scaled with the clear liquid's viscosity, so in water the ferrofluid
answered about 5 times slower and in glycerine far faster; now only the liquid it has
to push aside slows it). That is the real liquid's answer, not a change to the magnet's code; the
owner's eye on it is in judging §23. The
phone's Press is the same press on the same solver, and Thin Gap is on its settings
sheet. Judged on the Mac: `docs/judging.md` §23.

*Open, found building it:*
- **With Thin Gap off a press still greys the ferrofluid.** The old solver's flow cannot
  carry a press (15b), and dividing by the gap there piled twelve times a pool's volume
  under the palm (lab). The press moves to Thin Gap ("Press draws liquid back on lift",
  18a-3), which is on in every look since #248, so only a look turned back to the old
  plate shows this now.
- **The glass flattens the spikes.** A Rosensweig spike stands from a free surface; under
  a palm pressed to a sixth of the gap there is no room for one, and the field there
  makes a flat labyrinth instead. The spikes (`spikes.ts`, `phaseMu`'s wells) do not
  know the gap. For the standing domes (9t), whose thickness field is where a cap by the
  gap belongs.
- **The labyrinth's scale follows the gap.** In a Hele-Shaw cell the labyrinth's period
  goes as the gap times an exponential in the inverse magnetic Bond number (2M²h/σ,
  Langer, Goldstein and Jackson 1992), so a press (a sixth of the gap) should melt the
  maze under the palm into a round pool and the lift should bring it back. The maze's
  period is `MAZE_PERIOD` wherever the glass is.
- **The lift's fingers do not show.** In water (the ferrofluid five times thicker) the
  lift is the unstable direction, but the Cahn–Hilliard rounding takes a bumpy edge
  back faster than the lift grows it (`ferropress` prints 0.024 for both). The
  interface's tension lives in the separation, not in the flow's pressure, so the
  fingers' scale is not Saffman–Taylor's own (π·b/√Ca); a capillary pressure jump in
  the thin solve would make it so.
- **The separation conserves area, not volume.** `phaseCH`, `phaseRelax` and
  `phaseSeparate` move the share between cells of different gaps as if they were equal:
  a full pool's edge sitting across a palm's rim gained 1.6% volume in forty steps held
  (lab, with the first cut's excess). Small with the solve's own flux; worth a c·h form
  once the glass moves the ferrofluid often.

*Found 2026-09-27, not done:* **a press can still make dye.** The dye's half of
`squeezeOut` takes a share of the disc as a GPU multiply and puts into the ring the
share the CPU mirror read, a frame or more earlier. The squeeze film is pushing the
dye out meanwhile, so the ring can get more than the disc gave (#158: 90 → 285
against −12 on one deploy). #158 subtracted the mirror's amounts instead; that is not
adopted: bilinearly spread over the finer grid it clamps at zero along every thread
finer than a mirror cell, so it makes dye a new way and erases threads the multiply
kept 40% of, a change of look. The fix that makes both halves see the same dye is to
do the dye's move on the GPU too, as the oil's now is (the map is the same one). #158's other two pieces are
in: `depth` sets its curve through the app's setter, and `tools` prints the whole
plate across the Blow.

### 15e. The liquids' own forces are measured only on a stand-in plate

Soap, milk, silicone and glycerine push the plate through the same clamped velocity
(`liquidPhase.apply`). `npm run liquids` measures them on a 96² stand-in, never on
the GPU solver, so whether glycerine "crawls" on the real plate is unmeasured. Also
minor, in `performGesture`: a remote Finger is half as strong as the mouse's, and a
remote Blow never makes a straw bubble.

### 15h. The Comb: marbling's rake, as a tool (proposed 2026-09-28)

Marbling is one of this plan's three reference columns (5.6 % of pixels on a hard edge
and a contrast of 6.5, against our 2.4 % and 0.8), and its structure comes from a rake
drawn through the colour: the nonpareil, the chevron, the bouquet. There are nine tools
and no comb (`DESK_TOOLS`, `desk/tools.ts`). 15b found that only a hand-written,
conserving carry actually moves liquid under a tool, and 9n (#206) and 15d (#210) have
built that carry for the ferrofluid and the oil. A Comb is N parallel carries a stroke,
on the dye, the oil bodies and the ferrofluid alike, with the tine count and spacing on
Tool Amount; a second pass at right angles makes the chevron. On the phone each finger
is a rake, and OSC gets `/comb`. *Measure:* a lab check in the manner of
`npm run ferrohands` (N parallel bands moved a stroke, mass exact), and
`npm run detail`'s hard-edge share after a two-way comb against the Marbling column.

## 16. Many plates: each projector its own source (rig-plan R1)

Asked for on 2026-09-27 ("Let's build multi-plate next"), after the Mixer's steps 1–5.
`docs/rig-plan.md` has the why (a light show was several projectors, each its own
source, beams adding on the screen); this is the running order.

**What there is today** (read from the code, 2026-09-27). Two solvers at most:
`layerCount` is clamped to 1..2 (`LiquidVisualizer.tsx`, the layer effect), one
`WebGPUFluid` per layer, the front plate `fluidsRef[0]` and the back plate
`fluidsRef[1]`, drawn together in one plate pass. The two share one look: each frame's
settings fold into `patch.global` for the picture and `patch.layer(i)` for each solver
(`lib/sceneMap.ts`), and `patch.layer(i)` differs from the global only by a scene
mapping aimed at that layer. The back plate is otherwise the front's twin, turned the
other way, slowed by Background Loop and thrown by Layer Scale Variety. Every
projector (`Surface` in `lib/outputConfig.ts`, up to sixteen) samples the one finished
frame (`gpu/output.ts` binds one `scene` texture), blended over, not added. The grid is
one size for every layer (`resolveSimResolution` from the quality ladder,
`lib/platform.ts`), and the plate's bind group and shader are written for two layers
(`gpu/plate.ts`, `wgsl/plate.ts`'s one "Layer 1" block). The lab runs one solver.

**The decision rig-plan leaves open, taken here as the default:** up to **four**
plates, and with three or four each runs one rung of the ladder below the grid a
single plate gets (512 becomes 384 on a local GPU), so four plates cost about what two
do now. The owner can say otherwise; the ladder is one table.

Each step ships its phone version in the same PR (the rule) and one PR each:

- **16a · The back plate gets its own look. Shipped (#231).** A look can be sent to the
  back plate alone: To Back Plate under Go on the desk, a Whole plate / Back plate
  switch at the top of the phone's looks sheet (it goes back to Whole plate once a look
  is sent), and two MIDI actions (Go to Back Plate, Back Plate Follows Front). The
  back plate's solver steps with the look's own settings (every `PER_LAYER` key,
  folded in as plate 1's base in `PatchBay.fold`, so the look's patches still ride
  it), faded like a Go (`lib/backLook.ts`). It pours the look's dyes, styles and
  liquids at every automatic pour and a hand's, and a handover lays the look on it.
  How the plates are drawn and lit stays the front's. A Go or a cut on the front
  leaves a back plate with its own look alone; Follow the front fades it back, keeping
  the plate on the stage until it lands. The Mixer's Back Plate row names the look,
  and the layer pickers offer the back plate while it has one. Check: `npm run
  backplate` (33, in Measure; red under sixteen mutations) and a phone check (the
  switch, the names, the front untouched). The lab with two solvers moves to 16d,
  where the lab has to hold N of them; the Mac judges the pair (`docs/judging.md`).
  Found while building it, not done:
  - *A render lets the back look go.* A render lays its look on both plates from its
    seed, so the back plate follows the front from the render's start, and after it.
    Rendering a show with a back look would mean carrying the back look into the
    render's recipe.
  - *Cast and network displays show the front's twin.* `CastState` carries the
    settings, not the back look, so a receiver's second plate is the front's.
  - *The remote has no To Back Plate*, and its Mixer's back row names nothing.
  - *Back undoes the last front Go only*, and a set list's cue-next counts from the
    live item, not from a look sent to the back. Both are as intended for now; say so
    in the Guide or change them when the set list learns about plates.
  - *On a one-plate front look, Follow the front drops the plate when the fade lands*
    (a cut of the back plate's picture at the end rather than the start). Fading
    `backLevel` out with it would make that a fade.
- **16b · A projector picks its source. Shipped (#226).** A mapped surface (Settings,
  Mapping; on the phone More, Settings, Mapping, the picker a thumb's size) shows the
  whole wall (today's frame, and the default, so every saved rig looks as it did), the
  front plate alone, the back plate alone or the film alone. Each source a surface
  asks for is the plate's display pass drawn again into its own texture with its own
  uniforms (`WebGPUPlate.drawSource`): the frame's settings with the Mixer's other rows
  at 0 (`lib/plateSources.ts`), so a source is graded, blended and dimmed as its row is
  on the wall, and a blackout or the flash guard reaches every projector. The logo goes
  out on the front plate's projector only, so two projectors do not carry two. Only the
  full-screen display is repeated; the solvers, the pack and the derive are the wall's.
  Nothing is drawn for a source no enabled surface shows. Two things found in review and
  fixed with it: the film was tinted and bent by the front plate's dye at full strength
  whatever the front plate's level, which printed the liquid into the film-alone
  projector (171 at worst on the lab plate; now by the front plate's level, so a faded
  front plate also stops tinting the film on the wall), and a film row on Multiply was
  a black film projector (it multiplies what is under it, and under the film alone is
  black; there it is drawn Add, the frame itself). Checks: `npm run map` (42: the
  routing from each slot's number through the shader's branch and binding to the
  texture bound there, the rows each source leaves out against a base where every
  setting has its own value, Multiply on the film), `npm run mixer` section 8 (8: each
  source exactly the wall with the other rows at 0, drawn in the wall's frame, and the
  wall untouched; the film alone the same with and without dye; red when a source reads
  the wall's uniforms and on the old film tint), a phone check (the picker from the
  phone, and the show's config holding the pick), and `wall` on the Mac (on Classic, two
  projectors side by side: each source against the wall with its other rows at 0 in the
  same frame, and each source's pass timed).
  Found while building it, not done:
  - *A source has no post effects and no closeup camera.* The wall's chain (bloom,
    the photographic presets' lens) runs once, on the wall; a source is the plate as
    the display pass draws it. Running the chain per source doubles its cost; worth
    it only if a rig asks.
  - *The logo stays up in a blackout* on the wall and on the front plate's projector:
    it is laid over the dimmer (`finishLight`), as it always was on the wall.
  - *Every network display draws every source its surfaces ask for*, since the cast
    state carries the output config and a receiver runs this same frame: a receiver on
    a weak GPU pays for the sources a laptop's projectors asked for. A receiver could
    be told which surfaces are its own.
  - *The remote cannot pick a source*, only the laptop and the phone's own Settings.
  - *Found on this PR's first Mac run:* `wall` §7c was measuring a moment of the plate.
    On Classic the back plate is laid empty (`layPlate` seeds only the front), so the
    back source and its reference were both black and the front source was the wall to
    0.001; and with no film loaded the film alone was black. It now runs on Fillmore
    East (its back plate laid with its own wash) with the browser's fake camera as the
    film, and asks that a film is playing before it measures. The same run's "every
    refresh's own timestamp was believed" is the Mac stamping refreshes up to 2.4 ms
    ahead; the draw gate's fix from #218 is ported here (it no-ops once #218 lands).
  - *What a source costs is not measured yet.* `wall` times each source's pass
    (`plate front`, `plate back`, `plate film` against `plate`) where the GPU has
    timestamp queries, and the Mac runner's has none: #226's green run printed "skip
    each source's cost". Each is the whole display pass again at the canvas's size.
    It needs reading on the owner's Mac (`chromaglassDebug()`, docs/judging.md §21)
    before 16d (four plates), which is where a budget has to be.
- **16c · Beams add, and the seam goes. Shipped (#232).** A mapped surface's Light is
  Over (laid over what is under it by its opacity, as every surface was, and the
  default, so a stored rig looks as it did) or Add, a beam (Settings, Mapping; on the
  phone More, Settings, Mapping). Two beams crossing add whole: the overlap a light
  show was played on. Where they are one picture carried by two projectors (the same
  source, showing the same point of it there, tiles lined up with an overlap) they are
  edge-blended: across the overlap each gives the share of how far inside it the point
  is, so the two sum to the picture whatever the overlap's width, with no bright seam
  and no dark one, and a feather shapes only the edges no other tile covers. One
  pipeline, premultiplied colour with the colour clamped first, so over is the old
  pass byte for byte at every gain, and the quads stay one draw. Check: `npm run
  beams` (8, the projector's pass on software WebGPU with pictures made to order:
  over byte for byte against a second lab built with the old pass at gains 1 to 3;
  two sources summed; tiles sharing by depth, read with one at half so the shares
  show, across and stacked, against a plain crossfade and against one laid over;
  crossing beams of one picture summed; all four feathered edges; a beam over a
  lit surface and at gain 2; red on six broken shaders: no clamp, no flip, depth
  blind to height, no shares, shares for any point, the alpha factor), `map` (44:
  the stored default, the blend in its slot, a stale slot cleared), and the phone
  check (Over before, Add after, in the button and the show's config). The pass
  itself needs no Mac: it reads its pictures, not the plate.
  Found while building it, not done:
  - *Two projectors of one picture stacked for brightness are blended, not doubled*
    (the same point of the same source is one picture). A stacked pair would need its
    own switch.
  - *The blend is in the canvas's values*, which is light for one projector carrying
    every surface. Two physical projectors each with its own gamma would want the
    shares in linear light.
  - *Tiles are lined up by hand, by corners* (R4 is placing a projector by its centre,
    zoom and turn); the blend allows two texels of slack.
  - *Crossing beams over 1 clip* in the canvas: two bright pictures crossing are
    white where they add past it.
- **16d · Up to four plates.** `layerCount` to four, the plate's bind group and shader
  from two layers to N, the ladder's rung per plate as above, the governor told how
  many plates it is carrying. Check: `startup` and the frame time on the Mac with four
  (no stop on the opening, no pipeline built on a frame), and the lab with four.
- **16e · A row per plate in the Mixer** (the Mixer's step 6): each plate its own row,
  level and grade, reached from the desk, Settings, the phone and the remote.

Not in this batch: R4 (placing a projector by its centre, zoom and turn) and R5 (a rig
as a document the cue list points at). Slides as a source wait on `docs/slide-plan.md`.


## 17. Hear the set ahead, from files

Not started. Came out of asking what a streaming service's API could add
(2026-09-27): the one idea worth having was the show knowing each song before it
plays, and it needs no service at all, only the files.

Live, the show can only react. A song map (sections, energy, pitch) is made by
recording the song's first play (`ListenRecorder` in `src/lib/songMap.ts`, from
`useMusicIntelligence.ts`) and is cached by ISRC for the next time, so the first
time a song is played at a gig, nothing is known ahead of the note that is sounding.
Only the film render reads a song ahead: `src/lib/songTrack.ts` decodes the whole
file and works out every frame's bands and kicks before drawing (§6).

The idea is that the live show does what the render does, for a whole set:

- **Load the set as files.** Drop a folder or a playlist of files (bought FLAC or
  MP3; store downloads such as Qobuz's carry no DRM) onto the desk, or the Mac app
  (§13). Each song is decoded and analysed before the show, through the same code
  the render uses, and its song map is ready before its first note.
- **The show plays the files itself**, so it knows which song is on and where in it,
  to the sample, with no fingerprint service (`fingerprint.ts`) and no guessing at the
  gap between songs (`songBoundary.ts`). Offline at the venue, which is §14h.
- **Anticipate, don't react.** With every kick and section known ahead, a song show
  (`songShows.ts`) can fire an action a bar or two *before* a drop or on the last
  beat of a song, not after it: start a pour ahead of the build, black on the last
  hit, pick the next look from what the next song will do.
- **From the files' own tags:** the ISRC, so per-song looks attach exactly
  (`songRef.ts`), with MusicBrainz for files that lack one; embedded cover art as a
  source of the song's dyes; ReplayGain (or a loudness measured during the analysis)
  so a quiet record and a loud master drive the plate the same amount without
  recalibrating (`audioCalibration.ts`).
- **When something else is the player** (a DJ, a phone), the show carries on as it
  does today, through the mic or the interface.

**Open questions:** how much a whole set's analysis costs up front (a ten-minute song
decodes to about 230 MB of float before it is cut down, `songMap.ts`), so it wants a
worker and one song at a time; and whether anticipation is a new *when* for song
shows ("n beats before section") or a new kind of action. The phone gets the set
list, the now-playing song and the song shows' next cue, the same as the desk.

**Not doing:** a streaming service's API for this. Qobuz's API terms (researched
2026-09-27) forbid earning anything around the service and indexing its catalogue,
and a consumer subscription is for personal listening, so a stream at a gig is
outside its terms whatever the app does. Files the performer owns carry none of that.

## 18. The physics under the look: where the plate imitates a result instead of simulating it

Asked 2026-09-28. The owner's standing rule is to build from the chemistry and physics
of the liquids, not from a picture of their result, and to name any shortcut kept for
speed. This section is the audit that rule asked for: every place found in the solver
(`src/gpu/wgsl/fluid.ts`), the plate's optics (`src/gpu/wgsl/plate.ts`) and the tools,
drops, bubbles and bottles (`LiquidVisualizer.tsx`, `src/lib/`) where the code paints
how a liquid looks instead of simulating what makes it look that way. Each item says
where the shortcut is, what the real phenomenon is, what simulating it would take, and
what it would cost at the 768² rung. The costs are estimates from the per-stage table in
`docs/webgpu-plan.md` (Classic, two layers, 768², 6.58 ms a step on the M4) and the
plate pass's 2.0 ms, not measurements. Every item is read from the code; nothing here
has been built or measured yet.

The owner asked for all of these in the plan and picked 18a, the thin-gap flow, to
build first (2026-09-28); it starts in its own thread.

Three threads already own a piece of this, and their items are ranked here rather than
written twice: Classic's fingering push (the "grates" thread; its PR adds the plan item
for real Saffman–Taylor fingering), the ferrofluid's pull and the dye between the domes
(9f), and Blow (15c, with 15b and 15g).

### The one finding under most of the rest

**The plate has no velocity that obeys physics and remembers.** `decayVel` multiplies
the velocity by `damping` (a per-step factor with no dt in it) and then clamps every
cell to `MAX_SPEED` 0.002 (`src/gpu/fluid.ts`, `src/gpu/wgsl/fluid.ts` `decayVel`).
`docs/evaluation-2026-09.md` measured 99.7% of dyed cells sitting at that cap. So what
carries the dye is the noise stirring added after the pressure solve (`forcesB`:
turbulence, spin, vibration, drip, smear, air) and the half-resolution lasting current
(`cur`), which was added beside the main field to get some memory back. The viscosity,
the velocity's own advection and the second projection (about 2.4 ms, a third of the
step) work on a field the clamp then throws away. That one decision is why a tool's push
lasts one step (15b), why every tool moves the colour by a hand-written carry (15g), why
a press or a pour pushes nothing that the projection does not delete (bubbles-plan H),
and why viscous fingering could not be shown when it was built (physics-plan "What is
not here": the closed plate balances every source with a uniform sink).

A plate of liquid between two glasses is a Hele-Shaw cell. Its depth-averaged flow obeys
ρ∂u/∂t = −∇p + f − (12μ/h²)u, with ∇·(hu) = −∂h/∂t plus any source. The drag time
ρh²/12μ is about 0.02 s for water in a 0.5 mm gap, about 2 s in a 5 mm one, and nothing
for glycerine. The plate's memory should come from the gap and the liquid's viscosity,
not from a clamp.

### Ranked

By what the show gains against what it costs, GPU time first, since the show must hold
its frame rate live. "Free" means no new passes or texture reads.

| # | Item | Gain | GPU cost | Needs |
|---|---|---|---|---|
| 18a | The plate is a Hele-Shaw cell | Large: tools move every liquid, thick liquids stop, fingering becomes possible | About −2 ms a step (a saving) | Retuning every look; the owner's feel call (15b) |
| 18b | The lamp shines through the dye | Large: gels colour the dye, overlaps darken, thin washes are pale | Free | A per-look choice of ground. **Shipped** (#256), behind Lamp Ground |
| 18c | A pour adds liquid | Large: a drop shoves the colour outward into rings | Free | Better with 18a's open rim |
| 18d | Each liquid has its real properties | Large: glycerine crawls, thin fingers into thick, alcohol punches holes | +0.5–0.7 ms, less CPU | 18a |
| 18e | Edges come from refraction | Moderate to large: one mechanism for every edge, and a focus ring to play | <0.1 ms | None |
| 18f | Heat comes from the lamp | Moderate: dark regions warm and move; the lamp's own cells | Nearly free | Better with 18a and 18e |
| 18g | Colour leaves by flushing, not fading | Moderate: the plate turns over like a real one; drying | ~0.3 ms | 18a, 18c |
| 18h | Dye spreads along the flow | Moderate: streaks where it moves, sharp where it is still | About equal to today | Better with 18a |
| 18i | Bubbles and beads live by physics, not timers | Moderate: less "sticker" behaviour | CPU only | The owner's call on pacing |
| 18j | Milky liquids scatter | Moderate for milk, paint and latex | Free to +0.4 ms | A freed binding |
| 18k | Smaller ones | Small | Free to small | See each |

### 18a. The plate is a Hele-Shaw cell (replaces the speed clamp)

- **Where:** `MAX_SPEED` and `damping` in `decayVel`; the lasting current
  (`currentForces`, `addCurrent`); the squeeze film's red-black sweeps and
  `squeezeVelBuf`; the depth multiply in `addCurrent`.
- **The shortcuts it removes:**
  - **The clamp** sets every speed on the plate (above).
  - **The squeeze film's pressure solve** does almost nothing. Five red-black sweeps
    solve ∇²p = 12μ ḣ/h³, and `squeezeVelBuf` adds −(h²/12μ)∇p to the velocity. That
    is a pure gradient, which the next projection deletes, as the kernel's own comment
    says ("pressing seventy-five times harder moved the same 1%"). The sweeps and the
    add are most of the squeeze stage, which is the step's most expensive at 1.13 ms.
    What actually presses is the −ḣ/h source in `divergence`. The operator is also the
    wrong one: the Reynolds equation is ∇·(h³∇p) = 12μ ḣ, not ∇²p with h³ moved into
    the source.
  - **Depth as a capped multiply** on the projected flow ((h²/h₀²)^k, capped at 1),
    which makes a divergence-free field divergent. That is why it ships off.
- **What it takes:**
  - One velocity field with implicit drag, u ← (u + dt(f − ∇p)/ρ)/(1 + dt·12ν/h²).
  - A variable-coefficient projection ∇·(M∇p) = ∇·(Mf) + ∂h/∂t, with mobility
    M = h³/12μ(x). The multigrid takes face coefficients (harmonic means); a version
    was built once (physics-plan).
  - **An open rim:** cells at the dish's edge held at p = 0, so liquid can enter and
    leave there instead of every source being balanced by a uniform sink. This is what
    viscous fingering was missing.
  - At these Reynolds numbers the velocity's self-advection and the second projection
    can go.
  - A tool then acts on the flow and the flow carries every field. Blow is a surface
    shear stress, a Finger is a solid in the layer (Brinkman penalisation: the hand's
    velocity imposed inside its disc), a Press is ∂h/∂t. The hand-written carries
    (`carryDye`, `carryMix`, `fingerCarry`, `pressDye`, `pressMix`, `blowDye`,
    `blowOil`, `blowCarry`) can then be retired one at a time, each against its
    existing check (`finger`, `wind`, `pressoil`, `ferrohands`).
- **Cost:** removing the second projection (0.82), the velocity advection (0.69), most
  of the viscosity (0.91), the current (0.41) and the squeeze sweeps saves about 3 ms.
  The variable-coefficient solve and its coefficient pass add about 1 ms. So roughly
  2 ms a step are saved. The collocated grid's patches (`dampGrid`, the Rhie–Chow
  faces, `mixRelax`) are worth reconsidering in the same change: a staggered grid
  removes the checkerboard they exist for.
- **What is lost:** eddies. A thin plate has no turbulence, so the swirl has to come
  from hands, heat (18f), tilt and rotation. The noise stirring should stay as a
  declared dial ("hand stir"), fed in before the projection so that it too lasts
  through the drag time, not added after it.
- **Subsumes:** 15b (a tool's push lasts one step), the force half of 15g (air's shear
  and the jet's dimple on the film), bubbles-plan G (press and lift as different
  strokes: the lift's Saffman–Taylor fingers grow from this instead of from
  `squish.ts`'s hashed spokes, whose count is 8 + seed % 9) and roadmap Stage 1 F
  (depth). It is the prerequisite for the grates thread's Saffman–Taylor item.
- **Ships as:** a solver mode behind a setting, off by default, judged look by look on
  the Mac, because it changes how every look moves and every tool feels. Measured by
  a new lab check (a press's ring radius against the volume displaced; a drag's
  displacement against the drag time ρh²/12μ; dye conserved with the carries off).

- **Shipped, first part (Thin Gap, off in every look, 2026-09-28):** the setting
  `thinGap` (a switch) and `gapThickness` (water to glycerine, log in viscosity) on the
  sheet, the desks, MIDI and the remote. With it on: implicit gap drag 12ν/h² in place
  of the clamp (a 0.2 m plate, the rest gap 6 mm); the step's forces and the lasting
  current read as terminal speeds at the rest gap and fed in before the solve, the
  stirring included; a variable-coefficient multigrid with M = h·c (h³/12μ once the
  drag dominates) and face coefficients built in series along each coarse row; the rim
  held at p = 0; the press as the gap's own change, not the squeeze memory's rate; no
  self-advection, second projection, squeeze sweeps or `squeezeVelBuf`; a hand's push
  imposed along its direction rather than added; the dye moved across faces as an
  amount (`bodyAdvect`), since a backtrace made dye under a press (332 → 656). The thin
  solve keeps its pressure in its own buffer and hands the advections c·P for their
  Rhie–Chow faces. `npm run thingap` measures it against the old solver (16 checks).
  Judged on the Mac: docs/judging.md §19.
- **Shipped, the Press draws the liquid back (Thin Gap, 2026-10-03).** The owner: the
  Press "just pushes everything out instead of bringing it back when you release".
  Thin Gap's flow is reversible, but the app's Press was not: measured in the lab
  with the app's own strokes (Classic's clock), the press closed the film to its
  floor in a step or two and the liquid it squeezed out crossed up to 75 cells of a
  384² solver in a step, where the dye's face flux may carry 0.45. The colour was
  left behind: the ring went 42% of the way out (192²), and the slow lift then drew
  it 0.06 of the plate inside where it began. Five changes, each on a thin gap only
  (off, every look presses as it did):
  - **The glass closes as a film under a load** (`squeezeUpdate`): the liquid
    leaves through the gap it is closing, whose resistance goes as 1/h³ (Reynolds;
    Stefan's law), so the hand's press is its rate at the rest gap and slows as
    h³, integrated exactly over the step. The fastest face fell from 75 cells a
    step to 8. This is the physical half of 18a-5.
  - **The carries in substeps** (`carryCourant`, `carryPlan`): the step's largest
    face Courant number is found on the GPU and the dye, the oil's share of it and
    the oil (`bodyAdvect`, `mixAdvect`) are carried in as many substeps as keep each
    under 0.4 of a cell, up to 33, the pairs dispatched indirectly so nothing is
    read back (21 at most for the Press at 1×). The numerical half of 18a-5.
  - **The press is a bowl** (`squishDisc`, `thin`): a clamped plate under an even
    load deflects as (1 − r²/R²)², laid with the flat disc's volume. The stacked
    flat discs were steps in the gap, which the collocated grid carries colour
    across badly. A kick's release gives its gap back in the same shape.
  - **The glass lifts in seconds** (`glassSpring`): Press Lift's half-life was
    counted on the look's step (Speed × 0.2), about 14 s on Classic; on a thin gap
    it is the show's seconds, 1.55 s at the default.
  - **The Press's carries retired on a thin gap** (`squeezeOut`: `pressDye`,
    `pressOil`/`pressMix`), and the strokes lay only the glass there: no cleared
    centre or piled rim on a press, no inward push along a lift's spokes (the spokes
    remain as where the glass opens first). The Press part of 18a-3.
  - Measured (`npm run presslift`, new, lab, plate shard; 384² under 192, software):
    the ring lands at 100% of the displaced volume's shift (0.3427 against 0.3425),
    every colour kept to 0.00%, the colour under the palm's middle leaves with its
    liquid (×0.171 against the gap's ×0.227), 34% of the shift back after 1 s
    (4% with the glass on the look's clock), and once the glass is back the ring is
    3% of its shift from where it began. `npm run tools` on the Mac now presses and
    lets go through the real pointer with Thin Gap on, against an idle pool.
  - `npm run thingap`'s Darcy disc is now held for twenty steps, as a hand holds a
    Press: closing as h³, one step's dent leaves the film at about 0.008, not the
    floor its λ is counted at (16/16 after: oil 0.0449 against 0.0368, water
    0.1951 against 0.1854).
  - The phone has Thin Gap and Press Lift on the Press's own Amount, beside
    Fingering.
  - With the Press × ferrofluid PR (#229) merged in: `npm run ferropress` presses its
    pool to a sixth of the gap in twenty steps at the rate the h³ closing needs
    (its straight steps reached only 0.61 of rest). Pressed that fast, the
    ferrofluid's volume grew 1.9%: its grid filter and Cahn–Hilliard kept Σc, not
    Σc·h. Under the volume form they now move volume (`phaseGrid`,
    `phaseCHVolume`): kept exactly, 0.01570 → 0.01570, 7/7.
- **Found along the way, open:**
  - **Thin Gap in every look: shipped (#248).** The owner picked every look
    (2026-10-03, over "off until tried" and "Classic only"), knowing every look would
    move the thin-gap way before anyone saw it at 60 fps; the owner's complaint it
    answers (2026-10-04): letting go of a press "ends up wiping all the liquids down
    the drain". It overrides the operating rule that a new default keeps today's look
    for this one setting; it is not a new rule. What it changed:
    - `thinGap` defaults to 1 (`src/types.ts`); no preset sets it.
    - Saved looks: a look saves every setting, so one saved while Thin Gap was off
      by default said 0 without anyone choosing it. A saved look is now version 2;
      one from before reads with Thin Gap on, one saved since keeps what it says,
      off included (`PRESET_VERSION` in `src/lib/userPresets.ts`; `npm run setlist`).
    - The opening: every look's first step is now a thin one, so the thin gap's
      fifteen pipelines (the kernels, the velocity's snapshot, the dye's carry in
      substeps; the mix's carry only where the look opens with the mix) are waited
      for before the show opens (`WebGPUFluid.prepare`, `Opening.thinGap`), and the
      first step finds them built and runs thin at once (`thinGapOn`), where before
      it ran the old way until an await said they were in. The ferrofluid's volume
      forms (`phaseGrid`, `phaseCHVolume`) wait in the ferrofluid looks for the same
      reason. `?prepare=0`, `npm run startup`'s control, builds them on the frame
      like everything else, so the check prices the same compiles on both sides.
    - The phone: nothing new to build. Its Press Amount sheet already has Thin Gap
      and Press Lift (#228), and it now reads On.
    - To judge on the Mac: docs/judging.md §30, now every look.
    - And the other way, the old plate's own pipelines (its projections, the
      velocity's self-advection, the squeeze's own solve, the dye's backtrace:
      fourteen, which a thin step never asks for) are waited for only where a look
      opens with Thin Gap off; a show that opened thin builds them when Thin Gap is
      first turned off (`prepareOldPlate`) and stays thin until they are in. Every
      opening otherwise built both solvers, about 3.4 s of a cold Mac's opening for
      nothing, which `npm run startup`'s 1b would have counted as the show's own wait.
    - Checks that measured the old plate's Press by default: `bottles`' Press-moves-
      the-oil lines (`squeezeOut` and `pressMix`, which a thin gap retires) now turn
      Thin Gap off for themselves and say so in a line of their own; `tools`' "Press
      pushes the dye out from under the palm" (a ring from 0.05 to 0.25, squeezeOut's
      move) runs on the old plate too, since on a thin gap the colour spreads as the
      film thins, r ∝ h^-½ (Mac: a pool 0.011 from the palm's middle went to 0.028
      at a sixth of the gap, √6 × 0.011 = 0.027), still inside that line's disc; the
      let-go check asks the thin gap in its own terms. `depth` asks Depth Drag on the
      old plate, the only plate it acts on, and asks the thin gap whether its rim is
      slower on a domed plate than a flat one with no dial. `press.mjs` (not in CI)
      opens on the old plate. Set lists bring old saved looks in with Thin Gap on too.
  - **Depth Drag does nothing on a thin gap** (found with 18a-every). It is the old
    plate's stand-in for the gap's mobility, and a thin gap has the real one (h³/12μ):
    on Classic domed, the rim already runs at 0.156 of the centre with the dial at 0
    (Mac, `npm run depth`). Hide or retire the dial while Thin Gap is on, on the
    desks, the phone and the remote, so a performer does not turn a dial that moves
    nothing.
  - **The oil's press on a thin gap has no app check** (found with 18a-every). On a
    thin gap the flow carries Oil Bodies' oil and its colour out and back; `bottles`
    measures only the old plate's move. Add an Oil & Water leg to `tools`' let-go
    check: the oil under the palm goes out and comes back with its colour.
  - **Thin Gap's cost on the Mac is still unread** (18a-11, Wave 2's 2.1). The owner
    picked every look before it was read. The governor steps the grid down if a
    Mac cannot keep up, so the risk is a coarser plate, not a stopped one; read it.
  - **The lab still steps the old plate.** Its step parameters (`BASE` in
    `scripts/lab-entry.ts`) have no `thinGap`, so every lab check and `look` render
    that does not ask for the thin gap measures the plate no look plays now. Decide,
    check by check, which measure the solver as shipped (move them to the thin gap,
    and rebaseline only what moved for a reason the check names) and which measure
    the old plate on purpose as a control.
  - **The ferrofluid's carry is not in these substeps.** Since #229 `phaseAdvect`
    carries the ferrofluid as a volume on the thin solve's face fluxes, in a fixed
    six substeps (PHASE_SUBSTEPS) where the Press at 1× asks up to 21 of 0.4 a
    cell (`npm run presslift`). Put it on `carryPlan`'s count, as the dye, the
    bodies and the mix are. `ferropress`'s press, now as hard as the h³ closing
    makes it, keeps the volume in six,
    so measure what the 0.45-a-cell clamp leaves behind instead: the pool's edge
    against where its volume puts it. `phaseRelax` still keeps Σc, not Σc·h
    (under 0.1% in that check).
  - **The app's let-go check read a pool still spreading** (fixed in this PR,
    not yet green on the Mac). On run 37134289958 the pressed pool read 0.047 →
    0.077 → 0.076 from the palm and the idle pool 0.051 → 0.066 → 0.082: the check
    passed at 112% net while the pressed colour never came in (a press frozen at
    the lift reads 107% against that idle pool, check-skeptic). Run 37145038742
    read 20% (pressed 0.062 → 0.094 → 0.098, the idle pool on the old solver).
    Runs 37148523629 to 37163762683 then showed the separate idle pool starting
    15 to 40% from its press's, and Classic's own flow drifting a settled pool out
    0.004 of the plate a second, half the press's push over the lift's three
    seconds. The press itself read 62%, 98%, 97% and 99% back net of drift. Now
    each pool is its own control (its drift measured before the hand), on the
    calm plate (mirror.mjs's CALM), with a quarter of the push back before any
    drift is credited and a press frozen at the lift reading under half. The
    calm plate with no bubbles still drifted 0.0043 a second (run 37166234101),
    as much as settled 1.5 or 8 seconds: the three ambient seeding orbits that
    every look runs keep painting colour a quarter of the plate out (it grew 6%
    in three untouched seconds). The check now turns them off for its runs
    (`chromaglassDebug().ambientSeed`) and fails if colour still arrives.
  - **On the Mac the thin Press barely clears the colour from under the palm.**
    The share of the colour within 0.05 of the palm went 76% → 69% held → 68%
    after the lift (its idle pool 78% → 76% → 72%; Thin Gap off 72% → 1%). The
    lab's press takes the middle's colour to ×0.171. Find what the app's Press
    lays on a thin gap that the lab's does not (radius, depth, the bowl's 3×,
    the stroke's per-frame rate), and measure it under the palm. Those shares
    were read with the ambient seeding laying colour far out, which lowers every
    share and the held one most; read them again with it off before chasing it.
  - **The substeps' ceiling.** 33 substeps of 0.4 cover 13 cells a step; the
    Press at 1× on 384² asks 8. A Press at 2× Amount on a 512² solver, or a
    machine-starved step (a longer step's spring), can ask more, and past it the
    flux clamp leaves the colour behind again. Read it on the Mac (`readCarry`).
  - **The press's rate is the hand's, not the film's.** Stefan's law has the palm's
    size (R⁴) and the liquid's viscosity in it; the shader keeps only the h³, so a
    thick liquid does not yet press slower than a thin one under the same hand.
  - **The colour runs a little ahead of its liquid on a slope of the gap**: the
    carries' face velocities are rebuilt from cells (18a-8), and in the bowl the
    colour left under the palm's middle is 0.75 of what the gap there holds.
  - **The lift is a spring, and liquid fills it.** A real glass lifted off a thin
    film is held by the film's suction (Stefan, h³) and air comes in from the edge
    as fingers (Saffman–Taylor, the unstable stroke). The plate has no air phase in
    the gap, so the liquid always fills, and the lift's spokes are still a drawn
    seed of where the glass opens first. Needs an air phase in the thin solve.
  - **The bowl's width is the tool's.** A bent glass's dent is as wide as its
    bending length under the load (the glass's stiffness against the film); the
    bowl takes the Press's radius as it was.
  - **The splash, Blow's puff and every other carry still run on a thin gap.** A
    drop's splash still lays flat discs with pushes and dye multiplies, and Blow
    held still still moves the colour with `pressDye`'s ring (18a-3).
  - **The old solver's glass still springs on the look's clock**, about 14 s
    to half way on Classic. Since #248 a look runs it only with Thin Gap turned off;
    on a thin gap the glass lifts in the show's seconds (1.55 s to half way at the
    default Press Lift), so a look tuned on the old 14 s may feel bouncier: part of
    judging §30.
- **Left for later PRs, each its own thread (the shortcuts this one keeps, named):**
  - **18a-2, forces that are forces: shipped (2026-10-04).** Every force of a thin
    step was one step's velocity read as the speed it drives *this* liquid to at the
    rest gap, so the force itself scaled with the liquid's viscosity: the same pull
    moved glycerine as fast as the default oil, the magnet pulled the ferrofluid 7.9
    times harder through a liquid 7.9 times thicker, Rain Drip slid the whole plate
    downhill out of the dish (lab: the plate's mean flow 110% of a falling pool's),
    and Glass Smear and Updraft pushed only where there was colour. Now, on a thin
    gap only (the old plate steps as it did, to the bit), each is the force its
    phenomenon makes (`hsBody`, `hsPrep` in wgsl/thinGap.ts):
    - **Body forces** (the magnet, the maze, the oil's surface tension, Marangoni,
      Dye Weight, and the two below) are read against the *default* liquid's drag
      (`NU_REF`), so on the default Thickness every look moves as it did and on any
      other the liquid answers as h²/12μ says. The step keeps the velocity after
      them (`hsMid`, only when one ran) so hsPrep can tell them from the stirring.
    - **Rain Drip is heavy colour on a plate stood up**: the dye's excess weight over
      the plate's mean, down the plate's downhill (Tilt Direction; it was always −y),
      Boussinesq. A Hele-Shaw cell with a heavy liquid over a light one is
      Rayleigh–Taylor unstable, so the colour falls in fingers and the clear liquid
      rises past it, with no streaks drawn and no second friction. Its weight is set
      so a pool falls as fast as before (0.079 against 0.083, lab).
    - **Updraft is a draught's shear**: depth-mean τh/2μ (15g's model), on all the
      liquid, halved so a pool drifts as fast as it did (`AIR_SHEAR`).
    - **Glass Smear is the glass sliding**: ρ∂u/∂t = −∇p + f − (12μ/h²)(u − U/2),
      the liquid at half the glass's speed in any liquid and any gap, the glass at
      half of smearX so a pool moves as fast as it did. Uniform; a domed or pressed
      gap turns it through the pressure.
    - **The look's stirring stays a dial** (Turbulence and the music's swirl, the
      hand stir; Polarity's hold between colours; vorticity confinement; Vibration
      for now; the lasting current, 18a-4): still this liquid's speed at the rest gap.
      Named in "Kept, named as dials".
    - Measured: `npm run forces` (lab, plate shard, 10 checks): Rain Drip's pool falls
      7.66 times slower in a liquid 7.94 times thicker (the hand stir 0.97); a
      ferrofluid as thick as its liquid 7.73 times slower under the magnet (the old
      reading 1); the plate's mean under Rain Drip 0.0015 against the pool's 0.078,
      an evenly coloured plate still; Glass Smear 0.00239, 0.00246, 0.00246 against
      0.0025 open, thick and pressed to 0.71 of rest; Updraft 0.738 of the open
      plate's speed where the gap is 0.707, and 7.71 times slower in the thick liquid.
    - The phone: nothing new to build. No setting was added; the phone's Settings
      tile opens the same panel, where Rain Drip, Glass Smear, Updraft and Thickness
      are, and its solver is the same.
    - **Found, open:**
      - **Vibration does nothing on a thin gap.** On the thin gap (every look since
        #248) the old ripple moves a uniformly dyed plate by 0.0001 (lab, full
        Vibration): it is a per-step push at 3 Hz on a liquid whose drag takes it
        in a tenth of a second, about a thousandth of what it was tuned to on the
        old plate (a fiftieth of a wave). Tried as the glass ringing in a Chladni
        mode, a gap source beside the press (−∂h/∂t, kept reversible by bending back
        in the shape it rang in): the colour rippled 0.125 at full Vibration as the
        old tuning asked, but the colour's carry did not give it all back. After
        40 steps of ringing 0.027 stayed (21% of the peak), after 160 steps 0.049,
        and half the ring left a ninth as much (residual going as amplitude^1.6): the
        face fluxes' upwinding diffuses the ripple each half cycle, which leaves a
        standing grating at the mode's wave, the fault §0 took out. Waits for a
        carry that is not first order (18a-8), then ship the ringing glass.
      - **A uniform force drains across the open rim.** Glass Smear and Updraft move
        the whole liquid, and the rim (p = 0) lets it leave one side and come in the
        other, where a real dish holds its liquid and a uniform shear makes no mean
        flow at all. Before this they moved only the colour, which left the same way.
        With 18a-7 (the rim follows the dish).
      - **The forces' sizes are still the looks' numbers**, read at the default liquid,
        not newtons: the magnet's, the oil's tension and Rain Drip's weight belong in
        real units once 18d gives each liquid its density, viscosity and tension.
        And the magnet's and the oil's per-step caps (`MAGNET_CAP`, `OIL_CELLS`) are
        still speed caps on a force.
      - **A slid glass smears colour across the gap**, not only along: the top of the
        column goes at U and the bottom stays, so colour spreads along the slide
        (Taylor dispersion). The depth-mean flow carries the mean; 18h's dispersion
        along the flow would give the smear its smear.
      - **The cost**: one more full-grid copy a step when a body force runs, unread
        on the Mac (18a-11).
      - **Updraft blows downhill.** Its push is a fixed −y, which is the plate's
        downhill at the default Tilt Direction (where Rain Drip now falls), and it
        does not turn with Tilt Direction. Kept as it was (every look with it was
        tuned on it); whether an updraft should rise against Rain Drip is a look
        question for the owner on the Mac (judging §32).
  - **18a-3, tools as solids.** A hand's push is imposed along its direction (a
    penalised solid in the limit where the solid wins), not a disc moving at the hand's
    velocity (Brinkman), and the hand-written carries (`carryDye`, `carryMix`,
    `fingerCarry`, `pressDye`, `pressMix`, `blowDye`, `blowOil`, `blowCarry`) still run
    on top of the flow, so with Thin Gap on the colour is moved twice. Retire them one
    at a time against `finger`, `wind`, `pressoil`, `ferrohands`, `tools`.
  - **18a-4, the current into the field.** The lasting current (`cur`) is fed into the
    thin solve as a force, but it still has its own solver on the M grid; its forces
    (rock, twist, buoyancy, centre gravity) belong in the main field, and then the
    current's solver and its 0.4 ms go.
  - **18a-5, the press over its own time.** `squish` can lay a press's dent in one
    step, so the displaced volume leaves in one step, faster than the dye's face
    fluxes may carry it (0.45 of a cell a step). The app's Press lays its dent a step
    at a time (`lib/squish.ts`), and `npm run thingap` presses over ten steps; the
    glass should close over the press's own time wherever a dent is laid, and
    `gapMemory` then has no job in a thin gap.
  - **18a-6, inertia for water.** The velocity's self-advection is dropped. The reduced
    Reynolds number Re·h/L is under 0.1 for oils and near 2 for water in the plate's
    6 mm middle, so water in a deep gap has more inertia than this keeps. Measure it on
    Water looks and bring back a cheap advection if it shows.
  - **18a-7, the rim follows the dish.** The open rim is the plate's inscribed circle;
    with Dish Spread (two dishes) or a round-dish vignette each dish has its own edge,
    and the solver does not know it. And the inscribed circle touches the square's four
    sides, where the box's wall, not the open rim, meets the liquid: a flow across the
    plate is stopped at those four points (a lab probe of a uniform push read the speed
    at the wall down to 0.54 of the rest and a sideways jet of 1.9 beside it), and the
    pressure that takes it out reaches the middle for two steps (`npm run thingap`
    prints that first step). The rim should sit a cell or two inside the square, or the
    cells outside it count as open too.
  - **18a-8, a staggered grid.** Cell velocities are rebuilt from the face fluxes,
    which leaves a small checkerboard at a floored dent's edge; the advections'
    Rhie–Chow faces are given c·P, exact only where the drag is even; and the face
    fluxes' upwinding squares off a ring under a fast radial flow (the pressed rings in
    the picture). A staggered grid takes all three, and `dampGrid`'s job.
  - **18a-9, the CPU engine.** Thin Gap is WebGPU only; the CPU fallback ignores it.
  - **18a-10, the in-plane viscosity.** The viscosity stage (0.91 ms) still runs with
    Thin Gap on. In a gap it is the Brinkman correction to the drag, of order h²/L²
    against it; measure whether any look shows it, and drop it for the time if not.
  - **18a-11, the cost measured.** The saving above is an estimate; measure the step
    with Thin Gap on and off on the Mac (`?debug`, docs/judging.md §19).
  - **18a-12, the thin gap's pressure was never cleared: shipped, as a warm start.**
    Found 2026-10-04 reading the code for 14v: the thin gap's projection cleared its
    pressure with `clearBuffer(pass, this.hsP!, 'clear pressure')`, under the same bind
    group key as the old plate's `this.press`, so it zeroed `press` and the thin solve
    started each step from the last step's pressure, a warm start nobody chose (and
    after a `groups.clear()` the two could swap). Measured by the Thin Gap thread
    (`npm run thingap`, lab): cleared for real, a press on a 130² grid moved its ring
    63% of the way the displaced volume puts it (15/16); warm, 100% (16/16), the
    numbers every Thin Gap result shipped on. So the clear is gone and the warm start
    is the choice, said where the solve begins (`thinProject`). Open: whether
    `hsCycles` from cold should converge on a grid that is not a power of two.

### 18b. The lamp shines through the dye (replaces paint over black)

- **Where:** `plate.ts`, where `bgColor` is black unless the blend is multiply, and the
  dye is composited with `mix(outColor, fluid0.rgb, fluid0.a)`. `decodeFluid` makes
  the opacity from the total density with a darkness fudge (×1.7 for dark dyes),
  capped at 0.95, and clamps the path through the gap to 0.35–4. The shader's own
  comment says it: "On this plate dye is light (bare water is dark)."
- **The shortcut:** the solver already stores the dye the physical way, as
  per-channel absorbance, so dyes mix subtractively in the solver. The picture then
  draws that as paint on a black ground. Clear water shows black. A gel, LED ring or
  lumia under the glass (`mixLamp`) does not pass through the dye, so blue dye over a
  red gel shows blue where it should be nearly black. A drop's glow adds the dye as
  emitted light.
- **The real phenomenon:** Beer–Lambert transmission of the lamp,
  out = L_lamp(x) · exp(−Σ εᵢCᵢh(x)). Clear liquid shows the lamp at full brightness,
  and dense dye goes saturated and then dark.
- **What it takes:** nothing new from the solver. The absorbances and the gap are
  already bound to the plate pass. Replace the mix with `lamp * exp(-A * h)`, keep
  `spectralThrough`'s six bands, and drop the clamp and the fudge. The chemistry's
  colours (the BZ waves, Liesegang rings, the pH indicator) are lerped paint today
  (`mix(outColor, col, 0.85)`); each becomes an absorbance added before the exp, so a
  BZ front becomes a pale blue wave through orange liquid with the dye still showing.
- **Cost:** free.
- **Gain:** the largest honest change available in the picture.
- **Caveat:** it inverts every approved look, which today are colour on black. It ships
  as a per-look choice of ground (black or lamp). The dark ground can then be made the
  physical way, with a dense base dye in the dish or the lamp dimmed, so a look can keep
  its darkness for a real reason. Relates to physics-plan "Layer depth" and bubbles-plan
  F (the wet carrier).
- **Shipped (#256, 2026-10-04): Lamp Ground** (`lampGround`, Settings → Lamp & Light;
  MIDI, the desks, the remote, the phone's Looks sheet), 0 in every look, so nothing
  changed until the owner turns a look up (judging §31). At 1 the ground under the
  dish is the lamp (through whatever the mixer has under the glass: the LED ring, the
  gel, the lumia), and the dye is a filter on it: `ground · exp(−a · amount)`, with
  `spectralThrough`'s six bands where Spectral Optics is up. The amount is the one the
  opacity was always made from, without the ×1.7 darkness fudge and the 0.95 cap, so
  the same pool is the same depth of dye on either ground. The back plate is a second
  filter (the product), and the pH, BZ and Liesegang colours are absorbers in the
  light, not paint. Between 0 and 1 the two pictures fade into each other, so a fader
  can play it. Not in the photograph, which has its paper. `npm run lamp` (CI, open
  shard, 8 checks) measures it: all 41 looks at 0 draw byte for byte what the plate
  drew before (against a lab built with the lamp's lines taken out); a clear pool
  throws 100% of the lamp (§20a asks 90%), 0% on black; twice the dye lets through
  the square of once to 0.00 in every channel of three dyes (blue 0.21/0.41/0.78 →
  0.04/0.17/0.61), in the ratio of the absorbances laid down; a dense blue passes
  0.00/0.02 of red and green; a pool over a gel is the gel times the dye's
  transmission to 0.49 of a byte (164 on black, the old fault); two plates multiply
  to 0.61 of a byte, pixel by pixel; the photograph does not change. Found on the way:
  the hot-spot lifted the middle to 1.28 times the lamp, which burnt a white ground
  out (the doubling read 0.89 where the law says 0.96); the lamp ground is now set
  down by the hot-spot's peak. Halfway the picture is half of each to a byte. The gooey edge's contrast is left out of the amount (18b-4)
- **18b-1. The owner picks the looks** (judging §31). Each look's dyes and Dye Budget
  were set for black; one moved to the lamp may want less dye.
- **18b-2. The dark ground the physical way.** A look that stays dark should get there
  with a dense base dye in the dish or a dimmed lamp, not with the black ground, once
  the owner has picked; then the black ground can go.
- **18b-3. The painted edges on the lamp (shortcut, until 18e).** The meniscus, the
  boundary line, lacing, cells, gloss and the closeup's detail are drawn on the dye's
  tint; on the lamp ground what they did is carried over as the ratio of the tint's
  brightness after them to before (`reliefOf`). Real edges are refraction: 18e.
- **18b-4. The gooey edge's contrast is not in the amount.** It is an opacity curve
  made for paint on black; as an amount it bent the law (a plate twice as deep let
  through 0.16 of the green where Beer–Lambert says 0.09). On the lamp only its blur
  counts. A look on the lamp that wants crisp blobs needs them from the liquid (18a's
  surface tension, 18d), not from a curve.
- **18b-5. The back plate's mixer blends on the lamp.** With its own blend (the look's
  Blend Mode) the back plate filters the lamp; a mixer row set to screen, add, multiply
  or key still lays its dye as it did. Decide whether a row blend means anything under
  the lamp, or the lamp overrides it.
- **18b-6. Light through a film, not the whole gap (for 20b).** The path is the dye's
  amount times the gap (Layer Depth). Once a film of clear liquid sits in the gap
  (20b), the water's path is the gap less the film, which is where the reference's
  faint pink and lavender in the white come from. A drop's or bubble's "through"
  colour (the lamp through the clear gap, `through` in the bubbles) is still the old
  tint-towards-white estimate, read off the ring round it (which is on the lamp
  ground now).
- **18b-7. What `npm run lamp` does not read yet.** The closeup's and the particles'
  decode (`decodeFluidRaw`, which has no Colour Body factor where `decodeFluid` has
  one), the spectral branch, the chemistry as filters, and the bubbles' rim and lens on
  the lamp. And the Second Lamp is not held to the lamp as the hot-spot is: near its
  spot it can lift a white ground past full and clip (its colour is up to 1.4 in
  blue). Dividing it by its peak dimmed the whole plate by 1/1.4 away from it, which
  is worse; a second lamp on a lamp ground wants its light added, not multiplied. Each wants a case
  in the check, or a reason it does not need one.

### 18c. A pour adds liquid, not only colour

- **Where:** the Dropper stamps dye with no volume. The Pour, the splash crown and
  the Splatter push with a radial velocity kick, which is curl-free, so the projection
  deletes it (bubbles-plan H's own rule). The splash fires at any energy above 0.02,
  with a random count of satellites.
- **The real phenomenon:** a landing drop is a volume source Q. Between glasses it
  drives a radial flow, u_r = Q/(2πrh), that shoves the colour already there outward
  into concentric rings (drop into drop). A crown splash needs K = We·Oh^−0.4 above
  about 2100, which for a 3 mm water drop means falling from about 20 cm or more. Below
  that a drop only merges and spreads. Whether an oil drop stays a lens or spreads to a
  film is set by the spreading coefficient S = γ_w − γ_o − γ_ow, which is negative for
  most oils.
- **What it takes:** a volume channel on the splat record, fed into `divergence`
  exactly as a growing bubble's rate already is. The splash is gated on K from
  `dropHeight`.
- **Cost:** free (one term in an existing pass).
- **Gain:** drops push the plate's colour into rings, and bubbles and beads get pushed
  by that real flow rather than by `disturb()` kicks. Works today against the uniform
  sink. It is better with 18a's open rim, and with 18d it gives radial fingering when a
  thin liquid is poured into a thick one.

### 18d. Each liquid has its real properties (replaces the property scalars)

- **Where:** `src/lib/liquidPhase.ts` and the bottles in `src/types.ts`. The viscosity
  is one global switch (`thick ? 1.5 : 0.5`).
- **The shortcuts:**
  - **Soap, milk, silicone and glycerine** are channels on the CPU at 192², read back a
    frame late, and each fades on a timer (soap 6 s, glycerine 22 s). A liquid does not
    evaporate as a property.
  - **Glycerine's "body"** is a drag against last frame's velocity, projected and then
    clamped.
  - **Soap's Marangoni force** is a pure gradient added before the projection, which
    deletes it. The clear disc people see comes from a dye multiply that destroys the
    colour. The GPU already moves soap correctly (`marangoniFlux`), so soap is modelled
    twice.
  - **Colour-difference "tension"** (`forcesB` `tension`, the Immiscibility dial) makes
    two dyes of different hue in the same water repel. Interfacial tension exists only
    between immiscible liquids; food dyes in water mix. Many looks are tuned on the
    cohesion this gives, so retiring it is a look change and the oil or silicone
    bottles have to take over the job.
  - **Milk** has `repel: 1`, but milk is a miscible emulsion.
  - **Alcohol** "rises through water". Nothing rises in a level dish. Alcohol's real
    effect is a strong Marangoni burst (σ about 22 against 72 mN/m) plus evaporation:
    the hole it punches in a film.
- **What it takes:**
  - Each bottle carries a viscosity, a surface tension (or its drop against water), a
    density and a refractive index.
  - One rgba32f species texture on the GPU, moved in flux form (the `mixAdvect`
    kernel exists), with no decay.
  - A mixture viscosity μ = μ_w^(1−c) μ_g^c (spanning about 1000×) feeds 18a's
    mobility. Density feeds the tilt's buoyancy. Soap and alcohol go into the GPU's
    surfactant field with a σ(Γ) law. Immiscible bottles get a Cahn–Hilliard phase
    each, as the oil has.
  - The CPU soap force, the dye multiply and the colour-difference tension are then
    deleted.
- **Cost:** about +0.5–0.7 ms on the GPU, less the CPU pass (1.5–3.5 ms of CPU at 192²).
- **Gain:** glycerine crawls because it is thick, a thin liquid fingers into a thick one
  (Saffman–Taylor, with 18a), alcohol blasts holes, and nothing silently disappears.
  Extends 15e, which found these forces measured only on a stand-in plate.

### 18e. Edges come from refraction (replaces the painted rims and highlights)

- **Where:** in `plate.ts`, `sobelGrad` and `gradNormal` turn the gradient of dye
  density into a "surface normal". That normal drives Lambert and Blinn–Phong shading
  (`applyLighting`), the dark rim and highlight of `meniscus()`, the bright line of
  `boundaryContrast` (set in 34 presets), `lacing`'s threads, and the camera pass's
  refraction offset. The oil phase is drawn with its own `|∇oil|·2.2` darkening.
- **The shortcut:** dye concentration is not a height, and there is no free surface
  between two glasses to shade. Only the drops and bubbles (the beads and the air
  field) get the real optics today: Snell refraction at the meniscus and the
  projector's aperture (`dropLens`, the `u*` law).
- **The real phenomenon:** light between two glasses bends where the optical path
  OPL = ∫n dz changes. n depends on the dye's concentration (Δn about 10⁻³–10⁻²), oil
  against water (1.47 against 1.333), temperature (about −10⁻⁴ per K) and the gap. A
  projector then shows two effects:
  - **Aperture loss:** darkness wherever the deflection is steeper than the lens can
    take in. This is the drops' `u*` law, applied everywhere.
  - **Shadowgraph:** at a defocus Δz, I ≈ I₀(1 − Δz·∇²OPL/n). This gives the bright
    and dark doublets at fronts (Becke lines), and caustics once the rays cross.
- **What it takes:** build n from the fields already bound (dye, oil, gap, heat), and
  compute OPL = n·h with its gradient and Laplacian in the derive pass. That pass runs
  once a frame and has a spare channel. The display pass applies the aperture and the
  defocus term. The projector's focus becomes a real control a performer can ride.
  - The aperture's hard threshold becomes the overlap of the condenser's illumination
    disc with the lens pupil. The comment on `DROP_NA` (raised from the physical 0.05–
    0.1 because it "drew black doughnuts") and the 0.85 and 0.9 floors are that
    overlap, guessed.
  - The solver's oil and the beads then look like the same material.
  - The painted highlights (the Blinn–Phong spec, `meniscus`'s spec, the macro's "wet
    highlight", `microDrops`' dots) go from projected looks: a plate lit from below
    sends no reflection to the wall. They stay in the camera and closeup looks.
  - True folded caustics would need a scatter pass. The 16-binding limit is reached,
    so that is later.
- **Cost:** under 0.1 ms for the gather version.
- **Gain:** one mechanism replaces five painted ones, and edges answer to focus, press
  and oil.
- **Risk:** real dye-into-water fronts are faint (Δn is small), so the plate may lose
  the bright boundary line its looks are tuned on. Keep a gain on it, named as a gain.
  Research item 4 (`/mnt/project-files/drops/research/bubbles-and-drops.md`) is this;
  it was not in the plan.

### 18f. Heat comes from the lamp, and a level plate has no "up"

- **Where:** `currentForces` pushes heat along `S.up` (the gravity direction, whatever
  `plateUpright` says), saturated by tanh(20T). Heat is injected in spots by pours and
  the music (`addTemp`), and `heatDecay` is per step. Centre gravity and rock use
  tanh(dye − mean) and are not tied to the dome the gap actually has. The oil has no
  density, so it never rises on a tilt. `mixForce` already gets this right: gravity
  only in proportion to how upright the plate is. The noise stirring (`forcesB`) is
  what moves an untouched plate, with no physical source.
- **The real phenomenon:**
  - On a level plate gravity points through the glass, so in-plane buoyancy is zero.
  - The lamp heats the dish through the dye's absorption, so dark regions warm. A hot
    spot drives liquid outward along the surface (thermocapillary flow: dσ/dT about
    −0.15 mN/m per K for water, −0.06 for oils). It thins the film into holes, which is
    the European school's burning away. From below, the lamp makes Bénard–Marangoni
    cells once the Marangoni number passes about 80.
  - Water's viscosity falls about 2% per K.
  - Downhill on a dished glass is ∇h from the gap's dome.
- **What it takes:**
  - A heat source ∝ lamp intensity × absorbed fraction (from 18b), and Newton cooling
    per second.
  - ∇T fed into the existing `marangoniFlux` as σ(Γ, T).
  - Buoyancy gated on `upright`, with the tanh removed. Oil gets a density below
    water's.
  - Viscosity falling with temperature, into 18a's mobility.
  - Heat written to the velocity texture's spare channel in `packVel` (it is thrown
    away there today) so 18e's shadowgraph shows the convection as shimmer.
- **Cost:** a few operations in existing passes, and four taps in the plate.
- **Gain:** an untouched plate breathes where it is dark and hot, speeds up with the
  Dimmer, and shows the lamp's own cells. It is the mechanism slide-plan S2 is waiting
  on (heat with a strength). Turbulence stays as the declared stir dial.

### 18g. Colour leaves by flushing, not by fading

- **Where:** the dye-budget regulator and "evaporation" (`LiquidVisualizer.tsx`,
  applied in `decayDye`), `capDye`, the `airExclude` multiply, a still bubble's
  `standing` pump, and soap's dye multiply.
- **The shortcuts:** dye over the budget is removed everywhere, in proportion to the
  square of the overage. "Evaporation" removes dye, not water. A bubble destroys the
  dye under it by a multiply, a CPU rim deposit puts some back, and a bubble sitting
  still keeps pumping liquid out of itself every step.
- **The real phenomenon:**
  - Nothing removes dye from a sealed plate. Old colour leaves a real plate by being
    flushed out of the open rim as new liquid goes in (18c).
  - Evaporation removes solvent: the concentration rises and the dye is left in a
    coffee ring.
  - A bubble is a volume with no liquid, so the dye is excluded by volume fraction.
- **What it takes:** 18a's open rim as the outflow, pours as volume (18c), the dye
  carried as concentration × liquid fraction with air as a phase, and evaporation
  acting on a carrier-thickness field (bubbles-plan F's wet carrier). A safety cap
  stays, named as one.
- **Cost:** about 0.3 ms (one r16f texture and a flux pass).
- **Gain:** a show ages the way a real plate does. It turns over, and it can dry.

### 18h. Dye spreads along the flow (replaces isotropic diffusion and the conservation patch)

- **Where:** Jacobi dye diffusion with one constant for every colour (about 1000× the
  molecular rate where it is on); the MacCormack Jacobian clamp and neighbourhood cap
  (`fluid.ts` advection), which lose the excess; `sharpenDye`, retired (0 by default)
  but still in the step.
- **The real phenomenon:** molecular diffusion is negligible at this scale. The blur in
  a Hele-Shaw cell is Taylor–Aris dispersion along the flow,
  D_L ≈ D_m + h²|u|²/(210 D_m). Edges stay sharp where the liquid is still and streak
  where it moves.
- **What it takes:** the dye moved in flux form (`bodyAdvect` exists), and one or two
  explicit passes of dispersion with a tensor built from u⊗u. The Jacobian patch exists
  because the transport field is divergent (the noise after the projection and the
  depth multiply), so it can go with 18a.
- **Cost:** about the same as today's diffusion (1.3 ms where it runs), or 0.3–0.6 ms
  explicit.
- **Gain:** streaks along the flow, and conserved dye. Honest: a minmod flux carries
  fine threads a little softer than MacCormack, and the plate's detail table
  (`npm run detail`) has to hold.

### 18i. Bubbles and beads live by physics, not timers

- **Bubbles** (`src/lib/bubbles.ts`) live 9–23 s and pop at the end. The soap film's
  colour runs on age over life. A pop makes 2–3 random daughters, merges are random
  (`rng < dt·0.12`), pairs are pulled together, and the drift has a random wander at a
  fixed 1.4× the flow. A bubble trapped between glasses is an air pancake with no
  draining film, so it does not pop on a timer. It ends at the rim, by dissolving (the
  Ostwald ripening already there), by merging when the film between two drains, or
  when a drop breaks it. With no free surface there is no pull between bubbles. A
  bubble runs at about twice the flow, less a film correction.
  The cheap version drops the timed pops, daughters and pull, drives merges by drainage
  time and sets speed from the capillary number. The full one (air as a phase with
  Laplace pressure in 18a's solve) lets bubbles finger and split. The Straw's finger
  count is random (`lobes: 8 + rng(7)`); the real count follows the finger wavelength
  λ ≈ πb/√Ca.
- **Beads** (`src/lib/beads.ts`) are a carpet of particles born where a noise patch
  allows, coloured from the look's palette, moving at a fixed 0.8× the flow with
  jitter, merging at random. Nothing in the file knows about Oil Bodies. Real beads are
  oil that broke up where threads pinched off (Rayleigh–Plateau), carrying the colour
  they were poured with, and moving at about 2U/(1 + λ) for a viscosity ratio λ. What it
  takes: beads handed down from the Cahn–Hilliard oil where it pinches, coloured from
  the dye at birth, with speed from the bottle's λ.
- **Cost:** CPU, plus a readback of the oil field for the beads.
- **The owner's call:** timed pops also pace a show (`lifeScale`), and the bead carpet is
  a look in its own right, so both stay available as looks.

### 18j. Milky liquids scatter

- **Where:** everything in the plate is a pure absorber. `colourBody` pushes opacity
  and saturation up to imitate a body of colour, `granulation` modulates alpha with
  noise, and the Liesegang precipitate is a lerp.
- **The real phenomenon:** pigment and fat droplets scatter light (Mie), handled as
  two-flux Kubelka–Munk. With a projector's small aperture almost all scattered light
  misses the lens, so a milky liquid throws dark or grey with a soft forward halo. It
  does not throw white. The "solid reds on milk" in the references are a reflected-light
  look.
- **What it takes:** a scattering coefficient per bottle (18d) and a scatter channel in
  a repacked binding (the dye and `view0` are full). Extinction K + S·(the share the
  aperture loses) in 18b's exponent, with an optional small blur for the halo.
- **Cost:** free in the shader; +0.2–0.4 ms with the halo; the binding work.
- **Gain:** milk, paint and latex look different from ink. This replaces §4's "milk's
  opacity still owed" with its physics.

### 18k. Smaller ones

- **Thin-film colour:** the film's thickness is the dye's opacity ×16 plus drifting
  noise, through a cosine rainbow at 85%. The physical Airy table (`filmTable.ts`,
  `filmPhysics`) exists and is 0 in every preset. Real film colour in transmission is
  faint (0–8%), so a strong rainbow is a look and should be named one. The honest
  version is a transported film-thickness field driven by the soap. Cost: about 0.2 ms.
- **Linear light:** everything is composited in sRGB-encoded values. The six-band
  spectral sums, every mix, screen and add, the camera's blur and its bloom are biased
  by that. Decoding at the inputs and encoding in the finish is free, but it moves every
  look a few per cent against the "same picture to the bit" gates, so it goes with a
  re-baseline.
- **Stacked dishes multiply, beams add:** layers combine by "screen" in gamma space.
  Two dishes in one beam multiply their transmittances, and two projectors on one wall
  add in linear light. Free once linear; rig-plan R3 covers the projector half.
- **Chemistry sits still under the stir:** Gray–Scott runs on a static 192² CPU grid
  that the flow does not carry, and soap "breaks down" on a 10 s timer. The reactants
  should be moved with the flow (one flux pass, about 0.1 ms), and soap should be left
  to dilution. BZ (the Oregonator) and Liesegang (Keller–Rubinow) are real models.
- **Spray and Splatter:** random stamps with an outward fling. Droplets land vertically,
  so the fling has no physical cause. Each droplet should be a small volume source (18c)
  with log-normal sizes (`dropRadius`).
- **The ferrofluid's spikes are placed** on a fixed hexagonal lattice
  (`src/gpu/wgsl/spikes.ts`) rather than emerging from the Rosensweig instability.
  Noted for the ferrofluid thread (9f onward), not audited further here.

### Kept, named as dials or looks

These are not physics and do not pretend to be: vorticity confinement (declared "not
physics a thin film has", off by default), the hand stir (Turbulence and the music's
swirl: a hand or a stick through the layer, which imposes its motion whatever the
liquid, so on a thin gap it is still read as this liquid's speed at the rest gap, PLAN
18a-2), Polarity's hold between colours (until 0-fingering makes it a capillary jump),
Vibration (until the ringing glass, 18a-2's open item), the drift and room stir, the camera and
closeup looks' lens effects (depth of field, bloom, chromatic aberration), film stock,
the corner-pin grade, the lamp's hot spot and warmth, Roy's Ben-Day dots, and the
kaleidoscope. The noise stirring stays as a stir dial once 18a gives the plate its own
motion. The numerical patches of the collocated grid (`dampGrid`, the Rhie–Chow faces,
`mixRelax`) are numerics, not faked physics, and are worth reconsidering with 18a.

### Already physical

The multigrid projection. The gap field, with the press as a −ḣ/h source. The oil's
Cahn–Hilliard phase with a curvature capillary force, moved in flux form and conserved
exactly. Oil Bodies' partition of the colour. Marangoni flow as conservative surface
transport. Buoyancy in `mixForce` only when the plate stands up. The dye stored as
per-channel absorbance. Acid and base as signed equivalents. BZ and Liesegang. The
ferrofluid's pull as ∇|B|² with Langevin saturation, and the Ohta–Kawasaki labyrinth.
The drops' and bubbles' aperture optics, shapes set by the gap, Paterson relaxation and
Laplace-arc walls. The Airy thin-film table.

## 19. The checks, the build and the plan itself

Found 2026-09-28 by reading `.github/workflows/`, `scripts/` and the build, and by
reading 14 recent `Checks` runs and 96 `gallery.yml` runs through the Actions API.
19a, 19b and 19h have shipped since (#234, #239). The first two cost the most: they are much of why a deploy took 37 to
77 minutes on 2026-09-27. (Numbered 19 because 16 and 18 are in flight, in #204 and
#207.)

### 19a. `gallery.yml` holds the Mac runners

`gallery.yml` photographs every preset on a Mac on every pull-request push that touches
`src/gpu/wgsl/plate.ts`, `src/gpu/fluid.ts` or `src/gpu/wgsl/fluid.ts`, the three most
edited files, and a run that has started is never cancelled (`cancel-in-progress:
false`, so that its sheet is the next push's "before"). It ran 96 times from 2026-09-26
to 2026-09-28, 79 of them to the end at 28 to 29 runner-minutes each: about 38 Mac-hours
in two days. Meanwhile `Checks`' Mac shards waited 218 to 3,869 s for a runner in the
three green runs sampled, and one `Checks` run wants four Mac jobs at once.

*Fix:* start it by label or by hand, as `controls.yml` is for the same reason, or once
on the push that takes a PR out of draft. *Measure:* the Mac shards' queue time over
the next 20 `Checks` runs, against these.

**Shipped 2026-10-03** (the owner asked why ten open PRs were all waiting on CI).
`npm run macqueue` measured the fifteen hours to 19:14 UTC: 2,747 Mac runner-minutes, of
which `Checks`' PR shards 1,705 (62%, 341 of them on runs that failed), the gallery 812
(30%, 28 runs, every one on a push nobody had asked pictures of), deploys 191 (7%) and
the iPhone build 39. The PR shards waited 19 minutes on average for a runner, and the
account held five to eight Mac jobs at once through every busy hour, so a gallery run
was a shard not running. Two changes, neither of which runs less of `Checks`:

- `gallery.yml` runs on `workflow_dispatch` or on a PR labelled `gallery`, once per
  labelling, as `controls.yml` does. A session can add the label (it gets a 403 on a
  dispatch); `preset-auditor` now does.
- `closed.yml` cancels a PR's `Checks` and `iPhone app` runs that are still queued or
  running when it merges or closes, by joining their concurrency groups. At 19:14, #204
  had been merged an hour while three of its last push's shards were still queued and
  running, ahead of the deploy its merge started; 38 runner-minutes in the window went
  to PRs already merged. It is its own workflow, not a `closed` trigger on `checks.yml`,
  so the deploy gate can never read a run of it as a green `Checks`.
  `npm run closedruns` (in Measure) holds the three files' groups to one spelling.
  As shipped in #234 it wrote the group with `github.ref`, which for a merged PR's
  closed event is the base branch, not `refs/pull/<n>/merge`: on #234's own merge it
  joined `checks-Checks-refs/heads/main` and stopped nothing. The follow-up builds the
  ref from the PR's number, and `closedruns` now evaluates closed.yml's side as a
  merged PR's closed event (red on #234's spelling, green on the fix).

*Measure after:* `npm run macqueue` over a like window once a day's PRs have run: the
gallery's share should be its labelled runs only, and the shards' mean wait below 19
minutes for the same number of open PRs. Left for the owner, since only a setting or a
bill changes it: more Mac runners at once (19g).

### 19b. Measure is near its timeout, and its first red hides the rest

**Shipped 2026-10-04 with 19h.** Over 87 green runs on 2026-10-03 Measure took a median
14.3 minutes and at most 14.9, against its 15-minute timeout. It is now three parts side
by side (`logic`, `sound` for the ffmpeg harnesses, `browser` for the Chromium ones), each
step with `!cancelled()`, `node --check` over the scripts in `logic` and `npm run wgsl` in
`browser`; a `Measure` job keeps the one name. The docs' "about a minute" in CLAUDE.md is
made true; `npm run check`'s "a minute" is the local run and was left.

The ubuntu job averaged 746 s over 14 runs (837 s at most) against `timeout-minutes:
15`, where CLAUDE.md says about a minute, `checks.yml` half a minute, and `README.md`
and `scripts/check.mjs` a minute for `npm run check`. By the runs' step times the long
steps are `drops` (166 s), `phone` (134), `shape` (98), `downbeat` (97), `bands` (48),
`kicks` (43) and `pacing` (37). Its thirty-odd steps have no `if: ${{ !cancelled() }}`,
so the first red step skips all the rest, where the Mac shards were built to run every
check whatever failed before it.

Two cheap gates belong in it as well. `npm run wgsl` runs on SwiftShader and is the fast
shader gate, but runs today only on the Mac `show` shard, behind its queue. And `node
--check` over `scripts/*.mjs`, `server/*.js` and `dc.mjs` takes 3.7 s: `tsc` parses only
a handful of the harnesses, so a syntax error in a Mac-only one is found after the Mac
queue.

*Fix:* two or three parallel ubuntu jobs (the audio harnesses, the browser ones, the
rest), `!cancelled()` on every step, the two gates, and the docs made true. *Measure:*
the job's wall time, and a step broken on purpose early on that still lets the later
ones report.

### 19c. Checks that can pass without measuring, and checks nothing runs

- `crash.mjs` waits 20 s for the GPU to draw, with `.catch(() => false)`; if it does
  not, the screenshot, loss, recovery, stall and fatal checks print `skip`, and the exit
  counts only FAILs. On a Mac runner that comes up with no adapter (§0 records one, on
  #189's deploy) the tools shard is green having tested none of them. `PHONE_GPU`,
  `SQUEEZE_GPU` and the `bands` rule under `CI` turn such a skip into a FAIL;
  `CRASH_GPU=1` on the shard would (`docs/crash-plan.md`).
- Thirty scripts in `package.json` run in no workflow. Most are hunts, benchmarks or
  tools for a hand, which is right. Four are not: `shelf` (CLAUDE.md asks for it on
  every sound change, and it is the only check on `plateDrone` and on the music's
  CORS), `sw` (the service worker's black-screen guard, and 14h's measure), `bubbles`,
  and `songs` (pure node, 15 checks in 0.05 s). `README.md` says every push to main runs
  its ten harnesses; `detail` is in no workflow.
- `scripts/check.mjs` finds the Measure steps by their `npm run` lines, so it leaves out
  `remotemix`, which Measure runs as `node … scripts/remotemix.mjs`.
- No harness reaches `songMap` and its worker, `plateDrone`, `controllerSurface`,
  `evolution`, `fingerprint`, `lyrics`, `musicDb`, `castProtocol` or `videoSense`
  (followed through every harness's imports with esbuild's metafile), and none opens
  `?cast`, so `CastDisplay` has no check (S15 in `docs/stability-plan.md` needs one).

- ~~`wall`'s "at least 0.9 times what the show drew on its own" goes red on a starved
  Mac runner~~ **Fixed 2026-10-03 (§14b-2):** the floor was measured against a different
  two seconds than it judged, and the gate on a starved machine really did turn down the
  show's own next frame; both fixed, and `wall` now makes the busy machine itself.
- ~~`wall`'s busy phase half a refresh behind goes red on a starved Mac runner with the
  gate right~~ **Fixed 2026-10-04:** #223's tools shard read the wall's asks at 8.9 a
  second (0.9x under the ceiling, 11.4 drawn against a floor of 10.3) and went red on
  the lines' fixed guard of more than 10 a second, which is there so that a clock that
  never ran cannot pass a ratio at 0 of 0. The busy machine misses half the refreshes
  on purpose, so a runner handing 22 of 60 hands 11. The guard is now 20 counted in the
  seconds measured (the same 10 a second for the 2 s idle phases), and the busy phases
  measure for 4 s, so they count as many refreshes as an idle phase. Five Mac runs
  since #236 read the busy wall's asks at 8.9 to 24.3 a second, 36 to 97 counted now.
  The `check-skeptic` found what the old guard had been standing in for, both now
  checked: the busy phases were placed by a 500 ms reading of the refresh, which a
  starved runner can read as two (half a refresh behind landed a whole one behind), and
  are now placed by the shortest refresh the idle phases read (and the idle phases by the
  shortest read so far, which put three quarters behind at one and a half on the same
  emulation); and a runner whose two
  windows miss different refreshes puts the floor's bar under what a right gate draws,
  so the fault the phase is for (the gate turning down the show's own next frame)
  cleared it. On one refresh the slots served must now be at most 1.15 of either
  window's frames (the Mac reads 1.00 to 1.02).
- `wall`'s busy phase half a refresh behind cannot see the gate turning down the show's
  own next frame on a runner whose two windows are handed different refreshes (the Mac
  read 1.69 slots per window's frame there once, with the gate right); only the one-refresh
  busy phase and the arithmetic catch it. The `check-skeptic`'s mutant turning down one of
  the show's frames in two passed every in-app clock line, idle and busy, though the
  comment on the floor says it is under it; only the arithmetic lines caught it. Build
  that mutant as a control and make an in-app line see it.
- `render-app`'s "the live loop draws again after every render" wants more than 5
  frames in the half second after each render, and read 5 after render M (music
  playing, a blackout near the end) on #236's show shard (2026-10-03), where the last
  dozen runs read M 10 to 26 and once A 11. A starved runner can stall the loop for
  a moment after a render, so the line judges the runner as well as the loop. What it
  means to ask is whether the loop resumes at all: count frames until a fixed number
  have been drawn, with a long limit, rather than frames in a fixed half second.
- ~~`startup`'s "no stop in the opening" charges Chromium's hold at the GPU's start
  to the page~~ **Fixed 2026-10-04 (this PR):** on main's 997c71f deploy (run
  37162044666) the adapter took 0.47 to 4.18 s, the page drew nothing from 1.00 to
  4.17 s, no long task, and a long animation frame over it named no script, exactly as
  the hold reads on every green run (seven read: 1.6 to 2.4 s from about 1.0 s, 0
  scripts, no blocking). 4b set it aside as the page's own code because a promise the
  page fetched had settled within 50 ms of its start, and check 4 read 3.18 s against
  2. The 50 ms was not the tell. What is (`scripts/pagehold.mjs`): the page's code
  after an await runs before anything else the page does, so a stretch after a frame
  or tick that followed the mark is not it; and for a fetch, a body read, an image or
  an audio decode, Chromium's long animation frames name that code as a script for as
  long as it runs (tried on each in a cloud session), while its hold names none. The
  GPU's own promises are named by nothing, so a stretch right after one stays the
  page's, as before. Frames are now placed by when their callback ran, not their
  timestamp: a frame begun before a second of the page's code carries the earlier
  time and made that code look already finished. The check-skeptic found the page's
  code after a promise the check does not wrap (`enumerateDevices`, `caches.keys()`,
  a Blob's body, all awaited by the app) read as held under both rules; any stretch
  the page's scripts or a blocked frame lie in is now the page's. The rule's thirteen
  cases (this red, the lab's recordings, and the ways it could tell wrong) are a check
  line on every run (the old 50 ms rule tells four wrong), with a control in the run's
  own Chromium: 0.7 s of a page's code after a fetch and after a Blob must read as its
  own and be named as scripts, since that naming was tried on the cloud's Chromium
  141, not CI's. The 2 s limit and the 4.5 s cap are unchanged. *Still open:* the
  page's code after a GPU promise that ends exactly where Chromium's hold begins, with
  nothing between, still goes to check 4; which promise settled at 1.0 s on that run
  is not known (the opening line now names it); and the rule's cases could run in
  Measure, being pure Node, if #239's owner of the workflows adds them.

*Fix:* `CRASH_GPU=1`; `songs` into Measure; `shelf`, `sw` and `bubbles` on a Mac shard,
or written into CLAUDE.md as by hand; `check.mjs` reading `scripts/*.mjs` paths as well
as `npm run` names. Each new check held red by the `check-skeptic`.

### 19d. The build and what it ships

- The main route loads about 527 KB of script gzipped (1.68 MB raw): the App's chunk
  236 KB, the engine's 186, React's 66. Only the routes are lazy (`main.tsx`: the App,
  the remote, the cast). `motion` is 42 KB of it, for 53 simple uses in six components;
  the phone's stage, the guide, the recorder, the MIDI panel and controller surface, the
  designer and Settings could each load when first opened. Do it after 14h's precache,
  since every lazy chunk is one more file that can be missing at a venue with no
  internet.
- No source maps are built, and the engine's chunk is named after its first module,
  `castProtocol-*.js`: a crash report's `App-*.js:1:NNNNN` cannot be read back to the
  code, and a GPU crash reads as a fault in "castProtocol" (`docs/crash-plan.md`).
- No workflow sets `permissions:`, so every job runs with the repository's default token
  scope, which `actions/checkout` leaves in `.git/config` while a PR's own scripts run;
  `FirebaseExtended/action-hosting-deploy@v0` is a movable tag handed the Hosting
  service account. Pull requests from forks get no secrets (`pull_request`, not
  `pull_request_target`), which is right.
- `package.json` has no `engines` where the harnesses need Node 22.6 or later (type
  stripping), and `README.md` says 18. `autoprefixer` is unused (no PostCSS config, and
  Tailwind 4 prefixes for itself); `vite`, `@vitejs/plugin-react` and
  `@tailwindcss/vite` are build tools listed as dependencies; several are a major
  version behind (vite, TypeScript, the React plugin, lucide).
- The Geist font's `@import` is dropped by the build; that is in #207, with 14h's fonts.

*Fix:* `sourcemap: 'hidden'`, the maps kept as a deploy artifact and not served, and
`manualChunks` naming the engine `engine`; `permissions: contents: read` at the top of
every workflow, and the Firebase action pinned to a commit; `engines` and the README;
the dependencies moved or dropped. *Measure:* the built chunks' names, and a report's
frame read back through its map by the `crash-triage` skill.

### 19e. The harnesses as code

Shared helpers exist and are used (`chromium.mjs` by 54 scripts, and `lab`, `frame`,
`judge`, `layoutProbe`, `media-read`), but 80 scripts define their own `check()`, 46
start their own `vite preview`, 40 wait a fixed two to four seconds for a server rather
than asking it, and 12 copy the same port probe. Default ports collide: 4351 is four
scripts' default (`bottles`, `moving`, `render-app` and `mirror.mjs`), 4331 three
(`crash`, `ears`, `stages`) and 4326 three (`fx`, `shots`, `sw`), which matters when a
session runs two at once. On the Mac shards seven checks called through `npm run`
(`webgpu`, `qa`, `fx`, `magnet`, `depth`, `wall`, `startup`) build again after the
shard's own build, about 6 s each; in Measure `layout`, `phone` and `applink` each build,
while `remotemix` depends without saying so on an earlier step having built `dist/`.
`dc.mjs` at the root and `scripts/_diag.mjs` are wired to nothing, and `dc.mjs`
hard-codes `/opt/pw-browsers/chromium`, which `chromium.mjs` exists to avoid.
`actionlint`, which CLAUDE.md asks for on a workflow change, is in no image and no job.

*Fix:* a `scripts/harness.mjs` with `serve()` (port 0, polled until it answers) and
`check()`/`summary()`, taken up by new scripts first; the shards calling scripts
directly, as `checks.yml` already does for some; the strays deleted or wired;
`actionlint` in Measure.

### 19f. The plan and the docs, out of step with the code

*2026-10-04 (#245):* the first three below are fixed (the order of work replaces "What
comes next"; the openings and §12's table say what is built), `docs/judging.md`'s numbers
were made unique in #230, and the order of work's "one home" table says where each
piece of twice-written work lives. Left: the flaky-check notes in §0 and §11 (their home
is now the order of work's 0.3), `docs/roadmap.md`, the dispatch counts in
`docs/webgpu-plan.md` and `docs/evaluation-2026-09.md`, and `README.md`. CLAUDE.md's
"about 38k" tokens for this file, which was about 75k, is corrected here.

- "What comes next" (2026-09-26) still says the Mixer's steps 2 and 5 are small and step
  3 is next (2 to 5 have shipped, #189 to #196), that batch 10's steps 4 to 7 are to
  come (4 and 5 shipped, #185 and #179), and never mentions §12 onwards.
- "Nothing is built" stands in the openings of §12 and §14, whose own items say
  otherwise (§12's step 4 and 4a built; 14a, 14c and 14d shipped). The running order's
  row 14 lists 14a to 14d only, and §17 has no row.
- §12's table says `public/sw.js` "already caches the build" for Android offline; 14h
  says, rightly, that it saves nothing ahead of time. §13's first "found along the way"
  point repeats 14h's first.
- The Mac checks that went red once on trees that did not touch them are written in
  both §0 and §11 (the Finger's "adds none", the mirror's "nowhere else", `startup`'s
  3.52 s): one list would say which are still open.
- `docs/roadmap.md` is headed "Updated 2026-09-20", lists §3's drops as in flight
  (shipped, #163), the rig as not begun with R7 to come (R7 is §11, shipped), and Stage
  1's "the press and the lift" as open (§10 step 4, #185).
- `docs/judging.md` has two §10s and two §16s; §12 and CLAUDE.md cite §16 for the
  iPhone, and 9i cites §16 for the Magnet's fingers.
- `docs/webgpu-plan.md` counts about 101 dispatches a step and `docs/evaluation-2026-09.md`
  24 Jacobi iterations; the multigrid's step is 440 to 530 (`docs/webgpu-plan.md` H2c).
- `README.md` still asks for the laptop window to be kept visible "since the browser
  stops drawing a hidden window"; the projector window drives the frames now, and the
  ear hears behind it (14a).

*Fix:* one pass over each in a docs-only PR, at a moment when no other session has these
lines open (#209 has "What comes next" and the operating rules open today).

### 19g. More Mac runners than the account's hosted ones

Even without the gallery, ten open PRs ask for forty Mac shards of about eleven minutes
each, about 440 runner-minutes, against a cap of five to eight Mac jobs at a time: an
hour and a half of queue for the last PR in line. Three ways to add runners, each the
owner's call: a self-hosted runner on the owner's own Mac (a real GPU and free; but on a
public repository a fork's pull request could run code on that machine unless
"Require approval for all outside collaborators" is set under Settings → Actions, and
`runs-on` would need a label that only same-repository PRs use); GitHub's larger macOS
runners (paid by the minute, on a Team or Enterprise plan); or fewer, longer shards,
which costs each PR more wall time to save the setup overhead, under a minute a shard
today, so not worth it. Also worth having: the deploy gate skipping more often, which
the owner's "merge behind main" rule (2026-09-28) trades away; 191 deploy minutes in the
window above.

### 19h. What a red PR costs, and which reds were the PR's own

Reported 2026-10-03 (the owner): "The CI reviews are taking way too long and failing
constantly." Measured from the Actions API over 04:00 to 23:45 UTC that day, 183 runs:

- **Red.** Of the PR `Checks` runs that finished, 30 were red and 35 green: 46 %. 44 Mac
  shards went red; about two thirds of them on a line the PR had not touched. By line:
  the wall 13 (its timestamp line until #218's fix, then "0.9 times what the show drew",
  #236), the drop map's "nowhere else" 9 (two after #225, one on #237, which changed only closed.yml, its check and PLAN.md),
  the phone's two-finger Drop 6 (twice on main's own deploys), "every tool adds none" 4
  (none after #222), the Press's own branch 5, the startup check 3 (#235), the Magnet 3
  (#230), grating 2 (#225's own), the rest once each. A deploy's own Mac run was red 4 times
  in 9, each on a line its PR did not touch.
- **Slow.** A Mac shard waited a mean 21 to 31 minutes for a runner (deploys' 33 to 41),
  then ran a median 13.2 (tools), 11.2 (plate), 8.8 (show) and 7.8 (open) minutes; tools
  at most 15.6, and Measure at most 14.9, both against 15-minute timeouts. Of about 4,400 Mac
  runner-minutes, the gallery took 1,219 (28 %, before 19a's change landed), PR shards
  about 2,700, deploys 356 and the iPhone build 100.
- **What would not help.** Moving the lab's checks to ubuntu's SwiftShader to free the Mac:
  timed in a cloud session, `lift` takes 162 s there against 20 s on the Mac, so the lab
  would need some eight ubuntu jobs and would be measured on a software GPU. Not done.

*Shipped (PR "CI: Measure in three parts, docs-only PRs skip the Mac, the shards evened"):*

- Measure in three parts (19b).
- `scripts/reach.mjs` (`npm run reach`, and a `reach` job first in `checks.yml`): a PR
  whose diff touches only Markdown, `.claude/`, `ios/`, `desktop/`, the six workflows
  that never run a Mac shard or the three scripts that check the workflows skips the Mac shards; `WebGPU (macOS)` is green when they ran
  green or were skipped for that reason alone. Measure always runs; a deploy always runs
  the Mac; `scripts/deploygate.sh` never trusts a run that skipped it (main's code under a
  docs-only merge is whatever the last merge left, which a red deploy may not have passed).
- The shards evened: the phone's fingers (3.4 min) from tools to open, after the startup
  check; the mixer (1 min) from plate to show. By the medians above the longest shard goes
  from 13.2 to about 11.2 minutes, and none is near its timeout.

*Measure after:* the shards' medians and maxima, and the PR runs' red rate by line, over a
like day (`npm run macqueue -- --hours 24` for the time).

*Left:*

- **19h-1. The drop map's "nowhere else" after #225.** Red on #237 (closed.yml, its
  check and PLAN.md) with #225 in it: drops 1 and 2 clean, then the far plate drifts from drop 3 (drift 1.0 → 28).
  Another source moving the whole plate, as the held press was. Handoff:
  `handoff/ci-overhaul/mirror-nowhere-else-after-225.md` in the project's files.
- **19h-2. The phone's second finger lays a third as much as the first, or nothing.** "A 23
  steps, B 11 steps" with both down; the same pixels land on different cells run to run.
  Reads as a multi-touch Drop bug. Handoff: `handoff/ci-overhaul/phone-two-finger-drop.md`.
  **Found (#240): not a multi-touch bug.** The one-finger-at-a-third reds were the fingering
  push #222 took out, which threw away up to 60 % of a held pool by where and when it was
  laid; `grating`'s §6 holds two Drops at ten moments and reads the old push 0.40 apart,
  today's 1.00. The rarer case of both fingers low at once is still open (batch 11's
  two-finger entry), and `phone` now prints what the plate gained of what it was handed.
- **19h-3. The deploy's second Mac run. Shipped in the same PR, the owner's choice
  ("Skip if no overlap", 2026-10-04).** Every merge behind main (the owner's rule since
  2026-09-28) re-ran all four shards on the deploy: 14 of the last 20 merges, about 50
  minutes from merge to live each, red 4 times in 9 on lines nothing in the merge touched.
  `deploygate.sh`'s rule 5 now answers `disjoint` when the PR's run passed the Mac on an
  older main, the site files it changed (`reach.mjs --site`: src/, public/, index.html,
  the build config, the lockfile, package.json beyond "scripts") are not ones main changed
  since, everything else that differs is main's own change, and no deploy since the run's
  base went red; the deploy then runs Measure on the exact tree and not the Mac. By file
  alone it never held (every PR adds a step to checks.yml and a script to package.json);
  by site file, `npm run deploygate -- --history 20` reads 6 exact and 9 disjoint of 20,
  so 15 of 20 merges deploy without waiting for a Mac, against 6. The two it refuses share
  `src/App.tsx` (#233) and the solver (#225). What no deploy measures now: two PRs in
  different site files moving the same picture; the next PR's own run, on main with both,
  measures that.


### 19i. A green Mac result carries across a merge of main

*Measured 2026-10-04 over 25 merged PRs (#204 to #244), 103 `Checks` runs.* A PR ran its
checks about four times. Of those runs, 53 started on a push that only merged main in, and
8 on a docs-only commit: together 61 of 103 runs and 2,011 of 3,124 Mac runner-minutes
(64 %), on pushes that added none of the PR's own site code. They also held 20 of the 29
runs that went red on their first attempt. Each restarts all four shards, 37 to 62
minutes of wall time since #239 (75 before), at a time when the five Mac runners were 87
to 91 % busy, so every one of them lengthened everyone else's queue too.

*Fix:* the PR side of `deploygate.sh`'s rule 5. When the new head's tree differs from the
tree of the PR's last green Mac run only in files main changed (and those are disjoint
from the PR's own site files, `reach.mjs --site`), or only in files that never reach a Mac
shard, the shards are skipped with the verdict "carried", and the deploy gate follows that
chain back to the run that passed. The ship skill then merges without bringing main in
whenever the gate would say `disjoint`. *What it leaves unmeasured* is what 19h-3 already
accepted for deploys: two PRs in different files moving the same picture. To keep every
check running on the combined tree, one full Mac run on main every N merges, or after each
publish with 19o's rollback behind it. *Measure:* Mac minutes per merged PR and runs per
PR over the next 25 PRs, against 125 and 4.1. *Size:* M.

### 19j. A merge with no site change deploys nothing

**Shipped** (#253). Eight of the last thirty merges changed no file the site is built from
(`reach.mjs --site`): docs, check scripts, workflows. A docs-only merge still ran every Mac
shard on its deploy (rule 3, because its PR skipped them): 84bb112 (#245) went live 79
minutes after its merge; a check-only merge cost eight minutes of Measure.

*Fix, shipped:* rule 6 in `deploygate.sh`. When no site file differs from the commit that is
live (the head of the last green deploy run to start before this one, on any branch, so a
re-run of an old deploy counts by when it ran), the deploy answers `nothing`, checks and
publishes nothing, and is green in seconds, so the concurrency group is free for the merges
behind it. A change to the gate or `reach.mjs` always deploys, and a filter that fails never
reads as "no site file". A changed check script still ran on its own PR; a run by hand still
checks and deploys, and is now how a changed `VITE_*` secret goes live. *Measured:* `npm run deploygate -- --history 30` gave 5 `true`, 16
`disjoint`, 9 `false` before; 5, 14, 8 and 3 `nothing` after (84bb112, 3586ead, e199bd3:
together 95 minutes of deploy time, 79 of them behind the Mac). `vite build` of each of the
three and of the commit live before it gave the same 25 files byte for byte; a site merge
(87b06a6) differed in 8. The other five non-site merges did not qualify, rightly: two were
runs cancelled before they started (a newer merge took their place in the queue), and three
followed a site change whose run was cancelled or red, so theirs was the deploy that put it
up (d027626's 111 minutes, which this section first counted as a docs-only wait, were three
PRs' site changes going out). The gain grows with 19i and 0.3: fewer red or superseded
deploys leave more docs merges directly on top of a live commit.

### 19k. One manifest of checks

Every new check edits `.github/workflows/checks.yml` and `package.json` (13 and 14 of the
last 30 merges), which is where three of the recorded merge conflicts were. Seven of the
last 25 PRs changed only check scripts and needed one shard of four, but ran all four (17
runs, about 30 Mac-minutes each). And `npm run check` runs about 35 scripts one after
another, some 15 minutes, where its header says a minute.

*Fix:* `scripts/checks.json`, one entry per check (its name, its shard, its command, the
`src/` files it imports, from esbuild's metafile, as 19c traced). `checks.yml` builds each
shard's steps from it; `package.json`'s scripts stay for hands, generated or checked against
it. A PR that changes only check scripts runs the shards those scripts are in, plus Measure;
a change to `src/`, a shared helper (`frame`, `chromium`, `lab`, `lab-entry`) or a workflow
selects every shard. `npm run quick` reads the same map and runs, in parallel, the checks
the diff reaches, which is CLAUDE.md's "which checks for which files" table made
executable. *Measure:* Mac minutes on check-only PRs, and conflicts in `checks.yml` and
`package.json`. *Size:* M.

### 19l. App frames readable in a cloud session

CLAUDE.md says the full app on software WebGPU returns zero readbacks, so `qa`, `tools`,
`magnet`, `mirror` and the rest can only be run on the Mac, after a push and a queue.
*Read 2026-10-04 in a cloud session, Chromium 141:* headless, the device is lost at the
first canvas present ("A valid external Instance reference no longer exists"), which is
why the lab, which never presents, works. Headed under `xvfb-run` with the same flags the
device survives and `__cgFrame` returns the app's frame (1280×800, mean 0.29); `tools` gave
7 of 15 real readings, where headless gave 3 of 14, all zeros. The rest failed on speed: the
plate stepped 8 times a window against 21 to 25 on Metal.

*Fix:* `scripts/chromium.mjs` launches headed under xvfb when `PW_WEBGPU=1` on Linux
(`scripts/desktop.mjs` already re-executes itself under `xvfb-run`); checks wait for the
engine rather than sleeping, and count windows in steps where they count seconds. CI stays
on Metal, as 19h's "what would not help" found. A session can then reproduce the logic of
a Mac check before it pushes; about a third of the Mac reds were the PR's own (19h).
*Measure:* the same commit through `tools`, `magnet`, `mirror` and `bottles` in a cloud
session and on the Mac: the lines that do not depend on the step rate agree. *Size:* M.

### 19m. Fragments for the shared documents, and this file as an index

Of 61 merges of main into PR branches, 25 recorded conflicts: `PLAN.md` 14, `docs/judging.md`
7, `CHANGELOG.md` 4, `package.json` 3, `checks.yml` 1, `src/` 2, and none in `App.tsx` or
`LiquidVisualizer.tsx`. `PLAN.md` is touched by 29 of 30 merges and is about 75k tokens
whole (CLAUDE.md's "about 38k" is half the real figure), so a session that reads it pays for
it on every step after.

*Fix:* each PR writes its plan, judging and changelog notes as a new file in `plan.d/`,
`judging.d/` and `changelog.d/`, which nothing else edits; a small fold puts them in place
after merge. And `PLAN.md` becomes this order of work and the running order, with one file
per section under `docs/plan/`, so a session reads the index and its section. Done in one
PR at a quiet moment, with a table from old line ranges to new files so a branch caught
mid-move can re-apply its edit. *Measure:* conflicts recorded per merge of main, and bytes a
session reads to start. *Size:* M.

### 19n. A shorter deploy

A deploy that runs Measure and not the Mac takes 8.0 minutes: Measure's sound part is the
critical path at 6.7 (`shape` and `downbeat` 96 s each, `bands` 48, `kicks` 44, and 23 s of
apt installing ffmpeg), then 0.8 to build and publish. *Fix:* split the sound part in two,
cache or vendor a static ffmpeg, and build beside Measure into a channel that
`hosting:clone` makes live once Measure is green. About 5.5 minutes, and docs-only PR runs
faster with it. *Size:* S.

### 19o. A rollback in under a minute

Today a bad deploy is undone by a revert PR, its checks and a deploy: 40 to 60 minutes, at
a gig. *Fix:* a `workflow_dispatch` that runs `firebase hosting:clone` of the previous live
version, and a `show-YYYY-MM-DD` tag on each green deploy the owner has judged, which 14p's
`npm run show` plays. It is also what makes 19i's after-publish Mac run safe. *Measure:* the
time from dispatch to the previous version live. *Size:* S.

### 19p. A preview URL on every PR

`docs/judging.md` is edited by 12 of the last 30 PRs, and every one of those waits for the
owner's eyes after it is live, so a look that is wrong costs a follow-up PR and a deploy.
*Fix:* `action-hosting-deploy` without `channelId` on pull requests posts a preview URL per
PR (forks get no secrets, which is right), about a minute of ubuntu a push; the judging
sheet (19t) links each item's preview. *Size:* S.

### 19q. Auto-merge, and nothing merges red

`main` has no protection, `allow_auto_merge` is off and there are no rulesets, so a session
polls for green and merges by hand (a median of a minute after green, so it is quick, but
each poll is a session's wake), and nothing stops a red merge. *Fix, in the owner's
settings:* a ruleset requiring `Measure` and `WebGPU (macOS)`, and auto-merge on; a session
arms it when it opens the PR ready. A merge queue is not offered on a repository owned by a
user. *Size:* S.

### 19r. Smaller, for the same pass

- The open shard is back near its timeout after #239's rebalance: median 12.6 minutes, green
  maximum 14.1, one cancelled at 15.3 (#240). `startup` (349 s) and the phone's fingers
  (224 s) dominate it; move one, as #239 did.
- `npm run lint` takes 18 to 24 s; `tsc --incremental` with a kept `tsbuildinfo` takes 3.5 s
  warm. A Playwright cache on ubuntu saves 23 s a Measure part.
- `tools`' "Pour lays more than Drop" passes at 0 against 0: a check that cannot fail on the
  case it names (the `check-skeptic` rules, `docs/roadmap.md`).
- Rejected with evidence: building once and sharing `dist` across shards (setup is 28 s of a
  9.4-minute shard), a faster session start (`npm install` is 10 s warm), and moving app
  checks to ubuntu (a third of Metal's step rate).

### 19s. A ledger of reds, so the worst check is fixed first

Over 2026-09-27 to 10-04, 26 failed jobs were re-run by hand and 14 went green with nothing
changed; 12 of the last 25 PR runs were red on their first attempt, mostly on the plate,
tools and open shards, and both deploys that failed since #239 were red on lines their PR
did not touch. Each such red costs a push or a re-run and a queue. The record of them is
spread over §0, §11 and 19h, and nobody can see which check costs most. A re-run that
passes is never an answer here; the check is either wrong or measuring a real fault.

*Fix:* `npm run reds -- --days 7`, from the Actions API: each failed line by check, how
often, on which trees, whether the PR touched what it measures, and whether a re-run went
green. The steward takes the top line first. The open ones today are listed in the order of
work's 0.3, which is now their one home. *Size:* S, then one PR per check.

### 19t. The owner's judging sheet

47 items wait on the owner's eyes on the Mac (the order of work's Wave 2), spread through
`docs/judging.md`, the running order and this file's sections. *Fix:* `npm run judging`
writes one page: each item with the build it shipped in, the link that opens it (a preview
URL from 19p, or the live site with its query), what to look at and what would be wrong,
grouped so one sitting covers one area, gates first. The owner's verdicts go back as one
commit. *Size:* S.

## 20. Lace and holes: a pale film torn open over colour

Asked 2026-09-28. The owner sent a still from another performer's liquid light show
and asked what it would take for the plate to look like it.

What the still shows:

- a pale layer, white with faint pink and lavender in it, torn into a **lace** of holes
  from a pixel or two to a sixth of the frame, many of them stretched along the flow
  into slits;
- rows of small **dots** along the lace's edges and ligaments;
- a thin **dark line** round every hole and every edge of the lace, and edges that are
  sharp rather than soft;
- flat **discs**, round and translucent, with a faint darker rim, sitting over both
  the lace and the colour;
- behind it all, **dense colour fields** (orange, red, indigo, a little teal) in
  streaks, going black where two dense dyes overlap.

This is not batch 2's lacing, which paints hair-thin filaments along dye boundaries.
Here the pale part is a liquid of its own, and the holes are where it has come apart.

### What each feature is, physically

**The pale lace is clear liquid under the lamp, not white paint.** On a projector the
lamp shines through the dish, so a region with no dye in it throws the lamp's own white.
A milky or white-pigmented liquid would throw grey or dark, because the light it
scatters misses the lens (18j). So the lace is a clear liquid (most likely an oil)
that fills most of the gap between the glasses, with a thin layer of dyed water left
under it: that thin layer is the pink and lavender tint. Where it has torn, the dyed
water spans the whole gap and the colour shows at full strength.

**The holes are a thin film dewetting.** A liquid film thin enough to feel the glass
(well under a millimetre) is only metastable. Where it is thinnest, or where a speck
of dust or a drop of solvent lands, it ruptures, and the hole grows as surface tension
pulls the film back. That is dewetting (Reiter 1992; Brochard-Wyart and Daillant 1990).
Its signs are all in the still:

- **Holes of many sizes.** Holes open at different times and grow from their own
  moment, so the early ones are large and the late ones small. A film's spinodal
  spacing also grows as the square of its thickness (for van der Waals forces), so
  thin parts of the film tear fine and thick parts tear coarse.
- **The lace.** Neighbouring holes grow until the film between them is a network of
  ligaments.
- **The dotted rows.** A ligament is a thread, and a thread breaks into a row of drops
  (Rayleigh–Plateau). So does the ragged rim at the film's edge.
- **Slits.** The dish is flowing while the holes grow, so the shear stretches them.

A drop of alcohol or a surfactant makes holes on purpose. It lowers the surface tension
where it lands (about 22 mN/m for alcohol against 72 for water), and the film is pulled
away from it (Marangoni flow). Performers use exactly this gesture.

**The dark lines are refraction, not ink.** Oil (n ≈ 1.47) and water (1.333) differ,
so where the film's thickness changes steeply, the optical path through the gap
changes steeply and light is bent out of the projector's lens. That draws a hairline
at every edge; a slight defocus adds a bright partner (a shadowgraph). This is 18e.
The edges are sharp because two immiscible liquids keep a real interface, where
dyes in water would blur.

**The discs are flat drops of oil in the gap.** A drop wider than the gap is squashed
into a pancake: flat in the middle, and curved only at the rim. So only the rim bends
light out of the lens, which gives the faint dark ring. The body tints what is behind
it by absorption, because the oil is lightly dyed or the water under it is thinner.
They sit over the lace, so they are in the other layer (the front plate) or against
the other glass.

**The colour fields are dye by absorption.** Dense dye through the full gap is deep and
saturated, and two dense dyes overlapping go black (subtractive mixing). The fine
streaks are dye drawn out along the flow (18h).

**An alternative, to check against a video.** A mixture of oil, alcohol and dyed water
can also break up by phase separation as the alcohol leaves, with no film. The two can
be told apart in motion. Dewetting holes appear one by one and each grows steadily
from its own start. Phase separation appears everywhere at once, at one size, and
then coarsens slowly (as t^(1/3)). A clip of this performer's show through the
`watch` skill would settle it. The plan below follows dewetting, which the still fits
best, and the prototype supports it.

### The prototype

`/mnt/project-files/lace/lace.py` (project files, not the repo) is a CPU prototype in
numpy on a 384² periodic grid. It checks that this physics makes the picture before any
of it is written in WGSL. The gap has depth 1. A clear oil film of thickness h lies
against one glass, and dyed water fills the other 1 − h. The film obeys the
thin-film equation:

    ∂h/∂t = ∇·(h³ ∇p) − ∇·J_M − u·∇h
    p     = −σ∇²h − Π(h) + (top glass)
    Π(h)  = K[(h_p/h)³ − (h_p/h)²]    (disjoining pressure; h_p a precursor film)
    J_M   = −k h² ∇Γ                   (film pulled away from a solvent Γ)

It is solved semi-implicitly (spectral) with the film conserved to the last digit.
Solvent drops land now and then, then spread and evaporate, and a slow stir carries
everything. The picture is Beer–Lambert through the gap: lamp × exp(−Σ εᵢcᵢ(1 − h)),
with the aperture loss and a shadowgraph term taken from the optical path
1.47h + 1.333(1 − h). Three flat oil pancakes are laid on top.

What it showed, at 2,000 steps:

- **The film tears on its own.** Nothing in the code draws a hole, a rim, a ligament
  or a dot. There are 76 holes, with diameters (in cells) of p10 1.1, p50 2.9, p90 16.4
  and p99 107: a hundredfold spread. The ligaments break into rows of drops along
  every edge.
- **The ground decides whether any of it shows.** The same state drawn the way the
  plate draws today (dye on a black ground) puts 0.0% of pixels near white, and the
  lace is black. Under the lamp, 10.1% are near white and the lace reads as the
  still's does. `today-lamp-refraction.png` shows the same state three ways.
- **The dark lines come out of the optics.** They appear with the aperture and
  shadowgraph terms, with no painted edge. At first they came out too heavy (lines 3–4
  cells wide), and they needed a narrower cone than the drops use. That is the
  question 18e already asks about `DROP_NA`.
- **It does not reach the still's stage.** In the still, the film still covers most
  of the lace and its holes are cut clean, with no raised rim. The prototype's film
  (a no-slip lubrication film, mobility h³) builds rims and retracts into a thin
  network before the holes are dense. Holes that open with no rim, growing
  exponentially, are the signature of a **viscous** film retracting on a liquid
  underneath: its own stretching viscosity resists it, not the glass (Debrégeas,
  Martin and Brochard-Wyart 1995, R ∝ exp(σt/ηh)). So the real film is thicker and
  more viscous than the prototype's (a heavy oil or a syrup), and 20c is the fix.

Pictures in `/mnt/project-files/lace/`: `reference-vs-prototype.png`,
`lace-over-time.png`, `today-lamp-refraction.png` and `lace-final.png`.

### Where the plate stands

| Feature | What the plate has | What is missing |
|---|---|---|
| White where there is no dye | Dye stored as absorbance; the gap bound in the plate pass | The lamp ground: 18b, shipped (#256) behind Lamp Ground; a look must turn it up (20a) |
| A film that tears | A Cahn–Hilliard phase (Oil Bodies, §10 step 5; the ferrofluid) with flux-form transport, Rayleigh–Plateau for free; `marangoniFlux` moving what rides the surface away from soap | A film **thickness** field with a disjoining pressure; nucleation from solvent and dust |
| Rimless holes, slits | Flow shear; 18a's thin-gap flow (Thin Gap, on in every look since #248) | A viscous film (20c) on 18a's per-liquid mobility (18d) |
| Hairline edges | The projector's aperture law for drops and bubbles (`dropLens`, u*) | The same law applied to every edge: 18e |
| Flat discs | Drops flattened by the half gap (`DROP_HALF_GAP`); Oil Bodies; two layers | Large pancakes poured on the front layer, and tinted by absorption (18b) rather than glowing |
| Dense colour going black | Subtractive mixing in the solver | Shown only with the lamp ground (18b); streaks: 18h |

### 20a. A look on the lamp ground (depends on 18b)

Nothing below shows without it: under today's ground the lace is black. 18b already
plans the lamp as a per-look choice. This look is the first that must have it, so it
is a good first customer. **Check:** the prototype's white fraction measured in the
lab: a clear pool on the lamp ground throws at least 90% of the lamp, and the same
pool on the black ground stays the control.
**The ground shipped (18b, #256):** `npm run lamp` reads the clear pool at 100% of the
lamp and 0% on black. What is left of 20a is the look itself, on Lamp Ground 1.

### 20b. A clear film that tears (the thin-film equation)

- **What:** a new liquid, a clear film against the glass. It gets its own thickness
  field h (one R32F texture), moved with the plate's flow in flux form (`mixAdvect`),
  and evolved by the thin-film equation above. The water under it is the gap less h,
  which feeds the lamp's Beer–Lambert (18b) and the optical path (18e).
- **Nucleation, never a timer:**
  - Holes open where the film is thin (the disjoining pressure's spinodal band), and
    where solvent lands. Alcohol and soap already go into the mix's surfactant
    channel, and `marangoniFlux` already moves what rides the surface. The film is one
    more thing it moves.
  - Dust is a fixed, seeded field of weak spots (a slightly lower local K), so a
    thick film left alone stays whole, and a thin one tears where the dish is dirty.
- **Kernels:** `filmMu` (p = −σ∇²h − Π(h) plus the top glass) and `filmUpdate` (∇·(M∇p)
  in flux form, degenerate mobility M = h³ or 20c's). They have the same shape as
  `mixMu` and `mixUpdate`, which are Cahn–Hilliard with a constant mobility.
- **Cost:** unmeasured. The explicit fourth-order update needs a small step. The film
  can run at half the dye's grid, with 6–10 substeps of two light passes, or with a
  few Jacobi sweeps of a stabilised semi-implicit form. The estimate is 0.2–0.4 ms at
  the 768² rung. It is skipped entirely when no film is on the plate, like the oil's
  kernels.
- **Checks:**
  - A new lab check, `lace`: the film's volume conserved over 20 s;
  - a thick film with no dust and no solvent stays whole for 20 s (holes come from the
    physics, not a clock);
  - a solvent drop opens a hole whose radius grows steadily;
  - on a dusty thin film, the hole diameters span at least tenfold (p10 to p99);
  - after the lace forms, the count of separate film pieces rises (the ligaments bead);
  - the same film on today's ground is the control.
  - The `look` skill renders it beside the still.
- **Tools and phone:** the performer's gestures are pouring the film, which is a
  bottle (15a lays it from every tool), and a drop of alcohol, which is a bottle that
  punches a hole where it lands. Both are in the phone's bottle picker and on MIDI,
  like every other bottle.

### 20c. The lace stays lace: a viscous film

The still's holes have no rims and the film between them stays wide. That is a viscous
film, whose own stretching viscosity 4ηh resists its retraction (a Trouton sheet), not
a thin film dragged over the glass. Two ways to get it, in order:

1. **On 18a (shipped behind Thin Gap, on in every look):** the film as a phase of high
   viscosity in the Hele-Shaw solver. The
   hole is water invading a viscous liquid under capillary pressure, resisted by
   Darcy drag. This needs 18a's variable mobility and 18d's per-liquid viscosity, and
   costs nothing beyond them.
2. **Standalone:** the film's own in-plane velocity from the viscous-sheet equations,
   ∇·[ηh(∇v + ∇vᵀ + 2(∇·v)I)] = drag, driven by the film's edge tension 2σ. That is
   a vector elliptic solve like the pressure's. Try this only if the first way fails.

**Check:** a hole in a viscous film grows exponentially with no rim. The rim excess,
the film's thickness at the edge over its far thickness, stays under 1.2, where the
prototype's h³ film reaches about 2. A sheared hole stretches along the flow by at
least 2:1 before it meets another.

### 20d. Hairline edges from the optical path (this is 18e)

No new work beyond 18e, but this look is its test: every edge of the lace is an
oil–water step of Δn ≈ 0.14 across up to the whole gap, the strongest the plate will
ever draw. **Check:** the line's width in the `look` render is one to two pixels at
1080p, and it sits on the edge.

### 20e. Flat discs on the front layer

- **What:** pouring large oil drops (up to about a sixth of the frame) on the front
  layer, where they sit over whatever the back layer holds. They are flat in the
  middle by the half gap, as `dropLens` already draws them. Their body tints by
  absorption through 18b, and the rim's ring comes from the aperture.
- **Missing:** the drop sizes' upper bound (`dropRadius` redraws past 5.2), and a
  look that pours drops on the front layer while the back layer carries the colour
  and the lace.
- **Check:** in the `look` render, a disc's middle is within 10% of the colour behind
  it, times the oil's tint, and its ring is darker than both sides.

### 20f. A look that puts it together, and its cost

A look with dense orange, red and indigo water on the back layer, the clear film
poured over it, alcohol on the sound's accents, and oil discs on the front. It is
named for what it is (Lace), not for the performer. It ships with its phone version,
like every look. It needs 18b, 20b and 20e; 20c and 18e make it match the still, and
it is judged on the Mac against the still.

**Order:** 18b (already planned first among the optics), then 20b with the lab check,
then 20e, then 20c on 18a's solver (shipped) once 18d gives each liquid its viscosity. 20a and 20d are the checks that
this look holds 18b and 18e to.

## 21. Looks after painters

The owner, 2026-09-27, over a screenshot of Classic at 2.8x covered in red dots on
white by accident: "kinda cool, Roy Lichtenstein type style ... let's reserve this
effect for a particular preset and a particular control." What makes the dots on
Classic is another thread's to find and stop; this section is the effect on purpose.

**Shipped: Roy, 1963, and Ben-Day Dots.** A control (`benDay`, Settings → Look, MIDI,
the desks, the remote, and the phone's Looks sheet while a look prints) that reads the
finished picture as a comic printer would: dark is black, anything lit is white paper
with one of three process inks on it (red, yellow, blue, whichever the hue is
nearest), a pale wash is that ink laid as even Ben-Day dots on a 45° screen fixed to
the picture (32 rows down it), and a strong one is the flat ink. The front plate's
shapes are outlined in black from its dye, a pen's width (a ring of taps round each
pixel), and so are the seams where two inks meet. Only Roy turns it up: big flat
pools of the three primaries in thin washes of themselves on a white light table,
milk and ink so the shapes keep their own edges, and nothing that shades (no gloss,
hot-spot, beads, bubbles or closeup texture). `npm run benday` measures the print on
a lab plate: a wash is 242 separate dots against 256 on the lattice, one size to
2.7%, fixed while the plate turns; a pool is one flat ink with a line all the way
round it and a line where red meets yellow; and only Roy prints.

Open:

- **21a. Judge it on the Mac** (docs/judging.md §27): the dots' size on a wall, the
  line's weight, and whether it holds up moving at 60 fps. The lab shows still frames.
- **21b. The line is drawn round the front plate only.** It needs the dye, and it is
  drawn from the front plate's; a second plate, the film and the lamps are printed
  (dots and inks) but not outlined. Roy has one plate, so it does not show there.
- **21c. The dots do not grow with the zoom.** The screen is fixed to the picture,
  as a print's is; the owner's accidental dots at 2.8x were about twice the size.
  If a bigger dot is wanted in the closeup, the pitch could follow the zoom.
- **21d. More painters.** The same print with other inks is the start of more looks
  after painters (a Warhol screen print's off-register blocks, Riley's black and
  white, Rothko's soft fields); none is planned yet.


*Found along the way (for §14b's owner, not this section's):* on this PR's two Mac
runs, `npm run wall`'s "every refresh's own timestamp was believed" read 2, 4, 4, 5, 5
and then 1, 1, 1, 1, 3 fallbacks across its five two-window cases, while #207's run on
the same base read 0; the same harness in a cloud session reads 0 on this branch, and
the plate's display pipeline compiles in the same time with and without the print
(SwiftShader, 2.0–2.4 s both). `stampFallbacks` is a page-wide total, so one early
fallback turns every later case red, and it did not say which bound tripped. This PR
now counts them apart (`stampMisses`), and the next Mac run said which: 4 to 6, every
one ahead of now, the worst by 2.4 ms in every case, none stale. The draw gate had
believed a stamp only up to 2 ms ahead, on the belief that Chrome never stamps a
refresh ahead of now; it now believes up to one 240 Hz refresh (4.2 ms), which the
gate's 0.6-of-a-refresh margin already treats as the same refresh. Still open for
§14b: which clock runs ahead (the show's frames or the wall's converted ones; the
count is page-wide), and whether the 2.4 ms is a Mac display link stamping the refresh
a frame is for (inferred, not measured). And the line catches a wrongly converted wall
only because the harness opens the wall five seconds after the show (the conversion's
error is that gap, caught by the one-second stale bound); with under a second between
them it would pass. The harness should check its own gap is over a second.

## 22. Spin the plate

Asked 2026-09-28: "spin the plate on command, or set it to spin automatically at some
rate (or a rate controlled by some other factor, like music tempo); give me a control
(like press) and a setting."

**22a, shipped (#223).** The **Spin** tool (N on the desks, a tool on the phone's dock and the
remote's pad), and **Auto Spin** (Off, Rate in rev/min either way round, Tempo at a turn
every 1–64 beats) with **Reverse Spin**, on the sheet, the phone's Play sheet, the
remote, MIDI and the desks. Off by default, so every look is as it was.

The dish is a real rotating dish, not a turned picture (`src/lib/turntable.ts`, the
`spinSwirl` kernel in `src/gpu/wgsl/fluid.ts`):

- **The glass drags the liquid round through the gap.** The bulk of the liquid follows
  the dish with the gap's drag time τ = h²/12ν: at the 6 mm rest gap water takes 3 s,
  the thick liquid 0.15 s, oil 0.06 s. The picture is the liquid, so it trails the
  glass by Ωτ at a steady turn. `npm run turntable`: 63% in one τ at any frame rate,
  the lag Ωτ to 2%.
- **Where the gap is tight the liquid is gripped harder.** What is left of the dish's
  turn after the bulk (A = Ω − ω_l) drives a swirl w with the Hele-Shaw drag
  k = 12ν/h² in each cell: dw/dt = A(k − k0) ẑ×r − k w, integrated exactly. A pressed
  palm goes round with the glass (0.86 of A r) while the plate away from it barely
  moves (0.029); a domed plate swirls at A r (1 − h²/h0²) to 1.3%; oil in water is
  gripped harder than the water (0.69 against 0.087). `npm run dish`.
- **Spun, the heavy goes out and the light comes in.** The centrifugal force on a
  density contrast β is −∇(ω² r²/2)·β: dense dye (Solutal Buoyancy's contrast) is flung
  outward and oil (12% lighter) drawn inward. `npm run dish`: +1.75e-2 and −1.12e-2.
- **Tempo is locked to the beat**, not only to its speed: the dish is steered to where
  the counted beats put it, so a knock is taken back (0.008 rad off, 20 s after a
  0.5 rad/s flick) where a motor asking only for the speed stays knocked off (0.73).
  With no beat heard it turns at the Rate; a beat once heard is held.
- The swirl only runs while the dish and the liquid turn at different speeds (or the
  liquid turns), and a tail after; otherwise it is zero-filled and skipped, and the
  flow the dye rides is a still plate's to the bit (`npm run dish`, "largest
  difference 0").
- The phone's landscape dock now goes to one row at 860 px, not 800: eleven buttons on
  the tools' side need 856. The desks' tool row wraps inside its column at 1024.

**Shortcuts, named so they are replaced:**

- **22b. The swirl is not carried by its own flow.** τU/L is about 1 for water spun
  hard, so the swirl's inertia matters there; it is integrated in place. Advect it
  with the velocity (a semi-Lagrangian step, as the current is).
- **22c. Coriolis is left out.** In a flat gap it is a pure gradient for a
  divergence-free flow and the projection takes it; with a varying gap a sliver is
  left. Add 2ω_l ẑ×u where h varies, and measure what it changes.
- **22d. The CPU solver gets the bulk lag and not the swirl.** Where there is no
  WebGPU, `FluidSimulation`'s own step (`LiquidVisualizer.tsx`) turns the picture
  with the liquid but has no swirl; give it `spinSwirl`'s few lines.
- **22e. The liquid's drag on the dish is ignored.** The dish is a flywheel with its
  own drag (the plate's old spin), not slowed by the liquid it drags; a thick liquid
  should brake a flicked dish harder than water.
- **22f. The performance recorder does not record a Spin hand.** A spin from the tool
  replays as nothing; Auto Spin is a setting, so it replays.
- **22g. With Thin Gap on (18a, #220).** The swirl field hands the thin solve the
  dish's drive as a speed at the rest gap, a/k0, and the solve's own drag 12ν/h²
  brings the liquid to a/k and makes it conserve liquid (`npm run dish`: a pressed
  palm 0.607 against the old plate's 0.534, away from it 0.006 of that; handed the
  integrated swirl it counted the gap twice and the palm read 0.045). Properly the
  dish's drag is a force in the thin solve's own momentum balance (A(k − k0)ẑ×r beside
  18a-2's forces), with no swirl field at all. 18a-2 built that drag for a glass
  sliding as a whole (Glass Smear: hsPrep's A.b.zw, the liquid driven toward U/2
  with the gap's own 12ν/h²); the dish is the same with U = ω×r a cell at a time.
- ~~**22h. The look's own turning is still rigid.**~~ **Shipped** (#252). There is one
  dish under a plate now. The look's motor, the music routed to rotation and a flick
  turn the same glass as Auto Spin and the Spin tool; the speeds add, the liquid follows
  their sum with its drag time τ = h²/12ν, and the picture turns with the liquid alone
  (`dishFrame` in `src/lib/turntable.ts`). The twist's flick half, a stir in the current
  standing in for the drag the rigid picture was not getting, is retired: kept, it
  would have dragged the liquid twice. Measured (`npm run turntable`, checks 10–14):
  - a look nobody turns is exactly still, ten minutes at 60 fps;
  - a flick on water leaves the picture behind (0.061 of the glass's 1.83 rad/s after
    0.1 s) and it comes up to the dish on the exact answer for a coasting dish, to
    0.83% at 1 s and 3 s, at 60 and at 144 fps. On the thick liquid it is with the dish
    (0.998) within half a second;
  - a steady motor turns the picture at its speed, Ωτ behind where the rigid picture
    was (0.00299 rad on acid-trip's motor, the fastest shipped);
  - a sway every eight seconds reaches the picture at 1/√(1 + (ωτ)²) of the dish's:
    0.391 through water, 0.993 through the thick liquid.
  `npm run flick` (Mac, the tools shard) holds the frame to that arithmetic: a flick on
  water at the drag time's speed, the picture through the liquid's angle and not the
  glass's, the angle lost to the glass after two drag times to 15%, the turntable's
  share through the same water, the solver handed Ω − ω_l and no twist.

  What it changes on the shipped looks, worked out on the frame's own flywheel with a
  made-up band (galaxy, acid-trip, solar-flare, deep-ocean): on the nine thin looks with
  music routed to rotation the picture is within 0.035 rad (2°) of where the rigid one
  was, and the swirl's drive Ω − ω_l is up to 0.011 rad/s, over 1e-3 about 90% of the
  time, so the swirl runs while they play; on deep-ocean and neon-coral-reef (thick)
  it is 0.003 rad and 0.0025 rad/s. Looks with no music and a motor (most) end Ωτ, a
  few thousandths of a radian, behind. Looks that do not turn are unchanged to the bit.
- **22j. The look's motor still stirs the middle.** The twist's motor half
  (`rotationSpeed` × CUR_TWIST round the middle) is kept because every look is tuned
  against it, but a dish turning steadily under its liquid drags the liquid round with
  it and leaves nothing to stir once the liquid has caught up. Replace it with the dish
  (the swirl already carries what the glass does), and retune the looks that lean on it.
- **22k. The swirl runs on every look with music routed to rotation.** Since 22h a
  music look's dish sways under its liquid, so Ω − ω_l is over the swirl's 1e-3 rad/s
  floor most of the time (above): thirteen more dispatches a step on the current's
  half grid (spinSwirl, its divergence, ten pressure sweeps, the gradient). At 1e-3
  rad/s the swirl moves the liquid at most 0.1 mm/s at the rim, a tenth of a cell a
  second. Measure the cost on the Mac (`npm run stages`), and set the floor from the
  travel it would make in the drag time (a fraction of a cell) rather than a speed.
- **22i. The hand reads its angle, not its grip.** A hand turns the dish at its
  angular speed round the middle, held to a turn and a half a second, because near
  the middle a small move is a large angle. A hand's real torque is its friction
  times its lever arm: weight each hand by its radius and let a thick liquid's drag
  push back (22e).
