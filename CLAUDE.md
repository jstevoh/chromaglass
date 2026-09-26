# ChromaGlass: working here

A liquid light show: a WebGPU fluid solver (`src/gpu/`, shaders in `src/gpu/wgsl/`)
drawn as a projected plate, played from a Perform desk, built on a Design desk,
driven by sound. Live at Firebase Hosting; `main` deploys on every merge.

Read `docs/roadmap.md` (engine) and `PLAN.md` (the plate's running order) before
starting anything that is not a bug fix. `docs/judging.md` lists what needs the
owner's eyes on a real GPU.

## How work is done here

- **Every claim has a check.** A fix comes with the `npm run …` script that
  measures it, printed numbers before and after in the commit message. A check
  asserts the *feature*, not a moment of the plate: see the long comments in
  `scripts/qa.mjs` for how many "flakes" were a check measuring the wrong thing.
- **Never loosen, skip or delete a check to get green.** Find why it is red.
- **Comments explain why, at length, in prose** (see any file in `src/gpu/`).
  Match that: what was reported, what was measured, why this and not the
  obvious thing. Short code, long reasons.
- **Commit messages** say what was wrong, what changed and what it measured.
  No model names in commits, PRs or code.

## What can be verified where

| Where | Can verify | Cannot |
|---|---|---|
| A cloud session (no GPU; Chromium with SwiftShader) | `npm run lint`, `wgsl`, the node harnesses (`plate`, `desk`, `panel`, `pops`, `setlist`, `music`, `liquids`, …), the lab (`physics`, `straw`, `microscope`, `particles`, `derive`) and DOM/layout checks in a browser | Anything that reads the **app's** frames: the full app on software WebGPU returns zero readbacks, so `qa`, `bubbles`, `tools`, `magnet`, `mirror`, `gallery`, `moving` fail or pass vacuously here |
| CI, macOS runner (Metal) | Everything | — |
| The owner's machine | How it looks at 60 fps | — |

`PW_WEBGPU=1` gives a harness software WebGPU (`scripts/chromium.mjs`), which is
enough for the lab, not for the app. For pictures of a change, use the `look`
skill: the lab renders the real plate shader on a deterministic plate.

## Which checks for which files

| You touched | Run before pushing |
|---|---|
| anything | `npm run lint` (typecheck) |
| `src/gpu/wgsl/*` | `npm run wgsl`, then `physics`, `microscope`, `straw`, `derive` as relevant (`physics` takes over five minutes in a cloud session) |
| `src/gpu/wgsl/plate.ts`, bubbles, `src/lib/bubbles.ts`, `bubbleDye.ts` | `pops`, `straw`, and a `look` render |
| `src/lib/lookFade.ts`, presets, set list | `desk`, `setlist`, `panel` |
| settings, panels, desks (`src/components/**`) | `panel`, `desk`; layout at 1440/1280/1024 in a browser |
| sound (`src/lib/plateDrone.ts`, `SoundPanel`, `musicLibrary`) | `shelf`, `music` |
| `src/lib/crashLog.ts`, `CrashReportButton.tsx` | `crash` (in a cloud session its device-loss, stall and screenshot checks skip) |
| `server/report-worker.js`, `wrangler.report.toml` | `report-worker` |
| `scripts/watch.mjs` | `npm run watch -- --selftest`; `moving` and `gig` import it (Mac only) |
| a new or changed setting | `panel`, `desk`, and the `setting-auditor` agent |
| a new or changed check in `scripts/` | that check, and the `check-skeptic` agent |
| `scripts/qa.mjs` | `node --check scripts/qa.mjs`; read every new `page.evaluate` for a missing `await` (`window.__cgFrame` returns a promise) |

The `panel` check greps the source for `npm run <name>` and fails if `<name>` is
not a script. Write "`npm run qa`" in a comment, never "npm run qa:".

## CI

`.github/workflows/checks.yml`, on every PR and called by `deploy.yml` before a
deploy:

- **Measure** (ubuntu, ~1 min): typecheck and the node harnesses.
- **WebGPU (macOS)**: the lab and app checks on Metal, sharded into parallel
  jobs; the job named exactly `WebGPU (macOS)` is green only when every shard is.
- Superseded PR runs are cancelled. `gallery.yml` (every preset photographed)
  and `controls.yml` (every control measured) run by hand.

When CI is red, use the `steward` skill.

## Branches, PRs, deploys

- One PR per piece of work, a draft until CI is green. Squash-merge.
- After a PR merges, a branch that carries on is restarted from `main`
  (`git fetch origin main && git checkout -B <branch> origin/main`), never stacked
  on merged history.
- A merge to `main` deploys (`deploy.yml`). Confirm the deploy run finished green
  and report the time in **Pacific time**, not UTC.
- **More than one session works on this repo at once.** Before starting, look
  at open PRs (`list_pull_requests`) and recent commits on `main` so two
  sessions do not rebuild the same thing; keep to your own branch and PR.

## Agents and skills in this repo

- `.claude/skills/steward/`: drive a red PR to green.
- `.claude/skills/look/`: render before/after pictures of a visual change in the lab.
- `.claude/skills/watch/`: watch a video (a reference link, a recording of the app) as
  contact sheets, a slit-scan timeline and motion, colour and sound numbers (`npm run watch`).
- `.claude/agents/video-watcher.md`: watch long or several videos in its own context and
  return an account with numbers, or the app compared against a reference.
- `.claude/skills/ship/`: merge, confirm the deploy, restart the branch.
- `.claude/agents/prepush-reviewer.md`: adversarial review of the diff before a push.
- `.claude/agents/preset-auditor.md`: photograph every preset and flag the broken ones.
- `.claude/skills/crash-triage/`: turn a crash report or the report Worker's digest
  into a cause, a reproduction and a fix (`docs/crash-plan.md`).
- `.claude/agents/check-skeptic.md`: find the ways a new or changed check can pass
  while measuring nothing (the rules in `docs/roadmap.md`).
- `.claude/agents/setting-auditor.md`: hold a new setting to `PLAN.md`'s operating
  rules (a default that keeps today's look; MIDI, the desks and the phone).
- `.claude/hooks/session-start.sh`: a cloud session runs `npm install` before it
  starts, so the checks above can run at once.
