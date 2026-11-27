# 50. Better code, a cleaner engine and a smoother plate, built by the agents (asked 2026-11-27)

*Asked 2026-11-27: "some additional research on modern AI driven coding and architecture. Are
there improved ways we can use agents to improve process?" The first answer led with checks
(mutation runs, parity runs); the owner turned it: "I'm less interested in the tests. We don't
have a completely working system to start with ... I actually want to just have better code and
better architecture. And most important beautiful visuals that have as little jitter as
possible." So this section ranks by what makes the plate smoother and the code easier to
change, and the agents' part in each.*

What the agents are good at, from this repo's own record: pure moves that keep a measured
thing identical (19ai-6 split `wgsl/fluid.ts` into 15 files with the KERNELS hash unchanged;
19ai-8 took 156 KB out of `App.tsx`), and work with a number to hit. What goes wrong: one PR
that moves and changes at once, and a seam nobody wrote down first. So every item below is a
target Claude writes once and Antigravity builds in small moves, each PR either a pure move
or one change, never both.

Measured on main at 45af630: `LiquidVisualizer.tsx` 390 KB and 6,898 lines, the frame loop
still one `useEffect` (19ai-10); `App.tsx` 202 KB; `wgsl/plate.ts` 173 KB, the display shader
that is the opening's long compile (6.77 s on the owner's Mac, 11-08). The plate is drawn on
the page's own thread: nothing in `src/gpu/` or the visualizer uses `OffscreenCanvas` or a
worker, so every React render, garbage collection and long task on the page waits in line
with the frame. At 120 Hz a frame has 8.3 ms; the 11-13 audit measured one desk render at
14.3 ms and 636 KB of garbage a frame (§46).

- **50a** *Clear the hitches already found* (rank 1, S to M each, Antigravity; §46's items,
  not new ones). In order of what the eye sees: **46m** Tank and the lamp's boil compile 13
  pipelines on the frame that turns them on, a two to six second stop; **46o** Song ID
  resamples and matches on the page's thread every six seconds; **46h** a MIDI fader or a Go
  fade renders every desk panel, ten to thirty times a second; **46p** the remote's whole
  snapshot is serialised every 80 ms with no phone connected; **46j** the frame's own
  garbage. Each already names its check or the check Claude writes first. The cheapest
  smoothness there is, because the causes are found and placed.
- **50b** *One smoothness number per look* (rank 2, S, Antigravity). Not a gate: an
  instrument. On the owner's Mac, every look for 30 s with the band: the 99th-percentile frame
  time, frames over one refresh, and long tasks over 8 ms, at 60 and 120 Hz (46c's
  `npm run stutter`, 46e-2's real ProMotion stamps), written as one table into the owner's
  files, best and worst first. It tells 50a and 50c where the jitter is and whether a PR
  made it smaller.
- **50c** *The frame loop out of React, a piece at a time* (rank 3, M ongoing; Claude writes
  the seam, Antigravity moves the pieces). 19ai-10 done as a programme, not when a PR happens
  to touch it: the loop becomes `src/engine/`, a plain module that owns the plate's per-frame
  state and takes settings and gestures as typed messages, and the component only mounts it.
  Each PR moves one piece (the input writers, the readbacks, the post chain, the governor's
  feed) as a pure move, held against the 26 checks that read the file as text (19ai-3a) and
  `samelook`. Done when `LiquidVisualizer.tsx` is under 40 KB.
  - **50c-1 shipped** (2026-11-27): the seam written down (`src/engine/README.md`: the engine
    owns the per-frame state, takes typed messages, sends events, imports no React) and the
    first piece moved verbatim: the pointer and the fingers (mouse, touches, Spin hands, the
    closeup's Alt-drag and two-finger camera) to `src/engine/pointer.ts`, `coverPinch.ts`
    from `components/` beside it. `LiquidVisualizer.tsx` 390,411 to 373,454 bytes. No check
    read the moved text. The order of the next moves (50c-2 debug report, 50c-3 the GPU's
    guards, 50c-4 the governor, 50c-5 the clocks: Antigravity's, briefed 2026-11-27 in the
    owner's files under `antigravity/engine-50c/`, strictly one after another; 50c-6 the
    device's start, which writes the effect's own state, so Claude designs its home first;
    50c-7 on: `renderFrame` by stage) is the README's table.
  - **50c-1a. Found along the way: the pointer reads the frame's box, not its own.** The
    moved handlers read `stageRef`, `frameRef` and `macroShotRef` as the loop writes them,
    so in a worker (50d) the page side needs a copy of the camera's shot each frame to map a
    finger to the plate; today they share one object. Name it in 50d's message shape.
- **50d** *The plate on its own thread* (rank 4, L, after 50c; Claude designs, the owner OKs
  the message shape since it is an export between domains). Once the engine is a module, it
  runs in a worker on an `OffscreenCanvas`, so React, the desk, the remote and the page's
  garbage can no longer take a frame. Chrome and Electron run WebGPU in workers; Safari's
  support must be measured first, so the main-thread path stays as the fallback. The one
  change most likely to remove the jitter nobody has placed.
- **50e** *The display shader cut into passes, compiled for what a look uses* (rank 5, M,
  Antigravity, a pure move first as 19ai-6 was). `wgsl/plate.ts` into pass files with shared
  includes; then each look builds only the variants it draws, behind the show like glint's.
  A faster opening and fewer compile stops when a look turns something on.
- **50f** *Spend the freed time on the picture* (rank 6, owner's eyes). As 50a–50d free frame
  time, the governor's default rung and the closeup's detail rise, not the frame rate's
  headroom alone: finer dye, more of the macro look on the plate. Judged by the owner on the
  plate, one look at a time.
- **50g** *A weekly tidy, one small PR* (rank 7, S, Antigravity). An unused-code report
  (exports, files and state nobody reads: `activeMat` and `chem` allocated with chemistry off
  in 46n, the state nobody reads in 46i) and one pure-move or delete PR from it a week, so
  the code gets smaller as it grows.
- **50h** *The new MacBook Pro as the agents' box* (rank 8, S, Claude over Remote Control once
  it arrives, 2026-12-04 to 12-11). Two Antigravity lanes in separate worktrees, 50b's table
  nightly on the machine that is not deploying; the Air keeps the deploy runner. No cloud cost.

- **50i** *A nightly parity run: main against a branch, numbers only* (the owner,
  2026-11-27: "Let's get all of these going"; taken off the parked list below). ~~Shipped:
  `npm run sameapp` sweeps every look and the bug bash's desk and phone (QA-33) on both
  sides with one ruler (this tree's `bugbash.mjs` pointed at each side's build), and
  compares what the sweep reads as numbers: frame rate, the plate's brightness, colour,
  flatness, detail, cast and motion, each control's settings moved, page changed and plate
  moved, and the findings. Claude set the tolerances (the floors and their reasons are in
  the script's head), and each run sweeps four control looks twice on the base first and
  raises a floor to twice the same tree's spread on a noisy night; a look counts as changed
  only when both of its moments moved the same way, a control only across a 3×-to-1× gap
  of its drift. Nightly on the owner's Mac at 11:30 PM from its own clone
  (`npm run sameapp -- install-agent`, `scripts/sameapp-nightly.sh`): last night's main
  against tonight's, every look every night and a quarter of the desk and phone (all of
  it every four nights), each piece one `maclock.mjs run` so a deploy waits at most one
  piece; skipped on battery; off switch `rm ~/cg-scratch/sameapp/LIVE`. Never films, never a
  gate; the report is `~/cg-scratch/sameapp/latest.md`. `npm run sameapp -- --selftest` (logic
  shard) holds the comparison.~~
  - **50i-2** *Tighten the floors from the first week* (S, Claude). The floors are reasoned,
    not measured: no same-tree spread from the Mac existed when they were set. After seven
    nights, read the `tolerances.spread` of each `parity.json` and set each floor to about
    twice the week's largest, in a Claude PR with the numbers.
  - **50i-3** *Open branches too* (S, Claude). The nightly compares the day's merges; a
    branch is compared by hand (`npm run sameapp -- --head <branch>`). An open PR labelled
    `parity` could be swept the same night once the run's length on the Air is known.
  - **50i-4** *The report where the owner reads it* (S). `latest.md` lives on the Mac; copy
    it to the NAS's ChromaGlass folder, or let the foreman post its high and medium lines.

- **50j** *One fix job per failure, not per red PR* (the owner, 2026-11-27; S, foreman). The
  foreman briefed one fix job per red Antigravity PR, up to twice. When main broke a check
  every open PR went red on the same line and each got a job, so several runs chased one
  cause in several clones; and a fix that did not work was briefed again from the same log,
  which never once worked.
  - **50j-1** *The foreman groups failures by fingerprint* (shipped 2026-11-27, the foreman on
    the owner's Mac, not in this repo). A red PR's failing logs become fingerprints (each
    failure line with its times, shas, temp paths and numbers taken out, hashed). A
    fingerprint holds one job: another open PR with it waits, labelled with the PR whose job
    has it, for a day at most; the same fingerprint after a pushed fix escalates to a Claude
    thread instead of a second brief; a PR that inherits a failure an earlier PR had is told
    to merge main first. The foreman's `node --test` suite covers it (46 tests). The first
    live pass found GitHub's echo of a step's script (`fail-on-cache-miss: false`, an `echo
    "... failed"`) fingerprinted as failures, which would have made every red Mac app job one
    failure; the stub skips those lines now, and 50j-2 must too.
  - **50j-2** *`scripts/fingerprints.mjs` on main* (S, Antigravity). The foreman runs a stub
    until main has this file, then runs main's copy (read hourly) and falls back to the stub
    if it is missing or prints the wrong shape. The interface it must keep:
    `failureShape(line)` returns the line with everything that changes between runs taken
    out, or `null` when the line is not a failure (step-script echo, inputs, comments and
    the generic `Process completed with exit code` lines are not failures);
    `fingerprint(shape)` returns 12 hex characters of its sha1; `groupFailures(log, { check })`
    returns `[{ fp, shape, check, count, sample }]`; the CLI is
    `node scripts/fingerprints.mjs [--json] [file ...]`, reading stdin when given no file,
    `--json` printing the `groupFailures` array. Its check: a node harness that feeds it real
    `gh run view --log-failed` text from two runs of one failure (different times, shas and
    durations) and two different failures, and requires one and two fingerprints.
- **50k** *The foreman checks `Measured:` receipts before it merges* (shipped 2026-11-27, the
  foreman on the owner's Mac). A green Antigravity PR used to merge on CI alone, which checks
  that the `Measured:` section is well formed (`scripts/measured.mjs`), not that the command
  prints the quoted line on that head. The foreman now runs each quoted command itself, on
  the PR's exact head in its own clone, and merges only when every quote matches (words and
  verdicts exact, counts exact, other numbers within 10%). Only logic and sound shard checks
  run; an env prefix, node flags, shell, the build and the whole suite are skipped, never run.
  A mismatch escalates `RECEIPT #n head sha`; a push starts it over. Proved on #990: lint and
  sizes matched, `npm run rig` skipped as not a check, about a minute. Off on its own with
  `FOREMAN_RECEIPTS=0` in the foreman's launchd environment.


Parked by the owner's turn (2026-11-27), not dropped: a weekly mutation run proving checks
can fail, the scorecard as a script, a README drift check (the parity run, failures grouped
by fingerprint and the foreman's receipts were taken up as 50i, 50j and 50k).
They came from the write-up of an agent-built service port (traffic mirrored to the old and
new systems, mismatches grouped by shape, human corrections written down as tests) and suit a
system that already works; take them up when the plate does.
