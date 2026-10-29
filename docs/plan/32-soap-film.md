# 32. The soap film: a draining film seen in reflection (asked 2026-10-18)

*Asked 2026-10-18: the owner shared a photograph of a vertical soap film in reflected
light and asked how to get that effect, and to hand the way to Antigravity. The check
that judges it, `npm run soapfilm`, is written and committed first (this PR); the build
is 32a–32e below.*

**What the photograph shows.** A film hanging in a frame and draining. Newton's series
in horizontal bands (silver, straw, purple, blue, green-gold, orange, magenta, and the
orders after), black lace where the film has thinned past about 30 nm, with dots and
islands of colour inside the black, and the bands combed and curled by the flow that
made them. Measured on the film's crop: black (luma under 0.12) 1.1% of the film, dark
(luma under 0.2) 14.3%, saturated (chroma over 0.25) 15%, silver 10.9%, 9 of the 12 hue
sectors holding more than 4% of the coloured pixels, mean luma by quarter from the top
0.39, 0.515, 0.605, 0.401, edge density 1.2% (gradient over 0.25) and 7.2% (over 0.15).

**What the app has, and the gap.** `filmTable.ts` gives the colour of a film of a given
thickness (Airy's sum, the CIE matching functions, a 5500 K lamp), at normal incidence
only, and the plate reads it as a faint tint: this plate is a projector, the light is the
film's *transmitted* light (pale by construction, `1 − R`) and the table's reflection is
gained and kept under 8%. The photograph is a *reflected* view on a dark ground. Three
things are missing and none of them is a colour trick:

1. A film that has a thickness in nanometres and is moved by gravity. Clear Film (20b)
   tears but has no gravity and no thickness, and 18k's note says the honest version is a
   transported thickness field.
2. A film that thins until it ruptures, from the top, to Newton black.
3. A reflection that depends on the angle you look from, because the path in the film is
   `2 n d cos θ`. The photograph's bands are bands of thickness seen at one angle; look
   from the side and every colour moves.

**The model (what is physics, and what is named).** Vertical drainage of a real film is
marginal regeneration: thin patches rise out of the Plateau border and thick ones sink,
because the film is a nearly inextensible sheet pulled by surface tension, so thickness
can only be exchanged, not stretched. The reference model keeps that and drops the rest:

- The film is a 2D incompressible Darcy flow, `u = (1/ζ)(−∇p + ρ g (h − h̄) ŷ)` with
  `∇·u = 0`. `h` is the thickness (nm), `h̄` its mean, `g` points down the film, and `p`,
  the Lagrange multiplier of the incompressibility, is the film's tension. Thick film
  sinks, thin film rises, and nothing is made or lost (`∇·u = 0`, `h` advected in
  conservation form). A MAC grid, a Gauss-Seidel projection and a limited second-order
  (minmod) advection; first-order upwind is measured below to be too diffusive.
- Evaporation takes a constant `evap` nm/s off every cell (about 5), which thins the top
  first because it is thinnest first. A cell under 30 nm relaxes to 8 nm (Newton's black
  film) over 0.5 s and stays there.
- The reflected colour is `filmReflectance(n0, n1, n2, d, λ, cosI)` summed through the
  matching functions: the table's Airy with the path `4π n d cos θ_t / λ`, `cos θ_t` from
  Snell's law. The first reflectance maximum at 550 nm therefore sits at `d₀ / cos θ_t`.

**Named shortcuts (the owner's rule: name them, give each a plan item).**
(a) *Gravity in the plane of a plate that lies flat.* The Hele-Shaw plate is horizontal; the
film "hangs" because `g` is applied along the picture's y. It is a look of a vertical film,
named so, and 32d keeps it a setting. (b) *ζ is tuned*, not derived: with `ρg = 9810` and
`ζ = 1.5` a 1600 nm patch falls the height of a 64-row film in about 30 s of show time. The
real drainage takes minutes, so this is a time compression (32d: a rate setting, never
tied to the sound). (c) *Evaporation is constant*, standing in for Plateau-border suction
and marginal regeneration at the frame; a rate that grows with the local curvature is the
next step in the physics. (d) *Rupture is a relaxation to 8 nm*, not a nucleation event;
the lace and islands come from the flow's noise, not from a model of bursting. (e) *Explicit
Marangoni plug flow* (the surfactant's own motion) is left out: it is stiff (wave speed
about 7.7 m/s on this grid) and the Darcy flow already carries the exchange. (f) *Angled
reflectance keeps normal-incidence Fresnel amplitudes (no s/p split), and on 2D films
`notchFloor` and `chromaRetention` are a colour grade standing in for the soft box's
angular spread and the camera's gamut, not the physics itself.* At viewing angle `θ_i`
the optical path in the film scales as `2 n d cos θ_t` by Snell's law, while the interface
reflection amplitudes `r_01` and `r_12` remain the normal-incidence values
`(n_a − n_b)/(n_a + n_b)` rather than splitting into s and p polarisations; on a 2D film
(`ny > 1`), the 4-point angular path spread (`spread = 0.025`) and dark ground
(`ground = 0.0004`) alone move saturation at `t = 120` s by two points from 79% to 77%
(dark 22.7%, 9/12 hues), and `notchFloor = 0.0725` and `chromaRetention = 0.67` are a
colour grade fitted to the photograph's 15% saturated (bringing saturation from 77% with
the grade off to 13% at `t = 120` s and 14.8% at `t = 110` s with the grade on, dark 19.4%,
8/12 hues) standing in for integrating over the soft box's solid angle and mapping into the
camera's gamut (32b-1 below).
Literature the model sits in: Chomaz, *J. Fluid Mech.* 2001 (the vertical film's
convection), Gros, Bussonnière and Cantat on marginal regeneration, and Huang and
colleagues 2020.

**The target.** *Shipped so far*: the prototype's numbers 32a was built to (a 32 × 64 film on 800 nm over 120 s) and the saturation gap 32b tuned toward the photograph's 15%. Story in `docs/plan-shipped.md` §32a (moved 2026-10-29, 19m-2).

**The check: `npm run soapfilm`** (`scripts/soapfilm.mjs`, node only, 7 groups C1–C7, 23 lines; its rationale and the three look-alikes it must fail are in the script's header). Open from it: C7 has no upper bound on saturation (`sat > 0.10` only), for a check session to add that bar (32b-1). Story in `docs/plan-shipped.md` §32a (moved 2026-10-29, 19m-2).

## ~~32a. The CPU reference~~ — **Shipped, #403** (`src/lib/soapFilm.ts`, `cosI` on `filmReflectance` in `src/lib/filmTable.ts`, `npm run soapfilm` wired into `checks.yml`'s `logic` part; `npm run soapfilm` 23/23, `npm run filmtable` 8/8, 600 steps on 32×64 in 0.69 s; story in `docs/plan-shipped.md` §32a)

## ~~32b. The reflected view~~ — **Shipped, #469** (`soapFilmRgb` in `src/lib/soapFilm.ts`; the colour grade is 32b-1 below)

**Shipped.** Story in `docs/plan-shipped.md` §32b (moved 2026-10-29, 19m; the heading's numbers moved 2026-10-29, 19m-2).

- **32b-1. Replace the colour grade with the soft box's solid-angle integral and camera gamut mapping.** In 32b, the 4-point path spread (`spread = 0.025`) and dark ground (`ground = 0.0004`) move C7's `t = 120` s saturation by two points (79% → 77%), while the colour grade (`notchFloor = 0.0725`, `chromaRetention = 0.67`) accounts for the rest of the drop from 77% to 13% against the photograph's 15%. Replace that grade with the real phenomenon: integrate the film's Airy reflectance over the soft box's solid angle as a quadrature in `cosI` with s and p Fresnel reflection terms at each angle and the thickness's phase `4π n d cos θ_t / λ` at each angle (which also retires the Fresnel half of shortcut (f)), then map the integrated CIE XYZ tristimulus into the camera's sRGB gamut instead of clamping negative linear channels to zero. *Measure:* the same saturation and hue numbers `npm run soapfilm` C7 prints, with the grade removed (`notchFloor = 0`, `chromaRetention = 1`), showing how much of the 77% → 15% saturation drop the solid-angle integral and camera gamut mapping recover. Also note that check C7 in `scripts/soapfilm.mjs` has no upper bound on saturation (`sat > 0.10` only, so it would pass a film far more saturated than the photograph, such as main's 79% or the ungraded 77%), for a check session to add that bar.

## ~~32c. The GPU solver~~ — **Shipped, #505** (`src/gpu/soapFilm.ts`, `src/gpu/wgsl/soapFilm.ts`; `npm run soapgpu` 29/29 on Metal)

**Shipped.** Story in `docs/plan-shipped.md` §32c (moved 2026-10-29, 19m; the heading's numbers moved 2026-10-29, 19m-2).

- **32c-1. The drain's own "a ruptured cell stays black" never fires.** soapfilm.mjs C6 reads
  it on the drain, where measured, the reference with its rupture marks removed refills no cell
  either (thick film never presses on black there), so that line in `npm run soapfilm` would pass
  a solver with no marks. `soapgpu` asks it on a torn hole instead; soapfilm.mjs should get the
  same hole for the CPU reference (a check session; it moves an input, so `Check changes:`).
- **32c-2. `soapgpu -- --selftest` opens Chromium before checking `selftest`.** `scripts/soapgpu.mjs`
  calls `openLab` and `navigator.gpu.requestAdapter()` unconditionally, and `checks.yml` installs
  Chromium only on `Measure`'s `browser` and `lab` shards (`logic` has no Chromium), so
  `npm run soapgpu -- --selftest` sits in `Measure`'s `lab` shard beside `sloshgpu` until
  `soapgpu.mjs` steps the `--selftest` control in Node without a browser.

## 32d. On the plate

A "Soap Film" look: the film's reflected colour on a dark ground, a time-compression rate
(named shortcut b) and a viewing angle, all settings with MIDI and the desks, default off
so every existing preset looks as it did today (`setting-auditor`). The film hangs under
its own gravity only: the sound may brighten or push it by its fast readings (hits, bands,
onsets) but never move it as a whole (frameSway stays 0), and the preset's sound patch uses
no song shape. *Measure:* `panel`, `desk`, `lampzero`, a `look` render against the
photograph, and a new lab check that the setting at 0 is the plate to the bit.

## 32e. The phone

Every feature ships its phone version in the same PR as the feature: 32d's controls on the
phone and the iPad, the film on the wall through Send to wall. *Measure:* `phone`,
`draftwall`, `layout`.

*Not doing now:* a thickness that follows the dye (the film is its own medium; mixing it
with the pigment's opacity is 18k's old shortcut, and the reason for this section), Marangoni
plug flow (named above), and any recorded footage as a texture.
