# 19. The checks, the build and the plan itself: what shipped (continued)

Part 4 of 4 of §19's archive; it begins at 19x-3. The section starts in `19-checks-build-plan.md`.

## Fourth pass (moved 2026-10-29, 19m-2) (continued)

### 19. The checks, the build and the plan itself (continued)

#### 19x-3. Measured quotes what it printed

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
  the guard).

#### 19y. Compaction and helper models set from the repo, not the host

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

#### 19aa-8. The Blow's push follows the solver steps, and the stroke gave it too few

- **19aa-8. The Blow's push follows the solver steps, and the stroke gave it too few
  (shipped 2026-10-25).** `tools`' "and pushes the colour along, whichever way it blows"
  was red on 13 of 187 Mac runs in the week to 10-24. Over 28 Mac strokes the push
  correlates 0.73 with the wind steps the stroke laid and the CI Macs step 12 to 23 times
  a second, so a stroke of 1500 ms of waiting got 38 to 71 and the weak ones read
  -0.07% to +0.05% against +0.15%. The stroke now takes 3000 ms of waiting; nine strokes
  of one Mac run at three paces read +0.46% to +2.97% with no straw step.

#### 19m-2. Read each section once for the shipped prose the markers did not catch

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

#### 19aa-10. `npm run tiers` raced on Measure · lab

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

#### 19c. Checks that can pass without measuring, and checks nothing runs

- ~~`wall`'s busy phase half a refresh behind cannot see the gate turning down the show's
  own next frame on a runner whose two windows are handed different refreshes~~ **Done:**
  built that mutant (`rule: 'half-show'`) as a control in `scripts/wall.mjs` arithmetic,
  and added an in-app check line on its own clock (`m.gate.frame >= 0.8 * m.hz`) that sees
  it and fails cleanly if show frames are turned down.

#### 19c. Checks that can pass without measuring, and checks nothing runs

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
  141, not CI's. The 2 s limit and the 4.5 s cap are unchanged.

#### 19c. Checks that can pass without measuring, and checks nothing runs

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
  finished rather than left to compile on the frame.

#### 19d. The build and what it ships

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
  first uses and the page's longest silence in it.

#### 19f. The plan and the docs, out of step with the code

*2026-10-04 (#245):* the first three below are fixed (the order of work replaces "What
comes next"; the openings and §12's table say what is built), `docs/judging.md`'s numbers
were made unique in #230, and the order of work's "one home" table says where each
piece of twice-written work lives. Left: the flaky-check notes in §0 and §11 (their home
is now the order of work's 0.3), `docs/roadmap.md`, the dispatch counts in
`docs/webgpu-plan.md` and `docs/evaluation-2026-09.md`, and `README.md`. CLAUDE.md's
"about 38k" tokens for this file, which was about 75k, is corrected here.

#### 19h-2. The phone's second finger lays a third as much as the first, or nothing

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

#### 19h-2. The phone's second finger lays a third as much as the first, or nothing

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

#### 19k-6. Measure's lab part split in two

- **19k-6** (E, S): **shipped**, Measure's lab part split in two. A full lab part ran 22:10 of its
  25 minutes on 2026-10-27 (main's deploys 24:52 and 23:29, a PR's full run cancelled at the
  limit), so the next full deploy was likely to go red and not publish. `lab` keeps the slosh
  dish, the soap film's control and `holeline` (about 12 min); the new `lab2` has `lampzero`,
  `bubblelook` and the four account checks (about 10). Both install Chromium; the timeout stays
  25; the required names `Measure` and `WebGPU (macOS)` are unchanged, since `reach`, `selectMeasure`,
  `deploygate.sh` and the guard read the part names from `shards.measure`.

## Shipped after the split

### 19m-3. The archive by section (shipped 2026-10-29)

After 19m and 19m-2 the open plan was a 45 KB index and 47 section files, and the archive
of shipped stories, `docs/plan-shipped.md`, had grown to 750,284 bytes in 9,361 lines: a
ledger exempt from `npm run sizes`, and a file a session opened whole to read one story.
It is now `docs/plan-shipped/`, one file a section under the open plan's names, cut
between items into parts where a section passed about 36 KB (§14 four parts, §19 four,
§18 three, §28 two), so no file is over 35 KB and the ledger entry goes.

- **What moved, and how.** Each story went to its section by the number its heading
  starts with, under the pass that moved it (first and second, 2026-10-04; third, 19m;
  fourth, 19m-2), so a stub's "(moved 2026-10-29, 19m-2)" still says where to look. Two
  kinds of heading moved a level down to sit under a pass: a second-pass section heading
  (`## 25.`, with the `###` items of its own section under it) and the fourth pass's stray
  `## ~~32b` stubs. A part that begins inside a pass or a group repeats that heading with
  "(continued)". The archive's own introduction and the four passes' notes are the
  folder's README, with a table of the files.
- **References.** Every one to `docs/plan-shipped.md` in the open plan, `PLAN.md`,
  `docs/judging.md`, `docs/README.md`, `CLAUDE.md` and the archive itself now names the
  file its item is in, found by the id after its `§` or, for "under the same number", by
  the heading it sits under. A check read the 344 in the open plan and found the id each
  names in the file it points to, 344 of 344.
- **Counted.** The old file's 8,303 non-blank lines are all in the new files, headings
  compared without their `#`s and the old path compared as the new, except: 25 lines of
  the archive's and the passes' introductions, now in the README; 61 lines of the five
  stories told twice (19m-4); and 3 lines a fact was written into (19m-4). Every heading
  id of the old file is a heading id in the new ones.
- **Open branches.** About twenty open PRs append to the old file. Main deleting it stops
  their merge on it; `node scripts/planmove.mjs` now reads the branch's archive diff as it
  reads its `PLAN.md` diff and appends each new story to the end of its section's last
  file here, under "Shipped after the split", or finds an edit inside a story by its
  context; then it removes the old file from the merge. Tried on copies of #557, #555
  and #549 before merging.

### 19m-4. What the two passes left half-cut (shipped 2026-10-29)

- The end of a sentence of 15i's story ("Maze, Ferro Paint) carry their own amount…")
  had stayed in `15-tools-on-liquids.md` when the first pass moved its start; it is back
  after "The three looks with ferrofluid (Magnet Garden, Ferro".
- §16's three "Found while building it, not done" lists have their parents again: one
  line each for 16a, 16b and 16c, saying it shipped and pointing here.
- Five stories two passes both told are told once. The earlier, longer copy stays; what
  the later one said that it did not was written into it: 14v-7 (the `flakes` command's
  `--check`), 14ab-8 ("with 14j's timer line"), 14y (its Measured and Check changes
  bullets, which only the later copy had), 27a-8 (Frame Sway's default of 0) and 35c-2
  (Blackout already one per surface; `PerformanceButton.tsx` already gone). 35c-2's
  third copy, the open half as first stated, went whole: everything in it shipped in
  35c-2 or 35c-3. A reader compared each pair line by line before the cut.
