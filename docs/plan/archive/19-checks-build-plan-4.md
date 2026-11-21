# Archive: 19. The checks, the build and the plan itself (continued)

The closed items of [`docs/plan/19-checks-build-plan-4.md`](../19-checks-build-plan-4.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## 19al. The handoff between the two tools waits on whoever notices (2026-11-07)

- **19al-1. Shipped:** a green head says so on the PR, and every hop names its commit
  (`ready.yml`; docs/plan-shipped.md, 19al).
- **19al-2. Shipped:** a `PASS` merges without waiting for Antigravity: the reviewer
  merges on its own `PASS`, pinned to the head it passed (the owner, 2026-10-24;
  docs/plan-shipped.md, 19al).
- **19al-3. Shipped:** "Who takes what" by what the job needs, the owner's 2026-11-01
  split; two `CHANGES` hand a PR to Claude Code (docs/plan-shipped.md, 19al).
- **19al-6. Shipped:** the first live labels. `ready.yml` labelled five Antigravity PRs
  on their own green heads on 2026-11-09 between 05:35Z and 09:16Z, each with its
  `READY #N <item> head <sha>` line (docs/plan-shipped.md, 19al).
- **19al-8. Shipped (docs):** the written rule matches the owner's of 2026-11-15: a
  green Antigravity PR merges with no Claude Code review, before or after, except
  sign-in, keys, payments, licences, the Workers and security (`docs/handoff.md`,
  "Ready, review, merge"; `CLAUDE.md`; `AGENTS.md`). The sampled pass after merge is
  gone; `sampled` on an older PR reads as `none`. `ready.yml` and 19al-7's auto-merge
  are unchanged by this.

## 19am. A check red on two deploys running holds every merge but the fix (2026-11-09)

- **19am-1. Shipped:** `hold.yml` posts `Main not held red` on every open PR, red while
  the same job is red at its newest two results on main's deploys, green on a PR labelled
  `fixes-main` (`scripts/mainhold.mjs`, `npm run mainhold`; docs/plan-shipped.md, 19am).
- **19am-6. Shipped (2026-11-12): a 5xx from GitHub no longer leaves every PR without a
  status.** `hold.yml` got HTTP 502 from `GET actions/runs/<id>/jobs?filter=latest`
  twice on one PR's run, `call()` threw on the first, and no PR was posted. `call()`
  now tries a 5xx or a fetch that threw four times (2, 6 and 18 s apart; a 4xx and a
  403/429 rate limit are not retried), and `deploys()` leaves out, with a line naming
  the deploy, one whose jobs still cannot be read, as a cancelled deploy is left out.
  `holdFrom` is untouched, so no deploy is counted green that did not run. Whether a
  hold survives depends on the unread deploy not being the red one; the next run reads
  it again. `-- --self-test` plays both through a stub (`fetchRetrying`, `deploys` with
  an injected `get`), which also covers part of 19am-5 (the jobs and re-run reads fail
  over; paging and the GraphQL read are still unplayed).
