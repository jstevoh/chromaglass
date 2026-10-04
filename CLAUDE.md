# ChromaGlass: working here

A liquid light show: a WebGPU fluid solver (`src/gpu/`, shaders in `src/gpu/wgsl/`)
drawn as a projected plate, played from a Perform desk, built on a Design desk,
driven by sound. Live at Firebase Hosting; `main` deploys on every merge.

Before starting anything that is not a bug fix, read the part of `docs/roadmap.md`
(engine) and `PLAN.md` (the plate's running order) that the work touches: `grep -n
'^##' PLAN.md` for the map, then `sed -n` the section. Not the whole file: `PLAN.md`
is about 38k tokens, and see "Keeping a session small" for why that matters.
`docs/judging.md` lists what needs the owner's eyes on a real GPU.

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
- **The repository is public.** Files, commits, PRs and comments say "the owner",
  never a name, email, machine name or account figure. What is private to the owner
  goes in the project's memory or its shared files, which only the owner can see.

## Keeping a session small

A session sends its whole context again on every step, so what it read hours ago it
pays for on every tool call since. Measured 2026-09-27 on the busiest threads: about
70% of their usage was that re-reading, at 200–380k tokens of context each.

- Read the section, not the file. Pipe long output (`npm run check`, a `git diff` of
  `PLAN.md`, job logs) through `tail` or `grep FAIL`; a long log or a wide search
  goes to a subagent that returns only the lines that matter.
- Open the one picture the question needs, not every contact sheet a run wrote.
- Waiting on CI, the PR subscription wakes the session when the suite completes. Set
  one fallback check-in, not a chain of half-hourly ones: each wake re-reads the whole
  context even when all it finds is "still running".
- One thread per PR (the owner, 2026-09-27). When a thread's PR has merged, its next
  piece starts in a new thread, not this one: say what it is in the closing reply.

## What can be verified where

| Where | Can verify | Cannot |
|---|---|---|
| A cloud session (no GPU; Chromium with SwiftShader) | `npm run lint`, `wgsl`, the node harnesses (`plate`, `desk`, `panel`, `pops`, `setlist`, `music`, `liquids`, …), the lab (`physics`, `straw`, `microscope`, `ferrolook`, `maze`, `spikes`, `fingers`, `ferrohands`, `domes`, `ferrodye`, `ferropour`, `particles`, `derive`, `mixer`), the Mac app's `desktop` (under xvfb, all but its lit plate and hidden-window lines), `codecblip` (the recorder's encoder, by hand) and DOM/layout checks in a browser | Anything that reads the **app's** frames: the full app on software WebGPU returns zero readbacks, so `qa`, `bubbles`, `tools`, `magnet`, `mirror`, `gallery`, `moving`, `film` fail or pass vacuously here |
| CI, macOS runner (Metal) | Everything | — |
| The owner's machine | How it looks at 60 fps | — |

`PW_WEBGPU=1` gives a harness software WebGPU (`scripts/chromium.mjs`), which is
enough for the lab, not for the app. For pictures of a change, use the `look`
skill: the lab renders the real plate shader on a deterministic plate.

## Which checks for which files

| You touched | Run before pushing |
|---|---|
| anything | `npm run lint` (typecheck) |
| `src/gpu/wgsl/*` | `npm run wgsl`, then `physics`, `maze`, `spikes`, `fingers`, `ferrohands`, `domes`, `ferrodye`, `microscope`, `straw`, `derive`, `grating` (anything in the dye's step) as relevant (`physics` takes over five minutes in a cloud session) |
| `src/gpu/wgsl/plate.ts`, bubbles, `src/lib/bubbles.ts`, `bubbleDye.ts` | `pops`, `straw`, `ferrolook` (the ferrofluid's drawing), `mixer` (the stack's order and grades), and a `look` render |
| `src/lib/lookFade.ts`, presets, set list | `desk`, `setlist`, `panel` |
| settings, panels, desks (`src/components/**`) | `panel`, `desk`; layout at 1440/1280/1024 in a browser |
| the phone (`src/components/phone/**`, `src/lib/phone.ts`, the touch handlers in `LiquidVisualizer.tsx`) | `phone` (`PW_WEBGPU=1` for the fingers), `layout` |
| sound (`src/lib/plateDrone.ts`, `SoundPanel`, `musicLibrary`, `useAudioAnalyzer`, `lib/earClock.ts`) | `shelf`, `music`, `ears`, `renders` (what the sound re-renders, and whether the plate hears each frame's reading) |
| `src/lib/crashLog.ts`, `CrashReportButton.tsx` | `crash` (in a cloud session its device-loss, stall and screenshot checks skip) |
| `server/report-worker.js`, `wrangler.report.toml` | `report-worker` |
| `scripts/watch.mjs` | `npm run watch -- --selftest` and `codecblip`; `moving`, `gig` and `film` import it (Mac only) |
| `scripts/recorder.mjs` | `moving` and `film` record through it (Mac only; a PR touching it films three looks in `film.yml`) |
| the mixer (`src/lib/mixer.ts`, `MixerPanel.tsx`) | `mixer`, `rowfade` (the take buttons), `panel`, `phone`, `remotemix` (the remote's) |
| the projector's pass (`src/gpu/output.ts`, `src/gpu/wgsl/output.ts`, `src/lib/outputConfig.ts`, `src/lib/plateSources.ts`, `OutputPanel.tsx`) | `map`, `beams` and `mixer` (the lab, `PW_WEBGPU=1`), `phone`; `wall` on the Mac |
| the iPhone app (`ios/`, `capacitor.config.json`, `src/lib/appLink.ts`, `LaptopLink.tsx`), the remote's link (`remoteProtocol.ts`, `RemoteControl.tsx`) | `applink`, `remotemix`; the app's Xcode build runs in `ios.yml`, and on a phone by hand (`docs/judging.md` §16) |
| the Mac app (`desktop/`, `scripts/desktop.mjs`), and what it leans on: `useProjector`, `useCastSession`, `CastDisplay`, `server/remote-server.js` | `desktop` (`npm --prefix desktop install` once; `-- --packaged` after `npm --prefix desktop run pack`); `desktop.yml` checks the packed app on a Mac |
| a new or changed setting | `panel`, `desk`, and the `setting-auditor` agent |
| a new or changed check in `scripts/` | that check, and the `check-skeptic` agent |
| `.github/workflows/deploy.yml`, `scripts/deploygate.sh` | `npm run deploygate -- --history 20` (which recent merges the deploy would have trusted), `actionlint` |
| `.github/workflows/checks.yml`, `scripts/reach.mjs` | `npm run reach`, `npm run closedruns`, `actionlint`; `npm run macqueue -- --hours 24` for the Mac time before and after |
| `scripts/qa.mjs` | `node --check scripts/qa.mjs`; read every new `page.evaluate` for a missing `await` (`window.__cgFrame` returns a promise) |

The `panel` check greps the source for `npm run <name>` and fails if `<name>` is
not a script. Write "`npm run qa`" in a comment, never "npm run qa:".

## CI

`.github/workflows/checks.yml`, on every PR and called by `deploy.yml` before a
deploy:

- **Measure** (ubuntu, three parts side by side, ~5 min each): typecheck, every script
  parsing, the shaders compiling on SwiftShader, and the node harnesses.
- **What the change reaches** (`scripts/reach.mjs`): a PR that changes only Markdown,
  `.claude/`, `ios/`, `desktop/`, a workflow that never runs a Mac shard or the scripts
  that check the workflows (`closedruns`, `macqueue`, `deploygate`) skips the
  Mac shards (Measure still runs), and the deploy gate never trusts such a run.
- **WebGPU (macOS)**: the lab and app checks on Metal, sharded into parallel
  jobs; the job named exactly `WebGPU (macOS)` is green only when every shard is, or when `reach` skipped them all.
- A deploy skips the checks when main's new tree is the exact tree its PR's
  `Checks` run passed on (the PR's head contained main when it merged;
  `scripts/deploygate.sh`). Since 2026-10-04 (the owner's choice) it also skips
  just the Mac shards, running Measure, when the PR's green run tested an older
  main and the site files the PR changed (src/, public/, index.html, the build
  config, package.json beyond its scripts) are not ones main changed since, and
  no deploy since went red. Otherwise the deploy runs them in full.
- Superseded PR runs are cancelled, and so are a PR's runs still queued or going
  when it merges or closes (`closed.yml`). `gallery.yml` (every preset
  photographed), `controls.yml` (every control measured) and `film.yml` (every
  look filmed and measured against real shows: swells, calm, black, sync by
  section) run by hand; the first two also on a PR labelled `gallery` or
  `controls`, which a session can add.

When CI is red, use the `steward` skill.

## Branches, PRs, deploys

- One PR per piece of work, a draft until CI is green. Squash-merge.
- Every PR updates `PLAN.md`: what it shipped marked shipped, and anything found
  along the way that needs fixing or adding written in as a plan item.
- Every feature ships its phone version in the same PR.
- Merge as soon as CI is green; the owner does not need to be asked (2026-09-27).
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
