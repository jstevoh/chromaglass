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

## 19am. A check red on two deploys running holds every merge but the fix (2026-11-09)

The owner's rule since 2026-11-01, made mechanical on 2026-11-09 (card 14 adopted
13:12Z): on 11-08 the fifth shard was red on deploys 699 and 701 and 16 of 34 merges
landed on a red main.

- **19am-1. Shipped:** `hold.yml` posts `Main not held red` on every open PR, red while
  the same job is red at its newest two results on main's deploys, green on a PR labelled
  `fixes-main` (`scripts/mainhold.mjs`, `npm run mainhold`; docs/plan-shipped.md, 19am).
- **19am-2. Open: the ruleset on main requires `Main not held red`.** Until it does, the
  status refuses nothing by itself; the ship skill and docs/handoff.md's merge step read
  it. Add the context to ruleset 24848041's required checks (a cloud session's proxy
  refuses rulesets writes, 19u), only after `hold.yml` has posted on every open PR once,
  or a PR with no status waits forever. Pin it to GitHub Actions (integration 15368) so
  no other app's status of that name satisfies it.
- **19am-3. Open: the same check line, not the same shard.** A shard holds dozens of
  lines, so two different flakes in `fifth` on two deploys hold main as if one check
  were red. The failing lines are in each red job's log (`FAIL` lines from checks.mjs);
  reading them would let the hold name the line and skip a shard red on two unrelated
  lines. A quarantined line (19ak-1) still turns a deploy's shard red, so it holds main
  today; whether a line-level hold skips quarantined lines is the owner's call.
- **19am-4. Open: a merge during a hold is counted.** The daily scorecard could count
  merges whose PR's status was red when it merged (a bypass by the owner, or a session
  ignoring it), from the statuses API.
- **19am-5. Open: `deploys()` against a recorded API.** The self-test drives the rule
  and the early stop on saved runs, but not the HTTP reading itself (paging, the re-run
  attempt lookup, the GraphQL read of each PR's status). A recorded set of responses
  played through a stub `fetch` would cover it.
