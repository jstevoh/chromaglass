/**
 * The ouzo effect: anise oil that comes out of solution as a cloud of micron
 * droplets wherever its alcohol is watered down (PLAN 48s).
 *
 * What it is. Oil of anise (nine tenths trans-anethole) dissolves freely in
 * ethanol and hardly at all in water. A clear mix of the three stays clear
 * for as long as there is alcohol enough to hold the oil; add water and the
 * mix's hold on the oil falls by orders of magnitude, the oil is left far
 * over what can stay dissolved, and it comes out everywhere at once as
 * droplets about a micron across: spontaneous emulsification, with no
 * stirring and no surfactant (Vitale and Katz, Langmuir 19, 4105, 2003).
 * The droplets scatter light as milk's fat does, so the liquid turns opal
 * white exactly where it has mixed, and nowhere else. Add alcohol back and
 * the droplets dissolve and it clears.
 *
 * What the solver carries (src/gpu/fluid/core.ts, `solvent`): the ethanol
 * and the oil a column holds, as shares of the column, moved by the same
 * conserving carry as every poured liquid. Nothing else is needed, because
 * the cloud is not a thing with a life of its own: micron droplets form in
 * milliseconds and dissolve as fast, so each cell sits on the phase diagram
 * where its ethanol and oil put it. `ouzoDrops` below is that rule, and the
 * kernel `ouzoCloud` (src/gpu/wgsl/fluid/ouzo.ts) is the same rule on the
 * GPU: the oil a cell holds over what its water and alcohol can dissolve is
 * droplets, the rest is dissolved, and the two always sum to the oil that
 * was carried there. There is no seed, no noise and no timer in it: the
 * cloud's shape is the mixing's shape, as smooth as the dye's.
 *
 * The solubility curve is the measured one. Table 1 of "Experimental and
 * Theoretical Bulk Phase Diagram and Interfacial Tension of Ouzo"
 * (arXiv:2404.18524, Soft Matter 2024) gives 53 cloud points on the
 * water-rich branch of the water / ethanol / trans-anethole binodal, from
 * no ethanol to 63% by mass. Turned into volumes (water 1.00, ethanol 0.79,
 * anethole 0.99 g/cm³, ideal mixing) each is an ethanol fraction f of the
 * solvent and the oil s that a volume of that solvent holds at saturation,
 * and ln s against f is a shallow parabola:
 *
 *     ln s = −9.38 + 6.23 f + 4.93 f²        (f from 0 to 0.78)
 *
 * with the points scattered about it by a factor of 1.5 (rms 0.38 in ln s,
 * the worst 0.89). So water alone holds 0.008% of the oil by volume, a
 * 40% spirit 0.2%, and 78% alcohol a fifth of its own volume: three and a
 * half orders of magnitude, which is why a little water does so much. A
 * straight line in f, the textbook log-linear cosolvency rule, fits the same
 * points worse (rms 0.44, the worst 1.5) and says water holds less than half
 * what was measured; the curve is kept. Past f = 0.78 the measurements stop, a little
 * short of the plait point where the two phases become one; the parabola
 * carries on upward there, which is the right sense (everything dissolves)
 * and nothing on the shelf is cloudy that far up.
 *
 * How white. Droplets of radius a and volume fraction φ scatter with the
 * reduced coefficient μs′ = 3 φ Q (1 − g) / 4a. For anethole (n 1.561) in
 * watered alcohol (n 1.35) at a diameter of one micron, which is what
 * Sitnikova and others measured as the droplets form (Langmuir 21, 7083,
 * 2005; they ripen to three over sixteen hours), Mie's series gives
 * Q = 2.30 and g = 0.939 at 550 nm: μs′ = 209 φ per millimetre, with 230 in
 * the blue and 191 in the red, so a faintly blue white (PLAN 48n owns the
 * colour). The plate takes it as it takes milk's μs′ (PLAN 18j): the same
 * channel, the same shader, no second kind of white.
 *
 * What is left out, and owed: the droplets' slow ripening (their size is
 * taken as the one micron they form at), and their being too big to diffuse
 * as the dissolved oil does (both move with the flow here, and the grid's
 * cells are far wider than either would spread in a show).
 */

/** ln of the oil a volume of solvent holds at saturation, as a parabola in the solvent's ethanol volume fraction: its three coefficients. */
export const OUZO_BINODAL = [-9.38, 6.23, 4.93] as const;

/** The droplets' reduced scattering, 1/mm for each unit of their volume fraction: one-micron anethole droplets at 550 nm (Mie). */
export const OUZO_SCATTER = 209;

/** The oil a unit volume of solvent holds dissolved, when `f` of that solvent is ethanol and the rest water (both by volume). */
export function ouzoSolubility(f: number): number {
  const x = Math.min(1, Math.max(0, f));
  return Math.exp(OUZO_BINODAL[0] + x * (OUZO_BINODAL[1] + OUZO_BINODAL[2] * x));
}

/**
 * The oil that is out of solution as droplets in a column that holds
 * `ethanol` and `oil` (dissolved and droplets together), each in the units
 * the solver carries: a share of the rest column. `column` is the column's
 * own height in those units (the gap over the rest gap), and what is neither
 * ethanol nor oil in it is water. The rest of the oil, `oil` less this, is
 * dissolved; nothing is made or lost.
 */
export function ouzoDrops(ethanol: number, oil: number, column = 1): number {
  const solvent = Math.max(column - oil, 1e-6);
  return Math.max(0, oil - solvent * ouzoSolubility(ethanol / solvent));
}
