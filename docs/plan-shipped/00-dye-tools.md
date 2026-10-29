# 0. The dye a tool makes, and the deploys it is blocking: what shipped

How §0's shipped items were found, built and measured. The open work is in
[`docs/plan/00-dye-tools.md`](../plan/00-dye-tools.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Second pass (moved 2026-10-04)

### 0. The dye a tool makes, and the deploys it is blocking

**Shipped in #152.** The Finger's "adds none" passes on Metal (208 → 199 against
−16 and −7 left alone), as do the Blow and the Press, and plates hold less dye at the
same point than before. What follows is how it was found.
*Found 2026-09-27, **fixed in #225 and #238** (2026-10-03/04; #238's first Mac run, with silence chosen, read 0.4, 0.4 and 3.7 past the drift against allowances of 10.7, 27.1 and 12.8):* **the mirror check's "and nowhere else" goes red at
exactly its limit on changes that cannot move a pixel.** It was the plate, not the
check. Six rounds of measurement on the Mac runner found the calm Classic plate
starting a single plate-wide flow out from the middle (0.63–0.88 of it radial, mean
speed up to 0.34) with the first bubble a drop trapped, and never with Bubbles at 0
(speed stayed near 0.005). Each bubble presses the glass over its footprint every
step, and the press source was balanced with a plate mean the CPU guessed from the
gap deltas over a resting gap of 0.03; a held press has squeezed its gap to the
floor (0.004), where the deltas are clamped away, so the guess was wrong and the
difference went into the pressure solve as a net source, which a closed plate has
no answer for. And on the app's glass the press's memory (`gapMemory`, a 0.22 s
half-life of remembered squeeze that does not move the gap) was summed into the
press's own rate every step it was held, so a held press pushed out some three
hundred times what its gap lost, and went on pushing from a gap already on the
floor. The projection's right-hand side is now made zero-mean exactly on the GPU
(`divTiles` in `wgsl/fluid.ts`): the glass lifting a hair everywhere to take what a
press pushed out. And the memory takes over only once a press has gone, never past
the floor (`squeezeUpdate`). `npm run heldpress` (lab, Classic's glass): a held
press's far plate once steady 3.28e-2 on main, as fast as while it closed, half of
it radial; 4.6e-5 after. It went red again after #225 (#218, #230, #237 and main's
997c71f deploy, all the same shape: drops 1 and 2 clean, then the middle moving by
itself). #238 found the bubbles were the simulated band's, started by the check's own
first drop, and that the air's standing source in `divergence` poured liquid out of
every still bubble with the whole plate as the sink (the item on a still bubble
below). It takes the term out and has the check choose silence and assert that no
band played. The original report follows.
 #191 (PLAN.md only) read
"Classic, calm, layer 1 turned a quarter: and nowhere else" at 11.1 past drift
against an allowance of 11.1, at the tool's mirror through the centre
(`scripts/mirror.mjs`, the Mac plate shard). It has been red at its limit on other
branches that do not touch the plate. Either the mirror echo it was written to catch
comes back now and then, or the allowance is drawn from a drift reading that is
sometimes as large as the echo; which of the two is the first thing to settle, from
the per-drop numbers it already prints. A thread cannot re-run a job (403), so each
of these costs the owner a by-hand re-run. *Later that day:* #208's plate shard read
13.4 past drift against 12.5 at row 3, column 5, not a mirror cell, where the drift
grew on every drop (3.5, 5.9, 11.2, 60.1): a region starting up by itself caught two of
the four drops (past drift 1.0, 3.1, 30.8, 23.7), and a median of four does not hold
two. So the second guess, the plate's own movement, not an echo; #225 traces that
movement to a held press (every trapped bubble) setting the whole plate flowing.
*Found 2026-10-04 (#238); **shipped #251 (0-bandbubbles)**:* **the simulated band's
kicks released bubbles whatever Audio Impact said.** The first click on a browser that
never chose a sound source starts the band (`App.tsx`, the first visit's wake), and
from then on a kick may release bubbles into the densest dye near the middle of the
plate (`LiquidVisualizer`, "A few bubbles at a time"). Audio Impact 0 and every
mapping set to none leave that on, which is how the drop check's calm plate came to
have bubbles at all; the check now chooses silence (`scripts/mirror.mjs`). Whether
Audio Impact 0 should mean the music touches nothing, bubbles included, is a look
question: gating them would change only plates set to 0.
**Shipped:** the owner asked for the fix (2026-10-04), taken as: Audio Impact 0 means the music drops
no bubbles; the first click still starts the band. A kick's odds of releasing air now
follow the dye ring's own scale, impact over its default (0.45), capped at the
default: unchanged at 0.45 and above (the same draws, so a render at the default is
the same render), thinning with the fader below it, none at 0. The phone's Sound Drive
is the same setting. `npm run kickbubbles` (Mac, open shard) plays it as a first visit
does, on the laptop and the phone at 0 (no release over at least 15 kicks that reached
the bubbles' decision) and at Classic's own 0.55 (drive 1, a share of kicks near the old
45%), with `chromaglassDebug().musicBubbles()` counting the frame's own chances,
releases, Audio Impact and Bubbles.
**The phone's take-button checks judge the fade by its own clock, and the slider by
its lag behind it** (this PR, `npm run phone`). #207's Checks run went red on "set to
one bar in the drawer, the same take lands in about half the time … with a jump", on a
PR that does not touch the Mixer, and a cloud session went red on it on 4 of 4 runs.
The check read the slider every 80 ms and judged each step against the time between
reads, but a slider shows what React last rendered: one render landing ~120 ms late
and the next catching up read as a jump. Now the app logs each level a take works out
(`window.__cgFadeLog`, kept only when a page asks), the fade's steps are held to the
time between them and to coming about a tick apart, and the slider is held to how late
it is behind the fade. 5 of 5 runs green (two on 2026-10-03's main); red on all three lines against a timer slowed
to 400 ms, a slider written one tick in 25, a level rounded to tenths and a clock a
quarter second ahead on one tick in ten.
The dye's advection now thins
where the flow spreads and thickens where it gathers (the Jacobian of the
backtrace, in `macCormack`), with a gathering cell held to the most its upstream
cells held. The Finger's own velocity was never the source — in the lab it moves
the plate's total by 0.0% — the fingering push added after the projection was
(taken out since, below): it ran along the dye's gradient, the Finger's carry made that gradient steep,
and the backtrace copied the dye outward (lab, the Finger's path under the
push: 636 → 756 against 687 left alone; now 622 → 588 against 612). Holding
the gathering side matters: carried conservatively, a push up the gradient is
diffusion run backwards and grew a speck from 1.0 to the 6.0 ceiling in under
five seconds.
**The fingering push grew a grating, and was what drained the plate** (2026-09-27,
`npm run grating` §5). Reported on Classic: stripes three to eight cells across at
every angle, and a quarter of an hour in, red dots in a lattice about ten cells
apart with labyrinths between them. Not #174's checkerboard (one cell, on the
grid's diagonals): a push in `forcesB`, set by a look's Polarity, moved the dye
along its own gradient by a slow noise, and where the noise was negative that is
diffusion run backwards, which grows a spinodal pattern inside every pool at the
size the push's gradient sees (a logical cell either side). In the lab, Classic's
own step on forty pools for ten seconds, 512 under 192, the worst channel's
share of variance in waves 2.6–16 texels across, in parts of 10,000: 52 as laid,
107 without the push, 2518 with it, and 819 at a quarter of its strength; the
plate kept 97% of its dye without the push and 41% with it. Tried on the same
plate before taking it out (a first look, alpha only, waves 2.6–8 texels, where
the push read 1895 against 32 without it): carried as a flux (conserves the dye, grows the pattern three times as fast:
4165), pushing only outward (345, and still losing dye), pushing along the
contours (3298), and only at a pool's edge (40 at ten seconds; at thirty, 109
against the stirring's 45, a comb of teeth along every edge and holes drawn into
pools). On a phone's grid (256, half-float dye) at Velvet Underground's strength
(Polarity 0.9, 0.22) the same push grows its waves a few cells long, where the
grid's axes pin them: the crosshatch the owner saw on the iPhone (2.6–5 texels,
231 against 22 without it; the picture is in the project's files, not the repo,
at `dye-grating/phone-grid-half-float.png`). None of
those is the phenomenon (below), so the push is **taken out**,
on the GPU and the CPU plate alike. The Finger's "adds none" reds were this loss:
the plate alone lost dye, so a stroke read as adding it; the
Finger's own lab read −0.2 idle out of 1329 with the push off (finger-lab, 2026-09-27).
**This was first because it was red.** `npm run tools` fails on `main` about two
runs in three, and the deploy is gated on it, so every merge queues behind a coin
toss. Four deploys failed in a row on 2026-09-26 before one got through.

The claim it breaks is the Finger's: *carries dye along the stroke, adds none*. It
adds a great deal.

| commit | dye on the plate | the Finger added |
|---|---|---|
| #142 | 635 | **+301** |
| #142 | 656 | **+246** |
| `main` | 592 | **+307** |
| `main` | 655 | **+394** |
| #143 | 180 | +36 |

Forty to sixty per cent of whatever is already there, against a tolerance of
`0.15 * fa.total`. It is not a regression and it is not the gate being flaky — both
were checked, and both were wrong answers on the way here. The behaviour is the same
at #142, #143 and `main`; what varies is how much dye the plate happens to be holding
when the harness runs, because the tolerance scales with the pool and the amount added
scales with it too. It passes only on a thin plate. #143's two green runs started at
180 rather than 650.

The cause is already written down in `tools.mjs`, for the Press rather than the
Finger: *"the solver carries the dye's concentration through that spreading flow
without thinning it, so a press can add up to about as much again as it had"*. The
same note says it is tracked on its own, and this is that item. A flow that spreads
has to thin what it carries; ours multiplies it.

*0-tap, the tapped clock's two stopwatches. **Shipped in #308** (2026-10-06).* "The tapped
beat drives the show's clock" (`npm run squeeze`) went red twice on trees that could not
move it: 396.6 against 401.4 ms on #195's deploy and 401.7 against 404.1 on #216's show
shard, a docs-only tree, while #203 and #211 on the same code read 405.8 against 405.8 and
403.2 against 403.2. It compared the beat clock's period with the harness's own mean tap
interval. But the harness stamps each tap in the page just before calling
`chromaglassAction('tap-tempo')`, and the app stamps it again inside `tapTempo`, so a pause
between the two (a collection, the first call into `runAction` on a busy runner) lands in
one mean and not the other. Both reds read short, which is what a late first stamp does:
14.4 and 7.2 ms spread over three gaps, where the check allowed 2 ms on the mean. The clock
itself is handed the tempo source's reading by `setExternal` every frame with the same
`now`, so it was on the app's period throughout. The check measured the dispatch.

Now the app exposes the tempo source's reading under `?debug` (`chromaglassTempo()`, in
`App.tsx` where the source lives, rather than on `chromaglassDebug()`, so the fix did not
need `LiquidVisualizer.tsx` while #307 held it), and the check asks two claims, each on one
stopwatch. The feature: the clock's period is the tapped source's to within 0.5 ms, and
that is not the band's 492. The dispatch: the source's period is the harness's mean to
within 30 ms, six times the worst gap seen (4.8 ms on the mean) and well under what a
dropped or doubled tap does (100 ms or more). On the owner's Mac, real WebGPU: 400.1
against 400.1 ms, and 400.1 against 400.1 ms; 9/9. Controls, each run and restored: the tap
ignored by the app read the clock at 491.5 ms with no tapped tempo, both claims red; the
clock ignoring what it is handed read 491.8 against a source of 401.2, the first red and
the second green; the second tap dropped read 603.9 against the harness's 402.6, the
second red and the first green. They also found that "and the show kicks on it" passes
with no tap at all (25 and 24 kicks against a floor of 22.5), written into PLAN §0.

## Fourth pass (moved 2026-10-29, 19m-2)

### 0. The dye a tool makes, and the deploys it is blocking

#### 0. The Finger's "adds none" and the ambient seeder

*Found 2026-09-27, **cause found 2026-10-22**:* **"adds none" went red on runs that did
not touch the Finger, because the window it was measured against was the ambient
seeder, not the plate.** #182's tools shard (a Pacing change; the same code had passed
the shard one commit earlier) read 50 → 64 against −12 before and +9 after, red by 1.5:
the allowance was centred on the larger-magnitude idle reading rather than spanning
both, which is not the bracket its comment described. That part is bracketed now
(`fMinIdle`/`fMaxIdle`, spanning both readings and 0), and bracketing alone made the
reds stop without explaining them.

The explanation is that the Finger section, alone among the tool checks, left the
ambient seeding on. The Blow and the Press both turn it off and say why ("so 'left
alone' was the seeder's drift, not the plate's"). Measured on the Mac with the seeder
on and **nothing dropped at all**, the plate reads 64 and gains +26 then +18 over the
two idle windows — so "what the plate did alone" was mostly the seeder's rate. That is
why the idle reading sat at +31 to +36 whether the pool was 66 or 728, an eleven-fold
range: a window dominated by a term that does not depend on how much dye is on the
plate. And a bracket built from it is wide in proportion to nothing: at a pool of 66 it
accepted any Δ in [−15, +46], so a Finger that created 70% of the pool again in new dye
would have passed (check-skeptic).

Two findings are withdrawn rather than confirmed. The 2026-09-27 reading — 40 Mac
shards, pools 49 to 279, the stroke adding +11 to +21 on all 12 pools under 150 — was
read through those seeded windows, and at that size the seeder alone lays about as much
as the Drop does, so it is not evidence about the Finger. And a Mac sweep at four pool
sizes (728, 176, 152, 66) that put the hand's own contribution at +3 to +5 by
subtracting a no-stroke control is measured on the same seeded plate, so it bounds the
hand only against a background it did not control.

*Done:* the seeder is off for the Finger section now, as for the Blow and the Press,
with a new `quiet` check: left alone, the pool may not *gain* more than 5% of itself, or
5, over an idle window. Gains only, because the fault is dye arriving from something the
check does not control — a window that loses dye only narrows the bracket downward and
cannot excuse a hand, and the Mac's after window reads −1, so a two-sided bar would
charge it for nothing. It is ANDed into `adds none`, as the Press ANDs its own guard
into both of its claims, so a plate the harness has declared unquiet cannot also print
"adds none: ok".

The idle windows fell from +35 to about 1, so the bracket closes on nothing and the
check measures the hand. On the owner's Mac, four runs: idle +1 before and −1 to −0
after, on pools of 357 and 611, and **the hand adds nothing** — Δ under ±0.5 every
time. Thin pools are still unmeasured (below).

A control (`TOOLS_FINGER_CONTROL=1`) runs the same shape with the mouse never going
down, on the same helpers, and prints the hand's own contribution by subtraction: +0.1
to −1.1 across three runs, against a slack of ±59 to ±97. It waits out the stroke in
solver steps rather than milliseconds, because the real path pays 30 `mouse.move` round
trips the control does not: at equal wall time the stroke ran 274 steps against the
control's 122, a factor of two apart in the pool's age, and the comparison was void —
the same fault the Hover check was rewritten to fix. Step-matched it reads 273 against
272 on a pool of 611, and 138 against 137 on a pool of 357, and it prints both spans
with the verdict, so a run that is not comparable, that timed out, or whose span did not
read says nothing instead of implying the opposite. It reports and does not gate: with
no pool it says so and stands down rather than throwing, because a reporting-only block
that can end the run is a gate whatever its comment claims. And it states the narrower
claim it can support — the second window is not biased by where it sits in the run — not
the broader one it cannot, that the window is unbiased *when a stroke happened*. For
that, the `fIdle`/`fIdleAfter` pair in the check's own detail is the evidence, and the
control calibrates that pair rather than replacing it.

*Done (PR #449): both bars set from the shards' own noise.* `TOOLS_FINGER_TRIALS=<n>`
repeats the stroke on the same helpers, cycling the Drop's hold from 300 to 1500 ms so
one runner reads thin pools and thick ones, and prints each trial's excess over the
bracket as a share of the pool (reporting, not gating). Run twelve times on four Mac
runners, 48 trials on pools of 39 to 357: the stroke landed at most **0.48 outside the
bracket, 0.17% of its pool**, and the plate left alone gained at most **+0.74, 0.26%**.
The six seeder-off shard runs before them and the five `adds none` lines beside them
read the same. So `fSlack` is now `0.02 * pool + 1`, was `0.15 * pool + 5` (±8.1 on a pool
of 357, was ±59; the nearest trial is a sixteenth of it), and the `quiet` bar is
`0.02 * pool + 1`, was `max(5, 0.05 * pool)` (the nearest trial is a tenth of it). The
check's detail now prints its Δ and windows to two places, so `npm run flakes -- --check
'and adds none'` reads the margin from ordinary pushes.

#### 0. The ferrofluid poured round Classic's middle drifted into it (`npm run ferrodrift`, #250)

*Found 2026-10-04 (#238), **done on the thin gap (#250); open on the old plate** below:* **with the band playing, the
ferrofluid poured round Classic's middle drifted into it** (the disc 0.12 round the
middle 0.180 → 0.501 of black in nine seconds on the Mac, 0.099 → 0.084 in silence).
`npm run ferrodrift` (#250) pours the ring with the band on, in the app, on the Mac,
and four runs of it found: with the look as it is the ring spreads into the middle as
fast in silence as with the band (0.100 → 0.248 against 0.097 → 0.233 in twelve
seconds, the ferrofluid's mean distance from the middle growing, so the look's own
stirring spreading it both ways), and no slower with the bubbles, centre gravity,
Tempo Sync or vibration taken away; with the plate's own currents held, as #238 held
them, on the thin gap every look plays since #248 the band moves nothing in, its
bubbles on the plate or not (0.097 → 0.082 and 0.102 → 0.076; silence 0.114 → 0.117);
and held on the old plate (Thin Gap off) it still drifts in when the band's bubbles
land near the middle (0.099 → 0.150 with two to seven, the mean distance 0.310 →
0.298), and not on a run where it dropped none or with Bubbles at 0 (0.086 → 0.086,
0.097 → 0.093). So it was the old plate's bubble press ("a still bubble presses the
glass", above), and #248 took every look off it. The check asks the thin gap with
the band and four bubbles set down where the band drops them, against a silence that
has to be still itself, and asks the old plate to drift by more than the same bar, so
the instrument is shown to see what it was built for; that line turns round to ask
the old plate to stay once its bubbles stop pressing.

#### 0. Deploys no longer re-measure a tree its PR already passed (`npm run deploygate`)

**Deploys no longer re-measure a tree its PR already passed** (this PR, `npm run
deploygate`). Measured 2026-09-27, 1 AM to 11 AM PT: 18 red runs, 5 of 16 deploys.
Every deploy re-ran the four Mac shards; 16 of the last 20 merges published exactly
the tree their PR's `Checks` had just passed on, and 3 of the 5 red deploys (#189,
#195, #196) were that tree going red the second time on a check nothing in it
touched. `deploy.yml` now skips the checks when the tree is the PR run's (the head
contained main, and its run was green) and runs them in full otherwise. It halves
the Mac jobs per merge, which is also what had run times at 20–55 minutes by noon
against 10 at 1 AM.
