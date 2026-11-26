# 19. The checks, the build and the plan itself (continued)

Part 3 of 4 of §19; it begins at 19aa-9. The section starts in `19-checks-build-plan.md`.

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
- ~~**19aa-7. Startup's "moving for good no later than the old way" 7 of 192 (read 2026-10-25;
  the cause is not found, a breakdown is printed).**~~ Dropped 2026-11-22 (19ak-21, the owner's "cut the shit out of things"): the line is deleted from its harness and prints as a note, not fixed. The 7 reds read the show's own wait 1.79
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
- **19aa-4. `deploygate.sh` keeps the token off curl's command line.** It passes
  `-H "Authorization: Bearer $GH_TOKEN"` as an argument (`scripts/deploygate.sh`, the `api()`
  helper), and the owner runs it locally with `GH_TOKEN=$(gh auth token)`, so any process
  can read the token through `ps` while curl runs; bash prints nothing of it on a failure
  and Actions masks it, so it does not reach a log. Give curl the header on stdin
  (`-K -`, as `scripts/ghapi.mjs` does) and check with `npm run deploygate -- --history 20`
  that the same merges are trusted. Found by the check-skeptic on 19aa-3.

## 19ab. A shard's tool fetches are bounded, and the browser is cached

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

- **19ac-2. How long a tap on the phone's sheet takes to answer is unjudged.** The double
  tap now prints it ("handled N ms apart"); the old red implied up to about 400 ms on a
  busy Mac runner. Bound it where the phone's frame and renders checks live, from a
  measurement on the Mac, not from this line.

- **19ac-3. `bottles`' "one at the mirror" was the hand's own splatter, the stroke too near
  the middle (shipped 2026-10-29).** The canvas's (0.25, 0.3) to (0.4, 0.3) lay on the plate
  0.232 from its mirror, not 0.4; a fling (0.14) and the mirror's radius (0.12) reach 0.26.
  The stroke moved to (0.1, 0.3) to (0.25, 0.3), 0.44 from its mirror, and a line asks for
  the clearance each run. Story in `docs/plan-shipped.md` §19ac-3.
- **19ac-6, open** (E, S): **`mirror`'s "and nowhere else" reads at its bar on main since 2026-11-14.**
  Red once on a GitHub Mac (`show`, the closeup pull request for 38u, head b7c33e8): "Classic, calm,
  layer 1 turned a quarter: and nowhere else", 28.5 past its drift where 27.4 was allowed, 95.4 under
  the drop, each of the four drops alike (30.7 30.0 25.6 29.8 against a drift of 2.2 1.1 1.1 1.3), so
  not one unlucky drop. The line is judged in silence at the plate's own zoom, which that pull
  request's diff (the closeup's drawing, the treble's shake of a bubble) does not reach, and it was
  green on its three earlier heads. Main's own deploy 839 (c258561, the owner's Mac) is as close
  without it: `layer 1` 27.6 of 33.1 allowed, `layer 1 turned a quarter` 18.2 of 22.9. This line's
  history is 0.4 to 11 (19ac-4, and #225/#238 in `docs/plan-shipped.md`), so one of the nine merges
  between adcbe3f and c258561 roughly doubled what a drop leaves beyond its reach: the spun plate's
  dish (22n), the two-dye line gone (18e-5: the picture under and round a drop is brighter, and the
  bar is a share of the reading under the drop), or Velvet's stir. *Do:* run `npm run mirror` on the
  Mac at adcbe3f and at each merge after it and name the one that moved it; then decide whether the
  drop really spreads further (a fault in that change) or the picture changed and the reach or the
  bar's share was set on the old one (then re-measure DROP_REACH as 19ac-4 did, never widen the bar
  to fit). *Measure:* twenty Mac runs, GitHub's and the owner's, read under half the allowance on
  all three scenes; a drop mirrored where it should not be is still red.
  *Seen again 2026-11-22* on the video-lamp pull request (14ag-3, head b5bbf9a, a GitHub Mac, twice:
  the run and its one re-run): 27.9 and 25.2 past the drift where 24.6 was allowed, 91.0 and 90.9
  under the drop, all four drops alike (past it 14.8 28.6 31.5 27.2; 15.5 26.4 26.1 24.3), the
  first drop's drift high both times (12.1, 11.6). The same cell, row 6 column 4, 0.164 from the
  hand. That diff moves no solver code, and with no video loaded it draws Classic's plate from the
  same lines (the lamp ground's line moved below the closeup's detail, where nothing between reads
  it; `videolamp` holds Film Mix 0 to the byte). Its head before main came in (5f08157) read green
  on a GitHub Mac. Eight other Mac runs on main since bbfded1 read 14.0 to 24.4 against 23.9 to
  26.2 allowed, so the line sits within a few levels of its bar on most trees.
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
  *2026-11-21/22:* main's deploy 879 (492caba, GitHub's Macs) was red on this line and on its
  neighbour "covered with no wall, the worker's tick keeps the ear going", and four or more PRs
  that touch neither went red on them too, after #769's fix to the ear. Both lines are
  quarantined on pull requests and main's deploys from 2026-11-22 to 2026-12-06 (19ak-18),
  bars unmoved; the PR that finds which side is wrong takes the two entries out. Each line ANDs
  several clauses and the entry matches its name, so while it holds the ear reading its own
  frames while covered is held too: the fix splits the flaky clause into a line of its own first.

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
  with `hosted`. **19ah-9a** built below. **19ah-9b** shipped 2026-11-14
  (`docs/plan-shipped.md`): startup waits for the half behind the show while the app says
  its builds still come in, and that half builds two at a time. Open: **19ah-9c**, below.
- **19ah-9c. Open: a look changed to while the half behind the show is building.** That
  half is 113 builds now (it was fifty-odd in October), and until it is done a look that
  needs one of them builds it on the frame, the freeze `gpu/prepare.ts` exists to take
  away. On GitHub's Macs it took 28 to 46 s one at a time; 19ah-9b builds it two at a
  time. No check changes look inside that window: startup's "no pipeline was built on a
  frame" changes looks only once the half is done. Wanted: the half's time on the owner's
  Mac after 19ah-9b (startup's line prints its pace against the opening's), a look change
  at a few seconds into the half to see what it costs, and whether the half should be
  asked in the order looks are likeliest to need it (the set list's next look first).
- **19ah-9a. Built: work begun mid-shard waits for the deploy, or hands it back.** Main's
  deploy of 2026-11-08 began its Mac shards at 18:16Z, each past its first look, and then
  sessions began GPU work on the Mac: filming the hero, `lampzero.mjs`, `renders.mjs` in
  Antigravity's clone, a driver of the app. `startup` went red on the Mac ("no pipeline was
  built on a frame"), the tools shard's first look refused the Mac, and the deploy went to
  GitHub's Macs to queue behind pull requests. Built, both sides: the first step now marks
  the Mac held from its first line (`~/.chromaglass-runner/deploy-<runner>.json`) and a new
  last step, "The owner's Mac stayed free of other work" (`always()`), marks it ended;
  `launchChromium` and `npm run desktop` wait while a shard holds the Mac and for 120 s after
  one ends, for the next shard (`scripts/macdeploy.mjs`; a mark whose runner worker exited,
  older than 30 minutes, or from a shard that gave up holds nothing; only on a Mac, never in
  a job). What does not read the mark, `scripts/checks.mjs` looks for before each check and
  after the last (`macbusy.sh --again`): still there after two minutes, or there at all right
  after a red check, the shard stops and its last step fails, which the watchdog reads as
  busy; so the watchdog now watches until every Mac shard has finished, not until each is
  past its first step. Checked by `npm run macguard` (the hold rule, `macbusy.sh`'s marks
  read back, the last step's failure, the watchdog's new cases) and by hand in a session: a
  red check beside a busy fake headless shell stopped its shard and failed the last step,
  and a launch held by a mark ended 112 s ago went on 10 s later. Open: the first deploy on
  the Mac with a session working beside it (read the harness's "a deploy holds the owner's
  Mac" line and the shard's checks green). Found along the way, **19ah-9c**: a session's
  script that launches Playwright itself (`detail.mjs`, `webgpu-smoke.mjs`, and scratch
  drivers) skips the mark and is caught only by the look between checks; and a deploy handed
  back queues behind pull requests' Mac runs, which a hosted deploy could jump.

## 19ai. Smaller sessions: the separation plan (2026-10-28)

The owner approved splitting the files sessions read most (the plan page of 2026-10-28;
the docs PR numbers the series 19ai-1..10). Written here so far: 19ai-1 and 19ai-2 (the lighter `CLAUDE.md` and the folder maps), 19ai-3 and 19ai-4 (the plan's items 3 and 5, one PR of pure moves), 19ai-5, and 19ai-6 and 19ai-7 (the plan's items 7 and 8, the solver's two GPU files, each split by pass with a table of old lines to new files in its PR so a branch caught mid-move can re-apply its edit), 19ai-8, and 19ai-9 (the settings panel).

- **19ai-10. Open: the frame loop, a piece at a time.** The visualizer's frame loop is one
  `useEffect` of about 5,500 lines (most of `LiquidVisualizer.tsx`'s 434 KB). Not split in
  one move: a PR that changes a piece of it first moves that piece to its own module (a
  function taking the frame's state, no per-frame allocation) in its own commit, held
  against the checks that read the file as text (19ai-3a), then changes it.
- **19ai-3a. Found along the way.** The review said `lib/stir`, `squish`, `plateRock` and
  `turntable` import types from the component; they only name it in comments. The one
  importer was `hooks/useSongRender.ts`. And 26 checks read `LiquidVisualizer.tsx` as text:
  a later split of the frame loop (the review's item 11) moves code those checks grep, so
  each piece moved has to be held against them the way this one was (a pattern that matched
  the old file and no longer matches the new one is a check that moved with the code).
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
- **19ai-9a. Open, found along the way: the panel's seventy-two props.** App hands
  `SettingsPanel` its props one by one (thirteen for the film and the pour, eight for the
  tempo), and the panel hands them on to its sections in `SectionCtx`. Once 19ai-8b gives
  each domain one hook result, the panel can take the film's or the tempo's whole, as its
  sections read them; until then a new value a section reads is four edits for one name
  (App, the props, `SectionCtx` and the object the panel builds).
- **19ai-5a. Open: watch what the ratchet costs a feature.** In the two weeks to 2026-10-28,
  App.tsx grew in 8 merged PRs, SettingsPanel.tsx in 8 and LiquidVisualizer.tsx in 7. Each
  such PR now has to move as many bytes out as it adds, wiring lines included. If that turns
  out to cost more than the splits save, the owner decides whether over-budget files get a
  small fixed allowance; until then the rule is the one approved.
- **19ai-5b. Open: the ledgers come out.** 19m (PLAN.md split by section) takes PLAN.md and
  the archive off the list; `docs/guide.md` and `docs/judging.md` want the same split by
  part of the app; `scripts/checks.json` could be one file per shard.
- **19ai-6a. Open, found along the way.** About sixty comments across `src/` and
  `scripts/` point at "`kernel` in wgsl/fluid.ts"; they still land on the map in that
  file's header, which names each pass's file. Repoint one when its file is next touched,
  not in a sweep of its own (it would collide with every open branch for nothing).
- **19ai-6b. Open, found by 19ai-2: `wgsl/fluid.ts` has no map.** 19ai-6a says the
  index's header names each pass's file, and the pass files' headers point there ("that
  file's header says what the WGSL port changes everywhere"), but the index opens with its
  imports and no header. `src/gpu/wgsl/fluid/README.md` lists the files in step order for
  now; the header comes back (or the pointers move to the README) with the next edit there.
- **19ai-8. `npm run wgsl` passes a shader that will not build.** Found 2026-10-30 (32g): a
  kernel naming a variable `from` (a WGSL reserved word) passed `npm run wgsl`, and only
  `soapgpu` failed, at its first pipeline ("soapTransport failed to build"). The compile gate
  should also create each kernel's pipeline and read `getCompilationInfo()`, so a reserved word
  or a binding over the stage's limit is red there, in seconds. Again 2026-11-01 (38h-2): a
  plate-shader local named `pass` passed `npm run wgsl` and drew a black plate in the lab
  (`npm run microscope` read 0.00 at every zoom).
- **19aj-4. Open, found 2026-11-21: Measure · lab9 runs out of its 25 minutes on a slow
  runner.** It takes 14 to 19 minutes on a normal one (deploy 854: moiré 3:28, leandisplay
  7:14, glitter 2:58) and was cancelled at 25:00 on #878's run 44884668374 with leandisplay
  alone at 12:56. Move "Glitter, the lens and the side lamp" (about 3 minutes) to lab8 or
  lab5 (two checks each), so a runner at two thirds of the usual speed still finishes.
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
- **19ak-8. Open: the three quarantines renewed 2026-11-15, to 2026-12-06.** The first
  three quarantines (19aa-7, 19aj-1, 19aj-2) ended on 2026-11-15 with none of the three
  fixes shipped. That morning about half the open PRs (a count of PRs, not of runs) went
  red on startup's "moving for good no later than the old way", the show's own wait 2.8
  to 4.3 s against the control's 1.0 to 1.5 s plus its second, on PRs that do not touch
  the opening; the Blow stroke's and the wall's lines block again too. Each is renewed
  for the 21 days the rule allows; no bar moved, and main's deploys still hold all three to their bars. Two things
  to read before 2026-12-06: whether the startup line got worse after #861 (19ah-9b's
  two behind lanes, `LATER_LANES` 2, sharing the GPU with the show's opening; deploy 849
  at 37bae99, which carries #861, passed it), and whether 19aa-7d (#878, the control's
  compile stop priced) moves the control's side of the line. A second renewal is not
  the answer: fix the item or take the line out of the bar with its own reasons.
- **19ak-9. Open: the quarantines of 2026-11-21, to 2026-12-06 (intro 9c, the drawwall
  control).** Reported: "The PR runs keep failing. All the time." Measured over the
  `Checks` runs of pull requests from 2026-11-14 to 11-21 (none ran 11-16 to 11-20): 52
  red of 93 that finished. On 11-21, 11 of 26 were red, and 8 of the 11 were the intro's
  9c on `Measure · browser` (ubuntu), "N changes during the 4 render compiles", red on
  main's own deploy too (run 44895188598, ec9dfd0), on PRs that do not touch the loading
  line. 3 of those 8 were also 9 and 9b's "no opening in the prepare log", the check not
  finding the log, which #900 (14v-12b) fixes and which is not quarantined: its line reads
  "never", and a line that read nothing is not the flake. Two more were the drawwall
  control, "lands on the wall elsewhere ... median ~390, centre none", the same numbers on
  every run since the 11-21 merges, so a change of behaviour (8-draw-a-7, #900 prints
  the display's own account of it), not noise. Both are quarantined on pull requests
  from 2026-11-21 to 2026-12-06 so unrelated PRs stop going red on main's reds; no bar
  moved, main's deploys still run both lines, and the line still prints in full as a
  warning. The PR that fixes each (#897 for 9c, the 8-draw-a-7 fix for drawwall) takes
  its entry out. *Found 2026-11-21 (PR #679's run 44927401897): 9c's entry never held,
  because `scripts/intro.mjs` printed "1 of 14 FAILED" and never the "13/14 checks
  passed" tally that `quarantined()` in `scripts/checks.mjs` needs before it honours a
  line; the films PR adds the tally line (the drawwall harness already printed one).* *9c's entry came out with #897 (14v-12's loading line holding its count until the render compiles are all asked), the fix it named; the drawwall entry stays until 8-draw-a-7.*
- **19ak-10. Decided: a deploy still trusts a PR run that was green through a
  quarantine.** `deploygate.sh` rules 4 and 5 trust a PR's green `Checks` run, and a run a
  quarantine held green is green, so a line red on the merged tree can go live on the PR's
  word; docs/ci.md said main's deploy holds every line to its bar, which held only for a
  deploy that ran its own checks. On 2026-11-21, 7 of the 15 green PR runs were held
  green by startup's quarantined line (19aa-7) and one by the wall's (19aj-2): the
  job's `Quarantined: <check>` warning annotation says so, and a gate could read it and
  run the checks itself. Put to the owner the same day with the cost: the site would stop
  updating until the startup line and 9c are fixed. The owner chose to keep trusting
  them. docs/ci.md now says so.
- **19ak-12. Open, found by 19ak-9: the live stream with AAC on GitHub's Macs.** Three
  runs (11-15 twice, 11-21 on #893, which does not touch the stream): "the audio covers
  the stream — 29.95 s of them against 30.57 s streamed", "the sound is where the page
  made it ... 85, 65, 58, 58, 56 ms" against ±31 ms, and once 3 clicks of 5. The same
  shape as 37x-4g-1 (the audio encoder's queue has no bound, so a loaded Mac emits AAC
  late), so it may be the app, not the check: read the run's `audioQueue` before
  touching the bar.
- **19ak-14. Open, found 2026-11-08: `npm run widedials` is red on main.** "Heat Spread at 2
  keeps the heat" reads ×0.9997, 0.9748 and 0.9657 where its bar wants the heat held. Not yet
  run down: either Heat Spread at 2 now loses heat it kept (a real regression in the heat
  field's diffusion) or the check reads a quantity that a later change made swing. Find which
  before touching the bar.
- **19ak-15. Open, found 2026-11-08: `oscout`'s `plate >= 10` is a fixed floor under a count
  that swings with load.** A main deploy went red on 9 kicks in 15 s; on the Mac the same count
  ran 10 to 24 before 14d-2. *Fix:* assert what the feature promises (each kick the ear hears
  goes out as a message), by counting the ear's kicks over the same window and holding the OSC
  count to them, not to a number. *Measure:* the ratio on a loaded and an idle run.
- **19ak-18. Decided: main's deploys honour the quarantines too, until 2026-12-06.** From
  11-21 12:26 PM Pacific the site stayed on deploy 869 while deploys 871, 872, 879 and 881
  were each red on a line already known to flake and that none of their changes reached:
  startup's "moving for good" (19aa-7), intro's 9c (19ak-9), the ear behind the wall
  (19ad-1) and the Live Show's film (19ak-19). Put to the owner on 2026-11-22 with the cost
  (a regression on one of those lines could go live while the entry holds); the owner chose
  to hold them on main too until 12-06. `quarantined()` in `scripts/checks.mjs` honours an
  entry off a pull request only before `MAIN_QUARANTINE_UNTIL` (2026-12-06), whatever the
  entry's own end date, so from that day main holds every line to its bar again without
  anyone taking anything out; a run outside CI holds every line. The ear's two lines and
  the Live Show film line got entries for the first time, and `scripts/liveshow.mjs` now
  closes on "N/M checks passed", without which no entry on it could hold. *Measure:*
  `node scripts/checks.mjs --self-test` (held on a push before the cut-off, red from it,
  red outside CI). *Open:* each line's fix is its own item; when 12-06 comes, a line still
  red on main is red on every deploy again, which is the point. `checkguard` flags an
  entry's end date moving later but not `MAIN_QUARANTINE_UNTIL`; moving the date into
  `scripts/checks.json` would let it.
- **19ak-19. Open, found 2026-11-21: the Live Show's "the Plate source's stream moves with
  the film" goes red when the test film's own clock stalls.** On deploys 871 and 872
  (owner-mac-2) and #900's first PR run (a GitHub Mac), the film the harness plays went 0.5
  to 1.3 s in a 2.5 s window, so the stream rightly showed a still bar; green on 867 and
  869. The stream is not the fault; the runner's load starves the film. *Fix:* make
  `moving()` in `scripts/liveshow.mjs` say when the film's own clock stalled (its `during`
  line already reads it) and hold the stream to the film it was given, then find why the
  film stalls under load. Never a looser bar. Until then the entry also holds a stream
  frozen while the film ran, the regression the line is for: split that case into its own
  line ("the film ran and the stream stood still") first. Quarantined on PRs and main's deploys
  2026-11-22 to 2026-12-06 (19ak-18); the fix takes the entry out.
- **19ak-22. Open, found on main's deploy of 2026-11-22 (ebfa3324): Classic, calm, moves the
  plate beyond a drop's reach.** `npm run mirror`'s "and nowhere else" read 29.0 levels past
  the drift at row 4, column 4 against 26.6 allowed (layer 1), and 30.8 against 25.1 turned a
  quarter (28.3 against 27.7 on an earlier run), with 91 to 95 under the drop. Classic's
  plate has had a crowd of small cells since 38w-15 (#923) and the physics merges of the day
  (#930, #932), so what lies beyond a drop's reach is no longer still. Find whether Classic
  calm moves on its own (then the allowance should read the plate's own motion without the
  drop, as the drift column does) or whether a drop's reach grew. Never a looser bar.
  Quarantined on PRs and main's deploys 2026-11-22 to 2026-12-06 (19ak-18); the fix takes
  the entries out.