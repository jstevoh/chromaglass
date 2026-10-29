# ChromaGlass: working here

A liquid light show: a WebGPU fluid solver (`src/gpu/`, shaders in `src/gpu/wgsl/`)
drawn as a projected plate, played from a Perform desk, built on a Design desk,
driven by sound. Live at Firebase Hosting; `main` deploys on every merge.

Before starting anything that is not a bug fix, read `PLAN.md`'s **Order of work**
(its first section: which step is next, in which lane) and then only the section your
step names: `grep -n '^##' PLAN.md` for the map, then `sed -n` the section. Not the
whole file: `PLAN.md` is about 200k tokens (810 KB, 2026-10-28), more than a session's
whole window, and see "Keeping a session small" for why that matters. What shipped is in `docs/plan-shipped.md`, under the same section numbers:
`PLAN.md` keeps a one-line stub per shipped item and only the open work, so read the
archive only when an open item needs the history behind it. When an item ships, move its
story there in the same PR and leave the stub. The engine's own order is in
`docs/roadmap.md`.
`docs/judging.md` lists what needs the owner's eyes on a real GPU.

## Where things live

Before any code, read this table and the folder's `README.md` (`src/gpu`, `src/gpu/wgsl`,
`src/lib`, `src/sim`, `src/hooks`, `src/components/desk`, `src/components/phone`, `server`,
`scripts`, `desktop`). A file over 40 KB is never opened whole: grep for the symbol,
then read about 80 lines around it. A search across many files goes to an Explore
agent that returns paths and line numbers, never file bodies. Why, and the plan for
the files that are still too big: `docs/architecture.md`.

| Domain | Owns | Start at |
|---|---|---|
| Fluid physics | the fields and how they move | `src/gpu/fluid.ts` (the solver), `src/gpu/wgsl/` (its passes), `src/sim/` (`FluidSimulation`: each layer's seeding and pours, handed to the solver; the frame's shapes in `frameTypes.ts`), `lib/bubbles`, `beads`, `soapFilm`, `turntable` |
| Rendering | how the fields are drawn and projected | `src/gpu/wgsl/plate.ts`, `src/gpu/plate.ts`, `src/gpu/output.ts`, `lib/outputConfig`, `lib/plateSources`, `lib/mixer` |
| Sound | readings from the audio, and the cords that carry them | `hooks/useAudioAnalyzer.ts`, `lib/audioFeatures`, `lib/earClock`, `lib/sceneMap` (cords), `lib/areaCords`, `lib/plateDrone` |
| Show | looks, set lists, MIDI, the frame loop | `src/presets.ts`, `lib/lookFade`, `lib/setList`, `lib/midi`, the frame loop in `LiquidVisualizer.tsx` |
| Desks | settings and panels | `App.tsx` (owns app state), `components/desk/`, `SettingsPanel.tsx` |
| Phone | the phone and iPad layout | `components/phone/`, `lib/phone`, the touch handlers in `LiquidVisualizer.tsx` |
| Accounts and licence | sign-in, keys, tiers, the Workers | `lib/firebaseAuth`, `lib/accountLicense`, `lib/licenseKey`, `lib/tierGates`, `server/` |
| Mac app | the Electron shell, projector, updates | `desktop/`, `lib/macApp`, `hooks/useProjector`, `hooks/useCastSession` |
| iPhone app and remote | the Capacitor app, the laptop link | `ios/`, `lib/appLink`, `lib/remoteProtocol`, `components/RemoteControl.tsx`, `server/remote-server.js` |
| Checks | one script per check | `scripts/checks.json`, `scripts/<name>.mjs`, the app's `window.chromaglass*` and `__cg*` hooks, declared in `src/lib/checkHooks.ts` |

## How work is done here

- **`README.md` is the front page, short.** What a feature or control does is written in
  `docs/guide.md` (the long reference), and `docs/README.md` maps the other docs. Scratch
  scripts live in `scratch/` (git-ignored), never in the root.
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

## Boundaries

- **Edges are typed and written down.** Code reaches another domain only through what
  that domain exports, and each export's types say what it reads and writes. A PR that
  changes an export updates that folder's README in the same PR.
- **Physics writes, rendering reads.** The plate shader draws the solver's fields. It
  never fakes a motion, mixing or surface effect the solver should produce (the
  real-physics rule). Sound produces readings and moves the plate only through cords and
  preset patches. Desks change settings and never call GPU code. Only the accounts code
  touches keys and tokens; everything else asks `tierGates`.
- **One owner per piece of state.** App state lives in `App.tsx` and the plate's live
  state in the visualizer's refs; pass values and callbacks down. `window` carries only
  the checks' hooks and the Mac and iPhone bridges, declared in `src/lib/checkHooks.ts`
  (PLAN.md 19ai-4). A module-level `let` is for a true singleton (auth, crash log, licence) and
  says so in the file's header.
- **No ceremony in the frame.** In the frame loop and the solver, use plain functions
  over typed arrays and refs. Add no new per-frame objects, classes or wrappers: a frame
  is 16 ms, and allocation shows up as stutter.
- **The phone shares, never forks.** Phone components call the same lib functions and
  contracts as the desks.

## Size budgets

- A new file stays under 40 KB (about 10k tokens). New code for a file already over
  40 KB goes in a new module beside it, which the big file imports. `npm run sizes`
  holds this (PLAN.md 19ai-5).
- Changing something inside the visualizer's frame loop, first move that piece to its
  own module (a function taking the frame's state, no per-frame allocation) in its own
  commit, then change it (19ai-10).
- A split is a pure move: its own commit, no behaviour change, green on the checks the
  moved code reaches, with bytes before and after in the message. Start one when no open
  PR touches that file, and put an old-lines-to-new-file table in the PR body so a
  branch caught mid-move can re-apply its edit.

## Planning a change

The PR body opens with the plan: the domains it touches, the exports it changes, and the
checks that prove it. Then build; merging on green without asking still stands. Ask the
owner first only when an export between two domains changes shape, or when one of the
big splits in `docs/architecture.md` starts.

## What can be verified where

| Where | Can verify | Cannot |
|---|---|---|
| A cloud session (no GPU; Chromium with SwiftShader) | `npm run lint`, `wgsl`, the node harnesses (`plate`, `desk`, `panel`, `pops`, `setlist`, `music`, `liquids`, …), the lab (`physics`, `straw`, `microscope`, `ferrolook`, `maze`, `spikes`, `fingers`, `ferrohands`, `domes`, `ferrodye`, `ferropour`, `regrid`, `particles`, `derive`, `mixer`, `disc`), the Mac app's `desktop` (under xvfb, all but its lit plate and hidden-window lines), `codecblip` (the recorder's encoder, by hand) and DOM/layout checks in a browser | The **app's** numbers: with `PW_WEBGPU=1` the app runs headed under Xvfb and its frames read back (PLAN.md 19l), but at about 0.4 solver steps a second against Metal's sixty, so `tools`, `magnet`, `mirror`, `bottles`, `take`, `ferro`, `ferrodrift`, `finger`, `bubbles`, `depth`, `handpour`, `kickbubbles` run their logic on a twentieth of the steps (`settlePlate` in `scripts/frame.mjs`) and not their magnitudes; `qa`, `gallery`, `moving`, `film` are still the Mac's |
| CI, macOS runner (Metal) | Everything | — |
| The owner's machine | How it looks at 60 fps | — |

`PW_WEBGPU=1` gives a harness software WebGPU (`scripts/chromium.mjs`): enough for the lab,
and for the app's logic at a crawl. For pictures of a change, use the `look`
skill: the lab renders the real plate shader on a deterministic plate.

## Which checks for which files

`npm run quick` runs, side by side, the checks your diff from `origin/main` reaches and a
cloud session can run (`-- --dry` says which and why). The full table, with what it
cannot see (agents, pictures, the Mac), is `docs/checks-map.md`: grep it for the paths
you touched. Three rows every session needs:

- a new or changed setting: `panel`, `desk`, and the `setting-auditor` agent;
- a new or changed check: that check and the `check-skeptic` agent; a new one is an entry
  in `scripts/checks.json`, never a step in `checks.yml`;
- a check's bar or input, or a SHOUTING_CASE number in `src/gpu/`: name each under
  `Check changes:` in the PR body (`docs/handoff.md`), or `Measure` is red.

The `panel` check greps the source for `npm run <name>` and fails if `<name>` is
not a script. Write "`npm run qa`" in a comment, never "npm run qa:".

## CI

`checks.yml` runs on every PR and before every deploy: `Measure` (ubuntu, five parts)
and `WebGPU (macOS)` (Metal, sharded), both required on `main`. What each part runs is
`scripts/checks.json`; what skips the Mac is `scripts/reach.mjs`; when a deploy trusts a
PR's run is `scripts/deploygate.sh`. The long account is `docs/ci.md`. When CI is red,
use the `steward` skill.

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
- **Some of those sessions are Antigravity's** (branches `antigravity/…`). How work is
  claimed and handed between the two tools, the handoff block in every PR body, and
  the light review pass a Claude Code session owes Antigravity's PRs (the
  `review-owed` label, about one per session) are in `docs/handoff.md`. Check that
  label at the start of a session.

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
