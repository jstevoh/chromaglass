/**
 * What the look a show opens on turns on, as far as its pipelines go.
 *
 * The show builds its pipelines before it opens (`gpu/prepare.ts`), and
 * building all eighty-seven one at a time on a cold Mac took 19.7 s, against
 * the 9.8 s the old way stopped for (`npm run startup`, run 36255595521): the
 * plate sat on its starting frame for twenty-three seconds. Most of that was
 * for looks it was not opening on. Every one of the thirty-eight looks opens
 * on the same forty-three, and each adds at most ten of its own; the
 * union of all their openings is seventy-three, so waiting for every look's
 * opening would have saved almost nothing. The opening waits for the
 * forty-three and for what its own look adds, and the rest is built behind
 * the show once it is up.
 *
 * What a look adds follows from a handful of settings, each of which switches
 * on a part of the solver or the picture that has pipelines of its own. They
 * are read here, next to nothing else, so each owner's list can say which of
 * its pipelines wait on which part (`WebGPUFluid.prepare` and its
 * neighbours). The thresholds are looser than the ones the show switches on
 * at, so a dial just above zero still counts: a pipeline built ahead that the
 * look never asks for costs a fifth of a second; one it asks for that was not
 * built costs the same, on the frame, as a stop.
 *
 * `npm run startup` opens every look and fails if any asks, in its first
 * steps, for a pipeline that was left for later.
 */

import { DEFAULT_SETTINGS, type VisualizerSettings } from '../types';
import { carrierViscosity, dishFollow, dragSeconds, liquidFollow, lookMotorRate } from '../lib/turntable';

export interface Opening {
  /** Vorticity confinement (galaxy): the curl and the push it gives. */
  vorticity: boolean;
  /** The mix and its surface tension (soap-film, milk-marble). */
  mix: boolean;
  /** The reaction (chemical-clock). */
  reaction: boolean;
  /** The gel (agate). */
  gel: boolean;
  /** The second phase (the ferrofluid). */
  phase: boolean;
  /** The magnet's maze on the second phase (magnet-garden). */
  maze: boolean;
  /**
   * The second phase pushing the dye it moves through (Pushes Dye; Ferro
   * Paint). Added with that setting, after the rest of this list: the
   * startup check found Ferro Paint asking for it in its first steps with
   * no list naming it, which is how a new kernel brings the freeze back.
   */
  displace: boolean;
  /** The particles (stardust-collapse). */
  particles: boolean;
  /** The plate filmed by a camera (oil-on-water and its kind). */
  camera: boolean;
  /** The film stock (home-movie). */
  stock: boolean;
  /**
   * The plate as a Hele-Shaw cell (Thin Gap, PLAN §18a): its own solve, the
   * carries' substeps and their plan, in place of the old projection. On in
   * every look since the owner picked every look (2026-10-03), so every
   * opening asks for them from its first step. Read as the step reads it (a
   * switch at one half), and from the default when a look does not say,
   * since no preset does.
   */
  thinGap: boolean;
  /**
   * The spun dish's swirl (spinSwirl, PLAN §22), when the look's own motor
   * sets its dish turning faster than its liquid in the opening's first
   * seconds (lookOpensSpinning). Added with PLAN 22j, which put the motor's
   * old stir onto the dish: `npm run startup` then found galaxy, cyberpunk,
   * acid-trip, timbre-shifter, boiling-point and solar-flare asking for it
   * at their first steps, with no list naming it.
   */
  spin: boolean;
  /** The chemistry (Turing patterns). */
  chemistry: boolean;
  /**
   * The plate stood up (Plate Upright), or the dye given weight (Dye
   * Weight): the mix's push on the flow (mixSmooth, mixForce) runs from the
   * first step, where on every other look it waits for oil or soap to be
   * poured. Added with Lava Lamp (PLAN.md 28a), the first look to stand
   * the plate up: `npm run startup` on Metal found it asking for both in
   * its first steps with no list naming them.
   */
  gravity: boolean;
  /**
   * The slosh dish (PLAN 18a-13, 18a-13a): its four kernels and the solver's
   * `addSlosh`, when the look's own settings tip the dish from its first step.
   * Added 2026-10-29 after the first deploy run on the owner's Mac: `npm run
   * startup` found Bass Drop asking for all five in its first steps with no
   * list naming them, where GitHub's Macs had passed the same code for a week.
   * The dish is driven by Plate Rock's swing where Frame Sway lets the frame
   * move (`rockAccel`), and the swing is never nought: a resting hand sways
   * (`swayAt`, lib/plateRock.ts), so a look with both dials up tips the dish
   * on its first frame. Its kernels were all built behind the show, and the
   * dish waits for them (`WebGPUSlosh.ready`), so nothing was built on a
   * frame; but on the owner's Mac the rest was built within the look's first
   * three seconds, the dish started and asked, and on GitHub's slower Macs
   * it had not started by the time the window closed. The Slosh dial itself is a
   * hand's and 0 on every look; it tips the dish at opening only with the
   * plate stood up (`sloshAccel`), so that pair is read too. A kick's press
   * and a held phone's tilt arrive later, and the dish waits for its kernels
   * then as before. Off the thin gap the dish is never stepped (`stepSlosh`).
   */
  slosh: boolean;
  /**
   * The clear film (PLAN §20b): carried, its pressure and its update, from
   * the first step, when the look lays a film (Clear Film above nought).
   * Added with Saffron Lace (PLAN 28l), the first look to lay one: `npm run
   * startup` on the Mac found it asking for all three in its first steps
   * with no list naming them. The film's level change (filmSplat) is a hand
   * on the control mid-show, never an opening, so it stays behind the show.
   */
  film: boolean;
  /**
   * The sealed bottle (PLAN 27f-9): a thin gap stood up (Plate Upright above
   * nought) takes its weight as the closed cell's circulation from the first
   * step (sealSource, hsLiftRelax, sealFlow), where every other look builds
   * them behind the show with the oil's lift. Added with the seal: `npm run
   * startup` on the Mac found Lava Lamp asking for all three in its first
   * steps with no list naming them. Until they are built the plate takes its
   * weight on the open rim, so nothing was compiled on a frame, but the look
   * opened on the leak the seal is there to stop.
   */
  sealed: boolean;
  /**
   * The frame's soap film (PLAN 32d): its solver's five kernels and the
   * plate's three that drive it (the air, the re-dip's state and its lay),
   * from the first step, when the look hangs a frame (Soap Film above
   * nought). Added with the film: `npm run startup` on the Mac found Soap
   * Film asking for all eight in its first steps with no list naming them.
   * Every other look builds them behind the show, for the hand that turns
   * Soap Film up mid-set.
   */
  soap: boolean;
  /**
   * The look's own oil, laid with the look and waiting for the solver (Clock
   * Glass, Splodascope, Lava Lamp).
   *
   * Not a setting: it is what is on the plate. The mix's kernels run only
   * once something has been poured into the mix (`mixLive`), and on every
   * other opening nothing has, so they were built behind the show. Until
   * PLAN 27f-9m these three looks' oil was laid before the solver existed
   * and let go, so their openings never ran the mix either, and the lists
   * were right about a show that was wrong. With the oil kept for the solver
   * (`sim/mixWait.ts`) it is laid on the solver's first step, and
   * `npm run startup` on Metal read each of the three asking on the frame for
   * the mix's carry, relax, potential and update, the oil's force, and the
   * bodies' and the lift's kernels: eight to fifteen pipelines the opening
   * had not waited for. The simulation says whether oil is waiting
   * (`FluidSimulation.wait.pending`), and the four below follow from it and
   * the settings that the step itself reads.
   */
  oil: boolean;
  /** That oil's surface tension: the smoothed shape, the rim's pressure and the force (Oil Tension on, over oil that is there). */
  oilPull: boolean;
  /** Oil Bodies: each body's colour kept to it (partition, unspread, land), which runs only over oil that pulls. */
  oilBodies: boolean;
  /**
   * Film Hold's push between two drops. It runs inside the mix force's
   * stage, which is on over oil that pulls or under a standing plate's
   * weight, and then only with Oil Tension on.
   */
  filmHold: boolean;
  /**
   * The oil's lift up a rocked plate (PLAN 27f-5): a thin gap, a Plate Rock
   * above zero (the hand's sway is never still, so the rock is not either)
   * and oil that pulls. Lava Lamp stands with its rock at 0 and never asks.
   */
  oilLift: boolean;
}

/**
 * Whether a look's dish runs ahead of its liquid in its first three seconds
 * by enough to start the swirl, on the frame's own flywheel: the dish comes
 * up to the motor on its bed (dishFollow, at the frame's drag rate, the
 * `bed` and `dragRate` lines where the frame turns each plate) and the
 * liquid follows it with its drag time (liquidFollow). The swirl starts at
 * 1e-3 rad/s between them (SWIRL_DISH_MIN in fluid.ts) or 0.05 rad/s of
 * the liquid's own (SWIRL_SPIN_MIN); this asks for four fifths of either,
 * looser as the rest of this file is. The dish takes its motor's speed within
 * a few frames (the bed's dry friction), so for a moment any liquid lags it
 * by most of that speed: water for seconds, the thick liquid for a tenth of
 * one, by 0.8 of it at the frame's step. So a look starts the swirl at
 * opening when its motor is over about 1.25e-3 rad/s, thin or thick; Classic's
 * 0.0007 lags by 0.00056 and never does, galaxy's 0.004 lags by all of it.
 */
export function lookOpensSpinning(s: Partial<VisualizerSettings>): boolean {
  const motor = lookMotorRate(s.rotationSpeed ?? 0);
  if (!(motor > 0)) return false;
  const viscosity = s.viscosity ?? DEFAULT_SETTINGS.viscosity;
  const bed = (viscosity === 'thin' ? 0.8 : 1.7) * (1 + (s.platePressure ?? DEFAULT_SETTINGS.platePressure ?? 0) * 0.8);
  const dragRate = (0.04 + (s.spinDrag ?? DEFAULT_SETTINGS.spinDrag ?? 0.25) * 1.2) * bed;
  const tau = dragSeconds(carrierViscosity(viscosity));
  let dish = 0, liquid = 0;
  for (let k = 0; k < 180; k++) {
    dish = dishFollow(dish, motor, dragRate, 1 / 60);
    liquid = liquidFollow(liquid, dish, 1 / 60, tau);
    if (Math.abs(dish - liquid) > 8e-4 || Math.abs(liquid) > 0.04) return true;
  }
  return false;
}

/**
 * `oilWaiting`: whether the look now up laid oil that waits for this solver
 * (`Opening.oil`). The one thing here that is the plate's and not a setting's,
 * so the caller asks the simulation and hands it in.
 *
 * When it is asked matters. The opening look is laid in the same pass of
 * effects that starts the stage, before the device has answered, so by the
 * time the show builds its pipelines the oil is waiting and this says so. A
 * device lost mid-show is another matter: its replacement builds first and
 * the look is laid again after, so nothing waits yet, this says no, and the
 * oil's kernels are compiled on the frame as they were before PLAN 27f-9m. A
 * hitch on a plate that has just gone dark and come back, and never a wrong
 * picture: every kernel is still built, only later.
 */
export function openingOf(s: Partial<VisualizerSettings>, oilWaiting = false): Opening {
  const on = (v: number | undefined) => (v ?? 0) > 0;
  const thin = (s.thinGap ?? DEFAULT_SETTINGS.thinGap) > 0.5;
  const gravity = on(s.plateUpright) || on(s.solutalBuoyancy);
  const oilPull = oilWaiting && on(s.oilTension);
  return {
    vorticity: on(s.vorticityConfinement),
    mix: on(s.surfactantFlow),
    reaction: on(s.bzReaction),
    gel: on(s.liesegang),
    phase: on(s.phaseAmount),
    maze: on(s.phaseAmount) && on(s.magnetStrength),
    displace: on(s.phaseAmount) && on(s.phaseDisplace),
    particles: on(s.particles),
    camera: on(s.camera),
    stock: on(s.stock),
    thinGap: (s.thinGap ?? DEFAULT_SETTINGS.thinGap) > 0.5,
    spin: lookOpensSpinning(s),
    chemistry: on(s.chemistry),
    gravity: on(s.plateUpright) || on(s.solutalBuoyancy),
    slosh: (s.thinGap ?? DEFAULT_SETTINGS.thinGap) > 0.5
      && ((on(s.plateRock ?? DEFAULT_SETTINGS.plateRock) && on(s.frameSway)) || (on(s.slosh) && on(s.plateUpright))),
    film: (s.clearFilm ?? 0) > 0.001,
    sealed: (s.thinGap ?? DEFAULT_SETTINGS.thinGap) > 0.5 && on(s.plateUpright),
    soap: (s.soapFilm ?? 0) > 0.001,
    oil: oilWaiting,
    oilPull,
    oilBodies: oilPull && on(s.oilBodies),
    filmHold: on(s.filmHold) && on(s.oilTension) && (oilWaiting || gravity),
    oilLift: oilPull && thin && on(s.plateRock ?? DEFAULT_SETTINGS.plateRock),
  };
}
