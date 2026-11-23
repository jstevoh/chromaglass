/**
 * The cover glass on its liquid (PLAN 38r-5): the solver's layer that lays the
 * gap's shape.
 *
 * Moved here from the squeeze stage of `step` in gpu/fluid.ts as it was, so
 * the cover's own state can be built beside it without growing that file
 * past its byte ceiling (CLAUDE.md "Size"; fluid.ts sat 21 bytes under it).
 */

import { FluidReads } from './reads';
import type { GpuStepParams } from '../solverTypes';
import { THIN_GAP_THICKNESS, thinGapViscosity } from './constants';
import { DISH_METRES, DISH_REST_GAP, DISH_GAP_FIELD_METRES } from '../../lib/turntable';
import { COVER_FULL_ML, COVER_GLASS_G, coverNew, coverAdd, coverStep, type CoverState } from '../../lib/cover';

export class FluidCover extends FluidReads {
  /** The liquid's ledger under the glass (lib/cover.ts); null until the first step, and again after a clear. */
  protected cover: CoverState | null = null;
  /** The Liquid dial as last read, so a turn of it is liquid added or taken off. */
  private coverMl = COVER_FULL_ML;
  /** Poured since the last step, m³ (pour). */
  private coverPoured = 0;
  private coverLaid = DISH_REST_GAP;

  /**
   * The cover's gap over the 2 mm the solver's constants were worked out at,
   * squared: what a Darcy speed in the gap (the colour's fall down a tipped
   * plate, ROCK_FALL; the oil's rise, OIL_LIFT; the oil's tension pull,
   * OIL_TENSION_GAP) is multiplied by on a live cover, since each is
   * Δρ g h²/12μ or σ-driven flow with the same h² mobility. 1 at the default.
   */
  protected get coverH2(): number {
    const r = this.coverGap / DISH_REST_GAP;
    return r * r;
  }

  /**
   * The glass on its liquid, one step (lib/cover.ts coverStep): the dial's
   * turn and the step's pours into the ledger, then the glass settles or
   * lifts. Before writeSim, so the step's kernels read this step's cover.
   */
  protected coverAdvance(p: GpuStepParams): void {
    const ml = Number.isFinite(p.liquidMl) ? p.liquidMl! : COVER_FULL_ML;
    if (!this.cover) {
      this.cover = coverNew(ml);
      this.coverPoured = 0;
    } else if (ml !== this.coverMl) coverAdd(this.cover, (ml - this.coverMl) * 1e-6);
    this.coverMl = ml;
    if (this.coverPoured > 0) coverAdd(this.cover, this.coverPoured);
    this.coverPoured = 0;
    const h = coverStep(this.cover, Math.max(0, Math.min(0.1, p.magnetSeconds ?? 1 / 60)), {
      nu: thinGapViscosity(p.gapThickness ?? THIN_GAP_THICKNESS),
      grams: Number.isFinite(p.coverGrams) ? p.coverGrams! : COVER_GLASS_G,
      hand: p.coverHand ?? 0,
    });
    this.coverGap = h / DISH_GAP_FIELD_METRES;
  }

  /** The cover's gap, metres, and in gap units. */
  get coverMetres(): number {
    return this.coverGap * DISH_GAP_FIELD_METRES;
  }
  get coverUnits(): number {
    return this.coverGap;
  }

  /**
   * A pour's volume goes into the ledger as well as into the thin solve: the
   * take of a column over a dome of πr²/2 at the live gap (lib/liquidProps.ts
   * pourShare, the other way round). The glass rises by it next step, and the
   * solve's source and the glass's rise cancel at the rim: a pour under a
   * glass the edge still holds spills nothing.
   */
  pour(x: number, y: number, radius: number, take: number, sp: Parameters<FluidReads['pour']>[4], volume = true): void {
    super.pour(x, y, radius, take, sp, volume);
    if (volume && radius > 0 && take > 0 && this.hsPour) {
      const r = radius * DISH_METRES;
      this.coverPoured += take * (Math.PI * r * r) / 2 * this.coverMetres;
    }
  }

  /** A cleared plate is a fresh one: the dial's liquid, the glass where it rests on it. */
  clear(): void {
    super.clear();
    this.cover = null;
  }

  /** The gap's shape: laid on a new plate, shifted on a new curve (the squeeze stage's first job). */
  protected gapShape(pass: GPUComputePassEncoder, p: GpuStepParams): void {
    /*
      A new plate shape is a new pair of glasses, not a press.

      The gap springs toward its rest dome at `gapSpring`, which is tuned
      for a press lifting — about a second — and measures as a time constant
      near half a minute on a slow plate. That is right for a press and
      wrong for the dome itself: turning Plate Shape up is swapping the
      glasses, and the answer should be the shape they are, not a shape they
      reach ninety seconds later. Measured before this: eight seconds after
      setting the curve to 1, the gap had moved a sixth of the way.

      So the gap is *shifted* by the change, in `gapReshape`, which leaves a
      press's own dent in place and does not touch the rate. Re-laying it
      outright was the first version and it is a trap: the plate shape is a
      per-plate patch target, so a sound or camera mapping can drive it every
      frame, and a reset would wipe a live press sixty times a second.
    */
    if (this.lastCurve === null) {
      /*
        A plate that has just appeared is laid at the shape it is meant to
        have, absolutely.

        This branch is not a formality. The ladder builds a new solver a few
        seconds into a show, and the clear that comes with it lays the gap
        flat — so a plate whose shape was already set came back flat and
        then crept toward its dome at the spring's rate. Measured: the dome
        held for six seconds, snapped to 0.03 everywhere, and started over.
        Adopting the current shape without laying it is what caused that.
      */
      for (const t of [this.squeeze.a, this.squeeze.b]) {
        this.run(pass, 'gapRest', t, [], this.arg('gap rest', [0, 0, 0, 0]));
      }
      this.lastCurve = p.plateCurve;
      this.hsPrimed = false;
      this.phaseGapPrimed = false;
    } else if (this.lastCurve !== p.plateCurve || this.coverGap !== this.coverLaid) {
      this.run(pass, 'gapReshape', this.squeeze.write, [this.squeeze.read],
        this.arg('gap reshape', [this.lastCurve, p.plateCurve, this.coverLaid, this.coverGap]));
      this.squeeze.swap();
      /*
        New glasses, not a press: a thin gap takes the new shape as it is. A
        cover moving on its liquid is the other case. It is a squeeze, so the
        solve is left primed and hsDivergence turns the shift, through its
        gap from before, into flow: liquid drawn in at the rim under a rising
        glass that nothing poured, pushed out over it under a settling one.
      */
      if (this.lastCurve !== p.plateCurve) {
        this.hsPrimed = false;
        this.phaseGapPrimed = false;
      }
      this.lastCurve = p.plateCurve;
    }
    this.coverLaid = this.coverGap;
  }
}
