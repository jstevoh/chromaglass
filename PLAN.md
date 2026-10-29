# ChromaGlass Master Plan

This plan directs the ongoing development of ChromaGlass. It has been restructured to be friendly and clear, separating tasks by Agent (Gemini vs. Claude) and reprioritized to maximize artistic visual impact and performance stability.

## 🤖 Agent Directives & Roles

### Gemini (Visuals & Physics Track)
**Focus:** High-impact WebGPU shaders, fluid dynamics, and rendering algorithms.
**Current Priority: Fully Coupled Advection-Reaction-Diffusion (Moving Chemistry)**
*This is the highest-impact visual task, moving the static Gray-Scott reactions into the turbulent flow.*
1. ~~**Prepare the Data:** Modify `src/gpu/fluid.ts` to expose the chemistry PingPong texture (`this.chem`) to the fluid's velocity field.~~
2. ~~**Write the WGSL Advection:** Add an advection pass for the chemistry texture using the fluid's velocity field (`disp`). This can likely reuse the existing semi-Lagrangian advection logic currently used for dye (`bilerpN` or similar).~~
3. ~~**Integration:** Run this new advection pass immediately *prior* to the `grayScott` reaction-diffusion step in the pipeline.~~
4. ~~**Tuning:** Tune the `feed`, `kill`, and diffusion rates. When Turing patterns are sheared by turbulence, they can explode numerically. Tuning is required to ensure visual stability.~~ (Handled via shader clamped constraints)
6. **Video Injection & Optical Flow:**
   * Fix `pourVideo` in `LiquidVisualizer.tsx`: It currently drops frames. We need to draw the playing `videoPourRef.current` to an offscreen canvas and call `fluid.injectImage` every frame.
   * **Luma-keying:** During the canvas extraction, convert brightness to alpha so standard downloaded MP4s act as transparent fluid overlays.
   * **Physical Interaction:** Calculate basic Optical Flow (frame differencing) on the video canvas and pipe the motion vectors into `fluid.addVelocity()`, allowing motion inside the video to physically push the WebGPU fluids.
7. **Future Visual Targets:**btractive Mixing (subtractive color physics).
   ~* Fully Dynamic GPU Ferrohydrodynamics (solving Rosensweig instability natively).*~ (Completed in PR #247 & cleanup completed)

### Claude (UI & Stability Track)
**Focus:** React architecture, new UI implementation, bug cleanup, and test stability.
**Current Priority: Bug Cleanup & New Performance UI**
* ~~Note from Gemini: Please evaluate and tweak the initial palette colours. The new Ferrohydrodynamics and Chemistry features might benefit from better default dye colours.~~
  Done (26-colour, this PR). The chemistry first had to grow at all: on the looks with
  Chemistry on, the GPU Gray–Scott fed nothing (its feed came only from poured reagent,
  and every random seed wiped the reagent), so Sensual Laboratory and Neon Coral Reef
  printed an empty plate (lab: 3.6 units of dye in four seconds, 451.6 after). Now a
  look's Chemistry is a bath that feeds the whole plate, a pour of Turing Reagent feeds
  and seeds the reaction where it lands on any look, and the field is cleared with the
  look's other chemistry. Colours: Turing Reagent pours CIMA's pale straw (`#f5e69e`,
  was a hot pink `#ff88ff`) and, on a look without Chemistry, its pattern prints in
  starch–iodine indigo (`TURING_PRODUCT`); a look with Chemistry keeps its own palette
  (the "Refresh preset and colour palettes" work owns those). The ferrofluid's colours
  were left alone: Ferro Paint's amber, teal and coral and the thickness-drawn black and
  brown already match Colored I and II.
  - **26-colour-a** (not doing) and **26-colour-b** (fixed): see §26, with 26d's Turing
    Print.
*The owner requires a new UI for live performances, which requires a solid, bug-free foundation.*
1. **Wave 0 (Infrastructure):** Complete the CI/CD and testing stability tasks to ensure faster iteration times.
2. **Bug Cleanup:** Resolve critical QA bugs that are currently blocking the performance desk.
3. **New UI Implementation:** Implement the new UI layer as specified by the owner, ensuring it correctly binds to `LiquidVisualizer.tsx` without disrupting the WebGPU context.
   *Desk v2 (the owner's design, 2026-10-10) shipped as §8-v2: one desk, three layouts. §8-draw (the remote opens on Draw) and §8-play (Play, the phone's listening screen) shipped after it.*

---

## 📋 Detailed Order of Work & Historical Tracker

*Note: The detailed historical waves, CI/CD tracking, and 270+ sub-items are preserved below. When an item ships, strike it out and move its story to `docs/plan-shipped.md`.*

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
- **0.15** **19ai** (F, S then M): one domain loaded at a time. The rules and the folder maps
  shipped (19ai-1, 19ai-2); the splits go in the order of `docs/architecture.md`, one PR each.

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
The owner's account steps sit here too: **S8-on** (switch the crash reports on),
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
  video pour's pause and play every frame, shipped with 14ac).
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
~~**25h** areas that listen for themselves~~ (shipped), then **24.3-place** the melody walks across the plate (B, M), then **25i**
colour that answers the music (C, S–M), then **25j** a lamp under each area (D, M, with
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
**R5-kit** the show kit, **14t-decks**, **15h** the Comb, **9j**; **13.5-link** before
**13.5-osc** (§30), **13.4-ipad**, later **13.7-ipad**; **31e** halation in the Photograph
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

### Wave 7. Reach

- **7.1** The stores (§12), after the owner's accounts (2.x): **12.3**, **12.5**, **12.6**, then
  **12.7**, **12.8**; **12.4a**; later **12.9**.
- **7.2** VJ software (§13): **13.4** the OSC write-up (S, any time), **13-win-app** then
  **13-win-sign** (after 13-win-smoke, which runs beside Wave 2), **13.5** OSC out and Link,
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

### QA list: what the owner found playing it (from 2026-10-04)

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
- ~~**QA-29** Choices that did nothing: 20 of the 80 values the menus offer were
  silently dropped (2026-10-09 to 2026-10-11).~~ **Fixed** (#322's type-derived lists,
  held by #367's check): the first `sanitizePatch` kept its own hand-written lists,
  already behind the types, so Lighter and Exclusion on the blend menu, four of the
  five LED modes, Off and Random for a new song and the mixer's Multiply and Key were
  dropped by `updateSettings`, the phone's patches and a saved look. `npm run sanitize`
  now walks every value of every choice setting (80 kept) and runs in CI's logic part.
- ~~**QA-31** The closeup is "even bouncier and twitchier than before": it punches,
  pumps and shivers with the music at Frame Sway 0 (the owner, 2026-10-11).~~ **Fixed**
  (27a-8, `npm run steadycam`): Macro Sync's punch-in on the kick, push with the energy
  and treble tremor were on at its default of 0.5 outside Frame Sway, so at 6x on a 1440
  px frame a 120 bpm song swayed the frame 0.42% of its width (6 px) and pumped the zoom
  3.2% (the frame's edge 23 px) on every beat, and the ear now hears nearly every kick
  where it heard a third; the lead read one cell's solver velocity, so a press of half a
  cell a step threw the frame 0.95% (14 px) in a frame; a cut landed on a lattice cell and
  slid 14% of the frame to the drop; and each drop random-walked 4 px rms a frame. All
  four are 0 now: the song's hand on the frame is 0.000% at Frame Sway 0 in every mode on
  all 70 looks and show stages, the same press moves the frame 0.17% a frame with it and
  without, a cut lands on the drop's middle, and a drop on still paint moves 0.

**Tier 2. A control does the wrong thing, or cannot be reached.**

- ~~**QA-30** A switch that is on looks like one that is off: the Record panel's Include
  Audio Track is a white knob on a white track when on (1.0:1), four Settings switches and
  the remote's are a black knob on a dark track when off (2.0:1), and eight switch styles
  are drawn in all, one of them the design's (the owner, 2026-10-11, with a screenshot).~~
  **Fixed, #381** (the check first, then Antigravity's build, briefed in
  `docs/handoff-switches.md`): `npm run switches` reads every control that says a state in
  both states, on the desk's five layouts, every Settings section, the panels the palette
  opens, the phone with each sheet open, Play with its sheet and the remote, and holds a
  knob against its track to 3:1, on against off to ΔE 20, a switch's on track to the
  accent and the switch to saying its state; a switch that will not flip is red, and each
  surface needs a floor of controls that changed state when clicked. 429 controls and 16
  under the bar before; after, 451 assertions green, 0 under the bar, 498 controls found
  (403 on the desk, 86 on the phone, 9 on the remote) and 374 of the desk's flipped.
  Every switch is now the one `SwitchPill` (`ui/index.tsx`),
  in `Toggle`'s row or in a row of its own; the phone dock's lit sheet button, the Play
  screen's pressed pills and the mixer's Graded take the accent trio; the Wall's chips
  keep their white-when-on style and now say their state; the swatches, the sequencer's
  stages, the Record panel's tabs and options and the MIDI panel's banks and tabs say
  theirs with `aria`. Two undeclared changes in the build were put back in review: the
  desk's tab order, and a Play sheet that opened itself on a `?debug` visit (the check's
  URL; the app must not know it).
- ~~**QA-20** Blow amount isn't sensitive enough.~~ **Fixed, #346**: the moving wind
  laid two bubbles every sixth step whatever the Amount (ten spawns a second at 60
  steps, twenty at 120), and each bubble pumps the colour out from under it; the
  straw's growth had a floor that made every Amount under about a fifth the same
  breath. Now the wind takes air in only past the speed the surface tears at (the
  blowing number ρ_air U²/2√(ρgσ) past 1, 5.4 m/s against a firm breath's 8: Amount
  0.67), as often as before at the default, 6× at Amount 2 and 44× at 5 (the plate's
  cover limit bounds it), a rate a second; the straw grows as the breath's speed
  (`lib/breath.ts` airTaken, strawFlow; `npm run blowrange`). The wind's push already
  went as the Amount squared, and still does (`npm run airblow` line 6: the pool moved 0.003% at Amount 0.05, 0.085% at 0.25, 2.72% at 1, 14.6% at 2.5 and 16.5% at 5 in software, where the colour goes with the hand). What follows is the report as it was:
  Blow amount isn't sensitive enough. At its lowest settings it still blows a ton of ink and creates a lot of bubbles. Needs a gentler bottom end (gentle breeze) and a higher top end (hurricane). This lack of dynamic range may apply to other tools/controls too.
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
- ~~**QA-4**~~ **Fixed, #293**: with a desk up the chip sits at the top of the plate's box, not the window's; `npm run layout` asks it on both desks at 1440/1280/1024 (main: 3,856 px² over Record).
  Zoomed in, the zoom chip (microscope, − 4.7× +, Hold / Follow / Auto) sits on
  top of **Record performance** and covers it. Desk, Perform tab, any zoom above 1.05×.
  The chip is `fixed top-3 … translate-y-9` in `src/App.tsx` (the `macroZoom > 1.05`
  block, about line 3984) and lands on the desk's top strip, where
  `PerformanceButton` sits (`PerformDesk.tsx:466`; Design has the same button,
  `DesignDesk.tsx:291`, check it there too). Not on the phone (the chip is desk-only).
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
- ~~**QA-18**~~ **Fixed, this PR** (`npm run saves`, 28 lines, in Measure's browser part; main fails "Save asks
  for a name again with a saved look open"). Save did not let the owner name a new
  preset from the current settings. Desk. It asked for a name once; after that the look
  just saved (or any saved look opened) was the document and Save wrote over it, a toast
  the only sign. Saved presets were in no list on either desk (⌘K found them by name),
  ⌘S on the Perform desk reached the browser's Save Page, and the save sheet's fields
  were 200 px wide in a 480 px sheet. Now Save always asks for a name (button, ⌘S on
  both desks, ⌘K) and makes a new preset; writing over the open one is the sheet's
  "Replace “name”" button and the look menu's "Save over"; the look menu lists your
  presets to open or take out. The phone's Looks sheet has the same Save, landing under
  Yours. The narrow window's preset menu said "Save as file" and promised a download
  that saving stopped doing; it says Save.
- ~~**QA-18a**~~ **Fixed, this PR** (the owner's ask, 2026-10-06; `npm run saves`, 33
  lines). The Perform desk had no list of your saved presets of its own (⌘K and the set
  list's Add found them). It has **Your presets** under the set now: a click cues one
  (Go names it), a double-click sends it, + puts it in the set, and the list folds to
  its heading. Go also names a look cued from outside the set (⌘K): it read "Nothing
  cued", greyed out, while Space would have sent it. Desk.

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

- ~~**QA-15**~~ **Fixed, #293**: the seed is a laid-out panel, Dye Budget 0.45; `npm run royopen` 6/6 (main 1/6). Story in §21 of `docs/plan-shipped.md`.
  Roy, 1963 always opens on a giant black stain over flat red, filling most of
  the dish (the owner's screenshot, 0:09 in). It should read as an abstract, colourful
  Lichtenstein painting. Wall, desk. The preset is `src/presets.ts` (`'Roy, 1963'`); 21a
  to 21d hold the rest of its open work. Deferred by the owner: fix later.
  Cause, found and measured in the lab: Roy's seed (`seedPreset` 'roy' in
  `LiquidVisualizer.tsx`) passes `splatBlob` radii in cells (`S * fr`), but `splatBlob`
  takes 128-grid units and scales by `GRID_SCALE` itself, so the four pools come out
  4 to 5 times too wide, overlap across the plate, and the three inks stacked print
  black (57 % of the view black, none white, yellow or blue). A fix and a new check
  (`royopen`, 1 of 6 on main, 6 of 6 with the fix) wait in the shared files under
  `handoff/roy-black-stain/`; its PLAN hunk for §21 is to be merged with this entry.

**Tier 4. Polish.**

- ~~**QA-17** The phone's **Looks** tab wore a sparkle, the icon apps use for AI, and the
  owner wants nothing in the app to read as AI.~~ Shipped: Looks is a palette; the
  other sparkles (Random on the desk and the remote, Evolve, Automation, the track's
  Evolution, "A band in a box") are a shuffle, an hourglass or a drum, and the MIDI
  auto-map's magic wand is an ear, since it builds the map by listening. Desk, phone,
  remote. No user-facing text said "AI", "magic" or "smart".

- ~~**QA-11**~~ **Fixed, this PR**: Follow wears a crosshair (locked on one subject) and
  Auto names its cut, "Auto cuts 5s" from Shot Length (`shotLabel`, `src/lib/macroCamera.ts`,
  the same `max(0.5, macroHold ?? 5)` the camera rides for), on the desk's chip and the
  phone's camera buttons; the hover titles say "never cuts away" and "then cuts to another".
  On the zoom chip, Follow and Auto look like the same thing. They differ in
  `src/lib/macroCamera.ts`: Follow locks onto the liquid where it is aimed and rides it
  without ever cutting away; Auto picks its own subject, rides it for Shot Length (5 s
  by default) and whip-pans to another. Between Auto's cuts both ride one bead, and
  nothing on the chip says which is which (the difference is only in hover titles).
  Make it obvious on the chip, for example a mark where Follow is locked and Auto's
  cuts named in its label; keep both. Desk (`src/App.tsx`, the zoom chip) and phone
  (`PhoneStage.tsx`, the same three buttons).

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
| 12 | The App Store and Google Play (at the end of this plan) | An iPhone shell (Capacitor) and an Android one (Trusted Web Activity) planned; step 1, the site on a phone, **passed** on the iPhone (Safari, 2026-09-27), Android not yet run; step 4, the iPhone shell, **built** with the laptop-remote mode (4a), compiled in CI, not yet on a phone |
| 13 | ChromaGlass in popular VJ software (at the end of this plan) | Planned 2026-09-27: a small native wrapper (Electron) first, with the whole show cached offline and the show server inside, then video out through Syphon, NDI and Spout, OSC control, Ableton Link and video in. Step 1, the Mac app, **shipped** (`desktop/`, `npm run desktop`, built in `desktop.yml`), not yet opened on the owner's Mac with a projector (`docs/judging.md` §26); steps 2 to 8 not started (7, a DAW bridge plugin, and 8, a native renderer core for later, added 2026-10-04); Windows (13-win-smoke, -app, -sign) planned 2026-10-04, never run on a PC |
| 14 | The show at the gig: hearing, timing, speed, the wall (at the end of this plan) | Found 2026-09-27 by reading the code: the show goes deaf behind the projector window (14a), the wall can draw twice a refresh (14b), the projector's pixels come from the laptop's ratio (14c), the beat clock hears smoothed bass (14d). 14a **shipped** (the ear keeps hearing behind the wall, and says when it is deaf; `npm run ears`), not yet seen on the Mac with a real covered window; 14c **shipped** (a wall's pixels are the wall's: a Retina laptop on a 1080p projector opens at 1920×1080, was 960×540, and is offered 1024²; a 4K wall's bottom rung is 2.07 Mpx, was 8.29 like its top; the mirror smooths at 'high'; `npm run rungs` 70/70, was 63/70), whether 1024² holds on a 1080p wall not yet measured on the Mac; 14d **shipped** (the clock hears the kick's onset, by its time; `npm run kicks`), not yet counted in the app on the Mac; 14b **shipped** (one draw a refresh with the wall up, whichever window asks, each offer stamped with its refresh's own time: `npm run wall` 119.1–120.2 draws a second on a 60 Hz display before, 59.8–60.3 after, and 60.0 with 11.7 ms draws where the first version drew 68.7; covered, every ask draws); on the Mac runner, with a renderer, `npm run wall` 187/187, the governor fed a whole refresh of the faster window; 14b-2 **shipped** (on a busy machine the gate no longer turns down a window's own next frame: 23.4 drawn of 29.4 handed before, 29.5 of 29.5 after, `npm run wall`'s busy phase; its floor judged in the same seconds); 14f **shipped for the sound** (the ear tells React ten times a second and the plate asks for each frame's reading itself: the App renders 11 a second with the band, was 70, and a quiet page only its clock, was 5; `npm run renders`; on the Mac the plate heard its own frame's reading on every frame), the MIDI fader's half **shipped** (the plate reads the ride on its frame and the desk is told ten times a second: 121 App renders a second under a swept fader, now 10; `npm run renders`), not yet counted on the Mac; the reading's byte arrays still new each reading; 14v, the load: the opening built three at a time, the app preloaded and the GPU asked for at boot, **shipped** (`npm run loadtime`; `startup`: first step 9.52 s cold on the Mac, was 12.15–17.62 s); 14v-2, the display asked for first and two duplicate kernels merged, **shipped** (Mac numbers in §14v); 14x, the microphone taking the hand's own clicks for kicks, **shipped** (`npm run clicks`); 14v-3, the intro over the opening's black plate, **shipped** (`npm run intro`); 14v-4, the intro held still while the opening's render pipelines compile, **shipped** (`npm run intro` line 9; the Mac's `startup` frame gap); 14v-5, the intro still from the first paint, **shipped** (`npm run intro` line 9b; startup's frame gap 2.13–2.35 s turning, 0.85–1.18 s still); 14v-6, the opening asks its first fills before the display after the mount frames settle, **shipped** (judged over the week after merge by `npm run flakes -- --check 'no stop in the opening'`) |
| 15 | Every tool on every liquid | Audited 2026-09-27 (table in 15); 15a, every laying tool lays the bottle, **shipped** (`npm run bottles`, Mac); 15d, the Press moves the oil with its colour, **shipped** (`npm run pressoil`), not yet judged on the Mac; the ferrofluid's half **shipped under Thin Gap** (a pressed pool stays full, spreads by the volume the glass displaced and comes back on lift; the ferrofluid's own viscosity in the gap; `npm run ferropress`), not yet judged on the Mac, and with Thin Gap off a press still greys it; 15c, Blow's wind carries the colour and the oil rather than erasing them, **shipped** (`npm run wind`, and `tools` on the Mac) as a carry, a shortcut 15g replaces with air's shear on the film; not yet judged on the Mac; 15b, the Finger as a solid that moves every liquid on a thin gap, **shipped** (`npm run fingerflow`), not yet judged on the Mac (judging §33), its Blow, old-plate, inside-the-hand and remote halves open; 15i, picking a bottle lays nothing, **shipped** (`npm run bottles`, Mac); **15g's first part, the moving Blow as air on the film, shipped** (the breath's stress a body force on a thin gap, its carries retired there; `npm run airblow`), not yet judged on the Mac (judging §44); 15e's check **shipped** (`npm run liquidsgpu`), 15e-1 to 15e-9 open; 15f, 15g-2 to 15g-6, 15j open |
| 16 | Many plates (rig-plan R1, at the end of this plan) | Picked by the owner 2026-09-27 ("Let's build multi-plate next"); planned in five steps. 16a, the back plate's own look, **shipped** (#231, `npm run backplate`), not yet seen on the Mac; 16b, a projector picks its source, **shipped** (#226, `map`, `mixer`, `wall`), not yet seen on the Mac; 16c, beams add and the seam goes, **shipped** (#232, `beams`); 16f, add and take off the back plate on every look, **shipped** (#273, `layout`, `phone`); 16d–16e not started |
| 18 | The physics under the look | Audited 2026-09-28 (section 18): the shortcuts where the plate imitates a liquid's result instead of simulating it, ranked by gain against GPU cost; the top four are the plate as a Hele-Shaw cell (18a, which the tools' 15b/15g and the grates thread's fingering wait on), the lamp through the dye (18b), a pour that adds liquid (18c) and each liquid's real properties (18d). **18a first part shipped** behind Thin Gap (off in every look; `npm run thingap`); **the Press draws the liquid back when you let go, on Thin Gap, shipped** (carries in substeps, the press a bowl, the glass lifting in seconds, the Press's carries retired there; `npm run presslift`, `tools` on the Mac), not yet judged on the Mac; **Thin Gap on in every look, shipped** (#248, the owner's pick; saved looks carried over; the opening builds its pipelines before the first step), its cost not yet read on the Mac (2.1); **forces as forces (18a-2) shipped** (body forces answer the liquid's viscosity, Rain Drip heavy colour, Updraft a shear, Glass Smear a sliding glass; `npm run forces`); 18a-3 to 18a-11 left, each its own PR; **18b the lamp through the dye, shipped** behind Lamp Ground (`npm run lamp`); **18b-1 which looks go on it, shipped** (#262: eleven looks on the lamp, ten picked by a written rule from Mac pictures, `npm run lampjudge`, one by the owner); 18b-2 to 18b-9 left; **18d-1 each poured liquid's viscosity, shipped** (glycerine crawls, syrup runs ahead in a thick look; `npm run thick`); **18c-1 a pour adds liquid and 18d-2 flushing, shipped** (a held bottle pushes the plate out into rings, a poured liquid stays until it is pushed over the rim; `npm run flush`); **18d-11a the poured liquid rides the colour's carry, shipped** (what it adds to a step halved on CI's Mac, 13.54 to 6.73 ms at 768², a whole colour carry to half of one; `npm run thick`); 18c-2 to 18c-5 and 18d-3 to 18d-11 left |
| 19 | The checks, the build and the plan itself (at the end of this plan) | Found 2026-09-28 in a review of the workflows, the harnesses and the build: `gallery.yml` holds the Mac runners (19a, **shipped**: by label or by hand, and a merged PR's runs stop, `npm run macqueue`), Measure is near its timeout (19b, **shipped** with 19h: three parts side by side, every step runs, and the `wgsl` and parse gates), checks that can pass unmeasured or that nothing runs (19c), the build (19d), the harnesses as code (19e), the plan out of step (19f); what a red PR costs and which reds are the PR's own (19h, **shipped** in part: docs-only PRs skip the Mac, the shards evened, two flaky lines handed off; and a deploy skips the Mac when the PR's site files are apart from main's newer ones); 19i to 19t, faster coding and releases, measured 2026-10-04 (Wave 0 of the order of work): 19i, 19j, 19k and 19r **shipped**, the rest open |
| 20 | Lace and holes: a pale film torn open over colour | Planned 2026-09-28 from a still of another show: clear film dewetting in the gap, under the lamp (18b), edges from refraction (18e), oil discs on the front layer. A CPU prototype tears a film into lace with holes over a hundredfold of sizes. The lamp ground it needs shipped (18b, #256: a clear pool throws 100% of the lamp, `npm run lamp`); 20a–20f open |
| 21 | Looks after painters | Roy, 1963 and its Ben-Day Dots control **shipped** (`npm run benday`, lab); not yet judged on the Mac; 21a–21d open |
| 22 | Spin the plate | Asked 2026-09-28: the dish turned on command and by itself, at a rate or with the tempo. 22a, the Spin tool, Auto Spin (Off, Rate, Tempo) and Reverse Spin, with the liquid dragged round by the glass through the gap, **shipped** (#223; `npm run dish`, `npm run turntable`), not yet judged on the Mac (`docs/judging.md` §28). 22h, the look's own turning (motor, music, flick) on the same dish, so a flicked plate of water trails the glass, **shipped** (#252; `npm run turntable`, `npm run flick`); 22j, the motor's stir in the middle replaced by the dish and the looks' motors retuned to match, **shipped** (#261; `npm run turntable` 15); 22k, what the swirl costs on the looks it now runs on, measured on the Mac and cut to a third on a thin plate, **shipped** (#258; `npm run swirlcost`); 22b–22g, 22i, 22l, 22m open |
| 32 | The soap film in reflection | Asked 2026-10-18 from a photograph of a draining film: Newton's bands, black lace, flow-combed edges. The model (an inextensible film's gravity convection, evaporation to Newton black, angle-dependent reflection) and its judge `npm run soapfilm` (23 lines) are written; 32a, the CPU reference, is next (Antigravity); 32b–32e open |
| 34 | What Photism showed: the page and the app | Asked 2026-10-22 from a screenshot of a competitor's page: a landing page before the sign-in wall (34a, **shipped** as a still hero; 34a-5's words shipped; 34a-2 to 34a-4 and the share card open), a looks browser (34b), an analyzer look (34c), Chladni figures (34d), drawn automation lanes (34e), one-button share export (34f), reactions named (34g), a dropped picture as a look (34h); the DAW bridge and Syphon keep their order (34i). Not started |
| 36 | What the analog operators could not do | Researched 2026-10-27 from the operators' own accounts: a lit-stage grade (36a), span the wall across projectors (36b), a practice plate (36c), show the hands (36d), all proposed; and four open items moved up with the evidence: heat as a stroke (36e, S2; **36e-1, the model and `npm run boil`, shipped**; the GPU build 36e-2's check `npm run boilgpu` written, red until the build), a plate per performer (36f, 14m-guest), room lights follow the wall (36g, 14q), layers at their own speeds (36h) |

Also landed or in flight around these batches: the macro closeup's cells ride the paint
and stop shaking at 6x (#165, `npm run cellride`); the show's pipelines are built before
it opens, so a cold Mac no longer freezes for 6–19 s at the start (#164, `npm run
startup`), and draws with each of them once before it opens, so the first frames no longer
stop for a second or two either (#181); the magnet stays where the hand leaves it (#159).
### 0. The dye a tool makes, and the deploys it is blocking

**Partly shipped** (#152, #225, #238, #250, #251): the dye's advection thins where the flow spreads, a held press no longer sets the whole plate flowing, the band's kicks follow Audio Impact, and the phone's take-button checks and the deploy gate no longer fail on what they did not measure. What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

`src/gpu/wgsl/fluid.ts` (advection), `scripts/tools.mjs`

*Found 2026-09-27, **cause found 2026-10-22**:* **"adds none" went red on runs that did
not touch the Finger, because the window it was measured against was the ambient
seeder, not the plate.** #182's tools shard (a Pacing change; the same code had passed
the shard one commit earlier) read 50 → 64 against −12 before and +9 after, red by 1.5:
the allowance was centred on the larger-magnitude idle reading rather than spanning
both, which is not the bracket its comment described. That part is bracketed now
(`fMinIdle`/`fMaxIdle`, spanning both readings and 0), and bracketing alone made the
reds stop without explaining them.

The explanation is that the Finger section, alone among the tool checks, left the
ambient seeding on. The Blow and the Press both turn it off and say why ("so 'left
alone' was the seeder's drift, not the plate's"). Measured on the Mac with the seeder
on and **nothing dropped at all**, the plate reads 64 and gains +26 then +18 over the
two idle windows — so "what the plate did alone" was mostly the seeder's rate. That is
why the idle reading sat at +31 to +36 whether the pool was 66 or 728, an eleven-fold
range: a window dominated by a term that does not depend on how much dye is on the
plate. And a bracket built from it is wide in proportion to nothing: at a pool of 66 it
accepted any Δ in [−15, +46], so a Finger that created 70% of the pool again in new dye
would have passed (check-skeptic).

Two findings are withdrawn rather than confirmed. The 2026-09-27 reading — 40 Mac
shards, pools 49 to 279, the stroke adding +11 to +21 on all 12 pools under 150 — was
read through those seeded windows, and at that size the seeder alone lays about as much
as the Drop does, so it is not evidence about the Finger. And a Mac sweep at four pool
sizes (728, 176, 152, 66) that put the hand's own contribution at +3 to +5 by
subtracting a no-stroke control is measured on the same seeded plate, so it bounds the
hand only against a background it did not control.

*Done:* the seeder is off for the Finger section now, as for the Blow and the Press,
with a new `quiet` check: left alone, the pool may not *gain* more than 5% of itself, or
5, over an idle window. Gains only, because the fault is dye arriving from something the
check does not control — a window that loses dye only narrows the bracket downward and
cannot excuse a hand, and the Mac's after window reads −1, so a two-sided bar would
charge it for nothing. It is ANDed into `adds none`, as the Press ANDs its own guard
into both of its claims, so a plate the harness has declared unquiet cannot also print
"adds none: ok".

The idle windows fell from +35 to about 1, so the bracket closes on nothing and the
check measures the hand. On the owner's Mac, four runs: idle +1 before and −1 to −0
after, on pools of 357 and 611, and **the hand adds nothing** — Δ under ±0.5 every
time. Thin pools are still unmeasured (below).

A control (`TOOLS_FINGER_CONTROL=1`) runs the same shape with the mouse never going
down, on the same helpers, and prints the hand's own contribution by subtraction: +0.1
to −1.1 across three runs, against a slack of ±59 to ±97. It waits out the stroke in
solver steps rather than milliseconds, because the real path pays 30 `mouse.move` round
trips the control does not: at equal wall time the stroke ran 274 steps against the
control's 122, a factor of two apart in the pool's age, and the comparison was void —
the same fault the Hover check was rewritten to fix. Step-matched it reads 273 against
272 on a pool of 611, and 138 against 137 on a pool of 357, and it prints both spans
with the verdict, so a run that is not comparable, that timed out, or whose span did not
read says nothing instead of implying the opposite. It reports and does not gate: with
no pool it says so and stands down rather than throwing, because a reporting-only block
that can end the run is a gate whatever its comment claims. And it states the narrower
claim it can support — the second window is not biased by where it sits in the run — not
the broader one it cannot, that the window is unbiased *when a stroke happened*. For
that, the `fIdle`/`fIdleAfter` pair in the check's own detail is the evidence, and the
control calibrates that pair rather than replacing it.

*Done (PR #449): both bars set from the shards' own noise.* `TOOLS_FINGER_TRIALS=<n>`
repeats the stroke on the same helpers, cycling the Drop's hold from 300 to 1500 ms so
one runner reads thin pools and thick ones, and prints each trial's excess over the
bracket as a share of the pool (reporting, not gating). Run twelve times on four Mac
runners, 48 trials on pools of 39 to 357: the stroke landed at most **0.48 outside the
bracket, 0.17% of its pool**, and the plate left alone gained at most **+0.74, 0.26%**.
The six seeder-off shard runs before them and the five `adds none` lines beside them
read the same. So `fSlack` is now `0.02 * pool + 1`, was `0.15 * pool + 5` (±8.1 on a pool
of 357, was ±59; the nearest trial is a sixteenth of it), and the `quiet` bar is
`0.02 * pool + 1`, was `max(5, 0.05 * pool)` (the nearest trial is a tenth of it). The
check's detail now prints its Δ and windows to two places, so `npm run flakes -- --check
'and adds none'` reads the margin from ordinary pushes.

*Measured (PR #449):* the Finger adds no dye on a genuinely thin pool: twelve trials on
pools of 39 to 80 landed at most 0.05 outside the bracket. `TOOLS_POOL_MS` shortens the Drop hold to
put a CI-sized pool on a fast machine; it is floored at 100 ms because under that the
Blow's pool comes out at single figures and its checks measure nothing. Laying the pool
by solver steps rather than milliseconds would make it one size every run. Also open,
and unrelated to the seeder: `and draws it back when the hand lets go` read 78%, 76%,
80% and 48% back on four Mac runs against its 50% `backOf` bar, so it sits on its
threshold. Its detail labels only `cameIn`'s quarter ("a quarter needed") and leaves the
50% bar unlabelled, so the 48% red reads like a pass to anyone who has not read the
condition.

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
And `npm run ferrodrift`, whose old-plate line asks the press to be still pulling
poured ferrofluid in toward bubbles near the middle on the old plate (0.099 → 0.150 in
twelve seconds, #250), as the proof that check can see a drift: when the press goes,
that line turns round and asks the old plate to stay. The thin gap
already keeps it still, because there the press is only the glass and a gap near the
floor is where the flow's mobility (h³) goes to nothing, which is the no-flux
boundary this item asks for, reached by the gap itself.

*Found along the way, not done:* a song's chorus lifts Audio Impact by 0.2 for the plate
(`useMusicIntelligence`, music library tracks only), so a fader at 0 is 0.2 in a
chorus, for every reaction behind it, not only the bubbles. Whether 0 should hold
through a chorus is a look question.
Still reaching the plate from the band at Audio Impact 0, each behind a dial of its
own and left as it is: Soap Bursts on the beat (Soap Flow), Rock and the rhythm plate
(Plate Rock, Beat Squeeze), the maze breathing on a kick (Ferro Labyrinth), the
camera's beat (Macro Sync), and the look's pace (Tempo Sync). Whether any of those
should also answer to Audio Impact is a later look question, not done here.

*Found 2026-10-04 (#238), **done on the thin gap (#250); open on the old plate** below:* **with the band playing, the
ferrofluid poured round Classic's middle drifted into it** (the disc 0.12 round the
middle 0.180 → 0.501 of black in nine seconds on the Mac, 0.099 → 0.084 in silence).
`npm run ferrodrift` (#250) pours the ring with the band on, in the app, on the Mac,
and four runs of it found: with the look as it is the ring spreads into the middle as
fast in silence as with the band (0.100 → 0.248 against 0.097 → 0.233 in twelve
seconds, the ferrofluid's mean distance from the middle growing, so the look's own
stirring spreading it both ways), and no slower with the bubbles, centre gravity,
Tempo Sync or vibration taken away; with the plate's own currents held, as #238 held
them, on the thin gap every look plays since #248 the band moves nothing in, its
bubbles on the plate or not (0.097 → 0.082 and 0.102 → 0.076; silence 0.114 → 0.117);
and held on the old plate (Thin Gap off) it still drifts in when the band's bubbles
land near the middle (0.099 → 0.150 with two to seven, the mean distance 0.310 →
0.298), and not on a run where it dropped none or with Bubbles at 0 (0.086 → 0.086,
0.097 → 0.093). So it was the old plate's bubble press ("a still bubble presses the
glass", above), and #248 took every look off it. The check asks the thin gap with
the band and four bubbles set down where the band drops them, against a silence that
has to be still itself, and asks the old plate to drift by more than the same bar, so
the instrument is shown to see what it was built for; that line turns round to ask
the old plate to stay once its bubbles stop pressing.

*Found 2026-10-05 (#267, #281 and #287 red on it), **fixed in the ferrodrift control's
PR:*** **the old-plate line sat on its bar.** Its four bubbles at 0.15, set down 2.5 s
after the pour, were never what pulled the ring: the band's own were. Over eleven Mac
runs the old plate pulled 0.0029–0.0091 on the six where the band had dropped no air
before Audio Impact was held, and 0.0062–0.0260 on the five where its dice had dropped
three to seven onto the dye ring, against a bar of 0.004 over silence. The check now
holds Audio Impact at 0 from before the band starts, asks that the music released no
air on any page, and sets down eight of the band's largest bubbles where it drops them,
from the pour on, on both plates. Still open: with the same four bubbles the old
plate's pull varied threefold (0.0029 → 0.0091), with its readings sometimes
accelerating (0.310 → 0.281 in twelve seconds) and sometimes linear; what makes one
press pull three times another is not measured, and belongs with the press item above.

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

*0-tap, the tapped clock's two stopwatches:* **shipped** (#308). "The tapped beat drives
the show's clock" read the clock against the harness's own stamps of its taps; it now reads
the tempo source's period (`chromaglassTempo()` under `?debug`) and asks two claims, each on
one stopwatch (`npm run squeeze`, 400.1 against 400.1 ms, and three controls red where they
should be). The story is in docs/plan-shipped.md §0.

*Found 2026-10-06, by 0-tap's controls, not yet done:* **"and the show kicks on it" passes
on the ear alone.** With the tap switched off, the band's own kicks heard by the ear made 25
and 24 in 12 s against a floor of 22.5 (three quarters of 30 tapped beats), so the claim
that the kicks come from the tapped clock can pass with no tapped clock. It wants to count
kicks on the tapped grid (within a fraction of a period of a tapped beat), not kicks at all.

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

#### 1a. The grain at the dye's edge made the plate look digital (shipped)

Reported 2026-10-04 on the laptop's web app: "quite a few of the looks seem very
pixelated ... less like liquids", and "it's always been this way to a point. It just
looks very digital." `npm run pixels` (new, `pixels.yml` on the Mac, or a PR labelled
`pixels`) photographed every look at 1440×900 on a Retina panel: every look's dye edges
were a ragged fringe of single lit and dark flecks, at the governed rung and the top one.
The cause was granulation (on at 0.5 in every look) scaling the opacity *before* the gooey
contrast curve, which is steepest at the edge's half opacity, so every grain there became
fully on or off. **Shipped:** the grain is drawn after the edge, as optical depth
(`grainedDepth`, wgsl/plate.ts). `npm run grainedge`, seven looks in the lab: flecks (edge pixels
moved over 40 levels in a channel) 6–35% before, 0–0.61% after, every look held under 2%;
the bodies keep a grain that is a texture, weaker than before inside thick pools, where
the dye already stops nearly all the light. The soap film's colour reads the liquid's thickness from before the
grain (Sunny Side Up 7.1% → 0.25%, Soap Film 3.0% → 0.2% on the edge check). The owner's eyes on a laptop: `docs/judging.md` §40.

Found with it, open:

- **1b. Agate's Liesegang rings are dots on a 128² lattice** (lane C, `liesStep` in
  wgsl/fluid.ts, `LIES_GRID`). The precipitate nucleates once per cell of its own grid, so
  at a laptop's size Agate shows a regular grid of dots where real Liesegang bands are
  continuous rings. Measure: the `lock` of `npm run pixels` on Agate at the lattice's pitch
  rather than the solver's.
- **1c. A Retina laptop on the website opens at one device pixel per CSS pixel**
  (`platform.ts`: the hosted ladder starts on `{512, 1}`, tops out at 1.5x). The plate is
  drawn at a quarter of the panel's pixels and upscaled until the governor climbs, and
  never above 1.5x. Whether it can open higher without missing frames is for
  `npm run pixels -- --rung 0` and the frame time on the owner's laptop.
- **1d. On CI's Mac every look settles on 256²**: the governed `pixels` run went
  512 → 384 → 256 in every look in its first twenty seconds. If the owner's laptop does
  the same, the plate is drawn from a quarter of the cells most of the time; a look's
  grid should be measured on the owner's machine (judging §40) before the ladder is changed.
- **1e. The lab draws without the grain field unless asked** (`lab.render`'s `grain`
  option, scripts/lab-entry.ts). Without it the plate reads a blank texture and every
  look's grain is one value, about 0.75, everywhere: each lab check of a look with grain
  measures a plate a quarter thinner in optical depth than the app's. `benday` had its
  washes tuned on that (re-laid in 1a). Draw with the grain by default, and re-read the
  checks that move.
- **1f. Roy's print flips ink on the grain** (PLAN 21). The Ben-Day print decides ink or
  paper per pixel from the finished picture's coverage, so the grain under it flips
  pixels at every tint's threshold: 8.2% of Roy's edge pixels on the Mac against 0.02%
  for the plate under the print. A print should read the dye's coverage before the grain
  (or Roy ship without one); the owner's eye decides which (judging §40).
- **1g. On the lamp the grain mottles a thin edge** (18b's looks: Poster 1969, Fillmore,
  Microscopic Chaos and the rest on the lamp). This fix does not change them (the same
  numbers before and after it): the grain's soft blotches, about ten pixels across,
  move a thin edge's pixels 9–10.6 levels on average (`npm run grainedge` prints it), with
  no flecks. Watercolour-like, not dithered; whether it is too strong is the owner's call.
- **1h. A screen-space anti-aliasing pass (FXAA and its kind): not for the plate; the
  projector's warp is the one place the picture itself aliases** (asked 2026-10-05, from
  an After Effects FXAA plugin). FXAA finds pixels whose brightness jumps against their
  neighbours and blurs along the edge it guesses, which repairs one-pixel stair steps on
  rasterised triangles. The plate has none to repair: it is one full-screen shader whose
  edges are already drawn as coverage over a pixel and a half (`fwidth` in wgsl/plate.ts:
  the rims, the drops, the ferrofluid's line), and the dye is read through a Catmull-Rom
  filter (`textureBicubic`), not nearest texels. What reads as blocky comes from the
  **simulation grid**, not the final image: at 256² on a 1440-wide panel one cell is
  about 5.6 pixels, so a step along a dye edge is five pixels tall, far wider than FXAA's
  one-pixel blend, and the fixes for that are the grid's own (1b, 1c, 1d). Run over the
  finished frame, FXAA would also take things that are meant to be there: the pigment's
  grain (1a), Roy's Ben-Day dots (a regular high-contrast pattern is exactly what it
  smears), and the razor edge of a thick ferrofluid domain (judging §41). A temporal
  pass (TAA) is worse on a liquid: everything moves every frame, so its history ghosts.
  Where the **final image** does alias is the projector's pass (`src/gpu/wgsl/output.ts`):
  each wall pixel takes one bilinear tap of the plate (`textureSampleLevel(..., 0.0)`, no
  mip levels), so a surface whose corner pins shrink the picture (a keystoned far side,
  a small mapped shape) skips texels and the grain, the dots and thin fingers shimmer
  there as the liquid moves; and a surface's `feather` is in its own space, so on a
  shrunk side a 0.01 feather can fall under a pixel and its outline stair-steps. The real
  fix is to filter by the pixel's footprint: take as many taps as the warp shrinks the
  picture (its derivatives give the count), or build mip levels of the plate's picture
  when a surface needs them, and give the feather a floor of a wall pixel and a half.
  Measure with `npm run map` (the lab, `PW_WEBGPU=1`): a pinned surface at a half and a
  quarter of its size, a fixed picture panned a fraction of a texel a frame, and how
  much each wall pixel flickers beyond the pan itself (shimmer) before and after, and the outline's width in wall pixels. Unbuilt; nothing to judge yet.

### 2. Lacing

**Shipped**; its 4–8 px gate moved to batch 3. How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 3. Drops, not rings

**Shipped** (#163): drops and bubbles as air pockets, shaded as a projector throws them. Open: whether the camera pass brings a highlight back is the owner's call. How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 4. Liquids that behave differently

**Shipped**, with milk's opacity shipped in 18j (#353). How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

**Milk's opacity shipped (#353, 18j).** Optical scattering (Kubelka–Munk diffuse backscattering on black ground, two-flux forward extinction and forward halo on lamp ground) packed into `vel.w` from the advected `species.b` field. Colour sits on the opaque white body of milk as solid vibrant red (reference §4).

### 4a. What is in each preset's dish

**Shipped**: what each preset puts in its dish. How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

**4a-clock. Clock Glass and Ferro Paint after their references** (**shipped**, #280).
The owner, 2026-10-04: "the clock glass preset is really underwhelming as is the ferro
presets. They don't look anything like the inspirations." Judged against the Mac gallery
of that morning (`/mnt/project-files/lamp-ground/gallery/`, 12 s and 30 s):

- Clock Glass was one lavender-magenta disc. A clock-glass dish (the Joshua Light Show,
  the Fillmore) is coloured oil and water that will not mix: cells of red, amber and
  blue oil with dark rims in a purple water. The look laid three water dyes in rings on
  top of each other, with radii in the wrong units (below), so they blended at once.
  It now lays a purple water round twelve bodies of oil, each with one of red, amber and
  cobalt in it, with Oil Bodies and Oil Tension on (`src/lib/oilLay.ts`). Laying it found
  a fault in Oil Bodies itself: the oil's share of the dye started empty when a plate
  first had bodies, on the reasoning that the colour inside a body would be handed to it
  in a few steps. It was not: the bodies' colour ran out into halos in the water. The
  share now starts from the plate as it is (`fluid.ts`, bodiesFresh). `npm run
  clockglass` (lab, 192², 300 steps): the dish's colours spread 0.248 rad against the old
  lay's 0.101, in 4 separate regions off the water, and the oil holds 97% of the colour
  laid in it (17% with the share starting empty, 3 regions). `npm run bodies` 17/17.
- Ferro Paint opened as one green with black holes, where Colored I and II hold amber,
  teal and coral in regions. Its sixteen patches were laid with a radius of `S × 0.15`
  in `splatBlob`'s 128-grid units, which it scales by GRID_SCALE again: 0.225 of the
  plate, nearly the patches' spacing, so all sixteen lay over each other. Now 0.09.
- Open from this: **4a-units**. Roy, 1963 lays its shapes the same way (`S × fr` in
  128-grid units, 1.5 times the size meant); its panel may want them halved, by eye.
  **4a-clock-fade**: on a fade (the set list, the desk's Go) the seed is laid in shares
  over the fade (addSeedShare) while every body's oil lands at once, so on a long fade
  the bodies move before their colour arrives and some of it lands in the water: the
  halo this fixed for a hard lay. Lay the oil in the same shares, and give `npm run
  clockglass` a case that lays through the handover. Also unmeasured: the look's own
  doses (`['oil', 'water', 'oil', 'syrup']`, about seven small clear bodies at the
  lay) and the app's finer GPU grid (the check lays at 192², the app runs 384² and up).
  And the automation's drops still land any of a look's dyes anywhere, so over a minute
  the regions blur: where each dye lands belongs to the "more going on in every look"
  work (several areas of interest across the plate), not to these two looks.

### 5. Playing it: sound learn, shutter, and a look link

**Partly shipped** (#154, #155): the bands and sound learn's music source and triggers (`npm run bands`, `npm run learn`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

`src/lib/soundLearn.ts` (new), `src/hooks/useAudioAnalyzer.ts`, `src/components/MidiPanel.tsx`,
`src/lib/cameraPass.ts`, `src/App.tsx`

Independent of batches 1–4, so it can be built while the Mac is judging a look, and it
is the batch that changes how the show feels to play.

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
a kick on channel 1 only: the kick onset follows channel 1, not the mix. **Home: 24.1**
(2026-10-04), the audio-voice half of the Patch inputs; Chrome gives a page at most two
input channels, so above two it is the Mac app's alone.

**Follow an instrument** (`5-follow`, *proposed 2026-10-05 by the owner*: "the guitar
can control one aspect of the visuals"). The show hears a mix as drums and bands:
`audioFeatures.ts` names `level`, `kick`, `bass`, `snare`, `hats` and eight log-spaced
bands, and sound learn binds any of them to a setting or a trigger (`soundLearn.ts`).
That is enough for the drums, because each owns a corner of the spectrum and an onset
shape, and the kick and snare onsets look at where the new energy landed. It is not
enough for a guitar, a voice or a keyboard: they share 200 Hz–5 kHz with each other and
with the snare's ring, so the band a guitar falls in moves with whatever else plays
there, and a binding on "band 5" is not a binding on the guitar. The ask is one
instrument driving one aspect of the plate: the guitar's level rides Swirl, its strums
drop dye, the note it plays picks the hue; the voice warms the lamp; the bass line's
pitch tilts the plate.

What it builds on, so none of it is new plumbing:

- **Named sources.** A followed instrument is one more `SourceName` (`guitar`, `voice`,
  `keys`, `note`) with the reading every source has (a value in its own `AutoRange`,
  an onset with its `at`), so sound learn, the music button beside each Learn, the
  patch cord on the `bands` plate source, the desks and the phone take it as they take
  `snare`.
- **The ear per input channel** (above, home 24.1). When the guitar has its own
  channel (a DI, a band's desk, a rack voice), following it is naming the channel, and
  that is the surest route live. This item is the case where it has none, which is the
  home listener's every case (§23): one stereo mix from a stereo or a streaming app.
- **Pitch and chroma already exist offline.** `songMapWorker.ts` works out an
  autocorrelation pitch, a 12-bin chroma and a spectral centroid about four times a
  second for the song map; `useAudioAnalyzer` has a live `spectralCentroid`; and
  `songTrack.ts` decodes a whole file for the render (§6), which is where §17's set of
  files would be analysed too.
- **MIDI notes as voices** (24.3): an instrument that is a synth needs no listening,
  its notes arrive exactly.

Three steps of rising cost, one PR each:

- **5-follow-a. Notes apart from hits, live.** Split each analyser frame into its
  harmonic and percussive parts by median filtering across time and across frequency
  (Fitzgerald, 2010): a held note is a horizontal line in the spectrogram, a hit a
  vertical one. Read the harmonic part by its harmonic series rather than its band: a
  pitch and pitch class with a confidence, its brightness, and an onset only when a
  new note starts there, so a strum counts and a snare does not. That gives a `note`
  source and a low, mid and high `tonal` source, cheap enough for every frame. This is
  what the instrument physically is (a string's harmonic series over a decaying
  envelope, against a drum's broadband burst), and it follows "the guitar" wherever the
  guitar is what plays in its register, which on many band records it is. It cannot
  tell a guitar from a piano on the same notes; that needs the next step.
- **5-follow-b. Real stems, for files.** For a song the show plays itself (§17) or
  renders (§6), separate it before it plays with a source-separation model (Demucs v4
  has a six-stem model with guitar and piano beside drums, bass, vocals and other;
  Open-Unmix has four), once per song in a worker on the GPU (onnxruntime-web on
  WebGPU, or native in the Mac app), and analyse each stem through the same
  `analysePcm` the render uses, so `guitar` is the guitar's own stem. Cached with the
  song map. The model's size and licence, and how long a song takes on a laptop, are
  unmeasured and decide site or Mac app (§23: probably the app).
- **5-follow-c. Stems live.** The same separation on the live input, if a streaming
  model fits a frame's budget at a latency the plate can afford (to measure; a model's
  look-ahead is latency, and §14e already finds the kick late). Until then the live
  show uses 5-follow-a and the channel route.

The phone's Sound sheet lists the followed instruments with a meter each, and Learn
on the phone offers them as sources, in the same PR as each step.

*Measure:* a new node check, `follow`, beside `bands`: a song built from known stems
(a plucked-string guitar part by Karplus–Strong over the band in the box's drums, bass
and pad from `simulatedMusic.ts`), mixed, with the follower run on the mix. The
`guitar` (or `note`) source's level tracks the guitar stem's own envelope (r ≥ 0.7);
it calls nine in ten of the guitar's note starts within two frames and fires on fewer
than one in ten snare hits; and with the guitar stem muted it stays under 0.1, so a
follower that only reads the mids fails. The bars are proposals, set against the first
measured run. 5-follow-b adds the same test on a real multitrack whose licence allows
it, on the Mac shard.

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

**Shipped**, with the proposals below open. How it was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

~~**8-v2** Desk v2, the owner's design of 2026-10-10: one desk in three layouts (Build,
Gig, Load-in), every panel docked, floated, folded or closed, knobs for encoders, the
panel browser (⌘P) and the Stage sheet (⌘,)~~ (shipped; story in `docs/plan-shipped.md`
§8; checks `npm run desklayout` and `npm run layout`).

~~**8-tabs** The tabs are the owner's (asked 2026-10-27): every chip across the top is a
set of panels, renamed, reordered, added (empty or a copy) and deleted from the pencil
beside them, with Perform, Sequence and Setup shipped as the three to start from. Build
and Gig fold into Perform, Load-in and the Sound screen into Setup; the Sequence and
Sound screens are panels (Songs, Sequences, Music & Drone); an older desk's rearranged
layout is kept as a tab of its own; the phone has the same tabs in More › Tabs~~ (shipped;
`src/lib/deskTabs.ts`; checks `npm run desklayout`, `npm run layout`, `npm run phone`).
Open from it:

- **8-tabs-a** (S) The tabs live in the browser's storage, so a phone and a laptop each
  have their own. Carry them with the account (cloud sync, judging §72) so a venue's
  Setup tab made on the laptop is the phone's too.
- **8-tabs-b** (S) The phone draws a desk-own panel (bottles, set list, rides) as a
  button to its own sheet, not the panel itself. Draw them in place once each has a
  touch-sized body, so a tab on the phone is the whole tab.
- **8-tabs-c** (S) A chip dragged along the strip to reorder, beside the editor's arrows.

Open from Desk v2, each its own thread (the UI lane):

- ~~**8-play** (M) Play, the design's screens 3a and 3b: a phone's own screen for
  someone listening, not performing (the plate edge to edge, eight dyes, Drop · Blow ·
  Press, six sliders, the looks, Follow the music, Share clip). A phone opens on it;
  `/play` is it on an iPad or a laptop~~ (shipped; story in `docs/plan-shipped.md` §8;
  check `npm run phone`'s Play part).
- **8-play-a** (S) The iPhone app's Laptop remote from Play. Play here lands on Play,
  and the way back to the remote is All controls › More › Laptop remote, two taps
  deeper than it was. Draw (8-draw, shipped) is the remote's new face; Play's tray
  could gain a "Draw on the wall" entry in the app only. *Measure:* `npm run applink`
  from Play.
- **8-play-b** (S) Play's looks strip draws each look as its two-colour swatch, as the
  cue lists do; the design's tiles are pictures of the look. The proposal below
  (pictures, not swatches) gives Play the most, since the strip is all it has.
- **8-play-c** (S) Play keeps the app's settings, not its own. The design's README has
  Play keep "its own `VisualizerSettings`", which only matters once the same browser is
  also a desk; today a phone is one or the other. Revisit with 8b's offline Preview.
- **8-play-d** (S) Follow the music brings a look's Sound Drive to 0.5 when the look
  has none, so the chip never reads on and does nothing. A look built to ignore sound
  (a still photograph) then moves with it; whether such looks should say so on the chip
  instead is the owner's call on a phone.
- ~~**8-draw** Draw: the phone or iPad as the wall's pad~~ (shipped; story in
  `docs/plan-shipped.md` §8; check `npm run draw`). Found along the way:
  - ~~**8-draw-a** The wall under the pad~~ (shipped; story in `docs/plan-shipped.md`
    §8-draw-a; check `npm run drawwall`, and `-- --app` on the Mac). Found along the way:
    - **8-draw-a-1** (S) The picture is the canvas after the output pass, so a wall
      corner-pinned or masked in Output shows warped on the pad, while a touch is mapped
      through the camera only. With Output's corners at their defaults (most rooms) the
      two agree. *Measure:* `drawwall --app` with corners moved.
    - **8-draw-a-2** (S) Every remote gets the pictures once one asks: the relay keeps no
      state, so a tablet left on Controls as the Gig remote is sent 100–400 kB/s it does
      not paint. A relay that routes `picture` only to sockets that sent `pad-picture`
      in the last 3 s would stop that. *Measure:* bytes to a Controls remote.
    - **8-draw-a-3** (S) OSC's `/blow`, `/drop`, `/press` still take the plate's point,
      not the wall's, so a TouchOSC pad has the old pad's fault (only its middle lands
      under the finger). A `/wall/...` form, or a flag argument, as the remote's `wall`.
  - **8-draw-b** (S) The phone's Draw has no bottle, Spin or Tilt (the design's four
    tools only); they are in Controls. A bottle tile on the phone, or a long press on
    Drop for the bottle list, would put soap on the plate from Draw.
  - **8-draw-c** (S) Blackout's hold-to-snap. The display has one blackout, a toggle
    that fades over 1.1 s, so Draw's hold is a fade both ways. A snap needs a
    `blackout-snap` action the display honours at once (protocol, App, MIDI).
  - **8-draw-d** (S) The wall's real shape: the frame now takes the laptop's picture's
    shape (8-draw-a), so a 4:3 wall is a 4:3 frame; before the first picture, and with
    an older laptop, it is still 16:9. A dome is another frame. And the design's dashed "+" (an image as dye) has no message yet.
- ~~**8b** A true Preview: with a wall up, the desk builds on a copy the wall does not
  see until Send to wall~~ (shipped; story in `docs/plan-shipped.md` §8; check
  `npm run draftwall`). Found along the way:
  - **8b-1** (S) The copy and the wall draw from the same dice. The plate's random
    streams (`DICE` in LiquidVisualizer, `lib/rng.ts`) are module constants, so the
    copy's pours take draws the wall's would have, and laying a look on the copy re-keys
    the wall's streams. The wall stays random, but not the run it would have been: a
    render or a reproduced report must not be made with Preview's copy up. Per-engine
    streams would fix it (`DICE` into the component, `doseLiquid` handed its stream).
  - **8b-2** (S) The drift waits for Send to wall. The drift (`lib/drift.ts`) wanders
    the desk's settings, which in Preview are the copy's, so the wall's look stands
    still under the music until it is sent. The music's own overrides and the room
    still move it. The drift could wander the wall's look as well.
  - **8b-3** (S) The copy's plate when the wall closes mid-Preview. The desk carries
    on, on the wall's engine, from the copy's look by its id (`adoptPreset`): the
    copy's poured plate goes with it, and dyes changed on the copy and not saved fall
    back to the look's own.
  - **8b-4** (S) What else in Preview goes to the copy. The phone's Play sliders, a
    MIDI fader, and a Go, Back or Next look from the remote or a MIDI pad write the
    desk's settings, so in Preview they move the copy, not the wall (the keyboard's Go
    is held in Preview). A back-plate look (Send back, 16a) goes to the copy, and Live
    puts the wall's back back. Right for a hand at the desk, perhaps not for a phone at
    the wall: a remote's Go could go to the wall, or be held as the keyboard's is. The
    film and the mark are the room's and go to the wall (the mark to the copy too); a
    film is not seen in the copy.
  - **8b-5** (S) The projector window's pixels. `draftwall --frames` (Mac) shows the
    window is painted from the wall's canvas and never the copy's, and which settings
    each engine was handed; a picture of the window against a look changed in Preview
    would be the last word (`docs/judging.md` §49 for the owner's eye meanwhile).
  - ~~**8b-6** `draftwall`'s fade line read one moment, 0.4 s after Send~~ (fixed
    2026-10-11: it watches the whole fade; story in `docs/plan-shipped.md`, 8b).
- ~~**8c** Knobs turn round their ring as well as up and down; a double-click goes back to
  the look's own value (a double tap on Play's sliders)~~ (shipped; story in
  `docs/plan-shipped.md` §8; checks `npm run desk`, `npm run layout`, `npm run phone`).
- ~~**8d** A control's kind from the controller's profile: the APC40's, the Launch Control
  XL's and the nanoKONTROL2's knobs draw as knobs~~ (shipped; check `npm run desk`).
- ~~**8e** Load-in's Wall panel: the test pattern and Identify, and Output's Gain and Gamma
  as knobs~~ (shipped; checks `npm run wallpattern`, `npm run map`, `npm run layout`).
  - **8e-1** (S) The wall test from the phone. The remote has no Load-in at all (no
    corner pin, no masks), so the test pattern and Identify are on the laptop only. A
    `wall-test` action in the remote protocol (App, MIDI too) would let someone at the
    wall walk the corners with the pattern up. After 8-draw-a lands, which is in
    `RemoteControl.tsx` now.
  - **8e-2** (S) The design's Load-in plate bar reads "Live | Test pattern" with
    Identify beside it. Today the bar is the same in every layout (`npm run panel`, "the
    same actions on both"), so the switch is in the Wall panel, which Load-in opens by
    default. Moving it to the bar means deciding with the owner whether the bar may
    differ by layout.
- ~~**8f** A QR code on the Phone · iPad panel, drawn without a library~~ (shipped; checks
  `npm run qr`, `npm run layout`).
  - ~~**8f-1** The code whenever nothing is linked, and Link another while phones are~~ (shipped; check `npm run phonelink`).
- ~~**8g** A panel in a window of its own, for a laptop and a monitor at a gig~~ (shipped;
  check `npm run layout`).
  - **8g-1** (S) The keys in a panel's window. ⌘1–3, ⌘P, Tab and the show's keys (Go,
    Blackout, R) are listened for on the desk's window, so with the focus in a panel's
    own window they do nothing. Forwarding them (or listening on both) wants a look at
    which keys a panel's text fields must keep. Esc too: the Mixer sheet in a panel's
    window closes on Esc pressed on the laptop, not in its own window.
  - **8g-2** (S) A panel's window after a reload. A browser will not open a window
    without a click, so a reload brings every panel back to the desk; a "Reopen the
    windows" button in the header after a reload would put them back in one click.
  - **8g-3** (S) A panel out in its window whose place goes. A layout switched to one
    without the panel, or the panel's guard closing it after an error, leaves it in its
    window with no away card, and Bring it back then puts it nowhere: it should dock it
    in the deck. And the desk itself going (the laptop's window narrowed under 1024, a
    phone-sized window) still closes every panel window; the clean screen does not.
- ~~**8h** The header at 1024: its dots fold into one Status button when they do not
  fit~~ (shipped; check `npm run layout`).
  - **8h-1** (S) Folded, the Status button's one dot is green while anything is
    connected, so a wall that drops while the sound is up still reads green until the
    button is opened. A dot per input inside the button (no words) costs about 40 px,
    which 1024 has (73 px spare folded); the owner's call on a laptop.

- ~~**8i** Fewer panels, each one usable at any window size: Sound Mappings folded into
  Sound and Heat Slide into Fluid Physics (no panel holds one or two knobs), Fade and Go
  in 68px with Back and Freeze left to their keys, and every panel's body scrolls and
  reflows~~ (shipped; story in `docs/plan-shipped.md` §8; checks `npm run desklayout`
  and `npm run layout`'s "every control in every panel can be reached").
  - **8i-1** (S) A panel floated or popped out narrower than 312px. The reach check
    floats every panel at the size a panel floats at; a hand can drag one down to
    220px, where the Mixer's and the patch bay's rows have not been measured. Either a
    minimum width per panel (`deckWidth`) or rows that wrap below it.
  - **8i-2** (S) Three knobs is the floor now (`npm run desklayout`): Kaleidoscope,
    Master and Manual Interaction sit on it. Kaleidoscope was split out of Show on
    purpose (`settingsMap.ts`); the other two are the owner's call if three still reads
    as too thin on a deck.

- ~~**8j** What a knob is called, and what it does~~ (the owner, 2026-10-22: the names
  on the deck's knobs were cut to the knob's width, and a drag swapped the name for the
  value under a chip laid over the row above, so a hand could not tell which knob it
  had). A hover or focus card with the whole name, one plain line on what it does and
  the live value, drawn into the body so no panel clips it and never over the knob; it
  stays up through a drag, and the knob keeps its own name while it is turned. One line
  for each of the 205 controls in `src/lib/controlHelp.ts` (`npm run panel` fails on a
  pinnable control without one). On the phone there is no hover: the name is the button,
  dotted underlined, and a tap or a hold opens the same card (`TouchSlider`, the touch
  `Slider`, a knob's label on a coarse pointer). Checks: `npm run panel`, `npm run
  layout` (hover, drag, release), `npm run phone` (the tap). Not changed: what any
  control does.
  - **8j-1** (S) The remote page (`RemoteControl.tsx`) has its own sliders and no card;
    its names are whole, but the line would help there too.
  - ~~**8j-2** Cards that stuck and stacked~~ (the owner, 2026-10-24: Macro Zoom's card
    stayed up under Evolve Speed's). **Shipped.** A knob whose mouse-up never reached the
    page thought a hand was still on it: Chromium then sends no pointerup, only a
    lostpointercapture on the next buttonless move, which the knob did not hear. The
    drag now ends on a lost capture, a release or cancel anywhere in the window, a move
    with no button down, or the window losing focus; and one card is up at a time,
    whatever asked for it. Checks: `npm run layout` (two knobs with swallowed releases;
    a focused card replaced by a hovered one), `npm run phone` (a tap on another name
    swaps the card). Which gesture on the owner's Mac swallowed the release is not known.
  - ~~**8j-3** Hover cards wait much longer~~ (the owner, 2026-10-27: "tool tips on
    hover over are getting annoying"). **Shipped.** One constant, `TIP_DELAY_MS` (1.5 s,
    `src/lib/tipDelay.ts`), was 380 ms for the knob and fader cards, and the browser's own
    `title=` tips (about 240 of them, near a second, not slowable) came up on top. Both
    now wait the one number, counted afresh on every control with no grace between
    neighbours: `src/lib/titleTips.ts` lifts a `title` off the element under a mouse or
    pen, draws its words on a card after the wait and puts it back when the hand goes,
    presses, types or scrolls (also in a panel's own window). The phone is unchanged: a
    touch never starts the wait and the name tap still opens its card at once. Checks:
    `npm run layout` (a knob's card and a `title=` are each absent at 60% of the wait and
    up after it; the title is back and the card gone after), `npm run phone`.
    Not changed: the remote page and the cast page, which do not install it.

*Proposed 2026-09-28:* **pictures, not swatches, in the cue list.** In the dark a look is
picked by its name and one colour swatch (`lookSwatch`, `PhoneStage.tsx`, and the desk's
pick lists). `gallery.yml` already photographs every preset; ship those photographs as
thumbnails, and have Save Look keep a still of the plate in the preset file, sent to a
receiver once rather than in every cast state (the lesson of S0's logo, in
`docs/stability-plan.md`). The phone's Looks sheet, where rows are smallest, gains most.
*Measure:* `npm run desk` and `npm run phone` find a picture on every built-in look's
row; the cast state's size is unchanged.

### 9. Ferrofluid after the references

**Partly shipped**: the edge and the two looks, the dye riding the ferrofluid, the magnet standing the pool up, fingers past the spikes, Blow and Finger on the ferrofluid, and the Magnet moving only the ferrofluid that is there. What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

`src/gpu/wgsl/plate.ts`, `src/presets.ts`, `src/presetPlate.ts`, `scripts/ferrolook.mjs`

The reference is Chemical Bouillon's ferrofluid films (frames in
`/mnt/project-files/ferrofluid-look/references/`): razor-sharp edges at any zoom, a fine
scale (fingers or cells about 1/60 of the frame, hundreds of them), thin black walls of
ferrofluid between packed cells of coloured dye, and wet gloss. Ferrofluid is the one
liquid here that *should* shine: a projected look has no speculars, because the light
comes through the liquid, but these films are lit from the front.

What watching the lab clips of Ferro Maze, Ferro Paint and Magnet Garden found
(`/mnt/project-files/ferrofluid-look/watch/`), in the order to fix them:

- **9b. Maze detail**, shipped in #167. The maze's finger width is fixed by `MAZE_PERIOD` (0.045 of the
  plate) and comes out two to three times wider than the reference, and it coarsens
  over time. Maze Detail (0 to 1) divides the period by up to three; 0 is the maze as it
  was, bit for bit, and Ferro Maze uses 0.5. `npm run maze`: finger width 0.0296 at 0.5
  against 0.0431 at 0 (ratio 0.69). Whether it now matches the reference is for the
  Mac.
- **9d. Smaller faults.** A sub-half phase shows as brown ghost smears; Ferro Maze's
  white table clips (32 % of the frame blown); no visible pulse on the kick.

Open, from building 9e (in the order to do them):
- **9g. Domes at the lab's grid.** On 256² a spike's pitch is ten cells and a dome is
  four or five across, so much of each is edge and grey. The app runs 384² and up
  where they are sharper; the Mac should judge whether 256 (the software rung and
  some phones) needs a coarser pitch.
- **9h. Thick walls in Ferro Paint and the maze.** The references' ferrofluid walls
  between dye cells are thin and even; ours still thicken where the maze coarsens.

- **9ab. Fingers thinner than the grid are drawn** (**shipped**). The plate drew the
  ferrofluid only past its half-full line, so a finger pulled out narrower than the
  solver's interface was not drawn at all. `npm run fingers` then passed or failed on the
  dye's shade under it, and went red on the deploy after #267 (4 at 0.12 against 7). With
  no line within four cells up the slope, the strand is now drawn by Beer–Lambert through
  the thickness its phase gives. Lab: 13/16/13/8 drawn against the field's 15/19/13/8
  (2 at 0.12 by the line before). Judging §41. Open: the maze's haze (9aa) is under half
  full too and is drawn by the same rule, so it reads browner until 9aa takes the leak out.
- **9aa. The maze is two to three times coarser than its period, and leaves a haze**
  (measured 2026-10-04, building 4a-clock). Ferro Maze, Ferro Paint and Magnet Garden
  in the Mac gallery are fat black blobs with a brown haze round them, where the
  references are dense thin stripes on clean white. The lab reproduces it (256², Ferro
  Maze's settings and pour, Thin Gap on; with it off the same): after 900 steps the
  domains are about 30 cells wide where the period asked is 12, and the black (cells
  past half full) falls from 21% to 15% of the plate as ferrofluid leaks into a film
  under half full, the haze (9d's "ghost smears"). Tried, each 600 steps, none of them
  a fix on its own:
  - the field coil at full strength under the whole plate (MAZE_UNIFORM 0.45 → 1):
    the same blobs, and the leak faster (black 21% → 11.5%);
  - the double well steepened everywhere, not only under the hand (phaseMu's
    `wellNeed`): the leak slowed (black 17.7% kept, against 15.4%), the blobs stayed;
  - MAZE_GAIN ×4 (the maze's Darcy flow): droplets, and the leak faster (12.5%);
  - the dipoles' repulsion nearly unscreened (m² from 0.16 k*² to 0.005 k*²), which is
    the real physics: parallel dipoles in a thin layer repel at long range, and a
    screening shorter than a pool lets a pool sit as a pool. **The haze went entirely
    and the black stayed at 17.8%**, but at that fill the domains became separate dots
    (with the repulsion ×4 and ×16, smaller dots). Ohta–Kawasaki's dots are right for
    a fifth of the plate: a labyrinth needs about half (Magnetic Pattern I's disc is
    half black).
  So the next step is both: the long-range repulsion, and a pour that fills the
  maze's region to about half (a disc for Ferro Maze, as the reference), with the
  period then set by the sharp-interface balance and not the linear one (the dots
  came out about twice the asked period). Every ferrofluid check moves with it
  (`maze`, `fingers`, `domes`, `spikes`, `ferrodye`, `ferropour`), so it is its own PR
  in lane C after 9t. Probes in `/mnt/project-files/clock-ferro-looks/`.
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

- **9t. The ferrofluid stands up as a layer that keeps its volume** (**shipped**).
  The plate kept the ferrofluid as one number a cell, held at or under full: a plan
  view that keeps the liquid's area, so a pool under the Magnet could only be packed
  into domes (spikes.ts's lattice, wells in the separation, a pull eased to half) and
  84% of the plate within 0.08 of the magnet stayed black, where every reference has
  black domes with the colour between them. A real layer keeps its volume: a dome
  standing up takes its height out of the layer round it, and the gaps open by
  themselves. Now, round each magnet past the onset (the hand's, and the phone's other
  fingers), a patch of the plate's cells is stepped as a thin film of the Rosensweig
  instability (`src/gpu/standing.ts`, `wgsl/standing.ts`): tension, gravity, the
  field's lift as a half-Laplacian through an FFT, the glass's wetting, a cell past
  full a dome that much taller. The plate's own passes step aside under it (the
  separation, Cahn–Hilliard, the maze's flow and the magnet's pull), and the
  water's flow carries only the layer's mean there, the film its shape; its cap at
  full is raised to the top glass there. The plate draws each dome from
  the layer's own slope, the white point on the top of each. In the lab on 384², a
  pool 0.12 in radius under the hand's Magnet: from 84% black to 47% within 0.08 of it, 13
  domes a median 0.032 apart (2π l_c is 0.04), none made or lost; flat under
  the onset; back to a pool when the field is turned down (`npm run standing`).
  `npm run spikes` moved to 384² and reads the domes the layer makes (28 within 0.12 of the hand, 16 with a white point on
  the top against 1.8 half a pitch off, 6/6). The
  plate's film beyond a domain's line reads the least of four points on the way out, not
  one four and a half cells off, which had landed in the next dome and drawn dark dashes
  on every dome's side facing it.
  Shortcuts, each still to replace:
  - **9t-1. The lift held near the onset.** G under the hand is 2.8 (a real layer's is
    hundreds), so the domes grow at a scale the grid draws; at the lab's G 4.3 they set
    as bars along the grid. A finer film grid under the magnet (the patch at twice the
    plate's cells) would let it rise.
  - **9t-2. No pull under the film.** The magnet's Kelvin pull is in the film's
    pressure, worked out from the liquid's susceptibility (EFH1, χ0 2.6), and scaled to
    nothing: at the whole of it the pool gathered into one heap with no domes on it (the
    lift being held low, 9t-1), and at a tenth or a quarter its gathering front set the
    domes along the grid. With 9t-1's finer grid it can come back.
  - **9t-3. No hysteresis.** Real domes stay a few per cent under the field that raised
    them; turned to 0.95 of the onset on the axis, these were all gone two seconds on.
  - **9t-4. Slower than a real layer.** Domes start a second and a half after the Magnet
    arrives and stand by four; a real layer takes a fraction of a second (9t-1 again).
  - **9t-5. The model's own simplifications:** the lift saturating with the layer's
    height (S(h)), small slopes, a flat water top, no finite-depth correction to the
    lift, a (9, 3) wetting law at a 10° angle, the mobility capped at full, a noise of
    a hundredth of the pressure scale to seed it, the window (full to half the
    patch's half-width, none past three quarters, and no further than 0.083 and 0.125
    of the plate on any grid: at 0.65 and 0.9 the fingers at a pool's rim fell to
    7/5/5/4, against 11/10/9/5 with the film off, 9t-8), and each patch stepping its own magnet in turn
    where two fingers' overlap.
  - **9t-6. The film's cost**, up to four patches of 128² on 384², eight substeps each,
    13 dispatches a substep (eight FFT passes, then pressure, flux, apply, sum and
    take), is not yet measured on a Mac or a phone.
  - **9t-7. 256².** A capillary length is 1.6 cells there, and the domes are coarse
    (9g).
  - **9t-8. Fewer fingers past a pool's rim: fixed in #247.** With the film's window
    stepping the water's flow aside, nothing carried the layer out of it: the window
    kept 7212 of the pool's 13029 where the plate alone kept 5429, the rim had less to
    finger with, and `npm run fingers` counted 6/4/5/2 on the Mac against main's
    12/9/9/3. The flow now carries the layer's mean under the window (wgsl/fluid.ts,
    carried): 9/12/9/5 in 7 sectors, the domes standing (the flow carrying each cell
    as outside instead poured the domes into slabs). Left: the last dome on the
    magnet's axis lies down more slowly when the field is turned down (1.12 at the
    end of `npm run standing`'s leg, 1.06 after 960 steps more; that check now asks under 1.2
    and at most 30 cells past 1.05, where it asked under 1.1), and the window still
    stands in for the film fingering at its own edge, which a real layer does by the
    same repulsion that raises its domes (9t-1).
  - **9t-9. The magnets still reach the plate's uniforms unread.** The plate drew its
    spikes from them; the domes come from the layer now, and the app still computes and
    uploads them every frame (plateUniforms.ts, magnetsOnPlate). Take them out, with the
    harnesses that tell the plate of them.
  - **9t-10. The first Magnet of a session waits for the film's build.** Its nine kernels
    are built behind the show the first time a magnet passes the onset (a moment or two
    on a cold cache), and until then the pool only gathers. Starting the build at half
    the onset would build it on every Magnet Garden show, whose own magnet is there;
    starting it when the Magnet tool is picked would not.
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
  than a scaled magnet's at a big Size; since 9v a magnet k times as wide at the same gap), so the spikes' patch and
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
- **9v. The magnet as a real magnet, not a deepened dipole (shipped).** The
  solver's magnet was a point dipole, and Magnet Size (9x) sank it k times deeper
  with k³ the strength: a magnet scaled gap and all, its axis field the same at
  every Size, and with the liquid's saturation (`MAGNET_BSAT`) a number in the
  dipole's own units, a big one pulled less at the edge of its reach than the
  magnet it stood for. Now the magnet is a uniformly magnetised cylinder
  (`src/gpu/wgsl/magnetDisc.ts`): its field is Derby and Olbert's closed form in
  Bulirsch's elliptic integral, four rounds of an AGM, handed to a dipole of its
  volume past six to eight half-sizes. At the tool's own size it is a rod 0.05 of
  the plate in radius and twice as long (20 mm by 40 mm on the 20 cm dish), its
  face 0.06 above where the dipole stood (13.5 mm under the liquid held to the
  glass), so at the default its spikes reach where they did (0.157 of the plate
  out against 0.156, on its axis 0.952 of the hand's field against 0.954).
  Flatter shapes were tried first (a 32 by 16 mm disc, 24 by 24, a 20 by 30 mm
  rod): matched at the spikes' patch, their fields fell away faster past it,
  and `npm run fingers` lost its reach (the discs 8 to 5 on the 0.12 circle, the
  short rod 7 to 6 on the 0.09, under the check's 7; on Metal too). This rod's
  fingers are 10/8/9/5 on the four circles in 7 sectors, main's 12/7/8/3 in 6. Magnet Size sets the radius, k = 0.5 to 2 times it, the gap and
  strength untouched: a bigger magnet is stronger at the glass (on its axis 0.26,
  0.95, 2.22 at k 0.5, 1, 2, where the deepened dipole stayed at 0.95) and reaches
  further (spikes out to 0.050, 0.157, 0.339; the dipole's 0.078, 0.156, 0.312).
  The saturation is a field on the same scale (`MAGNET_BS`, spikes.ts):
  ψ = B²/(1 + B/Bs) with B the strength times the magnet's field, so a weaker
  magnet pulls the far liquid as its square; Ferro Maze's own magnet went 0.3 →
  0.45 and Ferro Paint's 0.5 → 0.6 to gather as they did. Both constants carry
  the old ones over at the hand's magnet, so `MAGNET_GAIN` and phaseMu's χ keep
  their tuning. The radius rides `GpuStepParams.magnetRadius` (`Sim.magRadius`,
  and the standing layer's `Film.size`); every shader including `SPIKES_WGSL` defines
  `magnetRadius()`. `npm run disc` (lab, Mac plate shard) runs the shader's own
  text against a Biot–Savart sum over the side current: within 0.0073% on and
  off the face and at the rim, 1.24% where it hands over to the dipole (the point
  dipole there 2.5%), 1.2% past it; at Size 0.9 the pull at the edge of its
  spikes is the real magnet's (1.000), where main's deepened dipole pulled 0.31
  of it; the plate's far shortcut (spikeAmp answers far points without the
  integrals) never drops a spike; every look's own magnet stays under the onset
  (Magnet Garden 0.148, Ferro Paint 0.099, Ferro Maze 0.023 against 0.18). In the
  lab on the rod: `spikes` 6/6 (outline 2.83, main 2.85), `fingers` 4/4. `npm run magnet` (Mac)
  now asks that Size makes the held and the set-down magnet k times as wide with
  its height and strength as they were. On the phone, Size is the same setting on
  the Magnet panel and the other fingers' magnets are the same magnet. A saved
  look with its own magnet at a low Strength pulls as its square now (0.3 pulls
  about a third as hard as it did). Judging §37.
  Open, found here:
  - **9v-cost.** The field is elliptic integrals wherever the magnet reaches (in
    the solver five evaluations a cell a magnet, and per pixel on the plate inside
    twice the rim and gap). Measure it with `npm run stages` on the Mac with the
    Magnet held; if it shows, tabulate the magnet's field once per radius and gap
    (it is a function of ρ/a and z/a only) and sample it.
  - **9v-tilt.** The magnet is held upright under the glass here. A hand tilts
    it, and a tilted magnet's field leans: its spikes lean and its pool slides toward the
    lower rim. Needs the magnet's direction in the step.
  - **9v-grade.** Every magnet is one grade, its strength a share of the hand's.
    A real set (ceramic against neodymium) differs in remanence by about three
    times; a Grade choice beside Size would be that, MIDI-learnable.
  - **9v-height.** Magnet Height is still where the old dipole stood, and the
    face is a fixed 0.06 above it (`MAGNET_FACE`), clamped 0.01 under the liquid.
    Saying the setting as the gap itself would be plainer, but changes every
    saved look's magnet; worth doing with a look version bump.
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
  the rest gap), the particles (H1, which re-seed from the dye), and the clear
  film of 20b (#259, which landed while this was in review: its field is
  dropped at a move as the ferrofluid was, to be carried the same way). Not checked
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

**Partly shipped**: the song's shape heard live and followed by a paced scene, and the first accent (Accent the One). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

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
| Hues in a frame | 2–3, one family leading, the family changing by scene (the owner, 2026-10-04, wants more: five dyes of a family on the plate, 18l) |
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
   Found on the way:
   - A drop in a scene's dark ending is let go (12 of Light Show Night's 60 in the
     check, one in five): the light is going down and the next scene comes up with its own move.
     A show following a song might rather cut the dark short on a drop and come up
     with it; worth judging on the Mac with a real track.
   - Over 1 s windows the proxy's motion-against-loudness reads 0.26 to 0.29, the top
     of the footage's range at the beat, because the proxy has no beat-level motion of
     its own and a second's mean is mostly the section. The plate's own motion adds
     that noise; `film.yml` with a song playing is what measures it.
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
   having a strength. The analog operators' accounts say to unblock it as a
   performer's control (§36e).
7. **Layers at their own speeds** (roadmap Stage 4, the rig). A slow wash, a drop field
   and a streak layer, each at its own speed, added as light. Moved up by §36h.
8. ~~**Evolve changes slowly with the song.**~~ Shipped: one move at a time (a few
   related dials, 30–90 s glides, about one a minute), steered by the song's sections
   and its level over half a minute, the palette turning at drops and breakdowns, the
   same on a slow clock with no music; nothing that moves the frame. `npm run
   slowevolve`. Story in `docs/plan-shipped.md` §10 step 8.
   - **8a** (open, the owner's eye): judge it on the Mac, with a song and without
     (`docs/judging.md` §51). If a minute's glide reads as nothing happening, the
     reach (`moveTargets`' share of each dial's window) is the dial to turn, not the
     glide's length.
   - **8b** (open): `npm run evolving`, the browser check that Evolve works in the
     running app, is not in CI. Run in a cloud session on SwiftShader, its dial lines
     pass (4 of 81 dials moved in 70 s at full speed, all inside their windows; on main,
     14 of 99, one of them Lamp Motion, which moves the whole picture), but its two hand
     lines fail the same way on main and here: the app draws no frames there, so the
     hands never run. Put it on a Mac shard, or split the dial lines into Measure.
   - **8c** (open): the palette change only colours dye still to come, which is the
     real thing (a pour does not recolour the dish). With Evolve's hands at a drop
     every seven seconds that turns the plate over in a minute or two; on a look with
     few drops it may read as no change at all. Measure how long the plate takes to
     carry half the new palette on the film table, per look.
   - ~~**8d** the Evolve Speed dial sets the pace~~ Shipped: low creeps, high moves
     quickly (the owner, 2026-10-11), measured from each look's own Evolve Speed, where
     it plays as it did. Moves a minute from the bottom of the dial to the top 0.63 →
     1.10 before, 0.20 → 4.87 now. Story in `docs/plan-shipped.md` §10 step 8d.
     - **8d-1** (open): the looks set Evolve Speed from 0.02 to 0.3, and it is also the
       hands' pour rate, so the same dial position is a different pace on each look. If
       the owner would rather the number meant one pace everywhere, retune the looks'
       own values first (14 of 41 would slow by 1.5 to 3.5 times).
     - **8d-2** (open): App glides in half-second steps, so a full-speed glide of 5 to
       11 s is 10 to 22 steps. Judge on the Mac whether a fast colour move looks stepped;
       if so, step short glides faster (not the whole interval: `npm run renders`
       counts App's renders).

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

**Partly shipped**: the mixer is built and live (the stack, the lumia and gel rows, a blend per row, crossfades, the narrow desk, the Back that fully goes back, the remote's own check), and several Mac checks that went red are fixed. What is open is below: the Mac looks still owed, the row per projector, and the faults found along the way. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

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
6. **A row per projector** (rig-plan R1). Once a rig has more than one live plate,
   each projector's plate is a row, with its own grade at the projector's scope (R2).
   This is the large one; it waits on R1, and is §16e.

Found while shipping step 2, not yet done: #189's deploy (main 41ad65e) went red on
the Mac show shard's `qa` at two checks that passed on the same tree in the PR's run an
hour before: "the plate, not the hole, takes the pointer" (the cursor over a DIV at the
desk's preview) and "the run completed" (`__cgFrame` returned null in the look-fade
colour section), with "requestAdapter did not answer in 10s" in the console. Neither
touches the Mixer; the second looks like the adapter going away under the run.
**Fixed (this PR):** `apart`, `luma`, `jumps`, `colour` and `throughTheHole` in `qa.mjs`
guard against `null` frames and missing adapter without throwing, reporting `no frame`
rather than aborting the suite with `the run completed`. And #193's first show shard died before any test ran: the runner could not
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
  prints what 4b made of each page's wait so the next runs say why. *Answered by 14v-5 (2026-10-10): the intro turning while the GPU started; it now starts still.* Seen on #299 and #301, 2026-10-05: a third kind, frames stopped with the page's timer still running, inside the device request: #301's run 37355609842 stopped 2.07 s from 2.57 s, the device asked at 2.39 s and given at 4.71 s, a long animation frame from 2.58 s whose rendering began at 4.65 s with no script in it, and #299's earlier head 2.20 s the same way. Again on #330's run 38028974928 (2026-10-10): 2.17 s from 2.76 s, the device asked at 2.40 s and given at 5.03 s, no long task, nothing made or written in the gap; #330 changes nothing before the device either. Not held (the timer ran) and not the page's own (nothing of its ran); check 4 counts it. Neither PR runs anything before the device is given. Whether 4b should own a frame stop that lies wholly inside a pending requestDevice with no page script in its long animation frame is the question. The old "within 0.25 s of the control's stop" and "control plus a second" are
  gone. Read against the 53 logs: #204's red and 36339282520's split stop (1.28 s
  then 1.68 s) now count as one held stretch each, 2.57 s and about 3 s; 2 of the 53
  (4.05 s on 36294600123, 3.75 s on 36338802046, each wholly inside a four-second
  device request) went over the old 3.5 s cap, as did #194's 3.52 s; the owner chose
  to raise it to 4.5 s, above every opening read (the controls' longest 4.18 s).
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
- `phone.mjs`, "portrait: set to one bar in the drawer, the same take lands in about
  half the time": on #210 (the Press; no mixer or phone code) it landed where it
  should (0 at 1944 ms against two bars' 3849 ms; #201's run 1936 against 3838) and
  went red on "with a jump", whose size the line did not print (it does now). The fade is stepped by
  a 16 ms show interval against the show clock and the slider shows React's state,
  so a main thread that stalls on a busy Mac runner moves the level a stall's worth
  at once, and at one bar the allowance per 80 ms sample (0.106) is half two bars'.
  Worth printing the largest step and its gap first, then asking whether the walk
  should stamp the level with the show's time rather than the harness's.

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
is built (#207); steps 2 to 8 are not.

**What integration means here.** A VJ app (Resolume Arena and Avenue, VDMX,
TouchDesigner, MadMapper, Millumin, OBS) meets ChromaGlass in four ways, and each one
takes a different route:

| | What it is | Route | Needs |
|---|---|---|---|
| **Video out** | The plate as a live layer in the VJ app | Syphon on macOS (Resolume, VDMX, MadMapper, Millumin, TouchDesigner, OBS), Spout on Windows (Resolume, TouchDesigner, OBS), NDI across a network (all of them) | A page cannot publish a GPU texture. **Today:** OBS captures the projector window and sends it out through its Syphon or NDI plugin. **Properly:** the wrapper (steps 1–3) |
| **Control in** | The VJ app or its controller plays ChromaGlass | OSC, which the show server already hears on UDP 9000 (`server/remote-server.js`, `oscToMessage`: `/chromaglass/setting/<key>`, `/action/<name>`, `/preset/<id>`, `/blow`, `/drop`, `/press`, `/tilt`, `/dye`) | The web app plus `npm run show`. Written up and templated, not built again |
| **Tempo** | One beat shared by everything | Ableton Link, which Resolume, VDMX and TouchDesigner all speak. MIDI clock already comes in (`src/lib/midi.ts`) | A page cannot join Link. The show server can |
| **Video in** | A VJ app's output as a ChromaGlass source | Syphon, Spout or NDI, arriving as a camera | **Today:** any virtual camera (OBS Virtual Camera, NDI Webcam Input), picked like a camera. **Properly:** the wrapper (step 6) |
| **A DAW** | Logic or Ableton playing ChromaGlass from the song: its audio, its tempo and transport, and automation lanes moving settings | MIDI from the DAW: clock, Start, Stop and Continue, and MIDI timecode's quarter frames are already read (`src/lib/midi.ts`), and CC from an automation lane reaches any setting through MIDI learn | **Today:** the DAW's output into a loopback device (BlackHole, Loopback) picked as the input, and its MIDI out through the Mac's IAC bus (not written up, never tried end to end; 14s's input picker bug bites here). **Properly:** a bridge plugin (step 7) |

**Not doing: a plugin inside the VJ app.** FFGL (Resolume) and ISF (VDMX, MadMapper)
run OpenGL fragment shaders inside the host. The plate is dozens of WebGPU compute
passes a frame, with a pressure solve, which means porting the solver back to GLSL.
That is the native rewrite `beyond-web.md` argues against (kept for later as step 8).
Streaming the plate into the host gives the VJ the same layer without it.
The same holds for drawing the plate inside a DAW plugin's window (asked 2026-10-04,
about an ad for a visualiser sold as an AU/VST plugin plus a standalone app): a
plugin's window is a native view, and the plate needs Chromium's WebGPU and Web MIDI.
Step 7 is the part of that idea that fits: a plugin that draws nothing.

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
   - **13.4-ipad** (from §30): the same write-up for playing the show from an iPad in
     AUM, with no new code. The iPad joins a network MIDI session, which a Mac shows to
     Chrome as a Web MIDI port; AUM's MIDI matrix then sends clock, notes, CC and Program
     Change (14t-pc) to the show; the audio arrives on the interface's line in; Link
     joins once 13.5-link ships. The network MIDI path is inferred, not tested: then
     *(owner)* tried once on the Mac with an iPad, a `docs/judging.md` entry (next free
     number at merge).
5. **ChromaGlass talks back and keeps time**, now two PRs in the show server, Link
   first (§30, 2026-10-11: Link is the shared clock of the iPad's music apps, AUM, Loopy
   Pro, Drambo, Koala, as well as of Resolume, VDMX and TouchDesigner, and VS offers it
   as a clock source):
   - **13.5-link**: Ableton Link in, feeding the beat clock the way MIDI clock does
     (`beatClock.setExternal`), with tempo and phase; "Link" as a tempo source in the
     Sound sheet. A page cannot join Link, so it is the Mac app's and the show server's,
     which fits §23's rule that paid is what a page cannot do. On the phone, Link's
     switch, its peers and its tempo in the More sheet. *Measure:* a node Link peer at
     a tempo and a phase the clock reaches within a beat, and follows when it changes.
   - **13.5-osc**: OSC *out* for the plate's colour, the sound bands and the beat, the
     way Art-Net out already sends the colour to the lighting (`server/artnet.js`), so
     a VJ app's effects can follow the plate.
   *Not started.*
6. **Video in from a VJ app** (one PR): Syphon and NDI arrive as a Mixer source
   (§11), not through a virtual camera. *Not started.* Beside the Mixer layer, the
   picture can also be poured into the liquid as dye that the flow then carries (the
   `pourVideo` path), the way the 1960s shows laid film loops and slides under the oil;
   VS 2 (§30, 2026-10-24) takes a camera, Syphon or Spout feed as a source, and this
   is ours. The phone gets the source picker.

7. **A DAW bridge plugin** (asked 2026-10-04; two or three PRs, after step 2): an
   AU and VST3 plugin for Logic and Ableton that draws nothing and plays the running
   app (the Mac app of step 1, which is the "standalone" half) over the show server
   on localhost. It carries three things MIDI from a DAW carries badly or not at all:
   - *Automation.* A fixed bank of automatable parameters (say 32 slots, so the DAW
     sees a stable list), each bound to a setting, a preset or an action by the same
     learn flow and binding map as MIDI learn (§5), at full resolution rather than
     CC's 128 steps, named in the DAW's lane by what they are bound to.
   - *Transport.* The host's tempo, play state and bar position every block, into the
     beat clock the way MIDI clock goes in (`beatClock.setExternal`), with the bar's
     phase exact rather than counted from 24 pulses, and a locate that lands a set
     list's cue where the song is (what 14t's missing Song Position Pointer and full
     MTC frames are for over MIDI).
   - *Audio.* The track or sidechain the plugin sits on, as PCM to the app's one ear,
     so kicks, bands, Audio Impact and song shape read the DAW's own mix with no
     loopback device; and the host's latency report, so the ear can line the kick up
     with the picture (14e).
   Built in JUCE (C++), the AU validated with `auval` and both formats built on the
   macOS runner, signed and notarised with the same Developer ID secrets the Mac app
   waits on. The app side is a bridge link in the show server, which a node fake of
   the plugin can check with no DAW: slots move settings, transport moves the clock,
   PCM moves the bands. *Measure:* a settings move written in the fake arrives within
   one frame; a tempo change reaches `musicPace` within a beat; the fake's kick and
   the plate's kick within 14e's window. Then *(owner)*: Logic and Ableton on the
   owner's Mac, an automation lane playing a look change on the bar. The phone rule:
   the link's switch and its slot bindings are in the More sheet.
   Before any of it, the MIDI route in the table above, tried once in Logic and
   Ableton and written up with step 4. *Not started.*
   - **13.7-ipad** (later, from §30; after step 7 and §12's iPad app): the iPad sibling.
     An AUv3 that draws nothing, sits on an AUM (or Loopy Pro, Drambo) channel, and
     sends that channel's readings, its notes and the host's transport to the show over
     Wi-Fi, so each instrument has its own ear with no cables, as 24.1's patch inputs
     give a rack. The same bridge link in the show server as step 7, so the node fake
     checks both.

8. **Later: one renderer core, native as well as on the web** (asked 2026-10-04,
   the owner: "add it to the plan for later"). Not scheduled: it is what the plate
   drawing *inside* a host would need (a DAW plugin's window, a Resolume FFGL effect,
   a TouchDesigner operator), which steps 2 to 7 do without. Sized on main that day:
   the renderer is about 9.2k lines of WGSL (26 compute, 11 fragment and 8 vertex
   entry points) and 8.4k lines of TypeScript in `src/gpu/`; what decides each frame
   (settings, presets, sound, MIDI, the Mixer, the tools, much of it in
   `LiquidVisualizer.tsx`) is most of the other 62k lines; and 96 of the 135 scripts
   in `scripts/` drive a browser. The route that does not fork the show: `src/gpu/`
   ported to Rust on wgpu, whose WGSL is ours nearly as written, built to
   WebAssembly on WebGPU for the site and natively for a plugin, with the web app
   still the brain and handing the core a frame's settings and splats. One kernel
   group at a time, each held to the lab's numbers (`physics`, `derive`, `maze` and
   the rest) on both builds. What it would buy beyond hosts: shaders shipped
   compiled (most of the opening is compiling, 14v), the projector's frame timing,
   120 Hz and HDR (H4) in our hands, and CoreMIDI on the iPhone and iPad. Not frame
   speed: Chrome's WebGPU already runs on Metal (inferred, not measured). Start only
   when the owner wants the plate drawn inside a host. *Not started.*

**Windows** (asked 2026-10-04, the owner: "let's add windows plans"). Nothing here has
ever run on a Windows PC. Chrome and Edge on Windows have WebGPU (on Direct3D 12), Web
MIDI and the Window Management API, so the site should play as it does on a Mac, but
CI's GPU checks run only on the Mac runners (the free Windows runners have no GPU,
and no more runners are being added), so NVIDIA, AMD and Intel graphics, Direct3D's
shader compiler and Windows' audio inputs are all unmeasured. In this order:

- **13-win-smoke** *(owner or a tester, beside Wave 2)*: the site in Chrome on two
  PCs, one with NVIDIA graphics and one with Intel integrated graphics: the opening's
  time to the first step, frames a second on Classic and on the heaviest look, a
  projector on a second screen, a USB audio interface picked by the input picker, a
  MIDI controller learned, and a crash report sent from the corner dot. What it finds
  becomes items here. It gates the rest, and should come before any paid beta.
- **13-win-app** (one PR): the Mac app built for Windows too: a `win` target (NSIS
  installer, x64) in `desktop/electron-builder.config.cjs`, a Windows job in
  `desktop.yml` that packs it and runs `npm run desktop -- --packaged` (the lit-plate
  and hidden-window lines skip there as under xvfb, with no GPU), and `desktop/main.js`
  read for anything only a Mac does (the projector's fill, the show key's folder,
  the menu). Then *(owner or tester)*: the installed app on a PC with a projector.
- **13-win-sign** *(owner)*: a Windows code-signing certificate, as secrets the Windows
  job signs with. Unsigned, SmartScreen warns people off the installer, as macOS does
  for the unsigned Mac app (13.1-sign).
- **13.3**'s Spout out then lands on this build, and **13-update**'s updates serve both.
- Selling it (§23) needs nothing Windows-only: a licence key checked offline works
  the same in both apps.

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
- Shipped: Flexible Canvas Video Recording & Performance Separation (`src/hooks/useRecorder.ts`,
  `src/components/RecordPanel.tsx`, `src/components/desk/RecordControls.tsx`). Canvas-only video
  recording with optional audio inclusion toggle, quality presets (Master 30 Mbps, Standard 12 Mbps,
  Compact 5 Mbps), frame rate (60/30 fps), container selection (Auto, WebM, MP4), and last take tracking.
  Performance gesture/stroke recording is clearly separated and controlled side-by-side in desk toolbars
  and a unified recording studio modal (`R` for video, `T` for performance).
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
- **13-update** (**shipped** ad hoc, asked 2026-10-25; the story is in
  `docs/plan-shipped.md` §13): a release is Run workflow → *Mac app* with *release*
  ticked, which builds, checks and publishes a GitHub Release; the site's Download for
  Mac (Profile & Store for Pro, the landing page) links to its fixed-name .dmg; the app
  finds new releases itself (electron-updater, `desktop/updates.js`) and, ad hoc,
  offers the download in its menu and the profile sheet. *Measure:* `npm run updates`
  (80/80, CI `Measure · logic`), and `npm run desktop -- --packaged`'s "updates" line
  (the shipped updater against a feed the check serves; 11/11 on the Linux pack).
  Judged on the owner's Mac: `docs/judging.md` §75.
  - **13-update-signed** *(shipped 2026-10-27: the first signed and notarised release,
    1.3.692, went live at 7:12 PM PT; `MAC_APP_NOTARISED` is now true in
    `src/lib/macApp.ts`, so the profile sheet's Mac app card and the landing page stop
    telling the Open Anyway way round, and `npm run updates` asserts the flag and that
    both pages still gate the words on it. The build job's limit went from 40 to 75
    minutes after a run was cancelled at 40 still waiting on Apple's notary service.
    Owed: judging §75, the owner installs 1.3.692 and confirms the next release replaces
    it in place)*: with the Developer ID secrets in, the same code downloads in the
    background and installs on quit. Nothing else to build. The release notes stopped
    by themselves, from what `spctl` says of the built app.
  - **13-first-open** *(shipped)*: the first release, 1.3.622 (2026-10-25), was refused on
    the owner's Mac ("may harm your Mac"), and the reply sent then said right-click →
    Open, which macOS 15 no longer offers for an app it cannot check. The release notes
    (when `spctl` refuses the build), the profile sheet's Mac app card and the landing
    page's download line now say System Settings → Privacy & Security → Open Anyway;
    `desktop/README.md` adds the `xattr` way. Only a Developer ID **and** notarisation
    (13.1-sign) removes the warning. *Measure:* `npm run updates`, two lines (the words,
    and the notes' gate before publishing).
  - *Trap:* the updater reads the repository's **newest** release. Any other kind of
    release on this repo (a `show-*` tag of 14p, an iPhone build) must be published
    with `--latest=false`, or every installed app looks for `latest-mac.yml` in it
    and reports an error.
  - **13-version**: a release is `<major>.<minor>.<run number>` (1.3.N) while the site
    packed inside keeps `package.json`'s 1.3.0, so the About box and anything the page
    reports (the cast hello's version, 14k) disagree with the release by name. Pass the
    release's version to the site's build, or bump `package.json` in the release.
  - **13-exit** (found 2026-10-25): the first launch from /Applications on the owner's
    Mac exited by itself after a few seconds, with no crash report; the second has
    stayed up. The app writes nothing about why it quits. Write the main process's
    errors and `render-process-gone` / `child-process-gone` to
    `userData/logs/main.log`, so the next one says why; then find it.
  - **13-sync** (asked 2026-10-25): the app's storage is its own, so Pro looks saved
    on the site were not in it. Shipped as **23.18** (cloud sync for Pro, its own PR);
    the one-file-at-a-time move below is what Free and Home still have.
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
- ~~`npm run desktop`'s projector line goes red on CI's Mac on PRs that never touched
  it ("the mirror's canvas missing", #255 and #262 on 2026-10-04)~~ **Fixed 2026-10-04
  (#263):** the line read the projector once, 2.5 s after its window appeared, and on
  the Mac the mirror comes up 3.15 s after the projector's page opens (the first run
  that printed it). Until then the page is `main.tsx`'s black loading fallback: the
  projector shares the show window's renderer, and the show has just reloaded and is
  in its opening, so the page's first animation frame is held as long as the show's
  (in the cloud 0.48–0.58 s with 11–66 ms of script, the mirror at 0.39–0.65 s). The
  line now waits for the mirror (`#stage-canvas`) up to the app's own 8 s loading bar,
  prints how long it took and the longest frame the page sat in before it, and reads
  the click hint 2 s after the mirror came up: the hint is timed from the mirror's
  mount, so the old read could judge it before it was due. The second read must be of
  the same page (its `timeOrigin`), at least 1.5 s after the mirror, with the show
  window still there and one projector window (the `check-skeptic`). Red on a build
  with no mirror canvas (missing at 8.02 s), on one whose hint ignores full screen,
  and on that one again with the projector reloading, or closing, 1 s after the mirror.
- **desktop-cast-late** *(found 2026-10-27 on #507, which touched only the workflow's
  timeout)*: the projector line went red again on CI's Mac, the mirror's canvas
  "missing at 8.15 s" because the `CastDisplay` chunk itself arrived at 8.12 s (the
  index scripts by 1.69 s, the page's longest frame 1.19 s with 0 ms of script). So
  the 8 s wait was spent fetching one lazy chunk from the app's own server, not in
  the page. The re-run, and every other Mac app run that day, passed. Find what held
  that chunk (the server busy with the show's reload, or the runner's disk while the
  notary upload ran beside it) before touching the 8 s: the bar is the app's own
  loading bar, and a projector that takes eight seconds to appear at a gig is a fault.
  *Measure:* `npm run desktop` printing when each chunk was asked for and answered.
  Keeping the solver's 668 kB chunk out of the mirror's page was tried and moved
  nothing in the cloud (0.42–0.63 s against 0.39–0.65 s), so it was left out. *Still
  open:* whether the Mac's 3 s is Chromium's GPU-start hold (`npm run startup` reads
  a cold show's at 2.5–3.2 s) or the show's own opening code is what the printed
  frame says; if it is script, it is the show's opening to shorten (§14), since the
  wall is black for those seconds after the projector is plugged in.

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

**Partly shipped** (#211 for the sound; the MIDI fader on 2026-10-11): the ear keeps every reading in a ref, tells React ten times a second, and the plate hears a reading taken on its own frame; a fader is read by the plate on its frame and shown on the desk ten times a second (`npm run renders`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

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

Still open here: the reading's two byte arrays are still new each reading (about 60 KB
a second), not reused: a listener may hold an older reading, so reusing them needs the
readers checked first.

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
  retried a failed rung every 90 s, forever (`governor.ts`), so a laptop or phone that
  is warming up climbs, drops frames for a second and a half, steps down, and does it
  again every minute and a half. **The doubling shipped with 14aa** (`npm run rungs`,
  "hunting": 38 rung changes in half an hour → 10, the first retry still at 99 s); what
  follows on the phone's ladder, the adapter and a cool setting is still open. Every
  Apple GPU classes as `strong` (`device.ts`), so
  an iPhone opens at 512² and climbs; the phone layout does not touch the ladder; and
  the adapter is always asked for `high-performance`, which wakes the discrete GPU on
  dual-GPU laptops. Cap a phone's climb
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

### ~~14m. Anyone on the venue's network can drive the show~~

**Shipped, this PR** (`npm run showkey`: 11 of 33 on the old server, 33 of 33 now). Story in `docs/plan-shipped.md`.
Left open from it:

- **14m-guest** (*proposed*, M; moved up by §36f, with a plate per performer): a **guest key**, now that the server has roles: a key
  whose socket may only drop, blow and finger, rate-limited, in the palette's dyes, onto
  a chosen plate, with a Guests level and a kill on the desk and the phone. A singer's
  tablet, a second projectionist, or at a party the audience's phones through a QR code
  on a card. *Measure:* `npm run showkey`: a guest socket's `patch` is dropped.
- **14m-tunnel** (S, the Mac): behind `npm run tunnel` the server counts each phone by
  `cf-connecting-ip`, so tunnel phones no longer share one address's caps and lock; but
  the upgrade's Origin check assumes the tunnel passes the phone's Host and Origin through
  unchanged, which no cloud session can confirm (`npm run showkey` asks it with the
  headers cloudflared is documented to send). *Measure:* on the Mac, a phone through the
  tunnel joins; if Cloudflare rewrites either header, the check's headers change to match.
- ~~**14m-mark**~~ (S): a big logo reaches the network display. **Shipped** (`npm run phonelink`). Story in `docs/plan-shipped.md`.
- ~~**14m-lan**~~ (S): the laptop's page at its Wi-Fi address says to open it at localhost. **Shipped** (`npm run phonelink`). Story in `docs/plan-shipped.md`.
- **14m-https** (M, found in 14m-lan): a **network display cannot start at an `http://`
  Wi-Fi address**. Browsers give WebGPU only to a secure page (https, or localhost), so
  `http://<laptop-ip>:3000/?cast=true&key=…`, the address the README and the server give
  a projector's browser or a second computer, fails at the first shader module with
  "GPUTextureUsage is not defined" (measured in Chromium on 2026-10-24; `npm run
  phonelink` now asks for the plain words on that screen). The phone's remote needs no
  GPU and is unaffected. *Fix, to choose:* the show server serves https on the LAN with a
  certificate the owner's devices trust (mkcert-style; every device installs it once), or
  network displays go through the tunnel's https address, or the network display gets a
  WebGL2 fallback of the plate. *Measure:* a network display opened at the address the
  server prints draws a plate in a browser as it ships (the Mac's `wall`).
- **14m-budget** (S, a trade-off to watch): past 30 wrong keys a minute across every
  address, the server refuses new joins from everyone but the laptop for 60 s. That is
  what keeps a guesser spread over a /48 of IPv6 to about 20,000 guesses a day, so years
  for an eight-digit key; the cost is that a script with a dozen addresses can keep new
  phones out (phones already in, the laptop and its display are untouched). If a venue
  ever meets that, the fix is a longer key for the tunnel, not a looser budget.

### ~~14n. One malformed message can end the plate~~

**Shipped, #322.** Story in `docs/plan-shipped.md`.

### ~~14o. The song-ID Worker is open to anyone~~

**Shipped, this PR** (`npm run fingerprint-worker`: 7 of 19 on the old Worker, 19 of 19 now).
Story in `docs/plan-shipped.md`. Left open from it:

- **14o-count** (S): the counters are in Workers KV, which takes one write a second per
  key and, on the free plan, 1000 writes a day; each lookup writes two keys, so the
  free plan meters about 500 lookups a day, and a second lookup from one address in the
  same second can be refused as busy. A store that refuses answers 503 `busy` with CORS
  (`npm run fingerprint-worker`, check 8). *Fix:* a Durable Object counter, or the paid
  plan's quota. *Measure:* the same harness with a store that allows one write a second.
- ~~**14o-smoke**~~ (S): the deployed Worker, measured from a cloud session on 2026-10-24.
  The live site's build carries the Worker's address; a POST with no Origin is refused 403;
  one from the site's origin passes the store, size and rate gates to the body (400 on a
  non-audio body); a 4 s tone reaches AudD, which answers that it cannot fingerprint a pure
  tone; and a 10 s clip of the bundled "Live On Rainy Days" comes back 200 `{"match":false}`
  (not in AudD's catalogue). Whether a well-known commercial track comes back named is
  the one thing left, and needs a recording no cloud session should send.

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

*Moved up by §36g (2026-10-27): the old light shows fought the band's own lighting.*

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

- *The input picker never changed the input* (**shipped**, 2026-10-05): a pick opens the
  input picked, by its id, and closes the one before (`npm run inputpick`, 2/5 → 5/5).
  The story is in [`docs/plan-shipped.md`](docs/plan-shipped.md) under 14s.
- *On Safari and iOS, every song after the first is silence to the ear.* Without
  `captureStream`, `musicStream` hands back the one `MediaStreamDestination`'s stream;
  `startMusic`, `handleSourceChange` and `toggleMusic` stop `audioStream`'s tracks, and
  then the same ended stream is handed out again. Measured in Chromium with
  `captureStream` deleted: the analyser's source was live after the first shelf track
  and ended after the second; the track-end advance goes the same way. Inferred for
  Safari: that context is made in `oncanplay`, outside a gesture, and never resumed.
  Never stop the destination's own tracks; resume it from the play gesture.
- *Song ID can switch itself off for the session.* (The flag half **shipped** in 14z-2:
  the silence branch's `finalizeListen` is in a `finally` now; the two leaked
  `AudioContext`s are still open.) Its silence branch sets `busyRef` and
  awaits `finalizeListen` with no `finally` (`useMusicIntelligence.ts`), unlike the two
  branches beside it: one throw leaves identification, the local match and the song-end
  detector off. A failed `decodeAudioData` in `songMap.ts` and an error in `capturePcm`
  (`fingerprint.ts`) each leave an `AudioContext` open. (14h's shared busy flag is the
  same flag, hung by a request rather than a throw.)

*Measure:* the same as `npm run inputpick` with `captureStream` removed (the source
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
- *Program Change is dropped* (**14t-pc**, from §30). `parseMidi` (`midi.ts`) returns
  CC and note on/off and nothing else, so a 0xC0 message never reaches learn. AUM's
  MIDI matrix, the Elektron boxes and most hardware sequencers send Program Change (and
  Bank Select, CC 0/32) when the pattern changes, and Imaginando's VS switches patches
  on it. A `program` binding kind in `MidiTarget`, bound either to set-list item n or
  to a named preset, played with the item's own fade. On the phone, the bindings are
  listed on its MIDI page. *Measure:* beside `npm run desk`'s MIDI lines, a recorded
  run of Program Change messages lands on the bound look every time, none doubled,
  with the item's fade.
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
  the sequencer's stages do not (`rideSetting`, a MIDI fader, does since 2026-10-11). `driftLook` holds each
  dial within 20 % of its travel of the anchor, and skips a dial the anchor has at 0.
  Measured with the real `driftLook` over 100 drifts: 1,496 of 1,560 preset-to-preset
  Gos pull a dial more than a quarter of its travel off the new look, or switch on a
  dial it had off (stardust-collapse to poster-1969: nine switched on, ten pulled);
  re-anchored at the Go, none. Re-anchor at the end of a look fade. ~~A fader is also
  fought by a glide in flight; treat a ride as a hand's write.~~ Shipped with 14f's MIDI
  half: the glide on that dial is dropped at the first message and the anchor moves to
  where the fader put it.
- ~~*⌘S never saves over the open look.*~~ Settled by QA-18: the button, ⌘S and ⌘K all
  ask for a name now, and writing over is the sheet's Replace. Do not make ⌘S write over
  again: a Save that silently wrote over the open look is what the owner reported.
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
- ~~*After 14f's sound half (#211):* `useSongChange` sampled the song-gap detector at
  the App's render rate.~~ It listens on the ear's `onReading` now (14z-2).

*Measure:* `npm run desk` and `npm run layout` for the frame after Esc and after a
switch (the frame is the hole; a click on the preview reaches the plate); a node check
over `driftLook` for the 1,560 pairs, re-anchored; `npm run setlist` for the sequence's
name; `npm run phone` for two fingers; a load with storage blocked in `npm run panel`.

### 14v. The show takes a long time to load on the web

**Partly shipped** (2026-10-04): the opening builds its pipelines three at a time, asks for the app and the GPU earlier, asks for the display first, and an intro covers the black plate (`npm run loadtime`, `npm run intro`, `npm run startup`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

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

- **Shipped, 14v-5: the intro starts still, and turns once the opening's render
  pipelines are built** (2026-10-10). Turning, it stopped the Mac's frames while
  Chromium started the GPU (startup's "no stop in the opening" red on about half of
  10-10's runs); `npm run intro` line 9b. The story is in `docs/plan-shipped.md`.
- **Shipped, 14v-6: the opening asks its first fills before the display, after the
  mount frames settle** (2026-10-18, this PR). The story and numbers are in
  `docs/plan-shipped.md` §14v; judged over the week after merge against the week
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

- **Shipped, 14v-7: a frame gap while the intro is held still counts only the page's own
  work in it** (2026-10-24, the owner's choice). All 41 reds of "no stop in the opening"
  in the week to 10-24 were Chromium giving the device or compiling its first kernel
  with the page idle (its own long tasks 0.83 s at most) and a still intro on screen,
  every gap over before the intro let go. Inside the still stretch a gap now loses only
  the time the page's own timer kept ticking on time (`TICK_FREE_MS` 250), up to
  `STILL_IDLE_CAP_S` 4.5 s all told, and only of a still that let go; outside it, and for
  heartbeats and steps, the 2 s bar is unchanged. Six synthetic openings check the rule on
  every run. Replayed on the logs by long tasks alone: 41 red to 0; the ticks in the gaps
  are not printed, so the week after decides. Named limit: the GPU process's compiles of
  the app's shaders inside the still stretch are not counted (1, 1b and the first step's
  cap hold their length). Story in
  `docs/plan-shipped.md` §14v-7; judged by `npm run flakes -- --check 'no stop in the
  opening'` over the week after.
- **14v-8. Two edges of 14v-7's rule, from its review (#456).** (b) is shipped (2026-10-25):
  three more synthetic openings for the `seenOk` gate (long tasks not observable, the
  timer's median over its bar, no timer reading), each of which must count the gap whole;
  with `seenOk` forced true all three go wrong. (a) waits. One gap can reach 6.5 s before
  check 4 goes red: 4.5 s of it taken out as the page seen free, plus the 2 s bar. Read the
  week's `stillIdle` on the line before deciding whether the cap should be per gap; in the 37
  Mac runs since 14v-7 merged the longest wait for a frame was 0.8 to 1.6 s and the still
  intro took nothing out on any of them, so there is nothing to read yet.
- **Shipped, 14v-9: the webpage loads only itself first, and leaves the GPU for Play**
  (2026-10-28). `npm run loadtime` 4a to 4d; the story is in `docs/plan-shipped.md` §14v.
- **14v-10. The plate's opening is 8.75 s of compiling on a cold Mac.** CI's Mac, PR
  #511's run 40619521397 (2026-10-28): first step 13.44 s, the device given at 4.33 s,
  56 pipelines built ahead from 4.34 to 13.09 s (25.5 s of compiles over three lanes,
  median 0.32 s; `fluid/deltaVel:rgba16float` 2.67 s, `fluid/liquidForces:rgba16float`
  2.66 s, `fluid/squeezeUpdate` 1.40 s, `plate/display` 1.03 s). The two slowest are
  the next thing to read: why each takes eight times the median, and whether the
  opening needs them before its first step.
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

### 14w. The pointer on the wall (shipped)

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

### 14x. The microphone hears the hand on the laptop (shipped)

**Partly shipped** (2026-10-04): a reading taken just after a press, key or touch on the page calls no onset on the microphone (`npm run clicks`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

*Still open:*
- *A gesture the page handles after its sound has reached the ear is not gated.* The
  browser hands input over at the start of a frame and the ear reads after it, so with
  a laptop's ~30 ms of input latency a frame's delay is covered (`npm run clicks`
  measures it); a page busy for longer than the latency, or a microphone faster than
  the trackpad, lets that click through. Holding every onset back to wait for late
  events would make every kick late; not done.
- *A line input is gated too.* An audio interface on the "microphone" source does not
  hear the trackpad, but its kicks in a gesture's moment are swallowed all the same (at
  most one a gesture; the clock covers a steady song). If it matters at a gig, a switch
  on the Sound panel, or the device's label, could say which input is a room.
- *Judged on a real laptop.* The click modelled in `npm run clicks` is a tick and a
  thump; a MacBook's own microphone on its own trackpad is the owner's to try: pick
  tools and ride Speed in a quiet room on the microphone, and the plate should not
  move on the clicks.

### 14y. The sound Source opens on Off (shipped, asked 2026-10-22)

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
- **Judged by the owner:** a landing visitor no longer meets a plate moving to music
  before choosing anything (14y reverses that first-visit choice at the owner's word); if
  the landing page (34a) wants a moving demo it should be a filmed clip, not the live band.

### 14aa. The plate stutters in bursts on a machine with room to spare (shipped, asked 2026-10-24)

The owner: "things are a little jittery sometimes"; make sure the GPU is used across
the code. Three causes, each with its check: the step count stopped and doubled the
liquid in bursts (`npm run cadence`), each solver step made half a megabyte of garbage
for the page's collector to stop for (`npm run encode`), and the governor retried a
rung the machine could not hold every ninety seconds for ever (`npm run rungs`,
"hunting"). How each was found and measured is in `docs/plan-shipped.md` §14aa.

- ~~**14aa-3**~~ shipped below (2026-10-25).
- **14aa-1** (open, the owner's eyes): on the owner's 120 Hz laptop and on the wall, does
  the plate still stutter now and then? `docs/judging.md` §88.
- ~~**14aa-2**~~ (measured 2026-10-25 on the owner's Mac, Metal, comment on #441): at
  sixty steps a second (Poster 1969, 256², 60 s) 9.16 % of frames took no step or two
  before, 0 after. Governed three-minute runs at thirty steps: frames of two steps 1 → 0
  (Classic) and 2 → 0 (Neon Coral Reef), gaps over 50 ms 2 → 0, and the [1, 0] pattern
  broken on 0.01 % of on-time pairs. Poster 1969's 136 two-step frames fell in the 14 s
  the governor tried sixty steps and the frames were slow: catch-up, not cadence (14aa-3).

### 14aa-3. The governor climbs back to sixty steps into a stutter (shipped 2026-10-25)

**Shipped**: the governor measures what a solver step costs apart from the frame's drawing,
judges each climb on what the state it climbs to would cost, and gives sixty steps up when
frames keep missing a refresh with the GPU over its budget, where it used to wait for an
average that sat either side of its line. Poster, 1969 on the owner's Mac held 8.5 to 16.8 s at
sixty steps after each climb, 82 to 192 frames of two steps; replayed in node, 57 to 1136 such
frames after the opening on the old governor and none on the new (`npm run rungs`); on the
GPU, `npm run stutter`. The story is in `docs/plan-shipped.md` under the same number.

Open, found doing it:

- **14aa-4** (open, a named shortcut): a climb's cost is predicted from the cells for a
  step and the pixels for the drawing. Neither is the machine's own: Poster's step went
  8.2 → 25.1 ms from 512² to 768² on the owner's Mac, 3.1 times for 2.25 times the cells (the
  larger grid's textures leave the cache), and part of the drawing does not scale with the
  pixels at all, so a pixel climb is predicted dearer than it is and a grid climb cheaper.
  Learn each rung's ratio from the frames it has drawn this session (a step's cost on every
  grid visited, the drawing's on every pixel share) and predict from that. Two trades this
  shortcut makes today, both visible next to the old governor (the review of #474): a light
  look tops out a rung lower (512² at two pixels, where the old governor climbed on to 768²
  at two pixels and sixty steps, predicted 11.6 ms against the 9 ms budget), and after one
  busy tab a light look climbs to 768² at thirty steps and sixty never comes back (the old
  governor had it back in about ninety seconds). The second could also be priced: give up
  the rung again when that wins back sixty under budget.
- **14aa-5** (open): the governor's lines are 60 Hz milliseconds (`SLOW_MS`, `FAST_MS`,
  `MISSED_MS`): on a 120 Hz display a missed refresh is 8.3 ms late and is not seen as one. Take
  the refresh from the draw gate (`drawGate.refreshMs`) and draw the lines in refreshes.
- **14aa-6** (open): `npm run stutter` runs by hand on the Mac (the watcher). Whether it joins
  a Mac shard depends on what the CI runner's GPU makes of Poster, which no run has asked yet.

### 14ab. What else runs on the CPU every frame (found with 14aa, read in the code)

An inventory of the frame loop's own CPU work, 2026-10-24. Ranked by what a show pays.

- ~~**14ab-1** *The video pour pauses and plays its video every frame* (a bug).~~ Shipped
  with 14ac (#451). `App.tsx`'s
  frame loop calls `pourVideo` each frame, and `pourVideo` pauses the element it holds
  and plays it again, which fires `pause` and `play`, which set React state twice a frame
  and restart the loop. Fix: `pourVideo` does nothing for the video it already pours, and
  is asked once, on play. Check: a page with a video poured counts `play` events and App
  renders a second.
- **14ab-2** *The video pour's optical flow is a CPU loop* over a 192² `getImageData`
  each frame, with a new 147 KB array each time, calling `addDensity`/`addVelocity` per
  pixel. `fluid.pourImage` already takes a video on the GPU; the frame differencing
  belongs in a compute pass beside it.
- **14ab-3** *Every frame reads both fields back and averages them on the CPU*
  (`syncFromGpu`, a loop over every cell of each layer for the mean density and colour)
  where `measure()` on the GPU returns the same means in 32 bytes. With 14j's "read back
  only on a frame that stepped".
- **14ab-4** *A CPU pour uploads the whole grid every step* (`flushDeltas`: about 1.3 MB
  through three to five `writeTexture`s and the upsamples), for a few changed cells.
  Splat records on the GPU (`applySplats`) are the path; what still goes through the
  delta grids is the bubbles' rims, the hands, the breath and the room stir.
- **14ab-5** *The plate, post chain, camera, output and particles make their bind groups
  and views every frame* (10–20 `createBindGroup`, 40–60 `createView`); the solver
  caches its own (H2c-11).
- **14ab-6** *The beads redraw a 512² canvas and upload it every frame they move*, with a
  gradient per bead (`beads.ts`); a drawn splat pass on the GPU would do it.
- ~~**14ab-7** *The ear allocates every frame*: two byte arrays (14f's open line), two
  `Float64Array`s, and seventeen onset detectors each doing slice, sort, map and sort
  on their history. A ring and a selection median.~~ **Shipped** (#533, 2026-10-28): the
  detectors keep two rings and take the median and its deviation by partial sort, to the
  same number to the bit; the live ear stopped copying its byte arrays; the fifteen-frame
  median's scratch is kept. `AudioFeatures.update` 0.5–0.6 → 0.30 ms, 227.65 → 5.7 KB an
  update, readings identical (`npm run eargc`). Story in `docs/plan-shipped.md`. What is
  left (5.7 KB an update) is the reading itself: seventeen onset objects, three arrays and
  the chroma; not worth a ring of readings until a Mac profile asks.
- ~~**14ab-8** *The gamepad* re-renders App at 30 Hz while its cursor shows (a new cursor
  object each tick) and sets `connected` on every poll through a stale closure (with
  14j's timer line).~~ **Shipped** (#533): the ring (`GamepadRing`) listens to a store in
  the hook and moves itself; the App renders 43 → 1.0 times a second with the ring up
  (`npm run renders`' gamepad phase), and the poll sets `connected` once.
- **14ab-9** *Thick liquid's share* makes a MAP_READ buffer and two 590 KB arrays every
  sixty steps (`speciesShare`); a ring like the readback's.
- **14ab-10** *Two of `npm run wall`'s lines judge the Mac runner, not the gate.* On #441's
  tools shard, two attempts on one head were each red on one line of 224, a different line
  each time. Attempt 1 failed "both windows animating, 0.25 of a refresh behind", which read
  1.1x, against a bar of 1.05: 21.9 drawn against 20.4 served, with displays at 19.4 and
  30.1 Hz. Attempt 2 failed "both windows were handed the same refreshes", which read 1.154x
  (17.2 served against 14.9), over its bar of 1.15. The PR changes neither `drawGate.ts` nor the place frames are offered
  to it. The runner was handing each window 11 to 30 of its 60 refreshes. Green runs that
  night handed 13 to 40, and #461's green run read 1.13x on the same line. The lines' own
  comments say a starved runner's late timers part the two windows' frames by themselves. Find
  a measure of the gate's fault that holds at a quarter of the display's refreshes, or a
  starvation reading that sets the line aside and says so. The bar itself stays where it is.

### 14ac. Cartoons that ship with the app, and the video pour's stutter (shipped, asked 2026-10-24)

**Shipped** (2026-10-24): four public domain cartoons, each the whole film looping, poured as
dye or played as the film from a Cartoons shelf on the desk's Dye panel and the phone's dye
sheet (`src/lib/cartoons.ts`, `CartoonShelf.tsx`; sources and licences in
`public/video/cartoons/SOURCES.md`; `npm run cartoons`). With it, **14ab-1** (written down
with 14aa): the video pour no longer pauses and plays its video every frame. And the
projector's film (a loop, the camera, a window, a cartoon) now survives the plate being
rebuilt (a lost device, a resolution change), where it used to go dark while the panel still
said it was playing. The story is in
`docs/plan-shipped.md` under the same number. The owner's look at them is `docs/judging.md` §66.

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

Open, found building it:

- **14ac-1** *A poured file has no Stop.* The desk's Video… and the phone's "A video as dye"
  pour a file, looping, and nothing in the app stops it short of reloading; only the shelf's
  cartoons have a Stop. One Stop for whatever is pouring, beside Video… and on the phone.
- **14ac-2** *The pour's dye is the picture's light, a shortcut.* The pour keys out dark
  pixels and lays every lighter one as dye of its own colour, and pushes the plate along the
  picture's brightness gradient where the frame changed (`LiquidVisualizer.tsx`, "Video
  Pour"). A black-and-white cartoon is mostly a light background, so it pours mostly white
  over the whole dish, with the figures as holes in it. Nothing in a real liquid show works
  like this: a film there is projected through the dish (which is what Film does), not
  dissolved into it. Two ways to look at: an Ink key that pours the picture's *dark* lines
  as dye (the ink of a cartoon is its drawing), and the picture as light on the plate rather
  than as dye in it. Judge first (§66), then pick.
- **14ac-3** *More films for the shelf.* Walter Ruttmann's *Lichtspiel Opus I–IV*
  (1921–25) are abstract hand-tinted animation, made for exactly this, public domain in
  the US by date and in Germany since 2012 (Ruttmann died 1941). The Archive's copies are
  re-uploads of modern restorations or carry an uploader's CC BY claim; they need a print
  or a transfer whose source is known before they ship. Ub Iwerks' *Fiddlesticks* (1930)
  and the 1930 Silly Symphonies joined the US public domain in 2026, with the same check.
  Every addition gets a row in `SOURCES.md` first; `npm run cartoons` refuses one without.
  *2026-10-27:* Fiddlesticks (1930) is on the shelf, with four later colour films (see above).
  Still open: Lichtspiel and *The Adventures of Prince Achmed* (1926, tinted), which are free by
  date and need a print whose source is known; the 1930 Silly Symphonies (black and white);
  and the Popeye colour specials, the Superman shorts and *Poor Cinderella*, left off for the
  characters' trademarks, not their copyright (`SOURCES.md`, "Considered and left off").
- **14ac-4** *The cartoons are grey.* **Shipped for colour** (2026-10-27): five are in colour,
  and the pour lays each pixel's own colour, so no code changed. Whether the look's palette
  should tint the grey four or the colour five (Film's grade already can, in the Mixer) is
  still the owner's call in §66 and §85.
- **14ac-5** *Colour that is two-strip or Cinecolor.* These prints have two colours (red-orange
  and blue-green), not three: no true yellow, blue or purple. The pour lays what the print
  has; judge in §85 whether a look's palette should fill in what a two-colour print cannot.
- **14ac-6** *A feature on the shelf is a 27 MB file.* Gulliver's Travels is a quarter of the
  shelf's weight, fetched only when someone picks it. If that proves a cost (a phone on mobile
  data), cut it to a half hour of its best scenes as a separate entry, or serve it by a
  lower bitrate; the check holds a feature under 30 MB.

### 14ae. One Record button (shipped, asked 2026-10-24)

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

- **14ae-1** *Song film still lives in the music player too.* Its film icon stays beside the
  song it renders; the panel's row opens the same sheet. Phase 3 of the Clear Controls audit
  (one home per setting) decides which stays.
- **14ae-2** *A still of the plate.* There is no "Save picture" (only the crash report's
  screenshot). A fourth card in the Record panel; the plate's frame is one `toBlob` away.
- **14ae-3** *Recording MIDI or automation.* Nothing records a controller's or a ride's
  movements; the Take keeps only the hands on the plate. Wanted only if the owner asks.
- **14ae-4** *Sound's source in the words.* The panel's Sound switch could name the source
  ("Sound: Mic") the way the header's Sound dot does; with phase 1's renames.
- **14ae-5** *The phone's Record sheet.* The phone has the choice in More and a Play pill;
  Sound on/off and quality are desk-only.

### 14ad. Any camera, anywhere; the motion camera told apart from the film's Webcam (shipped, asked 2026-10-24)

**Shipped** (2026-10-24): one camera list (`useCameras`, kept current on `devicechange`)
and one picker (`CameraPicker.tsx`) in both places a camera opens, desk and phone alike: the
motion camera (was "The Room") and the film's Webcam, which could only ever open the
browser's "environment" camera. Each choice is remembered apart; a camera pulled out takes
its source off and says so, and opens again by itself when it is plugged back in; a chosen
camera that is missing opens the browser's pick, says so, and hands over when it arrives
(`src/lib/cameras.ts`, `npm run cameras`). The room section is now **Motion camera**,
its first line says its picture is never shown and points at Webcam, and the film's camera
line says it shows a picture and points back. Story in `docs/plan-shipped.md`.

- **14ad-1** (S) *The audio input does not come back either* (14g's first half): the same
  `devicechange` reopen, for the sound's input.
- **14ad-2** (S) *Room Drive and Room Impact keep the old word.* The section is Motion
  camera; its two masters (and the patch source "Room") still say Room. Rename with
  phase 3's one-home-per-setting pass, where the Drive/Impact pairs are settled, rather than
  churn the patch bay's names twice.
- **14ad-3** (S) *The browser keeps camera names back until one has been allowed.* Before
  that the pickers list "Default camera" only, with a line saying why. A "find my cameras"
  button that asks once and closes the camera at once would list them sooner.

### 14z. A new song: where songs start and end, and the change on the music (asked 2026-10-24)

The owner: song detection does not work well enough to ship. It does not catch where
songs begin and end, and it does not change the look at the right moment. What it is
today (`songBoundary.ts`, `useSongChange.ts`): it fires after 1.8 s of quiet that
follows at least 20 s of song, or when song ID names a different track, which it asks
every 12 to 35 s. A crossfade or a gapless set never reads as quiet, so it is never
caught; a quiet bridge can be. It samples at the App's render rate, not the ear's
(14u), the hung `busyRef` can switch the end-of-song half off for the session (14s),
and the change is a fixed 2 s fade wherever it lands (`App.tsx`, the On a New Song
effect). `npm run music` only feeds it synthetic level traces.

- **14z-1** (**shipped**): On a New Song opens on Keep. Nobody gets a look changed by
  a boundary nobody trusts; New preset and Random are still one press in Settings.
  `npm run music`: "a new song keeps the look unless someone asks for more" (FAIL on
  'preset', ok on 'off').
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
- **14z-3** (**shipped**): the change lands on a hit of the new song (27 of 31 gaps; else
  1 s after it is confirmed), a median 1.0 s after its first note. After a gap the look fades
  in over 1 s; named by identification, mid-crossfade, it blends in over twice the desk's
  fade, at least 4 s. Judged on the owner's GPU: `docs/judging.md` §65.
- **14z-4**: once the owner has judged §65 with their own music, On a New Song opens on
  New preset again (the `music` check's default line moves with it).
- **14z-5**: the room tracker seeds its floor on the analyser's first frame, and an analyser
  with nothing through it yet hands it digital silence (-140): the floor then climbs about a
  tenth of a decibel a second, so every room reads as "sound" for minutes. Measured in
  `npm run songends`: the old gap rule with a tracker seeded that way caught 0 of 56 joins.
  The boundary no longer leans on it, but the analyser's window (the visuals' calibration)
  and the gate still do: seed from the first frame with sound in it (the render's side of
  the same seeding is under 28e's leftovers). Check that the
  calibrated window then settles on the room within its calibration time, in `ears`.
- **14z-6**: a song the show has never heard waits for the recognition service's 35 s
  re-check when it crossfades in. Ask the service sooner when the sound's character shifts
  (a candidate, not a change: the measured shifts inside songs make it a poor trigger for
  the look, a fair one for a question), within its quota. And a live band: applause and
  talk between songs are neither quiet nor a new song's sound, so the boundary waits for
  the next song's own decay; hear applause as a gap (broadband, no pitch, no beat).
  And a room that fills up late in a song: the floor looks back a minute and climbs a
  decibel a second, so a gap at a room 18 dB louder than it was is heard only once the room
  has been that loud for about 80 s (with the room rising 35 s before the gap, 1 of 8
  caught; `songends`' gap2rise gives it 95 s). Follow the floor faster without hearing a
  quiet passage as the room.

## 15. Every tool on every liquid

Asked 2026-09-27 ("Shouldn't blowing and finger also move around the ferrofluid?",
then "look at the liquid and tools interactions across all of them"). Read from the
code, with the velocity numbers measured in the lab. The whole table is in
`docs/tool-by-liquid.md`. What it found, by what a
performer would notice first:

### 15a. Only the Dropper lays the bottle's liquid (shipped)

**Shipped** (#201): every laying tool lays the bottle's liquid (`npm run bottles`); the Splat line's "following the hand" was fixed in #214. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 15i. Picking a bottle pours nothing (shipped)

**Shipped** (2026-10-04): picking a bottle sets the bottle in the hand and pours nothing (`npm run bottles`). How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

  Maze, Ferro Paint) carry their own amount and lay their own pour when they load.

### 15j. Found with 15i

- A cast display that cannot mirror the show's canvas runs a plate of its own and is
  sent the settings, never the hands. So nothing poured by hand reaches it, and when a
  hand's first Ferrofluid pour turns the amount up there, it lays the look's ring over a
  plate the hand never touched. Sending the hands' gestures to it (as the remote's are
  applied with `applyGesture`) would close both.
- Ferrofluid poured by hand and a look change: a cut leaves it in the solver, hidden by
  the new look's Ferrofluid at 0 (the next pour clears it); a look that fades in clears
  it at the half-way point when the incoming look asks for none. One rule for both, and
  whether hand-poured ferrofluid should stay visible through a look change, is the
  owner's call.
- A Back fades to the previous settings as they were, so after a hand's pour turned
  Ferrofluid up they carry its 0.6, and the Back lays the previous look's ring half way.
  The previous look's own amount would need keeping beside its settings.
- A new solver after a hand's pour lays nothing now, so the pour (and, on a look with
  ferrofluid of its own, the look's) is gone from the new grid until 9w carries the phase
  across (#266).

### 15b. A tool's push lasts one step (why Blow and Finger barely move anything)

**Partly shipped** (2026-10-04): the Finger is a solid in the thin layer and moves every liquid (`npm run fingerflow`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

**Shipped for the Finger on a thin gap (every look; `npm run fingerflow`), not yet
judged on the Mac (`docs/judging.md` §33).** The owner's OK for the feel change came
2026-10-04 ("start with the making liquids real work").

Left, each its own plan item:

- **15b-blow.** Blow's push on a thin gap is still a disc of velocity (moved nothing
  measurable for the Finger's; Blow keeps its carries, `blowDye`, `blowOil`,
  `blowCarry`). Its real replacement is air's shear and the jet's dimple on the film,
  15g, which can now be built on this.
- **15b-old.** With Thin Gap off (and on the CPU engine) the old plate keeps the clamp
  and the Finger keeps its push and its carries. Not worth a lasting-current route
  while every look is thin; if a look is turned back off for its cost (judging 2.1),
  revisit.
- **15b-inside.** The penalised solid is a porous disc: the liquid (and its colour)
  under the hand rides with it, where a real fingertip has no liquid inside it and
  parts what is ahead of it. A pool the hand passes over is drawn along under it, and
  at its tail the colour bleeds out through the disc's soft edge (two Brinkman lengths,
  `handEdge`) as a trail. Measure against a stylus through marbling (Jaffer's tine
  displacement, falling with distance from the path) and, if it shows, exclude the
  hand's cells from what the carries move.
- **15b-remote.** A hand's Finger moves at the rate its events come, not once a step:
  the solid it lays moves as far as the hand moved since its last event, in the one
  step after it, and is not laid on the steps between. A remote (the phone as the
  laptop's remote, a pen, OSC) sends at message rate, and the pointer itself is no
  smoother when its events come slower than the steps (tools.mjs's stroke is a cell
  every third step), so such a stroke is a hand that stops and starts. It no longer
  loses colour (fingerflow's check 7 draws it that way); whether it reads as a jerky
  stroke on the Mac is judging §33's, and if it does, carry the hand's last speed
  across the steps until its next event.

### 15c. Blow's wind erases colour rather than pushing it (shipped)

**Shipped** (#215): Blow's wind carries the colour and the oil the way the hand went, rather than erasing them (`npm run wind`, `npm run tools`). Its follow-ups are 15f and 15g. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

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

**First part shipped**: on a thin gap (every look) the moving Blow is the breath's
stress on the surface, ½ρ_air C_f U² (about 0.38 Pa), a body force the solve takes in
for as long as the breath goes on, so the column goes at τh/2μ; its push and its three
carries (`blowDye`, `blowOil`, `blowCarry`) no longer run there (`src/lib/breath.ts`,
hsBody; `npm run airblow`, 5 checks). Not yet judged on the Mac (judging §44). How it
was built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the
same number. Open, each its own PR:

- **15g-2 The jet's dimple.** A held puff (a Blow held still that is not the straw:
  a second finger, a plate that is not the lead, a remote's puff) still runs the old
  push and the Press's ring carry. Its physics is the jet's stagnation pressure, about
  ½ρ_air U² ≈ 20 Pa at 6 m/s, which against the liquid's weight is a dimple of
  Δh = p/ρg ≈ 2 mm in a 6 mm layer: it belongs in the gap field the Press squeezes, a
  press at that pressure. Its outward shear is all divergence, which a rigid film moves
  nothing by, so it waits on this. The moving wind's own dimple, travelling with it,
  comes with it.
- **15g-3 The film's free surface.** The solve holds the film's height as the gap (a
  rigid lid), so liquid the breath pushes ahead piles into no bow wave and the film
  does not thin where the air hits. Real for a covered plate, not for an open dish.
  Needs the gap to move with the flow, dh/dt + div(h u) = 0, with gravity and surface
  tension pulling it flat; shared with 18c (a pour that adds liquid).
- **15g-4 Thin Gap off.** The old plate keeps the push and the carries (as 15b-old
  keeps the Finger's); it goes when the old plate does.
- **15g-5 A remote's wind.** A remote hand's directed Blow (performGesture: the phone as
  the laptop's remote, a pen, OSC, a replayed take) still runs the push and the carries:
  its strokes arrive a message at a time, and a breath laid only on those steps would push
  the liquid for one step in every few (the drag time is about eight steps), a fraction
  of the mouse's. Hold the breath between messages as the pointer's direction is held
  (BLOW_DIR_HOLD_MS), then let it blow as air (15b-remote is the same for the Finger).
- **15g-6 The breath's numbers.** 8 m/s at the surface and C_f 0.01 are a firm breath
  from a few centimetres, set so the air moves a pool about as far as the carries did on
  the Mac (at 6 m/s `npm run tools` read a third of it), not a measurement. A phone
  recording of a real breath across a dish of oil (`npm run watch`) would set the speed
  the colour goes at, against the lab's 2.72% of the plate over a 1.5 s stroke.
- **15g-7 Blow's stroke to the right moves less than to the left in the app.** On
  `npm run tools` (Mac) the rightward stroke has read weaker since the carries (145.9
  carried against 352.4, 4 October) and with the air (+0.13% against +1.15% on #300,
  6 m/s), where the lab's airblow reads the two alike (2.72%, 2.82%). Something in the
  app pushes colour left during a Blow stroke, or the stroke to the right runs fewer
  steps of breath; the check prints both (wind steps, aired, readings) to find which.

What follows is the item as it was written, before its first part shipped:

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

**Partly shipped** (#210): a press carries the oil with its colour, and a pressed ferrofluid pool keeps its volume under Thin Gap (`npm run pressoil`, `npm run ferropress`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

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

### 15e. The liquids' own forces on the GPU plate

**The check shipped** (`npm run liquidsgpu`, the Mac plate shard, about a minute on Metal; 4 min 26 s on SwiftShader, 2026-10-27). The GPU has
carried the liquids in fields of its own since the liquids were ported (every pour goes to
`WebGPUFluid.addLiquidDrop` through onDeposit, `liquidPhase` stands aside as `gpuNative`,
and `liquidForces` in `wgsl/fluid.ts` pushes the flow with liquidPhase.ts's constants), and
nothing measured it: `npm run liquids` holds only the 96² stand-in. The check lays the
stand-in's four scenes (now one copy, `scripts/liquidStandIn.mjs`, shared by both checks)
on the lab's GPU solver on the thin gap the looks use, and holds each liquid to the
stand-in's bar and to its size within a factor of two, with the deltas folded every step
and on a still plate. SwiftShader, 2026-10-27 (effect = one less the share left):

| Liquid | Stand-in | GPU, a fold every step | GPU, a still plate |
|---|---|---|---|
| Soap, dye left at its spot at 0.5 s / 2 s | 44% / 54% | 89% / 72% | 99.6% / 99.6% |
| Glycerine, speed against colour alone | 0.023 | 0.047 | 0.047 |
| Milk, spread against bare dye | 0.996 | 0.988 | 1.000 |
| Silicone, dye left in the middle | 0.8% | 61% | 99.3% |
| Glycerine on the old plate (no thin gap) | 0.023 | 0.999 | — |

Neither plate's soap moves the dye it clears: the spot loses exactly what the whole plate
loses (GPU, soap 149 to 107 at the spot and 507 to 465 on the plate; stand-in, 150 to 66
and 507 to 423), so both clear by erasing (15e-5), and the table's soap and silicone rows
compare two erasures. 21 lines gate; 16 are owed to the items below, print, and fail the
run the day they pass (an owed line that reads no number fails too), so the fix that makes
one pass also makes it gate. Briefs 11 (15e-1 and 15e-2) and 12 (15e-5) in the shared
briefs.

- **15e-1. The liquids' forces act only on a frame something else is laid in.**
  `liquidForces` (and soap's thinning, in `deltaDye`) run inside `foldDeltas`, which runs
  only in `applyDeltas` and `applySplats`, and the app calls those only on a frame that is
  `dirty` (LiquidVisualizer's step: a hand, a drop, a pour). On a still dish a spot of
  soap pushes for the one step its own pour folds, then never again: the soap scene
  leaves 99.6% of the dye at its spot where a fold every step leaves 72%. Glycerine is
  the exception, as its thickness on a thin gap is the species' viscosity in the thin
  solve, every step. Move the liquids' forces into the step, once a step, whether or not
  the CPU sent anything. *Measure:* `npm run liquidsgpu`'s "a still plate" lines.
- **15e-2. Where they act, the liquids' passes are about a fifth of the stand-in's.** The GPU
  scales each force by the solver's `dt` (0.004 in the lab; 0.0036 for the app at the
  default Speed), where liquidPhase.ts and the app's CPU before the port scaled them by
  the frame's real seconds (`simStepS`, 1/60). Soap's multiply is scaled the same way and
  is what the soap rows measure (15e-5); milk's repel, weight and polarity are the forces
  it leaves. Folded with 1/60 in place of 0.004 (a copy of the
  check with only the fold's dt changed) the same soap leaves 50% at 2 s (the stand-in
  54%) and silicone 17% in its middle, and both owed lines pass, soap's half second by a
  hair (effect 0.288, the factor of two asks over 0.280). Which time
  base is right is part of the fix: the constants are "per second" (MARANGONI is a
  velocity per unit of tension gradient per second), so a step that stands for 1/60 s of
  the show should push by 1/60 of them, and Speed should not make soap weaker. *Measure:*
  the "every step: as strong as the stand-in" lines, within a factor of two.
- **15e-3. On the old plate (no thin gap) glycerine's body does nothing.** The body's
  drag takes `body · 2.6 · dt` of the velocity a fold, 1% at the lab's dt, and the old
  plate's velocity is made again each step (15b), so the pool falls at 0.999 of colour
  alone where the stand-in's crawls at 0.023. Every look is Thin Gap, so this is the
  plate with Thin Gap switched off; the real fix is the species' viscosity on that plate
  too, or saying in the Thin Gap control that the old plate has no thick liquids.
- **15e-4. Milk's held edge is under 2% on either plate.** `repel` damps the flow leaving
  the pool (a named stand-in, 18d), and on the stand-in it leaves the pool 0.4% tighter
  than bare dye, on the GPU 1.2%: both pass the bar and neither is an edge anyone could
  see, so the GPU's "as strong as" line (three times the stand-in) cannot be judged until
  milk holds its edge by a real interfacial tension (18d's Cahn–Hilliard phase per
  immiscible bottle). Milk is miscible with water, so the honest look may be that it
  does not hold an edge at all; the owner's eyes on real milk in water decide.
- **15e-5. Soap and silicone erase the dye they should push (both plates).** What clears
  soap's spot is the multiply on the dye under it (the CPU's `mul`; the GPU's `deltaDye`,
  `soap² · 0.22 · dt · 60` a fold), "the film it broke thinning": of the dye that leaves
  the spot none is still on the plate, on either plate. The push is there and does
  nothing: liquidForces adds −MARANGONI·∇soap to the depth-mean velocity, a pure gradient,
  which the plate's projection takes away whole. With liquidForces made a no-op every soap
  and silicone reading stays as it was (89.0%, 71.6%, 61.3%); with the multiply made 1 the
  spot keeps all its dye, and so it does with the multiply off and the fold at 1/60 s
  (99.8%, 98.7%). The plate already knows this: `marangoniFlux`'s comment (wgsl/fluid.ts)
  records the same gradient deleted whole for the mix's soap, which since moves what rides
  the surface away from the soap in flux form (u = −k∇Γ, nothing made or lost), every
  step by the step's seconds. But a bottle's soap reaches the mix only when Surfactant Flow
  is over 0.001 (onDeposit), 0 in the defaults. So: a soap or silicone bottle's soap goes
  into the mix and moves the surface by marangoniFlux; liquidForces' soap term and the
  dye's multiply are deleted; and the GPU's liquid fields, which never fade (liquidPhase.ts
  fades soap over 6 s), stop erasing for as long as soap sits. Left for the owner: what
  Surfactant Flow means once every poured soap moves the surface (today it is the pull's
  strength, and at 0 a bottle of soap would move nothing). *Measure:* liquidsgpu's
  "moves the dye rather than erasing it" lines, over half of what left still on the plate.
  This is 18d's "soap into the surfactant field" for the GPU's liquid fields; the σ(Γ)
  law itself stays 18d's.
- **15e-6. A remote Finger is half as strong as the mouse's.** `performGesture`'s finger
  drags with `0.09 · amt · 0.5`, the mouse's with `min(0.25, 0.09 · k)` (k and kTool are
  the same Tool Amount squared): a touch of the default 0.5 is `amt` = kTool, so the
  remote's finger is half the mouse's, and only a pen pressed all the way (1, `amt` = 2
  kTool) matches it, though a pad's 0.5 is meant to be the mouse (performGesture's own
  comment). Measure both through the same
  plate (a `tools`-style line: the same stroke from the mouse and from a remote message
  moves the same colour to a stated share), then drop the extra half.
- **15e-7. A remote Blow never makes a straw bubble.** The mouse's held-still Blow is the
  straw (`strawFlow`, a real bubble blown into the dye); a remote's Blow with no direction
  is the puff, and its only bubbles are the wind's torn-in air (`airTaken`). A held remote
  Blow (a pad, the gamepad, OSC) should be the straw after the same hold, as the mouse's is.
  *Measure:* the remote's held Blow grows a straw bubble as the mouse's does (`straw`).
- **15e-8. Weight and polarity are not yet measured on the GPU.** liquids.mjs holds the
  stand-in to oil riding up a tilt while syrup settles, nothing moving on a level plate,
  oil and syrup parting where they meet and a finger mixing them; liquidsgpu has only the
  four liquids' scenes. Lay those four on the GPU the same way, with the same owed rule,
  before or with Brief 11, which changes the forces they would measure.
- **15e-9. Two lab checks at once share one bundle.** `scripts/lab.mjs` writes the plain
  lab's page to one file in `node_modules/.cache` for every run, so two lab checks started
  together (`npm run quick` runs them side by side) can load a bundle the other is writing.
  Name the file per run (the process id), or build once before the runs start.

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

### 15k. Inked balls rolled across the plate (proposed 2026-10-05)

The owner's idea, in their words: "Imagine we covered some Balls in ink and we rolled
them around the canvas by tilting the mouse or with the mouse. It would leave behind a
messy trail that eventually runs out of ink and then can push other ink around as it
roles." Not built.

The physics to model, rather than a painted trail: a ball rolling on the glass touches
it along a small contact patch, and each turn lays down part of the ink on its surface
there, more where it presses or slows and in a broken, uneven line where the coat is
patchy, so the trail starts dense and thins as the ball's ink load runs out (deposition
proportional to what is left, so it fades rather than stops). A ball also picks up some
of the wet colour it rolls through, so it can carry one colour into another. Tilting
the plate gives the balls a downhill pull and they roll on with their own momentum;
with the mouse the hand pushes them. A dry ball is still a solid moving through the
thin layer, so it pushes the other liquid aside and drags a wake behind it: the same
moving obstacle 15b builds for the Finger, which this should share. *Measure:* a lab
check that a ball's deposited dye falls off with distance as its load depletes, that
total dye is conserved (laid plus left on the ball), and that a dry ball moves dye
already on the plate. Ships with the phone (tilt is the phone's own motion sensor).

## 16. Many plates: each projector its own source (rig-plan R1)
**Partly shipped**: 16a, 16b, 16c and 16f are shipped (#231, #226, #232, #273). What 16a, 16b and 16c each left undone is listed below in that order, then 16d and 16e, which are open. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

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
  - *What a source costs is not measured yet.* `wall` times each source's pass
    (`plate front`, `plate back`, `plate film` against `plate`) where the GPU has
    timestamp queries, and the Mac runner's has none: #226's green run printed "skip
    each source's cost". Each is the whole display pass again at the canvas's size.
    It needs reading on the owner's Mac (`chromaglassDebug()`, docs/judging.md §21)
    before 16d (four plates), which is where a budget has to be.
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
| 18b | The lamp shines through the dye | Large: gels colour the dye, overlaps darken, thin washes are pale | Free | A per-look choice of ground. **Shipped** (#256), behind Lamp Ground; eleven looks on it (#262, 18b-1) |
| 18c | A pour adds liquid | Large: a drop shoves the colour outward into rings | Free | Better with 18a's open rim |
| 18d | Each liquid has its real properties | Large: glycerine crawls, thin fingers into thick, alcohol punches holes | +0.5–0.7 ms, less CPU | 18a |
| 18e | Edges come from refraction | Moderate to large: one mechanism for every edge, and a focus ring to play | <0.1 ms | None. **Partly shipped** (#355); 18e-1 to 18e-4 open |
| 18f | Heat comes from the lamp | Moderate: dark regions warm and move; the lamp's own cells | Nearly free | **Shipped** (#352) |
| 18g | Colour leaves by flushing, not fading | Moderate: the plate turns over like a real one; drying | ~0.3 ms | **18g-1 shipped** (#362), **18g-6 shipped** (the rim holds the oil); 18g-2..5, 18g-7, 18g-8 open |
| 18h | Dye diffuses physically; heat its own kappa | Moderate: holds sharp edges | About equal to today | **Partly shipped** (#357) |
| 18i | Bubbles and beads live by physics, not timers | Moderate: less "sticker" behaviour | CPU only | **Partly shipped** (#358); Bretherton lubrication, Saffman-Taylor lobes, Reynolds film drainage merge, bead speed lag; physical pop mode open |
| 18j | Milky liquids scatter | Moderate for milk, paint and latex | Free to +0.4 ms | **Shipped** (#353) |
| 18k | Smaller ones | Small | Free to small | See each |
| 18l | A dye has more than one colour | Large: every pool a ramp from pale tint to deep core, mixtures that walk between their dyes, five dyes on the plate | Free | **Shipped** (#281); real dye spectra (18l-1) after |
| 18m | A drop slumps under its own weight | Large where the liquid is thin: a pool of ink sinks and runs out as a flat, sharp-edged pool, r ∝ t^⅛ | 2 passes on the default Thickness, 7 in water | None. **Shipped** (#364); ~~18m-1~~ (#371, 18m-1a implicit step open), ~~18m-5~~ shipped, 18m-2 to 18m-4 and 18m-5a after |

### 18a. The plate is a Hele-Shaw cell (replaces the speed clamp)
**Partly shipped**: Thin Gap is built and on in every look (#248), the Press draws the liquid back, and 18a-2 (forces that are forces) is done. What is open is below: the findings along the way, 18a-2's open findings, and the steps left for later PRs. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

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

- **Found along the way, open:**
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
  - **18a-3, tools as solids.** The Finger is one now (15b: Brinkman in the thin solve,
    its carries retired on a thin gap, `npm run fingerflow`). The rest: a hand's push is imposed along its direction (a
    penalised solid in the limit where the solid wins), not a disc moving at the hand's
    velocity (Brinkman), and the hand-written carries (`carryDye`, `carryMix`,
    `fingerCarry`, `pressDye`, `pressMix`, `blowDye`, `blowOil`, `blowCarry`) still run
    on top of the flow, so with Thin Gap on the colour is moved twice. Retire them one
    at a time against `finger`, `wind`, `pressoil`, `ferrohands`, `tools`.
  - **18a-4, the current into the field.** The lasting current (`cur`) is fed into the
    thin solve as a force, but it still has its own solver on the M grid; its forces
    (rock, buoyancy, centre gravity) belong in the main field, and then the
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
    Rhie–Chow faces were given c·P, exact only where the drag is even (on a thin gap
    the colour's and the oil's carries and carryCourant now cross the solve's own
    faces, `THIN_FACE`, as the ferrofluid's did: a Finger's solid is where the drag is
    least even, 15b; off a thin gap the carries keep their Rhie–Chow faces, exact on
    the old plate's even projection); and the face fluxes' upwinding squares off a ring under a fast
    radial flow (the pressed rings in the picture). A staggered grid takes all three,
    and `dampGrid`'s job.
  - ~~**18a-9, the CPU engine.** Thin Gap is WebGPU only; the CPU fallback ignores it.~~
    Dropped: the owner decided to delete the CPU solver's stepping (2.6, 2026-10-06; 3.1).
  - **18a-10, the in-plane viscosity.** The viscosity stage (0.91 ms) still runs with
    Thin Gap on. In a gap it is the Brinkman correction to the drag, of order h²/L²
    against it; measure whether any look shows it, and drop it for the time if not.
  - **18a-11, the cost measured (shipped).** Measured 2026-10-07 on the Mac with `npm run stages`
    over alternating 20-second runs at 768² and 512² (`docs/judging.md` §19):
    At 768²:
    - `thinGap=false`: a solver step is 31.7 ms whole (16.5 ms Layer 0, 15.2 ms Layer 1;
      `project 1` + `project 2` = 6.7 ms/layer, `advect velocity` = 1.2 ms/layer), achieving 20.4 steps/s.
    - `thinGap=true`: a solver step is 67.8 ms whole (51.1 ms Layer 0, 16.7 ms Layer 1), achieving 11.4 steps/s.
      In Layer 1, `thin gap` projection is 7.3 ms (44% of layer), roughly parity with the Navier-Stokes
      projection + velocity advection it replaces (6.9 ms + 1.2 ms = 8.1 ms).
      The bulk of the cost difference is Layer 0's conservative height-advected dye transport
      (`advect dye` 36.1 ms vs 1.3 ms).
    - In-plane `viscosity` (18a-10) costs 1.52 ms across both layers (1.53 ms Layer 0, 1.47 ms Layer 1).
    At 512²:
    - `thinGap=true` with `steps=60`: a solver step is 19.7 ms whole (12.7 ms Layer 0, 7.0 ms Layer 1)
      and drawing 6.8 ms, yielding 32.8 steps/s at 33.4 ms/frame (~30 fps).
    - `thinGap=true` with `steps=30` (H2b): frame time drops to 19.2 ms (52 fps) with 27.5 steps/s (92% speed),
      advancing 2.38e-2 liquid/s (+33% over 60 steps/s).
    Thin Gap does not need any look turned off: on the 512² hosted ceiling it runs smoothly at 33 ms/frame,
    and H2b at 30 steps/s delivers 52 fps.
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
  - **18a-13, tilt sloshes the liquid: shipped** (the owner, 2026-10-20: tip it one way
    and then the other and the colour should slop and mix). A shallow-water dish on the
    CPU (`lib/slosh.ts`) fed by the owner's tilt alone, its flow added to the thin solve's
    velocity after the solve, behind a new **Slosh** dial at 0 (the plate as it was, bit
    for bit; `npm run slosh`). How it was found and measured is in
    [`docs/plan-shipped.md`](docs/plan-shipped.md) §18a-13; the owner's eyes on the pace
    are `docs/judging.md` §58. Shortcuts, each named in the code, and the items that
    replace them:
    - **18a-13a. Two layers: shipped** (2026-10-22). Oil lenses ride the water at their
      capillary thickness, read from the plate's own oil each frame, with the two-layer
      laminar drag between them; the dish moved to the GPU (`gpu/slosh.ts`). Plate Rock's
      swing tips it where Frame Sway lets the frame move (`rockAccel`; how the rock itself is
      driven is 27f-2's). A kick's glass presses the dish over the same radii it presses the gap
      (`kickPress`: the sheet's one dent off the frame-moving looks). Story in
      `docs/plan-shipped.md` §18a-13a; `npm run slosh`, `npm run sloshgpu`.
    - **18a-13b. The rim's boundary layer.** The rim is free-slip; a real dish's wall
      holds a thin layer still and sheds a vortex when the wave turns there. The
      drag too is the covered gap's (12ν/h², Poiseuille between two walls), where a
      layer with a free top drags at 3ν/h², four times weaker, and water's Stokes
      layer at slosh frequencies is thinner than the gap (about 0.25/s against the
      0.33/s used). It moves the pace the owner judges in §58, so replace it before
      tuning `SLOSH_LEAN` against it.
    - **18a-13c. Drawing the depth.** The dye does not feel the depth (the dish moves
      it, it does not thin where the liquid is shallow), so a wave never shows as a
      brighter crest or a lamp-lit slope. The dish now writes the depth of both layers
      for the plate (`WebGPUSlosh.depth`, the solver's `sloshDepth`): red the depth
      over rest, green the oil's share. What draws it: Beer–Lambert through the
      depth (a crest holds more dye) and the lamp's light bent by the surface's
      slope and focused by its curvature (a shadowgraph, brightness against
      −D∇²depth). The display pass is at WebGPU's sixteen textures, so the depth
      rides in a spare channel (the derive pass's alpha is free) rather than a new
      binding; touches the plate shader, so `pops`, `straw`, `ferrolook`, `mixer`,
      `grainedge`, `lampzero` and a `look` render.
    - **18a-13d. A shock-capturing scheme: shipped** (2026-10-22). HLL fluxes over
      hydrostatic reconstruction, MUSCL with the MC limiter, Heun in time: a dam
      break runs at Stoker's speed, two cells wide, and no energy is made. Story in
      `docs/plan-shipped.md` §18a-13d. Still: no Coriolis or centrifugal term, and the
      CPU film ignores the slosh.
    - **18a-13e. Hold Gravity's moves out of the slosh.** The dial is hand-only, but the
      tilt it follows is Gravity × Tilt Direction as the plate sees them, so a look
      (Lava Lamp has Gravity 1), Evolve or a patch on Gravity slops the liquid too. If
      the owner wants only the hand's own tilt, keep the hand's value apart from the
      applied one and feed `sloshAccel` that. Also the phone's tilt reaches the dish in
      screen axes while Gravity's direction is turned by the turntable's angle, so with
      the plate turned a tipped phone slops at that angle; Plate Rock's `ext.x * 1.1`
      does the same. Turn both into the fluid frame together.
    - **18a-13g. Lenses that move and pull back.** The dish reads where the oil is
      from the plate every frame and holds each lens at its capillary thickness: a
      lens has no inner wave and one stretched thinner does not dewet into droplets.
      Carrying h₁ in the dish (its own mass equation, the plate's oil following it)
      and a disjoining pressure would let the dish move the lens's outline itself.
    - **18a-13h. One press, not two.** A kick's glass presses the thin gap
      (`pressKick`, lib/squish.ts) and the dish (its head) at once, so near the glass
      the liquid is pushed out twice. The one-press answer: the dish takes the gap's
      squeeze as its source and the gap's own push goes. Moves what `npm run squeeze`
      measures, so it wants the owner's eyes on Beat Squeeze first (27f-3).

### 18b. The lamp shines through the dye (replaces paint over black)
**Partly shipped**: Lamp Ground is built (#256) and the looks that go on the lamp are chosen by rule (18b-1, #262); its byte-for-byte line at 0 runs on the CPU rasteriser since 2026-10-11 (`npm run lampzero`, 19z). What is open is below, from 18b-8 on. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

- **18b-8. The dishes too deep for the lamp.** Eighteen looks are dishes by their own
  description but fail the rule with the dye they were given for black: on the lamp the
  dish goes black (ink over 30%) and the colour goes with it: Classic, Deep Ocean, Acid
  Trip, Bass Drop, Boiling Point, Fractal Dream, Velvet Underground, Neon Coral Reef, Oil
  Wheel, Macro Bead, Cell Bloom, Glycerine Drift, Oil & Water, Magnet Garden, Ferro Paint;
  Jellyfish Bloom and Lacing Run keep under a tenth of their lit colour; Agate keeps 46%
  of it. Several say outright that
  they are lit from beneath (Deep Ocean, Jellyfish Bloom, Velvet Underground, Oil Wheel,
  Magnet Garden), so on a real projector they would be on the lamp. Each wants its dye
  thinned for the lamp (Dye Budget, or the dish's own amounts), judged by the same rule,
  rather than the black ground keeping it: a look stays dark on a projector only by being
  deep dye (18b-2). One look at a time, `lamp-gallery` before and after.
- **18b-9. The rule's colour gates on a look with no colour.** `lampjudge`'s lit-colour
  gates (20% of the dish, 0.6 of black's) fail any look that has no colour on either
  ground, which is a graphite or ferrofluid look's whole point; Sensual Laboratory failed
  them and the owner put it on the lamp by eye. Hold such a look (lit colour on black
  under a fifth) to its contrast instead, the spread between its dark dye and the platen
  on each ground, and see whether the rule then agrees with the owner unaided.
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
- **18b-6. Light through a film, not the whole gap (for 20b).** *Shipped with 20b
  (#259) for the dye: the front plate's dye path is the gap less the clear film
  (`gapScale *= 1 − film` in the plate, from the packed view).* The path is the dye's
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
- **18b-10. Two projectors.** *Shipped (behind Two Projectors, on in Fillmore; `npm run lamp`).*
  The Two Projectors setting models two projectors aimed at the same screen, each
  filtered by its own plate. Shortcut: each projector's exposure is simply halved
  (exposure normalisation) so clear glass stays at one lamp's level. Outside the back
  plate's disc, the second projector still lights the screen there.

### 18c. A pour adds liquid, not only colour

**18c-1 shipped** (a bottle's pour is volume on a thin gap; `npm run flush`, judging §43; story in
`docs/plan-shipped.md` §18c). Left, each its own PR:

- **18c-2** The colour's own drops as volume. A bottle's deposit is volume now, but the
  colour each tool lays with it (`autoInject`, `addDensity`) is still stamped with none,
  and so is the automation's colour. A water or dye bottle pours both, so the push is
  there wherever a bottle is held, but a look that only drops colour pushes nothing and
  flushes nothing. Give the dye's splat a volume as the species' has (one more
  `pourVolume` per drop); a look change in every look, so judge it on the Mac.
- **18c-3** Retire the Pour's, the splash crown's and the Splatter's radial velocity kicks
  for their volume: a kick is curl-free and the solve deletes it. Gate the splash on
  K = We·Oh^−0.4 above about 2100 from `dropHeight`, not on any energy above 0.02.
- **18c-4** An oil drop as a lens or a film by the spreading coefficient
  S = γ_w − γ_o − γ_ow (the bottles carry σ now, 18d-1), with 18d-3.
- **18c-5** The held pour's rate is one number, a dropper's 0.5 mL/s (`HELD_POUR`,
  `src/lib/liquidProps.ts`), whatever the tool and the Amount. A Pour should let go more
  than a Dropper, and the Amount should be the rate.

### 18d. Each liquid has its real properties (replaces the property scalars)

**18d-1 shipped** (each poured liquid's own viscosity on a thin gap; `npm run thick`, judging §42; story in
`docs/plan-shipped.md` §18d). The rest of 18d is these items, each its own PR:

- ~~**18d-2**~~ Flushing, not fading: shipped with 18c-1 (`npm run flush`). Nothing fades
  the species; it leaves over the open rim when pours push it there, and the
  automation's headroom for a thick bottle reads the GPU's share (`speciesShare`, once a
  second). The colour still fades (18g), and the CPU's body still fades on the old plate.
- **18d-2a** An automated look that pours glycerine keeps it until something pushes it
  out: its headroom stops it at 0.3 of the dish, and only a bottle held or the
  automation's own pours of water and soap flush it (Velvet Underground pours no water),
  until 18c-2 makes the colour's drops volume. Judge Glycerine Drift, Deep Ocean, Aurora
  Borealis, Velvet Underground and Lumia over ten minutes on the Mac (judging §43).
- **18d-3** The oil's and silicone's own viscosity. Their phase (mix.r, Oil Tension) is
  as thick as the clear liquid round it. Take its share into hsPrep as the ferrofluid's is.
- **18d-4** Density into the tilt's buoyancy. The species carries Σ share·ρ, and nothing
  reads it yet. It would replace the CPU's `weight` and SINK.
- **18d-4a** Restore or pack density when 18d-4 buoyancy lands. In 18j, species channel 2
  (formerly density, read by nothing yet) was traded for optical scatter $\mu_s'$ to avoid
  adding a second species PingPong texture and preserve 18d-11a's 6.73 ms paired carry.
  When 18d-4 lands, pack density alongside scatter (or into packed velocity/phase) or expand
  species.
- **18d-5** Soap and alcohol into the GPU's surfactant with a σ(Γ) law (the bottles now
  carry σ). Delete the CPU Marangoni force and the dye multiply, and give alcohol its burst
  and evaporation. Its description still says it "rises through water".
- **18d-6** Retire the colour-difference tension (Immiscibility). It is a look change.
- **18d-7** Milk's `repel`. Milk is a miscible emulsion, so this goes to 18j (scattering).
- **18d-8** Retire the CPU fields (soap, body, repel at 192²) and their pass once 18d-2 to
  18d-7 have moved each to the GPU.
- ~~**18d-9**~~ #355 The index into 18e's refraction: the derive pass's optical path reads the species' Σ share·n (`pouredDn`), measured against the shelf's own indices by `npm run derive`. The display's deflection does not read it yet: 18e-2.
- **18d-10** The species is not in FieldCarry, so a rebuilt solver loses it, and now that
  nothing fades it the loss shows: a governor's move drops every poured liquid. Carry it.
  On the old plate (Thin Gap off), the CPU body drag is still the thickness.
- **18d-11** The cost on the Mac. ~~**18d-11a**~~ shipped: the species rides the colour's
  own carry (`bodyAdvectPairSub`, `npm run thick`; story in `docs/plan-shipped.md`).
  On CI's Mac it halved: 6.73 ms a step at 768² against 13.54 alone, half the colour's
  carry where it was all of it. The other half is the species' own texels (rgba32f, nine
  reads and a write a cell a substep). Left: read the owner's Mac with `?debug` (judging
  §43) against 18d's budget of 0.5 to 0.7 ms; if it is still over, the next halves are
  the species' bytes (its density and index channels are carried but read by nothing
  yet, 18d-3 and 18d-9: hold them until those land, or pack them) or carrying it at
  half the grid (its own carry again, and hsPrep reading it up a level).
- **18d-11b** The same pairing for the other carries that ride one flow: Oil Bodies
  carries the colour and the oil's share of it in two passes through the same faces
  (`advect dye`, bodiesOn), and under the maze's flow the species still takes a stage of
  its own (the colour goes in the maze's sixths there, not carryPlan's substeps). Found
  in 18d-11a; Oil Bodies' pair would save a whole carry on every look with Oil Bodies.
- **18d-12 shipped** (each liquid pours its own colour, a dye picked tints it;
  `npm run natural`, judging §44; story in `docs/plan-shipped.md` §18d). Found with it:
  - **18d-12a** The automation's pours of a bottle (`pourLiquid`, the look's own liquids
    and an area's) lay the liquid and no colour, so a look that doses syrup doses clear
    syrup. Give them the bottle's own colour (amber syrup, white milk, gold oil) as the
    hand's pours have; a look change in every look that doses a coloured bottle, so judge
    it on the Mac.
  - **18d-12b** Soap and Silicone still clear any colour where they land, a dye picked for
    them included: the CPU's dye multiply (18d-5) thins whatever dye is under the soap,
    and cannot tell the soap's own dye from the plate's. On a thin gap their pour is
    volume and pushes the colour aside, which is the real clear disc; deleting the
    multiply there (18d-5) is what lets a dyed soap show its dye.
  - **18d-12c** Milk is laid as a white body (its `scatter`), which is milk seen by
    reflected light on the black ground. On the lamp's ground real milk throws a warm grey
    shadow, and a dye in milk is a pastel, not the dye: both are 18j's scattering.
- **Found:** at the plate's 6 mm rest gap, a liquid as thin as water has a drag time of
  about 3 s, so for a second or so it moves as a free liquid, not a Hele-Shaw one. Alcohol
  in a thick look read 14 times a pool of colour, where Darcy's bound is 2. That is right
  for 6 mm, but real light-show glasses sit closer, which is a question for 18a's rest gap.

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
**Partly shipped** (#355). What shipped: on projected looks, the front plate's edges come from projector pupil aperture loss and shadowgraph Becke line doublets, from the optical path OPL = n·h and its Laplacian in the derive pass. n is water's 1.333 plus the oil (1.47), the film, the poured liquids' own indices from the species field (18d-9) and a named stand-in for the dye (d·0.015·dyeGain: a dilute dye barely moves the index, and the shelf gives dyes none); h is the gap. A separate Projector Focus control (Settings, desks, MIDI, remote, the phone's Looks sheet; 0.5, in focus, by default, so every look is as before until it moves). Painted specular highlights are gone from projected looks and stay on camera and closeup looks. Named shortcuts (each in `refractionOptics`' notes and the archive): the deflection from the dye's slope, not ∇OPL (18e-2); dyeGain, a contrast gain on the step; the pupil overlap a smoothstep against `DROP_NA` 0.25; the shadowgraph's gain max(1, boundaryContrast·2) and edge mask; the back plate's painted line (18e-1); the dye's stand-in index d·0.015·dyeGain; no heat in n (18e-3). What did not ship is below (18e-1 to 18e-4). Follow-ons (§31, 2026-10-11): **31a** gives the defocus Δz a control that also blurs whichever dish is out of focus; **31d** evaluates the shadowgraph per band with each liquid's dispersion. Shipped story and measurements in [`docs/plan-shipped.md`](docs/plan-shipped.md) §18e. Open:

- **18e-1. Layer 1's painted boundary line (a painted shortcut until 31a separates the two dishes' heights).** On projected looks with `derivedOn > 0.5`, Layer 1 keeps a painted boundary line (`edge1 * boundaryContrast * 1.6` from `smoothstep(0.1, 0.6, length(near1.xy))`, gated on `fluid1.a > 0.03`) alongside `refractionOptics(near1, 0.0, 0.0, 0.0)`. At default `projectorFocus = 0.5`, both dishes currently sit at Δz = 0 so the shadowgraph Becke term is 1 and `refractionOptics` only darkens by pupil loss; without the painted line on Layer 1, the back plate's Screen vs Multiply separation in `npm run mixer` falls to 9.9 (bar > 10, 11.0 on main, 10.3 with the line), while applying that brightening to Layer 0 clips the 90th-percentile thin-dye rim in `mixer`'s single-dish mid-grey contrast check (`129.5 → 136.4` without it, `130.9 → 134.7` with it). Replace the painted line when **31a** gives the upper dish its inter-dish focal offset Δz₁ in the projector cone.
- **18e-2. A clear pour's edge, and the deflection from the optical path.** The aperture's deflection is worked out from the dye's air-masked slope (`θ ≈ |∇density| · 0.35`, weighted by Edge Relief × plateAmt, plus `bEdge · boundaryContrast · 1.1` shaped by `smoothstep(0.25, 1.0, uB) * 0.78` at a hue-gated two-dye boundary, refractionOptics note 1), and `refractionOptics` returns early where both are flat. So an edge with no dye across it, glycerine poured clear into water (Δn 0.14) or the oil's rim, reaches ∇²OPL in the derive pass but draws no line on the wall. #355 took the oil's painted rim (`|∇oil|·2.2`) off projected looks, so a clear oil drop with no dye across its rim has no rim line there until this ships (its 8% lens brightening stays). Deflect by ∇OPL instead (the derive pass would write ∇OPL in place of the dye's slope, and the camera looks keep theirs), then retune the dye's stand-in index against it. A look change: every look's edges move.
- **18e-3. The heat's index.** Water's index falls about 10⁻⁴ per kelvin, which is what makes a lamp's convection shimmer on the wall. The derive pass does not read the heat; with 18f.
- **18e-4. Edge Relief does not decide whether light bends.** On a projected look with the derive pass on, the meniscus slope's pupil loss is scaled by `reliefK = edgeRelief × plateAmt`, and is zero when Edge Relief is under 0.005 (`plate.ts`: `reliefK0` before the front plate's `refractionOptics` call, which scales the aperture's `smoothstep(0, 1, u) · reliefK`). So Edge Relief 0 draws no refraction at a slope, though a slope in the gap bends the lamp's light whatever a dial says. Edge Relief was the painted meniscus's strength; on projected looks the slope's loss should come from the optics alone (`plateAmt` and the pupil's NA), and Edge Relief either leave projected looks or become a named contrast on top of that. A look change at Edge Relief 0 only; with 18e-2, which moves the same term onto ∇OPL. *Measure:* the lab's `derive` or `holeline` at Edge Relief 0 and 1 draws the same slope's loss within a stated share.

### 18f. Heat comes from the lamp, and a level plate has no "up"

**Shipped (#352):** In-plane thermal buoyancy is strictly gated on plate uprightness (zero on a level plate) with tanh saturation removed (linear Boussinesq). Heat source couples to the lamp dimmer with Beer–Lambert spectral absorption from the dye (using the plate's `lampThrough` decode) and a central hotspot (`1 / (1 + 2.5 r²)` shortcut). Newton cooling decays per-second with a real physical time constant in the tens of seconds (τ ≈ 12.4s via `heatDecay^(4*dt)`). Oil in `mixForce` is given physical buoyant density below water (ρ_oil ≈ 0.85), rising on an upright plate while wax sinks. Water viscosity drops ~2%/K, increasing thin-gap mobility under gravity. Shipped writeup in `docs/plan-shipped.md` §18f. Verified with `npm run heat` (9/9 checks).

Open follow-ups:
- **18f-1. Full per-channel absorbance across all passes:** decode RGB absorbance per channel for spectral heating across every look and pass rather than single-pass average.
- **18f-2. Bénard–Marangoni cells:** surface stress −∇T inside an existing force pass (replacing separate marangoniFlux dispatch) so that cellular convection patterns emerge without breaking soap/oil conservation.
- **18f-3. Convection shimmer (18e):** pack velocity channel z export into plate shader shadowgraph taps to render hot plume optical refraction and shimmer without disturbing raw `(u, v)` reads in `cellride`.
- **18f-4. Warm water thins only the water (a named shortcut, #352):** `tempVisc = exp(-0.02 T)` in `thinGap.ts` hsPrep multiplies the whole thin-gap mobility, so a warm cell of oil or glycerine speeds up as much as warm water. Water's viscosity really falls about 2%/K, but each liquid has its own slope (glycerine's is about four times steeper near room temperature, a mineral oil's roughly twice), and in a layered cell the temperature belongs on each layer's own viscosity inside the two-layer Poiseuille sum that already builds `filmDrag`, not on the product. Move the factor onto the water layer's viscosity in that sum (and give each liquid its own slope beside its viscosity in `src/lib/chemistry.ts`), and have `npm run heat` show a warm oil-over-water cell speeding up by less than a warm water-only one.


### 18g. Colour leaves by flushing, not by fading

**18g-1 shipped** (the open circular rim, $r \ge 0.5$, into the overflow trough; `npm run flush`, story in `docs/plan-shipped.md` §18g; #362). The rest of 18g is these items, each its own PR:

- ~~**18g-1**~~ Flushing, not fading: the open rim (#362). Dye is flushed out over $r \ge 0.5$ on a thin gap as pours add volume (`npm run flush`), with zero-flux Neumann boundary conditions across `OPEN_RIM = 0.5` in `dyeDisperse`, `dampGrid` and `slumpStep` so diffusion and grid damping do not bleed dye across the rim, and a radial zero-gradient boundary condition at `OPEN_RIM` in `hsBody` so the cleared trough does not create a spurious buoyancy step at the rim. The dye-budget regulator is kept as a named safety cap pending 18c-2 (pours add volume).
- **18g-2** airExclude and the standing bubble pump: replace the destructive multiply with volume-fraction exclusion.
- **18g-3** capDye and solvent evaporation: model real evaporation as solvent loss leaving a coffee ring at the rim, rather than dye loss.
- **18g-4** r16f flux pass: carrier-thickness field for evaporation and liquid volume fraction.
- **18g-5** Remove the dye-budget regulator safety cap once 18c-2 (pours add volume) ships and looks cannot saturate.
- ~~**18g-6**~~ An oil body touching the open rim no longer drains through it by its own surface tension: the rim is held at the oil's Laplace pressure, not the water's zero (CAPILLARY, rimLaplace; `npm run rimhold`, a lens at the rim 9.6% → 97.1% kept over six seconds). Story in `docs/plan-shipped.md` §18g.
- **18g-7, open. A lens against the rim on the diagonal loses about 0.13% of its oil a second whatever its tension** (found building 18g-6: at a hundredth of Clock Glass's Oil Tension the lens laid against the rim at 45° kept 99.6% over the last three of six seconds, and over twelve seconds lost 1.8%; at the middle of the grid's edge it loses none). The oil past the rim grows by the same amount, so it is carried or relaxed across the rim's staircase cells, not pushed by a pressure: the mix's own Cahn–Hilliard relaxation (mixRelax/mixMu/mixUpdate read their neighbours past the rim with no rim condition) or the carry's faces there. Measure which first (oilBodies 0, the relaxation off), then give the mix the rim's zero-flux condition for its chemical potential, as dyeDisperse's diffusion has.
- **18g-8, open (a shortcut named). The gap's own curvature, 2σ/h across the gap, is not in the solve.** The thin gap's surface tension is the in-plane curvature alone; across an even gap the other curvature is the same everywhere and moves nothing, but where the gap changes (a press, a domed plate, and the cover glass's edge, where the gap opens into the reservoir) it pushes a non-wetting oil body toward the deeper liquid (Dangla, Kayi & Baroud 2013, drops moved by gradients of confinement). So whether a body at the rim is drawn out under the cover's edge into the reservoir, or held there by its in-plane interface as 18g-6 now has it, depends on a term the solve does not have. Add it as a force from the gap's gradient, σ·c̃·∇(2/h), and measure a lens in a wedge against the confinement speed before it is let near the rim. And the rim sets no contact angle: 18g-6's held pressure assumes the body's interface carries on past the rim, so the angle it meets the rim at is the grid's. At the middle of the grid's edge clampP mirrors the oil's blur (about 90°) and a lens there spreads along the rim (13.8 → 37.8 cells' worth of oil on the rim's cells over six seconds, review of #455); on the diagonal it draws itself off the rim (8.3 → 1.2), so part of what `npm run rimhold` reads as held there is a lens that has left the rim. A contact-line condition at the cover glass's edge (a pinned or angled interface, Gibbs' criterion at a sharp edge) belongs with the gap's curvature here, since both are what happens to the interface at the cover's edge.

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

### 18h. Dye diffuses physically; heat its own kappa (replaces isotropic diffusion)
**Partly shipped** (#357): single explicit finite-volume stage (`dyeDisperse`) replaces 4-iteration isotropic Jacobi diffusion; molecular diffusion $D_m \approx 4\times 10^{-10}\text{ m}^2/\text{s}$ holds sharp edges; water thermal diffusivity ($\kappa \approx 1.4\times 10^{-7}\text{ m}^2/\text{s}$) decoupled from dye diffusion slider; limiter handles mass conservation correctly; measured by `npm run dispersion` (6/6). How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

Left from 18h, each its own item:

- **18h-1. Flux-form dye transport and removal of MacCormack clamp.** The dye advection stage currently uses MacCormack backtracing with neighbor bounding clamps, which causes minor mass drift (~0.4% over 60 steps) under shear flow. Moving dye advection to a conservative flux form across faces will allow removing the clamp and guaranteeing exact mass conservation during both advection and dispersion.
- **18h-2. Dye spreads along the flow (visible streaking).** On show timescales ($t \ll 25\text{ hours}$ across 6 mm gap), shear dispersion is in the unsteady pre-asymptotic regime ($\sigma^2 \approx 0.2 v^2$). This draws the dye out into visible streaks along the flow. It requires a multi-layer or sub-stepped flux scheme to model the flow's shear without capping the dispersion at the explicit face flux limit.

### 18i. Bubbles and beads live by physics, not timers

**Partly shipped** (#358): Bretherton lubrication speedup ($U_b / U = 1.5 / (1 + 2.26\text{Ca}^{2/3})$ with ratio falling dynamically with flow speed $U$), unagitated Brownian wander removed (treble acoustic vibration drives isotropic 2D wander scaling with agitation), Saffman-Taylor finger wavelength scaling on the Straw ($m \propto R \sqrt{\text{Ca}}$), Reynolds/Chesters thin-film drainage merge ($t_\text{drain} \propto (\mu / \sigma) R_e$ with restored 0.98 resting push so foam rafts remain stable), and bead viscous pancake lag ($2U / (1 + \lambda)$ with default $\lambda = 1.5$ yielding $0.8\cdot U$). Measured by `npm run bubblephysics`. How it was modeled, tuned shortcuts ($1.5\cdot U$ premise, $b_\text{eff}$ gap scaling, and $t_\text{drain}$ film factor), and measurements are in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number. Open:
- Expose physical-only pop mode as a user setting (`timedPops = false`).
- Rim drainage when bubbles reach the dish boundary.


### 18j. Milky liquids scatter (shipped)

Shipped in #353 (2026-10-10): optical scattering packed into `vel.w` from species channel 2
with conserved flux-form advection; Kubelka–Munk diffuse backscattering on black ground
yielding opaque white milk and pastel food dyes (PLAN §4); two-flux forward extinction
with Rayleigh-Gans wavelength dependence and narrow aperture loss casting a warm dark
projector shadow on lamp ground with a soft forward halo; byte-for-byte identity for
zero-scatter liquids. Story and measurements in `docs/plan-shipped.md` §18j.

### 18k. Smaller ones

- **Thin-film colour:** the film's thickness is the dye's opacity ×16 plus drifting
  noise, through a cosine rainbow at 85%. The physical Airy table (`filmTable.ts`,
  `filmPhysics`) exists and is 0 in every preset. Real film colour in transmission is
  faint (0–8%), so a strong rainbow is a look and should be named one. The honest
  version is a transported film-thickness field driven by the soap. **Planned as §32**
  (a draining soap film in reflection; its check is written first). Cost: about 0.2 ms.
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

### 18l. A dye has more than one colour (replaces the perfect filters and the three-dye rule)
**Partly shipped**: finite dyes, depth drawn, the hue-keeping grade and five dyes on the plate (#281). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

- **18l-4. Three widened looks read fewer colours on the survey's plate:** Acid Trip
  (146 → 138; its exclusion blend inverts where dyes overlap), Fractal Dream (42 → 38)
  and Sunny Side Up (92 → 79). Look at them on the Mac (judging §37) and reorder or
  trim their families if they read muddier.
- **18l-5. Magnet Garden keeps Transmission 0.5.** With depth drawn the thin gold
  between its ferrofluid domes goes pale and rivals the white points on their tops
  (`npm run spikes`: 16 tops lit against 7.8 places half a pitch off, where the check
  asks for three times as many; 4.0 off at 0.5). The ferrofluid looks' own pass should
  decide whether its water should be deeper or its points brighter at 1.
- **18l-6. The mixer's grades are measured at Transmission 0.5.** At 1 the lab plate in
  `npm run mixer` brightens (its brightest tenth 146 to 198 of 255) and contrast at 1.8
  carries that tenth into white, so the spread reads 1.30 times against the bar's 1.3
  (1.50 at 0.5). The grade shots pin 0.5; re-derive the contrast line on a plate whose
  bright end has headroom at 1 (a dimmer lamp or a lower frontBright), then drop the pin.
- **18l-7. Poster 1969 keeps Transmission 0.5.** At 1 the pigment's grain (#267) varies
  the depth of its strong inks on the lamp enough to fleck the edges (`npm run grainedge`
  4.1% of edge pixels, the line asks under 2%; 0.6% at 0.5). Decide with the grain's
  owner whether a deep ink's grain should swing its colour less, then drop the pin.
  (`npm run royopen`'s black control is now scaled to an opaque ink, since a dye's
  strongest band passes 4% a unit: at that strength the control printed dark grey.)
- **18l-1. Real dye spectra (the shortcut kept).** Still three bands: a dye's colour is
  three transmissions, and the 4%/96% limits stand in for the tails of a real absorption
  band. Spectral Optics' six bands cannot reproduce the palette's saturated colours (its
  bands are too wide: hot pink comes out 0.66/0.32/0.41), so it is no replacement as
  it stands. The real thing is each dye's absorption spectrum (smooth bands, fitted so
  the dye at one unit is its palette colour) mixed wavelength by wavelength and summed
  through the CIE matching functions, which turns yellow over blue green as paint does;
  it needs either more dye channels in the solver or a smooth three-coefficient basis
  for the absorbance that stays closed under mixing.
- **18l-2. The packed dye caps absorbance at 8.** `packDye` stores each channel
  √(d/8) in 8 bits and clamps at 8, so a dense pool of a dye that blocks a band
  (absorbance 3.2 per unit now, 6.2 before) saturates that channel's store at a density
  of 2.5 and the decode's per-unit colour lets the band back in. Belongs with 14i's
  float dye for the plate (and the pixelation work, #267).
- **18l-3. The thin floor.** The decode still clamps the depth it draws at 0.35 to 4,
  so the thinnest wash is not paler than a third of a unit and the deepest core not
  deeper than four; inside that range the colour is the stored absorbance exactly. A
  thinner floor reads as a milky halo on the black ground; on the lamp ground (18b) the
  depth is not clamped.

### 18m. A drop slumps under its own weight (replaces a drop that sits or blurs)
**Shipped** (#364): a pool of dye on a level plate runs out along the lower glass as a
viscous gravity current (`wgsl/slump.ts`, its own stage in the dye's step, apart from
18h's blur), measured against Huppert's law by `npm run slump`. How it was found, built and
measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number. Open:

- ~~**18m-1. The slump's cap (a speed shortcut).**~~ **Partly shipped** (#371): replaced
  the viscous-only cap with a per-cell regime switch `min(viscous rate, inertial rate)`
  using the Huppert–Simpson front Froude number `Fr = 1.19` (`Fr √(g′η(1 − η/b))`,
  Huppert and Simpson 1980) in `slumpRate`, planned `substeps = Math.ceil(most /
  SLUMP_FACE)` up to `SLUMP_SUBSTEPS = 20` in `fluid.ts` (covering 1024² at Heavy dye 1),
  and kept `min(a, SLUMP_FACE)` (`0.24`) in `slump` as a stability guard (`npm run slump`
  13/13, including deep heavy pools on 768² and 1024²).
- **18m-1a. Implicit backward-Euler slump step and grid-independent inertial flux.**
  #371's `min(viscous, inertial)` is a regime switch inside the explicit pass, not an
  implicit step, and keeps two shortcuts: (1) the pass is still explicit forward Euler in
  at most `SLUMP_SUBSTEPS = 20` substeps planned against `SLUMP_FACE = 0.24` at `DYE_CAP`,
  with the per-face `min(a, SLUMP_FACE)` (`0.24`) stability guard in `slump`, rather than
  an unconditional backward-Euler solve `(I − Δt ∇·K∇)A = A^n` with lagged K on the thin
  gap's multigrid with an identity term — `SLUMP_SUBSTEPS = 20` covers up to 1024² at
  `solutalBuoyancy = 1` at 60 Hz (`mostInert ≈ 4.57`, 20 substeps of `≤ 0.23`), so the
  `min(a, SLUMP_FACE)` guard binds only when `ceil(most / SLUMP_FACE) > 20` (a slow frame
  with `dt > 1/60 s` on a 1024² heavy-dye water plate, or a locally deeper squeezed gap
  where `η(1 − η/gap)` exceeds its rest-gap value); and (2) writing the inertial front
  speed `u_f = Fr √(g′η(1 − η/b))` into the diffusive rate as `K_inert Δt/Δx² = u_f Δt/Δx`
  assumes the front drops across one cell Δx (`K_inert = u_f Δx`), rather than
  propagating the front at `u_f` independent of Δx. Replace the explicit substeps and the
  `min(a, SLUMP_FACE)` guard with the lagged-K backward-Euler multigrid solve and a
  Δx-independent inertial front flux.
- **18m-2. Coloured water in oil is a puddle, not a current.** Dye Weight at 1 says the
  dye is water in an oil (15% heavier), and two immiscible liquids do not mix into a
  gravity current: surface tension holds the pool at its puddle height and it stops
  spreading. Today it slumps on as if miscible (×1.27 further at 20 s). With 18d's
  liquids (an interfacial tension per pair), stop the current at the capillary height.
- **18m-3. Weight from what the liquid is.** Δρ is the dye's strength times Dye
  Weight's contrast. The species carries each poured liquid's real density (18d-4), and
  the ferrofluid's share of a cell is read as water. Take Δρ from the species, and the
  ferrofluid's share out of the current's room as the oil's is.
- **18m-4. The lobes.** A real pool's front is lobed; this one is round. On a still
  plate a viscous current's front is stable (Huppert's own pools were round), so the
  lobes are the plate's: the drop landing off true, the glass not flat, the lamp's heat
  (18f) and the flow streaking it (18h). Look again once 18f and 18h are in; build
  nothing for them here.
- ~~**18m-5. The grid filter makes dye at a drop's rim.**~~ **Shipped**: `dampGrid` takes its clamp's excess back across the 7×7 neighbourhood around the stencil (`dampGridCurv`, `dampGridLimit`, `dampGrid`); story and numbers in [`docs/plan-shipped.md`](docs/plan-shipped.md).
- **18m-5a. Run `npm run slump` with the grid filter on.** Now that `dampGrid` holds the glycerine drop's dye (`+0.000%` at 2 s and 20 s, against `+0.93%` and `+3.20%` before; `+0.42 ppm/s` on `npm run grating` §4 against `+1.47 ppm/s` on `main`) and does not move the front (`3.94 mm` at 2 s and `4.50 mm` at 20 s, against `4.13 mm` and `4.66 mm` before), turn the grid filter on in `scripts/slump.mjs` and fold the glycerine drop conservation check from the 18m-5 PR into `npm run slump`.

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
**Partly shipped**: `gallery.yml` now runs only by hand or on a PR labelled `gallery`, and `closed.yml` cancels a merged PR's queued runs. The measure after a day's PRs, and more Mac runners (19g), are below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

*Measure after:* `npm run macqueue` over a like window once a day's PRs have run: the
gallery's share should be its labelled runs only, and the shards' mean wait below 19
minutes for the same number of open PRs. Left for the owner, since only a setting or a
bill changes it: more Mac runners at once (19g).

### 19b. Measure is near its timeout, and its first red hides the rest
**Shipped**: Measure runs as three parts side by side, each step with `!cancelled()`, with `npm run wgsl` and the script syntax check in it. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 19c. Checks that can pass without measuring, and checks nothing runs
**Partly shipped**: the `wall`, `startup` and book-pairing reds listed as fixed are mended. The checks that can still pass without measuring, and the open lines, are below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

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
  **Partly done:** `npm run rewall` (S15's wall half) opens the projector window from the
  show and asks its mirror; a receiver (`?cast` with no opener) is still unchecked, and
  rewall's "frames reach the wall again" line runs in Measure, where no frames are drawn,
  so it prints rather than asks until a Mac shard runs it.

- ~~`wall`'s busy phase half a refresh behind cannot see the gate turning down the show's
  own next frame on a runner whose two windows are handed different refreshes~~ **Done:**
  built that mutant (`rule: 'half-show'`) as a control in `scripts/wall.mjs` arithmetic,
  and added an in-app check line on its own clock (`m.gate.frame >= 0.8 * m.hz`) that sees
  it and fails cleanly if show frames are turned down.
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
- ~~`startup`'s reds on PRs that never touched the opening, after #242~~ **Fixed
  2026-10-04 (this PR).** Of the thirteen startup reds of 3-4 October, eleven were a
  PR's own (#241's, #242's, #261's `spinSwirl`) or read lines since mended (#235,
  #241, #242, #254). Two were neither. 1b's ratio read 5.28× on #257's run (37216108435):
  the control asked all 47 inside a 2.02 s stop of its own long task, then its frames
  stopped 16.27 s from 0.33 s later while the GPU compiled them, a stop no build sat
  in, so unpriced. A stop begun within a second of one the builds sat in is now the
  same compile (18.29 s; the show's own 1.36 s held to the control's 0.71 s, 0.58×). Only a priced stop the builds sat in opens that second (#278's check-skeptic, fixed in its follow-up): a stop that only followed no longer passes it on, so runner stalls cannot chain into the control's compile.
  And the half behind the show ran out of `gpu/prepare.ts`'s thirty seconds with 52 of
  54 built (37209299356; 21 to 24 s on the other four runs, and growing with the
  list): that cap is now per build behind the show, so a list nobody waits for is
  finished rather than left to compile on the frame. *Still open:* 4b's hold, since
  #249 asked for the display first, is the GPU process compiling it while Chromium
  readies the page (2.92 to 4.00 s on the four runs since #254, against a 4.5 s cap
  and 1.54 to 3.50 s before #249): the page's own compile inside the window 4b excuses
  as Chromium's. A compute kernel first would put it back; it costs the opening the
  display's seconds at the end.

*Fix:* `CRASH_GPU=1`; `songs` into Measure; `shelf`, `sw` and `bubbles` on a Mac shard,
or written into CLAUDE.md as by hand; `check.mjs` reading `scripts/*.mjs` paths as well
as `npm run` names. Each new check held red by the `check-skeptic`.

### 19d. The build and what it ships

- ~~`startup` 1b, "nothing to compare", after #283~~ **Fixed 2026-10-05 (this PR).**
  On #287's merged head (37252828490) the control built its 47 on its first step at
  3.23 s, its frames kept coming, then stopped 9.98 s from 5.59 s with no build in it
  and more than a second after them: nothing priced, its own wait 13.80 s, and both 1b
  lines red. When the frames stop after the builds is the GPU process's business, so
  no window of time is right. A stop is now also the compile when the first submit to
  run one of the pipelines built on the frames was handed over before it began and was
  done as the frames came back (within a quarter second), with the page's own timer
  running through it: a pipeline cannot run before it is built, the page's thread is
  free while the GPU compiles, and a runner's stall later has no first use out through
  it. Line 2 now also needs a one-device control, as line 1 did. Each stop prints its
  first uses and the page's longest silence in it. *Still open:* read the first Mac runs' prints to
  see the follow stop (#283's run: 11.27 s from 5.20 s) carries first uses too; if it
  does, the one-second window is that same compile and could go.
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
**Partly shipped** (#245): the first three notes of docs out of step with the code are fixed. What is left is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

*2026-10-04 (#245):* the first three below are fixed (the order of work replaces "What
comes next"; the openings and §12's table say what is built), `docs/judging.md`'s numbers
were made unique in #230, and the order of work's "one home" table says where each
piece of twice-written work lives. Left: the flaky-check notes in §0 and §11 (their home
is now the order of work's 0.3), `docs/roadmap.md`, the dispatch counts in
`docs/webgpu-plan.md` and `docs/evaluation-2026-09.md`, and `README.md`. CLAUDE.md's
"about 38k" tokens for this file, which was about 75k, is corrected here.

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
**Partly shipped**: Measure in three parts, the reach filter for docs-only PRs, the evened shards and the deploy's skip of a second Mac run are in. What is left is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

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
  **Read 2026-10-05, both-low twice in 350 runs since 10-03** (deploy 37233245217
  attempt 2, fc7dcc3, 10-04 22:35Z, the open shard; #230's PR run 37134515660, 10-03
  16:16Z, tools): A 0 and B 0 under the fingers and at their mirrors, yet "each lay it on
  every step" passed both times (A 28 steps, 222 dye, B 27, 214, 7.9 a step), and the
  plate gained −10 of the 435 it was handed. So the hands laid and the plate kept none of
  it: not the touch path. Two leads. The fingers sit at one height (110 px) but land on
  cells of different heights ((93, 43) and (53, 64); (138, 64) and (97, 43)), so the plate
  was turned under the view when they were picked; and the 435 went somewhere between the
  lay and the readback (a clear, a drain or a look's fade landing in the window, or the
  readback taken off a plate that was rebuilt). The next red should print the plate's
  turn and the solver's step and clear counts across the window. Too big for the
  2026-10-05 bundle of small fixes; left open here.
  **Cause found 2026-10-25 (4 reds of 169 Mac runs, 10-18 to 10-24): the check read the
  plate in the frames after a rebuild, the dye was not lost.** All four print the same
  states: 384² solvers #1 and #2 through the hold, 256² solvers #3 and #4 after it (the
  governor stepped the grid down in the 700 ms after the lift), "the plate gained −6 to −8
  of 411 to 570 handed it" from the snap, and in the same line each plate's own sums, read
  a moment later, at 435 to 595. A rebuilt solver opens on the plate its predecessor handed
  over on the GPU (`handOver`), but the CPU copy every reader sees (`readDensity`) is fresh
  until the new solver's first readback lands, and the snap read that. The check now waits
  for the same solvers on two looks and three readbacks since the first (up to 3 s) before
  it snaps; no bar, cell or hold moved. Named, not done: for those few frames after a
  resolution change every reader of `readDensity` sees an empty plate (bubbles, the
  regulator's reading); the app could keep the old reading until the new one lands.
  **Instrumented 2026-10-10.** The two reds' logs (jobs 111540991031 and
  111236251946) were read again: both fingers at (45, 110) and (345, 110) px, 0.0 cells
  from where they were picked, 69 and 89 readbacks, every other line of the phone check
  green; the PLAN's "different heights" is the dish's resting angle (the two pixels are
  300 px apart along a row, 45 cells apart on a dish turned about 150° or 210°), not a
  fault. No line in either job printed the app's rung. The red line now prints, before,
  while held and after: the engine and grid, which plate the hands lay on
  (`hands().layer`; Classic has two and the dye check reads plate 0), the clears and
  drains the loop took (`hands().clears`/`.drains`), each plate's solver (a number per
  solver object, so a rebuild shows) with its steps and readbacks, and every plate's gain.
  Leads, for when it next goes red: the other plate (gain on plate 1), a clear or drain in
  the window, or a governor move: `releaseGpu` rebuilds the dye from `gpu.readback()`,
  the last readback that *landed*, so every step laid since it is lost, and a solver
  that never landed one is put back to its seed (`restoreSeed`) whole. That last is a
  show bug on its own if it reads so (a grid move drops the last readback's worth of
  dye); a GPU carry of the dye, as `handOver` carries the ferrofluid, would end it.

### 19i. A green Mac result carries across a merge of main
**Shipped** (#429; carrying fixed in 19k, #502, since until then it asked for four shards where there were five and so never carried): a run whose tree differs from the PR's last green Mac run only in main's files, or in files no Mac shard reads, skips the shards as "carried", and the deploy gate follows the chain back. The story is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 19j. A merge with no site change deploys nothing
**Shipped** (#253): a merge that changes no site file deploys nothing, checking and publishing nothing and green in seconds (`npm run deploygate`). How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 19k. One manifest of checks
**Shipped** (#502): `scripts/checks.json` holds every check CI runs (180 steps, in order, with their comments), `checks.yml` runs each Measure part and Mac shard from it (`node scripts/checks.mjs --ci <shard>`), a PR whose Mac-reaching change is only check scripts, manifest entries or their npm scripts runs only those checks' shards, and `npm run quick` runs the checks a diff reaches, side by side. The story is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

Found with it: **19k-1** (the guard reads the manifest), **19k-3** (`actionlint` runs in Measure
from a pinned release), **19k-4** (Measure runs only the checks a diff reaches) and **19k-5** (the
side-by-side reds) **shipped**, with the two reviewer nits on #504 (the stories are in
[`docs/plan-shipped.md`](docs/plan-shipped.md), under the same numbers). Open:

- **19k-2** (E, S): measure what 19k claimed, over the next 25 merged PRs after #502: Mac minutes
  on check-only PRs (the replay over #433 to #497 said 1,325 then, 275 under the rule), Measure
  wall time on the check-only and document-only ones (19k-4: before it, every PR waited for the
  slowest part, 12 to 19 minutes), and merge conflicts in `checks.json`, `checks.yml` and
  `package.json` (60 adjacent merges replayed with `git merge-tree` before it: 9 conflicted,
  none in those files). `npm run macqueue -- --hours 24` and `npm run flakes` read the first two.
  **Interim, 2026-10-27, three PRs merged since #502 (#504, #506, #508): too few to say.** None was
  a check-only PR that the rule could narrow: #504 changed `checks.yml` and `reach.mjs`, so it
  rightly ran every shard (5 Mac jobs, 85 runner-minutes, slowest Measure part 23.3 min, the run
  37 min wall with the queue); #506 changed the plate and ran every shard (80 runner-minutes,
  slowest Measure part 22.1 min); #508 was one Markdown file and skipped the Mac (0 minutes, as
  before 19k) but its run started at 02:24Z, seven minutes before #504 merged, so it ran all
  four Measure parts (slowest 23.7 min) and says nothing yet of 19k-4. `macqueue` over the last 24
  hours: 3,124 Mac runner-minutes, 175 PR shards waiting 7 minutes on average, 77% of the minutes
  in green PR runs. No merge since #502 touched `checks.json`, `checks.yml` or `package.json`
  except #504's own; no conflict in them has been reported. Leave this open until 25 PRs have merged;
  the first check-only PR after #504 (the one that put these numbers here) is the first real
  sample of the rule. The per-PR numbers above were read by hand over the API (a PR's head
  commit's `Checks` run and its jobs' times); a `--prs` mode in `macqueue` would make the next
  reading one command, if 19k-2 stays tedious. `npm run flakes` (2026-10-20 to now, 320 runs)
  still has the startup check's first line red 22 of 203 attempts (11%), unchanged by 19k.
- **19k-6** (E, S): **shipped**, Measure's lab part split in two. A full lab part ran 22:10 of its
  25 minutes on 2026-10-27 (main's deploys 24:52 and 23:29, a PR's full run cancelled at the
  limit), so the next full deploy was likely to go red and not publish. `lab` keeps the slosh
  dish, the soap film's control and `holeline` (about 12 min); the new `lab2` has `lampzero`,
  `bubblelook` and the four account checks (about 10). Both install Chromium; the timeout stays
  25; the required names `Measure` and `WebGPU (macOS)` are unchanged, since `reach`, `selectMeasure`,
  `deploygate.sh` and the guard read the part names from `shards.measure`. Open: the browser part
  is now the slowest of the five at 19:14, and holeline alone is 9.3 min; read both in `npm run flakes`
  / the job summary over the next merges and split the browser part next if it passes 21.

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

*Built (2026-10-26, this PR):* `scripts/chromium.mjs` launches headed into an Xvfb it starts
itself (`-displayfd`, so parallel harnesses never race for a display), with the GPU watchdog off,
when `PW_WEBGPU` is set on Linux and the harness asks (`present: true`: `tools`, `magnet`,
`mirror`, `bottles`) or `PW_PRESENT=1` does. Asked for, not the default: the first push made it the
default and CI's Linux lab part ran out of its 25 minutes, the twenty-odd checks that set
`PW_WEBGPU=1` themselves (`signin`, `tiers`, ...) each driving a live software plate, and
`intro`'s fade finishing 95 s late behind the first step. Those measure the page, not the plate. `scripts/frame.mjs`'s `engineQuery()` adds `&dpr=0.25&steps=60` there, and two waits:
`waitForEngine` after the opening, `settlePlate` for every other wait in `tools`, `magnet`,
`mirror` and `bottles`, the wall clock on a GPU exactly as before and, in software, also a share
(`PW_STEP_SHARE`, 0.05) of the steps the Mac's sixty a second would take.
*What was found on the way, Chromium 153:* headless still loses the device at the first present
(a bare canvas: lost at once headless, thirty frames headed). Headed was not enough by itself:
the app's first full solver step (248 compute passes) holds SwiftShader's one GPU thread for
25 to 100 s, compiling as it first dispatches, and Chromium's watchdog takes that for a hang
and kills the GPU process, so the page lost its device, made a new one, reached the same step
and was killed again, for good. That is what `startup.mjs`'s "SwiftShader loses the app's
device every few seconds" was. With the watchdog off, the plate's frame reads back (mean 0.40
on classic, moving) and the plate makes about 0.4 steps a second at 256² and at 128² alike
(the cost is a step's dispatches, not its cells), against about sixty on Metal; the drawing
was 90% of a 1280×800 software frame (36 s), 2 to 3 s at `dpr=0.25`. `stages` read 0.7 to
1 s a solver layer a step. So a cloud session runs a Mac check's logic on a plate that moves,
at a twentieth of its steps, and not its magnitudes.
*Measured:* see the PR (tools, magnet, mirror, bottles here against the same commit's Mac shards).

#### 19l-2. The first step's stall on a cold compiler (found with 19l)

The opening builds its pipelines ahead and uses each once (`gpu/prepare.ts`), and still the
first full step, in software, spends 25 to 100 s in first dispatches before it finishes; the
page's frames wait behind it (`npm run intro`'s fade took 95 s to finish headed). Whether a
cold Metal cache pays a smaller share of the same on the owner's machine after a deploy that
changes a shader is not measured: `npm run startup` on the Mac, with STARTUP_COLD=1, reading the
first step's GPU time apart from the prepare's, would say. *Size:* S to measure.

#### 19l-3. The other app checks, asked one at a time (found with 19l)

Four harnesses presented (`present: true`) and waited in steps (`settlePlate`) after 19l. The
twenty-five others that read the app's frames still launched headless on Linux; `PW_PRESENT=1`
tries any of them headed. Each wants its own pass: its opening wait through `waitForEngine`,
its waits through `settlePlate`, and a cloud run beside the Mac's to say which of its lines agree.
*Size:* S each.

*Built (2026-10-27):* eight more opted in, each run here at the same commit (`PW_WEBGPU=1`, three
at a time on 4 cores, 5% of the Mac's steps): `take` 9 of 9, `ferro` 7 of 7, `ferrodrift` 6 of 6,
`finger` 2 of 2 (these agree with the Mac's), `bubbles` 26 of 30 and `depth` 8 of 10 (the
failing lines wait on the plate having developed for nine of the Mac's seconds, 540 steps, here 27:
"the plate holds nearly still while it is photographed" read 61% of pixels moved, "the show is
running" wants two steady seconds, "switching it off puts the plate back" is a magnitude),
`handpour` 26 of 31 (the bank's size against what a pour raised the mean by, and the slider's
ordering, are magnitudes of a pour at a twentieth of its steps), `kickbubbles` 8 of 12 (all its
"releases no bubbles" and layout lines agree; the four that count kicks reaching the bubbles
"at least 15" in a listening window read 1 to 3, the window being the wall clock's).
What it took: `take` read a toast that goes in a few seconds, so its wait after the first stop is the
wall clock, its note waits 30 s in software, and it waits for the engine again after its reload;
`kickbubbles` skipped itself unless a Mac drew, and its clicks and canvas lookup waited out
Playwright's 30 s behind the plate's first step; `handpour`'s `waitForShow` has five minutes in
software, not one.

*Left out, and why:*
- `spin`, `flick`: they read the dish's angular velocity in radians a *wall* second after a flick,
  and the flick's impulse is gone before the first step lands (front plate 0.000 rad/s for 17
  readings, `flick` 6 of 8 red). Their claim is the frame loop's time, which software does not run.
- `swirlcost`: it is a frame's cost, which software cannot say.
- `render-app`: it records the whole song in real time, three renders in five hours here with no end.
- `startup`, `intro`: they measure the page's opening, which headed does not (19l's trap).
- `gallery`, `plates`, `shots`, `showreel`, `looks`, `film`, `moving`, `wall`, `evolve`, `controls`,
  `press`, `drain`: photographs, films or the Mac's own (CLAUDE.md), or not asked for.

*Found on the way:* `press` and `drain` have never run: both call `chromaglassDebug().seed?.()`,
and `seed` is the show's seed number (a number, so `?.()` throws), so each stops at its first line
that matters, on the Mac too. Neither is in CI. *Fix:* give the hook a function that pours the
opening dye (`reseed` exists beside `seed`), or drop the call; then opt both in. *Size:* S.

Still to do, each its own pass: the lines above that differ want either `PW_STEP_SHARE` raised for the
opening wait alone (a plate that has developed for nine seconds needs 540 steps; 27 are not it) or
a named step count in place of nine seconds, so a Mac and a cloud run develop the same plate.
*Done for `bubbles` and `depth` in 19l-4.*

#### 19l-4. A software plate develops the Mac's steps, on a clock that steps with it (found with 19l-3)

*What was found:* the step count was half of it. `bubbles`' "the plate holds nearly still while it is
photographed" read 21.5% of its pixels moved across *one* step (7.4 s of wall clock), 26.8% across
three (15 s), 34.3% across six (23 s), where the Mac moves 4 to 8% in its 72 steps: it tracked the
wall clock, not the steps. The frame loop moves the lamp's wander, the gel wheel, the dish's turn and
the phrasing by each frame's elapsed time (`realDt`), and a software frame is one step and two to
fifteen seconds of it, so a software plate was the Mac's with its lamp and dish run fast. More steps
alone would have made that worse, not better.

*Built (2026-10-27):* `?lockstep=1` (`LOCKSTEP` in `LiquidVisualizer.tsx`): each frame's elapsed
time is exactly the step it takes, so a software plate is the Mac's plate in slow motion. A harness
asks for it with `engineQuery({ lockstep: true })`, which a GPU never sends. And `developPlate(page,
ms)` in `scripts/frame.mjs`: on a GPU `waitForTimeout(ms)` exactly as before, in software every one
of the Mac's `ms × 60 / 1000` steps, for the waits a line reads the plate's age through: `bubbles`'
opening, its "let a look develop", its 1.2 s bracket and the 0.9 s in which a bubble opens its hole in
the dye (at three steps, 14 of 850 bubble pixels were lit), `depth`'s opening. Slow by design: 540 steps
took 62 to 80 minutes with two or three harnesses sharing four cores.
Two lines were wrong for reasons the slow plate showed up, both fixed so a Mac reads them exactly as
before: `bubbles`' floors on the pixels a bubble draws (3000, 800, 500) were counts in the Mac's
742,000-pixel frame, and a cloud frame at `dpr=0.25` has 46,375, so they are now the same share of
the frame read, never more than the Mac's (scale exactly 1 there); `depth`'s "the show is running"
read the last nine rows of a load timeline that stops at 400 rows (100 s), and after a developed
opening passed on rows from the page's first minute, so it now reads only while the timeline is
still being written.
*Measured, cloud (`PW_WEBGPU=1`, two harnesses sharing four cores):* `bubbles` 13 of 15 before (the
still plate 23,338 of 46,375 pixels moved; the three colour lines never ran, gated on the Mac's pixel
count), 16 of 18 after (the still plate 518 moved, 1.1%; drawn on 435 against a floor of 188); `depth`
8 of 10 before, 9 of 10 after ("switching it off puts the plate back" 1.221 against 1.220, red before;
"the show is running" red as the Mac-only line below, where a first run without the timeline's guard
had passed on stale rows).

*Still red in `bubbles`, open:* "it lets the lamp through rather than painting light on top" found 14
and then 32 lit pixels (the line needs forty pairs and brighter thick dye) and the bubbles 0 to -4%
brighter, where the Mac's are brighter: either the hole has not opened in the dye at 54 steps, or a
bubble a dozen pixels across at `dpr=0.25` is mostly its rim. A `look` render of a developed bubble in
the lab would say which. And "it is where the bubble was put" read 0.073 off (bar 0.06) on one run,
passing on the one before: its half-second wait now also waits for two of the plate's steps, since
the air field is drawn by the frame loop and half a second of software often holds no frame.

*What still differs, and why it is the Mac's:* `depth`'s "the show is running" asks for a step in
every quarter second of the wall clock, which a software frame loop never makes (the frame-rate
claim `spin` and `flick` were left out for). `handpour` (its banks against a pour's rise, the slider's
ordering) and `kickbubbles` (kicks heard per wall-clock window) were not moved: `handpour` opens every
preset and lets each settle six of the Mac's seconds, and at a developed count that is hours a
look; its lines are a pour's magnitudes at a twentieth of its steps. *Next:* try `lockstep` on the
other opted-in harnesses one at a time (`tools`, `magnet`, `ferro`, `take`, ...: whatever they read
of the lamp or the dish moved with the wall clock too), and whether `spin` and `flick` can be read
in show seconds under it. *Size:* S each.

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

- The open shard evened again: **shipped** (docs/plan-shipped.md 19r). New checks go on the
  shortest shard, not open, which holds `startup` (393 s alone).
- Re-running an older deploy cancels main's newest one: `deploy.yml`'s group keeps one run
  waiting, and the re-run takes that place. On 2026-10-05 re-running be02853's deploy
  cancelled e978aca's (#286) and 6bcbf8f's. Harmless while those were docs merges; a re-run
  should be of main's newest deploy, or the deploy should refuse a tree older than main.
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

### 19u. Nothing reaches main without the checks
**Shipped** (2026-10-10, a branch ruleset on `main`, not code): nothing lands on `main` without a pull request and green `Measure` and `WebGPU (macOS)`, and the admin's bypass works only on a pull request, never on a push. The ruleset, why those two checks, and what is left are in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 19v. Two checks that could not tell what they were asked
**Shipped** (2026-10-10): the magnet's drag is laid out on the plate, off its middle row, and the Stage sheet's Esc is listened for once (`hooks/useEscape.ts`). The story is in [`docs/plan-shipped.md`](docs/plan-shipped.md) §19v.

- **19v-1. The show keys' listener comes off and goes back 11 times a second.** App's
  keydown effect for Space, Backspace, 1–9 and the tool letters is keyed on `goLook`,
  `cueAny` and the rest, which App makes afresh as the sound re-renders it (measured: 11
  re-adds a second with nothing open). The same dispatch rule that could drop the Stage
  sheet's Esc (19v) could drop a Space meant to send a look, if an earlier window listener
  sets state on that key. Nothing ahead of it does today, so not seen; read its handlers
  through a ref and listen once, as `desk/Desk.tsx` and `useEscape` do.
- **19v-2. A ferrofluid pool dragged to the rim comes back with more ferrofluid.** Found
  by #349's first planned drag on the Mac (`npm run magnet`, run 38089915722): the magnet
  dragged a pool of 3.48% of the plate from 0.23,0.44 to 0.30,0.90, about 0.45 from the
  middle with the pool 0.157 across, and the plate then held 170% of what was poured,
  with nothing laid (phaseLays 0 → 0). The phase moves in flux form and should neither
  make nor lose it. Not known yet whether the rim makes it (the wall's boundary on the
  phase's flux, or the magnet's pull against it) or `readPhase` counts the field past the
  dish; the check now keeps its drag within 0.25 of the middle, where the old line went,
  so the rim needs a check of its own: a pool held against the rim by the magnet, its
  total read every second. Physics lane.
- **19v-3. The magnet check's second press landed on the plate bar.** **Shipped**
  (2026-10-17): Save's changed-look dot takes no width, so the bar at 1280 no longer wraps
  when a look changes and the plate stays under the hand. `layout` and `magnet` each ask it
  now. The story is in [`docs/plan-shipped.md`](docs/plan-shipped.md) §19v.
- **19v-4. Recording still re-wraps the plate bar at 1280, which sits on a 1 px edge.**
  **Shipped** (2026-10-25): Record's running timer on the desk (`RecordControls`) and on
  Play (`PhonePlay`) overlays its idle box and takes no extra width, so starting or stopping
  Plate video, a Take, or both never widens the button in the plate bar at 1280 or shifts
  Play's top pills. `layout` and `phone` each ask it now. The story is in
  [`docs/plan-shipped.md`](docs/plan-shipped.md) §19v.
- **19v-5. The plate bar at 1280 still has no slack.** What #470 left of 19v-4's ask. In Build
  at 1280 × 800 the bar's children and gaps take 935–936 px of its 936, the name already down
  to its 120 px floor. Record no longer widens it, but any text that renders a pixel wider
  (Geist arriving late, another platform's fallback) drops the plate by a row (about 42 px),
  mid-show or at rest, as Record's label did. Give the bar some slack at 1280 (a narrower
  floor for the name, or a smaller gap, whichever the `layout` check shows keeps the plate
  where the hand found it); the bar itself is not changed by this item's entry. Desk lane.

### 19w. A fifth Mac shard, so no shard runs near its timeout
**Shipped** (2026-10-11): the plate shard ran up to 19.8 of its 20 minutes and the other three 15 to 17, so a fifth shard took two to five minutes from each; replayed on 11 runs, the longest shard went from 18.4 minutes to 15.0. The measure and what moved are in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number. Next time a shard's median passes about 15 minutes, even them again before adding a sixth: each shard is a runner the queue has to find.

#### 19w-1. The deploy gate counts the fifth shard
**Shipped** (2026-10-17): `deploygate.sh` wanted exactly four green shards by name, so after 19w it trusted no PR run and every deploy re-ran the whole Mac, about 55 minutes from merge to live. It now reads the shard names from `checks.yml`'s matrix; replayed on the last 20 merges, the deploys it trusts went from 0 (plus 2 by rule 5) to 4 (plus 1). The story is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

### 19x. A moved bar names itself
**Shipped** (2026-10-11): CI fails a PR that changes a check's bar or input, or turns a check to assert the opposite (also commit by commit, #357's case), without naming it in the body under `Check changes:` (`npm run checkguard`, the "Check changes named" job under the required `Measure`; the protocol in `docs/handoff.md`). Over the 50 merges before it, 9 would have had to name something, every one a real edit of a check. The story is in [`docs/plan-shipped.md`](docs/plan-shipped.md) §19x.

- **19x-1. Bars declared where the guard can read them.** The guard reads code as written
  because every check writes its bar inline. The checks the physics lane edits most
  (`rides`, `physics`, `liquids`, `straw`, `slump`) could declare their bars in one object
  per file (`const BARS = { heavyTilt: 0.05, … }`) that the guard reads by name, so a bar
  computed from a variable two lines up is called a bar and not an input. One file at a
  time, each bar carried over unchanged and the guard's `--base` run proving it.
- **19x-2. Physics constants that are not SHOUTING_CASE.** The guard watches
  `const NAME = <number>` under `src/gpu/` (WGSL included) and any a script names; a bare
  number inside a shader's expression or a camelCase field of a preset is not watched, nor
  a new line that bends a measured value (`moved *= 1.3`) with nothing removed. Measure how often such a number moved under
  a red check in the last month of `antigravity/` PRs before widening it, since every
  widening costs ordinary physics work a line in the body.

- **19x-3. Measured quotes what it printed.** **Shipped** (2026-10-26, the owner's rule from
  the scorecard): the `Check changes named` job also fails an Antigravity PR (`antigravity/…`
  branch) whose `Measured:` has a command with no printed line quoted beside it, a group with
  no command, a script that is not in `package.json`, or no `Measured:` at all (`npm run
  checkguard`; the form is in `docs/handoff.md`). It reads the form, not the truth; the
  reviewer runs one script and compares. Re-based 2026-10-28 (the first draft sat red for two
  days on two unrelated Mac flakes and fell 35 commits behind): run against the bodies of
  #505 and #511, the two newest Antigravity PRs, the first version failed 28 and 37 lines
  that quoted exactly what their checks print (`PASS …`, `36/36 checks passed`, `all lines
  pass`, `adapter: apple`, a heading over quoted lines, a CI job id beside the command), so a
  printed line now also counts in those forms, and by being in the command's own script's
  source; a sentence of the writer's own ("it passed on 2026-10-26", "24 checks green")
  still does not. The code lives in `scripts/measured.mjs` (and the API reads in
  `scripts/checkguard-api.mjs`), so `checkguard.mjs` stays inside its size ceiling (19ai-5).
  Found by the review: run over `scripts/checkguard.mjs` itself, `npm run
  checkguard` still reads "it passed on 2026-10-26" as printed, because the self-test holds
  that sentence in a string literal; the lookup cannot tell a script's fixtures from what it
  prints (the other scripts' fixtures are the same risk, small, and the reviewer's re-run is
  the guard). Found along the way: `namedLines` does not read a
  `Check changes:` that is itself a list item (`- **Check changes:**`, how Antigravity's
  bodies write the whole block), so a named change under that form is not seen. It fails
  safe (red, never green) but costs a round; read it the way `measuredGroups` does.

### 19y. Compaction and helper models set from the repo, not the host
Found 2026-10-17: the 200k compaction window chosen on 10-12 was never in effect. A cloud
session's environment still carried `CLAUDE_CODE_AUTO_COMPACT_WINDOW=500000` with the
percentage override at 80, so threads compacted near 400k and sat at 130–380k for most
of their steps, each step re-reading all of it from the cache. And no agent in
`.claude/agents/` named a model, so a helper started from the most expensive thread ran
on that thread's model whatever the job was.

Changed: `.claude/settings.json` sets the window to 200000 in its `env` block (the
documented way a project's settings replace an inherited variable; it reaches the cloud
threads and the Mac's own sessions alike) and `CLAUDE_CODE_SUBAGENT_MODEL` to sonnet for
helpers that name none. `prepush-reviewer` and `check-skeptic` name opus (they judge);
`setting-auditor`, `preset-auditor` and `video-watcher` name sonnet (they read and list).

Measure: a session started after the merge shows the window at 200000 in its
environment, and its context compacts near 160k rather than 400k (inferred from the
percentage; to be confirmed on the first thread that reaches it). If the host's value
still wins, the window has to move in the environment's own settings instead, which only
the owner can change. Still open alongside it: 19m (PLAN.md as an index), now more
pressing, as the file is about 500 KB.

### 19z. A check that compares two compiled programs on a GPU asks the compiler
**Shipped** (2026-10-11): `npm run lamp`'s first line, every look at Lamp Ground 0 byte for byte against a lab built with the lamp's lines taken out, read "different: fillmore-1969 2" on the owner's M4 on main at b2ca7d7, the same one pixel on every run, 2 levels of blue, gone with the back plate or its grade off (`node scripts/lampwhere.mjs`), none different on software WebGPU and on the GitHub runner's Mac for the same tree, and none different on the M4 again once #353 had moved the shader. Metal fuses a multiply-add into one FMA when the product has one use; the lamp's back-plate branch keeps a second use of the back plate's values alive in the plain lab and is dead code in the control, so the two programs round the painted path differently, and one ulp crossed a threshold in the grain. The line is now `npm run lampzero`, two labs on SwiftShader (which has drawn them the same on every tree since 2026-10-04 and, as a conformance rasteriser, keeps the operations as written rather than fusing them by use count), in Measure on every PR as its own part, `lab` (the `logic` part has no Chromium, so #386's first run failed there on the launch, and the `browser` part already runs twelve of its fifteen minutes). The line reads back from the adapter that SwiftShader drew both labs, and from the bundles that the control is another program, rather than trusting the flags and the plugin. The lamp's physics stay on the Mac. The story is in the scripts' own comments.

- **19z-1. `npm run beams` compares two programs the same way, on the Mac.** Its first line
  holds the projector's pass against a lab built from the old pass, byte for byte, in the
  `tools` shard on Metal. It has not flipped, and the pass is small; when it does, move
  that line to Measure as lampzero was, with `openLab({ software: true })`.
- **19z-2. Measure's `browser` part is near its timeout again.** Found 2026-10-12 placing
  lampzero: the part ran 12:16 of its 15 minutes (the layout 2:49, the phone 3:14, a click
  in the app 1:04, the sound's renders 0:47, the intro 0:38, Chromium 0:30), the margin 19b
  split Measure to get back. The next Chromium check goes in a part of its own or splits
  this one as 19b did; until then a slow runner turns the part red with nothing wrong.

### 19aa. A flake tracker: each check's reds counted from CI's own logs
**Shipped** (2026-10-18): `npm run flakes` reads every run of `checks.yml` and `deploy.yml`
in a window (`--days`, `--since`, `--until`; 7 days by default), every attempt's jobs and
each job's log, and prints, per check (the runner's system, the command and the check's
name, since `renders` on Linux and on Metal measure different things), how many times it
printed FAIL, of how many, how many of those reds printed ok on the same commit in
another job (a floor on the flakes: the code did not change and the answer did), how
many were on main, and how many branches the reds came from (twenty-five reds on one
branch is that branch's change being caught; the same spread over eight is the check).
A re-run's copied jobs are counted once, jobs cancelled part way are read, and red jobs
that printed no FAIL line are listed by job. `--check <regex>` lists every attempt of
the matching checks with its detail. It is the 2026-10-17 audit by hand (657 red checks
over three weeks, a day of reading) as a script, and it exists now so the startup fix
(14v-6) can be judged on ordinary pushes. Reading, 2026-10-11 to 18 (219 runs, 1,892
jobs, about 80 s; logs cached in the temp folder): the magnet's two drag lines 27 and 26
of 130 over 15 branches (#373's leak), startup's opening 17 of 137 (12%, the audit's
11%), render-app's same seed 11 of 128, the band's renders lines 10 of 135 on the
laptop and 7 on the phone, tools' Blow 9 of 131, ferrodrift's "pulled in no more than in
silence" 7 of 134; Measure's logic job red 16 times with no FAIL line (type errors).
Not a gate and no bar: a rate depends on what was pushed.

- **19aa-1. Work the list down.** The magnet's drag lines wait on #373 (29c); startup's
  on 14v-6; the Blow on its paused root cause; render-app's "same seed twice draws the
  same frames" (11 of 128, 8 branches), the renders lines and ferrodrift's have no item
  yet and are next to read.
  Read again 2026-10-24 (254 runs, 2,722 jobs, the week from 10-17), worst first, with
  what became of each: startup's "no stop in the opening" 41 of 193 (14v-7, shipped);
  tools' Blow 13 of 187 on 12 branches (its paused root cause,
  `/mnt/project-files/handoff/blow-check-flake.md` is the owner's, not the repo's); the
  phone's double tap on Speed 10 of 173 (19ac-1, shipped); the magnet's two pool lines 9
  of 164 each, on 6 branches and green on the same commit only once (more a branch's than
  the check's: read before touching); the renders lines 8 of 191 each, every red on a
  runner drawing 14 to 22 frames a second where the line wants about 30 (19aa-6);
  startup's "moving for good no later than the old way" 7 of 193 (19aa-7); the phone's
  two fingers holding Drop 4 of 172 (19h-2, a solver rebuilt by the governor in the
  window is the lead). Two deploys went red on one-off Mac flakes on 10-24.
- **19aa-6. The renders lines on a starved runner (shipped 2026-10-24).** `renders` waits
  for the plate to draw fifteen frames in a second before measuring (the band's 8 reds of
  191 were all first windows at 0 to 14.5 frames a second), and the fader's line asks the
  Dimmer to change on nine frames in ten that were offered a new value and a quarter more
  than the desk's, where "twice the desk's" asked for more changes than frames below 20 a
  second (the first per-frame bar, 0.8 of the frames drawn, sat on the edge of a healthy
  plate: 0.79 to 0.99 in 48 windows). Story in
  `docs/plan-shipped.md` §19aa-6.
- **19aa-8. The Blow's push follows the solver steps, and the stroke gave it too few
  (shipped 2026-10-25).** `tools`' "and pushes the colour along, whichever way it blows"
  was red on 13 of 187 Mac runs in the week to 10-24. Over 28 Mac strokes the push
  correlates 0.73 with the wind steps the stroke laid and the CI Macs step 12 to 23 times
  a second, so a stroke of 1500 ms of waiting got 38 to 71 and the weak ones read
  -0.07% to +0.05% against +0.15%. The stroke now takes 3000 ms of waiting; nine strokes
  of one Mac run at three paces read +0.46% to +2.97% with no straw step. The paused hunt
  for why the app pushes less per step than the lab (the breath's share, the `still`
  threshold, the Dropper's bottle) is not answered: the toolAmount is 1, so
  `k = kRaw²` is 1, and the 0.75-cell `still` threshold is under the moves' one cell on a
  192 grid. Open: why the push has an offset of about 50 steps before it rises, and
  whether a Mac with fewer than 12 steps a second still reads under the bar.
- **19aa-9. Bottles' Splat with the Ferrofluid bottle, "not at its mirror" (read 2026-10-25).**
  3 reds of 183 Mac runs in the week, all on the Splat and on no other tool or the replays
  (0 of 183 for Dropper, Pour, Spray and Streak): two "not following the hand" (off it by
  0.041 and 0.056 over 24 and 32 pours, against the 0.04 bar) and one with 1 pour at the
  mirror (33 on the stroke, off it by 0.010; green on re-run). A Splat's first droplet is
  flung 4.5 to 27 cells from the hand, so the mean offset of 33 pours has a spread of about
  0.011 of the plate and 0.04 is out of reach of the scatter alone (0.14% a run for the one
  that read 0.041, nothing for 0.056), and a fling cannot reach the mirror (0.45 of the
  plate from the stroke, the fling 0.14). So something other than the hand poured ferrofluid
  on those three: the look's own ring (`layPhase`, from a look being laid or the plate
  coming up bare) is the lead, with the automation's Ferrofluid hand the other. The check's
  pour log did not say; it now prints, when the mirror or the hand's offset fails, every
  call that landed away from the stroke (where, its radius and amount, whether the
  mouse was down, how far from the hand) and the ring counter (`phaseLays`) on the first
  and last call. No bar moved. When a red names the pour, either mark it as the show's own
  in the log (the way the dye log marks `auto`) or hold the show off the plate for the
  window, as `__bottleTest` already holds `doseLiquid` off.
- **19aa-10. `npm run tiers` raced on Measure · lab (found 2026-10-25, fixed).** Its step-down
  nudge ("12. slower framerates suggest upgrading to Pro") is read after `forceStepDown(true)`.
  The hook set the engine status once and the next frame's own status replaced it: on software
  WebGPU `classifyAdapter` says 'software', `qualityLadder` has one rung, `failRung` has
  nowhere to go and `governor.steppedDown` stays false, so the card unmounted before the
  check read it ("locator.textContent: Timeout 30000ms"). Not reproducible by running the
  check (0 of 10 red on main in a cloud session, 0 of 6 after), so the nudge's presence was
  sampled every frame for three seconds after the hook: the card is there for all of them
  both ways, and the check, once it reads three seconds later, goes red 2 of 2 on main and
  passes 2 of 2 with the fix. The hook now keeps what it was asked (`forcedStepDown` in the
  loop's status), and the status in the loop reads it. A test hook only; the governor, the
  ladder and the real step-down are as they were. It touches no bar. `governor.ts` was not
  touched (#441, #474 and the #402 finish thread are in it).
- **19aa-11. The Mac `webgpu` check "the stage starts, with nothing asked for" (3 of 192,
  read 2026-10-25; two of them within twenty minutes that day).** `no stage` with no
  `gpuFailure`, 30 s after load, on the first page of the run only: every later page of
  the same run started at once. The same cold start as `startup`'s, but 30 s and not 3, and
  the line says nothing about which part stopped. It now says: the frames and engine the
  page reports, how long a fresh adapter request takes at that moment, and the page's
  errors. Not fixed, not retried (the owner turned a retry down for `startup`, 2026-10-24).
  The next red names it.
- **19aa-12. Phone: "a finger holding the Press lifts nothing until it comes off" read
  `held` once (2 of 177, 10-24 and 10-25).** `held` is the plate having pressed within 150 ms
  of the read, and a held finger presses once a plate step, so a stall of that length on a
  Mac stepping 12 to 23 times a second reads false while the press is held; both reds
  printed "held false over 10 steps" with the lift laid at the finger afterwards. It now
  reads six times across the same 600 ms and wants four held (a press laid once and not
  renewed reads one or two); the lift half is as it was. Judge with `npm run flakes --
  --check 'holding the Press lifts nothing'` a week after merge.
- **19aa-7. Startup's "moving for good no later than the old way" 7 of 192 (read 2026-10-25;
  the cause is not found, a breakdown is printed).** The 7 reds read the show's own wait 1.79
  to 3.04 s against the control's 0.74 to 1.07 s, and the show moving for good 2.4 to 7.6 s
  *earlier* than the control. Over the 192 Mac runs of the week the show's own ran 0.40 to
  3.25 s (median 0.78, 2.0 s or more on 8%), and the control's has the same tail (0.5 to
  3.4 s): the line holds one noisy residual to another's plus a second, so it goes red when
  only the show's tail lands. Ruled out from the logs: the opening's one wait for the GPU's
  first uses (`useWait`) is 0.00 s on all 192, so it is not the unpriced part; and the boot's
  warm compile (`first compile` row, 0.7 to 2.6 s on the reds) is mostly inside a priced
  build, so taking it off the show would count it twice (it correlates 0.25 with own).
  Not ruled out: the stretches that are neither Chromium's nor a build's are the page idle
  and waiting on a process that is not the page (which 14v-7 already sets apart for the frame
  gaps), or the page's own thread held (the three reds that printed it show 0.50 to 1.71 s
  held). The logs do not say which, so every run's 1b line now ends its own wait with the
  stretches that are neither Chromium's nor priced, how long they are and how much of
  that the page's timer ticked on time in (printed, not judged; no bar moved). The next
  step is to read that line on the week's reds and, if it is the page seen free, price it
  the way 14v-7 does the frame gaps, with the same synthetic cases. The reds are 4% of runs,
  so the week after this merges is the evidence.
- **19aa-2. `followview`'s timing (shipped 2026-10-18).** Red on #390's PR and its deploy
  and about 1 run in 6 in parallel (2 of 12 on main's code), on a line it should not
  have failed: the track panel's section against the band's. Three readings were taken
  at moments the check did not mean to measure: across a band section edge (the panel
  changes 0.0 to 1.8 s after the band, measured over twenty edges on four pages), in
  the seconds after the follower first locks (the line says 40 to 60% and the section
  can be the old one, or missing for two readings, until the line passes 75%), and the
  "at least 50% sure" read at the instant the line first appears (47% in one run in six).
  The readings now wait for 75% and for a spot 3 s into a section with 6 s left (and with
  the clock-since-tag section held off the band's, so the clock cannot agree by
  coincidence), the first reading must agree too (the panel lags the band), and the 50%
  is read on three further readings a second apart after five seconds. A frozen panel
  would have passed the single reading, so a new line follows the band into its next
  section, three readings in three. No bar moved. Over twelve parallel runs the old check
  was red twice and the new one green twelve times; a panel lagging 4 s went red 3 of 3
  and a panel frozen on one section 2 of 2. The app was not late: no panel was wrong
  once the follower had settled. Known limits: the follower's first place is not
  measured, and a confidence pinned at 100% while sure would pass the 50% line. Not
  tried: making the follower's first place better than 50-60% trust (the follower's own
  business, `songfollow`).
- **19aa-3. The API scripts never print the token (shipped 2026-10-19).** `scripts/ghapi.mjs`; `npm run ghapi`. Story in `docs/plan-shipped.md`.
- **19aa-4. `deploygate.sh` keeps the token off curl's command line.** It passes
  `-H "Authorization: Bearer $GH_TOKEN"` as an argument (`scripts/deploygate.sh`, the `api()`
  helper), and the owner runs it locally with `GH_TOKEN=$(gh auth token)`, so any process
  can read the token through `ps` while curl runs; bash prints nothing of it on a failure
  and Actions masks it, so it does not reach a log. Give curl the header on stdin
  (`-K -`, as `scripts/ghapi.mjs` does) and check with `npm run deploygate -- --history 20`
  that the same merges are trusted. Found by the check-skeptic on 19aa-3.

### 19ab. A shard's tool fetches are bounded, and the browser is cached

- **19ab-1. A slow download no longer reads as a failing check (shipped 2026-10-24).**
  Every shard fetched its tools inside the same clock as its measuring, so an unbounded
  download cancelled the harnesses at the job's wall and the red said nothing about the
  diff. Seen five times across four runs of one PR on 2026-10-22, on three different
  shards, none of them touching a check that failed:

  | shard | the step | took | warm |
  |---|---|---|---|
  | `browser` | Install Chromium | 650s | 33s |
  | `lab` | Install Chromium | 683s | 33s |
  | `sound` | ffmpeg (apt) | 1474s, 1471s | 22s |

  Both apt hangs were ended by the 25-minute wall rather than by finishing: between
  about 19:30 and 20:30 UTC the step did not return at all, and while that lasted **no
  PR in the repo could go green**, because the sound shard dies before its first sound
  check runs. The browser shard's own work is about eighteen minutes, so eleven minutes
  of cold download puts it at twenty-nine against a limit of twenty-five; the sound
  shard's is about three, so an unbounded apt buries it alone.

  Two changes, because the two halves are different faults. The browser is now cached
  (`actions/cache` on `~/.cache/ms-playwright`), keyed on the **Playwright version read
  from the installed package** and deliberately not on the lockfile's hash: the browser
  a version installs never changes, so the version is the whole of the dependency, while
  a lockfile key would discard the browser on every unrelated bump and pay the eleven
  minutes again. And every fetch now carries its own `timeout-minutes` — six for the two
  Chromium installs, four for apt's ffmpeg, five for the Mac's pip — so a mirror that is
  not answering fails as itself, with the step's name on it, in minutes rather than
  cancelling the measuring at the wall. `--with-deps` still runs apt for the system
  libraries, which the cache does not hold, which is why that step keeps a bound as well
  as a cache.

  Why bounds and not a bigger limit: raising the job to 35 would have hidden this and
  made a genuinely hung harness cost ten more minutes before anyone heard about it. 19w
  moved the *Mac* shards off their timeouts for the same family of reason; the ubuntu
  shards were never costed the same way, because their own work is steady and nobody
  counted the downloads in front of it. The Mac fetches were bounded here too, though
  none has gone slow yet, because the Mac queue is the one that costs.

  What a session should know when this goes red again: a retry is not a fix, and the
  two cases show it from both ends. The browser's cold install cleared on a re-run, so
  green by luck read exactly like green by merit; the apt hang never cleared, so three
  full runs were spent proving the thing that failed was not the diff. Measured by the
  steps' own seconds over the runs after this merge, and the cold path stays honest
  because a version bump changes the key.
  Found while measuring 0-tap (PR #429).

- **19ab-2. apt runs only for a library that is really missing, and a missing one fails
  by name (shipped 2026-10-24).** Two hours after 19ab-1 merged, `Install Chromium`
  timed out at its six-minute bound on #429's browser shard (run 40117937609): the
  mirror was sending 50 to 100 KB/s and had fetched 10 of 17 packages. The browser had
  come from the cache in 4 s; the 17 were `--with-deps`' apt, 8 upgrades of libraries
  already on the runner and 9 fonts (Japanese, Chinese, Thai, FreeFont, unifont) that
  nothing the app draws asks for. The job carried on past the red step and every
  browser harness after it passed, which is the proof the libraries were there.
  The two answers on offer were both wrong: `continue-on-error` on the apt step keeps a
  slow mirror green but lets a truly missing library turn up later as a harness's
  browser "closed" at launch, nothing naming it; a longer bound waits longer for fonts.
  Now `Install Chromium` fetches the browser alone, and `scripts/chromiumlibs.mjs`
  asks the runner what is missing: ldd over every binary of both builds (headless
  shell and full Chromium), then a launch of each. apt runs only when that fails, and
  if the check still fails after apt the step is red with the library's name, before
  the first harness. Found on the way: **Playwright's own check of this does nothing
  in 1.63** — it looks for binaries in `chrome-linux` while the linux-x64 builds unpack
  to `chrome-linux64`, and it skips itself for 30 days behind a `DEPENDENCIES_VALIDATED`
  file that the cache now carries from runner to runner — so before this, a library
  missing from Chromium's own binary was named only in the first harness's launch error,
  mid-shard, and one missing from a helper not at all. Measured in a cloud session: 13
  binaries checked, 3.4 s; with an `ldd` that reports `libatk-1.0.so.0` missing, exit 1
  naming it in both builds; with an `ldd` that fails, or no build in place, exit 1
  saying so. The two launches there both start the sandbox's full Chromium
  (`chromiumPath`), so the headless shell's own launch is first run on CI. The
  ffmpeg step keeps fetching every run (it is a real need) with apt's own retries
  and a 30 s stall timeout added.
  - **19ab-3. Open: the runner's fonts are printed, not held.** `--with-deps` pinned
    fonts-liberation and fonts-noto-color-emoji; they are on the runner today
    (its preinstalled Google Chrome depends on them), but an image that drops them
    would move the layout and phone checks' text measurements with nothing red. The
    step prints `fc-match sans-serif` and `emoji`; make it fail on a fallback that
    is not the one the checks were measured with, once CI's own reading is known.
- **19ab-4. ffmpeg comes from the Actions cache, and a cold fetch skips a slow mirror
  (shipped 2026-10-26).** 19ab-1's four-minute bound on the sound shard's apt made the
  outage legible but did not end it: on 2026-10-26 the step ran it out twice in an hour
  (#495's run 40350041600, #402's run 40358831181), and then `bands`, `songends` and
  `shape` failed on "no ffmpeg on the path" and `renders` on "no ffprobe on the path",
  four reds on PRs that touched no sound. Retries and a stall timeout (19ab-2) do nothing
  for a mirror that is slow rather than silent, and this PR's own first run measured it:
  the Azure mirror sent the package lists at 11 MB/s and then the 87 packages (62.8 MB)
  at about 55 KB/s, a second's wait per request, so apt would have needed some nineteen
  minutes. Now `scripts/debcache.sh` installs the `.deb`s the Actions cache kept (keyed
  by the runner image) with apt reading an empty source list, so a set that no longer
  fits (a dependency missing, or a downgrade, refused under `-y`) fails at once rather
  than downloading. On a miss apt only says which files; curl fetches them eight at a
  time from the Azure mirror, then archive.ubuntu.com, then us.archive.ubuntu.com,
  dropping a mirror that sends under 300 KB/s for 20 s and holding each file to apt's
  size and hash, and a last pass without the floor in case the whole network is slow.
  Ubuntu's own ffmpeg either way, so the shelf's MP3s are decoded by the decoder the
  sound checks were measured with. The step then requires `ffmpeg` and `ffprobe` by
  name. Measured in a cloud session on 24.04 with mpv standing in (14 `.deb`s): cold
  with the first mirror unreachable, 8.9 s; from the cache 1.5 s, no source asked; one
  `.deb` taken out, "unmet dependencies" then a cold fetch, 7.5 s; a file whose hash does
  not match, refused by every mirror and the step red naming it; an older `.deb` than
  the installed one, exit 100 and nothing changed; the floor, curl exit 28 after 5 s on
  a 40 KB/s transfer. On CI (#496, run 40365582373) the cold fill fetched the 87 packages,
  61 MB, in 1 s, installed Ubuntu's ffmpeg and ffprobe 6.1.1, and saved the set; the step
  took 16 s.
  - **19ab-4a. Open: drop the cache's `restore-keys`.** `cache-hit` is true only on the
    exact key, so when a new runner image restores the last image's set through
    `restore-keys` and it installs cleanly, the save step stores that same old set under
    the new key, and it rides forward image after image until an offline install fails:
    Ubuntu's updates to ffmpeg and its libraries never reach CI, which is not what "keyed
    by the runner image" says. Nothing goes vacuous (the decoder just stays fixed), and
    the cold fill measured 16 s for the whole step, so the fallback buys about 15 s once
    per image. Found by #496's review.
  - **19ab-4b. The warm path runs on CI (seen 2026-10-26).** #496's run filled cold, and so
    did #497's first (53 s for the step), though #496 had saved the set under the same
    image's key: an Actions cache saved by a pull request is scoped to that PR's merge ref,
    and other PRs read only their own and the default branch's. #496's deploy ran Measure
    on `main` and saved it there, and #497's next run read it: "installed from 87 cached
    packages, no mirror asked", 12 s for the step (unpacking 87 packages; no network). A
    deploy that skips its checks saves nothing, which bears on 19ab-4a: without
    `restore-keys`, PRs fill cold on each new image until a deploy that runs Measure saves
    its set.
  - **19ab-4c. Open: `--fetch` accepts only SHA256 and SHA512.** It takes MD5Sum and SHA1
    too; apt on noble prints the strongest hash anyway, so this is hardening, not a hole.

### 19ac. The phone's double tap on Speed is judged on two taps landing in time

- **19ac-1. The double tap's two taps carry a finger's times (shipped 2026-10-24).**
  `scripts/phone.mjs`; red on 10 of 173 Mac runs the week to 10-24, always
  `0.009 → 0.28 → 0.005`, because the harness's taps were stamped when the busy page took
  them (95 ms apart idle, 466 ms with the page busy 400 ms), past `DOUBLE_TAP_MS` 320.
  Now stamped 90 ms apart and sent 0.4 s apart, so only the stamps can make it pass, with
  a control stamped 0.6 s apart that must not reset. Story in `docs/plan-shipped.md` §19ac-1.
- **19ac-2. How long a tap on the phone's sheet takes to answer is unjudged.** The double
  tap now prints it ("handled N ms apart"); the old red implied up to about 400 ms on a
  busy Mac runner. Bound it where the phone's frame and renders checks live, from a
  measurement on the Mac, not from this line.

- **19ac-3. `bottles` counts the look's own pours as the hand's, and goes red on one at the
  mirror.** `WebGPU (macOS) · tools` failed `bottles` twice on one head (#533, which changes
  neither the bottle nor the tools), on two different lines: "splatter with the Oil bottle"
  (39 pours, 1 at the mirror) and "splatter with the Ferrofluid bottle" (37 pours, 1 at the
  mirror; the hand's flings 0.13 from the hand, nothing near the mirror), and passed on the
  third run. The stroke's mirror is 0.4 of the plate from it and a splatter's fling reaches
  about 0.07, so the pour is not the hand's: read it from `__bottleLog` with the call's
  `auto` flag and the look's lays, and count the hand's alone. Until then a lone pour at
  the mirror is this, not a flipped coordinate (that puts every pour there). Not yet shown
  from the log.

### 19ad. The `open` shard flakes on four unrelated faults

- **19ad-1. `WebGPU (macOS) · open` goes red on marginal timing and on a stray reading.**
  Seen twice on branches that could not reach it — PR #429 (which changes
  `scripts/tools.mjs`) and PR #444 (workflow YAML only) — and green on four other runs of
  the same shard across other branches in the same afternoon, so it is intermittent
  rather than a regression on main. Two different checks:
  `and it is moving for good no later than the old way was` read a
  **longest wait for a frame of 2.03 s against a 2.00 s bar** (2026-10-22), which is the
  kind of margin a loaded runner closes on its own; and
  `The ear behind the wall: and it hears on the wall's asks, one a frame, not on its own
  frames or the tick` read **61 ask, 0 frame, 1 tick over 61 frames asked for**
  (2026-10-24), where the single tick reading is the whole of the violation — one stray
  reading out of 61 fails a check written to allow none.
  Both want the same treatment and neither should get a looser bar first: measure the
  quantity over a run of shards to see what it actually swings between, and only then
  decide whether the bar is wrong or the app is. For the ear, find out whether one tick
  reading in sixty-one is a real path through the code (a first frame, a resize, a
  reading taken before the wall asked) or noise; "allow one" would be the wrong fix if
  the one is a genuine route. Found while measuring 0-tap and 19ab (PRs #429, #444).

- **19ad-2. The same shard failed with no check having failed, and with a check that is
  green seven times out of seven on the owner's Mac.** Two more presentations on PR
  #429, which still reaches none of them (it changes `scripts/tools.mjs` and this file).
  The first: the job ran 14m0s and died with `Bass Boost presses harder` having printed
  `10/10 ok` at 17:04:34, then **twelve minutes of no log at all** and `Post job cleanup`
  at 17:16:57. The API agrees and says more: step 25 `success`, and then **fifty-two
  steps with no record at all** — no `started_at`, no conclusion, never begun. Six steps
  succeeded, thirteen skipped. The runner stopped executing after a step that passed, so
  no check failed and no check was even reached; the Mac job's own `timeout-minutes: 20`
  was never hit either. The second, on the re-run: `draftwall` read
  `FAIL the dimmer still reaches the wall in Preview — wall dimmer 1` and finished 19/20.
  The reading is the **default**, 1, not a wrong value: the dimmer had not arrived, which
  points at the fixed `await page.waitForTimeout(400)` on `scripts/draftwall.mjs:153`
  being short of what a loaded runner needs rather than at the room settings not reaching
  the wall. That is a guess, though, and it stayed a guess: the check is green **seven
  runs out of seven** on the owner's Mac on this exact tree — four idle, and three with
  every one of the ten cores spinning on a busy loop — so the mechanism is not reproduced
  and the wait must not be lengthened or the bar loosened on the strength of the
  theory. What the four presentations have in common is the shard, not the check: each
  red has been a **different** check, never the same one twice, and `open` is the longest
  shard with the most steps (the comment above its `musicforce` step already notes a
  shard near its timeout). So the thing to measure is the shard, not any one of its
  checks: whether `open` is at the edge of the runner it is given, and whether it should
  be split the way the Mac shards already are. Until then a red `open` on a branch that
  cannot reach the failing check is not evidence about the branch. Found while measuring
  0-tap (PR #429).

- **19ad-3. The startup stall came back on a deploy.** The `open` shard's startup read a
  **2.72 s longest wait against its 2.48 s bar** on the 38f3c07 deploy (2026-10-24) and
  passed on one re-run. One more presentation for 19ad-2's question of whether the shard
  is at the edge of its runner; the bar stays where it is.

- **19ad-4. Measured: `open` is not at the edge of its runner, and is not split (PR #449,
  2026-10-24).** Every `WebGPU (macOS)` job from 2026-10-17 to 24, 210 per shard, read
  from the API. Green medians: plate 14.7 min (p90 16.6), fifth 14.2, show 14.1, open
  14.0 (p90 15.4, longest 17.3), tools 14.0, against `timeout-minutes: 20`. The five
  are within 0.7 min of each other, so `open` is neither the longest nor near its wall,
  and the runner-stopped red in 19ad-2 was not a timeout, nor is 19ad-3's startup stall. It does go red most: 54 jobs,
  against plate 9, fifth 14, show 22 and tools 27. But 38 of the 54 are one step, `The
  show opens without stopping` (`startup`, 14v-6/14v-7), then `The sound's renders, with
  a plate` 11, `The ear behind the wall` 3, and five others once or twice. A split does
  not change the rate of any of them, because none of them depends on what ran before
  it. It would cost a sixth Mac runner on every run, against the account's five at a
  time, so one shard of every run would wait for another to finish. What a split would
  buy is a cheaper re-run of a startup red (half a shard), and that is better bought by
  fixing startup. Revisit if a shard's median passes about 15 minutes (the 19w rule).

- **19ad-5. `bottles` goes red when one splatter fling lands at the stroke's mirror.**
  PR #525 (a copy and constant change that cannot reach the pour) failed `Every tool lays
  the bottle` twice running on the same head, 2026-10-28, on a different bottle each time
  and no other line: `splatter with the Oil bottle lays oil along the stroke`
  (31 pours, 1 at the mirror) and `splatter with the Ferrofluid bottle lays ferrofluid
  along the stroke, and not at its mirror` (30 pours, 1 at the mirror, three strays 0.12–0.13
  from the hand). Pour and spray with both bottles read 0 at the mirror every time. Both
  lines require `mirror === 0` of a stroke whose splatter flings drop within 0.14 of the
  plate from the hand, so any fling that crosses the middle can land inside `rad` of the
  mirrored path: the check asks the scatter's reach to stay clear of the mirror, which
  it does not promise. Do not loosen the bar first: count the flings that land at the
  mirror over a run of shards (`npm run flakes`) against how many a stroke's geometry
  allows, then state the bar as that (the mirror reading should be the hand's own
  flipped path, not the fling's reach). Seeded or recorded flings would settle it.

### 19ae. A phone check reads its dye across a plate rebuild and calls it a fault

- **19ae-1. `npm run phone`'s "two fingers holding Drop lay dye under both" picks its
  cells on one plate and reads them on another.** On #352's first deploy (run
  40121831306, the `show` shard) both fingers read **0 under it**: between the pick and
  the read the governor rebuilt the plate from 384² to 256² (solver #1 to #3), so the
  cells the check picked were not the cells it read. The re-deploy passed. The plate line
  the check prints on a red (`before:`/`held:`/`after:`, `scripts/phone.mjs` near its
  `plateLine`) already carries each reading's plate, so the check has what it needs to
  notice: when the plate's size or solver differs between the pick and the read, it
  should say "the plate was rebuilt between pick and read" and measure again on the new
  plate, not report FAIL with "0 under it". It must not pass in that case, and the bar on
  the dye under each finger stays where it is. Same family as 19ad (a red that is about
  the runner's moment, not the branch). Found reviewing #352 (2026-10-24).

### 19af. The repository's front page: a short README, the guide in docs/, a clean root (shipped 2026-10-25)

- **19af-1. Shipped.** `README.md` was 79 KB of every feature and control, which is what a
  visitor to the repository met first. It is now the front page (what ChromaGlass is, the
  live link, four screenshots, how to run it, where things are, the licence); the old text
  moved whole to `docs/guide.md` (same headings, so a section edited elsewhere moves
  across), and `docs/README.md` maps the other docs. The root lost thirty-odd one-off
  scratch files (`patch_*`, `test_dump*`, `scratch*`, `wait_ci*.sh`, `tmp_18.txt` and the
  like: nothing in `package.json`, a workflow, a script or a doc named any of them, and
  they stay in git history); `plan_comet.md` moved to `docs/plan-comet.md`. `dc.mjs` stays,
  because `checks.yml` parses it by that name. New feature and control docs go in
  `docs/guide.md`, not the README (`setting-auditor` and `CLAUDE.md` say so).
- **19af-2. Open, the owner's, GitHub settings a session cannot change** (the agent proxy
  refuses writes to repository-settings paths): the About description, the website link
  (`https://chromaglass.art`) and the topics. Suggested text is in the PR that shipped
  19af-1.

### 19ag. The site's security headers, and the dependencies' advisories (2026-10-28)

Found by the owner's security audit of 2026-10-28 (findings 11 and 18): `firebase.json`
sent no Content-Security-Policy, no frame-ancestors, no Referrer-Policy and no
Permissions-Policy, so anything could frame the show and a script injected into the page ran
with the visitor's licence key and sign-in in reach; and the root `npm audit` counted fifteen
advisories.

- **19ag-1. Shipped.** `firebase.json` sends, on every path: an **enforced**
  `Content-Security-Policy` of the four directives that cannot break a page this app serves
  (`frame-ancestors` for the site's own three names only, which the Auth iframe needs;
  `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`); a **report-only** policy of
  everything else (scripts, styles, fonts, images, media, connections, frames, workers),
  logged in the console and enforced by nothing; `Referrer-Policy: strict-origin-when-cross-origin`;
  `X-Content-Type-Options: nosniff` (the service worker's note on HTML served under a `.js`
  URL is the case); and a `Permissions-Policy` that names what the app asks the browser for
  (camera, microphone, screen capture, MIDI, fullscreen, window management, gamepads,
  clipboard, tilt) as the site's own and refuses the rest (geolocation, payment, USB, serial,
  HID, XR). `npm run csp` serves the built site with those headers, opens the show, the
  remote, a cast and the static pages with a blob worker, blob media and the lookups the
  app makes tried on top, and judges: nothing reported; the controls (http, eval, `<base>`,
  `<object>`, a data worker) reported or blocked; another origin cannot frame it; the
  Permissions-Policy parses in Chromium and allows what the app uses. It caught `bluetooth`,
  which Chromium does not know. `npm audit` is at zero: `npm audit fix` (vite, postcss,
  nanoid, browserslist and others), `esbuild` ^0.28.2 (a file read on Windows's dev server),
  and overrides for `@grpc/grpc-js` (^1.14.6, which Firestore's Node build pulls and the web
  app never loads) and `uuid` (^11.1.1, which Capacitor's `xcode` pulls). Judging §89.
- **19ag-2. Open, the CSP enforced.** The report-only policy keeps `'unsafe-inline'` in
  `script-src` for three inline scripts in `index.html` and the preload list the build writes
  into the page (`vite.config.ts`), whose text, and so hash, changes with every build.
  Enforcing needs the hashes in the header, which Firebase Hosting only reads from
  `firebase.json`: either the deploy job writes them in after the build, or the build emits
  the policy as a `<meta>` tag (no `frame-ancestors` there, which stays a header). Also before
  enforcing: the owner signs in with Google (the popup loads `apis.google.com`), plays a song,
  buys and activates a key on the live site with the console open and sends the violations
  that appear; and the Workers' real addresses (`connect-src` lists `*.workers.dev`,
  `lrclib.net` and Google's APIs; a custom domain would be reported). A report endpoint (a
  `report-to` route on the report Worker) would make that unnecessary; it is a Worker deploy.
- **19ag-3. Open, found along the way.** `Cross-Origin-Opener-Policy: same-origin-allow-popups`
  (the Auth popup keeps working with it; not added, as nothing needs it and the cast and
  panel windows use `window.open`); HSTS preload (Firebase Hosting sends a plain
  `Strict-Transport-Security` itself); the Mac app's own server sends none of these headers
  (`server/remote-server.js`); `desktop/` has its own lockfile and its own advisories
  (Electron, the audit's finding 7).

### 19ai. One domain loaded at a time: the rules, the maps, and the splits (2026-10-28)

The owner asked for coding sessions that use less context. Measured on a9dd9f2: `PLAN.md`
is 810 KB (about 200k tokens, more than a session's window), `LiquidVisualizer.tsx` 671 KB,
`App.tsx` 373 KB, the solver and its WGSL 291 and 290 KB, `SettingsPanel.tsx` 204 KB, and
`CLAUDE.md` 17 KB loaded on every step. The measurements and the ranking are in
`docs/architecture.md`; the rules every session follows are in `CLAUDE.md`.

- **19ai-1. Shipped.** `CLAUDE.md` gains *Where things live*, *Boundaries*, *Size budgets*
  and *Planning a change*; its checks table and CI account move to `docs/checks-map.md`
  and `docs/ci.md` with pointers left. 17.0 to 13.8 KB loaded on every step.
- **19ai-2. Shipped.** A `README.md` in `src/gpu`, `src/gpu/wgsl`, `src/lib`, `src/sim`, `src/hooks`,
  `src/components/desk`, `src/components/phone`, `server` and `scripts`: what each owns,
  its entry files, its contracts and its checks. A PR that changes an export updates its
  folder's README. Open: a check that each README names only files that exist; and
  `reach` and `quick` count a `README.md` under `src/` as a site file, so a PR that only
  edits one runs every Mac shard and deploys (this one did). Teach both that Markdown under
  `src/` is not built into the site.
- **19ai-3. Shipped.** `components/LiquidVisualizer.tsx` was 670,805 bytes, and 255 KB of it
  was module code above the component: the CPU solver `class FluidSimulation` (3,900 lines)
  and the constants, switches and helpers around it. They are in `src/sim/` now, unchanged
  (every non-import line of the old file is in the new files, counted line by line): the
  solver in `fluidSimulation.ts`, the grid and the solver's constants in `constants.ts`, the
  hands' and bottles' helpers in `tools.ts`, the step and its query-string switches in
  `stepping.ts`, the dice and the palette window in `dice.ts`, and the frame's shapes
  (`FrameView`, `PlateRenderer`, `VisualizerRender`, `FrameDigest`, the song shape) in
  `frameTypes.ts`. The component is 441,458 bytes. `hooks/useSongRender.ts` imports its
  types from `sim/frameTypes.ts` and no longer imports the component. Six checks read the
  solver's source as text from the component and now read it where it went: `cellride`
  (the step's cell clock), `oillift` (the step's rock), `pacing` (the paced clock),
  `panel` (the per-layer list against the solver), `plate` (the CPU gate, the closeup's
  ramp, and the retired looks' exemption, which follows `seedPreset`) and `turing` (the
  drift rates).
- **19ai-3a. Found along the way.** The review said `lib/stir`, `squish`, `plateRock` and
  `turntable` import types from the component; they only name it in comments. The one
  importer was `hooks/useSongRender.ts`. And 26 checks read `LiquidVisualizer.tsx` as text:
  a later split of the frame loop (the review's item 11) moves code those checks grep, so
  each piece moved has to be held against them the way this one was (a pattern that matched
  the old file and no longer matches the new one is a check that moved with the code).
- **19ai-4. Shipped.** `src/lib/checkHooks.ts` declares on `Window` every name the checks
  reach the app by: 44 (the plan counted 38), each with its shape, the file that sets it and
  whether it needs `?debug`. Types only; the setters keep their casts, so no setter moved.
- **19ai-4a. Open.** A setter that is next edited drops its cast and assigns
  `window.<name>`, so the declaration is checked by the compiler and not only read. The App
  ones go with 19ai-8 (`App()` into domain hooks), which starts after this.
- **19ai-5. Shipped: `npm run sizes`, a size ratchet.** A file not in `scripts/sizes.json`
  stays at or under 40 KB; a file already over it (52 on main at b38801e, 4.9 MB between
  them) may not grow past the bytes recorded beside it, nor past its size at the PR's base
  (so two PRs that each fit under a ceiling cannot land together over it), and new code for it
  goes in a module beside it. The baseline only shrinks against the base (HEAD^1 in CI: the PR's merge
  commit's first parent, or the main before a deploy's commit): a ceiling raised or added,
  or a new ledger, is red, and a big file renamed is a new file over budget. A file more
  than 4 KB under its ceiling is red, in a PR that resized it, until `npm run sizes -- --update`
  lowers it (on main, or for a file the PR did not resize, a note: two PRs that each trim
  2.5 KB must not turn the deploy and every open PR red), so a real move out banks what it saved, while a PR that trims a few lines does not have to touch the
  same line of `sizes.json` as every other PR in flight. Binary files and
  `package-lock.json` are not counted. Six **ledgers** that every PR writes in (PLAN.md,
  `docs/plan-shipped.md`, `docs/judging.md`, `docs/guide.md`, CHANGELOG.md,
  `scripts/checks.json`) are exempt by name until split. One manifest entry on the `logic`
  part, `always`; no Mac. Its self-test meets each rule's break in a scratch repository.
- **19ai-5c. Shipped with 19ai-3: a move carries its ceiling.** The ratchet's first real move
  (the solver, 194,508 bytes in one class, out of the visualizer) read as a new file over
  budget, and the owner did not want the solver cut into 40 KB pieces to pass a number (a
  class is not split by moving lines). So a pull request may add a ceiling the base does not
  have when the new entries hold no more than the bytes that left the base's over-budget
  files in the same PR, and each new entry is its file's own size. A file that appears over budget with nothing
  written in still fails as new, and an entry added with nothing taken out still fails as
  raised; what it lets through that the first rule did not is a rename that moves its entry
  with it, which costs a session the same. Five self-tests hold it, one the review of #548's exploit: the credit is the bytes that actually left the base's over-budget files in the PR, not the sum of their ceilings, so slack under a ceiling funds nothing. Whether 40 KB is the right
  budget for a new file at all is the owner's question, raised 2026-10-28 ("40kb seems
  somewhat arbitrary. I don't want quality to go down because of this").
- **19ai-5a. Open: watch what the ratchet costs a feature.** In the two weeks to 2026-10-28,
  App.tsx grew in 8 merged PRs, SettingsPanel.tsx in 8 and LiquidVisualizer.tsx in 7. Each
  such PR now has to move as many bytes out as it adds, wiring lines included. If that turns
  out to cost more than the splits save, the owner decides whether over-budget files get a
  small fixed allowance; until then the rule is the one approved.
- **19ai-5b. Open: the ledgers come out.** 19m (PLAN.md split by section) takes PLAN.md and
  the archive off the list; `docs/guide.md` and `docs/judging.md` want the same split by
  part of the app; `scripts/checks.json` could be one file per shard.
- **19ai-6** (M). `src/gpu/wgsl/fluid.ts` split by pass, as `thinGap`, `slump`, `spikes`
  and `film` already were.
- **19ai-7** (M). `src/gpu/fluid.ts` split into pipeline setup and per-pass encoding.
- **19ai-8** (M-L). `App()` into domain hooks: account and licence, set list, cast and
  projector, MIDI wiring, and the checks' hooks after 19ai-4.
- **19ai-9** (M). `SettingsPanel.tsx` one file per section, on the contract the phone uses.
- **19ai-10** (standing rule, no PR of its own). The frame loop (one `useEffect` of 5,469
  lines) moves out a piece at a time: a PR that changes something inside it first moves
  that piece to its own module, a function taking the frame's state with no per-frame
  allocation, in its own commit.

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
| A film that tears | Clear Film (20b, #259): a thickness field with a disjoining pressure, dust and a solvent, tearing on its own | A viscous film (20c), and the film pushing the water (20b-1) |
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
**Partly shipped** (#259): the Clear Film is built behind `clearFilm` and checked by `npm run lace`. What is left from it, each its own item, is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

Left from 20b, each its own item:

- **20b-1. The film does not push the water.** It is passive: where it thickens,
  the dyed water's path is shorter in the picture, but the water is not displaced
  sideways and the Hele-Shaw flow does not see a narrower gap. The real film is a
  second liquid in the gap; on 18a's solver it is a change of the water's gap (as
  a press is), which 20c's first way does anyway. *A shortcut named for speed and
  scope.*
- **20b-2. The film's carry assumes the water's viscosity** (the Poiseuille profile
  across the whole gap). A heavy oil film moves differently; 20c replaces it.
- **20b-3. Cost unmeasured on a GPU.** Two carries and twelve substeps of two passes
  a frame on 384², with a reach of two cells in `filmUpdate`. Measure with `npm run
  stages` on the Mac; if it is over 0.4 ms, fuse `filmMu` into `filmUpdate` through
  workgroup memory, or a stabilised semi-implicit step with a few Jacobi sweeps
  (fewer substeps). A slow frame takes at most twelve, so the film runs slower
  rather than unstable. *Named as a shortcut: the film's clock dilates on slow frames.*
- **20b-4. The packed view is full.** All eight numbers and now the film share the
  one texture the display pass can still bind (sixteen textures). The next field the
  plate draws needs a new home: a device limit raised where the adapter allows, or
  the reactions moved to their own pass.
- **20b-5. Only the front plate has a film.** The back plate (two-layer looks)
  carries none: its solver is handed 0, because the display reads the film from the
  front plate's packed view alone. Clear Film is on the per-plate list (`PER_LAYER`),
  so aimed at the back plate it does nothing yet.
- **20b-6. A rung below 384² tears coarser.** The film's grid is the solver's there,
  and the lengths are in its cells; at 1080p a 384² cell is about three pixels, and
  the still's smallest holes are a pixel or two.
- **20b-7. The dust does not turn with the glass.** When the dish spins (§22) the
  specks should go round with it; they are fixed to the screen's plate coordinates.
- **20b-8. Alcohol on bare water.** It is a solvent only for the film; whether it
  should also drive the water's Marangoni flow (Soap Bursts) as soap does is open.
- **20b-9. The hole's edge is drawn between the film's texels.** On a 4K wall the
  edge is soft; 18e's refraction lines would draw it as the still does.
- **20b-10. The film's carry is not on the projection's faces.** `filmAdvect` builds
  its face velocities from the collocated flow, averaged, on a grid of another size
  than the solver's, and those carry a grid-scale divergence that compressed a thick
  film from 0.8 to 0.54..0.91 in half a second of one stir (lab, 128²). It takes back
  what the faces' net outflow would do to a film the same everywhere (the advective
  form): exact where the flow is free of divergence, not conservative to the last
  digit where it is not (`npm run lace` holds the volume to 0.1% over 20 s of
  stirring). Carried on the projection's own Rhie–Chow faces (a film grid that divides
  the solver's), it would be both. *A shortcut named for scope.*
- **20b-11. The bubble lens and the edge decodes do not see the film.** Only the
  plate's main decode draws the water's path less the film; a bubble over whole film
  (the lens's `decodeFluid` calls) and the edges show the colour at full strength, as
  `thickOptics` does. Pass the film to those decodes when the film is judged.
- **20b-12. The app's pours into the film are not in a check.** `lace` pours straight
  into the film (`lab.addFilm`); the Dropper's path (`onDeposit`: Alcohol and Soap as
  the solvent, clear oil joining the film, the front plate only) is judged by eye
  (judging §34). A lab case that drives `onDeposit` as the app does would hold it.

### 20c. The lace stays lace: a viscous film

The still's holes have no rims and the film between them stays wide. That is a viscous
film, whose own stretching viscosity 4ηh resists its retraction (a Trouton sheet), not
a thin film dragged over the glass. Two ways to get it, in order:

1. **On 18a (shipped behind Thin Gap, on in every look):** the film as a phase of high
   viscosity in the Hele-Shaw solver. The oil film against the glass with water beside it is modeled as two layers stacked across a pressure-driven Poiseuille gap (relative viscosity m = 50 for clear light mineral oil at 50 cSt, `OIL_NU = 5e-5` m²/s, with continuous velocity and shear stress at the interface; 4.15x drag at h=0.4, 15.95x drag at h=0.8). Stir impulse in `scripts/lace.mjs` scaled to [2.5, -1.5] / [-2.0, 2.0] so dye moves far enough under the ~16x drag to measure displacement (> 1 cell) without altering the 12% wave ratio bar. The
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

- **20c-1. Macro closeup cell field is a look-alike shortcut (opt-in since 33g: no look draws it by default; retained pending physical Rayleigh–Bénard / Marangoni simulation).** The procedural `cellField` in `src/gpu/wgsl/plate.ts` (evaluated at 6x zoom and timed on `cellClock`, verified by `npm run cellride`) draws concentric circular Voronoi cells and slides them with a flow map rather than physically simulating buoyancy-driven or Marangoni surface-tension-gradient convection cells and silicone phase separation (§25f). While 20c introduces physical viscous film drag in the Hele-Shaw solver (`thinGap.ts`), the sub-grid macro cellular structure remains a procedural camera-pass effect until physical density-inversion and micro-droplet solver passes are available.

- **20c-2. Settings tabs on the phone (shipped in #348's review).** The Settings rail is a strip across the top on a phone, and each tab took its group's whole width and lay under the next group: 13 of the 26 tabs took no tap, Patches among them, so the room's two new patch features (How sudden, How busy lately) could not be reached from a phone. The tabs are full width only in the desk's column now; `npm run phone` taps every tab where it is drawn, and patches each new feature from the phone.

- **20c-3** (S, a check in a cloud session): `npm run phone` with `PW_WEBGPU=1` in a cloud session fails "every tab of the phone's Settings rail takes a tap where it is drawn" on main e679e6d, with 23 of 24 tabs covered (all but Master), while a script that opens the rail alone at 390×844 finds none covered. Something an earlier step leaves open lies over the strip in the full run; find what `elementFromPoint` lands on instead and close it in the check's path, or fix the overlay if a phone would meet it too. Found in 14m's PR, which ran it on main to rule its own diff out.


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
**Partly shipped**: Roy, 1963, and Ben-Day Dots are in, measured by `npm run benday`; Roy opens as a panel, not a black stain (`npm run royopen`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

The owner, 2026-09-27, over a screenshot of Classic at 2.8x covered in red dots on
white by accident: "kinda cool, Roy Lichtenstein type style ... let's reserve this
effect for a particular preset and a particular control." What makes the dots on
Classic is another thread's to find and stop; this section is the effect on purpose.

Open:

- **21a. Judge it on the Mac** (docs/judging.md §27): the dots' size on a wall, the
  line's weight, and whether it holds up moving at 60 fps. The lab shows still frames.
- **21b. The line is drawn round the front plate only.** It needs the dye, and it is
  drawn from the front plate's; a second plate, the film and the lamps are printed
  (dots and inks) but not outlined. Roy has one plate, so it does not show there.
- **21c. The dots do not grow with the zoom.** The screen is fixed to the picture,
  as a print's is; the owner's accidental dots at 2.8x were about twice the size.
  If a bigger dot is wanted in the closeup, the pitch could follow the zoom.
- **21e. Judge Roy a minute in** (docs/judging.md §38). The opening is measured; what
  the pours, drops and the music make of it over a minute is not (no app frames in a
  cloud session). Dye Budget went from 0.9 to 0.45 on the reasoning that a fuller plate
  runs the inks over each other into black; if it reads too empty or still muddies, the
  budget and Roy's injection styles are the two knobs.
  The opening's dot fields are tuned to the print's tint band, which any change to
  the dye's opacity before the print moves: #267 (the grain after the curve) took
  the band down by a quarter and the deploy read 47 dots; the fields were re-laid
  at 0.75 (272). A change there re-runs `npm run royopen` and re-sweeps TINT.
- **21f. Violet is laid flat** (QA-16, #293). A comic's violet is solid magenta
  with a second screen of cyan dots over it; the print lays it as the flat colour
  that reads from a step back (`BENDAY_VIOLET`), since Roy has one screen. Green
  is a true overprint and needs nothing. Lay the cyan as dots over the magenta if
  violet reads too smooth beside the dotted washes.
  Found with it: the seam line is drawn wherever two inks meet, and there are five
  now, so a player's pool shading from yellow to teal gets two pen lines inside it
  (yellow, green, blue) where it had one. A comic outlines each colour area, so
  this is inferred to be right; judge it on the Mac (judging.md §38).
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
them it would pass. **Fixed:** the harness (`scripts/wall.mjs`) checks its own gap is
over a second (`originGap >= 1000`).

## 22. Spin the plate
**Partly shipped** (#223, #252, #258, #261): the Spin tool, Auto Spin, the one dish under a plate, the cut of the swirl's projection and the look's motor retune are in. The shortcuts and what is open are below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

Asked 2026-09-28: "spin the plate on command, or set it to spin automatically at some
rate (or a rate controlled by some other factor, like music tempo); give me a control
(like press) and a setting."

**Shortcuts, named so they are replaced:**

- **22b. The swirl is not carried by its own flow.** τU/L is about 1 for water spun
  hard, so the swirl's inertia matters there; it is integrated in place. Advect it
  with the velocity (a semi-Lagrangian step, as the current is).
- **22c. Coriolis is left out.** In a flat gap it is a pure gradient for a
  divergence-free flow and the projection takes it; with a varying gap a sliver is
  left. Add 2ω_l ẑ×u where h varies, and measure what it changes.
- ~~**22d. The CPU solver gets the bulk lag and not the swirl.**~~ Dropped with the CPU
  solver's stepping (2.6, decided 2026-10-06; 3.1). Where there is no
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
- **22l. Nothing winds the middle against the rim now.** The stir was a differential
  rotation, and some looks read by it (galaxy's spiral arms; its preset said so). A
  steady dish under one liquid cannot make one; what does in a real show is a second,
  smaller glass pressed into the middle and turned against the dish: under it the
  liquid is sheared between two glasses and goes round at about the mean of their
  speeds (Couette flow through the gap), outside it at the dish's, so the middle winds
  against the rim along the top glass's edge. If the owner misses the spiral (§28),
  build that as a tool or a setting, with the drag worked out from the gap as the
  swirl's is, not as a stir.
- **22m. What the retune left behind.** (1) The stir sped up and slowed with the
  look's clock (the phrase's lean, the tempo's pace, a scene's swell, the Speed dial);
  a motor does not, so a look whose clock leans a long way turns a little less with
  its swells than it did. (2) The match is the front plate's; a back plate whose
  Background Loop slows its clock had a slower stir, and now turns its dish as fast as
  the front's. (3) Saved looks, scenes and set lists written before keep their old
  dial (0.1 and under) and so lose most of their turn: a load could move an old
  look's dial the way the presets were moved (it needs the look's Speed and Advection,
  which a saved look has). (4) Since the motor is most of what turns acid-trip,
  cyberpunk and stardust-collapse, their liquid turns faster than 0.05 rad/s all the
  time and the swirl's centrifuge runs on every step there, not only while they play
  (22k measured what that costs: under a fifth of a percent of the GPU).
- ~~**22k. The swirl runs on every look with music routed to rotation.**~~ **Measured and
  cut** (#258). Since 22h a music look's dish sways under its liquid, so Ω − ω_l is over the
  swirl's 1e-3 rad/s floor nearly all the time: on CI's Mac, with the built-in band playing,
  the swirl ran on 91–100% of the nine thin looks' steps. It was thirteen dispatches a step on
  the current's half grid (spinSwirl, its divergence, ten Jacobi sweeps, the gradient).

  Found along the way:
  - **22g's thin palm reads 0.307 in the lab, not the 0.607 written there,** on main before
    this change. Still over the check's half of the old plate's 0.534, but by 15% where it
    was by more than double. Find what moved it (#248 Thin Gap everywhere, #255 the thin
    forces, or the lab's own plate) and either restore it or write down why it moved.
- **22i. The hand reads its angle, not its grip.** A hand turns the dish at its
  angular speed round the middle, held to a turn and a half a second, because near
  the middle a small move is a large angle. A hand's real torque is its friction
  times its lever arm: weight each hand by its radius and let a thick liquid's drag
  push back (22e).

## 23. Selling it: the site free, the app paid

*Asked 2026-10-04: which features should leave the free web app and stay in a paid
version. The owner chose the split below the same day. Nothing is gated yet; this
section is the order to build it in.*

**The rule.** The website keeps the whole plate and is the demo: anyone who signs in
(free, with Google, Apple or an emailed link; the owner's choice 2026-10-11, below)
sees the best ChromaGlass there is, on their own laptop and one projector. Home is
what a listener wants for an evening with their own music (whatever the computer plays,
the TV with no click, full recordings); Pro is what turns the plate into a show rig, and most of that is what a page cannot
do at all, so the paid side is mostly the Mac app (§13 step 1), and the Windows app
after it (13-win-app), rather than features cut from the site.

**Why so little leaves the site.** The source is public and BUSL lets anyone run
their own copy and change it, so a gate on the website is a nudge, not a lock. It
still works, because nearly everyone uses the hosted site rather than building from
source: gates go in the hosted site's build, and the code stays in the repo. What the
app does natively (the show server with no terminal, video out, offline, the
projector with no click, writing to disk) needs no enforcement at all. Two things
cost the owner money on every use, song ID now and any cloud storage later, so they
sit behind the key.

**Order.** None of it before Wave 1, a judging pass (Wave 2), the signed Mac app
(13.1-sign) and a free beta with a few VJs. Then the steps below, then charging.

### The split

| Feature | Free website | Home app | Pro app | Why |
|---|---|---|---|---|
| Signing in (Google, Apple or an emailed link) | required, once a browser | once, then offline for good with a key | once, then offline for good with a key | The owner's choice (2026-10-11). The account holds the key and links the devices (23.10–23.14). |
| Every look, preset and photograph | ✓ | ✓ | ✓ | The look is what sells it; a weaker demo loses the sale. |
| Solver quality, grid and governor | ✓ | ✓ | ✓ | Hobbling the picture makes the site a worse advert. |
| Every tool and every liquid | ✓ | ✓ | ✓ | Playing with the liquid is a first visit's "wow". |
| Design desk; your own presets as files | ✓ | ✓ | ✓ | People invest in it, and their presets carry into the app. |
| Microphone, system audio, file player, beat clock, band in the box | ✓ | ✓ | ✓ | Sound-reactivity is the core promise. |
| Whatever the computer plays (a streaming app, a music library), heard with no tab to share | | ✓ | ✓ | The listener's first wish, and a page can only hear a shared tab or a microphone. Whether Electron can take the Mac's system audio directly is not yet tested. |
| An ambient mode: full screen on the TV for hours, cool and quiet (14j) | best effort | ✓ | ✓ | A listening session runs an album or an evening, not a set. |
| MIDI controller, MIDI learn, tap tempo | ✓ | ✓ | ✓ | A VJ tries it with their own controller before buying. |
| One projector or TV on HDMI (Cast → Second display) | ✓ | ✓ | ✓ | A party or a first gig on the site is the best advert. |
| Projector or TV found and sent to with no click, back after a knocked cable | | ✓ | ✓ | A page needs a gesture; at home it is the TV coming on by itself. |
| The Mixer's stack on one plate | ✓ | ✓ | ✓ | It is part of the look. |
| Two or more projectors, each its own plate (§16) | | | ✓ | Only multi-screen rigs need it, and they are paying jobs. |
| Show Sequencer and set lists | ✓ | ✓ | ✓ | Free to try; a cap on a site set list's length can come later. |
| Lyrics overlay (LRCLIB) | ✓ | ✓ | ✓ | A free service and a good party trick. |
| Song ID | manual tag only | ✓, a monthly cap | ✓ | Every lookup costs the owner money; the cap keeps Home's price above its cost. |
| Song maps, per-track identity, history | ✓ | ✓ | ✓ | Work from a manual tag at no cost. |
| Your own logo on the wall | ChromaGlass mark | ChromaGlass mark | ✓ | A club or a band putting its name up is a paying use. |
| Record | short clips, small mark | full length, no mark, to disk | full length, no mark, to disk | The site holds the take in memory anyway (§13 found along the way). |
| Render a song | 720p, small mark | full resolution, no mark | full resolution, no mark | Sharing a video of your own record is what a listener does. |
| Phone and tablet remote | | ✓ | ✓ | Changing the look from the couch; needs the show server, which the app has built in. |
| Network displays, OSC in | | | ✓ | The same show server; pro integration. |
| Art-Net: the room's lights follow the plate | | | ✓ | The same show server; only venues have DMX. |
| Syphon, Spout, NDI out (13.2, 13.3) | | | ✓ | Impossible from a page; the main reason a VJ buys a native app. |
| DAW bridge plugin (13.7) | | | ✓ | It talks to the app, not the site. |
| Modular patch inputs (§24): two channels / every channel; CV out | two channels | two channels | every channel, CV out | A page gets two input channels; the rest needs the app reading the interface natively. |
| Works offline | best effort | ✓ | ✓ | The app bundles the build. |
| The room camera driving the plate | ✓ | ✓ | ✓ | A demo moment that costs nothing. |
| iPhone app playing the show itself (§12) | free | | | Store rules take a cut of an in-app sale; keep it a demo. |
| iPhone app as the laptop's remote | | via the laptop's key | via the laptop's key | The laptop's licence covers its remote, so no store sale. |

### How it unlocks

- **Bought once through a merchant of record** (Paddle or Lemon Squeezy), which runs
  the checkout, VAT and sales tax and emails a licence key. The key is also held
  by the buyer's account (23.12), so it can be restored and moved without digging
  out the email. (Until 2026-10-11 this said no accounts; the owner then chose them.)
- **The key is a signed token** the app checks against a public key built into it, so
  it works with no internet at the gig: activated once online, two machines per key,
  moved from a settings page.
- **Two tiers, each bought once with a year of updates** (the owner's choice,
  2026-10-04, "I want more casual hobby buyers": people using it for their own
  listening sessions on their stereos, not just VJs). **Home, $29–39**, for listeners:
  what the hobby end of the market charges (Visual Lab Pro $39, Magic Music Visuals
  $79.95). **Pro, $199**, for show rigs: what the closest products charge (Synesthesia
  Standard $199, VDMX6 $199; Resolume Avenue is €299). Home to Pro costs the difference,
  as Resolume's Avenue to Arena does. After the year, updates are an optional yearly
  renewal (about $59 for Pro), and a lapsed key keeps the last version it had. A
  founder price for the beta's first buyers and half off for students are the norm.
  The exact Home price is the owner's, in 23.1. A subscription would need the key to
  expire and the app to call home, which fights the offline promise; if the owner
  wants one, it is a separate decision. Prices read 2026-10-04 from the vendors' pages.

### Accounts (the owner's choice, 2026-10-11)

*Asked 2026-10-11: "time we have logins & accounts … I really do like using SSO through
google — but we could do our own?" Recommended and chosen the same day: Firebase
Authentication with Google, Apple and an emailed link, and the free site behind the
sign-in. Then: "a more streamlined approach to connecting phones/tablets/computers"
once the login works (23.14).*

- **Why Firebase and not our own.** The site is already on Firebase Hosting, so the
  sign-in is the same project, free at this size, and Google's sign-in is the one the
  owner likes. Our own would mean storing passwords, resets, breaches and two-factor
  ourselves, in a public repository, for nothing a player sees. **Why not Google
  only:** it shuts out everyone without a Google account, and Apple requires Sign in
  with Apple in any iPhone app that offers Google's (App Store guideline 4.8).
- **What a login wall costs, and what pays it back.** A first visitor and a shared
  link now meet a sign-in before the plate, which loses some of the demo's first
  "wow". So the sign-in sits over the intro `index.html` already paints, and a link
  to a look survives it (the emailed link lands back on the page asked for).
- **A show never locks out.** A browser that has signed in keeps a flag saying so,
  and with it the plate starts at once while Firebase finishes in the background.
  Firebase alone is not enough: it confirms a cached user with Google before it
  answers, and on a network that hangs rather than refuses (a venue's captive Wi-Fi)
  a prototype took 19.3 s to start against today's 0.6 s (`npm run signin` line 7). Once the plate is up nothing about the account takes it down: not
  the internet going, not a session expiring, not a sign-out in another tab, not the
  account deleted. Only the next load asks again. An explicit sign-out from the
  account sheet in the same window is the one exception, and it asks first.
- **What is never asked.** The phone remote (`?remote`) and a cast (`?cast`): they
  belong to a show that is already signed in. The Mac app with a key: the key works
  offline for good (23.4). A build with no Firebase config (`npm run dev`, every
  check, a fork's own copy) has no sign-in at all; the source is public and BUSL lets
  anyone run it, so the wall is the hosted site's, as the paid gates are.
- **Measured by** `npm run signin` (`scripts/signin.mjs`, written before the build):
  the Firebase Auth emulator stands in for Google's servers, so the real SDK runs in
  a cloud session and on CI with no project or secret. Fourteen lines, from "no
  Firebase in a build without the config" to "a sign-out in another tab and the
  account deleted leave a running plate up". On today's site it is red from line 3.
  Run against a throwaway sign-in in the session that wrote it, every line went
  green, so each line can pass; the same sign-in made to drop the show when the
  account signs out failed line 8, and one that waited on Firebase alone failed
  line 7.

### Steps

- **23.1** *(owner)*: the merchant account, the Home price ($29–39) and Pro's ($199),
  and the checkout page.
- **23.2** (**shipped**, this PR): a hosted-site build flag (`VITE_FIREBASE_HOSTED_SITE=1`, or `?tierGates=1` for checks) that shows each paid feature
  above as an "In the ChromaGlass app" tile with a link (`src/lib/tierGates.ts`, `SettingsPanel.tsx`, `DeskPanels.tsx`), off in a licensed app and in a
  local `npm run dev`. *Measure:* `npm run tiers` (11/11, wired into `checks.yml` `Measure · lab`): loads the gated build and verifies 7 tiles on the free tier, 2 Pro tiles on a Home key, and 0 tiles on a Pro key.
- **23.3** (**shipped**, this PR): the song-ID Worker (`server/fingerprint-worker.js`) takes an Ed25519-signed `X-ChromaGlass-Key` licence key as
  well as an allowed origin, and the site's manual tag stays. 14o's gates come first
  and stay (origin, size, per-/64 hour, the day's ceiling, in `npm run
  fingerprint-worker`); a good key raises the hour's count (`LICENSED_RATE_PER_HOUR = 300`), not skipping the day's (`DAILY_LIMIT = 1000`). *Measure:*
  `npm run fingerprint-worker` (23/23): no key refused when `REQUIRE_LICENSE_KEY=1`, a bad signature refused before reading the body or calling the service, a good key answered and allowed past the 30/hr cap while stopping at `DAILY_LIMIT`.
- **23.4** (**shipped**, this PR): the key in the Mac app and show server (`server/license-key.js`, `server/server-license.js`, `server/remote-server.js`, `src/lib/licenseKey.ts`, `desktop/`): offline Ed25519 signature check, activation
  and the two-machine count (`/license-activate`, `/license-deactivate`, `/license-info.json` on loopback), the key's tier (Home or Pro) and the features each
  opens, Home → Pro upgrade keys, and an unlicensed app that runs as the site does (`requireSignIn=1&tierGates=1`). *Measure:* `npm run tiers` (11/11): verified with a valid Home key, a valid Pro upgrade key, tampered/expired keys, 2-machine cap, and no key.
- **23.5** (**shipped**, this PR): the site's Record capped to a 15-second clip (`FREE_RECORD_MAX_SECONDS = 15`)
  and Render to 720p (`FREE_RENDER_MAX_HEIGHT = 720`), each with a small ChromaGlass corner mark (`useRecorder.ts`, `useSongRender.ts`) the Mixer cannot hide; the app's untouched. *Measure:*
  `npm run tiers` (11/11): verifies the 15 s cap, 720p cap, and corner mark pixels on recorded frames.
- **23.6** (**shipped**, this PR): the site's logo layer shows the ChromaGlass
  mark only (`SettingsPanel.tsx` and `DeskPanels.tsx`); your own
  logo is the app's. *Measure:* `npm run tiers` (11/11).
- **23.8** (**shipped**, this PR, `desktop/`): Home's listening features. The app hears
  whatever the Mac plays with no tab to share (`desktop/main.js` `setDisplayMediaRequestHandler` with macOS ScreenCaptureKit loopback, `desktop/preload.cjs`, `desktop/electron-builder.config.cjs` `NSAudioCaptureUsageDescription`, `SoundPanel.tsx` `"System audio"` source), and an ambient TV mode (`Show → Ambient TV Mode (Cool & Quiet)`, `SoundPanel.tsx` toggle, `PhoneStage.tsx` Play sheet tile, `ambient.ts` the switch, `governor.ts` the 30 Hz step rate and rung ceiling, `drawGate.ts` the draw cap) runs the plate full screen on the TV for hours with the 60 Hz draw cap, 30 Hz solver step rate cap, and opening rung floor of 14j. *Measure:* in `npm run desktop` (13/13), the System audio source's pipeline reaches the ear and the picker was intercepted, and Ambient TV mode caps the solver at 30 steps/s, caps draws at 60 Hz in the app (`DrawGate`), and holds the opening rung; `npm run rungs` (76/76) and `npm run phone`. On the owner's Mac, an album through a streaming app drives the plate (`docs/judging.md` §87).
- **23.7** *(owner)*: the free beta (listeners as well as VJs), then charging. Later, if wanted, the same key
  pasted into the site unlocks it there too (bypassable from source, which is fine).
- **23.9** (**shipped**, owner): in the Firebase console (`chromaglass`), Authentication turned on
  with Google, Apple and the emailed link; authorised domains configured; web config wired into
  `deploy.yml` via GitHub Actions repository secrets (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`).
  *(Open console step for the owner: in Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs → Web client `793087423172-fi7d5oq5tisv3is84vvf8e6dtorighql.apps.googleusercontent.com`, add `https://chromaglass.art/__/auth/handler`, `https://www.chromaglass.art/__/auth/handler`, and `https://chromaglass.web.app/__/auth/handler` under Authorised redirect URIs, then update `VITE_FIREBASE_AUTH_DOMAIN` to `chromaglass.art` so `signInWithRedirect` stays same-domain on iPhone Safari.)*
- **23.13** (**shipped**, #390 and extended in #394): `public/privacy.html` and `public/terms.html` completed and
  approved by the owner, including 23.12's licence key, Lemon Squeezy checkout, and 2-machine terms. *Measure:* `npm run privacy` (16/16, CI, part `logic`).
- **23.10** (**shipped**, #394; brief `docs/handoff-signin.md`): the sign-in on the
  hosted site (`SignInScreen.tsx`, `firebaseAuth.ts`, `authFlag.ts`), over `#cg-intro`
  with Google, Apple and an emailed magic link, and the account sheet (`AccountSheet.tsx`:
  the email, sign out with confirmation, delete the account with confirmation, and links
  to `/privacy.html` and `/terms.html`) on the desk, the narrow overlay and the phone.
  Returning visitors start the plate immediately from the local flag while Firebase
  confirms in the background, `?remote`, `?cast` and builds without `VITE_FIREBASE_*`
  never load Firebase, and `getFirebaseAuth()` uses `VITE_FIREBASE_AUTH_DOMAIN` directly
  rather than overriding it with `window.location.hostname` on `.web.app` (which sent an
  unauthorised `https://chromaglass.web.app/__/auth/handler` redirect URI on returning
  iPhones kept on `chromaglass.web.app` by `index.html`). *Measure:* `npm run signin` (14/14, wired into `checks.yml`
  `Measure · lab`), and `startup` on the Mac: a returning visit's first step no later
  than today's bar.
- **23.10c** (**shipped**, this PR): a way back in, and a profile sheet that reads (the owner,
  2026-10-24: signed out while using the app, "there is no way to re-sign in"; "the profile page is
  garbage"). Signed out with the show up, every account button (the desk's status bar, the corner
  pill, the phone's header and its Play menu) becomes a lit **Sign in** that opens the same sign-in
  the first visit meets, inside the sheet, over a plate that keeps playing; a sign-in or sign-out
  here, in another tab, or by the background check redraws them (`authFlag.ts` says so on
  `cg-auth-changed`, and other tabs are heard through `storage`). The sheet (23.10b's frame) is now
  one column that answers who you are (email and plan, or the sign-in), what you have (Pro says so;
  Home is offered the upgrade; Free sees the two plans side by side; a key typed by hand is one
  row), then the rest: running shows (one quiet line when there are none), the newsletter as one switch, sign
  out and a small delete at the bottom. The settings shortcut is gone (the desk and the phone each
  have their own). *Measure:* `npm run signin` 15 (a lit Sign in on the desk and the phone, 44 px on
  the phone, opening the sign-in over a running plate) and 16 (signing in from the sheet brings the
  account back); 1–13 unchanged.
- **23.10b** (**shipped**, #430's work, folded into 23.10c's PR): the Profile & Store sheet fits the screen (the owner,
  2026-10-22: "a little janky"). The sheet was one 955px column centred in a scrolling
  overlay, so on a 900px laptop and an 844px phone its title and close button sat above the
  screen with no way to scroll to them. Now the frame stays inside the viewport (`92dvh` on a
  phone, `100dvh - 2rem` on a laptop), the title and the footer links stay put and only the
  middle scrolls; two columns from 768px (who you are, the key and the running shows on the
  left; the store and the newsletter on the right), so a 1280×720 laptop sees the whole sheet
  at 600px tall with no scroll; on a phone a bottom sheet with the store second and 48px
  touch rows. Colours are the desk's tokens (violet for what you own and for Pro, red for
  sign-out's neighbour, white for the primary button) in place of amber, which meant nothing
  elsewhere; the three "Profile & Store" / "Account" pills lost their amber too. Checkout
  links, prices and every `data-cg-*` hook are unchanged. *Measure:* sheet height 955 → 600px
  at 1440×900 and 1280×720, 776px at 390×844 inside the screen (was cut off by 28, 118 and 56px at the top);
  `panel` 192/192, `layout` 74/74, `phone` 355/355.
- **23.11** (**shipped**, this PR): the Mac app with no key asks for the
  same sign-in once (`LicenseGate.tsx`, `src/main.tsx`), online, then runs as the site does;
  with a verified Ed25519 key it never asks. *Measure:* `npm run tiers` (11/11): verified with a key, with none
  and signed in, and with none and signed out.
- **23.12** (**shipped**, this PR): accounts hold the keys (`server/license-worker.js`).
  The merchant's webhook files each Ed25519-signed key under the buyer's email in Workers KV;
  a signed-in app asks the Worker for its keys with its Firebase ID token, checked against
  Google's public keys, and activates up to 2 machines per key. *Measure:*
  `npm run license-worker` (12/12, wired into `checks.yml` `Measure · logic`): `DEFAULT_PUBLIC_JWK.x`
  matches across `server/license-key.js` and `src/lib/licenseKey.ts` and is not the burned key, a bad webhook
  signature refused, missing `LICENSE_PRIVATE_KEY` fails closed (500), a bad token refused, a good token given its own keys and no one else's,
  Home→Pro upgrade, two-machine cap, and a refunded key revoked.
  **23.12-url** (**shipped**): `deploy.yml` never passed `VITE_FIREBASE_LICENSES_URL` to the
  build, so the live bundle had the account's key fetch and the marketing-choice sync folded away
  (measured on the live site 2026-10-19: no `/keys` or `/preferences` call in any chunk); a signed-in
  site never pulled its key from the account. Now passed from a repository secret of that name
  (the Worker's address with no path). Built with and without it: 0 chunks carry the calls without,
  1 with. Typing a key by hand never needed it (checked offline). *Open:* `VITE_FIREBASE_SHOWS_URL`
  is read by `accountShows.ts` and is also not in the build; it falls back to `/account-shows` on the
  same origin, which the hosted site does not serve, so decide with 23.14 where that endpoint lives.
  **23.12-jwks** (**shipped**, this PR): the owner's Pro account read Free (2026-10-24). The Worker
  verified Firebase ID tokens only against a `GOOGLE_JWKS` variable that the check sets and the live
  Worker never had, so it answered 401 to every real sign-in and no account key ever reached a
  browser; and the app asked for the key only while the profile sheet was open. Now the Worker fetches
  Google's published keys for Firebase tokens and keeps them for the endpoint's max-age (about five
  hours, measured), asking at most once a minute for an unknown key id or while Google is down, one
  fetch shared by concurrent requests; an RS256 token must name this project as both audience and
  issuer, and carry an expiry, an issue time not in the future and a subject; the app asks once it starts signed in
  (`src/lib/accountLicense.ts`, from `main.tsx`) and again the moment a sign-in completes in the
  sheet, keeping the best of Home and Pro; a key taken off the computer by hand stays off until
  asked back from the sheet (it would otherwise retake a Mac's seat at the next start). *Measure:*
  `npm run license-worker` 15/15, 12/15 on the old Worker (8: no `GOOGLE_JWKS`, a good token gets
  its Pro key and Google is asked once, old: 0 keys, 401; 8b: Google down, ten tokens ask it once;
  3b: tokens for another project, another issuer, the demo project, or with no audience or issuer
  refused, old: four of five let through); `npm run signin` 14 (Free before the key is
  filed, Pro after a restart with the sheet never opened). *Owed:* `wrangler deploy` of the licence
  Worker from the owner's Mac (its config is not in the repo), then confirm `owner-pro-1` is filed
  under the owner's sign-in email and was signed after the key rotation (the sheet now says so in
  words when the account holds a key the app cannot verify).
  **23.12-reissue** (open): a key the account holds that was signed by the retired key pair is
  refused by every browser; the Worker could re-sign such records on `GET /keys` with the current
  key (it is the source of truth for what was sold), with a check that a forged token never enters
  KV that way.
  **23.14-verify** (**shipped**, #467; found 2026-10-24): `server/account-shows.js`
  `verifyAccountToken` read the token's uid, audience and issuer but never checked its
  signature, so anyone who could reach a show server could name any uid and read or publish
  that account's running shows. It now verifies RS256 against Google's keys in
  `server/firebase-token.js` (cached and rate-limited as 23.12-jwks does), the project, the
  issuer and the times; the emulator's unsigned tokens count only with `FIREBASE_AUTH_EMULATOR`
  set. *Measure:* `npm run accountlink` 1b (a signed token taken; unsigned, forged and
  other-project tokens refused), 7/7.
- **23.14** (**shipped**, this PR): linking devices by
  account (`server/account-shows.js`, `src/lib/accountShows.ts`). A signed-in show running
  with `server/remote-server.js` publishes its LAN relay address and show key to
  `/account-shows` with its Firebase ID token (90 s TTL, isolated by account UID). A phone,
  tablet or laptop signed in to the same account sees the account's running shows in a list
  (on `PhonePlay`, `PhoneStage`, `AccountSheet`, `DeskPanels` `Phone · iPad` and
  `LaptopLink`) and joins one with a single tap: the account hands over the show's address
  and key, which #380's QR carries today. The QR stays for a guest's phone or one not signed
  in, and for a venue whose Wi-Fi has no internet. Once linked, control stays on the local
  network either way, so the internet going never drops the remote. *Measure:*
  `npm run accountlink` (6/6, wired into `checks.yml` `Measure · lab`): token/store isolation,
  two signed-in pages on the same account (one a show, one a phone) where the show is listed
  and joined with a tap and no address typed while the QR code stays on `Phone · iPad`, a
  third page on another account sees nothing, and cutting off the internet and account
  service leaves the local remote socket driving the show.
- **23.18** (**shipped**, this PR): cloud sync for Pro (`server/cloud-sync.js`,
  `src/lib/cloudSync.ts`, `src/lib/cloudSyncApp.ts`, `CloudSyncCard` in the profile sheet,
  desk and phone). Asked by the owner, 2026-10-25: the Mac app has its own storage, so looks
  saved in Chrome were not in it. A Pro account now carries the saved looks, sequences, saved
  sets and the working set list, song shows and action sets, custom liquids, the MIDI map,
  tool amounts, music settings and Follow songs; every browser and Mac app signed in to it
  keeps them in step through the licence Worker's `/sync` (one KV value per account, the tier
  read from the keys filed under the account's email). Each device stays the source of truth
  offline and saves exactly as before; the engine looks at the same localStorage keys every
  5 s and stamps what changed. The rule is newest-wins per item with deletions as tombstones,
  the cloud's copy on a tie, and what a device held before it first synced stamped oldest (so
  a second machine's untouched starter set never replaces the first's). Clocks are corrected
  by the skew each answer measures; a record far in the future is pulled back to a minute past
  the server's clock. KV has no transactions, so a manifest every ten minutes finds a push lost
  to another device's write and sends it again. Not synced, on purpose: the projector layout,
  audio input and source, MIDI ports, desk mode, licence and sign-in, which belong to the
  machine. The MIDI map syncs whole, one value: two computers with different controllers
  replace each other's map (a map per controller is 23.18-midi). Erase the cloud copy from the
  sheet (any signed-in account, Pro or not); the erase leaves a marker, and a push on a sign-in
  token issued before it is refused, so a Mac app left open cannot put back an erased or
  deleted account's copy. Deleting the account stops if the erase fails. A look the cloud
  refuses (over 256 KB) is reported on the card and not sent again until edited.
  *Measure:* `npm run cloudsync` (13/13, `checks.yml` `Measure · logic`): saved on one device
  and read back by the stores' own load functions on the other, for arrival, the starter set
  list, concurrent edits of different looks, the later edit of one look from a clock ten
  minutes slow, deletion, offline edits, a lost write healed, Home/keyless/forged/other
  accounts refused or isolated, unreadable storage never read as empty, erase, a future
  stamp, a refused look and an id of `toString`, and the wiring (every synced key is its
  module's, and every key held in React state reloads when the cloud writes it). Each guard
  was broken in turn and its line went red.
  **23.18-deploy** (*owner*): `/sync` exists once the licence Worker is deployed by hand from
  the Mac (`npx wrangler deploy`, as for #460); until then a Pro sheet says sync stopped on an
  error and retries, and nothing else changes.
  **23.18-cost** (open): every push is one Workers KV write, and the free plan allows 1000 a
  day for the whole Cloudflare account (licence webhooks and activations included). Pushes
  wait for 4 s of quiet and come at most every 5 s, so a player editing all evening is a few
  dozen; past about thirty busy Pro players a day the free plan runs out and writes fail
  (sync then backs off and keeps everything local). Workers Paid ($5 a month) lifts it to
  a million a month. If two devices of one account racing ever matters, a Durable Object per
  account gives real transactions in place of the manifest's repair.
  **23.18-music** (open): the song memory in IndexedDB (fingerprints, song maps, recorded
  performances, `musicDb.ts`) does not sync: it is large and per room. A show kit
  (`showKit.ts`) still carries it by file.
  **23.18-prune** (open): tombstones are kept for ever (they no longer count toward a store's
  2000-item cap, but they grow the account's value); drop those older than 90 days once every
  device's rev is past them.
  **23.18-verify-share** (open): the licence Worker keeps its own `verifyFirebaseIdToken` beside
  `server/firebase-token.js`, which was written to run in both; one copy of security code
  drifts less. Neither checks `auth_time`, which Firebase's documented steps include.
  **23.18-midi** (open): a MIDI map per controller (keyed by the device's name), so two rigs
  keep their own maps instead of the newest replacing the other.
  **23.18-pack** (open): the Mac app packs `server/` from a hand list
  (`desktop/electron-builder.config.cjs`), and this PR's new `firebase-token.js` was missing
  from it until the packed app failed to start on CI's Mac. A line in `npm run desktop` that walks
  `remote-server.js`'s relative imports and fails on any file the list leaves out would catch
  the next one in the cloud, before the Mac job.
  **23.18-exit** (open): a Mac app quit straight after an edit sends it the next time it opens
  (no send on `pagehide`); a `keepalive` push of the waiting records under 64 KB would close it.
- **23.10d** (**shipped**, #460): Sign in with Apple is not offered (the owner,
  2026-10-24: "I don't want to do the apple developer account or accept logins from
  them. maybe later - but not now."). The button is held behind `APPLE_SIGN_IN` in
  `SignInScreen.tsx`, the landing page and the privacy page say Google or an emailed
  link. *Measure:* `npm run signin` line 4 fails if an Apple button is drawn.
- **23.10e** (**shipped**, this PR): email and password accounts (the owner, 2026-10-24:
  "an email login option that stores passwords and other account details ... and if they
  have a google account it can link to that"). Firebase Email/Password beside Google and the
  emailed link; Firebase keeps one account per email, so a password is one more way into the
  same uid and the licence (keyed on the email, `keys:<email>`) follows with no Worker change.
  *Sign-in form* (`SignInForm`, shared by the first-visit screen, the account sheet on the desk
  and the phone): "Continue with email" opens an Emailed link / Password pair of tabs; Password
  has sign in, create account, show/hide, and "Forgot password?". Sign-up mails the confirmation
  link at once. An address that already has an account says so, and offers "Continue with Google
  and add this password" (Google, then `linkWithCredential`). A Google sign-in Firebase refuses
  because the email has a password keeps Google's credential and attaches it on the next
  password sign-in. *Account sheet* (`AccountSignInMethods.tsx`): which ways in the account has,
  "Set a password" (a Google account: `linkWithCredential`; an emailed-link one: `updatePassword`),
  and, for an unconfirmed password account, a banner with "I've confirmed" (reload, renew the
  token, ask the Worker for the licence) and "Send it again". **Why confirmation matters:** the
  licence Worker already refuses an ID token whose email is not verified
  (`license-worker.js`, `email_verified === false`), which is what stops a stranger signing up
  with someone else's address from reading that person's licence; an unconfirmed account reads
  Free until the link is opened. *Measure:* `npm run signin` 17–21 (the real SDK against the Auth
  emulator): sign-up makes one unconfirmed account, mails the link, starts the plate, a filed Pro
  key reads Free until confirmed and Pro after; on a phone the password signs in to the same uid,
  a wrong one is refused in words, a reset is mailed; a Google account signed up again gets no
  second account and ends with `google.com` + `password` on one uid; a Google and an
  emailed-link account each set a password from the sheet and sign in with it; the password form
  fits 1024×768 and a phone upright and on its side. *Console step, **done** (the owner, 2026-10-25): Email/Password is on and
  "Link accounts that use the same email" is on.* Live since the 10:23 AM PT deploy on
  2026-10-25. *Owed by the owner:* the one hand-try the emulator cannot do (Google account,
  Account, Set a password, sign out, sign in with the password, same licence;
  `linkWithCredential` against the real project).
  Open follow-ups:
  **23.10e-1** (open): an emailed-link account cannot be told from a password one from the
  browser (Firebase lists the `password` provider for both), so the sheet says "Email (link or
  password)" and "Set a new password"; an Admin-SDK call in the Worker could say which.
  **23.10e-2** (open): the reset and confirmation emails use Firebase's default templates and
  sender; the console's template editor can carry the ChromaGlass name and the support address
  once the mail service (23.13-mail) exists. **23.10e-3** (open): a password policy (the console's
  password-strength setting) is not turned on; the form asks for 8 characters, Firebase's own
  floor is 6. **23.10e-4** (open): the iPhone app's sign-in (23.15) needs the same form and the
  keychain's autofill hints.
  **23.10e-5** (open, from #475's review): `pendingProviderCredential` (Google's credential kept
  when Firebase refuses a Google sign-in because the email has a password) is attached on the
  next password sign-in for *any* email. Firebase refuses to link it to another account today
  (`email-already-in-use`, swallowed), so it is safe by the platform and not by this code; store
  the error's `customData.email` with the credential and link only when it matches the password
  sign-in's email.
  **23.10e-6** (open, from #475's review): `signInWithGoogleAddPassword` sets the signed-in flag
  before checking the Google email is the typed one, so choosing the wrong Google account leaves
  the person signed in as it with no plate; check first, or sign out on a mismatch. The same
  path hits `auth/account-exists-with-different-credential` (a non-Gmail Google address whose
  email already has a verified password) and says "Google is added when you do", but stashes no
  credential, so it is not: stash it, or reword.
  **23.10e-7** (open, from #475's review; pre-registration takeover, a known platform weakness):
  someone can create a password account for another person's *non-Gmail* address with the public
  key and link their own Google to it; if the real owner later resets the password and keeps
  using the account, the attacker's Google still signs in to that uid, now with a verified email.
  The emailed-link sign-in already runs on the Email/Password provider, so this is not new with
  passwords. Fix: the sheet lists every linked provider with its own email and lets the owner
  remove one, and a password reset signs the other providers out.
- **23.15** (*later*, the owner 2026-10-24: no Apple sign-in for now; with §12's iPhone
  app, which needs it beside Google's under App Store guideline 4.8, and the paid Apple
  Developer account): Sign in with Apple on the site (`APPLE_SIGN_IN`, the Services ID
  and key in the Firebase console) and native in the iPhone app, and
  deleting the account inside the app (App Store guideline 5.1.1(v)). The app as the
  laptop's remote still never asks; 23.14 is how it finds the laptop. *Measure:*
  `ios.yml`'s build, and on a phone by hand (`docs/judging.md`, next free number).
- **23.16** (**shipped**, this PR): one address. The owner asked (2026-10-24) for
  `chromaglass.web.app` "to always immediately forward to chromaglass.art"; it moved only a
  fresh visit, because localStorage belongs to the origin and a plain redirect would have left
  a returning visitor's licence, presets and set lists behind. `index.html`'s first script now
  forwards `chromaglass.web.app` and `chromaglass.firebaseapp.com` to the same path, query and
  fragment on `chromaglass.art`, carrying the old name's `chromaglass*` keys in the fragment;
  the new name writes them before the app's module runs, only from an old-name referrer, never
  over a key it has. The old name drops a carry-shaped fragment it is handed and carries once.
  Left behind: the signed-in flag, account email, pending email link, marketing choice, crash
  logs, and a signed-in visitor's licence key (one sign-in on the new name; the account gives
  the key back, 23.12, and the key stays out of browser history). It stays for Firebase's
  `/__/` pages, offline, a cached show whose network does not reach `chromaglass.art` within
  4 s, a `?cast` window with an opener, `?cg-stay` by hand, and state over 900,000 characters.
  Hosting's own redirects match paths, not hosts, so firebase.json cannot do it on one site.
  *Measure:* `npm run onehost` (25/25; 9/25 on the old page, and the referrer guard, the
  keep-what-it-has rule, the dropped handed-in fragment, carry-once and the 4 s wait each turn
  their checks red when taken out), in `Measure · lab`.
  The address itself was checked the same day: one A record at GoDaddy (Firebase's
  199.36.158.100), www and http both 301 to `https://chromaglass.art/`, Google Trust Services
  certificates for both names (2026-10-18, in CT logs).
  - **23.16a** (open): what the forward cannot carry. IndexedDB (`chromaglass-music`: song maps,
    per-track state and fingerprints are worked out again; its `performances` store is not and
    stays on the old name), the Firebase
    session (signed in again once), a browser that strips the referrer (its state stays on the
    old name; `?cg-stay` reaches it), and an installed web.app app, whose window now opens chromaglass.art out of its
    scope: install again from chromaglass.art. A second Hosting site for `chromaglass.art`, with
    a redirect-only release on the default site, would make the forward a 301, at the cost of
    moving the custom domain and its certificate; worth it only once 23.16 has carried most
    returning visitors across. Also open: Firebase's `/__/auth/handler` on the old names ends
    a completed Google sign-in at a URL on an authorised domain, so a link that walks someone
    through a whole sign-in arrives with an old-name referrer and could add keys the visitor
    lacks (none that sign in or give consent). A second site would close that too.
  - **23.16b** (**shipped**, this PR): the address is the webpage. The owner, signed in,
    reported "I don't always get the webpage when I go to chromaglass.art": the landing page
    (34a) came up only for a signed-out visitor, once per tab, and a signed-in or licensed one
    got the plate. The owner chose (2026-10-24) the webpage at `/` for every visit and the show
    at its own address, `/show` (`src/lib/showPath.ts`; not `/play`, which is the phone's Play
    screen on anything, lib/phone.ts). Play moves the address to `/show` before the sign-in
    opens, so Google's redirect and the emailed link come back to the show; the installed
    app's start_url, the profile sheet's close, the remote's way back and the desk's "open the
    page" address are `/show`. For a signed-in visitor, `/` with an app word in its query
    (`?remote`, `?cast`, `?look`, `?profile`, …) still opens the app; a visitor who must sign
    in meets the webpage first anywhere but `/show`, as before. *Measure:* `npm run signin` 6b (a signed-in visit to `/`
    meets the webpage, not the plate, and its Play opens the plate at `/show` with no sign-in).
    *Open:* the page's buttons say "Play free" to a signed-in Pro visitor too, and the intro
    has already gone when Play opens the plate from it (the same as after the sign-in).
- **23.17** (**shipped**, this PR): when slower frame rates cause the governor to step down (`status.steppedDown`) or the GPU solver is unavailable (`status.gpuUnavailable`), replace the old "Run it locally" `git clone` card (`src/components/RunLocallyCard.tsx`) and add a matching phone/desk `Fluid Grid` callout (`src/components/SettingsPanel.tsx`) suggesting an upgrade to **ChromaGlass Pro** (`CHECKOUT_PRO_URL` / `CHECKOUT_UPGRADE_URL` and `AccountSheet`), hidden once a Pro key is active; gate the `1024²` `Fluid Grid` option to Pro (`disabled={isTierGatingEnforced() && !isProLicenseUnlocked()}`); and let the automatic quality ladder climb to `768²` at `2x`/`3x` Retina and `1024²` at `1x` with projector `stageLadder` and full WebGPU adapter limits in `src/gpu/device.ts` (falling back first to `maxStorageBufferBindingSize` + `maxBufferSize` and then to defaults) whenever a verified Pro licence is active (`effectiveLadderTier` in `src/lib/platform.ts`, `LiquidVisualizer.tsx`). *Measure:* `npm run tiers` (12/12) and `npm run rungs` (74/74).
- **23.17a. A pinned 1024² grid runs free.** `resolveSimResolution` (`LiquidVisualizer.tsx`) holds any pinned grid up to `MAX_PINNED_GRID` 1024 whatever the licence, so a saved look or set-list entry that carries 1024, a `?sim=1024` link, or a Pro key that lapsed runs 1024² on the free tier; #406 gated only the Fluid Grid menu's option. While gating is enforced (`isTierGatingEnforced()`), hold a pin above 768 to Pro and say so where the grid is shown (desk and phone). *Measure:* `npm run tiers` gains a line: a free tier given `?sim=1024` and a look pinned to 1024 runs at most 768², a Pro tier runs 1024², and a red control that lifts the hold fails it.
- **23.17b** (**shipped** with 23.17d, #494): the step-down card (`RunLocallyCard.tsx`) no longer sells the Mac app as Pro's, since Home opens it too; on every tier it names what Pro adds there, several projectors with edge blending. *Measured:* `npm run tiers` 12 reads the card's text (no "plus the Mac app", "several projectors" present).
- **23.17c** (**shipped**, this PR): one tier for the Account pill and every Pro gate (the owner, 2026-10-25: the Mac app's pill said PRO beside a Simulation card selling him Pro for $199). `isProLicenseUnlocked()` read the licence alone; the pill read `getEffectiveTier()`, which on a build that gates nothing (the Mac app, a local show) answers Pro with no key. `isProLicenseUnlocked()` now is `canUseProFeature()`, so the upsell card, the 1024² option, the floating step-down nudge (`RunLocallyCard.tsx`) and the hosted ladder (`effectiveLadderTier`) all take the pill's answer. There was no separate account-derived tier to read: a signed-in Pro account reaches the browser as a licence key (`accountLicense.ts`, 23.12), which `getEffectiveTier()` already reads. *Measure:* `npm run rungs` (78): four builds stood in by a bare `window` (nothing gated, a gated site with no key, a gated app holding a Pro licence, one holding Home) each say the same from the pill, the Pro gate and the hosted ladder; the first fails on the old code (`gate=false ladder=hosted`). The panel's own card is read at the function it calls: a browser check of it stalled on `forceStepDown` not holding on software WebGPU, so a `tiers` line for it is still owed. No Mac release is needed to see it on the web; the Mac app takes it with its next release.
- **23.17d** (**shipped**, this PR): the Mac app opens only on a Home or Pro licence (the owner, 2026-10-25: "The Mac app should check the license. The app won't work for free"). It had no sign-in at all (`desktop.yml` built the site with no `VITE_FIREBASE_*`), gated nothing, and read Pro for every download; and the key `desktop/main.js` verified at launch never reached the page (the preload decoded it with a `Buffer` that cannot read base64url in a sandbox, so the bridge always said free). Now `desktop.yml` builds the site with the accounts and `VITE_MAC_APP=1`; a packed app always asks (`app.isPackaged`, no switch opens it free), takes no signing key from its environment, and has no developer tools; the one other key it trusts is its own build's `checkKey`, the public half of a pair `desktop.yml` makes per build and throws away with the runner, so `desktop -- --packaged` can open it on a key nobody else can sign; and the show, in the app's window and in any browser opened on the app's server, waits behind `AppLicenceGate.tsx` until a verified key whose tier is in `MAC_APP_TIERS` (`lib/macApp.ts`) is on the machine. A free account is no longer enough, as it was under 23.11. The door: sign in (email and password in the window; Google and the emailed link finish in the real browser on the app's own server, `?macSignIn=1`, which files the account's key with that server while the window watches `/license-info.json`), confirm a new password's email, Buy Home or Pro with "check again", or type a key. **Offline:** no grace period, by choice. A verified key opens the app at every start with no network and no time limit (a touring set with no Wi-Fi for a month still opens; 14h); online and signed in, the account is asked, and a key filed under that same email that the account no longer lists (refunded) leaves the machine at the next start, never mid-show (`heldKeyRefunded`, `retireStoredLicenseKey`). The cost: a refunded buyer who never goes online again keeps the app, which a timed lease would close (23.17h). *Measure:* `npm run signin` 22–24 (signed out shows the sign-in; a free account gets Confirm, then Buy, and no plate; a Home key opens at Home; a refunded key leaves the machine and the next start asks to buy), 22 and 24 failing on the code before; `npm run desktop` licence lines (11/11 from the repo; 13/13 packed with the site built as the app ships: it opens on its build's key, a self-signed Pro key with `LICENSE_PUBLIC_KEY` and the network refused meets the door, and so does a plain browser on its server); `npm run tiers` 12/12 (its gate lines 5–7 now pass through the new door). Needs a Mac release (Actions → Mac app → Run workflow, release ticked) to reach installed apps. The owner settled the tiers on 2026-10-26 ("Home can open the app"), so the site's copy says so too: the Home price card lists the Mac app, the Mac line under the cards and the profile sheet's Mac row say it comes with Home and Pro, and the sheet offers Home the download (`macAppRow` reads `MAC_APP_TIERS`; `npm run updates` checks Home on a Mac gets the download).
- **23.17e** (**song ID shipped; crash Send owed by the owner**): the Mac app's site is built with `VITE_FINGERPRINT_PROXY_URL` and `VITE_CRASH_REPORT_URL` (the secrets `deploy.yml` uses). The song ID's is set, so the app has song ID now; `VITE_CRASH_REPORT_URL` is empty in this repository, because the report Worker was never deployed (`docs/crash-plan.md` steps 4 and 5: `npm run deploy:reports`, then the secret), so neither the site nor the app shows Send until the owner does that, and the next build of either picks it up. Both Workers' origin lists already name `http://localhost:<port>`. *Measure:* `npm run desktop` reads each address this run was given out of the bundles the app's page loaded and sends that Worker a preflight from the app's origin, asking for the header the app sends (a build that lacks an address its run has fails; with neither, the line skips). The network-off line exempts the two Workers' hosts: with the song ID's address in the build, the tone of the System audio phase makes the music intelligence ask the Worker what is playing, and the guard refuses it.
- **23.17f. A Google sign-in from the app signs the browser in, not the app.** 23.17d's browser hand-off brings the account's key to the app, which is all the door needs, but the app's window stays signed out, so what needs the account inside it (cloud sync of looks, 13-sync; the profile sheet's name) does not have it. Hand the session over too, with an OAuth loopback sign-in in the browser that returns to the app's server (Google's own way for desktop apps), not a token in a URL. *Measure:* a check signs in with Google in a browser beside the app and reads the app's sheet naming the account.
- **23.17g** (**shipped**, this PR): a key opens the Mac app on two Macs, not any number. The Worker counted machines (`POST /activate`, two per key) but nothing asked it; the show server's own count is per Mac. Now the page asks (`src/lib/macSeat.ts`, called from `activateLocalLicenseKey` in `src/lib/licenseKey.ts`, only in the build the app ships, `VITE_MAC_APP=1`, with the Worker's address already in it) before a key is filed. The Mac's name for the count is a random id kept in the licence file (`seatId`, `server/server-license.js`), not the host name, which two Macs can share and an owner renames; the Worker's refusal now names the Macs holding the seats (`labels`) and the door says which. "Remove from this computer" gives the seat back at the Worker (`deactivateLocalLicenseKey`). Offline is not a refusal, by the never-lock-out rule (23.10): a Mac the Worker cannot be reached from opens on the key's signature, is filed as unconfirmed (`seatConfirmed`), and at every online start (`syncServerLicense` → `confirmHeldSeat`, which asks again even for a seat it holds, the Worker answering a known seat as a refresh) is seated and filed as such for the offline starts after; a refunded key, or a full key on a Mac the Worker never seated, leaves the Mac from its next start (`retireStoredLicenseKey`), never from the page it is showing. A "full" for a Mac the Worker had seated only marks it unconfirmed, so a hiccup in the Worker's store cannot take the app off a paying Mac; the start after, still full, retires it. This is what lets a refund reach a Mac that typed the key in at the door with no sign-in (`heldKeyRefunded` needs the window signed in under the key's email) — 12h. *Measured:* `npm run license-worker` 12a–12j (the real `licenseKey.ts`, bundled as the app builds it, and the real licence manager, five Macs against one key: a third is refused with the two named, a release frees a seat, an offline Mac is let in and sorted at its next online start, a refunded key says so; 12f is the control, the same page built for the site, which asks nothing and opens a third Mac). *Open:* a seat is lost for good when its Mac dies, is sold or has its data folder wiped, because only that Mac can give it back; the refusal tells the buyer to remove it on a Mac they no longer have, and only a hand edit of KV frees it (the review of #524). Now that every online start refreshes `activatedAt`, the Worker could let a seat unseen for N days be taken when the key is full. Lemon Squeezy sends `order_refunded` for partial refunds too, and the Worker revokes on any of them; read the order's `refunded` or `status` before a refund of an upgrade does this much. The packed app's own line (`desktop`: a third Mac's first start refused) needs a Worker for the app to reach and is not built, so the app's wiring is read through the page code only; and a Mac that never goes online is not counted at all, which no check of a signature can change (23.17h's lease would).
- **23.17h. A timed lease, if refunds kept offline become a problem.** 23.17d chose no grace period (above). If the owner wants refunds to bite offline, the key the app keeps would carry a renewal date (say 60 days) that each online start renews, and the door would say so a week ahead, never mid-show. The owner's call; not started.
- **23.17i** (**shipped**, this PR): refunding just an upgrade order takes the buyer's Home key back to them. Found in the review of #494: an upgrade files the Pro key over the Home one under the same id, so the refund of the upgrade dropped the only record and revoked the id, and 23.17d then took the Mac app off the buyer at the next start. The upgrade now keeps what it replaced (`replaces` on the Pro record) and the refund files the Home key again (`refileHome`, `server/license-worker.js`), signed afresh with the Home entitlement (`issuedAt`, `updatesUntil`, `maxMachines`) the buyer bought, rebuilt from the Pro record when it predates `replaces`. It gets a new id (`<proId>_home_<upgradeOrderId>`), not the Pro key's: the Pro token verifies offline for ever, and a Mac holding it keeps it while `/keys` lists its id (`heldKeyRefunded`), so the id has to leave the list and be revoked. Refunding the Home order itself, which the upgrade stood on, still takes every key. *Measured:* `npm run license-worker` 11a–11d; on the old Worker 11a–11c fail (`keys after=0`) and 12a fails for want of the Macs' names (4 of 26 red, 22/26), with the new Worker 26/26. The Worker is deployed by hand from the owner's Mac (the owner's OK first); until it is, the live Worker still refunds as before. An upgrade filed before this change has no `replaces`, and its refund rebuilds the Home key from the Pro record (11c).
- **23.17j. A `?cast` page runs the plate with no licence.** The door is for the show (`main.tsx`, `show` excludes `?remote` and `?cast`); a cast mirrors the show's canvas, but in a browser where it cannot it asks for its own GPU and draws, so `http://localhost:3000/?cast` on the app's server is a plate with no key. Hold a cast with no show to mirror behind the same door. *Measure:* `npm run desktop` opens `?cast` in a plain browser on a keyless app and finds no plate.
- **23.17k. Electron's fuses, with 13.1-sign.** The packed app still honours `ELECTRON_RUN_AS_NODE`, `--inspect` and an edited `app.asar`; Electron's fuses (`RunAsNode`, `EnableNodeCliInspectArguments`, `EnableEmbeddedAsarIntegrityValidation`, `OnlyLoadAppFromAsar`) close them, and the integrity one needs the signed build. *Measure:* `npm run desktop -- --packaged` reads the fuses off the binary.
- **23.17m. The Mac app's findings from the security audit (2026-10-28), shipped.** (4) OSC has no show key, so anyone on the venue's Wi-Fi could drive the show; the app now opens with it off, and *Show → OSC input* turns it on for this Mac only (127.0.0.1) or from the network (0.0.0.0), live (`setOsc` in `server/remote-server.js`) and kept in `show.json`; `OSC_PORT` in the environment still decides outright, and `OSC_BIND=127.0.0.1` narrows the terminal server. A menu on the laptop with no phone version, on purpose: a phone that could open the show to the network would hand that to whoever holds its key. (7) Electron 44.10.0 and `npm audit fix` in `desktop/` (0 advisories). (9) A packed app quits when launched with `--remote-debugging-port` or `-pipe`, unless Node's inspector is already open (the build whose fuse is open, which the check drives). (10) `/license-info.json`, `/license-activate` and `/license-deactivate` turn away a request that came from another site (`Sec-Fetch-Site`, `Origin`) and a POST that is not JSON. (13) `disable-library-validation` and `allow-unsigned-executable-memory` are out of the entitlements. *Measure:* `npm run tiers` 3b (fails on the old server), `npm run desktop -- --packaged` lines `OSC closed`, `no debugger`, `entitlements`. *Open:* the entitlements line proves the start on the hardened runtime only in a build signed with the Developer ID; a pull request's build is signed ad hoc now that the signing secrets stay out of branch runs (23.17-cikeys), so the first signed dispatch from `main` is the proof (this PR's own Mac run, signed before that landed, started the packed app on the narrower entitlements and passed), and `disable-library-validation` goes back first if that build will not start. A lease for a key that has not been online in some days (finding 8) is 23.17h, the owner's call. Art-Net in is also unauthenticated UDP and off until a map is set: give it the same *Show* choice if it is ever turned on by default.
- **23.17-cikeys** (**shipped**, this PR; the security audit of 2026-10-28): the Mac app's build handed the owner's Developer ID certificate, its password and the Apple notarisation password to every same-repo pull request's run (`desktop.yml` on `pull_request` with `CSC_FOR_PULL_REQUEST`), beside that branch's own build config, npm scripts and dependencies; and any workflow a branch wrote could read them, and the site's deploy key, as repository secrets. Now the build signs only on a Run workflow on main, in the `mac-signing` environment, with each signing secret passed under that condition; a pushed `desktop-v*` tag no longer releases (its run is the tag's own copy of the file); the deploy runs in `firebase-live`; every workflow is read-only at its top; the Firebase deploy action is pinned to a commit. *Measure:* `npm run cisecrets` (Measure · logic), each rule red on a broken copy of the real file first; `npm run updates` holds the release to main. *Owner, in Settings → Environments:* create `mac-signing` and `firebase-live`, each with deployment branches "main" only and no reviewers, add the five signing secrets to the first and `FIREBASE_SERVICE_ACCOUNT` to the second, then delete the repository copies (desktop/README.md). Until then the files already keep the signing set out of pull requests' runs, but a branch that edits a workflow could still read the repository copies. *Open:* a pull request no longer proves the signed path (hardened runtime, entitlements, notarisation); the next Run workflow on main does. If that gap bites, a signed check after each merge that touches `desktop/` is the fix, at about 40 Mac minutes a time.

**Against VS** (2026-10-11, §30). Imaginando's VS 2 is €129 on desktop (plugin and
standalone, NDI, Syphon and Spout out, a 4K60 recorder), a paid iPad app, and free
with an unlock on Android. Pro at $199 sits above it, so Pro's pitch leads with what VS
does not do: a simulated liquid rather than a stack of shaders, the room's lights
(Art-Net), the phone as a remote, and several projectors.

## 24. Modular rigs: patch the rack into the liquid

*Asked 2026-10-04: how to sell ChromaGlass straight to modular (Eurorack) synth players,
and what would make it easy to bring into their shows. The owner put all four steps
below into the plan the same day.*

**Why not just the line-in.** Every visualizer has a line-in, and ChromaGlass's asks the
interface for one channel (`App.tsx`, `channelCount: 1`), so a stereo mix arrives folded
to mono. A modular player's sound is not one mix: the kick, the bass and the lead each
leave the rack on their own cable, and the rack runs on gates, control voltages and a
clock pulse rather than on MIDI. What makes a thing feel like it belongs in a rack is
that it can be patched. Many of these players already own a DC-coupled interface for
VCV Rack or Bitwig (Expert Sleepers ES-8: 4 DC-coupled inputs, 8 outputs, ±10 V,
class-compliant; ES-9: 14 in, 8 out; MOTU's UltraLite mk5 has DC-coupled outputs only),
so the interface is the dongle and needs no driver on a Mac.

**What already reaches them, with no new code.** MIDI clock, Start, Continue and Stop
into the beat clock, MIDI timecode, and MIDI learn from any CC or note (`midi.ts`), which
hardware sequencers (Hermod+, OXI One, Polyend Tracker, the Elektron boxes) drive, and so
do CV-to-MIDI modules (Befaco CV Thing, Expert Sleepers FH-2, Doepfer A-192-2). OSC
through the show server, which VCV Rack reaches with trowaSoft's cvOSCcv module (CV
sent as OSC, up to 32 more channels with its expanders) and monome norns speaks itself.
§13.4's OSC write-up should name both.

**The one fact that shapes the steps.** Chrome hands a page at most two input channels,
whatever the interface has, on macOS and on Windows: Chromium's
`AudioManagerMac::GetInputStreamParameters` keeps a device's channel count only when it
is two or fewer, the Windows code sets discrete input devices to two outright, and the
request to lift it (crbug 40403559) has been open since 2015. The Electron app inherits
the cap unless it reads the interface natively (inferred, not tested). With echo
cancellation, noise suppression and auto gain all off, Chrome skips its WebRTC
processing, where the high-pass filter lives, so DC on those two channels probably
survives; whether the OS or driver blocks it is unmeasured. So the site gets two
channels and the app all of them, which fits §23's rule that paid is what a page cannot
do. (§5's "an ear per input channel", 5-channels, says browsers "differ" above two: they
do not, Chrome stops at two. That item is now 24.1's audio half; its home is here.)

### Steps

- **24.1** *Patch inputs* (two PRs). A Patch panel lists the interface's input channels,
  each with a live scope, and makes each one of:
  - an **audio voice**: the channel is one instrument, and its onsets and level feed
    sound learn and the plate's sources by name (5-channels), so the kick channel drops
    and the bass channel swells with no guessing which band the kick is in;
  - a **gate**: a rising edge (with a threshold and hysteresis, so a slow envelope does
    not chatter) fires any action a pad fires;
  - a **CV**: a voltage rides any learnable setting as a MIDI fader does, over a chosen
    range (0–5 V, 0–10 V, ±5 V) and the setting's own curve, smoothed by a frame;
  - a **clock** at 1, 2, 4, 24 or 48 pulses a beat into the beat clock as a tempo
    source beside MIDI clock and tap, and a **reset** that is bar one: the downbeat a
    MIDI clock never carries.
  Learned as MIDI is: touch the cable, and the channel that moves is the one picked.
  Saved with the show and in the MIDI map file. Volts are read off the interface's
  full scale (the ES-8 and ES-9 are ±10 V at full scale), with a calibrate step that
  reads 0 V and a known voltage for any other interface. The phone's remote shows the
  Patch page read-only (what each cable does, live); editing is on the laptop.
  - **24.1a** (lanes D and B, after 1.5): two channels, on the site and in the app,
    through `getUserMedia` with `channelCount: 2` and a `ChannelSplitter`.
  - **24.1b** (`desktop/`, after 24.1a and 13.1-sign): every channel in the Mac app,
    read natively (Core Audio through a small native module) and handed to the page
    as the same sources. Paid (§23). The Windows app's with 13-win-app.
  *Measure:* a new check, `patch`, that feeds a page a generated multichannel WAV as its
  fake capture device: channel 1 a gate at 120 bpm, channel 2 a slow DC ramp, channel
  3 a 4-pulses-a-beat clock with a reset every 16 beats. Every gate fires its action
  within one frame (count equal, none doubled), the ridden setting tracks the ramp
  within 2 % of its travel, the clock reads 120 bpm, and the bar grid's one lands on
  every reset. In the app, the same with all channels. By hand on the Mac with an ES-8
  (docs/judging.md, next free number at merge): DC on the site's two channels, measured.
- **24.2** *The interface picked at soundcheck is the one the show hears, and comes back
  after a knocked cable.* This is Wave 1's 1.5 (14s) and 1.6 (14g); a rack is plugged
  in at soundcheck and knocked at the gig, so 24.1 is not offered before both ship.
- **24.3** *MIDI notes as voices* (lane D then B, one PR). A sequencer's notes play the
  plate rather than press a button: a channel picks the tool and the liquid, pitch the
  dye (or a place on the plate, by a scale across it), velocity the drop's size, and a
  held note pours for as long as it is held. It is a binding kind beside `setting`,
  `action`, `preset` and `dye` in `MidiTarget`, learned from the first note that
  arrives, so one learn covers every note on that channel. Start as bar one is 14e's
  (Start and dropout) and 5-downbeat's; 24.3 does not do it twice. *Measure:* beside
  `npm run desk`'s MIDI lines, a page fed a recorded sequence of notes on two
  channels: one drop per note-on, the dye by pitch, the size rising with velocity, and
  a held note's pour lasting its length within a frame.
  *Moved up and widened (§30, 2026-10-11).* Sequencer apps in an iPad host (AUM, Loopy
  Pro, Drambo) send notes rather than CCs, and Imaginando's VS is played by notes firing
  envelopes. Two additions: each channel's pour gets an attack and a release, so a note
  can swell in and fade out rather than start and stop; and notes become a patch-bay
  source (`notes`: velocity, pitch, held, per channel), so a note can ride any setting
  the way a band does. The measure adds a held note whose pour rises over its attack
  and falls over its release, each within 10% of its time.
  *Chords placed (VS 2, 2026-10-24).* VS plays four voices a layer, held notes stacking
  into a chord with each voice somewhere else on screen. Here a chord lands as several
  drops at once, spread across the plate by pitch (a scale across it, as above), each a
  real pipette drop whose volume is its velocity, meeting the others by the liquids' own
  immiscibility. Each channel has a voice cap (four by default; the oldest held note gives
  way) so a pad held on ten fingers does not flood the plate, and a channel can be sent to
  an area (25h). The measure adds a three-note chord: three drops in one frame, ordered
  across the plate by pitch, and a fifth held note releasing the first.
  *The melody walks across the plate (24.3-place, direction B of the owner's 2026-10-24
  exploration; after 25h).* The same scale across the plate, heard from the microphone as
  well as MIDI: the lead note's pitch (the `note` source, a fast reading) places its drop,
  low on one side and high on the other, so a played line draws across the plate; how hard
  it was hit sets the drop's volume. Each is a real pipette drop of the look's liquid, so
  neighbours merge or hold apart by immiscibility. First on **Aurora Borealis** (lead notes
  drop jade and lavender along the curtain's top and the current draws each run into a
  ribbon) and **Oil and Water** (each note a bead of amber oil, a chord a cluster that
  rounds into bodies and merges where they touch). *Measure:* a synthetic rising scale on
  the microphone path lands its drops in pitch order across the plate, one drop per note.
- **24.4** *CV out* (after 24.1b). The plate back into the rack through the interface's
  DC-coupled outputs: how much dye is moving, where the brightest pool sits on the plate
  (x and y), the colour under a point, and a trigger when a drop lands. Then the liquid
  modulates the synth and the loop is the show, which no comparable video module does
  that way round. Read on the GPU from the readouts the governor and the flash guard
  already take (no new full-plate readback), sent a frame at a time and smoothed at
  audio rate so a step does not click. The site may reach the first two outputs
  (`AudioContext.setSinkId`, Chrome 110 and later, then a `ChannelMerger`); the app
  reaches all of them. *Measure:* a page whose output is captured back as a WAV: the
  dye-motion output rises within a frame of a stir and falls when the plate rests, and
  the drop trigger counts the drops.

**Later, not a step yet.** No laptop: an iPad with a class-compliant interface (the ES-8
is class-compliant on iOS) and HDMI out through Apple's USB-C Digital AV Multiport
Adapter, which carries HDMI and a USB device together; the two working at once on one
iPad is unverified. It rides on §12's app, not a box of our own. A Eurorack module of
our own is not planned (hardware, stock, a different business).

**Reaching them** (with 23.7's free beta). A one-minute patch video (a kick's gate into
the interface drops on every hit, an LFO makes the colour breathe, a clock and reset
change the look on the bar) posted to ModWiggler's Video Synthesis forum, lines
(llllllll.co), r/modular and r/videosynthesis, and sent to the creators who already
review video synths. Ask Expert Sleepers to list ChromaGlass as working with the ES-8
and ES-9. Superbooth 27 is 6–8 May 2027 in Berlin. The dedicated video synths cost
$400–1,500 (EYESY, Hypno, Structure, Videomancer), which is the price to sit under.

## 25. Areas of interest: several places on one plate
**Partly shipped**: areas of interest in `src/lib/plateAreas.ts`, with three looks rebuilt on them and Fillmore East filling the screen. What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

The owner, 2026-10-04: Velvet Underground "underwhelming", then Lumia, and "I need more
complexity across presets in general. I want to have multiple areas of interest in
different parts of the canvas."

**Fillmore East fills the screen (25g, shipped with 25a).** The owner: "it only takes
up a small amount of the canvas... should zoom in so the entire plate takes up the
canvas." Its Dish Spread 0.85 drew each plate as its own dish on black: the lead one
0.71 of the frame's height across (about 40% of a 16:9 width), the second 0.45. Now 0:
both plates over the whole screen (the lab, a square frame: 44% of it lit → 99%). No
other look sets Dish Spread. Four set Dish Vignette, a round dish edge with black beyond
it, which on a 16:9 screen leaves the sides dark: **clock-glass** 0.8 (the dish 65% of
the width; that look is the "Clock glass and ferro looks" work's), **oil-wheel** 0.7
(71%), **fractal-dream** 0.5 (81%), **home-movie** 0.3 (91%). Those are round on
purpose; the owner says which, if any, should fill the screen too.

**Next looks to move (25b, one PR each or a few together, measured the same way):**

1. **deep-ocean**: Center Gravity 0.8 pulls everything into one middle pool; layers of
   glycerine and syrup in separate places are what depth looks like.
2. **fillmore-1969**: the reference light show, two projectors, Beat Squeeze 0.9 and
   both routes on the bass all in the middle; its oil, silicone and milk want a place each.
3. ~~**bass-drop**~~ (shipped with 25h): three soap wells on the bass, taken in turn,
   Center Gravity 0.4 → 0.15.
4. **poster-1969** and **roy**: flat poster shapes, bass on both routes and the squeeze
   in the middle; a shape per area keeps them separate shapes.
5. **oil-on-water**, **glycerine-drift**, **milk-marble**, **home-movie**, **crowd-plate**:
   each liquid look's bottles in places of their own.
6. ~~**jellyfish-bloom**~~ (shipped with 25h): its four bells laid in four areas, a band
   each (OWN_SEED_AREAS: its own seed lays the bells there).

Kept centred on purpose: galaxy, solar-flare, stardust-collapse and fractal-dream (their
picture is a centre), and classic (the picture `npm run fx` measures). The ferrofluid
looks and Clock Glass are the "Clock glass and ferro looks" work's.

**Open, found building it:**

- **25c. The hand works in the room, not on the glass (a shortcut).** An area is in the
  dish's frame, so it turns with the glass, and the music's hands follow it round. A
  liquid laid in the dish does turn with it; a projectionist's hand stays where it is
  while the dish turns under it. At Velvet's motor (one turn in about six minutes) the
  difference is invisible; on a look that spins (acid-trip turns in about 20 s) the
  hands should stay put in the room and the areas' liquids turn away from them. Needs
  the dish's angle (`plateAngle`) to turn a room-frame point into the grid.
- **25d. The second plate of a two-plate area look.** A back plate with a look of its
  own takes that look's areas whole (its pools, liquids, hand-off pours, drops and
  music). The second plate of a two-plate look (Velvet Underground) lays nothing at
  first (laySecondPlate), as before, and takes the automation's area drops only; it
  could lay its own pools offset from the front's, so the two plates' areas overlap
  in part, as two projectors' do.
- **25f. Cell Bloom's cells are drawn by the camera, not grown (a painted effect,
  not new here).** Paint Cells (`macroDetail`'s `cellField` in wgsl/plate.ts) draws
  rings over any dye under the closeup, clumped by noise; the silicone poured in its
  pools does not make them. In a real pour, cells are silicone oil and a lighter
  paint rising through a denser one and opening where surface tension is lowest
  (Marangoni and a density inversion). With 18f's heat and 18d's densities the
  solver could grow them where the silicone is, and the camera would only shade
  them.
- **25e. A film measure for it.** `npm run film` measures near-black, hues and swells
  over the whole frame; it has no number for how many separate places hold something.
  The lab's count of lit regions (connected cells over density 0.3, each over 1% of the
  plate) is the measure used here; it belongs in `watch.mjs`'s shape() so every look
  can be held to it on the Mac. With it, a Mac check that the app uses the areas:
  `npm run plate` holds the table and the helpers, but nothing it runs reaches
  `LiquidVisualizer.tsx`, so a kick put back in the middle would pass it. Load Velvet
  Underground, fire kicks, difference the dye frames: the change should centre within
  about 0.06 of the bass area (turned by the plate's angle), and on classic at the
  middle (the check-skeptic's design).
- ~~**25h. Areas that listen for themselves**~~ (shipped: a cord aimed at one area heats,
  stirs with a paddle, pours or picks a bottle there, on a gate; a colour family per area;
  Velvet Underground, Jellyfish Bloom and Bass Drop on it; `npm run areacords`). Story in
  `docs/plan-shipped.md` §25. Open, found building it:
  - **25h-1. A warm spot opens no hole yet (a named shortcut).** An area's heat is real heat
    in kelvin, carried and cooled as the lamp's is, and what it does is what 18f gave warm
    liquid: it rises on an upright plate and thins the water in the gap (18f-4's shortcut).
    The surface pulled away from a warm spot, which is what a projectionist's heat is mostly
    for, is thermal Marangoni (18f-2, reverted with #352). Velvet's kick heats its soap well,
    and until 18f-2 lands the ring there is the kick's own hand and the soap's. When 18f-2
    lands, `npm run areacords` should add a heat cord that opens the well's surface on a
    level plate, against the same cord with the heat off.
  - ~~**25h-2. The gate on every cord, and the rest of 30a.**~~ Shipped with 30a (`PatchBay.fold` holds a `CordGate` per whole-plate cord keyed by what the cord is and clocked from `fold`'s `now`, while area cords keep `CordGate` in `AreaHands`; `npm run soundcords`).
  - **25h-3. Area cords on the back plate.** They work on the plate the music plays, in its
    areas; a back plate with its own look has that look's areas (25d) but the front look's
    cords do not reach them, and the panel greys Plate for an area cord. With 25d.
  - **25h-4. Beads in one area.** The exploration had Velvet's hats set beads in the syrup;
    Beads is one number for the plate (the BeadField's amount), so the hats pour the syrup's
    bottles instead. A local bead source (the field's spawn masked to an area) would be a
    fifth act.
  - **25h-5. A look saved under its own name has no areas**, so its area cords do nothing:
    areas are keyed by built-in id, as the dye's seed is (plateAreas.ts). A saved look
    should carry its areas with it, or name the built-in it came from.
  - **25h-6. The paddle turns with the dish** (25c's shortcut applies): an area turns with
    the glass, and so does the paddle tending it. Invisible at these looks' motors.
  - **25h-7. The Mac's measure of the rebuilt looks.** The lab plays each look's own cords
    on its areas; the music's own hands (Bass Drop's kicks taking its wells in turn, the
    kick's ring and press on Jellyfish's lowest bell) live in the visualizer's loop, which
    only the Mac's app run reaches. That is 25e's lit-region count in `watch.mjs`, run on
    the three looks before and after this.
  - **25h-8. A Go between two area looks lands the old look's cords on the new one's
    areas.** The crossfade fades the outgoing look's cords out over the Go (lookFade.ts),
    and an area cord names its area by index, so for up to the fade's length Velvet's kick
    heat on its soap well (area 1) heats Jellyfish's lowest bell. A cord should carry the
    look it was written for, or the fade should drop the outgoing look's area cords at once
    (they are hands, which a Go can let go of, not settings that must not jump).
- **25i. Colour that answers the music** (direction C, 2026-10-24; after 25h). Once each
  area has its own family (25h), the music picks which bottle pours next. (1) **By the
  note**: a patch source that maps the lead note's pitch class (a fast reading: the
  `note` source's pitch) to one of the area's bottles, the colour-organ idea behind
  Wilfred's Lumia. First on Poster, 1969: the lead chooses between orange, ultramarine and
  a third ink, still flat and hard-edged. (2) **By chemistry**: a hit is a drop of reagent
  and the colour change is the reaction's own. Red Cabbage already simulates pH: the snare
  drops acid in one area (pink), the kick base in another (green), and where they meet they
  cancel to purple. Chemical Clock: each kick touches the gel in one of three areas and
  starts a new wave centre there, as a touch sets off a real dish of the reaction. No hue
  dial is turned in either: the colour is the bottle chosen or the chemistry. (3) **More
  than five dyes**, only if (1) and (2) show three areas starved for colour: the dye count
  is a GPU cost (each dye a channel in the dye's step), measured with `npm run stages`
  before and after. *Measure:* a synthetic note sequence of known pitch classes pours the
  mapped bottle each time (in the lab); on Red Cabbage, synthetic snare and kick bursts
  move the pH inside their own areas at least 5x more than outside.
- **25j. A lamp under each area** (direction D, 2026-10-24; after 25i). Each area sits over
  its own lamp whose brightness and warmth follow its band, and a gel can turn a step on a
  hit, as the old shows ran several projectors and colour wheels. Since 18f the plate's
  heat comes from the lamp, so a brighter lamp warms its area too and the liquid answers
  (the warm water thins and spreads; 18f-4's warm-water shortcut still applies and is named
  in the PR). First on **Lava Lamp** (two lamps under the wax; the bass warms one side, the
  mids the other, and the wax rises from whichever the music feeds), **Cell Bloom** (the
  kick warms each cell pool's lamp in turn) and Velvet Underground (each pool a little
  warmer while its instrument plays). A lamp that pumps reads as flicker, so each takes
  25h's attack and release, never a frame's step; and the flash guard reads one number for
  the whole wall (14r), so 14r reads per area first, in the same PR or before it.
  Nothing moves the frame. *Measure:* in the lab, a band's lamp raises the light and the
  heat inside its area at least 5x more than outside, its rise and fall within 10% of the
  cord's attack and release; and the flash guard's per-area reading catches a pumping lamp
  that the whole-wall number misses.


## 26. A reaction that prints: Turing stripes in black and white (proposed 2026-10-05)

The owner sent a VJ pack ("Mask Reaction Diff", made with Karl Sims' RD Tool and
smoothed with an FXAA plugin, 1h): black-and-white labyrinths, fingerprints and combed
stripes that grow out of a shape and are dragged into whorls. Worth a look of our own,
because most of it is already on the plate, and what is missing is real chemistry, not
an effect. What it is, physically: a **Turing pattern**. Two reactants diffusing at
different speeds, one feeding the other, settle into stripes or spots of one fixed
width. It is real in a dish: the CIMA/CDIMA reaction in a gel (Castets, De Kepper, 1990)
grows exactly these labyrinths, and Gray–Scott is the model of a cubic autocatalysis
like it. On a projector a pattern reads black and white when what it makes is an opaque
precipitate in a clear liquid under a white lamp, the way Liesegang's bands already
print (18b's lamp ground, 18l's absorbers).

What the plate had when this was proposed, and what was missing:
- **Gray–Scott** (`src/lib/chemistry.ts`, the `chemistry` setting; Sensual Laboratory
  0.85, Neon Coral Reef 0.7) runs on the CPU at the solver's grid with feed and kill fixed
  at 0.042 / 0.062 (`LiquidVisualizer.tsx`, `chem.step`), so it only ever grows coral.
  It deposits dye that the flow carries, but the reactants sit still under the stir
  (18k), so it can never be combed into the whorls in the owner's pictures.
- **BZ** (Oregonator, 256² GPU grid) and **Liesegang** (128², 1b) are real reactions on
  their own grids; neither makes stripes of a fixed width.
- **The ferrofluid maze** (9aa) is a labyrinth too, but a magnetic one (dipoles
  repelling within a surface), and stays the magnet's.

Steps:
- **26a. Gray–Scott on the GPU, carried by the flow (shipped, #327; carried once since
  26d).** Story in `docs/plan-shipped.md` §26.
- **26b. The pattern as a control (shipped, #327; Width in plate units and the phone
  version with 26d).** Story in `docs/plan-shipped.md` §26.
- **26c. Where it grows: the poured liquid is the reagent (shipped in part, #327, #331).**
  A pour of Turing Reagent feeds and seeds the reaction where it lands on any look, with
  its own pattern baked in (`npm run turing`: 70% of a pour grows, specks with no reagent
  nothing).
  - **26c-1, open.** A shape, a word or the camera laying the reagent, as images already
    pour (`injectImage`): the owner's "grow mask".
- **26d. The look: "Turing Print" (shipped).** Story in `docs/plan-shipped.md` §26;
  the owner's eyes owed (`docs/judging.md` §46).
  - **26d-1, open: the print's cost at 512².** The reaction takes as many substeps as its
    diffusion needs (two at 512² and the default width, up to six at Width's top), and
    the target was under 0.3 ms at 512². Only the Mac can say (`npm run stages`).
  - **26d-2, open: a harder edge than the chemistry gives?** The print's edge is the
    starch–iodine binding's own (a Hill curve, n = 6), about a fifth of a stripe wide:
    soft at a close zoom. The owner's pack is a Karl Sims render through FXAA, harder
    than a dish. If the owner wants that, it is a choice to make, not physics; the plate
    could threshold the reconstructed field at screen resolution, as Ben-Day's edge does.
  - ~~**26d-3. Other colour in a fed print**~~ (**shipped**; story in
    `docs/plan-shipped.md` §26): a poured colour shows under the print, and the print
    has its own ink (`turingInk`, desk, phone, remote, MIDI).
  - **26d-3a, open: the ink is a bright hue, not a depth.** The plate reads the print's
    rgb as a colour at a fixed density, so starch's own indigo prints black and any hue
    must be drawn at full strength to print as itself. A hue that printed lighter, as
    Chemistry's tints do, would need the plate to read the print as absorbance, which
    means a binding in the plate shader (it is at the 16-binding limit).
  - **26d-3b, open: the print over a pour is multiplied, not mixed.** Under the print,
    a pour of red and a green ink print dark where both are, because the plate
    multiplies. Right for dye on a lamp; the owner may want the print to win (judging §46).
  - **26d-4, open: the dish starts empty of substrate.** The field is cleared to u = 0, so
    on a look with the bath the first seeds die before the bath fills the plate (a third
    of a second); a cleared dish under a bath should start at u = 1. And the reaction's
    rim row writes (1, 0, 0, 0), which wipes poured reagent at the edge.
  - **26d-5, open: half floats where the GPU cannot filter full ones.** The reaction's
    field is in full floats where the dye is (the first Metal run found the stripe 14%
    wider at 512² than at 256²: half floats round the substrate's last refill away, and
    the Mac rounds them toward zero; the story in `docs/plan-shipped.md` §26). A GPU
    without `float32-filterable` (many Android phones) keeps half floats, so its
    substrate stops 0.3–0.5% short and its stripe is a little wider. Storing the substrate's
    deficit 1 − u instead of u would give half floats their fine steps where u is near
    1, on every GPU and at half the bandwidth, and would make a cleared dish full (26d-4).
  - ~~**26d-6. The print keeps evolving**~~ (**shipped**; story in `docs/plan-shipped.md`
    §26): `turingDrift` slides the feed and kill along the saddle-node curve across the plate
    on a 40–90 s clock (desk, phone, remote, MIDI; the Turing Print preset sets 0.7).
    Shortcuts named: three plane waves, not a noise field; the saddle-node line, not
    Pearson's full regime boundaries; a fixed-rate clock that follows no music.
  - **26d-6a. More ways for the print to evolve** (grey patch and regime glide **shipped**;
    story in `docs/plan-shipped.md` §26): the drift's k is now the saddle-node curve plus a
    margin that glides each region between stripes and spots on slower waves (50, 80 and
    120 s), which also removed the grey patch at Drift 1. Still open, each its own step:
    - **The Drift slews, it does not step**: the visualizer hands the solver the setting
      moved at 0.025 a second (`TURING_DRIFT_PER_SECOND`), because 0.7 handed to a settled
      print at once starved a tile for about 20 s. A faster slew needs that number
      re-measured with `npm run turing`, which reads the rate from the source.
    - **A true noise field** for both maps (patches, not diagonal bands).
    - **Light as the kill** (CIMA is photosensitive; the lamp's level would move k).
    - **A slow ink-hue glide** (26d-3).
    - **Periodic reseeds**.
    - **Metal's numbers** for the regime glide: the cap line (`0.0105 - 0.15 F`) was fitted on
      SwiftShader, and Metal rounds half floats toward zero; read `npm run turing` line 9
      off the `fifth` shard, and ask the watcher for a look if the pieces count differs.
    - **The cap line is a straight line, and it is too generous at the corners**: the
      review held each corner of the drift range for 9000 units (stripes settled at F 0.04,
      k 0.06, 60 seeds, k = curve(F) + share x cap(F), alive share = cells with v over 0.1).
      F 0.02 collapses to 6–7 % alive at share 0.25 and 0.9 (flat); F 0.05 at share 0.9
      starts at 0.079 and recovers to 0.228; F 0.06 at share 0.25 recovers 0.089 to 0.392;
      F 0.06 at share 0.9 stays at 0.061, flat. At F 0.06 and share 0.9 the margin is 0.00135
      against about 0.001 measured as the limit, and below F 0.03 the cap is extrapolated
      from no measured point. A corner that collapses leaves a frozen sparse residue that does
      not regrow while held. The plate reaches those corners only where both waves saturate at
      once (|w|, |wr| over 2) at Drift 1, a small share of the plate for a few seconds at a time.
      Two steps: fit the cap through measured points (or Pearson's boundaries) including F
      below 0.03; and give `npm run turing` a held-corner line, F 0.06 at share 0.9 and
      F 0.02 for 9000 units, that has to stay over the alive band's floor. Measure the corners
      on Metal too.
    - **Grey smears in the app that the lab's grey-patch line cannot see**: on Metal
      (Apple M4, head dfec25f) `npm run turing` passes all 31 lines twice and the lab plate
      reads tile contrast 0.93 of the control at Drift 0.7 and 0.78 at Drift 1. But in the
      app (Turing Print preset, 60 s settle, frames at 0, 30, 60 and 90 s) the watcher saw
      soft blue-grey smears where the stripes lose contrast, 10–20 % of the plate in places,
      drifting about (upper-middle at Drift 1 at 60 s; centre-right at Drift 0.7 at 60 and
      90 s). The glide itself is clearly visible within a minute. Not known yet whether the
      smears are the look's poured dye showing under the print or the reaction going flat.
      The gap in the check: the line runs on the lab's plain plate (activator only), never
      on the app's poured look. Next step: in the app, read the chemistry field itself off the
      GPU at those frames and the same cells' contrast, to say which; then make the check
      read the app's plate, or the field in the app, so it can see this. Start here.
    - **The Pattern knob does not steer the drifting regime**: while the drift is on k is
      the curve plus the margin and ignores the look's own k, so only its feed counts. A
      look that wants more spots than stripes needs a "spots share" input, not a k.
    - Whether the preset's 0.7 is the right pace, and whether the stripe-to-spot glide
      reads as chemistry or as the plate falling apart, is judging §55.
- **26-colour-a. The relief #327 described: not doing.** #327's message described the
  pattern's gradient as a bump on the plate's normal; the code never reached main (its
  plate shader was not in the diff, and the revert 8278374 had nothing of it to take
  out). A CIMA print is flat: the complex sits in the gel and does not raise it, so
  Turing Print draws no relief (Edge Relief 0 in the look).
- **26-colour-b. The coral as soft blurred rings (fixed with 26d).** Three causes: the
  deposit read the field on the logical grid, so it drew its top-left corner stretched
  1.3–2.7 times; the field was carried twice a frame, once by a bilinear backtrace that
  blurred it; its width was in cells. The coral looks (Sensual Laboratory, Neon Coral
  Reef) now grow a pattern half the size they showed, where it grew.

## 27. Every control does something you can see

The owner, 2026-10-05: "I feel like beat squeeze doesn't do too much (if anything). Also
turbulence and plate rock don't appear to do too much either. Many of the controls aren't
meaningful. Go through them all and fix them or remove them if they don't do anything or
are covered by a new control."

**The measure.** `controls.yml` on main (run 37379345453, the band playing, about forty
kicks heard a look): each ride turned from the look's own value to the far end, judged
against the look's own drift. On 20 of 24 looks: Turbulence visible on 5, Beat Squeeze 6,
Plate Rock 9, Swirl 3, Evolve Speed 5, Fingering 5, Lacing 4, Tempo Sync 4. On the `all`
shard's three looks about twenty more read nothing on all three (27d has the list).

- **27a. Plate Rock is the plate tipped (shipped, #305).** It went through the
  half-resolution current as a stir, 0.2 × the spring's swing × tanh of the dye over the
  mean, and its dial went as its square (the kick's shove × R, then the swing × R). Now
  the dial is applied once and, on a thin gap, the tilt is the dye's weight down the
  tipped plate in `hsBody`, with Rain Drip's: a pool slides downhill through the clear
  liquid at Darcy's speed and an evenly coloured plate does not move (`npm run rides`:
  forty pools rocked as the app rocks them moved 0.43 at full, 0.028 before; a look's
  own stir moves them 0.79).
  - **27a-1. The cover glass slides as the dish tips (shipped in #328, taken out by
    #340, back with its drift carried exactly).** #328 put it in and main's deploy of
    10-10 went red: with the band playing `npm run renders` drew 10–21 frames a second
    on the laptop and 11–15 on the phone against 26–32 before, and the same seed
    rendered twice differed (`render-app`). Two causes. The glass was not reset when a
    render starts (`resetPlateClocks` now resets `coverRef` with the rock). And the
    glass drags the whole film at half its slide, a drift of a few cells a step, and
    the carries cut a step into as many substeps as their fastest face needs
    (`CARRY_COURANT`): measured in the lab on the app's 384² solver, Plate Rock 0.2,
    0.45 and full asked 4.1, 8.0 and 12.2 substeps a step of every carry against 1.0
    held still. Now the carries ride the flow less the drift (`driftCells` in
    fluid.ts, `driftOff`), the flow seen from a frame going with the film, and every
    carried field (the colour and its species, the oil's colour, the poured liquids,
    the reaction, the mix, the ferrofluid) is moved with the drift (`driftShift`): its
    whole cells by a shift, which is exact, the fraction by one step of the carries'
    own limited flux. The drift is a model of the film's speed (hsPrep's drag lag at
    the rest gap, within 0.03 of a cell of the lab's plate); what it misses the plan
    carries in substeps, so a wrong guess costs time and never accuracy. And the
    dish's rim met the grid's wall at the middle of each side, where about ten cells
    either way were inside the rim and walled: the glass's flow piled against them at
    3.4 times the plate's speed and set the substeps itself. The rim is open there now
    (hsPrep), as it is everywhere else, and the substeps follow the faces inside the
    rim only (27a-6 says what that leaves). Lab, an uneven plate rocked and kicked as
    the app does it (384², 60 steps): 1.00, 1.03 and 2.17 substeps a step at 0.2, 0.45
    and full, against 4.1, 8.0 and 12.2 before. `npm run rides` 5c holds the default
    at the still plate's substeps (1.00) and full under 2.5.
    What it was: the tilt moves
    colour only where it is heavier than the plate's mean, so on a look whose colour is
    spread evenly a rock moved nothing (the Mac's controls run on #305: Rock visible on
    7 of 23 looks, "nothing" on Boiling Point, Crowd Plate, Red Cabbage, Clock Glass).
    The top glass rides on the film in the bottom glass's bowl and slides downhill as
    the pair tips, a damped pendulum (`stepCover`, lib/plateRock.ts: a 20 cm bowl 6½ cm
    deep, R_c 0.11 m, 2 mm of glass, the film's shear drag ρν/(m_A h) from the look's
    Thickness, 40 mm of rim room); its slide in m/s joins Glass Smear's glass speed in
    hsPrep, so the liquid goes at half of it. A shallow clock glass (R_c 0.18, 30 mm)
    rang the cover out to the rim from Plate Rock 0.2 on, and the dial read 9.4 cells at
    0.2 and at 0.45. Lab (`npm run rides`): an evenly coloured checker slid 0.0 cells
    with the tilt alone (and changed 0.157 with its red made heavier); with the glass
    3.7 cells at 0.2, 8.7 at the default, 13.5 at full, and 18.4 in a liquid 7.9 times
    thicker, each the way the glass went (gain 0.88–0.96 of half its slide, lagged by
    the film's drag time; correlation 1.00). The glass rests at R_c sinθ, swings at
    1.5 Hz on the default oil and creeps back without swinging in glycerine. A phone
    held tipped slides it too.
    - **27a-2, open.** Read Plate Rock on the Mac's `controls` run with the glass, on
      the even looks above, against a drift floor held still across runs (each look's
      own drift rose on #305 with the stronger kicks, so its ratios are not like for
      like).
    - **27a-3, open.** Glass Smear's own noise speed is laid × dt and then read × disp
      again (the 2026-10-06 audit), so at a slow look's Speed it moves the plate about
      a ten-thousandth a second; lay it in m/s as the cover's slide is.
    - **27a-4. Found: it was the cover glass** (see 27a-1). On #328's Mac run,
      `npm run renders` on the phone with the band drew 11 frames a second; it showed
      again on main's deploy of 10-10 on the laptop and the phone, and #340 took the
      glass out. Fixed with 27a-1's return: the drift is a shift, not substeps. The
      shift itself then cost half again on a step (QA-25), fixed by reading each cell once.
    - **27a-5, open.** One carry still rides the glass's whole drift in fixed
      substeps of 0.45 of a cell and so falls behind it: the clear film's holes
      (`filmAdvect`, wgsl/film.ts), which a sliding glass should carry with the
      liquid. Give the film `velRide` and `driftShift` as the other carries have. And the CPU fallback solver ignores
      `coverX`/`coverY` (a phone without WebGPU rocks without the glass).
    - **27a-6, open (a shortcut, named in 27a-1's PR).** The carries' substeps are
      now set by the faces inside the dish's rim only (`carryCourant`); past the rim
      each substep is held to its 0.45 of a cell. Counted, the faces out there set
      the substeps under the cover glass: the colour carried past the rim piles
      against the grid's wall (no face through the wall carries anything), heavier
      than the mean, and the tilt drives the pile on, 1.7 cells a step in the grid's
      corners where the dish went 0.6. Nothing past the rim is drawn, but it is a
      reservoir the plate draws back from, and at the four middles of the sides, where
      the rim meets the wall, the pile reaches into the picture: on an evenly coloured
      plate under full Plate Rock with the glass the colour in the outermost cells there
      swings between empty and the plate's cap of 6 a cell, and 13% of the plate's
      colour is cut off at that cap over two seconds (7% at the default 0.45; lab,
      192²; 14% at full with the rim's edge walled as it was, so it is the glass's
      drift into a walled square, as #328 had it, not this PR's opening of the rim).
      The real fix is to model what is past the rim: liquid that crosses the open rim
      leaves the film (and the tilt and the body forces do not act where there is no
      film), rather than a walled square round the dish.
  - **27a-7. Frame Sway: the music moves the liquid, not the frame (shipped).** The
    owner, the evening 27a-1 went live: "It moves around the x/y axis with sounds ...
    like the whole plate moves around under the camera. Make the liquids and their
    interactions the main focus." The cover glass drags the film, which is the whole
    picture: through a song's kicks at the default Plate Rock it slid the picture
    0.39% of the plate a frame on average and 0.72% at the peak (1.03% on the worst
    show stage), and the lamp jumped 0.32% a frame with the rock (`npm run framesway`,
    the frame loop's own spring, sway and cover at 60 frames a second). A new dial,
    Frame Sway (`frameSway`, 0 to 1, **0 by default**; desk, phone sheet, remote, MIDI),
    is the room between the two glasses' rims: at 0 the cover sits seated in the
    bottom glass's rim, as a clamped clock glass does, and drags nothing; at 1 the
    4 cm 27a-1 gave it. The lamp following the rock and the plate shader's two beat
    pulses (a kaleidoscope's turn and breath, the closeup's crinkle) ride the same
    dial. The tilt stays on: it moves only the colour heavier than the mean, which is
    the liquid's motion. `framesway` holds every shipped look and show stage at 0; the
    Mac's `render-app` holds the app's own frames to it on Classic with the band.
    Evolve never drifts it.
    - **27a-8, open in part.** What still turns or zooms the whole frame with the sound,
      each off at the defaults: nine looks route a band to the dish's turn
      (`audioMappings.rotation`, about 0.02–0.05 rad/s, slow), Auto Spin's Tempo, and
      ~~the closeup camera's kick punch-in and energy push when zoomed (`macroSync`,
      1.5–10% of zoom)~~. Read each with the owner: a slow dish turn is the oil wheel's
      own move. And Beat Squeeze's press spans the dish (Bass Drop at 0.8): measure its
      plate-wide radial part, which reads as a zoom on the kick.
      - ~~**The closeup's camera** (QA-31).~~ **Shipped** (the story in
        `docs/plan-shipped.md` §27a-8): Macro Sync's punch-in, push and treble tremor
        ride Frame Sway (`move = sync × sway`, 0 by default; the cut on a kick stays,
        an edit and not a move), the lead is the drop's own smoothed motion and not one
        cell's solver velocity, a cut lands on the drop's centroid, and the drops no
        longer random-walk. `npm run steadycam` holds every look and show stage to the
        bit in CI's logic part.
      - **27a-8-1.** Auto's own breathing zoom (two sines, up to 13% of the zoom on 17-
        and 57-second cycles, `macroCamera.ts`) and the dolly-out through each whip are
        camera moves with nothing behind them but the clock: a macro rig on a stand does
        neither. The owner's call whether Auto keeps a slow breath as its signature or
        sits as still as Hold and Follow (`docs/judging.md` §53).
      - **27a-8-2.** The camera aims from a readback of the density a frame or two old
        (`readbackAsync`), so Follow sits that far behind a fast drop. Measure the lag on
        the Mac and, if it shows, lead by the readback's age.
- **27b. Beat Squeeze presses the glass, not a palm (shipped, #305).** The kick
  pressed three discs a palm wide at 0.0024 × squeeze × bass: at the default squeeze and
  an ordinary kick a ring of colour 30 cells out went 1.7 cells and back. Now the discs
  span the dish (`KICK_RADII`) and the depth is `kickDepth` (0.005 × squeeze × (0.6 +
  0.4 bass)): 5.7 cells at the default, 11 at full. `npm run lift`'s "does not add up"
  floor is now a lone kick's own dip rather than 0.020.
  - **27b-1, open.** Let go, the ring comes back 87% of the way at the default and 79%
    at full; a squeeze film with nothing fingering should come all the way. The rest is
    the colour's first-order carry (18a-8).
  - **27b-2. The ferrofluid is given back too (shipped, #305).** The deeper kick drew
    Classic's poured ring of ferrofluid into the middle (`npm run ferrodrift` on the Mac:
    its mean distance 0.308 to 0.273 before the plate was even held; in the lab four
    kicks took it 0.307 to 0.253). The press moves the liquid up to 14 cells a step on
    256² and the ferrofluid took a fixed six substeps of 0.45 of a cell, so it went out
    short and came back in full. It now takes the colour's own substep plan (`phasePlan`,
    never fewer than six): the same four kicks leave it at 0.311 (`npm run rides`).
  - **27b-3. Breathing beat squeeze and organic liquid injection (shipped).** The owner
    found linear squeeze jumping too fast (only comfortable at 1%), and automated liquid
    additions looking too geometrically planned. Squeeze is now shaped quadratically
    (`squeeze²` in `kickDepth`), opening the bottom half into a gentle breathing range.
    The release uses a cosine ease (`0.5 * (1 - cos(π · p))`), removing sharp velocity
    discontinuities at the hold and release boundaries. Automated liquid doses break out
    of the 14-spoke equidistant circle into natural droplet clusters with randomized
    radial depths (0.55–1.2×), varying droplet sizes, and 2D simplex noise flow drift.
    Verified locally: `npm run lift` (33/33), `npm run squeeze` (9/9 on GPU, gap giveback
    balanced at 3532.566), `npm run downbeat` (91/91).
- **27c. Turbulence reaches (shipped, #305).** The dial was the stir's speed, so
  full was a look's 0.3 tripled, and with the band playing the music multiplied it and
  then held it to the larger of the dial and 1.2: full was 1.4 times half way. Now the
  dial runs as t(1 + 3t³) (`lib/stir.ts`; a look's 0.3 within 8% of before, full four
  times) and the music multiplies it by at most two: full is 5.8 times half way. The
  eddies still change on the clock, not on the stir's own speed (an eddy of size l
  stirred at U turns over in l/U): **27c-1, open**, wants a third dimension in the
  noise (3D simplex with the turnover as z), not a slide of the 2D one.
- **27d. The rest of the sweep (open, its own PR).** From the run above and a read of
  the code (handoff `meaningful-controls.md` in the project's files):
  - Dead on a thin gap (every look since #248): Depth Drag (18a's open item), Vibration
    (18a-2's), Damping (only the lasting current now), Plate Pressure (only the clock
    and the dish's bed drag).
  - Two dials that are one number: Gooey × Post Blur (`U.gooey * U.postBlur`), Blob
    Surface Tension × Polarity (`immiscibility`); Rain Drip against Dye Weight with
    Gravity (both the dye's weight down the plate); Buoyancy against Dye Weight's heat
    lift.
  - Read nothing on any look measured: Swirl, Evolve Speed, Tempo Sync (Random Evolve
    overrides it), Surge (lib/phrasing.ts measured it inert), and on the `all` shard
    Accent the One, Bead Drops, Macro Chase, Kaleido Zoom, Maze Detail, Pushes Dye,
    Follow the Song, the Back Plate's and Gel Wheel's hue and level dials, Lumia
    Saturation, Deadzone, Grain Size, Macro Lacing, Relief, Domain Size, pH Indicator,
    Glass Smear, Evaporation, Diffusion, LED Rotation Speed. Many need another setting
    on (a gel wheel, a second plate, a camera, the ferrofluid); the sweep sorts gated
    from dead, then fixes, folds or retires each with saved looks, set lists, MIDI and
    the remote migrated.
  - Heat is not carried on a thin gap (the velocity's self-advection is gone and vel.z
    rides with it), so Buoyancy, Heat Decay and Double Diffusion are weaker than their
    dials say.
- **27e. The music should move the picture more (first part shipped, #307).** The owner,
  2026-10-05: "Generally I don't feel like music is having as much impact on the visuals
  as I would like." 27a-c make the kick's two rides and the stir answer harder. Read
  from the frame loop, the rest of Sound Drive is dye (the centre pulse, the mid's
  stream, the treble's sparks, the kick's ring, the energy's swell) and two pushes, and
  on a thin gap (every look since #248) both pushes were nothing: the bass burst (a
  radial velocity every step while the velocity route is over 0.25) and the kick
  ring's outward kick push straight out from a point, a gradient, which the projection
  takes out whole. In the lab on forty pools (`npm run musicforce`), the burst held two
  seconds at a bass of 0.8 moved 0.006 of the plate's colour; a look's own stir 0.86.
  And the energy's swell divided the energy (0–1) by 70 as though it were a band, so it
  never reached its gate of 0.15 on any look.
  - **Shipped.** The bass is a hand on the glass (`BassPress`, lib/squish.ts): pressed
    as deep as the velocity route is loud over a palm where the burst was (0.004 a
    disc at full and Sound Drive 0.45, up to half again), followed each step, let up as
    the bass falls and all the way when the music stops, moved with an area look's
    bass. The glass moves the liquid only while it moves, so the plate breathes out as
    the bass comes in and back as it goes. Lab: 0.30 of the colour moved as a bass of
    0.8 comes in (the burst 0.006), back to 0.017 once it falls to 0.3; Classic's
    ferrofluid ring 0.3072 → 0.3069 through three swells; nothing at Sound Drive 0. The
    swell reads the energy on its own scale (`levels01`, lib/soundLevels.ts) and now
    pours, on an area look in its areas in turn: every look gains that dye source while
    the music is loud, which no check measures yet (27e-2's film will). Off a thin gap
    the burst pushes as before.
  - **27e-1, open.** The kick ring is still 14 one-cell specks of dye with an outward
    kick the projection removes (0.008 of the colour over four kicks). A drop that
    lands is a volume source (PLAN 18c): poured on each kick in the lab, a drop 0.04 of
    the plate across moved 0.04 a kick and stays, but every drop's volume leaves over
    the rim, so at a kick a beat it would flush the plate in about three minutes and
    push Classic's ferrofluid ring out about 0.002 a drop. A drop on the bar's one, or
    the ring's colour laid where Beat Squeeze's press carries it, without the flush.
  - **27e-2, open.** The first measure is still owed: on `film.yml`'s real songs, how
    much the picture's motion and colour follow loudness and the kick at beat scale
    and over 20 s (light-show plan targets r about 0.4 over 20 s), against the same take
    with the sound off; and the Mac's `controls` run for Sound Drive before and after
    this (it read visible on 13 of 20 looks before).
  - **27e-3, open.** Sound Drive scales none of the kick's forces (Beat Squeeze, Plate
    Rock) and the stir's music term at most doubles it; Lumia at Sound Drive 0.12 hears
    almost nothing. Whether one dial should be the music's reach on all of them is a
    question for the owner once 27e-2 says which reads weakest.
- **27f. The kick's three moves told apart (2026-10-21).** The owner: Beat Squeeze "doesn't do
  a whole lot", yet "something that looks like beat squeeze" shows on many looks even turned
  down, and Plate Rock feels the same in practice. Cause: Beat Squeeze has been 0 on every look
  but Bass Drop since a direct commit on 10-08 (`beatSqueeze` 0.03–0.10 before it, already about a
  tenth of the default's press after 27b-3), so what was seen was the *kick's dye burst* (a ring of
  6–12 droplets pushed outward on every kick, gated only by Audio Impact) and Plate Rock's tilt shove.
  - **27f-1. Kick Bloom (shipped, awaiting a Mac read).** `kickBloom` (default 1, the burst as every
    look had it) is the burst's own dial: 0 none, up to 1.5; on the desk, the remote and MIDI.
    Evolve never moves it (`NOT_THE_LOOK`; in its pool it shifted `slowevolve`'s timing). The burst is no longer a ring: two or three lobes at random angles, a fifth of
    the droplets anywhere, distances a third of the radius to past it, sizes 0.33–1.5 of a mean
    droplet, the burst off-centre by up to a third of the radius, each droplet pushed with a wide
    swirl and its own speed. Fewer droplets on average (5–11 against 6–12), about the same dye.
    `npm run panel` greps the source for both (the picture is judging.md §60).
  - **27f-2. Plate Rock leans on the one and three (shipped; story in docs/plan-shipped.md §27f-2).**
    A hand's minimum-jerk reach to the other side of a turning axis on the strong beats, never a
    shove on each kick; `npm run rides` holds it (judging.md §61).
  - **27f-3. Beat Squeeze presses a sheet, locally (shipped 2026-10-22; the owner picked the
    local sheet on the thread's card; story in docs/plan-shipped.md §27f-3).** Off the frame-moving looks the kick
    lays one dent as wide as a 0.1 mm sheet bends over the liquid in the kick's hold
    (elastohydrodynamic bending length; with the liquid's weight since 27f-4); Bass Drop keeps the
    glass. `npm run rides` holds it.
  - **27f-4. The sheet solved, not stamped (shipped 2026-10-24; story in docs/plan-shipped.md
    §27f-4).** The kick is a fingertip on a sheet floating on the liquid, solved each step on its
    own grid, exactly per Fourier mode (lib/sheet.ts): its bending, the liquid's weight under it
    (which 27f-3's reach left out, and which is the larger at a dent's size) and the dish's open
    rim. Laid on the gap through its own channel, past rest where its ring lifts. `npm run sheet`
    holds it (judging.md §68).
  - **27f-8, open (shortcuts named in 27f-4).** (a) The sheet's mobility is the rest depth's,
    h₀³/12μ, where the film under a deep dent drains as h³: at full Beat Squeeze the dent's middle
    is half the gap, an eighth of the mobility. The full equation is nonlinear (a semi-implicit
    step with the linear one as its preconditioner is stable while the mobility is under twice
    the rest's), at about five transforms a step against one. (b) The sheet's rim is the plate's
    square; the dish's is its circle. (c) The gap under the sheet is the 6 mm middle everywhere,
    not the dome Plate Curve makes: on a dome a kick presses no deeper than the rest under its
    middle (kickRoom) and the shader owes what its floor refuses of a dent's flank, so nothing
    ratchets, but a dent's shape and pace are the flat plate's. (d) Each kick's force is set from the volume the stamp pressed out,
    not a hand's (a fixed fingertip force would press glycerine's dent shallower), and the
    middle is capped at two thirds of the gap (SHEET_DEEPEST), where (a) bites hardest: full
    Beat Squeeze reaches it on every liquid with 61 to 78% of the stamp's volume. (e) The slosh
    dish's press (stepSlosh's dishKicks) still holds and lets go on the stamp's timings
    (glassHeld, KICK_RELEASE), not the sheet's.
    (f) The layer drains by lubrication (Reynolds), which needs its viscous time h²/ν short against
    the motion: at 6 mm 36 s in water, 1.6 s on the default oil (Thickness 0.45), 0.036 s in
    glycerine, where the solved dent (k = 1/14 mm) relaxes in 0.6 ms, 13 ms and 0.57 s. Only
    glycerine is in the regime; the oil is about 125× outside it, water 6×10⁴. There the liquid's
    inertia sets the pace: let go, the dent rings as a flexural-gravity wave under the sheet,
    ω² = (gk + Dk⁵/ρ) tanh kh, a period near 0.27 s at that k, damped by the Stokes layers
    (δ ≈ 1.4 mm on the oil): a couple of swings on the oil, many in water, where the lubrication
    sheet has it gone within a frame. The inertial sheet (a damped wave per mode, still exact per
    step) is the fix; judging.md §68 asks whether the missing swing shows.
  - **27f-5. The rock lifts the oil, not the frame (shipped 2026-10-24; story in
    docs/plan-shipped.md §27f-5).** On a tipped thin gap oil rises uphill through the water at
    Hele-Shaw's speed (`OIL_LIFT`, in SI), laid as the closed dish's circulation so an even sheet
    feels nothing, the frame stays still and the rim holds a lens; the water's colour alone weighs.
    `npm run oillift` holds it.
    - On the frame-moving looks the dish's own tilt (`rockAccel`, SLOSH_LEAN × Frame Sway) and the
      gap's (CUR_ROCK) are two different sizes of the same tilt; say which is the plate's.
  - **27f-6, open. A standing plate lifts the oil too.** Rain Drip's weight and Comet's pull still
    weigh all the colour, oil's included, over the app's mean, and a plate stood up (Plate Upright,
    Rain Drip) lifts no oil: the same circulation with gravity's in-plane share in place of the
    rock's tilt.
  - **27f-7, open (a shortcut named). The lift's circulation is the even gap's.** Ψ is solved with
    the plate's mobility taken as even, then the gap's own solve takes what is left where the gap is
    not (a press, a domed plate), with its open rim: exact on an even gap, and under a press a little
    of the lift can reach the rim. The full answer is the lift's own solve with the gap's mobility
    and a closed rim, a second multigrid; or one solve with the rim's held pressure set per liquid
    (18g-6 holds the surface tension's this way, as a gradient taken off the force near the rim). And the oil in the mix has the water's viscosity in the gap: a light
    mineral oil is fifty times thicker (OIL_NU), which would slow a lens to about 1/25 of this in
    water looks (Darcy's inclusion, 2μ₂/(μ₁+μ₂)) and change how every oil body moves; its own item
    when the mix's oil gets its viscosity.
- **27g. Bass Boost is a gain on the bass's hand (shipped; the owner, 2026-10-22: "I don't feel
  like it actually does anything").** The slider multiplied the ranged bass reading, which every
  hand takes over 70 or 85 and stops: on the band's chorus the reading sat over the press's
  ceiling 0.00 of the time at 1×, 0.57 at 2× and 0.70 at 3×, so turning it up held the glass flat
  and the kicks moved it less (the press's change a second 3.06, 1.83, 0.90; its deepest rose
  only 8%), while the kick detector never saw the slider (29 kicks at every setting). A bass boost
  on a rig is a gain, more cone excursion for the same line. Now the hand follows the bass with the
  boost taken back off (`bassRouteValue`) and lays the boost as a gain on its force (`bassPressFor`,
  the burst's push, the kick's dye and speed): change a second 3.06, 6.12, 9.19, deepest press
  1.13, 2.25, 3.38, pinned 0.00 at each; in the lab on the thin gap the hand moves 0.240, 0.403 and
  0.521 of the plate's colour at 1×, 2× and 3×, and gives it back. At 1× it is the hand it was.
  `npm run bassboost`. The reading itself still carries the boost (the mappings, the meter and the
  camera follow it, clipped at 100 as before); the phone's Settings is the same panel.
  - **27g-1, open. The readings that clip.** Presets' bass mappings (`getAudioValue`, clipped at
    100) and the camera's punch still saturate at a high boost, as the reading did. Whether the
    boost should reach them as a gain on their depth too is the owner's call once he has felt this.
- **Judging.** How the three feel at 60 fps with real music: `docs/judging.md`.

## 28. Preset palettes: the looks refreshed for what the plate does now (2026-10-10)

The owner, 2026-10-10: "Let's refactor the presets (now called preset palettes) as well
as the color palettes to account for all the new work that we've done. Improve the
current presets, create new ones, and dump ones that aren't doing anything interesting
anymore." Most of the 42 looks were tuned before the lamp ground (18b), each liquid's
own properties and colour (18d, 18d-12), the GPU reaction carried by the flow (§26),
standing domes (9t), Blow's air (15g), the controls sweep (§27) and layers on every
look (#273). The ferrofluid and Turing shader palettes are the "Palette for ferro and
Turing Print" work (#331), which also made the reaction grow at all.

- **28a. Keep, improve, new, retire** (**shipped**, #330). Judged on the Mac gallery of
  main (`gallery` label, 2026-10-10, `/mnt/project-files/presets-28/before/`):
  - *Named "Preset palettes"* in the menus, the desks, the phone's sheet (its tab says
    Presets, for width), the remote, the MIDI surface and the guide (the owner's pick).
  - *Retired*, each id mapped to its nearest look in `RETIRED_PRESETS` (src/presets.ts),
    so a set list, MIDI pad, sequence stage, song show or `?look=` link naming it plays
    the replacement (`findPreset`; `npm run plate`): Sunny Side Up → Colorful Cosmos (the
    same soft static pink), Boiling Point → Aurora Borealis (the same greens and pace),
    Glycerine Drift → Classic (one flat blue-to-magenta gradient). Saved presets keep
    their own copy and are untouched.
  - *Improved*: Cyberpunk Neon and Timbre Shifter drew a conic rainbow through every
    clear patch (the LED platform's `cyberpunk` and `rainbow` modes: a colour picker
    under the glass); now Cyberpunk is neon on black (luma 0.53 → 0.14 at 40 s, which is
    the look) and Timbre Shifter a cyan-violet marble (0.30 → 0.61). Jellyfish Bloom sat
    two bells on an empty plate (flat 0.61 → 0.51) and Cell Bloom drained by 40 s (more
    drops, slower evaporation: motion 0.015 → 0.057). Fillmore East and Clock Glass run
    Dye Budget 0.5 instead of 0.9 (18b-8), but the after gallery shows that was not why
    they are dark: Clock Glass's low luma is the black round its dish, and Fillmore stayed
    nearly black (0.064 → 0.052; 28c). Before and after at 40 s:
    `/mnt/project-files/presets-28/pairs/`.
  - *New*: **Lava Lamp**, the first look to stand the plate up (Plate Upright, Dye
    Weight, Double Diffusion: Rayleigh–Taylor plumes warmed back up by the lamp the
    solver keeps under the plate). Turing Print (26d) is its own thread's (#333). It needed the mix force
    waited for at opening (`Opening.gravity`; `npm run startup` on Metal caught it).
- **28b. Colour palettes for the lamp** (**shipped**, #330). Pastel Glow and Galaxy each
  carried White and Icy Blue, which are 0 and 26 (CIELAB ΔE) from the white lamp, so on
  a lamp look half their dyes poured invisibly; Lavender replaced White in both. Added,
  after the 17 so a saved lock keeps its index: Overhead (yellow, magenta, teal,
  ultramarine: the subtractive dishes), Ink (graphite, midnight, crimson, coffee: the
  reactions' precipitates), Pantry (the liquids' own colours) and Lava. `npm run plate`
  holds every palette to three of four colours 40 or more from black and from white
  (before: Pastel Glow and Galaxy 4/2). A track's music picks among 21 now, so a song
  identified before may land on a different palette once.
- **28c. Open from 28a.**
  - The retired looks' cases in `seedPreset` (LiquidVisualizer.tsx) are dead; delete
    them when lane G is free (#307 held it), and drop the file's exemption in `npm run
    plate`'s retired-id walk.
  - Fillmore East is nearly black on the Mac (luma 0.05 at 40 s) with Dye Budget at 0.5
    as at 0.9. Found (28d, lab): on the lamp the back plate is a second filter in the same
    light path whatever the Blend Mode says, and its wash (emerald, purple, cobalt) is the
    complement of the front's orange, yellow and cherry: luma 0.12 and 60% near black with
    both plates, 0.48 and none with the front alone. The owner (2026-10-11) chose to wait
    for 18b-5 (two projectors whose light adds on the screen) rather than drop the second
    plate.
  - Still flat on the Mac and not retuned here: Oil Wheel (motion 0.003, a dark brown
    disc; 18b-8 lists it), Deep Ocean (three bands), Bass Drop (one red: its Squeeze only
    shows with a kick). Crowd Plate is
    a camera look and photographs static without one.
  - The gallery's 8 s frame came back empty on Classic ("no grabFrame"): the first look
    is photographed before the page can grab a frame.
  - Neon Coral Reef draws a smooth rainbow ramp across one blob (its dyes' hue walk over
    a single body); judge after #331 makes its coral grow.
  - More new looks the physics allows and none shows: salt fingers on their own
    (Double Diffusion at 1 on a still upright plate), Saffman–Taylor fingering (water
    into glycerine in the Thin Gap), a pantry dish of the liquids' natural colours (needs
    18d-12a: the automation pours colourless).
- **28d. The looks watched as shows, and the controls ranked** (the owner, 2026-10-10:
  "take a look at the visuals, create galleries, watch the streaming shows, and optimize
  the controls and presets", the shows being "real light show videos from our app").
  - *Showreel* (in progress): `npm run showreel` renders every look through the app's own
    Render a song (`window.chromaglassRender`, as `npm run render-app` checks it) to the
    same minute of a real record, on seed 1, and watches each clip as the film does.
    `showreel.yml`, by hand or a PR labelled `showreel`, six Mac runners. The song is
    Funkorama (Kevin MacLeod, CC BY 4.0), downloaded by the workflow and held to its hash:
    the shipped library is ambient and a light show is judged on a band.
  - *Before* (the film of 2026-10-07, 41 looks, band in a box): against the real shows'
    2-3 swells a minute and ~9 colour changes a minute, 18 looks swelled 0.0 a minute and
    30 changed colour 0.0 a minute; motion followed loudness second by second (r 0.34-0.67
    on all but Fractal Dream) where the real shows follow it only over sections (r -0.13
    to 0.22).
  - Then: a gallery of stills and clips, the controls ranked by how much each visibly
    changes the plate (`controls.yml`), and a ranked list of looks to fix or retire and
    controls to bring forward, for the owner to pick; each pick its own PR.
  - *Found* (the showreel of 2026-10-10, 41 looks): 28 move more in the breakdown than
    in the groove; ten open on black and lose at least half of it by 30 s; nine draw
    hairline combed lines inside the bodies; six sit on white or cream. The owner
    (2026-10-11) chose to fix every look and retire none. The black and the combed lines
    are Antigravity's, written up with times in `docs/showreel-findings.md`; the
    breakdown, Classic, the five dim looks and the four untrue names are Claude's.
  - *Fixed here* (lab numbers; each still to be judged on a Mac showreel):
    - Red Cabbage: the pH indicator was a tint over the dye's own purple, which already
      blocks green, so it never turned green and pink came back purple. The dye now keeps
      its darkness and takes its pH form's colour (Beer-Lambert; each form three bands, not
      a spectrum): hues 313-295 (all purple) to 340, 328, 319, 208, 128, 35 from acid to
      base. Its "washed white for 20 s" is not explained (lead: clear doses on the thin gap).
    - Chemical Clock: the reaction ran 12 steps of 0.01 a solver step, tied to the step
      rate: a spiral every 0.73 s. Now on the show clock (0.26 reaction units a second): a
      20 s period, fronts 0.010 of the plate a second. The dish is red at rest, clear gel.
      Shortcut: the plate is a ~6 mm patch of the dish, as under a magnifier.
    - Timbre Shifter: the colour was the clock plus pitch plus timbre, and pitch (6.3 dyes,
      jumping at every chord) swamped timbre (2.7): one cyan-violet mean. A look whose colour
      follows timbre now takes it from timbre alone (Cyberpunk Neon, Microscopic Chaos and
      Jellyfish Bloom route colour to timbre and change too, unjudged); its dish no longer turns
      with the timbre. Unmeasured until a Mac render.
    - Oil Wheel: one disc, no brown LED, Lamp Warmth 0.75 to 0.3 (it took a quarter of the
      blue), and the motor at the half a turn a minute its description says (0.232; it was a
      turn every 21 minutes). Colorful Cosmos: a deeper paper (bare 0.58 to 0.36 luma; at 0.15 its grain fell under a level). Deep
      Ocean: a single deep blue LED instead of the cyan 'ocean' ramp (empty plate 0.23 to
      0.07). Galaxy: five hues instead of two (ice blue, ultramarine, magenta, amber), dye
      budget 0.35 so it is mostly void.
    - **28d-A. Ten looks open on black and keep it under the music** (`docs/showreel-findings.md` §1, this PR).
      - *Why they washed to grey:* (1) `seedPreset` lays distinct dye bodies covering a small fraction of the dish (`seedMean` 0.08–0.35 on `jellyfish-bloom`, `comet`, `cyberpunk`, `galaxy`, `aurora-borealis`, `deep-ocean`, `solar-flare`), while the music's continuous injectors (`center pulse`, `bass ring`, `mid orbit`, `treble sparkle`, `swell`) and `Evolve` poured every frame without scaling by the solver's `dt` or the headroom under the look's initial fill (`seedMean`), while `stepDecay` evaporated only once per `dt`-scaled solver step. (2) `treble sparkle` mixed 50% white (`sparkCol * 0.5 + 0.5`) at `1.1` density per cell, and continuous `spray`/`splatter` styles peppered the dark void between bodies with pastel mist; `pourLiquid` also deposited emulsion `scatter` into empty water (`!hasDye`). (3) On `ferro-maze`, the front layer seeds a clear-carrier ferrofluid phase (`seedMean === 0`) over a back-layer wash, and music/Evolve poured dye into the clear phase layer, filling the black ferrofluid cells with muddy brown dye. (4) On `neon-coral-reef`, `depositChemistry` with `bath = 1` laid dye wherever Gray–Scott activator `v > 0.22` across the whole dish, including open water outside the coral bodies.
      - *What changed:* `FluidSimulation` records `seedMean` (the dish's mean density laid by `seedPreset`, or `null` when cleared by hand). Continuous music/Evolve pours and the dye-budget regulator hold `Math.min(dyeBudget, seedMean)` as their target in round 1 (`lookTarget`; round 2 scales it with the slider, below), scaling continuous pours by `dt / 0.05` and headroom (`pourRoom`) and scaling the regulator's per-step ceiling by `1 / (dt / 0.05)`; clear-phase layers (`seedMean === 0` with `phaseAmount > 0.002`) receive no continuous music/Evolve dye or emergency seed; sparse dark looks (`lampGround < 0.05` and `lookTarget < 0.45`) use `drop` instead of `spray`/`splatter` on continuous per-frame music pours; on a sparse dark look `treble sparkle` uses the palette colour `sparkCol` without `+ 0.5` white bias (round 2: every other look keeps the original); `pourLiquid` suppresses `scatter` where no dye is present (`!hasDye`); `depositChem` gates non-print bath deposition by host dye or poured reagent (`wetOnly`) and scales by headroom; and `decayDye` adds a thin-film term `surf = loss * 0.06 / (d.a + 0.14)^2` so thin mist between bodies clears faster than thick bodies.
      - *Shortcuts named:* `seedMean` headroom gating (`pourRoom`), the `dt`-scaled regulator ceiling (`regStepScale`), the thin-film decay term `surf` in `decayDye` (round 2: gated by `surfaceClear`, 0 off a sparse dark seeded look), and the `wetOnly` host gate in `depositChem` are dye-budget regulator shortcuts pending 18c-2 (pours add volume) and 18g-4 (carrier-thickness field).
      - *Round 2 (review of #401, four asks):* (1) the Dye Budget slider was dead on a seeded look from its composition up to its maximum (`min(dyeBudget, seedMean)`: a look laid at 0.47 held 0.47 from 0.47 to its top). `src/lib/dyeTarget.ts` `lookTarget` is the composition at the look's own budget (`seedBudget`, kept by `seedPreset`) and scales with the slider above it, so a preset left alone is unchanged and the whole range is live (Jellyfish Bloom, the look the review measured, has no budget of its own, so its `seedBudget` is the default 0.85, and on the plate it lays 0.47, not the 0.14 that was a slider position: it holds 0.47 at slider 0.85 and about 0.077 at slider 0.14, and its default target sits on the 0.45 `sparseDark` cliff (it laid 0.47 on one Mac load and 0.395 on the next), so on some loads the bank, sparkle and surf changes reach it and on others they leave it as it was; `handpour` asserts it is near the cliff rather than which side, and pours only on looks away from it; `npm run handpour` part 1 asserts the slider never falls as it rises, is live on a thin look, and equals the earlier target at the look's own budget, and part 2 reads it on the plate at 0.14 and 0.85). (2) A hand pour on a sparse look was drained by the regulator's `regStepScale` (up to 12.5x) and `surf`: `markHand`/`bankHand` now bank the mass a hand tool laid as extra target that decays with a 10 s time constant (`HAND_BANK_SECONDS`), so a pour the owner makes stays for a few seconds and then returns to the composition; the bank is gated to sparse dark looks, so a slider-capped seeded look keeps the regulator it had. `npm run handpour` pours with the bank off and on (ABBA, one page) and prints the share left at 1, 3 and 10 s. (3) The treble sparkle is the gentle one only on a sparse dark look (it was gentle on every look, about 9x weaker, undeclared); every other look keeps the original `treble01 * 1.1` with `sparkCol * 0.5 + 0.5`. (4) `surf` is gated by `surfaceClear` (a seeded look that is sparse dark), so on every other preset it is exactly 0 and the program is what it was (`npm run lampzero`); `npm run handpour` lists which looks the fix reaches and prints the black share at 8, 20 and 40 s off and on, and the `gallery` label photographs every preset.
      - *Round 2 shortcuts named:* the slider scale (`seedMean * dyeBudget / seedBudget`) is a ratio standing in for the volume model (18c-2), and it changes one thing on purpose: a slider position between the composition and the look's own budget, dead before, is live now; the hand bank is a decaying allowance, not carrier volume (18c-2, 18g-4); `sparseDark` is a threshold (`lampGround < 0.05`, target < 0.45), not a measured class, and a slider dragged across 0.45 switches its four gated things at once; the hand bank is bookkeeping on the dish mean, not carrier volume; the `handpour` off arm switches only the bank and `surf`, not the sparkle, `contStyle` or the slider formula; Jellyfish Bloom is not among the looks the sparse gates reach (galaxy, aurora-borealis, stardust-collapse, lumia, cell-bloom, roy are), so its slider numbers are the only ones taken on it.
      - *Measured, round 1 (taken before round 2's gates; round 2's are in the PR body)* (`npm run showreel` on Mac GPU, Funkorama 78–138 s, seed 1, 960×540 at 30 fps; black share Start / Half by / 15 s / 30 s / 45 s / 59 s, before → after): `jellyfish-bloom` 84% / 8.5 s / 20% / 3% / 4% / 4% → 85% / never / 81% / 79% / 72% / 58%; `comet` 81% / 10.5 s / 22% / 9% / 17% / 5% → 81% / never / 72% / 66% / 78% / 91%; `cyberpunk` 92% / 2.3 s / 19% / 39% / 24% / 18% → 92% / never / 70% / 88% / 66% / 58%; `bass-drop` 64% / 1.3 s / 19% / 13% / 22% / 37% → 67% / 1.8 s / 28% / 54% / 36% / 81%; `galaxy` 34% / 16.8 s / 22% / 16% / 17% / 8% → 36% / never / 25% / 32% / 36% / 32%; `aurora-borealis` 37% / 10.8 s / 20% / 26% / 28% / 22% → 37% / never / 44% / 52% / 54% / 58%; `ferro-maze` 33% / 17.8 s / 19% / 12% / 10% / 9% → 33% / 45.5 s / 19% / 17% / 17% / 14%; `neon-coral-reef` 30% / 8.8 s / 4% / 1% / 1% / 1% → 30% / never / 21% / 23% / 20% / 18%; `deep-ocean` 29% / 9.8 s / 1% / 1% / 1% / 5% → 31% / 53.8 s / 28% / 23% / 20% / 13%; `solar-flare` 27% / 11.5 s / 14% / 15% / 14% / 6% → 37% / never / 40% / 57% / 59% / 72%.
    - Left: Fillmore East waits for 18b-5 (28c). Combed lines are 28d Part B / 18e (`docs/showreel-findings.md` §2). Oil Wheel's sound patch on its motor goes with 28f.
    - Left, **Soap Film** (Claude): Thin Film is drawn only where the dye's opacity is under
      0.4, so on this look (budget 0.5, opacity ~0.94) the interference shows on the first
      sixteenth of a ramp of dye and the sheet is the look's lavender and magenta. A fix was
      tried here and taken out: Film Physics drawing the whole film as its own reflected
      light (`filmTable.ts`, thickness `-ln(1-opacity)` at 414 nm a unit, clear dye, budget
      0.25) gave Newton's series on a ramp in the lab, but it changes what Film Physics is:
      `npm run filmlook` holds the setting to recolouring the rim rainbow at the rainbow's
      brightness (the Mac: 23608 pixels changed outside the rainbow's footprint, film
      luminance 133 against 40, 4/9). Doing it means a new setting or a redefined Film
      Physics, with `filmlook` rewritten to the new contract (the check-skeptic on it), the
      desk and the phone. Not in this PR.
- **28e. A breakdown is quieter on the plate, and Classic is blobs again** (**shipped**,
  #368; the showreel's first two findings). The music's hands follow how loud the passage
  is, as an amplitude (`Passage`), and the bass's press reads the band over its ceiling:
  on the showreel's minute the press changed 1.44× as much a second in the breakdown as
  in the groove, now 0.54× (`npm run breakdown`). Classic: Dye Budget 0.45, Bubbles 0.05.
  Story in docs/plan-shipped.md §28e.
- **28e-2. Open from 28e.**
  - The sound mappings (a look's `sceneMappings` with source `sound`, sound learn's
    triggers) and Evolve's automation read the levels, which are ranged against ceilings
    that fall back in 8 to 18 s, so a breakdown still turns them back up. Scale the ones
    that move the liquid by the passage too, look by look, measured on the showreel.
  - A render's room tracker seeds its floor at -140 dB from the first frame, which is
    silence (the analyser's window has no samples yet), and a floor only rises from
    levels near it, so it stays there for the whole render: the analyser window a render
    hears through is -120 dB wide at the bottom, where live it fits the room. Seed the
    floor from the first frame with sound, and check a render's window against live's
    (`npm run render`).
  - Live, the passage's reference is kept for the whole audio context, so a track
    mastered 10 dB quieter than the one before plays its first minute or two with gentler
    hands (0.54 a minute on, 0.78 two). Forget the reference when a song ends, from the
    song-change clock (`useSongChange`), and hold it with `npm run breakdown`.
  - Re-render the showreel after 28e lands (and after Antigravity's #348, #352, #353,
    #355), and re-score Classic and the 28 busier looks against the same minute.
- **28f. Every look answers the music through its own patches** (the owner, 2026-10-11: use
  the patch bay so the looks answer the music more by default; the whole plate may move with
  the music on a small named set of looks, never as the default). Brief and findings in
  `docs/sound-patches.md`. Step 1: the four patches that never fire (bands names under
  `source: 'sound'`) and comet's depth of 45; sound to frame motion an opt-in per look on a
  short list, held by `npm run framesway`; Claude writes the first three looks' patches as
  the pattern. Step 2: two or three liquid patches per look from what is heard at once (the
  bands and their onsets; not song shape, which hears a section bars late: the owner,
  2026-10-11), judged on the showreel (Antigravity).
- **28g. Follow a known song played live, by what is heard, not by the clock** (the owner,
  2026-10-11: "if we pre record the shape of the song, how can we map that to a different
  sounding and sometimes improvisational version of the same song?"). Today a song map
  (`songMap.ts`) is read by playback position (`sectionAt`, `energyAt`), so it only fits the
  recording it was made from. Instead: keep the map as sections with each one's harmonic
  fingerprint (a 12-note chroma profile, which survives a different band, tuning of the mix
  and instruments) and its energy; follow the live audio by online time warping (as score
  followers do for live players), so a slower or faster take still lines up; model the song
  as sections that may repeat, stretch or be skipped (a solo that runs long, a chorus played
  twice), not as one timeline; and fall back to the live song shape when the match is weak
  (a jam the map never heard). What it buys: the show knows the chorus is next and can lean
  into the build before it is heard, where the live song shape hears a section bars late.
  A map made from the band's own rehearsal or last night's set is the likeliest source.

- **28f. Every look answers the music through its own patches** (the owner, 2026-10-11:
  use the patch bay so the looks answer the music more by default; the whole plate may
  move with the music on a small named set of looks, never as the default; and "only use
  things that we can detect quickly and make changes that are appropriate for the music",
  so no song-shape sources for the looks). Brief: `docs/sound-patches.md`.
  - ~~28f-1 the dead patches, the named looks, the hits as a patch source (desk, phone,
    Sound learn), the first three looks as the pattern~~ (**shipped**, this PR;
    `docs/plan-shipped.md` 28f).
  - **28f-2, open (from `docs/sound-patches.md`).** Two or three liquid patches or area cords
    per look from the bands and the hits, following Cyberpunk, Poster 1969 and Lava Lamp;
    judged on a fresh showreel. The two or three patches/cords per look are wired on all
    looks in #473 and held by `npm run soundpatch` (`100 of 100 move`, `29 looks checked (+ 3
    from 25h)`), with area cords (`25h`, `lib/areaCords.ts`) on `lumia`, `poster-1969`,
    `cell-bloom`, `milk-marble` and `red-cabbage` (`25 cords on 8 looks`, `npm run areacords`),
    but **still open**: a fresh showreel and a main-vs-head film on the same looks (seed 1,
    band in a box) are still owed, and 27 of the 28 changed looks still miss one or more of
    the 28i film bars (`2–3.5 swells a minute`, `at least 6 colour changes a minute`, `r1 in
    [−0.13, 0.22]`; per-look numbers under 28i-3).
  - ~~**28f-3.** Ten looks still sway the dish's turn with the music through the old
    `audioMappings.rotation` slot (27a-8). The owner's rule now says which: whole-plate
    motion from the music only on the named looks (`FRAME_MOVING_LOOKS`). Read it with
    the owner (a slow turn is the oil wheel's move), then move them off or onto the list,
    and count the slot in `npm run framesway`.~~ (**shipped** with 28i-3, #473;
    `docs/plan-shipped.md` 28i-3: eight moved off `audioMappings.rotation` to `'none'` +
    liquid targets here; the other two of the ten, `timbre-shifter` in #351 and `deep-ocean`
    in #408, had already left the slot; `npm run framesway` counts the slot, 59 of 59 still).
  - **28f-4, open.** Pitch is mostly the bass line on a band (72% of the showreel song's
    frames in the octave above C1): a patch on it walks with the bass, not the melody. A
    lead's pitch needs the analyser to find the strongest note above the bass.
  - **28f-5, open (found here, for 27e-2).** The song's shape does not hear the showreel
    song's breakdown (Funkorama, 104–120 s: the kick's region 22 dB down, 12 kicks in
    14 s against 30) nor the beat's return: one drop at 7.2 s and steady after. Nothing
    patches it now, but Follow the Song and Evolve read it. `songShape.ts` is tuned on
    made-up songs; a sparse kick under a breakdown must read as the beat gone.

- **28g. Follow a known song played live, by what is heard, not by the clock** (the owner,
  2026-10-11: "if we pre record the shape of the song, how can we map that to a different
  sounding and sometimes improvisational version of the same song?"). A song map
  (`songMap.ts`) is read by playback position, so it fits only the recording it was made
  from. Instead keep the map's harmony, follow the room by it whatever the tempo and the
  instruments, let the form change (a chorus twice, a verse left out, a solo that runs
  long), and fall back on the live song shape when the match is weak. What it buys: the
  show knows the chorus is next and can lean into the build before it is heard. Not a
  preset patch source (28f: patches use fast readings only).
  - **28g-1. The follower and its check** (**shipped**, #378; the story in
    `docs/plan-shipped.md` §28). `chroma.ts`, `songFollow.ts`, `npm run songfollow`.
  - **28g-2. Use it live, with the fallback** (**shipped**, this PR; the story in
    `docs/plan-shipped.md` §28). `followedPlace.ts`: the place the show reads a map at is
    the follower's when sure and the clock run on from the last sure place when not, with
    no map section then (the show leans on the song's shape); the desk's status bar, the
    track panel and the phone's Sound sheet say which song is followed and how sure.
    `npm run songfollow` (the place, 16 more checks), `npm run followview` (the browser).
  - **28g-3. The show leans into what the map says is next** (Pacing/sequencer), and a map
    made from a file (the band's rehearsal, last night's set; §17 "hear the set ahead").
  - **28g-4. Found along the way: the worker's sections are coarse.** On the check's song
    `segment()` (`songMapAnalysis.ts`) found six sections where nine were played, one
    "chorus" spanning verse, chorus, verse, chorus (18–73 s). The follower survives it
    (the leak finds what the form did not offer) but its jumps land best on true section
    starts; segment by the map's harmony at bar scale. Measured: on today's sections the
    jumps do nothing (no jumps, same numbers); on the record's true sections a repeated
    chorus is found 1.2 bars in against the leak's 1.4. Keep the jumps if better sections
    make them earn more, else remove them. Agreement (half of confidence) counts the weight
    on the same place in a section of the same label, so with these sections two copies of
    the chorus that the worker put in one "chorus" do not agree, and confidence after a
    jam stays near 0.5 while the follower hops between them. Agreement by the map's own
    harmony (the last four seconds the same) was tried in 28g-2 and changed no number on
    these takes; try it again with better sections.
  - **28g-5. Found along the way: another key.** A band that tunes down a half step, or
    plays the song in another key, rotates the whole profile; the follower would read it
    as a jam. Try the twelve rotations when confidence stays low and the profile is tonal.
  - **28g-6. Found along the way: maps made before 28g-1 have no harmony.** They follow
    nothing until the song is heard again and its map remade.
  - **28g-7. Found along the way: a song's show while the place is unsure.** A song show's
    actions (`useSongShows`) fire by the place, and while the follower is unsure the place
    is the clock run on from the last sure one: a guess. The map's section is withheld then
    (the sequencer runs a section stage on its own clock), but a show's "at the second
    chorus" still fires on the guess. Decide whether a show's section actions wait for the
    place to be sure, and say so on the Songs panel.
  - **28g-8. The score's nudge** (**shipped**, #375; story in `docs/plan-shipped.md` §28h).
    A nudge (`useMusicIntelligence`'s `seekBy`) moves the followed place itself:
    `FollowedPlace.resync(mapSec, now)` starts the clock there and anchors the follower,
    called directly, not through the identification effect (which leaves a sure place
    alone). The clock keeps the nudge too, so an identification while the follower is
    unsure resyncs to `offsetSec + nudge`. Open from it: the steering closes a nudged
    place back toward what the follower hears, so a nudge of a section's edge on a sure
    follower is corrected within a second (right when the follower is right, and a nudge
    that will not stay when the follower is wrong); decide whether a nudge holds the
    follower off for a few bars.
  - **28g-9. Found along the way: an intro on one held chord.** For as long as one chord
    is held (the check's intro, four bars of A minor into a verse that opens on it), no
    place in it sounds different from another, and the follower slid 1.4 bars behind into
    the verse before the next chord put it right; the place, steered rather than set,
    held the identification's clock meanwhile and jumped once. A rehearsal map made from a
    file (28g-3) can carry bar positions from the beat grid, which would fix the place
    inside a held chord.
- **28h. The score: the song drawn, its show's cues on it, and a nudge** (**shipped**,
  this PR; the story is in `docs/plan-shipped.md` §28h). Open from it:
  - **28h-1.** (**shipped** with 28g-8.) The nudge re-anchors the follower rather than
    adding an offset to it; position stays in the map's own seconds.
  - **28h-2.** Correct the score, not just the clock: drag a section's edge and save
    the map, so the next play of the song is right without a nudge. Today the nudge
    is an offset for the whole song, which fixes one late edge and moves the rest.
  - **28h-3.** A score that draws itself as an unknown song plays, from the live song
    shape (`songShape.ts`: builds, drops, breakdowns), before any map exists.
  - **28h-4.** The sequencer's own stages on the lane: a sequence started for a song
    (`startAt`) lays its stages end to end by seconds and does not follow the nudge or
    a section's time; show the stages against the sections, and let a stage advance
    on a named section ("the second chorus"), not only on any section change.
    A show started by hand from the Songs sheet keeps its own clock and reads no
    sections, so the nudge leaves it alone.
  - **28h-7.** A listen's replay and a recorded take count from the recognised
    start (`songStartMs`), not the nudged position: a take made after a nudge stores
    the unnudged start. Decide whether a take should carry the nudge.
  - **28h-5.** The remote phone (`RemoteControl.tsx`, over the show server) does not
    get the score yet; the phone layout's Play sheet does.
  - **28h-6.** A repeated section in a live take (the band plays the chorus twice)
    maps back to the same section index, so a cue on it fires once; decide with 28g
    whether a repeat should fire its cue again.

- **28i. Every look judged again, after the lamp, the soap film and the breakdown** (the
  owner, 2026-10-19: "the presets are kinda shitty now that we've made substantial
  changes ... prune or improve all of them ... really dynamic or emotional. We need to sell
  some cool stuff now"). The 28a judging was done on the 2026-10-10 gallery; since then the
  lamp ground (18b), the quieter breakdown (28e), the closeup camera (27a-8), the soap film's
  reference (32a) and the lamp's background (`lampBg`) all changed what a look draws. Every
  look is photographed again on the Mac (`gallery.yml`, this PR labelled `gallery`) and
  given a verdict: keep, rework (with a number and the check that proves it), merge into
  another, or retire through `RETIRED_PRESETS`. Each kept look is tagged with the art pack
  it sells in (PLAN 23: Home includes one pack, Pro all). The reworks go to Antigravity as
  short briefs; this item lists them as they are briefed.

  Judged on the Mac gallery of 2026-10-19 (8, 20 and 40 s, `scripts/judge.mjs`'s numbers)
  against the 2026-10-11 film. Of 41 looks, 10 retire (nine in batch 1, Lumia after 28i-5), 31 stay, 21 of those reworked. The
  three faults the photos share: looks that stand still (eight under .01 gallery motion at
  20 and 40 s, four more by eye; Acid Trip reads .11 to .23), looks that lose the black
  (Classic, Galaxy, Cell Bloom drains to flat indigo, flat .21 to .81 and luma .52 to .08
  by 40 s), and looks on a white ground (Turing Print at luma .85 to .94 for 20 s,
  Sensual Laboratory, Roy at .7).

  - ~~**28i-1. Retire nine**~~ (Antigravity, batch 1, **shipped** in #408; story in
    `docs/plan-shipped.md` 28i-1): nine ids through `RETIRED_PRESETS`, every check that
    named one on its replacement. What it found is **28i-6**.
  - **28i-5. Retire Lumia** (→ `velvet-underground`; Claude first). `'lumia'` is also the
    lamp's Lumia setting and mixer mover (`plateSources.ts`, `mixer.ts`), and `plate` 5b
    fails on any quoted retired id in src/, so retiring the look trips it on the layer.
    5b learns to tell a preset id from a setting key (named under `Check changes:`, its
    reach unchanged for preset ids), then the look retires.
  - ~~**28i-2. Give back the black, make the still ones move**~~ (batch 2,
    **shipped** in this PR; story in `docs/plan-shipped.md` 28i-2): all 21 reworked looks
    meet their gallery (`8/20/40 s`) and film (`90 s`) bars; `jellyfish-bloom` appears once
    in `evolution.ts`'s `calm` bucket and `poster-1969` appears once in `sequencer.ts`'s
    `Pace` sequence. `poster-1969` now runs on a single plate (`layerCount: 1`), raising its
    12 s step rate from `15.9 steps/s` (two 384² plates) to `24.8 steps/s` (one 384² plate);
    reaching `>= 30 steps/s` (`PINNED_STEP_RATE = 30`) is open as **28i-2a** below.
  - **28i-2a, open. Poster, 1969's step rate on a single 384² plate.** Measured over 12 s
    (`squeeze` harness), `poster-1969` on `main` ran `layerCount: 2` (`2 × 384²` thin-gap
    plates = 12 GPU solver steps per render frame at the 6-substep cap), stepping at
    `15.9 steps/s` (`191 steps / 12 s`, `simMs = 45.2 ms`, `2.05 substeps/frame`, `7.8 fps`).
    Moving `poster-1969` to a single plate (`layerCount: 1`, matching its 28i-1 description
    `"Poster, 1969 draws on one plate"`) cuts its GPU solver work in half and raises its
    12 s step rate by +56% to `24.8 steps/s` (`298 steps / 12 s`, `simMs = 24.1 ms`,
    `2.00 substeps/frame`, `12.4 fps`), still below `PINNED_STEP_RATE = 30` (`>= 200` steps
    in a 6.67 s window) because the governor stays on the `384²` rung where each thin-gap
    step takes ~12 ms on an integrated GPU. Stepping down to the `256²` rung on a single
    plate reaches `35.2 steps/s` (`422 steps / 12 s`, `simMs = 11.4 ms`, `1.88 substeps/frame`,
    `18.7 fps`), clearing `30 steps/s` with +17% margin; `governor.ts` needs a step-rate /
    `simMs` downshift rule (or a `256²` start when `simMs > 16 ms`) so single-plate thin-gap
    looks reach `PINNED_STEP_RATE = 30`.
  - **28i-2b, open. The projector check cannot see a left/right shift of 0.2 or less.**
    `scripts/webgpu-smoke.mjs`'s "the projector places the picture on the wall" probes only the
    top rows and the middle, so a sideways shift of the picture by 0.2 of the frame or less
    reaches neither (mutation run in a cloud session on Classic's opening, review of #523: pin
    ignored, picture 0.2 up or down, half size, 0.3 sideways and a blackout that is ignored
    all fail; 0.2 sideways passes). The frame is lit by construction now (the LED floor), so
    a column probe closes it cheaply: the left 4% of columns lit when unpinned and dark when
    pinned inside the frame, beside the top-rows probe. A check change: name its bar and
    input in the PR body, and run the same mutations to show 0.2 sideways now fails.
  - **28i-3. Sound on the liquid, not the frame** (batch 3, **open for the film measure**;
    frame fixes on the eight looks and the Milk Marbling dead-patch fix **shipped** in #473,
    story in `docs/plan-shipped.md` 28i-3).
    - ~~**Frame fixes on the eight looks and Milk Marbling's dead patch**~~ (**shipped** in
      #473): Galaxy (`energy`), Cyberpunk (`complexity`), Acid Trip (`energy`), Aurora
      (`energy`), Solar Flare (`bass`), Fractal Dream (`treble`), Neon Coral Reef (`timbre`)
      and Stardust Collapse (`bass`) moved `audioMappings.rotation` to `'none'` and onto
      liquid targets (`npm run framesway` counts the slot, 59 of 59 still; the other two of
      28f-3's ten, `timbre-shifter` in #351 and `deep-ocean` in #408, had already left the
      slot). Milk Marbling's `treble → airVelocity` at depth `.02` (gated to `0` under `0.1`
      in `LiquidVisualizer.tsx:4257`) is replaced with two area cords on its food-colouring
      spots (`npm run soundpatch` §1 folds each patch on the look's own settings too, 100 of
      100 move).
    - **28i-3b, open (with 28f-2).** Every look that hears sound now carries two or three
      fast liquid patches or area cords from `hits`, `bands`, onsets and notes only (#473;
      `npm run soundpatch` §2 counts both plate-wide liquid patches and area cords on fast
      readings toward the two or three, and holds area looks free of redundant plate-wide
      patches; `npm run areacords` holds 25 cords on 8 looks: `velvet-underground`,
      `jellyfish-bloom` and `bass-drop` from #454, plus `lumia`, `poster-1969`, `cell-bloom`,
      `milk-marble` and `red-cabbage`). **Still open:** a fresh showreel (28f-2) and a
      main-vs-head film on the same looks (seed 1, band in a box) are still owed, and 27 of
      the 28 changed looks still miss one or more of the **film bar** (**2–3.5 swells a
      minute, at least 6 colour changes a minute, r1 in [−0.13, 0.22]**):
      `classic` (`3.9 swells/min`, `0.0 colour changes/min`, `r1 = 0.10`),
      `comet` (`2.9 swells/min`, `0.0 colour changes/min`, `r1 = 0.51`),
      `galaxy` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = -0.06`),
      `cyberpunk` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.78`),
      `acid-trip` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.15`),
      `microscopic-chaos` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.45`),
      `aurora-borealis` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.10`),
      `solar-flare` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.46`),
      `fractal-dream` (`4.8 swells/min`, `11.6 colour changes/min`, `r1 = 0.00`),
      `neon-coral-reef` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.22`),
      `stardust-collapse` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.30`),
      `lumia` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.19`),
      `turing-print` (`2.7 swells/min` on 66 s / `0.0` on 30 s, `0.0 colour changes/min`, `r1 = 0.16`),
      `poster-1969` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.27`),
      `macro-bead` (`2.9 swells/min`, `2.9 colour changes/min`, `r1 = 0.39`),
      `cell-bloom` (`1.9 swells/min`, `0.0 colour changes/min`, `r1 = -0.64`),
      `lace-run` (`0.0 swells/min`, `5.8 colour changes/min`, `r1 = 0.31`),
      `crowd-plate` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.51`),
      `milk-marble` (`1.9 swells/min`, `0.0 colour changes/min`, `r1 = 0.17`),
      `soap-film` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.07`),
      `oil-and-water` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.27`),
      `red-cabbage` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.07`),
      `chemical-clock` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = 0.56`),
      `magnet-garden` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = -0.19`),
      `home-movie` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = -0.01`),
      `clock-glass` (`3.0 swells/min` on 40 s / `0.0` on 30 s, `0.0 colour changes/min`, `r1 = 0.10`),
      `ferro-paint` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = -0.03`),
      `roy` (`0.0 swells/min`, `0.0 colour changes/min`, `r1 = -0.08`).
  - **28i-4. Soap Film** waits on PLAN 32 drawing the film's interference colours (today:
    magenta cells, no rainbow); then four or more hues on the film.

  - **28i-6. What retiring nine left a check or a page standing on** (found in 28i-1;
    whoever has credit). Each is a shortcut or a gap the retirement made, named so it
    is not found twice: (a) **no look ships the camera pass any more** (`camera: 1`,
    `renderStyle: 'photo'` were Oil on Water's and Colorful Cosmos's alone): `wall`
    section 6 lays them on Oil & Water by hand, `controls` `all` sweeps the camera's
    controls (focus, aperture, refraction, bloom) on looks with the camera off, so they
    read as doing nothing, and `grainedge`'s `CONTROL` names Classic where Colorful
    Cosmos was, a look nobody has shown the old shader failing on; (b) **no look ships
    Two Projectors**: `wall` section 7 raises the layers and the setting itself and lays
    `fillmore-wash` on the back plate by the solver's own `seedPreset`, and nothing in
    the app lays that wash any more, so Two Projectors on another look still starts with
    an empty back plate; decide whether the setting should lay the wash. Measured on the
    Mac: with the wash the back source reads 0.575 and the front-from-wall difference
    0.342; without it the back source is the bare lamp (0.986) and the difference 0.059,
    and the section still passes, because its bars (0.004 and four times the control) do
    not ask what is on the back plate, which was true before this PR too; (c)
    ~~`squeeze` asks for Beat Squeeze 0.1 by setting, since Poster, 1969 ships it at 0~~
    (**fixed** in #408: Poster's plate stepped too slowly with the squeeze off to hold the
    check's 200 steps a window, 191 on one run and 215 on another, so the check measured
    the governor and not the press; it now runs on Bass Drop at its own 0.8, the one look
    left that ships the squeeze, the bar unchanged);
    (d) ~~`soundpatch`'s three pattern looks are Cyberpunk, Aurora Borealis and Lava Lamp
    until 28i-3 gives Poster, 1969 patches (the Fillmore had two)~~ (**fixed** in 28i-3:
    `poster-1969` carries three area cords and is in `soundpatch` `PATTERN`), and `lampjudge`'s
    owner override for the Sensual Laboratory is gone with it; (e) `evolve`/`replay`
    start from Poster, 1969 and Clock Glass where they started from the Fillmore and the
    Oil Wheel, so their seeded rolls are different rolls; (f) ~~the README's gallery
    pictures (`docs/shots`: the Fillmore, Oil on Water) are of retired looks:
    `npm run shots` on the Mac for the new set, then the README table~~ (**shipped**, #492:
    `poster-1969`, `oil-and-water`, `macro-bead` and `velvet-underground` shot on the Mac GPU
    at `seed=1`, retired shots deleted, README and guide tables updated); (g) three checks count looks and now sit near their floors: `startup` asks for
    more than 30 looks (32 ship; 31 after Lumia, 28i-5), and `disc` names its two magnet looks
    where it asked for three.

  The packs (PLAN 23; the owner's Art packs thread decides what Home keeps): Listening
  (Aurora, Oil & Water, Milk Marbling, Velvet Underground, Jellyfish Bloom, Cell Bloom,
  Clock Glass, Lava Lamp), proposed as Home's one fixed pack; Fillmore (Acid Trip,
  Fractal Dream, Classic, Poster 1969, Home Movie, Crowd Plate, Roy); Neon (Comet River,
  Solar Flare, Cyberpunk, Bass Drop, Galaxy, Stardust Collapse); Lab (Neon Coral Reef,
  Microscopic Chaos, Turing Print, Chemical Clock, Red Cabbage, Macro Bead, Lacing Run);
  Ferro & Film (Ferro Paint, Magnet Garden, Soap Film). None of the batches touches the
  gallery's grey wash (#401).

- **28j. Changing looks without a jump** (the owner, 2026-10-19: "transitions between
  presets are also a little jumpy here and there"). `blendLooks` fades every number and
  colour but switches lists, steps and booleans at the midpoint, and the handoff in
  `LiquidVisualizer` lays the new look's ferrofluid ring in one frame. ~~**28j-1. The two
  jumps a Go, a Back and a Send to wall made on every pair**~~ (**shipped**; story in
  `docs/plan-shipped.md` 28j-1): the patch list (`sceneMappings`) now crossfades by depth,
  and the ring's `phaseAmount` dips to nothing at the swap and rises on the new look's own
  value. Open, each named so it is not found twice:
  - **28j-2. The handoff's first frame.** `clearChemistry` and the fluids' `liquid.clear`
    run on frame one of every Go, so the dye's chemistry cuts while the dye thins. Needs a
    fade of the clear (the readbacks only exist on a GPU): measure the first-frame step of
    the chemistry fields on the Mac, before and after.
  - **28j-3. The paths that do not hand off.** MIDI program changes, `preset-next` and
    `preset-prev`, sound triggers and the set list's own steps call `adoptPreset` with
    no `handoff` and no `lookFadeStep` at all; a song's new look (`evolvedLook`) travels
    the numbers but not the ring. `arrive` times the black after a step; it does not
    measure a jump, so a new measure (the frame-to-frame change of the plate across the
    swap, `PW_WEBGPU=1` is not enough: it needs the app's frames) is part of this item.
  - **28j-4. The midpoint switches that show.** Of 992 look pairs the midpoint switches
    `layerCount` on 510, `blendMode` on 498, `ledPlatform` 494, `turbulenceDetail` 450,
    `viscosity` 414, `ledMode` 278, `macroMode` 174, `macroCamera` 120, `kaleidoscope` 62
    and `stockType` 62. Each is a different kind of jump (a layer appearing, a blend
    changing, the solver's viscosity stepping); none is fixed by one rule, so take the
    most-seen first and look at each on the Mac.
  - **28j-5. `audioMappings` switch at the midpoint** on 944 of 992 pairs, so the sound
    drives the old look's settings until 0.5 and the new look's after. The numbers they
    drive are mid-blend at that moment, so a mapping that swaps can pull a setting off
    its blended value by its full depth in one tick. Crossfade the depths as 28j-1 does
    the patches, and add the same step-per-tick bar to `desk`.


- **28k. Splodascope: a crowd of oil drops that do not merge** (the owner, 2026-10-25, from a
  photograph of a splodascope: round cells of yellow, green, red and pink oil packed edge
  to edge in blue water, some inside others; "if not, let's fix the physics").
  - ~~**28k-1. Film Hold and the Splodascope look**~~ (**shipped**, this PR; the story in
    `docs/plan-shipped.md` §28k). `npm run filmhold`: the look's crowd held 35 → 31 bodies in
    six seconds, the same plate without the hold 35 → 3.
  - **28k-2. Shortcuts named in 28k-1.** (a) The film is drawn as thick as the field's own
    edge (two to five cells), where a real one is tens of nanometres. (b) A film breaks when
    pressed past what it holds, which is the real threshold but not the real timing: real
    films also drain and rupture by chance, sooner when dirty or warm. Replace with a
    drainage time per contact (Reynolds' film drainage, μR²/(gap·σ)-scaled, as the research
    on bubbles and drops item 7 gives for the beads) and a rupture drawn from it.
  - **28k-3. The tiny specks.** The photograph's crowd runs down to specks a hundredth of the
    frame; the field cannot hold a drop of under about three cells (Cahn–Hilliard dissolves
    it), so the look lays nothing under a sixtieth of the plate. The beads (`beads.ts`,
    `beadDrops`) are the drops under the grid; give the look a scatter of them in the oil's
    colours once 28k-1 is judged.
  - **28k-4. Judged on the Mac** (`docs/judging.md` §79): the look beside the photograph at
    the app's own grid, and whether a kick (Plate Pressure) breaks a few films and no more.
  - **28k-5. The colours darken at the walls over time** (found here, lab at 256²): yellow
    drops go orange and brown from their edges inward over ten seconds, and green darkens,
    though the oil's own share of the dye holds (19369 → 19368). The water's cobalt meets
    each drop's colour in the edge's few cells of part-oil and the two multiply toward
    black there; pressed into a crowd, a drop is mostly edge. Measure where the colour
    goes (the dye per drop against its laid colour, the angle of its absorbance) and find
    whether it is the partition's hand-over at a held film (bodyPartition) or the edge's
    width; never by thinning the dyes further.

## 29. The closeup's ferrofluid drop: a bead dragged through dye (asked 2026-10-11)

The owner, 2026-10-11: "I'm still not happy with the macroview. I want to see much more
3d drops. I want to see a drop of ferro fluid with light reflecting off of it, with some
dye on top of it as it gets pulled through dyes, causing the dye to spread as the drop
gets pulled through dyes. At some point the dye rolls off of the ferrofluid drip,
leaving some dye around and then the ferrofluid keeps getting pulled through the dye and
making waves of sorts. [...] Calm details and control."

What the closeup drew, rendered in the lab (a drop 0.03 of the plate across, Ferro Paint's
settings, a magnet walked through three dyes; pictures in the project's shared files,
`macro-ferro-drop/`): a flat black disc with a brown line round it and one painted dot;
the drop's inside one value of black to the byte. The solver carries the ferrofluid as a
layer of one depth (a full cell 0.3 l_c, FILM_H0), so there was no surface to light. And
with the look's own magnet walked at a tenth of the plate a second, the drop crept 0.05
of the plate in four seconds; with one strong enough to drag it (0.5 at 0.2) it plowed
through the yellow, parting it round itself and leaving it behind, and then spread into a
brown smear with no cell left half full within two seconds.

One PR each, in this order. The steps after 29a are handed to Antigravity, with the physics,
the code's entry points, the checks to add and the scenes to match, in
`docs/handoff-macro-ferro-drop.md`.

- ~~**29a. The drop as a bead with the light on it.**~~ **Shipped** (this PR; the story in
  `docs/plan-shipped.md` §29a). Its shortcuts, each still open:
  - **29a-1.** A drop smaller than l_c comes out lower than its spherical cap: P is one
    value for every drop (set by the contact angle on a wide drop), not each drop's own
    from its contact angle. Per-drop P (a drop's slope at its line set to tan θ).
  - **29a-2.** The small-slope curvature (∇²h, not the full mean curvature), with the
    plateau set exact: the slope at the contact line is not θ.
  - **29a-3.** The picture's drop is taller than the solver's layer (0.3 l_c a full
    cell); carry the drop's volume in the solver as the bead's thickness, so the drop the
    flow moves is the drop the picture draws.
  - **29a-4.** The magnet's volume shift is held to its mean over all the ferrofluid on
    the plate, not drop by drop.
  - **29a-5.** The magnets' radius is the default Magnet Size's in the solve (the plate's
    uniforms carry no radius).
  - **29a-6.** The top glass's own reflection of the room (4% of the tent over everything)
    and the exit losses through the glass are left out, as a photographer's flag and
    polariser would leave them; the reflected plate past total reflection is the plate
    decoded plainly, without the closeup's cells or lacing.
  - **29a-7.** Its cost read on the Mac (`npm run stages` with the closeup in over a
    drop): about 18 million texel reads a frame on 384², 24 sweeps warm and 200 from cold.
  - **29a-8.** The drops' mask is 512 px across the plate (`beads.ts`), and at 6x the
    closeup shows a ninth of the plate's width on a 1440 px frame, so the mask is
    magnified about 25× and a drop 0.03 of the plate across is drawn from about fifteen
    mask pixels: its edge reads blocky where the ferrofluid's surface is smooth. Draw the
    edge from the solved surface (29a) or at the closeup's own resolution.
  - **29a-9.** A drop reads the flow from its nearest cell (`beads.ts`), so its speed
    steps as it crosses a cell's edge; sample the velocity bilinearly, as the solver's
    advection does.
- **29b. Dye on the drop: carried, spread, and shed off its back.** The water over the
  drop is the gap less the drop's height and is dragged with the drop's surface (no slip
  on the drop, no shear at the top glass's far side through the thin film), so its dye
  rides along, thins as the column does where the drop is tall, and is left at the rear
  stagnation point as the drop moves on: trails. Today `phaseDisplace` pushes the dye out
  of the ferrofluid as though the drop filled the gap. The dye's own passes belong to
  other threads (18h, the dye's spread along the flow; 18m, a pour's slump): this one
  changes only how the dye is carried where the ferrofluid is, after coordinating.
- ~~**29c. The drop follows the hand and holds together.**~~ **Shipped** (#373, #495; the story in
  `docs/plan-shipped.md` §29c): the rim's force read against the ferrofluid's own drag (`phaseForce`),
  the moving edge compressed back by the flux limiter's deficit from a once-a-step blur (`phaseBlur`,
  `phaseCompress`, 29c-1), the gain derived in SI and held to the solver (`npm run magnetgain` 5/5, bars 20%, 29c-2), the ferrofluid's momentum carried with it (`phaseMomentum`), degenerate mobility
  `mob = 4m(1 − m)` in the thin gap's Cahn–Hilliard step (`phaseCHVolume`, 29c-7) with the
  resting-drop check `npm run ferrorest` (5/5, with a second window), the dragged drop held
  while it is dragged by `npm run ferrohold` (each pass switched off by hand turns its own line red;
  `phaseCompress` is a lab-only step option, 1 by default), and two-phase carry of a coherent drop's
  trailing rim on the thin gap (`phaseVelocity`, 29c-8; `npm run ferrodrag` 3/3 and in CI since
  29c-10, its Thin-Gap-off lines since 29c-11; `ferrohold` 5/5 over the whole drag). If the closeup's camera ever follows the drop, it follows smoothly and never with the
  sound (the sway work's `frameSway`, default 0, stays the only way sound moves the frame). Still
  open:
  - **29c-1. The moving edge is compressed back to the grid's width, and the deep plate keeps
    main's step** (`phaseCompress`: Weller's interface compression, a flux along the edge's normal
    at the flow's own speed, read from the field blurred once a step by `phaseBlur`, and scaled by
    `withheld`, the share of each face's slope the flux step's minmod limiter dropped over
    `phasePlan`'s `psub` substeps: the first form, every moving face alike, sharpened a smooth pool
    the step had not spread, `ferropress`'s lifted ring 0.049 against the 0.03 bar where main has
    0.012; matched to the limiter, 0.002 on the Mac, 7/7). A shortcut standing in for an interface
    the grid cannot draw: a real drop's edge is a molecule thick, the grid's three cells of grey,
    and the flux step spreads a moving one by half a cell times the cells it moves. Nothing at
    rest. Both `phaseCompress` and `phaseCHVolume`'s degenerate mobility (29c-7) run on the thin gap
    only so far: run on the deep plate too, whose looks were measured with main's spreading and
    constant-mobility `phaseCH`, the first form broke three of them on the Mac's `plate` shard
    (spikes 2/6, maze 3/4, fingers 3/4 at #373's third head), so the deep plate keeps main's
    `phaseCH` and no compression (`spikes` 6/6, `maze` 4/4, `fingers` 4/4). Open: run `spikes`,
    `maze` and `fingers` with the limiter-matched compression and degenerate mobility (plus a
    bounded potential for the deep plate's 0.4% overshoot) on the deep plate and decide whether the
    looks take them.
  - **29c-2. The gain is a tenth of EFH1's, and the far pools sit by it.** `npm run
    magnetgain` works the pull out in tesla, metres and seconds: the solver's ψ is the
    Langevin energy of the ferrofluid in the rod's field, so GAIN_phys = (χ/2μ₀)(SPIKE_B_REF·Br)²
    h₀² / (12 ρ ν_ref L² MAGNET_E) = 5.775e-5 s at Ferrotec's χ 2.64 (0.22 of it at the 1.2 some
    papers give); MAGNET_GAIN is 6e-6. Nearer a magnet than 0.3 of the plate it makes no
    difference (29c-5): the pull asks for more than a step can carry at any gain the plate has
    had. The far field it sets: at the real pull Magnet Garden's and Ferro Paint's own magnets
    gather the whole plate at the guard's speed, where today's pools sit as poured, and every
    look with a magnet is tuned on that. A real plate's far pools sit for a reason the solver
    lacks: the contact line's pinning on the glass. A drop does not move until the force on it
    beats its contact angle's hysteresis, σ·2R·(cos θ_r − cos θ_a), of order 10⁻⁴ N for a 5 mm
    drop against water, which a look's own magnet's far field (a few hundred N/m³ on that
    drop) does not. Add the pinning as a yield on the phase's motion under the Kelvin force,
    with the real σ and angles, then set the gain to the physics and re-read every look with
    a magnet.
  - **29c-3. The solver's saturation knee is at 9 mT, EFH1's at 17.** ψ = E b²/(1 + b/Bs)
    meets its plateau at b = Bs/2, 9 mT; a Langevin EFH1 (Ms 440 G, χ 2.64) at μ₀Ms/χ =
    16.7 mT, so nearer a magnet than that the solver's pull is under the real one, by about
    twice at the hand's magnet. It never shows in the pull (the guard is the speed there,
    29c-5), only in how saturated the maze reads the field (phaseMu's `sat`), which every
    labyrinth look is tuned on: move Bs to the physics with the maze looks re-read.
  - **29c-4. The ferrofluid in a rim cell rides the cell's mean velocity, not its own
    column's.** Tried in #373 and dropped (the story in `docs/plan-shipped.md` §29c): replacing a
    rim cell's velocity with the body's Gaussian mean (`phaseVelocity`) packed a pressed pool
    (`ferropress` middle 1.025 of full, lifted ring 0.046) and raised 23 domes with no magnet on
    the Mac (`spikes`), while a first-order least-squares fit of the body's velocity and gradients,
    read as a drift flux `φ(1 − φ)(u_ff − u_mix)` (`phaseDrift`), only held the drop while the
    first over-compressing `phaseCompress` packed its shed tail back on; with the limiter-matched
    compression it still shed (half-full cells 100 → 32, lag 2.49R), so the carry is the mixture's
    velocity again and the trailing-rim loss is open under **29c-8**.
  - **29c-5. The hand's speed limit is the grid's.** A real drop under a hand's magnet is
    pinned to it, its Darcy speed under the Kelvin force metres a second (`npm run magnetgain`
    prints each magnet's); the solver's is MAGNET_CELLS, 2.4 cells a step, 0.375 of the plate
    a second on 384² and 0.19 on 768². The hand's own carry already takes substeps for its speed
    (handSubs, up to CARRY_SUBSTEPS at CARRY_COURANT of a cell each): the magnet's asked cells a
    step should set the phase's substeps the same way, with the velocity's own advection checked at
    that speed.
  - **29c-6. The projection reads one mobility.** thinProject takes u = u* − ∇p with the one
    coefficient for every cell, so the pressure that pushes the oil out of a moving drop's way
    moves the oil no more easily than the ferrofluid, where the real oil gives way ν_ff/ν_clear
    (4.48) times as easily. A circular drop driven by a body force f in the gap goes at
    f h²/(12(μ_ff + μ_clear)), its inside under one pressure gradient and the oil's return flow
    a dipole round it: 0.82 of the ferrofluid's own Darcy speed at that ratio, and half of it
    with the oil as hard to move as the ferrofluid. With every cell relaxed to its Darcy speed
    each step the solver's drop would go at that half; its oil's velocity persists between steps
    (the oil's drag relaxes it more slowly than the ferrofluid's), so under `npm run magnetgain`'s
    weak magnet (0.08 at depth 0.2) the drop goes 0.0114 of the plate a second against the
    two-liquid law's 0.0130 (-13% apart). The fix is a mobility per cell in the projection,
    ∇·(k(φ)∇p) = ∇·u* with k the inverse of the cell's viscosity, which costs the pressure solve
    its constant coefficient (the same stencil with k on each face, and a multigrid that
    coarsens it). Until then magnetgain reads the drop's speed against the two-liquid law, with
    the rim's own factor `share·(ν_clear/ν_ff)^(1−φ)` applied per cell as the shader applies it,
    and a bar of 20% (the weak drop reads about -6% on software WebGPU, the strong one about +4%).
  - ~~**29c-7. A resting drop dissolves into its halo.**~~ **Shipped** (#373; `npm run ferrorest`
    4/4, story in `docs/plan-shipped.md` §29c). On the thin gap, `phaseCHVolume` used a constant
    mobility at Cahn number ≈ 0.5 (an eight-cell drop on 384², `R = 0.022`, `phaseSharp = 0.75`),
    so a curved edge's Gibbs–Thomson chemical potential shifted the bulk equilibrium to
    `c_eq ≈ 0.021` and drove ferrofluid out into the clear oil at `2·M·dt` per substep: with no
    magnet and nothing moving, a resting drop went from 116 half-full cells as poured (100 at the
    20th step, where the check starts its clock) to 84 at the 200th, its peak fell `0.996 → 0.946`,
    and its halo of cells over `0.01` grew by `+248` (`352 → 600`, from `222` as poured), step for
    step as on `main` with `thinGap: 1`; a dragged drop continually left that halo behind in fresh
    oil and re-made it as it moved, losing about half its ferrofluid (`352 → 1602` cells over
    `0.01`). `phaseCHVolume` now multiplies each face's flux by the degenerate mobility
    `mob = 4m(1 − m)` at the face's mean share `m = ½(c_p + c_q)`, with no floor (Elliott & Garcke
    1996): antisymmetric across each face so `Σc·h` is conserved (to `0.011%` over 180 steps, against
    a `9.8%` loss when evaluated at `c_p` alone), at most `1` so the explicit stability limit
    (`≤ M_0`) is unchanged, and zero in pure oil and pure ferrofluid. At rest (`npm run ferrorest`,
    4/4) the drop holds `90` of `100` half-full cells (`90.0%`, bar `>= 88%`), its peak holds
    `0.975` (bar `>= 0.96`), and its halo grows by `+94` (`324 → 418`, bar `<= +120`), while on the
    dragged drop the cells over `0.01` fall from `1602` to `1238`. The deep plate's `phaseCH` stays
    as on `main` (under **29c-1**).
  - ~~**29c-8. A dragged drop loses its trailing rim to the oil's return flow.**~~ **Shipped** (#495;
    `npm run ferrodrag` 3/3 on the Mac GPU, story in `docs/plan-shipped.md` §29c). With the
    limiter-matched `phaseCompress` (29c-1) and degenerate mobility in `phaseCHVolume` (29c-7) both
    in place (`ferropress` 7/7, `magnetgain` 5/5, `ferrorest` 5/5), a drop dragged `0.3` of the
    plate in 3 s under a `0.4` magnet at depth `0.2` (`npm run ferrodrag`) still lost its trailing
    rim to the oil's dipole return flow (`ferrodrag` 1/3 on `main`: lag `3.24R` against the `2R` bar,
    half-full cells `100 → 0` against the `±15%` bar, cells over `0.01` `324 → 1238`, centroid at
    rest moved `0.010` cells). Where the drop's back rim thinned, the cell's single mixture velocity
    `u_mix = φu_ff + (1 − φ)u_oil` turned backward with the oil closing in behind the drop, so
    `phaseAdvectPlan` carried that faint ferrofluid into the wake and `phaseCompress` compressed it
    along the wake rather than back into the drop. Chosen fix: **two-phase carry** (`phaseVelocity`
    in `src/gpu/wgsl/fluid.ts`, writing `this.phaseVelT` read by `phaseAdvect`, `phaseAdvectPlan`
    and `phaseCompress` while `this.vel` remains the mixture velocity for dye, oil and
    `phaseMomentum`), chosen over a pre-projection Korteweg or contact-line force because any force
    before `hsProject` still leaves a single projected cell velocity `u_mix` shared by both phases
    (and any curl-free edge force is removed by the pressure projection). For each rim cell on a
    thin gap when no labyrinth or standing-spike field is parting the pool (`cohere = (1 − 2·maze)·(1 − spikeAmt)`
    while `!filmHeld`), `phaseVelocity` samples the half-full drop body (`φ >= 0.50`) within 11
    cells weighted by `((φ − 0.50)/0.50)·exp(−r²/64)` to get the local body velocity `u_m` and
    centre-of-mass offset `x_m`. It leaves `v` untouched whenever `dot(v.xy, u_m) >= |u_m|²` (so
    radial squeeze flows under a press where `|u(r)| ∝ r` are a no-op: `ferropress` 7/7, middle
    `0.968 → 0.981`, worst ring `0.012`), and weights the carry by position along the drop's motion
    (`along = dot(x_m, u_m)/|u_m|`: full carry up to `φ = 0.96` on the trailing side `along > 0`,
    and only the outer leading toe `φ < 0.49` on the leading side `along < 0` so the front
    half-full contour keeps its two-liquid Darcy speed and MUSCL shear). On the Mac GPU,
    `npm run ferrodrag` reaches **3/3** (lag `1.82R` against `2.0R`, half-full cells `100 → 106`,
    `106.0%` kept against `±15%`, cells over `0.01` `324 → 378`, stationary control `0.010` cells),
    `ferrohold` holds **5/5** (step 60 `110` half-full cells, centroid `0.426`; mean lead `1.69R`
    vs `1.93R` with `phaseMomentum` off, `+0.24R` against `0.13R`; mean half-full `107.6` vs `92.6`
    with `phaseCompress` off, `+15.0` against `13`), `magnetgain` holds **5/5** (`+2%` weak, `+3%`
    strong against Darcy's), and `ferrorest` (`5/5`), `spikes` (`6/6`), `maze` (`4/4`), `fingers`
    (`4/4`), `domes` (`4/4`) and `ferrohands` (`4/4`) are unchanged. Per the 29c-8 brief, `ferrodrag`
    was not added to `checks.yml` in #495. The review found the deep plate riding `phaseVelT` after
    Thin Gap was switched off (`runPhaseAdvect` keyed off `hsP`, which outlives Thin Gap): the dragged
    drop, magnet off, slid on another `0.0425` of the plate in 120 steps and smeared to `0` half-full
    cells; keyed off the step's own `thinLive` it stays (`0.6206 → 0.6241`, `104 → 94` half-full).
  - ~~**29c-10. `ferrodrag` joins CI.**~~ **Shipped** (this PR; story in `docs/plan-shipped.md` §29c):
    `npm run ferrodrag` on the show shard (lines 1 to 3, 3/3 on Metal in 39 s), and `ferrohold` read
    over the whole drag (steps 60 to 180) with its bars between the runs again (5/5 on Metal: lead
    `1.74R` vs `2.07R`, half-full `105.8` vs `82.2`). The Thin-Gap-off line joined CI under 29c-11.
  - ~~**29c-11. On Metal, the Thin-Gap-off line cannot tell the review's fix from its absence.**~~
    **Shipped** (this PR; story in `docs/plan-shipped.md` §29c): the lab stayed thin for the first of
    those "deep" steps while the old plate's pipelines built off the frame (`thinGapOn`), and on Metal
    the build outlasted the drop's coast (57 of 120 steps deep on the real plate, 0 on the control).
    `lab.step` now builds the old plate first after a thin step; lines 4 and 5 require all 120 steps
    deep and run in CI (`npm run ferrodrag -- --thinoff`, show shard). Metal 5/5: real `0.09R`,
    control `1.93R`.
  - **29c-12. Key `phaseVel()`'s default off `thinLive` before `phaseCompress` reaches the deep plate.**
    `runPhaseCompress` and `runPhasePlanned` call `phaseVel()` with `thin = true`, which today runs only
    on a thin step. Once `phaseCompress` moves onto the deep plate (29c-1), that default must be keyed
    off `thinLive`, or the stale `phaseVelT` comes back there; `ferrodrag -- --thinoff` would catch the
    carry, not necessarily the compression.
  - **29c-9. Replace `phaseVelocity`'s local window reconstruction with a coupled two-fluid velocity
    solve.** `phaseVelocity` (29c-8) is a named shortcut: instead of solving two coupled momentum
    and Darcy-projection equations for `u_ff` and `u_oil` across the diffuse interface (with
    interfacial drag and capillary stress jumping between the two phase velocities), it reconstructs
    `u_ff` in the rim from the nearby half-full body (`φ >= 0.50`) over an 11-cell Gaussian window
    and gates the pass off on labyrinth and standing-spike scenes (`cohere`). Replace the window
    reconstruction with a two-fluid velocity or slip solve so the rim's ferrofluid velocity comes
    from the momentum balance on every scene without a window or a labyrinth/spike gate. The
    leading toe's carry (`front = 0.72 · …` in `phaseVelocity`) is a tuned value, not a derived one;
    the two-fluid solve replaces it too.
- **29d. The drop's wake: the dye folding behind it, and the drop's own ripples.** In the
  gap the flow round a moving drop is the potential flow round a cylinder, so the dye
  parts at the bow, wraps the sides and closes behind as folds; and a drop jerked by the
  magnet rings at its capillary frequency, waves on its surface damped by the
  ferrofluid's viscosity. The second needs the drop's surface to carry momentum (a wave
  equation on h), not only the static balance 29a solves.
- **29e. A Ferro Drop look.** One drop, three dyes, a calm magnet walk, the closeup
  following the drop, the cells off: the owner's description as a look, on the desk and
  the phone.
- **29f. Calm control.** The drop's controls where a performer reaches them on the desk
  and the phone: how much it beads up (today Relief / 3D), where the light is, how big
  the drop is.

## 30. Shaping the sound and the MIDI: what Imaginando's VS rig showed (2026-10-11)

*Asked 2026-10-11: the owner shared Imaginando's post of an iPad running FRMS (a
granular synth) and GRFX (granular effects) inside AUM, driving visuals made in VS, as
an improvised audio-visual set, and asked what ChromaGlass should change or add. The
owner put all of it into the plan the same day.*

**What VS is.** Imaginando's visual synth: up to eight shader layers with blend modes,
four voices a layer, four LFOs, two ADSR envelopes a layer and one modulation matrix.
Its audio modulators either follow peaks (gate) or follow a band picked by dragging on
a live spectrum, each with threshold, gain, attack and release. It reads MIDI notes,
velocity, CC, clock and Program Change, keeps time on its own clock, MIDI clock or
Ableton Link, plays playlists with a duration and a fade per entry, and sends NDI,
Syphon and Spout. FRMS and GRFX are the sound side and have nothing visual to borrow.
AUM is the iPad host: it routes audio, routes and filters MIDI through a matrix, and
keeps everything on Link.

**Where ChromaGlass already stands.** The patch bay is VS's matrix (sources onto any
setting, bipolar depth, per plate: `SceneMapping` in `types.ts`); the named kick, snare,
hats, bass, note and eight bands are its audio modulators; the set list and the
sequencer are its playlists; MIDI learn, clock and timecode come in; Record is its
recorder; and Art-Net puts the plate on the room's lights, which VS does not do at all.
The gap is in how a sound or a note is shaped before it reaches a setting.

**Ranked.** By what a performer gains for the work; each is briefed by Claude with its
check written first and built by Antigravity. None moves the whole frame by default
(the owner's rule), and every reading is a fast one (the owner's rule for sound patches).

1. ~~**30a**, below: shape each sound cord.~~ (Shipped; `npm run soundcords`.)
2. **14t-pc**: Program Change picks a look or a set-list item.
3. **24.3**, moved up: notes as voices, with an envelope per note and notes as a source.
4. **13.5-link** before **13.5-osc**: Link first.
5. **30b**, below: LFOs and envelopes you set.
6. **13.4-ipad**: playing from an iPad in AUM, written up and tried once.
7. **13.7-ipad**, later: an AUv3 bridge for iPad hosts.

NDI, Syphon and Spout out (13.2, 13.3) stay where they are: VS ships all three, so a VJ
expects them. The lights (14q, R8, 14m) stay next. §23 has VS's price.

**Re-read 2026-10-24 (VS 2).** The owner sent VS 2's page and asked what to bring in;
nothing in the list above had shipped. VS 2 shows one thing new to this plan: each
layer listens and modulates on its own. That is **25h** (areas that listen for
themselves), and it goes first, since it answers the owner's same-day ask for parts of
the plate reacting to the music and more varied palettes. The rest folds into items
already here: chords placed across the plate (24.3), a smoothed random and a restarted
LFO (30b), a live picture poured in as dye (§13 step 6, video in) and a portrait clip
(34f). The order now: 25h, 30a, 24.3, 30b, 14t-pc, then the rest as above. Not copied,
as before: the shader editor and imports, the feedback layer, and anything that moves
the frame; VS's oscilloscope and audio-visualizer shaders are 34c and 34d's (the
analyzer look; Chladni figures, real physics). Pricing was left out at the owner's word.

### ~~30a. A sound cord has only a depth~~ (shipped 2026-10-26)

Shipped (`npm run soundcords`, 34/34 lines in `scripts/checks.json`). Each `sound` or `bands`
cord on `SceneMapping` (`src/types.ts`) now carries `mode` (`'follow' | 'gate'`, absent =
`'follow'` on whole-plate cords even when `threshold`, `attack` or `release` are present;
area cords keep `CordGate`'s rule), `gain` (absent = 1, applied to the reading before the
threshold in both modes), `threshold`, `attack`, `release`, and on `bands` cords a custom
dragged `band` (`[loHz, hiHz]`, winning over `feature` while the panel writes `feature` as
the named band holding the drag's middle for fallback). `BandRange` (`src/lib/audioFeatures.ts`)
hears `[loHz, hiHz]` from `AudioReading`'s spectrum with the same `binsFor`, reference floor
and `AutoRange` (6 dB minimum, 30 dB cap) as `band1`..`band8`, and `PatchBay.fold`
(`src/lib/sceneMap.ts`) steps a `CordGate` per gated whole-plate cord clocked from `fold`'s
`now` (closing **25h-2**). The patch bay editor (`src/components/SettingsPanel.tsx`) and
`src/components/phone/BandStrip.tsx` draw the mode, gain, threshold, rise and fall controls
and the live log-frequency spectrum strip on both the desk and the phone. Story in
`docs/plan-shipped.md` §30a.
- **30a-1. The dragged band on the cast display and the phone remote.** Decided with 30a:
  on a second screen attached to the laptop (`StageMirror` in `CastDisplay.tsx`), the
  projector mirrors `#liquid-canvas` directly, so it shows the laptop's fold (including
  dragged-band cords) frame for frame. A standalone network `CastReceiver` rebuilds
  `AudioData` from `CastAudio` on the wire with no spectrum behind it (`liveValue`,
  `sceneMap.ts`), so `sound` cords fold and gate there while `bands` cords (fixed or
  dragged) read nothing, matching fixed `bands` cords today. Carrying evaluated `bands`
  cord readings over `CastAudio` if standalone receivers need `bands` patches remains open here.
- **30a-2. Found in the review of #511.** (a) Shipped with it: an area cord on a dragged
  band read 0 for the whole of a look fade (the range was kept per mapping object and a
  fade builds every object again each frame); `AreaHands` now keeps the `BandRange` with
  the cord's gate, and `areacords -- --node` holds it. Open: (b) `soundcords` has no line
  that holds the drag's `AutoRange` minimum span against a quiet, narrow band (its tape's
  band5 always swings far over 12 dB, so a 12 dB span passes); (c) `BandStrip` never
  resets its `BandRange` when the band changes, so after a drag its live level reads
  against the old band's range until it catches up; (d) the rule for when a cord gates is
  written out twice in `SettingsPanel.tsx` beside `gated()` in `areaCords.ts`; import `gated`.

### 30b. The LFOs and envelopes are fixed

`modulators.ts` has four LFOs locked to bars and two envelopes, all fixed: an eight-bar
and a two-bar sine, a one-bar triangle, a stepped LFO every beat, a snap and a swell,
and a MIDI note fires both envelopes. A fixed eight-bar sine fits some songs and fights
others. Let each LFO pick its rate in bars (a quarter to sixteen) and its shape (sine,
triangle, ramp, stepped), and each envelope its attack and decay and what fires it (the
kick, the snare, a note channel, a pad, or anything, as today). Today's rates and shapes
are the defaults, so a look saved before keeps its motion; an LFO aimed at a setting
that moves the frame stays off by default as every frame-moving source is. On the phone,
rate and shape on the patch view. *Measure:* `npm run shapes` with each rate and shape
set: the period within a frame of its bars at 120 and at 90 bpm, and an envelope fired
by the kick on a recorded loop once per kick.
*Added from VS 2 (2026-10-24).* Two shapes VS has and this lacks: a smoothed random (a new
random target each period, glided to rather than stepped) beside the stepped one; and an
LFO that restarts its cycle on a trigger (a note on a channel, the kick, a pad), so a
sweep begins with the phrase rather than wherever the bar clock left it. The measure adds
the smoothed random's slope bounded (no step larger than a frame's share of its range)
and a restart landing within a frame of each kick on the recorded loop.

**Not copied.** A shader editor and imports from Shadertoy, ISF or GLSL Sandbox: the
plate is a simulated liquid, not a stack of shaders (the owner's rule to model the real
phenomenon), and VS sells pasting shaders made by a chatbot, which fails the rule that
nothing in the app seems like AI. The "Business Plan" section below used to list
"custom ISF shader imports" as a Pro feature; the owner dropped it on 2026-10-11. A feedback layer: the liquid already carries its own memory. The tunnel in
the post's video, which zooms the whole frame on the sound: frame motion, off by default.
ChromaGlass itself as an AUv3 inside AUM: the plate needs WebGPU and more memory than an
audio extension gets (inferred), the same reason as §13's "not doing a plugin inside
the host"; 13.7-ipad is the part of it that fits.

## 31. Optics and the wall: what Boris FX Continuum showed (2026-10-11)

*Asked 2026-10-11: the owner shared Boris FX Continuum and asked for more ideas. The
owner put all five below into the plan the same day.*

**What Continuum is.** An offline plug-in suite for After Effects, Premiere, Resolve,
Avid, Nuke and Vegas (2026.5, May 2026): a few hundred effects sold in units (light and
glow, film style, warps, keying, transitions, particles, titles), Mocha tracking, a run
of machine-learning repair and masking tools, and Beat Reactor, which drives any effect
from an audio file through rectangles drawn on a spectrum.

**Where ChromaGlass already stands.** Beat Reactor is the patch bay with 30a's shaping;
Pixel Chooser is §25's areas, the mixer's layers and the wall's shapes; its dissolves are
the look fade, the mixer and 18g's flushing; Particle Fluid Dynamics is the solver; Motion
Blur ML's trail is 5-shutter; Curl's heat haze is 18f through 18e's index; its colour
management is 18k-linear; Super LED is Art-Net (14q). The rest is post-production on
footage, or a picture laid over the plate.

**Ranked.** By what a performer gains for the work; each is briefed by Claude with its
check written first and built by Antigravity. None moves the whole frame by default, and
every sound reading is a fast one (the owner's rules).

1. **31a**, the projector's focus across the two dishes.
2. **31b**, a warp grid for curved walls.
3. **31c**, two more ways to shape a sound cord (with 30a).
4. **31d**, colour at a defocused edge (inside 18e).
5. **31e**, halation in the Photograph style.

### 31a. Both dishes are always in focus

The plate's two layers are drawn sharp, as if they sat in one plane. The camera looks
have a focus, but over the dye's painted height (`camera.ts`, the circle of confusion from
`h − U.focus`), which 18e says is not a real height. On an overhead the two dishes sit at
different heights between the condenser and the lens, so the lens focuses on one and the
other goes soft: the blur is a disc, the lens pupil's image, sized by the thin-lens law
from the distance between the dishes and the aperture. Riding the focus from the colour
dish to the oil dish is a move an operator makes by hand. Add one focus control in the
projector's terms (which plane, and the lens's aperture): each layer gets a disc blur sized
by its distance from that plane, and the same distance is 18e's shadowgraph Δz, so the
edge doublets flip as focus passes through a layer, as Becke lines do. The default keeps
both layers sharp (today's look). MIDI-learnable, on both desks and on the phone's remote.
*Measure:* in the lab, a sharp disc on each layer: the edge's 10–90 % width against the
focus setting within 10 % of the thin-lens prediction, and the default the same picture
to the bit. After 18e.

### 31b. A surface on the wall is four corners only

Every surface is four corners and one projective map (`outputConfig.ts`): right for a
flat wall, wrong for a dome, a column, a curved cyc or a hanging sheet, which gigs often
have. Let each surface carry a grid of control points (up to 8 × 8, smoothly
interpolated) inside its corner pin, and load an ST map (a 16-bit image of UV coordinates
exported from projection-mapping or calibration tools). The test pattern goes through the
same grid. On the phone, the remote's wall page drags grid points as it drags corners now.
*Measure:* `npm run map` extended: a known warp applied to the test pattern puts each
grid crossing within half a wall pixel of where it should land, and an untouched grid is
the same picture to the bit.

### 31c. A sound cord reads only how loud its band is

Beat Reactor's samplers have a mode that outputs *which* frequency in the rectangle is
loudest, and a delay. Add both to 30a's cord: a third mode, *where in the band*, whose
output is the position of the loudest part inside the dragged band (0 to 1), so a walking
bassline moves a setting (a hue within the palette, say) by its note and not its
loudness; and a delay per cord, in beats or milliseconds, so one kick can land on two
settings one after the other. Absent fields read as today. On the phone, the patch view
carries both. *Measure:* added to 30a's check: a tone swept across a dragged band gives a
rising output within one bin, and a delayed cord fires within a frame of its delay.

### 31d. A defocused edge has no colour

A liquid's index varies with wavelength, so 18e's shadowgraph evaluated per band gives
the bright and dark doublets at a defocused oil edge faint colour. Small: inferred at a
few per cent of the deflection for water against mineral oil, so a refinement and not a
new look. Inside 18e, use the six-band spectral path that exists and give each liquid a
dispersion (Cauchy coefficients) next to its index in 18d. Chromatic aberration stays a
named dial in the camera looks only. *Measure:* in the lab, the red and blue fringe
offsets at a defocused oil edge in the ratio the Cauchy fit predicts, and zero at focus.

### 31e. The Photograph style glows white

The photographs the style is built from are on film, where light through the emulsion
reflects off the base and comes back through the red-sensitive layer first: a red-orange
halo round bright highlights, its width set by the base's thickness (halation). The
camera pass's bloom is white, the digital version. In the Photograph style, make the
bloom a halation kernel weighted to red at a fixed width in film terms; off in the
light-show style, as bloom is. *Measure:* a `look` render: the halo round a point
highlight is redder than its source, and its radius holds when the plate's resolution
changes.

**Not copied.** Sprites and overlays (Lens Flare, Atmospheric Glow, Orbs, Smoke & Fog,
Light Leaks): pictures laid over the plate, where a show's glow is the lamp through the
liquid (18b, 18e). Glitch, Scanline, Mosaic, Kaleidoscope, Ripple and Displacement
warps and the dissolve library: what every VJ tool ships ("Not doing"), and Beat Reactor
mostly drives them as whole-frame motion, off by default here. The gobo library, Light
Flicker and Flashing (the flash guard, 14i, keeps flashes off the wall). The
machine-learning tools (DeNoise, UpRes, Retimer, Face, Matte Assist, Depth Map): they
repair or mask footage the plate does not have, and anything that reads as generated fails
the rule that nothing looks like AI. Keying, retouching, titles and the VR tools: footage
work. The audio visualizer's spectrum bars.

## 32. The soap film: a draining film seen in reflection (asked 2026-10-18)

*Asked 2026-10-18: the owner shared a photograph of a vertical soap film in reflected
light and asked how to get that effect, and to hand the way to Antigravity. The check
that judges it, `npm run soapfilm`, is written and committed first (this PR); the build
is 32a–32e below.*

**What the photograph shows.** A film hanging in a frame and draining. Newton's series
in horizontal bands (silver, straw, purple, blue, green-gold, orange, magenta, and the
orders after), black lace where the film has thinned past about 30 nm, with dots and
islands of colour inside the black, and the bands combed and curled by the flow that
made them. Measured on the film's crop: black (luma under 0.12) 1.1% of the film, dark
(luma under 0.2) 14.3%, saturated (chroma over 0.25) 15%, silver 10.9%, 9 of the 12 hue
sectors holding more than 4% of the coloured pixels, mean luma by quarter from the top
0.39, 0.515, 0.605, 0.401, edge density 1.2% (gradient over 0.25) and 7.2% (over 0.15).

**What the app has, and the gap.** `filmTable.ts` gives the colour of a film of a given
thickness (Airy's sum, the CIE matching functions, a 5500 K lamp), at normal incidence
only, and the plate reads it as a faint tint: this plate is a projector, the light is the
film's *transmitted* light (pale by construction, `1 − R`) and the table's reflection is
gained and kept under 8%. The photograph is a *reflected* view on a dark ground. Three
things are missing and none of them is a colour trick:

1. A film that has a thickness in nanometres and is moved by gravity. Clear Film (20b)
   tears but has no gravity and no thickness, and 18k's note says the honest version is a
   transported thickness field.
2. A film that thins until it ruptures, from the top, to Newton black.
3. A reflection that depends on the angle you look from, because the path in the film is
   `2 n d cos θ`. The photograph's bands are bands of thickness seen at one angle; look
   from the side and every colour moves.

**The model (what is physics, and what is named).** Vertical drainage of a real film is
marginal regeneration: thin patches rise out of the Plateau border and thick ones sink,
because the film is a nearly inextensible sheet pulled by surface tension, so thickness
can only be exchanged, not stretched. The reference model keeps that and drops the rest:

- The film is a 2D incompressible Darcy flow, `u = (1/ζ)(−∇p + ρ g (h − h̄) ŷ)` with
  `∇·u = 0`. `h` is the thickness (nm), `h̄` its mean, `g` points down the film, and `p`,
  the Lagrange multiplier of the incompressibility, is the film's tension. Thick film
  sinks, thin film rises, and nothing is made or lost (`∇·u = 0`, `h` advected in
  conservation form). A MAC grid, a Gauss-Seidel projection and a limited second-order
  (minmod) advection; first-order upwind is measured below to be too diffusive.
- Evaporation takes a constant `evap` nm/s off every cell (about 5), which thins the top
  first because it is thinnest first. A cell under 30 nm relaxes to 8 nm (Newton's black
  film) over 0.5 s and stays there.
- The reflected colour is `filmReflectance(n0, n1, n2, d, λ, cosI)` summed through the
  matching functions: the table's Airy with the path `4π n d cos θ_t / λ`, `cos θ_t` from
  Snell's law. The first reflectance maximum at 550 nm therefore sits at `d₀ / cos θ_t`.

**Named shortcuts (the owner's rule: name them, give each a plan item).**
(a) *Gravity in the plane of a plate that lies flat.* The Hele-Shaw plate is horizontal; the
film "hangs" because `g` is applied along the picture's y. It is a look of a vertical film,
named so, and 32d keeps it a setting. (b) *ζ is tuned*, not derived: with `ρg = 9810` and
`ζ = 1.5` a 1600 nm patch falls the height of a 64-row film in about 30 s of show time. The
real drainage takes minutes, so this is a time compression (32d: a rate setting, never
tied to the sound). (c) *Evaporation is constant*, standing in for Plateau-border suction
and marginal regeneration at the frame; a rate that grows with the local curvature is the
next step in the physics. (d) *Rupture is a relaxation to 8 nm*, not a nucleation event;
the lace and islands come from the flow's noise, not from a model of bursting. (e) *Explicit
Marangoni plug flow* (the surfactant's own motion) is left out: it is stiff (wave speed
about 7.7 m/s on this grid) and the Darcy flow already carries the exchange. (f) *Angled
reflectance keeps normal-incidence Fresnel amplitudes (no s/p split), and on 2D films
`notchFloor` and `chromaRetention` are a colour grade standing in for the soft box's
angular spread and the camera's gamut, not the physics itself.* At viewing angle `θ_i`
the optical path in the film scales as `2 n d cos θ_t` by Snell's law, while the interface
reflection amplitudes `r_01` and `r_12` remain the normal-incidence values
`(n_a − n_b)/(n_a + n_b)` rather than splitting into s and p polarisations; on a 2D film
(`ny > 1`), the 4-point angular path spread (`spread = 0.025`) and dark ground
(`ground = 0.0004`) alone move saturation at `t = 120` s by two points from 79% to 77%
(dark 22.7%, 9/12 hues), and `notchFloor = 0.0725` and `chromaRetention = 0.67` are a
colour grade fitted to the photograph's 15% saturated (bringing saturation from 77% with
the grade off to 13% at `t = 120` s and 14.8% at `t = 110` s with the grade on, dark 19.4%,
8/12 hues) standing in for integrating over the soft box's solid angle and mapping into the
camera's gamut (32b-1 below).
Literature the model sits in: Chomaz, *J. Fluid Mech.* 2001 (the vertical film's
convection), Gros, Bussonnière and Cantat on marginal regeneration, and Huang and
colleagues 2020.

**The target (numbers, from the photograph and from the prototype).** A 32 × 64 film of
seeded noise on 800 nm, evaporating at 5 nm/s, at `dt` 0.05, over 120 s, sampled every
5 s. The prototype reaches true rupture (film under 30 nm, the only black that is the
film's and not a dark band's) after about 95 s, so the look stage is short: at 110 s the
film under 30 nm is 2.7%, dark 16.1%, saturated 83%, 9 of 12 hue sectors, and the window
the check asks for is exactly its three samples in a row, so 32a has no slack there and
should say so in its PR rather than tune toward it. One honest gap: the prototype is far
more saturated than the photograph (80–90%, against 15%) because the reflected table at
gain 4 is colourful, and the photograph's silver and white come from the look (the gain,
the ground, light that is not a point), so the saturation bar asks only for *more than*
10%, and 32b is where the look is tuned toward the photo's 15%.

**The check: `npm run soapfilm`** (`scripts/soapfilm.mjs`, node only, 7 groups, 23 lines).
It holds the *model*, not a picture of it, and it was written against three look-alikes
that it must fail (a film with no black, a blur laid over a fixed ramp, and a
compressible flow), each of which passed an earlier, weaker draft. C1 gravity sorts the
film (a 1600 nm patch sinks and a 400 nm one rises, each at least a quarter of the film's
height in 600 steps); C2 nothing is made or lost (mean thickness to 1e-9, a uniform film
stays uniform); C3 gravity is the only driver (with `g = 0` a noisy film does not move at
all; with `g` reversed the sort reverses; half the gravity sorts about half as fast, a
ratio of 0.35 to 0.7 after 2.5 s: the owner's rule against whole-frame motion from
sound); C4 the flow is a flow and the thickness moves with it (face divergence under
1e-3 of the fastest speed over the cell size; the falling patch keeps a local peak of at
least 45% of its excess after 5 s, where first-order upwind keeps 38% and a limited
second-order scheme 51%, and its mass stays within 0.3 to 1.7 of the start; and every
cell's change in a step lies in the interval its faces' flows could carry, the face
thickness taken anywhere between its two neighbours, so a smoothed film or a flow that is
reported but not used falls outside); C5 the colours move with the angle (the picture is
the table's colour for each thickness to 1.5/255, in 0..1, a film at 30° and 50° looks
like a thinner one straight on, `d cos θ_t`, an independently written Airy formula
agrees with the table to 1e-6, and `cosI = 1` is the table's own value); C6 the film
drains like a real one (quarter means grow top to bottom from 30 s on, the top reaches
true rupture first and by 120 s, a ruptured cell stays black); C7 it looks like the
photograph (a window of at least three samples in a row in which film under 30 nm is
between 0.5% and 6%, dark between 3% and 25%, saturated over 10% and at least 7 of the 12
hue sectors held; check C7 has no upper bound on saturation — `sat > 0.10` only — so it
would pass a film far more saturated than the photograph, such as main's 79% or the
ungraded 77%, for a check session to add that bar). Black is the film's thickness, never the picture's brightness. Against
a scratch prototype of the model above (not committed) it reads 23 of 23; with no
`src/lib/soapFilm.ts` it exits 1 and says so. A bar is never moved to get green: if the
model cannot reach one, the PR says what it reached and asks.

### ~~32a. The CPU reference~~ — **Shipped, #403** (`src/lib/soapFilm.ts`, `cosI` on `filmReflectance` in `src/lib/filmTable.ts`, `npm run soapfilm` wired into `checks.yml`'s `logic` part; `npm run soapfilm` 23/23, `npm run filmtable` 8/8, 600 steps on 32×64 in 0.69 s; story in `docs/plan-shipped.md` §32a)

### ~~32b. The reflected view~~ — **Shipped, this PR (#469)** (`soapFilmRgb` reflected view in `src/lib/soapFilm.ts` with Snell path factor `d_eff = h cos θ_t`, 4-point path spread `spread = 0.025`, dark ground `ground = 0.0004`, and colour grade `notchFloor = 0.0725`, `chromaRetention = 0.67` named under shortcut (f) in `PLAN.md` §32 and `src/lib/soapFilm.ts`; `npm run soapfilm` 23/23 with C7 saturation bar unchanged, `npm run filmtable` 8/8; control with the grade off (`notchFloor = 0`, `chromaRetention = 1`) is 77% saturated, 22.7% dark, 9/12 hues at t=120 s, and with the grade on is 13% saturated, 19.4% dark, 8/12 hues at t=120 s (14.8% saturated, 12/12 hues at t=110 s) against the photograph's 15% saturated and 9/12 hues; 3-angle render at 0°/30°/50° shows bands shift down by 13–18 rows while Newton-black lace stays at row 1.00–1.09; story in `docs/plan-shipped.md` §32b; replacing the grade with the real solid-angle integral and camera gamut mapping is 32b-1 below)

- **32b-1. Replace the colour grade with the soft box's solid-angle integral and camera gamut mapping.** In 32b, the 4-point path spread (`spread = 0.025`) and dark ground (`ground = 0.0004`) move C7's `t = 120` s saturation by two points (79% → 77%), while the colour grade (`notchFloor = 0.0725`, `chromaRetention = 0.67`) accounts for the rest of the drop from 77% to 13% against the photograph's 15%. Replace that grade with the real phenomenon: integrate the film's Airy reflectance over the soft box's solid angle as a quadrature in `cosI` with s and p Fresnel reflection terms at each angle and the thickness's phase `4π n d cos θ_t / λ` at each angle (which also retires the Fresnel half of shortcut (f)), then map the integrated CIE XYZ tristimulus into the camera's sRGB gamut instead of clamping negative linear channels to zero. *Measure:* the same saturation and hue numbers `npm run soapfilm` C7 prints, with the grade removed (`notchFloor = 0`, `chromaRetention = 1`), showing how much of the 77% → 15% saturation drop the solid-angle integral and camera gamut mapping recover. Also note that check C7 in `scripts/soapfilm.mjs` has no upper bound on saturation (`sat > 0.10` only, so it would pass a film far more saturated than the photograph, such as main's 79% or the ungraded 77%), for a check session to add that bar.

### ~~32c. The GPU solver~~ — **Shipped, this PR (#505)** (`src/gpu/soapFilm.ts` exporting `createSoapFilmGpu`, `src/gpu/wgsl/soapFilm.ts` with `soapSetup`, `soapSorRed`, `soapSorBlack`, `soapProject` and `soapTransport`, and `scripts/checks.json` wiring `npm run soapgpu` on the Mac `plate` shard beside `sloshgpu` and `npm run soapgpu -- --selftest` on Measure's `lab` shard beside `sloshgpu`; `npm run soapgpu` 29/29 on `apple metal-3` — first-step flows 0.195%, first-step thickness 1.116%, 1 s thickness 0.065% at `dt = 0.05` s, 0.022% at `dt = 1/60` s, 0.884% at `zeta = 0.25, dt = 0.2` s with 4 CFL sub-steps, C1 thick +29.41 vs +29.41 and thin −22.56 vs −22.55 rows, C2 drift 7.0e-9, C3 reversed −20.86 vs −20.85 rows, C4 max `|div u|` 1.8e-4 /s, C6 worst quarter mean 0.08%, top black at 115 s vs 115 s, torn hole 0 refilled and 160 vs 160 black cells, 0 of 4785 steps idle, 0 of 514 reads idle, `src/lib/soapFilm.ts` absent from bundle, `cost: 2.44 ms a step at 256 × 256 on apple metal-3`; `npm run soapgpu -- --selftest` 29/29; `npm run soapfilm` 23/23; `npm run wgsl` 142 shaders; `npm run physics` 20/20; `npm run derive` 4/4; story in `docs/plan-shipped.md` §32c)

- **32c-1. The drain's own "a ruptured cell stays black" never fires.** soapfilm.mjs C6 reads
  it on the drain, where measured, the reference with its rupture marks removed refills no cell
  either (thick film never presses on black there), so that line in `npm run soapfilm` would pass
  a solver with no marks. `soapgpu` asks it on a torn hole instead; soapfilm.mjs should get the
  same hole for the CPU reference (a check session; it moves an input, so `Check changes:`).
- **32c-2. `soapgpu -- --selftest` opens Chromium before checking `selftest`.** `scripts/soapgpu.mjs`
  calls `openLab` and `navigator.gpu.requestAdapter()` unconditionally, and `checks.yml` installs
  Chromium only on `Measure`'s `browser` and `lab` shards (`logic` has no Chromium), so
  `npm run soapgpu -- --selftest` sits in `Measure`'s `lab` shard beside `sloshgpu` until
  `soapgpu.mjs` steps the `--selftest` control in Node without a browser.

### 32d. On the plate

A "Soap Film" look: the film's reflected colour on a dark ground, a time-compression rate
(named shortcut b) and a viewing angle, all settings with MIDI and the desks, default off
so every existing preset looks as it did today (`setting-auditor`). The film hangs under
its own gravity only: the sound may brighten or push it by its fast readings (hits, bands,
onsets) but never move it as a whole (frameSway stays 0), and the preset's sound patch uses
no song shape. *Measure:* `panel`, `desk`, `lampzero`, a `look` render against the
photograph, and a new lab check that the setting at 0 is the plate to the bit.

### 32e. The phone

Every feature ships its phone version in the same PR as the feature: 32d's controls on the
phone and the iPad, the film on the wall through Send to wall. *Measure:* `phone`,
`draftwall`, `layout`.

*Not doing now:* a thickness that follows the dye (the film is its own medium; mixing it
with the pigment's opacity is 18k's old shortcut, and the reason for this section), Marangoni
plug flow (named above), and any recorded footage as a texture.

## 33. Bubbles and the closeup, per liquid (asked 2026-10-19)

The owner, 2026-10-19: bubbles still look pixelated around themselves and sometimes
draw as a donut; bubbles should answer the liquid they are in; and the closeup looks
like a sheet of biological cells, where what is wanted is the liquid on the plate,
nearer and in relief. The research behind the bubble items is item 2 of
`/mnt/project-files/drops/research/bubbles-and-drops.md` (§1.4–1.5, the projected
bubble), in the project's shared files. Pictures of the report's halo and donut, before
and after 33a, are in `/mnt/project-files/drops/bubbles-2026-10-19/`.

Every item keeps the standing rule: nothing moves the frame as a whole from sound, and
each feature ships its phone version in the same PR (the plate shader is shared, so the
phone and the iPad draw what the desk draws; a new control goes on the phone too).

### ~~33a. No stepped ring round a bubble's hole~~ — **Shipped, this PR** (a hue gate on the line between two dyes, `boundaryDiff` in `src/gpu/wgsl/plate.ts`; `npm run holeline`: the line moved 8.9–18.3 % of the ring round holes of 1.8–14 cells before, 0 % after, and still draws 52.8 % → 52.8 % and 61.1 % → 58.3 % of the band where two dyes meet; story in `docs/plan-shipped.md` §33a)

### ~~33b. The soft glow still left round a hole~~ — **Shipped, this PR** (`airNear` flattens the dye's normal beside an air hole, `src/gpu/wgsl/plate.ts`; `npm run holeline`: the dye 1–6 cells past a hole's rim was 6.0–11.0 levels from the dye 10 cells out before (4.2 at the smallest hole), 2.4–3.2 after, bar 6; Edge Relief moved the first 3 cells 11.9–22.9 levels before, 0.00–0.02 after, bar 1; a pool's edge relief into water kept 16.06 → 16.06; story in `docs/plan-shipped.md` §33b)

Left from it, so none of it is lost:
- **33b-2. A fixed reach and a wholesale flatten.** `airNear` looks 4.5 cells out and
  flattens the dye's whole normal there, so a real dye-to-dye step beside a bubble loses
  its relief inside that reach. Derive the reach from the Sobel and bicubic taps, and
  flatten only the air's own contribution (the slope of the density the air removed)
  once 33g's closeup changes how the relief is read.
  *Check:* `holeline` with two dyes meeting beside a hole: the step's relief at 4 cells
  from the rim at least 0.8 of its relief far from any hole.
- **33b-3. The smallest hole is only partly flattened.** At the hole of 1.8 cells the
  worst pixel in the ring is still 22 levels from the dye 10 cells out (the control's
  worst is the same 22, with the bubbles at 0), and Edge Relief still moves its first 3
  cells 4.6 levels (the control 5.5): `airNear`'s nine taps reach 4.5 cells out and
  find a hole that small only along a few directions, so the mask is patchy. Sample
  the air at the radius of the hole's own coverage (a blurred air mip), or take the
  taps from the Sobel's own footprint, and bring `holeline` to cover the 1.8-cell hole
  at the same bar (1 level) as the others; then find what draws the 22-level pixel.
- **33b-4. The lace and the boundary line at a hole** are not masked by `airNear`; 33c is
  the lace, and the boundary line is 33a's hue gate. Apply `airNear` there only if 33c's
  check finds a ring.
- For 33g (the closeup): the closeup is a different branch (`dropCam`); `airNear` applies
  to the shared normal so the closeup's dye beside a hole is flattened too. Check the
  closeup's meniscus on a bubble in `look` pictures before reshaping it.

### 33c. The lace reads the same lit difference (S)

`lacing()` (plate.ts) compares lit colours across taps 3 cells apart, the pattern that
drew 33a's ring, so a look with Lacing up likely rings every hole the same way
(inferred from the code, not rendered). Gate it the way 33a gated `boundaryDiff`.
*Check:* `holeline` runs its hole plate a second time with Lacing at 1: under 1 % of
the ring moved, and the lace on its own plate (`npm run lace`) unchanged.

### 33d. A bubble's edge at the screen's resolution (M)

Close up (zoom 3 to 5 in the lab) a bubble's outer edge is faceted: the band is drawn
from the air field, linear between texels, and its softness is clamped to 0.02–0.3 of
the curved band, so a small bubble's edge steps with the solver's cells, not the
screen's pixels. Reconstruct the edge's distance at sub-texel (bicubic of the air
field, or the bubble list's own circle where a bubble is still round) and antialias
it over one screen pixel at every zoom. Keep the air field's shape where a bubble is
deformed: a sheared bubble is not a circle.
*Check:* new `npm run bubbleedge` (lab): bubbles of 1.8 to 14 cells at zoom 1, 3 and 5,
the rim's radius found along 64 rays: RMS deviation from a circle under 0.5 screen
pixel, and the 10–90 % rise of the edge no wider than 1.5 pixels. Today's numbers
printed first.

### ~~33e. The bubble as the projector throws it, not a donut~~ — **Shipped, this PR** (the clear middle is the plate, `plate.ts`'s projected bubble; `npm run bubblelook`: the middle was 116–195 levels off the plate on the dark ground before, 0 after, and 0–21 on the lamp ground against a tenth-of-the-tint bar; story in `docs/plan-shipped.md` §33e)

Left from it, so none of it is lost:
- **33e-2. The band's width from the meniscus, for small bubbles too.** The old text
  here said the band is "a share of R"; that is wrong past R = half the gap (the big
  bubble's band is already half the gap, and `airlens` holds it there), so only a
  bubble under a few cells is mostly dark, and the dark share does fall as the bubble
  grows (`bubblelook`, 80 → 34 %). What is not done is the width against the liquid's
  index (u* from the cell's index), which waits on 33f's per-liquid index.
- **Shortcuts, named.** (a) The lens is not drawn minifying (focal length about
  −1.5 R): the middle is flat, which is the lamp through a slab of air and right for
  a pancake, and a little wrong for a bubble that is nearly a sphere. (b) The meniscus
  is a circular arc of radius gap/2 (a contact angle of zero). (c) One index per cell
  (33f). (d) The middle takes at most a tenth of the wetting film's tint (`0.1·k1`),
  a choice, not a measurement.
- **A bubble in clear water is drawn at 70 % of the strength of one in dye** (found
  here, not changed): the compositing weight is `bubbleStrength·mix(0.7, 1, filmT)` and
  `filmT` is the dye's alpha at the rim, so with no dye the band can never be darker
  than 30 % of the plate, and with Bubbles at 0.8 and dye it is 28 %, at 1 and dye 10 %.
  Whether the 0.7 is a choice to keep, or a bug (a hole in clear water should be as dark
  at its rim as one in dye), is for 33f's per-liquid pass to settle with a picture.

### 33f. Bubbles that know their liquid (M)

The bubbles' motion reads one plate-wide viscosity and surface tension
(`liquidMu`, `liquidSigma` in `src/lib/bubbles.ts`; 18i), and their drawing one
index. The species field (`src/lib/liquidProps.ts`, 18d) already carries each cell's
viscosity, density and index. Read them under each bubble:
- *Speed and film:* Ca = μU/σ from the cell's μ; Bretherton's speed-up
  1.5/(1 + 2.26 Ca^(2/3)) (18i) with that Ca, so a bubble in glycerine lags the
  flow and one in alcohol runs ahead of it.
- *Shape:* the Saffman–Taylor fingering and a sheared bubble's stretch from the same Ca.
- *Merging:* the film's drainage time ∝ (μ/σ)·R (18i) per cell, so bubbles in syrup
  sit touching far longer than in water.
- *Optics:* 33e's band from the cell's index (oil about 1.47, water 1.33, alcohol
  1.36, glycerine 1.47); in ferrofluid the liquid is opaque, so a bubble is a bright
  window in black and its band the meniscus's thinning; in a milky liquid the
  middle is the brightest thing on the plate.
- A surface-tension table per liquid (water 72, oils about 30, alcohol 22, soapy
  water about 30 mN/m) added to the bottle's behaviour, defaulting to today's
  `liquidSigma` so every look keeps its motion.
Shortcuts to name: one σ per liquid (no surfactant moving along the rim, no Marangoni
flow), and the wetting film's thickness not drawn as colour.
*Check:* `npm run bubblephysics` extended: one bubble pushed through water, oil and
glycerine: the speed ratios follow Bretherton's law within 10 %, the drainage times
follow μ/σ within 20 %, and (with 33e) the band width oil against water follows u*
within 15 %; on the plate's own liquid, every number today's check prints unchanged.

### ~~33g. The closeup: the liquid nearer and in relief, not cells~~ — **Shipped, this PR** (Paint Cells and Macro Lacing now default to 0, so no look draws cells it did not name; the relief is lit by a raking lamp with a rolled-off glint and a thinner boundary line, `src/gpu/wgsl/plate.ts`; `npm run macroview`: the cells' share of the frame was 0.14 at 4x and 0.17 at 6x before, 0 after, bar 0.01; the relief is 0.033–0.051 of the frame, 0.99 of it smooth, and the colour keeps within chroma distance 3.1 of the 1x frame, bar 5; story in `docs/plan-shipped.md` §33g; 20c-1 is closed by it)

- **33g-2. The closeup is still lit, not refracted.** The relief is the dye's own
  gradient read as a dome under a lowered lamp (shortcut: not a physical height field,
  the gap's thickness is not magnified), and the boundary line is thinned by 80 % at
  full closeup so it does not read as an outline. Not done from the first plan: the
  substrate seen through the surface's normal (refraction), a shallow depth of field
  and the dye's two layers parting in parallax. Each is a camera-pass term; take them
  one at a time with a `look` render, and keep `steadycam` green.
- **33g-3. Three looks keep their cells by name.** `macro-bead`, `cell-bloom` and
  `lace-run` set Paint Cells and Macro Lacing themselves, so they still draw cells at
  the closeup. The owner to say whether they should stay (they are named for them) or
  lose them too; `macroview` does not ask them.
- **33g-4. A Metal run: `macroview` done, the thin boundary line open.** The CI `open`
  shard (Metal) ran `macroview`: relief 0.0386 to 0.051, smoothness 0.988 to 0.991, the
  old-defaults control draws cells at 0.1397 and 0.1693 (smoothness 0.69, 0.716), chroma
  distance 1.21 to 3.11, half-turned crop least 9.25, 1x chroma least 7.62. These match
  SwiftShader's. `edgeK` (the thinner boundary line at the closeup) has no measuring
  line, so it stands unmeasured; a `look` render at zoom 4 and 6 is still optional.

## 34. What Photism showed: the page and the app (asked 2026-10-22)

*Asked 2026-10-22: the owner shared a phone screenshot of photism.app (an audio-reactive
visualizer sold at $29 once, as a DAW plugin, a standalone app and a browser version)
and asked what ChromaGlass should change on its page and in the app. The owner said to
put the findings into the plan. Everything below about Photism is from its own page
(fetched 2026-10-22); nothing was run or measured, and its claims are its own.*

**What Photism sells.** One promise in the headline ("Your music, made visible."), one
price button ("Get Photism · $29 once", "no subscription" under it), and a buy-on-the-phone
flow that emails the download link for the computer. A thumbnail grid of about twenty-five
scenes with a watch-with-sound clip; a VST3 and AU plugin that sits on the master bus,
plus a standalone app and a free browser version ("No download · No account"); automation
lanes that play a drawn look across a song; one-button MP4 with the track's audio in
it; Syphon (Mac) and Spout (Windows, beta) for Resolume, OBS, VDMX, MadMapper and
TouchDesigner; new scenes free for life. Proof is a count ("1,000+ users in 82 countries"),
testimonials, a note from its one maker, and a refunds link.

**Where ChromaGlass already stands.** The solver, the Perform and Design desks, MIDI
learn and clock, the phone remote, several projectors and Art-Net are things its page
does not list. Record and Render a Song (§6) already write MP4 with the sound. The DAW
bridge (13.7, with its automatable slots), Syphon (13.2) and NDI and Spout (13.3) are
planned and not built. Pouring a picture into the plate exists (`injectImage`), but a
dropped picture or 3D model driven by the music as its own look does not.

**What not to copy.** A user count before ours is real; a "download link emailed" flow,
because our free site asks for a login and needs its own reason to (saves your looks);
a grid of generic stock thumbnails: ours are the plate itself.

- **34a. A landing page before the sign-in wall.** *Shipped (2026-10-22), first version; the
  story is in `docs/plan-shipped.md` §34a, the owner's look is `docs/judging.md` §62.* A first
  visit meets `src/components/Landing.tsx` (its own lazy chunk, no Firebase, no engine) and
  "Play free" opens the sign-in over it; a returning visit, `?remote`, `?cast`, the iPhone app,
  a desktop launch and a visit part way through a redirect or an emailed link never see it.
  `npm run signin` holds it (3a, 3, 6, 7, 10, 11b).
- **34a-2. A filmed hero with its music, from a Mac.** *(S; owner's Mac. The owner, 2026-10-22: the
  video examples should be better, and should play with the music audibly.)* The hero is a cross-fade of five of
  the app's own frames, because a cloud session cannot film the app and the lab's plate barely
  moves in a hero's seconds. A 10 to 15 second loop of the real show (`npm run film` records
  through `scripts/recorder.mjs`), 1280 wide, under 1.5 MB as WebM and MP4, would replace it: the
  page then loads it after its first paint and keeps the stills for reduced motion. The loop is
  filmed with the track it was filmed to (the recorder takes the audio, and the show's own music in
  `public/music` is ours to use), and a browser will not start sound on its own: the video starts
  muted, and a "Sound on" button (and a tap on the video) unmutes it, with the sound off again when
  the visitor leaves for the sign-in. More than one clip (a ferrofluid, a dye pour, a close macro)
  would be the "video examples" row under the hero, each its own filmed look with its sound.
  *Measure:*
  the loop's first and last frames differ by less than a frame of motion; `npm run signin` 3a still
  true with the plate not up.
- **34a-3. Sharper looks in the grid.** *(S.)* The cards are 480 × 300 frames from the preset
  contact sheets (28i-1) and are soft where a Retina screen draws them at 2x. `pixels.yml` renders
  every look one to one at a laptop's size: take the eight from it and keep the file sizes under
  60 KB each.
- **34a-4. Buy buttons, when the Lemon Squeezy webhook is set (23).** *(S.)* The page prints the
  prices and says "Buying opens soon". When 23's webhook issues a key from a test purchase, the
  tier cards get Buy buttons (`CHECKOUT_HOME_URL`, `CHECKOUT_PRO_URL` in `lib/tierGates.ts`) and
  the "opens soon" line goes. Until a test purchase has been made, no button.
- **34a-5. The owner's words and the share card.** *The words shipped (2026-10-28, the owner's OK
  on a line-by-line draft; story in `docs/plan-shipped.md` §34a-5).* Open: `og-card.png` is still
  the old card; a new one would be the hero's frame with the name and the new headline. The maker
  note goes unsigned unless the owner says otherwise.
- **34b. A looks browser with live previews.** *(M.)* A grid of the presets playing
  (paused until hovered or tapped, as Photism's browser does), picked from before the
  desk is opened. Previews run the real shader at a small size and one at a time, so
  the frame budget (Wave 4) is not touched. Phone: the Looks sheet gets the same grid.
  Line 1211 above already asks for a still saved in each preset file; that is the
  cheap first step, and the live preview follows.
- **34c. An analyzer look.** *(M.)* Producers like to see the sound itself: spectrum,
  scope, spectrogram and a stereo goniometer, as a Mixer row (§11) over the plate or
  alone. Built from the same bands the plate already hears. Fast readings only (the
  owner's patch rule). Phone: the same row in the Mixer sheet.
- **34d. Chladni figures from the spectrum.** *(M; real physics.)* A thin plate driven
  at the song's strongest partials shows nodal lines where grains settle; it is the
  phenomenon behind the sand scene Photism lists. §18 tried the glass ringing in a Chladni
  mode and set it aside, so this is a separate look where the plate is the vibrating
  plate, not a ripple on the liquid. Needs a look and a check that the figure matches the
  analytic mode for a held tone (the script to be named in the PR).
- **34e. A drawn automation lane per setting.** *(M–L.)* Photism lets a user draw a
  curve for a setting and play it with the song. §13's DAW bridge covers a DAW's own
  lanes, and the sequencer (§10) covers cues; neither lets a user draw a curve on the
  site. A lane on a song's timeline, bound to a setting by the same learn flow as MIDI
  (§5), saved with the song map. Phone: lanes are read and switched there, drawn on
  the desk. Waits on the sequencer's cue model; no default look changes.
- **34f. One-button share export.** *(S.)* §6's Render and Record make the file; the
  gap is a single "Save a clip with sound" on the desk and the phone that picks the
  container and size itself, with the small mark on the free site (§23). First the 3-minute
  1080p render in §6 has to be measured on a Mac. A portrait frame (9:16, for Reels and
  TikTok) beside landscape, as VS 2's recorder offers (§30, 2026-10-24): the plate
  rendered at that aspect, not a crop of the landscape frame.
- **34g. Legible reactions, named on the page.** *(S, copy.)* Kicks that stir the dye,
  a hit that seeds a bubble: these already exist in the sound patches (§28i-3). Name each
  look's reaction on its card in 34a and 34b ("kicks stir the ink") so a viewer sees that
  the picture is listening.
- **34h. A dropped picture or 3D model as a look.** *(L; check first.)* Photism's
  Limitless warps the user's own picture or a dragged-in 3D model with the music.
  `injectImage` pours a picture as dye, which is not the same. Find whether a picture
  source exists as a Mixer row (§11) before adding one; the logo-on-the-wall item in
  §23 would use it too. A 3D model is a later step, not part of the first piece.
- **34i. The DAW bridge, Syphon and NDI stay on the order they hold.** 13.7, 13.2 and 13.3
  are what a producer and a VJ pay for, and Photism has both. No change in scope, but
  13.7 is the one a music-maker audience (Home's buyers) asks for first: when the signed
  Mac app (13.1-sign) is out, take 13.7 before 13.3.

**Order.** 34a first (it needs no engine work and the site is the demo), then 34f and 34g
(small), then 34b and 34c; 34d, 34e and 34h are for when the planned VJ and DAW steps
have shipped. Not started.

## 35. Clear controls: on reads on, one name for one thing (asked 2026-10-24)

*Asked 2026-10-24, the Video panel open with a loop playing: "I really can't tell what
buttons are turned on/off ... I can't tell what state things are in." Then: "there are
multiple buttons called video!" The owner likes the modular panels (dock, float, fold)
and wants them kept as they are: what changes is how state is drawn, what things are
called, and later where they go. The audit behind this (heuristics from Nielsen Norman's
visibility of system status and consistency, WCAG 1.4.11's 3:1 for a state's cue, every
desk panel, phone sheet, the remote and Draw) is in the project's shared files.*

- ~~**35a** One look for on, every name unique (phase 1).~~ Shipped: the lit token, `Button
  pressed`, the Film section's Source and demo loops, the renames, `npm run states` and the
  3:1 bar in `npm run switches`. Story in `docs/plan-shipped.md` §35.
- **35a-2** What phase 1 left, each because it moves a check's input or a layout:
  - Sliders standing in for switches: the phone's Press · thin gap and Two Projectors
    (`phone.mjs` drives the first as a range by keyboard), the remote's three (788, 822,
    848 as of 4397c83), Settings' Auto Spin and Spin Direction (stepped sliders with three
    named stops, which want a Segmented that keeps MIDI learn and the pins).
  - Touch targets under 44 px: the Play handle, the remote's layer dots, tool chips, dye
    swatches and cue strip, LaptopLink's button, Settings' rail on a phone, `Toggle`'s
    36 px row and `PanelFrame`'s 24 px icons.
  - The remote's two Blackouts share the test id `remote-blackout` (one per layout).
  - The phone dock's Motion dot stands for two states (Evolve or Tilt) at once.
  - Groups dimmed to 50% while their parent is off (the phone's Show, Evolve and Spin
    rows): legible, but a third way of saying off; make them `disabled` with the reason.
  - "All settings…" twice on the desk (DeskPanels' rides and recipe) beside "+ Panel".
  - "Sound" in the layout switch next to the Sound dot that opens the same panel.
  - The hand-built pick-one grids in Settings (On a New Song, Render Style, Film Stock,
    folds, Second Screen, Viscosity) are lit and stated now; the shared `Segmented` would
    draw them once, once it takes a title per option and a number id.
- ~~**35b** Regroup the panels into seven.~~ Shipped: Play, Pour, Feed, Motion, Chemistry, Look,
  Stage, one vocabulary for the rail, the panel browser, the sections' `data-group`, the desk's own
  panels and the phone's Settings strip (now with its headings drawn). Story in
  `docs/plan-shipped.md` §35.
- **35b-2** What regrouping showed, none of it moved in 35b because each is a change inside a
  section (35c's work) or a different surface:
  - ~~Plates & LED holds the platform's spin, which is Motion's.~~ Moved to Plate Spin in 35c-2.
  - The pin picker (`PickList`) and the command palette still list by section, not by the seven
    groups; the same headings would find a setting faster there.
- ~~**35c-1** Squish Plate in five.~~ Shipped: Squish Plate (the glass: pressure, shape, depth drag,
  Thin Gap and Thickness, Press Lift, smear, rain, viscosity), Oil & Soap, Ferrofluid and Reactions
  (Chemistry), Tilt & Rock (Motion); Swirl, Dye Weight and Heat Spread went to Fluid Physics, Layer
  Depth and Spectral Mix to Lamp & Light, and the Turing pattern and its print from Lamp & Light to
  Reactions. The registry files each pin under the section that draws it (the desk's Fluid Physics
  panel had been the glass's, the oil's and the magnet's forty knobs), held by `panel`. Story in
  `docs/plan-shipped.md` §35.
- **35c-2** One home per setting, second half. Shipped: **Flash Limit** has one switch, in Master
  (Wall → Output draws a state line and no switch); each **Impact** master sits under the Drive of
  its source (Room, Film, Sound), Shapes Impact alone staying at the bay; the platform's spin is a
  **Plate Spin** section of its own in Motion (it was the first half of Plates & LED, which Stage's
  gate keeps out of Build and Gig); Build's deck takes Squish Plate beside Fluid Physics; the
  sequencer in Songs is a button; the track panel's Takes is a pointer to the Record panel (its
  own Start a take and replay list were a second copy). Blackout was checked and is already one
  per surface (the desk header on a desk, Settings' Master only where there is no desk; the
  remote's two share a test id because there is one per layout). The unused
  `desk/PerformanceButton.tsx` was already gone (`record` asserts it). Story in
  `docs/plan-shipped.md` §35.
- **35c-3** One home for **MIDI on** and the **audio source**. Shipped: the Controller section of
  Settings is the one place MIDI is turned on, its ports (in, and now the LEDs out) chosen, a
  factory map loaded and a controller auto-mapped; the MIDI sheet is the teaching surface and says
  the state (`midi-state`) with a **Set up…** button into the section. The Sound sheet is the one
  place the source is chosen (six tiles, with the plate as an instrument); Settings' Sound row is a
  state line (`audio-source-state`) and **Change in Sound…**, the device picker staying beside it.
  The phone already had one home for each (its Sound sheet; Web MIDI is not on iOS). Story in
  `docs/plan-shipped.md` §35. Left from it:
  - The Sound sheet's microphone picker (`sound-input-picker`) and Settings' Input
    (`audio-input`) are still two pickers for the one device; the dot lands on Settings'.
  - 35b-2's pin picker and command palette still list by section, not by the seven groups.

- **35c-2** One home per setting, what is left of phase 3: Flash Limit (Settings' Master and the
  Wall), Blackout, MIDI on (Settings and Controller) and the audio source (Settings and Sound)
  each appear in two places, with record and replay, and the unused `desk/PerformanceButton.tsx`;
  Drive/Impact pairs sit in different sections (one Strength per input); the platform's spin in
  Plates & LED is Motion's but Stage-gated; the sequencer is behind a 10 px, 40%-opacity link in
  Songs; the Build layout's deck lists Fluid Physics, which used to be the glass's knobs, so it
  could take Squish Plate beside it. After 35c-1.
- ~~**35d** Colour and keys (batch A of the owner's playful-controls choice, 2026-10-25).~~ Shipped: a knob's
  cap, the tick in a panel's header, the dot on a rail heading and the phone's touch thumb wear their group's
  colour (the seven in `index.css`; a setting's group is its section's, `groupOfSetting`); the tools are
  keycaps on the desk and pictograms on the phone's dock (`ToolGlyph`); a snail and a hare mark the ends of
  Master Speed, Evolve Speed, Gel Speed, Chase Speed and Kaleido Spin wherever they are drawn as a knob or a
  slider (`PACE_KEYS`, `PaceTrack`). Judging §77. Story in `docs/plan-shipped.md` §35.
- ~~**35e** Liquid in the controls (batch B of the playful-controls choice, 2026-10-25).~~ Shipped: the
  bottle in hand on the desk and the phone leans forward and stands filled to what is left of the Dye
  Budget (`dyeRoom`, `dyeRoomOf`), the others standing full; the Viscosity buttons each let a drop go at
  the pace of the carrier's viscosity (`dripFallSeconds`, 20 to 1); Lamp Warmth has a bulb whose filament
  is the blackbody colour at the temperature its grade matches, written in kelvin (`lampKelvin.ts`,
  6500 K at 0 down to 5100 K at 1). Held by `npm run panel`. Judging §78. Story in `docs/plan-shipped.md` §35.
- ~~**35e-2** The lamp's grade tops out at 5100 K.~~ Shipped (2026-10-25): Lamp Warmth reaches a quartz-halogen
  projector's 3200 K. The slider is a temperature, even in mireds, and the plate multiplies by the blackbody's
  own colour at it (`lampTint`, Planck and the CIE fit, worked out once on the CPU and handed in as
  `lampTintR/G/B`), not a tint mixed in by the slider. It runs 0 to 3.75, and 0 to 1 is still 6500 K to 5100 K
  (the new tint is the old grade to 1.5% a channel there), so saved looks, the presets and Lucky keep their
  colour with no migration. The vignette is unchanged (full from 1 on). Held by `npm run panel`. Story in
  `docs/plan-shipped.md` §35; judging §80.
- ~~**35e-4** Home Movie's lamp, and the warm end's brightness.~~ Shipped (2026-10-27, the owner left both to the
  session): Home Movie sits at Lamp Warmth 3, 3560 K, and the warm end holds its brightness. A Super 8 projector's
  lamp is a 3200 to 3400 K halogen, the lamp the film was balanced to be shown by; 3 and not the 3.75 end because the
  tint is the full blackbody ratio, which a camera records and a room-adapted eye sees less of (35e-3), so the end
  would over-state the orange. Brightness: colour temperature does not set output (a projector's halogen is as bright
  as it was built to be, and the lens throws no less light for the lamp being amber); a lamp run cool on a dimmer does
  lose light, steeply, about the eighth power of its temperature near 3000 K (flux as V^3.4, temperature as V^0.42),
  but that is Exposure's knob, not the colour's. So `lampTint` keeps the luminance it has at 1 for 1 to 3.75 and 0 to 1
  is untouched. Cost, named: the red channel rises to 1.48 at 3200 K (1.36 at 3560 K), so a pigment already at full
  red clips on a multiply of the finished picture, which the six-band lamp spectrum (35e-3) would handle properly.
  Held by `npm run panel`; judging §84.
- **35e-3** What the readings left, none changed because each moves a look or waits on another step:
  - **The lamp's colour is a multiply on the finished picture,** which is the lamp's spectrum times a white
    surface exactly, and the lamp's spectrum times a dye only to the eye's three responses. The real thing is the
    Planck spectrum entering `spectralThrough`'s six bands before the eye sums them, so a deep blue dye under
    3200 K goes darker and more violet than a multiplied blue does (it already goes to a near black in the
    lab picture). Named shortcut; replace it. (The warm end's brightness is settled: see 35e-4.) Two more shortcuts: the neutral is the 6500 K blackbody, not D65 (sRGB's white,
    which sits a little off the blackbody curve), so the figure is approximate; and the full blackbody ratio is
    what a camera or film balanced for daylight records, where an eye in the room would partly adapt to the warm
    light and see less orange.
  - **Velvet Underground (0.25) keeps its colour** to under 2% in blue, because its number kept its meaning. Lucky
    still draws 0 to 0.8, so it never reaches the halogen. (Home Movie moved: 35e-4.)
  - **Evolve wanders Lamp Warmth by a fifth of its travel,** which is now a fifth of 3.75: from a look at 0.25 up
    to 1, from a look at 3 over the whole warm end. Pull it in (a per-dial span) if that reads as too much.
  - **The viscosity drip is slow motion at one factor.** The ratio between thin and thick is the
    physics (Stokes's terminal speed, the solver's 1 and 20 mm²/s); the thread behind a thick drop is
    drawn stretching at the drop's speed, not solved, and a real thread at this viscosity pinches off in
    microseconds. Named shortcut.
  - **One tank, one bottle.** The Dye Budget is a number for the whole plate and each layer, so the
    bottle in hand shows it and the rest stand full; a per-liquid supply (a bottle that empties and is
    refilled) waits for the volume model (18c-2).
  - The legacy bench's bottle list in `App.tsx` (the `liquid-…` test ids) still draws round swatches.
  - The remote has no bottles or bulb (the owner's remote has Dye Budget and Lamp Warmth as sliders).
- ~~**35f** Show hardware (batch C of the playful-controls choice, 2026-10-25; items 7 to 11).~~ Shipped: Record
  is two tape reels turning at the tape's speed over their radius, the full one slow and the bare one fast
  (`tapeReels.ts`: a compact cassette's 4.76 cm/s, hub 0.9 cm, pack 2.1 cm; angle by closed form, so the
  button holds no clock of its own) on the desk button, the phone's Play pill (a fixed box, so it does not widen,
  and red while it runs) and the More tile; Tap Tempo is a pad with a beat light on the locked beat, four pips
  and the tempo in segment digits (`TapPad`; the light runs on the Web Animations clock from the source's period
  and phase, so the App never re-renders for a beat), on the desk's Tempo row and the phone's Sound sheet; the
  Sound sheet on both has a VU needle with a moving coil's ballistics, 99% of a steady tone in 300 ms and a
  1.3% overshoot, falling to its stop and writing "deaf" on the dial when the input stops (`vuMeter.ts`, moved
  through a ref on its own frame); Blackout is a lens with a red cap on it, one drawing on the desk header,
  Settings, the remote and Draw, and the remote's two Blackouts are one (the bar under the thumb); Auto Spin has
  a strobe ring that drifts at the dish's speed in Rate and stands still in Tempo once a tempo is heard
  (`strobeRing.ts`). Held by `npm run panel`. Judging §81. Story in `docs/plan-shipped.md` §35.
- ~~**35g** Looks as slides in a tray (item 12 of the playful-controls choice, 2026-10-25).~~ Shipped: a look is a
  35 mm slide at a real mount's proportions with its own palette on the film, on the set list, the cue bar, the
  preset menu, the saved list and the phone's look button, Looks sheet and Looks strip (now flicked one slide at
  a time); a round tray clicks one slot when the look on stage changes (`slideTray.ts`, `SlideMount`,
  `SlideTray`). Held by `npm run panel`. Judging §82. Story in `docs/plan-shipped.md` §35.
- **35g-2** What the tray left:
  - **The drum has 10 slots, a real tray has 80.** At 28 px 80 slots is a grey ring, so one click turns the
    drawing 36 degrees, not 4.5. Named shortcut of the picture; nothing about any look.
  - **The tray does not know about the phone's cue.** It clicks when the stage's look changes (the tray is
    the stage, not the cue); a cued look on the desk shows only its mount behind the arrow.
  - **The remote and the Sequencer's stage list still show flat swatches** (`RemoteControl`, `SequencerPanel`,
    the command palette and Add to Set sheet); the film could go there too.
  - **The film is two colours.** The mount shows the first two palette colours of a look's contract, as the
    cue rows always did, not a render of the look; a photograph of each look (the gallery's) would be a
    truer slide.
- **35f-2** What batch C left:
  - **The VU reads the plate's volume, not decibels.** The dial is marked 0 to 100 in the plate's own volume
    unit (the loud end of the ear's range at 85, `soundLevels.ts`), because that is what the ear gives and the
    gain stages before it are not the app's to know. A dial in dBFS would need the analyser's raw peak.
  - **A take is not a tape with an end.** The reels fill in ten minutes (`TAPE_SECONDS`) and a longer take
    leaves the right reel full and still turning at v / r. Named shortcut of the picture, not of any recording.
  - **The ring stands still only up to 32 beats a turn.** Past that it has too few dots for the dish's turn
    between two beats and creeps at the alias (48 beats at 120 bpm: 7.5 degrees a second back).
  - **The mic-heard tempo lights the ring but not the tap pad's beat light.** The pad polls the tempo source
    (tap, MIDI clock, typed), which a heard beat does not set; the ring takes the beat grid's tempo when
    nothing was tapped. Lighting the pad from the grid is a follow-up if the owner wants it.
  - The remote's Record, Auto Spin and tempo are still plain buttons and sliders (35d-2's remote list grows
    by these), and the Settings Source row has no meter (the needle is in the Sound sheet).
- **35d-2** What batch A left: the remote's own sliders (Speed and Evolve Speed in `RemoteControl.tsx`) have
  no snail and hare, and the remote has no group colours; the phone's Settings sheet takes the cap colours
  only on its rail headings, since its sliders are the white-thumbed `set-range`; Kaleido Spin on a knob has
  its hare at both ends but no snail at the stop in the middle (the slider has one under the track). Batches B
  (liquid in the controls) and C (show hardware) have shipped (35e, 35f), and item 12 (35g), the last.
## 36. What the analog operators could not do (researched 2026-10-27)

Asked 2026-10-27: what the analog liquid light shows could not do, and what the people
who ran them wished they could. The research, in the operators' own words with a source
for each quote, is the owner's page "Limits of the Wet Show" (its notes are in the
project's shared files, `research/light-show/analog-limits.md`; the craft itself is in
`craft-and-field.md` beside it). Of 22 pains and wishes it found, ChromaGlass already
answers 12 (the heat that cracks glass, dishes that go muddy or dry, half a ton of gear,
seven-operator crews, five-hour nights alone, nothing left on film), answers 7 in part,
misses 2, and 1 (fog machines) is outside any app. The owner asked for all eight items
below to be in the plan. 36a–36d are new; 36e–36h are open items elsewhere that the
research says to move up, with the evidence, and each of those keeps its own number.

What a fix must not take away, from the same operators: the plate's own surprises ("For
me perfection equals a kind of death", Joshua White), no visible pixels, above all on
people ("no one's body looks good with pixels on it", Drippy Eye), and the hand, not a
button, making it look good. Every item here is held to those.

- **36a. A lit-stage grade** (*proposed*, M). *The pain:* analog light "is not bright, and
  it's hard for that light to live in a modern stage environment" (Mad Alchemy); one
  operator pre-records when there is "too much competition from bright stage lights"
  (Liquid Lights Bend). A video projector has the lumens, but every look is graded for a
  dark room: under a stage wash the projector's black lifts to grey, and the looks that
  lean on near-black scenes (the swells and darkness of §10) turn to a grey haze. *The
  feature:* a **Lit stage** amount in Settings → Wall (load-in, never saved into a look):
  as it rises, the dyes thicken and saturate and the bodies hold larger, so a look keeps
  its contrast on a lifted floor instead of performing black the room cannot show. A
  real projector's black under ambient light is light added to every pixel, so the
  check models it that way. *Measure:* each look rendered in the lab over a raised black
  floor (0, 5, 10 % of white added), its contrast between dye bodies and field held at 10 %
  to within a set fraction of its dark-room value with the grade on, and byte for byte
  unchanged at 0. Phone: the same amount in the phone's Wall sheet.
  *Check written first* (2026-10-27): `npm run litstage`, the contract the build is held
  to (its header). The floor is light added in light and read in CIELAB against the
  room's white; the contrast is each body pixel's ΔE from the field behind it (the same
  look over the plate with no dye). Bars from what the floor leaves of white on black:
  two-thirds at 10% (amount 1), three-quarters at 5% (amount 0.5); with nothing done the
  looks keep 47-76% at 10%, 26 of 33 under the bar. Also: thin dye still seen (95%), hues
  kept (ΔH under 10, chroma no less than the floor leaves), at 0 byte for byte the lab with
  the grade's marked lines taken out, the app's plate view fed from the Wall, and the
  field left as it is (b9: the plate with no dye moves by under 1 ΔE on average with Lit
  stage on; a first sketch that lifted the finished picture moved Velvet Underground's
  black by 55 and bought its contrast there). The amount is `OutputConfig.litStage` and
  `PlateView.litStage`. CI runs `-- --controls` (6 lines, Measure's `browser` part) until the build drops
  the flag in `scripts/checks.json`. A reference sketch that grades only the dye where it
  is decoded passes 14 of the 15 lines (all but the Wall panel's control) and fails its
  mutants; it is in the project's files (`lit-stage-36a/`). The build is Antigravity's,
  from a brief written with the check.
  - **36a-1.** ~~Measure's `lab` part is at its time limit~~ *shipped* by 19k-6 (#517), which
    split it into `lab` and `lab2` the same hour. The lit-stage controls stay in `browser`.
- **36b. Span the wall** (*proposed*, L, the Mac app). *The pain:* "The light show, as
  originally performed had no effect on large audiences" (Joshua White); "there wasn't any
  money to rent the extra projectors I knew I'd need to make a difference in that big
  hall" (Bill Ham); one operator built "a full 360-degree panorama with six projectors"
  (Liquid Lights Bend). Today a show goes to one output: Two Projectors (18b-10) is two
  lamps on one screen and §16 is two plates, and nothing in this plan blends projectors
  edge to edge. *The feature:* several outputs from the Mac app, each with its own corner
  pin and masks (the Wall's), soft-edge blending where neighbours overlap (a gamma-correct
  ramp, so the overlap is not brighter), and one plate laid across all of them, up to a
  closed ring. Read §16's open 16d and 16e first; this may belong there. *Measure:* a
  two- and three-output render whose summed light across each overlap stays within a
  few percent of the light beside it.
- **36c. A practice plate** (*proposed*, M). *The pain:* "It requires practice, speed and
  precision changing between effects live" (Heavy Light); "We struggled along for years
  and we didn't figure out the chemistry … No one wanted to tell you how any of this stuff
  was done" (Mad Alchemy). `docs/guide.md` explains every control, but nothing in the app
  teaches the strokes, and no item in this plan does. *The feature:* a short guided set,
  on the plate itself and against a song, that teaches the squash, the lift, the tilt,
  the blow and the drop one at a time, each step done when the performer has made it
  happen. Desk, iPad pad and phone alike. *Measure:* a harness that plays each step's
  stroke and sees the step advance, and a step that cannot be passed without it.
- **36d. Show the hands** (*proposed*, M). *The pain:* a lighter digital rig is "not as
  fun for the audience to watch as the analog set up" (Heavy Light); of the Joshua Light
  Show today, "part of the appeal is getting a chance to see the mechanics of how White
  and team mix oils and colors in real time" (Time Out New York). A laptop on a table
  looks like someone reading email. *The feature:* an optional audience-facing view of
  the performance: the iPad pad drawn as a lit glass table with the touches and pours as
  they happen, as a Mixer row or a corner of the wall or a second output, or a camera on
  the performer through the film projector's live camera. Pairs with the hardware idea
  of a touch table in a case. *Measure:* a pad stroke appears in the view on the same
  frame it reaches the plate.
- **36e. Heat the performer rides** (moves up the Running order's step 6, roadmap S2).
  *The evidence:* heat was both the hazard and the instrument: "the heat was hard to
  control, glass cracked" (Ultramarine), and a Danish crew turned it into a stroke: "we
  deliberately blocked the air stream when we needed heat to propagate bubbles"
  (Tezcatlipoca). Step 6 is blocked on heat having a strength; the research says to
  unblock it as a performer's control: a Heat dial and a pad gesture, the lamp feeding
  heat where it is hottest, buoyant convection and a nucleation threshold boiling vapour
  bubbles while it is held and calming when released. Not a bubble sprite.
  - **36e-1. The model and its check, on the CPU (shipped).** `src/lib/lampBoil.ts` is the
    reference the GPU build is held to, and `npm run boil` (38 lines, node only, about 45 s)
    is its judge, the way 32a's soap film came before 32c. The roadmap's blocker for S2 ("heat
    has no strength, every source saturates the buoyancy tanh") no longer holds: #352 took
    the tanh out. What the GPU still lacks is heat in kelvin and watts (its `vel.z` has no
    unit, and `currentForces` still caps it at `clamp(temp, 0, 50)` and the current at
    `maxCurrent`), a dish whose glass and liquid set how fast it warms, and any boiling. The
    model, per square metre in SI units: the lamp's hot spot times the Heat dial (how much
    of the heat filter is out) in two bands, the visible share the dye absorbs and the
    infrared the water absorbs through its depth; one temperature through the liquid and
    both glasses (Biot about 0.1), conducting sideways, cooled by the fan's air at h = 50
    W/m²K or by natural convection at 10 under a hand that blocks it (the Danish crew's
    stroke), and by the glass faces' radiation (about 15 W/m²K at 100 °C), held at the
    room's at the open rim, the liquid carrying its own share of the heat when it flows; a
    Hele-Shaw flow driven by water's real density (Kell) and viscosity (Vogel), with
    buoyancy only in the plate's plane (zero on a level plate, as 18f gates it), and volume
    sources for warming water's expansion and for vapour; and boiling from sites at a
    density on the glass, each cell starting at its largest cavity's equilibrium-nucleus
    superheat (2σT_sat/(ρ_v·L·r), 4 to 12 K), a nucleus as wide as the gap, then heat
    exchanged at the bubble's rim both ways, so held heat boils and let-go heat condenses.
    *Measured* (`npm run boil`): the first step's warming matches the two bands ÷ heat
    capacity to 1.5e-8 and the dial is linear (dark dye at absorbance 1.5 warms 1.41× clear
    water); cooling by air and radiation at both h to 0.5%; a warm bump spreads as the heat
    equation within 0.6%, and the dish's hottest point after five minutes of lamp is a
    radial heat balance's (with radiation) to 0.01 K; a 70 °C patch on an upright plate rises
    at the exact Darcy inclusion speed within 1.6% (40 °C within 0.6%; the two 4.11× apart
    against an exact 4.07×), and on a level plate does not move; what leaves the rim over
    five minutes of warming is the water's growth by Kell within 0.5%; the dish's heat
    over each boil and its calm is a ledger of the lamp, the air, the radiation and the rim
    within 0.4% and 1.0% of the lamp's heat; the sites' share is the density's and their
    superheats the nucleus's over the whole distribution (KS 0.027 against 0.056); at 98%
    of each site's superheat nothing boils and at 102% every site does; a bubble's rim
    boils and condenses at its stated exchange to 1e-3; a dish the lamp and fan warm to
    93.8 °C never boils in five minutes, boils 28 s after a hand blocks the air off the
    lamp's centre, only under the hand, held under 103 °C there, and the vapour is under 1%
    of its peak 0.6 s after the hand lifts (0.3 s after the dial goes to 0 on a hotter
    lamp). Twenty-two look-alikes (each the reference with one thing changed, `scratch/` in
    the build session; four from the check-skeptic's pass and five from the review's) each
    fail at least one line but one: the old saturated buoyancy 2, a constant expansion
    slope 3, a constant viscosity 3, buoyancy on a level plate 15, no nucleation threshold
    3, a bubble on a timer 7, no condensation 5, no latent heat 7, no vapour volume 3, no
    expansion 2, a uniform lamp 5, the dye ignored 2, a hand that adds heat instead of
    blocking the air 6, no sideways conduction 4, every cavity the median one 1, a bubble
    rim a fifth as strong 2, vapour absorbing as liquid 5, no radiation 10, the dye taking
    the infrared at its visible absorbance 7, the glass flowing with the liquid 2, heat
    carried in conservative form 8. The one that passes throws away the heat of a cell that
    has boiled dry: here a dried cell takes no lamp (its liquid and dye are gone, and the
    glass absorbs none, 36e-4), so that branch carries little: the review measured it at
    19 J of the 1127 J the lamp gave (1.7%), moving the ledger 0.16%, under its 3% bar
    (this line first said 0.03%, too low). It becomes material once the glass absorbs the
    infrared (36e-4), and that build adds a tighter dry-out ledger line. `boilgpu`'s
    boiling second (36e-2) already fails it, by 13% and 16% of the reference's change.
  - **36e-2. The GPU build** (*open*, Antigravity's brief in the project's shared files).
    The model as passes on the plate's grid: the temperature in kelvin, the lamp in watts,
    the Heat dial, the hand's held air, the threshold and the vapour as a field the bubbles'
    shading reads (H6's air), the volume sources in the thin gap's projection (as 18c-1's
    pours), and the `clamp(temp, 0, 50)` and the current's cap out of the heat's way. The
    phone gets the dial and the gesture in the same PR.
    *Its check is written* (2026-10-27), red on main until the build, as `soapgpu` was
    before 32c: `npm run boilgpu` (scripts/boilgpu.mjs, its dishes in
    scripts/boilgpu-scenes.ts) asks the solver `src/gpu/lampBoil.ts`, in the contract
    written in scripts/boilgpu-cpu.ts, for boil.mjs's lines on its own fields with boil.mjs's
    bars, five moved to what float32 can read (each says why: H1 and H2 over 10 ms, the
    dye's ratio 1e-2, the rim's heat over 1 ms at ±10 K, a site 1e-4 K over its superheat,
    the volume's divergence 1e-3), plus a nucleus alone (gap-wide, paying its latent heat);
    and holds its fields to the reference, stepped beside it in node, cell by cell: the
    lamp's first step and second, a warm patch's upright second, a steam pocket's, a boiling
    second with no sites, the dish after five minutes, and the hand's boil's start, cell,
    peak and size at the lift. Every step must submit GPU work, every read map a buffer, and
    the solver may not carry the reference. The control (`-- --selftest`, Measure's lab2
    part) reads 54 of 54. Of ten look-alikes of the reference, the dry-out discard, a
    first-order carry and an explicit rim pass boil.mjs and fail here on the model's lines;
    a nucleus with no latent heat and one a tenth of a cell pass everything else and fail
    the nucleus lines; a shortened pressure solve, a weaker rim, a non-conservative steam
    carry and no vapour volume fail both. One passes: dropping the heat of a bubble's last
    vapour when it vanishes (under a hundredth of a nucleus, about 0.05 mK), named in 36e-4.
    `npm run boilgpu` itself joins the Mac's plate shard with the build, which prints its
    cost a step at 768².
  - **36e-3. One pocket, not many bubbles, on a level dish** (*open*, found building 36e-1).
    On the check's dish the first site's bubble grows across the superheated hot spot (its
    rim moves at about h_i·ΔT/(ρ_v·L), 4 cm/s) before the next site warms to its threshold,
    so the boil is one pocket that settles to a steady size, not separate bubbles that
    pulse. Real dishes have more sites (10⁵–10⁷ per m²) and dissolved air that comes out
    first; and a level dish's bubbles cannot leave. Measure what site density and spread
    give separate bubbles before the GPU look is judged, and give the vapour its own slip
    (18i's Bretherton speed) so an upright slide's bubbles rise through the liquid.
  - **36e-4. The shortcuts the model names** (*open*): the gap's vertical cells (Rayleigh–
    Bénard past Ra ≈ 1708, the Hadley shear on a level plate) and the Marangoni stress from
    hot to cold, neither in the depth average (with 18f-2); the bubble's heat taken only at
    its rim, not through the microlayer under it against the glass, and that rim as one
    bubble per cell (its area 2√(πα)·d/dx, so the boil's pace depends on the grid: the
    review measured n = 96 against 48 before the sites became a density, and 36e-2 must
    measure it again at the plate's grid); the glass absorbing none of the lamp (a dried
    spot should still heat, past 2.7 µm); T_sat fixed at 100 °C (no Laplace pressure, no
    dissolved air); one broadband infrared coefficient and one visible share; a nucleus
    born whole in one step; the heat of a bubble's last vapour (under 1% of a nucleus)
    given back when it vanishes, which no check can read in float32 and a solver could
    drop unseen; and an upright dish warmer than its reservoir turns over
    through the open rim (a slide is closed at its edges; S1 wants a closed rim).
- **36f. Two performers, a plate each** (moves up 14m-guest). *The evidence:* "Without
  her there to smooth transitions things would come to a halt, visually" (Heavy Light);
  Glenn McKay's crew described it as "painting with three or four hands". Build the guest
  key, and give each performer a plate of their own on the desk, so two people play one
  show without fighting over one dial.
- **36g. The room's lights follow the wall** (moves up 14q). *The evidence:* the old
  shows fought the band's own lighting: "Their lighting man wanted his toy strobe to be
  seen and kept telling us to get that crap off the screen" (Joshua White); "the bigger
  bands were carrying their own lights" (Ultramarine). Lights that fade with the wall
  turn the rival rig into part of the show.
- **36h. Layers at their own speeds** (moves up the Running order's step 7, roadmap Stage
  4). *The evidence:* Drippy Eye's dream rig "would consist of five slide projectors
  doing their own thing … we will do it someday". Today two plates at most (§16).

## Business Plan: The PRO Desktop App
Chroma Glass operates on a dual-tier business model to capture both casual users and professional touring VJs.
* **LITE / Web (Free):** The browser-based version remains free and accessible. It functions as an interactive toy and an educational tool for students, hobbyists, and casual users.
* **PRO Desktop App ($200+ Paid):** The native desktop wrapper (Electron) will be sold as a premium, standalone product with a "buy once, use forever" model (no subscriptions).
  * **Pro Features:** NDI/Syphon/Spout output, custom MIDI mapping, offline use, video injections (HAP/WebM), and Wallpaper Mode.
