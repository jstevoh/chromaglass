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

## Quote what the command printed

In your PR body, every line under `Measured:` gives the command and the line it printed,
both in backticks: `` `npm run grating` → `ok 24/24 …` ``. A verdict ("passed", "clean",
"CI green") is not a measurement, and CI turns a PR from an `antigravity/…` branch red
for one (`npm run checkguard`; the form is in `docs/handoff.md`, "Measured quotes what
the command printed"). Then re-run the failed jobs; no push is needed.

## Never deploy by hand, never commit keys

Never deploy by hand: deploys come only from `main` through CI.

Never commit keys or secrets: they go in repo or Worker secrets, by name only. If one is
already committed, say so on the PR and stop.
