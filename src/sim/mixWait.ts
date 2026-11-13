/**
 * A look's oil, laid when no solver is there to take it (PLAN 27f-9m).
 *
 * Reported 2026-11-12: on the Mac the Lava Lamp's wax smeared into streaks
 * and folded sheets, where the lab's lamp holds fat round blobs. Measured in
 * the app, on the look opened with the page as every film of it had been: the
 * solver's mix field held no oil at all, zero cells of wax for 150 seconds,
 * and the oil's own dye field was never made. There was no wax. What was
 * filmed was the wax's dye alone, a colour dissolved in water and stirred by
 * the lamp's convection, and a dissolved colour has no interface for tension
 * to pull round: a flow draws it into streaks, as it must.
 *
 * The oil lives only on the GPU (the mix is one of the liquids that never
 * cross to the CPU), so the looks laid it with `this.gpu?.addMix?.()`. The
 * app lays its opening look before its solver is built, the `?.` found no
 * solver, and the oil was let go without a word while the look's dye landed
 * in the CPU arrays as usual. The same look picked from the desk a second
 * later had its wax, and so did the lab, which lays oil on its own solver:
 * every check of the lamp was green on a liquid the app's opening never had.
 * Clock Glass and Splodascope opened the same way, as coloured spots of dye
 * with no oil under them (which Clock Glass's comment described as how it
 * was meant to be).
 *
 * So a look hands its oil to `lay`, which gives it to the solver when
 * there is one and keeps it when there is not, and `attachGpu` lays what
 * waited on the solver it is given (`play`). The waiting oil is part of
 * the plate's opening state exactly as the simulation's seed is, and is kept
 * and put back with it (`putBack`, from `restoreSeed`): a first solver
 * that runs out of memory before it has spoken must not take the wax with
 * it. A solver that hands its liquids on to the next (the carry) hands this
 * oil on in them, so the simulation calls `drop` when it takes a carry, or
 * the oil would be laid twice; and `clearAll` calls it, or a cleared look's
 * oil would turn up under the next look.
 *
 * Why not lay the look again once the solver is there: the look draws from
 * the plate's dice, and a second lay would be a different plate from the dye
 * already down. Why not build the solver first: it is built when the device
 * answers, and the plate is drawn from the CPU arrays until then.
 *
 * `npm run oillaid` holds each of these, against the same look laid on a
 * solver that was there.
 */
import type { PlateSolver } from '../gpu/solverTypes';

type Mix = { oil?: number; soap?: number; acid?: number };
type Splat = { x: number; y: number; r: number; what: Mix };

/** `waiting`: laid with no solver, for the next one. `seed`: what the attached solver was opened on. */
export interface MixWait {
  waiting: Splat[];
  seed: Splat[];
  /** A look's oil (or soap, or acid): onto the solver, or kept for the one still to come. */
  lay(x: number, y: number, r: number, what: Mix): void;
  /** A disc of whole oil: `lay` with `{ oil: 1 }`, and a plain function, so it can be handed on as one. */
  oil(x: number, y: number, r: number): void;
  /** Lay what waited on a solver just attached, on top of whatever it was carried, and keep it as its seed. */
  play(gpu: PlateSolver): void;
  /** The attached solver is going before it has spoken: what it was opened on waits again. */
  putBack(): void;
  /** Nothing waits: the plate's chemistry was cleared (a new look, or a fade to one), or a carry holds this oil already. */
  drop(): void;
}

/** `solver`: the simulation's attached solver as of now, or null while there is none. */
export function mixWait(solver: () => PlateSolver | null): MixWait {
  const w: MixWait = {
    waiting: [], seed: [],
    oil(x, y, r) { w.lay(x, y, r, { oil: 1 }); },
    lay(x, y, r, what) {
      const gpu = solver();
      if (gpu) gpu.addMix?.(x, y, r, what);
      else w.waiting.push({ x, y, r, what });
    },
    play(gpu) {
      w.seed = w.waiting; w.waiting = [];
      for (const m of w.seed) gpu.addMix?.(m.x, m.y, m.r, m.what);
    },
    putBack() { w.waiting = w.seed.slice(); },
    drop() { w.waiting.length = 0; },
  };
  return w;
}
