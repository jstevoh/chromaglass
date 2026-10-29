# 19. The checks, the build and the plan itself (continued)

Part 3 of 3 of §19; it begins at 19aa-9. The section starts in `19-checks-build-plan.md`.

- **19aa-9. Bottles' Splat with the Ferrofluid bottle, "not at its mirror" (read 2026-10-25).**
  3 reds of 183 Mac runs in the week, all on the Splat and on no other tool or the replays
  (0 of 183 for Dropper, Pour, Spray and Streak): two "not following the hand" (off it by
  0.041 and 0.056 over 24 and 32 pours, against the 0.04 bar) and one with 1 pour at the
  mirror (33 on the stroke, off it by 0.010; green on re-run). A Splat's first droplet is
  flung 4.5 to 27 cells from the hand, so the mean offset of 33 pours has a spread of about
  0.011 of the plate and 0.04 is out of reach of the scatter alone (0.14% a run for the one
  that read 0.041, nothing for 0.056), and a fling cannot reach the mirror (0.45 of the
  plate from the stroke, the fling 0.14). So something other than the hand poured ferrofluid
  on those three: the look's own ring (`layPhase`, from a look being laid or the plate
  coming up bare) is the lead, with the automation's Ferrofluid hand the other. The check's
  pour log did not say; it now prints, when the mirror or the hand's offset fails, every
  call that landed away from the stroke (where, its radius and amount, whether the
  mouse was down, how far from the hand) and the ring counter (`phaseLays`) on the first
  and last call. No bar moved. When a red names the pour, either mark it as the show's own
  in the log (the way the dye log marks `auto`) or hold the show off the plate for the
  window, as `__bottleTest` already holds `doseLiquid` off.
- **19aa-10. `npm run tiers` raced on Measure · lab (found 2026-10-25, fixed).** Its step-down
  nudge ("12. slower framerates suggest upgrading to Pro") is read after `forceStepDown(true)`.
  The hook set the engine status once and the next frame's own status replaced it: on software
  WebGPU `classifyAdapter` says 'software', `qualityLadder` has one rung, `failRung` has
  nowhere to go and `governor.steppedDown` stays false, so the card unmounted before the
  check read it ("locator.textContent: Timeout 30000ms"). Not reproducible by running the
  check (0 of 10 red on main in a cloud session, 0 of 6 after), so the nudge's presence was
  sampled every frame for three seconds after the hook: the card is there for all of them
  both ways, and the check, once it reads three seconds later, goes red 2 of 2 on main and
  passes 2 of 2 with the fix. The hook now keeps what it was asked (`forcedStepDown` in the
  loop's status), and the status in the loop reads it. A test hook only; the governor, the
  ladder and the real step-down are as they were. It touches no bar. `governor.ts` was not
  touched (#441, #474 and the #402 finish thread are in it).
- **19aa-11. The Mac `webgpu` check "the stage starts, with nothing asked for" (3 of 192,
  read 2026-10-25; two of them within twenty minutes that day).** `no stage` with no
  `gpuFailure`, 30 s after load, on the first page of the run only: every later page of
  the same run started at once. The same cold start as `startup`'s, but 30 s and not 3, and
  the line says nothing about which part stopped. It now says: the frames and engine the
  page reports, how long a fresh adapter request takes at that moment, and the page's
  errors. Not fixed, not retried (the owner turned a retry down for `startup`, 2026-10-24).
  The next red names it.
- **19aa-12. Phone: "a finger holding the Press lifts nothing until it comes off" read
  `held` once (2 of 177, 10-24 and 10-25).** `held` is the plate having pressed within 150 ms
  of the read, and a held finger presses once a plate step, so a stall of that length on a
  Mac stepping 12 to 23 times a second reads false while the press is held; both reds
  printed "held false over 10 steps" with the lift laid at the finger afterwards. It now
  reads six times across the same 600 ms and wants four held (a press laid once and not
  renewed reads one or two); the lift half is as it was. Judge with `npm run flakes --
  --check 'holding the Press lifts nothing'` a week after merge.
- **19aa-7. Startup's "moving for good no later than the old way" 7 of 192 (read 2026-10-25;
  the cause is not found, a breakdown is printed).** The 7 reds read the show's own wait 1.79
  to 3.04 s against the control's 0.74 to 1.07 s, and the show moving for good 2.4 to 7.6 s
  *earlier* than the control. Over the 192 Mac runs of the week the show's own ran 0.40 to
  3.25 s (median 0.78, 2.0 s or more on 8%), and the control's has the same tail (0.5 to
  3.4 s): the line holds one noisy residual to another's plus a second, so it goes red when
  only the show's tail lands. Ruled out from the logs: the opening's one wait for the GPU's
  first uses (`useWait`) is 0.00 s on all 192, so it is not the unpriced part; and the boot's
  warm compile (`first compile` row, 0.7 to 2.6 s on the reds) is mostly inside a priced
  build, so taking it off the show would count it twice (it correlates 0.25 with own).
  Not ruled out: the stretches that are neither Chromium's nor a build's are the page idle
  and waiting on a process that is not the page (which 14v-7 already sets apart for the frame
  gaps), or the page's own thread held (the three reds that printed it show 0.50 to 1.71 s
  held). The logs do not say which, so every run's 1b line now ends its own wait with the
  stretches that are neither Chromium's nor priced, how long they are and how much of
  that the page's timer ticked on time in (printed, not judged; no bar moved). The next
  step is to read that line on the week's reds and, if it is the page seen free, price it
  the way 14v-7 does the frame gaps, with the same synthetic cases. The reds are 4% of runs,
  so the week after this merges is the evidence.
- **19aa-2. `followview`'s timing (shipped 2026-10-18).** Story in `docs/plan-shipped.md`
  §19aa-2 (moved 2026-10-29, 19m).
- **19aa-3. The API scripts never print the token (shipped 2026-10-19).** `scripts/ghapi.mjs`; `npm run ghapi`. Story in `docs/plan-shipped.md`.
- **19aa-4. `deploygate.sh` keeps the token off curl's command line.** It passes
  `-H "Authorization: Bearer $GH_TOKEN"` as an argument (`scripts/deploygate.sh`, the `api()`
  helper), and the owner runs it locally with `GH_TOKEN=$(gh auth token)`, so any process
  can read the token through `ps` while curl runs; bash prints nothing of it on a failure
  and Actions masks it, so it does not reach a log. Give curl the header on stdin
  (`-K -`, as `scripts/ghapi.mjs` does) and check with `npm run deploygate -- --history 20`
  that the same merges are trusted. Found by the check-skeptic on 19aa-3.

## 19ab. A shard's tool fetches are bounded, and the browser is cached

- **19ab-1. A slow download no longer reads as a failing check (shipped 2026-10-24).** Story
  in `docs/plan-shipped.md` §19ab-1 (moved 2026-10-29, 19m).

- **19ab-2. apt runs only for a library that is really missing, and a missing one fails by
  name (shipped 2026-10-24).** Story in `docs/plan-shipped.md` §19ab-2 (moved 2026-10-29,
  19m).
  - **19ab-3. Open: the runner's fonts are printed, not held.** `--with-deps` pinned
    fonts-liberation and fonts-noto-color-emoji; they are on the runner today
    (its preinstalled Google Chrome depends on them), but an image that drops them
    would move the layout and phone checks' text measurements with nothing red. The
    step prints `fc-match sans-serif` and `emoji`; make it fail on a fallback that
    is not the one the checks were measured with, once CI's own reading is known.
- **19ab-4. ffmpeg comes from the Actions cache, and a cold fetch skips a slow mirror
  (shipped 2026-10-26).** Story in `docs/plan-shipped.md` §19ab-4 (moved 2026-10-29, 19m).
  - **19ab-4a. Open: drop the cache's `restore-keys`.** `cache-hit` is true only on the
    exact key, so when a new runner image restores the last image's set through
    `restore-keys` and it installs cleanly, the save step stores that same old set under
    the new key, and it rides forward image after image until an offline install fails:
    Ubuntu's updates to ffmpeg and its libraries never reach CI, which is not what "keyed
    by the runner image" says. Nothing goes vacuous (the decoder just stays fixed), and
    the cold fill measured 16 s for the whole step, so the fallback buys about 15 s once
    per image. Found by #496's review.
  - **19ab-4b. The warm path runs on CI (seen 2026-10-26).** #496's run filled cold, and so
    did #497's first (53 s for the step), though #496 had saved the set under the same
    image's key: an Actions cache saved by a pull request is scoped to that PR's merge ref,
    and other PRs read only their own and the default branch's. #496's deploy ran Measure
    on `main` and saved it there, and #497's next run read it: "installed from 87 cached
    packages, no mirror asked", 12 s for the step (unpacking 87 packages; no network). A
    deploy that skips its checks saves nothing, which bears on 19ab-4a: without
    `restore-keys`, PRs fill cold on each new image until a deploy that runs Measure saves
    its set.
  - **19ab-4c. Open: `--fetch` accepts only SHA256 and SHA512.** It takes MD5Sum and SHA1
    too; apt on noble prints the strongest hash anyway, so this is hardening, not a hole.

## 19ac. The phone's double tap on Speed is judged on two taps landing in time

- **19ac-1. The double tap's two taps carry a finger's times (shipped 2026-10-24).** Story
  in `docs/plan-shipped.md` §19ac-1 (moved 2026-10-29, 19m).
- **19ac-2. How long a tap on the phone's sheet takes to answer is unjudged.** The double
  tap now prints it ("handled N ms apart"); the old red implied up to about 400 ms on a
  busy Mac runner. Bound it where the phone's frame and renders checks live, from a
  measurement on the Mac, not from this line.

- **19ac-3. `bottles`' "one at the mirror" was the hand's own splatter, the stroke too near
  the middle (shipped 2026-10-29).** The canvas's (0.25, 0.3) to (0.4, 0.3) lay on the plate
  0.232 from its mirror, not 0.4; a fling (0.14) and the mirror's radius (0.12) reach 0.26.
  The stroke moved to (0.1, 0.3) to (0.25, 0.3), 0.44 from its mirror, and a line asks for
  the clearance each run. Story in `docs/plan-shipped.md` §19ac-3.

## 19ad. The `open` shard flakes on four unrelated faults

- **19ad-1. `WebGPU (macOS) · open` goes red on marginal timing and on a stray reading.**
  Seen twice on branches that could not reach it — PR #429 (which changes
  `scripts/tools.mjs`) and PR #444 (workflow YAML only) — and green on four other runs of
  the same shard across other branches in the same afternoon, so it is intermittent
  rather than a regression on main. Two different checks:
  `and it is moving for good no later than the old way was` read a
  **longest wait for a frame of 2.03 s against a 2.00 s bar** (2026-10-22), which is the
  kind of margin a loaded runner closes on its own; and
  `The ear behind the wall: and it hears on the wall's asks, one a frame, not on its own
  frames or the tick` read **61 ask, 0 frame, 1 tick over 61 frames asked for**
  (2026-10-24), where the single tick reading is the whole of the violation — one stray
  reading out of 61 fails a check written to allow none.
  Both want the same treatment and neither should get a looser bar first: measure the
  quantity over a run of shards to see what it actually swings between, and only then
  decide whether the bar is wrong or the app is. For the ear, find out whether one tick
  reading in sixty-one is a real path through the code (a first frame, a resize, a
  reading taken before the wall asked) or noise; "allow one" would be the wrong fix if
  the one is a genuine route. Found while measuring 0-tap and 19ab (PRs #429, #444).

- **19ad-2. The same shard failed with no check having failed, and with a check that is
  green seven times out of seven on the owner's Mac.** Two more presentations on PR
  #429, which still reaches none of them (it changes `scripts/tools.mjs` and this file).
  The first: the job ran 14m0s and died with `Bass Boost presses harder` having printed
  `10/10 ok` at 17:04:34, then **twelve minutes of no log at all** and `Post job cleanup`
  at 17:16:57. The API agrees and says more: step 25 `success`, and then **fifty-two
  steps with no record at all** — no `started_at`, no conclusion, never begun. Six steps
  succeeded, thirteen skipped. The runner stopped executing after a step that passed, so
  no check failed and no check was even reached; the Mac job's own `timeout-minutes: 20`
  was never hit either. The second, on the re-run: `draftwall` read
  `FAIL the dimmer still reaches the wall in Preview — wall dimmer 1` and finished 19/20.
  The reading is the **default**, 1, not a wrong value: the dimmer had not arrived, which
  points at the fixed `await page.waitForTimeout(400)` on `scripts/draftwall.mjs:153`
  being short of what a loaded runner needs rather than at the room settings not reaching
  the wall. That is a guess, though, and it stayed a guess: the check is green **seven
  runs out of seven** on the owner's Mac on this exact tree — four idle, and three with
  every one of the ten cores spinning on a busy loop — so the mechanism is not reproduced
  and the wait must not be lengthened or the bar loosened on the strength of the
  theory. What the four presentations have in common is the shard, not the check: each
  red has been a **different** check, never the same one twice, and `open` is the longest
  shard with the most steps (the comment above its `musicforce` step already notes a
  shard near its timeout). So the thing to measure is the shard, not any one of its
  checks: whether `open` is at the edge of the runner it is given, and whether it should
  be split the way the Mac shards already are. Until then a red `open` on a branch that
  cannot reach the failing check is not evidence about the branch. Found while measuring
  0-tap (PR #429).

- **19ad-3. The startup stall came back on a deploy.** The `open` shard's startup read a
  **2.72 s longest wait against its 2.48 s bar** on the 38f3c07 deploy (2026-10-24) and
  passed on one re-run. One more presentation for 19ad-2's question of whether the shard
  is at the edge of its runner; the bar stays where it is.

- **19ad-4. Measured: `open` is not at the edge of its runner, and is not split (PR #449,
  2026-10-24).** Every `WebGPU (macOS)` job from 2026-10-17 to 24, 210 per shard, read
  from the API. Green medians: plate 14.7 min (p90 16.6), fifth 14.2, show 14.1, open
  14.0 (p90 15.4, longest 17.3), tools 14.0, against `timeout-minutes: 20`. The five
  are within 0.7 min of each other, so `open` is neither the longest nor near its wall,
  and the runner-stopped red in 19ad-2 was not a timeout, nor is 19ad-3's startup stall. It does go red most: 54 jobs,
  against plate 9, fifth 14, show 22 and tools 27. But 38 of the 54 are one step, `The
  show opens without stopping` (`startup`, 14v-6/14v-7), then `The sound's renders, with
  a plate` 11, `The ear behind the wall` 3, and five others once or twice. A split does
  not change the rate of any of them, because none of them depends on what ran before
  it. It would cost a sixth Mac runner on every run, against the account's five at a
  time, so one shard of every run would wait for another to finish. What a split would
  buy is a cheaper re-run of a startup red (half a shard), and that is better bought by
  fixing startup. Revisit if a shard's median passes about 15 minutes (the 19w rule).

- **19ad-5. `bottles` goes red when one splatter fling lands at the stroke's mirror.**
  PR #525 (a copy and constant change that cannot reach the pour) failed `Every tool lays
  the bottle` twice running on the same head, 2026-10-28, on a different bottle each time
  and no other line: `splatter with the Oil bottle lays oil along the stroke`
  (31 pours, 1 at the mirror) and `splatter with the Ferrofluid bottle lays ferrofluid
  along the stroke, and not at its mirror` (30 pours, 1 at the mirror, three strays 0.12–0.13
  from the hand). Pour and spray with both bottles read 0 at the mirror every time. Both
  lines require `mirror === 0` of a stroke whose splatter flings drop within 0.14 of the
  plate from the hand, so any fling that crosses the middle can land inside `rad` of the
  mirrored path: the check asks the scatter's reach to stay clear of the mirror, which
  it does not promise. Do not loosen the bar first: count the flings that land at the
  mirror over a run of shards (`npm run flakes`) against how many a stroke's geometry
  allows, then state the bar as that (the mirror reading should be the hand's own
  flipped path, not the fling's reach). Seeded or recorded flings would settle it.

## 19ae. A phone check reads its dye across a plate rebuild and calls it a fault

- **19ae-1. `npm run phone`'s "two fingers holding Drop lay dye under both" picks its
  cells on one plate and reads them on another.** On #352's first deploy (run
  40121831306, the `show` shard) both fingers read **0 under it**: between the pick and
  the read the governor rebuilt the plate from 384² to 256² (solver #1 to #3), so the
  cells the check picked were not the cells it read. The re-deploy passed. The plate line
  the check prints on a red (`before:`/`held:`/`after:`, `scripts/phone.mjs` near its
  `plateLine`) already carries each reading's plate, so the check has what it needs to
  notice: when the plate's size or solver differs between the pick and the read, it
  should say "the plate was rebuilt between pick and read" and measure again on the new
  plate, not report FAIL with "0 under it". It must not pass in that case, and the bar on
  the dye under each finger stays where it is. Same family as 19ad (a red that is about
  the runner's moment, not the branch). Found reviewing #352 (2026-10-24).

## 19af. The repository's front page: a short README, the guide in docs/, a clean root (shipped 2026-10-25)

**Shipped.** Story in `docs/plan-shipped.md` §19af (moved 2026-10-29, 19m).

- **19af-2. Open, the owner's, GitHub settings a session cannot change** (the agent proxy
  refuses writes to repository-settings paths): the About description, the website link
  (`https://chromaglass.art`) and the topics. Suggested text is in the PR that shipped
  19af-1.

## 19ag. The site's security headers, and the dependencies' advisories (2026-10-28)

Found by the owner's security audit of 2026-10-28 (findings 11 and 18): `firebase.json`
sent no Content-Security-Policy, no frame-ancestors, no Referrer-Policy and no
Permissions-Policy, so anything could frame the show and a script injected into the page ran
with the visitor's licence key and sign-in in reach; and the root `npm audit` counted fifteen
advisories.

- **19ag-1. Shipped.** `firebase.json` sends, on every path: an **enforced**
  `Content-Security-Policy` of the four directives that cannot break a page this app serves
  (`frame-ancestors` for the site's own three names only, which the Auth iframe needs;
  `object-src 'none'`; `base-uri 'self'` … Story in `docs/plan-shipped.md` §19ag-1 (moved
  2026-10-29, 19m).
- **19ag-2. Open, the CSP enforced.** The report-only policy keeps `'unsafe-inline'` in
  `script-src` for three inline scripts in `index.html` and the preload list the build writes
  into the page (`vite.config.ts`), whose text, and so hash, changes with every build.
  Enforcing needs the hashes in the header, which Firebase Hosting only reads from
  `firebase.json`: either the deploy job writes them in after the build, or the build emits
  the policy as a `<meta>` tag (no `frame-ancestors` there, which stays a header). Also before
  enforcing: the owner signs in with Google (the popup loads `apis.google.com`), plays a song,
  buys and activates a key on the live site with the console open and sends the violations
  that appear; and the Workers' real addresses (`connect-src` lists `*.workers.dev`,
  `lrclib.net` and Google's APIs; a custom domain would be reported). A report endpoint (a
  `report-to` route on the report Worker) would make that unnecessary; it is a Worker deploy.
- **19ag-3. Open, found along the way.** `Cross-Origin-Opener-Policy: same-origin-allow-popups`
  (the Auth popup keeps working with it; not added, as nothing needs it and the cast and
  panel windows use `window.open`); HSTS preload (Firebase Hosting sends a plain
  `Strict-Transport-Security` itself); the Mac app's own server sends none of these headers
  (`server/remote-server.js`); `desktop/` has its own lockfile and its own advisories
  (Electron, the audit's finding 7).

## 19ai. Smaller sessions: the separation plan (2026-10-28)

The owner approved splitting the files sessions read most (the plan page of 2026-10-28;
the docs PR numbers the series 19ai-1..10). Written here so far: 19ai-3 and 19ai-4 (the plan's items 3 and 5, one PR of pure moves) and 19ai-5.

- **19ai-3. Shipped.** `components/LiquidVisualizer.tsx` was 670,805 bytes, and 255 KB of it
  was module code above the component. Story in `docs/plan-shipped.md` §19ai-3 (moved
  2026-10-29, 19m).
- **19ai-3a. Found along the way.** The review said `lib/stir`, `squish`, `plateRock` and
  `turntable` import types from the component; they only name it in comments. The one
  importer was `hooks/useSongRender.ts`. And 26 checks read `LiquidVisualizer.tsx` as text:
  a later split of the frame loop (the review's item 11) moves code those checks grep, so
  each piece moved has to be held against them the way this one was (a pattern that matched
  the old file and no longer matches the new one is a check that moved with the code).
- **19ai-4. Shipped.** `src/lib/checkHooks.ts` declares on `Window` every name the checks
  reach the app by: 44 (the plan counted 38), each with its shape, the file that sets it and
  whether it needs `?debug`. Types only; the setters keep their casts, so no setter moved.
- **19ai-4a. Open.** A setter that is next edited drops its cast and assigns
  `window.<name>`, so the declaration is checked by the compiler and not only read. The App
  ones go with 19ai-8 (`App()` into domain hooks), which starts after this.
- **19ai-5. Shipped: `npm run sizes`, a size ratchet.** Story in `docs/plan-shipped.md`
  §19ai-5 (moved 2026-10-29, 19m).
- **19ai-5c. Shipped with 19ai-3: a move carries its ceiling.** Story in
  `docs/plan-shipped.md` §19ai-5c (moved 2026-10-29, 19m).
- **19ai-5d. Shipped: a warning at 40 KB, a failure at 100 KB** (the owner's pick,
  2026-10-29). Story in `docs/plan-shipped.md` §19ai-5d (moved 2026-10-29, 19m).
- **19ai-5a. Open: watch what the ratchet costs a feature.** In the two weeks to 2026-10-28,
  App.tsx grew in 8 merged PRs, SettingsPanel.tsx in 8 and LiquidVisualizer.tsx in 7. Each
  such PR now has to move as many bytes out as it adds, wiring lines included. If that turns
  out to cost more than the splits save, the owner decides whether over-budget files get a
  small fixed allowance; until then the rule is the one approved.
- **19ai-5b. Open: the ledgers come out.** 19m (PLAN.md split by section) takes PLAN.md and
  the archive off the list; `docs/guide.md` and `docs/judging.md` want the same split by
  part of the app; `scripts/checks.json` could be one file per shard.
