# CI

Moved out of `CLAUDE.md` (PLAN 19ai-1) because `CLAUDE.md` is loaded on every step of
every session; read this when a PR's checks or a deploy need explaining.

`.github/workflows/checks.yml`, on every PR and called by `deploy.yml` before a
deploy:

- **Measure** (ubuntu, seven parts side by side, 6–21 min each): typecheck, every script
  parsing, the workflows linted (`actionlint`), the shaders compiling on SwiftShader, and
  the node harnesses. A PR whose diff is only check scripts, manifest entries, the npm
  scripts checks run and documents runs only the Measure checks it reaches (PLAN 19k-4;
  `always` entries in `scripts/checks.json` hold the rest), and the deploy never takes
  such a run as proof of a whole tree.
- Which checks each Measure part and Mac shard runs is `scripts/checks.json`; each job's
  one `The checks` step runs its shard's list (`scripts/checks.mjs --ci`), each check in a
  `Run <command>` log group, a red one an error annotation with its name and FAIL lines,
  the job summary a table of every check's time.
- **Check changes named** (`scripts/checkguard.mjs`, under `Measure`): a PR that moves a
  check's bar or input names each change in its body under `Check changes:`, or is red.
  Re-run the failed jobs after editing the body; no push is needed.
- **What the change reaches** (`scripts/reach.mjs`): a PR that changes only Markdown,
  `.claude/`, `ios/`, `desktop/`, a workflow that never runs a Mac shard or the scripts
  that check the workflows (`closedruns`, `macqueue`, `deploygate`) skips the
  Mac shards (Measure still runs), and the deploy gate never trusts such a run. A PR
  whose Mac-reaching change is only check scripts, manifest entries or the npm scripts
  checks run runs only those checks' shards (PLAN 19k).
- **WebGPU (macOS)**: the lab and app checks on Metal, sharded into parallel
  jobs; the job named exactly `WebGPU (macOS)` is green only when every shard is, or when `reach` skipped them all.
- A deploy skips the checks when main's new tree is the exact tree its PR's
  `Checks` run passed on (the PR's head contained main when it merged;
  `scripts/deploygate.sh`). Since 2026-10-04 (the owner's choice) it also skips
  just the Mac shards, running Measure, when the PR's green run tested an older
  main and the site files the PR changed (src/, public/, index.html, the build
  config, package.json beyond its scripts) are not ones main changed since, and
  no deploy since went red. Otherwise the deploy runs them in full. And when no
  file the site is built from differs from the commit that is live (a docs, check
  or workflow merge; PLAN.md 19j), the deploy checks and publishes nothing, green in
  seconds. A run started by hand always checks and deploys.
- **The owner's Mac** takes a deploy's Mac shards when it is online and idle (a probe job
  in `deploy.yml` asks first; the runner's label is `owner-mac`), otherwise they go to
  GitHub's macOS machines as before. Never a pull request's run: the runner's job-started
  hook refuses all but `deploy.yml` on main. A shard stalled on a sleeping Mac moves to
  GitHub's after 15 minutes (`Watchdog`); by hand, **Re-run all jobs**, never failed jobs.
  Setup, pausing it for a show, and what a job there can reach: `docs/mac-runner.md`
  (PLAN.md 19ah).
- Superseded PR runs are cancelled, and so are a PR's runs still queued or going
  when it merges or closes (`closed.yml`). `gallery.yml` (every preset
  photographed), `controls.yml` (every control measured), `pixels.yml` (every
  look at a laptop's size, one to one, with the cell's lattice measured) and
  `film.yml` (every look filmed and measured against real shows: swells, calm,
  black, sync by section) run by hand; the first three also on a PR labelled
  `gallery`, `controls` or `pixels`, which a session can add.

When CI is red, use the `steward` skill.
