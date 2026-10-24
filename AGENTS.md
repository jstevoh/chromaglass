# Agents working here

`CLAUDE.md` holds this repo's rules for every agent, whatever tool runs it. Read it
first. It says how work is done, what to read in `PLAN.md` and how PRs ship.

If you are not Claude Code, read `docs/handoff.md` next. It covers how to claim work
alongside Claude Code sessions, the handoff block every PR body carries, and what to do
in place of the agents and skills in `.claude/`, which only Claude Code can run.

## Leave a record on GitHub

Claude Code sessions only see what is on GitHub. Whenever you do anything for the project,
including work that is not a PR (setting a repo secret or setting, editing another PR's
body or files, a Firebase or Cloudflare console step the owner did with you), record it
there the same day: a comment on the related PR or issue, or a line in `PLAN.md`'s status
table when there is no PR. Name secrets, never their values. Details in
`docs/handoff.md` ("Leaving a record").

## Never deploy by hand, never commit keys

Never deploy by hand: deploys come only from `main` through CI.

Never commit keys or secrets: they go in repo or Worker secrets, by name only. If one is
already committed, say so on the PR and stop.

## Small PRs, and say which commit

Details in `docs/handoff.md` ("Small and short-lived", "Ready, review, merge"):

- One plan item per PR, under about 400 changed lines, opened, green and reviewed within
  a day. Merge `main` in once, as the last push before review, not on every new commit
  to `main`.
- The PR body's handoff block starts `Plan item: <id>`, and its `Review owed:` line starts
  `before-merge`, `sampled` or `none`. Add the `review-owed` label when you open the PR if
  that line is not `none`.
- Your summary comment at the end of each run starts `Pushed #<n> <item> head <sha>`.
- Never post a `READY` line or add `ready-for-review` yourself: when `Checks` goes green
  on the head, `ready.yml` adds the label and comments `READY #<n> <item> head <sha>`.
  A review answers `PASS #<n> head <sha>` or `CHANGES #<n> head <sha>` and a numbered
  list.
- A PR that owes a review before merge is merged by the Claude reviewer on its `PASS`,
  pinned to the head it passed; do not merge it yourself. One that owes none you merge
  with `gh pr merge <n> --squash --match-head-commit <the green head>`.
