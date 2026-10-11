# Handoff: the closeup's ferrofluid drop, steps after 29a (for Antigravity)

<!-- Lives in the repo so a session without the project's shared files can read it. Pictures named here are in the project's shared files (`macro-ferro-drop/`); the scenes that make them are described inline so they can be re-rendered in the lab. -->

The owner's ask (2026-10-11): in the closeup, "a drop of ferro fluid with light reflecting
off of it, with some dye on top of it as it gets pulled through dyes, causing the dye to
spread ... At some point the dye rolls off of the ferrofluid drip, leaving some dye around
and then the ferrofluid keeps getting pulled through the dye and making waves of sorts.
Calm details and control." Also (same day): **no frame motion from sound**. The plate and
camera must not sway, pan or press on the beat; the liquid's own motion is the show.

Plan: `PLAN.md` §29 (`grep -n '^## 29' PLAN.md`). 29a (the lit bead) is PR #365 (Claude).
What follows is one PR each, in this order. A Claude thread reviews each against this file.

## Where 29a left things (read first)
- `src/gpu/ferroDrop.ts` (class FerroDrop) runs on the lead plate only while the closeup
  is in (`macroOn > 0.4`), with `macroRelief > 0.005` and ferrofluid present.
- `src/gpu/wgsl/ferroDrop.ts` solves h − ∇²h = P + K in l_c units, where
  l_c = SPIKE_PITCH/2π = 0.00637 plate (1.27 mm).
  - P = 2 sin(θ/2), with θ = Relief × 160°.
  - K is the Kelvin pressure with its mean removed.
  - The contact line is held as a penalty off the phase.
  - It uses warm Jacobi, 24 sweeps a frame.
- The height reaches the display in packed vel `.z`. The display is at its 16-texture
  limit, so do not add a texture binding. `.w` = 2 marks a solved frame (`dropSolved`).
- The drawing is in the display's ferrofluid block (`src/gpu/wgsl/plate.ts`, search `drop3d`).
  - `ferroDropSeen` combines Fresnel n 1.52 under water, a softbox, a strip light, a tent and Snell/TIR.
  - `dyeColumnAt` gives the dye tint over the drop, raised to 2(gap−h)/gap.
- Check: `npm run ferrodrop` (10 checks, lab, `PW_WEBGPU=1`). Keep it green and do not loosen it.
- Pictures:
  - `macro-ferro-drop/before-after.png`: the bead today.
  - `macro-ferro-drop/drag-today.png`: today's drag, 4 frames. The lab scene: `lab.create(384)`,
    Ferro Paint's dyes at (0.45,0.52,r0.05), (0.56,0.47,0.045), (0.66,0.53,0.05), `lab.addPhase(0.36,
    0.5, 0.022, 1)`, steps with magnetStrength 0.35–0.5, magnetHeight 0.2, magnetY 0.5,
    phaseSharp 0.75, phaseDisplace 0.3, thinGap 1, magnetX walked 0.36 → 0.66 over 180 steps;
    rendered at zoom 5, macroAmount 1, centred on the drop.
  - The still scene (before-after.png): `lab.create(384)`, three Ferro Paint dyes round
    (0.5,0.5), a drop of radius 0.03 at the middle, 30 steps with the magnet at 0.54, height
    0.24, strength 0.5; rendered at zoom 1, 2.5 and 5.

## Step 1 = PLAN 29c: the drop holds together when dragged (do this before the dye work)
- Measured in `drag-today.png`: a magnet at 0.35–0.5, height 0.2, walked at 0.1 plate/s.
  - The drop turns into a crescent.
  - Then it smears to brown with no cell over half full within about 2 s.
- Physics: a real 6 mm ferrofluid drop under a dragged magnet holds together and heaps
  toward the field. The Kelvin force is about 10⁴× the viscous drag at 2 cm/s.
  - The drop moves as a body.
  - Surface tension (the Cahn–Hilliard phase, `phaseMu`/`phaseCH` in `src/gpu/fluid.ts`)
    keeps it round, apart from the lean toward the magnet.
- Suspects to measure one at a time, each with numbers:
  - the per-step motion cap `MAGNET_CELLS` (fluid.ts:518);
  - the standing film's window;
  - `phaseRelax`/`phaseSharp` thinning a moving interface;
  - `phaseDisplace` pushing dye and phase.
  Fix the cause, not the symptom.
- New check (`scripts/` + package.json + checks.yml, open shard): drag a drop
  0.3 plate in 3 s. Assert all of these:
  - the half-full area stays within 15% of its start;
  - the centroid follows the magnet within 2 drop radii;
  - with no magnet, the drop does not move.
- Camera: if the closeup follows the drop, it eases. Use a critically damped follow with
  no overshoot, and never read `beat`, `bass` or sound. The sway thread's `frameSway`
  (default 0) stays the only way sound moves the frame.

## Step 2 = PLAN 29b: dye rides on the drop, thins, and rolls off the back
- Physics: the water column over the drop is gap − h. It is dragged by the drop's top
  (no slip there) and held by the top glass, so it moves at about half the drop's speed.
  - Dye over the drop rides along and is diluted where the column is thin. Dye mass is
    conserved: concentration × column stays constant.
  - It is shed at the rear stagnation point as the drop leaves it, which makes a trail.
- Today `phaseDisplace` pushes dye out of the ferrofluid as if the drop filled the gap.
  Change only how dye is carried where phase > 0; the dye's own spread (18h) and pour
  slump (18m) passes belong to other threads.
- Code entry points:
  - the `phaseDisplace` kernel in `src/gpu/wgsl/fluid.ts` and its call at fluid.ts:2740;
  - the drop height is only on the display side today. Either solve it on the sim side
    too, or carry a cheap column estimate (the phase's thickness).
- Check: a drop dragged through a yellow pool.
  - Dye is seen over the drop while moving: the drop's tint is not black.
  - Total dye is conserved within 1%.
  - Dye is left behind the drop's path, compared with the same run with the
    no-dye-on-top behaviour.

## Step 3 = PLAN 29d: the wake and the drop's ripples
- Flow around a moving drop in a Hele-Shaw gap is the 2D potential flow around a cylinder.
  The dye parts at the bow, wraps the sides and closes behind in folds. The solver
  already does some of this (see the yellow parting in `drag-today.png`); measure it.
- Ripples: a drop jerked by the magnet rings at its capillary frequency, damped by the
  ferrofluid's viscosity. This needs h to carry momentum: a damped wave equation on h
  (h_tt = −γ h_t + c²∇²(...)) in place of the static Jacobi.
  - Keep the static balance as its rest state, so `npm run ferrodrop` still holds.
  - Name the damping and the frequency in the PR, and measure one ring-down against
    ω² ~ σ k³/ρ for the drop's lowest mode.
- Check: after a step move of the magnet, the drop's top oscillates at least 2 cycles
  and decays. With no move, nothing rings.

## Step 4 = PLAN 29e/29f: the Ferro Drop look and calm controls
- A preset: one drop, three dyes, a slow magnet walk, closeup in, cells and labyrinth
  off, Relief 0.7.
  - It must ship on desk and phone (`src/components/phone/**`).
  - Run `desk`, `setlist`, `panel` and `phone`, and give each new setting a `setting-auditor` pass.
- Controls: bead (Relief / 3D), light direction, drop size. Defaults keep today's look.
- Nothing in the UI reads as AI. No sound-driven frame motion.

## Rules for every PR
- Follow the docs/handoff.md handoff block. Run `npm run lint` and `wgsl` before pushing.
- Put lab pictures in the PR. Name every speed shortcut in the PR and in PLAN §29.
- Read the frame cost on the Mac (`npm run stages`, closeup in), before and after.
- Don't touch the 18e/18f/18h/18j/18m code paths except where a step says to.
