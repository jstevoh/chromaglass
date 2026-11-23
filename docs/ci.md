# CI

Moved out of `CLAUDE.md` (PLAN 19ai-1) because `CLAUDE.md` is loaded on every step of
every session; read this when a PR's checks or a deploy need explaining.

`.github/workflows/checks.yml`, on every PR and called by `deploy.yml` before a
deploy.

**A pull request runs only the fast, deterministic checks** (PLAN.md 19ak-20, the
owner's call of 2026-11-22, after 52 of 93 PR runs in the week to 11-21 went red on
browser, lab and Mac lines that time a page or a plate on a slow runner): the Measure
parts `shards.pr` names in `scripts/checks.json` (`logic` and `sound`: the typecheck,
the site's build, the scripts parsing, the workflows linted and the node harnesses),
and no Mac shard. Every other Measure part (Chromium, the lab on SwiftShader) and every
Mac shard runs on **main's deploy only**, and the deploy gate never trusts a PR's run
for them, so a blank or broken plate still stops the deploy. A GPU regression is found
on main, not on its PR: the steward of main's deploys fixes it there. Where a bullet
below says what a PR's run does, it is history kept for its numbers.

**And the deploy does not wait for them** (PLAN.md 19ak-21, the owner, 2026-11-22: "I
would much rather release shit that crashes and deal with a couple bugs here and there.
Let's get shit live quicker."). `deploy.yml`'s `Build and deploy` job needs only the
gate (`verified`, a few seconds): a merge is live in minutes, built from the tree its PR
ran the fast checks on. The `checks` job (every Measure part, every Mac shard) runs
beside it on the same tree as a report; its red turns the run red and `hold.yml`'s
`Main not held red` status red, but the site is already up, so a red there is a live
bug to fix. Only the deploy job holds the `firebase-hosting-live` group; the checks hold
`main-checks-<ref>` and a newer push cancels them. A broken build still publishes
nothing (the build step fails first).

- **Measure** (ubuntu, eight parts side by side, 6–21 min each; GitHub's runners come in
  speed tiers about 2x apart, so a part sized on a fast one can meet its 25 on a slow one,
  PLAN 19k-11): typecheck, every script
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
- **What the change reaches** (`scripts/reach.mjs`): before 19ak-20, a PR that changed only Markdown,
  `.claude/`, `ios/`, `desktop/`, a workflow that never runs a Mac shard or the scripts
  that check the workflows (`closedruns`, `macqueue`, `deploygate`) skips the
  Mac shards (Measure still runs), and the deploy gate never trusts such a run. A PR
  whose Mac-reaching change is only check scripts, manifest entries or the npm scripts
  checks run runs only those checks' shards (PLAN 19k).
- **The site's files on the Mac** (PLAN.md 19ak-2, gone with 19ak-20): a PR that changed `src/`,
  `public/` or `index.html` runs the Mac checks that read them, not all 96: the 28 that
  open or build the app always, and of the 68 lab checks those whose bundles import the
  file (`checkReads` in `scripts/checks.mjs`, esbuild's import graph; the reach job
  installs esbuild alone). Measure still runs in full. Such a run is "partial" to the
  deploy gate, so main's deploy runs every shard.
- **Quarantine** (PLAN.md 19ak-1): a check's entry in `scripts/checks.json` can list
  known-flaky FAIL lines under `quarantine`, each with its plan id and an end date at
  most 21 days out. Until then, on a pull request, a check red only on those lines is a
  warning (⚠ in the job summary) and its job stays green; any other FAIL line, a
  timeout, a crash, a check that stopped before its closing count, or the end date
  passing, and it blocks as before. Until 2026-12-06 main's deploys honour the same
  entries (the owner's choice, PLAN.md 19ak-18: four deploys in a row were red only on
  known flakes and the site stopped updating); from that day, set by
  `MAIN_QUARANTINE_UNTIL` in `scripts/checks.mjs`, main's deploy holds every line to its
  bar again, and a run outside CI always does. Since 19ak-21 a deploy publishes without
  waiting for its checks, so on main an entry now only keeps a known flake from turning
  the after-the-fact report red, which is what makes a red report there mean a live bug. Bars never move for it, and adding one or moving its end later is a check change the PR
  names (`checkguard`). A red run on a line the PR cannot move is re-run by its
  **failed jobs** only, never all jobs.
  One exception to "main's deploy holds every line", the owner's choice (PLAN.md
  19ak-10, 2026-11-21): a deploy that trusts a PR's green run (`deploygate.sh` rules 4
  and 5) trusts it even when a quarantine held it green, so it does not run the
  quarantined line itself; a deploy that runs its own checks holds it from 2026-12-06.
- **The Mac waits for the typecheck** (`Compiles, before the Mac`, PLAN.md 19ak-3c):
  `tsc --noEmit` on ubuntu beside `reach`; a PR that does not compile takes no Mac.
- **A whole run re-run skipped the shards that passed** (PLAN.md 19ak-3a, gone with 19ak-20): on attempt 2
  or later of a PR run, `reach` drops the Mac shards an earlier attempt of the same run
  passed. "Re-run failed jobs" already starts only the red ones.
- **WebGPU (macOS)**: the lab and app checks on Metal, sharded into parallel
  jobs; the job named exactly `WebGPU (macOS)` is green only when every shard is, or when `reach` skipped them all.
- Since 19ak-20 no PR run is whole, so rules 4 and 5 below never hold and every
  deploy that builds runs its own checks in full. Before it: a deploy skipped the checks when main's new tree is the exact tree its PR's
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
- **One film at a time on the owner's Mac (the film queue)** (`scripts/maclock.mjs`, PLAN.md
  19ak-23): `launchChromium` (`scripts/chromium.mjs`), `npm run desktop`, and the standalone
  browser scripts (`caption.mjs`, `codecblip.mjs`, `detail.mjs`, `webgpu-smoke.mjs`) all
  acquire `~/cg-scratch/film.lock` in a FIFO queue (`~/cg-scratch/film.queue/`) before
  launching Chromium or Electron, after waiting on any deploy mark (`macdeploy.mjs`), and
  release on exit. For an ad-hoc Playwright script outside the repo, wrap it with
  `npm run maclock -- run -- <cmd>` (or copy `scripts/maclock.mjs` alone to
  `~/cg-scratch/bin`); check who holds or waits for the Mac with `npm run maclock -- status`
  (`--json` for scripts). Stale recovery: a lock whose `pid:` has exited is freed at once,
  and any lock older than its `timeout:` plus 60 s (or mtime for a hand-written one-line lock)
  is freed and logged to `~/cg-scratch/film-lock.log`, using an atomic rename-and-compare so
  two waiters never delete a fresh third-party lock. Inside CI (`GITHUB_ACTIONS`) and off
  macOS it is a no-op unless `CG_FILM_LOCK` is set; `scripts/macbusy.sh` still checks
  `node scripts/maclock.mjs status --json` so a shard refuses the Mac and moves to GitHub's
  Macs while a live film holds it. Variables: `CG_FILM_LOCK` (override lock path),
  `CG_FILM_LOCK_TIMEOUT_SEC` (default `5400`), `CG_FILM_LOCK_HELD` (set to the holder pid
  so nested child launches do not self-deadlock).
- `ready.yml` labels an Antigravity PR (or one labelled `review-owed`)
  `ready-for-review` and comments `READY #<n> <item> head <sha>` when `Checks` goes
  green on its current head, and takes the label off on the next push or a red run
  (`docs/handoff.md`, "Ready, review, merge"; PLAN.md 19al).
- **Main held red** (`hold.yml`, `scripts/mainhold.mjs`, PLAN.md 19am): while the same
  job (a Mac shard, a Measure part, the build; not the two summary jobs) is red at its
  newest two results on main, counting only the deploys that ran it (cancelled ones, a
  docs-only deploy and one with no Mac shards are left out for the jobs they did not
  run), every open PR carries a red commit status `Main not held red`, and a PR labelled
  `fixes-main` a green one. The first deploy that runs that job green, or whose PR passed
  its exact tree, lifts it. It is posted when a deploy finishes and when a PR is opened,
  pushed, labelled or retargeted. `npm run mainhold` says whether main is held;
  `-- --history 40` replays the rule over the last 40 deploys.
  A 5xx from GitHub is retried four times; a deploy whose jobs still cannot be read is
  left out with a log line, so the run posts on every PR rather than none.
- Superseded PR runs are cancelled, and so are a PR's runs still queued or going
  when it merges or closes (`closed.yml`). `gallery.yml` (every preset
  photographed), `controls.yml` (every control measured), `pixels.yml` (every
  look at a laptop's size, one to one, with the cell's lattice measured) and
  `film.yml` (every look filmed and measured against real shows: swells, calm,
  black, sync by section) run by hand; the first three also on a PR labelled
  `gallery`, `controls` or `pixels`, which a session can add.

When CI is red, use the `steward` skill.
