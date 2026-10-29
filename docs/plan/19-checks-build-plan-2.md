# 19. The checks, the build and the plan itself (continued)

Part 2 of 3 of §19; it begins at 19l. The section starts in `19-checks-build-plan.md`.

## 19l. App frames readable in a cloud session

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

### 19l-4. A software plate develops the Mac's steps, on a clock that steps with it (found with 19l-3)

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

## 19m. Fragments for the shared documents, and this file as an index

**The index half shipped** (2026-10-29): `PLAN.md` is the index (the order of work, the
running order, a table of sections and the rules, 45 KB), each section is a file under
`docs/plan/` with its open work and the stubs of what shipped, and 78 shipped items' stories
moved to `docs/plan-shipped.md` (its third pass). Story, and the plan as first written, in
`docs/plan-shipped.md` §19m. Open:

- **19m-1. The fragment files** (F, M): each PR writes its plan, judging and changelog notes
  as a new file in `plan.d/`, `judging.d/` and `changelog.d/`, which nothing else edits, and
  a small fold puts them in place after merge. The split takes `PLAN.md`'s conflicts from
  one file to the section a PR writes in, but two PRs in one section, or both in the running
  order, still conflict; `docs/judging.md` and `CHANGELOG.md` still do. *Measure:* conflicts
  recorded per merge of main.
- **19m-2. Read each section once for the shipped prose the markers did not catch** (F, M,
  a section at a time). The move was by marker only: an item or a bullet whose title or
  first line says shipped or fixed, or is struck, moved whole, and one that shipped with
  open work found along the way kept that work in place, only its story moving. A story
  told in prose inside an open item stayed where it was (§0's "Partly shipped" account,
  10 and 11's opening paragraphs, the *Open:* sentences inside 23.12, 23.17g and 23.17m,
  27e's first part), so §10, §11, §14, §18, §19 and §23 are still 30 to 75 KB each. A
  reader who knows the code can move those stories by hand, leaving stubs. Found while
  sorting: §28 has 28f and 28g written twice, an older short version of each before the
  longer one; the two want folding into one, keeping the longer.
- **19m-3. The archive by section** (F, S): `docs/plan-shipped.md` is about 600 KB and a
  ledger in `scripts/sizes.json`; one file a section, like the plan's, would take it off.

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
**Shipped** (2026-10-10, a branch ruleset on `main`, not code): nothing lands on `main` without a pull request and green `Measure` and `WebGPU (macOS)`, and the admin's bypass works only on a pull request, never on a push. The ruleset, why those two checks, and what is left are in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

## 19v. Two checks that could not tell what they were asked
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

## 19w. A fifth Mac shard, so no shard runs near its timeout

**Shipped** (2026-10-11): the plate shard ran up to 19.8 of its 20 minutes and the other
three 15 to 17, so a fifth shard took two to five minutes from each; replayed on 11 runs,
the longest shard went from 18.4 minutes to 15.0. Story in `docs/plan-shipped.md` §19w
(moved 2026-10-29, 19m).

### 19w-1. The deploy gate counts the fifth shard

**Shipped** (2026-10-17): `deploygate.sh` wanted exactly four green shards by name, so after
19w it trusted no PR run and every deploy re-ran the whole Mac, about 55 minutes from merge
to live. Story in `docs/plan-shipped.md` §19w-1 (moved 2026-10-29, 19m).

## 19x. A moved bar names itself

**Shipped** (2026-10-11): CI fails a PR that changes a check's bar or input, or turns a
check to assert the opposite (also commit by commit, #357's case), without naming it in the
body under `Check changes:` (`npm run checkguard`, the "Check changes named" job under the
required `Measure`; the … Story in `docs/plan-shipped.md` §19x (moved 2026-10-29, 19m).

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

## 19y. Compaction and helper models set from the repo, not the host
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

## 19z. A check that compares two compiled programs on a GPU asks the compiler

**Shipped** (2026-10-11): `npm run lamp`'s first line, every look at Lamp Ground 0 byte for
byte against a lab built with the lamp's lines taken out, read "different. Story in
`docs/plan-shipped.md` §19z (moved 2026-10-29, 19m).

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
name, since `renders` on … Story in `docs/plan-shipped.md` §19aa (moved 2026-10-29, 19m).

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
  `docs/plan-shipped.md` §19aa-6 (moved 2026-10-29, 19m).
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
