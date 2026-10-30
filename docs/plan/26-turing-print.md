# 26. A reaction that prints: Turing stripes in black and white (proposed 2026-10-05)

The owner sent a VJ pack ("Mask Reaction Diff", made with Karl Sims' RD Tool and
smoothed with an FXAA plugin, 1h): black-and-white labyrinths, fingerprints and combed
stripes that grow out of a shape and are dragged into whorls. Worth a look of our own,
because most of it is already on the plate, and what is missing is real chemistry, not
an effect. What it is, physically: a **Turing pattern**. Two reactants diffusing at
different speeds, one feeding the other, settle into stripes or spots of one fixed
width. It is real in a dish: the CIMA/CDIMA reaction in a gel (Castets, De Kepper, 1990)
grows exactly these labyrinths, and Gray–Scott is the model of a cubic autocatalysis
like it. On a projector a pattern reads black and white when what it makes is an opaque
precipitate in a clear liquid under a white lamp, the way Liesegang's bands already
print (18b's lamp ground, 18l's absorbers).

What the plate had when this was proposed, and what was missing:
- **Gray–Scott** (`src/lib/chemistry.ts`, the `chemistry` setting; Sensual Laboratory
  0.85, Neon Coral Reef 0.7) runs on the CPU at the solver's grid with feed and kill fixed
  at 0.042 / 0.062 (`LiquidVisualizer.tsx`, `chem.step`), so it only ever grows coral.
  It deposits dye that the flow carries, but the reactants sit still under the stir
  (18k), so it can never be combed into the whorls in the owner's pictures.
- **BZ** (Oregonator, 256² GPU grid) and **Liesegang** (128², 1b) are real reactions on
  their own grids; neither makes stripes of a fixed width.
- **The ferrofluid maze** (9aa) is a labyrinth too, but a magnetic one (dipoles
  repelling within a surface), and stays the magnet's.

Steps:
- **26a. Gray–Scott on the GPU, carried by the flow (shipped, #327; carried once since
  26d).** Story in `docs/plan-shipped.md` §26.
- **26b. The pattern as a control (shipped, #327; Width in plate units and the phone
  version with 26d).** Story in `docs/plan-shipped.md` §26.
- **26c. Where it grows: the poured liquid is the reagent (shipped in part, #327, #331).**
  A pour of Turing Reagent feeds and seeds the reaction where it lands on any look, with
  its own pattern baked in (`npm run turing`: 70% of a pour grows, specks with no reagent
  nothing).
  - **26c-1, open.** A shape, a word or the camera laying the reagent, as images already
    pour (`injectImage`): the owner's "grow mask".
- **26d. The look: "Turing Print" (shipped).** Story in `docs/plan-shipped.md` §26;
  the owner's eyes owed (`docs/judging.md` §46).
  - **26d-1, open: the print's cost at 512².** The reaction takes as many substeps as its
    diffusion needs (two at 512² and the default width, up to six at Width's top), and
    the target was under 0.3 ms at 512². Only the Mac can say (`npm run stages`).
  - **26d-2, open: a harder edge than the chemistry gives?** The print's edge is the
    starch–iodine binding's own (a Hill curve, n = 6), about a fifth of a stripe wide:
    soft at a close zoom. The owner's pack is a Karl Sims render through FXAA, harder
    than a dish. If the owner wants that, it is a choice to make, not physics; the plate
    could threshold the reconstructed field at screen resolution, as Ben-Day's edge does.
  - ~~**26d-3. Other colour in a fed print**~~ (**shipped**; story in
    `docs/plan-shipped.md` §26): a poured colour shows under the print, and the print
    has its own ink (`turingInk`, desk, phone, remote, MIDI).
  - **26d-3a, open: the ink is a bright hue, not a depth.** The plate reads the print's
    rgb as a colour at a fixed density, so starch's own indigo prints black and any hue
    must be drawn at full strength to print as itself. A hue that printed lighter, as
    Chemistry's tints do, would need the plate to read the print as absorbance, which
    means a binding in the plate shader (it is at the 16-binding limit).
  - **26d-3b, open: the print over a pour is multiplied, not mixed.** Under the print,
    a pour of red and a green ink print dark where both are, because the plate
    multiplies. Right for dye on a lamp; the owner may want the print to win (judging §46).
  - **26d-4, open: the dish starts empty of substrate.** The field is cleared to u = 0, so
    on a look with the bath the first seeds die before the bath fills the plate (a third
    of a second); a cleared dish under a bath should start at u = 1. And the reaction's
    rim row writes (1, 0, 0, 0), which wipes poured reagent at the edge.
  - **26d-5, open: half floats where the GPU cannot filter full ones.** The reaction's
    field is in full floats where the dye is (the first Metal run found the stripe 14%
    wider at 512² than at 256²: half floats round the substrate's last refill away, and
    the Mac rounds them toward zero; the story in `docs/plan-shipped.md` §26). A GPU
    without `float32-filterable` (many Android phones) keeps half floats, so its
    substrate stops 0.3–0.5% short and its stripe is a little wider. Storing the substrate's
    deficit 1 − u instead of u would give half floats their fine steps where u is near
    1, on every GPU and at half the bandwidth, and would make a cleared dish full (26d-4).
  - ~~**26d-6. The print keeps evolving**~~ (**shipped**; story in `docs/plan-shipped.md`
    §26): `turingDrift` slides the feed and kill along the saddle-node curve across the plate
    on a 40–90 s clock (desk, phone, remote, MIDI; the Turing Print preset sets 0.7).
    Shortcuts named: three plane waves, not a noise field; the saddle-node line, not
    Pearson's full regime boundaries; a fixed-rate clock that follows no music.
  - **26d-6a. More ways for the print to evolve** (grey patch and regime glide **shipped**;
    story in `docs/plan-shipped.md` §26): the drift's k is now the saddle-node curve plus a
    margin that glides each region between stripes and spots on slower waves (50, 80 and
    120 s), which also removed the grey patch at Drift 1. Still open, each its own step:
    - **The Drift slews, it does not step**: the visualizer hands the solver the setting
      moved at 0.025 a second (`TURING_DRIFT_PER_SECOND`), because 0.7 handed to a settled
      print at once starved a tile for about 20 s. A faster slew needs that number
      re-measured with `npm run turing`, which reads the rate from the source.
    - **A true noise field** for both maps (patches, not diagonal bands).
    - **Light as the kill** (CIMA is photosensitive; the lamp's level would move k).
    - **A slow ink-hue glide** (26d-3).
    - **Periodic reseeds**.
    - **Metal's numbers** for the regime glide: the cap line (`0.0105 - 0.15 F`) was fitted on
      SwiftShader, and Metal rounds half floats toward zero; read `npm run turing` line 9
      off the `fifth` shard, and ask the watcher for a look if the pieces count differs.
    - **The cap line is a straight line, and it is too generous at the corners**: the
      review held each corner of the drift range for 9000 units (stripes settled at F 0.04,
      k 0.06, 60 seeds, k = curve(F) + share x cap(F), alive share = cells with v over 0.1).
      F 0.02 collapses to 6–7 % alive at share 0.25 and 0.9 (flat); F 0.05 at share 0.9
      starts at 0.079 and recovers to 0.228; F 0.06 at share 0.25 recovers 0.089 to 0.392;
      F 0.06 at share 0.9 stays at 0.061, flat. At F 0.06 and share 0.9 the margin is 0.00135
      against about 0.001 measured as the limit, and below F 0.03 the cap is extrapolated
      from no measured point. A corner that collapses leaves a frozen sparse residue that does
      not regrow while held. The plate reaches those corners only where both waves saturate at
      once (|w|, |wr| over 2) at Drift 1, a small share of the plate for a few seconds at a time.
      Two steps: fit the cap through measured points (or Pearson's boundaries) including F
      below 0.03; and give `npm run turing` a held-corner line, F 0.06 at share 0.9 and
      F 0.02 for 9000 units, that has to stay over the alive band's floor. Measure the corners
      on Metal too.
    - **Grey smears in the app that the lab's grey-patch line cannot see**: on Metal
      (Apple M4, head dfec25f) `npm run turing` passes all 31 lines twice and the lab plate
      reads tile contrast 0.93 of the control at Drift 0.7 and 0.78 at Drift 1. But in the
      app (Turing Print preset, 60 s settle, frames at 0, 30, 60 and 90 s) the watcher saw
      soft blue-grey smears where the stripes lose contrast, 10–20 % of the plate in places,
      drifting about (upper-middle at Drift 1 at 60 s; centre-right at Drift 0.7 at 60 and
      90 s). The glide itself is clearly visible within a minute. Not known yet whether the
      smears are the look's poured dye showing under the print or the reaction going flat.
      The gap in the check: the line runs on the lab's plain plate (activator only), never
      on the app's poured look. Next step: in the app, read the chemistry field itself off the
      GPU at those frames and the same cells' contrast, to say which; then make the check
      read the app's plate, or the field in the app, so it can see this. Start here.
    - **The Pattern knob does not steer the drifting regime**: while the drift is on k is
      the curve plus the margin and ignores the look's own k, so only its feed counts. A
      look that wants more spots than stripes needs a "spots share" input, not a k.
    - Whether the preset's 0.7 is the right pace, and whether the stripe-to-spot glide
      reads as chemistry or as the plate falling apart, is judging §55.
- **26-colour-a. The relief #327 described: not doing.** #327's message described the
  pattern's gradient as a bump on the plate's normal; the code never reached main (its
  plate shader was not in the diff, and the revert 8278374 had nothing of it to take
  out). A CIMA print is flat: the complex sits in the gel and does not raise it, so
  Turing Print draws no relief (Edge Relief 0 in the look).
- **26-colour-b. The coral as soft blurred rings (fixed with 26d).** Story in `docs/plan-shipped.md` §26-colour-b (moved 2026-10-29, 19m-2).