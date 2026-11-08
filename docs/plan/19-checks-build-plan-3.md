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
- **19aa-10. `npm run tiers` raced on Measure · lab (found 2026-10-25, fixed).** The hook keeps what it was asked (`forcedStepDown`); no bar, no governor change. Story in `docs/plan-shipped.md` §19aa-10 (moved 2026-10-29, 19m-2).
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
- **19aa-13. `renders` and `squeeze` hold a window until it has the frames or steps its
  line asks (shipped 2026-11-07).** Story in `docs/plan-shipped.md` §19aa-13.
- **19aa-14. `renders`' "the App renders for its clock and no more": the dye bottle
  committed on its own (shipped 2026-11-07).** Story in `docs/plan-shipped.md` §19aa-14.
- **19aa-14b. `open()` waits up to 30 s for one second of fifteen frames (found
  2026-11-07, open).** A page on a Mac drawing under fifteen a second waits the full 30 s
  (it prints "never drew fifteen frames"; not yet counted in the logs). Now that each
  window holds itself open for its 45 frames (19aa-13), it could wait only for the plate
  to draw at all.
- **19aa-14c. The cloud's software WebGPU loses the app's device every nine seconds or so
  (found 2026-11-07, open).** `PW_WEBGPU=1` with the app (not the lab), under Xvfb: "WebGPU
  device lost: destroyed" with no `destroy()` call from the page (a wrapped
  `GPUDevice.prototype.destroy` never ran), then "A valid external Instance reference no
  longer exists" and a `requestAdapter` that returns null for two seconds. Each loss and
  recovery commits the plate's own `glLost`/`glEpoch` state, so `renders` with a plate
  read there is red for that alone (1.3 renders, 2.0 commits a second). Probably
  SwiftShader's GPU process going down under the plate's work at that rate; find which,
  before any app check leans on software WebGPU for its commits.
- **19aa-15. A pull request's Measure part builds the site first when a full run would
  have (shipped 2026-11-07).** Story in `docs/plan-shipped.md` §19aa-15.
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
  so the week after this merges is the evidence. Two more on 2026-10-30 (#550's `open` shard on one head, af60ee4): 2.09 and 2.49 s against 0.72
  and 0.74 s, the show moving for good at 14.3 and 14.6 s against 23.6 and 22.1 s; the third run
  of the shard read it green, and nothing in that diff was on the opening's path.
  - **19aa-7a. Found: the opening sat out the frame wait's whole 1.5 s cap (2026-11-01).**
    Read across the 116 `open` shard runs of 10-27 to 11-01 (18 red on this line): the gap
    from the device given to the first compile asked was 0.06 to 0.18 s on 73 runs (four
    frames drawn, as `introStill` waits for) and 1.51 to 2.77 s on 43 (the cap firing), and
    16 of the 18 reds were among the 43, their longest "page's own" stretch 1.51 to 1.62 s
    starting at the device. The GPU process stopped presenting just after it gave the
    device, with nothing of ours asked of it, and the page sat free waiting for frames it
    already held (#656's run 41317399432: compile asked at 3.82 s, frames back at 4.75 s).
    The check was right to count that as the page's own. The fix is the app's, not the
    bar's: the wait now ends once the page has been free (its timer on time) for half a
    second with no frame drawn (`src/lib/stillWait.ts`, `npm run stillwait` on made-up
    timelines; four frames still waited for whenever they come, a busy or held page never
    read as starved, never past the old cap). On those 43 runs that asks the compile about
    a second sooner; modelled on the same 116, the reds go from 18 to about 6. Judge with
    `npm run flakes -- --check 'no later than the old way'` a week after merge.
  - **19aa-7b. Open: four reds start with the page held, not free.** On four of the 18
    the device came at 0.2 s and the page's thread was held (timer silent, no long task)
    for 1.15 to 1.50 s from about 1 s, then the cap; the starved rule does not count held
    time, so it changes nothing there. Of the other two, one is a starved run the rule
    brings about 0.8 s nearer but not under (its control read 0.75 s), and one's longest
    stretch is behind the opening, at 16.7 s. Next: what holds the page's thread just
    after a fast device (14v-7 sets held apart for the frame gaps; 1b counts it as own).
  - **19aa-7c. Read again 2026-11-07, when main's deploy for 1787a41 went red on it twice.**
    The 34 `open` shard runs of 11-05 to 11-07 (PRs and main) had 14 reds on this line, two
    in five, against 18 of 116 the week before; #661 had sat unmerged since 11-01.
    13 of the 14 were 19aa-7a to the hundredth: the first compile asked 1.50 to 1.57 s after
    the device was given (the cap), the show's longest "own" stretch that same 1.50 to 1.58 s
    beginning at the device, the page's timer on time through it (2.09 to 2.54 s of each
    show's own seen free). Taking the starved rule's second off each (500 ms of the 1.5 s
    kept), 11 of the 13 read green, one reads 1.40 s against a bar of 1.41, and one stays
    red (1.71 against 1.59, its control's own 0.59 s, the week's second lowest). The 14th
    was 19aa-7b, the deploy's second attempt: device given at 0.29 s, the page's thread held
    1.60 s from 1.14 s, the compile asked at 2.76 s. Its long animation frames say what the
    hold is not: a 1.60 s frame from 1.14 s with no script in it and no blocking time,
    rendering from 2.74 s, so the page ran nothing of its own and its timer did not tick;
    and a 0.56 s frame from 0.55 s with 0.50 s blocking (two scripts, the page's own work).
    Pricing the held stretch as Chromium's, as 4b does, would read 2.14 s against a bar of
    2.02, still red, so 7b is not a change to the check alone and stays open: the next step
    is what in the page's first second stretches four frames over 0.85 s after a fast device.
    Merged with 7a's fix in the same PR; judge on `npm run flakes` a week on as above.
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
- **19ac-4. `mirror`'s "and nowhere else" named the hand's own drop (shipped 2026-10-30).**
  Since #512 the check photographs the Perform tab's preview, a wide window on the dish
  where a cell is 0.055 of the plate tall and 0.154 wide, and a held drop reaches two cells
  up its column (0.11 of the plate, 22 to 25 against a drift of 8 to 9) where the check
  counted "round the hand" as one cell each way. Red on deploys 570, 576 and 580. The cells
  under the drop are now the ones within DROP_REACH (0.14) of the hand on the plate, read
  with `plateAt`; the bar is unchanged. Story in `docs/plan-shipped.md` §19ac-4.
- **19ac-5. `bottles`' other splatter red, "off the hand by 0.041 and 0.056", is unexplained
  and has not printed its strays yet.** Two of 183 Mac runs (before 2026-10-25); none since
  the line prints every pour away from the stroke with `down` and `lays` (#477, #562). The
  fling alone cannot do it: a splatter logs one pour a step (its first droplet), 50 to 70 a
  stroke, each 0.023 to 0.14 from the hand in a direction from a seeded stream, so the
  mean offset's spread is about 0.008 an axis and 0.04 is a 4e-6 to 3e-4 run, not one in
  ninety. The suspects are pours logged while the mouse was up and the pointer moving to
  the next stroke (each adds up to 0.5 to the mean), and the look's ring (`lays`). Judge
  the next red by its strays before changing anything.

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
  A third presentation on 2026-10-30 (#550, f3f052e): **68 ask, 0 frame, 0 tick over 71 frames
  asked for**, the "fewer is an ask the ear missed" side of the same line, three in two seconds
  with no stray reading against a bar of two; the same diff read the line green on four other runs.

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

- **19ad-6. `scene`'s worst-frame line goes red without a number, and the `open` shard has
  more marginal lines than 19ad-1 lists.** On 2026-10-30 (#550, f3f052e) `Measure · logic` read
  "the costliest frame of each room, the cold first one included, is under 20 ms" red with
  nothing after the dash: the line judges `Math.max(worst)` and prints no value, so a red
  cannot be told from a stall of 21 ms or 200. It should print the worst frame and the room it
  came from. The same day the `open` shard also read `renders`' "no sound, the Perform desk: the
  App renders for its clock and no more" at 1.7 commits/s (five commits in a 3 s window where the
  clock makes three or four, bar 1.5) and `drawwall`'s "the laptop's own frames reach Draw, at
  least 8 a second" at 7.3/s with the display drawing 14.7 frames/s, each once, each green on the
  same diff's other runs. Both belong in 19ad-1's measurement over a run of shards before any bar
  moves.

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

## 19ah. The owner's Mac runs main's deploy shards (2026-10-28)

Asked 2026-10-28: the owner's Mac helping CI as much as it safely can. A deploy that reaches
the GPU waited a mean 50 minutes per Mac shard for GitHub's macOS machines (13 such deploys
in 14 days, slowest shard's wait 80 minutes, 17 minutes of work per shard), 124 minutes
push to live. Built: a probe job in `deploy.yml` (`scripts/macrunner.mjs`, a fine-grained
token with Administration: Read in the main-only `mac-runner` environment) lists the
shards the owner's Mac may take when a runner labelled `owner-mac` is online and idle;
`checks.yml` sends those to it, never a pull request's run; each such shard first waits for
the harness ports (`scripts/macports.sh`); `scripts/macrunner-setup.sh` installs the runner
in `~/actions-runner` as the owner; `npm run macqueue` reports deploys by where their shards
ran. How it works and how to pause it: `docs/mac-runner.md`.

- **19ah-1. Open: measure it, then decide on a second machine.** After a week of deploys,
  `npm run macqueue -- --hours 168` against the baseline above: push to live, and how often
  the Mac was free. A second machine (the same script, a second runner on the same label)
  pays off if deploys still wait for the Mac or go to GitHub's queue while it is busy.
- **19ah-2. Open: a separate macOS user for the runner.** Jobs run as the owner and can read
  the owner's signing keys and `gh` sign-in. Only main's reviewed workflow runs there, but a
  user of its own (logged in, for the GPU) would take the reach away.
- **19ah-3. Shipped (with 19ah): a shard queued for a Mac that went to sleep after the
  probe.** `deploy.yml`'s `Watchdog` (`scripts/macwatch.mjs`) starts the deploy again with
  `hosted` and cancels the stalled run after 15 minutes queued with none running. It
  counts the run finished only when the checks' `WebGPU (macOS)` job has (19ah-3a: every
  job made so far is briefly finished after `reach`, before the shards' jobs exist). Still
  open: it holds an ubuntu runner for the length of the shards (free on a public
  repository); a shorter way would be a watchdog that wakes on a schedule.
- **19ah-4. Open: the by-hand Mac workflows** (`gallery`, `controls`, `pixels`, `film`) could
  take the same probe and lane; they are the longest Mac jobs and queue the same way.
- **19ah-5. Open: the job-started hook is copied by hand.** `macrunner-setup.sh` installs
  `scripts/macrunner-hook.sh` from the checkout it runs in; a change to the hook on `main`
  reaches the Mac only when the owner runs setup again. A check that the installed copy
  matches `main`'s (the probe could read a hash the hook prints) would say when it is stale.
- **19ah-6. Built: two shards at once on the owner's Mac.** Asked 2026-10-29 (the first
  deploy on the Mac, run 40929715769, ran its five shards one after another in 51.5
  minutes). Each runner takes one job, so a second runner on the same Mac is the whole of
  it, but the harnesses served on fixed ports, many shared (4351: `bottles`, `mirror`,
  `moving`, `render-app`), and `macports.sh` made a second shard wait. Closed unmerged as
  #570 and rebuilt on main 2026-11-07, with the nine harnesses written since converted too
  (`assistant`, `dawbridge`, `feedbackpane`, `liveshow`, `loopseam`, `openingtime`, `oscout`,
  `rig`, `tippad`): 86 scripts on 60 ports. The open #595 (our own pull requests' Mac
  shards on the Mac) wrote the same id; it takes 19ah-8 when it is carried onto main. Now every harness
  asks `scripts/ports.mjs` for its port, which adds `HARNESS_PORT_SHIFT` (a block of
  10000; unset everywhere but a runner's `.env`, so GitHub's machines and sessions keep
  their ports); `macrunner-setup.sh --runners 2` adds `owner-mac-2` in
  `~/actions-runner-2` with block 20000 and its own npm cache, and gives the first 10000;
  `npm run ports` (Measure, every diff) fails a harness with a bare port and proves two
  blocks serve one harness side by side while one block still collides. Open: the A/B on
  the M4 (wall time against 51.5 minutes; `startup`, `squeeze`, `drawwall`'s rate and
  `mirror` green with their bars as they are), and if a timing-heavy shard cannot share
  the GPU, a label that keeps it alone. Found along the way: `quick.mjs` keeps checks
  that share a port apart; giving each of its workers a block would let them run side
  by side (they still share `dist/`).
- **19ah-7. Open: every harness waits for its preview to answer.** Deploy 580 (2026-10-29)
  lost `tools` to `ERR_CONNECTION_REFUSED` on localhost:4346 9.4 s after `vite preview` was
  spawned, ports free and vite silent: the harness had slept a fixed 2.5 s. `tools.mjs` now
  asks `untilServing` (scripts/ports.mjs) and prints how long the server took; sixty other
  harnesses still sleep a fixed time, and with two shards on one Mac (19ah-6) the start is
  slower. Move them to `untilServing`, and read the printed times on the Mac first to see
  how slow a start gets.
- **19ah-9. Built: a Mac busy with other work hands the deploy back.** Deploys 679 and 682
  (2026-11-08, runs 42427960522 and 42436205976) went red on the owner's Mac and passed
  the same shards on GitHub's: `startup`'s "built ahead ... nothing built behind it" twice,
  "no pipeline was built on a frame" (particles) once, `phone` on a taken port, and every
  other shard into its 20-minute timeout. The open shard's own lines: the opening's 65
  builds 11.86 and 17.99 s (median 0.554 s, the display 6.77 s) against 3.43 s for 56
  (median 0.186 s) on the same Mac's first deploy of 10-29, so the half behind the show
  outran startup's 45 s wait for it; setup-node alone two to five minutes; and the port
  step found another checkout serving `signin` and `tiers`. The Mac now hosts sessions and
  Antigravity's queue running the same harnesses. Built: each Mac shard's first step
  (`scripts/macbusy.sh`) looks for a test browser or the ChromaGlass app at work (5% of a
  core or more, so a cancelled job's idle leftover does not count) that is not a deploy's
  own (no runner worker among its ancestors), waits two minutes, then
  fails listing it; the watchdog reads that step's failure and moves the deploy to
  GitHub's Macs at once (`npm run macguard`). Recovery that night: the deploy run by hand
  with `hosted`. Open: **19ah-9a**, work begun mid-shard still shares the GPU (a shard
  could look again before its timing checks); **19ah-9b**, `startup` prints "nothing built
  behind it" when its 45 s wait for the half behind the show ran out with it still
  building, which read as the show asking for nothing (the script is over 100 KB, so the
  wording waits for its split); and the 45 s wait has 7 s to spare on GitHub's Macs
  (38.45 s behind on deploy 671).

## 19ai. Smaller sessions: the separation plan (2026-10-28)

The owner approved splitting the files sessions read most (the plan page of 2026-10-28;
the docs PR numbers the series 19ai-1..10). Written here so far: 19ai-1 and 19ai-2 (the lighter `CLAUDE.md` and the folder maps), 19ai-3 and 19ai-4 (the plan's items 3 and 5, one PR of pure moves), 19ai-5, and 19ai-6 and 19ai-7 (the plan's items 7 and 8, the solver's two GPU files, each split by pass with a table of old lines to new files in its PR so a branch caught mid-move can re-apply its edit), 19ai-8, and 19ai-9 (the settings panel).

- **19ai-1. Shipped: a lighter `CLAUDE.md`.** 18,082 → 12,008 bytes loaded on every step;
  the checks table to `docs/checks-map.md`, CI to `docs/ci.md`, the domain map and the
  splits to `docs/architecture.md` (story in `docs/plan-shipped.md` §19ai-1).
- **19ai-2. Shipped: a `README.md` per folder** (`src/gpu`, `src/gpu/fluid`, `src/gpu/wgsl`,
  `src/gpu/wgsl/fluid`, `src/sim`, `src/lib`, `src/hooks`, `src/components/desk`,
  `src/components/phone`, `server`, `scripts`; `src/app` and `src/components/settings`
  came with their splits). A PR that changes a folder's exports updates its README.
- **19ai-10. Open: the frame loop, a piece at a time.** The visualizer's frame loop is one
  `useEffect` of about 5,500 lines (most of `LiquidVisualizer.tsx`'s 434 KB). Not split in
  one move: a PR that changes a piece of it first moves that piece to its own module (a
  function taking the frame's state, no per-frame allocation) in its own commit, held
  against the checks that read the file as text (19ai-3a), then changes it.
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
- **19ai-4a. Shipped with 19ai-8 for App's setters** (the story in `docs/plan-shipped.md`).
  The plate's setters in `LiquidVisualizer.tsx` still cast, and drop theirs when next edited.
- **19ai-8. Shipped: `App()` into its domains' hooks** (`src/app/`, 34 hooks; `App.tsx` 372,525
  → 215,830 bytes; the story in `docs/plan-shipped.md`). A check that reads App's source as
  text reads `scripts/appSource.mjs`, App and its hooks as one text.
- **19ai-8a. Open: what stayed in `App()`.** The settings' writers at its heart (the ride,
  the drift, `updateSettings`, `applyPreset`, the saved-look document, `lookPhase` and
  `magnetInHand`, the automation's effect: about 30 KB) were left, because they reach
  forward to `settingsRef`, `setDocDirty` and `lookFadeRef` declared after them, and a
  verbatim move cannot take them without reordering more than it moves; likewise the
  overlay's keys (they set panels declared later), the cue functions and `runAction`. Next
  is the 97 KB JSX return, which is components rather than hooks: the overlay, the desks'
  props and the phone's props as their own files.
- **19ai-8b. Open: hooks that take App whole.** A verbatim move keeps every name a run read,
  so `useCommandPalette` takes 52 parameters, `useRemote` 48, `useWallLook` 37. Once
  19ai-8a has moved the settings' writers, the ones that read a domain's state and its
  setters can take that domain's hook result instead of its pieces.
- **19ai-9. Shipped: the settings panel's sections into `src/components/settings/`**
  (`SettingsPanel.tsx` 201,442 → 23,916 bytes; the story in `docs/plan-shipped.md`). A check
  that reads the panel's markup as text reads `scripts/settingsSource.mjs`, the panel and
  its sections as one text.
- **19ai-9a. Open, found along the way: the panel's seventy-two props.** App hands
  `SettingsPanel` its props one by one (thirteen for the film and the pour, eight for the
  tempo), and the panel hands them on to its sections in `SectionCtx`. Once 19ai-8b gives
  each domain one hook result, the panel can take the film's or the tempo's whole, as its
  sections read them; until then a new value a section reads is four edits for one name
  (App, the props, `SectionCtx` and the object the panel builds).
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
- **19ai-6. Shipped:** `wgsl/fluid.ts` split into one file a pass under
  `src/gpu/wgsl/fluid/`, every kernel's text byte-identical (docs/plan-shipped.md, 19ai-6).
- **19ai-6a. Open, found along the way.** About sixty comments across `src/` and
  `scripts/` point at "`kernel` in wgsl/fluid.ts"; they still land on the map in that
  file's header, which names each pass's file. Repoint one when its file is next touched,
  not in a sweep of its own (it would collide with every open branch for nothing).
- **19ai-6b. Open, found by 19ai-2: `wgsl/fluid.ts` has no map.** 19ai-6a says the
  index's header names each pass's file, and the pass files' headers point there ("that
  file's header says what the WGSL port changes everywhere"), but the index opens with its
  imports and no header. `src/gpu/wgsl/fluid/README.md` lists the files in step order for
  now; the header comes back (or the pointers move to the README) with the next edit there.
- **19ai-7. Shipped:** `src/gpu/fluid.ts` split into a class chain under `src/gpu/fluid/`,
  a pure move (docs/plan-shipped.md, 19ai-7).
- **19ai-8. `npm run wgsl` passes a shader that will not build.** Found 2026-10-30 (32g): a
  kernel naming a variable `from` (a WGSL reserved word) passed `npm run wgsl`, and only
  `soapgpu` failed, at its first pipeline ("soapTransport failed to build"). The compile gate
  should also create each kernel's pipeline and read `getCompilationInfo()`, so a reserved word
  or a binding over the stage's limit is red there, in seconds. Again 2026-11-01 (38h-2): a
  plate-shader local named `pass` passed `npm run wgsl` and drew a black plate in the lab
  (`npm run microscope` read 0.00 at every zoom).
- **19aj-1. Open, found by #603: "keeps it rather than erasing it" reads the runner's frame
  rate.** The Blow stroke in `scripts/tools.mjs` steps the plate 272 times on the owner's Mac
  and 83–144 on GitHub's, so the pool it starts from (about 609 against 300–360) and the share
  of straw steps in the stroke move with the machine. On GitHub's Macs it went 301 → 242 on a
  PR that does not touch the bubbles (run 41129450339, green on re-run) and 325 → 284 on #603,
  where the owner's Mac reads 609 → 613 and 612 → 657 for the same code. The check should
  measure over a fixed number of plate steps, not wall time, so its bar means the same on
  every runner.
- **19aj-2. Open, found 2026-11-01: the wall's "a circle leaves the corners of its quad
  dark" goes red on PRs that do not touch the wall.** Quarantined until 2026-11-15 (19ak-1)
  so it reports without blocking. The corner patch it reads (0.26–0.31, 0.11–0.20 of a
  64×36 grid) sits close to the circle's edge; find whether the red runs read a lit edge
  (the sample too close) or a frame not yet drawn (the read too early), and measure the
  feature, not the moment.
- **19ak-1. Shipped:** known-flaky lines report and do not block, each with a plan id and
  an end date (docs/plan-shipped.md, 19ak).
- **19ak-2. Shipped:** a PR's site files run only the Mac checks that read them
  (docs/plan-shipped.md, 19ak).
- **19ak-3. What would save more Mac time.** Replayed over main's last 100 merges, 19ak-2
  saves 13%; what still runs every Mac check is the solver and the libraries the lab's
  one bundle imports (`scripts/lab-entry.ts` imports most of `src/gpu` and `src/lib`),
  the workflows, and scripts no check traces. (a) **Shipped:** a whole run re-run skips
  the shards an earlier attempt passed, and the steward skill re-runs failed jobs only
  (docs/plan-shipped.md, 19ak). (b) **Open:** the lab bundles per check, so a change to
  the magnet's library runs the magnet's lab checks and not the soap film's. (c)
  **Shipped:** the Mac shards wait for `tsc --noEmit`. (d) **Measured and left:**
  building the app once on ubuntu for all five shards. `dist/` is 116 MB (the films in
  public/) against a 15 s build, so the upload and five downloads would cost more than
  the builds they replace.
- **19ak-4. Open, found by 19ak-2: `npm run quick` lists every Mac check as "on the Mac
  only".** Its test for a check that serves the app read the trace, which over-reads (most
  scripts name `scripts/startup.mjs` in a comment), so all 96 read as serving the app and
  none of the 68 lab checks runs under `PW_WEBGPU=1` as its header says it should.
  `checkReads` now gives `site` from esbuild's import graph; quick should use it for
  `here`, once a session has timed the lab checks on software WebGPU.
- **19ak-5. Shipped:** a re-run no longer turns the logic shard red; `reach.mjs`'s selftest
  children run as a first attempt (docs/plan-shipped.md, 19ak).
- **19ak-6. Shipped:** the iPhone build fetches Capacitor's two binaries itself (curl
  retries, then the API's asset download) into a SwiftPM cache of its own, so a 504 from
  GitHub's release page no longer fails it (docs/plan-shipped.md, 19ak).
- **19ak-7. Shipped:** the other release-page downloads survive a 504 too: actionlint falls
  back to the API's asset download and CI caches its binary; the Mac app job caches canvas's
  prebuilt, Electron and electron-builder's tools on pull requests and retries `npm ci`
  (docs/plan-shipped.md, 19ak). A cold cache on the Mac app job still needs the pages.
