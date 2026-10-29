# 0. The dye a tool makes, and the deploys it is blocking

**Partly shipped** (#152, #225, #238, #250, #251): the dye's advection thins where the flow spreads, a held press no longer sets the whole plate flowing, the band's kicks follow Audio Impact, and the phone's take-button checks and the deploy gate no longer fail on what they did not measure. What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

`src/gpu/wgsl/fluid.ts` (advection), `scripts/tools.mjs`

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

*Measured (PR #449):* the Finger adds no dye on a genuinely thin pool: twelve trials on
pools of 39 to 80 landed at most 0.05 outside the bracket. `TOOLS_POOL_MS` shortens the Drop hold to
put a CI-sized pool on a fast machine; it is floored at 100 ms because under that the
Blow's pool comes out at single figures and its checks measure nothing. Laying the pool
by solver steps rather than milliseconds would make it one size every run. Also open,
and unrelated to the seeder: `and draws it back when the hand lets go` read 78%, 76%,
80% and 48% back on four Mac runs against its 50% `backOf` bar, so it sits on its
threshold. Its detail labels only `cameIn`'s quarter ("a quarter needed") and leaves the
50% bar unlabelled, so the 48% red reads like a pass to anyone who has not read the
condition.

*Found 2026-10-03 (#225), open:* **with presses that move the dye, the grid pass
holds less of the grid-band detail.** `npm run grating`'s pressed plate (gap −0.3 in a
step, ten steps a press) read 22% on main because its presses were swallowed by the
unbalanced press source (the dye under them barely moves). Balanced, the same presses
push the dye, and the pass holds the band to 64% of what grows without it; a variant
balanced before the clamp reads 74%. The owner chose to re-baseline that line
(2026-10-03): it now asks for under 0.68, between the shipped pass (64% lab, 65% Mac)
and a pass 30% weaker (3.5% a step reads 70.0%, 2.5% 75%, 1% 87%); it leans on
`npm run heldpress` to catch presses that stop moving the dye. It is not at the fronts: masked away from them
(87–95% of the plate kept) the fix reads 62–70% and main 37–38%. The flows with the
pass on and off are the same (mean |u| 0.462). Rendered in Red Cabbage's closeup at
2.8x and 8x, neither shows the 45° grate (`/mnt/project-files/mirror-fix/`, outside
the repo). Open: whether the pass should be stronger where the flow is strong or the
gap is changing, or whether the dye's conserving advection grows the band itself
under a strong flow (its divergence by central differences is not the projection's).
Both renders also show a vertical seam down the middle of the plate, on main as well:
its own item, unmeasured.

*Found 2026-10-03 (#225), **half done in #238** (the air's standing source is gone):* **a still bubble presses the glass.** Every
step, each bubble lays a standing press of 0.0035 over 0.85 of its radius
(`LiquidVisualizer`, "A bubble is air between the plates"), which holds the gap
under it at the floor so the dye is pumped out from under it. The air's own
standing term in `divergence` did the same with a source where the air is and a
sink everywhere else, and that half is what still moved the whole plate after
#225: balancing a source with a uniform sink is exactly a flow out over the whole
plate, for as long as the bubble lasts. On the Mac, four bubbles near the middle of
a calm Classic plate took its mean speed from 1.3 to 40–138 (thousandths), 0.70 of
it outward; in the lab (`npm run heldpress`, trapped bubbles) the far plate held at
4.57e-3, 0.79 of it out from them, and 1.83e-5 with the term taken out (#238). Both
were shortcuts that imitate how a trapped bubble looks rather than simulate it: in
a real cell a bubble spans the gap and displaces the liquid only while it grows,
shrinks or moves, and a still one pushes nothing. What is left is the press, which
#225 balanced and which reaches the floor and stops (heldpress), but which still
stirs the liquid round every bubble. And the press's memory (`gapMemory`) still pushes
liquid after a press without moving the gap, so a release's remembered squeeze is
liquid from nowhere: a real squeeze film is overdamped and pushes out exactly what
its gap loses, as fast as the viscous film lets it close. Replace both with the air excluding the liquid by
itself (the bubble as a region the flow goes round: a no-flux boundary, or the
Hele-Shaw permeability going to zero inside it), and measure it with `npm run pops`,
`npm run straw` and `npm run heldpress`, which should then need no press to hold.
And `npm run ferrodrift`, whose old-plate line asks the press to be still pulling
poured ferrofluid in toward bubbles near the middle on the old plate (0.099 → 0.150 in
twelve seconds, #250), as the proof that check can see a drift: when the press goes,
that line turns round and asks the old plate to stay. The thin gap
already keeps it still, because there the press is only the glass and a gap near the
floor is where the flow's mobility (h³) goes to nothing, which is the no-flux
boundary this item asks for, reached by the gap itself.

*Found along the way, not done:* a song's chorus lifts Audio Impact by 0.2 for the plate
(`useMusicIntelligence`, music library tracks only), so a fader at 0 is 0.2 in a
chorus, for every reaction behind it, not only the bubbles. Whether 0 should hold
through a chorus is a look question.
Still reaching the plate from the band at Audio Impact 0, each behind a dial of its
own and left as it is: Soap Bursts on the beat (Soap Flow), Rock and the rhythm plate
(Plate Rock, Beat Squeeze), the maze breathing on a kick (Ferro Labyrinth), the
camera's beat (Macro Sync), and the look's pace (Tempo Sync). Whether any of those
should also answer to Audio Impact is a later look question, not done here.

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

*Found 2026-10-05 (#267, #281 and #287 red on it), **fixed in the ferrodrift control's
PR:*** **the old-plate line sat on its bar.** Its four bubbles at 0.15, set down 2.5 s
after the pour, were never what pulled the ring: the band's own were. Over eleven Mac
runs the old plate pulled 0.0029–0.0091 on the six where the band had dropped no air
before Audio Impact was held, and 0.0062–0.0260 on the five where its dice had dropped
three to seven onto the dye ring, against a bar of 0.004 over silence. The check now
holds Audio Impact at 0 from before the band starts, asks that the music released no
air on any page, and sets down eight of the band's largest bubbles where it drops them,
from the pour on, on both plates. Still open: with the same four bubbles the old
plate's pull varied threefold (0.0029 → 0.0091), with its readings sometimes
accelerating (0.310 → 0.281 in twelve seconds) and sometimes linear; what makes one
press pull three times another is not measured, and belongs with the press item above.

*Found 2026-09-27, not yet done:* **the wall's "output gain lifts what reaches the
wall" went red on a run that does not touch the output.** #184's tools shard (Accent
the One, default 0, which leaves every kick's weight at exactly 1) read 0.040 → 0.046
at a gain of 2.2, a lift of 1.15 against the 1.25 it asks (it usually reads about 1.5;
main's deploy one commit earlier passed it). Not the flash guard: the bracket turns it
off, and with it off the loop resets its gain to 1 at once (`LiquidVisualizer`, where
the guard's reading comes back null). The plain frame was unusually dark (0.040,
against 0.164 for the same plate earlier in the run), so a guess, unmeasured: most of
its light was in a few bright cells that a 2.2 gain clips at white, which lifts the
mean far less than the grade. If so, the check should read cells the gain cannot clip
(below 1/2.2 before the grade) rather than the whole frame's mean. *Later that day:* over 40 tools
shards the lift read 1.52 to 1.90 in 37, 1.15 and 1.19 in the two reds, 2.20 and 2.27
at the top: single odd readings, not a spread, so clipping (which would spread them)
is the weaker guess. The frame is the flip's stripe plate, not the show's (0.02 to 0.05
where the keystone before it read 0.05 to 0.19). The wait after a config change counted
the page's animation frames, not the stage's drawn ones, and did not wait for the guard
to be off; it now waits for both, and the check prints all seven readings in order, so
the next red says which frame was odd (this PR).

**Deploys no longer re-measure a tree its PR already passed** (this PR, `npm run
deploygate`). Measured 2026-09-27, 1 AM to 11 AM PT: 18 red runs, 5 of 16 deploys.
Every deploy re-ran the four Mac shards; 16 of the last 20 merges published exactly
the tree their PR's `Checks` had just passed on, and 3 of the 5 red deploys (#189,
#195, #196) were that tree going red the second time on a check nothing in it
touched. `deploy.yml` now skips the checks when the tree is the PR run's (the head
contained main, and its run was green) and runs them in full otherwise. It halves
the Mac jobs per merge, which is also what had run times at 20–55 minutes by noon
against 10 at 1 AM.

*Found 2026-09-27, not yet done:* the checks that went red on deploys that day, on code
they do not measure (besides the Finger, the mirror and the wall's gain above): Beat Squeeze on two deploys (#190's,
"with the band playing, the show hears kicks — 3 in 45 s"; #195's, "the tapped beat
drives the show's clock — 149.5 bpm tapped at 122"), the ear on #195's deploy ("the
wall only where the frames stalled past 250 ms — 0 of 10 read within 250 ms"), the
phone's two-finger Drop on #186's deploy (B 81 against 2/0/0, fine by eye; the check is
split in two in batch 11's note on it, and its cause found there 2026-10-04: the fingering push), `qa` on
#189's deploy with no WebGPU adapter in 10 s, and `startup`'s GPU-start stop at 3.52 s
against 3.5 on #194 (that one: see the `startup` item in §0's CI list, fixed by
telling Chromium's hold on the page apart by the page's own thread). Each wants what §0 asks of the Finger: find whether the check or
the product is wrong, from the numbers it prints.

*0-tap, the tapped clock's two stopwatches:* **shipped** (#308). "The tapped beat drives
the show's clock" read the clock against the harness's own stamps of its taps; it now reads
the tempo source's period (`chromaglassTempo()` under `?debug`) and asks two claims, each on
one stopwatch (`npm run squeeze`, 400.1 against 400.1 ms, and three controls red where they
should be). The story is in docs/plan-shipped.md §0.

*Found 2026-10-06, by 0-tap's controls, not yet done:* **"and the show kicks on it" passes
on the ear alone.** With the tap switched off, the band's own kicks heard by the ear made 25
and 24 in 12 s against a floor of 22.5 (three quarters of 30 tapped beats), so the claim
that the kicks come from the tapped clock can pass with no tapped clock. It wants to count
kicks on the tapped grid (within a fraction of a period of a tapped beat), not kicks at all.

Still to see: the Finger's check on the Mac over a run of builds, and whether the
looks with Polarity have lost an edge movement the owner liked (docs/judging.md
§20).

*Found 2026-09-27, not yet done:* **real viscous fingering.** In a Hele-Shaw cell
(two glasses and a gap b) the flow is Darcy's, u = −(b²/12μ)∇p, and an edge
between two liquids fingers only where the thinner one is driving into the
thicker: growth σ(k) = U|k|(μ₂−μ₁)/(μ₁+μ₂) − b²γ|k|³/(12(μ₁+μ₂)), so the surface
tension γ across the edge sets the finger width (fastest near λ = πb·√(γ/(ΔμU)))
and a still plate does not finger at all. *Since 18a-2 (2026-10-04) the thin gap's body
forces are forces: a push moves a liquid as h²/12μ says, and Rain Drip's heavy colour
already fingers by Rayleigh–Taylor, the gravity cousin of this. What is left for this
item is the colours' own viscosities and the capillary jump; Polarity's push between
colours is still a dial read as a speed (hsPrep's stirring).* The solver has the pieces: the gap
(vel.w, the squeeze), a drag through it (Depth Drag), a Jacobi projection, and
liquids with a `body` in the liquid field; and a Hele-Shaw thin-gap mode (§18a, #220: Thin Gap,
off by default) brings the mobility-weighted projection and the gap's
drag, so this builds on it. Build: a viscosity per liquid carried
with the dye (water thin, the pools' oil and syrup thick); the gap's drag 12μ/b²
on the flow, per cell; the projection weighted by the mobility b²/12μ on each face
(a variable-coefficient Poisson solve, the same Jacobi); and a capillary pressure
jump γκ at the edge. Then a lift (§10 step 4) fingers because water or air is
drawn in, a press does not because it is the stable direction, Polarity and Blob
Surface Tension mean a viscosity contrast and a γ, and `squish.ts`'s drawn spokes
(a shortcut of the same kind) can go. Checks: a radial lift's finger count against
the fastest wave for its b, γ and U; a press stays round; a still plate grows
nothing (`npm run grating` §5 asks that already).

*Found 2026-09-27, not yet done:* **#174's grating may have been this one.** Its
report was "Red Cabbage at 2.8x", read as the closeup's zoom, and its pixels
converted to cells at 8.75 px a cell on that reading. 2.8x is the tool's Amount
(the dock's `2.8×`); a report saved with the camera at 1x reads `shot.zoom 1`,
and at 1x a cell is about 4.7 px of a Retina screenshot, so its 10–15 px stripes
were 2–3 cells, not √2. Red Cabbage has Polarity, so the push ran there too. The
`dampGrid` pass stays (it removes a pattern nothing else does), but its cost on
the Mac (judging §10) is worth weighing against what it was for.

*Found 2026-09-27, not yet done:* **the owner likes the dots.** A "Roy" look with
its own control is being built in its own thread from the old push's mechanism
(anti-diffusion on the dye, a wavelength set by the gradient's reach, bounded by
the advection's hold and the 6.0 cap).

Two things to settle, in this order:

- **A conserving advection where the flow diverges.** This is the fix and it touches
  the beat squeeze, bubbles and currents as well, so it wants `npm run tools`,
  `npm run liquids` and `npm run plates` green together before and after, and a
  before/after on `npm run detail` — thinning dye correctly will change how sharp the
  plate reads, and that is the number this whole plan is judged on.
- **What the check should mean.** "Adds none" is a claim about the tool; what fails is
  the advection under it. Once the advection conserves, the check is honest as written.
  Loosening it first would silence the one instrument that found this, so it stays as
  it is until the physics is right.
