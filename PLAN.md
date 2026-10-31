# ChromaGlass plan

This file is the index of the plan: the order of work, where each section stands, and
the rules. Each section is a file of its own under [`docs/plan/`](docs/plan/), listed in
"Sections" below, so a session reads this file and the one section its step names, never
the whole plan. What shipped is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under
the same numbers; each shipped item keeps a one-line stub in its section saying where its
story went. Find an item from its id with `grep -rn "14ab-4" docs/plan/`.

A PR writes in the section file its work belongs to; marks what it shipped there, moving
the story to the archive and leaving the stub; updates its row in the running order below;
and adds what it found along the way as an item in the right section. A new section is a
new file, named here. (The split into files is 19m, 2026-10-29; [`docs/plan/README.md`]
(docs/plan/README.md) maps the old line ranges for a branch that still edits the old file.)

## Order of work


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
- **0.2** ~~**19i** (E, M): a green Mac result carries across a merge of main that is disjoint
  from the PR's own site files. Those pushes were 56 % of the PRs' Mac minutes and 16
  of their 29 reds; this is the largest saving in the file.~~ #429, and carrying at all
  since 19k (#502): it asked for four shards where there were five
- **0.3** **19s, then one PR per check** (E, S each): the checks that go red on trees they do
  not measure, each to its root cause and never by loosening it, worst first by the
  ledger: the drop map's "nowhere else" (19h-1, #238), the phone's two-finger Drop
  (19h-2, #240, found: the old push), ~~the tapped clock's two stopwatches (0-tap)~~ #308, ~~the Finger's "adds none"
  on thin pools (0-finger)~~ #314, ~~the wall's gain (0-wallgain)~~ #131, ~~`qa` with no adapter
  (11-qaguard)~~ #316, ~~the other deploy reds (0-deployreds)~~ #194, ~~the wall's stamps (21-wall,
  14b-askline, 19c-wallmutant)~~, ~~the Magnet's drag (11-magnetdrag)~~ #313, ~~"Blow held still"
  (11-blowbubble)~~ #315, and ~~`tools`' "Pour lays more than Drop", which passes at 0 against 0~~ #314. And `magnet`'s second press
  (11-magnetpress): held over the poured pool, some runs never see the press as a hold
  (Ferrofluid stays 0, the hand's path reads one spot through the whole drag), 13/15 on
  #382's merged head and three times on #376's branch, then green on the next run with
  nothing changed. `held` is the hand's last pointer sample within 250 ms of the show's
  clock (`LiquidVisualizer.tsx`): find what the second press lands on, or what stalls the
  sample, and make the check say which.
- **0.4** **19r** (E, S): the open shard evened again, **shipped** (the phone's fingers to show;
  docs/plan-shipped.md 19r).
- **0.5** ~~**19k** (E, M): one manifest of checks, so a PR that changes only check scripts runs
  only their shards, a new check edits no shared file, and `npm run quick` runs what
  the diff needs, in parallel.~~ #502; 19k-1, 19k-3, 19k-4 shipped, 19k-2 (measure it over
  the next 25 merges) and the rest of 19k-5 open
- **0.6** **19m** (F, M, at a quiet moment): ~~this file as an index with one file per
  section~~ (2026-10-29, the index half: `docs/plan/`); open, the fragment files for the
  shared documents (19m-1); 23 of the last 25 merge conflicts were in `PLAN.md`,
  `docs/judging.md`, the changelog or `package.json`.
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

- **1.1** ~~**14m, then 14o**~~ (A, M then S): the show key to loopback only, long and timing-safe,
  a lockout, `maxPayload` and a hello deadline; then the song-ID Worker's origin list
  and limits. **Shipped, this PR** (`npm run showkey` 11 of 33 → 33 of 33, `npm run
  fingerprint-worker` 7 → 19 of 19). 14m-mark and 14m-lan shipped in the follow-up
  (`npm run phonelink` 29 → 36 of 36), and the live Worker answered a lookup (14o-smoke).
  Left: 14m-https, 14m-guest, 14m-tunnel, 14m-budget, 14o-count.
- **1.2** ~~**14n**~~ (B, S): one `sanitizePatch` for the socket, MIDI map files and loaded looks. **Shipped, #322** (`sanitizePatch`, `npm run sanitize`, `npm run remotemix`: malformed patches/gestures dropped, MIDI writes sanitized, DEFAULT_SETTINGS and all 41 presets intact).
- **1.3** ~~**S19**~~, ~~**S18**~~ (C, S each): ~~the particle dispatch at 1024²~~, and ~~finite guards on the
  carried fields~~ (`npm run finite`). **S20** after them (C+G, M).
- **1.4** ~~**S14** (B, S): an error boundary per panel, desk and phone component, the plate
  outside them all.~~ **Shipped, this PR** (`PanelGuard`; `npm run crash` §1b: the
  faulted panel is a card and a `panel` line, 0 new fatals, the canvas still mounted, and
  Try again brings it back; with the guard rethrowing, as main had it, 1 new fatal and 0
  canvases). Story under S14 in `docs/stability-plan.md`.
- **1.5** **14s** (B+D, M): Safari's second song, song ID's latch (the input picker **shipped**, `npm run inputpick`).
- **1.6** **14g** (B, M): a knocked cable brings the input and the projector back.
- **1.7** **14h** (B+E, M): precache the build, never `startOver()` offline, fonts from the site
  (#207's note), timeouts on song ID and lyrics.
- **1.8** **14k**'s build version in the cast hello (B, S), after 0.8's show tag: a projector
  window from another build says so.
- **1.9** ~~**S17**~~ (C, M): ~~a pipeline that fails to build is skipped, not fatal (#212 has merged).~~
- **1.10** **S16** (G, S): a GPU rebuild keeps the film.
- **1.11** **13-recmem** (B, M): Record streams to disk; a set-length take cannot run out of memory.
- **1.12** **14i-guard, then 14r, then S21** (C, S then M then M): the flash guard in linear light,
  by quarter-wall and the red rule; then the watchdog and a Rescue Go.
- **1.13** ~~**S15** wall half~~ (shipped 2026-10-10): a reload re-attaches the wall, dark meanwhile (`npm run rewall`).
  **S15-b** (B, M): the reloaded show resumes the set (its place, the stage, the armed look,
  the tempo, the Mixer's takes) from `sessionStorage`, with "resumed at …" on the desk and the
  phone; today it opens on the opening look, and the wall cuts to it. **S7** (E, M): an hour in CI, nightly.

### Wave 2. The owner's judging queue (the owner's lane, beside the code)

Judged in this order, because these gate code:

- **2.1** ~~**18a-11** Thin Gap's cost (`docs/judging.md` §19): gates 18a-10, and says whether
  Thin Gap, on in every look since #248, needs a look turned back off.~~ (measured on Mac GPU; needs no look turned off)
- **2.2** **15b** the tools' feel (the Finger as a solid shipped; judging §33): gates 15g.
- **2.3** **16b-cost** a source pass's cost and **13-twoproj** two popup projectors: gate 16d.
- **2.4** **10.0** the first `film.yml` baseline (a session gets 403 on dispatch): gates every
  §10 film judgment, then **10.1** Light Show Night with Pacing up.
- **2.5** **14b-repeat** wall smoothness against cost; **H2b** 30 steps a second; **22h** the
  look's own turning (shipped, judge the eleven music looks against the last deploy before it); **21c** dots and zoom; **3-highlight**; **18i** #358 timed pops (partly shipped: Bretherton speedup, Saffman-Taylor lobes, Reynolds film drainage merge, bead speed lag; timed pops stay default pending physical pop setting);
  ~~**0-bandbubbles**~~ #251 (the owner asked for the fix, 2026-10-04: Audio Impact 0 drops no bubbles; its Classic line listens a minute since #346, having counted under its 15 chances on 6 of 38 Mac runs in 25 s).
- **2.6** ~~**P7-cpu**, a decision rather than a look: delete the CPU solver's stepping (the
  roadmap and webgpu-plan say it is unreachable) or extend it (18a-9, 22d say so).~~
  **Decided by the owner, 2026-10-06: delete.** The deletion is 3.1; 18a-9's and 22d's
  CPU halves go with it.

Then the rest of `docs/judging.md` in its own order, an area a sitting (the looks, the
Mixer, the ferrofluid, the wall, the phone and the apps), from the judging sheet (0.13),
with each PR's preview URL (0.9) so a look is judged before it merges. **13-win-smoke**, the site on two Windows PCs, by hand (§13).
The owner's account steps sit here too: **39b** (switch Settings → Feedback on), **S8-on** (switch the crash reports on),
**19g** (more Mac runners), **12.2** (the store accounts). ~~**13.1-sign**~~ (the Mac app's
Developer ID and notarisation) is in, 2026-10-27: the five secrets are set and a pull
request's build came back "Notarized Developer ID"; it shipped with the
first signed release, 1.3.692 (**13-update-signed**, §13); judging §75 is owed.

### Wave 3. Seams in the two big files (one session, in a quiet week)

Each a mechanical PR that moves code and changes no behaviour: the same checks, the same
numbers, merged the day it is green so no other branch has to chase it. The point is what a
session has to read to make a change, and the faults that come from scattered state; the
merge conflicts are the shared documents', which 0.6 ends.

- **3.1** **P7-cpu** (G): delete the CPU solver's stepping, about 1,000 lines (2.6 decided: delete). Next in
  lane G once #307 has merged.
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

- ~~**4.1** **H2c-4** constant arguments written once and `kernel()` cached (S): CPU, every step.~~
  Shipped with 14aa (`npm run encode`, 512², thin gap: 506 KB allocated a step → 31 KB,
  249 writes for 267 dispatches → 2, the main thread in `step()` 3.4 ms → 0.4). Story in
  `docs/plan-shipped.md` §14aa.
- **4.2** **H2c-1, H2c-3, then H2c-2** (M, S, S): the coarse multigrid levels in one workgroup,
  `mgZero` folded in, then a warm start and one V-cycle: about 250 dispatches a step.
- **4.3** **14j with H2c-9 and 14b-120** (M): a draw cap, readbacks only after a step, pack only
  after a step, a heat-aware governor. (The governor's doubling retry shipped with 14aa.)
- **4.3b** **14ab** (M): the rest of the per-frame CPU work found with 14aa (14ab-1, the
  video pour's pause and play every frame, shipped with 14ac; 14ab-7, -8 with #533; 14ab-3,
  -5, -9 with #549; 14ab-4 with #579; 14ab-2 with #584; 14ab-12 closed by measurement, #590;
  14ab-13 with #591, finished in #596; 14ab-6 the beads' mask on the GPU). Left: 14ab-10, -11,
  -14.
- **4.4** **H2c-7, H2c-6, H2c-8, H2c-5** (S each): the readback straight into its ring, no aux
  target without the camera, air only where there are bubbles, first-order velocity.
- ~~**4.5** **14f-midi** (B, S): a MIDI ride without an App render.~~ Shipped (`npm run renders`: 121 App renders a second under a fader, now 10).
- **4.6** **19d-lazy** (B+E, M, after 1.7): load the panels when first opened; drop `motion`.
- **4.7** **14c-4k, 14c-governor, H2c-10, H2c-labels** (S each). Then **H2a**, **H1**, **H3a**.

### Wave 5. Playing it: the instrument

**§27, every control does something you can see** (the owner, 2026-10-05): ~~27a-c Plate
Rock, Beat Squeeze, Turbulence~~ (#305); **27d** the rest of the sweep (M, lanes B and G);
~~27e Sound Drive's bass as the glass~~ (#307), then **27e-1** the kick's drop, **27e-2** the
film's measure.

Lane D: **5-downbeat** (S); **14t with 10.3-fast** (M: half tempo in the clock and in the
bar grid together); **14e** (M, output latency and one lead per source); **10.2-shelf**
(S) then **10.3-4otf, 10.3-sure, 10.3-half, 10.3-newsong, 10.3-fill** (S each);
**10.2-snare** then **10.2-build** (M); **10.3-rest** (M); from §30 (VS, 2026-10-11,
re-read 2026-10-24): the owner's 2026-10-24 ask for parts of the plate answering the
music, explored as four directions the same day and all four taken, in this order:
~~**25h** areas that listen for themselves~~ (shipped), ~~**24.3-place** the melody walks across the plate~~ (shipped), ~~**25i**
colour that answers the music~~ (shipped), then **25j** a lamp under each area (D, M, with
14r read per area); then ~~**30a**'s rest, shaped sound cords~~ (shipped; `npm run soundcords`), **14t-pc** Program Change (S), **24.3** notes as voices
with 30's envelope (M), **30b** LFOs and envelopes you set (S); from §31 (Continuum,
2026-10-11): **31c** a cord that reads where in its band, and a delay (S, with 30a).

Lane B: **10-go** Go on the music and a T-bar (M); **5-looklink** (S); **11-back** (S);
**16a-render, 16a-cast, 16a-remote, 16a-follow** (S each); **16b-logo** (S); **5-learncast**
(S); **14a-timers** (S); **14c-readout** (S); **14k**'s remote lag and coalesced pointer
(M); **5-actions** (S); **11-pinch** (S).

Lane A: **14q** (S) then **R8** room lights as fixtures (M); **R4-card** the load-in card
(S); **14m-guest** (M), **14m-tunnel** (S, the Mac), ~~**14m-mark**~~ (S, shipped), **14m-https** (M, network displays at a Wi-Fi address); **31b** a warp grid for curved walls (M, §31).

Then: **6-recordset** (after 1.11), **8-pictures**, **5-shutter**, **5-channels**,
**5-follow-a** (M, an instrument followed in a mix; then 5-follow-b with §17),
**R5-kit** the show kit, **14t-decks**, **15h** the Comb, **9j**; ~~**13.5-link**~~ (shipped
2026-10-30, owed judging §95), then **13.5-osc** (§30), **13.4-ipad**, later **13.7-ipad**; **31e** halation in the Photograph
style (§31).

### Wave 6. The physics under the look (lane C, one solver change at a time)

- **6.1** ~~**18a-every** Thin Gap in every look~~ #248 (the owner's pick came before 2.1's
  reading; 2.1 still reads it), then ~~**15b**~~ (the Finger, shipped), **15g** (the moving
  wind as air on the film shipped; 15g-2, the jet's dimple, next),
  **15d-maze**, **18a-7**, **18a-10**, **RM-E**.
- **6.2** ~~**18b** the lamp through the dye~~ #256 (behind Lamp Ground); ~~**18b-1** which looks
  go on it~~ #262 (eleven, by `npm run lampjudge` and the owner; **18b-8** thins the dye of the dishes too deep for
  it), then ~~**18f** heat from the lamp~~ #352 (which unblocks 10.6
  and the slide plan's S2) and ~~**18j** milk~~ #353 (which replaces 4-milk), and **20a**.
- **6.3** ~~**18c-1**~~ a bottle's pour adds liquid (with 18d-2), then **18c-2** the colour's drops too,
  ~~**18g-1**~~ colour leaves by flushing #362 (18g-2..5 open) and **18k-spray**.
- **6.4** **18e** edges from refraction, partly shipped #355 (the front plate's edges from projector pupil aperture loss and shadowgraph Becke lines; #219's 20d), then **18e-2** a clear pour's edge, **31a** the projector's
  focus across the two dishes (with **18e-1**, retiring Layer 1's painted boundary line) and **31d** colour at a defocused edge (§31).
- **6.5** **18d** each liquid's real properties (~~**18d-1**~~ viscosity a column, ~~**18d-2**~~ flushing, ~~**18d-11a**~~ its cost, then **18d-3** to **18d-11**), then **10.5-bodies** and **H8** more bottles.
- **6.6** ~~**18m**~~ a drop slumps under its own weight (then ~~**18m-1**~~ #371 inertial regime, **18m-1a** implicit step, **18m-2** to **18m-4**, ~~**18m-5**~~ conservative grid filter, **18m-5a** slump check with grid filter on), ~~**18h**~~ #357, ~~**18a-2**~~ #255 (then **0-fingering** and **22g**), **18a-3**, **18a-4**, **18a-6**,
  **18a-8**, **18k-film**, **18k-linear** (then **16c-linear**), **18k-chem**.
- **6.7** §20 after its prerequisites: ~~**20b**~~ #259, **20c, 20e, 20f** (and 20b's own leftovers, 20b-1 to 20b-12).
- **6.8** The ferrofluid: **9t** (**shipped**; then **9u**, **9k**, and 9t's own items), **9h**, **9o**, **9d**, ~~**9v**~~, ~~**9w**~~ #266, **9z**, **9aa** (with **9d**), **9m**,
  **9l**, **9p**, **9q**, **9r**. Spin: **22b** to **22m** (~~22h~~ #252, ~~22j~~ #261, ~~22k~~ #258). Painters: **21b**, **21d**. The
  wall's picture: **14i** (then **16c-clip**). Smaller: **0-gridband**, **0-seam**,
  **10-small**, **16c-stack**, **RM-F** then **RM-D**, **RM-desk**.
- **6.8b** The closeup's ferrofluid drop (§29, the owner, 2026-10-11): ~~**29a**~~ the drop
  as a lit bead, then ~~**29c**~~ #373 it follows the hand, **29b** the dye on it, **29d** its
  wake, **29e** the look, **29f** its controls.
- **6.9** Several areas of interest (§25, lane G): ~~**25a**~~ areas of the dish, with Velvet
  Underground, Lumia and Cell Bloom, then **25b** the next looks in its order, **25e**,
  **25c**, **25f** (after 18f and 18d).
- **6.10** The realism audit's top picks (§38), each its own thread, in its order: ~~**38a** the lamp
  as a condenser~~ (shipped; 38a-2 the always-on cos⁴ waits on the Mac's eyes), **38c** soap conserved, **38e** oil's σ, ~~**38b**~~ bubbles without clocks (with ~~38g~~ and ~~38n~~, #603), **38h**
  nothing on the plate makes light, then **38d**, **38f**, **38g-2**, **38i**, **38j**; ~~**38r**~~ (the rest
  gap, shipped: one number, #613, then a real 2 mm, #641) is read before 38d and 38i.

### Wave 7. Reach

- **7.1** The stores (§12), after the owner's accounts (2.x): **12.3**, **12.5**, **12.6**, then
  **12.7**, **12.8**; **12.4a**; later **12.9**. When the owner says go: **12-ship**, **12-play-org**; later **12-link**; **12-mas** not for now.
- **7.2** VJ software (§13): **13.4** the OSC write-up (S, any time), **13-win-app** then
  **13-win-sign** (after 13-win-smoke, which runs beside Wave 2), **13.5** OSC out (Link shipped 2026-10-30),
  **13-port**, **13-intel**, **13-icon**, **13-exit**, **13-version**, ~~**13-update-signed**~~ (shipped, 1.3.692), then **13.2**
  Syphon, **13.3** NDI and Spout, **13.6** video in, **13.7** the DAW bridge plugin (its
  MIDI route written up with 13.4); **13.8** the native renderer core only when the owner asks.
- **7.3** Many plates (§16): **16d** (after 2.3), **16e**, then **R2**, **R5**, **R4**.
- **7.4** **§17** hear the set ahead (after 1.7). **R6** watching a real rig. **H4**, **H5**.
- **7.5** Accounts first (the owner, 2026-10-11, ahead of Wave 1): **23.9** and **23.13**
  *(owner)*, **23.10**, then **23.14** (after #380), **23.12**, **23.11**, **23.15**.
  Selling it (§23), after Wave 1, a judging pass, **13.1-sign** and a free beta:
  **23.1** *(owner)*, **23.2**, **23.3** (after 14o), **23.4**, **23.5**, **23.6**, **23.8**, then
  **23.7**.
  The slide plan: **RM-S4**, then **RM-S135** after 6.2's heat.
- **7.6** Modular rigs (§24): **24.1a** (after 1.5 and 1.6), **24.3**, then **24.1b** (after
  13.1-sign), then **24.4**.
- **7.7** Marketing (§37), tied to the store going live: before any link is posted, the share
  card (34a-5) and the hero (34a-2); then **37a** *(owner)*, **37b**, **37c**, **37k**, the
  launch **37f** (**37g**, **37h**, **37i**), **37l** from the first post, **37n**; **37m** and
  **37o** are the owner's calls; **37j** the cadence after. The week that runs itself,
  **37p** to **37s** (37s's API audit filed early: it takes weeks), then the album show:
  **37x-1** and **37x-2** (the music) from now, the builds **37x-4** (go live from the
  Mac app; OBS until then) and **37x-3** (the album sheet), each its own thread, then
  **37x-7**'s routine.

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
| An input per channel | 24.1 | 5-channels |

## Running order

The batches, and where each stands. This table is the ledger: a PR that ships a step
updates its row. The order to work in is the order of work above.

Where each batch stands, as of 2026-09-27:

| | Batch | State |
|---|---|---|
| 0 | The dye a tool makes | **Shipped** (#152); the fingering push that grew a grating of stripes, dots and labyrinths in every pool, and drained the plate, **taken out** (`npm run grating` §5), not yet seen on the Mac; the Finger's own "adds none" reds traced to the ambient seeder being left on in that one section (2026-10-22: off, the plate's idle drift falls from +35 to 1 and the hand adds nothing on pools of 357 and 611); its slack and quiet bars **set from the shards' noise** (#449: 48 trials on pools of 39 to 357, at most 0.17% outside the bracket; both bars now 2% of the pool and 1, the slack was 15% and 5), thin pools included; it was also the phone's two-finger Drop reds, one finger's pool at a third of the other's (#240, `npm run grating` §6 replays them); real viscous fingering to replace it, open |
| 1 | Sharp liquid, and pigment in it | **Shipped**; sharpening retired, granulation stands |
| 2 | Lacing | **Shipped**; its 4–8 px gate moved to batch 3 |
| 3 | Drops, not rings | **Shipped** (#163): drops and bubbles as air pockets, shaded as a projector throws them |
| 4 | Liquids that behave differently | **Shipped**; milk's opacity shipped (#353, 18j) |
| 5 | Playing it | Sound learn **shipped** (#155, on #154's bands); shutter and look link **not started** |
| 6 | Render a song | **Shipped** (#153 seed, #154 offline bands, #156 render); the 3-minute 1080p gate is unmeasured |
| 7 | The room in the plate | **Shipped** |
| 8 | The desk | **Shipped** |
| 9 | Ferrofluid after the references | Sharp edge and two looks **shipped** (#161); maze detail **shipped** (#167); dye carried **shipped** (#168); the magnet's spikes, 9e, **shipped** (#183, with the phone's fingers as magnets), not yet judged on the Mac; fingers past the spikes, 9i, **shipped** (#200, `npm run fingers`), not yet judged on the Mac; Blow and Finger move it, 9n, **shipped** (#206, `npm run ferrohands`), not yet judged on the Mac; picking the Magnet no longer gathers a black pool in the middle, 9s, **shipped** (`npm run magnet`), and a hold with the show frozen or draining gives the look its magnet, **shipped** (2026-10-05, `npm run magnet`'s check 9 on the Mac), and pours nothing, with Magnet Size, 9x, **shipped**; brings no ferrofluid at all, only moving what is poured, 9y, **shipped**; the pool it sets down is 9u, open; colour between the domes, 9f, **shipped** (`npm run domes`: the dye kept), not yet judged on the Mac; the ferrofluid standing up in domes as a layer that keeps its volume, 9t, **shipped** (`npm run standing`: the gaps open), not yet judged on the Mac; the magnet as a real magnet, with Magnet Size its radius and the saturation a field, 9v, **shipped** (`npm run disc`), not yet judged on the Mac (judging §37); carrying the ferrofluid, the mix and the reactions across a new solver, 9w, **shipped** (`npm run regrid`, and `npm run magnet`'s check 8 on the Mac); the dye at its own grid across one, 9z, open; 9g, 9h, 9j, 9k–9m, 9o–9r and 9aa (the maze too coarse, and its haze; measured) open |
| 10 | Playing like a show | Step 0, film every look, **shipped** (#162); its first full baseline not yet run; step 1, rest, big events and darkness, **shipped** on the sequencer (#170), not yet filmed; step 2, the song's shape, **heard** live (builds, drops, breakdowns; `npm run shape`) and **followed** by Pacing (#182, Follow the Song; `npm run pacing`), not yet filmed; step 3, accents, the one **shipped** (#184, Accent the One; `npm run downbeat`), not yet seen on the Mac, every other bar, fills only, a hand's variation and a press pulled onto the beat not started; step 4, press round and lift into fingers, **shipped** (#185, `npm run lift`), not yet seen on the Mac, and Beat Squeeze, found never to have pressed the plate, **pressing** on every kick and let go after each (`npm run lift`, `npm run squeeze` on the Mac), not yet seen on the Mac; step 5, oil and water as bodies, **shipped** (#179, Oil Bodies, on in Oil & Water), not yet judged on the Mac; steps 6 and 7 not started |
| 11 | The mixer | Step 1, the sources there are in one stack with a grade each, **shipped** (#176); step 2, the gel wheel and the lumia as rows, **shipped** (#189); step 3, a blend per row, **shipped** (#193); step 4, a take button and fade time per row, **shipped** (#195); step 5, the desk's Mixer over the rides and not the plate, **shipped** (#196); none yet judged on the Mac; step 6 waits on rig-plan R1 (§16e) |
| 12 | The App Store and Google Play (at the end of this plan) | An iPhone shell (Capacitor) and an Android one (Trusted Web Activity) planned; step 1, the site on a phone, **passed** on the iPhone (Safari, 2026-09-27), Android not yet run; step 4, the iPhone shell, **built** with the laptop-remote mode (4a), compiled in CI, not yet on a phone; **decided 2026-10-30**: iPhone/iPad and Play later, both free with nothing to buy, the Mac App Store not for now (12-mas), nothing built until the owner says go (12-ship) |
| 13 | ChromaGlass in popular VJ software (at the end of this plan) | Planned 2026-09-27: a small native wrapper (Electron) first, with the whole show cached offline and the show server inside, then video out through Syphon, NDI and Spout, OSC control, Ableton Link and video in. Step 1, the Mac app, **shipped** (`desktop/`, `npm run desktop`, built in `desktop.yml`), not yet opened on the owner's Mac with a projector (`docs/judging.md` §26); steps 2 to 8 not started (7, a DAW bridge plugin, and 8, a native renderer core for later, added 2026-10-04); Windows (13-win-smoke, -app, -sign) planned 2026-10-04, never run on a PC |
| 14 | The show at the gig: hearing, timing, speed, the wall (at the end of this plan) | Found 2026-09-27 by reading the code: the show goes deaf behind the projector window (14a), the wall can draw twice a refresh (14b), the projector's pixels come from the laptop's ratio (14c), the beat clock hears smoothed bass (14d). 14a **shipped** (the ear keeps hearing behind the wall, and says when it is deaf; `npm run ears`), not yet seen on the Mac with a real covered window; 14c **shipped** (a wall's pixels are the wall's: a Retina laptop on a 1080p projector opens at 1920×1080, was 960×540, and is offered 1024²; a 4K wall's bottom rung is 2.07 Mpx, was 8.29 like its top; the mirror smooths at 'high'; `npm run rungs` 70/70, was 63/70), whether 1024² holds on a 1080p wall not yet measured on the Mac; 14d **shipped** (the clock hears the kick's onset, by its time; `npm run kicks`), not yet counted in the app on the Mac; 14b **shipped** (one draw a refresh with the wall up, whichever window asks, each offer stamped with its refresh's own time: `npm run wall` 119.1–120.2 draws a second on a 60 Hz display before, 59.8–60.3 after, and 60.0 with 11.7 ms draws where the first version drew 68.7; covered, every ask draws); on the Mac runner, with a renderer, `npm run wall` 187/187, the governor fed a whole refresh of the faster window; 14b-2 **shipped** (on a busy machine the gate no longer turns down a window's own next frame: 23.4 drawn of 29.4 handed before, 29.5 of 29.5 after, `npm run wall`'s busy phase; its floor judged in the same seconds); 14f **shipped for the sound** (the ear tells React ten times a second and the plate asks for each frame's reading itself: the App renders 11 a second with the band, was 70, and a quiet page only its clock, was 5; `npm run renders`; on the Mac the plate heard its own frame's reading on every frame), the MIDI fader's half **shipped** (the plate reads the ride on its frame and the desk is told ten times a second: 121 App renders a second under a swept fader, now 10; `npm run renders`), not yet counted on the Mac; the reading's byte arrays still new each reading; 14v, the load: the opening built three at a time, the app preloaded and the GPU asked for at boot, **shipped** (`npm run loadtime`; `startup`: first step 9.52 s cold on the Mac, was 12.15–17.62 s); 14v-2, the display asked for first and two duplicate kernels merged, **shipped** (Mac numbers in §14v); 14x, the microphone taking the hand's own clicks for kicks, **shipped** (`npm run clicks`); 14v-3, the intro over the opening's black plate, **shipped** (`npm run intro`); 14v-4, the intro held still while the opening's render pipelines compile, **shipped** (`npm run intro` line 9; the Mac's `startup` frame gap); 14v-5, the intro still from the first paint, **shipped** (`npm run intro` line 9b; startup's frame gap 2.13–2.35 s turning, 0.85–1.18 s still); 14v-6, the opening asks its first fills before the display after the mount frames settle, **shipped** (judged over the week after merge by `npm run flakes -- --check 'no stop in the opening'`); 14v-11, the intro still until the whole opening is built, **shipped** (`npm run intro` 9, 9b); 14af, the wall's title-bar chip says what it means, clears on the Mac app's own full screen and can be closed, **shipped** (`npm run desktop`; `docs/judging.md` §91); 14af-1, -2 open |
| 15 | Every tool on every liquid | Audited 2026-09-27 (table in 15); 15a, every laying tool lays the bottle, **shipped** (`npm run bottles`, Mac); 15d, the Press moves the oil with its colour, **shipped** (`npm run pressoil`), not yet judged on the Mac; the ferrofluid's half **shipped under Thin Gap** (a pressed pool stays full, spreads by the volume the glass displaced and comes back on lift; the ferrofluid's own viscosity in the gap; `npm run ferropress`), not yet judged on the Mac, and with Thin Gap off a press still greys it; 15c, Blow's wind carries the colour and the oil rather than erasing them, **shipped** (`npm run wind`, and `tools` on the Mac) as a carry, a shortcut 15g replaces with air's shear on the film; not yet judged on the Mac; 15b, the Finger as a solid that moves every liquid on a thin gap, **shipped** (`npm run fingerflow`), not yet judged on the Mac (judging §33), its Blow, old-plate, inside-the-hand and remote halves open; 15i, picking a bottle lays nothing, **shipped** (`npm run bottles`, Mac); **15g's first part, the moving Blow as air on the film, shipped** (the breath's stress a body force on a thin gap, its carries retired there; `npm run airblow`), not yet judged on the Mac (judging §44); 15e's check **shipped** (`npm run liquidsgpu`), 15e-1 to 15e-9 open; 15f, 15g-2 to 15g-6, 15j open |
| 16 | Many plates (rig-plan R1, at the end of this plan) | Picked by the owner 2026-09-27 ("Let's build multi-plate next"); planned in five steps. 16a, the back plate's own look, **shipped** (#231, `npm run backplate`), not yet seen on the Mac; 16b, a projector picks its source, **shipped** (#226, `map`, `mixer`, `wall`), not yet seen on the Mac; 16c, beams add and the seam goes, **shipped** (#232, `beams`); 16f, add and take off the back plate on every look, **shipped** (#273, `layout`, `phone`); 16d–16e not started |
| 18 | The physics under the look | Audited 2026-09-28 (section 18): the shortcuts where the plate imitates a liquid's result instead of simulating it, ranked by gain against GPU cost; the top four are the plate as a Hele-Shaw cell (18a, which the tools' 15b/15g and the grates thread's fingering wait on), the lamp through the dye (18b), a pour that adds liquid (18c) and each liquid's real properties (18d). **18a first part shipped** behind Thin Gap (off in every look; `npm run thingap`); **the Press draws the liquid back when you let go, on Thin Gap, shipped** (carries in substeps, the press a bowl, the glass lifting in seconds, the Press's carries retired there; `npm run presslift`, `tools` on the Mac), not yet judged on the Mac; **Thin Gap on in every look, shipped** (#248, the owner's pick; saved looks carried over; the opening builds its pipelines before the first step), its cost not yet read on the Mac (2.1); **forces as forces (18a-2) shipped** (body forces answer the liquid's viscosity, Rain Drip heavy colour, Updraft a shear, Glass Smear a sliding glass; `npm run forces`); 18a-3 to 18a-11 left, each its own PR; **18b the lamp through the dye, shipped** behind Lamp Ground (`npm run lamp`); **18b-1 which looks go on it, shipped** (#262: eleven looks on the lamp, ten picked by a written rule from Mac pictures, `npm run lampjudge`, one by the owner); 18b-2 to 18b-9 left; **18d-1 each poured liquid's viscosity, shipped** (glycerine crawls, syrup runs ahead in a thick look; `npm run thick`); **18c-1 a pour adds liquid and 18d-2 flushing, shipped** (a held bottle pushes the plate out into rings, a poured liquid stays until it is pushed over the rim; `npm run flush`); **18d-11a the poured liquid rides the colour's carry, shipped** (what it adds to a step halved on CI's Mac, 13.54 to 6.73 ms at 768², a whole colour carry to half of one; `npm run thick`); 18c-2 to 18c-5 and 18d-3 to 18d-11 left |
| 19 | The checks, the build and the plan itself (at the end of this plan) | Found 2026-09-28 in a review of the workflows, the harnesses and the build: `gallery.yml` holds the Mac runners (19a, **shipped**: by label or by hand, and a merged PR's runs stop, `npm run macqueue`), Measure is near its timeout (19b, **shipped** with 19h: three parts side by side, every step runs, and the `wgsl` and parse gates), checks that can pass unmeasured or that nothing runs (19c), the build (19d), the harnesses as code (19e), the plan out of step (19f); what a red PR costs and which reds are the PR's own (19h, **shipped** in part: docs-only PRs skip the Mac, the shards evened, two flaky lines handed off; and a deploy skips the Mac when the PR's site files are apart from main's newer ones); 19i to 19t, faster coding and releases, measured 2026-10-04 (Wave 0 of the order of work): 19i, 19j, 19k and 19r **shipped**, the rest open |
| 20 | Lace and holes: a pale film torn open over colour | Planned 2026-09-28 from a still of another show: clear film dewetting in the gap, under the lamp (18b), edges from refraction (18e), oil discs on the front layer. A CPU prototype tears a film into lace with holes over a hundredfold of sizes. The lamp ground it needs shipped (18b, #256: a clear pool throws 100% of the lamp, `npm run lamp`); 20a–20f open |
| 21 | Looks after painters | Roy, 1963 and its Ben-Day Dots control **shipped** (`npm run benday`, lab); not yet judged on the Mac; 21a–21d open |
| 22 | Spin the plate | Asked 2026-09-28: the dish turned on command and by itself, at a rate or with the tempo. 22a, the Spin tool, Auto Spin (Off, Rate, Tempo) and Reverse Spin, with the liquid dragged round by the glass through the gap, **shipped** (#223; `npm run dish`, `npm run turntable`), not yet judged on the Mac (`docs/judging.md` §28). 22h, the look's own turning (motor, music, flick) on the same dish, so a flicked plate of water trails the glass, **shipped** (#252; `npm run turntable`, `npm run flick`); 22j, the motor's stir in the middle replaced by the dish and the looks' motors retuned to match, **shipped** (#261; `npm run turntable` 15); 22k, what the swirl costs on the looks it now runs on, measured on the Mac and cut to a third on a thin plate, **shipped** (#258; `npm run swirlcost`); 22b–22g, 22i, 22l, 22m open |
| 32 | The soap film in reflection | Asked 2026-10-18 from a photograph of a draining film: Newton's bands, black lace, flow-combed edges. The model (an inextensible film's gravity convection, evaporation to Newton black, angle-dependent reflection) and its judge `npm run soapfilm` (23 lines) are written; 32a, the CPU reference, is next (Antigravity); 32b–32e open |
| 34 | What Photism showed: the page and the app | Asked 2026-10-22 from a screenshot of a competitor's page: a landing page before the sign-in wall (34a, **shipped** as a still hero; 34a-5's words shipped; 34a-7, the page for pros at `/pro`, shipped, and its 34a-7a, OSC and Art-Net gated to Pro; 34a-2 to 34a-4 and the share card open), a looks browser (34b), an analyzer look (34c), Chladni figures (34d), drawn automation lanes (34e), one-button share export (34f), reactions named (34g), a dropped picture as a look (34h); the DAW bridge and Syphon keep their order (34i). Not started |
| 36 | What the analog operators could not do | Researched 2026-10-27 from the operators' own accounts: a lit-stage grade (36a), span the wall across projectors (36b), a practice plate (36c), show the hands (36d), all proposed; and four open items moved up with the evidence: heat as a stroke (36e, S2; **36e-1, the model and `npm run boil`, shipped**; the GPU build 36e-2's check `npm run boilgpu` written, red until the build), a plate per performer (36f, 14m-guest), room lights follow the wall (36g, 14q), layers at their own speeds (36h) |
| 37 | Marketing and social media | Asked 2026-10-29: who it is for, the channels (YouTube, Shorts, Reels and TikTok, Reddit and the VJ and synth forums, Show HN, Product Hunt), the launch in order from the day the store goes live, a weekly cadence, who makes what and who posts, and how a sale is traced to a channel (37a–37o). The same day: the week that runs itself, the app filming itself, one Monday approval, a scheduler and YouTube's API (37p–37w), and a whole album performed live every week on YouTube from the Mac app, with a family of looks across it (37x-1 to 37x-9). 37x-4a (the live show research, `docs/live-show.md`) and 37x-4b (the RTMPS client, the wall-clock encoder, the key store, `npm run live`) shipped 2026-10-29; 37x-4c (several destinations, a portrait encode, the health readout, `npm run livedrop`) 2026-10-30; 37x-4d (the Live Show panel in the Mac app, Pro, and the phone's Stop, `npm run liveshow`) 2026-10-30; the rest not started |
| 38 | Realism audit, after §18 | Audited 2026-10-30 across the fluid, the bubbles and films, the ferrofluid and the optics: twenty shortcuts not already open elsewhere, ranked (38a–38j the top picks: the lamp as a condenser, bubbles without clocks, soap conserved, the labyrinth from the Bond number, oil's σ in N/m, heat as a force, bubbles merging and crowding as pockets, nothing on the plate makes light, milk's scatter conserved, the ferrofluid black by its thickness); **38b, 38g, 38n shipped** (bubbles as pockets in a gap: no clocks, the round rim, Paterson, Durian, the look's own liquid; `npm run bubblephysics`), **38a shipped** (the lamp lever and the aperture, #604; 38a-2 and 38a-3 open), **38r shipped** (the real 2 mm gap, #641; 38r-1..4 open), the rest open |

Also landed or in flight around these batches: the macro closeup's cells ride the paint
and stop shaking at 6x (#165, `npm run cellride`); the show's pipelines are built before
it opens, so a cold Mac no longer freezes for 6–19 s at the start (#164, `npm run
startup`), and draws with each of them once before it opens, so the first frames no longer
stop for a second or two either (#181); the magnet stays where the hand leaves it (#159).

## Sections

One file a section, cut between items into parts of 30 KB or less, so each part has room to grow under the 40 KB at which `npm run sizes` warns. A part that reaches it is cut again between items, and the new part named here.

| § | Section | File | Items (a cut section) | KB |
|---|---|---|---|---|
| 0 | The dye a tool makes, and the deploys it is blocking | [`00-dye-tools.md`](docs/plan/00-dye-tools.md) |  | 15 |
| 1 | Sharp liquid, and pigment in it | [`01-sharp-liquid.md`](docs/plan/01-sharp-liquid.md) |  | 5 |
| 2 | Lacing | [`02-lacing.md`](docs/plan/02-lacing.md) |  | 0 |
| 3 | Drops, not rings | [`03-drops.md`](docs/plan/03-drops.md) |  | 0 |
| 4 | Liquids that behave differently | [`04-liquids.md`](docs/plan/04-liquids.md) |  | 2 |
| 5 | Playing it: sound learn, shutter, and a look link | [`05-playing-it.md`](docs/plan/05-playing-it.md) |  | 8 |
| 6 | Render a song | [`06-render-a-song.md`](docs/plan/06-render-a-song.md) |  | 1 |
| 7 | The room in the plate: the camera as a sensor | [`07-room-camera.md`](docs/plan/07-room-camera.md) |  | 0 |
| 8 | The desk: the laptop is a control surface, not the show | [`08-desk.md`](docs/plan/08-desk.md) |  | 14 |
| 9 | Ferrofluid after the references | [`09-ferrofluid.md`](docs/plan/09-ferrofluid.md) |  | 16 |
| 10 | Playing like a show | [`10-playing-like-a-show.md`](docs/plan/10-playing-like-a-show.md) |  | 22 |
| 11 | The mixer | [`11-mixer.md`](docs/plan/11-mixer.md) |  | 12 |
| 12 | ChromaGlass in the App Store and Google Play | [`12-app-stores.md`](docs/plan/12-app-stores.md) |  | 8 |
| 13 | ChromaGlass in popular VJ software | [`13-vj-software.md`](docs/plan/13-vj-software.md) |  | 20 |
| 14 | The show at the gig: hearing, timing, speed and the picture on the wall | [`14-show-at-the-gig.md`](docs/plan/14-show-at-the-gig.md) | 14a–14r | 28 |
|  | (continued) | [`14-show-at-the-gig-2.md`](docs/plan/14-show-at-the-gig-2.md) | 14s–14ae-5 | 26 |
|  | (continued) | [`14-show-at-the-gig-3.md`](docs/plan/14-show-at-the-gig-3.md) | 14af, 14ad–14z-6 | 5 |
| 15 | Every tool on every liquid | [`15-tools-on-liquids.md`](docs/plan/15-tools-on-liquids.md) | 15a–15h | 23 |
|  | (continued) | [`15-tools-on-liquids-2.md`](docs/plan/15-tools-on-liquids-2.md) | 15k | 2 |
| 16 | Many plates: each projector its own source (rig-plan R1) | [`16-many-plates.md`](docs/plan/16-many-plates.md) |  | 6 |
| 17 | Hear the set ahead, from files | [`17-hear-ahead.md`](docs/plan/17-hear-ahead.md) |  | 3 |
| 18 | The physics under the look: where the plate imitates a result instead of simulating it | [`18-physics.md`](docs/plan/18-physics.md) | 18a–18b-8 | 24 |
|  | (continued) | [`18-physics-2.md`](docs/plan/18-physics-2.md) | 18b-9–18l-6 | 28 |
|  | (continued) | [`18-physics-3.md`](docs/plan/18-physics-3.md) | 18l-7–18m-5a | 8 |
| 19 | The checks, the build and the plan itself | [`19-checks-build-plan.md`](docs/plan/19-checks-build-plan.md) | 19a–19k-6 | 19 |
|  | (continued) | [`19-checks-build-plan-2.md`](docs/plan/19-checks-build-plan-2.md) | 19l–19aa-8 | 22 |
|  | (continued) | [`19-checks-build-plan-3.md`](docs/plan/19-checks-build-plan-3.md) | 19aa-9–19ai-5b | 22 |
| 20 | Lace and holes: a pale film torn open over colour | [`20-lace-and-holes.md`](docs/plan/20-lace-and-holes.md) |  | 18 |
| 21 | Looks after painters | [`21-painters.md`](docs/plan/21-painters.md) |  | 3 |
| 22 | Spin the plate | [`22-spin.md`](docs/plan/22-spin.md) |  | 5 |
| 23 | Selling it: the site free, the app paid | [`23-selling.md`](docs/plan/23-selling.md) | 23.1–23.10e | 22 |
|  | (continued) | [`23-selling-2.md`](docs/plan/23-selling-2.md) | 23.15–23.17-cikeys | 13 |
| 24 | Modular rigs: patch the rack into the liquid | [`24-modular-rigs.md`](docs/plan/24-modular-rigs.md) |  | 10 |
| 25 | Areas of interest: several places on one plate | [`25-areas.md`](docs/plan/25-areas.md) |  | 11 |
| 26 | A reaction that prints: Turing stripes in black and white (proposed 2026-10-05) | [`26-turing-print.md`](docs/plan/26-turing-print.md) |  | 10 |
| 27 | Every control does something you can see | [`27-controls-you-see.md`](docs/plan/27-controls-you-see.md) |  | 17 |
| 28 | Preset palettes: the looks refreshed for what the plate does now (2026-10-10) | [`28-preset-palettes.md`](docs/plan/28-preset-palettes.md) | 28a–28h | 19 |
|  | (continued) | [`28-preset-palettes-2.md`](docs/plan/28-preset-palettes-2.md) | 28i–28k | 16 |
| 29 | The closeup's ferrofluid drop: a bead dragged through dye (asked 2026-10-11) | [`29-ferro-drop.md`](docs/plan/29-ferro-drop.md) |  | 14 |
| 30 | Shaping the sound and the MIDI: what Imaginando's VS rig showed (2026-10-11) | [`30-sound-and-midi.md`](docs/plan/30-sound-and-midi.md) |  | 9 |
| 31 | Optics and the wall: what Boris FX Continuum showed (2026-10-11) | [`31-optics-and-wall.md`](docs/plan/31-optics-and-wall.md) |  | 6 |
| 32 | The soap film: a draining film seen in reflection (asked 2026-10-18) | [`32-soap-film.md`](docs/plan/32-soap-film.md) |  | 10 |
| 33 | Bubbles and the closeup, per liquid (asked 2026-10-19) | [`33-bubbles-closeup.md`](docs/plan/33-bubbles-closeup.md) |  | 9 |
| 34 | What Photism showed: the page and the app (asked 2026-10-22) | [`34-photism.md`](docs/plan/34-photism.md) |  | 8 |
| 35 | Clear controls: on reads on, one name for one thing (asked 2026-10-24) | [`35-clear-controls.md`](docs/plan/35-clear-controls.md) |  | 9 |
| 36 | What the analog operators could not do (researched 2026-10-27) | [`36-analog-operators.md`](docs/plan/36-analog-operators.md) |  | 12 |
| 37 | Marketing and social media, and the weekly album show (asked 2026-10-29) | [`37-marketing.md`](docs/plan/37-marketing.md) |  | 30 |
| 38 | Realism audit: what still imitates, after §18 (asked 2026-10-30) | [`38-realism-audit.md`](docs/plan/38-realism-audit.md) |  | 23 |
| 39 | Feedback from inside the app (asked 2026-10-30) | [`39-feedback.md`](docs/plan/39-feedback.md) |  | 5 |
| | QA list: what the owner found playing it | [`qa.md`](docs/plan/qa.md) | | 9 |

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
