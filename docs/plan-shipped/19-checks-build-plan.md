# 19. The checks, the build and the plan itself: what shipped

How §19's shipped items were found, built and measured. The open work is in
[`docs/plan/19-checks-build-plan.md`](../plan/19-checks-build-plan.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

Part 1 of 4; it goes on in `19-checks-build-plan-2.md`.

## Second pass (moved 2026-10-04)

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
- ~~`wall`'s busy phases' "missed from one book" can pair a refresh with its neighbour~~
  **Fixed 2026-10-04:** red once in 91 tools-shard runs of 2026-10-03/04 (f350e75, #255;
  green on re-run), reading "the wall's stamp 8.3 ms after the show's (-8.3 to 8.3)" in
  both busy phases on a 60.6 Hz display, whose half refresh (8.25 ms) is under the
  book's 8.33 ms radius. The two windows' stamps sit a different gap apart each run
  (the 91 runs read -7.5 to +8.3 ms, each within 0.1 to 0.3 ms), so once in a few dozen
  runs the gap is within jitter of half a refresh and the nearest raw stamp is a coin
  toss. The book (`bookEntry` in `scripts/wall.mjs`) now pairs around the gap the first
  refresh both windows looked up set, reset each busy phase, so a refresh's neighbours
  are a whole refresh away at any gap. The line is unchanged. A model of the book on two
  windows at every gap from -R/2 to +R/2 on a starved thread: 0 of 410 red, the book as
  it was red in 20 (all at half a refresh, "d -8.3 to 8.3", the CI signature).

### 19f. The plan and the docs, out of step with the code

- "What comes next" (2026-09-26) still says the Mixer's steps 2 and 5 are small and step
  3 is next (2 to 5 have shipped, #189 to #196), that batch 10's steps 4 to 7 are to
  come (4 and 5 shipped, #185 and #179), and never mentions §12 onwards.
- "Nothing is built" stands in the openings of §12 and §14, whose own items say
  otherwise (§12's step 4 and 4a built; 14a, 14c and 14d shipped). The running order's
  row 14 lists 14a to 14d only, and §17 has no row.
- §12's table says `public/sw.js` "already caches the build" for Android offline; 14h
  says, rightly, that it saves nothing ahead of time. §13's first "found along the way"
  point repeats 14h's first.

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

**Shipped** (#429): When the new head's tree differs from the tree of the PR's last green Mac run only in files main changed (disjoint from the PR's own site files), or only in files that never reach a Mac shard, the shards are skipped with the verdict "carried" (annotated on What the change reaches), and the deploy gate follows that chain back to the run that passed. 14 selftest cases in `reach.mjs` and deploy gate history verified.

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

*Found in 19k (2026-10-26):* `carry()` asked for a green run whose Mac shards were exactly
`open,plate,show,tools`, written by hand, while `checks.yml` had run five since 19w
(2026-10-11). So from the day it shipped no run carried, the same miss the deploy gate had
before #393. 19k reads the shards from the manifest, and a selftest case runs four of five.

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

**Shipped** (#502). What was asked, as it stood in the plan:

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

*What shipped.* `scripts/checks.json` is the list: every check CI ran, 180 steps lifted
from `checks.yml` in their order with their comments as `why` (and one more, `npm run
checks`, which holds it). `checks.yml` went from 1,734 lines to about 400: each Measure part
and Mac shard keeps its setup (Node, the cached ffmpeg, Chromium, the build) and runs `node
scripts/checks.mjs --ci <shard>`. Each check opens a `Run <command>` group as its step's log
did, which is the line `flakes.mjs` files its FAILs under; a red check is an error
annotation with its name and FAIL lines; each keeps its timeout and env; every check runs
whatever failed before it; the job summary is a table of each check's time. One step a
shard, not a workflow written out from the manifest, because a written-out workflow would
still be edited by every new check.

`reach.mjs --diff` now also says which Mac shards: a change that reaches the Mac only through
check scripts (traced through their imports and the paths they name, held to esbuild's
metafile by `npm run checks`), manifest entries (a `why` alone selects nothing) or the npm
scripts checks run selects those checks' shards; anything else, a shared helper (`chromium`,
`frame`, `lab`, `lab-entry`, `checks.mjs`) or a script no check traces selects every shard.
The matrix is `fromJSON(needs.reach.outputs.shards)`, and `deploygate.sh` reads the shard
list from the manifest.

`npm run quick` reads the same manifest, asks each check what it reads (its scripts, the
`src/` files they and the entries they bundle at run time import, from esbuild's metafile,
and every site file for a check that serves the app), and runs the ones a diff reaches side
by side, a red one again alone. `npm run check` is now `quick --measure`. Found along the
way: the turntable step had no `if:`, so it ran in all four Measure parts; and 19i's carry
never fired (above, under 19i).

And the plate shard had reached its 20-minute timeout: 19.1 to 20.4 minutes on the PR runs
of 2026-10-26, and #502's own run was stopped there with one check of 40 left (every one
before it green). The rides (101 s) and the Ben-Day print (96 s), both lab checks, moved to
tools, which ran 13.9 to 14.5: a one-line change each in the manifest now.

*Measured.* Replayed over the 60 PRs merged up to #497 (2026-10-26), 14,213 Mac
runner-minutes: six changed only check scripts (#429, #449, #456, #462, #465, #472) and
spent 1,325 Mac minutes on every shard, where the shards their checks are on took 275.
Merge conflicts: 60 adjacent merges replayed with `git merge-tree` (each PR as if opened
beside the one before) gave 9 conflicts, in PLAN.md, `docs/judging.md`,
`docs/plan-shipped/19-checks-build-plan.md` and three `src/` files, none in `checks.yml` or `package.json`; so the
conflict half of the claim is for 19k-2 to show over the next merges, not this PR.
`deploygate --history 20` read the same 20 verdicts before and after.

#### 19k-1, 19k-3, 19k-4 and the rest of 19k's follow-ups

**Shipped** (the follow-up PR to #502). *19k-1:* `checkguard.mjs` reads `scripts/checks.json`: an
entry removed (or renamed), or kept with another command, env or timeout, is a change to
what a check measures and is named under `Check changes:` with the check's name and the
numbers that differ (a timeout 15 to 20, a `--seed 3` to `--seed 4`) and a reason. A new
entry, a move to another shard, a reorder and a reworded `why` are not. Before the manifest the
same edit to a step in `checks.yml` was as invisible.

*19k-3:* `scripts/actionlint.mjs` (`npm run actionlint`, an `always` entry in Measure's
logic part) fetches actionlint 1.7.7 from its release page, holds it to the sha256 of the
release's own checksums file, keeps it in `scratch/actionlint/`, proves on a workflow with
three mistakes that it is red and names each, then lints `.github/workflows`. shellcheck and
pyflakes are off: the Ubuntu runner has shellcheck and a session or a Mac does not, so the same
file would be green in one place and red in another. The fetch that 19k's session was refused
went through in this one (curl, with the session's proxy); what a cloud session still cannot do
is run a binary it has just downloaded, so the first run of this check was CI's.

*19k-4:* `reach.mjs --diff` also says which Measure parts and which checks a PR reaches
(`parts`, `only`). A diff that is only check scripts (traced), manifest entries, the npm scripts
checks run and documents (a root or `docs/` Markdown file, `.claude/`, `LICENSE`, which select
the checks that read them, by the same trace) runs only those checks and the `always` ones (the
typecheck, that every script parses, that the manifest agrees with the workflow, the workflows
lint, and the panel and the plate, which walk all of `scripts/` at run time for a phantom `npm run` and a retired look, so the trace cannot name what they read; `npm run checks` finds any Measure check that walks `scripts/` and requires it `always`), in only the parts that have any; anything else, `src/`, `public/` (Markdown there too),
a workflow, the lockfile, a shared helper or a script no check traces, and every deploy and run
by hand, runs Measure in full as before. `checks.mjs --ci` reads `CHECKS_ONLY` and names the
checks it left out in a notice. The reach job leaves a `measure` notice when it was partial and
`deploygate.sh` does not take such a run as proof of a whole tree, as it does not one that
skipped a Mac shard; it fails closed, so a run whose jobs or annotations cannot be read, or that has no reach job, counts as partial too, and a carried run is asked as well (a selftest runs the function against a stubbed `api`). The guard also names a check moved between the Mac and Measure. A document-only PR no longer waits twelve minutes for the browser part.

*Reviewer nits on `checks.mjs` (#502's review).* The runner waits for the shell's `exit` and
gives the pipes three seconds to drain, then lets go of them and ends the group, where it
waited for `close` and a server a check started and never stopped held the shard until the
check's timeout (a selftest runs `sleep 31.7 & echo started` and requires green in under five
seconds and the sleep gone); the exit code is set, not `process.exit`, which can cut the last
log lines on macOS; reordering the entries of a shard selects the shard (the order they run in
is part of them); and the comment on what a manifest edit selects is exact (the shard lists
select every shard, the prose `about` none).

*Plate shard.* #498's review put it at 19.4 of 20 minutes; #502 had already moved the rides and
the Ben-Day print to tools, and the last run of that PR read plate 15.2, show 15.3, fifth
15.6, open 16.4, tools 16.6 minutes of checks (setup is another 1.3 to 1.5), so nothing more
moved. tools is now the longest, at about 18 of its 20 minutes with setup.

*19k-5, in part.* `scene` ("The room") was red in two seconds beside other checks and green alone
because its bar, "analysis costs under 2 ms", was the sensor's own wall-clock timer averaged
over thirty frames: 1.23 ms alone, 2.46 ms with twelve busy loops on 4 cores, one cold frame of
12 ms among thirty. It now reads the process's CPU time over each push (0.2 to 0.5 ms for the
median frame in either case), judges each room's median frame against the same 2 ms, and holds
the costliest frame to its own bar of 20 ms (11 to 15.8 ms measured over twelve runs, alone and with twelve busy loops: always the first room's cold frame; a steady slowdown of the analysis goes red at about 1.4x on it where the old wall mean went red at 1.5x). Switches and
The intro did not go red under CPU load alone: with eight busy loops on 4 cores (twice the
cores) Switches read 992 of 992 and The intro 13 of 13, so what turned them red beside the
others in the first run is not the cores; `quick` keeps their logs in `scratch/quick/` and
19k-5 stays open for the next red one.

*19k-5, closed (2026-10-27).* `npm run check` on a 4-core cloud session, all of Measure side by
side: 95 of 95 green in 52 min 55 s, Switches (1:56) and The intro (42 s) among them, so the two
reds seen beside others in the first `quick` run did not come back, and nothing was left to fix or
file. With eight busy loops they had already read 992 of 992 and 13 of 13, so the cause was never
the cores and is not known; it was not reproduced in this run or in the eight-loop run. If one
goes red beside others again, `quick` writes its log to `scratch/quick/` and 19k-5 is reopened
with that log.

*The two nits on #504.* `checks.mjs`'s walk detector (which makes a Measure check that walks
`scripts/` an `always` entry) knew `walk('scripts')` and `walk(join(root, 'scripts'))` only; a
`walk(\`${ROOT}/scripts\`)` or `readdirSync(ROOT + '/scripts/')` slipped past, so it now takes any
text after the call's open bracket on the same statement with `scripts` between quotes or slashes (nested brackets such as `join(process.cwd(), 'scripts')` too; a path built in a variable first is still not seen), and the
selftest holds both new spellings and a `walk(join(root, 'src'))` followed by another walk, which
must not borrow the later one. `deploygate.sh`'s `measurepartial` ran `jq | grep | head || true`
over the reach job's annotations, so a body that was not JSON (a 502 page, a cut read) or was an
error object (`{"message":"rate limited"}`) gave an empty answer, which reads as "ran in full";
it now parses first and answers "partial" for either, and for an empty or blank body (jq exits 0 with no output on one; the review found that case). Both selftest cases go red on the old
function (2 FAIL) and green on the new.

### 19r. Smaller, for the same pass: the open shard evened

**Shipped** (the open shard's half). The open shard had gathered eight checks since #239
evened the shards and ran 17.4 to 18.7 minutes green on 2026-10-04 against its 20-minute
timeout (startup 393 s, the phone's fingers 268 s, the lamp 124 s), while show ran 8.9 to
10.7. #280's third attempt was killed by the timeout inside the phone's fingers, and three
open PRs (#267, #280, #281) each add a check to open. The phone's fingers moved to show:
open about 14 minutes, show about 15, both from the step times of the intro PR's green run.
Nothing on show needs a cold shader cache, which is why the fingers ran after `startup`.

### 19u. Nothing reaches main without the checks

**Shipped** 2026-10-10 as a GitHub branch ruleset on `main` (ruleset 24848041), not code.
On 2026-10-10 a commit pushed straight to `main` (d8697cd, the plate hearing pitch,
brightness and the beat) passed an `audio` field that `FrameView` did not declare, so
`npm run lint` went red on main and its deploy could not publish. Behind it,
`npm run backplate` was red too. Every open PR inherited both until #332 carried the fixes.

A cloud session could not create the rule. Its GitHub access reports admin on the repo, but
the session's network proxy refuses writes to the rulesets API ("Write access to this GitHub
API path is not permitted through this proxy", HTTP 403). The owner's other tool created it
with the owner's own login, from the rule a session wrote out.

What it enforces, read back from the API:

- **A pull request for everything**, with 0 approvals, so sessions still merge their own.
  A push straight to `main` is refused, and so is a force-push.
- **`Measure` and `WebGPU (macOS)` must be green.** These are the two summary jobs in
  `checks.yml`, and they report on every PR. The per-shard jobs are deliberately not
  required. On a PR that `reach.mjs` keeps off the Mac (#329, docs only), GitHub reports one
  skipped check literally named `WebGPU (macOS) · ${{ matrix.shard }}`, and the four
  `WebGPU (macOS) · open/show/plate/tools` contexts never appear. Requiring them would hold
  every docs PR forever, and so would renaming a shard. `webgpu-all` is green when every
  shard is, or when `reach` skipped them all.
- **Not "up to date with main"**, so a green PR still merges behind main (the owner's
  choice, 2026-09-28).
- **The repository admin bypasses only on a pull request** (`bypass_mode: pull_request`).
  The owner can merge a PR past red checks, but no login can push to `main` directly. That
  includes the owner's other tool, which pushes with the owner's login, so an "always"
  bypass would have let it skip the rule.

Left: the ruleset has `require_extra_approval_for_unattributed_changes: true`, a setting with
no public documentation. If a green, non-draft PR from a session shows as blocked, that
setting is the first suspect, and the owner turns it off. The two checks are required by
name with no app attached, so a status from any app named `Measure` would satisfy them.
Pinning them to GitHub Actions (integration 15368) closes that gap. Deleting `main` is not
restricted; adding the deletion rule closes that one. The rule a session wrote out is
`handoff/main-ruleset.json` in the project's shared files.
