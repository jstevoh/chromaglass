# 19. The checks, the build and the plan itself: what shipped (continued)

Part 3 of 4 of §19's archive; it begins at 19aa. The section starts in `19-checks-build-plan.md`.

## Third pass (moved 2026-10-29, 19m) (continued)

### 19. The checks, the build and the plan itself (continued)

#### 19aa. A flake tracker: each check's reds counted from CI's own logs
**Shipped** (2026-10-18): `npm run flakes` reads every run of `checks.yml` and `deploy.yml`
in a window (`--days`, `--since`, `--until`; 7 days by default), every attempt's jobs and
each job's log, and prints, per check (the runner's system, the command and the check's
name, since `renders` on Linux and on Metal measure different things), how many times it
printed FAIL, of how many, how many of those reds printed ok on the same commit in
another job (a floor on the flakes: the code did not change and the answer did), how
many were on main, and how many branches the reds came from (twenty-five reds on one
branch is that branch's change being caught; the same spread over eight is the check).
A re-run's copied jobs are counted once, jobs cancelled part way are read, and red jobs
that printed no FAIL line are listed by job. `--check <regex>` lists every attempt of
the matching checks with its detail. It is the 2026-10-17 audit by hand (657 red checks
over three weeks, a day of reading) as a script, and it exists now so the startup fix
(14v-6) can be judged on ordinary pushes. Reading, 2026-10-11 to 18 (219 runs, 1,892
jobs, about 80 s; logs cached in the temp folder): the magnet's two drag lines 27 and 26
of 130 over 15 branches (#373's leak), startup's opening 17 of 137 (12%, the audit's
11%), render-app's same seed 11 of 128, the band's renders lines 10 of 135 on the
laptop and 7 on the phone, tools' Blow 9 of 131, ferrodrift's "pulled in no more than in
silence" 7 of 134; Measure's logic job red 16 times with no FAIL line (type errors).
Not a gate and no bar: a rate depends on what was pushed.

- **19aa-6. The renders lines on a starved runner (shipped 2026-10-24).** `renders` waits
  for the plate to draw fifteen frames in a second before measuring (the band's 8 reds of
  191 were all first windows at 0 to 14.5 frames a second), and the fader's line asks the
  Dimmer to change on nine frames in ten that were offered a new value and a quarter more
  than the desk's, where "twice the desk's" asked for more changes than frames below 20 a
  second (the first per-frame bar, 0.8 of the frames drawn, sat on the edge of a healthy
  plate: 0.79 to 0.99 in 48 windows). Story in
  `docs/plan-shipped/19-checks-build-plan-2.md` §19aa-6.

- **19aa-2. `followview`'s timing (shipped 2026-10-18).** Red on #390's PR and its deploy
  and about 1 run in 6 in parallel (2 of 12 on main's code), on a line it should not
  have failed: the track panel's section against the band's. Three readings were taken
  at moments the check did not mean to measure: across a band section edge (the panel
  changes 0.0 to 1.8 s after the band, measured over twenty edges on four pages), in
  the seconds after the follower first locks (the line says 40 to 60% and the section
  can be the old one, or missing for two readings, until the line passes 75%), and the
  "at least 50% sure" read at the instant the line first appears (47% in one run in six).
  The readings now wait for 75% and for a spot 3 s into a section with 6 s left (and with
  the clock-since-tag section held off the band's, so the clock cannot agree by
  coincidence), the first reading must agree too (the panel lags the band), and the 50%
  is read on three further readings a second apart after five seconds. A frozen panel
  would have passed the single reading, so a new line follows the band into its next
  section, three readings in three. No bar moved. Over twelve parallel runs the old check
  was red twice and the new one green twelve times; a panel lagging 4 s went red 3 of 3
  and a panel frozen on one section 2 of 2. The app was not late: no panel was wrong
  once the follower had settled. Known limits: the follower's first place is not
  measured, and a confidence pinned at 100% while sure would pass the 50% line. Not
  tried: making the follower's first place better than 50-60% trust (the follower's own
  business, `songfollow`).

- **19ab-1. A slow download no longer reads as a failing check (shipped 2026-10-24).**
  Every shard fetched its tools inside the same clock as its measuring, so an unbounded
  download cancelled the harnesses at the job's wall and the red said nothing about the
  diff. Seen five times across four runs of one PR on 2026-10-22, on three different
  shards, none of them touching a check that failed:

  | shard | the step | took | warm |
  |---|---|---|---|
  | `browser` | Install Chromium | 650s | 33s |
  | `lab` | Install Chromium | 683s | 33s |
  | `sound` | ffmpeg (apt) | 1474s, 1471s | 22s |

  Both apt hangs were ended by the 25-minute wall rather than by finishing: between
  about 19:30 and 20:30 UTC the step did not return at all, and while that lasted **no
  PR in the repo could go green**, because the sound shard dies before its first sound
  check runs. The browser shard's own work is about eighteen minutes, so eleven minutes
  of cold download puts it at twenty-nine against a limit of twenty-five; the sound
  shard's is about three, so an unbounded apt buries it alone.

  Two changes, because the two halves are different faults. The browser is now cached
  (`actions/cache` on `~/.cache/ms-playwright`), keyed on the **Playwright version read
  from the installed package** and deliberately not on the lockfile's hash: the browser
  a version installs never changes, so the version is the whole of the dependency, while
  a lockfile key would discard the browser on every unrelated bump and pay the eleven
  minutes again. And every fetch now carries its own `timeout-minutes` — six for the two
  Chromium installs, four for apt's ffmpeg, five for the Mac's pip — so a mirror that is
  not answering fails as itself, with the step's name on it, in minutes rather than
  cancelling the measuring at the wall. `--with-deps` still runs apt for the system
  libraries, which the cache does not hold, which is why that step keeps a bound as well
  as a cache.

  Why bounds and not a bigger limit: raising the job to 35 would have hidden this and
  made a genuinely hung harness cost ten more minutes before anyone heard about it. 19w
  moved the *Mac* shards off their timeouts for the same family of reason; the ubuntu
  shards were never costed the same way, because their own work is steady and nobody
  counted the downloads in front of it. The Mac fetches were bounded here too, though
  none has gone slow yet, because the Mac queue is the one that costs.

  What a session should know when this goes red again: a retry is not a fix, and the
  two cases show it from both ends. The browser's cold install cleared on a re-run, so
  green by luck read exactly like green by merit; the apt hang never cleared, so three
  full runs were spent proving the thing that failed was not the diff. Measured by the
  steps' own seconds over the runs after this merge, and the cold path stays honest
  because a version bump changes the key.
  Found while measuring 0-tap (PR #429).

- **19ab-2. apt runs only for a library that is really missing, and a missing one fails
  by name (shipped 2026-10-24).** Two hours after 19ab-1 merged, `Install Chromium`
  timed out at its six-minute bound on #429's browser shard (run 40117937609): the
  mirror was sending 50 to 100 KB/s and had fetched 10 of 17 packages. The browser had
  come from the cache in 4 s; the 17 were `--with-deps`' apt, 8 upgrades of libraries
  already on the runner and 9 fonts (Japanese, Chinese, Thai, FreeFont, unifont) that
  nothing the app draws asks for. The job carried on past the red step and every
  browser harness after it passed, which is the proof the libraries were there.
  The two answers on offer were both wrong: `continue-on-error` on the apt step keeps a
  slow mirror green but lets a truly missing library turn up later as a harness's
  browser "closed" at launch, nothing naming it; a longer bound waits longer for fonts.
  Now `Install Chromium` fetches the browser alone, and `scripts/chromiumlibs.mjs`
  asks the runner what is missing: ldd over every binary of both builds (headless
  shell and full Chromium), then a launch of each. apt runs only when that fails, and
  if the check still fails after apt the step is red with the library's name, before
  the first harness. Found on the way: **Playwright's own check of this does nothing
  in 1.63** — it looks for binaries in `chrome-linux` while the linux-x64 builds unpack
  to `chrome-linux64`, and it skips itself for 30 days behind a `DEPENDENCIES_VALIDATED`
  file that the cache now carries from runner to runner — so before this, a library
  missing from Chromium's own binary was named only in the first harness's launch error,
  mid-shard, and one missing from a helper not at all. Measured in a cloud session: 13
  binaries checked, 3.4 s; with an `ldd` that reports `libatk-1.0.so.0` missing, exit 1
  naming it in both builds; with an `ldd` that fails, or no build in place, exit 1
  saying so. The two launches there both start the sandbox's full Chromium
  (`chromiumPath`), so the headless shell's own launch is first run on CI. The
  ffmpeg step keeps fetching every run (it is a real need) with apt's own retries
  and a 30 s stall timeout added.

- **19ab-4. ffmpeg comes from the Actions cache, and a cold fetch skips a slow mirror
  (shipped 2026-10-26).** 19ab-1's four-minute bound on the sound shard's apt made the
  outage legible but did not end it: on 2026-10-26 the step ran it out twice in an hour
  (#495's run 40350041600, #402's run 40358831181), and then `bands`, `songends` and
  `shape` failed on "no ffmpeg on the path" and `renders` on "no ffprobe on the path",
  four reds on PRs that touched no sound. Retries and a stall timeout (19ab-2) do nothing
  for a mirror that is slow rather than silent, and this PR's own first run measured it:
  the Azure mirror sent the package lists at 11 MB/s and then the 87 packages (62.8 MB)
  at about 55 KB/s, a second's wait per request, so apt would have needed some nineteen
  minutes. Now `scripts/debcache.sh` installs the `.deb`s the Actions cache kept (keyed
  by the runner image) with apt reading an empty source list, so a set that no longer
  fits (a dependency missing, or a downgrade, refused under `-y`) fails at once rather
  than downloading. On a miss apt only says which files; curl fetches them eight at a
  time from the Azure mirror, then archive.ubuntu.com, then us.archive.ubuntu.com,
  dropping a mirror that sends under 300 KB/s for 20 s and holding each file to apt's
  size and hash, and a last pass without the floor in case the whole network is slow.
  Ubuntu's own ffmpeg either way, so the shelf's MP3s are decoded by the decoder the
  sound checks were measured with. The step then requires `ffmpeg` and `ffprobe` by
  name. Measured in a cloud session on 24.04 with mpv standing in (14 `.deb`s): cold
  with the first mirror unreachable, 8.9 s; from the cache 1.5 s, no source asked; one
  `.deb` taken out, "unmet dependencies" then a cold fetch, 7.5 s; a file whose hash does
  not match, refused by every mirror and the step red naming it; an older `.deb` than
  the installed one, exit 100 and nothing changed; the floor, curl exit 28 after 5 s on
  a 40 KB/s transfer. On CI (#496, run 40365582373) the cold fill fetched the 87 packages,
  61 MB, in 1 s, installed Ubuntu's ffmpeg and ffprobe 6.1.1, and saved the set; the step
  took 16 s.

- **19ac-1. The double tap's two taps carry a finger's times (shipped 2026-10-24).**
  `scripts/phone.mjs`; red on 10 of 173 Mac runs the week to 10-24, always
  `0.009 → 0.28 → 0.005`, because the harness's taps were stamped when the busy page took
  them (95 ms apart idle, 466 ms with the page busy 400 ms), past `DOUBLE_TAP_MS` 320.
  Now stamped 90 ms apart and sent 0.4 s apart, so only the stamps can make it pass, with
  a control stamped 0.6 s apart that must not reset. Story in `docs/plan-shipped/19-checks-build-plan-2.md` §19ac-1.

#### 19af. The repository's front page: a short README, the guide in docs/, a clean root (shipped 2026-10-25)

- **19af-1. Shipped.** `README.md` was 79 KB of every feature and control, which is what a
  visitor to the repository met first. It is now the front page (what ChromaGlass is, the
  live link, four screenshots, how to run it, where things are, the licence); the old text
  moved whole to `docs/guide.md` (same headings, so a section edited elsewhere moves
  across), and `docs/README.md` maps the other docs. The root lost thirty-odd one-off
  scratch files (`patch_*`, `test_dump*`, `scratch*`, `wait_ci*.sh`, `tmp_18.txt` and the
  like: nothing in `package.json`, a workflow, a script or a doc named any of them, and
  they stay in git history); `plan_comet.md` moved to `docs/plan-comet.md`. `dc.mjs` stays,
  because `checks.yml` parses it by that name. New feature and control docs go in
  `docs/guide.md`, not the README (`setting-auditor` and `CLAUDE.md` say so).

- **19ag-1. Shipped.** `firebase.json` sends, on every path: an **enforced**
  `Content-Security-Policy` of the four directives that cannot break a page this app serves
  (`frame-ancestors` for the site's own three names only, which the Auth iframe needs;
  `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`); a **report-only** policy of
  everything else (scripts, styles, fonts, images, media, connections, frames, workers),
  logged in the console and enforced by nothing; `Referrer-Policy: strict-origin-when-cross-origin`;
  `X-Content-Type-Options: nosniff` (the service worker's note on HTML served under a `.js`
  URL is the case); and a `Permissions-Policy` that names what the app asks the browser for
  (camera, microphone, screen capture, MIDI, fullscreen, window management, gamepads,
  clipboard, tilt) as the site's own and refuses the rest (geolocation, payment, USB, serial,
  HID, XR). `npm run csp` serves the built site with those headers, opens the show, the
  remote, a cast and the static pages with a blob worker, blob media and the lookups the
  app makes tried on top, and judges: nothing reported; the controls (http, eval, `<base>`,
  `<object>`, a data worker) reported or blocked; another origin cannot frame it; the
  Permissions-Policy parses in Chromium and allows what the app uses. It caught `bluetooth`,
  which Chromium does not know. `npm audit` is at zero: `npm audit fix` (vite, postcss,
  nanoid, browserslist and others), `esbuild` ^0.28.2 (a file read on Windows's dev server),
  and overrides for `@grpc/grpc-js` (^1.14.6, which Firestore's Node build pulls and the web
  app never loads) and `uuid` (^11.1.1, which Capacitor's `xcode` pulls). Judging §89.

- **19ai-3. Shipped.** `components/LiquidVisualizer.tsx` was 670,805 bytes, and 255 KB of it
  was module code above the component: the CPU solver `class FluidSimulation` (3,900 lines)
  and the constants, switches and helpers around it. They are in `src/sim/` now, unchanged
  (every non-import line of the old file is in the new files, counted line by line): the
  solver in `fluidSimulation.ts`, the grid and the solver's constants in `constants.ts`, the
  hands' and bottles' helpers in `tools.ts`, the step and its query-string switches in
  `stepping.ts`, the dice and the palette window in `dice.ts`, and the frame's shapes
  (`FrameView`, `PlateRenderer`, `VisualizerRender`, `FrameDigest`, the song shape) in
  `frameTypes.ts`. The component is 441,458 bytes. `hooks/useSongRender.ts` imports its
  types from `sim/frameTypes.ts` and no longer imports the component. Six checks read the
  solver's source as text from the component and now read it where it went: `cellride`
  (the step's cell clock), `oillift` (the step's rock), `pacing` (the paced clock),
  `panel` (the per-layer list against the solver), `plate` (the CPU gate, the closeup's
  ramp, and the retired looks' exemption, which follows `seedPreset`) and `turing` (the
  drift rates).

- **19ai-5. Shipped: `npm run sizes`, a size ratchet.** A file not in `scripts/sizes.json`
  stays at or under 40 KB; a file already over it (52 on main at b38801e, 4.9 MB between
  them) may not grow past the bytes recorded beside it, nor past its size at the PR's base
  (so two PRs that each fit under a ceiling cannot land together over it), and new code for it
  goes in a module beside it. The baseline only shrinks against the base (HEAD^1 in CI: the PR's merge
  commit's first parent, or the main before a deploy's commit): a ceiling raised or added,
  or a new ledger, is red, and a big file renamed is a new file over budget. A file more
  than 4 KB under its ceiling is red, in a PR that resized it, until `npm run sizes -- --update`
  lowers it (on main, or for a file the PR did not resize, a note: two PRs that each trim
  2.5 KB must not turn the deploy and every open PR red), so a real move out banks what it saved, while a PR that trims a few lines does not have to touch the
  same line of `sizes.json` as every other PR in flight. Binary files and
  `package-lock.json` are not counted. Six **ledgers** that every PR writes in (PLAN.md,
  `docs/plan-shipped/19-checks-build-plan-3.md`, `docs/judging.md`, `docs/guide.md`, CHANGELOG.md,
  `scripts/checks.json`) are exempt by name until split. One manifest entry on the `logic`
  part, `always`; no Mac. Its self-test meets each rule's break in a scratch repository.

- **19ai-5c. Shipped with 19ai-3: a move carries its ceiling.** The ratchet's first real move
  (the solver, 194,508 bytes in one class, out of the visualizer) read as a new file over
  budget, and the owner did not want the solver cut into 40 KB pieces to pass a number (a
  class is not split by moving lines). So a pull request may add a ceiling the base does not
  have when the new entries hold no more than the bytes that left the base's over-budget
  files in the same PR, and each new entry is its file's own size. A file that appears over budget with nothing
  written in still fails as new, and an entry added with nothing taken out still fails as
  raised; what it lets through that the first rule did not is a rename that moves its entry
  with it, which costs a session the same. Five self-tests hold it, one the review of #548's exploit: the credit is the bytes that actually left the base's over-budget files in the PR, not the sum of their ceilings, so slack under a ceiling funds nothing. Whether 40 KB is the right
  budget for a new file at all is the owner's question, raised 2026-10-28 ("40kb seems
  somewhat arbitrary. I don't want quality to go down because of this").

- **19ai-5d. Shipped: a warning at 40 KB, a failure at 100 KB** (the owner's pick,
  2026-10-29). Measured on main at a68de68: about four bytes a token; 506 of 677 text files
  under 20 KB; the cost in the 17 over 100 KB, each read whole by a session that needs a
  fraction of it; the 40 between 40 and 100 KB mostly modules that do one job, whose prose
  comments are 25 to 60% of their bytes (audioFeatures 52%, slosh 59%), so a 40 KB bar was
  paid for in comments or in modules cut where they do not come apart. Now a file not in
  `sizes.json` fails only past 100 KB (about 25k tokens), and one a pull request made or
  grew past 40 KB is a warning (an annotation on the file in CI). Ceilings hold only the
  files over 100 KB: 40 dropped, 13 left (2.7 MB). Ledgers leave the list under 40 KB, as
  before. The review found that freeing the 40 files between the bars let two green PRs land
  one of them over 100 KB on main (presets.ts has 8 KB of room), so a file over the limit with
  no ceiling is red only in a PR that resized it, and a note on main, as a stale entry is; and
  four mutations its self-tests missed, now each caught. 21 new self-tests (57 in all).

### 19m. This file as an index (shipped 2026-10-29)

`PLAN.md` had grown to 819,927 bytes and 9,804 lines (about 200k tokens, more than the
window a session compacts at), so a session that read it whole paid for it on every step
after, and every PR that wrote in it conflicted with every other. It is now an index of
45 KB: the order of work, the running order, a table of sections and the rules. Each
section is a file under `docs/plan/` (`00-dye-tools.md` to `36-analog-operators.md`, and
`qa.md` for the QA list); a section over about 38 KB is cut between items into parts,
so every file has room under the 40 KB at which `npm run sizes` warns. The old header (the
Gemini and Claude tracks) was retired here, above.

The move was made by a script and checked by another, both kept out of the repository
since they ran once: every non-blank line of the old file is in the new files, as it was
apart from a heading's level (the section title is `#` in its own file), except the five
lines of the old title, intro, header names and order-of-work note; and every one of the
670 item ids that began an item in the old file still appears in the open plan, as the
item or its stub. An item moved when its title or first line said shipped or fixed, or
was struck, and nothing in its story said open, owed, not yet, partly or remaining; one
that shipped with open work kept that work in place under a stub, and only the story
above it moved. A review read every moved story for open work and found eleven passages
(owed checks, a deploy by hand, *Still open:* notes, 23.18's follow-ups); the words they
used were added to what keeps an item in place, and they stayed. A branch that still edits the old file carries its edits across with
`node scripts/planmove.mjs` after merging main, and `docs/plan/README.md` maps the old
line ranges for a hunk it cannot place.

The plan as first written:

> Of 61 merges of main into PR branches, 25 recorded conflicts: `PLAN.md` 14, `docs/judging.md`
> 7, `CHANGELOG.md` 4, `package.json` 3, `checks.yml` 1, `src/` 2, and none in `App.tsx` or
> `LiquidVisualizer.tsx`. `PLAN.md` is touched by 29 of 30 merges and is about 75k tokens
> whole (CLAUDE.md's "about 38k" is half the real figure), so a session that reads it pays for
> it on every step after.
>
> *Fix:* each PR writes its plan, judging and changelog notes as a new file in `plan.d/`,
> `judging.d/` and `changelog.d/`, which nothing else edits; a small fold puts them in place
> after merge. And `PLAN.md` becomes this order of work and the running order, with one file
> per section under `docs/plan/`, so a session reads the index and its section. Done in one
> PR at a quiet moment, with a table from old line ranges to new files so a branch caught
> mid-move can re-apply its edit. *Measure:* conflicts recorded per merge of main, and bytes a
> session reads to start. *Size:* M.

## Fourth pass (moved 2026-10-29, 19m-2)

### 19. The checks, the build and the plan itself

#### 19l. App frames readable in a cloud session

CLAUDE.md says the full app on software WebGPU returns zero readbacks, so `qa`, `tools`,
`magnet`, `mirror` and the rest can only be run on the Mac, after a push and a queue.
*Read 2026-10-04 in a cloud session, Chromium 141:* headless, the device is lost at the
first canvas present ("A valid external Instance reference no longer exists"), which is
why the lab, which never presents, works. Headed under `xvfb-run` with the same flags the
device survives and `__cgFrame` returns the app's frame (1280×800, mean 0.29); `tools` gave
7 of 15 real readings, where headless gave 3 of 14, all zeros. The rest failed on speed: the
plate stepped 8 times a window against 21 to 25 on Metal.

*Fix:* `scripts/chromium.mjs` launches headed under xvfb when `PW_WEBGPU=1` on Linux
(`scripts/desktop.mjs` already re-executes itself under `xvfb-run`); checks wait for the
engine rather than sleeping, and count windows in steps where they count seconds. CI stays
on Metal, as 19h's "what would not help" found. A session can then reproduce the logic of
a Mac check before it pushes; about a third of the Mac reds were the PR's own (19h).
*Measure:* the same commit through `tools`, `magnet`, `mirror` and `bottles` in a cloud
session and on the Mac: the lines that do not depend on the step rate agree. *Size:* M.

*Built (2026-10-26, this PR):* `scripts/chromium.mjs` launches headed into an Xvfb it starts
itself (`-displayfd`, so parallel harnesses never race for a display), with the GPU watchdog off,
when `PW_WEBGPU` is set on Linux and the harness asks (`present: true`: `tools`, `magnet`,
`mirror`, `bottles`) or `PW_PRESENT=1` does. Asked for, not the default: the first push made it the
default and CI's Linux lab part ran out of its 25 minutes, the twenty-odd checks that set
`PW_WEBGPU=1` themselves (`signin`, `tiers`, ...) each driving a live software plate, and
`intro`'s fade finishing 95 s late behind the first step. Those measure the page, not the plate. `scripts/frame.mjs`'s `engineQuery()` adds `&dpr=0.25&steps=60` there, and two waits:
`waitForEngine` after the opening, `settlePlate` for every other wait in `tools`, `magnet`,
`mirror` and `bottles`, the wall clock on a GPU exactly as before and, in software, also a share
(`PW_STEP_SHARE`, 0.05) of the steps the Mac's sixty a second would take.
*What was found on the way, Chromium 153:* headless still loses the device at the first present
(a bare canvas: lost at once headless, thirty frames headed). Headed was not enough by itself:
the app's first full solver step (248 compute passes) holds SwiftShader's one GPU thread for
25 to 100 s, compiling as it first dispatches, and Chromium's watchdog takes that for a hang
and kills the GPU process, so the page lost its device, made a new one, reached the same step
and was killed again, for good. That is what `startup.mjs`'s "SwiftShader loses the app's
device every few seconds" was. With the watchdog off, the plate's frame reads back (mean 0.40
on classic, moving) and the plate makes about 0.4 steps a second at 256² and at 128² alike
(the cost is a step's dispatches, not its cells), against about sixty on Metal; the drawing
was 90% of a 1280×800 software frame (36 s), 2 to 3 s at `dpr=0.25`. `stages` read 0.7 to
1 s a solver layer a step. So a cloud session runs a Mac check's logic on a plate that moves,
at a twentieth of its steps, and not its magnitudes.
*Measured:* see the PR (tools, magnet, mirror, bottles here against the same commit's Mac shards).

#### 19l-3. The other app checks, asked one at a time

*Built (2026-10-27):* eight more opted in, each run here at the same commit (`PW_WEBGPU=1`, three
at a time on 4 cores, 5% of the Mac's steps): `take` 9 of 9, `ferro` 7 of 7, `ferrodrift` 6 of 6,
`finger` 2 of 2 (these agree with the Mac's), `bubbles` 26 of 30 and `depth` 8 of 10 (the
failing lines wait on the plate having developed for nine of the Mac's seconds, 540 steps, here 27:
"the plate holds nearly still while it is photographed" read 61% of pixels moved, "the show is
running" wants two steady seconds, "switching it off puts the plate back" is a magnitude),
`handpour` 26 of 31 (the bank's size against what a pour raised the mean by, and the slider's
ordering, are magnitudes of a pour at a twentieth of its steps), `kickbubbles` 8 of 12 (all its
"releases no bubbles" and layout lines agree; the four that count kicks reaching the bubbles
"at least 15" in a listening window read 1 to 3, the window being the wall clock's).
What it took: `take` read a toast that goes in a few seconds, so its wait after the first stop is the
wall clock, its note waits 30 s in software, and it waits for the engine again after its reload;
`kickbubbles` skipped itself unless a Mac drew, and its clicks and canvas lookup waited out
Playwright's 30 s behind the plate's first step; `handpour`'s `waitForShow` has five minutes in
software, not one.

#### 19l-4. A software plate develops the Mac's steps, on a clock that steps with it

*What was found:* the step count was half of it. `bubbles`' "the plate holds nearly still while it is
photographed" read 21.5% of its pixels moved across *one* step (7.4 s of wall clock), 26.8% across
three (15 s), 34.3% across six (23 s), where the Mac moves 4 to 8% in its 72 steps: it tracked the
wall clock, not the steps. The frame loop moves the lamp's wander, the gel wheel, the dish's turn and
the phrasing by each frame's elapsed time (`realDt`), and a software frame is one step and two to
fifteen seconds of it, so a software plate was the Mac's with its lamp and dish run fast. More steps
alone would have made that worse, not better.

*Built (2026-10-27):* `?lockstep=1` (`LOCKSTEP` in `LiquidVisualizer.tsx`): each frame's elapsed
time is exactly the step it takes, so a software plate is the Mac's plate in slow motion. A harness
asks for it with `engineQuery({ lockstep: true })`, which a GPU never sends. And `developPlate(page,
ms)` in `scripts/frame.mjs`: on a GPU `waitForTimeout(ms)` exactly as before, in software every one
of the Mac's `ms × 60 / 1000` steps, for the waits a line reads the plate's age through: `bubbles`'
opening, its "let a look develop", its 1.2 s bracket and the 0.9 s in which a bubble opens its hole in
the dye (at three steps, 14 of 850 bubble pixels were lit), `depth`'s opening. Slow by design: 540 steps
took 62 to 80 minutes with two or three harnesses sharing four cores.
Two lines were wrong for reasons the slow plate showed up, both fixed so a Mac reads them exactly as
before: `bubbles`' floors on the pixels a bubble draws (3000, 800, 500) were counts in the Mac's
742,000-pixel frame, and a cloud frame at `dpr=0.25` has 46,375, so they are now the same share of
the frame read, never more than the Mac's (scale exactly 1 there); `depth`'s "the show is running"
read the last nine rows of a load timeline that stops at 400 rows (100 s), and after a developed
opening passed on rows from the page's first minute, so it now reads only while the timeline is
still being written.
*Measured, cloud (`PW_WEBGPU=1`, two harnesses sharing four cores):* `bubbles` 13 of 15 before (the
still plate 23,338 of 46,375 pixels moved; the three colour lines never ran, gated on the Mac's pixel
count), 16 of 18 after (the still plate 518 moved, 1.1%; drawn on 435 against a floor of 188); `depth`
8 of 10 before, 9 of 10 after ("switching it off puts the plate back" 1.221 against 1.220, red before;
"the show is running" red as the Mac-only line below, where a first run without the timeline's guard
had passed on stale rows).
