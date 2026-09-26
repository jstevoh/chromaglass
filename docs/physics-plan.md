# The liquids' own physics and chemistry

Asked for: "Do all of the physics and chemistry enhancements suggested." This
records what each one is, the model behind it, how it is discretised, where it
lives, and what the lab measured. Every effect is a setting that defaults to
off, so a look that does not ask for one is the look it always was.

The measurements come from `scripts/lab.mjs`: the GPU solver on its own in a
page with no canvas, driven step by step. It runs on a Linux box's software
WebGPU (a presented canvas needs a GPU that presents; computing does not), so
each change was measured where it was made. `npm run physics` keeps the
important ones as checks, each against the same plate with the effect off, in
the macOS WebGPU job. `npm run wgsl` compiles every shader first.

## The projection: multigrid

Twelve red-black sweeps from a cold start smooth the pressure's error a few
cells across and leave anything larger nearly untouched, so the flow was only
ever incompressible at the finest scales. A strong local force showed it: the
magnet made twenty times the dye the plate was given in two seconds.

Now two V-cycles (two sweeps each way per level, sixteen at the coarsest),
level 0 the packed red-black buffer, coarser levels row-major. The operator is
4p − Σ neighbours = b with b in h² units, so a coarse right-hand side is the
sum of the four fine residuals under it. Measured: divergence per unit speed
0.0007 against 0.0084 for the sweeps, on the same violent forcing, for about
the same arithmetic. It changes every look a little: liquid closes around
itself more like water and spreads less.

## Surface tension between oil and water (`oilTension`)

A phase field c (0 water, 1 oil) in the mix texture. Cahn–Hilliard:
μ = f′(c) − κ∇²c with f = c²(1 − c)², ∂c/∂t = M∇²μ, in four explicit
substeps a step (M dt under the 1/64 limit). The capillary force is the
Korteweg term in its potential form, −σ c ∇μ, applied before the projection.

What went wrong on the way, and why the code is as it is:

- μ∇c, the spike form, is nearly a pure gradient and left compression the
  collocated projection could not remove: the oil piled past full and was
  lost at the guard clamp. −c∇μ is smooth.
- Clamping c to 0..1 made or destroyed oil every step (±30%). Cahn–Hilliard
  overshoots a little and brings itself back; `mixRelax` spreads anything
  outside 0..1 to its neighbours, conservatively.

Measured: a strip of oil 7:1 rounds to 3.5:1 in three seconds, and the oil is
exact (438.8 → 438.8).

Oil reaches the field from any liquid whose polarity is below −0.5 (Oil,
Silicone), through `LiquidPhase.onDeposit`, only while the setting is on.

## Marangoni flow (`surfactantFlow`, shown as Soap Bursts)

Soap lowers the surface tension, and a surface streams toward higher tension:
u = −k∇Γ. Added to the velocity it failed both ways: before the projection it
is a pure gradient and was deleted whole; after it, the dye's backtrace, which
has no −c∇·u term, doubled the dye. So what rides the surface (the dye, the
soap, the oil) is moved along that flow directly, in flux form: the surface
thins where it spreads and piles up at the front, and nothing is made or lost.

Measured: the dye within a tenth of a soap drop falls from 1111 to 471, and
the plate's total is exact (7094 → 7094). With the dial up, a drop of soap
lands on the beat (or every couple of seconds), so it works on any look.

## Buoyancy (`solutalBuoyancy`, `plateUpright` as Gravity, `doubleDiffusion`)

Dye makes the liquid heavier and heat lighter: g (βₛ(ρ − ρ̄) − β_T T), with g
in the plate as far as it stands up. Flat on a projector gravity is straight
through the glass and this is zero. Dye weighs 0.5 by default once the plate
stands up, so Gravity works on any look. `doubleDiffusion` raises heat's
diffusivity alone (water's Lewis number is about 100), the condition for salt
fingers. Measured: on an upright plate a blob of dye's centre of mass falls
from 0.699 to 0.621 in two seconds, and does not move without its weight.

## Vorticity confinement (`vorticityConfinement`, shown as Swirl)

Fedkiw, Stam & Jensen (2001): a force along ∇|ω| × ω spins up what is left of
each eddy. Not physics a thin film has (it is heavily damped), so it is a
dial. It measures the spin of the flow the plate actually moved by
(`velForced`); the velocity carried between steps is capped small. Measured:
|curl| 5 → 59.

## The ferrofluid's labyrinth (`ferroLabyrinth`)

What it should look like (Dickstein et al., *Science* 261, 1993; Jackson's
Hele-Shaw images in Kent-Dobias & Bernoff, PRE 91, 2015): a drop of black
ferrofluid between glass plates, in a field perpendicular to them, fingers
out into a dense maze of roughly constant width, half ferrofluid and half
carrier, with dead ends, Y-junctions and few loops. The width is set by the
gap and the field (stronger is finer), not by the drop; it forms in a second
or a few, and relaxes into rounded drops when the field goes.

A thin layer in that field is a sheet of parallel dipoles, which repel; the
repulsion is a negative line tension that surface tension holds at one
wavelength. The model is Cahn–Hilliard with the repulsion in the chemical
potential, μ = f′(c) − ∇²c + χαψ with (−∇² + m²)ψ = c relaxed by Jacobi
sweeps (Ohta–Kawasaki), and — the piece that makes it a Hele-Shaw maze
rather than a slow diffusion — the flow driven by it, −c∇μ before the
projection. For Ohta–Kawasaki the fastest wavenumber is k*² = √α − m², so
the constants come from the period wanted (0.045 of the plate, never under
twelve cells): m = 0.4k*, α = (k*² + m²)².

Three things turned a target pattern into a maze:

- **The field has a uniform part.** χ is 0.45 everywhere (a coil under the
  plate) and the magnet's saturation adds the rest, with a slow noise, since
  a labyrinth's disorder comes from noise. With χ only over the magnet, its
  radial gradient ordered the stripes into rings round it. The magnet's pull
  also yields (to a quarter) under a full field.
- **The flow, not diffusion, carries it.** With Cahn–Hilliard alone eight
  seconds left the drops as blobs.
- **The flux is divergence-free on its own stencil (Rhie–Chow).** The
  projection subtracts the wide gradient but solves the compact Laplacian,
  which leaves (L_compact − L_wide)p, all at the finest scale. The maze's
  sharp force made a sharp pressure, and the flux step drew lines every
  other cell through the black: its grid-scale part 0.045. Each face now
  swaps the two cells' wide gradients for its compact one: 0.003. The oil
  uses the same face velocity.

In performance the field breathes with the music (0.55 of the setting, plus
loudness, plus a kick envelope over a second), so the maze sharpens on the
hits and fattens between them. `npm run physics` checks the field alone
doubles the edge of eighteen drops (2866 against 1352), conserves them, and
leaves the black solid.

**Maze Detail** (`mazeDetail`) makes the maze finer, as a thinner gap
between the plates does. Steve's references (Chemical Bouillon's ferrofluid
films) run fingers about a sixtieth of the frame wide, and the maze above
drew them two to three times wider. Detail divides the period by up to three
(MAZE_FINEST): at 1 it is 0.015 of the plate. The twelve-cell floor still
holds, so on a 512² grid (the hosted site's largest) Detail stops doing
anything past about 0.6 (0.023), on 768² past 0.96, and only 1024² reaches
the full range. At 0 it is the maze as it was.
Measured in the lab (512², the eighteen drops, finger width as 2·area/edge
at half full):

| Detail | width at 240 steps | at 480 | plate past half full at 480 |
|---|---|---|---|
| 0 | 0.059 | 0.043 | 18.3% |
| 0.35 | 0.038 | 0.022 | 17.8% |
| 0.6 | 0.025 | 0.014 | 16.4% |

At 0.6, where the period is right at the floor, some fingers that are
still pinching apart sit under half full and draw as brown film.
`npm run maze` checks that Detail 0.5 grows fingers in four seconds finer
than Detail 0 gets in eight, keeps all the ferrofluid with no grid printed
through it, and that on a grid too coarse for it (256²) Detail changes
nothing. The maze is still coarsening towards its period at eight seconds,
so where it ends up is not asserted.

The same work fixed the magnet on its own. The sharpening pass that stood in
for Cahn–Hilliard without a maze clamped to its neighbourhood, and lost an
eighth of the ferrofluid at ten frames a second; its pairwise replacement
set drops into blocky squares; Cahn–Hilliard now keeps the phases apart in
every case (Phase Edge is its mobility). And the magnet's force is φ∇ψ, on
the smooth field, rather than −ψ∇φ, which turned every ripple in a pool over
the magnet into a grid of holes.

## Chemistry

- **pH indicator** (`phIndicator`): acidity in the mix (+ acid, − base, they
  cancel), poured with the new Acid and Base bottles. The dye takes red
  cabbage's colours: pink in acid, purple near neutral, green in base.
- **Belousov–Zhabotinsky** (`bzReaction`): the two-variable Oregonator (Tyson
  & Fife), ε 0.05, q 0.002, f 1.4, on its own 256² grid (a gel does not
  flow, and a pattern counted in cells would be a different size at every
  resolution). Seeded as broken waves, whose free ends curl into spirals.
  Measured: a front travels from 0.23 to 0.43 of the plate in two thirds of a
  second.
- **Liesegang rings** (`liesegang`): Keller–Rubinow with Ostwald's
  supersaturation on a 128² grid: A (poured, far stronger) and B (spread
  evenly) react to C, which nucleates precipitate above a high threshold and
  grows only on precipitate already there. Growth onto a neighbour made one
  solid disc; growth in place starves the gap ahead and the next band forms
  further out. Measured: seven bands, spacing widening outward (the
  Jablczynski law).

## Optics

The display pass reads sixteen textures, WebGPU's default limit for a stage,
so everything above reaches it through the one binding the ferrofluid had:
`packView` writes eight values a cell as four pairs of 16-bit fixed point.

- **Layer depth** (`thicknessOptics`): Beer–Lambert's path is the gap between
  the glasses, so a press pales the dye under the palm.
- **Spectral mix** (`spectralOptics`): absorbance spread over six bands
  (420–670 nm), attenuated band by band, summed back by three responses that
  each sum to one (so white stays white).
- **Oil meniscus**: a dark line where oil meets water, and a faint lens.

## What is not here

- **Viscous fingering (Saffman–Taylor).** Built as a variable-mobility
  multigrid (∇·(k∇p) = ∇·u*, harmonic face means), and it converged, but the
  lab could not show it doing anything: the plate is a closed box whose press
  is balanced by a uniform sink, so the same flux has to reach the oil
  whatever its mobility. Fingering needs liquid injected at one place and
  leaving at another, which this plate does not yet model. It was taken out
  rather than shipped as a dial that does nothing.
- **FLIP/APIC and lattice Boltzmann** would replace the solver rather than
  extend it, and the pieces above get most of what they would buy.
