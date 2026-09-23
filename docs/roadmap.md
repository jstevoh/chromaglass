# Roadmap

*What is being built, in what order, and why that order. Updated 2026-09-20.*

`PLAN.md` is the running order for the plate itself — what the liquid does and what the
desk does with it. This page is the layer above it: the engine work those batches now
depend on, and where each of the longer plans sits.

Everything here is the **engine**: the renderer, the solver and what they make possible.
Product work — accounts, the hosted service, the recording tool — is planned outside
this repo.

## Where things stand

| | Plan | State |
|---|---|---|
| **The deep dive** | below | **Done 2026-09-23.** Every preset drawn, every setting traced, every tool and bottle checked. Four faults, the first of which is that the check for the reported one had never read a frame |
| **The post chain** | [`filters-plan.md`](filters-plan.md) F0 | **Shipped** (#92): the scene target, the finish pass, the frame-history ring and the true-average flash probe |
| **WebGPU** | [`webgpu-plan.md`](webgpu-plan.md) | **Done.** P0–P7: the app runs on WebGPU and nothing else does. The WebGL renderer, the GLSL and the parity harnesses are deleted; what remains of the port is the CPU solver's stepping, which is unreachable and waiting on its own surgery |
| **The effects** | [`filters-plan.md`](filters-plan.md) | **F0 and E6 shipped.** The post chain is under them and film stock is on the plate. Seven left — E1 the camera on the wall, E1c coupled loops, E2 prism, E3 letters as windows, E4 slit-scan, E5 iris and wipes, E7 kick ripple, E8 colour finishing — each written once, in WGSL, as H5 below |
| **The rig** | [`rig-plan.md`](rig-plan.md) | **Planned, not begun.** Many projectors on one screen, each with its own source, optics and place — which is what every show in the history actually was. The geometry is already built (sixteen surfaces, shapes, corner pins, source rects); what is missing is that every surface shows the same plate. **R6** makes one of those projectors a real one: the camera watches an analogue rig and the app plays alongside it |
| **The European school** | [`slide-plan.md`](slide-plan.md) | **Planned, not begun.** Slide projectors rather than overheads: a 2-inch vertical stage, the heat filter taken out so the lamp boils the liquid away on screen, bubblers, and Mark Boyle and Joan Hills' photoscope. Depends on heat being wired and the press working |
| **Air, ferrofluid, bottles** | [`bubbles-plan.md`](bubbles-plan.md) | **H6 and H7 done (#117, #122).** A bubble is a hole — 0.004 of the dye under it against 5.4 around — and a magnet gathers the second phase, 4927 near it against 3439 with it off. **H8 (bottles) is what is left of the plan as written**, plus three sections that came out of building the first two: D (spreading), E (the two glasses) and F (depth and a wet carrier) |
| **The solver's speed** | this page, H0–H3 | **Done.** 768² with two layers went 38.6 ms a frame to 17.1 — the display's refresh — and a 1024² rung exists above it. The solver no longer bounds that rung |
| **The plate's own batches** | `PLAN.md` §5, §6 | §6 (Render a song) wants the renderer settled, which it now is; the rest of §5 is independent |

**The compiler is on.** `@types/react` was never installed, so every React API and every
JSX element was `any` — which is how a settings object missing 33 required keys shipped.
`strict` costs zero errors now that the types are there, so a look handed over
incomplete is a build failure rather than a plate with its texture switched off.

**The shader freeze is over.** It ran from 2026-09-19 until the cutover, and it did its
job: nothing was written twice. There is one shading language in the tree now — WGSL, in
`src/gpu/wgsl/` — so a shader fix is a shader fix again.

## The deep dive, 2026-09-23

Every preset, every setting, every tool, every bottle and every dye, asked
whether it works. Seven faults came out of it and one open question, and the
first fault is why the rest lasted: the check for the reported symptom had
never read a frame.

**The check for "the whole plate went to one colour" had never read a frame.**
`npm run evolve` photographs the plate and buckets the colours; it took the
frame with `frameOf()`, which answers with a flat RGBA array, and then read
`f.data` off it. `undefined`. The verdict sat behind `if (flat && flat.share >
0.9)`, so both branches were unreachable, and the run printed *"0 of them
flat"* and exited 0 every time. It has been green and blind for as long as it
has existed, and I cited those green runs twice as evidence that the reported
fault was fixed. Rule 2 of *What a check has to do to count*, written down two
days earlier, is exactly this — the rule was applied to checks as they were
written and never to the ones already in the tree.

**The randomiser puts the plate on one flat colour in 1.6% of rolls.** In
photo mode the whole frame is `mix(paperA, paperB, g)`, and `luckyLook` rolled
the two independently out of the dye palette — so `#FF0000`/`#FF0000` and
`#0000FF`/`#0000FF` came up about once in sixty-three rolls: a saturated field
with no gradient anywhere in it, thin dye on top. That is the reported yellow
screen that filled the view. Rare enough that twelve rolls of the harness
never saw it, common enough to hit inside a set. The second colour is now
drawn only from the colours at least 90 apart in RGB from the first, which is
what every hand-authored look already does — the pair *is* the gradient.

**The finger reached one desk and one hand.** It shipped to the Perform desk
and the local pointer, and nothing else learned it: `performGesture` — the
single door the phone pad, a pen, the gamepad, OSC, a replayed performance and
the room camera all come through — had no case for it, so a finger from any
of them fell to `default` and **dropped dye**, the opposite of mixing. The
Design desk, which is the whole bench, never offered it. The keyboard map had
no `g` although the desk printed the shortcut. The remote protocol had no such
message. Five places, one feature, every one of them silent.

**Bubbles are never driven by heat.** In the rigs this is modelled on, the
lamp's heat filter comes out and the water *boils*: the bubbles are the lamp's
doing, they pulse, and they need no performer. Ours spawn from the pointer,
from a blow and from bass, and a plate left alone with `bubbles` turned up
makes none. Not a bug — nothing is broken — but it is the difference between
a bubble control and a plate that boils, and it belongs with S2 in Stage 3.

**What passed.** All 32 presets draw a picture: none flat, none empty, none
dark, no console noise, and none of them dries out over the half-minute after
it settles. Every setting is read by the engine — 135 at the time of the dive,
136 since — so there are no dead controls. The nine bottles carry the weights
they should (glycerine 1.26, milk 1.03, silicone 0.96, water the zero), and
each of the sixteen dyes paints the hue it is set to, 0° off, which
`npm run dye` holds. Evolving a look and then lowering the speed — the exact
sequence that was reported — no longer empties the plate.

**A second flat plate, still unexplained.** With the flatness check able to
read frames at last, a sixty-roll sweep found one: 96% of the frame a single
purple, `renderStyle` **show** rather than photo, the two paper colours far
apart, and 0.45 of dye still on the glass. So it is neither the backdrop nor an
empty plate.

It has not reproduced. Replaying all 136 of that roll's settings onto a fresh
plate gives 7–14% flat and 83% colour variety — a healthy picture. What is
different about the run that found it is that `evolve` rolls one after another
on a single page with nothing cleared between them, which is right, because it
is what a performer does: roll nine sits on whatever rolls zero to eight left
behind. So the remaining suspect is accumulated plate state, and the next step
is replaying the ten rolls in order rather than the tenth alone.

Chasing it turned up three more fallbacks of exactly the kind this dive is
about. **One of `evolve`'s three start looks was never that look**: it evolves
from `fillmore-east-1969`, which is not a preset — the id is `fillmore-1969` —
and `base` ended in `?? {}`, so a third of every run quietly evolved from
DEFAULT_SETTINGS while the report named Fillmore. **A roll's settings do not
determine its plate**, and nothing said so until failing to reproduce one
taught it. **And a flat roll's look was only ever printed**, so the first
reproduction attempt picked nine of the fifty-five settings that differed and
measured the wrong plate. All three are fixed: `base` throws and names the ids
it has, the caveat is printed under every flat report, and the whole look is
written out for `npm run wash` to replay.

**What now guards it.** `npm run looks` draws all 32 presets and asks of each
whether the frame is one colour, whether there is dye on the plate, whether
there is light in it, and whether it drains; it judges a late frame, because
the reported case was twenty-four seconds in. `npm run evolve` reads frames
now, takes `EVOLVE_ROLLS`, and lowers the speed after every roll. `npm run
panel` gained five: the backdrop's two colours have to differ, the Design desk
has to offer every tool the engine acts on, nothing on a desk may be a tool
the engine ignores, every tool needs a letter, and the phone has to be able to
send a blow, a press and a finger. Each of the five was watched going red
against the fault it is named for before being trusted green. `npm run wash`
replays one look and watches its colour variety over ninety seconds, and
`npm run replay` walks the seeded roll sequence without a browser.

## The stages, and what each one is for

Everything reported broken is fixed and deployed — but see **The deep dive**
below before reading that sentence the way it was meant on 2026-09-20. One of
the things it was resting on was a check that could not fail. What remains is
new work, and it falls into five stages. The order inside a stage matters; the order between
them is appetite, except where a later stage names an earlier one.

Two findings from 2026-09-23 set most of this order, and both are written up in
[`bubbles-plan.md`](bubbles-plan.md):

- **Adding velocity does not move the liquid** (§H). A push of 0.5 a cell — two
  hundred and fifty times the solver's speed clamp — moves nothing, and raising
  the clamp tenfold changes nothing either. It is the projection, for the
  seventh time in this codebase: a localised blob of velocity is mostly a
  gradient. **A tool that means to move liquid has to move the dye.** Every
  gesture below inherits this, and `npm run finger` holds it.
- **The liquids are not bodies** (§I). There is one dye field and one field of
  properties, so "mixing two liquids" means averaging scalars and blending
  colours. There is no interface to deform, finger or break — which is most of
  what a plate of oil and water looks like.

### Stage 1 — Make the plate behave like liquid between two glasses

The gestures exist and are thin. This is the stage that makes them read, and it
is where I would start.

1. **F · Depth and a wet carrier** ([`bubbles-plan.md`](bubbles-plan.md) F).
   **The depth half landed 2026-09-23**; the carrier is what is left.
   *Done:* depth is a Darcy mobility on the flow that carries the dye — the
   tight rim of a domed plate runs at 0.08 of its deep centre where it used to
   run at 1.14, and a flat plate is 0.5% from where it was, which is what lets
   it ship on by default. Two faults fell out on the way: the dome's sign was
   inverted relative to all three descriptions of it, and a shape change took
   ninety seconds to appear because the gap sprang toward it at the *press's*
   rate. A shape change is now a *shift* of the gap rather than a reset, so a
   live press keeps its dent while the glasses change under it — the shape is a
   per-plate patch target and a reset would wipe a press every frame it was
   modulated. `npm run depth` holds all six of those.
   *And a third finding worth as much as the feature:* **a pointwise multiply
   on the velocity does nothing**, because `MAX_SPEED` is what sets the
   magnitude — the forcing re-saturates that clamp every step. Halving every
   velocity on the plate every step changed the flow by 1%. That is §H's lesson
   one stage further on: additions are projected away, and multiplies in front
   of a clamp are clamped away. What survives is the transport.
   *Left:* the carrier. `dye.a` of zero still means nothing is there rather
   than clear liquid, and **D, drying and wet-plate optics all wait on it**.
2. **G · The press and the lift are different strokes**
   ([`bubbles-plan.md`](bubbles-plan.md) G). Squeezing is the *stable*
   direction and should give a smooth ring; lifting is the unstable one, and
   that is where the fingers come from. The app spends its fingering on the
   press, which is backwards, and presses and releases symmetrically, which is
   why it reads as mush. Needs a gesture that knows which stroke it is in.
3. **D · Spreading** ([`bubbles-plan.md`](bubbles-plan.md) D): a first pour
   blooms, a tenth sits in a puddle. Coverage is the state variable, so this
   follows F immediately.
4. **E · The two glasses** ([`bubbles-plan.md`](bubbles-plan.md) E): the dome is
   built and inert until F gives depth a say in the flow.

### Stage 2 — Make the liquids visible as liquids

Settle §I first: whether a liquid becomes a **body with an interface**, the way
the second phase already is, or stays a set of properties. Everything about
mixing, fingering and immiscibility *reading on screen* depends on that answer,
and it is a decision rather than a task.

5. **H8 · More bottles** ([`bubbles-plan.md`](bubbles-plan.md) C) — latex, oil
   paint, clear medium, glycol, then fizz, salt, slime, cornstarch, bleach.
   Cheap once that is settled, and largely pointless before it.

### Stage 3 — The European school

6. **S2 · Heat and boiling** ([`slide-plan.md`](slide-plan.md)) — blocked on one
   small thing: heat has no *strength*, because every source saturates the
   buoyancy tanh, so a plume has a position and nothing else. The temperature
   field, its decay, the buoyancy and H6's air field are all built and waiting.
   *And it is not only the European rig that wants this.* The deep dive found
   that bubbles are spawned by the pointer, by a blow and by bass, and by
   nothing else — so a plate left alone with the control turned up makes none.
   In the rigs this is modelled on the bubbles are the lamp's doing: the heat
   filter comes out, the water boils, and they pulse without anyone touching
   the dish. Boiling as a *source of bubbles*, keyed to the temperature field
   and to how hard the lamp is driven, is the same piece of work as this and
   should be done with it.
7. **S4 · The photoscope** — unblocked as of #120, because the press now reaches
   the picture. Still wants **shear**: twisting one slide against the other is
   what tears the film into cells, and only the squeeze exists.
8. **S1, S3, S5** — the vertical 2-inch stage, the bubbler, the slide as a cue.

### Stage 4 — More than one projector

9. **R1 · A surface becomes a projector with its own source**
   ([`rig-plan.md`](rig-plan.md)). Every other rig item is meaningless while all
   sixteen surfaces show the same plate. The expensive one: several live plates
   means several solvers, and the ladder assumes two fine rather than four
   coarse.
10. **R3 · Beams add**, then **R2 · per-projector optics**, then **R4 · placing
    by hand**, then **R5 · the rig as a document**.
11. **R6 · Watching a real rig** — prototype the feature extractor *first* and
    alone, judged against footage of a real show. `sceneSense` already gives
    per-cell optical flow; it has no notion of coverage, scale or palette.

### Stage 5 — Looks and the show

12. **H5 · The effects** — seven left, each one WGSL pass, independent of
    everything above: the camera on the wall, coupled loops, prism, letters as
    windows, slit-scan, iris and wipes, kick ripple, colour finishing. This is
    the stage to reach for when what is wanted is something visible this week.
13. **The desk pass** — item 3 below.
14. **Render a song** — `PLAN.md` §6.

### Debts, carried openly

The second phase's totals climb under a pull (a semi-Lagrangian backtrace does
not conserve what it carries; `liquidPhase` clamps the total back, and the GPU
wants a reduction the stats pass already has the shape of). H6's "the light it
adds is the liquid lit" needs a fixed pixel population before it can gate
anything. `lace-run` is still 0.189, fifteen times the speed median. The CPU
solver's stepping is a thousand unreachable lines.

## The order, and why

1. ~~**Finish the port**~~ ([`webgpu-plan.md`](webgpu-plan.md) P0–P7) — **done 2026-09-20.**
   Safety and operations, the harnesses and CI, the cutover, then WebGL2, the CPU solver
   and the appliance deleted.
   *Why it was first:* everything below is cheaper or only possible once it is done, and
   two renderers is the one state worth leaving quickly. What is left of it is the CPU
   solver's stepping — about a thousand unreachable lines, waiting on its own surgery.
2. **Spend the headroom, in this order:**
   - ~~**H0 · Time the solver's step, pass by pass.**~~ **Done 2026-09-20.** `?stages`
     gives each stage its own pass and its own timestamps, `npm run stages` reads them
     back, and the splitting costs 2%. It was worth asking: both readings below were
     wrong, in opposite directions. The table is in
     [`webgpu-plan.md`](webgpu-plan.md) — the short of it is that **cost does not track
     dispatch count** (a pressure Jacobi dispatch is 0.049 ms; `forcesB`, one dispatch,
     is 0.808), the two projections are **28.8%** of a step rather than 48% or 5%, and
     **iterative solves as a class are 64.5%**.
   - **H2 · A better solver for all five iterations, not just the pressure.**
     *The pressure half landed 2026-09-21:* twelve red-black Gauss-Seidel sweeps in
     place of twenty-four Jacobi passes, with the pressure moved into a storage buffer
     so it can be updated in place. Same residual to 0.13%, proven on the GPU by
     `pressureSelfTest` and gated in `npm run webgpu`; a frame at 768² goes 38.6 ms →
     35.9. That is 18% off the projection rather than the 50% the arithmetic promised,
     because a red-black sweep costs **1.64×** a Jacobi pass for the same cell updates
     — the checkerboard stride, not the maths. Packing the two colours into contiguous
     halves of the buffer recovered most of the rest; see below.
     *Then untouched:* dye diffusion (14.2%), the squeeze film (11.6%), viscosity
     (10.2%) — but see the scaling table in [`webgpu-plan.md`](webgpu-plan.md) before
     starting them. A step is 64× the cells for 11× the cost from 96² to 768², and
     about 0.75 ms of every step is dispatch launching rather than arithmetic. All
     three of those items cut *arithmetic*. Count dispatches first.
     *The packing landed 2026-09-21,* and it was the address and not the maths, as
     suspected. With the pressure in row order a sweep wrote every other word, so
     sixty-four consecutive threads wrote sixty-four floats spread across a hundred
     and twenty-eight, and every cache line carried half a line of the other colour
     along to be discarded. The buffer now holds the two colours as contiguous planes,
     which makes thread `i` write word `i`. Measured at 768² alternating in two pairs,
     eight readings of a projection with no overlap between the two sets: **1.114 ms →
     0.822, 26% off**; a step 7.2 ms → 6.6; and the two projections drop from the top
     of the stage table to fifth and sixth, behind the squeeze film. Gated on equality
     rather than convergence — index arithmetic can be badly wrong and still produce a
     plausible picture, since a scrambled pressure field still damps divergence, just
     somewhere else — so `pressureSelfTest` requires the packed sweep to give the same
     field cell for cell, and it does, to 0.00e+0.
     *Dye diffusion is done too.* It costs about the same whatever rate it is given,
     and the stage is skipped outright at zero. A ceiling of 0.0002 covers the nine
     looks that were above it; Classic and Fillmore are measurably sharper with it off
     entirely — three runs across two machines for Fillmore, and checked by eye — so
     both are at zero.
     *The squeeze film went the same way on 2026-09-21,* since Hele-Shaw is the same
     Poisson operator in the same Neumann box: five red-black sweeps on a packed buffer
     where it ran ten Jacobi passes ping-ponging two textures. Eight readings at 768²
     in two pairs with no overlap — **1.094 ms → 0.747, 32% off the stage** — and it
     falls from first in the table back to third. The 5-against-10 ratio is gated
     separately from the projection's 12-against-24, because Gauss-Seidel's advantage
     is asymptotic and a ratio that holds where both solvers have converged need not
     hold where neither has got far: measured at 0.15% more residual, against 0.13%.
     *Where the rung stands:* 768², two layers, classic — 30.2 ms a frame at sixty
     steps a second where H2 began at 38.6, and **17.1 ms at the thirty the governor
     now asks for, which is the display's own refresh.** The solver has stopped being
     what bounds this rung.
     *What is left of H2:* viscosity at 13%, and `forcesB` by some route other than
     splitting it (H2a below).
     — original note — Red-black
     or multigrid in place of 24 Jacobi passes — and the same treatment for dye
     diffusion (14.2%), the squeeze film (11.6%) and viscosity (10.2%), which between
     them cost more than the projections do. Less residual divergence, livelier small
     swirls, and about two thirds of a step to aim at.
     *Gate: passed 2026-09-21.* It was "1024² holds 30 fps on the M4 that manages 22
     today", and on a display with one pixel per pixel it holds **34**, keeping 30 of
     30 steps. What makes it possible is H2b rather than any of the solver work: at
     sixty steps a second the same rung is 26 fps and in slow motion, because 1024² is
     past what this machine can step sixty times a second whatever else is true. The
     rung is offered where it was measured to hold and nowhere else —
     `npm run ladder -- --device-pixels 2` puts it at 44.7 ms and 22 fps, since the
     step costs the same either way (25.2 ms: it is the grid, not the pixels) and what
     breaks it is shading four times the canvas. A rung that cannot hold is worse than
     no rung: the governor would climb into it, spend a step-down and a settling period
     finding out, and offer it again ninety seconds later. A show runs on a projector,
     and a projector has one pixel per pixel.
     *And the ladder's lower half has gone flat on this machine:* at thirty steps a
     second, 768², 512², 384² and 256² all read 17.0 ms and 59 fps, because the frame
     is bound by the display's refresh rather than by the solver. A step down from 768²
     saves 0.1 ms. That is a statement about this M4 rather than about the ladder —
     those rungs are what a weaker machine lives on — but it is why nothing below 1024²
     is worth measuring here any more.
   - **H2b · Make slow cheap: fewer steps, not smaller ones.** *The mechanism landed
     2026-09-21, the policy did not.* `?steps=N` stretches `dt` to hold `rate × dt`
     constant, and the stretch is exact (ratio 1.9988 over four runs). At 768² with
     two layers, thirty steps a second against sixty: the frame goes **38.6 ms → 16.8**
     and the plate keeps *better* time — 29.8 of 30 where sixty managed only 45.3 of
     60. At that rung the plate today is both slower and jerkier than it would be
     taking half as many steps. Structure is unchanged.
     *What is left is the policy,* and it needs an eye rather than a harness: whether
     thirty steps a second flows or steps. The obvious rule is that a machine failing
     to sustain the target rate is already in slow motion, so lowering the target is
     strictly better than what happens now — but somebody has to watch one first. The largest saving
     measured so far, and it is free of any visual cost. Motion per second is
     `steps/s × dt`, and the app holds steps/s at 60 and shrinks `dt` — so a plate at
     Speed 0.012 costs exactly what one at 0.3 costs, because the GPU runs the same
     hundred dispatches either way with a smaller number in them. Holding `dt` and
     shrinking the step rate gives identical motion for proportionally less work, and
     the solver is **94% of the frame's GPU time**. At the default speed the timestep
     is a fraction of what the solver takes stably, so the arithmetic says 3–5× of the
     dominant cost.
     *What it needs:* a floor on the step rate, because below about 20–25 steps a
     second the plate judders rather than flows; and a pass over the dozen things keyed
     to `simSteps` — the chemistry, the splats, the beads, the drain — which count
     steps where they mean seconds. Not a one-liner, and worth more than H2.
   - **H2a · `forcesB` is one kernel too many things at once.** It is 8.6% of a step in
     a single dispatch — 0.808 ms against 0.049 for a pressure Jacobi. Its floor, with
     every force switched off, is 0.368; the six forces together add 0.44; and
     **switching off any one of them on its own changes nothing measurable.** That is
     not a branch being expensive, it is the compiled kernel's register footprint
     holding occupancy down whatever it executes at runtime. Not a branch to
     micro-optimise, which is what measuring one at a time would have suggested.
     *Splitting it was tried on 2026-09-21 and does not work.* Curl noise — four
     octaves of simplex in a loop, the piece most likely to be setting the footprint —
     was lifted into its own kernel, dispatched only when a look asks for turbulence.
     Measured at 768² alternating in two pairs, the split is **worse in all four
     readings**: 0.810 ms against 0.684. An extra pass reads and writes the whole
     velocity texture, 9 MB a layer a step at this grid, and that costs more than the
     occupancy it buys back. The guard that would have paid for it never fires either:
     **none of the nineteen looks that name `turbulenceScale` have it off**, so the
     skip is theoretical. What is left is to shrink the worst path *in place* — fewer
     values live across the octave loop, or a cheaper noise — which keeps the one pass
     and is a different and harder piece of work.
   - **H1 · Dye carried by particles.** *First landing 2026-09-20, off by default.*
     The measured gap in `PLAN.md` is that filmed liquid holds three to five times more
     structure at 4–8 px than ours. Particles don't smear, which is the fix.
     `gpu/particles.ts` seeds them where there is dye, advects them through the same
     forced velocity the dye rides, and splats them as additive soft discs into a
     texture the compositor folds into the raw dye. `particles` is the amount and
     `particleMix` how far their carried colour is trusted; at 0 none are allocated,
     which is where every look made before this sits.
     *Measured on one plate with the amount toggled under it* (`npm run ab`, which
     exists because separate runs of this preset differ by more than the change does —
     the same settings gave 1601 KB and 3042 KB on consecutive runs). Fillmore, 512²:
     hard edges 12.3% → 16.8% of pixels, typical local gradient **1.5 → 2.4**,
     structure at 2–4 px up, coverage unchanged. A macro closeup gains far more in the
     band the plan cares about — 4 px 1.3 → 2.8, 8 px 0.8 → 3.2, 16 px 0.8 → 3.4 — but
     *loses* hard edges (51.8% → 34.8%) and local contrast (33.1 → 2.5), because the
     macro path synthesises detail of its own and the fold softens it.
     *What it costs,* at 512², two layers, amount 0.8: the frame goes from 17.1 ms to
     29.5 ms — 58 fps to 34. About a millisecond a layer a step is the seed and advect
     compute; the rest, 6.6 ms a frame, is the splat, which is 2.1 million discs of
     about seven fragments each. It is affordable well below 0.8 and it is why this
     cannot be on by default yet.
     *Still to do, in order:* teach the governor about it, since a setting that halves
     the frame rate and the quality ladder that measures frame rate currently know
     nothing about each other. Attenuate the fold under macro zoom, where it costs more
     contrast than it adds structure. And revisit the splat resolution — 2× is one step
     past useless (at 1× it made the plate measurably **worse**, which is the finding
     that shaped everything else here) and probably not yet enough.
   - **H3a · A governor that knows what a rung costs.** *Half done 2026-09-21.* The
     ladder's pixel rungs were inert — the canvas ignored them — and on a 1x display
     it carried a rung twice; both are fixed, and `npm run ladder` and `npm run rungs`
     measure and check the shape. What is still true is that the governor has **no
     cost model**: it walks the list one step at a time and the order of the list is
     its whole understanding. Each step now saves something, and the order is
     defensible, but it cannot tell a step worth 23 ms from one worth 2.
   - **H4 · Wide colour, and HDR** where the screen has it.
   - **H5 · The effects** ([`filters-plan.md`](filters-plan.md) F1–F9): film first, then
     the feedback camera and its coupled loops, the prism and kick ripple, letters as
     windows, iris and wipes, slit-scan, colour looks. Film needs nothing that isn't
     already built — the history ring and its self-test shipped with F0 — so it and H6
     are the two places to reach when what's wanted is something visible this week
     rather than a faster frame.
   - ~~**H6 · Air as a field**~~ ([`bubbles-plan.md`](bubbles-plan.md) A) — **done
     2026-09-21, merged in #117.** A bubble is a hole rather than shading over the dye:
     **0.004** of the dye under one against **5.4** around it, where the mechanism it
     replaced reached only 1.362 against 1.998. The plate keeps its colour (99.6–105.1%
     of a no-bubble control) and a popped hole fills back to about **114%** of its
     surroundings.
     *What it cost to learn, and what it is worth reading before touching the solver:*
     every operator driven by the air **gradient** is zero where the air is uniform, so
     none of them can reach the middle of a bubble — the radial profile said it flatly,
     with the centre at 0.990 of an identical plate carrying no bubble. Under that sits
     the reason no amount of pushing helped: the dye's advection is semi-Lagrangian, so
     it carries a value along a characteristic and has **no term that dilutes**, and a
     radially symmetric source has no velocity at its centre. A hundred times the
     source strength moved 0.67 to 0.62. Only a *local* operator reaches a uniform
     interior, which is why the answer is a multiply, and the dye it removes is put
     back as a ring — on the CPU, where it is exact.
     *Formats, twice, in opposite directions:* `r32float` is **not blendable** and the
     splat blends; `r16float` is **not a storage format** and a compute pass writes the
     trail. The first rejects a pipeline and leaves a silently empty field; the second
     rejects the command buffer and **the whole plate freezes**, which looks nothing
     like a format error.
     *And the checks were the harder half.* Three optics checks written for a bubble
     that shaded over dye were still being asked about a bubble that is a hole, and one
     of them was **inverted** — a backlit dish filters the lamp through the dye, so the
     light a correct hole adds is nearly the complement of the ground, and the check
     failed hardest on the most physically correct hole. They are rewritten and
     validated against controls; see `bubbles-plan.md`.

   - **H7 · The second phase** ([`bubbles-plan.md`](bubbles-plan.md) B): a heavy,
     immiscible liquid with surface tension and a magnet — ferrofluid, at both macro and
     plate scale. Absorbs the oil-bead mask.
     *It asks for a density difference*, "so the heavy phase sinks against the plate
     rock and the tilt" — and there is no such thing in here to build on. The plate
     carries **one** dye field and **one** velocity field, so every colour shares the
     same momentum and nothing can stratify; the only density-like force is
     `tanh(dye.a − meanD)`, which is how *much* dye and not what *kind*, and
     immiscibility is repulsion by colour difference. That is section F below, and it
     is H7's floor rather than a nicety.
   - **F · Depth, and a plate that is wet everywhere**
     ([`bubbles-plan.md`](bubbles-plan.md) F): the gap field is a real depth and feeds
     only the squeeze, so advection, diffusion and the projection are all depth-blind.
     A Hele-Shaw cell obeys Darcy with mobility in h², which is what would make liquid
     run in the deep channels and stall where the glasses nearly touch — and what would
     make the plate's dome (E) do anything at all, since it currently does nothing
     measurable. The other half is a clear carrier: `dye.a` of zero means *nothing is
     there* rather than clear liquid, and three separate features want that one field —
     drying, wet-plate optics, and the oil saturation in D.
   - **D · Spreading, and why a first pour is not a tenth**
     ([`bubbles-plan.md`](bubbles-plan.md) D): oil on clean water spreads to a
     monolayer; oil on oil sits where it lands. The state variable is surface coverage
     and the force is `∇γ`, not γ. **The trap is written down**: a pure gradient force
     added to the velocity is exactly what the projection removes, which is the same
     wall H6 hit three times, so it has to enter the divergence, the dye's transport,
     or a multiply.
     *Half of it is already built, for soap.* `lib/liquidPhase.ts` carries a real
     per-liquid chemistry field with a Marangoni force on the soap channel, and a
     ceiling whose own comment states the saturation case: a plate that is uniformly
     soaped has no force left in it. So the mechanism exists and the missing part is
     **what it is attached to** — soap has a tension field and the dye does not, which
     is why a pour onto bare plate and a pour onto a covered one behave the same.
     Same field F asks for, from the other end.
     *And what is left:* `repel` is a scalar per cell rather than a pairwise matrix,
     so a liquid refuses to mix with whatever it meets rather than with a particular
     other liquid. Weight and polarity landed in #119, so a liquid does now know what
     it is made of and what it floats on; the pairwise part is what remains.
   - **R · The rig** ([`rig-plan.md`](rig-plan.md)): many projectors on one
     screen. Every show in the history was one — the Joshua Light Show ran
     three overheads, three film projectors and two banks of four-carousel
     slide projectors, rear projecting from twenty feet behind the stage, and
     rigs ran from two or three projectors up to seventy with ten operators.
     *The geometry is already built:* sixteen surfaces, each with a shape, a
     corner-pin quad, a source rect and a feather. What is missing is that they
     are all windows onto the **same plate**, which is the one thing a rig is
     not — so the work is per-projector sources, then additive combination
     (beams add; the soft edges the operators used exist precisely so two
     overlapping beams do not show a seam), then per-projector optics.
     *The cost is real and it is all in one place:* several live plates means
     several solvers, and the quality ladder assumes two at a fine grid rather
     than four at a coarse one.
     *And **R6**, which is the one worth doing for its own sake:* point the
     camera at a screen an analogue rig is projecting onto, and the app
     responds to the picture as well as the music — the newest operator on a
     bank of overheads, taking its cues from the people either side of it.
     Four modes, and they are different instruments: **mirror** its look,
     **couple** to its currents, **answer** it (the only one that sounds like
     two operators rather than one follower), and **register** the two images
     in one frame.
     *Checked rather than assumed, and it changes the order:* `sceneSense`
     already produces **per-cell optical flow on a 24² lattice**, which is the
     hardest-sounding piece and is a velocity field a solver can eat. What it
     has no notion of is coverage (only *motion*, which is what changed), scale
     or edges, and its `hue`/`chroma` are a colour **centroid** — so a
     magenta-and-cyan plate averages to grey and any plan that says "read the
     palette" is wrong until that is a histogram. So the first thing to build
     is none of the four modes: it is the extractor, judged against footage of
     a real show, answering whether it can tell big slow magenta blobs settling
     from fine fast cyan cells agitating.
   - **S · The European school** ([`slide-plan.md`](slide-plan.md)): the other
     tradition, and the app models none of it. An overhead projector is a
     horizontal dish worked by hand; a slide projector is a **2-inch vertical
     aperture with a fierce lamp inches behind it**, and every difference
     follows from that. Liquid runs *down*; the stage is permanently macro;
     and — the act that defines the school — **the heat filter comes out**, so
     the lamp cooks the liquid and it boils, blisters and burns away while it
     is on the screen. A slide has a beginning and an end, which nothing here
     does yet.
     *Most of it is wiring rather than new physics.* The temperature field
     exists and is fed from twenty places; the air field (H6) is built and
     proven; the squeeze film between two glasses *is* the photoscope. What is
     missing is that heat has no strength (every source saturates the buoyancy
     tanh, so a plume has a position and nothing else), and that the press does
     not yet reach the picture. Both are prerequisites and both are small.
   - **H8 · More bottles** ([`bubbles-plan.md`](bubbles-plan.md) C): latex, oil paint,
     clear medium, glycol first; then fizz, salt, slime, cornstarch, bleach. Needs the
     liquid field moved to the GPU.
3. **A pass over the desk,** once the headroom is real: the settings, the presets and the
   Songs sequencer re-tuned for what is now cheap — defaults that assumed a 384² grid and
   a 24-pass solver, and ranges that were capped by the old cost.
   *Started by symptom rather than by plan.* Speed has now been scaled twice from the
   floor — every preset by 0.6, then by 0.7 again when looks still opened too fast — so
   the median is 0.0126 where it was 0.030, and `lucky.ts` has followed both times
   because `npm run panel` holds the dice to the looks' own median. That is two rounds
   of somebody watching a plate and saying "too fast", which is what this item exists
   to do properly and in one pass. **`lace-run` is still 0.189, fifteen times the
   median**, with `macro-bead` at 0.118 and `cell-bloom` at 0.076: uniform scaling
   keeps an outlier proportionally as much of an outlier, and those three want deciding
   individually rather than divided again.
4. **`PLAN.md` §6, Render a song,** once the renderer is settled: seeded randomness,
   offline audio analysis, and frames encoded rather than captured.

## Why this order and not another

- **A measurement before the two items that argued about it** — done, and it was worth
  the afternoon. Two readings of the old evidence put H2 at 5% of a frame and at a third
  of it; the answer is 28.8% of a step for the projections, and 64.5% for the five
  iterative solves together. Neither guess would have aimed the work at the right four
  stages. The general form of the mistake is worth keeping: **the step is bound by what
  each kernel does per pixel, not by how many kernels there are.**
- **The pressure solver before the particles,** because particles *add* work to a step
  that is already 94% of the frame's GPU time at the top rung (17.8 ms a step, 1.75
  steps a frame, against 2.1 ms of drawing). Landing H1 on an uncheapened step buys structure at
  4–8 px and then hands it back when the governor drops a rung to pay for it. H2 makes
  the room H1 spends. This reverses the order these two were written in, on the
  measurements taken during the port.
- **1024² as a test, not a task,** because the rung itself is two lines. Today an M4
  holds it at 22 fps, which is not a show — so shipping the rung first would ship a rung
  the governor immediately steps back down from, which is the thing P6 fixed. It becomes
  real when something makes it affordable, so it belongs to whatever that is.
- **The port before the effects,** because an effect written in GLSL now is an effect
  written twice. *(Done: the port landed 2026-09-20.)*
- **The plate before the effects,** because the thing people see first is the plate, and
  the plate's own detail is the oldest measured shortfall in `PLAN.md`.
- **Air before the second phase,** because both exclude dye from an area and pile it at a
  rim, and air is the simpler of the two. The second phase inherits that machinery.
- **The bottles last,** because each one is cheap once the fields are on the GPU, and
  because they are the easiest thing to add too many of.

## What a check has to do to count

Written down on 2026-09-21, after nine separate checks in one day turned out to be
green because they could not fail. A tenth turned up on 2026-09-23 — `evolve`'s
flatness verdict, unreachable since the day it was written — and it is the one
that says the rules are not enough on their own: **they were applied to checks as
they were written and never to the ones already in the tree.** A rule that only
runs at the moment of writing protects nothing that already exists. When a
harness reports zero failures on a fault the user is still reporting, the harness
is the first suspect, not the last.

Every one had the same shape: **a check that cannot tell "the system had nothing to
give" from "the system worked".** A painter that declined to draw and said nothing, so
a harness measured a frame nobody drew. A `populate` that placed no beads, so a test
compared a count to itself — `0 === 0` — and passed while proving nothing; that one had
been green and empty for an unknown length of time, and it skipped a deploy. A single
frame of a drifting plate read as a grade. A settings roll handing over 33 keys as
`undefined`. A `switch` with no `default`. A twenty-minute job timeout over a
documented thirty-four-minute worst case. An air field that was entirely empty while a
stage ran over it for 0.197 ms of every step and eleven checks passed.

Three rules came out of it, and they cost less than the hour any one of these took to
find:

1. **Ask where, not whether.** "Is there air" passed on an empty field, on a field
   peaking at 0.01, and on one read through the wrong format. "Is the air within 0.06
   of the position this check chose, and *not* near its mirror" passed on none of them.
   A claim with a number in it that the check picked in advance is worth more than any
   amount of asserting that something happened.
2. **Run the control.** A check that has never been seen to fail is a check that is
   measuring nothing, and there is no way to tell the two apart from the outside. Force
   the failing condition once — a software engine, a black frame, a flipped field — and
   watch it go red before trusting it green.
   *And never hand a check a value it can read as consent.* `evolve` asked for a
   frame, got `undefined` because it unwrapped a field that does not exist on a
   plain array, and treated that as "nothing to judge" rather than as a failure.
   A measurement helper that cannot measure should **throw**; `frameOf` says so
   at the top of `scripts/frame.mjs` now, and `evolve` and `looks` both stop
   rather than shrug.
3. **Suspect the instrument first.** Of the faults above, more were in the measuring
   than in the thing measured: a readback that did not match its texture's format, a
   regex that mis-parsed a union three times, a grep that filtered out the error it was
   looking for, a report of 3774 type errors where the real number was zero. When a
   measurement disagrees with what you expected, check the instrument before you write
   down the finding.

The compiler is the strongest instrument available and was not switched on: the project
carried no `@types/react`, so every React API and every JSX element was `any`, which is
why `setSettings` accepted an object missing 33 required keys. `strict` is on now, at a
cost of zero errors once the types were installed.

## How to read the plans

Each plan carries its own gates — what has to be true before the next step starts — and
its own checks. Where a plan and this page disagree, the plan is right about detail and
this page is right about order.

- [`webgpu-plan.md`](webgpu-plan.md) — the port, phase by phase, with the P0–P7 results
  and the measurements that decided them, including the frame budget H0 and H2 argue
  over.
- [`filters-plan.md`](filters-plan.md) — nine effects and the tools that make them
  playable, with the post chain they share.
- [`bubbles-plan.md`](bubbles-plan.md) — air, the second liquid, and the bottles.
- `PLAN.md` — the plate itself: the batches, what is not being done, and the operating
  rules every new setting follows.
