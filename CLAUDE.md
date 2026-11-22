# ChromaGlass: working here

A liquid light show: a WebGPU fluid solver (`src/gpu/`, shaders in `src/gpu/wgsl/`)
drawn as a projected plate, played from a Perform desk, built on a Design desk,
driven by sound. Live at Firebase Hosting; `main` deploys on every merge.

Before starting anything that is not a bug fix, read `PLAN.md` (see `.claude/rules/plan.md`).
`docs/roadmap.md` holds the engine's order; `docs/judging.md` lists what needs the owner's
eyes on a real GPU.

## Where things live

Before any code, read the folder's `README.md`: `src/gpu`, `src/gpu/fluid`, `src/gpu/wgsl`,
`src/gpu/wgsl/fluid`, `src/sim`, `src/app`, `src/lib`, `src/hooks`, `src/components/desk`,
`src/components/settings`, `src/components/phone`, `server`, `scripts`. Which domain owns
what, and why the code is split this way: `docs/architecture.md`. A file over 40 KB is
never opened whole: grep for the symbol, then read about 80 lines around it. A search
across many files goes to an Explore agent that returns paths and line numbers.

- **Edges are typed and written down.** Code reaches another domain only through what it
  exports. A PR that changes an export updates that folder's README in the same PR.
- **One owner per piece of state.** App state lives in `App()` and its hooks (`src/app/`),
  the plate's live state in the visualizer's refs. `window` carries only the checks' hooks
  and the Mac and iPhone bridges, declared in `src/lib/checkHooks.ts`.
- **Size.** `npm run sizes` fails a new file over 100 KB or a file already over it that
  grows, and warns past 40 KB: new code for a big file goes in a module beside it. A split
  is a pure move in its own PR, with bytes before and after and a table of old lines to
  new files.
- **Planning.** The PR body opens with the domains it touches, the exports it changes and
  the checks that prove it. Ask the owner first only when an export between two domains
  changes shape.

## How work is done here

- **`README.md` is the front page, short.** What a feature or control does is written in
  `docs/guide.md` (the long reference), and `docs/README.md` maps the other docs. Scratch
  scripts live in `scratch/` (git-ignored), never in the root.
- **Every claim has a check.** A fix comes with the `npm run …` script that
  measures it, printed numbers before and after in the commit message.
- **Never loosen, skip or delete a check to get green.** Find why it is red.
- **Comments explain why, at length, in prose** (see any file in `src/gpu/`).
  Match that: what was reported, what was measured, why this and not the
  obvious thing. Short code, long reasons.
- **Commit messages** say what was wrong, what changed and what it measured.
  No model names in commits, PRs or code.
- **The repository is public.** Files, commits, PRs and comments say "the owner",
  never a name, email, machine name or account figure. What is private to the owner
  goes in the project's memory or its shared files, which only the owner can see.

## Keeping a session small

A session sends its whole context again on every step, so what it read hours ago it
pays for on every tool call since. Measured 2026-09-27 on the busiest threads: about
70% of their usage was that re-reading, at 200–380k tokens of context each.

- Read the section, not the file. Pipe long output (`npm run check`, a `git diff` of
  the plan, job logs) through `tail` or `grep FAIL`; a long log or a wide search
  goes to a subagent that returns only the lines that matter.
- Open the one picture the question needs, not every contact sheet a run wrote.
- Waiting on CI, the PR subscription wakes the session when the suite completes. Set
  one fallback check-in, not a chain of half-hourly ones: each wake re-reads the whole
  context even when all it finds is "still running".
- Batch independent tool calls into one step: each step re-sends the context, so three
  reads in one step cost a third of three steps. A wide listing (triggers, a session's
  events, every run of a workflow) goes to a subagent, never into the thread.
- `.claude/settings.json` compacts every session at a 200k window
  (`CLAUDE_CODE_AUTO_COMPACT_WINDOW`; the cloud host's own default is 500k), and
  runs helper agents on a cheaper model unless an agent's `model:` line says otherwise.
  An agent that reviews or judges a check names its model; a lookup or an audit that
  only reads and lists does not need the parent's.
- One thread per PR (the owner, 2026-09-27). When a thread's PR has merged, its next
  piece starts in a new thread, not this one: say what it is in the closing reply.

## Which checks for which files

Every change: `npm run lint` (typecheck) and `npm run sizes`. Then `npm run quick` runs,
side by side, the checks your diff from `origin/main` reaches and a cloud session can run
(`-- --dry` says which and why). The full table, with what `quick` cannot see (agents,
pictures, the Mac), is `docs/checks-map.md`: grep it for the paths you touched.
A PR's CI runs only the typecheck, the build and the node harnesses; the browser, lab and
Mac checks run on main's deploy only (19ak-20), so before pushing a change the plate draws,
run its lab or harness yourself. What a cloud session can and cannot verify is the table in
`.claude/rules/checks.md`; CI itself is `.claude/rules/ci.md` and `docs/ci.md`.

## Branches, PRs, deploys

- One PR per piece of work, a draft until CI is green. Squash-merge.
- Every PR updates the plan (`.claude/rules/plan.md`).
- Every feature ships its phone version in the same PR.
- Merge as soon as CI is green; the owner does not need to be asked (2026-09-27).
- After a PR merges, a branch that carries on is restarted from `main`
  (`git fetch origin main && git checkout -B <branch> origin/main`), never stacked
  on merged history.
- A merge to `main` deploys (`deploy.yml`) within minutes, without waiting for the slow
  checks, which run beside it as a report (PLAN.md 19ak-21, the owner, 2026-11-22: ship
  fast, fix what breaks). Confirm its `Build and deploy` job finished green and report the
  time in **Pacific time**, not UTC. A red check there means a bug is live: fix it.
- **More than one session works on this repo at once.** Before starting, look
  at open PRs (`list_pull_requests`) and recent commits on `main` so two
  sessions do not rebuild the same thing; keep to your own branch and PR.
- **Some of those sessions are Antigravity's** (branches `antigravity/…`). How work is
  claimed and handed between the two tools, the handoff block in every PR body, and
  which of Antigravity's PRs still owe a review are in `docs/handoff.md` ("Ready, review,
  merge"). Since 2026-11-15 a green Antigravity PR merges without a Claude Code review,
  pinned to its green head; only the PRs labelled `review-owed` wait (see
  `.claude/rules/server.md`). At the start of a session, check `gh pr list --label ready-for-review --label review-owed`
  (up to three a session); a verdict's first line is `PASS #<n> head <sha>` or
  `CHANGES #<n> head <sha>`, and on a `PASS` the reviewer squash-merges the PR itself,
  pinned to that head, and confirms the deploy.

## Agents and skills in this repo

- `.claude/skills/ship/`: merge, confirm the deploy, restart the branch.
- `.claude/agents/prepush-reviewer.md`: adversarial review of the diff before a push.
- `.claude/hooks/session-start.sh`: a cloud session runs `npm install` before it
  starts, so the checks above can run at once.

Area-specific agents, skills and rules live in `.claude/rules/` (synced to `.agents/rules/`
by `npm run rules`):

- `.claude/rules/gpu.md` — `src/gpu/**`, `src/sim/**`: physics writes/rendering reads, no ceremony in the frame, `SHOUTING_CASE` constants, `PW_WEBGPU=1`, `look`, `watch`, `preset-auditor`
- `.claude/rules/checks.md` — `scripts/**`, `scripts/checks.json`: check rules, `check-skeptic`, `Check changes:`, `panel` grep, cloud vs Mac verification table
- `.claude/rules/ci.md` — `.github/**`, `scripts/checks.json`, `scripts/reach.mjs`, `scripts/deploygate.sh`: `checks.yml`, `deploy.yml`, Mac runner, `steward`
- `.claude/rules/plan.md` — `PLAN.md`, `docs/plan/**`: reading and updating the plan, `planarchive.mjs`, `planmove.mjs`
- `.claude/rules/phone.md` — `src/components/phone/**`: shares/never forks, `npm run phone`
- `.claude/rules/desks-settings.md` — `src/components/desk/**`, `src/components/settings/**`, `src/types.ts`: desks never call GPU code, `panel`, `desk`, `setting-auditor`
- `.claude/rules/server.md` — `server/**`: accounts/keys/`tierGates`, `review-owed`, `crash-triage`
