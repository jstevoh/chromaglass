# 22. Spin the plate
**Partly shipped** (#223, #252, #258, #261): the Spin tool, Auto Spin, the one dish under a plate, the cut of the swirl's projection and the look's motor retune are in. The shortcuts and what is open are below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

Asked 2026-09-28: "spin the plate on command, or set it to spin automatically at some
rate (or a rate controlled by some other factor, like music tempo); give me a control
(like press) and a setting."

**Shortcuts, named so they are replaced:**

- **22b. The swirl is not carried by its own flow.** τU/L is about 1 for water spun
  hard, so the swirl's inertia matters there; it is integrated in place. Advect it
  with the velocity (a semi-Lagrangian step, as the current is).
- **22c. Coriolis is left out.** In a flat gap it is a pure gradient for a
  divergence-free flow and the projection takes it; with a varying gap a sliver is
  left. Add 2ω_l ẑ×u where h varies, and measure what it changes.
- ~~**22d. The CPU solver gets the bulk lag and not the swirl.**~~ Dropped with the CPU
  solver's stepping (2.6, decided 2026-10-06; 3.1). Where there is no
  WebGPU, `FluidSimulation`'s own step (`LiquidVisualizer.tsx`) turns the picture
  with the liquid but has no swirl; give it `spinSwirl`'s few lines.
- **22e. The liquid's drag on the dish is ignored.** The dish is a flywheel with its
  own drag (the plate's old spin), not slowed by the liquid it drags; a thick liquid
  should brake a flicked dish harder than water.
- **22f. The performance recorder does not record a Spin hand.** A spin from the tool
  replays as nothing; Auto Spin is a setting, so it replays.
- **22g. With Thin Gap on (18a, #220).** The swirl field hands the thin solve the
  dish's drive as a speed at the rest gap, a/k0, and the solve's own drag 12ν/h²
  brings the liquid to a/k and makes it conserve liquid (`npm run dish`: a pressed
  palm 0.607 against the old plate's 0.534, away from it 0.006 of that; handed the
  integrated swirl it counted the gap twice and the palm read 0.045). Properly the
  dish's drag is a force in the thin solve's own momentum balance (A(k − k0)ẑ×r beside
  18a-2's forces), with no swirl field at all. 18a-2 built that drag for a glass
  sliding as a whole (Glass Smear: hsPrep's A.b.zw, the liquid driven toward U/2
  with the gap's own 12ν/h²); the dish is the same with U = ω×r a cell at a time.
- **22l. Nothing winds the middle against the rim now.** The stir was a differential
  rotation, and some looks read by it (galaxy's spiral arms; its preset said so). A
  steady dish under one liquid cannot make one; what does in a real show is a second,
  smaller glass pressed into the middle and turned against the dish: under it the
  liquid is sheared between two glasses and goes round at about the mean of their
  speeds (Couette flow through the gap), outside it at the dish's, so the middle winds
  against the rim along the top glass's edge. If the owner misses the spiral (§28),
  build that as a tool or a setting, with the drag worked out from the gap as the
  swirl's is, not as a stir.
- **22m. What the retune left behind.** (1) The stir sped up and slowed with the
  look's clock (the phrase's lean, the tempo's pace, a scene's swell, the Speed dial);
  a motor does not, so a look whose clock leans a long way turns a little less with
  its swells than it did. (2) The match is the front plate's; a back plate whose
  Background Loop slows its clock had a slower stir, and now turns its dish as fast as
  the front's. (3) Saved looks, scenes and set lists written before keep their old
  dial (0.1 and under) and so lose most of their turn: a load could move an old
  look's dial the way the presets were moved (it needs the look's Speed and Advection,
  which a saved look has). (4) Since the motor is most of what turns acid-trip,
  cyberpunk and stardust-collapse, their liquid turns faster than 0.05 rad/s all the
  time and the swirl's centrifuge runs on every step there, not only while they play
  (22k measured what that costs: under a fifth of a percent of the GPU).
- ~~**22k. The swirl runs on every look with music routed to rotation.**~~ **Measured and cut** (#258). Story in `docs/plan-shipped.md` §22k (moved 2026-10-29, 19m-2).

  Found along the way:
  - **22g's thin palm reads 0.307 in the lab, not the 0.607 written there,** on main before
    this change. Still over the check's half of the old plate's 0.534, but by 15% where it
    was by more than double. Find what moved it (#248 Thin Gap everywhere, #255 the thin
    forces, or the lab's own plate) and either restore it or write down why it moved.
- **22i. The hand reads its angle, not its grip.** A hand turns the dish at its
  angular speed round the middle, held to a turn and a half a second, because near
  the middle a small move is a large angle. A hand's real torque is its friction
  times its lever arm: weight each hand by its radius and let a thick liquid's drag
  push back (22e).
