# 20. Lace and holes: a pale film torn open over colour: what shipped

How §20's shipped items were found, built and measured. The open work is in
[`docs/plan/20-lace-and-holes.md`](../plan/20-lace-and-holes.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Second pass (moved 2026-10-04)

### 20b. A clear film that tears (the thin-film equation)

**Shipped (#259), behind Clear Film (`clearFilm`), 0 in every look; judging §34.**
What was built, against the plan below:

- The film is `src/gpu/wgsl/film.ts`: a thickness h and a solvent Γ on a grid of
  their own (`FILM_GRID` 384², at most the solver's), kernels `filmAdvect`,
  `filmMu`, `filmUpdate` and `filmSplat`, with the prototype's numbers in its cells.
  Explicit, in substeps of the film's own time (`FILM_RATE` 0.15 a second, at most
  `FILM_DT` 2.2e-4 each, twelve a frame), in flux form with each donor's fluxes
  scaled down together at the floor, so the film is conserved to rounding and no
  global sum is needed. A numpy copy of the same kernels was run first (scratch,
  not the repo): a 0.35 film with dust tore into 365 holes in 8 s, p10 1.6 to p99
  18.6 cells; a 0.8 film with no dust stayed whole for 20 s; a drop of solvent
  opened a hole from 3.7 to 9.4 cells in 7 s.
- The top glass is a linear pressure past 0.9 at 150 (the prototype's 30 let rims
  pile to 1.1 of the gap; 400 was unstable at the step).
- Dust is procedural (one candidate speck a 16-cell square, by a hash), fixed to the
  glass, a stronger disjoining pressure (1 + 0.3 · speck), which is what a speck
  the water wets does. The plan said "a slightly lower local K"; with this Π a
  lower K is a *stronger* film, so it is higher.
- Carried by the gap's Poiseuille profile: a film of thickness h against one glass
  moves at U (3h − 2h²), so a thin film lags the water and a young hole shears.
- Pours: Alcohol is now a solvent (`solvent: 1` on the bottle) and Soap counts as
  one; both land in Γ. Clear oil (any non-magnetic oil bottle) joins the film
  instead of the mix while a film is on. The plan said alcohol already went into
  the mix's surfactant channel; it never did (only `soap` does), so the film keeps
  its own solvent rather than reading the mix.
- Drawn as the dye's path through the gap less the film (18b-6), from the packed
  view: the film took eight bits of the word BZ's activator had, which keeps eight
  on a square-root scale (it is only asked whether it is there).
- Check: `npm run lace` (CI, open shard), seven cases, below.

The plan as written before it was built:

- **What:** a new liquid, a clear film against the glass. It gets its own thickness
  field h (one R32F texture), moved with the plate's flow in flux form (`mixAdvect`),
  and evolved by the thin-film equation above. The water under it is the gap less h,
  which feeds the lamp's Beer–Lambert (18b) and the optical path (18e).
- **Nucleation, never a timer:**
  - Holes open where the film is thin (the disjoining pressure's spinodal band), and
    where solvent lands. Alcohol and soap already go into the mix's surfactant
    channel, and `marangoniFlux` already moves what rides the surface. The film is one
    more thing it moves.
  - Dust is a fixed, seeded field of weak spots (a slightly lower local K), so a
    thick film left alone stays whole, and a thin one tears where the dish is dirty.
- **Kernels:** `filmMu` (p = −σ∇²h − Π(h) plus the top glass) and `filmUpdate` (∇·(M∇p)
  in flux form, degenerate mobility M = h³ or 20c's). They have the same shape as
  `mixMu` and `mixUpdate`, which are Cahn–Hilliard with a constant mobility.
- **Cost:** unmeasured. The explicit fourth-order update needs a small step. The film
  can run at half the dye's grid, with 6–10 substeps of two light passes, or with a
  few Jacobi sweeps of a stabilised semi-implicit form. The estimate is 0.2–0.4 ms at
  the 768² rung. It is skipped entirely when no film is on the plate, like the oil's
  kernels.
- **Checks:**
  - A new lab check, `lace`: the film's volume conserved over 20 s;
  - a thick film with no dust and no solvent stays whole for 20 s (holes come from the
    physics, not a clock);
  - a solvent drop opens a hole whose radius grows steadily;
  - on a dusty thin film, the hole diameters span at least tenfold (p10 to p99);
  - after the lace forms, the count of separate film pieces rises (the ligaments bead);
  - the same film on today's ground is the control.
  - The `look` skill renders it beside the still.
- **Tools and phone:** the performer's gestures are pouring the film, which is a
  bottle (15a lays it from every tool), and a drop of alcohol, which is a bottle that
  punches a hole where it lands. Both are in the phone's bottle picker and on MIDI,
  like every other bottle.

## Third pass (moved 2026-10-29, 19m)

### 20. Lace and holes: a pale film torn open over colour

- **20c-2. Settings tabs on the phone (shipped in #348's review).** The Settings rail is a strip across the top on a phone, and each tab took its group's whole width and lay under the next group: 13 of the 26 tabs took no tap, Patches among them, so the room's two new patch features (How sudden, How busy lately) could not be reached from a phone. The tabs are full width only in the desk's column now; `npm run phone` taps every tab where it is drawn, and patches each new feature from the phone.
