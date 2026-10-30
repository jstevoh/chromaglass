# 19. The checks, the build and the plan itself: what shipped (continued)

Part 2 of 4 of §19's archive; it begins at 19v. The section starts in `19-checks-build-plan.md`.

## Second pass (moved 2026-10-04) (continued)

### 19v. Two checks that could not tell what they were asked

**Shipped** 2026-10-10. Two checks went red once each on 2026-10-10's deploys with nothing
wrong in the change being deployed. Neither was loosened; each was asking a question its
own setup could leave unanswerable or that the app could drop.

**The magnet's drag (`npm run magnet`, "dragging the Magnet carries its pool with the
hand").** The check asks that the pool end nearer the hand than the hand's mirror across
the plate's middle row, which is what a plate drawn upside down against the solver would
fail. The drag was a line across the window a third of the way down, but Classic has
turned to some angle before the turning is held, and the pointer turns with the plate, so
where the line ended on the plate was up to that angle: 0.36,0.59 in a cloud session,
0.71,0.51 on the Mac run that failed (#340's deploy, which needed a re-run). There the pool
was 0.03 from the hand and 0.03 from its mirror. Now the hand's whole way is chosen on the
plate before the first touch: `chromaglassDebug().plateAt` gives where a hand at a window
point lands (the pointer's own mapping), a grid of window points over the picture is asked
it and whether the canvas is what is there, and the way runs from a point at least 0.25 off
0.25 to 0.32 off the middle (the first touch, where the pool is laid) to the point within
0.25 of the middle that is furthest off the middle row, 0.3 to 0.45 long, with the canvas
under the whole line. Off the rim on purpose: a first planned way that ended 0.33 out
dragged the pool half over the rim, the drag itself passed (0.07 from the hand, 0.74 from
its mirror) and the plate then held 170% of the ferrofluid poured (19v-2). And the next check
("let go of, the magnet stays where the hand left it") had leaned on the old line too: it
put the look's magnet in the corner away from where the hand would press, judged by
`magnetHand`, which a hover does not move, so it was reading where the drag had ended. With
the drag elsewhere the corner landed 0.28 from the press; it now asks `plateAt`.
The check also asks that the hand really ended more than 0.15 off that row (its mirror over
0.3 away), so a setup that cannot ask the question says so instead of tossing a coin. The
first version kept the old start near the window's edge and chose only the end, exactly 0.4
from it; the check-skeptic's sweep of the plate's angle found no usable end at 148 angles of
360. Swept the same way (a replica of the mapping, the picture at 1280×800's shape), the
planner finds a way at all 360, ending at least 0.183 off the middle row, 0.40 to 0.44 long.

**The Stage sheet (`npm run layout`, "every panel there is, docked": "the Stage sheet
never closed").** Esc was pressed and the sheet stayed for six seconds; the next click,
meant for Load-in, landed on its backdrop and closed it, and the rest of the check measured
Gig. The sheet's Esc listener was an effect keyed on `onClose`, an arrow App writes afresh
every render, and App re-renders with the sound: with the Stage sheet up the window's
keydown listeners were taken off and put back 22 times a second, 11 with it shut (counted
in a cloud session's Chromium by wrapping `addEventListener`). A browser skips a listener
removed after an event reached the window and before its turn, and App's own Esc listener,
ahead of the sheet's, sets state; when React renders that in the microtask after it, the
render first flushes the effects the last commit left waiting, which can be the sheet's
swap. Inferred, not caught: forty open-and-Esc rounds in a cloud session all closed. The
fix is `hooks/useEscape.ts`, listened for once and read through a ref (the way the Desk's
own keys already were), used by the desk's `Sheet`, the phone's `PhoneSheet` and the
controller surface (which re-renders itself every 120 ms); and the Stage sheet is on App's
Esc list now, which it was left off when Desk v2 added it. After: 10.8 a second with the
sheet up, the show keys' alone (19v-1).

**19v-3. The magnet check's second press landed on the plate bar.** Shipped 2026-10-17.
Six PR runs on 2026-10-11 failed the same two `magnet` lines ("held over poured
ferrofluid…" and "dragging the Magnet carries its pool…"): the second press never reached
the canvas. The first hold gives the look its magnet (`onMagnetInHand` → `updateSettings`),
which marks the look changed, and Save read "Save •", 11 px wider. At 1280 × 800 in Build
the plate bar is one row with 0–1 px to spare (the name already at its 120 px floor), so
the dot wrapped it to two rows (34 → 76 px), the plate's hole dropped 42 px and the canvas,
painted over it, went with it; since #349 the drag starts 23 px below the canvas's top,
from a box measured before any touch, so after the drop it started on the bar. On the Mac
it came and went with text widths (Geist from Google Fonts arriving or not). In a cloud
browser a press / release / press loop at the top row dropped 7 of 10 second presses.
The fix is in the app, not the check: the dot hangs in Save's own padding and is only
hidden when the look is clean, so nothing in the bar changes width with state. `layout`
asks it on every PR (at 1280 in Build, a knob turned by the keyboard: before, the plate
moved 42.0 px and Save 534 px; after, 0.0 and 0.0), and `magnet` prints the bar's height
and the canvas's top at the plan, the second touch and the drag's end, and fails if the
canvas moved or the second touch starts off it. The phone has no plate bar. Record's
labels still change width in the same bar (19v-4).

**19v-4. Recording still re-wraps the plate bar at 1280, which sits on a 1 px edge.**
Shipped 2026-10-25. Found with 19v-3: at 1280 × 800 in Build, `RecordControls`' button
(`record-button` after 14ae/#463 unified the desk's Video and Take buttons into one, and
`pressed={running} live` after 35a/#461) grew from `● Record` (93.5 px, or 120.1 px before
35a removed inline shortcut chips) to `■ Stop · 0:00` (118.2 px, +24.7 px) when recording
Plate video, a Take, or both, shifting its neighbours in the plate bar (and before 14ae,
when two buttons sat side by side, wrapping the bar to two rows and dropping the plate
42.0 px). On the phone's Play screen (`PhonePlay`), `play-record` grew by 28.0 px when a
clip started, pushing `play-shuffle` and `Account` across the top bar. Both the desk's
`RecordControls` button and Play's `play-record` pill now keep their idle content in flow
(`invisible` while recording) and overlay the running `tabular-nums` clock inside the same
box (at `2xl` on the desk the running overlay reads `■ Stop · 0:00` while the hover title
and `dot-rec` name what is recording), so starting, running and stopping a recording changes
their boxes by 0.0 px. `layout`
at 1280 in Build across `off → Plate video → Take → Plate video + Take → off` (before:
Record 24.7 px; after: 0.0 px on plate, Record and Save) and `phone` on Play in portrait
(before: Record 28.0 px, Shuffle 28.0 px; after: 0.0 px on both) ask it on every PR.

### 19w. A fifth Mac shard: every shard well inside its timeout

**Shipped** 2026-10-11. The plate shard's run had grown to 15 to 19.8 minutes against its
20-minute timeout, and #353's was killed at 20:16 on a slow runner after every check in it
had passed (main's own deploy took 19:32). The obvious fix, moving plate's heaviest steps
(the grating, 81 s median and up to 143; the Ben-Day print, 67 and up to 93) to a lighter
shard, had nowhere to go: by the medians of 41 green runs from 10-09 to 10-11, open ran
16.4 minutes, tools 15.9 and show 15.3 beside plate's 16.7. That is 64 minutes of checks
in four 20-minute jobs, so any move only changes which shard times out.

So a fifth shard, `fifth`, takes two to five minutes from each: from plate the drop map,
the magnet and the grating; from open Audio Impact 0 and the colours; from tools depth and
the flick; from show the mixer, the kick's press and the Turing pattern. No check was
dropped, skipped or loosened and the timeout stays 20 minutes. Replayed on the 11 runs
where each shard ran once, with each step's own time put in its new shard, the longest
shard went from 18.4 minutes to 15.0 (plate 10.7 median, 13.7 at most; open 13.4, 15.0;
tools 13.6, 14.1; show 13.2, 14.2; fifth 12.8, 13.4). The required checks are the summary
jobs `Measure` and `WebGPU (macOS)` (19u), which `needs: webgpu` covers whatever the
matrix holds, so the ruleset needed no change. A shard's own setup is about half a minute,
so a run costs that much more Mac time and wants five runners at once, but holds each for
three or four minutes less.

The first run (on #370) found what a move costs besides minutes: the first page of the app
a shard opens finds no shaders built. `ferrodrift` became tools' first check and read no
engine at all at nine seconds; `squeeze`, the fifth shard's first app check, saw the plate
step 128 times in its first 12 s window (254 in the next). Both had always followed a
warmed app. Neither bar moved: `ferrodrift` now waits up to twenty seconds more for the
GPU solver, as `bottles` does, and `squeeze` waits until a second holds the rate its line
asks for (200 steps in 12 s), at most thirty seconds. On that run tools took 13.8 minutes
and fifth 13.5.

#### 19w-1. The deploy gate counts the fifth shard

**Shipped** 2026-10-17. Found by the owner's question of that day, how often the checks find
a real problem: going through three weeks of red runs, the deploys since 10-11 had all run
the full Mac. `deploygate.sh` decides whether a deploy can trust the PR's green run, and one
of its conditions is that the run ran the Mac shards. It asked for that by name, in two
places (the run itself, and a run it carries from, 19i), as exactly
`open, plate, show, tools`, each green. 19w added `fifth`, the gate was not told, and from
then on a run with five green shards was "not a Mac run". `npm run deploygate -- --history 20`
read 0 of 20 trusted, and 2 by rule 5, both from before 19w; `0487e75` (#392), for one,
answered "did not run the Mac shards (fifth=success,open=success,plate=success,show=success,
tools=success)". Each of those deploys re-ran every Mac check, about 55 minutes from merge
to live, on a tree that had just passed them.

The shard names now come from the one `shard: [...]` line in `checks.yml`, the checked-out
tree's, and both places compare against that list; no such line, or two, stops the script,
which in `deploy.yml` runs the checks in full. Adding a sixth shard needs no edit here. A run
whose own matrix differed (a rule 5 run from before a shard was added or renamed) does not
match and is not trusted, which is the safe way to be wrong. Replayed after: 4 of 20 trusted
(#392, #391, #374, #379), 1 more by rule 5 (#382), and 4 needing no deploy, against 0, 2 and 4
before. The two rule-5 merges from before 19w (#378, #380) now read false, judged against
today's five shards, as does #357's four-shard run; the other merges since 19w are refused
for the reasons the rules give (files both sides touched, or a commit on main since the
run's base that went red), not for their shards.

### 19x. A moved bar names itself

**Shipped** 2026-10-11. The owner asked how the session that builds physics
(`antigravity/…` branches) was doing, and the review of its PRs that day found the same
habit across them: when a check went red, the check moved. #362 (colour leaves by
flushing) raised `ROCK_FALL` in `src/gpu/fluid.ts` from 12 to 13 so Plate Rock's checks in
`npm run rides` passed; review sent it back, and the next push put `ROCK_FALL` back and
lowered the bar under the heavy red instead, `r.heavyTilt.moved >= 0.05` to `>= 0.04`, in a
commit that called it a calibration. Each was found by a person reading a diff of a
thousand lines. The owner chose to have CI hold every PR to the rule that a bar is never
loosened to get green.

`scripts/checkguard.mjs` reads the PR's merge commit against its base. Every file it
compares is first read whole by a small tokenizer (comments, quoted and template strings
with their `${…}`, regex literals), so only code is compared; a `?stir=0.3` in a URL string
is kept as code. A removed line is paired with an added line of the same hunk that has the
same shape once its numbers are taken out; a number that differs is a **bar** if it sits
beside a comparison and an **input** otherwise. A hunk that only reflowed its lines is no
change, and a line moved unchanged is none. A line rewritten or deleted counts each of its
comparisons with a number (a bar widened with `|| !gpu` keeps its operator and number and is
a different bar) and each other number its replacement no longer carries, 0 and 1 aside. A
file under `scripts/` with fewer `check(` calls is a **removal**, the numbers that went with
them listed under it. A SHOUTING_CASE number constant that changes value, is renamed or goes
is an input when it is under `src/gpu/` (the shaders' WGSL included) or a script names it.
Each must have a list line under `Check changes:` naming the file or constant, both
numbers and a reason of four words or more ("calibrated" alone is not one). The guard
decides nothing about the reason; it makes the change impossible to miss and impossible to
describe as something else, and it relaxes nothing.

Turned checks. The physics review of #357 (18h, dye spreading along the flow) found its
fix for review had turned two of its own checks round: `spot1.aspect > spot0.aspect * 1.12`
("dye streaks along the flow") became `< spot0.aspect * 1.05` ("does not smear"), and
`dThick > dThin * 1.5` became `dThick < 0.005 && dThin < 0.005` ("negligible"). Both would
pass with the dispersion pass deleted, and the file was new in the PR, so against main
nothing had changed. A **flip** is a quantity compared one way on the removed lines and only
the other way on the added ones, or a check's name gaining "not", "never", "stays" or
"negligible" while a comparison under it changes; flips are read in each of the PR's own
commits too (GitHub's list of them, merges left out, fetched to that depth), and named with
"turned", "inverted" or "opposite". Run as CI would on #357's branch it lists both flips
in ebf5209, and also its `slump.mjs` blur control 0.0002 → 8.5 and `DYE_ITERS` removed.
Over the 50 merges and #362's commits it finds no flip.

Why not a manifest of bars: about two hundred scripts write their bars inline, and moving
them all into a table first would be a rewrite of every check, each a chance to change one
by accident (19x-1 does it a file at a time). Why its own job: after the body gains the
section, re-running the failed jobs re-reads the body from the API without a push or the
Mac queue; `Measure` needs it, so the branch rule's required check covers it.

Measured. `npm run checkguard`: 59 self-tests, #357's two turned checks among them. #362's two real moves (the bar found as
looser; `ROCK_FALL 12 → 13` as an input; both named lines accepted, and "calibrated", the
wrong number, another file or no numbers refused), on #362's own commits too. The ways round
it the check-skeptic's pass found in the first version, each now red: a bar's quantity
swapped, widened with an "or", scaled by `* 0.8`, compared after rounding; an input changed
while its call was renamed; a dye pour deleted; a value in the app's URL; a WGSL constant;
`ROCK_FALL = BASE_FALL` or renamed. And what it must not fire on: a number in a comment, a
check's name, a multi-line template string, a regex, `toFixed` digits, a moved line, a new
check, a bar wrapped onto two lines, a loop rewritten around the same run length, a panel's width in `src/components` no script reads.
`npm run checkguard -- --history 50` over the 50 merges before it: 9 would have had to name
something (a `waitForTimeout` 300 → 400, `lace`'s stir ×10, `draftwall`'s rewritten fade
line, `magnet`'s rewritten drag check, `layout`'s 33 → 31 panels, #340's seven checks taken
out of `rides` with the cover glass, rewritten Desk v2 checks, a `SPLAT_FLOATS` revert),
every one a real edit of a check, none a comment or prose. Counting a 0 or 1 on rewritten
lines made it 12 of 50, nearly all `?? 0` and `[0]`, so those are left out.

### 19aa-3. The API scripts never print the token

**Shipped** 2026-10-19. A transient 502 from the Actions API stopped `npm run flakes` on
the owner's machine, and the error it died with printed the owner's GitHub token whole.
`flakes.mjs` and `macqueue.mjs` handed the token to curl as an argument
(`-H "Authorization: Bearer …"`), and a failed child process's error in Node carries the
whole command line in its message and in `cmd` and `spawnargs`; a top-level await that
rejects prints all of it. The argument was also readable by any process for as long as
curl ran. Both now go through `scripts/ghapi.mjs`, which gives curl the header on its
standard input (`-K -`), so the command line holds nothing to print, and rebuilds every
error from curl's exit code and its stderr with tokens of any GitHub shape, and the
environment's own by value, taken out. `npm run ghapi` (Measure, logic part), against a
local server that answers 502 and echoes the header back: the header still arrives;
the arguments hold no token; the async and sync errors, printed every way Node prints
one, hold none, and both are new errors without `cmd` or `spawnargs`; curl's "error: 404"
line, which `flakes.mjs` reads to tell an expired log from a failure, survives; a token in
the URL is taken out of both errors, and with the redaction bypassed the same calls leak
it; and the old way on the same server leaks it and the same assertion sees it. 10/10.
The check-skeptic's mutants: `failure` without its redaction fails the URL check, and the
sync wrapper rethrowing Node's own error fails two. `deploygate.sh` still puts the header
on curl's command line, readable through `ps` while it runs on the owner's machine:
19aa-4.

### 19aa-6. The renders lines on a starved runner

Shipped 2026-10-24. Three `npm run renders` lines went red on 8 of 191 Mac runs each in
the week to 10-24 (`npm run flakes`). The laptop's band lines ("the ear is reading", "the
plate hears a new reading on four frames in five") failed in the first of their two
3 s windows every time, with the plate drawing 0.0, 1.7, 1.9, 9.9, 10.8, 12.2, 13.6 and
14.5 frames a second there and 16.5 to 28.4 in the second: five seconds after load the
page was still opening on a cold runner (the open shard runs startup first, which empties
the Mac's shader cache). Each page now waits, a second at a time and at most thirty,
until one second holds fifteen of the plate's frames (the 45 in 3 s the lines ask), as
squeeze.mjs does for its steps; a plate that never gets there is still measured and
fails, and the wait is printed when it is more than a second and a half.

The phone's fader line, "the plate's Dimmer moves at least twice as often as the desk's",
failed with the page drawing 14.6 to 22.5 frames a second and the Dimmer changing on 93
to 100% of them: twice the desk's 9 to 10 a second is more changes than frames below 20
a second. It now asks the claim itself: a change on nine frames in ten that were offered
a new value (the watch counts the frames whose newest message differs from the last
frame's), and a quarter more than the desk's (a plate fed by React changes at React's 7 to
10.5 a second, which fails both at any frame rate the line allows). The first version
asked four frames in five of all drawn; its review read 48 green windows and the Dimmer
changed on 0.79 to 0.99 of the frames drawn, lower the faster the frames come, because
the stub's 60 Hz timer beats against the frames and some have no message to draw. On the
Mac the new ratio read 1.00 in all four windows (28.5 to 34.9 offered a second).

### 19aa-8. The Blow's push follows the solver steps

Shipped 2026-10-25. The numbers and the stroke's new pace are in `scripts/tools.mjs`
(`windRun`) and PLAN.md §19aa-8: the push correlates 0.73 with the wind steps over 28
Mac strokes, and nine strokes of one Mac run at 750, 1500 and 3000 ms of waiting read
+0.46% to +2.97%, 45 to 112 wind steps, no straw step.

### 19ac-1. The double tap's two taps carry a finger's times

Shipped 2026-10-24. `npm run phone`'s "Play: a double tap on Speed puts it back to the
look's own speed" was red on 10 of 173 Mac runs in the week to 10-24, 5 of them green on
the same commit, every one reading `0.009 → 0.28 → 0.005`: both taps landed (0.005 is
Speed at a third of the track) and the second was not taken as the other half of a double
tap. `TouchSlider` reads a double tap from the two lifts' `timeStamp`s, at most 320 ms
apart, which on a phone are the finger's times. Playwright's `touchscreen.tap` stamps
none, so Chromium stamps each event when it reaches it, and the second tap is sent only
once the page has handled the first: in a plain page whose pointerup kept the thread
busy, two such taps 60 ms apart read 95 ms apart idle, 217 ms busy 150 ms and 466 ms busy
400 ms; the same taps sent with their own times read 80 ms apart busy 400 ms. So the
check measured how quickly the page answered the first tap, which a finger never waits
for. The taps are now sent through `Input.dispatchTouchEvent` with times 90 ms apart; a
second tap is sent no sooner than 0.4 s after the first, past the window, so the line
passes only if the stamps are what the app reads, and no stamp is ever in the future;
both lifts must reach the app within 15 ms of their stamps, so a red names the instrument;
and a control stamped 0.6 s apart must leave Speed where one tap there puts it. The line
prints how far apart the app handled the lifts (the page's own lag, which no check bounds
for the phone's sheet yet: 19ac-2).

### 19ac-3. The bottles stroke is far enough off the middle

Shipped 2026-10-29. `npm run bottles`' "splatter with the Ferrofluid bottle lays
ferrofluid along the stroke, and not at its mirror" (and once the Oil bottle's) went red
on PRs that touch neither, about one Mac run in sixty, each time with "1 at the mirror".
PLAN read it as one of the look's own pours. The log of #559's red says otherwise: the
four pours away from the stroke were all 0.12 to 0.13 from the hand, with the mouse down
and the look's ring laid no more times, and the one at the mirror, (0.516, 0.484), was
among them. The look poured nothing. The stroke was the cause. Its ends are fractions of
the canvas, and the canvas is not the plate: the view shows two thirds of the plate's
width (`fluidPointAt`'s 1.5), the desk's canvas at 1280x800 is 662x342, and the dish's turn
rotates the stroke about the centre. On the plate the old stroke ran from (0.31, 0.40) to
(0.38, 0.49) in one cloud run, its end 0.116 from the centre and 0.232 from its own
mirror. A splatter flings 3 to 18 cells at the 128 grid (0.14 of the plate) and a pour
counts at the mirror within 0.12, so a fling from the end toward the centre could count
both ways. That pour sat 0.123 from the end and 0.10 from its mirror. Moved to (0.1, 0.3)
to (0.25, 0.3), the stroke reads 0.218 to 0.333 from the centre and 0.436 from its mirror,
still 0.12 long (0.05 would give 0.51 but fling past the rim). The bar is unchanged (none
at the mirror). A new line asks every run for the gap between the stroke and its mirror
to be more than 19/128 + 0.12, so a desk that reshapes the canvas fails by name.

### 19ac-4. The mirror check's "nowhere else" measures the drop's reach on the plate

Shipped 2026-10-30. `npm run mirror`'s "Classic, calm, layer 1: and nowhere else" went red
on three of the five deploys that ran a Mac shard on 2026-10-29 (570 on GitHub's Mac, 576
and 580 on the owner's), reading 13.3, 13.7 and 15.7 past its drift against 12.9, 13.5
and 13.1 allowed, every time at row 3, column 5: two cells above the hand in its own
column, never a mirror image. The check judges a 6x6 grid of cells over the desk's
preview and counted the eight cells about the hand's as "round the hand". #512 (the
desk's tabs, 2026-10-27) changed which preview it photographs, from the Design desk's to
the Perform tab's, and that preview is a wide window on the dish: measured in a cloud
session with `chromaglassDebug().plateAt` at the check's viewport, 802 by 289 showing 0.92
of the plate across and 0.33 down, so a cell is 0.154 of the plate wide and 0.055 tall,
and the hand at the check's (0.75, 0.75) lands on the plate at (0.731, 0.417), as the
Mac's own pointer reading said. A Drop held for 0.7 s lays a disc of 4.5 cells a step
and the film spreads it: on the Macs it changed the picture 21 to 30 one cell up (0.055),
22 to 25 two cells up (0.11), 6 to 7 three cells up (0.166, against a drift of 4 to 5)
and 6 to 8 one cell across (0.154, against 5), with 53 to 64 under the hand. Before #512
the hand sat at (0.81, 0.42) in cells a third wider, and the two-up cell read 11 against
a drift of 9, within the allowance of drift plus four; after, 22 to 25 against 8 to 9,
and the line failed on whichever runner laid the bigger drop. The cells under the drop
are now the ones whose middle is within DROP_REACH, 0.14 of the plate, of the hand, both
read with `plateAt` (the plate's turn included, so the quarter-turned scenario measures
its own), and a line asks that the plate's coordinates read back rather than falling
back to counting cells, that the hand's own cell is under the drop and at least half the
grid is judged (layer 2 is viewed through its own zoom of 1.8, so its reach on the
preview is wider and 20 cells of 36 are judged), naming any mirror that sits under the
drop. The mirror cells are the plate's too, the cell nearest each of (1 - x, y),
(x, 1 - y) and (1 - x, 1 - y) of the hand: on layer 1 the preview's own mirror cells,
turned a quarter the same cells with the axes' names swapped, on layer 2 the mirror
across the middle line lands beside the hand, under the drop, as the old eight cells
already had it. The judged cells' bar is unchanged: the hand's mirror across the plate's
middle line on layer 1, 0.166 away, is judged as before and reads 2 to 3 past its drift
against 8 to 9 allowed. The skeptic pass (one Opus review) found the "nothing judged"
consent (`!worst ||`), the line that only asked whether `plateAt` answered, and the
footprint print's mean against the judgement's median; each is fixed or named. The check
prints each cell's distance from the hand with its mean change past mean drift, nearest
first, so the footprint is in every log. The control on a Mac: revert the derive pass's
mirror fix (`npm run derive` pins it) and the line goes red at the mirror across the
middle line, row 2, column 5.

### 19ai-6. The solver's kernels, one file a pass (2026-10-28)

`src/gpu/wgsl/fluid.ts` was 5,885 lines (290 KB): 96 kernels in one object literal and
the snippets they share, so a thread changing one pass read the whole solver's WGSL
first. It now keeps its header, the `KERNELS` table (built by spreading the pass files),
the substepped and plan variants made from the moved kernels, and `kernel`; the
kernels are under `src/gpu/wgsl/fluid/`, fourteen files of 6 to 31 KB: `shared`,
`splats`, `gap`, `phase`, `phaseForces`, `labyrinth`, `pressure`, `carry`, `forces`,
`oil`, `capillary`, `dye`, `gridFilter`, `reactions`, `fields`. Each moved text is the
original's, comments and all; the move was made by a script working on the file's
syntax tree (each property's full text with its leading comments), so nothing was
retyped.

Measured: every kernel's raw source, and `kernel(name, f)` for four formats, plus the
module's exported strings, 625 entries, hashed together before and after:
`b95d4f88f2071321` both times. Only the order of `KERNELS`' keys changed (the files
group them by pass), which only the order `npm run wgsl` compiles them in reads; it
compiled all of them on SwiftShader, `checked 143 shaders` and no error. Two checks read the solver's text rather than
importing it, and now read the file their lines moved to: `plate` (the gate, in
`dye.ts`) and `turing` (the regime's cap and share, in `reactions.ts`).

## Third pass (moved 2026-10-29, 19m)

### The plan's old header

`PLAN.md` opened with a directive from its first days, before the order of work: two
tracks by tool, each with its "current priority". Every step in it has since shipped or
moved into a section (the video pour and its optical flow are 14ab and the cartoons, 14ac;
subtractive mixing is the lamp through the dye, 18b), so it is kept here as written.

#### Gemini (Visuals & Physics Track)
**Focus:** High-impact WebGPU shaders, fluid dynamics, and rendering algorithms.
**Current Priority: Fully Coupled Advection-Reaction-Diffusion (Moving Chemistry)**
*This is the highest-impact visual task, moving the static Gray-Scott reactions into the turbulent flow.*
1. ~~**Prepare the Data:** Modify `src/gpu/fluid.ts` to expose the chemistry PingPong texture (`this.chem`) to the fluid's velocity field.~~
2. ~~**Write the WGSL Advection:** Add an advection pass for the chemistry texture using the fluid's velocity field (`disp`). This can likely reuse the existing semi-Lagrangian advection logic currently used for dye (`bilerpN` or similar).~~
3. ~~**Integration:** Run this new advection pass immediately *prior* to the `grayScott` reaction-diffusion step in the pipeline.~~
4. ~~**Tuning:** Tune the `feed`, `kill`, and diffusion rates. When Turing patterns are sheared by turbulence, they can explode numerically. Tuning is required to ensure visual stability.~~ (Handled via shader clamped constraints)
6. **Video Injection & Optical Flow:**
   * Fix `pourVideo` in `LiquidVisualizer.tsx`: It currently drops frames. We need to draw the playing `videoPourRef.current` to an offscreen canvas and call `fluid.injectImage` every frame.
   * **Luma-keying:** During the canvas extraction, convert brightness to alpha so standard downloaded MP4s act as transparent fluid overlays.
   * **Physical Interaction:** Calculate basic Optical Flow (frame differencing) on the video canvas and pipe the motion vectors into `fluid.addVelocity()`, allowing motion inside the video to physically push the WebGPU fluids.
7. **Future Visual Targets:**btractive Mixing (subtractive color physics).
   ~* Fully Dynamic GPU Ferrohydrodynamics (solving Rosensweig instability natively).*~ (Completed in PR #247 & cleanup completed)

#### Claude (UI & Stability Track)
**Focus:** React architecture, new UI implementation, bug cleanup, and test stability.
**Current Priority: Bug Cleanup & New Performance UI**
* ~~Note from Gemini: Please evaluate and tweak the initial palette colours. The new Ferrohydrodynamics and Chemistry features might benefit from better default dye colours.~~
  Done (26-colour, this PR). The chemistry first had to grow at all: on the looks with
  Chemistry on, the GPU Gray–Scott fed nothing (its feed came only from poured reagent,
  and every random seed wiped the reagent), so Sensual Laboratory and Neon Coral Reef
  printed an empty plate (lab: 3.6 units of dye in four seconds, 451.6 after). Now a
  look's Chemistry is a bath that feeds the whole plate, a pour of Turing Reagent feeds
  and seeds the reaction where it lands on any look, and the field is cleared with the
  look's other chemistry. Colours: Turing Reagent pours CIMA's pale straw (`#f5e69e`,
  was a hot pink `#ff88ff`) and, on a look without Chemistry, its pattern prints in
  starch–iodine indigo (`TURING_PRODUCT`); a look with Chemistry keeps its own palette
  (the "Refresh preset and colour palettes" work owns those). The ferrofluid's colours
  were left alone: Ferro Paint's amber, teal and coral and the thickness-drawn black and
  brown already match Colored I and II.
  - **26-colour-a** (not doing) and **26-colour-b** (fixed): see §26, with 26d's Turing
    Print.
*The owner requires a new UI for live performances, which requires a solid, bug-free foundation.*
1. **Wave 0 (Infrastructure):** Complete the CI/CD and testing stability tasks to ensure faster iteration times.
2. **Bug Cleanup:** Resolve critical QA bugs that are currently blocking the performance desk.
3. **New UI Implementation:** Implement the new UI layer as specified by the owner, ensuring it correctly binds to `LiquidVisualizer.tsx` without disrupting the WebGPU context.
   *Desk v2 (the owner's design, 2026-10-10) shipped as §8-v2: one desk, three layouts. §8-draw (the remote opens on Draw) and §8-play (Play, the phone's listening screen) shipped after it.*

---

### 19. The checks, the build and the plan itself

#### 19i. A green Mac result carries across a merge of main
**Shipped** (#429; carrying fixed in 19k, #502, since until then it asked for four shards where there were five and so never carried): a run whose tree differs from the PR's last green Mac run only in main's files, or in files no Mac shard reads, skips the shards as "carried", and the deploy gate follows the chain back. The story is in [`docs/plan-shipped/19-checks-build-plan.md`](19-checks-build-plan.md), under the same number.

#### 19w. A fifth Mac shard, so no shard runs near its timeout
**Shipped** (2026-10-11): the plate shard ran up to 19.8 of its 20 minutes and the other three 15 to 17, so a fifth shard took two to five minutes from each; replayed on 11 runs, the longest shard went from 18.4 minutes to 15.0. The measure and what moved are in [`docs/plan-shipped/19-checks-build-plan-2.md`](19-checks-build-plan-2.md), under the same number. Next time a shard's median passes about 15 minutes, even them again before adding a sixth: each shard is a runner the queue has to find.

#### 19w-1. The deploy gate counts the fifth shard
**Shipped** (2026-10-17): `deploygate.sh` wanted exactly four green shards by name, so after 19w it trusted no PR run and every deploy re-ran the whole Mac, about 55 minutes from merge to live. It now reads the shard names from `checks.yml`'s matrix; replayed on the last 20 merges, the deploys it trusts went from 0 (plus 2 by rule 5) to 4 (plus 1). The story is in [`docs/plan-shipped/19-checks-build-plan-2.md`](19-checks-build-plan-2.md), under the same number.

#### 19x. A moved bar names itself
**Shipped** (2026-10-11): CI fails a PR that changes a check's bar or input, or turns a check to assert the opposite (also commit by commit, #357's case), without naming it in the body under `Check changes:` (`npm run checkguard`, the "Check changes named" job under the required `Measure`; the protocol in `docs/handoff.md`). Over the 50 merges before it, 9 would have had to name something, every one a real edit of a check. The story is in [`docs/plan-shipped/19-checks-build-plan-2.md`](19-checks-build-plan-2.md) §19x.

#### 19z. A check that compares two compiled programs on a GPU asks the compiler
**Shipped** (2026-10-11): `npm run lamp`'s first line, every look at Lamp Ground 0 byte for byte against a lab built with the lamp's lines taken out, read "different: fillmore-1969 2" on the owner's M4 on main at b2ca7d7, the same one pixel on every run, 2 levels of blue, gone with the back plate or its grade off (`node scripts/lampwhere.mjs`), none different on software WebGPU and on the GitHub runner's Mac for the same tree, and none different on the M4 again once #353 had moved the shader. Metal fuses a multiply-add into one FMA when the product has one use; the lamp's back-plate branch keeps a second use of the back plate's values alive in the plain lab and is dead code in the control, so the two programs round the painted path differently, and one ulp crossed a threshold in the grain. The line is now `npm run lampzero`, two labs on SwiftShader (which has drawn them the same on every tree since 2026-10-04 and, as a conformance rasteriser, keeps the operations as written rather than fusing them by use count), in Measure on every PR as its own part, `lab` (the `logic` part has no Chromium, so #386's first run failed there on the launch, and the `browser` part already runs twelve of its fifteen minutes). The line reads back from the adapter that SwiftShader drew both labs, and from the bundles that the control is another program, rather than trusting the flags and the plugin. The lamp's physics stay on the Mac. The story is in the scripts' own comments.
