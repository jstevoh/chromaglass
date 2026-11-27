# 50. How the agents work: checks that can fail, parity runs, failures by fingerprint (researched 2026-11-27)

*Asked 2026-11-27: "some additional research on modern AI driven coding and architecture. Are
there improved ways we can use agents to improve process?" The owner had just read the write-up
of a large service port to Rust that agents did most of the coding on. Its moves: real traffic
mirrored to the old and new systems and their answers compared; mismatches grouped by their
shape so one fix closes a whole class; agent loops that fix one class at a time; each human
correction written down as a rule or a test; and the trap it names, tests whose assertions were
weakened while being ported so they still passed. Read beside the 2026 work on agents gaming
tests (EvilGenie, arXiv 2511.21654; SWE-ABS, cited in arXiv 2606.16062, where mutation-made
tests turned away about a fifth of agent patches the original tests had passed).*

What this project already has, so not proposed again: a bar never moves without saying so
(`npm run checkguard`, 19x), quarantines carry an end date (checkguard), `Measured:` lines
quote printed output (`npm run measured`, #542), Antigravity never writes a check, the bug
bash sweeps every look and control (`npm run bugbash`, QA-33), per-module rules for the
foreman (#939). The gaps below are what those leave open. Every item here is **proposed**:
the ones that change the foreman or the routing wait for the owner's yes. None needs a film
(the owner's no-filming order of 2026-11-26): they read numbers, not pictures.

- **50a** *A mutation run: prove each check can still fail* (rank 1, effort M, Claude picks
  the faults, Antigravity builds the runner). checkguard stops a bar moving, but nothing shows
  a check would catch a real break, and the 10-11 review found 12 of 33 failed rounds came
  through hollow or gameable checks. A weekly run on the Mac applies a list of known faults
  one at a time to a scratch worktree (dye advection zeroed, buoyancy's sign flipped, surface
  tension off, the sim clock frozen, the audio input silenced, a look's palette dropped) and
  runs the checks that claim each area (`docs/checks-map.md`). A fault that turns nothing red
  is a hole and gets a check; a check that no fault ever turns red is a VACUOUS candidate for
  `check-skeptic`. Done when: the run prints, per fault, which checks caught it, and the first
  report is in the plan. Runs from launchd at no Claude cost.
- **50b** *A parity run: main against the candidate, on the same inputs* (rank 2, effort M,
  Claude writes the tolerances, Antigravity builds it on the bug bash's sweep). The write-up's
  mirrored traffic, for the plate: every look plus the bug bash's scripted controls, run
  through main and through a branch in the lab, compared on numbers only (dye mass kept,
  colourfulness, motion, frame time), reporting only what moved past its tolerance. Under ship
  fast the GPU checks run after the deploy, so this catches the change nobody wrote a check
  for before the owner sees it. Nightly on whichever Mac is not deploying, through the film
  queue; on demand for a physics PR. Done when: a nightly report lists the looks that moved,
  by how much, and the commit range.
- **50c** *Group failures by fingerprint before anyone briefs a fix* (rank 3, effort S,
  Antigravity builds; the foreman's use of it waits for the owner). A fingerprint is the check,
  the failing measurement, the look or liquid, and the first commit it failed on. The 11-26
  main reds were 27 lines that a Claude thread grouped by hand into six briefs (19ak-24a–f).
  A script does that grouping for main's deploy, the bug bash and 50b alike, and the foreman
  requeues one job per fingerprint, not one per red line. Done when: the script groups the
  11-26 deploy's 27 lines into the same six (or says which it splits differently and why).
- **50d** *The owner's corrections become checks* (rank 4, effort S each, Claude: checks are
  Claude's lane). When the owner corrects something by eye (the flower artefact, too many
  bubbles, colours that wash out), the thread that fixes it ends with a check that is red on
  the version he corrected, or a line in that module's rules, and one line in a ledger here
  naming the correction, the date and the check. The same for an escape: its fix PR carries a
  check shown red on the commit that broke it. Why: the flower came back on a build that had
  its fix (31s, 11-22), and no check pointed at the path it took; and these corrections now
  live mostly as prose in notes that every session re-reads.
- **50e** *Re-run the receipts before an Antigravity merge* (rank 5, effort S, Antigravity
  builds; a foreman change, so it waits for the owner). `npm run measured` checks that a
  `Measured:` line quotes a command and its printed line, not that the line is true. Before it
  merges, the foreman re-runs the node commands on the PR's head and compares the printed line;
  GPU commands go to the queue and report after. A claim that does not reproduce sends the PR
  back. Fake completion is the commonest failure the 2026 studies of agents name.
- **50f** *The scorecard as a script, not a Claude run* (rank 6, effort S, Antigravity). Under
  speed mode the numbers that still matter are escapes (a later PR fixing what a merge broke,
  a revert) and how long the live site goes between deploys. A node script on the Mac computes
  both daily from git and the GitHub API and writes five lines to the owner's project files; a
  Claude thread reads them once a week. Saves a Claude session every morning.
- **50g** *A README drift check at the domain edges* (rank 7, effort S, Claude). `CLAUDE.md`
  says a PR that changes a folder's exports updates that folder's README in the same PR;
  nothing checks it (`reach.mjs` knows only `src/README.md.ts`). A fast node check compares
  the names a folder exports with the names its README lists, so the maps agents navigate by
  stay true. Runs in the PR checks.
- **50h** *The new MacBook Pro as the agents' box* (rank 8, effort S, Claude over Remote
  Control once it arrives, 2026-12-04 to 12-11). Two Antigravity lanes in separate worktrees,
  the film queue shared; 50a and 50b nightly on the machine that is not deploying; the Air
  keeps the deploy runner. No cloud cost.
- **50i** *A taste judge calibrated on the owner's own verdicts* (rank 9, effort M, later: once
  filming is back). His past calls on before and after pairs ("way better", "not sure it's
  amazing") become labelled examples; a judge ranks a change's candidates against them before
  he is asked. Costs Claude tokens per judgement, so after 50a–50f.

Looked at and not proposed: more agents debating each review (it helps only where the critic
is more accurate than the builder, and it multiplies tokens); hidden tests kept from
Antigravity (main's full suite after each merge already plays that part); hosted runners (no
cloud costs).
