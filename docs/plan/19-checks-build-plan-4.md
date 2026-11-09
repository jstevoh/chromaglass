# 19. The checks, the build and the plan itself (continued)

Part 4 of 4 of §19; it begins at 19al. The section starts in `19-checks-build-plan.md`.

## 19al. The handoff between the two tools waits on whoever notices (2026-11-07)

First built 2026-10-24 as #450 (plan id 19ae then, since given to the phone check),
closed unmerged by an idle-draft sweep and rebuilt on 2026-11-07's `main`.

- **19al-1. Shipped:** a green head says so on the PR, and every hop names its commit
  (`ready.yml`; docs/plan-shipped.md, 19al).
- **19al-2. Shipped:** a `PASS` merges without waiting for Antigravity: the reviewer
  merges on its own `PASS`, pinned to the head it passed (the owner, 2026-10-24;
  docs/plan-shipped.md, 19al).
- **19al-3. Shipped:** "Who takes what" by what the job needs, the owner's 2026-11-01
  split; two `CHANGES` hand a PR to Claude Code (docs/plan-shipped.md, 19al).
- **19al-4. Open: the watcher no longer relays "ready".** With `READY` on the PR, the
  reviewing thread can subscribe to each Antigravity PR and wake on the comment itself;
  the Mac watcher keeps only what needs the Mac (full `qa`, driving Antigravity). A
  process note for the coordinator, once the first live `READY` has been seen.
- **19al-5. Open: measure how long each hop takes.** From the `READY`, `PASS`/`CHANGES`
  and merge timestamps on each Antigravity PR: green → review, review → fix, fix →
  merge. The daily scorecard reads open → merge today; split, it would show which hop to
  fix next.
- **19al-6. Open: the first live label.** `ready.yml` was proven against a stubbed `gh`;
  the first Antigravity PR to go green after the merge is its first real run. Confirm
  the label and the `READY` line appear, and that a push takes the label off.
