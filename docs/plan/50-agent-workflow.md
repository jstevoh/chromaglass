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

Taken up again the same day. The owner, 2026-11-27 14:45Z, of the parked list: "Let's get
all of these going. You can leave the MacBook Pro one until I get that computer." So 50h
waits for the machine, and the six below are live. They came from the write-up of an
agent-built service port (traffic mirrored to the old and new systems, mismatches grouped by
shape, human corrections written down as tests); here they serve the agents' speed, not more
gates: a check that can no longer fail is worse than none, because it reads as safety.

- **50i** *A weekly mutation run: proof the checks can still fail* (S, Claude; **shipped**,
  `npm run mutate`). `scripts/mutants.json` holds faults this repository has really had,
  each the one line a merged fix changed, written back the old way in today's code;
  `scripts/mutate.mjs` puts each back alone in a worktree of its own, runs the checks that
  read its file (as `npm run quick` selects them), re-runs a red one on the clean tree so a
  check already red is no catch, and reports CAUGHT (by which), MISSED, NO CHECK, STALE (the
  code moved: rewrite the fault) or BROKEN (it only broke the typecheck). Weekly on the
  owner's Mac, Sundays 03:30, through the film queue (`scripts/mutate-weekly.sh`, installed
  by `scripts/mutate-install.sh`; report `~/cg-scratch/mutate/latest.md`); never a gate.
  Its own test, `--self`, is a check in `logic`. Open: **50i-1** every MISSED or NO CHECK
  line of the first run becomes a check (Claude), one PR per area; **50i-2** a fault per
  area the list does not yet reach (the desks, the phone, the server) as their fixes land;
  **50i-3** the app's checks (`--app`) in the weekly run once a run's length is known.
- **50j** *Main against the branch, same input, same frames* (M, Claude). `samelook` already
  runs the lab in two trees on fixed plates; the parity run generalises it: every look,
  seeded, on main and on the branch, the frames and the debug report compared, and the
  differences grouped by shape (one look, every look, one dye) instead of a wall of pixels.
  For the pure-move PRs of 50c and 50e, "identical" is the whole test.
- **50k** *Failures grouped by fingerprint before a brief* (S, Claude). Before a red main or a
  bug bash becomes Antigravity briefs, the FAIL lines are grouped by what they share (the
  check, the file and line of the first frame of a stack, the normalised message), so one
  cause is one brief, not six (19ak-24a–f were briefed by hand that way, 11-26).
- **50l** *The foreman re-runs `Measured:` receipts* (S, Claude writes, the foreman runs). An
  Antigravity PR's `Measured:` lines quote what a command printed (checkguard holds the
  quote's shape); the foreman runs that command on the PR's head before it merges and
  compares, so a receipt is a measurement, not a claim.
- **50m** *The scorecard as a script* (S, Claude). `/mnt/project-files/workflow/scorecard.md`
  is written by hand; a script that reads the merged PRs, main's deploy runs and the plan's
  status writes it, weekly, beside the mutation report.
- **50n** *Every folder's README names what its code exports* (S, Claude; **shipped**,
  `npm run readmes`, an always-run check in `logic`). CLAUDE.md's rule, held: a name a PR
  newly exports under `src/` or `server/` is named in that folder's README, one it removes
  is not still named there as live, and no README names a code name no code has. Its first
  run found two: `src/gpu/README.md` described `gateDisplayWgsl` and `leanConstants`, names
  #870's lean display never shipped; fixed in the same PR.
- **50o** *The owner's corrections become checks* (rule, Claude; **shipped** in
  `docs/handoff.md`). A correction's fix PR adds a check red on what the owner saw and the
  fault itself to `scripts/mutants.json` with that check as `expect`, so the weekly run
  proves it every week; one no check can see goes to `docs/judging.md` and still into the
  list, where it shows as a hole until a check exists.
