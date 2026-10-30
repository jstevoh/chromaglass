# 19. The checks, the build and the plan itself (continued)

Part 2 of 3 of §19; it begins at 19l. The section starts in `19-checks-build-plan.md`.

## 19l. App frames readable in a cloud session

*Shipped so far* (2026-10-26): `scripts/chromium.mjs` launches headed into its own Xvfb, watchdog off, when `PW_WEBGPU` is set and a harness asks (`present: true`); `waitForEngine` and `settlePlate` in `scripts/frame.mjs`; a cloud run has a Mac check's logic at a twentieth of its steps. Story in `docs/plan-shipped/19-checks-build-plan-3.md` §19l (moved 2026-10-29, 19m-2).

### 19l-2. The first step's stall on a cold compiler (found with 19l)

The opening builds its pipelines ahead and uses each once (`gpu/prepare.ts`), and still the
first full step, in software, spends 25 to 100 s in first dispatches before it finishes; the
page's frames wait behind it (`npm run intro`'s fade took 95 s to finish headed). Whether a
cold Metal cache pays a smaller share of the same on the owner's machine after a deploy that
changes a shader is not measured: `npm run startup` on the Mac, with STARTUP_COLD=1, reading the
first step's GPU time apart from the prepare's, would say. *Size:* S to measure.

### 19l-3. The other app checks, asked one at a time (found with 19l)

Four harnesses presented (`present: true`) and waited in steps (`settlePlate`) after 19l. The
twenty-five others that read the app's frames still launched headless on Linux; `PW_PRESENT=1`
tries any of them headed. Each wants its own pass: its opening wait through `waitForEngine`,
its waits through `settlePlate`, and a cloud run beside the Mac's to say which of its lines agree.
*Size:* S each.

*Shipped so far* (2026-10-27): eight more opted in (`take`, `ferro`, `ferrodrift`, `finger` agree with the Mac; `bubbles` and `depth` waited on a developed plate, done in 19l-4; `handpour` and `kickbubbles` read magnitudes). Story in `docs/plan-shipped/19-checks-build-plan-3.md` §19l-3 (moved 2026-10-29, 19m-2).

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

### 19l-4. A software plate develops the Mac's steps, on a clock that steps with it (found with 19l-3)

*Shipped so far* (2026-10-27): `?lockstep=1` steps each frame's clock with the plate, `developPlate` in `scripts/frame.mjs` gives a software plate the Mac's steps; `bubbles` 16 of 18, `depth` 9 of 10. Story in `docs/plan-shipped/19-checks-build-plan-3.md` §19l-4 (moved 2026-10-29, 19m-2).

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

## 19m. Fragments for the shared documents, and this file as an index

**The index half shipped** (2026-10-29): `PLAN.md` is the index (the order of work, the
running order, a table of sections and the rules, 45 KB), each section is a file under
`docs/plan/` with its open work and the stubs of what shipped, and 78 shipped items' stories
moved to the archive (its third pass), now one file a section under `docs/plan-shipped/`
(19m-3). Story, and the plan as first written, in
`docs/plan-shipped/19-checks-build-plan-3.md` §19m. Open:

- **19m-1. The fragment files** (F, M): each PR writes its plan, judging and changelog notes
  as a new file in `plan.d/`, `judging.d/` and `changelog.d/`, which nothing else edits, and
  a small fold puts them in place after merge. The split takes `PLAN.md`'s conflicts from
  one file to the section a PR writes in, but two PRs in one section, or both in the running
  order, still conflict; `docs/judging.md` and `CHANGELOG.md` still do. *Measure:* conflicts
  recorded per merge of main.
- ~~**19m-2. Read each section once for the shipped prose the markers did not catch**~~
  **Shipped** (2026-10-29): about 1,700 lines of shipped stories in 30 section files moved,
  open plan 757 → 631 KB; 28f and 28g folded. Story in `docs/plan-shipped/19-checks-build-plan-4.md` §19m-2
  (moved 2026-10-29, 19m-2).
- ~~**19m-3. The archive by section**~~ **Shipped** (2026-10-29): `docs/plan-shipped/19-checks-build-plan-3.md`
  (750 KB, a ledger in `scripts/sizes.json`) is 43 files under `docs/plan-shipped/`, one a
  section under the open plan's names (none over 40 KB), with a
  README that maps them; every reference in the plan and the docs names the file its item
  is in, and `node scripts/planmove.mjs` carries an open branch's archive edits across.
  Two comments in `src/gpu/wgsl/fluid/phaseForces.ts` (moved there by 19ai-6) still name the
  old path (§29c); the PR that next touches them fixes the name, so this one stays docs-only. Story in
  `docs/plan-shipped/19-checks-build-plan-4.md` §19m-3.
- ~~**19m-4. What the two passes left half-cut**~~ **Shipped** with 19m-3: §15's fragment
  rejoined its sentence in 15i's story, §16's three "Found while building it" lists have
  their 16a, 16b and 16c parents again, and the five stories told twice are told once.
  Story in `docs/plan-shipped/19-checks-build-plan-4.md` §19m-4.

## 19n. A shorter deploy

A deploy that runs Measure and not the Mac takes 8.0 minutes: Measure's sound part is the
critical path at 6.7 (`shape` and `downbeat` 96 s each, `bands` 48, `kicks` 44, and 23 s of
apt installing ffmpeg), then 0.8 to build and publish. *Fix:* split the sound part in two,
cache or vendor a static ffmpeg, and build beside Measure into a channel that
`hosting:clone` makes live once Measure is green. About 5.5 minutes, and docs-only PR runs
faster with it. *Size:* S.

## 19o. A rollback in under a minute

Today a bad deploy is undone by a revert PR, its checks and a deploy: 40 to 60 minutes, at
a gig. *Fix:* a `workflow_dispatch` that runs `firebase hosting:clone` of the previous live
version, and a `show-YYYY-MM-DD` tag on each green deploy the owner has judged, which 14p's
`npm run show` plays. It is also what makes 19i's after-publish Mac run safe. *Measure:* the
time from dispatch to the previous version live. *Size:* S.

## 19p. A preview URL on every PR

`docs/judging.md` is edited by 12 of the last 30 PRs, and every one of those waits for the
owner's eyes after it is live, so a look that is wrong costs a follow-up PR and a deploy.
*Fix:* `action-hosting-deploy` without `channelId` on pull requests posts a preview URL per
PR (forks get no secrets, which is right), about a minute of ubuntu a push; the judging
sheet (19t) links each item's preview. *Size:* S.

## 19q. Auto-merge, and nothing merges red

`main` has no protection, `allow_auto_merge` is off and there are no rulesets, so a session
polls for green and merges by hand (a median of a minute after green, so it is quick, but
each poll is a session's wake), and nothing stops a red merge. *Fix, in the owner's
settings:* a ruleset requiring `Measure` and `WebGPU (macOS)`, and auto-merge on; a session
arms it when it opens the PR ready. A merge queue is not offered on a repository owned by a
user. *Size:* S.

## 19r. Smaller, for the same pass

- The open shard evened again: **shipped** (docs/plan-shipped/19-checks-build-plan.md 19r). New checks go on the
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

## 19s. A ledger of reds, so the worst check is fixed first

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

## 19t. The owner's judging sheet

47 items wait on the owner's eyes on the Mac (the order of work's Wave 2), spread through
`docs/judging.md`, the running order and this file's sections. *Fix:* `npm run judging`
writes one page: each item with the build it shipped in, the link that opens it (a preview
URL from 19p, or the live site with its query), what to look at and what would be wrong,
grouped so one sitting covers one area, gates first. The owner's verdicts go back as one
commit. *Size:* S.

## 19u. Nothing reaches main without the checks
**Shipped** (2026-10-10, a branch ruleset on `main`, not code): nothing lands on `main` without a pull request and green `Measure` and `WebGPU (macOS)`, and the admin's bypass works only on a pull request, never on a push. The ruleset, why those two checks, and what is left are in [`docs/plan-shipped/19-checks-build-plan.md`](../plan-shipped/19-checks-build-plan.md), under the same number.

## 19v. Two checks that could not tell what they were asked
**Shipped** (2026-10-10): the magnet's drag is laid out on the plate, off its middle row, and the Stage sheet's Esc is listened for once (`hooks/useEscape.ts`). The story is in [`docs/plan-shipped/19-checks-build-plan-2.md`](../plan-shipped/19-checks-build-plan-2.md) §19v.

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
  now. The story is in [`docs/plan-shipped/19-checks-build-plan-2.md`](../plan-shipped/19-checks-build-plan-2.md) §19v.
- **19v-4. Recording still re-wraps the plate bar at 1280, which sits on a 1 px edge.**
  **Shipped** (2026-10-25): Record's running timer on the desk (`RecordControls`) and on
  Play (`PhonePlay`) overlays its idle box and takes no extra width, so starting or stopping
  Plate video, a Take, or both never widens the button in the plate bar at 1280 or shifts
  Play's top pills. `layout` and `phone` each ask it now. The story is in
  [`docs/plan-shipped/19-checks-build-plan-2.md`](../plan-shipped/19-checks-build-plan-2.md) §19v.
- **19v-5. The plate bar at 1280 still has no slack.** What #470 left of 19v-4's ask. In Build
  at 1280 × 800 the bar's children and gaps take 935–936 px of its 936, the name already down
  to its 120 px floor. Record no longer widens it, but any text that renders a pixel wider
  (Geist arriving late, another platform's fallback) drops the plate by a row (about 42 px),
  mid-show or at rest, as Record's label did. Give the bar some slack at 1280 (a narrower
  floor for the name, or a smaller gap, whichever the `layout` check shows keeps the plate
  where the hand found it); the bar itself is not changed by this item's entry. Desk lane.

## 19w. A fifth Mac shard, so no shard runs near its timeout

**Shipped** (2026-10-11): the plate shard ran up to 19.8 of its 20 minutes and the other
three 15 to 17, so a fifth shard took two to five minutes from each; replayed on 11 runs,
the longest shard went from 18.4 minutes to 15.0. Story in `docs/plan-shipped/19-checks-build-plan-2.md` §19w
(moved 2026-10-29, 19m).

### 19w-1. The deploy gate counts the fifth shard

**Shipped** (2026-10-17): `deploygate.sh` wanted exactly four green shards by name, so after
19w it trusted no PR run and every deploy re-ran the whole Mac, about 55 minutes from merge
to live. Story in `docs/plan-shipped/19-checks-build-plan-2.md` §19w-1 (moved 2026-10-29, 19m).

## 19x. A moved bar names itself

**Shipped** (2026-10-11): CI fails a PR that changes a check's bar or input, or turns a
check to assert the opposite (also commit by commit, #357's case), without naming it in the
body under `Check changes:` (`npm run checkguard`, the "Check changes named" job under the
required `Measure`; the … Story in `docs/plan-shipped/19-checks-build-plan-2.md` §19x (moved 2026-10-29, 19m).

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

- **19x-3. Measured quotes what it printed.** **Shipped** (2026-10-26): the `Check changes named` job fails an Antigravity PR whose `Measured:` quotes no printed line (`scripts/measured.mjs`, `npm run checkguard`). Story in `docs/plan-shipped/19-checks-build-plan-4.md` §19x-3 (moved 2026-10-29, 19m-2). Named limit: `npm run checkguard` still reads "it passed on 2026-10-26" as printed, because the self-test holds that sentence in a string literal; the lookup cannot tell a script's fixtures from what it prints (the other scripts' fixtures are the same risk, small, and the reviewer's re-run is the guard). Found along the way: `namedLines` does not read a
  `Check changes:` that is itself a list item (`- **Check changes:**`, how Antigravity's
  bodies write the whole block), so a named change under that form is not seen. It fails
  safe (red, never green) but costs a round; read it the way `measuredGroups` does.

## 19y. Compaction and helper models set from the repo, not the host
**Shipped** (2026-10-17): `.claude/settings.json` sets the window to 200000 in its `env` block and `CLAUDE_CODE_SUBAGENT_MODEL` to sonnet; the agents that judge name opus. Story in `docs/plan-shipped/19-checks-build-plan-4.md` §19y (moved 2026-10-29, 19m-2).

Measure: a session started after the merge shows the window at 200000 in its
environment, and its context compacts near 160k rather than 400k (inferred from the
percentage; to be confirmed on the first thread that reaches it). If the host's value
still wins, the window has to move in the environment's own settings instead, which only
the owner can change. Still open alongside it: 19m (PLAN.md as an index), now more
pressing, as the file is about 500 KB.

## 19z. A check that compares two compiled programs on a GPU asks the compiler

**Shipped** (2026-10-11): `npm run lamp`'s first line, every look at Lamp Ground 0 byte for
byte against a lab built with the lamp's lines taken out, read "different. Story in
`docs/plan-shipped/19-checks-build-plan-2.md` §19z (moved 2026-10-29, 19m).

- **19z-1. `npm run beams` compares two programs the same way, on the Mac.** Its first line
  holds the projector's pass against a lab built from the old pass, byte for byte, in the
  `tools` shard on Metal. It has not flipped, and the pass is small; when it does, move
  that line to Measure as lampzero was, with `openLab({ software: true })`.
- **19z-2. Measure's `browser` part is near its timeout again.** Found 2026-10-12 placing
  lampzero: the part ran 12:16 of its 15 minutes (the layout 2:49, the phone 3:14, a click
  in the app 1:04, the sound's renders 0:47, the intro 0:38, Chromium 0:30), the margin 19b
  split Measure to get back. The next Chromium check goes in a part of its own or splits
  this one as 19b did; until then a slow runner turns the part red with nothing wrong.

## 19aa. A flake tracker: each check's reds counted from CI's own logs

**Shipped** (2026-10-18): `npm run flakes` reads every run of `checks.yml` and `deploy.yml`
in a window (`--days`, `--since`, `--until`; 7 days by default), every attempt's jobs and
each job's log, and prints, per check (the runner's system, the command and the check's
name, since `renders` on … Story in `docs/plan-shipped/19-checks-build-plan-3.md` §19aa (moved 2026-10-29, 19m).

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
- **19aa-6. The renders lines on a starved runner (shipped 2026-10-24).** Story in
  `docs/plan-shipped/19-checks-build-plan-2.md` §19aa-6 (moved 2026-10-29, 19m).
- **19aa-8. The Blow's push follows the solver steps, and the stroke gave it too few (shipped 2026-10-25).** The stroke takes 3000 ms of waiting. Story in `docs/plan-shipped/19-checks-build-plan-2.md` §19aa-8 (moved 2026-10-29, 19m-2). The paused hunt
  for why the app pushes less per step than the lab (the breath's share, the `still`
  threshold, the Dropper's bottle) is not answered: the toolAmount is 1, so
  `k = kRaw²` is 1, and the 0.75-cell `still` threshold is under the moves' one cell on a
  192 grid. Open: why the push has an offset of about 50 steps before it rises, and
  whether a Mac with fewer than 12 steps a second still reads under the bar.
