# Archive: 19. The checks, the build and the plan itself (continued)

The closed items of [`docs/plan/19-checks-build-plan-3.md`](../19-checks-build-plan-3.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- **19aa-10. `npm run tiers` raced on Measure · lab (found 2026-10-25, fixed).** The hook keeps what it was asked (`forcedStepDown`); no bar, no governor change. Story in `docs/plan-shipped.md` §19aa-10 (moved 2026-10-29, 19m-2).
- **19aa-7d. Shipped 2026-11-15: the control's compile, when one frame got through.** Main's
  deploys 832 and 839 (both on the owner's second Mac runner) went red on 1b's first two
  lines with the control pricing no compile: "0.00 s compiling ... (0 stops), 8.55 s the
  page's own". The control built its 59 on its first step (0.81 s), its page was held from
  then on (its timer on time for about 0.16 s of the next 1.72 s), one frame got through at
  2.53 s, and the frames then stopped 6.61 s with the page silent: the stop began 1.72 s
  after the builds, outside the second, and the first-use rule rightly will not vouch for a
  stop the page stood still through. A build now also sits in the first stop after it when
  that stop began under two seconds after it, the page never ran (ticks and frames no more
  than a quarter second apart) for half a second at a time between, and its timer was on
  time for half of the second before the build; read from the build: `scripts/compilestop.mjs`
  (`buildsIn`, beside startup.mjs at its ceiling), `npm run compilestop` on thirteen made-up
  openings. Not asked: whether one long task covered the stretch (the log does not print
  the control's long tasks after its first step). 839's control reads 8.33 s of compile and 0.23 s its own. Not #861 (?prepare=0
  returns before the prepare). Judge on the next deploys' `open` shard on both owner runners.
- **19aa-2. `followview`'s timing (shipped 2026-10-18).** Story in `docs/plan-shipped.md`
  §19aa-2 (moved 2026-10-29, 19m).
- **19aa-3. The API scripts never print the token (shipped 2026-10-19).** `scripts/ghapi.mjs`; `npm run ghapi`. Story in `docs/plan-shipped.md`.

## 19ab. A shard's tool fetches are bounded, and the browser is cached

- **19ab-1. A slow download no longer reads as a failing check (shipped 2026-10-24).** Story
  in `docs/plan-shipped.md` §19ab-1 (moved 2026-10-29, 19m).

## 19ac. The phone's double tap on Speed is judged on two taps landing in time

- **19ac-1. The double tap's two taps carry a finger's times (shipped 2026-10-24).** Story
  in `docs/plan-shipped.md` §19ac-1 (moved 2026-10-29, 19m).
- **19ac-4. `mirror`'s "and nowhere else" named the hand's own drop (shipped 2026-10-30).**
  Since #512 the check photographs the Perform tab's preview, a wide window on the dish
  where a cell is 0.055 of the plate tall and 0.154 wide, and a held drop reaches two cells
  up its column (0.11 of the plate, 22 to 25 against a drift of 8 to 9) where the check
  counted "round the hand" as one cell each way. Red on deploys 570, 576 and 580. The cells
  under the drop are now the ones within DROP_REACH (0.14) of the hand on the plate, read
  with `plateAt`; the bar is unchanged. Story in `docs/plan-shipped.md` §19ac-4.

## 19af. The repository's front page: a short README, the guide in docs/, a clean root (shipped 2026-10-25)

**Shipped.** Story in `docs/plan-shipped.md` §19af (moved 2026-10-29, 19m).

## 19ag. The site's security headers, and the dependencies' advisories (2026-10-28)

- **19ag-1. Shipped.** `firebase.json` sends, on every path: an **enforced**
  `Content-Security-Policy` of the four directives that cannot break a page this app serves
  (`frame-ancestors` for the site's own three names only, which the Auth iframe needs;
  `object-src 'none'`; `base-uri 'self'` … Story in `docs/plan-shipped.md` §19ag-1 (moved
  2026-10-29, 19m).

## 19ah. The owner's Mac runs main's deploy shards (2026-10-28)

- **19ah-3. Shipped (with 19ah): a shard queued for a Mac that went to sleep after the
  probe.** `deploy.yml`'s `Watchdog` (`scripts/macwatch.mjs`) starts the deploy again with
  `hosted` and cancels the stalled run after 15 minutes queued with none running. It
  counts the run finished only when the checks' `WebGPU (macOS)` job has (19ah-3a: every
  job made so far is briefly finished after `reach`, before the shards' jobs exist). Still
  open: it holds an ubuntu runner for the length of the shards (free on a public
  repository); a shorter way would be a watchdog that wakes on a schedule.

## 19ai. Smaller sessions: the separation plan (2026-10-28)

- **19ai-1. Shipped: a lighter `CLAUDE.md`.** 18,082 → 12,008 bytes loaded on every step;
  the checks table to `docs/checks-map.md`, CI to `docs/ci.md`, the domain map and the
  splits to `docs/architecture.md` (story in `docs/plan-shipped.md` §19ai-1).
- **19ai-2. Shipped: a `README.md` per folder** (`src/gpu`, `src/gpu/fluid`, `src/gpu/wgsl`,
  `src/gpu/wgsl/fluid`, `src/sim`, `src/lib`, `src/hooks`, `src/components/desk`,
  `src/components/phone`, `server`, `scripts`; `src/app` and `src/components/settings`
  came with their splits). A PR that changes a folder's exports updates its README.
- **19ai-3. Shipped.** `components/LiquidVisualizer.tsx` was 670,805 bytes, and 255 KB of it
  was module code above the component. Story in `docs/plan-shipped.md` §19ai-3 (moved
  2026-10-29, 19m).
- **19ai-4. Shipped.** `src/lib/checkHooks.ts` declares on `Window` every name the checks
  reach the app by: 44 (the plan counted 38), each with its shape, the file that sets it and
  whether it needs `?debug`. Types only; the setters keep their casts, so no setter moved.
- **19ai-4a. Shipped with 19ai-8 for App's setters** (the story in `docs/plan-shipped.md`).
  The plate's setters in `LiquidVisualizer.tsx` still cast, and drop theirs when next edited.
- **19ai-8. Shipped: `App()` into its domains' hooks** (`src/app/`, 34 hooks; `App.tsx` 372,525
  → 215,830 bytes; the story in `docs/plan-shipped.md`). A check that reads App's source as
  text reads `scripts/appSource.mjs`, App and its hooks as one text.
- **19ai-9. Shipped: the settings panel's sections into `src/components/settings/`**
  (`SettingsPanel.tsx` 201,442 → 23,916 bytes; the story in `docs/plan-shipped.md`). A check
  that reads the panel's markup as text reads `scripts/settingsSource.mjs`, the panel and
  its sections as one text.
- **19ai-5. Shipped: `npm run sizes`, a size ratchet.** Story in `docs/plan-shipped.md`
  §19ai-5 (moved 2026-10-29, 19m).
- **19ai-5c. Shipped with 19ai-3: a move carries its ceiling.** Story in
  `docs/plan-shipped.md` §19ai-5c (moved 2026-10-29, 19m).
- **19ai-5d. Shipped: a warning at 40 KB, a failure at 100 KB** (the owner's pick,
  2026-10-29). Story in `docs/plan-shipped.md` §19ai-5d (moved 2026-10-29, 19m).
- **19ai-6. Shipped:** `wgsl/fluid.ts` split into one file a pass under
  `src/gpu/wgsl/fluid/`, every kernel's text byte-identical (docs/plan-shipped.md, 19ai-6).
- **19ai-7. Shipped:** `src/gpu/fluid.ts` split into a class chain under `src/gpu/fluid/`,
  a pure move (docs/plan-shipped.md, 19ai-7).
- **19ak-1. Shipped:** known-flaky lines report and do not block, each with a plan id and
  an end date (docs/plan-shipped.md, 19ak).
- **19ak-2. Shipped:** a PR's site files run only the Mac checks that read them
  (docs/plan-shipped.md, 19ak).
- **19ak-5. Shipped:** a re-run no longer turns the logic shard red; `reach.mjs`'s selftest
  children run as a first attempt (docs/plan-shipped.md, 19ak).
- **19ak-6. Shipped:** the iPhone build fetches Capacitor's two binaries itself (curl
  retries, then the API's asset download) into a SwiftPM cache of its own, so a 504 from
  GitHub's release page no longer fails it (docs/plan-shipped.md, 19ak).
- **19ak-7. Shipped:** the other release-page downloads survive a 504 too: actionlint falls
  back to the API's asset download and CI caches its binary; the Mac app job caches canvas's
  prebuilt, Electron and electron-builder's tools on pull requests and retries `npm ci`
  (docs/plan-shipped.md, 19ak). A cold cache on the Mac app job still needs the pages.
- ~~**19aj-1. Open, found by #603: "keeps it rather than erasing it" reads the runner's frame
  rate.**~~ Dropped 2026-11-22 (19ak-21, the owner's "cut the shit out of things"): the line is deleted from its harness and prints as a note, not fixed. The Blow stroke in `scripts/tools.mjs` steps the plate 272 times on the owner's Mac
  and 83–144 on GitHub's, so the pool it starts from (about 609 against 300–360) and the share
  of straw steps in the stroke move with the machine. On GitHub's Macs it went 301 → 242 on a
  PR that does not touch the bubbles (run 41129450339, green on re-run) and 325 → 284 on #603,
  where the owner's Mac reads 609 → 613 and 612 → 657 for the same code. The check should
  measure over a fixed number of plate steps, not wall time, so its bar means the same on
  every runner.
  Quarantined 2026-11-01 to 2026-11-15, renewed 2026-11-15 to 2026-12-06 (19ak-8).
- ~~**19aj-2. Open, found 2026-11-01: the wall's "a circle leaves the corners of its quad
  dark" goes red on PRs that do not touch the wall.**~~ Dropped 2026-11-22 (19ak-21, the owner's "cut the shit out of things"): the line is deleted from its harness and prints as a note, not fixed. Quarantined 2026-11-01 to 2026-11-15
  and renewed 2026-11-15 to 2026-12-06 (19ak-1, 19ak-8) so it reports without blocking.
  The corner patch it reads (0.26–0.31, 0.11–0.20 of a 64×36 grid) sits close to the
  circle's edge; find whether the red runs read a lit edge
  (the sample too close) or a frame not yet drawn (the read too early), and measure the
  feature, not the moment.
- ~~**19ak-11. Open, found by 19ak-9: the film's "at 0, every film is the rainbow every look
  was made with, to the bit" goes red by one pixel on GitHub's Macs.**~~ Dropped 2026-11-22 (19ak-21, the owner's "cut the shit out of things"): the line is deleted from its harness and prints as a note, not fixed. Four runs in a
  week (11-15 three times, 11-21 once), each a different render one pixel off
  (`closeup00`, `film0`, `plate00`): `scripts/filmlook.mjs` compares two labs, the real
  shader and a control compiled with Film Physics taken out, each running the solver from
  scratch. One pixel is either Metal compiling the two shaders' shared arithmetic
  differently (a fused multiply-add in one and not the other) or the solver not
  repeating itself to the bit between two pages. Find which (print the pixel and both
  values; render the control's shader on the real lab's state), then make the claim the
  one that holds, never a tolerance picked to pass.
- ~~**19ak-13. Open, found by 19ak-9: Pour's "spreads it out from where it lands" reads the
  runner's frame rate.**~~ Dropped 2026-11-22 (19ak-21, the owner's "cut the shit out of things"): the line is deleted from its harness and prints as a note, not fixed. `scripts/tools.mjs` holds each pouring tool for 1200 ms of wall
  time and settles 700 ms, so the plate takes however many solver steps the runner
  manages in that time, and the share of dye from 0.02 to 0.07 moves with it: red once
  on 11-21 (Pour 75% against Drop's 78%, a PR that does not touch the tools). Hold and
  settle over a fixed number of plate steps, as 19aj-1 asks of the Blow stroke.
- **19ak-20. Shipped 2026-11-22: a pull request runs only the fast checks.** The owner,
  2026-11-22, after 52 of 93 PR `Checks` runs from 11-14 to 11-21 went red, every one on a
  browser, lab or Mac line timing a page or a plate on a slow or busy runner (the intro's
  9c, startup's "moving for good", the ear behind the wall, the film's one pixel, AAC):
  "Cut the shit out of things". `scripts/checks.json` names `shards.pr` (`logic`,
  `sound`); `scripts/reach.mjs --diff` on a pull request runs only those Measure parts
  (narrowed further by 19k-4 when the diff is only checks and documents) and no Mac shard,
  and says "partial" to the deploy gate. A new `always` check in `logic`, "The site
  builds" (`vite build`, about eleven seconds), keeps the build on every PR. Gone with it,
  since nothing runs them now: carrying an earlier PR run's Mac result (19i), the per-shard
  and per-check Mac selection (19k, 19ak-2) and a re-run skipping the shards that passed
  (19ak-3a); the reach job no longer installs esbuild. Supersedes the draft rule of #904
  (19ak-16), which only took the Mac off a draft's pushes. *Measured:* `npm run reach` 76
  ok (three new cases on `shards.pr`; every PR case now expects no Mac), `npm run checks`
  all ok, `npm run actionlint` 15 workflows ok.
- **19ak-21. Shipped 2026-11-22: the deploy does not wait for the checks, and five
  only-flaky lines are deleted.** The owner, 2026-11-22: "I would much rather release shit
  that crashes and deal with a couple bugs here and there. Let's get shit live quicker. We
  don't have customers." `deploy.yml`'s `Build and deploy` needs only the gate (`verified`)
  and holds `firebase-hosting-live` on its own; the `checks` job (every Measure part and
  Mac shard) runs beside it on the tree it published as a report, in a group
  (`main-checks-<ref>`) a newer push cancels; the watchdog's `hosted` re-run checks and
  does not publish again. A red there is a bug that is live. Deleted as checks, kept as
  printed notes: startup's "moving for good no later than the old way" (19aa-7), Blow's
  "keeps it rather than erasing it" (19aj-1), the wall's "a circle leaves the corners of
  its quad dark" (19aj-2), the film's "at 0 ... to the bit" (19ak-11) and Pour's "spreads it
  out from where it lands" (19ak-13), each found by its own item to read the runner's speed
  or one pixel of it, none ever a real catch; their quarantine entries went with them.
  Kept: intro 9c and the drawwall control, each red on main from a real change being fixed
  (#897, 8-draw-a-7). Left: `deploygate.sh`'s rule 6 finds the live commit by a run's
  green conclusion, so a deploy whose checks went red reads as not live and the next
  docs-only merge publishes again (the safe way to be wrong; a few minutes).
- **19ak-23. Shipped 2026-11-22: one film at a time on the owner's Mac, in a real queue (`scripts/maclock.mjs`).**
  Several agent sessions driving Chrome or the ChromaGlass app at once overloaded the owner's Mac
  (16 GB MacBook Air). Replaced the manual `~/cg-scratch/film.lock` rule with `scripts/maclock.mjs`
  (atomic `wx` lock, FIFO `~/cg-scratch/film.queue/`, dead-pid and over-timeout stale recovery with
  atomic rename-compare race protection, deploy-shard priority via `macdeploy.mjs`, `CG_FILM_LOCK_HELD`
  nesting, `run`/`status`/`--selftest` CLI and `npm run maclock`), wired it into `chromium.mjs`,
  `desktop.mjs` and the standalone browser launchers (`caption.mjs`, `codecblip.mjs`, `detail.mjs`,
  `webgpu-smoke.mjs`), updated `scripts/macbusy.sh` to treat a live `film.lock` as busy via
  `status --json`, and added the check to `scripts/checks.json`.
