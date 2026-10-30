# 19. The checks, the build and the plan itself

This section is in 3 files, cut between items: `19-checks-build-plan.md`, `19-checks-build-plan-2.md`, `19-checks-build-plan-3.md`.

Found 2026-09-28 by reading `.github/workflows/`, `scripts/` and the build, and by
reading 14 recent `Checks` runs and 96 `gallery.yml` runs through the Actions API.
19a, 19b and 19h have shipped since (#234, #239). The first two cost the most: they are much of why a deploy took 37 to
77 minutes on 2026-09-27. (Numbered 19 because 16 and 18 are in flight, in #204 and
#207.)

## 19a. `gallery.yml` holds the Mac runners
**Partly shipped**: `gallery.yml` now runs only by hand or on a PR labelled `gallery`, and `closed.yml` cancels a merged PR's queued runs. The measure after a day's PRs, and more Mac runners (19g), are below. How it was found, built and measured is in [`docs/plan-shipped/19-checks-build-plan.md`](../plan-shipped/19-checks-build-plan.md), under the same number.

*Measure after:* `npm run macqueue` over a like window once a day's PRs have run: the
gallery's share should be its labelled runs only, and the shards' mean wait below 19
minutes for the same number of open PRs. Left for the owner, since only a setting or a
bill changes it: more Mac runners at once (19g).

## 19b. Measure is near its timeout, and its first red hides the rest
**Shipped**: Measure runs as three parts side by side, each step with `!cancelled()`, with `npm run wgsl` and the script syntax check in it. How it was found, built and measured is in [`docs/plan-shipped/19-checks-build-plan.md`](../plan-shipped/19-checks-build-plan.md), under the same number.

## 19c. Checks that can pass without measuring, and checks nothing runs
**Partly shipped**: the `wall`, `startup` and book-pairing reds listed as fixed are mended. The checks that can still pass without measuring, and the open lines, are below. How it was found, built and measured is in [`docs/plan-shipped/19-checks-build-plan.md`](../plan-shipped/19-checks-build-plan.md), under the same number.

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

- ~~`wall`'s busy phase half a refresh behind cannot see the gate turning down the show's own next frame on a runner whose two windows are handed different refreshes~~ **Done.** Story in `docs/plan-shipped/19-checks-build-plan.md` §19c (moved 2026-10-29, 19m-2).
- `render-app`'s "the live loop draws again after every render" wants more than 5
  frames in the half second after each render, and read 5 after render M (music
  playing, a blackout near the end) on #236's show shard (2026-10-03), where the last
  dozen runs read M 10 to 26 and once A 11. A starved runner can stall the loop for
  a moment after a render, so the line judges the runner as well as the loop. What it
  means to ask is whether the loop resumes at all: count frames until a fixed number
  have been drawn, with a long limit, rather than frames in a fixed half second.
  **After L, done (#549, 2026-10-28):** L (the GPU lost mid-render) counted the frames
  in the half second 4 s after the render, so it timed the runner's new device: 33 to
  47 on quick runners, 0, 2, 5, 6 and 11 on slow ones across eleven show jobs on seven
  branches that day. It now takes the half second again and again for up to 20 s until
  one draws more than 5 frames the live show heard (`hearing.frames`, which a loop
  spinning on a lost device does not move), the same bar, and prints how long the loop
  took to come back; the 20 s limit is unmeasured until those prints are read. The other renders keep the one half second; M's 5 of 2026-10-03 is still
  open under the same reading.
- ~~`startup`'s "no stop in the opening" charges Chromium's hold at the GPU's start to the page~~ **Fixed 2026-10-04** (`scripts/pagehold.mjs`). Story in `docs/plan-shipped/19-checks-build-plan.md` §19c (moved 2026-10-29, 19m-2). *Still open:* the
  page's code after a GPU promise that ends exactly where Chromium's hold begins, with
  nothing between, still goes to check 4; which promise settled at 1.0 s on that run
  is not known (the opening line now names it); and the rule's cases could run in
  Measure, being pure Node, if #239's owner of the workflows adds them.
- ~~`startup`'s reds on PRs that never touched the opening, after #242~~ **Fixed 2026-10-04.** Story in `docs/plan-shipped/19-checks-build-plan.md` §19c (moved 2026-10-29, 19m-2). *Still open:* 4b's hold, since
  #249 asked for the display first, is the GPU process compiling it while Chromium
  readies the page (2.92 to 4.00 s on the four runs since #254, against a 4.5 s cap
  and 1.54 to 3.50 s before #249): the page's own compile inside the window 4b excuses
  as Chromium's. A compute kernel first would put it back; it costs the opening the
  display's seconds at the end.

*Fix:* `CRASH_GPU=1`; `songs` into Measure; `shelf`, `sw` and `bubbles` on a Mac shard,
or written into CLAUDE.md as by hand; `check.mjs` reading `scripts/*.mjs` paths as well
as `npm run` names. Each new check held red by the `check-skeptic`.

## 19d. The build and what it ships

- ~~`startup` 1b, "nothing to compare", after #283~~ **Fixed 2026-10-05.** Story in `docs/plan-shipped/19-checks-build-plan-4.md` §19d (moved 2026-10-29, 19m-2). *Still open:* read the first Mac runs' prints to
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

## 19e. The harnesses as code

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
`dc.mjs` at the root and `scripts/_diag.mjs` were wired to nothing, and `dc.mjs`
hard-coded `/opt/pw-browsers/chromium`, which `chromium.mjs` exists to avoid. **Both
are deleted** (#589: `git grep` found them only in this sentence, the archive and one
line of `scripts/checks.json`, the parse loop, which no longer names `dc.mjs`).
`actionlint`, which CLAUDE.md asks for on a workflow change, is in no image and no job.

*Fix:* a `scripts/harness.mjs` with `serve()` (port 0, polled until it answers) and
`check()`/`summary()`, taken up by new scripts first; the shards calling scripts
directly, as `checks.yml` already does for some; the strays deleted or wired;
`actionlint` in Measure.

## 19f. The plan and the docs, out of step with the code
**Partly shipped** (#245): the first three notes of docs out of step with the code are fixed. What is left is below. How it was found, built and measured is in [`docs/plan-shipped/19-checks-build-plan.md`](../plan-shipped/19-checks-build-plan.md), under the same number.

*Shipped so far* (#245, #230): the order of work replaces "What comes next", the openings say what is built, `docs/judging.md`'s numbers are unique, the "one home" table is written. Story in `docs/plan-shipped/19-checks-build-plan.md` §19f (moved 2026-10-29, 19m-2).

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

## 19g. More Mac runners than the account's hosted ones

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

## 19h. What a red PR costs, and which reds were the PR's own
**Partly shipped**: Measure in three parts, the reach filter for docs-only PRs, the evened shards and the deploy's skip of a second Mac run are in. What is left is below. How it was found, built and measured is in [`docs/plan-shipped/19-checks-build-plan.md`](../plan-shipped/19-checks-build-plan.md), under the same number.

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
  *Shipped so far:* the 2026-10-05 reading of the two both-low reds (not the touch path; two leads). Story in `docs/plan-shipped/19-checks-build-plan-4.md` §19h-2 (moved 2026-10-29, 19m-2).
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
  *Shipped so far* (2026-10-10): the red line prints, before, held and after, the engine, grid, plate, clears, drains and each solver's steps and readbacks. Story in `docs/plan-shipped/19-checks-build-plan-4.md` §19h-2 (moved 2026-10-29, 19m-2).

## 19i. A green Mac result carries across a merge of main

**Shipped** (#429; carrying fixed in 19k, #502, since until then it asked for four shards
where there were five and so never carried) Story in `docs/plan-shipped/19-checks-build-plan.md` §19i (moved
2026-10-29, 19m).

## 19j. A merge with no site change deploys nothing
**Shipped** (#253): a merge that changes no site file deploys nothing, checking and publishing nothing and green in seconds (`npm run deploygate`). How it was found, built and measured is in [`docs/plan-shipped/19-checks-build-plan.md`](../plan-shipped/19-checks-build-plan.md), under the same number.

## 19k. One manifest of checks
**Shipped** (#502): `scripts/checks.json` holds every check CI runs (180 steps, in order, with their comments), `checks.yml` runs each Measure part and Mac shard from it (`node scripts/checks.mjs --ci <shard>`), a PR whose Mac-reaching change is only check scripts, manifest entries or their npm scripts runs only those checks' shards, and `npm run quick` runs the checks a diff reaches, side by side. The story is in [`docs/plan-shipped/19-checks-build-plan.md`](../plan-shipped/19-checks-build-plan.md), under the same number.

Found with it: **19k-1** (the guard reads the manifest), **19k-3** (`actionlint` runs in Measure
from a pinned release), **19k-4** (Measure runs only the checks a diff reaches) and **19k-5** (the
side-by-side reds) **shipped**, with the two reviewer nits on #504 (the stories are in
[`docs/plan-shipped/19-checks-build-plan.md`](../plan-shipped/19-checks-build-plan.md), under the same numbers). Open:

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
- **19k-6** (E, S): **shipped**, Measure's lab part split in two (`lab` about 12 min, `lab2` about 10; the required names unchanged). Story in `docs/plan-shipped/19-checks-build-plan-4.md` §19k-6 (moved 2026-10-29, 19m-2). Open: the browser part
  is now the slowest of the five at 19:14, and holeline alone is 9.3 min; read both in `npm run flakes`
  / the job summary over the next merges and split the browser part next if it passes 21.
