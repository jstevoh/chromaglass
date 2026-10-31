/**
 * The solver on WebGPU (docs/webgpu-plan.md, P2): the same scheme as
 * `lib/gpuFluid.ts`, as compute passes over storage textures.
 *
 * It keeps that class's shape — `applyDeltas`, `step`, `readbackAsync`,
 * `drainStep`, `clear` — so the CPU side above it does not know which engine
 * is under it, and so `npm run parity` can run one step through both and
 * compare the fields.
 *
 * What is the same: the physics, pass for pass (see `wgsl/fluid.ts`), the
 * logical 192² grid the CPU writes and reads, and the order of a step.
 *
 * What is different:
 * - Compute dispatches, so a step is one command buffer rather than 88 draws.
 * - The fields WebGL held as 16-bit floats and WebGPU cannot store to
 *   (pressure, divergence, the plate gap) are 32-bit here. That is more
 *   precision, not less.
 * - The deltas are full-resolution fields. The CPU can still fill them from
 *   its 192² arrays (`applyDeltas`, which upsamples on the way in), but a
 *   pour is better given as splats (`applySplats`), which are laid down at
 *   the plate's own resolution and never cross the bus.
 *
 * Where it is (PLAN 19ai-7). This was one class of 290 KB, and a session that changed one pass
 * read all of it. Its members are split by what they do into a chain of classes, each
 * extending the one below, with `WebGPUFluid` at the top, unchanged to every caller:
 *
 *   fluid/constants.ts  the constants, the shapes handed out, the physics helpers
 *   fluid/core.ts       FluidCore: every field, the constructor, `clear` and its helpers
 *   fluid/fields.ts     FluidFields: the fields a look makes on first use, the getters
 *   fluid/passes.ts     FluidPasses: the passes a step runs (projection, thin gap, carries)
 *   fluid/inputs.ts     FluidInputs: deltas, splats, pours, chemistry, hand-over
 *   fluid/reads.ts      FluidReads: readbacks, the stats, the checks' reads
 *   gpu/fluid.ts        WebGPUFluid: `step`, the pipelines built ahead and the statics
 *
 * The members were moved, not written again; one another file reaches is `protected` where
 * it was `private`.
 */

import { PingPong, PipelineCache, bindGroup, type Prep } from './kit';
import type { Opening } from './opening';
import { kernel } from './wgsl/fluid';
import { SPIKE_ONSET, fieldOnAxis, spikesOnAxis } from './wgsl/spikes';
import { MAGNET_RADIUS } from './wgsl/magnetDisc';
import { splatKernel } from './wgsl/splat';
import { STATS_KERNELS } from './wgsl/stats';
import type { GpuStepParams } from './solverTypes';
import { stepDisplacement } from '../lib/detailFlow';
import { SLOSH_N } from '../lib/slosh';
import { WebGPUAir } from './air';
import { DYE_FLOOR } from '../lib/dye';
import { FILM_FROM, StandingFilm, type FilmMagnet } from './standing';
import { AIR_CAPACITY, THIN_GAP_THICKNESS, FERRO_NU, THIN_GAP_KERNELS, CARRY_COURANT, CARRY_SUBSTEPS, PHASE_RELAX, PHASE_COMPRESS, OIL_TENSION, OIL_TENSION_GAP, OIL_CELLS, SOAP_PULL, DYE_WEIGHT, HEAT_LIFT, LAMP_HEATING, LAMP_HEAT, CONFINE, CH_SUBSTEPS, FILM_MU, FILM_PUSH, FILM_MAX, FILM_RATE, FILM_DT, FILM_SUBSTEPS, FILM_CARRY, FILM_HP, MAZE_PERIOD, MAZE_FINEST, MAZE_GAIN, MAZE_UNIFORM, SPIKE_PULL, SPIKE_FLOW, HAND_SCREEN, BZ_GRID, BZ_PER_SECOND, LIES_GRID, SQUEEZE_SWEEPS, VISC_ITERS, GRID_DAMP, MAX_SPEED, PLATE_METRES, REST_GAP, REST_GAP_METRES, GAP_METRES, D_MOLECULAR, KAPPA_WATER, NU_REF, DRIP_WEIGHT, AIR_SHEAR, ROCK_FALL, LIFT_SWEEPS, LIFT_KERNELS, OIL_LIFT, DYE_LAYER, SLUMP_FACE, LIQUID_DENSITY, thinGapViscosity, MAGNET_GAIN, MAGNET_CAP, MAGNET_CELLS, DISPLACE_PUSH, BODY_EVEN, BODY_HAND, BODY_INSIDE, BODY_PASSES, BODY_DRIFT, BODY_REACH_BLURS, DISPLACE_INSIDE, DISPLACE_ITERS, PHASE_SUBSTEPS, GRAIN_PERIOD, VEL, R32, RG32, RGBA32 } from './fluid/constants';
import { FluidReads } from './fluid/reads';

// What this file exported before its constants moved (PLAN 19ai-7); importers still import them from here.
export { THIN_GAP_THICKNESS, FERRO_NU, CARRY_COURANT, CARRY_SUBSTEPS, FILM_GRID, FILM_MAX, FILM_RATE, PLATE_METRES, REST_GAP, REST_GAP_METRES, GAP_METRES, NU_REF, ROCK_FALL, OIL_LIFT, DYE_LAYER, LIQUID_DENSITY, thinGapViscosity, thinGapDragSeconds, MAGNET_GAIN, MAGNET_CAP, MAGNET_CELLS, DISPLACE_PUSH, BODY_EVEN, BODY_HAND, BODY_INSIDE, DISPLACE_INSIDE } from './fluid/constants';
export type { FieldStats } from './fluid/constants';

export class WebGPUFluid extends FluidReads {
  /**
   * For `npm run swirlcost` (PLAN 22k): the same plate with the swirl held
   * off, to read what it costs, and how many steps ran it of how many were
   * taken. Never set by the app. On the class, so a solver the ladder builds
   * mid-measurement is held off too.
   */
  static swirlHeldOff = false;

  /**
   * The kernels a step runs, on any look a show can open on, built before
   * the show opens (`gpu/prepare.ts`) in the formats this device's solver
   * will ask for.
   *
   * A list, and so a thing that can fall behind the step. It was taken from
   * what the show actually built: every `computePipeline` call a show at
   * `?gpu=mid&look=classic` made in its first twenty seconds (thirty-seven
   * here, forty-four with the plate, the probe and the air), and then the
   * ones each of the other thirty-seven looks added in its first steps:
   * vorticity for galaxy, the dye's own diffusion for eleven of them, the
   * mix for soap-film, the reaction for chemical-clock, the second phase and
   * the gel for others. The show opens on a
   * look picked at random (`OPENING_LOOK`), so a list for one look left the
   * freeze in place for the nights that opened on another. `npm run startup`
   * holds it to all of them: it fails when an opening, or a change to any
   * look, builds a pipeline on a frame.
   *
   * Past what the looks were seen to ask for, the rest of what a step can
   * run is here too (below), so a setting turned up mid-set does not
   * compile on the frame either.
   *
   * `dye` is the dye's own format, which is a half float on a GPU that cannot
   * filter a full one; the scratch textures the advection writes are the
   * dye's format too, and so is one pass of the velocity's advection.
   */
  static prepare(device: GPUDevice, opts: { float32Filterable: boolean }, open: Opening): Prep[] {
    const cache = PipelineCache.for(device, 'fluid');
    const dye: GPUTextureFormat = opts.float32Filterable ? RGBA32 : VEL;
    /*
      Each with whether the show waits for it (`gpu/opening.ts`): true for
      what every look's first steps ask for, the part of the look that uses
      it, or false for what is built behind the show once it is up. The
      forty-three every opening asks for were read off all thirty-eight
      looks' openings; `npm run startup` reads them again on every run.
    */
    const byFormat: [string, GPUTextureFormat[], boolean][] = [
      ['fill', [dye, RGBA32, VEL, R32], true],
      ['gapRest', [RGBA32], true],
      // A change to the plate's shape: a look changed to mid-show, never an opening.
      ['gapReshape', [RGBA32], false],
      ['deltaDye', [dye], true],
      ['deltaVel', [VEL], true],
      ['liquidForces', [VEL], true],
      ['squeezeUpdate', [RGBA32], true],
      ['scaleDye', [dye], true],
      // The slosh's flow over the dye's (18a-13): waited for when the look tips its dish.
      ['addSlosh', [VEL], open.slosh],
      // The dye's grid pattern, in every look its diffusion does not reach (dampGrid).
      ['dampGridCurv', [dye], true],
      ['dampGridLimit', [dye], true],
      ['dampGrid', [dye], true],
      // The dye's diffusion, in twenty-nine of the thirty-eight: not worth a rule.
      ['jacobi', [VEL, dye], true],
      ['dyeDisperse', [dye], true],
      ['advect', opts.float32Filterable ? [dye, RGBA32] : [dye], true],
      ['forcesB', [VEL], true],
      ['currentForces', [VEL], true],
      ['curDivergence', [R32], true],
      ['curPressure', [R32], true],
      ['curGradient', [VEL], true],
      ['addCurrent', [VEL], true],
      // The spun dish (PLAN §22): waited for when the look's own motor starts
      // its dish ahead of its liquid at opening (PLAN 22j, opening.ts).
      ['spinSwirl', [VEL], open.spin],
      ['decayDye', [dye], true],
      ['decayVel', [VEL], true],
      ['packView', ['rgba32uint'], true],
      ['downsample', [RGBA32], true],
      ...(opts.float32Filterable ? [['seedGrain', [RGBA32], true] as [string, GPUTextureFormat[], boolean]] : []),
      // Vorticity (galaxy): the curl into a single-channel scratch.
      ['curl', [R32], open.vorticity],
      ['confine', [VEL], open.vorticity],
      // The mix (soap-film), always full float, and its surface tension on
      // the dye as well as on itself.
      ['marangoniFlux', [dye, RGBA32], open.mix],
      ['mixSplat', [RGBA32], open.mix],
      // The mix's carry on the old plate; on a thin gap it is carried in
      // substeps (mixAdvectSub, below), so a look opening on one never asks.
      ['mixAdvect', [RGBA32], open.mix && !open.thinGap],
      ['mixRelax', [RGBA32], open.mix],
      ['mixMu', [RGBA32], open.mix],
      ['mixUpdate', [RGBA32], open.mix],
      /*
        Oil Bodies, and the oil's smoothed shape that its reach and the
        oil's surface tension (mixForce) both read: built behind the show,
        like mixForce. They were first waited for whenever a look with Oil
        Bodies opened the show, and `npm run startup` on Metal failed it:
        Oil & Water, opened on its own, asked for none of the six in its
        first forty steps, because nothing runs them until oil has been
        poured, and the opening's rule is to wait only for what a look's
        first steps use. Behind the show they are ready some fifteen
        seconds after it opens, as mixForce always has been.
      */
      // Except on a look that stands the plate up, whose dye's weight runs
      // the mix force from its first step (Opening.gravity).
      ['mixSmooth', [R32], open.gravity],
      // The oil's pressure along the open rim, which mixForce reads (PLAN 18g-6): with it, as it runs with it.
      ['rimLaplace', [R32], open.gravity],
      /*
        The poured liquids' species (PLAN 18d): its pour and fade, and its
        carry in substeps, below. Built behind the show: nothing runs them
        until glycerine, syrup, milk or alcohol is poured, which no look's
        opening steps do.
      */
      ['speciesSplat', [RGBA32], false],
      ['liquidSplat0', [VEL], false],
      ['liquidSplat1', [VEL], false],
      /*
        The dye across faces is also how the dye moves wherever the maze
        flows (the advect dye stage), from the maze's first step, so a look
        that opens with it waits for it as it waits for mazeForce.
      */
      ['bodyAdvect', [dye], open.maze && !open.thinGap],
      ['bodyAdvectThin', [dye], open.maze && open.thinGap],
      ['bodyPartition', [dye], false],
      ['bodyUnspread', [dye], false],
      ['bodyLand', [dye], false],
      ['mixCarry', [RGBA32], false],
      // A hand's carry of the ferrofluid (PLAN.md §9n): no look runs it in
      // its first steps, only a Finger or a Blow does, so like mixCarry it is
      // built behind the show; waited for at the open, `npm run startup`
      // fails it as asked for by none.
      ['phaseCarry', [R32], false],
      // The ferrofluid and the mix carried onto a new grid (takeOver, PLAN
      // 9w): only when the governor moves the grid, a few seconds into a
      // show at the earliest, so built behind it.
      ['carryArea', [R32, RGBA32], false],
      // The clear film (PLAN §20b): no look lays one, so built behind the show.
      ['filmAdvect', [RGBA32], false],
      ['filmMu', [R32], false],
      ['filmUpdate', [RGBA32], false],
      ['filmSplat', [RGBA32], false],
      // The reaction (chemical-clock) and the gel, each on its own
      // full-float grid.
      ['rxnStep', [RGBA32], open.reaction],
      ['liesStep', [RGBA32], open.gel],
      ['gridSplat', [RGBA32], open.reaction || open.gel],
      // The second phase, single-channel, and what it does to the flow.
      ['phaseSplat', [R32], open.phase],
      ['phaseAdvect', [R32], open.phase],
      ['phaseGapSeen', [R32], open.phase],
      ['phaseSeparate', [R32], open.phase],
      ['phaseBlur', [R32], open.phase],
      ['phaseCompress', [R32], open.phase],
      // The two volume forms (phaseGridPlan, phaseCHVolume) run only on a thin
      // gap. Every look opens on one now (Thin Gap, on in every look), so a
      // ferrofluid look carries its ferrofluid as a volume from its first
      // steps and waits for them; a look opened with Thin Gap off builds them
      // behind, as it did when no look opened on one (`npm run startup`
      // fails a pipeline waited for and asked for by none).
      // And their substeps, as many as the step's flow needs (phasePlan).
      ['phaseAdvectPlan', [R32], open.phase && open.thinGap],
      ['phaseGridPlan', [R32], open.phase && open.thinGap],
      ['phasePlan', [R32], open.phase && open.thinGap],
      ['phaseRelax', [R32], open.phase],
      ['screenJacobi', [R32], open.phase],
      ['phaseMu', [RG32], open.phase],
      ['phaseCH', [R32], open.phase],
      ['phaseCHVolume', [R32], open.phase && open.thinGap],
      ['phaseVelocity', [VEL], open.phase && open.thinGap],
      ['phaseForce', [VEL], open.phase],
      ['phaseMomentum', [VEL], open.phase],
      ['mazeForce', [VEL], open.maze],
      // The ferrofluid pushing the dye (Pushes Dye), on the dye's own grid.
      ['phaseDisplace', [dye], open.displace],
      // And the rest of what a step can run: the mix's push on the flow,
      // sharpening, the bubbles clearing dye, the reaction's deposit, the
      // drain. None was seen in a look's first steps, the mix's and the
      // reaction's own looks included, but each is one setting away, and a
      // compile on the frame mid-set is the same stop: built behind.
      ['mixForce', [VEL], open.gravity],
      // Film Hold's push: built behind the show, as the oil's other kernels
      // are (no look opens with it in its first steps' set; startup fails one
      // waited for and never run).
      ['mixFilm', [VEL], false],
      ['sharpenDye', [dye], false],
      ['airExclude', [dye], false],
      ['depositChem', [dye], open.chemistry],
      ['grayScott', [dye], open.chemistry],
      ['addReagent', [dye], false],
      ['seedChem', [dye], open.chemistry],
      ['drainVel', [VEL], false],
    ];
    // The ones asked for by name alone, each with the one format it writes:
    // zeroing a pressure (the old plate's, between projections) and a
    // coarse level, which both solvers do every step. The old plate's own
    // solve is in oldPlateBuilds.
    const byName: [string, GPUTextureFormat][] = [['mgZero', R32]];
    const keyed = new Map<string, [string, boolean]>();
    const add = (key: string, code: string, now: boolean) => keyed.set(key, [code, now || (keyed.get(key)?.[1] ?? false)]);
    for (const [name, formats, now] of byFormat) for (const f of formats) add(`${name}:${f}`, kernel(name, f), now);
    for (const [name, f] of byName) add(name, kernel(name, f), true);
    /*
      The thin gap's kernels (PLAN §18a): waited for by a look that opens on a
      thin gap, which since the owner's pick (2026-10-03) is every look, so
      its first step is a thin one and asks for every one of them. Left off
      the list for a look that opens with Thin Gap off: they are then built
      when it is first turned on (prepareThinGap), as before, so a show that
      never turns it on does not pay for them behind it either (see there).
      The mix's carry in substeps waits only where the look opens with the
      mix, as the mix's own carry does, and is built behind otherwise.
    */
    if (open.thinGap) {
      for (const [key, code] of WebGPUFluid.thinBuilds(dye)) add(key, code, true);
      add('mixAdvectSub:rgba32float', kernel('mixAdvectSub', 'rgba32float'), open.mix);
      add('bodyAdvectSub:rgba32float', kernel('bodyAdvectSub', 'rgba32float'), false);
      // The colour's carry taking the species along (PLAN 18d-11a), wanted from the first pour, as the species' own.
      add(`bodyAdvectPairSub:${dye}`, kernel('bodyAdvectPairSub', dye), false);
      // A pour's volume (PLAN 18c): behind the show, as the species' are; nothing pours in an opening's first steps.
      add('pourVolume:thin', kernel('pourVolume', 'rgba16float'), false);
      // The oil's mean for its lift up a rocked plate (PLAN 27f-5): behind the show, as the bodies' are; the lift waits for it.
      for (const name of LIFT_KERNELS) add(`${name}:thin`, WebGPUFluid.liftCode(name), false);
      // The glass's drift (driftCells): behind the show; until built, the carries take it in substeps.
      for (const [key, code] of WebGPUFluid.driftBuilds(dye)) add(key, code, false);
    } else {
      /*
        And the other way: the old plate's projections, its velocity's
        self-advection, its squeeze's own solve and its dye's backtrace,
        which a thin step never asks for. Waited for only by a look that
        opens with Thin Gap off; otherwise built when Thin Gap is first
        turned off (prepareOldPlate), with the plate staying thin until they
        are in. Every opening built both solvers otherwise, fourteen
        pipelines for nothing: about 3.4 s of a cold opening at prepare.ts's
        0.23 s each on CI's Mac, which `npm run startup`'s 1b counts as the
        show's own wait, against its 1 s of slack, since nothing asks for them.
      */
      for (const [key, code] of WebGPUFluid.oldPlateBuilds(dye)) add(key, code, true);
    }
    // The splats' deltas brought up to the grid, every step.
    for (const f of [RGBA32, R32] as GPUTextureFormat[]) add(`upsampleDelta:${f}`, splatKernel('upsampleDelta', f), true);
    // A tool, a pour: the splats, always into the full-float deltas. And the
    // plate measured (`measure`), keyed by name as `statsRun` asks. Neither
    // was asked for in any look's first forty steps, nor in the classic
    // opening's first twenty seconds on the Mac: built behind, and `npm run
    // startup` gives each look's opening seconds as well as steps to say so.
    for (const name of ['splatDeltas', 'pourImage']) add(`${name}:${RGBA32}`, splatKernel(name, RGBA32), false);
    // The video pour's (PLAN 14ab-2), only for a show that pours a video.
    add('videoSample:rgba8unorm', splatKernel('videoSample', 'rgba8unorm'), false);
    add(`videoFlow:${RGBA32}`, splatKernel('videoFlow', RGBA32), false);
    add(`upsampleDeltaSum:${RGBA32}`, splatKernel('upsampleDeltaSum', RGBA32), false);
    for (const name of ['statsTiles', 'statsFold'] as const) add(name, STATS_KERNELS[name], false);
    return [...keyed].map(([key, [code, now]]) => cache.computePrep(key, code, !now));
  }

  /**
   * What a thin step needs built before it can run (prepare, prepareThinGap,
   * thinGapOn): its kernels, the velocity's snapshot in the velocity's own
   * format, and the dye's carry in substeps. Not the mix's carry, which only
   * a look with the mix asks for.
   */
  /** The oil lift's kernels' sources, once each: the step asks whether they are built on every rocked step of an oil look. */
  private static liftSources = new Map<string, string>();
  private static liftCode(name: string): string {
    let code = WebGPUFluid.liftSources.get(name);
    if (!code) WebGPUFluid.liftSources.set(name, code = kernel(name, 'rgba16float'));
    return code;
  }

  private static thinBuilds(dye: GPUTextureFormat): [string, string][] {
    return [
      ...THIN_GAP_KERNELS.map((name): [string, string] => [`${name}:thin`, kernel(name, 'rgba16float')]),
      [`scaleDye:${VEL}`, kernel('scaleDye', VEL)],
      [`bodyAdvectSub:${dye}`, kernel('bodyAdvectSub', dye)],
      [`bodyAdvectSub:${VEL}`, kernel('bodyAdvectSub', VEL)],
      [`dyeDisperse:${dye}`, kernel('dyeDisperse', dye)],
      // The dye's slump (PLAN 18m), which runs on every thin step of a liquid thin enough to let it.
      [`slumpRate:${R32}`, kernel('slumpRate', R32)],
      [`slump:${dye}`, kernel('slump', dye)],
    ];
  }

  /** The old plate's own pipelines, which a thin step never asks for (prepare, prepareOldPlate). */
  private static oldPlateBuilds(dye: GPUTextureFormat): [string, string][] {
    const byName: [string, GPUTextureFormat][] = [
      ['pressureRedBlack', R32], ['squeezeRedBlack', R32],
      ['mgRestrict0', R32], ['mgSmooth', R32], ['mgRestrict', R32], ['mgProlong', R32],
      // The projection's right-hand side made zero-mean, every step (divTiles).
      ['divTiles', R32], ['divFold', R32], ['divCentre', R32],
      ['squeezeVelBuf', VEL], ['gradientSubtractBuf', VEL],
    ];
    return [
      ...byName.map(([name, f]): [string, string] => [name, kernel(name, f)]),
      [`divergence:${R32}`, kernel('divergence', R32)],
      // The dye's backtrace and the velocity's self-advection (one key when the dye is half float).
      ...[...new Set([dye, VEL])].map((f): [string, string] => [`macCormack:${f}`, kernel('macCormack', f)]),
    ];
  }

  /**
   * Off only for `?prepare=0`, the show opened the old way, every pipeline
   * built on the frame that first asks (`npm run startup`'s control). There
   * the thin gap's are built on the frame too, at its first step, rather than
   * behind it while the plate runs the old way: otherwise the control's first
   * seconds would be the old plate's, and its pipelines the old plate's, and
   * the startup check would price the show's wait for the thin gap's against
   * a control that never waited for them.
   */
  static buildAhead = true;

  private writeSim(p: GpuStepParams, disp: number): void {
    const f = this.simF, i = this.simI;
    const fin = (x: number | undefined, fallback = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
    const thin = this.thinGapOn(p);
    f[0] = this.N; f[1] = this.L; f[2] = fin(p.dt, 1 / 60); f[3] = fin(p.time, 0); f[4] = fin(disp, 0); f[5] = fin(p.visc, 1);
    f[6] = fin(p.turbScale, 0); f[7] = fin(p.spin, 0); f[8] = fin(p.immiscibility, 0); f[9] = thin ? 1 : 0;
    f[10] = fin(p.vibIntensity, 0); f[11] = fin(p.vibFrequency, 0); f[12] = fin(p.drip, 0); f[13] = fin(p.air, 0);
    f[14] = fin(p.smearX, 0); f[15] = fin(p.smearY, 0);
    /*
      A thin gap has its drag in the projection (wgsl/thinGap.ts), so decayVel
      neither damps nor clamps it: only the heat decays there.
      PLAN 18g: on a thin gap, colour leaves by flushing over the open rim.
      p.evapFactor is retained as a named safety cap (regulator) and for evaporation.
    */
    f[16] = thin ? 1 : fin(p.damping, 0.99); f[17] = fin(p.heatDecay, 0.98); f[18] = thin ? 1000 : MAX_SPEED; f[19] = fin(p.evapFactor, 0); f[20] = fin(p.sharpness, 0);
    i[21] = Math.max(1, Math.min(4, Math.round(fin(p.turbDetail, 1))));
    const upright = Math.max(0, Math.min(1, fin(p.plateUpright, 0)));
    f[22] = fin(p.currentDamp, 0.98); f[23] = upright * fin(p.currentBuoy, 0); f[24] = fin(p.currentGrav, 0); f[25] = fin(p.cometX, 0);
    f[26] = fin(p.meanDensity, 0); f[27] = fin(p.maxCurrent, 0.002);
    // On a thin gap the rock is the dye's weight down the tilted plate (hsBody, ROCK_FALL), not a stir in the current.
    f[28] = thin ? 0 : fin(p.rockX, 0); f[29] = thin ? 0 : fin(p.rockY, 0);
    f[30] = fin(p.plateCurve, 0); f[31] = fin(p.gapSpring, 0.05); f[32] = fin(p.gapMemory, 0.5); f[33] = fin(p.cometY, 0);
    const gx = fin(p.gravityX, 0), gy = fin(p.gravityY, -1);
    const gl = Math.hypot(gx, gy) || 1;
    // S.up points upward along the plate (opposite to in-plane gravity). In-plane buoyancy is gated on upright.
    f[34] = -gx / gl; f[35] = -gy / gl;
    const magStrength = fin(p.magnetStrength, 0);
    const extras = magStrength > 0.0001 ? p.extraMagnets ?? [] : [];
    for (let k = 0; k < 3; k++) {
      const m = extras[k];
      f[36 + k * 4] = fin(m?.x, 0); f[37 + k * 4] = fin(m?.y, 0);
      f[38 + k * 4] = fin(p.magnetHeight, 0.05); f[39 + k * 4] = m ? magStrength : 0;
    }
    f[48] = fin(p.magnetRadius, MAGNET_RADIUS);
    f[49] = p.surfaceClear ? 1 : 0;
    f[50] = fin(p.dimmer, 1) * LAMP_HEATING;
    this.device.queue.writeBuffer(this.sim, 0, this.simData);
  }

  /** One solver step. Call applyDeltas first when there is anything to add. */
  step(p: GpuStepParams, deltasApplied: boolean): void {
    const N = this.N;
    // Set by the thin gap's stage, when the glass drifts the film (driftCells).
    this.riding = false;
    const disp = stepDisplacement(p.dt, p.advection, N);
    // The hands laid for this step, and for no other (applyDeltas).
    const hands = this.handLive ? this.handTex : null;
    const handCells = this.handLive ? this.handFastest * N / this.L : 0;
    this.handLive = false;
    // And a Blow's breath, the same way (lib/breath.ts).
    const breath = this.breathLive ? this.breathTex : null;
    this.breathLive = false;
    /*
      The substeps a hand in the liquid needs of the carries that take a
      fixed number (the ferrofluid's, and the colour's under a maze's flow):
      a Finger on a thin gap carries the liquid it touches at the hand's own
      speed (hsPrep), and a brisk hand is several cells a step on the
      solver's grid, past what six substeps of 0.45 may carry, so a pool
      under a fast stroke was left behind it (\`npm run fingerflow\`). 0.4 a
      substep, as the colour's own plan (CARRY_COURANT), only for the steps
      a hand is down.
    */
    const handSubs = Math.max(PHASE_SUBSTEPS, Math.min(CARRY_SUBSTEPS, Math.ceil(handCells / CARRY_COURANT)));
    // The ferrofluid maze: how strong the field is, and its constants on this grid (MAZE_PERIOD).
    const maze = this.phaseLive ? Math.max(0, Math.min(1, p.ferroLabyrinth ?? 0)) : 0;
    /*
      Whether a magnet is close enough under the glass to stand the
      ferrofluid up into spikes (wgsl/spikes.ts, spikeAmp on the magnet's
      axis, where the field is strongest): then the spikes' wells go into μ
      and the maze's flow carries the liquid into them, maze field or not.
      And the magnet's own field is a maze field as strong as its spikes, on
      a look with a Labyrinth (see HAND_SCREEN).
    */
    const spikeAmt = this.phaseLive ? spikesOnAxis(p.magnetStrength, p.magnetHeight, p.magnetRadius) : 0;
    const spikes = spikeAmt > 0;
    /*
      And whether the layer stands up under them (standing.ts): each magnet
      past the onset on its own axis gets a patch of film, the hand's and a
      phone's other fingers (at the hand's height and strength, as writeSim
      gives them), once the film's kernels are built. Once on, it stays on
      as the field is turned down until it is under FILM_FROM of the onset,
      so the film lowers the domes it raised (standing.ts, FILM_FROM). Not
      started below the onset: a
      look's own magnet (Magnet Garden's is at 0.14, the onset 0.18) keeps
      its maze, which the film does not model.
    */
    const onAxis = this.phaseLive && p.magnetStrength > 0.0001 ? fieldOnAxis(p.magnetStrength, p.magnetHeight, p.magnetRadius) : 0;
    if (spikes) this.filmHeld = true;
    else if (onAxis < FILM_FROM * SPIKE_ONSET) this.filmHeld = false;
    const filmMags: FilmMagnet[] = [];
    if (this.filmHeld) {
      const radius = p.magnetRadius ?? MAGNET_RADIUS;
      filmMags.push({ x: p.magnetX, y: p.magnetY, height: p.magnetHeight, strength: p.magnetStrength, radius });
      for (const m of (p.extraMagnets ?? []).slice(0, 3)) filmMags.push({ x: m.x, y: m.y, height: p.magnetHeight, strength: p.magnetStrength, radius });
    }
    if (filmMags.length && !this.layer) this.layer = new StandingFilm(this.device, this.pipelines, this.disposer, this.N);
    const filmOn = filmMags.length > 0 && !!this.layer?.isReady();
    if (filmOn) this.filmSteps++;
    const field = maze > 0.001 ? Math.max(maze, spikeAmt) : 0;
    // Never under twelve cells a period: the edge is three or four wide, and
    // on 192² (8.6 cells) the stripes washed out to grey. Maze Detail divides
    // the period by up to three (MAZE_FINEST), and that floor is why it is
    // a setting and not a new constant: see MAZE_FINEST. (Finer still under
    // the hand was tried for thinner fingers: at 384² they came out at the
    // floor, grey and too thin to draw.)
    const period = MAZE_PERIOD / Math.pow(MAZE_FINEST, Math.max(0, Math.min(1, p.mazeDetail ?? 0)));
    const kk = (2 * Math.PI / Math.max(period * N, 12)) ** 2;
    const m2f = 0.16 + (HAND_SCREEN - 0.16) * spikeAmt;
    const mazeK = { m2: m2f * kk, alpha: ((1 + m2f) * kk) ** 2 };
    if (maze <= 0.001 && !spikes) this.mazeReady = false;
    const thin = this.thinGapOn(p);
    if (!thin) this.hsPrimed = false;
    if (!this.phaseLive) this.phaseGapPrimed = false;
    this.thinLive = thin;
    this.writeSim(p, disp);
    if (p.rawSim) {
      p.rawSim(this.simF);
      this.device.queue.writeBuffer(this.sim, 0, this.simData);
    }
    const enc = this.device.createCommandEncoder({ label: 'step' });

    /*
      The air field, before any compute pass opens (H6 · A).

      It is a render pass and the stage that reads it is a compute pass, so
      it has to be encoded first — commands run in the order they are
      recorded, and a compute pass cannot be interrupted to draw into a
      texture it is sampling. It is also cheap and unconditional: the load op
      is what clears the field, so skipping it on a frame with no bubbles
      would leave the last frame's air behind and the dye would stay missing
      under a bubble that had already popped.
    */
    if (!this.air) this.air = new WebGPUAir(this.device, this.N, AIR_CAPACITY);
    this.air.splat(enc, (label) => this.profiler.renderPass(label));
    this.airPush = this.air.any ? (p.bubbleClear ?? 1) : 0;
    this.squeezeGain = Math.max(0, Math.min(1, p.platePressure ?? 0.4)) * 2.2;
    this.airCoverPrev = this.airCover;
    this.airCover = this.air.coverage;
    this.lastDt = p.dt;
    // The slosh dish, before the step's pass opens: its own pass, whose flow the thin stage reads (PLAN 18a-13).
    this.stepSloshDish(enc, p);

    /*
      One pass, or one per stage.

      Off (the show), everything below is encoded into a single compute pass
      with one timestamp pair around it — the cheapest thing to submit. On
      (`stageTimings`), each named stage gets its own pass and its own pair,
      so the profiler can say which of the hundred-odd dispatches the time is
      in. The stages are the same dispatches in the same order either way.
    */
    const shared = this.stageTimings
      ? null
      : enc.beginComputePass({ label: 'step', timestampWrites: this.profiler.pass('solver step') });
    /*
      `when` is false for a stage with nothing to do, and it matters to the
      reading as well as the cost.
      
      A stage that opens a pass and dispatches nothing still takes a
      timestamp pair, and an empty pass's pair does not produce a usable
      interval — the profiler's sanity check rejects it and leaves the label
      at whatever it last read. So turning dye diffusion off skipped four
      Jacobi passes, the solver took 14% more steps a second for it, and the
      profiler went on reporting the stage at 1.31 ms as though nothing had
      changed. Not opening the pass at all lets the entry decay to zero,
      which is the truth.
    */
    const stage = (label: string, body: (pass: GPUComputePassEncoder) => void, when = true): void => {
      if (!when) return;
      if (shared) { body(shared); return; }
      const own = enc.beginComputePass({ label, timestampWrites: this.profiler.pass(label) });
      body(own);
      own.end();
    };

    const none = this.arg('none', [0, 0, 0, 0]);

    // 1. Hele-Shaw squeeze-film flow
    stage('squeeze', (pass) => {
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
      } else if (this.lastCurve !== p.plateCurve) {
        this.run(pass, 'gapReshape', this.squeeze.write, [this.squeeze.read],
          this.arg('gap reshape', [this.lastCurve, p.plateCurve, 0, 0]));
        this.squeeze.swap();
        this.lastCurve = p.plateCurve;
        // New glasses, not a press: a thin gap takes the new shape as it is.
        this.hsPrimed = false;
        this.phaseGapPrimed = false;
      }
      if (!deltasApplied) {
        this.run(pass, 'squeezeUpdate', this.squeeze.write, [this.squeeze.read, this.deltaVelTex, this.blank('r')], this.arg('squeeze no delta', [0, 0, 0, 0]));
        this.squeeze.swap();
      }
      /*
        A thin gap stops here: the gap is the liquid's mobility and its rate
        is the press, both read by the thin-gap projection, and the film's
        own pressure below adds a pure gradient that a projection deletes
        (wgsl/fluid.ts, divergence). Kept as it was otherwise.
      */
      if (thin) return;
      /*
        Five red-black sweeps where this was ten Jacobi passes.

        The same operator as the projection in the same Neumann box, so the
        same treatment: half the arithmetic for about the same convergence,
        on a buffer whose two colour planes keep each sweep's writes
        contiguous. It warm-starts, as the ping-pong did — nothing clears
        this between steps, it carries on from where the last one left off.
      */
      const rb = this.pipelines.computePipeline('squeezeRedBlack', kernel('squeezeRedBlack', 'r32float'));
      if (rb) {
        const half = Math.ceil((this.N * (this.N / 2)) / 64);
        for (let k = 0; k < SQUEEZE_SWEEPS; k++) {
          for (let parity = 0; parity < 2; parity++) {
            const key = `squeezeRedBlack:${parity}:${this.squeeze.read.label}`;
            let group = this.groups.get(key);
            if (!group) {
              group = bindGroup(this.device, rb, [this.sim, this.arg4(this.nameOf('squeeze ', parity), parity), this.squeeze.read, this.spress]);
              this.groups.set(key, group);
            }
            pass.setPipeline(rb);
            pass.setBindGroup(0, group);
            pass.dispatchWorkgroups(half);
          }
        }
      }

      const sv = this.pipelines.computePipeline('squeezeVelBuf', kernel('squeezeVelBuf', 'rgba16float'));
      if (sv) {
        const svKey = `squeezeVelBuf:${this.vel.write.label}:${this.squeeze.read.label}`;
        let svGroup = this.groups.get(svKey);
        if (!svGroup) {
          svGroup = bindGroup(this.device, sv, [this.sim, none, this.vel.read, this.squeeze.read, this.vel.write, this.spress]);
          this.groups.set(svKey, svGroup);
        }
        pass.setPipeline(sv);
        pass.setBindGroup(0, svGroup);
        pass.dispatchWorkgroups(Math.ceil(this.N / 8), Math.ceil(this.N / 8));
        this.vel.swap();
      }
    });

    // 3. Viscous diffusion of momentum (xy) and heat (z)
    const n2 = (N - 2) * (N - 2);
    /*
      Heat diffuses through water with thermal diffusivity kappa ≈ 1.4e-7 m²/s,
      about 350 times faster than a dye or salt does (Lewis number Le ≈ 350).
      Heat previously shared the dye's diffusionRate, leaving the 12 presets
      with diffusionRate at 0 with no heat spreading at all. Now heat has its
      own physical diffusivity term. doubleDiffusion raises the heat's alone
      to simulate double-diffusive convection (salt fingers).

      Precision: in rgba16float (FP16), heat's per-step change at real κ is below
      half-float precision (~0.0009 cells²/step, truncating to 0.0% on SwiftShader).
      The step's duration in physical seconds is `seconds` (from magnetSeconds).
      We accumulate `heatSeconds` until the accumulated heat diffusion coefficient
      reaches ≥ 0.02, where half-float changes survive quantization without loss,
      or whenever doubleDiffusion is elevated.
    */
    const doubleDiff = Math.max(0, Math.min(1, p.doubleDiffusion ?? 0));
    const seconds = Math.max(0, Math.min(0.1, p.magnetSeconds ?? 1 / 60));
    this.heatSeconds += seconds;
    const heatRate = (KAPPA_WATER / (PLATE_METRES * PLATE_METRES)) * (1 + 99 * doubleDiff) * n2;
    const heatA = this.heatSeconds * heatRate;
    let heatVisc = 0;
    if (heatA >= 0.02 || doubleDiff > 0) {
      heatVisc = heatA;
      this.heatSeconds = 0;
    }
    const visc: [number, number, number, number] = [p.dt * p.nu * n2, p.dt * p.nu * n2, heatVisc, 0];
    stage('viscosity', (pass) => {
      this.jacobi(pass, this.vel, visc, VISC_ITERS, 'vel');
    }, visc.some((v) => v > 0));

    /*
      The ferrofluid's momentum travels with it (phaseMomentum, and why there):
      the velocity carried along itself by the ferrofluid's share of each
      cell, before the snapshot below so every force is still read apart.
    */
    stage('phase momentum', (pass) => {
      this.run(pass, 'phaseMomentum', this.vel.write, [this.vel.read, this.phase.read], this.arg('phase momentum', [disp, 0, 0, 0]));
      this.vel.swap();
    }, thin && this.phaseLive && (p.phaseMomentum ?? 1) > 0);

    /*
      A thin gap keeps the velocity from before the forces, so it can read
      what they asked for as a speed to drive the liquid to (hsPrep).
    */
    stage('thin gap keep', (pass) => {
      this.run(pass, 'scaleDye', this.ensureThinGap(), [this.vel.read], this.arg('scale one', [1, 0, 0, 0]));
    }, thin);

    // 4. Project, 5. advect velocity by itself, 6. project again
    /*
      The magnet, as a force on the liquid where the ferrofluid is (H7,
      phaseForce): before the projection, which keeps the part that carries a
      drop toward the magnet and the water around it. Real seconds over the
      flow's own displacement is what makes the pull the same on a slow look
      as a fast one. Only with a magnet under a plate that has ferrofluid.
    */
    const magnetOn = this.phaseLive && p.magnetStrength > 0.0001 && (p.magnetSeconds ?? 0) > 0;
    if (magnetOn) {
      stage('magnet', (pass) => {
        const perStep = (p.magnetSeconds ?? 0) / Math.max(disp, 1e-7);
        // Under a maze field the magnet's pull gives way to the dipoles'
        // repulsion: pulled hard to one spot, the ferrofluid stacks into
        // rings round it rather than a maze (the gradient orders the
        // stripes across it). Still enough that the maze follows the hand.
        const pull = (1 - 0.75 * maze) * (maze > 0.001 ? 1 - (1 - SPIKE_PULL) * spikeAmt : 1);
        // The clear liquid's viscosity over the ferrofluid's, for the rim's
        // force to be read against the ferrofluid's own drag (phaseForce, and
        // why); hsPrep reads the same two (thinProject).
        const nuRatio = thin ? thinGapViscosity(p.gapThickness ?? THIN_GAP_THICKNESS) / (p.ferroViscosity ?? FERRO_NU) : 1;
        this.run(pass, 'phaseForce', this.vel.write, [this.vel.read, this.phase.read, this.ensureStand()],
          this.arg('magnet force', [p.magnetX, p.magnetY, p.magnetHeight, p.magnetStrength, MAGNET_GAIN * perStep * pull,
            Math.min(MAGNET_CAP * perStep, MAGNET_CELLS / Math.max(disp * N, 1e-9)), nuRatio, 0]));
        this.vel.swap();
      });
    }
    // The maze's own flow (mazeForce), from last step's chemical potential.
    const mazeFlow = this.mazeReady && !!this.phaseMuT && (p.magnetSeconds ?? 0) > 0;
    if (mazeFlow) {
      stage('maze force', (pass) => {
        const perStep = (p.magnetSeconds ?? 0) / Math.max(disp, 1e-7);
        this.run(pass, 'mazeForce', this.vel.write, [this.vel.read, this.phase.read, this.phaseMuT!, this.ensureStand()],
          this.arg('maze force', [MAZE_GAIN * (1 + (SPIKE_FLOW - 1) * spikeAmt) * (N / 256) * perStep, MAGNET_CELLS / Math.max(disp * N, 1e-9), 0, 0]));
        this.vel.swap();
      });
    }
    /*
      What the mix does to the flow (see mixForce): surface tension round the
      oil, Marangoni flow away from soap, buoyancy from the dye's weight and
      the heat. Here, before the projection, for the same two reasons as the
      magnet: the projection keeps the part of each that is real flow, and
      the step's flow is built from what is added before it (the velocity
      carried from step to step is capped small in \`decayVel\`; what moves
      the plate is what each step adds and the lasting current).
      In real seconds: each strength is plate widths a second.
    */
    const oil = Math.max(0, Math.min(1, p.oilTension ?? 0));
    const soap = Math.max(0, Math.min(1, p.surfactantFlow ?? 0));
    /*
      Dye weighs something whether or not a look says how much, so standing
      the plate up (Gravity) pours it downhill on any look; Dye Weight, where
      a look sets it, says how much. Flat on the projector gravity is
      straight through the glass and this is zero either way.
    */
    const upright = Math.max(0, Math.min(1, p.plateUpright ?? 0));
    const buoy = Math.max(Math.max(0, Math.min(1, p.solutalBuoyancy ?? 0)), upright > 0.001 ? 0.5 : 0);
    if (buoy > 0.001) this.ensureMix();
    const mix = this.mix;
    /*
      Oil Bodies (see bodyPartition): only where there is oil for the colour
      to keep to, which takes the oil's own surface tension, since the oil is
      poured into the mix only while that is on.
    */
    const bodies = Math.max(0, Math.min(1, p.oilBodies ?? 0));
    this.bodiesWanted = bodies > 0.001 && oil > 0.001;
    const bodiesOn = this.bodiesWanted && !!mix && this.mixLive;
    if (bodiesOn) this.ensureOilDye();
    const bodiesFresh = bodiesOn && this.oilDyeStale;
    if (bodiesOn) this.oilDyeStale = false;
    else if (this.oilDye) this.oilDyeStale = true;
    const perSecond = (p.magnetSeconds ?? 1 / 60) / Math.max(disp, 1e-7);
    // The oil's σ: on a thin gap it carries the gap's h² (OIL_TENSION_GAP says why), on the old plate not.
    const tension = thin ? OIL_TENSION_GAP : OIL_TENSION;
    stage('mix force', (pass) => {
      /*
        Gravity in the plate: how far it stands up, toward the bottom of the
        room. The dish is drawn turned (Rotation, and a flick), and gravity
        does not turn with it: reported, Lava Lamp's wax poured off toward
        whichever corner the dish had started turned to and the plate was
        empty in twenty seconds. (Its rock moves the dye already: on a thin
        gap as the dye's weight down the tipped plate, in hsBody, and on the
        old plate through the lasting current.)

        And a lamp under it, just where the plate goes out of view: what
        sinks there is warmed, rises, cools as it goes and sinks again,
        which is what keeps a lava lamp going rather than settled.
      */
      const gl = Math.hypot(p.gravityX ?? 0, p.gravityY ?? -1) || 1;
      const gx = upright * (p.gravityX ?? 0) / gl, gy = upright * (p.gravityY ?? -1) / gl;
      const lamp = upright > 0.001 ? LAMP_HEAT * upright * (p.magnetSeconds ?? 1 / 60) : 0;
      const smooth = this.scratch();
      this.run(pass, 'mixSmooth', smooth, [mix!.read], none);
      const args = this.arg('mix force', [oil * tension * perSecond * N * N, OIL_CELLS / Math.max(disp * N, 1e-9), lamp, Math.max(0.05, Math.min(0.5, p.gravityReach ?? 0.3)),
        gx, gy, buoy * DYE_WEIGHT * perSecond, buoy * HEAT_LIFT * perSecond]);
      /*
        The rim held at the oil's own pressure (PLAN 18g-6, CAPILLARY in
        wgsl/fluid.ts): φ round the ring, from this step's oil, for the
        force to take its gradient off near the rim. Run with every mix
        force, with oil or without (it is then zero), so what mixForce
        reads is never an earlier oil's. One workgroup.
      */
      const rim = this.rimRing();
      if (thin) this.run(pass, 'rimLaplace', rim, [smooth], args, 1);
      this.run(pass, 'mixForce', this.vel.write, [this.vel.read, mix!.read, this.dye.read, smooth, rim], args);
      this.vel.swap();
      // Film Hold's push: the film between two drops holds them apart (mixFilm).
      const hold = Math.max(0, Math.min(1, p.filmHold ?? 0));
      if (hold > 0.001 && oil > 0.001) {
        this.run(pass, 'mixFilm', this.vel.write, [this.vel.read, mix!.read, smooth],
          this.arg('mix film', [oil * tension * perSecond * N * N * FILM_PUSH * hold, OIL_CELLS / Math.max(disp * N, 1e-9), 0, 0]));
        this.vel.swap();
      }
    }, !!mix && ((this.mixLive && oil > 0.001) || buoy > 0.001));
    /*
      On a thin gap, Rain Drip's heavy dye, Plate Rock's tilt, Updraft's
      shear and a Blow's breath (PLAN 15g) join the body forces (hsBody), and the velocity is kept here, after all of them and
      before the stirring, so hsPrep can read the two apart: a body force
      moves a liquid as its viscosity says, a stir as the dial says (PLAN
      18a-2, wgsl/thinGap.ts). With no body force this step there is nothing
      to keep, and hsPrep reads the velocity from before the forces in its
      place, which makes the body forces' share zero.
    */
    const mixOn = !!mix && ((this.mixLive && oil > 0.001) || buoy > 0.001);
    const rockOn = thin && Math.hypot(p.rockX, p.rockY) > 1e-5;
    const thinBody = thin && (p.drip > 0.01 || p.air > 0.1 || !!breath || rockOn);
    if (thinBody) {
      /*
        The breath is laid as its stress, in pascals (lib/breath.ts), and
        read as every body force here is, as the speed it drives the
        reference liquid to at the rest gap: τh₀/2μ_ref in m/s, then in the
        flow's units, plate widths a step over the step's displacement
        (real seconds over the plate's width and disp, as hsPrep's hand).
      */
      const h0 = REST_GAP_METRES;
      const seconds = Math.max(0, Math.min(0.1, p.magnetSeconds ?? 1 / 60));
      const breathScale = breath ? (h0 / (2 * LIQUID_DENSITY * NU_REF)) * seconds / (PLATE_METRES * Math.max(disp, 1e-9)) : 0;
      const breathTex = breath ?? this.blank('rgba');
      /*
        The oil's lift up the tipped plate (PLAN 27f-5, hsBody): wherever the
        mix holds oil, which it does only while the look's Oil Tension is on.
        Its speed, OIL_LIFT in m/s per unit sinθ, turned into the flow's
        per-step speed as the breath's is, and signed uphill, against the
        colour's pull. It is laid as the closed dish's circulation, Ψ relaxed
        a few sweeps a step from where it was (hsLiftSource, hsLiftRelax);
        the water's colour then weighs against its own mean (hsOilMean).
      */
      const lifting = rockOn && !!mix && this.mixLive && oil > 0.001;
      const mixTex = lifting ? mix!.read : this.blank('rgba');
      // The oil's own share of the colour, with Oil Bodies (WATER_DYE in wgsl/thinGap.ts).
      const oilDyeTex = lifting && bodiesOn && this.oilDye ? this.oilDye.read : this.blank('rgba');
      stage('thin body', (pass) => {
        this.ensureThinGap();
        let lift = 0;
        if (lifting) {
          const m = this.liftN;
          this.hsRun(pass, 'hsOilMean', `hsOilMean:${mixTex.label}:${this.dye.read.label}:${oilDyeTex.label}`, this.arg('oil mean', [0, 0, 0, 0, 0, 0, 0, 0]),
            [mixTex, this.dye.read, this.hsOilMean!, oilDyeTex], 64);
          this.hsRun(pass, 'hsLiftSource', `hsLiftSource:${mixTex.label}`, this.arg('lift source', [m, 0, 0, 0]), [mixTex, this.hsLiftSrc!], m * m);
          const omega = 2 / (1 + Math.sin(Math.PI / m));
          for (let k = 0; k < LIFT_SWEEPS; k++) {
            for (const parity of [0, 1]) {
              this.hsRun(pass, 'hsLiftRelax', `hsLiftRelax:${parity}`, this.arg(`lift relax ${parity}`, [m, parity, omega, 0]),
                [this.hsLiftSrc!, this.hsLiftPsi!], m * (m / 2));
            }
          }
          const built = (name: string) => this.pipelines.hasCompute(`${name}:thin`, WebGPUFluid.liftCode(name));
          if (built('hsOilMean') && built('hsLiftSource') && built('hsLiftRelax')) {
            lift = -OIL_LIFT * seconds / (PLATE_METRES * Math.max(disp, 1e-9));
          }
        }
        this.hsRun(pass, 'hsBody', `hsBody:${this.vel.read.label}:${this.dye.read.label}:${this.squeeze.read.label}:${breathTex.label}:${mixTex.label}:${oilDyeTex.label}`,
          this.arg('thin body', [p.drip > 0.01 ? DRIP_WEIGHT * p.drip : 0, AIR_SHEAR, REST_GAP, breathScale,
            rockOn ? ROCK_FALL * p.rockX : 0, rockOn ? ROCK_FALL * p.rockY : 0, lift * p.rockX, lift * p.rockY]),
          [this.vel.read, this.dye.read, this.squeeze.read, this.vel.write, breathTex, mixTex, this.hsOilMean!, this.hsLiftPsi!, oilDyeTex]);
        this.vel.swap();
      });
    }
    if (thin) {
      const body = magnetOn || mazeFlow || mixOn || thinBody;
      const prev = this.ensureThinGap();
      this.hsMidNow = body ? this.hsMid! : prev;
      stage('thin gap mid', (pass) => {
        this.run(pass, 'scaleDye', this.hsMid!, [this.vel.read], this.arg('scale one', [1, 0, 0, 0]));
      }, body);
    }
    // Vorticity confinement, a look option (see `curl` in wgsl/fluid.ts).
    stage('confine', (pass) => {
      const w = this.scratch();
      // The spin of the flow the plate actually moved by last step: the
      // velocity carried between steps is capped small (decayVel).
      this.run(pass, 'curl', w, [this.velForced], none);
      this.run(pass, 'confine', this.vel.write, [this.vel.read, w], this.arg('confine', [Math.min(1, p.vorticity ?? 0) * CONFINE, 0, 0, 0]));
      this.vel.swap();
    }, (p.vorticity ?? 0) > 0.001);
    /*
      8.8. The spun dish's swirl (PLAN §22): only while something spins.
      Worked out ahead of either solve, because it reads nothing they write
      and a thin gap takes it in before its solve, with the current: the
      swirl is a speed the dish's drag holds the liquid to against the
      glass, which is what the thin solve takes a current to be, and the
      solve then makes it conserve liquid with everything else. There the
      swirl field holds the drive as a speed at the rest gap, a/k0, not the
      integrated swirl: the thin solve brings the liquid to whatever it is
      given at k0 and then drags it with its own 12ν/h², so handed the swirl
      itself it counted the gap twice and a pressed palm went round at 0.045
      of the dish's turn where the old plate gives 0.53 (measured in the lab,
      the press of `npm run dish`, which now runs both plates). On the old
      plate it is laid over the flow after both projections, as the current
      is, and it is divergence-free already (stepSwirl projects it).
    */
    const swirlOn = this.swirlWanted(p) && !WebGPUFluid.swirlHeldOff;
    this.swirlCount.steps++;
    if (swirlOn) this.swirlCount.ran++;
    stage('swirl', (pass) => {
      if (swirlOn) { this.stepSwirl(pass, p, thin); return; }
      for (const t of [this.swirl.a, this.swirl.b, this.swirlP.a, this.swirlP.b]) this.fill(pass, t, [0, 0, 0, 0], this.M);
    }, swirlOn || this.swirlLive);
    this.swirlLive = swirlOn;
    const swirlScale = swirlOn ? (p.magnetSeconds ?? 1 / 60) / Math.max(disp, 1e-7) : 0;

    /*
      A thin gap takes the stirring in with the other forces, before the
      solve, so it lasts through the drag time like any push and the flow it
      makes conserves liquid; then one projection with the drag in it, and no
      self-advection or second projection (the header of wgsl/thinGap.ts,
      "What the step no longer does", says why they can go and what it costs).
    */
    if (thin) {
      stage('forces', (pass) => {
        this.run(pass, 'forcesB', this.vel.write, [this.vel.read, this.dye.read], this.arg('forces thin', [1, 0, 0, 0]));
        this.vel.swap();
      });
      /*
        And the lasting current with them. On the old plate the current is a
        speed laid over the flow after both projections, divergence-free in
        u, which in a gap is not liquid conserved: stirred with a current,
        glycerine's |∇·(hu)| came to 0.0093 of its flux where without one it
        was 0.0030 (npm run thingap). Here it goes in as the other forces do,
        a speed the liquid is driven to against the glass, and the solve
        makes it conserve liquid with everything else. The rock, the
        buoyancy and the lamp's pull still come from the current's own
        solver (PLAN §18a has their move into this field as forces).
      */
      stage('current', (pass) => {
        this.stepCurrent(pass);
        this.run(pass, 'addCurrent', this.vel.write, [this.vel.read, this.cur.read, this.squeeze.read, this.swirl.read], this.arg('current grid thin', [0, this.M, 0, swirlScale]));
        this.vel.swap();
      });
      stage('thin gap', (pass) => {
        this.thinProject(pass, p, disp, hands);
        // What the dye rides is the flow itself: the current is in it now.
        if (this.sloshTex && this.pipeline('addSlosh', VEL)) {
          // And the dish's own flow over it, when the dial is up (setSlosh): the unit is the swirl's, plate widths a second to this solver's.
          const sloshScale = (p.magnetSeconds ?? 1 / 60) / Math.max(disp, 1e-7);
          // Each layer's own: the oil's share of the cell (the mix's red) rides the oil's flow, the rest the water's (lib/slosh.ts).
          const sloshOil = !!this.mix && (p.oilTension ?? 0) > 0;
          this.run(pass, 'addSlosh', this.velForced, [this.vel.read, this.sloshTex, sloshOil ? this.mix!.read : this.sloshTex], this.arg('add slosh', [0, sloshOil ? 1 : 0, SLOSH_N, sloshScale]));
        } else {
          this.run(pass, 'scaleDye', this.velForced, [this.vel.read], this.arg('scale one', [1, 0, 0, 0]));
        }
        // Less the glass's drift for the carries, when it has one (driftCells).
        const [wx, wy, fx, fy] = this.driftCells;
        this.riding = (wx !== 0 || wy !== 0 || fx !== 0 || fy !== 0) && this.driftIsReady();
        if (this.riding) {
          const toVel = 1 / Math.max(disp * N, 1e-9);
          this.run(pass, 'driftOff', this.velRide, [this.velForced], this.arg('drift off', [(wx + fx) * toVel, (wy + fy) * toVel, 0, 0]));
        }
      });
    } else {
      stage('project 1', (pass) => this.project(pass));
      stage('advect velocity', (pass) => this.macCormack(pass, this.vel, this.vel.read, disp, 'vel'));
      stage('project 2', (pass) => this.project(pass));

      // 6.5–8.7 The post-projection forces
      stage('forces', (pass) => {
        this.run(pass, 'forcesB', this.vel.write, [this.vel.read, this.dye.read], none);
        this.vel.swap();
      });
    }

    // 8.9. The lasting current, and the flow the dye rides (a thin gap took
    // its current in before the solve, above).
    stage('current', (pass) => {
      this.stepCurrent(pass);
      // The gap rides along: the plate's depth is a mobility on the flow that
      // carries the dye (F), and this is the field that carries it.
      this.run(pass, 'addCurrent', this.velForced, [this.vel.read, this.cur.read, this.squeeze.read, this.swirl.read],
        this.arg('current grid', [0, this.M, p.depthDrag, swirlScale]));
    }, !thin);

    // 9. Dye: dispersion along the flow plus molecular diffusion (PLAN 18h, 18h-2)
    /*
      Molecular diffusion of food dye in water (Dm ≈ 4e-10 m²/s) is negligible
      on show timescales, holding crisp edges across streamlines. Along the flow,
      the Poiseuille parabolic velocity profile across the gap (u(z) = 1.5 ū (1 - 4z²/h²))
      shears dye columns into parabolic sheets with variance σ² ≈ 0.2 |ū|² (Δt)².
      On show timescales (t ≪ h²/Dm ≈ 25 hours), diffusion has not homogenized
      across the 2 mm gap (h²/Dm ≈ 3 hours there), so the flow is in the pre-asymptotic, unsteady shear
      dispersion regime rather than the asymptotic Taylor–Aris limit.

      In that pre-asymptotic regime, the parabolic shear is kinematically
      reversible: when the flow stops or reverses, the sheared sheets fold back
      up. A single 2D depth-averaged layer cannot resolve depth z, so modeling
      shear spreading as an anisotropic diffusion tensor (D_L = Dm + κ_T |v|²)
      acted as an irreversible diffusion proxy that smeared dye permanently
      (failing reversibility checks). True reversible shear spreading is not
      modelled here and is deferred to PLAN 18h-2 (e.g. multi-layer or profile
      tracking).

      In the app, shear dispersion is disabled (kappaT = 0.0), preserving sharp
      edges across streamlines and physical reversibility under flow reversals.
      kappaT is retained solely as a lab control for scripts/dispersion.mjs to
      verify that an irreversible diffusion proxy fails the reversibility check.
      Molecular diffusion Dm scales with the Diffusion Rate slider (p.diff).
    */
    const diffScale = p.diff > 0 ? p.diff / 0.0002 : 0;
    const dm = (D_MOLECULAR / (PLATE_METRES * PLATE_METRES)) * p.dt * n2 * diffScale;
    const dispCells = disp * (N - 2);
    const kappaT = p.kappaT ?? 0.0;
    const dispCap = 0.25;
    /*
      Skip the dye disperse pass when there is no plate displacement and physical
      diffusion is negligible. `dm` is the step's molecular spread in cells²
      ((D_m / plate_area) * dt * (N-2)² * diffScale).
      At 0.0039 ≈ 1/256 (one 8-bit unorm quantum, 1/255 ≈ 0.00392), a step's
      explicit Laplacian flux across a full-strength edge (|ΔC| = 1.0) produces
      less than a single 8-bit quantization step of change.
      At default show resolution (N = 256, dx ≈ 0.79 mm, dt = 1/60 s) with
      p.diff = 0.0002, physical food dye diffusion in water (Dm ≈ 4e-10 m²/s)
      yields dm ≈ 1.08e-5 cells²/step — ~360× below 1/256. Skipping this near
      no-op pass saves ~0.4 ms/step on the GPU with zero visible change.
      If dt or grid N changes, dm scales as dt * (N - 2)²; 0.0039 remains the
      threshold where a step's diffusion alters an 8-bit level.
    */
    stage('dye disperse', (pass) => {
      this.run(pass, 'dyeDisperse', this.dye.write, [this.dye.read, this.velForced, this.squeeze.read],
        this.arg('dye disperse', [dm, kappaT, REST_GAP, dispCells, dispCap, 0, 0, 0]));
      this.dye.swap();
      if (bodiesOn && !bodiesFresh) {
        const od = this.oilDye!;
        // Keep oil's pre-dispersion share in scratchB for bodyUnspread
        this.run(pass, 'scaleDye', this.scratchB, [od.read], this.arg('scale one', [1, 0, 0, 0]));
        this.run(pass, 'dyeDisperse', od.write, [od.read, this.velForced, this.squeeze.read],
          this.arg('dye disperse oil', [dm, kappaT, REST_GAP, dispCells, dispCap, 0, 0, 0]));
        od.swap();
        this.run(pass, 'bodyUnspread', this.dye.write, [this.dye.read, od.read, this.scratchB], this.arg('unspread dye', [0, 0, 0, 0]));
        this.run(pass, 'bodyUnspread', od.write, [this.dye.read, od.read, this.scratchB], this.arg('unspread oil', [0, 0, 0, 1]));
        this.dye.swap();
        od.swap();
      }
    }, dispCells > 0 || (kappaT > 0 ? dm > 0 : dm > 0.0039));
    /*
      The poured liquids' species rides the colour's carry when it can (PLAN
      18d-11a, bodyAdvectPairSub): the same faces in the same substeps, found
      once for both. Where the colour is carried some other way (the maze's
      sixths), the species' stage carries it alone, as it always did.
    */
    const speciesOn = thin && !!this.species && this.speciesLive;
    const rider = speciesOn && this.fuseSpecies ? this.species! : undefined;
    let speciesCarried = false;
    stage('advect dye', (pass) => {
      /*
        Under the maze's flow the dye crosses faces, as the ferrofluid does
        (phaseAdvect), and not by the backtrace (PLAN.md §9f, `npm run
        domes`). Reported: where the Magnet parts a pool into domes, the
        gaps between them showed a dark amber film, not the bright dye the
        references have between their domes. The dye had not been pushed
        out (Pushes Dye is off on Magnet Garden); it was lost. mazeForce's
        flow is strongest at the grid's scale, along every edge of the
        ferrofluid, and the backtrace thins a cell where such a flow spreads
        and caps it where it gathers (bodyAdvect has the account, from the
        oil's surface tension, which does the same): measured in the lab,
        16 dye patches on 256², a pool of ferrofluid under the Magnet for
        240 steps, 6% of the plate's dye gone and the dye within 0.08 of the
        magnet down from 834 to 63; with the maze's flow off, all of it
        kept. Across faces nothing is made or lost: 71874 → 71879, and 1510
        within 0.08 (on 384², `npm run domes`: 6% of the plate's dye gone
        before, 0.1% after).

        In the ferrofluid's substeps (PHASE_SUBSTEPS), each a sixth of the
        step: a face carries at most 0.45 of a cell a pass, and the magnet's
        flow reaches more than two cells a step (MAGNET_CELLS), which is why
        the ferrofluid is substepped. Carried in one pass, the dye would
        stop at 0.45 of a cell while the ferrofluid went on, and a cell
        emptied through all four faces could give more than it held, which
        the floor then makes up: conserved only at low speed (the pre-push
        review's reading). Whenever the maze flows, which is every look with
        a Labyrinth and also Classic while the Magnet stands spikes over its
        ferrofluid (mazeReady); the whole plate's dye then moves this way,
        not only the dye near the magnet. Every other look's dye moves as
        it did.

        In a thin gap, when the maze is not flowing, the dye goes through the
        faces too, as it does with Oil Bodies (bodyAdvect). The dye is colour per unit of plate, h·C, and
        the liquid carries C, so what it obeys is ∂(hC)/∂t + ∇·(hC u) = 0:
        an amount moved across faces by u, which is what the fluxes are. The
        backtrace copies a value and thins it by the flow's spread, held to
        e^±0.5 a step so one bad texel cannot flood a cell, and under a press
        the flow leaving a closing gap spreads past that hold: a disc of dye
        under a press laid in one step went from 332 to 656 (npm run thingap).
        Divided by the depth, carried as C and multiplied back, the disc
        gained 13% and a ring round a press laid over ten steps 12%, since a
        backtrace keeps no sum. Across faces both keep every drop (332.0 and
        336.0, before and after), and the ring lands where the displaced
        volume puts it (100% of the shift, against 85% by backtrace).

        Both at once (a thin gap under a Labyrinth) take the maze's substeps:
        the same face fluxes, in sixths, so the faster flow is carried too.
      */
      /*
        And in substeps on a thin gap, as many as the step's flow needs
        (carryPlan, and why): a hand on the glass moves the liquid many cells
        a step, and a carry that cannot keep up leaves the colour behind.
      */
      if (thin) this.planCarry(pass, disp);
      if (!bodiesOn && mazeFlow) {
        // The maze's sixths, or as many as a hand in the liquid needs (handSubs), as the ferrofluid takes.
        const flux = this.arg(`dye flux ${handSubs}`, [0, 0, 0, 0, 0, disp / handSubs, 1, thin ? REST_GAP : 0]);
        for (let k = 0; k < handSubs; k++) {
          if (thin) this.runThinFaced(pass, 'bodyAdvectThin', this.dye.write, this.dye.read, flux);
          else this.runPressed(pass, 'bodyAdvect', this.dye.write, [this.dye.read, this.velForced], flux);
          this.dye.swap();
          /*
            The reaction rides with the colour it lays (stepChemistry, and
            why it is carried here and only here). This branch carried the
            dye alone, so under a Labyrinth the pattern stood still while the
            print it had made moved off.
          */
          if (this.chemLive) {
            if (thin) this.runThinFaced(pass, 'bodyAdvectThin', this.chem.write, this.chem.read, flux);
            else this.runPressed(pass, 'bodyAdvect', this.chem.write, [this.chem.read, this.velForced], flux);
            this.chem.swap();
          }
        }
        this.shiftCarried(pass, this.dye);
        if (this.chemLive) this.shiftCarried(pass, this.chem);
        return;
      }
      if (!bodiesOn && thin) {
        this.carrySubsteps(pass, 'bodyAdvect', this.dye, this.arg('body advect thin', [0, 0, 0, 0, 0, disp, 1, REST_GAP]), rider);
        speciesCarried = !!rider;
        this.carrySubsteps(pass, 'bodyAdvect', this.liquids0, this.arg('body advect thin', [0, 0, 0, 0, 0, disp, 1, REST_GAP]));
        this.carrySubsteps(pass, 'bodyAdvect', this.liquids1, this.arg('body advect thin', [0, 0, 0, 0, 0, disp, 1, REST_GAP]));
        if (this.chemLive) this.carrySubsteps(pass, 'bodyAdvect', this.chem, this.arg('body advect thin', [0, 0, 0, 0, 0, disp, 1, REST_GAP]));
        return;
      }
      if (!bodiesOn) { 
        this.macCormack(pass, this.dye, this.velForced, disp, 'dye'); 
        this.macCormack(pass, this.liquids0, this.velForced, disp, 'dye'); 
        this.macCormack(pass, this.liquids1, this.velForced, disp, 'dye');
        if (this.chemLive) this.macCormack(pass, this.chem, this.velForced, disp, 'dye'); 
        return; 
      }
      /*
        With Oil Bodies, the dye and the oil's share of it cross the same
        faces as the oil does (bodyAdvect, and why). A share left from an
        earlier stretch with it off is stale, so it starts again from the
        plate as it is: the colour in each cell is the oil's as far as the
        cell is oil (bodyLand, with the whole dye as what lands), which is
        what a dish holds the moment anyone starts telling its two liquids
        apart. It started empty, on the reasoning that whatever was inside a
        body would be handed to it within a few steps; measured, it was not.
        Clock Glass lays its bodies with their colours in them (seedPreset),
        and with an empty start each colour was the water's: it spread out
        of its body as the water's colour spreads and left a dark ring of
        clear oil inside a wide halo (the lab, 300 steps; npm run
        clockglass).
      */
      const od = this.oilDye!;
      if (bodiesFresh) {
        for (const t of [od.a, od.b]) this.fill(pass, t, [0, 0, 0, 0], this.N);
        this.run(pass, 'bodyLand', od.write, [od.read, this.dye.read, this.deltaMulTex, mix!.read], this.arg('body start', [0, 0, 0, 0]));
        od.swap();
      }
      if (thin) {
        const thinAdv = this.arg('body advect thin', [0, 0, 0, 0, 0, disp, 1, REST_GAP]);
        this.carrySubsteps(pass, 'bodyAdvect', this.dye, thinAdv, rider);
        speciesCarried = !!rider;
        this.carrySubsteps(pass, 'bodyAdvect', od, thinAdv);
        this.carrySubsteps(pass, 'bodyAdvect', this.liquids0, thinAdv);
        this.carrySubsteps(pass, 'bodyAdvect', this.liquids1, thinAdv);
        if (this.chemLive) this.carrySubsteps(pass, 'bodyAdvect', this.chem, thinAdv);
        return;
      }
      const adv = this.arg('body advect', [0, 0, 0, 0, 0, disp, 1, 0]);
      this.runPressed(pass, 'bodyAdvect', this.dye.write, [this.dye.read, this.velForced], adv);
      this.dye.swap();
      this.runPressed(pass, 'bodyAdvect', od.write, [od.read, this.velForced], adv);
      od.swap();
      this.runPressed(pass, 'bodyAdvect', this.liquids0.write, [this.liquids0.read, this.velForced], adv);
      this.liquids0.swap();
      this.runPressed(pass, 'bodyAdvect', this.liquids1.write, [this.liquids1.read, this.velForced], adv);
      this.liquids1.swap();
      if (this.chemLive) {
        this.runPressed(pass, 'bodyAdvect', this.chem.write, [this.chem.read, this.velForced], adv);
        this.chem.swap();
      }
    });
    /*
      The grid's checkerboard out of the dye (dampGrid, and why), topped up to
      GRID_DAMP a step in every look. Previously, isotropic Jacobi diffusion
      removed about 8a/(1+8a) of it a step. Now with physical molecular diffusion
      Dm ~ 4e-10 m²/s (dm ≈ 0), gridDiff is ~0, so grid damping runs at full
      nominal strength (GRID_DAMP = 0.05) across all 29 looks that previously had
      elevated diffusion, keeping high-frequency grid modes smoothly damped.
    */
    const gridDiff = (8 * dm) / (1 + 8 * dm);
    const gridTop = ((p.gridDamp ?? GRID_DAMP) - gridDiff) / (1 - gridDiff);
    stage('dye grid', (pass) => {
      const k = this.arg('dye grid', [gridTop, 0, 0, 0]);
      const damp = (field: PingPong) => {
        this.run(pass, 'dampGridCurv', this.scratchA, [field.read], k);
        this.run(pass, 'dampGridLimit', this.scratchB, [field.read, this.scratchA], k);
        this.run(pass, 'dampGrid', field.write, [field.read, this.scratchA, this.scratchB], k);
        field.swap();
      };
      damp(this.dye);
      // The oil's share has the same grid in it, from the same faces.
      if (bodiesOn) damp(this.oilDye!);
    }, gridTop > 0.002);
    /*
      Marangoni flow (see marangoniFlux): the dye, and the mix itself, carried
      away from soap along the surface, conservatively. The mix goes second,
      reading the same soap the dye was moved by.
    */
    stage('marangoni', (pass) => {
      const pull = soap * SOAP_PULL * (p.magnetSeconds ?? 1 / 60) * N;
      const k = this.arg('marangoni', [pull, 0, 0, 0]);
      const kMix = this.arg('marangoni mix', [pull, 1, 0, 0]);
      for (let s2 = 0; s2 < 2; s2++) {
        this.run(pass, 'marangoniFlux', this.dye.write, [this.dye.read, mix!.read], k);
        this.dye.swap();
        this.run(pass, 'marangoniFlux', mix!.write, [mix!.read, mix!.read], kMix);
        mix!.swap();
      }
    }, !!mix && this.mixLive && soap > 0.001);

    /*
      Where air is, dye is not (H6 · A).

      After the advection, so the dye that moved this step is the dye the
      hole is cut from; before anything reads the plate, so nothing sees
      liquid where the bubble is. Skipped entirely when no bubble is on the
      plate, which is most looks — `stage` does not open a pass it is told
      not to, so the profiler reads zero rather than the cost of nothing.
    */
    stage('air exclude', (pass) => {
      this.run(pass, 'airExclude', this.dye.write, [this.dye.read, this.air!.field], this.arg('air clear', [p.bubbleClear ?? 1, 0, 0, 0]));
      this.dye.swap();
    }, !!this.air?.any && (p.bubbleClear ?? 1) > 0.001);

    /*
      The second phase, carried and kept sharp (H7).

      After the dye's own advection, on the same velocity, so the two move
      together — and before anything reads the plate, so the compositor sees
      the phase where it actually is this frame.

      The flow carries it, in flux form so none is made or lost, and its own
      pressure keeps it from packing past full. The magnet acts on the flow,
      earlier in the step.

      Skipped entirely on a plate with no phase on it, which is most looks.
    */
    stage('phase', (pass) => {
      /*
        The window first: the advection's grid filter, the relax and the
        separation below all step aside by it.
      */
      const stand = this.ensureStand();
      if (filmOn) this.layer!.window(pass, filmMags, stand);
      else if (this.standOn) this.run(pass, 'fill', stand, [], this.arg('stand clear', [0, 0, 0, 0, N, N, 0, 0]));
      this.standOn = filmOn;
      // With a magnet on, the flow near it can carry the ferrofluid further
      // than one flux step may (0.45 of a cell): so in substeps.
      // And under Thin Gap, where a press moves the liquid as fast as the
      // glass comes down (a cell a step and more round a palm, lab).
      // And as many as a hand in it needs (handSubs).
      const subs = this.phaseLive && (p.magnetStrength > 0.0001 || maze > 0.001 || thin) ? handSubs : 1;
      // A.b.z: the Rhie–Chow correction on (see phaseAdvect), which needs the
      // projection's pressure to still be the one velForced was made with.
      /*
        A.a: under Thin Gap the ferrofluid is carried as a volume, the gap
        going from what the phase last moved in to the gap now across the
        substeps (phaseAdvect), so each substep has its own arguments.
      */
      const volume = thin && this.phaseGapPrimed && p.phaseVolume !== 0 ? 1 : 0;
      const adv = (k: number) => this.arg(`phase advect ${k}`, [volume, k / subs, (k + 1) / subs, REST_GAP, 0, disp / subs, 1, 0]);
      /*
        And the grid-scale filter alone after each substep (phaseSeparate
        with no sharpening or tension). The Rhie–Chow correction removes
        most of what a collocated projection leaves at the finest scale;
        this takes what remains, which a maze's sharp forces otherwise drew
        as lines every other cell through the black.
      */
      const grid = this.arg('phase grid', [0, 0, 0, 0]);
      /*
        Two-phase carry on the thin gap (phaseVelocity in wgsl/fluid.ts,
        PLAN 29c-8): reconstructs the coherent drop's ferrofluid velocity
        at the trailing rim so the oil's dipole return flow cannot sweep it
        backward into the wake, while stepping aside when a labyrinth or
        standing-spike field parts the pool into narrow valleys.
      */
      if (thin) {
        if (!this.phaseVelT) {
          this.phaseVelT = this.disposer.track(this.device.createTexture({
            label: 'phase vel', size: [this.N, this.N], format: VEL,
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
          }));
        }
        const cohere = !this.filmHeld ? Math.max(0, 1 - 2 * maze) * (1 - spikeAmt) : 0;
        this.run(pass, 'phaseVelocity', this.phaseVelT, [this.ride(), this.phase.read], this.arg('phase vel', [cohere, 0, 0, 0]));
      }
      /*
        Carried as a volume, in as many substeps as the step's flow needs,
        never fewer than these (phasePlan in wgsl/fluid.ts, and why: a kick's
        press drew the ferrofluid into the middle), the filter moving volume
        too (phaseGrid, and why).
      */
      if (volume) this.runPhasePlanned(pass, subs, disp, stand);
      else for (let k = 0; k < subs; k++) {
        this.runPhaseAdvect(pass, adv(k));
        this.phase.swap();
        this.run(pass, 'phaseSeparate', this.phase.write, [this.phase.read, stand], grid);
        this.phase.swap();
      }
      // The rest of the way with the glass's drift (driftCells), as the colour went.
      this.shiftCarried(pass, this.phase, volume ? 'volume' : 'amount');
      this.runPhaseGapSeen(pass);
      for (let k = 0; k < PHASE_RELAX; k++) {
        this.run(pass, 'phaseRelax', this.phase.write, [this.phase.read, stand], none);
        this.phase.swap();
      }
      /*
        What the flux step spread of a moving edge this step, given back
        at each face (phaseCompress, PLAN 29c-1): the second-order flux the
        step's limiter withheld there, nothing where the ferrofluid is at
        rest or its profile smooth, bounded by the cells' share and room.
        The normal is read from the field blurred once here (phaseBlur),
        not blurred face by face. The thin gap's only, where it was
        measured (ferrodrag, ferropress): the deep plate's looks were
        measured with the spreading in them, and the compression at its
        first strength, run there too, broke three (spikes 2/6, maze 3/4,
        fingers 3/4 on the Mac, 2026-10-17); what the limiter's deficit,
        given back, does to them is not measured yet (PLAN 29c-1).
      */
      if (thin) {
        if (!this.phaseBlurT) {
          this.phaseBlurT = this.disposer.track(this.device.createTexture({
            label: 'phase blur', size: [this.N, this.N], format: R32,
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
          }));
        }
        this.run(pass, 'phaseBlur', this.phaseBlurT, [this.phase.read], none);
        // The faces' Courant numbers are the flux step's: the mixture's velocity,
        // which carries the share, over the substeps the carry ran (runPhaseCompress).
        this.runPhaseCompress(pass, stand, this.arg('phase compress', [PHASE_COMPRESS * (p.phaseCompress ?? 1), disp, volume, subs]));
        this.phase.swap();
      }

      /*
        Cahn–Hilliard keeps the two liquids apart, maze or not: it conserves
        and it rounds. The pairwise sharpening that stood in for it without
        a maze (phaseSeparate) exchanged only along the axes, and a plate of
        drops set into blocky squares with holes punched in them. Under a
        maze field (the look's, stronger under the hand's magnet) the
        dipoles' repulsion (phaseMu's ψ term) is added.
      */
      if (!this.psi) this.psi = new PingPong(this.device, this.disposer, [this.N, this.N], R32, 'psi');
      if (!this.phaseMuT) {
        this.phaseMuT = this.disposer.track(this.device.createTexture({
          label: 'phase mu', size: [this.N, this.N], format: RG32,
          usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        }));
      }
      const psi = this.psi, mu = this.phaseMuT;
      if (field > 0.001) {
        const screen = this.arg('screen', [mazeK.m2, 0, 0, 0]);
        for (let k = 0; k < 16; k++) {
          this.run(pass, 'screenJacobi', psi.write, [psi.read, this.phase.read], screen);
          psi.swap();
        }
      }
      // Phase Edge is how fast it separates: its mobility, M dt, from 0.006
      // to 0.018 (under the explicit limit, about 0.028).
      const args = this.arg('phase ch', [p.magnetX, p.magnetY, p.magnetHeight, p.magnetStrength,
        0.006 + 0.012 * Math.max(0, Math.min(1, p.phaseSharp ?? 0.35)), field > 0.001 ? mazeK.alpha * (0.5 + 0.5 * field) : 0, MAZE_UNIFORM * maze / Math.max(field, 1e-6), p.time ?? 0]);
      for (let k = 0; k < CH_SUBSTEPS; k++) {
        this.run(pass, 'phaseMu', mu, [this.phase.read, psi.read], args);
        // Carried as a volume, Cahn–Hilliard moves volume too (phaseCHVolume, and why).
        if (volume) this.run(pass, 'phaseCHVolume', this.phase.write, [this.phase.read, mu, this.squeeze.read, stand], args);
        else this.run(pass, 'phaseCH', this.phase.write, [this.phase.read, mu, stand], args);
        this.phase.swap();
      }
      /*
        The layer standing up round each magnet close enough (standing.ts):
        after the separation, which has stepped aside under it, so what the
        film leaves is what the plate draws and the next step carries.
      */
      if (filmOn) {
        filmMags.forEach((m, k) => {
          this.layer!.step(pass, k, m, p.magnetSeconds ?? 1 / 60, this.phase.read, this.phase.write);
          this.phase.swap();
        });
      }
      if (maze > 0.001 || spikes) {
        // Once more on where the phase ended, for the next step's force.
        this.run(pass, 'phaseMu', mu, [this.phase.read, psi.read], args);
        this.mazeReady = true;
      }
    }, this.phaseLive);

    /*
      The dye gets out of the ferrofluid's way (Ferro Pushes Dye).

      After the phase has moved for this step, so the dye is pushed from
      where the ferrofluid now is. The why, and the two exchanges, are at
      phaseDisplace in wgsl/fluid.ts. Twice a step: a finger's tip advances
      under a cell a step, and one exchange moves at most 4·DISPLACE_PUSH of
      a cell's dye, so a single pass let the tip overrun its own colour.
      Off (and not run) at 0, which is every look but the ones that ask.
    */
    const displace = Math.max(0, Math.min(1, p.phaseDisplace ?? 0));
    stage('phase displace', (pass) => {
      const args = this.arg('phase displace', [DISPLACE_PUSH * displace, DISPLACE_INSIDE * displace, 0, 0]);
      for (let k = 0; k < DISPLACE_ITERS; k++) {
        this.run(pass, 'phaseDisplace', this.dye.write, [this.dye.read, this.phase.read], args);
        this.dye.swap();
      }
    }, this.phaseLive && displace > 0.001);

    /*
      The mix: oil and water, soap, acidity (docs/physics-plan.md).

      Carried by the flow in flux form, then its own evolution: the oil
      separates from the water (Cahn–Hilliard), the soap spreads and breaks
      down, acid and base diffuse and cancel. And then what it does to the
      flow, for the next step's projection to shape: surface tension round
      the oil, Marangoni flow away from the soap, buoyancy from the dye's
      weight and the heat. The buoyancy needs no mix, but it shares the pass,
      so a plate asking for it gets an empty mix to read.
    */
    stage('mix', (pass) => {
      const m = mix!;
      if (this.mixLive) {
        // The oil with its colour: in the dye's substeps on a thin gap (carryPlan).
        if (thin) this.carrySubsteps(pass, 'mixAdvect', m, this.arg('mix advect thin', [0, 0, 0, 0, 0, disp, 1, REST_GAP]));
        else {
          this.runPressed(pass, 'mixAdvect', m.write, [m.read, this.velForced], this.arg('mix advect', [0, 0, 0, 0, 0, disp, 1, 0]));
          m.swap();
        }
        for (let k = 0; k < PHASE_RELAX; k++) {
          this.run(pass, 'mixRelax', m.write, [m.read], none);
          m.swap();
        }
        /*
          M dt under the explicit limit (1/64 for this stencil), in several
          substeps: the flow smears the oil's edge every step and the
          separation has to win it back as fast. Surfactant diffuses and
          lasts about ten seconds; acidity diffuses slowly. Only the first
          substep diffuses those two, so their rates do not depend on how
          many the oil takes.
        */
        const subs = oil > 0 ? CH_SUBSTEPS : 1;
        // Film Hold: the water film between two drops pushes back (FILM_WGSL).
        const film = oil > 0 ? this.arg('mix mu', [FILM_MU * Math.max(0, Math.min(1, p.filmHold ?? 0)), 0, 0, 0]) : none;
        for (let k = 0; k < subs; k++) {
          this.run(pass, 'mixMu', m.write, [m.read], film);
          m.swap();
          this.run(pass, 'mixUpdate', m.write, [m.read], k === 0
            ? this.arg('mix update', [0.012 * (oil > 0 ? 1 : 0), 0.08, Math.pow(0.1, (p.magnetSeconds ?? 1 / 60) / 10), 0.04])
            : this.arg('mix update oil', [0.012, 0, 1, 0]));
          m.swap();
        }
      }
    }, !!mix && this.mixLive);

    /*
      The poured liquids' species (PLAN 18d): carried with the colour, in
      its substeps and through the thin solve's own faces, so a pool of
      glycerine and its colour move as one and none of either is made or
      lost; and taken off where it has gone over the rim (stepSpecies). It
      does not fade (18d-2): a poured liquid leaves a dish by being flushed
      out of it as more liquid is poured in (pour, 18c). Only on a thin gap,
      the one plate whose drag a viscosity means anything to: off it, the
      CPU's body drag (lib/liquidPhase.ts) is the thickness, as before. Once
      the plate's poured share has been flushed to a millionth (speciesShare)
      the field is dropped and its stage stops running.
    */
    stage('species', (pass) => {
      this.speciesDisp = disp;
      this.stepSpecies(pass, !speciesCarried);
    }, speciesOn);
    this.lastSpeciesCarry = !speciesOn ? null : speciesCarried ? 'pair' : 'alone';

    /*
      The clear film (PLAN §20b, wgsl/film.ts).

      Laid the first step Clear Film is up, over the whole plate at its
      thickness, and raised or lowered everywhere by the difference when the
      control moves with a film on (more clear oil poured over the dish, or
      drawn off it). At 0 there is no film and nothing here runs.

      After the mix, on the same velocity the dye was carried by: the film is
      carried first, then evolved in substeps of its own time. The substeps
      share one dt (the same args each), so their uniforms are written once.
    */
    const filmWant = Math.max(0, Math.min(1, Number.isFinite(p.clearFilm) ? p.clearFilm as number : 0));
    if (filmWant <= 0.001) this.filmLaid = 0;
    stage('film', (pass) => {
      const f = this.ensureFilm();
      const n = f.size[0];
      /*
        What is on the plate is what was poured, so `filmLaid` follows the
        pours, not the control: a first lay at the precursor (a fade starting
        from 0 asks for less than a film can be) records the precursor, and a
        change too small to pour this frame is kept for a later one rather
        than counted as poured. Recording the control instead lost every
        step under 1e-4 of a long fade (the film stayed thick to the end,
        then went at once) and ended a fade-in from 0 a precursor thicker
        than the same setting laid at once.
      */
      if (this.filmLaid <= 0) {
        const h = Math.max(FILM_HP, FILM_MAX * filmWant);
        for (const t of [f.a, f.b]) this.fill(pass, t, [h, 0, 0, 0], n);
        this.filmLaid = h / FILM_MAX;
      } else if (Math.abs(filmWant - this.filmLaid) > 1e-4) {
        this.run(pass, 'filmSplat', f.write, [f.read], this.arg('film level', [0, 0, 0, 1, FILM_MAX * (filmWant - this.filmLaid), 0, 0, 0]), n);
        f.swap();
        this.filmLaid = filmWant;
      }
      const carry = this.arg('film carry', [(disp / FILM_CARRY) * n, 0, 0, 0]);
      for (let k = 0; k < FILM_CARRY; k++) {
        this.run(pass, 'filmAdvect', f.write, [f.read, this.velForced], carry, n);
        f.swap();
      }
      const span = FILM_RATE * Math.max(0, p.magnetSeconds ?? 1 / 60);
      const subs = Math.max(1, Math.min(FILM_SUBSTEPS, Math.ceil(span / FILM_DT)));
      const dust = this.arg('film dust', [Math.max(0, p.filmDust ?? 1), 0, 0, 0]);
      const step = this.arg('film step', [Math.min(FILM_DT, span / subs), 0, 0, 0]);
      for (let k = 0; k < subs; k++) {
        this.run(pass, 'filmMu', this.filmP!, [f.read], dust, n);
        this.run(pass, 'filmUpdate', f.write, [f.read, this.filmP!], step, n);
        f.swap();
      }
    }, filmWant > 0.001);

    /*
      Oil Bodies: each liquid keeps its own colour (bodyPartition, and why).

      After the mix, so the colour is kept to where the oil is at the end of
      this step, carried and rounded. Two passes, each writing the whole dye
      and then the oil's share from the same inputs before either is
      swapped: an edge moves a fraction of a cell a step and the evening-out
      moves up to a fifth of a cell's colour to each side a pass, which in
      one pass left the water's colour a step behind a fast edge.
    */
    stage('bodies', (pass) => {
      const od = this.oilDye!;
      const reach = this.ensureReach();
      // The oil blurred wide (four 5×5 binomials: a reach of eight cells),
      // for colour astray from its liquid to find the way back.
      this.run(pass, 'mixSmooth', reach.write, [mix!.read], none);
      reach.swap();
      for (let k = 1; k < BODY_REACH_BLURS; k++) {
        this.run(pass, 'mixSmooth', reach.write, [reach.read], none);
        reach.swap();
      }
      const tint = this.arg('bodies dye', [BODY_EVEN * bodies, BODY_HAND * bodies, BODY_INSIDE * bodies, 0, BODY_DRIFT * bodies]);
      const share = this.arg('bodies oil', [BODY_EVEN * bodies, BODY_HAND * bodies, BODY_INSIDE * bodies, 1, BODY_DRIFT * bodies]);
      for (let k = 0; k < BODY_PASSES; k++) {
        this.run(pass, 'bodyPartition', this.dye.write, [this.dye.read, od.read, mix!.read, reach.read], tint);
        this.run(pass, 'bodyPartition', od.write, [this.dye.read, od.read, mix!.read, reach.read], share);
        this.dye.swap();
        od.swap();
      }
    }, bodiesOn);

    /*
      The reactions: BZ's spirals and Liesegang's rings, each in a gel on a
      grid of its own (see gridSplat). Several small steps a frame: the
      Oregonator is stiff, and its step has to stay near a hundredth of its
      own time. A gel does not flow, which is the point of one: the bands
      are laid where the front was, and stay.
    */
    const bz = Math.max(0, Math.min(1, p.bzReaction ?? 0));
    const lies = Math.max(0, Math.min(1, p.liesegang ?? 0));
    const rxn = this.rxn;
    stage('bz', (pass) => {
      const r = rxn!;
      // The reaction's own time this step, in substeps of at most 0.01 (the
      // Oregonator is stiff). BZ Reaction is how strongly it is drawn, not
      // how fast the chemistry runs: it scaled the steps, so the one knob
      // that shows the reaction also sped it up twelvefold.
      const units = BZ_PER_SECOND * Math.max(0, Math.min(0.1, p.magnetSeconds ?? 1 / 60));
      const steps = Math.max(1, Math.ceil(units / 0.01));
      const args = this.arg('bz step', [units / steps, 0, BZ_GRID, 1.0]);
      for (let k = 0; k < steps; k++) {
        this.run(pass, 'rxnStep', r.write, [r.read], args, BZ_GRID);
        r.swap();
      }
    }, !!rxn && this.rxnLive && bz > 0.001);
    const gel = this.lies;
    stage('liesegang', (pass) => {
      const l = gel!;
      const args = this.arg('lies step', [0.01, 0, LIES_GRID, 0]);
      const steps = Math.max(1, Math.round(24 * lies));
      for (let k = 0; k < steps; k++) {
        this.run(pass, 'liesStep', l.write, [l.read], args, LIES_GRID);
        l.swap();
      }
    }, !!gel && this.liesLive && lies > 0.001);

    // 9.5. Sharpen what the advection and the diffusion softened
    if (p.sharpness > 0.0001) {
      stage('sharpen', (pass) => {
        this.run(pass, 'sharpenDye', this.dye.write, [this.dye.read], none);
        this.dye.swap();
      });
    }

    // 9.6. Pigment coordinates ride along with the dye
    if (this.grain) {
      stage('grain', (pass) => {
        this.run(pass, 'advect', this.grain!.write, [this.grain!.read, this.velForced, this.sampler], this.arg('advect grain', [disp, 0, 0, 0]));
        this.grain!.swap();
        const before = this.grainAge;
        this.grainAge = (this.grainAge + p.dt) % GRAIN_PERIOD;
        const crossed = (from: number, to: number, at: number) => (from < at && to >= at) || to < from;
        const keepA = crossed(before, this.grainAge, 0) && this.grainAge < GRAIN_PERIOD * 0.5 ? 0 : 1;
        const keepB = before < GRAIN_PERIOD * 0.5 && this.grainAge >= GRAIN_PERIOD * 0.5 ? 0 : 1;
        if (keepA === 0 || keepB === 0) {
          this.run(pass, 'seedGrain', this.grain!.write, [this.grain!.read], this.arg('grain keep', [keepA, keepB, 0, 0]));
          this.grain!.swap();
        }
      });
    }

    /*
      9b. The dye's weight on a level plate (PLAN 18m, wgsl/slump.ts): a pool
      of ink sinks to the lower glass and runs out along it under the clear
      liquid. Its own pass, apart from 'dye diffuse' (the blur 18h replaces
      with the real rates), so the two can change apart.
    */
    const slump = thin ? this.slumpPlan(p) : null;
    stage('slump', (pass) => {
      // run() skips a pipeline that failed to build, and a swap after a skipped
      // pass would hand the plate the other buffer's stale dye: no pass, no slump.
      if (!this.pipeline('slumpRate', R32) || !this.pipeline('slump', this.dye.write.format)) return;
      const rate = this.ensureSlump();
      const oilMix = mix && this.mixLive ? mix.read : this.blank('rgba');
      this.run(pass, 'slumpRate', rate, [this.dye.read, this.squeeze.read, oilMix],
        this.arg('slump rate', [slump!.rate, DYE_LAYER, GAP_METRES, 1 / -Math.log(DYE_FLOOR), slump!.inertRate, 0, 0, 0]));
      const args = this.arg('slump', [SLUMP_FACE, 0, 0, 0]);
      for (let k = 0; k < slump!.substeps; k++) {
        this.run(pass, 'slump', this.dye.write, [this.dye.read, rate], args);
        this.dye.swap();
      }
    }, !!slump);

    // 10. Decay: damping, the speed limit, evaporation, the cap, heat decay
    stage('decay', (pass) => {
      this.run(pass, 'decayDye', this.dye.write, [this.dye.read], none);
      this.dye.swap();
      this.run(pass, 'decayVel', this.vel.write, [this.vel.read, this.dye.read], none);
      this.vel.swap();
    });

    // What the plate draws from all of it, once the step has settled it.
    stage('view', (pass) => this.packView(pass));

    shared?.end();

    /*
      And the particles, after everything that moves the field they ride.

      In this encoder, not one of their own: they read `velForced` and the
      dye as the stages above have just left them, and a separate submit
      would put a frame of slack between the flow and what is carried by it.
    */
    this.stepParticles(enc, p);

    this.profiler.resolveInto(enc);
    this.submit(enc);
    this.profiler.afterSubmit();
  }

  /**
   * Whether this step runs the plate as a Hele-Shaw cell (PLAN §18a). It
   * needs the multigrid's levels, which every grid the ladder builds has.
   */
  private thinGapOn(p: GpuStepParams): boolean {
    const want = (p.thinGap ?? 0) > 0.5 && this.mg.length > 0;
    if (want && !this.hsReady) {
      /*
        Built ahead at the opening (prepare), which is every look's now: the
        first step is a thin one. Asking prepareThinGap here would find them
        built but say so only after an await, and the first steps would run
        the old way meanwhile, asking for the old plate's pipelines. Under
        `?prepare=0` they are built on this frame, as everything there is.
      */
      if (!WebGPUFluid.buildAhead || this.thinBuilt()) { this.hsReady = true; return true; }
      void this.prepareThinGap();
      return false;
    }
    if (!want && !this.oldReady) {
      /*
        Turned off in a show that opened thin: the old plate's pipelines were
        not built (prepare), so the plate stays thin while they build, as it
        stays old while the thin gap's build in the other direction. Built
        already when the look opened with it off; built on this frame under
        `?prepare=0`, and when the plate cannot run thin either (a new
        device's first steps before its thin gap is built: the stop the
        opening's list exists to prevent, which the re-laid opening's own
        list should have spared it).
      */
      if (!WebGPUFluid.buildAhead || this.oldBuilt()) { this.oldReady = true; return false; }
      void this.prepareOldPlate();
      if (this.hsReady && this.mg.length > 0) return true;
      this.oldReady = true;
    }
    return want;
  }

  /**
   * The thin gap's pipelines, built off the frame one at a time, the first
   * time it is asked for in a show that opened with it off; the plate runs
   * the old way until they are in. A look that opens on a thin gap, which is
   * every look since the owner picked every look (2026-10-03), has them
   * built before its first step instead (`prepare`, and thinGapOn).
   *
   * Not behind the show for one that opened with it off. Behind the show a
   * compile costs the frames it takes (gpu/prepare.ts): the page draws
   * between compiles, not during them, so every pipeline there is paid for
   * by every show's first seconds, and on a slow runner the WebGPU smoke's
   * "the stage starts" (thirty frames in thirty seconds) went red with these
   * twelve of them added (run 36367898896: 31 frames drawn by 37 s after load, where
   * another PR's green run that hour had drawn 852; that runner was slow
   * all round, so how much was these twelve is not known). A show that
   * opened with Thin Gap off and never turns it on should not pay for it;
   * one that turns it on runs the old way for as long as its compiles take
   * (fifteen with the carries' substeps and their plan: about three and a
   * half seconds at prepare.ts's 0.23 s each on CI's Mac), rather than
   * stopping on the frame to build them.
   */
  prepareThinGap(): Promise<void> {
    if (!this.hsBuilding) {
      this.hsBuilding = (async () => {
        // The kernels; the snapshot before the forces and the copy the dye
        // rides, both into the velocity's format; the dye's carry in substeps.
        for (const [key, code] of WebGPUFluid.thinBuilds(this.dyeFormat)) await this.pipelines.prepareCompute(key, code);
        // And the oil's (carryPlan), which only a look with the mix asks for.
        await this.pipelines.prepareCompute('mixAdvectSub:rgba32float', kernel('mixAdvectSub', 'rgba32float'));
        this.hsReady = true;
        for (const [key, code] of WebGPUFluid.driftBuilds(this.dyeFormat)) await this.pipelines.prepareCompute(key, code);
      })();
    }
    return this.hsBuilding;
  }

  /** The old plate's pipelines, built off the frame when Thin Gap is first turned off in a show that opened thin (thinGapOn). */
  prepareOldPlate(): Promise<void> {
    if (!this.oldBuilding) {
      this.oldBuilding = (async () => {
        for (const [key, code] of WebGPUFluid.oldPlateBuilds(this.dyeFormat)) await this.pipelines.prepareCompute(key, code);
        await this.pipelines.prepareCompute('mixAdvect:rgba32float', kernel('mixAdvect', 'rgba32float'));
        this.oldReady = true;
      })();
    }
    return this.oldBuilding;
  }

  private oldBuilt(): boolean {
    return WebGPUFluid.oldPlateBuilds(this.dyeFormat).every(([key, code]) => this.pipelines.hasCompute(key, code));
  }

  /** Whether every pipeline a thin step needs is already built (at the opening, by prepare). */
  private thinBuilt(): boolean {
    return WebGPUFluid.thinBuilds(this.dyeFormat).every(([key, code]) => this.pipelines.hasCompute(key, code));
  }

  /*
    The drift's two kernels in every format a carried field comes in (the
    colour's, the poured liquids' half floats, the mix's and the species'
    full floats, the ferrofluid's one channel), built behind the show
    (prepare, prepareThinGap) and never on a frame: until they are ready the
    carries ride the whole flow in substeps, as they did, so the first kick
    that slides the glass does not stop the frame to compile them.
  */
  private static driftBuilds(dye: GPUTextureFormat): [string, string][] {
    return [
      [`driftOff:${VEL}`, kernel('driftOff', VEL)],
      ...[...new Set([dye, 'rgba16float', RGBA32, R32] as GPUTextureFormat[])].map((f): [string, string] => [`driftShift:${f}`, kernel('driftShift', f)]),
    ];
  }
  private driftIsReady(): boolean {
    if (!this.driftReady) this.driftReady = WebGPUFluid.driftBuilds(this.dyeFormat).every(([key, code]) => this.pipelines.hasCompute(key, code));
    return this.driftReady;
  }
}
