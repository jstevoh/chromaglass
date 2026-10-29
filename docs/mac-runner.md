# The owner's Mac as a runner for main's deploys (PLAN.md 19ah)

A deploy whose change reaches the GPU runs five Mac shards (`scripts/checks.json`
`.shards.mac`). On GitHub's macOS machines they wait in a queue first: over the 14 days to
2026-10-28, the 13 deploys that ran them waited a mean 50 minutes per shard (80 for the
slowest), for about 17 minutes of work each, and took 124 minutes from push to live against
17 for a deploy without them. The owner's Mac runs the same shards with no queue, one after
another, so a deploy is live in about the shards' summed work (about 75 minutes) when the
Mac is free, and on GitHub's machines as before when it is not.

## What runs where

- **Only `main`'s deploys.** `checks.yml` sends a shard to the label `owner-mac` only when
  the run is not a pull request's and the deploy listed that shard. A pull request's run,
  a fork's included, always asks for `macos-15`.
- **The runner refuses everything else itself.** Which runner a job asks for is up to the
  workflow, and any branch pushed here can carry a workflow of its own that asks for
  `owner-mac`. So before every job the runner runs a job-started hook
  (`scripts/macrunner-hook.sh`, installed by the setup script as
  `~/.chromaglass-runner/job-started.sh` and named in `~/actions-runner/.env`), which fails
  the job before its first step unless it is `deploy.yml` on `main`, started by a push or
  by hand. A `pull_request_target`, `workflow_run` or scheduled run also has `main` as its
  ref, hence the event as well. `bash scripts/macrunner-hook.sh --selftest` runs it
  against each of those. The hook lives outside the runner's folder so neither a job nor a
  runner update can rewrite it. As well, pull requests from every outside contributor wait
  for the owner's approval before anything runs (Settings → Actions → General; the setup
  script sets it): a fork's pull request brings its own workflow too.
- **A probe decides, before the shards queue.** A job that asks for a self-hosted label
  waits up to a day for it, and the queue counts toward no timeout, so a deploy cannot
  simply try the Mac and fall back. `deploy.yml`'s job `Is the owner's Mac free` asks
  GitHub's API for a runner labelled `owner-mac` that is online and idle
  (`scripts/macrunner.mjs`) and lists the shards it may take; with none, or no token, or
  any error, it lists none and every shard goes to GitHub as before.
- **Its token** is `MAC_RUNNER_PROBE`, a fine-grained token for this repository with
  Administration: Read-only (listing runners needs it; the workflow's own token cannot),
  kept in the `mac-runner` environment, which only `main` may use.
- **How many shards** the Mac takes is the repository variable `OWNER_MAC_SHARDS` (a
  count, from the first; unset is all five). Set it lower to keep the Mac's share short
  and leave the rest to GitHub's queue.
- **Ports.** The harnesses listen on fixed ports. On the Mac, the shard's first step
  (`scripts/macports.sh`) waits up to ten minutes for those ports to be free of another
  session's run and then fails with the process that holds them.
- **A watchdog, for a Mac that sleeps after the probe said free.** The shards would wait for
  it, and every deploy behind them. `deploy.yml`'s `Watchdog` job (`scripts/macwatch.mjs`)
  reads the run's jobs; when a shard has been queued for the owner's Mac for 15 minutes with
  none running, it starts `deploy.yml` again with `hosted` set (every shard on GitHub's
  Macs) and cancels the stalled run, which the new one replaces in the queue.

## Setting it up (at the Mac, once)

```bash
bash scripts/macrunner-setup.sh
```

It sets the approval policy, downloads GitHub's runner into `~/actions-runner` (checked
against the release's checksum), registers it with the repository as `owner-mac`, installs
the job-started hook (run it from an up-to-date `main`: the hook is copied from the
checkout; run it again after a change to the hook), starts
it as a LaunchAgent (as the owner, not root, so Chromium has the GPU), makes the
`mac-runner` environment and asks for the probe's token at a hidden prompt. Each step is
skipped when already done. The last line is what a deploy would do now.

Keep the Mac awake on power (System Settings → Energy: "Prevent automatic sleeping when
the display is off"). A Mac that sleeps after the probe said free costs the watchdog's 15
minutes and then a GitHub queue. To move a stalled deploy sooner by hand: Cancel workflow,
then **Re-run all jobs** (the probe asks again) or Run workflow with `hosted` ticked.
Never **Re-run failed jobs**: it keeps the probe's old answer and sends the shards to the
sleeping Mac again.

## For a show, or anything else that wants the GPU

```bash
~/actions-runner/svc.sh stop
```

and `~/actions-runner/svc.sh start` afterwards. A stopped runner is offline to the probe,
so deploys go to GitHub. To remove it for good: `svc.sh uninstall`, then
`./config.sh remove --token <token>` from the repository's Settings → Actions → Runners.

## What a job on the Mac can reach

A job runs as the owner's user, so it can read what that user can: signing keys, `gh`'s
sign-in, the home folder. Only `main`'s own workflow runs there (above), and `main` takes
only merged pull requests, so what runs is what was reviewed. A separate macOS user for
the runner would take that away at the cost of a second login session for the GPU (PLAN
19ah-2).

## Measuring it

```bash
GH_TOKEN=$(gh auth token) npm run macqueue -- --hours 168
```

prints, beside the hosted queue, a deploy section: per deploy, where its shards ran
(GitHub's, the owner's, both), the shards' wait and span, and push to finish.
